import { ApiResponse } from "@/types";
import { User, LoginRequest, AuthState } from "@/types";
import apiService from "./api";

// Define types for auth response data
interface AuthMethodResponse {
  method: "cookie" | "token";
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
  private tokenRefreshInterval: ReturnType<typeof setInterval> | null = null;

  private clearLocalAuthState(): void {
    this.csrfToken = null;
    this.user = null;
    sessionStorage.removeItem("user");
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");
  }

  private broadcastLogout(): void {
    localStorage.setItem("auth:logout", String(Date.now()));
  }

  private hasCrossTabLogout(): boolean {
    return (
      !!localStorage.getItem("auth:logout") &&
      !localStorage.getItem("user") &&
      !localStorage.getItem("accessToken")
    );
  }

  constructor() {
    // Check if we should use cookie-based auth
    this.checkAuthMethod();
  }

  private async checkAuthMethod(): Promise<boolean> {
    try {
      const response = await apiService.get<AuthMethodResponse>("/auth/method");

      if (response.success && response.data) {
        return response.data.method === "cookie";
      }
    } catch (error) {
      console.error("Failed to check auth method:", error);
    }
    return false;
  }

  async login(
    credentials: LoginRequest,
  ): Promise<ApiResponse<AuthResponseData>> {
    // Set header to indicate we accept cookies
    const originalHeaders = apiService["client"].defaults.headers.common;
    apiService["client"].defaults.headers.common["X-Accept-Cookies"] = "true";

    try {
      const response = await apiService.post<AuthResponseData>(
        "/auth/login",
        credentials,
      );

      if (response.success && response.data) {
        const authData = response.data;
        // Store CSRF token for future requests
        this.csrfToken = authData.csrfToken;
        this.user = authData.user;
        localStorage.removeItem("auth:logout");
        localStorage.removeItem("sessionId");

        // Store user in sessionStorage for page refreshes
        sessionStorage.setItem("user", JSON.stringify(authData.user));

        // For migration support, also store tokens if returned
        if (authData.accessToken && authData.refreshToken) {
          localStorage.setItem("accessToken", authData.accessToken);
          localStorage.setItem("refreshToken", authData.refreshToken);
          localStorage.setItem("user", JSON.stringify(authData.user));
        }
      }

      return response;
    } finally {
      // Restore original headers
      apiService["client"].defaults.headers.common = originalHeaders;
    }
  }

  async logout(): Promise<ApiResponse> {
    try {
      const response = await apiService.post("/auth/logout");

      this.clearLocalAuthState();
      this.broadcastLogout();

      return response;
    } catch (error) {
      this.clearLocalAuthState();
      this.broadcastLogout();
      throw error;
    }
  }

  async refreshToken(): Promise<ApiResponse<RefreshTokenData>> {
    // Set header to indicate we're using cookies
    const originalHeaders = apiService["client"].defaults.headers.common;
    apiService["client"].defaults.headers.common["X-Accept-Cookies"] = "true";

    try {
      // For cookie-based auth, we don't need to send the refresh token
      const response = await apiService.post<RefreshTokenData>(
        "/auth/refresh",
        {},
      );

      if (response.success && response.data) {
        const refreshData = response.data;
        // Update CSRF token
        this.csrfToken = refreshData.csrfToken;

        // Update user if returned
        if (refreshData.user) {
          this.user = refreshData.user;
          sessionStorage.setItem("user", JSON.stringify(refreshData.user));
        }

        // For migration support, update tokens if returned
        if (refreshData.accessToken && refreshData.refreshToken) {
          localStorage.setItem("accessToken", refreshData.accessToken);
          localStorage.setItem("refreshToken", refreshData.refreshToken);
        }
      }

      return response;
    } finally {
      // Restore original headers
      apiService["client"].defaults.headers.common = originalHeaders;
    }
  }

  async getProfile(): Promise<ApiResponse<ProfileData>> {
    const response = await apiService.get<ProfileData>("/auth/profile");

    if (response.success && response.data) {
      const profileData = response.data;
      this.user = profileData.user;
      sessionStorage.setItem("user", JSON.stringify(profileData.user));
    }

    return response;
  }

  async updateProfile(
    profile: Partial<User>,
  ): Promise<ApiResponse<ProfileData>> {
    const response = await apiService.put<ProfileData>(
      "/auth/profile",
      profile,
    );

    if (response.success && response.data) {
      const profileData = response.data;
      this.user = profileData.user;
      sessionStorage.setItem("user", JSON.stringify(profileData.user));
    }

    return response;
  }

  async changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<ApiResponse> {
    return apiService.post("/auth/change-password", {
      currentPassword,
      newPassword,
    });
  }

  // Get current auth state
  getCurrentAuthState(): AuthState {
    if (this.hasCrossTabLogout()) {
      this.clearLocalAuthState();
    }

    // Try to get user from memory first
    if (!this.user) {
      // Try sessionStorage for page refreshes
      const userStr = sessionStorage.getItem("user");
      if (userStr) {
        try {
          this.user = JSON.parse(userStr);
        } catch {
          sessionStorage.removeItem("user");
          localStorage.removeItem("user");
          localStorage.removeItem("authToken");
          localStorage.removeItem("isAuthenticated");
        }
      } else {
        // Fall back to localStorage for migration support
        const localUserStr = localStorage.getItem("user");
        if (localUserStr) {
          try {
            this.user = JSON.parse(localUserStr);
          } catch {
            localStorage.removeItem("user");
            localStorage.removeItem("authToken");
            localStorage.removeItem("isAuthenticated");
          }
        }
      }
    }

    return {
      user: this.user,
      token: null, // Tokens are in HTTP-only cookies
      refreshToken: null,
      isAuthenticated: !!this.user,
      isLoading: false,
      error: null,
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
  getAuthSource(): "ad" | "azure" | "local" | null {
    const user = this.getCurrentAuthState().user;
    return user?.authSource || null;
  }

  // Check if we're using cookie-based auth
  isUsingCookies(): boolean {
    // Check for the absence of tokens in localStorage
    return !localStorage.getItem("accessToken") && !!this.user;
  }

  // Setup automatic token refresh (if needed)
  setupTokenRefresh(): void {
    if (this.tokenRefreshInterval) {
      return;
    }

    const redirectToLogin = () => {
      this.clearLocalAuthState();
      this.broadcastLogout();
      if (window.location.pathname !== "/login") {
        window.history.replaceState(null, "", "/login");
        window.dispatchEvent(new window.PopStateEvent("popstate"));
      }
    };

    const checkTokenExpiry = async () => {
      const legacyAuthToken = localStorage.getItem("authToken");
      const accessToken = localStorage.getItem("accessToken");
      if (legacyAuthToken && legacyAuthToken !== accessToken) {
        redirectToLogin();
        return;
      }

      const tokenExpiry = Number(localStorage.getItem("tokenExpiry") || "0");
      if (!tokenExpiry || tokenExpiry > Date.now()) {
        return;
      }

      try {
        await this.refreshToken();
      } catch (error) {
        console.error("Cookie-based token refresh failed:", error);
        redirectToLogin();
      }
    };

    window.addEventListener("storage", (event) => {
      if (event.key === "auth:logout" && event.newValue) {
        redirectToLogin();
      }
    });

    // Cookie sessions are normally refreshed by the server via
    // X-Token-Refresh-Suggested. The local tokenExpiry hook keeps legacy token
    // migration flows and E2E session-expiry simulations at the auth transport
    // boundary instead of leaking them into UI code.
    void checkTokenExpiry();
    this.tokenRefreshInterval = setInterval(() => {
      void checkTokenExpiry();
    }, 1000);
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
      const response = await apiService.get<AuthVerifyData>("/auth/verify");

      if (response.success && response.data) {
        const verifyData = response.data;
        if (verifyData.valid && verifyData.user) {
          this.user = verifyData.user;
          sessionStorage.setItem("user", JSON.stringify(verifyData.user));
          return true;
        }
      }
    } catch (error) {
      console.error("Auth verification failed:", error);
    }

    // Clear auth state if verification fails
    this.csrfToken = null;
    this.user = null;
    sessionStorage.removeItem("user");
    return false;
  }

  // Logout from all sessions
  async logoutAll(): Promise<ApiResponse> {
    try {
      const response = await apiService.post("/auth/logout-all");

      // Clear all auth data
      this.csrfToken = null;
      this.user = null;
      sessionStorage.removeItem("user");
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      localStorage.removeItem("user");

      return response;
    } catch (error) {
      this.clearLocalAuthState();
      this.broadcastLogout();
      throw error;
    }
  }
}

// Export singleton instance
export const cookieAuthService = new CookieAuthService();
export default cookieAuthService;
