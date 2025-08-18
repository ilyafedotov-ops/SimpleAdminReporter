import { GraphQueryExecutor } from "./graph-query-executor.service";
// import { AzureMsalService } from './azure-msal.service';
import { GraphQueryDefinition, GraphQueryExecutionContext } from '../queries/graph/types';
import { db } from '../config/database';
import { getGraphQuery } from '../queries/graph';

// Mock dependencies
jest.mock('./azure-msal.service');
jest.mock('../config/database', () => ({
  db: {
    query: jest.fn()
  }
}));
jest.mock('../queries/graph', () => ({
  getGraphQuery: jest.fn(),
  transformFunctions: {}
}));

describe('GraphQueryExecutor Service', () => {
  let graphQueryExecutor: GraphQueryExecutor;
  let mockAzureService: any;

  const mockQueryDefinition: GraphQueryDefinition = {
    id: 'test_query',
    name: 'Test Query',
    description: 'Test query for unit tests',
    category: 'users',
    query: {
      endpoint: '/users',
      select: ['id', 'displayName', 'userPrincipalName'],
      filter: "userType eq '{{userType}}'",
      orderBy: 'displayName',
      top: 100
    },
    parameters: {
      userType: {
        type: 'string',
        default: 'Member',
        description: 'Type of user'
      }
    },
    fieldMappings: {
      userPrincipalName: {
        displayName: 'Email',
        type: 'string'
      }
    }
  };

  const mockContext: GraphQueryExecutionContext & { queryId: string } = {
    queryId: 'test_query',
    userId: 1,
    credentialId: 1,
    parameters: { userType: 'Guest' },
    options: {
      includeCount: true,
      pageSize: 50,
      maxRecords: 200
    },
    saveHistory: true
  };

  const mockCredential = {
    id: 1,
    userId: 1,
    serviceType: 'azure',
    tenantId: 'test-tenant',
    clientId: 'test-client',
    credentialMetadata: {
      authType: 'application',
      multiTenant: false
    }
  };

  const mockGraphResponse = {
    data: [
      { id: '1', displayName: 'User 1', userPrincipalName: 'user1@test.com' },
      { id: '2', displayName: 'User 2', userPrincipalName: 'user2@test.com' }
    ],
    count: 2,
    executionTime: 100,
    totalCount: 2
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockAzureService = {
      executeQuery: jest.fn().mockResolvedValue(mockGraphResponse)
    };

    // Reset mocks
    (db.query as jest.Mock).mockReset();
    (getGraphQuery as jest.Mock).mockReturnValue(mockQueryDefinition);
    
    // Default mock for getCredentials
    (db.query as jest.Mock).mockResolvedValue({
      rows: [mockCredential]
    });

    // Create instance with mocked dependencies
    graphQueryExecutor = new GraphQueryExecutor(mockAzureService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('executeQuery', () => {
    it('should execute a basic Graph query successfully', async () => {
      const result = await graphQueryExecutor.executeQuery(mockContext);

      expect(result).toBeDefined();
      expect(result.queryId).toBe('test_query');
      expect(result.rowCount).toBe(2);
      expect(((result as any)?.data)).toHaveLength(2);
      expect(result.metadata?.totalCount).toBe(2);
    });

    it('should apply parameter transformations', async () => {
      const queryWithTransform: GraphQueryDefinition = {
        ...mockQueryDefinition,
        query: {
          ...mockQueryDefinition.query,
          filter: "createdDateTime ge '{{cutoffDate}}'"
        },
        parameters: {
          days: {
            type: 'number',
            transform: 'daysToDate',
            default: 30
          }
        }
      };

      (getGraphQuery as jest.Mock).mockReturnValue(queryWithTransform);

      const context = {
        ...mockContext,
        parameters: { days: 7 }
      };

      await graphQueryExecutor.executeQuery(context);

      expect(mockAzureService.executeQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: '/users',
          graphOptions: expect.objectContaining({
            filter: expect.stringMatching(/createdDateTime ge/)
          })
        }),
        expect.any(Object)
      );
    });

    it('should handle missing required parameters', async () => {
      const queryWithRequired: GraphQueryDefinition = {
        ...mockQueryDefinition,
        parameters: {
          requiredParam: {
            type: 'string',
            required: true
          }
        }
      };

      (getGraphQuery as jest.Mock).mockReturnValue(queryWithRequired);

      const context = {
        ...mockContext,
        parameters: {} // Missing required parameter
      };

      await expect(graphQueryExecutor.executeQuery(context))
        .rejects.toThrow("Required parameter 'requiredParam' is missing");
    });

    it('should use credential from database when provided', async () => {
      (db.query as jest.Mock).mockResolvedValue({
        rows: [mockCredential]
      });

      await graphQueryExecutor.executeQuery(mockContext);

      expect(db.query).toHaveBeenCalledWith(
        'SELECT * FROM service_credentials WHERE id = $1',
        [1]
      );
    });

    it('should save execution history when saveHistory is true', async () => {
      // Mock multiple db.query calls - first for credentials, then for history
      (db.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockCredential] }) // For getCredentials
        .mockResolvedValueOnce({ rows: [] }); // For INSERT

      await graphQueryExecutor.executeQuery(mockContext);

      // Check that INSERT was called
      const insertCalls = (db.query as jest.Mock).mock.calls.filter(
        call => call[0].includes('INSERT INTO report_history')
      );
      
      expect(insertCalls).toHaveLength(1);
      expect(insertCalls[0][1]).toEqual(expect.arrayContaining([
        1, // userId
        'test_query', // reportId
        expect.any(Date), // executedAt
        expect.any(String), // parameters
        2, // resultCount
        expect.any(String), // results
        'success', // status
        null, // error
        expect.any(Number) // executionTimeMs
      ]));
    });

    it('should not save history when saveHistory is false', async () => {
      const contextNoHistory = {
        ...mockContext,
        saveHistory: false
      };

      await graphQueryExecutor.executeQuery(contextNoHistory);

      const historyCalls = (db.query as jest.Mock).mock.calls.filter(
        call => call[0].includes('INSERT INTO report_history')
      );
      expect(historyCalls).toHaveLength(0);
    });

    it('should handle Graph API errors gracefully', async () => {
      const errorMessage = 'Graph API error';
      mockAzureService.executeQuery.mockRejectedValue(new Error(errorMessage));

      await expect(graphQueryExecutor.executeQuery(mockContext))
        .rejects.toThrow(errorMessage);

      // Should still save error to history
      const historyCalls = (db.query as jest.Mock).mock.calls.filter(
        call => call[0].includes('INSERT INTO report_history')
      );
      expect(historyCalls).toHaveLength(1);
      expect(historyCalls[0][1][6]).toBe('error'); // status
      expect(historyCalls[0][1][7]).toBe(errorMessage); // error message
    });

    it('should apply field mappings to results', async () => {
      const result = await graphQueryExecutor.executeQuery(mockContext);

      // Check that field mappings are applied
      expect(((result as any)?.data)[0]).toHaveProperty('Email', 'user1@test.com');
    });

    it('should handle pagination correctly', async () => {
      const paginatedResponse = {
        ...mockGraphResponse,
        nextLink: 'https://graph.microsoft.com/v1.0/users?$skiptoken=xyz'
      };
      mockAzureService.executeQuery.mockResolvedValue(paginatedResponse);

      const result = await graphQueryExecutor.executeQuery(mockContext);

      expect(result.metadata?.nextLink).toBe('https://graph.microsoft.com/v1.0/users?$skiptoken=xyz');
    });
  });

  describe('executeWithUserContext', () => {
    it('should execute query with user context', async () => {
      const contextWithUser: GraphQueryExecutionContext & { queryId: string } = {
        ...mockContext,
        graphContext: {
          queryContext: 'user',
          targetUser: 'user@example.com'
        }
      };

      await graphQueryExecutor.executeQuery(contextWithUser);

      expect(mockAzureService.executeQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          userContext: {
            userId: 1
          }
        }),
        expect.any(Object)
      );
    });
  });

  describe('executeWithOrganizationContext', () => {
    it('should execute query for specific tenant', async () => {
      const contextWithOrg: GraphQueryExecutionContext & { queryId: string } = {
        ...mockContext,
        graphContext: {
          queryContext: 'organization',
          targetOrganization: 'tenant.onmicrosoft.com'
        }
      };

      await graphQueryExecutor.executeQuery(contextWithOrg);

      expect(mockAzureService.executeQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationContext: {
            tenantId: 'tenant.onmicrosoft.com'
          }
        }),
        expect.any(Object)
      );
    });
  });

  describe('Post-Processing', () => {
    it('should apply client-side filtering', async () => {
      const queryWithFilter: GraphQueryDefinition = {
        ...mockQueryDefinition,
        postProcess: {
          clientFilter: [{
            field: 'displayName',
            operator: 'contains',
            value: 'User 1'
          }]
        }
      };

      (getGraphQuery as jest.Mock).mockReturnValue(queryWithFilter);

      const result = await graphQueryExecutor.executeQuery(mockContext);

      expect(((result as any)?.data)).toHaveLength(1);
      expect(((result as any)?.data)[0].displayName).toBe('User 1');
    });

    it('should apply sorting', async () => {
      const queryWithSort: GraphQueryDefinition = {
        ...mockQueryDefinition,
        postProcess: {
          sort: {
            field: 'displayName',
            direction: 'desc'
          }
        }
      };

      (getGraphQuery as jest.Mock).mockReturnValue(queryWithSort);

      const result = await graphQueryExecutor.executeQuery(mockContext);

      expect(((result as any)?.data)[0].displayName).toBe('User 2');
      expect(((result as any)?.data)[1].displayName).toBe('User 1');
    });

    it('should apply result limit', async () => {
      const queryWithLimit: GraphQueryDefinition = {
        ...mockQueryDefinition,
        postProcess: {
          limit: 1
        }
      };

      (getGraphQuery as jest.Mock).mockReturnValue(queryWithLimit);

      const result = await graphQueryExecutor.executeQuery(mockContext);

      expect(((result as any)?.data)).toHaveLength(1);
    });
  });

  describe('executeBatch', () => {
    it('should execute multiple queries in batch', async () => {
      const queries = [
        { queryId: 'test_query', parameters: { userType: 'Member' } },
        { queryId: 'test_query', parameters: { userType: 'Guest' } }
      ];

      const results = await graphQueryExecutor.executeBatch(queries, {
        userId: 1,
        saveHistory: false
      });

      expect(results).toHaveLength(2);
      expect(results[0].queryId).toBe('test_query');
      expect(results[1].queryId).toBe('test_query');
    });

    it('should handle failures in batch execution', async () => {
      const queries = [
        { queryId: 'test_query', parameters: { userType: 'Member' } },
        { queryId: 'invalid_query', parameters: {} }
      ];

      (getGraphQuery as jest.Mock)
        .mockReturnValueOnce(mockQueryDefinition)
        .mockReturnValueOnce(null);

      const results = await graphQueryExecutor.executeBatch(queries, {
        userId: 1,
        saveHistory: false
      });

      expect(results).toHaveLength(2);
      expect(results[0].rowCount).toBe(2);
      expect(results[1].error).toBeDefined();
    });
  });
});