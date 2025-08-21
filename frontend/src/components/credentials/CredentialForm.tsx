import React, { useEffect, useState, useCallback } from 'react';
import { 
  Modal, 
  Form, 
  Input, 
  Select, 
  Switch, 
  Alert,
  Divider,
  Space,
  Button,
  message
} from 'antd';
import { 
  ServiceCredential, 
  CreateCredentialDto, 
  UpdateCredentialDto 
} from '@/types';
import { credentialsApi } from '@/services/credentials.api';
import { KeyOutlined, UserOutlined, CloudServerOutlined, LoginOutlined } from '@ant-design/icons';

// OAuth message event types
interface OAuthMessageData {
  type: "azure-auth-success" | "azure-auth-error";
  error?: string;
}

// const { Text } = Typography;
const { Option } = Select;

interface CredentialFormProps {
  visible: boolean;
  credential?: ServiceCredential | null;
  onCancel: () => void;
  onSubmit: (values: CreateCredentialDto | UpdateCredentialDto) => Promise<void>;
  loading?: boolean;
}

const CredentialForm: React.FC<CredentialFormProps> = ({ 
  visible, 
  credential, 
  onCancel, 
  onSubmit,
  loading = false
}) => {
  const [form] = Form.useForm();
  const [serviceType, setServiceType] = React.useState<'ad' | 'azure' | 'o365'>('ad');
  const [oauthLoading, setOauthLoading] = useState(false);
  const [hasOAuthToken, setHasOAuthToken] = useState(false);

  useEffect(() => {
    if (visible) {
      if (credential) {
        // Editing existing credential
        form.setFieldsValue({
          credentialName: credential.credentialName,
          serviceType: credential.serviceType,
          username: credential.username,
          tenantId: credential.tenantId,
          clientId: credential.clientId,
          isDefault: credential.isDefault,
          isActive: credential.isActive,
        });
        setServiceType(credential.serviceType);
      } else {
        // Creating new credential
        form.resetFields();
        form.setFieldsValue({
          serviceType: 'ad',
          isDefault: false,
          isActive: true,
          // Pre-fill Azure credentials from environment
          tenantId: import.meta.env.VITE_AZURE_TENANT_ID,
          clientId: import.meta.env.VITE_AZURE_CLIENT_ID,
        });
        setServiceType('ad');
      }
    }
  }, [visible, credential, form]);

  const checkOAuthStatus = useCallback(async () => {
    // This would check with the backend if OAuth tokens were received
    try {
      const response = await credentialsApi.checkOAuthStatus();
      if (response.hasToken) {
        setHasOAuthToken(true);
        message.success('Successfully authenticated with Azure AD!');
        // Pre-fill the form with OAuth details
        form.setFieldsValue({
          tenantId: response.tenantId,
          clientId: response.clientId,
        });
      }
    } catch (error) {
      console.error('Failed to check OAuth status:', error);
    }
  }, [form]);

  // Listen for OAuth callback messages
  useEffect(() => {
    const handleMessage = (event: Event) => {
      const messageEvent = event as Event & { 
        origin: string;
        data: OAuthMessageData;
      };
      
      if (messageEvent.origin !== window.location.origin) return;
      
      // Type guard for our OAuth message data
      const messageData = messageEvent.data;
      if (!messageData?.type) return;
      
      if (messageData.type === 'azure-auth-success') {
        setOauthLoading(false);
        checkOAuthStatus();
      } else if (messageData.type === 'azure-auth-error') {
        setOauthLoading(false);
        message.error(`OAuth authentication failed: ${messageData.error}`);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [checkOAuthStatus]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      
      // Filter out undefined values and password/secret fields if not changed
      const submitData: CreateCredentialDto | UpdateCredentialDto = {
        ...values,
      };

      // Don't send empty password fields when editing
      if (credential) {
        if (!submitData.password) delete submitData.password;
        if (!submitData.clientSecret) delete submitData.clientSecret;
      }

      // If using OAuth, mark it in the submission
      if (hasOAuthToken && (serviceType === 'azure' || serviceType === 'o365')) {
        submitData.authType = 'oauth';
        // Don't require client secret for OAuth
        delete submitData.clientSecret;
      }

      await onSubmit(submitData);
      form.resetFields();
      setHasOAuthToken(false);
    } catch (error) {
      // Form validation failed
      console.error('Form validation error:', error);
    }
  };

  const handleServiceTypeChange = (value: 'ad' | 'azure' | 'o365') => {
    setServiceType(value);
    // Clear fields that are not relevant for the selected service type
    if (value === 'ad') {
      form.setFieldsValue({
        tenantId: undefined,
        clientId: undefined,
        clientSecret: undefined,
      });
    } else {
      form.setFieldsValue({
        username: undefined,
        password: undefined,
      });
    }
  };

  const getServiceTypeHelp = (type: 'ad' | 'azure' | 'o365') => {
    const helpTexts = {
      ad: 'Use domain\\username or username@domain.com format',
      azure: 'Create an app registration in Azure AD to get these values',
      o365: 'Use the same app registration as Azure AD with appropriate permissions'
    };
    return helpTexts[type];
  };

  const handleOAuthLogin = async () => {
    try {
      setOauthLoading(true);
      
      const credentialName = form.getFieldValue('credentialName') || 'Azure AD OAuth';
      console.log('Requesting OAuth URL with credential name:', credentialName);
      
      const response = await credentialsApi.getAzureOAuthUrl(credentialName);
      const authUrl = response.authUrl;
      
      console.log('Received OAuth URL:', authUrl);
      
      // Open OAuth window - backend will handle the entire flow
      const authWindow = window.open(authUrl, 'azure-auth', 'width=600,height=700');
      
      if (!authWindow) {
        message.error('Failed to open authentication window. Please check your popup blocker settings.');
        setOauthLoading(false);
        return;
      }
      
      // Poll to check if the window is closed
      const checkInterval = setInterval(async () => {
        if (authWindow.closed) {
          clearInterval(checkInterval);
          setOauthLoading(false);
          
          // Wait a moment for the backend to process the callback
          setTimeout(() => {
            checkOAuthStatus();
          }, 1500);
        }
      }, 500);
      
    } catch (error: unknown) {
      const axiosError = error as { 
        response?: { 
          status?: number; 
          data?: { message?: string }; 
        }; 
        message?: string;
        config?: { 
          url?: string; 
          params?: unknown; 
          headers?: unknown; 
        };
      };
      
      console.error('OAuth error details:', {
        error,
        response: axiosError.response,
        data: axiosError.response?.data,
        status: axiosError.response?.status,
        message: axiosError.message,
        url: axiosError.config?.url,
        params: axiosError.config?.params,
        headers: axiosError.config?.headers
      });
      
      if (axiosError.response?.status === 401) {
        message.error('Session expired. Please log in again.');
      } else if (axiosError.response?.status === 404) {
        message.error('OAuth endpoint not found. Please check the API configuration.');
      } else if (axiosError.response?.data?.message) {
        message.error(`OAuth error: ${(axiosError.response?.data as { message?: string })?.message}`);
      } else if (axiosError.message) {
        message.error(`Error: ${axiosError.message}`);
      } else {
        message.error('Failed to start OAuth authentication');
      }
      setOauthLoading(false);
    }
  };

  return (
    <Modal
      title={
        <Space>
          <CloudServerOutlined />
          {credential ? 'Edit Credential' : 'Add New Credential'}
        </Space>
      }
      open={visible}
      onOk={handleSubmit}
      onCancel={onCancel}
      confirmLoading={loading}
      width={600}
      okText={credential ? 'Update' : 'Create'}
    >
      <Form
        form={form}
        layout="vertical"
        autoComplete="off"
      >
        <Form.Item
          name="credentialName"
          label="Credential Name"
          rules={[
            { required: true, message: 'Please enter a credential name' },
            { max: 255, message: 'Name is too long' }
          ]}
        >
          <Input 
            placeholder="e.g., Production AD, Dev Azure"
            prefix={<KeyOutlined />}
          />
        </Form.Item>

        <Form.Item
          name="serviceType"
          label="Service Type"
          rules={[{ required: true, message: 'Please select a service type' }]}
        >
          <Select 
            onChange={handleServiceTypeChange}
            disabled={!!credential} // Can't change service type when editing
          >
            <Option value="ad">
              <Space>
                <CloudServerOutlined />
                Active Directory
              </Space>
            </Option>
            <Option value="azure">
              <Space>
                <CloudServerOutlined />
                Azure Active Directory
              </Space>
            </Option>
            <Option value="o365">
              <Space>
                <CloudServerOutlined />
                Office 365
              </Space>
            </Option>
          </Select>
        </Form.Item>

        <Alert
          message={credentialsApi.getServiceTypeDescription(serviceType)}
          description={getServiceTypeHelp(serviceType)}
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />

        <Divider />

        {/* AD Credentials */}
        {serviceType === 'ad' && (
          <>
            <Form.Item
              name="username"
              label="Username"
              rules={[
                { required: !credential, message: 'Username is required' },
                { max: 255, message: 'Username is too long' }
              ]}
            >
              <Input 
                placeholder="domain\username or username@domain.com"
                prefix={<UserOutlined />}
              />
            </Form.Item>

            <Form.Item
              name="password"
              label="Password"
              rules={[
                { required: !credential, message: 'Password is required' }
              ]}
              extra={credential ? 'Leave blank to keep current password' : undefined}
            >
              <Input.Password 
                placeholder={credential ? 'Enter new password to change' : 'Enter password'}
                prefix={<KeyOutlined />}
              />
            </Form.Item>
          </>
        )}

        {/* Azure/O365 Credentials */}
        {(serviceType === 'azure' || serviceType === 'o365') && (
          <>
            <Alert
              message="Authentication Options"
              description={
                <Space direction="vertical" style={{ width: '100%' }}>
                  <div>You can either:</div>
                  <div>1. Use OAuth authentication (recommended) - Sign in with your Microsoft account</div>
                  <div>2. Use app-only authentication - Enter Client ID and Client Secret</div>
                  <Divider style={{ margin: '8px 0' }} />
                  <div><strong>Note:</strong> Your Azure AD account can be different from your portal login account. The Azure AD credentials will be securely stored and associated with your portal user.</div>
                </Space>
              }
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />

            <Form.Item
              name="tenantId"
              label="Tenant ID"
              rules={[
                { required: !credential && !hasOAuthToken, message: 'Tenant ID is required' },
                { max: 255, message: 'Tenant ID is too long' }
              ]}
              initialValue={import.meta.env.VITE_AZURE_TENANT_ID}
            >
              <Input 
                placeholder="e.g., contoso.onmicrosoft.com or GUID"
                prefix={<CloudServerOutlined />}
                disabled={hasOAuthToken}
              />
            </Form.Item>

            <Form.Item
              name="clientId"
              label="Client ID (Application ID)"
              rules={[
                { required: !credential && !hasOAuthToken, message: 'Client ID is required' },
                { max: 255, message: 'Client ID is too long' }
              ]}
              initialValue={import.meta.env.VITE_AZURE_CLIENT_ID}
            >
              <Input 
                placeholder="Application (client) ID from Azure AD"
                prefix={<KeyOutlined />}
                disabled={hasOAuthToken}
              />
            </Form.Item>

            <Space direction="vertical" style={{ width: '100%', marginBottom: 24 }}>
              <Button
                type="primary"
                icon={<LoginOutlined />}
                onClick={handleOAuthLogin}
                loading={oauthLoading}
                block
              >
                {hasOAuthToken ? 'Re-authenticate with Microsoft' : 'Authenticate with Microsoft'}
              </Button>
              {hasOAuthToken && (
                <Alert
                  message="Authenticated"
                  description="You have successfully authenticated with Microsoft. Your access token will be stored securely."
                  type="success"
                  showIcon
                />
              )}
            </Space>

            <Divider>OR</Divider>

            <Form.Item
              name="clientSecret"
              label="Client Secret (for app-only authentication)"
              rules={[
                { required: !credential && !hasOAuthToken, message: 'Client Secret is required if not using OAuth' }
              ]}
              extra={credential ? 'Leave blank to keep current secret' : 'Required only if not using OAuth authentication'}
            >
              <Input.Password 
                placeholder={credential ? 'Enter new secret to change' : 'Enter client secret'}
                prefix={<KeyOutlined />}
                disabled={hasOAuthToken}
              />
            </Form.Item>
          </>
        )}

        <Divider />

        <Form.Item
          name="isDefault"
          label="Set as Default"
          valuePropName="checked"
        >
          <Switch />
        </Form.Item>

        {credential && (
          <Form.Item
            name="isActive"
            label="Active"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        )}

        <Alert
          message="Security Note"
          description="Credentials are encrypted before storage and transmitted securely over HTTPS."
          type="success"
          showIcon
          style={{ marginTop: 16 }}
        />
      </Form>
    </Modal>
  );
};

export default CredentialForm;
