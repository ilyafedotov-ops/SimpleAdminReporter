import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { authService, AuthService } from '../authService';
import apiService from '../api';
import { ApiResponse, User, LoginRequest } from '@/types';

// Mock the API service
vi.mock('../api', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
    put: vi.fn()
  }
}));

describe('AuthService', () => {
  let localStorageMock: typeof window.localStorage;
  let consoleLogSpy: unknown;
  let consoleErrorSpy: unknown;
  let setIntervalSpy: unknown;

  beforeEach(() => {
    // Mock localStorage
    localStorageMock = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: vi.fn()
    };
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true
    });

    // Mock console methods
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    // Mock setInterval
    setIntervalSpy = vi.spyOn(global, 'setInterval').mockImplementation(() => 123 as unknown);

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    setIntervalSpy.mockRestore();
  });

  describe('login', () => {
    const mockUser: User = {
      id: 1,
      username: 'testuser',
      displayName: 'Test User',
      email: 'test@example.com',
      roles: ['user'],
      permissions: ['read:reports'],
      authSource: 'ad',
      isActive: true,
      lastLoginAt: '2024-01-01T10:00:00Z'
    };

    const loginCredentials: LoginRequest = {
      username: 'testuser',
      password: 'password123'
    };

    it('should login successfully and store tokens', async () => {
      const mockResponse: ApiResponse<{
        user: User;
        accessToken: string;
        refreshToken: string;
      }> = {
        success: true,
        data: {
          user: mockUser,
          accessToken: 'access-token-123',
          refreshToken: 'refresh-token-123'
        }
      };

      vi.mocked(apiService.post).mockResolvedValue(mockResponse);

      const result = await authService.login(loginCredentials);

      expect(apiService.post).toHaveBeenCalledWith('/auth/login', loginCredentials);
      expect(localStorageMock.setItem).toHaveBeenCalledWith('accessToken', 'access-token-123');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('refreshToken', 'refresh-token-123');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('user', JSON.stringify(mockUser));
      expect(result).toEqual(mockResponse);
    });

    it('should login successfully without tokens', async () => {
      const mockResponse: ApiResponse<{
        user: User;
      }> = {
        success: true,
        data: {
          user: mockUser
        }
      };

      vi.mocked(apiService.post).mockResolvedValue(mockResponse);

      const result = await authService.login(loginCredentials);

      expect(localStorageMock.setItem).toHaveBeenCalledWith('user', JSON.stringify(mockUser));
      expect(localStorageMock.setItem).not.toHaveBeenCalledWith('accessToken', expect.any(String));
      expect(localStorageMock.setItem).not.toHaveBeenCalledWith('refreshToken', expect.any(String));
      expect(result).toEqual(mockResponse);
    });

    it('should handle login failure', async () => {
      const mockResponse: ApiResponse<any> = {
        success: false,
        error: 'Invalid credentials'
      };

      vi.mocked(apiService.post).mockResolvedValue(mockResponse);

      const result = await authService.login(loginCredentials);

      expect(localStorageMock.setItem).not.toHaveBeenCalled();
      expect(result).toEqual(mockResponse);
    });

    it('should handle login error', async () => {
      const error = new Error('Network error');
      vi.mocked(apiService.post).mockRejectedValue(error);

      await expect(authService.login(loginCredentials)).rejects.toThrow('Network error');
      expect(localStorageMock.setItem).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('should logout successfully and clear storage', async () => {
      const mockResponse: ApiResponse = {
        success: true
      };

      vi.mocked(apiService.post).mockResolvedValue(mockResponse);

      const result = await authService.logout();

      expect(apiService.post).toHaveBeenCalledWith('/auth/logout');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('user');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('accessToken');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('refreshToken');
      expect(result).toEqual(mockResponse);
    });

    it('should clear storage even when logout request fails', async () => {
      const error = new Error('Server error');
      vi.mocked(apiService.post).mockRejectedValue(error);

      await expect(authService.logout()).rejects.toThrow('Server error');

      expect(localStorageMock.removeItem).toHaveBeenCalledWith('user');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('accessToken');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('refreshToken');
    });
  });

  describe('refreshToken', () => {
    it('should refresh token successfully', async () => {
      const refreshToken = 'old-refresh-token';
      const mockResponse: ApiResponse<{
        accessToken: string;
        refreshToken: string;
      }> = {
        success: true,
        data: {
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token'
        }
      };

      vi.mocked(localStorageMock.getItem).mockReturnValue(refreshToken);
      vi.mocked(apiService.post).mockResolvedValue(mockResponse);

      const result = await authService.refreshToken();

      expect(apiService.post).toHaveBeenCalledWith('/auth/refresh', { refreshToken });
      expect(localStorageMock.setItem).toHaveBeenCalledWith('accessToken', 'new-access-token');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('refreshToken', 'new-refresh-token');
      expect(result).toEqual(mockResponse);
    });

    it('should throw error when no refresh token available', async () => {
      vi.mocked(localStorageMock.getItem).mockReturnValue(null);

      await expect(authService.refreshToken()).rejects.toThrow('No refresh token available');

      expect(apiService.post).not.toHaveBeenCalled();
    });

    it('should handle refresh failure', async () => {
      const refreshToken = 'invalid-refresh-token';
      const mockResponse: ApiResponse<any> = {
        success: false,
        error: 'Invalid refresh token'
      };

      vi.mocked(localStorageMock.getItem).mockReturnValue(refreshToken);
      vi.mocked(apiService.post).mockResolvedValue(mockResponse);

      const result = await authService.refreshToken();

      expect(localStorageMock.setItem).not.toHaveBeenCalled();
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getProfile', () => {
    it('should get user profile', async () => {
      const mockUser: User = {
        id: 1,
        username: 'testuser',
        displayName: 'Test User',
        email: 'test@example.com',
        roles: ['user'],
        permissions: ['read:reports'],
        authSource: 'ad',
        isActive: true
      };

      const mockResponse: ApiResponse<User> = {
        success: true,
        data: mockUser
      };

      vi.mocked(apiService.get).mockResolvedValue(mockResponse);

      const result = await authService.getProfile();

      expect(apiService.get).toHaveBeenCalledWith('/auth/profile');
      expect(result).toEqual(mockResponse);
    });
  });

  describe('updateProfile', () => {
    it('should update user profile', async () => {
      const profileUpdate = { displayName: 'Updated Name', email: 'updated@example.com' };
      const mockResponse: ApiResponse<User> = {
        success: true,
        data: {
          id: 1,
          username: 'testuser',
          displayName: 'Updated Name',
          email: 'updated@example.com',
          roles: ['user'],
          permissions: ['read:reports'],
          authSource: 'ad',
          isActive: true
        }
      };

      vi.mocked(apiService.put).mockResolvedValue(mockResponse);

      const result = await authService.updateProfile(profileUpdate);

      expect(apiService.put).toHaveBeenCalledWith('/auth/profile', profileUpdate);
      expect(result).toEqual(mockResponse);
    });
  });

  describe('changePassword', () => {
    it('should change password successfully', async () => {
      const mockResponse: ApiResponse = {
        success: true
      };

      vi.mocked(apiService.post).mockResolvedValue(mockResponse);

      const result = await authService.changePassword('oldPassword', 'newPassword');

      expect(apiService.post).toHaveBeenCalledWith('/auth/change-password', {
        currentPassword: 'oldPassword',
        newPassword: 'newPassword'
      });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getCurrentAuthState', () => {
    it('should return authenticated state', () => {
      const mockUser: User = {
        id: 1,
        username: 'testuser',
        displayName: 'Test User',
        email: 'test@example.com',
        roles: ['user'],
        permissions: ['read:reports'],
        authSource: 'ad',
        isActive: true
      };

      vi.mocked(localStorageMock.getItem)
        .mockReturnValueOnce(JSON.stringify(mockUser)) // user
        .mockReturnValueOnce('access-token') // token
        .mockReturnValueOnce('refresh-token'); // refreshToken

      const result = authService.getCurrentAuthState();

      expect(result).toEqual({
        user: mockUser,
        token: 'access-token',
        refreshToken: 'refresh-token',
        isAuthenticated: true,
        isLoading: false,
        error: null
      });
    });

    it('should return unauthenticated state', () => {
      vi.mocked(localStorageMock.getItem).mockReturnValue(null);

      const result = authService.getCurrentAuthState();

      expect(result).toEqual({
        user: null,
        token: null,
        refreshToken: null,
        isAuthenticated: false,
        isLoading: false,
        error: null
      });
    });

    it('should handle invalid user JSON', () => {
      vi.mocked(localStorageMock.getItem)
        .mockReturnValueOnce('invalid-json') // user
        .mockReturnValueOnce('access-token') // token
        .mockReturnValueOnce('refresh-token'); // refreshToken

      expect(() => authService.getCurrentAuthState()).toThrow();
    });
  });

  describe('hasPermission', () => {
    it('should return true when user has permission', () => {
      const mockUser: User = {
        id: 1,
        username: 'testuser',
        displayName: 'Test User',
        email: 'test@example.com',
        roles: ['user'],
        permissions: ['read:reports', 'write:reports'],
        authSource: 'ad',
        isActive: true
      };

      vi.mocked(localStorageMock.getItem).mockReturnValue(JSON.stringify(mockUser));

      const result = authService.hasPermission('read:reports');

      expect(result).toBe(true);
    });

    it('should return false when user does not have permission', () => {
      const mockUser: User = {
        id: 1,
        username: 'testuser',
        displayName: 'Test User',
        email: 'test@example.com',
        roles: ['user'],
        permissions: ['read:reports'],
        authSource: 'ad',
        isActive: true
      };

      vi.mocked(localStorageMock.getItem).mockReturnValue(JSON.stringify(mockUser));

      const result = authService.hasPermission('admin:all');

      expect(result).toBe(false);
    });

    it('should return false when no user is stored', () => {
      vi.mocked(localStorageMock.getItem).mockReturnValue(null);

      const result = authService.hasPermission('read:reports');

      expect(result).toBe(false);
    });

    it('should return false when user has no permissions', () => {
      const mockUser: User = {
        id: 1,
        username: 'testuser',
        displayName: 'Test User',
        email: 'test@example.com',
        roles: ['user'],
        authSource: 'ad',
        isActive: true
      };

      vi.mocked(localStorageMock.getItem).mockReturnValue(JSON.stringify(mockUser));

      const result = authService.hasPermission('read:reports');

      expect(result).toBe(false);
    });
  });

  describe('hasRole', () => {
    it('should return true when user has role', () => {
      const mockUser: User = {
        id: 1,
        username: 'testuser',
        displayName: 'Test User',
        email: 'test@example.com',
        roles: ['user', 'moderator'],
        permissions: ['read:reports'],
        authSource: 'ad',
        isActive: true
      };

      vi.mocked(localStorageMock.getItem).mockReturnValue(JSON.stringify(mockUser));

      const result = authService.hasRole('moderator');

      expect(result).toBe(true);
    });

    it('should return false when user does not have role', () => {
      const mockUser: User = {
        id: 1,
        username: 'testuser',
        displayName: 'Test User',
        email: 'test@example.com',
        roles: ['user'],
        permissions: ['read:reports'],
        authSource: 'ad',
        isActive: true
      };

      vi.mocked(localStorageMock.getItem).mockReturnValue(JSON.stringify(mockUser));

      const result = authService.hasRole('admin');

      expect(result).toBe(false);
    });

    it('should return false when no user is stored', () => {
      vi.mocked(localStorageMock.getItem).mockReturnValue(null);

      const result = authService.hasRole('user');

      expect(result).toBe(false);
    });

    it('should return false when user has no roles', () => {
      const mockUser: User = {
        id: 1,
        username: 'testuser',
        displayName: 'Test User',
        email: 'test@example.com',
        authSource: 'ad',
        isActive: true
      };

      vi.mocked(localStorageMock.getItem).mockReturnValue(JSON.stringify(mockUser));

      const result = authService.hasRole('user');

      expect(result).toBe(false);
    });
  });

  describe('isAdmin', () => {
    it('should return true when user has admin role', () => {
      const mockUser: User = {
        id: 1,
        username: 'testuser',
        displayName: 'Test User',
        email: 'test@example.com',
        roles: ['user', 'admin'],
        permissions: ['read:reports'],
        authSource: 'ad',
        isActive: true
      };

      vi.mocked(localStorageMock.getItem).mockReturnValue(JSON.stringify(mockUser));

      const result = authService.isAdmin();

      expect(result).toBe(true);
    });

    it('should return true when user has administrator role', () => {
      const mockUser: User = {
        id: 1,
        username: 'testuser',
        displayName: 'Test User',
        email: 'test@example.com',
        roles: ['user', 'administrator'],
        permissions: ['read:reports'],
        authSource: 'ad',
        isActive: true
      };

      vi.mocked(localStorageMock.getItem).mockReturnValue(JSON.stringify(mockUser));

      const result = authService.isAdmin();

      expect(result).toBe(true);
    });

    it('should return false when user is not admin', () => {
      const mockUser: User = {
        id: 1,
        username: 'testuser',
        displayName: 'Test User',
        email: 'test@example.com',
        roles: ['user'],
        permissions: ['read:reports'],
        authSource: 'ad',
        isActive: true
      };

      vi.mocked(localStorageMock.getItem).mockReturnValue(JSON.stringify(mockUser));

      const result = authService.isAdmin();

      expect(result).toBe(false);
    });
  });

  describe('getAuthSource', () => {
    it('should return user auth source', () => {
      const mockUser: User = {
        id: 1,
        username: 'testuser',
        displayName: 'Test User',
        email: 'test@example.com',
        roles: ['user'],
        permissions: ['read:reports'],
        authSource: 'azure',
        isActive: true
      };

      vi.mocked(localStorageMock.getItem).mockReturnValue(JSON.stringify(mockUser));

      const result = authService.getAuthSource();

      expect(result).toBe('azure');
    });

    it('should return null when no user is stored', () => {
      vi.mocked(localStorageMock.getItem).mockReturnValue(null);

      const result = authService.getAuthSource();

      expect(result).toBeNull();
    });
  });

  describe('isTokenExpired', () => {
    const createJWT = (exp: number) => {
      const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const payload = btoa(JSON.stringify({ exp }));
      const signature = 'fake-signature';
      return `${header}.${payload}.${signature}`;
    };

    it('should return true when token is expired', () => {
      const expiredTime = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      const expiredToken = createJWT(expiredTime);

      vi.mocked(localStorageMock.getItem).mockReturnValue(expiredToken);

      const result = authService.isTokenExpired();

      expect(result).toBe(true);
    });

    it('should return false when token is valid', () => {
      const futureTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      const validToken = createJWT(futureTime);

      vi.mocked(localStorageMock.getItem).mockReturnValue(validToken);

      const result = authService.isTokenExpired();

      expect(result).toBe(false);
    });

    it('should return true when no token exists', () => {
      vi.mocked(localStorageMock.getItem).mockReturnValue(null);

      const result = authService.isTokenExpired();

      expect(result).toBe(true);
    });

    it('should return true when token is malformed', () => {
      vi.mocked(localStorageMock.getItem).mockReturnValue('invalid-token');

      const result = authService.isTokenExpired();

      expect(result).toBe(true);
    });
  });

  describe('getTokenExpiration', () => {
    const createJWT = (exp: number) => {
      const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const payload = btoa(JSON.stringify({ exp }));
      const signature = 'fake-signature';
      return `${header}.${payload}.${signature}`;
    };

    it('should return token expiration date', () => {
      const expTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      const token = createJWT(expTime);

      vi.mocked(localStorageMock.getItem).mockReturnValue(token);

      const result = authService.getTokenExpiration();

      expect(result).toEqual(new Date(expTime * 1000));
    });

    it('should return null when no token exists', () => {
      vi.mocked(localStorageMock.getItem).mockReturnValue(null);

      const result = authService.getTokenExpiration();

      expect(result).toBeNull();
    });

    it('should return null when token is malformed', () => {
      vi.mocked(localStorageMock.getItem).mockReturnValue('invalid-token');

      const result = authService.getTokenExpiration();

      expect(result).toBeNull();
    });
  });

  describe('needsTokenRefresh', () => {
    it('should return true when token expires within 5 minutes', () => {
      const expTime = Math.floor(Date.now() / 1000) + 240; // 4 minutes from now
      const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const payload = btoa(JSON.stringify({ exp: expTime }));
      const signature = 'fake-signature';
      const token = `${header}.${payload}.${signature}`;

      vi.mocked(localStorageMock.getItem).mockReturnValue(token);

      const result = authService.needsTokenRefresh();

      expect(result).toBe(true);
    });

    it('should return false when token has plenty of time left', () => {
      const expTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const payload = btoa(JSON.stringify({ exp: expTime }));
      const signature = 'fake-signature';
      const token = `${header}.${payload}.${signature}`;

      vi.mocked(localStorageMock.getItem).mockReturnValue(token);

      const result = authService.needsTokenRefresh();

      expect(result).toBe(false);
    });

    it('should return true when no expiration date available', () => {
      vi.mocked(localStorageMock.getItem).mockReturnValue(null);

      const result = authService.needsTokenRefresh();

      expect(result).toBe(true);
    });
  });

  describe('setupTokenRefresh', () => {
    it('should setup automatic token refresh', () => {
      authService.setupTokenRefresh();

      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 60000);
    });

    it('should refresh token when needed', async () => {
      const refreshSpy = vi.spyOn(authService, 'refreshToken').mockResolvedValue({
        success: true,
        data: { accessToken: 'new-token', refreshToken: 'new-refresh' }
      });
      const needsRefreshSpy = vi.spyOn(authService, 'needsTokenRefresh').mockReturnValue(true);

      authService.setupTokenRefresh();

      // Get the callback function that was passed to setInterval
      const intervalCallback = setIntervalSpy.mock.calls[0][0];
      
      // Execute the callback
      await intervalCallback();

      expect(needsRefreshSpy).toHaveBeenCalled();
      expect(refreshSpy).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith('Token refreshed automatically');
    });

    it('should handle refresh errors', async () => {
      const refreshSpy = vi.spyOn(authService, 'refreshToken').mockRejectedValue(new Error('Refresh failed'));
      const needsRefreshSpy = vi.spyOn(authService, 'needsTokenRefresh').mockReturnValue(true);

      authService.setupTokenRefresh();

      // Get the callback function that was passed to setInterval
      const intervalCallback = setIntervalSpy.mock.calls[0][0];
      
      // Execute the callback
      await intervalCallback();

      expect(needsRefreshSpy).toHaveBeenCalled();
      expect(refreshSpy).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith('Automatic token refresh failed:', expect.any(Error));
    });

    it('should not refresh when token does not need refresh', async () => {
      const refreshSpy = vi.spyOn(authService, 'refreshToken');
      const needsRefreshSpy = vi.spyOn(authService, 'needsTokenRefresh').mockReturnValue(false);

      authService.setupTokenRefresh();

      // Get the callback function that was passed to setInterval
      const intervalCallback = setIntervalSpy.mock.calls[0][0];
      
      // Execute the callback
      await intervalCallback();

      expect(needsRefreshSpy).toHaveBeenCalled();
      expect(refreshSpy).not.toHaveBeenCalled();
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle empty user object', () => {
      vi.mocked(localStorageMock.getItem).mockReturnValue(JSON.stringify({}));

      const result = authService.hasRole('user');
      expect(result).toBe(false);

      const permission = authService.hasPermission('read:reports');
      expect(permission).toBe(false);

      const authSource = authService.getAuthSource();
      expect(authSource).toBeUndefined();
    });

    it('should handle malformed JWT tokens gracefully', () => {
      vi.mocked(localStorageMock.getItem).mockReturnValue('not.a.jwt');

      expect(authService.isTokenExpired()).toBe(true);
      expect(authService.getTokenExpiration()).toBeNull();
      expect(authService.needsTokenRefresh()).toBe(true);
    });

    it('should handle network errors in async methods', async () => {
      const networkError = new Error('Network error');
      vi.mocked(apiService.post).mockRejectedValue(networkError);

      await expect(authService.login({ username: 'test', password: 'test' }))
        .rejects.toThrow('Network error');

      await expect(authService.logout()).rejects.toThrow('Network error');
    });

    it('should create new AuthService instance', () => {
      const newService = new AuthService();
      expect(newService).toBeInstanceOf(AuthService);
      expect(newService).not.toBe(authService);
    });
  });
});