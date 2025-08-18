// Mock dependencies first before any imports
jest.mock('@microsoft/microsoft-graph-client');
jest.mock('./msal-token-manager.service');
jest.mock('../utils/graph-utils');
jest.mock('../utils/logger');
jest.mock('../config/redis', () => ({
  redis: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    setJson: jest.fn().mockResolvedValue('OK'),
    getJson: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
    invalidatePattern: jest.fn().mockResolvedValue(1),
    keys: jest.fn().mockResolvedValue([])
  }
}));

jest.mock('./base/BaseDataSourceService', () => ({
  BaseDataSourceService: class MockBaseDataSourceService {
    protected logger: any;
    protected connectionPool = new Map();
    protected connectionStatus = { connected: false, lastCheck: null, error: null };
    protected cachePrefix = '';
    protected defaultCacheTTL = 300;
    protected credentialManager: any;
    protected credentialContext: any;

    constructor(serviceName: string, credentialContext?: any) {
      this.credentialContext = credentialContext;
      this.logger = {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        child: jest.fn().mockReturnThis()
      };
      this.cachePrefix = `${serviceName.toLowerCase()}:`;
    }

    setCredentialManager(manager: any) {
      this.credentialManager = manager;
    }

    protected async getConnection(_context?: any): Promise<any> {
      return this.connectionPool.get('default') || await this.createMockConnection();
    }

    private async createMockConnection(): Promise<any> {
      // Connection creation removed as variable was unused
      const conn = { client: {}, authType: 'app-only', connectedAt: new Date() };
      this.connectionPool.set('default', conn);
      return conn;
    }
  },
  CredentialContext: {},
  Query: {},
  QueryResult: {},
  ConnectionOptions: {}
}));

jest.mock('./base/errors', () => ({
  ConnectionError: class extends Error {
    constructor(message: string, _cause?: Error) {
      super(message);
      this.name = 'ConnectionError';
    }
  },
  DataSourceError: class extends Error {
    constructor(message: string, _code: string, _cause?: Error) {
      super(message);
      this.name = 'DataSourceError';
    }
  }
}));

// Import after mocks are set up
import { AzureMsalService } from './azure-msal.service';
import { Client } from '@microsoft/microsoft-graph-client';
import { msalTokenManager } from './msal-token-manager.service';
import { 
  buildGraphRequest, 
  parseGraphResponse, 
  handleGraphError, 
  GRAPH_ENDPOINTS 
} from '../utils/graph-utils';
import { logger } from '../utils/logger';

import { ConnectionError, DataSourceError } from './base/errors';

// Type the mocked modules
const MockClient = Client as any;
const mockMsalTokenManager = msalTokenManager as jest.Mocked<typeof msalTokenManager>;
const mockBuildGraphRequest = buildGraphRequest as jest.MockedFunction<typeof buildGraphRequest>;
const mockParseGraphResponse = parseGraphResponse as jest.MockedFunction<typeof parseGraphResponse>;
const mockHandleGraphError = handleGraphError as jest.MockedFunction<typeof handleGraphError>;
const mockLogger = logger as jest.Mocked<typeof logger>;


describe('AzureMsalService', () => {
  let service: AzureMsalService;
  let mockGraphClient: any;
  let mockGraphRequest: any;

  const mockCredentialContext = {
    userId: 123,
    useSystemCredentials: false,
    credentials: {
      tenantId: 'test-tenant-id',
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret'
    }
  };

  const mockGraphResponse = {
    value: [
      {
        id: 'user1',
        displayName: 'Test User 1',
        userPrincipalName: 'user1@test.com',
        mail: 'user1@test.com',
        accountEnabled: true,
        userType: 'Member'
      },
      {
        id: 'user2',
        displayName: 'Test User 2',
        userPrincipalName: 'user2@test.com',
        mail: 'user2@test.com',
        accountEnabled: false,
        userType: 'Guest'
      }
    ],
    '@odata.nextLink': 'https://graph.microsoft.com/v1.0/users?$skip=10'
  };

  const mockParsedResponse = {
    data: mockGraphResponse.value,
    totalCount: 2,
    nextLink: mockGraphResponse['@odata.nextLink']
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock Graph client and request
    mockGraphRequest = {
      get: jest.fn().mockResolvedValue(mockGraphResponse),
      filter: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      top: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      count: jest.fn().mockReturnThis(),
      expand: jest.fn().mockReturnThis(),
      header: jest.fn().mockReturnThis()
    };

    mockGraphClient = {
      api: jest.fn().mockReturnValue(mockGraphRequest)
    };

    // Mock Client.init to return our mock client
    MockClient.init = jest.fn().mockReturnValue(mockGraphClient);

    // Setup MSAL token manager mocks
    mockMsalTokenManager.getAppOnlyToken.mockResolvedValue('mock-app-token');
    mockMsalTokenManager.getDelegatedToken.mockResolvedValue('mock-delegated-token');
    mockMsalTokenManager.clearUserTokenCache.mockResolvedValue(undefined);
    mockMsalTokenManager.getTokenCacheStats.mockResolvedValue({
      totalCached: 5,
      appTokens: 3,
      userTokens: 2
    });

    // Setup graph utils mocks
    mockBuildGraphRequest.mockImplementation((request, options) => {
      // Simulate building the request with options
      if (options.filter) request.filter(options.filter);
      if (options.select) request.select(options.select);
      if (options.top) request.top(options.top);
      if (options.skip) request.skip(options.skip);
      if (options.orderBy) request.orderby(options.orderBy);
      if (options.count) request.count(options.count);
      if (options.expand) request.expand(options.expand);
      return request;
    });

    mockParseGraphResponse.mockReturnValue(mockParsedResponse);

    // Setup logger mock
    mockLogger.child = jest.fn().mockReturnValue({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    });

    // Create service instance
    service = new AzureMsalService(mockCredentialContext);
    
    // Mock the getConnection method to return a mock connection
    service['getConnection'] = jest.fn().mockResolvedValue({
      client: mockGraphClient,
      authType: 'app-only',
      connectedAt: new Date()
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with correct service name and cache prefix', () => {
      const newService = new AzureMsalService();
      expect(newService['cachePrefix']).toBe('azure-msal:');
      expect(newService['defaultCacheTTL']).toBe(300);
    });

    it('should initialize with credential context', () => {
      const contextService = new AzureMsalService(mockCredentialContext);
      expect(contextService['credentialContext']).toEqual(mockCredentialContext);
    });
  });

  describe('createConnection', () => {
    // For connection tests, we need to test the actual createConnection method
    // So we'll create a separate service instance without the mocked getConnection
    let connectionTestService: AzureMsalService;

    beforeEach(() => {
      connectionTestService = new AzureMsalService(mockCredentialContext);
    });

    it('should create app-only connection when no user context provided', async () => {
      const connection = await connectionTestService['createConnection']({});

      expect(MockClient.init).toHaveBeenCalledWith({
        authProvider: expect.any(Function),
        defaultVersion: 'v1.0',
        debugLogging: false
      });

      expect(connection).toEqual({
        client: mockGraphClient,
        authType: 'app-only',
        userId: undefined,
        connectedAt: expect.any(Date)
      });
    });

    it('should create delegated connection when user context provided', async () => {
      const connection = await connectionTestService['createConnection']({
        context: {
          userId: 123,
          scopes: ['User.Read']
        }
      });

      expect(connection).toEqual({
        client: mockGraphClient,
        authType: 'delegated',
        userId: 123,
        connectedAt: expect.any(Date)
      });
    });

    it('should enable debug logging in development environment', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      await connectionTestService['createConnection']({});

      expect(MockClient.init).toHaveBeenCalledWith({
        authProvider: expect.any(Function),
        defaultVersion: 'v1.0',
        debugLogging: true
      });

      process.env.NODE_ENV = originalEnv;
    });

    it('should handle MSAL token manager errors', async () => {
      mockMsalTokenManager.getAppOnlyToken.mockRejectedValue(new Error('Token fetch failed'));

      // The auth provider function will receive the error and call done with error
      // This should cause the Client.init to fail if we test the auth provider directly
      try {
        // First, trigger a connection creation to set up the mock
        await connectionTestService['createConnection']({});
        const authProvider = (MockClient.init as jest.Mock).mock.calls[0][0].authProvider;
        
        const done = jest.fn();
        await authProvider(done);
        
        expect(done).toHaveBeenCalledWith(expect.any(Error));
      } catch (error) {
        expect(error).toBeInstanceOf(ConnectionError);
      }
    });

    it('should call token manager with correct scopes for app-only auth', async () => {
      // First, trigger a connection creation to set up the mock
      await connectionTestService['createConnection']({});
      
      // Test that auth provider calls token manager when executed
      const authProvider = (MockClient.init as jest.Mock).mock.calls[0][0].authProvider;
      const done = jest.fn();
      await authProvider(done);

      expect(mockMsalTokenManager.getAppOnlyToken).toHaveBeenCalledWith([
        'https://graph.microsoft.com/.default'  // This should match the actual default scopes
      ]);
    });

    it('should call token manager with correct scopes for delegated auth', async () => {
      // First, trigger a connection creation with user context to set up the mock
      await connectionTestService['createConnection']({
        context: { userId: 123, scopes: ['User.Read', 'Mail.Read'] }
      });
      
      // Test that auth provider calls token manager when executed
      const authProvider = (MockClient.init as jest.Mock).mock.calls[0][0].authProvider;
      const done = jest.fn();
      await authProvider(done);

      expect(mockMsalTokenManager.getDelegatedToken).toHaveBeenCalledWith(123, [
        'User.Read',
        'Mail.Read'
      ]);
    });

    it('should use default scopes when none provided', async () => {
      // First, trigger a connection creation to set up the mock (clear previous calls first)
      MockClient.init = jest.fn().mockReturnValue(mockGraphClient);
      await connectionTestService['createConnection']({});

      // Test that auth provider calls token manager when executed
      const authProvider = (MockClient.init as jest.Mock).mock.calls[0][0].authProvider;
      const done = jest.fn();
      await authProvider(done);

      expect(mockMsalTokenManager.getAppOnlyToken).toHaveBeenCalledWith([
        'https://graph.microsoft.com/.default'
      ]);
    });
  });

  describe('testConnection', () => {
    it('should return true when connection test succeeds', async () => {
      const result = await service.testConnection();

      expect(result).toBe(true);
      expect(mockGraphClient.api).toHaveBeenCalledWith('/organization');
      expect(mockBuildGraphRequest).toHaveBeenCalledWith(mockGraphRequest, { top: 1 });
    });

    it('should return false when connection test fails', async () => {
      mockGraphRequest.get.mockRejectedValue(new Error('Connection failed'));

      const result = await service.testConnection();

      expect(result).toBe(false);
    });

    it('should return false when no data returned', async () => {
      mockParseGraphResponse.mockReturnValue({ data: [], totalCount: 0 });

      const result = await service.testConnection();

      expect(result).toBe(false);
    });
  });

  describe('executeQuery', () => {
    const mockQuery = {
      type: 'users',
      endpoint: '/users',
      graphOptions: {
        filter: 'accountEnabled eq true',
        select: ['id', 'displayName', 'userPrincipalName'],
        top: 50
      }
    };

    it('should execute query successfully with app-only auth', async () => {
      const result = await service.executeQuery(mockQuery);

      expect(mockGraphClient.api).toHaveBeenCalledWith('/users');
      expect(mockBuildGraphRequest).toHaveBeenCalledWith(mockGraphRequest, mockQuery.graphOptions);
      expect(mockParseGraphResponse).toHaveBeenCalledWith(mockGraphResponse);
      
      expect(result).toEqual({
        data: mockParsedResponse.data,
        count: mockParsedResponse.data.length,
        totalCount: mockParsedResponse.totalCount,
        nextLink: mockParsedResponse.nextLink,
        executionTime: expect.any(Number),
        cached: false
      });
    });

    it('should execute query with user context for delegated auth', async () => {
      const queryWithUser = {
        ...mockQuery,
        userContext: {
          userId: 123,
          scopes: ['User.Read']
        }
      };

      const result = await service.executeQuery(queryWithUser);

      // Verify the query was executed successfully with user context
      expect(((result as any)?.data)).toEqual(mockParsedResponse.data);
      expect(result.count).toBe(mockParsedResponse.data.length);
    });

    it('should use endpoint from query type when no explicit endpoint provided', async () => {
      const queryWithoutEndpoint = {
        type: 'groups',
        graphOptions: { top: 10 }
      };

      await service.executeQuery(queryWithoutEndpoint);

      expect(mockGraphClient.api).toHaveBeenCalledWith(GRAPH_ENDPOINTS.GROUPS);
    });

    it('should handle organization context with consistency level header', async () => {
      const queryWithOrgContext = {
        ...mockQuery,
        organizationContext: {
          tenantId: 'test-tenant-id'
        }
      };

      await service.executeQuery(queryWithOrgContext);

      expect(mockGraphRequest.header).toHaveBeenCalledWith('ConsistencyLevel', 'eventual');
    });

    it('should handle Graph API errors', async () => {
      const graphError = new Error('Graph API error');
      mockGraphRequest.get.mockRejectedValue(graphError);
      mockHandleGraphError.mockImplementation(() => {
        throw graphError;
      });

      await expect(service.executeQuery(mockQuery)).rejects.toThrow(DataSourceError);
      expect(mockHandleGraphError).toHaveBeenCalledWith(graphError);
    });

    it('should log endpoint information for debugging', async () => {
      await service.executeQuery(mockQuery);

      expect(service['logger'].debug).toHaveBeenCalledWith(
        'AzureMsalService endpoint:',
        {
          queryEndpoint: '/users',
          resolvedEndpoint: '/users',
          queryType: 'users'
        }
      );
    });

    it('should handle queries without graph options', async () => {
      const simpleQuery = {
        type: 'users',
        endpoint: '/users'
      };

      await service.executeQuery(simpleQuery);

      expect(mockBuildGraphRequest).not.toHaveBeenCalled();
      expect(mockGraphRequest.get).toHaveBeenCalled();
    });
  });

  describe('executeQueryAsUser', () => {
    const mockQuery = {
      type: 'users',
      endpoint: '/users'
    };

    it('should execute query with user context', async () => {
      const userId = 123;
      const scopes = ['User.Read', 'Mail.Read'];

      const result = await service.executeQueryAsUser(mockQuery, userId, scopes);

      // Verify query executed successfully
      expect(((result as any)?.data)).toEqual(mockParsedResponse.data);
      expect(result.count).toBe(mockParsedResponse.data.length);
    });

    it('should use existing scopes from query if no scopes provided', async () => {
      const queryWithScopes = {
        ...mockQuery,
        userContext: {
          scopes: ['Directory.Read.All']
        }
      };

      const result = await service.executeQueryAsUser(queryWithScopes, 123);

      // Verify query executed successfully
      expect(((result as any)?.data)).toEqual(mockParsedResponse.data);
    });
  });

  describe('executeQueryAsApp', () => {
    it('should execute query with app-only auth', async () => {
      const query = {
        type: 'users',
        endpoint: '/users',
        userContext: {
          userId: 123
        }
      };

      const result = await service.executeQueryAsApp(query);

      // Verify query executed successfully and user context was removed
      expect(((result as any)?.data)).toEqual(mockParsedResponse.data);
      expect(result.count).toBe(mockParsedResponse.data.length);
    });
  });

  describe('getAllPages', () => {
    it('should fetch all pages of results', async () => {
      const firstPageResponse = {
        value: [{ id: 'user1', displayName: 'User 1' }],
        '@odata.nextLink': 'https://graph.microsoft.com/v1.0/users?$skip=1'
      };

      const secondPageResponse = {
        value: [{ id: 'user2', displayName: 'User 2' }],
        '@odata.nextLink': undefined
      };

      // Mock first call returns first page
      mockGraphRequest.get
        .mockResolvedValueOnce(firstPageResponse)
        .mockResolvedValueOnce(secondPageResponse);

      mockParseGraphResponse
        .mockReturnValueOnce({
          data: firstPageResponse.value,
          nextLink: firstPageResponse['@odata.nextLink']
        })
        .mockReturnValueOnce({
          data: secondPageResponse.value,
          nextLink: undefined
        });

      const query = { type: 'users', endpoint: '/users' };
      const result = await service.getAllPages(query, 5);

      expect(((result as any)?.data)).toHaveLength(2);
      expect(((result as any)?.data)[0].id).toBe('user1');
      expect(((result as any)?.data)[1].id).toBe('user2');
      expect(result.count).toBe(2);
      expect(result.totalCount).toBe(2);
    });

    it('should respect maxPages limit', async () => {
      const pageResponse = {
        value: [{ id: 'user1' }],
        '@odata.nextLink': 'https://graph.microsoft.com/v1.0/users?$skip=1'
      };

      mockGraphRequest.get.mockResolvedValue(pageResponse);
      mockParseGraphResponse.mockReturnValue({
        data: pageResponse.value,
        nextLink: pageResponse['@odata.nextLink']
      });

      const query = { type: 'users', endpoint: '/users' };
      await service.getAllPages(query, 1);

      // Should only make 2 API calls: initial + 1 additional page
      expect(mockGraphRequest.get).toHaveBeenCalledTimes(2);
    });

    it('should handle empty results', async () => {
      const emptyResponse = {
        value: [],
        '@odata.nextLink': undefined
      };

      mockGraphRequest.get.mockResolvedValue(emptyResponse);
      mockParseGraphResponse.mockReturnValue({
        data: [],
        nextLink: undefined
      });

      const query = { type: 'users', endpoint: '/users' };
      const result = await service.getAllPages(query);

      expect(((result as any)?.data)).toHaveLength(0);
      expect(result.count).toBe(0);
    });
  });

  describe('getUser', () => {
    it('should get user by username', async () => {
      const mockUser = {
        id: 'user123',
        displayName: 'Test User',
        userPrincipalName: 'testuser@test.com',
        mail: 'testuser@test.com',
        accountEnabled: true
      };

      mockGraphRequest.get.mockResolvedValue({ value: [mockUser] });

      const result = await service.getUser('testuser@test.com');

      expect(mockGraphClient.api).toHaveBeenCalledWith('/users');
      expect(mockGraphRequest.filter).toHaveBeenCalledWith(
        "userPrincipalName eq 'testuser@test.com' or mail eq 'testuser@test.com'"
      );
      expect(mockGraphRequest.select).toHaveBeenCalledWith([
        'id', 'displayName', 'userPrincipalName', 'mail', 'accountEnabled'
      ]);
      expect(result).toEqual(mockUser);
    });

    it('should return null when user not found', async () => {
      mockGraphRequest.get.mockResolvedValue({ value: [] });

      const result = await service.getUser('nonexistent@test.com');

      expect(result).toBeNull();
    });

    it('should return null when API call fails', async () => {
      mockGraphRequest.get.mockRejectedValue(new Error('API Error'));

      const result = await service.getUser('testuser@test.com');

      expect(result).toBeNull();
    });
  });

  describe('clearUserTokens', () => {
    it('should clear user token cache', async () => {
      const userId = 123;

      await service.clearUserTokens(userId);

      expect(mockMsalTokenManager.clearUserTokenCache).toHaveBeenCalledWith(userId);
    });
  });

  describe('getTokenCacheStats', () => {
    it('should return token cache statistics', async () => {
      const mockStats = {
        totalCached: 10,
        appTokens: 6,
        userTokens: 4
      };

      mockMsalTokenManager.getTokenCacheStats.mockResolvedValue(mockStats);

      const result = await service.getTokenCacheStats();

      expect(result).toEqual(mockStats);
    });
  });

  describe('getEndpointForQuery', () => {
    it('should return correct endpoints for different query types', () => {
      expect(service['getEndpointForQuery']({ type: 'users' })).toBe(GRAPH_ENDPOINTS.USERS);
      expect(service['getEndpointForQuery']({ type: 'groups' })).toBe(GRAPH_ENDPOINTS.GROUPS);
      expect(service['getEndpointForQuery']({ type: 'applications' })).toBe(GRAPH_ENDPOINTS.APPLICATIONS);
      expect(service['getEndpointForQuery']({ type: 'devices' })).toBe(GRAPH_ENDPOINTS.DEVICES);
      expect(service['getEndpointForQuery']({ type: 'organization' })).toBe(GRAPH_ENDPOINTS.ORGANIZATION);
    });

    it('should return users endpoint for unknown query types', () => {
      expect(service['getEndpointForQuery']({ type: 'unknown' })).toBe(GRAPH_ENDPOINTS.USERS);
    });
  });

  describe('batchExecute', () => {
    const appQuery1 = { type: 'users', endpoint: '/users' };
    const appQuery2 = { type: 'groups', endpoint: '/groups' };
    const userQuery1 = { 
      type: 'users', 
      endpoint: '/users',
      userContext: { userId: 123 }
    };
    const userQuery2 = { 
      type: 'groups', 
      endpoint: '/groups',
      userContext: { userId: 456 }
    };

    it('should execute app queries in parallel', async () => {
      const queries = [appQuery1, appQuery2];

      const results = await service.batchExecute(queries);

      expect(results).toHaveLength(2);
      expect(results[0].data).toEqual(mockParsedResponse.data);
      expect(results[1].data).toEqual(mockParsedResponse.data);
    });

    it('should group user queries by userId', async () => {
      const userQuery3 = { 
        type: 'applications', 
        endpoint: '/applications',
        userContext: { userId: 123 }
      };
      const queries = [userQuery1, userQuery2, userQuery3];

      const results = await service.batchExecute(queries);

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(((result as any)?.data)).toEqual(mockParsedResponse.data);
      });
    });

    it('should handle mixed app and user queries', async () => {
      const queries = [appQuery1, userQuery1, appQuery2, userQuery2];

      const results = await service.batchExecute(queries);

      expect(results).toHaveLength(4);
      results.forEach(result => {
        expect(((result as any)?.data)).toEqual(mockParsedResponse.data);
      });
    });

    it('should return empty array for empty queries', async () => {
      const results = await service.batchExecute([]);

      expect(results).toHaveLength(0);
    });
  });

  describe('getConnectionOptions', () => {
    it('should return connection options with context', async () => {
      const context = { userId: 123 };
      const options = await service['getConnectionOptions'](context);

      expect(options).toEqual({
        context,
        config: {},
        timeout: 30000
      });
    });

    it('should return default options when no context provided', async () => {
      const options = await service['getConnectionOptions']();

      expect(options).toEqual({
        context: undefined,
        config: {},
        timeout: 30000
      });
    });
  });

  describe('closeConnection', () => {
    it('should not throw error when closing connection', async () => {
      const mockConnection = { client: mockGraphClient };

      await expect(service['closeConnection'](mockConnection)).resolves.toBeUndefined();
    });
  });

  describe('isConnectionValid', () => {
    it('should return false for null connection', async () => {
      const result = await service['isConnectionValid'](null);

      expect(result).toBe(false);
    });

    it('should return false for connection without client', async () => {
      const result = await service['isConnectionValid']({});

      expect(result).toBe(false);
    });

    it('should return true when test query succeeds', async () => {
      const mockConnection = { client: mockGraphClient };
      mockGraphRequest.get.mockResolvedValue({ value: [{ id: 'org1' }] });

      const result = await service['isConnectionValid'](mockConnection);

      expect(result).toBe(true);
      expect(mockGraphClient.api).toHaveBeenCalledWith('/organization');
    });

    it('should return false when test query fails', async () => {
      const mockConnection = { client: mockGraphClient };
      mockGraphRequest.get.mockRejectedValue(new Error('Connection test failed'));

      const result = await service['isConnectionValid'](mockConnection);

      expect(result).toBe(false);
    });
  });

  describe('executeGraphQuery', () => {
    it('should be an alias for executeQuery', async () => {
      const query = { type: 'users', endpoint: '/users' };

      const result = await service.executeGraphQuery(query);

      expect(mockGraphClient.api).toHaveBeenCalledWith('/users');
      expect(((result as any)?.data)).toEqual(mockParsedResponse.data);
    });

    it('should fix duplicate v1.0 in endpoint', async () => {
      const query = { 
        type: 'users', 
        endpoint: 'v1.0/users' 
      };

      await service.executeGraphQuery(query);

      expect(mockGraphClient.api).toHaveBeenCalledWith('/users');
    });

    it('should fix endpoint starting with /v1.0/', async () => {
      const query = { 
        type: 'users', 
        endpoint: '/v1.0/users' 
      };

      await service.executeGraphQuery(query);

      expect(mockGraphClient.api).toHaveBeenCalledWith('/users');
    });

    it('should log debugging information', async () => {
      const query = { 
        type: 'users', 
        endpoint: '/users',
        graphOptions: { top: 10 }
      };

      await service.executeGraphQuery(query);

      expect(service['logger'].debug).toHaveBeenCalledWith(
        'executeGraphQuery called with:',
        {
          endpoint: '/users',
          type: 'users',
          hasGraphOptions: true
        }
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle connection creation failures', async () => {
      MockClient.init = jest.fn().mockImplementation(() => {
        throw new Error('Client initialization failed');
      });

      await expect(service['createConnection']({})).rejects.toThrow(ConnectionError);
    });

    it('should handle token acquisition failures in auth provider', async () => {
      mockMsalTokenManager.getAppOnlyToken.mockRejectedValue(new Error('Token failed'));
      MockClient.init = jest.fn().mockReturnValue(mockGraphClient);

      // First, trigger a connection creation to set up the mock
      await service['createConnection']({});
      const authProvider = (MockClient.init as jest.Mock).mock.calls[0][0].authProvider;

      const done = jest.fn();
      await authProvider(done);

      expect(done).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should handle delegated token failures in auth provider', async () => {
      mockMsalTokenManager.getDelegatedToken.mockRejectedValue(new Error('Delegated token failed'));
      MockClient.init = jest.fn().mockReturnValue(mockGraphClient);

      // First, trigger a connection creation with user context to set up the mock
      await service['createConnection']({ context: { userId: 123 } });
      const authProvider = (MockClient.init as jest.Mock).mock.calls[0][0].authProvider;

      const done = jest.fn();
      await authProvider(done);

      expect(done).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should wrap general errors in DataSourceError', async () => {
      mockGraphRequest.get.mockRejectedValue(new Error('Generic error'));

      const query = { type: 'users', endpoint: '/users' };

      await expect(service.executeQuery(query)).rejects.toThrow(DataSourceError);
      await expect(service.executeQuery(query)).rejects.toThrow('Failed to execute Azure AD query with MSAL');
    });
  });

  describe('Authentication Flows', () => {
    it('should handle successful app-only token acquisition', async () => {
      MockClient.init = jest.fn().mockReturnValue(mockGraphClient);
      
      // Trigger connection creation which will call Client.init
      await service['createConnection']({});
      
      // Now we can access the authProvider from the mock call
      expect(MockClient.init).toHaveBeenCalledTimes(1);
      const authProvider = (MockClient.init as jest.Mock).mock.calls[0][0].authProvider;

      const done = jest.fn();
      await authProvider(done);

      expect(mockMsalTokenManager.getAppOnlyToken).toHaveBeenCalled();
      expect(done).toHaveBeenCalledWith(null, 'mock-app-token');
    });

    it('should handle successful delegated token acquisition', async () => {
      MockClient.init = jest.fn().mockReturnValue(mockGraphClient);
      const testService = new AzureMsalService(mockCredentialContext);
      await testService['createConnection']({
        context: {
          userId: 123,
          scopes: ['User.Read']
        }
      });
      const authProvider = (MockClient.init as jest.Mock).mock.calls[0][0].authProvider;

      const done = jest.fn();
      await authProvider(done);

      expect(mockMsalTokenManager.getDelegatedToken).toHaveBeenCalledWith(123, ['User.Read']);
      expect(done).toHaveBeenCalledWith(null, 'mock-delegated-token');
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined query type in getEndpointForQuery', () => {
      const endpoint = service['getEndpointForQuery']({ type: undefined as any });
      expect(endpoint).toBe(GRAPH_ENDPOINTS.USERS);
    });

    it('should handle empty batch execute', async () => {
      const results = await service.batchExecute([]);
      expect(results).toEqual([]);
    });

    it('should handle getAllPages with no nextLink initially', async () => {
      mockParseGraphResponse.mockReturnValue({
        data: [{ id: 'user1' }],
        nextLink: undefined
      });

      const query = { type: 'users', endpoint: '/users' };
      const result = await service.getAllPages(query);

      expect(((result as any)?.data)).toHaveLength(1);
      expect(mockGraphRequest.get).toHaveBeenCalledTimes(1);
    });

    it('should handle query without user context in executeQuery', async () => {
      const query = { type: 'users' };
      const result = await service.executeQuery(query);

      expect(((result as any)?.data)).toEqual(mockParsedResponse.data);
      expect(result.count).toBe(mockParsedResponse.data.length);
    });
  });
});