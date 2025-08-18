import { Client } from '@microsoft/microsoft-graph-client';
import { 
  BaseDataSourceService, 
  CredentialContext, 
  Query, 
  QueryResult,
  ConnectionOptions,
  ConnectionError,
  DataSourceError
} from './base';
import {
  buildGraphRequest,
  parseGraphResponse,
  handleGraphError,
  GRAPH_ENDPOINTS,
  GraphQueryOptions
} from '../utils/graph-utils';
import { msalTokenManager } from './msal-token-manager.service';
// import { logger } from '../utils/logger';
// import { redis } from '../config/redis';

interface AzureQuery extends Query {
  endpoint?: string;
  graphOptions?: GraphQueryOptions;
  expand?: string;
  userContext?: {
    userId?: number;
    scopes?: string[];
  };
  organizationContext?: {
    tenantId?: string;
  };
}

interface AzureReportResult extends QueryResult {
  nextLink?: string;
  totalCount?: number;
}

interface GraphConnection {
  client: Client;
  authType: 'app-only' | 'delegated';
  userId?: number;
  connectedAt: Date;
}

export class AzureMsalService extends BaseDataSourceService {
  private readonly defaultScopes = ['https://graph.microsoft.com/.default'];

  constructor(credentialContext?: CredentialContext) {
    super('Azure', credentialContext);
    
    this.cachePrefix = 'azure-msal:';
    this.defaultCacheTTL = 300; // 5 minutes
  }

  /**
   * Create connection with MSAL authentication
   */
  protected async createConnection(options?: ConnectionOptions): Promise<GraphConnection> {
    try {
      let authProvider: any;
      let authType: 'app-only' | 'delegated' = 'app-only';
      let userId: number | undefined;

      // Check if we should use delegated auth
      if (options?.context?.userId) {
        userId = options.context.userId;
        authType = 'delegated';
        
        authProvider = async (done: any) => {
          try {
            const token = await msalTokenManager.getDelegatedToken(
              userId!,
              options.context?.scopes || this.defaultScopes
            );
            done(null, token);
          } catch (error) {
            done(error);
          }
        };
      } else {
        // Use app-only auth
        authProvider = async (done: any) => {
          try {
            const token = await msalTokenManager.getAppOnlyToken(
              options?.scopes || this.defaultScopes
            );
            done(null, token);
          } catch (error) {
            done(error);
          }
        };
      }

      // Create Graph client
      const client = Client.init({
        authProvider,
        defaultVersion: 'v1.0',
        debugLogging: process.env.NODE_ENV === 'development',
      });

      const connection: GraphConnection = {
        client,
        authType,
        userId,
        connectedAt: new Date(),
      };

      this.logger.info(`Azure MSAL connection established (${authType} auth)`);
      return connection;

    } catch (error) {
      this.logger.error('Failed to create Azure MSAL connection:', error);
      throw new ConnectionError(
        'Failed to connect to Azure AD with MSAL',
        error as Error
      );
    }
  }

  /**
   * Test connection to Azure AD
   */
  async testConnection(): Promise<boolean> {
    try {
      // connection tested
      const testQuery: AzureQuery = {
        type: 'test',
        endpoint: '/organization',
        graphOptions: { top: 1 }
      };
      
      const result = await this.executeQuery(testQuery);
      return ((result as any)?.data).length > 0;
    } catch (error) {
      this.logger.error('Azure MSAL connection test failed:', error);
      return false;
    }
  }

  /**
   * Execute Azure AD query
   */
  async executeQuery(query: AzureQuery, context?: CredentialContext): Promise<AzureReportResult> {
    try {
      // Get or create connection with user context if provided
      const credContext = query.userContext?.userId ? {
        userId: query.userContext.userId
      } : context;
      
      const _connection = await this.getConnection(credContext) as GraphConnection;
      
      // Build request
      const endpoint = query.endpoint || this.getEndpointForQuery(query);
      
      // Log endpoint to debug duplicate v1.0 issue
      this.logger.debug('AzureMsalService endpoint:', { 
        queryEndpoint: query.endpoint,
        resolvedEndpoint: endpoint,
        queryType: query.type
      });
      
      let request = _connection.client.api(endpoint);
      
      // Apply Graph query options
      if (query.graphOptions) {
        request = buildGraphRequest(request, query.graphOptions);
      }
      
      // Apply tenant context if specified
      if (query.organizationContext?.tenantId) {
        request = request.header('ConsistencyLevel', 'eventual');
      }
      
      // Execute query with error handling
      try {
        const response = await request.get();
        const result = parseGraphResponse(response);
        
        return {
          data: ((result as any)?.data),
          count: ((result as any)?.data).length,
          totalCount: result.totalCount,
          nextLink: result.nextLink,
          executionTime: Date.now(),
          cached: false
        };
      } catch (graphError) {
        handleGraphError(graphError);
        throw graphError;
      }
      
    } catch (error) {
      this.logger.error('Azure MSAL query execution failed:', error);
      throw new DataSourceError(
        'Failed to execute Azure AD query with MSAL',
        'AZURE_MSAL',
        error as Error
      );
    }
  }

  /**
   * Execute query for a specific user (delegated permissions)
   */
  async executeQueryAsUser(
    query: AzureQuery, 
    userId: number,
    scopes?: string[]
  ): Promise<AzureReportResult> {
    return this.executeQuery({
      ...query,
      userContext: {
        userId,
        scopes: scopes || query.userContext?.scopes
      }
    });
  }

  /**
   * Execute query with app-only permissions
   */
  async executeQueryAsApp(query: AzureQuery): Promise<AzureReportResult> {
    return this.executeQuery({
      ...query,
      userContext: undefined // Force app-only auth
    });
  }

  /**
   * Get all pages of results
   */
  async getAllPages(
    query: AzureQuery, 
    maxPages: number = 10
  ): Promise<AzureReportResult> {
    const allData: any[] = [];
    let nextLink: string | undefined;
    let pageCount = 0;
    
    // Initial query
    const result = await this.executeQuery(query);
    allData.push(...((result as any)?.data));
    nextLink = result.nextLink;
    
    // Fetch additional pages
    while (nextLink && pageCount < maxPages) {
      const _connection = await this.getConnection() as GraphConnection;
      const response = await _connection.client.api(nextLink).get();
      const pageResult = parseGraphResponse(response);
      
      allData.push(...pageResult.data);
      nextLink = pageResult.nextLink;
      pageCount++;
    }
    
    return {
      data: allData,
      count: allData.length,
      totalCount: allData.length,
      executionTime: Date.now(),
      cached: false
    };
  }

  /**
   * Get user by username/email
   */
  async getUser(username: string): Promise<any> {
    try {
      const _connection = await this.getConnection();
      const response = await _connection.client
        .api('/users')
        .filter(`userPrincipalName eq '${username}' or mail eq '${username}'`)
        .select(['id', 'displayName', 'userPrincipalName', 'mail', 'accountEnabled'])
        .get();
      
      return response.value?.[0] || null;
    } catch (error) {
      this.logger.error('Failed to get user:', error);
      return null;
    }
  }

  /**
   * Clear user token cache
   */
  async clearUserTokens(userId: number): Promise<void> {
    await msalTokenManager.clearUserTokenCache(userId);
    this.logger.info(`Cleared MSAL token cache for user ${userId}`);
  }

  /**
   * Get token cache statistics
   */
  async getTokenCacheStats(): Promise<any> {
    return await msalTokenManager.getTokenCacheStats();
  }

  /**
   * Get endpoint for query type
   */
  private getEndpointForQuery(query: AzureQuery): string {
    switch (query.type) {
      case 'users':
        return GRAPH_ENDPOINTS.USERS;
      case 'groups':
        return GRAPH_ENDPOINTS.GROUPS;
      case 'applications':
        return GRAPH_ENDPOINTS.APPLICATIONS;
      case 'devices':
        return GRAPH_ENDPOINTS.DEVICES;
      case 'organization':
        return GRAPH_ENDPOINTS.ORGANIZATION;
      default:
        return GRAPH_ENDPOINTS.USERS;
    }
  }

  /**
   * Batch execute multiple queries
   */
  async batchExecute(queries: AzureQuery[]): Promise<AzureReportResult[]> {
    const results: AzureReportResult[] = [];
    
    // Group queries by auth type
    const appQueries = queries.filter(q => !q.userContext?.userId);
    const userQueries = queries.filter(q => q.userContext?.userId);
    
    // Execute app queries in parallel
    if (appQueries.length > 0) {
      const appResults = await Promise.all(
        appQueries.map(q => this.executeQuery(q))
      );
      results.push(...appResults);
    }
    
    // Execute user queries (grouped by user)
    const userGroups = new Map<number, AzureQuery[]>();
    userQueries.forEach(q => {
      const userId = q.userContext!.userId!;
      if (!userGroups.has(userId)) {
        userGroups.set(userId, []);
      }
      userGroups.get(userId)!.push(q);
    });
    
    for (const [, queries] of userGroups) {
      const userResults = await Promise.all(
        queries.map(q => this.executeQuery(q))
      );
      results.push(...userResults);
    }
    
    return results;
  }

  /**
   * Get connection options based on credential context
   */
  protected async getConnectionOptions(context?: CredentialContext): Promise<ConnectionOptions> {
    return {
      context,
      config: {},
      timeout: 30000
    };
  }

  /**
   * Close a connection
   */
  protected async closeConnection(_connection: any): Promise<void> {
    // Graph client doesn't need explicit closing
    return;
  }

  /**
   * Check if connection is valid
   */
  protected async isConnectionValid(_connection: any): Promise<boolean> {
    if (!_connection || !_connection.client) return false;
    
    try {
      // Try a simple query to verify connection
      await _connection.client.api('/organization').select('id').get();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Execute Graph API query (alias for executeQuery for compatibility)
   */
  async executeGraphQuery(query: AzureQuery, context?: CredentialContext): Promise<AzureReportResult> {
    // Log the incoming query to debug v1.0 duplication
    this.logger.debug('executeGraphQuery called with:', {
      endpoint: query.endpoint,
      type: query.type,
      hasGraphOptions: !!query.graphOptions
    });
    
    // Check if endpoint already contains v1.0 and fix it
    if (query.endpoint && query.endpoint.includes('v1.0/')) {
      this.logger.warn('Endpoint contains v1.0, removing to prevent duplication:', query.endpoint);
      query.endpoint = query.endpoint.replace(/^\/?(v1\.0\/)?/, '/');
    }
    
    return this.executeQuery(query, context);
  }
}

// Export singleton instance
export const azureMsalService = new AzureMsalService();