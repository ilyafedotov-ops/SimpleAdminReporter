import request from 'supertest';
import express from 'express';
import { LogsController } from './logs.controller';
import { logsService } from '@/services/logs.service';
import { logsStatsService } from '@/services/logs-stats.service';
import { logsExportService } from '@/services/logs-export.service';
import { requireAuth } from '@/middleware/auth-wrapper';
import { validateRequest } from '@/middleware/validation.middleware';
import { db } from '@/config/database';

jest.mock('@/services/logs.service');
jest.mock('@/services/logs-stats.service');
jest.mock('@/services/logs-export.service');
jest.mock('@/middleware/auth-wrapper');
jest.mock('@/middleware/validation.middleware');
jest.mock('@/utils/logger');
jest.mock('@/config/database');
jest.mock('@/services/socket.service');
jest.mock('@/config/logging.config', () => ({
  loggingConfig: {
    retention: {
      defaultDays: 90
    },
    query: {
      maxPageSize: 500
    },
    export: {
      chunkSize: 1000
    }
  }
}));

describe('LogsController Integration Tests', () => {
  let app: express.Application;
  let logsController: LogsController;

  const mockUser = {
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
    role: 'user'
  };


  beforeEach(() => {
    jest.clearAllMocks();
    
    app = express();
    app.use(express.json());
    
    logsController = new LogsController();

    (requireAuth as jest.Mock).mockImplementation((req: any, res, _next) => {
      req.user = mockUser;
      _next();
    });

    (validateRequest as jest.Mock).mockImplementation((_schema: any) => (req: any, res: any, _next: any) => _next());

    // Create router and register routes
    const router = express.Router();
    router.get('/', (req, res) => logsController.getLogs(req as any, res));
    router.get('/stats', (req, res) => logsController.getLogStats(req as any, res));
    router.get('/export', (req, res) => logsController.exportLogs(req as any, res));
    router.delete('/cleanup', (req, res) => logsController.cleanupOldLogs(req as any, res));
    router.get('/metrics', (req, res) => logsController.getMetrics(req as any, res));
    router.get('/:id', (req, res) => logsController.getLogDetails(req as any, res));
    
    app.use('/api/logs', router);
    
    // Add error middleware
    app.use((err: any, req: any, res: any, _next: any) => {
      const statusCode = err.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        error: err.message || 'Internal Server Error'
      });
    });
  });

  describe('GET /api/logs', () => {
    it('should return logs with default parameters', async () => {
      const mockLogs = {
        audit: [{ id: 1, event_type: 'auth', event_action: 'login' }],
        system: [{ id: 2, level: 'info', message: 'Test log' }],
        totalAudit: 1,
        totalSystem: 1
      };

      (logsService.getCombinedLogs as jest.Mock).mockResolvedValueOnce(mockLogs);

      const response = await request(app)
        .get('/api/logs')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockLogs);
      expect(response.body.pagination).toBeDefined();
      expect(response.body.meta).toBeDefined();

      expect(logsService.getCombinedLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'all',
          page: 1,
          pageSize: 50,
          sortBy: 'timestamp',
          sortOrder: 'desc'
        })
      );
    });

    it('should handle query parameters', async () => {
      (logsService.getCombinedLogs as jest.Mock).mockResolvedValueOnce({
        audit: [],
        system: [],
        totalAudit: 0,
        totalSystem: 0
      });

      await request(app)
        .get('/api/logs')
        .query({
          type: 'audit',
          level: 'error',
          eventType: 'auth',
          page: 2,
          pageSize: 25,
          sortBy: 'created_at',
          sortOrder: 'asc',
          search: 'login failed'
        })
        .expect(200);

      expect(logsService.getCombinedLogs).toHaveBeenCalledWith({
        type: 'audit',
        level: 'error',
        eventType: 'auth',
        page: 2,
        pageSize: 25,
        sortBy: 'created_at',
        sortOrder: 'asc',
        search: 'login failed'
      });
    });

    it('should handle date range filters', async () => {
      (logsService.getCombinedLogs as jest.Mock).mockResolvedValueOnce({
        audit: [],
        system: [],
        totalAudit: 0,
        totalSystem: 0
      });

      await request(app)
        .get('/api/logs')
        .query({
          startDate: '2025-01-01',
          endDate: '2025-01-31'
        })
        .expect(200);

      expect(logsService.getCombinedLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          startDate: '2025-01-01',
          endDate: '2025-01-31'
        })
      );
    });

    it('should handle service errors', async () => {
      (logsService.getCombinedLogs as jest.Mock).mockRejectedValueOnce(
        new Error('Database error')
      );

      const response = await request(app)
        .get('/api/logs')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Failed to fetch logs'
      });
    });
  });

  describe('GET /api/logs/stats', () => {
    it('should return log statistics', async () => {
      const mockStats = {
        errorCount: 10,
        warningCount: 25,
        infoCount: 100,
        totalCount: 135,
        errorTrend: [
          { hour: '2025-01-01T10:00:00Z', count: 5 },
          { hour: '2025-01-01T11:00:00Z', count: 3 }
        ]
      };

      (logsStatsService.getLogStats as jest.Mock).mockResolvedValueOnce(mockStats);

      const response = await request(app)
        .get('/api/logs/stats')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: mockStats
      });
    });

    it('should pass time range to stats service', async () => {
      (logsStatsService.getLogStats as jest.Mock).mockResolvedValueOnce({});

      await request(app)
        .get('/api/logs/stats')
        .query({ hours: '168' }) // 7 days = 168 hours
        .expect(200);

      expect(logsStatsService.getLogStats).toHaveBeenCalledWith(168);
    });
  });

  // Streaming tests removed - not implemented in controller

  describe('GET /api/logs/export', () => {
    it('should export logs with default format', async () => {
      (logsExportService.streamExport as jest.Mock).mockImplementation((res, _params, _format) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename=logs.json');
        res.write('{}');
        res.end();
        return Promise.resolve();
      });

      const response = await request(app)
        .get('/api/logs/export')
        .expect(200);
        
      expect(response.headers['content-type']).toBe('application/json');
    });

    it('should export logs in CSV format', async () => {

      (logsExportService.streamExport as jest.Mock).mockImplementation((res, _params, _format) => {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=logs-export-2025-01-01.csv');
        res.write('log1,log2,log3');
        res.end();
        return Promise.resolve();
      });

      const response = await request(app)
        .get('/api/logs/export')
        .query({ format: 'csv' })
        .expect(200);

      expect(response.headers['content-type']).toBe('text/csv');
      expect(response.headers['content-disposition']).toContain('attachment; filename=logs-export-2025-01-01.csv');
      expect(response.text).toBe('log1,log2,log3');
    });

    it('should handle export parameters', async () => {

      (logsExportService.streamExport as jest.Mock).mockImplementation((res, _params, _format) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename=logs.json');
        res.write('{}');
        res.end();
        return Promise.resolve();
      });

      await request(app)
        .get('/api/logs/export')
        .query({
          format: 'json',
          type: 'audit',
          startDate: '2025-01-01',
          endDate: '2025-01-31',
          maxRecords: 1000
        })
        .expect(200);

      expect(logsExportService.streamExport).toHaveBeenCalledWith(
        expect.any(Object), // response object
        expect.objectContaining({
          type: 'audit',
          startDate: '2025-01-01',
          endDate: '2025-01-31'
        }),
        'json',
        1000
      );
    });
  });

  describe('GET /api/logs/metrics', () => {
    it('should return metrics', async () => {

      const mockMetrics = {
        queryPerformance: {
          avgResponseTime: 45,
          p95ResponseTime: 120,
          p99ResponseTime: 250
        },
        storageMetrics: {
          totalSize: '1.2GB',
          auditLogsSize: '800MB',
          systemLogsSize: '400MB'
        }
      };

      (logsStatsService.getMetrics as jest.Mock).mockResolvedValueOnce(mockMetrics);
      
      // Mock socketService
      const mockSocketService = require('@/services/socket.service').socketService;
      mockSocketService.getStats = jest.fn().mockReturnValue({
        totalConnections: 5
      });

      const response = await request(app)
        .get('/api/logs/metrics')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.database).toEqual(mockMetrics);
    });
  });

  describe('POST /api/logs/cleanup', () => {
    it('should cleanup old logs', async () => {

      (logsStatsService.performCleanup as jest.Mock).mockResolvedValueOnce({
        deletedAuditLogs: 1000,
        deletedSystemLogs: 5000,
        freedSpace: '2.5GB'
      });

      const response = await request(app)
        .delete('/api/logs/cleanup?retentionDays=30')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.dryRun).toBe(false);
      expect(response.body.data.deletedAuditLogs).toBe(1000);
      expect(response.body.data.deletedSystemLogs).toBe(5000);
      expect(response.body.data.freedSpace).toBe('2.5GB');

      expect(logsStatsService.performCleanup).toHaveBeenCalledWith(30);
    });

    it('should use default retention days', async () => {

      (logsStatsService.performCleanup as jest.Mock).mockResolvedValueOnce({
        deletedAuditLogs: 0,
        deletedSystemLogs: 0,
        freedSpace: '0B'
      });

      await request(app)
        .delete('/api/logs/cleanup')
        .expect(200);

      expect(logsStatsService.performCleanup).toHaveBeenCalledWith(90); // Default from loggingConfig
    });
  });

  describe('GET /api/logs/:id', () => {
    it('should return specific log details', async () => {
      const mockLog = {
        id: 123,
        event_type: 'auth',
        event_action: 'login',
        details: { ip: '192.168.1.1' }
      };

      (db.query as jest.Mock).mockResolvedValueOnce({
        rows: [mockLog]
      });
      
      // Mock sanitizeLogs
      (logsService.sanitizeLogs as jest.Mock).mockReturnValueOnce([mockLog]);

      const response = await request(app)
        .get('/api/logs/123?type=audit')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockLog);
    });

    it('should handle log not found', async () => {
      (db.query as jest.Mock).mockResolvedValueOnce({
        rows: []
      });

      const response = await request(app)
        .get('/api/logs/999?type=audit')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Log entry not found');
    });

    it('should handle invalid log type', async () => {
      const response = await request(app)
        .get('/api/logs/123') // Missing type parameter
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid log type. Must be "audit" or "system"');
    });
  });


  describe('Error handling', () => {
    it('should handle middleware errors', async () => {
      (requireAuth as jest.Mock).mockImplementationOnce((req, res, _next) => {
        _next(new Error('Authentication failed'));
      });

      const response = await request(app)
        .get('/api/logs')
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });

  });

  describe('Correlation ID tracking', () => {
    it('should pass correlation ID to service', async () => {
      (logsService.getCombinedLogs as jest.Mock).mockResolvedValueOnce({
        audit: [],
        system: [],
        totalAudit: 0,
        totalSystem: 0
      });

      await request(app)
        .get('/api/logs')
        .query({ correlationId: 'test-correlation-123' })
        .expect(200);

      expect(logsService.getCombinedLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          correlationId: 'test-correlation-123'
        })
      );
    });
  });
});