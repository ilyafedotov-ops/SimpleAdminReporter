/**
 * Cache configuration
 */
export const cacheConfig = {
  // TTL values in seconds
  ttl: {
    auditLogs: 300,      // 5 minutes
    systemLogs: 300,     // 5 minutes
    stats: 60,           // 1 minute
    fieldMetadata: 3600, // 1 hour
    queryMetrics: 3600   // 1 hour
  },
  
  // Cache size limits
  limits: {
    maxEntriesPerType: 100,
    maxTotalEntries: 500
  },
  
  // Cache invalidation settings
  invalidation: {
    statsDebounceMs: 5000,    // 5 seconds
    batchInvalidation: true,  // Group invalidations
    logLevel: 'debug'         // 'info' | 'debug' - controls cache operation logging
  },
  
  // Redis key prefixes
  prefixes: {
    logs: 'logs:',
    metrics: 'query-metrics:',
    stats: 'query-stats:'
  },
  
  // Performance settings
  performance: {
    compressionThreshold: 1024, // Compress values larger than 1KB
    enableMetrics: true,        // Track cache performance
    warmupOnStart: false        // Pre-load common queries
  }
};

/**
 * Get cache TTL for a specific type
 */
export function getCacheTTL(type: 'audit' | 'system' | 'stats' | 'metadata' | 'metrics'): number {
  switch (type) {
    case 'audit':
      return cacheConfig.ttl.auditLogs;
    case 'system':
      return cacheConfig.ttl.systemLogs;
    case 'stats':
      return cacheConfig.ttl.stats;
    case 'metadata':
      return cacheConfig.ttl.fieldMetadata;
    case 'metrics':
      return cacheConfig.ttl.queryMetrics;
    default:
      return 300; // Default 5 minutes
  }
}

/**
 * Check if cache logging should be at info level
 */
export function shouldLogCacheInfo(): boolean {
  return cacheConfig.invalidation.logLevel === 'info';
}