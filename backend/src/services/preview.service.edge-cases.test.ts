/**
 * Edge Case Tests for PreviewService
 * Testing error conditions, boundary cases, and exceptional scenarios
 */

import { PreviewService } from './preview.service';
import { redis } from '@/config/redis';
import { logger } from '@/utils/logger';
import { serviceFactory } from './service.factory';
import { processPreviewData } from '@/utils/preview-data-extractor';
import { createError } from '@/middleware/error.middleware';

// Mock all dependencies
jest.mock('@/config/redis');
jest.mock('@/utils/logger');
jest.mock('./service.factory');
jest.mock('@/utils/preview-data-extractor');
jest.mock('@/middleware/error.middleware');

describe('PreviewService - Edge Cases and Error Conditions', () => {
  let service: PreviewService;
  let mockRedis: jest.Mocked<typeof redis>;
  let mockServiceFactory: jest.Mocked<typeof serviceFactory>;
  let mockProcessPreviewData: jest.MockedFunction<any>;
  let mockCreateError: jest.MockedFunction<typeof createError>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    service = new PreviewService();
    
    mockRedis = redis as jest.Mocked<typeof redis>;
    mockServiceFactory = serviceFactory as jest.Mocked<typeof serviceFactory>;
    mockProcessPreviewData = processPreviewData as jest.MockedFunction<any>;
    mockCreateError = createError as jest.MockedFunction<typeof createError>;

    // Setup default mocks
    mockCreateError.mockImplementation((message: string, code?: number) => {
      const error = new Error(message) as any;
      error.statusCode = code || 500;
      return error;
    });

    mockRedis.getJson = jest.fn().mockResolvedValue(null);
    mockRedis.setJson = jest.fn().mockResolvedValue(undefined);
    mockRedis.invalidatePattern = jest.fn().mockResolvedValue(0);
    mockRedis.getClient = jest.fn().mockReturnValue({
      keys: jest.fn().mockResolvedValue([])
    });
  });

  describe('Query Validation Edge Cases', () => {
    it('should reject null source', async () => {
      const invalidRequest = {
        source: null as any,
        query: {
          source: null as any,
          fields: [{ name: 'test', displayName: 'Test' }]
        }
      };

      await expect(service.executePreview(invalidRequest)).rejects.toThrow();
      expect(mockCreateError).toHaveBeenCalledWith('Invalid or missing data source', 400);
    });

    it('should reject undefined source', async () => {
      const invalidRequest = {
        source: undefined as any,
        query: {
          source: undefined as any,
          fields: [{ name: 'test', displayName: 'Test' }]
        }
      };

      await expect(service.executePreview(invalidRequest)).rejects.toThrow();
      expect(mockCreateError).toHaveBeenCalledWith('Invalid or missing data source', 400);
    });

    it('should reject empty string source', async () => {
      const invalidRequest = {
        source: '' as any,
        query: {
          source: '' as any,
          fields: [{ name: 'test', displayName: 'Test' }]
        }
      };

      await expect(service.executePreview(invalidRequest)).rejects.toThrow();
      expect(mockCreateError).toHaveBeenCalledWith('Invalid or missing data source', 400);
    });

    it('should reject unsupported data sources', async () => {
      const unsupportedSources = ['ldap', 'sql', 'mongodb', 'elasticsearch', 'invalid'];
      
      for (const source of unsupportedSources) {
        const invalidRequest = {
          source: source as any,
          query: {
            source: source as any,
            fields: [{ name: 'test', displayName: 'Test' }]
          }
        };

        await expect(service.executePreview(invalidRequest)).rejects.toThrow();
        expect(mockCreateError).toHaveBeenCalledWith('Invalid or missing data source', 400);
      }
    });

    it('should reject null fields array', async () => {
      const invalidRequest = {
        source: 'ad' as const,
        query: {
          source: 'ad' as const,
          fields: null as any
        }
      };

      try {
        await service.executePreview(invalidRequest);
        fail('Expected executePreview to throw');
      } catch (error) {
        // Let's see what error is actually thrown
        expect(mockCreateError).toHaveBeenCalledWith('At least one field must be selected', 400);
      }
    });

    it('should reject undefined fields array', async () => {
      const invalidRequest = {
        source: 'ad' as const,
        query: {
          source: 'ad' as const,
          fields: undefined as any
        }
      };

      await expect(service.executePreview(invalidRequest)).rejects.toThrow();
      expect(mockCreateError).toHaveBeenCalledWith('At least one field must be selected', 400);
    });

    it('should reject non-array fields', async () => {
      const invalidRequest = {
        source: 'ad' as const,
        query: {
          source: 'ad' as const,
          fields: 'not_an_array' as any
        }
      };

      await expect(service.executePreview(invalidRequest)).rejects.toThrow();
      expect(mockCreateError).toHaveBeenCalledWith('At least one field must be selected', 400);
    });

    it('should reject fields with null name', async () => {
      const invalidRequest = {
        source: 'ad' as const,
        query: {
          source: 'ad' as const,
          fields: [{ name: null as any, displayName: 'Test' }]
        }
      };

      await expect(service.executePreview(invalidRequest)).rejects.toThrow();
      expect(mockCreateError).toHaveBeenCalledWith('Invalid field specification', 400);
    });

    it('should reject fields with undefined name', async () => {
      const invalidRequest = {
        source: 'ad' as const,
        query: {
          source: 'ad' as const,
          fields: [{ name: undefined as any, displayName: 'Test' }]
        }
      };

      await expect(service.executePreview(invalidRequest)).rejects.toThrow();
      expect(mockCreateError).toHaveBeenCalledWith('Invalid field specification', 400);
    });

    it('should reject fields with non-string name', async () => {
      const invalidRequest = {
        source: 'ad' as const,
        query: {
          source: 'ad' as const,
          fields: [{ name: 123 as any, displayName: 'Test' }]
        }
      };

      await expect(service.executePreview(invalidRequest)).rejects.toThrow();
      expect(mockCreateError).toHaveBeenCalledWith('Invalid field specification', 400);
    });

    it('should reject filters with missing field', async () => {
      const invalidRequest = {
        source: 'ad' as const,
        query: {
          source: 'ad' as const,
          fields: [{ name: 'test', displayName: 'Test' }],
          filters: [{ field: null as any, operator: 'equals' as const, value: 'test' }]
        }
      };

      await expect(service.executePreview(invalidRequest)).rejects.toThrow();
      expect(mockCreateError).toHaveBeenCalledWith('Invalid filter specification', 400);
    });

    it('should reject filters with missing operator', async () => {
      const invalidRequest = {
        source: 'ad' as const,
        query: {
          source: 'ad' as const,
          fields: [{ name: 'test', displayName: 'Test' }],
          filters: [{ field: 'test', operator: null as any, value: 'test' }]
        }
      };

      await expect(service.executePreview(invalidRequest)).rejects.toThrow();
      expect(mockCreateError).toHaveBeenCalledWith('Invalid filter specification', 400);
    });

    it('should reject unsupported filter operators', async () => {
      const invalidOperators = ['LIKE', 'NOT_LIKE', 'REGEX', 'BETWEEN', 'IN_LIST', 'custom_op'];
      
      for (const operator of invalidOperators) {
        const invalidRequest = {
          source: 'ad' as const,
          query: {
            source: 'ad' as const,
            fields: [{ name: 'test', displayName: 'Test' }],
            filters: [{ field: 'test', operator: operator as any, value: 'test' }]
          }
        };

        await expect(service.executePreview(invalidRequest)).rejects.toThrow();
        expect(mockCreateError).toHaveBeenCalledWith(`Invalid filter operator: ${operator}`, 400);
      }
    });

    it('should handle malformed query object', async () => {
      const malformedQueries = [
        null,
        undefined,
        'string',
        123,
        [],
        { invalidProperty: 'test' }
      ];

      for (const malformedQuery of malformedQueries) {
        const invalidRequest = {
          source: 'ad' as const,
          query: malformedQuery as any
        };

        await expect(service.executePreview(invalidRequest)).rejects.toThrow();
      }
    });
  });

  describe('Service Integration Error Cases', () => {
    it('should handle service factory throwing synchronous errors', async () => {
      const syncError = new Error('Service factory synchronous error');
      mockServiceFactory.getADService.mockImplementation(() => {
        throw syncError;
      });

      const request = {
        source: 'ad' as const,
        query: {
          source: 'ad' as const,
          fields: [{ name: 'test', displayName: 'Test' }]
        }
      };

      await expect(service.executePreview(request)).rejects.toThrow('Service factory synchronous error');
    });

    it('should handle service factory returning null/undefined', async () => {
      mockServiceFactory.getADService.mockResolvedValue(null as any);

      const request = {
        source: 'ad' as const,
        query: {
          source: 'ad' as const,
          fields: [{ name: 'test', displayName: 'Test' }]
        }
      };

      await expect(service.executePreview(request)).rejects.toThrow();
    });

    it('should handle service methods returning null/undefined', async () => {
      const mockADService = {
        executeCustomQuery: jest.fn().mockResolvedValue(null)
      };
      mockServiceFactory.getADService.mockResolvedValue(mockADService as any);

      const request = {
        source: 'ad' as const,
        query: {
          source: 'ad' as const,
          fields: [{ name: 'test', displayName: 'Test' }]
        }
      };

      // Should handle null response from service
      mockProcessPreviewData.mockResolvedValue({
        data: { columns: [], rows: [], rowCount: 0, totalCount: 0 },
        metadata: { source: 'ad', executionTime: 0, cached: false, limit: 10 },
        success: false,
        error: 'No data returned from service'
      });

      const result = await service.executePreview(request);
      expect(mockProcessPreviewData).toHaveBeenCalledWith(null, 'ad', expect.any(Number));
    });

    it('should handle service methods throwing after successful instantiation', async () => {
      const mockADService = {
        executeCustomQuery: jest.fn().mockRejectedValue(new Error('Service method error'))
      };
      mockServiceFactory.getADService.mockResolvedValue(mockADService as any);

      const request = {
        source: 'ad' as const,
        query: {
          source: 'ad' as const,
          fields: [{ name: 'test', displayName: 'Test' }]
        }
      };

      await expect(service.executePreview(request)).rejects.toThrow('Service method error');
    });

    it('should handle service timeout scenarios', async () => {
      const mockADService = {
        executeCustomQuery: jest.fn().mockImplementation(() => 
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Service timeout')), 100)
          )
        )
      };
      mockServiceFactory.getADService.mockResolvedValue(mockADService as any);

      const request = {
        source: 'ad' as const,
        query: {
          source: 'ad' as const,
          fields: [{ name: 'test', displayName: 'Test' }]
        }
      };

      await expect(service.executePreview(request)).rejects.toThrow('Service timeout');
    });

    it('should handle services returning malformed responses', async () => {
      const malformedResponses = [
        'string response',
        123,
        [],
        { unexpected: 'structure' },
        { data: 'not an array' },
        { success: 'not a boolean' }
      ];

      for (const malformedResponse of malformedResponses) {
        const mockADService = {
          executeCustomQuery: jest.fn().mockResolvedValue(malformedResponse)
        };
        mockServiceFactory.getADService.mockResolvedValue(mockADService as any);

        mockProcessPreviewData.mockResolvedValue({
          data: { columns: [], rows: [], rowCount: 0, totalCount: 0 },
          metadata: { source: 'ad', executionTime: 0, cached: false, limit: 10 },
          success: false,
          error: 'Malformed service response'
        });

        const request = {
          source: 'ad' as const,
          query: {
            source: 'ad' as const,
            fields: [{ name: 'test', displayName: 'Test' }]
          }
        };

        // Should not throw, but handle gracefully
        const result = await service.executePreview(request);
        expect(result.success).toBe(false);
      }
    });
  });

  describe('Redis Cache Error Scenarios', () => {
    it('should handle Redis connection timeouts', async () => {
      const redisTimeoutError = new Error('Redis connection timeout');
      (redisTimeoutError as any).code = 'ETIMEDOUT';
      
      mockRedis.getJson.mockRejectedValue(redisTimeoutError);
      mockRedis.setJson.mockRejectedValue(redisTimeoutError);

      const mockADService = {
        executeCustomQuery: jest.fn().mockResolvedValue({ data: [], success: true })
      };
      mockServiceFactory.getADService.mockResolvedValue(mockADService as any);
      mockProcessPreviewData.mockResolvedValue({
        data: { columns: [], rows: [], rowCount: 0, totalCount: 0 },
        metadata: { source: 'ad', executionTime: 0, cached: false, limit: 10 },
        success: true
      });

      const request = {
        source: 'ad' as const,
        query: {
          source: 'ad' as const,
          fields: [{ name: 'test', displayName: 'Test' }]
        }
      };

      // Should continue execution despite Redis errors
      const result = await service.executePreview(request);
      expect(result.success).toBe(true);
      expect(logger.error).toHaveBeenCalledWith('Error getting cached preview result:', redisTimeoutError);
      expect(logger.error).toHaveBeenCalledWith('Error caching preview result:', redisTimeoutError);
    });

    it('should handle Redis returning corrupted JSON', async () => {
      const corruptedData = { 
        data: undefined,
        cachedAt: 'not a number' as any,
        expiresAt: null as any,
        cacheHit: 'not a boolean' as any
      };
      
      mockRedis.getJson.mockResolvedValue(corruptedData);

      const mockADService = {
        executeCustomQuery: jest.fn().mockResolvedValue({ data: [], success: true })
      };
      mockServiceFactory.getADService.mockResolvedValue(mockADService as any);

      const request = {
        source: 'ad' as const,
        query: {
          source: 'ad' as const,
          fields: [{ name: 'test', displayName: 'Test' }]
        }
      };

      // Should handle corrupted cache gracefully and execute query
      await service.executePreview(request);
      expect(mockADService.executeCustomQuery).toHaveBeenCalled();
    });

    it('should handle Redis client unavailable', async () => {
      mockRedis.getClient.mockImplementation(() => {
        throw new Error('Redis client not available');
      });

      const stats = await service.getCacheStats();
      
      expect(stats).toEqual({
        adEntries: 0,
        azureEntries: 0,
        o365Entries: 0,
        totalEntries: 0
      });
      expect(logger.error).toHaveBeenCalledWith(
        'Error getting preview cache stats:', 
        expect.any(Error)
      );
    });

    it('should handle Redis keys operation failure', async () => {
      const mockClient = {
        keys: jest.fn().mockRejectedValue(new Error('Keys operation failed'))
      };
      mockRedis.getClient.mockReturnValue(mockClient as any);

      const stats = await service.getCacheStats();
      
      expect(stats).toEqual({
        adEntries: 0,
        azureEntries: 0,
        o365Entries: 0,
        totalEntries: 0
      });
    });

    it('should handle cache invalidation failures', async () => {
      const cacheError = new Error('Cache invalidation failed');
      mockRedis.invalidatePattern.mockRejectedValue(cacheError);

      const result = await service.clearCache();
      
      expect(result).toBe(0);
      expect(logger.error).toHaveBeenCalledWith('Error clearing preview cache:', cacheError);
    });
  });

  describe('Memory and Resource Edge Cases', () => {
    it('should handle extremely large query objects', async () => {
      const largeQuery = {
        source: 'ad' as const,
        fields: Array.from({ length: 1000 }, (_, i) => ({
          name: `field${i}`,
          displayName: `Field ${i}`
        })),
        filters: Array.from({ length: 500 }, (_, i) => ({
          field: `field${i}`,
          operator: 'equals' as const,
          value: `value${i}`
        }))
      };

      const mockADService = {
        executeCustomQuery: jest.fn().mockResolvedValue({ data: [], success: true })
      };
      mockServiceFactory.getADService.mockResolvedValue(mockADService as any);
      mockProcessPreviewData.mockResolvedValue({
        data: { columns: [], rows: [], rowCount: 0, totalCount: 0 },
        metadata: { source: 'ad', executionTime: 0, cached: false, limit: 10 },
        success: true
      });

      const request = {
        source: 'ad' as const,
        query: largeQuery
      };

      // Should handle large queries without errors
      const result = await service.executePreview(request);
      expect(result.success).toBe(true);
    });

    it('should handle circular references in parameters', async () => {
      const circularParams: any = { name: 'test' };
      circularParams.self = circularParams;

      const mockADService = {
        executeCustomQuery: jest.fn().mockResolvedValue({ data: [], success: true })
      };
      mockServiceFactory.getADService.mockResolvedValue(mockADService as any);
      mockProcessPreviewData.mockResolvedValue({
        data: { columns: [], rows: [], rowCount: 0, totalCount: 0 },
        metadata: { source: 'ad', executionTime: 0, cached: false, limit: 10 },
        success: true
      });

      const request = {
        source: 'ad' as const,
        query: {
          source: 'ad' as const,
          fields: [{ name: 'test', displayName: 'Test' }]
        },
        parameters: circularParams
      };

      // Should handle circular references gracefully
      await expect(service.executePreview(request)).resolves.not.toThrow();
    });

    it('should handle extremely deep nested objects', async () => {
      let deepObject: any = { value: 'deep' };
      for (let i = 0; i < 1000; i++) {
        deepObject = { nested: deepObject };
      }

      const mockADService = {
        executeCustomQuery: jest.fn().mockResolvedValue({ data: [], success: true })
      };
      mockServiceFactory.getADService.mockResolvedValue(mockADService as any);
      mockProcessPreviewData.mockResolvedValue({
        data: { columns: [], rows: [], rowCount: 0, totalCount: 0 },
        metadata: { source: 'ad', executionTime: 0, cached: false, limit: 10 },
        success: true
      });

      const request = {
        source: 'ad' as const,
        query: {
          source: 'ad' as const,
          fields: [{ name: 'test', displayName: 'Test' }]
        },
        parameters: { deep: deepObject }
      };

      // Should handle deep objects without stack overflow
      await expect(service.executePreview(request)).resolves.not.toThrow();
    });
  });

  describe('Data Processing Edge Cases', () => {
    it('should handle processPreviewData throwing errors', async () => {
      const mockADService = {
        executeCustomQuery: jest.fn().mockResolvedValue({ data: [], success: true })
      };
      mockServiceFactory.getADService.mockResolvedValue(mockADService as any);
      
      const processingError = new Error('Data processing failed');
      mockProcessPreviewData.mockRejectedValue(processingError);

      const request = {
        source: 'ad' as const,
        query: {
          source: 'ad' as const,
          fields: [{ name: 'test', displayName: 'Test' }]
        }
      };

      await expect(service.executePreview(request)).rejects.toThrow('Data processing failed');
    });

    it('should handle processPreviewData returning null', async () => {
      const mockADService = {
        executeCustomQuery: jest.fn().mockResolvedValue({ data: [], success: true })
      };
      mockServiceFactory.getADService.mockResolvedValue(mockADService as any);
      
      mockProcessPreviewData.mockResolvedValue(null as any);

      const request = {
        source: 'ad' as const,
        query: {
          source: 'ad' as const,
          fields: [{ name: 'test', displayName: 'Test' }]
        }
      };

      const result = await service.executePreview(request);
      expect(result).toBeNull();
    });

    it('should handle processPreviewData returning malformed response', async () => {
      const mockADService = {
        executeCustomQuery: jest.fn().mockResolvedValue({ data: [], success: true })
      };
      mockServiceFactory.getADService.mockResolvedValue(mockADService as any);
      
      mockProcessPreviewData.mockResolvedValue('invalid response' as any);

      const request = {
        source: 'ad' as const,
        query: {
          source: 'ad' as const,
          fields: [{ name: 'test', displayName: 'Test' }]
        }
      };

      const result = await service.executePreview(request);
      expect(result).toBe('invalid response');
    });
  });

  describe('Boundary Value Testing', () => {
    it('should handle zero limit', async () => {
      const mockADService = {
        executeCustomQuery: jest.fn().mockResolvedValue({ data: [], success: true })
      };
      mockServiceFactory.getADService.mockResolvedValue(mockADService as any);
      mockProcessPreviewData.mockResolvedValue({
        data: { columns: [], rows: [], rowCount: 0, totalCount: 0 },
        metadata: { source: 'ad', executionTime: 0, cached: false, limit: 0 },
        success: true
      });

      const request = {
        source: 'ad' as const,
        query: {
          source: 'ad' as const,
          fields: [{ name: 'test', displayName: 'Test' }]
        },
        limit: 0
      };

      const result = await service.executePreview(request);
      expect(result.success).toBe(true);
      expect(mockADService.executeCustomQuery).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 0 }),
        {}
      );
    });

    it('should handle negative limit', async () => {
      const mockADService = {
        executeCustomQuery: jest.fn().mockResolvedValue({ data: [], success: true })
      };
      mockServiceFactory.getADService.mockResolvedValue(mockADService as any);
      mockProcessPreviewData.mockResolvedValue({
        data: { columns: [], rows: [], rowCount: 0, totalCount: 0 },
        metadata: { source: 'ad', executionTime: 0, cached: false, limit: 10 },
        success: true
      });

      const request = {
        source: 'ad' as const,
        query: {
          source: 'ad' as const,
          fields: [{ name: 'test', displayName: 'Test' }]
        },
        limit: -10
      };

      const result = await service.executePreview(request);
      // Should use default limit when negative
      expect(mockADService.executeCustomQuery).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 10 }),
        {}
      );
    });

    it('should handle extremely large limit values', async () => {
      const mockADService = {
        executeCustomQuery: jest.fn().mockResolvedValue({ data: [], success: true })
      };
      mockServiceFactory.getADService.mockResolvedValue(mockADService as any);
      mockProcessPreviewData.mockResolvedValue({
        data: { columns: [], rows: [], rowCount: 0, totalCount: 0 },
        metadata: { source: 'ad', executionTime: 0, cached: false, limit: 50 },
        success: true
      });

      const request = {
        source: 'ad' as const,
        query: {
          source: 'ad' as const,
          fields: [{ name: 'test', displayName: 'Test' }]
        },
        limit: Number.MAX_SAFE_INTEGER
      };

      const result = await service.executePreview(request);
      // Should enforce maximum limit
      expect(mockADService.executeCustomQuery).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 50 }),
        {}
      );
    });

    it('should handle NaN and Infinity limit values', async () => {
      const mockADService = {
        executeCustomQuery: jest.fn().mockResolvedValue({ data: [], success: true })
      };
      mockServiceFactory.getADService.mockResolvedValue(mockADService as any);
      mockProcessPreviewData.mockResolvedValue({
        data: { columns: [], rows: [], rowCount: 0, totalCount: 0 },
        metadata: { source: 'ad', executionTime: 0, cached: false, limit: 10 },
        success: true
      });

      const invalidLimits = [NaN, Infinity, -Infinity];

      for (const invalidLimit of invalidLimits) {
        const request = {
          source: 'ad' as const,
          query: {
            source: 'ad' as const,
            fields: [{ name: 'test', displayName: 'Test' }]
          },
          limit: invalidLimit
        };

        await service.executePreview(request);
        // Should use default limit for invalid values
        expect(mockADService.executeCustomQuery).toHaveBeenLastCalledWith(
          expect.objectContaining({ limit: 10 }),
          {}
        );
      }
    });
  });

  describe('Concurrent Access Edge Cases', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should handle race conditions with cache expiration', async () => {
      const currentTime = Date.now();
      
      // Mock cache that expires during execution
      let cacheCallCount = 0;
      mockRedis.getJson.mockImplementation(async () => {
        cacheCallCount++;
        if (cacheCallCount === 1) {
          return {
            data: { test: 'cached' },
            cachedAt: currentTime - 250000, // 4 minutes 10 seconds ago
            expiresAt: currentTime + 50000,  // 50 seconds from now
            cacheHit: false
          };
        }
        return null; // Expired on second call
      });

      const mockADService = {
        executeCustomQuery: jest.fn().mockResolvedValue({ data: [], success: true })
      };
      mockServiceFactory.getADService.mockResolvedValue(mockADService as any);
      mockProcessPreviewData.mockResolvedValue({
        data: { columns: [], rows: [], rowCount: 0, totalCount: 0 },
        metadata: { source: 'ad', executionTime: 0, cached: false, limit: 10 },
        success: true
      });

      const request = {
        source: 'ad' as const,
        query: {
          source: 'ad' as const,
          fields: [{ name: 'test', displayName: 'Test' }]
        }
      };

      const result1Promise = service.executePreview(request);
      
      // Advance time to expire cache
      jest.advanceTimersByTime(60000);
      
      const result2Promise = service.executePreview(request);

      await Promise.all([result1Promise, result2Promise]);
      
      // Should handle the race condition gracefully
      expect(mockRedis.getJson).toHaveBeenCalledTimes(2);
    });

    it('should handle multiple concurrent cache clear operations', async () => {
      mockRedis.invalidatePattern
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(0);

      const clearPromises = [
        service.clearCache(),
        service.clearCacheBySource('ad'),
        service.clearCacheBySource('azure')
      ];

      const results = await Promise.all(clearPromises);
      
      expect(results).toEqual([5, 3, 0]);
      expect(mockRedis.invalidatePattern).toHaveBeenCalledTimes(3);
    });
  });
});