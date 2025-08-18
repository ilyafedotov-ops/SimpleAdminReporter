import { Request, Response } from 'express';
import { ConfidentialClientApplication, AuthorizationCodeRequest } from '@azure/msal-node';
import { logger } from '@/utils/logger';
import { createError } from '@/middleware/error.middleware';
import { db } from '@/config/database';
import { cryptoService } from '@/services/crypto.service';

/**
 * Azure OAuth Controller
 * Handles OAuth authentication flow for Azure AD
 */
class AzureOAuthController {
  private msalClient: ConfidentialClientApplication;

  constructor() {
    const msalConfig = {
      auth: {
        clientId: process.env.AZURE_CLIENT_ID!,
        authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
        clientSecret: process.env.AZURE_CLIENT_SECRET!,
      },
    };

    this.msalClient = new ConfidentialClientApplication(msalConfig);
  }

  /**
   * Initiate OAuth flow
   */
  authorize = async (req: Request, res: Response) => {
    try {
      // Get userId from authenticated user (requireAuth middleware ensures this exists)
      const userId = (req as any).user?.id;
      const { credentialName } = req.query;

      logger.info('User object in authorize:', { user: (req as any).user });
      
      if (!userId || typeof userId !== 'number') {
        throw createError('User must be authenticated and have a valid ID to initiate OAuth flow', 401);
      }
      
      logger.info('Starting OAuth flow for user', { userId, credentialName });
      
      const authCodeUrlParameters = {
        scopes: ['https://graph.microsoft.com/.default', 'offline_access'],
        redirectUri: `${process.env.BASE_URL || 'http://localhost'}/api/auth/azure/callback`,
        state: JSON.stringify({ 
          userId: userId.toString(), 
          credentialName: credentialName || 'Azure AD OAuth' 
        }),
      };

      const authUrl = await this.msalClient.getAuthCodeUrl(authCodeUrlParameters);
      res.redirect(authUrl);
    } catch (error) {
      logger.error('Azure OAuth authorization error:', error);
      res.status(500).json({
        error: 'Failed to initiate OAuth flow',
        message: error instanceof Error ? ((error as any)?.message || String(error)) : 'Unknown error'
      });
    }
  };

  /**
   * Handle OAuth callback
   */
  callback = async (req: Request, res: Response) => {
    try {
      const { code, state } = req.query;
      
      if (!code || typeof code !== 'string') {
        throw createError('Authorization code not provided', 400);
      }

      // Parse state
      let stateData: any = {};
      try {
        stateData = state ? JSON.parse(decodeURIComponent(state as string)) : {};
      } catch (parseError) {
        logger.error('Failed to parse OAuth state:', parseError);
        throw createError('Invalid state parameter', 400);
      }
      
      // Handle null or undefined userId
      const userIdValue = stateData.userId;
      if (userIdValue === null || userIdValue === undefined || userIdValue === 'null') {
        logger.error('Invalid userId in OAuth state:', { stateData, userIdValue });
        throw createError('User authentication required. Please ensure you are logged in before authorizing Azure AD.', 401);
      }
      
      const userId = parseInt(userIdValue);
      const credentialName = stateData.credentialName || 'Azure AD OAuth';

      if (!userId || isNaN(userId)) {
        logger.error('Invalid userId after parsing:', { userIdValue, userId });
        throw createError('Invalid user ID in state parameter', 400);
      }

      // Log OAuth callback details
      logger.info('OAuth callback received:', {
        hasCode: !!code,
        hasState: !!state,
        userId,
        credentialName,
        timestamp: new Date().toISOString()
      });

      // Exchange code for tokens
      const tokenRequest: AuthorizationCodeRequest = {
        code,
        scopes: ['https://graph.microsoft.com/.default', 'offline_access'],
        redirectUri: `${process.env.BASE_URL || 'http://localhost'}/api/auth/azure/callback`,
      };

      const response = await this.msalClient.acquireTokenByCode(tokenRequest);
      
      if (!response) {
        throw createError('Failed to acquire tokens', 500);
      }

      // Store tokens in database
      const client = await db.getClient();
      try {
        await client.query('BEGIN');

        // Check if user already has Azure credentials
        const existingCreds = await client.query(
          'SELECT id FROM service_credentials WHERE user_id = $1 AND service_type = $2 AND credential_name = $3',
          [userId, 'azure', credentialName]
        );

        // Encrypt tokens
        const encryptedAccessToken = await cryptoService.encryptToken(response.accessToken, userId);
        // In MSAL v2, refresh tokens are managed internally
        // We'll store a flag indicating OAuth was used
        const oauthMetadata = {
          authMethod: 'oauth',
          tokenAcquiredAt: new Date().toISOString(),
          expiresOn: response.expiresOn ? response.expiresOn.toISOString() : null,
          scopes: response.scopes.join(' ')
        };

        if (existingCreds.rows.length > 0) {
          // Update existing credentials
          await client.query(`
            UPDATE service_credentials 
            SET 
              access_token_encrypted = $1::jsonb,
              refresh_token_encrypted = $2::jsonb,
              tenant_id = $3,
              client_id = $4,
              expires_at = $5,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = $6
          `, [
            JSON.stringify(encryptedAccessToken),
            JSON.stringify(oauthMetadata),
            process.env.AZURE_TENANT_ID,
            process.env.AZURE_CLIENT_ID,
            response.expiresOn,
            existingCreds.rows[0].id
          ]);
        } else {
          // Insert new credentials
          await client.query(`
            INSERT INTO service_credentials (
              user_id, service_type, credential_name, tenant_id, client_id,
              access_token_encrypted, refresh_token_encrypted,
              expires_at, is_default, is_active, encryption_version
            ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10, $11)
          `, [
            userId,
            'azure',
            credentialName,
            process.env.AZURE_TENANT_ID,
            process.env.AZURE_CLIENT_ID,
            JSON.stringify(encryptedAccessToken),
            JSON.stringify(oauthMetadata),
            response.expiresOn,
            false,
            true,
            'v1' // Use standard encryption version
          ]);
        }

        await client.query('COMMIT');

        // Log success
        logger.info('Azure OAuth tokens stored successfully', {
          userId,
          credentialName,
          authMethod: 'oauth',
          expiresOn: response.expiresOn
        });

        // Close the OAuth window and notify the parent
        res.send(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Authentication Successful</title>
              <style>
                body {
                  font-family: Arial, sans-serif;
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  height: 100vh;
                  margin: 0;
                  background-color: #f0f2f5;
                }
                .container {
                  text-align: center;
                  padding: 40px;
                  background: white;
                  border-radius: 8px;
                  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
                }
                h1 { color: #52c41a; }
                p { color: #666; margin: 20px 0; }
              </style>
            </head>
            <body>
              <div class="container">
                <h1>✓ Authentication Successful!</h1>
                <p>You have successfully authenticated with Azure AD.</p>
                <p>You can now close this window.</p>
              </div>
              <script>
                // Notify parent window
                if (window.opener) {
                  window.opener.postMessage({ 
                    type: 'azure-auth-success',
                    userId: ${userId}
                  }, window.location.origin);
                }
                // Close window after 2 seconds
                setTimeout(() => window.close(), 2000);
              </script>
            </body>
          </html>
        `);

      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

    } catch (error) {
      logger.error('Azure OAuth callback error:', error);
      
      // Return error page
      res.status(500).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Authentication Failed</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
                background-color: #f0f2f5;
              }
              .container {
                text-align: center;
                padding: 40px;
                background: white;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
              }
              h1 { color: #ff4d4f; }
              p { color: #666; margin: 20px 0; }
              .error { 
                background: #fff2f0; 
                border: 1px solid #ffccc7; 
                padding: 10px; 
                border-radius: 4px;
                margin-top: 20px;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>✗ Authentication Failed</h1>
              <p>There was an error during authentication.</p>
              <div class="error">${error instanceof Error ? ((error as any)?.message || String(error)) : 'Unknown error'}</div>
              ${error instanceof Error && ((error as any)?.message || String(error)).includes('User authentication required') ? 
                '<p><strong>It appears you are not logged in or your session has expired.</strong></p>' +
                '<p>Please:</p>' +
                '<ol>' +
                '<li>Close this window</li>' +
                '<li>Log in to the application again</li>' +
                '<li>Generate a new OAuth authorization link</li>' +
                '</ol>' +
                '<p style="color: #666; font-size: 0.9em;">Note: Do not refresh this page or use bookmarked OAuth URLs.</p>'
                : 
                '<p>Please close this window and try again.</p>'
              }
            </div>
            <script>
              // Notify parent window
              if (window.opener) {
                window.opener.postMessage({ 
                  type: 'azure-auth-error',
                  error: '${error instanceof Error ? ((error as any)?.message || String(error)) : 'Unknown error'}'
                }, window.location.origin);
              }
            </script>
          </body>
        </html>
      `);
    }
  };

  /**
   * Check OAuth status
   */
  checkStatus = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      
      if (!userId) {
        throw createError('User not authenticated', 401);
      }

      // Check if user has OAuth tokens
      const result = await db.query(
        `SELECT id, credential_name, tenant_id, client_id, 
         access_token_encrypted IS NOT NULL as has_token,
         refresh_token_encrypted IS NOT NULL as has_refresh_token
         FROM service_credentials 
         WHERE user_id = $1 AND service_type = 'azure' 
         AND access_token_encrypted IS NOT NULL
         ORDER BY updated_at DESC LIMIT 1`,
        [userId]
      );

      if (result.rows.length > 0) {
        const cred = result.rows[0];
        res.json({
          hasToken: true,
          credentialName: cred.credential_name,
          tenantId: cred.tenant_id,
          clientId: cred.client_id,
          hasRefreshToken: cred.has_refresh_token
        });
      } else {
        res.json({ hasToken: false });
      }

    } catch (error) {
      logger.error('Check OAuth status error:', error);
      res.status(500).json({
        error: 'Failed to check OAuth status',
        message: error instanceof Error ? ((error as any)?.message || String(error)) : 'Unknown error'
      });
    }
  };
}

export const azureOAuthController = new AzureOAuthController();