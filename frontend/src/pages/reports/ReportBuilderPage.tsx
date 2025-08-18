/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import React, { useEffect, useState, useRef } from 'react';
import { Typography, Card, Row, Col, Button, Space, Form, Input, Select, message, Spin, Steps, Alert, Tag, Divider } from 'antd';
import { 
  SaveOutlined, 
  PlayCircleOutlined, 
  ClearOutlined, 
  DatabaseOutlined,
  UnorderedListOutlined,
  FilterOutlined,
  GroupOutlined,
  EyeOutlined,
  PlusOutlined,
  CheckOutlined
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/store';
import { setBreadcrumbs, setCurrentPage, selectTheme } from '@/store/slices/uiSlice';
import { fetchAvailableFieldsAsync } from '@/store/slices/reportsSlice';
import { QueryBuilderModal } from '@/components/query/QueryBuilderModal';
import { useQueryBuilder, useQueryExecution } from '@/hooks/useQuery';
import type { FieldMetadata, DynamicQuerySpec, CustomReportQuery, ReportField, ReportFilter, PreviewResponse } from '@/types';
import { ExperienceLevelProvider } from '@/contexts/ExperienceLevelContext';
import VisualFilterBuilder from '@/components/query/VisualFilterBuilder';
import { QueryVisualization } from '@/components/query/QueryVisualization';
import { reportsService } from '@/services/reportsService';

const { Title, Text } = Typography;

const ReportBuilderPage: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { id: reportId } = useParams<{ id: string }>();
  const darkMode = useAppSelector(selectTheme).darkMode;
  const [selectedSource, setSelectedSource] = useState<'ad' | 'azure' | 'o365' | 'postgres'>('ad');
  const [showQueryBuilder, setShowQueryBuilder] = useState(false);
  const [savedQuery, setSavedQuery] = useState<DynamicQuerySpec | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editingReport, setEditingReport] = useState<Record<string, unknown> | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  
  const { executeDynamic: executeDynamicQuery, executionHistory } = useQueryExecution();
  const { availableFields, fieldsLoading } = useAppSelector((state) => state.reports);

  useEffect(() => {
    const title = reportId ? 'Edit Custom Report' : 'Query Builder';
    dispatch(setCurrentPage({ page: 'report-builder', title }));
    dispatch(setBreadcrumbs([
      { title: 'Dashboard', path: '/dashboard' },
      { title: 'Reports', path: '/reports' },
      { title }
    ]));
  }, [dispatch, reportId]);

  // Load existing report if editing
  useEffect(() => {
    if (reportId) {
      setIsEditing(true);
      setLoadingReport(true);
      
      reportsService.getCustomReport(reportId)
        .then(response => {
          if (response.success && ((response as any).data)) {
            const report = ((response as any).data);
            setEditingReport(report);
            setSelectedSource(report.source as 'ad' | 'azure' | 'o365' | 'postgres');
            
            // Convert the saved query to DynamicQuerySpec format
            const dynamicQuery: DynamicQuerySpec = {
              dataSource: report.source as 'ad' | 'azure' | 'o365' | 'postgres',
              select: report.query.fields.map((f: ReportField) => f.name),
              where: report.query.filters?.map((f: ReportFilter) => ({
                field: f.field,
                operator: f.operator,
                value: f.value
              })) || [],
              groupBy: report.query.groupBy ? [report.query.groupBy] : [],
              orderBy: report.query.orderBy ? [{
                field: report.query.orderBy.field,
                direction: report.query.orderBy.direction
              }] : [],
              limit: report.query.limit || 1000
            };
            
            setSavedQuery(dynamicQuery);
          } else {
            message.error('Failed to load report');
            navigate('/templates');
          }
        })
        .catch(error => {
          console.error('Error loading report:', error);
          message.error('Failed to load report');
          navigate('/templates');
        })
        .finally(() => {
          setLoadingReport(false);
        });
    }
  }, [reportId, navigate]);

  // Track which sources we've already initiated loading for
  const loadingInitiatedRef = useRef<Set<string>>(new Set());
  
  // Load fields for selected source only when needed
  useEffect(() => {
    // Skip postgres and check if we need to load fields
    if (selectedSource && selectedSource !== 'postgres') {
      const hasFields = availableFields[selectedSource] && availableFields[selectedSource].length > 0;
      const loadingInitiated = loadingInitiatedRef.current.has(selectedSource);
      
      if (!hasFields && !loadingInitiated && !fieldsLoading) {
        loadingInitiatedRef.current.add(selectedSource);
        dispatch(fetchAvailableFieldsAsync(selectedSource as 'ad' | 'azure' | 'o365'));
      }
    }
  }, [dispatch, selectedSource, fieldsLoading, availableFields]);

  const handleSourceChange = (source: 'ad' | 'azure' | 'o365' | 'postgres') => {
    setSelectedSource(source);
    setSavedQuery(null);
  };

  const handleOpenQueryBuilder = () => {
    setShowQueryBuilder(true);
  };

  const handleSaveQuery = async (query: DynamicQuerySpec, name: string, description?: string) => {
    try {
      // PostgreSQL queries can't be saved as custom reports currently
      if (query.dataSource === 'postgres') {
        message.warning('PostgreSQL queries cannot be saved as custom reports at this time');
        setSavedQuery(query);
        return;
      }

      // Convert DynamicQuerySpec to CustomReportQuery format
      const customQuery: CustomReportQuery = {
        fields: query.select.map(fieldName => {
          const field = availableFields[query.dataSource]?.find(f => f.fieldName === fieldName);
          return {
            name: fieldName,
            displayName: field?.displayName || fieldName,
            type: field?.dataType || 'string',
            category: field?.category || 'basic'
          } as ReportField;
        }),
        filters: (query.where || []).map(w => ({
          field: w.field,
          operator: w.operator as any,
          value: w.value,
          dataType: 'string'
        } as ReportFilter)),
        groupBy: query.groupBy?.[0],
        orderBy: query.orderBy,
        source: query.dataSource
      } as any;

      // Save to database - either create or update
      let response;
      if (isEditing && reportId) {
        // Update existing report
        response = await reportsService.updateCustomReport(reportId, {
          name: name || editingReport.name,
          description: description || editingReport.description,
          source: query.dataSource as 'ad' | 'azure' | 'o365',
          query: customQuery,
          isPublic: editingReport.isPublic || false,
          category: editingReport.category || 'custom'
        });
      } else {
        // Create new report
        response = await reportsService.createCustomReport({
          name,
          description: description || '',
          source: query.dataSource as 'ad' | 'azure' | 'o365',
          query: customQuery,
          isPublic: false,
          category: 'custom'
        });
      }

      if (response.success) {
        setSavedQuery(query);
        message.success(isEditing ? 'Report updated successfully!' : 'Query saved successfully!');
        // Navigate to templates page with refresh flag
        setTimeout(() => {
          navigate('/templates', { state: { refresh: true, tab: 'custom' } });
        }, 1000);
      } else {
        message.error('Failed to save query: ' + (response.error || 'Unknown error'));
      }
    } catch (error: unknown) {
      message.error('Failed to save query: ' + (((error as any)?.message || String(error)) || 'Unknown error'));
    }
  };

  const handleExecuteQuery = async (query: DynamicQuerySpec, isPreview = false) => {
    // Don't update saved query if this is just a preview execution
    if (!isPreview) {
      setSavedQuery(query);
    }
    
    // For AD, Azure, and O365, use the testCustomQuery endpoint
    if (query.dataSource !== 'postgres') {
      // Convert DynamicQuerySpec to CustomReportQuery format
      const customQuery: CustomReportQuery = {
        fields: query.select.map(fieldName => {
          const field = availableFields[query.dataSource]?.find(f => f.fieldName === fieldName);
          return {
            name: fieldName,
            displayName: field?.displayName || fieldName,
            type: field?.dataType || 'string',
            category: field?.category || 'basic'
          } as ReportField;
        }),
        filters: (query.where || []).map(w => ({
          field: w.field,
          operator: w.operator as any,
          value: w.value,
          dataType: 'string'
        } as ReportFilter)),
        groupBy: query.groupBy?.[0],
        orderBy: query.orderBy,
        source: query.dataSource
      } as any;
      
      const response: PreviewResponse = await reportsService.testCustomQuery(
        customQuery,
        query.dataSource as 'ad' | 'azure' | 'o365',
        {},
        query.limit || 1000
      );
      
      if (response.success && response.data) {
        return {
          data: response.data.testData || [],
          totalCount: response.data.rowCount || 0,
          executionTime: response.data.executionTime || 0
        };
      } else {
        const errorMessage = response.error?.message || 'Query execution failed';
        throw new Error(errorMessage);
      }
    }
    
    // For PostgreSQL, use the regular dynamic query execution
    return executeDynamicQuery(query);
  };

  const getSourceInfo = (source: string) => {
    switch (source) {
      case 'ad':
        return { name: 'Active Directory', color: '#4a5568' };
      case 'azure':
        return { name: 'Azure AD', color: '#4a5568' };
      case 'o365':
        return { name: 'Office 365', color: '#4a5568' };
      case 'postgres':
        return { name: 'Database', color: '#4a5568' };
      default:
        return { name: 'Unknown', color: '#8c8c8c' };
    }
  };

  if (loadingReport) {
    return (
      <div style={{
        minHeight: 'calc(100vh - 64px)',
        background: darkMode ? '#1a1a1a' : '#f5f5f5',
        padding: '32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <Spin size="large" tip="Loading report..." />
      </div>
    );
  }

  return (
    <ExperienceLevelProvider>
      <div style={{
        minHeight: 'calc(100vh - 64px)',
        background: darkMode ? '#1a1a1a' : '#f5f5f5',
        padding: '32px'
      }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{ marginBottom: 32 }}>
          <Title level={2} style={{ color: darkMode ? 'white' : '#1f2937', margin: 0 }}>
            {isEditing ? `Edit Report: ${editingReport?.name || 'Loading...'}` : 'Custom Query Builder'}
          </Title>
          <Text style={{ fontSize: '16px', color: darkMode ? '#9ca3af' : '#6b7280' }}>
            {isEditing ? 'Modify your custom report query' : 'Build custom queries with visual tools or SQL-like syntax'}
          </Text>
        </div>

        {/* Data Source Selection */}
        <Card
          style={{
            marginBottom: 24,
            background: darkMode ? 'rgba(17, 24, 39, 0.7)' : 'rgba(255, 255, 255, 0.9)',
            backdropFilter: 'blur(20px)',
            border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(229, 231, 235, 1)'
          }}
        >
          <Title level={4} style={{ color: darkMode ? 'white' : '#1f2937', marginBottom: 8 }}>
            Step 1: Choose Your Data Source
          </Title>
          <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
            Select the system you want to query data from
          </Text>
          <Row gutter={[16, 16]}>
            {['ad', 'azure', 'o365', 'postgres'].map((source) => {
              const info = getSourceInfo(source);
              const isSelected = selectedSource === source;
              return (
                <Col key={source} xs={12} sm={12} md={6} lg={6}>
                  <Card
                    hoverable
                    onClick={() => handleSourceChange(source as 'ad' | 'azure' | 'o365' | 'postgres')}
                    style={{
                      height: '100%',
                      textAlign: 'center',
                      background: isSelected 
                        ? `${info.color}15` 
                        : (darkMode ? 'rgba(31, 41, 55, 0.5)' : 'rgba(249, 250, 251, 1)'),
                      border: isSelected 
                        ? `2px solid ${info.color}` 
                        : '1px solid rgba(229, 231, 235, 0.5)',
                      transition: 'all 0.3s ease',
                      position: 'relative',
                      overflow: 'hidden'
                    }}
                    styles={{ body: { padding: '24px 16px' } }}
                  >
                    {isSelected && (
                      <div style={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        color: info.color
                      }}>
                        <CheckOutlined style={{ fontSize: 20 }} />
                      </div>
                    )}
                    <DatabaseOutlined style={{ 
                      fontSize: 48, 
                      color: isSelected ? info.color : (darkMode ? '#6b7280' : '#9ca3af'), 
                      marginBottom: 16,
                      transition: 'color 0.3s ease'
                    }} />
                    <Title 
                      level={5} 
                      style={{ 
                        color: darkMode ? 'white' : '#1f2937',
                        marginBottom: 8
                      }}
                    >
                      {info.name}
                    </Title>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {source === 'ad' && 'User and computer data'}
                      {source === 'azure' && 'Cloud identity data'}
                      {source === 'o365' && 'Productivity suite data'}
                      {source === 'postgres' && 'Application database'}
                    </Text>
                  </Card>
                </Col>
              );
            })}
          </Row>
        </Card>

        {/* Query Builder Section */}
        {/* Query Builder Section */}
        <Card
          style={{
            marginBottom: 24,
            background: darkMode ? 'rgba(17, 24, 39, 0.7)' : 'rgba(255, 255, 255, 0.9)',
            backdropFilter: 'blur(20px)',
            border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(229, 231, 235, 1)'
          }}
        >
          <Card
            title={
              <Space>
                <span>Step 2: Build Your Query</span>
                {selectedSource && (
                  <Tag color={getSourceInfo(selectedSource).color}>
                    {getSourceInfo(selectedSource).name}
                  </Tag>
                )}
              </Space>
            }
            type="inner"
            style={{
              background: darkMode ? 'rgba(31, 41, 55, 0.5)' : 'rgba(249, 250, 251, 1)',
              border: darkMode ? '1px solid rgba(55, 65, 81, 0.5)' : '1px solid rgba(229, 231, 235, 1)'
            }}
          >
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <Alert
                message="Getting Started"
                description="The Visual Query Builder includes a complete interface for building, configuring, and saving your custom queries."
                type="info"
                showIcon
                style={{ 
                  marginBottom: 16,
                  backgroundColor: darkMode ? 'rgba(55, 65, 81, 0.3)' : '#f3f4f6',
                  border: `1px solid ${darkMode ? 'rgba(107, 114, 128, 0.5)' : '#e5e7eb'}`
                }}
              />
              <Button
                type="primary"
                size="large"
                icon={<PlusOutlined />}
                onClick={handleOpenQueryBuilder}
                block
                disabled={!selectedSource}
                style={{
                  background: selectedSource ? '#4a5568' : undefined,
                  border: 'none',
                  height: '56px',
                  fontSize: '16px'
                }}
              >
                Open Visual Query Builder
              </Button>
              
              {savedQuery && (
                <>
                  <Divider style={{ margin: '16px 0' }} />
                  <Alert
                    message="Query Built Successfully"
                    description={`${savedQuery.select.length} fields selected, ${savedQuery.where?.length || 0} filters applied. Use the Visual Query Builder to save or execute your query.`}
                    type="success"
                    showIcon
                    style={{
                      backgroundColor: darkMode ? 'rgba(55, 65, 81, 0.3)' : '#f3f4f6',
                      border: `1px solid ${darkMode ? 'rgba(107, 114, 128, 0.5)' : '#e5e7eb'}`
                    }}
                    action={
                      <Space direction="vertical">
                        <Button
                          size="small"
                          icon={<PlayCircleOutlined />}
                          onClick={async () => {
                            try {
                              const result = await handleExecuteQuery(savedQuery, false);
                              if (result) {
                                message.success(`Query executed successfully! Found ${result.totalCount} records.`);
                                // Navigate to report history to view results
                                navigate('/reports/history');
                              }
                            } catch (error) {
                              message.error('Failed to execute query: ' + (error instanceof Error ? error.message : 'Unknown error'));
                            }
                          }}
                        >
                          Execute Query
                        </Button>
                        <Button
                          size="small"
                          icon={<EyeOutlined />}
                          onClick={handleOpenQueryBuilder}
                        >
                          Edit Query
                        </Button>
                      </Space>
                    }
                  />
                </>
              )}
            </Space>
          </Card>
        </Card>

        {/* Recent Executions */}
        {executionHistory.length > 0 && (
          <Card
            title="Recent Executions"
            style={{
              background: darkMode ? 'rgba(17, 24, 39, 0.7)' : 'rgba(255, 255, 255, 0.9)',
              backdropFilter: 'blur(20px)',
              border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(229, 231, 235, 1)'
            }}
          >
            <Space direction="vertical" style={{ width: '100%' }}>
              {executionHistory.slice(0, 5).map((exec) => (
                <Card
                  key={exec.id}
                  size="small"
                  style={{
                    background: darkMode ? 'rgba(31, 41, 55, 0.5)' : 'rgba(249, 250, 251, 1)',
                    border: darkMode ? '1px solid rgba(55, 65, 81, 0.5)' : '1px solid rgba(229, 231, 235, 1)'
                  }}
                >
                  <Row justify="space-between" align="middle">
                    <Col>
                      <Space>
                        <Text strong>{exec.queryId}</Text>
                        <Text type="secondary">
                          {new Date(exec.startTime).toLocaleString()}
                        </Text>
                      </Space>
                    </Col>
                    <Col>
                      <Space>
                        {exec.status === 'completed' && exec.result && (
                          <Text>{exec.result.result.metadata.rowCount} rows</Text>
                        )}
                        <Text
                          type={exec.status === 'completed' ? 'success' : 
                                exec.status === 'failed' ? 'danger' : 'warning'}
                        >
                          {exec.status}
                        </Text>
                      </Space>
                    </Col>
                  </Row>
                </Card>
              ))}
            </Space>
          </Card>
        )}
      </div>

      {/* Query Builder Modal */}
      {showQueryBuilder && (
        <QueryBuilderModal
          dataSource={selectedSource}
          onClose={() => setShowQueryBuilder(false)}
          onSave={handleSaveQuery}
          onExecute={handleExecuteQuery}
          initialQuery={savedQuery}
          editMode={isEditing}
          reportName={editingReport?.name}
          reportDescription={editingReport?.description}
        />
      )}

      {/* Execution Modal - not needed for dynamic queries as they execute directly */}
    </div>
    </ExperienceLevelProvider>
  );
};

export default ReportBuilderPage;