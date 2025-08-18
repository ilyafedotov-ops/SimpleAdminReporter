/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useMemo } from 'react';
import { Table, Card, Tabs, Tag, Space, Button, Badge, Collapse, Typography, Empty } from 'antd';
import { 
  UserOutlined, 
  TeamOutlined, 
  AppstoreOutlined, 
  
  ExpandOutlined,
  CompressOutlined,
  DownloadOutlined,
  SearchOutlined
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { QueryExecutionResult } from '@/types';


const { Panel } = Collapse;
const { Text, Title } = Typography;

interface GraphResultViewerProps {
  result: QueryExecutionResult;
  queryName: string;
  onExport?: (format: 'csv' | 'excel' | 'json') => void;
  height?: number | string;
}

export const GraphResultViewer: React.FC<GraphResultViewerProps> = ({
  result,
  queryName,
  onExport,
  height = 600
}) => {
  const [expandedRowKeys, setExpandedRowKeys] = useState<string[]>([]);
  const [searchText, setSearchText] = useState('');
  const [selectedTab, setSelectedTab] = useState('table');

  // Analyze the data structure
  const dataAnalysis = useMemo(() => {
    const data = result.result?.data || [];
    if (data.length === 0) return null;

    const firstItem = data[0];
    const fields = Object.keys(firstItem);
    
    // Categorize fields
    const basicFields: string[] = [];
    const objectFields: string[] = [];
    const arrayFields: string[] = [];
    const dateFields: string[] = [];

    fields.forEach(field => {
      const value = firstItem[field];
      if (value === null || value === undefined) {
        basicFields.push(field);
      } else if (Array.isArray(value)) {
        arrayFields.push(field);
      } else if (typeof value === 'object') {
        objectFields.push(field);
      } else if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
        dateFields.push(field);
      } else {
        basicFields.push(field);
      }
    });

    return {
      totalFields: fields.length,
      basicFields,
      objectFields,
      arrayFields,
      dateFields,
      hasRelationships: objectFields.length > 0 || arrayFields.length > 0
    };
  }, [result]);

  // Generate columns dynamically
  const generateColumns = (): ColumnsType<any> => {
    if (!dataAnalysis) return [];

    const columns: ColumnsType<any> = [];

    // Add basic fields as columns
    dataAnalysis.basicFields.forEach(field => {
      columns.push({
        title: formatFieldName(field),
        dataIndex: field,
        key: field,
        ellipsis: true,
        sorter: (a, b) => {
          const aVal = a[field];
          const bVal = b[field];
          if (typeof aVal === 'string') return aVal.localeCompare(bVal);
          return aVal - bVal;
        },
        render: (value) => renderBasicValue(value, field)
      });
    });

    // Add date fields with special formatting
    dataAnalysis.dateFields.forEach(field => {
      columns.push({
        title: formatFieldName(field),
        dataIndex: field,
        key: field,
        sorter: (a, b) => new Date(a[field]).getTime() - new Date(b[field]).getTime(),
        render: (value) => value ? new Date(value).toLocaleString() : '-'
      });
    });

    // Add object fields as expandable details
    if (dataAnalysis.objectFields.length > 0) {
      columns.push({
        title: 'Related Data',
        key: 'relatedData',
        render: (_, record) => (
          <Space>
            {dataAnalysis.objectFields.map(field => (
              record[field] && (
                <Tag key={field} color="blue">
                  {formatFieldName(field)}
                </Tag>
              )
            ))}
          </Space>
        )
      });
    }

    // Add array fields with count badges
    dataAnalysis.arrayFields.forEach(field => {
      columns.push({
        title: formatFieldName(field),
        dataIndex: field,
        key: field,
        render: (value) => (
          <Badge count={Array.isArray(value) ? value.length : 0} showZero>
            <Tag>{formatFieldName(field)}</Tag>
          </Badge>
        )
      });
    });

    return columns;
  };

  // Format field names for display
  const formatFieldName = (field: string): string => {
    return field
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .replace(/_/g, ' ')
      .trim();
  };

  // Render basic values with type-specific formatting
  const renderBasicValue = (value: any, field: string): React.ReactNode => {
    if (value === null || value === undefined) return <Text type="secondary">-</Text>;
    
    if (typeof value === 'boolean') {
      return <Tag color={value ? 'success' : 'default'}>{value ? 'Yes' : 'No'}</Tag>;
    }

    if (field.toLowerCase().includes('id') && typeof value === 'string') {
      return <Text code style={{ fontSize: '12px' }}>{value}</Text>;
    }

    if (field.toLowerCase().includes('mail') || field.toLowerCase().includes('email')) {
      return <a href={`mailto:${value}`}>{value}</a>;
    }

    return value;
  };

  // Render expandable row content
  const renderExpandedRow = (record: any) => {
    const relatedData: any[] = [];

    // Collect all object and array fields
    dataAnalysis?.objectFields.forEach(field => {
      if (record[field]) {
        relatedData.push({
          field: formatFieldName(field),
          type: 'object',
          data: record[field]
        });
      }
    });

    dataAnalysis?.arrayFields.forEach(field => {
      if (record[field] && Array.isArray(record[field])) {
        relatedData.push({
          field: formatFieldName(field),
          type: 'array',
          data: record[field]
        });
      }
    });

    if (relatedData.length === 0) return null;

    return (
      <Collapse defaultActiveKey={['0']} style={{ marginBottom: 16 }}>
        {relatedData.map((item, index) => (
          <Panel 
            header={
              <Space>
                {item.type === 'object' ? <AppstoreOutlined /> : <TeamOutlined />}
                <Text strong>{item.field}</Text>
                {item.type === 'array' && <Badge count={item.data.length} />}
              </Space>
            } 
            key={index}
          >
            {item.type === 'object' ? (
              <div style={{ padding: '8px 0' }}>
                {Object.entries(item.data).map(([key, value]) => (
                  <div key={key} style={{ marginBottom: 8 }}>
                    <Text type="secondary">{formatFieldName(key)}:</Text>{' '}
                    <Text>{renderBasicValue(value, key)}</Text>
                  </div>
                ))}
              </div>
            ) : (
              <Table
                dataSource={item.data}
                columns={generateNestedColumns(item.data[0])}
                size="small"
                pagination={{ pageSize: 5 }}
                rowKey={(_record, idx) => `${item.field}-${idx}`}
              />
            )}
          </Panel>
        ))}
      </Collapse>
    );
  };

  // Generate columns for nested data
  const generateNestedColumns = (sampleData: any): ColumnsType<any> => {
    if (!sampleData || typeof sampleData !== 'object') {
      return [{
        title: 'Value',
        dataIndex: 'value',
        render: (_, record) => <Text>{String(record)}</Text>
      }];
    }

    return Object.keys(sampleData).map(key => ({
      title: formatFieldName(key),
      dataIndex: key,
      key: key,
      ellipsis: true,
      render: (value) => renderBasicValue(value, key)
    }));
  };

  // Filter data based on search
  const filteredData = useMemo(() => {
    const data = result.result?.data || [];
    if (!searchText) return data;

    return data.filter(item => 
      JSON.stringify(item).toLowerCase().includes(searchText.toLowerCase())
    );
  }, [result, searchText]);

  // Statistics view
  const renderStatistics = () => {
    const data = result.result?.data || [];
    if (data.length === 0) return <Empty description="No data to analyze" />;

    // Calculate some basic statistics
    const stats = {
      totalRecords: data.length,
      uniqueFields: dataAnalysis?.totalFields || 0,
      relationshipFields: (dataAnalysis?.objectFields.length || 0) + (dataAnalysis?.arrayFields.length || 0),
      nullValues: 0,
      dataTypes: new Map<string, number>()
    };

    // Analyze data types and null values
    data.forEach(record => {
      Object.entries(record).forEach(([_key, _value]) => {
        if (_value === null || _value === undefined) {
          stats.nullValues++;
        }
        const type = Array.isArray(_value) ? 'array' : typeof _value;
        stats.dataTypes.set(type, (stats.dataTypes.get(type) || 0) + 1);
      });
    });

    return (
      <Card>
        <Title level={4}>Data Statistics</Title>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Card size="small" title="Overview">
            <Space direction="vertical">
              <Text>Total Records: <Text strong>{stats.totalRecords}</Text></Text>
              <Text>Total Fields: <Text strong>{stats.uniqueFields}</Text></Text>
              <Text>Relationship Fields: <Text strong>{stats.relationshipFields}</Text></Text>
              <Text>Null Values: <Text strong>{stats.nullValues}</Text></Text>
            </Space>
          </Card>
          
          <Card size="small" title="Data Types">
            <Space wrap>
              {Array.from(stats.dataTypes.entries()).map(([type, count]) => (
                <Tag key={type} color="blue">
                  {type}: {count}
                </Tag>
              ))}
            </Space>
          </Card>

          {dataAnalysis?.hasRelationships && (
            <Card size="small" title="Relationships">
              <Space direction="vertical">
                {dataAnalysis.objectFields.length > 0 && (
                  <Text>Object Relationships: {dataAnalysis.objectFields.join(', ')}</Text>
                )}
                {dataAnalysis.arrayFields.length > 0 && (
                  <Text>Collection Relationships: {dataAnalysis.arrayFields.join(', ')}</Text>
                )}
              </Space>
            </Card>
          )}
        </Space>
      </Card>
    );
  };

  return (
    <div style={{ height: typeof height === 'number' ? `${height}px` : height }}>
      <Card
        title={
          <Space>
            <UserOutlined />
            <Text strong>{queryName} Results</Text>
            <Badge count={filteredData.length} showZero style={{ backgroundColor: '#52c41a' }} />
          </Space>
        }
        extra={
          <Space>
            {onExport && (
              <>
                <Button 
                  icon={<DownloadOutlined />} 
                  onClick={() => onExport('csv')}
                  size="small"
                >
                  CSV
                </Button>
                <Button 
                  icon={<DownloadOutlined />} 
                  onClick={() => onExport('excel')}
                  size="small"
                >
                  Excel
                </Button>
                <Button 
                  icon={<DownloadOutlined />} 
                  onClick={() => onExport('json')}
                  size="small"
                >
                  JSON
                </Button>
              </>
            )}
          </Space>
        }
      >
        <Tabs 
          activeKey={selectedTab} 
          onChange={setSelectedTab}
          items={[
            {
              key: 'table',
              label: 'Table View',
              children: (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <Input.Search
                      placeholder="Search in results..."
                      allowClear
                      enterButton={<SearchOutlined />}
                      size="large"
                      onSearch={setSearchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      style={{ maxWidth: 400 }}
                    />
                  </div>
                  <Table
                    dataSource={filteredData}
                    columns={generateColumns()}
                    rowKey={(record, index) => ((record as any).id) || `row-${index}`}
                    expandable={dataAnalysis?.hasRelationships ? {
                      expandedRowRender: renderExpandedRow,
                      expandedRowKeys,
                      onExpandedRowsChange: (keys) => setExpandedRowKeys(keys as string[]),
                      expandIcon: ({ expanded, onExpand, record }) =>
                        expanded ? (
                          <CompressOutlined onClick={e => onExpand(record, e)} />
                        ) : (
                          <ExpandOutlined onClick={e => onExpand(record, e)} />
                        )
                    } : undefined}
                    scroll={{ x: 'max-content', y: 400 }}
                    pagination={{
                      showSizeChanger: true,
                      showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
                      defaultPageSize: 20,
                      pageSizeOptions: ['10', '20', '50', '100']
                    }}
                  />
                </>
              )
            },
            {
              key: 'stats',
              label: 'Statistics',
              children: renderStatistics()
            }
          ]}
        />
      </Card>
    </div>
  );
};

// Add missing import
import { Input } from 'antd';