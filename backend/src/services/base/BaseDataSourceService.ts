import { logger } from '../../utils/logger';
import { ConnectionOptions, ConnectionStatus } from './types';
import { DataSourceError, ConnectionError } from './errors';
import { CredentialContextManager } from './CredentialContextManager';

export interface CredentialContext {
  userId?: number;
  useSystemCredentials?: boolean;
  credentials?: any;
}

export interface Query {
  type: string;
  filter?: string;
  attributes?: string[];
  parameters?: Record<string, any>;
  options?: Record<string, any>;
  orderBy?: { field: string; direction: 'asc' | 'desc' };
  filters?: any[];
  fields?: any[];
  endpoint?: string;
}

export interface QueryResult<T = any> {
  data: T[];
  count: number;
  executionTime: number;
  cached?: boolean;
  metadata?: Record<string, any>;
}

export abstract class BaseDataSourceService {
  protected logger: typeof logger;
  protected connectionPool: Map<string, any> = new Map();
  protected connectionStatus: ConnectionStatus = {
    connected: false,
    lastCheck: null,
    error: null
  };
  protected cachePrefix: string = '';
  protected defaultCacheTTL: number = 300; // 5 minutes
  protected credentialManager?: CredentialContextManager;

  constructor(
    protected serviceName: string,
    protected credentialContext?: CredentialContext
  ) {
    this.logger = logger.child({ service: `${serviceName}Service` });
    this.cachePrefix = `${serviceName.toLowerCase()}:`;
  }

  /**
   * Set the credential manager (injected by factory)
   */
  setCredentialManager(manager: CredentialContextManager): void {
    this.credentialManager = manager;
  }

  /**
   * Test connection to the data source
   */
  abstract testConnection(): Promise<boolean>;

  /**
   * Execute a query against the data source
   */
  abstract executeQuery(query: Query, context?: CredentialContext): Promise<QueryResult>;

  /**
   * Get connection options based on credential context
   */
  protected abstract getConnectionOptions(context?: CredentialContext): Promise<ConnectionOptions>;

  /**
   * Create a new connection to the data source
   */
  protected abstract createConnection(options: ConnectionOptions): Promise<any>;

  /**
   * Close a connection
   */
  protected abstract closeConnection(connection: any): Promise<void>;

  /**
   * Get or create a connection from the pool
   */
  protected async getConnection(context?: CredentialContext): Promise<any> {
    const options = await this.getConnectionOptions(context || this.credentialContext);
    const poolKey = this.getConnectionPoolKey(options);

    if (this.connectionPool.has(poolKey)) {
      const connection = this.connectionPool.get(poolKey);
      if (await this.isConnectionValid(connection)) {
        return connection;
      }
      // Connection is invalid, remove from pool
      await this.closeConnection(connection);
      this.connectionPool.delete(poolKey);
    }

    // Create new connection
    try {
      const connection = await this.createConnection(options);
      this.connectionPool.set(poolKey, connection);
      return connection;
    } catch (error) {
      this.logger.error(`Failed to create connection: ${(error as Error).message}`);
      throw new ConnectionError(
        `Failed to connect to ${this.serviceName}`,
        error as Error
      );
    }
  }

  /**
   * Check if a connection is still valid
   */
  protected abstract isConnectionValid(connection: any): Promise<boolean>;

  /**
   * Generate a unique key for connection pooling
   */
  protected getConnectionPoolKey(options: ConnectionOptions): string {
    // Default implementation - can be overridden for more complex scenarios
    return `${options.host || 'default'}:${options.port || 'default'}:${options.username || 'system'}`;
  }

  /**
   * Update connection status
   */
  protected updateConnectionStatus(connected: boolean, error?: Error): void {
    this.connectionStatus = {
      connected,
      lastCheck: new Date(),
      error: error ? ((error as any)?.message || String(error)) : null
    };
  }

  /**
   * Get current connection status
   */
  public getConnectionStatus(): ConnectionStatus {
    return { ...this.connectionStatus };
  }

  /**
   * Close all connections in the pool
   */
  public async closeAllConnections(): Promise<void> {
    const closePromises = Array.from(this.connectionPool.entries()).map(
      async ([key, connection]) => {
        try {
          await this.closeConnection(connection);
          this.connectionPool.delete(key);
        } catch (error) {
          this.logger.error(`Error closing connection ${key}: ${(error as Error).message}`);
        }
      }
    );

    await Promise.all(closePromises);
  }

  /**
   * Clean up stale connections from the pool
   */
  protected async cleanupStaleConnections(): Promise<void> {
    const entries = Array.from(this.connectionPool.entries());
    
    for (const [key, connection] of entries) {
      try {
        const isValid = await this.isConnectionValid(connection);
        if (!isValid) {
          this.logger.info(`Removing stale connection from pool: ${key}`);
          await this.closeConnection(connection);
          this.connectionPool.delete(key);
        }
      } catch (error) {
        this.logger.warn(`Error checking connection validity for ${key}:`, error);
        // Remove connection if we can't validate it
        try {
          await this.closeConnection(connection);
        } catch {
          // Ignore close errors
        }
        this.connectionPool.delete(key);
      }
    }
  }

  /**
   * Handle common error scenarios
   */
  protected handleError(operation: string, error: Error): never {
    this.logger.error(`${operation} failed: ${((error as any)?.message || String(error))}`, error);
    
    if (((error as any)?.message || String(error)).includes('ECONNREFUSED') || ((error as any)?.message || String(error)).includes('ETIMEDOUT')) {
      throw new ConnectionError(`${this.serviceName} connection failed`, error);
    }
    
    if (((error as any)?.message || String(error)).includes('Invalid credentials') || ((error as any)?.message || String(error)).includes('Authentication failed')) {
      throw new DataSourceError('Authentication failed', 'AUTH_FAILED', error);
    }
    
    throw new DataSourceError(
      `${operation} failed: ${((error as any)?.message || String(error))}`,
      'OPERATION_FAILED',
      error
    );
  }

  /**
   * Build a cache key for queries
   */
  protected buildCacheKey(query: Query, context?: CredentialContext): string {
    const contextKey = context?.userId ? `user:${context.userId}` : 'system';
    const queryKey = `${query.type}:${JSON.stringify(query.filter || {})}:${JSON.stringify(query.parameters || {})}`;
    return `${this.cachePrefix}${contextKey}:${queryKey}`;
  }

  /**
   * Transform raw results to standard format
   */
  protected transformResults<T = any>(rawResults: any[], executionTime: number): QueryResult<T> {
    return {
      data: rawResults,
      count: rawResults.length,
      executionTime,
      cached: false
    };
  }

  /**
   * Apply post-processing to query results
   */
  protected async postProcessResults<T = any>(
    results: QueryResult<T>,
    _query: Query
  ): Promise<QueryResult<T>> {
    // Default implementation - can be overridden
    return results;
  }

  /**
   * Validate query parameters
   */
  protected validateQuery(query: Query): void {
    if (!query.type) {
      throw new DataSourceError('Query type is required', 'INVALID_QUERY');
    }

    // Additional validation can be added by subclasses
  }

  /**
   * Get service metrics
   */
  public getMetrics(): Record<string, any> {
    return {
      serviceName: this.serviceName,
      connectionPoolSize: this.connectionPool.size,
      connectionStatus: this.connectionStatus,
      cachePrefix: this.cachePrefix
    };
  }
}