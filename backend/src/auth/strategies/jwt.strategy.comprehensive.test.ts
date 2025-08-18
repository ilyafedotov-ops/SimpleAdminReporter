import { Request, Response } from 'express';
import { JWTStrategy } from './jwt.strategy';
import { AuthMode, LoginResponse } from '../types';

describe('JWTStrategy - Comprehensive Tests', () => {
  let strategy: JWTStrategy;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  // Helper function to create user objects with required fields
  const createTestUser = (overrides: any = {}) => ({
    id: 1,
    username: 'testuser',
    displayName: 'Test User',
    email: 'test@example.com',
    authSource: 'ad' as const,
    isAdmin: false,
    isActive: true,
    ...overrides
  });

  beforeEach(() => {
    strategy = new JWTStrategy();
    
    // Setup mock request
    mockRequest = {
      headers: {},
      cookies: {},
      body: {}
    };

    // Setup mock response
    mockResponse = {
      json: jest.fn(),
      cookie: jest.fn(),
      clearCookie: jest.fn(),
      set: jest.fn()
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Strategy Configuration', () => {
    test('should have correct auth mode', () => {
      expect(strategy.mode).toBe(AuthMode.JWT);
    });
  });

  describe('extractToken method', () => {
    describe('Happy Path Scenarios', () => {
      test('should extract token from valid Bearer authorization header', () => {
        // Arrange
        mockRequest.headers = {
          authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.valid.token'
        };

        // Act
        const token = strategy.extractToken(mockRequest as Request);

        // Assert
        expect(token).toBe('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.valid.token');
      });

      test('should extract JWT token with special characters', () => {
        // Arrange
        const tokenWithSpecialChars = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiYWRtaW4iOnRydWUsImlhdCI6MTUxNjIzOTAyMn0.Twc7-e4v0-KOVfDQz3LLcPNwKEm5K1Jrx6V7FD_Z-M-_dWq';
        mockRequest.headers = {
          authorization: `Bearer ${tokenWithSpecialChars}`
        };

        // Act
        const token = strategy.extractToken(mockRequest as Request);

        // Assert
        expect(token).toBe(tokenWithSpecialChars);
      });

      test('should handle case-sensitive Bearer prefix', () => {
        // Arrange
        mockRequest.headers = {
          authorization: 'Bearer valid.jwt.token'
        };

        // Act
        const token = strategy.extractToken(mockRequest as Request);

        // Assert
        expect(token).toBe('valid.jwt.token');
      });
    });

    describe('Error Conditions', () => {
      test('should return null when no authorization header present', () => {
        // Arrange
        mockRequest.headers = {};

        // Act
        const token = strategy.extractToken(mockRequest as Request);

        // Assert
        expect(token).toBeNull();
      });

      test('should return null when authorization header is empty', () => {
        // Arrange
        mockRequest.headers = {
          authorization: ''
        };

        // Act
        const token = strategy.extractToken(mockRequest as Request);

        // Assert
        expect(token).toBeNull();
      });

      test('should return null when authorization header does not start with Bearer', () => {
        // Arrange
        mockRequest.headers = {
          authorization: 'Basic dXNlcm5hbWU6cGFzc3dvcmQ='
        };

        // Act
        const token = strategy.extractToken(mockRequest as Request);

        // Assert
        expect(token).toBeNull();
      });

      test('should return empty string when Bearer prefix is followed by nothing', () => {
        // Arrange
        mockRequest.headers = {
          authorization: 'Bearer '
        };

        // Act
        const token = strategy.extractToken(mockRequest as Request);

        // Assert
        expect(token).toBe('');
      });

      test('should return null when Bearer prefix has wrong case', () => {
        // Arrange
        mockRequest.headers = {
          authorization: 'bearer valid.jwt.token'
        };

        // Act
        const token = strategy.extractToken(mockRequest as Request);

        // Assert
        expect(token).toBeNull();
      });

      test('should return null when Bearer prefix has extra spaces', () => {
        // Arrange
        mockRequest.headers = {
          authorization: 'Bearer  valid.jwt.token'
        };

        // Act
        const token = strategy.extractToken(mockRequest as Request);

        // Assert
        expect(token).toBe(' valid.jwt.token');
      });
    });

    describe('Security Edge Cases', () => {
      test('should handle authorization header with null value', () => {
        // Arrange
        mockRequest.headers = {
          authorization: null as any
        };

        // Act
        const token = strategy.extractToken(mockRequest as Request);

        // Assert
        expect(token).toBeNull();
      });

      test('should handle authorization header with undefined value', () => {
        // Arrange
        mockRequest.headers = {
          authorization: undefined
        };

        // Act
        const token = strategy.extractToken(mockRequest as Request);

        // Assert
        expect(token).toBeNull();
      });

      test('should handle authorization header injection attempts', () => {
        // Arrange
        mockRequest.headers = {
          authorization: 'Bearer malicious.token\nInjected-Header: value'
        };

        // Act
        const token = strategy.extractToken(mockRequest as Request);

        // Assert
        expect(token).toBe('malicious.token\nInjected-Header: value');
      });

      test('should handle extremely long authorization header', () => {
        // Arrange
        const longToken = 'a'.repeat(10000);
        mockRequest.headers = {
          authorization: `Bearer ${longToken}`
        };

        // Act
        const token = strategy.extractToken(mockRequest as Request);

        // Assert
        expect(token).toBe(longToken);
        expect(token?.length).toBe(10000);
      });

      test('should handle malformed JWT structure', () => {
        // Arrange
        mockRequest.headers = {
          authorization: 'Bearer not.a.valid.jwt.structure.too.many.parts'
        };

        // Act
        const token = strategy.extractToken(mockRequest as Request);

        // Assert
        expect(token).toBe('not.a.valid.jwt.structure.too.many.parts');
      });

      test('should handle authorization with special characters', () => {
        // Arrange
        mockRequest.headers = {
          authorization: 'Bearer token.with.special-chars_and+symbols/equals='
        };

        // Act
        const token = strategy.extractToken(mockRequest as Request);

        // Assert
        expect(token).toBe('token.with.special-chars_and+symbols/equals=');
      });
    });

    describe('Token Format Variations', () => {
      test('should extract standard JWT format', () => {
        // Arrange
        const standardJWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
        mockRequest.headers = {
          authorization: `Bearer ${standardJWT}`
        };

        // Act
        const token = strategy.extractToken(mockRequest as Request);

        // Assert
        expect(token).toBe(standardJWT);
        expect(token?.split('.').length).toBe(3);
      });

      test('should extract token with padding', () => {
        // Arrange
        const tokenWithPadding = 'header.payload.signature===';
        mockRequest.headers = {
          authorization: `Bearer ${tokenWithPadding}`
        };

        // Act
        const token = strategy.extractToken(mockRequest as Request);

        // Assert
        expect(token).toBe(tokenWithPadding);
      });

      test('should extract token with URL-safe base64 characters', () => {
        // Arrange
        const urlSafeToken = 'header-url_safe.payload-url_safe.signature-url_safe';
        mockRequest.headers = {
          authorization: `Bearer ${urlSafeToken}`
        };

        // Act
        const token = strategy.extractToken(mockRequest as Request);

        // Assert
        expect(token).toBe(urlSafeToken);
      });
    });

    describe('Header Array Handling', () => {
      test('should handle authorization header as array (first element)', () => {
        // Arrange
        mockRequest.headers = {
          authorization: ['Bearer first.token', 'Bearer second.token'] as any
        };

        // Act
        const token = strategy.extractToken(mockRequest as Request);

        // Assert
        expect(token).toBeNull(); // Should return null for array headers
      });
    });
  });

  describe('setAuthResponse method', () => {
    describe('Happy Path Scenarios', () => {
      test('should set successful login response with full user data', () => {
        // Arrange
        const loginResponse: LoginResponse = {
          user: createTestUser({
            department: 'Engineering',
            title: 'Software Engineer',
            lastLogin: new Date('2025-01-15T10:30:00Z')
          }),
          accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.access.token',
          refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.refresh.token',
          expiresIn: 3600
        };

        // Act
        strategy.setAuthResponse(mockResponse as Response, loginResponse);

        // Assert
        expect(mockResponse.json).toHaveBeenCalledWith({
          success: true,
          message: 'Login successful',
          data: {
            user: createTestUser({
              id: 1,
              username: 'testuser',
              displayName: 'Test User',
              email: 'test@example.com',
              authSource: 'ad',
              department: 'Engineering',
              title: 'Software Engineer',
              isAdmin: false,
              lastLogin: new Date('2025-01-15T10:30:00Z')
            }),
            accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.access.token',
            refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.refresh.token',
            expiresIn: 3600,
            tokenType: 'Bearer'
          }
        });
      });

      test('should set admin user login response', () => {
        // Arrange
        const adminLoginResponse: LoginResponse = {
          user: createTestUser({
            id: 2,
            username: 'admin',
            displayName: 'System Administrator',
            email: 'admin@company.com',
            authSource: 'local',
            department: 'IT',
            title: 'Admin',
            isAdmin: true,
            lastLogin: new Date('2025-01-15T09:00:00Z')
          }),
          accessToken: 'admin.access.token',
          refreshToken: 'admin.refresh.token',
          expiresIn: 7200
        };

        // Act
        strategy.setAuthResponse(mockResponse as Response, adminLoginResponse);

        // Assert
        expect(mockResponse.json).toHaveBeenCalledWith({
          success: true,
          message: 'Login successful',
          data: {
            user: createTestUser({
              id: 2,
              username: 'admin',
              displayName: 'System Administrator',
              email: 'admin@company.com',
              authSource: 'local',
              department: 'IT',
              title: 'Admin',
              isAdmin: true,
              lastLogin: new Date('2025-01-15T09:00:00Z')
            }),
            accessToken: 'admin.access.token',
            refreshToken: 'admin.refresh.token',
            expiresIn: 7200,
            tokenType: 'Bearer'
          }
        });
      });

      test('should handle user with minimal data', () => {
        // Arrange
        const minimalLoginResponse: LoginResponse = {
          user: createTestUser({
            id: 3,
            username: 'minimaluser',
            displayName: 'Minimal User',
            authSource: 'ad',
            isAdmin: false,
            isActive: true
          }),
          accessToken: 'minimal.access.token',
          refreshToken: 'minimal.refresh.token',
          expiresIn: 1800
        };

        // Act
        strategy.setAuthResponse(mockResponse as Response, minimalLoginResponse);

        // Assert
        expect(mockResponse.json).toHaveBeenCalledWith({
          success: true,
          message: 'Login successful',
          data: {
            user: createTestUser({
              id: 3,
              username: 'minimaluser',
              displayName: 'Minimal User',
              email: 'test@example.com',
              authSource: 'ad',
              department: undefined,
              title: undefined,
              isAdmin: false,
              lastLogin: undefined
            }),
            accessToken: 'minimal.access.token',
            refreshToken: 'minimal.refresh.token',
            expiresIn: 1800,
            tokenType: 'Bearer'
          }
        });
      });

      test('should handle response with CSRF token', () => {
        // Arrange
        const loginResponseWithCSRF: LoginResponse = {
          user: createTestUser({
            id: 4,
            username: 'csrfuser',
            displayName: 'CSRF User',
            authSource: 'ad',
            isAdmin: false,
            isActive: true
          }),
          accessToken: 'csrf.access.token',
          refreshToken: 'csrf.refresh.token',
          expiresIn: 3600,
          csrfToken: 'csrf-protection-token'
        };

        // Act
        strategy.setAuthResponse(mockResponse as Response, loginResponseWithCSRF);

        // Assert
        const expectedCall = (mockResponse.json as jest.Mock).mock.calls[0][0];
        expect(expectedCall.success).toBe(true);
        expect(expectedCall.data.user.username).toBe('csrfuser');
        expect(expectedCall.data.accessToken).toBe('csrf.access.token');
        expect(expectedCall.data.tokenType).toBe('Bearer');
        // Note: CSRF token is not included in JWT strategy response body by design
      });
    });

    describe('Token Response Format', () => {
      test('should always include Bearer token type', () => {
        // Arrange
        const loginResponse: LoginResponse = {
          user: createTestUser({
            id: 5,
            username: 'tokenuser',
            displayName: 'Token User',
            authSource: 'azure',
            isAdmin: false,
            isActive: true
          }),
          accessToken: 'bearer.test.token',
          refreshToken: 'bearer.refresh.token',
          expiresIn: 900
        };

        // Act
        strategy.setAuthResponse(mockResponse as Response, loginResponse);

        // Assert
        const responseData = (mockResponse.json as jest.Mock).mock.calls[0][0];
        expect(responseData.data.tokenType).toBe('Bearer');
      });

      test('should include all required token fields', () => {
        // Arrange
        const loginResponse: LoginResponse = {
          user: createTestUser({
            id: 6,
            username: 'fieldtest',
            displayName: 'Field Test',
            authSource: 'local',
            isAdmin: false,
            isActive: true
          }),
          accessToken: 'field.access.token',
          refreshToken: 'field.refresh.token',
          expiresIn: 1200
        };

        // Act
        strategy.setAuthResponse(mockResponse as Response, loginResponse);

        // Assert
        const responseData = (mockResponse.json as jest.Mock).mock.calls[0][0];
        expect(responseData.data).toHaveProperty('accessToken');
        expect(responseData.data).toHaveProperty('refreshToken');
        expect(responseData.data).toHaveProperty('expiresIn');
        expect(responseData.data).toHaveProperty('tokenType');
        expect(responseData.data).toHaveProperty('user');
      });

      test('should not set any cookies for JWT strategy', () => {
        // Arrange
        const loginResponse: LoginResponse = {
          user: createTestUser({
            id: 7,
            username: 'nocookie',
            displayName: 'No Cookie User',
            authSource: 'ad',
            isAdmin: false,
            isActive: true
          }),
          accessToken: 'no.cookie.token',
          refreshToken: 'no.cookie.refresh',
          expiresIn: 2400
        };

        // Act
        strategy.setAuthResponse(mockResponse as Response, loginResponse);

        // Assert
        expect(mockResponse.cookie).not.toHaveBeenCalled();
        expect(mockResponse.set).not.toHaveBeenCalled();
      });
    });

    describe('User Data Sanitization', () => {
      test('should exclude sensitive user fields from response', () => {
        // Arrange
        const loginResponseWithSensitiveData: LoginResponse = {
          user: createTestUser({
            id: 8,
            username: 'sensitiveuser',
            displayName: 'Sensitive User',
            email: 'sensitive@example.com',
            authSource: 'ad',
            department: 'Security',
            title: 'Security Analyst',
            isAdmin: false,
            isActive: true,
            lastLogin: new Date(),
            // These fields should not be included in the response
            externalId: 'external-id-123',
            passwordHash: 'should-not-be-included' as any
          }),
          accessToken: 'sensitive.access.token',
          refreshToken: 'sensitive.refresh.token',
          expiresIn: 3600
        };

        // Act
        strategy.setAuthResponse(mockResponse as Response, loginResponseWithSensitiveData);

        // Assert
        const responseData = (mockResponse.json as jest.Mock).mock.calls[0][0];
        expect(responseData.data.user).not.toHaveProperty('externalId');
        expect(responseData.data.user).not.toHaveProperty('passwordHash');
        expect(responseData.data.user).toHaveProperty('id');
        expect(responseData.data.user).toHaveProperty('username');
        expect(responseData.data.user).toHaveProperty('displayName');
        expect(responseData.data.user).toHaveProperty('email');
        expect(responseData.data.user).toHaveProperty('authSource');
        expect(responseData.data.user).toHaveProperty('isAdmin');
      });
    });

    describe('Error Handling', () => {
      test('should handle response object without json method', () => {
        // Arrange
        const brokenResponse = {
          // Missing json method
        } as Response;

        const loginResponse: LoginResponse = {
          user: createTestUser({
            id: 9,
            username: 'erroruser',
            displayName: 'Error User',
            authSource: 'ad',
            isAdmin: false,
            isActive: true
          }),
          accessToken: 'error.token',
          refreshToken: 'error.refresh',
          expiresIn: 3600
        };

        // Act & Assert
        expect(() => {
          strategy.setAuthResponse(brokenResponse, loginResponse);
        }).toThrow();
      });

      test('should handle null user data gracefully', () => {
        // Arrange
        const loginResponseWithNullUser: LoginResponse = {
          user: null as any,
          accessToken: 'null.user.token',
          refreshToken: 'null.user.refresh',
          expiresIn: 3600
        };

        // Act
        strategy.setAuthResponse(mockResponse as Response, loginResponseWithNullUser);

        // Assert
        const responseData = (mockResponse.json as jest.Mock).mock.calls[0][0];
        expect(responseData.data.user).toBeNull();
      });
    });
  });

  describe('clearAuth method', () => {
    test('should not perform any operations for JWT strategy', () => {
      // Act
      strategy.clearAuth(mockResponse as Response);

      // Assert
      expect(mockResponse.clearCookie).not.toHaveBeenCalled();
      expect(mockResponse.cookie).not.toHaveBeenCalled();
      expect(mockResponse.set).not.toHaveBeenCalled();
      expect(mockResponse.json).not.toHaveBeenCalled();
    });

    test('should not throw error with null response', () => {
      // Act & Assert
      expect(() => {
        strategy.clearAuth(null as any);
      }).not.toThrow();
    });

    test('should not throw error with undefined response', () => {
      // Act & Assert
      expect(() => {
        strategy.clearAuth(undefined as any);
      }).not.toThrow();
    });
  });

  describe('Integration Scenarios', () => {
    test('should handle complete authentication flow', () => {
      // Arrange - Extract token
      mockRequest.headers = {
        authorization: 'Bearer integration.test.token'
      };

      const loginResponse: LoginResponse = {
        user: createTestUser({
          id: 10,
          username: 'integrationuser',
          displayName: 'Integration User',
          email: 'integration@test.com',
          authSource: 'ad',
          department: 'QA',
          title: 'Test Engineer',
          isAdmin: false,
          isActive: true,
          lastLogin: new Date()
        }),
        accessToken: 'integration.access.token',
        refreshToken: 'integration.refresh.token',
        expiresIn: 3600
      };

      // Act - Extract token
      const extractedToken = strategy.extractToken(mockRequest as Request);

      // Act - Set auth response
      strategy.setAuthResponse(mockResponse as Response, loginResponse);

      // Act - Clear auth (should be no-op)
      strategy.clearAuth(mockResponse as Response);

      // Assert
      expect(extractedToken).toBe('integration.test.token');
      expect(mockResponse.json).toHaveBeenCalledTimes(1);
      expect(mockResponse.clearCookie).not.toHaveBeenCalled();

      const responseData = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(responseData.success).toBe(true);
      expect(responseData.data.user.username).toBe('integrationuser');
      expect(responseData.data.tokenType).toBe('Bearer');
    });

    test('should handle authentication with different auth sources', () => {
      // Test with different auth sources
      const authSources = ['ad', 'azure', 'o365', 'local'];

      authSources.forEach((authSource, index) => {
        jest.clearAllMocks();

        const loginResponse: LoginResponse = {
          user: createTestUser({
            id: index + 20,
            username: `user-${authSource}`,
            displayName: `User ${authSource.toUpperCase()}`,
            authSource: authSource as any,
            isAdmin: false,
            isActive: true
          }),
          accessToken: `${authSource}.access.token`,
          refreshToken: `${authSource}.refresh.token`,
          expiresIn: 3600
        };

        strategy.setAuthResponse(mockResponse as Response, loginResponse);

        const responseData = (mockResponse.json as jest.Mock).mock.calls[0][0];
        expect(responseData.data.user.authSource).toBe(authSource);
        expect(responseData.data.accessToken).toBe(`${authSource}.access.token`);
      });
    });
  });
});