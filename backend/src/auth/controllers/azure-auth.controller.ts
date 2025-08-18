import { Request, Response } from 'express';
import { logger } from '@/utils/logger';
import { asyncHandler, createError } from '@/middleware/error.middleware';
import { cryptoService } from '@/services/crypto.service';
import { redisClient } from '@/services/redis.service';
import { unifiedAuthService } from '../services/unified-auth.service';

export class AzureAuthController {
  /**
   * Get Azure AD OAuth configuration (public config only)
   * GET /api/auth/azure/config
   */
  getAzurePublicConfig = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw createError('Authentication required', 401);
    }

    try {
      const config = {
        clientId: process.env.AZURE_CLIENT_ID,
        tenantId: process.env.AZURE_TENANT_ID,
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/auth/azure/callback`,
        scopes: ['https://graph.microsoft.com/.default', 'openid', 'profile', 'email']
        // NO CLIENT SECRET HERE - This is critical for security
      };

      if (!config.clientId || !config.tenantId) {
        throw createError('Azure AD configuration is incomplete', 500);
      }

      res.json({
        success: true,
        data: config
      });

    } catch (error) {
      logger.error('Failed to get Azure config:', error);
      throw error;
    }
  });

  /**
   * Generate authorization URL with PKCE
   * POST /api/auth/azure/authorize
   */
  generateAuthUrl = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw createError('Authentication required', 401);
    }

    const { scopes = ['https://graph.microsoft.com/.default'] } = req.body;

    try {
      // Generate PKCE parameters
      const state = cryptoService.generateSecureToken();
      const codeVerifier = cryptoService.generateCodeVerifier();
      const codeChallenge = cryptoService.generateCodeChallenge(codeVerifier);
      
      // Store PKCE verifier in Redis with 10 minute expiry
      const pkceKey = `pkce:${state}`;
      await redisClient.setex(pkceKey, 600, JSON.stringify({
        codeVerifier,
        userId: req.user.id,
        scopes,
        createdAt: new Date().toISOString()
      }));

      // Build authorization URL
      const authUrl = new URL(`https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/authorize`);
      authUrl.searchParams.append('client_id', process.env.AZURE_CLIENT_ID!);
      authUrl.searchParams.append('response_type', 'code');
      authUrl.searchParams.append('redirect_uri', `${process.env.BASE_URL || 'http://localhost:5000'}/auth/azure/callback`);
      authUrl.searchParams.append('scope', scopes.join(' '));
      authUrl.searchParams.append('state', state);
      authUrl.searchParams.append('code_challenge', codeChallenge);
      authUrl.searchParams.append('code_challenge_method', 'S256');
      authUrl.searchParams.append('prompt', 'select_account');

      logger.info(`Generated Azure auth URL for user ${req.user.username} with PKCE`);

      res.json({
        success: true,
        data: {
          authUrl: authUrl.toString(),
          state
        }
      });

    } catch (error) {
      logger.error('Failed to generate auth URL:', error);
      throw createError('Failed to generate authorization URL', 500);
    }
  });

  /**
   * Exchange authorization code for tokens with PKCE verification
   * POST /api/auth/azure/token
   */
  exchangeToken = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw createError('Authentication required', 401);
    }

    const { code, state } = req.body;
    if (!code || !state) {
      throw createError('Authorization code and state are required', 400);
    }

    try {
      // Retrieve and validate PKCE verifier
      const pkceKey = `pkce:${state}`;
      const pkceData = await redisClient.get(pkceKey);
      
      if (!pkceData) {
        throw createError('Invalid state or PKCE verifier expired', 400);
      }

      const { codeVerifier, userId } = JSON.parse(pkceData);
      
      // Verify the request is from the same user
      if (userId !== req.user.id) {
        throw createError('State mismatch - possible CSRF attack', 403);
      }

      // Exchange code for tokens
      const tokenData = await this.exchangeCodeForTokens(code, codeVerifier);
      
      // Clean up PKCE data
      await redisClient.del(pkceKey);
      
      // Encrypt and store tokens
      const encryptedAccess = await cryptoService.encryptToken(tokenData.access_token, req.user.id);
      const encryptedRefresh = tokenData.refresh_token 
        ? await cryptoService.encryptToken(tokenData.refresh_token, req.user.id)
        : null;

      // Store encrypted credentials
      await unifiedAuthService.storeAzureCredentials(req.user.id, {
        access_token_encrypted: encryptedAccess,
        refresh_token_encrypted: encryptedRefresh,
        expires_at: new Date(Date.now() + (tokenData.expires_in * 1000)),
        token_type: tokenData.token_type,
        scope: tokenData.scope
      }, tokenData.refresh_token);

      logger.info(`Azure tokens securely stored for user ${req.user.username}`);

      res.json({
        success: true,
        data: {
          message: 'Authentication successful',
          expiresAt: Date.now() + (tokenData.expires_in * 1000)
        }
      });

    } catch (error) {
      logger.error('Failed to exchange Azure token:', error);
      throw createError('Token exchange failed', 500);
    }
  });

  /**
   * Private method to exchange authorization code for tokens with PKCE
   */
  private async exchangeCodeForTokens(code: string, codeVerifier: string): Promise<any> {
    const tokenEndpoint = `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`;
    
    const body = new URLSearchParams({
      client_id: process.env.AZURE_CLIENT_ID!,
      client_secret: process.env.AZURE_CLIENT_SECRET!, // Backend only - never exposed
      grant_type: 'authorization_code',
      code: code,
      code_verifier: codeVerifier, // PKCE verification
      redirect_uri: `${process.env.BASE_URL || 'http://localhost:5000'}/auth/azure/callback`,
      scope: 'https://graph.microsoft.com/.default openid profile email'
    });

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });

    if (!response.ok) {
      const errorData = await response.text();
      logger.error('Token exchange failed:', errorData);
      throw new Error('Token exchange failed');
    }

    return await response.json();
  }

  /**
   * Store Azure credentials securely
   * POST /api/auth/azure/store-token
   */
  storeToken = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw createError('Authentication required', 401);
    }

    const authHeader = req.headers.authorization;
    const accessToken = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : undefined;

    if (!accessToken) {
      throw createError('Access token is required', 400);
    }

    const { service, tokenType } = req.body;
    if (service !== 'azure' || !tokenType) {
      throw createError('Invalid token storage request', 400);
    }

    try {
      // Verify token with Microsoft Graph
      const userInfo = await this.fetchUserInfoFromGraph(accessToken);
      
      // Encrypt token
      const encryptedToken = await cryptoService.encryptToken(accessToken, req.user.id);
      
      // Store encrypted token
      const credentialId = await unifiedAuthService.storeServiceCredentials(
        req.user.id,
        'azure',
        {
          access_token_encrypted: encryptedToken,
          token_type: tokenType,
          user_principal_name: userInfo.userPrincipalName,
          expires_at: new Date(Date.now() + 3600000) // 1 hour default
        }
      );

      logger.info(`Azure token securely stored for user ${req.user.username}`);

      res.json({
        success: true,
        data: { credentialId }
      });

    } catch (error) {
      logger.error('Failed to store Azure token:', error);
      throw createError('Failed to store token', 500);
    }
  });

  /**
   * Get decrypted access token for Graph API calls
   * Internal use only - not exposed as endpoint
   */
  async getAccessToken(userId: number): Promise<string | null> {
    try {
      const credentials = await unifiedAuthService.getAzureCredentials(userId);
      if (!credentials || !credentials.access_token_encrypted) {
        return null;
      }

      // Decrypt token
      const decryptedToken = await cryptoService.decryptToken(
        credentials.access_token_encrypted,
        userId
      );

      return decryptedToken;
    } catch (error) {
      logger.error('Failed to get access token:', error);
      return null;
    }
  }

  /**
   * Get Azure user information
   * GET /api/auth/azure/userinfo
   */
  getAzureUserInfo = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const authHeader = req.headers.authorization;
    const accessToken = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : undefined;

    if (!accessToken) {
      throw createError('Access token is required', 400);
    }

    try {
      // Get user info from Microsoft Graph
      const userInfo = await this.fetchUserInfoFromGraph(accessToken);

      res.json({
        success: true,
        data: userInfo
      });

    } catch (error) {
      logger.error('Failed to get Azure user info:', error);
      throw createError('Failed to get user information', 500);
    }
  });

  /**
   * Private method to fetch user info from Microsoft Graph
   */
  private async fetchUserInfoFromGraph(accessToken: string): Promise<any> {
    const response = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.text();
      logger.error('Failed to fetch user info from Graph:', errorData);
      throw new Error('Failed to fetch user info');
    }

    const userInfo: any = await response.json();
    
    return {
      displayName: userInfo.displayName,
      userPrincipalName: userInfo.userPrincipalName,
      mail: userInfo.mail || userInfo.userPrincipalName,
      id: userInfo.id
    };
  }
}

// Export singleton instance
export const azureAuthController = new AzureAuthController();