import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { configureStore, Store } from '@reduxjs/toolkit';
import { AuthState, User } from '@/types';
import authReducer, {
  loginAsync,
  logoutAsync,
  refreshTokenAsync,
  getProfileAsync,
  initializeAuth,
  clearAuth,
  setError,
  clearError,
  updateUser,
  selectAuth,
  selectUser,
  selectIsAuthenticated,
  selectAuthLoading,
  selectAuthError,
  selectUserPermissions,
  selectUserRoles,
  selectIsAdmin,
} from './authSlice';
import { cleanupAfterTest } from '@/utils/test-helpers';

// Mock the authService factory
vi.mock('@/services/authService.factory', () => ({
  activeAuthService: {
    getCurrentAuthState: vi.fn(() => ({
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      error: null
    })),
    login: vi.fn(),
    logout: vi.fn(),
    refreshToken: vi.fn(),
    getProfile: vi.fn(),
    updateProfile: vi.fn(),
    changePassword: vi.fn(),
    hasPermission: vi.fn(),
    hasRole: vi.fn(),
    isAdmin: vi.fn(),
    getAuthSource: vi.fn(),
    setupTokenRefresh: vi.fn()
  }
}));

import { activeAuthService as authService } from '@/services/authService.factory';

interface TestRootState {
  auth: AuthState;
}

describe('authSlice', () => {
  let store: Store<TestRootState>;

  beforeEach(() => {
    store = configureStore({
      reducer: {
        auth: authReducer,
      },
    });
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await cleanupAfterTest();
  });

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const state = store.getState();
      expect(state.auth).toEqual({
        user: null,
        token: null,
        refreshToken: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
    });
  });

  describe('synchronous actions', () => {
    it('should handle initializeAuth from localStorage', () => {
      const user = { id: '1', username: 'testuser', displayName: 'Test User' };
      const token = 'test-token';
      const refreshToken = 'test-refresh-token';
      
      // Mock the authService to return the expected auth state
      vi.mocked(authService.getCurrentAuthState).mockReturnValue({
        user,
        token,
        refreshToken,
        isAuthenticated: true,
        isLoading: false,
        error: null
      });

      store.dispatch(initializeAuth());
      
      const state = store.getState();
      expect(state.auth.user).toEqual(user);
      expect(state.auth.token).toBe(token);
      expect(state.auth.refreshToken).toBe(refreshToken);
      expect(state.auth.isAuthenticated).toBe(true);
    });

    it('should handle clearAuth', () => {
      store.dispatch(initializeAuth());
      store.dispatch(clearAuth());
      
      const state = store.getState();
      expect(state.auth.user).toBeNull();
      expect(state.auth.token).toBeNull();
      expect(state.auth.isAuthenticated).toBe(false);
    });

    it('should handle setError', () => {
      const errorMessage = 'Test error';
      store.dispatch(setError(errorMessage));
      
      const state = store.getState();
      expect(state.auth.error).toBe(errorMessage);
      expect(state.auth.isLoading).toBe(false);
    });

    it('should handle clearError', () => {
      store.dispatch(setError('Test error'));
      store.dispatch(clearError());
      
      const state = store.getState();
      expect(state.auth.error).toBeNull();
    });

    it('should handle updateUser', () => {
      const user: User = { 
        id: '1', 
        username: 'testuser', 
        displayName: 'Test User',
        email: 'test@example.com',
        authSource: 'ad' as const,
        roles: ['user'],
        permissions: ['read'],
        isActive: true
      };
      
      // Mock the authService to return an initialized state
      vi.mocked(authService.getCurrentAuthState).mockReturnValue({
        user,
        token: 'token',
        refreshToken: null,
        isAuthenticated: true,
        isLoading: false,
        error: null
      });
      
      store.dispatch(initializeAuth());
      store.dispatch(updateUser({ displayName: 'Updated User' }));
      
      const state = store.getState();
      expect(state.auth.user?.displayName).toBe('Updated User');
      expect(state.auth.user?.email).toBe('test@example.com');
      
      const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
      expect(storedUser.displayName).toBe('Updated User');
    });
  });

  describe('selectors', () => {
    beforeEach(() => {
      const user = {
        id: '1',
        username: 'admin',
        displayName: 'Admin User',
        email: 'admin@example.com',
        authSource: 'ad' as const,
        roles: ['admin', 'user'],
        permissions: ['reports:read', 'reports:write', 'users:manage'],
        isActive: true
      };
      
      // Mock the authService to return the expected auth state
      vi.mocked(authService.getCurrentAuthState).mockReturnValue({
        user,
        token: 'token',
        refreshToken: null,
        isAuthenticated: true,
        isLoading: false,
        error: null
      });
      
      store.dispatch(initializeAuth());
    });

    it('should select auth state', () => {
      const state = store.getState();
      const authState = selectAuth(state);
      expect(authState).toBe(state.auth);
    });

    it('should select user', () => {
      const state = store.getState();
      const user = selectUser(state);
      expect(user).toBe(state.auth.user);
    });

    it('should select isAuthenticated', () => {
      const state = store.getState();
      const isAuth = selectIsAuthenticated(state);
      expect(isAuth).toBe(true);
    });

    it('should select loading state', () => {
      const state = store.getState();
      const loading = selectAuthLoading(state);
      expect(loading).toBe(false);
    });

    it('should select error', () => {
      store.dispatch(setError('Test error'));
      const state = store.getState();
      const error = selectAuthError(state);
      expect(error).toBe('Test error');
    });

    it('should select user permissions', () => {
      const state = store.getState();
      const permissions = selectUserPermissions(state);
      expect(permissions).toEqual(['reports:read', 'reports:write', 'users:manage']);
    });

    it('should select user roles', () => {
      const state = store.getState();
      const roles = selectUserRoles(state);
      expect(roles).toEqual(['admin', 'user']);
    });

    it('should identify admin user', () => {
      const state = store.getState();
      const isAdmin = selectIsAdmin(state);
      expect(isAdmin).toBe(true);
    });

    it('should identify non-admin user', () => {
      store.dispatch(updateUser({ roles: ['user'] }));
      const state = store.getState();
      const isAdmin = selectIsAdmin(state);
      expect(isAdmin).toBe(false);
    });
  });

  describe('async actions (integration)', () => {
    it('should handle loginAsync pending state', () => {
      store.dispatch(loginAsync.pending('', { username: 'test', password: 'test', authSource: 'ad' }));
      const state = store.getState();
      expect(state.auth.isLoading).toBe(true);
      expect(state.auth.error).toBeNull();
    });

    it('should handle loginAsync fulfilled state', () => {
      const payload = {
        user: { 
          id: '1', 
          username: 'test', 
          displayName: 'Test',
          email: 'test@example.com',
          authSource: 'ad' as const,
          roles: ['user'],
          permissions: ['read'],
          isActive: true
        },
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      };
      
      store.dispatch(loginAsync.fulfilled(payload, '', { username: 'test', password: 'test', authSource: 'ad' }));
      const state = store.getState();
      
      expect(state.auth.isLoading).toBe(false);
      expect(state.auth.user).toEqual(payload.user);
      expect(state.auth.token).toBe(payload.accessToken);
      expect(state.auth.refreshToken).toBe(payload.refreshToken);
      expect(state.auth.isAuthenticated).toBe(true);
      expect(state.auth.error).toBeNull();
    });

    it('should handle loginAsync rejected state', () => {
      store.dispatch(loginAsync.rejected(new Error('Login failed'), '', { username: 'test', password: 'test', authSource: 'ad' }, 'Login failed'));
      const state = store.getState();
      
      expect(state.auth.isLoading).toBe(false);
      expect(state.auth.error).toBe('Login failed');
      expect(state.auth.isAuthenticated).toBe(false);
    });

    it('should handle logoutAsync fulfilled state', () => {
      store.dispatch(initializeAuth());
      store.dispatch(logoutAsync.fulfilled(undefined, ''));
      const state = store.getState();
      
      expect(state.auth.user).toBeNull();
      expect(state.auth.token).toBeNull();
      expect(state.auth.isAuthenticated).toBe(false);
    });

    it('should handle refreshTokenAsync fulfilled state', () => {
      const payload = {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      };
      
      store.dispatch(refreshTokenAsync.fulfilled(payload, ''));
      const state = store.getState();
      
      expect(state.auth.token).toBe(payload.accessToken);
      expect(state.auth.refreshToken).toBe(payload.refreshToken);
      expect(state.auth.error).toBeNull();
    });

    it('should handle getProfileAsync fulfilled state', () => {
      const user: User = { 
        id: '1', 
        username: 'test', 
        displayName: 'Test User',
        email: 'test@example.com',
        authSource: 'ad' as const,
        roles: ['user'],
        permissions: ['read'],
        isActive: true
      };
      
      store.dispatch(getProfileAsync.fulfilled(user, ''));
      const state = store.getState();
      
      expect(state.auth.user).toEqual(user);
      expect(state.auth.error).toBeNull();
      
      const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
      expect(storedUser).toEqual(user);
    });
  });
});