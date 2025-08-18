import { redis } from '@/config/redis';
import { logger } from '@/utils/logger';
import jwt from 'jsonwebtoken';

export interface BlacklistEntry {
  tokenId: string;
  userId: number;
  reason: string;
  blacklistedAt: Date;
  expiresAt: Date;
}

export class TokenBlacklistService {
  private static instance: TokenBlacklistService;
  private readonly blacklistPrefix = 'token:blacklist:';
  private readonly tokenFamilyPrefix = 'token:family:';
  
  private constructor() {}
  
  public static getInstance(): TokenBlacklistService {
    if (!TokenBlacklistService.instance) {
      TokenBlacklistService.instance = new TokenBlacklistService();
    }
    return TokenBlacklistService.instance;
  }
  
  /**
   * Add a token to the blacklist
   */
  async blacklistToken(token: string, reason: string): Promise<void> {
    try {
      // Decode token to get expiry and user info
      const decoded = jwt.decode(token) as any;
      if (!decoded) {
        logger.warn('Failed to decode token for blacklisting');
        return;
      }
      
      const tokenId = decoded.jti || this.generateTokenId(token);
      const userId = decoded.userId;
      const expiresAt = new Date(decoded.exp * 1000);
      const now = new Date();
      
      // Calculate TTL for Redis (token remaining lifetime)
      const ttl = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
      
      if (ttl <= 0) {
        logger.debug('Token already expired, skipping blacklist');
        return;
      }
      
      const blacklistEntry: BlacklistEntry = {
        tokenId,
        userId,
        reason,
        blacklistedAt: now,
        expiresAt
      };
      
      // Store in Redis with TTL matching token expiry
      await redis.setJson(
        `${this.blacklistPrefix}${tokenId}`,
        blacklistEntry,
        ttl
      );
      
      logger.info(`Token blacklisted: ${tokenId} for user ${userId}, reason: ${reason}`);
    } catch (error) {
      logger.error('Error blacklisting token:', error);
      throw error;
    }
  }
  
  /**
   * Check if a token is blacklisted
   */
  async isTokenBlacklisted(token: string): Promise<boolean> {
    try {
      const decoded = jwt.decode(token) as any;
      if (!decoded) {
        return true; // Invalid tokens are considered blacklisted
      }
      
      const tokenId = decoded.jti || this.generateTokenId(token);
      const exists = await redis.exists(`${this.blacklistPrefix}${tokenId}`);
      
      return exists;
    } catch (error) {
      logger.error('Error checking token blacklist:', error);
      // In case of error, consider token as blacklisted for security
      return true;
    }
  }
  
  /**
   * Get blacklist entry details
   */
  async getBlacklistEntry(token: string): Promise<BlacklistEntry | null> {
    try {
      const decoded = jwt.decode(token) as any;
      if (!decoded) {
        return null;
      }
      
      const tokenId = decoded.jti || this.generateTokenId(token);
      return await redis.getJson<BlacklistEntry>(`${this.blacklistPrefix}${tokenId}`);
    } catch (error) {
      logger.error('Error getting blacklist entry:', error);
      return null;
    }
  }
  
  /**
   * Blacklist all tokens for a user
   */
  async blacklistUserTokens(userId: number, reason: string): Promise<void> {
    try {
      // This would require tracking all active tokens per user
      // For now, we'll log the intent
      logger.info(`Request to blacklist all tokens for user ${userId}, reason: ${reason}`);
      
      // In a full implementation, you would:
      // 1. Track all issued tokens per user
      // 2. Iterate through them and blacklist each
      // 3. Or use a user-level blacklist flag
    } catch (error) {
      logger.error('Error blacklisting user tokens:', error);
      throw error;
    }
  }
  
  /**
   * Generate a token ID from token content (for tokens without JTI)
   */
  private generateTokenId(token: string): string {
    // Use first 16 chars of token signature as ID
    const parts = token.split('.');
    if (parts.length === 3) {
      return parts[2].substring(0, 16);
    }
    return token.substring(0, 16);
  }
  
  /**
   * Token Family Management for Refresh Token Rotation
   */
  
  /**
   * Create a new token family
   */
  async createTokenFamily(userId: number, refreshToken: string): Promise<string> {
    try {
      const familyId = `${userId}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      const familyData = {
        userId,
        familyId,
        currentToken: refreshToken,
        createdAt: new Date(),
        lastRotated: new Date(),
        rotationCount: 0
      };
      
      // Store family data with 7 day TTL (matching refresh token expiry)
      await redis.setJson(
        `${this.tokenFamilyPrefix}${familyId}`,
        familyData,
        7 * 24 * 60 * 60 // 7 days in seconds
      );
      
      logger.info(`Created token family ${familyId} for user ${userId}`);
      return familyId;
    } catch (error) {
      logger.error('Error creating token family:', error);
      throw error;
    }
  }
  
  /**
   * Rotate refresh token in a family
   */
  async rotateTokenFamily(familyId: string, oldToken: string, newToken: string): Promise<boolean> {
    try {
      const familyKey = `${this.tokenFamilyPrefix}${familyId}`;
      const familyData = await redis.getJson<any>(familyKey);
      
      if (!familyData) {
        logger.warn(`Token family not found: ${familyId}`);
        return false;
      }
      
      // Check if the old token matches the current token
      if (familyData.currentToken !== oldToken) {
        // Potential token reuse attack - invalidate entire family
        logger.error(`Token reuse detected for family ${familyId}`);
        await this.invalidateTokenFamily(familyId);
        return false;
      }
      
      // Update family with new token
      familyData.currentToken = newToken;
      familyData.lastRotated = new Date();
      familyData.rotationCount += 1;
      
      // Blacklist the old token
      await this.blacklistToken(oldToken, 'Token rotation');
      
      // Update family data
      await redis.setJson(familyKey, familyData, 7 * 24 * 60 * 60);
      
      logger.info(`Rotated token family ${familyId}, rotation count: ${familyData.rotationCount}`);
      return true;
    } catch (error) {
      logger.error('Error rotating token family:', error);
      throw error;
    }
  }
  
  /**
   * Invalidate an entire token family
   */
  async invalidateTokenFamily(familyId: string): Promise<void> {
    try {
      const familyKey = `${this.tokenFamilyPrefix}${familyId}`;
      const familyData = await redis.getJson<any>(familyKey);
      
      if (familyData) {
        // Blacklist the current token
        await this.blacklistToken(familyData.currentToken, 'Family invalidated');
        
        // Delete the family
        await redis.del(familyKey);
        
        logger.warn(`Invalidated token family ${familyId} for user ${familyData.userId}`);
      }
    } catch (error) {
      logger.error('Error invalidating token family:', error);
      throw error;
    }
  }
  
  /**
   * Get token family data
   */
  async getTokenFamily(familyId: string): Promise<any> {
    try {
      return await redis.getJson(`${this.tokenFamilyPrefix}${familyId}`);
    } catch (error) {
      logger.error('Error getting token family:', error);
      return null;
    }
  }
  
  /**
   * Clean up expired blacklist entries (called periodically)
   */
  async cleanupExpiredEntries(): Promise<number> {
    try {
      // Redis automatically removes entries with TTL, so this is mainly for logging
      const pattern = `${this.blacklistPrefix}*`;
      const keys = await redis.getClient().keys(pattern);
      logger.debug(`Token blacklist contains ${keys.length} entries`);
      return keys.length;
    } catch (error) {
      logger.error('Error during blacklist cleanup:', error);
      return 0;
    }
  }
}

// Export singleton instance
export const tokenBlacklist = TokenBlacklistService.getInstance();