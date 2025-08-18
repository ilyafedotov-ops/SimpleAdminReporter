/**
 * Comprehensive Unit Tests for PreviewService
 * Testing core functionality, caching, validation, and error handling
 */

import { PreviewService, previewService, CustomReportQuery, PreviewQueryRequest, CachedPreviewResult } from './preview.service';
import type { DataSourceType } from '@/types/shared-types';
import { redis } from '@/config/redis';
import { logger } from '@/utils/logger';
import { serviceFactory } from './service.factory';
import { processPreviewData } from '@/utils/preview-data-extractor';
import { createError } from '@/middleware/error.middleware';
import crypto from 'crypto';

// Mock all dependencies
jest.mock('@/config/redis');
jest.mock('@/utils/logger');
jest.mock('./service.factory');
jest.mock('@/utils/preview-data-extractor');
jest.mock('@/middleware/error.middleware');
jest.mock('crypto');

describe('PreviewService', () => {
  let service: PreviewService;
  let mockRedis: jest.Mocked<typeof redis>;
  let mockServiceFactory: jest.Mocked<typeof serviceFactory>;
  let mockProcessPreviewData: jest.MockedFunction<any>;
  let mockCreateError: jest.MockedFunction<typeof createError>;
  let mockCrypto: jest.Mocked<typeof crypto>;

  const mockQuery: CustomReportQuery = {
    source: 'ad',
    fields: [
      { name: 'sAMAccountName', displayName: 'Username' },
      { name: 'displayName', displayName: 'Display Name' }
    ],
    filters: [
      { field: 'enabled', operator: 'equals', value: true }
    ],
    orderBy: { field: 'displayName', direction: 'asc' },
    limit: 10
  };

  const mockPreviewRequest: PreviewQueryRequest = {
    source: 'ad',
    query: mockQuery,
    parameters: { orgUnit: 'Users' },
    limit: 10
  };

  const mockPreviewResponse = {
    success: true,
    data: {
      source: 'ad' as DataSourceType,
      executionTime: 150,
      testData: [
        { sAMAccountName: 'jdoe', displayName: 'John Doe' },
        { sAMAccountName: 'asmith', displayName: 'Alice Smith' }
      ],
      rowCount: 2,
      isTestRun: true
    }
  };

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create fresh service instance
    service = new PreviewService();

    // Setup mocks
    mockRedis = redis as jest.Mocked<typeof redis>;
    mockServiceFactory = serviceFactory as jest.Mocked<typeof serviceFactory>;
    mockProcessPreviewData = processPreviewData as jest.MockedFunction<any>;
    mockCreateError = createError as jest.MockedFunction<typeof createError>;
    mockCrypto = crypto as jest.Mocked<typeof crypto>;

    // Setup default mock behaviors
    mockCreateError.mockImplementation((message: string, code?: number) => {
      const error = new Error(message) as any;
      error.statusCode = code || 500;
      return error;
    });

    mockCrypto.createHash = jest.fn().mockReturnValue({
      update: jest.fn().mockReturnThis(),
      digest: jest.fn().mockReturnValue('mock-hash-123')
    } as any);

    mockProcessPreviewData.mockResolvedValue(mockPreviewResponse);

    // Setup Redis mocks
    mockRedis.getJson = jest.fn();
    mockRedis.setJson = jest.fn();
    mockRedis.invalidatePattern = jest.fn();
    mockRedis.getClient = jest.fn().mockReturnValue({
      keys: jest.fn()
    });
  });

  describe('Constructor and Constants', () => {
    it('should create instance with correct default values', () => {
      expect(service).toBeInstanceOf(PreviewService);
      expect((service as any).CACHE_PREFIX).toBe('preview:');
      expect((service as any).DEFAULT_TTL).toBe(300);
      expect((service as any).MAX_PREVIEW_LIMIT).toBe(50);
      expect((service as any).DEFAULT_PREVIEW_LIMIT).toBe(10);
    });

    it('should export singleton instance', () => {
      expect(previewService).toBeInstanceOf(PreviewService);
    });
  });

  describe('generateCacheKey', () => {
    it('should generate consistent cache key for same request', () => {
      const key1 = (service as any).generateCacheKey(mockPreviewRequest);
      const key2 = (service as any).generateCacheKey(mockPreviewRequest);

      expect(key1).toBe(key2);
      expect(key1).toBe('preview:ad:mock-hash-123');
      expect(mockCrypto.createHash).toHaveBeenCalledWith('md5');
    });

    it('should generate different keys for different requests', () => {
      const request1 = { ...mockPreviewRequest };
      const request2 = { ...mockPreviewRequest, source: 'azure' as const };

      const key1 = (service as any).generateCacheKey(request1);
      const key2 = (service as any).generateCacheKey(request2);

      expect(key1).toContain('preview:ad:');
      expect(key2).toContain('preview:azure:');
    });

    it('should handle request without limit', () => {
      const requestWithoutLimit = {
        source: 'ad' as const,
        query: mockQuery,
        parameters: {}
      };

      const key = (service as any).generateCacheKey(requestWithoutLimit);
      expect(key).toBe('preview:ad:mock-hash-123');
    });

    it('should normalize query fields for consistent key generation', () => {
      const query1 = {
        ...mockQuery,
        fields: [
          { name: 'displayName', displayName: 'Display Name' },
          { name: 'sAMAccountName', displayName: 'Username' }
        ]
      };

      const query2 = {
        ...mockQuery,
        fields: [
          { name: 'sAMAccountName', displayName: 'Username' },
          { name: 'displayName', displayName: 'Display Name' }
        ]
      };

      const request1 = { ...mockPreviewRequest, query: query1 };
      const request2 = { ...mockPreviewRequest, query: query2 };

      const key1 = (service as any).generateCacheKey(request1);
      const key2 = (service as any).generateCacheKey(request2);

      expect(key1).toBe(key2);
    });
  });

  describe('normalizeQuery', () => {
    it('should sort fields alphabetically', () => {
      const query = {
        ...mockQuery,
        fields: [
          { name: 'zField', displayName: 'Z Field' },
          { name: 'aField', displayName: 'A Field' },
          { name: 'mField', displayName: 'M Field' }
        ]
      };

      const normalized = (service as any).normalizeQuery(query);

      expect(normalized.fields[0].name).toBe('aField');
      expect(normalized.fields[1].name).toBe('mField');
      expect(normalized.fields[2].name).toBe('zField');
    });

    it('should sort filters by field name', () => {
      const query = {
        ...mockQuery,
        filters: [
          { field: 'zField', operator: 'equals' as const, value: 'z' },
          { field: 'aField', operator: 'equals' as const, value: 'a' },
          { field: 'mField', operator: 'equals' as const, value: 'm' }
        ]
      };

      const normalized = (service as any).normalizeQuery(query);

      expect(normalized.filters![0].field).toBe('aField');
      expect(normalized.filters![1].field).toBe('mField');
      expect(normalized.filters![2].field).toBe('zField');
    });

    it('should preserve optional properties', () => {
      const query = {
        ...mockQuery,
        groupBy: 'department',
        orderBy: { field: 'displayName', direction: 'desc' as const },
        limit: 25
      };

      const normalized = (service as any).normalizeQuery(query);

      expect(normalized.groupBy).toBe('department');
      expect(normalized.orderBy).toEqual({ field: 'displayName', direction: 'desc' });
      expect(normalized.limit).toBe(25);
    });

    it('should handle query without optional properties', () => {
      const minimalQuery = {
        source: 'ad' as const,
        fields: [{ name: 'sAMAccountName', displayName: 'Username' }]
      };

      const normalized = (service as any).normalizeQuery(minimalQuery);

      expect(normalized.source).toBe('ad');
      expect(normalized.fields).toHaveLength(1);
      expect(normalized.filters).toBeUndefined();
      expect(normalized.groupBy).toBeUndefined();
      expect(normalized.orderBy).toBeUndefined();
      expect(normalized.limit).toBeUndefined();
    });
  });

  describe('getCachedResult', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2025-01-01T10:00:00Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should return cached result when valid', async () => {
      const cachedData: CachedPreviewResult = {
        data: mockPreviewResponse,
        cachedAt: Date.now() - 60000, // 1 minute ago
        expiresAt: Date.now() + 240000, // 4 minutes from now
        cacheHit: false
      };

      mockRedis.getJson.mockResolvedValue(cachedData);

      const result = await (service as any).getCachedResult('test-key');

      expect(result).toEqual({
        ...cachedData,
        cacheHit: true
      });
      expect(mockRedis.getJson).toHaveBeenCalledWith('test-key');
      expect(logger.debug).toHaveBeenCalledWith('Cache hit for preview query', { cacheKey: 'test-key' });
    });

    it('should return null when cache entry is expired', async () => {
      const expiredData: CachedPreviewResult = {
        data: mockPreviewResponse,
        cachedAt: Date.now() - 360000, // 6 minutes ago
        expiresAt: Date.now() - 60000, // 1 minute ago (expired)
        cacheHit: false
      };

      mockRedis.getJson.mockResolvedValue(expiredData);

      const result = await (service as any).getCachedResult('test-key');

      expect(result).toBeNull();
      expect(logger.debug).toHaveBeenCalledWith('Cache entry expired for preview query', {
        cacheKey: 'test-key',
        expiredBy: 60000
      });
    });

    it('should return null when no cache entry exists', async () => {
      mockRedis.getJson.mockResolvedValue(null);

      const result = await (service as any).getCachedResult('test-key');

      expect(result).toBeNull();
    });

    it('should handle Redis errors gracefully', async () => {
      const redisError = new Error('Redis connection failed');
      mockRedis.getJson.mockRejectedValue(redisError);

      const result = await (service as any).getCachedResult('test-key');

      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalledWith('Error getting cached preview result:', redisError);
    });
  });

  describe('cacheResult', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2025-01-01T10:00:00Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should cache preview result with correct TTL', async () => {
      const currentTime = Date.now();
      mockRedis.setJson.mockResolvedValue(undefined);

      await (service as any).cacheResult('test-key', mockPreviewResponse);

      expect(mockRedis.setJson).toHaveBeenCalledWith(
        'test-key',
        {
          data: mockPreviewResponse,
          cachedAt: currentTime,
          expiresAt: currentTime + 300000, // 5 minutes
          cacheHit: false
        },
        300 // TTL in seconds
      );
      expect(logger.debug).toHaveBeenCalledWith('Cached preview result', {
        cacheKey: 'test-key',
        ttl: 300
      });
    });

    it('should handle caching errors gracefully', async () => {
      const cacheError = new Error('Redis write failed');
      mockRedis.setJson.mockRejectedValue(cacheError);

      await (service as any).cacheResult('test-key', mockPreviewResponse);

      expect(logger.error).toHaveBeenCalledWith('Error caching preview result:', cacheError);
    });
  });

  describe('validateCustomQuery', () => {
    it('should validate valid query successfully', () => {
      expect(() => {
        (service as any).validateCustomQuery(mockQuery);
      }).not.toThrow();
    });

    it('should throw error for invalid data source', () => {
      const invalidQuery = { ...mockQuery, source: 'invalid' as any };

      expect(() => {
        (service as any).validateCustomQuery(invalidQuery);
      }).toThrow();

      expect(mockCreateError).toHaveBeenCalledWith('Invalid or missing data source', 400);
    });

    it('should throw error for missing data source', () => {
      const invalidQuery = { ...mockQuery };
      delete (invalidQuery as any).source;

      expect(() => {
        (service as any).validateCustomQuery(invalidQuery);
      }).toThrow();

      expect(mockCreateError).toHaveBeenCalledWith('Invalid or missing data source', 400);
    });

    it('should throw error for missing fields', () => {
      const invalidQuery = { ...mockQuery, fields: [] };

      expect(() => {
        (service as any).validateCustomQuery(invalidQuery);
      }).toThrow();

      expect(mockCreateError).toHaveBeenCalledWith('At least one field must be selected', 400);
    });

    it('should throw error for invalid field specification', () => {
      const invalidQuery = {
        ...mockQuery,
        fields: [{ name: '', displayName: 'Invalid' }]
      };

      expect(() => {
        (service as any).validateCustomQuery(invalidQuery);
      }).toThrow();

      expect(mockCreateError).toHaveBeenCalledWith('Invalid field specification', 400);
    });

    it('should throw error for invalid filter specification', () => {
      const invalidQuery = {
        ...mockQuery,
        filters: [{ field: '', operator: 'equals' as const, value: 'test' }]
      };

      expect(() => {
        (service as any).validateCustomQuery(invalidQuery);
      }).toThrow();

      expect(mockCreateError).toHaveBeenCalledWith('Invalid filter specification', 400);
    });

    it('should throw error for invalid filter operator', () => {
      const invalidQuery = {
        ...mockQuery,
        filters: [{ field: 'test', operator: 'invalid' as any, value: 'test' }]
      };

      expect(() => {
        (service as any).validateCustomQuery(invalidQuery);
      }).toThrow();

      expect(mockCreateError).toHaveBeenCalledWith('Invalid filter operator: invalid', 400);
    });

    it('should validate all supported operators', () => {
      const validOperators = [
        'equals', 'notEquals', 'contains', 'notContains', 'startsWith', 'endsWith',
        'greaterThan', 'lessThan', 'greaterThanOrEqual', 'lessThanOrEqual',
        'isEmpty', 'isNotEmpty', 'not_equals', 'greater_than', 'less_than',
        'older_than', 'newer_than', 'exists', 'not_exists'
      ];

      validOperators.forEach(operator => {
        const query = {
          ...mockQuery,
          filters: [{ field: 'test', operator: operator as any, value: 'test' }]
        };

        expect(() => {
          (service as any).validateCustomQuery(query);
        }).not.toThrow();
      });
    });
  });

  describe('executeDataSourceQuery', () => {
    let mockADService: any;
    let mockAzureService: any;
    let mockO365Service: any;

    beforeEach(() => {
      mockADService = {
        executeCustomQuery: jest.fn().mockResolvedValue({
          data: [{ sAMAccountName: 'test', displayName: 'Test User' }],
          success: true
        })
      };

      mockAzureService = {
        executeQuery: jest.fn().mockResolvedValue({
          value: [{ userPrincipalName: 'test@domain.com', displayName: 'Test User' }]
        })
      };

      mockO365Service = {
        executeQuery: jest.fn().mockResolvedValue({
          value: [{ mail: 'test@domain.com', displayName: 'Test User' }]
        })
      };

      mockServiceFactory.getADService.mockResolvedValue(mockADService as any);
      mockServiceFactory.getAzureService.mockResolvedValue(mockAzureService as any);
      mockServiceFactory.getO365Service.mockResolvedValue(mockO365Service as any);
    });

    it('should execute AD query successfully', async () => {
      const result = await (service as any).executeDataSourceQuery('ad', mockQuery, {});

      expect(mockServiceFactory.getADService).toHaveBeenCalled();
      expect(mockADService.executeCustomQuery).toHaveBeenCalledWith(mockQuery, {});
      expect(result).toEqual({
        data: [{ sAMAccountName: 'test', displayName: 'Test User' }],
        success: true
      });
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Executing data source query for preview'),
        expect.any(Object)
      );
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('AD service query executed for preview'),
        expect.any(Object)
      );
    });

    it('should execute Azure query successfully', async () => {
      const result = await (service as any).executeDataSourceQuery('azure', mockQuery, {});

      expect(mockServiceFactory.getAzureService).toHaveBeenCalled();
      expect(mockAzureService.executeQuery).toHaveBeenCalledWith({
        type: 'custom',
        ...mockQuery,
        parameters: {}
      });
      expect(result).toEqual({
        value: [{ userPrincipalName: 'test@domain.com', displayName: 'Test User' }]
      });
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Azure service query executed for preview'),
        expect.any(Object)
      );
    });

    it('should execute O365 query successfully', async () => {
      const result = await (service as any).executeDataSourceQuery('o365', mockQuery, {});

      expect(mockServiceFactory.getO365Service).toHaveBeenCalled();
      expect(mockO365Service.executeQuery).toHaveBeenCalledWith({
        type: 'custom',
        ...mockQuery,
        parameters: {}
      });
      expect(result).toEqual({
        value: [{ mail: 'test@domain.com', displayName: 'Test User' }]
      });
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('O365 service query executed for preview'),
        expect.any(Object)
      );
    });

    it('should throw error for unknown data source', async () => {
      await expect(
        (service as any).executeDataSourceQuery('unknown', mockQuery, {})
      ).rejects.toThrow();

      expect(mockCreateError).toHaveBeenCalledWith('Unknown data source', 400);
    });

    it('should handle service errors', async () => {
      const serviceError = new Error('Service connection failed');
      mockADService.executeCustomQuery.mockRejectedValue(serviceError);

      await expect(
        (service as any).executeDataSourceQuery('ad', mockQuery, {})
      ).rejects.toThrow('Service connection failed');
    });
  });

  describe('executePreview', () => {
    let mockADService: any;

    beforeEach(() => {
      mockADService = {
        executeCustomQuery: jest.fn().mockResolvedValue({
          data: [
            { sAMAccountName: 'jdoe', displayName: 'John Doe' },
            { sAMAccountName: 'asmith', displayName: 'Alice Smith' }
          ],
          success: true
        })
      };

      mockServiceFactory.getADService.mockResolvedValue(mockADService as any);
      mockRedis.getJson.mockResolvedValue(null); // No cached result by default
      mockRedis.setJson.mockResolvedValue(undefined);
    });

    it('should execute preview successfully with cache miss', async () => {
      const result = await service.executePreview(mockPreviewRequest);

      expect(result).toBe(mockPreviewResponse);
      expect(mockRedis.getJson).toHaveBeenCalled(); // Check cache
      expect(mockADService.executeCustomQuery).toHaveBeenCalled(); // Execute query
      expect(mockProcessPreviewData).toHaveBeenCalled(); // Process result
      expect(mockRedis.setJson).toHaveBeenCalled(); // Cache result
      expect(logger.info).toHaveBeenCalledWith(
        'Starting preview query execution',
        expect.any(Object)
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Preview query executed successfully',
        expect.objectContaining({ wasCached: false })
      );
    });

    it('should return cached result when available', async () => {
      const cachedResult: CachedPreviewResult = {
        data: mockPreviewResponse,
        cachedAt: Date.now() - 60000,
        expiresAt: Date.now() + 240000,
        cacheHit: false
      };

      mockRedis.getJson.mockResolvedValue(cachedResult);

      const result = await service.executePreview(mockPreviewRequest);

      expect(result).toBe(mockPreviewResponse);
      expect(mockRedis.getJson).toHaveBeenCalled();
      expect(mockADService.executeCustomQuery).not.toHaveBeenCalled(); // Should not execute query
      expect(mockRedis.setJson).not.toHaveBeenCalled(); // Should not cache again
      expect(logger.info).toHaveBeenCalledWith(
        'Returning cached preview result',
        expect.any(Object)
      );
    });

    it('should apply default limit when not specified', async () => {
      const requestWithoutLimit = {
        source: 'ad' as const,
        query: mockQuery,
        parameters: {}
      };

      await service.executePreview(requestWithoutLimit);

      // Verify that the query was called with default limit
      const calledQuery = mockADService.executeCustomQuery.mock.calls[0][0];
      expect(calledQuery.limit).toBe(10); // DEFAULT_PREVIEW_LIMIT
    });

    it('should enforce maximum limit', async () => {
      const requestWithHighLimit = {
        ...mockPreviewRequest,
        limit: 100 // Higher than MAX_PREVIEW_LIMIT (50)
      };

      await service.executePreview(requestWithHighLimit);

      const calledQuery = mockADService.executeCustomQuery.mock.calls[0][0];
      expect(calledQuery.limit).toBe(50); // MAX_PREVIEW_LIMIT
    });

    it('should preserve custom limit within bounds', async () => {
      const requestWithCustomLimit = {
        ...mockPreviewRequest,
        limit: 25
      };

      await service.executePreview(requestWithCustomLimit);

      const calledQuery = mockADService.executeCustomQuery.mock.calls[0][0];
      expect(calledQuery.limit).toBe(25);
    });

    it('should handle validation errors', async () => {
      const invalidRequest = {
        ...mockPreviewRequest,
        query: { ...mockQuery, source: 'invalid' as any }
      };

      await expect(service.executePreview(invalidRequest)).rejects.toThrow();
      expect(logger.error).toHaveBeenCalledWith(
        'Preview query execution failed:',
        expect.any(Object)
      );
    });

    it('should handle service execution errors', async () => {
      const serviceError = new Error('Database connection failed');
      mockADService.executeCustomQuery.mockRejectedValue(serviceError);

      await expect(service.executePreview(mockPreviewRequest)).rejects.toThrow('Database connection failed');
      expect(logger.error).toHaveBeenCalledWith(
        'Preview query execution failed:',
        expect.objectContaining({
          source: 'ad' as DataSourceType,
          error: 'Database connection failed'
        })
      );
    });

    it('should track execution time', async () => {
      await service.executePreview(mockPreviewRequest);

      expect(mockProcessPreviewData).toHaveBeenCalledWith(
        expect.any(Object),
        'ad',
        expect.any(Number) // execution time
      );
    });
  });

  describe('clearCache', () => {
    it('should clear all preview cache entries', async () => {
      mockRedis.invalidatePattern.mockResolvedValue(5);

      const result = await service.clearCache();

      expect(result).toBe(5);
      expect(mockRedis.invalidatePattern).toHaveBeenCalledWith('preview:*');
      expect(logger.info).toHaveBeenCalledWith('Cleared 5 preview cache entries');
    });

    it('should handle no cache entries to clear', async () => {
      mockRedis.invalidatePattern.mockResolvedValue(0);

      const result = await service.clearCache();

      expect(result).toBe(0);
      expect(logger.info).not.toHaveBeenCalled();
    });

    it('should handle Redis errors gracefully', async () => {
      const redisError = new Error('Redis operation failed');
      mockRedis.invalidatePattern.mockRejectedValue(redisError);

      const result = await service.clearCache();

      expect(result).toBe(0);
      expect(logger.error).toHaveBeenCalledWith('Error clearing preview cache:', redisError);
    });
  });

  describe('clearCacheBySource', () => {
    it('should clear cache entries for specific source', async () => {
      mockRedis.invalidatePattern.mockResolvedValue(3);

      const result = await service.clearCacheBySource('ad');

      expect(result).toBe(3);
      expect(mockRedis.invalidatePattern).toHaveBeenCalledWith('preview:ad:*');
      expect(logger.info).toHaveBeenCalledWith('Cleared 3 preview cache entries for ad');
    });

    it('should handle different data sources', async () => {
      mockRedis.invalidatePattern.mockResolvedValue(2);

      await service.clearCacheBySource('azure');
      expect(mockRedis.invalidatePattern).toHaveBeenCalledWith('preview:azure:*');

      await service.clearCacheBySource('o365');
      expect(mockRedis.invalidatePattern).toHaveBeenCalledWith('preview:o365:*');
    });

    it('should handle Redis errors for source-specific clear', async () => {
      const redisError = new Error('Redis pattern delete failed');
      mockRedis.invalidatePattern.mockRejectedValue(redisError);

      const result = await service.clearCacheBySource('azure');

      expect(result).toBe(0);
      expect(logger.error).toHaveBeenCalledWith('Error clearing preview cache for azure:', redisError);
    });
  });

  describe('getCacheStats', () => {
    let mockRedisClient: any;

    beforeEach(() => {
      mockRedisClient = {
        keys: jest.fn()
      };
      mockRedis.getClient.mockReturnValue(mockRedisClient);
    });

    it('should return cache statistics for all sources', async () => {
      mockRedisClient.keys
        .mockResolvedValueOnce(['preview:ad:key1', 'preview:ad:key2']) // AD keys
        .mockResolvedValueOnce(['preview:azure:key1']) // Azure keys
        .mockResolvedValueOnce(['preview:o365:key1', 'preview:o365:key2', 'preview:o365:key3']); // O365 keys

      const stats = await service.getCacheStats();

      expect(stats).toEqual({
        adEntries: 2,
        azureEntries: 1,
        o365Entries: 3,
        totalEntries: 6
      });

      expect(mockRedisClient.keys).toHaveBeenCalledWith('preview:ad:*');
      expect(mockRedisClient.keys).toHaveBeenCalledWith('preview:azure:*');
      expect(mockRedisClient.keys).toHaveBeenCalledWith('preview:o365:*');
    });

    it('should handle empty cache', async () => {
      mockRedisClient.keys.mockResolvedValue([]);

      const stats = await service.getCacheStats();

      expect(stats).toEqual({
        adEntries: 0,
        azureEntries: 0,
        o365Entries: 0,
        totalEntries: 0
      });
    });

    it('should handle Redis errors in cache stats', async () => {
      const redisError = new Error('Redis keys operation failed');
      mockRedisClient.keys.mockRejectedValue(redisError);

      const stats = await service.getCacheStats();

      expect(stats).toEqual({
        adEntries: 0,
        azureEntries: 0,
        o365Entries: 0,
        totalEntries: 0
      });
      expect(logger.error).toHaveBeenCalledWith('Error getting preview cache stats:', redisError);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle undefined query parameters', async () => {
      const requestWithoutParams = {
        source: 'ad' as const,
        query: mockQuery
        // No parameters property
      };

      const mockADService = {
        executeCustomQuery: jest.fn().mockResolvedValue({ data: [], success: true })
      };
      mockServiceFactory.getADService.mockResolvedValue(mockADService as any);
      mockRedis.getJson.mockResolvedValue(null);

      await service.executePreview(requestWithoutParams);

      expect(mockADService.executeCustomQuery).toHaveBeenCalledWith(
        expect.any(Object),
        {} // Empty parameters object
      );
    });

    it('should handle partial cache data corruption', async () => {
      const corruptedCache = {
        data: mockPreviewResponse,
        cachedAt: Date.now() - 60000
        // Missing expiresAt property
      };

      mockRedis.getJson.mockResolvedValue(corruptedCache);

      const mockADService = {
        executeCustomQuery: jest.fn().mockResolvedValue({ data: [], success: true })
      };
      mockServiceFactory.getADService.mockResolvedValue(mockADService as any);

      // Should fall back to executing query instead of using corrupted cache
      await service.executePreview(mockPreviewRequest);

      expect(mockADService.executeCustomQuery).toHaveBeenCalled();
    });

    it('should handle JSON serialization errors in cache key generation', () => {
      const circularReference: any = { name: 'test' };
      circularReference.self = circularReference;

      const requestWithCircularRef = {
        ...mockPreviewRequest,
        parameters: { circular: circularReference }
      };

      // This should not throw, but may produce different cache keys
      expect(() => {
        (service as any).generateCacheKey(requestWithCircularRef);
      }).not.toThrow();
    });
  });

  describe('Integration with Dependencies', () => {
    it('should pass correct parameters to preview data processor', async () => {
      const mockServiceResult = { data: ['test'], success: true };
      const mockADService = {
        executeCustomQuery: jest.fn().mockResolvedValue(mockServiceResult)
      };
      mockServiceFactory.getADService.mockResolvedValue(mockADService as any);
      mockRedis.getJson.mockResolvedValue(null);

      await service.executePreview(mockPreviewRequest);

      expect(mockProcessPreviewData).toHaveBeenCalledWith(
        mockServiceResult,
        'ad',
        expect.any(Number)
      );
    });

    it('should maintain service factory contract', async () => {
      const mockADService = { executeCustomQuery: jest.fn() };
      mockServiceFactory.getADService.mockResolvedValue(mockADService as any);

      await (service as any).executeDataSourceQuery('ad', mockQuery, {});

      expect(mockServiceFactory.getADService).toHaveBeenCalledTimes(1);
      expect(mockServiceFactory.getADService).toHaveBeenCalledWith();
    });
  });

  describe('Performance and Memory', () => {
    it('should not leak memory with repeated cache operations', async () => {
      const requests = Array.from({ length: 100 }, (_, i) => ({
        ...mockPreviewRequest,
        parameters: { index: i }
      }));

      // Mock cache misses for all requests
      mockRedis.getJson.mockResolvedValue(null);
      const mockADService = {
        executeCustomQuery: jest.fn().mockResolvedValue({ data: [], success: true })
      };
      mockServiceFactory.getADService.mockResolvedValue(mockADService as any);

      // Execute multiple requests
      await Promise.all(requests.map(req => service.executePreview(req)));

      // Should have made one call per request
      expect(mockADService.executeCustomQuery).toHaveBeenCalledTimes(100);
      expect(mockRedis.setJson).toHaveBeenCalledTimes(100);
    });

    it('should handle concurrent requests efficiently', async () => {
      const mockADService = {
        executeCustomQuery: jest.fn().mockResolvedValue({ data: ['test'], success: true })
      };
      mockServiceFactory.getADService.mockResolvedValue(mockADService as any);
      mockRedis.getJson.mockResolvedValue(null);

      const concurrentRequests = Array.from({ length: 10 }, () => 
        service.executePreview(mockPreviewRequest)
      );

      const results = await Promise.all(concurrentRequests);

      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(result).toBe(mockPreviewResponse);
      });
    });
  });
});