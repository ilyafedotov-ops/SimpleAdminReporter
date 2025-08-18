/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from 'react';
import { Card, Tree, Typography, Space, Tag, Button, Tooltip, Alert, Spin, Switch } from 'antd';
import { BranchesOutlined, UserOutlined, TeamOutlined, LinkOutlined, ExpandAltOutlined, CompressOutlined } from '@ant-design/icons';
import type { DataNode } from 'antd/es/tree';

const { Text } = Typography;

interface GraphRelationship {
  name: string;
  displayName: string;
  targetEntity: string;
  type: 'one-to-one' | 'one-to-many' | 'many-to-many';
  description: string;
  isExpanded?: boolean;
  commonFields?: string[];
}

interface RelationshipNode extends DataNode {
  relationshipName?: string;
  entityType?: string;
  isExpanded?: boolean;
  level?: number;
}

const ENTITY_RELATIONSHIPS: Record<string, GraphRelationship[]> = {
  users: [
    {
      name: 'manager',
      displayName: 'Manager',
      targetEntity: 'user',
      type: 'one-to-one',
      description: 'Direct manager of the user',
      commonFields: ['displayName', 'userPrincipalName', 'jobTitle']
    },
    {
      name: 'directReports',
      displayName: 'Direct Reports',
      targetEntity: 'user',
      type: 'one-to-many',
      description: 'Users who report directly to this user',
      commonFields: ['displayName', 'userPrincipalName', 'department']
    },
    {
      name: 'memberOf',
      displayName: 'Member Of',
      targetEntity: 'group',
      type: 'many-to-many',
      description: 'Groups this user is a member of',
      commonFields: ['displayName', 'groupTypes', 'securityEnabled']
    },
    {
      name: 'ownedDevices',
      displayName: 'Owned Devices',
      targetEntity: 'device',
      type: 'one-to-many',
      description: 'Devices owned by this user',
      commonFields: ['displayName', 'operatingSystem', 'isCompliant']
    },
    {
      name: 'registeredDevices',
      displayName: 'Registered Devices',
      targetEntity: 'device',
      type: 'one-to-many',
      description: 'Devices registered by this user',
      commonFields: ['displayName', 'deviceId', 'isManaged']
    }
  ],
  groups: [
    {
      name: 'members',
      displayName: 'Members',
      targetEntity: 'user',
      type: 'many-to-many',
      description: 'Users who are members of this group',
      commonFields: ['displayName', 'userPrincipalName', 'accountEnabled']
    },
    {
      name: 'owners',
      displayName: 'Owners',
      targetEntity: 'user',
      type: 'many-to-many',
      description: 'Users who own/manage this group',
      commonFields: ['displayName', 'userPrincipalName', 'jobTitle']
    },
    {
      name: 'memberOf',
      displayName: 'Member Of',
      targetEntity: 'group',
      type: 'many-to-many',
      description: 'Parent groups this group belongs to',
      commonFields: ['displayName', 'groupTypes', 'description']
    }
  ],
  devices: [
    {
      name: 'registeredOwners',
      displayName: 'Registered Owners',
      targetEntity: 'user',
      type: 'many-to-many',
      description: 'Users who own this device',
      commonFields: ['displayName', 'userPrincipalName', 'department']
    },
    {
      name: 'registeredUsers',
      displayName: 'Registered Users',
      targetEntity: 'user',
      type: 'many-to-many',
      description: 'Users registered to use this device',
      commonFields: ['displayName', 'userPrincipalName', 'accountEnabled']
    }
  ],
  applications: [
    {
      name: 'owners',
      displayName: 'Owners',
      targetEntity: 'user',
      type: 'many-to-many',
      description: 'Users who own this application',
      commonFields: ['displayName', 'userPrincipalName', 'jobTitle']
    },
    {
      name: 'appRoleAssignments',
      displayName: 'App Role Assignments',
      targetEntity: 'appRoleAssignment',
      type: 'one-to-many',
      description: 'Role assignments for this application',
      commonFields: ['principalDisplayName', 'resourceDisplayName', 'appRoleId']
    }
  ]
};

const RELATIONSHIP_ICONS = {
  'one-to-one': <UserOutlined />,
  'one-to-many': <BranchesOutlined />,
  'many-to-many': <TeamOutlined />
};

interface GraphRelationshipExplorerProps {
  selectedEntity: string;
  selectedRelationships: string[];
  onRelationshipChange: (relationships: string[]) => void;
  onExpandRelationship: (relationship: string, expand: boolean) => void;
  disabled?: boolean;
  maxDepth?: number;
}

export const GraphRelationshipExplorer: React.FC<GraphRelationshipExplorerProps> = ({
  selectedEntity,
  selectedRelationships,
  onRelationshipChange,
  onExpandRelationship,
  disabled = false,
  maxDepth = 2
}) => {
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [checkedKeys, setCheckedKeys] = useState<string[]>(selectedRelationships);
  const [autoExpand, setAutoExpand] = useState(true);
  const [loading] = useState(false);

  useEffect(() => {
    setCheckedKeys(selectedRelationships);
  }, [selectedRelationships]);

  useEffect(() => {
    if (selectedEntity && autoExpand) {
      setExpandedKeys([selectedEntity]);
    }
  }, [selectedEntity, autoExpand]);

  const buildRelationshipTree = (entityType: string, level = 0, visited = new Set<string>()): RelationshipNode[] => {
    if (level >= maxDepth || visited.has(entityType)) {
      return [];
    }

    visited.add(entityType);
    const relationships = ENTITY_RELATIONSHIPS[entityType] || [];

    return relationships.map(rel => {
      const nodeKey = `${entityType}_${rel.name}_${level}`;
      const hasChildren = level < maxDepth - 1 && ENTITY_RELATIONSHIPS[rel.targetEntity];
      
      const node: RelationshipNode = {
        title: (
          <Space>
            {RELATIONSHIP_ICONS[rel.type]}
            <span>{rel.displayName}</span>
            <Tag color={rel.type === 'one-to-one' ? 'blue' : 
                                   rel.type === 'one-to-many' ? 'green' : 'orange'}>
              {rel.type}
            </Tag>
            <Tag>{rel.targetEntity}</Tag>
          </Space>
        ),
        key: nodeKey,
        relationshipName: rel.name,
        entityType: rel.targetEntity,
        level,
        children: hasChildren ? buildRelationshipTree(rel.targetEntity, level + 1, new Set(visited)) : undefined
      };

      return node;
    });
  };

  const rootNode: RelationshipNode = {
    title: (
      <Space>
        <UserOutlined />
        <Text strong>{selectedEntity}</Text>
        <Tag color="purple">Root Entity</Tag>
      </Space>
    ),
    key: selectedEntity,
    entityType: selectedEntity,
    level: 0,
    children: selectedEntity ? buildRelationshipTree(selectedEntity) : []
  };

  const handleCheck = (checkedKeysValue: any) => {
    const keys = Array.isArray(checkedKeysValue) ? checkedKeysValue : checkedKeysValue.checked;
    const relationshipKeys = keys.filter((key: string) => key !== selectedEntity);
    setCheckedKeys(relationshipKeys);
    onRelationshipChange(relationshipKeys);
  };

  const handleSelect = (selectedKeys: React.Key[], info: any) => {
    if (info.node.relationshipName) {
      const isExpanded = selectedKeys.includes(info.node.key);
      onExpandRelationship(info.node.relationshipName, isExpanded);
    }
  };

  const expandAll = () => {
    const getAllKeys = (nodes: RelationshipNode[]): string[] => {
      let keys: string[] = [];
      nodes.forEach(node => {
        keys.push(node.key as string);
        if (node.children) {
          keys = keys.concat(getAllKeys(node.children as RelationshipNode[]));
        }
      });
      return keys;
    };

    setExpandedKeys(getAllKeys([rootNode]));
  };

  const collapseAll = () => {
    setExpandedKeys([selectedEntity]);
  };

  const getRelationshipInfo = (relationshipName: string, entityType: string): GraphRelationship | undefined => {
    const relationships = ENTITY_RELATIONSHIPS[entityType] || [];
    return relationships.find(rel => rel.name === relationshipName);
  };

  if (!selectedEntity) {
    return (
      <Card title="Relationship Explorer" size="small">
        <Alert
          message="Select an entity type first"
          description="Choose a Graph entity type to explore its relationships"
          type="info"
          showIcon
        />
      </Card>
    );
  }

  const availableRelationships = ENTITY_RELATIONSHIPS[selectedEntity] || [];

  return (
    <Card 
      title={
        <Space>
          <BranchesOutlined />
          <span>Relationship Explorer</span>
        </Space>
      }
      size="small"
      extra={
        <Space size="small">
          <Tooltip title="Auto-expand when entity changes">
            <Switch
              size="small"
              checked={autoExpand}
              onChange={setAutoExpand}
              disabled={disabled}
            />
          </Tooltip>
          <Button size="small" icon={<ExpandAltOutlined />} onClick={expandAll} disabled={disabled}>
            Expand
          </Button>
          <Button size="small" icon={<CompressOutlined />} onClick={collapseAll} disabled={disabled}>
            Collapse
          </Button>
        </Space>
      }
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        {availableRelationships.length === 0 ? (
          <Alert
            message="No relationships available"
            description={`The ${selectedEntity} entity type has no defined relationships to explore.`}
            type="warning"
            showIcon
          />
        ) : (
          <>
            <Alert
              message="Relationship Selection"
              description="Check relationships to include in your query. Expanded relationships will fetch related data."
              type="info"
              showIcon
              style={{ fontSize: '12px' }}
            />

            {loading ? (
              <div style={{ textAlign: 'center', padding: '20px' }}>
                <Spin size="small" />
                <Text type="secondary" style={{ marginLeft: 8 }}>
                  Loading relationships...
                </Text>
              </div>
            ) : (
              <Tree
                checkable
                checkedKeys={checkedKeys}
                expandedKeys={expandedKeys}
                onCheck={handleCheck}
                onSelect={handleSelect}
                onExpand={(keys) => setExpandedKeys(keys as string[])}
                treeData={[rootNode]}
                disabled={disabled}
                style={{ 
                  backgroundColor: '#fafafa',
                  padding: '8px',
                  borderRadius: '4px',
                  border: '1px solid #d9d9d9'
                }}
              />
            )}

            {checkedKeys.length > 0 && (
              <div>
                <Text strong style={{ fontSize: '12px' }}>Selected Relationships:</Text>
                <div style={{ marginTop: 4 }}>
                  {checkedKeys.map(key => {
                    const parts = key.split('_');
                    const relationshipName = parts[1];
                    const entityType = parts[0];
                    const rel = getRelationshipInfo(relationshipName, entityType);
                    
                    return rel ? (
                      <Tooltip key={key} title={rel.description}>
                        <Tag 
                          color="blue" 
                          style={{ margin: '2px' }}
                          icon={<LinkOutlined />}
                        >
                          {rel.displayName}
                        </Tag>
                      </Tooltip>
                    ) : null;
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </Space>
    </Card>
  );
};

export default GraphRelationshipExplorer;