import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { graphService, GraphFieldMetadata, GraphQueryTemplate, GraphExecutionResult } from '../graphService';
import apiService from '../api';
import { ApiPriority } from '@/utils/apiQueue';

// Mock the apiService
vi.mock('../api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  }
}));

describe('GraphService', () => {
  let mockApiServiceGet: ReturnType<typeof vi.fn>;
  let mockApiServicePost: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockApiServiceGet = vi.mocked(apiService.get);
    mockApiServicePost = vi.mocked(apiService.post);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getTemplates', () => {
    it('should fetch Graph query templates with caching', async () => {
      const mockTemplates: GraphQueryTemplate[] = [
        {
          id: 'users-basic',
          name: 'Basic User Query',
          description: 'Get basic user information',
          category: 'users',
          endpoint: '/users',
          requiredScopes: ['User.Read.All'],
          fields: ['id', 'displayName', 'mail']
        },
        {
          id: 'groups-members',
          name: 'Group Members',
          description: 'Get group members',
          category: 'groups',
          endpoint: '/groups/{id}/members',
          requiredScopes: ['Group.Read.All'],
          parameters: { groupId: 'string' }
        }
      ];

      const mockResponse = {
        success: true,
        data: {
          templates: mockTemplates,
          total: 2
        }
      };

      mockApiServiceGet.mockResolvedValue(mockResponse);

      const result = await graphService.getTemplates();

      expect(mockApiServiceGet).toHaveBeenCalledWith('/graph/templates', undefined, {
        useCache: true,
        cacheTTL: 300,
        priority: ApiPriority.NORMAL
      });
      expect(result).toEqual(mockResponse);
    });

    it('should handle API errors when fetching templates', async () => {
      const error = new Error('Failed to fetch templates');
      mockApiServiceGet.mockRejectedValue(error);

      await expect(graphService.getTemplates()).rejects.toThrow('Failed to fetch templates');
    });
  });

  describe('executeQuery', () => {
    it('should execute Graph query without parameters', async () => {
      const mockResult: GraphExecutionResult = {
        id: 'exec-1',
        queryId: 'users-basic',
        userId: 123,
        executedAt: '2025-01-15T10:30:00Z',
        parameters: {},
        resultCount: 5,
        executionTimeMs: 150,
        status: 'success',
        data: [
          { id: '1', displayName: 'John Doe', mail: 'john@company.com' },
          { id: '2', displayName: 'Jane Smith', mail: 'jane@company.com' }
        ]
      };

      const mockResponse = {
        success: true,
        data: mockResult
      };

      mockApiServicePost.mockResolvedValue(mockResponse);

      const result = await graphService.executeQuery('users-basic');

      expect(mockApiServicePost).toHaveBeenCalledWith('/graph/execute/users-basic', {
        parameters: undefined,
        credentialId: undefined
      });
      expect(result).toEqual(mockResponse);
    });

    it('should execute Graph query with parameters and credential ID', async () => {
      const parameters = { filter: "department eq 'IT'" };
      const credentialId = 456;

      const mockResult: GraphExecutionResult = {
        id: 'exec-2',
        queryId: 'users-filtered',
        userId: 123,
        executedAt: '2025-01-15T10:35:00Z',
        parameters,
        resultCount: 2,
        executionTimeMs: 200,
        status: 'success',
        data: [
          { id: '3', displayName: 'Bob Johnson', department: 'IT' }
        ]
      };

      const mockResponse = {
        success: true,
        data: mockResult
      };

      mockApiServicePost.mockResolvedValue(mockResponse);

      const result = await graphService.executeQuery('users-filtered', parameters, credentialId);

      expect(mockApiServicePost).toHaveBeenCalledWith('/graph/execute/users-filtered', {
        parameters,
        credentialId
      });
      expect(result).toEqual(mockResponse);
    });

    it('should handle query execution errors', async () => {
      const error = new Error('Query execution failed');
      mockApiServicePost.mockRejectedValue(error);

      await expect(graphService.executeQuery('invalid-query')).rejects.toThrow('Query execution failed');
    });

    it('should handle failed query execution in response', async () => {
      const mockResult: GraphExecutionResult = {
        id: 'exec-3',
        queryId: 'failing-query',
        userId: 123,
        executedAt: '2025-01-15T10:40:00Z',
        parameters: {},
        resultCount: 0,
        executionTimeMs: 50,
        status: 'error',
        error: 'Invalid Graph API query syntax'
      };

      const mockResponse = {
        success: true,
        data: mockResult
      };

      mockApiServicePost.mockResolvedValue(mockResponse);

      const result = await graphService.executeQuery('failing-query');

      expect(result).toEqual(mockResponse);
      expect(result.data.status).toBe('error');
      expect(result.data.error).toBe('Invalid Graph API query syntax');
    });
  });

  describe('executeBatch', () => {
    it('should execute multiple Graph queries in batch', async () => {
      const queries = [
        { queryId: 'users-basic', parameters: {} },
        { queryId: 'groups-basic', parameters: { top: 10 } }
      ];

      const mockResults: GraphExecutionResult[] = [
        {
          id: 'batch-1-1',
          queryId: 'users-basic',
          userId: 123,
          executedAt: '2025-01-15T10:45:00Z',
          parameters: {},
          resultCount: 5,
          executionTimeMs: 150,
          status: 'success'
        },
        {
          id: 'batch-1-2',
          queryId: 'groups-basic',
          userId: 123,
          executedAt: '2025-01-15T10:45:00Z',
          parameters: { top: 10 },
          resultCount: 3,
          executionTimeMs: 100,
          status: 'success'
        }
      ];

      const mockResponse = {
        success: true,
        data: {
          results: mockResults,
          totalQueries: 2,
          successCount: 2
        }
      };

      mockApiServicePost.mockResolvedValue(mockResponse);

      const result = await graphService.executeBatch(queries);

      expect(mockApiServicePost).toHaveBeenCalledWith('/graph/batch', { queries });
      expect(result).toEqual(mockResponse);
    });

    it('should handle batch execution with mixed success/failure', async () => {
      const queries = [
        { queryId: 'valid-query' },
        { queryId: 'invalid-query' }
      ];

      const mockResults: GraphExecutionResult[] = [
        {
          id: 'batch-2-1',
          queryId: 'valid-query',
          userId: 123,
          executedAt: '2025-01-15T10:50:00Z',
          parameters: {},
          resultCount: 2,
          executionTimeMs: 120,
          status: 'success'
        },
        {
          id: 'batch-2-2',
          queryId: 'invalid-query',
          userId: 123,
          executedAt: '2025-01-15T10:50:00Z',
          parameters: {},
          resultCount: 0,
          executionTimeMs: 50,
          status: 'error',
          error: 'Query not found'
        }
      ];

      const mockResponse = {
        success: true,
        data: {
          results: mockResults,
          totalQueries: 2,
          successCount: 1
        }
      };

      mockApiServicePost.mockResolvedValue(mockResponse);

      const result = await graphService.executeBatch(queries);

      expect(result.data.successCount).toBe(1);
      expect(result.data.results[1].status).toBe('error');
    });

    it('should handle empty batch queries', async () => {
      const mockResponse = {
        success: true,
        data: {
          results: [],
          totalQueries: 0,
          successCount: 0
        }
      };

      mockApiServicePost.mockResolvedValue(mockResponse);

      const result = await graphService.executeBatch([]);

      expect(result).toEqual(mockResponse);
    });
  });

  describe('discoverFields', () => {
    it('should discover fields for entity type without credential ID', async () => {
      const mockFields: GraphFieldMetadata[] = [
        {
          name: 'id',
          displayName: 'ID',
          type: 'Edm.String',
          description: 'Unique identifier',
          category: 'Basic',
          isSearchable: false,
          isSortable: true,
          isFilterable: true
        },
        {
          name: 'displayName',
          displayName: 'Display Name',
          type: 'Edm.String',
          description: 'User display name',
          category: 'Basic',
          isSearchable: true,
          isSortable: true,
          isFilterable: true
        },
        {
          name: 'assignedLicenses',
          displayName: 'Assigned Licenses',
          type: 'Collection',
          description: 'Licenses assigned to user',
          category: 'Licenses',
          isExpanded: true,
          expandedType: 'AssignedLicense'
        }
      ];

      const mockResponse = {
        success: true,
        data: {
          entityType: 'users',
          fields: mockFields,
          totalFields: 3
        }
      };

      mockApiServiceGet.mockResolvedValue(mockResponse);

      const result = await graphService.discoverFields('users');

      expect(mockApiServiceGet).toHaveBeenCalledWith('/graph/fields/users', undefined, {
        useCache: true,
        cacheTTL: 600,
        priority: ApiPriority.HIGH
      });
      expect(result).toEqual(mockResponse);
    });

    it('should discover fields with credential ID', async () => {
      const credentialId = 789;
      const mockResponse = {
        success: true,
        data: {
          entityType: 'groups',
          fields: [],
          totalFields: 0
        }
      };

      mockApiServiceGet.mockResolvedValue(mockResponse);

      await graphService.discoverFields('groups', credentialId);

      expect(mockApiServiceGet).toHaveBeenCalledWith('/graph/fields/groups', { credentialId }, {
        useCache: true,
        cacheTTL: 600,
        priority: ApiPriority.HIGH
      });
    });

    it('should handle field discovery errors', async () => {
      const error = new Error('Field discovery failed');
      mockApiServiceGet.mockRejectedValue(error);

      await expect(graphService.discoverFields('devices')).rejects.toThrow('Field discovery failed');
    });
  });

  describe('searchFields', () => {
    it('should search fields for entity type', async () => {
      const mockFields: GraphFieldMetadata[] = [
        {
          name: 'mail',
          displayName: 'Email Address',
          type: 'Edm.String',
          description: 'Primary email address',
          category: 'Contact',
          isSearchable: true
        },
        {
          name: 'mailNickname',
          displayName: 'Mail Nickname',
          type: 'Edm.String',
          description: 'Email alias',
          category: 'Contact',
          isSearchable: true
        }
      ];

      const mockResponse = {
        success: true,
        data: {
          entityType: 'users',
          fields: mockFields,
          searchTerm: 'mail'
        }
      };

      mockApiServiceGet.mockResolvedValue(mockResponse);

      const result = await graphService.searchFields('users', 'mail');

      expect(mockApiServiceGet).toHaveBeenCalledWith('/graph/fields/users/search', { search: 'mail' });
      expect(result).toEqual(mockResponse);
    });

    it('should handle empty search results', async () => {
      const mockResponse = {
        success: true,
        data: {
          entityType: 'users',
          fields: [],
          searchTerm: 'nonexistent'
        }
      };

      mockApiServiceGet.mockResolvedValue(mockResponse);

      const result = await graphService.searchFields('users', 'nonexistent');

      expect(result.data.fields).toHaveLength(0);
    });
  });

  describe('getHistory', () => {
    it('should get Graph query execution history with default parameters', async () => {
      const mockExecutions: GraphExecutionResult[] = [
        {
          id: 'hist-1',
          queryId: 'users-recent',
          userId: 123,
          executedAt: '2025-01-15T10:00:00Z',
          parameters: {},
          resultCount: 10,
          executionTimeMs: 200,
          status: 'success'
        }
      ];

      const mockResponse = {
        success: true,
        data: {
          executions: mockExecutions,
          total: 1,
          limit: 50,
          offset: 0
        }
      };

      mockApiServiceGet.mockResolvedValue(mockResponse);

      const result = await graphService.getHistory();

      expect(mockApiServiceGet).toHaveBeenCalledWith('/graph/history', {
        limit: 50,
        offset: 0
      });
      expect(result).toEqual(mockResponse);
    });

    it('should get history with custom pagination', async () => {
      const limit = 25;
      const offset = 50;

      const mockResponse = {
        success: true,
        data: {
          executions: [],
          total: 100,
          limit,
          offset
        }
      };

      mockApiServiceGet.mockResolvedValue(mockResponse);

      await graphService.getHistory(limit, offset);

      expect(mockApiServiceGet).toHaveBeenCalledWith('/graph/history', {
        limit,
        offset
      });
    });
  });

  describe('getExecution', () => {
    it('should get specific execution details', async () => {
      const executionId = 'exec-123';
      const mockExecution: GraphExecutionResult = {
        id: executionId,
        queryId: 'detailed-query',
        userId: 456,
        executedAt: '2025-01-15T11:00:00Z',
        parameters: { filter: "startsWith(displayName, 'A')" },
        resultCount: 25,
        executionTimeMs: 350,
        status: 'success',
        data: [
          { id: '1', displayName: 'Alice Johnson' },
          { id: '2', displayName: 'Andrew Smith' }
        ]
      };

      const mockResponse = {
        success: true,
        data: mockExecution
      };

      mockApiServiceGet.mockResolvedValue(mockResponse);

      const result = await graphService.getExecution(executionId);

      expect(mockApiServiceGet).toHaveBeenCalledWith(`/graph/history/${executionId}`);
      expect(result).toEqual(mockResponse);
    });

    it('should handle execution not found', async () => {
      const error = new Error('Execution not found');
      mockApiServiceGet.mockRejectedValue(error);

      await expect(graphService.getExecution('nonexistent')).rejects.toThrow('Execution not found');
    });
  });

  describe('getEntityTypes', () => {
    it('should return available Graph API entity types', async () => {
      const result = await graphService.getEntityTypes();

      expect(result.success).toBe(true);
      expect(result.data).toEqual([
        'users',
        'groups',
        'devices',
        'applications',
        'servicePrincipals',
        'directoryRoles',
        'domains',
        'licenses',
        'organization',
        'policies'
      ]);
    });
  });

  describe('convertFieldsToAzureFormat', () => {
    it('should convert Graph fields to Azure AD format', async () => {
      const graphFields: GraphFieldMetadata[] = [
        {
          name: 'id',
          displayName: 'User ID',
          type: 'Edm.String',
          description: 'Unique identifier',
          category: 'Identity',
          isSearchable: true,
          isSortable: true
        },
        {
          name: 'createdDateTime',
          displayName: 'Created Date',
          type: 'Edm.DateTimeOffset',
          description: 'Account creation date',
          category: 'Metadata',
          isSearchable: false,
          isSortable: true
        },
        {
          name: 'assignedLicenses',
          displayName: 'Licenses',
          type: 'Collection',
          category: 'Licensing'
        }
      ];

      const result = await graphService.convertFieldsToAzureFormat(graphFields);

      expect(result).toHaveLength(3);
      
      expect(result[0]).toEqual({
        fieldName: 'id',
        displayName: 'User ID',
        dataType: 'string',
        category: 'Identity',
        description: 'Unique identifier',
        isSearchable: true,
        isSortable: true,
        isExportable: true,
        source: 'azure'
      });

      expect(result[1]).toEqual({
        fieldName: 'createdDateTime',
        displayName: 'Created Date',
        dataType: 'datetime',
        category: 'Metadata',
        description: 'Account creation date',
        isSearchable: false,
        isSortable: true,
        isExportable: true,
        source: 'azure'
      });

      expect(result[2]).toEqual({
        fieldName: 'assignedLicenses',
        displayName: 'Licenses',
        dataType: 'array',
        category: 'Licensing',
        description: undefined,
        isSearchable: true, // default
        isSortable: true, // default
        isExportable: true,
        source: 'azure'
      });
    });

    it('should handle fields without category', async () => {
      const graphFields: GraphFieldMetadata[] = [
        {
          name: 'displayName',
          displayName: 'Display Name',
          type: 'Edm.String'
        }
      ];

      const result = await graphService.convertFieldsToAzureFormat(graphFields);

      expect(result[0]).toMatchObject({
        fieldName: 'displayName',
        displayName: 'Display Name',
        dataType: 'string',
        category: 'General',
        isSearchable: true,
        isSortable: true,
        isExportable: true,
        source: 'azure'
      });
    });
  });

  describe('storeSessionCredentials', () => {
    it('should store Azure AD credentials from OAuth flow', async () => {
      const credentials = {
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-456',
        expiresAt: 1704067200,
        userInfo: {
          id: 'user-789',
          displayName: 'Test User',
          mail: 'test@company.com'
        }
      };

      const mockResponse = {
        success: true,
        data: { credentialId: 999 }
      };

      mockApiServicePost.mockResolvedValue(mockResponse);

      const result = await graphService.storeSessionCredentials(credentials);

      expect(mockApiServicePost).toHaveBeenCalledWith('/auth/azure/store-credentials', {
        credentials,
        serviceType: 'azure'
      });
      expect(result).toEqual(mockResponse);
    });

    it('should handle credential storage errors', async () => {
      const credentials = {
        accessToken: 'invalid-token',
        expiresAt: 1704067200,
        userInfo: {}
      };

      const error = new Error('Invalid credentials');
      mockApiServicePost.mockRejectedValue(error);

      await expect(graphService.storeSessionCredentials(credentials)).rejects.toThrow('Invalid credentials');
    });
  });

  describe('type mapping', () => {
    it('should map Graph types to Azure types correctly', () => {
      // Access private method via type assertion for testing
      const service = graphService as unknown;
      
      expect(service.mapGraphTypeToAzureType('Edm.String')).toBe('string');
      expect(service.mapGraphTypeToAzureType('Edm.Boolean')).toBe('boolean');
      expect(service.mapGraphTypeToAzureType('Edm.Int32')).toBe('number');
      expect(service.mapGraphTypeToAzureType('Edm.Int64')).toBe('number');
      expect(service.mapGraphTypeToAzureType('Edm.DateTime')).toBe('datetime');
      expect(service.mapGraphTypeToAzureType('Edm.DateTimeOffset')).toBe('datetime');
      expect(service.mapGraphTypeToAzureType('Collection')).toBe('array');
      expect(service.mapGraphTypeToAzureType('ComplexType')).toBe('object');
      expect(service.mapGraphTypeToAzureType('UnknownType')).toBe('string');
    });
  });

  describe('integration scenarios', () => {
    it('should handle concurrent field discovery requests', async () => {
      const mockResponse1 = {
        success: true,
        data: { entityType: 'users', fields: [{ name: 'id', displayName: 'ID', type: 'Edm.String' }], totalFields: 1 }
      };
      const mockResponse2 = {
        success: true,
        data: { entityType: 'groups', fields: [{ name: 'id', displayName: 'ID', type: 'Edm.String' }], totalFields: 1 }
      };

      mockApiServiceGet
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2);

      const [result1, result2] = await Promise.all([
        graphService.discoverFields('users'),
        graphService.discoverFields('groups')
      ]);

      expect(result1.data.entityType).toBe('users');
      expect(result2.data.entityType).toBe('groups');
      expect(mockApiServiceGet).toHaveBeenCalledTimes(2);
    });

    it('should handle API rate limiting gracefully', async () => {
      const rateLimitError = new Error('Too Many Requests');
      (rateLimitError as unknown as { response: { status: number } }).response = { status: 429 };

      mockApiServiceGet.mockRejectedValue(rateLimitError);

      await expect(graphService.getTemplates()).rejects.toThrow('Too Many Requests');
    });
  });
});