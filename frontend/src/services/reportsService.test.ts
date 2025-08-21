import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Unmock the global reportsService mock for this specific test
vi.unmock('./reportsService');

// Mock the api service
vi.mock('./api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    getPaginated: vi.fn(),
    downloadFile: vi.fn(),
  },
}));

// Mock the query service
vi.mock('./queryService', () => ({
  default: {
    getSchema: vi.fn(),
  },
}));

// Import services after mocks
import apiService from './api';
import queryService from './queryService';
import { reportsService } from './reportsService';

describe('reportsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getReportTemplates', () => {
    it('should fetch report templates successfully', async () => {
      const mockTemplates = [
        {
          id: '1',
          name: 'Inactive Users',
          category: 'AD',
          reportType: 'inactive-users',
        },
        {
          id: '2',
          name: 'Guest Users',
          category: 'AzureAD',
          reportType: 'guest-users',
        },
      ];

      vi.mocked(apiService.get).mockResolvedValueOnce({
        success: true,
        data: mockTemplates,
      });

      const result = await reportsService.getReportTemplates();

      expect(apiService.get).toHaveBeenCalledWith('/reports/templates', {});
      expect(result).toEqual({
        success: true,
        data: mockTemplates,
      });
    });

    it('should filter templates by category', async () => {
      const mockTemplates = [
        { id: '1', name: 'AD Report', category: 'AD' },
      ];

      vi.mocked(apiService.get).mockResolvedValueOnce({
        success: true,
        data: mockTemplates,
      });

      const result = await reportsService.getReportTemplates({ category: 'AD' });

      expect(apiService.get).toHaveBeenCalledWith('/reports/templates', { category: 'AD' });
      if (result.success) {
        expect(result.data).toEqual(mockTemplates);
      }
    });
  });

  describe('executeReport', () => {
    it('should execute report successfully', async () => {
      const mockResult = {
        reportName: 'Inactive Users',
        source: 'ad',
        executedAt: '2024-01-01T00:00:00Z',
        rowCount: 50,
        data: [],
      };

      vi.mocked(apiService.post).mockResolvedValueOnce({
        success: true,
        data: {
          ...mockResult,
          totalCount: mockResult.rowCount,
          executionId: 'exec-123',
          category: 'ad'
        },
      });

      const result = await reportsService.executeReport('template-1', { days: 30 });

      expect(apiService.post).toHaveBeenCalledWith('/reports/execute/template-1', {
        parameters: { days: 30 },
        credentialId: undefined,
        format: 'json'
      });
      if (result.success) {
        expect(result.data).toEqual({
            queryId: 'template-1',
          executionId: 'exec-123',
          executedAt: mockResult.executedAt,
          result: {
            success: true,
            data: mockResult.data,
            metadata: {
              rowCount: mockResult.rowCount,
              executionTime: 0,
              cached: false,
              dataSource: 'ad'
            }
          },
          cached: false
        });
      }
    });

    it('should handle execution error', async () => {
      vi.mocked(apiService.post).mockResolvedValueOnce({
        success: false,
        error: 'Report execution failed',
      });

      const result = await reportsService.executeReport('template-1', {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Report execution failed');
    });
  });

  describe('getCustomReports', () => {
    it('should fetch custom reports with pagination', async () => {
      const mockResponse = {
        success: true,
        data: [
          { id: '1', name: 'Custom Report 1' },
          { id: '2', name: 'Custom Report 2' },
        ],
        totalCount: 10,
        page: 1,
        pageSize: 10,
        totalPages: 1,
      };

      vi.mocked(apiService.getPaginated).mockResolvedValueOnce(mockResponse);

      const result = await reportsService.getCustomReports({ page: 1, pageSize: 10 });

      expect(apiService.getPaginated).toHaveBeenCalledWith('/reports/custom', {
        page: 1,
        pageSize: 10,
      });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('createCustomReport', () => {
    it('should create custom report successfully', async () => {
      const customReport = {
        name: 'New Custom Report',
        description: 'A new report',
        source: 'ad' as const,
        query: {
          fields: [{ name: 'displayName', displayName: 'Display Name', type: 'string' as const, category: 'basic' }],
          filters: [],
        },
      };

      const mockResponse = {
        success: true,
        data: {
          id: 'new-id',
          ...customReport,
          createdAt: '2024-01-01T00:00:00Z',
        },
      };

      vi.mocked(apiService.post).mockResolvedValueOnce(mockResponse);

      const result = await reportsService.createCustomReport(customReport);

      expect(apiService.post).toHaveBeenCalledWith('/reports/custom', customReport);
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getAvailableFields', () => {
    it('should fetch available fields for a source', async () => {
      const mockFields = [
        {
          fieldName: 'displayName',
          displayName: 'Display Name',
          dataType: 'string',
          category: 'basic',
        },
        {
          fieldName: 'mail',
          displayName: 'Email',
          dataType: 'string',
          category: 'contact',
        },
      ];

      vi.mocked(queryService.getSchema).mockResolvedValueOnce({
        success: true,
        data: {
          tables: [],
          fields: mockFields
        },
      });

      const result = await reportsService.getAvailableFields('ad');

      expect(queryService.getSchema).toHaveBeenCalledWith('ad');
      if (result.success) {
        expect(result.data.fields).toHaveLength(2);
        expect(result.data.fields?.[0]).toMatchObject({
          fieldName: 'displayName',
          displayName: 'Display Name',
          dataType: 'string',
          category: 'basic'
        });
      }
    });
  });

  describe('testCustomQuery', () => {
    it('should test custom query successfully', async () => {
      const query = {
        fields: [{ name: 'displayName', displayName: 'Display Name', type: 'string' as const, category: 'basic' }],
        filters: [],
      };

      const mockResponse = {
        success: true,
        data: {
          isValid: true,
          sampleData: [{ displayName: 'User 1' }],
          estimatedRows: 100,
        },
      };

      vi.mocked(apiService.post).mockResolvedValueOnce(mockResponse);

      const result = await reportsService.testCustomQuery(query, 'ad');

      expect(apiService.post).toHaveBeenCalledWith('/reports/custom/test', { 
        source: 'ad',
        query,
        parameters: {},
        limit: 1000
      });
      expect(result).toEqual(mockResponse);
    });

    it('should handle invalid query', async () => {
      const query = {
        fields: [],
        filters: [],
      };

      const mockResponse = {
        success: true,
        data: {
          isValid: false,
          errors: ['At least one field must be selected'],
        },
      };

      vi.mocked(apiService.post).mockResolvedValueOnce(mockResponse);

      const result = await reportsService.testCustomQuery(query, 'ad');

      expect(result).toEqual(mockResponse);
    });
  });

  describe('downloadReportResult', () => {
    it('should download report file', async () => {
      vi.mocked(apiService.downloadFile).mockResolvedValueOnce(undefined);

      await reportsService.downloadReportResult('execution-id-123', 'excel');

      expect(apiService.downloadFile).toHaveBeenCalledWith(
        '/reports/export/history/execution-id-123?format=excel'
      );
    });

    it('should use correct filename for different formats', async () => {
      vi.mocked(apiService.downloadFile).mockResolvedValueOnce(undefined);

      await reportsService.downloadReportResult('execution-id-123', 'csv');

      expect(apiService.downloadFile).toHaveBeenCalledWith(
        '/reports/export/history/execution-id-123?format=csv'
      );
    });
  });

  describe('getReportHistory', () => {
    it('should fetch report history with filters', async () => {
      const mockHistory = {
        success: true,
        data: [
          {
            id: '1',
            reportName: 'Test Report',
            executedAt: '2024-01-01T00:00:00Z',
            status: 'completed',
          },
        ],
        totalCount: 1,
        page: 1,
        pageSize: 10,
        totalPages: 1,
      };

      vi.mocked(apiService.getPaginated).mockResolvedValueOnce(mockHistory);

      const filters = {
        page: 1,
        pageSize: 10,
        dateFrom: '2024-01-01',
        dateTo: '2024-01-31',
        status: 'completed' as 'pending' | 'running' | 'completed' | 'failed',
      };

      const result = await reportsService.getReportHistory(filters);

      expect(apiService.getPaginated).toHaveBeenCalledWith('/reports/history', filters);
      expect(result).toEqual(mockHistory);
    });
  });

  describe('updateCustomReport', () => {
    it('should update custom report successfully', async () => {
      const updates = {
        name: 'Updated Report Name',
        description: 'Updated description',
      };

      const mockResponse = {
        success: true,
        data: {
          id: '1',
          name: 'Updated Report Name',
          description: 'Updated description',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      };

      vi.mocked(apiService.put).mockResolvedValueOnce(mockResponse);

      const result = await reportsService.updateCustomReport('1', updates);

      expect(apiService.put).toHaveBeenCalledWith('/reports/custom/1', updates);
      expect(result).toEqual(mockResponse);
    });
  });

  describe('deleteCustomReport', () => {
    it('should delete custom report successfully', async () => {
      const mockResponse = { success: true };
      
      vi.mocked(apiService.delete).mockResolvedValueOnce(mockResponse);

      const result = await reportsService.deleteCustomReport('1');

      expect(apiService.delete).toHaveBeenCalledWith('/reports/custom/1');
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getReportExecution', () => {
    it('should get report execution details', async () => {
      const mockExecution = {
        id: '1',
        reportName: 'Test Report',
        status: 'completed',
        executedAt: '2024-01-01T00:00:00Z',
        rowCount: 100,
      };

      vi.mocked(apiService.get).mockResolvedValueOnce({
        success: true,
        data: mockExecution,
      });

      const result = await reportsService.getReportExecution('1');

      expect(apiService.get).toHaveBeenCalledWith('/reports/history/1');
      if (result.success) {
        expect(result.data).toEqual(mockExecution);
      }
    });
  });
});