import { Request, Response, NextFunction } from 'express';
import { db } from '@/config/database';
import { logger } from '@/utils/logger';

/**
 * Middleware to monitor database connection pool health
 */
export const dbPoolMonitor = (req: Request, res: Response, next: NextFunction): void => {
  // Log pool statistics before handling request
  const poolStats = db.getPoolStats();
  
  // Warn if pool is getting exhausted
  if (poolStats.idleCount === 0 && poolStats.waitingCount > 0) {
    logger.warn('Database connection pool exhausted', {
      poolStats,
      endpoint: req.path,
      method: req.method
    });
  }
  
  // Add pool stats to response headers for debugging
  res.setHeader('X-DB-Pool-Total', poolStats.totalCount.toString());
  res.setHeader('X-DB-Pool-Idle', poolStats.idleCount.toString());
  res.setHeader('X-DB-Pool-Waiting', poolStats.waitingCount.toString());
  
  next();
};

/**
 * Middleware to ensure database connections are released on response end
 */
export const ensureDbCleanup = (req: Request, res: Response, next: NextFunction): void => {
  // Store original end method
  const originalEnd = res.end;
  
  // Override end method to log pool stats
  res.end = function(...args: any[]): any {
    const poolStats = db.getPoolStats();
    
    // Log if there are waiting connections after request completes
    if (poolStats.waitingCount > 0) {
      logger.warn('Database connections waiting after request completion', {
        poolStats,
        endpoint: req.path,
        statusCode: res.statusCode
      });
    }
    
    // Call original end method
    return originalEnd.apply(res, args as any);
  };
  
  next();
};