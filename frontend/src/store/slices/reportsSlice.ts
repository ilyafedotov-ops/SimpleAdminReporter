/* eslint-disable @typescript-eslint/no-explicit-any */
import { createSlice, createAsyncThunk, PayloadAction, createSelector } from '@reduxjs/toolkit';
import { 
  ReportTemplate, 
  CustomReportTemplate, 
  CustomReportQuery,
  ReportExecution, 
  ReportResult,
  FieldMetadata,
  ReportFilter,
  QueryExecutionResult,
  QueryDefinition,
  PreviewResponse
} from '@/types';
import { reportsService } from '@/services/reportsService';
import { withRateLimitRetry } from '@/utils/rateLimitHandler';

interface ReportsState {
  // Pre-built templates
  templates: ReportTemplate[];
  templatesLoading: boolean;
  templatesError: string | null;

  // Custom reports
  customReports: CustomReportTemplate[];
  customReportsLoading: boolean;
  customReportsError: string | null;
  customReportsPagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };

  // Current report execution
  currentExecution: ReportExecution | null;
  currentResult: ReportResult | null;
  executionLoading: boolean;
  executionError: string | null;

  // Field discovery
  availableFields: Record<string, FieldMetadata[]>; // keyed by source
  fieldsLoading: boolean;
  fieldsError: string | null;

  // Report history
  reportHistory: ReportExecution[];
  historyLoading: boolean;
  historyError: string | null;
  historyPagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };

  // Template gallery
  templateGallery: CustomReportTemplate[];
  galleryLoading: boolean;
  galleryError: string | null;
  galleryPagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };

  // Report builder state
  reportBuilder: {
    query: CustomReportQuery;
    isValid: boolean;
    errors: string[];
    sampleData: Record<string, unknown>[];
    estimatedRows: number;
    testingQuery: boolean;
  };

  // Favorites
  favoriteReports: CustomReportTemplate[];
  favoritesLoading: boolean;

  // Report statistics
  reportStats: {
    totalReports: number;
    totalCustomReports: number;
    totalExecutions: number;
    recentExecutions: any[];
    popularReports: any[];
    reportsBySource: Record<string, number>;
    executionsByStatus: Record<string, number>;
  } | null;
  statsLoading: boolean;
  statsError: string | null;

  // UI state
  selectedCategory: string | null;
  selectedSource: 'ad' | 'azure' | 'o365' | null;
  searchQuery: string;
  filters: Record<string, string | number | boolean>;
}

const initialState: ReportsState = {
  templates: [],
  templatesLoading: false,
  templatesError: null,

  customReports: [],
  customReportsLoading: false,
  customReportsError: null,
  customReportsPagination: {
    page: 1,
    pageSize: 20,
    totalCount: 0,
    totalPages: 0,
  },

  currentExecution: null,
  currentResult: null,
  executionLoading: false,
  executionError: null,

  availableFields: {},
  fieldsLoading: false,
  fieldsError: null,

  reportHistory: [],
  historyLoading: false,
  historyError: null,
  historyPagination: {
    page: 1,
    pageSize: 20,
    totalCount: 0,
    totalPages: 0,
  },

  templateGallery: [],
  galleryLoading: false,
  galleryError: null,
  galleryPagination: {
    page: 1,
    pageSize: 20,
    totalCount: 0,
    totalPages: 0,
  },

  reportBuilder: {
    query: {
      fields: [],
      filters: [],
      groupBy: undefined,
      orderBy: undefined,
    },
    isValid: false,
    errors: [],
    sampleData: [],
    estimatedRows: 0,
    testingQuery: false,
  },

  favoriteReports: [],
  favoritesLoading: false,

  reportStats: null,
  statsLoading: false,
  statsError: null,

  selectedCategory: null,
  selectedSource: null,
  searchQuery: '',
  filters: {},
};

// Async thunks
export const fetchReportTemplatesAsync = createAsyncThunk(
  'reports/fetchTemplates',
  async (params: { category?: string; source?: string } | undefined, { rejectWithValue }) => {
    try {
      const response = await withRateLimitRetry(
        () => reportsService.getReportTemplates(params),
        { maxRetries: 3, initialDelay: 2000 }
      );
      if (response.success && ((response as any).data)) {
        // Handle new format: API now returns 'definitions' instead of 'templates'
        return ((response as any).data).definitions || ((response as any).data);
      } else {
        return rejectWithValue(response.error || 'Failed to fetch templates');
      }
    } catch (error) {
      return rejectWithValue(error instanceof Error ? ((error as any)?.message || String(error)) : 'Operation failed');
    }
  }
);

export const fetchCustomReportsAsync = createAsyncThunk(
  'reports/fetchCustomReports',
  async (params: {
    page?: number;
    pageSize?: number;
    category?: string;
    source?: 'ad' | 'azure' | 'o365';
    isPublic?: boolean;
    search?: string;
  } | undefined, { rejectWithValue }) => {
    try {
      const response = await withRateLimitRetry(
        () => reportsService.getCustomReports(params),
        { maxRetries: 3, initialDelay: 2000 }
      );
      if (response.success && ((response as any).data)) {
        return {
          data: ((response as any).data),
          totalCount: response.totalCount,
          page: response.page,
          pageSize: response.pageSize,
          totalPages: response.totalPages,
        };
      } else {
        return rejectWithValue(response.error || 'Failed to fetch custom reports');
      }
    } catch (error) {
      return rejectWithValue(error instanceof Error ? ((error as any)?.message || String(error)) : 'Operation failed');
    }
  }
);

export const executeReportAsync = createAsyncThunk(
  'reports/executeReport',
  async ({ 
    templateId, 
    parameters, 
    credentialId 
  }: { 
    templateId: string; 
    parameters?: Record<string, string | number | boolean | string[]>;
    credentialId?: number;
  }, { rejectWithValue }) => {
    try {
      const response = await reportsService.executeReport(templateId, parameters, credentialId);
      if (response.success && ((response as any).data)) {
        return ((response as any).data);
      } else {
        return rejectWithValue(response.error || 'Report execution failed');
      }
    } catch (error) {
      return rejectWithValue(error instanceof Error ? ((error as any)?.message || String(error)) : 'Operation failed');
    }
  }
);

export const fetchReportResultsAsync = createAsyncThunk(
  'reports/fetchReportResults',
  async (executionId: string, { rejectWithValue }) => {
    try {
      const response = await reportsService.getReportResults(executionId);
      if (response.success && ((response as any).data)) {
        return ((response as any).data);
      } else {
        return rejectWithValue(response.error || 'Failed to fetch report results');
      }
    } catch (error) {
      return rejectWithValue(error instanceof Error ? ((error as any)?.message || String(error)) : 'Operation failed');
    }
  }
);

export const executeCustomReportAsync = createAsyncThunk(
  'reports/executeCustomReport',
  async ({ reportId, parameters, credentialId }: { reportId: string; parameters?: Record<string, string | number | boolean | string[]>; credentialId?: number }, { rejectWithValue }) => {
    try {
      const response = await reportsService.executeCustomReport(reportId, parameters, credentialId);
      if (response.success && ((response as any).data)) {
        return ((response as any).data);
      } else {
        return rejectWithValue(response.error || 'Custom report execution failed');
      }
    } catch (error) {
      return rejectWithValue(error instanceof Error ? ((error as any)?.message || String(error)) : 'Operation failed');
    }
  }
);

export const fetchAvailableFieldsAsync = createAsyncThunk(
  'reports/fetchAvailableFields',
  async (source: 'ad' | 'azure' | 'o365', { rejectWithValue }) => {
    try {
      const response = await withRateLimitRetry(
        () => reportsService.getAvailableFields(source),
        { maxRetries: 3, initialDelay: 1000 }
      );
      if (response.success && ((response as any).data)) {
        // Handle both category-based and field-based responses
        let fields: FieldMetadata[] = [];
        if (((response as any).data).categories) {
          // Check if categories is an array or object
          if (Array.isArray(((response as any).data).categories)) {
            // Flatten categories array into fields
            fields = ((response as any).data).categories.reduce((acc: FieldMetadata[], category: any) => {
              return acc.concat(category.fields || []);
            }, []);
          } else {
            // Handle categories as object (keyed by category name)
            fields = Object.values(((response as any).data).categories).reduce((acc: FieldMetadata[], category: any) => {
              return acc.concat(category.fields || category || []);
            }, []);
          }
        } else if (((response as any).data).fields) {
          fields = ((response as any).data).fields;
        }
        return { source, fields };
      } else {
        return rejectWithValue(response.error || 'Failed to fetch fields');
      }
    } catch (error) {
      return rejectWithValue(error instanceof Error ? ((error as any)?.message || String(error)) : 'Operation failed');
    }
  }
);

export const testCustomQueryAsync = createAsyncThunk(
  'reports/testCustomQuery',
  async (params: { query: CustomReportQuery; source: 'ad' | 'azure' | 'o365'; parameters?: any; limit?: number }, { rejectWithValue }) => {
    try {
      const response: PreviewResponse = await reportsService.testCustomQuery(params.query, params.source, params.parameters, params.limit);
      if (response.success && response.data) {
        return {
          isValid: true,
          sampleData: response.data.testData || [],
          estimatedRows: response.data.rowCount || 0,
          errors: []
        };
      } else {
        return rejectWithValue(response.error?.message || 'Query test failed');
      }
    } catch (error) {
      return rejectWithValue(error instanceof Error ? ((error as any)?.message || String(error)) : 'Operation failed');
    }
  }
);

export const createCustomReportAsync = createAsyncThunk(
  'reports/createCustomReport',
  async (report: {
    name: string;
    description: string;
    source: 'ad' | 'azure' | 'o365';
    query: CustomReportQuery;
    isPublic?: boolean;
    category?: string;
    tags?: string[];
  }, { rejectWithValue }) => {
    try {
      const response = await reportsService.createCustomReport(report);
      if (response.success && ((response as any).data)) {
        return ((response as any).data);
      } else {
        return rejectWithValue(response.error || 'Failed to create custom report');
      }
    } catch (error) {
      return rejectWithValue(error instanceof Error ? ((error as any)?.message || String(error)) : 'Operation failed');
    }
  }
);

export const fetchReportHistoryAsync = createAsyncThunk(
  'reports/fetchReportHistory',
  async (params: {
    page?: number;
    pageSize?: number;
    status?: 'pending' | 'running' | 'completed' | 'failed';
    source?: 'ad' | 'azure' | 'o365';
    dateFrom?: string;
    dateTo?: string;
  } | undefined, { rejectWithValue }) => {
    try {
      const response = await reportsService.getReportHistory(params);
      if (response.success && ((response as any).data)) {
        return {
          data: ((response as any).data),
          totalCount: response.totalCount,
          page: response.page,
          pageSize: response.pageSize,
          totalPages: response.totalPages,
        };
      } else {
        return rejectWithValue(response.error || 'Failed to fetch report history');
      }
    } catch (error) {
      return rejectWithValue(error instanceof Error ? ((error as any)?.message || String(error)) : 'Operation failed');
    }
  }
);

export const fetchTemplateGalleryAsync = createAsyncThunk(
  'reports/fetchTemplateGallery',
  async (params: {
    page?: number;
    pageSize?: number;
    category?: string;
    source?: 'ad' | 'azure' | 'o365';
    tags?: string[];
    sortBy?: 'name' | 'executionCount' | 'createdAt';
    sortOrder?: 'asc' | 'desc';
  } | undefined, { rejectWithValue }) => {
    try {
      const response = await reportsService.getTemplateGallery(params);
      if (response.success && ((response as any).data)) {
        return {
          data: ((response as any).data),
          totalCount: response.totalCount,
          page: response.page,
          pageSize: response.pageSize,
          totalPages: response.totalPages,
        };
      } else {
        return rejectWithValue(response.error || 'Failed to fetch template gallery');
      }
    } catch (error) {
      return rejectWithValue(error instanceof Error ? ((error as any)?.message || String(error)) : 'Operation failed');
    }
  }
);

export const fetchFavoriteReportsAsync = createAsyncThunk(
  'reports/fetchFavoriteReports',
  async (_, { rejectWithValue }) => {
    try {
      const response = await reportsService.getFavoriteReports();
      if (response.success && ((response as any).data)) {
        return ((response as any).data);
      } else {
        return rejectWithValue(response.error || 'Failed to fetch favorite reports');
      }
    } catch (error) {
      return rejectWithValue(error instanceof Error ? ((error as any)?.message || String(error)) : 'Operation failed');
    }
  }
);

export const fetchReportStatsAsync = createAsyncThunk(
  'reports/fetchReportStats',
  async (_, { rejectWithValue }) => {
    try {
      const response = await reportsService.getReportStats();
      if (response.success && ((response as any).data)) {
        return ((response as any).data);
      } else {
        return rejectWithValue(response.error || 'Failed to fetch report statistics');
      }
    } catch (error) {
      return rejectWithValue(error instanceof Error ? ((error as any)?.message || String(error)) : 'Operation failed');
    }
  }
);

// Reports slice
const reportsSlice = createSlice({
  name: 'reports',
  initialState,
  reducers: {
    // Clear current execution and results
    clearCurrentExecution: (state) => {
      state.currentExecution = null;
      state.currentResult = null;
      state.executionError = null;
    },
    // UI actions
    setSelectedCategory: (state, action: PayloadAction<string | null>) => {
      state.selectedCategory = action.payload;
    },
    
    setSelectedSource: (state, action: PayloadAction<'ad' | 'azure' | 'o365' | null>) => {
      state.selectedSource = action.payload;
    },
    
    setSearchQuery: (state, action: PayloadAction<string>) => {
      state.searchQuery = action.payload;
    },
    
    setFilters: (state, action: PayloadAction<Record<string, string | number | boolean>>) => {
      state.filters = action.payload;
    },
    
    clearFilters: (state) => {
      state.filters = {};
      state.searchQuery = '';
      state.selectedCategory = null;
      state.selectedSource = null;
    },

    // Report builder actions
    updateReportBuilder: (state, action: PayloadAction<Partial<ReportsState['reportBuilder']>>) => {
      state.reportBuilder = { ...state.reportBuilder, ...action.payload };
    },
    
    resetReportBuilder: (state) => {
      state.reportBuilder = {
        query: {
          fields: [],
          filters: [],
          groupBy: undefined,
          orderBy: undefined,
        },
        isValid: false,
        errors: [],
        sampleData: [],
        estimatedRows: 0,
        testingQuery: false,
      };
    },
    
    addFieldToBuilder: (state, action: PayloadAction<FieldMetadata>) => {
      const field = action.payload;
      const exists = state.reportBuilder.query.fields.find(f => f.name === field.fieldName);
      if (!exists) {
        state.reportBuilder.query.fields.push({
          name: field.fieldName,
          displayName: field.displayName,
          type: field.dataType,
          category: field.category,
          isSelected: true,
        });
      }
    },
    
    removeFieldFromBuilder: (state, action: PayloadAction<string>) => {
      state.reportBuilder.query.fields = state.reportBuilder.query.fields.filter(
        f => f.name !== action.payload
      );
    },
    
    addFilterToBuilder: (state, action: PayloadAction<ReportFilter>) => {
      state.reportBuilder.query.filters.push(action.payload);
    },
    
    updateFilterInBuilder: (state, action: PayloadAction<{
      index: number;
      filter: Partial<{
        field: string;
        operator: string;
        value: string | number | boolean | null;
        dataType: string;
      }>;
    }>) => {
      const { index, filter } = action.payload;
      if (state.reportBuilder.query.filters[index]) {
        state.reportBuilder.query.filters[index] = {
          ...state.reportBuilder.query.filters[index],
          ...filter,
        } as ReportFilter;
      }
    },
    
    removeFilterFromBuilder: (state, action: PayloadAction<number>) => {
      state.reportBuilder.query.filters.splice(action.payload, 1);
    },

    // Current execution/result
    clearCurrentResult: (state) => {
      state.currentResult = null;
      state.currentExecution = null;
      state.executionError = null;
    },
    
    setExecutionError: (state, action: PayloadAction<string>) => {
      state.executionError = action.payload;
      state.executionLoading = false;
    },
  },
  extraReducers: (builder) => {
    // Fetch templates
    builder
      .addCase(fetchReportTemplatesAsync.pending, (state) => {
        state.templatesLoading = true;
        state.templatesError = null;
      })
      .addCase(fetchReportTemplatesAsync.fulfilled, (state, action) => {
        state.templatesLoading = false;
        // Map QueryDefinition[] to ReportTemplate[]
        const definitions = action.payload as QueryDefinition[];
        state.templates = definitions.map(def => ({
          id: def.id,
          name: def.name,
          description: def.description || '',
          category: (def.dataSource === 'ad' ? 'AD' : def.dataSource === 'azure' ? 'AzureAD' : 'O365') as 'AD' | 'AzureAD' | 'O365',
          reportType: def.category || def.id,
          queryTemplate: { sql: def.sql, parameters: def.parameters },
          requiredParameters: def.parameters?.filter(p => p.required).map(p => p.name) || [],
          isActive: true,
          createdAt: def.createdAt || new Date().toISOString()
        }));
        state.templatesError = null;
      })
      .addCase(fetchReportTemplatesAsync.rejected, (state, action) => {
        state.templatesLoading = false;
        state.templatesError = action.payload as string;
      });

    // Fetch custom reports
    builder
      .addCase(fetchCustomReportsAsync.pending, (state) => {
        state.customReportsLoading = true;
        state.customReportsError = null;
      })
      .addCase(fetchCustomReportsAsync.fulfilled, (state, action) => {
        state.customReportsLoading = false;
        state.customReports = action.payload.data;
        state.customReportsPagination = {
          page: action.payload.page,
          pageSize: action.payload.pageSize,
          totalCount: action.payload.totalCount,
          totalPages: action.payload.totalPages,
        };
        state.customReportsError = null;
      })
      .addCase(fetchCustomReportsAsync.rejected, (state, action) => {
        state.customReportsLoading = false;
        state.customReportsError = action.payload as string;
      });

    // Execute report
    builder
      .addCase(executeReportAsync.pending, (state) => {
        state.executionLoading = true;
        state.executionError = null;
      })
      .addCase(executeReportAsync.fulfilled, (state, action) => {
        state.executionLoading = false;
        // Map QueryExecutionResult to ReportExecution
        const result = action.payload as QueryExecutionResult;
        state.currentExecution = {
          id: result.queryId,
          report_id: result.queryId,
          executed_at: result.executedAt,
          generated_at: result.executedAt,
          status: 'success',
          result_count: result.result.metadata.rowCount,
          execution_time_ms: result.result.metadata.executionTime,
          result: {
            executionId: result.queryId,
            reportName: result.queryId,
            source: result.result.metadata.dataSource,
            executedAt: result.executedAt,
            rowCount: result.result.metadata.rowCount,
            executionTimeMs: result.result.metadata.executionTime,
            data: result.result?.data,
            columns: Object.keys((result.result?.data as any[])?.[0] || {})
          }
        };
        state.executionError = null;
      })
      .addCase(executeReportAsync.rejected, (state, action) => {
        state.executionLoading = false;
        state.executionError = action.payload as string;
      })
      
      // Fetch Report Results
      .addCase(fetchReportResultsAsync.pending, (state) => {
        state.executionLoading = true;
      })
      .addCase(fetchReportResultsAsync.fulfilled, (state, action) => {
        state.executionLoading = false;
        // Map the response to ReportResult format
        const payload = action.payload as { historyId: string; results: any[]; resultCount: number; createdAt: string; expiresAt: string };
        state.currentResult = {
          executionId: payload.historyId,
          reportName: 'Report Results',
          source: 'unknown',
          executedAt: payload.createdAt,
          rowCount: payload.resultCount,
          executionTimeMs: 0,
          data: payload.results,
          columns: payload.results.length > 0 ? Object.keys(payload.results[0]) : []
        };
        state.executionError = null;
      })
      .addCase(fetchReportResultsAsync.rejected, (state, action) => {
        state.executionLoading = false;
        state.executionError = action.payload as string;
      });

    // Execute custom report
    builder
      .addCase(executeCustomReportAsync.pending, (state) => {
        state.executionLoading = true;
        state.executionError = null;
      })
      .addCase(executeCustomReportAsync.fulfilled, (state, action) => {
        state.executionLoading = false;
        state.currentResult = action.payload;
        state.executionError = null;
      })
      .addCase(executeCustomReportAsync.rejected, (state, action) => {
        state.executionLoading = false;
        state.executionError = action.payload as string;
      });

    // Fetch available fields
    builder
      .addCase(fetchAvailableFieldsAsync.pending, (state) => {
        state.fieldsLoading = true;
        state.fieldsError = null;
      })
      .addCase(fetchAvailableFieldsAsync.fulfilled, (state, action) => {
        state.fieldsLoading = false;
        state.availableFields[action.payload.source] = action.payload.fields;
        state.fieldsError = null;
      })
      .addCase(fetchAvailableFieldsAsync.rejected, (state, action) => {
        state.fieldsLoading = false;
        state.fieldsError = action.payload as string;
      });

    // Test custom query
    builder
      .addCase(testCustomQueryAsync.pending, (state) => {
        state.reportBuilder.testingQuery = true;
      })
      .addCase(testCustomQueryAsync.fulfilled, (state, action) => {
        state.reportBuilder.testingQuery = false;
        state.reportBuilder.isValid = action.payload.isValid;
        state.reportBuilder.errors = action.payload.errors || [];
        state.reportBuilder.sampleData = action.payload.sampleData || [];
        state.reportBuilder.estimatedRows = action.payload.estimatedRows || 0;
      })
      .addCase(testCustomQueryAsync.rejected, (state, action) => {
        state.reportBuilder.testingQuery = false;
        state.reportBuilder.isValid = false;
        state.reportBuilder.errors = [action.payload as string];
      });

    // Create custom report
    builder
      .addCase(createCustomReportAsync.pending, (state) => {
        state.customReportsLoading = true;
        state.customReportsError = null;
      })
      .addCase(createCustomReportAsync.fulfilled, (state, action) => {
        state.customReportsLoading = false;
        state.customReports.unshift(action.payload);
        state.customReportsError = null;
      })
      .addCase(createCustomReportAsync.rejected, (state, action) => {
        state.customReportsLoading = false;
        state.customReportsError = action.payload as string;
      });

    // Fetch report history
    builder
      .addCase(fetchReportHistoryAsync.pending, (state) => {
        state.historyLoading = true;
        state.historyError = null;
      })
      .addCase(fetchReportHistoryAsync.fulfilled, (state, action) => {
        state.historyLoading = false;
        state.reportHistory = action.payload.data || [];
        state.historyPagination = {
          page: action.payload.page || 1,
          pageSize: action.payload.pageSize || 50,
          totalCount: action.payload.totalCount || 0,
          totalPages: action.payload.totalPages || Math.ceil((action.payload.totalCount || 0) / (action.payload.pageSize || 50)),
        };
        state.historyError = null;
      })
      .addCase(fetchReportHistoryAsync.rejected, (state, action) => {
        state.historyLoading = false;
        state.historyError = action.payload as string;
      });

    // Fetch template gallery
    builder
      .addCase(fetchTemplateGalleryAsync.pending, (state) => {
        state.galleryLoading = true;
        state.galleryError = null;
      })
      .addCase(fetchTemplateGalleryAsync.fulfilled, (state, action) => {
        state.galleryLoading = false;
        state.templateGallery = action.payload.data;
        state.galleryPagination = {
          page: action.payload.page,
          pageSize: action.payload.pageSize,
          totalCount: action.payload.totalCount,
          totalPages: action.payload.totalPages,
        };
        state.galleryError = null;
      })
      .addCase(fetchTemplateGalleryAsync.rejected, (state, action) => {
        state.galleryLoading = false;
        state.galleryError = action.payload as string;
      });

    // Fetch favorite reports
    builder
      .addCase(fetchFavoriteReportsAsync.pending, (state) => {
        state.favoritesLoading = true;
      })
      .addCase(fetchFavoriteReportsAsync.fulfilled, (state, action) => {
        state.favoritesLoading = false;
        state.favoriteReports = action.payload;
      })
      .addCase(fetchFavoriteReportsAsync.rejected, (state) => {
        state.favoritesLoading = false;
      });

    // Fetch report stats
    builder
      .addCase(fetchReportStatsAsync.pending, (state) => {
        state.statsLoading = true;
        state.statsError = null;
      })
      .addCase(fetchReportStatsAsync.fulfilled, (state, action) => {
        state.statsLoading = false;
        state.reportStats = action.payload;
        state.statsError = null;
      })
      .addCase(fetchReportStatsAsync.rejected, (state, action) => {
        state.statsLoading = false;
        state.statsError = action.payload as string;
      });
  },
});

export const {
  clearCurrentExecution,
  setSelectedCategory,
  setSelectedSource,
  setSearchQuery,
  setFilters,
  clearFilters,
  updateReportBuilder,
  resetReportBuilder,
  addFieldToBuilder,
  removeFieldFromBuilder,
  addFilterToBuilder,
  updateFilterInBuilder,
  removeFilterFromBuilder,
  clearCurrentResult,
  setExecutionError,
} = reportsSlice.actions;

// Selectors
export const selectReports = (state: { reports: ReportsState }) => state.reports;
export const selectTemplates = (state: { reports: ReportsState }) => state.reports.templates;
export const selectCustomReports = (state: { reports: ReportsState }) => state.reports.customReports;
export const selectCurrentResult = (state: { reports: ReportsState }) => state.reports.currentResult;
export const selectAvailableFields = (state: { reports: ReportsState }) => state.reports.availableFields;
export const selectReportBuilder = (state: { reports: ReportsState }) => state.reports.reportBuilder;
export const selectReportHistory = (state: { reports: ReportsState }) => state.reports.reportHistory;
export const selectHistoryLoading = (state: { reports: ReportsState }) => state.reports.historyLoading;
export const selectHistoryPagination = (state: { reports: ReportsState }) => state.reports.historyPagination;

// Memoized selector to prevent unnecessary re-renders
export const selectHistoryState = createSelector(
  [selectReportHistory, selectHistoryLoading, selectHistoryPagination],
  (reportHistory, historyLoading, historyPagination) => ({
    reportHistory,
    historyLoading,
    historyPagination
  })
);

export const selectTemplateGallery = (state: { reports: ReportsState }) => state.reports.templateGallery;
export const selectFavoriteReports = (state: { reports: ReportsState }) => state.reports.favoriteReports;
export const selectReportStats = (state: { reports: ReportsState }) => state.reports.reportStats;
export const selectStatsLoading = (state: { reports: ReportsState }) => state.reports.statsLoading;

export type { ReportsState };
export default reportsSlice.reducer;