/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { MsalProvider } from '@azure/msal-react';
import { IPublicClientApplication, AccountInfo } from '@azure/msal-browser';
import { msalAuthService } from '@/services/auth/msal-auth.service';
import { validateMsalConfig } from '@/config/msal.config';
import { Alert, Spin } from 'antd';

interface MsalAuthContextType {
  instance: IPublicClientApplication;
  account: AccountInfo | null;
  isAuthenticated: boolean;
  isInitialized: boolean;
  login: (scopes?: string[]) => Promise<void>;
  logout: () => Promise<void>;
  acquireToken: (scopes: string[]) => Promise<string>;
}

const MsalAuthContext = createContext<MsalAuthContextType | undefined>(undefined);

interface MsalAuthProviderProps {
  children: ReactNode;
}

export const MsalAuthProvider: React.FC<MsalAuthProviderProps> = ({ children }) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        // Validate configuration
        const configValidation = validateMsalConfig();
        if (!configValidation.valid) {
          setError(`MSAL configuration errors: ${configValidation.errors.join(', ')}`);
          return;
        }

        // Initialize MSAL
        await msalAuthService.initialize();
        
        // Get current account
        const currentAccount = msalAuthService.getAccount();
        setAccount(currentAccount);
        
        setIsInitialized(true);
      } catch (err) {
        console.error('Failed to initialize MSAL:', err);
        setError('Failed to initialize authentication. Please check your configuration.');
      }
    };

    init();
  }, []);

  const login = async (scopes?: string[]) => {
    try {
      const result = await msalAuthService.loginWithPopup(scopes);
      setAccount(result.account);
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await msalAuthService.logout();
      setAccount(null);
    } catch (error) {
      console.error('Logout failed:', error);
      throw error;
    }
  };

  const acquireToken = async (scopes: string[]): Promise<string> => {
    try {
      return await msalAuthService.acquireTokenSilent(scopes);
    } catch (error) {
      console.error('Token acquisition failed:', error);
      throw error;
    }
  };

  const contextValue: MsalAuthContextType = {
    instance: msalAuthService.getMsalInstance(),
    account,
    isAuthenticated: !!account,
    isInitialized,
    login,
    logout,
    acquireToken,
  };

  if (error) {
    return (
      <div style={{ padding: '20px' }}>
        <Alert
          message="Authentication Configuration Error"
          description={error}
          type="error"
          showIcon
        />
      </div>
    );
  }

  if (!isInitialized) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh' 
      }}>
        <Spin size="large" tip="Initializing authentication..." />
      </div>
    );
  }

  return (
    <MsalProvider instance={msalAuthService.getMsalInstance()}>
      <MsalAuthContext.Provider value={contextValue}>
        {children}
      </MsalAuthContext.Provider>
    </MsalProvider>
  );
};

// Custom hook to use MSAL auth context
export const useMsalAuth = () => {
  const context = useContext(MsalAuthContext);
  if (context === undefined) {
    throw new Error('useMsalAuth must be used within a MsalAuthProvider');
  }
  return context;
};