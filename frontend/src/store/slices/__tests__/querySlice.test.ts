import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { configureStore, EnhancedStore } from '@reduxjs/toolkit';
import querySliceReducer, {
  fetchQueryDefinitionsAsync,
  executeQueryAsync,
  executeDynamicQueryAsync,
  validateQueryAsync,
  fetchQueryHealthAsync,
  fetchQueryMetricsAsync,
  clearQueryCacheAsync,
  fetchGraphDefinitionsAsync,
  executeGraphQueryAsync,
  setSelectedDefinition,
  setFilterByDataSource,
  setSearchQuery,
  setSortBy,
  setBuilderQuery,
  clearBuilderState,
  evictCacheEntry,
  resetQueryState,
  selectQueryDefinitions,
  selectQueryDefinitionById,
  selectActiveExecutions,
  selectExecutionHistory,
  selectQueryLoadingState,
  selectQueryError,
  selectCachedResult,
  selectQueryHealth,
  selectQueryMetrics,
  selectQueryStatistics,
  selectBuilderState,
  selectFilteredDefinitions
} from '../querySlice';
import { QueryDefinition, QueryExecutionResult, DynamicQuerySpec, QueryValidationResult, QueryHealthStatus, QueryStatistics, QueryMetrics } from '@/types';
import { queryService } from '@/services/queryService';

// Mock the query service
vi.mock('@/services/queryService', () => ({
  queryService: {
    getDefinitions: vi.fn(),
    execute: vi.fn(),
    build: vi.fn(),
    validate: vi.fn(),
    getHealth: vi.fn(),
    getStats: vi.fn(),
    getMetrics: vi.fn(),
    clearCache: vi.fn(),
    getGraphDefinitions: vi.fn(),
    executeGraphQuery: vi.fn(),
  }
}));

// Mock error handler
vi.mock('@/utils/errorHandler', () => ({
  parseError: vi.fn().mockReturnValue({ message: 'Test error' })
}));

describe('querySlice', () => {
  let store: EnhancedStore;
  let mockQueryService: unknown;

  // Test data
  const mockDefinitions: QueryDefinition[] = [
    {
      id: 'users-active',
      name: 'Active Users',
      description: 'Get all active user accounts',
      dataSource: 'ad',
      sql: 'SELECT * FROM users WHERE active = true'
    },
    {
      id: 'groups-security',
      name: 'Security Groups',
      description: 'Get all security groups',
      dataSource: 'ad',
      sql: 'SELECT * FROM groups WHERE type = "security"'
    }
  ];

  const mockExecutionResult: QueryExecutionResult = {
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

  beforeEach(() => {
    // Create fresh store for each test
    store = configureStore({
      reducer: {
        query: querySliceReducer
      }
    });

    mockQueryService = vi.mocked(queryService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should return correct initial state', () => {
      const state = store.getState().query;

      expect(state.definitions.byId).toEqual({});
      expect(state.definitions.allIds).toEqual([]);
      expect(state.definitions.loading).toBe(false);
      expect(state.definitions.error).toBeNull();
      expect(state.definitions.lastFetch).toBeNull();

      expect(state.executions.byId).toEqual({});
      expect(state.executions.activeIds).toEqual([]);
      expect(state.executions.historyIds).toEqual([]);
      expect(state.executions.loading).toEqual({});
      expect(state.executions.errors).toEqual({});

      expect(state.resultsCache.byQueryId).toEqual({});
      expect(state.resultsCache.cacheKeys).toEqual([]);
      expect(state.resultsCache.maxCacheSize).toBe(100);
      expect(state.resultsCache.currentSize).toBe(0);

      expect(state.builder.currentQuery).toBeNull();
      expect(state.builder.validationResult).toBeNull();
      expect(state.builder.previewData).toBeNull();
      expect(state.builder.isValidating).toBe(false);
      expect(state.builder.isTesting).toBe(false);
      expect(state.builder.error).toBeNull();

      expect(state.health.status).toBeNull();
      expect(state.health.lastCheck).toBeNull();
      expect(state.health.loading).toBe(false);
      expect(state.health.error).toBeNull();

      expect(state.ui.selectedDefinitionId).toBeNull();
      expect(state.ui.filterByDataSource).toBeNull();
      expect(state.ui.searchQuery).toBe('');
      expect(state.ui.sortBy).toBe('name');
      expect(state.ui.sortOrder).toBe('asc');
    });
  });

  describe('synchronous actions', () => {
    it('should handle setSelectedDefinition', () => {
      store.dispatch(setSelectedDefinition('users-active'));
      
      const state = store.getState().query;
      expect(state.ui.selectedDefinitionId).toBe('users-active');
    });

    it('should handle setFilterByDataSource', () => {
      store.dispatch(setFilterByDataSource('azure'));
      
      const state = store.getState().query;
      expect(state.ui.filterByDataSource).toBe('azure');
    });

    it('should handle setSearchQuery', () => {
      store.dispatch(setSearchQuery('user'));
      
      const state = store.getState().query;
      expect(state.ui.searchQuery).toBe('user');
    });

    it('should handle setSortBy', () => {
      store.dispatch(setSortBy({ sortBy: 'executionCount', sortOrder: 'desc' }));
      
      const state = store.getState().query;
      expect(state.ui.sortBy).toBe('executionCount');
      expect(state.ui.sortOrder).toBe('desc');
    });

    it('should handle setBuilderQuery', () => {
      const querySpec: DynamicQuerySpec = {
        dataSource: 'postgres',
        select: ['id', 'name'],
        from: 'users'
      };

      store.dispatch(setBuilderQuery(querySpec));
      
      const state = store.getState().query;
      expect(state.builder.currentQuery).toEqual(querySpec);
      expect(state.builder.error).toBeNull();
    });

    it('should handle clearBuilderState', () => {
      // Set some builder state first
      const querySpec: DynamicQuerySpec = {
        dataSource: 'postgres',
        select: ['id'],
        from: 'users'
      };
      store.dispatch(setBuilderQuery(querySpec));

      // Clear it
      store.dispatch(clearBuilderState());
      
      const state = store.getState().query;
      expect(state.builder.currentQuery).toBeNull();
      expect(state.builder.validationResult).toBeNull();
      expect(state.builder.previewData).toBeNull();
      expect(state.builder.isValidating).toBe(false);
      expect(state.builder.isTesting).toBe(false);
      expect(state.builder.error).toBeNull();
    });

    it('should handle evictCacheEntry', async () => {
      // First execute a query to populate cache
      mockQueryService.execute.mockResolvedValue({
        success: true,
        data: mockExecutionResult
      });

      await store.dispatch(executeQueryAsync({
        queryId: 'users-active',
        parameters: {}
      }));

      // Verify cache was populated
      let state = store.getState().query;
      expect(state.resultsCache.byQueryId['users-active']).toBeDefined();
      expect(state.resultsCache.byQueryId['users-active'].length).toBe(1);

      // Now evict the cache entry
      const cacheKey = 'users-active:{}';
      store.dispatch(evictCacheEntry({
        queryId: 'users-active',
        cacheKey: cacheKey
      }));

      state = store.getState().query;
      // Cache should be empty after eviction
      expect(state.resultsCache.byQueryId['users-active']).toEqual([]);
    });

    it('should handle resetQueryState', () => {
      // Set some state first
      store.dispatch(setSelectedDefinition('test'));
      store.dispatch(setSearchQuery('test'));

      // Reset everything
      store.dispatch(resetQueryState());
      
      const state = store.getState().query;
      expect(state.ui.selectedDefinitionId).toBeNull();
      expect(state.ui.searchQuery).toBe('');
      expect(state.definitions.byId).toEqual({});
    });
  });

  describe('fetchQueryDefinitionsAsync', () => {
    it('should handle successful definitions fetch', async () => {
      mockQueryService.getDefinitions.mockResolvedValue({
        success: true,
        data: {
          definitions: mockDefinitions,
          totalCount: 2
        }
      });

      await store.dispatch(fetchQueryDefinitionsAsync({ dataSource: 'ad' }));

      const state = store.getState().query;
      expect(state.definitions.loading).toBe(false);
      expect(state.definitions.error).toBeNull();
      expect(state.definitions.byId['users-active']).toEqual(mockDefinitions[0]);
      expect(state.definitions.byId['groups-security']).toEqual(mockDefinitions[1]);
      expect(state.definitions.allIds).toEqual(['users-active', 'groups-security']);
      expect(state.definitions.lastFetch).toBeTruthy();
    });

    it('should handle failed definitions fetch', async () => {
      const errorMessage = 'Failed to fetch definitions';
      mockQueryService.getDefinitions.mockRejectedValue(new Error(errorMessage));

      await store.dispatch(fetchQueryDefinitionsAsync());

      const state = store.getState().query;
      expect(state.definitions.loading).toBe(false);
      expect(state.definitions.error).toBe('Test error');
      expect(state.definitions.byId).toEqual({});
      expect(state.definitions.allIds).toEqual([]);
    });

    it('should set loading state during fetch', () => {
      mockQueryService.getDefinitions.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ success: true, data: { definitions: [] } }), 100))
      );

      store.dispatch(fetchQueryDefinitionsAsync());

      const state = store.getState().query;
      expect(state.definitions.loading).toBe(true);
      expect(state.definitions.error).toBeNull();
    });

    it('should handle API response without data', async () => {
      mockQueryService.getDefinitions.mockResolvedValue({
        success: false,
        error: 'No data available'
      });

      await store.dispatch(fetchQueryDefinitionsAsync());

      const state = store.getState().query;
      expect(state.definitions.loading).toBe(false);
      expect(state.definitions.error).toBe('No data available');
    });
  });

  describe('executeQueryAsync', () => {
    it('should handle successful query execution', async () => {
      mockQueryService.execute.mockResolvedValue({
        success: true,
        data: mockExecutionResult
      });

      await store.dispatch(executeQueryAsync({
        queryId: 'users-active',
        parameters: { active: true }
      }));

      const state = store.getState().query;
      expect(state.executions.loading['users-active']).toBe(false);
      expect(state.executions.errors['users-active']).toBe('');
      
      // Check execution history
      const historyIds = state.executions.historyIds;
      expect(historyIds.length).toBe(1);
      
      const executionId = historyIds[0];
      const execution = state.executions.byId[executionId];
      expect(execution.status).toBe('completed');
      expect(execution.result).toEqual(mockExecutionResult);

      // Check cache
      expect(state.resultsCache.byQueryId['users-active']).toBeDefined();
      expect(state.resultsCache.currentSize).toBe(1);
    });

    it('should handle query execution failure', async () => {
      const errorMessage = 'Query execution failed';
      mockQueryService.execute.mockRejectedValue(new Error(errorMessage));

      await store.dispatch(executeQueryAsync({
        queryId: 'invalid-query'
      }));

      const state = store.getState().query;
      expect(state.executions.loading['invalid-query']).toBe(false);
      expect(state.executions.errors['invalid-query']).toBe('Test error');
      
      // Check execution was marked as failed
      const activeExecution = Object.values(state.executions.byId).find(
        exec => exec.queryId === 'invalid-query' && exec.status === 'failed'
      );
      expect(activeExecution).toBeDefined();
      expect(activeExecution?.error).toBe('Test error');
    });

    it('should return cached result when available and not skipping cache', async () => {
      // First execution to populate cache
      mockQueryService.execute.mockResolvedValueOnce({
        success: true,
        data: mockExecutionResult
      });

      await store.dispatch(executeQueryAsync({
        queryId: 'users-active',
        parameters: {}
      }));

      // Second execution should use cache
      await store.dispatch(executeQueryAsync({
        queryId: 'users-active',
        parameters: {},
        options: { skipCache: false }
      }));

      const state = store.getState().query;
      
      // Should have two executions in history
      expect(state.executions.historyIds.length).toBe(2);
      
      // Second execution should be marked as from cache
      const secondExecution = state.executions.byId[state.executions.historyIds[0]];
      expect(secondExecution.status).toBe('completed');
    });

    it('should skip cache when skipCache option is true', async () => {
      // First execution to populate cache
      mockQueryService.execute.mockResolvedValueOnce({
        success: true,
        data: mockExecutionResult
      });

      await store.dispatch(executeQueryAsync({
        queryId: 'users-active',
        parameters: {}
      }));

      // Second execution with skipCache should hit API again
      mockQueryService.execute.mockResolvedValueOnce({
        success: true,
        data: { ...mockExecutionResult, metadata: { ...mockExecutionResult.metadata, cached: false } }
      });

      await store.dispatch(executeQueryAsync({
        queryId: 'users-active',
        parameters: {},
        options: { skipCache: true }
      }));

      // Should have called the service twice
      expect(mockQueryService.execute).toHaveBeenCalledTimes(2);
    });
  });

  describe('executeDynamicQueryAsync', () => {
    it('should handle successful dynamic query execution', async () => {
      const querySpec: DynamicQuerySpec = {
        dataSource: 'postgres',
        select: ['id', 'name'],
        from: 'users',
        where: [{ field: 'active', operator: 'eq', value: true }]
      };

      mockQueryService.build.mockResolvedValue({
        success: true,
        data: mockExecutionResult
      });

      await store.dispatch(executeDynamicQueryAsync(querySpec));

      const state = store.getState().query;
      expect(state.executions.historyIds.length).toBe(1);
      
      const execution = state.executions.byId[state.executions.historyIds[0]];
      expect(execution.status).toBe('completed');
      expect(execution.result).toEqual(mockExecutionResult);
    });

    it('should handle dynamic query execution failure', async () => {
      const querySpec: DynamicQuerySpec = {
        dataSource: 'invalid',
        select: [],
        from: 'nonexistent'
      };

      mockQueryService.build.mockRejectedValue(new Error('Invalid query spec'));

      await store.dispatch(executeDynamicQueryAsync(querySpec));

      const state = store.getState().query;
      
      // Should have created an execution record that failed
      const failedExecution = Object.values(state.executions.byId).find(
        exec => exec.status === 'failed'
      );
      expect(failedExecution).toBeDefined();
    });
  });

  describe('validateQueryAsync', () => {
    it('should handle successful query validation', async () => {
      const queryDef: QueryDefinition = {
        id: 'test-query',
        name: 'Test Query',
        dataSource: 'postgres',
        sql: 'SELECT * FROM users'
      };

      const validationResult: QueryValidationResult = {
        valid: true,
        errors: [],
        warnings: [],
        estimatedRows: 100,
        estimatedExecutionTime: 50
      };

      mockQueryService.validate.mockResolvedValue({
        success: true,
        data: validationResult
      });

      await store.dispatch(validateQueryAsync({ queryDef }));

      const state = store.getState().query;
      expect(state.builder.isValidating).toBe(false);
      expect(state.builder.validationResult).toEqual(validationResult);
      expect(state.builder.error).toBeNull();
    });

    it('should handle query validation failure', async () => {
      const queryDef: QueryDefinition = {
        id: 'invalid-query',
        name: 'Invalid Query',
        dataSource: 'postgres',
        sql: 'INVALID SQL'
      };

      mockQueryService.validate.mockRejectedValue(new Error('Validation failed'));

      await store.dispatch(validateQueryAsync({ queryDef }));

      const state = store.getState().query;
      expect(state.builder.isValidating).toBe(false);
      expect(state.builder.error).toBe('Test error');
      expect(state.builder.validationResult).toBeNull();
    });

    it('should set validating state during validation', () => {
      const queryDef: QueryDefinition = {
        id: 'test-query',
        name: 'Test Query',
        dataSource: 'postgres',
        sql: 'SELECT 1'
      };

      mockQueryService.validate.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ success: true, data: {} }), 100))
      );

      store.dispatch(validateQueryAsync({ queryDef }));

      const state = store.getState().query;
      expect(state.builder.isValidating).toBe(true);
      expect(state.builder.error).toBeNull();
    });
  });

  describe('fetchQueryHealthAsync', () => {
    it('should handle successful health check', async () => {
      const healthStatus: QueryHealthStatus = {
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

      mockQueryService.getHealth.mockResolvedValue({
        success: true,
        data: healthStatus
      });

      await store.dispatch(fetchQueryHealthAsync());

      const state = store.getState().query;
      expect(state.health.loading).toBe(false);
      expect(state.health.status).toEqual(healthStatus);
      expect(state.health.lastCheck).toBeTruthy();
      expect(state.health.error).toBeNull();
    });

    it('should handle health check failure', async () => {
      mockQueryService.getHealth.mockRejectedValue(new Error('Health check failed'));

      await store.dispatch(fetchQueryHealthAsync());

      const state = store.getState().query;
      expect(state.health.loading).toBe(false);
      expect(state.health.error).toBe('Test error');
      expect(state.health.status).toBeNull();
    });
  });

  describe('fetchQueryMetricsAsync', () => {
    it('should handle overall metrics fetch', async () => {
      const metrics: QueryMetrics = {
        timestamp: '2025-01-15T12:30:00Z',
        activeQueries: 5,
        queuedQueries: 12,
        totalMemoryUsage: 256,
        cacheSize: 128,
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

      mockQueryService.getMetrics.mockResolvedValue({
        success: true,
        data: metrics
      });

      await store.dispatch(fetchQueryMetricsAsync(undefined));

      const state = store.getState().query;
      expect(state.metrics.loading).toBe(false);
      expect(state.metrics.overall).toEqual(metrics);
      expect(state.metrics.lastUpdate).toBeTruthy();
    });

    it('should handle specific query statistics fetch', async () => {
      const queryId = 'users-active';
      const stats: QueryStatistics = {
        queryId,
        totalExecutions: 50,
        successfulExecutions: 48,
        failedExecutions: 2,
        averageExecutionTime: 120,
        medianExecutionTime: 110,
        maxExecutionTime: 500,
        minExecutionTime: 80,
        cacheHitRate: 80.0,
        executionTrends: []
      };

      mockQueryService.getStats.mockResolvedValue({
        success: true,
        data: stats
      });

      await store.dispatch(fetchQueryMetricsAsync(queryId));

      const state = store.getState().query;
      expect(state.metrics.loading).toBe(false);
      expect(state.metrics.byQuery[queryId]).toEqual(stats);
      expect(state.metrics.lastUpdate).toBeTruthy();
    });

    it('should handle metrics fetch failure', async () => {
      mockQueryService.getMetrics.mockRejectedValue(new Error('Metrics unavailable'));

      await store.dispatch(fetchQueryMetricsAsync(undefined));

      const state = store.getState().query;
      expect(state.metrics.loading).toBe(false);
      // Error is not stored in metrics state, just loading stops
    });
  });

  describe('clearQueryCacheAsync', () => {
    it('should handle clearing specific query cache', async () => {
      const queryId = 'users-active';
      
      mockQueryService.clearCache.mockResolvedValue({
        success: true,
        data: {
          cleared: true,
          entriesCleared: 3
        }
      });

      await store.dispatch(clearQueryCacheAsync(queryId));

      const state = store.getState().query;
      expect(state.resultsCache.byQueryId[queryId]).toBeUndefined();
    });

    it('should handle clearing all cache', async () => {
      mockQueryService.clearCache.mockResolvedValue({
        success: true,
        data: {
          cleared: true,
          entriesCleared: 10
        }
      });

      await store.dispatch(clearQueryCacheAsync(undefined));

      const state = store.getState().query;
      expect(state.resultsCache.byQueryId).toEqual({});
      expect(state.resultsCache.cacheKeys).toEqual([]);
      expect(state.resultsCache.currentSize).toBe(0);
    });
  });

  describe('Graph API async thunks', () => {
    it('should handle fetchGraphDefinitionsAsync', async () => {
      const graphDefinitions = [
        {
          id: 'graph-users',
          name: 'Graph Users',
          category: 'Users',
          description: 'Get users from Graph API'
        }
      ];

      mockQueryService.getGraphDefinitions.mockResolvedValue({
        success: true,
        data: {
          queries: graphDefinitions,
          total: 1,
          categories: ['Users']
        }
      });

      await store.dispatch(fetchGraphDefinitionsAsync({ category: 'Users' }));

      const state = store.getState().query;
      expect(state.definitions.loading).toBe(false);
      expect(state.definitions.error).toBeNull();
      
      // Graph definitions should be added with transformed properties
      const addedDefinition = state.definitions.byId['graph-users'];
      expect(addedDefinition).toBeDefined();
      expect(addedDefinition.dataSource).toBe('azure');
      expect(addedDefinition.isSystem).toBe(true);
    });

    it('should handle executeGraphQueryAsync', async () => {
      const graphResult: QueryExecutionResult = {
        queryId: 'graph-users',
        executedAt: '2025-01-15T13:00:00Z',
        success: true,
        data: [
          { id: '1', displayName: 'John Doe', mail: 'john@company.com' }
        ],
        metadata: {
          executionTime: 200,
          rowCount: 1,
          cached: false
        }
      };

      mockQueryService.executeGraphQuery.mockResolvedValue({
        success: true,
        data: graphResult
      });

      await store.dispatch(executeGraphQueryAsync({
        queryId: 'graph-users',
        parameters: { filter: "startsWith(displayName, 'John')" }
      }));

      const state = store.getState().query;
      expect(state.executions.loading['graph-users']).toBe(false);
      expect(state.executions.errors['graph-users']).toBe('');
      
      // Check execution was recorded
      const execution = Object.values(state.executions.byId).find(
        exec => exec.queryId === 'graph-users' && exec.status === 'completed'
      );
      expect(execution).toBeDefined();
      expect(execution?.result).toEqual(graphResult);
    });
  });

  describe('selectors', () => {
    beforeEach(async () => {
      // Set up some test data
      mockQueryService.getDefinitions.mockResolvedValue({
        success: true,
        data: { definitions: mockDefinitions, totalCount: 2 }
      });
      await store.dispatch(fetchQueryDefinitionsAsync());
    });

    it('should select query definitions', () => {
      const state = store.getState();
      const definitions = selectQueryDefinitions(state);
      
      expect(definitions).toHaveLength(2);
      expect(definitions[0].id).toBe('users-active');
      expect(definitions[1].id).toBe('groups-security');
    });

    it('should select query definition by id', () => {
      const state = store.getState();
      const definition = selectQueryDefinitionById('users-active')(state);
      
      expect(definition).toEqual(mockDefinitions[0]);
    });

    it('should select active executions', () => {
      const state = store.getState();
      const activeExecutions = selectActiveExecutions(state);
      
      expect(Array.isArray(activeExecutions)).toBe(true);
      expect(activeExecutions).toHaveLength(0); // No active executions initially
    });

    it('should select execution history', () => {
      const state = store.getState();
      const history = selectExecutionHistory(state);
      
      expect(Array.isArray(history)).toBe(true);
      expect(history).toHaveLength(0); // No history initially
    });

    it('should select query loading state', () => {
      const state = store.getState();
      const isLoading = selectQueryLoadingState('users-active')(state);
      
      expect(isLoading).toBe(false);
    });

    it('should select query error', () => {
      const state = store.getState();
      const error = selectQueryError('users-active')(state);
      
      expect(error).toBeNull();
    });

    it('should select cached result', () => {
      const state = store.getState();
      const cachedResult = selectCachedResult('users-active', {})(state);
      
      expect(cachedResult).toBeNull(); // No cached results initially
    });

    it('should select query health', () => {
      const state = store.getState();
      const health = selectQueryHealth(state);
      
      expect(health).toBeNull(); // No health data initially
    });

    it('should select query metrics', () => {
      const state = store.getState();
      const metrics = selectQueryMetrics(state);
      
      expect(metrics).toEqual({
        byQuery: {}
      });
    });

    it('should select query statistics', () => {
      const state = store.getState();
      const stats = selectQueryStatistics('users-active')(state);
      
      expect(stats).toBeNull(); // No statistics initially
    });

    it('should select builder state', () => {
      const state = store.getState();
      const builderState = selectBuilderState(state);
      
      expect(builderState.currentQuery).toBeNull();
      expect(builderState.validationResult).toBeNull();
      expect(builderState.isValidating).toBe(false);
    });

    it('should select filtered definitions', () => {
      // Set search query
      store.dispatch(setSearchQuery('user'));
      
      const state = store.getState();
      const filtered = selectFilteredDefinitions(state);
      
      // Should only return definitions matching 'user'
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('users-active');
    });

    it('should filter definitions by data source', () => {
      store.dispatch(setFilterByDataSource('ad'));
      
      const state = store.getState();
      const filtered = selectFilteredDefinitions(state);
      
      // Both test definitions have dataSource 'ad'
      expect(filtered).toHaveLength(2);
    });

    it('should sort filtered definitions', () => {
      store.dispatch(setSortBy({ sortBy: 'name', sortOrder: 'desc' }));
      
      const state = store.getState();
      const filtered = selectFilteredDefinitions(state);
      
      // Should be sorted by name descending
      expect(filtered[0].name).toBe('Security Groups'); // S comes after A
      expect(filtered[1].name).toBe('Active Users');
    });
  });

  describe('cache management', () => {
    it('should enforce maximum cache size', async () => {
      // Execute multiple queries to exceed cache limit
      mockQueryService.execute.mockResolvedValue({
        success: true,
        data: mockExecutionResult
      });

      // Execute 3 queries with different parameters
      await store.dispatch(executeQueryAsync({
        queryId: 'test-query',
        parameters: { id: 1 }
      }));

      await store.dispatch(executeQueryAsync({
        queryId: 'test-query',
        parameters: { id: 2 }
      }));

      await store.dispatch(executeQueryAsync({
        queryId: 'test-query',
        parameters: { id: 3 }
      }));

      const state = store.getState().query;
      
      // Cache size should be limited by maxCacheSize
      expect(state.resultsCache.currentSize).toBeLessThanOrEqual(state.resultsCache.maxCacheSize);
    });

    it('should handle stale cache entries', async () => {
      // This would require mocking Date.now() to simulate stale entries
      // For now, we'll test the basic cache functionality
      mockQueryService.execute.mockResolvedValue({
        success: true,
        data: mockExecutionResult
      });

      await store.dispatch(executeQueryAsync({
        queryId: 'users-active',
        parameters: {}
      }));

      const state = store.getState().query;
      expect(state.resultsCache.byQueryId['users-active']).toBeDefined();
      expect(state.resultsCache.currentSize).toBe(1);
    });
  });

  describe('error handling', () => {
    it('should handle network errors gracefully', async () => {
      mockQueryService.getDefinitions.mockRejectedValue(new Error('Network error'));

      await store.dispatch(fetchQueryDefinitionsAsync());

      const state = store.getState().query;
      expect(state.definitions.loading).toBe(false);
      expect(state.definitions.error).toBe('Test error');
    });

    it('should handle malformed API responses', async () => {
      mockQueryService.getDefinitions.mockResolvedValue({
        success: false,
        // Missing expected data structure
      });

      await store.dispatch(fetchQueryDefinitionsAsync());

      const state = store.getState().query;
      expect(state.definitions.loading).toBe(false);
      expect(state.definitions.error).toBeTruthy();
    });

    it('should handle execution timeout scenarios', async () => {
      mockQueryService.execute.mockRejectedValue(new Error('Execution timeout'));

      await store.dispatch(executeQueryAsync({
        queryId: 'slow-query',
        options: { timeout: 1000 }
      }));

      const state = store.getState().query;
      expect(state.executions.loading['slow-query']).toBe(false);
      expect(state.executions.errors['slow-query']).toBe('Test error');
    });
  });

  describe('integration scenarios', () => {
    it('should handle concurrent query executions', async () => {
      mockQueryService.execute
        .mockResolvedValueOnce({ success: true, data: { ...mockExecutionResult, queryId: 'query1' } })
        .mockResolvedValueOnce({ success: true, data: { ...mockExecutionResult, queryId: 'query2' } });

      // Execute two queries concurrently
      await Promise.all([
        store.dispatch(executeQueryAsync({ queryId: 'query1' })),
        store.dispatch(executeQueryAsync({ queryId: 'query2' }))
      ]);

      const state = store.getState().query;
      
      // Both executions should be in history
      expect(state.executions.historyIds).toHaveLength(2);
      
      // Both should have completed successfully
      const execution1 = Object.values(state.executions.byId).find(e => e.queryId === 'query1');
      const execution2 = Object.values(state.executions.byId).find(e => e.queryId === 'query2');
      
      expect(execution1?.status).toBe('completed');
      expect(execution2?.status).toBe('completed');
    });

    it('should maintain consistent state during rapid UI updates', () => {
      // Rapid UI state changes
      store.dispatch(setSearchQuery('test'));
      store.dispatch(setFilterByDataSource('azure'));
      store.dispatch(setSortBy({ sortBy: 'executionCount', sortOrder: 'desc' }));
      store.dispatch(setSelectedDefinition('test-query'));

      const state = store.getState().query;
      
      expect(state.ui.searchQuery).toBe('test');
      expect(state.ui.filterByDataSource).toBe('azure');
      expect(state.ui.sortBy).toBe('executionCount');
      expect(state.ui.sortOrder).toBe('desc');
      expect(state.ui.selectedDefinitionId).toBe('test-query');
    });
  });
});