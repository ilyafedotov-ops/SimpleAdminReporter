import { Component, ErrorInfo, ReactNode } from 'react';
import { Result, Button, Typography, Collapse } from 'antd';
import { ReloadOutlined, BugOutlined } from '@ant-design/icons';

const { Paragraph, Text } = Typography;
const { Panel } = Collapse;

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    this.setState({
      error,
      errorInfo,
    });

    // You can also log the error to an error reporting service here
    // logErrorToService(error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ 
          padding: '50px', 
          minHeight: '100vh', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          background: '#f0f2f5'
        }}>
          <div style={{ maxWidth: 600, width: '100%' }}>
            <Result
              status="error"
              title="Something went wrong"
              subTitle="An unexpected error occurred in the application. Please try refreshing the page or contact support if the problem persists."
              extra={[
                <Button 
                  type="primary" 
                  icon={<ReloadOutlined />} 
                  onClick={this.handleReload}
                  key="reload"
                >
                  Reload Page
                </Button>,
                <Button 
                  onClick={this.handleReset}
                  key="reset"
                >
                  Try Again
                </Button>,
              ]}
            />

            {/* Error Details (for development) */}
            {import.meta.env.DEV && this.state.error && (
              <Collapse ghost>
                <Panel 
                  header={
                    <Text type="secondary">
                      <BugOutlined /> Show Error Details (Development Mode)
                    </Text>
                  } 
                  key="error-details"
                >
                  <div style={{ background: '#f6f6f6', padding: 16, borderRadius: 6 }}>
                    <Paragraph>
                      <Text strong>Error:</Text>
                      <br />
                      <Text code style={{ color: '#ff4d4f' }}>
                        {(this.state.error as any)?.message || String(this.state.error)}
                      </Text>
                    </Paragraph>

                    {this.state.error.stack && (
                      <Paragraph>
                        <Text strong>Stack Trace:</Text>
                        <br />
                        <Text code style={{ whiteSpace: 'pre-wrap', fontSize: '11px' }}>
                          {this.state.error.stack}
                        </Text>
                      </Paragraph>
                    )}

                    {this.state.errorInfo && this.state.errorInfo.componentStack && (
                      <Paragraph>
                        <Text strong>Component Stack:</Text>
                        <br />
                        <Text code style={{ whiteSpace: 'pre-wrap', fontSize: '11px' }}>
                          {this.state.errorInfo.componentStack}
                        </Text>
                      </Paragraph>
                    )}
                  </div>
                </Panel>
              </Collapse>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;