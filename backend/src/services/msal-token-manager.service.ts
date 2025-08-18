import { ConfidentialClientApplication, ClientCredentialRequest, OnBehalfOfRequest, RefreshTokenRequest, AuthenticationResult } from '@azure/msal-node';
import { logger } from '@/utils/logger';
import { cryptoService } from './crypto.service';
import { azureCredentialService } from '@/auth/services/azure-credential.service';
import { redis } from '@/config/redis';

interface TokenCacheEntry {
  accessToken: string;
  expiresAt: Date;
  scope: string;
}

export class MsalTokenManager {
  private msalClient: ConfidentialClientApplication;
  private readonly TOKEN_CACHE_PREFIX = 'msal:token:';
  private readonly REFRESH_WINDOW = 5 * 60 * 1000; // 5 minutes before expiry

  constructor() {
    this.msalClient = new ConfidentialClientApplication({
      auth: {
        clientId: process.env.AZURE_CLIENT_ID!,
        authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
        clientSecret: process.env.AZURE_CLIENT_SECRET!,
      },
      system: {
        loggerOptions: {
          loggerCallback: (level, message, containsPii) => {
            if (!containsPii) {
              logger.debug(`MSAL: ${message}`);
            }
          },
          piiLoggingEnabled: false,
          logLevel: 3, // Info level
        },
      },
    });
  }

  /**
   * Get app-only access token using client credentials
   */
  async getAppOnlyToken(scopes: string[] = ['https://graph.microsoft.com/.default']): Promise<string> {
    const cacheKey = `${this.TOKEN_CACHE_PREFIX}app:${scopes.join(',')}`;
    
    // Check cache first
    const cached = await this.getCachedToken(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const request: ClientCredentialRequest = {
        scopes,
        skipCache: false,
      };

      const response = await this.msalClient.acquireTokenByClientCredential(request);
      
      if (!response) {
        throw new Error('No response from MSAL client credential flow');
      }

      // Cache the token
      await this.cacheToken(cacheKey, response);
      
      logger.info('App-only token acquired successfully');
      return response.accessToken;
    } catch (error) {
      logger.error('Failed to acquire app-only token:', error);
      throw error;
    }
  }

  /**
   * Get delegated access token for a user
   */
  async getDelegatedToken(userId: number, scopes: string[]): Promise<string> {
    const cacheKey = `${this.TOKEN_CACHE_PREFIX}user:${userId}:${scopes.join(',')}`;
    
    // Check cache first
    const cached = await this.getCachedToken(cacheKey);
    if (cached) {
      return cached;
    }

    // Get stored credentials
    const credentials = await azureCredentialService.getCredentials(userId);
    if (!credentials) {
      throw new Error('No stored credentials found for user');
    }

    // Check if token needs refresh
    if (this.shouldRefreshToken(credentials.expiresAt)) {
      if (credentials.refreshToken) {
        return await this.refreshDelegatedToken(userId, credentials.refreshToken, scopes);
      }
    }

    return credentials.accessToken;
  }

  /**
   * Get on-behalf-of token
   */
  async getOnBehalfOfToken(userAccessToken: string, scopes: string[]): Promise<string> {
    try {
      const request: OnBehalfOfRequest = {
        oboAssertion: userAccessToken,
        scopes,
      };

      const response = await this.msalClient.acquireTokenOnBehalfOf(request);
      
      if (!response) {
        throw new Error('No response from MSAL on-behalf-of flow');
      }

      logger.info('On-behalf-of token acquired successfully');
      return response.accessToken;
    } catch (error) {
      logger.error('Failed to acquire on-behalf-of token:', error);
      throw error;
    }
  }

  /**
   * Refresh delegated token
   */
  private async refreshDelegatedToken(userId: number, refreshToken: string, scopes: string[]): Promise<string> {
    try {
      const request: RefreshTokenRequest = {
        refreshToken,
        scopes,
        forceCache: false,
      };

      const response = await this.msalClient.acquireTokenByRefreshToken(request);
      
      if (!response) {
        throw new Error('No response from MSAL refresh token flow');
      }

      // Encrypt and store new tokens
      const encryptedAccess = await cryptoService.encryptToken(response.accessToken, userId);
      // Note: MSAL doesn't expose refresh tokens directly
      const encryptedRefresh = undefined;

      await azureCredentialService.storeCredentials(userId, {
        access_token_encrypted: encryptedAccess,
        refresh_token_encrypted: encryptedRefresh,
        expires_at: response.expiresOn || new Date(Date.now() + 3600000),
        token_type: response.tokenType,
        scope: response.scopes.join(' '),
      });

      // Cache the new token
      const cacheKey = `${this.TOKEN_CACHE_PREFIX}user:${userId}:${scopes.join(',')}`;
      await this.cacheToken(cacheKey, response);

      logger.info(`Token refreshed successfully for user ${userId}`);
      return response.accessToken;
    } catch (error) {
      logger.error('Failed to refresh token:', error);
      throw error;
    }
  }

  /**
   * Check if token should be refreshed
   */
  private shouldRefreshToken(expiresAt: Date): boolean {
    const now = new Date();
    const expiryTime = new Date(expiresAt);
    const timeUntilExpiry = expiryTime.getTime() - now.getTime();
    
    return timeUntilExpiry <= this.REFRESH_WINDOW;
  }

  /**
   * Cache token with TTL
   */
  private async cacheToken(key: string, response: AuthenticationResult): Promise<void> {
    const expiresAt = response.expiresOn || new Date(Date.now() + 3600000);
    const ttl = Math.floor((expiresAt.getTime() - Date.now()) / 1000 * 0.9); // Cache for 90% of token lifetime

    const cacheEntry: TokenCacheEntry = {
      accessToken: response.accessToken,
      expiresAt,
      scope: response.scopes.join(' '),
    };

    await redis.setJson(key, cacheEntry, ttl);
  }

  /**
   * Get cached token if valid
   */
  private async getCachedToken(key: string): Promise<string | null> {
    const cached = await redis.getJson<TokenCacheEntry>(key);
    
    if (!cached) {
      return null;
    }

    // Check if token is still valid
    if (new Date() >= new Date(cached.expiresAt)) {
      await redis.del(key);
      return null;
    }

    return cached.accessToken;
  }

  /**
   * Clear token cache for a user
   */
  async clearUserTokenCache(userId: number): Promise<void> {
    const pattern = `${this.TOKEN_CACHE_PREFIX}user:${userId}:*`;
    await redis.invalidatePattern(pattern);
    logger.info(`Token cache cleared for user ${userId}`);
  }

  /**
   * Clear all token cache
   */
  async clearAllTokenCache(): Promise<void> {
    const pattern = `${this.TOKEN_CACHE_PREFIX}*`;
    await redis.invalidatePattern(pattern);
    logger.info('All token cache cleared');
  }

  /**
   * Get token cache statistics
   */
  async getTokenCacheStats(): Promise<{
    totalCached: number;
    appTokens: number;
    userTokens: number;
  }> {
    const allKeys = await redis.keys(`${this.TOKEN_CACHE_PREFIX}*`);
    const appKeys = allKeys.filter(k => k.includes(':app:'));
    const userKeys = allKeys.filter(k => k.includes(':user:'));

    return {
      totalCached: allKeys.length,
      appTokens: appKeys.length,
      userTokens: userKeys.length,
    };
  }
}

// Export singleton instance
export const msalTokenManager = new MsalTokenManager();