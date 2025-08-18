import React from 'react';
import { Card, Typography, Space, Tag, Empty, Descriptions, Divider } from 'antd';
import { CodeOutlined, UnorderedListOutlined, GroupOutlined, SortAscendingOutlined } from '@ant-design/icons';
import type { CustomReportQuery } from '../../types';

const { Text, Title } = Typography;

interface QueryPreviewProps {
  query: CustomReportQuery;
  source: 'ad' | 'azure' | 'o365';
  title?: string;
  showCode?: boolean;
}

export const QueryPreview: React.FC<QueryPreviewProps> = ({
  query,
  source,
  title = 'Query Preview',
  showCode = false,
}) => {
  const getSourceLabel = () => {
    switch (source) {
      case 'ad': return 'Active Directory';
      case 'azure': return 'Azure AD';
      case 'o365': return 'Office 365';
      default: return source;
    }
  };

  const getOperatorLabel = (operator: string) => {
    const operatorMap: Record<string, string> = {
      equals: '=',
      notEquals: '≠',
      contains: 'contains',
      notContains: 'not contains',
      startsWith: 'starts with',
      endsWith: 'ends with',
      greaterThan: '>',
      lessThan: '<',
      greaterThanOrEqual: '≥',
      lessThanOrEqual: '≤',
      isEmpty: 'is empty',
      isNotEmpty: 'is not empty',
    };
    return operatorMap[operator] || operator;
  };

  const formatValue = (value: string | number | boolean | Date | string[] | null | undefined, dataType: string) => {
    if (value === null || value === undefined) return 'null';
    if (dataType === 'boolean') return value ? 'true' : 'false';
    if (dataType === 'datetime' && typeof value === 'string') {
      return new Date(value).toLocaleString();
    }
    if (dataType === 'array' && Array.isArray(value)) {
      return value.join(', ');
    }
    return String(value);
  };

  const renderFields = () => {
    if (query.fields.length === 0) {
      return <Empty description="No fields selected" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
    }

    return (
      <Space wrap>
        {query.fields.map((field, index) => (
          <Tag key={index} color="blue" icon={<UnorderedListOutlined />}>
            {field.displayName}
          </Tag>
        ))}
      </Space>
    );
  };

  const renderFilters = () => {
    if (query.filters.length === 0) {
      return <Text type="secondary">No filters applied</Text>;
    }

    return (
      <Space direction="vertical" style={{ width: '100%' }}>
        {query.filters.map((filter, index) => (
          <div key={index}>
            {index > 0 && <Tag color="blue" style={{ marginBottom: 8 }}>AND</Tag>}
            <Space>
              <Text strong>{filter.field}</Text>
              <Text type="secondary">{getOperatorLabel(filter.operator)}</Text>
              {!['isEmpty', 'isNotEmpty'].includes(filter.operator) && (
                <Text code>{formatValue(filter.value, filter.dataType)}</Text>
              )}
            </Space>
          </div>
        ))}
      </Space>
    );
  };

  const generateQueryCode = () => {
    const code = {
      source,
      fields: query.fields.map(f => f.name),
      filters: query.filters.map(f => ({
        field: f.field,
        operator: f.operator,
        value: f.value,
      })),
      ...(query.groupBy && { groupBy: query.groupBy }),
      ...(query.orderBy && { orderBy: query.orderBy }),
    };

    return JSON.stringify(code, null, 2);
  };

  return (
    <Card
      title={
        <Space>
          <CodeOutlined />
          <Text strong>{title}</Text>
        </Space>
      }
      size="small"
    >
      <Descriptions column={1} size="small">
        <Descriptions.Item label="Data Source">
          <Tag color="green">{getSourceLabel()}</Tag>
        </Descriptions.Item>
        
        <Descriptions.Item label="Selected Fields">
          {renderFields()}
        </Descriptions.Item>
        
        {query.filters.length > 0 && (
          <Descriptions.Item label="Filters">
            {renderFilters()}
          </Descriptions.Item>
        )}
        
        {query.groupBy && (
          <Descriptions.Item label="Group By">
            <Tag icon={<GroupOutlined />} color="purple">
              {query.groupBy}
            </Tag>
          </Descriptions.Item>
        )}
        
        {query.orderBy && (
          <Descriptions.Item label="Sort By">
            <Tag icon={<SortAscendingOutlined />} color="orange">
              {query.orderBy?.[0]?.field} ({query.orderBy?.[0]?.direction})
            </Tag>
          </Descriptions.Item>
        )}
      </Descriptions>

      {showCode && (
        <>
          <Divider />
          <div style={{ marginTop: 16 }}>
            <Title level={5}>Query JSON</Title>
            <pre style={{
              background: '#f5f5f5',
              padding: 12,
              borderRadius: 4,
              overflow: 'auto',
              maxHeight: 200,
              fontSize: 12,
            }}>
              {generateQueryCode()}
            </pre>
          </div>
        </>
      )}
    </Card>
  );
};

// Summary statistics component for query preview
interface QuerySummaryProps {
  fieldCount: number;
  filterCount: number;
  hasGrouping: boolean;
  hasSorting: boolean;
  estimatedRows?: number;
}

export const QuerySummary: React.FC<QuerySummaryProps> = ({
  fieldCount,
  filterCount,
  hasGrouping,
  hasSorting,
  estimatedRows,
}) => {
  return (
    <Space>
      <Tag color="blue">{fieldCount} fields</Tag>
      <Tag color="green">{filterCount} filters</Tag>
      {hasGrouping && <Tag color="purple">Grouped</Tag>}
      {hasSorting && <Tag color="orange">Sorted</Tag>}
      {estimatedRows !== undefined && (
        <Tag color="cyan">~{estimatedRows.toLocaleString()} rows</Tag>
      )}
    </Space>
  );
};