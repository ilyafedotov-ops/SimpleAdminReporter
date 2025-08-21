import React, { useState } from 'react';
import { Form, Input, Switch, Select, Alert, Space, Divider, Tooltip, FormInstance } from 'antd';
import { InfoCircleOutlined, GlobalOutlined, UserOutlined } from '@ant-design/icons';

const { Option } = Select;

interface AzureCredentialFormProps {
  form: FormInstance;
  loading?: boolean;
}

export const AzureCredentialForm: React.FC<AzureCredentialFormProps> = ({ form, loading }) => {
  const [authType, setAuthType] = useState<'application' | 'delegated'>('application');
  const [multiTenant, setMultiTenant] = useState(false);
  const [allowUserContext, setAllowUserContext] = useState(false);

  return (
    <>
      <Form.Item
        name="credentialName"
        label="Credential Name"
        rules={[{ required: true, message: 'Please enter a credential name' }]}
      >
        <Input placeholder="e.g., Contoso Azure AD" disabled={loading} />
      </Form.Item>

      <Divider orientation="left">Azure AD Configuration</Divider>

      <Form.Item
        name="tenantId"
        label={
          <span>
            Tenant ID
            <Tooltip title="Your Azure AD tenant ID or domain (e.g., contoso.onmicrosoft.com). Use 'common' for multi-tenant apps">
              <InfoCircleOutlined style={{ marginLeft: 4 }} />
            </Tooltip>
          </span>
        }
        rules={[{ required: true, message: 'Please enter the tenant ID' }]}
      >
        <Input 
          placeholder="tenant-id or tenant.onmicrosoft.com" 
          disabled={loading}
          onChange={(e) => {
            const value = e.target.value;
            if (value === 'common' || value === 'organizations') {
              setMultiTenant(true);
              form.setFieldsValue({ 
                'metadata.multiTenant': true 
              });
            }
          }}
        />
      </Form.Item>

      <Form.Item
        name="clientId"
        label={
          <span>
            Application (Client) ID
            <Tooltip title="The Application ID from your Azure AD app registration">
              <InfoCircleOutlined style={{ marginLeft: 4 }} />
            </Tooltip>
          </span>
        }
        rules={[{ required: true, message: 'Please enter the client ID' }]}
      >
        <Input placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" disabled={loading} />
      </Form.Item>

      <Form.Item
        name="clientSecret"
        label={
          <span>
            Client Secret
            <Tooltip title="The client secret from your Azure AD app registration">
              <InfoCircleOutlined style={{ marginLeft: 4 }} />
            </Tooltip>
          </span>
        }
        rules={[{ required: true, message: 'Please enter the client secret' }]}
      >
        <Input.Password placeholder="Enter client secret" disabled={loading} />
      </Form.Item>

      <Divider orientation="left">Advanced Options</Divider>

      <Form.Item
        name={['metadata', 'authType']}
        label="Authentication Type"
        initialValue="application"
      >
        <Select disabled={loading} onChange={setAuthType}>
          <Option value="application">
            <Space>
              <GlobalOutlined />
              Application (Client Credentials)
            </Space>
          </Option>
          <Option value="delegated" disabled>
            <Space>
              <UserOutlined />
              Delegated (On-Behalf-Of)
            </Space>
          </Option>
        </Select>
      </Form.Item>

      <Form.Item
        name={['metadata', 'multiTenant']}
        label={
          <span>
            Multi-Tenant Support
            <Tooltip title="Enable to query multiple Azure AD tenants with this credential">
              <InfoCircleOutlined style={{ marginLeft: 4 }} />
            </Tooltip>
          </span>
        }
        valuePropName="checked"
      >
        <Switch 
          disabled={loading} 
          onChange={setMultiTenant}
        />
      </Form.Item>

      {multiTenant && (
        <Form.Item
          name={['metadata', 'supportedTenants']}
          label={
            <span>
              Allowed Tenants
              <Tooltip title="List of tenant IDs/domains this app can access (leave empty for all consented tenants)">
                <InfoCircleOutlined style={{ marginLeft: 4 }} />
              </Tooltip>
            </span>
          }
        >
          <Select
            mode="tags"
            placeholder="Add tenant IDs or domains"
            disabled={loading}
            tokenSeparators={[',', ';', ' ']}
          />
        </Form.Item>
      )}

      <Form.Item
        name={['metadata', 'allowUserContext']}
        label={
          <span>
            Allow User Context Queries
            <Tooltip title="Enable to run queries in the context of specific users (requires delegated permissions)">
              <InfoCircleOutlined style={{ marginLeft: 4 }} />
            </Tooltip>
          </span>
        }
        valuePropName="checked"
      >
        <Switch 
          disabled={loading || authType !== 'application'} 
          onChange={setAllowUserContext}
        />
      </Form.Item>

      {allowUserContext && (
        <Form.Item
          name={['metadata', 'allowedUsers']}
          label={
            <span>
              Allowed Users (UPNs)
              <Tooltip title="List of user principal names that can be used for context queries (leave empty for all users)">
                <InfoCircleOutlined style={{ marginLeft: 4 }} />
              </Tooltip>
            </span>
          }
        >
          <Select
            mode="tags"
            placeholder="user@domain.com"
            disabled={loading}
            tokenSeparators={[',', ';', ' ']}
          />
        </Form.Item>
      )}

      <Form.Item
        name={['metadata', 'consentedScopes']}
        label={
          <span>
            API Permissions (Scopes)
            <Tooltip title="List the Graph API permissions granted to this app">
              <InfoCircleOutlined style={{ marginLeft: 4 }} />
            </Tooltip>
          </span>
        }
        initialValue={['https://graph.microsoft.com/.default']}
      >
        <Select
          mode="tags"
          placeholder="Add Graph API scopes"
          disabled={loading}
        >
          <Option value="https://graph.microsoft.com/.default">All Granted Permissions (.default)</Option>
          <Option value="User.Read.All">User.Read.All</Option>
          <Option value="Group.Read.All">Group.Read.All</Option>
          <Option value="Directory.Read.All">Directory.Read.All</Option>
          <Option value="AuditLog.Read.All">AuditLog.Read.All</Option>
          <Option value="Reports.Read.All">Reports.Read.All</Option>
        </Select>
      </Form.Item>

      <Alert
        message="Required Azure AD Setup"
        description={
          <ul style={{ paddingLeft: 20, margin: '8px 0' }}>
            <li>Register an application in Azure AD</li>
            <li>Grant necessary API permissions (e.g., User.Read.All, Group.Read.All)</li>
            <li>Get admin consent for the permissions</li>
            <li>Create a client secret and note the value</li>
            {multiTenant && <li>Configure multi-tenant access in app registration</li>}
          </ul>
        }
        type="info"
        showIcon
      />

      {multiTenant && (
        <Alert
          message="Multi-Tenant Configuration"
          description={
            <Space direction="vertical">
              <div>Your app registration must be configured for multi-tenant access:</div>
              <ul style={{ paddingLeft: 20, margin: '8px 0' }}>
                <li>Set "Supported account types" to "Accounts in any organizational directory"</li>
                <li>Each tenant must consent to your application</li>
                <li>Use tenant ID "common" or "organizations" in the configuration above</li>
              </ul>
            </Space>
          }
          type="warning"
          showIcon
          style={{ marginTop: 16 }}
        />
      )}
    </>
  );
};