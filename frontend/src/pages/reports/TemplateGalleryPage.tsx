/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import React, { useEffect, useState } from 'react';
import { Typography, Card, List, Tag, Space, Button, message, Tabs, Badge, Spin, Modal } from 'antd';
import {
  FileSearchOutlined,
  TeamOutlined,
  CloudOutlined,
  MailOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/store';
import { setBreadcrumbs, setCurrentPage } from '@/store/slices/uiSlice';
import { fetchReportTemplatesAsync, fetchCustomReportsAsync } from '@/store/slices/reportsSlice';
import { useQueryExecution, useQueryDefinitions } from '@/hooks/useQuery';
import { ReportExecutionModal } from '@/components/reports/ReportExecutionModal';
import { commonReportParameters } from '@/constants/reportParameters';
import type { ReportTemplate, CustomReportTemplate, ReportParameter, QueryDefinition } from '@/types';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { TabPane } = Tabs;

const TemplateGalleryPage: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'prebuilt' | 'custom'>('prebuilt');
  const [selectedTemplate, setSelectedTemplate] = useState<ReportTemplate | null>(null);
  const [selectedCustomTemplate, setSelectedCustomTemplate] = useState<CustomReportTemplate | null>(null);
  const [parameterModalOpen, setParameterModalOpen] = useState(false);
  
  const { 
    templates, 
    templatesLoading, 
    templatesError,
    customReports,
    customReportsLoading,
    customReportsError
  } = useAppSelector((state) => state.reports);
  
  const { executeQuery } = useQueryExecution();

  useEffect(() => {
    dispatch(setCurrentPage({ page: 'template-gallery', title: 'Template Gallery' }));
    dispatch(setBreadcrumbs([
      { title: 'Dashboard', path: '/dashboard' },
      { title: 'Reports', path: '/reports' },
      { title: 'Template Gallery' }
    ]));

    // Fetch both pre-built templates and custom reports
    dispatch(fetchReportTemplatesAsync(undefined));
    dispatch(fetchCustomReportsAsync({ isPublic: true }));
  }, [dispatch]);

  const getCategoryIcon = (category: string) => {
    const categoryLower = category.toLowerCase();
    switch (categoryLower) {
      case 'ad':
        return <TeamOutlined />;
      case 'azuread':
      case 'azure':
        return <CloudOutlined />;
      case 'o365':
        return <MailOutlined />;
      default:
        return <FileSearchOutlined />;
    }
  };

  const getCategoryColor = (category: string) => {
    const categoryLower = category.toLowerCase();
    switch (categoryLower) {
      case 'ad':
        return 'blue';
      case 'azuread':
      case 'azure':
        return 'cyan';
      case 'o365':
        return 'purple';
      default:
        return 'default';
    }
  };

  const getServiceTypeFromCategory = (category: string): 'ad' | 'azure' | 'o365' | undefined => {
    const categoryLower = category.toLowerCase();
    if (categoryLower === 'ad') return 'ad';
    if (categoryLower === 'azuread' || categoryLower === 'azure') return 'azure';
    if (categoryLower === 'o365') return 'o365';
    return undefined;
  };

  const getReportParameters = (reportType: string) => {
    // Map report types to parameter configurations
    const parameterMap: Record<string, ReportParameter[]> = {
      'ad_inactive_users': commonReportParameters.inactiveUsers,
      'ad_password_expiry': commonReportParameters.passwordExpiry,
      'azure_user_activity': commonReportParameters.userActivity,
      // Add more mappings as needed
    };

    return parameterMap[reportType] || [];
  };

  const handleRunReport = (template: ReportTemplate) => {
    console.log('DEBUG: Running report', template);
    setSelectedTemplate(template);
    setParameterModalOpen(true);
  };

  // Convert template to QueryDefinition
  const templateToQueryDefinition = (template: ReportTemplate): QueryDefinition => {
    console.log('DEBUG: Converting template to QueryDefinition', template);
    try {
      const dataSource = template.category === 'AD' ? 'ad' :
                        template.category === 'AzureAD' ? 'azure' :
                        template.category === 'Office365' ? 'o365' : 'ad';
      
      const queryTemplate = typeof template.query_template === 'string'
        ? JSON.parse(template.query_template)
        : template.query_template || {};
      
      const requiredParams = typeof template.required_parameters === 'string'
        ? JSON.parse(template.required_parameters)
        : template.required_parameters || [];
      
      const parameters: any = {};
      requiredParams.forEach((param: string) => {
        parameters[param] = {
          type: param === 'days' ? 'number' : 'string',
          required: true,
          description: param === 'days' ? 'Number of days' : param,
          default: param === 'days' ? 30 : undefined
        };
      });

      return {
        id: template.report_type || template.id,
        name: template.name,
        description: template.description || '',
        category: template.category,
        dataSource,
        query: queryTemplate,
        parameters,
        resultMapping: {
          fields: (queryTemplate.attributes || []).map((attr: string) => ({
            source: attr,
            target: attr,
            type: 'string'
          }))
        },
        caching: {
          enabled: true,
          ttl: 300
        },
        security: {
          requiresAuth: true,
          allowedRoles: []
        }
      };
    } catch (error) {
      console.error('DEBUG: Error converting template', error);
      throw error;
    }
  };

  // Convert custom report to QueryDefinition
  const customReportToQueryDefinition = (template: CustomReportTemplate): QueryDefinition => {
    const querySpec = typeof template.query === 'string' 
      ? JSON.parse(template.query) 
      : template.query;

    return {
      id: `custom_${template.id}`,
      name: template.name,
      description: template.description || '',
      category: 'Custom',
      dataSource: querySpec.dataSource || 'ad',
      query: querySpec,
      parameters: {},
      resultMapping: {
        fields: (querySpec.fields || []).map((field: string) => ({
          source: field,
          target: field,
          type: 'string'
        }))
      },
      caching: {
        enabled: false,
        ttl: 0
      },
      security: {
        requiresAuth: true,
        allowedRoles: []
      }
    };
  };

  const handleRunCustomReport = (template: CustomReportTemplate) => {
    setSelectedCustomTemplate(template);
    setParameterModalOpen(true);
  };

  const handleEditTemplate = (template: CustomReportTemplate) => {
    // Navigate to builder to edit this template
    navigate(`/reports/builder/${template.id}`);
  };

  const renderPrebuiltTemplates = () => {
    if (templatesLoading) {
      return (
        <div style={{ textAlign: 'center', padding: '50px' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>Loading report templates...</div>
        </div>
      );
    }

    if (templatesError) {
      return (
        <Card>
          <Text type="danger">Error loading templates: {templatesError}</Text>
        </Card>
      );
    }

    if (!templates.length) {
      return (
        <Card>
          <Text type="secondary">No report templates available.</Text>
        </Card>
      );
    }

    // Group templates by category
    const groupedTemplates = templates.reduce((acc: Record<string, ReportTemplate[]>, template) => {
      const category = template.category || 'Other';
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(template);
      return acc;
    }, {});

    return (
      <div>
        {Object.entries(groupedTemplates).map(([category, categoryTemplates]) => (
          <Card 
            key={category} 
            title={
              <Space>
                {getCategoryIcon(category)}
                <span>{category}</span>
                <Badge count={categoryTemplates.length} />
              </Space>
            }
            style={{ marginBottom: 16 }}
          >
            <List
              grid={{ gutter: 16, xs: 1, sm: 2, md: 3, lg: 4, xl: 4, xxl: 4 }}
              dataSource={categoryTemplates}
              renderItem={(template: ReportTemplate) => (
                <List.Item>
                  <Card
                    hoverable
                    size="small"
                    actions={[
                      <Button
                        type="primary"
                        size="small"
                        icon={<PlayCircleOutlined />}
                        onClick={() => handleRunReport(template)}
                                              >
                        Run Report
                      </Button>,
                    ]}
                  >
                    <Card.Meta
                      avatar={
                        <Tag color={getCategoryColor(template.category)}>
                          {getCategoryIcon(template.category)}
                        </Tag>
                      }
                      title={template.name}
                      description={
                        <div>
                          <Text type="secondary" style={{ fontSize: '12px' }}>
                            {template.description}
                          </Text>
                          {template.executionCount !== undefined && (
                            <div style={{ marginTop: 4 }}>
                              <Text type="secondary" style={{ fontSize: '11px' }}>
                                Executed {template.executionCount} times
                              </Text>
                            </div>
                          )}
                        </div>
                      }
                    />
                  </Card>
                </List.Item>
              )}
            />
          </Card>
        ))}
      </div>
    );
  };

  const renderCustomTemplates = () => {
    if (customReportsLoading) {
      return (
        <div style={{ textAlign: 'center', padding: '50px' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>Loading custom templates...</div>
        </div>
      );
    }

    if (customReportsError) {
      return (
        <Card>
          <Text type="danger">Error loading custom templates: {customReportsError}</Text>
        </Card>
      );
    }

    if (!customReports.length) {
      return (
        <Card>
          <Text type="secondary">No public custom templates available.</Text>
          <div style={{ marginTop: 16 }}>
            <Button type="primary" onClick={() => navigate('/reports/builder')}>
              Create Your First Template
            </Button>
          </div>
        </Card>
      );
    }

    return (
      <List
        grid={{ gutter: 16, xs: 1, sm: 2, md: 3, lg: 4, xl: 4, xxl: 4 }}
        dataSource={customReports}
        renderItem={(template: CustomReportTemplate) => (
          <List.Item>
            <Card
              hoverable
              size="small"
              actions={[
                <Space size="small">
                  <Button
                    type="primary"
                    size="small"
                    icon={<PlayCircleOutlined />}
                    onClick={() => handleRunCustomReport(template)}
                                      >
                    Run Report
                  </Button>
                  <Button
                    size="small"
                    onClick={() => handleEditTemplate(template)}
                  >
                    Edit
                  </Button>
                </Space>,
              ]}
            >
              <Card.Meta
                avatar={
                  <Tag color={getCategoryColor(template.source)}>
                    {getCategoryIcon(template.source)}
                  </Tag>
                }
                title={template.name}
                description={
                  <div>
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      {template.description}
                    </Text>
                    <div style={{ marginTop: 4 }}>
                      <Space size={4}>
                        {template.tags?.map(tag => (
                          <Tag key={tag} size="small">{tag}</Tag>
                        ))}
                      </Space>
                    </div>
                    {template.executionCount !== undefined && (
                      <div style={{ marginTop: 4 }}>
                        <Text type="secondary" style={{ fontSize: '11px' }}>
                          Executed {template.executionCount} times
                        </Text>
                      </div>
                    )}
                  </div>
                }
              />
            </Card>
          </List.Item>
        )}
      />
    );
  };

  return (
    <div className="page-container">
      <Title level={2}>Template Gallery</Title>
      <Text type="secondary" style={{ marginBottom: 24, display: 'block' }}>
        Browse and use pre-built report templates and community-shared custom reports
      </Text>
      
      <Tabs 
        activeKey={activeTab} 
        onChange={(key) => setActiveTab(key as 'prebuilt' | 'custom')}
        size="large"
      >
        <TabPane
          tab={
            <span>
              <FileSearchOutlined />
              Pre-built Templates
              <Badge count={templates.length} style={{ marginLeft: 8 }} />
            </span>
          }
          key="prebuilt"
        >
          {renderPrebuiltTemplates()}
        </TabPane>
        
        <TabPane
          tab={
            <span>
              <TeamOutlined />
              Custom Templates
              <Badge count={customReports.length} style={{ marginLeft: 8 }} />
            </span>
          }
          key="custom"
        >
          {renderCustomTemplates()}
        </TabPane>
      </Tabs>

      {/* Report Execution Modal */}
      {parameterModalOpen && (selectedTemplate || selectedCustomTemplate) && (
        <ReportExecutionModal
          queryDefinition={
            selectedTemplate 
              ? templateToQueryDefinition(selectedTemplate)
              : customReportToQueryDefinition(selectedCustomTemplate!)
          }
          onClose={() => {
            setParameterModalOpen(false);
            setSelectedTemplate(null);
            setSelectedCustomTemplate(null);
          }}
          onExecute={executeQuery}
        />
      )}
    </div>
  );
};

export default TemplateGalleryPage;