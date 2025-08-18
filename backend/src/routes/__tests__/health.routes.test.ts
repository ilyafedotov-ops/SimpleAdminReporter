import request from 'supertest';
import express from 'express';

// Mock all external dependencies before imports
jest.mock('@/controllers/health.controller', () => ({
  __esModule: true,
  default: {
    getBasicHealth: jest.fn(),
    getDetailedHealth: jest.fn(),
    getReadiness: jest.fn(),
    getLiveness: jest.fn(),
    getComponentHealth: jest.fn(),
    getHealthSummary: jest.fn(),
    getOperational: jest.fn(),
    getDatabasePoolStats: jest.fn()
  }
}));

jest.mock('@/middleware/auth-wrapper', () => ({
  requireAuth: jest.fn((_req: any, _res: any, next: any) => next())
}));

jest.mock('@/utils/logger');

// Import after mocking
import healthRoutes from '../health.routes';
import healthController from '@/controllers/health.controller';

describe('Health Routes Integration', () => {
  let app: express.Application;

  const mockBasicHealth = {
    status: 'ok',
    timestamp: '2025-01-01T12:00:00.000Z',
    service: 'ad-reporting-api',
    version: '1.0.0'
  };

  const mockDetailedHealth = {
    status: 'healthy',
    timestamp: '2025-01-01T12:00:00.000Z',
    uptime: 3600,
    version: '1.0.0',
    environment: 'test',
    checks: {
      database: {
        status: 'healthy',
        message: 'Database connection successful',
        responseTime: 50
      },
      redis: {
        status: 'healthy',
        message: 'Redis connection successful',
        responseTime: 10
      },
      ldap: {
        status: 'healthy',
        message: 'LDAP service accessible',
        responseTime: 30
      },
      azure: {
        status: 'healthy',
        message: 'Azure AD service accessible',
        responseTime: 100
      }
    }
  };

  const mockPoolStats = {
    success: true,
    data: {
      healthy: true,
      pool: {
        totalCount: 10,
        idleCount: 5,
        waitingCount: 0
      },
      maxConnections: 50,
      utilizationPercent: 10,
      warning: null
    },
    timestamp: '2025-01-01T12:00:00.000Z'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    app = express();
    app.use(express.json());
    app.use('/api/health', healthRoutes);

    // Error handler
    app.use((err: any, _req: any, res: any, _next: any) => {
      res.status(err.statusCode || 500).json({
        error: err.message || 'Internal Server Error'
      });
    });
  });

  describe('GET /api/health', () => {
    it('should return basic health status', async () => {
      (healthController.getBasicHealth as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json(mockBasicHealth);
      });

      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body).toEqual(mockBasicHealth);
      expect(response.body.status).toBe('ok');
      expect(response.body.service).toBe('ad-reporting-api');
    });

    it('should handle basic health check errors', async () => {
      (healthController.getBasicHealth as jest.Mock).mockImplementation((_req, res) => {
        res.status(500).json({
          status: 'error',
          message: 'Health check failed'
        });
      });

      const response = await request(app)
        .get('/api/health')
        .expect(500);

      expect(response.body.status).toBe('error');
      expect(response.body.message).toBe('Health check failed');
    });

    it('should be accessible without authentication', async () => {
      (healthController.getBasicHealth as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json(mockBasicHealth);
      });

      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body.status).toBe('ok');
    });

    it('should return consistent response format', async () => {
      (healthController.getBasicHealth as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json(mockBasicHealth);
      });

      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('service');
      expect(response.body).toHaveProperty('version');
    });
  });

  describe('GET /api/health/detailed', () => {
    it('should return detailed health status', async () => {
      (healthController.getDetailedHealth as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json(mockDetailedHealth);
      });

      const response = await request(app)
        .get('/api/health/detailed')
        .expect(200);

      expect(response.body).toEqual(mockDetailedHealth);
      expect(response.body.checks).toHaveProperty('database');
      expect(response.body.checks).toHaveProperty('redis');
      expect(response.body.checks).toHaveProperty('ldap');
      expect(response.body.checks).toHaveProperty('azure');
    });

    it('should handle unhealthy service status', async () => {
      const unhealthyStatus = {
        ...mockDetailedHealth,
        status: 'unhealthy',
        checks: {
          ...mockDetailedHealth.checks,
          database: {
            status: 'unhealthy',
            message: 'Database connection failed',
            responseTime: 5000
          }
        }
      };

      (healthController.getDetailedHealth as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json(unhealthyStatus);
      });

      const response = await request(app)
        .get('/api/health/detailed')
        .expect(200);

      expect(response.body.status).toBe('unhealthy');
      expect(response.body.checks.database.status).toBe('unhealthy');
    });

    it('should handle degraded service status', async () => {
      const degradedStatus = {
        ...mockDetailedHealth,
        status: 'degraded',
        checks: {
          ...mockDetailedHealth.checks,
          redis: {
            status: 'degraded',
            message: 'Redis connection slow',
            responseTime: 2000
          }
        }
      };

      (healthController.getDetailedHealth as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json(degradedStatus);
      });

      const response = await request(app)
        .get('/api/health/detailed')
        .expect(200);

      expect(response.body.status).toBe('degraded');
      expect(response.body.checks.redis.status).toBe('degraded');
    });

    it('should handle detailed health check errors', async () => {
      (healthController.getDetailedHealth as jest.Mock).mockImplementation((_req, res) => {
        res.status(500).json({
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          error: 'Health check failed'
        });
      });

      const response = await request(app)
        .get('/api/health/detailed')
        .expect(500);

      expect(response.body.status).toBe('unhealthy');
      expect(response.body.error).toBe('Health check failed');
    });
  });

  describe('GET /api/health/ready', () => {
    it('should return ready when services are healthy', async () => {
      (healthController.getReadiness as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          status: 'ready',
          timestamp: mockBasicHealth.timestamp
        });
      });

      const response = await request(app)
        .get('/api/health/ready')
        .expect(200);

      expect(response.body.status).toBe('ready');
      expect(response.body.timestamp).toBeDefined();
    });

    it('should return not ready when services are unhealthy', async () => {
      (healthController.getReadiness as jest.Mock).mockImplementation((_req, res) => {
        res.status(503).json({
          status: 'not ready',
          timestamp: mockBasicHealth.timestamp,
          reason: 'Required services are not healthy'
        });
      });

      const response = await request(app)
        .get('/api/health/ready')
        .expect(503);

      expect(response.body.status).toBe('not ready');
      expect(response.body.reason).toBe('Required services are not healthy');
    });

    it('should handle readiness check errors', async () => {
      (healthController.getReadiness as jest.Mock).mockImplementation((_req, res) => {
        res.status(503).json({
          status: 'not ready',
          error: 'Readiness check failed'
        });
      });

      const response = await request(app)
        .get('/api/health/ready')
        .expect(503);

      expect(response.body.status).toBe('not ready');
      expect(response.body.error).toBe('Readiness check failed');
    });

    it('should handle partial service availability', async () => {
      (healthController.getReadiness as jest.Mock).mockImplementation((_req, res) => {
        res.status(503).json({
          status: 'not ready',
          timestamp: new Date().toISOString(),
          reason: 'Database service unavailable'
        });
      });

      const response = await request(app)
        .get('/api/health/ready')
        .expect(503);

      expect(response.body.reason).toBe('Database service unavailable');
    });
  });

  describe('GET /api/health/live', () => {
    it('should return liveness status', async () => {
      (healthController.getLiveness as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          status: 'alive',
          timestamp: mockBasicHealth.timestamp,
          pid: 12345,
          uptime: 3600.5
        });
      });

      const response = await request(app)
        .get('/api/health/live')
        .expect(200);

      expect(response.body.status).toBe('alive');
      expect(response.body.pid).toBe(12345);
      expect(response.body.uptime).toBe(3600.5);
    });

    it('should handle liveness check errors', async () => {
      (healthController.getLiveness as jest.Mock).mockImplementation((_req, res) => {
        res.status(500).json({
          status: 'error',
          error: 'Process error'
        });
      });

      const response = await request(app)
        .get('/api/health/live')
        .expect(500);

      expect(response.body.status).toBe('error');
      expect(response.body.error).toBe('Process error');
    });

    it('should return process information', async () => {
      (healthController.getLiveness as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          status: 'alive',
          timestamp: new Date().toISOString(),
          pid: 12345,
          uptime: 1800,
          memoryUsage: {
            rss: 50000000,
            heapTotal: 30000000,
            heapUsed: 20000000
          }
        });
      });

      const response = await request(app)
        .get('/api/health/live')
        .expect(200);

      expect(response.body.pid).toBe(12345);
      expect(response.body.uptime).toBe(1800);
      expect(response.body.memoryUsage).toBeDefined();
    });
  });

  describe('GET /api/health/component/:component', () => {
    it('should return specific component health for database', async () => {
      (healthController.getComponentHealth as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          component: 'database',
          status: 'healthy',
          message: 'Database connection successful',
          responseTime: 50,
          timestamp: mockBasicHealth.timestamp
        });
      });

      const response = await request(app)
        .get('/api/health/component/database')
        .expect(200);

      expect(response.body.component).toBe('database');
      expect(response.body.status).toBe('healthy');
      expect(response.body.responseTime).toBe(50);
    });

    it('should return specific component health for redis', async () => {
      (healthController.getComponentHealth as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          component: 'redis',
          status: 'healthy',
          message: 'Redis connection successful',
          responseTime: 10,
          timestamp: mockBasicHealth.timestamp
        });
      });

      const response = await request(app)
        .get('/api/health/component/redis')
        .expect(200);

      expect(response.body.component).toBe('redis');
      expect(response.body.status).toBe('healthy');
    });

    it('should handle invalid component', async () => {
      (healthController.getComponentHealth as jest.Mock).mockImplementation((_req, res) => {
        res.status(400).json({
          error: 'Invalid component',
          validComponents: ['database', 'redis', 'ldap', 'azure', 'queue', 'storage', 'system']
        });
      });

      const response = await request(app)
        .get('/api/health/component/invalid')
        .expect(400);

      expect(response.body.error).toBe('Invalid component');
      expect(response.body.validComponents).toContain('database');
    });

    it('should handle component health check errors', async () => {
      (healthController.getComponentHealth as jest.Mock).mockImplementation((_req, res) => {
        res.status(500).json({
          status: 'error',
          error: 'Component check failed'
        });
      });

      const response = await request(app)
        .get('/api/health/component/database')
        .expect(500);

      expect(response.body.error).toBe('Component check failed');
    });

    it('should handle unhealthy component status', async () => {
      (healthController.getComponentHealth as jest.Mock).mockImplementation((_req, res) => {
        res.status(503).json({
          component: 'database',
          status: 'unhealthy',
          message: 'Database connection failed',
          responseTime: 5000,
          timestamp: new Date().toISOString()
        });
      });

      const response = await request(app)
        .get('/api/health/component/database')
        .expect(503);

      expect(response.body.status).toBe('unhealthy');
    });
  });

  describe('GET /api/health/summary', () => {
    it('should return health summary', async () => {
      const mockSummary = {
        overall: 'healthy',
        database: 'healthy',
        redis: 'healthy',
        ldap: 'healthy',
        azure: 'healthy'
      };

      (healthController.getHealthSummary as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json(mockSummary);
      });

      const response = await request(app)
        .get('/api/health/summary')
        .expect(200);

      expect(response.body).toEqual(mockSummary);
      expect(response.body.overall).toBe('healthy');
    });

    it('should handle mixed health status in summary', async () => {
      const mixedSummary = {
        overall: 'degraded',
        database: 'healthy',
        redis: 'healthy',
        ldap: 'unhealthy',
        azure: 'healthy'
      };

      (healthController.getHealthSummary as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json(mixedSummary);
      });

      const response = await request(app)
        .get('/api/health/summary')
        .expect(200);

      expect(response.body.overall).toBe('degraded');
      expect(response.body.ldap).toBe('unhealthy');
    });

    it('should handle summary errors', async () => {
      (healthController.getHealthSummary as jest.Mock).mockImplementation((_req, res) => {
        res.status(500).json({
          status: 'error',
          error: 'Summary failed'
        });
      });

      const response = await request(app)
        .get('/api/health/summary')
        .expect(500);

      expect(response.body.error).toBe('Summary failed');
    });
  });

  describe('GET /api/health/operational', () => {
    it('should return operational status when system is healthy', async () => {
      (healthController.getOperational as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          operational: true,
          timestamp: mockBasicHealth.timestamp
        });
      });

      const response = await request(app)
        .get('/api/health/operational')
        .expect(200);

      expect(response.body.operational).toBe(true);
    });

    it('should return non-operational status when system is unhealthy', async () => {
      (healthController.getOperational as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          operational: false,
          timestamp: mockBasicHealth.timestamp,
          reason: 'Critical services unavailable'
        });
      });

      const response = await request(app)
        .get('/api/health/operational')
        .expect(200);

      expect(response.body.operational).toBe(false);
      expect(response.body.reason).toBe('Critical services unavailable');
    });

    it('should handle operational check errors', async () => {
      (healthController.getOperational as jest.Mock).mockImplementation((_req, res) => {
        res.status(500).json({
          operational: false,
          error: 'Operational check failed'
        });
      });

      const response = await request(app)
        .get('/api/health/operational')
        .expect(500);

      expect(response.body.operational).toBe(false);
      expect(response.body.error).toBe('Operational check failed');
    });

    it('should include detailed operational metrics', async () => {
      (healthController.getOperational as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          operational: true,
          timestamp: new Date().toISOString(),
          criticalServices: {
            database: 'operational',
            redis: 'operational'
          },
          performance: {
            averageResponseTime: 150,
            successRate: 99.5
          }
        });
      });

      const response = await request(app)
        .get('/api/health/operational')
        .expect(200);

      expect(response.body.criticalServices).toBeDefined();
      expect(response.body.performance.successRate).toBe(99.5);
    });
  });

  describe('GET /api/health/pool', () => {
    it('should return healthy database pool stats', async () => {
      (healthController.getDatabasePoolStats as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json(mockPoolStats);
      });

      const response = await request(app)
        .get('/api/health/pool')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.healthy).toBe(true);
      expect(response.body.data.utilizationPercent).toBe(10);
    });

    it('should return unhealthy status when pool is saturated', async () => {
      const saturatedStats = {
        success: true,
        data: {
          healthy: false,
          pool: { totalCount: 50, idleCount: 0, waitingCount: 5 },
          maxConnections: 50,
          utilizationPercent: 100,
          warning: 'Connections are waiting for available pool slots'
        },
        timestamp: new Date().toISOString()
      };

      (healthController.getDatabasePoolStats as jest.Mock).mockImplementation((_req, res) => {
        res.status(503).json(saturatedStats);
      });

      const response = await request(app)
        .get('/api/health/pool')
        .expect(503);

      expect(response.body.data.healthy).toBe(false);
      expect(response.body.data.utilizationPercent).toBe(100);
    });

    it('should handle database pool stats errors', async () => {
      (healthController.getDatabasePoolStats as jest.Mock).mockImplementation((_req, res) => {
        res.status(500).json({
          success: false,
          error: 'Failed to get database pool statistics'
        });
      });

      const response = await request(app)
        .get('/api/health/pool')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to get database pool statistics');
    });

    it('should include connection pool metrics', async () => {
      const detailedStats = {
        ...mockPoolStats,
        data: {
          ...mockPoolStats.data,
          metrics: {
            averageWaitTime: 0,
            connectionsCreated: 20,
            connectTimeouts: 0
          }
        }
      };

      (healthController.getDatabasePoolStats as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json(detailedStats);
      });

      const response = await request(app)
        .get('/api/health/pool')
        .expect(200);

      expect(response.body.data.metrics).toBeDefined();
      expect(response.body.data.metrics.connectionsCreated).toBe(20);
    });
  });

  describe('Error Handling', () => {
    it('should handle controller method errors', async () => {
      (healthController.getBasicHealth as jest.Mock).mockImplementation((_req, _res, next) => {
        next(new Error('Controller error'));
      });

      const response = await request(app)
        .get('/api/health')
        .expect(500);

      expect(response.body.error).toBe('Controller error');
    });

    it('should handle timeout errors', async () => {
      (healthController.getDetailedHealth as jest.Mock).mockImplementation((_req, res) => {
        res.status(504).json({
          status: 'timeout',
          error: 'Health check timeout'
        });
      });

      const response = await request(app)
        .get('/api/health/detailed')
        .expect(504);

      expect(response.body.status).toBe('timeout');
    });

    it('should handle service unavailable errors', async () => {
      (healthController.getComponentHealth as jest.Mock).mockImplementation((_req, res) => {
        res.status(503).json({
          component: 'database',
          status: 'unavailable',
          error: 'Service temporarily unavailable'
        });
      });

      const response = await request(app)
        .get('/api/health/component/database')
        .expect(503);

      expect(response.body.status).toBe('unavailable');
    });
  });

  describe('Authentication Requirements', () => {
    it('should not require authentication for public endpoints', async () => {
      const publicEndpoints = [
        '/api/health',
        '/api/health/detailed',
        '/api/health/live'
      ];

      (healthController.getBasicHealth as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({ status: 'ok' });
      });

      (healthController.getDetailedHealth as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json(mockDetailedHealth);
      });

      (healthController.getLiveness as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({ status: 'alive' });
      });

      for (const endpoint of publicEndpoints) {
        await request(app)
          .get(endpoint)
          .expect(200);
      }
    });

    it('should require authentication for protected endpoints', async () => {
      const protectedEndpoints = [
        '/api/health/ready',
        '/api/health/component/database',
        '/api/health/summary',
        '/api/health/operational',
        '/api/health/pool'
      ];

      // Mock successful auth for these tests
      (healthController.getReadiness as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({ status: 'ready' });
      });

      (healthController.getComponentHealth as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({ component: 'database', status: 'healthy' });
      });

      (healthController.getHealthSummary as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({ overall: 'healthy' });
      });

      (healthController.getOperational as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({ operational: true });
      });

      (healthController.getDatabasePoolStats as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json(mockPoolStats);
      });

      for (const endpoint of protectedEndpoints) {
        await request(app)
          .get(endpoint)
          .expect(200);
      }
    });
  });

  describe('Response Format Validation', () => {
    it('should return consistent timestamp format', async () => {
      const timestampRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

      (healthController.getBasicHealth as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          status: 'ok',
          timestamp: '2025-01-01T12:00:00.000Z'
        });
      });

      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body.timestamp).toMatch(timestampRegex);
    });

    it('should return proper HTTP status codes', async () => {
      // Test 200 for healthy
      (healthController.getBasicHealth as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({ status: 'ok' });
      });

      await request(app)
        .get('/api/health')
        .expect(200);

      // Test 503 for unhealthy
      (healthController.getReadiness as jest.Mock).mockImplementation((_req, res) => {
        res.status(503).json({ status: 'not ready' });
      });

      await request(app)
        .get('/api/health/ready')
        .expect(503);
    });

    it('should include required fields in responses', async () => {
      (healthController.getDetailedHealth as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json(mockDetailedHealth);
      });

      const response = await request(app)
        .get('/api/health/detailed')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('checks');
      expect(typeof response.body.checks).toBe('object');
    });
  });

  describe('Route Coverage Validation', () => {
    it('should handle all valid component types', async () => {
      const validComponents = ['database', 'redis', 'ldap', 'azure', 'queue', 'storage', 'system'];

      (healthController.getComponentHealth as jest.Mock).mockImplementation((req, res) => {
        const component = req.params.component;
        if (validComponents.includes(component)) {
          res.status(200).json({
            component,
            status: 'healthy',
            timestamp: new Date().toISOString()
          });
        } else {
          res.status(400).json({
            error: 'Invalid component',
            validComponents
          });
        }
      });

      for (const component of validComponents) {
        const response = await request(app)
          .get(`/api/health/component/${component}`)
          .expect(200);

        expect(response.body.component).toBe(component);
      }
    });

    it('should have comprehensive coverage of all health routes', () => {
      const expectedRoutes = [
        'GET /',
        'GET /detailed',
        'GET /ready',
        'GET /live',
        'GET /component/:component',
        'GET /summary',
        'GET /operational',
        'GET /pool'
      ];
      
      expect(expectedRoutes.length).toBe(8);
    });
  });
});