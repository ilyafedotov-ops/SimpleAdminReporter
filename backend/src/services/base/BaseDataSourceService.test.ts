import { BaseDataSourceService, Query, CredentialContext, QueryResult } from './BaseDataSourceService';
import { ConnectionOptions } from './types';
import { ConnectionError, DataSourceError } from './errors';

// Mock implementation for testing
class MockDataSourceService extends BaseDataSourceService {
  private mockConnection: any = { id: 'mock-connection', valid: true };
  
  constructor(credentialContext?: CredentialContext) {
    super('MockService', credentialContext);
  }

  async testConnection(): Promise<boolean> {
    try {
      const connection = await this.getConnection();
      const isValid = connection.valid === true;
      // Update connection status like the real implementation would
      this.updateConnectionStatus(isValid);
      return isValid;
    } catch (error) {
      this.updateConnectionStatus(false, error as Error);
      return false;
    }
  }

  async executeQuery(query: Query, context?: any): Promise<QueryResult> {
    this.validateQuery(query);
    
    const startTime = Date.now();
    await this.getConnection(context);
    
    // Simulate query execution
    const mockData = [
      { id: 1, name: 'Test 1' },
      { id: 2, name: 'Test 2' }
    ];
    
    const result = this.transformResults(mockData, Date.now() - startTime);
    return this.postProcessResults(result, query);
  }

  protected async getConnectionOptions(context?: CredentialContext): Promise<ConnectionOptions> {
    return {
      host: 'mock-host',
      port: 1234,
      username: context?.credentials?.username || (context?.userId ? `user-${context.userId}` : 'mock-user'),
      password: context?.credentials?.password || 'mock-pass'
    };
  }

  protected async createConnection(options: ConnectionOptions): Promise<any> {
    if (options.username === 'invalid') {
      throw new Error('Invalid credentials');
    }
    return { ...this.mockConnection, options };
  }

  protected async closeConnection(connection: any): Promise<void> {
    connection.valid = false;
  }

  protected async isConnectionValid(connection: any): Promise<boolean> {
    return connection.valid === true;
  }
}

describe('BaseDataSourceService', () => {
  let service: MockDataSourceService;

  beforeEach(() => {
    service = new MockDataSourceService();
  });

  afterEach(async () => {
    await service.closeAllConnections();
  });

  describe('Connection Management', () => {
    it('should create and cache connections', async () => {
      const connection1 = await (service as any).getConnection();
      const connection2 = await (service as any).getConnection();
      
      expect(connection1).toBe(connection2); // Same instance from cache
      expect((service as any).connectionPool.size).toBe(1);
    });

    it('should create separate connections for different contexts', async () => {
      const systemConnection = await (service as any).getConnection();
      const userConnection = await (service as any).getConnection({
        userId: 1,
        credentials: { username: 'user1', password: 'pass1' }
      });
      
      expect(systemConnection).not.toBe(userConnection);
      expect((service as any).connectionPool.size).toBe(2);
    });

    it('should handle connection errors', async () => {
      const invalidService = new MockDataSourceService({
        credentials: { username: 'invalid', password: 'invalid' }
      });
      
      await expect((invalidService as any).getConnection()).rejects.toThrow(ConnectionError);
    });

    it('should remove invalid connections from pool', async () => {
      const connection = await (service as any).getConnection();
      connection.valid = false;
      
      const newConnection = await (service as any).getConnection();
      expect(newConnection).not.toBe(connection);
      expect(newConnection.valid).toBe(true);
    });

    it('should close all connections', async () => {
      await (service as any).getConnection();
      await (service as any).getConnection({ userId: 1 });
      
      expect((service as any).connectionPool.size).toBe(2);
      
      await service.closeAllConnections();
      expect((service as any).connectionPool.size).toBe(0);
    });
  });

  describe('Query Execution', () => {
    it('should execute queries successfully', async () => {
      const query: Query = {
        type: 'test',
        filter: 'active',
        attributes: ['id', 'name']
      };
      
      const result = await service.executeQuery(query);
      
      expect(result).toMatchObject({
        data: expect.any(Array),
        count: 2,
        executionTime: expect.any(Number),
        cached: false
      });
    });

    it('should validate query before execution', async () => {
      const invalidQuery = {} as Query;
      
      await expect(service.executeQuery(invalidQuery)).rejects.toThrow('Query type is required');
    });

    it('should use context-specific credentials', async () => {
      const query: Query = { type: 'test' };
      const context: CredentialContext = {
        userId: 1,
        credentials: { username: 'user1', password: 'pass1' }
      };
      
      const result = await service.executeQuery(query, context);
      expect(result).toBeDefined();
      
      // Verify different connection was used
      expect((service as any).connectionPool.size).toBe(1);
    });
  });

  describe('Connection Status', () => {
    it('should track connection status', async () => {
      const initialStatus = service.getConnectionStatus();
      expect(initialStatus.connected).toBe(false);
      expect(initialStatus.lastCheck).toBeNull();
      
      const result = await service.testConnection();
      expect(result).toBe(true);
      
      const updatedStatus = service.getConnectionStatus();
      expect(updatedStatus.connected).toBe(true);
      expect(updatedStatus.lastCheck).toBeInstanceOf(Date);
    });
  });

  describe('Cache Key Generation', () => {
    it('should generate unique cache keys for system queries', () => {
      const query: Query = {
        type: 'users',
        filter: 'active',
        parameters: { days: 30 }
      };
      
      const key = (service as any).buildCacheKey(query);
      expect(key).toContain('mockservice:');
      expect(key).toContain('system:');
      expect(key).toContain('users');
      expect(key).toContain('active');
    });

    it('should generate unique cache keys for user queries', () => {
      const query: Query = { type: 'users' };
      const context: CredentialContext = { userId: 123 };
      
      const key = (service as any).buildCacheKey(query, context);
      expect(key).toContain('user:123');
    });
  });

  describe('Error Handling', () => {
    it('should handle connection refused errors', () => {
      const error = new Error('ECONNREFUSED');
      expect(() => (service as any).handleError('Test operation', error))
        .toThrow(ConnectionError);
    });

    it('should handle authentication errors', () => {
      const error = new Error('Invalid credentials');
      expect(() => (service as any).handleError('Test operation', error))
        .toThrow(DataSourceError);
    });

    it('should handle generic errors', () => {
      const error = new Error('Unknown error');
      expect(() => (service as any).handleError('Test operation', error))
        .toThrow('Test operation failed: Unknown error');
    });
  });

  describe('Metrics', () => {
    it('should provide service metrics', async () => {
      await service.executeQuery({ type: 'test' });
      
      const metrics = service.getMetrics();
      
      expect(metrics).toMatchObject({
        serviceName: 'MockService',
        connectionPoolSize: 1,
        connectionStatus: expect.any(Object),
        cachePrefix: 'mockservice:'
      });
    });
  });
});