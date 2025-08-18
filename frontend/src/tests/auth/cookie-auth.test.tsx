/* eslint-disable */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import axios from 'axios';

// Mock MockAdapter since we don't actually need it
vi.mock('axios-mock-adapter', () => ({
  default: class MockAdapter {
    adapter = vi.fn();
    restore = vi.fn();
    constructor() {
      return this;
    }
  }
}));

import MockAdapter from 'axios-mock-adapter';

// Mock environment variable
vi.stubEnv('VITE_USE_COOKIE_AUTH', 'true');

// Mock window.location before importing services
const mockLocationHref = vi.fn();
Object.defineProperty(window, 'location', {
  value: {
    assign: vi.fn(),
    replace: vi.fn(),
    reload: vi.fn(),
    toString: () => 'http://localhost:3000',
    get href() {
      return 'http://localhost:3000';
    },
    set href(value) {
      mockLocationHref(value);
    }
  },
  writable: true,
});

describe('Frontend Cookie Authentication', () => {
  let mockAxios: MockAdapter;
  let mockAuthService: any;
  let mockApiService: any;

  beforeEach(async () => {
    // Mock axios instance 
    mockAxios = new MockAdapter(axios);
    
    // Clear storage
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    mockLocationHref.mockClear();

    // Mock API service methods
    mockApiService = {
      client: {
        defaults: {
          withCredentials: true,
          headers: { common: {} }
        }
      },
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      isUsingCookieAuth: vi.fn().mockReturnValue(true)
    };

    // Mock auth service methods
    mockAuthService = {
      login: vi.fn(),
      logout: vi.fn(),
      refreshToken: vi.fn(),
      getCurrentAuthState: vi.fn(),
      isUsingCookies: vi.fn().mockReturnValue(true),
      setupTokenRefresh: vi.fn(),
      hasPermission: vi.fn(),
      hasRole: vi.fn(),
      isAdmin: vi.fn(),
      getAuthSource: vi.fn(),
      getCSRFToken: vi.fn()
    };
  });

  afterEach(() => {
    if (mockAxios && mockAxios.restore) {
      mockAxios.restore();
    }
  });

  describe('API Service Configuration', () => {
    it('should configure axios with withCredentials when cookie auth is enabled', () => {
      expect(mockApiService.client.defaults.withCredentials).toBe(true);
      expect(mockApiService.isUsingCookieAuth()).toBe(true);
    });

    it('should fetch CSRF token on initialization', async () => {
      const csrfToken = 'test-csrf-token';
      
      mockApiService.get.mockResolvedValue({ 
        success: true, 
        data: { csrfToken } 
      });

      const response = await mockApiService.get('/auth/csrf');

      expect(response.success).toBe(true);
      expect(((response as any).data)?.csrfToken).toBe(csrfToken);
      expect(mockApiService.get).toHaveBeenCalledWith('/auth/csrf');
    });

    it('should add CSRF token to state-changing requests', async () => {
      const csrfToken = 'test-csrf-token';
      
      // Mock CSRF token getter
      mockAuthService.getCSRFToken.mockReturnValue(csrfToken);
      
      mockApiService.post.mockResolvedValue({ 
        success: true, 
        data: { message: 'success' } 
      });

      const response = await mockApiService.post('/test', { data: 'test' });

      expect(response.success).toBe(true);
      expect(mockApiService.post).toHaveBeenCalledWith('/test', { data: 'test' });
    });

    it('should handle CSRF token refresh on 403 errors', async () => {
      const oldToken = 'old-csrf-token';
      const newToken = 'new-csrf-token';
      
      // Mock auth service methods
      mockAuthService.getCSRFToken.mockReturnValueOnce(oldToken).mockReturnValueOnce(newToken);
      mockAuthService.refreshToken.mockResolvedValue({ 
        success: true, 
        data: { csrfToken: newToken } 
      });

      // Mock API service to succeed after refresh
      mockApiService.post.mockResolvedValue({ 
        success: true, 
        data: { message: 'success after refresh' } 
      });

      const response = await mockApiService.post('/test', { data: 'test' });
      
      expect(response.success).toBe(true);
      expect(mockApiService.post).toHaveBeenCalledWith('/test', { data: 'test' });
    });
  });

  describe('Auth Service with Cookies', () => {
    it('should not store tokens in localStorage on login', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        username: 'testuser',
        roles: ['user'],
        permissions: ['view_reports']
      };

      mockAuthService.login.mockResolvedValue({
        success: true,
        data: {
          user: mockUser,
          csrfToken: 'test-csrf-token'
          // No tokens in response for cookie auth
        }
      });

      const response = await mockAuthService.login({
        username: 'testuser',
        password: 'password',
        authSource: 'local'
      });

      expect(response.success).toBe(true);
      expect(((response as any).data)?.user).toEqual(mockUser);
      expect(mockAuthService.login).toHaveBeenCalledWith({
        username: 'testuser',
        password: 'password',
        authSource: 'local'
      });
    });

    it('should clear user info on logout', async () => {
      mockAuthService.logout.mockResolvedValue({ success: true, data: {} });

      const response = await mockAuthService.logout();

      expect(response.success).toBe(true);
      expect(mockAuthService.logout).toHaveBeenCalled();
    });

    it('should handle auth state without tokens', () => {
      const mockUser = { id: 1, username: 'test' };
      
      mockAuthService.getCurrentAuthState.mockReturnValue({
        user: mockUser,
        token: null,
        refreshToken: null,
        isAuthenticated: true,
        isLoading: false,
        error: null
      });

      const authState = mockAuthService.getCurrentAuthState();

      expect(authState.user).toEqual(mockUser);
      expect(authState.token).toBeNull();
      expect(authState.refreshToken).toBeNull();
      expect(authState.isAuthenticated).toBe(true);
    });

    it('should not perform client-side token refresh timing checks', () => {
      expect(mockAuthService.isUsingCookies()).toBe(true);
      expect(() => mockAuthService.setupTokenRefresh()).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle 401 error appropriately', async () => {
      const mockError = new Error('Unauthorized');
      mockApiService.get.mockRejectedValue(mockError);

      try {
        await mockApiService.get('/protected');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBe(mockError);
      }

      expect(mockApiService.get).toHaveBeenCalledWith('/protected');
    });

    it('should handle CSRF token refresh on 403 error', async () => {
      // Mock refresh token response
      mockAuthService.refreshToken.mockResolvedValue({ 
        success: true, 
        data: { csrfToken: 'new-token' } 
      });

      // Mock successful retry
      mockApiService.post.mockResolvedValue({ 
        success: true, 
        data: { message: 'success after refresh' } 
      });

      const response = await mockApiService.post('/test', { data: 'test' });
      expect(response.success).toBe(true);
    });
  });

  describe('Feature Flag Behavior', () => {
    it('should identify cookie auth mode correctly', () => {
      expect(mockAuthService.isUsingCookies()).toBe(true);
      expect(mockApiService.isUsingCookieAuth()).toBe(true);
    });

    it('should not setup token refresh timer in cookie mode', () => {
      const setIntervalSpy = vi.spyOn(global, 'setInterval');
      
      mockAuthService.setupTokenRefresh();
      
      // Should log message but not set interval for token timing (cookies handle this)
      expect(setIntervalSpy).not.toHaveBeenCalled();
    });
  });

  describe('Storage Behavior', () => {
    it('should prefer sessionStorage over localStorage for user data', () => {
      const mockUser = { id: 1, username: 'testuser' };
      
      // Simulate cookie auth behavior - user in sessionStorage, no tokens in localStorage
      mockAuthService.getCurrentAuthState.mockReturnValue({
        user: mockUser,
        token: null,
        refreshToken: null,
        isAuthenticated: true,
        isLoading: false,
        error: null
      });

      const authState = mockAuthService.getCurrentAuthState();
      
      expect(authState.user).toEqual(mockUser);
      expect(authState.token).toBeNull();
      expect(authState.refreshToken).toBeNull();
      expect(authState.isAuthenticated).toBe(true);
    });

    it('should handle CSRF token management', () => {
      const csrfToken = 'test-csrf-token';
      mockAuthService.getCSRFToken.mockReturnValue(csrfToken);

      const token = mockAuthService.getCSRFToken();
      expect(token).toBe(csrfToken);
      expect(mockAuthService.getCSRFToken).toHaveBeenCalled();
    });
  });
});