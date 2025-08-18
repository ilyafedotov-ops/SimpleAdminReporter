import { db } from '@/config/database';
import { redis } from '@/config/redis';
import { logger } from '@/utils/logger';

export interface FailedLoginAttempt {
  username: string;
  ipAddress: string;
  userAgent?: string;
  authSource?: string;
  errorType: 'invalid_credentials' | 'account_locked' | 'user_not_found' | 'user_inactive' | 'service_error';
}

export interface LockoutInfo {
  isLocked: boolean;
  lockoutExpiresAt?: Date;
  lockoutReason?: string;
  failedAttempts?: number;
}

export class FailedLoginTracker {
  private static instance: FailedLoginTracker;
  
  // Configuration
  private readonly MAX_ATTEMPTS = 5;
  private readonly ATTEMPT_WINDOW_MINUTES = 15;
  private readonly LOCKOUT_DURATIONS_MINUTES = [15, 30, 60]; // Progressive lockout
  private readonly REDIS_KEY_PREFIX = 'failed_login:';
  private readonly REDIS_LOCKOUT_PREFIX = 'lockout:';
  
  private constructor() {}

  public static getInstance(): FailedLoginTracker {
    if (!FailedLoginTracker.instance) {
      FailedLoginTracker.instance = new FailedLoginTracker();
    }
    return FailedLoginTracker.instance;
  }

  /**
   * Record a failed login attempt
   */
  async recordFailedAttempt(attempt: FailedLoginAttempt): Promise<LockoutInfo> {
    try {
      const { username, ipAddress, userAgent, authSource, errorType } = attempt;
      
      // Record in database
      await db.query(
        `INSERT INTO failed_login_attempts 
         (username, ip_address, user_agent, auth_source, error_type)
         VALUES ($1, $2, $3, $4, $5)`,
        [username, ipAddress, userAgent, authSource, errorType]
      );

      // Check current failed attempts count
      const attemptCount = await this.getFailedAttemptCount(username, ipAddress);
      
      logger.warn('Failed login attempt recorded', {
        username,
        ipAddress,
        errorType,
        attemptCount,
        maxAttempts: this.MAX_ATTEMPTS
      });

      // Check if we need to lock the account
      if (attemptCount >= this.MAX_ATTEMPTS) {
        return await this.lockAccount(username, ipAddress, attemptCount);
      }

      // Update Redis counter for real-time tracking
      await this.updateRedisCounter(username, ipAddress);

      return {
        isLocked: false,
        failedAttempts: attemptCount
      };

    } catch (error) {
      logger.error('Error recording failed login attempt:', error);
      throw error;
    }
  }

  /**
   * Check if an account is currently locked
   */
  async checkLockoutStatus(username: string, ipAddress?: string): Promise<LockoutInfo> {
    try {
      // Check Redis cache first for performance
      const cachedLockout = await this.getCachedLockout(username, ipAddress);
      if (cachedLockout) {
        return cachedLockout;
      }

      // Check database
      const result = await db.query(
        `SELECT is_locked, lockout_expires_at, lockout_reason 
         FROM is_account_locked($1, $2)`,
        [username, ipAddress]
      );

      if (result.rows.length > 0 && result.rows[0].is_locked) {
        const lockoutInfo: LockoutInfo = {
          isLocked: true,
          lockoutExpiresAt: result.rows[0].lockout_expires_at,
          lockoutReason: result.rows[0].lockout_reason
        };

        // Cache the lockout info
        await this.cacheLockout(username, ipAddress, lockoutInfo);
        
        return lockoutInfo;
      }

      // Get current failed attempts for informational purposes
      const attemptCount = await this.getFailedAttemptCount(username, ipAddress || '');
      
      return {
        isLocked: false,
        failedAttempts: attemptCount
      };

    } catch (error) {
      logger.error('Error checking lockout status:', error);
      // Return safe default in case of error
      return { isLocked: false };
    }
  }

  /**
   * Clear failed attempts on successful login
   */
  async clearFailedAttempts(username: string, ipAddress: string): Promise<void> {
    try {
      // Clear from database
      await db.query(
        `DELETE FROM failed_login_attempts 
         WHERE username = $1 AND ip_address = $2 
         AND attempt_time > CURRENT_TIMESTAMP - INTERVAL '${this.ATTEMPT_WINDOW_MINUTES} minutes'`,
        [username, ipAddress]
      );

      // Clear Redis counters
      await this.clearRedisCounters(username, ipAddress);

      logger.info('Cleared failed login attempts', { username, ipAddress });

    } catch (error) {
      logger.error('Error clearing failed attempts:', error);
    }
  }

  /**
   * Manually unlock an account (admin action)
   */
  async unlockAccount(
    username: string, 
    unlockedBy: number, 
    reason: string = 'Manual unlock by administrator'
  ): Promise<void> {
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');

      // Update lockout record
      await client.query(
        `UPDATE account_lockouts 
         SET unlocked_at = CURRENT_TIMESTAMP,
             unlocked_by = $2,
             unlock_reason = $3
         WHERE username = $1 
         AND unlocked_at IS NULL 
         AND expires_at > CURRENT_TIMESTAMP`,
        [username, unlockedBy, reason]
      );

      // Clear all failed attempts for this user
      await client.query(
        `DELETE FROM failed_login_attempts 
         WHERE username = $1`,
        [username]
      );

      await client.query('COMMIT');

      // Clear Redis cache
      await this.clearAllLockoutCache(username);

      logger.info('Account manually unlocked', { username, unlockedBy, reason });

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error unlocking account:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get failed attempt count within the time window
   */
  private async getFailedAttemptCount(username: string, ipAddress: string): Promise<number> {
    try {
      const result = await db.query(
        'SELECT get_failed_attempt_count($1, $2, $3) as count',
        [username, ipAddress, this.ATTEMPT_WINDOW_MINUTES]
      );

      return result.rows[0]?.count || 0;

    } catch (error) {
      logger.error('Error getting failed attempt count:', error);
      return 0;
    }
  }

  /**
   * Lock an account after too many failed attempts
   */
  private async lockAccount(
    username: string, 
    ipAddress: string, 
    failedAttempts: number
  ): Promise<LockoutInfo> {
    try {
      // Determine lockout duration based on previous lockouts
      const lockoutDuration = await this.calculateLockoutDuration(username);
      const expiresAt = new Date(Date.now() + lockoutDuration * 60 * 1000);

      // Record lockout in database
      await db.query(
        `INSERT INTO account_lockouts 
         (username, ip_address, lockout_reason, failed_attempts, lockout_duration_minutes, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          username,
          ipAddress,
          `Too many failed login attempts (${failedAttempts} attempts in ${this.ATTEMPT_WINDOW_MINUTES} minutes)`,
          failedAttempts,
          lockoutDuration,
          expiresAt
        ]
      );

      const lockoutInfo: LockoutInfo = {
        isLocked: true,
        lockoutExpiresAt: expiresAt,
        lockoutReason: `Account locked due to ${failedAttempts} failed login attempts`,
        failedAttempts
      };

      // Cache lockout info
      await this.cacheLockout(username, ipAddress, lockoutInfo);

      logger.warn('Account locked due to failed login attempts', {
        username,
        ipAddress,
        failedAttempts,
        lockoutDurationMinutes: lockoutDuration,
        expiresAt
      });

      return lockoutInfo;

    } catch (error) {
      logger.error('Error locking account:', error);
      throw error;
    }
  }

  /**
   * Calculate progressive lockout duration based on recent lockout history
   */
  private async calculateLockoutDuration(username: string): Promise<number> {
    try {
      // Count recent lockouts (within last 24 hours)
      const result = await db.query(
        `SELECT COUNT(*) as lockout_count 
         FROM account_lockouts 
         WHERE username = $1 
         AND locked_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'`,
        [username]
      );

      const lockoutCount = result.rows[0]?.lockout_count || 0;
      
      // Progressive lockout: 15min -> 30min -> 60min -> 60min...
      const durationIndex = Math.min(lockoutCount, this.LOCKOUT_DURATIONS_MINUTES.length - 1);
      return this.LOCKOUT_DURATIONS_MINUTES[durationIndex];

    } catch (error) {
      logger.error('Error calculating lockout duration:', error);
      return this.LOCKOUT_DURATIONS_MINUTES[0]; // Default to first duration
    }
  }

  /**
   * Update Redis counter for real-time tracking
   */
  private async updateRedisCounter(username: string, ipAddress: string): Promise<void> {
    try {
      const key = `${this.REDIS_KEY_PREFIX}${username}:${ipAddress}`;
      const exists = await redis.exists(key);
      
      if (exists) {
        await redis.getClient().incr(key);
      } else {
        await redis.set(key, '1', this.ATTEMPT_WINDOW_MINUTES * 60);
      }
    } catch (error) {
      logger.error('Error updating Redis counter:', error);
    }
  }

  /**
   * Clear Redis counters
   */
  private async clearRedisCounters(username: string, ipAddress: string): Promise<void> {
    try {
      const keys = [
        `${this.REDIS_KEY_PREFIX}${username}:${ipAddress}`,
        `${this.REDIS_KEY_PREFIX}${username}:*`,
        `${this.REDIS_KEY_PREFIX}*:${ipAddress}`
      ];

      for (const pattern of keys) {
        if (pattern.includes('*')) {
          await redis.invalidatePattern(pattern);
        } else {
          await redis.del(pattern);
        }
      }
    } catch (error) {
      logger.error('Error clearing Redis counters:', error);
    }
  }

  /**
   * Cache lockout information in Redis
   */
  private async cacheLockout(
    username: string, 
    ipAddress: string | undefined, 
    lockoutInfo: LockoutInfo
  ): Promise<void> {
    try {
      if (!lockoutInfo.lockoutExpiresAt) return;

      const ttl = Math.floor((lockoutInfo.lockoutExpiresAt.getTime() - Date.now()) / 1000);
      if (ttl <= 0) return;

      const key = `${this.REDIS_LOCKOUT_PREFIX}${username}${ipAddress ? ':' + ipAddress : ''}`;
      await redis.setJson(key, lockoutInfo, ttl);

    } catch (error) {
      logger.error('Error caching lockout info:', error);
    }
  }

  /**
   * Get cached lockout information
   */
  private async getCachedLockout(
    username: string, 
    ipAddress?: string
  ): Promise<LockoutInfo | null> {
    try {
      // Check with IP-specific key first
      if (ipAddress) {
        const ipKey = `${this.REDIS_LOCKOUT_PREFIX}${username}:${ipAddress}`;
        const ipLockout = await redis.getJson<LockoutInfo>(ipKey);
        if (ipLockout) return ipLockout;
      }

      // Check username-only key
      const userKey = `${this.REDIS_LOCKOUT_PREFIX}${username}`;
      return await redis.getJson<LockoutInfo>(userKey);

    } catch (error) {
      logger.error('Error getting cached lockout:', error);
      return null;
    }
  }

  /**
   * Clear all lockout cache entries for a user
   */
  private async clearAllLockoutCache(username: string): Promise<void> {
    try {
      await redis.invalidatePattern(`${this.REDIS_LOCKOUT_PREFIX}${username}*`);
    } catch (error) {
      logger.error('Error clearing lockout cache:', error);
    }
  }

  /**
   * Get lockout history for a user (for admin interface)
   */
  async getLockoutHistory(username: string, limit: number = 10): Promise<any[]> {
    try {
      const result = await db.query(
        `SELECT * FROM account_lockouts 
         WHERE username = $1 
         ORDER BY locked_at DESC 
         LIMIT $2`,
        [username, limit]
      );

      return result.rows;

    } catch (error) {
      logger.error('Error getting lockout history:', error);
      return [];
    }
  }
}

// Export singleton instance
export const failedLoginTracker = FailedLoginTracker.getInstance();