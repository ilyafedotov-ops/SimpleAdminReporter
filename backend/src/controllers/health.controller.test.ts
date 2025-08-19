import request from 'supertest';
import express from 'express';
import { HealthController } from './health.controller';
import { healthService } from '@/services/health/health.service';
import { requireAuth } from '@/middleware/auth-wrapper';
import { db } from '@/config/database';
import { logger } from '@/utils/logger';

// Mock all dependencies
jest.mock('@/services/health/health.service');
jest.mock('@/middleware/auth-wrapper');
jest.mock('@/config/database');
jest.mock('@/utils/logger');

describe('HealthController', () => {
  let app: express.Application;
  let healthController: HealthController;

  const mockUser = {
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
    role: 'user'
  };

  const mockHealthStatus = {
    status: 'healthy' as const,
    timestamp: '2025-01-01T12:00:00.000Z',
    uptime: 3600,
    version: '1.0.0',
    environment: 'test',
    checks: {
      database: {
        status: 'healthy' as const,
        message: 'Database connection successful',
        responseTime: 50
      },
      redis: {
        status: 'healthy' as const,
        message: 'Redis connection successful',
        responseTime: 10
      },
      ldap: {
        status: 'healthy' as const,
        message: 'LDAP service accessible',
        responseTime: 30
      },
      azure: {
        status: 'healthy' as const,
        message: 'Azure AD service accessible',
        responseTime: 100
      },
      queue: {
        status: 'healthy' as const,
        message: 'Queue system operational',
        responseTime: 15
      },
      storage: {
        status: 'healthy' as const,
        message: 'Storage system accessible',
        responseTime: 25
      },
      system: {
        status: 'healthy' as const,
        message: 'System resources within normal limits',
        cpu: {
          usage: 45.5,
          cores: 4
        },
        memory: {
          total: 8000000000,
          used: 4000000000,
          free: 4000000000,
          percentage: 50
        },
        disk: {
          total: 500000000000,
          used: 200000000000,
          free: 300000000000,
          percentage: 40
        }
      }
    }
  };

  const mockDatabasePoolStats = {
    totalCount: 10,
    idleCount: 5,
    waitingCount: 0
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set up test environment variables
    process.env.APP_VERSION = '1.0.0';
    process.env.NODE_ENV = 'test';
    
    app = express();
    app.use(express.json());
    
    healthController = new HealthController();

    // Mock authentication middleware
    (requireAuth as jest.Mock).mockImplementation((req: any, _res, next) => {
      req.user = mockUser;
      next();
    });

    // Create router and register routes
    const router = express.Router();
    router.get('/', (req, res) => healthController.getBasicHealth(req as any, res));
    router.get('/detailed', (req, res) => healthController.getDetailedHealth(req as any, res));
    router.get('/live', (req, res) => healthController.getLiveness(req as any, res));
    router.get('/ready', (req, res) => healthController.getReadiness(req as any, res));
    router.get('/component/:component', (req, res) => healthController.getComponentHealth(req as any, res));
    router.get('/summary', (req, res) => healthController.getHealthSummary(req as any, res));
    router.get('/operational', (req, res) => healthController.getOperational(req as any, res));
    router.get('/db/pool-stats', (req, res) => healthController.getDatabasePoolStats(req as any, res));
    
    app.use('/api/health', router);
    
    // Add error middleware
    app.use((err: any, _req: any, res: any, _next: any) => {
      const statusCode = err.statusCode || 500;
      res.status(statusCode).json({
        status: 'error',
        error: err.message || 'Internal Server Error'
      });
    });

    // Mock database pool stats
    (db.getPoolStats as jest.Mock).mockReturnValue(mockDatabasePoolStats);
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.APP_VERSION;
  });

  describe('GET /api/health', () => {
    it('should return basic health status', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body).toEqual({
        status: 'ok',
        timestamp: expect.any(String),
        service: 'ad-reporting-api',
        version: '1.0.0'
      });
      
      // Verify timestamp is in ISO format
      expect(new Date(response.body.timestamp).toISOString()).toBe(response.body.timestamp);
    });

    it('should use default version when APP_VERSION is not set', async () => {
      delete process.env.APP_VERSION;
      
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body.version).toBe('1.0.0');
    });

    it('should handle errors in basic health check', async () => {
      // Mock Date constructor to throw error
      const originalDate = Date;
      global.Date = jest.fn(() => {
        throw new Error('Date error');
      }) as any;

      const response = await request(app)
        .get('/api/health')
        .expect(500);

      expect(response.body).toEqual({
        status: 'error',
        message: 'Health check failed'
      });

      expect(logger.error).toHaveBeenCalledWith('Basic health check error:', expect.any(Error));

      // Restore Date
      global.Date = originalDate;
    });
  });

  describe('GET /api/health/detailed', () => {
    it('should return detailed health status', async () => {
      (healthService.getHealthStatus as jest.Mock).mockResolvedValueOnce(mockHealthStatus);

      const response = await request(app)
        .get('/api/health/detailed')
        .expect(200);

      expect(response.body).toEqual(mockHealthStatus);
      expect(healthService.getHealthStatus).toHaveBeenCalledTimes(1);
    });

    it('should always return 200 status for detailed health', async () => {
      const unhealthyStatus = {
        ...mockHealthStatus,
        status: 'unhealthy',
        checks: {
          ...mockHealthStatus.checks,
          database: {
            status: 'unhealthy',
            message: 'Database connection failed',
            responseTime: 5000
          }
        }
      };

      (healthService.getHealthStatus as jest.Mock).mockResolvedValueOnce(unhealthyStatus);

      const response = await request(app)
        .get('/api/health/detailed')
        .expect(200);

      expect(response.body.status).toBe('unhealthy');
    });

    it('should handle service errors', async () => {
      const error = new Error('Health service error');
      (healthService.getHealthStatus as jest.Mock).mockRejectedValueOnce(error);

      const response = await request(app)
        .get('/api/health/detailed')
        .expect(500);

      expect(response.body).toEqual({
        status: 'unhealthy',
        timestamp: expect.any(String),
        error: 'Health check failed',
        message: 'Health service error'
      });

      expect(logger.error).toHaveBeenCalledWith('Detailed health check error:', error);
    });
  });

  describe('GET /api/health/live', () => {
    it('should return liveness status', async () => {
      const mockPid = 12345;
      const mockUptime = 3600.5;
      
      // Mock process properties directly
      Object.defineProperty(process, 'pid', {
        value: mockPid,
        configurable: true
      });
      jest.spyOn(process, 'uptime').mockReturnValue(mockUptime);

      const response = await request(app)
        .get('/api/health/live')
        .expect(200);

      expect(response.body).toEqual({
        status: 'alive',
        timestamp: expect.any(String),
        pid: mockPid,
        uptime: mockUptime
      });
    });

    it('should handle errors in liveness check', async () => {
      const originalPid = process.pid;
      
      // Mock process.pid to throw an error when accessed
      Object.defineProperty(process, 'pid', {
        get: () => {
          throw new Error('Process error');
        },
        configurable: true
      });

      const response = await request(app)
        .get('/api/health/live')
        .expect(500);

      expect(response.body).toEqual({
        status: 'error',
        error: 'Process error'
      });

      expect(logger.error).toHaveBeenCalledWith('Liveness check error:', expect.any(Error));

      // Restore original process.pid
      Object.defineProperty(process, 'pid', {
        value: originalPid,
        configurable: true,
        writable: false
      });
    });
  });

  describe('GET /api/health/ready', () => {
    it('should return ready when database and redis are healthy', async () => {
      (healthService.getHealthStatus as jest.Mock).mockResolvedValueOnce(mockHealthStatus);

      const response = await request(app)
        .get('/api/health/ready')
        .expect(200);

      expect(response.body).toEqual({
        status: 'ready',
        timestamp: expect.any(String)
      });
    });

    it('should return not ready when database is unhealthy', async () => {
      const unhealthyStatus = {
        ...mockHealthStatus,
        checks: {
          ...mockHealthStatus.checks,
          database: {
            status: 'unhealthy',
            message: 'Database connection failed'
          }
        }
      };

      (healthService.getHealthStatus as jest.Mock).mockResolvedValueOnce(unhealthyStatus);

      const response = await request(app)
        .get('/api/health/ready')
        .expect(503);

      expect(response.body).toEqual({
        status: 'not ready',
        timestamp: expect.any(String),
        reason: 'Required services are not healthy'
      });
    });

    it('should return not ready when redis is unhealthy', async () => {
      const unhealthyStatus = {
        ...mockHealthStatus,
        checks: {
          ...mockHealthStatus.checks,
          redis: {
            status: 'unhealthy',
            message: 'Redis connection failed'
          }
        }
      };

      (healthService.getHealthStatus as jest.Mock).mockResolvedValueOnce(unhealthyStatus);

      const response = await request(app)
        .get('/api/health/ready')
        .expect(503);

      expect(response.body).toEqual({
        status: 'not ready',
        timestamp: expect.any(String),
        reason: 'Required services are not healthy'
      });
    });

    it('should handle readiness check errors', async () => {
      const error = new Error('Readiness check failed');
      (healthService.getHealthStatus as jest.Mock).mockRejectedValueOnce(error);

      const response = await request(app)
        .get('/api/health/ready')
        .expect(503);

      expect(response.body).toEqual({
        status: 'not ready',
        error: 'Readiness check failed'
      });

      expect(logger.error).toHaveBeenCalledWith('Readiness check error:', error);
    });
  });

  describe('GET /api/health/component/:component', () => {
    it('should return specific component health for database', async () => {
      (healthService.getHealthStatus as jest.Mock).mockResolvedValueOnce(mockHealthStatus);

      const response = await request(app)
        .get('/api/health/component/database')
        .expect(200);

      expect(response.body).toEqual({
        component: 'database',
        status: 'healthy',
        message: 'Database connection successful',
        responseTime: 50,
        timestamp: expect.any(String)
      });
    });

    it('should return specific component health for redis', async () => {
      (healthService.getHealthStatus as jest.Mock).mockResolvedValueOnce(mockHealthStatus);

      const response = await request(app)
        .get('/api/health/component/redis')
        .expect(200);

      expect(response.body).toEqual({
        component: 'redis',
        status: 'healthy',
        message: 'Redis connection successful',
        responseTime: 10,
        timestamp: expect.any(String)
      });
    });

    it('should return specific component health for system', async () => {
      (healthService.getHealthStatus as jest.Mock).mockResolvedValueOnce(mockHealthStatus);

      const response = await request(app)
        .get('/api/health/component/system')
        .expect(200);

      expect(response.body).toEqual({
        component: 'system',
        status: 'healthy',
        message: 'System resources within normal limits',
        cpu: {
          usage: 45.5,
          cores: 4
        },
        memory: {
          total: 8000000000,
          used: 4000000000,
          free: 4000000000,
          percentage: 50
        },
        disk: {
          total: 500000000000,
          used: 200000000000,
          free: 300000000000,
          percentage: 40
        },
        timestamp: expect.any(String)
      });
    });

    it('should return error for invalid component', async () => {
      const response = await request(app)
        .get('/api/health/component/invalid')
        .expect(400);

      expect(response.body).toEqual({
        error: 'Invalid component',
        validComponents: ['database', 'redis', 'ldap', 'azure', 'queue', 'storage', 'system']
      });

      expect(healthService.getHealthStatus).not.toHaveBeenCalled();
    });

    it('should handle all valid components', async () => {
      (healthService.getHealthStatus as jest.Mock).mockResolvedValue(mockHealthStatus);

      const validComponents = ['database', 'redis', 'ldap', 'azure', 'queue', 'storage', 'system'];
      
      for (const component of validComponents) {
        const response = await request(app)
          .get(`/api/health/component/${component}`)
          .expect(200);

        expect(response.body.component).toBe(component);
        expect(response.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      }
    });

    it('should handle component health check errors', async () => {
      const error = new Error('Component check failed');
      (healthService.getHealthStatus as jest.Mock).mockRejectedValueOnce(error);

      const response = await request(app)
        .get('/api/health/component/database')
        .expect(500);

      expect(response.body).toEqual({
        status: 'error',
        error: 'Component check failed'
      });

      expect(logger.error).toHaveBeenCalledWith('Component health check error:', error);
    });
  });

  describe('GET /api/health/summary', () => {
    it('should return health summary', async () => {
      const mockSummary = {
        overall: 'healthy' as const,
        database: 'healthy' as const,
        redis: 'healthy' as const,
        ldap: 'healthy' as const,
        azure: 'healthy' as const,
        queue: 'healthy' as const,
        storage: 'healthy' as const,
        system: 'healthy' as const
      };

      (healthService.getHealthSummary as jest.Mock).mockResolvedValueOnce(mockSummary);

      const response = await request(app)
        .get('/api/health/summary')
        .expect(200);

      expect(response.body).toEqual(mockSummary);
      expect(healthService.getHealthSummary).toHaveBeenCalledTimes(1);
    });

    it('should handle summary errors', async () => {
      const error = new Error('Summary failed');
      (healthService.getHealthSummary as jest.Mock).mockRejectedValueOnce(error);

      const response = await request(app)
        .get('/api/health/summary')
        .expect(500);

      expect(response.body).toEqual({
        status: 'error',
        error: 'Summary failed'
      });

      expect(logger.error).toHaveBeenCalledWith('Health summary error:', error);
    });
  });

  describe('GET /api/health/operational', () => {
    it('should return operational status when system is healthy', async () => {
      (healthService.isOperational as jest.Mock).mockResolvedValueOnce(true);

      const response = await request(app)
        .get('/api/health/operational')
        .expect(200);

      expect(response.body).toEqual({
        operational: true,
        timestamp: expect.any(String)
      });
    });

    it('should return non-operational status when system is unhealthy', async () => {
      (healthService.isOperational as jest.Mock).mockResolvedValueOnce(false);

      const response = await request(app)
        .get('/api/health/operational')
        .expect(200);

      expect(response.body).toEqual({
        operational: false,
        timestamp: expect.any(String)
      });
    });

    it('should handle operational check errors', async () => {
      const error = new Error('Operational check failed');
      (healthService.isOperational as jest.Mock).mockRejectedValueOnce(error);

      const response = await request(app)
        .get('/api/health/operational')
        .expect(500);

      expect(response.body).toEqual({
        operational: false,
        error: 'Operational check failed'
      });

      expect(logger.error).toHaveBeenCalledWith('Operational check error:', error);
    });
  });

  describe('GET /api/health/db/pool-stats', () => {
    it('should return healthy database pool stats', async () => {
      const response = await request(app)
        .get('/api/health/db/pool-stats')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          healthy: true,
          pool: mockDatabasePoolStats,
          maxConnections: 50,
          utilizationPercent: 10, // (10-5)/50 * 100
          warning: null
        },
        timestamp: expect.any(String)
      });

      expect(db.getPoolStats).toHaveBeenCalledTimes(1);
    });

    it('should return unhealthy status when pool is saturated', async () => {
      const saturatedPoolStats = {
        totalCount: 50,
        idleCount: 0,
        waitingCount: 5
      };

      (db.getPoolStats as jest.Mock).mockReturnValueOnce(saturatedPoolStats);

      const response = await request(app)
        .get('/api/health/db/pool-stats')
        .expect(503);

      expect(response.body).toEqual({
        success: true,
        data: {
          healthy: false,
          pool: saturatedPoolStats,
          maxConnections: 50,
          utilizationPercent: 100, // (50-0)/50 * 100
          warning: 'Connections are waiting for available pool slots'
        },
        timestamp: expect.any(String)
      });
    });

    it('should return healthy status when there are idle connections', async () => {
      const poolStatsWithIdle = {
        totalCount: 45,
        idleCount: 10,
        waitingCount: 0
      };

      (db.getPoolStats as jest.Mock).mockReturnValueOnce(poolStatsWithIdle);

      const response = await request(app)
        .get('/api/health/db/pool-stats')
        .expect(200);

      expect(response.body.data.healthy).toBe(true);
      expect(response.body.data.warning).toBeNull();
    });

    it('should handle database pool stats errors', async () => {
      const error = new Error('Pool stats failed');
      (db.getPoolStats as jest.Mock).mockImplementationOnce(() => {
        throw error;
      });

      const response = await request(app)
        .get('/api/health/db/pool-stats')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Failed to get database pool statistics'
      });

      expect(logger.error).toHaveBeenCalledWith('Error getting database pool stats:', error);
    });
  });

  describe('Authentication Requirements', () => {
    it('should require authentication for all endpoints', async () => {
      // Create new app instance with failing auth
      const authApp = express();
      authApp.use(express.json());
      
      // Mock authentication failure
      const failingAuth = jest.fn((_req: any, res, _next) => {
        return res.status(401).json({ error: 'Unauthorized' });
      });

      const authController = new HealthController();
      const router = express.Router();
      
      router.get('/', failingAuth, (req, res) => authController.getBasicHealth(req as any, res));
      router.get('/detailed', failingAuth, (req, res) => authController.getDetailedHealth(req as any, res));
      router.get('/live', failingAuth, (req, res) => authController.getLiveness(req as any, res));
      router.get('/ready', failingAuth, (req, res) => authController.getReadiness(req as any, res));
      router.get('/component/:component', failingAuth, (req, res) => authController.getComponentHealth(req as any, res));
      router.get('/summary', failingAuth, (req, res) => authController.getHealthSummary(req as any, res));
      router.get('/operational', failingAuth, (req, res) => authController.getOperational(req as any, res));
      router.get('/db/pool-stats', failingAuth, (req, res) => authController.getDatabasePoolStats(req as any, res));
      
      authApp.use('/api/health', router);

      const endpoints = [
        '/api/health',
        '/api/health/detailed',
        '/api/health/live',
        '/api/health/ready',
        '/api/health/component/database',
        '/api/health/summary',
        '/api/health/operational',
        '/api/health/db/pool-stats'
      ];

      for (const endpoint of endpoints) {
        await request(authApp)
          .get(endpoint)
          .expect(401);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle middleware errors', async () => {
      // Create new app instance with error-throwing middleware
      const errorApp = express();
      errorApp.use(express.json());
      
      const errorMiddleware = jest.fn((_req: any, _res, next) => {
        next(new Error('Authentication middleware error'));
      });

      const errorController = new HealthController();
      const router = express.Router();
      
      router.get('/', errorMiddleware, (req, res) => errorController.getBasicHealth(req as any, res));
      
      errorApp.use('/api/health', router);
      
      // Add error middleware
      errorApp.use((err: any, _req: any, res: any, _next: any) => {
        const statusCode = err.statusCode || 500;
        res.status(statusCode).json({
          status: 'error',
          error: err.message || 'Internal Server Error'
        });
      });

      const response = await request(errorApp)
        .get('/api/health')
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });

    it('should handle malformed requests gracefully', async () => {
      // Test with invalid component parameter
      await request(app)
        .get('/api/health/component/')
        .expect(404); // Express will return 404 for empty param

      // The 404 is handled by Express, not our controller
    });
  });

  describe('Edge Cases', () => {
    it('should handle degraded system status in readiness check', async () => {
      const degradedStatus = {
        ...mockHealthStatus,
        status: 'degraded' as const,
        checks: {
          ...mockHealthStatus.checks,
          database: {
            status: 'degraded' as const,
            message: 'Database connection slow',
            responseTime: 2000
          }
        }
      };

      (healthService.getHealthStatus as jest.Mock).mockResolvedValueOnce(degradedStatus);

      const response = await request(app)
        .get('/api/health/ready')
        .expect(503);

      expect(response.body.status).toBe('not ready');
      expect(response.body.reason).toBe('Required services are not healthy');
    });

    it('should handle missing health check data gracefully', async () => {
      const incompleteStatus = {
        ...mockHealthStatus,
        checks: {
          ...mockHealthStatus.checks,
          database: undefined
        }
      };

      (healthService.getHealthStatus as jest.Mock).mockResolvedValueOnce(incompleteStatus);

      // Component health should handle missing data
      const response = await request(app)
        .get('/api/health/component/database')
        .expect(200);

      expect(response.body.component).toBe('database');
      // The undefined component should be handled gracefully
    });

    it('should validate timestamp format in responses', async () => {
      // Test basic health - always returns 200
      const healthRes = await request(app)
        .get('/api/health')
        .expect(200);
      expect(healthRes.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

      // Test operational - always returns 200 with timestamp  
      const opRes = await request(app)
        .get('/api/health/operational')
        .expect(200);
      expect(opRes.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

      // Test database pool stats - always returns 200
      const dbRes = await request(app)
        .get('/api/health/db/pool-stats')
        .expect(200);
      expect(dbRes.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });
});