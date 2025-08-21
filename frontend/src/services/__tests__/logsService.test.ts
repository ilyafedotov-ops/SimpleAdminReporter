import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logsService, LogFilter, AuditLog, SystemLog, LogStats, RealtimeLog } from '../logsService';
import * as apiClientModule from '@/utils/apiClient';

// Mock the apiClient
vi.mock('@/utils/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    defaults: {
      baseURL: 'http://localhost:5000/api'
    }
  }
}));

describe('LogsService', () => {
  let mockApiClient: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockApiClient = vi.mocked(apiClientModule.apiClient.get);
    
    // Mock localStorage
    const localStorageMock = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: vi.fn()
    };
    Object.defineProperty(window, 'localStorage', { value: localStorageMock });
    
    // Mock DOM methods for file downloads
    Object.defineProperty(window, 'URL', {
      value: {
        createObjectURL: vi.fn(() => 'blob:mock-url'),
        revokeObjectURL: vi.fn()
      }
    });
    
    // Mock document methods
    const mockLink = {
      href: '',
      download: '',
      click: vi.fn(),
      style: { display: '' }
    };
    vi.spyOn(document, 'createElement').mockReturnValue(mockLink as unknown);
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockLink as unknown);
    vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockLink as unknown);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
  });

  describe('getLogs', () => {
    it('should fetch logs without filters', async () => {
      const mockResponse = {
        audit: [],
        system: [],
        totalAudit: 0,
        totalSystem: 0
      };
      mockApiClient.mockResolvedValue(mockResponse);

      const result = await logsService.getLogs();

      expect(mockApiClient).toHaveBeenCalledWith('/logs', {}, {
        signal: undefined,
        useCache: false
      });
      expect(result).toEqual(mockResponse);
    });

    it('should fetch logs with all filter parameters', async () => {
      const filters: LogFilter = {
        type: 'audit',
        level: 'error',
        eventType: 'auth',
        eventAction: 'login',
        userId: 123,
        module: 'authentication',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
        search: 'failed login',
        page: 2,
        pageSize: 50,
        sortBy: 'created_at',
        sortOrder: 'desc'
      };

      const mockResponse = {
        audit: [
          {
            id: '1',
            event_type: 'auth',
            event_action: 'login',
            success: false,
            created_at: '2025-01-15T10:30:00Z'
          } as AuditLog
        ],
        system: [],
        totalAudit: 1,
        totalSystem: 0
      };
      mockApiClient.mockResolvedValue(mockResponse);

      const result = await logsService.getLogs(filters);

      expect(mockApiClient).toHaveBeenCalledWith('/logs', {
        type: 'audit',
        level: 'error',
        eventType: 'auth',
        eventAction: 'login',
        userId: 123,
        module: 'authentication',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
        search: 'failed login',
        page: 2,
        pageSize: 50,
        sortBy: 'created_at',
        sortOrder: 'desc'
      }, {
        signal: undefined,
        useCache: false
      });
      expect(result).toEqual(mockResponse);
    });

    it('should handle abort signal', async () => {
      const controller = new AbortController();
      const filters: LogFilter = {
        signal: controller.signal,
        type: 'system'
      };

      const mockResponse = { audit: [], system: [], totalAudit: 0, totalSystem: 0 };
      mockApiClient.mockResolvedValue(mockResponse);

      await logsService.getLogs(filters);

      expect(mockApiClient).toHaveBeenCalledWith('/logs', {
        type: 'system'
      }, {
        signal: controller.signal,
        useCache: false
      });
    });

    it('should filter out null and undefined values', async () => {
      const filters: LogFilter = {
        type: 'audit',
        level: undefined,
        eventType: null as unknown,
        search: 'test',
        page: 0
      };

      const mockResponse = { audit: [], system: [], totalAudit: 0, totalSystem: 0 };
      mockApiClient.mockResolvedValue(mockResponse);

      await logsService.getLogs(filters);

      expect(mockApiClient).toHaveBeenCalledWith('/logs', {
        type: 'audit',
        search: 'test',
        page: 0
      }, {
        signal: undefined,
        useCache: false
      });
    });

    it('should handle API errors', async () => {
      const error = new Error('API Error');
      mockApiClient.mockRejectedValue(error);

      await expect(logsService.getLogs()).rejects.toThrow('API Error');
    });
  });

  describe('getLogStats', () => {
    it('should fetch log statistics with default hours', async () => {
      const mockStats: LogStats = {
        auditStats: [
          { event_type: 'auth', event_action: 'login', count: 10, failed_count: 2 }
        ],
        systemStats: [
          { level: 'error', module: 'api', count: 5, avg_duration: 150, max_duration: 500 }
        ],
        errorTrends: [
          { hour: '2025-01-15T10:00:00Z', error_count: 3 }
        ],
        period: '24h'
      };

      mockApiClient.mockResolvedValue({
        success: true,
        data: mockStats
      });

      const result = await logsService.getLogStats();

      expect(mockApiClient).toHaveBeenCalledWith('/logs/stats?hours=24');
      expect(result).toEqual({ success: true, data: mockStats });
    });

    it('should fetch log statistics with custom hours', async () => {
      const mockStats: LogStats = {
        auditStats: [],
        systemStats: [],
        errorTrends: [],
        period: '7d'
      };

      mockApiClient.mockResolvedValue({
        success: true,
        data: mockStats
      });

      const result = await logsService.getLogStats(168); // 7 days

      expect(mockApiClient).toHaveBeenCalledWith('/logs/stats?hours=168');
      expect(result).toEqual({ success: true, data: mockStats });
    });

    it('should handle API errors for stats', async () => {
      const error = new Error('Stats API Error');
      mockApiClient.mockRejectedValue(error);

      await expect(logsService.getLogStats()).rejects.toThrow('Stats API Error');
    });
  });

  describe('getRealtimeLogs', () => {
    it('should fetch realtime logs', async () => {
      const mockRealtimeLogs: RealtimeLog[] = [
        {
          log_type: 'audit',
          id: '1',
          timestamp: '2025-01-15T10:30:00Z',
          type: 'auth',
          action: 'login',
          username: 'testuser',
          success: true
        },
        {
          log_type: 'system',
          id: '2',
          timestamp: '2025-01-15T10:31:00Z',
          type: 'error',
          action: 'database_connection_failed',
          success: false
        }
      ];

      mockApiClient.mockResolvedValue({
        success: true,
        data: mockRealtimeLogs
      });

      const result = await logsService.getRealtimeLogs();

      expect(mockApiClient).toHaveBeenCalledWith('/logs/realtime');
      expect(result).toEqual({ success: true, data: mockRealtimeLogs });
    });

    it('should handle empty realtime logs', async () => {
      mockApiClient.mockResolvedValue({
        success: true,
        data: []
      });

      const result = await logsService.getRealtimeLogs();

      expect(result).toEqual({ success: true, data: [] });
    });
  });

  describe('getLogDetails', () => {
    it('should fetch audit log details', async () => {
      const mockAuditLog: AuditLog = {
        id: '1',
        event_type: 'auth',
        event_action: 'login',
        user_id: 123,
        username: 'testuser',
        ip_address: '192.168.1.1',
        success: true,
        created_at: '2025-01-15T10:30:00Z'
      };

      mockApiClient.mockResolvedValue({
        success: true,
        data: mockAuditLog
      });

      const result = await logsService.getLogDetails('1', 'audit');

      expect(mockApiClient).toHaveBeenCalledWith('/logs/1?type=audit');
      expect(result).toEqual({ success: true, data: mockAuditLog });
    });

    it('should fetch system log details', async () => {
      const mockSystemLog: SystemLog = {
        id: '2',
        level: 'error',
        message: 'Database connection failed',
        timestamp: '2025-01-15T10:30:00Z',
        service: 'api',
        module: 'database',
        status_code: 500
      };

      mockApiClient.mockResolvedValue({
        success: true,
        data: mockSystemLog
      });

      const result = await logsService.getLogDetails('2', 'system');

      expect(mockApiClient).toHaveBeenCalledWith('/logs/2?type=system');
      expect(result).toEqual({ success: true, data: mockSystemLog });
    });

    it('should handle log details API errors', async () => {
      const error = new Error('Log not found');
      mockApiClient.mockRejectedValue(error);

      await expect(logsService.getLogDetails('999', 'audit')).rejects.toThrow('Log not found');
    });
  });

  describe('exportLogs', () => {
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockFetch = vi.fn();
      global.fetch = mockFetch;
      
      // Mock localStorage.getItem for auth token
      vi.mocked(window.localStorage.getItem).mockReturnValue('mock-token');
    });

    it('should export logs in CSV format with default parameters', async () => {
      const mockBlob = new Blob(['csv,data'], { type: 'text/csv' });
      const mockResponse = {
        ok: true,
        headers: {
          get: vi.fn().mockReturnValue('attachment; filename="logs_export.csv"')
        },
        blob: vi.fn().mockResolvedValue(mockBlob)
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await logsService.exportLogs();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:5000/api/logs/export?format=csv',
        {
          method: 'GET',
          headers: {
            'Authorization': 'Bearer mock-token'
          }
        }
      );
      expect(result).toEqual({ success: true });
    });

    it('should export logs with filters and JSON format', async () => {
      const filters: LogFilter = {
        type: 'audit',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
        eventType: 'auth'
      };

      const mockBlob = new Blob(['{"logs": []}'], { type: 'application/json' });
      const mockResponse = {
        ok: true,
        headers: {
          get: vi.fn().mockReturnValue('attachment; filename="audit_logs.json"')
        },
        blob: vi.fn().mockResolvedValue(mockBlob)
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await logsService.exportLogs(filters, 'json');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:5000/api/logs/export?type=audit&startDate=2025-01-01&endDate=2025-01-31&eventType=auth&format=json',
        {
          method: 'GET',
          headers: {
            'Authorization': 'Bearer mock-token'
          }
        }
      );
      expect(result).toEqual({ success: true });
    });

    it('should handle export API errors', async () => {
      const mockResponse = {
        ok: false,
        status: 400
      };
      mockFetch.mockResolvedValue(mockResponse);

      await expect(logsService.exportLogs()).rejects.toThrow('Failed to export logs');
    });

    it('should use default filename when Content-Disposition header is missing', async () => {
      const mockBlob = new Blob(['data'], { type: 'text/csv' });
      const mockResponse = {
        ok: true,
        headers: {
          get: vi.fn().mockReturnValue(null)
        },
        blob: vi.fn().mockResolvedValue(mockBlob)
      };
      mockFetch.mockResolvedValue(mockResponse);

      // Mock Date.now for consistent filename
      const mockNow = 1704067200000; // 2024-01-01T00:00:00.000Z
      vi.spyOn(Date, 'now').mockReturnValue(mockNow);

      await logsService.exportLogs({}, 'json');

      const mockLink = document.createElement('a');
      expect(mockLink.download).toBe(`logs_export_${mockNow}.json`);
    });
  });

  describe('utility methods', () => {
    describe('getLogLevelColor', () => {
      it('should return correct colors for different log levels', () => {
        expect(logsService.getLogLevelColor('error')).toBe('#ef4444');
        expect(logsService.getLogLevelColor('ERROR')).toBe('#ef4444');
        expect(logsService.getLogLevelColor('warn')).toBe('#f59e0b');
        expect(logsService.getLogLevelColor('warning')).toBe('#f59e0b');
        expect(logsService.getLogLevelColor('info')).toBe('#3b82f6');
        expect(logsService.getLogLevelColor('debug')).toBe('#8b5cf6');
        expect(logsService.getLogLevelColor('verbose')).toBe('#6b7280');
        expect(logsService.getLogLevelColor('unknown')).toBe('#6b7280');
      });
    });

    describe('getEventTypeColor', () => {
      it('should return correct colors for different event types', () => {
        expect(logsService.getEventTypeColor('auth')).toBe('#10b981');
        expect(logsService.getEventTypeColor('AUTH')).toBe('#10b981');
        expect(logsService.getEventTypeColor('access')).toBe('#3b82f6');
        expect(logsService.getEventTypeColor('admin')).toBe('#f59e0b');
        expect(logsService.getEventTypeColor('security')).toBe('#ef4444');
        expect(logsService.getEventTypeColor('data')).toBe('#8b5cf6');
        expect(logsService.getEventTypeColor('system')).toBe('#6b7280');
        expect(logsService.getEventTypeColor('unknown')).toBe('#6b7280');
      });
    });

    describe('formatLogMessage', () => {
      it('should format audit log messages', () => {
        const auditLog: AuditLog = {
          id: '1',
          event_type: 'auth',
          event_action: 'user_login',
          resource_type: 'user_account',
          success: true,
          created_at: '2025-01-15T10:30:00Z'
        };

        const message = logsService.formatLogMessage(auditLog);
        expect(message).toBe('user login - user_account');
      });

      it('should format audit log messages without resource type', () => {
        const auditLog: AuditLog = {
          id: '1',
          event_type: 'auth',
          event_action: 'user_logout',
          success: true,
          created_at: '2025-01-15T10:30:00Z'
        };

        const message = logsService.formatLogMessage(auditLog);
        expect(message).toBe('user logout');
      });

      it('should format system log messages', () => {
        const systemLog: SystemLog = {
          id: '2',
          level: 'error',
          message: 'Database connection failed',
          timestamp: '2025-01-15T10:30:00Z'
        };

        const message = logsService.formatLogMessage(systemLog);
        expect(message).toBe('Database connection failed');
      });
    });

    describe('getLogIcon', () => {
      it('should return correct icons for audit log event types', () => {
        const auditLog: AuditLog = {
          id: '1',
          event_type: 'auth',
          event_action: 'login',
          success: true,
          created_at: '2025-01-15T10:30:00Z'
        };

        expect(logsService.getLogIcon({ ...auditLog, event_type: 'auth' })).toBe('Key');
        expect(logsService.getLogIcon({ ...auditLog, event_type: 'access' })).toBe('Shield');
        expect(logsService.getLogIcon({ ...auditLog, event_type: 'admin' })).toBe('Settings');
        expect(logsService.getLogIcon({ ...auditLog, event_type: 'security' })).toBe('Lock');
        expect(logsService.getLogIcon({ ...auditLog, event_type: 'data' })).toBe('Database');
        expect(logsService.getLogIcon({ ...auditLog, event_type: 'system' })).toBe('Server');
        expect(logsService.getLogIcon({ ...auditLog, event_type: 'unknown' })).toBe('FileText');
      });

      it('should return correct icons for system log levels', () => {
        const systemLog: SystemLog = {
          id: '2',
          level: 'error',
          message: 'Test message',
          timestamp: '2025-01-15T10:30:00Z'
        };

        expect(logsService.getLogIcon({ ...systemLog, level: 'error' })).toBe('AlertCircle');
        expect(logsService.getLogIcon({ ...systemLog, level: 'warn' })).toBe('AlertTriangle');
        expect(logsService.getLogIcon({ ...systemLog, level: 'info' })).toBe('Info');
        expect(logsService.getLogIcon({ ...systemLog, level: 'debug' })).toBe('Bug');
        expect(logsService.getLogIcon({ ...systemLog, level: 'verbose' })).toBe('MessageSquare');
        expect(logsService.getLogIcon({ ...systemLog, level: 'unknown' })).toBe('FileText');
      });
    });
  });

  describe('integration scenarios', () => {
    it('should handle concurrent log fetching', async () => {
      const mockResponse1 = { audit: [{ id: '1' } as AuditLog], system: [], totalAudit: 1, totalSystem: 0 };
      const mockResponse2 = { audit: [], system: [{ id: '2' } as SystemLog], totalAudit: 0, totalSystem: 1 };

      mockApiClient
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2);

      const [result1, result2] = await Promise.all([
        logsService.getLogs({ type: 'audit' }),
        logsService.getLogs({ type: 'system' })
      ]);

      expect(result1).toEqual(mockResponse1);
      expect(result2).toEqual(mockResponse2);
      expect(mockApiClient).toHaveBeenCalledTimes(2);
    });

    it('should handle request cancellation', async () => {
      const controller = new AbortController();
      const abortError = new Error('Request aborted');
      abortError.name = 'AbortError';

      mockApiClient.mockRejectedValue(abortError);

      // Cancel the request immediately
      controller.abort();

      await expect(
        logsService.getLogs({ signal: controller.signal })
      ).rejects.toThrow('Request aborted');
    });
  });
});