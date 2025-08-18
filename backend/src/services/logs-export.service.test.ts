import { LogsExportService, logsExportService } from './logs-export.service';
import { logsService, LogQueryParams } from './logs.service';
import { loggingConfig } from '@/config/logging.config';
import { logger } from '@/utils/logger';
import { Response } from 'express';

// Mock dependencies
jest.mock('./logs.service', () => ({
  logsService: {
    getAuditLogs: jest.fn(),
    getSystemLogs: jest.fn()
  }
}));

jest.mock('@/config/logging.config', () => ({
  loggingConfig: {
    export: {
      chunkSize: 1000
    }
  }
}));

jest.mock('@/utils/logger', () => ({
  logger: {
    error: jest.fn(),
    debug: jest.fn(),
    info: jest.fn()
  }
}));

describe('LogsExportService', () => {
  let exportService: LogsExportService;
  let mockResponse: Partial<Response>;
  const mockLogsService = logsService as jest.Mocked<typeof logsService>;
  const mockLogger = logger as jest.Mocked<typeof logger>;

  beforeEach(() => {
    jest.clearAllMocks();
    exportService = new LogsExportService();
    
    // Mock Express Response object
    mockResponse = {
      write: jest.fn(),
      end: jest.fn(),
      setHeader: jest.fn()
    };
  });

  describe('Constructor and Configuration', () => {
    it('should initialize with correct chunk size from config', () => {
      const service = new LogsExportService();
      expect((service as any).CHUNK_SIZE).toBe(1000);
    });

    it('should use default chunk size when config is not available', () => {
      // Temporarily mock config without chunkSize
      const originalConfig = loggingConfig.export.chunkSize;
      (loggingConfig.export as any).chunkSize = undefined;
      
      const service = new LogsExportService();
      expect((service as any).CHUNK_SIZE).toBe(1000); // Uses default
      
      // Restore original config
      (loggingConfig.export as any).chunkSize = originalConfig;
    });
  });

  describe('exportCSV', () => {
    const mockParams: LogQueryParams = {
      type: 'audit',
      startDate: '2025-01-01',
      endDate: '2025-01-31'
    };

    it('should export audit logs in CSV format', async () => {
      const mockAuditLogs = [
        {
          created_at: '2025-01-01T10:00:00Z',
          event_type: 'login',
          event_action: 'user_login',
          username: 'testuser',
          ip_address: '192.168.1.1',
          success: true,
          details: { browser: 'Chrome' }
        },
        {
          created_at: '2025-01-01T11:00:00Z',
          event_type: 'logout',
          event_action: 'user_logout',
          username: 'testuser',
          ip_address: '192.168.1.1',
          success: true,
          error_message: null
        }
      ];

      mockLogsService.getAuditLogs
        .mockResolvedValueOnce({ logs: mockAuditLogs, total: 2 })
        .mockResolvedValueOnce({ logs: [], total: 0 }); // Second call returns empty

      await exportService.exportCSV(mockResponse as Response, mockParams, 10);

      // Verify CSV header was written
      expect(mockResponse.write).toHaveBeenCalledWith(
        'Type,Timestamp,Level/EventType,Action/Message,User,IP Address,Status,Details\n'
      );

      // Verify CSV rows were written
      expect(mockResponse.write).toHaveBeenCalledWith(
        '"Audit","2025-01-01T10:00:00Z","login","user_login","testuser","192.168.1.1","Success","{""browser"":""Chrome""}"\n'
      );
      expect(mockResponse.write).toHaveBeenCalledWith(
        '"Audit","2025-01-01T11:00:00Z","logout","user_logout","testuser","192.168.1.1","Success","{}"\n'
      );

      expect(mockResponse.end).toHaveBeenCalled();
    });

    it('should export system logs in CSV format', async () => {
      const mockSystemLogs = [
        {
          timestamp: '2025-01-01T10:00:00Z',
          level: 'error',
          message: 'Database connection failed',
          user_id: 123,
          ip_address: '192.168.1.1',
          status_code: 500,
          error_stack: 'Error: Connection timeout'
        }
      ];

      const systemParams: LogQueryParams = { type: 'system' };
      mockLogsService.getSystemLogs
        .mockResolvedValueOnce({ logs: mockSystemLogs, total: 1 })
        .mockResolvedValueOnce({ logs: [], total: 0 });

      await exportService.exportCSV(mockResponse as Response, systemParams, 10);

      expect(mockResponse.write).toHaveBeenCalledWith(
        '"System","2025-01-01T10:00:00Z","error","Database connection failed","123","192.168.1.1","500","Error: Connection timeout"\n'
      );
    });

    it('should export both audit and system logs when type is "all"', async () => {
      const mockAuditLogs = [{ created_at: '2025-01-01', event_type: 'login', event_action: 'test', success: true }];
      const mockSystemLogs = [{ timestamp: '2025-01-01', level: 'info', message: 'test' }];

      mockLogsService.getAuditLogs
        .mockResolvedValueOnce({ logs: mockAuditLogs, total: 1 })
        .mockResolvedValueOnce({ logs: [], total: 0 });
      
      mockLogsService.getSystemLogs
        .mockResolvedValueOnce({ logs: mockSystemLogs, total: 1 })
        .mockResolvedValueOnce({ logs: [], total: 0 });

      const allParams: LogQueryParams = { type: 'all' };
      await exportService.exportCSV(mockResponse as Response, allParams, 10);

      expect(mockLogsService.getAuditLogs).toHaveBeenCalled();
      expect(mockLogsService.getSystemLogs).toHaveBeenCalled();
    });

    it('should respect maxRecords limit', async () => {
      const mockLogs = Array.from({ length: 5 }, (_, i) => ({
        created_at: `2025-01-0${i + 1}`,
        event_type: 'test',
        event_action: 'test',
        success: true
      }));

      mockLogsService.getAuditLogs.mockResolvedValue({ logs: mockLogs, total: 5 });

      await exportService.exportCSV(mockResponse as Response, mockParams, 3);

      // Should only export 3 records (plus header)
      expect(mockResponse.write).toHaveBeenCalledTimes(4); // 1 header + 3 data rows
    });

    it('should handle chunking correctly', async () => {
      // Create a service with smaller chunk size for testing
      const smallChunkService = new LogsExportService();
      (smallChunkService as any).CHUNK_SIZE = 2;

      const mockLogs1 = [
        { created_at: '2025-01-01', event_type: 'test1', event_action: 'test', success: true },
        { created_at: '2025-01-02', event_type: 'test2', event_action: 'test', success: true }
      ];
      const mockLogs2 = [
        { created_at: '2025-01-03', event_type: 'test3', event_action: 'test', success: true }
      ];

      mockLogsService.getAuditLogs
        .mockResolvedValueOnce({ logs: mockLogs1, total: 3 })
        .mockResolvedValueOnce({ logs: mockLogs2, total: 1 })
        .mockResolvedValueOnce({ logs: [], total: 0 });

      await smallChunkService.exportCSV(mockResponse as Response, mockParams, 10);

      // Should make multiple calls with different offsets
      expect(mockLogsService.getAuditLogs).toHaveBeenCalledWith(
        expect.objectContaining({ ...mockParams, pageSize: 2 }),
        0
      );
      expect(mockLogsService.getAuditLogs).toHaveBeenCalledWith(
        expect.objectContaining({ ...mockParams, pageSize: 2 }),
        2
      );
    });

    it('should handle empty log results', async () => {
      mockLogsService.getAuditLogs.mockResolvedValue({ logs: [], total: 0 });

      await exportService.exportCSV(mockResponse as Response, mockParams, 10);

      // Should only write header
      expect(mockResponse.write).toHaveBeenCalledTimes(1);
      expect(mockResponse.write).toHaveBeenCalledWith(
        'Type,Timestamp,Level/EventType,Action/Message,User,IP Address,Status,Details\n'
      );
      expect(mockResponse.end).toHaveBeenCalled();
    });

    it('should respect maxRecords limit in system logs during CSV export', async () => {
      const mockSystemLogs = Array.from({ length: 5 }, (_, i) => ({
        timestamp: `2025-01-0${i + 1}`,
        level: 'info',
        message: `message ${i}`,
        user_id: i
      }));

      const systemParams: LogQueryParams = { type: 'system' };
      mockLogsService.getSystemLogs.mockResolvedValue({ logs: mockSystemLogs, total: 5 });

      await exportService.exportCSV(mockResponse as Response, systemParams, 3);

      // Should export header + exactly 3 system log records
      expect(mockResponse.write).toHaveBeenCalledTimes(4); // 1 header + 3 data rows
    });
  });

  describe('exportJSON', () => {
    const mockParams: LogQueryParams = { type: 'audit' };

    it('should export audit logs in JSON format', async () => {
      const mockAuditLogs = [
        { id: 1, event_type: 'login', username: 'user1' },
        { id: 2, event_type: 'logout', username: 'user2' }
      ];

      mockLogsService.getAuditLogs
        .mockResolvedValueOnce({ logs: mockAuditLogs, total: 2 })
        .mockResolvedValueOnce({ logs: [], total: 0 });

      await exportService.exportJSON(mockResponse as Response, mockParams, 10);

      expect(mockResponse.write).toHaveBeenCalledWith('{"audit":[');
      expect(mockResponse.write).toHaveBeenCalledWith(JSON.stringify(mockAuditLogs[0]));
      expect(mockResponse.write).toHaveBeenCalledWith(',');
      expect(mockResponse.write).toHaveBeenCalledWith(JSON.stringify(mockAuditLogs[1]));
      expect(mockResponse.write).toHaveBeenCalledWith('],"system":[');
      expect(mockResponse.write).toHaveBeenCalledWith(']}');
      expect(mockResponse.end).toHaveBeenCalled();
    });

    it('should export system logs in JSON format', async () => {
      const mockSystemLogs = [
        { id: 1, level: 'info', message: 'Test message' }
      ];

      const systemParams: LogQueryParams = { type: 'system' };
      mockLogsService.getSystemLogs
        .mockResolvedValueOnce({ logs: mockSystemLogs, total: 1 })
        .mockResolvedValueOnce({ logs: [], total: 0 });

      await exportService.exportJSON(mockResponse as Response, systemParams, 10);

      expect(mockResponse.write).toHaveBeenCalledWith('{"audit":[');
      expect(mockResponse.write).toHaveBeenCalledWith('],"system":[');
      expect(mockResponse.write).toHaveBeenCalledWith(JSON.stringify(mockSystemLogs[0]));
      expect(mockResponse.write).toHaveBeenCalledWith(']}');
    });

    it('should handle both audit and system logs for type "all"', async () => {
      const mockAuditLogs = [{ id: 1, event_type: 'login' }];
      const mockSystemLogs = [{ id: 1, level: 'info' }];

      mockLogsService.getAuditLogs
        .mockResolvedValueOnce({ logs: mockAuditLogs, total: 1 })
        .mockResolvedValueOnce({ logs: [], total: 0 });
      
      mockLogsService.getSystemLogs
        .mockResolvedValueOnce({ logs: mockSystemLogs, total: 1 })
        .mockResolvedValueOnce({ logs: [], total: 0 });

      const allParams: LogQueryParams = { type: 'all' };
      await exportService.exportJSON(mockResponse as Response, allParams, 10);

      expect(mockLogsService.getAuditLogs).toHaveBeenCalled();
      expect(mockLogsService.getSystemLogs).toHaveBeenCalled();
    });

    it('should respect maxRecords limit across both log types', async () => {
      const mockAuditLogs = [
        { id: 1, event_type: 'login' },
        { id: 2, event_type: 'logout' }
      ];

      mockLogsService.getAuditLogs
        .mockResolvedValueOnce({ logs: mockAuditLogs, total: 2 })
        .mockResolvedValueOnce({ logs: [], total: 0 });

      await exportService.exportJSON(mockResponse as Response, mockParams, 1);

      // Should only export 1 record
      expect(mockResponse.write).toHaveBeenCalledWith(JSON.stringify(mockAuditLogs[0]));
      expect(mockResponse.write).not.toHaveBeenCalledWith(JSON.stringify(mockAuditLogs[1]));
    });

    it('should handle empty results gracefully', async () => {
      mockLogsService.getAuditLogs.mockResolvedValue({ logs: [], total: 0 });
      mockLogsService.getSystemLogs.mockResolvedValue({ logs: [], total: 0 });

      await exportService.exportJSON(mockResponse as Response, { type: 'all' }, 10);

      expect(mockResponse.write).toHaveBeenCalledWith('{"audit":[');
      expect(mockResponse.write).toHaveBeenCalledWith('],"system":[');
      expect(mockResponse.write).toHaveBeenCalledWith(']}');
      expect(mockResponse.end).toHaveBeenCalled();
    });

    it('should respect maxRecords limit in system logs during JSON export', async () => {
      const mockAuditLogs = [{ id: 1, event_type: 'login' }];
      const mockSystemLogs = Array.from({ length: 5 }, (_, i) => ({
        id: i + 1,
        level: 'info',
        message: `message ${i}`
      }));

      mockLogsService.getAuditLogs
        .mockResolvedValueOnce({ logs: mockAuditLogs, total: 1 })
        .mockResolvedValueOnce({ logs: [], total: 0 });
      
      mockLogsService.getSystemLogs.mockResolvedValue({ logs: mockSystemLogs, total: 5 });

      const allParams: LogQueryParams = { type: 'all' };
      await exportService.exportJSON(mockResponse as Response, allParams, 3);

      // Should export 1 audit log + 2 system logs = 3 total
      const writeCalls = (mockResponse.write as jest.Mock).mock.calls;
      const jsonCalls = writeCalls.filter(call => 
        call[0].startsWith('{"id":') || call[0] === ','
      );
      
      // Should have written 1 audit + comma + 2 system logs (reaching maxRecords=3)
      expect(jsonCalls.length).toBe(4); // audit + comma + system + comma
    });
  });

  describe('formatAuditLogAsCSV', () => {
    it('should format audit log correctly', () => {
      const log = {
        created_at: '2025-01-01T10:00:00Z',
        event_type: 'login',
        event_action: 'user_login',
        username: 'testuser',
        ip_address: '192.168.1.1',
        success: true,
        details: { browser: 'Chrome' }
      };

      const result = (exportService as any).formatAuditLogAsCSV(log);
      
      expect(result).toBe(
        '"Audit","2025-01-01T10:00:00Z","login","user_login","testuser","192.168.1.1","Success","{""browser"":""Chrome""}"\n'
      );
    });

    it('should handle missing optional fields', () => {
      const log = {
        created_at: '2025-01-01T10:00:00Z',
        event_type: 'login',
        event_action: 'user_login',
        success: false
      };

      const result = (exportService as any).formatAuditLogAsCSV(log);
      
      expect(result).toBe(
        '"Audit","2025-01-01T10:00:00Z","login","user_login","","","Failed","{}"\n'
      );
    });

    it('should handle user_id when username is missing', () => {
      const log = {
        created_at: '2025-01-01T10:00:00Z',
        event_type: 'login',
        event_action: 'user_login',
        user_id: 123,
        success: true
      };

      const result = (exportService as any).formatAuditLogAsCSV(log);
      
      expect(result).toContain('"123"');
    });

    it('should escape double quotes in field values', () => {
      const log = {
        created_at: '2025-01-01T10:00:00Z',
        event_type: 'test',
        event_action: 'test "quoted" action',
        username: 'user "admin"',
        success: true,
        error_message: 'Error with "quotes"'
      };

      const result = (exportService as any).formatAuditLogAsCSV(log);
      
      expect(result).toContain('"test ""quoted"" action"');
      expect(result).toContain('"user ""admin"""');
      expect(result).toContain('"Error with ""quotes"""');
    });

    it('should use error_message when available', () => {
      const log = {
        created_at: '2025-01-01T10:00:00Z',
        event_type: 'login',
        event_action: 'user_login',
        success: false,
        error_message: 'Invalid credentials',
        details: { attempt: 1 }
      };

      const result = (exportService as any).formatAuditLogAsCSV(log);
      
      expect(result).toContain('"Invalid credentials"');
    });
  });

  describe('formatSystemLogAsCSV', () => {
    it('should format system log correctly', () => {
      const log = {
        timestamp: '2025-01-01T10:00:00Z',
        level: 'error',
        message: 'Database connection failed',
        user_id: 123,
        ip_address: '192.168.1.1',
        status_code: 500,
        error_stack: 'Error: Connection timeout'
      };

      const result = (exportService as any).formatSystemLogAsCSV(log);
      
      expect(result).toBe(
        '"System","2025-01-01T10:00:00Z","error","Database connection failed","123","192.168.1.1","500","Error: Connection timeout"\n'
      );
    });

    it('should handle missing optional fields', () => {
      const log = {
        timestamp: '2025-01-01T10:00:00Z',
        level: 'info',
        message: 'Test message'
      };

      const result = (exportService as any).formatSystemLogAsCSV(log);
      
      expect(result).toBe(
        '"System","2025-01-01T10:00:00Z","info","Test message","","","","{}"\n'
      );
    });

    it('should use error_stack when available', () => {
      const log = {
        timestamp: '2025-01-01T10:00:00Z',
        level: 'error',
        message: 'Test error',
        error_stack: 'Error stack trace',
        metadata: { module: 'auth' }
      };

      const result = (exportService as any).formatSystemLogAsCSV(log);
      
      expect(result).toContain('"Error stack trace"');
    });

    it('should fallback to metadata JSON when no error_stack', () => {
      const log = {
        timestamp: '2025-01-01T10:00:00Z',
        level: 'info',
        message: 'Test message',
        metadata: { module: 'auth', action: 'login' }
      };

      const result = (exportService as any).formatSystemLogAsCSV(log);
      
      expect(result).toContain('"{""module"":""auth"",""action"":""login""}"');
    });
  });

  describe('streamExport', () => {
    it('should set correct headers for CSV export', async () => {
      mockLogsService.getAuditLogs.mockResolvedValue({ logs: [], total: 0 });

      await exportService.streamExport(
        mockResponse as Response,
        { type: 'audit' },
        'csv',
        100
      );

      expect(mockResponse.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringMatching(/attachment; filename=logs_export_\d+\.csv/)
      );
    });

    it('should set correct headers for JSON export', async () => {
      mockLogsService.getAuditLogs.mockResolvedValue({ logs: [], total: 0 });

      await exportService.streamExport(
        mockResponse as Response,
        { type: 'audit' },
        'json',
        100
      );

      expect(mockResponse.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringMatching(/attachment; filename=logs_export_\d+\.json/)
      );
    });

    it('should call exportCSV for CSV format', async () => {
      const exportCSVSpy = jest.spyOn(exportService, 'exportCSV').mockResolvedValue();

      const params = { type: 'audit' as const };
      await exportService.streamExport(mockResponse as Response, params, 'csv', 100);

      expect(exportCSVSpy).toHaveBeenCalledWith(mockResponse, params, 100);
    });

    it('should call exportJSON for JSON format', async () => {
      const exportJSONSpy = jest.spyOn(exportService, 'exportJSON').mockResolvedValue();

      const params = { type: 'audit' as const };
      await exportService.streamExport(mockResponse as Response, params, 'json', 100);

      expect(exportJSONSpy).toHaveBeenCalledWith(mockResponse, params, 100);
    });

    it('should handle and log errors', async () => {
      const error = new Error('Export failed');
      jest.spyOn(exportService, 'exportCSV').mockRejectedValue(error);

      await expect(
        exportService.streamExport(mockResponse as Response, { type: 'audit' }, 'csv', 100)
      ).rejects.toThrow('Export failed');

      expect(mockLogger.error).toHaveBeenCalledWith('Error during log export:', error);
    });

    it('should generate unique filenames', async () => {
      mockLogsService.getAuditLogs.mockResolvedValue({ logs: [], total: 0 });

      const dateNowSpy = jest.spyOn(Date, 'now')
        .mockReturnValueOnce(1640995200000) // First call
        .mockReturnValueOnce(1640995200001); // Second call

      await exportService.streamExport(
        mockResponse as Response,
        { type: 'audit' },
        'csv',
        100
      );

      await exportService.streamExport(
        mockResponse as Response,
        { type: 'audit' },
        'json',
        100
      );

      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename=logs_export_1640995200000.csv'
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename=logs_export_1640995200001.json'
      );

      dateNowSpy.mockRestore();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle service errors during audit log retrieval', async () => {
      const error = new Error('Database connection failed');
      mockLogsService.getAuditLogs.mockRejectedValue(error);

      await expect(
        exportService.exportCSV(mockResponse as Response, { type: 'audit' }, 10)
      ).rejects.toThrow('Database connection failed');
    });

    it('should handle service errors during system log retrieval', async () => {
      const error = new Error('Redis connection failed');
      mockLogsService.getSystemLogs.mockRejectedValue(error);

      await expect(
        exportService.exportCSV(mockResponse as Response, { type: 'system' }, 10)
      ).rejects.toThrow('Redis connection failed');
    });

    it('should handle concurrent export operations', async () => {
      const mockLogs = [{ id: 1, event_type: 'test', event_action: 'test', success: true }];
      mockLogsService.getAuditLogs.mockResolvedValue({ logs: mockLogs, total: 1 });

      const mockResponse1 = { write: jest.fn(), end: jest.fn(), setHeader: jest.fn() };
      const mockResponse2 = { write: jest.fn(), end: jest.fn(), setHeader: jest.fn() };

      const export1 = exportService.streamExport(
        mockResponse1 as any,
        { type: 'audit' },
        'csv',
        10
      );
      const export2 = exportService.streamExport(
        mockResponse2 as any,
        { type: 'audit' },
        'json',
        10
      );

      await Promise.all([export1, export2]);

      expect(mockResponse1.end).toHaveBeenCalled();
      expect(mockResponse2.end).toHaveBeenCalled();
    });

    it('should handle null and undefined values in log data', async () => {
      const logWithNulls = {
        created_at: '2025-01-01T10:00:00Z',
        event_type: null,
        event_action: undefined,
        username: null,
        ip_address: undefined,
        success: true,
        details: null
      };

      const result = (exportService as any).formatAuditLogAsCSV(logWithNulls);
      
      expect(result).toContain('"null"'); // null gets stringified
      expect(result).toContain('""'); // undefined becomes empty string
    });

    it('should handle very large log objects', async () => {
      const largeDetails = {};
      for (let i = 0; i < 10; i++) {
        (largeDetails as any)[`field${i}`] = `value${i}`.repeat(50);
      }

      const logWithLargeDetails = {
        created_at: '2025-01-01T10:00:00Z',
        event_type: 'test',
        event_action: 'test',
        success: true,
        details: largeDetails
      };

      const result = (exportService as any).formatAuditLogAsCSV(logWithLargeDetails);
      
      // The CSV formatting escapes quotes in JSON, so we need to check for the escaped version
      const expectedDetailsFragment = '""field0"":""value0value0value0value0value0value0value0value0value0value0value0value0value0value0value0value0value0value0value0value0value0value0value0value0value0value0value0value0value0value0value0value0value0value0value0value0value0value0value0value0value0value0value0value0value0value0value0value0value0value0';
      expect(result).toContain(expectedDetailsFragment);
      expect(result.length).toBeGreaterThan(1000);
    });

    it('should handle response write errors gracefully', async () => {
      const writeError = new Error('Response write failed');
      mockResponse.write = jest.fn().mockImplementation(() => {
        throw writeError;
      });

      mockLogsService.getAuditLogs.mockResolvedValue({
        logs: [{ created_at: '2025-01-01', event_type: 'test', event_action: 'test', success: true }],
        total: 1
      });

      await expect(
        exportService.exportCSV(mockResponse as Response, { type: 'audit' }, 10)
      ).rejects.toThrow('Response write failed');
    });
  });

  describe('Singleton Instance', () => {
    it('should export a singleton instance', () => {
      expect(logsExportService).toBeInstanceOf(LogsExportService);
      expect(logsExportService).toBe(logsExportService); // Same reference
    });

    it('should have same configuration as new instance', () => {
      const newInstance = new LogsExportService();
      expect((logsExportService as any).CHUNK_SIZE).toBe((newInstance as any).CHUNK_SIZE);
    });
  });

  describe('Large Dataset Streaming', () => {
    it('should handle streaming very large datasets efficiently', async () => {
      const largeChunkService = new LogsExportService();
      (largeChunkService as any).CHUNK_SIZE = 100;

      // Simulate 5 chunks of data
      const mockChunks = Array.from({ length: 5 }, (_, chunkIndex) =>
        Array.from({ length: 100 }, (_, i) => ({
          created_at: `2025-01-${String(chunkIndex * 100 + i + 1).padStart(2, '0')}T10:00:00Z`,
          event_type: `event_${chunkIndex}_${i}`,
          event_action: 'test_action',
          success: true
        }))
      );

      mockLogsService.getAuditLogs
        .mockResolvedValueOnce({ logs: mockChunks[0], total: 500 })
        .mockResolvedValueOnce({ logs: mockChunks[1], total: 500 })
        .mockResolvedValueOnce({ logs: mockChunks[2], total: 500 })
        .mockResolvedValueOnce({ logs: mockChunks[3], total: 500 })
        .mockResolvedValueOnce({ logs: mockChunks[4], total: 500 })
        .mockResolvedValueOnce({ logs: [], total: 0 });

      await largeChunkService.exportCSV(mockResponse as Response, { type: 'audit' }, 1000);

      // Should have made 6 calls (5 with data + 1 empty)
      expect(mockLogsService.getAuditLogs).toHaveBeenCalledTimes(6);
      
      // Should have written header + 500 data rows
      expect(mockResponse.write).toHaveBeenCalledTimes(501);
      expect(mockResponse.end).toHaveBeenCalled();

      // Verify proper offset progression
      expect(mockLogsService.getAuditLogs).toHaveBeenNthCalledWith(1, expect.anything(), 0);
      expect(mockLogsService.getAuditLogs).toHaveBeenNthCalledWith(2, expect.anything(), 100);
      expect(mockLogsService.getAuditLogs).toHaveBeenNthCalledWith(3, expect.anything(), 200);
      expect(mockLogsService.getAuditLogs).toHaveBeenNthCalledWith(4, expect.anything(), 300);
      expect(mockLogsService.getAuditLogs).toHaveBeenNthCalledWith(5, expect.anything(), 400);
      expect(mockLogsService.getAuditLogs).toHaveBeenNthCalledWith(6, expect.anything(), 500);
    });

    it('should stop when maxRecords limit is reached during chunking', async () => {
      const mockLogs = Array.from({ length: 50 }, (_, i) => ({
        created_at: `2025-01-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
        event_type: `event_${i}`,
        event_action: 'test',
        success: true
      }));

      mockLogsService.getAuditLogs
        .mockResolvedValueOnce({ logs: mockLogs, total: 50 })
        .mockResolvedValueOnce({ logs: mockLogs, total: 50 }); // Second chunk

      await exportService.exportCSV(mockResponse as Response, { type: 'audit' }, 75);

      // Should export exactly 75 records (header + 75 data rows)
      expect(mockResponse.write).toHaveBeenCalledTimes(76);
    });
  });

  describe('Memory and Performance', () => {
    it('should not accumulate data in memory during streaming', async () => {
      // This test ensures we're streaming data correctly without buffering
      const writeCallsCount = jest.fn();
      mockResponse.write = jest.fn().mockImplementation(() => {
        writeCallsCount();
        return true;
      });

      const mockLogs = Array.from({ length: 10 }, (_, i) => ({
        created_at: `2025-01-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
        event_type: `event_${i}`,
        event_action: 'test',
        success: true
      }));

      mockLogsService.getAuditLogs
        .mockResolvedValueOnce({ logs: mockLogs, total: 10 })
        .mockResolvedValueOnce({ logs: [], total: 0 });

      await exportService.exportCSV(mockResponse as Response, { type: 'audit' }, 50);

      // Each log should result in immediate write call
      expect(writeCallsCount).toHaveBeenCalledTimes(11); // 1 header + 10 data rows
    });

    it('should handle memory pressure gracefully', async () => {
      // Simulate a scenario where write operations take time
      let writeDelay = 0;
      mockResponse.write = jest.fn().mockImplementation(() => {
        return new Promise(resolve => setTimeout(resolve, writeDelay++));
      });

      const mockLogs = [
        { created_at: '2025-01-01', event_type: 'test', event_action: 'test', success: true }
      ];

      mockLogsService.getAuditLogs
        .mockResolvedValueOnce({ logs: mockLogs, total: 1 })
        .mockResolvedValueOnce({ logs: [], total: 0 });

      await exportService.exportCSV(mockResponse as Response, { type: 'audit' }, 10);

      expect(mockResponse.write).toHaveBeenCalledTimes(2); // header + 1 data row
      expect(mockResponse.end).toHaveBeenCalled();
    });
  });
});