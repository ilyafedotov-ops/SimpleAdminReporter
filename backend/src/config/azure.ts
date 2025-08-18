import { Client } from '@microsoft/microsoft-graph-client';
import { ConfidentialClientApplication, AuthenticationResult } from '@azure/msal-node';
import { logger } from '@/utils/logger';
import { redis } from '@/config/redis';

export interface AzureADConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  authority?: string;
  scope?: string[];
}

export class AzureADClient {
  private config: AzureADConfig;
  private msalInstance: ConfidentialClientApplication;
  private graphClient: Client | null = null;
  private tokenCacheKey = 'azure:access_token';

  constructor(config: AzureADConfig) {
    this.config = {
      authority: `https://login.microsoftonline.com/${config.tenantId}`,
      scope: ['https://graph.microsoft.com/.default'],
      ...config
    };

    // Initialize MSAL
    this.msalInstance = new ConfidentialClientApplication({
      auth: {
        clientId: this.config.clientId,
        clientSecret: this.config.clientSecret,
        authority: this.config.authority
      }
    });
  }

  private async getAccessToken(): Promise<string> {
    try {
      // Check cache first
      const cachedToken = await redis.get(this.tokenCacheKey);
      if (cachedToken) {
        logger.debug('Using cached Azure AD access token');
        return cachedToken;
      }

      // Get new token using client credentials flow
      const clientCredentialRequest = {
        scopes: this.config.scope!,
        skipCache: false
      };

      const response: AuthenticationResult | null = await this.msalInstance.acquireTokenByClientCredential(clientCredentialRequest);
      
      if (!response || !response.accessToken) {
        // Fall back to client credentials flow
        const ccResponse = await this.msalInstance.acquireTokenByClientCredential(clientCredentialRequest);
        if (!ccResponse?.accessToken) {
          throw new Error('Failed to acquire access token');
        }
        
        // Cache the token (expires in 1 hour typically)
        const expiresIn = ccResponse.expiresOn 
          ? Math.floor((ccResponse.expiresOn.getTime() - Date.now()) / 1000)
          : 3600; // Default 1 hour
          
        await redis.set(this.tokenCacheKey, ccResponse.accessToken, expiresIn - 60); // Refresh 1 minute before expiry
        
        logger.info('Acquired new Azure AD access token');
        return ccResponse.accessToken;
      }

      // Cache the token
      const expiresIn = response.expiresOn 
        ? Math.floor((response.expiresOn.getTime() - Date.now()) / 1000)
        : 3600;
        
      await redis.set(this.tokenCacheKey, response.accessToken, expiresIn - 60);
      
      logger.info('Acquired Azure AD access token');
      return response.accessToken;

    } catch (error) {
      logger.error('Failed to acquire Azure AD access token:', error);
      throw new Error(`Azure AD authentication failed: ${(error as Error).message}`);
    }
  }

  async getGraphClient(): Promise<Client> {
    if (!this.graphClient) {
      const accessToken = await this.getAccessToken();
      
      this.graphClient = Client.init({
        authProvider: async (done) => {
          done(null, accessToken);
        },
        defaultVersion: 'v1.0'
      });
    }

    return this.graphClient;
  }

  async testConnection(): Promise<boolean> {
    try {
      // Just test if we can reach the Azure AD endpoints
      const testUrl = `https://login.microsoftonline.com/${this.config.tenantId}/v2.0/.well-known/openid-configuration`;
      
      // Use AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      try {
        const response = await fetch(testUrl, {
          method: 'GET',
          signal: controller.signal
        });
        clearTimeout(timeoutId);
      
        if (response.ok) {
          logger.info('Azure AD service is reachable');
          return true;
        }
        
        logger.debug(`Azure AD service returned status: ${response.status}`);
        return false;
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          throw new Error('Azure AD connection timeout');
        }
        throw fetchError;
      }
    } catch (error: any) {
      // Network errors mean service is not reachable
      if (['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'].includes(error.code)) {
        logger.debug(`Azure AD service not reachable: ${error.code}`);
        throw error;
      }
      logger.error('Azure AD connection test failed:', error);
      throw error;
    }
  }

  async refreshToken(): Promise<void> {
    try {
      await redis.del(this.tokenCacheKey);
      this.graphClient = null;
      await this.getAccessToken();
      logger.info('Azure AD token refreshed');
    } catch (error) {
      logger.error('Failed to refresh Azure AD token:', error);
      throw error;
    }
  }

  async clearTokenCache(): Promise<void> {
    try {
      await redis.del(this.tokenCacheKey);
      this.graphClient = null;
      logger.info('Azure AD token cache cleared');
    } catch (error) {
      logger.error('Failed to clear Azure AD token cache:', error);
    }
  }

  // Helper method for paginated requests
  async getAllPages<T>(request: any): Promise<T[]> {
    const allItems: T[] = [];
    let response = await request.get();
    
    allItems.push(...response.value);
    
    while (response['@odata.nextLink']) {
      response = await request
        .api(response['@odata.nextLink'])
        .get();
      allItems.push(...response.value);
    }
    
    return allItems;
  }

  // Helper method for batch requests
  async batchRequest(requests: any[]): Promise<any[]> {
    try {
      const client = await this.getGraphClient();
      const batchRequestBody = {
        requests: requests.map((req, index) => ({
          id: index.toString(),
          method: req.method || 'GET',
          url: req.url
        }))
      };

      const response = await client
        .api('/$batch')
        .post(batchRequestBody);

      return response.responses;
    } catch (error) {
      logger.error('Azure AD batch request failed:', error);
      throw error;
    }
  }

  // Get tenant information
  async getTenantInfo(): Promise<any> {
    try {
      const client = await this.getGraphClient();
      const organization = await client
        .api('/organization')
        .get();

      return organization.value[0];
    } catch (error) {
      logger.error('Failed to get tenant info:', error);
      throw error;
    }
  }
}

// Create and export Azure AD client instance
let azureClient: AzureADClient | null = null;

export const createAzureADClient = (): AzureADClient => {
  if (!process.env.AZURE_TENANT_ID || !process.env.AZURE_CLIENT_ID || !process.env.AZURE_CLIENT_SECRET) {
    throw new Error('Azure AD configuration incomplete. Please check AZURE_* environment variables.');
  }

  const config: AzureADConfig = {
    tenantId: process.env.AZURE_TENANT_ID,
    clientId: process.env.AZURE_CLIENT_ID,
    clientSecret: process.env.AZURE_CLIENT_SECRET
  };

  azureClient = new AzureADClient(config);
  return azureClient;
};

export const getAzureADClient = (): AzureADClient | null => {
  // Check if we have valid credentials before creating client
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  
  if (!tenantId || !clientId || !clientSecret ||
      tenantId === 'placeholder-tenant-id' ||
      clientId === 'placeholder-client-id' ||
      clientSecret === 'placeholder-client-secret') {
    logger.warn('Azure AD client not available - using placeholder or missing credentials');
    return null;
  }
  
  if (!azureClient) {
    return createAzureADClient();
  }
  return azureClient;
};

export const closeAzureADClient = async (): Promise<void> => {
  if (azureClient) {
    await azureClient.clearTokenCache();
    azureClient = null;
  }
};