import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button, Space, Alert, Typography } from 'antd';
import { AlertCircle, RefreshCw, ArrowLeft, Bug } from 'lucide-react';
import { AppError, parseError, isRetryableError, ErrorType } from '@/utils/errorHandler';

const { Text } = Typography;

// Google Analytics type declaration (extending from LogsErrorBoundary)
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

interface QueryPreviewErrorBoundaryProps {
  children: ReactNode;
  darkMode: boolean;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  onRetry?: () => void;
  onGoBack?: () => void;
  maxRetries?: number;
  showRecoveryActions?: boolean;
  context?: string;
}

interface QueryPreviewErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
  appError?: AppError;
  errorCount: number;
  retryCount: number;
  isRetrying: boolean;
  lastErrorTime: number;
}

export class QueryPreviewErrorBoundary extends Component<
  QueryPreviewErrorBoundaryProps, 
  QueryPreviewErrorBoundaryState
> {
  private retryTimeoutId?: NodeJS.Timeout;

  constructor(props: QueryPreviewErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: undefined,
      errorInfo: undefined,
      appError: undefined,
      errorCount: 0,
      retryCount: 0,
      isRetrying: false,
      lastErrorTime: 0
    };
  }

  static getDerivedStateFromError(error: Error): Partial<QueryPreviewErrorBoundaryState> {
    const appError = parseError(error);
    const currentTime = Date.now();
    
    // Get stored error count for this specific context
    const contextKey = 'queryPreviewErrorCount';
    const lastErrorCount = localStorage.getItem(contextKey);
    const errorCount = lastErrorCount ? parseInt(lastErrorCount) + 1 : 1;
    
    return { 
      hasError: true, 
      error,
      appError,
      errorCount,
      lastErrorTime: currentTime
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const { context = 'QueryPreview' } = this.props;
    
    // Log error to console for debugging
    console.error(`QueryPreviewErrorBoundary caught an error in ${context}:`, error, errorInfo);
    
    // Parse error for structured handling
    const appError = parseError(error);
    
    // Update error count and persistence
    const contextKey = 'queryPreviewErrorCount';
    localStorage.setItem(contextKey, this.state.errorCount.toString());
    localStorage.setItem('lastQueryPreviewError', JSON.stringify({
      message: error.message || String(error),
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
      context,
      errorType: appError.type,
      code: appError.code
    }));
    
    // Call optional error handler
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
    
    // Log to external error tracking if available
    if (window.gtag) {
      window.gtag('event', 'exception', {
        description: error.message || String(error),
        fatal: false,
        error_name: `QueryPreviewError_${context}`
      });
    }

    // Update state with error info
    this.setState({
      errorInfo,
      appError
    });
  }

  componentWillUnmount() {
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
    }
  }

  handleReset = () => {
    // Clear error state
    this.setState({
      hasError: false,
      error: undefined,
      errorInfo: undefined,
      appError: undefined,
      retryCount: 0,
      isRetrying: false
    });
    
    // Clear error persistence on successful reset
    const contextKey = 'queryPreviewErrorCount';
    localStorage.removeItem(contextKey);
    localStorage.removeItem('lastQueryPreviewError');
  };

  handleRetry = async () => {
    const { maxRetries = 3, onRetry } = this.props;
    const { retryCount, appError } = this.state;

    // Check if we can retry this error type
    if (!appError || !isRetryableError(appError)) {
      return;
    }

    // Check retry limit
    if (retryCount >= maxRetries) {
      console.warn('Max retries reached for query preview error');
      return;
    }

    this.setState({ 
      isRetrying: true, 
      retryCount: retryCount + 1 
    });

    try {
      // Exponential backoff delay
      const delay = Math.min(1000 * Math.pow(2, retryCount), 8000); // Max 8 seconds
      
      await new Promise(resolve => {
        this.retryTimeoutId = setTimeout(resolve, delay);
      });

      // Call retry callback if provided
      if (onRetry) {
        await onRetry();
      }

      // Reset error state on successful retry
      this.handleReset();
    } catch (retryError) {
      console.error('Retry failed:', retryError);
      // Keep error state, increment retry count
      this.setState({ 
        isRetrying: false,
        error: retryError instanceof Error ? retryError : this.state.error
      });
    }
  };

  handleGoBack = () => {
    const { onGoBack } = this.props;
    
    if (onGoBack) {
      onGoBack();
    } else {
      // Default behavior - clear error and try to go back
      this.handleReset();
    }
  };

  handleReload = () => {
    window.location.reload();
  };

  getErrorGuidance = (appError: AppError): { title: string; description: string; actionable: boolean } => {
    switch (appError.type) {
      case ErrorType.NETWORK:
        return {
          title: 'Network Connection Issue',
          description: 'Check your internet connection and try again. If the problem persists, contact your network administrator.',
          actionable: true
        };
      case ErrorType.TIMEOUT:
        return {
          title: 'Query Timeout',
          description: 'The query took too long to execute. Try reducing the date range, adding more specific filters, or selecting fewer fields.',
          actionable: true
        };
      case ErrorType.QUERY_VALIDATION:
      case ErrorType.VALIDATION:
        return {
          title: 'Query Configuration Error',
          description: 'There\'s an issue with your query configuration. Please check your field selections, filters, and try again.',
          actionable: true
        };
      case ErrorType.AUTHENTICATION:
        return {
          title: 'Authentication Required',
          description: 'Your session has expired. Please refresh the page and log in again.',
          actionable: true
        };
      case ErrorType.AUTHORIZATION:
        return {
          title: 'Access Denied',
          description: 'You don\'t have permission to execute this query. Contact your administrator for access.',
          actionable: false
        };
      case ErrorType.RATE_LIMIT:
        return {
          title: 'Too Many Requests',
          description: 'You\'ve made too many queries recently. Please wait a moment and try again.',
          actionable: true
        };
      case ErrorType.SERVER:
        return {
          title: 'Server Error',
          description: 'There\'s a temporary issue with the server. Please try again in a few moments.',
          actionable: true
        };
      default:
        return {
          title: 'Unexpected Error',
          description: 'An unexpected error occurred while executing your query. Please try again.',
          actionable: true
        };
    }
  };

  render() {
    const { darkMode, showRecoveryActions = true, maxRetries = 3 } = this.props;
    const { hasError, error, appError, errorCount, retryCount, isRetrying } = this.state;

    if (hasError && appError) {
      const isDevelopment = import.meta.env.DEV;
      const canRetry = isRetryableError(appError) && retryCount < maxRetries;
      const guidance = this.getErrorGuidance(appError);
      
      return (
        <div style={{
          minHeight: '400px',
          background: darkMode ? '#1a1a1a' : '#f5f5f5',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px',
          borderRadius: '8px'
        }}>
          <div style={{
            maxWidth: '600px',
            width: '100%',
            textAlign: 'center',
            background: darkMode ? 'rgba(17, 24, 39, 0.5)' : 'rgba(255, 255, 255, 0.9)',
            backdropFilter: 'blur(20px)',
            borderRadius: '16px',
            padding: '32px',
            border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(229, 231, 235, 1)',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
          }}>
            <AlertCircle 
              size={48} 
              style={{ 
                color: '#ef4444',
                marginBottom: '16px'
              }} 
            />
            
            <h3 style={{
              fontSize: '20px',
              fontWeight: 'bold',
              marginBottom: '8px',
              color: darkMode ? 'white' : '#1f2937'
            }}>
              {guidance.title}
            </h3>
            
            <p style={{
              fontSize: '14px',
              marginBottom: '20px',
              color: darkMode ? '#9ca3af' : '#6b7280',
              lineHeight: 1.5
            }}>
              {guidance.description}
            </p>

            {/* Error count warning */}
            {errorCount > 2 && (
              <Alert
                message={`This error has occurred ${errorCount} times`}
                description="If the problem persists, please try a different approach or contact support."
                type="warning"
                showIcon
                style={{ 
                  marginBottom: '20px',
                  textAlign: 'left'
                }}
              />
            )}

            {/* Retry count info */}
            {retryCount > 0 && (
              <div style={{
                marginBottom: '16px',
                padding: '8px 12px',
                background: darkMode ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.05)',
                border: `1px solid ${darkMode ? 'rgba(59, 130, 246, 0.3)' : 'rgba(59, 130, 246, 0.2)'}`,
                borderRadius: '6px',
                fontSize: '12px',
                color: darkMode ? '#93c5fd' : '#2563eb'
              }}>
                Attempt {retryCount} of {maxRetries}
              </div>
            )}

            {/* Development error details */}
            {isDevelopment && error && (
              <details style={{
                textAlign: 'left',
                marginBottom: '20px',
                background: darkMode ? 'rgba(0, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.05)',
                padding: '12px',
                borderRadius: '6px',
                fontSize: '12px'
              }}>
                <summary style={{
                  cursor: 'pointer',
                  marginBottom: '8px',
                  color: darkMode ? '#9ca3af' : '#6b7280',
                  fontSize: '12px'
                }}>
                  <Bug size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                  Error Details (Development Only)
                </summary>
                <div style={{
                  fontFamily: 'monospace',
                  color: darkMode ? '#d1d5db' : '#4b5563',
                  wordBreak: 'break-word'
                }}>
                  <strong>Type:</strong> {appError.type}<br />
                  <strong>Code:</strong> {appError.code || 'Unknown'}<br />
                  <strong>Message:</strong> {error.message || String(error)}<br />
                  {error.stack && (
                    <>
                      <strong>Stack:</strong>
                      <pre style={{
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        margin: '4px 0 0 0',
                        fontSize: '10px'
                      }}>
                        {error.stack}
                      </pre>
                    </>
                  )}
                </div>
              </details>
            )}

            {/* Action buttons */}
            {showRecoveryActions && (
              <Space size="middle" style={{ marginTop: '16px' }}>
                {canRetry && (
                  <Button
                    type="primary"
                    icon={<RefreshCw size={14} />}
                    onClick={this.handleRetry}
                    loading={isRetrying}
                    size="large"
                  >
                    {isRetrying ? 'Retrying...' : 'Try Again'}
                  </Button>
                )}
                
                <Button
                  icon={<ArrowLeft size={14} />}
                  onClick={this.handleGoBack}
                  size="large"
                >
                  Go Back
                </Button>
                
                <Button
                  icon={<RefreshCw size={14} />}
                  onClick={this.handleReload}
                  size="large"
                >
                  Reload Page
                </Button>
              </Space>
            )}

            {/* Additional guidance for non-actionable errors */}
            {!guidance.actionable && (
              <div style={{
                marginTop: '16px',
                padding: '12px',
                background: darkMode ? 'rgba(245, 158, 11, 0.1)' : 'rgba(245, 158, 11, 0.05)',
                border: `1px solid ${darkMode ? 'rgba(245, 158, 11, 0.3)' : 'rgba(245, 158, 11, 0.2)'}`,
                borderRadius: '6px',
                fontSize: '12px',
                color: darkMode ? '#fbbf24' : '#d97706'
              }}>
                Contact your system administrator for assistance with this issue.
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
export const withQueryPreviewErrorBoundary = <P extends object>(
  Component: React.ComponentType<P>
) => {
  return (props: P & { 
    darkMode: boolean; 
    onRetry?: () => void; 
    onGoBack?: () => void;
    maxRetries?: number;
    showRecoveryActions?: boolean;
    context?: string;
  }) => (
    <QueryPreviewErrorBoundary 
      darkMode={props.darkMode}
      onRetry={props.onRetry}
      onGoBack={props.onGoBack}
      maxRetries={props.maxRetries}
      showRecoveryActions={props.showRecoveryActions}
      context={props.context}
    >
      <Component {...props} />
    </QueryPreviewErrorBoundary>
  );
};

export default QueryPreviewErrorBoundary;