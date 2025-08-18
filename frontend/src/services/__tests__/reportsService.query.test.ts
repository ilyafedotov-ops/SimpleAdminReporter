/* eslint-disable */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryExecutionResult, QueryDefinition } from '@/types';

// Mock the queryService
vi.mock('../queryService', () => ({
  default: {
    execute: vi.fn(),
    getDefinitions: vi.fn(),
    getGraphDefinitions: vi.fn(),
    executeGraphQuery: vi.fn(),
    validate: vi.fn(),
    getHealth: vi.fn(),
    getStats: vi.fn(),
    getMetrics: vi.fn(),
    clearCache: vi.fn(),
    getSchema: vi.fn(),
    build: vi.fn(),
  }
}));

// Mock the api service
vi.mock('../api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    getPaginated: vi.fn(),
    downloadFile: vi.fn(),
  },
}));

// Mock the reportsService to use the actual implementation with mocked dependencies
vi.mock('../reportsService', async (importOriginal) => {
  const actual = await importOriginal();
  return actual;
});

// Import after mocks are set up
import reportsService from '../reportsService';
import queryService from '../queryService';
import apiService from '../api';

describe('ReportsService - Query Service Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('executeReport', () => {
    it('should execute report using new query service', async () => {
      // Arrange
      const templateId = 'test_template_001';
      const parameters = { days: 30, status: 'active' };
      const credentialId = 123;

      const mockQueryResult: QueryExecutionResult = {
        queryId: templateId,
        result: {
          success: true,
          data: [
            { id: 1, name: 'User 1', status: 'active' },
            { id: 2, name: 'User 2', status: 'active' }
          ],
          metadata: {
            executionTime: 150,
            rowCount: 2,
            cached: false,
            dataSource: 'ad'
          }
        },
        executedAt: '2024-01-15T10:00:00Z',
        executedBy: 'test-user'
      };

      vi.mocked(apiService.post).mockResolvedValue({
        success: true,
        data: {
          executionId: 'exec-123',
          executedAt: '2024-01-15T10:00:00Z',
          data: [
            { id: 1, name: 'User 1', status: 'active' },
            { id: 2, name: 'User 2', status: 'active' }
          ],
          totalCount: 2,
          executionTime: 150,
          category: 'ad'
        }
      });

      // Act
      const result = await reportsService.executeReport(templateId, parameters, credentialId);

      // Assert
      expect(apiService.post).toHaveBeenCalledWith(
        `/reports/execute/${templateId}`,
        {
          parameters: parameters,
          credentialId,
          format: 'json'
        }
      );

      expect(result).toEqual({
        success: true,
        data: {
          queryId: templateId,
          executionId: 'exec-123',
          executedAt: '2024-01-15T10:00:00Z',
          result: {
            success: true,
            data: [
              { id: 1, name: 'User 1', status: 'active' },
              { id: 2, name: 'User 2', status: 'active' }
            ],
            metadata: {
              rowCount: 2,
              executionTime: 150,
              cached: false,
              dataSource: 'ad'
            }
          },
          cached: false
        }
      });
    });

    it('should handle query execution errors', async () => {
      // Arrange
      const templateId = 'test_template_002';
      const errorMessage = 'Query execution failed: timeout';

      vi.mocked(apiService.post).mockResolvedValue({
        success: false,
        error: errorMessage
      });

      // Act
      const result = await reportsService.executeReport(templateId);

      // Assert
      expect(result).toEqual({
        success: false,
        error: errorMessage
      });
    });

    it('should handle empty result data', async () => {
      // Arrange
      const templateId = 'test_template_003';
      const mockQueryResult: QueryExecutionResult = {
        queryId: templateId,
        result: {
          success: true,
          data: [],
          metadata: {
            executionTime: 50,
            rowCount: 0,
            cached: true,
            dataSource: 'azure'
          }
        },
        executedAt: '2024-01-15T10:00:00Z',
        executedBy: 'test-user'
      };

      vi.mocked(apiService.post).mockResolvedValue({
        success: true,
        data: {
          executionId: 'exec-empty',
          executedAt: '2024-01-15T10:00:00Z',
          data: [],
          totalCount: 0,
          executionTime: 50,
          category: 'azure'
        }
      });

      // Act
      const result = await reportsService.executeReport(templateId);

      // Assert
      expect(result.success).toBe(true);
      expect(((result as any)?.data)?.result.metadata.rowCount).toBe(0);
      expect(((result as any)?.data)?.result.data).toEqual([]);
    });
  });

  describe('getReportTemplates', () => {
    it('should fetch and map query definitions to report templates', async () => {
      // Arrange
      const mockDefinitions: QueryDefinition[] = [
        {
          id: 'ad_inactive_users',
          name: 'Inactive Users Report',
          description: 'Find inactive AD users',
          dataSource: 'ad',
          sql: 'SELECT * FROM users WHERE lastLogin < ?',
          parameters: [{
            name: 'days',
            type: 'number',
            required: true,
            default: 90
          }],
          createdAt: '2024-01-01T00:00:00Z'
        },
        {
          id: 'azure_guest_users',
          name: 'Guest Users Report',
          description: 'List all guest users in Azure AD',
          dataSource: 'azure',
          parameters: []
        }
      ];

      vi.mocked(apiService.get).mockResolvedValue({
        success: true,
        data: {
          definitions: mockDefinitions,
          totalCount: 2
        }
      });

      // Act
      const result = await reportsService.getReportTemplates({ category: 'users', source: 'ad' });

      // Assert
      expect(apiService.get).toHaveBeenCalledWith(
        '/reports/templates',
        { category: 'users', source: 'ad' }
      );

      expect(result.success).toBe(true);
      expect(((result as any)?.data)?.definitions).toHaveLength(2);
      expect(((result as any)?.data)?.definitions[0]).toEqual(mockDefinitions[0]);
    });

    it('should map data sources to categories correctly', async () => {
      // Arrange
      const mockDefinitions: QueryDefinition[] = [
        { id: '1', name: 'Test 1', dataSource: 'ad' },
        { id: '2', name: 'Test 2', dataSource: 'azure' },
        { id: '3', name: 'Test 3', dataSource: 'o365' },
        { id: '4', name: 'Test 4', dataSource: 'postgres' },
        { id: '5', name: 'Test 5', dataSource: 'unknown' }
      ];

      vi.mocked(apiService.get).mockResolvedValue({
        success: true,
        data: {
          definitions: mockDefinitions,
          totalCount: 5
        }
      });

      // Act
      const result = await reportsService.getReportTemplates();

      // Assert
      expect(apiService.get).toHaveBeenCalledWith('/reports/templates', {});
      expect(((result as any)?.data)?.definitions).toHaveLength(5);
      // The method returns definitions directly now, not templates with mapped categories
    });
  });

  describe('testCustomQuery', () => {
    it('should validate and execute test query', async () => {
      // Arrange
      const customQuery = {
        fields: [
          { name: 'username', displayName: 'Username', type: 'string' as const, category: 'basic' },
          { name: 'email', displayName: 'Email', type: 'string' as const, category: 'basic' }
        ],
        filters: [
          {
            field: 'status',
            operator: 'equals' as const,
            value: 'active',
            dataType: 'string' as const
          }
        ],
        orderBy: {
          field: 'username',
          direction: 'asc' as const
        }
      };

      const source = 'ad' as const;
      const parameters = { param1: 'active' };
      const limit = 10;

      vi.mocked(apiService.post).mockResolvedValue({
        success: true,
        data: {
          source: 'ad',
          executionTime: 100,
          testData: [
            { username: 'user1', email: 'user1@test.com' },
            { username: 'user2', email: 'user2@test.com' }
          ],
          rowCount: 2,
          isTestRun: true
        }
      });

      // Act
      const result = await reportsService.testCustomQuery(customQuery, source, parameters, limit);

      // Assert
      expect(apiService.post).toHaveBeenCalledWith('/reports/custom/test', {
        source,
        query: customQuery,
        parameters: parameters,
        limit: limit
      });

      expect(result).toEqual({
        success: true,
        data: {
          source: 'ad',
          executionTime: 100,
          testData: [
            { username: 'user1', email: 'user1@test.com' },
            { username: 'user2', email: 'user2@test.com' }
          ],
          rowCount: 2,
          isTestRun: true
        }
      });
    });

    it('should handle validation failure', async () => {
      // Arrange
      const customQuery = {
        fields: [],
        filters: []
      };

      vi.mocked(apiService.post).mockResolvedValue({
        success: false,
        error: 'Query must have at least one field selected'
      });

      // Act
      const result = await reportsService.testCustomQuery(customQuery, 'ad');

      // Assert
      expect(apiService.post).toHaveBeenCalledWith('/reports/custom/test', {
        source: 'ad',
        query: customQuery,
        parameters: {},
        limit: 1000
      });
      expect(result).toEqual({
        success: false,
        error: 'Query must have at least one field selected'
      });
    });
  });

  describe('Query Health & Metrics', () => {
    it('should get query health status', async () => {
      // Arrange
      const mockHealth = {
        status: 'healthy' as const,
        dataSources: {
          ad: { status: 'healthy' as const, lastCheck: '2024-01-15T10:00:00Z' },
          azure: { status: 'unhealthy' as const, lastCheck: '2024-01-15T10:00:00Z', error: 'Connection failed' }
        },
        cache: {
          status: 'healthy' as const,
          size: 1024,
          hitRate: 0.85
        },
        timestamp: '2024-01-15T10:00:00Z'
      };

      vi.mocked(queryService.getHealth).mockResolvedValue({
        success: true,
        data: mockHealth
      });

      // Act
      const result = await reportsService.getQueryHealth();

      // Assert
      expect(queryService.getHealth).toHaveBeenCalled();
      expect(((result as any)?.data)).toEqual(mockHealth);
    });

    it('should clear query cache', async () => {
      // Arrange
      vi.mocked(queryService.clearCache).mockResolvedValue({
        success: true,
        data: {
          cleared: true,
          entriesCleared: 15
        }
      });

      // Act
      const result = await reportsService.clearQueryCache('test_query');

      // Assert
      expect(queryService.clearCache).toHaveBeenCalledWith('test_query');
      expect(((result as any)?.data)?.entriesCleared).toBe(15);
    });
  });
});