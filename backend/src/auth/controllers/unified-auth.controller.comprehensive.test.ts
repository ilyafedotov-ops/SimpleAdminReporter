import { Request, Response } from 'express';
import { AuthMode, LoginRequest } from '../types';

// Mock all dependencies
jest.mock('../services/unified-auth.service');
jest.mock('../strategies');
jest.mock('@/services/csrf.service');
jest.mock('express-validator');
jest.mock('@/utils/logger');

// Mock error middleware - keep asyncHandler as passthrough
jest.mock('@/middleware/error.middleware', () => ({
  asyncHandler: jest.fn((fn) => {
    return async (...args: any[]) => {
      try {
        return await fn(...args);
      } catch (error) {
        // Re-throw the error so tests can catch it
        throw error;
      }
    };
  }),
  createError: jest.fn((message, statusCode) => {
    const error: any = new Error(message);
    error.statusCode = statusCode;
    return error;
  })
}));

describe('UnifiedAuthController - Comprehensive Tests', () => {
  let controller: any;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: jest.Mock;
  let mockStrategy: any;
  let unifiedAuthService: any;
  let AuthStrategyFactory: any;
  let csrfService: any;
  let createError: any;
  let validationResult: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Dynamic imports to avoid hoisting issues
    const { unifiedAuthController } = await import('./unified-auth.controller');
    const authService = await import('../services/unified-auth.service');
    const strategies = await import('../strategies');
    const csrf = await import('@/services/csrf.service');
    const errorMiddleware = await import('@/middleware/error.middleware');
    const expressValidator = await import('express-validator');
    
    // Assign to variables for use in tests
    unifiedAuthService = authService.unifiedAuthService;
    AuthStrategyFactory = strategies.AuthStrategyFactory;
    csrfService = csrf.csrfService;
    createError = errorMiddleware.createError;
    validationResult = expressValidator.validationResult;
    
    controller = unifiedAuthController;

    // Setup mock request
    mockReq = {
      body: {},
      params: {},
      query: {},
      headers: {},
      cookies: {},
      session: {
        regenerate: jest.fn((callback: (err?: any) => void) => callback()),
        id: 'test-session-id'
      } as any,
      user: undefined,
      sessionId: undefined,
      authMode: undefined,
      ip: '127.0.0.1'
    };

    // Setup mock response
    mockRes = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
      cookie: jest.fn(),
      clearCookie: jest.fn(),
      set: jest.fn()
    };

    // Setup mock next function
    mockNext = jest.fn();

    // Setup mock strategy
    mockStrategy = {
      setAuthResponse: jest.fn(),
      clearAuth: jest.fn()
    };

    // Default mocks
    (validationResult as jest.MockedFunction<any>).mockReturnValue({ 
      isEmpty: () => true, 
      array: () => [] 
    } as any);
    (unifiedAuthService.getAuthMode as jest.Mock).mockReturnValue(AuthMode.JWT);
    (AuthStrategyFactory.getStrategy as jest.Mock).mockReturnValue(mockStrategy);
    (createError as jest.Mock).mockImplementation((message, statusCode) => {
      const error: any = new Error(message);
      error.statusCode = statusCode;
      return error;
    });
  });

  describe('login method', () => {
    describe('Happy Path Scenarios', () => {
      test('should successfully login with valid AD credentials', async () => {
        // Arrange
        const loginRequest: LoginRequest = {
          username: 'testuser',
          password: 'validpassword',
          authSource: 'ad'
        };
        
        const mockLoginResponse = {
          user: {
            id: 1,
            username: 'testuser',
            displayName: 'Test User',
            email: 'test@example.com',
            authSource: 'ad',
            isAdmin: false,
            isActive: true
          },
          accessToken: 'jwt-access-token',
          refreshToken: 'jwt-refresh-token',
          expiresIn: 3600,
          csrfToken: 'csrf-token'
        };

        mockReq.body = loginRequest;
        (unifiedAuthService.authenticate as jest.Mock).mockResolvedValue(mockLoginResponse);

        // Act
        await controller.login(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(unifiedAuthService.authenticate).toHaveBeenCalledWith(
          loginRequest,
          mockReq,
          { mode: AuthMode.JWT }
        );
        expect(mockStrategy.setAuthResponse).toHaveBeenCalledWith(mockRes, mockLoginResponse);
      });

      test('should successfully login with Azure AD credentials', async () => {
        // Arrange
        const loginRequest: LoginRequest = {
          username: 'azureuser@company.com',
          password: 'azurepassword',
          authSource: 'azure'
        };
        
        const mockLoginResponse = {
          user: {
            id: 2,
            username: 'azureuser@company.com',
            displayName: 'Azure User',
            email: 'azureuser@company.com',
            authSource: 'azure',
            isAdmin: false,
            isActive: true
          },
          accessToken: 'azure-access-token',
          refreshToken: 'azure-refresh-token',
          expiresIn: 3600
        };

        mockReq.body = loginRequest;
        (unifiedAuthService.authenticate as jest.Mock).mockResolvedValue(mockLoginResponse);

        // Act
        await controller.login(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(unifiedAuthService.authenticate).toHaveBeenCalledWith(
          loginRequest,
          mockReq,
          { mode: AuthMode.JWT }
        );
        expect(mockStrategy.setAuthResponse).toHaveBeenCalledWith(mockRes, mockLoginResponse);
      });

      test('should successfully login with local credentials', async () => {
        // Arrange
        const loginRequest: LoginRequest = {
          username: 'localuser',
          password: 'localpassword',
          authSource: 'local'
        };
        
        const mockLoginResponse = {
          user: {
            id: 3,
            username: 'localuser',
            displayName: 'Local User',
            email: 'local@company.com',
            authSource: 'local',
            isAdmin: true,
            isActive: true
          },
          accessToken: 'local-access-token',
          refreshToken: 'local-refresh-token',
          expiresIn: 3600
        };

        mockReq.body = loginRequest;
        (unifiedAuthService.authenticate as jest.Mock).mockResolvedValue(mockLoginResponse);

        // Act
        await controller.login(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(unifiedAuthService.authenticate).toHaveBeenCalledWith(
          loginRequest,
          mockReq,
          { mode: AuthMode.JWT }
        );
      });

      test('should handle cookie mode authentication', async () => {
        // Arrange
        const loginRequest: LoginRequest = {
          username: 'cookieuser',
          password: 'cookiepassword',
          authSource: 'ad'
        };
        
        (unifiedAuthService.getAuthMode as jest.Mock).mockReturnValue(AuthMode.COOKIE);
        (unifiedAuthService.authenticate as jest.Mock).mockResolvedValue({
          user: { id: 4, username: 'cookieuser' },
          accessToken: 'cookie-token',
          refreshToken: 'cookie-refresh',
          expiresIn: 3600
        });

        mockReq.body = loginRequest;

        // Act
        await controller.login(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(unifiedAuthService.authenticate).toHaveBeenCalledWith(
          loginRequest,
          mockReq,
          { mode: AuthMode.COOKIE }
        );
      });
    });

    describe('Error Conditions', () => {
      test('should handle validation errors', async () => {
        // Arrange
        const mockValidationErrors = [
          { msg: 'Username is required' },
          { msg: 'Password must be at least 6 characters' }
        ];
        
        (validationResult as jest.MockedFunction<typeof validationResult>).mockReturnValue({
          isEmpty: () => false,
          array: () => mockValidationErrors
        } as any);

        mockReq.body = { username: '', password: '123' };

        // Act & Assert
        await expect(controller.login(mockReq as Request, mockRes as Response, mockNext))
          .rejects.toThrow();
        
        expect(createError).toHaveBeenCalledWith(
          'Validation failed: Username is required, Password must be at least 6 characters',
          400
        );
      });

      test('should handle authentication service errors', async () => {
        // Arrange
        const loginRequest: LoginRequest = {
          username: 'testuser',
          password: 'wrongpassword',
          authSource: 'ad'
        };
        
        mockReq.body = loginRequest;
        (unifiedAuthService.authenticate as jest.Mock).mockRejectedValue(
          createError('Invalid credentials', 401)
        );

        // Act & Assert
        await expect(controller.login(mockReq as Request, mockRes as Response, mockNext))
          .rejects.toThrow('Invalid credentials');
      });

      test('should handle session regeneration failures', async () => {
        // Arrange
        const loginRequest: LoginRequest = {
          username: 'testuser',
          password: 'validpassword',
          authSource: 'ad'
        };
        
        mockReq.body = loginRequest;
        mockReq.session!.regenerate = jest.fn((callback: (err?: any) => void) => callback(new Error('Session error'))) as any;

        // Act & Assert
        await expect(controller.login(mockReq as Request, mockRes as Response, mockNext))
          .rejects.toThrow();
        
        expect(createError).toHaveBeenCalledWith('Session regeneration failed', 500);
      });

      test('should handle missing session gracefully', async () => {
        // Arrange
        const loginRequest: LoginRequest = {
          username: 'testuser',
          password: 'validpassword',
          authSource: 'ad'
        };
        
        mockReq.body = loginRequest;
        mockReq.session = undefined;
        
        (unifiedAuthService.authenticate as jest.Mock).mockResolvedValue({
          user: { id: 5, username: 'testuser' },
          accessToken: 'token',
          refreshToken: 'refresh',
          expiresIn: 3600
        });

        // Act
        await controller.login(mockReq as Request, mockRes as Response, mockNext);

        // Assert - should not attempt session regeneration
        expect(unifiedAuthService.authenticate).toHaveBeenCalled();
        expect(mockStrategy.setAuthResponse).toHaveBeenCalled();
      });
    });

    describe('Security Edge Cases', () => {
      test('should prevent SQL injection in login request', async () => {
        // Arrange
        const maliciousLoginRequest: LoginRequest = {
          username: "admin'; DROP TABLE users; --",
          password: "password",
          authSource: 'local'
        };
        
        mockReq.body = maliciousLoginRequest;
        (unifiedAuthService.authenticate as jest.Mock).mockRejectedValue(
          createError('Invalid credentials', 401)
        );

        // Act & Assert
        await expect(controller.login(mockReq as Request, mockRes as Response, mockNext))
          .rejects.toThrow('Invalid credentials');
        
        expect(unifiedAuthService.authenticate).toHaveBeenCalledWith(
          maliciousLoginRequest,
          mockReq,
          { mode: AuthMode.JWT }
        );
      });

      test('should handle LDAP injection attempts', async () => {
        // Arrange
        const ldapInjectionRequest: LoginRequest = {
          username: "user)(|(password=*))",
          password: "anypassword",
          authSource: 'ad'
        };
        
        mockReq.body = ldapInjectionRequest;
        (unifiedAuthService.authenticate as jest.Mock).mockRejectedValue(
          createError('Invalid credentials', 401)
        );

        // Act & Assert
        await expect(controller.login(mockReq as Request, mockRes as Response, mockNext))
          .rejects.toThrow('Invalid credentials');
      });

      test('should handle extremely long credentials', async () => {
        // Arrange
        const longCredentialsRequest: LoginRequest = {
          username: 'a'.repeat(10000),
          password: 'b'.repeat(10000),
          authSource: 'ad'
        };
        
        mockReq.body = longCredentialsRequest;
        (unifiedAuthService.authenticate as jest.Mock).mockRejectedValue(
          createError('Invalid credentials', 401)
        );

        // Act & Assert
        await expect(controller.login(mockReq as Request, mockRes as Response, mockNext))
          .rejects.toThrow('Invalid credentials');
      });
    });
  });

  describe('refresh method', () => {
    describe('Happy Path Scenarios', () => {
      test('should successfully refresh JWT token from header', async () => {
        // Arrange
        const mockTokenResponse = {
          user: { id: 6, username: 'testuser' },
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
          expiresIn: 3600
        };

        mockReq.body = { refreshToken: 'valid-refresh-token' };
        (unifiedAuthService.extractRefreshToken as jest.Mock).mockReturnValue('valid-refresh-token');
        (unifiedAuthService.refreshAccessToken as jest.Mock).mockResolvedValue(mockTokenResponse);

        // Act
        await controller.refresh(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(unifiedAuthService.refreshAccessToken).toHaveBeenCalledWith(
          'valid-refresh-token',
          mockReq,
          { mode: AuthMode.JWT }
        );
        expect(mockStrategy.setAuthResponse).toHaveBeenCalledWith(mockRes, mockTokenResponse);
      });

      test('should successfully refresh token from cookie', async () => {
        // Arrange
        const mockTokenResponse = {
          user: { id: 7, username: 'cookieuser' },
          accessToken: 'new-cookie-token',
          refreshToken: 'new-cookie-refresh',
          expiresIn: 3600
        };

        (unifiedAuthService.getAuthMode as jest.Mock).mockReturnValue(AuthMode.COOKIE);
        (unifiedAuthService.extractRefreshToken as jest.Mock).mockReturnValue('cookie-refresh-token');
        (unifiedAuthService.refreshAccessToken as jest.Mock).mockResolvedValue(mockTokenResponse);

        // Act
        await controller.refresh(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(unifiedAuthService.refreshAccessToken).toHaveBeenCalledWith(
          'cookie-refresh-token',
          mockReq,
          { mode: AuthMode.COOKIE }
        );
      });
    });

    describe('Error Conditions', () => {
      test('should handle missing refresh token', async () => {
        // Arrange
        (unifiedAuthService.extractRefreshToken as jest.Mock).mockReturnValue(null);

        // Act & Assert
        await expect(controller.refresh(mockReq as Request, mockRes as Response, mockNext))
          .rejects.toThrow();
        
        expect(createError).toHaveBeenCalledWith('Refresh token is required', 400);
      });

      test('should handle expired refresh token', async () => {
        // Arrange
        (unifiedAuthService.extractRefreshToken as jest.Mock).mockReturnValue('expired-token');
        (unifiedAuthService.refreshAccessToken as jest.Mock).mockRejectedValue(
          createError('Refresh token has expired', 401)
        );

        // Act & Assert
        await expect(controller.refresh(mockReq as Request, mockRes as Response, mockNext))
          .rejects.toThrow('Refresh token has expired');
      });

      test('should handle invalid refresh token', async () => {
        // Arrange
        (unifiedAuthService.extractRefreshToken as jest.Mock).mockReturnValue('invalid-token');
        (unifiedAuthService.refreshAccessToken as jest.Mock).mockRejectedValue(
          createError('Invalid refresh token', 401)
        );

        // Act & Assert
        await expect(controller.refresh(mockReq as Request, mockRes as Response, mockNext))
          .rejects.toThrow('Invalid refresh token');
      });
    });

    describe('Security Edge Cases', () => {
      test('should handle malformed refresh token', async () => {
        // Arrange
        (unifiedAuthService.extractRefreshToken as jest.Mock).mockReturnValue('malformed.token.format');
        (unifiedAuthService.refreshAccessToken as jest.Mock).mockRejectedValue(
          createError('Invalid refresh token', 401)
        );

        // Act & Assert
        await expect(controller.refresh(mockReq as Request, mockRes as Response, mockNext))
          .rejects.toThrow('Invalid refresh token');
      });
    });
  });

  describe('logout method', () => {
    describe('Happy Path Scenarios', () => {
      test('should successfully logout authenticated user', async () => {
        // Arrange
        mockReq.user = { id: 8, username: 'testuser' } as any;
        mockReq.sessionId = 'test-session-id';
        mockReq.authMode = AuthMode.JWT;
        mockReq.headers = { authorization: 'Bearer jwt-access-token' };

        (unifiedAuthService.logout as jest.Mock).mockResolvedValue(undefined);

        // Act
        await controller.logout(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(unifiedAuthService.logout).toHaveBeenCalledWith(
          'test-session-id',
          'jwt-access-token',
          mockReq
        );
        expect(mockStrategy.clearAuth).toHaveBeenCalledWith(mockRes);
        expect(mockRes.json).toHaveBeenCalledWith({
          success: true,
          message: 'Logout successful'
        });
      });

      test('should logout user without token in cookie mode', async () => {
        // Arrange
        mockReq.user = { id: 9, username: 'cookieuser' } as any;
        mockReq.sessionId = 'cookie-session-id';
        mockReq.authMode = AuthMode.COOKIE;

        (unifiedAuthService.getAuthMode as jest.Mock).mockReturnValue(AuthMode.COOKIE);
        (unifiedAuthService.logout as jest.Mock).mockResolvedValue(undefined);

        // Act
        await controller.logout(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(unifiedAuthService.logout).toHaveBeenCalledWith(
          'cookie-session-id',
          undefined,
          mockReq
        );
        expect(mockStrategy.clearAuth).toHaveBeenCalledWith(mockRes);
      });

      test('should handle logout when user is not authenticated', async () => {
        // Arrange
        mockReq.user = undefined;
        mockReq.sessionId = undefined;

        // Act
        await controller.logout(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(unifiedAuthService.logout).not.toHaveBeenCalled();
        expect(mockRes.json).toHaveBeenCalledWith({
          success: true,
          message: 'Logout successful'
        });
      });

      test('should handle logout service errors gracefully', async () => {
        // Arrange
        mockReq.user = { id: 10, username: 'testuser' } as any;
        mockReq.sessionId = 'failing-session';
        mockReq.authMode = AuthMode.JWT;

        (unifiedAuthService.logout as jest.Mock).mockRejectedValue(new Error('Logout service error'));

        // Act
        await controller.logout(mockReq as Request, mockRes as Response, mockNext);

        // Assert - should not throw error
        expect(mockRes.json).toHaveBeenCalledWith({
          success: true,
          message: 'Logout successful'
        });
      });
    });
  });

  describe('logoutAll method', () => {
    describe('Happy Path Scenarios', () => {
      test('should logout all sessions for authenticated user', async () => {
        // Arrange
        mockReq.user = { id: 11, username: 'testuser' } as any;
        (unifiedAuthService.logoutAllSessions as jest.Mock).mockResolvedValue(undefined);

        // Act
        await controller.logoutAll(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(unifiedAuthService.logoutAllSessions).toHaveBeenCalledWith(11);
        expect(mockRes.json).toHaveBeenCalledWith({
          success: true,
          message: 'Logged out from all sessions'
        });
      });

      test('should clear auth cookies in cookie mode', async () => {
        // Arrange
        mockReq.user = { id: 12, username: 'cookieuser' } as any;
        mockReq.authMode = AuthMode.COOKIE;
        (unifiedAuthService.getAuthMode as jest.Mock).mockReturnValue(AuthMode.COOKIE);
        (unifiedAuthService.logoutAllSessions as jest.Mock).mockResolvedValue(undefined);

        // Act
        await controller.logoutAll(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(mockStrategy.clearAuth).toHaveBeenCalledWith(mockRes);
      });
    });

    describe('Error Conditions', () => {
      test('should reject unauthenticated user', async () => {
        // Arrange
        mockReq.user = undefined;

        // Act & Assert
        await expect(controller.logoutAll(mockReq as Request, mockRes as Response, mockNext))
          .rejects.toThrow();
        
        expect(createError).toHaveBeenCalledWith('Not authenticated', 401);
      });

      test('should handle logout all service errors', async () => {
        // Arrange
        mockReq.user = { id: 13, username: 'testuser' } as any;
        (unifiedAuthService.logoutAllSessions as jest.Mock).mockRejectedValue(
          new Error('Database connection error')
        );

        // Act & Assert
        await expect(controller.logoutAll(mockReq as Request, mockRes as Response, mockNext))
          .rejects.toThrow('Database connection error');
      });
    });
  });

  describe('getProfile method', () => {
    describe('Happy Path Scenarios', () => {
      test('should return user profile for authenticated user', async () => {
        // Arrange
        mockReq.user = { id: 14, username: 'testuser' } as any;
        
        const mockUserProfile = {
          id: 14,
          username: 'testuser',
          displayName: 'Test User',
          email: 'test@example.com',
          authSource: 'ad',
          department: 'IT',
          title: 'Developer',
          isAdmin: false,
          isActive: true,
          lastLogin: new Date('2025-01-15')
        };

        (unifiedAuthService.getUserById as jest.Mock).mockResolvedValue(mockUserProfile);

        // Act
        await controller.getProfile(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(unifiedAuthService.getUserById).toHaveBeenCalledWith(14);
        expect(mockRes.json).toHaveBeenCalledWith({
          success: true,
          data: {
            user: mockUserProfile
          }
        });
      });
    });

    describe('Error Conditions', () => {
      test('should reject unauthenticated user', async () => {
        // Arrange
        mockReq.user = undefined;

        // Act & Assert
        await expect(controller.getProfile(mockReq as Request, mockRes as Response, mockNext))
          .rejects.toThrow();
        
        expect(createError).toHaveBeenCalledWith('Not authenticated', 401);
      });

      test('should handle user not found', async () => {
        // Arrange
        mockReq.user = { id: 15, username: 'testuser' } as any;
        (unifiedAuthService.getUserById as jest.Mock).mockResolvedValue(null);

        // Act & Assert
        await expect(controller.getProfile(mockReq as Request, mockRes as Response, mockNext))
          .rejects.toThrow();
        
        expect(createError).toHaveBeenCalledWith('User not found', 404);
      });
    });
  });

  describe('updateProfile method', () => {
    describe('Happy Path Scenarios', () => {
      test('should successfully update user profile', async () => {
        // Arrange
        mockReq.user = { id: 16, username: 'testuser' } as any;
        mockReq.body = {
          displayName: 'Updated Name',
          email: 'updated@example.com',
          department: 'Engineering',
          title: 'Senior Developer'
        };

        const mockUpdatedUser = {
          id: 16,
          username: 'testuser',
          displayName: 'Updated Name',
          email: 'updated@example.com',
          authSource: 'ad',
          department: 'Engineering',
          title: 'Senior Developer',
          isAdmin: false,
          isActive: true,
          lastLogin: new Date()
        };

        (unifiedAuthService.updateUserProfile as jest.Mock).mockResolvedValue(mockUpdatedUser);

        // Act
        await controller.updateProfile(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(unifiedAuthService.updateUserProfile).toHaveBeenCalledWith(16, {
          displayName: 'Updated Name',
          email: 'updated@example.com',
          department: 'Engineering',
          title: 'Senior Developer'
        });
        expect(mockRes.json).toHaveBeenCalledWith({
          success: true,
          message: 'Profile updated successfully',
          data: {
            user: mockUpdatedUser
          }
        });
      });
    });

    describe('Error Conditions', () => {
      test('should reject unauthenticated user', async () => {
        // Arrange
        mockReq.user = undefined;

        // Act & Assert
        await expect(controller.updateProfile(mockReq as Request, mockRes as Response, mockNext))
          .rejects.toThrow();
        
        expect(createError).toHaveBeenCalledWith('Not authenticated', 401);
      });

      test('should handle validation errors', async () => {
        // Arrange
        mockReq.user = { id: 17, username: 'testuser' } as any;
        
        (validationResult as jest.MockedFunction<typeof validationResult>).mockReturnValue({
          isEmpty: () => false,
          array: () => [{ msg: 'Invalid email format' }]
        } as any);

        // Act & Assert
        await expect(controller.updateProfile(mockReq as Request, mockRes as Response, mockNext))
          .rejects.toThrow();
        
        expect(createError).toHaveBeenCalledWith('Validation failed: Invalid email format', 400);
      });

      test('should handle update service failure', async () => {
        // Arrange
        mockReq.user = { id: 18, username: 'testuser' } as any;
        mockReq.body = { displayName: 'New Name' };
        
        (unifiedAuthService.updateUserProfile as jest.Mock).mockResolvedValue(null);

        // Act & Assert
        await expect(controller.updateProfile(mockReq as Request, mockRes as Response, mockNext))
          .rejects.toThrow();
        
        expect(createError).toHaveBeenCalledWith('User update failed', 500);
      });
    });
  });

  describe('changePassword method', () => {
    describe('Happy Path Scenarios', () => {
      test('should successfully change password for local user', async () => {
        // Arrange
        mockReq.user = { id: 19, username: 'localuser' } as any;
        mockReq.body = {
          currentPassword: 'oldpassword',
          newPassword: 'newpassword123'
        };
        mockReq.authMode = AuthMode.COOKIE;

        (unifiedAuthService.changePassword as jest.Mock).mockResolvedValue(undefined);

        // Act
        await controller.changePassword(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(unifiedAuthService.changePassword).toHaveBeenCalledWith(
          19,
          'oldpassword',
          'newpassword123',
          mockReq
        );
        expect(mockStrategy.clearAuth).toHaveBeenCalledWith(mockRes);
        expect(mockRes.json).toHaveBeenCalledWith({
          success: true,
          message: 'Password changed successfully. Please login with your new password.'
        });
      });
    });

    describe('Error Conditions', () => {
      test('should reject unauthenticated user', async () => {
        // Arrange
        mockReq.user = undefined;

        // Act & Assert
        await expect(controller.changePassword(mockReq as Request, mockRes as Response, mockNext))
          .rejects.toThrow();
        
        expect(createError).toHaveBeenCalledWith('Not authenticated', 401);
      });

      test('should handle incorrect current password', async () => {
        // Arrange
        mockReq.user = { id: 20, username: 'localuser' } as any;
        mockReq.body = {
          currentPassword: 'wrongpassword',
          newPassword: 'newpassword123'
        };

        (unifiedAuthService.changePassword as jest.Mock).mockRejectedValue(
          createError('Current password is incorrect', 401)
        );

        // Act & Assert
        await expect(controller.changePassword(mockReq as Request, mockRes as Response, mockNext))
          .rejects.toThrow('Current password is incorrect');
      });
    });
  });

  describe('verify method', () => {
    test('should return valid session for authenticated user', async () => {
      // Arrange
      mockReq.user = {
        id: 21,
        username: 'testuser',
        isAdmin: true
      } as any;

      // Act
      await controller.verify(mockReq as Request, mockRes as Response, mockNext);

      // Assert
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: {
          valid: true,
          user: {
            id: 21,
            username: 'testuser',
            isAdmin: true
          }
        }
      });
    });

    test('should reject unauthenticated user', async () => {
      // Arrange
      mockReq.user = undefined;

      // Act & Assert
      await expect(controller.verify(mockReq as Request, mockRes as Response, mockNext))
        .rejects.toThrow();
      
      expect(createError).toHaveBeenCalledWith('Not authenticated', 401);
    });
  });

  describe('getCSRFToken method', () => {
    test('should generate and return CSRF token', async () => {
      // Arrange
      const mockToken = 'generated-csrf-token';
      (csrfService.setCSRFToken as jest.Mock).mockReturnValue(mockToken);
      (csrfService.generateAndStoreToken as jest.Mock).mockResolvedValue(undefined);

      // Act
      await controller.getCSRFToken(mockReq as Request, mockRes as Response, mockNext);

      // Assert
      expect(csrfService.setCSRFToken).toHaveBeenCalledWith(mockRes);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        csrfToken: mockToken
      });
    });

    test('should handle CSRF token generation errors', async () => {
      // Arrange
      (csrfService.setCSRFToken as jest.Mock).mockImplementation(() => {
        throw new Error('CSRF service error');
      });

      // Act & Assert
      await expect(controller.getCSRFToken(mockReq as Request, mockRes as Response, mockNext))
        .rejects.toThrow();
      
      expect(createError).toHaveBeenCalledWith('Failed to generate CSRF token', 500);
    });
  });

  describe('createUser method', () => {
    describe('Happy Path Scenarios', () => {
      test('should create new local user as admin', async () => {
        // Arrange
        mockReq.user = { id: 22, username: 'admin', isAdmin: true } as any;
        mockReq.body = {
          username: 'newuser',
          password: 'securepassword',
          displayName: 'New User',
          email: 'newuser@company.com',
          isAdmin: false
        };

        const mockNewUser = {
          id: 23,
          username: 'newuser',
          displayName: 'New User',
          email: 'newuser@company.com',
          authSource: 'local',
          isAdmin: false,
          isActive: true
        };

        (unifiedAuthService.createLocalUser as jest.Mock).mockResolvedValue(mockNewUser);

        // Act
        await controller.createUser(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(unifiedAuthService.createLocalUser).toHaveBeenCalledWith({
          username: 'newuser',
          password: 'securepassword',
          displayName: 'New User',
          email: 'newuser@company.com',
          isAdmin: false
        });
        expect(mockRes.status).toHaveBeenCalledWith(201);
        expect(mockRes.json).toHaveBeenCalledWith({
          success: true,
          message: 'User created successfully',
          data: {
            user: mockNewUser
          }
        });
      });
    });

    describe('Error Conditions', () => {
      test('should reject non-admin user', async () => {
        // Arrange
        mockReq.user = { id: 24, username: 'regularuser', isAdmin: false } as any;

        // Act & Assert
        await expect(controller.createUser(mockReq as Request, mockRes as Response, mockNext))
          .rejects.toThrow();
        
        expect(createError).toHaveBeenCalledWith('Admin access required', 403);
      });

      test('should reject unauthenticated user', async () => {
        // Arrange
        mockReq.user = undefined;

        // Act & Assert
        await expect(controller.createUser(mockReq as Request, mockRes as Response, mockNext))
          .rejects.toThrow();
        
        expect(createError).toHaveBeenCalledWith('Admin access required', 403);
      });
    });
  });

  describe('testConnections method', () => {
    test('should return connection test results for admin', async () => {
      // Arrange
      mockReq.user = { id: 25, username: 'admin', isAdmin: true } as any;
      
      const mockResults = {
        ad: { connected: true },
        azure: { connected: false, error: 'Service unavailable' },
        o365: { connected: true },
        local: { connected: true }
      };

      (unifiedAuthService.testAuthConnections as jest.Mock).mockResolvedValue(mockResults);

      // Act
      await controller.testConnections(mockReq as Request, mockRes as Response, mockNext);

      // Assert
      expect(unifiedAuthService.testAuthConnections).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockResults
      });
    });

    test('should reject non-admin user', async () => {
      // Arrange
      mockReq.user = { id: 26, username: 'regularuser', isAdmin: false } as any;

      // Act & Assert
      await expect(controller.testConnections(mockReq as Request, mockRes as Response, mockNext))
        .rejects.toThrow();
      
      expect(createError).toHaveBeenCalledWith('Admin access required', 403);
    });
  });
});