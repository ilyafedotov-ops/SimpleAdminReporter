/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import React, { useState, useEffect } from 'react';
import { X, Play, AlertCircle, Download, Eye, Maximize2, Minimize2 } from 'lucide-react';
import { QueryDefinition, QueryExecutionResult, ServiceCredential, GraphQueryDefinition } from '@/types';
import { useAppSelector } from '@/store';
import { selectTheme } from '@/store/slices/uiSlice';
import { credentialsAPI } from '@/services/credentials.api';
import { message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { ReportViewer } from './ReportViewer';
import { GraphParameterForm } from './GraphParameterForm';
import { ReportParameterForm } from './ReportParameterForm';
import { reportsService } from '@/services/reportsService';

interface ReportExecutionModalProps {
  queryDefinition: QueryDefinition;
  onClose: () => void;
  onExecute: (queryId: string, parameters: Record<string, unknown>, options?: Record<string, unknown>) => Promise<unknown>;
}

export const ReportExecutionModal: React.FC<ReportExecutionModalProps> = ({
  queryDefinition,
  onClose,
  onExecute
}) => {
  const theme = useAppSelector(selectTheme);
  const darkMode = theme.darkMode;

  const [parameters, setParameters] = useState<Record<string, unknown>>({});
  const [executing, setExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<QueryExecutionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [skipCache, setSkipCache] = useState(false);
  const [credentialId, setCredentialId] = useState<number | undefined>();
  const [executionTime, setExecutionTime] = useState(0);
  const [intervalId, setIntervalId] = useState<number | null>(null);
  const [credentials, setCredentials] = useState<ServiceCredential[]>([]);
  const [loadingCredentials, setLoadingCredentials] = useState(false);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const navigate = useNavigate();

  // Initialize parameters with defaults
  useEffect(() => {
    const defaultParams: Record<string, unknown> = {};
    Object.entries(queryDefinition.parameters || {}).forEach(([key, param]) => {
      if (param.default !== undefined) {
        defaultParams[key] = param.default;
      }
    });
    setParameters(defaultParams);
  }, [queryDefinition]);

  // Fetch credentials based on data source
  useEffect(() => {
    const fetchCredentials = async () => {
      console.log('Fetching credentials for dataSource:', queryDefinition.dataSource);
      
      if (queryDefinition.dataSource === 'postgres' || !queryDefinition.dataSource) {
        console.log('No credentials needed for postgres or undefined dataSource');
        return; // No credentials needed for postgres
      }

      setLoadingCredentials(true);
      setCredentials([]); // Reset credentials
      setCredentialId(undefined); // Reset selection
      
      try {
        const response = await credentialsAPI.getCredentials(queryDefinition.dataSource as 'ad' | 'azure' | 'o365');
        console.log('Credentials API response:', response);
        
        if (response.success && ((response as any).data) && Array.isArray(((response as any).data))) {
          // Filter only active credentials
          const activeCredentials = ((response as any).data).filter((cred: ServiceCredential) => cred.isActive);
          console.log('Active credentials found:', activeCredentials.length);
          setCredentials(activeCredentials);
          
          // Set default credential if available
          const defaultCred = activeCredentials.find((cred: ServiceCredential) => cred.isDefault);
          if (defaultCred) {
            setCredentialId(defaultCred.id);
          }
        } else if (!response.success) {
          // Handle API error
          console.error('Credentials API error:', response.error);
          setError(response.error || 'Failed to fetch credentials');
        }
      } catch (error) {
        console.error('Failed to fetch credentials:', error);
        // Don't set error state here as it might be an authentication issue
        // Just leave credentials empty
      } finally {
        setLoadingCredentials(false);
      }
    };

    fetchCredentials();
  }, [queryDefinition.dataSource]);

  // Clean up interval on unmount
  useEffect(() => {
    return () => {
      if (intervalId) {
        clearInterval(intervalId as any);
      }
    };
  }, [intervalId]);

  // Reset expanded state when modal opens
  useEffect(() => {
    setIsExpanded(false);
  }, []);

  // Removed auto-execute behavior - all templates now require manual preview execution

  const _handleExecute = async () => {
    setExecuting(true);
    setError(null);
    setExecutionResult(null);
    setExecutionTime(0);
    setExecutionId(null);

    // Start timer
    const startTime = Date.now();
    const timer = setInterval(() => {
      setExecutionTime(Date.now() - startTime);
    }, 100);
    setIntervalId(timer as any);

    try {
      // Use the appropriate preview endpoint based on whether this is a custom report
      const previewResult = queryDefinition.isCustom
        ? await reportsService.previewCustomReport(
            queryDefinition.id, 
            parameters, 
            10 // Preview limit
          )
        : await reportsService.previewTemplate(
            queryDefinition.id, 
            parameters, 
            10 // Preview limit
          );

      if (!previewResult.success || !previewResult.data) {
        throw new Error(previewResult.error?.message || 'Preview execution failed');
      }

      // Transform preview result to QueryExecutionResult format
      const execResult: QueryExecutionResult = {
        queryId: queryDefinition.id,
        executedAt: new Date().toISOString(),
        result: {
          success: true,
          data: previewResult.data.testData || [],
          metadata: {
            rowCount: previewResult.data.rowCount || 0,
            executionTime: previewResult.data.executionTime || (Date.now() - startTime),
            cached: false,
            dataSource: previewResult.data.source || queryDefinition.dataSource
          }
        },
        isPreview: true // Mark as preview execution
      };
      
      setExecutionResult(execResult);
      clearInterval(timer);
      setExecutionTime(Date.now() - startTime);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview execution failed');
      clearInterval(timer);
    } finally {
      setExecuting(false);
    }
  };

  const _handleParameterChange = (key: string, value: unknown) => {
    const param = queryDefinition.parameters?.[key] as any;
    if (!param) return; // Guard against undefined parameters
    
    let processedValue = value;

    // Type conversion based on parameter type
    if (param.type === 'number' && typeof value === 'string') {
      processedValue = value === '' ? undefined : Number(value);
    } else if (param.type === 'boolean') {
      processedValue = value === 'true' || value === true;
    }

    setParameters(prev => ({
      ...prev,
      [key]: processedValue
    }));
  };

  const handleFormSubmit = async (values: Record<string, any>) => {
    // Extract credentialId and skipCache from values
    const { credentialId: formCredentialId, skipCache: formSkipCache, ...formParameters } = values;
    
    // Update state with form values
    setParameters(formParameters);
    
    if (formCredentialId !== undefined) {
      setCredentialId(formCredentialId);
    }
    
    if (formSkipCache !== undefined) {
      setSkipCache(formSkipCache);
    }
    
    // Execute preview instead of full execution
    setExecuting(true);
    setError(null);
    setExecutionResult(null);
    setExecutionTime(0);
    setExecutionId(null);

    // Start timer
    const startTime = Date.now();
    const timer = setInterval(() => {
      setExecutionTime(Date.now() - startTime);
    }, 100);
    setIntervalId(timer as any);

    try {
      // Use the appropriate preview endpoint based on whether this is a custom report
      const previewResult = queryDefinition.isCustom
        ? await reportsService.previewCustomReport(
            queryDefinition.id, 
            formParameters, 
            10 // Preview limit
          )
        : await reportsService.previewTemplate(
            queryDefinition.id, 
            formParameters, 
            10 // Preview limit
          );

      if (!previewResult.success || !previewResult.data) {
        throw new Error(previewResult.error?.message || 'Preview execution failed');
      }

      // Transform preview result to QueryExecutionResult format
      const execResult: QueryExecutionResult = {
        queryId: queryDefinition.id,
        executedAt: new Date().toISOString(),
        result: {
          success: true,
          data: previewResult.data.testData || [],
          metadata: {
            rowCount: previewResult.data.rowCount || 0,
            executionTime: previewResult.data.executionTime || (Date.now() - startTime),
            cached: false,
            dataSource: previewResult.data.source || queryDefinition.dataSource
          }
        },
        isPreview: true // Mark as preview execution
      };
      
      setExecutionResult(execResult);
      clearInterval(timer);
      setExecutionTime(Date.now() - startTime);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview execution failed');
      clearInterval(timer);
    } finally {
      setExecuting(false);
    }
  };

  const isGraphQuery = queryDefinition.id.startsWith('graph_');

  const formatExecutionTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  };

  const handleExport = async (format: 'csv' | 'excel' | 'pdf' = 'csv') => {
    if (!executionResult?.result?.data || (executionResult.result?.data as any[])?.length === 0) {
      message.error('No data available to export');
      return;
    }

    try {
      if (format === 'csv') {
        // Generate CSV directly from execution results
        const csvContent = generateCSV(executionResult.result?.data as Record<string, unknown>[]);
        downloadCSV(csvContent, `${queryDefinition.name.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
        message.success('CSV file downloaded successfully');
      } else {
        // For Excel, we would need to use the backend export endpoint
        // Store results and navigate to full results view for Excel export
        sessionStorage.setItem('reportResults', JSON.stringify({
          queryId: queryDefinition.id,
          queryName: queryDefinition.name,
          executedAt: new Date().toISOString(),
          results: executionResult.result
        }));
        navigate('/reports?view=results');
        onClose();
        message.info(`Navigate to the results view to export as ${format.toUpperCase()}`);
      }
    } catch {
      message.error(`Failed to export as ${format}`);
    }
  };

  // Helper function to generate CSV content
  const generateCSV = (data: Record<string, unknown>[]): string => {
    if (!data || data.length === 0) return '';
    
    // Get headers from first row
    const headers = Object.keys(data[0]);
    
    // Create CSV content
    const csvRows = [
      headers.join(','), // Header row
      ...data.map(row => 
        headers.map(header => {
          const value = row[header];
          // Escape quotes and wrap in quotes if contains comma, quote, or newline
          const stringValue = String(value || '');
          if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
            return `"${stringValue.replace(/"/g, '""')}"`;
          }
          return stringValue;
        }).join(',')
      )
    ];
    
    return csvRows.join('\n');
  };

  // Helper function to trigger CSV download
  const downloadCSV = (csvContent: string, filename: string) => {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      padding: '20px'
    }}>
      <div style={{
        background: darkMode ? '#1f2937' : 'white',
        borderRadius: '16px',
        width: '100%',
        maxWidth: isExpanded ? '1400px' : '600px',
        maxHeight: isExpanded ? '95vh' : '90vh',
        overflow: 'hidden',
        boxShadow: '0 20px 25px rgba(0, 0, 0, 0.2)',
        display: 'flex',
        flexDirection: 'column',
        transition: 'all 0.3s ease'
      }}>
        {/* Header */}
        <div style={{
          padding: '24px',
          borderBottom: darkMode ? '1px solid #374151' : '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h2 style={{
              margin: 0,
              fontSize: '20px',
              fontWeight: '600',
              color: darkMode ? 'white' : '#1f2937'
            }}>
              Preview Report
            </h2>
            <p style={{
              margin: '4px 0 0 0',
              fontSize: '14px',
              color: darkMode ? '#9ca3af' : '#6b7280'
            }}>
              {queryDefinition.name}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              style={{
                padding: '8px',
                borderRadius: '8px',
                border: 'none',
                background: darkMode ? 'rgba(55, 65, 81, 0.5)' : 'rgba(229, 231, 235, 1)',
                cursor: 'pointer',
                color: darkMode ? '#f3f4f6' : '#374151',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = darkMode ? 'rgba(55, 65, 81, 0.8)' : 'rgba(209, 213, 219, 1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = darkMode ? 'rgba(55, 65, 81, 0.5)' : 'rgba(229, 231, 235, 1)';
              }}
              title={isExpanded ? 'Minimize' : 'Maximize'}
            >
              {isExpanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
            <button
              onClick={onClose}
              style={{
                padding: '8px',
                borderRadius: '8px',
                border: 'none',
                background: darkMode ? 'rgba(55, 65, 81, 0.5)' : 'rgba(229, 231, 235, 1)',
                cursor: 'pointer',
                color: darkMode ? '#f3f4f6' : '#374151',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = darkMode ? 'rgba(55, 65, 81, 0.8)' : 'rgba(209, 213, 219, 1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = darkMode ? 'rgba(55, 65, 81, 0.5)' : 'rgba(229, 231, 235, 1)';
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '24px'
        }}>
          {!executionResult && !executing && (
            <>
              {isGraphQuery ? (
                <GraphParameterForm
                  queryDefinition={queryDefinition as GraphQueryDefinition}
                  onSubmit={handleFormSubmit}
                  loading={executing}
                  initialValues={{ ...parameters, credentialId }}
                  showButtons={false}
                  showCredentialSelector={true}
                />
              ) : (
                <>
                  {/* Convert parameters to ReportParameter format */}
                  {(() => {
                    const reportParams = Object.entries(queryDefinition.parameters || {}).map(([name, param]) => {
                      const typedParam = param as any;
                      return {
                        name,
                        displayName: typedParam.description || name,
                        type: (typedParam.type === 'object' || typedParam.type === 'array') ? 'string' : typedParam.type || 'string',
                        required: typedParam.required || false,
                        defaultValue: typedParam.default,
                        options: typedParam.options as { label: string; value: string | number }[] | undefined,
                        validation: typedParam.validation
                      };
                    });

                    if (reportParams.length > 0) {
                      return (
                        <ReportParameterForm
                          parameters={reportParams}
                          onSubmit={handleFormSubmit}
                          loading={executing}
                          initialValues={{ ...parameters, credentialId }}
                          showButtons={false}
                          serviceType={queryDefinition.dataSource as 'ad' | 'azure' | 'o365'}
                          showCredentialSelector={queryDefinition.dataSource !== 'postgres'}
                        />
                      );
                    }

                    // Always show configuration section for consistency
                    return (
                      <div style={{ marginBottom: '24px' }}>
                        {queryDefinition.dataSource !== 'postgres' ? (
                          <>
                            <label style={{
                              display: 'block',
                              marginBottom: '6px',
                              fontSize: '14px',
                              fontWeight: '500',
                              color: darkMode ? '#d1d5db' : '#374151'
                            }}>
                              Service Credentials
                            </label>
                            <p style={{
                              fontSize: '12px',
                              color: darkMode ? '#9ca3af' : '#6b7280',
                              marginBottom: '12px'
                            }}>
                              Select which credentials to use for this report. If not selected, the default credentials will be used.
                            </p>
                            <select
                              value={credentialId || ''}
                              onChange={(e) => setCredentialId(e.target.value ? Number(e.target.value) : undefined)}
                              disabled={loadingCredentials || credentials.length === 0}
                              style={{
                                width: '100%',
                                padding: '8px 12px',
                                borderRadius: '8px',
                                border: darkMode ? '1px solid #374151' : '1px solid #d1d5db',
                                background: darkMode ? '#111827' : 'white',
                                color: darkMode ? '#f3f4f6' : '#1f2937',
                                fontSize: '14px',
                                opacity: loadingCredentials || credentials.length === 0 ? 0.5 : 1,
                                cursor: loadingCredentials || credentials.length === 0 ? 'not-allowed' : 'pointer'
                              }}
                            >
                              {loadingCredentials ? (
                                <option value="">Loading credentials...</option>
                              ) : credentials.length === 0 ? (
                                <option value="">No credentials configured</option>
                              ) : (
                                <>
                                  <option value="">Use default credentials</option>
                                  {credentials.map((cred) => (
                                    <option key={cred.id} value={cred.id}>
                                      {cred.credentialName} {cred.isDefault ? '(Default)' : ''}
                                    </option>
                                  ))}
                                </>
                              )}
                            </select>
                            {credentials.length === 0 && !loadingCredentials && (
                              <p style={{
                                marginTop: '8px',
                                fontSize: '12px',
                                color: darkMode ? '#ef4444' : '#dc2626'
                              }}>
                                Please configure credentials in Settings to run this report.
                              </p>
                            )}
                          </>
                        ) : (
                          <>
                            <label style={{
                              display: 'block',
                              marginBottom: '6px',
                              fontSize: '14px',
                              fontWeight: '500',
                              color: darkMode ? '#d1d5db' : '#374151'
                            }}>
                              Report Configuration
                            </label>
                            <p style={{
                              fontSize: '12px',
                              color: darkMode ? '#9ca3af' : '#6b7280',
                              marginBottom: '12px'
                            }}>
                              This report uses the default database connection. Click Preview to see the results.
                            </p>
                          </>
                        )}
                      </div>
                    );
                  })()}
                </>
              )}

              {/* Skip Cache Option */}
              <div style={{ marginBottom: '24px' }}>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  color: darkMode ? '#d1d5db' : '#4b5563'
                }}>
                  <input
                    type="checkbox"
                    checked={skipCache}
                    onChange={(e) => setSkipCache(e.target.checked)}
                    style={{ cursor: 'pointer' }}
                  />
                  Skip cache (force fresh data)
                </label>
              </div>

              {/* Error Display */}
              {error && (
                <div style={{
                  padding: '12px 16px',
                  borderRadius: '8px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#dc2626',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                  marginBottom: '16px'
                }}>
                  <AlertCircle size={16} style={{ marginTop: '2px', flexShrink: 0 }} />
                  <div style={{ fontSize: '14px' }}>{error}</div>
                </div>
              )}
            </>
          )}

          {/* Executing State */}
          {executing && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '48px',
              textAlign: 'center'
            }}>
              <div style={{
                width: '64px',
                height: '64px',
                border: '4px solid rgba(147, 51, 234, 0.2)',
                borderTopColor: '#8b5cf6',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                marginBottom: '24px'
              }} />
              <h3 style={{
                fontSize: '18px',
                fontWeight: '500',
                color: darkMode ? 'white' : '#1f2937',
                margin: '0 0 8px 0'
              }}>
                Executing Query...
              </h3>
              <p style={{
                fontSize: '14px',
                color: darkMode ? '#9ca3af' : '#6b7280',
                margin: 0
              }}>
                {formatExecutionTime(executionTime)}
              </p>
            </div>
          )}

          {/* Results */}
          {executionResult && (
            <>
              {executionResult.result?.data && (executionResult.result?.data as any[])?.length > 0 && 
               Object.keys((executionResult.result?.data as any[])[0]).length > 6 && (
                <div style={{
                  padding: '8px 16px',
                  marginBottom: '8px',
                  background: darkMode ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.05)',
                  border: darkMode ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid rgba(59, 130, 246, 0.2)',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '13px',
                  color: darkMode ? '#93c5fd' : '#2563eb'
                }}>
                  {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                  <span>
                    {isExpanded 
                      ? 'Modal is expanded. You can minimize it using the button in the header.' 
                      : `This report has ${Object.keys((executionResult.result?.data as any[])[0]).length} columns. Click the expand button in the header for a better view.`}
                  </span>
                </div>
              )}
              <div style={{ 
                overflow: 'auto',
                maxHeight: isExpanded ? 'calc(95vh - 200px)' : 'calc(90vh - 300px)',
                width: '100%'
              }}>
                <ReportViewer
                mode="preview"
                data={{
                  results: executionResult.result?.data || [],
                  resultCount: executionResult.result?.metadata?.rowCount || executionResult.result?.data?.length || 0,
                  executionTime: executionTime,
                  reportName: queryDefinition.name,
                  executedAt: new Date().toISOString(),
                  status: 'completed'
                }}
                loading={false}
                onDownload={handleExport}
                style={{ marginTop: 0 }}
              />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '24px',
          borderTop: darkMode ? '1px solid #374151' : '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          {executionResult ? (
            <>
              <button
                onClick={() => {
                  setExecutionResult(null);
                  setError(null);
                  setExecutionTime(0);
                  setExecutionId(null);
                  setIsExpanded(false);
                }}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: darkMode ? '1px solid rgba(75, 85, 99, 0.5)' : '1px solid rgba(209, 213, 219, 1)',
                  background: darkMode ? 'rgba(31, 41, 55, 0.5)' : 'white',
                  color: darkMode ? '#e5e7eb' : '#374151',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = darkMode ? 'rgba(31, 41, 55, 0.8)' : 'rgba(243, 244, 246, 1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = darkMode ? 'rgba(31, 41, 55, 0.5)' : 'white';
                }}
              >
                Run Again
              </button>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={async () => {
                    // For preview results, execute the full report and save to history
                    if (executionResult?.isPreview && onExecute) {
                      try {
                        const fullResult = await onExecute(queryDefinition.id, parameters, {
                          skipCache,
                          credentialId,
                          timeout: 300000
                        });
                        
                        // Navigate to the full results
                        if (fullResult?.executionId) {
                          navigate(`/reports/history/${fullResult.executionId}`);
                          onClose();
                        } else {
                          message.error('Failed to execute full report');
                        }
                      } catch (error) {
                        message.error('Failed to execute full report: ' + (error instanceof Error ? error.message : 'Unknown error'));
                      }
                    } else if (executionId) {
                      // For full execution results, navigate directly to history
                      navigate(`/reports/history/${executionId}`);
                      onClose();
                    } else {
                      message.error('No execution ID available. Please try running the report again.');
                    }
                  }}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: 'none',
                    background: darkMode ? 'rgba(75, 85, 99, 0.8)' : 'rgba(243, 244, 246, 1)',
                    color: darkMode ? '#e5e7eb' : '#374151',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = darkMode ? 'rgba(75, 85, 99, 1)' : 'rgba(229, 231, 235, 1)';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = darkMode ? 'rgba(75, 85, 99, 0.8)' : 'rgba(243, 244, 246, 1)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <Eye size={16} />
                  View Full Results
                </button>
                <button
                  onClick={() => handleExport('csv')}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#4a5568',
                    color: 'white',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#2d3748';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.15)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#4a5568';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
                  }}
                >
                  <Download size={16} />
                  Export CSV
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                onClick={onClose}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: darkMode ? '1px solid rgba(75, 85, 99, 0.5)' : '1px solid rgba(209, 213, 219, 1)',
                  background: darkMode ? 'rgba(31, 41, 55, 0.5)' : 'white',
                  color: darkMode ? '#e5e7eb' : '#374151',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = darkMode ? 'rgba(31, 41, 55, 0.8)' : 'rgba(243, 244, 246, 1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = darkMode ? 'rgba(31, 41, 55, 0.5)' : 'white';
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (isGraphQuery || Object.keys(queryDefinition.parameters || {}).length > 0) {
                    // For forms, we need to trigger form submission, but use preview execution
                    const submitButton = document.querySelector('[type="submit"]') as HTMLButtonElement;
                    if (submitButton) {
                      submitButton.click();
                    } else {
                      // Fallback to direct preview execution
                      _handleExecute();
                    }
                  } else {
                    // For queries without parameters, execute preview directly
                    _handleExecute();
                  }
                }}
                disabled={executing}
                style={{
                  padding: '8px 24px',
                  borderRadius: '8px',
                  border: 'none',
                  background: executing ? (darkMode ? 'rgba(75, 85, 99, 0.5)' : 'rgba(209, 213, 219, 0.8)') : '#4a5568',
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: executing ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 0.2s ease',
                  boxShadow: executing ? 'none' : '0 2px 4px rgba(0, 0, 0, 0.1)'
                }}
                onMouseEnter={(e) => {
                  if (!executing) {
                    e.currentTarget.style.background = '#2d3748';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.15)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!executing) {
                    e.currentTarget.style.background = '#4a5568';
                  }
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
                }}
              >
                <Play size={16} />
                Preview Report
              </button>
            </>
          )}
        </div>
      </div>

    </div>
  );
};