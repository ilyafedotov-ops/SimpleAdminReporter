import request from 'supertest';
import express from 'express';
import { SystemController } from './system.controller';
import { configService } from '@/config/config.service';
import { logger } from '@/utils/logger';
import { requireAuth, requireAdmin } from '@/middleware/auth-wrapper';

// Mock all dependencies
jest.mock('@/config/config.service');
jest.mock('@/utils/logger');
jest.mock('@/middleware/auth-wrapper');

describe('SystemController', () => {
  let app: express.Application;
  let systemController: SystemController;

  const mockUser = {
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
    role: 'user'
  };

  const mockAdminUser = {
    id: 2,
    username: 'adminuser',
    email: 'admin@example.com',
    role: 'admin'
  };

  const mockConfig = {
    app: {
      nodeEnv: 'test',
      jwtSecret: 'test-jwt-secret',
      port: 3000
    },
    database: {
      host: 'localhost',
      database: 'test_db',
      port: 5432
    },
    redis: {
      host: 'localhost',
      port: 6379
    },
    ad: {
      server: 'ldap://test-dc.example.com',
      baseDN: 'DC=example,DC=com'
    },
    azure: {
      tenantId: 'test-tenant-id',
      clientId: 'test-client-id'
    },
    mockData: false
  };

  const mockServiceAvailability = {
    database: true,
    redis: true,
    ad: true,
    azure: true
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _mockValidationResult = {
    errors: [],
    warnings: [],
    availability: mockServiceAvailability
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set up test environment variables
    process.env.npm_package_version = '1.0.0';
    process.env.NODE_ENV = 'test';
    
    app = express();
    app.use(express.json());
    
    systemController = new SystemController();

    // Mock authentication middleware
    (requireAuth as jest.Mock).mockImplementation((req: any, res, _next) => {
      req.user = mockUser;
      _next();
    });

    (requireAdmin as jest.Mock).mockImplementation((req: any, res, _next) => {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }
      _next();
    });

    // Mock config service methods
    (configService.getConfig as jest.Mock).mockReturnValue(mockConfig);
    (configService.getServiceAvailability as jest.Mock).mockReturnValue(mockServiceAvailability);
    (configService.getErrors as jest.Mock).mockReturnValue([]);
    (configService.hasErrors as jest.Mock).mockReturnValue(false);
    (configService.initialize as jest.Mock).mockResolvedValue(mockValidationResult);

    // Create router and register routes
    const router = express.Router();
    router.get('/config', requireAuth, requireAdmin, systemController.getSystemConfig);
    router.post('/config', requireAuth, requireAdmin, systemController.updateSystemConfig);
    router.get('/health', requireAuth, systemController.getSystemHealth);
    
    app.use('/api/system', router);
    
    // Add error middleware
    app.use((err: any, req: any, res: any, _next: any) => {
      const statusCode = err.statusCode || 500;
      res.status(statusCode).json({
        error: err.message || 'Internal Server Error'
      });
    });

    // Mock process.uptime
    jest.spyOn(process, 'uptime').mockReturnValue(3661); // 1 hour, 1 minute, 1 second
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.npm_package_version;
    delete process.env.NODE_ENV;
  });

  describe('GET /api/system/config', () => {
    beforeEach(() => {
      // Mock admin user for config endpoints
      (requireAuth as jest.Mock).mockImplementation((req: any, res, _next) => {
        req.user = mockAdminUser;
        _next();
      });
    });

    it('should return system configuration successfully', async () => {
      const response = await request(app)
        .get('/api/system/config')
        .expect(200);

      expect(response.body).toEqual({
        availability: mockServiceAvailability,
        errors: [],
        warnings: [],
        environment: 'test',
        version: '1.0.0',
        uptime: '1h 1m',
        jwtConfigured: true,
        rateLimiting: true,
        mockData: false,
        services: {
          database: {
            host: 'localhost',
            database: 'test_db',
            connected: true
          },
          redis: {
            host: 'localhost',
            connected: true
          },
          ad: {
            server: 'ldap://test-dc.example.com',
            configured: true
          },
          azure: {
            tenantId: 'test-tenant-id',
            configured: true
          }
        }
      });

      expect(configService.getConfig).toHaveBeenCalledTimes(1);
      expect(configService.getServiceAvailability).toHaveBeenCalledTimes(1);
      // getErrors is not called in getSystemConfig - it gets errors from initialize()
      expect(configService.initialize).toHaveBeenCalledTimes(1);
    });

    it('should handle missing jwt secret', async () => {
      const configWithoutJWT = {
        ...mockConfig,
        app: {
          ...mockConfig.app,
          jwtSecret: undefined
        }
      };
      (configService.getConfig as jest.Mock).mockReturnValue(configWithoutJWT);

      const response = await request(app)
        .get('/api/system/config')
        .expect(200);

      expect(response.body.jwtConfigured).toBe(false);
    });

    it('should handle missing AD configuration', async () => {
      const configWithoutAD = {
        ...mockConfig,
        ad: null
      };
      (configService.getConfig as jest.Mock).mockReturnValue(configWithoutAD);

      const response = await request(app)
        .get('/api/system/config')
        .expect(200);

      expect(response.body.services.ad).toBeNull();
    });

    it('should handle missing Azure configuration', async () => {
      const configWithoutAzure = {
        ...mockConfig,
        azure: null
      };
      (configService.getConfig as jest.Mock).mockReturnValue(configWithoutAzure);

      const response = await request(app)
        .get('/api/system/config')
        .expect(200);

      expect(response.body.services.azure).toBeNull();
    });

    it('should include validation errors and warnings', async () => {
      const validationWithIssues = {
        errors: ['Database connection failed'],
        warnings: ['AD service slow'],
        availability: {
          ...mockServiceAvailability,
          database: false
        }
      };
      (configService.initialize as jest.Mock).mockResolvedValue(validationWithIssues);
      (configService.getServiceAvailability as jest.Mock).mockReturnValue({
        ...mockServiceAvailability,
        database: false
      });

      const response = await request(app)
        .get('/api/system/config')
        .expect(200);

      expect(response.body.errors).toEqual(['Database connection failed']);
      expect(response.body.warnings).toEqual(['AD service slow']);
      expect(response.body.services.database.connected).toBe(false);
    });

    it('should handle config service errors', async () => {
      const error = new Error('Config service failed');
      (configService.getConfig as jest.Mock).mockImplementation(() => {
        throw error;
      });

      const response = await request(app)
        .get('/api/system/config')
        .expect(500);

      expect(response.body).toEqual({
        error: 'Failed to retrieve system configuration',
        message: 'Config service failed'
      });

      expect(logger.error).toHaveBeenCalledWith('Failed to get system configuration:', error);
    });

    it('should use default version when npm_package_version is not set', async () => {
      delete process.env.npm_package_version;

      const response = await request(app)
        .get('/api/system/config')
        .expect(200);

      expect(response.body.version).toBe('1.0.0');
    });

    it('should require admin access', async () => {
      // Use regular user (not admin)
      (requireAuth as jest.Mock).mockImplementation((req: any, res, _next) => {
        req.user = mockUser;
        _next();
      });

      await request(app)
        .get('/api/system/config')
        .expect(403);
    });
  });

  describe('POST /api/system/config', () => {
    beforeEach(() => {
      // Mock admin user for config endpoints
      (requireAuth as jest.Mock).mockImplementation((req: any, res, _next) => {
        req.user = mockAdminUser;
        _next();
      });
    });

    it('should update system configuration successfully', async () => {
      const updateData = {
        rateLimiting: false,
        mockData: true
      };

      const response = await request(app)
        .post('/api/system/config')
        .send(updateData)
        .expect(200);

      expect(response.body.rateLimiting).toBe(false);
      expect(response.body.mockData).toBe(true);

      expect(logger.info).toHaveBeenCalledWith('System configuration update requested', {
        userId: mockAdminUser.id,
        changes: updateData
      });
    });

    it('should handle partial configuration updates', async () => {
      const updateData = {
        rateLimiting: false
        // mockData not provided
      };

      const response = await request(app)
        .post('/api/system/config')
        .send(updateData)
        .expect(200);

      expect(response.body.rateLimiting).toBe(false);
      expect(response.body.mockData).toBe(false); // Should use existing config value
    });

    it('should handle empty update requests', async () => {
      const response = await request(app)
        .post('/api/system/config')
        .send({})
        .expect(200);

      expect(response.body.rateLimiting).toBe(true); // Default value
      expect(response.body.mockData).toBe(false); // From existing config
    });

    it('should handle config service errors during update', async () => {
      const error = new Error('Config update failed');
      (configService.getConfig as jest.Mock).mockImplementation(() => {
        throw error;
      });

      const response = await request(app)
        .post('/api/system/config')
        .send({ rateLimiting: false })
        .expect(500);

      expect(response.body).toEqual({
        error: 'Failed to update system configuration',
        message: 'Config update failed'
      });

      expect(logger.error).toHaveBeenCalledWith('Failed to update system configuration:', error);
    });

    it('should require admin access for updates', async () => {
      // Use regular user (not admin)
      (requireAuth as jest.Mock).mockImplementation((req: any, res, _next) => {
        req.user = mockUser;
        _next();
      });

      await request(app)
        .post('/api/system/config')
        .send({ rateLimiting: false })
        .expect(403);
    });

    it('should log configuration changes with user info', async () => {
      const updateData = {
        rateLimiting: true,
        mockData: false
      };

      await request(app)
        .post('/api/system/config')
        .send(updateData)
        .expect(200);

      expect(logger.info).toHaveBeenCalledWith('System configuration update requested', {
        userId: mockAdminUser.id,
        changes: updateData
      });
    });
  });

  describe('GET /api/system/health', () => {
    it('should return healthy status when no errors', async () => {
      const response = await request(app)
        .get('/api/system/health')
        .expect(200);

      expect(response.body).toEqual({
        status: 'healthy',
        timestamp: expect.any(String),
        services: mockServiceAvailability,
        errors: [],
        uptime: 3661
      });

      expect(configService.getServiceAvailability).toHaveBeenCalledTimes(1);
      expect(configService.getErrors).toHaveBeenCalledTimes(1);
      expect(configService.hasErrors).toHaveBeenCalledTimes(1);
    });

    it('should return unhealthy status when errors exist', async () => {
      const errors = ['Database connection failed', 'Redis unavailable'];
      (configService.hasErrors as jest.Mock).mockReturnValue(true);
      (configService.getErrors as jest.Mock).mockReturnValue(errors);

      const response = await request(app)
        .get('/api/system/health')
        .expect(503);

      expect(response.body).toEqual({
        status: 'unhealthy',
        timestamp: expect.any(String),
        services: mockServiceAvailability,
        errors: errors,
        uptime: 3661
      });
    });

    it('should handle health check service errors', async () => {
      const error = new Error('Health check failed');
      (configService.getServiceAvailability as jest.Mock).mockImplementation(() => {
        throw error;
      });

      const response = await request(app)
        .get('/api/system/health')
        .expect(500);

      expect(response.body).toEqual({
        status: 'error',
        timestamp: expect.any(String),
        error: 'Failed to retrieve system health',
        message: 'Health check failed'
      });

      expect(logger.error).toHaveBeenCalledWith('Failed to get system health:', error);
    });

    it('should include valid ISO timestamp', async () => {
      const response = await request(app)
        .get('/api/system/health')
        .expect(200);

      const timestamp = response.body.timestamp;
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(new Date(timestamp).toISOString()).toBe(timestamp);
    });

    it('should require authentication', async () => {
      // Mock authentication failure
      (requireAuth as jest.Mock).mockImplementation((req: any, res, _next) => {
        return res.status(401).json({ error: 'Unauthorized' });
      });

      await request(app)
        .get('/api/system/health')
        .expect(401);
    });
  });

  describe('formatUptime method', () => {
    beforeEach(() => {
      // Ensure admin user for config endpoint tests
      (requireAuth as jest.Mock).mockImplementation((req: any, res, _next) => {
        req.user = mockAdminUser;
        _next();
      });
    });

    it('should format uptime correctly for various durations', async () => {
      // Test different uptime scenarios by mocking process.uptime
      const testCases = [
        { seconds: 30, expected: '< 1m' },
        { seconds: 90, expected: '1m' },
        { seconds: 3600, expected: '1h' },
        { seconds: 3661, expected: '1h 1m' },
        { seconds: 86400, expected: '1d' },
        { seconds: 90061, expected: '1d 1h 1m' },
        { seconds: 172800, expected: '2d' },
        { seconds: 176461, expected: '2d 1h 1m' }
      ];

      for (const { seconds, expected } of testCases) {
        jest.spyOn(process, 'uptime').mockReturnValue(seconds);
        
        // Reset mocks to ensure clean state
        (configService.getConfig as jest.Mock).mockReturnValue(mockConfig);
        (configService.getServiceAvailability as jest.Mock).mockReturnValue(mockServiceAvailability);
        (configService.getErrors as jest.Mock).mockReturnValue([]);
        (configService.initialize as jest.Mock).mockResolvedValue(mockValidationResult);

        const response = 
      await request(app)
          .get('/api/system/config')
          .expect(200);
        
        expect(response.body.uptime).toBe(expected);
      }
    });
  });

  describe('Authentication and Authorization', () => {
    it('should require authentication for all endpoints', async () => {
      // Mock authentication failure
      const failingAuth = jest.fn((req: any, res, _next) => {
        return res.status(401).json({ error: 'Unauthorized' });
      });

      // Create new app instance with failing auth
      const authApp = express();
      authApp.use(express.json());
      
      const authController = new SystemController();
      const router = express.Router();
      
      router.get('/config', failingAuth, authController.getSystemConfig);
      router.post('/config', failingAuth, authController.updateSystemConfig);
      router.get('/health', failingAuth, authController.getSystemHealth);
      
      authApp.use('/api/system', router);

      await request(authApp).get('/api/system/config').expect(401);
      await request(authApp).post('/api/system/config').expect(401);
      await request(authApp).get('/api/system/health').expect(401);
    });

    it('should require admin access for config endpoints only', async () => {
      // Mock regular user authentication
      (requireAuth as jest.Mock).mockImplementation((req: any, res, _next) => {
        req.user = mockUser; // Regular user, not admin
        _next();
      });

      // Config endpoints should fail with 403
      await request(app).get('/api/system/config').expect(403);
      await request(app).post('/api/system/config').expect(403);

      // Health endpoint should work for regular users
      await request(app).get('/api/system/health').expect(200);
    });
  });

  describe('Error Handling', () => {
    it('should handle middleware errors gracefully', async () => {
      // Create new app instance with error-throwing middleware
      const errorApp = express();
      errorApp.use(express.json());
      
      const errorMiddleware = jest.fn((_req: any, _res, next) => {
        next(new Error('Middleware error'));
      });

      const errorController = new SystemController();
      const router = express.Router();
      
      router.get('/health', errorMiddleware, errorController.getSystemHealth);
      
      errorApp.use('/api/system', router);
      
      // Add error middleware
      errorApp.use((err: any, req: any, res: any, _next: any) => {
        const statusCode = err.statusCode || 500;
        res.status(statusCode).json({
          error: err.message || 'Internal Server Error'
        });
      });

      const response = await request(errorApp)
        .get('/api/system/health')
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });

    it('should handle malformed JSON in POST requests', async () => {
      // Mock admin user
      (requireAuth as jest.Mock).mockImplementation((req: any, res, _next) => {
        req.user = mockAdminUser;
        _next();
      });

      const response = await request(app)
        .post('/api/system/config')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing user in request object', async () => {
      // Mock authentication but don't set user - this bypasses admin check for this test
      (requireAuth as jest.Mock).mockImplementation((req: any, res, _next) => {
        // req.user is undefined
        _next();
      });
      
      // Mock admin middleware to pass without user
      (requireAdmin as jest.Mock).mockImplementation((req: any, res, _next) => {
        _next();
      });

      await request(app)
        .post('/api/system/config')
        .send({ rateLimiting: false })
        .expect(200);

      expect(logger.info).toHaveBeenCalledWith('System configuration update requested', {
        userId: undefined,
        changes: { rateLimiting: false }
      });
    });

    it('should handle config service returning null values', async () => {
      const nullConfig = {
        ...mockConfig,
        ad: null,
        azure: null
      };
      (configService.getConfig as jest.Mock).mockReturnValue(nullConfig);

      const response = await request(app)
        .get('/api/system/health')
        .expect(200);

      expect(response.body.services).toBeDefined();
    });

    it('should handle very large uptime values', async () => {
      // Test with very large uptime (over a year)
      const largeUptime = 31536000 + 86400 + 3600 + 60; // 1 year + 1 day + 1 hour + 1 minute
      jest.spyOn(process, 'uptime').mockReturnValue(largeUptime);

      const response = await request(app)
        .get('/api/system/health')
        .expect(200);

      expect(response.body.uptime).toBe(largeUptime); // Raw seconds value
    });

    it('should handle initialization failures gracefully', async () => {
      // Mock admin user for config endpoint
      (requireAuth as jest.Mock).mockImplementation((req: any, res, _next) => {
        req.user = mockAdminUser;
        _next();
      });
      
      const initError = new Error('Initialization failed');
      (configService.initialize as jest.Mock).mockRejectedValue(initError);

      const response = await request(app)
        .get('/api/system/config')
        .expect(500);

      expect(response.body.error).toBe('Failed to retrieve system configuration');
      expect(response.body.message).toBe('Initialization failed');
    });
  });

  describe('Data Validation', () => {
    it('should validate timestamp format in all responses', async () => {
      // Test health endpoint
      const healthRes = await request(app)
        .get('/api/system/health')
        .expect(200);
      
      expect(healthRes.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

      // Test config endpoint (requires admin)
      (requireAuth as jest.Mock).mockImplementation((req: any, res, _next) => {
        req.user = mockAdminUser;
        _next();
      });

      const configRes = await request(app)
        .get('/api/system/config')
        .expect(200);
      
      // Config endpoint doesn't return timestamp, but verify other data
      expect(configRes.body.version).toBeDefined();
      expect(configRes.body.uptime).toBeDefined();
    });

    it('should return consistent data structure', async () => {
      const response = await request(app)
        .get('/api/system/health')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('services');
      expect(response.body).toHaveProperty('errors');
      expect(response.body).toHaveProperty('uptime');

      expect(typeof response.body.status).toBe('string');
      expect(typeof response.body.timestamp).toBe('string');
      expect(typeof response.body.services).toBe('object');
      expect(Array.isArray(response.body.errors)).toBe(true);
      expect(typeof response.body.uptime).toBe('number');
    });
  });

  describe('Service Integration', () => {
    it('should call all required config service methods for system config', async () => {
      (requireAuth as jest.Mock).mockImplementation((req: any, res, _next) => {
        req.user = mockAdminUser;
        _next();
      });

      await request(app)
        .get('/api/system/config')
        .expect(200);

      expect(configService.getConfig).toHaveBeenCalledTimes(1);
      expect(configService.getServiceAvailability).toHaveBeenCalledTimes(1);
      // getErrors is not called in getSystemConfig - it gets errors from initialize()
      expect(configService.initialize).toHaveBeenCalledTimes(1);
    });

    it('should call required config service methods for health check', async () => {
      await request(app)
        .get('/api/system/health')
        .expect(200);

      expect(configService.getServiceAvailability).toHaveBeenCalledTimes(1);
      expect(configService.getErrors).toHaveBeenCalledTimes(1);
      expect(configService.hasErrors).toHaveBeenCalledTimes(1);
    });

    it('should handle service method call order correctly', async () => {
      const callOrder: string[] = [];
      
      (configService.getServiceAvailability as jest.Mock).mockImplementation(() => {
        callOrder.push('getServiceAvailability');
        return mockServiceAvailability;
      });

      (configService.getErrors as jest.Mock).mockImplementation(() => {
        callOrder.push('getErrors');
        return [];
      });

      (configService.hasErrors as jest.Mock).mockImplementation(() => {
        callOrder.push('hasErrors');
        return false;
      });

      await request(app)
        .get('/api/system/health')
        .expect(200);

      expect(callOrder).toEqual(['getServiceAvailability', 'getErrors', 'hasErrors']);
    });
  });
});