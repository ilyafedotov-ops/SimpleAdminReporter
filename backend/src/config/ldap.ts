import { Client } from 'ldapts';
import { logger } from '@/utils/logger';

export interface LDAPConfig {
  url: string;
  baseDN: string;
  username: string;
  password: string;
  timeout?: number;
  connectTimeout?: number;
  maxConnections?: number;
}

export interface LDAPSearchOptions {
  filter: string;
  scope?: 'base' | 'one' | 'sub';
  attributes?: string[];
  sizeLimit?: number;
  timeLimit?: number;
}

export interface LDAPSearchResult {
  dn: string;
  attributes: { [key: string]: any };
}

export class LDAPClient {
  private config: LDAPConfig;
  private connectionPool: Client[] = [];
  private poolSize: number;

  constructor(config: LDAPConfig) {
    this.config = {
      timeout: 30000,
      connectTimeout: 10000,
      maxConnections: 5,
      ...config
    };
    this.poolSize = this.config.maxConnections!;
  }

  private async createClient(): Promise<Client> {
    const client = new Client({
      url: this.config.url,
      tlsOptions: {
        rejectUnauthorized: process.env.NODE_ENV === 'production',
        minVersion: 'TLSv1.2',
      },
      timeout: this.config.timeout,
      connectTimeout: this.config.connectTimeout,
    });

    try {
      await client.bind(this.config.username, this.config.password);
      logger.debug('LDAP client connected and bound successfully');
      return client;
    } catch (error) {
      logger.error('LDAP connection/bind failed:', error);
      await client.unbind().catch(() => {}); // Ignore unbind errors
      throw error;
    }
  }

  private async getClient(): Promise<Client> {
    // Try to get a client from the pool
    while (this.connectionPool.length > 0) {
      const client = this.connectionPool.pop()!;
      try {
        // Test if the client is still connected by doing a simple search
        await client.search(this.config.baseDN, {
          filter: '(objectClass=*)',
          scope: 'base',
          attributes: ['objectClass'],
          sizeLimit: 1,
          timeLimit: 5
        });
        return client;
      } catch (error: any) {
        // Client is not connected or credentials are invalid
        logger.debug('Pooled LDAP client is not connected/authenticated, removing from pool:', ((error as any)?.message || String(error)));
        await client.unbind().catch(() => {});
        
        // If it's a credential error (49 = InvalidCredentialsError), clear the entire pool
        if (error.code === 49) {
          logger.warn('Credential error detected, clearing entire connection pool');
          await this.close();
          break;
        }
      }
    }
    // No valid client in pool, create a new one
    return await this.createClient();
  }

  private releaseClient(client: Client): void {
    if (this.connectionPool.length < this.poolSize) {
      this.connectionPool.push(client);
    } else {
      client.unbind().catch(() => {}); // Ignore unbind errors
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      logger.info(`LDAP health check: Testing connection to ${this.config.url}`);
      logger.debug(`LDAP health check: Using username: ${this.config.username}`);
      
      // Create a test client just to check if the server is reachable
      const testClient = new Client({
        url: this.config.url,
        tlsOptions: {
          rejectUnauthorized: false,
          minVersion: 'TLSv1.2',
        },
        timeout: 5000,
        connectTimeout: 5000,
      });

      // For health check, just verify we can bind with the service account
      // This is enough to confirm LDAP server is accessible
      try {
        await testClient.bind(this.config.username, this.config.password);
        logger.info('LDAP health check: Successfully connected with service account');
        await testClient.unbind().catch(() => {});
        return true;
      } catch (bindError: any) {
        logger.warn(`LDAP health check bind error: ${bindError.message}, code: ${bindError.code}`);
        
        // Check if it's a credential error vs network error
        if (bindError.code === 49) {
          // Invalid credentials - but server is reachable
          logger.info('LDAP health check: Invalid service account credentials, but server is reachable');
          return true; // Server is up, just credentials might be wrong
        }
        
        // Check for other known LDAP error codes that indicate server is reachable
        if (bindError.code === 52 || bindError.code === 53) {
          // 52 = Server unavailable, 53 = Unwilling to perform
          logger.info(`LDAP health check: Server responded with LDAP error ${bindError.code}, server is reachable`);
          return true;
        }
        
        // Other errors indicate connection issues
        logger.error(`LDAP health check failed with error: ${bindError.message}, code: ${bindError.code}`);
        throw bindError;
      }
    } catch (error: any) {
      logger.error(`LDAP connection test error: ${((error as any)?.message || String(error))}, code: ${error.code}, errno: ${error.errno}`);
      
      // Network errors mean server is not reachable
      if (['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EHOSTUNREACH'].includes(error.code)) {
        logger.error(`LDAP server not reachable: ${error.code} - ${((error as any)?.message || String(error))}`);
        return false;
      }
      
      // Socket errors
      if (error.errno && ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EHOSTUNREACH'].includes(error.errno)) {
        logger.error(`LDAP server not reachable (errno): ${error.errno} - ${((error as any)?.message || String(error))}`);
        return false;
      }
      
      // Other errors we'll log but still return false
      logger.error('LDAP connection test failed with unknown error:', error);
      return false;
    }
  }

  async search(options: LDAPSearchOptions): Promise<LDAPSearchResult[]> {
    let client = await this.getClient();
    let retryCount = 0;
    const maxRetries = 2;
    
    while (retryCount <= maxRetries) {
      try {
        const searchOptions = {
          scope: options.scope || 'sub' as const,
          filter: options.filter,
          attributes: options.attributes || [],
          sizeLimit: options.sizeLimit || 1000,
          timeLimit: options.timeLimit || 30
        };

        const { searchEntries } = await client.search(this.config.baseDN, searchOptions);
        
        const results: LDAPSearchResult[] = searchEntries.map(entry => ({
          dn: entry.dn,
          attributes: entry
        }));

        logger.debug(`LDAP search completed successfully, ${results.length} results`);
        this.releaseClient(client);
        return results;
      } catch (error: any) {
        // Check if it's a bind error
        if (error.code === 1 && ((error as any)?.message || String(error))?.includes('successful bind must be completed') && retryCount < maxRetries) {
          logger.debug('LDAP search failed due to bind error, retrying with new client');
          // Don't release the failed client back to pool
          await client.unbind().catch(() => {});
          // Get a fresh client
          client = await this.getClient();
          retryCount++;
        } else {
          // Other error or max retries reached
          this.releaseClient(client);
          throw error;
        }
      }
    }
    
    // Should not reach here
    this.releaseClient(client);
    throw new Error('LDAP search failed after max retries');
  }

  async authenticate(username: string, password: string): Promise<boolean> {
    try {
      logger.debug(`[LDAP Auth] Starting authentication for username: ${username}`);
      logger.debug(`[LDAP Auth] Username length: ${username.length}, contains backslash: ${username.includes('\\')}`);
      
      // Handle domain\username format
      let searchUsername = username;
      let userPrincipalName: string | null = null;
      
      // Log each character for debugging
      const chars = username.split('').map((c, i) => `[${i}]='${c}'(${c.charCodeAt(0)})`).join(' ');
      logger.debug(`[LDAP Auth] Username characters: ${chars}`);
      
      if (username.includes('\\')) {
        // Extract just the username part from domain\username
        const parts = username.split('\\');
        logger.debug(`[LDAP Auth] Domain\\username detected. Parts: ${JSON.stringify(parts)}`);
        searchUsername = parts[1];
        logger.debug(`[LDAP Auth] Extracted username '${searchUsername}' from '${username}'`);
      } else if (username.includes('@')) {
        // Handle UPN format (user@domain.com)
        userPrincipalName = username;
        searchUsername = username.split('@')[0];
        logger.debug(`[LDAP Auth] UPN format detected. Search username: ${searchUsername}, UPN: ${userPrincipalName}`);
      } else {
        logger.debug(`[LDAP Auth] Plain username format: ${username}`);
      }

      // First, find the user's DN
      let filter = `(sAMAccountName=${searchUsername})`;
      if (userPrincipalName) {
        filter = `(|(sAMAccountName=${searchUsername})(userPrincipalName=${userPrincipalName}))`;
      }
      
      logger.debug(`[LDAP Auth] Searching with filter: ${filter}`);
      logger.debug(`[LDAP Auth] Search base DN: ${this.config.baseDN}`);
      
      const searchResults = await this.search({
        filter,
        scope: 'sub',
        attributes: ['dn', 'sAMAccountName', 'userPrincipalName']
      });

      logger.debug(`[LDAP Auth] Search returned ${searchResults.length} results`);
      
      if (searchResults.length === 0) {
        logger.warn(`[LDAP Auth] User not found: ${username} (searched for: ${searchUsername})`);
        return false;
      }

      const userDN = searchResults[0].dn;
      logger.debug(`[LDAP Auth] Found user DN: ${userDN} for username: ${username}`);
      logger.debug(`[LDAP Auth] User attributes: ${JSON.stringify(searchResults[0].attributes)}`);

      // Try to bind with user credentials
      logger.debug(`[LDAP Auth] Attempting to bind with user DN: ${userDN}`);
      const userClient = new Client({
        url: this.config.url,
        connectTimeout: this.config.connectTimeout,
        timeout: this.config.timeout
      });

      try {
        await userClient.bind(userDN, password);
        logger.info(`[LDAP Auth] Authentication successful for user: ${username} (DN: ${userDN})`);
        return true;
      } catch (error) {
        logger.warn(`[LDAP Auth] Authentication failed for user: ${username} (DN: ${userDN})`, error);
        return false;
      } finally {
        await userClient.unbind().catch(() => {});
      }
    } catch (error) {
      logger.error('[LDAP Auth] Authentication error:', error);
      return false;
    }
  }

  async getUser(username: string): Promise<LDAPSearchResult | null> {
    try {
      logger.debug(`[LDAP getUser] Getting user details for: ${username}`);
      
      // Handle domain\username format
      let searchUsername = username;
      let userPrincipalName: string | null = null;
      
      if (username.includes('\\')) {
        // Extract just the username part from domain\username
        const parts = username.split('\\');
        searchUsername = parts[1];
        logger.debug(`[LDAP getUser] Domain\\username format detected. Extracted: ${searchUsername}`);
      } else if (username.includes('@')) {
        // Handle UPN format (user@domain.com)
        userPrincipalName = username;
        searchUsername = username.split('@')[0];
        logger.debug(`[LDAP getUser] UPN format detected. Search username: ${searchUsername}`);
      } else {
        logger.debug(`[LDAP getUser] Plain username format: ${username}`);
      }

      // Build search filter
      let filter = `(sAMAccountName=${searchUsername})`;
      if (userPrincipalName) {
        filter = `(|(sAMAccountName=${searchUsername})(userPrincipalName=${userPrincipalName}))`;
      }

      logger.debug(`[LDAP getUser] Search filter: ${filter}`);

      const results = await this.search({
        filter,
        scope: 'sub',
        attributes: [
          'sAMAccountName', 'displayName', 'mail', 'userPrincipalName',
          'givenName', 'sn', 'department', 'title', 'company', 'manager',
          'telephoneNumber', 'mobile', 'physicalDeliveryOfficeName',
          'lastLogonTimestamp', 'passwordLastSet', 'accountExpires',
          'userAccountControl', 'memberOf', 'whenCreated', 'whenChanged',
          'objectGUID'
        ]
      });

      logger.debug(`[LDAP getUser] Search results count: ${results.length}`);
      
      if (results.length > 0) {
        logger.debug(`[LDAP getUser] Found user: ${results[0].dn}`);
        logger.debug(`[LDAP getUser] User attributes: sAMAccountName=${results[0].attributes.sAMAccountName}, displayName=${results[0].attributes.displayName}`);
      } else {
        logger.debug(`[LDAP getUser] No user found for: ${searchUsername}`);
      }

      return results.length > 0 ? results[0] : null;
    } catch (error) {
      logger.error(`[LDAP getUser] Error getting user ${username}:`, error);
      return null;
    }
  }

  async getUserGroups(username: string): Promise<string[]> {
    try {
      const user = await this.getUser(username);
      if (!user || !user.attributes.memberOf) {
        return [];
      }

      const memberOf = user.attributes.memberOf;
      return Array.isArray(memberOf) ? memberOf : [memberOf];
    } catch (error) {
      logger.error(`Error getting groups for user ${username}:`, error);
      return [];
    }
  }

  // Helper functions for FileTime conversion and account-state checks have
  // been centralised in `@/utils/ldap-utils`.  Import and use them from there
  // when needed rather than duplicating the logic here.

  /**
   * Force refresh all connections by closing the current pool
   * Useful when credential errors are detected
   */
  async refreshConnections(): Promise<void> {
    logger.info('Refreshing LDAP connection pool due to credential issues');
    await this.close();
  }

  async close(): Promise<void> {
    const closePromises = this.connectionPool.map(client => 
      client.unbind().catch(() => {}) // Ignore errors during close
    );

    await Promise.all(closePromises);
    this.connectionPool = [];
    logger.info('All LDAP connections closed');
  }
}

// Create and export LDAP client instance
let ldapClient: LDAPClient | null = null;

export const createLDAPClient = (): LDAPClient => {
  if (!process.env.AD_SERVER || !process.env.AD_BASE_DN || 
      !process.env.AD_USERNAME || !process.env.AD_PASSWORD) {
    throw new Error('LDAP configuration incomplete. Please check AD_* environment variables.');
  }

  // Determine LDAP URL based on LDAPS setting
  const useLDAPS = process.env.AD_USE_LDAPS === 'true';
  const port = useLDAPS ? 636 : 389;
  const protocol = useLDAPS ? 'ldaps' : 'ldap';
  const url = `${protocol}://${process.env.AD_SERVER}:${port}`;

  const config: LDAPConfig = {
    url: url,
    baseDN: process.env.AD_BASE_DN,
    username: process.env.AD_USERNAME,
    password: process.env.AD_PASSWORD,
    timeout: process.env.LDAP_TIMEOUT ? parseInt(process.env.LDAP_TIMEOUT) : 30000,
    connectTimeout: process.env.LDAP_CONNECT_TIMEOUT ? parseInt(process.env.LDAP_CONNECT_TIMEOUT) : 10000,
    maxConnections: process.env.LDAP_MAX_CONNECTIONS ? parseInt(process.env.LDAP_MAX_CONNECTIONS) : 5
  };

  ldapClient = new LDAPClient(config);
  return ldapClient;
};

export const getLDAPClient = (): LDAPClient | null => {
  // Check if we have valid LDAP credentials
  if (!process.env.AD_SERVER || !process.env.AD_BASE_DN || 
      !process.env.AD_USERNAME || !process.env.AD_PASSWORD) {
    logger.warn('LDAP client not available - missing AD configuration');
    return null;
  }
  
  if (!ldapClient) {
    return createLDAPClient();
  }
  return ldapClient;
};

export const closeLDAPClient = async (): Promise<void> => {
  if (ldapClient) {
    await ldapClient.close();
    ldapClient = null;
  }
};
