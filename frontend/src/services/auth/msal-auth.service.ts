 
 
 
/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  PublicClientApplication,
  InteractionType,
  AccountInfo,
  AuthenticationResult,
  InteractionRequiredAuthError,
  SilentRequest,
  RedirectRequest,
  PopupRequest,
  EndSessionRequest,
} from '@azure/msal-browser';
import { msalConfig, loginRequest } from '@/config/msal.config';

export class MsalAuthService {
  private msalInstance: PublicClientApplication;
  private account: AccountInfo | null = null;
  private initPromise: Promise<void> | null = null;

  constructor() {
    this.msalInstance = new PublicClientApplication(msalConfig);
  }

  /**
   * Initialize MSAL instance
   */
  async initialize(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.msalInstance.initialize().then(() => {
      // Handle redirect promise
      return this.msalInstance.handleRedirectPromise().then((response) => {
        if (response) {
          this.account = response.account;
        } else {
          // Check if user is already signed in
          const accounts = this.msalInstance.getAllAccounts();
          if (accounts.length > 0) {
            this.account = accounts[0];
          }
        }
      });
    });

    return this.initPromise;
  }

  /**
   * Get the current account
   */
  getAccount(): AccountInfo | null {
    if (!this.account) {
      const accounts = this.msalInstance.getAllAccounts();
      if (accounts.length > 0) {
        this.account = accounts[0];
      }
    }
    return this.account;
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.getAccount() !== null;
  }

  /**
   * Login with popup
   */
  async loginWithPopup(scopes?: string[]): Promise<AuthenticationResult> {
    try {
      const popupRequest: PopupRequest = {
        ...loginRequest,
        scopes: scopes || loginRequest.scopes,
      };

      const response = await this.msalInstance.loginPopup(popupRequest);
      this.account = response.account;
      
      // Send token to backend for secure storage
      await this.sendTokenToBackend(response.accessToken);
      
      return response;
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  }

  /**
   * Login with redirect
   */
  async loginWithRedirect(scopes?: string[]): Promise<void> {
    const redirectRequest: RedirectRequest = {
      ...loginRequest,
      scopes: scopes || loginRequest.scopes,
    };

    await this.msalInstance.loginRedirect(redirectRequest);
  }

  /**
   * Acquire token silently
   */
  async acquireTokenSilent(scopes: string[]): Promise<string> {
    const account = this.getAccount();
    if (!account) {
      throw new Error('No account found');
    }

    const silentRequest: SilentRequest = {
      scopes,
      account,
      forceRefresh: false,
    };

    try {
      const response = await this.msalInstance.acquireTokenSilent(silentRequest);
      return response.accessToken;
    } catch (error) {
      if (error instanceof InteractionRequiredAuthError) {
        // Fallback to interactive
        return this.acquireTokenPopup(scopes);
      }
      throw error;
    }
  }

  /**
   * Acquire token with popup
   */
  async acquireTokenPopup(scopes: string[]): Promise<string> {
    const popupRequest: PopupRequest = {
      scopes,
      account: this.getAccount() || undefined,
    };

    try {
      const response = await this.msalInstance.acquireTokenPopup(popupRequest);
      return response.accessToken;
    } catch (error) {
      console.error('Token acquisition failed:', error);
      throw error;
    }
  }

  /**
   * Logout
   */
  async logout(): Promise<void> {
    const account = this.getAccount();
    if (account) {
      const logoutRequest: EndSessionRequest = {
        account,
        postLogoutRedirectUri: msalConfig.auth.postLogoutRedirectUri,
      };

      // Clear backend session first
      try {
        await this.clearBackendSession();
      } catch (error) {
        console.error('Failed to clear backend session:', error);
      }

      // Logout from MSAL
      await this.msalInstance.logoutPopup(logoutRequest);
      this.account = null;
    }
  }

  /**
   * Get all accounts
   */
  getAllAccounts(): AccountInfo[] {
    return this.msalInstance.getAllAccounts();
  }

  /**
   * Set active account
   */
  setActiveAccount(account: AccountInfo | null): void {
    this.account = account;
    if (account) {
      this.msalInstance.setActiveAccount(account);
    }
  }

  /**
   * Send token to backend for secure storage
   */
  private async sendTokenToBackend(accessToken: string): Promise<void> {
    try {
      // Send the Azure access token to backend with cookie-based auth
      const response = await fetch('/api/auth/azure/store-token', {
        method: 'POST',
        credentials: 'include', // Include cookies for authentication
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`, // Azure AD access token
        },
        body: JSON.stringify({
          service: 'azure',
          tokenType: 'delegated',
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('Failed to store token on backend:', errorData);
        throw new Error('Failed to store Azure AD token');
      }
    } catch (error) {
      console.error('Failed to send token to backend:', error);
    }
  }

  /**
   * Clear backend session
   */
  private async clearBackendSession(): Promise<void> {
    try {
      await fetch('/api/auth/azure/logout', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
      });
    } catch (error) {
      console.error('Failed to clear backend session:', error);
    }
  }

  /**
   * Get MSAL instance (for provider)
   */
  getMsalInstance(): PublicClientApplication {
    return this.msalInstance;
  }
}

// Export singleton instance
export const msalAuthService = new MsalAuthService();