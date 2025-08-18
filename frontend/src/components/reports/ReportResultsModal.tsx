/* eslint-disable no-loss-of-precision */
/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useState } from 'react';
import dayjs from 'dayjs';
import { X, Copy, Filter, SortAsc, SortDesc, FileText } from 'lucide-react';
import { ExportToolbar } from './ExportToolbar';
import { useAppSelector } from '@/store';
import { selectTheme } from '@/store/slices/uiSlice';
import { message } from 'antd';
import { reportsService } from '@/services/reportsService';

interface ReportResultsModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportId: string;
  reportName: string;
  results: Record<string, unknown>[];
  executedAt: string;
  rowCount: number;
}

const ReportResultsModal: React.FC<ReportResultsModalProps> = ({
  isOpen,
  onClose,
  reportId,
  reportName,
  results,
  executedAt,
  rowCount
}) => {
  const darkMode = useAppSelector(selectTheme).darkMode;
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [filterValue, setFilterValue] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  if (!isOpen) return null;

  // Extract column headers from the first result object and filter out empty columns
  const allColumns = results && results.length > 0 ? Object.keys(results[0]) : [];
  // Helper to evaluate if a value contains meaningful data (recursive)
  const hasInformation = (value: unknown): boolean => {
    if (value === null || value === undefined) return false;
    if (typeof value === 'boolean') return true;
    if (typeof value === 'number') return true;
    if (typeof value === 'string') return value.trim() !== '';
    if (Array.isArray(value)) return value.some(item => hasInformation(item));
    if (typeof value === 'object') return Object.values(value as Record<string, unknown>).some(v => hasInformation(v));
    return false;
  };

  const columns = allColumns.filter(key => {
    return results.some(row => hasInformation(row[key]));
  });
  
  // Sort and filter data
  let processedData = [...(results || [])];
  
  // Apply filter
  if (filterValue) {
    processedData = processedData.filter(row => 
      Object.values(row).some(value => 
        String(value).toLowerCase().includes(filterValue.toLowerCase())
      )
    );
  }
  
  // Apply sort
  if (sortField) {
    processedData.sort((a, b) => {
      const aVal = a[sortField] as string | number;
      const bVal = b[sortField] as string | number;
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }
  
  // Pagination
  const totalPages = Math.ceil(processedData.length / pageSize);
  const paginatedData = processedData.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const _handleDownload = async (format: 'excel' | 'csv') => {
    try {
      await reportsService.downloadReportResult(reportId, format);
      message.success(`Report downloaded as ${format.toUpperCase()}`);
    } catch {
      message.error(`Failed to download report as ${format}`);
    }
  };

  const handleExportWithFormat = async (format: 'excel' | 'csv' | 'pdf' | 'json') => {
    return await reportsService.downloadReportResult(reportId, format);
  };

  const handleCopyToClipboard = () => {
    const text = processedData.map(row => 
      columns.map(col => row[col]).join('\t')
    ).join('\n');
    
    navigator.clipboard.writeText(text).then(() => {
      message.success('Results copied to clipboard');
    }).catch(() => {
      message.error('Failed to copy to clipboard');
    });
  };

  const formatCellValue = (value: unknown, columnKey: string): string => {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    
    // Handle arrays
    if (Array.isArray(value)) {
      if (value.length === 0) return '-';
      return value.join(', ');
    }
    
    // Handle other objects
    if (typeof value === 'object' && !(value instanceof Date)) {
      // Check if it's an empty object
      if (Object.keys(value).length === 0) return '-';
      return JSON.stringify(value);
    }
    
    // Handle Date objects or ISO strings (including milliseconds + Z)
    if ((typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) || value instanceof Date) {
      const dateObj = value instanceof Date ? value : new Date(value as string);
      if (!isNaN(dateObj.getTime())) {
        return dayjs(dateObj).format('YYYY-MM-DD, HH:mm:ss');
      }
    }
    
    // Transform Windows FileTime fields to readable dates
    if ((columnKey === 'lastLogonTimestamp' || columnKey === 'pwdLastSet' || columnKey === 'accountExpires' || 
         columnKey === 'badPasswordTime' || columnKey === 'lockoutTime' || columnKey === 'lastLogon') && 
        (typeof value === 'string' || typeof value === 'number')) {
      const timestamp = typeof value === 'string' ? parseInt(value) : value;
      if (timestamp === 0 || timestamp === 9223372036854775807) {
        return 'Never';
      }
      // Convert Windows FileTime to JavaScript timestamp
      const jsTimestamp = timestamp / 10000 - 11644473600000;
      const date = new Date(jsTimestamp);
      if (isNaN(date.getTime())) {
        return String(value);
      }
      return date.toLocaleString();
    }
    
    // Transform LDAP generalized time fields (YYYYMMDDHHMMSS.0Z format)
    if ((columnKey === 'whenCreated' || columnKey === 'whenChanged') && typeof value === 'string') {
      // Parse LDAP generalized time format: YYYYMMDDHHMMSS.0Z
      const match = value.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
      if (match) {
        const [, year, month, day, hour, minute, second] = match;
        const date = new Date(Date.UTC(
          parseInt(year),
          parseInt(month) - 1,
          parseInt(day),
          parseInt(hour),
          parseInt(minute),
          parseInt(second)
        ));
        return date.toLocaleString();
      }
      // Check if it's already in ISO format
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          return date.toLocaleString();
        }
      }
      return String(value);
    }
    
    // Transform UserAccountControl flags to status
    if (columnKey === 'userAccountControl' && typeof value === 'number') {
      const disabled = (value & 0x0002) !== 0;
      const lockedOut = (value & 0x0010) !== 0;
      const passwordNeverExpires = (value & 0x10000) !== 0;
      
      let status = disabled ? 'Disabled' : 'Active';
      if (lockedOut) status += ', Locked';
      if (passwordNeverExpires) status += ', Password Never Expires';
      
      return status;
    }
    
    return String(value);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}>
      <div className="glass-card" style={{ 
        width: '90%', 
        maxWidth: '1400px', 
        height: '85vh',
        display: 'flex',
        flexDirection: 'column',
        margin: '0',
        padding: '0'
      }}>
        {/* Modal Header */}
        <div style={{ 
          padding: '24px',
          borderBottom: '1px solid rgba(167, 139, 250, 0.1)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0
        }}>
          <div>
            <h2 className="gradient-text" style={{ fontSize: '24px', fontWeight: '700', margin: 0 }}>
              {reportName} - Results
            </h2>
            <p style={{ 
              color: darkMode ? '#9ca3af' : '#6b7280',
              margin: '4px 0 0 0',
              fontSize: '14px'
            }}>
              Executed at: {dayjs(executedAt).format('YYYY-MM-DD, HH:mm:ss')} | 
              Total Rows: {rowCount} | 
              Showing: {processedData.length} rows
            </p>
          </div>
          <button 
            onClick={onClose} 
            className="btn-action"
            style={{ margin: 0 }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Action Bar */}
        <div style={{ 
          padding: '16px 24px', 
          borderBottom: '1px solid rgba(167, 139, 250, 0.1)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <Filter size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#a78bfa' }} />
              <input
                type="text"
                placeholder="Filter results..."
                value={filterValue}
                onChange={(e) => setFilterValue(e.target.value)}
                className="input-primary"
                style={{ paddingLeft: '36px', width: '300px' }}
              />
            </div>
            <span className="text-sm text-gray-500">
              {filterValue && `Found ${processedData.length} matching rows`}
            </span>
          </div>
          
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button onClick={() => handleCopyToClipboard()} className="btn-gradient-secondary" title="Copy to clipboard">
              <Copy size={16} />
              Copy
            </button>
            <ExportToolbar
              onExport={handleExportWithFormat}
              loading={false}
            />
          </div>
        </div>

        {/* Results Table */}
        <div style={{ flex: 1, overflow: 'auto', padding: '0' }}>
          {results && results.length > 0 ? (
            <div className="overflow-x-auto" style={{ height: '100%' }}>
              <table className="table-modern" style={{ 
                width: '100%',
                borderCollapse: 'collapse',
                tableLayout: 'auto'
              }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                  <tr>
                    {columns.map((column) => (
                      <th 
                        key={column}
                        onClick={() => handleSort(column)}
                        style={{ 
                          cursor: 'pointer', 
                          userSelect: 'none',
                          background: darkMode ? 'rgba(30, 30, 45, 0.95)' : 'rgba(249, 250, 251, 0.95)',
                          padding: '12px 16px',
                          textAlign: 'left',
                          fontWeight: '600',
                          fontSize: '14px',
                          borderBottom: '2px solid rgba(167, 139, 250, 0.2)',
                          borderRight: '1px solid rgba(167, 139, 250, 0.1)',
                          color: darkMode ? '#e5e7eb' : '#374151'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {column}
                          {sortField === column && (
                            sortDirection === 'asc' ? <SortAsc size={14} /> : <SortDesc size={14} />
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedData.map((row, index) => (
                    <tr key={index} style={{
                      borderBottom: darkMode ? '1px solid rgba(255, 255, 255, 0.05)' : '1px solid rgba(0, 0, 0, 0.05)'
                    }}>
                      {columns.map((column) => (
                        <td key={column} style={{
                          maxWidth: '300px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          padding: '12px 16px',
                          borderRight: '1px solid rgba(167, 139, 250, 0.05)',
                          color: darkMode ? '#d1d5db' : '#374151'
                        }}>
                          {formatCellValue(row[column], column)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div>
                <FileText size={48} className="empty-state-icon" />
                <p className="empty-state-title">No results available</p>
                <p className="empty-state-subtitle">This report execution returned no data</p>
              </div>
            </div>
          )}
        </div>

        {/* Pagination */}
        {results && results.length > pageSize && (
          <div className="pagination-container" style={{ 
            padding: '16px 24px', 
            borderTop: '1px solid rgba(167, 139, 250, 0.1)',
            flexShrink: 0,
            marginTop: 0
          }}>
            <div className="pagination-info">
              Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, processedData.length)} of {processedData.length} results
            </div>
            <div className="pagination-controls">
              <button
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={currentPage <= 1}
                className="btn-pagination"
              >
                Previous
              </button>
              <span className="px-4">Page {currentPage} of {totalPages}</span>
              <button
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage >= totalPages}
                className="btn-pagination"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportResultsModal;