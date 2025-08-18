import { Request } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { db } from '@/config/database';
import { redis } from '@/config/redis';
import { logger } from '@/utils/logger';
import { createError } from '@/middleware/error.middleware';
import { tokenBlacklist } from '@/services/token-blacklist.service';
import { failedLoginTracker } from '@/services/failed-login-tracker.service';
import { auditLogger } from '@/services/audit-logger.service';
import { csrfService } from '@/services/csrf.service';
import { 
  User, 
  LoginRequest, 
  LoginResponse, 
  JWTPayload, 
  RefreshTokenPayload,
  SessionData,
  CachedUser,
  AuthMode 
} from '../types';

export interface UnifiedAuthOptions {
  mode?: AuthMode;
  generateCSRF?: boolean;
}

/**
 * Unified Authentication Service that supports both JWT and Cookie-based authentication modes
 * This service absorbs all functionality from legacy auth services
 */
export class UnifiedAuthenticationService {
  private defaultMode: AuthMode;

  private jwtSecret: string;
  private refreshSecret: string;
  private accessTokenExpiry = '1h';
  private refreshTokenExpiry = '7d';
  private sessionPrefix = 'session:';
  private userCache = new Map<number, CachedUser>();
  private cacheTTL = 60000; // 1 minute cache
  private maxCacheSize = 1000; // Maximum number of cached users
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Always use JWT mode
    this.defaultMode = AuthMode.JWT;
    
    // Check for JWT secrets in environment
    const jwtSecret = process.env.JWT_SECRET;
    const refreshSecret = process.env.JWT_REFRESH_SECRET;
    
    // In production, both secrets must be explicitly set
    if (process.env.NODE_ENV === 'production') {
      if (!jwtSecret || jwtSecret.length < 32) {
        throw new Error('JWT_SECRET must be set in production environment with at least 32 characters');
      }
      if (!refreshSecret || refreshSecret.length < 32) {
        throw new Error('JWT_REFRESH_SECRET must be set in production environment with at least 32 characters');
      }
    }
    
    // Set secrets with no fallback in production
    this.jwtSecret = jwtSecret || (process.env.NODE_ENV === 'production' 
      ? (() => { throw new Error('JWT_SECRET is required'); })() 
      : 'development-secret-change-in-production');
      
    this.refreshSecret = refreshSecret || (process.env.NODE_ENV === 'production'
      ? (() => { throw new Error('JWT_REFRESH_SECRET is required'); })()  
      : 'development-refresh-secret');
    
    // Periodically clean expired cache entries only in non-test environments
    if (process.env.NODE_ENV !== 'test') {
      this.cleanupInterval = setInterval(() => {
        this.cleanExpiredCache();
      }, this.cacheTTL);
    }
  }

  /**
   * Unified authenticate method that supports both JWT and cookie modes
   */
  async authenticate(
    loginRequest: LoginRequest, 
    request?: Request,
    options: UnifiedAuthOptions = {}
  ): Promise<LoginResponse> {
    const { username, password, authSource = 'ad' } = loginRequest;
    const mode = options.mode || this.defaultMode;
    const generateCSRF = options.generateCSRF ?? (mode === AuthMode.COOKIE);
    const ipAddress = this.getIpAddress(request);
    const userAgent = request?.get('user-agent');

    try {
      logger.info(`Authentication attempt: ${username} via ${authSource}`);

      // Check if account is locked
      const lockoutInfo = await failedLoginTracker.checkLockoutStatus(username, ipAddress);
      if (lockoutInfo.isLocked) {
        // Log the locked attempt
        await auditLogger.logAuth('account_locked', 
          { request }, 
          { 
            username, 
            authSource,
            lockoutExpiresAt: lockoutInfo.lockoutExpiresAt,
            reason: lockoutInfo.lockoutReason 
          },
          false
        );
        
        const lockoutMinutes = lockoutInfo.lockoutExpiresAt 
          ? Math.ceil((lockoutInfo.lockoutExpiresAt.getTime() - Date.now()) / 60000)
          : 0;
          
        throw createError(
          `Account is locked due to too many failed attempts. Please try again in ${lockoutMinutes} minutes.`, 
          423 // Locked status code
        );
      }

      // Authenticate user based on source
      let isAuthenticated = false;
      let userInfo: any = null;
      let authError: 'invalid_credentials' | 'user_not_found' | 'user_inactive' | 'service_error' = 'invalid_credentials';

      // Use service factory for dependency injection
      const { serviceFactory } = await import('@/services/service.factory');
      
      switch (authSource) {
        case 'ad':
          const adService = await serviceFactory.getADService();
          logger.info(`Attempting AD authentication for user: ${username}`);
          
          try {
            isAuthenticated = await adService.authenticateUser(username, password);
            logger.info(`AD authentication result for ${username}: ${isAuthenticated}`);
            
            if (isAuthenticated) {
              // Use system credentials context for getting user info during authentication
              const systemContext = { useSystemCredentials: true };
              logger.info(`Getting user info for ${username} with system credentials`);
              userInfo = await adService.getUser(username, systemContext);
              logger.info(`User info retrieved: ${userInfo ? 'success' : 'failed'}`);
              
              if (!userInfo) {
                authError = 'user_not_found';
                isAuthenticated = false;
              }
            }
          } catch (serviceError) {
            logger.error(`AD service error for ${username}:`, serviceError);
            authError = 'service_error';
            isAuthenticated = false;
          }
          break;

        case 'azure':
          // Azure AD authentication would typically use OAuth2 flow
          // For now, we'll check if user exists in Azure AD
          try {
            const azureService = await serviceFactory.getAzureService();
            userInfo = await azureService.getUser(username);
            isAuthenticated = !!userInfo;
            if (!userInfo) {
              authError = 'user_not_found';
            }
          } catch (serviceError) {
            logger.error(`Azure service error for ${username}:`, serviceError);
            authError = 'service_error';
            isAuthenticated = false;
          }
          break;

        case 'local':
          isAuthenticated = await this.authenticateLocalUser(username, password);
          if (isAuthenticated) {
            userInfo = await this.getLocalUser(username);
            if (!userInfo) {
              authError = 'user_not_found';
              isAuthenticated = false;
            } else if (!userInfo.is_active) {
              authError = 'user_inactive';
              isAuthenticated = false;
            }
          }
          break;

        default:
          throw createError('Invalid authentication source', 400);
      }

      if (!isAuthenticated || !userInfo) {
        // Record failed attempt
        await failedLoginTracker.recordFailedAttempt({
          username,
          ipAddress: ipAddress || 'unknown',
          userAgent,
          authSource,
          errorType: authError
        });

        // Log failed authentication
        await auditLogger.logAuth('login_failed',
          { request },
          { 
            username, 
            authSource,
            errorType: authError,
            failedAttempts: lockoutInfo.failedAttempts 
          },
          false,
          authError
        );

        logger.warn(`Authentication failed for user: ${username}, error: ${authError}`);
        
        // Throw specific error messages based on the error type
        switch (authError) {
          case 'user_not_found':
            throw createError('User not found', 401);
          case 'user_inactive':
            throw createError('User account is inactive', 403);
          case 'service_error':
            throw createError('Authentication service unavailable', 503);
          case 'invalid_credentials':
          default:
            throw createError('Invalid credentials', 401);
        }
      }

      // Get or create user in database
      const user = await this.getOrCreateUser(userInfo, authSource);
      
      // Check if user is active
      if (!user.isActive) {
        await auditLogger.logAuth('login_failed',
          { request },
          { username, authSource, reason: 'User account is inactive' },
          false,
          'user_inactive'
        );
        throw createError('User account is inactive', 403);
      }
      
      // Clear failed attempts on successful authentication
      if (ipAddress) {
        await failedLoginTracker.clearFailedAttempts(username, ipAddress);
      }
      
      // Update last login
      await this.updateLastLogin(user.id);

      // Generate tokens
      const sessionId = await this.createSession(user, mode);
      const accessToken = this.generateAccessToken(user, sessionId);
      const refreshToken = await this.generateRefreshToken(user.id, sessionId);

      // Log successful authentication
      await auditLogger.logAuth('login',
        { request, user, sessionId },
        { 
          authSource,
          sessionDuration: '1 hour'
        },
        true
      );

      logger.info(`Authentication successful for user: ${username}`);

      const response: LoginResponse = {
        user,
        accessToken,
        refreshToken,
        expiresIn: 3600, // 1 hour
        csrfToken: generateCSRF ? csrfService.generateToken() : undefined
      };

      // Always return tokens for JWT mode

      return response;

    } catch (error) {
      logger.error(`Authentication error for user ${username}:`, error);
      throw error;
    }
  }

  /**
   * Authenticate local user with username and password
   */
  private async authenticateLocalUser(username: string, password: string): Promise<boolean> {
    try {
      const _result = await db.query(
        'SELECT password_hash FROM users WHERE username = $1 AND auth_source = $2 AND is_active = true',
        [username, 'local']
      );

      if (_result.rows.length === 0) {
        return false;
      }

      const passwordHash = _result.rows[0].password_hash;
      return await bcrypt.compare(password, passwordHash);
    } catch (error) {
      logger.error('Error authenticating local user:', error);
      return false;
    }
  }

  /**
   * Get local user information
   */
  private async getLocalUser(username: string): Promise<any> {
    try {
      const _result = await db.query(
        'SELECT * FROM users WHERE username = $1 AND auth_source = $2',
        [username, 'local']
      );
      return _result.rows.length > 0 ? _result.rows[0] : null;
    } catch (error) {
      logger.error('Error getting local user:', error);
      return null;
    }
  }

  /**
   * Get or create user in database
   */
  private async getOrCreateUser(userInfo: any, authSource: string): Promise<User> {
    // Log the received userInfo for debugging
    logger.debug('getOrCreateUser received userInfo:', { authSource, userInfo });
    
    // Map user info based on auth source
    let mappedUser: any;
    
    if (authSource === 'ad') {
      // Handle StandardADUser format from AD service
      const username = userInfo.username || 
                      userInfo.sAMAccountName || 
                      userInfo.samaccountname || 
                      userInfo.userPrincipalName || 
                      userInfo.userprincipalname ||
                      userInfo.cn ||
                      userInfo.uid;
                      
      if (!username) {
        logger.error('No username found in AD user info', { userInfo });
        throw createError('Username not found in AD user information', 400);
      }
      
      mappedUser = {
        username,
        displayName: userInfo.displayName || userInfo.displayname || userInfo.name || userInfo.cn || username,
        email: userInfo.email || userInfo.mail || userInfo.userPrincipalName || userInfo.userprincipalname,
        externalId: this.convertGuidToString(userInfo.objectGUID) || 
                   this.convertGuidToString(userInfo.objectguid) || 
                   userInfo.distinguishedName || 
                   userInfo.dn,
        department: userInfo.department,
        title: userInfo.title,
        authSource: 'ad'
      };
    } else if (authSource === 'azure' || authSource === 'o365') {
      const username = userInfo.userPrincipalName || userInfo.mail || userInfo.email;
      
      if (!username) {
        logger.error('No username found in Azure/O365 user info', { userInfo });
        throw createError('Username not found in Azure/O365 user information', 400);
      }
      
      mappedUser = {
        username,
        displayName: userInfo.displayName || userInfo.name || username,
        email: userInfo.mail || userInfo.email || userInfo.userPrincipalName,
        externalId: userInfo.id,
        department: userInfo.department,
        title: userInfo.jobTitle,
        authSource
      };
    } else if (authSource === 'local') {
      // For local users, userInfo is already from our database
      return {
        id: userInfo.id,
        username: userInfo.username,
        displayName: userInfo.display_name,
        email: userInfo.email,
        authSource: userInfo.auth_source,
        externalId: userInfo.external_id,
        department: userInfo.department,
        title: userInfo.title,
        isAdmin: userInfo.is_admin,
        isActive: userInfo.is_active,
        lastLogin: userInfo.last_login
      };
    } else {
      throw createError('Unsupported authentication source', 400);
    }

    try {
      // Check if user exists
      const existingUser = await db.query(
        'SELECT * FROM users WHERE username = $1 AND auth_source = $2',
        [mappedUser.username, mappedUser.authSource]
      );

      if (existingUser.rows.length > 0) {
        // Update existing user
        const user = existingUser.rows[0];
        const updatedUser = await db.query(
          `UPDATE users 
           SET display_name = $1, email = $2, department = $3, title = $4, external_id = $5, updated_at = NOW()
           WHERE id = $6
           RETURNING *`,
          [
            mappedUser.displayName,
            mappedUser.email,
            mappedUser.department,
            mappedUser.title,
            mappedUser.externalId,
            user.id
          ]
        );

        const userData = updatedUser.rows[0];
        return {
          id: userData.id,
          username: userData.username,
          displayName: userData.display_name,
          email: userData.email,
          authSource: userData.auth_source,
          externalId: userData.external_id,
          department: userData.department,
          title: userData.title,
          isAdmin: userData.is_admin,
          isActive: userData.is_active,
          lastLogin: userData.last_login
        };
      } else {
        // Validate required fields before insert
        if (!mappedUser.username) {
          logger.error('Cannot create user without username', { mappedUser });
          throw createError('Username is required to create user', 400);
        }
        
        // Create new user
        const newUser = await db.query(
          `INSERT INTO users (username, display_name, email, auth_source, external_id, department, title, is_admin, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING *`,
          [
            mappedUser.username,
            mappedUser.displayName || mappedUser.username,
            mappedUser.email,
            mappedUser.authSource,
            mappedUser.externalId,
            mappedUser.department,
            mappedUser.title,
            false, // is_admin defaults to false
            true   // is_active defaults to true
          ]
        );

        const userData = newUser.rows[0];
        return {
          id: userData.id,
          username: userData.username,
          displayName: userData.display_name,
          email: userData.email,
          authSource: userData.auth_source,
          externalId: userData.external_id,
          department: userData.department,
          title: userData.title,
          isAdmin: userData.is_admin,
          isActive: userData.is_active,
          lastLogin: userData.last_login
        };
      }
    } catch (error) {
      logger.error('Error getting or creating user:', error);
      throw createError('Failed to process user information', 500);
    }
  }

  /**
   * Convert GUID Buffer to string format
   */
  private convertGuidToString(guid: any): string | null {
    if (!guid) return null;
    
    // If it's already a string, return it
    if (typeof guid === 'string') return guid;
    
    // If it's a Buffer, convert to hex string
    if (Buffer.isBuffer(guid)) {
      return guid.toString('hex');
    }
    
    // If it's an object with Buffer data (like {"type": "Buffer", "data": [...]})
    if (guid && guid.type === 'Buffer' && Array.isArray(guid.data)) {
      return Buffer.from(guid.data).toString('hex');
    }
    
    // Fallback: convert to string
    return String(guid);
  }

  /**
   * Update user's last login timestamp
   */
  private async updateLastLogin(userId: number): Promise<void> {
    try {
      await db.query(
        'UPDATE users SET last_login = NOW() WHERE id = $1',
        [userId]
      );
    } catch (error) {
      logger.error('Error updating last login:', error);
      // Non-critical error, don't throw
    }
  }

  /**
   * Generate JWT access token
   */
  private generateAccessToken(user: User, sessionId: string): string {
    const jti = randomBytes(16).toString('hex');
    
    const payload: JWTPayload = {
      userId: user.id,
      username: user.username,
      authSource: user.authSource,
      isAdmin: user.isAdmin,
      sessionId,
      jti,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600 // 1 hour
    };

    return jwt.sign(payload, this.jwtSecret);
  }

  /**
   * Generate refresh token
   */
  private async generateRefreshToken(userId: number, sessionId: string, familyId?: string): Promise<string> {
    const jti = randomBytes(16).toString('hex');
    const tokenFamilyId = familyId || randomBytes(16).toString('hex');

    const payload: RefreshTokenPayload = {
      userId,
      sessionId,
      familyId: tokenFamilyId,
      jti,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (7 * 24 * 3600) // 7 days
    };

    const token = jwt.sign(payload, this.refreshSecret);

    // Store token family in Redis for rotation tracking
    await redis.setJson(
      `token_family:${tokenFamilyId}`,
      { 
        userId, 
        sessionId, 
        latestJti: jti,
        createdAt: new Date(),
        rotatedAt: new Date()
      },
      7 * 24 * 3600 // 7 days
    );

    return token;
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(
    refreshToken: string, 
    request?: Request,
    options: UnifiedAuthOptions = {}
  ): Promise<LoginResponse> {
    const mode = options.mode || this.defaultMode;
    const generateCSRF = options.generateCSRF ?? (mode === AuthMode.COOKIE);
    const ipAddress = this.getIpAddress(request);

    try {
      // Verify refresh token
      let payload: RefreshTokenPayload;
      try {
        payload = jwt.verify(refreshToken, this.refreshSecret) as RefreshTokenPayload;
      } catch (error: any) {
        if (error.name === 'TokenExpiredError') {
          throw createError('Refresh token has expired', 401);
        } else if (error.name === 'JsonWebTokenError') {
          throw createError('Invalid refresh token', 401);
        }
        throw error;
      }

      // Check if token is blacklisted
      const isBlacklisted = await tokenBlacklist.isTokenBlacklisted(refreshToken);
      if (isBlacklisted) {
        logger.warn(`Attempt to use blacklisted refresh token for user ${payload.userId}`);
        throw createError('Invalid refresh token', 401);
      }

      // Validate token family for rotation detection
      if (payload.familyId) {
        const familyData = await redis.getJson(`token_family:${payload.familyId}`) as any;
        
        if (!familyData) {
          // Token family not found - possible token reuse after rotation
          logger.warn(`Token family not found for refresh token. Possible token reuse attack for user ${payload.userId}`);
          await this.handleSuspiciousTokenUse(payload.userId, payload.sessionId, ipAddress);
          throw createError('Invalid refresh token', 401);
        }

        // Check if this is the latest token in the family
        if (familyData.latestJti && familyData.latestJti !== payload.jti) {
          // Old token being reused - possible theft
          logger.warn(`Old refresh token reused. Possible token theft for user ${payload.userId}`);
          await this.handleSuspiciousTokenUse(payload.userId, payload.sessionId, ipAddress);
          
          // Invalidate entire token family
          await redis.del(`token_family:${payload.familyId}`);
          throw createError('Invalid refresh token', 401);
        }
      }

      // Get user from database
      const user = await this.getUserById(payload.userId);
      if (!user || !user.isActive) {
        throw createError('User not found or inactive', 401);
      }

      // Verify session is still valid
      const session = await redis.getJson(`${this.sessionPrefix}${payload.sessionId}`) as SessionData;
      if (!session) {
        throw createError('Session expired', 401);
      }

      // Blacklist old refresh token
      await tokenBlacklist.blacklistToken(refreshToken, 'Token rotation');

      // Generate new tokens
      const newAccessToken = this.generateAccessToken(user, payload.sessionId);
      const newRefreshToken = await this.generateRefreshToken(user.id, payload.sessionId, payload.familyId);

      // Log token refresh
      await auditLogger.logAuth('token_refresh',
        { request, user, sessionId: payload.sessionId },
        { tokenFamily: payload.familyId },
        true
      );

      const response: LoginResponse = {
        user,
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        expiresIn: 3600,
        csrfToken: generateCSRF ? csrfService.generateToken() : undefined
      };

      // For cookie mode, limit returned data
      if (mode === AuthMode.COOKIE && !this.shouldReturnTokens()) {
        delete response.accessToken;
        delete response.refreshToken;
      }

      return response;

    } catch (error) {
      logger.error('Error refreshing access token:', error);
      throw error;
    }
  }

  /**
   * Handle suspicious token use
   */
  private async handleSuspiciousTokenUse(userId: number, sessionId: string, ipAddress?: string): Promise<void> {
    // Log security event
    await auditLogger.logAuth('login_failed',
      { 
        user: { id: userId, username: 'unknown' },
        sessionId 
      },
      { 
        reason: 'Possible token theft detected',
        ipAddress 
      },
      false
    );

    // Logout all sessions for this user as a precaution
    await this.logoutAllSessions(userId);
  }

  /**
   * Verify access token
   */
  async verifyAccessToken(token: string, options?: { skipBlacklistCheck?: boolean }): Promise<User> {
    try {
      // Verify JWT token
      let payload: JWTPayload;
      try {
        payload = jwt.verify(token, this.jwtSecret) as JWTPayload;
      } catch (error: any) {
        if (error.name === 'TokenExpiredError') {
          throw createError('Access token has expired', 401);
        } else if (error.name === 'JsonWebTokenError') {
          throw createError('Invalid access token', 401);
        }
        throw error;
      }

      // Check if token is blacklisted (unless skipped for performance)
      if (!options?.skipBlacklistCheck) {
        const isBlacklisted = await tokenBlacklist.isTokenBlacklisted(token);
        if (isBlacklisted) {
          logger.warn(`Attempt to use blacklisted access token for user ${payload.userId}`);
          throw createError('Invalid access token', 401);
        }
      }

      // Verify session is still valid
      const session = await redis.getJson(`${this.sessionPrefix}${payload.sessionId}`) as SessionData;
      if (!session) {
        throw createError('Session expired', 401);
      }

      // Get user from cache or database
      return await this.getCachedOrFreshUser(payload.userId);

    } catch (error: any) {
      // Don't re-wrap already created errors
      if (error.statusCode) {
        throw error;
      }
      throw error;
    }
  }

  /**
   * Extract refresh token from request based on mode
   */
  extractRefreshToken(req: Request, mode?: AuthMode): string | null {
    const _authMode = mode || this.defaultMode;

    if (_authMode === AuthMode.COOKIE) {
      // Try cookie first
      const cookieToken = req.cookies?.refresh_token;
      if (cookieToken) return cookieToken;
    }

    // Fall back to body (for both modes)
    return req.body?.refreshToken || null;
  }

  /**
   * Determine if tokens should be returned in response body
   * This supports migration scenarios
   */
  private shouldReturnTokens(): boolean {
    return process.env.SUPPORT_LEGACY_AUTH === 'true';
  }

  /**
   * Get authentication mode from request
   */
  getAuthMode(req: Request): AuthMode {
    // Check for session cookie
    if (req.cookies?.sessionId) {
      return AuthMode.COOKIE;
    }
    
    // Check for JWT in Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return AuthMode.JWT;
    }
    
    // Default to JWT mode
    return AuthMode.JWT;
  }

  /**
   * Helper to get user from cache or database
   */
  private async getCachedOrFreshUser(userId: number): Promise<User> {
    // Check cache first
    const cached = this.userCache.get(userId);
    if (cached && (Date.now() - cached.timestamp) < this.cacheTTL) {
      return cached.user;
    }

    // Get fresh user data
    const user = await this.getUserById(userId);
    if (!user) {
      throw createError('User not found or inactive', 401);
    }

    // Update cache
    this.updateUserCache(userId, user);
    return user;
  }

  /**
   * Update user cache with size management
   */
  private updateUserCache(userId: number, user: User): void {
    if (this.userCache.size >= this.maxCacheSize) {
      // Remove oldest entry
      const firstKey = this.userCache.keys().next().value;
      if (firstKey !== undefined) {
        this.userCache.delete(firstKey);
      }
    }

    this.userCache.set(userId, {
      user,
      timestamp: Date.now()
    });
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: number): Promise<User | null> {
    try {
      const _result = await db.query(
        "SELECT * FROM users WHERE id = $1",
        [userId]
      );

      if (_result.rows.length === 0) {
        return null;
      }

      const user = _result.rows[0];
      return {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        email: user.email,
        authSource: user.auth_source,
        externalId: user.external_id,
        department: user.department,
        title: user.title,
        isAdmin: user.is_admin,
        isActive: user.is_active,
        lastLogin: user.last_login
      };
    } catch (error) {
      logger.error(`Error getting user by ID ${userId}:`, error);
      return null;
    }
  }

  /**
   * Logout user session
   */
  async logout(sessionId: string, token?: string, request?: Request): Promise<void> {
    try {
      // Get session info for audit logging
      const session = await redis.getJson(`${this.sessionPrefix}${sessionId}`) as any;
      const userId = session?.userId;
      const username = session?.username;

      // Blacklist the current token if provided
      if (token) {
        await tokenBlacklist.blacklistToken(token, 'User logout');
      }
      
      // Remove session from Redis
      await redis.del(`${this.sessionPrefix}${sessionId}`);

      // Delete session from database (since there's no is_active column)
      await db.query(
        'DELETE FROM user_sessions WHERE id = $1',
        [sessionId]
      );

      // Log logout event
      await auditLogger.logAuth('logout',
        { 
          request,
          user: userId ? { id: userId, username } : undefined,
          sessionId 
        },
        { sessionDuration: session ? Math.round((Date.now() - new Date(session.createdAt).getTime()) / 1000) : null },
        true
      );

      logger.info(`Session ${sessionId} logged out`);
    } catch (error) {
      logger.error(`Error during logout for session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Logout all user sessions
   */
  async logoutAllSessions(userId: number): Promise<void> {
    try {
      // Clear user from cache
      this.userCache.delete(userId);
      
      // Get all session IDs for user
      const sessions = await db.query(
        'SELECT id FROM user_sessions WHERE user_id = $1',
        [userId]
      );

      // Remove all sessions from Redis
      const deletePromises = sessions.rows.map((session: any) => 
        redis.del(`${this.sessionPrefix}${session.id}`)
      );
      await Promise.all(deletePromises);

      // Delete all sessions from database (since there's no is_active column)
      await db.query(
        'DELETE FROM user_sessions WHERE user_id = $1',
        [userId]
      );

      logger.info(`All sessions logged out for user ${userId}`);
    } catch (error) {
      logger.error(`Error during logout all sessions for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Update user profile
   */
  async updateUserProfile(userId: number, updateData: {
    displayName?: string;
    email?: string;
    department?: string;
    title?: string;
  }): Promise<User | null> {
    try {
      // Build dynamic update query
      const updateFields: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (updateData.displayName !== undefined) {
        updateFields.push(`display_name = $${paramIndex++}`);
        values.push(updateData.displayName);
      }
      if (updateData.email !== undefined) {
        updateFields.push(`email = $${paramIndex++}`);
        values.push(updateData.email);
      }
      if (updateData.department !== undefined) {
        updateFields.push(`department = $${paramIndex++}`);
        values.push(updateData.department);
      }
      if (updateData.title !== undefined) {
        updateFields.push(`title = $${paramIndex++}`);
        values.push(updateData.title);
      }

      if (updateFields.length === 0) {
        // No fields to update, return current user
        return this.getUserById(userId);
      }

      // Add userId as last parameter
      values.push(userId);
      updateFields.push(`updated_at = NOW()`);

      const query = `
        UPDATE users 
        SET ${updateFields.join(', ')} 
        WHERE id = $${paramIndex}
        RETURNING *
      `;

      const _result = await db.query(query, values);

      if (_result.rows.length === 0) {
        return null;
      }

      const user = _result.rows[0];
      const updatedUser: User = {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        email: user.email,
        authSource: user.auth_source,
        externalId: user.external_id,
        department: user.department,
        title: user.title,
        isAdmin: user.is_admin,
        isActive: user.is_active,
        lastLogin: user.last_login
      };
      
      // Invalidate cache for this user
      this.userCache.delete(userId);
      
      return updatedUser;
    } catch (error) {
      logger.error(`Error updating user profile for ID ${userId}:`, error);
      return null;
    }
  }

  /**
   * Change user password
   */
  async changePassword(userId: number, currentPassword: string, newPassword: string, request?: Request): Promise<void> {
    try {
      // Get user from database
      const userResult = await db.query(
        'SELECT username, password_hash, auth_source FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        throw createError('User not found', 404);
      }

      const user = userResult.rows[0];

      // Only local users can change passwords
      if (user.auth_source !== 'local') {
        throw createError('Password change is only available for local users', 400);
      }

      // Verify current password
      const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);
      if (!isValidPassword) {
        // Log failed password change attempt
        await auditLogger.logAuth('login_failed',
          { request, user: { id: userId, username: user.username } },
          { reason: 'Invalid current password' },
          false
        );
        throw createError('Current password is incorrect', 401);
      }

      // Hash new password
      const newPasswordHash = await bcrypt.hash(newPassword, 10);

      // Update password
      await db.query(
        'UPDATE users SET password_hash = $1, password_changed_at = NOW() WHERE id = $2',
        [newPasswordHash, userId]
      );

      // Invalidate all sessions for this user (force re-authentication)
      await this.logoutAllSessions(userId);

      // Log successful password change
      await auditLogger.logAuth('login',
        { request, user: { id: userId, username: user.username } },
        { forcedLogout: true },
        true
      );

      logger.info(`Password changed for user ${userId}`);
    } catch (error) {
      logger.error(`Error changing password for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Create a new local user
   */
  async createLocalUser(userData: {
    username: string;
    password: string;
    displayName: string;
    email: string;
    isAdmin?: boolean;
  }): Promise<User> {
    try {
      // Check if username already exists
      const existingUser = await db.query(
        'SELECT id FROM users WHERE username = $1',
        [userData.username]
      );

      if (existingUser.rows.length > 0) {
        throw createError('Username already exists', 409);
      }

      // Hash password
      const passwordHash = await bcrypt.hash(userData.password, 10);

      // Create user
      const _result = await db.query(
        "INSERT INTO users (username, password_hash, display_name, email, auth_source, is_admin, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
        [
          userData.username,
          passwordHash,
          userData.displayName,
          userData.email,
          "local",
          userData.isAdmin || false,
          true
        ]
      );

      const user = _result.rows[0];
      
      // Log user creation
      await auditLogger.logAuth('login',
        { user: { id: user.id, username: user.username } },
        { authSource: 'local', isAdmin: user.is_admin },
        true
      );

      return {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        email: user.email,
        authSource: user.auth_source,
        externalId: user.external_id,
        department: user.department,
        title: user.title,
        isAdmin: user.is_admin,
        isActive: user.is_active,
        lastLogin: user.last_login
      };
    } catch (error) {
      logger.error('Error creating local user:', error);
      throw error;
    }
  }

  /**
   * Test connections to all authentication sources
   */
  async testAuthConnections(): Promise<{
    ad: { connected: boolean; error?: string };
    azure: { connected: boolean; error?: string };
    o365: { connected: boolean; error?: string };
    local: { connected: boolean; error?: string };
  }> {
    const results = {
      ad: { connected: false, error: undefined as string | undefined },
      azure: { connected: false, error: undefined as string | undefined },
      o365: { connected: false, error: undefined as string | undefined },
      local: { connected: false, error: undefined as string | undefined }
    };

    // Test local database connection
    try {
      await db.query("SELECT 1");
      results.local.connected = true;
    } catch (error) {
      results.local.error = error instanceof Error ? ((error as any)?.message || String(error)) : 'Unknown error';
    }

    // Test AD connection
    try {
      const { getADService } = await import('@/services/ad.service');
      const adService = getADService();
      if (adService && typeof adService.testConnection === 'function') {
        await adService.testConnection();
        results.ad.connected = true;
      } else {
        results.ad.error = 'AD service not available';
      }
    } catch (error) {
      results.ad.error = error instanceof Error ? ((error as any)?.message || String(error)) : 'AD connection failed';
    }

    // Test Azure AD connection
    try {
      const { serviceFactory } = await import('@/services/service.factory');
      const azureService = await serviceFactory.getAzureService();
      if (azureService && typeof azureService.testConnection === 'function') {
        await azureService.testConnection();
        results.azure.connected = true;
      } else {
        results.azure.error = 'Azure service not available';
      }
    } catch (error) {
      results.azure.error = error instanceof Error ? ((error as any)?.message || String(error)) : 'Azure AD connection failed';
    }

    // Test O365 connection (often same as Azure)
    try {
      const { serviceFactory } = await import('@/services/service.factory');
      const o365Service = await serviceFactory.getO365Service();
      if (o365Service && typeof o365Service.testConnection === 'function') {
        await o365Service.testConnection();
        results.o365.connected = true;
      } else {
        results.o365.error = 'O365 service not available';
      }
    } catch (error) {
      results.o365.error = error instanceof Error ? ((error as any)?.message || String(error)) : 'O365 connection failed';
    }

    return results;
  }

  /**
   * Clean expired cache entries
   */
  private cleanExpiredCache(): void {
    const now = Date.now();
    const entriesToDelete: number[] = [];
    
    for (const [userId, cached] of this.userCache.entries()) {
      if (now - cached.timestamp >= this.cacheTTL) {
        entriesToDelete.push(userId);
      }
    }
    
    for (const userId of entriesToDelete) {
      this.userCache.delete(userId);
    }
    
    if (entriesToDelete.length > 0) {
      logger.debug(`Cleaned ${entriesToDelete.length} expired entries from user cache`);
    }
  }

  /**
   * Create session with mode awareness
   */
  async createSession(user: User, _mode?: AuthMode): Promise<string> {
    /* const authMode = mode || this.defaultMode; */
    
    // Store session in database and let it generate UUID
    // Note: auth_mode is stored in Redis session data, not in database
    const tokenHash = randomBytes(32).toString('hex'); // Generate a token hash for the session
    const _result = await db.query(
      "INSERT INTO user_sessions (user_id, token_hash, created_at, expires_at) VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '7 days') RETURNING id",
      [user.id, tokenHash]
    );
    
    if (!_result?.rows?.[0]?.id) {
      throw createError('Failed to create session - database insert failed', 500);
    }
    
    const sessionId = _result.rows[0].id;

    // Cache session in Redis
    const sessionData: SessionData = {
      userId: user.id,
      username: user.username,
      isAdmin: user.isAdmin,
      authSource: user.authSource,
      createdAt: new Date()
    };

    await redis.setJson(
      `${this.sessionPrefix}${sessionId}`, 
      sessionData, 
      7 * 24 * 3600 // 7 days
    );

    return sessionId;
  }

  /**
   * Store service credentials for a user
   */
  async storeServiceCredentials(userId: number, serviceType: string, credentials: any): Promise<number> {
    try {
      const client = await db.getClient();
      
      try {
        await client.query('BEGIN');

        // Check if credentials already exist for this user and service
        const existing = await client.query(
          'SELECT id FROM service_credentials WHERE user_id = $1 AND service_type = $2',
          [userId, serviceType]
        );

        let credentialId: number;

        if (existing.rows.length > 0) {
          credentialId = existing.rows[0].id;
          // Update existing credentials
          await client.query(`
            UPDATE service_credentials 
            SET credentials = $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
          `, [credentials, credentialId]);
        } else {
          // Insert new credentials
          const result = await client.query(`
            INSERT INTO service_credentials (user_id, service_type, service_name, credentials, created_at, updated_at)
            VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            RETURNING id
          `, [userId, serviceType, serviceType === 'azure' ? 'Azure AD' : serviceType, credentials]);
          
          credentialId = result.rows[0].id;
        }

        await client.query('COMMIT');
        logger.info(`${serviceType} credentials stored for user ${userId}`);
        
        return credentialId;

      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error(`Failed to store ${serviceType} credentials:`, error);
      throw createError('Failed to store credentials', 500);
    }
  }

  /**
   * Store Azure AD credentials for a user (now delegates to AzureCredentialService)
   */
  async storeAzureCredentials(userId: number, tokenData: any, refreshToken?: string): Promise<void> {
    try {
      // Import dynamically to avoid circular dependencies
      const { azureCredentialService } = await import('./azure-credential.service');
      
      // Store using the new encrypted credential service
      await azureCredentialService.storeCredentials(userId, { ...tokenData, refresh_token: refreshToken });
      
      logger.info(`Azure credentials stored securely for user ${userId}`);
    } catch (error) {
      logger.error('Failed to store Azure credentials:', error);
      throw createError('Failed to store credentials', 500);
    }
  }

  /**
   * Get Azure AD credentials for a user
   */
  async getAzureCredentials(userId: number): Promise<any> {
    try {
      // Import dynamically to avoid circular dependencies
      const { azureCredentialService } = await import('./azure-credential.service');
      
      // Get decrypted credentials
      return await azureCredentialService.getCredentials(userId);
    } catch (error) {
      logger.error('Failed to get Azure credentials:', error);
      return null;
    }
  }

  /**
   * Get IP address from request
   */
  private getIpAddress(request?: Request): string | undefined {
    if (!request) return undefined;
    
    // Check various headers for IP address
    const forwarded = request.headers['x-forwarded-for'];
    if (forwarded) {
      return (typeof forwarded === 'string' ? forwarded : forwarded[0]).split(',')[0].trim();
    }
    
    return request.headers['x-real-ip'] as string || 
           request.connection?.remoteAddress || 
           request.socket?.remoteAddress ||
           undefined;
  }

  /**
   * Cleanup method for tests
   */
  cleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.userCache.clear();
  }
}

// Export singleton instance
export const unifiedAuthService = new UnifiedAuthenticationService();