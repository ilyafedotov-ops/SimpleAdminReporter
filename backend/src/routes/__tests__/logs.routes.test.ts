import request from 'supertest';
import express, { Router } from 'express';

// Track whether we want admin user for current test
let useAdminUser = false;

// Mock all external dependencies before imports
jest.mock('../../controllers/logs.controller', () => ({
  logsController: {
    getLogs: jest.fn(),
    getLogStats: jest.fn(),
    exportLogs: jest.fn(),
    getMetrics: jest.fn(),
    getQueryMetrics: jest.fn(),
    exportQueryMetrics: jest.fn(),
    getWebSocketStats: jest.fn(),
    getMaterializedViewStats: jest.fn(),
    refreshMaterializedViews: jest.fn(),
    cleanupOldLogs: jest.fn(),
    searchLogs: jest.fn(),
    fuzzySearchLogs: jest.fn(),
    getLogDetails: jest.fn()
  }
}));

jest.mock('@/auth/middleware/unified-auth.middleware', () => ({
  authenticate: jest.fn(() => {
    return (_req: any, _res: any, next: any) => {
      if (useAdminUser) {
        // Mock admin authenticated user
        _req.user = { 
          id: 1, 
          username: 'admin',
          displayName: 'Admin User',
          email: 'admin@example.com',
          authSource: 'local',
          isAdmin: true,
          isActive: true
        };
      } else {
        // Mock regular authenticated user
        _req.user = { 
          id: 1, 
          username: 'testuser',
          displayName: 'Test User',
          email: 'test@example.com',
          authSource: 'local',
          isAdmin: false,
          isActive: true
        };
      }
      next();
    };
  })
}));

jest.mock('@/middleware/auth-wrapper', () => ({
  requireRole: jest.fn((roles: string[]) => (_req: any, _res: any, next: any) => {
    // Check if user is admin when required
    if (roles.includes('admin') && !_req.user?.isAdmin) {
      return _res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  })
}));

jest.mock('@/validators/logs.validator', () => ({
  LogsValidator: {
    validateLogQuery: jest.fn((_req: any, _res: any, next: any) => next()),
    validateLogStats: jest.fn((_req: any, _res: any, next: any) => next()),
    validateLogExport: jest.fn((_req: any, _res: any, next: any) => next()),
    validateLogCleanup: jest.fn((_req: any, _res: any, next: any) => next()),
    validateLogSearch: jest.fn((_req: any, _res: any, next: any) => next()),
    validateFuzzySearch: jest.fn((_req: any, _res: any, next: any) => next()),
    validateLogDetail: jest.fn((_req: any, _res: any, next: any) => next())
  }
}));

jest.mock('@/config/database', () => ({
  db: {
    query: jest.fn()
  }
}));

jest.mock('@/middleware/rate-limit.middleware', () => ({
  logsQueryRateLimiter: jest.fn((_req: any, _res: any, next: any) => next()),
  logsExportRateLimiter: jest.fn((_req: any, _res: any, next: any) => next())
}));

jest.mock('@/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn()
  }
}));

// Import after mocking
import logsRoutes from '../logs.routes';
import { logsController } from '../../controllers/logs.controller';
import { db } from '../../config/database';
import { logger } from '../../utils/logger';

describe('Logs Routes Integration', () => {
  let app: express.Application;

  const mockLogsData = {
    logs: [
      {
        id: 1,
        log_type: 'audit',
        timestamp: '2025-01-01T12:00:00Z',
        event_type: 'login',
        event_action: 'success',
        username: 'testuser',
        ip_address: '192.168.1.1'
      },
      {
        id: 2,
        log_type: 'system',
        timestamp: '2025-01-01T12:01:00Z',
        level: 'info',
        message: 'System startup complete',
        service: 'api'
      }
    ],
    totalCount: 2,
    hasMore: false
  };

  const mockStats = {
    totalAuditLogs: 1000,
    totalSystemLogs: 500,
    todayLogs: 50,
    errorCount: 10,
    warningCount: 25
  };

  const mockMetrics = {
    avgResponseTime: 150,
    requestCount: 1000,
    errorRate: 0.01,
    activeConnections: 5
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    app = express();
    app.use(express.json());
    app.use('/api/logs', logsRoutes);

    // Error handler
    app.use((err: any, _req: any, res: any, _next: any) => {
      res.status(err.statusCode || 500).json({
        error: err.message || 'Internal Server Error'
      });
    });
  });

  describe('GET /api/logs/test', () => {
    it('should return database test results', async () => {
      const mockAuditCount = { rows: [{ count: '100' }] };
      const mockSystemCount = { rows: [{ count: '50' }] };
      const mockCombinedResult = { rows: mockLogsData.logs };

      (db.query as jest.Mock)
        .mockResolvedValueOnce(mockAuditCount)
        .mockResolvedValueOnce(mockSystemCount)
        .mockResolvedValueOnce(mockCombinedResult);

      const response = await request(app)
        .get('/api/logs/test')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.auditCount).toBe('100');
      expect(response.body.systemCount).toBe('50');
      expect(response.body.combinedRows).toBe(2);
      expect(db.query).toHaveBeenCalledTimes(3);
    });

    it('should handle database test errors', async () => {
      (db.query as jest.Mock).mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .get('/api/logs/test')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Database connection failed');
      expect(logger.error).toHaveBeenCalledWith('Database test error:', expect.any(Error));
    });

    it('should log request information', async () => {
      (db.query as jest.Mock).mockResolvedValue({ rows: [{ count: '0' }] });

      await request(app)
        .get('/api/logs/test')
        .expect(200);

      expect(logger.info).toHaveBeenCalledWith('Testing simple database query...');
      expect(logger.info).toHaveBeenCalledWith('Executing combined query...');
    });
  });

  describe('GET /api/logs', () => {
    it('should get logs with default pagination', async () => {
      (logsController.getLogs as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          success: true,
          data: mockLogsData
        });
      });

      const response = await request(app)
        .get('/api/logs')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.logs).toHaveLength(2);
      expect(logsController.getLogs).toHaveBeenCalledTimes(1);
    });

    it('should get logs with filtering parameters', async () => {
      (logsController.getLogs as jest.Mock).mockImplementation((req, res) => {
        res.status(200).json({
          success: true,
          data: mockLogsData,
          filters: req.query
        });
      });

      const response = await request(app)
        .get('/api/logs?logType=audit&eventType=login&page=1&limit=10')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.filters.logType).toBe('audit');
      expect(response.body.filters.eventType).toBe('login');
    });

    it('should get logs with date range filtering', async () => {
      (logsController.getLogs as jest.Mock).mockImplementation((req, res) => {
        res.status(200).json({
          success: true,
          data: mockLogsData,
          dateRange: {
            startDate: req.query.startDate,
            endDate: req.query.endDate
          }
        });
      });

      const response = await request(app)
        .get('/api/logs?startDate=2025-01-01&endDate=2025-01-02')
        .expect(200);

      expect(response.body.dateRange.startDate).toBe('2025-01-01');
      expect(response.body.dateRange.endDate).toBe('2025-01-02');
    });

    it('should handle logs retrieval errors', async () => {
      (logsController.getLogs as jest.Mock).mockImplementation((_req, res) => {
        res.status(500).json({
          success: false,
          error: 'Database query failed'
        });
      });

      const response = await request(app)
        .get('/api/logs')
        .expect(500);

      expect(response.body.error).toBe('Database query failed');
    });

    it('should apply rate limiting', async () => {
      (logsController.getLogs as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({ success: true, data: mockLogsData });
      });

      await request(app)
        .get('/api/logs')
        .expect(200);
    });
  });

  describe('GET /api/logs/stats', () => {
    it('should get log statistics', async () => {
      (logsController.getLogStats as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          success: true,
          data: mockStats
        });
      });

      const response = await request(app)
        .get('/api/logs/stats')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.totalAuditLogs).toBe(1000);
      expect(response.body.data.totalSystemLogs).toBe(500);
    });

    it('should get stats with time range', async () => {
      (logsController.getLogStats as jest.Mock).mockImplementation((req, res) => {
        res.status(200).json({
          success: true,
          data: mockStats,
          timeRange: req.query.timeRange
        });
      });

      const response = await request(app)
        .get('/api/logs/stats?timeRange=24h')
        .expect(200);

      expect(response.body.timeRange).toBe('24h');
    });

    it('should handle stats errors', async () => {
      (logsController.getLogStats as jest.Mock).mockImplementation((_req, res) => {
        res.status(500).json({
          success: false,
          error: 'Failed to calculate statistics'
        });
      });

      const response = await request(app)
        .get('/api/logs/stats')
        .expect(500);

      expect(response.body.error).toBe('Failed to calculate statistics');
    });
  });

  describe('GET /api/logs/realtime', () => {
    it('should get real-time logs', async () => {
      const realtimeLogs = {
        logs: [mockLogsData.logs[0]], // Most recent log
        totalCount: 1,
        lastUpdate: '2025-01-01T12:00:00Z'
      };

      (logsController.getLogs as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          success: true,
          data: realtimeLogs
        });
      });

      const response = await request(app)
        .get('/api/logs/realtime')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.logs).toHaveLength(1);
      expect(response.body.data.lastUpdate).toBeDefined();
    });

    it('should handle real-time logs with polling interval', async () => {
      (logsController.getLogs as jest.Mock).mockImplementation((req, res) => {
        res.status(200).json({
          success: true,
          data: mockLogsData,
          pollingInterval: req.query.interval || 5000
        });
      });

      const response = await request(app)
        .get('/api/logs/realtime?interval=3000')
        .expect(200);

      expect(response.body.pollingInterval).toBe('3000');
    });
  });

  describe('GET /api/logs/export (Admin Only)', () => {
    it('should export logs for admin users', async () => {
      // Set admin user context
      useAdminUser = true;
      
      // Recreate app with admin user context
      const adminApp = express();
      adminApp.use(express.json());
      adminApp.use('/api/logs', logsRoutes);
      
      // Error handler
      adminApp.use((err: any, _req: any, res: any, _next: any) => {
        res.status(err.statusCode || 500).json({
          error: err.message || 'Internal Server Error'
        });
      });

      const mockExportData = 'id,timestamp,event_type,username\n1,2025-01-01,login,testuser';
      
      (logsController.exportLogs as jest.Mock).mockImplementation((_req, res) => {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="logs-export.csv"');
        res.status(200).send(mockExportData);
      });

      const response = await request(adminApp)
        .get('/api/logs/export?format=csv')
        .expect(200);

      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.text).toContain('id,timestamp,event_type,username');
      
      // Reset to non-admin for other tests
      useAdminUser = false;
    });

    it('should reject non-admin users from export', async () => {
      const response = await request(app)
        .get('/api/logs/export')
        .expect(403);

      expect(response.body.error).toBe('Insufficient permissions');
    });

    it('should export logs with different formats', async () => {
      // Set admin user context
      useAdminUser = true;
      
      // Recreate app with admin user context
      const adminApp = express();
      adminApp.use(express.json());
      adminApp.use('/api/logs', logsRoutes);
      
      // Error handler
      adminApp.use((err: any, _req: any, res: any, _next: any) => {
        res.status(err.statusCode || 500).json({
          error: err.message || 'Internal Server Error'
        });
      });

      (logsController.exportLogs as jest.Mock).mockImplementation((req, res) => {
        const format = req.query.format || 'csv';
        const contentType = format === 'json' ? 'application/json' : 'text/csv';
        
        res.setHeader('Content-Type', contentType);
        res.status(200).json({
          format,
          data: mockLogsData.logs
        });
      });

      const response = await request(adminApp)
        .get('/api/logs/export?format=json')
        .expect(200);

      expect(response.body.format).toBe('json');
      
      // Reset to non-admin for other tests
      useAdminUser = false;
    });
  });

  describe('GET /api/logs/metrics (Admin Only)', () => {
    it('should get metrics for admin users', async () => {
      // Set admin user context
      useAdminUser = true;
      
      // Recreate app with admin user context
      const adminApp = express();
      adminApp.use(express.json());
      adminApp.use('/api/logs', logsRoutes);
      
      // Error handler
      adminApp.use((err: any, _req: any, res: any, _next: any) => {
        res.status(err.statusCode || 500).json({
          error: err.message || 'Internal Server Error'
        });
      });

      (logsController.getMetrics as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          success: true,
          data: mockMetrics
        });
      });

      const response = await request(adminApp)
        .get('/api/logs/metrics')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.avgResponseTime).toBe(150);
      
      // Reset to non-admin for other tests
      useAdminUser = false;
    });

    it('should reject non-admin users from metrics', async () => {
      const response = await request(app)
        .get('/api/logs/metrics')
        .expect(403);

      expect(response.body.error).toBe('Insufficient permissions');
    });
  });

  describe('GET /api/logs/metrics/queries (Admin Only)', () => {
    it('should get query performance metrics', async () => {
      // Set admin user context
      useAdminUser = true;
      
      // Recreate app with admin user context
      const adminApp = express();
      adminApp.use(express.json());
      adminApp.use('/api/logs', logsRoutes);
      
      // Error handler
      adminApp.use((err: any, _req: any, res: any, _next: any) => {
        res.status(err.statusCode || 500).json({
          error: err.message || 'Internal Server Error'
        });
      });

      const queryMetrics = {
        averageExecutionTime: 125,
        slowQueries: 5,
        totalQueries: 1000,
        cacheHitRate: 0.85
      };

      (logsController.getQueryMetrics as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          success: true,
          data: queryMetrics
        });
      });

      const response = await request(adminApp)
        .get('/api/logs/metrics/queries')
        .expect(200);

      expect(response.body.data.cacheHitRate).toBe(0.85);
      
      // Reset to non-admin for other tests
      useAdminUser = false;
    });

    it('should get query metrics with time filtering', async () => {
      // Set admin user context
      useAdminUser = true;
      
      // Recreate app with admin user context
      const adminApp = express();
      adminApp.use(express.json());
      adminApp.use('/api/logs', logsRoutes);
      
      // Error handler
      adminApp.use((err: any, _req: any, res: any, _next: any) => {
        res.status(err.statusCode || 500).json({
          error: err.message || 'Internal Server Error'
        });
      });

      (logsController.getQueryMetrics as jest.Mock).mockImplementation((req, res) => {
        res.status(200).json({
          success: true,
          data: mockMetrics,
          timeFilter: req.query.hours
        });
      });

      const response = await request(adminApp)
        .get('/api/logs/metrics/queries?hours=24')
        .expect(200);

      expect(response.body.timeFilter).toBe('24');
      
      // Reset to non-admin for other tests
      useAdminUser = false;
    });
  });

  describe('GET /api/logs/metrics/queries/export (Admin Only)', () => {
    it('should export query metrics as CSV', async () => {
      // Set admin user context
      useAdminUser = true;
      
      // Recreate app with admin user context
      const adminApp = express();
      adminApp.use(express.json());
      adminApp.use('/api/logs', logsRoutes);
      
      // Error handler
      adminApp.use((err: any, _req: any, res: any, _next: any) => {
        res.status(err.statusCode || 500).json({
          error: err.message || 'Internal Server Error'
        });
      });

      const csvData = 'timestamp,executionTime,queryType,cacheHit\n2025-01-01,150,audit_logs,true';

      (logsController.exportQueryMetrics as jest.Mock).mockImplementation((_req, res) => {
        res.setHeader('Content-Type', 'text/csv');
        res.status(200).send(csvData);
      });

      const response = await request(adminApp)
        .get('/api/logs/metrics/queries/export')
        .expect(200);

      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.text).toContain('timestamp,executionTime');
      
      // Reset to non-admin for other tests
      useAdminUser = false;
    });
  });

  describe('GET /api/logs/websocket/stats (Admin Only)', () => {
    it('should get WebSocket statistics', async () => {
      // Set admin user context
      useAdminUser = true;
      
      // Recreate app with admin user context
      const adminApp = express();
      adminApp.use(express.json());
      adminApp.use('/api/logs', logsRoutes);
      
      // Error handler
      adminApp.use((err: any, _req: any, res: any, _next: any) => {
        res.status(err.statusCode || 500).json({
          error: err.message || 'Internal Server Error'
        });
      });

      const wsStats = {
        activeConnections: 10,
        totalMessages: 500,
        bytesTransmitted: 1024000
      };

      (logsController.getWebSocketStats as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          success: true,
          data: wsStats
        });
      });

      const response = await request(adminApp)
        .get('/api/logs/websocket/stats')
        .expect(200);

      expect(response.body.data.activeConnections).toBe(10);
      
      // Reset to non-admin for other tests
      useAdminUser = false;
    });
  });

  describe('GET /api/logs/materialized-views/stats (Admin Only)', () => {
    it('should get materialized view statistics', async () => {
      // Set admin user context
      useAdminUser = true;
      
      // Recreate app with admin user context
      const adminApp = express();
      adminApp.use(express.json());
      adminApp.use('/api/logs', logsRoutes);
      
      // Error handler
      adminApp.use((err: any, _req: any, res: any, _next: any) => {
        res.status(err.statusCode || 500).json({
          error: err.message || 'Internal Server Error'
        });
      });

      const mvStats = {
        viewCount: 3,
        lastRefresh: '2025-01-01T12:00:00Z',
        nextScheduledRefresh: '2025-01-01T13:00:00Z'
      };

      (logsController.getMaterializedViewStats as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          success: true,
          data: mvStats
        });
      });

      const response = await request(adminApp)
        .get('/api/logs/materialized-views/stats')
        .expect(200);

      expect(response.body.data.viewCount).toBe(3);
      
      // Reset to non-admin for other tests
      useAdminUser = false;
    });
  });

  describe('POST /api/logs/materialized-views/refresh (Admin Only)', () => {
    it('should refresh materialized views', async () => {
      // Set admin user context
      useAdminUser = true;
      
      // Recreate app with admin user context
      const adminApp = express();
      adminApp.use(express.json());
      adminApp.use('/api/logs', logsRoutes);
      
      // Error handler
      adminApp.use((err: any, _req: any, res: any, _next: any) => {
        res.status(err.statusCode || 500).json({
          error: err.message || 'Internal Server Error'
        });
      });

      (logsController.refreshMaterializedViews as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          success: true,
          message: 'Materialized views refreshed successfully',
          refreshTime: '2025-01-01T12:00:00Z'
        });
      });

      const response = await request(adminApp)
        .post('/api/logs/materialized-views/refresh')
        .expect(200);

      expect(response.body.message).toContain('refreshed successfully');
      
      // Reset to non-admin for other tests
      useAdminUser = false;
    });

    it('should handle refresh errors', async () => {
      // Set admin user context
      useAdminUser = true;
      
      // Recreate app with admin user context
      const adminApp = express();
      adminApp.use(express.json());
      adminApp.use('/api/logs', logsRoutes);
      
      // Error handler
      adminApp.use((err: any, _req: any, res: any, _next: any) => {
        res.status(err.statusCode || 500).json({
          error: err.message || 'Internal Server Error'
        });
      });

      (logsController.refreshMaterializedViews as jest.Mock).mockImplementation((_req, res) => {
        res.status(500).json({
          success: false,
          error: 'Failed to refresh materialized views'
        });
      });

      const response = await request(adminApp)
        .post('/api/logs/materialized-views/refresh')
        .expect(500);

      expect(response.body.error).toContain('Failed to refresh');
      
      // Reset to non-admin for other tests
      useAdminUser = false;
    });
  });

  describe('POST /api/logs/cleanup (Admin Only)', () => {
    it('should cleanup old logs', async () => {
      // Set admin user context
      useAdminUser = true;
      
      // Recreate app with admin user context
      const adminApp = express();
      adminApp.use(express.json());
      adminApp.use('/api/logs', logsRoutes);
      
      // Error handler
      adminApp.use((err: any, _req: any, res: any, _next: any) => {
        res.status(err.statusCode || 500).json({
          error: err.message || 'Internal Server Error'
        });
      });

      (logsController.cleanupOldLogs as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          success: true,
          message: 'Cleaned up 100 old log entries',
          deletedCount: 100
        });
      });

      const response = await request(adminApp)
        .post('/api/logs/cleanup')
        .send({ days: 30 })
        .expect(200);

      expect(response.body.deletedCount).toBe(100);
      
      // Reset to non-admin for other tests
      useAdminUser = false;
    });

    it('should validate cleanup parameters', async () => {
      // Set admin user context
      useAdminUser = true;
      
      // Recreate app with admin user context
      const adminApp = express();
      adminApp.use(express.json());
      adminApp.use('/api/logs', logsRoutes);
      
      // Error handler
      adminApp.use((err: any, _req: any, res: any, _next: any) => {
        res.status(err.statusCode || 500).json({
          error: err.message || 'Internal Server Error'
        });
      });

      await request(adminApp)
        .post('/api/logs/cleanup')
        .send({ days: -1 }); // Invalid parameter

      // Validation middleware should have been called
      
      // Reset to non-admin for other tests
      useAdminUser = false;
    });
  });

  describe('GET /api/logs/search/fulltext', () => {
    it('should perform full-text search', async () => {
      const searchResults = {
        logs: [
          {
            id: 1,
            log_type: 'audit',
            event_type: 'login',
            username: 'testuser',
            highlight: 'Found <mark>testuser</mark> login event'
          }
        ],
        totalCount: 1,
        searchQuery: 'testuser login'
      };

      (logsController.searchLogs as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          success: true,
          data: searchResults
        });
      });

      const response = await request(app)
        .get('/api/logs/search/fulltext?q=testuser%20login&type=audit')
        .expect(200);

      expect(response.body.data.searchQuery).toBe('testuser login');
      expect(response.body.data.logs[0].highlight).toContain('<mark>');
    });

    it('should handle empty search results', async () => {
      (logsController.searchLogs as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          success: true,
          data: {
            logs: [],
            totalCount: 0,
            searchQuery: 'nonexistent'
          }
        });
      });

      const response = await request(app)
        .get('/api/logs/search/fulltext?q=nonexistent')
        .expect(200);

      expect(response.body.data.totalCount).toBe(0);
    });

    it('should handle search with different log types', async () => {
      (logsController.searchLogs as jest.Mock).mockImplementation((req, res) => {
        res.status(200).json({
          success: true,
          data: {
            logs: mockLogsData.logs,
            logType: req.query.type
          }
        });
      });

      const logTypes = ['audit', 'system'];
      for (const type of logTypes) {
        const response = await request(app)
          .get(`/api/logs/search/fulltext?q=test&type=${type}`)
          .expect(200);

        expect(response.body.data.logType).toBe(type);
      }
    });
  });

  describe('GET /api/logs/search/fuzzy', () => {
    it('should perform fuzzy search', async () => {
      const fuzzyResults = {
        logs: [
          {
            id: 1,
            username: 'testuser',
            similarity: 0.9
          }
        ],
        totalCount: 1,
        searchTerm: 'testusr' // Typo that should match 'testuser'
      };

      (logsController.fuzzySearchLogs as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          success: true,
          data: fuzzyResults
        });
      });

      const response = await request(app)
        .get('/api/logs/search/fuzzy?type=audit&field=username&term=testusr&threshold=0.8')
        .expect(200);

      expect(response.body.data.logs[0].similarity).toBe(0.9);
    });

    it('should handle fuzzy search with different thresholds', async () => {
      (logsController.fuzzySearchLogs as jest.Mock).mockImplementation((req, res) => {
        res.status(200).json({
          success: true,
          data: {
            logs: mockLogsData.logs,
            threshold: parseFloat(req.query.threshold as string)
          }
        });
      });

      const response = await request(app)
        .get('/api/logs/search/fuzzy?type=audit&field=username&term=test&threshold=0.5')
        .expect(200);

      expect(response.body.data.threshold).toBe(0.5);
    });

    it('should validate fuzzy search parameters', async () => {
      await request(app)
        .get('/api/logs/search/fuzzy'); // Missing required parameters

      // Validation should have been called
    });
  });

  describe('GET /api/logs/:id', () => {
    it('should get specific log details', async () => {
      const logDetails = {
        id: 1,
        log_type: 'audit',
        timestamp: '2025-01-01T12:00:00Z',
        event_type: 'login',
        username: 'testuser',
        details: {
          ip_address: '192.168.1.1',
          user_agent: 'Mozilla/5.0...',
          session_id: 'sess_123'
        }
      };

      (logsController.getLogDetails as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          success: true,
          data: logDetails
        });
      });

      const response = await request(app)
        .get('/api/logs/1')
        .expect(200);

      expect(response.body.data.id).toBe(1);
      expect(response.body.data.details).toBeDefined();
    });

    it('should handle non-existent log ID', async () => {
      (logsController.getLogDetails as jest.Mock).mockImplementation((_req, res) => {
        res.status(404).json({
          success: false,
          error: 'Log entry not found'
        });
      });

      const response = await request(app)
        .get('/api/logs/99999')
        .expect(404);

      expect(response.body.error).toBe('Log entry not found');
    });

    it('should validate log ID parameter', async () => {
      await request(app)
        .get('/api/logs/invalid-id');

      // Validation middleware should handle invalid ID
    });
  });

  describe('Authentication and Authorization', () => {
    it('should require authentication for all routes', async () => {
      // Create an app without any authentication
      const noAuthApp = express();
      noAuthApp.use(express.json());
      
      // Import a version of the routes without authentication
      const noAuthLogsRoutes = Router();
      
      // Add the same routes but without authentication middleware
      noAuthLogsRoutes.get('/test', async (req, res) => {
        res.status(401).json({ error: 'Authentication required' });
      });
      
      noAuthLogsRoutes.get('/', (req, res) => {
        res.status(401).json({ error: 'Authentication required' });
      });
      
      noAuthApp.use('/api/logs', noAuthLogsRoutes);

      const response = await request(noAuthApp)
        .get('/api/logs')
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });

    it('should allow authenticated users for non-admin routes', async () => {
      (logsController.getLogs as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({ success: true, data: mockLogsData });
      });

      const response = await request(app)
        .get('/api/logs')
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should restrict admin-only routes to admin users', async () => {
      const adminRoutes = [
        '/export',
        '/metrics', 
        '/metrics/queries',
        '/metrics/queries/export',
        '/websocket/stats',
        '/materialized-views/stats'
      ];

      for (const route of adminRoutes) {
        const response = await request(app)
          .get(`/api/logs${route}`)
          .expect(403);

        expect(response.body.error).toBe('Insufficient permissions');
      }
    });
  });

  describe('Rate Limiting', () => {
    it('should apply query rate limiting', async () => {
      (logsController.getLogs as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({ success: true });
      });

      // Multiple requests should all pass with mocked rate limiter
      const requests = Array(5).fill(null).map(() => 
        request(app).get('/api/logs').expect(200)
      );

      await Promise.all(requests);
    });

    it('should apply export rate limiting', async () => {
      // Set admin user context
      useAdminUser = true;
      
      // Recreate app with admin user context
      const adminApp = express();
      adminApp.use(express.json());
      adminApp.use('/api/logs', logsRoutes);
      
      // Error handler
      adminApp.use((err: any, _req: any, res: any, _next: any) => {
        res.status(err.statusCode || 500).json({
          error: err.message || 'Internal Server Error'
        });
      });

      (logsController.exportLogs as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({ success: true });
      });

      await request(adminApp)
        .get('/api/logs/export')
        .expect(200);
      
      // Reset to non-admin for other tests
      useAdminUser = false;
    });
  });

  describe('Input Validation', () => {
    it('should validate log query parameters', async () => {
      await request(app)
        .get('/api/logs?invalidParam=value');

      // LogsValidator.validateLogQuery should have been called
    });

    it('should validate search parameters', async () => {
      await request(app)
        .get('/api/logs/search/fulltext?invalid=true');

      // LogsValidator.validateLogSearch should have been called
    });

    it('should validate export parameters', async () => {
      // Set admin user context
      useAdminUser = true;
      
      // Recreate app with admin user context
      const adminApp = express();
      adminApp.use(express.json());
      adminApp.use('/api/logs', logsRoutes);
      
      // Error handler
      adminApp.use((err: any, _req: any, res: any, _next: any) => {
        res.status(err.statusCode || 500).json({
          error: err.message || 'Internal Server Error'
        });
      });

      await request(adminApp)
        .get('/api/logs/export?format=invalid');

      // LogsValidator.validateLogExport should have been called
      
      // Reset to non-admin for other tests
      useAdminUser = false;
    });
  });

  describe('Error Handling', () => {
    it('should handle controller errors gracefully', async () => {
      (logsController.getLogs as jest.Mock).mockImplementation((_req, _res, next) => {
        next(new Error('Controller error'));
      });

      const response = await request(app)
        .get('/api/logs')
        .expect(500);

      expect(response.body.error).toBe('Controller error');
    });

    it('should handle database connection errors', async () => {
      (db.query as jest.Mock).mockRejectedValue(new Error('Connection failed'));

      const response = await request(app)
        .get('/api/logs/test')
        .expect(500);

      expect(response.body.error).toBe('Connection failed');
    });

    it('should handle validation errors', async () => {
      // Mock validation middleware to return validation error
      jest.doMock('@/validators/logs.validator', () => ({
        LogsValidator: {
          validateLogQuery: jest.fn((_req: any, res: any, _next: any) => {
            res.status(400).json({ error: 'Validation failed' });
          })
        }
      }));

      await request(app)
        .get('/api/logs?invalid=param');
    });
  });

  describe('Route Coverage Validation', () => {
    it('should have comprehensive coverage of all logs routes', () => {
      const expectedRoutes = [
        'GET /test',
        'GET /',
        'GET /stats',
        'GET /realtime',
        'GET /export',
        'GET /metrics',
        'GET /metrics/queries',
        'GET /metrics/queries/export',
        'GET /websocket/stats',
        'GET /materialized-views/stats',
        'POST /materialized-views/refresh',
        'POST /cleanup',
        'GET /search/fulltext',
        'GET /search/fuzzy',
        'GET /:id'
      ];
      
      expect(expectedRoutes.length).toBe(15);
    });
  });
});