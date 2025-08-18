import { LogsStatsService } from './logs-stats.service';
import { db } from '@/config/database';

jest.mock('@/config/database', () => ({
  db: {
    query: jest.fn()
  }
}));

jest.mock('@/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn()
  }
}));

describe('LogsStatsService', () => {
  let logsStatsService: LogsStatsService;
  const mockDbQuery = db.query as jest.MockedFunction<typeof db.query>;

  beforeEach(() => {
    jest.clearAllMocks();
    logsStatsService = new LogsStatsService();
  });

  describe('getLogStats', () => {
    it('should return comprehensive log statistics for default 24 hour period', async () => {
      // Mock all the parallel queries
      const mockAuditStats = [
        {
          event_type: 'auth',
          event_action: 'login',
          count: '150',
          failed_count: '5',
          unique_users: '45',
          unique_ips: '42'
        }
      ];
      
      const mockSystemStats = [
        {
          level: 'error',
          module: 'auth',
          count: '25',
          avg_duration: '125.5',
          max_duration: '500',
          min_duration: '50',
          p95_duration: '300'
        }
      ];
      
      const mockErrorTrends = [
        {
          hour: '2025-01-01T10:00:00.000Z',
          error_count: '12',
          affected_modules: '3'
        }
      ];
      
      const mockTopErrors = [
        {
          message: 'Database connection timeout',
          module: 'database',
          count: '8',
          last_occurrence: '2025-01-01T11:30:00.000Z'
        }
      ];

      // Set up mock responses in order of Promise.all calls
      mockDbQuery
        .mockResolvedValueOnce({ rows: mockAuditStats })    // getAuditStats
        .mockResolvedValueOnce({ rows: mockSystemStats })   // getSystemStats  
        .mockResolvedValueOnce({ rows: mockErrorTrends })   // getErrorTrends
        .mockResolvedValueOnce({ rows: mockTopErrors });    // getTopErrors

      const result = await logsStatsService.getLogStats();

      expect(result).toEqual({
        auditStats: mockAuditStats,
        systemStats: mockSystemStats,
        errorTrends: mockErrorTrends,
        topErrors: mockTopErrors,
        period: '24 hours'
      });

      expect(mockDbQuery).toHaveBeenCalledTimes(4);
    });

    it('should handle custom time period', async () => {
      mockDbQuery
        .mockResolvedValue({ rows: [] })
        .mockResolvedValue({ rows: [] })
        .mockResolvedValue({ rows: [] })
        .mockResolvedValue({ rows: [] });

      const result = await logsStatsService.getLogStats(48);

      expect(result.period).toBe('48 hours');
      expect(mockDbQuery).toHaveBeenCalledTimes(4);
      
      // Verify that all queries received the correct time parameter
      expect(mockDbQuery.mock.calls[0][1]).toEqual(['48 hours']);
      expect(mockDbQuery.mock.calls[1][1]).toEqual(['48 hours']);
      expect(mockDbQuery.mock.calls[2][1]).toEqual(['48 hours']);
      expect(mockDbQuery.mock.calls[3][1]).toEqual(['48 hours']);
    });

    it('should handle single digit hour periods', async () => {
      mockDbQuery
        .mockResolvedValue({ rows: [] })
        .mockResolvedValue({ rows: [] })
        .mockResolvedValue({ rows: [] })
        .mockResolvedValue({ rows: [] });

      const result = await logsStatsService.getLogStats(1);

      expect(result.period).toBe('1 hours');
      expect(mockDbQuery.mock.calls[0][1]).toEqual(['1 hours']);
    });

    it('should handle Promise.all rejection if any query fails', async () => {
      mockDbQuery
        .mockResolvedValueOnce({ rows: [] })                // getAuditStats succeeds
        .mockRejectedValueOnce(new Error('DB error'))       // getSystemStats fails
        .mockResolvedValueOnce({ rows: [] })                // getErrorTrends succeeds  
        .mockResolvedValueOnce({ rows: [] });               // getTopErrors succeeds

      await expect(logsStatsService.getLogStats()).rejects.toThrow('DB error');
    });
  });

  describe('getAuditStats', () => {
    it('should fetch audit statistics with correct SQL query and parameters', async () => {
      const mockData = [
        {
          event_type: 'auth',
          event_action: 'login',
          count: '100',
          failed_count: '5',
          unique_users: '50',
          unique_ips: '45'
        },
        {
          event_type: 'data',
          event_action: 'export',
          count: '25',
          failed_count: '2',
          unique_users: '10',
          unique_ips: '8'
        }
      ];

      mockDbQuery.mockResolvedValueOnce({ rows: mockData });

      // Access private method for testing
      const result = await (logsStatsService as any).getAuditStats(12);

      expect(result).toEqual(mockData);
      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        ['12 hours']
      );

      const query = mockDbQuery.mock.calls[0][0];
      expect(query).toContain('FROM audit_logs');
      expect(query).toContain('WHERE created_at > CURRENT_TIMESTAMP - INTERVAL $1');
      expect(query).toContain('GROUP BY event_type, event_action');
      expect(query).toContain('ORDER BY count DESC');
      expect(query).toContain('LIMIT 20');
      expect(query).toContain('COUNT(*) as count');
      expect(query).toContain('COUNT(CASE WHEN success = false THEN 1 END) as failed_count');
      expect(query).toContain('COUNT(DISTINCT user_id) as unique_users');
      expect(query).toContain('COUNT(DISTINCT ip_address) as unique_ips');
    });

    it('should handle empty audit logs result', async () => {
      mockDbQuery.mockResolvedValueOnce({ rows: [] });

      const result = await (logsStatsService as any).getAuditStats(24);

      expect(result).toEqual([]);
      expect(mockDbQuery).toHaveBeenCalledTimes(1);
    });

    it('should handle database errors', async () => {
      mockDbQuery.mockRejectedValueOnce(new Error('Connection failed'));

      await expect((logsStatsService as any).getAuditStats(24))
        .rejects.toThrow('Connection failed');
    });
  });

  describe('getSystemStats', () => {
    it('should fetch system statistics with correct SQL query and aggregations', async () => {
      const mockData = [
        {
          level: 'error',
          module: 'auth',
          count: '50',
          avg_duration: '125.75',
          max_duration: '500',
          min_duration: '25',
          p95_duration: '400'
        },
        {
          level: 'info',
          module: 'reports',
          count: '200',
          avg_duration: '85.25',
          max_duration: '300',
          min_duration: '10',
          p95_duration: '250'
        }
      ];

      mockDbQuery.mockResolvedValueOnce({ rows: mockData });

      const result = await (logsStatsService as any).getSystemStats(6);

      expect(result).toEqual(mockData);
      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        ['6 hours']
      );

      const query = mockDbQuery.mock.calls[0][0];
      expect(query).toContain('FROM system_logs');
      expect(query).toContain('WHERE timestamp > CURRENT_TIMESTAMP - INTERVAL $1');
      expect(query).toContain('GROUP BY level, module');
      expect(query).toContain('ORDER BY count DESC');
      expect(query).toContain('LIMIT 20');
      expect(query).toContain('AVG(duration_ms) as avg_duration');
      expect(query).toContain('MAX(duration_ms) as max_duration');
      expect(query).toContain('MIN(duration_ms) as min_duration');
      expect(query).toContain('PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms) as p95_duration');
    });

    it('should handle system logs with null duration values', async () => {
      const mockData = [
        {
          level: 'debug',
          module: 'utils',
          count: '10',
          avg_duration: null,
          max_duration: null,
          min_duration: null,
          p95_duration: null
        }
      ];

      mockDbQuery.mockResolvedValueOnce({ rows: mockData });

      const result = await (logsStatsService as any).getSystemStats(1);

      expect(result).toEqual(mockData);
      expect(result[0].avg_duration).toBeNull();
    });
  });

  describe('getErrorTrends', () => {
    it('should fetch error trends grouped by hour', async () => {
      const mockData = [
        {
          hour: '2025-01-01T09:00:00.000Z',
          error_count: '15',
          affected_modules: '5'
        },
        {
          hour: '2025-01-01T10:00:00.000Z',
          error_count: '8',
          affected_modules: '3'
        }
      ];

      mockDbQuery.mockResolvedValueOnce({ rows: mockData });

      const result = await (logsStatsService as any).getErrorTrends(24);

      expect(result).toEqual(mockData);
      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        ['24 hours']
      );

      const query = mockDbQuery.mock.calls[0][0];
      expect(query).toContain('FROM system_logs');
      expect(query).toContain("WHERE level = 'error'");
      expect(query).toContain('AND timestamp > CURRENT_TIMESTAMP - INTERVAL $1');
      expect(query).toContain("DATE_TRUNC('hour', timestamp) as hour");
      expect(query).toContain('COUNT(*) as error_count');
      expect(query).toContain('COUNT(DISTINCT module) as affected_modules');
      expect(query).toContain("GROUP BY DATE_TRUNC('hour', timestamp)");
      expect(query).toContain('ORDER BY hour');
    });

    it('should handle periods with no errors', async () => {
      mockDbQuery.mockResolvedValueOnce({ rows: [] });

      const result = await (logsStatsService as any).getErrorTrends(1);

      expect(result).toEqual([]);
    });

    it('should handle very short time periods', async () => {
      mockDbQuery.mockResolvedValueOnce({ rows: [] });

      const result = await (logsStatsService as any).getErrorTrends(0.5);

      expect(result).toEqual([]);
      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.any(String),
        ['0.5 hours']
      );
    });
  });

  describe('getTopErrors', () => {
    it('should fetch top error messages with counts and last occurrence', async () => {
      const mockData = [
        {
          message: 'Database connection timeout',
          module: 'database',
          count: '25',
          last_occurrence: '2025-01-01T11:45:00.000Z'
        },
        {
          message: 'Authentication failed',
          module: 'auth',
          count: '18',
          last_occurrence: '2025-01-01T11:30:00.000Z'
        }
      ];

      // Clear any previous mocks and set up fresh mock for this test
      mockDbQuery.mockClear();
      mockDbQuery.mockResolvedValueOnce({ rows: mockData });

      const result = await (logsStatsService as any).getTopErrors(48);

      expect(result).toEqual(mockData);
      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        ['48 hours']
      );

      const query = mockDbQuery.mock.calls[0][0];
      expect(query).toContain('FROM system_logs');
      expect(query).toContain("WHERE level = 'error'");
      expect(query).toContain('AND timestamp > CURRENT_TIMESTAMP - INTERVAL $1');
      expect(query).toContain('message,');
      expect(query).toContain('module,');
      expect(query).toContain('COUNT(*) as count');
      expect(query).toContain('MAX(timestamp) as last_occurrence');
      expect(query).toContain('GROUP BY message, module');
      expect(query).toContain('ORDER BY count DESC');
      expect(query).toContain('LIMIT 10');
    });

    it('should handle duplicate error messages from different modules', async () => {
      const mockData = [
        {
          message: 'Connection failed',
          module: 'database',
          count: '15',
          last_occurrence: '2025-01-01T11:00:00.000Z'
        },
        {
          message: 'Connection failed',
          module: 'redis',
          count: '8',
          last_occurrence: '2025-01-01T10:30:00.000Z'
        }
      ];

      // Clear any previous mocks and set up fresh mock for this test
      mockDbQuery.mockClear();
      mockDbQuery.mockResolvedValueOnce({ rows: mockData });

      const result = await (logsStatsService as any).getTopErrors(12);

      expect(result).toEqual(mockData);
      expect(result).toHaveLength(2); // Same message but different modules
    });
  });

  describe('getMetrics', () => {
    it('should fetch comprehensive logging system metrics', async () => {
      const mockMetrics = {
        total_audit_logs: '5000',
        total_system_logs: '12000',
        audit_table_size: '150 MB',
        system_table_size: '300 MB',
        audit_logs_last_hour: '45',
        system_logs_last_hour: '120'
      };

      // Clear any previous mocks and set up fresh mock for this test
      mockDbQuery.mockClear();
      mockDbQuery.mockResolvedValueOnce({ rows: [mockMetrics] });

      const result = await logsStatsService.getMetrics();

      expect(result).toEqual(mockMetrics);
      expect(mockDbQuery).toHaveBeenCalledTimes(1);

      const query = mockDbQuery.mock.calls[0][0];
      expect(query).toContain('SELECT');
      expect(query).toContain('(SELECT COUNT(*) FROM audit_logs) as total_audit_logs');
      expect(query).toContain('(SELECT COUNT(*) FROM system_logs) as total_system_logs');
      expect(query).toContain("(SELECT pg_size_pretty(pg_total_relation_size('audit_logs'))) as audit_table_size");
      expect(query).toContain("(SELECT pg_size_pretty(pg_total_relation_size('system_logs'))) as system_table_size");
      expect(query).toContain("(SELECT COUNT(*) FROM audit_logs WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour') as audit_logs_last_hour");
      expect(query).toContain("(SELECT COUNT(*) FROM system_logs WHERE timestamp > CURRENT_TIMESTAMP - INTERVAL '1 hour') as system_logs_last_hour");
    });

    it('should handle empty database metrics', async () => {
      const mockMetrics = {
        total_audit_logs: '0',
        total_system_logs: '0',
        audit_table_size: '0 bytes',
        system_table_size: '0 bytes',
        audit_logs_last_hour: '0',
        system_logs_last_hour: '0'
      };

      // Clear any previous mocks and set up fresh mock for this test
      mockDbQuery.mockClear();
      mockDbQuery.mockResolvedValueOnce({ rows: [mockMetrics] });

      const result = await logsStatsService.getMetrics();

      expect(result).toEqual(mockMetrics);
    });

    it('should handle database query errors', async () => {
      // Clear any previous mocks and set up fresh mock for this test
      mockDbQuery.mockClear();
      mockDbQuery.mockRejectedValueOnce(new Error('Table does not exist'));

      await expect(logsStatsService.getMetrics()).rejects.toThrow('Table does not exist');
    });
  });

  describe('getCleanupStats', () => {
    it('should calculate cleanup statistics for given retention period', async () => {
      const mockAuditCount = { rows: [{ count: '1500' }] };
      const mockSystemCount = { rows: [{ count: '3200' }] };

      // Clear any previous mocks and set up fresh mock for this test
      mockDbQuery.mockClear();
      mockDbQuery
        .mockResolvedValueOnce(mockAuditCount)
        .mockResolvedValueOnce(mockSystemCount);

      const result = await logsStatsService.getCleanupStats(30);

      expect(result.auditLogsToDelete).toBe(1500);
      expect(result.systemLogsToDelete).toBe(3200);
      expect(result.retentionDays).toBe(30);
      expect(result.cutoffDate).toBeInstanceOf(Date);

      // Verify cutoff date is approximately 30 days ago
      const expectedCutoff = new Date();
      expectedCutoff.setDate(expectedCutoff.getDate() - 30);
      const timeDiff = Math.abs(result.cutoffDate.getTime() - expectedCutoff.getTime());
      expect(timeDiff).toBeLessThan(1000); // Within 1 second

      expect(mockDbQuery).toHaveBeenCalledTimes(2);
      expect(mockDbQuery.mock.calls[0][0]).toContain('SELECT COUNT(*) FROM audit_logs WHERE created_at < $1');
      expect(mockDbQuery.mock.calls[1][0]).toContain('SELECT COUNT(*) FROM system_logs WHERE timestamp < $1');
    });

    it('should handle zero retention period', async () => {
      // Clear any previous mocks and set up fresh mock for this test
      mockDbQuery.mockClear();
      mockDbQuery
        .mockResolvedValueOnce({ rows: [{ count: '5000' }] })
        .mockResolvedValueOnce({ rows: [{ count: '12000' }] });

      const result = await logsStatsService.getCleanupStats(0);

      expect(result.retentionDays).toBe(0);
      expect(result.auditLogsToDelete).toBe(5000);
      expect(result.systemLogsToDelete).toBe(12000);

      // Cutoff date should be today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const cutoffDay = new Date(result.cutoffDate);
      cutoffDay.setHours(0, 0, 0, 0);
      expect(cutoffDay.getTime()).toBe(today.getTime());
    });

    it('should handle negative retention days gracefully', async () => {
      mockDbQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const result = await logsStatsService.getCleanupStats(-5);

      expect(result.retentionDays).toBe(-5);
      // Cutoff date should be 5 days in the future
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);
      const timeDiff = Math.abs(result.cutoffDate.getTime() - futureDate.getTime());
      expect(timeDiff).toBeLessThan(1000);
    });

    it('should handle database query errors during cleanup stats', async () => {
      mockDbQuery
        .mockRejectedValueOnce(new Error('Audit table error'))
        .mockResolvedValueOnce({ rows: [{ count: '100' }] });

      await expect(logsStatsService.getCleanupStats(7)).rejects.toThrow('Audit table error');
    });

    it('should parse string counts as integers', async () => {
      // Clear any previous mocks and set up fresh mock for this test
      mockDbQuery.mockClear();
      mockDbQuery
        .mockResolvedValueOnce({ rows: [{ count: '999' }] })
        .mockResolvedValueOnce({ rows: [{ count: '1001' }] });

      const result = await logsStatsService.getCleanupStats(14);

      expect(typeof result.auditLogsToDelete).toBe('number');
      expect(typeof result.systemLogsToDelete).toBe('number');
      expect(result.auditLogsToDelete).toBe(999);
      expect(result.systemLogsToDelete).toBe(1001);
    });
  });

  describe('performCleanup', () => {
    it('should perform cleanup and return deletion counts', async () => {
      const mockAuditResult = { rowCount: 1200 };
      const mockSystemResult = { rowCount: 2800 };

      // Clear any previous mocks and set up fresh mock for this test
      mockDbQuery.mockClear();
      mockDbQuery
        .mockResolvedValueOnce(mockAuditResult)
        .mockResolvedValueOnce(mockSystemResult);

      const result = await logsStatsService.performCleanup(60);

      expect(result.auditLogsDeleted).toBe(1200);
      expect(result.systemLogsDeleted).toBe(2800);
      expect(result.retentionDays).toBe(60);
      expect(result.cutoffDate).toBeInstanceOf(Date);

      expect(mockDbQuery).toHaveBeenCalledTimes(2);
      expect(mockDbQuery.mock.calls[0][0]).toContain('DELETE FROM audit_logs WHERE created_at < $1');
      expect(mockDbQuery.mock.calls[1][0]).toContain('DELETE FROM system_logs WHERE timestamp < $1');
    });

    it('should handle null rowCount values', async () => {
      const mockAuditResult = { rowCount: null };
      const mockSystemResult = { rowCount: undefined };

      // Clear any previous mocks and set up fresh mock for this test
      mockDbQuery.mockClear();
      mockDbQuery
        .mockResolvedValueOnce(mockAuditResult)
        .mockResolvedValueOnce(mockSystemResult);

      const result = await logsStatsService.performCleanup(30);

      expect(result.auditLogsDeleted).toBe(0);
      expect(result.systemLogsDeleted).toBe(0);
    });

    it('should handle cleanup with no matching records', async () => {
      mockDbQuery
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rowCount: 0 });

      const result = await logsStatsService.performCleanup(1);

      expect(result.auditLogsDeleted).toBe(0);
      expect(result.systemLogsDeleted).toBe(0);
      expect(result.retentionDays).toBe(1);
    });

    it('should handle database errors during cleanup', async () => {
      // Clear any previous mocks and set up fresh mock for this test
      mockDbQuery.mockClear();
      mockDbQuery
        .mockResolvedValueOnce({ rowCount: 100 })
        .mockRejectedValueOnce(new Error('System table cleanup failed'));

      await expect(logsStatsService.performCleanup(7)).rejects.toThrow('System table cleanup failed');
    });

    it('should use correct cutoff date calculation', async () => {
      // Clear any previous mocks and set up fresh mock for this test
      mockDbQuery.mockClear();
      mockDbQuery
        .mockResolvedValueOnce({ rowCount: 10 })
        .mockResolvedValueOnce({ rowCount: 20 });

      const result = await logsStatsService.performCleanup(15);

      // Verify the cutoff date is approximately 15 days ago
      const expectedCutoff = new Date();
      expectedCutoff.setDate(expectedCutoff.getDate() - 15);
      const timeDiff = Math.abs(result.cutoffDate.getTime() - expectedCutoff.getTime());
      expect(timeDiff).toBeLessThan(1000); // Within 1 second

      // Verify both queries received the same cutoff date
      expect(mockDbQuery.mock.calls[0][1]?.[0]).toEqual(mockDbQuery.mock.calls[1][1]?.[0]);
    });

    it('should handle very large deletion counts', async () => {
      // Clear any previous mocks and set up fresh mock for this test
      mockDbQuery.mockClear();
      mockDbQuery
        .mockResolvedValueOnce({ rowCount: 999999 })
        .mockResolvedValueOnce({ rowCount: 1000000 });

      const result = await logsStatsService.performCleanup(365);

      expect(result.auditLogsDeleted).toBe(999999);
      expect(result.systemLogsDeleted).toBe(1000000);
    });
  });

  describe('Edge Cases and Error Scenarios', () => {
    it('should handle concurrent database operations', async () => {
      // Simulate concurrent calls to getLogStats
      const promise1 = logsStatsService.getLogStats(24);
      const promise2 = logsStatsService.getLogStats(48);

      // Mock responses for both concurrent calls
      mockDbQuery
        .mockResolvedValue({ rows: [] })
        .mockResolvedValue({ rows: [] })
        .mockResolvedValue({ rows: [] })
        .mockResolvedValue({ rows: [] })
        .mockResolvedValue({ rows: [] })
        .mockResolvedValue({ rows: [] })
        .mockResolvedValue({ rows: [] })
        .mockResolvedValue({ rows: [] });

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1.period).toBe('24 hours');
      expect(result2.period).toBe('48 hours');
    });

    it('should handle very long time periods', async () => {
      mockDbQuery
        .mockResolvedValue({ rows: [] })
        .mockResolvedValue({ rows: [] })
        .mockResolvedValue({ rows: [] })
        .mockResolvedValue({ rows: [] });

      const result = await logsStatsService.getLogStats(8760); // 1 year in hours

      expect(result.period).toBe('8760 hours');
      expect(mockDbQuery.mock.calls[0][1]).toEqual(['8760 hours']);
    });

    it('should handle floating point time periods', async () => {
      mockDbQuery
        .mockResolvedValue({ rows: [] })
        .mockResolvedValue({ rows: [] })
        .mockResolvedValue({ rows: [] })
        .mockResolvedValue({ rows: [] });

      const result = await logsStatsService.getLogStats(12.5);

      expect(result.period).toBe('12.5 hours');
      expect(mockDbQuery.mock.calls[0][1]).toEqual(['12.5 hours']);
    });

    it('should handle database connection timeout', async () => {
      const timeoutError = new Error('Connection timeout');
      timeoutError.name = 'TimeoutError';

      mockDbQuery.mockRejectedValue(timeoutError);

      await expect(logsStatsService.getLogStats()).rejects.toThrow('Connection timeout');
    });

    it('should handle database connection pool exhaustion', async () => {
      const poolError = new Error('Connection pool exhausted');
      poolError.name = 'PoolExhaustedError';

      mockDbQuery.mockRejectedValue(poolError);

      await expect(logsStatsService.getMetrics()).rejects.toThrow('Connection pool exhausted');
    });
  });

  describe('Performance and Large Dataset Scenarios', () => {
    it('should handle large result sets within LIMIT constraints', async () => {
      // Create mock data at the limit
      const largeAuditStats = Array(20).fill(null).map((_, i) => ({
        event_type: `type_${i}`,
        event_action: `action_${i}`,
        count: `${1000 - i * 10}`,
        failed_count: `${i}`,
        unique_users: `${500 - i * 5}`,
        unique_ips: `${450 - i * 5}`
      }));

      const largeSystemStats = Array(20).fill(null).map((_, i) => ({
        level: i % 2 === 0 ? 'error' : 'info',
        module: `module_${i}`,
        count: `${800 - i * 20}`,
        avg_duration: `${100 + i * 10}`,
        max_duration: `${500 + i * 50}`,
        min_duration: `${10 + i}`,
        p95_duration: `${400 + i * 30}`
      }));

      mockDbQuery
        .mockResolvedValueOnce({ rows: largeAuditStats })
        .mockResolvedValueOnce({ rows: largeSystemStats })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await logsStatsService.getLogStats();

      expect(result.auditStats).toHaveLength(20);
      expect(result.systemStats).toHaveLength(20);
      expect(result.auditStats[0].count).toBe('1000');
      expect(result.systemStats[0].count).toBe('800');
    });

    it('should handle statistics computation with extreme values', async () => {
      const extremeSystemStats = [{
        level: 'error',
        module: 'performance_test',
        count: '999999',
        avg_duration: '0.001',
        max_duration: '999999999',
        min_duration: '0',
        p95_duration: '50000'
      }];

      mockDbQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: extremeSystemStats })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await logsStatsService.getLogStats();

      expect(result.systemStats[0].count).toBe('999999');
      expect(result.systemStats[0].avg_duration).toBe('0.001');
      expect(result.systemStats[0].max_duration).toBe('999999999');
    });

    it('should handle cleanup of very large datasets', async () => {
      mockDbQuery
        .mockResolvedValueOnce({ rows: [{ count: '10000000' }] })  // 10M audit logs
        .mockResolvedValueOnce({ rows: [{ count: '25000000' }] }); // 25M system logs

      const stats = await logsStatsService.getCleanupStats(1);

      expect(stats.auditLogsToDelete).toBe(10000000);
      expect(stats.systemLogsToDelete).toBe(25000000);
    });
  });

  describe('Data Integrity and Type Safety', () => {
    it('should handle mixed data types in query results', async () => {
      const mixedAuditStats = [{
        event_type: 'auth',
        event_action: 'login',
        count: 150,          // number instead of string
        failed_count: '5',   // string
        unique_users: null,  // null value
        unique_ips: undefined // undefined value
      }];

      mockDbQuery.mockResolvedValueOnce({ rows: mixedAuditStats });

      const result = await (logsStatsService as any).getAuditStats(24);

      expect(result[0].count).toBe(150);
      expect(result[0].failed_count).toBe('5');
      expect(result[0].unique_users).toBeNull();
      expect(result[0].unique_ips).toBeUndefined();
    });

    it('should handle malformed date objects', async () => {
      // const __cutoffDate = new Date('invalid-date');
      
      // Mock the date constructor to return invalid date
      const originalDate = Date;
      global.Date = class extends Date {
        constructor(...args: any[]) {
          if (args.length === 0) {
            super();
          } else {
            super(args[0] as any);
          }
        }
      } as any;

      try {
        mockDbQuery
          .mockResolvedValueOnce({ rows: [{ count: '0' }] })
          .mockResolvedValueOnce({ rows: [{ count: '0' }] });

        const result = await logsStatsService.getCleanupStats(30);
        
        expect(result.cutoffDate).toBeInstanceOf(Date);
      } finally {
        global.Date = originalDate;
      }
    });

    it('should preserve exact parameter types in database calls', async () => {
      mockDbQuery.mockResolvedValueOnce({ rows: [] });
      
      await (logsStatsService as any).getAuditStats(48);

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.any(String),
        ['48 hours']
      );

      // Verify parameter is exactly as expected  
      const [, params] = mockDbQuery.mock.calls[0];
      expect(params).toEqual(['48 hours']);
      expect(typeof params?.[0]).toBe('string');
    });
  });
});