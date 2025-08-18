import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Unmock the global queryService mock for this specific test
vi.unmock('../queryService');

import { queryService, QueryDefinition, QueryExecutionResult, QueryValidationResult, QueryHealthStatus, QueryStatistics, QueryMetrics, DynamicQuerySpec } from '../queryService';
import apiService from '../api';
import { ApiPriority } from '@/utils/apiQueue';
import { schemaCache, createCacheKey } from '@/utils/apiCache';

// Mock dependencies
vi.mock('../api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  }
}));

vi.mock('@/utils/apiQueue', () => ({
  ApiPriority: {
    LOW: -1,
    NORMAL: 0,
    HIGH: 1,
    CRITICAL: 2
  }
}));

vi.mock('@/utils/apiCache', () => ({
  schemaCache: {
    get: vi.fn(),
    set: vi.fn(),
  },
  createCacheKey: vi.fn().mockReturnValue('mock-cache-key')
}));

describe('QueryService', () => {
  let mockApiGet: ReturnType<typeof vi.fn>;
  let mockApiPost: ReturnType<typeof vi.fn>;
  let mockApiDelete: ReturnType<typeof vi.fn>;
  let mockSchemaCache: any;
  let mockCreateCacheKey: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockApiGet = vi.mocked(apiService.get);
    mockApiPost = vi.mocked(apiService.post);
    mockApiDelete = vi.mocked(apiService.delete);
    mockSchemaCache = vi.mocked(schemaCache);
    mockCreateCacheKey = vi.mocked(createCacheKey);

    // Reset cache mocks
    mockSchemaCache.get.mockReturnValue(null);
    mockSchemaCache.set.mockImplementation(() => {});
    mockCreateCacheKey.mockReturnValue('test-cache-key');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('execute', () => {
    it('should execute a pre-defined query without parameters', async () => {
      const mockResult: QueryExecutionResult = {
        queryId: 'users-active',
        executedAt: '2025-01-15T10:30:00Z',
        executedBy: 'testuser',
        success: true,
        data: [
          { id: '1', username: 'john.doe', active: true },
          { id: '2', username: 'jane.smith', active: true }
        ],
        metadata: {
          executionTime: 150,
          rowCount: 2,
          cached: false
        }
      };

      const mockResponse = {
        success: true,
        data: mockResult
      };

      mockApiPost.mockResolvedValue(mockResponse);

      const result = await queryService.execute('users-active');

      expect(mockApiPost).toHaveBeenCalledWith('/reports/query/execute', {
        queryId: 'users-active',
        parameters: undefined,
        options: undefined
      });
      expect(result).toEqual(mockResponse);
    });

    it('should execute query with parameters and options', async () => {
      const queryId = 'users-filtered';
      const parameters = { department: 'IT', active: true };
      const options = {
        skipCache: true,
        timeout: 30000,
        credentialId: 123
      };

      const mockResult: QueryExecutionResult = {
        queryId,
        executedAt: '2025-01-15T10:35:00Z',
        success: true,
        data: [
          { id: '3', username: 'bob.wilson', department: 'IT', active: true }
        ],
        metadata: {
          executionTime: 250,
          rowCount: 1,
          cached: false
        }
      };

      const mockResponse = {
        success: true,
        data: mockResult
      };

      mockApiPost.mockResolvedValue(mockResponse);

      const result = await queryService.execute(queryId, parameters, options);

      expect(mockApiPost).toHaveBeenCalledWith('/reports/query/execute', {
        queryId,
        parameters,
        options
      });
      expect(result).toEqual(mockResponse);
    });

    it('should execute query with inline query definition', async () => {
      const queryId = 'test-query';
      const queryDef: QueryDefinition = {
        id: queryId,
        name: 'Test Query',
        dataSource: 'postgres',
        sql: 'SELECT * FROM users WHERE active = $1',
        parameters: [
          { name: 'active', type: 'boolean', required: true, defaultValue: true }
        ]
      };

      const options = { queryDef };
      const parameters = { active: true };

      const mockResult: QueryExecutionResult = {
        queryId,
        executedAt: '2025-01-15T10:40:00Z',
        success: true,
        data: [{ id: '1', username: 'test.user' }],
        metadata: { executionTime: 100, rowCount: 1, cached: false }
      };

      mockApiPost.mockResolvedValue({ success: true, data: mockResult });

      const result = await queryService.execute(queryId, parameters, options);

      expect(mockApiPost).toHaveBeenCalledWith('/reports/query/execute', {
        queryId,
        parameters,
        options
      });
      expect(result.data).toEqual(mockResult);
    });

    it('should handle query execution errors', async () => {
      const error = new Error('Query execution failed');
      mockApiPost.mockRejectedValue(error);

      await expect(queryService.execute('invalid-query')).rejects.toThrow('Query execution failed');
    });

    it('should handle failed query execution in response', async () => {
      const mockResult: QueryExecutionResult = {
        queryId: 'failing-query',
        executedAt: '2025-01-15T10:45:00Z',
        success: false,
        data: [],
        metadata: {
          executionTime: 50,
          rowCount: 0,
          cached: false,
          error: 'SQL syntax error'
        }
      };

      const mockResponse = {
        success: true,
        data: mockResult
      };

      mockApiPost.mockResolvedValue(mockResponse);

      const result = await queryService.execute('failing-query');

      expect(result.data.success).toBe(false);
      expect(result.data.metadata?.error).toBe('SQL syntax error');
    });
  });

  describe('build', () => {
    it('should build and execute dynamic query', async () => {
      const querySpec: DynamicQuerySpec = {
        dataSource: 'postgres',
        select: ['id', 'username', 'email'],
        from: 'users',
        where: [
          { field: 'active', operator: 'eq', value: true },
          { field: 'department', operator: 'eq', value: 'Engineering', logic: 'AND' }
        ],
        orderBy: [{ field: 'username', direction: 'asc' }],
        limit: 50
      };

      const mockResult: QueryExecutionResult = {
        queryId: 'dynamic-query',
        executedAt: '2025-01-15T11:00:00Z',
        success: true,
        data: [
          { id: '1', username: 'alice.dev', email: 'alice@company.com' },
          { id: '2', username: 'bob.dev', email: 'bob@company.com' }
        ],
        metadata: {
          executionTime: 300,
          rowCount: 2,
          cached: false,
          generatedSql: 'SELECT id, username, email FROM users WHERE active = $1 AND department = $2 ORDER BY username ASC LIMIT 50'
        }
      };

      const mockResponse = {
        success: true,
        data: mockResult
      };

      mockApiPost.mockResolvedValue(mockResponse);

      const result = await queryService.build(querySpec);

      expect(mockApiPost).toHaveBeenCalledWith('/reports/query/build', querySpec);
      expect(result).toEqual(mockResponse);
    });

    it('should handle dynamic query build errors', async () => {
      const invalidSpec: DynamicQuerySpec = {
        dataSource: 'invalid',
        select: [],
        from: 'nonexistent_table'
      };

      const error = new Error('Invalid query specification');
      mockApiPost.mockRejectedValue(error);

      await expect(queryService.build(invalidSpec)).rejects.toThrow('Invalid query specification');
    });

    it('should build complex query with joins', async () => {
      const complexSpec: DynamicQuerySpec = {
        dataSource: 'postgres',
        select: ['u.username', 'd.name as department_name', 'COUNT(p.id) as project_count'],
        from: 'users u',
        joins: [
          { type: 'LEFT', table: 'departments d', on: 'u.department_id = d.id' },
          { type: 'LEFT', table: 'projects p', on: 'u.id = p.owner_id' }
        ],
        where: [
          { field: 'u.active', operator: 'eq', value: true }
        ],
        groupBy: ['u.username', 'd.name'],
        having: [
          { field: 'COUNT(p.id)', operator: 'gt', value: 0 }
        ],
        orderBy: [{ field: 'project_count', direction: 'desc' }]
      };

      const mockResponse = {
        success: true,
        data: {
          queryId: 'complex-dynamic',
          executedAt: '2025-01-15T11:15:00Z',
          success: true,
          data: [
            { username: 'alice.dev', department_name: 'Engineering', project_count: 3 }
          ],
          metadata: { executionTime: 500, rowCount: 1, cached: false }
        }
      };

      mockApiPost.mockResolvedValue(mockResponse);

      const result = await queryService.build(complexSpec);

      expect(result.data.data).toHaveLength(1);
      expect(result.data.data[0].project_count).toBe(3);
    });
  });

  describe('getDefinitions', () => {
    it('should fetch query definitions without filters', async () => {
      const mockDefinitions: QueryDefinition[] = [
        {
          id: 'users-all',
          name: 'All Users',
          description: 'Get all user accounts',
          dataSource: 'ad',
          sql: 'SELECT * FROM users'
        },
        {
          id: 'groups-active',
          name: 'Active Groups',
          description: 'Get active security groups',
          dataSource: 'ad',
          sql: 'SELECT * FROM groups WHERE active = 1'
        }
      ];

      const mockResponse = {
        success: true,
        data: {
          definitions: mockDefinitions,
          totalCount: 2
        }
      };

      mockApiGet.mockResolvedValue(mockResponse);

      const result = await queryService.getDefinitions();

      expect(mockApiGet).toHaveBeenCalledWith('/reports/query/definitions', undefined, {
        useCache: true,
        cacheTTL: 300,
        priority: ApiPriority.NORMAL
      });
      expect(result).toEqual(mockResponse);
    });

    it('should fetch definitions with filters', async () => {
      const params = {
        dataSource: 'azure',
        category: 'users',
        search: 'active',
        includeSystem: true
      };

      const mockResponse = {
        success: true,
        data: {
          definitions: [],
          totalCount: 0
        }
      };

      mockApiGet.mockResolvedValue(mockResponse);

      await queryService.getDefinitions(params);

      expect(mockApiGet).toHaveBeenCalledWith('/reports/query/definitions', params, {
        useCache: true,
        cacheTTL: 300,
        priority: ApiPriority.NORMAL
      });
    });

    it('should handle definition fetch errors', async () => {
      const error = new Error('Failed to fetch definitions');
      mockApiGet.mockRejectedValue(error);

      await expect(queryService.getDefinitions()).rejects.toThrow('Failed to fetch definitions');
    });
  });

  describe('getSchema', () => {
    it('should fetch schema from API when not cached', async () => {
      const dataSource = 'postgres';
      const mockSchema = {
        tables: [
          { name: 'users', columns: ['id', 'username', 'email'] },
          { name: 'groups', columns: ['id', 'name', 'description'] }
        ],
        fields: [
          { name: 'id', type: 'integer', table: 'users' },
          { name: 'username', type: 'varchar', table: 'users' },
          { name: 'email', type: 'varchar', table: 'users' }
        ]
      };

      const mockResponse = {
        success: true,
        data: mockSchema
      };

      mockSchemaCache.get.mockReturnValue(null);
      mockApiGet.mockResolvedValue(mockResponse);

      const result = await queryService.getSchema(dataSource);

      expect(mockCreateCacheKey).toHaveBeenCalledWith(`schema:${dataSource}`);
      expect(mockSchemaCache.get).toHaveBeenCalledWith('test-cache-key');
      expect(mockApiGet).toHaveBeenCalledWith(`/reports/query/schema/${dataSource}`, undefined, {
        useCache: false,
        priority: ApiPriority.HIGH
      });
      expect(mockSchemaCache.set).toHaveBeenCalledWith('test-cache-key', mockResponse, 3600);
      expect(result).toEqual(mockResponse);
    });

    it('should return cached schema when available', async () => {
      const dataSource = 'ad';
      const cachedSchema = {
        success: true,
        data: {
          tables: [{ name: 'users' }],
          fields: [{ name: 'sAMAccountName', type: 'string' }]
        }
      };

      mockSchemaCache.get.mockReturnValue(cachedSchema);

      const result = await queryService.getSchema(dataSource);

      expect(mockSchemaCache.get).toHaveBeenCalledWith('test-cache-key');
      expect(mockApiGet).not.toHaveBeenCalled();
      expect(result).toEqual(cachedSchema);
    });

    it('should handle schema fetch errors', async () => {
      const error = new Error('Schema not found');
      mockSchemaCache.get.mockReturnValue(null);
      mockApiGet.mockRejectedValue(error);

      await expect(queryService.getSchema('invalid')).rejects.toThrow('Schema not found');
    });

    it('should not cache failed schema requests', async () => {
      const failedResponse = { success: false, error: 'Schema error' };
      
      mockSchemaCache.get.mockReturnValue(null);
      mockApiGet.mockResolvedValue(failedResponse);

      const result = await queryService.getSchema('failing-source');

      expect(mockSchemaCache.set).not.toHaveBeenCalled();
      expect(result).toEqual(failedResponse);
    });
  });

  describe('validate', () => {
    it('should validate query definition without parameters', async () => {
      const queryDef: QueryDefinition = {
        id: 'test-validation',
        name: 'Test Validation Query',
        dataSource: 'postgres',
        sql: 'SELECT id, username FROM users WHERE active = true'
      };

      const mockValidation: QueryValidationResult = {
        valid: true,
        errors: [],
        warnings: [],
        estimatedRows: 100,
        estimatedExecutionTime: 50
      };

      const mockResponse = {
        success: true,
        data: mockValidation
      };

      mockApiPost.mockResolvedValue(mockResponse);

      const result = await queryService.validate(queryDef);

      expect(mockApiPost).toHaveBeenCalledWith('/reports/query/validate', {
        queryDef,
        parameters: undefined
      });
      expect(result).toEqual(mockResponse);
    });

    it('should validate query with parameters', async () => {
      const queryDef: QueryDefinition = {
        id: 'parameterized-query',
        name: 'Parameterized Query',
        dataSource: 'postgres',
        sql: 'SELECT * FROM users WHERE department = $1 AND active = $2',
        parameters: [
          { name: 'department', type: 'string', required: true },
          { name: 'active', type: 'boolean', required: true, defaultValue: true }
        ]
      };

      const parameters = { department: 'IT', active: true };

      const mockValidation: QueryValidationResult = {
        valid: true,
        errors: [],
        warnings: ['Large result set expected'],
        estimatedRows: 500,
        estimatedExecutionTime: 200
      };

      const mockResponse = {
        success: true,
        data: mockValidation
      };

      mockApiPost.mockResolvedValue(mockResponse);

      const result = await queryService.validate(queryDef, parameters);

      expect(mockApiPost).toHaveBeenCalledWith('/reports/query/validate', {
        queryDef,
        parameters
      });
      expect(result.data.warnings).toContain('Large result set expected');
    });

    it('should handle validation with errors', async () => {
      const invalidQueryDef: QueryDefinition = {
        id: 'invalid-query',
        name: 'Invalid Query',
        dataSource: 'postgres',
        sql: 'SELECT * FROM nonexistent_table'
      };

      const mockValidation: QueryValidationResult = {
        valid: false,
        errors: [
          'Table "nonexistent_table" does not exist',
          'Missing required parameter: user_id'
        ],
        warnings: [],
        estimatedRows: 0,
        estimatedExecutionTime: 0
      };

      const mockResponse = {
        success: true,
        data: mockValidation
      };

      mockApiPost.mockResolvedValue(mockResponse);

      const result = await queryService.validate(invalidQueryDef);

      expect(result.data.valid).toBe(false);
      expect(result.data.errors).toHaveLength(2);
    });
  });

  describe('getHealth', () => {
    it('should fetch query service health status', async () => {
      const mockHealth: QueryHealthStatus = {
        status: 'healthy',
        timestamp: '2025-01-15T12:00:00Z',
        services: {
          database: { status: 'healthy', responseTime: 10 },
          redis: { status: 'healthy', responseTime: 5 },
          queue: { status: 'healthy', activeJobs: 3 }
        },
        metrics: {
          totalQueries: 1250,
          successRate: 98.5,
          averageExecutionTime: 150,
          cacheHitRate: 75.2
        }
      };

      const mockResponse = {
        success: true,
        data: mockHealth
      };

      mockApiGet.mockResolvedValue(mockResponse);

      const result = await queryService.getHealth();

      expect(mockApiGet).toHaveBeenCalledWith('/reports/query/health');
      expect(result).toEqual(mockResponse);
    });

    it('should handle unhealthy service status', async () => {
      const mockHealth: QueryHealthStatus = {
        status: 'unhealthy',
        timestamp: '2025-01-15T12:05:00Z',
        services: {
          database: { status: 'unhealthy', responseTime: 5000, error: 'Connection timeout' },
          redis: { status: 'healthy', responseTime: 5 },
          queue: { status: 'degraded', activeJobs: 100, error: 'High queue depth' }
        },
        metrics: {
          totalQueries: 1250,
          successRate: 85.0,
          averageExecutionTime: 2000,
          cacheHitRate: 45.0
        }
      };

      const mockResponse = {
        success: true,
        data: mockHealth
      };

      mockApiGet.mockResolvedValue(mockResponse);

      const result = await queryService.getHealth();

      expect(result.data.status).toBe('unhealthy');
      expect(result.data.services.database.error).toBe('Connection timeout');
    });
  });

  describe('getStats', () => {
    it('should get statistics for all queries', async () => {
      const mockStats: QueryStatistics = {
        queryId: null,
        totalExecutions: 500,
        successfulExecutions: 485,
        failedExecutions: 15,
        averageExecutionTime: 150,
        medianExecutionTime: 120,
        maxExecutionTime: 2000,
        minExecutionTime: 50,
        cacheHitRate: 65.5,
        executionTrends: [
          { date: '2025-01-14', executions: 150, avgTime: 140 },
          { date: '2025-01-15', executions: 180, avgTime: 160 }
        ]
      };

      const mockResponse = {
        success: true,
        data: mockStats
      };

      mockApiGet.mockResolvedValue(mockResponse);

      const result = await queryService.getStats();

      expect(mockApiGet).toHaveBeenCalledWith('/reports/query/stats');
      expect(result).toEqual(mockResponse);
    });

    it('should get statistics for specific query', async () => {
      const queryId = 'users-active';
      const mockStats: QueryStatistics = {
        queryId,
        totalExecutions: 50,
        successfulExecutions: 48,
        failedExecutions: 2,
        averageExecutionTime: 120,
        medianExecutionTime: 110,
        maxExecutionTime: 500,
        minExecutionTime: 80,
        cacheHitRate: 80.0,
        executionTrends: [
          { date: '2025-01-15', executions: 25, avgTime: 115 }
        ]
      };

      const mockResponse = {
        success: true,
        data: mockStats
      };

      mockApiGet.mockResolvedValue(mockResponse);

      const result = await queryService.getStats(queryId);

      expect(mockApiGet).toHaveBeenCalledWith(`/reports/query/stats/${queryId}`);
      expect(result.data.queryId).toBe(queryId);
    });
  });

  describe('getMetrics', () => {
    it('should fetch service-wide metrics', async () => {
      const mockMetrics: QueryMetrics = {
        timestamp: '2025-01-15T12:30:00Z',
        activeQueries: 5,
        queuedQueries: 12,
        totalMemoryUsage: 256, // MB
        cacheSize: 128, // MB
        cacheEntries: 1500,
        systemLoad: {
          cpu: 25.5,
          memory: 60.2,
          disk: 45.0
        },
        performance: {
          requestsPerSecond: 15.5,
          averageResponseTime: 150,
          errorRate: 2.1
        }
      };

      const mockResponse = {
        success: true,
        data: mockMetrics
      };

      mockApiGet.mockResolvedValue(mockResponse);

      const result = await queryService.getMetrics();

      expect(mockApiGet).toHaveBeenCalledWith('/reports/query/metrics');
      expect(result).toEqual(mockResponse);
    });

    it('should handle metrics fetch errors', async () => {
      const error = new Error('Metrics service unavailable');
      mockApiGet.mockRejectedValue(error);

      await expect(queryService.getMetrics()).rejects.toThrow('Metrics service unavailable');
    });
  });

  describe('cache operations', () => {
    describe('getCached', () => {
      it('should get cached results for query', async () => {
        const queryId = 'cached-query';
        const mockCachedResult: QueryExecutionResult = {
          queryId,
          executedAt: '2025-01-15T11:00:00Z',
          success: true,
          data: [{ id: '1', name: 'Cached Data' }],
          metadata: {
            executionTime: 100,
            rowCount: 1,
            cached: true,
            cacheAge: 300 // 5 minutes
          }
        };

        const mockResponse = {
          success: true,
          data: mockCachedResult
        };

        mockApiGet.mockResolvedValue(mockResponse);

        const result = await queryService.getCached(queryId);

        expect(mockApiGet).toHaveBeenCalledWith(`/reports/query/cache/${queryId}`);
        expect(result).toEqual(mockResponse);
        expect(result.data.metadata?.cached).toBe(true);
      });

      it('should handle cache miss', async () => {
        const mockResponse = {
          success: false,
          error: 'Cache miss',
          data: null
        };

        mockApiGet.mockResolvedValue(mockResponse);

        const result = await queryService.getCached('non-cached-query');

        expect(result.success).toBe(false);
      });
    });

    describe('clearCache', () => {
      it('should clear cache for specific query', async () => {
        const queryId = 'query-to-clear';
        const mockResponse = {
          success: true,
          data: {
            cleared: true,
            entriesCleared: 1
          }
        };

        mockApiDelete.mockResolvedValue(mockResponse);

        const result = await queryService.clearCache(queryId);

        expect(mockApiDelete).toHaveBeenCalledWith(`/reports/query/cache/${queryId}`);
        expect(result).toEqual(mockResponse);
      });

      it('should clear all cache entries', async () => {
        const mockResponse = {
          success: true,
          data: {
            cleared: true,
            entriesCleared: 25
          }
        };

        mockApiDelete.mockResolvedValue(mockResponse);

        const result = await queryService.clearCache();

        expect(mockApiDelete).toHaveBeenCalledWith('/reports/query/cache');
        expect(result.data.entriesCleared).toBe(25);
      });

      it('should handle cache clear errors', async () => {
        const error = new Error('Cache clear failed');
        mockApiDelete.mockRejectedValue(error);

        await expect(queryService.clearCache('failing-query')).rejects.toThrow('Cache clear failed');
      });
    });
  });

  describe('Graph API methods', () => {
    describe('executeGraphQuery', () => {
      it('should execute Graph query with options', async () => {
        const queryId = 'graph-users-basic';
        const parameters = { filter: "department eq 'IT'" };
        const options = {
          includeCount: true,
          pageSize: 50,
          maxRecords: 1000,
          saveHistory: true
        };

        const mockResult: QueryExecutionResult = {
          queryId,
          executedAt: '2025-01-15T13:00:00Z',
          success: true,
          data: [
            { id: '1', displayName: 'John IT', department: 'IT' },
            { id: '2', displayName: 'Jane IT', department: 'IT' }
          ],
          metadata: {
            executionTime: 200,
            rowCount: 2,
            totalCount: 2,
            cached: false
          }
        };

        const mockResponse = {
          success: true,
          data: mockResult
        };

        mockApiPost.mockResolvedValue(mockResponse);

        const result = await queryService.executeGraphQuery(queryId, parameters, options);

        expect(mockApiPost).toHaveBeenCalledWith('/reports/query/graph/execute', {
          queryId,
          parameters,
          options
        });
        expect(result).toEqual(mockResponse);
      });

      it('should execute Graph query without options', async () => {
        const queryId = 'graph-simple';

        const mockResponse = {
          success: true,
          data: {
            queryId,
            executedAt: '2025-01-15T13:05:00Z',
            success: true,
            data: [],
            metadata: { executionTime: 100, rowCount: 0, cached: false }
          }
        };

        mockApiPost.mockResolvedValue(mockResponse);

        await queryService.executeGraphQuery(queryId);

        expect(mockApiPost).toHaveBeenCalledWith('/reports/query/graph/execute', {
          queryId,
          parameters: undefined,
          options: undefined
        });
      });
    });

    describe('getGraphDefinitions', () => {
      it('should get Graph query definitions', async () => {
        const mockResponse = {
          success: true,
          data: {
            queries: [
              { id: 'graph-users', name: 'Users Query', category: 'Users', dataSource: 'graph' },
              { id: 'graph-groups', name: 'Groups Query', category: 'Groups', dataSource: 'graph' }
            ],
            total: 2,
            categories: ['Users', 'Groups', 'Applications']
          }
        };

        mockApiGet.mockResolvedValue(mockResponse);

        const result = await queryService.getGraphDefinitions();

        expect(mockApiGet).toHaveBeenCalledWith('/reports/query/graph/definitions', undefined, {
          useCache: true,
          cacheTTL: 300,
          priority: ApiPriority.NORMAL
        });
        expect(result).toEqual(mockResponse);
      });

      it('should get filtered Graph definitions', async () => {
        const params = { category: 'Users', search: 'active' };

        mockApiGet.mockResolvedValue({
          success: true,
          data: { queries: [], total: 0, categories: [] }
        });

        await queryService.getGraphDefinitions(params);

        expect(mockApiGet).toHaveBeenCalledWith('/reports/query/graph/definitions', params, {
          useCache: true,
          cacheTTL: 300,
          priority: ApiPriority.NORMAL
        });
      });
    });

    describe('getGraphHistory', () => {
      it('should get Graph execution history with pagination', async () => {
        const params = {
          queryId: 'graph-users',
          limit: 25,
          offset: 50
        };

        const mockResponse = {
          success: true,
          data: {
            history: [
              {
                id: 'hist-1',
                queryId: 'graph-users',
                executedAt: '2025-01-15T12:00:00Z',
                success: true,
                rowCount: 100
              }
            ],
            total: 150,
            limit: 25,
            offset: 50
          }
        };

        mockApiGet.mockResolvedValue(mockResponse);

        const result = await queryService.getGraphHistory(params);

        expect(mockApiGet).toHaveBeenCalledWith('/reports/query/graph/history', params);
        expect(result).toEqual(mockResponse);
      });
    });

    describe('executeGraphBatch', () => {
      it('should execute multiple Graph queries in batch', async () => {
        const queries = [
          { queryId: 'graph-users', parameters: { top: 10 } },
          { queryId: 'graph-groups', parameters: { filter: "startsWith(displayName, 'Dev')" } }
        ];

        const options = {
          includeCount: true,
          saveHistory: true
        };

        const mockResponse = {
          success: true,
          data: {
            results: [
              {
                queryId: 'graph-users',
                executedAt: '2025-01-15T14:00:00Z',
                success: true,
                data: [{ id: '1' }],
                metadata: { executionTime: 150, rowCount: 1, cached: false }
              },
              {
                queryId: 'graph-groups',
                executedAt: '2025-01-15T14:00:00Z',
                success: true,
                data: [{ id: 'group1' }],
                metadata: { executionTime: 200, rowCount: 1, cached: false }
              }
            ],
            totalQueries: 2,
            successCount: 2,
            executedAt: '2025-01-15T14:00:00Z',
            executedBy: 'testuser'
          }
        };

        mockApiPost.mockResolvedValue(mockResponse);

        const result = await queryService.executeGraphBatch(queries, options);

        expect(mockApiPost).toHaveBeenCalledWith('/reports/query/graph/batch', {
          queries,
          options
        });
        expect(result).toEqual(mockResponse);
        expect(result.data.successCount).toBe(2);
      });

      it('should handle batch execution with failures', async () => {
        const queries = [
          { queryId: 'valid-query' },
          { queryId: 'invalid-query' }
        ];

        const mockResponse = {
          success: true,
          data: {
            results: [
              {
                queryId: 'valid-query',
                executedAt: '2025-01-15T14:05:00Z',
                success: true,
                data: [{}],
                metadata: { executionTime: 100, rowCount: 1, cached: false }
              },
              {
                queryId: 'invalid-query',
                executedAt: '2025-01-15T14:05:00Z',
                success: false,
                data: [],
                metadata: { executionTime: 50, rowCount: 0, cached: false, error: 'Query not found' }
              }
            ],
            totalQueries: 2,
            successCount: 1,
            executedAt: '2025-01-15T14:05:00Z',
            executedBy: 'testuser'
          }
        };

        mockApiPost.mockResolvedValue(mockResponse);

        const result = await queryService.executeGraphBatch(queries);

        expect(result.data.successCount).toBe(1);
        expect(result.data.results[1].success).toBe(false);
      });
    });
  });

  describe('integration scenarios', () => {
    it('should handle concurrent query executions', async () => {
      const mockResponse1 = {
        success: true,
        data: { queryId: 'query1', executedAt: '2025-01-15T15:00:00Z', success: true, data: [{ id: 1 }], metadata: { executionTime: 100, rowCount: 1, cached: false } }
      };
      const mockResponse2 = {
        success: true,
        data: { queryId: 'query2', executedAt: '2025-01-15T15:00:00Z', success: true, data: [{ id: 2 }], metadata: { executionTime: 150, rowCount: 1, cached: false } }
      };

      mockApiPost
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2);

      const [result1, result2] = await Promise.all([
        queryService.execute('query1'),
        queryService.execute('query2')
      ]);

      expect(result1.data.queryId).toBe('query1');
      expect(result2.data.queryId).toBe('query2');
      expect(mockApiPost).toHaveBeenCalledTimes(2);
    });

    it('should handle schema caching across multiple requests', async () => {
      const dataSource = 'postgres';
      const cachedSchema = {
        success: true,
        data: { tables: [], fields: [] }
      };

      // First request - cache miss, fetch from API
      mockSchemaCache.get.mockReturnValueOnce(null);
      mockApiGet.mockResolvedValueOnce(cachedSchema);

      // Second request - cache hit
      mockSchemaCache.get.mockReturnValueOnce(cachedSchema);

      const result1 = await queryService.getSchema(dataSource);
      const result2 = await queryService.getSchema(dataSource);

      expect(result1).toEqual(cachedSchema);
      expect(result2).toEqual(cachedSchema);
      expect(mockApiGet).toHaveBeenCalledTimes(1); // Only called once due to caching
      expect(mockSchemaCache.set).toHaveBeenCalledTimes(1);
    });
  });
});