import { FailedLoginTracker, FailedLoginAttempt, LockoutInfo } from './failed-login-tracker.service';
import { db } from '@/config/database';
import { redis } from '@/config/redis';
import { logger } from '@/utils/logger';

// Mock dependencies
jest.mock('@/config/database');
jest.mock('@/config/redis');
jest.mock('@/utils/logger');

// Mock client for database transactions
const mockClient = {
  query: jest.fn(),
  release: jest.fn()
};

const mockDb = db as jest.Mocked<typeof db>;
const mockRedis = redis as jest.Mocked<typeof redis>;
const mockLogger = logger as jest.Mocked<typeof logger>;

describe('FailedLoginTracker', () => {
  let tracker: FailedLoginTracker;
  
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Get fresh instance
    tracker = FailedLoginTracker.getInstance();
    
    // Setup default database client mock
    mockDb.getClient.mockResolvedValue(mockClient as any);
    mockDb.query.mockResolvedValue({ rows: [] } as any);
    
    // Setup default Redis mocks
    mockRedis.exists.mockResolvedValue(false);
    mockRedis.set.mockResolvedValue(undefined);
    mockRedis.del.mockResolvedValue(1);
    mockRedis.getClient.mockReturnValue({
      incr: jest.fn().mockResolvedValue(1)
    } as any);
    mockRedis.setJson.mockResolvedValue(undefined);
    mockRedis.getJson.mockResolvedValue(null);
    mockRedis.invalidatePattern.mockResolvedValue(1);
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance on multiple calls', () => {
      const instance1 = FailedLoginTracker.getInstance();
      const instance2 = FailedLoginTracker.getInstance();
      
      expect(instance1).toBe(instance2);
    });
  });

  describe('recordFailedAttempt', () => {
    const mockAttempt: FailedLoginAttempt = {
      username: 'testuser',
      ipAddress: '192.168.1.100',
      userAgent: 'Mozilla/5.0',
      authSource: 'ldap',
      errorType: 'invalid_credentials'
    };

    it('should record failed attempt in database', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] } as any) // INSERT
        .mockResolvedValueOnce({ rows: [{ count: 1 }] } as any); // get count

      const result = await tracker.recordFailedAttempt(mockAttempt);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO failed_login_attempts'),
        [mockAttempt.username, mockAttempt.ipAddress, mockAttempt.userAgent, mockAttempt.authSource, mockAttempt.errorType]
      );
      
      expect(result.isLocked).toBe(false);
      expect(result.failedAttempts).toBe(1);
    });

    it('should update Redis counter for real-time tracking', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] } as any) // INSERT
        .mockResolvedValueOnce({ rows: [{ count: 2 }] } as any); // get count

      await tracker.recordFailedAttempt(mockAttempt);

      expect(mockRedis.exists).toHaveBeenCalledWith('failed_login:testuser:192.168.1.100');
      expect(mockRedis.set).toHaveBeenCalledWith('failed_login:testuser:192.168.1.100', '1', 900); // 15 minutes
    });

    it('should lock account after MAX_ATTEMPTS (5) failed attempts', async () => {
      
      mockDb.query
        .mockResolvedValueOnce({ rows: [] } as any) // INSERT
        .mockResolvedValueOnce({ rows: [{ count: 5 }] } as any) // get count
        .mockResolvedValueOnce({ rows: [{ lockout_count: 0 }] } as any) // lockout history
        .mockResolvedValueOnce({ rows: [] } as any); // INSERT lockout

      const result = await tracker.recordFailedAttempt(mockAttempt);

      expect(result.isLocked).toBe(true);
      expect(result.lockoutExpiresAt).toBeInstanceOf(Date);
      expect(result.failedAttempts).toBe(5);
      
      // Verify lockout was recorded in database
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO account_lockouts'),
        expect.arrayContaining([mockAttempt.username, mockAttempt.ipAddress])
      );
    });

    it('should handle database errors gracefully', async () => {
      const dbError = new Error('Database connection failed');
      mockDb.query.mockRejectedValue(dbError);

      await expect(tracker.recordFailedAttempt(mockAttempt)).rejects.toThrow(dbError);
      expect(mockLogger.error).toHaveBeenCalledWith('Error recording failed login attempt:', dbError);
    });

    it('should handle Redis errors gracefully and continue processing', async () => {
      const redisError = new Error('Redis connection failed');
      mockRedis.exists.mockRejectedValue(redisError);
      
      mockDb.query
        .mockResolvedValueOnce({ rows: [] } as any) // INSERT
        .mockResolvedValueOnce({ rows: [{ count: 1 }] } as any); // get count

      const result = await tracker.recordFailedAttempt(mockAttempt);

      expect(result.isLocked).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith('Error updating Redis counter:', redisError);
    });
  });

  describe('Progressive Lockout System', () => {
    it('should implement progressive lockout durations (15, 30, 60 minutes)', async () => {
      const lockoutCounts = [0, 1, 2, 3];
      const expectedDurations = [15, 30, 60, 60]; // Last duration repeats

      for (let i = 0; i < lockoutCounts.length; i++) {
        mockDb.query.mockResolvedValueOnce({ 
          rows: [{ lockout_count: lockoutCounts[i] }] 
        } as any);

        // Access private method via bracket notation for testing
        const duration = await (tracker as any).calculateLockoutDuration('testuser');
        expect(duration).toBe(expectedDurations[i]);
      }
    });

    it('should handle calculation errors and default to first duration', async () => {
      const dbError = new Error('Database error');
      mockDb.query.mockRejectedValue(dbError);

      const duration = await (tracker as any).calculateLockoutDuration('testuser');
      
      expect(duration).toBe(15); // First duration as fallback
      expect(mockLogger.error).toHaveBeenCalledWith('Error calculating lockout duration:', dbError);
    });
  });

  describe('checkLockoutStatus', () => {
    const username = 'testuser';
    const ipAddress = '192.168.1.100';

    it('should check Redis cache first for performance', async () => {
      const cachedLockout: LockoutInfo = {
        isLocked: true,
        lockoutExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
        lockoutReason: 'Too many failed attempts'
      };

      mockRedis.getJson.mockResolvedValue(cachedLockout);

      const result = await tracker.checkLockoutStatus(username, ipAddress);

      expect(result).toEqual(cachedLockout);
      expect(mockRedis.getJson).toHaveBeenCalledWith('lockout:testuser:192.168.1.100');
      expect(mockDb.query).not.toHaveBeenCalled(); // Should not hit database
    });

    it('should fall back to database when cache miss', async () => {
      mockRedis.getJson.mockResolvedValue(null); // Cache miss
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          is_locked: true,
          lockout_expires_at: new Date(),
          lockout_reason: 'Database lockout'
        }]
      } as any);

      const result = await tracker.checkLockoutStatus(username, ipAddress);

      expect(result.isLocked).toBe(true);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT is_locked, lockout_expires_at, lockout_reason'),
        [username, ipAddress]
      );
    });

    it('should return safe default on database errors', async () => {
      mockRedis.getJson.mockResolvedValue(null);
      const dbError = new Error('Database error');
      mockDb.query.mockRejectedValue(dbError);

      const result = await tracker.checkLockoutStatus(username, ipAddress);

      expect(result.isLocked).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith('Error checking lockout status:', dbError);
    });

    it('should handle both IP-specific and username-only cache keys', async () => {
      mockRedis.getJson
        .mockResolvedValueOnce(null) // IP-specific key miss
        .mockResolvedValueOnce({ isLocked: true } as LockoutInfo); // Username-only key hit

      const result = await tracker.checkLockoutStatus(username, ipAddress);

      expect(result.isLocked).toBe(true);
      expect(mockRedis.getJson).toHaveBeenCalledWith('lockout:testuser:192.168.1.100');
      expect(mockRedis.getJson).toHaveBeenCalledWith('lockout:testuser');
    });
  });

  describe('clearFailedAttempts', () => {
    const username = 'testuser';
    const ipAddress = '192.168.1.100';

    it('should clear failed attempts from database and Redis', async () => {
      mockDb.query.mockResolvedValue({ rows: [] } as any);

      await tracker.clearFailedAttempts(username, ipAddress);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM failed_login_attempts'),
        [username, ipAddress]
      );
      
      expect(mockRedis.invalidatePattern).toHaveBeenCalledWith('failed_login:testuser:*');
      expect(mockRedis.del).toHaveBeenCalledWith('failed_login:testuser:192.168.1.100');
    });

    it('should handle database errors gracefully', async () => {
      const dbError = new Error('Database error');
      mockDb.query.mockRejectedValue(dbError);

      await tracker.clearFailedAttempts(username, ipAddress);

      expect(mockLogger.error).toHaveBeenCalledWith('Error clearing failed attempts:', dbError);
    });
  });

  describe('unlockAccount', () => {
    const username = 'testuser';
    const unlockedBy = 1;
    const reason = 'Manual unlock by admin';

    it('should unlock account using database transaction', async () => {
      mockClient.query.mockResolvedValue({ rows: [] } as any);

      await tracker.unlockAccount(username, unlockedBy, reason);

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE account_lockouts'),
        [username, unlockedBy, reason]
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM failed_login_attempts'),
        [username]
      );
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should rollback transaction on errors', async () => {
      const dbError = new Error('Transaction failed');
      mockClient.query.mockImplementation((query: string) => {
        if (query === 'BEGIN') return Promise.resolve({ rows: [] });
        if (query.includes('UPDATE')) throw dbError;
        return Promise.resolve({ rows: [] });
      });

      await expect(tracker.unlockAccount(username, unlockedBy, reason)).rejects.toThrow(dbError);

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith('Error unlocking account:', dbError);
    });

    it('should clear Redis cache after successful unlock', async () => {
      mockClient.query.mockResolvedValue({ rows: [] } as any);

      await tracker.unlockAccount(username, unlockedBy, reason);

      expect(mockRedis.invalidatePattern).toHaveBeenCalledWith('lockout:testuser*');
    });
  });

  describe('Concurrent Access Protection', () => {
    it('should handle multiple simultaneous failed attempts', async () => {
      const attempts = Array(3).fill(null).map((_, i) => ({
        username: 'testuser',
        ipAddress: `192.168.1.${100 + i}`,
        errorType: 'invalid_credentials' as const
      }));

      // Mock progressive counts
      mockDb.query
        .mockResolvedValueOnce({ rows: [] } as any) // INSERT 1
        .mockResolvedValueOnce({ rows: [{ count: 3 }] } as any) // count 1
        .mockResolvedValueOnce({ rows: [] } as any) // INSERT 2
        .mockResolvedValueOnce({ rows: [{ count: 4 }] } as any) // count 2
        .mockResolvedValueOnce({ rows: [] } as any) // INSERT 3
        .mockResolvedValueOnce({ rows: [{ count: 5 }] } as any) // count 3
        .mockResolvedValueOnce({ rows: [{ lockout_count: 0 }] } as any) // lockout history
        .mockResolvedValueOnce({ rows: [] } as any); // INSERT lockout

      const results = await Promise.all(
        attempts.map(attempt => tracker.recordFailedAttempt(attempt))
      );

      // Last attempt should trigger lockout
      expect(results[2].isLocked).toBe(true);
      expect(results[0].isLocked).toBe(false);
      expect(results[1].isLocked).toBe(false);
    });

    it('should handle Redis race conditions gracefully', async () => {
      mockRedis.exists.mockResolvedValue(true); // Key exists
      mockRedis.getClient().incr = jest.fn().mockResolvedValue(2);
      
      mockDb.query
        .mockResolvedValueOnce({ rows: [] } as any) // INSERT
        .mockResolvedValueOnce({ rows: [{ count: 2 }] } as any); // get count

      const result = await tracker.recordFailedAttempt({
        username: 'testuser',
        ipAddress: '192.168.1.100',
        errorType: 'invalid_credentials'
      });

      expect(mockRedis.getClient().incr).toHaveBeenCalledWith('failed_login:testuser:192.168.1.100');
      expect(result.failedAttempts).toBe(2);
    });
  });

  describe('Distributed Attack Protection', () => {
    it('should track attempts per IP address separately', async () => {
      const username = 'testuser';
      const ips = ['192.168.1.100', '192.168.1.101', '192.168.1.102'];
      
      for (const ip of ips) {
        mockDb.query
          .mockResolvedValueOnce({ rows: [] } as any) // INSERT
          .mockResolvedValueOnce({ rows: [{ count: 1 }] } as any); // count

        const result = await tracker.recordFailedAttempt({
          username,
          ipAddress: ip,
          errorType: 'invalid_credentials'
        });

        expect(result.isLocked).toBe(false);
        expect(result.failedAttempts).toBe(1);
      }

      // Each IP should have its own Redis key
      expect(mockRedis.set).toHaveBeenCalledWith('failed_login:testuser:192.168.1.100', '1', 900);
      expect(mockRedis.set).toHaveBeenCalledWith('failed_login:testuser:192.168.1.101', '1', 900);
      expect(mockRedis.set).toHaveBeenCalledWith('failed_login:testuser:192.168.1.102', '1', 900);
    });
  });

  describe('Edge Cases and Error Scenarios', () => {
    it('should handle expired Redis keys gracefully', async () => {
      mockRedis.exists.mockResolvedValue(false); // Key expired
      
      mockDb.query
        .mockResolvedValueOnce({ rows: [] } as any) // INSERT
        .mockResolvedValueOnce({ rows: [{ count: 1 }] } as any); // get count

      const result = await tracker.recordFailedAttempt({
        username: 'testuser',
        ipAddress: '192.168.1.100',
        errorType: 'invalid_credentials'
      });

      expect(mockRedis.set).toHaveBeenCalledWith('failed_login:testuser:192.168.1.100', '1', 900);
      expect(result.failedAttempts).toBe(1);
    });

    it('should handle Redis connection failures', async () => {
      const redisError = new Error('Redis unavailable');
      mockRedis.exists.mockRejectedValue(redisError);
      
      mockDb.query
        .mockResolvedValueOnce({ rows: [] } as any) // INSERT
        .mockResolvedValueOnce({ rows: [{ count: 1 }] } as any); // get count

      const result = await tracker.recordFailedAttempt({
        username: 'testuser',
        ipAddress: '192.168.1.100',
        errorType: 'invalid_credentials'
      });

      expect(result.isLocked).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith('Error updating Redis counter:', redisError);
    });

    it('should handle missing or invalid lockout expiration dates', async () => {
      const lockoutInfo = {
        isLocked: true,
        lockoutExpiresAt: undefined, // Invalid date
        lockoutReason: 'Test lockout'
      };

      // Private method test
      await (tracker as any).cacheLockout('testuser', '192.168.1.100', lockoutInfo);

      // Should not cache invalid lockout info
      expect(mockRedis.setJson).not.toHaveBeenCalled();
    });

    it('should handle zero or negative TTL values', async () => {
      const expiredLockout = {
        isLocked: true,
        lockoutExpiresAt: new Date(Date.now() - 1000), // Already expired
        lockoutReason: 'Expired lockout'
      };

      await (tracker as any).cacheLockout('testuser', '192.168.1.100', expiredLockout);

      // Should not cache expired lockout
      expect(mockRedis.setJson).not.toHaveBeenCalled();
    });
  });

  describe('Performance and Timeout Testing', () => {
    it('should complete lockout check within reasonable time', async () => {
      const startTime = Date.now();
      
      mockRedis.getJson.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(null), 50))
      );
      mockDb.query.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ rows: [] }), 100))
      );

      await tracker.checkLockoutStatus('testuser', '192.168.1.100');
      
      const endTime = Date.now();
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should handle database timeout gracefully', async () => {
      const timeoutError = new Error('Query timeout');
      mockRedis.getJson.mockResolvedValue(null);
      mockDb.query.mockRejectedValue(timeoutError);

      const result = await tracker.checkLockoutStatus('testuser', '192.168.1.100');

      expect(result.isLocked).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith('Error checking lockout status:', timeoutError);
    });
  });

  describe('getLockoutHistory', () => {
    it('should retrieve lockout history with limit', async () => {
      const mockHistory = [
        {
          id: 1,
          username: 'testuser',
          locked_at: new Date(),
          expires_at: new Date()
        },
        {
          id: 2,
          username: 'testuser',
          locked_at: new Date(),
          expires_at: new Date()
        }
      ];

      mockDb.query.mockResolvedValue({ rows: mockHistory } as any);

      const history = await tracker.getLockoutHistory('testuser', 5);

      expect(history).toEqual(mockHistory);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM account_lockouts'),
        ['testuser', 5]
      );
    });

    it('should return empty array on database errors', async () => {
      const dbError = new Error('Database error');
      mockDb.query.mockRejectedValue(dbError);

      const history = await tracker.getLockoutHistory('testuser');

      expect(history).toEqual([]);
      expect(mockLogger.error).toHaveBeenCalledWith('Error getting lockout history:', dbError);
    });
  });
});