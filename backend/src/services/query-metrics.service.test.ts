import { QueryMetricsService, QueryMetric } from './query-metrics.service';
import { redis } from '@/config/redis';
import { logger } from '@/utils/logger';

jest.mock('@/config/redis');
jest.mock('@/utils/logger');

describe('QueryMetricsService', () => {
  let queryMetricsService: QueryMetricsService;
  const mockRedis = redis as jest.Mocked<typeof redis>;

  beforeEach(() => {
    jest.clearAllMocks();
    queryMetricsService = new QueryMetricsService();
  });

  describe('recordQueryMetric', () => {
    it('should record a query metric successfully', async () => {
      const metric: QueryMetric = {
        queryType: 'audit_logs',
        executionTimeMs: 150,
        rowCount: 50,
        cacheHit: false,
        timestamp: new Date(),
        userId: 1,
        queryParams: { type: 'audit' }
      };

      mockRedis.zadd.mockResolvedValueOnce(1);
      mockRedis.zremrangebyrank.mockResolvedValueOnce(0);
      mockRedis.expire.mockResolvedValueOnce(true);
      mockRedis.getJson.mockResolvedValueOnce(null);
      mockRedis.setJson.mockResolvedValueOnce(undefined);

      await queryMetricsService.recordQueryMetric(metric);

      expect(mockRedis.zadd).toHaveBeenCalledWith(
        'query-metrics:audit_logs',
        metric.timestamp.getTime(),
        JSON.stringify(metric)
      );
      expect(mockRedis.expire).toHaveBeenCalledWith('query-metrics:audit_logs', 3600);
    });

    it('should log slow queries', async () => {
      const slowMetric: QueryMetric = {
        queryType: 'system_logs',
        executionTimeMs: 1500, // > 1000ms
        rowCount: 100,
        cacheHit: false,
        timestamp: new Date()
      };

      mockRedis.zadd.mockResolvedValueOnce(1);
      mockRedis.zremrangebyrank.mockResolvedValueOnce(0);
      mockRedis.expire.mockResolvedValueOnce(true);
      mockRedis.getJson.mockResolvedValueOnce(null);
      mockRedis.setJson.mockResolvedValueOnce(undefined);

      await queryMetricsService.recordQueryMetric(slowMetric);

      expect(logger.warn).toHaveBeenCalledWith(
        'Slow query detected',
        expect.objectContaining({
          queryType: 'system_logs',
          executionTimeMs: 1500
        })
      );
    });

    it('should handle errors gracefully', async () => {
      const metric: QueryMetric = {
        queryType: 'audit_logs',
        executionTimeMs: 100,
        rowCount: 10,
        cacheHit: true,
        timestamp: new Date()
      };

      mockRedis.zadd.mockRejectedValueOnce(new Error('Redis error'));

      await queryMetricsService.recordQueryMetric(metric);

      expect(logger.error).toHaveBeenCalledWith(
        'Error recording query metric:',
        expect.any(Error)
      );
    });
  });

  describe('getStats', () => {
    it('should return stats for a query type', async () => {
      const stats = {
        queryType: 'audit_logs',
        totalQueries: 100,
        avgExecutionTimeMs: 200,
        maxExecutionTimeMs: 1000,
        minExecutionTimeMs: 50,
        totalRowsFetched: 5000,
        avgRowsPerQuery: 50,
        cacheHitRate: 75,
        errorRate: 2,
        lastUpdated: new Date()
      };

      mockRedis.getJson.mockResolvedValueOnce(stats);

      const result = await queryMetricsService.getStats('audit_logs');

      expect(result).toEqual(stats);
      expect(mockRedis.getJson).toHaveBeenCalledWith('query-stats:audit_logs');
    });

    it('should return null when stats not found', async () => {
      mockRedis.getJson.mockResolvedValueOnce(null);

      const result = await queryMetricsService.getStats('non_existent');

      expect(result).toBeNull();
    });
  });

  describe('getAllStats', () => {
    it('should return all available stats sorted by total queries', async () => {
      const stats1 = {
        queryType: 'audit_logs',
        totalQueries: 150,
        avgExecutionTimeMs: 200,
        maxExecutionTimeMs: 1000,
        minExecutionTimeMs: 50,
        totalRowsFetched: 7500,
        avgRowsPerQuery: 50,
        cacheHitRate: 80,
        errorRate: 1,
        lastUpdated: new Date()
      };

      const stats2 = {
        queryType: 'system_logs',
        totalQueries: 200,
        avgExecutionTimeMs: 150,
        maxExecutionTimeMs: 800,
        minExecutionTimeMs: 30,
        totalRowsFetched: 10000,
        avgRowsPerQuery: 50,
        cacheHitRate: 70,
        errorRate: 3,
        lastUpdated: new Date()
      };

      mockRedis.keys.mockResolvedValueOnce(['query-stats:audit_logs', 'query-stats:system_logs']);
      mockRedis.getJson
        .mockResolvedValueOnce(stats1)
        .mockResolvedValueOnce(stats2);

      const result = await queryMetricsService.getAllStats();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(stats2); // Higher total queries
      expect(result[1]).toEqual(stats1);
    });
  });

  describe('getRecentMetrics', () => {
    it('should return recent metrics for a query type', async () => {
      const timestamp1 = new Date('2025-01-01T10:00:00Z');
      const timestamp2 = new Date('2025-01-01T10:01:00Z');
      
      const metric1: QueryMetric = {
        queryType: 'audit_logs',
        executionTimeMs: 100,
        rowCount: 50,
        cacheHit: true,
        timestamp: timestamp1
      };

      const metric2: QueryMetric = {
        queryType: 'audit_logs',
        executionTimeMs: 200,
        rowCount: 100,
        cacheHit: false,
        timestamp: timestamp2
      };

      mockRedis.zrevrange.mockResolvedValueOnce([
        JSON.stringify(metric1),
        JSON.stringify(metric2)
      ]);

      const result = await queryMetricsService.getRecentMetrics('audit_logs', 10);

      expect(result).toHaveLength(2);
      // When JSON.stringify then JSON.parse, Date becomes string
      expect(result[0]).toEqual({
        ...metric1,
        timestamp: timestamp1.toISOString()
      });
      expect(result[1]).toEqual({
        ...metric2,
        timestamp: timestamp2.toISOString()
      });
    });
  });

  describe('getMetricsSummary', () => {
    it('should return metrics summary for specified time period', async () => {
      const now = Date.now();
      const stats = {
        queryType: 'audit_logs',
        totalQueries: 100,
        avgExecutionTimeMs: 200,
        maxExecutionTimeMs: 1000,
        minExecutionTimeMs: 50,
        totalRowsFetched: 5000,
        avgRowsPerQuery: 50,
        cacheHitRate: 75,
        errorRate: 2,
        lastUpdated: new Date()
      };

      const recentMetrics: QueryMetric[] = [
        {
          queryType: 'audit_logs',
          executionTimeMs: 1200,
          rowCount: 50,
          cacheHit: false,
          timestamp: new Date(now - 30 * 60 * 1000) // 30 minutes ago
        },
        {
          queryType: 'audit_logs',
          executionTimeMs: 800,
          rowCount: 100,
          cacheHit: true,
          timestamp: new Date(now - 45 * 60 * 1000) // 45 minutes ago
        }
      ];

      mockRedis.keys.mockResolvedValueOnce(['query-stats:audit_logs']);
      mockRedis.getJson.mockResolvedValueOnce(stats);
      mockRedis.zrevrange.mockResolvedValueOnce(
        recentMetrics.map(m => JSON.stringify(m))
      );

      const summary = await queryMetricsService.getMetricsSummary(1);

      expect(summary).toMatchObject({
        totalQueries: 2,
        slowQueries: 1,
        topQueryTypes: expect.arrayContaining([
          expect.objectContaining({
            type: 'audit_logs',
            count: 2,
            avgTime: 1000
          })
        ])
      });
    });
  });

  describe('clearMetrics', () => {
    it('should clear all metrics and stats', async () => {
      mockRedis.keys
        .mockResolvedValueOnce(['query-metrics:audit_logs', 'query-metrics:system_logs'])
        .mockResolvedValueOnce(['query-stats:audit_logs', 'query-stats:system_logs']);
      mockRedis.del.mockResolvedValueOnce(4);

      await queryMetricsService.clearMetrics();

      expect(mockRedis.del).toHaveBeenCalledWith(
        'query-metrics:audit_logs',
        'query-metrics:system_logs',
        'query-stats:audit_logs',
        'query-stats:system_logs'
      );
      expect(logger.info).toHaveBeenCalledWith('Cleared 4 metric keys');
    });
  });

  describe('exportMetrics', () => {
    it('should export metrics to CSV format', async () => {
      const timestamp1 = '2025-01-01T10:00:00.000Z'; // String format after JSON serialization
      const timestamp2 = '2025-01-01T10:01:00.000Z';
      
      // Mock what would actually be returned from Redis (serialized then parsed)
      const serializedMetrics = [
        {
          queryType: 'audit_logs',
          executionTimeMs: 100,
          rowCount: 50,
          cacheHit: true,
          timestamp: timestamp1, // String, not Date
          userId: 1
        },
        {
          queryType: 'audit_logs',
          executionTimeMs: 200,
          rowCount: 100,
          cacheHit: false,
          timestamp: timestamp2, // String, not Date
          error: 'Test error'
        }
      ];

      mockRedis.zrevrange.mockResolvedValueOnce(
        serializedMetrics.map(m => JSON.stringify(m))
      );

      const csv = await queryMetricsService.exportMetrics('audit_logs');

      expect(csv).toContain('Timestamp,Query Type,Execution Time (ms),Row Count,Cache Hit,User ID,Error');
      expect(csv).toContain('2025-01-01T10:00:00.000Z,audit_logs,100,50,Yes,1,');
      expect(csv).toContain('2025-01-01T10:01:00.000Z,audit_logs,200,100,No,,Test error');
    });

    it('should export metrics for all query types when type not specified', async () => {
      const stats = {
        queryType: 'audit_logs',
        totalQueries: 100,
        avgExecutionTimeMs: 200,
        maxExecutionTimeMs: 1000,
        minExecutionTimeMs: 50,
        totalRowsFetched: 5000,
        avgRowsPerQuery: 50,
        cacheHitRate: 75,
        errorRate: 2,
        lastUpdated: new Date()
      };

      mockRedis.keys.mockResolvedValueOnce(['query-stats:audit_logs']);
      mockRedis.getJson.mockResolvedValueOnce(stats);
      mockRedis.zrevrange.mockResolvedValueOnce([]);

      const csv = await queryMetricsService.exportMetrics();

      expect(csv).toContain('Timestamp,Query Type,Execution Time (ms),Row Count,Cache Hit,User ID,Error');
    });
  });

  describe('event emission', () => {
    it('should emit queryMetric event when recording metric', async () => {
      const metric: QueryMetric = {
        queryType: 'audit_logs',
        executionTimeMs: 100,
        rowCount: 50,
        cacheHit: true,
        timestamp: new Date()
      };

      const mockListener = jest.fn();
      queryMetricsService.on('queryMetric', mockListener);

      mockRedis.zadd.mockResolvedValueOnce(1);
      mockRedis.zremrangebyrank.mockResolvedValueOnce(0);
      mockRedis.expire.mockResolvedValueOnce(true);
      mockRedis.getJson.mockResolvedValueOnce(null);
      mockRedis.setJson.mockResolvedValueOnce(undefined);

      await queryMetricsService.recordQueryMetric(metric);

      expect(mockListener).toHaveBeenCalledWith(metric);
    });
  });
});