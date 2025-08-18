/**
 * Preview Service
 * Unified service for handling custom query previews across all data sources (AD, Azure, O365)
 * 
 * Key Features:
 * - Unified interface for all data sources
 * - Redis caching with 5-minute TTL
 * - Uses preview-data-extractor for consistent response formatting
 * - Follows established service patterns from the codebase
 * - Comprehensive error handling and logging
 */

import { redis } from '@/config/redis';
import { logger } from '@/utils/logger';
import { serviceFactory } from './service.factory';
import { processPreviewData } from '@/utils/preview-data-extractor';
import type {
  PreviewResponse,
  PreviewRequest,
  DataSourceType,
  CustomQuery
} from '@/types/shared-types';
import { createError } from '@/middleware/error.middleware';
import crypto from 'crypto';

/**
 * Legacy interfaces maintained for backward compatibility
 * @deprecated Use types from shared-types instead
 */
export interface CustomReportQuery extends CustomQuery {}

export interface PreviewQueryRequest extends PreviewRequest {}

export interface CachedPreviewResult<T = Record<string, unknown>> {
  data: PreviewResponse<T>;
  cachedAt: number;
  expiresAt: number;
  cacheHit: boolean;
}

export class PreviewService {
  private readonly CACHE_PREFIX = 'preview:';
  private readonly DEFAULT_TTL = 300; // 5 minutes as specified in requirements
  private readonly MAX_PREVIEW_LIMIT = 50; // Maximum rows for preview
  private readonly DEFAULT_PREVIEW_LIMIT = 10; // Default rows for preview

  /**
   * Generate cache key from query parameters
   * Uses MD5 hash of sorted parameters for consistent key generation
   */
  private generateCacheKey(request: PreviewQueryRequest): string {
    // Create a deterministic representation of the request
    const normalizedRequest = {
      source: request.source,
      query: this.normalizeQuery(request.query),
      parameters: request.parameters || {},
      limit: request.limit || this.DEFAULT_PREVIEW_LIMIT
    };

    let requestString: string;
    try {
      requestString = JSON.stringify(normalizedRequest);
    } catch (error) {
      // Handle circular references or other JSON stringify errors
      logger.warn('Failed to stringify request for cache key, using fallback', { error: error instanceof Error ? error.message : 'Unknown error' });
      requestString = JSON.stringify({
        source: normalizedRequest.source,
        fieldsCount: (normalizedRequest.query.fields || []).length,
        filtersCount: normalizedRequest.query.filters?.length || 0,
        limit: normalizedRequest.limit,
        timestamp: Date.now()
      });
    }
    const hash = crypto.createHash('md5').update(requestString).digest('hex');
    
    return `${this.CACHE_PREFIX}${request.source}:${hash}`;
  }

  /**
   * Normalize query object for consistent caching
   * Sorts object properties to ensure consistent key generation
   */
  private normalizeQuery(query: CustomQuery): CustomQuery {
    const normalized: CustomQuery = {
      source: query.source,
      fields: (query.fields || []).map(f => ({ ...f })).sort((a, b) => a.name.localeCompare(b.name))
    };

    if (query.filters) {
      normalized.filters = [...query.filters].sort((a, b) => a.field.localeCompare(b.field));
    }

    if (query.groupBy) {
      normalized.groupBy = query.groupBy;
    }

    if (query.orderBy) {
      normalized.orderBy = query.orderBy;
    }

    if (query.limit !== undefined) {
      normalized.limit = query.limit;
    }

    return normalized;
  }

  /**
   * Get cached preview result
   */
  private async getCachedResult<T = Record<string, unknown>>(cacheKey: string): Promise<CachedPreviewResult<T> | null> {
    try {
      const cached = await redis.getJson<CachedPreviewResult<T>>(cacheKey);
      
      if (cached && cached.expiresAt > Date.now()) {
        logger.debug('Cache hit for preview query', { cacheKey });
        return {
          ...cached,
          cacheHit: true
        };
      }

      if (cached) {
        logger.debug('Cache entry expired for preview query', { 
          cacheKey, 
          expiredBy: Date.now() - cached.expiresAt 
        });
      }
      
      return null;
    } catch (error) {
      logger.error('Error getting cached preview result:', error);
      return null;
    }
  }

  /**
   * Cache preview result
   */
  private async cacheResult<T = Record<string, unknown>>(cacheKey: string, data: PreviewResponse<T>): Promise<void> {
    try {
      const cacheData: CachedPreviewResult<T> = {
        data,
        cachedAt: Date.now(),
        expiresAt: Date.now() + (this.DEFAULT_TTL * 1000),
        cacheHit: false
      };
      
      await redis.setJson(cacheKey, cacheData, this.DEFAULT_TTL);
      logger.debug('Cached preview result', { cacheKey, ttl: this.DEFAULT_TTL });
    } catch (error) {
      logger.error('Error caching preview result:', error);
    }
  }

  /**
   * Validate custom query structure
   * Uses the same validation logic from the reports controller
   */
  private validateCustomQuery(query: CustomQuery): void {
    if (!query.source || !['ad', 'azure', 'o365'].includes(query.source)) {
      throw createError('Invalid or missing data source', 400);
    }

    if (!query.fields || !Array.isArray(query.fields) || query.fields.length === 0) {
      throw createError('At least one field must be selected', 400);
    }

    // Validate field names
    for (const field of query.fields || []) {
      if (!field.name || typeof field.name !== 'string') {
        throw createError('Invalid field specification', 400);
      }
    }

    // Validate filters if provided
    if (query.filters && Array.isArray(query.filters)) {
      for (const filter of query.filters) {
        if (!filter.field || !filter.operator) {
          throw createError('Invalid filter specification', 400);
        }
        
        const validOperators = [
          'equals', 'notEquals', 'contains', 'notContains', 'startsWith', 'endsWith', 
          'greaterThan', 'lessThan', 'greaterThanOrEqual', 'lessThanOrEqual', 
          'isEmpty', 'isNotEmpty', 'not_equals', 'greater_than', 'less_than', 
          'older_than', 'newer_than', 'exists', 'not_exists'
        ];
        
        if (!validOperators.includes(filter.operator)) {
          throw createError(`Invalid filter operator: ${filter.operator}`, 400);
        }
      }
    }
  }

  /**
   * Execute preview query for a specific data source
   */
  private async executeDataSourceQuery(
    source: DataSourceType,
    query: CustomQuery,
    parameters: Record<string, unknown>
  ): Promise<unknown> {
    logger.debug('Executing data source query for preview:', {
      source,
      fieldCount: (query.fields || []).length,
      filterCount: query.filters?.length || 0,
      hasParameters: Object.keys(parameters).length > 0
    });

    switch (source) {
      case 'ad': {
        const adService = await serviceFactory.getADService();
        const result = await adService.executeCustomQuery(query, parameters);
        
        logger.debug('AD service query executed for preview:', {
          resultType: typeof result,
          isArray: Array.isArray(result),
          hasData: result?.data ? result.data.length : 'no data property',
          hasSuccess: result && typeof result === 'object' && 'success' in result,
          hasCached: result && typeof result === 'object' && 'cached' in result
        });
        
        return result;
      }
      
      case 'azure': {
        const azureService = await serviceFactory.getAzureService();
        const result = await azureService.executeQuery({ 
          type: 'custom', 
          ...query, 
          parameters 
        });
        
        logger.debug('Azure service query executed for preview:', {
          resultType: typeof result,
          isArray: Array.isArray(result),
          hasData: result?.data ? result.data.length : 'no data property',
          hasValue: (result as any)?.value ? (result as any).value.length : 'no value property',
          keys: result ? Object.keys(result).slice(0, 10) : []
        });
        
        return result;
      }
      
      case 'o365': {
        const o365Service = await serviceFactory.getO365Service();
        const result = await o365Service.executeQuery({ 
          type: 'custom', 
          ...query, 
          parameters 
        });
        
        logger.debug('O365 service query executed for preview:', {
          resultType: typeof result,
          isArray: Array.isArray(result),
          hasData: result?.data ? result.data.length : 'no data property',
          hasValue: (result as any)?.value ? (result as any).value.length : 'no value property',
          keys: result ? Object.keys(result).slice(0, 10) : []
        });
        
        return result;
      }
      
      default:
        throw createError('Unknown data source', 400);
    }
  }

  /**
   * Execute a custom query preview
   * Main public method that handles caching, validation, and execution
   */
  async executePreview<T = Record<string, unknown>>(request: PreviewRequest): Promise<PreviewResponse<T>> {
    logger.info('Starting preview query execution', {
      source: request.source,
      fieldCount: (request.query.fields || []).length,
      hasFilters: !!request.query.filters?.length,
      limit: request.limit || this.DEFAULT_PREVIEW_LIMIT
    });

    try {
      // Validate the query structure
      this.validateCustomQuery(request.query);

      // Apply limit for preview execution with proper validation
      let requestLimit = request.limit;
      
      // Handle invalid limit values (but allow 0)
      if (requestLimit === null || requestLimit === undefined || 
          isNaN(requestLimit) || !isFinite(requestLimit)) {
        requestLimit = this.DEFAULT_PREVIEW_LIMIT;
      } else if (requestLimit < 0) {
        // Negative values should use default
        requestLimit = this.DEFAULT_PREVIEW_LIMIT;
      }
      
      const effectiveLimit = Math.min(requestLimit, this.MAX_PREVIEW_LIMIT);
      
      const previewQuery = { 
        ...request.query, 
        limit: effectiveLimit 
      };

      // Generate cache key
      const cacheKey = this.generateCacheKey({
        ...request,
        query: previewQuery
      });

      // Check cache first
      const cachedResult = await this.getCachedResult<T>(cacheKey);
      if (cachedResult) {
        logger.info('Returning cached preview result', {
          source: request.source,
          cacheAge: Date.now() - cachedResult.cachedAt
        });
        return cachedResult.data;
      }

      // Execute the query
      const startTime = Date.now();
      const rawResult = await this.executeDataSourceQuery(
        request.source,
        previewQuery,
        request.parameters || {}
      );
      
      const executionTime = Date.now() - startTime;

      // Process the result using the preview-data-extractor utility
      const previewResponse = processPreviewData<T>(rawResult, request.source, executionTime);

      // Cache the result
      await this.cacheResult<T>(cacheKey, previewResponse);

      logger.info('Preview query executed successfully', {
        source: request.source,
        executionTime,
        rowCount: previewResponse.data?.rowCount || 0,
        wasCached: false
      });

      return previewResponse;

    } catch (error) {
      logger.error('Preview query execution failed:', {
        source: request.source,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      
      throw error;
    }
  }

  /**
   * Clear all preview cache entries
   */
  async clearCache(): Promise<number> {
    try {
      const deleted = await redis.invalidatePattern(`${this.CACHE_PREFIX}*`);
      
      if (deleted > 0) {
        logger.info(`Cleared ${deleted} preview cache entries`);
      }
      
      return deleted;
    } catch (error) {
      logger.error('Error clearing preview cache:', error);
      return 0;
    }
  }

  /**
   * Clear cache for specific data source
   */
  async clearCacheBySource(source: DataSourceType): Promise<number> {
    try {
      const deleted = await redis.invalidatePattern(`${this.CACHE_PREFIX}${source}:*`);
      
      if (deleted > 0) {
        logger.info(`Cleared ${deleted} preview cache entries for ${source}`);
      }
      
      return deleted;
    } catch (error) {
      logger.error(`Error clearing preview cache for ${source}:`, error);
      return 0;
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{
    adEntries: number;
    azureEntries: number;
    o365Entries: number;
    totalEntries: number;
  }> {
    try {
      const client = redis.getClient();
      
      const adKeys = await client.keys(`${this.CACHE_PREFIX}ad:*`);
      const azureKeys = await client.keys(`${this.CACHE_PREFIX}azure:*`);
      const o365Keys = await client.keys(`${this.CACHE_PREFIX}o365:*`);
      
      return {
        adEntries: adKeys.length,
        azureEntries: azureKeys.length,
        o365Entries: o365Keys.length,
        totalEntries: adKeys.length + azureKeys.length + o365Keys.length
      };
    } catch (error) {
      logger.error('Error getting preview cache stats:', error);
      return {
        adEntries: 0,
        azureEntries: 0,
        o365Entries: 0,
        totalEntries: 0
      };
    }
  }
}

// Export singleton instance following established patterns
export const previewService = new PreviewService();