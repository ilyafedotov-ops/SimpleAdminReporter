import { failedLoginTracker, FailedLoginTracker, FailedLoginAttempt, LockoutInfo } from '@/services/failed-login-tracker.service';
import { db } from '@/config/database';
import { redis } from '@/config/redis';
import { logger } from '@/utils/logger';

// Mock dependencies
jest.mock('@/config/database');
jest.mock('@/config/redis');
jest.mock('@/utils/logger');

describe('FailedLoginTracker', () => {
  const mockDbQuery = jest.mocked(db.query);
  const mockDbGetClient = jest.mocked(db.getClient);
  const mockRedisExists = jest.mocked(redis.exists);
  const mockRedisSet = jest.mocked(redis.set);
  const mockRedisDel = jest.mocked(redis.del);
  const mockRedisSetJson = jest.mocked(redis.setJson);
  const mockRedisGetJson = jest.mocked(redis.getJson);
  const mockRedisInvalidatePattern = jest.mocked(redis.invalidatePattern);
  const mockRedisGetClient = jest.mocked(redis.getClient);
  const mockLogger = jest.mocked(logger);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = FailedLoginTracker.getInstance();
      const instance2 = FailedLoginTracker.getInstance();
      expect(instance1).toBe(instance2);
      expect(instance1).toBe(failedLoginTracker);
    });
  });

  describe('recordFailedAttempt', () => {
    it('should record a failed login attempt with all fields', async () => {
      // Mock database query
      mockDbQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
      
      // Mock failed attempt count query
      mockDbQuery.mockResolvedValueOnce({ 
        rows: [{ count: 3 }], 
        rowCount: 1 
      } as any);

      // Mock Redis operations
      mockRedisExists.mockResolvedValue(false);
      mockRedisSet.mockResolvedValue();

      const attempt: FailedLoginAttempt = {
        username: 'testuser',
        ipAddress: '127.0.0.1',
        userAgent: 'Test Browser',
        authSource: 'local',
        errorType: 'invalid_credentials'
      };

      const result = await failedLoginTracker.recordFailedAttempt(attempt);

      expect(result.isLocked).toBe(false);
      expect(result.failedAttempts).toBe(3);
      expect(mockDbQuery).toHaveBeenNthCalledWith(1,
        expect.stringContaining('INSERT INTO failed_login_attempts'),
        ['testuser', '127.0.0.1', 'Test Browser', 'local', 'invalid_credentials']
      );
      expect(mockDbQuery).toHaveBeenNthCalledWith(2,
        'SELECT get_failed_attempt_count($1, $2, $3) as count',
        ['testuser', '127.0.0.1', 15]
      );
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed login attempt recorded',
        expect.objectContaining({
          username: 'testuser',
          ipAddress: '127.0.0.1',
          errorType: 'invalid_credentials',
          attemptCount: 3,
          maxAttempts: 5
        })
      );
    });

    it('should record a failed login attempt with minimal fields', async () => {
      mockDbQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
      mockDbQuery.mockResolvedValueOnce({ rows: [{ count: 1 }], rowCount: 1 } as any);
      mockRedisExists.mockResolvedValue(true);
      mockRedisGetClient.mockReturnValue({ incr: jest.fn().mockResolvedValue(2) } as any);

      const attempt: FailedLoginAttempt = {
        username: 'testuser',
        ipAddress: '192.168.1.1',
        errorType: 'user_not_found'
      };

      const result = await failedLoginTracker.recordFailedAttempt(attempt);

      expect(result.isLocked).toBe(false);
      expect(result.failedAttempts).toBe(1);
      expect(mockDbQuery).toHaveBeenNthCalledWith(1,
        expect.stringContaining('INSERT INTO failed_login_attempts'),
        ['testuser', '192.168.1.1', undefined, undefined, 'user_not_found']
      );
    });

    it('should lock account after max attempts with progressive lockout', async () => {
      // Mock database queries
      mockDbQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any) // Insert attempt
        .mockResolvedValueOnce({ rows: [{ count: 5 }], rowCount: 1 } as any) // Get count (MAX_ATTEMPTS)
        .mockResolvedValueOnce({ rows: [{ lockout_count: 1 }], rowCount: 1 } as any) // Get lockout history (second offense)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any); // Insert lockout

      // Mock Redis operations
      mockRedisSetJson.mockResolvedValue();

      const attempt: FailedLoginAttempt = {
        username: 'repeat_offender',
        ipAddress: '127.0.0.1',
        errorType: 'invalid_credentials'
      };

      const result = await failedLoginTracker.recordFailedAttempt(attempt);

      expect(result.isLocked).toBe(true);
      expect(result.lockoutExpiresAt).toBeDefined();
      expect(result.lockoutReason).toContain('5 failed login attempts');
      expect(result.failedAttempts).toBe(5);
      
      // Verify lockout is inserted with 30 minutes (second offense)
      expect(mockDbQuery).toHaveBeenNthCalledWith(4,
        expect.stringContaining('INSERT INTO account_lockouts'),
        expect.arrayContaining(['repeat_offender', '127.0.0.1', expect.any(String), 5, 30, expect.any(Date)])
      );
    });

    it('should lock account with maximum lockout duration after multiple offenses', async () => {
      mockDbQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
        .mockResolvedValueOnce({ rows: [{ count: 5 }], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [{ lockout_count: 5 }], rowCount: 1 } as any) // Many previous lockouts
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      mockRedisSetJson.mockResolvedValue();

      const attempt: FailedLoginAttempt = {
        username: 'chronic_offender',
        ipAddress: '10.0.0.1',
        errorType: 'invalid_credentials'
      };

      await failedLoginTracker.recordFailedAttempt(attempt);

      // Should use maximum lockout duration (60 minutes)
      expect(mockDbQuery).toHaveBeenNthCalledWith(4,
        expect.stringContaining('INSERT INTO account_lockouts'),
        expect.arrayContaining([expect.any(String), expect.any(String), expect.any(String), 5, 60, expect.any(Date)])
      );
    });

    it('should handle database error during attempt recording', async () => {
      const dbError = new Error('Database connection failed');
      mockDbQuery.mockRejectedValue(dbError);

      const attempt: FailedLoginAttempt = {
        username: 'testuser',
        ipAddress: '127.0.0.1',
        errorType: 'invalid_credentials'
      };

      await expect(failedLoginTracker.recordFailedAttempt(attempt))
        .rejects.toThrow('Database connection failed');
      
      expect(mockLogger.error).toHaveBeenCalledWith('Error recording failed login attempt:', dbError);
    });

    it('should handle Redis error gracefully during counter update', async () => {
      mockDbQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
      mockDbQuery.mockResolvedValueOnce({ rows: [{ count: 2 }], rowCount: 1 } as any);
      
      mockRedisExists.mockRejectedValue(new Error('Redis connection failed'));

      const attempt: FailedLoginAttempt = {
        username: 'testuser',
        ipAddress: '127.0.0.1',
        errorType: 'service_error'
      };

      const result = await failedLoginTracker.recordFailedAttempt(attempt);
      
      expect(result.isLocked).toBe(false);
      expect(result.failedAttempts).toBe(2);
      expect(mockLogger.error).toHaveBeenCalledWith('Error updating Redis counter:', expect.any(Error));
    });

    it('should test all error types', async () => {
      mockDbQuery.mockResolvedValue({ rows: [], rowCount: 0 } as any);
      mockDbQuery.mockResolvedValue({ rows: [{ count: 1 }], rowCount: 1 } as any);
      mockRedisExists.mockResolvedValue(false);
      mockRedisSet.mockResolvedValue();

      const errorTypes: FailedLoginAttempt['errorType'][] = [
        'invalid_credentials', 'account_locked', 'user_not_found', 'user_inactive', 'service_error'
      ];

      for (const errorType of errorTypes) {
        jest.clearAllMocks();
        mockDbQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
        mockDbQuery.mockResolvedValueOnce({ rows: [{ count: 1 }], rowCount: 1 } as any);
        mockRedisExists.mockResolvedValue(false);
        mockRedisSet.mockResolvedValue();

        const attempt: FailedLoginAttempt = {
          username: 'testuser',
          ipAddress: '127.0.0.1',
          errorType
        };

        const result = await failedLoginTracker.recordFailedAttempt(attempt);
        expect(result.isLocked).toBe(false);
        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO failed_login_attempts'),
          expect.arrayContaining([expect.any(String), expect.any(String), undefined, undefined, errorType])
        );
      }
    });
  });

  describe('checkLockoutStatus', () => {
    it('should return not locked for user with no lockouts', async () => {
      // No cached data
      mockRedisGetJson.mockResolvedValue(null);
      
      // Mock database query for lockout check
      mockDbQuery.mockResolvedValueOnce({
        rows: [{ is_locked: false, lockout_expires_at: null, lockout_reason: null }],
        rowCount: 1
      } as any);

      // Mock failed attempts count
      mockDbQuery.mockResolvedValueOnce({
        rows: [{ count: 2 }],
        rowCount: 1
      } as any);

      const result = await failedLoginTracker.checkLockoutStatus('testuser', '127.0.0.1');

      expect(result.isLocked).toBe(false);
      expect(result.failedAttempts).toBe(2);
      expect(mockDbQuery).toHaveBeenNthCalledWith(1,
        expect.stringContaining('SELECT is_locked, lockout_expires_at, lockout_reason'),
        ['testuser', '127.0.0.1']
      );
    });

    it('should return locked status from IP-specific cache', async () => {
      const cachedLockout: LockoutInfo = {
        isLocked: true,
        lockoutExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
        lockoutReason: 'Too many failed attempts'
      };

      mockRedisGetJson.mockResolvedValueOnce(cachedLockout); // IP-specific cache hit

      const result = await failedLoginTracker.checkLockoutStatus('testuser', '127.0.0.1');

      expect(result).toEqual(cachedLockout);
      expect(mockDbQuery).not.toHaveBeenCalled(); // Should use cache
      expect(mockRedisGetJson).toHaveBeenCalledWith('lockout:testuser:127.0.0.1');
    });

    it('should return locked status from username-only cache when IP cache misses', async () => {
      const cachedLockout: LockoutInfo = {
        isLocked: true,
        lockoutExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
        lockoutReason: 'Account locked globally'
      };

      mockRedisGetJson
        .mockResolvedValueOnce(null) // IP-specific cache miss
        .mockResolvedValueOnce(cachedLockout); // Username-only cache hit

      const result = await failedLoginTracker.checkLockoutStatus('testuser', '127.0.0.1');

      expect(result).toEqual(cachedLockout);
      expect(mockDbQuery).not.toHaveBeenCalled();
      expect(mockRedisGetJson).toHaveBeenNthCalledWith(1, 'lockout:testuser:127.0.0.1');
      expect(mockRedisGetJson).toHaveBeenNthCalledWith(2, 'lockout:testuser');
    });

    it('should check lockout status without IP address', async () => {
      mockRedisGetJson.mockResolvedValue(null);
      
      mockDbQuery.mockResolvedValueOnce({
        rows: [{ is_locked: false, lockout_expires_at: null, lockout_reason: null }],
        rowCount: 1
      } as any);
      
      mockDbQuery.mockResolvedValueOnce({
        rows: [{ count: 1 }],
        rowCount: 1
      } as any);

      const result = await failedLoginTracker.checkLockoutStatus('testuser');

      expect(result.isLocked).toBe(false);
      expect(result.failedAttempts).toBe(1);
      expect(mockDbQuery).toHaveBeenNthCalledWith(1,
        expect.stringContaining('SELECT is_locked, lockout_expires_at, lockout_reason'),
        ['testuser', undefined]
      );
      expect(mockDbQuery).toHaveBeenNthCalledWith(2,
        'SELECT get_failed_attempt_count($1, $2, $3) as count',
        ['testuser', '', 15]
      );
    });

    it('should return locked status from database and cache it', async () => {
      mockRedisGetJson.mockResolvedValue(null);
      
      const lockoutExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
      mockDbQuery.mockResolvedValueOnce({
        rows: [{ 
          is_locked: true, 
          lockout_expires_at: lockoutExpiresAt, 
          lockout_reason: 'Too many failed attempts' 
        }],
        rowCount: 1
      } as any);

      mockRedisSetJson.mockResolvedValue();

      const result = await failedLoginTracker.checkLockoutStatus('lockeduser', '127.0.0.1');

      expect(result.isLocked).toBe(true);
      expect(result.lockoutExpiresAt).toEqual(lockoutExpiresAt);
      expect(result.lockoutReason).toBe('Too many failed attempts');
      
      // Should cache the result
      expect(mockRedisSetJson).toHaveBeenCalledWith(
        'lockout:lockeduser:127.0.0.1',
        expect.objectContaining({
          isLocked: true,
          lockoutExpiresAt,
          lockoutReason: 'Too many failed attempts'
        }),
        expect.any(Number)
      );
    });

    it('should handle database error gracefully', async () => {
      mockRedisGetJson.mockResolvedValue(null);
      
      const dbError = new Error('Database query failed');
      mockDbQuery.mockRejectedValue(dbError);

      const result = await failedLoginTracker.checkLockoutStatus('testuser', '127.0.0.1');

      expect(result.isLocked).toBe(false); // Safe default
      expect(mockLogger.error).toHaveBeenCalledWith('Error checking lockout status:', dbError);
    });

    it('should handle Redis cache error gracefully', async () => {
      const cacheError = new Error('Redis connection failed');
      mockRedisGetJson.mockRejectedValue(cacheError);
      
      mockDbQuery.mockResolvedValueOnce({
        rows: [{ is_locked: false, lockout_expires_at: null, lockout_reason: null }],
        rowCount: 1
      } as any);
      
      mockDbQuery.mockResolvedValueOnce({
        rows: [{ count: 0 }],
        rowCount: 1
      } as any);

      const result = await failedLoginTracker.checkLockoutStatus('testuser', '127.0.0.1');

      expect(result.isLocked).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith('Error getting cached lockout:', cacheError);
    });

    it('should handle empty database result', async () => {
      mockRedisGetJson.mockResolvedValue(null);
      
      mockDbQuery.mockResolvedValueOnce({
        rows: [], // Empty result
        rowCount: 0
      } as any);
      
      mockDbQuery.mockResolvedValueOnce({
        rows: [{ count: 3 }],
        rowCount: 1
      } as any);

      const result = await failedLoginTracker.checkLockoutStatus('testuser', '127.0.0.1');

      expect(result.isLocked).toBe(false);
      expect(result.failedAttempts).toBe(3);
    });

    it('should not cache lockout info when caching fails', async () => {
      mockRedisGetJson.mockResolvedValue(null);
      
      const lockoutExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
      mockDbQuery.mockResolvedValueOnce({
        rows: [{ 
          is_locked: true, 
          lockout_expires_at: lockoutExpiresAt, 
          lockout_reason: 'Account locked' 
        }],
        rowCount: 1
      } as any);

      const cacheError = new Error('Cache write failed');
      mockRedisSetJson.mockRejectedValue(cacheError);

      const result = await failedLoginTracker.checkLockoutStatus('testuser', '127.0.0.1');

      expect(result.isLocked).toBe(true);
      expect(mockLogger.error).toHaveBeenCalledWith('Error caching lockout info:', cacheError);
    });
  });

  describe('clearFailedAttempts', () => {
    it('should clear failed attempts from database and Redis', async () => {
      mockDbQuery.mockResolvedValue({ rows: [], rowCount: 0 } as any);
      mockRedisDel.mockResolvedValue(1);
      mockRedisInvalidatePattern.mockResolvedValue(2);

      await failedLoginTracker.clearFailedAttempts('testuser', '127.0.0.1');

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM failed_login_attempts'),
        ['testuser', '127.0.0.1']
      );
      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('AND attempt_time > CURRENT_TIMESTAMP - INTERVAL \'15 minutes\''),
        ['testuser', '127.0.0.1']
      );
      
      // Should clear Redis counters with patterns
      expect(mockRedisDel).toHaveBeenCalledWith('failed_login:testuser:127.0.0.1');
      expect(mockRedisInvalidatePattern).toHaveBeenCalledWith('failed_login:testuser:*');
      expect(mockRedisInvalidatePattern).toHaveBeenCalledWith('failed_login:*:127.0.0.1');
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Cleared failed login attempts',
        { username: 'testuser', ipAddress: '127.0.0.1' }
      );
    });

    it('should handle database error gracefully', async () => {
      const dbError = new Error('Delete operation failed');
      mockDbQuery.mockRejectedValue(dbError);

      await failedLoginTracker.clearFailedAttempts('testuser', '127.0.0.1');

      expect(mockLogger.error).toHaveBeenCalledWith('Error clearing failed attempts:', dbError);
    });

    it('should handle Redis error gracefully', async () => {
      mockDbQuery.mockResolvedValue({ rows: [], rowCount: 0 } as any);
      const redisError = new Error('Redis operation failed');
      mockRedisDel.mockRejectedValue(redisError);

      await failedLoginTracker.clearFailedAttempts('testuser', '127.0.0.1');

      expect(mockLogger.error).toHaveBeenCalledWith('Error clearing Redis counters:', redisError);
    });
  });

  describe('unlockAccount', () => {
    let mockClient: any;

    beforeEach(() => {
      mockClient = {
        query: jest.fn(),
        release: jest.fn()
      };
      mockDbGetClient.mockResolvedValue(mockClient);
    });

    it('should unlock account with custom reason', async () => {
      mockRedisInvalidatePattern.mockResolvedValue(1);

      await failedLoginTracker.unlockAccount('testuser', 1, 'Manual unlock by admin');

      expect(mockClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
      expect(mockClient.query).toHaveBeenNthCalledWith(2,
        expect.stringContaining('UPDATE account_lockouts'),
        ['testuser', 1, 'Manual unlock by admin']
      );
      expect(mockClient.query).toHaveBeenNthCalledWith(3,
        expect.stringContaining('DELETE FROM failed_login_attempts'),
        ['testuser']
      );
      expect(mockClient.query).toHaveBeenNthCalledWith(4, 'COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
      
      expect(mockRedisInvalidatePattern).toHaveBeenCalledWith('lockout:testuser*');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Account manually unlocked',
        { username: 'testuser', unlockedBy: 1, reason: 'Manual unlock by admin' }
      );
    });

    it('should unlock account with default reason', async () => {
      mockRedisInvalidatePattern.mockResolvedValue(1);

      await failedLoginTracker.unlockAccount('testuser', 2);

      expect(mockClient.query).toHaveBeenNthCalledWith(2,
        expect.stringContaining('UPDATE account_lockouts'),
        ['testuser', 2, 'Manual unlock by administrator']
      );
    });

    it('should handle database transaction error and rollback', async () => {
      const dbError = new Error('Transaction failed');
      mockClient.query.mockImplementation((query: string) => {
        if (query === 'BEGIN') return Promise.resolve();
        if (query.includes('UPDATE')) throw dbError;
        if (query === 'ROLLBACK') return Promise.resolve();
        return Promise.resolve();
      });

      await expect(failedLoginTracker.unlockAccount('testuser', 1, 'Test unlock'))
        .rejects.toThrow('Transaction failed');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith('Error unlocking account:', dbError);
    });

    it('should handle Redis cache clear error gracefully', async () => {
      const redisError = new Error('Redis clear failed');
      mockRedisInvalidatePattern.mockRejectedValue(redisError);

      // Should complete successfully despite Redis error
      await failedLoginTracker.unlockAccount('testuser', 1);

      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockLogger.error).toHaveBeenCalledWith('Error clearing lockout cache:', redisError);
    });
  });

  describe('getLockoutHistory', () => {
    it('should return lockout history for a user with custom limit', async () => {
      const mockHistory = [
        {
          id: 1,
          username: 'testuser',
          locked_at: new Date('2025-01-01T10:00:00Z'),
          expires_at: new Date('2025-01-01T10:15:00Z'),
          lockout_reason: 'Too many failed attempts'
        },
        {
          id: 2,
          username: 'testuser',
          locked_at: new Date('2025-01-01T09:00:00Z'),
          expires_at: new Date('2025-01-01T09:30:00Z'),
          lockout_reason: 'Repeated login failures'
        }
      ];

      mockDbQuery.mockResolvedValue({
        rows: mockHistory,
        rowCount: 2
      } as any);

      const result = await failedLoginTracker.getLockoutHistory('testuser', 5);

      expect(result).toEqual(mockHistory);
      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM account_lockouts'),
        ['testuser', 5]
      );
    });

    it('should return lockout history with default limit', async () => {
      const mockHistory = [{ id: 1, username: 'testuser' }];
      mockDbQuery.mockResolvedValue({ rows: mockHistory, rowCount: 1 } as any);

      const result = await failedLoginTracker.getLockoutHistory('testuser');

      expect(result).toEqual(mockHistory);
      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM account_lockouts'),
        ['testuser', 10] // Default limit
      );
    });

    it('should return empty array on database error', async () => {
      const dbError = new Error('Query execution failed');
      mockDbQuery.mockRejectedValue(dbError);

      const result = await failedLoginTracker.getLockoutHistory('testuser');

      expect(result).toEqual([]);
      expect(mockLogger.error).toHaveBeenCalledWith('Error getting lockout history:', dbError);
    });

    it('should handle empty result set', async () => {
      mockDbQuery.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      const result = await failedLoginTracker.getLockoutHistory('never_locked_user');

      expect(result).toEqual([]);
    });
  });

  // Additional tests for private methods and edge cases
  describe('Private Method Coverage via Public Interface', () => {
    describe('Redis counter operations', () => {
      it('should increment existing Redis counter', async () => {
        mockDbQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
        mockDbQuery.mockResolvedValueOnce({ rows: [{ count: 2 }], rowCount: 1 } as any);
        
        mockRedisExists.mockResolvedValue(true);
        const mockIncr = jest.fn().mockResolvedValue(3);
        mockRedisGetClient.mockReturnValue({ incr: mockIncr } as any);

        await failedLoginTracker.recordFailedAttempt({
          username: 'testuser',
          ipAddress: '127.0.0.1',
          errorType: 'invalid_credentials'
        });

        expect(mockRedisExists).toHaveBeenCalledWith('failed_login:testuser:127.0.0.1');
        expect(mockIncr).toHaveBeenCalledWith('failed_login:testuser:127.0.0.1');
      });

      it('should create new Redis counter when key does not exist', async () => {
        mockDbQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
        mockDbQuery.mockResolvedValueOnce({ rows: [{ count: 1 }], rowCount: 1 } as any);
        
        mockRedisExists.mockResolvedValue(false);
        mockRedisSet.mockResolvedValue();

        await failedLoginTracker.recordFailedAttempt({
          username: 'newuser',
          ipAddress: '10.0.0.1',
          errorType: 'user_not_found'
        });

        expect(mockRedisSet).toHaveBeenCalledWith(
          'failed_login:newuser:10.0.0.1',
          '1',
          15 * 60 // 15 minutes in seconds
        );
      });
    });

    describe('Cache TTL calculations', () => {
      it('should not cache lockout info when TTL is negative or zero', async () => {
        mockRedisGetJson.mockResolvedValue(null);
        
        const pastDate = new Date(Date.now() - 1000); // Already expired
        mockDbQuery.mockResolvedValueOnce({
          rows: [{ 
            is_locked: true, 
            lockout_expires_at: pastDate, 
            lockout_reason: 'Expired lockout' 
          }],
          rowCount: 1
        } as any);

        await failedLoginTracker.checkLockoutStatus('testuser', '127.0.0.1');

        // Should not attempt to cache expired lockout
        expect(mockRedisSetJson).not.toHaveBeenCalled();
      });

      it('should not cache lockout info when expiration date is missing', async () => {
        mockRedisGetJson.mockResolvedValue(null);
        
        mockDbQuery.mockResolvedValueOnce({
          rows: [{ 
            is_locked: true, 
            lockout_expires_at: null, // No expiration
            lockout_reason: 'Permanent lockout' 
          }],
          rowCount: 1
        } as any);

        await failedLoginTracker.checkLockoutStatus('testuser', '127.0.0.1');

        expect(mockRedisSetJson).not.toHaveBeenCalled();
      });
    });

    describe('Error handling in private methods', () => {
      it('should handle error in calculateLockoutDuration gracefully', async () => {
        mockDbQuery
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any) // Insert attempt
          .mockResolvedValueOnce({ rows: [{ count: 5 }], rowCount: 1 } as any) // Get count
          .mockRejectedValueOnce(new Error('Lockout history query failed')) // calculateLockoutDuration fails
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any); // Insert lockout

        mockRedisSetJson.mockResolvedValue();

        const result = await failedLoginTracker.recordFailedAttempt({
          username: 'testuser',
          ipAddress: '127.0.0.1',
          errorType: 'invalid_credentials'
        });

        expect(result.isLocked).toBe(true);
        expect(mockLogger.error).toHaveBeenCalledWith('Error calculating lockout duration:', expect.any(Error));
        
        // Should use default lockout duration (15 minutes)
        expect(mockDbQuery).toHaveBeenNthCalledWith(4,
          expect.stringContaining('INSERT INTO account_lockouts'),
          expect.arrayContaining([expect.any(String), expect.any(String), expect.any(String), 5, 15, expect.any(Date)])
        );
      });

      it('should handle error in getFailedAttemptCount gracefully', async () => {
        mockDbQuery
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any) // Insert attempt
          .mockRejectedValueOnce(new Error('Failed attempt count query failed')); // getFailedAttemptCount fails

        const result = await failedLoginTracker.recordFailedAttempt({
          username: 'testuser',
          ipAddress: '127.0.0.1',
          errorType: 'invalid_credentials'
        });

        expect(result.isLocked).toBe(false);
        expect(result.failedAttempts).toBe(0); // Default when query fails
        expect(mockLogger.error).toHaveBeenCalledWith('Error getting failed attempt count:', expect.any(Error));
      });
    });

    describe('Concurrent access scenarios', () => {
      it('should handle concurrent failed login attempts', async () => {
        // Simulate race condition where multiple attempts are processed simultaneously
        const attempts = Array.from({ length: 3 }, (_, _i) => ({
          username: 'concurrentuser',
          ipAddress: '127.0.0.1',
          errorType: 'invalid_credentials' as const
        }));

        // Mock responses for each attempt
        mockDbQuery
          .mockResolvedValue({ rows: [], rowCount: 0 } as any) // All inserts succeed
          .mockResolvedValueOnce({ rows: [{ count: 3 }], rowCount: 1 } as any)
          .mockResolvedValueOnce({ rows: [{ count: 4 }], rowCount: 1 } as any)
          .mockResolvedValueOnce({ rows: [{ count: 5 }], rowCount: 1 } as any);

        mockRedisExists.mockResolvedValue(false);
        mockRedisSet.mockResolvedValue();

        // Process attempts concurrently
        const results = await Promise.all(
          attempts.map(attempt => failedLoginTracker.recordFailedAttempt(attempt))
        );

        expect(results[0].isLocked).toBe(false);
        expect(results[1].isLocked).toBe(false);
        expect(results[2].isLocked).toBe(false); // None should be locked in this scenario
        
        // All attempts should be recorded
        expect(mockDbQuery).toHaveBeenCalledTimes(6); // 3 inserts + 3 count queries
      });
    });
  });
});