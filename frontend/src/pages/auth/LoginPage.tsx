/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useState } from 'react';
import { Form, Input, Button, Select, Alert, Typography, Divider } from 'antd';
import { UserOutlined, LockOutlined, CloudServerOutlined, CloudOutlined } from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/store';
import { loginAsync, selectAuthLoading, selectAuthError } from '@/store/slices/authSlice';
import { LoginRequest } from '@/types';
import { MsalAzureAuthFlow } from '@/components/auth/MsalAzureAuthFlow';
import { useMsalAuth } from '@/providers/MsalAuthProvider';

const { Title, Text } = Typography;
const { Option } = Select;

const LoginPage: React.FC = () => {
  const formItemStyle = {
    width: '100%',
  };

  const selectStyle = {
    width: '100%',
    textAlign: 'left' as const,
  };

  const getDropdownStyle = () => {
    const isMobile = window.innerWidth < 480;
    return {
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
      minWidth: isMobile ? '280px' : '320px',
      maxWidth: isMobile ? '320px' : '400px',
      width: 'auto'
    };
  };

  const getOptionContainerStyle = () => {
    const isMobile = window.innerWidth < 480;
    return {
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'flex-start' as const,
      padding: '6px 0',
      maxWidth: isMobile ? '260px' : '300px',
      width: '100%'
    };
  };
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  
  const isLoading = useAppSelector(selectAuthLoading);
  const error = useAppSelector(selectAuthError);
  
  const [form] = Form.useForm();
  const [selectedAuthSource, setSelectedAuthSource] = useState<'ad' | 'azure' | 'local'>('ad');
  const [showAzureAuthFlow, setShowAzureAuthFlow] = useState(false);
  const { isAuthenticated: _isMsalAuthenticated } = useMsalAuth();

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/dashboard';

  const handleSubmit = async (values: LoginRequest) => {
    // If Azure AD is selected, show the MSAL OAuth flow
    if (values.authSource === 'azure') {
      setShowAzureAuthFlow(true);
      return;
    }

    // For AD and local auth, use traditional login
    const credentials: LoginRequest = {
      username: values.username,
      password: values.password,
      authSource: values.authSource,
    };

    try {
      const result = await dispatch(loginAsync(credentials)).unwrap();
      if (result) {
        navigate(from, { replace: true });
      }
    } catch (error) {
      // Error is handled by the Redux slice
      console.error('Login failed:', error);
    }
  };

  const handleAzureAuthSuccess = async () => {
    // After successful Azure AD auth, sync with backend
    try {
      const result = await dispatch(loginAsync({
        username: 'azure-oauth',
        password: 'azure-oauth',
        authSource: 'azure'
      })).unwrap();
      if (result) {
        navigate(from, { replace: true });
      }
    } catch (error) {
      console.error('Backend sync failed:', error);
    }
  };

  const handleAzureAuthError = (error: string) => {
    console.error('Azure authentication failed:', error);
  };

  const getAuthSourceInfo = (source: string) => {
    switch (source) {
      case 'ad':
        return {
          title: 'Active Directory',
          description: 'Login with your domain credentials',
          placeholder: 'domain\\username or username@domain.com',
        };
      case 'azure':
        return {
          title: 'Azure Active Directory',
          description: 'Login with your Azure AD account',
          placeholder: 'username@company.com',
        };
      case 'local':
        return {
          title: 'Local Account',
          description: 'Login with your local application account',
          placeholder: 'username',
        };
      default:
        return {
          title: 'Login',
          description: 'Enter your credentials',
          placeholder: 'username',
        };
    }
  };

  const authInfo = getAuthSourceInfo(selectedAuthSource);

  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <Title level={3} style={{ margin: 0, color: '#1890ff' }}>
          Welcome Back
        </Title>
        <Text type="secondary" style={{ fontSize: '14px' }}>
          Sign in to access your reporting dashboard
        </Text>
      </div>

      {error && (
        <Alert
          message="Login Failed"
          description={error}
          type="error"
          showIcon
          style={{ marginBottom: 24 }}
        />
      )}

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        size="large"
        initialValues={{
          authSource: 'ad',
        }}
        style={{ width: '100%' }}
        requiredMark={false}
      >
        <Form.Item
          name="authSource"
          label="Authentication Source"
          rules={[{ required: true, message: 'Please select authentication source' }]}
          style={formItemStyle}
        >
          <Select
            placeholder="Select authentication method"
            onChange={setSelectedAuthSource}
            suffixIcon={<CloudServerOutlined />}
            style={{ width: '100%' }}
            dropdownStyle={getDropdownStyle()}
            popupMatchSelectWidth={false}
            optionLabelProp="label"
          >
            <Option value="ad" label="Active Directory">
              <div style={getOptionContainerStyle()}>
                <div style={{ fontWeight: 500, marginBottom: '2px', fontSize: '14px' }}>Active Directory</div>
                <div style={{ 
                  fontSize: '11px', 
                  color: '#999', 
                  lineHeight: '1.3',
                  whiteSpace: 'normal',
                  wordWrap: 'break-word',
                  maxWidth: '100%'
                }}>
                  Domain authentication (LDAP)
                </div>
              </div>
            </Option>
            <Option value="azure" label="Azure Active Directory">
              <div style={getOptionContainerStyle()}>
                <div style={{ fontWeight: 500, marginBottom: '2px', fontSize: '14px' }}>Azure Active Directory</div>
                <div style={{ 
                  fontSize: '11px', 
                  color: '#999', 
                  lineHeight: '1.3',
                  whiteSpace: 'normal',
                  wordWrap: 'break-word',
                  maxWidth: '100%'
                }}>
                  Microsoft cloud authentication
                </div>
              </div>
            </Option>
            <Option value="local" label="Local Account">
              <div style={getOptionContainerStyle()}>
                <div style={{ fontWeight: 500, marginBottom: '2px', fontSize: '14px' }}>Local Account</div>
                <div style={{ 
                  fontSize: '11px', 
                  color: '#999', 
                  lineHeight: '1.3',
                  whiteSpace: 'normal',
                  wordWrap: 'break-word',
                  maxWidth: '100%'
                }}>
                  Application-specific account
                </div>
              </div>
            </Option>
          </Select>
        </Form.Item>

        <Divider style={{ margin: '16px 0' }}>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            {authInfo.description}
          </Text>
        </Divider>

        {selectedAuthSource === 'azure' ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <CloudOutlined style={{ fontSize: 48, color: '#0078d4', marginBottom: 16 }} />
            <Typography.Paragraph type="secondary" style={{ marginBottom: 24 }}>
              Click the button below to authenticate with your Microsoft account
            </Typography.Paragraph>
          </div>
        ) : (
          <>
            <Form.Item
              name="username"
              label="Username"
              rules={[{ required: selectedAuthSource !== 'azure', message: 'Please enter your username' }]}
              style={formItemStyle}
            >
              <Input
                prefix={<UserOutlined />}
                placeholder={authInfo.placeholder}
                autoComplete="username"
                disabled={isLoading}
                style={{ width: '100%' }}
              />
            </Form.Item>

            <Form.Item
              name="password"
              label="Password"
              rules={[{ required: selectedAuthSource !== 'azure', message: 'Please enter your password' }]}
              style={formItemStyle}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="Enter your password"
                autoComplete="current-password"
                disabled={isLoading}
                style={{ width: '100%' }}
              />
            </Form.Item>
          </>
        )}

        <Form.Item style={{ marginBottom: 0 }}>
          <Button
            type="primary"
            htmlType="submit"
            loading={isLoading}
            icon={selectedAuthSource === 'azure' ? <CloudOutlined /> : undefined}
            style={{
              width: '100%',
              height: '48px',
              fontSize: '16px',
              fontWeight: 500,
              background: selectedAuthSource === 'azure' ? '#0078d4' : undefined,
              borderColor: selectedAuthSource === 'azure' ? '#0078d4' : undefined,
            }}
          >
            {isLoading ? 'Signing In...' : 
             selectedAuthSource === 'azure' ? 'Sign in with Microsoft' : 'Sign In'}
          </Button>
        </Form.Item>
      </Form>

      <div style={{ marginTop: 24, textAlign: 'center' }}>
        <Text type="secondary" style={{ fontSize: '12px' }}>
          Having trouble signing in? Contact your system administrator.
        </Text>
      </div>

      {/* Demo credentials hint for development */}
      {import.meta.env.DEV && (
        <div style={{ marginTop: 16, padding: 12, background: '#f6f7f9', borderRadius: 6 }}>
          <Text style={{ fontSize: '11px', color: '#666' }}>
            <strong>Development Mode:</strong> Demo credentials will be available once the backend is running.
          </Text>
        </div>
      )}

      {/* Azure AD OAuth Flow Modal */}
      <MsalAzureAuthFlow
        visible={showAzureAuthFlow}
        onClose={() => setShowAzureAuthFlow(false)}
        onSuccess={handleAzureAuthSuccess}
        onError={handleAzureAuthError}
      />
    </div>
  );
};

export default LoginPage;