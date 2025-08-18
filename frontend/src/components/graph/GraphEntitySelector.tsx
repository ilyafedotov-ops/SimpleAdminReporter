import React, { useState, useEffect } from 'react';
import { Card, Select, Typography, Space, Tag, Tooltip, Alert, Spin } from 'antd';
import { UserOutlined, TeamOutlined, AppstoreOutlined, MobileOutlined, SafetyOutlined, GlobalOutlined } from '@ant-design/icons';
import { graphService } from '@/services/graphService';

const { Title, Text } = Typography;
const { Option } = Select;

export interface GraphEntity {
  type: string;
  displayName: string;
  description: string;
  icon: React.ReactElement;
  commonFields: string[];
  relationships: string[];
}

const GRAPH_ENTITIES: GraphEntity[] = [
  {
    type: 'users',
    displayName: 'Users',
    description: 'Azure AD user accounts and profiles',
    icon: <UserOutlined />,
    commonFields: ['displayName', 'userPrincipalName', 'mail', 'department', 'jobTitle', 'accountEnabled'],
    relationships: ['manager', 'directReports', 'memberOf', 'ownedDevices']
  },
  {
    type: 'groups',
    displayName: 'Groups',
    description: 'Security and distribution groups',
    icon: <TeamOutlined />,
    commonFields: ['displayName', 'description', 'groupTypes', 'mailEnabled', 'securityEnabled'],
    relationships: ['members', 'owners', 'memberOf']
  },
  {
    type: 'applications',
    displayName: 'Applications',
    description: 'Registered applications and service principals',
    icon: <AppstoreOutlined />,
    commonFields: ['displayName', 'appId', 'createdDateTime', 'publisherDomain'],
    relationships: ['owners', 'appRoleAssignments']
  },
  {
    type: 'devices',
    displayName: 'Devices',
    description: 'Managed devices and endpoints',
    icon: <MobileOutlined />,
    commonFields: ['displayName', 'deviceId', 'operatingSystem', 'isCompliant', 'isManaged'],
    relationships: ['registeredOwners', 'registeredUsers']
  },
  {
    type: 'directoryRoles',
    displayName: 'Directory Roles',
    description: 'Administrative roles and assignments',
    icon: <SafetyOutlined />,
    commonFields: ['displayName', 'description', 'roleTemplateId'],
    relationships: ['members']
  },
  {
    type: 'organization',
    displayName: 'Organization',
    description: 'Tenant and organization information',
    icon: <GlobalOutlined />,
    commonFields: ['displayName', 'verifiedDomains', 'assignedPlans', 'businessPhones'],
    relationships: []
  }
];

interface GraphEntitySelectorProps {
  selectedEntity?: string;
  onEntityChange: (entityType: string, entity: GraphEntity) => void;
  disabled?: boolean;
  showDescription?: boolean;
}

export const GraphEntitySelector: React.FC<GraphEntitySelectorProps> = ({
  selectedEntity,
  onEntityChange,
  disabled = false,
  showDescription = true
}) => {
  const [availableEntities, setAvailableEntities] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAvailableEntities();
  }, []);

  const loadAvailableEntities = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await graphService.getEntityTypes();
      if (response.success) {
        setAvailableEntities(((response as any).data) || []);
      } else {
        setError(response.error || 'Failed to load entity types');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleEntitySelect = (entityType: string) => {
    const entity = GRAPH_ENTITIES.find(e => e.type === entityType);
    if (entity) {
      onEntityChange(entityType, entity);
    }
  };

  const selectedEntityInfo = selectedEntity ? GRAPH_ENTITIES.find(e => e.type === selectedEntity) : null;

  return (
    <Card title="Select Graph Entity Type" size="small">
      <Space direction="vertical" style={{ width: '100%' }}>
        {error && (
          <Alert
            type="warning"
            message="Entity Loading Error"
            description={error}
            showIcon
            closable
            onClose={() => setError(null)}
          />
        )}
        
        <div>
          <Text strong>Entity Type:</Text>
          <Select
            value={selectedEntity}
            onChange={handleEntitySelect}
            placeholder="Choose a Graph entity type to query"
            style={{ width: '100%', marginTop: 8 }}
            disabled={disabled || loading}
            loading={loading}
            showSearch
            optionFilterProp="children"
          >
            {GRAPH_ENTITIES.map(entity => (
              <Option 
                key={entity.type} 
                value={entity.type}
                disabled={availableEntities.length > 0 && !availableEntities.includes(entity.type)}
              >
                <Space>
                  {entity.icon}
                  <span>{entity.displayName}</span>
                  {availableEntities.length > 0 && !availableEntities.includes(entity.type) && (
                    <Tag color="orange">Limited</Tag>
                  )}
                </Space>
              </Option>
            ))}
          </Select>
        </div>

        {selectedEntityInfo && showDescription && (
          <Card size="small" style={{ backgroundColor: '#fafafa' }}>
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              <div>
                <Space>
                  {selectedEntityInfo.icon}
                  <Title level={5} style={{ margin: 0 }}>
                    {selectedEntityInfo.displayName}
                  </Title>
                </Space>
                <Text type="secondary" style={{ fontSize: '12px' }}>
                  {selectedEntityInfo.description}
                </Text>
              </div>

              {selectedEntityInfo.commonFields.length > 0 && (
                <div>
                  <Text strong style={{ fontSize: '12px' }}>Common Fields:</Text>
                  <div style={{ marginTop: 4 }}>
                    {selectedEntityInfo.commonFields.map(field => (
                      <Tag key={field} color="blue" style={{ margin: '2px' }}>
                        {field}
                      </Tag>
                    ))}
                  </div>
                </div>
              )}

              {selectedEntityInfo.relationships.length > 0 && (
                <div>
                  <Text strong style={{ fontSize: '12px' }}>Available Relationships:</Text>
                  <div style={{ marginTop: 4 }}>
                    {selectedEntityInfo.relationships.map(rel => (
                      <Tooltip key={rel} title={`Expand ${rel} relationship`}>
                        <Tag color="green" style={{ margin: '2px' }}>
                          {rel}
                        </Tag>
                      </Tooltip>
                    ))}
                  </div>
                </div>
              )}
            </Space>
          </Card>
        )}

        {loading && (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <Spin size="small" />
            <Text type="secondary" style={{ marginLeft: 8 }}>
              Loading available entities...
            </Text>
          </div>
        )}
      </Space>
    </Card>
  );
};

export default GraphEntitySelector;