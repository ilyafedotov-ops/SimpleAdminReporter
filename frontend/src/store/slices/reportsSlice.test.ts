import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { configureStore, Store } from '@reduxjs/toolkit';
import { QueryExecutionResult } from '@/types';
import reportsReducer, {
  ReportsState,
  fetchReportTemplatesAsync,
  fetchAvailableFieldsAsync,
  // fetchReportHistoryAsync,
  executeReportAsync,
  // executeCustomReportAsync,
  clearCurrentResult,
  setExecutionError,
  clearFilters,
  setFilters,
  updateReportBuilder,
  resetReportBuilder,
  selectReports,
  selectTemplates,
  selectCustomReports,
  selectCurrentResult,
  selectAvailableFields,
  selectReportHistory,
} from './reportsSlice';
import { cleanupAfterTest } from '@/utils/test-helpers';

interface TestRootState {
  reports: ReportsState;
}

describe('reportsSlice', () => {
  let store: Store<TestRootState>;

  beforeEach(() => {
    store = configureStore({
      reducer: {
        reports: reportsReducer,
      },
    });
  });

  afterEach(async () => {
    await cleanupAfterTest();
  });

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const state = store.getState();
      expect(state.reports.templates).toEqual([]);
      expect(state.reports.templatesLoading).toBe(false);
      expect(state.reports.templatesError).toBeNull();
      expect(state.reports.customReports).toEqual([]);
      expect(state.reports.customReportsLoading).toBe(false);
      expect(state.reports.customReportsError).toBeNull();
      expect(state.reports.currentExecution).toBeNull();
      expect(state.reports.currentResult).toBeNull();
      expect(state.reports.executionLoading).toBe(false);
      expect(state.reports.executionError).toBeNull();
      expect(state.reports.availableFields).toEqual({});
      expect(state.reports.fieldsLoading).toBe(false);
      expect(state.reports.fieldsError).toBeNull();
      expect(state.reports.reportHistory).toEqual([]);
      expect(state.reports.historyLoading).toBe(false);
      expect(state.reports.historyError).toBeNull();
    });
  });

  describe('synchronous actions', () => {
    it('should handle clearCurrentResult', () => {
      // Set some result data first
      const mockResult: QueryExecutionResult = {
        queryId: 'test-query-1',
        result: {
          success: true,
          data: [{ displayName: 'User 1' }],
          metadata: {
            executionTime: 1500,
            rowCount: 10,
            cached: false,
            dataSource: 'ad'
          }
        },
        executedAt: '2024-01-01',
        executedBy: 'test-user'
      };
      
      store.dispatch(executeReportAsync.fulfilled(
        mockResult,
        '',
        { templateId: '1', parameters: {} }
      ));
      
      store.dispatch(clearCurrentResult());
      
      const state = store.getState();
      expect(state.reports.currentResult).toBeNull();
    });

    it('should handle setExecutionError', () => {
      const errorMessage = 'Execution failed';
      store.dispatch(setExecutionError(errorMessage));
      
      const state = store.getState();
      expect(state.reports.executionError).toBe(errorMessage);
      expect(state.reports.executionLoading).toBe(false);
    });

    it('should handle clearFilters', () => {
      store.dispatch(setFilters({ status: 'completed' }));
      store.dispatch(clearFilters());
      
      const state = store.getState();
      expect(state.reports.filters).toEqual({});
    });

    it('should handle setFilters', () => {
      const filters = {
        status: 'completed',
        source: 'ad',
      };
      
      store.dispatch(setFilters(filters));
      
      const state = store.getState();
      expect(state.reports.filters).toEqual(filters);
    });

    it('should handle updateReportBuilder', () => {
      const updates = {
        query: {
          fields: [{ name: 'displayName', displayName: 'Display Name', type: 'string' as const, category: 'basic' }],
          filters: [],
        },
        isValid: true,
      };
      
      store.dispatch(updateReportBuilder(updates));
      
      const state = store.getState();
      expect(state.reports.reportBuilder.query).toEqual(updates.query);
      expect(state.reports.reportBuilder.isValid).toBe(true);
    });

    it('should handle resetReportBuilder', () => {
      store.dispatch(updateReportBuilder({ isValid: true }));
      store.dispatch(resetReportBuilder());
      
      const state = store.getState();
      expect(state.reports.reportBuilder.isValid).toBe(false);
      expect(state.reports.reportBuilder.query.fields).toEqual([]);
    });
  });

  describe('async actions - templates', () => {
    it('should handle fetchReportTemplatesAsync pending', () => {
      store.dispatch(fetchReportTemplatesAsync.pending('', undefined));
      const state = store.getState();
      expect(state.reports.templatesLoading).toBe(true);
    });

    it('should handle fetchReportTemplatesAsync fulfilled', () => {
      const queryDefinitions = [
        {
          id: '1',
          name: 'Inactive Users',
          description: 'Find inactive AD users',
          dataSource: 'ad',
          category: 'inactive-users',
          parameters: [
            {
              name: 'days',
              displayName: 'Days',
              type: 'number' as const,
              required: true,
              default: 30
            }
          ],
          createdAt: '2024-01-01',
        },
      ];
      
      // Expected transformed templates after reducer processing
      const expectedTemplates = [
        {
          id: '1',
          name: 'Inactive Users',
          description: 'Find inactive AD users',
          category: 'AD' as const,
          reportType: 'inactive-users',
          queryTemplate: { sql: undefined, parameters: queryDefinitions[0].parameters },
          requiredParameters: ['days'],
          isActive: true,
          createdAt: '2024-01-01',
        },
      ];
      
      store.dispatch(fetchReportTemplatesAsync.fulfilled(queryDefinitions, '', undefined));
      const state = store.getState();
      
      expect(state.reports.templatesLoading).toBe(false);
      expect(state.reports.templates).toEqual(expectedTemplates);
      expect(state.reports.templatesError).toBeNull();
    });

    it('should handle fetchReportTemplatesAsync rejected', () => {
      store.dispatch(fetchReportTemplatesAsync.rejected(new Error('Failed'), '', undefined, 'Failed to fetch templates'));
      const state = store.getState();
      
      expect(state.reports.templatesLoading).toBe(false);
      expect(state.reports.templatesError).toBe('Failed to fetch templates');
    });
  });

  describe('async actions - fields', () => {
    it('should handle fetchAvailableFieldsAsync pending', () => {
      store.dispatch(fetchAvailableFieldsAsync.pending('', 'ad', { source: 'ad' }));
      const state = store.getState();
      expect(state.reports.fieldsLoading).toBe(true);
    });

    it('should handle fetchAvailableFieldsAsync fulfilled', () => {
      const fields = [
        {
          source: 'ad' as const,
          fieldName: 'displayName',
          displayName: 'Display Name',
          dataType: 'string' as const,
          category: 'basic',
          isSearchable: true,
          isSortable: true,
          isExportable: true,
        },
      ];
      
      store.dispatch(fetchAvailableFieldsAsync.fulfilled(
        { source: 'ad', fields },
        '',
        'ad'
      ));
      const state = store.getState();
      
      expect(state.reports.fieldsLoading).toBe(false);
      expect(state.reports.availableFields.ad).toEqual(fields);
      expect(state.reports.fieldsError).toBeNull();
    });
  });

  describe('async actions - execution', () => {
    it('should handle executeReportAsync pending', () => {
      store.dispatch(executeReportAsync.pending('', { templateId: '1', parameters: {} }, { templateId: '1', parameters: {} }));
      const state = store.getState();
      
      expect(state.reports.executionLoading).toBe(true);
      expect(state.reports.executionError).toBeNull();
    });

    it('should handle executeReportAsync fulfilled', () => {
      const queryResult: QueryExecutionResult = {
        queryId: 'template-1',
        executionId: 'exec-123',
        executedAt: '2024-01-01',
        executedBy: 'test-user',
        result: {
          success: true,
          data: [{ displayName: 'User 1' }],
          metadata: {
            rowCount: 10,
            executionTime: 1500,
            cached: false,
            dataSource: 'ad'
          }
        },
        cached: false
      };
      
      // Expected transformed execution after reducer processing
      const expectedExecution = {
        id: 'template-1',
        report_id: 'template-1',
        executed_at: '2024-01-01',
        generated_at: '2024-01-01',
        status: 'success',
        result_count: 10,
        execution_time_ms: 1500,
        result: {
          executionId: 'template-1',
          reportName: 'template-1',
          source: 'ad',
          executedAt: '2024-01-01',
          rowCount: 10,
          executionTimeMs: 1500,
          data: [{ displayName: 'User 1' }],
          columns: ['displayName']
        }
      };
      
      store.dispatch(executeReportAsync.fulfilled(
        queryResult,
        '',
        { templateId: '1', parameters: {} }
      ));
      const state = store.getState();
      
      expect(state.reports.executionLoading).toBe(false);
      expect(state.reports.currentExecution).toEqual(expectedExecution);
      expect(state.reports.executionError).toBeNull();
    });

    it('should handle executeReportAsync rejected', () => {
      store.dispatch(executeReportAsync.rejected(
        new Error('Failed'),
        '',
        { templateId: '1', parameters: {} },
        'Report execution failed'
      ));
      const state = store.getState();
      
      expect(state.reports.executionLoading).toBe(false);
      expect(state.reports.executionError).toBe('Report execution failed');
    });
  });

  describe('selectors', () => {
    beforeEach(() => {
      const templates = [{
        id: '1',
        name: 'Test Template',
        category: 'AD' as const,
        reportType: 'test',
        queryTemplate: {},
        requiredParameters: [],
        isActive: true,
        createdAt: '2024-01-01',
        description: 'Test',
      }];
      
      store.dispatch(fetchReportTemplatesAsync.fulfilled(templates, '', undefined));
    });

    it('should select reports state', () => {
      const state = store.getState();
      const reports = selectReports(state);
      expect(reports).toBe(state.reports);
    });

    it('should select templates', () => {
      const state = store.getState();
      const templates = selectTemplates(state);
      expect(templates).toEqual(state.reports.templates);
    });

    it('should select custom reports', () => {
      const state = store.getState();
      const customReports = selectCustomReports(state);
      expect(customReports).toEqual(state.reports.customReports);
    });

    it('should select current result', () => {
      const state = store.getState();
      const result = selectCurrentResult(state);
      expect(result).toBeNull();
    });

    it('should select available fields', () => {
      const state = store.getState();
      const fields = selectAvailableFields(state);
      expect(fields).toEqual({});
    });

    it('should select report history', () => {
      const state = store.getState();
      const history = selectReportHistory(state);
      expect(history).toEqual([]);
    });

    it('should select loading states', () => {
      const state = store.getState();
      expect(state.reports.templatesLoading).toBe(false);
      expect(state.reports.executionLoading).toBe(false);
      expect(state.reports.fieldsLoading).toBe(false);
    });
  });
});