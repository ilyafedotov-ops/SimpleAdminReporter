import { redis } from '@/config/redis';

// Export the Redis client instance for use in services
export const redisClient = {
  async setex(key: string, seconds: number, value: string): Promise<void> {
    await redis.set(key, value, seconds);
  },
  
  async get(key: string): Promise<string | null> {
    return await redis.get(key);
  },
  
  async del(key: string): Promise<number> {
    return await redis.del(key);
  },
  
  async exists(key: string): Promise<boolean> {
    return await redis.exists(key);
  },
  
  async expire(key: string, seconds: number): Promise<boolean> {
    return await redis.expire(key, seconds);
  },
  
  async setJson(key: string, value: any, ttl?: number): Promise<void> {
    await redis.setJson(key, value, ttl);
  },
  
  async getJson<T>(key: string): Promise<T | null> {
    return await redis.getJson<T>(key);
  }
};