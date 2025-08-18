import { Pool } from 'pg';
import { logger } from '../../utils/logger';
// Encryption utility not needed since credentials are handled elsewhere
import { 
  // DataSourceCredentials, 
  ServiceCredentials, 
  DataSourceType,
  UserContext,
  QueryContext
} from './types';
import { CredentialError } from './errors';

export class CredentialContextManager {
  private db: Pool;
  private credentialCache: Map<string, { credentials: ServiceCredentials; timestamp: number }> = new Map();
  private cacheTTL: number = 300000; // 5 minutes

  constructor(db: Pool) {
    this.db = db;
  }

  /**
   * Get credentials for a specific data source and context
   */
  async getCredentials(
    dataSourceType: DataSourceType,
    context?: QueryContext
  ): Promise<ServiceCredentials> {
    // If specific credentials are provided in context, use them
    if (context?.credentials) {
      return context.credentials;
    }

    // If system credentials are explicitly requested or no user context
    if (context?.useSystemCredentials || !context?.user) {
      return this.getSystemCredentials(dataSourceType);
    }

    // Try to get user-specific credentials
    try {
      const userCredentials = await this.getUserCredentials(
        context.user.id,
        dataSourceType
      );
      
      if (userCredentials) {
        return userCredentials;
      }
    } catch (error) {
      logger.warn(
        `Failed to get user credentials for ${dataSourceType}, falling back to system credentials`,
        error
      );
    }

    // Fall back to system credentials
    return this.getSystemCredentials(dataSourceType);
  }

  /**
   * Get user-specific credentials from database
   */
  private async getUserCredentials(
    userId: number,
    serviceType: DataSourceType
  ): Promise<ServiceCredentials | null> {
    const cacheKey = `user:${userId}:${serviceType}`;
    
    // Check cache first
    const cached = this.credentialCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.credentials;
    }

    try {
      const result = await this.db.query(
        'SELECT * FROM service_credentials WHERE user_id = $1 AND service_type = $2 AND is_active = true LIMIT 1',
        [userId, serviceType]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const credential = result.rows[0];
      const credentials = await this.decryptCredentials(credential);
      
      // Cache the decrypted credentials
      this.credentialCache.set(cacheKey, {
        credentials,
        timestamp: Date.now()
      });

      return credentials;
    } catch (error) {
      throw new CredentialError(
        `Failed to retrieve user credentials: ${(error as Error).message}`,
        error as Error
      );
    }
  }

  /**
   * Get system-wide credentials from environment
   */
  private getSystemCredentials(dataSourceType: DataSourceType): ServiceCredentials {
    const cacheKey = `system:${dataSourceType}`;
    
    // Check cache first
    const cached = this.credentialCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.credentials;
    }

    let credentials: ServiceCredentials;

    switch (dataSourceType) {
      case 'ad':
        credentials = {
          username: process.env.AD_USERNAME || '',
          password: process.env.AD_PASSWORD || '',
          domain: process.env.AD_DOMAIN
        };
        break;

      case 'azure':
        credentials = {
          tenantId: process.env.AZURE_TENANT_ID || '',
          clientId: process.env.AZURE_CLIENT_ID || '',
          clientSecret: process.env.AZURE_CLIENT_SECRET || '',
          username: '', // Not used for Azure
          password: ''  // Not used for Azure
        };
        break;

      case 'o365':
        // O365 uses the same credentials as Azure
        credentials = {
          tenantId: process.env.AZURE_TENANT_ID || '',
          clientId: process.env.AZURE_CLIENT_ID || '',
          clientSecret: process.env.AZURE_CLIENT_SECRET || '',
          username: '', // Not used for O365
          password: ''  // Not used for O365
        };
        break;

      default:
        throw new CredentialError(`Unknown data source type: ${dataSourceType}`);
    }

    // Validate that we have the required credentials
    this.validateCredentials(credentials, dataSourceType);

    // Cache the credentials
    this.credentialCache.set(cacheKey, {
      credentials,
      timestamp: Date.now()
    });

    return credentials;
  }

  /**
   * Decrypt stored credentials
   */
  private async decryptCredentials(
    credential: any
  ): Promise<ServiceCredentials> {
    const credentials: ServiceCredentials = {
      username: credential.username,
      password: '',
      domain: credential.domain
    };

    // Decrypt password
    if (credential.encryptedPassword && credential.salt) {
      try {
        // TODO: Implement decryption when encryption service is available
        // credentials.password = await decrypt(
        //   credential.encryptedPassword,
        //   credential.salt
        // );
        credentials.password = credential.encryptedPassword; // Temporary fallback
      } catch (error) {
        throw new CredentialError(
          'Failed to decrypt password',
          error as Error
        );
      }
    }

    // Decrypt client secret for Azure/O365
    if (credential.encryptedClientSecret && credential.salt) {
      try {
        // TODO: Implement decryption when encryption service is available  
        // credentials.clientSecret = await decrypt(
        //   credential.encryptedClientSecret,
        //   credential.salt
        // );
        credentials.clientSecret = credential.encryptedClientSecret; // Temporary fallback
        credentials.tenantId = credential.tenantId;
        credentials.clientId = credential.clientId;
      } catch (error) {
        throw new CredentialError(
          'Failed to decrypt client secret',
          error as Error
        );
      }
    }

    return credentials;
  }

  /**
   * Validate that we have all required credentials
   */
  private validateCredentials(
    credentials: ServiceCredentials,
    dataSourceType: DataSourceType
  ): void {
    switch (dataSourceType) {
      case 'ad':
        if (!credentials.username || !credentials.password) {
          throw new CredentialError(
            'AD credentials are not configured. Please set AD_USERNAME and AD_PASSWORD environment variables.'
          );
        }
        break;

      case 'azure':
      case 'o365':
        if (!credentials.tenantId || !credentials.clientId || !credentials.clientSecret) {
          throw new CredentialError(
            `${dataSourceType.toUpperCase()} credentials are not configured. Please set AZURE_TENANT_ID, AZURE_CLIENT_ID, and AZURE_CLIENT_SECRET environment variables.`
          );
        }
        break;
    }
  }

  /**
   * Store user credentials (for credential management endpoints)
   */
  async storeUserCredentials(
    userId: number,
    serviceType: DataSourceType,
    _credentials: Partial<ServiceCredentials>
  ): Promise<void> {
    // This would be implemented by the existing credentials service
    // Just invalidate cache here
    const cacheKey = `user:${userId}:${serviceType}`;
    this.credentialCache.delete(cacheKey);
  }

  /**
   * Clear credential cache
   */
  clearCache(userId?: number, serviceType?: DataSourceType): void {
    if (userId && serviceType) {
      this.credentialCache.delete(`user:${userId}:${serviceType}`);
    } else if (userId) {
      // Clear all credentials for a user
      for (const key of this.credentialCache.keys()) {
        if (key.startsWith(`user:${userId}:`)) {
          this.credentialCache.delete(key);
        }
      }
    } else {
      // Clear entire cache
      this.credentialCache.clear();
    }
  }

  /**
   * Create a query context with credentials
   */
  async createContext(
    dataSourceType: DataSourceType,
    user?: UserContext,
    options?: {
      useSystemCredentials?: boolean;
      requestId?: string;
    }
  ): Promise<QueryContext> {
    const context: QueryContext = {
      user,
      useSystemCredentials: options?.useSystemCredentials,
      requestId: options?.requestId,
      startTime: new Date()
    };

    // Pre-fetch credentials
    context.credentials = await this.getCredentials(dataSourceType, context);

    return context;
  }

  /**
   * Get metrics about credential usage
   */
  getMetrics(): Record<string, any> {
    return {
      cacheSize: this.credentialCache.size,
      cacheTTL: this.cacheTTL,
      cachedCredentials: Array.from(this.credentialCache.keys()).map(key => {
        const [type, id, service] = key.split(':');
        return { type, id, service };
      })
    };
  }
}