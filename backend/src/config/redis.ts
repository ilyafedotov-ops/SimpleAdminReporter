import Redis from 'ioredis';
import { logger } from '@/utils/logger';

export class RedisClient {
  private static instance: RedisClient;
  private client: Redis | null = null;
  private initialized = false;

  private constructor() {
    // Don't initialize the client during construction - only when actually needed
  }

  private ensureInitialized(): void {
    if (this.initialized && this.client) {
      return;
    }

    // Parse Redis connection details from URL or individual env vars
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const redisHost = process.env.REDIS_HOST || 'redis';
    const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10) || 6379;
    const redisPassword = process.env.REDIS_PASSWORD || undefined;
    const redisDB = parseInt(process.env.REDIS_DB || '0');
    
    logger.debug(`Redis connection config - URL: ${redisUrl}, Host: ${redisHost}, Port: ${redisPort}`);
    
    // Connection pool configuration
    const poolConfig = {
      // Connection pool settings
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        logger.debug(`Redis retry attempt ${times}, delay: ${delay}ms`);
        return delay;
      },
      reconnectOnError: (err: Error) => {
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
          // Only reconnect when the error contains "READONLY"
          logger.warn('Redis READONLY error, reconnecting...');
          return true;
        }
        return false;
      },
      
      // Connection settings
      lazyConnect: true,
      keepAlive: 30000,
      connectTimeout: 10000,
      commandTimeout: 5000,
      family: 4, // Use IPv4
      
      // Connection pool size
      enableOfflineQueue: true,
      enableReadyCheck: true,
      
      // Health check
      healthCheckInterval: 30000, // Health check every 30 seconds
    };
    
    // Use host/port/password if available, otherwise parse URL
    if (process.env.REDIS_HOST) {
      this.client = new Redis({
        host: redisHost,
        port: redisPort,
        password: redisPassword,
        db: redisDB,
        ...poolConfig
      });
    } else {
      this.client = new Redis(redisUrl, poolConfig);
    }

    // Event handlers
    this.client.on('connect', () => {
      logger.info('Redis client connected');
    });

    this.client.on('ready', () => {
      logger.info('Redis client ready');
    });

    this.client.on('error', (error) => {
      logger.error('Redis client error:', error);
    });

    this.client.on('close', () => {
      logger.warn('Redis client connection closed');
    });

    this.client.on('reconnecting', (time: number) => {
      logger.info(`Redis client reconnecting in ${time}ms`);
    });

    this.client.on('end', () => {
      logger.warn('Redis client connection ended');
    });

    this.initialized = true;
  }

  public static getInstance(): RedisClient {
    if (!RedisClient.instance) {
      RedisClient.instance = new RedisClient();
    }
    return RedisClient.instance;
  }
  
  // Method for testing to reset singleton instance
  public static resetInstance(): void {
    if (process.env.NODE_ENV === 'test' && RedisClient.instance) {
      RedisClient.instance = null as any;
    }
  }

  public getClient(): Redis {
    this.ensureInitialized();
    return this.client!;
  }

  public async testConnection(): Promise<boolean> {
    try {
      this.ensureInitialized();
      const result = await this.client!.ping();
      logger.info('Redis connection test successful:', result);
      return result === 'PONG';
    } catch (error) {
      logger.error('Redis connection test failed:', error);
      return false;
    }
  }

  public async set(key: string, value: string, ttl?: number): Promise<void> {
    try {
      this.ensureInitialized();
      if (ttl) {
        await this.client!.setex(key, ttl, value);
      } else {
        await this.client!.set(key, value);
      }
    } catch (error) {
      logger.error('Redis SET error:', { key, error: (error as Error).message });
      throw error;
    }
  }

  public async get(key: string): Promise<string | null> {
    try {
      this.ensureInitialized();
      return await this.client!.get(key);
    } catch (error) {
      logger.error('Redis GET error:', { key, error: (error as Error).message });
      throw error;
    }
  }


  public async setJson(key: string, value: any, ttl?: number): Promise<void> {
    const jsonValue = JSON.stringify(value);
    await this.set(key, jsonValue, ttl);
  }

  public async getJson<T>(key: string): Promise<T | null> {
    const value = await this.get(key);
    if (!value) return null;
    
    try {
      return JSON.parse(value) as T;
    } catch (error) {
      logger.error('Redis JSON parse error:', { key, error: (error as Error).message });
      return null;
    }
  }

  public async exists(key: string): Promise<boolean> {
    try {
      this.ensureInitialized();
      const result = await this.client!.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Redis EXISTS error:', { key, error: (error as Error).message });
      throw error;
    }
  }

  public async expire(key: string, ttl: number): Promise<boolean> {
    try {
      this.ensureInitialized();
      const result = await this.client!.expire(key, ttl);
      return result === 1;
    } catch (error) {
      logger.error('Redis EXPIRE error:', { key, ttl, error: (error as Error).message });
      throw error;
    }
  }

  public async flushAll(): Promise<void> {
    try {
      this.ensureInitialized();
      await this.client!.flushall();
      logger.info('Redis cache cleared');
    } catch (error) {
      logger.error('Redis FLUSHALL error:', error);
      throw error;
    }
  }

  public async close(): Promise<void> {
    try {
      this.ensureInitialized();
      await this.client!.quit();
      logger.info('Redis client closed');
    } catch (error) {
      logger.error('Error closing Redis client:', error);
      throw error;
    }
  }

  /**
   * Get connection pool statistics
   */
  public getPoolStats(): any {
    if (!this.client) {
      return null;
    }

    return {
      status: this.client.status,
      commandQueue: this.client.commandQueue?.length || 0,
      // offlineQueue is private, using alternative approach
      options: {
        enableOfflineQueue: this.client.options?.enableOfflineQueue,
        maxRetriesPerRequest: this.client.options?.maxRetriesPerRequest,
      }
    };
  }

  /**
   * Health check with connection pooling
   */
  public async healthCheck(): Promise<{ healthy: boolean; stats: any }> {
    try {
      const pingResult = await this.testConnection();
      const stats = this.getPoolStats();
      
      return {
        healthy: pingResult,
        stats
      };
    } catch (error) {
      logger.error('Redis health check failed:', error);
      return {
        healthy: false,
        stats: this.getPoolStats()
      };
    }
  }

  // Cache pattern helpers
  public async getOrSet<T>(
    key: string, 
    fetcher: () => Promise<T>, 
    ttl: number = 3600
  ): Promise<T> {
    const cached = await this.getJson<T>(key);
    if (cached !== null) {
      return cached;
    }

    const fresh = await fetcher();
    await this.setJson(key, fresh, ttl);
    return fresh;
  }

  public async invalidatePattern(pattern: string): Promise<number> {
    try {
      this.ensureInitialized();
      const keys = await this.client!.keys(pattern);
      if (keys.length === 0) return 0;
      
      const deleted = await this.client!.del(...keys);
      // Only log if entries were actually deleted - skip logging when 0
      if (deleted > 0) {
        logger.info(`Invalidated ${deleted} cache entries matching pattern: ${pattern}`);
      }
      // No logging at all when 0 entries are deleted
      return deleted;
    } catch (error) {
      logger.error('Redis pattern invalidation error:', { pattern, error: (error as Error).message });
      throw error;
    }
  }

  // Additional Redis operations for query metrics
  public async zadd(key: string, score: number, member: string): Promise<number> {
    try {
      this.ensureInitialized();
      return await this.client!.zadd(key, score, member);
    } catch (error) {
      logger.error('Redis ZADD error:', { key, error: (error as Error).message });
      throw error;
    }
  }

  public async zremrangebyrank(key: string, start: number, stop: number): Promise<number> {
    try {
      this.ensureInitialized();
      return await this.client!.zremrangebyrank(key, start, stop);
    } catch (error) {
      logger.error('Redis ZREMRANGEBYRANK error:', { key, error: (error as Error).message });
      throw error;
    }
  }

  public async zrevrange(key: string, start: number, stop: number): Promise<string[]> {
    try {
      this.ensureInitialized();
      return await this.client!.zrevrange(key, start, stop);
    } catch (error) {
      logger.error('Redis ZREVRANGE error:', { key, error: (error as Error).message });
      throw error;
    }
  }

  public async keys(pattern: string): Promise<string[]> {
    try {
      this.ensureInitialized();
      return await this.client!.keys(pattern);
    } catch (error) {
      logger.error('Redis KEYS error:', { pattern, error: (error as Error).message });
      throw error;
    }
  }

  public async del(...keys: string[]): Promise<number> {
    try {
      this.ensureInitialized();
      if (keys.length === 0) return 0;
      return await this.client!.del(...keys);
    } catch (error) {
      logger.error('Redis DEL error:', { keys, error: (error as Error).message });
      throw error;
    }
  }
}

// Export singleton instance
export const redis = RedisClient.getInstance();

// Connection function for app initialization
export const connectRedis = async (): Promise<void> => {
  try {
    const connected = await redis.testConnection();
    if (!connected) {
      throw new Error('Failed to connect to Redis');
    }
    logger.info('Redis connected successfully');
  } catch (error) {
    logger.error('Redis connection failed:', error);
    throw error;
  }
};