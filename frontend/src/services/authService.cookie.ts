import { ApiResponse } from '@/types';
import { User, LoginRequest, AuthState } from '@/types';
import apiService from './api';

// Define types for auth response data
interface AuthMethodResponse {
  method: 'cookie' | 'token';
  supportsCookies: boolean;
  supportsTokens: boolean;
  csrfRequired: boolean;
}

interface AuthResponseData {
  user: User;
  csrfToken: string;
  accessToken?: string;
  refreshToken?: string;
}

interface AuthVerifyData {
  valid: boolean;
  user?: User;
}

interface RefreshTokenData {
  csrfToken: string;
  user?: User;
  accessToken?: string;
  refreshToken?: string;
}

interface ProfileData {
  user: User;
}

export class CookieAuthService {
  private csrfToken: string | null = null;
  private user: User | null = null;
  
  constructor() {
    // Check if we should use cookie-based auth
    this.checkAuthMethod();
  }
  
  private async checkAuthMethod(): Promise<boolean> {
    try {
      const response = await apiService.get<AuthMethodResponse>('/auth/method');
      
      if (response.success && response.data) {
        return response.data.method === 'cookie';
      }
    } catch (error) {
      console.error('Failed to check auth method:', error);
    }
    return false;
  }
  
  async login(credentials: LoginRequest): Promise<ApiResponse<AuthResponseData>> {
    // Set header to indicate we accept cookies
    const originalHeaders = apiService['client'].defaults.headers.common;
    apiService['client'].defaults.headers.common['X-Accept-Cookies'] = 'true';
    
    try {
      const response = await apiService.post<AuthResponseData>('/auth/login', credentials);
      
      if (response.success && response.data) {
        const authData = response.data;
        // Store CSRF token for future requests
        this.csrfToken = authData.csrfToken;
        this.user = authData.user;
        
        // Store user in sessionStorage for page refreshes
        sessionStorage.setItem('user', JSON.stringify(authData.user));
        
        // For migration support, also store tokens if returned
        if (authData.accessToken && authData.refreshToken) {
          localStorage.setItem('accessToken', authData.accessToken);
          localStorage.setItem('refreshToken', authData.refreshToken);
          localStorage.setItem('user', JSON.stringify(authData.user));
        }
      }
      
      return response;
    } finally {
      // Restore original headers
      apiService['client'].defaults.headers.common = originalHeaders;
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

  async refreshToken(): Promise<ApiResponse<RefreshTokenData>> {
    // Set header to indicate we're using cookies
    const originalHeaders = apiService['client'].defaults.headers.common;
    apiService['client'].defaults.headers.common['X-Accept-Cookies'] = 'true';
    
    try {
      // For cookie-based auth, we don't need to send the refresh token
      const response = await apiService.post<RefreshTokenData>('/auth/refresh', {});
      
      if (response.success && response.data) {
        const refreshData = response.data;
        // Update CSRF token
        this.csrfToken = refreshData.csrfToken;
        
        // Update user if returned
        if (refreshData.user) {
          this.user = refreshData.user;
          sessionStorage.setItem('user', JSON.stringify(refreshData.user));
        }
        
        // For migration support, update tokens if returned
        if (refreshData.accessToken && refreshData.refreshToken) {
          localStorage.setItem('accessToken', refreshData.accessToken);
          localStorage.setItem('refreshToken', refreshData.refreshToken);
        }
      }
      
      return response;
    } finally {
      // Restore original headers
      apiService['client'].defaults.headers.common = originalHeaders;
    }
  }

  async getProfile(): Promise<ApiResponse<ProfileData>> {
    const response = await apiService.get<ProfileData>('/auth/profile');
    
    if (response.success && response.data) {
      const profileData = response.data;
      this.user = profileData.user;
      sessionStorage.setItem('user', JSON.stringify(profileData.user));
    }
    
    return response;
  }

  async updateProfile(profile: Partial<User>): Promise<ApiResponse<ProfileData>> {
    const response = await apiService.put<ProfileData>('/auth/profile', profile);
    
    if (response.success && response.data) {
      const profileData = response.data;
      this.user = profileData.user;
      sessionStorage.setItem('user', JSON.stringify(profileData.user));
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
      const response = await apiService.get<AuthVerifyData>('/auth/verify');
      
      if (response.success && response.data) {
        const verifyData = response.data;
        if (verifyData.valid && verifyData.user) {
          this.user = verifyData.user;
          sessionStorage.setItem('user', JSON.stringify(verifyData.user));
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