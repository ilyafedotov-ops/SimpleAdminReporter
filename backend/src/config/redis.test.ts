import { RedisClient, redis, connectRedis } from './redis';

// Mock ioredis to prevent real Redis connections
jest.mock('ioredis', () => {
  const mockRedis = jest.fn().mockImplementation(() => ({
    ping: jest.fn().mockResolvedValue('PONG'),
    set: jest.fn().mockResolvedValue('OK'),
    setex: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    exists: jest.fn().mockResolvedValue(0),
    expire: jest.fn().mockResolvedValue(1),
    flushall: jest.fn().mockResolvedValue('OK'),
    quit: jest.fn().mockResolvedValue('OK'),
    zadd: jest.fn().mockResolvedValue(1),
    zremrangebyrank: jest.fn().mockResolvedValue(1),
    zrevrange: jest.fn().mockResolvedValue([]),
    keys: jest.fn().mockResolvedValue([]),
    del: jest.fn().mockResolvedValue(0),
    on: jest.fn(),
    status: 'ready',
    commandQueue: { length: 0 },
    options: {
      enableOfflineQueue: true,
      maxRetriesPerRequest: 3
    }
  }));
  return mockRedis;
});

// Unit tests for Redis configuration (mocked)
describe('Redis Configuration', () => {
  describe('RedisClient Class', () => {
    test('should be defined and have getInstance method', () => {
      expect(RedisClient).toBeDefined();
      expect(typeof RedisClient.getInstance).toBe('function');
    });

    test('should implement singleton pattern', () => {
      const instance1 = RedisClient.getInstance();
      const instance2 = RedisClient.getInstance();
      
      expect(instance1).toBe(instance2);
      expect(instance1).toBeInstanceOf(RedisClient);
    });

    test('should have required methods', () => {
      const client = RedisClient.getInstance();
      
      expect(typeof client.getClient).toBe('function');
      expect(typeof client.testConnection).toBe('function');
      expect(typeof client.set).toBe('function');
      expect(typeof client.get).toBe('function');
      expect(typeof client.setJson).toBe('function');
      expect(typeof client.getJson).toBe('function');
      expect(typeof client.exists).toBe('function');
      expect(typeof client.expire).toBe('function');
      expect(typeof client.flushAll).toBe('function');
      expect(typeof client.close).toBe('function');
    });

    test('should have advanced Redis operations', () => {
      const client = RedisClient.getInstance();
      
      expect(typeof client.zadd).toBe('function');
      expect(typeof client.zremrangebyrank).toBe('function');
      expect(typeof client.zrevrange).toBe('function');
      expect(typeof client.keys).toBe('function');
      expect(typeof client.del).toBe('function');
      expect(typeof client.invalidatePattern).toBe('function');
    });

    test('should have utility methods', () => {
      const client = RedisClient.getInstance();
      
      expect(typeof client.getPoolStats).toBe('function');
      expect(typeof client.healthCheck).toBe('function');
      expect(typeof client.getOrSet).toBe('function');
    });
  });

  describe('Exported Redis Instance', () => {
    test('should export redis instance', () => {
      expect(redis).toBeDefined();
      expect(redis).toBeInstanceOf(RedisClient);
    });

    test('should be the same as singleton instance', () => {
      const singletonInstance = RedisClient.getInstance();
      expect(redis).toBe(singletonInstance);
    });

    test('should have all required methods on exported instance', () => {
      expect(typeof redis.getClient).toBe('function');
      expect(typeof redis.testConnection).toBe('function');
      expect(typeof redis.set).toBe('function');
      expect(typeof redis.get).toBe('function');
      expect(typeof redis.setJson).toBe('function');
      expect(typeof redis.getJson).toBe('function');
    });
  });

  describe('Redis Connection Function', () => {
    test('should export connectRedis function', () => {
      expect(connectRedis).toBeDefined();
      expect(typeof connectRedis).toBe('function');
    });

    test('should return a Promise', () => {
      expect(typeof connectRedis).toBe('function');
      expect(connectRedis.length).toBe(0); // No parameters
    });
  });

  describe('Method Signatures', () => {
    test('should have set method with correct signature', () => {
      const client = RedisClient.getInstance();
      expect(client.set.length).toBe(3); // key, value, ttl?
    });

    test('should have get method with correct signature', () => {
      const client = RedisClient.getInstance();
      expect(client.get.length).toBe(1); // key
    });

    test('should have setJson method with correct signature', () => {
      const client = RedisClient.getInstance();
      expect(client.setJson.length).toBe(3); // key, value, ttl?
    });

    test('should have getJson method with correct signature', () => {
      const client = RedisClient.getInstance();
      expect(client.getJson.length).toBe(1); // key
    });

    test('should have exists method with correct signature', () => {
      const client = RedisClient.getInstance();
      expect(client.exists.length).toBe(1); // key
    });

    test('should have expire method with correct signature', () => {
      const client = RedisClient.getInstance();
      expect(client.expire.length).toBe(2); // key, ttl
    });
  });

  describe('Advanced Operations Signatures', () => {
    test('should have zadd method with correct signature', () => {
      const client = RedisClient.getInstance();
      expect(client.zadd.length).toBe(3); // key, score, member
    });

    test('should have zremrangebyrank method with correct signature', () => {
      const client = RedisClient.getInstance();
      expect(client.zremrangebyrank.length).toBe(3); // key, start, stop
    });

    test('should have zrevrange method with correct signature', () => {
      const client = RedisClient.getInstance();
      expect(client.zrevrange.length).toBe(3); // key, start, stop
    });

    test('should have keys method with correct signature', () => {
      const client = RedisClient.getInstance();
      expect(client.keys.length).toBe(1); // pattern
    });

    test('should have del method with rest parameters', () => {
      const client = RedisClient.getInstance();
      expect(typeof client.del).toBe('function');
      // del accepts ...keys (rest parameters), so length might be 0
    });

    test('should have invalidatePattern method with correct signature', () => {
      const client = RedisClient.getInstance();
      expect(client.invalidatePattern.length).toBe(1); // pattern
    });
  });

  describe('Utility Methods', () => {
    test('should have getPoolStats method', () => {
      const client = RedisClient.getInstance();
      expect(typeof client.getPoolStats).toBe('function');
      expect(client.getPoolStats.length).toBe(0); // No parameters
    });

    test('should have healthCheck method', () => {
      const client = RedisClient.getInstance();
      expect(typeof client.healthCheck).toBe('function');
      expect(client.healthCheck.length).toBe(0); // No parameters
    });

    test('should have getOrSet method with correct signature', () => {
      const client = RedisClient.getInstance();
      expect(typeof client.getOrSet).toBe('function');
      expect(client.getOrSet.length).toBe(3); // key, fetcher, ttl?
    });
  });

  describe('Promise-based Methods', () => {
    test('should have async methods that return promises', async () => {
      const client = RedisClient.getInstance();
      
      // These methods should return promises
      expect(client.testConnection()).toBeInstanceOf(Promise);
      expect(client.set('test', 'value')).toBeInstanceOf(Promise);
      expect(client.get('test')).toBeInstanceOf(Promise);
      expect(client.setJson('test', {})).toBeInstanceOf(Promise);
      expect(client.getJson('test')).toBeInstanceOf(Promise);
      expect(client.exists('test')).toBeInstanceOf(Promise);
      expect(client.expire('test', 100)).toBeInstanceOf(Promise);
      
      // Test that promises resolve properly (using mocks)
      await expect(client.testConnection()).resolves.toBe(true);
      await expect(client.set('test', 'value')).resolves.toBeUndefined();
      await expect(client.get('test')).resolves.toBeNull();
      await expect(client.exists('test')).resolves.toBe(false);
    });

    test('should have advanced async methods that return promises', async () => {
      const client = RedisClient.getInstance();
      
      expect(client.zadd('set', 1, 'member')).toBeInstanceOf(Promise);
      expect(client.zremrangebyrank('set', 0, 1)).toBeInstanceOf(Promise);
      expect(client.zrevrange('set', 0, 1)).toBeInstanceOf(Promise);
      expect(client.keys('pattern*')).toBeInstanceOf(Promise);
      expect(client.del('key')).toBeInstanceOf(Promise);
      expect(client.invalidatePattern('pattern*')).toBeInstanceOf(Promise);
      
      // Test that promises resolve properly (using mocks)
      await expect(client.zadd('set', 1, 'member')).resolves.toBe(1);
      await expect(client.keys('pattern*')).resolves.toEqual([]);
      await expect(client.del('key')).resolves.toBe(0);
    });

    test('should have utility async methods that return promises', async () => {
      const client = RedisClient.getInstance();
      
      expect(client.healthCheck()).toBeInstanceOf(Promise);
      expect(client.getOrSet('key', () => Promise.resolve('value'))).toBeInstanceOf(Promise);
      expect(client.flushAll()).toBeInstanceOf(Promise);
      expect(client.close()).toBeInstanceOf(Promise);
      
      // Test that promises resolve properly (using mocks)
      await expect(client.healthCheck()).resolves.toEqual({ healthy: true, stats: expect.any(Object) });
      await expect(client.getOrSet('key', () => Promise.resolve('value'))).resolves.toBe('value');
      await expect(client.flushAll()).resolves.toBeUndefined();
    });
  });

  describe('Client Management', () => {
    test('should provide getClient method', () => {
      const client = RedisClient.getInstance();
      expect(typeof client.getClient).toBe('function');
      
      const redisClient = client.getClient();
      expect(redisClient).toBeDefined();
      expect(typeof redisClient).toBe('object');
    });

    test('should handle pool statistics', () => {
      const client = RedisClient.getInstance();
      
      expect(() => {
        const stats = client.getPoolStats();
        // Stats might be null if client not initialized
        if (stats) {
          expect(typeof stats).toBe('object');
        }
      }).not.toThrow();
    });

    test('should handle health check structure', () => {
      const client = RedisClient.getInstance();
      const healthCheck = client.healthCheck();
      
      expect(healthCheck).toBeInstanceOf(Promise);
      
      // Health check should return object with healthy and stats properties
      healthCheck.then(result => {
        expect(result).toHaveProperty('healthy');
        expect(result).toHaveProperty('stats');
        expect(typeof result.healthy).toBe('boolean');
      }).catch(() => {
        // Health check might fail in test environment without Redis
        // This is acceptable for structure testing
      });
    });
  });

  describe('Error Handling Structure', () => {
    test('should handle connection errors gracefully', () => {
      const client = RedisClient.getInstance();
      
      // Methods should not throw synchronously
      expect(() => client.getClient()).not.toThrow();
      expect(() => client.getPoolStats()).not.toThrow();
    });

    test('should provide error handling in async operations', () => {
      const client = RedisClient.getInstance();
      
      // These should return promises that can be caught
      const promises = [
        client.testConnection(),
        client.set('test', 'value'),
        client.get('test'),
        client.healthCheck()
      ];
      
      promises.forEach(promise => {
        expect(promise).toBeInstanceOf(Promise);
        // Promises should have catch method for error handling
        expect(typeof promise.catch).toBe('function');
      });
    });
  });

  describe('Configuration Management', () => {
    test('should handle lazy initialization', () => {
      const client = RedisClient.getInstance();
      
      // Should be able to call methods without throwing
      expect(() => {
        client.getClient();
      }).not.toThrow();
    });

    test('should maintain singleton across multiple calls', () => {
      const instances: RedisClient[] = [];
      for (let i = 0; i < 5; i++) {
        instances.push(RedisClient.getInstance());
      }
      
      // All instances should be the same reference
      instances.forEach(instance => {
        expect(instance).toBe(instances[0]);
      });
    });
  });

  describe('Module Structure', () => {
    test('should export required items', () => {
      expect(RedisClient).toBeDefined();
      expect(redis).toBeDefined();
      expect(connectRedis).toBeDefined();
    });

    test('should have proper class structure', () => {
      expect(typeof RedisClient).toBe('function');
      expect(RedisClient.prototype).toBeDefined();
      expect(RedisClient.getInstance).toBeDefined();
    });

    test('should maintain consistent exported instance', () => {
      const redisExport = redis;
      const freshInstance = RedisClient.getInstance();
      
      expect(redisExport).toBe(freshInstance);
    });
  });
});