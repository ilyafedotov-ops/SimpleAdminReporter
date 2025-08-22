/**
 * Integration Tests for PreviewService
 * Testing service interactions, caching behavior, and real data flow
 */

import { PreviewService } from './preview.service';
import { serviceFactory } from './service.factory';
import { redis } from '@/config/redis';
import { logger } from '@/utils/logger';
import { processPreviewData } from '@/utils/preview-data-extractor';

// Mock external dependencies but test real service interactions
jest.mock('@/config/redis');
jest.mock('@/utils/logger');
jest.mock('@/utils/preview-data-extractor');

describe('PreviewService Integration Tests', () => {
  let service: PreviewService;
  let mockRedis: jest.Mocked<typeof redis>;
  let mockProcessPreviewData: jest.MockedFunction<typeof processPreviewData>;

  const mockADService = {
    executeCustomQuery: jest.fn()
  };

  const mockAzureService = {
    executeQuery: jest.fn()
  };

  const mockO365Service = {
    executeQuery: jest.fn()
  };

  const validQuery = {
    source: 'ad' as const,
    fields: [
      { name: 'sAMAccountName', displayName: 'Username' },
      { name: 'displayName', displayName: 'Display Name' }
    ],
    filters: [
      { field: 'enabled', operator: 'equals' as const, value: true }
    ]
  };

  const mockServiceResponse = {
    data: [
      { sAMAccountName: 'jdoe', displayName: 'John Doe', enabled: true },
      { sAMAccountName: 'asmith', displayName: 'Alice Smith', enabled: true }
    ],
    success: true,
    totalCount: 2
  };

  const mockPreviewResponse = {
    data: {
      columns: [
        { name: 'sAMAccountName', displayName: 'Username', type: 'string' },
        { name: 'displayName', displayName: 'Display Name', type: 'string' }
      ],
      rows: mockServiceResponse.data,
      rowCount: 2,
      totalCount: 2
    },
    metadata: {
      source: 'ad',
      executionTime: 150,
      cached: false,
      limit: 10
    },
    success: true
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    service = new PreviewService();
    
    // Setup Redis mocks
    mockRedis = redis as jest.Mocked<typeof redis>;
    mockRedis.getJson = jest.fn();
    mockRedis.setJson = jest.fn();
    mockRedis.invalidatePattern = jest.fn();
    mockRedis.getClient = jest.fn().mockReturnValue({
      keys: jest.fn()
    });

    // Setup process preview data mock
    mockProcessPreviewData = processPreviewData as jest.MockedFunction<typeof processPreviewData>;
    mockProcessPreviewData.mockResolvedValue(mockPreviewResponse);

    // Setup service factory mocks
    jest.spyOn(serviceFactory, 'getADService').mockResolvedValue(mockADService as any);
    jest.spyOn(serviceFactory, 'getAzureService').mockResolvedValue(mockAzureService as any);
    jest.spyOn(serviceFactory, 'getO365Service').mockResolvedValue(mockO365Service as any);

    // Setup default service responses
    mockADService.executeCustomQuery.mockResolvedValue(mockServiceResponse);
    mockAzureService.executeQuery.mockResolvedValue({
      value: [
        { userPrincipalName: 'jdoe@domain.com', displayName: 'John Doe' },
        { userPrincipalName: 'asmith@domain.com', displayName: 'Alice Smith' }
      ]
    });
    mockO365Service.executeQuery.mockResolvedValue({
      value: [
        { mail: 'jdoe@domain.com', displayName: 'John Doe' },
        { mail: 'asmith@domain.com', displayName: 'Alice Smith' }
      ]
    });
  });

  describe('Service Factory Integration', () => {
    it('should properly integrate with AD service through service factory', async () => {
      mockRedis.getJson.mockResolvedValue(null); // Cache miss

      const request = {
        source: 'ad' as const,
        query: validQuery,
        parameters: { orgUnit: 'Users' }
      };

      const result = await service.executePreview(request);

      expect(serviceFactory.getADService).toHaveBeenCalledTimes(1);
      expect(mockADService.executeCustomQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'ad',
          fields: validQuery.fields,
          filters: validQuery.filters,
          limit: 10
        }),
        { orgUnit: 'Users' }
      );
      expect(result).toBe(mockPreviewResponse);
    });

    it('should properly integrate with Azure service through service factory', async () => {
      mockRedis.getJson.mockResolvedValue(null); // Cache miss

      const request = {
        source: 'azure' as const,
        query: { ...validQuery, source: 'azure' as const },
        parameters: { tenant: 'domain.onmicrosoft.com' }
      };

      await service.executePreview(request);

      expect(serviceFactory.getAzureService).toHaveBeenCalledTimes(1);
      expect(mockAzureService.executeQuery).toHaveBeenCalledWith({
        type: 'custom',
        source: 'azure',
        fields: validQuery.fields,
        filters: validQuery.filters,
        limit: 10,
        parameters: { tenant: 'domain.onmicrosoft.com' }
      });
    });

    it('should properly integrate with O365 service through service factory', async () => {
      mockRedis.getJson.mockResolvedValue(null); // Cache miss

      const request = {
        source: 'o365' as const,
        query: { ...validQuery, source: 'o365' as const },
        parameters: { mailbox: 'All' }
      };

      await service.executePreview(request);

      expect(serviceFactory.getO365Service).toHaveBeenCalledTimes(1);
      expect(mockO365Service.executeQuery).toHaveBeenCalledWith({
        type: 'custom',
        source: 'o365',
        fields: validQuery.fields,
        filters: validQuery.filters,
        limit: 10,
        parameters: { mailbox: 'All' }
      });
    });

    it('should handle service factory errors gracefully', async () => {
      const serviceError = new Error('Service factory failed to create AD service');
      jest.spyOn(serviceFactory, 'getADService').mockRejectedValue(serviceError);

      const request = {
        source: 'ad' as const,
        query: validQuery,
        parameters: {}
      };

      await expect(service.executePreview(request)).rejects.toThrow('Service factory failed to create AD service');
    });

    it('should not cache services - rely on ServiceFactory caching', async () => {
      mockRedis.getJson.mockResolvedValue(null);

      const request = {
        source: 'ad' as const,
        query: validQuery,
        parameters: {}
      };

      // Execute multiple requests
      await service.executePreview(request);
      await service.executePreview(request);
      await service.executePreview(request);

      // ServiceFactory should be called each time (it handles its own caching)
      expect(serviceFactory.getADService).toHaveBeenCalledTimes(3);
    });
  });

  describe('Redis Caching Integration', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2025-01-01T10:00:00Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should integrate with Redis for full cache workflow', async () => {
      const currentTime = Date.now();
      
      // First request - cache miss
      mockRedis.getJson.mockResolvedValueOnce(null);
      mockRedis.setJson.mockResolvedValueOnce(undefined);

      const request = {
        source: 'ad' as const,
        query: validQuery,
        parameters: { dept: 'IT' }
      };

      const result1 = await service.executePreview(request);

      // Verify cache set operation
      expect(mockRedis.setJson).toHaveBeenCalledWith(
        expect.stringMatching(/^preview:ad:/),
        {
          data: mockPreviewResponse,
          cachedAt: currentTime,
          expiresAt: currentTime + 300000, // 5 minutes
          cacheHit: false
        },
        300 // TTL
      );

      // Second request - cache hit
      const cachedData = {
        data: mockPreviewResponse,
        cachedAt: currentTime,
        expiresAt: currentTime + 300000,
        cacheHit: false
      };
      
      mockRedis.getJson.mockResolvedValueOnce(cachedData);

      const result2 = await service.executePreview(request);

      expect(result1).toBe(mockPreviewResponse);
      expect(result2).toBe(mockPreviewResponse);
      
      // Service should only be called once (first request)
      expect(mockADService.executeCustomQuery).toHaveBeenCalledTimes(1);
      
      // Cache should be checked twice
      expect(mockRedis.getJson).toHaveBeenCalledTimes(2);
      
      // Cache should be set only once (first request)
      expect(mockRedis.setJson).toHaveBeenCalledTimes(1);
    });

    it('should handle Redis connection failures gracefully', async () => {
      // Mock Redis connection failure
      const redisError = new Error('Redis connection timeout');
      mockRedis.getJson.mockRejectedValue(redisError);
      mockRedis.setJson.mockRejectedValue(redisError);

      const request = {
        source: 'ad' as const,
        query: validQuery,
        parameters: {}
      };

      // Should still execute successfully despite Redis failures
      const result = await service.executePreview(request);

      expect(result).toBe(mockPreviewResponse);
      expect(mockADService.executeCustomQuery).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledWith('Error getting cached preview result:', redisError);
      expect(logger.error).toHaveBeenCalledWith('Error caching preview result:', redisError);
    });

    it('should handle expired cache entries correctly', async () => {
      const currentTime = Date.now();
      
      // Mock expired cache entry
      const expiredCacheData = {
        data: mockPreviewResponse,
        cachedAt: currentTime - 360000, // 6 minutes ago
        expiresAt: currentTime - 60000,  // 1 minute ago (expired)
        cacheHit: false
      };

      mockRedis.getJson.mockResolvedValue(expiredCacheData);

      const request = {
        source: 'ad' as const,
        query: validQuery,
        parameters: {}
      };

      await service.executePreview(request);

      // Should execute service call since cache was expired
      expect(mockADService.executeCustomQuery).toHaveBeenCalledTimes(1);
      
      // Should attempt to cache the new result
      expect(mockRedis.setJson).toHaveBeenCalledTimes(1);
    });

    it('should generate consistent cache keys for identical requests', async () => {
      mockRedis.getJson.mockResolvedValue(null);

      const request1 = {
        source: 'ad' as const,
        query: {
          source: 'ad' as const,
          fields: [
            { name: 'displayName', displayName: 'Display Name' },
            { name: 'sAMAccountName', displayName: 'Username' }
          ]
        },
        parameters: { dept: 'IT' }
      };

      const request2 = {
        source: 'ad' as const,
        query: {
          source: 'ad' as const,
          fields: [
            { name: 'sAMAccountName', displayName: 'Username' },
            { name: 'displayName', displayName: 'Display Name' }
          ]
        },
        parameters: { dept: 'IT' }
      };

      await service.executePreview(request1);
      await service.executePreview(request2);

      // Both calls should result in the same cache key
      const cacheKeys = mockRedis.getJson.mock.calls.map(call => call[0]);
      expect(cacheKeys[0]).toBe(cacheKeys[1]);
    });
  });

  describe('Data Flow Integration', () => {
    it('should properly pass data through the entire pipeline', async () => {
      mockRedis.getJson.mockResolvedValue(null);

      const request = {
        source: 'ad' as const,
        query: validQuery,
        parameters: { orgUnit: 'OU=Users,DC=domain,DC=local' },
        limit: 25
      };

      const result = await service.executePreview(request);

      // Verify data flows correctly through all stages
      expect(mockADService.executeCustomQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 25,
          source: 'ad',
          fields: validQuery.fields,
          filters: validQuery.filters
        }),
        { orgUnit: 'OU=Users,DC=domain,DC=local' }
      );

      expect(mockProcessPreviewData).toHaveBeenCalledWith(
        mockServiceResponse,
        'ad',
        expect.any(Number) // execution time
      );

      expect(result).toBe(mockPreviewResponse);
    });

    it('should track execution time accurately', async () => {
      mockRedis.getJson.mockResolvedValue(null);
      
      // Mock a slow service response
      mockADService.executeCustomQuery.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return mockServiceResponse;
      });

      const request = {
        source: 'ad' as const,
        query: validQuery,
        parameters: {}
      };

      await service.executePreview(request);

      const executionTimeArg = mockProcessPreviewData.mock.calls[0][2];
      expect(executionTimeArg).toBeGreaterThanOrEqual(95); // Allow for some timing variance
    });

    it('should handle complex query structures', async () => {
      mockRedis.getJson.mockResolvedValue(null);

      const complexQuery = {
        source: 'ad' as const,
        fields: [
          { name: 'sAMAccountName', displayName: 'Username' },
          { name: 'displayName', displayName: 'Display Name' },
          { name: 'department', displayName: 'Department' },
          { name: 'title', displayName: 'Job Title' }
        ],
        filters: [
          { field: 'enabled', operator: 'equals' as const, value: true },
          { field: 'department', operator: 'contains' as const, value: 'IT' },
          { field: 'lastLogon', operator: 'newer_than' as const, value: '30d' }
        ],
        groupBy: 'department',
        orderBy: { field: 'displayName', direction: 'asc' as const },
        limit: 50
      };

      const request = {
        source: 'ad' as const,
        query: complexQuery,
        parameters: { includeDisabled: false }
      };

      await service.executePreview(request);

      expect(mockADService.executeCustomQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          fields: complexQuery.fields,
          filters: complexQuery.filters,
          groupBy: 'department',
          orderBy: { field: 'displayName', direction: 'asc' },
          limit: 50
        }),
        { includeDisabled: false }
      );
    });
  });

  describe('Performance and Concurrent Access', () => {
    it('should handle concurrent requests efficiently', async () => {
      mockRedis.getJson.mockResolvedValue(null);

      const requests = Array.from({ length: 5 }, (_, i) => ({
        source: 'ad' as const,
        query: validQuery,
        parameters: { index: i }
      }));

      const startTime = Date.now();
      const results = await Promise.all(
        requests.map(req => service.executePreview(req))
      );
      const endTime = Date.now();

      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result).toBe(mockPreviewResponse);
      });

      expect(mockADService.executeCustomQuery).toHaveBeenCalledTimes(5);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete quickly
    });

    it('should not interfere between different data sources', async () => {
      mockRedis.getJson.mockResolvedValue(null);

      const adRequest = {
        source: 'ad' as const,
        query: { ...validQuery, source: 'ad' as const },
        parameters: {}
      };

      const azureRequest = {
        source: 'azure' as const,
        query: { ...validQuery, source: 'azure' as const },
        parameters: {}
      };

      const o365Request = {
        source: 'o365' as const,
        query: { ...validQuery, source: 'o365' as const },
        parameters: {}
      };

      await Promise.all([
        service.executePreview(adRequest),
        service.executePreview(azureRequest),
        service.executePreview(o365Request)
      ]);

      expect(serviceFactory.getADService).toHaveBeenCalledTimes(1);
      expect(serviceFactory.getAzureService).toHaveBeenCalledTimes(1);
      expect(serviceFactory.getO365Service).toHaveBeenCalledTimes(1);

      expect(mockADService.executeCustomQuery).toHaveBeenCalledTimes(1);
      expect(mockAzureService.executeQuery).toHaveBeenCalledTimes(1);
      expect(mockO365Service.executeQuery).toHaveBeenCalledTimes(1);
    });

    it('should properly isolate cache entries by data source', async () => {
      const cacheKeys: string[] = [];
      
      mockRedis.getJson.mockImplementation(async (key: string) => {
        cacheKeys.push(key);
        return null; // Always cache miss for this test
      });

      const requests = [
        { source: 'ad' as const, query: { ...validQuery, source: 'ad' as const } },
        { source: 'azure' as const, query: { ...validQuery, source: 'azure' as const } },
        { source: 'o365' as const, query: { ...validQuery, source: 'o365' as const } }
      ];

      await Promise.all(requests.map(req => service.executePreview(req)));

      expect(cacheKeys[0]).toMatch(/^preview:ad:/);
      expect(cacheKeys[1]).toMatch(/^preview:azure:/);
      expect(cacheKeys[2]).toMatch(/^preview:o365:/);
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should recover from service errors and continue processing', async () => {
      mockRedis.getJson.mockResolvedValue(null);

      const request = {
        source: 'ad' as const,
        query: validQuery,
        parameters: {}
      };

      // First call fails
      mockADService.executeCustomQuery
        .mockRejectedValueOnce(new Error('Temporary service failure'))
        .mockResolvedValue(mockServiceResponse);

      // First call should fail
      await expect(service.executePreview(request)).rejects.toThrow('Temporary service failure');

      // Second call should succeed
      const result = await service.executePreview(request);
      expect(result).toBe(mockPreviewResponse);
    });

    it('should handle partial service responses', async () => {
      mockRedis.getJson.mockResolvedValue(null);

      const partialServiceResponse = {
        data: [{ sAMAccountName: 'jdoe' }], // Missing displayName
        success: true,
        totalCount: 1
      };

      mockADService.executeCustomQuery.mockResolvedValue(partialServiceResponse);

      const request = {
        source: 'ad' as const,
        query: validQuery,
        parameters: {}
      };

      await service.executePreview(request);

      expect(mockProcessPreviewData).toHaveBeenCalledWith(
        partialServiceResponse,
        'ad',
        expect.any(Number)
      );
    });

    it('should handle empty service responses', async () => {
      mockRedis.getJson.mockResolvedValue(null);

      const emptyServiceResponse = {
        data: [],
        success: true,
        totalCount: 0
      };

      mockADService.executeCustomQuery.mockResolvedValue(emptyServiceResponse);

      const request = {
        source: 'ad' as const,
        query: validQuery,
        parameters: {}
      };

      await service.executePreview(request);

      expect(mockProcessPreviewData).toHaveBeenCalledWith(
        emptyServiceResponse,
        'ad',
        expect.any(Number)
      );
    });
  });

  describe('Cache Management Integration', () => {
    it('should integrate with Redis for cache clearing operations', async () => {
      mockRedis.invalidatePattern.mockResolvedValue(5);

      const clearedCount = await service.clearCache();

      expect(clearedCount).toBe(5);
      expect(mockRedis.invalidatePattern).toHaveBeenCalledWith('preview:*');
    });

    it('should integrate with Redis for source-specific cache clearing', async () => {
      mockRedis.invalidatePattern
        .mockResolvedValueOnce(3) // AD entries
        .mockResolvedValueOnce(2) // Azure entries
        .mockResolvedValueOnce(1); // O365 entries

      const adCleared = await service.clearCacheBySource('ad');
      const azureCleared = await service.clearCacheBySource('azure');
      const o365Cleared = await service.clearCacheBySource('o365');

      expect(adCleared).toBe(3);
      expect(azureCleared).toBe(2);
      expect(o365Cleared).toBe(1);

      expect(mockRedis.invalidatePattern).toHaveBeenCalledWith('preview:ad:*');
      expect(mockRedis.invalidatePattern).toHaveBeenCalledWith('preview:azure:*');
      expect(mockRedis.invalidatePattern).toHaveBeenCalledWith('preview:o365:*');
    });

    it('should integrate with Redis for cache statistics', async () => {
      const mockRedisClient = {
        keys: jest.fn()
          .mockResolvedValueOnce(['preview:ad:key1', 'preview:ad:key2'])
          .mockResolvedValueOnce(['preview:azure:key1'])
          .mockResolvedValueOnce(['preview:o365:key1', 'preview:o365:key2', 'preview:o365:key3'])
      };

      mockRedis.getClient.mockReturnValue(mockRedisClient);

      const stats = await service.getCacheStats();

      expect(stats).toEqual({
        adEntries: 2,
        azureEntries: 1,
        o365Entries: 3,
        totalEntries: 6
      });
    });
  });

  describe('End-to-End Preview Workflow', () => {
    it('should execute complete preview workflow with all integrations', async () => {
      jest.useFakeTimers();
      const testTime = new Date('2025-01-01T10:00:00Z');
      jest.setSystemTime(testTime);

      // Mock cache miss initially
      mockRedis.getJson.mockResolvedValueOnce(null);
      mockRedis.setJson.mockResolvedValueOnce(undefined);

      const request = {
        source: 'ad' as const,
        query: {
          source: 'ad' as const,
          fields: [
            { name: 'sAMAccountName', displayName: 'Username' },
            { name: 'displayName', displayName: 'Display Name' },
            { name: 'department', displayName: 'Department' }
          ],
          filters: [
            { field: 'enabled', operator: 'equals' as const, value: true },
            { field: 'department', operator: 'equals' as const, value: 'IT' }
          ],
          orderBy: { field: 'displayName', direction: 'asc' as const }
        },
        parameters: { orgUnit: 'IT Department' },
        limit: 15
      };

      const result = await service.executePreview(request);

      // Verify complete workflow
      expect(result).toBe(mockPreviewResponse);
      
      // Check service factory integration
      expect(serviceFactory.getADService).toHaveBeenCalledTimes(1);
      
      // Check service execution
      expect(mockADService.executeCustomQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'ad',
          fields: request.query.fields,
          filters: request.query.filters,
          orderBy: request.query.orderBy,
          limit: 15
        }),
        { orgUnit: 'IT Department' }
      );
      
      // Check data processing
      expect(mockProcessPreviewData).toHaveBeenCalledWith(
        mockServiceResponse,
        'ad',
        expect.any(Number)
      );
      
      // Check caching
      expect(mockRedis.getJson).toHaveBeenCalledTimes(1);
      expect(mockRedis.setJson).toHaveBeenCalledWith(
        expect.stringMatching(/^preview:ad:/),
        expect.objectContaining({
          data: mockPreviewResponse,
          cachedAt: testTime.getTime(),
          expiresAt: testTime.getTime() + 300000,
          cacheHit: false
        }),
        300
      );

      jest.useRealTimers();
    });

    it('should handle complete failure scenarios gracefully', async () => {
      // Service factory failure
      jest.spyOn(serviceFactory, 'getADService').mockRejectedValue(
        new Error('Service factory unavailable')
      );

      const request = {
        source: 'ad' as const,
        query: validQuery,
        parameters: {}
      };

      await expect(service.executePreview(request)).rejects.toThrow('Service factory unavailable');

      // Verify error was logged
      expect(logger.error).toHaveBeenCalledWith(
        'Preview query execution failed:',
        expect.objectContaining({
          source: 'ad',
          error: 'Service factory unavailable'
        })
      );
    });
  });
});