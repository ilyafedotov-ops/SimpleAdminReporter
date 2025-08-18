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
  parseCSVResponse,
  handleGraphError,
  GRAPH_ENDPOINTS,
  GraphQueryOptions
} from '../utils/graph-utils';
import { msalTokenManager } from './msal-token-manager.service';
// import { logger } from '../utils/logger';

interface O365Query extends Query {
  reportType?: string;
  endpoint?: string;
  period?: string;
  date?: string;
  graphOptions?: GraphQueryOptions;
  userContext?: {
    userId?: number;
    scopes?: string[];
  };
}

interface O365ReportResult extends QueryResult {
  format?: 'json' | 'csv';
  headers?: string[];
}

interface GraphConnection {
  client: Client;
  authType: 'app-only' | 'delegated';
  userId?: number;
  connectedAt: Date;
}

export class O365MsalService extends BaseDataSourceService {
  private readonly defaultScopes = ['https://graph.microsoft.com/.default'];
  private readonly reportScopes = ['Reports.Read.All'];

  constructor(credentialContext?: CredentialContext) {
    super('O365', credentialContext);
    
    this.cachePrefix = 'o365-msal:';
    this.defaultCacheTTL = 300; // 5 minutes for reports
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
              options.context?.scopes || this.reportScopes
            );
            done(null, token);
          } catch (error) {
            done(error);
          }
        };
      } else {
        // Use app-only auth for reports
        authProvider = async (done: any) => {
          try {
            const token = await msalTokenManager.getAppOnlyToken(this.reportScopes);
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

      this.logger.info(`O365 MSAL connection established (${authType} auth)`);
      return connection;

    } catch (error) {
      this.logger.error('Failed to create O365 MSAL connection:', error);
      throw new ConnectionError(
        'Failed to connect to Office 365 with MSAL',
        error as Error
      );
    }
  }

  /**
   * Test connection to Office 365
   */
  async testConnection(): Promise<boolean> {
    try {
      const testQuery: O365Query = {
        type: 'test',
        endpoint: GRAPH_ENDPOINTS.O365.USER_ACTIVITY,
        period: 'D7'
      };
      
      await this.executeQuery(testQuery);
      return true;
    } catch (error) {
      this.logger.error('O365 MSAL connection test failed:', error);
      return false;
    }
  }

  /**
   * Execute O365 report query
   */
  async executeQuery(query: O365Query, context?: CredentialContext): Promise<O365ReportResult> {
    try {
      // Get or create connection with user context if provided
      const credContext = query.userContext?.userId ? {
        userId: query.userContext.userId
      } : context;
      
      const _connection = await this.getConnection(credContext) as GraphConnection;
      
      // Build endpoint
      const endpoint = query.endpoint || this.getReportEndpoint(query);
      let request = _connection.client.api(endpoint);
      
      // Apply Graph query options
      if (query.graphOptions) {
        request = buildGraphRequest(request, query.graphOptions);
      }
      
      // Execute query with error handling
      try {
        const response = await request.get();
        
        // Parse response based on content type
        let result: O365ReportResult;
        if (typeof response === 'string') {
          // CSV response
          const parsed = parseCSVResponse(response);
          result = {
            data: parsed.data,
            headers: parsed.headers,
            format: 'csv',
            count: parsed.data.length,
            executionTime: Date.now(),
            cached: false
          };
        } else {
          // JSON response
          const parsed = parseGraphResponse(response);
          result = {
            data: parsed.data,
            format: 'json',
            count: parsed.data.length,
            executionTime: Date.now(),
            cached: false
          };
        }
        
        return result;
      } catch (graphError) {
        handleGraphError(graphError);
        throw graphError;
      }
      
    } catch (error) {
      this.logger.error('O365 MSAL query execution failed:', error);
      throw new DataSourceError(
        'Failed to execute Office 365 query with MSAL',
        'O365_MSAL',
        error as Error
      );
    }
  }

  /**
   * Get mailbox usage report
   */
  async getMailboxUsageReport(period: string = 'D7'): Promise<O365ReportResult> {
    return this.executeQuery({
      type: 'mailbox-usage',
      endpoint: `/reports/getMailboxUsageDetail(period='${period}')`,
      reportType: 'mailbox-usage'
    });
  }

  /**
   * Get OneDrive usage report
   */
  async getOneDriveUsageReport(period: string = 'D7'): Promise<O365ReportResult> {
    return this.executeQuery({
      type: 'onedrive-usage',
      endpoint: `/reports/getOneDriveUsageAccountDetail(period='${period}')`,
      reportType: 'onedrive-usage'
    });
  }

  /**
   * Get Teams activity report
   */
  async getTeamsActivityReport(period: string = 'D7'): Promise<O365ReportResult> {
    return this.executeQuery({
      type: 'teams-activity',
      endpoint: `/reports/getTeamsUserActivityUserDetail(period='${period}')`,
      reportType: 'teams-activity'
    });
  }

  /**
   * Get SharePoint activity report
   */
  async getSharePointActivityReport(period: string = 'D7'): Promise<O365ReportResult> {
    return this.executeQuery({
      type: 'sharepoint-activity',
      endpoint: `/reports/getSharePointActivityUserDetail(period='${period}')`,
      reportType: 'sharepoint-activity'
    });
  }

  /**
   * Get email activity report
   */
  async getEmailActivityReport(period: string = 'D7'): Promise<O365ReportResult> {
    return this.executeQuery({
      type: 'email-activity',
      endpoint: `/reports/getEmailActivityUserDetail(period='${period}')`,
      reportType: 'email-activity'
    });
  }

  /**
   * Get report endpoint based on query type
   */
  private getReportEndpoint(query: O365Query): string {
    const period = query.period || 'D7';
    
    switch (query.type) {
      case 'mailbox-usage':
        return `/reports/getMailboxUsageDetail(period='${period}')`;
      case 'onedrive-usage':
        return `/reports/getOneDriveUsageAccountDetail(period='${period}')`;
      case 'teams-activity':
        return `/reports/getTeamsUserActivityUserDetail(period='${period}')`;
      case 'sharepoint-activity':
        return `/reports/getSharePointActivityUserDetail(period='${period}')`;
      case 'email-activity':
        return `/reports/getEmailActivityUserDetail(period='${period}')`;
      case 'office-activations':
        return `/reports/getOffice365ActivationsUserDetail`;
      case 'active-users':
        return `/reports/getOffice365ActiveUserDetail(period='${period}')`;
      default:
        return `/reports/getOffice365ActiveUserDetail(period='${period}')`;
    }
  }

  /**
   * Clear user token cache
   */
  async clearUserTokens(userId: number): Promise<void> {
    await msalTokenManager.clearUserTokenCache(userId);
    this.logger.info(`Cleared O365 MSAL token cache for user ${userId}`);
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
      await _connection.client.api('/reports/getOffice365ActiveUserCounts(period=\'D7\')').get();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Execute Graph API query (alias for executeQuery for compatibility)
   */
  async executeGraphQuery(query: O365Query, context?: CredentialContext): Promise<O365ReportResult> {
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
export const o365MsalService = new O365MsalService();