import { LDAPClient, LDAPConfig } from '@/config/ldap';
import { logger } from '@/utils/logger';

/**
 * Factory for creating LDAP client instances with custom credentials
 * This allows creating separate LDAP connections for user-specific operations
 */
export class LDAPClientFactory {
  /**
   * Create an LDAP client with custom credentials
   * @param username - The username to bind with (can be DN or username)
   * @param password - The password for authentication
   * @param options - Additional configuration options
   */
  static async createUserClient(
    username: string, 
    password: string,
    options?: Partial<LDAPConfig>
  ): Promise<LDAPClient> {
    // Determine LDAP URL based on LDAPS setting
    const useLDAPS = process.env.AD_USE_LDAPS === 'true';
    const port = useLDAPS ? 636 : 389;
    const protocol = useLDAPS ? 'ldaps' : 'ldap';
    const url = `${protocol}://${process.env.AD_SERVER}:${port}`;

    // Get default configuration from environment
    const defaultConfig: LDAPConfig = {
      url: url,
      baseDN: process.env.AD_BASE_DN!,
      username: '', // Will be set below
      password: '', // Will be set below
      timeout: parseInt(process.env.LDAP_TIMEOUT || '30000'),
      connectTimeout: parseInt(process.env.LDAP_CONNECT_TIMEOUT || '10000'),
      maxConnections: 1 // User clients should have limited connections
    };

    // Merge with any provided options
    const config: LDAPConfig = {
      ...defaultConfig,
      ...options,
      username,
      password
    };

    // Create the client
    const client = new LDAPClient(config);
    
    // Test the connection to ensure credentials are valid
    try {
      const isValid = await client.testConnection();
      if (!isValid) {
        throw new Error('Failed to connect with provided credentials');
      }
      
      logger.info(`Created LDAP client for user: ${username}`);
      return client;
    } catch (error) {
      await client.close();
      throw error;
    }
  }

  /**
   * Create an LDAP client that binds with a specific user DN
   * This is useful when you already know the user's DN
   */
  static async createUserClientWithDN(
    userDN: string,
    password: string,
    options?: Partial<LDAPConfig>
  ): Promise<LDAPClient> {
    return this.createUserClient(userDN, password, options);
  }

  /**
   * Create an LDAP client for a user by first searching for their DN
   * This handles various username formats (domain\user, user@domain, plain username)
   */
  static async createUserClientWithSearch(
    username: string,
    password: string,
    options?: Partial<LDAPConfig>
  ): Promise<LDAPClient> {
    // Determine LDAP URL based on LDAPS setting
    const useLDAPS = process.env.AD_USE_LDAPS === 'true';
    const port = useLDAPS ? 636 : 389;
    const protocol = useLDAPS ? 'ldaps' : 'ldap';
    const url = `${protocol}://${process.env.AD_SERVER}:${port}`;

    // First, we need to find the user's DN using system credentials
    const systemConfig: LDAPConfig = {
      url: url,
      baseDN: process.env.AD_BASE_DN!,
      username: process.env.AD_USERNAME!,
      password: process.env.AD_PASSWORD!,
      timeout: parseInt(process.env.LDAP_TIMEOUT || '30000'),
      connectTimeout: parseInt(process.env.LDAP_CONNECT_TIMEOUT || '10000'),
      maxConnections: 1
    };

    const systemClient = new LDAPClient(systemConfig);
    
    try {
      // Parse the username
      let searchUsername = username;
      let userPrincipalName: string | null = null;
      
      if (username.includes('\\')) {
        // domain\username format
        const parts = username.split('\\');
        searchUsername = parts[1];
      } else if (username.includes('@')) {
        // user@domain format
        userPrincipalName = username;
        searchUsername = username.split('@')[0];
      }

      // Build search filter
      let filter = `(sAMAccountName=${searchUsername})`;
      if (userPrincipalName) {
        filter = `(|(sAMAccountName=${searchUsername})(userPrincipalName=${userPrincipalName}))`;
      }

      // Search for the user
      const results = await systemClient.search({
        filter,
        scope: 'sub',
        attributes: ['dn']
      });

      await systemClient.close();

      if (results.length === 0) {
        throw new Error(`User not found: ${username}`);
      }

      const userDN = results[0].dn;
      logger.debug(`Found user DN for ${username}: ${userDN}`);

      // Now create a client with the user's DN
      return this.createUserClientWithDN(userDN, password, options);
    } catch (error) {
      await systemClient.close();
      throw error;
    }
  }

  /**
   * Validate user credentials without creating a persistent client
   * Useful for one-time authentication checks
   */
  static async validateCredentials(username: string, password: string): Promise<boolean> {
    try {
      const client = await this.createUserClientWithSearch(username, password);
      await client.close();
      return true;
    } catch (error) {
      logger.debug(`Credential validation failed for ${username}: ${error}`);
      return false;
    }
  }
}
