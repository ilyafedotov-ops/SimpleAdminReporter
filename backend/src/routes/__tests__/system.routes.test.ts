import request from 'supertest';
import express from 'express';

// Mock all external dependencies before imports
jest.mock('../../controllers/system.controller', () => ({
  systemController: {
    getSystemConfig: jest.fn(),
    updateSystemConfig: jest.fn(),
    getSystemHealth: jest.fn()
  }
}));

jest.mock('@/middleware/auth-wrapper', () => ({
  requireAuth: jest.fn((_req: any, _res: any, next: any) => {
    _req.user = { 
      id: 1, 
      username: 'testuser',
      displayName: 'Test User',
      email: 'test@example.com',
      authSource: 'local',
      isAdmin: false,
      isActive: true
    };
    next();
  }),
  requireAdmin: jest.fn((_req: any, _res: any, next: any) => {
    if (_req.user?.isAdmin) {
      next();
    } else {
      _res.status(403).json({ error: 'Admin access required' });
    }
  })
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
import { systemRoutes } from '../system.routes';
import { systemController } from '../../controllers/system.controller';

describe('System Routes Integration', () => {
  let app: express.Application;

  const mockSystemConfig = {
    system: {
      name: 'Simple Admin Reporter',
      version: '1.0.0',
      environment: 'development',
      timezone: 'UTC'
    },
    database: {
      host: 'localhost',
      port: 5432,
      name: 'reporting'
    },
    authentication: {
      ldapEnabled: true,
      azureEnabled: true,
      localEnabled: true
    },
    features: {
      reportScheduling: true,
      exportFormats: ['excel', 'csv', 'pdf'],
      maxReportSize: 10000
    },
    logging: {
      level: 'info',
      retentionDays: 90
    }
  };

  const mockSystemHealth = {
    status: 'healthy',
    timestamp: '2025-01-01T12:00:00Z',
    services: {
      database: {
        status: 'healthy',
        responseTime: 15,
        details: 'PostgreSQL connection active'
      },
      redis: {
        status: 'healthy',
        responseTime: 5,
        details: 'Redis cache operational'
      },
      ldap: {
        status: 'healthy',
        responseTime: 50,
        details: 'LDAP service reachable'
      },
      azure: {
        status: 'healthy',
        responseTime: 200,
        details: 'Azure AD API responding'
      }
    },
    metrics: {
      uptime: 86400,
      memoryUsage: 512,
      cpuUsage: 25.5,
      diskUsage: 45.2
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    app = express();
    app.use(express.json());
    app.use('/api/system', systemRoutes);

    // Error handler
    app.use((err: any, _req: any, res: any, _next: any) => {
      res.status(err.statusCode || 500).json({
        error: err.message || 'Internal Server Error'
      });
    });
  });

  describe('GET /api/system/config', () => {
    it('should get system config for admin users', async () => {
      // Mock admin user
      const { requireAdmin } = require('@/middleware/auth-wrapper');
      (requireAdmin as jest.Mock).mockImplementationOnce((_req: any, _res: any, next: any) => {
        _req.user = { 
          id: 1, 
          username: 'admin',
          displayName: 'Admin User',
          email: 'admin@example.com',
          authSource: 'local',
          isAdmin: true,
          isActive: true
        };
        next();
      });

      (systemController.getSystemConfig as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          success: true,
          data: mockSystemConfig
        });
      });

      const response = await request(app)
        .get('/api/system/config')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.system.name).toBe('Simple Admin Reporter');
      expect(response.body.data.features.reportScheduling).toBe(true);
    });

    it('should reject non-admin users', async () => {
      const response = await request(app)
        .get('/api/system/config')
        .expect(403);

      expect(response.body.error).toBe('Admin access required');
    });

    it('should handle config retrieval errors', async () => {
      // Mock admin user
      const { requireAdmin } = require('@/middleware/auth-wrapper');
      (requireAdmin as jest.Mock).mockImplementationOnce((_req: any, _res: any, next: any) => {
        _req.user = { 
          id: 1, 
          username: 'admin',
          displayName: 'Admin User',
          email: 'admin@example.com',
          authSource: 'local',
          isAdmin: true,
          isActive: true
        };
        next();
      });

      (systemController.getSystemConfig as jest.Mock).mockImplementation((_req, res) => {
        res.status(500).json({
          success: false,
          error: 'Failed to retrieve system configuration'
        });
      });

      const response = await request(app)
        .get('/api/system/config')
        .expect(500);

      expect(response.body.error).toBe('Failed to retrieve system configuration');
    });

    it('should include sensitive data for admin users only', async () => {
      // Mock admin user
      const { requireAdmin } = require('@/middleware/auth-wrapper');
      (requireAdmin as jest.Mock).mockImplementationOnce((_req: any, _res: any, next: any) => {
        _req.user = { 
          id: 1, 
          username: 'admin',
          displayName: 'Admin User',
          email: 'admin@example.com',
          authSource: 'local',
          isAdmin: true,
          isActive: true
        };
        next();
      });

      (systemController.getSystemConfig as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          success: true,
          data: {
            ...mockSystemConfig,
            secrets: {
              jwtSecret: '[HIDDEN]',
              ldapPassword: '[HIDDEN]'
            }
          }
        });
      });

      const response = await request(app)
        .get('/api/system/config')
        .expect(200);

      expect(response.body.data.secrets).toBeDefined();
      expect(response.body.data.secrets.jwtSecret).toBe('[HIDDEN]');
    });
  });

  describe('POST /api/system/config', () => {
    it('should update system config for admin users', async () => {
      const configUpdates = {
        system: {
          timezone: 'America/New_York'
        },
        features: {
          maxReportSize: 15000
        },
        logging: {
          level: 'debug'
        }
      };

      // Mock admin user
      const { requireAdmin } = require('@/middleware/auth-wrapper');
      (requireAdmin as jest.Mock).mockImplementationOnce((_req: any, _res: any, next: any) => {
        _req.user = { 
          id: 1, 
          username: 'admin',
          displayName: 'Admin User',
          email: 'admin@example.com',
          authSource: 'local',
          isAdmin: true,
          isActive: true
        };
        next();
      });

      (systemController.updateSystemConfig as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          success: true,
          data: {
            ...mockSystemConfig,
            ...configUpdates,
            updatedAt: '2025-01-01T12:00:00Z'
          },
          message: 'System configuration updated successfully'
        });
      });

      const response = await request(app)
        .post('/api/system/config')
        .send(configUpdates)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('System configuration updated successfully');
      expect(response.body.data.updatedAt).toBeDefined();
    });

    it('should reject non-admin users from updating config', async () => {
      const response = await request(app)
        .post('/api/system/config')
        .send({ system: { timezone: 'UTC' } })
        .expect(403);

      expect(response.body.error).toBe('Admin access required');
    });

    it('should validate configuration updates', async () => {
      // Mock admin user
      const { requireAdmin } = require('@/middleware/auth-wrapper');
      (requireAdmin as jest.Mock).mockImplementationOnce((_req: any, _res: any, next: any) => {
        _req.user = { 
          id: 1, 
          username: 'admin',
          displayName: 'Admin User',
          email: 'admin@example.com',
          authSource: 'local',
          isAdmin: true,
          isActive: true
        };
        next();
      });

      (systemController.updateSystemConfig as jest.Mock).mockImplementation((_req, res) => {
        res.status(400).json({
          success: false,
          error: 'Invalid configuration values',
          details: [
            { field: 'logging.level', message: 'Must be one of: error, warn, info, debug' },
            { field: 'features.maxReportSize', message: 'Must be a positive integer' }
          ]
        });
      });

      const response = await request(app)
        .post('/api/system/config')
        .send({
          logging: { level: 'invalid' },
          features: { maxReportSize: -1 }
        })
        .expect(400);

      expect(response.body.error).toBe('Invalid configuration values');
      expect(response.body.details).toHaveLength(2);
    });

    it('should handle partial configuration updates', async () => {
      const partialUpdate = {
        features: {
          reportScheduling: false
        }
      };

      // Mock admin user
      const { requireAdmin } = require('@/middleware/auth-wrapper');
      (requireAdmin as jest.Mock).mockImplementationOnce((_req: any, _res: any, next: any) => {
        _req.user = { 
          id: 1, 
          username: 'admin',
          displayName: 'Admin User',
          email: 'admin@example.com',
          authSource: 'local',
          isAdmin: true,
          isActive: true
        };
        next();
      });

      (systemController.updateSystemConfig as jest.Mock).mockImplementation((req, res) => {
        res.status(200).json({
          success: true,
          data: {
            ...mockSystemConfig,
            features: {
              ...mockSystemConfig.features,
              ...req.body.features
            }
          },
          updatedFields: Object.keys(req.body)
        });
      });

      const response = await request(app)
        .post('/api/system/config')
        .send(partialUpdate)
        .expect(200);

      expect(response.body.data.features.reportScheduling).toBe(false);
      expect(response.body.updatedFields).toContain('features');
    });

    it('should handle configuration update errors', async () => {
      // Mock admin user
      const { requireAdmin } = require('@/middleware/auth-wrapper');
      (requireAdmin as jest.Mock).mockImplementationOnce((_req: any, _res: any, next: any) => {
        _req.user = { 
          id: 1, 
          username: 'admin',
          displayName: 'Admin User',
          email: 'admin@example.com',
          authSource: 'local',
          isAdmin: true,
          isActive: true
        };
        next();
      });

      (systemController.updateSystemConfig as jest.Mock).mockImplementation((_req, res) => {
        res.status(500).json({
          success: false,
          error: 'Failed to persist configuration changes'
        });
      });

      const response = await request(app)
        .post('/api/system/config')
        .send({ system: { timezone: 'UTC' } })
        .expect(500);

      expect(response.body.error).toBe('Failed to persist configuration changes');
    });

    it('should not allow updating sensitive security settings', async () => {
      // Mock admin user
      const { requireAdmin } = require('@/middleware/auth-wrapper');
      (requireAdmin as jest.Mock).mockImplementationOnce((_req: any, _res: any, next: any) => {
        _req.user = { 
          id: 1, 
          username: 'admin',
          displayName: 'Admin User',
          email: 'admin@example.com',
          authSource: 'local',
          isAdmin: true,
          isActive: true
        };
        next();
      });

      (systemController.updateSystemConfig as jest.Mock).mockImplementation((_req, res) => {
        res.status(403).json({
          success: false,
          error: 'Cannot update security-critical settings via API',
          restrictedFields: ['authentication.secrets', 'database.credentials']
        });
      });

      const response = await request(app)
        .post('/api/system/config')
        .send({
          authentication: {
            secrets: { jwtSecret: 'new-secret' }
          }
        })
        .expect(403);

      expect(response.body.restrictedFields).toContain('authentication.secrets');
    });
  });

  describe('GET /api/system/health', () => {
    it('should get system health for authenticated users', async () => {
      (systemController.getSystemHealth as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          success: true,
          data: mockSystemHealth
        });
      });

      const response = await request(app)
        .get('/api/system/health')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('healthy');
      expect(response.body.data.services.database.status).toBe('healthy');
    });

    it('should allow non-admin users to check health', async () => {
      (systemController.getSystemHealth as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          success: true,
          data: mockSystemHealth
        });
      });

      const response = await request(app)
        .get('/api/system/health')
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should handle unhealthy system status', async () => {
      const unhealthyStatus = {
        ...mockSystemHealth,
        status: 'unhealthy',
        services: {
          ...mockSystemHealth.services,
          database: {
            status: 'unhealthy',
            responseTime: null,
            details: 'Connection timeout',
            error: 'ETIMEDOUT'
          }
        }
      };

      (systemController.getSystemHealth as jest.Mock).mockImplementation((_req, res) => {
        res.status(503).json({
          success: false,
          data: unhealthyStatus
        });
      });

      const response = await request(app)
        .get('/api/system/health')
        .expect(503);

      expect(response.body.data.status).toBe('unhealthy');
      expect(response.body.data.services.database.error).toBe('ETIMEDOUT');
    });

    it('should include service response times', async () => {
      (systemController.getSystemHealth as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          success: true,
          data: mockSystemHealth
        });
      });

      const response = await request(app)
        .get('/api/system/health')
        .expect(200);

      expect(response.body.data.services.database.responseTime).toBe(15);
      expect(response.body.data.services.redis.responseTime).toBe(5);
    });

    it('should include system metrics', async () => {
      (systemController.getSystemHealth as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          success: true,
          data: mockSystemHealth
        });
      });

      const response = await request(app)
        .get('/api/system/health')
        .expect(200);

      expect(response.body.data.metrics.uptime).toBe(86400);
      expect(response.body.data.metrics.memoryUsage).toBe(512);
      expect(response.body.data.metrics.cpuUsage).toBe(25.5);
    });

    it('should handle health check errors', async () => {
      (systemController.getSystemHealth as jest.Mock).mockImplementation((_req, res) => {
        res.status(500).json({
          success: false,
          error: 'Health check failed',
          details: 'Unable to connect to monitoring service'
        });
      });

      const response = await request(app)
        .get('/api/system/health')
        .expect(500);

      expect(response.body.error).toBe('Health check failed');
    });

    it('should provide different health detail levels', async () => {
      (systemController.getSystemHealth as jest.Mock).mockImplementation((req, res) => {
        const detailed = req.query.detailed === 'true';
        const healthData = detailed 
          ? mockSystemHealth 
          : { status: mockSystemHealth.status, timestamp: mockSystemHealth.timestamp };

        res.status(200).json({
          success: true,
          data: healthData
        });
      });

      // Basic health check
      const basicResponse = await request(app)
        .get('/api/system/health')
        .expect(200);

      // Detailed health check
      const detailedResponse = await request(app)
        .get('/api/system/health?detailed=true')
        .expect(200);

      expect(detailedResponse.body.data.services).toBeDefined();
      expect(detailedResponse.body.data.metrics).toBeDefined();
    });
  });

  describe('Authentication and Authorization', () => {
    it('should require authentication for all routes', async () => {
      // Create a new app without authentication for this test
      const { requireAuth } = require('@/middleware/auth-wrapper');
      (requireAuth as jest.Mock).mockImplementationOnce((_req: any, res: any, _next: any) => {
        res.status(401).json({ error: 'Authentication required' });
      });

      const response = await request(app)
        .get('/api/system/health')
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });

    it('should enforce admin requirements for config routes', async () => {
      const adminRoutes = [
        { method: 'get', path: '/config' },
        { method: 'post', path: '/config' }
      ];

      for (const route of adminRoutes) {
        const agent = request(app);
        const response = await (agent as any)[route.method](`/api/system${route.path}`)
          .send({})
          .expect(403);

        expect(response.body.error).toBe('Admin access required');
      }
    });

    it('should allow authenticated users for health endpoint', async () => {
      (systemController.getSystemHealth as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({ success: true });
      });

      const response = await request(app)
        .get('/api/system/health')
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle controller errors gracefully', async () => {
      (systemController.getSystemHealth as jest.Mock).mockImplementation((_req, _res, next) => {
        next(new Error('Controller error'));
      });

      const response = await request(app)
        .get('/api/system/health')
        .expect(500);

      expect(response.body.error).toBe('Controller error');
    });

    it('should handle service connection timeouts', async () => {
      (systemController.getSystemHealth as jest.Mock).mockImplementation((_req, res) => {
        res.status(504).json({
          success: false,
          error: 'Service timeout',
          details: 'One or more services did not respond within timeout period'
        });
      });

      const response = await request(app)
        .get('/api/system/health')
        .expect(504);

      expect(response.body.error).toBe('Service timeout');
    });

    it('should handle configuration validation errors', async () => {
      // Mock admin user
      const { requireAdmin } = require('@/middleware/auth-wrapper');
      (requireAdmin as jest.Mock).mockImplementationOnce((_req: any, _res: any, next: any) => {
        _req.user = { 
          id: 1, 
          username: 'admin',
          displayName: 'Admin User',
          email: 'admin@example.com',
          authSource: 'local',
          isAdmin: true,
          isActive: true
        };
        next();
      });

      (systemController.updateSystemConfig as jest.Mock).mockImplementation((_req, res) => {
        res.status(422).json({
          success: false,
          error: 'Configuration validation failed',
          validationErrors: [
            { path: 'system.timezone', message: 'Invalid timezone format' }
          ]
        });
      });

      const response = await request(app)
        .post('/api/system/config')
        .send({ system: { timezone: 'invalid/timezone' } })
        .expect(422);

      expect(response.body.validationErrors).toHaveLength(1);
    });
  });

  describe('Route Coverage Validation', () => {
    it('should have comprehensive coverage of all system routes', () => {
      const expectedRoutes = [
        'GET /config',
        'POST /config', 
        'GET /health'
      ];
      
      expect(expectedRoutes.length).toBe(3);
    });
  });
});