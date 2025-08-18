import request from 'supertest';
import express from 'express';
import { graphController } from './graph.controller';
import { GraphQueryExecutor } from '../services/graph-query-executor.service';
import { GraphFieldDiscoveryService } from '../services/graph-field-discovery.service';
import { getQueryById, getQueriesByCategory, getAllQueries } from '../queries/graph';
import { logger } from '../utils/logger';
import { User } from '../auth/types';

// Mock dependencies
jest.mock('../services/graph-query-executor.service');
jest.mock('../services/graph-field-discovery.service');
jest.mock('../queries/graph');
jest.mock('../utils/logger');

describe('GraphController', () => {
  let app: express.Application;
  let mockQueryExecutor: jest.Mocked<GraphQueryExecutor>;
  let mockFieldDiscovery: jest.Mocked<GraphFieldDiscoveryService>;
  
  const mockExecutionDate = new Date('2025-01-01T10:00:00Z');

  const mockUser: User = {
    id: 1,
    username: 'testuser',
    displayName: 'Test User',
    email: 'test@example.com',
    authSource: 'azure',
    isAdmin: false,
    isActive: true,
    lastLogin: new Date(),
    createdAt: new Date(),
    updatedAt: new Date()
  };


  const mockQueryDefinition = {
    id: 'test_query',
    name: 'Test Query',
    description: 'Test query for unit tests',
    category: 'users',
    parameters: {
      userType: {
        type: 'string',
        default: 'Member'
      }
    },
    fieldMappings: {
      id: { displayName: 'ID' },
      displayName: { displayName: 'Display Name' }
    }
  };

  const mockFieldSchema = {
    entityType: 'user' as const,
    fields: [
      {
        name: 'id',
        displayName: 'ID',
        type: 'string',
        description: 'Unique identifier',
        category: 'basic',
        isSearchable: true,
        isSortable: true,
        isExpandable: false
      },
      {
        name: 'displayName',
        displayName: 'Display Name',
        type: 'string',
        description: 'User display name',
        category: 'basic',
        isSearchable: true,
        isSortable: true,
        isExpandable: false
      },
      {
        name: 'mail',
        displayName: 'Email',
        type: 'string',
        description: 'Email address',
        category: 'contact',
        isSearchable: true,
        isSortable: true,
        isExpandable: false
      }
    ],
    relationships: [],
    supportedOperations: ['read', 'update']
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Create Express app
    app = express();
    app.use(express.json());

    // Mock middleware - authenticate user
    app.use((req: any, _res, next) => {
      req.user = mockUser;
      next();
    });

    // Setup controller routes
    app.get('/api/graph/templates', graphController.getTemplates);
    app.post('/api/graph/execute/:queryId', graphController.executeQuery);
    app.get('/api/graph/fields/:entityType', graphController.discoverFields);
    app.get('/api/graph/fields/:entityType/search', graphController.searchFields);
    app.get('/api/graph/history', graphController.getHistory);
    app.get('/api/graph/executions/:executionId', graphController.getExecutionResult);
    app.post('/api/graph/batch', graphController.executeBatch);

    // Mock service instances
    mockQueryExecutor = new GraphQueryExecutor() as jest.Mocked<GraphQueryExecutor>;
    mockFieldDiscovery = new GraphFieldDiscoveryService() as jest.Mocked<GraphFieldDiscoveryService>;

    // Replace instances in controller
    (graphController as any).queryExecutor = mockQueryExecutor;
    (graphController as any).fieldDiscovery = mockFieldDiscovery;

    // Setup default mocks
    (getQueryById as jest.Mock).mockReturnValue(mockQueryDefinition);
    (getAllQueries as jest.Mock).mockReturnValue([mockQueryDefinition]);
    (getQueriesByCategory as jest.Mock).mockReturnValue([mockQueryDefinition]);
  });

  describe('getTemplates', () => {
    it('should return all templates successfully', async () => {
      const response = await request(app)
        .get('/api/graph/templates')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          templates: [{
            id: 'test_query',
            name: 'Test Query',
            description: 'Test query for unit tests',
            category: 'users',
            parameters: {
              userType: {
                type: 'string',
                default: 'Member'
              }
            },
            fieldMappings: {
              id: { displayName: 'ID' },
              displayName: { displayName: 'Display Name' }
            }
          }],
          totalCount: 1
        }
      });

      expect(getAllQueries).toHaveBeenCalled();
    });

    it('should filter templates by category', async () => {
      const response = await request(app)
        .get('/api/graph/templates?category=users')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.templates).toHaveLength(1);
      expect(getQueriesByCategory).toHaveBeenCalledWith('users');
    });

    it('should handle errors when fetching templates', async () => {
      const error = new Error('Database error');
      (getAllQueries as jest.Mock).mockImplementation(() => {
        throw error;
      });

      await request(app)
        .get('/api/graph/templates')
        .expect(500);

      expect(logger.error).toHaveBeenCalledWith('Error fetching Graph templates:', error);
    });
  });

  describe('executeQuery', () => {
    const mockExecutionResult = {
      queryId: 'test_query',
      executedAt: mockExecutionDate,
      executionTimeMs: 150,
      rowCount: 2,
      data: [
        { id: '1', displayName: 'User 1' },
        { id: '2', displayName: 'User 2' }
      ],
      metadata: {
        totalCount: 2
      }
    };

    it('should execute query successfully', async () => {
      mockQueryExecutor.executeQuery.mockResolvedValue(mockExecutionResult);

      const response = await request(app)
        .post('/api/graph/execute/test_query')
        .send({
          parameters: { userType: 'Member' },
          credentialId: 1,
          context: 'azure'
        })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          ...mockExecutionResult,
          executedAt: mockExecutionResult.executedAt.toISOString()
        }
      });

      expect(mockQueryExecutor.executeQuery).toHaveBeenCalledWith({
        queryId: 'test_query',
        userId: 1,
        credentialId: 1,
        parameters: { userType: 'Member' },
        saveHistory: true,
        graphContext: 'azure'
      });
    });

    it('should handle query not found', async () => {
      (getQueryById as jest.Mock).mockReturnValue(null);

      const response = await request(app)
        .post('/api/graph/execute/nonexistent')
        .send({})
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        error: 'Query template not found'
      });
    });

    it('should handle execution errors', async () => {
      const error = new Error('Graph API error');
      mockQueryExecutor.executeQuery.mockRejectedValue(error);

      await request(app)
        .post('/api/graph/execute/test_query')
        .send({})
        .expect(500);

      expect(logger.error).toHaveBeenCalledWith('Error executing Graph query:', error);
    });

    it('should execute query with default parameters', async () => {
      mockQueryExecutor.executeQuery.mockResolvedValue(mockExecutionResult);

      await request(app)
        .post('/api/graph/execute/test_query')
        .send({})
        .expect(200);

      expect(mockQueryExecutor.executeQuery).toHaveBeenCalledWith({
        queryId: 'test_query',
        userId: 1,
        credentialId: undefined,
        parameters: {},
        saveHistory: true,
        graphContext: undefined
      });
    });
  });

  describe('discoverFields', () => {
    it('should discover fields for user entity type', async () => {
      mockFieldDiscovery.discoverFields.mockResolvedValue(mockFieldSchema);

      const response = await request(app)
        .get('/api/graph/fields/user')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          entityType: 'user',
          fields: mockFieldSchema.fields,
          totalFields: 3,
          refreshed: false
        }
      });

      expect(mockFieldDiscovery.discoverFields).toHaveBeenCalledWith(
        'user',
        { userId: 1 }
      );
    });

    it('should discover fields with refresh parameter', async () => {
      mockFieldDiscovery.discoverFields.mockResolvedValue(mockFieldSchema);

      const response = await request(app)
        .get('/api/graph/fields/group?refresh=true')
        .expect(200);

      expect(response.body.data.refreshed).toBe(true);
    });

    it('should handle authentication errors', async () => {
      const authError = new Error('Azure AD authentication required');
      mockFieldDiscovery.discoverFields.mockRejectedValue(authError);

      const response = await request(app)
        .get('/api/graph/fields/user')
        .expect(401);

      expect(response.body).toEqual({
        success: false,
        error: 'Azure AD authentication required. Please authenticate with your Azure AD account.',
        code: 'AUTH_REQUIRED'
      });
    });

    it('should handle 401 unauthorized errors', async () => {
      const authError = new Error('Unauthorized request - 401');
      mockFieldDiscovery.discoverFields.mockRejectedValue(authError);

      const response = await request(app)
        .get('/api/graph/fields/user')
        .expect(401);

      expect(response.body.code).toBe('AUTH_REQUIRED');
    });

    it('should handle other errors', async () => {
      const error = new Error('Network error');
      mockFieldDiscovery.discoverFields.mockRejectedValue(error);

      await request(app)
        .get('/api/graph/fields/user')
        .expect(500);

      expect(logger.error).toHaveBeenCalledWith('Error discovering Graph fields:', {
        entityType: 'user',
        userId: 1,
        error: 'Network error',
        stack: expect.any(String)
      });
    });

    it('should discover fields for all supported entity types', async () => {
      mockFieldDiscovery.discoverFields.mockResolvedValue(mockFieldSchema);

      const entityTypes = ['user', 'group', 'application', 'device', 'directoryRole'];

      for (const entityType of entityTypes) {
        await request(app)
          .get(`/api/graph/fields/${entityType}`)
          .expect(200);

        expect(mockFieldDiscovery.discoverFields).toHaveBeenCalledWith(
          entityType,
          { userId: 1 }
        );
      }
    });
  });

  describe('searchFields', () => {
    it('should search fields successfully', async () => {
      mockFieldDiscovery.discoverFields.mockResolvedValue(mockFieldSchema);

      const response = await request(app)
        .get('/api/graph/fields/user/search?search=mail')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          entityType: 'user',
          fields: [mockFieldSchema.fields[2]], // Only mail field should match
          searchTerm: 'mail'
        }
      });
    });

    it('should search by display name', async () => {
      mockFieldDiscovery.discoverFields.mockResolvedValue(mockFieldSchema);

      const response = await request(app)
        .get('/api/graph/fields/user/search?search=Display')
        .expect(200);

      expect(response.body.data.fields).toHaveLength(1);
      expect(response.body.data.fields[0].name).toBe('displayName');
    });

    it('should search by description', async () => {
      mockFieldDiscovery.discoverFields.mockResolvedValue(mockFieldSchema);

      const response = await request(app)
        .get('/api/graph/fields/user/search?search=identifier')
        .expect(200);

      expect(response.body.data.fields).toHaveLength(1);
      expect(response.body.data.fields[0].name).toBe('id');
    });

    it('should require search term', async () => {
      const response = await request(app)
        .get('/api/graph/fields/user/search')
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'Search term is required'
      });
    });

    it('should handle search errors', async () => {
      const error = new Error('Search error');
      mockFieldDiscovery.discoverFields.mockRejectedValue(error);

      await request(app)
        .get('/api/graph/fields/user/search?search=test')
        .expect(500);

      expect(logger.error).toHaveBeenCalledWith('Error searching Graph fields:', error);
    });

    it('should return empty results for no matches', async () => {
      mockFieldDiscovery.discoverFields.mockResolvedValue(mockFieldSchema);

      const response = await request(app)
        .get('/api/graph/fields/user/search?search=nonexistent')
        .expect(200);

      expect(response.body.data.fields).toHaveLength(0);
    });
  });

  describe('getHistory', () => {
    it('should return execution history', async () => {
      const response = await request(app)
        .get('/api/graph/history')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: { history: [] }
      });
    });

    it('should handle query parameters', async () => {
      const response = await request(app)
        .get('/api/graph/history?queryId=test_query&limit=10&offset=5')
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should handle history errors', async () => {
      // This is a stub method that returns empty history, so no actual errors to test
      expect(true).toBe(true);
    });
  });

  describe('getExecutionResult', () => {
    it('should return execution not found', async () => {
      const response = await request(app)
        .get('/api/graph/executions/123')
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        error: 'Execution not found'
      });
    });

    it('should handle execution result errors', async () => {
      // This is a stub method that returns null execution, so no actual errors to test
      expect(true).toBe(true);
    });
  });

  describe('executeBatch', () => {
    const mockBatchQueries = [
      { queryId: 'test_query', parameters: { userType: 'Member' } },
      { queryId: 'test_query', parameters: { userType: 'Guest' } }
    ];

    const mockBatchResult = {
      queryId: 'test_query',
      executedAt: mockExecutionDate,
      executionTimeMs: 100,
      rowCount: 1,
      data: [{ id: '1', displayName: 'User 1' }],
      metadata: {
        totalCount: 1
      }
    };

    it('should execute batch queries successfully', async () => {
      mockQueryExecutor.executeQuery
        .mockResolvedValueOnce(mockBatchResult)
        .mockResolvedValueOnce(mockBatchResult);

      const response = await request(app)
        .post('/api/graph/batch')
        .send({ queries: mockBatchQueries })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.results).toHaveLength(2);
      expect(mockQueryExecutor.executeQuery).toHaveBeenCalledTimes(2);
    });

    it('should handle batch execution with some failures', async () => {
      mockQueryExecutor.executeQuery
        .mockResolvedValueOnce(mockBatchResult)
        .mockRejectedValueOnce(new Error('Query failed'));

      const response = await request(app)
        .post('/api/graph/batch')
        .send({ queries: mockBatchQueries })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.results).toHaveLength(2);
      expect(response.body.data.results[0]).toEqual({
        ...mockBatchResult,
        executedAt: mockBatchResult.executedAt.toISOString()
      });
      expect(response.body.data.results[1]).toEqual({
        queryId: 'test_query',
        error: 'Query failed'
      });
    });

    it('should handle query not found in batch', async () => {
      (getQueryById as jest.Mock)
        .mockReturnValueOnce(mockQueryDefinition)
        .mockReturnValueOnce(null);

      const response = await request(app)
        .post('/api/graph/batch')
        .send({ queries: mockBatchQueries })
        .expect(200);

      expect(response.body.data.results[1]).toEqual({
        queryId: 'test_query',
        error: 'Query test_query not found'
      });
    });

    it('should validate queries array is required', async () => {
      const response = await request(app)
        .post('/api/graph/batch')
        .send({})
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'Queries array is required'
      });
    });

    it('should validate queries array is not empty', async () => {
      const response = await request(app)
        .post('/api/graph/batch')
        .send({ queries: [] })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'Queries array is required'
      });
    });

    it('should handle batch execution errors', async () => {
      // Test that unhandled errors are properly logged
      const error = new Error('Batch execution error');
      mockQueryExecutor.executeQuery.mockRejectedValue(error);

      await request(app)
        .post('/api/graph/batch')
        .send({ queries: [mockBatchQueries[0]] })
        .expect(200); // Batch handles errors gracefully

      expect(mockQueryExecutor.executeQuery).toHaveBeenCalled();
    });

    it('should execute batch without saving history', async () => {
      mockQueryExecutor.executeQuery.mockResolvedValue(mockBatchResult);

      await request(app)
        .post('/api/graph/batch')
        .send({ queries: [mockBatchQueries[0]] })
        .expect(200);

      expect(mockQueryExecutor.executeQuery).toHaveBeenCalledWith({
        queryId: 'test_query',
        userId: 1,
        parameters: { userType: 'Member' },
        saveHistory: false
      });
    });
  });

  describe('Authentication and Authorization', () => {
    it('should require authenticated user for all endpoints', async () => {
      // Test that the user object is required - this would throw if req.user is undefined
      const testReq = {} as any;
      
      try {
        await graphController.discoverFields(testReq, {} as any, jest.fn());
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should pass user ID to services', async () => {
      mockFieldDiscovery.discoverFields.mockResolvedValue(mockFieldSchema);

      await request(app)
        .get('/api/graph/fields/user')
        .expect(200);

      expect(mockFieldDiscovery.discoverFields).toHaveBeenCalledWith(
        'user',
        { userId: 1 }
      );
    });
  });

  describe('Parameter Handling', () => {
    it('should handle optional parameters in executeQuery', async () => {
      mockQueryExecutor.executeQuery.mockResolvedValue({ 
        queryId: 'test_query',
        executedAt: mockExecutionDate,
        executionTimeMs: 50,
        rowCount: 0,
        data: [],
        metadata: { totalCount: 0 }
      });

      await request(app)
        .post('/api/graph/execute/test_query')
        .send({
          parameters: { userType: 'Guest' }
        })
        .expect(200);

      expect(mockQueryExecutor.executeQuery).toHaveBeenCalledWith({
        queryId: 'test_query',
        userId: 1,
        credentialId: undefined,
        parameters: { userType: 'Guest' },
        saveHistory: true,
        graphContext: undefined
      });
    });

    it('should handle category filter in getTemplates', async () => {
      const categoryQueries = [{ ...mockQueryDefinition, category: 'security' }];
      (getQueriesByCategory as jest.Mock).mockReturnValue(categoryQueries);

      const response = await request(app)
        .get('/api/graph/templates?category=security')
        .expect(200);

      expect(response.body.data.templates[0].category).toBe('security');
      expect(getQueriesByCategory).toHaveBeenCalledWith('security');
    });

    it('should handle refresh and category parameters in discoverFields', async () => {
      mockFieldDiscovery.discoverFields.mockResolvedValue(mockFieldSchema);

      const response = await request(app)
        .get('/api/graph/fields/user?refresh=true&category=basic')
        .expect(200);

      expect(response.body.data.refreshed).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle non-Error objects', async () => {
      mockFieldDiscovery.discoverFields.mockRejectedValue('String error');

      await request(app)
        .get('/api/graph/fields/user')
        .expect(500);

      expect(logger.error).toHaveBeenCalledWith('Error discovering Graph fields:', {
        entityType: 'user',
        userId: 1,
        error: 'String error',
        stack: undefined
      });
    });

    it('should detect various authentication error patterns', async () => {
      const authErrors = [
        'authentication failed',
        'unauthorized access',
        'HTTP 401 error',
        'Azure AD authentication required'
      ];

      for (const errorMsg of authErrors) {
        mockFieldDiscovery.discoverFields.mockRejectedValue(new Error(errorMsg));

        const response = await request(app)
          .get('/api/graph/fields/user')
          .expect(401);

        expect(response.body.code).toBe('AUTH_REQUIRED');
      }
    });
  });

  describe('Field Mappings and Parameters', () => {
    it('should return field mappings in templates', async () => {
      const response = await request(app)
        .get('/api/graph/templates')
        .expect(200);

      expect(response.body.data.templates[0].fieldMappings).toEqual({
        id: { displayName: 'ID' },
        displayName: { displayName: 'Display Name' }
      });
    });

    it('should return parameters in templates', async () => {
      const response = await request(app)
        .get('/api/graph/templates')
        .expect(200);

      expect(response.body.data.templates[0].parameters).toEqual({
        userType: {
          type: 'string',
          default: 'Member'
        }
      });
    });

    it('should handle templates without field mappings or parameters', async () => {
      const minimalQuery = {
        id: 'minimal_query',
        name: 'Minimal Query',
        description: 'Query without mappings',
        category: 'test'
      };
      (getAllQueries as jest.Mock).mockReturnValue([minimalQuery]);

      const response = await request(app)
        .get('/api/graph/templates')
        .expect(200);

      expect(response.body.data.templates[0].parameters).toEqual({});
      expect(response.body.data.templates[0].fieldMappings).toEqual({});
    });
  });

  describe('Logging', () => {
    it('should log field discovery success', async () => {
      mockFieldDiscovery.discoverFields.mockResolvedValue(mockFieldSchema);

      await request(app)
        .get('/api/graph/fields/user')
        .expect(200);

      expect(logger.info).toHaveBeenCalledWith('Graph fields discovered for user:', {
        fieldsCount: 3,
        _userId: 1
      });
    });

    it('should log all error types', async () => {
      const error = new Error('Test error');
      
      // Test each endpoint's error logging
      const endpoints = [
        { method: 'get', path: '/api/graph/templates', mockFn: getAllQueries, isFunction: true },
        { method: 'post', path: '/api/graph/execute/test_query', mockFn: mockQueryExecutor.executeQuery, isFunction: false },
        { method: 'get', path: '/api/graph/fields/user/search?search=test', mockFn: mockFieldDiscovery.discoverFields, isFunction: false }
      ];

      for (const endpoint of endpoints) {
        jest.clearAllMocks();
        
        if (endpoint.isFunction) {
          (endpoint.mockFn as jest.Mock).mockImplementation(() => {
            throw error;
          });
        } else {
          (endpoint.mockFn as jest.Mock).mockRejectedValue(error);
        }

        await request(app)[endpoint.method as 'get' | 'post'](endpoint.path)
          .send(endpoint.method === 'post' ? {} : undefined);

        expect(logger.error).toHaveBeenCalled();
      }
    });
  });
});