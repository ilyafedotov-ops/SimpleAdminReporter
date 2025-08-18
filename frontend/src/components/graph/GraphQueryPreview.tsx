import React, { useState, useEffect, useCallback } from 'react';
import { Card, Typography, Alert, Button, Space, Tabs, Tag, Divider, message } from 'antd';
import { EyeOutlined, CopyOutlined, CheckCircleOutlined, ExclamationCircleOutlined, PlayCircleOutlined, CodeOutlined } from '@ant-design/icons';
import { ODataFilter } from './ODataFilterBuilder';

const { Text } = Typography;
const { TabPane } = Tabs;

interface GraphQuerySpec {
  entityType: string;
  selectedFields: string[];
  filters: ODataFilter[];
  relationships: string[];
  orderBy?: {
    field: string;
    direction: 'asc' | 'desc';
  };
  top?: number;
  skip?: number;
}

interface QueryValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

interface GraphQueryPreviewProps {
  querySpec: GraphQuerySpec;
  onExecuteQuery?: (spec: GraphQuerySpec) => void;
  disabled?: boolean;
  showValidation?: boolean;
}

export const GraphQueryPreview: React.FC<GraphQueryPreviewProps> = ({
  querySpec,
  onExecuteQuery,
  disabled = false,
  showValidation = true
}) => {
  const [validation, setValidation] = useState<QueryValidation>({
    isValid: true,
    errors: [],
    warnings: [],
    suggestions: []
  });
  const [generatedUrl, setGeneratedUrl] = useState<string>('');
  const [oDataQuery, setODataQuery] = useState<string>('');

  const generateQuery = useCallback(() => {
    const buildFilterExpression = (filters: ODataFilter[]): string => {
      if (filters.length === 0) return '';

      return filters.map((filter, index) => {
        if (!filter.field || !filter.operator) return '';

        let expression = '';
        const { field, operator, value } = filter;

        switch (operator) {
          case 'startswith':
          case 'endswith':
          case 'contains':
            expression = `${operator}(${field}, '${value}')`;
            break;
          case 'in': {
            const listValues = typeof value === 'string' 
              ? value.split(',').map(v => `'${v.trim()}'`).join(', ')
              : `'${value}'`;
            expression = `${field} in (${listValues})`;
            break;
          }
          case 'null':
            expression = `${field} eq null`;
            break;
          case 'not null':
            expression = `${field} ne null`;
            break;
          default: {
            const quotedValue = typeof value === 'string' && 
              !['true', 'false', 'null'].includes(value.toLowerCase()) &&
              !value.match(/^\d+$/) ? `'${value}'` : value;
            expression = `${field} ${operator} ${quotedValue}`;
            break;
          }
        }

        const logicalOp = index > 0 && filter.logicalOperator ? ` ${filter.logicalOperator} ` : '';
        return logicalOp + expression;
      }).filter(Boolean).join('');
    };
    const { entityType, selectedFields, filters, relationships, orderBy, top, skip } = querySpec;
    
    if (!entityType) {
      setGeneratedUrl('');
      setODataQuery('');
      return;
    }

    // Build the base URL
    let url = `https://graph.microsoft.com/v1.0/${entityType}`;
    const queryParams: string[] = [];

    // Add $select for fields
    if (selectedFields.length > 0) {
      let selectFields = [...selectedFields];
      
      // Add relationship fields
      relationships.forEach(rel => {
        selectFields.push(rel);
      });
      
      queryParams.push(`$select=${selectFields.join(',')}`);
    }

    // Add $filter
    if (filters.length > 0) {
      const filterExpression = buildFilterExpression(filters);
      if (filterExpression) {
        queryParams.push(`$filter=${encodeURIComponent(filterExpression)}`);
      }
    }

    // Add $orderby
    if (orderBy && orderBy.field) {
      queryParams.push(`$orderby=${orderBy.field} ${orderBy.direction || 'asc'}`);
    }

    // Add $top
    if (top && top > 0) {
      queryParams.push(`$top=${top}`);
    }

    // Add $skip
    if (skip && skip > 0) {
      queryParams.push(`$skip=${skip}`);
    }

    // Add $expand for relationships
    if (relationships.length > 0) {
      queryParams.push(`$expand=${relationships.join(',')}`);
    }

    const fullUrl = queryParams.length > 0 ? `${url}?${queryParams.join('&')}` : url;
    setGeneratedUrl(fullUrl);
    
    // Generate OData query part only
    const oDataPart = queryParams.length > 0 ? queryParams.join('&') : '';
    setODataQuery(oDataPart);
  }, [querySpec]);

  const validateQuery = useCallback(() => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // Basic validation
    if (!querySpec.entityType) {
      errors.push('Entity type is required');
    }

    if (querySpec.selectedFields.length === 0) {
      warnings.push('No fields selected - all fields will be returned');
    }

    if (querySpec.selectedFields.length > 20) {
      warnings.push('Large number of fields selected may impact performance');
    }

    // Filter validation
    querySpec.filters.forEach((filter, index) => {
      if (!filter.field) {
        errors.push(`Filter ${index + 1}: Field is required`);
      }
      if (!filter.operator) {
        errors.push(`Filter ${index + 1}: Operator is required`);
      }
      if (!filter.value && filter.operator !== 'null' && filter.operator !== 'not null') {
        errors.push(`Filter ${index + 1}: Value is required for ${filter.operator} operator`);
      }
    });

    // Relationship validation
    if (querySpec.relationships.length > 5) {
      warnings.push('Many relationships expanded may cause performance issues');
    }

    // Suggestions
    if (querySpec.filters.length === 0 && querySpec.entityType === 'users') {
      suggestions.push('Consider adding a filter to limit results (e.g., accountEnabled eq true)');
    }

    if (!querySpec.top && querySpec.filters.length === 0) {
      suggestions.push('Consider setting a $top limit to control result size');
    }

    if (querySpec.selectedFields.includes('id') && querySpec.selectedFields.length === 1) {
      suggestions.push('Consider selecting additional fields for more useful results');
    }

    setValidation({
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions
    });
  }, [querySpec]);

  useEffect(() => {
    generateQuery();
    validateQuery();
  }, [generateQuery, validateQuery]);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      message.success('Copied to clipboard');
    } catch {
      // Ignore error
      message.error('Failed to copy to clipboard');
    }
  };

  const handleExecuteQuery = () => {
    if (onExecuteQuery && validation.isValid) {
      onExecuteQuery(querySpec);
    }
  };

  return (
    <Card 
      title={
        <Space>
          <EyeOutlined />
          <span>Query Preview</span>
        </Space>
      }
      size="small"
      extra={
        onExecuteQuery && (
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={handleExecuteQuery}
            disabled={disabled || !validation.isValid}
            size="small"
          >
            Execute Query
          </Button>
        )
      }
    >
      <Tabs size="small" defaultActiveKey="preview">
        <TabPane 
          tab={
            <Space>
              <CodeOutlined />
              <span>Query</span>
            </Space>
          } 
          key="preview"
        >
          <Space direction="vertical" style={{ width: '100%' }}>
            {!querySpec.entityType ? (
              <Alert
                message="No query to preview"
                description="Select an entity type and configure your query to see the preview."
                type="info"
                showIcon
              />
            ) : (
              <>
                <div>
                  <Space align="center">
                    <Text strong>Graph API URL:</Text>
                    <Button
                      size="small"
                      icon={<CopyOutlined />}
                      onClick={() => copyToClipboard(generatedUrl)}
                      disabled={!generatedUrl}
                    >
                      Copy
                    </Button>
                  </Space>
                  <Card size="small" style={{ marginTop: 8, backgroundColor: '#f6f8fa' }}>
                    <Text 
                      code 
                      style={{ 
                        fontSize: '11px', 
                        wordBreak: 'break-all',
                        display: 'block',
                        whiteSpace: 'pre-wrap'
                      }}
                    >
                      {generatedUrl}
                    </Text>
                  </Card>
                </div>

                {oDataQuery && (
                  <div>
                    <Space align="center">
                      <Text strong>OData Parameters:</Text>
                      <Button
                        size="small"
                        icon={<CopyOutlined />}
                        onClick={() => copyToClipboard(oDataQuery)}
                      >
                        Copy
                      </Button>
                    </Space>
                    <Card size="small" style={{ marginTop: 8, backgroundColor: '#f0f9ff' }}>
                      <Text code style={{ fontSize: '11px', wordBreak: 'break-all' }}>
                        {oDataQuery}
                      </Text>
                    </Card>
                  </div>
                )}

                <Divider style={{ margin: '12px 0' }} />

                <div>
                  <Text strong style={{ fontSize: '12px' }}>Query Summary:</Text>
                  <div style={{ marginTop: 8 }}>
                    <Space wrap>
                      <Tag color="blue">Entity: {querySpec.entityType}</Tag>
                      <Tag color="green">Fields: {querySpec.selectedFields.length || 'All'}</Tag>
                      <Tag color="orange">Filters: {querySpec.filters.length}</Tag>
                      <Tag color="purple">Relationships: {querySpec.relationships.length}</Tag>
                      {querySpec.top && <Tag color="cyan">Limit: {querySpec.top}</Tag>}
                    </Space>
                  </div>
                </div>
              </>
            )}
          </Space>
        </TabPane>

        {showValidation && (
          <TabPane 
            tab={
              <Space>
                {validation.isValid ? (
                  <CheckCircleOutlined style={{ color: '#52c41a' }} />
                ) : (
                  <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />
                )}
                <span>Validation</span>
                {(validation.errors.length > 0 || validation.warnings.length > 0) && (
                  <Tag color={validation.errors.length > 0 ? 'red' : 'orange'}>
                    {validation.errors.length + validation.warnings.length}
                  </Tag>
                )}
              </Space>
            } 
            key="validation"
          >
            <Space direction="vertical" style={{ width: '100%' }}>
              {validation.errors.length > 0 && (
                <Alert
                  message="Query Errors"
                  description={
                    <ul style={{ margin: 0, paddingLeft: '20px' }}>
                      {validation.errors.map((error, index) => (
                        <li key={index}>{error}</li>
                      ))}
                    </ul>
                  }
                  type="error"
                  showIcon
                />
              )}

              {validation.warnings.length > 0 && (
                <Alert
                  message="Query Warnings"
                  description={
                    <ul style={{ margin: 0, paddingLeft: '20px' }}>
                      {validation.warnings.map((warning, index) => (
                        <li key={index}>{warning}</li>
                      ))}
                    </ul>
                  }
                  type="warning"
                  showIcon
                />
              )}

              {validation.suggestions.length > 0 && (
                <Alert
                  message="Suggestions"
                  description={
                    <ul style={{ margin: 0, paddingLeft: '20px' }}>
                      {validation.suggestions.map((suggestion, index) => (
                        <li key={index}>{suggestion}</li>
                      ))}
                    </ul>
                  }
                  type="info"
                  showIcon
                />
              )}

              {validation.isValid && validation.warnings.length === 0 && validation.suggestions.length === 0 && (
                <Alert
                  message="Query is valid"
                  description="Your Graph query looks good and is ready to execute."
                  type="success"
                  showIcon
                />
              )}
            </Space>
          </TabPane>
        )}
      </Tabs>
    </Card>
  );
};

export default GraphQueryPreview;