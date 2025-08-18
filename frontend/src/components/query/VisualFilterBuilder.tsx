import React, { useState, useEffect } from 'react';
import dayjs from 'dayjs';
import { 
  Card, 
  Typography, 
  Space, 
  Button, 
  Select, 
  Input, 
  DatePicker, 
  InputNumber, 
  Tag, 
  
  Tooltip,
  Row,
  Col,
  
} from 'antd';
import { 
  PlusOutlined, 
  DeleteOutlined, 
  CopyOutlined,
  QuestionCircleOutlined
} from '@ant-design/icons';
import { ReportFilter, FieldMetadata } from '../../types';
import { NaturalLanguageParser } from '../../utils/NaturalLanguageParser';

const { Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

// Props interface for the VisualFilterBuilder component
interface VisualFilterBuilderProps {
  filters: ReportFilter[];
  fields: FieldMetadata[];
  onChange: (filters: ReportFilter[]) => void;
  maxFilters?: number;
  showNaturalLanguageInput?: boolean;
  showAddGroupButton?: boolean;
  className?: string;
}

// Visual filter builder component
const VisualFilterBuilder: React.FC<VisualFilterBuilderProps> = ({
  filters = [],
  fields,
  onChange,
  maxFilters = 10,
  showNaturalLanguageInput = true,
  showAddGroupButton = true,
  className = ''
}) => {
  // State for natural language input
  const [naturalLanguageInput, setNaturalLanguageInput] = useState('');
  const [showNaturalLanguage, setShowNaturalLanguage] = useState(true); // Show by default
  const [showExamples, setShowExamples] = useState(false);
  
  // Create parser instance
  const parser = new NaturalLanguageParser(fields);

  // Effect to update natural language input when filters change
  useEffect(() => {
    if (filters.length === 0) {
      setNaturalLanguageInput('');
    }
  }, [filters.length]);

  // Add a new empty filter
  const addFilter = () => {
    if (filters.length >= maxFilters) return;

    const newFilter: ReportFilter = {
      field: '',
      operator: 'equals',
      value: '',
      dataType: 'string'
    };

    // Ensure the new filter has the correct type
    const typedFilter = {
      field: newFilter.field,
      operator: newFilter.operator,
      value: newFilter.value,
      dataType: newFilter.dataType
    };
    onChange([...filters, typedFilter]);
  };

  // Add a filter group (for future implementation)
  const addFilterGroup = () => {
    // This would be implemented with nested filter groups
    // For now, just add a regular filter
    addFilter();
  };

  // Update a filter at a specific index
  const updateFilter = (index: number, updates: Partial<ReportFilter>) => {
    const newFilters = [...filters];
    newFilters[index] = { ...newFilters[index], ...updates };
    onChange(newFilters);
  };

  // Remove a filter at a specific index
  const removeFilter = (index: number) => {
    const newFilters = filters.filter((_, i) => i !== index);
    onChange(newFilters);
  };

  // Duplicate a filter at a specific index
  const duplicateFilter = (index: number) => {
    if (filters.length >= maxFilters) return;
    
    const newFilters = [...filters];
    const filter = filters[index];
    const fieldMetadata = getFieldMetadata(filter.field);
    const dataType = 'dataType' in filter ? filter.dataType : fieldMetadata?.dataType || 'string';
    
    const duplicatedFilter = {
      field: filter.field,
      operator: filter.operator as ReportFilter['operator'],
      value: filter.value,
      dataType: dataType as ReportFilter['dataType']
    };
    newFilters.splice(index + 1, 0, duplicatedFilter);
    onChange(newFilters);
  };

  // Get field metadata for a field name
  const getFieldMetadata = (fieldName: string): FieldMetadata | undefined => {
    return fields.find(f => f.fieldName === fieldName);
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

  // Render value input based on field type and operator
  const renderValueInput = (filter: ReportFilter, index: number) => {
    // Operators that don't require a value
    const noValueOperators = ['isEmpty', 'isNotEmpty'];
    if (noValueOperators.includes(filter.operator)) {
      return null;
    }

    // Get field metadata
    const field = getFieldMetadata(filter.field);
    if (!field) return null;

    // Use field's dataType if filter's dataType is missing
    const dataType = filter.dataType || field.dataType;

    // Render appropriate input based on field type
    switch (dataType) {
      case 'boolean':
        return (
          <Select
            value={filter.value as boolean | undefined}
            onChange={(value) => updateFilter(index, { value: value as boolean })}
            style={{ width: '100%' }}
            placeholder="Select value"
          >
            <Option value={true}>True</Option>
            <Option value={false}>False</Option>
          </Select>
        );

      case 'number':
        return (
          <InputNumber
            value={filter.value as number | undefined}
            onChange={(value) => updateFilter(index, { value: value as number })}
            style={{ width: '100%' }}
            placeholder="Enter number"
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
          />
        );

      default:
        return (
          <Input
            value={filter.value as string | undefined}
            onChange={(e) => updateFilter(index, { value: e.target.value })}
            placeholder="Enter value"
          />
        );
    }
  };

  // Handle natural language input submission
  const handleNaturalLanguageSubmit = () => {
    if (!naturalLanguageInput.trim()) return;

    try {
      const parsedFilters = parser.parse(naturalLanguageInput);
      // Ensure all filters have the correct type
      const typedFilters = parsedFilters.map(f => ({
        field: f.field,
        operator: f.operator,
        value: f.value,
        dataType: f.dataType
      }));
      onChange(typedFilters);
      setNaturalLanguageInput('');
      setShowNaturalLanguage(false);
    } catch (error) {
      console.error('Error parsing natural language input:', error);
    }
  };

  // Get suggestions for field names

  // Render the natural language input section
  const renderNaturalLanguageInput = () => {
    if (!showNaturalLanguageInput) return null;

    return (
      <div style={{ marginBottom: 24 }}>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Space style={{ marginBottom: 8 }}>
              <Text strong style={{ fontSize: 16 }}>Describe your filters in plain English</Text>
              <Tooltip title="Type your filters naturally, like 'show users who logged in last month'">
                <QuestionCircleOutlined style={{ color: '#1890ff' }} />
              </Tooltip>
            </Space>
            <TextArea
              value={naturalLanguageInput}
              onChange={(e) => setNaturalLanguageInput(e.target.value)}
              onPressEnter={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleNaturalLanguageSubmit();
                }
              }}
              placeholder="Example: show active users from sales department who haven't logged in for 30 days"
              {...(process.env.NODE_ENV === 'test' 
                ? { rows: 4 } 
                : { autoSize: { minRows: 3, maxRows: 6 } }
              )}
              style={{ 
                minHeight: '80px',
                fontSize: 14,
                borderRadius: 8,
                padding: '12px 16px'
              }}
            />
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Space>
              <Button 
                type="primary" 
                onClick={handleNaturalLanguageSubmit}
                size="large"
                disabled={!naturalLanguageInput.trim()}
              >
                Apply Filters
              </Button>
              <Button onClick={() => setShowExamples(!showExamples)}>
                {showExamples ? 'Hide' : 'Show'} Examples
              </Button>
            </Space>
            {filters.length > 0 && (
              <Button 
                type="link" 
                onClick={() => setShowNaturalLanguage(!showNaturalLanguage)}
              >
                Switch to manual mode
              </Button>
            )}
          </div>
          
          {showExamples && (
            <Card size="small" style={{ backgroundColor: '#f5f5f5' }}>
              <Text strong>Example filters you can use:</Text>
              <div style={{ marginTop: 8 }}>
                {[
                  "users where status is active and department is sales",
                  "accounts created before January 2024",
                  "employees who haven't logged in for 90 days",
                  "computers with Windows 10 or Windows 11",
                  "mailboxes larger than 5GB"
                ].map((example, index) => (
                  <div key={index} style={{ marginTop: 4 }}>
                    <Text 
                      code 
                      style={{ cursor: 'pointer' }}
                      onClick={() => setNaturalLanguageInput(example)}
                    >
                      {example}
                    </Text>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </Space>
      </div>
    );
  };

  return (
    <Card
      className={className}
      title={
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Text strong>Filters</Text>
          <Space>
            {showAddGroupButton && (
              <Button
                size="small"
                icon={<PlusOutlined />}
                onClick={addFilterGroup}
                disabled={filters.length >= maxFilters}
              >
                Add Group
              </Button>
            )}
            <Button
              type="primary"
              size="small"
              icon={<PlusOutlined />}
              onClick={addFilter}
              disabled={filters.length >= maxFilters}
            >
              Add Filter
            </Button>
          </Space>
        </Space>
      }
      size="small"
    >
      {/* Natural language input */}
      {renderNaturalLanguageInput()}

      {/* Filters list */}
      {filters.length === 0 ? (
        showNaturalLanguageInput ? null : (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <Text type="secondary">
              No filters added. Use natural language or add filters manually.
            </Text>
            <div style={{ marginTop: 16 }}>
              <Space>
                <Button type="primary" onClick={() => setShowNaturalLanguage(true)}>
                  Use Natural Language
                </Button>
                <Button onClick={addFilter}>
                  Add Manual Filter
                </Button>
              </Space>
            </div>
          </div>
        )
      ) : (
        <Space direction="vertical" style={{ width: '100%' }}>
          {filters.map((filter, index) => {
            // Ensure filter has dataType property
            const field = getFieldMetadata(filter.field);
            const dataType = ('dataType' in filter ? filter.dataType : field?.dataType || 'string') as ReportFilter['dataType'];
            const operator = filter.operator as ReportFilter['operator'];
            const filterWithDataType = { ...filter, dataType, operator };
            
            const availableOperators = getOperatorsForField(field?.dataType || 'string');
            const showValueInput = !['isEmpty', 'isNotEmpty'].includes(filter.operator);

            return (
              <Card
                key={index}
                size="small"
                style={{ 
                  marginBottom: index < filters.length - 1 ? 8 : 0,
                  border: '1px solid #e8e8e8'
                }}
                extra={
                  <Space size="small">
                    <Tooltip title="Duplicate filter">
                      <Button
                        size="small"
                        icon={<CopyOutlined />}
                        onClick={() => duplicateFilter(index)}
                        disabled={filters.length >= maxFilters}
                      />
                    </Tooltip>
                    <Tooltip title="Remove filter">
                      <Button
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => removeFilter(index)}
                      />
                    </Tooltip>
                  </Space>
                }
              >
                <Row gutter={[8, 8]}>
                  <Col xs={24} sm={8}>
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Text strong>Field</Text>
                      <Select
                        value={filter.field || undefined}
                        onChange={(value) => {
                          const field = getFieldMetadata(value);
                          if (field) {
                            // Map array fields to string type for filtering
                            const filterDataType = field.dataType === 'array' ? 'string' : field.dataType;
                            
                            updateFilter(index, {
                              field: value,
                              dataType: filterDataType as ReportFilter['dataType'],
                              operator: 'equals',
                              value: ''
                            });
                          }
                        }}
                        style={{ width: '100%' }}
                        placeholder="Select field"
                        showSearch
                        optionFilterProp="children"
                        filterOption={(input, option) =>
                          String(option?.children ?? '').toLowerCase().includes(input.toLowerCase())
                        }
                      >
                        {fields.map(field => (
                          <Option
                            key={field.fieldName}
                            value={field.fieldName}
                          >
                            <Space>
                              <Text>{field.displayName}</Text>
                              <Tag color="blue" style={{ marginLeft: 8 }}>
                                {field.dataType}
                              </Tag>
                            </Space>
                          </Option>
                        ))}
                      </Select>
                    </Space>
                  </Col>

                  <Col xs={24} sm={8}>
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Text strong>Operator</Text>
                      <Select
                        value={filter.operator}
                        onChange={(value) => updateFilter(index, { operator: value as ReportFilter['operator'] })}
                        style={{ width: '100%' }}
                        placeholder="Select operator"
                        disabled={!filter.field}
                      >
                        {availableOperators.map(op => (
                          <Option key={op.value} value={op.value}>
                            {op.label}
                          </Option>
                        ))}
                      </Select>
                    </Space>
                  </Col>

                  {showValueInput && (
                    <Col xs={24} sm={8}>
                      <Space direction="vertical" style={{ width: '100%' }}>
                        <Text strong>Value</Text>
                        {renderValueInput(filterWithDataType, index)}
                      </Space>
                    </Col>
                  )}
                </Row>

                {/* Logic connector for multiple filters */}
                {index > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <Tag color="blue">AND</Tag>
                    <Text type="secondary" style={{ marginLeft: 8 }}>
                      All conditions must be met
                    </Text>
                  </div>
                )}
              </Card>
            );
          })}
        </Space>
      )}

      {/* Add another filter button */}
      {filters.length > 0 && filters.length < maxFilters && (
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            onClick={addFilter}
            style={{ width: '100%' }}
          >
            Add Another Filter
          </Button>
        </div>
      )}

      {/* Maximum filters reached message */}
      {filters.length >= maxFilters && (
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <Text type="warning">
            Maximum number of filters reached ({maxFilters})
          </Text>
        </div>
      )}
    </Card>
  );
};

export default VisualFilterBuilder;