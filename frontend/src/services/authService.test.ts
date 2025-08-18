 
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { authService } from './authService';
import apiService from './api';

// Mock the api service
vi.mock('./api', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
    put: vi.fn(),
  },
}));

describe('authService', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('login', () => {
    it('should login successfully and store tokens', async () => {
      const mockResponse = {
        success: true,
        data: {
          user: {
            id: '1',
            username: 'testuser',
            displayName: 'Test User',
            email: 'test@example.com',
          },
          accessToken: 'access-token-123',
          refreshToken: 'refresh-token-123',
        }
      };

      vi.mocked(apiService.post).mockResolvedValueOnce(mockResponse);

      const credentials = {
        username: 'testuser',
        password: 'password',
        authSource: 'ad' as const,
      };

      const result = await authService.login(credentials);

      expect(apiService.post).toHaveBeenCalledWith('/auth/login', credentials);
      expect(result).toEqual(mockResponse);
      expect(localStorage.getItem('accessToken')).toBe('access-token-123');
      expect(localStorage.getItem('refreshToken')).toBe('refresh-token-123');
      expect(localStorage.getItem('user')).toBe(JSON.stringify(mockResponse.data.user));
    });

    it('should not store tokens on failed login', async () => {
      const mockResponse = {
        success: false,
        error: 'Invalid credentials',
      };

      vi.mocked(apiService.post).mockResolvedValueOnce(mockResponse);

      const credentials = {
        username: 'testuser',
        password: 'wrongpassword',
        authSource: 'ad' as const,
      };

      const result = await authService.login(credentials);

      expect(result).toEqual(mockResponse);
      expect(localStorage.getItem('accessToken')).toBeNull();
      expect(localStorage.getItem('refreshToken')).toBeNull();
      expect(localStorage.getItem('user')).toBeNull();
    });
  });

  describe('logout', () => {
    it('should logout and clear tokens', async () => {
      localStorage.setItem('accessToken', 'token');
      localStorage.setItem('refreshToken', 'refresh');
      localStorage.setItem('user', '{"id":"1"}');

      const mockResponse = { 
        success: true,
        data: null
      };
      vi.mocked(apiService.post).mockResolvedValueOnce(mockResponse);

      const result = await authService.logout();

      expect(apiService.post).toHaveBeenCalledWith('/auth/logout');
      expect(result).toEqual(mockResponse);
      expect(localStorage.getItem('accessToken')).toBeNull();
      expect(localStorage.getItem('refreshToken')).toBeNull();
      expect(localStorage.getItem('user')).toBeNull();
    });

    it('should clear tokens even if logout request fails', async () => {
      localStorage.setItem('accessToken', 'token');
      localStorage.setItem('refreshToken', 'refresh');
      localStorage.setItem('user', '{"id":"1"}');

      vi.mocked(apiService.post).mockRejectedValueOnce(new Error('Network error'));

      try {
        await authService.logout();
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }

      expect(localStorage.getItem('accessToken')).toBeNull();
      expect(localStorage.getItem('refreshToken')).toBeNull();
      expect(localStorage.getItem('user')).toBeNull();
    });
  });

  describe('refreshToken', () => {
    it('should refresh token successfully', async () => {
      localStorage.setItem('refreshToken', 'old-refresh-token');

      const mockResponse = {
        success: true,
        data: {
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
        },
      };

      vi.mocked(apiService.post).mockResolvedValueOnce(mockResponse);

      const result = await authService.refreshToken();

      expect(apiService.post).toHaveBeenCalledWith('/auth/refresh', {
        refreshToken: 'old-refresh-token',
      });
      expect(result).toEqual(mockResponse);
    });

    it('should handle missing refresh token', async () => {
      localStorage.removeItem('refreshToken');

      try {
        await authService.refreshToken();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('No refresh token available');
      }
    });
  });

  describe('getProfile', () => {
    it('should get user profile successfully', async () => {
      const mockResponse = {
        success: true,
        data: {
          id: '1',
          username: 'testuser',
          displayName: 'Test User',
          email: 'test@example.com',
        },
      };

      vi.mocked(apiService.get).mockResolvedValueOnce(mockResponse);

      const result = await authService.getProfile();

      expect(apiService.get).toHaveBeenCalledWith('/auth/profile');
      expect(result).toEqual(mockResponse);
    });
  });

  describe('updateProfile', () => {
    it('should update profile successfully', async () => {
      const profileUpdate = {
        displayName: 'Updated Name',
        email: 'updated@example.com',
      };

      const mockResponse = {
        success: true,
        data: {
          id: '1',
          username: 'testuser',
          displayName: 'Updated Name',
          email: 'updated@example.com',
        },
      };

      vi.mocked(apiService.put).mockResolvedValueOnce(mockResponse);

      const result = await authService.updateProfile(profileUpdate);

      expect(apiService.put).toHaveBeenCalledWith('/auth/profile', profileUpdate);
      expect(result).toEqual(mockResponse);
    });
  });

  describe('changePassword', () => {
    it('should change password successfully', async () => {
      const mockResponse = {
        success: true,
        data: null,
        message: 'Password changed successfully',
      };

      vi.mocked(apiService.post).mockResolvedValueOnce(mockResponse);

      const result = await authService.changePassword('oldpass', 'newpass');

      expect(apiService.post).toHaveBeenCalledWith('/auth/change-password', {
        currentPassword: 'oldpass',
        newPassword: 'newpass',
      });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('hasPermission', () => {
    it('should return true when user has permission', () => {
      const user = {
        id: '1',
        username: 'test',
        permissions: ['reports:read', 'reports:write', 'users:manage'],
      };
      localStorage.setItem('user', JSON.stringify(user));

      const result = authService.hasPermission('reports:read');

      expect(result).toBe(true);
    });

    it('should return false when user lacks permission', () => {
      const user = {
        id: '1',
        username: 'test',
        permissions: ['reports:read'],
      };
      localStorage.setItem('user', JSON.stringify(user));

      const result = authService.hasPermission('users:manage');

      expect(result).toBe(false);
    });

    it('should return false when no user exists', () => {
      localStorage.removeItem('user');

      const result = authService.hasPermission('reports:read');

      expect(result).toBe(false);
    });
  });

  describe('getCurrentAuthState', () => {
    it('should return current auth state from localStorage', () => {
      const user = {
        id: '1',
        username: 'testuser',
        displayName: 'Test User',
      };
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('accessToken', 'token123');
      localStorage.setItem('refreshToken', 'refresh123');

      const authState = authService.getCurrentAuthState();

      expect(authState).toEqual({
        user,
        token: 'token123',
        refreshToken: 'refresh123',
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    });

    it('should return unauthenticated state when no data exists', () => {
      const authState = authService.getCurrentAuthState();

      expect(authState).toEqual({
        user: null,
        token: null,
        refreshToken: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
    });

    it('should handle corrupted user data', () => {
      localStorage.setItem('user', 'invalid-json');
      localStorage.setItem('accessToken', 'token123');

      try {
        authService.getCurrentAuthState();
      } catch (error) {
        expect(error).toBeInstanceOf(SyntaxError);
      }
    });
  });

  describe('hasRole', () => {
    it('should return true when user has role', () => {
      const user = {
        id: '1',
        username: 'test',
        roles: ['admin', 'user'],
      };
      localStorage.setItem('user', JSON.stringify(user));

      const result = authService.hasRole('admin');

      expect(result).toBe(true);
    });

    it('should return false when user lacks role', () => {
      const user = {
        id: '1',
        username: 'test',
        roles: ['user'],
      };
      localStorage.setItem('user', JSON.stringify(user));

      const result = authService.hasRole('admin');

      expect(result).toBe(false);
    });

    it('should return false when no user exists', () => {
      localStorage.removeItem('user');

      const result = authService.hasRole('admin');

      expect(result).toBe(false);
    });
  });

  describe('isAdmin', () => {
    it('should return true for admin role', () => {
      const user = {
        id: '1',
        username: 'test',
        roles: ['admin'],
      };
      localStorage.setItem('user', JSON.stringify(user));

      const result = authService.isAdmin();

      expect(result).toBe(true);
    });

    it('should return true for administrator role', () => {
      const user = {
        id: '1',
        username: 'test',
        roles: ['administrator'],
      };
      localStorage.setItem('user', JSON.stringify(user));

      const result = authService.isAdmin();

      expect(result).toBe(true);
    });

    it('should return false for non-admin user', () => {
      const user = {
        id: '1',
        username: 'test',
        roles: ['user'],
      };
      localStorage.setItem('user', JSON.stringify(user));

      const result = authService.isAdmin();

      expect(result).toBe(false);
    });
  });

  describe('getAuthSource', () => {
    it('should return user auth source', () => {
      const user = {
        id: '1',
        username: 'test',
        authSource: 'ad' as const,
      };
      localStorage.setItem('user', JSON.stringify(user));

      const result = authService.getAuthSource();

      expect(result).toBe('ad');
    });

    it('should return null when no user exists', () => {
      localStorage.removeItem('user');

      const result = authService.getAuthSource();

      expect(result).toBeNull();
    });
  });
});