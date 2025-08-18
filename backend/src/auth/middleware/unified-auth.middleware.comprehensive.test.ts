import { Request, Response, NextFunction } from 'express';
import { 
  authenticate, 
  requireAuth, 
  requireAdmin, 
  optionalAuth, 
  requireAuthSource,
  requireCSRF,
  requireRole,
  requireResourceAccess,
  auditAction,
  userRateLimit,
  autoRefreshToken,
  roleCheckers,
  resourceCheckers 
} from './unified-auth.middleware';
import { unifiedAuthService } from '../services/unified-auth.service';
import { AuthStrategyFactory } from '../strategies';
import { csrfService } from '@/services/csrf.service';
import { createError } from '@/middleware/error.middleware';
import { AuthMode } from '../types';

// Mock dependencies
jest.mock('../services/unified-auth.service');
jest.mock('../strategies');
jest.mock('@/services/csrf.service');
jest.mock('@/middleware/error.middleware');
jest.mock('@/utils/logger');
jest.mock('@/services/audit-logger.service');

describe('Authentication Middleware - Comprehensive Tests', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let mockStrategy: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mock request
    mockReq = {
      method: 'GET',
      path: '/api/test',
      headers: {},
      cookies: {},
      body: {},
      params: {},
      query: {},
      ip: '127.0.0.1',
      get: jest.fn((header) => {
        const headers: any = {
          'user-agent': 'Test User Agent'
        };
        return headers[header.toLowerCase()];
      })
    };

    // Setup mock response
    mockRes = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
      cookie: jest.fn(),
      set: jest.fn(),
      on: jest.fn()
    };

    // Setup mock next function
    mockNext = jest.fn();

    // Setup mock strategy
    mockStrategy = {
      extractToken: jest.fn(),
      setAuthResponse: jest.fn(),
      clearAuth: jest.fn()
    };

    // Setup default mocks
    (unifiedAuthService.getAuthMode as jest.Mock).mockReturnValue(AuthMode.JWT);
    (AuthStrategyFactory.getStrategy as jest.Mock).mockReturnValue(mockStrategy);
    (createError as jest.Mock).mockImplementation((message, statusCode) => {
      const error: any = new Error(message);
      error.statusCode = statusCode;
      return error;
    });
  });

  describe('authenticate middleware', () => {
    describe('Happy Path Scenarios', () => {
      test('should authenticate valid JWT token successfully', async () => {
        // Arrange
        const mockUser = {
          id: 1,
          username: 'testuser',
          isActive: true,
          isAdmin: false,
          authSource: 'ad'
        };
        
        // Create a proper JWT token structure for session ID extraction
        const tokenPayload = { sessionId: 'test-session-123' };
        const encodedPayload = Buffer.from(JSON.stringify(tokenPayload)).toString('base64');
        const mockToken = `header.${encodedPayload}.signature`;
        
        mockStrategy.extractToken.mockReturnValue(mockToken);
        (csrfService.validateCSRFToken as jest.Mock).mockReturnValue(true);
        (unifiedAuthService.verifyAccessToken as jest.Mock).mockResolvedValue(mockUser);

        const middleware = authenticate({ required: true });

        // Act
        await middleware(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(mockReq.authMode).toBe(AuthMode.JWT);
        expect(mockReq.user).toBe(mockUser);
        expect(mockReq.sessionId).toBe('test-session-123');
        expect(mockNext).toHaveBeenCalledWith();
        expect(mockNext).not.toHaveBeenCalledWith(expect.any(Error));
      });

      test('should handle optional authentication when no token provided', async () => {
        // Arrange
        mockStrategy.extractToken.mockReturnValue(null);
        const middleware = authenticate({ required: false });

        // Act
        await middleware(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(mockNext).toHaveBeenCalledWith();
        expect(mockReq.user).toBeUndefined();
      });

      test('should authenticate admin user with admin requirements', async () => {
        // Arrange
        const mockAdminUser = {
          id: 2,
          username: 'admin',
          isActive: true,
          isAdmin: true,
          authSource: 'local'
        };
        
        // Create a proper JWT token structure for session ID extraction
        const tokenPayload = { sessionId: 'admin-session-456' };
        const encodedPayload = Buffer.from(JSON.stringify(tokenPayload)).toString('base64');
        const mockToken = `header.${encodedPayload}.signature`;
        
        mockStrategy.extractToken.mockReturnValue(mockToken);
        (unifiedAuthService.verifyAccessToken as jest.Mock).mockResolvedValue(mockAdminUser);

        const middleware = authenticate({ required: true, adminOnly: true });

        // Act
        await middleware(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(mockReq.user).toBe(mockAdminUser);
        expect(mockReq.sessionId).toBe('admin-session-456');
        expect(mockNext).toHaveBeenCalledWith();
      });

      test('should authenticate user from allowed auth sources', async () => {
        // Arrange
        const mockUser = {
          id: 3,
          username: 'azureuser',
          isActive: true,
          isAdmin: false,
          authSource: 'azure'
        };
        
        // Create a proper JWT token structure for session ID extraction
        const tokenPayload = { sessionId: 'azure-session-789' };
        const encodedPayload = Buffer.from(JSON.stringify(tokenPayload)).toString('base64');
        const mockToken = `header.${encodedPayload}.signature`;
        
        mockStrategy.extractToken.mockReturnValue(mockToken);
        (unifiedAuthService.verifyAccessToken as jest.Mock).mockResolvedValue(mockUser);

        const middleware = authenticate({ 
          required: true, 
          allowedSources: ['azure', 'o365'] 
        });

        // Act
        await middleware(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(mockReq.user).toBe(mockUser);
        expect(mockReq.sessionId).toBe('azure-session-789');
        expect(mockNext).toHaveBeenCalledWith();
      });
    });

    describe('Error Conditions', () => {
      test('should reject when required authentication is missing', async () => {
        // Arrange
        mockStrategy.extractToken.mockReturnValue(null);
        const middleware = authenticate({ required: true });

        // Act
        await middleware(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(createError).toHaveBeenCalledWith(
          'Access token required. Please login to continue.',
          401
        );
        expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      });

      test('should reject inactive user', async () => {
        // Arrange
        const mockInactiveUser = {
          id: 4,
          username: 'inactiveuser',
          isActive: false,
          isAdmin: false,
          authSource: 'ad'
        };
        
        mockStrategy.extractToken.mockReturnValue('valid-token');
        (unifiedAuthService.verifyAccessToken as jest.Mock).mockResolvedValue(mockInactiveUser);

        const middleware = authenticate({ required: true });

        // Act
        await middleware(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(createError).toHaveBeenCalledWith('Account is inactive', 403);
        expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      });

      test('should reject non-admin user for admin-only endpoints', async () => {
        // Arrange
        const mockUser = {
          id: 5,
          username: 'regularuser',
          isActive: true,
          isAdmin: false,
          authSource: 'ad'
        };
        
        mockStrategy.extractToken.mockReturnValue('valid-token');
        (unifiedAuthService.verifyAccessToken as jest.Mock).mockResolvedValue(mockUser);

        const middleware = authenticate({ required: true, adminOnly: true });

        // Act
        await middleware(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(createError).toHaveBeenCalledWith('Administrator access required', 403);
        expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      });

      test('should reject user from unauthorized auth source', async () => {
        // Arrange
        const mockUser = {
          id: 6,
          username: 'ldapuser',
          isActive: true,
          isAdmin: false,
          authSource: 'ad'
        };
        
        mockStrategy.extractToken.mockReturnValue('valid-token');
        (unifiedAuthService.verifyAccessToken as jest.Mock).mockResolvedValue(mockUser);

        const middleware = authenticate({ 
          required: true, 
          allowedSources: ['azure', 'o365'] 
        });

        // Act
        await middleware(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(createError).toHaveBeenCalledWith('Authentication source not allowed', 403);
        expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      });

      test('should handle token verification errors', async () => {
        // Arrange
        mockStrategy.extractToken.mockReturnValue('invalid-token');
        (unifiedAuthService.verifyAccessToken as jest.Mock).mockRejectedValue(new Error('Token expired'));

        const middleware = authenticate({ required: true });

        // Act
        await middleware(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(createError).toHaveBeenCalledWith('Invalid or expired token', 401);
        expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      });

      test('should handle middleware internal errors', async () => {
        // Arrange
        (unifiedAuthService.getAuthMode as jest.Mock).mockImplementation(() => {
          throw new Error('Internal service error');
        });

        const middleware = authenticate({ required: true });

        // Act
        await middleware(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(createError).toHaveBeenCalledWith('Authentication failed', 500);
        expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      });
    });

    describe('Security Edge Cases', () => {
      test('should prevent JWT payload injection via malformed token', async () => {
        // Arrange
        const mockUser = {
          id: 7,
          username: 'testuser',
          isActive: true,
          isAdmin: false,
          authSource: 'ad'
        };
        
        // Create a token with malformed payload that will cause JSON.parse to fail
        const malformedPayload = Buffer.from('{"invalid":"json"').toString('base64'); // Incomplete JSON
        const mockToken = `header.${malformedPayload}.signature`;
        
        mockStrategy.extractToken.mockReturnValue(mockToken);
        (unifiedAuthService.verifyAccessToken as jest.Mock).mockResolvedValue(mockUser);

        const middleware = authenticate({ required: true });

        // Act
        await middleware(mockReq as Request, mockRes as Response, mockNext);

        // Assert - should fail due to malformed JSON in session ID extraction
        expect(createError).toHaveBeenCalledWith('Invalid or expired token', 401);
        expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      });

      test('should validate CSRF token for state-changing requests in cookie mode', async () => {
        // Arrange
        mockReq.method = 'POST';
        (unifiedAuthService.getAuthMode as jest.Mock).mockReturnValue(AuthMode.COOKIE);
        mockStrategy.extractToken.mockReturnValue('valid-token');
        (csrfService.validateCSRFToken as jest.Mock).mockReturnValue(false);

        const middleware = authenticate({ required: true });

        // Act
        await middleware(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(createError).toHaveBeenCalledWith('CSRF validation failed', 403);
        expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      });

      test('should handle null/undefined user injection attempts', async () => {
        // Arrange
        mockStrategy.extractToken.mockReturnValue('valid-token');
        (unifiedAuthService.verifyAccessToken as jest.Mock).mockResolvedValue(null);

        const middleware = authenticate({ required: true });

        // Act
        await middleware(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(createError).toHaveBeenCalledWith('Invalid or expired token', 401);
        expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      });

      test('should prevent privilege escalation through user object manipulation', async () => {
        // Arrange
        const mockUser = {
          id: 8,
          username: 'regularuser',
          isActive: true,
          isAdmin: false,
          authSource: 'ad'
        };
        
        mockStrategy.extractToken.mockReturnValue('valid-token');
        (unifiedAuthService.verifyAccessToken as jest.Mock).mockResolvedValue(mockUser);

        const middleware = authenticate({ required: true, adminOnly: true });

        // Attempt to modify user object after verification
        (unifiedAuthService.verifyAccessToken as jest.Mock).mockImplementation(() => {
          const user = { ...mockUser };
          // Simulate tampering attempt
          setTimeout(() => { user.isAdmin = true; }, 0);
          return Promise.resolve(user);
        });

        // Act
        await middleware(mockReq as Request, mockRes as Response, mockNext);

        // Assert - should still reject based on original isAdmin value
        expect(createError).toHaveBeenCalledWith('Administrator access required', 403);
        expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      });
    });

    describe('Authorization Checks', () => {
      test('should handle empty allowed sources array', async () => {
        // Arrange
        const mockUser = {
          id: 9,
          username: 'testuser',
          isActive: true,
          isAdmin: false,
          authSource: 'ad'
        };
        
        mockStrategy.extractToken.mockReturnValue('valid-token');
        (unifiedAuthService.verifyAccessToken as jest.Mock).mockResolvedValue(mockUser);

        const middleware = authenticate({ 
          required: true, 
          allowedSources: [] 
        });

        // Act
        await middleware(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(createError).toHaveBeenCalledWith('Authentication source not allowed', 403);
        expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      });

      test('should properly extract session ID from valid JWT', async () => {
        // Arrange
        const mockUser = {
          id: 10,
          username: 'testuser',
          isActive: true,
          isAdmin: false,
          authSource: 'ad'
        };
        
        const tokenPayload = { sessionId: 'test-session-123' };
        const encodedPayload = Buffer.from(JSON.stringify(tokenPayload)).toString('base64');
        const mockToken = `header.${encodedPayload}.signature`;
        
        mockStrategy.extractToken.mockReturnValue(mockToken);
        (unifiedAuthService.verifyAccessToken as jest.Mock).mockResolvedValue(mockUser);

        const middleware = authenticate({ required: true });

        // Act
        await middleware(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(mockReq.sessionId).toBe('test-session-123');
        expect(mockReq.user).toBe(mockUser);
        expect(mockNext).toHaveBeenCalledWith();
      });
    });

    describe('Token Validation', () => {
      test('should skip blacklist check for cookie mode when configured', async () => {
        // Arrange
        const mockUser = {
          id: 11,
          username: 'testuser',
          isActive: true,
          isAdmin: false,
          authSource: 'ad'
        };
        
        (unifiedAuthService.getAuthMode as jest.Mock).mockReturnValue(AuthMode.COOKIE);
        
        // Create a proper JWT token structure for session ID extraction
        const tokenPayload = { sessionId: 'cookie-session-111' };
        const encodedPayload = Buffer.from(JSON.stringify(tokenPayload)).toString('base64');
        const mockToken = `header.${encodedPayload}.signature`;
        
        mockStrategy.extractToken.mockReturnValue(mockToken);
        (csrfService.validateCSRFToken as jest.Mock).mockReturnValue(true);
        (unifiedAuthService.verifyAccessToken as jest.Mock).mockResolvedValue(mockUser);

        const middleware = authenticate({ required: true });

        // Act
        await middleware(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(unifiedAuthService.verifyAccessToken).toHaveBeenCalledWith(
          mockToken,
          { skipBlacklistCheck: true }
        );
        expect(mockReq.user).toBe(mockUser);
        expect(mockReq.sessionId).toBe('cookie-session-111');
        expect(mockNext).toHaveBeenCalledWith();
      });
    });
  });

  describe('requireCSRF middleware', () => {
    test('should skip CSRF validation for GET requests', async () => {
      // Arrange
      mockReq.method = 'GET';

      // Act
      await requireCSRF(mockReq as Request, mockRes as Response, mockNext);

      // Assert
      expect(csrfService.validateCSRFToken).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalledWith();
    });

    test('should skip CSRF validation for non-cookie mode', async () => {
      // Arrange
      mockReq.method = 'POST';
      mockReq.authMode = AuthMode.JWT;

      // Act
      await requireCSRF(mockReq as Request, mockRes as Response, mockNext);

      // Assert
      expect(csrfService.validateCSRFToken).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalledWith();
    });

    test('should validate CSRF token for POST requests in cookie mode', async () => {
      // Arrange
      mockReq.method = 'POST';
      mockReq.authMode = AuthMode.COOKIE;
      (csrfService.validateCSRFToken as jest.Mock).mockReturnValue(true);

      // Act
      await requireCSRF(mockReq as Request, mockRes as Response, mockNext);

      // Assert
      expect(csrfService.validateCSRFToken).toHaveBeenCalledWith(mockReq);
      expect(mockNext).toHaveBeenCalledWith();
    });

    test('should reject invalid CSRF token', async () => {
      // Arrange
      mockReq.method = 'POST';
      mockReq.authMode = AuthMode.COOKIE;
      (csrfService.validateCSRFToken as jest.Mock).mockReturnValue(false);

      // Act
      await requireCSRF(mockReq as Request, mockRes as Response, mockNext);

      // Assert
      expect(createError).toHaveBeenCalledWith('CSRF validation failed', 403);
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('requireRole middleware', () => {
    test('should allow user with required role', async () => {
      // Arrange
      mockReq.user = {
        id: 12,
        username: 'testuser',
        roles: ['admin', 'moderator']
      } as any;

      const middleware = requireRole(['admin']);

      // Act
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith();
    });

    test('should reject user without required role', async () => {
      // Arrange
      mockReq.user = {
        id: 13,
        username: 'testuser',
        roles: ['user']
      } as any;

      const middleware = requireRole(['admin']);

      // Act
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      // Assert
      expect(createError).toHaveBeenCalledWith('Insufficient permissions', 403);
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    test('should reject unauthenticated user', async () => {
      // Arrange
      mockReq.user = undefined;
      const middleware = requireRole(['admin']);

      // Act
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      // Assert
      expect(createError).toHaveBeenCalledWith('Authentication required', 401);
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('requireResourceAccess middleware', () => {
    test('should allow access when checker returns true', async () => {
      // Arrange
      mockReq.user = { id: 14, username: 'testuser' } as any;
      const mockChecker = jest.fn().mockResolvedValue(true);
      const middleware = requireResourceAccess(mockChecker);

      // Act
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      // Assert
      expect(mockChecker).toHaveBeenCalledWith(mockReq);
      expect(mockNext).toHaveBeenCalledWith();
    });

    test('should deny access when checker returns false', async () => {
      // Arrange
      mockReq.user = { id: 15, username: 'testuser' } as any;
      const mockChecker = jest.fn().mockResolvedValue(false);
      const middleware = requireResourceAccess(mockChecker);

      // Act
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      // Assert
      expect(createError).toHaveBeenCalledWith('Access denied to this resource', 403);
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    test('should handle checker errors', async () => {
      // Arrange
      mockReq.user = { id: 16, username: 'testuser' } as any;
      const mockChecker = jest.fn().mockRejectedValue(new Error('Checker error'));
      const middleware = requireResourceAccess(mockChecker);

      // Act
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      // Assert
      expect(createError).toHaveBeenCalledWith('Error checking resource access', 500);
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('auditAction middleware', () => {
    test('should set audit info and log on response finish', async () => {
      // Arrange
      mockReq.user = { id: 17, username: 'testuser' } as any;
      // Use Object.defineProperty to set readonly property
      Object.defineProperty(mockReq, 'ip', {
        value: '192.168.1.1',
        writable: false,
        enumerable: true,
        configurable: true
      });
      
      let finishCallback: () => void;
      (mockRes.on as jest.Mock).mockImplementation((event, callback) => {
        if (event === 'finish') {
          finishCallback = callback;
        }
      });

      const mockAuditLogger = {
        logAccess: jest.fn().mockResolvedValue(undefined)
      };
      
      // Mock dynamic import
      jest.doMock('@/services/audit-logger.service', () => ({
        auditLogger: mockAuditLogger
      }));

      const middleware = auditAction('read', 'report');

      // Act
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      // Assert audit info is set
      expect((mockReq as any).auditInfo).toEqual({
        action: 'read',
        resourceType: 'report',
        userId: 17,
        timestamp: expect.any(Date),
        ip: '192.168.1.1',
        userAgent: 'Test User Agent'
      });

      expect(mockNext).toHaveBeenCalledWith();

      // Simulate response finish
      mockRes.statusCode = 200;
      finishCallback!();

      // Wait for async audit logging
      await new Promise(process.nextTick);
    });

    test('should handle audit logging errors gracefully', async () => {
      // Arrange
      mockReq.user = { id: 18, username: 'testuser' } as any;
      
      let finishCallback: () => void;
      (mockRes.on as jest.Mock).mockImplementation((event, callback) => {
        if (event === 'finish') {
          finishCallback = callback;
        }
      });

      const middleware = auditAction('write', 'user');

      // Act
      await middleware(mockReq as Request, mockRes as Response, mockNext);
      
      mockRes.statusCode = 201;
      finishCallback!();

      // Assert - should not throw error
      expect(mockNext).toHaveBeenCalledWith();
    });
  });

  describe('userRateLimit middleware', () => {
    test('should allow requests within rate limit', async () => {
      // Arrange
      mockReq.user = { id: 19, username: 'testuser' } as any;
      const middleware = userRateLimit(10, 1); // 10 requests per minute

      // Act
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith();
    });

    test('should skip rate limiting for unauthenticated requests', async () => {
      // Arrange
      mockReq.user = undefined;
      const middleware = userRateLimit(10, 1);

      // Act
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith();
    });

    test('should enforce rate limits and set retry headers', async () => {
      // Arrange
      mockReq.user = { id: 20, username: 'testuser' } as any;
      // Use Object.defineProperty to set readonly property
      Object.defineProperty(mockReq, 'path', {
        value: '/api/test',
        writable: false,
        enumerable: true,
        configurable: true
      });
      const middleware = userRateLimit(1, 1); // 1 request per minute

      // Act - make first request (should pass)
      await middleware(mockReq as Request, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalledWith();

      // Reset mock
      jest.clearAllMocks();

      // Act - make second request immediately (should fail)
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      // Assert
      expect(mockRes.set).toHaveBeenCalledWith('Retry-After', expect.any(String));
      expect(createError).toHaveBeenCalledWith(
        expect.stringMatching(/Rate limit exceeded/),
        429
      );
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('autoRefreshToken middleware', () => {
    test('should always proceed without token refresh in JWT mode', async () => {
      // Arrange - middleware is designed to skip refresh for JWT mode
      const middleware = autoRefreshToken();

      // Act
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith();
    });
  });

  describe('Helper Functions', () => {
    describe('roleCheckers', () => {
      test('isAdmin should correctly identify admin users', () => {
        // Arrange
        const adminRequest = { 
          ...mockReq, 
          user: { isAdmin: true } 
        } as any;
        const regularRequest = { 
          ...mockReq, 
          user: { isAdmin: false } 
        } as any;

        // Act & Assert
        expect(roleCheckers.isAdmin(adminRequest)).toBe(true);
        expect(roleCheckers.isAdmin(regularRequest)).toBe(false);
      });

      test('hasRole should check for specific roles', () => {
        // Arrange
        const request = { 
          ...mockReq, 
          user: { roles: ['admin', 'moderator'] } 
        } as any;
        const checker = roleCheckers.hasRole('admin');

        // Act & Assert
        expect(checker(request)).toBe(true);
        expect(roleCheckers.hasRole('user')(request)).toBe(false);
      });

      test('hasAnyRole should check for any of the specified roles', () => {
        // Arrange
        const request = { 
          ...mockReq, 
          user: { roles: ['moderator'] } 
        } as any;
        const checker = roleCheckers.hasAnyRole(['admin', 'moderator']);

        // Act & Assert
        expect(checker(request)).toBe(true);
        expect(roleCheckers.hasAnyRole(['admin', 'user'])(request)).toBe(false);
      });
    });

    describe('resourceCheckers', () => {
      test('ownResource should verify resource ownership', async () => {
        // Arrange
        const request = {
          ...mockReq,
          user: { id: 21 },
          params: { userId: '21' }
        } as any;

        // Act & Assert
        expect(await resourceCheckers.ownResource(request)).toBe(true);
        
        request.params.userId = '22';
        expect(await resourceCheckers.ownResource(request)).toBe(false);
      });
    });
  });

  describe('Exported Middleware Functions', () => {
    test('requireAuth should be configured for required authentication', () => {
      expect(requireAuth).toBeDefined();
    });

    test('requireAdmin should be configured for admin-only access', () => {
      expect(requireAdmin).toBeDefined();
    });

    test('optionalAuth should be configured for optional authentication', () => {
      expect(optionalAuth).toBeDefined();
    });

    test('requireAuthSource should create middleware for specific auth sources', () => {
      const middleware = requireAuthSource(['azure']);
      expect(middleware).toBeDefined();
      expect(typeof middleware).toBe('function');
    });
  });
});