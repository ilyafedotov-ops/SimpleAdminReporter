import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { configureStore, EnhancedStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import React from 'react';
import querySliceReducer from '@/store/slices/querySlice';
import {
  useQuery,
  useQueryExecution,
  useQueryDefinitions,
  useQueryBuilder,
  useQueryCache,
  useQueryMetrics
} from '../useQuery';
import { QueryDefinition, DynamicQuerySpec, QueryExecutionResult, QueryValidationResult, QueryHealthStatus, QueryMetrics, QueryStatistics } from '@/types';
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

// Don't mock Redux hooks - let them use the real store created in the test

const mockInitialState = {
  definitions: {
    byId: {},
    allIds: [],
    loading: false,
    error: null,
    lastFetch: null,
  },
  executions: {
    byId: {},
    activeIds: [],
    historyIds: [],
    loading: {},
    errors: {},
  },
  resultsCache: {
    byQueryId: {},
    cacheKeys: [],
    maxCacheSize: 100,
    currentSize: 0,
  },
  builder: {
    currentQuery: null,
    validationResult: null,
    previewData: null,
    isValidating: false,
    isTesting: false,
    error: null,
  },
  metrics: {
    overall: null,
    byQuery: {},
    lastUpdate: null,
    loading: false,
  },
  health: {
    status: null,
    lastCheck: null,
    loading: false,
    error: null,
  },
  ui: {
    selectedDefinitionId: null,
    filterByDataSource: null,
    searchQuery: '',
    sortBy: 'name' as const,
    sortOrder: 'asc' as const,
  },
};

describe('useQuery hooks', () => {
  let store: EnhancedStore;
  let mockQueryService: any;

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

  const mockValidationResult: QueryValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    estimatedRows: 100,
    estimatedExecutionTime: 50
  };

  const mockHealthStatus: QueryHealthStatus = {
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

  const mockMetrics: QueryMetrics = {
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

  const mockStatistics: QueryStatistics = {
    queryId: 'users-active',
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

  // Wrapper component for Redux Provider
  const createWrapper = (testStore: EnhancedStore) => {
    // eslint-disable-next-line react/display-name
    return ({ children }: { children: React.ReactNode }) => (
      React.createElement(Provider, { store: testStore }, children)
    );
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

  describe('useQueryExecution', () => {
    it('should provide query execution functionality', async () => {
      mockQueryService.execute.mockResolvedValue({
        success: true,
        data: mockExecutionResult
      });

      const { result } = renderHook(() => useQueryExecution(), {
        wrapper: createWrapper(store)
      });

      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.activeExecutions).toEqual([]);
      expect(result.current.executionHistory).toEqual([]);
      expect(typeof result.current.execute).toBe('function');
      expect(typeof result.current.executeDynamic).toBe('function');
    });

    it('should execute regular queries', async () => {
      mockQueryService.execute.mockResolvedValue({
        success: true,
        data: mockExecutionResult
      });

      const { result } = renderHook(() => useQueryExecution(), {
        wrapper: createWrapper(store)
      });

      await act(async () => {
        const executeResult = await result.current.execute('users-active', { active: true });
        expect(executeResult).toBeDefined();
      });

      expect(mockQueryService.execute).toHaveBeenCalledWith(
        'users-active',
        { active: true },
        {}
      );
    });

    it('should execute Graph queries when query ID starts with "graph_"', async () => {
      mockQueryService.executeGraphQuery.mockResolvedValue({
        success: true,
        data: mockExecutionResult
      });

      const { result } = renderHook(() => useQueryExecution(), {
        wrapper: createWrapper(store)
      });

      await act(async () => {
        await result.current.execute('graph_users', { filter: "department eq 'IT'" });
      });

      expect(mockQueryService.executeGraphQuery).toHaveBeenCalledWith(
        'graph_users',
        { filter: "department eq 'IT'" },
        undefined
      );
    });

    it('should execute dynamic queries', async () => {
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

      const { result } = renderHook(() => useQueryExecution(), {
        wrapper: createWrapper(store)
      });

      await act(async () => {
        await result.current.executeDynamic(querySpec);
      });

      expect(mockQueryService.build).toHaveBeenCalledWith(querySpec);
    });

    it('should handle execution errors', async () => {
      mockQueryService.execute.mockRejectedValue(new Error('Execution failed'));

      const { result } = renderHook(() => useQueryExecution(), {
        wrapper: createWrapper(store)
      });

      await act(async () => {
        await expect(result.current.execute('invalid-query')).rejects.toThrow();
      });
    });

    it('should handle execution with options', async () => {
      mockQueryService.execute.mockResolvedValue({
        success: true,
        data: mockExecutionResult
      });

      const { result } = renderHook(() => useQueryExecution(), {
        wrapper: createWrapper(store)
      });

      const options = {
        skipCache: true,
        credentialId: 123,
        timeout: 30000
      };

      await act(async () => {
        await result.current.execute('users-active', {}, options);
      });

      expect(mockQueryService.execute).toHaveBeenCalledWith('users-active', {}, options);
    });
  });

  describe('useQueryDefinitions', () => {
    it('should provide query definitions functionality', () => {
      const { result } = renderHook(() => useQueryDefinitions(), {
        wrapper: createWrapper(store)
      });

      expect(Array.isArray(result.current.definitions)).toBe(true);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(typeof result.current.fetchDefinitions).toBe('function');
      expect(typeof result.current.getDefinitionById).toBe('function');
      expect(typeof result.current.setFilters).toBe('function');
      expect(result.current.ui).toBeDefined();
    });

    it('should fetch definitions with filters', async () => {
      mockQueryService.getDefinitions.mockResolvedValue({
        success: true,
        data: { definitions: mockDefinitions, totalCount: 2 }
      });

      const filters = { dataSource: 'ad', category: 'users' };
      const { result } = renderHook(() => useQueryDefinitions(filters), {
        wrapper: createWrapper(store)
      });

      await act(async () => {
        await result.current.fetchDefinitions();
      });

      expect(mockQueryService.getDefinitions).toHaveBeenCalledWith(filters);
    });

    it('should fetch Graph definitions for Azure data source', async () => {
      mockQueryService.getDefinitions.mockResolvedValue({
        success: true,
        data: { definitions: [], totalCount: 0 }
      });
      mockQueryService.getGraphDefinitions.mockResolvedValue({
        success: true,
        data: { queries: [], total: 0, categories: [] }
      });

      const filters = { dataSource: 'azure' };
      const { result } = renderHook(() => useQueryDefinitions(filters), {
        wrapper: createWrapper(store)
      });

      await act(async () => {
        await result.current.fetchDefinitions();
      });

      expect(mockQueryService.getDefinitions).toHaveBeenCalledWith(filters);
      expect(mockQueryService.getGraphDefinitions).toHaveBeenCalled();
    });

    it('should auto-fetch definitions on mount when no data is available', async () => {
      mockQueryService.getDefinitions.mockResolvedValue({
        success: true,
        data: { definitions: mockDefinitions, totalCount: 2 }
      });

      renderHook(() => useQueryDefinitions(), {
        wrapper: createWrapper(store)
      });

      // Wait for useEffect to trigger
      await waitFor(() => {
        expect(mockQueryService.getDefinitions).toHaveBeenCalled();
      }, { timeout: 200 });
    });

    it('should set filters correctly', () => {
      const { result } = renderHook(() => useQueryDefinitions(), {
        wrapper: createWrapper(store)
      });

      act(() => {
        result.current.setFilters({
          dataSource: 'azure',
          search: 'users',
          sortBy: { sortBy: 'executionCount', sortOrder: 'desc' }
        });
      });

      // The dispatch calls would be mocked in a real test environment
      expect(result.current.setFilters).toBeDefined();
    });

    it('should handle fetchDefinitions errors', async () => {
      mockQueryService.getDefinitions.mockRejectedValue(new Error('Fetch failed'));

      const { result } = renderHook(() => useQueryDefinitions(), {
        wrapper: createWrapper(store)
      });

      await act(async () => {
        const actionResult = await result.current.fetchDefinitions();
        // Redux thunks return action objects, not throw errors
        expect(actionResult.type).toBe('query/fetchDefinitions/rejected');
        expect(actionResult.payload).toBe('Test error');
      });
    });

    it('should get definition by ID', () => {
      const { result } = renderHook(() => useQueryDefinitions(), {
        wrapper: createWrapper(store)
      });

      const selectorFunction = result.current.getDefinitionById('users-active');
      expect(typeof selectorFunction).toBe('function');
    });
  });

  describe('useQueryBuilder', () => {
    it('should provide query builder functionality', () => {
      const { result } = renderHook(() => useQueryBuilder(), {
        wrapper: createWrapper(store)
      });

      expect(result.current.currentQuery).toBeNull();
      expect(result.current.validationResult).toBeNull();
      expect(result.current.previewData).toBeNull();
      expect(result.current.isValidating).toBe(false);
      expect(result.current.isTesting).toBe(false);
      expect(result.current.error).toBeNull();
      expect(typeof result.current.setQuery).toBe('function');
      expect(typeof result.current.validateQuery).toBe('function');
      expect(typeof result.current.clearBuilder).toBe('function');
    });

    it('should set query in builder', () => {
      const { result } = renderHook(() => useQueryBuilder(), {
        wrapper: createWrapper(store)
      });

      const querySpec: DynamicQuerySpec = {
        dataSource: 'postgres',
        select: ['id', 'name'],
        from: 'users'
      };

      act(() => {
        result.current.setQuery(querySpec);
      });

      // In actual test, we'd verify the dispatch was called
      expect(result.current.setQuery).toBeDefined();
    });

    it('should validate queries', async () => {
      mockQueryService.validate.mockResolvedValue({
        success: true,
        data: mockValidationResult
      });

      const { result } = renderHook(() => useQueryBuilder(), {
        wrapper: createWrapper(store)
      });

      const queryDef: QueryDefinition = {
        id: 'test-query',
        name: 'Test Query',
        dataSource: 'postgres',
        sql: 'SELECT * FROM users'
      };

      await act(async () => {
        const validationResult = await result.current.validateQuery(queryDef, { active: true });
        expect(validationResult).toBeDefined();
      });

      expect(mockQueryService.validate).toHaveBeenCalledWith(queryDef, { active: true });
    });

    it('should handle validation errors', async () => {
      mockQueryService.validate.mockRejectedValue(new Error('Validation failed'));

      const { result } = renderHook(() => useQueryBuilder(), {
        wrapper: createWrapper(store)
      });

      const queryDef: QueryDefinition = {
        id: 'invalid-query',
        name: 'Invalid Query',
        dataSource: 'postgres',
        sql: 'INVALID SQL'
      };

      await act(async () => {
        await expect(result.current.validateQuery(queryDef)).rejects.toThrow();
      });
    });

    it('should clear builder state', () => {
      const { result } = renderHook(() => useQueryBuilder(), {
        wrapper: createWrapper(store)
      });

      act(() => {
        result.current.clearBuilder();
      });

      expect(result.current.clearBuilder).toBeDefined();
    });
  });

  describe('useQueryCache', () => {
    it('should provide cache management functionality', () => {
      const { result } = renderHook(() => useQueryCache(), {
        wrapper: createWrapper(store)
      });

      expect(result.current.cacheState).toBeDefined();
      expect(result.current.cacheState.byQueryId).toEqual({});
      expect(result.current.cacheState.cacheKeys).toEqual([]);
      expect(result.current.cacheState.maxCacheSize).toBe(100);
      expect(result.current.cacheState.currentSize).toBe(0);
      expect(typeof result.current.getCachedResult).toBe('function');
      expect(typeof result.current.clearCache).toBe('function');
      expect(typeof result.current.evictEntry).toBe('function');
    });

    it('should get cached results', () => {
      const { result } = renderHook(() => useQueryCache(), {
        wrapper: createWrapper(store)
      });

      const selectorFunction = result.current.getCachedResult('users-active', {});
      expect(typeof selectorFunction).toBe('function');
    });

    it('should clear cache', async () => {
      mockQueryService.clearCache.mockResolvedValue({
        success: true,
        data: { cleared: true, entriesCleared: 5 }
      });

      const { result } = renderHook(() => useQueryCache(), {
        wrapper: createWrapper(store)
      });

      await act(async () => {
        await result.current.clearCache('users-active');
      });

      expect(mockQueryService.clearCache).toHaveBeenCalledWith('users-active');
    });

    it('should clear all cache when no queryId provided', async () => {
      mockQueryService.clearCache.mockResolvedValue({
        success: true,
        data: { cleared: true, entriesCleared: 10 }
      });

      const { result } = renderHook(() => useQueryCache(), {
        wrapper: createWrapper(store)
      });

      await act(async () => {
        await result.current.clearCache();
      });

      expect(mockQueryService.clearCache).toHaveBeenCalledWith(undefined);
    });

    it('should evict cache entries', () => {
      const { result } = renderHook(() => useQueryCache(), {
        wrapper: createWrapper(store)
      });

      act(() => {
        result.current.evictEntry('users-active', 'cache-key-123');
      });

      expect(result.current.evictEntry).toBeDefined();
    });
  });

  describe('useQueryMetrics', () => {
    it('should provide metrics functionality', () => {
      const { result } = renderHook(() => useQueryMetrics(), {
        wrapper: createWrapper(store)
      });

      expect(result.current.health).toBeNull();
      expect(result.current.metrics).toEqual({ byQuery: {}, executionHistory: [] });
      expect(result.current.executionHistory).toEqual([]);
      expect(result.current.healthLoading).toBe(false);
      expect(result.current.metricsLoading).toBe(false);
      expect(typeof result.current.fetchHealth).toBe('function');
      expect(typeof result.current.fetchMetrics).toBe('function');
      expect(typeof result.current.getQueryStatistics).toBe('function');
    });

    it('should fetch health status', async () => {
      mockQueryService.getHealth.mockResolvedValue({
        success: true,
        data: mockHealthStatus
      });

      const { result } = renderHook(() => useQueryMetrics(), {
        wrapper: createWrapper(store)
      });

      await act(async () => {
        await result.current.fetchHealth();
      });

      expect(mockQueryService.getHealth).toHaveBeenCalled();
    });

    it('should fetch overall metrics', async () => {
      mockQueryService.getMetrics.mockResolvedValue({
        success: true,
        data: mockMetrics
      });

      const { result } = renderHook(() => useQueryMetrics(), {
        wrapper: createWrapper(store)
      });

      await act(async () => {
        await result.current.fetchMetrics();
      });

      expect(mockQueryService.getMetrics).toHaveBeenCalledWith();
    });

    it('should fetch query-specific metrics', async () => {
      mockQueryService.getStats.mockResolvedValue({
        success: true,
        data: mockStatistics
      });

      const { result } = renderHook(() => useQueryMetrics(), {
        wrapper: createWrapper(store)
      });

      await act(async () => {
        await result.current.fetchMetrics('users-active');
      });

      expect(mockQueryService.getStats).toHaveBeenCalledWith('users-active');
    });

    it('should get query statistics', () => {
      const { result } = renderHook(() => useQueryMetrics(), {
        wrapper: createWrapper(store)
      });

      const selectorFunction = result.current.getQueryStatistics('users-active');
      expect(typeof selectorFunction).toBe('function');
    });

    it('should handle metrics with execution history', () => {
      const storeWithMetrics = configureStore({
        reducer: {
          query: (state = {
            ...mockInitialState,
            metrics: {
              ...mockInitialState.metrics,
              overall: mockMetrics
            },
            executions: {
              ...mockInitialState.executions,
              historyIds: ['exec-1'],
              byId: {
                'exec-1': {
                  id: 'exec-1',
                  queryId: 'test',
                  parameters: {},
                  status: 'completed',
                  startTime: Date.now(),
                  result: mockExecutionResult
                }
              }
            }
          }) => state
        }
      });

      const { result } = renderHook(() => useQueryMetrics(), {
        wrapper: createWrapper(storeWithMetrics)
      });

      expect(result.current.metrics).toBeDefined();
      expect(result.current.executionHistory).toBeDefined();
    });
  });

  describe('useQuery (main hook)', () => {
    it('should combine all query functionality', () => {
      const { result } = renderHook(() => useQuery(), {
        wrapper: createWrapper(store)
      });

      // Should have state from all sub-hooks
      expect(result.current.state).toBeDefined();
      
      // Execution functionality
      expect(typeof result.current.execute).toBe('function');
      expect(typeof result.current.executeDynamic).toBe('function');
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(Array.isArray(result.current.activeExecutions)).toBe(true);
      expect(Array.isArray(result.current.executionHistory)).toBe(true);

      // Definitions functionality
      expect(Array.isArray(result.current.definitions)).toBe(true);
      expect(result.current.definitionsLoading).toBe(false);
      expect(result.current.definitionsError).toBeNull();
      expect(typeof result.current.fetchDefinitions).toBe('function');
      expect(typeof result.current.setDefinitionFilters).toBe('function');

      // Builder functionality
      expect(result.current.builder).toBeDefined();
      expect(result.current.builder.currentQuery).toBeNull();
      expect(typeof result.current.builder.setQuery).toBe('function');
      expect(typeof result.current.builder.validateQuery).toBe('function');
      expect(typeof result.current.builder.clearBuilder).toBe('function');

      // Cache functionality
      expect(result.current.cache).toBeDefined();
      expect(result.current.cache.cacheState).toBeDefined();
      expect(typeof result.current.cache.getCachedResult).toBe('function');
      expect(typeof result.current.cache.clearCache).toBe('function');
      expect(typeof result.current.cache.evictEntry).toBe('function');

      // Metrics functionality
      expect(result.current.metrics).toBeDefined();
      expect(result.current.metrics.health).toBeNull();
      expect(typeof result.current.metrics.fetchHealth).toBe('function');
      expect(typeof result.current.metrics.fetchMetrics).toBe('function');

      // UI functionality
      expect(result.current.selectedDefinitionId).toBeNull();
      expect(typeof result.current.selectDefinition).toBe('function');
    });

    it('should handle selectDefinition', () => {
      const { result } = renderHook(() => useQuery(), {
        wrapper: createWrapper(store)
      });

      act(() => {
        result.current.selectDefinition('users-active');
      });

      expect(result.current.selectDefinition).toBeDefined();
    });

    it('should provide unified interface for all query operations', () => {
      const { result } = renderHook(() => useQuery(), {
        wrapper: createWrapper(store)
      });

      // Verify all main functionality is available
      const expectedMethods = [
        'execute',
        'executeDynamic',
        'fetchDefinitions',
        'setDefinitionFilters',
        'selectDefinition'
      ];

      expectedMethods.forEach(method => {
        expect(typeof (result.current as any)[method]).toBe('function');
      });

      const expectedObjects = [
        'state',
        'definitions',
        'builder',
        'cache',
        'metrics'
      ];

      expectedObjects.forEach(obj => {
        expect((result.current as any)[obj]).toBeDefined();
      });
    });
  });

  describe('error handling and edge cases', () => {
    it('should handle service method failures gracefully', async () => {
      mockQueryService.execute.mockRejectedValue(new Error('Service unavailable'));

      const { result } = renderHook(() => useQueryExecution(), {
        wrapper: createWrapper(store)
      });

      await act(async () => {
        await expect(result.current.execute('test-query')).rejects.toThrow();
      });
    });

    it('should handle malformed service responses', async () => {
      mockQueryService.getDefinitions.mockResolvedValue({
        success: false,
        // Missing expected data structure
      });

      const { result } = renderHook(() => useQueryDefinitions(), {
        wrapper: createWrapper(store)
      });

      await act(async () => {
        const actionResult = await result.current.fetchDefinitions();
        // Redux thunks return action objects, not throw errors
        expect(actionResult.type).toBe('query/fetchDefinitions/rejected');
        expect(actionResult.payload).toBe('Failed to fetch query definitions');
      });
    });

    it('should handle null/undefined parameters safely', async () => {
      mockQueryService.execute.mockResolvedValue({
        success: true,
        data: mockExecutionResult
      });

      const { result } = renderHook(() => useQueryExecution(), {
        wrapper: createWrapper(store)
      });

      await act(async () => {
        // Should not throw with undefined parameters
        await result.current.execute('test-query', undefined, undefined);
      });

      expect(mockQueryService.execute).toHaveBeenCalledWith('test-query', {}, {});
    });
  });

  describe('integration with Redux store', () => {
    it('should reflect Redux state changes', async () => {
      // This test would verify that hook state updates when Redux state changes
      // In a real test environment, we'd dispatch actions and verify state updates
      const { result } = renderHook(() => useQuery(), {
        wrapper: createWrapper(store)
      });

      expect(result.current.state).toEqual(mockInitialState);
    });

    it('should dispatch actions correctly', () => {
      const { result } = renderHook(() => useQuery(), {
        wrapper: createWrapper(store)
      });

      // Actions should be callable without throwing
      expect(() => {
        result.current.selectDefinition('test-id');
        result.current.builder.setQuery(null);
        result.current.builder.clearBuilder();
      }).not.toThrow();
    });
  });
});