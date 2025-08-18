/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { useCallback, useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  executeQueryAsync,
  executeDynamicQueryAsync,
  fetchQueryDefinitionsAsync,
  fetchGraphDefinitionsAsync,
  executeGraphQueryAsync,
  validateQueryAsync,
  fetchQueryHealthAsync,
  fetchQueryMetricsAsync,
  clearQueryCacheAsync,
  setSelectedDefinition,
  setFilterByDataSource,
  setSearchQuery,
  setSortBy,
  setBuilderQuery,
  clearBuilderState,
  evictCacheEntry,
  selectQueryState,
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
  selectFilteredDefinitions,
} from '@/store/slices/querySlice';
import { QueryDefinition, DynamicQuerySpec } from '@/types';

// Hook for query execution
export const useQueryExecution = (queryId?: string) => {
  const dispatch = useAppDispatch();
  const loading = useAppSelector(state => queryId ? selectQueryLoadingState(queryId)(state) : false);
  const error = useAppSelector(state => queryId ? selectQueryError(queryId)(state) : null);
  const activeExecutions = useAppSelector(selectActiveExecutions);
  const executionHistory = useAppSelector(selectExecutionHistory);

  const execute = useCallback(async (
    id: string,
    parameters?: Record<string, unknown>,
    options?: {
      skipCache?: boolean;
      credentialId?: number;
      timeout?: number;
    }
  ) => {
    // Check if this is a Graph query
    if (id.startsWith('graph_')) {
      const result = await dispatch(executeGraphQueryAsync({
        queryId: id,
        parameters,
        options
      }));
      
      if (executeGraphQueryAsync.fulfilled.match(result)) {
        return result.payload;
      } else {
        throw new Error(result.payload as string);
      }
    }
    
    const result = await dispatch(executeQueryAsync({
      queryId: id,
      parameters,
      options
    }));
    
    if (executeQueryAsync.fulfilled.match(result)) {
      return result.payload;
    } else {
      throw new Error(result.payload as string);
    }
  }, [dispatch]);

  const executeDynamic = useCallback(async (querySpec: DynamicQuerySpec) => {
    const result = await dispatch(executeDynamicQueryAsync(querySpec));
    
    if (executeDynamicQueryAsync.fulfilled.match(result)) {
      return result.payload;
    } else {
      throw new Error(result.payload as string);
    }
  }, [dispatch]);

  return {
    execute,
    executeDynamic,
    loading,
    error,
    activeExecutions,
    executionHistory,
  };
};

// Hook for query definitions
export const useQueryDefinitions = (filters?: {
  dataSource?: string;
  category?: string;
  search?: string;
}) => {
  const dispatch = useAppDispatch();
  const queryState = useAppSelector(selectQueryState);
  const definitions = useAppSelector(selectFilteredDefinitions);
  const loading = queryState.definitions.loading;
  const error = queryState.definitions.error;

  const fetchDefinitions = useCallback(async () => {
    try {
      const action = fetchQueryDefinitionsAsync(filters || undefined);
      if (!action || typeof action !== 'function') {
        console.error('fetchQueryDefinitionsAsync did not return a valid action');
        return;
      }
      const result = await dispatch(action);
      
      // If fetching Azure definitions, also fetch Graph queries
      if (filters?.dataSource === 'azure' || filters?.category === 'azure') {
        const graphAction = fetchGraphDefinitionsAsync();
        if (graphAction && typeof graphAction === 'function') {
          await dispatch(graphAction);
        }
      }
      
      return result;
    } catch (error) {
      console.error('Error in fetchDefinitions:', error);
      throw error;
    }
  }, [dispatch, filters]);

  // Auto-fetch on mount if not loaded
  useEffect(() => {
    if (definitions.length === 0 && !loading && !error) {
      // Add a small delay to ensure store is properly initialized
      const timeoutId = setTimeout(() => {
        if (typeof fetchQueryDefinitionsAsync === 'function') {
          fetchDefinitions();
        } else {
          console.warn('fetchQueryDefinitionsAsync is not available');
        }
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [definitions.length, loading, error, fetchDefinitions]);

  const getDefinitionById = useCallback((id: string) => {
    return selectQueryDefinitionById(id);
  }, []);

  const setFilters = useCallback((newFilters: {
    dataSource?: string | null;
    search?: string;
    sortBy?: { sortBy: 'name' | 'lastExecuted' | 'executionCount'; sortOrder: 'asc' | 'desc' };
  }) => {
    if (newFilters.dataSource !== undefined) {
      dispatch(setFilterByDataSource(newFilters.dataSource));
    }
    if (newFilters.search !== undefined) {
      dispatch(setSearchQuery(newFilters.search));
    }
    if (newFilters.sortBy) {
      dispatch(setSortBy(newFilters.sortBy));
    }
  }, [dispatch]);

  return {
    definitions,
    loading,
    error,
    fetchDefinitions,
    getDefinitionById,
    setFilters,
    ui: queryState.ui,
  };
};

// Hook for query builder
export const useQueryBuilder = () => {
  const dispatch = useAppDispatch();
  const builderState = useAppSelector(selectBuilderState);

  const setQuery = useCallback((query: DynamicQuerySpec | null) => {
    dispatch(setBuilderQuery(query));
  }, [dispatch]);

  const validateQuery = useCallback(async (queryDef: QueryDefinition, parameters?: Record<string, unknown>) => {
    const result = await dispatch(validateQueryAsync({ queryDef, parameters }));
    
    if (validateQueryAsync.fulfilled.match(result)) {
      return result.payload;
    } else {
      throw new Error(result.payload as string);
    }
  }, [dispatch]);

  const clearBuilder = useCallback(() => {
    dispatch(clearBuilderState());
  }, [dispatch]);

  return {
    ...builderState,
    setQuery,
    validateQuery,
    clearBuilder,
  };
};

// Hook for query cache management
export const useQueryCache = () => {
  const dispatch = useAppDispatch();
  const cacheState = useAppSelector(state => state.query.resultsCache);

  const getCachedResult = useCallback((queryId: string, parameters: Record<string, any>) => {
    return selectCachedResult(queryId, parameters);
  }, []);

  const clearCache = useCallback(async (queryId?: string) => {
    await dispatch(clearQueryCacheAsync(queryId));
  }, [dispatch]);

  const evictEntry = useCallback((queryId: string, cacheKey: string) => {
    dispatch(evictCacheEntry({ queryId, cacheKey }));
  }, [dispatch]);

  return {
    cacheState,
    getCachedResult,
    clearCache,
    evictEntry,
  };
};

// Hook for query health and metrics
export const useQueryMetrics = () => {
  const dispatch = useAppDispatch();
  const health = useAppSelector(selectQueryHealth);
  const metrics = useAppSelector(selectQueryMetrics);
  const executionHistory = useAppSelector(selectExecutionHistory);
  const healthLoading = useAppSelector(state => state.query?.health?.loading || false);
  const metricsLoading = useAppSelector(state => state.query?.metrics?.loading || false);

  const fetchHealth = useCallback(async () => {
    await dispatch(fetchQueryHealthAsync());
  }, [dispatch]);

  const fetchMetrics = useCallback(async (queryId?: string) => {
    await dispatch(fetchQueryMetricsAsync(queryId));
  }, [dispatch]);

  const getQueryStatistics = useCallback((queryId: string) => {
    return selectQueryStatistics(queryId);
  }, []);

  return {
    health,
    metrics: metrics ? {
      ...metrics,
      executionHistory: executionHistory || []
    } : null,
    executionHistory: executionHistory || [],
    healthLoading,
    metricsLoading,
    fetchHealth,
    fetchMetrics,
    getQueryStatistics,
  };
};

// Main hook that combines all query functionality
export const useQuery = () => {
  const queryExecution = useQueryExecution();
  const queryDefinitions = useQueryDefinitions();
  const queryBuilder = useQueryBuilder();
  const queryCache = useQueryCache();
  const queryMetrics = useQueryMetrics();
  
  const dispatch = useAppDispatch();
  const queryState = useAppSelector(selectQueryState);

  const selectDefinition = useCallback((definitionId: string | null) => {
    dispatch(setSelectedDefinition(definitionId));
  }, [dispatch]);

  return {
    // State
    state: queryState,
    
    // Execution
    ...queryExecution,
    
    // Definitions
    definitions: queryDefinitions.definitions,
    definitionsLoading: queryDefinitions.loading,
    definitionsError: queryDefinitions.error,
    fetchDefinitions: queryDefinitions.fetchDefinitions,
    setDefinitionFilters: queryDefinitions.setFilters,
    
    // Builder
    builder: queryBuilder,
    
    // Cache
    cache: queryCache,
    
    // Metrics
    metrics: queryMetrics,
    
    // UI
    selectedDefinitionId: queryState.ui.selectedDefinitionId,
    selectDefinition,
  };
};


// Migration hook removed - all components now use unified query system directly