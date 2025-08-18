import React, { useState, useEffect, useCallback } from 'react';
import { Card, Form, Select, Input, Button, Space, Typography, Alert, Tag, Tooltip, Divider } from 'antd';
import { PlusOutlined, DeleteOutlined, InfoCircleOutlined, ClearOutlined } from '@ant-design/icons';

const { Text } = Typography;
const { Option } = Select;

export interface ODataFilter {
  id: string;
  field: string;
  operator: string;
  value: string | number | boolean;
  logicalOperator?: 'and' | 'or';
}

interface ODataOperator {
  value: string;
  label: string;
  description: string;
  valueType: 'string' | 'number' | 'boolean' | 'date' | 'list';
  example?: string;
}

const ODATA_OPERATORS: ODataOperator[] = [
  // Comparison operators
  { value: 'eq', label: 'Equals', description: 'Field equals value', valueType: 'string', example: "displayName eq 'John Doe'" },
  { value: 'ne', label: 'Not Equals', description: 'Field does not equal value', valueType: 'string', example: "department ne 'IT'" },
  { value: 'gt', label: 'Greater Than', description: 'Field is greater than value', valueType: 'string', example: "createdDateTime gt 2023-01-01T00:00:00Z" },
  { value: 'ge', label: 'Greater or Equal', description: 'Field is greater than or equal to value', valueType: 'string', example: "employeeId ge '1000'" },
  { value: 'lt', label: 'Less Than', description: 'Field is less than value', valueType: 'string', example: "lastSignInDateTime lt 2023-12-01T00:00:00Z" },
  { value: 'le', label: 'Less or Equal', description: 'Field is less than or equal to value', valueType: 'string', example: "passwordPolicies le 'Default'" },
  
  // String functions
  { value: 'startswith', label: 'Starts With', description: 'Field starts with value', valueType: 'string', example: "startswith(displayName, 'Admin')" },
  { value: 'endswith', label: 'Ends With', description: 'Field ends with value', valueType: 'string', example: "endswith(mail, '@contoso.com')" },
  { value: 'contains', label: 'Contains', description: 'Field contains value', valueType: 'string', example: "contains(displayName, 'Manager')" },
  
  // Collection operators
  { value: 'in', label: 'In', description: 'Field value is in list', valueType: 'list', example: "department in ('IT', 'HR', 'Finance')" },
  
  // Null checks
  { value: 'null', label: 'Is Null', description: 'Field is null', valueType: 'string', example: "manager eq null" },
  { value: 'not null', label: 'Is Not Null', description: 'Field is not null', valueType: 'string', example: "manager ne null" }
];

interface ODataFilterBuilderProps {
  availableFields: Array<{
    name: string;
    displayName: string;
    type: string;
    description?: string;
  }>;
  filters: ODataFilter[];
  onChange: (filters: ODataFilter[]) => void;
  disabled?: boolean;
}

export const ODataFilterBuilder: React.FC<ODataFilterBuilderProps> = ({
  availableFields,
  filters,
  onChange,
  disabled = false
}) => {
  const [previewQuery, setPreviewQuery] = useState<string>('');

  const addFilter = () => {
    const newFilter: ODataFilter = {
      id: `filter_${Date.now()}`,
      field: '',
      operator: 'eq',
      value: '',
      logicalOperator: filters.length > 0 ? 'and' : undefined
    };
    onChange([...filters, newFilter]);
  };

  const updateFilter = (filterId: string, updates: Partial<ODataFilter>) => {
    const updatedFilters = filters.map(filter =>
      filter.id === filterId ? { ...filter, ...updates } : filter
    );
    onChange(updatedFilters);
  };

  const removeFilter = (filterId: string) => {
    const updatedFilters = filters.filter(filter => filter.id !== filterId);
    // Remove logical operator from first filter if it becomes the first one
    if (updatedFilters.length > 0) {
      updatedFilters[0] = { ...updatedFilters[0], logicalOperator: undefined };
    }
    onChange(updatedFilters);
  };

  const clearAllFilters = () => {
    onChange([]);
  };

  const updatePreview = useCallback(() => {
    if (filters.length === 0) {
      setPreviewQuery('');
      return;
    }

    const queryParts = filters.map((filter, index) => {
      if (!filter.field || !filter.operator) return '';

      let filterExpression = '';
      const field = filter.field;
      const operator = filter.operator;
      const value = filter.value;

      // Build the filter expression based on operator
      switch (operator) {
        case 'startswith':
        case 'endswith':
        case 'contains':
          filterExpression = `${operator}(${field}, '${value}')`;
          break;
        case 'in': {
          // Handle list values
          const listValues = typeof value === 'string' 
            ? value.split(',').map(v => `'${v.trim()}'`).join(', ') 
            : `'${value}'`;
          filterExpression = `${field} in (${listValues})`;
          break;
        }
        case 'null':
          filterExpression = `${field} eq null`;
          break;
        case 'not null':
          filterExpression = `${field} ne null`;
          break;
        default: {
          // Standard comparison operators
          const quotedValue = typeof value === 'string' && 
            !['true', 'false', 'null'].includes(value.toLowerCase()) &&
            !value.match(/^\d+$/) ? `'${value}'` : value;
          filterExpression = `${field} ${operator} ${quotedValue}`;
          break;
        }
      }

      // Add logical operator for subsequent filters
      const logicalOp = index > 0 && filter.logicalOperator ? ` ${filter.logicalOperator} ` : '';
      return logicalOp + filterExpression;
    }).filter(Boolean);

    setPreviewQuery(queryParts.join(''));
  }, [filters]);

  const getOperatorInfo = (operatorValue: string) => {
    return ODATA_OPERATORS.find(op => op.value === operatorValue);
  };
  
  useEffect(() => {
    updatePreview();
  }, [filters, updatePreview]);

  return (
    <Card 
      title={
        <Space>
          <span>OData Filters</span>
          <Tooltip title="Build OData $filter expressions for Microsoft Graph queries">
            <InfoCircleOutlined style={{ color: '#1890ff' }} />
          </Tooltip>
        </Space>
      }
      size="small"
      extra={
        <Space>
          <Button
            size="small"
            icon={<ClearOutlined />}
            onClick={clearAllFilters}
            disabled={disabled || filters.length === 0}
          >
            Clear All
          </Button>
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            onClick={addFilter}
            disabled={disabled}
          >
            Add Filter
          </Button>
        </Space>
      }
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        {filters.length === 0 && (
          <Alert
            message="No filters applied"
            description="Add filters to refine your Graph query results. Filters use OData syntax."
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        {filters.map((filter, index) => (
          <Card key={filter.id} size="small" style={{ backgroundColor: '#fafafa' }}>
            <Form layout="vertical" size="small">
              <Space direction="vertical" style={{ width: '100%' }}>
                {index > 0 && (
                  <Form.Item label="Logical Operator" style={{ marginBottom: 8 }}>
                    <Select
                      value={filter.logicalOperator}
                      onChange={(value) => updateFilter(filter.id, { logicalOperator: value })}
                      style={{ width: 120 }}
                      disabled={disabled}
                    >
                      <Option value="and">AND</Option>
                      <Option value="or">OR</Option>
                    </Select>
                  </Form.Item>
                )}

                <div style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
                  <Form.Item label="Field" style={{ flex: 1, marginBottom: 0 }}>
                    <Select
                      value={filter.field}
                      onChange={(value) => updateFilter(filter.id, { field: value })}
                      placeholder="Select field"
                      showSearch
                      optionFilterProp="children"
                      disabled={disabled}
                    >
                      {availableFields.map(field => (
                        <Option key={field.name} value={field.name}>
                          <Space>
                            <span>{field.displayName}</span>
                            <Tag color="blue">{field.type}</Tag>
                          </Space>
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>

                  <Form.Item label="Operator" style={{ width: 150, marginBottom: 0 }}>
                    <Select
                      value={filter.operator}
                      onChange={(value) => updateFilter(filter.id, { operator: value })}
                      disabled={disabled}
                    >
                      {ODATA_OPERATORS.map(op => (
                        <Option key={op.value} value={op.value}>
                          <Tooltip title={op.description} placement="right">
                            {op.label}
                          </Tooltip>
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>

                  <Form.Item label="Value" style={{ flex: 1, marginBottom: 0 }}>
                    {filter.operator === 'null' || filter.operator === 'not null' ? (
                      <Input value="(no value needed)" disabled />
                    ) : filter.operator === 'in' ? (
                      <Input
                        value={filter.value as string}
                        onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
                        placeholder="value1, value2, value3"
                        disabled={disabled}
                      />
                    ) : (
                      <Input
                        value={filter.value as string}
                        onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
                        placeholder="Enter value"
                        disabled={disabled}
                      />
                    )}
                  </Form.Item>

                  <Button
                    icon={<DeleteOutlined />}
                    onClick={() => removeFilter(filter.id)}
                    disabled={disabled}
                    size="small"
                    danger
                  />
                </div>

                {filter.operator && getOperatorInfo(filter.operator) && (
                  <Alert
                    message={`Example: ${getOperatorInfo(filter.operator)?.example}`}
                    type="info"
                    showIcon
                    style={{ marginTop: 8 }}
                  />
                )}
              </Space>
            </Form>
          </Card>
        ))}

        {previewQuery && (
          <>
            <Divider style={{ margin: '16px 0' }} />
            <div>
              <Text strong>Generated OData Filter:</Text>
              <Card size="small" style={{ marginTop: 8, backgroundColor: '#f6f8fa' }}>
                <Text code style={{ fontSize: '12px', wordBreak: 'break-all' }}>
                  $filter={previewQuery}
                </Text>
              </Card>
            </div>
          </>
        )}
      </Space>
    </Card>
  );
};

export default ODataFilterBuilder;