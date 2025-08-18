import { Request, Response } from 'express';
import { CookieStrategy } from './cookie.strategy';
import { AuthMode, LoginResponse } from '../types';

// Mock cookie config
jest.mock('@/config/cookie.config', () => ({
  getCookieOptions: jest.fn((maxAge: number) => ({
    httpOnly: true,
    secure: false,
    sameSite: 'strict',
    maxAge
  })),
  getRefreshTokenCookieOptions: jest.fn(() => ({
    httpOnly: true,
    secure: false,
    sameSite: 'strict',
    path: '/api/auth/refresh',
    maxAge: 604800000
  })),
  COOKIE_NAMES: {
    ACCESS_TOKEN: 'access_token',
    REFRESH_TOKEN: 'refresh_token',
    CSRF_TOKEN: 'csrf_token',
    SESSION_ID: 'session_id'
  },
  COOKIE_MAX_AGE: {
    ACCESS_TOKEN: 3600000,
    CSRF_TOKEN: 3600000
  }
}));

describe('CookieStrategy - Comprehensive Tests', () => {
  let strategy: CookieStrategy;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    strategy = new CookieStrategy();
    
    // Setup mock request
    mockRequest = {
      headers: {},
      cookies: {}
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
      expect(strategy.mode).toBe(AuthMode.COOKIE);
    });
  });

  describe('extractToken method', () => {
    describe('Happy Path Scenarios', () => {
      test('should extract token from access_token cookie', () => {
        // Arrange
        mockRequest.cookies = {
          access_token: 'cookie.access.token'
        };

        // Act
        const token = strategy.extractToken(mockRequest as Request);

        // Assert
        expect(token).toBe('cookie.access.token');
      });

      test('should prioritize cookie over Authorization header', () => {
        // Arrange
        mockRequest.cookies = {
          access_token: 'cookie.token'
        };
        mockRequest.headers = {
          authorization: 'Bearer header.token'
        };

        // Act
        const token = strategy.extractToken(mockRequest as Request);

        // Assert
        expect(token).toBe('cookie.token');
      });

      test('should fallback to Authorization header when cookie not present', () => {
        // Arrange
        mockRequest.cookies = {};
        mockRequest.headers = {
          authorization: 'Bearer fallback.token'
        };

        // Act
        const token = strategy.extractToken(mockRequest as Request);

        // Assert
        expect(token).toBe('fallback.token');
      });

      test('should extract JWT token with special characters from cookie', () => {
        // Arrange
        const specialToken = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiYWRtaW4iOnRydWUsImlhdCI6MTUxNjIzOTAyMn0.Twc7-e4v0-KOVfDQz3LLcPNwKEm5K1Jrx6V7FD_Z-M-_dWq';
        mockRequest.cookies = {
          access_token: specialToken
        };

        // Act
        const token = strategy.extractToken(mockRequest as Request);

        // Assert
        expect(token).toBe(specialToken);
      });
    });

    describe('Error Conditions', () => {
      test('should return null when no cookie and no authorization header', () => {
        // Arrange
        mockRequest.cookies = {};
        mockRequest.headers = {};

        // Act
        const token = strategy.extractToken(mockRequest as Request);

        // Assert
        expect(token).toBeNull();
      });

      test('should return null when access_token cookie is empty', () => {
        // Arrange
        mockRequest.cookies = {
          access_token: ''
        };

        // Act
        const token = strategy.extractToken(mockRequest as Request);

        // Assert
        expect(token).toBe('');
      });

      test('should return null when authorization header is malformed', () => {
        // Arrange
        mockRequest.cookies = {};
        mockRequest.headers = {
          authorization: 'Basic dXNlcm5hbWU6cGFzc3dvcmQ='
        };

        // Act
        const token = strategy.extractToken(mockRequest as Request);

        // Assert
        expect(token).toBeNull();
      });

      test('should handle undefined cookies object', () => {
        // Arrange
        mockRequest.cookies = undefined;
        mockRequest.headers = {};

        // Act
        const token = strategy.extractToken(mockRequest as Request);

        // Assert
        expect(token).toBeNull();
      });

      test('should handle null cookies object', () => {
        // Arrange
        mockRequest.cookies = null as any;
        mockRequest.headers = {};

        // Act
        const token = strategy.extractToken(mockRequest as Request);

        // Assert
        expect(token).toBeNull();
      });
    });

    describe('Security Edge Cases', () => {
      test('should handle cookie with null value', () => {
        // Arrange
        mockRequest.cookies = {
          access_token: null as any
        };

        // Act
        const token = strategy.extractToken(mockRequest as Request);

        // Assert
        expect(token).toBeNull();
      });

      test('should handle cookie with undefined value', () => {
        // Arrange
        mockRequest.cookies = {
          access_token: undefined
        };

        // Act
        const token = strategy.extractToken(mockRequest as Request);

        // Assert
        expect(token).toBeUndefined();
      });

      test('should handle extremely long cookie token', () => {
        // Arrange
        const longToken = 'a'.repeat(10000);
        mockRequest.cookies = {
          access_token: longToken
        };

        // Act
        const token = strategy.extractToken(mockRequest as Request);

        // Assert
        expect(token).toBe(longToken);
        expect(token?.length).toBe(10000);
      });

      test('should handle cookie injection attempts', () => {
        // Arrange
        mockRequest.cookies = {
          access_token: 'token.value\nSet-Cookie: malicious=value'
        };

        // Act
        const token = strategy.extractToken(mockRequest as Request);

        // Assert
        expect(token).toBe('token.value\nSet-Cookie: malicious=value');
      });

      test('should handle multiple cookies with same name (array)', () => {
        // Arrange
        mockRequest.cookies = {
          access_token: ['first.token', 'second.token'] as any
        };

        // Act
        const token = strategy.extractToken(mockRequest as Request);

        // Assert
        expect(token).toEqual(['first.token', 'second.token']);
      });
    });

    describe('Backward Compatibility', () => {
      test('should fallback to Bearer token with correct prefix', () => {
        // Arrange
        mockRequest.cookies = {};
        mockRequest.headers = {
          authorization: 'Bearer backward.compatible.token'
        };

        // Act
        const token = strategy.extractToken(mockRequest as Request);

        // Assert
        expect(token).toBe('backward.compatible.token');
      });

      test('should not extract from Bearer token with wrong case', () => {
        // Arrange
        mockRequest.cookies = {};
        mockRequest.headers = {
          authorization: 'bearer lowercase.token'
        };

        // Act
        const token = strategy.extractToken(mockRequest as Request);

        // Assert
        expect(token).toBeNull();
      });

      test('should handle Bearer token with extra spaces', () => {
        // Arrange
        mockRequest.cookies = {};
        mockRequest.headers = {
          authorization: 'Bearer  extra.space.token'
        };

        // Act
        const token = strategy.extractToken(mockRequest as Request);

        // Assert
        expect(token).toBe(' extra.space.token');
      });
    });
  });

  describe('setAuthResponse method', () => {
    describe('Happy Path Scenarios', () => {
      test('should set all cookies and return user data', () => {
        // Arrange
        const loginResponse: LoginResponse = {
          user: {
            id: 1,
            username: 'cookieuser',
            displayName: 'Cookie User',
            email: 'cookie@example.com',
            authSource: 'ad',
            department: 'Engineering',
            title: 'Developer',
            isAdmin: false,
            isActive: true,
            lastLogin: new Date('2025-01-15T10:30:00Z')
          },
          accessToken: 'cookie.access.token',
          refreshToken: 'cookie.refresh.token',
          csrfToken: 'cookie.csrf.token',
          expiresIn: 3600
        };

        // Act
        strategy.setAuthResponse(mockResponse as Response, loginResponse);

        // Assert
        expect(mockResponse.cookie).toHaveBeenCalledTimes(3);
        expect(mockResponse.cookie).toHaveBeenCalledWith(
          'access_token',
          'cookie.access.token',
          {
            httpOnly: true,
            secure: false,
            sameSite: 'strict',
            maxAge: 3600000
          }
        );
        expect(mockResponse.cookie).toHaveBeenCalledWith(
          'refresh_token',
          'cookie.refresh.token',
          {
            httpOnly: true,
            secure: false,
            sameSite: 'strict',
            path: '/api/auth/refresh',
            maxAge: 604800000
          }
        );
        expect(mockResponse.cookie).toHaveBeenCalledWith(
          'csrf_token',
          'cookie.csrf.token',
          {
            httpOnly: true,
            secure: false,
            sameSite: 'strict',
            maxAge: 3600000
          }
        );

        expect(mockResponse.json).toHaveBeenCalledWith({
          success: true,
          message: 'Login successful',
          data: {
            user: {
              id: 1,
              username: 'cookieuser',
              displayName: 'Cookie User',
              email: 'cookie@example.com',
              authSource: 'ad',
              department: 'Engineering',
              title: 'Developer',
              isAdmin: false,
              lastLogin: new Date('2025-01-15T10:30:00Z')
            },
            csrfToken: 'cookie.csrf.token',
            expiresIn: 3600
          }
        });
      });

      test('should handle admin user response', () => {
        // Arrange
        const adminLoginResponse: LoginResponse = {
          user: {
            id: 2,
            username: 'admin',
            displayName: 'Administrator',
            email: 'admin@company.com',
            authSource: 'local',
            department: 'IT',
            title: 'System Admin',
            isAdmin: true,
            isActive: true,
            lastLogin: new Date('2025-01-15T09:00:00Z')
          },
          accessToken: 'admin.cookie.token',
          refreshToken: 'admin.refresh.token',
          csrfToken: 'admin.csrf.token',
          expiresIn: 7200
        };

        // Act
        strategy.setAuthResponse(mockResponse as Response, adminLoginResponse);

        // Assert
        const responseData = (mockResponse.json as jest.Mock).mock.calls[0][0];
        expect(responseData.data.user.isAdmin).toBe(true);
        expect(responseData.data.user.username).toBe('admin');
        expect(responseData.data.expiresIn).toBe(7200);
      });

      test('should handle response without CSRF token', () => {
        // Arrange
        const loginResponseWithoutCSRF: LoginResponse = {
          user: {
            id: 3,
            username: 'nocsrfuser',
            displayName: 'No CSRF User',
            email: 'nocsrf@example.com',
            authSource: 'ad',
            isAdmin: false,
            isActive: true
          },
          accessToken: 'no.csrf.access.token',
          refreshToken: 'no.csrf.refresh.token',
          expiresIn: 1800
        };

        // Act
        strategy.setAuthResponse(mockResponse as Response, loginResponseWithoutCSRF);

        // Assert
        expect(mockResponse.cookie).toHaveBeenCalledTimes(2); // Only access and refresh tokens
        expect(mockResponse.cookie).not.toHaveBeenCalledWith(
          'csrf_token',
          expect.anything(),
          expect.anything()
        );

        const responseData = (mockResponse.json as jest.Mock).mock.calls[0][0];
        expect(responseData.data.csrfToken).toBeUndefined();
      });

      test('should handle response without refresh token', () => {
        // Arrange
        const loginResponseWithoutRefresh: LoginResponse = {
          user: {
            id: 4,
            username: 'norefreshuser',
            displayName: 'No Refresh User',
            email: 'norefresh@example.com',
            authSource: 'azure',
            isAdmin: false,
            isActive: true
          },
          accessToken: 'no.refresh.access.token',
          csrfToken: 'no.refresh.csrf.token',
          expiresIn: 900
        };

        // Act
        strategy.setAuthResponse(mockResponse as Response, loginResponseWithoutRefresh);

        // Assert
        expect(mockResponse.cookie).toHaveBeenCalledTimes(2); // Only access and CSRF tokens
        expect(mockResponse.cookie).not.toHaveBeenCalledWith(
          'refresh_token',
          expect.anything(),
          expect.anything()
        );
      });

      test('should handle minimal user data', () => {
        // Arrange
        const minimalLoginResponse: LoginResponse = {
          user: {
            id: 5,
            username: 'minimaluser',
            displayName: 'Minimal User',
            email: 'minimal@example.com',
            authSource: 'ad',
            isAdmin: false,
            isActive: true
          },
          accessToken: 'minimal.access.token',
          refreshToken: 'minimal.refresh.token',
          expiresIn: 2400
        };

        // Act
        strategy.setAuthResponse(mockResponse as Response, minimalLoginResponse);

        // Assert
        const responseData = (mockResponse.json as jest.Mock).mock.calls[0][0];
        expect(responseData.data.user).toEqual({
          id: 5,
          username: 'minimaluser',
          displayName: 'Minimal User',
          email: 'minimal@example.com',
          authSource: 'ad',
          department: undefined,
          title: undefined,
          isAdmin: false,
          lastLogin: undefined
        });
      });
    });

    describe('Security Features', () => {
      test('should not include access token in response body', () => {
        // Arrange
        const loginResponse: LoginResponse = {
          user: {
            id: 6,
            username: 'secureuser',
            displayName: 'Secure User',
            email: 'secure@example.com',
            authSource: 'ad',
            isAdmin: false,
            isActive: true
          },
          accessToken: 'secure.access.token',
          refreshToken: 'secure.refresh.token',
          csrfToken: 'secure.csrf.token',
          expiresIn: 3600
        };

        // Act
        strategy.setAuthResponse(mockResponse as Response, loginResponse);

        // Assert
        const responseData = (mockResponse.json as jest.Mock).mock.calls[0][0];
        expect(responseData.data).not.toHaveProperty('accessToken');
        expect(responseData.data).not.toHaveProperty('refreshToken');
      });

      test('should not include refresh token in response body', () => {
        // Arrange
        const loginResponse: LoginResponse = {
          user: {
            id: 7,
            username: 'tokenuser',
            displayName: 'Token User',
            email: 'token@example.com',
            authSource: 'local',
            isAdmin: false,
            isActive: true
          },
          accessToken: 'token.access.token',
          refreshToken: 'token.refresh.token',
          expiresIn: 3600
        };

        // Act
        strategy.setAuthResponse(mockResponse as Response, loginResponse);

        // Assert
        const responseData = (mockResponse.json as jest.Mock).mock.calls[0][0];
        expect(responseData.data).not.toHaveProperty('accessToken');
        expect(responseData.data).not.toHaveProperty('refreshToken');
      });

      test('should include CSRF token in response body for client use', () => {
        // Arrange
        const loginResponse: LoginResponse = {
          user: {
            id: 8,
            username: 'csrfuser',
            displayName: 'CSRF User',
            email: 'csrf@example.com',
            authSource: 'ad',
            isAdmin: false,
            isActive: true
          },
          accessToken: 'csrf.access.token',
          refreshToken: 'csrf.refresh.token',
          csrfToken: 'csrf.protection.token',
          expiresIn: 3600
        };

        // Act
        strategy.setAuthResponse(mockResponse as Response, loginResponse);

        // Assert
        const responseData = (mockResponse.json as jest.Mock).mock.calls[0][0];
        expect(responseData.data.csrfToken).toBe('csrf.protection.token');
      });

      test('should exclude sensitive user fields from response', () => {
        // Arrange
        const loginResponseWithSensitiveData: LoginResponse = {
          user: {
            id: 9,
            username: 'sensitiveuser',
            displayName: 'Sensitive User',
            email: 'sensitive@example.com',
            authSource: 'ad',
            department: 'Security',
            title: 'Security Analyst',
            isAdmin: false,
            isActive: true,
            lastLogin: new Date(),
            // These should not be included
            externalId: 'external-id-456'
          },
          accessToken: 'sensitive.access.token',
          refreshToken: 'sensitive.refresh.token',
          expiresIn: 3600
        };

        // Act
        strategy.setAuthResponse(mockResponse as Response, loginResponseWithSensitiveData);

        // Assert
        const responseData = (mockResponse.json as jest.Mock).mock.calls[0][0];
        expect(responseData.data.user).not.toHaveProperty('externalId');
      });
    });

    describe('Error Handling', () => {
      test('should handle null user data', () => {
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

      test('should handle response object without cookie method', () => {
        // Arrange
        const brokenResponse = {
          json: jest.fn()
          // Missing cookie method
        } as any;

        const loginResponse: LoginResponse = {
          user: {
            id: 10,
            username: 'erroruser',
            displayName: 'Error User',
            email: 'error@example.com',
            authSource: 'ad',
            isAdmin: false,
            isActive: true
          },
          accessToken: 'error.token',
          refreshToken: 'error.refresh',
          expiresIn: 3600
        };

        // Act & Assert
        expect(() => {
          strategy.setAuthResponse(brokenResponse, loginResponse);
        }).toThrow();
      });
    });

    describe('Cookie Options Validation', () => {
      test('should use correct cookie options for access token', () => {
        // Arrange
        const loginResponse: LoginResponse = {
          user: {
            id: 11,
            username: 'optionuser',
            displayName: 'Option User',
            email: 'option@example.com',
            authSource: 'ad',
            isAdmin: false,
            isActive: true
          },
          accessToken: 'option.access.token',
          expiresIn: 3600
        };

        // Act
        strategy.setAuthResponse(mockResponse as Response, loginResponse);

        // Assert
        expect(mockResponse.cookie).toHaveBeenCalledWith(
          'access_token',
          'option.access.token',
          expect.objectContaining({
            httpOnly: true,
            secure: false,
            sameSite: 'strict'
          })
        );
      });

      test('should use correct cookie options for refresh token', () => {
        // Arrange
        const loginResponse: LoginResponse = {
          user: {
            id: 12,
            username: 'refreshuser',
            displayName: 'Refresh User',
            email: 'refresh@example.com',
            authSource: 'ad',
            isAdmin: false,
            isActive: true
          },
          refreshToken: 'refresh.option.token',
          expiresIn: 3600
        };

        // Act
        strategy.setAuthResponse(mockResponse as Response, loginResponse);

        // Assert
        expect(mockResponse.cookie).toHaveBeenCalledWith(
          'refresh_token',
          'refresh.option.token',
          expect.objectContaining({
            httpOnly: true,
            secure: false,
            sameSite: 'strict',
            path: '/api/auth/refresh'
          })
        );
      });
    });
  });

  describe('clearAuth method', () => {
    describe('Happy Path Scenarios', () => {
      test('should clear all authentication cookies', () => {
        // Act
        strategy.clearAuth(mockResponse as Response);

        // Assert
        expect(mockResponse.clearCookie).toHaveBeenCalledTimes(4);
        expect(mockResponse.clearCookie).toHaveBeenCalledWith('access_token');
        expect(mockResponse.clearCookie).toHaveBeenCalledWith('refresh_token', { path: '/api/auth/refresh' });
        expect(mockResponse.clearCookie).toHaveBeenCalledWith('csrf_token');
        expect(mockResponse.clearCookie).toHaveBeenCalledWith('session_id');
      });

      test('should use correct path for refresh token cookie clearing', () => {
        // Act
        strategy.clearAuth(mockResponse as Response);

        // Assert
        expect(mockResponse.clearCookie).toHaveBeenCalledWith(
          'refresh_token',
          { path: '/api/auth/refresh' }
        );
      });

      test('should not call json method during clearAuth', () => {
        // Act
        strategy.clearAuth(mockResponse as Response);

        // Assert
        expect(mockResponse.json).not.toHaveBeenCalled();
      });
    });

    describe('Error Handling', () => {
      test('should handle response object without clearCookie method', () => {
        // Arrange
        const brokenResponse = {
          // Missing clearCookie method
        } as Response;

        // Act & Assert
        expect(() => {
          strategy.clearAuth(brokenResponse);
        }).toThrow();
      });

      test('should handle null response gracefully', () => {
        // Act & Assert
        expect(() => {
          strategy.clearAuth(null as any);
        }).toThrow();
      });

      test('should handle undefined response gracefully', () => {
        // Act & Assert
        expect(() => {
          strategy.clearAuth(undefined as any);
        }).toThrow();
      });
    });

    describe('Cookie Clearing Completeness', () => {
      test('should clear access token cookie without options', () => {
        // Act
        strategy.clearAuth(mockResponse as Response);

        // Assert
        expect(mockResponse.clearCookie).toHaveBeenCalledWith('access_token');
      });

      test('should clear CSRF token cookie without options', () => {
        // Act
        strategy.clearAuth(mockResponse as Response);

        // Assert
        expect(mockResponse.clearCookie).toHaveBeenCalledWith('csrf_token');
      });

      test('should clear session ID cookie without options', () => {
        // Act
        strategy.clearAuth(mockResponse as Response);

        // Assert
        expect(mockResponse.clearCookie).toHaveBeenCalledWith('session_id');
      });
    });
  });

  describe('Integration Scenarios', () => {
    test('should handle complete authentication flow with cookies', () => {
      // Arrange - Set up request with existing cookie
      mockRequest.cookies = {
        access_token: 'existing.cookie.token'
      };

      const newLoginResponse: LoginResponse = {
        user: {
          id: 13,
          username: 'integrationuser',
          displayName: 'Integration User',
          email: 'integration@test.com',
          authSource: 'ad',
          department: 'QA',
          title: 'Test Engineer',
          isAdmin: false,
          isActive: true,
          lastLogin: new Date()
        },
        accessToken: 'new.integration.token',
        refreshToken: 'new.integration.refresh',
        csrfToken: 'new.integration.csrf',
        expiresIn: 3600
      };

      // Act - Extract existing token
      const existingToken = strategy.extractToken(mockRequest as Request);

      // Act - Set new authentication response
      strategy.setAuthResponse(mockResponse as Response, newLoginResponse);

      // Act - Clear authentication
      strategy.clearAuth(mockResponse as Response);

      // Assert
      expect(existingToken).toBe('existing.cookie.token');
      expect(mockResponse.cookie).toHaveBeenCalledTimes(3); // access, refresh, csrf
      expect(mockResponse.clearCookie).toHaveBeenCalledTimes(4); // all auth cookies

      const responseData = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(responseData.success).toBe(true);
      expect(responseData.data.user.username).toBe('integrationuser');
      expect(responseData.data.csrfToken).toBe('new.integration.csrf');
      expect(responseData.data).not.toHaveProperty('accessToken');
      expect(responseData.data).not.toHaveProperty('refreshToken');
    });

    test('should handle authentication with different auth sources', () => {
      // Test with different auth sources
      const authSources = ['ad', 'azure', 'o365', 'local'];

      authSources.forEach((authSource, index) => {
        jest.clearAllMocks();

        const loginResponse: LoginResponse = {
          user: {
            id: index + 20,
            username: `user-${authSource}`,
            displayName: `User ${authSource.toUpperCase()}`,
            email: `user-${authSource}@example.com`,
            authSource: authSource as any,
            isAdmin: false,
            isActive: true
          },
          accessToken: `${authSource}.cookie.access.token`,
          refreshToken: `${authSource}.cookie.refresh.token`,
          csrfToken: `${authSource}.cookie.csrf.token`,
          expiresIn: 3600
        };

        strategy.setAuthResponse(mockResponse as Response, loginResponse);

        const responseData = (mockResponse.json as jest.Mock).mock.calls[0][0];
        expect(responseData.data.user.authSource).toBe(authSource);
        expect(responseData.data.csrfToken).toBe(`${authSource}.cookie.csrf.token`);

        // Verify cookies were set
        expect(mockResponse.cookie).toHaveBeenCalledWith(
          'access_token',
          `${authSource}.cookie.access.token`,
          expect.any(Object)
        );
      });
    });
  });
});