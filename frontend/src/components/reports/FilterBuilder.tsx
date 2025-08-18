import React from 'react';
import { Card, Select, Input, Button, Space, DatePicker, InputNumber, Row, Col, Typography, Empty, Tag } from 'antd';
import { PlusOutlined, DeleteOutlined, CopyOutlined } from '@ant-design/icons';
import type { ReportFilter, FieldMetadata } from '../../types';
import dayjs from 'dayjs';

const { Text } = Typography;
const { Option } = Select;

interface FilterBuilderProps {
  filters: ReportFilter[];
  fields: FieldMetadata[];
  onChange: (filters: ReportFilter[]) => void;
  maxFilters?: number;
}

export const FilterBuilder: React.FC<FilterBuilderProps> = ({
  filters,
  fields,
  onChange,
  maxFilters = 10,
}) => {

  const operatorOptions: Record<string, Array<{ value: string; label: string }>> = {
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
    ],
    array: [
      { value: 'contains', label: 'Contains' },
      { value: 'notContains', label: 'Not Contains' },
      { value: 'isEmpty', label: 'Is Empty' },
      { value: 'isNotEmpty', label: 'Is Not Empty' },
    ],
  };

  const addFilter = () => {
    if (filters.length >= maxFilters) return;

    const newFilter: ReportFilter = {
      field: '',
      operator: 'equals',
      value: '',
      dataType: 'string',
    };

    onChange([...filters, newFilter]);
  };

  const updateFilter = (index: number, updates: Partial<ReportFilter>) => {
    const newFilters = [...filters];
    newFilters[index] = { ...newFilters[index], ...updates };
    onChange(newFilters);
  };

  const removeFilter = (index: number) => {
    const newFilters = filters.filter((_, i) => i !== index);
    onChange(newFilters);
  };

  const duplicateFilter = (index: number) => {
    if (filters.length >= maxFilters) return;
    const newFilters = [...filters];
    const duplicatedFilter = { ...filters[index] };
    newFilters.splice(index + 1, 0, duplicatedFilter);
    onChange(newFilters);
  };

  const renderValueInput = (filter: ReportFilter, index: number) => {
    const noValueOperators = ['isEmpty', 'isNotEmpty'];
    if (noValueOperators.includes(filter.operator)) {
      return null;
    }

    switch (filter.dataType) {
      case 'boolean':
        return (
          <Select
            value={filter.value}
            onChange={(value) => updateFilter(index, { value })}
            style={{ width: '100%' }}
          >
            <Option value={true}>True</Option>
            <Option value={false}>False</Option>
          </Select>
        );

      case 'number':
        return (
          <InputNumber
            value={filter.value as number}
            onChange={(value) => updateFilter(index, { value })}
            style={{ width: '100%' }}
          />
        );

      case 'datetime':
        return (
          <DatePicker
            value={filter.value && typeof filter.value === 'string' ? dayjs(filter.value) : undefined}
            onChange={(date) => updateFilter(index, { value: date?.toISOString() })}
            showTime
            style={{ width: '100%' }}
          />
        );

      default:
        return (
          <Input
            value={filter.value as string}
            onChange={(e) => updateFilter(index, { value: e.target.value })}
            placeholder="Enter value..."
          />
        );
    }
  };

  const getFieldMetadata = (fieldName: string): FieldMetadata | undefined => {
    return fields.find(f => f.fieldName === fieldName);
  };

  return (
    <Card
      title={
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Text strong>Filters</Text>
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
      }
      size="small"
    >
      {filters.length === 0 ? (
        <Empty
          description="No filters added"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        >
          <Button type="primary" onClick={addFilter}>
            Add First Filter
          </Button>
        </Empty>
      ) : (
        <Space direction="vertical" style={{ width: '100%' }}>
          {filters.map((filter, index) => {
            const availableOperators = operatorOptions[filter.dataType] || operatorOptions.string;
            const showValueInput = !['isEmpty', 'isNotEmpty'].includes(filter.operator);

            return (
              <Card
                key={index}
                size="small"
                style={{ marginBottom: index < filters.length - 1 ? 8 : 0 }}
                extra={
                  <Space size="small">
                    <Button
                      size="small"
                      icon={<CopyOutlined />}
                      onClick={() => duplicateFilter(index)}
                      disabled={filters.length >= maxFilters}
                    />
                    <Button
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => removeFilter(index)}
                    />
                  </Space>
                }
              >
                <Row gutter={[8, 8]}>
                  <Col span={24}>
                    <Space>
                      <Text type="secondary">Filter #{index + 1}</Text>
                      {index > 0 && <Tag color="blue">AND</Tag>}
                    </Space>
                  </Col>
                  <Col xs={24} sm={8}>
                    <Select
                      value={filter.field}
                      onChange={(value) => {
                        const field = getFieldMetadata(value);
                        if (field) {
                          updateFilter(index, {
                            field: value,
                            dataType: field.dataType as 'string' | 'number' | 'boolean' | 'datetime',
                            operator: 'equals',
                            value: '',
                          });
                        }
                      }}
                      placeholder="Select field"
                      style={{ width: '100%' }}
                      showSearch
                      filterOption={(input, option) =>
                        String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                      }
                    >
                      {fields.map(field => (
                        <Option
                          key={field.fieldName}
                          value={field.fieldName}
                          label={field.displayName}
                        >
                          <Space>
                            <Text>{field.displayName}</Text>
                            <Tag color={getDataTypeColor(field.dataType)}>
                              {field.dataType}
                            </Tag>
                          </Space>
                        </Option>
                      ))}
                    </Select>
                  </Col>
                  <Col xs={24} sm={8}>
                    <Select
                      value={filter.operator}
                      onChange={(value) => updateFilter(index, { operator: value })}
                      style={{ width: '100%' }}
                      disabled={!filter.field}
                    >
                      {availableOperators.map(op => (
                        <Option key={op.value} value={op.value}>
                          {op.label}
                        </Option>
                      ))}
                    </Select>
                  </Col>
                  {showValueInput && (
                    <Col xs={24} sm={8}>
                      {renderValueInput(filter, index)}
                    </Col>
                  )}
                </Row>
              </Card>
            );
          })}
        </Space>
      )}
      
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
      
      {filters.length >= maxFilters && (
        <div style={{ marginTop: 16 }}>
          <Text type="warning">Maximum number of filters reached ({maxFilters})</Text>
        </div>
      )}
    </Card>
  );
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