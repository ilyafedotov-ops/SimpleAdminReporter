import { redis } from '@/config/redis';
import { logger } from '@/utils/logger';
import { EventEmitter } from 'node:events';

export interface QueryMetric {
  queryType: string;
  executionTimeMs: number;
  rowCount: number;
  cacheHit: boolean;
  timestamp: Date;
  userId?: number;
  queryParams?: Record<string, any>;
  error?: string;
}

export interface QueryStats {
  queryType: string;
  totalQueries: number;
  avgExecutionTimeMs: number;
  maxExecutionTimeMs: number;
  minExecutionTimeMs: number;
  totalRowsFetched: number;
  avgRowsPerQuery: number;
  cacheHitRate: number;
  errorRate: number;
  lastUpdated: Date;
}

export class QueryMetricsService extends EventEmitter {
  private readonly METRICS_KEY_PREFIX = 'query-metrics:';
  private readonly STATS_KEY_PREFIX = 'query-stats:';
  private readonly METRICS_TTL = 3600; // 1 hour
  private readonly STATS_TTL = 86400; // 24 hours
  private readonly MAX_METRICS_PER_TYPE = 1000;

  /**
   * Record a query execution metric
   */
  async recordQueryMetric(metric: QueryMetric): Promise<void> {
    try {
      const key = `${this.METRICS_KEY_PREFIX}${metric.queryType}`;
      
      // Add metric to sorted set with timestamp as score
      await redis.zadd(
        key,
        metric.timestamp.getTime(),
        JSON.stringify(metric)
      );
      
      // Trim to keep only recent metrics
      await redis.zremrangebyrank(key, 0, -this.MAX_METRICS_PER_TYPE - 1);
      
      // Set TTL
      await redis.expire(key, this.METRICS_TTL);
      
      // Update aggregated stats
      await this.updateStats(metric);
      
      // Emit metric event for real-time monitoring
      this.emit('queryMetric', metric);
      
      // Log slow queries
      if (metric.executionTimeMs > 1000) {
        logger.warn('Slow query detected', {
          queryType: metric.queryType,
          executionTimeMs: metric.executionTimeMs,
          params: metric.queryParams
        });
      }
    } catch (error) {
      logger.error('Error recording query metric:', error);
    }
  }

  /**
   * Update aggregated statistics
   */
  private async updateStats(metric: QueryMetric): Promise<void> {
    const statsKey = `${this.STATS_KEY_PREFIX}${metric.queryType}`;
    
    try {
      // Get current stats
      const currentStats = await redis.getJson<QueryStats>(statsKey);
      
      if (!currentStats) {
        // Initialize new stats
        const newStats: QueryStats = {
          queryType: metric.queryType,
          totalQueries: 1,
          avgExecutionTimeMs: metric.executionTimeMs,
          maxExecutionTimeMs: metric.executionTimeMs,
          minExecutionTimeMs: metric.executionTimeMs,
          totalRowsFetched: metric.rowCount,
          avgRowsPerQuery: metric.rowCount,
          cacheHitRate: metric.cacheHit ? 100 : 0,
          errorRate: metric.error ? 100 : 0,
          lastUpdated: new Date()
        };
        
        await redis.setJson(statsKey, newStats, this.STATS_TTL);
        return;
      }
      
      // Update existing stats
      const totalQueries = currentStats.totalQueries + 1;
      const totalExecutionTime = currentStats.avgExecutionTimeMs * currentStats.totalQueries + metric.executionTimeMs;
      const totalRows = currentStats.totalRowsFetched + metric.rowCount;
      const cacheHits = Math.round(currentStats.cacheHitRate * currentStats.totalQueries / 100) + (metric.cacheHit ? 1 : 0);
      const errors = Math.round(currentStats.errorRate * currentStats.totalQueries / 100) + (metric.error ? 1 : 0);
      
      const updatedStats: QueryStats = {
        queryType: metric.queryType,
        totalQueries,
        avgExecutionTimeMs: Math.round(totalExecutionTime / totalQueries),
        maxExecutionTimeMs: Math.max(currentStats.maxExecutionTimeMs, metric.executionTimeMs),
        minExecutionTimeMs: Math.min(currentStats.minExecutionTimeMs, metric.executionTimeMs),
        totalRowsFetched: totalRows,
        avgRowsPerQuery: Math.round(totalRows / totalQueries),
        cacheHitRate: Math.round((cacheHits / totalQueries) * 100),
        errorRate: Math.round((errors / totalQueries) * 100),
        lastUpdated: new Date()
      };
      
      await redis.setJson(statsKey, updatedStats, this.STATS_TTL);
    } catch (error) {
      logger.error('Error updating query stats:', error);
    }
  }

  /**
   * Get query statistics for a specific type
   */
  async getStats(queryType: string): Promise<QueryStats | null> {
    try {
      const key = `${this.STATS_KEY_PREFIX}${queryType}`;
      return await redis.getJson<QueryStats>(key);
    } catch (error) {
      logger.error('Error getting query stats:', error);
      return null;
    }
  }

  /**
   * Get all available query statistics
   */
  async getAllStats(): Promise<QueryStats[]> {
    try {
      const keys = await redis.keys(`${this.STATS_KEY_PREFIX}*`);
      const stats: QueryStats[] = [];
      
      for (const key of keys) {
        const stat = await redis.getJson<QueryStats>(key);
        if (stat) {
          stats.push(stat);
        }
      }
      
      return stats.sort((a, b) => b.totalQueries - a.totalQueries);
    } catch (error) {
      logger.error('Error getting all query stats:', error);
      return [];
    }
  }

  /**
   * Get recent metrics for a query type
   */
  async getRecentMetrics(queryType: string, limit: number = 100): Promise<QueryMetric[]> {
    try {
      const key = `${this.METRICS_KEY_PREFIX}${queryType}`;
      const results = await redis.zrevrange(key, 0, limit - 1);
      
      return results.map(result => JSON.parse(result) as QueryMetric);
    } catch (error) {
      logger.error('Error getting recent metrics:', error);
      return [];
    }
  }

  /**
   * Get metrics summary for a time period
   */
  async getMetricsSummary(hours: number = 1): Promise<any> {
    try {
      const cutoffTime = Date.now() - (hours * 60 * 60 * 1000);
      const allStats = await this.getAllStats();
      
      const summary = {
        totalQueries: 0,
        avgExecutionTimeMs: 0,
        slowQueries: 0,
        cacheHitRate: 0,
        errorRate: 0,
        topQueryTypes: [] as { type: string; count: number; avgTime: number }[],
        timeRange: {
          from: new Date(cutoffTime),
          to: new Date()
        }
      };
      
      // Aggregate metrics from all query types
      for (const stats of allStats) {
        const recentMetrics = await this.getRecentMetrics(stats.queryType);
        const filteredMetrics = recentMetrics.filter(m => 
          new Date(m.timestamp).getTime() > cutoffTime
        );
        
        if (filteredMetrics.length > 0) {
          summary.totalQueries += filteredMetrics.length;
          summary.slowQueries += filteredMetrics.filter(m => m.executionTimeMs > 1000).length;
          
          const avgTime = filteredMetrics.reduce((sum, m) => sum + m.executionTimeMs, 0) / filteredMetrics.length;
          summary.topQueryTypes.push({
            type: stats.queryType,
            count: filteredMetrics.length,
            avgTime: Math.round(avgTime)
          });
        }
      }
      
      // Calculate overall averages
      if (summary.totalQueries > 0) {
        summary.avgExecutionTimeMs = Math.round(
          summary.topQueryTypes.reduce((sum, t) => sum + (t.avgTime * t.count), 0) / summary.totalQueries
        );
        
        const totalCacheHits = allStats.reduce((sum, s) => 
          sum + Math.round(s.cacheHitRate * s.totalQueries / 100), 0
        );
        summary.cacheHitRate = Math.round((totalCacheHits / summary.totalQueries) * 100);
        
        const totalErrors = allStats.reduce((sum, s) => 
          sum + Math.round(s.errorRate * s.totalQueries / 100), 0
        );
        summary.errorRate = Math.round((totalErrors / summary.totalQueries) * 100);
      }
      
      // Sort top query types by count
      summary.topQueryTypes.sort((a, b) => b.count - a.count);
      
      return summary;
    } catch (error) {
      logger.error('Error getting metrics summary:', error);
      return null;
    }
  }

  /**
   * Clear all metrics and stats
   */
  async clearMetrics(): Promise<void> {
    try {
      const metricKeys = await redis.keys(`${this.METRICS_KEY_PREFIX}*`);
      const statsKeys = await redis.keys(`${this.STATS_KEY_PREFIX}*`);
      
      const allKeys = [...metricKeys, ...statsKeys];
      
      if (allKeys.length > 0) {
        await redis.del(...allKeys);
      }
      
      logger.info(`Cleared ${allKeys.length} metric keys`);
    } catch (error) {
      logger.error('Error clearing metrics:', error);
    }
  }

  /**
   * Export metrics to CSV format
   */
  async exportMetrics(queryType?: string): Promise<string> {
    try {
      const metrics: QueryMetric[] = [];
      
      if (queryType) {
        metrics.push(...await this.getRecentMetrics(queryType, 1000));
      } else {
        // Get metrics for all types
        const allStats = await this.getAllStats();
        for (const stats of allStats) {
          metrics.push(...await this.getRecentMetrics(stats.queryType, 100));
        }
      }
      
      // Convert to CSV
      const headers = ['Timestamp', 'Query Type', 'Execution Time (ms)', 'Row Count', 'Cache Hit', 'User ID', 'Error'];
      const rows = metrics.map(m => [
        // Handle both Date objects and ISO strings
        typeof m.timestamp === 'string' ? m.timestamp : m.timestamp.toISOString(),
        m.queryType,
        m.executionTimeMs,
        m.rowCount,
        m.cacheHit ? 'Yes' : 'No',
        m.userId || '',
        m.error || ''
      ]);
      
      const csv = [
        headers.join(','),
        ...rows.map(row => row.join(','))
      ].join('\n');
      
      return csv;
    } catch (error) {
      logger.error('Error exporting metrics:', error);
      throw error;
    }
  }
}

export const queryMetricsService = new QueryMetricsService();