import React, { useState } from 'react';
import { 
  Table, 
  Button, 
  Tag, 
  Space, 
  Tooltip, 
  Popconfirm, 
  message,
  Badge,
  Typography 
} from 'antd';
import { 
  EditOutlined, 
  DeleteOutlined, 
  CheckCircleOutlined,
  CloseCircleOutlined,
  CloudServerOutlined,
  StarOutlined,
  StarFilled,
  ExperimentOutlined,
  QuestionCircleOutlined
} from '@ant-design/icons';
import { ServiceCredential } from '@/types';
import { credentialsApi } from '@/services/credentials.api';
import { ColumnsType } from 'antd/es/table';

const { Text } = Typography;

interface CredentialListProps {
  credentials: ServiceCredential[];
  loading: boolean;
  onEdit: (credential: ServiceCredential) => void;
  onRefresh: () => void;
}

const CredentialList: React.FC<CredentialListProps> = ({ 
  credentials, 
  loading, 
  onEdit, 
  onRefresh 
}) => {
  const [testingId, setTestingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const handleTest = async (credentialId: number) => {
    setTestingId(credentialId);
    try {
      const result = await credentialsApi.testCredential(credentialId);
      if (result.success) {
        message.success(result.message);
      } else {
        message.error(result.message);
      }
      // Refresh to show updated test status
      onRefresh();
    } catch (error) {
      message.error((error as Error).message || 'Failed to test credential');
    } finally {
      setTestingId(null);
    }
  };

  const handleDelete = async (credentialId: number) => {
    setDeletingId(credentialId);
    try {
      await credentialsApi.deleteCredential(credentialId);
      message.success('Credential deleted successfully');
      onRefresh();
    } catch (error) {
      message.error((error as Error).message || 'Failed to delete credential');
    } finally {
      setDeletingId(null);
    }
  };

  const handleSetDefault = async (credentialId: number) => {
    try {
      await credentialsApi.setDefaultCredential(credentialId);
      message.success('Default credential updated');
      onRefresh();
    } catch (error) {
      message.error((error as Error).message || 'Failed to set default credential');
    }
  };

  const getStatusBadge = (credential: ServiceCredential) => {
    const { status, message: statusMessage } = credentialsApi.getCredentialStatus(credential);
    
    const statusConfig = {
      success: { color: 'success', icon: <CheckCircleOutlined /> },
      error: { color: 'error', icon: <CloseCircleOutlined /> },
      warning: { color: 'warning', icon: <QuestionCircleOutlined /> },
      default: { color: 'default', icon: <QuestionCircleOutlined /> }
    };

    const config = statusConfig[status];

    return (
      <Tooltip title={statusMessage}>
        <Badge 
          status={config.color as 'success' | 'error' | 'warning' | 'default'} 
          text={
            <Space size={4}>
              {config.icon}
              <Text type={status === 'error' ? 'danger' : undefined}>
                {statusMessage}
              </Text>
            </Space>
          } 
        />
      </Tooltip>
    );
  };

  const columns: ColumnsType<ServiceCredential> = [
    {
      title: 'Name',
      dataIndex: 'credentialName',
      key: 'credentialName',
      render: (name: string, record: ServiceCredential) => (
        <Space>
          <Text strong>{name}</Text>
          {record.isDefault && (
            <Tooltip title="Default credential">
              <StarFilled style={{ color: '#faad14' }} />
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: 'Service',
      dataIndex: 'serviceType',
      key: 'serviceType',
      width: 150,
      render: (type: string) => (
        <Tag icon={<CloudServerOutlined />} color="blue">
          {credentialsApi.getServiceTypeDisplayName(type as 'ad' | 'azure' | 'o365')}
        </Tag>
      ),
    },
    {
      title: 'Username/Client',
      key: 'identifier',
      width: 200,
      render: (_, record) => (
        <Text ellipsis={{ tooltip: true }}>
          {record.username || record.clientId || '-'}
        </Text>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      width: 200,
      render: (_, record) => getStatusBadge(record),
    },
    {
      title: 'Active',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 80,
      render: (isActive: boolean) => (
        <Tag color={isActive ? 'success' : 'error'}>
          {isActive ? 'Active' : 'Inactive'}
        </Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 200,
      render: (_, record) => (
        <Space>
          <Tooltip title="Test Connection">
            <Button
              size="small"
              icon={<ExperimentOutlined />}
              onClick={() => handleTest(record.id)}
              loading={testingId === record.id}
            />
          </Tooltip>
          <Tooltip title="Edit">
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => onEdit(record)}
            />
          </Tooltip>
          {!record.isDefault && (
            <Tooltip title="Set as Default">
              <Button
                size="small"
                icon={<StarOutlined />}
                onClick={() => handleSetDefault(record.id)}
              />
            </Tooltip>
          )}
          <Popconfirm
            title="Delete Credential"
            description="Are you sure you want to delete this credential?"
            onConfirm={() => handleDelete(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Tooltip title="Delete">
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                loading={deletingId === record.id}
                disabled={record.isDefault}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const groupedCredentials = credentials.reduce((acc, cred) => {
    if (!acc[cred.serviceType]) {
      acc[cred.serviceType] = [];
    }
    acc[cred.serviceType].push(cred);
    return acc;
  }, {} as Record<string, ServiceCredential[]>);

  return (
    <div className="credential-list">
      {Object.entries(groupedCredentials).map(([serviceType, creds]) => (
        <div key={serviceType} style={{ marginBottom: 24 }}>
          <Typography.Title level={5} style={{ marginBottom: 16 }}>
            {credentialsApi.getServiceTypeDisplayName(serviceType as 'ad' | 'azure' | 'o365')}
          </Typography.Title>
          <Table
            columns={columns}
            dataSource={creds}
            rowKey="id"
            loading={loading}
            pagination={false}
            size="small"
          />
        </div>
      ))}
      
      {credentials.length === 0 && !loading && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <CloudServerOutlined style={{ fontSize: 48, color: '#999' }} />
          <Typography.Text type="secondary" style={{ display: 'block', marginTop: 16 }}>
            No credentials configured yet. Add credentials to connect to your services.
          </Typography.Text>
        </div>
      )}
    </div>
  );
};

export default CredentialList;