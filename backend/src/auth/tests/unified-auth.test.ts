import { Request } from 'express';
import { unifiedAuthService, UnifiedAuthenticationService } from '../services/unified-auth.service';
import { AuthStrategyFactory } from '../strategies';
import { AuthMode, LoginRequest } from '../types';
import { db } from '@/config/database';
import { redis } from '@/config/redis';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

// Mock dependencies
jest.mock('@/config/database');
jest.mock('@/config/redis');
jest.mock('@/utils/logger');
jest.mock('@/services/token-blacklist.service');
jest.mock('@/services/failed-login-tracker.service');
jest.mock('@/services/audit-logger.service');
jest.mock('@/services/csrf.service');
jest.mock('@/services/service.factory');
jest.mock('bcryptjs');
jest.mock('jsonwebtoken');
jest.mock('crypto');

// Import mocked services
import { failedLoginTracker } from '@/services/failed-login-tracker.service';
import { auditLogger } from '@/services/audit-logger.service';
import { csrfService } from '@/services/csrf.service';
import { tokenBlacklist } from '@/services/token-blacklist.service';
import { serviceFactory } from '@/services/service.factory';

describe('Unified Authentication System', () => {
  let authService: UnifiedAuthenticationService;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set environment variables
    process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-characters';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-at-least-32-chars';
    process.env.NODE_ENV = 'test';
    
    // Create fresh instance for each test
    authService = new UnifiedAuthenticationService();
    
    // Setup default mocks
    (failedLoginTracker.checkLockoutStatus as jest.Mock).mockResolvedValue({
      isLocked: false,
      failedAttempts: 0
    });
    (failedLoginTracker.clearFailedAttempts as jest.Mock).mockResolvedValue(undefined);
    (failedLoginTracker.recordFailedAttempt as jest.Mock).mockResolvedValue(undefined);
    
    (auditLogger.logAuth as jest.Mock).mockResolvedValue(undefined);
    (auditLogger.logAccess as jest.Mock).mockResolvedValue(undefined);
    
    // Redis mocks
    (redis.set as jest.Mock).mockResolvedValue('OK');
    (redis.setJson as jest.Mock).mockResolvedValue('OK');
    (redis.get as jest.Mock).mockResolvedValue(null);
    (redis.getJson as jest.Mock).mockResolvedValue(null);
    (redis.del as jest.Mock).mockResolvedValue(1);
    
    // Token blacklist mocks
    (tokenBlacklist.isTokenBlacklisted as jest.Mock).mockResolvedValue(false);
    (tokenBlacklist.blacklistToken as jest.Mock).mockResolvedValue(undefined);
    
    // CSRF service mock
    (csrfService.generateToken as jest.Mock).mockReturnValue('csrf_test_token_123');
    
    // JWT mocks
    (jwt.sign as jest.Mock).mockReturnValue('mocked.jwt.token');
    (jwt.verify as jest.Mock).mockReturnValue({
      userId: 1,
      username: 'testuser',
      sessionId: 'session-123',
      jti: 'token-id',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600
    });
    (jwt.decode as jest.Mock).mockReturnValue({
      userId: 1,
      sessionId: 'session-123'
    });
    
    // Crypto mocks
    (randomBytes as jest.Mock).mockReturnValue(Buffer.from('mock-random-bytes'));
    
    // bcrypt mocks
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    (bcrypt.hash as jest.Mock).mockResolvedValue('$2a$10$mocked.hash');
  });

  describe('UnifiedAuthenticationService', () => {
    describe('authenticate', () => {
      it('should authenticate user with JWT mode by default', async () => {
        const loginRequest: LoginRequest = {
          username: 'testuser',
          password: 'password123',
          authSource: 'local'
        };

        // Clear previous mocks and set up fresh ones for this test
        const mockDbQuery = db.query as jest.Mock;
        mockDbQuery.mockClear();
        
        // Use a mock implementation that responds to different query types
        mockDbQuery.mockImplementation((query: string, _params?: any[]) => {
          // authenticateLocalUser - SELECT password_hash
          if (query.includes('SELECT password_hash FROM users')) {
            return Promise.resolve({
              rows: [{ password_hash: '$2a$10$validhash' }]
            });
          }
          
          // getLocalUser - SELECT * FROM users
          if (query.includes('SELECT * FROM users WHERE username') && 
              query.includes('auth_source') && 
              !query.includes('UPDATE')) {
            return Promise.resolve({
              rows: [{
                id: 1,
                username: 'testuser',
                display_name: 'Test User',
                email: 'test@example.com',
                auth_source: 'local',
                is_admin: false,
                is_active: true,
                external_id: null,
                department: null,
                title: null,
                last_login: null
              }]
            });
          }
          
          // updateLastLogin - UPDATE users SET last_login
          if (query.includes('UPDATE users SET last_login')) {
            return Promise.resolve({ rows: [] });
          }
          
          // createSession - INSERT INTO user_sessions
          if (query.includes('INSERT INTO user_sessions')) {
            return Promise.resolve({
              rows: [{ id: 'session-123' }]
            });
          }
          
          // Default case
          return Promise.resolve({ rows: [] });
        });

        // Mock bcrypt comparison
        (bcrypt.compare as jest.Mock).mockResolvedValue(true);

        const response = await unifiedAuthService.authenticate(loginRequest);

        expect(response).toHaveProperty('user');
        expect(response).toHaveProperty('accessToken');
        expect(response).toHaveProperty('refreshToken');
        expect(response.csrfToken).toBeUndefined(); // No CSRF in JWT mode
      });

      it('should authenticate user with cookie mode and CSRF token', async () => {
        // Reset and set up mocks properly for local authentication - restore defaults first
        (failedLoginTracker.checkLockoutStatus as jest.Mock).mockResolvedValue({
          isLocked: false,
          failedAttempts: 0
        });
        (failedLoginTracker.clearFailedAttempts as jest.Mock).mockResolvedValue(undefined);
        (failedLoginTracker.recordFailedAttempt as jest.Mock).mockResolvedValue(undefined);
        
        (auditLogger.logAuth as jest.Mock).mockResolvedValue(undefined);
        (auditLogger.logAccess as jest.Mock).mockResolvedValue(undefined);
        
        // Redis mocks
        (redis.set as jest.Mock).mockResolvedValue('OK');
        (redis.setJson as jest.Mock).mockResolvedValue('OK');
        (redis.get as jest.Mock).mockResolvedValue(null);
        (redis.getJson as jest.Mock).mockResolvedValue(null);
        (redis.del as jest.Mock).mockResolvedValue(1);
        
        // Token blacklist mocks
        (tokenBlacklist.isTokenBlacklisted as jest.Mock).mockResolvedValue(false);
        (tokenBlacklist.blacklistToken as jest.Mock).mockResolvedValue(undefined);
        
        // CSRF service mock
        (csrfService.generateToken as jest.Mock).mockReturnValue('csrf_test_token_123');
        
        // JWT mocks
        (jwt.sign as jest.Mock).mockReturnValue('mocked.jwt.token');
        (jwt.verify as jest.Mock).mockReturnValue({
          userId: 1,
          username: 'testuser',
          sessionId: 'session-123',
          jti: 'token-id',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600
        });
        (jwt.decode as jest.Mock).mockReturnValue({
          userId: 1,
          sessionId: 'session-123'
        });
        
        // Crypto mocks
        (randomBytes as jest.Mock).mockReturnValue(Buffer.from('mock-random-bytes'));
        
        // bcrypt mocks - CRITICAL: this must return true for local auth
        (bcrypt.compare as jest.Mock).mockResolvedValue(true);
        (bcrypt.hash as jest.Mock).mockResolvedValue('$2a$10$mocked.hash');
        
        const loginRequest: LoginRequest = {
          username: 'testuser',
          password: 'password123',
          authSource: 'local'
        };

        // Set up database mocks to return data for local authentication flow
        const mockDbQuery = db.query as jest.Mock;
        mockDbQuery.mockClear();
        mockDbQuery.mockImplementation((query: string, params?: any[]) => {
          // const _queryFirstLine = query.trim().split('\n')[0]; // Debug line - commented out
          
          // authenticateLocalUser - SELECT password_hash
          if (query.includes('SELECT password_hash FROM users') && 
              query.includes('auth_source') && 
              query.includes('is_active')) {
            return Promise.resolve({
              rows: [{ password_hash: '$2a$10$validhash' }]
            });
          }
          
          // getLocalUser - SELECT * FROM users for userInfo
          if (query.includes('SELECT * FROM users WHERE username') && 
              query.includes('auth_source') && 
              !query.includes('UPDATE') &&
              params && params[0] === 'testuser' && params[1] === 'local') {
            return Promise.resolve({
              rows: [{
                id: 1,
                username: 'testuser',
                display_name: 'Test User',
                email: 'test@example.com',
                auth_source: 'local',
                is_admin: false,
                is_active: true,
                external_id: null,
                department: null,
                title: null,
                last_login: null
              }]
            });
          }
          
          // updateLastLogin - UPDATE users SET last_login
          if (query.includes('UPDATE users SET last_login')) {
            return Promise.resolve({ rows: [] });
          }
          
          // createSession - INSERT INTO user_sessions
          if (query.includes('INSERT INTO user_sessions')) {
            return Promise.resolve({
              rows: [{ id: 'session-123' }]
            });
          }
          
          // Default case - return empty rows without logging to reduce noise
          return Promise.resolve({ rows: [] });
        });
        
        const response = await unifiedAuthService.authenticate(loginRequest, undefined, {
          mode: AuthMode.COOKIE,
          generateCSRF: true
        });
        
        expect(response).toHaveProperty('user');
        expect(response).toHaveProperty('csrfToken');
        expect(response.csrfToken).toMatch(/^csrf_/); // CSRF token format
      });
    });

    describe('getAuthMode', () => {
      it('should detect JWT mode from header', () => {
        const req = {
          headers: { 'x-auth-mode': 'jwt' },
          cookies: {}
        } as unknown as Request;

        const mode = unifiedAuthService.getAuthMode(req);
        expect(mode).toBe(AuthMode.JWT);
      });

      it('should detect cookie mode from cookies', () => {
        const req = {
          headers: {},
          cookies: { sessionId: 'some-session-id' }
        } as unknown as Request;

        const mode = unifiedAuthService.getAuthMode(req);
        expect(mode).toBe(AuthMode.COOKIE);
      });

      it('should use default mode when no indicators', () => {
        const req = {
          headers: {},
          cookies: {}
        } as unknown as Request;

        const mode = unifiedAuthService.getAuthMode(req);
        expect(mode).toBe(AuthMode.JWT); // Default when USE_COOKIE_AUTH is false
      });
    });
  });

  describe('Authentication Strategies', () => {
    describe('JWTStrategy', () => {
      it('should extract token from Authorization header', () => {
        const strategy = AuthStrategyFactory.getStrategy(AuthMode.JWT);
        const req = {
          headers: { authorization: 'Bearer test-token' },
          cookies: {}
        } as unknown as Request;

        const token = strategy.extractToken(req);
        expect(token).toBe('test-token');
      });

      it('should return null when no Authorization header', () => {
        const strategy = AuthStrategyFactory.getStrategy(AuthMode.JWT);
        const req = {
          headers: {},
          cookies: {}
        } as unknown as Request;

        const token = strategy.extractToken(req);
        expect(token).toBeNull();
      });
    });

    describe('CookieStrategy', () => {
      it('should extract token from cookie first', () => {
        const strategy = AuthStrategyFactory.getStrategy(AuthMode.COOKIE);
        const req = {
          headers: { authorization: 'Bearer header-token' },
          cookies: { access_token: 'cookie-token' }
        } as unknown as Request;

        const token = strategy.extractToken(req);
        expect(token).toBe('cookie-token');
      });

      it('should fall back to Authorization header', () => {
        const strategy = AuthStrategyFactory.getStrategy(AuthMode.COOKIE);
        const req = {
          headers: { authorization: 'Bearer header-token' },
          cookies: {}
        } as unknown as Request;

        const token = strategy.extractToken(req);
        expect(token).toBe('header-token');
      });
    });
  });

  describe('Strategy Factory', () => {
    it('should return JWT strategy for JWT mode', () => {
      const strategy = AuthStrategyFactory.getStrategy(AuthMode.JWT);
      expect(strategy.mode).toBe(AuthMode.JWT);
    });

    it('should return Cookie strategy for Cookie mode', () => {
      const strategy = AuthStrategyFactory.getStrategy(AuthMode.COOKIE);
      expect(strategy.mode).toBe(AuthMode.COOKIE);
    });

    it('should throw error for unknown mode', () => {
      expect(() => {
        AuthStrategyFactory.getStrategy('unknown' as AuthMode);
      }).toThrow('Unknown auth mode: unknown');
    });

    it('should return default strategy (always JWT)', () => {
      // The implementation always returns JWT strategy regardless of environment
      process.env.USE_COOKIE_AUTH = 'false';
      const strategy1 = AuthStrategyFactory.getDefaultStrategy();
      expect(strategy1.mode).toBe(AuthMode.JWT);

      process.env.USE_COOKIE_AUTH = 'true';
      const strategy2 = AuthStrategyFactory.getDefaultStrategy();
      expect(strategy2.mode).toBe(AuthMode.JWT); // Always JWT
    });

    describe('refreshAccessToken', () => {
      it('should refresh valid token successfully', async () => {
        const refreshToken = 'valid.refresh.token';
        const mockPayload = {
          userId: 1,
          sessionId: 'session-123',
          familyId: 'family-123',
          jti: 'token-id'
        };
        
        (jwt.verify as jest.Mock).mockReturnValue(mockPayload);
        (redis.getJson as jest.Mock).mockResolvedValue({
          userId: 1,
          sessionId: 'session-123',
          latestJti: 'token-id'
        });
        
        // Mock getUserById
        (db.query as jest.Mock).mockResolvedValue({
          rows: [{
            id: 1,
            username: 'testuser',
            display_name: 'Test User',
            email: 'test@example.com',
            auth_source: 'local',
            is_admin: false,
            is_active: true
          }]
        });
        
        const response = await authService.refreshAccessToken(refreshToken);
        
        expect(response).toHaveProperty('accessToken');
        expect(response).toHaveProperty('refreshToken');
        expect(tokenBlacklist.blacklistToken).toHaveBeenCalledWith(refreshToken, 'Token rotation');
      });
      
      it('should reject expired refresh token', async () => {
        const refreshToken = 'expired.refresh.token';
        (jwt.verify as jest.Mock).mockImplementation(() => {
          const error = new Error('Token expired') as any;
          error.name = 'TokenExpiredError';
          throw error;
        });
        
        await expect(authService.refreshAccessToken(refreshToken))
          .rejects.toThrow('Refresh token has expired');
      });
      
      it('should reject blacklisted refresh token', async () => {
        const refreshToken = 'blacklisted.refresh.token';
        const mockPayload = { userId: 1, sessionId: 'session-123' };
        
        (jwt.verify as jest.Mock).mockReturnValue(mockPayload);
        (tokenBlacklist.isTokenBlacklisted as jest.Mock).mockResolvedValue(true);
        
        await expect(authService.refreshAccessToken(refreshToken))
          .rejects.toThrow('Invalid refresh token');
      });
      
      it('should handle token family reuse attack', async () => {
        const refreshToken = 'reused.refresh.token';
        const mockPayload = {
          userId: 1,
          sessionId: 'session-123',
          familyId: 'family-123',
          jti: 'old-token-id'
        };
        
        (jwt.verify as jest.Mock).mockReturnValue(mockPayload);
        (redis.getJson as jest.Mock).mockResolvedValue({
          userId: 1,
          sessionId: 'session-123',
          latestJti: 'newer-token-id' // Different JTI indicates reuse
        });
        
        await expect(authService.refreshAccessToken(refreshToken))
          .rejects.toThrow('Invalid refresh token');
        
        expect(redis.del).toHaveBeenCalledWith('token_family:family-123');
      });
    });

    describe('verifyAccessToken', () => {
      it('should verify valid access token', async () => {
        const token = 'valid.access.token';
        const mockPayload = {
          userId: 1,
          username: 'testuser',
          sessionId: 'session-123'
        };
        
        (jwt.verify as jest.Mock).mockReturnValue(mockPayload);
        (redis.getJson as jest.Mock).mockResolvedValue({
          userId: 1,
          username: 'testuser'
        });
        
        // Mock getUserById
        (db.query as jest.Mock).mockResolvedValue({
          rows: [{
            id: 1,
            username: 'testuser',
            display_name: 'Test User',
            email: 'test@example.com',
            auth_source: 'local',
            is_admin: false,
            is_active: true
          }]
        });
        
        const user = await authService.verifyAccessToken(token);
        
        expect(user).toHaveProperty('id', 1);
        expect(user).toHaveProperty('username', 'testuser');
      });
      
      it('should reject expired access token', async () => {
        const token = 'expired.access.token';
        (jwt.verify as jest.Mock).mockImplementation(() => {
          const error = new Error('Token expired') as any;
          error.name = 'TokenExpiredError';
          throw error;
        });
        
        await expect(authService.verifyAccessToken(token))
          .rejects.toThrow('Access token has expired');
      });
      
      it('should reject token with expired session', async () => {
        const token = 'valid.token.expired.session';
        const mockPayload = {
          userId: 1,
          sessionId: 'expired-session'
        };
        
        (jwt.verify as jest.Mock).mockReturnValue(mockPayload);
        (redis.getJson as jest.Mock).mockResolvedValue(null); // No session found
        
        await expect(authService.verifyAccessToken(token))
          .rejects.toThrow('Session expired');
      });
    });

    describe('logout', () => {
      it('should logout user session successfully', async () => {
        const sessionId = 'session-123';
        const token = 'access.token';
        
        (redis.getJson as jest.Mock).mockResolvedValue({
          userId: 1,
          username: 'testuser'
        });
        
        (db.query as jest.Mock).mockResolvedValue({ rows: [] });
        
        await authService.logout(sessionId, token);
        
        expect(tokenBlacklist.blacklistToken).toHaveBeenCalledWith(token, 'User logout');
        expect(redis.del).toHaveBeenCalledWith('session:session-123');
        expect(db.query).toHaveBeenCalledWith(
          'DELETE FROM user_sessions WHERE id = $1',
          [sessionId]
        );
      });
    });

    describe('logoutAllSessions', () => {
      it('should logout all user sessions', async () => {
        const userId = 1;
        
        (db.query as jest.Mock)
          .mockResolvedValueOnce({
            rows: [
              { id: 'session-1' },
              { id: 'session-2' }
            ]
          })
          .mockResolvedValueOnce({ rows: [] }); // DELETE query
        
        await authService.logoutAllSessions(userId);
        
        expect(redis.del).toHaveBeenCalledWith('session:session-1');
        expect(redis.del).toHaveBeenCalledWith('session:session-2');
        expect(db.query).toHaveBeenCalledWith(
          'DELETE FROM user_sessions WHERE user_id = $1',
          [userId]
        );
      });
    });

    describe('changePassword', () => {
      it('should change password for local user', async () => {
        const userId = 1;
        const currentPassword = 'oldpassword';
        const newPassword = 'newpassword';
        
        // Mock user lookup
        (db.query as jest.Mock)
          .mockResolvedValueOnce({
            rows: [{
              username: 'testuser',
              password_hash: '$2a$10$oldhashedpassword',
              auth_source: 'local'
            }]
          })
          .mockResolvedValueOnce({ rows: [] }); // UPDATE query
        
        (bcrypt.compare as jest.Mock).mockResolvedValue(true);
        (bcrypt.hash as jest.Mock).mockResolvedValue('$2a$10$newhashedpassword');
        
        // Mock logoutAllSessions
        (db.query as jest.Mock)
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] });
        
        await authService.changePassword(userId, currentPassword, newPassword);
        
        expect(bcrypt.compare).toHaveBeenCalledWith(currentPassword, '$2a$10$oldhashedpassword');
        expect(bcrypt.hash).toHaveBeenCalledWith(newPassword, 10);
      });
      
      it('should reject password change for non-local user', async () => {
        const userId = 1;
        
        (db.query as jest.Mock).mockResolvedValue({
          rows: [{
            username: 'testuser',
            password_hash: null,
            auth_source: 'ad'
          }]
        });
        
        await expect(authService.changePassword(userId, 'old', 'new'))
          .rejects.toThrow('Password change is only available for local users');
      });
      
      it('should reject incorrect current password', async () => {
        const userId = 1;
        
        (db.query as jest.Mock).mockResolvedValue({
          rows: [{
            username: 'testuser',
            password_hash: '$2a$10$correcthash',
            auth_source: 'local'
          }]
        });
        
        (bcrypt.compare as jest.Mock).mockResolvedValue(false);
        
        await expect(authService.changePassword(userId, 'wrongpassword', 'newpassword'))
          .rejects.toThrow('Current password is incorrect');
      });
    });

    describe('createLocalUser', () => {
      it('should create new local user', async () => {
        const userData = {
          username: 'newuser',
          password: 'password123',
          displayName: 'New User',
          email: 'newuser@example.com',
          isAdmin: false
        };
        
        // Mock username check (not exists)
        (db.query as jest.Mock)
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({
            rows: [{
              id: 2,
              username: 'newuser',
              display_name: 'New User',
              email: 'newuser@example.com',
              auth_source: 'local',
              is_admin: false,
              is_active: true
            }]
          });
        
        (bcrypt.hash as jest.Mock).mockResolvedValue('$2a$10$hashedpassword');
        
        const user = await authService.createLocalUser(userData);
        
        expect(user).toHaveProperty('id', 2);
        expect(user).toHaveProperty('username', 'newuser');
        expect(bcrypt.hash).toHaveBeenCalledWith('password123', 10);
      });
      
      it('should reject duplicate username', async () => {
        const userData = {
          username: 'existinguser',
          password: 'password123',
          displayName: 'Existing User',
          email: 'existing@example.com'
        };
        
        // Mock username check (exists)
        (db.query as jest.Mock).mockResolvedValue({
          rows: [{ id: 1 }]
        });
        
        await expect(authService.createLocalUser(userData))
          .rejects.toThrow('Username already exists');
      });
    });

    describe('testAuthConnections', () => {
      beforeEach(() => {
        // Mock service factory
        (serviceFactory.getADService as jest.Mock).mockResolvedValue({
          testConnection: jest.fn().mockResolvedValue(undefined)
        });
        (serviceFactory.getAzureService as jest.Mock).mockResolvedValue({
          testConnection: jest.fn().mockResolvedValue(undefined)
        });
        (serviceFactory.getO365Service as jest.Mock).mockResolvedValue({
          testConnection: jest.fn().mockResolvedValue(undefined)
        });
      });
      
      it('should test all authentication connections', async () => {
        // Mock database connection
        (db.query as jest.Mock).mockResolvedValue({ rows: [{ "?column?": 1 }] });
        
        const results = await authService.testAuthConnections();
        
        expect(results).toHaveProperty('local');
        expect(results).toHaveProperty('ad');
        expect(results).toHaveProperty('azure');
        expect(results).toHaveProperty('o365');
        expect(results.local.connected).toBe(true);
      });
      
      it('should handle connection failures', async () => {
        // Mock database failure
        (db.query as jest.Mock).mockRejectedValue(new Error('Database connection failed'));
        
        const results = await authService.testAuthConnections();
        
        expect(results.local.connected).toBe(false);
        expect(results.local.error).toBe('Database connection failed');
      });
    });

    describe('updateUserProfile', () => {
      it('should update user profile successfully', async () => {
        const userId = 1;
        const updateData = {
          displayName: 'Updated Name',
          email: 'updated@example.com'
        };
        
        (db.query as jest.Mock).mockResolvedValue({
          rows: [{
            id: 1,
            username: 'testuser',
            display_name: 'Updated Name',
            email: 'updated@example.com',
            auth_source: 'local',
            is_admin: false,
            is_active: true
          }]
        });
        
        const updatedUser = await authService.updateUserProfile(userId, updateData);
        
        expect(updatedUser).toHaveProperty('displayName', 'Updated Name');
        expect(updatedUser).toHaveProperty('email', 'updated@example.com');
      });
      
      it('should return current user when no fields to update', async () => {
        const userId = 1;
        
        // Mock getUserById call
        (db.query as jest.Mock).mockResolvedValue({
          rows: [{
            id: 1,
            username: 'testuser',
            display_name: 'Test User',
            email: 'test@example.com',
            auth_source: 'local',
            is_admin: false,
            is_active: true
          }]
        });
        
        const result = await authService.updateUserProfile(userId, {});
        
        expect(result).toHaveProperty('username', 'testuser');
      });
    });

    describe('Error Handling', () => {
      it('should handle locked account', async () => {
        const loginRequest: LoginRequest = {
          username: 'testuser',
          password: 'password123',
          authSource: 'local'
        };
        
        (failedLoginTracker.checkLockoutStatus as jest.Mock).mockResolvedValue({
          isLocked: true,
          lockoutExpiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
          lockoutReason: 'Too many failed attempts'
        });
        
        await expect(authService.authenticate(loginRequest))
          .rejects.toThrow('Account is locked due to too many failed attempts');
      });
      
      it('should handle service authentication errors', async () => {
        const loginRequest: LoginRequest = {
          username: 'testuser',
          password: 'password123',
          authSource: 'ad'
        };
        
        // Mock AD service error
        (serviceFactory.getADService as jest.Mock).mockResolvedValue({
          authenticateUser: jest.fn().mockRejectedValue(new Error('AD service unavailable'))
        });
        
        await expect(authService.authenticate(loginRequest))
          .rejects.toThrow('Authentication service unavailable');
        
        expect(failedLoginTracker.recordFailedAttempt).toHaveBeenCalled();
      });
      
      it('should handle inactive user', async () => {
        const loginRequest: LoginRequest = {
          username: 'inactiveuser',
          password: 'password123',
          authSource: 'local'
        };
        
        // Mock successful authentication but inactive user
        (db.query as jest.Mock)
          .mockResolvedValueOnce({
            rows: [{ password_hash: '$2a$10$validhash' }]
          })
          .mockResolvedValueOnce({
            rows: [{
              id: 1,
              username: 'inactiveuser',
              display_name: 'Inactive User',
              email: 'inactive@example.com',
              auth_source: 'local',
              is_admin: false,
              is_active: false // Inactive user
            }]
          })
          .mockResolvedValueOnce({
            rows: [{
              id: 1,
              username: 'inactiveuser',
              display_name: 'Inactive User',
              email: 'inactive@example.com',
              auth_source: 'local',
              is_admin: false,
              is_active: false
            }]
          });
        
        (bcrypt.compare as jest.Mock).mockResolvedValue(true);
        
        await expect(authService.authenticate(loginRequest))
          .rejects.toThrow('User account is inactive');
      });
      
      it('should handle invalid authentication source', async () => {
        const loginRequest: LoginRequest = {
          username: 'testuser',
          password: 'password123',
          authSource: 'invalid' as any
        };
        
        await expect(authService.authenticate(loginRequest))
          .rejects.toThrow('Invalid authentication source');
      });
    });

    describe('Environment Configuration', () => {
      it('should require JWT secrets in production', () => {
        const originalEnv = process.env.NODE_ENV;
        const originalJwtSecret = process.env.JWT_SECRET;
        const originalRefreshSecret = process.env.JWT_REFRESH_SECRET;
        
        try {
          process.env.NODE_ENV = 'production';
          delete process.env.JWT_SECRET;
          delete process.env.JWT_REFRESH_SECRET;
          
          expect(() => new UnifiedAuthenticationService())
            .toThrow('JWT_SECRET must be set in production environment');
        } finally {
          process.env.NODE_ENV = originalEnv;
          process.env.JWT_SECRET = originalJwtSecret;
          process.env.JWT_REFRESH_SECRET = originalRefreshSecret;
        }
      });
      
      it('should require minimum secret length in production', () => {
        const originalEnv = process.env.NODE_ENV;
        const originalJwtSecret = process.env.JWT_SECRET;
        
        try {
          process.env.NODE_ENV = 'production';
          process.env.JWT_SECRET = 'short';
          
          expect(() => new UnifiedAuthenticationService())
            .toThrow('JWT_SECRET must be set in production environment with at least 32 characters');
        } finally {
          process.env.NODE_ENV = originalEnv;
          process.env.JWT_SECRET = originalJwtSecret;
        }
      });
    });
  });

  describe('Strategy Factory', () => {
    it('should return JWT strategy for JWT mode', () => {
      const strategy = AuthStrategyFactory.getStrategy(AuthMode.JWT);
      expect(strategy.mode).toBe(AuthMode.JWT);
    });

    it('should return Cookie strategy for Cookie mode', () => {
      const strategy = AuthStrategyFactory.getStrategy(AuthMode.COOKIE);
      expect(strategy.mode).toBe(AuthMode.COOKIE);
    });

    it('should throw error for unknown mode', () => {
      expect(() => {
        AuthStrategyFactory.getStrategy('unknown' as AuthMode);
      }).toThrow('Unknown auth mode: unknown');
    });

    it('should return default strategy (always JWT)', () => {
      const strategy = AuthStrategyFactory.getDefaultStrategy();
      expect(strategy.mode).toBe(AuthMode.JWT);
    });
  });
});