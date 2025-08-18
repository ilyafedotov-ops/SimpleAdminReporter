import { Request, Response } from 'express';
import { AuthRequest } from '@/types/express';
import { logger } from '@/utils/logger';
import { createError } from '@/middleware/error.middleware';
import { ConfidentialClientApplication } from '@azure/msal-node';

class AzureOAuthURLController {
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

  generateAuthUrl = async (req: Request, res: Response) => {
    try {
      // Cast to AuthRequest since requireAuth middleware ensures user exists
      const authReq = req as AuthRequest;
      
      // Log the entire user object to debug
      logger.info('=== OAuth URL Generation Request ===', {
        timestamp: new Date().toISOString(),
        user: authReq.user,
        headers: req.headers.authorization ? 'Bearer token present' : 'No auth header',
        query: req.query,
        ip: req.ip,
        userAgent: req.headers['user-agent']
      });
      
      const userId = authReq.user.id;
      const { credentialName } = req.query;

      if (!userId || typeof userId !== 'number') {
        logger.error('Invalid user authentication state:', {
          user: authReq.user,
          userId: userId,
          userIdType: typeof userId
        });
        throw createError('User must be authenticated and have a valid ID to initiate OAuth flow', 401);
      }

      logger.info('Generating OAuth URL for user:', { userId, credentialName });
      
      // Double-check userId is valid before proceeding
      if (!userId || userId === null || userId === undefined) {
        logger.error('Attempting to generate OAuth URL with invalid userId:', { userId });
        throw createError('Invalid user authentication state', 401);
      }
      
      const stateObject = { 
        userId: userId.toString(), 
        credentialName: credentialName || 'Azure AD OAuth' 
      };
      
      logger.info('OAuth state object:', stateObject);
      
      const authCodeUrlParameters = {
        scopes: ['https://graph.microsoft.com/.default', 'offline_access'],
        redirectUri: `${process.env.BASE_URL || 'http://localhost'}/api/auth/azure/callback`,
        state: JSON.stringify(stateObject),
      };

      const authUrl = await this.msalClient.getAuthCodeUrl(authCodeUrlParameters);
      
      // Log the generated URL (without sensitive data)
      const urlObj = new URL(authUrl);
      logger.info('Generated OAuth URL:', {
        host: urlObj.host,
        pathname: urlObj.pathname,
        hasState: urlObj.searchParams.has('state'),
        stateValue: urlObj.searchParams.get('state')
      });
      
      res.json({ authUrl });
    } catch (error) {
      logger.error('Azure OAuth authorization URL error:', error);
      res.status(500).json({
        error: 'Failed to generate OAuth authorization URL',
        message: error instanceof Error ? ((error as any)?.message || String(error)) : 'Unknown error'
      });
    }
  };
}

export const azureOAuthURLController = new AzureOAuthURLController();