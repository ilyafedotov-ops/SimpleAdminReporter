/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from 'react';
import { Modal, Button, Alert, Typography, Card, Space, Divider } from 'antd';
import { CloudOutlined, CheckCircleOutlined, LockOutlined, SafetyOutlined } from '@ant-design/icons';
import { useMsalAuth } from '@/providers/MsalAuthProvider';

const { Title, Text, Paragraph } = Typography;

interface MsalAzureAuthFlowProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onError: (error: string) => void;
  requiredScopes?: string[];
}

export const MsalAzureAuthFlow: React.FC<MsalAzureAuthFlowProps> = ({
  visible,
  onClose,
  onSuccess,
  onError,
  requiredScopes = ['https://graph.microsoft.com/.default']
}) => {
  const { login, isAuthenticated, account } = useMsalAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleLogin = async () => {
    try {
      setLoading(true);
      setError(null);
      
      await login(requiredScopes);
      
      setSuccess(true);
      setTimeout(() => {
        onSuccess();
        handleClose();
      }, 1500);
      
    } catch (err: any) {
      const errorMessage = err.message || 'Authentication failed';
      setError(errorMessage);
      onError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setError(null);
    setSuccess(false);
    setLoading(false);
    onClose();
  };

  const getScopeDescription = (scopes: string[]) => {
    const descriptions: string[] = [];
    
    scopes.forEach(scope => {
      if (scope.includes('User.Read')) {
        descriptions.push('Read user profile information');
      }
      if (scope.includes('Group.Read')) {
        descriptions.push('Read group information');
      }
      if (scope.includes('Directory.Read')) {
        descriptions.push('Read directory data');
      }
      if (scope.includes('Reports.Read')) {
        descriptions.push('Access usage reports');
      }
      if (scope.includes('.default')) {
        descriptions.push('Access all configured permissions');
      }
    });
    
    return descriptions;
  };

  return (
    <Modal
      title={
        <Space>
          <CloudOutlined style={{ color: '#0078d4' }} />
          <span>Microsoft Azure AD Authentication</span>
          <SafetyOutlined style={{ color: '#52c41a', fontSize: 16 }} title="MSAL Secure Flow" />
        </Space>
      }
      open={visible}
      onCancel={handleClose}
      footer={null}
      width={600}
      maskClosable={false}
    >
      <div style={{ padding: '20px 0' }}>
        {!isAuthenticated && !success && (
          <>
            <Alert
              message="Enterprise-Grade Security with MSAL"
              description={
                <div>
                  <p>This authentication uses Microsoft Authentication Library (MSAL) for enterprise-grade security:</p>
                  <ul style={{ margin: '10px 0' }}>
                    <li>✓ OAuth 2.0 Authorization Code Flow with PKCE</li>
                    <li>✓ Encrypted token storage</li>
                    <li>✓ Automatic token refresh</li>
                    <li>✓ Single Sign-On (SSO) support</li>
                  </ul>
                </div>
              }
              type="success"
              showIcon
              icon={<SafetyOutlined />}
              style={{ marginBottom: 24 }}
            />

            <Card>
              <div style={{ textAlign: 'center', padding: '20px' }}>
                <CloudOutlined style={{ fontSize: 48, color: '#0078d4', marginBottom: 16 }} />
                <Title level={4}>Sign in to Microsoft Graph</Title>
                <Paragraph type="secondary">
                  Authenticate with your Azure AD credentials to access Microsoft Graph API 
                  and query organizational data.
                </Paragraph>
                
                {requiredScopes.length > 0 && (
                  <>
                    <Divider />
                    <div style={{ textAlign: 'left', maxWidth: 400, margin: '0 auto' }}>
                      <Text strong>This application will be able to:</Text>
                      <ul style={{ marginTop: 10 }}>
                        {getScopeDescription(requiredScopes).map((desc, index) => (
                          <li key={index}>
                            <Text type="secondary">{desc}</Text>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </>
                )}
                
                <Space direction="vertical" size="middle" style={{ width: '100%', marginTop: 24 }}>
                  <Button
                    type="primary"
                    size="large"
                    icon={<CloudOutlined />}
                    onClick={handleLogin}
                    loading={loading}
                    style={{ background: '#0078d4', borderColor: '#0078d4' }}
                  >
                    Sign in with Microsoft
                  </Button>
                  <Button onClick={handleClose}>
                    Cancel
                  </Button>
                </Space>
                
                <div style={{ marginTop: 20 }}>
                  <Space>
                    <LockOutlined style={{ color: '#52c41a' }} />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Secured by MSAL with PKCE
                    </Text>
                  </Space>
                </div>
              </div>
            </Card>
          </>
        )}

        {isAuthenticated && !success && (
          <Card>
            <div style={{ textAlign: 'center', padding: '20px' }}>
              <CheckCircleOutlined style={{ fontSize: 48, color: '#52c41a', marginBottom: 16 }} />
              <Title level={4}>Already Authenticated</Title>
              <Paragraph type="secondary">
                You are already signed in as:
              </Paragraph>
              <Text strong>{account?.name || account?.username}</Text>
              <br />
              <Text type="secondary">{account?.username}</Text>
              
              <div style={{ marginTop: 24 }}>
                <Button type="primary" onClick={handleClose}>
                  Continue
                </Button>
              </div>
            </div>
          </Card>
        )}

        {success && (
          <Card>
            <div style={{ textAlign: 'center', padding: '20px' }}>
              <CheckCircleOutlined style={{ fontSize: 48, color: '#52c41a', marginBottom: 16 }} />
              <Title level={4} style={{ color: '#52c41a' }}>
                Authentication Successful!
              </Title>
              <Paragraph type="secondary">
                You are now authenticated with Azure AD using MSAL.
                Your tokens are securely managed.
              </Paragraph>
              <Space direction="vertical" size="small" style={{ marginTop: 16 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  <LockOutlined style={{ color: '#52c41a' }} /> Tokens encrypted with AES-256-GCM
                </Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  <SafetyOutlined style={{ color: '#52c41a' }} /> Managed by MSAL
                </Text>
              </Space>
            </div>
          </Card>
        )}

        {error && (
          <Alert
            message="Authentication Error"
            description={error}
            type="error"
            showIcon
            style={{ marginTop: 16 }}
            closable
            onClose={() => setError(null)}
          />
        )}
      </div>
    </Modal>
  );
};