import React, { useState, useEffect } from 'react';
import './EnhancedFieldExplorer.css';
import { 
  Card, 
  Input, 
  Tree, 
  Tag, 
  Tooltip, 
  Space, 
  Typography, 
  Spin, 
  Empty, 
  Radio, 
  Row, 
  Col, 
  Select, 
  InputNumber, 
  DatePicker, 
  Button, 
  
  Alert 
} from 'antd';
import { 
  SearchOutlined, 
  DatabaseOutlined, 
  FieldStringOutlined, 
  FieldNumberOutlined, 
  CalendarOutlined, 
  CheckCircleOutlined,
  PlusOutlined,
  DeleteOutlined,
  FilterOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type { DataNode } from 'antd/es/tree';
import { FieldMetadata, ReportFilter } from '../../types';

const { Search } = Input;
const { Text, Title } = Typography;
const { Option } = Select;

interface FieldDataNode extends DataNode {
  data?: FieldMetadata;
}

interface EnhancedFieldExplorerProps {
  fields: FieldMetadata[];
  selectedFields?: string[];
  filters?: ReportFilter[];
  onFieldSelect?: (field: FieldMetadata) => void;
  onFieldDeselect?: (field: FieldMetadata) => void;
  onFiltersChange?: (filters: ReportFilter[]) => void;
  loading?: boolean;
  searchable?: boolean;
  selectable?: boolean;
  maxSelection?: number;
  height?: number;
}

export const EnhancedFieldExplorer: React.FC<EnhancedFieldExplorerProps> = ({
  fields,
  selectedFields = [],
  filters = [],
  onFieldSelect,
  onFieldDeselect,
  onFiltersChange,
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
  const filteredFields = fields.filter(field => {
    const lowerSearch = searchText.toLowerCase();
    return (
      field.fieldName.toLowerCase().includes(lowerSearch) ||
      field.displayName.toLowerCase().includes(lowerSearch) ||
      (field.description?.toLowerCase().includes(lowerSearch)) ||
      ((field as { aliases?: string[] }).aliases?.some((alias: string) => alias.toLowerCase().includes(lowerSearch)))
    );
  });

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
          <Tooltip title={
            <div>
              <div>{field.description || field.fieldName}</div>
              {(field as { aliases?: string[] }).aliases && (field as { aliases?: string[] }).aliases!.length > 0 && (
                <div style={{ marginTop: 4, fontSize: 11 }}>
                  <span style={{ opacity: 0.8 }}>Aliases: </span>
                  <span style={{ fontFamily: 'monospace' }}>
                    {(field as { aliases?: string[] }).aliases!.join(', ')}
                  </span>
                </div>
              )}
            </div>
          }>
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
      // Remove filters for this field when deselecting
      const updatedFilters = filters.filter(f => f.field !== field.fieldName);
      onFiltersChange?.(updatedFilters);
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
              // Remove filters for this field
              const updatedFilters = filters.filter(f => f.field !== field.fieldName);
              onFiltersChange?.(updatedFilters);
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
            {(field as { aliases?: string[] }).aliases && (field as { aliases?: string[] }).aliases!.length > 0 && (
              <Text type="secondary" style={{ fontSize: 11, fontStyle: 'italic' }}>
                Aliases: {(field as { aliases?: string[] }).aliases!.join(', ')}
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

  // Get selected field metadata
  const getSelectedFields = () => {
    return selectedFields.map(fieldName => 
      fields.find(f => f.fieldName === fieldName)!
    ).filter(Boolean);
  };

  // Get available operators for a field type
  const getOperatorsForField = (fieldType: string) => {
    const operatorMap: Record<string, Array<{ value: string; label: string }>> = {
      string: [
        { value: 'equals', label: 'Equals' },
        { value: 'notEquals', label: 'Not Equals' },
        { value: 'contains', label: 'Contains' },
        { value: 'notContains', label: 'Not Contains' },
        { value: 'startsWith', label: 'Starts With' },
        { value: 'endsWith', label: 'Ends With' },
        { value: 'isEmpty', label: 'Is Empty' },
        { value: 'isNotEmpty', label: 'Is Not Empty' },
      ],
      number: [
        { value: 'equals', label: 'Equals' },
        { value: 'notEquals', label: 'Not Equals' },
        { value: 'greaterThan', label: 'Greater Than' },
        { value: 'lessThan', label: 'Less Than' },
        { value: 'greaterThanOrEqual', label: 'Greater Than or Equal' },
        { value: 'lessThanOrEqual', label: 'Less Than or Equal' },
        { value: 'isEmpty', label: 'Is Empty' },
        { value: 'isNotEmpty', label: 'Is Not Empty' },
      ],
      boolean: [
        { value: 'equals', label: 'Equals' },
        { value: 'notEquals', label: 'Not Equals' },
      ],
      datetime: [
        { value: 'equals', label: 'Equals' },
        { value: 'notEquals', label: 'Not Equals' },
        { value: 'greaterThan', label: 'After' },
        { value: 'lessThan', label: 'Before' },
        { value: 'greaterThanOrEqual', label: 'On or After' },
        { value: 'lessThanOrEqual', label: 'On or Before' },
        { value: 'isEmpty', label: 'Is Empty' },
        { value: 'isNotEmpty', label: 'Is Not Empty' },
      ]
    };

    return operatorMap[fieldType] || operatorMap.string;
  };

  // Add a filter for a specific field
  const addFilter = (fieldName: string) => {
    const field = fields.find(f => f.fieldName === fieldName);
    if (!field) return;

    const newFilter: ReportFilter = {
      field: fieldName,
      operator: 'equals',
      value: '',
      dataType: field.dataType === 'array' ? 'string' : field.dataType
    };

    const updatedFilters = [...filters, newFilter];
    onFiltersChange?.(updatedFilters);
  };

  // Update a filter
  const updateFilter = (index: number, updates: Partial<ReportFilter>) => {
    const updatedFilters = [...filters];
    updatedFilters[index] = { ...updatedFilters[index], ...updates };
    onFiltersChange?.(updatedFilters);
  };

  // Remove a filter
  const removeFilter = (index: number) => {
    const updatedFilters = filters.filter((_, i) => i !== index);
    onFiltersChange?.(updatedFilters);
  };

  // Render value input based on field type and operator
  const renderValueInput = (filter: ReportFilter, index: number) => {
    // Operators that don't require a value
    const noValueOperators = ['isEmpty', 'isNotEmpty'];
    if (noValueOperators.includes(filter.operator)) {
      return null;
    }

    // Get field metadata
    const field = fields.find(f => f.fieldName === filter.field);
    if (!field) return null;

    // Use field's dataType if filter's dataType is missing
    const dataType = filter.dataType || field.dataType;

    // Render appropriate input based on field type
    switch (dataType) {
      case 'boolean':
        return (
          <Select
            value={filter.value as boolean | undefined}
            onChange={(value) => updateFilter(index, { value })}
            style={{ width: '100%' }}
            placeholder="Select value"
            size="small"
          >
            <Option value={true}>True</Option>
            <Option value={false}>False</Option>
          </Select>
        );

      case 'number':
        return (
          <InputNumber
            value={filter.value as number | undefined}
            onChange={(value) => updateFilter(index, { value })}
            style={{ width: '100%' }}
            placeholder="Enter number"
            size="small"
          />
        );

      case 'datetime':
        return (
          <DatePicker
            value={filter.value && typeof filter.value === 'string' ? dayjs(filter.value) : undefined}
            onChange={(date) => updateFilter(index, { value: date?.toISOString() })}
            showTime
            style={{ width: '100%' }}
            placeholder="Select date and time"
            size="small"
          />
        );

      default:
        return (
          <Input
            value={filter.value as string | undefined}
            onChange={(e) => updateFilter(index, { value: e.target.value })}
            placeholder="Enter value"
            size="small"
          />
        );
    }
  };

  // Render selected fields with inline filters
  const renderSelectedFieldsWithFilters = () => {
    const selectedFieldsData = getSelectedFields();
    
    if (selectedFieldsData.length === 0) {
      return (
        <div className="empty-state">
          <Alert
            message="No fields selected"
            description="Select fields from the available fields tree/list above to start building your query."
            type="info"
            showIcon
            style={{ border: 'none', background: 'transparent' }}
          />
        </div>
      );
    }

    return (
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Title level={5} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <FilterOutlined />
          Selected Fields & Filters
          <Tag color="blue">{selectedFieldsData.length} fields</Tag>
        </Title>
        
        {selectedFieldsData.map(field => {
          const fieldFilters = filters.filter(f => f.field === field.fieldName);
          const availableOperators = getOperatorsForField(field.dataType);
          
          return (
            <Card key={field.fieldName} size="small" style={{ border: '1px solid #e8e8e8', marginBottom: 16 }}>
              {/* Field Header */}
              <div className="field-header">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Space>
                    {getFieldIcon(field.dataType)}
                    <Text strong>{field.displayName}</Text>
                    <Tag color={getDataTypeColor(field.dataType)}>
                      {field.dataType}
                    </Tag>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      ({field.fieldName})
                    </Text>
                  </Space>
                  {fieldFilters.length === 0 && (
                    <Button
                      type="link"
                      size="small"
                      icon={<PlusOutlined />}
                      onClick={() => addFilter(field.fieldName)}
                    >
                      Add Filter
                    </Button>
                  )}
                </div>
                
                {/* Field Description */}
                {field.description && (
                  <div style={{ marginTop: 4 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {field.description}
                    </Text>
                  </div>
                )}
              </div>

              {/* Filters for this field */}
              {fieldFilters.length > 0 && (
                <div className="field-body">
                  <div className="filter-section">
                    <Space direction="vertical" style={{ width: '100%' }} size="small">
                      {fieldFilters.map((filter, filterIndex) => {
                        const globalFilterIndex = filters.findIndex(f => 
                          f.field === filter.field && 
                          f.operator === filter.operator && 
                          f.value === filter.value
                        );
                        
                        const showValueInput = !['isEmpty', 'isNotEmpty'].includes(filter.operator);
                        
                        return (
                          <div key={filterIndex} className="filter-row">
                            <Row gutter={[8, 8]} align="middle">
                              <Col span={8}>
                                <Select
                                  value={filter.operator}
                                  onChange={(value) => updateFilter(globalFilterIndex, { 
                                    operator: value as ReportFilter['operator'] 
                                  })}
                                  style={{ width: '100%' }}
                                  placeholder="Select operator"
                                  size="small"
                                >
                                  {availableOperators.map(op => (
                                    <Option key={op.value} value={op.value}>
                                      {op.label}
                                    </Option>
                                  ))}
                                </Select>
                              </Col>
                              {showValueInput && (
                                <Col span={14}>
                                  {renderValueInput(filter, globalFilterIndex)}
                                </Col>
                              )}
                              <Col span={showValueInput ? 2 : 16}>
                                <Button
                                  size="small"
                                  danger
                                  icon={<DeleteOutlined />}
                                  onClick={() => removeFilter(globalFilterIndex)}
                                />
                              </Col>
                            </Row>
                          </div>
                        );
                      })}
                      <Button
                        type="dashed"
                        size="small"
                        icon={<PlusOutlined />}
                        onClick={() => addFilter(field.fieldName)}
                        style={{ width: '100%', marginTop: 8 }}
                      >
                        Add Another Filter for {field.displayName}
                      </Button>
                    </Space>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </Space>
    );
  };

  return (
    <Row gutter={[24, 24]}>
      {/* Available Fields */}
      <Col span={12}>
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
      </Col>

      {/* Selected Fields with Filters */}
      <Col span={12}>
        <Card
          title={
            <Space>
              <FilterOutlined />
              <Text strong>Query Builder</Text>
            </Space>
          }
          size="small"
          style={{ height: '100%' }}
        >
          <div className="selected-fields-container" style={{ maxHeight: height + 100 }}>
            {renderSelectedFieldsWithFilters()}
          </div>
        </Card>
      </Col>
    </Row>
  );
};