/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from 'react';
import { Select, Radio, Space, Alert, Divider, Tooltip, Tag } from 'antd';
import { InfoCircleOutlined, UserOutlined, TeamOutlined, GlobalOutlined } from '@ant-design/icons';
import { ServiceCredential } from '@/types';
import { credentialsAPI } from '@/services/credentials.api';

const { Option } = Select;

interface GraphContextSelectorProps {
  value?: {
    credentialId?: number;
    queryContext?: 'application' | 'user' | 'organization';
    targetUser?: string;
    targetOrganization?: string;
  };
  onChange?: (value: Record<string, unknown>) => void;
  disabled?: boolean;
}

export const GraphContextSelector: React.FC<GraphContextSelectorProps> = ({
  value = {},
  onChange,
  disabled = false
}) => {
  const [credentials, setCredentials] = useState<ServiceCredential[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCredential, setSelectedCredential] = useState<ServiceCredential | null>(null);
  console.log('DEBUG: GraphContextSelector initialized');

  // Load Azure credentials
  useEffect(() => {
    loadCredentials();
  }, []);

  const loadCredentials = async () => {
    console.log('DEBUG: Loading Azure credentials');
    setLoading(true);
    try {
      const response = await credentialsAPI.getCredentials('azure');
      console.log('DEBUG: Azure credentials response:', response);
      if (response.success && ((response as any).data)) {
        const activeCredentials = ((response as any).data).filter(c => c.isActive);
        console.log('DEBUG: Active Azure credentials:', activeCredentials);
        setCredentials(activeCredentials);
      }
    } catch (error) {
      console.error('DEBUG: Failed to load Azure credentials:', error);
    } finally {
      setLoading(false);
    }
  };

  // Update selected credential details
  useEffect(() => {
    console.log('DEBUG: Updating selected credential', { value, credentials });
    if (value.credentialId && credentials.length > 0) {
      const cred = credentials.find(c => c.id === value.credentialId);
      console.log('DEBUG: Selected credential:', cred);
      setSelectedCredential(cred || null);
    }
  }, [value, credentials]);

  const handleCredentialChange = (credentialId: number) => {
    onChange?.({
      ...value,
      credentialId,
      // Reset context when changing credentials
      queryContext: 'application',
      targetUser: undefined,
      targetOrganization: undefined
    });
  };

  const handleContextChange = (queryContext: string) => {
    onChange?.({
      ...value,
      queryContext,
      // Clear specific targets when changing context
      targetUser: queryContext !== 'user' ? undefined : value.targetUser,
      targetOrganization: queryContext !== 'organization' ? undefined : value.targetOrganization
    });
  };

  const handleTargetUserChange = (targetUser: string) => {
    onChange?.({
      ...value,
      targetUser
    });
  };

  const handleTargetOrganizationChange = (targetOrganization: string) => {
    onChange?.({
      ...value,
      targetOrganization
    });
  };

  // Parse credential data to get tenant info
  const getTenantInfo = (credential: ServiceCredential) => {
    console.log('DEBUG: Parsing credential data for tenant info', credential);
    
    // Use type assertion to access encryptedData property
    const encryptedData = (credential as any).encryptedData || '{}';
    
    try {
      const data = JSON.parse(encryptedData);
      console.log('DEBUG: Parsed credential data:', data);
      return {
        tenantId: data.tenantId || 'Unknown',
        isMultiTenant: data.tenantId === 'common' || data.tenantId === 'organizations',
        supportedTenants: data.supportedTenants || []
      };
    } catch (error) {
      console.error('DEBUG: Error parsing credential data:', error);
      return { tenantId: 'Unknown', isMultiTenant: false, supportedTenants: [] };
    }
  };

  const tenantInfo = selectedCredential ? getTenantInfo(selectedCredential) : null;
  console.log('DEBUG: Tenant info:', tenantInfo);

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {/* Credential Selection */}
      <div>
        <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
          Azure AD Credential
          <Tooltip title="Select which Azure AD app registration to use">
            <InfoCircleOutlined style={{ marginLeft: 4, color: '#8c8c8c' }} />
          </Tooltip>
        </label>
        <Select
          style={{ width: '100%' }}
          placeholder="Select Azure AD credential"
          loading={loading}
          disabled={disabled}
          value={value.credentialId}
          onChange={handleCredentialChange}
        >
          {credentials.map(cred => {
            const info = getTenantInfo(cred);
            return (
              <Option key={cred.id} value={cred.id}>
                <Space>
                  {cred.credentialName}
                  {cred.isDefault && <Tag color="blue">Default</Tag>}
                  {info.isMultiTenant && <Tag color="green">Multi-Tenant</Tag>}
                </Space>
              </Option>
            );
          })}
        </Select>
      </div>

      {/* Show tenant information */}
      {tenantInfo && (
        <Alert
          message="Tenant Information"
          description={
            <Space direction="vertical" size="small">
              <div>
                <strong>Tenant ID:</strong> {tenantInfo.tenantId}
              </div>
              {tenantInfo.isMultiTenant && (
                <div>
                  <strong>Type:</strong> Multi-tenant application
                  {tenantInfo.supportedTenants.length > 0 && (
                    <div>
                      <strong>Accessible Tenants:</strong> {tenantInfo.supportedTenants.join(', ')}
                    </div>
                  )}
                </div>
              )}
            </Space>
          }
          type="info"
          showIcon
          style={{ marginTop: 8 }}
        />
      )}

      <Divider style={{ margin: '16px 0' }} />

      {/* Query Context Selection */}
      <div>
        <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
          Query Context
          <Tooltip title="Choose how to execute the query">
            <InfoCircleOutlined style={{ marginLeft: 4, color: '#8c8c8c' }} />
          </Tooltip>
        </label>
        <Radio.Group
          value={value.queryContext || 'application'}
          onChange={(e) => handleContextChange(e.target.value)}
          disabled={disabled || !value.credentialId}
        >
          <Space direction="vertical">
            <Radio value="application">
              <Space>
                <TeamOutlined />
                <span>Application Context</span>
                <Tooltip title="Query runs with full application permissions">
                  <InfoCircleOutlined style={{ color: '#8c8c8c' }} />
                </Tooltip>
              </Space>
            </Radio>
            
            <Radio value="user" disabled={!tenantInfo?.isMultiTenant}>
              <Space>
                <UserOutlined />
                <span>User Context</span>
                <Tooltip title="Query runs in the context of a specific user (requires delegated permissions)">
                  <InfoCircleOutlined style={{ color: '#8c8c8c' }} />
                </Tooltip>
              </Space>
            </Radio>
            
            <Radio value="organization" disabled={!tenantInfo?.isMultiTenant}>
              <Space>
                <GlobalOutlined />
                <span>Organization Context</span>
                <Tooltip title="Query runs for a specific organization/tenant">
                  <InfoCircleOutlined style={{ color: '#8c8c8c' }} />
                </Tooltip>
              </Space>
            </Radio>
          </Space>
        </Radio.Group>
      </div>

      {/* User Context Input */}
      {value.queryContext === 'user' && (
        <div style={{ marginTop: 16 }}>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
            Target User (UPN)
            <Tooltip title="Enter the User Principal Name (email) of the user to query as">
              <InfoCircleOutlined style={{ marginLeft: 4, color: '#8c8c8c' }} />
            </Tooltip>
          </label>
          <input
            type="email"
            placeholder="user@domain.com"
            value={value.targetUser || ''}
            onChange={(e) => handleTargetUserChange(e.target.value)}
            disabled={disabled}
            style={{
              width: '100%',
              padding: '4px 11px',
              border: '1px solid #d9d9d9',
              borderRadius: 6,
              fontSize: 14
            }}
          />
          <Alert
            message="Note: User context requires delegated permissions and user consent"
            type="warning"
            showIcon
            style={{ marginTop: 8 }}
          />
        </div>
      )}

      {/* Organization Context Input */}
      {value.queryContext === 'organization' && (
        <div style={{ marginTop: 16 }}>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
            Target Organization
            <Tooltip title="Enter the tenant ID or domain of the organization">
              <InfoCircleOutlined style={{ marginLeft: 4, color: '#8c8c8c' }} />
            </Tooltip>
          </label>
          <input
            placeholder="tenant.onmicrosoft.com or tenant-id"
            value={value.targetOrganization || ''}
            onChange={(e) => handleTargetOrganizationChange(e.target.value)}
            disabled={disabled}
            style={{
              width: '100%',
              padding: '4px 11px',
              border: '1px solid #d9d9d9',
              borderRadius: 6,
              fontSize: 14
            }}
          />
          {tenantInfo?.supportedTenants.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <strong>Quick Select:</strong>
              <Space wrap style={{ marginTop: 4 }}>
                {tenantInfo?.supportedTenants?.filter((tenant: string | undefined): tenant is string => tenant !== undefined).map((tenant: string) => (
                  <Tag
                    key={tenant}
                    color="blue"
                    style={{ cursor: 'pointer' }}
                    onClick={() => handleTargetOrganizationChange(tenant)}
                  >
                    {tenant}
                  </Tag>
                ))}
              </Space>
            </div>
          )}
          <Alert
            message="Note: Requires admin consent in the target organization"
            type="info"
            showIcon
            style={{ marginTop: 8 }}
          />
        </div>
      )}
    </Space>
  );
};