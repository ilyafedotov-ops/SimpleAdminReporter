/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import React, { useMemo, useCallback, useState } from 'react';
import { Card, Alert, Empty, Button, Space, Typography, Tag, Collapse, Row, Col, message, Tooltip } from 'antd';
import { 
  EyeOutlined, 
  InfoCircleOutlined, 
  ShareAltOutlined,
  CopyOutlined,
  ReloadOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined,
  WarningOutlined
} from '@ant-design/icons';
import { useAppSelector } from '@/store';
import { selectTheme } from '@/store/slices/uiSlice';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import type { FieldMetadata } from '@/hooks/useFieldDiscovery';
import { EnhancedDataTable, defaultFormatCellValue, hasInformation } from '@/components/common';
import type { EnhancedColumn } from '@/components/common';
import { ExecutionSummary } from './ExecutionSummary';

const { Text } = Typography;

export interface ReportViewerProps {
  mode: 'preview' | 'full';
  data: {
    results: Record<string, unknown>[];
    resultCount: number;
    executionTime?: number;
    reportName: string;
    executedAt?: string;
    parameters?: Record<string, unknown> & {
      dataSource?: 'ad' | 'azure' | 'o365' | 'postgres';
    };
    status?: string;
    message?: string;
  };
  fields?: FieldMetadata[];
  columns?: Array<{
    title: string;
    dataIndex: string;
    key: string;
    render?: (value: unknown, record: Record<string, unknown>) => React.ReactNode;
  }>;
  debugInfo?: {
    ldapFilter?: string;
    baseDN?: string;
    attributes?: string[];
    scope?: string;
    sizeLimit?: number;
    rawQuery?: Record<string, unknown>;
    errorDetails?: Record<string, unknown>;
    filterCount?: number;
    filterDetails?: Array<{ field: string; operator: string; value: unknown }>;
    fieldAliases?: Record<string, string[]>;
  };
  loading?: boolean;
  error?: string | null;
  onDownload?: (format: 'csv' | 'excel' | 'pdf') => void;
  onShare?: () => void;
  onCopyId?: () => void;
  onRetry?: () => void;
  onGoBack?: () => void;
  enableRecovery?: boolean;
  maxRetries?: number;
  retryCount?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const ReportViewer: React.FC<ReportViewerProps> = ({
  mode,
  data,
  fields = [],
  columns,
  debugInfo,
  loading = false,
  error = null,
  onDownload,
  onShare,
  onCopyId,
  onRetry,
  onGoBack,
  enableRecovery = false,
  maxRetries = 3,
  retryCount = 0,
  className,
  style
}) => {
  const darkMode = useAppSelector(selectTheme).darkMode;
  const { handlePreviewError } = useErrorHandler();
  const [isRetrying, setIsRetrying] = useState(false);

  // Generate columns from fields if not provided
  const tableColumns = useMemo((): EnhancedColumn[] => {
    if (columns) return columns as EnhancedColumn[];
    
    if (fields.length > 0) {
      // Filter out fields that have no data in any row
      const fieldsWithData = fields.filter(field => {
        return data.results.some(row => hasInformation(row[field.fieldName]));
      });
      
      const mappedColumns = fieldsWithData.map(field => ({
        title: field.displayName || field.fieldName,
        dataIndex: field.fieldName,
        key: field.fieldName,
        enableFilter: mode === 'full', // Enable filters only in full mode
        filterType: field.dataType === 'boolean' ? 'boolean' : 
                   (field.dataType === 'integer' || field.dataType === 'decimal') ? 'number' :
                   field.dataType === 'datetime' ? 'date' : 'text',
        render: (value: any) => defaultFormatCellValue(value, field.fieldName)
      }));

      // Fallback: if no columns resolved from provided fields but we have data,
      // auto-generate columns from the data keys so the preview is not empty.
      if (mappedColumns.length > 0) {
        return mappedColumns;
      }
    }

    // Auto-generate columns from data
    if (data.results.length > 0) {
      const firstRow = data.results[0];
      // Extract all columns and filter out those with no data
      const allColumns = Object.keys(firstRow);
      const columnsWithData = allColumns.filter(key => {
        return data.results.some(row => hasInformation(row[key]));
      });
      
      return columnsWithData.map(key => ({
        title: key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1').trim(),
        dataIndex: key,
        key,
        enableFilter: mode === 'full', // Enable filters only in full mode
        render: (value: any) => defaultFormatCellValue(value, key)
      }));
    }

    return [];
  }, [columns, fields, data.results, mode]);

  // Prepare table data with unique keys
  const tableData = useMemo(() => {
    const dataToShow = mode === 'preview' ? data.results.slice(0, 100) : data.results;
    return dataToShow.map((item, index) => ({
      ...item,
      key: item.id || item.dn || item.objectGUID || `row-${index}`
    }));
  }, [data.results, mode]);

  // Handle download action
  const _handleDownload = useCallback((format: 'csv' | 'excel' | 'pdf') => {
    if (onDownload) {
      onDownload(format);
    } else {
      message.info('Download functionality not implemented');
    }
  }, [onDownload]);

  // Handle share action
  const handleShare = useCallback(() => {
    if (onShare) {
      onShare();
    } else if (mode === 'full') {
      // Default share behavior for full mode
      const shareUrl = window.location.href;
      navigator.clipboard.writeText(shareUrl).then(() => {
        message.success('Report link copied to clipboard');
      }).catch(() => {
        message.error('Failed to copy link');
      });
    }
  }, [onShare, mode]);

  // Handle copy ID action
  const handleCopyId = useCallback(() => {
    if (onCopyId) {
      onCopyId();
    } else {
      message.info('Copy ID functionality not implemented');
    }
  }, [onCopyId]);

  // Enhanced retry handler
  const handleRetry = useCallback(async () => {
    if (!onRetry || isRetrying || retryCount >= maxRetries) {
      return;
    }

    setIsRetrying(true);
    
    try {
      await onRetry();
      message.success('Retry successful!');
    } catch (error) {
      const parsedError = handlePreviewError(error, {
        showNotification: true,
        context: 'Retry Operation',
        enableAutoRetry: false
      });
      console.error('Retry failed:', parsedError);
    } finally {
      setIsRetrying(false);
    }
  }, [onRetry, isRetrying, retryCount, maxRetries, handlePreviewError]);

  // Handle go back action
  const handleGoBack = useCallback(() => {
    if (onGoBack) {
      onGoBack();
    } else {
      message.info('Go back functionality not implemented');
    }
  }, [onGoBack]);

  // Determine error type and get appropriate icon
  const getErrorIcon = (errorDetails?: Record<string, unknown>) => {
    const errorType = errorDetails?.type as string;
    
    switch (errorType) {
      case 'NETWORK':
      case 'TIMEOUT':
        return <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />;
      case 'VALIDATION':
      case 'QUERY_VALIDATION':
        return <WarningOutlined style={{ color: '#faad14' }} />;
      case 'SERVER':
        return <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />;
      default:
        return <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />;
    }
  };

  // Get recovery suggestions based on error type
  const getRecoverySuggestions = (errorDetails?: Record<string, unknown>) => {
    const errorType = errorDetails?.type as string;
    
    switch (errorType) {
      case 'TIMEOUT':
        return [
          'Try selecting fewer fields',
          'Add more specific filters to limit results',
          'Reduce the date range if applicable'
        ];
      case 'NETWORK':
        return [
          'Check your internet connection',
          'Verify VPN connection if using one',
          'Try again in a moment'
        ];
      case 'VALIDATION':
      case 'QUERY_VALIDATION':
        return [
          'Review your query configuration',
          'Check that all selected fields are valid',
          'Verify filter values are correctly formatted'
        ];
      case 'AUTHORIZATION':
        return [
          'Contact your administrator for permissions',
          'Verify your account has access to this data source'
        ];
      case 'RATE_LIMIT':
        return [
          `Wait ${errorDetails?.retryAfter || '60'} seconds before retrying`,
          'Reduce the frequency of your queries'
        ];
      default:
        return [
          'Try refreshing the page',
          'Contact support if the problem persists'
        ];
    }
  };



  // Render debug information
  const renderDebugInfo = () => {
    if (!debugInfo || mode === 'full') return null;

    return (
      <Collapse 
        style={{ marginBottom: 16 }}
        items={[
          {
            key: '1',
            label: (
              <Space>
                <InfoCircleOutlined />
                <span style={{ fontWeight: 500 }}>Debug Information</span>
                {error && <Tag color="error" style={{ marginLeft: 8 }}>Error</Tag>}
              </Space>
            ),
            extra: (
              <Button 
                size="small" 
                onClick={(e) => {
                  e.stopPropagation();
                  const debugText = JSON.stringify(debugInfo, null, 2);
                  navigator.clipboard.writeText(debugText);
                  message.success('Debug info copied to clipboard');
                }}
              >
                Copy Debug Info
              </Button>
            ),
            children: (
              <Row gutter={[16, 16]}>
                {debugInfo.ldapFilter && (
                  <Col span={24}>
                    <div style={{ marginBottom: 16 }}>
                      <Text strong>LDAP Filter:</Text>
                      <div style={{ 
                        marginTop: 8, 
                        padding: 12, 
                        background: darkMode ? 'rgba(31, 41, 55, 0.5)' : 'rgba(243, 244, 246, 1)',
                        borderRadius: 8,
                        fontFamily: 'monospace',
                        fontSize: 14,
                        wordBreak: 'break-all'
                      }}>
                        {debugInfo.ldapFilter}
                      </div>
                    </div>
                  </Col>
                )}
                
                {debugInfo.attributes && (
                  <Col span={24}>
                    <Text strong>Selected Attributes ({debugInfo.attributes.length}):</Text>
                    <div style={{ marginTop: 8 }}>
                      {debugInfo.attributes.map(attr => (
                        <Tag key={attr} style={{ marginBottom: 4 }}>{attr}</Tag>
                      ))}
                    </div>
                  </Col>
                )}
                
                {debugInfo.filterDetails && debugInfo.filterDetails.length > 0 && (
                  <Col span={24}>
                    <Text strong>Active Filters ({debugInfo.filterCount || 0}):</Text>
                    <div style={{ marginTop: 8 }}>
                      {debugInfo.filterDetails.map((filter, idx) => (
                        <div key={idx} style={{ 
                          marginBottom: 8, 
                          padding: 8, 
                          background: darkMode ? 'rgba(31, 41, 55, 0.3)' : 'rgba(243, 244, 246, 0.5)',
                          borderRadius: 6,
                          fontFamily: 'monospace',
                          fontSize: 12
                        }}>
                          {filter.field} {filter.operator} {String(filter.value || '(empty)')}
                        </div>
                      ))}
                    </div>
                  </Col>
                )}
                
                {debugInfo.errorDetails && (
                  <Col span={24}>
                    <Alert
                      message={
                        <Space>
                          {getErrorIcon(debugInfo.errorDetails)}
                          <span>Error Details</span>
                          {debugInfo.errorDetails.type && (
                            <Tag color="red">{String(debugInfo.errorDetails.type)}</Tag>
                          )}
                        </Space>
                      }
                      description={
                        <div>
                          <div style={{ marginBottom: 8 }}>
                            <Text strong>Message:</Text> {String(debugInfo.errorDetails.message)}
                          </div>
                          
                          {debugInfo.errorDetails.code && (
                            <div style={{ marginBottom: 8 }}>
                              <Text strong>Error Code:</Text> {String(debugInfo.errorDetails.code)}
                            </div>
                          )}

                          {debugInfo.errorDetails.recoveryGuidance && (
                            <div style={{ marginBottom: 8 }}>
                              <Text strong>Recovery Guidance:</Text>
                              <div style={{ 
                                marginTop: 4,
                                padding: 8,
                                background: darkMode ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.05)',
                                borderRadius: 4,
                                fontSize: 12
                              }}>
                                {String(debugInfo.errorDetails.recoveryGuidance)}
                              </div>
                            </div>
                          )}

                          {enableRecovery && (
                            <div style={{ marginBottom: 8 }}>
                              <Text strong>Suggestions:</Text>
                              <ul style={{ 
                                marginTop: 4, 
                                marginBottom: 0,
                                paddingLeft: 16,
                                fontSize: 12
                              }}>
                                {getRecoverySuggestions(debugInfo.errorDetails).map((suggestion, idx) => (
                                  <li key={idx} style={{ marginBottom: 2 }}>
                                    {suggestion}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {debugInfo.errorDetails.canRetry && enableRecovery && retryCount < maxRetries && (
                            <div style={{ marginBottom: 8 }}>
                              <Space>
                                <Button
                                  size="small"
                                  type="primary"
                                  icon={<ReloadOutlined />}
                                  onClick={handleRetry}
                                  loading={isRetrying}
                                >
                                  {isRetrying ? 'Retrying...' : 'Try Again'}
                                </Button>
                                {retryCount > 0 && (
                                  <Text type="secondary" style={{ fontSize: 12 }}>
                                    Attempt {retryCount + 1} of {maxRetries}
                                  </Text>
                                )}
                              </Space>
                            </div>
                          )}

                          {debugInfo.errorDetails.response && (
                            <div style={{ marginBottom: 8 }}>
                              <Text strong>Response:</Text>
                              <pre style={{ 
                                fontSize: 12, 
                                overflow: 'auto',
                                background: darkMode ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.05)',
                                padding: 8,
                                borderRadius: 4
                              }}>
                                {JSON.stringify(debugInfo.errorDetails.response, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      }
                      type="error"
                      style={{ marginTop: 8 }}
                    />
                  </Col>
                )}
              </Row>
            )
          }
        ]}
      />
    );
  };


  // Create extra actions for the table toolbar
  const extraActions = useMemo(() => {
    if (mode !== 'full' || (!onShare && !onCopyId)) return null;
    
    return (
      <>
        {onShare && (
          <button
            onClick={handleShare}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              borderRadius: '12px',
              background: darkMode ? 'rgba(55, 65, 81, 0.8)' : '#e5e7eb',
              color: darkMode ? '#d1d5db' : '#4b5563',
              fontSize: '14px',
              fontWeight: '500',
              border: darkMode ? '1px solid rgba(75, 85, 99, 0.3)' : '1px solid rgba(107, 114, 128, 0.2)',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.05)';
              e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
            }}
          >
            <ShareAltOutlined style={{ fontSize: '16px' }} />
            Share
          </button>
        )}
        {onCopyId && (
          <button
            onClick={handleCopyId}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              borderRadius: '12px',
              background: darkMode ? 'rgba(55, 65, 81, 0.8)' : '#e5e7eb',
              color: darkMode ? '#d1d5db' : '#4b5563',
              fontSize: '14px',
              fontWeight: '500',
              border: darkMode ? '1px solid rgba(75, 85, 99, 0.3)' : '1px solid rgba(107, 114, 128, 0.2)',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.05)';
              e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
            }}
          >
            <CopyOutlined style={{ fontSize: '16px' }} />
            Copy ID
          </button>
        )}
      </>
    );
  }, [mode, onShare, onCopyId, darkMode, handleShare, handleCopyId]);

  // Main render
  if (error) {
    const errorDetails = debugInfo?.errorDetails;
    const canRetry = errorDetails?.canRetry && retryCount < maxRetries && onRetry;
    const showRecovery = enableRecovery && (canRetry || onGoBack);

    return (
      <div className={className} style={style}>
        <Alert
          message={
            <Space>
              {getErrorIcon(errorDetails)}
              <span>Error Loading Report</span>
              {retryCount > 0 && (
                <Tag color="orange">Attempt {retryCount}/{maxRetries}</Tag>
              )}
            </Space>
          }
          description={
            <div>
              <div style={{ marginBottom: showRecovery ? 12 : 0 }}>
                {error}
              </div>
              
              {errorDetails?.recoveryGuidance && (
                <div style={{ 
                  marginBottom: 12,
                  padding: 8,
                  background: darkMode ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.05)',
                  borderRadius: 4,
                  fontSize: 12,
                  fontStyle: 'italic'
                }}>
                  💡 {String(errorDetails.recoveryGuidance)}
                </div>
              )}

              {enableRecovery && errorDetails && (
                <div style={{ marginBottom: 12 }}>
                  <Text strong style={{ fontSize: 12 }}>Quick fixes:</Text>
                  <ul style={{ 
                    marginTop: 4, 
                    marginBottom: 0,
                    paddingLeft: 16,
                    fontSize: 12
                  }}>
                    {getRecoverySuggestions(errorDetails).slice(0, 3).map((suggestion, idx) => (
                      <li key={idx} style={{ marginBottom: 2 }}>
                        {suggestion}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {showRecovery && (
                <Space>
                  {canRetry && (
                    <Button
                      size="small"
                      type="primary"
                      icon={<ReloadOutlined />}
                      onClick={handleRetry}
                      loading={isRetrying}
                    >
                      {isRetrying ? 'Retrying...' : 'Try Again'}
                    </Button>
                  )}
                  {onGoBack && (
                    <Button
                      size="small"
                      onClick={handleGoBack}
                    >
                      Go Back
                    </Button>
                  )}
                </Space>
              )}
            </div>
          }
          type="error"
          showIcon={false}
          style={{ marginBottom: 16 }}
        />
        {renderDebugInfo()}
      </div>
    );
  }

  return (
    <div className={className} style={style}>
      {renderDebugInfo()}
      
      <Card 
        title={
          <Space>
            <EyeOutlined />
            <span>{mode === 'preview' ? 'Query Results Preview' : 'Report Results'}</span>
            <Text type="secondary">({data.resultCount || data.results.length} records)</Text>
            {mode === 'preview' && data.results.length > 100 && (
              <Tag color="orange">Showing first 100</Tag>
            )}
          </Space>
        }
        size="small"
        loading={loading}
      >
        {data.results.length > 0 ? (
          <>
            <EnhancedDataTable
              data={tableData}
              columns={tableColumns}
              loading={loading}
              pageSize={mode === 'preview' ? 10 : 20}
              showExport={mode === 'full' && !!onDownload}
              showColumnToggle={mode === 'full'}
              showQuickFilters={mode === 'full'}
              onExport={mode === 'full' && onDownload ? 
                (_exportData, format) => onDownload(format as 'csv' | 'excel' | 'pdf') : 
                undefined
              }
              rowKey={(record) => ((record as any).key) || ((record as any).id) || ((record as any).dn) || ((record as any).objectGUID)}
              formatCellValue={defaultFormatCellValue}
              extraActions={extraActions}
            />
            
            {mode === 'preview' && data.results.length > 100 && (
              <Alert
                message="Preview Limitation"
                description="Only the first 100 records are shown in preview. The full query will return all matching records when saved and executed."
                type="info"
                showIcon
                style={{ marginTop: 16 }}
              />
            )}
          </>
        ) : (
          <Empty
            description={data.message || "No data found"}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        )}
      </Card>
      
      {/* Execution Summary below table for full mode */}
      {mode === 'full' && (
        <ExecutionSummary
          status={data.status}
          recordCount={data.resultCount || data.results.length}
          executionTime={data.executionTime}
          category={data.parameters?.dataSource?.toUpperCase() || 'Query'}
          style={{ marginTop: 24, marginBottom: 0 }}
        />
      )}
    </div>
  );
};

export default ReportViewer;