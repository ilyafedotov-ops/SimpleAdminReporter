/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import React, { useEffect, useState } from 'react';
import { 
  FileText, 
  Database, 
  UserCheck,
  CheckCircle,
  Download,
  RefreshCw,
  Shield,
  Mail,
  FileSpreadsheet,
  Cloud,
  AlertCircle,
  Eye,
  SortAsc,
  SortDesc,
  X
} from 'lucide-react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useAppSelector, useAppDispatch } from '@/store';
import { setBreadcrumbs, setCurrentPage, toggleDarkMode, selectTheme } from '@/store/slices/uiSlice';
import { useQueryDefinitions, useQueryExecution } from '@/hooks/useQuery';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { QueryDefinition, QueryExecutionResult, ReportResult, ExportFormat } from '@/types';
import { ReportExecutionModal } from '@/components/reports/ReportExecutionModal';
import { ReportDataTable } from '@/components/reports/ReportDataTable';
import { QueryHealthBanner } from '@/components/query/QueryHealthBanner';
import { message } from 'antd';
import { reportsService } from '@/services/reportsService';
import dayjs from 'dayjs';

// Helper function to safely format dates
const formatDate = (dateValue: string | undefined | null): string => {
  if (!dateValue) return 'Unknown date';
  
  try {
    const date = new Date(dateValue);
    return isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleString();
  } catch (error) {
    return 'Unknown date';
  }
};

const ReportsPageV2: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const theme = useAppSelector(selectTheme);
  
  // Use query hooks (minimal for results view)
  const { definitions } = useQueryDefinitions();
  const { execute } = useQueryExecution();
  const { stats: dashboardStats, loading: statsLoading, error: statsError } = useDashboardStats();
  
  const [selectedTemplate, setSelectedTemplate] = useState<QueryDefinition | null>(null);
  const [executionModalOpen, setExecutionModalOpen] = useState(false);
  
  // Results view state
  const [reportResults, setReportResults] = useState<ReportResult | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [lastExecutionId, setLastExecutionId] = useState<string | null>(null);
  
  const darkMode = theme.darkMode;

  // Debug dashboard stats
  useEffect(() => {
    if (dashboardStats) {
      console.log('Dashboard stats loaded:', dashboardStats);
      console.log('Recent executions:', dashboardStats.recentExecutions);
    }
  }, [dashboardStats]);

  useEffect(() => {
    dispatch(setCurrentPage({ page: 'reports', title: 'Report Results' }));
    dispatch(setBreadcrumbs([{ title: 'Report Results' }]));
  }, [dispatch]);

  // Load results from sessionStorage when navigating to reports page
  useEffect(() => {
    const storedResults = sessionStorage.getItem('reportResults');
    if (storedResults) {
      const parsedResults = JSON.parse(storedResults);
      
      // Handle both old format (from ReportExecutionModal) and new format
      if (parsedResults.results && parsedResults.queryName) {
        // Old format from ReportExecutionModal
        const reportResult: ReportResult = {
          id: parsedResults.queryId || '',
          executedAt: parsedResults.executedAt || new Date().toISOString(),
          rowCount: parsedResults.results?.data?.length || 0,
          metadata: {
            templateName: parsedResults.queryName,
            parameters: parsedResults.results?.parameters || {},
            dataSource: parsedResults.results?.metadata?.dataSource || 'unknown',
            executionTime: parsedResults.results?.metadata?.executionTime || 0
          },
          data: parsedResults.results?.data || []
        };
        setReportResults(reportResult);
      } else {
        // New format (direct ReportResult)
        setReportResults(parsedResults);
      }
      
      // Clear from sessionStorage after reading
      sessionStorage.removeItem('reportResults');
    }
  }, []);

  // Handle navigation from other pages with a selected template
  useEffect(() => {
    if (location.state && (location.state as any).selectedTemplateId && definitions.length > 0) {
      const { selectedTemplateId, executeImmediately } = location.state as any;
      const definition = definitions.find(d => d.id === selectedTemplateId);
      if (definition && executeImmediately) {
        setSelectedTemplate(definition);
        setExecutionModalOpen(true);
      }
    }
  }, [location.state, definitions]);

  const handleExecuteReport = async (queryDef: QueryDefinition, parameters: Record<string, any>) => {
    try {
      const result = await execute(queryDef.id, parameters);
      
      if (result.success && ((result as any)?.data)) {
        const executionResult = ((result as any)?.data) as QueryExecutionResult;
        
        // Store the execution ID for export purposes
        setLastExecutionId(executionResult.executionId || executionResult.id || null);
        
        // Transform execution result to ReportResult format for ReportDataTable
        const reportResult: ReportResult = {
          id: executionResult.id || '',
          executedAt: executionResult.executedAt || new Date().toISOString(),
          rowCount: executionResult.result?.data?.length || 0,
          metadata: {
            templateName: queryDef.name,
            parameters: parameters,
            dataSource: queryDef.dataSource || 'unknown',
            executionTime: executionResult.result?.metadata?.executionTime || 0
          },
          data: executionResult.result?.data || []
        };
        
        setReportResults(reportResult);
        message.success(`Report "${queryDef.name}" executed successfully`);
      } else {
        throw new Error(result.error || 'Report execution failed');
      }
    } catch (error: any) {
      console.error('Error executing report:', error);
      message.error(`Failed to execute report: ${((error as any)?.message || String(error))}`);
    } finally {
      setExecutionModalOpen(false);
      setSelectedTemplate(null);
    }
  };

  const handleExportReport = async (format: ExportFormat, visibleColumns?: string[]) => {
    if (!reportResults) return;
    
    setExportLoading(true);
    try {
      if (format === 'excel' && lastExecutionId) {
        // Use backend Excel export for better formatting with visible columns
        await reportsService.exportHistoryResults(lastExecutionId, 'excel', visibleColumns);
        message.success('Excel report exported successfully');
      } else {
        // Use client-side export for CSV and JSON
        const blob = await reportsService.exportReportData(reportResults, format);
        const filename = `${reportResults.metadata?.templateName || 'report'}_${new Date().toISOString().split('T')[0]}.${format}`;
        
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        message.success(`Report exported as ${format.toUpperCase()}`);
      }
    } catch (error) {
      message.error(`Failed to export report: ${error}`);
    } finally {
      setExportLoading(false);
    }
  };

  return (
    <div style={{ 
      minHeight: 'calc(100vh - 64px)',
      background: darkMode ? '#1a1a1a' : '#f5f5f5',
      transition: 'all 0.5s ease',
      position: 'relative',
      overflow: 'auto'
    }}>
      {/* Animated Background */}
      <div style={{
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 0
      }}>
        <div style={{
          position: 'absolute',
          top: '-10rem',
          right: '-10rem',
          width: '20rem',
          height: '20rem',
          background: darkMode ? 'rgba(75, 85, 99, 0.1)' : 'rgba(75, 85, 99, 0.2)',
          borderRadius: '50%',
          filter: 'blur(60px)',
          animation: 'pulse 4s ease-in-out infinite'
        }} />
        <div style={{
          position: 'absolute',
          bottom: '-10rem',
          left: '-10rem',
          width: '20rem',
          height: '20rem',
          background: darkMode ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.2)',
          borderRadius: '50%',
          filter: 'blur(60px)',
          animation: 'pulse 4s ease-in-out infinite 2s'
        }} />
      </div>

      {/* Clean Results View */}
      <div style={{ 
        padding: '32px',
        position: 'relative',
        zIndex: 1
      }}>
        {/* Results Header */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '32px'
        }}>
          <div>
            <h1 style={{ 
              margin: 0, 
              fontSize: '32px',
              fontWeight: 'bold',
              color: darkMode ? 'white' : '#1f2937',
              marginBottom: '8px'
            }}>
              Report Results
            </h1>
            {reportResults && (
              <p style={{ 
                margin: 0,
                fontSize: '16px',
                color: darkMode ? '#9ca3af' : '#6b7280'
              }}>
                {reportResults.metadata?.templateName} - Executed {formatDate(reportResults.executedAt)}
              </p>
            )}
          </div>
          <button
            onClick={() => {
              navigate('/dashboard');
              setReportResults(null);
            }}
            className="btn-gradient"
            style={{
              padding: '12px 24px',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 8px 25px rgba(75, 85, 99, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            Back to Dashboard
          </button>
        </div>

        {/* Current Results */}
        {reportResults && (
          <div style={{
            marginBottom: '48px'
          }}>
            <ReportDataTable
              data={reportResults}
              loading={false}
              title=""
              description=""
              onExport={handleExportReport}
              exportLoading={exportLoading}
              showSearch={true}
              pageSize={50}
            />
          </div>
        )}

        {/* Recent Report History */}
        <div style={{
          borderRadius: '16px',
          background: darkMode ? 'rgba(17, 24, 39, 0.5)' : 'rgba(255, 255, 255, 0.9)',
          backdropFilter: 'blur(20px)',
          border: darkMode ? '1px solid rgba(55, 65, 81, 1)' : '1px solid rgba(229, 231, 235, 1)',
          padding: '24px'
        }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '24px'
          }}>
            <h2 style={{ 
              margin: 0, 
              fontSize: '24px',
              fontWeight: 'bold',
              color: darkMode ? 'white' : '#1f2937'
            }}>
              Recent Reports
            </h2>
            <span style={{
              fontSize: '14px',
              color: darkMode ? '#9ca3af' : '#6b7280'
            }}>
              Last 10 executions
            </span>
          </div>
          
          {/* Recent executions list */}
          {statsLoading ? (
            <div style={{
              padding: '40px',
              textAlign: 'center',
              color: darkMode ? '#9ca3af' : '#6b7280'
            }}>
              <RefreshCw size={32} style={{ margin: '0 auto 16px', opacity: 0.5, animation: 'spin 2s linear infinite' }} />
              <p style={{ fontSize: '16px', margin: 0 }}>Loading recent reports...</p>
            </div>
          ) : statsError ? (
            <div style={{
              padding: '40px',
              textAlign: 'center',
              color: darkMode ? '#ef4444' : '#dc2626'
            }}>
              <AlertCircle size={48} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
              <p style={{ fontSize: '16px', margin: 0 }}>Error loading recent reports</p>
              <p style={{ fontSize: '14px', margin: '8px 0 0 0', opacity: 0.8 }}>{statsError}</p>
            </div>
          ) : dashboardStats?.recentExecutions && dashboardStats.recentExecutions.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {dashboardStats.recentExecutions.slice(0, 10).map((execution, index) => (
                <div
                  key={execution.id || index}
                  style={{
                    padding: '16px',
                    borderRadius: '12px',
                    background: darkMode ? 'rgba(31, 41, 55, 0.5)' : 'rgba(249, 250, 251, 0.8)',
                    border: darkMode ? '1px solid rgba(75, 85, 99, 0.5)' : '1px solid rgba(229, 231, 235, 0.8)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'all 0.2s ease',
                    cursor: 'pointer'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = darkMode 
                      ? '0 8px 25px rgba(0, 0, 0, 0.3)' 
                      : '0 8px 25px rgba(0, 0, 0, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div>
                    <div style={{
                      fontWeight: '600',
                      fontSize: '16px',
                      color: darkMode ? 'white' : '#1f2937',
                      marginBottom: '4px'
                    }}>
                      {execution.reportName}
                    </div>
                    <div style={{
                      fontSize: '14px',
                      color: darkMode ? '#9ca3af' : '#6b7280'
                    }}>
                      {execution.reportCategory} • {formatDate(execution.generatedAt)}
                    </div>
                  </div>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px'
                  }}>
                    <div style={{
                      fontSize: '14px',
                      color: darkMode ? '#d1d5db' : '#4b5563',
                      textAlign: 'right'
                    }}>
                      <div style={{ fontWeight: '600' }}>{execution.rowCount} rows</div>
                      <div style={{
                        fontSize: '12px',
                        color: execution.status === 'success' 
                          ? (darkMode ? '#10b981' : '#059669')
                          : execution.status === 'error'
                          ? (darkMode ? '#ef4444' : '#dc2626')
                          : (darkMode ? '#f59e0b' : '#d97706')
                      }}>
                        {execution.status}
                      </div>
                    </div>
                    {execution.status === 'success' && (
                      <CheckCircle size={20} style={{
                        color: darkMode ? '#10b981' : '#059669'
                      }} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{
              padding: '40px',
              textAlign: 'center',
              color: darkMode ? '#9ca3af' : '#6b7280'
            }}>
              <FileText size={48} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
              <p style={{ fontSize: '16px', margin: 0 }}>No recent report executions found</p>
            </div>
          )}
        </div>
      </div>

      {/* Report Execution Modal */}
      {executionModalOpen && selectedTemplate && (
        <ReportExecutionModal
          queryDefinition={selectedTemplate}
          onClose={() => {
            setExecutionModalOpen(false);
            setSelectedTemplate(null);
          }}
          onExecute={handleExecuteReport}
        />
      )}
      
      <style jsx global>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
        
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
};

export default ReportsPageV2;