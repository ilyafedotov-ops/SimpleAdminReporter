// Test mock utilities for database and Redis
import { Pool, PoolClient } from 'pg';

/**
 * Create a comprehensive mock for PostgreSQL Pool
 */
export function createMockPool(): jest.Mocked<Pool> {
  const mockClient: jest.Mocked<PoolClient> = {
    query: jest.fn().mockImplementation((text: string, params?: any[]) => {
      // Mock different query responses based on query text
      if (text.includes('SELECT NOW()')) {
        return Promise.resolve({ rows: [{ current_time: new Date() }], rowCount: 1 });
      }
      if (text.includes('SELECT 1')) {
        return Promise.resolve({ rows: [{ '?column?': 1 }], rowCount: 1 });
      }
      if (text.includes('BEGIN')) {
        return Promise.resolve({ rows: [], rowCount: 0 });
      }
      if (text.includes('COMMIT') || text.includes('ROLLBACK')) {
        return Promise.resolve({ rows: [], rowCount: 0 });
      }
      // Default response
      return Promise.resolve({ rows: [], rowCount: 0 });
    }),
    release: jest.fn(),
    end: jest.fn(),
    connect: jest.fn(),
    addListener: jest.fn(),
    emit: jest.fn(),
    eventNames: jest.fn(),
    getMaxListeners: jest.fn(),
    listenerCount: jest.fn(),
    listeners: jest.fn(),
    off: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
    prependListener: jest.fn(),
    prependOnceListener: jest.fn(),
    rawListeners: jest.fn(),
    removeAllListeners: jest.fn(),
    removeListener: jest.fn(),
    setMaxListeners: jest.fn(),
  } as any;

  const mockPool: jest.Mocked<Pool> = {
    connect: jest.fn().mockResolvedValue(mockClient),
    query: jest.fn().mockImplementation((text: string, params?: any[]) => {
      return mockClient.query(text, params);
    }),
    end: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    totalCount: 5,
    idleCount: 3,
    waitingCount: 0,
    // Add all other Pool methods
    addListener: jest.fn(),
    emit: jest.fn(),
    eventNames: jest.fn(),
    getMaxListeners: jest.fn(),
    listenerCount: jest.fn(),
    listeners: jest.fn(),
    off: jest.fn(),
    once: jest.fn(),
    prependListener: jest.fn(),
    prependOnceListener: jest.fn(),
    rawListeners: jest.fn(),
    removeAllListeners: jest.fn(),
    removeListener: jest.fn(),
    setMaxListeners: jest.fn(),
  } as any;

  return mockPool;
}

/**
 * Create a comprehensive mock for Database class
 */
export function createMockDatabase() {
  const mockPool = createMockPool();
  
  // Create individual mock functions with proper length
  const queryFn = jest.fn().mockImplementation(function(text: string, params?: any[]) {
    return mockPool.query(text, params);
  });
  Object.defineProperty(queryFn, 'length', { value: 2, configurable: true });
  
  const getClientFn = jest.fn().mockResolvedValue(mockPool.connect());
  Object.defineProperty(getClientFn, 'length', { value: 0, configurable: true });
  
  const testConnectionFn = jest.fn().mockImplementation(function() {
    return Promise.resolve(true);
  });
  Object.defineProperty(testConnectionFn, 'length', { value: 0, configurable: true });
  
  const closeFn = jest.fn().mockImplementation(function() {
    return Promise.resolve(undefined);
  });
  Object.defineProperty(closeFn, 'length', { value: 0, configurable: true });
  
  const transactionFn = jest.fn().mockImplementation(function(callback: Function) {
    return (async () => {
      const client = await mockPool.connect();
      try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    })();
  });
  Object.defineProperty(transactionFn, 'length', { value: 1, configurable: true });
  
  return {
    getInstance: jest.fn(),
    getPool: jest.fn(() => mockPool),
    query: queryFn,
    getClient: getClientFn,
    testConnection: testConnectionFn,
    close: closeFn,
    getPoolStats: jest.fn(() => ({
      totalCount: 5,
      idleCount: 3,
      waitingCount: 0
    })),
    transaction: transactionFn
  };
}

/**
 * Create a comprehensive mock for Redis client (ioredis)
 */
export function createMockRedisClient() {
  return {
    ping: jest.fn().mockResolvedValue('PONG'),
    set: jest.fn().mockResolvedValue('OK'),
    setex: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    exists: jest.fn().mockResolvedValue(0),
    expire: jest.fn().mockResolvedValue(1),
    flushall: jest.fn().mockResolvedValue('OK'),
    quit: jest.fn().mockResolvedValue('OK'),
    disconnect: jest.fn(),
    zadd: jest.fn().mockResolvedValue(1),
    zremrangebyrank: jest.fn().mockResolvedValue(1),
    zrevrange: jest.fn().mockResolvedValue([]),
    keys: jest.fn().mockResolvedValue([]),
    del: jest.fn().mockResolvedValue(0),
    on: jest.fn(),
    off: jest.fn(),
    once: jest.fn(),
    emit: jest.fn(),
    status: 'ready',
    commandQueue: { length: 0 },
    options: {
      enableOfflineQueue: true,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      keepAlive: 30000
    }
  };
}

/**
 * Create a comprehensive mock for RedisClient class
 */
export function createMockRedisClientClass() {
  const mockClient = createMockRedisClient();
  
  // Create individual mock functions with proper length for Redis methods
  const testConnectionFn = jest.fn().mockResolvedValue(true);
  Object.defineProperty(testConnectionFn, 'length', { value: 0, configurable: true });
  
  const setFn = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(setFn, 'length', { value: 3, configurable: true });
  
  const getFn = jest.fn().mockResolvedValue(null);
  Object.defineProperty(getFn, 'length', { value: 1, configurable: true });
  
  const setJsonFn = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(setJsonFn, 'length', { value: 3, configurable: true });
  
  const getJsonFn = jest.fn().mockResolvedValue(null);
  Object.defineProperty(getJsonFn, 'length', { value: 1, configurable: true });
  
  const existsFn = jest.fn().mockResolvedValue(false);
  Object.defineProperty(existsFn, 'length', { value: 1, configurable: true });
  
  const expireFn = jest.fn().mockResolvedValue(true);
  Object.defineProperty(expireFn, 'length', { value: 2, configurable: true });
  
  const flushAllFn = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(flushAllFn, 'length', { value: 0, configurable: true });
  
  const closeFn = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(closeFn, 'length', { value: 0, configurable: true });
  
  const zaddFn = jest.fn().mockResolvedValue(1);
  Object.defineProperty(zaddFn, 'length', { value: 3, configurable: true });
  
  const zremrangebyrankFn = jest.fn().mockResolvedValue(1);
  Object.defineProperty(zremrangebyrankFn, 'length', { value: 3, configurable: true });
  
  const zrevrangeFn = jest.fn().mockResolvedValue([]);
  Object.defineProperty(zrevrangeFn, 'length', { value: 3, configurable: true });
  
  const keysFn = jest.fn().mockResolvedValue([]);
  Object.defineProperty(keysFn, 'length', { value: 1, configurable: true });
  
  const invalidatePatternFn = jest.fn().mockResolvedValue(0);
  Object.defineProperty(invalidatePatternFn, 'length', { value: 1, configurable: true });
  
  const getPoolStatsFn = jest.fn(() => ({
    status: 'ready',
    commandQueue: 0,
    options: {
      enableOfflineQueue: true,
      maxRetriesPerRequest: 3
    }
  }));
  Object.defineProperty(getPoolStatsFn, 'length', { value: 0, configurable: true });
  
  const healthCheckFn = jest.fn().mockResolvedValue({
    healthy: true,
    stats: {
      status: 'ready',
      commandQueue: 0
    }
  });
  Object.defineProperty(healthCheckFn, 'length', { value: 0, configurable: true });
  
  const getOrSetFn = jest.fn().mockImplementation(async (key: string, fetcher: Function, ttl?: number) => {
    // Simulate cache miss and fetch
    return await fetcher();
  });
  Object.defineProperty(getOrSetFn, 'length', { value: 3, configurable: true });
  
  return {
    getInstance: jest.fn(),
    getClient: jest.fn(() => mockClient),
    testConnection: testConnectionFn,
    set: setFn,
    get: getFn,
    setJson: setJsonFn,
    getJson: getJsonFn,
    exists: existsFn,
    expire: expireFn,
    flushAll: flushAllFn,
    close: closeFn,
    zadd: zaddFn,
    zremrangebyrank: zremrangebyrankFn,
    zrevrange: zrevrangeFn,
    keys: keysFn,
    del: jest.fn().mockResolvedValue(0), // del uses rest parameters, length might be 0
    invalidatePattern: invalidatePatternFn,
    getPoolStats: getPoolStatsFn,
    healthCheck: healthCheckFn,
    getOrSet: getOrSetFn
  };
}

/**
 * Reset all mocks to clean state
 */
export function resetAllMocks() {
  jest.resetAllMocks();
  jest.clearAllMocks();
}

/**
 * Setup database mocks for tests
 */
export function setupDatabaseMocks() {
  const mockDatabase = createMockDatabase();
  
  // Create a mock class constructor
  const MockDatabaseClass = jest.fn().mockImplementation(() => mockDatabase) as any;
  MockDatabaseClass.getInstance = jest.fn().mockReturnValue(mockDatabase);
  MockDatabaseClass.resetInstance = jest.fn();
  // Add prototype for class structure tests
  MockDatabaseClass.prototype = {};
  
  // Make the mockDatabase instance appear to be an instance of the mock class
  Object.setPrototypeOf(mockDatabase, MockDatabaseClass.prototype);
  (mockDatabase as any).constructor = MockDatabaseClass;
  
  return {
    Database: MockDatabaseClass,
    db: mockDatabase,
    connectDatabase: jest.fn().mockResolvedValue(undefined)
  };
}

/**
 * Setup Redis mocks for tests
 */
export function setupRedisMocks() {
  const mockRedisClient = createMockRedisClientClass();
  
  // Create a mock class constructor
  const MockRedisClientClass = jest.fn().mockImplementation(() => mockRedisClient) as any;
  MockRedisClientClass.getInstance = jest.fn().mockReturnValue(mockRedisClient);
  MockRedisClientClass.resetInstance = jest.fn();
  // Add prototype for class structure tests
  MockRedisClientClass.prototype = {};
  
  // Make the mockRedisClient instance appear to be an instance of the mock class
  Object.setPrototypeOf(mockRedisClient, MockRedisClientClass.prototype);
  (mockRedisClient as any).constructor = MockRedisClientClass;
  
  return {
    RedisClient: MockRedisClientClass,
    redis: mockRedisClient,
    connectRedis: jest.fn().mockResolvedValue(undefined)
  };
}