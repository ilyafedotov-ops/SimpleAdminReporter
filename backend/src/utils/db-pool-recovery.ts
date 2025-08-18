import { db } from '@/config/database';
import { logger } from '@/utils/logger';

/**
 * Monitor and recover database pool health
 */
export class DatabasePoolRecovery {
  private monitorInterval: NodeJS.Timeout | null = null;
  private recoveryAttempts = 0;
  private readonly MAX_RECOVERY_ATTEMPTS = 3;
  
  /**
   * Start monitoring the database pool
   */
  startMonitoring(intervalMs: number = 5000): void {
    if (this.monitorInterval) {
      return;
    }
    
    this.monitorInterval = setInterval(() => {
      this.checkPoolHealth();
    }, intervalMs);
    
    logger.info('Database pool monitoring started', { intervalMs });
  }
  
  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
      logger.info('Database pool monitoring stopped');
    }
  }
  
  /**
   * Check pool health and attempt recovery if needed
   */
  private async checkPoolHealth(): Promise<void> {
    try {
      const stats = db.getPoolStats();
      
      // Log pool statistics
      if (stats.waitingCount > 0) {
        logger.warn('Database pool has waiting connections', {
          stats,
          recoveryAttempts: this.recoveryAttempts
        });
      }
      
      // Check if pool is exhausted
      const isExhausted = stats.idleCount === 0 && stats.waitingCount > 5;
      
      if (isExhausted && this.recoveryAttempts < this.MAX_RECOVERY_ATTEMPTS) {
        logger.error('Database pool is exhausted, attempting recovery', {
          stats,
          attempt: this.recoveryAttempts + 1
        });
        
        await this.attemptRecovery();
      } else if (!isExhausted && this.recoveryAttempts > 0) {
        // Pool recovered
        logger.info('Database pool recovered', { stats });
        this.recoveryAttempts = 0;
      }
    } catch (error) {
      logger.error('Error in pool health check:', error);
    }
  }
  
  /**
   * Attempt to recover the pool
   */
  private async attemptRecovery(): Promise<void> {
    this.recoveryAttempts++;
    
    try {
      // Try to execute a simple query to test the pool
      await db.query('SELECT 1');
      
      // If successful, the pool might be recovering
      logger.info('Database pool recovery test query successful');
    } catch (error) {
      logger.error('Database pool recovery test query failed:', error);
      
      // If we've hit max attempts, consider more drastic measures
      if (this.recoveryAttempts >= this.MAX_RECOVERY_ATTEMPTS) {
        logger.error('Max recovery attempts reached. Manual intervention may be required.');
        
        // You could implement pool reset here if needed
        // await this.resetPool();
      }
    }
  }
  
  /**
   * Get current pool health status
   */
  getHealthStatus(): {
    healthy: boolean;
    stats: any;
    message: string;
  } {
    const stats = db.getPoolStats();
    const utilization = ((stats.totalCount - stats.idleCount) / stats.totalCount) * 100;
    
    let healthy = true;
    let message = 'Pool is healthy';
    
    if (stats.waitingCount > 0) {
      healthy = false;
      message = `${stats.waitingCount} connections waiting for pool`;
    } else if (utilization > 90) {
      healthy = false;
      message = `Pool utilization critical: ${utilization.toFixed(1)}%`;
    } else if (utilization > 75) {
      message = `Pool utilization high: ${utilization.toFixed(1)}%`;
    }
    
    return {
      healthy,
      stats: {
        ...stats,
        utilization: utilization.toFixed(1) + '%'
      },
      message
    };
  }
}

// Export singleton instance
export const dbPoolRecovery = new DatabasePoolRecovery();