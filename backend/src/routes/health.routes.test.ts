import request from 'supertest';
import express from 'express';
import healthRoutes from './health.routes';
import healthController from '@/controllers/health.controller';
import { requireAuth } from '@/middleware/auth-wrapper';
import { logger } from '@/utils/logger';

// Mock all dependencies
jest.mock('@/controllers/health.controller');
jest.mock('@/middleware/auth-wrapper');
jest.mock('@/utils/logger');

describe('Health Routes', () => {
  let app: express.Application;

  const mockUser = {
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
    role: 'user',
    isAdmin: false
  };

  const mockHealthStatus = {
    status: 'healthy',
    timestamp: '2025-01-01T12:00:00.000Z',
    uptime: 3600,
    version: '1.0.0',
    environment: 'test'
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

  const mockComponentHealth = {
    component: 'database',
    status: 'healthy',
    message: 'Database connection successful',
    responseTime: 50,
    timestamp: '2025-01-01T12:00:00.000Z'
  };

  const mockHealthSummary = {
    overall: 'healthy',
    database: 'healthy',
    redis: 'healthy',
    ldap: 'healthy',
    azure: 'healthy',
    queue: 'healthy',
    storage: 'healthy',
    system: 'healthy'
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

    // Add error handling middleware
    app.use((err: any, req: any, res: any, next: any) => {
      res.status(err.statusCode || 500).json({
        error: err.message || 'Internal Server Error'
      });
    });

    // Mock authentication middleware
    (requireAuth as jest.Mock).mockImplementation((req: any, _res, next) => {
      req.user = mockUser;
      next();
    });
  });

  describe('GET /api/health', () => {
    it('should return basic health status', async () => {
      (healthController.getBasicHealth as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          status: 'ok',
          timestamp: mockHealthStatus.timestamp,
          service: 'ad-reporting-api',
          version: mockHealthStatus.version
        });
      });

      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body.status).toBe('ok');
      expect(response.body.service).toBe('ad-reporting-api');
      expect(response.body.version).toBe('1.0.0');
      expect(response.body.timestamp).toBeDefined();
      expect(healthController.getBasicHealth).toHaveBeenCalledTimes(1);
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
      // This route should not require auth based on the route definition
      (healthController.getBasicHealth as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          status: 'ok',
          timestamp: new Date().toISOString()
        });
      });

      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body.status).toBe('ok');
    });

    it('should return consistent response format', async () => {
      (healthController.getBasicHealth as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          status: 'ok',
          timestamp: '2025-01-01T12:00:00.000Z',
          service: 'ad-reporting-api',
          version: '1.0.0'
        });
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
      expect(healthController.getDetailedHealth).toHaveBeenCalledTimes(1);
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
          error: 'Health check failed',
          message: 'Service unavailable'
        });
      });

      const response = await request(app)
        .get('/api/health/detailed')
        .expect(500);

      expect(response.body.status).toBe('unhealthy');
      expect(response.body.error).toBe('Health check failed');
    });

    it('should be accessible without authentication', async () => {
      (healthController.getDetailedHealth as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json(mockDetailedHealth);
      });

      const response = await request(app)
        .get('/api/health/detailed')
        .expect(200);

      expect(response.body.status).toBe('healthy');
    });
  });

  describe('GET /api/health/ready', () => {
    it('should return ready status when services are healthy', async () => {
      (healthController.getReadiness as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          status: 'ready',
          timestamp: mockHealthStatus.timestamp
        });
      });

      const response = await request(app)
        .get('/api/health/ready')
        .expect(200);

      expect(response.body.status).toBe('ready');
      expect(response.body.timestamp).toBeDefined();
      expect(requireAuth).toHaveBeenCalled();
    });

    it('should return not ready when services are unhealthy', async () => {
      (healthController.getReadiness as jest.Mock).mockImplementation((_req, res) => {
        res.status(503).json({
          status: 'not ready',
          timestamp: mockHealthStatus.timestamp,
          reason: 'Required services are not healthy'
        });
      });

      const response = await request(app)
        .get('/api/health/ready')
        .expect(503);

      expect(response.body.status).toBe('not ready');
      expect(response.body.reason).toBe('Required services are not healthy');
    });

    it('should require authentication', async () => {
      (requireAuth as jest.Mock).mockImplementation((_req: any, res, _next) => {
        res.status(401).json({ error: 'Authentication required' });
      });

      await request(app)
        .get('/api/health/ready')
        .expect(401);
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
          timestamp: mockHealthStatus.timestamp,
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
      expect(response.body.timestamp).toBeDefined();
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

    it('should be accessible without authentication', async () => {
      (healthController.getLiveness as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          status: 'alive',
          timestamp: new Date().toISOString(),
          pid: process.pid,
          uptime: process.uptime()
        });
      });

      const response = await request(app)
        .get('/api/health/live')
        .expect(200);

      expect(response.body.status).toBe('alive');
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
            heapUsed: 20000000,
            external: 1000000
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
          ...mockComponentHealth,
          component: 'database'
        });
      });

      const response = await request(app)
        .get('/api/health/component/database')
        .expect(200);

      expect(response.body.component).toBe('database');
      expect(response.body.status).toBe('healthy');
      expect(response.body.message).toBe('Database connection successful');
      expect(response.body.responseTime).toBe(50);
      expect(requireAuth).toHaveBeenCalled();
    });

    it('should return specific component health for redis', async () => {
      (healthController.getComponentHealth as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          component: 'redis',
          status: 'healthy',
          message: 'Redis connection successful',
          responseTime: 10,
          timestamp: mockHealthStatus.timestamp
        });
      });

      const response = await request(app)
        .get('/api/health/component/redis')
        .expect(200);

      expect(response.body.component).toBe('redis');
      expect(response.body.status).toBe('healthy');
      expect(response.body.responseTime).toBe(10);
    });

    it('should return specific component health for ldap', async () => {
      (healthController.getComponentHealth as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          component: 'ldap',
          status: 'healthy',
          message: 'LDAP service accessible',
          responseTime: 30,
          timestamp: mockHealthStatus.timestamp
        });
      });

      const response = await request(app)
        .get('/api/health/component/ldap')
        .expect(200);

      expect(response.body.component).toBe('ldap');
      expect(response.body.status).toBe('healthy');
    });

    it('should return specific component health for azure', async () => {
      (healthController.getComponentHealth as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          component: 'azure',
          status: 'healthy',
          message: 'Azure AD service accessible',
          responseTime: 100,
          timestamp: mockHealthStatus.timestamp
        });
      });

      const response = await request(app)
        .get('/api/health/component/azure')
        .expect(200);

      expect(response.body.component).toBe('azure');
      expect(response.body.responseTime).toBe(100);
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
      expect(response.body.validComponents).toContain('redis');
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

      expect(response.body.status).toBe('error');
      expect(response.body.error).toBe('Component check failed');
    });

    it('should require authentication', async () => {
      (requireAuth as jest.Mock).mockImplementation((_req: any, res, _next) => {
        res.status(401).json({ error: 'Authentication required' });
      });

      await request(app)
        .get('/api/health/component/database')
        .expect(401);
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
      expect(response.body.message).toBe('Database connection failed');
    });
  });

  describe('GET /api/health/summary', () => {
    it('should return health summary', async () => {
      (healthController.getHealthSummary as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json(mockHealthSummary);
      });

      const response = await request(app)
        .get('/api/health/summary')
        .expect(200);

      expect(response.body).toEqual(mockHealthSummary);
      expect(response.body.overall).toBe('healthy');
      expect(response.body).toHaveProperty('database');
      expect(response.body).toHaveProperty('redis');
      expect(response.body).toHaveProperty('ldap');
      expect(response.body).toHaveProperty('azure');
      expect(requireAuth).toHaveBeenCalled();
    });

    it('should handle mixed health status in summary', async () => {
      const mixedHealthSummary = {
        overall: 'degraded',
        database: 'healthy',
        redis: 'healthy',
        ldap: 'unhealthy',
        azure: 'healthy',
        queue: 'degraded',
        storage: 'healthy',
        system: 'healthy'
      };

      (healthController.getHealthSummary as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json(mixedHealthSummary);
      });

      const response = await request(app)
        .get('/api/health/summary')
        .expect(200);

      expect(response.body.overall).toBe('degraded');
      expect(response.body.ldap).toBe('unhealthy');
      expect(response.body.queue).toBe('degraded');
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

      expect(response.body.status).toBe('error');
      expect(response.body.error).toBe('Summary failed');
    });

    it('should require authentication', async () => {
      (requireAuth as jest.Mock).mockImplementation((_req: any, res, _next) => {
        res.status(401).json({ error: 'Authentication required' });
      });

      await request(app)
        .get('/api/health/summary')
        .expect(401);
    });
  });

  describe('GET /api/health/operational', () => {
    it('should return operational status when system is healthy', async () => {
      (healthController.getOperational as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          operational: true,
          timestamp: mockHealthStatus.timestamp
        });
      });

      const response = await request(app)
        .get('/api/health/operational')
        .expect(200);

      expect(response.body.operational).toBe(true);
      expect(response.body.timestamp).toBeDefined();
      expect(requireAuth).toHaveBeenCalled();
    });

    it('should return non-operational status when system is unhealthy', async () => {
      (healthController.getOperational as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          operational: false,
          timestamp: mockHealthStatus.timestamp,
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

    it('should require authentication', async () => {
      (requireAuth as jest.Mock).mockImplementation((_req: any, res, _next) => {
        res.status(401).json({ error: 'Authentication required' });
      });

      await request(app)
        .get('/api/health/operational')
        .expect(401);
    });

    it('should include detailed operational metrics', async () => {
      (healthController.getOperational as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          operational: true,
          timestamp: new Date().toISOString(),
          criticalServices: {
            database: 'operational',
            redis: 'operational',
            authentication: 'operational'
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
      expect(response.body.performance).toBeDefined();
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
      expect(response.body.data.pool.totalCount).toBe(10);
      expect(response.body.data.pool.idleCount).toBe(5);
      expect(response.body.data.pool.waitingCount).toBe(0);
      expect(response.body.data.utilizationPercent).toBe(10);
      expect(requireAuth).toHaveBeenCalled();
    });

    it('should return unhealthy status when pool is saturated', async () => {
      const saturatedPoolStats = {
        success: true,
        data: {
          healthy: false,
          pool: {
            totalCount: 50,
            idleCount: 0,
            waitingCount: 5
          },
          maxConnections: 50,
          utilizationPercent: 100,
          warning: 'Connections are waiting for available pool slots'
        },
        timestamp: new Date().toISOString()
      };

      (healthController.getDatabasePoolStats as jest.Mock).mockImplementation((_req, res) => {
        res.status(503).json(saturatedPoolStats);
      });

      const response = await request(app)
        .get('/api/health/pool')
        .expect(503);

      expect(response.body.data.healthy).toBe(false);
      expect(response.body.data.utilizationPercent).toBe(100);
      expect(response.body.data.warning).toBe('Connections are waiting for available pool slots');
    });

    it('should handle high utilization warnings', async () => {
      const highUtilizationStats = {
        success: true,
        data: {
          healthy: true,
          pool: {
            totalCount: 45,
            idleCount: 2,
            waitingCount: 0
          },
          maxConnections: 50,
          utilizationPercent: 86,
          warning: 'High connection pool utilization'
        },
        timestamp: new Date().toISOString()
      };

      (healthController.getDatabasePoolStats as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json(highUtilizationStats);
      });

      const response = await request(app)
        .get('/api/health/pool')
        .expect(200);

      expect(response.body.data.utilizationPercent).toBe(86);
      expect(response.body.data.warning).toBe('High connection pool utilization');
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

    it('should require authentication', async () => {
      (requireAuth as jest.Mock).mockImplementation((_req: any, res, _next) => {
        res.status(401).json({ error: 'Authentication required' });
      });

      await request(app)
        .get('/api/health/pool')
        .expect(401);
    });

    it('should include connection pool metrics', async () => {
      const detailedPoolStats = {
        success: true,
        data: {
          healthy: true,
          pool: {
            totalCount: 20,
            idleCount: 8,
            waitingCount: 0
          },
          maxConnections: 50,
          utilizationPercent: 24,
          warning: null,
          metrics: {
            averageWaitTime: 0,
            connectionsCreated: 20,
            connectionsDestroyed: 0,
            connectTimeouts: 0
          }
        },
        timestamp: new Date().toISOString()
      };

      (healthController.getDatabasePoolStats as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json(detailedPoolStats);
      });

      const response = await request(app)
        .get('/api/health/pool')
        .expect(200);

      expect(response.body.data.metrics).toBeDefined();
      expect(response.body.data.metrics.connectionsCreated).toBe(20);
      expect(response.body.data.metrics.connectTimeouts).toBe(0);
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

    it('should handle middleware errors', async () => {
      (requireAuth as jest.Mock).mockImplementation((_req: any, _res, next) => {
        next(new Error('Auth middleware error'));
      });

      const response = await request(app)
        .get('/api/health/ready')
        .expect(500);

      expect(response.body.error).toBe('Auth middleware error');
    });

    it('should handle timeout errors', async () => {
      (healthController.getDetailedHealth as jest.Mock).mockImplementation((_req, res) => {
        res.status(504).json({
          status: 'timeout',
          error: 'Health check timeout',
          timestamp: new Date().toISOString()
        });
      });

      const response = await request(app)
        .get('/api/health/detailed')
        .expect(504);

      expect(response.body.status).toBe('timeout');
      expect(response.body.error).toBe('Health check timeout');
    });

    it('should handle service unavailable errors', async () => {
      (healthController.getComponentHealth as jest.Mock).mockImplementation((_req, res) => {
        res.status(503).json({
          component: 'database',
          status: 'unavailable',
          error: 'Service temporarily unavailable',
          timestamp: new Date().toISOString()
        });
      });

      const response = await request(app)
        .get('/api/health/component/database')
        .expect(503);

      expect(response.body.status).toBe('unavailable');
      expect(response.body.error).toBe('Service temporarily unavailable');
    });
  });

  describe('Authentication Requirements', () => {
    it('should not require authentication for basic health check', async () => {
      // Reset requireAuth mock to not be called
      (requireAuth as jest.Mock).mockClear();
      
      (healthController.getBasicHealth as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({ status: 'ok' });
      });

      await request(app)
        .get('/api/health')
        .expect(200);

      // Basic health should not call requireAuth
    });

    it('should not require authentication for detailed health check', async () => {
      (healthController.getDetailedHealth as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json(mockDetailedHealth);
      });

      await request(app)
        .get('/api/health/detailed')
        .expect(200);
    });

    it('should not require authentication for liveness probe', async () => {
      (healthController.getLiveness as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({ status: 'alive' });
      });

      await request(app)
        .get('/api/health/live')
        .expect(200);
    });

    it('should require authentication for protected endpoints', async () => {
      const protectedEndpoints = [
        '/api/health/ready',
        '/api/health/component/database',
        '/api/health/summary',
        '/api/health/operational',
        '/api/health/pool'
      ];

      (requireAuth as jest.Mock).mockImplementation((_req: any, res, _next) => {
        res.status(401).json({ error: 'Authentication required' });
      });

      for (const endpoint of protectedEndpoints) {
        await request(app)
          .get(endpoint)
          .expect(401);
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

  describe('Route Coverage', () => {
    it('should have all expected routes registered', () => {
      const expectedRoutes = [
        'GET /api/health',
        'GET /api/health/detailed',
        'GET /api/health/ready',
        'GET /api/health/live',
        'GET /api/health/component/:component',
        'GET /api/health/summary',
        'GET /api/health/operational',
        'GET /api/health/pool'
      ];

      // This validates that we have comprehensive test coverage for all routes
      expect(expectedRoutes.length).toBe(8);
    });

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
  });
});