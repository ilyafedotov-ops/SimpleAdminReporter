import { Request } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { UnifiedAuthenticationService } from './unified-auth.service';
import { db } from '@/config/database';
import { redis } from '@/config/redis';
import { tokenBlacklist } from '@/services/token-blacklist.service';
import { failedLoginTracker } from '@/services/failed-login-tracker.service';
import { auditLogger } from '@/services/audit-logger.service';
import { csrfService } from '@/services/csrf.service';
import { createError } from '@/middleware/error.middleware';
import { AuthMode, LoginRequest, JWTPayload, RefreshTokenPayload } from '../types';

// Mock all external dependencies
jest.mock('@/config/database');
jest.mock('@/config/redis');
jest.mock('@/services/token-blacklist.service');
jest.mock('@/services/failed-login-tracker.service');
jest.mock('@/services/audit-logger.service');
jest.mock('@/services/csrf.service');
jest.mock('@/services/service.factory');
jest.mock('@/middleware/error.middleware');
jest.mock('@/utils/logger');
jest.mock('jsonwebtoken');
jest.mock('bcryptjs');
jest.mock('crypto');

describe('UnifiedAuthenticationService - Comprehensive Tests', () => {
  let service: UnifiedAuthenticationService;
  let mockRequest: Partial<Request>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    
    // Create a new instance for each test to avoid state pollution
    service = new UnifiedAuthenticationService();
    
    // Setup mock request
    mockRequest = {
      ip: '127.0.0.1',
      get: jest.fn((header) => {
        const headers: any = {
          'user-agent': 'Test User Agent',
          'x-forwarded-for': '192.168.1.1',
          'x-real-ip': '10.0.0.1'
        };
        return headers[header.toLowerCase()];
      }),
      headers: {},
      connection: { remoteAddress: '192.168.1.100' } as any,
      socket: { remoteAddress: '192.168.1.200' } as any
    };

    // Setup default mocks
    (createError as jest.Mock).mockImplementation((message, statusCode) => {
      const error: any = new Error(message);
      error.statusCode = statusCode;
      return error;
    });

    (randomBytes as jest.Mock).mockReturnValue(Buffer.from('mock-random-bytes'));
    (jwt.sign as jest.Mock).mockReturnValue('mock-jwt-token');
    (jwt.verify as jest.Mock).mockReturnValue({ userId: 1, sessionId: 'test-session' });
    (jwt.decode as jest.Mock).mockReturnValue({ sessionId: 'test-session' });
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');

    // Setup service factory mocks
    const mockServiceFactory = {
      getADService: jest.fn(),
      getAzureService: jest.fn(),
      getO365Service: jest.fn()
    };
    
    jest.doMock('@/services/service.factory', () => ({
      serviceFactory: mockServiceFactory
    }));

    // Setup default database and redis mocks
    (db.query as jest.Mock).mockResolvedValue({ rows: [] });
    (db.getClient as jest.Mock).mockResolvedValue({
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn()
    });
    
    (redis.setJson as jest.Mock).mockResolvedValue('OK');
    (redis.getJson as jest.Mock).mockResolvedValue(null);
    (redis.del as jest.Mock).mockResolvedValue(1);

    // Setup audit logger mocks
    (auditLogger.logAuth as jest.Mock).mockResolvedValue(undefined);

    // Setup failed login tracker mocks
    (failedLoginTracker.checkLockoutStatus as jest.Mock).mockResolvedValue({
      isLocked: false,
      failedAttempts: 0
    });
    (failedLoginTracker.recordFailedAttempt as jest.Mock).mockResolvedValue(undefined);
    (failedLoginTracker.clearFailedAttempts as jest.Mock).mockResolvedValue(undefined);

    // Setup token blacklist mocks
    (tokenBlacklist.isTokenBlacklisted as jest.Mock).mockResolvedValue(false);
    (tokenBlacklist.blacklistToken as jest.Mock).mockResolvedValue(undefined);

    // Setup CSRF service mocks
    (csrfService.generateToken as jest.Mock).mockReturnValue('mock-csrf-token');
  });

  afterEach(() => {
    service.cleanup();
  });

  describe('authenticate method', () => {
    describe('Happy Path Scenarios', () => {
      test('should successfully authenticate AD user', async () => {
        // Arrange
        const loginRequest: LoginRequest = {
          username: 'testuser',
          password: 'validpassword',
          authSource: 'ad'
        };

        const mockADService = {
          authenticateUser: jest.fn().mockResolvedValue(true),
          getUser: jest.fn().mockResolvedValue({
            username: 'testuser',
            displayName: 'Test User',
            email: 'test@example.com',
            department: 'IT',
            title: 'Developer'
          })
        };

        const mockServiceFactory = require('@/services/service.factory').serviceFactory;
        mockServiceFactory.getADService = jest.fn().mockResolvedValue(mockADService);

        // Mock database user creation - need to ensure all necessary queries are mocked
        (db.query as jest.Mock)
          .mockResolvedValueOnce({ rows: [] }) // Check existing user
          .mockResolvedValueOnce({ // Create new user
            rows: [{
              id: 1,
              username: 'testuser',
              display_name: 'Test User',
              email: 'test@example.com',
              auth_source: 'ad',
              is_admin: false,
              is_active: true,
              last_login: null
            }]
          })
          .mockResolvedValueOnce({ rows: [] }) // Update last login
          .mockResolvedValueOnce({ rows: [{ id: 'session-uuid' }] }); // Create session

        // Act
        const result = await service.authenticate(loginRequest, mockRequest as Request);

        // Assert
        expect(result).toHaveProperty('user');
        expect(result).toHaveProperty('accessToken');
        expect(result).toHaveProperty('refreshToken');
        expect(result.user.username).toBe('testuser');
        expect(mockADService.authenticateUser).toHaveBeenCalledWith('testuser', 'validpassword');
        expect(auditLogger.logAuth).toHaveBeenCalledWith(
          'login',
          expect.anything(),
          expect.anything(),
          true
        );
      });

      test('should successfully authenticate Azure AD user', async () => {
        // Arrange
        const loginRequest: LoginRequest = {
          username: 'azureuser@company.com',
          password: 'azurepassword',
          authSource: 'azure'
        };

        const mockAzureService = {
          authenticateWithUsernamePassword: jest.fn().mockResolvedValue({
            account: {
              username: 'azureuser@company.com',
              name: 'Azure User'
            },
            accessToken: 'azure-access-token'
          }),
          getUser: jest.fn().mockResolvedValue({
            userPrincipalName: 'azureuser@company.com',
            displayName: 'Azure User',
            mail: 'azureuser@company.com',
            id: 'azure-id-123'
          })
        };

        const mockServiceFactory = require('@/services/service.factory').serviceFactory;
        mockServiceFactory.getAzureService = jest.fn().mockResolvedValue(mockAzureService);

        // Mock database operations
        (db.query as jest.Mock)
          .mockResolvedValueOnce({ rows: [] }) // Check existing user
          .mockResolvedValueOnce({ // Create new user
            rows: [{
              id: 2,
              username: 'azureuser@company.com',
              display_name: 'Azure User',
              email: 'azureuser@company.com',
              auth_source: 'azure',
              external_id: 'azure-id-123',
              is_admin: false,
              is_active: true
            }]
          })
          .mockResolvedValueOnce({ rows: [] }) // Update last login
          .mockResolvedValueOnce({ rows: [{ id: 'azure-session' }] }); // Create session

        // Act
        const result = await service.authenticate(loginRequest, mockRequest as Request);

        // Assert
        expect(result.user.username).toBe('azureuser@company.com');
        expect(result.user.authSource).toBe('azure');
        expect(mockAzureService.getUser).toHaveBeenCalledWith('azureuser@company.com');
      });

      test('should successfully authenticate local user', async () => {
        // Arrange
        const loginRequest: LoginRequest = {
          username: 'localuser',
          password: 'localpassword',
          authSource: 'local'
        };

        // Mock database queries for local authentication
        (db.query as jest.Mock)
          .mockResolvedValueOnce({ // Authenticate local user
            rows: [{ password_hash: 'hashed-password' }]
          })
          .mockResolvedValueOnce({ // Get local user
            rows: [{
              id: 3,
              username: 'localuser',
              display_name: 'Local User',
              email: 'local@company.com',
              auth_source: 'local',
              is_admin: true,
              is_active: true
            }]
          })
          .mockResolvedValueOnce({ rows: [] }) // Update last login
          .mockResolvedValueOnce({ rows: [{ id: 'local-session' }] }); // Create session

        (bcrypt.compare as jest.Mock).mockResolvedValue(true);

        // Act
        const result = await service.authenticate(loginRequest, mockRequest as Request);

        // Assert
        expect(result.user.username).toBe('localuser');
        expect(result.user.authSource).toBe('local');
        expect(result.user.isAdmin).toBe(true);
        expect(bcrypt.compare).toHaveBeenCalledWith('localpassword', 'hashed-password');
      });

      test('should handle cookie mode authentication', async () => {
        // Arrange
        const loginRequest: LoginRequest = {
          username: 'cookieuser',
          password: 'cookiepassword',
          authSource: 'ad'
        };

        const mockADService = {
          authenticateUser: jest.fn().mockResolvedValue(true),
          getUser: jest.fn().mockResolvedValue({
            username: 'cookieuser',
            displayName: 'Cookie User'
          })
        };

        const mockServiceFactory = {
          getADService: jest.fn().mockResolvedValue(mockADService)
        };
        
        jest.doMock('@/services/service.factory', () => ({
          serviceFactory: mockServiceFactory
        }));

        (db.query as jest.Mock)
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({
            rows: [{ id: 4, username: 'cookieuser', display_name: 'Cookie User', auth_source: 'ad', is_active: true }]
          })
          .mockResolvedValueOnce({ rows: [] }) // Update last login
          .mockResolvedValueOnce({ rows: [{ id: 'cookie-session' }] }); // Create session

        // Act
        const result = await service.authenticate(loginRequest, mockRequest as Request, {
          mode: AuthMode.COOKIE,
          generateCSRF: true
        });

        // Assert
        expect(result).toHaveProperty('csrfToken');
        expect(result.csrfToken).toBe('mock-csrf-token');
      });
    });

    describe('Error Conditions', () => {
      test('should handle account lockout', async () => {
        // Arrange
        const loginRequest: LoginRequest = {
          username: 'lockeduser',
          password: 'password',
          authSource: 'ad'
        };

        (failedLoginTracker.checkLockoutStatus as jest.Mock).mockResolvedValue({
          isLocked: true,
          lockoutExpiresAt: new Date(Date.now() + 300000), // 5 minutes
          lockoutReason: 'Too many failed attempts'
        });

        // Act & Assert
        await expect(service.authenticate(loginRequest, mockRequest as Request))
          .rejects.toThrow();

        expect(createError).toHaveBeenCalledWith(
          expect.stringContaining('Account is locked'),
          423
        );
        expect(auditLogger.logAuth).toHaveBeenCalledWith(
          'account_locked',
          expect.anything(),
          expect.anything(),
          false
        );
      });

      test('should handle invalid credentials', async () => {
        // Arrange
        const loginRequest: LoginRequest = {
          username: 'testuser',
          password: 'wrongpassword',
          authSource: 'ad'
        };

        // Create a mock AD service that returns false for authentication
        const mockADService = {
          authenticateUser: jest.fn().mockResolvedValue(false)
        };

        // Mock the serviceFactory to return our mock AD service
        const serviceFactoryModule = require('@/services/service.factory');
        jest.spyOn(serviceFactoryModule.serviceFactory, 'getADService').mockResolvedValue(mockADService);

        // Act & Assert
        await expect(service.authenticate(loginRequest, mockRequest as Request))
          .rejects.toThrow('Invalid credentials');

        expect(mockADService.authenticateUser).toHaveBeenCalledWith('testuser', 'wrongpassword');
        expect(failedLoginTracker.recordFailedAttempt).toHaveBeenCalled();
        expect(auditLogger.logAuth).toHaveBeenCalledWith(
          'login_failed',
          expect.anything(),
          expect.anything(),
          false,
          'invalid_credentials'
        );

        // Restore the spy
        jest.restoreAllMocks();
      });

      test('should handle inactive user', async () => {
        // Arrange
        const loginRequest: LoginRequest = {
          username: 'inactiveuser',
          password: 'password',
          authSource: 'local'
        };

        (db.query as jest.Mock)
          .mockResolvedValueOnce({ rows: [{ password_hash: 'hash' }] })
          .mockResolvedValueOnce({
            rows: [{
              id: 5,
              username: 'inactiveuser',
              is_active: false,
              auth_source: 'local'
            }]
          });

        // Act & Assert
        await expect(service.authenticate(loginRequest, mockRequest as Request))
          .rejects.toThrow();

        expect(createError).toHaveBeenCalledWith('User account is inactive', 403);
      });

      test('should handle service errors', async () => {
        // Arrange
        const loginRequest: LoginRequest = {
          username: 'testuser',
          password: 'password',
          authSource: 'ad'
        };

        // Create a mock AD service that throws an error
        const mockADService = {
          authenticateUser: jest.fn().mockRejectedValue(new Error('LDAP connection failed'))
        };

        // Mock the serviceFactory to return our mock AD service
        const serviceFactoryModule = require('@/services/service.factory');
        jest.spyOn(serviceFactoryModule.serviceFactory, 'getADService').mockResolvedValue(mockADService);

        // Act & Assert
        await expect(service.authenticate(loginRequest, mockRequest as Request))
          .rejects.toThrow('Authentication service unavailable');

        expect(mockADService.authenticateUser).toHaveBeenCalledWith('testuser', 'password');
        expect(auditLogger.logAuth).toHaveBeenCalledWith(
          'login_failed',
          expect.anything(),
          expect.objectContaining({ errorType: 'service_error' }),
          false,
          'service_error'
        );

        // Restore the spy
        jest.restoreAllMocks();
      });

      test('should handle invalid authentication source', async () => {
        // Arrange
        const loginRequest: LoginRequest = {
          username: 'testuser',
          password: 'password',
          authSource: 'invalid' as any
        };

        // Act & Assert
        await expect(service.authenticate(loginRequest, mockRequest as Request))
          .rejects.toThrow('Invalid authentication source');

        expect(createError).toHaveBeenCalledWith('Invalid authentication source', 400);
      });
    });

    describe('Security Edge Cases', () => {
      test('should prevent SQL injection in username', async () => {
        // Arrange
        const loginRequest: LoginRequest = {
          username: "admin'; DROP TABLE users; --",
          password: 'password',
          authSource: 'local'
        };

        (db.query as jest.Mock).mockResolvedValue({ rows: [] });

        // Act & Assert
        await expect(service.authenticate(loginRequest, mockRequest as Request))
          .rejects.toThrow();

        // Verify that the malicious username was passed to the query as a parameter
        expect(db.query).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining(["admin'; DROP TABLE users; --", 'local'])
        );
      });

      test('should prevent LDAP injection in username', async () => {
        // Arrange
        const loginRequest: LoginRequest = {
          username: "user)(|(password=*))",
          password: 'password',
          authSource: 'ad'
        };

        // Create a mock AD service that returns false for authentication
        const mockADService = {
          authenticateUser: jest.fn().mockResolvedValue(false)
        };

        // Mock the serviceFactory to return our mock AD service
        const serviceFactoryModule = require('@/services/service.factory');
        jest.spyOn(serviceFactoryModule.serviceFactory, 'getADService').mockResolvedValue(mockADService);

        // Act & Assert
        await expect(service.authenticate(loginRequest, mockRequest as Request))
          .rejects.toThrow();

        // Verify the service was called with the malicious input (it should handle injection safely)
        expect(mockADService.authenticateUser).toHaveBeenCalledWith(
          "user)(|(password=*))",
          'password'
        );

        // Restore the spy
        jest.restoreAllMocks();
      });

      test('should handle extremely long credentials', async () => {
        // Arrange
        const loginRequest: LoginRequest = {
          username: 'a'.repeat(10000),
          password: 'b'.repeat(10000),
          authSource: 'local'
        };

        (db.query as jest.Mock).mockResolvedValue({ rows: [] });

        // Act & Assert
        await expect(service.authenticate(loginRequest, mockRequest as Request))
          .rejects.toThrow();

        expect(failedLoginTracker.recordFailedAttempt).toHaveBeenCalled();
      });

      test('should handle null/undefined credentials', async () => {
        // Arrange
        const loginRequest: LoginRequest = {
          username: null as any,
          password: undefined as any,
          authSource: 'local'
        };

        (db.query as jest.Mock).mockResolvedValue({ rows: [] });

        // Act & Assert
        await expect(service.authenticate(loginRequest, mockRequest as Request))
          .rejects.toThrow();
      });

      test('should handle user enumeration attempts', async () => {
        // Arrange - test with both existing and non-existing users
        const existingUserRequest: LoginRequest = {
          username: 'existinguser',
          password: 'wrongpassword',
          authSource: 'local'
        };

        const nonExistingUserRequest: LoginRequest = {
          username: 'nonexistentuser',
          password: 'anypassword',
          authSource: 'local'
        };

        // Mock existing user with wrong password
        (db.query as jest.Mock)
          .mockResolvedValueOnce({ rows: [{ password_hash: 'hash' }] })
          .mockResolvedValueOnce({ rows: [{ id: 6, is_active: true }] });
        
        (bcrypt.compare as jest.Mock).mockResolvedValue(false);

        // Act & Assert - both should return the same error
        await expect(service.authenticate(existingUserRequest, mockRequest as Request))
          .rejects.toThrow('Invalid credentials');

        (db.query as jest.Mock).mockResolvedValue({ rows: [] });

        await expect(service.authenticate(nonExistingUserRequest, mockRequest as Request))
          .rejects.toThrow('Invalid credentials');

        // Both should trigger failed attempt tracking
        expect(failedLoginTracker.recordFailedAttempt).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('refreshAccessToken method', () => {
    describe('Happy Path Scenarios', () => {
      test('should successfully refresh valid JWT token', async () => {
        // Arrange
        const mockRefreshPayload: RefreshTokenPayload = {
          userId: 1,
          sessionId: 'test-session',
          familyId: 'token-family-123',
          jti: 'refresh-jti',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 86400
        };

        const _mockUser = { // eslint-disable-line @typescript-eslint/no-unused-vars
          id: 1,
          username: 'testuser',
          isActive: true,
          authSource: 'ad'
        };

        const mockSession = {
          userId: 1,
          username: 'testuser',
          createdAt: new Date()
        };

        (jwt.verify as jest.Mock).mockReturnValue(mockRefreshPayload);
        (redis.getJson as jest.Mock)
          .mockResolvedValueOnce({ // Token family data
            userId: 1,
            sessionId: 'test-session',
            latestJti: 'refresh-jti',
            createdAt: new Date(),
            rotatedAt: new Date()
          })
          .mockResolvedValueOnce(mockSession); // Session data

        (db.query as jest.Mock).mockResolvedValue({
          rows: [{
            id: 1,
            username: 'testuser',
            display_name: 'Test User',
            is_active: true,
            auth_source: 'ad'
          }]
        });

        // Act
        const result = await service.refreshAccessToken('valid-refresh-token', mockRequest as Request);

        // Assert
        expect(result).toHaveProperty('accessToken');
        expect(result).toHaveProperty('refreshToken');
        expect(result.user.username).toBe('testuser');
        expect(tokenBlacklist.blacklistToken).toHaveBeenCalledWith('valid-refresh-token', 'Token rotation');
        expect(auditLogger.logAuth).toHaveBeenCalledWith(
          'token_refresh',
          expect.anything(),
          expect.anything(),
          true
        );
      });

      test('should handle token refresh in cookie mode', async () => {
        // Arrange
        const mockRefreshPayload: RefreshTokenPayload = {
          userId: 2,
          sessionId: 'cookie-session',
          familyId: 'cookie-family',
          jti: 'cookie-jti',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 86400
        };

        (jwt.verify as jest.Mock).mockReturnValue(mockRefreshPayload);
        (redis.getJson as jest.Mock)
          .mockResolvedValueOnce({ latestJti: 'cookie-jti' })
          .mockResolvedValueOnce({ userId: 2 });

        (db.query as jest.Mock).mockResolvedValue({
          rows: [{
            id: 2,
            username: 'cookieuser',
            is_active: true
          }]
        });

        // Act
        const result = await service.refreshAccessToken(
          'cookie-refresh-token',
          mockRequest as Request,
          { mode: AuthMode.COOKIE, generateCSRF: true }
        );

        // Assert
        expect(result).toHaveProperty('csrfToken');
      });
    });

    describe('Error Conditions', () => {
      test('should handle expired refresh token', async () => {
        // Arrange
        const expiredError = new Error('Token expired');
        expiredError.name = 'TokenExpiredError';
        (jwt.verify as jest.Mock).mockImplementation(() => {
          throw expiredError;
        });

        // Act & Assert
        await expect(service.refreshAccessToken('expired-token', mockRequest as Request))
          .rejects.toThrow();

        expect(createError).toHaveBeenCalledWith('Refresh token has expired', 401);
      });

      test('should handle invalid refresh token', async () => {
        // Arrange
        const invalidError = new Error('Invalid token');
        invalidError.name = 'JsonWebTokenError';
        (jwt.verify as jest.Mock).mockImplementation(() => {
          throw invalidError;
        });

        // Act & Assert
        await expect(service.refreshAccessToken('invalid-token', mockRequest as Request))
          .rejects.toThrow();

        expect(createError).toHaveBeenCalledWith('Invalid refresh token', 401);
      });

      test('should handle blacklisted refresh token', async () => {
        // Arrange
        (jwt.verify as jest.Mock).mockReturnValue({ userId: 3, jti: 'blacklisted' });
        (tokenBlacklist.isTokenBlacklisted as jest.Mock).mockResolvedValue(true);

        // Act & Assert
        await expect(service.refreshAccessToken('blacklisted-token', mockRequest as Request))
          .rejects.toThrow();

        expect(createError).toHaveBeenCalledWith('Invalid refresh token', 401);
      });

      test('should handle token reuse attack', async () => {
        // Arrange
        const mockPayload = {
          userId: 4,
          sessionId: 'compromised-session',
          familyId: 'compromised-family',
          jti: 'old-jti'
        };

        (jwt.verify as jest.Mock).mockReturnValue(mockPayload);
        (redis.getJson as jest.Mock).mockResolvedValue({
          latestJti: 'new-jti', // Different from token's jti
          userId: 4
        });

        // Mock logoutAllSessions
        (db.query as jest.Mock).mockResolvedValue({ rows: [] });

        // Act & Assert
        await expect(service.refreshAccessToken('old-refresh-token', mockRequest as Request))
          .rejects.toThrow();

        expect(createError).toHaveBeenCalledWith('Invalid refresh token', 401);
        expect(redis.del).toHaveBeenCalledWith('token_family:compromised-family');
      });

      test('should handle missing token family', async () => {
        // Arrange
        const mockPayload = {
          userId: 5,
          familyId: 'missing-family',
          jti: 'some-jti'
        };

        (jwt.verify as jest.Mock).mockReturnValue(mockPayload);
        (redis.getJson as jest.Mock).mockResolvedValue(null); // Family not found

        // Act & Assert
        await expect(service.refreshAccessToken('orphaned-token', mockRequest as Request))
          .rejects.toThrow();

        expect(createError).toHaveBeenCalledWith('Invalid refresh token', 401);
      });

      test('should handle inactive user during refresh', async () => {
        // Arrange
        (jwt.verify as jest.Mock).mockReturnValue({
          userId: 6,
          sessionId: 'inactive-session'
        });
        
        (redis.getJson as jest.Mock).mockResolvedValue({ userId: 6 });
        (db.query as jest.Mock).mockResolvedValue({
          rows: [{
            id: 6,
            username: 'inactiveuser',
            is_active: false
          }]
        });

        // Act & Assert
        await expect(service.refreshAccessToken('inactive-user-token', mockRequest as Request))
          .rejects.toThrow();

        expect(createError).toHaveBeenCalledWith('User not found or inactive', 401);
      });

      test('should handle expired session during refresh', async () => {
        // Arrange
        (jwt.verify as jest.Mock).mockReturnValue({
          userId: 7,
          sessionId: 'expired-session',
          familyId: 'expired-family',
          jti: 'expired-jti'
        });
        
        // Mock that token family exists, user exists, but session doesn't
        (redis.getJson as jest.Mock)
          .mockResolvedValueOnce({ // Token family data
            userId: 7,
            sessionId: 'expired-session',
            latestJti: 'expired-jti'
          })
          .mockResolvedValueOnce(null); // Session not found
        
        // Mock user exists and is active
        (db.query as jest.Mock).mockResolvedValue({
          rows: [{
            id: 7,
            username: 'testuser',
            is_active: true,
            auth_source: 'ad'
          }]
        });

        // Act & Assert
        await expect(service.refreshAccessToken('expired-session-token', mockRequest as Request))
          .rejects.toThrow();

        expect(createError).toHaveBeenCalledWith('Session expired', 401);
      });
    });

    describe('Security Edge Cases', () => {
      test('should prevent token family manipulation', async () => {
        // Arrange
        const mockPayload = {
          userId: 8,
          familyId: '../../../etc/passwd', // Path traversal attempt
          jti: 'malicious-jti'
        };

        (jwt.verify as jest.Mock).mockReturnValue(mockPayload);
        (redis.getJson as jest.Mock).mockResolvedValue(null);

        // Act & Assert
        await expect(service.refreshAccessToken('malicious-token', mockRequest as Request))
          .rejects.toThrow();
      });
    });
  });

  describe('verifyAccessToken method', () => {
    describe('Happy Path Scenarios', () => {
      test('should successfully verify valid JWT access token', async () => {
        // Arrange
        const mockPayload: JWTPayload = {
          userId: 1,
          username: 'testuser',
          sessionId: 'valid-session',
          jti: 'access-jti',
          authSource: 'ad',
          isAdmin: false,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600
        };

        const _mockUser = { // eslint-disable-line @typescript-eslint/no-unused-vars
          id: 1,
          username: 'testuser',
          isActive: true,
          authSource: 'ad'
        };

        (jwt.verify as jest.Mock).mockReturnValue(mockPayload);
        (redis.getJson as jest.Mock).mockResolvedValue({ userId: 1 }); // Session exists
        (db.query as jest.Mock).mockResolvedValue({
          rows: [{
            id: 1,
            username: 'testuser',
            is_active: true,
            auth_source: 'ad'
          }]
        });

        // Act
        const result = await service.verifyAccessToken('valid-access-token');

        // Assert
        expect(result.username).toBe('testuser');
        expect(tokenBlacklist.isTokenBlacklisted).toHaveBeenCalledWith('valid-access-token');
      });

      test('should skip blacklist check when requested', async () => {
        // Arrange
        const mockPayload: JWTPayload = {
          userId: 2,
          sessionId: 'skip-blacklist-session',
          jti: 'skip-jti',
          username: 'skipuser',
          authSource: 'ad',
          isAdmin: false,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600
        };

        (jwt.verify as jest.Mock).mockReturnValue(mockPayload);
        (redis.getJson as jest.Mock).mockResolvedValue({ userId: 2 });
        (db.query as jest.Mock).mockResolvedValue({
          rows: [{ id: 2, username: 'skipuser', is_active: true }]
        });

        // Act
        const result = await service.verifyAccessToken(
          'skip-blacklist-token',
          { skipBlacklistCheck: true }
        );

        // Assert
        expect(result.username).toBe('skipuser');
        expect(tokenBlacklist.isTokenBlacklisted).not.toHaveBeenCalled();
      });
    });

    describe('Error Conditions', () => {
      test('should handle expired access token', async () => {
        // Arrange
        const expiredError = new Error('Token expired');
        expiredError.name = 'TokenExpiredError';
        (jwt.verify as jest.Mock).mockImplementation(() => {
          throw expiredError;
        });

        // Act & Assert
        await expect(service.verifyAccessToken('expired-access-token'))
          .rejects.toThrow();

        expect(createError).toHaveBeenCalledWith('Access token has expired', 401);
      });

      test('should handle invalid access token', async () => {
        // Arrange
        const invalidError = new Error('Invalid token');
        invalidError.name = 'JsonWebTokenError';
        (jwt.verify as jest.Mock).mockImplementation(() => {
          throw invalidError;
        });

        // Act & Assert
        await expect(service.verifyAccessToken('invalid-access-token'))
          .rejects.toThrow();

        expect(createError).toHaveBeenCalledWith('Invalid access token', 401);
      });

      test('should handle blacklisted access token', async () => {
        // Arrange
        (jwt.verify as jest.Mock).mockReturnValue({ userId: 3, sessionId: 'test' });
        (tokenBlacklist.isTokenBlacklisted as jest.Mock).mockResolvedValue(true);

        // Act & Assert
        await expect(service.verifyAccessToken('blacklisted-access-token'))
          .rejects.toThrow();

        expect(createError).toHaveBeenCalledWith('Invalid access token', 401);
      });

      test('should handle session not found', async () => {
        // Arrange
        (jwt.verify as jest.Mock).mockReturnValue({
          userId: 4,
          sessionId: 'nonexistent-session'
        });
        (redis.getJson as jest.Mock).mockResolvedValue(null);

        // Act & Assert
        await expect(service.verifyAccessToken('no-session-token'))
          .rejects.toThrow();

        expect(createError).toHaveBeenCalledWith('Session expired', 401);
      });

      test('should handle user not found', async () => {
        // Arrange
        (jwt.verify as jest.Mock).mockReturnValue({
          userId: 999,
          sessionId: 'valid-session'
        });
        (redis.getJson as jest.Mock).mockResolvedValue({ userId: 999 });
        (db.query as jest.Mock).mockResolvedValue({ rows: [] });

        // Act & Assert
        await expect(service.verifyAccessToken('nonexistent-user-token'))
          .rejects.toThrow();

        expect(createError).toHaveBeenCalledWith('User not found or inactive', 401);
      });
    });
  });

  describe('logout method', () => {
    test('should successfully logout user session', async () => {
      // Arrange
      const sessionId = 'logout-session';
      const token = 'logout-token';
      
      (redis.getJson as jest.Mock).mockResolvedValue({
        userId: 1,
        username: 'testuser',
        createdAt: new Date(Date.now() - 3600000) // 1 hour ago
      });

      (db.query as jest.Mock).mockResolvedValue({ rows: [] });

      // Act
      await service.logout(sessionId, token, mockRequest as Request);

      // Assert
      expect(tokenBlacklist.blacklistToken).toHaveBeenCalledWith(token, 'User logout');
      expect(redis.del).toHaveBeenCalledWith(`session:${sessionId}`);
      expect(db.query).toHaveBeenCalledWith(
        'DELETE FROM user_sessions WHERE id = $1',
        [sessionId]
      );
      expect(auditLogger.logAuth).toHaveBeenCalledWith(
        'logout',
        expect.anything(),
        expect.anything(),
        true
      );
    });

    test('should handle logout without token', async () => {
      // Arrange
      const sessionId = 'no-token-session';
      
      (redis.getJson as jest.Mock).mockResolvedValue({
        userId: 2,
        username: 'notokenuser'
      });

      // Act
      await service.logout(sessionId, undefined, mockRequest as Request);

      // Assert
      expect(tokenBlacklist.blacklistToken).not.toHaveBeenCalled();
      expect(redis.del).toHaveBeenCalledWith(`session:${sessionId}`);
    });

    test('should handle logout service errors', async () => {
      // Arrange
      const sessionId = 'error-session';
      (redis.del as jest.Mock).mockRejectedValue(new Error('Redis error'));

      // Act & Assert
      await expect(service.logout(sessionId, undefined, mockRequest as Request))
        .rejects.toThrow('Redis error');
    });
  });

  describe('logoutAllSessions method', () => {
    test('should logout all sessions for user', async () => {
      // Arrange
      const userId = 1;
      const mockSessions = [
        { id: 'session-1' },
        { id: 'session-2' },
        { id: 'session-3' }
      ];

      (db.query as jest.Mock)
        .mockResolvedValueOnce({ rows: mockSessions }) // Get sessions
        .mockResolvedValueOnce({ rows: [] }); // Delete sessions

      // Act
      await service.logoutAllSessions(userId);

      // Assert
      expect(redis.del).toHaveBeenCalledTimes(3);
      expect(redis.del).toHaveBeenCalledWith('session:session-1');
      expect(redis.del).toHaveBeenCalledWith('session:session-2');
      expect(redis.del).toHaveBeenCalledWith('session:session-3');
      expect(db.query).toHaveBeenCalledWith(
        'DELETE FROM user_sessions WHERE user_id = $1',
        [userId]
      );
    });

    test('should handle errors during logout all', async () => {
      // Arrange
      const userId = 2;
      (db.query as jest.Mock).mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await expect(service.logoutAllSessions(userId))
        .rejects.toThrow('Database error');
    });
  });

  describe('IP Address Extraction', () => {
    test('should extract IP from X-Forwarded-For header', async () => {
      // Arrange
      const requestWithForwarded = {
        ...mockRequest,
        headers: { 'x-forwarded-for': '203.0.113.1, 70.41.3.18, 150.172.238.178' }
      } as Request;

      const loginRequest: LoginRequest = {
        username: 'testuser',
        password: 'wrongpassword',
        authSource: 'local'
      };

      (db.query as jest.Mock).mockResolvedValue({ rows: [] });

      // Act
      await expect(service.authenticate(loginRequest, requestWithForwarded)).rejects.toThrow();

      // Assert
      expect(failedLoginTracker.recordFailedAttempt).toHaveBeenCalledWith(
        expect.objectContaining({
          ipAddress: '203.0.113.1' // Should extract first IP
        })
      );
    });

    test('should extract IP from X-Real-IP header when X-Forwarded-For not available', async () => {
      // Arrange
      const requestWithRealIp = {
        ...mockRequest,
        headers: { 'x-real-ip': '198.51.100.1' }
      } as Request;

      const loginRequest: LoginRequest = {
        username: 'testuser',
        password: 'wrongpassword',
        authSource: 'local'
      };

      (db.query as jest.Mock).mockResolvedValue({ rows: [] });

      // Act
      await expect(service.authenticate(loginRequest, requestWithRealIp)).rejects.toThrow();

      // Assert
      expect(failedLoginTracker.recordFailedAttempt).toHaveBeenCalledWith(
        expect.objectContaining({
          ipAddress: '198.51.100.1'
        })
      );
    });

    test('should fallback to connection remote address', async () => {
      // Arrange
      const requestWithConnectionIp = {
        ...mockRequest,
        headers: {},
        connection: { remoteAddress: '192.168.1.100' }
      } as Request;

      const loginRequest: LoginRequest = {
        username: 'testuser',
        password: 'wrongpassword',
        authSource: 'local'
      };

      (db.query as jest.Mock).mockResolvedValue({ rows: [] });

      // Act
      await expect(service.authenticate(loginRequest, requestWithConnectionIp)).rejects.toThrow();

      // Assert
      expect(failedLoginTracker.recordFailedAttempt).toHaveBeenCalledWith(
        expect.objectContaining({
          ipAddress: '192.168.1.100'
        })
      );
    });
  });

  describe('testAuthConnections method', () => {
    test('should test all authentication connections', async () => {
      // Arrange
      const mockADService = {
        testConnection: jest.fn().mockResolvedValue(undefined)
      };
      
      const mockAzureService = {
        testConnection: jest.fn().mockResolvedValue(undefined)
      };
      
      const mockO365Service = {
        testConnection: jest.fn().mockRejectedValue(new Error('O365 unavailable'))
      };

      // Create a new service instance with fresh module mocks
      const mockServiceFactory = {
        getAzureService: jest.fn().mockResolvedValue(mockAzureService),
        getO365Service: jest.fn().mockResolvedValue(mockO365Service)
      };

      // Reset modules and set up mocks
      jest.resetModules();
      
      jest.doMock('@/services/service.factory', () => ({
        serviceFactory: mockServiceFactory
      }));

      jest.doMock('@/services/ad.service', () => ({
        getADService: jest.fn().mockReturnValue(mockADService)
      }));

      // Mock database connection test
      (db.query as jest.Mock).mockResolvedValue({ rows: [{ 1: 1 }] });

      // Re-import and recreate the service to use the fresh mocks
      const { UnifiedAuthenticationService: FreshService } = await import('./unified-auth.service');
      const freshService = new FreshService();

      // Act
      const result = await freshService.testAuthConnections();

      // Assert
      expect(result.local.connected).toBe(true);
      expect(result.ad.connected).toBe(true);
      expect(result.azure.connected).toBe(true);
      expect(result.o365.connected).toBe(false);
      expect(result.o365.error).toBe('O365 unavailable');

      // Cleanup
      freshService.cleanup();
    });

    test('should handle service not available', async () => {
      // Arrange
      jest.resetModules();

      jest.doMock('@/services/ad.service', () => ({
        getADService: jest.fn().mockReturnValue(null)
      }));

      jest.doMock('@/services/service.factory', () => ({
        serviceFactory: {
          getAzureService: jest.fn().mockResolvedValue(null),
          getO365Service: jest.fn().mockResolvedValue(null)
        }
      }));

      (db.query as jest.Mock).mockResolvedValue({ rows: [{ 1: 1 }] });

      // Re-import and recreate the service to use the fresh mocks
      const { UnifiedAuthenticationService: FreshService } = await import('./unified-auth.service');
      const freshService = new FreshService();

      // Act
      const result = await freshService.testAuthConnections();

      // Assert
      expect(result.ad.connected).toBe(false);
      expect(result.ad.error).toBe('AD service not available');
      expect(result.azure.connected).toBe(false);
      expect(result.azure.error).toBe('Azure service not available');

      // Cleanup
      freshService.cleanup();
    });
  });

  describe('User Cache Management', () => {
    test('should cache user data for performance', async () => {
      // Arrange
      const mockPayload: JWTPayload = {
        userId: 1,
        sessionId: 'cache-session',
        jti: 'cache-jti',
        username: 'cacheuser',
        authSource: 'ad',
        isAdmin: false,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600
      };

      (jwt.verify as jest.Mock).mockReturnValue(mockPayload);
      (redis.getJson as jest.Mock).mockResolvedValue({ userId: 1 });
      (db.query as jest.Mock).mockResolvedValue({
        rows: [{ id: 1, username: 'cacheuser', is_active: true }]
      });

      // Act - First call should query database
      await service.verifyAccessToken('cache-token-1', { skipBlacklistCheck: true });
      
      // Act - Second call should use cache
      await service.verifyAccessToken('cache-token-2', { skipBlacklistCheck: true });

      // Assert - Database should only be called once
      expect(db.query).toHaveBeenCalledTimes(1);
    });
  });
});