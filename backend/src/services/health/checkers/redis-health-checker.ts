/**
 * Redis Health Checker
 * Implements health checks for Redis cache/queue
 */

import { redis } from '@/config/redis';
import { BaseHealthChecker } from '../base-health-checker';
import { HealthCheckResult, HealthCheckContext } from '../types';

export class RedisHealthChecker extends BaseHealthChecker {
  constructor() {
    super('redis');
  }

  protected async performCheck(context: HealthCheckContext): Promise<HealthCheckResult> {
    const connected = await redis.testConnection();
    
    if (!connected) {
      return this.createDegradedResult(
        'Redis returned unexpected response',
        Date.now() - context.startTime
      );
    }

    const stats = await this.getRedisStats();
    
    return this.createHealthyResult(
      Date.now() - context.startTime,
      stats
    );
  }

  private async getRedisStats(): Promise<Record<string, any>> {
    try {
      const client = redis.getClient();
      const info = await client.info();
      const lines = info.split('\r\n');
      const stats: Record<string, string> = {};
      
      lines.forEach((line: string) => {
        if (line.includes(':')) {
          const [key, value] = line.split(':');
          if (['used_memory_human', 'connected_clients', 'uptime_in_seconds'].includes(key)) {
            stats[key] = value;
          }
        }
      });
      
      return stats;
    } catch (error) {
      this.logger.warn('Failed to get Redis stats:', error);
      return {};
    }
  }
}