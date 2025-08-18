import { azureMsalService, AzureMsalService } from './azure-msal.service';
import { CredentialContext } from './base';
import { 
  GraphQueryDefinition, 
  GraphQueryExecutionContext, 
  GraphQueryResult,
  buildDynamicFilter,
  daysToDate,
  hoursToDate,
  formatDateForGraph,
  escapeODataValue
} from '../queries/graph/types';
import { 
  getGraphQuery, 
  transformFunctions 
} from '../queries/graph';
import { logger } from '../utils/logger';
// import { buildComplexGraphFilter, GraphFilter } from '../utils/graph-utils';
import { db } from '../config/database';

export class GraphQueryExecutor {
  private azureService: AzureMsalService;
  private logger = logger.child({ service: 'GraphQueryExecutor' });
  
  constructor(azureService?: AzureMsalService) {
    this.azureService = azureService || azureMsalService;
  }
  
  /**
   * Execute a Graph query by ID
   */
  async executeQuery(context: GraphQueryExecutionContext & { queryId: string }): Promise<GraphQueryResult> {
    const { queryId, parameters, userId, credentialId, saveHistory, graphContext } = context;
    
    // Get query definition
    const queryDef = getGraphQuery(queryId);
    if (!queryDef) {
      throw new Error(`Graph query ${queryId} not found`);
    }
    
    const startTime = Date.now();
    
    try {
      // Validate parameters
      this.validateParameters(queryDef, parameters);
      
      // Transform parameters
      const transformedParams = await this.transformParameters(queryDef, parameters);
      
      // Build query options
      const graphOptions = this.buildGraphOptions(queryDef, transformedParams);
      
      // Build credential context
      const credContext: CredentialContext = {
        userId,
        credentials: credentialId ? await this.getCredentials(credentialId) : undefined
      };
      
      // Execute query through Azure service with enhanced context
      let result;
      
      // Build endpoint - no need to add version as Graph client already includes it
      const fullEndpoint = queryDef.query.endpoint;
      
      // Log the endpoint to debug the duplicate v1.0 issue
      this.logger.debug('GraphQueryExecutor endpoint:', { 
        originalEndpoint: queryDef.query.endpoint,
        fullEndpoint,
        queryId 
      });
      
      if (graphContext?.queryContext === 'user' && graphContext.targetUser) {
        // Execute as user
        // For user context, we need to use executeQuery with user context
        result = await this.azureService.executeQuery(
          {
            endpoint: fullEndpoint,
            graphOptions,
            type: 'graph',
            userContext: {
              userId: context.userId
            }
          },
          credContext
        );
      } else if (graphContext?.queryContext === 'organization' && graphContext.targetOrganization) {
        // Execute for specific tenant
        result = await this.azureService.executeQuery(
          {
            endpoint: fullEndpoint,
            graphOptions,
            type: 'graph',
            organizationContext: {
              tenantId: graphContext.targetOrganization
            }
          },
          credContext
        );
      } else {
        // Standard execution
        result = await this.azureService.executeQuery(
          {
            endpoint: fullEndpoint,
            graphOptions,
            type: 'graph',
            parameters: transformedParams
          },
          credContext
        );
      }
      
      // Apply post-processing
      let processedData = ((result as any)?.data);
      if (queryDef.postProcess) {
        processedData = await this.applyPostProcessing(processedData, queryDef, transformedParams);
      }
      
      // Apply field mappings
      processedData = this.applyFieldMappings(processedData, queryDef);
      
      // Build final result
      const queryResult: GraphQueryResult = {
        queryId,
        executedAt: new Date(),
        executionTimeMs: Date.now() - startTime,
        rowCount: processedData.length,
        data: processedData,
        parameters: transformedParams,
        metadata: {
          totalCount: result.totalCount,
          nextLink: result.nextLink
        }
      };
      
      // Save to history if requested
      if (saveHistory) {
        await this.saveQueryHistory(queryResult, userId);
      }
      
      return queryResult;
      
    } catch (error) {
      this.logger.error('Failed to execute Graph query', { queryId, error });
      
      const queryResult: GraphQueryResult = {
        queryId,
        executedAt: new Date(),
        executionTimeMs: Date.now() - startTime,
        rowCount: 0,
        data: [],
        parameters,
        error: (error as Error).message
      };
      
      // Save error to history
      if (saveHistory) {
        await this.saveQueryHistory(queryResult, userId);
      }
      
      throw error;
    }
  }
  
  /**
   * Validate query parameters
   */
  private validateParameters(queryDef: GraphQueryDefinition, parameters: Record<string, any>): void {
    if (!queryDef.parameters) return;
    
    for (const [paramName, paramDef] of Object.entries(queryDef.parameters)) {
      const value = parameters[paramName];
      
      // Check required parameters
      if (paramDef.required && (value === undefined || value === null)) {
        throw new Error(`Required parameter '${paramName}' is missing`);
      }
      
      // Skip validation if no value and not required
      if (value === undefined || value === null) continue;
      
      // Type validation
      const actualType = Array.isArray(value) ? 'array' : typeof value;
      if (actualType !== paramDef.type && !(paramDef.type === 'date' && value instanceof Date)) {
        throw new Error(`Parameter '${paramName}' must be of type ${paramDef.type}`);
      }
      
      // Additional validations
      if (paramDef.validation) {
        const { min, max, pattern, enum: enumValues } = paramDef.validation;
        
        if (min !== undefined && typeof value === 'number' && value < min) {
          throw new Error(`Parameter '${paramName}' must be at least ${min}`);
        }
        
        if (max !== undefined && typeof value === 'number' && value > max) {
          throw new Error(`Parameter '${paramName}' must be at most ${max}`);
        }
        
        if (pattern && typeof value === 'string' && !new RegExp(pattern).test(value)) {
          throw new Error(`Parameter '${paramName}' does not match required pattern`);
        }
        
        if (enumValues && !enumValues.includes(value)) {
          throw new Error(`Parameter '${paramName}' must be one of: ${enumValues.join(', ')}`);
        }
      }
    }
  }
  
  /**
   * Transform parameters based on query definition
   */
  private async transformParameters(
    queryDef: GraphQueryDefinition, 
    parameters: Record<string, any>
  ): Promise<Record<string, any>> {
    const transformed: Record<string, any> = { ...parameters };
    
    if (!queryDef.parameters) return transformed;
    
    for (const [paramName, paramDef] of Object.entries(queryDef.parameters)) {
      let value = parameters[paramName];
      
      // Apply default if missing
      if (value === undefined && paramDef.default !== undefined) {
        value = paramDef.default;
        transformed[paramName] = value;
      }
      
      // Apply transformation
      if (value !== undefined && paramDef.transform) {
        switch (paramDef.transform) {
          case 'daysToDate':
            transformed[`${paramName}_transformed`] = daysToDate(value);
            transformed.cutoffDate = formatDateForGraph(daysToDate(value));
            break;
            
          case 'hoursToDate':
            transformed[`${paramName}_transformed`] = hoursToDate(value);
            transformed.cutoffDate = formatDateForGraph(hoursToDate(value));
            break;
            
          case 'formatDate':
            transformed[paramName] = formatDateForGraph(value);
            break;
            
          case 'escapeOData':
            transformed[paramName] = escapeODataValue(value);
            break;
            
          case 'buildFilter':
            // This would be custom filter building logic
            break;
        }
      }
    }
    
    return transformed;
  }
  
  /**
   * Build Graph API query options
   */
  private buildGraphOptions(
    queryDef: GraphQueryDefinition, 
    parameters: Record<string, any>
  ): any {
    const options: any = {};
    
    // Basic options
    if (queryDef.query.select) {
      options.select = queryDef.query.select;
    }
    
    if (queryDef.query.expand) {
      options.expand = queryDef.query.expand.join(',');
    }
    
    if (queryDef.query.orderBy) {
      options.orderBy = queryDef.query.orderBy;
    }
    
    if (queryDef.query.top) {
      options.top = queryDef.query.top;
    }
    
    if (queryDef.query.skip) {
      options.skip = queryDef.query.skip;
    }
    
    if (queryDef.query.count) {
      options.count = queryDef.query.count;
    }
    
    // Build filter with parameter substitution
    if (queryDef.query.filter) {
      options.filter = buildDynamicFilter(queryDef.query.filter, parameters);
    }
    
    return options;
  }
  
  /**
   * Apply post-processing to results
   */
  private async applyPostProcessing(
    data: any[], 
    queryDef: GraphQueryDefinition,
    parameters: Record<string, any>
  ): Promise<any[]> {
    let processedData = [...data];
    
    if (!queryDef.postProcess) return processedData;
    
    // Apply transform function
    if (queryDef.postProcess.transform) {
      const transformFunc = transformFunctions[queryDef.postProcess.transform];
      if (transformFunc) {
        processedData = await transformFunc(processedData, parameters);
      } else {
        this.logger.warn(`Transform function '${queryDef.postProcess.transform}' not found`);
      }
    }
    
    // Apply client-side filtering
    if (queryDef.postProcess.clientFilter) {
      const filters = queryDef.postProcess.clientFilter.map(f => ({
        ...f,
        value: typeof f.value === 'string' && f.value.startsWith('{{') 
          ? parameters[f.value.slice(2, -2)] 
          : f.value
      }));
      
      processedData = this.applyClientFilters(processedData, filters);
    }
    
    // Apply sorting
    if (queryDef.postProcess.sort) {
      processedData = this.sortData(processedData, queryDef.postProcess.sort);
    }
    
    // Apply limit
    if (queryDef.postProcess.limit) {
      processedData = processedData.slice(0, queryDef.postProcess.limit);
    }
    
    // Apply aggregation
    if (queryDef.postProcess.aggregate) {
      processedData = this.aggregateData(processedData, queryDef.postProcess.aggregate);
    }
    
    return processedData;
  }
  
  /**
   * Apply client-side filters
   */
  private applyClientFilters(data: any[], filters: any[]): any[] {
    return data.filter(item => {
      return filters.every(filter => {
        const value = this.getNestedValue(item, filter.field);
        
        switch (filter.operator) {
          case 'equals':
            return value === filter.value;
          case 'not_equals':
            return value !== filter.value;
          case 'contains':
            return value?.toString().includes(filter.value);
          case 'greater_than':
            return value > filter.value;
          case 'less_than':
            return value < filter.value;
          case 'in':
            return Array.isArray(filter.value) ? filter.value.includes(value) : false;
          case 'not_in':
            return Array.isArray(filter.value) ? !filter.value.includes(value) : true;
          default:
            return true;
        }
      });
    });
  }
  
  /**
   * Sort data
   */
  private sortData(data: any[], sort: { field: string; direction: 'asc' | 'desc' }): any[] {
    return [...data].sort((a, b) => {
      const aVal = this.getNestedValue(a, sort.field);
      const bVal = this.getNestedValue(b, sort.field);
      const modifier = sort.direction === 'desc' ? -1 : 1;
      
      if (aVal < bVal) return -1 * modifier;
      if (aVal > bVal) return 1 * modifier;
      return 0;
    });
  }
  
  /**
   * Aggregate data
   */
  private aggregateData(data: any[], aggregate: any): any[] {
    // Simple aggregation implementation
    if (aggregate.groupBy) {
      const groups = new Map<string, any[]>();
      
      data.forEach(item => {
        const key = this.getNestedValue(item, aggregate.groupBy);
        if (!groups.has(key)) {
          groups.set(key, []);
        }
        groups.get(key)!.push(item);
      });
      
      return Array.from(groups.entries()).map(([key, items]) => ({
        [aggregate.groupBy]: key,
        count: items.length,
        items: items
      }));
    }
    
    return data;
  }
  
  /**
   * Apply field mappings
   */
  private applyFieldMappings(data: any[], queryDef: GraphQueryDefinition): any[] {
    if (!queryDef.fieldMappings) return data;
    
    return data.map(item => {
      const mapped: any = {};
      
      // Process each field
      Object.entries(item).forEach(([key, value]) => {
        const mapping = queryDef.fieldMappings![key];
        
        if (mapping && !mapping.hide) {
          let mappedValue = value;
          
          // Apply transformation
          if (mapping.transform) {
            mappedValue = this.transformFieldValue(mappedValue, mapping.transform);
          }
          
          mapped[mapping.displayName || key] = mappedValue;
        } else if (!mapping) {
          // Include unmapped fields as-is
          mapped[key] = value;
        }
      });
      
      return mapped;
    });
  }
  
  /**
   * Transform field value
   */
  private transformFieldValue(value: any, transform: string): any {
    switch (transform) {
      case 'dateToLocal':
        return value ? new Date(value).toLocaleString() : null;
        
      case 'booleanToYesNo':
        return value ? 'Yes' : 'No';
        
      case 'arrayToCommaSeparated':
        return Array.isArray(value) ? value.join(', ') : value;
        
      case 'extractProperty':
        return Array.isArray(value) ? value.map(v => v.issuer || v).join(', ') : value;
        
      default:
        return value;
    }
  }
  
  /**
   * Get nested object value
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }
  
  /**
   * Get credentials for execution
   */
  private async getCredentials(credentialId: number): Promise<any> {
    const result = await db.query(
      'SELECT * FROM service_credentials WHERE id = $1',
      [credentialId]
    );
    
    if (!result.rows[0]) {
      throw new Error('Credentials not found');
    }
    
    // Decrypt credentials here if needed
    return result.rows[0];
  }
  
  /**
   * Save query execution to history
   */
  private async saveQueryHistory(result: GraphQueryResult, userId: number): Promise<void> {
    try {
      await db.query(`
        INSERT INTO report_history (
          user_id, report_id, executed_at, parameters, 
          result_count, results, status, error_message, execution_time_ms
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        userId,
        result.queryId,
        result.executedAt,
        JSON.stringify(result.parameters),
        result.rowCount,
        JSON.stringify(((result as any)?.data)),
        result.error ? 'error' : 'success',
        result.error || null,
        result.executionTimeMs
      ]);
    } catch (error) {
      this.logger.error('Failed to save query history', error);
    }
  }
  
  /**
   * Execute multiple queries in batch
   */
  async executeBatch(
    queries: Array<{ queryId: string; parameters: Record<string, any> }>,
    context: Omit<GraphQueryExecutionContext, 'parameters'>
  ): Promise<GraphQueryResult[]> {
    const results = await Promise.allSettled(
      queries.map(q => this.executeQuery({
        ...context,
        queryId: q.queryId,
        parameters: q.parameters
      }))
    );
    
    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          queryId: queries[index].queryId,
          executedAt: new Date(),
          executionTimeMs: 0,
          rowCount: 0,
          data: [],
          parameters: queries[index].parameters,
          error: result.reason.message
        };
      }
    });
  }
}

// Export singleton instance
let instance: GraphQueryExecutor | null = null;

export function getGraphQueryExecutor(azureService?: AzureMsalService): GraphQueryExecutor {
  if (!instance || azureService) {
    instance = new GraphQueryExecutor(azureService);
  }
  return instance;
}