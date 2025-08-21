import { ApiResponse } from '@/types';
import { User, LoginRequest, AuthState } from '@/types';
import apiService from './api';

export class AuthService {
  
  async login(credentials: LoginRequest): Promise<ApiResponse<{
    user: User;
    accessToken?: string;
    refreshToken?: string;
  }>> {
    const response = await apiService.post<{
      user: User;
      accessToken?: string;
      refreshToken?: string;
    }>('/auth/login', credentials);
    
    if (response.success && (response as { data: { user: User; accessToken?: string; refreshToken?: string } }).data) {
      // Store tokens in localStorage
      if ((response as { data: { accessToken?: string } }).data.accessToken) {
        localStorage.setItem('accessToken', (response as { data: { accessToken: string } }).data.accessToken);
      }
      if ((response as { data: { refreshToken?: string } }).data.refreshToken) {
        localStorage.setItem('refreshToken', (response as { data: { refreshToken: string } }).data.refreshToken);
      }
      localStorage.setItem('user', JSON.stringify((response as { data: { user: User } }).data.user));
    }
    
    return response;
  }

  async logout(): Promise<ApiResponse> {
    try {
      const response = await apiService.post('/auth/logout');
      
      // Clear all auth data from localStorage
      localStorage.removeItem('user');
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      
      return response;
    } catch (error) {
      // Still clear local storage on error
      localStorage.removeItem('user');
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      
      throw error;
    }
  }

  async refreshToken(): Promise<ApiResponse<{
    accessToken?: string;
    refreshToken?: string;
  }>> {
    // Get refresh token from localStorage
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await apiService.post<{
      accessToken: string;
      refreshToken: string;
    }>('/auth/refresh', { refreshToken });
    
    if (response.success && (response as { data: { user: User; accessToken?: string; refreshToken?: string } }).data) {
      const typedResponse = response as { data: { user: User; accessToken?: string; refreshToken?: string } };
      localStorage.setItem('accessToken', typedResponse.data.accessToken || '');
      localStorage.setItem('refreshToken', typedResponse.data.refreshToken || '');
    }
    
    return response;
  }

  async getProfile(): Promise<ApiResponse<User>> {
    return apiService.get<User>('/auth/profile');
  }

  async updateProfile(profile: Partial<User>): Promise<ApiResponse<User>> {
    return apiService.put<User>('/auth/profile', profile);
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<ApiResponse> {
    return apiService.post('/auth/change-password', {
      currentPassword,
      newPassword
    });
  }

  // Get current auth state from localStorage
  getCurrentAuthState(): AuthState {
    const userStr = localStorage.getItem('user');
    const token = localStorage.getItem('accessToken');
    const refreshToken = localStorage.getItem('refreshToken');
    
    return {
      user: userStr ? JSON.parse(userStr) : null,
      token,
      refreshToken,
      isAuthenticated: !!token,
      isLoading: false,
      error: null
    };
  }

  // Check if user has specific permission
  hasPermission(permission: string): boolean {
    const userStr = localStorage.getItem('user');
    if (!userStr) return false;
    
    const user: User = JSON.parse(userStr);
    return user.permissions?.includes(permission) || false;
  }

  // Check if user has specific role
  hasRole(role: string): boolean {
    const userStr = localStorage.getItem('user');
    if (!userStr) return false;
    
    const user: User = JSON.parse(userStr);
    return user.roles?.includes(role) || false;
  }

  // Check if user is admin
  isAdmin(): boolean {
    return this.hasRole('admin') || this.hasRole('administrator');
  }

  // Get user's authentication source
  getAuthSource(): 'ad' | 'azure' | 'local' | null {
    const userStr = localStorage.getItem('user');
    if (!userStr) return null;
    
    const user: User = JSON.parse(userStr);
    return user.authSource;
  }

  // Validate token expiration (basic check)
  isTokenExpired(): boolean {
    const token = localStorage.getItem('accessToken');
    if (!token) return true;

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const currentTime = Date.now() / 1000;
      return payload.exp < currentTime;
    } catch {
      return true;
    }
  }

  // Get token expiration time
  getTokenExpiration(): Date | null {
    const token = localStorage.getItem('accessToken');
    if (!token) return null;

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return new Date(payload.exp * 1000);
    } catch {
      return null;
    }
  }

  // Check if token needs refresh (5 minutes before expiration)
  needsTokenRefresh(): boolean {
    const expiration = this.getTokenExpiration();
    if (!expiration) return true;
    
    const now = new Date();
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
    return expiration <= fiveMinutesFromNow;
  }

  // Setup automatic token refresh
  setupTokenRefresh(): void {
    // Check every minute if token needs refresh
    setInterval(async () => {
      if (this.needsTokenRefresh()) {
        try {
          await this.refreshToken();
          console.log('Token refreshed automatically');
        } catch (error) {
          console.error('Automatic token refresh failed:', error);
        }
      }
    }, 60000); // Check every minute
  }
}

export const authService = new AuthService();
export default authService;