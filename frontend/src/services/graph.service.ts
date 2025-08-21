import { Client } from '@microsoft/microsoft-graph-client';
import { msalAuthService } from './auth/msal-auth.service';
import { graphScopes } from '@/config/msal.config';
import { message } from 'antd';

interface GraphRequestOptions {
  endpoint: string;
  scopes?: string[];
  select?: string[];
  filter?: string;
  orderBy?: string;
  top?: number;
  skip?: number;
  count?: boolean;
  expand?: string;
  headers?: Record<string, string>;
}

interface GraphPagedResponse<T> {
  value: T[];
  '@odata.count'?: number;
  '@odata.nextLink'?: string;
}

class GraphService {
  private client: Client | null = null;

  /**
   * Initialize Graph client with MSAL auth provider
   */
  private async getClient(): Promise<Client> {
    if (!this.client) {
      this.client = Client.init({
        authProvider: async (done) => {
          try {
            // Get token using MSAL
            const token = await msalAuthService.acquireTokenSilent(
              ['https://graph.microsoft.com/.default']
            );
            done(null, token);
          } catch (error) {
            done(error as Error, null);
          }
        },
        defaultVersion: 'v1.0',
      });
    }
    return this.client;
  }

  /**
   * Make a Graph API request
   */
  async request<T = unknown>(options: GraphRequestOptions): Promise<T> {
    try {
      const client = await this.getClient();
      let request = client.api(options.endpoint);

      // Apply query parameters
      if (options.select && options.select.length > 0) {
        request = request.select(options.select);
      }

      if (options.filter) {
        request = request.filter(options.filter);
      }

      if (options.orderBy) {
        request = request.orderby(options.orderBy);
      }

      if (options.top) {
        request = request.top(options.top);
      }

      if (options.skip) {
        request = request.skip(options.skip);
      }

      if (options.count) {
        request = request.count(true);
        request = request.header('ConsistencyLevel', 'eventual');
      }

      if (options.expand) {
        request = request.expand(options.expand);
      }

      if (options.headers) {
        Object.entries(options.headers).forEach(([key, value]) => {
          request = request.header(key, value);
        });
      }

      const response: T = await request.get();
      return response;
    } catch (error: unknown) {
      this.handleGraphError(error);
      throw error;
    }
  }

  /**
   * Get all pages of a paged response
   */
  async getAllPages<T>(
    options: GraphRequestOptions,
    maxPages: number = 10
  ): Promise<T[]> {
    const allData: T[] = [];
    let nextLink: string | undefined = options.endpoint;
    let pageCount = 0;

    while (nextLink && pageCount < maxPages) {
      const response = await this.request<GraphPagedResponse<T>>({
        ...options,
        endpoint: nextLink,
      });

      allData.push(...response.value);
      nextLink = response['@odata.nextLink'];
      pageCount++;
    }

    return allData;
  }

  /**
   * Get current user profile
   */
  async getCurrentUser() {
    return this.request({
      endpoint: '/me',
      scopes: graphScopes.user.read,
      select: ['id', 'displayName', 'mail', 'userPrincipalName', 'jobTitle', 'department'],
    });
  }

  /**
   * Get users
   */
  async getUsers(options?: {
    filter?: string;
    select?: string[];
    top?: number;
    orderBy?: string;
  }) {
    return this.request<GraphPagedResponse<Record<string, unknown>>>({
      endpoint: '/users',
      scopes: graphScopes.user.readAll,
      ...options,
    });
  }

  /**
   * Get groups
   */
  async getGroups(options?: {
    filter?: string;
    select?: string[];
    top?: number;
    orderBy?: string;
  }) {
    return this.request<GraphPagedResponse<Record<string, unknown>>>({
      endpoint: '/groups',
      scopes: graphScopes.group.read,
      ...options,
    });
  }

  /**
   * Get directory roles
   */
  async getDirectoryRoles() {
    return this.request<GraphPagedResponse<Record<string, unknown>>>({
      endpoint: '/directoryRoles',
      scopes: graphScopes.directory.read,
      expand: 'members',
    });
  }

  /**
   * Get audit logs
   */
  async getAuditLogs(options?: {
    filter?: string;
    top?: number;
    orderBy?: string;
  }) {
    return this.request<GraphPagedResponse<Record<string, unknown>>>({
      endpoint: '/auditLogs/directoryAudits',
      scopes: graphScopes.auditLog.read,
      ...options,
    });
  }

  /**
   * Get sign-in logs
   */
  async getSignInLogs(options?: {
    filter?: string;
    top?: number;
    orderBy?: string;
  }) {
    return this.request<GraphPagedResponse<Record<string, unknown>>>({
      endpoint: '/auditLogs/signIns',
      scopes: graphScopes.auditLog.read,
      ...options,
    });
  }

  /**
   * Execute a custom Graph query
   */
  async executeCustomQuery(
    endpoint: string,
    options?: Omit<GraphRequestOptions, 'endpoint'>
  ) {
    return this.request({
      endpoint,
      ...options,
    });
  }

  /**
   * Batch multiple Graph requests
   */
  async batch(requests: Array<{
    id: string;
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: unknown;
  }>) {
    const client = await this.getClient();
    
    const batchRequestBody = {
      requests: requests.map(req => ({
        id: req.id,
        method: req.method,
        url: req.url.startsWith('/') ? req.url : `/${req.url}`,
        headers: req.headers,
        body: req.body,
      })),
    };

    const response = await client.api('/$batch').post(batchRequestBody);
    return response;
  }

  /**
   * Handle Graph API errors
   */
  private handleGraphError(error: unknown) {
    console.error('Graph API error:', error);

    if (error && typeof error === 'object' && 'statusCode' in error) {
      const errorObj = error as { statusCode: number; message?: string };
      
      if (errorObj.statusCode === 401) {
        message.error('Authentication failed. Please sign in again.');
      } else if (errorObj.statusCode === 403) {
        message.error('You do not have permission to access this resource.');
      } else if (errorObj.statusCode === 429) {
        message.error('Too many requests. Please try again later.');
      } else if (errorObj.message) {
        message.error(`Graph API error: ${errorObj.message}`);
      } else {
        message.error('An unexpected error occurred while calling Microsoft Graph.');
      }
    } else if (error && typeof error === 'object' && 'message' in error && error.message) {
      message.error(`Graph API error: ${error.message}`);
    } else {
      message.error('An unexpected error occurred while calling Microsoft Graph.');
    }
  }

  /**
   * Clear the client instance (useful for logout)
   */
  clearClient() {
    this.client = null;
  }
}

// Export singleton instance
export const graphService = new GraphService();