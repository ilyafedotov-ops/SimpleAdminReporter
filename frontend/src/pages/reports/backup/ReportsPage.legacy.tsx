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
import { QueryDefinition, QueryExecutionResult } from '@/types';
import { ReportExecutionModal } from '@/components/reports/ReportExecutionModal';
import { QueryHealthBanner } from '@/components/query/QueryHealthBanner';
import { message } from 'antd';
import { reportsService } from '@/services/reportsService';


const ReportsPageV2: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const theme = useAppSelector(selectTheme);
  
  // Use query hooks (minimal for results view)
  const { definitions } = useQueryDefinitions();
  const { execute } = useQueryExecution();
  const { stats: dashboardStats } = useDashboardStats();
  
  const [selectedTemplate, setSelectedTemplate] = useState<QueryDefinition | null>(null);
  const [executionModalOpen, setExecutionModalOpen] = useState(false);
  
  // Results view state
  const [reportResults, setReportResults] = useState<any>(null);
  const [resultsFilter, setResultsFilter] = useState('');
  const [resultsSortField, setResultsSortField] = useState<string | null>(null);
  const [resultsSortDirection, setResultsSortDirection] = useState<'asc' | 'desc'>('asc');
  const [resultsPage, setResultsPage] = useState(1);
  const resultsPageSize = 50;
  
  const darkMode = theme.darkMode;

  useEffect(() => {
    dispatch(setCurrentPage({ page: 'reports', title: 'Report Results' }));
    dispatch(setBreadcrumbs([{ title: 'Report Results' }]));
  }, [dispatch]);

  // Load results from sessionStorage when navigating to reports page
  useEffect(() => {
    const storedResults = sessionStorage.getItem('reportResults');
    if (storedResults) {
      const parsedResults = JSON.parse(storedResults);
      setReportResults(parsedResults);
      // Clear from sessionStorage after reading
      sessionStorage.removeItem('reportResults');
    }
  }, []);

  // Reports page always shows results view since we have separate /dashboard
  const isResultsView = true;

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

  // Transform query definitions to match original template format
  const getIconForCategory = (category: string) => {
    switch (category?.toLowerCase()) {
      case 'ad':
      case 'active directory': return UserCheck;
      case 'azure':
      case 'azure ad': return Cloud;
      case 'o365':
      case 'office 365': return Mail;
      case 'user management': return UserCheck;
      case 'security': return Shield;
      case 'compliance': return FileSpreadsheet;
      default: return FileText;
    }
  };

  const getColorForCategory = (category: string) => {
    const colors = [
      'from-blue-500 to-blue-600',
      'from-purple-500 to-purple-600', 
      'from-red-500 to-red-600',
      'from-cyan-500 to-cyan-600',
      'from-green-500 to-green-600',
      'from-indigo-500 to-indigo-600'
    ];
    return colors[Math.abs(category?.toLowerCase().charCodeAt(0) || 0) % colors.length];
  };

  // Transform definitions to template format for display
  const reportTemplates = definitions.map((def: QueryDefinition) => ({
    id: def.id,
    name: def.name,
    category: def.category,
    description: def.description,
    icon: getIconForCategory(def.category),
    color: getColorForCategory(def.category),
    lastRun: metrics?.byQuery?.[def.id]?.lastExecutedAt 
      ? new Date(metrics.byQuery[def.id].lastExecutedAt).toLocaleDateString() 
      : 'Never',
    avgTime: metrics?.byQuery?.[def.id]?.averageExecutionTime 
      ? `${(metrics.byQuery[def.id].averageExecutionTime / 1000).toFixed(1)}s` 
      : 'N/A',
    cached: !!cacheState?.byQueryId?.[def.id]?.length
  }));

  // Dashboard stats with query system data
  const stats = [
    { 
      title: 'Reports Generated', 
      value: useCounter(metrics?.totalExecutions || 0), 
      subtitle: 'Total executions', 
      icon: FileText, 
      color: 'from-blue-500 to-cyan-500',
      bgGlow: 'bg-blue-500/20'
    },
    { 
      title: 'Success Rate', 
      value: useCounter(Math.round(metrics?.successRate || 0)), 
      subtitle: `${(metrics?.successRate || 0).toFixed(1)}% success`, 
      icon: CheckCircle, 
      color: 'from-purple-500 to-pink-500',
      bgGlow: 'bg-purple-500/20'
    },
    { 
      title: 'Active Queries', 
      value: useCounter(activeExecutions.length), 
      subtitle: 'Currently running', 
      icon: Activity, 
      color: 'from-emerald-500 to-green-500',
      bgGlow: 'bg-emerald-500/20'
    },
    { 
      title: 'Cache Hit Rate', 
      value: useCounter(Math.round(metrics?.cacheHitRate || 0)), 
      subtitle: `${(metrics?.cacheHitRate || 0).toFixed(1)}% cached`, 
      icon: Zap, 
      color: 'from-amber-500 to-orange-500',
      bgGlow: 'bg-amber-500/20'
    },
  ];

  // Transform metrics for pie chart
  const reportCategories = metrics?.executionsBySource 
    ? Object.entries(metrics.executionsBySource).map(([name, value], index) => ({
        name: name === 'ad' ? 'Active Directory' : 
              name === 'azure' ? 'Azure AD' : 
              name === 'o365' ? 'Office 365' : 
              name === 'postgres' ? 'Database' : name,
        value,
        color: ['#60a5fa', '#a78bfa', '#f87171', '#34d399'][index % 4]
      })) 
    : [];

  const handleGenerateReport = (template: any) => {
    const definition = definitions.find(d => d.id === template.id);
    if (definition) {
      setSelectedTemplate(definition);
      setExecutionModalOpen(true);
    }
  };

  const handleExecuteReport = async (queryId: string, parameters: Record<string, any>, options?: any) => {
    try {
      const result = await execute(queryId, parameters, options);
      return result;
    } catch (error) {
      console.error('Execution failed:', error);
      throw error;
    }
  };

  const exportFormats = ['PDF', 'Excel', 'CSV', 'PowerBI', 'JSON'];

  // Helper function to convert data to CSV
  const convertToCSV = (data: any[]) => {
    if (!data || data.length === 0) return '';
    
    const headers = Object.keys(data[0]);
    const csvHeaders = headers.join(',');
    
    const csvRows = data.map(row => 
      headers.map(header => {
        const value = row[header];
        // Escape quotes and wrap in quotes if contains comma
        const escaped = String(value || '').replace(/"/g, '""');
        return escaped.includes(',') ? `"${escaped}"` : escaped;
      }).join(',')
    );
    
    return [csvHeaders, ...csvRows].join('\n');
  };

  // Helper function to download file
  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Render results table
  const renderResultsTable = () => {
    if (!reportResults?.results?.data || reportResults.results.data.length === 0) {
      return (
        <div style={{
          padding: '80px',
          textAlign: 'center',
          color: darkMode ? '#9ca3af' : '#6b7280',
          borderRadius: '16px',
          background: darkMode ? 'rgba(17, 24, 39, 0.5)' : 'rgba(255, 255, 255, 0.9)',
          border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(229, 231, 235, 1)'
        }}>
          <Database size={64} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
          <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>No Results</h3>
          <p>No data returned from this query.</p>
        </div>
      );
    }

    // Extract columns from first row
    const columns = Object.keys(reportResults.results.data[0]);
    
    // Apply filtering
    let filteredData = [...reportResults.results.data];
    if (resultsFilter) {
      filteredData = filteredData.filter(row =>
        Object.values(row).some(value =>
          String(value || '').toLowerCase().includes(resultsFilter.toLowerCase())
        )
      );
    }
    
    // Apply sorting
    if (resultsSortField) {
      filteredData.sort((a, b) => {
        const aVal = a[resultsSortField];
        const bVal = b[resultsSortField];
        const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return resultsSortDirection === 'asc' ? comparison : -comparison;
      });
    }
    
    // Apply pagination
    const totalPages = Math.ceil(filteredData.length / resultsPageSize);
    const paginatedData = filteredData.slice(
      (resultsPage - 1) * resultsPageSize,
      resultsPage * resultsPageSize
    );

    return (
      <div>
        <div style={{
          borderRadius: '16px',
          background: darkMode ? 'rgba(17, 24, 39, 0.5)' : 'rgba(255, 255, 255, 0.9)',
          backdropFilter: 'blur(20px)',
          border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(229, 231, 235, 1)',
          overflow: 'hidden'
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: '800px' }}>
              <thead>
                <tr style={{ background: darkMode ? 'rgba(55, 65, 81, 0.5)' : 'rgba(249, 250, 251, 1)' }}>
                  {columns.map(column => (
                    <th
                      key={column}
                      style={{
                        padding: '16px 24px',
                        textAlign: 'left',
                        fontSize: '12px',
                        fontWeight: '500',
                        color: darkMode ? '#9ca3af' : '#6b7280',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        cursor: 'pointer',
                        userSelect: 'none',
                        whiteSpace: 'nowrap'
                      }}
                      onClick={() => {
                        if (resultsSortField === column) {
                          setResultsSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                        } else {
                          setResultsSortField(column);
                          setResultsSortDirection('asc');
                        }
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {column}
                        {resultsSortField === column && (
                          resultsSortDirection === 'asc' ? <SortAsc size={14} /> : <SortDesc size={14} />
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedData.map((row, index) => (
                  <tr
                    key={index}
                    style={{
                      borderTop: darkMode ? '1px solid rgba(55, 65, 81, 1)' : '1px solid rgba(229, 231, 235, 1)',
                      transition: 'background-color 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = darkMode ? 'rgba(55, 65, 81, 0.5)' : 'rgba(249, 250, 251, 1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    {columns.map(column => (
                      <td
                        key={column}
                        style={{
                          padding: '16px 24px',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          maxWidth: '300px',
                          color: darkMode ? '#f3f4f6' : '#374151',
                          fontSize: '14px'
                        }}
                        title={String(row[column] || '')}
                      >
                        {row[column] !== null && row[column] !== undefined ? String(row[column]) : '-'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        
        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 16,
            padding: '0 8px'
          }}>
            <div style={{ color: darkMode ? '#9ca3af' : '#6b7280', fontSize: '14px' }}>
              Showing {((resultsPage - 1) * resultsPageSize) + 1} to {Math.min(resultsPage * resultsPageSize, filteredData.length)} of {filteredData.length} results
              {resultsFilter && ` (filtered from ${reportResults.results.data.length})`}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setResultsPage(1)}
                disabled={resultsPage === 1}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: darkMode ? '1px solid #374151' : '1px solid #d1d5db',
                  background: 'transparent',
                  color: resultsPage === 1 ? (darkMode ? '#4b5563' : '#9ca3af') : (darkMode ? '#d1d5db' : '#4b5563'),
                  fontSize: '14px',
                  cursor: resultsPage === 1 ? 'not-allowed' : 'pointer',
                  opacity: resultsPage === 1 ? 0.5 : 1
                }}
              >
                First
              </button>
              <button
                onClick={() => setResultsPage(prev => Math.max(1, prev - 1))}
                disabled={resultsPage === 1}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: darkMode ? '1px solid #374151' : '1px solid #d1d5db',
                  background: 'transparent',
                  color: resultsPage === 1 ? (darkMode ? '#4b5563' : '#9ca3af') : (darkMode ? '#d1d5db' : '#4b5563'),
                  fontSize: '14px',
                  cursor: resultsPage === 1 ? 'not-allowed' : 'pointer',
                  opacity: resultsPage === 1 ? 0.5 : 1
                }}
              >
                Previous
              </button>
              <span style={{
                padding: '6px 12px',
                color: darkMode ? '#f3f4f6' : '#1f2937',
                fontSize: '14px'
              }}>
                Page {resultsPage} of {totalPages}
              </span>
              <button
                onClick={() => setResultsPage(prev => Math.min(totalPages, prev + 1))}
                disabled={resultsPage === totalPages}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: darkMode ? '1px solid #374151' : '1px solid #d1d5db',
                  background: 'transparent',
                  color: resultsPage === totalPages ? (darkMode ? '#4b5563' : '#9ca3af') : (darkMode ? '#d1d5db' : '#4b5563'),
                  fontSize: '14px',
                  cursor: resultsPage === totalPages ? 'not-allowed' : 'pointer',
                  opacity: resultsPage === totalPages ? 0.5 : 1
                }}
              >
                Next
              </button>
              <button
                onClick={() => setResultsPage(totalPages)}
                disabled={resultsPage === totalPages}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: darkMode ? '1px solid #374151' : '1px solid #d1d5db',
                  background: 'transparent',
                  color: resultsPage === totalPages ? (darkMode ? '#4b5563' : '#9ca3af') : (darkMode ? '#d1d5db' : '#4b5563'),
                  fontSize: '14px',
                  cursor: resultsPage === totalPages ? 'not-allowed' : 'pointer',
                  opacity: resultsPage === totalPages ? 0.5 : 1
                }}
              >
                Last
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ 
      minHeight: 'calc(100vh - 64px)',
      background: darkMode ? '#0f172a' : 'linear-gradient(135deg, #f0f9ff 0%, #e0e7ff 50%, #fdf2f8 100%)',
      transition: 'all 0.5s ease',
      position: 'relative',
      overflow: 'auto'
    }}>
      {/* Animated Background (reused from original) */}
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
          background: darkMode ? 'rgba(147, 51, 234, 0.1)' : 'rgba(147, 51, 234, 0.2)',
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

      {/* Query Health Banner */}
      {!isResultsView && <QueryHealthBanner />}

      {/* Clean Results View - Show only when ?view=results */}
      {isResultsView ? (
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
                  {reportResults.queryName} - Executed {new Date(reportResults.executedAt).toLocaleString()}
                </p>
              )}
            </div>
            <button
              onClick={() => {
                navigate('/dashboard');
                setReportResults(null);
              }}
              style={{
                padding: '12px 24px',
                borderRadius: '8px',
                border: 'none',
                background: darkMode ? '#4f46e5' : '#6366f1',
                color: 'white',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 8px 25px rgba(99, 102, 241, 0.3)';
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
              marginBottom: '48px',
              borderRadius: '16px',
              background: darkMode ? 'rgba(17, 24, 39, 0.5)' : 'rgba(255, 255, 255, 0.9)',
              backdropFilter: 'blur(20px)',
              border: darkMode ? '1px solid rgba(55, 65, 81, 1)' : '1px solid rgba(229, 231, 235, 1)',
              overflow: 'hidden'
            }}>
              {renderResultsTable()}
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
            {dashboardStats?.recentExecutions && dashboardStats.recentExecutions.length > 0 ? (
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
                        {execution.reportCategory} • {new Date(execution.generatedAt).toLocaleString()}
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
      ) : (
        <>
          {/* Tab Navigation */}
      <div style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '32px',
        padding: '32px 32px 0',
        position: 'relative',
        zIndex: 1
      }}>
        {[
          { id: 'dashboard', name: 'Dashboard' },
          { id: 'templates', name: 'Templates' },
          { id: 'history', name: 'History' },
          { id: 'scheduled', name: 'Scheduled' },
          ...(reportResults ? [{ id: 'results', name: 'Results' }] : [])
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '12px 24px',
              borderRadius: '12px',
              border: 'none',
              background: activeTab === tab.id
                ? (darkMode ? 'rgba(55, 65, 81, 0.8)' : 'linear-gradient(135deg, #3b82f6, #8b5cf6)')
                : 'transparent',
              color: activeTab === tab.id
                ? 'white'
                : (darkMode ? '#d1d5db' : '#4b5563'),
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              fontSize: '14px',
              fontWeight: '500'
            }}
            onMouseEnter={(e) => {
              if (activeTab !== tab.id) {
                e.currentTarget.style.background = darkMode ? 'rgba(55, 65, 81, 0.5)' : 'rgba(147, 51, 234, 0.1)';
              }
            }}
            onMouseLeave={(e) => {
              if (activeTab !== tab.id) {
                e.currentTarget.style.background = 'transparent';
              }
            }}
          >
            {tab.name}
            {tab.id === 'history' && activeExecutions.length > 0 && (
              <span style={{
                marginLeft: '8px',
                padding: '2px 6px',
                borderRadius: '10px',
                background: 'rgba(239, 68, 68, 0.2)',
                color: '#ef4444',
                fontSize: '12px',
                fontWeight: 'bold'
              }}>
                {activeExecutions.length}
              </span>
            )}
          </button>
        ))}

        {/* Actions */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          {/* Cache Clear Button */}
          <button
            onClick={() => clearCache()}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: 'none',
              background: darkMode ? 'rgba(55, 65, 81, 0.5)' : 'rgba(147, 51, 234, 0.1)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              color: darkMode ? '#d1d5db' : '#8b5cf6'
            }}
            title={`Cache: ${cacheState.currentSize}/${cacheState.maxCacheSize} entries`}
          >
            <Zap size={16} />
            Clear Cache
          </button>
          
          {/* Dark Mode Toggle */}
          <button
            onClick={() => dispatch(toggleDarkMode())}
            style={{
              padding: '8px',
              borderRadius: '8px',
              border: 'none',
              background: darkMode ? 'rgba(55, 65, 81, 0.5)' : 'rgba(147, 51, 234, 0.1)',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            {darkMode ? '🌞' : '🌙'}
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div style={{ padding: '0 32px 32px', position: 'relative', zIndex: 1, paddingBottom: '64px' }}>
        {activeTab === 'dashboard' && (
          <div>
            {/* Page Title */}
            <div style={{ marginBottom: 32 }}>
              <h2 style={{ 
                margin: 0, 
                fontSize: '32px',
                fontWeight: 'bold',
                color: darkMode ? 'white' : '#1f2937',
                marginBottom: '8px'
              }}>
                Reporting Dashboard
              </h2>
              <p style={{ 
                margin: 0,
                fontSize: '16px',
                color: darkMode ? '#9ca3af' : '#6b7280'
              }}>
                Generate comprehensive reports for Active Directory, Azure AD, and Office 365
              </p>
              
              {/* Error Banner */}
              {defsError && (
                <div style={{
                  marginTop: '16px',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#dc2626',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <AlertCircle size={16} />
                  <strong>Error:</strong> {defsError}
                </div>
              )}
            </div>

            {/* Compact Stats Row */}
            <div style={{ 
              display: 'flex', 
              flexWrap: 'wrap', 
              gap: '16px', 
              marginBottom: 32 
            }}>
              {metricsLoading ? (
                // Loading skeleton for stats
                [...Array(4)].map((_, index) => (
                  <div
                    key={index}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '16px 20px',
                      borderRadius: '12px',
                      background: darkMode ? 'rgba(17, 24, 39, 0.5)' : 'rgba(255, 255, 255, 0.9)',
                      backdropFilter: 'blur(20px)',
                      border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(255, 255, 255, 0.2)',
                      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                      minWidth: '200px'
                    }}
                  >
                    <div style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '8px',
                      background: darkMode ? 'rgba(55, 65, 81, 0.5)' : 'rgba(147, 51, 234, 0.2)',
                      animation: 'pulse 1.5s ease-in-out infinite'
                    }} />
                    <div>
                      <div style={{
                        width: '60px',
                        height: '20px',
                        borderRadius: '4px',
                        background: darkMode ? 'rgba(55, 65, 81, 0.5)' : 'rgba(147, 51, 234, 0.2)',
                        marginBottom: '4px',
                        animation: 'pulse 1.5s ease-in-out infinite'
                      }} />
                      <div style={{
                        width: '80px',
                        height: '12px',
                        borderRadius: '4px',
                        background: darkMode ? 'rgba(55, 65, 81, 0.5)' : 'rgba(147, 51, 234, 0.2)',
                        animation: 'pulse 1.5s ease-in-out infinite'
                      }} />
                    </div>
                  </div>
                ))
              ) : (
                stats.map((stat, index) => (
                  <div
                    key={index}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '16px 20px',
                      borderRadius: '12px',
                      background: darkMode ? 'rgba(17, 24, 39, 0.5)' : 'rgba(255, 255, 255, 0.9)',
                      backdropFilter: 'blur(20px)',
                      border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(255, 255, 255, 0.2)',
                      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                      cursor: 'pointer',
                      transition: 'all 0.3s ease',
                      minWidth: '200px'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.05)';
                      e.currentTarget.style.boxShadow = '0 8px 25px rgba(0, 0, 0, 0.15)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                      e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
                    }}
                  >
                    <div style={{
                      padding: '8px',
                      borderRadius: '8px',
                      background: `linear-gradient(135deg, ${stat.color.split(' ')[1]}, ${stat.color.split(' ')[3]})`,
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
                    }}>
                      <stat.icon size={18} />
                    </div>
                    <div>
                      <div style={{ 
                        fontSize: '24px', 
                        fontWeight: 'bold', 
                        color: darkMode ? 'white' : '#1f2937',
                        lineHeight: 1 
                      }}>
                        {stat.title === 'Success Rate' || stat.title === 'Cache Hit Rate' 
                          ? `${stat.value}%` 
                          : stat.value.toLocaleString()}
                      </div>
                      <div style={{ 
                        fontSize: '12px', 
                        color: darkMode ? '#9ca3af' : '#8b5cf6',
                        fontWeight: 500 
                      }}>
                        {stat.title}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Charts Row */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
              gap: '24px',
              marginBottom: 32
            }}>
              {/* Recent Activity Overview */}
              <div
                style={{
                  borderRadius: '16px',
                  background: darkMode ? 'rgba(17, 24, 39, 0.5)' : 'rgba(255, 255, 255, 0.9)',
                  backdropFilter: 'blur(20px)',
                  border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(255, 255, 255, 0.2)',
                  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                  padding: '24px'
                }}
              >
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  marginBottom: 24 
                }}>
                  <h3 style={{ 
                    margin: 0,
                    fontSize: '20px',
                    fontWeight: '600',
                    color: darkMode ? 'white' : '#1f2937'
                  }}>Recent Activity</h3>
                  <button
                    onClick={() => {
                      fetchDefinitions();
                      fetchMetrics();
                    }}
                    style={{
                      padding: '4px 12px',
                      borderRadius: '8px',
                      border: darkMode ? '1px solid #4b5563' : '1px solid #d1d5db',
                      fontSize: '14px',
                      background: darkMode ? '#374151' : '#f9fafb',
                      color: darkMode ? '#f3f4f6' : '#1f2937',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <RefreshCw size={14} />
                    Refresh
                  </button>
                </div>
                {executionHistory.length > 0 ? (
                  <div style={{ maxHeight: 300, overflow: 'auto' }}>
                    {executionHistory.filter(execution => execution && execution.queryId).slice(0, 5).map((execution, index) => (
                      <div
                        key={execution.id || `execution-${index}`}
                        style={{
                          padding: '12px',
                          marginBottom: '8px',
                          borderRadius: '8px',
                          background: darkMode ? 'rgba(55, 65, 81, 0.3)' : 'rgba(147, 51, 234, 0.05)',
                          border: darkMode ? '1px solid rgba(75, 85, 99, 0.3)' : '1px solid rgba(147, 51, 234, 0.1)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = darkMode ? 'rgba(55, 65, 81, 0.5)' : 'rgba(147, 51, 234, 0.1)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = darkMode ? 'rgba(55, 65, 81, 0.3)' : 'rgba(147, 51, 234, 0.05)';
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{
                            fontSize: '14px',
                            fontWeight: '500',
                            color: darkMode ? 'white' : '#1f2937',
                            marginBottom: '4px'
                          }}>
                            {definitions.find(d => d.id === execution.queryId)?.name || execution.queryId}
                          </div>
                          <div style={{
                            fontSize: '12px',
                            color: darkMode ? '#9ca3af' : '#6b7280',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                          }}>
                            <span>{new Date(execution.startTime).toLocaleDateString()}</span>
                            {execution.result && (
                              <>
                                <span>•</span>
                                <span>{execution.result.metadata.rowCount} rows</span>
                              </>
                            )}
                            {execution.endTime && (
                              <>
                                <span>•</span>
                                <span>{((execution.endTime - execution.startTime) / 1000).toFixed(1)}s</span>
                              </>
                            )}
                          </div>
                        </div>
                        <div style={{
                          padding: '4px 8px',
                          borderRadius: '20px',
                          fontSize: '12px',
                          fontWeight: '500',
                          background: execution.status === 'completed' 
                            ? 'rgba(16, 185, 129, 0.1)' 
                            : execution.status === 'failed'
                            ? 'rgba(239, 68, 68, 0.1)'
                            : 'rgba(245, 158, 11, 0.1)',
                          color: execution.status === 'completed' 
                            ? '#10b981' 
                            : execution.status === 'failed'
                            ? '#ef4444'
                            : '#f59e0b',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          {execution.status === 'completed' ? <CheckCircle size={12} /> : 
                           execution.status === 'failed' ? <AlertCircle size={12} /> : 
                           <Clock size={12} />}
                          {execution.status}
                          {execution.result?.metadata.cachedResult && (
                            <Zap size={12} title="From cache" />
                          )}
                        </div>
                      </div>
                    ))}
                    {executionHistory.length > 5 && (
                      <button
                        onClick={() => setActiveTab('history')}
                        style={{
                          width: '100%',
                          padding: '8px',
                          marginTop: '8px',
                          borderRadius: '8px',
                          border: 'none',
                          background: darkMode ? 'rgba(55, 65, 81, 0.5)' : 'rgba(147, 51, 234, 0.1)',
                          color: darkMode ? '#d1d5db' : '#8b5cf6',
                          fontSize: '14px',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        View all history
                      </button>
                    )}
                  </div>
                ) : (
                  <div style={{
                    height: 300,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: darkMode ? '#9ca3af' : '#6b7280'
                  }}>
                    <Clock size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
                    <p style={{ fontSize: '16px', margin: 0 }}>No recent activity</p>
                    <p style={{ fontSize: '14px', margin: '8px 0 0 0', opacity: 0.8 }}>
                      Generate some reports to see activity
                    </p>
                  </div>
                )}
              </div>

              {/* Report Categories */}
              <div
                style={{
                  borderRadius: '16px',
                  background: darkMode ? 'rgba(17, 24, 39, 0.5)' : 'rgba(255, 255, 255, 0.9)',
                  backdropFilter: 'blur(20px)',
                  border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(255, 255, 255, 0.2)',
                  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                  padding: '24px'
                }}
              >
                <h3 style={{ 
                  marginBottom: 24,
                  margin: 0,
                  fontSize: '20px',
                  fontWeight: '600',
                  color: darkMode ? 'white' : '#1f2937'
                }}>Reports by Source</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={reportCategories}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {reportCategories.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Quick Access Templates */}
            <div>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                marginBottom: 16 
              }}>
                <h3 style={{ 
                  margin: 0,
                  fontSize: '20px',
                  fontWeight: '600',
                  color: darkMode ? 'white' : '#1f2937'
                }}>Popular Templates</h3>
                <button
                  onClick={() => setActiveTab('templates')}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '4px',
                    color: darkMode ? '#9ca3af' : '#6b7280',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  View all templates
                  <ChevronRight size={16} />
                </button>
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: window.innerWidth < 640 ? '1fr' : 'repeat(auto-fit, minmax(300px, 1fr))',
                gap: '16px',
                width: '100%'
              }}>
                {defsLoading ? (
                  <div style={{
                    gridColumn: '1 / -1',
                    textAlign: 'center',
                    padding: '40px',
                    color: darkMode ? '#9ca3af' : '#6b7280'
                  }}>
                    Loading templates...
                  </div>
                ) : reportTemplates.length === 0 ? (
                  <div style={{
                    gridColumn: '1 / -1',
                    textAlign: 'center',
                    padding: '40px',
                    color: darkMode ? '#9ca3af' : '#6b7280'
                  }}>
                    No report templates available. Please check your backend connection.
                  </div>
                ) : (
                  reportTemplates.slice(0, 3).map((template) => {
                    const IconComponent = template.icon;
                    return (
                      <div
                        key={template.id}
                        style={{
                          borderRadius: '12px',
                          background: darkMode ? 'rgba(17, 24, 39, 0.5)' : 'rgba(255, 255, 255, 0.9)',
                          backdropFilter: 'blur(20px)',
                          border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(255, 255, 255, 0.2)',
                          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                          transition: 'all 0.3s ease',
                          overflow: 'hidden',
                          position: 'relative',
                          cursor: 'pointer',
                          minHeight: '220px',
                          display: 'flex',
                          flexDirection: 'column'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'scale(1.05)';
                          e.currentTarget.style.boxShadow = '0 8px 25px rgba(0, 0, 0, 0.15)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'scale(1)';
                          e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
                        }}
                      >
                        <div style={{ position: 'relative', padding: '24px' }}>
                          <div style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'flex-start', 
                            marginBottom: 16 
                          }}>
                            <div style={{
                              width: '48px',
                              height: '48px',
                              borderRadius: '12px',
                              background: `linear-gradient(135deg, ${template.color.replace('from-', '').replace(' to-', ', ')})`,
                              color: 'white',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.2)'
                            }}>
                              <IconComponent size={24} />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {template.cached && (
                                <Zap size={16} color="#8b5cf6" title="Cached results available" />
                              )}
                              <button
                                style={{
                                  padding: '8px 16px',
                                  background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                                  border: 'none',
                                  borderRadius: '8px',
                                  color: 'white',
                                  fontSize: '12px',
                                  fontWeight: '500',
                                  cursor: 'pointer',
                                  opacity: 1,
                                  transition: 'all 0.3s ease'
                                }}
                                onClick={() => handleGenerateReport(template)}
                              >
                                Generate
                              </button>
                            </div>
                          </div>
                          <h4 style={{ 
                            margin: '0 0 8px 0',
                            fontSize: '16px',
                            fontWeight: '600',
                            color: darkMode ? 'white' : '#1f2937'
                          }}>{template.name}</h4>
                          <p style={{ 
                            fontSize: '14px', 
                            lineHeight: 1.4,
                            color: darkMode ? '#9ca3af' : '#6b7280',
                            margin: 0,
                            flex: 1,
                            minHeight: '42px'
                          }}>
                            {template.description}
                          </p>
                          <div style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            marginTop: 16, 
                            paddingTop: 16, 
                            borderTop: darkMode ? '1px solid #374151' : '1px solid #e5e7eb',
                            fontSize: '12px',
                            color: darkMode ? '#9ca3af' : '#6b7280'
                          }}>
                            <span>Last run: {template.lastRun}</span>
                            <span>Avg: {template.avgTime}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* Templates Tab */}
        {activeTab === 'templates' && (
          <div>
            <div style={{ marginBottom: 32 }}>
              <h2 style={{ 
                margin: 0, 
                fontSize: '32px',
                fontWeight: 'bold',
                color: darkMode ? 'white' : '#1f2937',
                marginBottom: '8px'
              }}>
                Report Templates
              </h2>
              <p style={{ 
                margin: 0,
                fontSize: '16px',
                color: darkMode ? '#9ca3af' : '#6b7280'
              }}>
                Choose from pre-configured templates or create custom reports
              </p>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: '16px', marginBottom: 32 }}>
              <select 
                value={ui.filterByDataSource || ''}
                onChange={(e) => setFilters({ dataSource: e.target.value || null })}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  border: darkMode ? '1px solid #374151' : '1px solid #d1d5db',
                  background: darkMode ? '#1f2937' : 'white',
                  color: darkMode ? '#f3f4f6' : '#1f2937',
                  cursor: 'pointer'
                }}
              >
                <option value="">All Sources</option>
                <option value="ad">Active Directory</option>
                <option value="azure">Azure AD</option>
                <option value="o365">Office 365</option>
                <option value="postgres">Database</option>
              </select>

              <input
                type="text"
                placeholder="Search templates..."
                value={ui.searchQuery}
                onChange={(e) => setFilters({ search: e.target.value })}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  fontSize: '14px',
                  border: darkMode ? '1px solid #374151' : '1px solid #d1d5db',
                  background: darkMode ? '#1f2937' : 'white',
                  color: darkMode ? '#f3f4f6' : '#1f2937',
                  minWidth: '200px'
                }}
              />

              <button
                onClick={() => {
                  setFilters({ dataSource: null, search: '' });
                  fetchDefinitions();
                }}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  background: darkMode ? 'rgba(55, 65, 81, 0.8)' : 'rgba(229, 231, 235, 1)',
                  color: darkMode ? '#f3f4f6' : '#374151',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '14px'
                }}
              >
                <RefreshCw size={16} />
                Reset
              </button>
            </div>

            {/* Templates Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: '24px'
            }}>
              {reportTemplates.map((template) => {
                const IconComponent = template.icon;
                return (
                  <div
                    key={template.id}
                    style={{
                      borderRadius: '16px',
                      background: darkMode ? 'rgba(17, 24, 39, 0.5)' : 'rgba(255, 255, 255, 0.9)',
                      backdropFilter: 'blur(20px)',
                      border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(147, 51, 234, 0.2)',
                      transition: 'all 0.3s ease',
                      boxShadow: '0 8px 25px rgba(0, 0, 0, 0.1)',
                      cursor: 'pointer',
                      overflow: 'hidden',
                      position: 'relative',
                      minHeight: '280px',
                      display: 'flex',
                      flexDirection: 'column'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.05)';
                      e.currentTarget.style.boxShadow = '0 20px 40px rgba(0, 0, 0, 0.15)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                      e.currentTarget.style.boxShadow = '0 8px 25px rgba(0, 0, 0, 0.1)';
                    }}
                  >
                    <div style={{ padding: '24px' }}>
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'flex-start', 
                        marginBottom: 16 
                      }}>
                        <div style={{
                          width: '56px',
                          height: '56px',
                          borderRadius: '16px',
                          background: `linear-gradient(135deg, ${template.color.replace('from-', '').replace(' to-', ', ')})`,
                          color: 'white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.2)'
                        }}>
                          <IconComponent size={28} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {template.cached && (
                            <Zap size={16} color="#8b5cf6" title="Cached results available" />
                          )}
                          <span style={{
                            padding: '4px 12px',
                            borderRadius: '20px',
                            fontSize: '12px',
                            background: darkMode ? 'rgba(55, 65, 81, 0.8)' : 'linear-gradient(135deg, rgba(147, 51, 234, 0.1), rgba(59, 130, 246, 0.1))',
                            color: darkMode ? '#9ca3af' : '#8b5cf6',
                            fontWeight: '500',
                            border: darkMode ? '1px solid rgba(75, 85, 99, 0.3)' : '1px solid rgba(147, 51, 234, 0.2)'
                          }}>
                            {template.category}
                          </span>
                        </div>
                      </div>
                      <h4 style={{ 
                        fontSize: '18px',
                        fontWeight: '600',
                        marginBottom: '8px',
                        color: darkMode ? 'white' : '#1f2937'
                      }}>{template.name}</h4>
                      <p style={{ 
                        fontSize: '14px',
                        color: darkMode ? '#9ca3af' : '#8b5cf6',
                        marginBottom: 16,
                        lineHeight: 1.5,
                        flex: 1,
                        minHeight: '42px'
                      }}>{template.description}</p>
                      
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        paddingTop: 16, 
                        borderTop: darkMode ? '1px solid #374151' : '1px solid rgba(147, 51, 234, 0.1)',
                        fontSize: '12px'
                      }}>
                        <span style={{ color: darkMode ? '#9ca3af' : '#8b5cf6', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Clock size={14} />
                          {template.avgTime}
                        </span>
                        <span style={{ color: darkMode ? '#9ca3af' : '#3b82f6', fontWeight: '500' }}>
                          Last: {template.lastRun}
                        </span>
                      </div>
                      
                      <div style={{ display: 'flex', gap: '8px', marginTop: 16 }}>
                        <button
                          onClick={() => handleGenerateReport(template)}
                          style={{
                            flex: 1,
                            padding: '8px',
                            borderRadius: '8px',
                            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                            color: 'white',
                            fontSize: '14px',
                            fontWeight: '500',
                            border: 'none',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
                          }}
                        >
                          Generate Now
                        </button>
                        <button
                          onClick={() => setScheduleModalOpen(true)}
                          style={{
                            padding: '8px 12px',
                            borderRadius: '8px',
                            background: darkMode ? 'rgba(55, 65, 81, 0.8)' : 'rgba(147, 51, 234, 0.1)',
                            color: darkMode ? '#d1d5db' : '#8b5cf6',
                            border: 'none',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
                          }}
                        >
                          <Calendar size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div>
            <div style={{ marginBottom: 32 }}>
              <h2 style={{ 
                margin: 0, 
                fontSize: '32px',
                fontWeight: 'bold',
                color: darkMode ? 'white' : '#1f2937',
                marginBottom: '8px'
              }}>
                Execution History
              </h2>
              <p style={{ 
                margin: 0,
                fontSize: '16px',
                color: darkMode ? '#9ca3af' : '#6b7280'
              }}>
                View and manage your report execution history
              </p>
            </div>

            {/* Active Executions */}
            {activeExecutions.length > 0 && (
              <div style={{ marginBottom: 32 }}>
                <h3 style={{ 
                  margin: '0 0 16px 0',
                  fontSize: '18px',
                  fontWeight: '600',
                  color: darkMode ? 'white' : '#1f2937'
                }}>Active Executions</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {activeExecutions.filter(execution => execution && execution.queryId).map((execution) => {
                    const definition = definitions.find(d => d.id === execution.queryId);
                    return (
                      <div
                        key={execution.id || `execution-${index}`}
                        style={{
                          padding: '16px',
                          borderRadius: '12px',
                          background: darkMode ? 'rgba(17, 24, 39, 0.5)' : 'rgba(255, 255, 255, 0.9)',
                          border: '2px solid rgba(59, 130, 246, 0.5)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          animation: 'pulse 2s ease-in-out infinite'
                        }}
                      >
                        <div>
                          <div style={{
                            fontSize: '16px',
                            fontWeight: '500',
                            color: darkMode ? 'white' : '#1f2937',
                            marginBottom: '4px'
                          }}>
                            {definition?.name || execution.queryId}
                          </div>
                          <div style={{
                            fontSize: '14px',
                            color: darkMode ? '#9ca3af' : '#6b7280'
                          }}>
                            Started {new Date(execution.startTime).toLocaleTimeString()}
                          </div>
                        </div>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px'
                        }}>
                          <div style={{
                            width: '24px',
                            height: '24px',
                            border: '3px solid rgba(59, 130, 246, 0.3)',
                            borderTopColor: '#3b82f6',
                            borderRadius: '50%',
                            animation: 'spin 1s linear infinite'
                          }} />
                          <span style={{ color: '#3b82f6', fontWeight: '500' }}>
                            Running...
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Execution History Table */}
            <div style={{
              borderRadius: '16px',
              background: darkMode ? 'rgba(17, 24, 39, 0.5)' : 'rgba(255, 255, 255, 0.9)',
              backdropFilter: 'blur(20px)',
              border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(229, 231, 235, 1)',
              overflow: 'hidden'
            }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%' }}>
                  <thead>
                    <tr style={{ background: darkMode ? 'rgba(55, 65, 81, 0.5)' : 'rgba(249, 250, 251, 1)' }}>
                      <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '12px', fontWeight: '500', color: darkMode ? '#9ca3af' : '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Query</th>
                      <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '12px', fontWeight: '500', color: darkMode ? '#9ca3af' : '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Executed</th>
                      <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '12px', fontWeight: '500', color: darkMode ? '#9ca3af' : '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</th>
                      <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '12px', fontWeight: '500', color: darkMode ? '#9ca3af' : '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Duration</th>
                      <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '12px', fontWeight: '500', color: darkMode ? '#9ca3af' : '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Rows</th>
                      <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '12px', fontWeight: '500', color: darkMode ? '#9ca3af' : '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Source</th>
                      <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '12px', fontWeight: '500', color: darkMode ? '#9ca3af' : '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {executionHistory.filter(execution => execution && execution.queryId).map((execution) => {
                      const definition = definitions.find(d => d.id === execution.queryId);
                      return (
                        <tr key={execution.id} style={{ 
                          borderTop: darkMode ? '1px solid rgba(55, 65, 81, 1)' : '1px solid rgba(229, 231, 235, 1)',
                          transition: 'background-color 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = darkMode ? 'rgba(55, 65, 81, 0.5)' : 'rgba(249, 250, 251, 1)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}>
                          <td style={{ padding: '16px 24px', whiteSpace: 'nowrap', color: darkMode ? '#f3f4f6' : '#1f2937', fontWeight: '500' }}>
                            {definition?.name || execution.queryId}
                          </td>
                          <td style={{ padding: '16px 24px', whiteSpace: 'nowrap', color: darkMode ? '#9ca3af' : '#6b7280' }}>
                            {new Date(execution.startTime).toLocaleString()}
                          </td>
                          <td style={{ padding: '16px 24px', whiteSpace: 'nowrap' }}>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '4px 8px',
                              borderRadius: '20px',
                              fontSize: '12px',
                              fontWeight: '500',
                              background: execution.status === 'completed' 
                                ? 'rgba(16, 185, 129, 0.1)' 
                                : execution.status === 'failed'
                                ? 'rgba(239, 68, 68, 0.1)'
                                : 'rgba(245, 158, 11, 0.1)',
                              color: execution.status === 'completed' 
                                ? '#10b981' 
                                : execution.status === 'failed'
                                ? '#ef4444'
                                : '#f59e0b'
                            }}>
                              {execution.status === 'completed' ? <CheckCircle size={14} /> : 
                               execution.status === 'failed' ? <AlertCircle size={14} /> :
                               <Clock size={14} />}
                              {execution.status}
                              {execution.result?.metadata.cachedResult && (
                                <Zap size={12} title="From cache" />
                              )}
                            </span>
                          </td>
                          <td style={{ padding: '16px 24px', whiteSpace: 'nowrap', color: darkMode ? '#9ca3af' : '#6b7280' }}>
                            {execution.endTime ? `${((execution.endTime - execution.startTime) / 1000).toFixed(1)}s` : '-'}
                          </td>
                          <td style={{ padding: '16px 24px', whiteSpace: 'nowrap', color: darkMode ? '#9ca3af' : '#6b7280' }}>
                            {execution.result?.metadata.rowCount || '-'}
                          </td>
                          <td style={{ padding: '16px 24px', whiteSpace: 'nowrap' }}>
                            <span style={{
                              padding: '4px 8px',
                              borderRadius: '4px',
                              fontSize: '12px',
                              fontWeight: '500',
                              background: execution.result?.metadata.dataSource === 'ad' ? 'rgba(96, 165, 250, 0.1)' :
                                execution.result?.metadata.dataSource === 'azure' ? 'rgba(167, 139, 250, 0.1)' :
                                execution.result?.metadata.dataSource === 'o365' ? 'rgba(248, 113, 113, 0.1)' :
                                'rgba(107, 114, 128, 0.1)',
                              color: execution.result?.metadata.dataSource === 'ad' ? '#60a5fa' :
                                execution.result?.metadata.dataSource === 'azure' ? '#a78bfa' :
                                execution.result?.metadata.dataSource === 'o365' ? '#f87171' :
                                '#6b7280'
                            }}>
                              {execution.result?.metadata.dataSource || 'Unknown'}
                            </span>
                          </td>
                          <td style={{ padding: '16px 24px', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <button 
                                style={{
                                  padding: '8px',
                                  borderRadius: '8px',
                                  background: darkMode ? 'rgba(55, 65, 81, 0.5)' : 'rgba(229, 231, 235, 1)',
                                  border: 'none',
                                  cursor: execution.status === 'completed' ? 'pointer' : 'not-allowed',
                                  opacity: execution.status === 'completed' ? 1 : 0.5,
                                  transition: 'all 0.2s ease',
                                  color: darkMode ? '#f3f4f6' : '#374151'
                                }}
                                disabled={execution.status !== 'completed'}
                                onClick={() => {
                                  // Navigate to results view
                                  if (execution.result) {
                                    setReportResults({
                                      queryId: execution.queryId,
                                      queryName: definitions.find(d => d.id === execution.queryId)?.name || execution.queryId,
                                      executedAt: execution.startTime,
                                      results: execution.result
                                    });
                                    setActiveTab('results');
                                  }
                                }}
                              >
                                <Eye size={16} />
                              </button>
                              <button style={{
                                padding: '8px',
                                borderRadius: '8px',
                                background: darkMode ? 'rgba(55, 65, 81, 0.5)' : 'rgba(229, 231, 235, 1)',
                                border: 'none',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                color: darkMode ? '#f3f4f6' : '#374151'
                              }}>
                                <MoreVertical size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Scheduled Tab - kept as placeholder */}
        {activeTab === 'scheduled' && (
          <div>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: 32 
            }}>
              <div>
                <h2 style={{ 
                  margin: 0, 
                  fontSize: '32px',
                  fontWeight: 'bold',
                  color: darkMode ? 'white' : '#1f2937',
                  marginBottom: '8px'
                }}>
                  Scheduled Reports
                </h2>
                <p style={{ 
                  margin: 0,
                  fontSize: '16px',
                  color: darkMode ? '#9ca3af' : '#6b7280'
                }}>
                  Manage automated report generation schedules
                </p>
              </div>
              <button
                onClick={() => setScheduleModalOpen(true)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                  color: 'white',
                  fontWeight: '500',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
                }}
              >
                <Calendar size={16} />
                New Schedule
              </button>
            </div>

            <div style={{
              padding: '80px',
              textAlign: 'center',
              color: darkMode ? '#9ca3af' : '#6b7280'
            }}>
              <Calendar size={64} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
              <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>Scheduled Reports Coming Soon</h3>
              <p>This feature will be available in a future update.</p>
            </div>
          </div>
        )}

        {/* Results Tab */}
        {activeTab === 'results' && reportResults && (
          <div>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: 32 
            }}>
              <div>
                <h2 style={{ 
                  margin: 0, 
                  fontSize: '32px',
                  fontWeight: 'bold',
                  color: darkMode ? 'white' : '#1f2937',
                  marginBottom: '8px'
                }}>
                  Report Results
                </h2>
                <p style={{ 
                  margin: 0,
                  fontSize: '16px',
                  color: darkMode ? '#9ca3af' : '#6b7280'
                }}>
                  {reportResults.queryName} - Executed {new Date(reportResults.executedAt).toLocaleString()}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => {
                    navigate('/reports');
                    setReportResults(null);
                    setActiveTab('dashboard');
                  }}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: darkMode ? '1px solid #374151' : '1px solid #d1d5db',
                    background: 'transparent',
                    color: darkMode ? '#d1d5db' : '#4b5563',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <X size={16} />
                  Close
                </button>
              </div>
            </div>

            {/* Results Summary */}
            <div style={{
              display: 'flex',
              gap: '16px',
              marginBottom: 24
            }}>
              <div style={{
                padding: '16px',
                borderRadius: '12px',
                background: darkMode ? 'rgba(17, 24, 39, 0.5)' : 'rgba(255, 255, 255, 0.9)',
                border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(229, 231, 235, 1)',
                flex: 1
              }}>
                <div style={{ fontSize: '14px', color: darkMode ? '#9ca3af' : '#6b7280', marginBottom: '4px' }}>Total Records</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: darkMode ? 'white' : '#1f2937' }}>
                  {reportResults.results?.metadata?.rowCount || reportResults.results?.data?.length || 0}
                </div>
              </div>
              <div style={{
                padding: '16px',
                borderRadius: '12px',
                background: darkMode ? 'rgba(17, 24, 39, 0.5)' : 'rgba(255, 255, 255, 0.9)',
                border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(229, 231, 235, 1)',
                flex: 1
              }}>
                <div style={{ fontSize: '14px', color: darkMode ? '#9ca3af' : '#6b7280', marginBottom: '4px' }}>Execution Time</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: darkMode ? 'white' : '#1f2937' }}>
                  {reportResults.results?.metadata?.executionTime ? 
                    `${(reportResults.results.metadata.executionTime / 1000).toFixed(1)}s` : 'N/A'}
                </div>
              </div>
              <div style={{
                padding: '16px',
                borderRadius: '12px',
                background: darkMode ? 'rgba(17, 24, 39, 0.5)' : 'rgba(255, 255, 255, 0.9)',
                border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(229, 231, 235, 1)',
                flex: 1
              }}>
                <div style={{ fontSize: '14px', color: darkMode ? '#9ca3af' : '#6b7280', marginBottom: '4px' }}>Data Source</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: darkMode ? 'white' : '#1f2937' }}>
                  {reportResults.results?.metadata?.dataSource?.toUpperCase() || 'Unknown'}
                </div>
              </div>
            </div>

            {/* Filter and Export Controls */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 16,
              gap: 16
            }}>
              <div style={{ display: 'flex', gap: '8px', flex: 1 }}>
                <input
                  type="text"
                  placeholder="Filter results..."
                  value={resultsFilter}
                  onChange={(e) => setResultsFilter(e.target.value)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: darkMode ? '1px solid #374151' : '1px solid #d1d5db',
                    background: darkMode ? '#1f2937' : 'white',
                    color: darkMode ? '#f3f4f6' : '#1f2937',
                    flex: 1,
                    maxWidth: '300px'
                  }}
                />
                {resultsFilter && (
                  <button
                    onClick={() => setResultsFilter('')}
                    style={{
                      padding: '8px',
                      borderRadius: '8px',
                      border: 'none',
                      background: darkMode ? 'rgba(55, 65, 81, 0.5)' : 'rgba(229, 231, 235, 1)',
                      color: darkMode ? '#d1d5db' : '#4b5563',
                      cursor: 'pointer'
                    }}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={async () => {
                    try {
                      const csvContent = convertToCSV(reportResults.results?.data || []);
                      downloadFile(csvContent, `${reportResults.queryName}_${new Date().toISOString()}.csv`, 'text/csv');
                      message.success('CSV downloaded successfully');
                    } catch (error) {
                      message.error('Failed to export CSV');
                    }
                  }}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: 'none',
                    background: darkMode ? 'rgba(55, 65, 81, 0.8)' : 'rgba(229, 231, 235, 1)',
                    color: darkMode ? '#d1d5db' : '#4b5563',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <FileText size={16} />
                  Export CSV
                </button>
                <button
                  onClick={async () => {
                    try {
                      // TODO: Implement Excel export
                      message.info('Excel export coming soon');
                    } catch (error) {
                      message.error('Failed to export Excel');
                    }
                  }}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                    color: 'white',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <FileSpreadsheet size={16} />
                  Export Excel
                </button>
              </div>
            </div>

            {/* Results Table */}
            {renderResultsTable()}
          </div>
        )}
      </div>
        </>
      )}

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