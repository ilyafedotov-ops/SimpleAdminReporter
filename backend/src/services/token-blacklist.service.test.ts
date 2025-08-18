import { tokenBlacklist } from './token-blacklist.service';
import { redis } from '@/config/redis';
import jwt from 'jsonwebtoken';

// Mock dependencies
jest.mock('@/config/redis');
jest.mock('@/utils/logger');

describe('TokenBlacklistService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('blacklistToken', () => {
    it('should blacklist a valid token', async () => {
      const token = jwt.sign(
        { userId: 1, jti: 'test-jti' },
        'test-secret',
        { expiresIn: '1h' }
      );

      const mockSetJson = jest.fn().mockResolvedValue(undefined);
      (redis.setJson as jest.Mock) = mockSetJson;

      await tokenBlacklist.blacklistToken(token, 'Test reason');

      expect(mockSetJson).toHaveBeenCalledWith(
        expect.stringContaining('token:blacklist:test-jti'),
        expect.objectContaining({
          tokenId: 'test-jti',
          userId: 1,
          reason: 'Test reason'
        }),
        expect.any(Number)
      );
    });

    it('should skip blacklisting expired tokens', async () => {
      const token = jwt.sign(
        { userId: 1, jti: 'test-jti' },
        'test-secret',
        { expiresIn: '-1h' } // Already expired
      );

      const mockSetJson = jest.fn();
      (redis.setJson as jest.Mock) = mockSetJson;

      await tokenBlacklist.blacklistToken(token, 'Test reason');

      expect(mockSetJson).not.toHaveBeenCalled();
    });
  });

  describe('isTokenBlacklisted', () => {
    it('should return true for blacklisted token', async () => {
      const token = jwt.sign(
        { userId: 1, jti: 'test-jti' },
        'test-secret',
        { expiresIn: '1h' }
      );

      const mockExists = jest.fn().mockResolvedValue(true);
      (redis.exists as jest.Mock) = mockExists;

      const result = await tokenBlacklist.isTokenBlacklisted(token);

      expect(result).toBe(true);
      expect(mockExists).toHaveBeenCalledWith('token:blacklist:test-jti');
    });

    it('should return false for non-blacklisted token', async () => {
      const token = jwt.sign(
        { userId: 1, jti: 'test-jti' },
        'test-secret',
        { expiresIn: '1h' }
      );

      const mockExists = jest.fn().mockResolvedValue(false);
      (redis.exists as jest.Mock) = mockExists;

      const result = await tokenBlacklist.isTokenBlacklisted(token);

      expect(result).toBe(false);
    });

    it('should return true for invalid tokens', async () => {
      const result = await tokenBlacklist.isTokenBlacklisted('invalid-token');
      expect(result).toBe(true);
    });
  });

  describe('Token Family Management', () => {
    it('should create a new token family', async () => {
      const mockSetJson = jest.fn().mockResolvedValue(undefined);
      (redis.setJson as jest.Mock) = mockSetJson;

      const familyId = await tokenBlacklist.createTokenFamily(1, 'test-token');

      expect(familyId).toMatch(/^1-\d+-\w+$/);
      expect(mockSetJson).toHaveBeenCalledWith(
        expect.stringContaining('token:family:'),
        expect.objectContaining({
          userId: 1,
          familyId: expect.any(String),
          currentToken: 'test-token',
          rotationCount: 0
        }),
        7 * 24 * 60 * 60 // 7 days
      );
    });

    it('should rotate token family successfully', async () => {
      const familyData = {
        userId: 1,
        familyId: 'test-family',
        currentToken: 'old-token',
        rotationCount: 0
      };

      const mockGetJson = jest.fn().mockResolvedValue(familyData);
      const mockSetJson = jest.fn().mockResolvedValue(undefined);
      const mockBlacklistToken = jest.spyOn(tokenBlacklist, 'blacklistToken').mockResolvedValue(undefined);
      
      (redis.getJson as jest.Mock) = mockGetJson;
      (redis.setJson as jest.Mock) = mockSetJson;

      const result = await tokenBlacklist.rotateTokenFamily(
        'test-family',
        'old-token',
        'new-token'
      );

      expect(result).toBe(true);
      expect(mockBlacklistToken).toHaveBeenCalledWith('old-token', 'Token rotation');
      expect(mockSetJson).toHaveBeenCalledWith(
        'token:family:test-family',
        expect.objectContaining({
          currentToken: 'new-token',
          rotationCount: 1
        }),
        7 * 24 * 60 * 60
      );

      mockBlacklistToken.mockRestore();
    });

    it('should detect token reuse and invalidate family', async () => {
      const familyData = {
        userId: 1,
        familyId: 'test-family',
        currentToken: 'current-token',
        rotationCount: 1
      };

      const mockGetJson = jest.fn().mockResolvedValue(familyData);
      const mockInvalidateFamily = jest.spyOn(tokenBlacklist, 'invalidateTokenFamily').mockResolvedValue(undefined);
      
      (redis.getJson as jest.Mock) = mockGetJson;

      const result = await tokenBlacklist.rotateTokenFamily(
        'test-family',
        'old-token', // Wrong token - potential reuse attack
        'new-token'
      );

      expect(result).toBe(false);
      expect(mockInvalidateFamily).toHaveBeenCalledWith('test-family');

      mockInvalidateFamily.mockRestore();
    });
  });
});