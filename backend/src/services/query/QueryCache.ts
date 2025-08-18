import { QueryDefinition, QueryResult } from './types';
import { logger } from '@/utils/logger';

/**
 * Query Cache
 * 
 * Handles caching of query results using Redis
 */
export class QueryCache {
  constructor(private redisClient?: any) {}
  
  /**
   * Get cached query result
   */
  async get<T>(
    queryDef: QueryDefinition<T>,
    parameters: Record<string, any>
  ): Promise<QueryResult<T> | null> {
    if (!this.redisClient || !queryDef.cache?.enabled) {
      return null;
    }
    
    try {
      const cacheKey = this.generateCacheKey(queryDef, parameters);
      const cached = await this.redisClient.get(cacheKey);
      
      if (cached) {
        const result = JSON.parse(cached);
        logger.debug(`Cache hit for query ${queryDef.id}`, { cacheKey });
        return {
          ...result,
          metadata: {
            ...result.metadata,
            cached: true
          }
        };
      }
      
      logger.debug(`Cache miss for query ${queryDef.id}`, { cacheKey });
      return null;
      
    } catch (error) {
      logger.warn('Cache get failed:', error);
      return null; // Don't fail query execution if cache fails
    }
  }
  
  /**
   * Set query result in cache
   */
  async set<T>(
    queryDef: QueryDefinition<T>,
    parameters: Record<string, any>,
    result: QueryResult<T>
  ): Promise<void> {
    if (!this.redisClient || !queryDef.cache?.enabled) {
      return;
    }
    
    try {
      const cacheKey = this.generateCacheKey(queryDef, parameters);
      const ttl = queryDef.cache.ttlSeconds;
      
      // Store result without the 'cached' metadata flag
      const cacheData = {
        ...result,
        metadata: {
          ...result.metadata,
          cached: false // Will be set to true when retrieved
        }
      };
      
      await this.redisClient.setex(cacheKey, ttl, JSON.stringify(cacheData));
      
      logger.debug(`Cached query result for ${queryDef.id}`, { 
        cacheKey, 
        ttl, 
        dataSize: ((result as any)?.data).length 
      });
      
    } catch (error) {
      logger.warn('Cache set failed:', error);
      // Don't fail query execution if cache fails
    }
  }
  
  /**
   * Clear cache for specific query or all queries
   */
  async clear(queryId?: string): Promise<void> {
    if (!this.redisClient) {
      return;
    }
    
    try {
      if (queryId) {
        // Clear cache for specific query
        const pattern = `query:${queryId}:*`;
        const keys = await this.redisClient.keys(pattern);
        
        if (keys.length > 0) {
          await this.redisClient.del(keys);
          logger.info(`Cleared cache for query ${queryId}`, { keysCleared: keys.length });
        }
      } else {
        // Clear all query caches
        const pattern = 'query:*';
        const keys = await this.redisClient.keys(pattern);
        
        if (keys.length > 0) {
          await this.redisClient.del(keys);
          logger.info('Cleared all query caches', { keysCleared: keys.length });
        }
      }
    } catch (error) {
      logger.error('Cache clear failed:', error);
      throw error;
    }
  }
  
  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    totalKeys: number;
    memoryUsage: number;
    hitRate: number;
  }> {
    if (!this.redisClient) {
      return { totalKeys: 0, memoryUsage: 0, hitRate: 0 };
    }
    
    try {
      const pattern = 'query:*';
      const keys = await this.redisClient.keys(pattern);
      const info = await this.redisClient.info('memory');
      
      // Parse memory info
      const memoryMatch = info.match(/used_memory:(\d+)/);
      const memoryUsage = memoryMatch ? parseInt(memoryMatch[1]) : 0;
      
      return {
        totalKeys: keys.length,
        memoryUsage,
        hitRate: 0 // TODO: Implement hit rate tracking
      };
      
    } catch (error) {
      logger.error('Cache stats failed:', error);
      return { totalKeys: 0, memoryUsage: 0, hitRate: 0 };
    }
  }
  
  /**
   * Warm up cache with frequently used queries
   */
  async warmUp(queries: Array<{ queryDef: QueryDefinition; parameters: Record<string, any> }>): Promise<void> {
    if (!this.redisClient) {
      return;
    }
    
    logger.info('Starting cache warm-up', { queryCount: queries.length });
    
    try {
      // Import QueryService to execute warm-up queries
      const { QueryService } = await import('./QueryService');
      const queryService = QueryService.getInstance();
      
      const warmUpPromises = queries.map(async ({ queryDef, parameters }) => {
        try {
          await queryService.executeQuery(queryDef, {
            userId: 0, // System user for warm-up
            parameters,
            options: { skipCache: false } // Use cache during warm-up
          });
          
          logger.debug(`Warmed up cache for query ${queryDef.id}`);
        } catch (error) {
          logger.warn(`Cache warm-up failed for query ${queryDef.id}:`, error);
        }
      });
      
      await Promise.all(warmUpPromises);
      logger.info('Cache warm-up completed');
      
    } catch (error) {
      logger.error('Cache warm-up failed:', error);
    }
  }
  
  /**
   * Generate cache key for query and parameters
   */
  private generateCacheKey(
    queryDef: QueryDefinition,
    parameters: Record<string, any>
  ): string {
    if (queryDef.cache?.keyTemplate) {
      // Use custom key template
      let key = queryDef.cache.keyTemplate;
      
      // Replace parameter placeholders
      for (const [param, value] of Object.entries(parameters)) {
        key = key.replace(`{{${param}}}`, String(value));
      }
      
      return `query:${key}`;
    }
    
    // Generate default key
    const paramHash = this.hashParameters(parameters);
    return `query:${queryDef.id}:${queryDef.version}:${paramHash}`;
  }
  
  /**
   * Hash parameters for cache key generation
   */
  private hashParameters(parameters: Record<string, any>): string {
    const crypto = require('crypto');
    const sortedParams = Object.keys(parameters)
      .sort()
      .reduce((result, key) => {
        result[key] = parameters[key];
        return result;
      }, {} as Record<string, any>);
    
    const paramString = JSON.stringify(sortedParams);
    return crypto.createHash('md5').update(paramString).digest('hex').substring(0, 8);
  }
  
  /**
   * Check if Redis is available
   */
  async isAvailable(): Promise<boolean> {
    if (!this.redisClient) {
      return false;
    }
    
    try {
      const result = await this.redisClient.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }
  
  /**
   * Set cache expiration for a key
   */
  async expire(key: string, ttl: number): Promise<void> {
    if (!this.redisClient) {
      return;
    }
    
    try {
      await this.redisClient.expire(key, ttl);
    } catch (error) {
      logger.warn('Cache expire failed:', error);
    }
  }
  
  /**
   * Get TTL for a cache key
   */
  async getTTL(key: string): Promise<number> {
    if (!this.redisClient) {
      return -1;
    }
    
    try {
      return await this.redisClient.ttl(key);
    } catch {
      return -1;
    }
  }
  
  /**
   * Invalidate cache patterns
   */
  async invalidatePattern(pattern: string): Promise<number> {
    if (!this.redisClient) {
      return 0;
    }
    
    try {
      const keys = await this.redisClient.keys(pattern);
      
      if (keys.length > 0) {
        await this.redisClient.del(keys);
        logger.info(`Invalidated cache pattern ${pattern}`, { keysInvalidated: keys.length });
        return keys.length;
      }
      
      return 0;
    } catch (error) {
      logger.error('Cache pattern invalidation failed:', error);
      return 0;
    }
  }
}