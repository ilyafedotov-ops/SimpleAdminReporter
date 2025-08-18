import { Client } from 'ldapts';
import { logger } from "../utils/logger";
import { 
  BaseDataSourceService, 
  CredentialContext, 
  Query, 
  QueryResult,
  ConnectionOptions,
  ConnectionError,
  DataSourceError,
  QueryError
} from './base';
import {
  // createAttributeGetter,
  convertLDAPToUser,
  buildComplexFilter,
  sortResults,
  daysToWindowsFileTime,
  // windowsFileTimeToDate,
  // isAccountDisabled,
  // isAccountLocked,
  // isPasswordNeverExpires,
  LDAP_FILTERS,
  LDAP_ATTRIBUTES,
  UAC_FLAGS,
  resolveFieldAlias,
  resolveLDAPToAlias
} from '../utils/ldap-utils';
// Define AD User type locally since it doesn't exist in shared types  
interface StandardADUser {
  username: string;
  displayName?: string;
  email?: string;
  enabled?: boolean;
  locked?: boolean;
  passwordExpiry?: Date;
  passwordLastSet?: Date;
  passwordNeverExpires?: boolean;
  lastLogon?: Date;
  department?: string;
  title?: string;
  groups?: string[];
  dn?: string;
}
import { redis } from '../config/redis';

// LDAPConnection is now just the ldapts Client
type LDAPConnection = Client;

interface ADQuery extends Query {
  baseDN?: string;
  scope?: 'base' | 'one' | 'sub';
  sizeLimit?: number;
  paged?: boolean;
  orderBy?: { field: string; direction: 'asc' | 'desc' };
}

export class ADService extends BaseDataSourceService {
  private baseDN: string;
  private cleanupInterval?: NodeJS.Timeout;
  private config: {
    server?: string;
    domain?: string;
    timeout?: number;
    connectTimeout?: number;
  };

  constructor(credentialContext?: CredentialContext) {
    super('AD', credentialContext);
    this.baseDN = process.env.AD_BASE_DN || 'DC=domain,DC=local';
    this.config = {
      server: process.env.AD_SERVER,
      domain: process.env.AD_DOMAIN,
      timeout: 5000,
      connectTimeout: 10000
    };
    this.cachePrefix = 'ad:';
    this.defaultCacheTTL = 300; // 5 minutes
    
    // Set up periodic connection cleanup (every 5 minutes)
    // Only set up interval in non-test environments
    if (process.env.NODE_ENV !== 'test') {
      this.cleanupInterval = setInterval(() => {
        this.cleanupStaleConnections().catch(err => 
          this.logger.error('Failed to cleanup stale connections:', err)
        );
      }, 5 * 60 * 1000);
    }
  }

  /**
   * Format server string into proper LDAP URL
   */
  private formatLdapUrl(server?: string): string | undefined {
    if (!server) return undefined;
    
    // If it's already a proper LDAP URL, return as-is
    if (server.startsWith('ldap://') || server.startsWith('ldaps://')) {
      return server;
    }
    
    // Determine protocol based on LDAPS setting
    const useLDAPS = process.env.AD_USE_LDAPS === 'true';
    const port = useLDAPS ? 636 : 389;
    const protocol = useLDAPS ? 'ldaps' : 'ldap';
    
    // Otherwise, prepend appropriate protocol
    return `${protocol}://${server}:${port}`;
  }

  /**
   * Test connection to Active Directory
   */
  async testConnection(): Promise<boolean> {
    try {
      // connection tested
      const testQuery: ADQuery = {
        type: 'test',
        filter: '(objectClass=*)',
        attributes: ['name'],
        options: { sizeLimit: 1 }
      };
      
      await this.executeQuery(testQuery);
      this.updateConnectionStatus(true);
      return true;
    } catch (error) {
      this.updateConnectionStatus(false, error as Error);
      return false;
    }
  }

  /**
   * Execute LDAP query
   */
  async executeQuery(query: ADQuery, context?: CredentialContext): Promise<QueryResult<StandardADUser>> {
    this.validateQuery(query);
    
    const startTime = Date.now();
    const cacheKey = this.buildCacheKey(query, context);
    
    // Log the context being used
    this.logger.debug('Executing query with context:', {
      queryType: query.type,
      hasContext: !!context,
      useSystemCredentials: context?.useSystemCredentials,
      userId: context?.userId,
      defaultContext: this.credentialContext
    });
    
    // Check cache
    if (redis && query.options?.useCache !== false) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          const result = JSON.parse(cached);
          result.cached = true;
          return result;
        }
      } catch (error) {
        this.logger.warn('Cache retrieval failed', error);
      }
    }
    
    // Execute query
    const _connection = await this.getConnection(context || this.credentialContext);
    const results = await this.executeLDAPSearch(_connection, query);
    
    // Transform results
    // For custom queries, don't convert to StandardADUser format
    const processedResults = query.type === 'custom' 
      ? results.map(r => r.attributes || r)
      : results.map(r => convertLDAPToUser(r));
    
    const transformedResults = this.transformResults(
      processedResults,
      Date.now() - startTime
    );
    
    // Apply post-processing
    const finalResults = await this.postProcessResults(transformedResults, query);
    
    // Cache results
    if (redis && query.options?.useCache !== false) {
      try {
        await redis.set(cacheKey, JSON.stringify(finalResults), this.defaultCacheTTL);
      } catch (error) {
        this.logger.warn('Cache storage failed', error);
      }
    }
    
    return finalResults;
  }

  /**
   * Get connection options based on credential context
   */
  protected async getConnectionOptions(context?: CredentialContext): Promise<ConnectionOptions> {
    this.logger.debug('Getting connection options with context:', {
      hasContext: !!context,
      useSystemCredentials: context?.useSystemCredentials,
      userId: context?.userId,
      hasCredentialManager: !!this.credentialManager
    });

    const credentials = await this.credentialManager?.getCredentials('ad', {
      user: context?.userId ? { id: context.userId } as any : undefined,
      useSystemCredentials: context?.useSystemCredentials,
      credentials: context?.credentials
    });

    if (!credentials) {
      throw new DataSourceError('No credentials available for AD connection', 'NO_CREDENTIALS');
    }

    // Log connection parameters (sensitive data filtered)
    this.logger.debug('LDAP connection parameters', {
      hasUrl: !!process.env.AD_URL,
      hasServer: !!process.env.AD_SERVER,
      url: process.env.AD_URL || `ldap://${process.env.AD_SERVER}`,
      hasBindDN: !!credentials.username,
      bindDN: credentials.username,
      bindDNLength: credentials.username?.length,
      hasCredentials: !!credentials.password,
      passwordLength: credentials.password?.length,
      timeout: 30000,
      connectTimeout: 10000,
      usingSystemCreds: context?.useSystemCredentials
    });

    // Determine LDAP URL based on LDAPS setting
    let url: string;
    if (process.env.AD_URL) {
      url = process.env.AD_URL;
    } else {
      const useLDAPS = process.env.AD_USE_LDAPS === 'true';
      const port = useLDAPS ? 636 : 389;
      const protocol = useLDAPS ? 'ldaps' : 'ldap';
      url = `${protocol}://${process.env.AD_SERVER}:${port}`;
    }

    return {
      url: url,
      bindDN: credentials.username,
      bindCredentials: credentials.password,
      timeout: 30000,
      connectTimeout: 10000,
      reconnect: {
        initialDelay: 100,
        maxDelay: 10000,
        failAfter: 3
      }
    };
  }

  /**
   * Create LDAP connection
   */
  protected async createConnection(options: ConnectionOptions): Promise<LDAPConnection> {
    try {
      const client = new Client({
        url: options.url as string,
        timeout: options.timeout,
        connectTimeout: options.connectTimeout,
        tlsOptions: (options.url as string).startsWith('ldaps://') ? {
          rejectUnauthorized: false, // For testing, allow self-signed certs
          minVersion: 'TLSv1.2' as const,
        } : undefined
      });

      // Log connection attempt
      this.logger.debug('Attempting LDAP bind', {
        url: options.url,
        hasBindDN: !!options.bindDN,
        bindDN: options.bindDN ? '***' + options.bindDN.substring(options.bindDN.length - 10) : null,
        hasCredentials: !!options.bindCredentials,
        passwordLength: options.bindCredentials?.length
      });

      // Bind to AD
      await client.bind(options.bindDN as string, options.bindCredentials as string);
      
      this.logger.info('LDAP bind successful', {
        bindDN: options.bindDN ? '***' + options.bindDN.substring(options.bindDN.length - 10) : null
      });
      
      return client;
    } catch (err: any) {
      this.logger.error('LDAP bind failed', {
        error: err,
        url: options.url,
        bindDN: options.bindDN ? '***' + options.bindDN.substring(options.bindDN.length - 10) : null,
        errorCode: err.code,
        errorMessage: err.message,
        errorName: err.name
      });
      throw new ConnectionError('LDAP bind failed', err);
    }
  }

  /**
   * Close LDAP connection
   */
  protected async closeConnection(_connection: LDAPConnection): Promise<void> {
    try {
      await _connection.unbind();
    } catch (err) {
      this.logger.warn('Error during unbind', err);
    }
  }

  /**
   * Generate a unique key for connection pooling
   * Override to include credential context in the key
   */
  protected getConnectionPoolKey(options: ConnectionOptions): string {
    // Include both the bind DN and whether system credentials are used
    const bindDN = options.bindDN || 'anonymous';
    const credentialSource = this.credentialContext?.useSystemCredentials ? 'system' : 
                           this.credentialContext?.userId ? `user-${this.credentialContext.userId}` : 
                           'default';
    
    return `${options.url || 'default'}:${bindDN}:${credentialSource}`;
  }

  /**
   * Check if connection is valid
   */
  protected async isConnectionValid(_connection: LDAPConnection): Promise<boolean> {
    if (!_connection) {
      return false;
    }

    try {
      // Test the connection with a simple search
      const { searchEntries } = await _connection.search('', {
        scope: 'base',
        filter: '(objectClass=*)',
        attributes: ['namingContexts'],
        sizeLimit: 1,
        timeLimit: 5
      });
      
      return searchEntries.length > 0;
    } catch (err: any) {
      this.logger.debug('Connection test failed:', err.message);
      return false;
    }
  }

  /**
   * Execute LDAP search
   */
  private async executeLDAPSearch(
    client: LDAPConnection, 
    query: ADQuery
  ): Promise<any[]> {
    const searchOptions = {
      scope: query.scope || 'sub' as const,
      filter: query.filter || '(objectClass=*)',
      attributes: query.attributes || [],
      sizeLimit: query.options?.limit || 1000,
      paged: query.paged !== false,
      timeLimit: 30 // Add a reasonable timeout
    };

    // Ensure we always pass a valid, non-empty DN string to the LDAP client.
    // Some query builders may send an empty string or a DN that starts with an
    // illegal character (e.g. a leading comma or whitespace) which causes the
    // underlying @ldapjs/dn parser to throw the error:
    // "invalid attribute name leading character encountered".
    // We guard against this by trimming the value and falling back to the
    // service-level default DN when the provided one is blank or clearly
    // malformed.

    let baseDN = (query.baseDN ?? "").trim();

    // Basic sanity check – DN must start with an alpha character followed by
    // an equals sign (e.g. "DC=", "OU=", "CN="). If it does not, revert to
    // the predefined baseDN.
    if (!baseDN || !/^[A-Za-z]+\s*=/u.test(baseDN)) {
      if (baseDN) {
        this.logger.warn(`Invalid baseDN provided ('${baseDN}'), falling back to default '${this.baseDN}'.`);
      }
      baseDN = this.baseDN;
    }

    try {
      const { searchEntries } = await client.search(baseDN, searchOptions);
      
      // Transform ldapts search entries to match the expected format
      const results = searchEntries.map(entry => ({
        dn: entry.dn,
        attributes: entry
      }));

      return results;
    } catch (err: any) {
      this.logger.error('LDAP search error:', {
        error: err,
        message: err.message,
        code: err.code,
        filter: searchOptions.filter,
        baseDN: baseDN
      });
      throw new QueryError('LDAP search failed', err);
    }
  }

  /**
   * Apply post-processing to results
   */
  protected async postProcessResults<T = StandardADUser>(
    results: QueryResult<T>,
    query: Query
  ): Promise<QueryResult<T>> {
    let processedData = [...results.data];

    // Apply sorting
    if (query.orderBy) {
      processedData = sortResults(processedData as any[], query.orderBy.field, query.orderBy.direction) as T[];
    }

    // Apply limit
    if (query.options?.limit && processedData.length > query.options.limit) {
      processedData = processedData.slice(0, query.options.limit);
    }

    return {
      ...results,
      data: processedData,
      count: processedData.length
    };
  }

  // ==================== Report Methods ====================

  /**
   * Get inactive users
   */
  async getInactiveUsers(days: number = 90, context?: CredentialContext): Promise<StandardADUser[]> {
    const cutoffFileTime = daysToWindowsFileTime(days);
    
    const query: ADQuery = {
      type: 'inactive_users',
      filter: buildComplexFilter(LDAP_FILTERS.USER, [
        { field: 'lastLogonTimestamp', operator: 'less_or_equal', value: cutoffFileTime }
      ]),
      attributes: [...LDAP_ATTRIBUTES.USER]
    };

    const result = await this.executeQuery(query, context);
    return ((result as any)?.data);
  }

  /**
   * Get disabled users
   */
  async getDisabledUsers(context?: CredentialContext): Promise<StandardADUser[]> {
    const query: ADQuery = {
      type: 'disabled_users',
      filter: LDAP_FILTERS.DISABLED_USERS,
      attributes: [...LDAP_ATTRIBUTES.USER]
    };

    const result = await this.executeQuery(query, context);
    return ((result as any)?.data);
  }

  /**
   * Get locked users
   */
  async getLockedUsers(context?: CredentialContext): Promise<StandardADUser[]> {
    const query: ADQuery = {
      type: 'locked_users',
      filter: LDAP_FILTERS.LOCKED_USERS,
      attributes: [...LDAP_ATTRIBUTES.USER]
    };

    const result = await this.executeQuery(query, context);
    return ((result as any)?.data);
  }

  /**
   * Get users with expiring passwords
   */
  async getUsersWithExpiringPasswords(
    days: number = 14, 
    context?: CredentialContext
  ): Promise<StandardADUser[]> {
    const query: ADQuery = {
      type: 'password_expiry',
      filter: buildComplexFilter(LDAP_FILTERS.USER, [
        { field: 'userAccountControl', operator: 'not_equals', value: UAC_FLAGS.DONT_EXPIRE_PASSWORD }
      ]),
      attributes: [...LDAP_ATTRIBUTES.USER]
    };

    const result = await this.executeQuery(query, context);
    
    // Filter users whose passwords will expire within specified days
    const now = Date.now();
    const maxPasswordAge = 90 * 24 * 60 * 60 * 1000; // 90 days default
    
    return ((result as any)?.data).filter((user: any) => {
      if (!user.passwordLastSet || user.passwordNeverExpires) {
        return false;
      }
      
      const passwordAge = now - user.passwordLastSet.getTime();
      const daysUntilExpiry = (maxPasswordAge - passwordAge) / (24 * 60 * 60 * 1000);
      
      return daysUntilExpiry <= days && daysUntilExpiry > 0;
    });
  }

  /**
   * Get users with never expiring passwords
   */
  async getUsersWithNeverExpiringPasswords(context?: CredentialContext): Promise<StandardADUser[]> {
    const query: ADQuery = {
      type: 'never_expiring_passwords',
      filter: LDAP_FILTERS.USER,
      attributes: [...LDAP_ATTRIBUTES.USER]
    };

    const result = await this.executeQuery(query, context);
    return ((result as any)?.data);
  }

  /**
   * Search users by criteria
   */
  async searchUsers(
    searchTerm: string,
    searchBy: 'username' | 'displayName' | 'email' = 'displayName',
    context?: CredentialContext
  ): Promise<StandardADUser[]> {
    const fieldMap = {
      username: 'sAMAccountName',
      displayName: 'displayName',
      email: 'mail'
    };

    const query: ADQuery = {
      type: 'user_search',
      filter: buildComplexFilter(LDAP_FILTERS.USER, [
        { field: fieldMap[searchBy], operator: 'contains', value: searchTerm }
      ]),
      attributes: [...LDAP_ATTRIBUTES.USER],
      options: { limit: 100 }
    };

    const result = await this.executeQuery(query, context);
    return ((result as any)?.data);
  }

  /**
   * Execute custom LDAP query
   */
  async executeCustomQuery(
    customQuery: any,
    parameters: Record<string, any> = {},
    context?: CredentialContext
  ): Promise<QueryResult> {
    // Build filter from custom query
    let filter: string;
    
    // Log the incoming query for debugging
    this.logger.debug('Executing custom query:', {
      customQuery,
      parameters,
      hasFilter: !!customQuery.filter,
      hasFilters: !!customQuery.filters,
      filtersLength: customQuery.filters?.length
    });
    
    // If a raw filter is provided, use it directly
    if (customQuery.filter && typeof customQuery.filter === 'string') {
      filter = customQuery.filter;
      
      // Replace any parameter placeholders in the filter
      Object.keys(parameters).forEach(key => {
        const regex = new RegExp(`{{${key}}}`, 'g');
        const replacement = (parameters[key] !== undefined && parameters[key] !== null && parameters[key] !== '')
          ? parameters[key]
          : '*';
        filter = filter.replace(regex, replacement);
      });

      // Replace any remaining unresolved placeholders with a wildcard to
      // guarantee a syntactically valid LDAP filter. This prevents runtime
      // errors such as "must either provide a buffer via `raw` or some
      // `value`" that occur when an equality assertion has no value.
      filter = filter.replace(/{{[^}]+}}/g, '*');
    } else if (customQuery.filters && Array.isArray(customQuery.filters)) {
      // Build filter from conditions array
      filter = LDAP_FILTERS.USER; // Default to user filter
      const conditions = customQuery.filters.map((f: any) => ({
        field: f.field,
        operator: f.operator,
        value: parameters[f.field] !== undefined ? parameters[f.field] : f.value
      }));
      
      this.logger.debug('Building filter with conditions:', { conditions });
      
      filter = buildComplexFilter(filter as any, conditions) as string;
    } else {
      // Default to user filter if no filter specified
      filter = LDAP_FILTERS.USER;
    }
    
    this.logger.debug('Final LDAP filter:', { filter });

    const query: ADQuery = {
      type: 'custom',
      filter,
      attributes: customQuery.fields?.map((f: any) => resolveFieldAlias(f.name)) || LDAP_ATTRIBUTES.USER,
      baseDN: customQuery.baseDN,
      scope: customQuery.scope || 'sub',
      orderBy: customQuery.orderBy,
      options: {
        limit: customQuery.limit || 1000
      }
    };

    const result = await this.executeQuery(query, context);
    
    // Transform to match custom query field names
    if (customQuery.fields) {
      if ((result as any)?.data) {
        (result as any).data = ((result as any).data).map((item: any) => {
        const transformed: any = {};
        
        // First, map all returned LDAP attributes to their preferred aliases
        const aliasedItem: any = {};
        Object.keys(item).forEach(ldapAttr => {
          const preferredName = resolveLDAPToAlias(ldapAttr);
          aliasedItem[preferredName] = item[ldapAttr];
        });
        
        // Then map to the requested fields
        customQuery.fields.forEach((field: any) => {
          // Use display name if provided, otherwise use original field name
          const outputFieldName = field.displayName || field.name;
          
          // Try to get the value from:
          // 1. The requested field name directly (might be an alias)
          // 2. The LDAP attribute name
          const ldapFieldName = resolveFieldAlias(field.name);
          const value = aliasedItem[field.name] || item[ldapFieldName];
          
          // Handle both single values and arrays from LDAP
          transformed[outputFieldName] = Array.isArray(value) && value.length === 1 
            ? value[0] 
            : value;
        });
        return transformed;
      });
      }
    }

    return result;
  }

  /**
   * Authenticate user with AD credentials
   */
  async authenticateUser(username: string, password: string): Promise<boolean> {
    try {
      this.logger.info(`Attempting AD authentication for user: ${username}`);
      
      const serverUrl = this.formatLdapUrl(this.config.server || process.env.AD_SERVER) || 'ldap://localhost:389';
      this.logger.debug(`AD server URL: ${serverUrl}`);
      this.logger.debug(`AD config:`, {
        server: this.config.server,
        envServer: process.env.AD_SERVER,
        domain: this.config.domain,
        envDomain: process.env.AD_DOMAIN
      });
      
      // Create a temporary connection with the user credentials
      const testConnection = new Client({
        url: serverUrl,
        timeout: this.config.timeout || 5000,
        connectTimeout: this.config.connectTimeout || 10000,
        tlsOptions: serverUrl.startsWith('ldaps://') ? {
          rejectUnauthorized: false, // For testing, allow self-signed certs
          minVersion: 'TLSv1.2' as const,
        } : undefined
      });

      // Try to bind with user credentials
      const domain = process.env.AD_DOMAIN || this.config.domain || 'domain.local';
      const bindDN = username.includes('@') ? username : `${username}@${domain}`;
      
      this.logger.debug(`Constructed bind DN: ${bindDN}`);
      
      try {
        this.logger.debug(`Attempting bind with DN: ${bindDN}`);
        await testConnection.bind(bindDN, password);
        this.logger.info(`AD authentication successful for user: ${username}`);
        await testConnection.unbind();
        return true;
      } catch (err: any) {
        this.logger.warn(`AD authentication failed for ${username}: ${err.message}`);
        this.logger.debug(`LDAP error details:`, {
          message: err.message,
          code: err.code,
          name: err.name,
          stack: err.stack
        });
        if (err.message && err.message.includes('ECONNREFUSED')) {
          this.logger.error(`Cannot connect to AD server at ${serverUrl}`);
        } else if (err.message && err.message.includes('Invalid credentials')) {
          this.logger.warn(`Invalid credentials for user ${username}`);
        }
        try {
          await testConnection.unbind();
        } catch {
          // Ignore unbind errors
        }
        return false;
      }
    } catch (error) {
      this.logger.error('Authentication failed with exception:', error);
      return false;
    }
  }

  /**
   * Get user information by username
   */
  async getUser(username: string, context?: CredentialContext): Promise<StandardADUser | null> {
    try {
      const query: ADQuery = {
        type: 'user_search',
        filter: `(&(objectClass=user)(|(sAMAccountName=${username})(userPrincipalName=${username})))`,
        attributes: ['sAMAccountName', 'displayName', 'mail', 'userPrincipalName', 
                    'department', 'title', 'telephoneNumber', 'memberOf',
                    'whenCreated', 'lastLogon', 'accountExpires', 'userAccountControl',
                    'objectGUID', 'distinguishedName'],
        options: { limit: 1 }
      };

      const result = await this.executeQuery(query, context);
      return ((result as any)?.data).length > 0 ? ((result as any)?.data)[0] : null;
    } catch (error) {
      this.logger.error('Failed to get user:', error);
      return null;
    }
  }

  /**
   * Get service-specific metrics
   */
  public getMetrics(): Record<string, any> {
    const baseMetrics = super.getMetrics();
    
    return {
      ...baseMetrics,
      baseDN: this.baseDN,
      dataSource: 'Active Directory'
    };
  }

  /**
   * Close all connections and cleanup resources
   */
  public async closeAllConnections(): Promise<void> {
    // Clear the cleanup interval if it exists
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    
    // Call parent class to close all connections
    await super.closeAllConnections();
  }
}

// Export singleton factory
let instance: ADService | null = null;

export function getADService(context?: CredentialContext): ADService {
  if (!instance || context) {
    return new ADService(context);
  }
  return instance;
}

export function resetADService(): void {
  if (instance) {
    instance.closeAllConnections().catch(err => 
      logger.error('Error closing AD connections:', err)
    );
    instance = null;
  }
}
