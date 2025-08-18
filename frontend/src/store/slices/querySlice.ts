/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { createSlice, createAsyncThunk, PayloadAction, createSelector } from '@reduxjs/toolkit';
import { 
  QueryDefinition, 
  QueryExecutionResult, 
  QueryValidationResult,
  QueryHealthStatus,
  QueryStatistics,
  QueryMetrics,
  DynamicQuerySpec
} from '@/types';
import { queryService } from '@/services/queryService';
import { parseError } from '@/utils/errorHandler';

// Types for query execution tracking
interface QueryExecution {
  id: string;
  queryId: string;
  parameters: Record<string, unknown>;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startTime: number;
  endTime?: number;
  result?: QueryExecutionResult;
  error?: string;
}

// Cache entry structure
interface CacheEntry {
  result: QueryExecutionResult;
  timestamp: number;
  ttl: number;
  parameters: Record<string, unknown>;
  cacheKey: string;
}

// Query state structure
interface QueryState {
  // Query Definitions
  definitions: {
    byId: Record<string, QueryDefinition>;
    allIds: string[];
    loading: boolean;
    error: string | null;
    lastFetch: number | null;
  };
  
  // Query Executions
  executions: {
    byId: Record<string, QueryExecution>;
    activeIds: string[];
    historyIds: string[];
    loading: Record<string, boolean>; // Per-query loading states
    errors: Record<string, string>;   // Per-query errors
  };
  
  // Query Results Cache
  resultsCache: {
    byQueryId: Record<string, CacheEntry[]>; // Multiple cache entries per query
    cacheKeys: string[]; // Array for Redux serialization
    maxCacheSize: number;
    currentSize: number;
  };
  
  // Dynamic Query Builder
  builder: {
    currentQuery: DynamicQuerySpec | null;
    validationResult: QueryValidationResult | null;
    previewData: unknown[] | null;
    isValidating: boolean;
    isTesting: boolean;
    error: string | null;
  };
  
  // Query Metrics
  metrics: {
    overall: QueryMetrics | null;
    byQuery: Record<string, QueryStatistics>;
    lastUpdate: number | null;
    loading: boolean;
  };
  
  // Health Status
  health: {
    status: QueryHealthStatus | null;
    lastCheck: number | null;
    loading: boolean;
    error: string | null;
  };
  
  // UI State
  ui: {
    selectedDefinitionId: string | null;
    filterByDataSource: string | null;
    searchQuery: string;
    sortBy: 'name' | 'lastExecuted' | 'executionCount';
    sortOrder: 'asc' | 'desc';
  };
}

// Initial state
const initialState: QueryState = {
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
    maxCacheSize: 100, // Maximum number of cached results
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
    sortBy: 'name',
    sortOrder: 'asc',
  },
};

// Helper functions
function generateCacheKey(queryId: string, parameters: Record<string, unknown>): string {
  const sortedParams = JSON.stringify(parameters, Object.keys(parameters).sort());
  return `${queryId}:${sortedParams}`;
}

function generateExecutionId(): string {
  return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function isStale(cacheEntry: CacheEntry): boolean {
  const age = Date.now() - cacheEntry.timestamp;
  return age > cacheEntry.ttl * 1000; // TTL is in seconds
}

// Async thunks
export const fetchQueryDefinitionsAsync = createAsyncThunk(
  'query/fetchDefinitions',
  async (params: { dataSource?: string; category?: string; search?: string } | undefined, { rejectWithValue }) => {
    try {
      const response = await queryService.getDefinitions(params);
      if (response && response.success && ((response as any).data)) {
        return {
          definitions: ((response as any).data).definitions || [],
          timestamp: Date.now()
        };
      }
      // Ensure we always return a valid action payload
      return rejectWithValue(response?.error || 'Failed to fetch query definitions');
    } catch (error) {
      const appError = parseError(error);
      // Ensure we always return a valid action payload
      return rejectWithValue(appError?.message || 'Unknown error occurred');
    }
  }
);

export const executeQueryAsync = createAsyncThunk(
  'query/execute',
  async (
    { queryId, parameters = {}, options = {} }: {
      queryId: string;
      parameters?: Record<string, unknown>;
      options?: {
        skipCache?: boolean;
        credentialId?: number;
        timeout?: number;
      };
    },
    { getState, rejectWithValue }
  ) => {
    try {
      // Check cache first unless skipCache is true
      if (!options.skipCache) {
        const state = getState() as { query: QueryState };
        const cacheKey = generateCacheKey(queryId, parameters);
        const cachedEntries = state.query.resultsCache.byQueryId[queryId] || [];
        const cached = cachedEntries.find(entry => entry.cacheKey === cacheKey && !isStale(entry));
        
        if (cached) {
          return {
            queryId,
            parameters,
            result: cached.result,
            fromCache: true,
            timestamp: Date.now()
          };
        }
      }
      
      // Execute query
      const response = await queryService.execute(queryId, parameters, options);
      if (response.success && ((response as any).data)) {
        return {
          queryId,
          parameters,
          result: ((response as any).data),
          fromCache: false,
          timestamp: Date.now()
        };
      }
      
      return rejectWithValue(response.error || 'Query execution failed');
    } catch (error) {
      const appError = parseError(error);
      return rejectWithValue(appError.message);
    }
  }
);

export const executeDynamicQueryAsync = createAsyncThunk(
  'query/executeDynamic',
  async (querySpec: DynamicQuerySpec, { rejectWithValue }) => {
    try {
      const response = await queryService.build(querySpec);
      if (response.success && ((response as any).data)) {
        return {
          executionId: generateExecutionId(),
          querySpec,
          result: ((response as any).data),
          timestamp: Date.now()
        };
      }
      return rejectWithValue(response.error || 'Dynamic query execution failed');
    } catch (error) {
      const appError = parseError(error);
      return rejectWithValue(appError.message);
    }
  }
);

export const validateQueryAsync = createAsyncThunk(
  'query/validate',
  async ({ queryDef, parameters }: { queryDef: QueryDefinition; parameters?: Record<string, unknown> }, { rejectWithValue }) => {
    try {
      const response = await queryService.validate(queryDef, parameters);
      if (response.success && ((response as any).data)) {
        return ((response as any).data);
      }
      return rejectWithValue(response.error || 'Query validation failed');
    } catch (error) {
      const appError = parseError(error);
      return rejectWithValue(appError.message);
    }
  }
);

export const fetchQueryHealthAsync = createAsyncThunk(
  'query/fetchHealth',
  async (_, { rejectWithValue }) => {
    try {
      const response = await queryService.getHealth();
      if (response.success && ((response as any).data)) {
        return {
          status: ((response as any).data),
          timestamp: Date.now()
        };
      }
      return rejectWithValue(response.error || 'Failed to fetch health status');
    } catch (error) {
      const appError = parseError(error);
      return rejectWithValue(appError.message);
    }
  }
);

export const fetchQueryMetricsAsync = createAsyncThunk(
  'query/fetchMetrics',
  async (queryId: string | undefined, { rejectWithValue }) => {
    try {
      if (queryId) {
        // Fetch specific query stats
        const response = await queryService.getStats(queryId);
        if (response.success && ((response as any).data)) {
          return {
            type: 'specific' as const,
            queryId,
            stats: ((response as any).data),
            timestamp: Date.now()
          };
        }
      } else {
        // Fetch overall metrics
        const response = await queryService.getMetrics();
        if (response.success && ((response as any).data)) {
          return {
            type: 'overall' as const,
            metrics: ((response as any).data),
            timestamp: Date.now()
          };
        }
      }
      return rejectWithValue('Failed to fetch metrics');
    } catch (error) {
      const appError = parseError(error);
      return rejectWithValue(appError.message);
    }
  }
);

export const clearQueryCacheAsync = createAsyncThunk(
  'query/clearCache',
  async (queryId: string | undefined, { rejectWithValue }) => {
    try {
      const response = await queryService.clearCache(queryId);
      if (response.success && ((response as any).data)) {
        return {
          queryId,
          cleared: ((response as any).data).cleared,
          entriesCleared: ((response as any).data).entriesCleared
        };
      }
      return rejectWithValue(response.error || 'Failed to clear cache');
    } catch (error) {
      const appError = parseError(error);
      return rejectWithValue(appError.message);
    }
  }
);

// Graph API specific async thunks
export const fetchGraphDefinitionsAsync = createAsyncThunk(
  'query/fetchGraphDefinitions',
  async (params: { category?: string; search?: string } | undefined, { rejectWithValue }) => {
    try {
      const response = await queryService.getGraphDefinitions(params);
      if (response.success && ((response as any).data)) {
        // Transform Graph queries to QueryDefinition format
        const definitions = ((response as any).data).queries.map((q: any) => ({
          ...q,
          dataSource: 'azure',
          isSystem: true,
          version: '1.0.0'
        }));
        return {
          definitions,
          timestamp: Date.now()
        };
      }
      return rejectWithValue(response.error || 'Failed to fetch Graph definitions');
    } catch (error) {
      const appError = parseError(error);
      return rejectWithValue(appError.message);
    }
  }
);

export const executeGraphQueryAsync = createAsyncThunk(
  'query/executeGraph',
  async (
    { queryId, parameters, options }: {
      queryId: string;
      parameters?: Record<string, unknown>;
      options?: {
        skipCache?: boolean;
        credentialId?: number;
        timeout?: number;
      };
    },
    { rejectWithValue }
  ) => {
    try {
      const response = await queryService.executeGraphQuery(queryId, parameters, options);
      if (response.success && ((response as any).data)) {
        return {
          executionId: generateExecutionId(),
          queryId,
          parameters,
          result: ((response as any).data),
          fromCache: false,
          timestamp: Date.now()
        };
      }
      return rejectWithValue(response.error || 'Graph query execution failed');
    } catch (error) {
      const appError = parseError(error);
      return rejectWithValue(appError.message);
    }
  }
);

// Query slice
const querySlice = createSlice({
  name: 'query',
  initialState,
  reducers: {
    // UI state management
    setSelectedDefinition: (state, action: PayloadAction<string | null>) => {
      state.ui.selectedDefinitionId = action.payload;
    },
    setFilterByDataSource: (state, action: PayloadAction<string | null>) => {
      state.ui.filterByDataSource = action.payload;
    },
    setSearchQuery: (state, action: PayloadAction<string>) => {
      state.ui.searchQuery = action.payload;
    },
    setSortBy: (state, action: PayloadAction<{ sortBy: 'name' | 'lastExecuted' | 'executionCount'; sortOrder: 'asc' | 'desc' }>) => {
      state.ui.sortBy = action.payload.sortBy;
      state.ui.sortOrder = action.payload.sortOrder;
    },
    
    // Builder state management
    setBuilderQuery: (state, action: PayloadAction<DynamicQuerySpec | null>) => {
      state.builder.currentQuery = action.payload;
      state.builder.error = null;
    },
    clearBuilderState: (state) => {
      state.builder = initialState.builder;
    },
    
    // Manual cache management
    evictCacheEntry: (state, action: PayloadAction<{ queryId: string; cacheKey: string }>) => {
      const { queryId, cacheKey } = action.payload;
      if (state.resultsCache.byQueryId[queryId]) {
        state.resultsCache.byQueryId[queryId] = state.resultsCache.byQueryId[queryId].filter(
          entry => entry.cacheKey !== cacheKey
        );
        state.resultsCache.cacheKeys = state.resultsCache.cacheKeys.filter(k => k !== cacheKey);
        state.resultsCache.currentSize--;
      }
    },
    
    // Clear all state
    resetQueryState: () => initialState,
  },
  extraReducers: (builder) => {
    // Fetch query definitions
    builder
      .addCase(fetchQueryDefinitionsAsync.pending, (state) => {
        state.definitions.loading = true;
        state.definitions.error = null;
      })
      .addCase(fetchQueryDefinitionsAsync.fulfilled, (state, action) => {
        const { definitions, timestamp } = action.payload;
        state.definitions.loading = false;
        state.definitions.lastFetch = timestamp;
        
        // Update definitions
        state.definitions.byId = {};
        state.definitions.allIds = [];
        
        definitions.forEach(def => {
          state.definitions.byId[def.id] = def;
          state.definitions.allIds.push(def.id);
        });
      })
      .addCase(fetchQueryDefinitionsAsync.rejected, (state, action) => {
        state.definitions.loading = false;
        state.definitions.error = action.payload as string;
      });
    
    // Execute query
    builder
      .addCase(executeQueryAsync.pending, (state, action) => {
        const queryId = action.meta.arg.queryId;
        state.executions.loading[queryId] = true;
        state.executions.errors[queryId] = '';
        
        // Create execution record
        const executionId = generateExecutionId();
        const execution: QueryExecution = {
          id: executionId,
          queryId,
          parameters: action.meta.arg.parameters || {},
          status: 'pending',
          startTime: Date.now()
        };
        
        state.executions.byId[executionId] = execution;
        state.executions.activeIds.push(executionId);
      })
      .addCase(executeQueryAsync.fulfilled, (state, action) => {
        const { queryId, parameters, result, fromCache, timestamp } = action.payload;
        
        state.executions.loading[queryId] = false;
        
        // Find the pending execution for this query
        const executionKey = Object.keys(state.executions.byId).find(
          key => state.executions.byId[key].queryId === queryId && 
                 state.executions.byId[key].status === 'pending' &&
                 JSON.stringify(state.executions.byId[key].parameters) === JSON.stringify(parameters || {})
        );
        
        if (executionKey) {
          state.executions.byId[executionKey].status = 'completed';
          state.executions.byId[executionKey].endTime = timestamp;
          state.executions.byId[executionKey].result = result;
          
          // Move from active to history
          state.executions.activeIds = state.executions.activeIds.filter(id => id !== executionKey);
          state.executions.historyIds.unshift(executionKey);
        }
        
        // Update cache if not from cache
        if (!fromCache) {
          const cacheKey = generateCacheKey(queryId, parameters || {});
          const cacheEntry: CacheEntry = {
            result,
            timestamp,
            ttl: 300, // Default 5 minutes TTL
            parameters: parameters || {},
            cacheKey
          };
          
          // Initialize array if needed
          if (!state.resultsCache.byQueryId[queryId]) {
            state.resultsCache.byQueryId[queryId] = [];
          }
          
          // Add to cache
          state.resultsCache.byQueryId[queryId].push(cacheEntry);
          if (!state.resultsCache.cacheKeys.includes(cacheKey)) {
            state.resultsCache.cacheKeys.push(cacheKey);
          }
          state.resultsCache.currentSize++;
          
          // Evict oldest entries if cache is full
          if (state.resultsCache.currentSize > state.resultsCache.maxCacheSize) {
            // Simple LRU: remove oldest entry
            const allEntries = Object.entries(state.resultsCache.byQueryId)
              .flatMap(([qId, entries]) => entries.map(e => ({ ...e, queryId: qId })))
              .sort((a, b) => a.timestamp - b.timestamp);
            
            if (allEntries.length > 0) {
              const oldest = allEntries[0];
              state.resultsCache.byQueryId[oldest.queryId] = 
                state.resultsCache.byQueryId[oldest.queryId].filter(e => e.cacheKey !== oldest.cacheKey);
              state.resultsCache.cacheKeys = state.resultsCache.cacheKeys.filter(k => k !== oldest.cacheKey);
              state.resultsCache.currentSize--;
            }
          }
        }
        
        // Limit history size
        if (state.executions.historyIds.length > 50) {
          const removed = state.executions.historyIds.pop();
          if (removed) {
            delete state.executions.byId[removed];
          }
        }
      })
      .addCase(executeQueryAsync.rejected, (state, action) => {
        const queryId = action.meta.arg.queryId;
        const parameters = action.meta.arg.parameters || {};
        state.executions.loading[queryId] = false;
        state.executions.errors[queryId] = action.payload as string;
        
        // Find the pending execution for this query
        const executionKey = Object.keys(state.executions.byId).find(
          key => state.executions.byId[key].queryId === queryId && 
                 state.executions.byId[key].status === 'pending' &&
                 JSON.stringify(state.executions.byId[key].parameters) === JSON.stringify(parameters)
        );
        
        if (executionKey) {
          state.executions.byId[executionKey].status = 'failed';
          state.executions.byId[executionKey].endTime = Date.now();
          state.executions.byId[executionKey].error = action.payload as string;
          
          // Move from active to history
          state.executions.activeIds = state.executions.activeIds.filter(id => id !== executionKey);
          state.executions.historyIds.unshift(executionKey);
        }
      });
    
    // Validate query
    builder
      .addCase(validateQueryAsync.pending, (state) => {
        state.builder.isValidating = true;
        state.builder.error = null;
      })
      .addCase(validateQueryAsync.fulfilled, (state, action) => {
        state.builder.isValidating = false;
        state.builder.validationResult = action.payload;
      })
      .addCase(validateQueryAsync.rejected, (state, action) => {
        state.builder.isValidating = false;
        state.builder.error = action.payload as string;
      });
    
    // Fetch health
    builder
      .addCase(fetchQueryHealthAsync.pending, (state) => {
        state.health.loading = true;
        state.health.error = null;
      })
      .addCase(fetchQueryHealthAsync.fulfilled, (state, action) => {
        state.health.loading = false;
        state.health.status = action.payload.status;
        state.health.lastCheck = action.payload.timestamp;
      })
      .addCase(fetchQueryHealthAsync.rejected, (state, action) => {
        state.health.loading = false;
        state.health.error = action.payload as string;
      });
    
    // Fetch metrics
    builder
      .addCase(fetchQueryMetricsAsync.pending, (state) => {
        state.metrics.loading = true;
      })
      .addCase(fetchQueryMetricsAsync.fulfilled, (state, action) => {
        state.metrics.loading = false;
        state.metrics.lastUpdate = action.payload.timestamp;
        
        if (action.payload.type === 'overall') {
          state.metrics.overall = action.payload.metrics;
        } else {
          state.metrics.byQuery[action.payload.queryId] = action.payload.stats;
        }
      })
      .addCase(fetchQueryMetricsAsync.rejected, (state) => {
        state.metrics.loading = false;
      });
    
    // Clear cache
    builder
      .addCase(clearQueryCacheAsync.fulfilled, (state, action) => {
        const { queryId } = action.payload;
        
        if (queryId) {
          // Clear specific query cache
          delete state.resultsCache.byQueryId[queryId];
          
          // Remove cache keys
          const keysToRemove = Array.from(state.resultsCache.cacheKeys).filter(key => key.startsWith(`${queryId}:`));
          state.resultsCache.cacheKeys = state.resultsCache.cacheKeys.filter(k => !keysToRemove.includes(k));
          
          state.resultsCache.currentSize -= keysToRemove.length;
        } else {
          // Clear all cache
          state.resultsCache.byQueryId = {};
          state.resultsCache.cacheKeys = [];
          state.resultsCache.currentSize = 0;
        }
      });
    
    // Graph API definitions
    builder
      .addCase(fetchGraphDefinitionsAsync.pending, (state) => {
        state.definitions.loading = true;
        state.definitions.error = null;
      })
      .addCase(fetchGraphDefinitionsAsync.fulfilled, (state, action) => {
        const { definitions, timestamp } = action.payload;
        state.definitions.loading = false;
        state.definitions.lastFetch = timestamp;
        
        // Add Graph definitions to the store
        definitions.forEach((def: QueryDefinition) => {
          state.definitions.byId[def.id] = def;
          if (!state.definitions.allIds.includes(def.id)) {
            state.definitions.allIds.push(def.id);
          }
        });
      })
      .addCase(fetchGraphDefinitionsAsync.rejected, (state, action) => {
        state.definitions.loading = false;
        state.definitions.error = action.payload as string || 'Failed to fetch Graph definitions';
      });
    
    // Execute dynamic query
    builder
      .addCase(executeDynamicQueryAsync.pending, (state, action) => {
        const executionId = generateExecutionId();
        const execution: QueryExecution = {
          id: executionId,
          queryId: 'dynamic-query',
          parameters: action.meta.arg,
          status: 'pending',
          startTime: Date.now()
        };
        
        state.executions.byId[executionId] = execution;
        state.executions.activeIds.push(executionId);
      })
      .addCase(executeDynamicQueryAsync.fulfilled, (state, action) => {
        const { executionId, result, timestamp } = action.payload;
        
        // Find the pending execution
        const executionKey = Object.keys(state.executions.byId).find(
          key => state.executions.byId[key].status === 'pending' && 
                 JSON.stringify(state.executions.byId[key].parameters) === JSON.stringify(action.meta.arg)
        );
        
        if (executionKey) {
          state.executions.byId[executionKey] = {
            ...state.executions.byId[executionKey],
            status: 'completed',
            endTime: timestamp,
            result
          };
          
          // Move from active to history
          state.executions.activeIds = state.executions.activeIds.filter(id => id !== executionKey);
          state.executions.historyIds.unshift(executionKey);
        }
      })
      .addCase(executeDynamicQueryAsync.rejected, (state, action) => {
        // Find the pending execution
        const executionKey = Object.keys(state.executions.byId).find(
          key => state.executions.byId[key].status === 'pending' && 
                 JSON.stringify(state.executions.byId[key].parameters) === JSON.stringify(action.meta.arg)
        );
        
        if (executionKey) {
          state.executions.byId[executionKey] = {
            ...state.executions.byId[executionKey],
            status: 'failed',
            endTime: Date.now(),
            error: action.payload as string
          };
          
          // Move from active to history
          state.executions.activeIds = state.executions.activeIds.filter(id => id !== executionKey);
          state.executions.historyIds.unshift(executionKey);
        }
      });
    
    // Graph query execution
    builder
      .addCase(executeGraphQueryAsync.pending, (state, action) => {
        const queryId = action.meta.arg.queryId;
        state.executions.loading[queryId] = true;
        state.executions.errors[queryId] = '';
        
        // Create execution entry
        const execution: QueryExecution = {
          id: generateExecutionId(),
          queryId,
          parameters: action.meta.arg.parameters || {},
          status: 'pending',
          startTime: Date.now()
        };
        
        state.executions.byId[execution.id] = execution;
        state.executions.activeIds.push(execution.id);
      })
      .addCase(executeGraphQueryAsync.fulfilled, (state, action) => {
        const { executionId: _executionId, queryId, parameters, result, timestamp } = action.payload;
        state.executions.loading[queryId] = false;
        
        // Update execution
        const executionKey = Object.keys(state.executions.byId).find(
          key => state.executions.byId[key].queryId === queryId && 
                 state.executions.byId[key].status === 'pending'
        );
        
        if (executionKey) {
          state.executions.byId[executionKey] = {
            ...state.executions.byId[executionKey],
            status: 'completed',
            endTime: timestamp,
            result
          };
          
          // Move from active to history
          state.executions.activeIds = state.executions.activeIds.filter(id => id !== executionKey);
          state.executions.historyIds.unshift(executionKey);
        }
        
        // Cache the result
        const cacheKey = generateCacheKey(queryId, parameters || {});
        const cacheEntry: CacheEntry = {
          result,
          timestamp,
          ttl: 300, // 5 minutes (in seconds)
          parameters: parameters ?? {},
          cacheKey
        };
        
        if (!state.resultsCache.byQueryId[queryId]) {
          state.resultsCache.byQueryId[queryId] = [];
        }
        
        // Add to cache, removing oldest if at limit
        state.resultsCache.byQueryId[queryId].unshift(cacheEntry);
        state.resultsCache.cacheKeys.push(cacheKey);
        state.resultsCache.currentSize++;
        
        // Enforce cache size limit
        while (state.resultsCache.currentSize > state.resultsCache.maxCacheSize) {
          // Remove oldest cache entries
          const oldestKey = state.resultsCache.cacheKeys.shift();
          if (oldestKey) {
            // Find and remove the entry
            Object.keys(state.resultsCache.byQueryId).forEach(qId => {
              state.resultsCache.byQueryId[qId] = state.resultsCache.byQueryId[qId].filter(
                entry => entry.cacheKey !== oldestKey
              );
            });
            state.resultsCache.currentSize--;
          }
        }
      })
      .addCase(executeGraphQueryAsync.rejected, (state, action) => {
        const queryId = action.meta.arg.queryId;
        state.executions.loading[queryId] = false;
        state.executions.errors[queryId] = action.payload as string || 'Graph query execution failed';
        
        // Update execution
        const executionKey = Object.keys(state.executions.byId).find(
          key => state.executions.byId[key].queryId === queryId && 
                 state.executions.byId[key].status === 'pending'
        );
        
        if (executionKey) {
          state.executions.byId[executionKey] = {
            ...state.executions.byId[executionKey],
            status: 'failed',
            endTime: Date.now(),
            error: action.payload as string
          };
          
          // Move from active to history
          state.executions.activeIds = state.executions.activeIds.filter(id => id !== executionKey);
          state.executions.historyIds.unshift(executionKey);
        }
      });
  },
});

// Export actions
export const {
  setSelectedDefinition,
  setFilterByDataSource,
  setSearchQuery,
  setSortBy,
  setBuilderQuery,
  clearBuilderState,
  evictCacheEntry,
  resetQueryState,
} = querySlice.actions;

// Selectors
export const selectQueryState = (state: { query: QueryState }) => state.query;

// Memoized selectors
export const selectQueryDefinitions = createSelector(
  [selectQueryState],
  (queryState) => queryState.definitions.allIds.map(id => queryState.definitions.byId[id])
);

export const selectQueryDefinitionById = (id: string) => createSelector(
  [selectQueryState],
  (queryState) => queryState.definitions.byId[id]
);

export const selectActiveExecutions = createSelector(
  [selectQueryState],
  (queryState) => queryState.executions.activeIds.map(id => queryState.executions.byId[id])
);

export const selectExecutionHistory = createSelector(
  [selectQueryState],
  (queryState) => queryState.executions.historyIds.map(id => queryState.executions.byId[id])
);

export const selectQueryLoadingState = (queryId: string) => createSelector(
  [selectQueryState],
  (queryState) => queryState.executions.loading[queryId] || false
);

export const selectQueryError = (queryId: string) => createSelector(
  [selectQueryState],
  (queryState) => queryState.executions.errors[queryId] || null
);

export const selectCachedResult = (queryId: string, parameters: Record<string, unknown>) => createSelector(
  [selectQueryState],
  (queryState) => {
    const cacheKey = generateCacheKey(queryId, parameters);
    const entries = queryState.resultsCache.byQueryId[queryId] || [];
    const cached = entries.find(entry => entry.cacheKey === cacheKey && !isStale(entry));
    return cached?.result || null;
  }
);

export const selectQueryHealth = createSelector(
  [selectQueryState],
  (queryState) => queryState.health.status
);

export const selectQueryMetrics = createSelector(
  [selectQueryState],
  (queryState) => ({
    ...queryState.metrics.overall,
    byQuery: queryState.metrics.byQuery
  })
);

export const selectQueryStatistics = (queryId: string) => createSelector(
  [selectQueryState],
  (queryState) => queryState.metrics.byQuery[queryId] || null
);

export const selectBuilderState = createSelector(
  [selectQueryState],
  (queryState) => queryState.builder
);

export const selectFilteredDefinitions = createSelector(
  [selectQueryDefinitions, selectQueryState],
  (definitions, queryState) => {
    let filtered = definitions;
    
    // Filter by data source
    if (queryState.ui.filterByDataSource) {
      filtered = filtered.filter(def => def.dataSource === queryState.ui.filterByDataSource);
    }
    
    // Filter by search query
    if (queryState.ui.searchQuery) {
      const search = queryState.ui.searchQuery.toLowerCase();
      filtered = filtered.filter(def =>
        def.name.toLowerCase().includes(search) ||
        def.description?.toLowerCase().includes(search) ||
        def.id.toLowerCase().includes(search)
      );
    }
    
    // Sort
    filtered.sort((a, b) => {
      let compareValue = 0;
      
      switch (queryState.ui.sortBy) {
        case 'name':
          compareValue = a.name.localeCompare(b.name);
          break;
        case 'lastExecuted':
          // Would need execution data for this
          compareValue = 0;
          break;
        case 'executionCount':
          // Would need metrics data for this
          compareValue = 0;
          break;
      }
      
      return queryState.ui.sortOrder === 'asc' ? compareValue : -compareValue;
    });
    
    return filtered;
  }
);

export default querySlice.reducer;