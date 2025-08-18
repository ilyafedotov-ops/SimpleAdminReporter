import { LogsService } from './logs.service';
import { db } from '@/config/database';
// import { QueryBuilder } from './query/QueryBuilder';
import { logsCacheService } from './logs-cache.service';
import { queryMetricsService } from './query-metrics.service';

jest.mock('@/config/database', () => ({
  db: {
    query: jest.fn()
  }
}));

jest.mock('@/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn()
  }
}));

jest.mock('./logs-cache.service', () => ({
  logsCacheService: {
    getCachedAuditLogs: jest.fn(),
    getCachedSystemLogs: jest.fn(),
    cacheAuditLogs: jest.fn(),
    cacheSystemLogs: jest.fn()
  }
}));

jest.mock('./query-metrics.service', () => ({
  queryMetricsService: {
    recordQueryMetric: jest.fn()
  }
}));

jest.mock('./materialized-views.service', () => ({
  materializedViewsService: {
    isEnabled: jest.fn().mockReturnValue(true)
  }
}));

describe('LogsService', () => {
  let logsService: LogsService;
  const mockDbQuery = db.query as jest.MockedFunction<typeof db.query>;
  const mockLogsCacheService = logsCacheService as jest.Mocked<typeof logsCacheService>;
  const mockQueryMetricsService = queryMetricsService as jest.Mocked<typeof queryMetricsService>;

  beforeEach(() => {
    jest.clearAllMocks();
    logsService = new LogsService();
    
    // Configure cache service to return null (no cache) by default
    mockLogsCacheService.getCachedAuditLogs.mockResolvedValue(null);
    mockLogsCacheService.getCachedSystemLogs.mockResolvedValue(null);
    mockLogsCacheService.cacheAuditLogs.mockResolvedValue(undefined);
    mockLogsCacheService.cacheSystemLogs.mockResolvedValue(undefined);
    
    // Configure metrics service to succeed by default
    mockQueryMetricsService.recordQueryMetric.mockResolvedValue(undefined);
  });

  describe('getAuditLogs', () => {
    it('should fetch audit logs with basic query', async () => {
      mockDbQuery
        .mockResolvedValueOnce({ rows: [{ count: '10' }] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              event_type: 'auth',
              event_action: 'login',
              username: 'testuser',
              created_at: new Date('2025-01-01')
            }
          ]
        });

      const result = await logsService.getAuditLogs({ page: 1, pageSize: 50 });

      expect(result.total).toBe(10);
      expect(result.logs).toHaveLength(1);
      expect(result.logs[0].event_type).toBe('auth');
      expect(mockDbQuery).toHaveBeenCalledTimes(2);
    });

    it('should apply filters correctly', async () => {
      mockDbQuery
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })
        .mockResolvedValueOnce({ rows: [] });

      await logsService.getAuditLogs({
        eventType: 'auth',
        eventAction: 'login',
        userId: 123,
        correlationId: 'test-correlation',
        startDate: '2025-01-01',
        endDate: '2025-01-31'
      });

      const countQuery = mockDbQuery.mock.calls[0];
      expect(countQuery[0]).toContain('FROM "audit_logs"');
      expect(countQuery[0]).toContain('WHERE');
      expect(countQuery[1]).toContain('auth');
      expect(countQuery[1]).toContain('login');
      expect(countQuery[1]).toContain(123);
      expect(countQuery[1]).toContain('test-correlation');
    });

    it('should handle search parameter', async () => {
      mockDbQuery
        .mockResolvedValueOnce({ rows: [{ count: '3' }] })
        .mockResolvedValueOnce({ rows: [] });

      await logsService.getAuditLogs({ search: 'admin' });

      const searchQuery = mockDbQuery.mock.calls[0];
      expect(searchQuery[0]).toContain('username ILIKE');
      expect(searchQuery[0]).toContain('event_action ILIKE');
      expect(searchQuery[0]).toContain('resource_type ILIKE');
      expect(searchQuery[0]).toContain('details::text ILIKE');
      expect(searchQuery[1]).toContain('%admin%');
    });

    it('should sanitize sensitive data in logs', async () => {
      mockDbQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            details: {
              password: 'secret123',
              token: 'abc123',
              username: 'testuser'
            }
          }]
        });

      const result = await logsService.getAuditLogs({});

      expect(result.logs[0].details.password).toBe('[REDACTED]');
      expect(result.logs[0].details.token).toBe('[REDACTED]');
      expect(result.logs[0].details.username).toBe('testuser');
    });

    it('should validate and use allowed sort columns', async () => {
      mockDbQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [] });

      await logsService.getAuditLogs({ sortBy: 'username', sortOrder: 'asc' });

      const dataQuery = mockDbQuery.mock.calls[1];
      expect(dataQuery[0]).toContain('ORDER BY "username" ASC');
    });

    it('should default to created_at for invalid sort column', async () => {
      mockDbQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [] });

      await logsService.getAuditLogs({ sortBy: 'invalid_column' });

      const dataQuery = mockDbQuery.mock.calls[1];
      // The implementation uses materialized view with timestamp field when available
      expect(dataQuery[0]).toMatch(/ORDER BY ("created_at"|"timestamp") DESC/);
    });

    it('should handle pagination correctly', async () => {
      mockDbQuery
        .mockResolvedValueOnce({ rows: [{ count: '100' }] })
        .mockResolvedValueOnce({ rows: [] });

      await logsService.getAuditLogs({ page: 3, pageSize: 20 }, 40);

      const dataQuery = mockDbQuery.mock.calls[1];
      expect(dataQuery[0]).toContain('LIMIT 20');
      expect(dataQuery[0]).toContain('OFFSET 40');
    });
  });

  describe('getSystemLogs', () => {
    it('should fetch system logs with basic query', async () => {
      mockDbQuery
        .mockResolvedValueOnce({ rows: [{ count: '15' }] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              level: 'error',
              message: 'Test error',
              timestamp: new Date('2025-01-01'),
              module: 'auth'
            }
          ]
        });

      const result = await logsService.getSystemLogs({ page: 1, pageSize: 50 });

      expect(result.total).toBe(15);
      expect(result.logs).toHaveLength(1);
      expect(result.logs[0].level).toBe('error');
    });

    it('should apply system log filters', async () => {
      mockDbQuery
        .mockResolvedValueOnce({ rows: [{ count: '7' }] })
        .mockResolvedValueOnce({ rows: [] });

      await logsService.getSystemLogs({
        level: 'error',
        module: 'auth',
        userId: 456,
        correlationId: 'req-123'
      });

      const countQuery = mockDbQuery.mock.calls[0];
      expect(countQuery[1]).toContain('error');
      expect(countQuery[1]).toContain('auth');
      expect(countQuery[1]).toContain(456);
      expect(countQuery[1]).toContain('req-123');
    });

    it('should handle system log search', async () => {
      mockDbQuery
        .mockResolvedValueOnce({ rows: [{ count: '2' }] })
        .mockResolvedValueOnce({ rows: [] });

      await logsService.getSystemLogs({ search: 'database' });

      const countQuery = mockDbQuery.mock.calls[0];
      expect(countQuery[0]).toContain('message ILIKE');
      expect(countQuery[0]).toContain('module ILIKE');
      expect(countQuery[0]).toContain('url ILIKE');
      expect(countQuery[0]).toContain('metadata::text ILIKE');
      expect(countQuery[1]).toContain('%database%');
    });

    it('should validate system log sort columns', async () => {
      mockDbQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [] });

      await logsService.getSystemLogs({ sortBy: 'level' });

      const dataQuery = mockDbQuery.mock.calls[1];
      expect(dataQuery[0]).toContain('ORDER BY "level" DESC');
    });

    it('should sanitize nested sensitive data', async () => {
      mockDbQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            metadata: {
              headers: {
                authorization: 'Bearer secret',
                'x-apikey': 'key123'
              },
              body: {
                creditCard: '1234-5678-9012-3456'
              }
            }
          }]
        });

      const result = await logsService.getSystemLogs({});

      expect(result.logs[0].metadata.headers['x-apikey']).toBe('[REDACTED]');
      expect(result.logs[0].metadata.body.creditCard).toBe('[REDACTED]');
    });
  });

  describe('getCombinedLogs', () => {
    it('should fetch only audit logs when type is audit', async () => {
      mockDbQuery
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await logsService.getCombinedLogs({ type: 'audit' });

      expect(result.totalAudit).toBe(5);
      expect(result.totalSystem).toBe(0);
      expect(result.system).toEqual([]);
      expect(mockDbQuery).toHaveBeenCalledTimes(2);
    });

    it('should fetch only system logs when type is system', async () => {
      mockDbQuery
        .mockResolvedValueOnce({ rows: [{ count: '8' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await logsService.getCombinedLogs({ type: 'system' });

      expect(result.totalSystem).toBe(8);
      expect(result.totalAudit).toBe(0);
      expect(result.audit).toEqual([]);
      expect(mockDbQuery).toHaveBeenCalledTimes(2);
    });

    it('should fetch both log types when type is all', async () => {
      // Mock combined query result with mixed log types
      mockDbQuery
        .mockResolvedValueOnce({ 
          rows: [
            { log_type: 'audit', id: 1, event_type: 'auth', timestamp: new Date() },
            { log_type: 'system', id: 2, level: 'info', timestamp: new Date() }
          ] 
        })
        .mockResolvedValueOnce({ 
          rows: [{ audit_count: 5, system_count: 8 }] 
        });

      const result = await logsService.getCombinedLogs({ type: 'all' });

      expect(result.totalAudit).toBe(5);
      expect(result.totalSystem).toBe(8);
      expect(mockDbQuery).toHaveBeenCalledTimes(2);
    });

    it('should handle pagination for combined logs', async () => {
      mockDbQuery
        .mockResolvedValueOnce({ rows: [{ count: '100' }] })
        .mockResolvedValueOnce({ rows: [] });

      await logsService.getCombinedLogs({ type: 'audit', page: 5, pageSize: 10 });

      expect(mockDbQuery).toHaveBeenCalledTimes(2);
    });
  });

  describe('sanitizeLogs', () => {
    it('should sanitize array of logs', () => {
      const logs = [
        {
          id: 1,
          details: { password: 'secret', name: 'test' },
          metadata: { apikey: 'key123', info: 'safe' }
        },
        {
          id: 2,
          details: null,
          metadata: { token: 'token123' }
        }
      ];

      const sanitized = logsService.sanitizeLogs(logs);

      expect(sanitized[0].details.password).toBe('[REDACTED]');
      expect(sanitized[0].details.name).toBe('test');
      expect(sanitized[0].metadata.apikey).toBe('[REDACTED]');
      expect(sanitized[0].metadata.info).toBe('safe');
      expect(sanitized[1].details).toBeUndefined();
      expect(sanitized[1].metadata.token).toBe('[REDACTED]');
    });

    it('should handle non-object values', () => {
      const logs = [
        { id: 1, details: 'string value' },
        { id: 2, details: 123 },
        { id: 3, details: null }
      ];

      const sanitized = logsService.sanitizeLogs(logs);

      expect(sanitized[0].details).toBe('string value');
      expect(sanitized[1].details).toBe(123);
      expect(sanitized[2].details).toBeUndefined();
    });

    it('should sanitize deeply nested objects', () => {
      const logs = [{
        id: 1,
        details: {
          user: {
            profile: {
              secret: 'hidden',
              public: 'visible'
            }
          }
        }
      }];

      const sanitized = logsService.sanitizeLogs(logs);

      expect(sanitized[0].details.user.profile.secret).toBe('[REDACTED]');
      expect(sanitized[0].details.user.profile.public).toBe('visible');
    });
  });

  describe('Error handling', () => {
    it('should handle database query errors', async () => {
      // Mock cache to return null (no cache hit)
      mockLogsCacheService.getCachedAuditLogs.mockResolvedValueOnce(null);
      
      // Mock database to reject the count query
      mockDbQuery.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(logsService.getAuditLogs({})).rejects.toThrow('Database connection failed');
    });

    it('should handle invalid date formats', async () => {
      mockDbQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await logsService.getAuditLogs({
        startDate: 'invalid-date',
        endDate: 'also-invalid'
      });

      expect(result.logs).toEqual([]);
    });
  });

  describe('buildAuditSearchQuery', () => {
    it('should build search query with existing WHERE clause', async () => {
      mockDbQuery
        .mockResolvedValueOnce({ rows: [{ count: '2' }] })
        .mockResolvedValueOnce({ rows: [] });

      await logsService.getAuditLogs({
        eventType: 'auth',
        search: 'admin'
      });

      const searchQuery = mockDbQuery.mock.calls[0][0];
      expect(searchQuery).toContain('WHERE');
      expect(searchQuery).toContain('username ILIKE');
      expect(searchQuery).toContain('AND (');
    });
  });

  describe('Performance', () => {
    it('should respect pageSize limits', async () => {
      mockDbQuery
        .mockResolvedValueOnce({ rows: [{ count: '1000' }] })
        .mockResolvedValueOnce({ rows: [] });

      await logsService.getAuditLogs({ pageSize: 100 });

      const dataQuery = mockDbQuery.mock.calls[1];
      expect(dataQuery[0]).toContain('LIMIT 100');
    });

    it('should use default pageSize when not provided', async () => {
      mockDbQuery
        .mockResolvedValueOnce({ rows: [{ count: '100' }] })
        .mockResolvedValueOnce({ rows: [] });

      await logsService.getAuditLogs({});

      const dataQuery = mockDbQuery.mock.calls[1];
      expect(dataQuery[0]).toContain('LIMIT 50');
    });
  });
});