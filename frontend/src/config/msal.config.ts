import { Configuration, LogLevel, BrowserCacheLocation } from '@azure/msal-browser';

/**
 * MSAL configuration for Azure AD authentication
 * This configuration uses the Authorization Code Flow with PKCE
 */
export const msalConfig: Configuration = {
  auth: {
    clientId: import.meta.env.VITE_AZURE_CLIENT_ID || '',
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_AZURE_TENANT_ID || 'common'}`,
    redirectUri: window.location.origin + '/auth/azure/callback',
    postLogoutRedirectUri: window.location.origin,
    navigateToLoginRequestUrl: false,
  },
  cache: {
    cacheLocation: BrowserCacheLocation.SessionStorage, // More secure than localStorage
    storeAuthStateInCookie: false, // Set to true for IE11 support
  },
  system: {
    loggerOptions: {
      loggerCallback: (level: LogLevel, message: string, containsPii: boolean) => {
        if (containsPii) {
          return;
        }
        switch (level) {
          case LogLevel.Error:
            console.error(message);
            return;
          case LogLevel.Info:
            console.info(message);
            return;
          case LogLevel.Verbose:
            console.debug(message);
            return;
          case LogLevel.Warning:
            console.warn(message);
            return;
          default:
            return;
        }
      },
      logLevel: import.meta.env.DEV ? LogLevel.Verbose : LogLevel.Warning,
    },
    // allowNativeBroker: false, // Disables WAM Broker - deprecated property
  },
};

/**
 * Scopes you add here will be prompted for user consent during sign-in.
 * By default, MSAL.js will add OIDC scopes (openid, profile, email) to any login request.
 */
export const loginRequest = {
  scopes: ['https://graph.microsoft.com/.default'],
  prompt: 'select_account', // Forces account selection even when one account is available
};

/**
 * Add here the endpoints and scopes for the Microsoft Graph API
 */
export const graphConfig = {
  graphMeEndpoint: 'https://graph.microsoft.com/v1.0/me',
  graphUsersEndpoint: 'https://graph.microsoft.com/v1.0/users',
  graphGroupsEndpoint: 'https://graph.microsoft.com/v1.0/groups',
};

/**
 * Scopes for accessing Microsoft Graph
 */
export const graphScopes = {
  user: {
    read: ['User.Read'],
    readAll: ['User.Read.All'],
  },
  group: {
    read: ['Group.Read.All'],
  },
  directory: {
    read: ['Directory.Read.All'],
  },
  reports: {
    read: ['Reports.Read.All'],
  },
  auditLog: {
    read: ['AuditLog.Read.All'],
  },
};

/**
 * Check if required environment variables are set
 */
export const validateMsalConfig = (): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  if (!import.meta.env.VITE_AZURE_CLIENT_ID) {
    errors.push('VITE_AZURE_CLIENT_ID is not set');
  }
  
  if (!import.meta.env.VITE_AZURE_TENANT_ID) {
    errors.push('VITE_AZURE_TENANT_ID is not set');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
};