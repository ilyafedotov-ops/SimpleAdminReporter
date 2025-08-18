import { Request, Response } from 'express';
import { QueryService, QueryDefinitionRegistry, QueryBuilder } from '@/services/query';
import { createQueryService } from '@/services/query/setup';
import { getGraphQueryExecutor } from '@/services/graph-query-executor.service';
import { getAllGraphQueries, getGraphQuery, getGraphQueriesByCategory } from '@/queries/graph';
import { db } from '@/config/database';
import { logger } from '@/utils/logger';
import { asyncHandler, createError } from '@/middleware/error.middleware';
import { body } from 'express-validator';

/**
 * Query Controller
 * 
 * Handles all query-related API endpoints
 */
export class QueryController {
  private queryService: QueryService;
  private queryRegistry: QueryDefinitionRegistry;
  private queryBuilder: QueryBuilder;
  private graphQueryExecutor = getGraphQueryExecutor();
  
  constructor() {
    // Initialize services
    this.queryService = createQueryService();
    this.queryRegistry = new QueryDefinitionRegistry();
    this.queryBuilder = new QueryBuilder();
  }
  
  /**
   * Execute a pre-defined query by ID
   * POST /api/query/execute
   */
  executeQuery = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { queryId, parameters = {}, options = {} } = req.body;
    
    if (!req.user) {
      throw createError('Authentication required', 401);
    }
    
    try {
      // Get query definition
      const queryDef = await this.queryRegistry.getQuery(queryId);
      if (!queryDef) {
        throw createError(`Query definition not found: ${queryId}`, 404);
      }
      
      // Check user access permissions
      if (!await this.checkQueryAccess(req.user, queryDef)) {
        throw createError('Insufficient permissions for this query', 403);
      }
      
      // Execute query
      const result = await this.queryService.executeQuery(queryDef, {
        userId: req.user.id,
        parameters,
        options
      });
      
      // Log query execution
      logger.info(`Query executed: ${queryId}`, {
        userId: req.user.id,
        success: result.success,
        rowCount: result.metadata.rowCount,
        executionTime: result.metadata.executionTime
      });
      
      res.json({
        success: true,
        data: {
          queryId,
          result,
          executedAt: new Date().toISOString(),
          executedBy: req.user.username
        }
      });
      
    } catch (error) {
      logger.error(`Query execution failed for ${queryId}:`, error);
      throw error;
    }
  });
  
  /**
   * Build and execute a custom query
   * POST /api/query/build
   */
  buildAndExecuteQuery = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { dataSource, select, from, where, orderBy, limit, parameters = {} } = req.body;
    
    if (!req.user) {
      throw createError('Authentication required', 401);
    }
    
    try {
      // Build query using QueryBuilder
      const builtQuery = this.queryBuilder
        .select(select)
        .from(from)
        .where(where)
        .orderBy(orderBy?.field, orderBy?.direction)
        .limit(limit)
        .build();
      
      // Create temporary query definition
      const tempQueryDef = {
        id: `temp_${Date.now()}`,
        name: 'Custom Query',
        description: 'Dynamically built query',
        version: '1.0.0',
        dataSource: dataSource || 'postgres',
        sql: builtQuery.sql,
        parameters: Object.keys(parameters).map(key => ({
          name: key,
          type: 'string' as const,
          required: false
        })),
        access: {
          requiresAuth: true
        }
      };
      
      // Execute the built query
      const result = await this.queryService.executeQuery(tempQueryDef, {
        userId: req.user.id,
        parameters,
        options: { skipCache: true } // Don't cache dynamic queries
      });
      
      res.json({
        success: true,
        data: {
          query: {
            sql: builtQuery.sql,
            parameters: builtQuery.parameters
          },
          result,
          executedAt: new Date().toISOString()
        }
      });
      
    } catch (error) {
      logger.error('Dynamic query execution failed:', error);
      throw error;
    }
  });
  
  /**
   * Get available query definitions
   * GET /api/query/definitions
   */
  getQueryDefinitions = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { dataSource, category, search } = req.query;
    
    try {
      const filters = {
        dataSource: dataSource as string,
        category: category as string,
        search: search as string
      };
      
      const definitions = await this.queryRegistry.getQueries(filters);
      
      // Filter based on user permissions or public access
      const accessibleDefinitions = [];
      for (const def of definitions) {
        let hasAccess = false;
        
        if (req.user) {
          // Authenticated user - check permissions
          hasAccess = await this.checkQueryAccess(req.user, def);
        } else {
          // Unauthenticated user - only allow public/system queries
          // System queries are those not starting with 'custom_'
          hasAccess = !def.id.startsWith('custom_');
        }
        
        if (hasAccess) {
          // Remove sensitive information before sending to client
          accessibleDefinitions.push({
            id: def.id,
            name: def.name,
            description: def.description,
            version: def.version,
            dataSource: def.dataSource,
            parameters: def.parameters,
            constraints: def.constraints,
            cache: def.cache ? { enabled: def.cache.enabled, ttlSeconds: def.cache.ttlSeconds } : null
          });
        }
      }
      
      res.json({
        success: true,
        data: {
          definitions: accessibleDefinitions,
          totalCount: accessibleDefinitions.length,
          filters: {
            dataSource: dataSource || null,
            category: category || null,
            search: search || null
          }
        }
      });
      
    } catch (error) {
      logger.error('Failed to get query definitions:', error);
      throw error;
    }
  });
  
  /**
   * Get schema information for a data source
   * GET /api/query/schema/:dataSource
   */
  getSchema = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { dataSource } = req.params;
    const { table } = req.query;
    
    if (!req.user) {
      throw createError('Authentication required', 401);
    }
    
    if (!['postgres', 'ad', 'azure', 'o365'].includes(dataSource)) {
      throw createError('Invalid data source', 400);
    }
    
    try {
      let schema;
      
      switch (dataSource) {
        case 'postgres':
          schema = await this.getPostgresSchema(table as string);
          break;
        case 'ad':
          schema = await this.getADSchema();
          break;
        case 'azure':
          schema = await this.getAzureSchema();
          break;
        case 'o365':
          schema = await this.getO365Schema();
          break;
        default:
          throw createError('Schema not available for this data source', 501);
      }
      
      res.json({
        success: true,
        data: {
          dataSource,
          schema,
          retrievedAt: new Date().toISOString()
        }
      });
      
    } catch (error) {
      logger.error(`Schema retrieval failed for ${dataSource}:`, error);
      throw error;
    }
  });
  
  /**
   * Validate a query without executing it
   * POST /api/query/validate
   */
  validateQuery = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { queryDef, parameters = {} } = req.body;
    
    try {
      const validation = await this.queryService.validateQuery(queryDef, parameters);
      
      res.json({
        success: true,
        data: {
          validation,
          validatedAt: new Date().toISOString()
        }
      });
      
    } catch (error) {
      logger.error('Query validation failed:', error);
      throw error;
    }
  });
  
  /**
   * Get cached query results
   * GET /api/query/cache/:queryId
   */
  getCachedResult = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { queryId } = req.params;
    const { parameters = {} } = req.query;
    
    if (!req.user) {
      throw createError('Authentication required', 401);
    }
    
    try {
      const queryDef = await this.queryRegistry.getQuery(queryId);
      if (!queryDef) {
        throw createError(`Query definition not found: ${queryId}`, 404);
      }
      
      // Check access permissions
      if (!await this.checkQueryAccess(req.user, queryDef)) {
        throw createError('Insufficient permissions for this query', 403);
      }
      
      // Import QueryCache to get cached result
      const { QueryCache } = await import('@/services/query/QueryCache');
      const cache = new QueryCache(); // Redis client will be injected
      
      const cached = await cache.get(queryDef, parameters as Record<string, any>);
      
      if (cached) {
        res.json({
          success: true,
          data: {
            queryId,
            cached: true,
            result: cached,
            retrievedAt: new Date().toISOString()
          }
        });
      } else {
        res.json({
          success: true,
          data: {
            queryId,
            cached: false,
            message: 'No cached result available'
          }
        });
      }
      
    } catch (error) {
      logger.error(`Cache retrieval failed for ${queryId}:`, error);
      throw error;
    }
  });
  
  /**
   * Get query execution statistics
   * GET /api/query/stats/:queryId?
   */
  getQueryStats = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { queryId } = req.params;
    const { startDate, endDate } = req.query;
    
    if (!req.user) {
      throw createError('Authentication required', 401);
    }
    
    try {
      const timeRange = startDate && endDate ? {
        start: new Date(startDate as string),
        end: new Date(endDate as string)
      } : undefined;
      
      const stats = await this.queryService.getQueryStats(queryId, timeRange);
      
      res.json({
        success: true,
        data: {
          stats,
          timeRange,
          retrievedAt: new Date().toISOString()
        }
      });
      
    } catch (error) {
      logger.error('Query stats retrieval failed:', error);
      throw error;
    }
  });
  
  /**
   * Clear query cache
   * DELETE /api/query/cache/:queryId?
   */
  clearCache = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { queryId } = req.params;
    
    if (!req.user) {
      throw createError('Authentication required', 401);
    }
    
    // Check if user has admin permissions for cache management
    if (!req.user.isAdmin) {
      throw createError('Admin permissions required for cache management', 403);
    }
    
    try {
      await this.queryService.clearCache(queryId);
      
      logger.info(`Cache cleared by ${req.user.username}`, { queryId: queryId || 'all' });
      
      res.json({
        success: true,
        data: {
          message: queryId ? `Cache cleared for query ${queryId}` : 'All query caches cleared',
          clearedAt: new Date().toISOString(),
          clearedBy: req.user.username
        }
      });
      
    } catch (error) {
      logger.error('Cache clear failed:', error);
      throw error;
    }
  });

  /**
   * Get query system health status
   */
  getHealth = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      const healthChecks = {
        postgres: await this.queryService.testConnection('postgres'),
        ad: await this.queryService.testConnection('ad'),
        cache: true // Assume cache is healthy if we can run this
      };

      const isHealthy = Object.values(healthChecks).every(status => status);
      const status = isHealthy ? 'healthy' : 'degraded';

      res.status(isHealthy ? 200 : 503).json({
        success: isHealthy,
        data: {
          status,
          timestamp: new Date().toISOString(),
          checks: healthChecks,
          uptime: process.uptime()
        }
      });
    } catch (error) {
      logger.error('Health check failed:', error);
      res.status(503).json({
        success: false,
        error: {
          code: 'HEALTH_CHECK_FAILED',
          message: 'Health check failed'
        }
      });
    }
  });

  /**
   * Get comprehensive system metrics
   */
  getMetrics = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      // Get all query metrics from database
      const metricsResult = await db.query(`
        SELECT 
          query_id,
          COUNT(*) as total_executions,
          AVG(execution_time_ms) as avg_execution_time,
          MAX(execution_time_ms) as max_execution_time,
          MIN(execution_time_ms) as min_execution_time,
          SUM(CASE WHEN cached THEN 1 ELSE 0 END)::float / COUNT(*) as cache_hit_rate,
          SUM(row_count) as total_rows_processed,
          MAX(executed_at) as last_execution
        FROM query_metrics 
        WHERE executed_at >= NOW() - INTERVAL '24 hours'
        GROUP BY query_id
        ORDER BY total_executions DESC
      `);

      // System metrics
      const systemMetrics = {
        memory: process.memoryUsage(),
        uptime: process.uptime(),
        cpuUsage: process.cpuUsage()
      };

      // Query performance summary
      const performanceSummary = await db.query(`
        SELECT 
          COUNT(DISTINCT query_id) as unique_queries,
          COUNT(*) as total_executions,
          AVG(execution_time_ms) as overall_avg_time,
          SUM(CASE WHEN cached THEN 1 ELSE 0 END)::float / COUNT(*) as overall_cache_rate
        FROM query_metrics 
        WHERE executed_at >= NOW() - INTERVAL '24 hours'
      `);

      res.json({
        success: true,
        data: {
          timestamp: new Date().toISOString(),
          system: systemMetrics,
          performance: performanceSummary.rows[0],
          queryBreakdown: metricsResult.rows,
          period: '24 hours'
        }
      });
      
    } catch (error) {
      logger.error('Failed to get metrics:', error);
      throw createError('Failed to retrieve system metrics', 500);
    }
  });
  
  /**
   * Execute a Graph API query
   * POST /api/query/graph/execute
   */
  executeGraphQuery = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { queryId, parameters = {}, options = {} } = req.body;
    
    if (!req.user) {
      throw createError('Authentication required', 401);
    }
    
    try {
      // Get Graph query definition
      const queryDef = getGraphQuery(queryId);
      if (!queryDef) {
        throw createError(`Graph query definition not found: ${queryId}`, 404);
      }
      
      // Execute Graph query
      const result = await this.graphQueryExecutor.executeQuery({
        queryId,
        userId: req.user.id,
        parameters,
        options: {
          includeCount: options.includeCount ?? true,
          pageSize: options.pageSize || 100,
          maxRecords: options.maxRecords || 1000,
          timeout: options.timeout || 30000
        },
        saveHistory: options.saveHistory !== false
      });
      
      // Log execution
      logger.info(`Graph query executed: ${queryId}`, {
        userId: req.user.id,
        success: !result.error,
        rowCount: result.rowCount,
        executionTime: result.executionTimeMs
      });
      
      res.json({
        success: true,
        data: {
          queryId,
          result: {
            data: ((result as any)?.data),
            rowCount: result.rowCount,
            executionTimeMs: result.executionTimeMs,
            metadata: result.metadata
          },
          executedAt: result.executedAt,
          executedBy: req.user.username
        }
      });
      
    } catch (error) {
      logger.error(`Graph query execution failed for ${queryId}:`, error);
      throw error;
    }
  });
  
  /**
   * Get available Graph query definitions
   * GET /api/query/graph/definitions
   */
  getGraphQueryDefinitions = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { category, search } = req.query;
    
    if (!req.user) {
      throw createError('Authentication required', 401);
    }
    
    try {
      let queries = getAllGraphQueries();
      
      // Filter by category if specified
      if (category && typeof category === 'string') {
        queries = getGraphQueriesByCategory(category);
      }
      
      // Search functionality
      if (search && typeof search === 'string') {
        const searchTerm = search.toLowerCase();
        queries = queries.filter(q => 
          q.name.toLowerCase().includes(searchTerm) ||
          q.description.toLowerCase().includes(searchTerm) ||
          q.id.toLowerCase().includes(searchTerm)
        );
      }
      
      // Map to response format
      const definitions = queries.map(q => ({
        id: q.id,
        name: q.name,
        description: q.description,
        category: q.category,
        parameters: q.parameters ? Object.entries(q.parameters).map(([name, def]) => ({
          name,
          type: def.type,
          required: def.required ?? false,
          default: def.default,
          description: def.description,
          validation: def.validation
        })) : [],
        fieldMappings: q.fieldMappings,
        performance: q.performance,
        reportMetadata: q.reportMetadata
      }));
      
      res.json({
        success: true,
        data: {
          queries: definitions,
          total: definitions.length,
          categories: [...new Set(queries.map(q => q.category))].sort()
        }
      });
      
    } catch (error) {
      logger.error('Failed to get Graph query definitions:', error);
      throw error;
    }
  });
  
  /**
   * Get Graph query execution history
   * GET /api/query/graph/history
   */
  getGraphQueryHistory = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { queryId, limit = 50, offset = 0 } = req.query;
    
    if (!req.user) {
      throw createError('Authentication required', 401);
    }
    
    try {
      let historyQuery = `
        SELECT 
          id,
          user_id,
          report_id as query_id,
          executed_at,
          parameters,
          result_count,
          status,
          error_message,
          execution_time_ms
        FROM report_history
        WHERE user_id = $1
          AND report_id LIKE 'graph_%'
      `;
      
      const params: any[] = [req.user.id];
      
      if (queryId) {
        historyQuery += ' AND report_id = $' + (params.length + 1);
        params.push(queryId);
      }
      
      historyQuery += ` ORDER BY executed_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);
      
      const result = await db.query(historyQuery, params);
      
      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total
        FROM report_history
        WHERE user_id = $1
          AND report_id LIKE 'graph_%'
          ${queryId ? 'AND report_id = $2' : ''}
      `;
      const countParams = queryId ? [req.user.id, queryId] : [req.user.id];
      const countResult = await db.query(countQuery, countParams);
      
      res.json({
        success: true,
        data: {
          history: result.rows,
          total: parseInt(countResult.rows[0].total),
          limit: parseInt(limit as string),
          offset: parseInt(offset as string)
        }
      });
      
    } catch (error) {
      logger.error('Failed to get Graph query history:', error);
      throw error;
    }
  });
  
  /**
   * Execute multiple Graph queries in batch
   * POST /api/query/graph/batch
   */
  executeGraphBatch = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { queries, options = {} } = req.body;
    
    if (!req.user) {
      throw createError('Authentication required', 401);
    }
    
    if (!Array.isArray(queries) || queries.length === 0) {
      throw createError('Queries array is required', 400);
    }
    
    if (queries.length > 10) {
      throw createError('Maximum 10 queries allowed in batch', 400);
    }
    
    try {
      const results = await this.graphQueryExecutor.executeBatch(
        queries,
        {
          userId: req.user.id,
          options: {
            includeCount: options.includeCount ?? true,
            pageSize: options.pageSize || 100,
            maxRecords: options.maxRecords || 1000
          },
          saveHistory: options.saveHistory !== false
        }
      );
      
      res.json({
        success: true,
        data: {
          results,
          totalQueries: queries.length,
          successCount: results.filter(r => !r.error).length,
          executedAt: new Date().toISOString(),
          executedBy: req.user.username
        }
      });
      
    } catch (error) {
      logger.error('Batch Graph query execution failed:', error);
      throw error;
    }
  });

  // Helper methods
  
  /**
   * Check if user has access to execute a query
   */
  private async checkQueryAccess(user: any, queryDef: any): Promise<boolean> {
    // Basic authentication check
    if (queryDef.access.requiresAuth && !user) {
      return false;
    }
    
    // Role-based access check
    if (queryDef.access.roles && queryDef.access.roles.length > 0) {
      // Assuming user has a roles array
      const userRoles = user.roles || [];
      const hasRole = queryDef.access.roles.some((role: string) => userRoles.includes(role));
      if (!hasRole) return false;
    }
    
    // Permission-based access check
    if (queryDef.access.permissions && queryDef.access.permissions.length > 0) {
      // Assuming user has a permissions array
      const userPermissions = user.permissions || [];
      const hasPermission = queryDef.access.permissions.some((perm: string) => userPermissions.includes(perm));
      if (!hasPermission) return false;
    }
    
    return true;
  }
  
  /**
   * Get PostgreSQL schema information
   */
  private async getPostgresSchema(tableName?: string): Promise<any> {
    try {
      let schemaQuery = `
        SELECT 
          table_name,
          column_name,
          data_type,
          is_nullable,
          column_default,
          character_maximum_length
        FROM information_schema.columns 
        WHERE table_schema = 'public'
      `;
      
      const params: any[] = [];
      if (tableName) {
        schemaQuery += ' AND table_name = $1';
        params.push(tableName);
      }
      
      schemaQuery += ' ORDER BY table_name, ordinal_position';
      
      const result = await db.query(schemaQuery, params);
      
      // Group columns by table
      const schema: Record<string, any[]> = {};
      result.rows.forEach((row: any) => {
        if (!schema[row.table_name]) {
          schema[row.table_name] = [];
        }
        schema[row.table_name].push({
          name: row.column_name,
          type: row.data_type,
          nullable: row.is_nullable === 'YES',
          default: row.column_default,
          maxLength: row.character_maximum_length
        });
      });
      
      return schema;
    } catch (error) {
      logger.error('PostgreSQL schema retrieval failed:', error);
      throw error;
    }
  }
  
  /**
   * Get Active Directory schema information
   */
  private async getADSchema(): Promise<any> {
    // Return common AD attributes for query building
    return {
      user: [
        { name: 'sAMAccountName', type: 'string', description: 'Username' },
        { name: 'displayName', type: 'string', description: 'Display Name' },
        { name: 'mail', type: 'string', description: 'Email Address' },
        { name: 'department', type: 'string', description: 'Department' },
        { name: 'title', type: 'string', description: 'Job Title' },
        { name: 'lastLogonTimestamp', type: 'date', description: 'Last Logon' },
        { name: 'passwordLastSet', type: 'date', description: 'Password Last Set' },
        { name: 'userAccountControl', type: 'number', description: 'Account Control Flags' },
        { name: 'whenCreated', type: 'date', description: 'Creation Date' },
        { name: 'whenChanged', type: 'date', description: 'Last Modified' }
      ],
      computer: [
        { name: 'name', type: 'string', description: 'Computer Name' },
        { name: 'operatingSystem', type: 'string', description: 'Operating System' },
        { name: 'operatingSystemVersion', type: 'string', description: 'OS Version' },
        { name: 'lastLogonTimestamp', type: 'date', description: 'Last Logon' },
        { name: 'whenCreated', type: 'date', description: 'Creation Date' }
      ],
      group: [
        { name: 'name', type: 'string', description: 'Group Name' },
        { name: 'description', type: 'string', description: 'Description' },
        { name: 'groupType', type: 'number', description: 'Group Type' },
        { name: 'member', type: 'array', description: 'Group Members' }
      ]
    };
  }
  
  /**
   * Get Azure AD schema information
   */
  private async getAzureSchema(): Promise<any> {
    // Return common Azure AD/Graph API attributes for query building
    return {
      user: [
        { name: 'id', type: 'string', description: 'User ID' },
        { name: 'displayName', type: 'string', description: 'Display Name' },
        { name: 'userPrincipalName', type: 'string', description: 'User Principal Name' },
        { name: 'mail', type: 'string', description: 'Email Address' },
        { name: 'userType', type: 'string', description: 'User Type (Member/Guest)' },
        { name: 'accountEnabled', type: 'boolean', description: 'Account Enabled' },
        { name: 'createdDateTime', type: 'date', description: 'Created Date' },
        { name: 'department', type: 'string', description: 'Department' },
        { name: 'jobTitle', type: 'string', description: 'Job Title' },
        { name: 'officeLocation', type: 'string', description: 'Office Location' },
        { name: 'companyName', type: 'string', description: 'Company Name' },
        { name: 'signInActivity.lastSignInDateTime', type: 'date', description: 'Last Sign In' }
      ],
      group: [
        { name: 'id', type: 'string', description: 'Group ID' },
        { name: 'displayName', type: 'string', description: 'Group Name' },
        { name: 'description', type: 'string', description: 'Description' },
        { name: 'mail', type: 'string', description: 'Email Address' },
        { name: 'groupTypes', type: 'array', description: 'Group Types' },
        { name: 'securityEnabled', type: 'boolean', description: 'Security Enabled' },
        { name: 'mailEnabled', type: 'boolean', description: 'Mail Enabled' }
      ],
      application: [
        { name: 'id', type: 'string', description: 'Application ID' },
        { name: 'displayName', type: 'string', description: 'Display Name' },
        { name: 'appId', type: 'string', description: 'App ID' },
        { name: 'createdDateTime', type: 'date', description: 'Created Date' }
      ]
    };
  }
  
  /**
   * Get Office 365 schema information
   */
  private async getO365Schema(): Promise<any> {
    // TODO: Implement O365 schema discovery
    return {
      user: [],
      mailbox: [],
      sharepoint: []
    };
  }
}

// Validation rules
export const executeQueryValidation = [
  body('queryId')
    .isString()
    .notEmpty()
    .withMessage('Query ID is required'),
  body('parameters')
    .optional()
    .isObject()
    .withMessage('Parameters must be an object'),
  body('options')
    .optional()
    .isObject()
    .withMessage('Options must be an object')
];

export const buildQueryValidation = [
  body('dataSource')
    .isIn(['postgres', 'ad', 'azure', 'o365'])
    .withMessage('Invalid data source'),
  body('select')
    .isArray({ min: 1 })
    .withMessage('Select fields are required'),
  body('from')
    .isString()
    .notEmpty()
    .withMessage('From table/source is required')
];

// Validation rules for Graph queries
export const executeGraphQueryValidation = [
  body('queryId')
    .isString()
    .notEmpty()
    .withMessage('Query ID is required')
    .matches(/^graph_/)
    .withMessage('Invalid Graph query ID format'),
  body('parameters')
    .optional()
    .isObject()
    .withMessage('Parameters must be an object'),
  body('options')
    .optional()
    .isObject()
    .withMessage('Options must be an object')
];

export const executeGraphBatchValidation = [
  body('queries')
    .isArray({ min: 1, max: 10 })
    .withMessage('Queries must be an array with 1-10 items'),
  body('queries.*.queryId')
    .isString()
    .notEmpty()
    .withMessage('Each query must have a queryId'),
  body('queries.*.parameters')
    .optional()
    .isObject()
    .withMessage('Query parameters must be an object'),
  body('options')
    .optional()
    .isObject()
    .withMessage('Options must be an object')
];

// Export controller instance
export const queryController = new QueryController();