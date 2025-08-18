/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { apiClient } from '@/utils/apiClient';

export interface LogFilter {
  type?: 'audit' | 'system' | 'all';
  level?: string;
  eventType?: string;
  eventAction?: string;
  userId?: number;
  module?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  signal?: AbortSignal;
}

export interface AuditLog {
  id: string;
  event_type: string;
  event_action: string;
  user_id?: number;
  username?: string;
  ip_address?: string;
  user_agent?: string;
  session_id?: string;
  resource_type?: string;
  resource_id?: string;
  details?: any;
  success: boolean;
  error_message?: string;
  created_at: string;
}

export interface SystemLog {
  id: string;
  level: string;
  message: string;
  timestamp: string;
  service?: string;
  module?: string;
  user_id?: number;
  request_id?: string;
  ip_address?: string;
  method?: string;
  url?: string;
  status_code?: number;
  duration_ms?: number;
  error_stack?: string;
  metadata?: any;
}

export interface LogsResponse {
  audit: AuditLog[];
  system: SystemLog[];
  totalAudit: number;
  totalSystem: number;
}

export interface LogStats {
  auditStats: Array<{
    event_type: string;
    event_action: string;
    count: number;
    failed_count: number;
  }>;
  systemStats: Array<{
    level: string;
    module?: string;
    count: number;
    avg_duration?: number;
    max_duration?: number;
  }>;
  errorTrends: Array<{
    hour: string;
    error_count: number;
  }>;
  period: string;
}

export interface RealtimeLog {
  log_type: 'audit' | 'system';
  id: string;
  timestamp: string;
  type: string;
  action: string;
  username?: string;
  success: boolean;
}

class LogsService {
  /**
   * Get logs with filtering and pagination
   */
  async getLogs(filters: LogFilter = {}) {
    const { signal, ...filterParams } = filters;
    
    // Convert filter params to Record<string, unknown> for apiClient
    const params: Record<string, unknown> = {};
    Object.entries(filterParams).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params[key] = value;
      }
    });

    const response = await apiClient.get('/logs', params, {
      signal,
      useCache: false // Disable caching for logs to get real-time data
    });
    return response;
  }

  /**
   * Get log statistics
   */
  async getLogStats(hours: number = 24) {
    const response = await apiClient.get<{
      success: boolean;
      data: LogStats;
    }>(`/logs/stats?hours=${hours}`);
    return response;
  }

  /**
   * Get real-time logs
   */
  async getRealtimeLogs() {
    const response = await apiClient.get<{
      success: boolean;
      data: RealtimeLog[];
    }>('/logs/realtime');
    return response;
  }

  /**
   * Get specific log details
   */
  async getLogDetails(id: string, type: 'audit' | 'system') {
    const response = await apiClient.get<{
      success: boolean;
      data: AuditLog | SystemLog;
    }>(`/logs/${id}?type=${type}`);
    return response;
  }

  /**
   * Export logs
   */
  async exportLogs(filters: LogFilter = {}, format: 'csv' | 'json' = 'csv') {
    const { signal, ...filterParams } = filters;
    const params = new URLSearchParams();
    
    Object.entries(filterParams).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, String(value));
      }
    });
    
    params.append('format', format);

    // For file downloads, we need to handle the response differently
    const response = await fetch(`${(apiClient as any).defaults.baseURL}/logs/export?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to export logs');
    }

    // Get filename from Content-Disposition header
    const contentDisposition = response.headers.get('Content-Disposition');
    const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
    const filename = filenameMatch ? filenameMatch[1] : `logs_export_${Date.now()}.${format}`;

    // Create blob and download
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    return { success: true };
  }

  /**
   * Parse log level for display
   */
  getLogLevelColor(level: string): string {
    switch (level.toLowerCase()) {
      case 'error':
        return '#ef4444';
      case 'warn':
      case 'warning':
        return '#f59e0b';
      case 'info':
        return '#3b82f6';
      case 'debug':
        return '#8b5cf6';
      case 'verbose':
        return '#6b7280';
      default:
        return '#6b7280';
    }
  }

  /**
   * Parse event type for display
   */
  getEventTypeColor(type: string): string {
    switch (type.toLowerCase()) {
      case 'auth':
        return '#10b981';
      case 'access':
        return '#3b82f6';
      case 'admin':
        return '#f59e0b';
      case 'security':
        return '#ef4444';
      case 'data':
        return '#8b5cf6';
      case 'system':
        return '#6b7280';
      default:
        return '#6b7280';
    }
  }

  /**
   * Format log message for display
   */
  formatLogMessage(log: AuditLog | SystemLog): string {
    if ('event_action' in log) {
      // Audit log
      return `${log.event_action.replace(/_/g, ' ')}${log.resource_type ? ` - ${log.resource_type}` : ''}`;
    } else {
      // System log
      return log.message;
    }
  }

  /**
   * Get log icon based on type/level
   */
  getLogIcon(log: AuditLog | SystemLog): string {
    if ('event_type' in log) {
      // Audit log icons
      switch (log.event_type) {
        case 'auth':
          return 'Key';
        case 'access':
          return 'Shield';
        case 'admin':
          return 'Settings';
        case 'security':
          return 'Lock';
        case 'data':
          return 'Database';
        case 'system':
          return 'Server';
        default:
          return 'FileText';
      }
    } else {
      // System log icons
      switch (log.level) {
        case 'error':
          return 'AlertCircle';
        case 'warn':
          return 'AlertTriangle';
        case 'info':
          return 'Info';
        case 'debug':
          return 'Bug';
        case 'verbose':
          return 'MessageSquare';
        default:
          return 'FileText';
      }
    }
  }
}

export const logsService = new LogsService();