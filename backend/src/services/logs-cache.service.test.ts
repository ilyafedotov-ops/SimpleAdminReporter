import { LogsCacheService } from './logs-cache.service';
import { redis } from '@/config/redis';
import { LogQueryParams } from './logs.service';

jest.mock('@/config/redis');
jest.mock('@/utils/logger');

describe('LogsCacheService', () => {
  let logsCacheService: LogsCacheService;
  const mockRedis = redis as jest.Mocked<typeof redis>;

  beforeEach(() => {
    jest.clearAllMocks();
    logsCacheService = new LogsCacheService();
  });

  describe('generateCacheKey', () => {
    it('should generate consistent cache keys for same parameters', () => {
      const params1: LogQueryParams = { type: 'audit', page: 1, pageSize: 50 };
      const params2: LogQueryParams = { pageSize: 50, type: 'audit', page: 1 };

      // Access private method through any type
      const key1 = (logsCacheService as any).generateCacheKey('audit', params1);
      const key2 = (logsCacheService as any).generateCacheKey('audit', params2);

      expect(key1).toBe(key2);
    });

    it('should generate different keys for different parameters', () => {
      const params1: LogQueryParams = { type: 'audit', page: 1 };
      const params2: LogQueryParams = { type: 'audit', page: 2 };

      const key1 = (logsCacheService as any).generateCacheKey('audit', params1);
      const key2 = (logsCacheService as any).generateCacheKey('audit', params2);

      expect(key1).not.toBe(key2);
    });
  });

  describe('getCachedAuditLogs', () => {
    it('should return cached data when available and not expired', async () => {
      const cachedData = {
        data: { logs: [{ id: 1 }], total: 1 },
        cachedAt: Date.now() - 1000,
        expiresAt: Date.now() + 10000
      };

      mockRedis.getJson.mockResolvedValueOnce(cachedData);

      const result = await logsCacheService.getCachedAuditLogs({ type: 'audit' }, 0);

      expect(result).toEqual(cachedData);
      expect(mockRedis.getJson).toHaveBeenCalled();
    });

    it('should return null when cache is expired', async () => {
      const cachedData = {
        data: { logs: [{ id: 1 }], total: 1 },
        cachedAt: Date.now() - 10000,
        expiresAt: Date.now() - 1000 // Expired
      };

      mockRedis.getJson.mockResolvedValueOnce(cachedData);

      const result = await logsCacheService.getCachedAuditLogs({ type: 'audit' }, 0);

      expect(result).toBeNull();
    });

    it('should return null when no cache exists', async () => {
      mockRedis.getJson.mockResolvedValueOnce(null);

      const result = await logsCacheService.getCachedAuditLogs({ type: 'audit' }, 0);

      expect(result).toBeNull();
    });
  });

  describe('cacheAuditLogs', () => {
    it('should cache audit logs with default TTL', async () => {
      const data = { logs: [{ id: 1 }], total: 1 };
      const params = { type: 'audit' as const };

      await logsCacheService.cacheAuditLogs(params, 0, data);

      expect(mockRedis.setJson).toHaveBeenCalledWith(
        expect.stringContaining('logs:audit:'),
        expect.objectContaining({
          data,
          cachedAt: expect.any(Number),
          expiresAt: expect.any(Number)
        }),
        300 // Default TTL
      );
    });

    it('should cache audit logs with custom TTL', async () => {
      const data = { logs: [{ id: 1 }], total: 1 };
      const params = { type: 'audit' as const };
      const customTTL = 600;

      await logsCacheService.cacheAuditLogs(params, 0, data, customTTL);

      expect(mockRedis.setJson).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        customTTL
      );
    });
  });

  describe('invalidateAll', () => {
    it('should invalidate all logs cache entries', async () => {
      mockRedis.invalidatePattern.mockResolvedValueOnce(10);

      await logsCacheService.invalidateAll();

      expect(mockRedis.invalidatePattern).toHaveBeenCalledWith('logs:*');
    });
  });

  describe('invalidateByType', () => {
    it('should invalidate cache for specific type', async () => {
      mockRedis.invalidatePattern.mockResolvedValueOnce(5);

      await logsCacheService.invalidateByType('audit');

      expect(mockRedis.invalidatePattern).toHaveBeenCalledWith('logs:audit:*');
    });
  });

  describe('getCacheStats', () => {
    it('should return cache statistics', async () => {
      const mockClient = {
        keys: jest.fn()
          .mockResolvedValueOnce(['logs:audit:1', 'logs:audit:2'])
          .mockResolvedValueOnce(['logs:system:1'])
          .mockResolvedValueOnce(['logs:stats:1'])
      };

      mockRedis.getClient.mockReturnValue(mockClient as any);

      const stats = await logsCacheService.getCacheStats();

      expect(stats).toEqual({
        auditEntries: 2,
        systemEntries: 1,
        statsEntries: 1,
        totalSize: 4
      });
    });

    it('should handle errors gracefully', async () => {
      mockRedis.getClient.mockImplementation(() => {
        throw new Error('Redis error');
      });

      const stats = await logsCacheService.getCacheStats();

      expect(stats).toEqual({
        auditEntries: 0,
        systemEntries: 0,
        statsEntries: 0,
        totalSize: 0
      });
    });
  });

  describe('evictOldestIfNeeded', () => {
    it('should evict oldest entries when cache size exceeds limit', async () => {
      const mockClient = {
        keys: jest.fn().mockResolvedValueOnce(Array(105).fill('logs:test:'))
      };

      mockRedis.getClient.mockReturnValue(mockClient as any);
      mockRedis.getJson.mockResolvedValue({
        data: {},
        cachedAt: Date.now(),
        expiresAt: Date.now() + 1000
      });

      // Call through cacheAuditLogs which triggers eviction
      await logsCacheService.cacheAuditLogs({ type: 'audit' }, 0, {});

      // Should check keys and potentially delete some
      expect(mockClient.keys).toHaveBeenCalled();
    });
  });

  describe('getCachedStats', () => {
    it('should return cached stats when available', async () => {
      const cachedStats = {
        data: { errorCount: 10, totalCount: 100 },
        cachedAt: Date.now() - 30000,
        expiresAt: Date.now() + 30000
      };

      mockRedis.getJson.mockResolvedValueOnce(cachedStats);

      const result = await logsCacheService.getCachedStats('24h');

      expect(result).toEqual(cachedStats);
    });

    it('should cache stats with correct TTL', async () => {
      const statsData = { errorCount: 10, totalCount: 100 };

      await logsCacheService.cacheStats('24h', statsData);

      expect(mockRedis.setJson).toHaveBeenCalledWith(
        'logs:stats:24h',
        expect.objectContaining({
          data: statsData,
          cachedAt: expect.any(Number),
          expiresAt: expect.any(Number)
        }),
        60 // Stats TTL
      );
    });
  });
});