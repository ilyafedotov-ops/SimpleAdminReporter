/* eslint-disable @typescript-eslint/no-explicit-any */
import apiService from './api';
import { 
  ApiResponse, 
  QueryDefinition, 
  QueryExecutionResult, 
  QueryValidationResult,
  QueryHealthStatus,
  QueryStatistics,
  QueryMetrics,
  DynamicQuerySpec
} from '@/types';
import { ApiPriority } from '@/utils/apiQueue';
import { schemaCache, createCacheKey } from '@/utils/apiCache';

/**
 * Query Service - Wrapper for new backend query API endpoints
 * This service provides methods to interact with the unified query system
 */
class QueryService {
  /**
   * Execute a pre-defined query
   * @param queryId - The ID of the query definition to execute
   * @param parameters - Query parameters
   * @param options - Execution options (skipCache, timeout, etc.)
   */
  async execute(
    queryId: string,
    parameters?: Record<string, any>,
    options?: {
      skipCache?: boolean;
      timeout?: number;
      credentialId?: number;
      queryDef?: QueryDefinition; // For inline query definitions (test queries)
    }
  ): Promise<ApiResponse<QueryExecutionResult>> {
    return apiService.post('/reports/query/execute', {
      queryId,
      parameters,
      options
    });
  }

  /**
   * Build and execute a dynamic query
   * @param querySpec - Dynamic query specification
   */
  async build(querySpec: DynamicQuerySpec): Promise<ApiResponse<QueryExecutionResult>> {
    return apiService.post('/reports/query/build', querySpec);
  }

  /**
   * Get available query definitions
   * @param params - Filter parameters
   */
  async getDefinitions(params?: {
    dataSource?: string;
    category?: string;
    search?: string;
    includeSystem?: boolean;
  }): Promise<ApiResponse<{
    definitions: QueryDefinition[];
    totalCount: number;
  }>> {
    return apiService.get('/reports/query/definitions', params, {
      useCache: true,
      cacheTTL: 300, // 5 minutes
      priority: ApiPriority.NORMAL
    });
  }

  /**
   * Get schema for a data source
   * @param dataSource - The data source (postgres, ad, azure, o365)
   */
  async getSchema(dataSource: string): Promise<ApiResponse<{
    tables: Record<string, unknown>[];
    fields: Record<string, unknown>[];
  }>> {
    // Check schema cache first
    const cacheKey = createCacheKey(`schema:${dataSource}`);
    const cached = schemaCache.get<ApiResponse<{ tables: Record<string, unknown>[]; fields: Record<string, unknown>[] }>>(cacheKey);
    if (cached) {
      console.log(`Using cached schema for ${dataSource}`);
      return cached;
    }
    
    // Fetch with high priority and cache for 1 hour
    const response = await apiService.get(`/reports/query/schema/${dataSource}`, undefined, {
      useCache: false, // We're using our own schema cache
      priority: ApiPriority.HIGH
    });
    
    // Cache the response
    if (response.success) {
      schemaCache.set(cacheKey, response, 3600); // 1 hour
    }
    
    return response as ApiResponse<{ tables: Record<string, unknown>[]; fields: Record<string, unknown>[]; }>;
  }

  /**
   * Validate a query without executing it
   * @param queryDef - Query definition to validate
   * @param parameters - Parameters to validate against
   */
  async validate(
    queryDef: QueryDefinition,
    parameters?: Record<string, any>
  ): Promise<ApiResponse<QueryValidationResult>> {
    return apiService.post('/reports/query/validate', {
      queryDef,
      parameters
    });
  }

  /**
   * Get query service health status
   */
  async getHealth(): Promise<ApiResponse<QueryHealthStatus>> {
    return apiService.get('/reports/query/health');
  }

  /**
   * Get execution statistics for a query
   * @param queryId - Optional query ID (omit for all queries)
   */
  async getStats(queryId?: string): Promise<ApiResponse<QueryStatistics>> {
    const url = queryId ? `/reports/query/stats/${queryId}` : '/reports/query/stats';
    return apiService.get(url);
  }

  /**
   * Get service-wide metrics
   */
  async getMetrics(): Promise<ApiResponse<QueryMetrics>> {
    return apiService.get('/reports/query/metrics');
  }

  /**
   * Get cached results for a query
   * @param queryId - The query ID
   */
  async getCached(queryId: string): Promise<ApiResponse<QueryExecutionResult>> {
    return apiService.get(`/reports/query/cache/${queryId}`);
  }

  /**
   * Clear cache for a specific query or all queries
   * @param queryId - Optional query ID (omit to clear all)
   */
  async clearCache(queryId?: string): Promise<ApiResponse<{
    cleared: boolean;
    entriesCleared: number;
  }>> {
    const url = queryId ? `/reports/query/cache/${queryId}` : '/reports/query/cache';
    return apiService.delete(url);
  }

  // ============================================================================
  // Graph API Query Methods
  // ============================================================================

  /**
   * Execute a Graph API query
   * @param queryId - The ID of the Graph query to execute
   * @param parameters - Query parameters
   * @param options - Execution options
   */
  async executeGraphQuery(
    queryId: string,
    parameters?: Record<string, any>,
    options?: {
      includeCount?: boolean;
      pageSize?: number;
      maxRecords?: number;
      timeout?: number;
      saveHistory?: boolean;
    }
  ): Promise<ApiResponse<QueryExecutionResult>> {
    return apiService.post('/reports/query/graph/execute', {
      queryId,
      parameters,
      options
    });
  }

  /**
   * Get available Graph query definitions
   * @param params - Filter parameters
   */
  async getGraphDefinitions(params?: {
    category?: string;
    search?: string;
  }): Promise<ApiResponse<{
    queries: QueryDefinition[];
    total: number;
    categories: string[];
  }>> {
    return apiService.get('/reports/query/graph/definitions', params, {
      useCache: true,
      cacheTTL: 300, // 5 minutes
      priority: ApiPriority.NORMAL
    });
  }

  /**
   * Get Graph query execution history
   * @param params - Filter parameters
   */
  async getGraphHistory(params?: {
    queryId?: string;
    limit?: number;
    offset?: number;
  }): Promise<ApiResponse<{
    history: Record<string, unknown>[];
    total: number;
    limit: number;
    offset: number;
  }>> {
    return apiService.get('/reports/query/graph/history', params);
  }

  /**
   * Execute multiple Graph queries in batch
   * @param queries - Array of queries to execute
   * @param options - Batch execution options
   */
  async executeGraphBatch(
    queries: Array<{
      queryId: string;
      parameters?: Record<string, any>;
    }>,
    options?: {
      includeCount?: boolean;
      pageSize?: number;
      maxRecords?: number;
      saveHistory?: boolean;
    }
  ): Promise<ApiResponse<{
    results: QueryExecutionResult[];
    totalQueries: number;
    successCount: number;
    executedAt: string;
    executedBy: string;
  }>> {
    return apiService.post('/reports/query/graph/batch', {
      queries,
      options
    });
  }
}

// Create singleton instance
export const queryService = new QueryService();
export default queryService;