import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button, Space } from 'antd';
import { AlertCircle, RefreshCw, Home, Bug } from 'lucide-react';

// Google Analytics type declaration
declare global {
  interface Window {
    gtag?: (
      command: string,
      eventName: string,
      parameters: {
        description: string;
        fatal: boolean;
        error_name: string;
      }
    ) => void;
  }
}

interface Props {
  children: ReactNode;
  darkMode: boolean;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
  errorCount: number;
}

export class LogsErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: undefined,
      errorInfo: undefined,
      errorCount: 0
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Update state so the next render will show the fallback UI
    return { 
      hasError: true, 
      error,
      errorCount: (localStorage.getItem('logsErrorCount') ? parseInt(localStorage.getItem('logsErrorCount')!) : 0) + 1
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error to console for debugging
    console.error('LogsErrorBoundary caught an error:', error, errorInfo);
    
    // Update error count in localStorage
    const currentCount = this.state.errorCount;
    localStorage.setItem('logsErrorCount', currentCount.toString());
    localStorage.setItem('lastLogsError', JSON.stringify({
      message: ((error as any)?.message || String(error)),
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString()
    }));
    
    // Call optional error handler
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
    
    // Log to external error tracking service if available
    if (window.gtag) {
      window.gtag('event', 'exception', {
        description: ((error as any)?.message || String(error)),
        fatal: false,
        error_name: 'LogsPageError'
      });
    }
  }

  handleReset = () => {
    // Clear error state
    this.setState({
      hasError: false,
      error: undefined,
      errorInfo: undefined
    });
    
    // Reset error count if successful
    localStorage.removeItem('logsErrorCount');
    localStorage.removeItem('lastLogsError');
  };

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/dashboard';
  };

  render() {
    const { darkMode } = this.props;
    const { hasError, error, errorCount } = this.state;

    if (hasError) {
      const isDevelopment = import.meta.env.DEV;
      
      return (
        <div style={{
          minHeight: 'calc(100vh - 64px)',
          background: darkMode ? '#1a1a1a' : '#f5f5f5',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px'
        }}>
          <div style={{
            maxWidth: '600px',
            width: '100%',
            textAlign: 'center',
            background: darkMode ? 'rgba(17, 24, 39, 0.5)' : 'rgba(255, 255, 255, 0.9)',
            backdropFilter: 'blur(20px)',
            borderRadius: '16px',
            padding: '48px',
            border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(229, 231, 235, 1)',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
          }}>
            <AlertCircle 
              size={64} 
              style={{ 
                color: '#ef4444',
                marginBottom: '24px'
              }} 
            />
            
            <h2 style={{
              fontSize: '24px',
              fontWeight: 'bold',
              marginBottom: '16px',
              color: darkMode ? 'white' : '#1f2937'
            }}>
              Oops! Something went wrong
            </h2>
            
            <p style={{
              fontSize: '16px',
              marginBottom: '24px',
              color: darkMode ? '#9ca3af' : '#6b7280'
            }}>
              The logs page encountered an unexpected error. This has been logged for investigation.
            </p>

            {errorCount > 2 && (
              <div style={{
                background: darkMode ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.05)',
                border: `1px solid ${darkMode ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.2)'}`,
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '24px'
              }}>
                <p style={{
                  margin: 0,
                  fontSize: '14px',
                  color: darkMode ? '#fca5a5' : '#ef4444'
                }}>
                  This error has occurred {errorCount} times. If the problem persists, please contact support.
                </p>
              </div>
            )}

            {isDevelopment && error && (
              <details style={{
                textAlign: 'left',
                marginBottom: '24px',
                background: darkMode ? 'rgba(0, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.05)',
                padding: '16px',
                borderRadius: '8px'
              }}>
                <summary style={{
                  cursor: 'pointer',
                  marginBottom: '8px',
                  color: darkMode ? '#9ca3af' : '#6b7280',
                  fontSize: '14px'
                }}>
                  Error Details (Development Only)
                </summary>
                <div style={{
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  color: darkMode ? '#d1d5db' : '#4b5563'
                }}>
                  <strong>Message:</strong> {((error as any)?.message || String(error))}
                  <br /><br />
                  <strong>Stack:</strong>
                  <pre style={{
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    margin: '8px 0 0 0'
                  }}>
                    {error.stack}
                  </pre>
                </div>
              </details>
            )}

            <Space size="middle" style={{ marginTop: '24px' }}>
              <Button
                type="primary"
                icon={<RefreshCw size={16} />}
                onClick={this.handleReset}
                size="large"
              >
                Try Again
              </Button>
              
              <Button
                icon={<RefreshCw size={16} />}
                onClick={this.handleReload}
                size="large"
              >
                Reload Page
              </Button>
              
              <Button
                icon={<Home size={16} />}
                onClick={this.handleGoHome}
                size="large"
              >
                Go to Dashboard
              </Button>
            </Space>

            {isDevelopment && (
              <div style={{
                marginTop: '32px',
                paddingTop: '24px',
                borderTop: `1px solid ${darkMode ? 'rgba(55, 65, 81, 0.3)' : 'rgba(229, 231, 235, 1)'}`,
                fontSize: '12px',
                color: darkMode ? '#6b7280' : '#9ca3af'
              }}>
                <Bug size={16} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
                Development mode: Check console for detailed error information
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Functional component wrapper for easier use with hooks
export const withLogsErrorBoundary = <P extends object>(
  Component: React.ComponentType<P>
) => {
  return (props: P & { darkMode: boolean }) => (
    <LogsErrorBoundary darkMode={props.darkMode}>
      <Component {...props} />
    </LogsErrorBoundary>
  );
};