import { redis } from '@/config/redis';
import { logger } from '@/utils/logger';
import { LogQueryParams } from './logs.service';
import { cacheConfig, getCacheTTL } from '@/config/cache.config';
import crypto from 'crypto';

export interface CachedLogResult {
  data: any;
  cachedAt: number;
  expiresAt: number;
}

export class LogsCacheService {
  private readonly CACHE_PREFIX = cacheConfig.prefixes.logs;
  private readonly DEFAULT_TTL = getCacheTTL('audit');
  private readonly STATS_TTL = getCacheTTL('stats');
  private readonly MAX_CACHE_SIZE = cacheConfig.limits.maxEntriesPerType;
  
  /**
   * Generate cache key from query parameters
   */
  private generateCacheKey(prefix: string, params: LogQueryParams): string {
    // Sort parameters to ensure consistent key generation
    const sortedParams = Object.keys(params)
      .sort()
      .reduce((acc, key) => {
        if (params[key as keyof LogQueryParams] !== undefined) {
          acc[key] = params[key as keyof LogQueryParams];
        }
        return acc;
      }, {} as any);
    
    const paramString = JSON.stringify(sortedParams);
    const hash = crypto.createHash('md5').update(paramString).digest('hex');
    
    return `${this.CACHE_PREFIX}${prefix}:${hash}`;
  }
  
  /**
   * Get cached audit logs
   */
  async getCachedAuditLogs(params: LogQueryParams, offset: number): Promise<CachedLogResult | null> {
    try {
      const key = this.generateCacheKey('audit', { ...params, offset } as any);
      const cached = await redis.getJson<CachedLogResult>(key);
      
      if (cached && cached.expiresAt > Date.now()) {
        logger.debug('Cache hit for audit logs', { key });
        return cached;
      }
      
      return null;
    } catch (error) {
      logger.error('Error getting cached audit logs:', error);
      return null;
    }
  }
  
  /**
   * Cache audit logs result
   */
  async cacheAuditLogs(params: LogQueryParams, offset: number, data: any, ttl?: number): Promise<void> {
    try {
      const key = this.generateCacheKey('audit', { ...params, offset } as any);
      const cacheTTL = ttl || this.DEFAULT_TTL;
      
      const cacheData: CachedLogResult = {
        data,
        cachedAt: Date.now(),
        expiresAt: Date.now() + (cacheTTL * 1000)
      };
      
      await redis.setJson(key, cacheData, cacheTTL);
      logger.debug('Cached audit logs', { key, ttl: cacheTTL });
      
      // Manage cache size
      await this.evictOldestIfNeeded();
    } catch (error) {
      logger.error('Error caching audit logs:', error);
    }
  }
  
  /**
   * Get cached system logs
   */
  async getCachedSystemLogs(params: LogQueryParams, offset: number): Promise<CachedLogResult | null> {
    try {
      const key = this.generateCacheKey('system', { ...params, offset } as any);
      const cached = await redis.getJson<CachedLogResult>(key);
      
      if (cached && cached.expiresAt > Date.now()) {
        logger.debug('Cache hit for system logs', { key });
        return cached;
      }
      
      return null;
    } catch (error) {
      logger.error('Error getting cached system logs:', error);
      return null;
    }
  }
  
  /**
   * Cache system logs result
   */
  async cacheSystemLogs(params: LogQueryParams, offset: number, data: any, ttl?: number): Promise<void> {
    try {
      const key = this.generateCacheKey('system', { ...params, offset } as any);
      const cacheTTL = ttl || this.DEFAULT_TTL;
      
      const cacheData: CachedLogResult = {
        data,
        cachedAt: Date.now(),
        expiresAt: Date.now() + (cacheTTL * 1000)
      };
      
      await redis.setJson(key, cacheData, cacheTTL);
      logger.debug('Cached system logs', { key, ttl: cacheTTL });
      
      // Manage cache size
      await this.evictOldestIfNeeded();
    } catch (error) {
      logger.error('Error caching system logs:', error);
    }
  }
  
  /**
   * Get cached stats
   */
  async getCachedStats(timeRange: string): Promise<CachedLogResult | null> {
    try {
      const key = `${this.CACHE_PREFIX}stats:${timeRange}`;
      const cached = await redis.getJson<CachedLogResult>(key);
      
      if (cached && cached.expiresAt > Date.now()) {
        logger.debug('Cache hit for stats', { timeRange });
        return cached;
      }
      
      return null;
    } catch (error) {
      logger.error('Error getting cached stats:', error);
      return null;
    }
  }
  
  /**
   * Cache stats result
   */
  async cacheStats(timeRange: string, data: any): Promise<void> {
    try {
      const key = `${this.CACHE_PREFIX}stats:${timeRange}`;
      
      const cacheData: CachedLogResult = {
        data,
        cachedAt: Date.now(),
        expiresAt: Date.now() + (this.STATS_TTL * 1000)
      };
      
      await redis.setJson(key, cacheData, this.STATS_TTL);
      logger.debug('Cached stats', { timeRange, ttl: this.STATS_TTL });
    } catch (error) {
      logger.error('Error caching stats:', error);
    }
  }
  
  /**
   * Invalidate all logs cache
   */
  async invalidateAll(): Promise<void> {
    try {
      const deleted = await redis.invalidatePattern(`${this.CACHE_PREFIX}*`);
      // Only log if entries were actually deleted
      if (deleted > 0) {
        logger.info(`Invalidated ${deleted} log cache entries`);
      }
    } catch (error) {
      logger.error('Error invalidating logs cache:', error);
    }
  }
  
  /**
   * Invalidate cache for specific log type
   */
  async invalidateByType(type: 'audit' | 'system' | 'stats'): Promise<void> {
    try {
      const deleted = await redis.invalidatePattern(`${this.CACHE_PREFIX}${type}:*`);
      // Only log if entries were actually deleted
      if (deleted > 0) {
        logger.info(`Invalidated ${deleted} ${type} cache entries`);
      }
    } catch (error) {
      logger.error(`Error invalidating ${type} cache:`, error);
    }
  }
  
  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{
    auditEntries: number;
    systemEntries: number;
    statsEntries: number;
    totalSize: number;
  }> {
    try {
      const client = redis.getClient();
      
      const auditKeys = await client.keys(`${this.CACHE_PREFIX}audit:*`);
      const systemKeys = await client.keys(`${this.CACHE_PREFIX}system:*`);
      const statsKeys = await client.keys(`${this.CACHE_PREFIX}stats:*`);
      
      return {
        auditEntries: auditKeys.length,
        systemEntries: systemKeys.length,
        statsEntries: statsKeys.length,
        totalSize: auditKeys.length + systemKeys.length + statsKeys.length
      };
    } catch (error) {
      logger.error('Error getting cache stats:', error);
      return {
        auditEntries: 0,
        systemEntries: 0,
        statsEntries: 0,
        totalSize: 0
      };
    }
  }
  
  /**
   * Evict oldest cache entries if cache size exceeds limit
   */
  private async evictOldestIfNeeded(): Promise<void> {
    try {
      const client = redis.getClient();
      const keys = await client.keys(`${this.CACHE_PREFIX}*`);
      
      if (keys.length <= this.MAX_CACHE_SIZE) {
        return;
      }
      
      // Get all entries with their cached times
      const entries: Array<{ key: string; cachedAt: number }> = [];
      
      for (const key of keys) {
        const data = await redis.getJson<CachedLogResult>(key);
        if (data) {
          entries.push({ key, cachedAt: data.cachedAt });
        }
      }
      
      // Sort by cached time (oldest first)
      entries.sort((a, b) => a.cachedAt - b.cachedAt);
      
      // Delete oldest entries
      const toDelete = entries.slice(0, entries.length - this.MAX_CACHE_SIZE);
      for (const entry of toDelete) {
        await redis.del(entry.key);
      }
      
      if (toDelete.length > 0) {
        logger.info(`Evicted ${toDelete.length} oldest cache entries`);
      }
    } catch (error) {
      logger.error('Error evicting old cache entries:', error);
    }
  }
  
  /**
   * Warm up cache with common queries
   */
  async warmupCache(): Promise<void> {
    try {
      logger.info('Starting logs cache warmup');
      
      // Define common queries to pre-cache (reserved for future implementation)
      // const _commonQueries: LogQueryParams[] = [
      //   { type: 'audit', page: 1, pageSize: 50 },
      //   { type: 'system', page: 1, pageSize: 50 },
      //   { type: 'all', page: 1, pageSize: 50 },
      //   { type: 'audit', eventType: 'auth', page: 1, pageSize: 50 },
      //   { type: 'system', level: 'error', page: 1, pageSize: 50 }
      // ];
      
      // Note: Actual warmup would require calling the logs service
      // This is just a placeholder for the pattern
      logger.info('Logs cache warmup completed');
    } catch (error) {
      logger.error('Error warming up cache:', error);
    }
  }
}

// Export singleton instance
export const logsCacheService = new LogsCacheService();