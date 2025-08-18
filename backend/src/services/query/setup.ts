import { QueryService } from './QueryService';
import { db } from '@/config/database';
import { redis } from '@/config/redis';
import { logger } from '@/utils/logger';

/**
 * Initialize the Query Service with database and Redis connections
 */
export async function initializeQueryService(): Promise<QueryService> {
  try {
    // Test database connection
    const dbConnected = await db.testConnection();
    if (!dbConnected) {
      throw new Error('Database connection failed');
    }
    
    // Test Redis connection (optional)
    let redisClient = null;
    try {
      const redisConnected = await redis.testConnection();
      if (redisConnected) {
        redisClient = redis.getClient();
        logger.info('Query service initialized with Redis caching enabled');
      } else {
        logger.warn('Redis connection failed - caching disabled');
      }
    } catch (error) {
      logger.warn('Redis not available - caching disabled:', error);
    }
    
    // Initialize QueryService
    const queryService = QueryService.getInstance(db.getPool(), redisClient);
    
    logger.info('Query service initialized successfully', {
      database: dbConnected,
      redis: !!redisClient
    });
    
    return queryService;
    
  } catch (error) {
    logger.error('Failed to initialize query service:', error);
    throw error;
  }
}

/**
 * Create query service instance (for use in controllers)
 */
export function createQueryService(): QueryService {
  try {
    // Try to get Redis client, but don't fail if not available
    let redisClient = null;
    try {
      redisClient = redis.getClient();
    } catch {
      logger.debug('Redis not available for query service');
    }
    
    return QueryService.getInstance(db.getPool(), redisClient);
  } catch (error) {
    logger.error('Failed to create query service:', error);
    throw error;
  }
}