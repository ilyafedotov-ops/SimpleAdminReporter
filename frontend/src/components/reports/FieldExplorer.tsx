import React, { useState, useEffect } from 'react';
import { Card, Input, Tree, Tag, Tooltip, Space, Typography, Spin, Empty, Radio } from 'antd';
import { SearchOutlined, DatabaseOutlined, FieldStringOutlined, FieldNumberOutlined, CalendarOutlined, CheckCircleOutlined } from '@ant-design/icons';
import type { DataNode } from 'antd/es/tree';
import { FieldMetadata } from '../../types';

const { Search } = Input;
const { Text } = Typography;

interface FieldDataNode extends DataNode {
  data?: FieldMetadata;
}

interface FieldExplorerProps {
  fields: FieldMetadata[];
  selectedFields?: string[];
  onFieldSelect?: (field: FieldMetadata) => void;
  onFieldDeselect?: (field: FieldMetadata) => void;
  loading?: boolean;
  searchable?: boolean;
  selectable?: boolean;
  maxSelection?: number;
  height?: number;
}

export const FieldExplorer: React.FC<FieldExplorerProps> = ({
  fields,
  selectedFields = [],
  onFieldSelect,
  onFieldDeselect,
  loading = false,
  searchable = true,
  selectable = true,
  maxSelection,
  height = 400,
}) => {
  const [searchText, setSearchText] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>(selectedFields);
  const [viewMode, setViewMode] = useState<'tree' | 'list'>('tree');

  useEffect(() => {
    setSelectedKeys(selectedFields);
  }, [selectedFields]);

  const getFieldIcon = (dataType: string) => {
    switch (dataType) {
      case 'string':
        return <FieldStringOutlined style={{ color: '#1890ff' }} />;
      case 'number':
        return <FieldNumberOutlined style={{ color: '#52c41a' }} />;
      case 'boolean':
        return <CheckCircleOutlined style={{ color: '#722ed1' }} />;
      case 'datetime':
        return <CalendarOutlined style={{ color: '#fa8c16' }} />;
      case 'array':
        return <DatabaseOutlined style={{ color: '#13c2c2' }} />;
      default:
        return <FieldStringOutlined style={{ color: '#8c8c8c' }} />;
    }
  };

  const getDataTypeColor = (dataType: string) => {
    switch (dataType) {
      case 'string': return 'blue';
      case 'number': return 'green';
      case 'boolean': return 'purple';
      case 'datetime': return 'orange';
      case 'array': return 'cyan';
      default: return 'default';
    }
  };

  // Filter fields based on search text
  const filteredFields = fields.filter(field =>
    field.fieldName.toLowerCase().includes(searchText.toLowerCase()) ||
    field.displayName.toLowerCase().includes(searchText.toLowerCase()) ||
    (field.description?.toLowerCase().includes(searchText.toLowerCase()))
  );

  // Group fields by category for tree view
  const groupedFields = filteredFields.reduce((acc, field) => {
    const category = field.category || 'Other';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(field);
    return acc;
  }, {} as Record<string, FieldMetadata[]>);

  // Convert to tree data structure
  const treeData: FieldDataNode[] = Object.entries(groupedFields).map(([category, categoryFields]) => ({
    title: (
      <Space>
        <Text strong>{category}</Text>
        <Tag>{categoryFields.length}</Tag>
      </Space>
    ),
    key: category,
    selectable: false,
    children: categoryFields.map(field => ({
      title: (
        <Space>
          {getFieldIcon(field.dataType)}
          <Tooltip title={field.description || field.fieldName}>
            <Text>{field.displayName}</Text>
          </Tooltip>
          <Tag color={getDataTypeColor(field.dataType)}>
            {field.dataType}
          </Tag>
        </Space>
      ),
      key: field.fieldName,
      isLeaf: true,
      data: field,
    })),
  }));

  const handleSelect = (selectedKeysValue: React.Key[], info: { node: FieldDataNode; selected: boolean; selectedNodes: DataNode[]; nativeEvent: MouseEvent }) => {
    const { node, selected } = info;
    
    if (!selectable || !node.isLeaf) return;

    const field = node.data;
    
    if (!field) return;
    
    if (selected) {
      if (maxSelection && selectedKeys.length >= maxSelection) {
        return; // Max selection reached
      }
      onFieldSelect?.(field);
    } else {
      onFieldDeselect?.(field);
    }
    
    setSelectedKeys(selectedKeysValue);
  };

  const renderListView = () => (
    <div style={{ maxHeight: height, overflowY: 'auto' }}>
      {filteredFields.map(field => (
        <Card
          key={field.fieldName}
          size="small"
          style={{ marginBottom: 8, cursor: selectable ? 'pointer' : 'default' }}
          hoverable={selectable}
          onClick={() => {
            if (!selectable) return;
            const isSelected = selectedKeys.includes(field.fieldName);
            if (isSelected) {
              onFieldDeselect?.(field);
              setSelectedKeys(selectedKeys.filter(key => key !== field.fieldName));
            } else {
              if (maxSelection && selectedKeys.length >= maxSelection) return;
              onFieldSelect?.(field);
              setSelectedKeys([...selectedKeys, field.fieldName]);
            }
          }}
          className={selectedKeys.includes(field.fieldName) ? 'ant-card-selected' : ''}
        >
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <Space>
              {getFieldIcon(field.dataType)}
              <Text strong>{field.displayName}</Text>
              <Tag color={getDataTypeColor(field.dataType)}>
                {field.dataType}
              </Tag>
            </Space>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {field.fieldName}
            </Text>
            {field.description && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {field.description}
              </Text>
            )}
            <Space size="small">
              {field.isSearchable && <Tag>Searchable</Tag>}
              {field.isSortable && <Tag>Sortable</Tag>}
              {field.isExportable && <Tag>Exportable</Tag>}
            </Space>
          </Space>
        </Card>
      ))}
    </div>
  );

  return (
    <Card
      title={
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space>
            <DatabaseOutlined />
            <Text strong>Available Fields</Text>
            <Tag>{filteredFields.length} fields</Tag>
          </Space>
          <Radio.Group
            value={viewMode}
            onChange={e => setViewMode(e.target.value)}
            size="small"
          >
            <Radio.Button value="tree">Tree</Radio.Button>
            <Radio.Button value="list">List</Radio.Button>
          </Radio.Group>
        </Space>
      }
      size="small"
    >
      {searchable && (
        <Search
          placeholder="Search fields..."
          prefix={<SearchOutlined />}
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          style={{ marginBottom: 16 }}
          allowClear
        />
      )}
      
      <Spin spinning={loading}>
        {filteredFields.length === 0 ? (
          <Empty description="No fields found" />
        ) : viewMode === 'tree' ? (
          <Tree
            treeData={treeData}
            selectedKeys={selectedKeys}
            expandedKeys={expandedKeys}
            onExpand={setExpandedKeys}
            onSelect={handleSelect}
            multiple={selectable}
            checkable={false}
            showLine={{ showLeafIcon: false }}
            height={height}
            style={{ background: 'transparent' }}
          />
        ) : (
          renderListView()
        )}
      </Spin>
      
      {selectable && maxSelection && (
        <div style={{ marginTop: 16 }}>
          <Text type="secondary">
            Selected: {selectedKeys.length} / {maxSelection}
          </Text>
        </div>
      )}
    </Card>
  );
};