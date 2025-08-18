import { EventEmitter } from 'node:events';
import { logsCacheService } from '@/services/logs-cache.service';
import { logger } from '@/utils/logger';
import { cacheConfig } from '@/config/cache.config';

// Create a global event emitter for log events
export const logEventEmitter = new EventEmitter();

// Set max listeners to prevent warnings in production
logEventEmitter.setMaxListeners(100);

// Debounce mechanism for stats cache invalidation
let statsInvalidationTimeout: NodeJS.Timeout | null = null;
const STATS_INVALIDATION_DELAY = cacheConfig.invalidation.statsDebounceMs;

// Setup cache invalidation listener
logEventEmitter.on('newLog', async (log: LogEvent) => {
  try {
    // Invalidate cache for the specific log type immediately
    if (log.log_type === 'audit') {
      await logsCacheService.invalidateByType('audit');
    } else if (log.log_type === 'system') {
      await logsCacheService.invalidateByType('system');
    }
    
    // Debounce stats cache invalidation to avoid excessive invalidations
    if (statsInvalidationTimeout) {
      clearTimeout(statsInvalidationTimeout);
    }
    
    statsInvalidationTimeout = setTimeout(async () => {
      try {
        await logsCacheService.invalidateByType('stats');
        // No logging here - the redis client will log only if entries were deleted
      } catch (error) {
        logger.error('Error invalidating stats cache:', error);
      }
    }, STATS_INVALIDATION_DELAY);
    
  } catch (error) {
    logger.error('Error invalidating cache on new log:', error);
  }
});

export interface LogEvent {
  log_type: 'audit' | 'system';
  id: string;
  timestamp: string;
  type?: string;
  action?: string;
  level?: string;
  message?: string;
  module?: string;
  username?: string;
  success?: boolean;
}

// Type-safe event emission
export function emitLogEvent(log: LogEvent): void {
  logEventEmitter.emit('newLog', log);
}