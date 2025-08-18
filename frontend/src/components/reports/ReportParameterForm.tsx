import React, { useEffect } from 'react';
import { Form, Input, Select, DatePicker, InputNumber, Switch, Button, Space, Row, Col, Divider } from 'antd';
import { PlayCircleOutlined, ClearOutlined } from '@ant-design/icons';
import type { FormInstance } from 'antd';
import { ReportParameter as TypesReportParameter } from '@/types';
import dayjs from 'dayjs';
import CredentialSelector from './CredentialSelector';

interface ReportParameter extends TypesReportParameter {
  placeholder?: string;
  helpText?: string;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    message?: string;
  };
}

type FormValues = Record<string, string | number | boolean | string[] | Date | dayjs.Dayjs | null | undefined>;

interface ReportParameterFormProps {
  parameters: ReportParameter[];
  onSubmit: (values: FormValues) => void;
  loading?: boolean;
  initialValues?: FormValues;
  form?: FormInstance;
  layout?: 'horizontal' | 'vertical' | 'inline';
  showButtons?: boolean;
  serviceType?: 'ad' | 'azure' | 'o365';
  showCredentialSelector?: boolean;
}

export const ReportParameterForm: React.FC<ReportParameterFormProps> = ({
  parameters,
  onSubmit,
  loading = false,
  initialValues = {},
  form: externalForm,
  layout = 'vertical',
  showButtons = true,
  serviceType,
  showCredentialSelector = true,
}) => {
  const [internalForm] = Form.useForm();
  const form = externalForm || internalForm;

  useEffect(() => {
    // Set default values
    const defaults = parameters.reduce((acc, param) => {
      if (param.defaultValue !== undefined) {
        acc[param.name] = param.type === 'date' || param.type === 'datetime' 
          ? (typeof param.defaultValue === 'string' || param.defaultValue instanceof Date ? dayjs(param.defaultValue) : undefined)
          : param.defaultValue;
      }
      return acc;
    }, {} as FormValues);

    form.setFieldsValue({ ...defaults, ...initialValues });
  }, [parameters, initialValues, form]);

  const renderParameterInput = (parameter: ReportParameter) => {
    const commonProps = {
      placeholder: parameter.placeholder,
      disabled: loading,
    };

    switch (parameter.type) {
      case 'string':
        return <Input {...commonProps} />;

      case 'number':
        return (
          <InputNumber
            {...commonProps}
            style={{ width: '100%' }}
            min={parameter.validation?.min}
            max={parameter.validation?.max}
          />
        );

      case 'date':
        return (
          <DatePicker
            {...commonProps}
            style={{ width: '100%' }}
            format="YYYY-MM-DD"
          />
        );

      case 'datetime':
        return (
          <DatePicker
            {...commonProps}
            showTime
            style={{ width: '100%' }}
            format="YYYY-MM-DD HH:mm:ss"
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
          <Select {...commonProps} options={parameter.options} />
        );

      case 'multiselect':
        return (
          <Select
            {...commonProps}
            mode="multiple"
            options={parameter.options}
          />
        );

      default:
        return <Input {...commonProps} />;
    }
  };

  const getValidationRules = (parameter: ReportParameter) => {
    const rules: Array<Record<string, unknown>> = [];

    if (parameter.required) {
      rules.push({
        required: true,
        message: `${parameter.displayName} is required`,
      });
    }

    if (parameter.validation?.pattern) {
      rules.push({
        pattern: new RegExp(parameter.validation.pattern),
        message: parameter.validation.message || `Invalid format for ${parameter.displayName}`,
      });
    }

    // Email validation can be added here if needed

    return rules;
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      
      // Convert dayjs objects to strings/dates
      const processedValues = Object.entries(values).reduce((acc, [key, value]) => {
        const param = parameters.find(p => p.name === key);
        if (param && (param.type === 'date' || param.type === 'datetime') && value) {
          acc[key] = (value as dayjs.Dayjs).toISOString();
        } else {
          acc[key] = value as string | number | boolean | string[] | Date | dayjs.Dayjs | null | undefined;
        }
        return acc;
      }, {} as FormValues);

      onSubmit(processedValues);
    } catch (error) {
      // Form validation failed
      console.error('Form validation failed:', error);
    }
  };

  const handleReset = () => {
    form.resetFields();
  };

  // Group parameters by category if needed
  const renderParameters = () => {
    const cols = layout === 'horizontal' ? 2 : 1;
    const span = 24 / cols;

    return (
      <Row gutter={16}>
        {parameters.map((param) => (
          <Col key={param.name} span={span}>
            <Form.Item
              name={param.name}
              label={param.displayName}
              rules={getValidationRules(param)}
              help={param.helpText}
              valuePropName={param.type === 'boolean' ? 'checked' : 'value'}
            >
              {renderParameterInput(param)}
            </Form.Item>
          </Col>
        ))}
      </Row>
    );
  };

  return (
    <Form
      form={form}
      layout={layout}
      onFinish={handleSubmit}
      scrollToFirstError
    >
      {showCredentialSelector && serviceType && (
        <>
          <Form.Item
            name="credentialId"
            label="Service Credentials"
            help="Select which credentials to use for this report. If not selected, the default credentials will be used."
          >
            <CredentialSelector
              serviceType={serviceType}
              disabled={loading}
            />
          </Form.Item>
          {parameters.length > 0 && <Divider />}
        </>
      )}
      
      {renderParameters()}
      
      {showButtons && (
        <Form.Item>
          <Space>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              icon={<PlayCircleOutlined />}
            >
              Run Report
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