/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import React, { useMemo, useState } from 'react';
import { ReportResult, ExportFormat, QueryExecutionResult } from '../../types';
import { EnhancedDataTable, defaultFormatCellValue, hasInformation } from '@/components/common';
import { message } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useAppSelector } from '@/store';
import { selectTheme } from '@/store/slices/uiSlice';
import { reportsService } from '@/services/reportsService';
import { GraphResultViewer } from './GraphResultViewer';

interface ReportDataTableProps {
  data: ReportResult | null;
  loading?: boolean;
  title?: string;
  description?: string;
  onExport?: (format: ExportFormat, visibleColumns?: string[]) => void;
  onRefresh?: () => void;
  exportLoading?: boolean;
  showSearch?: boolean;
  pageSize?: number;
}

export const ReportDataTable: React.FC<ReportDataTableProps> = ({
  data,
  loading = false,
  title,
  description,
  onExport,
  onRefresh,
  exportLoading: _exportLoading = false,
  showSearch: _showSearch = true,
  pageSize = 50,
}) => {
  const theme = useAppSelector(selectTheme);
  const darkMode = theme.darkMode;
  const [_internalExportLoading, setInternalExportLoading] = useState(false);

  // Detect if this is a Graph API result
  const isGraphResult = useMemo(() => {
    if (!data) return false;
    
    // Check if the data source indicates Graph API
    if (data.metadata?.dataSource === 'azure' || 
        data.metadata?.templateName?.toLowerCase().includes('graph') ||
        data.id?.startsWith('graph_')) {
      return true;
    }
    
    // Check if data has Graph API specific structures
    if (data.data && data.data.length > 0) {
      const firstItem = data.data[0];
      // Look for typical Graph API fields
      const graphFields = ['@odata.type', 'id', 'userPrincipalName', 'displayName', 'mail'];
      return graphFields.some(field => field in firstItem);
    }
    
    return false;
  }, [data]);

  // Transform data to match EnhancedDataTable format
  const tableData = useMemo(() => {
    if (!data?.data || data.data.length === 0) return [];
    return data.data;
  }, [data]);

  // Generate columns configuration for EnhancedDataTable
  const columns = useMemo(() => {
    if (!tableData || tableData.length === 0) return [];
    
    const allKeys = Object.keys(tableData[0]);
    
    // Filter out columns that have no data
    const columnsWithData = allKeys.filter(key => {
      return tableData.some(row => {
        const value = row[key];
        return hasInformation(value);
      });
    });
    
    return columnsWithData.map(key => ({
      dataIndex: key,
      title: key,
      enableFilter: true,
      // Let EnhancedDataTable auto-detect filter types
    }));
  }, [tableData]);

  // Handle export with filtered data
  const handleExport = (exportData: any[], format: 'csv' | 'excel' | 'json', visibleColumns?: string[]) => {
    // Generate filename
    const timestamp = new Date().toISOString().split('T')[0];
    const reportName = data?.metadata?.templateName || 'report';
    const filename = `${reportName}_${timestamp}`;
    
    if (format === 'csv') {
      // Only export visible columns
      const visibleCols = columns.filter(col => 
        exportData.length > 0 && Object.prototype.hasOwnProperty.call(exportData[0], col.dataIndex)
      );
      const headers = visibleCols.map(col => col.title);
      const rows = exportData.map(row =>
        visibleCols.map(col => {
          const value = row[col.dataIndex];
          const formatted = defaultFormatCellValue(value, col.dataIndex);
          // Properly escape CSV values
          if (typeof formatted === 'string' && (formatted.includes(',') || formatted.includes('"') || formatted.includes('\n'))) {
            return `"${formatted.replace(/"/g, '""')}"`;
          }
          return formatted;
        })
      );
      const csv = [
        headers.join(','),
        ...rows.map(row => row.join(','))
      ].join('\n');
      
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      message.success(`Exported ${exportData.length} filtered records as CSV`);
      
    } else if (format === 'json') {
      const json = JSON.stringify(exportData, null, 2);
      const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.json`;
      a.click();
      URL.revokeObjectURL(url);
      message.success(`Exported ${exportData.length} filtered records as JSON`);
      
    } else if (format === 'excel') {
      // If parent provided an export handler, use it with visible columns
      if (onExport) {
        // Store visible columns in the component or pass them through a different mechanism
        // Since onExport only accepts format, we need to modify the parent handler
        onExport(format, visibleColumns);
      } else {
        // Fallback to client-side CSV with Excel MIME type
        setInternalExportLoading(true);
        const filteredResult: ReportResult = {
          ...data!,
          data: exportData,
          rowCount: exportData.length
        };
        
        reportsService.exportReportData(filteredResult, format)
          .then(blob => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${filename}.xlsx`;
            a.click();
            URL.revokeObjectURL(url);
            message.success(`Exported ${exportData.length} filtered records as Excel`);
          })
          .catch(error => {
            message.error('Failed to export as Excel');
            console.error(error);
          })
          .finally(() => {
            setInternalExportLoading(false);
          });
      }
      return;
    } else {
      message.info(`Export as ${format} not implemented yet`);
    }
  };

  // Create description with execution info
  const enhancedDescription = useMemo(() => {
    const parts = [];
    if (description) parts.push(description);
    if (data?.executedAt) {
      parts.push(`Executed: ${new Date(data.executedAt).toLocaleString()}`);
    }
    if (data?.rowCount !== undefined) {
      parts.push(`Total rows: ${data.rowCount}`);
    }
    return parts.join(' | ');
  }, [description, data]);

  // Custom toolbar actions for refresh button
  const _customToolbarActions = onRefresh ? (
    <button
      onClick={onRefresh}
      disabled={loading}
      className={`p-2 rounded-lg ${darkMode ? 'bg-gray-800 hover:bg-gray-700' : 'bg-purple-100 hover:bg-purple-200 text-purple-700'} transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      <ReloadOutlined className={loading ? 'animate-spin' : ''} />
    </button>
  ) : undefined;

  // If no data, show empty state
  if (!data || !data.data || data.data.length === 0) {
    return (
      <div className={`rounded-2xl ${darkMode ? 'bg-gray-900/50' : 'bg-white'} backdrop-blur-xl border ${darkMode ? 'border-gray-800' : 'border-purple-200'} p-6`}>
        {title && <h3 className={`text-xl font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>{title}</h3>}
        <div className="text-center py-12">
          <p className={`text-lg ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            {loading ? 'Loading...' : 'No data available'}
          </p>
        </div>
      </div>
    );
  }

  // Use GraphResultViewer for Graph API results
  if (isGraphResult && data) {
    const queryResult: QueryExecutionResult = {
      queryId: data.id || 'unknown',
      result: {
        success: true,
        data: data.data || [],
        metadata: {
          executionTime: data.metadata?.executionTime || 0,
          rowCount: data.rowCount || data.data?.length || 0,
          cached: false,
          dataSource: data.metadata?.dataSource || 'azure'
        }
      },
      executedAt: data.executedAt || new Date().toISOString(),
      executedBy: 'current_user'
    };

    return (
      <div className={`rounded-2xl ${darkMode ? 'bg-gray-900/50' : 'bg-white'} backdrop-blur-xl border ${darkMode ? 'border-gray-800' : 'border-purple-200'} overflow-hidden`}>
        <GraphResultViewer
          result={queryResult}
          queryName={title || data.metadata?.templateName || 'Graph API Query'}
          onExport={onExport}
          height={600}
        />
      </div>
    );
  }

  // Use standard EnhancedDataTable for non-Graph results
  return (
    <div className={`rounded-2xl ${darkMode ? 'bg-gray-900/50' : 'bg-white'} backdrop-blur-xl border ${darkMode ? 'border-gray-800' : 'border-purple-200'} overflow-hidden`}>
      <EnhancedDataTable
        data={tableData}
        columns={columns}
        loading={loading}
        title={title}
        description={enhancedDescription}
        formatCellValue={defaultFormatCellValue}
        quickFilters={[]}
        onExport={handleExport}
        enableRowSelection={false}
        showExport={!!onExport || true}
        showColumnToggle={true}
        rowKey={(record) => {
          // Create a stable hash from record properties
          const values = Object.values(record).map(v => String(v || '')).join('-');
          return btoa(values).replace(/[^a-zA-Z0-9]/g, '').substring(0, 16);
        }}
        showQuickFilters={false}
        pageSize={pageSize}
        // customToolbarActions={_customToolbarActions}
      />
    </div>
  );
};