import { Pool } from 'pg';
import { logger } from '@/utils/logger';
import { 
  QueryDefinition, 
  QueryResult, 
  QueryExecutionContext, 
  QueryMetrics,
  DataSource,
  QueryValidationResult 
} from './types';
import { QueryValidator } from './QueryValidator';
import { ParameterProcessor } from './ParameterProcessor';
import { ResultTransformer } from './ResultTransformer';
import { QueryCache } from './QueryCache';
import { createError } from '@/middleware/error.middleware';

/**
 * Core Query Service
 * 
 * Handles all database query execution with type safety,
 * parameter validation, caching, and result transformation
 */
export class QueryService {
  private static instance: QueryService;
  
  private validator: QueryValidator;
  private parameterProcessor: ParameterProcessor;
  private resultTransformer: ResultTransformer;
  private cache: QueryCache;
  private credentialManager: any; // Credential context manager
  
  private constructor(
    private pool: Pool,
    private redisClient?: any // Redis client for caching
  ) {
    this.validator = new QueryValidator();
    this.parameterProcessor = new ParameterProcessor();
    this.resultTransformer = new ResultTransformer();
    this.cache = new QueryCache(redisClient);
    
    logger.info('QueryService initialized');
  }

  /**
   * Set credential manager for user-specific credential handling
   */
  setCredentialManager(credentialManager: any): void {
    this.credentialManager = credentialManager;
    logger.info('Credential manager injected into QueryService');
  }
  
  public static getInstance(pool?: Pool, redisClient?: any): QueryService {
    if (!QueryService.instance) {
      if (!pool) {
        throw new Error('Pool is required for QueryService initialization');
      }
      QueryService.instance = new QueryService(pool, redisClient);
    }
    return QueryService.instance;
  }
  
  /**
   * Execute a pre-defined query by ID
   */
  async executeQuery<T>(
    queryDef: QueryDefinition<T>, 
    context: QueryExecutionContext
  ): Promise<QueryResult<T>> {
    const startTime = Date.now();
    const { userId, parameters, options = {} } = context;
    
    try {
      // 1. Validate query definition and parameters
      const validation = await this.validator.validateQuery(queryDef, parameters);
      if (!validation.valid) {
        throw createError(`Query validation failed: ${validation.errors.join(', ')}`, 400);
      }
      
      // 2. Check cache first (if enabled and not skipped)
      if (queryDef.cache?.enabled && !options.skipCache) {
        const cached = await this.cache.get<T>(queryDef, parameters);
        if (cached) {
          logger.debug(`Cache hit for query ${queryDef.id}`);
          return {
            success: true,
            data: cached.data,
            metadata: {
              ...cached.metadata,
              cached: true,
              executionTime: Date.now() - startTime
            }
          };
        }
      }
      
      // 3. Process parameters
      const processedParams = await this.parameterProcessor.processParameters(
        queryDef.parameters, 
        parameters
      );
      
      // 4. Execute query based on data source
      let result: QueryResult<T>;
      
      switch (queryDef.dataSource) {
        case 'postgres':
          result = await this.executePostgresQuery(queryDef, processedParams, options);
          break;
        case 'ad':
          result = await this.executeADQuery(queryDef, processedParams, options);
          break;
        case 'azure':
          result = await this.executeAzureQuery(queryDef, processedParams, options);
          break;
        case 'o365':
          result = await this.executeO365Query(queryDef, processedParams, options);
          break;
        default:
          throw createError(`Unsupported data source: ${queryDef.dataSource}`, 400);
      }
      
      // 5. Transform results
      if (queryDef.resultMapping) {
        if ((result as any)?.data) {
          (result as any).data = await this.resultTransformer.transformResults(
          ((result as any)?.data), 
          queryDef.resultMapping
        );
        }
      }
      
      // 6. Cache results (if enabled)
      if (queryDef.cache?.enabled && result.success) {
        await this.cache.set(queryDef, parameters, result);
      }
      
      // 7. Record metrics
      await this.recordMetrics({
        queryId: queryDef.id,
        executionTime: Date.now() - startTime,
        rowCount: ((result as any)?.data).length,
        cached: false,
        userId,
        timestamp: new Date(),
        parameters
      });
      
      return result;
      
    } catch (error) {
      const executionTime = Date.now() - startTime;
      logger.error(`Query execution failed for ${queryDef.id}:`, error);
      
      // Record failed execution metrics
      await this.recordMetrics({
        queryId: queryDef.id,
        executionTime,
        rowCount: 0,
        cached: false,
        userId,
        timestamp: new Date(),
        parameters
      });
      
      return {
        success: false,
        data: [],
        metadata: {
          executionTime,
          rowCount: 0,
          queryId: queryDef.id,
          dataSource: queryDef.dataSource
        },
        error: (error as Error).message
      };
    }
  }
  
  /**
   * Execute PostgreSQL query
   */
  private async executePostgresQuery<T>(
    queryDef: QueryDefinition<T>,
    parameters: any[],
    options: any
  ): Promise<QueryResult<T>> {
    const client = await this.pool.connect();
    
    try {
      // Apply timeout if specified
      if (options.timeout || queryDef.constraints?.timeoutMs) {
        const timeoutMs = options.timeout || queryDef.constraints!.timeoutMs!;
        await client.query(`SET statement_timeout = ${timeoutMs}`);
      }
      
      logger.debug(`Executing PostgreSQL query: ${queryDef.id}`, {
        sql: queryDef.sql,
        parameters: parameters
      });
      
      const result = await client.query(queryDef.sql, parameters);
      
      // Apply result limit if specified
      let data = result.rows;
      const maxResults = options.maxResults || queryDef.constraints?.maxResults;
      if (maxResults && data.length > maxResults) {
        logger.warn(`Query ${queryDef.id} returned ${data.length} rows, limiting to ${maxResults}`);
        data = data.slice(0, maxResults);
      }
      
      return {
        success: true,
        data: data as T[],
        metadata: {
          executionTime: 0, // Will be set by caller
          rowCount: data.length,
          queryId: queryDef.id,
          dataSource: 'postgres'
        }
      };
      
    } finally {
      client.release();
    }
  }
  
  /**
   * Execute Active Directory query
   */
  private async executeADQuery<T>(
    queryDef: QueryDefinition<T>,
    parameters: any[],
    options: any
  ): Promise<QueryResult<T>> {
    try {
      // Import service factory to get AD service
      const { serviceFactory } = await import('@/services/service.factory');
      
      // Check if we need to use specific credentials
      let adService;
      if (options?.credentialId && this.credentialManager) {
        // Use credential-specific service instance
        const __credentials = await this.credentialManager.getCredentials('ad', {
          user: { id: options.userId },
          credentialId: options.credentialId
        });
        void __credentials; // Reserved for future credential passing to service
        adService = await serviceFactory.getADService();
        // Service will use credentials from context
      } else {
        // Use default service instance
        adService = await serviceFactory.getADService();
      }
      
      // Convert parameters array to object with proper names
      const parameterObject: Record<string, any> = {};
      queryDef.parameters.forEach((paramDef, index) => {
        if (parameters[index] !== undefined) {
          parameterObject[paramDef.name] = parameters[index];
        }
      });
      
      // Check if this is an LDAP query stored in JSON format
      let ldapConfig;
      try {
        ldapConfig = JSON.parse(queryDef.sql);
        if (ldapConfig.type !== 'ldap') {
          throw new Error('Not an LDAP query');
        }
      } catch {
        // Fallback to direct LDAP execution for non-LDAP query definitions
        throw new Error(`Invalid LDAP query configuration for query ${queryDef.id}. Expected JSON with type: 'ldap'`);
      }
      
      // For JSON LDAP config, build AD query
      const adQuery = {
        type: queryDef.id,
        filter: ldapConfig.filter,
        attributes: ldapConfig.attributes,
        baseDN: ldapConfig.base,
        scope: ldapConfig.scope,
        options: {
          limit: ldapConfig.sizeLimit,
          useCache: options.skipCache !== true
        }
      };
      
      // Replace parameter placeholders in both filter and baseDN (if provided)
      Object.entries(parameterObject).forEach(([key, value]) => {
        // Replace in filter
        if (typeof adQuery.filter === 'string') {
          adQuery.filter = adQuery.filter.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
        }

        // Replace in baseDN
        if (typeof adQuery.baseDN === 'string') {
          adQuery.baseDN = adQuery.baseDN.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
        }
      });
      
      // Replace system variables like {{baseDN}} with actual values
      if (typeof adQuery.baseDN === 'string' && adQuery.baseDN.includes('{{baseDN}}')) {
        const systemBaseDN = process.env.AD_BASE_DN || 'DC=domain,DC=local';
        adQuery.baseDN = adQuery.baseDN.replace(/{{baseDN}}/g, systemBaseDN);
        logger.debug(`Replaced {{baseDN}} with ${systemBaseDN} in query ${queryDef.id}`);
      }
      
      // Also replace {{baseDN}} in filter if present
      if (typeof adQuery.filter === 'string' && adQuery.filter.includes('{{baseDN}}')) {
        const systemBaseDN = process.env.AD_BASE_DN || 'DC=domain,DC=local';
        adQuery.filter = adQuery.filter.replace(/{{baseDN}}/g, systemBaseDN);
      }
      
      const result = await adService.executeQuery(adQuery);
      
      return {
        success: true,
        data: ((result as any)?.data) as T[],
        metadata: {
          executionTime: result.executionTime,
          rowCount: result.count,
          queryId: queryDef.id,
          dataSource: 'ad',
          cached: result.cached
        }
      };
      
    } catch (error) {
      logger.error('Failed to execute AD query:', error);
      return {
        success: false,
        data: [] as T[],
        metadata: {
          executionTime: 0,
          rowCount: 0,
          queryId: queryDef.id,
          dataSource: 'ad'
        },
        error: (error as Error).message
      };
    }
  }
  
  
  /**
   * Execute Azure AD query
   */
  private async executeAzureQuery<T>(
    queryDef: QueryDefinition<T>,
    parameters: any[],
    options: any
  ): Promise<QueryResult<T>> {
    try {
      // Import service factory to get Azure service
      const { serviceFactory } = await import('@/services/service.factory');
      
      // Check if we need to use specific credentials
      let azureService;
      if (options?.credentialId && this.credentialManager) {
        // Use credential-specific service instance
        const __credentials = await this.credentialManager.getCredentials('azure', {
          user: { id: options.userId },
          credentialId: options.credentialId
        });
        void __credentials; // Reserved for future credential passing to service
        azureService = await serviceFactory.getAzureService();
        // Service will use credentials from context
      } else {
        // Use default service instance
        azureService = await serviceFactory.getAzureService();
      }
      
      // Convert parameters array to object with proper names
      const parameterObject: Record<string, any> = {};
      queryDef.parameters.forEach((paramDef, index) => {
        if (parameters[index] !== undefined) {
          parameterObject[paramDef.name] = parameters[index];
        }
      });
      
      // Check if this is a Graph API query stored in JSON format
      let graphConfig;
      try {
        graphConfig = JSON.parse(queryDef.sql);
        if (graphConfig.type !== 'graph') {
          throw new Error('Not a Graph API query');
        }
      } catch {
        // Use custom query execution for non-JSON queries
        // Azure query should be defined in JSON format
        throw new Error(`Invalid Azure query configuration for query ${queryDef.id}. Expected JSON with type: 'azure'`);
      }
      
      // For JSON Graph config, build Azure query
      const azureQuery = {
        type: queryDef.id,
        endpoint: graphConfig.endpoint || '/users',
        graphOptions: {
          select: graphConfig.select,
          filter: graphConfig.filter,
          top: graphConfig.top || (options.maxResults || queryDef.constraints?.maxResults),
          orderby: graphConfig.orderby,
          expand: graphConfig.expand
        },
        options: {
          useCache: options.skipCache !== true
        }
      };
      
      // Replace parameter placeholders in the filter
      if (azureQuery.graphOptions.filter) {
        Object.entries(parameterObject).forEach(([key, value]) => {
          azureQuery.graphOptions.filter = azureQuery.graphOptions.filter.replace(
            new RegExp(`{{${key}}}`, 'g'), 
            String(value)
          );
        });
      }
      
      const result = await azureService.executeQuery(azureQuery);
      
      return {
        success: true,
        data: ((result as any)?.data) as T[],
        metadata: {
          executionTime: result.executionTime,
          rowCount: result.count,
          queryId: queryDef.id,
          dataSource: 'azure',
          cached: result.cached
        }
      };
      
    } catch (error) {
      logger.error('Failed to execute Azure query:', error);
      return {
        success: false,
        data: [] as T[],
        metadata: {
          executionTime: 0,
          rowCount: 0,
          queryId: queryDef.id,
          dataSource: 'azure'
        },
        error: (error as Error).message
      };
    }
  }
  
  /**
   * Execute Office 365 query
   */
  private async executeO365Query<T>(
    queryDef: QueryDefinition<T>,
    parameters: any[],
    options: any
  ): Promise<QueryResult<T>> {
    try {
      // Import service factory to get O365 service
      const { serviceFactory } = await import('@/services/service.factory');
      
      // Check if we need to use specific credentials
      let o365Service;
      if (options?.credentialId && this.credentialManager) {
        // Use credential-specific service instance
        const __credentials = await this.credentialManager.getCredentials('o365', {
          user: { id: options.userId },
          credentialId: options.credentialId
        });
        void __credentials; // Reserved for future credential passing to service
        o365Service = await serviceFactory.getO365Service();
        // Service will use credentials from context
      } else {
        // Use default service instance
        o365Service = await serviceFactory.getO365Service();
      }
      
      // Convert parameters array to object with proper names
      const parameterObject: Record<string, any> = {};
      queryDef.parameters.forEach((paramDef, index) => {
        if (parameters[index] !== undefined) {
          parameterObject[paramDef.name] = parameters[index];
        }
      });
      
      // Check if this is a report query stored in JSON format
      let reportConfig;
      try {
        reportConfig = JSON.parse(queryDef.sql);
        if (reportConfig.type !== 'o365report') {
          throw new Error('Not an O365 report query');
        }
      } catch {
        // O365 query should be defined in JSON format
        throw new Error(`Invalid O365 query configuration for query ${queryDef.id}. Expected JSON with type: 'o365'`);
      }
      
      // For JSON report config, build O365 query
      const o365Query = {
        type: queryDef.id,
        endpoint: reportConfig.endpoint,
        period: parameterObject.period || reportConfig.period || 'D7',
        format: reportConfig.format || 'csv',
        graphOptions: reportConfig.graphOptions,
        options: {
          useCache: options.skipCache !== true,
          limit: options.maxResults || queryDef.constraints?.maxResults
        }
      };
      
      // Replace parameter placeholders in the endpoint
      if (o365Query.endpoint) {
        Object.entries(parameterObject).forEach(([key, value]) => {
          o365Query.endpoint = o365Query.endpoint.replace(
            new RegExp(`{{${key}}}`, 'g'), 
            String(value)
          );
        });
      }
      
      const result = await o365Service.executeQuery(o365Query);
      
      return {
        success: true,
        data: ((result as any)?.data) as T[],
        metadata: {
          executionTime: result.executionTime,
          rowCount: result.count,
          queryId: queryDef.id,
          dataSource: 'o365',
          cached: result.cached
        }
      };
      
    } catch (error) {
      logger.error('Failed to execute O365 query:', error);
      return {
        success: false,
        data: [] as T[],
        metadata: {
          executionTime: 0,
          rowCount: 0,
          queryId: queryDef.id,
          dataSource: 'o365'
        },
        error: (error as Error).message
      };
    }
  }
  
  /**
   * Validate a query definition without executing it
   */
  async validateQuery(queryDef: QueryDefinition, parameters: Record<string, any>): Promise<QueryValidationResult> {
    return await this.validator.validateQuery(queryDef, parameters);
  }
  
  /**
   * Test database connectivity
   */
  async testConnection(dataSource: DataSource = 'postgres'): Promise<boolean> {
    try {
      switch (dataSource) {
        case 'postgres':
          const client = await this.pool.connect();
          await client.query('SELECT 1');
          client.release();
          return true;
        case 'ad':
          // Test AD connection using refactored service
          try {
            const { serviceFactory } = await import('@/services/service.factory');
            const adService = await serviceFactory.getADService();
            return await adService.testConnection();
          } catch (error) {
            logger.error('AD connection test failed:', error);
            return false;
          }
        case 'azure':
          // Test Azure connection using refactored service
          try {
            const { serviceFactory } = await import('@/services/service.factory');
            const azureService = await serviceFactory.getAzureService();
            return await azureService.testConnection();
          } catch (error) {
            logger.error('Azure connection test failed:', error);
            return false;
          }
        case 'o365':
          // Test O365 connection using refactored service
          try {
            const { serviceFactory } = await import('@/services/service.factory');
            const o365Service = await serviceFactory.getO365Service();
            return await o365Service.testConnection();
          } catch (error) {
            logger.error('O365 connection test failed:', error);
            return false;
          }
        default:
          return false;
      }
    } catch (error) {
      logger.error(`Connection test failed for ${dataSource}:`, error);
      return false;
    }
  }
  
  /**
   * Get query execution statistics
   */
  async getQueryStats(queryId: string, _timeRange?: { start: Date; end: Date }): Promise<any> {
    try {
      // Since direct query executions are not stored in report_history,
      // return empty statistics for now
      logger.debug(`Query statistics requested for ${queryId} - returning empty stats`);
      
      return {
        queryId,
        totalExecutions: 0,
        averageExecutionTime: 0,
        successRate: 0,
        cacheHitRate: 0,
        lastExecuted: null,
        recentHistory: [],
        note: 'Direct query executions are not persisted. Statistics are only available for template-based reports.'
      };
    } catch (error) {
      logger.error('Failed to retrieve query statistics:', error);
      return {
        queryId,
        totalExecutions: 0,
        averageExecutionTime: 0,
        successRate: 0,
        cacheHitRate: 0,
        error: 'Failed to retrieve statistics'
      };
    }
  }
  
  /**
   * Clear cache for a specific query or all queries
   */
  async clearCache(queryId?: string): Promise<void> {
    await this.cache.clear(queryId);
  }
  
  /**
   * Record query execution metrics
   */
  private async recordMetrics(metrics: QueryMetrics): Promise<void> {
    try {
      // For now, just log the metrics
      // The report_history table is designed for template-based reports only
      // Direct query executions are ephemeral and don't need persistent history
      logger.info(`Query executed: ${metrics.queryId}`, {
        userId: metrics.userId,
        executionTime: metrics.executionTime,
        rowCount: metrics.rowCount,
        cached: metrics.cached,
        parameters: metrics.parameters
      });
      
      // TODO: Consider creating a separate query_execution_history table
      // if persistent query metrics are needed in the future
    } catch (error) {
      // Don't fail query execution if metrics recording fails
      logger.warn('Failed to record query metrics:', error);
    }
  }

  /**
   * Helper method to determine data source from query ID
   */
  private getDataSourceFromQueryId(queryId: string): string {
    if (queryId.includes('ad_') || queryId.includes('ldap')) return 'ad';
    if (queryId.includes('azure_') || queryId.includes('graph')) return 'azure';
    if (queryId.includes('o365_') || queryId.includes('office')) return 'o365';
    return 'postgres';
  }
}