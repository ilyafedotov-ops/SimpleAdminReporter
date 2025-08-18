/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { message, Tabs, Tag, Space, Button, Select, DatePicker, Badge, Alert, Spin } from 'antd';
import { 
  RefreshCw, 
  Download, 
  Search,
  X,
  FileText,
  Key,
  Shield,
  Settings as SettingsIcon,
  Lock,
  Database,
  Server,
  AlertCircle,
  AlertTriangle,
  Info,
  Bug,
  MessageSquare,
  Activity,
  TrendingUp,
  Clock,
  Filter,
  WifiOff
} from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { setBreadcrumbs, setCurrentPage, selectTheme } from '@/store/slices/uiSlice';
import { logsService, LogFilter, AuditLog, SystemLog } from '@/services/logsService';
import { EnhancedDataTable, defaultFormatCellValue } from '@/components/common';
import { formatDate } from '@/utils/formatters';
import dayjs from 'dayjs';
import { useLogsData, FilterState } from '@/hooks/useLogsData';
import { useUnifiedRealtimeLogs } from '@/hooks/useUnifiedRealtimeLogs';
import { LogsErrorBoundary } from '@/components/logs';
import '@/App.css';

const { RangePicker } = DatePicker;
const { Option } = Select;

// Icon mapping
const iconMap = {
  Key,
  Shield,
  Settings: SettingsIcon,
  Lock,
  Database,
  Server,
  AlertCircle,
  AlertTriangle,
  Info,
  Bug,
  MessageSquare,
  FileText
};

const LogsPage: React.FC = React.memo(() => {
  const dispatch = useAppDispatch();
  const darkMode = useAppSelector(selectTheme).darkMode;
  
  // Consolidated filter state
  const [filters, setFilters] = useState<FilterState>({
    activeTab: 'all',
    currentPage: 1,
    pageSize: 50,
    searchQuery: '',
    dateRange: null,
    eventType: undefined,
    level: undefined,
    sortBy: 'timestamp',
    sortOrder: 'desc'
  });
  
  // Use the custom hook for data fetching with retry
  const { data, loading, error, retry, isRetrying, retryCount } = useLogsData(filters);
  
  const [showRealtime, setShowRealtime] = useState(false);
  
  // Use SSE for real-time logs
  const { 
    logs: realtimeLogs, 
    connectionStatus, 
    reconnectCount: sseReconnectCount,
    clearLogs: clearRealtimeLogs,
    setFilters: setRealtimeFilters
  } = useUnifiedRealtimeLogs(showRealtime, {
    logTypes: filters.type === 'all' ? ['combined'] : [filters.type],
    filters: {
      eventType: filters.eventType,
      level: filters.level,
      search: filters.search,
      startDate: filters.startDate?.toISOString(),
      endDate: filters.endDate?.toISOString()
    }
  });

  // Update filter and trigger refetch
  const updateFilter = useCallback((key: keyof typeof filters, value: unknown) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  // Update multiple filters at once
  const updateFilters = useCallback((updates: Partial<typeof filters>) => {
    setFilters(prev => ({ ...prev, ...updates }));
  }, []);


  useEffect(() => {
    try {
      dispatch(setCurrentPage({ page: 'logs', title: 'System Logs' }));
      dispatch(setBreadcrumbs([
        { title: 'Dashboard', path: '/dashboard' },
        { title: 'Logs' }
      ]));
    } catch (error) {
      console.error('Error setting page info:', error);
    }
  }, [dispatch]);

  const handleRefresh = () => {
    retry();
    message.success('Refreshing logs...');
  };

  const handleExport = async (format: 'csv' | 'json') => {
    try {
      await logsService.exportLogs({
        type: filters.activeTab === 'all' ? 'all' : filters.activeTab,
        search: filters.searchQuery || undefined,
        startDate: filters.dateRange?.[0].toISOString(),
        endDate: filters.dateRange?.[1].toISOString(),
        page: filters.currentPage,
        pageSize: filters.pageSize,
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder,
        eventType: filters.eventType,
        level: filters.level
      }, format);
      message.success(`Logs exported as ${format.toUpperCase()}`);
    } catch (error) {
      message.error('Failed to export logs');
    }
  };

  // Audit log columns
  const auditColumns = useMemo(() => [
    {
      dataIndex: 'created_at',
      title: 'Timestamp',
      enableFilter: true,
      filterType: 'dateRange' as const,
      width: 180,
      sorter: true,
      defaultSortOrder: 'descend' as const,
      render: (text: string) => (
        <div>
          <div>{formatDate(text)}</div>
          <div style={{ fontSize: '12px', color: darkMode ? '#9ca3af' : '#6b7280' }}>
            {new Date(text).toLocaleTimeString()}
          </div>
        </div>
      )
    },
    {
      dataIndex: 'event_type',
      title: 'Type',
      enableFilter: true,
      filterType: 'select' as const,
      filterOptions: [
        { label: 'Auth', value: 'auth' },
        { label: 'Access', value: 'access' },
        { label: 'Admin', value: 'admin' },
        { label: 'Security', value: 'security' },
        { label: 'Data', value: 'data' },
        { label: 'System', value: 'system' }
      ],
      width: 120,
      render: (type: string) => {
        const color = logsService.getEventTypeColor(type);
        const IconComponent = iconMap[logsService.getLogIcon({ event_type: type } as AuditLog) as keyof typeof iconMap] || FileText;
        return (
          <Tag color={color} icon={<IconComponent size={14} />}>
            {type.toUpperCase()}
          </Tag>
        );
      }
    },
    {
      dataIndex: 'event_action',
      title: 'Action',
      enableFilter: true,
      filterType: 'text' as const,
      render: (action: string) => action.replace(/_/g, ' ').toUpperCase()
    },
    {
      dataIndex: 'username',
      title: 'User',
      enableFilter: true,
      filterType: 'text' as const,
      render: (username: string, record: AuditLog) => username || `User ${((record as any).user_id)}` || 'System'
    },
    {
      dataIndex: 'ip_address',
      title: 'IP Address',
      enableFilter: true,
      filterType: 'text' as const,
      width: 140
    },
    {
      dataIndex: 'resource_type',
      title: 'Resource',
      enableFilter: true,
      filterType: 'text' as const,
      render: (type: string, record: AuditLog) => {
        if (!type) return '-';
        return (
          <div>
            <div>{type}</div>
            {((record as any).resource_id) && (
              <div style={{ fontSize: '12px', color: darkMode ? '#9ca3af' : '#6b7280' }}>
                ID: {((record as any).resource_id)}
              </div>
            )}
          </div>
        );
      }
    },
    {
      dataIndex: 'success',
      title: 'Status',
      enableFilter: true,
      filterType: 'select' as const,
      filterOptions: [
        { label: 'Success', value: 'true' },
        { label: 'Failed', value: 'false' }
      ],
      width: 100,
      render: (success: boolean, record: AuditLog) => (
        <Tag color={success ? 'success' : 'error'}>
          {success ? 'SUCCESS' : 'FAILED'}
          {((record as any).error_message) && (
            <div style={{ fontSize: '11px', marginTop: '2px' }}>
              {((record as any).error_message)}
            </div>
          )}
        </Tag>
      )
    },
    {
      dataIndex: 'details',
      title: 'Details',
      enableFilter: false,
      render: (details: any) => {
        if (!details || Object.keys(details).length === 0) return '-';
        return (
          <div style={{ fontSize: '12px', color: darkMode ? '#9ca3af' : '#6b7280' }}>
            {Object.entries(details).slice(0, 2).map(([key, value]) => (
              <div key={key}>{key}: {String(value)}</div>
            ))}
            {Object.keys(details).length > 2 && <div>...</div>}
          </div>
        );
      }
    }
  ], [darkMode]);

  // System log columns
  const systemColumns = useMemo(() => [
    {
      dataIndex: 'timestamp',
      title: 'Timestamp',
      enableFilter: true,
      filterType: 'dateRange' as const,
      width: 180,
      sorter: true,
      defaultSortOrder: 'descend' as const,
      render: (text: string) => (
        <div>
          <div>{formatDate(text)}</div>
          <div style={{ fontSize: '12px', color: darkMode ? '#9ca3af' : '#6b7280' }}>
            {new Date(text).toLocaleTimeString()}
          </div>
        </div>
      )
    },
    {
      dataIndex: 'level',
      title: 'Level',
      enableFilter: true,
      filterType: 'select' as const,
      filterOptions: [
        { label: 'Error', value: 'error' },
        { label: 'Warn', value: 'warn' },
        { label: 'Info', value: 'info' },
        { label: 'Debug', value: 'debug' },
        { label: 'Verbose', value: 'verbose' }
      ],
      width: 100,
      render: (level: string) => {
        const color = logsService.getLogLevelColor(level);
        const IconComponent = iconMap[logsService.getLogIcon({ level } as SystemLog) as keyof typeof iconMap] || FileText;
        return (
          <Tag color={color} icon={<IconComponent size={14} />}>
            {level.toUpperCase()}
          </Tag>
        );
      }
    },
    {
      dataIndex: 'module',
      title: 'Module',
      enableFilter: true,
      filterType: 'text' as const,
      width: 150,
      render: (module: string) => module || 'System'
    },
    {
      dataIndex: 'message',
      title: 'Message',
      enableFilter: true,
      filterType: 'text' as const,
      render: (message: string, record: SystemLog) => (
        <div>
          <div>{message}</div>
          {((record as any).error_stack) && (
            <details style={{ fontSize: '11px', marginTop: '4px' }}>
              <summary style={{ cursor: 'pointer', color: darkMode ? '#9ca3af' : '#6b7280' }}>
                Stack trace
              </summary>
              <pre style={{ 
                whiteSpace: 'pre-wrap', 
                wordBreak: 'break-word',
                background: darkMode ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.05)',
                padding: '8px',
                borderRadius: '4px',
                marginTop: '4px'
              }}>
                {((record as any).error_stack)}
              </pre>
            </details>
          )}
        </div>
      )
    },
    {
      dataIndex: 'request_id',
      title: 'Request ID',
      enableFilter: true,
      filterType: 'text' as const,
      width: 120,
      render: (id: string) => id ? <code>{id.slice(0, 8)}</code> : '-'
    },
    {
      dataIndex: 'method',
      title: 'HTTP',
      enableFilter: true,
      filterType: 'select' as const,
      filterOptions: [
        { label: 'GET', value: 'GET' },
        { label: 'POST', value: 'POST' },
        { label: 'PUT', value: 'PUT' },
        { label: 'DELETE', value: 'DELETE' }
      ],
      width: 80,
      render: (method: string, record: SystemLog) => {
        if (!method) return '-';
        return (
          <div>
            <Tag color="blue">{method}</Tag>
            {((record as any).status_code) && (
              <Tag color={((record as any).status_code) >= 400 ? 'error' : 'success'}>
                {((record as any).status_code)}
              </Tag>
            )}
          </div>
        );
      }
    },
    {
      dataIndex: 'duration_ms',
      title: 'Duration',
      enableFilter: true,
      filterType: 'number' as const,
      width: 100,
      render: (duration: number) => duration ? `${duration}ms` : '-'
    },
    {
      dataIndex: 'metadata',
      title: 'Metadata',
      enableFilter: false,
      render: (metadata: Record<string, unknown>) => {
        if (!metadata || Object.keys(metadata).length === 0) return '-';
        return (
          <div style={{ fontSize: '12px', color: darkMode ? '#9ca3af' : '#6b7280' }}>
            {Object.entries(metadata).slice(0, 2).map(([key, value]) => (
              <div key={key}>{key}: {String(value)}</div>
            ))}
            {Object.keys(metadata).length > 2 && <div>...</div>}
          </div>
        );
      }
    }
  ], [darkMode]);

  // Extract data from hook result
  const auditLogs = data?.audit || [];
  const systemLogs = data?.system || [];
  const totalAudit = data?.totalAudit || 0;
  const totalSystem = data?.totalSystem || 0;

  // Combine logs for "all" tab
  const combinedData = useMemo(() => {
    if (filters.activeTab !== 'all') return [];
    
    const combined = [
      ...auditLogs.map(log => ({
        ...log,
        _type: 'audit' as const,
        _timestamp: log.created_at
      })),
      ...systemLogs.map(log => ({
        ...log,
        _type: 'system' as const,
        _timestamp: log.timestamp
      }))
    ];

    return combined.sort((a, b) => 
      new Date(b._timestamp).getTime() - new Date(a._timestamp).getTime()
    );
  }, [filters.activeTab, auditLogs, systemLogs]);

  // Combined columns for "all" tab
  const combinedColumns = useMemo(() => [
    {
      dataIndex: '_timestamp',
      title: 'Timestamp',
      enableFilter: true,
      filterType: 'dateRange' as const,
      width: 180,
      sorter: true,
      defaultSortOrder: 'descend' as const,
      render: (text: string) => (
        <div>
          <div>{formatDate(text)}</div>
          <div style={{ fontSize: '12px', color: darkMode ? '#9ca3af' : '#6b7280' }}>
            {new Date(text).toLocaleTimeString()}
          </div>
        </div>
      )
    },
    {
      dataIndex: '_type',
      title: 'Log Type',
      enableFilter: true,
      filterType: 'select' as const,
      filterOptions: [
        { label: 'Audit', value: 'audit' },
        { label: 'System', value: 'system' }
      ],
      width: 100,
      render: (type: string) => (
        <Tag color={type === 'audit' ? 'blue' : 'green'}>
          {type.toUpperCase()}
        </Tag>
      )
    },
    {
      dataIndex: 'level',
      title: 'Level/Type',
      enableFilter: true,
      filterType: 'text' as const,
      width: 120,
      render: (_: unknown, record: Record<string, unknown>) => {
        if (((record as any)._type) === 'audit') {
          const color = logsService.getEventTypeColor(((record as any).event_type));
          return <Tag color={color}>{((record as any).event_type).toUpperCase()}</Tag>;
        } else {
          const color = logsService.getLogLevelColor(((record as any).level));
          return <Tag color={color}>{((record as any).level).toUpperCase()}</Tag>;
        }
      }
    },
    {
      dataIndex: 'message',
      title: 'Message/Action',
      enableFilter: true,
      filterType: 'text' as const,
      render: (_: unknown, record: Record<string, unknown>) => {
        if (((record as any)._type) === 'audit') {
          return ((record as any).event_action).replace(/_/g, ' ').toUpperCase();
        } else {
          return ((record as any).message);
        }
      }
    },
    {
      dataIndex: 'user',
      title: 'User/Module',
      enableFilter: true,
      filterType: 'text' as const,
      width: 150,
      render: (_: unknown, record: Record<string, unknown>) => {
        if (((record as any)._type) === 'audit') {
          return ((record as any).username) || `User ${((record as any).user_id)}` || 'System';
        } else {
          return ((record as any).module) || 'System';
        }
      }
    },
    {
      dataIndex: 'status',
      title: 'Status',
      enableFilter: true,
      filterType: 'select' as const,
      width: 100,
      render: (_: unknown, record: Record<string, unknown>) => {
        if (((record as any)._type) === 'audit') {
          return (
            <Tag color={((record as any).success) ? 'success' : 'error'}>
              {((record as any).success) ? 'SUCCESS' : 'FAILED'}
            </Tag>
          );
        } else {
          if (((record as any).status_code)) {
            return (
              <Tag color={((record as any).status_code) >= 400 ? 'error' : 'success'}>
                HTTP {((record as any).status_code)}
              </Tag>
            );
          }
          return '-';
        }
      }
    }
  ], [darkMode]);

  return (
    <div style={{ 
      minHeight: 'calc(100vh - 64px)',
      background: darkMode ? '#1a1a1a' : '#f5f5f5',
      transition: 'all 0.5s ease',
      padding: '32px'
    }}>
      {/* Page Header */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <h2 style={{ 
            margin: 0, 
            fontSize: '32px',
            fontWeight: 'bold',
            color: darkMode ? 'white' : '#1f2937'
          }}>
            System Logs
          </h2>
          <Space>
            <Button 
              icon={<Activity size={16} />}
              onClick={() => setShowRealtime(!showRealtime)}
              type={showRealtime ? 'primary' : 'default'}
            >
              {showRealtime ? 'Hide' : 'Show'} Realtime
            </Button>
            <Button 
              icon={<RefreshCw size={16} />}
              onClick={handleRefresh}
              loading={loading}
            >
              Refresh
            </Button>
          </Space>
        </div>
        <p style={{ 
          margin: 0,
          fontSize: '16px',
          color: darkMode ? '#9ca3af' : '#6b7280'
        }}>
          View and analyze system logs, audit trails, and security events
        </p>
      </div>

      {/* Realtime logs banner */}
      {showRealtime && (
        <div style={{ 
          marginBottom: '24px',
          borderRadius: '16px',
          background: darkMode ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.05)',
          border: darkMode ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid rgba(59, 130, 246, 0.2)',
          padding: '16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Activity size={20} style={{ color: '#3b82f6' }} />
              <h3 style={{ margin: 0, color: darkMode ? 'white' : '#1f2937' }}>
                Realtime Activity
              </h3>
              {/* Connection status indicator */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: connectionStatus === 'connected' ? '#10b981' :
                             connectionStatus === 'connecting' ? '#f59e0b' :
                             connectionStatus === 'error' ? '#ef4444' : '#6b7280',
                  animation: connectionStatus === 'connecting' ? 'pulse 2s infinite' : 'none'
                }} />
                <span style={{ 
                  fontSize: '12px', 
                  color: darkMode ? '#9ca3af' : '#6b7280',
                  textTransform: 'capitalize'
                }}>
                  {connectionStatus} (WebSocket)
                  {sseReconnectCount > 0 && ` (Retry ${sseReconnectCount})`}
                </span>
              </div>
            </div>
            <Button
              size="small"
              onClick={clearRealtimeLogs}
              icon={<X size={14} />}
            >
              Clear
            </Button>
          </div>
          <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
            {realtimeLogs.length === 0 ? (
              <p style={{ margin: 0, color: darkMode ? '#9ca3af' : '#6b7280' }}>
                No recent activity
              </p>
            ) : (
              realtimeLogs.map((log, index) => (
                <div 
                  key={`${log.log_type}-${log.id}-${index}`}
                  style={{ 
                    padding: '8px',
                    borderBottom: index < realtimeLogs.length - 1 ? 
                      `1px solid ${darkMode ? 'rgba(55, 65, 81, 0.3)' : 'rgba(229, 231, 235, 0.5)'}` : 
                      'none'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Tag color={log.log_type === 'audit' ? 'blue' : 'green'} style={{ fontSize: '11px' }}>
                      {log.log_type.toUpperCase()}
                    </Tag>
                    <span style={{ fontSize: '12px', color: darkMode ? '#9ca3af' : '#6b7280' }}>
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span style={{ fontSize: '13px', fontWeight: '500' }}>
                      {log.action}
                    </span>
                    {log.username && (
                      <span style={{ fontSize: '12px', color: darkMode ? '#9ca3af' : '#6b7280' }}>
                        by {log.username}
                      </span>
                    )}
                    {log.success !== undefined && (
                      <Tag color={log.success ? 'success' : 'error'} style={{ fontSize: '11px' }}>
                        {log.success ? 'SUCCESS' : 'FAILED'}
                      </Tag>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Filters */}
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
          <div style={{ flex: 1, minWidth: '300px' }}>
            <div style={{ position: 'relative' }}>
              <Search 
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: darkMode ? '#4b5563' : '#4b5563'
                }} 
                size={18} 
              />
              <input
                type="text"
                placeholder="Search logs..."
                value={filters.searchQuery}
                onChange={(e) => updateFilter('searchQuery', e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleRefresh()}
                style={{ 
                  width: '100%', 
                  paddingLeft: '44px',
                  padding: '10px 16px 10px 44px',
                  borderRadius: '12px',
                  border: darkMode ? '1px solid rgba(75, 85, 99, 0.3)' : '1px solid rgba(75, 85, 99, 0.3)',
                  background: darkMode ? 'rgba(31, 41, 55, 0.5)' : 'rgba(75, 85, 99, 0.05)',
                  color: darkMode ? 'white' : '#1f2937',
                  fontSize: '14px',
                  outline: 'none',
                  transition: 'all 0.2s ease'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#4b5563';
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(107, 114, 128, 0.1)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = darkMode ? 'rgba(75, 85, 99, 0.3)' : 'rgba(75, 85, 99, 0.3)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
            </div>
          </div>
          
          <RangePicker
            value={filters.dateRange}
            onChange={(dates) => updateFilter('dateRange', dates)}
            style={{ borderRadius: '12px' }}
            format="YYYY-MM-DD"
          />

          {filters.activeTab === 'audit' && (
            <Select
              placeholder="Event Type"
              style={{ width: 150 }}
              allowClear
              value={filters.eventType}
              onChange={(value) => updateFilter('eventType', value)}
            >
              <Option value="auth">Auth</Option>
              <Option value="access">Access</Option>
              <Option value="admin">Admin</Option>
              <Option value="security">Security</Option>
              <Option value="data">Data</Option>
              <Option value="system">System</Option>
            </Select>
          )}

          {filters.activeTab === 'system' && (
            <Select
              placeholder="Log Level"
              style={{ width: 150 }}
              allowClear
              value={filters.level}
              onChange={(value) => updateFilter('level', value)}
            >
              <Option value="error">Error</Option>
              <Option value="warn">Warning</Option>
              <Option value="info">Info</Option>
              <Option value="debug">Debug</Option>
              <Option value="verbose">Verbose</Option>
            </Select>
          )}

          <Button
            icon={<Filter size={16} />}
            onClick={handleRefresh}
          >
            Apply Filters
          </Button>

          {(filters.searchQuery || filters.dateRange || filters.eventType || filters.level) && (
            <Button
              icon={<X size={16} />}
              onClick={() => {
                updateFilters({
                  searchQuery: '',
                  dateRange: null,
                  eventType: undefined,
                  level: undefined
                });
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Error State */}
      {error && !loading && (
        <div style={{ marginBottom: '24px' }}>
          <Alert
            message="Failed to Load Logs"
            description={
              <div>
                <p>{((error as any)?.message || String(error)) || 'An error occurred while fetching logs.'}</p>
                {retryCount >= 3 && (
                  <p style={{ marginTop: '8px', color: darkMode ? '#fbbf24' : '#f59e0b' }}>
                    Maximum retry attempts reached. Please check your connection and try again.
                  </p>
                )}
              </div>
            }
            type="error"
            showIcon
            icon={<WifiOff />}
            action={
              <Space direction="vertical" style={{ width: '100%' }}>
                <Button 
                  onClick={retry} 
                  loading={isRetrying}
                  icon={<RefreshCw size={16} />}
                  type="primary"
                  danger
                >
                  {isRetrying ? 'Retrying...' : 'Retry Now'}
                </Button>
                {retryCount > 0 && (
                  <div style={{ 
                    fontSize: '12px', 
                    color: darkMode ? '#9ca3af' : '#6b7280',
                    marginTop: '4px'
                  }}>
                    Retry attempt: {retryCount}/3
                  </div>
                )}
              </Space>
            }
            style={{
              borderRadius: '12px',
              border: `1px solid ${darkMode ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.2)'}`,
              background: darkMode ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.05)'
            }}
          />
        </div>
      )}

      {/* Loading State */}
      {loading && !data && (
        <div style={{
          marginBottom: '24px',
          borderRadius: '16px',
          background: darkMode ? 'rgba(17, 24, 39, 0.5)' : 'rgba(255, 255, 255, 0.9)',
          backdropFilter: 'blur(20px)',
          border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(229, 231, 235, 1)',
          padding: '48px',
          textAlign: 'center'
        }}>
          <Spin size="large" />
          <p style={{ 
            marginTop: '16px', 
            color: darkMode ? '#9ca3af' : '#6b7280',
            fontSize: '14px'
          }}>
            {isRetrying ? `Retrying... (Attempt ${retryCount + 1}/3)` : 'Loading logs...'}
          </p>
        </div>
      )}

      {/* Logs Table with Tabs */}
      {!error && (
        <div style={{
        borderRadius: '16px',
        background: darkMode ? 'rgba(17, 24, 39, 0.5)' : 'rgba(255, 255, 255, 0.9)',
        backdropFilter: 'blur(20px)',
        border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(229, 231, 235, 1)',
        overflow: 'hidden'
      }}>
        <Tabs
          activeKey={filters.activeTab}
          onChange={(key) => updateFilter('activeTab', key)}
          items={[
            {
              key: 'all',
              label: (
                <span>
                  All Logs
                  <Badge 
                    count={totalAudit + totalSystem} 
                    style={{ marginLeft: '8px' }}
                    overflowCount={999}
                  />
                </span>
              ),
              children: (
                <EnhancedDataTable
                  data={combinedData}
                  columns={combinedColumns}
                  loading={loading}
                  title=""
                  description=""
                  pageSize={filters.pageSize}
                  onPageSizeChange={(size) => {
                    updateFilters({
                      pageSize: size,
                      currentPage: 1
                    });
                  }}
                  currentPage={filters.currentPage}
                  onPageChange={(page) => updateFilter('currentPage', page)}
                  totalCount={totalAudit + totalSystem}
                  formatCellValue={defaultFormatCellValue}
                  showExport={true}
                  showColumnToggle={true}
                  enableRowSelection={false}
                  onExport={async (format) => {
                    await handleExport(format as 'csv' | 'json');
                  }}
                />
              )
            },
            {
              key: 'audit',
              label: (
                <span>
                  Audit Logs
                  <Badge 
                    count={totalAudit} 
                    style={{ marginLeft: '8px' }}
                    overflowCount={999}
                  />
                </span>
              ),
              children: (
                <EnhancedDataTable
                  data={auditLogs}
                  columns={auditColumns}
                  loading={loading}
                  title=""
                  description=""
                  pageSize={filters.pageSize}
                  onPageSizeChange={(size) => {
                    updateFilters({
                      pageSize: size,
                      currentPage: 1
                    });
                  }}
                  currentPage={filters.currentPage}
                  onPageChange={(page) => updateFilter('currentPage', page)}
                  totalCount={totalAudit}
                  formatCellValue={defaultFormatCellValue}
                  showExport={true}
                  showColumnToggle={true}
                  enableRowSelection={false}
                  onExport={async (format) => {
                    await handleExport(format as 'csv' | 'json');
                  }}
                />
              )
            },
            {
              key: 'system',
              label: (
                <span>
                  System Logs
                  <Badge 
                    count={totalSystem} 
                    style={{ marginLeft: '8px' }}
                    overflowCount={999}
                  />
                </span>
              ),
              children: (
                <EnhancedDataTable
                  data={systemLogs}
                  columns={systemColumns}
                  loading={loading}
                  title=""
                  description=""
                  pageSize={filters.pageSize}
                  onPageSizeChange={(size) => {
                    updateFilters({
                      pageSize: size,
                      currentPage: 1
                    });
                  }}
                  currentPage={filters.currentPage}
                  onPageChange={(page) => updateFilter('currentPage', page)}
                  totalCount={totalSystem}
                  formatCellValue={defaultFormatCellValue}
                  showExport={true}
                  showColumnToggle={true}
                  enableRowSelection={false}
                  onExport={async (format) => {
                    await handleExport(format as 'csv' | 'json');
                  }}
                />
              )
            }
          ]}
          style={{ padding: '0 24px' }}
        />
      </div>
      )}

      {/* Quick Stats */}
      <div style={{ 
        marginTop: '24px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '16px'
      }}>
        <div style={{
          borderRadius: '12px',
          background: darkMode ? 'rgba(17, 24, 39, 0.5)' : 'rgba(255, 255, 255, 0.9)',
          border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(229, 231, 235, 1)',
          padding: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <TrendingUp size={20} style={{ color: '#3b82f6' }} />
            <h4 style={{ margin: 0, color: darkMode ? 'white' : '#1f2937' }}>Total Logs</h4>
          </div>
          <p style={{ 
            margin: 0, 
            fontSize: '24px', 
            fontWeight: 'bold',
            color: darkMode ? 'white' : '#1f2937'
          }}>
            {(totalAudit + totalSystem).toLocaleString()}
          </p>
        </div>

        <div style={{
          borderRadius: '12px',
          background: darkMode ? 'rgba(17, 24, 39, 0.5)' : 'rgba(255, 255, 255, 0.9)',
          border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(229, 231, 235, 1)',
          padding: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <Shield size={20} style={{ color: '#10b981' }} />
            <h4 style={{ margin: 0, color: darkMode ? 'white' : '#1f2937' }}>Audit Events</h4>
          </div>
          <p style={{ 
            margin: 0, 
            fontSize: '24px', 
            fontWeight: 'bold',
            color: darkMode ? 'white' : '#1f2937'
          }}>
            {totalAudit.toLocaleString()}
          </p>
        </div>

        <div style={{
          borderRadius: '12px',
          background: darkMode ? 'rgba(17, 24, 39, 0.5)' : 'rgba(255, 255, 255, 0.9)',
          border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(229, 231, 235, 1)',
          padding: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <Server size={20} style={{ color: '#f59e0b' }} />
            <h4 style={{ margin: 0, color: darkMode ? 'white' : '#1f2937' }}>System Logs</h4>
          </div>
          <p style={{ 
            margin: 0, 
            fontSize: '24px', 
            fontWeight: 'bold',
            color: darkMode ? 'white' : '#1f2937'
          }}>
            {totalSystem.toLocaleString()}
          </p>
        </div>

        <div style={{
          borderRadius: '12px',
          background: darkMode ? 'rgba(17, 24, 39, 0.5)' : 'rgba(255, 255, 255, 0.9)',
          border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(229, 231, 235, 1)',
          padding: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <Clock size={20} style={{ color: '#8b5cf6' }} />
            <h4 style={{ margin: 0, color: darkMode ? 'white' : '#1f2937' }}>Time Range</h4>
          </div>
          <p style={{ 
            margin: 0, 
            fontSize: '14px',
            color: darkMode ? '#9ca3af' : '#6b7280'
          }}>
            {filters.dateRange 
              ? `${filters.dateRange[0].format('MMM D')} - ${filters.dateRange[1].format('MMM D, YYYY')}`
              : 'All time'
            }
          </p>
        </div>
      </div>
      
      {/* Add pulse animation for connection indicator */}
      <style>{`
        @keyframes pulse {
          0% {
            box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.7);
          }
          70% {
            box-shadow: 0 0 0 10px rgba(245, 158, 11, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(245, 158, 11, 0);
          }
        }
      `}</style>
    </div>
  );
});

LogsPage.displayName = 'LogsPage';

// Wrap with error boundary before exporting
const LogsPageWithErrorBoundary: React.FC = () => {
  const darkMode = useAppSelector(selectTheme).darkMode;
  
  return (
    <LogsErrorBoundary darkMode={darkMode}>
      <LogsPage />
    </LogsErrorBoundary>
  );
};

export default LogsPageWithErrorBoundary;