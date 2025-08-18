import { ApiResponse } from '@/types';
import { User, LoginRequest, AuthState } from '@/types';
import apiService from './api';

export class CookieAuthService {
  private csrfToken: string | null = null;
  private user: User | null = null;
  
  constructor() {
    // Check if we should use cookie-based auth
    this.checkAuthMethod();
  }
  
  private async checkAuthMethod(): Promise<boolean> {
    try {
      const response = await apiService.get<{
        method: 'cookie' | 'token';
        supportsCookies: boolean;
        supportsTokens: boolean;
        csrfRequired: boolean;
      }>('/auth/method');
      
      if (response.success && ((response as any).data)) {
        return ((response as any).data).method === 'cookie';
      }
    } catch (error) {
      console.error('Failed to check auth method:', error);
    }
    return false;
  }
  
  async login(credentials: LoginRequest): Promise<ApiResponse<{
    user: User;
    csrfToken: string;
    accessToken?: string;
    refreshToken?: string;
  }>> {
    // Set header to indicate we accept cookies
    const originalHeaders = (apiService as any).client.defaults.headers.common;
    (apiService as any).client.defaults.headers.common['X-Accept-Cookies'] = 'true';
    
    try {
      const response = await apiService.post<{
        user: User;
        csrfToken: string;
        accessToken?: string;
        refreshToken?: string;
      }>('/auth/login', credentials);
      
      if (response.success && ((response as any).data)) {
        // Store CSRF token for future requests
        this.csrfToken = ((response as any).data).csrfToken;
        this.user = ((response as any).data).user;
        
        // Store user in sessionStorage for page refreshes
        sessionStorage.setItem('user', JSON.stringify(((response as any).data).user));
        
        // For migration support, also store tokens if returned
        if (((response as any).data).accessToken && ((response as any).data).refreshToken) {
          localStorage.setItem('accessToken', ((response as any).data).accessToken);
          localStorage.setItem('refreshToken', ((response as any).data).refreshToken);
          localStorage.setItem('user', JSON.stringify(((response as any).data).user));
        }
      }
      
      return response;
    } finally {
      // Restore original headers
      (apiService as any).client.defaults.headers.common = originalHeaders;
    }
  }

  async logout(): Promise<ApiResponse> {
    try {
      const response = await apiService.post('/auth/logout');
      
      // Clear all auth data
      this.csrfToken = null;
      this.user = null;
      sessionStorage.removeItem('user');
      
      // Also clear localStorage for migration support
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      
      return response;
    } catch (error) {
      // Still clear local data on error
      this.csrfToken = null;
      this.user = null;
      sessionStorage.removeItem('user');
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      throw error;
    }
  }

  async refreshToken(): Promise<ApiResponse<{
    csrfToken: string;
    user?: User;
    accessToken?: string;
    refreshToken?: string;
  }>> {
    // Set header to indicate we're using cookies
    const originalHeaders = (apiService as any).client.defaults.headers.common;
    (apiService as any).client.defaults.headers.common['X-Accept-Cookies'] = 'true';
    
    try {
      // For cookie-based auth, we don't need to send the refresh token
      const response = await apiService.post<{
        csrfToken: string;
        user?: User;
        accessToken?: string;
        refreshToken?: string;
      }>('/auth/refresh', {});
      
      if (response.success && ((response as any).data)) {
        // Update CSRF token
        this.csrfToken = ((response as any).data).csrfToken;
        
        // Update user if returned
        if (((response as any).data).user) {
          this.user = ((response as any).data).user;
          sessionStorage.setItem('user', JSON.stringify(((response as any).data).user));
        }
        
        // For migration support, update tokens if returned
        if (((response as any).data).accessToken && ((response as any).data).refreshToken) {
          localStorage.setItem('accessToken', ((response as any).data).accessToken);
          localStorage.setItem('refreshToken', ((response as any).data).refreshToken);
        }
      }
      
      return response;
    } finally {
      // Restore original headers
      (apiService as any).client.defaults.headers.common = originalHeaders;
    }
  }

  async getProfile(): Promise<ApiResponse<{ user: User }>> {
    const response = await apiService.get<{ user: User }>('/auth/profile');
    
    if (response.success && ((response as any).data)) {
      this.user = ((response as any).data).user;
      sessionStorage.setItem('user', JSON.stringify(((response as any).data).user));
    }
    
    return response;
  }

  async updateProfile(profile: Partial<User>): Promise<ApiResponse<{ user: User }>> {
    const response = await apiService.put<{ user: User }>('/auth/profile', profile);
    
    if (response.success && ((response as any).data)) {
      this.user = ((response as any).data).user;
      sessionStorage.setItem('user', JSON.stringify(((response as any).data).user));
    }
    
    return response;
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<ApiResponse> {
    return apiService.post('/auth/change-password', {
      currentPassword,
      newPassword
    });
  }

  // Get current auth state
  getCurrentAuthState(): AuthState {
    // Try to get user from memory first
    if (!this.user) {
      // Try sessionStorage for page refreshes
      const userStr = sessionStorage.getItem('user');
      if (userStr) {
        this.user = JSON.parse(userStr);
      } else {
        // Fall back to localStorage for migration support
        const localUserStr = localStorage.getItem('user');
        if (localUserStr) {
          this.user = JSON.parse(localUserStr);
        }
      }
    }
    
    return {
      user: this.user,
      token: null, // Tokens are in HTTP-only cookies
      refreshToken: null,
      isAuthenticated: !!this.user,
      isLoading: false,
      error: null
    };
  }

  // Get CSRF token for API requests
  getCSRFToken(): string | null {
    // First check memory
    if (this.csrfToken) {
      return this.csrfToken;
    }
    
    // Try to get from cookie (if not HTTP-only)
    const match = document.cookie.match(/reporting_csrf_token=([^;]+)/);
    if (match) {
      this.csrfToken = match[1];
      return this.csrfToken;
    }
    
    return null;
  }

  // Check if user has specific permission
  hasPermission(permission: string): boolean {
    const user = this.getCurrentAuthState().user;
    if (!user) return false;
    
    return user.permissions?.includes(permission) || false;
  }

  // Check if user has specific role
  hasRole(role: string): boolean {
    const user = this.getCurrentAuthState().user;
    if (!user) return false;
    
    return user.roles?.includes(role) || false;
  }

  // Check if user is admin
  isAdmin(): boolean {
    const user = this.getCurrentAuthState().user;
    return user?.isAdmin || false;
  }

  // Get user's authentication source
  getAuthSource(): 'ad' | 'azure' | 'local' | null {
    const user = this.getCurrentAuthState().user;
    return user?.authSource || null;
  }

  // Check if we're using cookie-based auth
  isUsingCookies(): boolean {
    // Check for the absence of tokens in localStorage
    return !localStorage.getItem('accessToken') && !!this.user;
  }

  // Setup automatic token refresh (if needed)
  setupTokenRefresh(): void {
    // For cookie-based auth, we rely on the server to handle token expiry
    // The middleware will suggest refresh when needed via X-Token-Refresh-Suggested header
    console.log('Cookie-based auth: Token refresh handled by server');
  }

  // Handle auth state changes (for React components)
  onAuthStateChange(callback: (state: AuthState) => void): () => void {
    // Simple implementation - in production, use event emitter or observable
    const interval = setInterval(() => {
      callback(this.getCurrentAuthState());
    }, 1000);
    
    return () => clearInterval(interval);
  }

  // Verify current authentication status
  async verify(): Promise<boolean> {
    try {
      const response = await apiService.get<{
        valid: boolean;
        user?: User;
      }>('/auth/verify');
      
      if (response.success && ((response as any).data)) {
        if (((response as any).data).valid && ((response as any).data).user) {
          this.user = ((response as any).data).user;
          sessionStorage.setItem('user', JSON.stringify(((response as any).data).user));
          return true;
        }
      }
    } catch (error) {
      console.error('Auth verification failed:', error);
    }
    
    // Clear auth state if verification fails
    this.csrfToken = null;
    this.user = null;
    sessionStorage.removeItem('user');
    return false;
  }

  // Logout from all sessions
  async logoutAll(): Promise<ApiResponse> {
    try {
      const response = await apiService.post('/auth/logout-all');
      
      // Clear all auth data
      this.csrfToken = null;
      this.user = null;
      sessionStorage.removeItem('user');
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      
      return response;
    } catch (error) {
      // Still clear local data on error
      this.csrfToken = null;
      this.user = null;
      sessionStorage.removeItem('user');
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      throw error;
    }
  }
}

// Export singleton instance
export const cookieAuthService = new CookieAuthService();
export default cookieAuthService;