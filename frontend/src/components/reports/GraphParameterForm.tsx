/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from 'react';
import { Form, Input, Select, Switch, Button, Space, Row, Col, Divider, Tooltip, Alert } from 'antd';
import { PlayCircleOutlined, ClearOutlined, InfoCircleOutlined } from '@ant-design/icons';
import type { FormInstance, Rule } from 'antd/es/form';
import { GraphQueryDefinition } from '@/types';

import { GraphContextSelector } from './GraphContextSelector';

interface GraphParameterFormProps {
  queryDefinition: GraphQueryDefinition;
  onSubmit: (values: Record<string, any>) => void;
  loading?: boolean;
  initialValues?: Record<string, any>;
  form?: FormInstance;
  layout?: 'horizontal' | 'vertical' | 'inline';
  showButtons?: boolean;
  showCredentialSelector?: boolean;
}

// Common Graph API expand options
const COMMON_EXPAND_OPTIONS: Record<string, string[]> = {
  user: ['manager', 'directReports', 'memberOf', 'ownedDevices', 'registeredDevices', 'licenseDetails'],
  group: ['members', 'owners', 'memberOf'],
  application: ['owners'],
  device: ['registeredOwners', 'registeredUsers']
};

export const GraphParameterForm: React.FC<GraphParameterFormProps> = ({
  queryDefinition,
  onSubmit,
  loading = false,
  initialValues = {},
  form: externalForm,
  layout = 'vertical',
  showButtons = true,
  showCredentialSelector = true,
}) => {
  const [internalForm] = Form.useForm();
  const form = externalForm || internalForm;
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    // Set default values from query definition
    const defaults: Record<string, any> = {};
    
    if (queryDefinition.parameters) {
      Object.entries(queryDefinition.parameters).forEach(([key, param]) => {
        if (param.default !== undefined) {
          defaults[key] = param.default;
        }
      });
    }

    // Set Graph-specific defaults
    if (queryDefinition.query.select && !defaults.$select) {
      defaults.$select = queryDefinition.query.select.join(',');
    }
    if (queryDefinition.query.expand && !defaults.$expand) {
      defaults.$expand = queryDefinition.query.expand.join(',');
    }
    if (queryDefinition.query.top && !defaults.$top) {
      defaults.$top = queryDefinition.query.top;
    }
    if (queryDefinition.query.orderBy && !defaults.$orderby) {
      defaults.$orderby = queryDefinition.query.orderBy;
    }

    form.setFieldsValue({ ...defaults, ...initialValues });
  }, [queryDefinition, initialValues, form]);

  const renderParameterInput = (_name: string, param: { type: string; description?: string; required?: boolean; defaultValue?: unknown; min?: number; max?: number; options?: unknown[]; validation?: { min?: number; max?: number; pattern?: string; enum?: unknown[] } }) => {
    const commonProps = {
      placeholder: param.description,
      disabled: loading,
    };

    switch (param.type) {
      case 'string':
        return <Input {...commonProps} />;
      
      case 'number':
        return (
          <Input
            {...commonProps}
            type="number"
            min={param.min}
            max={param.max}
          />
        );
      
      case 'boolean':
        return (
          <Switch
            checkedChildren="Yes"
            unCheckedChildren="No"
            disabled={loading}
          />
        );
      
      case 'select':
        return (
          <Select
            {...commonProps}
            options={param.options?.map((opt: unknown) => ({ value: opt as string, label: opt as string }))}
          />
        );
      
      case 'multiselect':
        return (
          <Select
            {...commonProps}
            mode="multiple"
            options={param.options?.map((opt: unknown) => ({ value: opt as string, label: opt as string }))}
          />
        );
      
      default:
        return <Input {...commonProps} />;
    }
  };

  const getValidationRules = (name: string, param: { required?: boolean; pattern?: string; message?: string; validation?: { min?: number; max?: number; enum?: unknown[] } }): Rule[] => {
    const rules: Rule[] = [];

    if (param.required) {
      rules.push({
        required: true,
        message: `${name} is required`,
      });
    }

    if (param.pattern) {
      rules.push({
        pattern: new RegExp(param.pattern),
        message: param.message || `Invalid format for ${name}`,
      });
    }

    return rules;
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      
      // Process Graph-specific parameters
      const processedValues: Record<string, any> = { ...values };

      // Convert comma-separated values to arrays
      if (values.$select && typeof values.$select === 'string') {
        processedValues.$select = values.$select.split(',').map((s: string) => s.trim()).filter(Boolean);
      }
      if (values.$expand && typeof values.$expand === 'string') {
        processedValues.$expand = values.$expand.split(',').map((s: string) => s.trim()).filter(Boolean);
      }

      // Apply parameter transformations
      if (queryDefinition.parameters) {
        Object.entries(queryDefinition.parameters).forEach(([key, param]) => {
          if (param.transform && processedValues[key] !== undefined) {
            // Apply transformation based on type
            if (param.transform === 'daysToDate') {
              const days = parseInt(processedValues[key]);
              const date = new Date();
              date.setDate(date.getDate() - days);
              processedValues[key] = date.toISOString();
            }
            // Add more transformations as needed
          }
        });
      }

      onSubmit(processedValues);
    } catch (error) {
      console.error('Form validation failed:', error);
    }
  };

  const handleReset = () => {
    form.resetFields();
  };

  // Detect entity type from endpoint
  const getEntityType = () => {
    const endpoint = queryDefinition.query.endpoint;
    if (endpoint.includes('/users')) return 'user';
    if (endpoint.includes('/groups')) return 'group';
    if (endpoint.includes('/applications')) return 'application';
    if (endpoint.includes('/devices')) return 'device';
    return null;
  };

  const renderCustomParameters = () => {
    if (!queryDefinition.parameters) return null;

    const parameters = Object.entries(queryDefinition.parameters);
    if (parameters.length === 0) return null;

    return (
      <>
        <Divider orientation="left">Query Parameters</Divider>
        <Row gutter={16}>
          {parameters.map(([name, param]) => (
            <Col key={name} span={layout === 'horizontal' ? 12 : 24}>
              <Form.Item
                name={name}
                label={
                  <span>
                    {param.displayName || name}
                    {param.description && (
                      <Tooltip title={param.description}>
                        <InfoCircleOutlined style={{ marginLeft: 4, color: '#8c8c8c' }} />
                      </Tooltip>
                    )}
                  </span>
                }
                rules={getValidationRules(name, param)}
                valuePropName={param.type === 'boolean' ? 'checked' : 'value'}
              >
                {renderParameterInput(name, param)}
              </Form.Item>
            </Col>
          ))}
        </Row>
      </>
    );
  };

  const renderAdvancedOptions = () => {
    const entityType = getEntityType();
    const expandOptions = entityType ? COMMON_EXPAND_OPTIONS[entityType] : [];

    return (
      <>
        <Divider orientation="left">
          Advanced Options
          <Button
            type="link"
            size="small"
            onClick={() => setShowAdvanced(!showAdvanced)}
            style={{ marginLeft: 8 }}
          >
            {showAdvanced ? 'Hide' : 'Show'}
          </Button>
        </Divider>
        
        {showAdvanced && (
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item
                name="$select"
                label={
                  <span>
                    Select Fields
                    <Tooltip title="Comma-separated list of fields to return. Leave empty for default fields.">
                      <InfoCircleOutlined style={{ marginLeft: 4, color: '#8c8c8c' }} />
                    </Tooltip>
                  </span>
                }
              >
                <Input.TextArea
                  placeholder="displayName,userPrincipalName,mail,department"
                  rows={2}
                  disabled={loading}
                />
              </Form.Item>
            </Col>

            {expandOptions.length > 0 && (
              <Col span={24}>
                <Form.Item
                  name="$expand"
                  label={
                    <span>
                      Expand Relationships
                      <Tooltip title="Select related entities to include in the response">
                        <InfoCircleOutlined style={{ marginLeft: 4, color: '#8c8c8c' }} />
                      </Tooltip>
                    </span>
                  }
                >
                  <Select
                    mode="multiple"
                    placeholder="Select relationships to expand"
                    options={expandOptions.map(opt => ({ value: opt, label: opt }))}
                    disabled={loading}
                  />
                </Form.Item>
              </Col>
            )}

            <Col span={12}>
              <Form.Item
                name="$top"
                label={
                  <span>
                    Limit Results
                    <Tooltip title="Maximum number of results to return (1-999)">
                      <InfoCircleOutlined style={{ marginLeft: 4, color: '#8c8c8c' }} />
                    </Tooltip>
                  </span>
                }
                rules={[
                  { type: 'number', min: 1, max: 999, message: 'Must be between 1 and 999' }
                ]}
              >
                <Input
                  type="number"
                  placeholder="100"
                  disabled={loading}
                />
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item
                name="$orderby"
                label={
                  <span>
                    Order By
                    <Tooltip title="Field to sort results by (e.g., displayName desc)">
                      <InfoCircleOutlined style={{ marginLeft: 4, color: '#8c8c8c' }} />
                    </Tooltip>
                  </span>
                }
              >
                <Input
                  placeholder="displayName asc"
                  disabled={loading}
                />
              </Form.Item>
            </Col>

            <Col span={24}>
              <Form.Item
                name="$filter"
                label={
                  <span>
                    OData Filter
                    <Tooltip title="Advanced OData filter expression for complex queries">
                      <InfoCircleOutlined style={{ marginLeft: 4, color: '#8c8c8c' }} />
                    </Tooltip>
                  </span>
                }
              >
                <Input.TextArea
                  placeholder="startswith(displayName, 'A') and accountEnabled eq true"
                  rows={2}
                  disabled={loading}
                />
              </Form.Item>
            </Col>

            <Col span={24}>
              <Alert
                message="OData Filter Examples"
                description={
                  <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                    <li>Filter by department: <code>department eq 'Sales'</code></li>
                    <li>Filter by name: <code>startswith(displayName, 'John')</code></li>
                    <li>Complex filter: <code>accountEnabled eq true and createdDateTime ge 2024-01-01</code></li>
                  </ul>
                }
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
              />
            </Col>
          </Row>
        )}
      </>
    );
  };

  return (
    <Form
      form={form}
      layout={layout}
      onFinish={handleSubmit}
      scrollToFirstError
    >
      {showCredentialSelector && (
        <>
          <Form.Item
            name="graphContext"
            label="Execution Context"
            help="Configure how and in which context to execute the Graph API query"
          >
            <GraphContextSelector disabled={loading} />
          </Form.Item>
          <Divider />
        </>
      )}

      {/* Query Information */}
      <Alert
        message={queryDefinition.name}
        description={queryDefinition.description}
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      {/* Custom Parameters */}
      {renderCustomParameters()}

      {/* Advanced Options */}
      {renderAdvancedOptions()}

      {showButtons && (
        <Form.Item style={{ marginTop: 24 }}>
          <Space>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              icon={<PlayCircleOutlined />}
            >
              Execute Query
            </Button>
            <Button
              htmlType="button"
              onClick={handleReset}
              icon={<ClearOutlined />}
              disabled={loading}
            >
              Reset
            </Button>
          </Space>
        </Form.Item>
      )}
    </Form>
  );
};