import React, { useEffect, useState, useCallback } from 'react';
import { Select, Space, Typography, Tag, Spin, Alert } from 'antd';
import { 
  CloudServerOutlined, 
  KeyOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined
} from '@ant-design/icons';
import { ServiceCredential } from '@/types';
import { credentialsAPI } from '@/services/credentials.api';

const { Option } = Select;
const { Text } = Typography;

interface CredentialSelectorProps {
  serviceType: 'ad' | 'azure' | 'o365';
  value?: number;
  onChange?: (credentialId: number | undefined) => void;
  disabled?: boolean;
  required?: boolean;
  showStatus?: boolean;
}

const CredentialSelector: React.FC<CredentialSelectorProps> = ({
  serviceType,
  value,
  onChange,
  disabled = false,
  required = false,
  showStatus = true
}) => {
  const [credentials, setCredentials] = useState<ServiceCredential[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCredentials = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await credentialsAPI.getCredentials(serviceType);
      if (response.success && (response as { data?: ServiceCredential[] }).data) {
        const activeCredentials = (response as { data: ServiceCredential[] }).data.filter(c => c.isActive);
        setCredentials(activeCredentials);
      
        // If no value is selected and there's a default, select it
        if (!value && activeCredentials.length > 0) {
          const defaultCred = activeCredentials.find(c => c.isDefault && c.isActive);
          if (defaultCred && onChange) {
            onChange(defaultCred.id);
          }
        }
      } else if (response.error) {
        setError(response.error);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? (error.message || String(error)) : 'Failed to load credentials';
      setError(message);
      setCredentials([]);
    } finally {
      setLoading(false);
    }
  }, [serviceType, value, onChange]);

  useEffect(() => {
    loadCredentials();
  }, [serviceType, loadCredentials]);

  const getCredentialStatus = (credential: ServiceCredential) => {
    const { status, message } = credentialsAPI.getCredentialStatus(credential);
    
    const icons = {
      success: <CheckCircleOutlined style={{ color: '#52c41a' }} />,
      error: <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />,
      warning: <ExclamationCircleOutlined style={{ color: '#faad14' }} />,
      default: <InfoCircleOutlined style={{ color: '#999' }} />
    };

    return {
      icon: icons[status],
      message,
      status
    };
  };

  const renderCredentialOption = (credential: ServiceCredential) => {
    const { icon, message, status } = getCredentialStatus(credential);
    
    return (
      <Option key={credential.id} value={credential.id}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space>
            <KeyOutlined />
            <Text>{credential.credentialName}</Text>
            {credential.isDefault && (
              <Tag color="gold" style={{ marginLeft: 8 }}>Default</Tag>
            )}
          </Space>
          {showStatus && (
            <Space>
              {icon}
              <Text type={status === 'error' ? 'danger' : status === 'warning' ? 'warning' : undefined}>
                {message}
              </Text>
            </Space>
          )}
        </Space>
      </Option>
    );
  };

  if (error && !loading) {
    return (
      <Alert
        message="Failed to load credentials"
        description={error}
        type="error"
        showIcon
      />
    );
  }

  return (
    <Select
      value={value}
      onChange={onChange}
      disabled={disabled || loading}
      loading={loading}
      placeholder={loading ? "Loading credentials..." : "Select credential (uses default if not specified)"}
      allowClear={!required}
      style={{ width: '100%' }}
      suffixIcon={loading ? <Spin size="small" /> : <CloudServerOutlined />}
      notFoundContent={
        loading ? (
          <Spin size="small" />
        ) : credentials.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 16 }}>
            <Text type="secondary">
              No active credentials found for {credentialsAPI.getServiceTypeDisplayName(serviceType)}.
              {' '}
              {!disabled && (
                <a href="/settings?tab=credentials" target="_blank" rel="noopener noreferrer">
                  Add credentials
                </a>
              )}
            </Text>
          </div>
        ) : null
      }
    >
      {credentials.map(renderCredentialOption)}
    </Select>
  );
};

export default CredentialSelector;