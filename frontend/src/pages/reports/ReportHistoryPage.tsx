/* eslint-disable no-constant-condition */
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps */
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { message, Button, Tag, Space, Dropdown } from 'antd';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import ReactDOM from 'react-dom';
import { 
  RefreshCw, 
  Download, 
  MoreVertical, 
  CheckCircle, 
  Clock, 
  Calendar,
  Eye,
  Trash2,
  FileText,
  FileSpreadsheet,
  AlertCircle,
  X,
  Checkbox,
  Zap,
  Activity,
  Copy,
  Share2,
  ArrowLeft
} from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { setBreadcrumbs, setCurrentPage as setCurrentPageAction } from '@/store/slices/uiSlice';
import { selectTheme } from '@/store/slices/uiSlice';
import { useQueryExecution, useQueryDefinitions } from '@/hooks/useQuery';
import { reportsService } from '@/services/reportsService';
import { QueryExecution, ReportResult } from '@/types';
import { formatDate, formatFileSize, formatDuration } from '@/utils/formatters';
import ReportResultsModal from '@/components/reports/ReportResultsModal';
import { EnhancedDataTable, defaultFormatCellValue } from '@/components/common';
import { ExecutionSummary } from '@/components/reports';
import { ReportDataTable } from '@/components/reports/ReportDataTable';
import { ReportViewer } from '@/components/reports/ReportViewer';
import '@/App.css';
import dayjs from 'dayjs';

const ReportHistoryPage: React.FC = () => {
  const dispatch = useAppDispatch();
  const darkMode = useAppSelector(selectTheme).darkMode;
  const navigate = useNavigate();
  const location = useLocation();
  const { id: reportId } = useParams<{ id: string }>();
  
  // Use new query hooks
  const queryExecution = useQueryExecution();
  const queryDefinitions = useQueryDefinitions();
  
  const executionHistory = queryExecution?.executionHistory || [];
  const activeExecutions = queryExecution?.activeExecutions || {};
  const definitions = queryDefinitions?.definitions || [];
  const [selectedFormat, setSelectedFormat] = useState<string>('all');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [actionMenuOpen, setActionMenuOpen] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [resultsModalOpen, setResultsModalOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<{
    id: string;
    name: string;
    results: any[];
    executedAt: string;
    rowCount: number;
  } | null>(null);
  const [currentPage, setCurrentPageState] = useState(1);
  const pageSize = 20;
  const [databaseHistory, setDatabaseHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [reportResults, setReportResults] = useState<any>(null);
  const [loadingResults, setLoadingResults] = useState(false);

  // Fetch specific report results if reportId is present
  useEffect(() => {
    const fetchReportResults = async () => {
      if (!reportId) return;
      
      setLoadingResults(true);
      try {
        // First get the report execution details
        const execResponse = await reportsService.getReportExecution(reportId);
        if (execResponse.success && execResponse.data) {
          // Then get the results
          const resultsResponse = await reportsService.getReportResults(reportId);
          if (resultsResponse.success && resultsResponse.data) {
            setReportResults({
              execution: execResponse.data,
              results: resultsResponse.data.results || [],
              resultCount: resultsResponse.data.resultCount || 0,
              message: resultsResponse.data.message,
              reportName: execResponse.data.report_name || execResponse.data.templateName || 'Report',
              executedAt: execResponse.data.executed_at || execResponse.data.executedAt,
              parameters: execResponse.data.parameters || {}
            });
          }
        } else {
          message.error('Report not found');
          navigate('/reports/history');
        }
      } catch (error) {
        message.error('Failed to load report results');
        console.error('Error loading report:', error);
      } finally {
        setLoadingResults(false);
      }
    };

    fetchReportResults();
  }, [reportId, navigate]);

  // Fetch history from database
  useEffect(() => {
    // Don't fetch history if we're viewing a specific report
    if (reportId) return;
    
    const fetchHistory = async () => {
      setLoading(true);
      try {
        const response = await reportsService.getReportHistory({
          page: currentPage,
          pageSize,
          status: selectedStatus !== 'all' ? selectedStatus as any : undefined,
          source: selectedFormat !== 'all' ? selectedFormat as any : undefined
        });
        
        if (response.success && ((response as any).data)) {
          setDatabaseHistory(((response as any).data) || []);
          setTotalCount(response.totalCount || 0);
        }
      } catch (error) {
        message.error('Failed to fetch report history');
        console.error('Error fetching history:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [currentPage, selectedStatus, selectedFormat, reportId]);

  // Refresh data when page becomes visible again (e.g., after executing a report)
  useEffect(() => {
    if (reportId) return; // Don't add listener when viewing specific report
    
    const handleFocus = () => {
      // Refresh data when window gains focus
      const fetchHistory = async () => {
        try {
          const response = await reportsService.getReportHistory({
            page: currentPage,
            pageSize,
            status: selectedStatus !== 'all' ? selectedStatus as any : undefined,
            source: selectedFormat !== 'all' ? selectedFormat as any : undefined
          });
          
          if (response.success && ((response as any).data)) {
            setDatabaseHistory(((response as any).data) || []);
            setTotalCount(response.totalCount || 0);
          }
        } catch (error) {
          console.error('Error refreshing history:', error);
        }
      };
      
      fetchHistory();
    };

    // Add event listener for when window gains focus
    window.addEventListener('focus', handleFocus);
    
    // Also listen for visibility change
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        handleFocus();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Cleanup
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentPage, selectedStatus, selectedFormat, pageSize, reportId]);

  // Refresh data when navigating to this page
  useEffect(() => {
    if (reportId || location.pathname !== '/reports/history') return;
    
    // Fetch fresh data when navigating to this page
    const fetchHistory = async () => {
      try {
        const response = await reportsService.getReportHistory({
          page: currentPage,
          pageSize,
          status: selectedStatus !== 'all' ? selectedStatus as any : undefined,
          source: selectedFormat !== 'all' ? selectedFormat as any : undefined
        });
        
        if (response.success && ((response as any).data)) {
          setDatabaseHistory(((response as any).data) || []);
          setTotalCount(response.totalCount || 0);
        }
      } catch (error) {
        console.error('Error refreshing history on navigation:', error);
      }
    };
    
    fetchHistory();
  }, [location.pathname]);

  // Combine database history with in-memory execution history
  const allExecutions = [...databaseHistory, ...executionHistory];
  
  // Filter executions based on criteria
  const filteredExecutions = allExecutions.filter(execution => {
    // Status filter
    if (selectedStatus !== 'all' && execution.status !== selectedStatus) return false;
    
    
    // Period filter
    if (selectedPeriod !== 'all') {
      const days = parseInt(selectedPeriod);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      // Handle both database (generated_at) and in-memory (startTime) date fields
      const executionDate = execution.generated_at ? new Date(execution.generated_at) : new Date(execution.startTime);
      if (executionDate < cutoffDate) return false;
    }
    
    return true;
  });
  
  // Pagination - use totalCount from database if available
  const totalRecords = totalCount > 0 ? totalCount : filteredExecutions.length;
  const totalPages = Math.ceil(totalRecords / pageSize);
  const paginatedExecutions = filteredExecutions.slice(
    0, // Already paginated from server
    pageSize
  );
  
  // Row selection handlers
  const isRowSelected = (id: string) => selectedRows.includes(id);
  const toggleRow = (id: string) => {
    setSelectedRows(prev => prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]);
  };
  const selectAllRows = () => {
    if (selectedRows.length === paginatedExecutions.length) {
      setSelectedRows([]);
    } else {
      setSelectedRows(paginatedExecutions.map(r => r.id));
    }
  };

  const handleBulkDownload = async () => {
    try {
      setLoading(true);
      let successCount = 0;
      let skippedCount = 0;

      for (const id of selectedRows) {
        const execution = allExecutions.find(e => e.id === id);
        if (execution && (execution.status === 'completed' || execution.status === 'success')) {
          await handleDownload(execution, 'csv');
          successCount++;
        } else {
          skippedCount++;
        }
      }
      
      if (successCount > 0) {
        message.success(`Downloaded ${successCount} reports successfully${skippedCount > 0 ? ` (${skippedCount} skipped)` : ''}`);
      }
      
      if (skippedCount === selectedRows.length) {
        message.warning('No completed reports to download');
      }
      
    } catch (error) {
      message.error('Failed to download some reports');
      console.error('Bulk download error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    // Show confirmation dialog
    const confirmed = window.confirm(`Are you sure you want to delete ${selectedRows.length} selected reports? This action cannot be undone.`);
    
    if (!confirmed) {
      return;
    }

    try {
      setLoading(true);
      
      // Call bulk delete API
      const result = await reportsService.bulkDeleteReports(selectedRows);
      
      // Show success message with count
      message.success(`Successfully deleted ${result.deleted || selectedRows.length} reports`);
      
      // Clear selections
      setSelectedRows([]);
      
      // Refresh the list after deletion
      await refreshHistory();
      
    } catch (error: any) {
      console.error('Bulk delete error:', error);
      message.error(error.message || 'Failed to delete selected reports');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (reportId) {
      dispatch(setCurrentPageAction({ page: 'report-results', title: 'Report Results' }));
      dispatch(setBreadcrumbs([
        { title: 'Dashboard', path: '/dashboard' },
        { title: 'Reports', path: '/reports' },
        { title: 'Execution History', path: '/reports/history' },
        { title: 'Results' }
      ]));
    } else {
      dispatch(setCurrentPageAction({ page: 'report-history', title: 'Query Execution History' }));
      dispatch(setBreadcrumbs([
        { title: 'Dashboard', path: '/dashboard' },
        { title: 'Reports', path: '/reports' },
        { title: 'Execution History' }
      ]));
    }
  }, [dispatch, reportId]);
  
  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPageState(1);
  }, [selectedFormat, selectedPeriod, selectedStatus]);

  const handleRefresh = async () => {
    setLoading(true);
    try {
      // Add a small delay to show loading state
      await new Promise(resolve => setTimeout(resolve, 300));
      
      const response = await reportsService.getReportHistory({
        page: currentPage,
        pageSize,
        status: selectedStatus !== 'all' ? selectedStatus as any : undefined,
        source: selectedFormat !== 'all' ? selectedFormat as any : undefined
      });
      
      if (response.success && ((response as any).data)) {
        setDatabaseHistory(((response as any).data) || []);
        setTotalCount(response.totalCount || 0);
        message.success('History refreshed');
      }
    } catch (error) {
      message.error('Failed to refresh history');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (execution: any, format: 'excel' | 'csv' = 'csv', visibleColumns?: string[]) => {
    try {
      if (format === 'excel' && execution.id) {
        // Use backend Excel export for better formatting with visible columns
        setLoading(true);
        await reportsService.exportHistoryResults(execution.id, 'excel', visibleColumns);
        message.success('Excel report exported successfully');
      } else {
        // Handle CSV export
        if (execution.result || execution.results) {
          // Handle both in-memory and database formats
          const data = execution.result?.data || execution.results || [];
          const csv = convertToCSV(data);
          downloadCSV(csv, `report_${execution.id}.csv`);
          message.success('Report downloaded successfully');
        } else if (execution.id) {
          // Fetch results from database if not in memory
          const response = await reportsService.getReportResults(execution.id);
          if (response.success && ((response as any).data)) {
            const csv = convertToCSV(((response as any).data).results || []);
            downloadCSV(csv, `report_${execution.id}.csv`);
            message.success('Report downloaded successfully');
          } else {
            message.error('No results found for this report');
          }
        }
      }
    } catch (error) {
      message.error(`Failed to ${format === 'excel' ? 'export' : 'download'} report`);
    } finally {
      setLoading(false);
    }
  };
  
  const convertToCSV = (data: any[]) => {
    if (!data || data.length === 0) return '';
    const headers = Object.keys(data[0]);
    const rows = data.map(row => headers.map(h => row[h] || '').join(','));
    return [headers.join(','), ...rows].join('\n');
  };
  
  const downloadCSV = (csv: string, filename: string) => {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async (executionId: string) => {
    try {
      // Show confirmation dialog
      const confirmed = window.confirm('Are you sure you want to delete this report? This action cannot be undone.');
      
      if (!confirmed) {
        return;
      }

      setLoading(true);
      
      // Delete the report execution
      await reportsService.deleteReportExecution(executionId);
      
      message.success('Report deleted successfully');
      setActionMenuOpen(null);
      
      // Refresh the history list
      await refreshHistory();
      
    } catch (error: any) {
      console.error('Error deleting report:', error);
      message.error(error.message || 'Failed to delete report');
    } finally {
      setLoading(false);
    }
  };

  const handleView = async (execution: any) => {
    if (execution.id) {
      // Navigate to the report results page
      navigate(`/reports/history/${execution.id}`);
      setActionMenuOpen(null);
    } else {
      message.error('No report ID available');
    }
  };

  const handleCopyId = async (executionId: string) => {
    try {
      await navigator.clipboard.writeText(executionId);
      message.success('Report ID copied to clipboard');
    } catch (error) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = executionId;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      message.success('Report ID copied to clipboard');
    }
  };

  const handleShare = async (executionId: string) => {
    const shareUrl = `${window.location.origin}/reports/history/${executionId}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      message.success('Report link copied to clipboard');
    } catch (error) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = shareUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      message.success('Report link copied to clipboard');
    }
  };

  const formatOptions = ['PDF', 'Excel', 'CSV', 'PowerBI', 'JSON'];

  const handlePageChange = (newPage: number) => {
    setCurrentPageState(newPage);
  };

  // Transform data for EnhancedDataTable
  const tableData = useMemo(() => {
    return filteredExecutions.map(execution => ({
      id: execution.id,
      reportName: execution.template_name || execution.custom_template_name || 
                  definitions.find(d => d.id === execution.queryId)?.name || 
                  execution.report_name || execution.queryId || 'Unknown Report',
      template: execution.template_category || execution.custom_template_source || 
                definitions.find(d => d.id === execution.queryId)?.category || 'Query',
      generatedAt: execution.generated_at || execution.startTime || new Date().toISOString(),
      status: execution.status === 'success' ? 'completed' : execution.status,
      format: (execution.result?.metadata.dataSource || execution.format || 'JSON').toUpperCase(),
      rowCount: execution.result?.metadata.rowCount || execution.result_count || 0,
      executionTime: execution.execution_time_ms || 
                     (execution.endTime ? execution.endTime - execution.startTime : null),
      hasCache: execution.result?.metadata.cachedResult || false,
      // Original execution object for actions
      _original: execution
    }));
  }, [filteredExecutions, definitions]);

  // Define columns for EnhancedDataTable
  const historyColumns = useMemo(() => [
    {
      dataIndex: 'reportName',
      title: 'Report Name',
      enableFilter: true,
      filterType: 'text' as const,
      render: (text: string, record: any) => (
        <div>
          <p style={{ margin: 0, fontWeight: '500' }}>{text}</p>
          <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: darkMode ? '#9ca3af' : '#6b7280' }}>
            ID: {(((record as any).id) || '').slice(0, 8).toUpperCase()}
          </p>
        </div>
      )
    },
    {
      dataIndex: 'template',
      title: 'Template',
      enableFilter: true,
      filterType: 'select' as const,
    },
    {
      dataIndex: 'generatedAt',
      title: 'Generated',
      enableFilter: true,
      filterType: 'dateRange' as const,
      render: (text: string) => (
        <div>
          <p style={{ margin: 0 }}>{formatDate(text)}</p>
          <p style={{ margin: '2px 0 0 0', fontSize: '12px' }}>
            {new Date(text).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      )
    },
    {
      dataIndex: 'status',
      title: 'Status',
      enableFilter: true,
      filterType: 'select' as const,
      filterOptions: [
        { label: 'Completed', value: 'completed' },
        { label: 'Failed', value: 'failed' },
        { label: 'Running', value: 'running' },
        { label: 'Pending', value: 'pending' }
      ],
      render: (status: string, record: any) => {
        const color = status === 'completed' ? '#4b5563' : 
                     status === 'failed' || status === 'error' ? '#1f2937' : 
                     '#6b7280';
        const icon = status === 'completed' ? <CheckCircle size={14} /> : 
                    status === 'failed' || status === 'error' ? <AlertCircle size={14} /> : 
                    status === 'running' ? <Activity size={14} /> : <Clock size={14} />;
        
        return (
          <Tag color={color} icon={icon}>
            {status}
            {((record as any).hasCache) && <Zap size={12} style={{ marginLeft: '4px' }} title="From cache" />}
          </Tag>
        );
      }
    },
    {
      dataIndex: 'format',
      title: 'Format',
      enableFilter: true,
      filterType: 'select' as const,
      render: (format: string) => {
        const color = format === 'AD' ? '#60a5fa' :
                     format === 'AZURE' ? '#a78bfa' :
                     format === 'O365' ? '#f87171' : '#6b7280';
        return <Tag color={color}>{format}</Tag>;
      }
    },
    {
      dataIndex: 'rowCount',
      title: 'Rows',
      enableFilter: true,
      filterType: 'number' as const,
      render: (count: number, record: any) => (
        <div>
          <p style={{ margin: 0 }}>{count} rows</p>
          {((record as any).executionTime) && (
            <p style={{ margin: '2px 0 0 0', fontSize: '12px' }}>
              ⏱ {formatDuration(((record as any).executionTime))}
            </p>
          )}
        </div>
      )
    },
    {
      dataIndex: 'actions',
      title: 'Actions',
      enableFilter: false,
      render: (_: any, record: any) => {
        const execution = ((record as any)._original);
        const canPerformActions = execution.status === 'completed' || execution.status === 'success';
        
        return (
          <Space>
            <Button
              size="small"
              icon={<Download size={14} />}
              onClick={() => handleDownload(execution, 'csv')}
              disabled={!canPerformActions}
              title="Download"
            />
            <Button
              size="small"
              icon={<Eye size={14} />}
              onClick={() => handleView(execution)}
              disabled={!canPerformActions}
              title="View Details"
            />
            <Dropdown
              menu={{
                items: [
                  {
                    key: 'view',
                    label: 'View',
                    icon: <Eye size={14} />,
                    onClick: () => handleView(execution),
                    disabled: !canPerformActions
                  },
                  {
                    key: 'download-csv',
                    label: 'Download CSV',
                    icon: <FileText size={14} />,
                    onClick: () => handleDownload(execution, 'csv'),
                    disabled: !canPerformActions
                  },
                  {
                    key: 'download-excel',
                    label: 'Export Excel',
                    icon: <FileSpreadsheet size={14} />,
                    onClick: () => handleDownload(execution, 'excel'),
                    disabled: !canPerformActions
                  },
                  {
                    key: 'copy',
                    label: 'Copy ID',
                    icon: <Copy size={14} />,
                    onClick: () => handleCopyId(execution.id)
                  },
                  {
                    key: 'share',
                    label: 'Share',
                    icon: <Share2 size={14} />,
                    onClick: () => handleShare(execution.id)
                  },
                  { type: 'divider' },
                  {
                    key: 'delete',
                    label: 'Delete',
                    icon: <Trash2 size={14} />,
                    onClick: () => handleDelete(execution.id),
                    danger: true
                  }
                ]
              }}
              trigger={['click']}
            >
              <Button size="small" icon={<MoreVertical size={14} />} />
            </Dropdown>
          </Space>
        );
      }
    }
  ], [darkMode, handleDownload, handleView, handleCopyId, handleShare, handleDelete]);

  return (
    <div style={{ 
      minHeight: 'calc(100vh - 64px)',
      background: darkMode ? '#1a1a1a' : '#f5f5f5',
      transition: 'all 0.5s ease',
      position: 'relative',
      overflow: 'auto',
      padding: '32px'
    }}>

      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* Show report results if reportId is present */}
        {reportId && reportResults ? (
          <div>
            {/* Results Page Header - Compact Design */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '24px',
              padding: '16px 20px',
              borderRadius: '12px',
              background: darkMode ? 'rgba(17, 24, 39, 0.5)' : 'rgba(255, 255, 255, 0.9)',
              backdropFilter: 'blur(20px)',
              border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(255, 255, 255, 0.2)',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '20px',
                flex: 1
              }}>
                <button
                  onClick={() => navigate('/reports/history')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    background: darkMode ? 'rgba(55, 65, 81, 0.5)' : 'rgba(229, 231, 235, 0.5)',
                    color: darkMode ? '#d1d5db' : '#6b7280',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: '500',
                    transition: 'all 0.2s ease',
                    flexShrink: 0
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = darkMode ? 'rgba(55, 65, 81, 0.8)' : 'rgba(229, 231, 235, 0.8)';
                    e.currentTarget.style.transform = 'translateX(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = darkMode ? 'rgba(55, 65, 81, 0.5)' : 'rgba(229, 231, 235, 0.5)';
                    e.currentTarget.style.transform = 'translateX(0)';
                  }}
                >
                  <ArrowLeft size={14} />
                  Back
                </button>
                
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px',
                  flex: 1,
                  minWidth: 0  // Allow text truncation
                }}>
                  <h2 style={{ 
                    margin: 0, 
                    fontSize: '20px',
                    fontWeight: '600',
                    color: darkMode ? 'white' : '#1f2937',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    {reportResults.execution.templateName || 'Report Results'}
                  </h2>
                  <span style={{
                    fontSize: '20px',
                    color: darkMode ? '#4b5563' : '#d1d5db',
                    margin: '0 8px'
                  }}>•</span>
                  <span style={{
                    fontSize: '13px',
                    color: darkMode ? '#9ca3af' : '#6b7280',
                    whiteSpace: 'nowrap',
                    flexShrink: 0
                  }}>
                    {new Date(reportResults.execution.generatedAt || reportResults.execution.executedAt).toLocaleString()}
                  </span>
                </div>
              </div>
              
              <div style={{
                display: 'flex',
                gap: '8px',
                flexShrink: 0
              }}>
                <button
                  onClick={() => handleShare(reportResults.execution?.id || reportId)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    background: 'transparent',
                    color: darkMode ? '#9ca3af' : '#6b7280',
                    border: darkMode ? '1px solid rgba(55, 65, 81, 0.5)' : '1px solid rgba(209, 213, 219, 0.5)',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: '500',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = darkMode ? 'rgba(99, 102, 241, 0.5)' : 'rgba(99, 102, 241, 0.3)';
                    e.currentTarget.style.color = darkMode ? '#c7d2fe' : '#4f46e5';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = darkMode ? 'rgba(55, 65, 81, 0.5)' : 'rgba(209, 213, 219, 0.5)';
                    e.currentTarget.style.color = darkMode ? '#9ca3af' : '#6b7280';
                  }}
                >
                  <Share2 size={14} />
                  Share
                </button>
              </div>
            </div>

            {/* Results Table */}
            {reportResults.message && reportResults.results.length === 0 ? (
              <>
                <ExecutionSummary
                  status={reportResults.execution.status || 'Completed'}
                  recordCount={reportResults.resultCount}
                  executionTime={reportResults.execution.executionTimeMs}
                  category={reportResults.execution.category || 'Query'}
                />
                <div style={{
                padding: '48px',
                borderRadius: '16px',
                background: darkMode ? 'rgba(17, 24, 39, 0.5)' : 'rgba(255, 255, 255, 0.9)',
                backdropFilter: 'blur(20px)',
                border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(229, 231, 235, 1)',
                textAlign: 'center'
              }}>
                <AlertCircle size={48} style={{ color: '#6b7280', marginBottom: '16px' }} />
                <p style={{
                  fontSize: '18px',
                  fontWeight: '600',
                  color: darkMode ? 'white' : '#1f2937',
                  marginBottom: '8px'
                }}>
                  {reportResults.message}
                </p>
                <p style={{
                  fontSize: '14px',
                  color: darkMode ? '#9ca3af' : '#6b7280'
                }}>
                  The report was executed successfully but the detailed results are no longer available.
                </p>
              </div>
              </>
            ) : reportResults.results.length > 0 ? (
              <ReportViewer
                mode="full"
                data={{
                  results: reportResults.results,
                  resultCount: reportResults.resultCount || reportResults.results.length,
                  executionTime: reportResults.execution?.executionTimeMs,
                  reportName: reportResults.reportName || 'Report',
                  executedAt: reportResults.executedAt,
                  status: reportResults.execution?.status || 'completed',
                  parameters: reportResults.parameters
                }}
                loading={loadingResults}
                onDownload={(format) => {
                  const executionId = reportResults.execution?.id || reportId;
                  if (executionId) {
                    if (format === 'csv') {
                      handleDownload({ id: executionId, results: reportResults.results }, 'csv');
                    } else if (format === 'excel') {
                      handleDownload({ id: executionId }, 'excel');  
                    }
                  } else {
                    message.error('Unable to export - no execution ID found');
                  }
                }}
                onShare={() => handleShare(reportResults.execution?.id || reportId)}
                onCopyId={() => handleCopyId(reportResults.execution?.id || reportId)}
              />
            ) : (
              <>
                <ExecutionSummary
                  status={reportResults.execution?.status || 'Completed'}
                  recordCount={0}
                  executionTime={reportResults.execution?.executionTimeMs}
                  category={reportResults.execution?.category || 'Query'}
                />
                <div style={{
                padding: '48px',
                borderRadius: '16px',
                background: darkMode ? 'rgba(17, 24, 39, 0.5)' : 'rgba(255, 255, 255, 0.9)',
                backdropFilter: 'blur(20px)',
                border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(229, 231, 235, 1)',
                textAlign: 'center'
              }}>
                <FileText size={48} style={{ color: '#4b5563', marginBottom: '16px' }} />
                <p style={{
                  fontSize: '18px',
                  fontWeight: '600',
                  color: darkMode ? 'white' : '#1f2937'
                }}>
                  No results to display
                </p>
              </div>
              </>
            )}
          </div>
        ) : reportId && loadingResults ? (
          // Loading state for results
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '400px'
          }}>
            <RefreshCw size={48} style={{ 
              animation: 'spin 1s linear infinite', 
              color: '#4b5563',
              marginBottom: '16px'
            }} />
            <p style={{
              fontSize: '18px',
              fontWeight: '500',
              color: darkMode ? 'white' : '#1f2937'
            }}>
              Loading report results...
            </p>
          </div>
        ) : (
          // Normal history view
          <>
            {/* Page Header */}
            <div style={{ marginBottom: '32px' }}>
              <h2 style={{ 
                margin: 0, 
                fontSize: '32px',
                fontWeight: 'bold',
                color: darkMode ? 'white' : '#1f2937',
                marginBottom: '8px'
              }}>
                Report History
              </h2>
              <p style={{ 
                margin: 0,
                fontSize: '16px',
                color: darkMode ? '#9ca3af' : '#6b7280'
              }}>
                View and download previously generated reports
              </p>
            </div>

        {/* Filters and Search */}
        <div style={{ 
          marginBottom: '24px',
          borderRadius: '16px',
          background: darkMode ? 'rgba(17, 24, 39, 0.5)' : 'rgba(255, 255, 255, 0.9)',
          backdropFilter: 'blur(20px)',
          border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(255, 255, 255, 0.2)',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          padding: '24px'
        }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
            
            <select 
              value={selectedFormat}
              onChange={(e) => setSelectedFormat(e.target.value)}
              style={{
                padding: '10px 16px',
                borderRadius: '12px',
                border: darkMode ? '1px solid rgba(75, 85, 99, 0.3)' : '1px solid rgba(0, 0, 0, 0.2)',
                background: darkMode ? 'rgba(31, 41, 55, 0.5)' : 'rgba(0, 0, 0, 0.02)',
                color: darkMode ? 'white' : '#1f2937',
                fontSize: '14px',
                outline: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              <option value="all">All Formats</option>
              {formatOptions.map(format => (
                <option key={format} value={format.toLowerCase()}>{format}</option>
              ))}
            </select>

            <select 
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              style={{
                padding: '10px 16px',
                borderRadius: '12px',
                border: darkMode ? '1px solid rgba(75, 85, 99, 0.3)' : '1px solid rgba(0, 0, 0, 0.2)',
                background: darkMode ? 'rgba(31, 41, 55, 0.5)' : 'rgba(0, 0, 0, 0.02)',
                color: darkMode ? 'white' : '#1f2937',
                fontSize: '14px',
                outline: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              <option value="all">All Status</option>
              <option value="completed">Completed</option>
              <option value="processing">Processing</option>
              <option value="failed">Failed</option>
            </select>

            <select 
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              style={{
                padding: '10px 16px',
                borderRadius: '12px',
                border: darkMode ? '1px solid rgba(75, 85, 99, 0.3)' : '1px solid rgba(0, 0, 0, 0.2)',
                background: darkMode ? 'rgba(31, 41, 55, 0.5)' : 'rgba(0, 0, 0, 0.02)',
                color: darkMode ? 'white' : '#1f2937',
                fontSize: '14px',
                outline: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              <option value="all">All Time</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 3 months</option>
            </select>
            
            <button 
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px',
                padding: '10px 20px',
                borderRadius: '12px',
                background: '#4a5568',
                color: 'white',
                fontSize: '14px',
                fontWeight: '500',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
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
              <Calendar size={16} />
              Date Range
            </button>
            
            <button 
              onClick={handleRefresh}
              disabled={loading}
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px',
                padding: '10px 20px',
                borderRadius: '12px',
                background: darkMode ? 'rgba(55, 65, 81, 0.8)' : '#e5e7eb',
                color: darkMode ? '#d1d5db' : '#374151',
                fontSize: '14px',
                fontWeight: '500',
                border: darkMode ? '1px solid rgba(75, 85, 99, 0.3)' : '1px solid rgba(75, 85, 99, 0.2)',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.transform = 'scale(1.05)';
                  e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.15)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <RefreshCw size={16} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          {/* Active Filters */}
          {(selectedPeriod !== 'all' || selectedStatus !== 'all') && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
              {selectedPeriod !== 'all' && (
                <span className="badge badge-info" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  Last {selectedPeriod} days
                  <X size={14} className="cursor-pointer" onClick={() => setSelectedPeriod('all')} />
                </span>
              )}
              {selectedStatus !== 'all' && (
                <span className="badge badge-info" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  Status: {selectedStatus}
                  <X size={14} className="cursor-pointer" onClick={() => setSelectedStatus('all')} />
                </span>
              )}
            </div>
          )}
        </div>


        {/* Reports Table */}
        <div style={{
          borderRadius: '16px',
          background: darkMode ? 'rgba(17, 24, 39, 0.5)' : 'rgba(255, 255, 255, 0.9)',
          backdropFilter: 'blur(20px)',
          border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(229, 231, 235, 1)',
          overflow: 'hidden'
        }}>
          {/* Bulk Actions Header - only show when there are items to select */}
          {filteredExecutions.length > 0 && (
            <div style={{
              padding: '16px 24px',
              borderBottom: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(229, 231, 235, 0.5)',
              background: darkMode ? 'rgba(31, 41, 55, 0.3)' : 'rgba(248, 250, 252, 0.8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <label style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px', 
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: darkMode ? '#d1d5db' : '#374151'
                }}>
                  <input 
                    type="checkbox" 
                    checked={selectedRows.length === paginatedExecutions.length && paginatedExecutions.length > 0} 
                    onChange={selectAllRows}
                    style={{
                      width: '16px',
                      height: '16px',
                      cursor: 'pointer'
                    }}
                  />
                  Select all ({filteredExecutions.length} reports)
                </label>
                
                {selectedRows.length > 0 && (
                  <span style={{
                    fontSize: '13px',
                    color: darkMode ? '#9ca3af' : '#6b7280',
                    background: darkMode ? 'rgba(99, 102, 241, 0.1)' : 'rgba(99, 102, 241, 0.1)',
                    padding: '4px 8px',
                    borderRadius: '12px',
                    fontWeight: '500'
                  }}>
                    {selectedRows.length} selected
                  </span>
                )}
              </div>
              
              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  onClick={handleBulkDownload} 
                  disabled={selectedRows.length === 0}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    background: selectedRows.length === 0 
                      ? (darkMode ? 'rgba(55, 65, 81, 0.3)' : 'rgba(229, 231, 235, 0.5)')
                      : (darkMode ? 'rgba(99, 102, 241, 0.8)' : '#4f46e5'),
                    color: selectedRows.length === 0 
                      ? (darkMode ? '#6b7280' : '#9ca3af')
                      : 'white',
                    border: 'none',
                    fontSize: '13px',
                    fontWeight: '500',
                    cursor: selectedRows.length === 0 ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s ease',
                    opacity: selectedRows.length === 0 ? 0.6 : 1
                  }}
                  onMouseEnter={(e) => {
                    if (selectedRows.length > 0) {
                      e.currentTarget.style.background = darkMode ? 'rgba(99, 102, 241, 1)' : '#4338ca';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedRows.length > 0) {
                      e.currentTarget.style.background = darkMode ? 'rgba(99, 102, 241, 0.8)' : '#4f46e5';
                    }
                  }}
                >
                  <Download size={14} />
                  Download ({selectedRows.length})
                </button>
                
                <button 
                  onClick={handleBulkDelete} 
                  disabled={selectedRows.length === 0}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    background: selectedRows.length === 0 
                      ? (darkMode ? 'rgba(55, 65, 81, 0.3)' : 'rgba(229, 231, 235, 0.5)')
                      : (darkMode ? 'rgba(220, 38, 38, 0.8)' : '#dc2626'),
                    color: selectedRows.length === 0 
                      ? (darkMode ? '#6b7280' : '#9ca3af')
                      : 'white',
                    border: 'none',
                    fontSize: '13px',
                    fontWeight: '500',
                    cursor: selectedRows.length === 0 ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s ease',
                    opacity: selectedRows.length === 0 ? 0.6 : 1
                  }}
                  onMouseEnter={(e) => {
                    if (selectedRows.length > 0) {
                      e.currentTarget.style.background = darkMode ? 'rgba(220, 38, 38, 1)' : '#b91c1c';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedRows.length > 0) {
                      e.currentTarget.style.background = darkMode ? 'rgba(220, 38, 38, 0.8)' : '#dc2626';
                    }
                  }}
                >
                  <Trash2 size={14} />
                  Delete ({selectedRows.length})
                </button>
              </div>
            </div>
          )}
          {false ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '80px 0',
              gap: '16px'
            }}>
              <div style={{ position: 'relative' }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  border: '4px solid rgba(75, 85, 99, 0.2)',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }} />
                <div style={{
                  width: '48px',
                  height: '48px',
                  border: '4px solid transparent',
                  borderTopColor: '#4b5563',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                  position: 'absolute',
                  top: 0,
                  left: 0
                }} />
              </div>
              <p style={{
                fontSize: '16px',
                fontWeight: '500',
                color: darkMode ? 'white' : '#1f2937',
                margin: 0
              }}>Loading History...</p>
              <p style={{
                fontSize: '14px',
                color: darkMode ? '#9ca3af' : '#4b5563',
                margin: 0
              }}>This may take a few moments</p>
            </div>
          ) : filteredExecutions.length === 0 ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '80px 0',
              gap: '16px'
            }}>
              <div style={{
                width: '80px',
                height: '80px',
                borderRadius: '20px',
                background: darkMode ? 'rgba(75, 85, 99, 0.1)' : '#f3f4f6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <FileText size={40} style={{ color: '#4b5563' }} />
              </div>
              <p style={{
                fontSize: '18px',
                fontWeight: '600',
                color: darkMode ? 'white' : '#1f2937',
                margin: 0
              }}>No reports found</p>
              <p style={{
                fontSize: '14px',
                color: darkMode ? '#9ca3af' : '#6b7280',
                margin: 0
              }}>Generate your first report to see it here</p>
            </div>
          ) : (
            <EnhancedDataTable
              data={tableData}
              columns={historyColumns}
              loading={loading}
              title=""
              description=""
              formatCellValue={(value, key, record) => {
                // Use custom formatters for specific fields
                if (key === 'generatedAt') {
                  return formatDate(value);
                }
                if (key === 'executionTime' && value) {
                  return formatDuration(value);
                }
                return defaultFormatCellValue(value, key, record);
              }}
              enableRowSelection={true}
              onRowSelect={(selectedRows) => {
                setSelectedRows(selectedRows.map(row => row.id));
              }}
              showExport={false}
              showColumnToggle={true}
              showQuickFilters={true}
              quickFilters={[
                {
                  label: 'Today',
                  filters: {
                    generatedAt: {
                      type: 'dateRange',
                      value: [dayjs().startOf('day'), dayjs().endOf('day')]
                    }
                  }
                },
                {
                  label: 'Completed Only',
                  filters: {
                    status: {
                      type: 'select',
                      value: 'completed'
                    }
                  }
                },
                {
                  label: 'Failed Only',
                  filters: {
                    status: {
                      type: 'select',
                      value: 'failed'
                    }
                  }
                }
              ]}
              pageSize={pageSize}
            />
          )}

          {/* Pagination */}
          {filteredExecutions.length > 0 && (
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '24px',
              borderTop: darkMode ? '1px solid rgba(55, 65, 81, 0.5)' : '1px solid rgba(229, 231, 235, 1)'
            }}>
              <div style={{
                fontSize: '14px',
                color: darkMode ? '#9ca3af' : '#6b7280'
              }}>
                Showing <span style={{ fontWeight: '500', color: darkMode ? '#f3f4f6' : '#1f2937' }}>{((currentPage - 1) * pageSize) + 1}</span> to{' '}
                <span style={{ fontWeight: '500', color: darkMode ? '#f3f4f6' : '#1f2937' }}>{Math.min(currentPage * pageSize, filteredExecutions.length)}</span> of{' '}
                <span style={{ fontWeight: '500', color: darkMode ? '#f3f4f6' : '#1f2937' }}>{filteredExecutions.length}</span> results
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage <= 1}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    background: darkMode ? 'rgba(55, 65, 81, 0.5)' : 'rgba(229, 231, 235, 1)',
                    color: darkMode ? '#f3f4f6' : '#374151',
                    border: 'none',
                    cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
                    opacity: currentPage <= 1 ? 0.5 : 1,
                    fontSize: '14px',
                    transition: 'all 0.2s ease'
                  }}
                >
                  Previous
                </button>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {[...Array(Math.min(5, totalPages))].map((_, index) => {
                    const pageNumber = index + 1;
                    const isCurrentPage = pageNumber === currentPage;
                    return (
                      <button
                        key={pageNumber}
                        onClick={() => handlePageChange(pageNumber)}
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '8px',
                          background: isCurrentPage 
                            ? '#374151'
                            : (darkMode ? 'rgba(55, 65, 81, 0.5)' : 'rgba(229, 231, 235, 1)'),
                          color: isCurrentPage ? 'white' : (darkMode ? '#f3f4f6' : '#374151'),
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '14px',
                          fontWeight: isCurrentPage ? '500' : '400',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        {pageNumber}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    background: darkMode ? 'rgba(55, 65, 81, 0.5)' : 'rgba(229, 231, 235, 1)',
                    color: darkMode ? '#f3f4f6' : '#374151',
                    border: 'none',
                    cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
                    opacity: currentPage >= totalPages ? 0.5 : 1,
                    fontSize: '14px',
                    transition: 'all 0.2s ease'
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Export Options */}
        <div style={{ 
          marginTop: '24px',
          borderRadius: '16px',
          background: darkMode ? 'rgba(17, 24, 39, 0.5)' : 'rgba(255, 255, 255, 0.9)',
          backdropFilter: 'blur(20px)',
          border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(255, 255, 255, 0.2)',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          padding: '24px'
        }}>
          <h3 style={{ 
            marginBottom: 16,
            margin: 0,
            fontSize: '20px',
            fontWeight: '600',
            color: darkMode ? 'white' : '#1f2937'
          }}>Export History</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
            <button style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              borderRadius: '12px',
              background: '#4a5568',
              color: 'white',
              fontSize: '14px',
              fontWeight: '500',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
            }}
            onClick={async () => {
              if (selectedRows.length > 0) {
                // Export selected rows
                setLoading(true);
                for (const id of selectedRows) {
                  const execution = databaseHistory.find(e => e.id === id);
                  if (execution) {
                    await handleDownload(execution, 'excel');
                  }
                }
                setLoading(false);
                message.success(`Exported ${selectedRows.length} reports to Excel`);
              } else {
                message.warning('Please select reports to export');
              }
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#2d3748';
              e.currentTarget.style.transform = 'scale(1.05)';
              e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#4a5568';
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
            }}>
              <FileSpreadsheet size={16} />
              Export to Excel
            </button>
            <button style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              borderRadius: '12px',
              background: darkMode ? 'rgba(55, 65, 81, 0.8)' : '#e5e7eb',
              color: darkMode ? '#d1d5db' : '#374151',
              fontSize: '14px',
              fontWeight: '500',
              border: darkMode ? '1px solid rgba(75, 85, 99, 0.3)' : '1px solid #d1d5db',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            onClick={async () => {
              if (selectedRows.length > 0) {
                // Export selected rows
                setLoading(true);
                for (const id of selectedRows) {
                  const execution = databaseHistory.find(e => e.id === id);
                  if (execution) {
                    await handleDownload(execution, 'csv');
                  }
                }
                setLoading(false);
                message.success(`Exported ${selectedRows.length} reports to CSV`);
              } else {
                message.warning('Please select reports to export');
              }
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = darkMode ? 'rgba(55, 65, 81, 1)' : '#d1d5db';
              e.currentTarget.style.transform = 'scale(1.05)';
              e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = darkMode ? 'rgba(55, 65, 81, 0.8)' : '#e5e7eb';
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = 'none';
            }}>
              <FileText size={16} />
              Export to CSV
            </button>
          </div>
        </div>

        {/* Click outside to close menu */}
        {actionMenuOpen && (
          <div 
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 999,
              background: 'transparent'
            }}
            onClick={() => {
              setActionMenuOpen(null);
              setMenuPosition(null);
            }}
          />
        )}
          </>
        )}

        {/* Report Results Modal */}
        {selectedReport && (
          <ReportResultsModal
            isOpen={resultsModalOpen}
            onClose={() => {
              setResultsModalOpen(false);
              setSelectedReport(null);
            }}
            reportId={selectedReport.id}
            reportName={selectedReport.name}
            results={selectedReport.results}
            executedAt={selectedReport.executedAt}
            rowCount={selectedReport.rowCount}
          />
        )}
      </div>
      
      <style>{`
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

export default ReportHistoryPage;