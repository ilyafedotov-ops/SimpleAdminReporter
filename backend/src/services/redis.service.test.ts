import { redisClient } from './redis.service';
import { redis } from '@/config/redis';

// Mock the Redis configuration
jest.mock('@/config/redis', () => ({
  redis: {
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    expire: jest.fn(),
    setJson: jest.fn(),
    getJson: jest.fn(),
    ping: jest.fn(),
    testConnection: jest.fn(),
    healthCheck: jest.fn(),
    close: jest.fn(),
    flushAll: jest.fn(),
    getClient: jest.fn(),
    getOrSet: jest.fn(),
    invalidatePattern: jest.fn(),
    zadd: jest.fn(),
    zremrangebyrank: jest.fn(),
    zrevrange: jest.fn(),
    keys: jest.fn(),
    getPoolStats: jest.fn()
  }
}));

// Mock logger
jest.mock('@/utils/logger');

describe('Redis Service', () => {
  const mockRedis = redis as jest.Mocked<typeof redis>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('setex', () => {
    it('should set a key with expiration time', async () => {
      const key = 'test:key';
      const seconds = 3600;
      const value = 'test value';

      mockRedis.set.mockResolvedValueOnce(undefined);

      await redisClient.setex(key, seconds, value);

      expect(mockRedis.set).toHaveBeenCalledWith(key, value, seconds);
    });

    it('should handle errors during setex operation', async () => {
      const key = 'test:key';
      const seconds = 3600;
      const value = 'test value';
      const error = new Error('Redis connection failed');

      mockRedis.set.mockRejectedValueOnce(error);

      await expect(redisClient.setex(key, seconds, value)).rejects.toThrow(error);
    });
  });

  describe('get', () => {
    it('should get a value by key', async () => {
      const key = 'test:key';
      const expectedValue = 'test value';

      mockRedis.get.mockResolvedValueOnce(expectedValue);

      const result = await redisClient.get(key);

      expect(result).toBe(expectedValue);
      expect(mockRedis.get).toHaveBeenCalledWith(key);
    });

    it('should return null when key does not exist', async () => {
      const key = 'nonexistent:key';

      mockRedis.get.mockResolvedValueOnce(null);

      const result = await redisClient.get(key);

      expect(result).toBeNull();
      expect(mockRedis.get).toHaveBeenCalledWith(key);
    });

    it('should handle errors during get operation', async () => {
      const key = 'test:key';
      const error = new Error('Redis connection failed');

      mockRedis.get.mockRejectedValueOnce(error);

      await expect(redisClient.get(key)).rejects.toThrow(error);
    });
  });

  describe('del', () => {
    it('should delete a key and return number of deleted keys', async () => {
      const key = 'test:key';
      const expectedCount = 1;

      mockRedis.del.mockResolvedValueOnce(expectedCount);

      const result = await redisClient.del(key);

      expect(result).toBe(expectedCount);
      expect(mockRedis.del).toHaveBeenCalledWith(key);
    });

    it('should return 0 when key does not exist', async () => {
      const key = 'nonexistent:key';
      const expectedCount = 0;

      mockRedis.del.mockResolvedValueOnce(expectedCount);

      const result = await redisClient.del(key);

      expect(result).toBe(expectedCount);
      expect(mockRedis.del).toHaveBeenCalledWith(key);
    });

    it('should handle errors during del operation', async () => {
      const key = 'test:key';
      const error = new Error('Redis connection failed');

      mockRedis.del.mockRejectedValueOnce(error);

      await expect(redisClient.del(key)).rejects.toThrow(error);
    });
  });

  describe('exists', () => {
    it('should return true when key exists', async () => {
      const key = 'test:key';

      mockRedis.exists.mockResolvedValueOnce(true);

      const result = await redisClient.exists(key);

      expect(result).toBe(true);
      expect(mockRedis.exists).toHaveBeenCalledWith(key);
    });

    it('should return false when key does not exist', async () => {
      const key = 'nonexistent:key';

      mockRedis.exists.mockResolvedValueOnce(false);

      const result = await redisClient.exists(key);

      expect(result).toBe(false);
      expect(mockRedis.exists).toHaveBeenCalledWith(key);
    });

    it('should handle errors during exists operation', async () => {
      const key = 'test:key';
      const error = new Error('Redis connection failed');

      mockRedis.exists.mockRejectedValueOnce(error);

      await expect(redisClient.exists(key)).rejects.toThrow(error);
    });
  });

  describe('expire', () => {
    it('should set expiration time and return true when successful', async () => {
      const key = 'test:key';
      const seconds = 3600;

      mockRedis.expire.mockResolvedValueOnce(true);

      const result = await redisClient.expire(key, seconds);

      expect(result).toBe(true);
      expect(mockRedis.expire).toHaveBeenCalledWith(key, seconds);
    });

    it('should return false when key does not exist', async () => {
      const key = 'nonexistent:key';
      const seconds = 3600;

      mockRedis.expire.mockResolvedValueOnce(false);

      const result = await redisClient.expire(key, seconds);

      expect(result).toBe(false);
      expect(mockRedis.expire).toHaveBeenCalledWith(key, seconds);
    });

    it('should handle errors during expire operation', async () => {
      const key = 'test:key';
      const seconds = 3600;
      const error = new Error('Redis connection failed');

      mockRedis.expire.mockRejectedValueOnce(error);

      await expect(redisClient.expire(key, seconds)).rejects.toThrow(error);
    });
  });

  describe('setJson', () => {
    it('should set JSON value without TTL', async () => {
      const key = 'test:json:key';
      const value = { id: 1, name: 'test', data: [1, 2, 3] };

      mockRedis.setJson.mockResolvedValueOnce(undefined);

      await redisClient.setJson(key, value);

      expect(mockRedis.setJson).toHaveBeenCalledWith(key, value, undefined);
    });

    it('should set JSON value with TTL', async () => {
      const key = 'test:json:key';
      const value = { id: 1, name: 'test', data: [1, 2, 3] };
      const ttl = 3600;

      mockRedis.setJson.mockResolvedValueOnce(undefined);

      await redisClient.setJson(key, value, ttl);

      expect(mockRedis.setJson).toHaveBeenCalledWith(key, value, ttl);
    });

    it('should handle complex nested objects', async () => {
      const key = 'test:complex:key';
      const value = {
        user: {
          id: 1,
          profile: {
            name: 'John Doe',
            settings: {
              theme: 'dark',
              notifications: true
            }
          }
        },
        metadata: {
          created: new Date('2025-01-01'),
          tags: ['tag1', 'tag2']
        }
      };

      mockRedis.setJson.mockResolvedValueOnce(undefined);

      await redisClient.setJson(key, value);

      expect(mockRedis.setJson).toHaveBeenCalledWith(key, value, undefined);
    });

    it('should handle errors during setJson operation', async () => {
      const key = 'test:json:key';
      const value = { id: 1, name: 'test' };
      const error = new Error('Redis connection failed');

      mockRedis.setJson.mockRejectedValueOnce(error);

      await expect(redisClient.setJson(key, value)).rejects.toThrow(error);
    });
  });

  describe('getJson', () => {
    it('should get and parse JSON value', async () => {
      const key = 'test:json:key';
      const expectedValue = { id: 1, name: 'test', data: [1, 2, 3] };

      mockRedis.getJson.mockResolvedValueOnce(expectedValue);

      const result = await redisClient.getJson<typeof expectedValue>(key);

      expect(result).toEqual(expectedValue);
      expect(mockRedis.getJson).toHaveBeenCalledWith(key);
    });

    it('should return null when key does not exist', async () => {
      const key = 'nonexistent:json:key';

      mockRedis.getJson.mockResolvedValueOnce(null);

      const result = await redisClient.getJson(key);

      expect(result).toBeNull();
      expect(mockRedis.getJson).toHaveBeenCalledWith(key);
    });

    it('should handle complex nested objects with proper typing', async () => {
      const key = 'test:complex:key';
      interface ComplexObject {
        user: {
          id: number;
          profile: {
            name: string;
            settings: {
              theme: string;
              notifications: boolean;
            };
          };
        };
        metadata: {
          created: string;
          tags: string[];
        };
      }

      const expectedValue: ComplexObject = {
        user: {
          id: 1,
          profile: {
            name: 'John Doe',
            settings: {
              theme: 'dark',
              notifications: true
            }
          }
        },
        metadata: {
          created: '2025-01-01T00:00:00.000Z',
          tags: ['tag1', 'tag2']
        }
      };

      mockRedis.getJson.mockResolvedValueOnce(expectedValue);

      const result = await redisClient.getJson<ComplexObject>(key);

      expect(result).toEqual(expectedValue);
      expect(result?.user.profile.name).toBe('John Doe');
      expect(result?.metadata.tags).toHaveLength(2);
    });

    it('should handle errors during getJson operation', async () => {
      const key = 'test:json:key';
      const error = new Error('Redis connection failed');

      mockRedis.getJson.mockRejectedValueOnce(error);

      await expect(redisClient.getJson(key)).rejects.toThrow(error);
    });
  });

  describe('Integration scenarios', () => {
    it('should handle complete cache workflow', async () => {
      const key = 'cache:workflow:test';
      const data = { userId: 123, preferences: { theme: 'dark' } };
      const ttl = 1800;

      // Set JSON data
      mockRedis.setJson.mockResolvedValueOnce(undefined);
      await redisClient.setJson(key, data, ttl);

      // Check if exists
      mockRedis.exists.mockResolvedValueOnce(true);
      const exists = await redisClient.exists(key);

      // Get JSON data
      mockRedis.getJson.mockResolvedValueOnce(data);
      const retrieved = await redisClient.getJson(key);

      // Update expiration
      mockRedis.expire.mockResolvedValueOnce(true);
      const expired = await redisClient.expire(key, 3600);

      // Delete
      mockRedis.del.mockResolvedValueOnce(1);
      const deleted = await redisClient.del(key);

      expect(mockRedis.setJson).toHaveBeenCalledWith(key, data, ttl);
      expect(exists).toBe(true);
      expect(retrieved).toEqual(data);
      expect(expired).toBe(true);
      expect(deleted).toBe(1);
    });

    it('should handle error recovery scenarios', async () => {
      const key = 'error:recovery:test';
      const value = 'test value';

      // First call fails
      mockRedis.set.mockRejectedValueOnce(new Error('Connection timeout'));
      
      // Second call succeeds
      mockRedis.set.mockResolvedValueOnce(undefined);

      // First attempt should throw
      await expect(redisClient.setex(key, 3600, value)).rejects.toThrow('Connection timeout');

      // Second attempt should succeed
      await expect(redisClient.setex(key, 3600, value)).resolves.toBeUndefined();
    });

    it('should handle concurrent operations', async () => {
      const keys = ['concurrent:1', 'concurrent:2', 'concurrent:3'];
      const values = ['value1', 'value2', 'value3'];

      // Mock all operations to resolve
      mockRedis.set.mockResolvedValue(undefined);
      mockRedis.get.mockImplementation((key: string) => {
        const index = keys.indexOf(key);
        return Promise.resolve(index !== -1 ? values[index] : null);
      });

      // Perform concurrent set operations
      const setPromises = keys.map((key, index) => 
        redisClient.setex(key, 3600, values[index])
      );
      await Promise.all(setPromises);

      // Perform concurrent get operations
      const getPromises = keys.map(key => redisClient.get(key));
      const results = await Promise.all(getPromises);

      expect(results).toEqual(values);
      expect(mockRedis.set).toHaveBeenCalledTimes(3);
      expect(mockRedis.get).toHaveBeenCalledTimes(3);
    });

    it('should handle bulk operations with mixed results', async () => {
      const existingKey = 'bulk:existing';
      const nonExistentKey = 'bulk:nonexistent';

      // Mock mixed responses
      mockRedis.exists.mockImplementation((key: string) => {
        return Promise.resolve(key === existingKey);
      });

      mockRedis.get.mockImplementation((key: string) => {
        return Promise.resolve(key === existingKey ? 'existing value' : null);
      });

      mockRedis.del.mockImplementation((key: string) => {
        return Promise.resolve(key === existingKey ? 1 : 0);
      });

      // Test bulk existence check
      const [existsResult1, existsResult2] = await Promise.all([
        redisClient.exists(existingKey),
        redisClient.exists(nonExistentKey)
      ]);

      // Test bulk get
      const [getValue1, getValue2] = await Promise.all([
        redisClient.get(existingKey),
        redisClient.get(nonExistentKey)
      ]);

      // Test bulk delete
      const [delResult1, delResult2] = await Promise.all([
        redisClient.del(existingKey),
        redisClient.del(nonExistentKey)
      ]);

      expect(existsResult1).toBe(true);
      expect(existsResult2).toBe(false);
      expect(getValue1).toBe('existing value');
      expect(getValue2).toBeNull();
      expect(delResult1).toBe(1);
      expect(delResult2).toBe(0);
    });
  });

  describe('Data type handling', () => {
    it('should handle string values correctly', async () => {
      const key = 'string:test';
      const value = 'simple string value';

      mockRedis.set.mockResolvedValueOnce(undefined);
      mockRedis.get.mockResolvedValueOnce(value);

      await redisClient.setex(key, 3600, value);
      const result = await redisClient.get(key);

      expect(result).toBe(value);
    });

    it('should handle empty strings', async () => {
      const key = 'empty:string';
      const value = '';

      mockRedis.set.mockResolvedValueOnce(undefined);
      mockRedis.get.mockResolvedValueOnce(value);

      await redisClient.setex(key, 3600, value);
      const result = await redisClient.get(key);

      expect(result).toBe('');
    });

    it('should handle special characters and Unicode', async () => {
      const key = 'unicode:test';
      const value = 'Special chars: àáâãäåæçèéêë 中文 🎉 emoji';

      mockRedis.set.mockResolvedValueOnce(undefined);
      mockRedis.get.mockResolvedValueOnce(value);

      await redisClient.setex(key, 3600, value);
      const result = await redisClient.get(key);

      expect(result).toBe(value);
    });

    it('should handle large JSON objects', async () => {
      const key = 'large:json';
      const largeObject = {
        users: Array.from({ length: 100 }, (_, i) => ({
          id: i + 1,
          name: `User ${i + 1}`,
          email: `user${i + 1}@example.com`,
          metadata: {
            created: new Date().toISOString(),
            active: i % 2 === 0,
            permissions: [`permission_${i % 5}`, `role_${i % 3}`]
          }
        })),
        summary: {
          total: 100,
          active: 50,
          lastUpdated: new Date().toISOString()
        }
      };

      mockRedis.setJson.mockResolvedValueOnce(undefined);
      mockRedis.getJson.mockResolvedValueOnce(largeObject);

      await redisClient.setJson(key, largeObject, 7200);
      const result = await redisClient.getJson(key);

      expect(result).toEqual(largeObject);
      expect((result as any)?.users).toHaveLength(100);
      expect((result as any)?.summary.total).toBe(100);
    });

    it('should handle null and undefined values in JSON', async () => {
      const key = 'null:values';
      const objectWithNulls = {
        definedValue: 'exists',
        nullValue: null,
        undefinedValue: undefined,
        nestedObject: {
          value: 'nested',
          nullNested: null
        }
      };

      mockRedis.setJson.mockResolvedValueOnce(undefined);
      mockRedis.getJson.mockResolvedValueOnce({
        definedValue: 'exists',
        nullValue: null,
        // undefined values are typically removed during JSON serialization
        nestedObject: {
          value: 'nested',
          nullNested: null
        }
      });

      await redisClient.setJson(key, objectWithNulls);
      const result = await redisClient.getJson(key);

      expect(result).toBeDefined();
      expect((result as any)?.definedValue).toBe('exists');
      expect((result as any)?.nullValue).toBeNull();
      expect((result as any)?.undefinedValue).toBeUndefined();
      expect((result as any)?.nestedObject.nullNested).toBeNull();
    });
  });

  describe('Edge cases and error conditions', () => {
    it('should handle very short TTL values', async () => {
      const key = 'short:ttl';
      const value = 'expires quickly';
      const shortTtl = 1; // 1 second

      mockRedis.set.mockResolvedValueOnce(undefined);

      await redisClient.setex(key, shortTtl, value);

      expect(mockRedis.set).toHaveBeenCalledWith(key, value, shortTtl);
    });

    it('should handle very long TTL values', async () => {
      const key = 'long:ttl';
      const value = 'expires in far future';
      const longTtl = 2147483647; // Max 32-bit signed integer

      mockRedis.set.mockResolvedValueOnce(undefined);

      await redisClient.setex(key, longTtl, value);

      expect(mockRedis.set).toHaveBeenCalledWith(key, value, longTtl);
    });

    it('should handle zero TTL', async () => {
      const key = 'zero:ttl';
      const value = 'no expiration';
      const zeroTtl = 0;

      mockRedis.set.mockResolvedValueOnce(undefined);

      await redisClient.setex(key, zeroTtl, value);

      expect(mockRedis.set).toHaveBeenCalledWith(key, value, zeroTtl);
    });

    it('should handle long key names', async () => {
      const longKey = 'very:long:key:name:that:exceeds:normal:length:'.repeat(10);
      const value = 'test value';

      mockRedis.set.mockResolvedValueOnce(undefined);
      mockRedis.get.mockResolvedValueOnce(value);

      await redisClient.setex(longKey, 3600, value);
      const result = await redisClient.get(longKey);

      expect(result).toBe(value);
      expect(mockRedis.set).toHaveBeenCalledWith(longKey, value, 3600);
    });

    it('should handle rapid successive operations on same key', async () => {
      const key = 'rapid:operations';
      const values = ['value1', 'value2', 'value3', 'value4', 'value5'];

      mockRedis.set.mockResolvedValue(undefined);

      // Rapid successive sets
      const promises = values.map((value, index) => 
        redisClient.setex(key, 3600, `${value}-${index}`)
      );

      await Promise.all(promises);

      expect(mockRedis.set).toHaveBeenCalledTimes(5);
    });

    it('should maintain operation isolation under concurrent access', async () => {
      const baseKey = 'concurrent:isolation';
      const operations = Array.from({ length: 20 }, (_, i) => ({
        key: `${baseKey}:${i}`,
        value: `value-${i}`,
        ttl: 3600 + i
      }));

      mockRedis.set.mockResolvedValue(undefined);
      mockRedis.get.mockImplementation((key: string) => {
        const op = operations.find(o => o.key === key);
        return Promise.resolve(op ? op.value : null);
      });
      mockRedis.exists.mockResolvedValue(true);
      mockRedis.del.mockResolvedValue(1);

      // Perform mixed concurrent operations
      const mixedPromises = operations.flatMap(op => [
        redisClient.setex(op.key, op.ttl, op.value),
        redisClient.get(op.key),
        redisClient.exists(op.key),
        redisClient.del(op.key)
      ]);

      const results = await Promise.all(mixedPromises);

      // Should complete without errors
      expect(results).toHaveLength(80); // 4 operations × 20 items
      expect(mockRedis.set).toHaveBeenCalledTimes(20);
      expect(mockRedis.get).toHaveBeenCalledTimes(20);
      expect(mockRedis.exists).toHaveBeenCalledTimes(20);
      expect(mockRedis.del).toHaveBeenCalledTimes(20);
    });
  });
});