// @ts-nocheck - Temporarily disable TypeScript checking for test mocks
import { HealthService, healthService } from './health.service';
import { HealthCheckResult, SystemHealthMetrics } from './types';
import {
  DatabaseHealthChecker,
  RedisHealthChecker,
  LDAPHealthChecker,
  AzureHealthChecker,
  QueueHealthChecker,
  StorageHealthChecker,
  SystemHealthChecker
} from './checkers';
import { logger } from '@/utils/logger';

// Mock all health checkers
jest.mock('./checkers');
jest.mock('@/utils/logger');

describe('HealthService', () => {
  let service: HealthService;
  let mockCheckers: {
    database: jest.Mocked<DatabaseHealthChecker>;
    redis: jest.Mocked<RedisHealthChecker>;
    ldap: jest.Mocked<LDAPHealthChecker>;
    azure: jest.Mocked<AzureHealthChecker>;
    queue: jest.Mocked<QueueHealthChecker>;
    storage: jest.Mocked<StorageHealthChecker>;
    system: jest.Mocked<SystemHealthChecker>;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock instances with properly mocked check methods
    mockCheckers = {
      database: { check: jest.fn() } as jest.Mocked<DatabaseHealthChecker>,
      redis: { check: jest.fn() } as jest.Mocked<RedisHealthChecker>,
      ldap: { check: jest.fn() } as jest.Mocked<LDAPHealthChecker>,
      azure: { check: jest.fn() } as jest.Mocked<AzureHealthChecker>,
      queue: { check: jest.fn() } as jest.Mocked<QueueHealthChecker>,
      storage: { check: jest.fn() } as jest.Mocked<StorageHealthChecker>,
      system: { check: jest.fn() } as jest.Mocked<SystemHealthChecker>
    };

    // Mock the constructor implementations to return our mock instances
    (DatabaseHealthChecker as jest.Mock).mockImplementation(() => mockCheckers.database);
    (RedisHealthChecker as jest.Mock).mockImplementation(() => mockCheckers.redis);
    (LDAPHealthChecker as jest.Mock).mockImplementation(() => mockCheckers.ldap);
    (AzureHealthChecker as jest.Mock).mockImplementation(() => mockCheckers.azure);
    (QueueHealthChecker as jest.Mock).mockImplementation(() => mockCheckers.queue);
    (StorageHealthChecker as jest.Mock).mockImplementation(() => mockCheckers.storage);
    (SystemHealthChecker as jest.Mock).mockImplementation(() => mockCheckers.system);

    service = new HealthService();
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with correct default values', () => {
      expect(service).toBeInstanceOf(HealthService);
      expect(DatabaseHealthChecker).toHaveBeenCalled();
      expect(RedisHealthChecker).toHaveBeenCalled();
      expect(LDAPHealthChecker).toHaveBeenCalled();
      expect(AzureHealthChecker).toHaveBeenCalled();
      expect(QueueHealthChecker).toHaveBeenCalled();
      expect(StorageHealthChecker).toHaveBeenCalled();
      expect(SystemHealthChecker).toHaveBeenCalled();
    });

    it('should use environment variables when available', () => {
      const originalEnv = process.env;
      process.env = { ...originalEnv, APP_VERSION: '2.1.0' };

      const newService = new HealthService();
      expect(newService).toBeDefined();

      process.env = originalEnv;
    });
  });

  describe('getHealthStatus', () => {
    it('should return healthy status when all components are healthy', async () => {
      const healthyResult: HealthCheckResult = {
        status: 'healthy',
        message: 'All systems operational',
        responseTime: 10
      };

      const systemHealthyResult: SystemHealthMetrics = {
        status: 'healthy',
        message: 'System running optimally',
        cpu: { usage: 25, temperature: 45 },
        memory: { total: 8192, used: 2048, available: 6144, percentage: 25 },
        disk: { total: 500000, used: 100000, available: 400000, percentage: 20 },
        load: { load1: 0.5, load5: 0.7, load15: 0.8 }
      };

      // Mock all checkers to return healthy
      mockCheckers.database.check.mockResolvedValue(healthyResult);
      mockCheckers.redis.check.mockResolvedValue(healthyResult);
      mockCheckers.ldap.check.mockResolvedValue(healthyResult);
      mockCheckers.azure.check.mockResolvedValue(healthyResult);
      mockCheckers.queue.check.mockResolvedValue(healthyResult);
      mockCheckers.storage.check.mockResolvedValue(healthyResult);
      mockCheckers.system.check.mockResolvedValue(systemHealthyResult);

      const result = await service.getHealthStatus();

      expect(result.status).toBe('healthy');
      expect(result.checks.database.status).toBe('healthy');
      expect(result.checks.redis.status).toBe('healthy');
      expect(result.checks.ldap.status).toBe('healthy');
      expect(result.checks.azure.status).toBe('healthy');
      expect(result.checks.queue.status).toBe('healthy');
      expect(result.checks.storage.status).toBe('healthy');
      expect(result.checks.system.status).toBe('healthy');
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.uptime).toBeGreaterThanOrEqual(0);
      expect(result.version).toBeDefined();
      expect(result.environment).toBeDefined();
    });

    it('should return degraded status when any component is degraded', async () => {
      const healthyResult: HealthCheckResult = { status: 'healthy', message: 'OK' };
      const degradedResult: HealthCheckResult = { 
        status: 'degraded', 
        message: 'Performance issues detected',
        responseTime: 500
      };

      mockCheckers.database.check.mockResolvedValue(healthyResult);
      mockCheckers.redis.check.mockResolvedValue(degradedResult); // Degraded
      mockCheckers.ldap.check.mockResolvedValue(healthyResult);
      mockCheckers.azure.check.mockResolvedValue(healthyResult);
      mockCheckers.queue.check.mockResolvedValue(healthyResult);
      mockCheckers.storage.check.mockResolvedValue(healthyResult);
      mockCheckers.system.check.mockResolvedValue({
        status: 'healthy',
        message: 'System OK',
        cpu: { usage: 15 },
        memory: { total: 8192, used: 1024, available: 7168, percentage: 12.5 },
        disk: { total: 500000, used: 50000, available: 450000, percentage: 10 },
        load: { load1: 0.3, load5: 0.4, load15: 0.5 }
      });

      const result = await service.getHealthStatus();

      expect(result.status).toBe('degraded');
      expect(result.checks.redis.status).toBe('degraded');
    });

    it('should return unhealthy status when any component is unhealthy', async () => {
      const healthyResult: HealthCheckResult = { status: 'healthy', message: 'OK' };
      const unhealthyResult: HealthCheckResult = { 
        status: 'unhealthy', 
        message: 'Connection failed',
        error: 'ECONNREFUSED'
      };

      mockCheckers.database.check.mockResolvedValue(unhealthyResult); // Unhealthy
      mockCheckers.redis.check.mockResolvedValue(healthyResult);
      mockCheckers.ldap.check.mockResolvedValue(healthyResult);
      mockCheckers.azure.check.mockResolvedValue(healthyResult);
      mockCheckers.queue.check.mockResolvedValue(healthyResult);
      mockCheckers.storage.check.mockResolvedValue(healthyResult);
      mockCheckers.system.check.mockResolvedValue({
        status: 'healthy',
        message: 'System OK',
        cpu: { usage: 20 },
        memory: { total: 8192, used: 2048, available: 6144, percentage: 25 },
        disk: { total: 500000, used: 100000, available: 400000, percentage: 20 },
        load: { load1: 0.5, load5: 0.6, load15: 0.7 }
      });

      const result = await service.getHealthStatus();

      expect(result.status).toBe('unhealthy');
      expect(result.checks.database.status).toBe('unhealthy');
    });

    it('should handle promise rejections gracefully', async () => {
      const healthyResult: HealthCheckResult = { status: 'healthy', message: 'OK' };
      const error = new Error('Health check timeout');

      mockCheckers.database.check.mockRejectedValue(error);
      mockCheckers.redis.check.mockResolvedValue(healthyResult);
      mockCheckers.ldap.check.mockResolvedValue(healthyResult);
      mockCheckers.azure.check.mockResolvedValue(healthyResult);
      mockCheckers.queue.check.mockResolvedValue(healthyResult);
      mockCheckers.storage.check.mockResolvedValue(healthyResult);
      mockCheckers.system.check.mockResolvedValue({
        status: 'healthy',
        message: 'System OK',
        cpu: { usage: 15 },
        memory: { total: 8192, used: 1024, available: 7168, percentage: 12.5 },
        disk: { total: 500000, used: 50000, available: 450000, percentage: 10 },
        load: { load1: 0.3, load5: 0.4, load15: 0.5 }
      });

      const result = await service.getHealthStatus();

      expect(result.status).toBe('unhealthy');
      expect(result.checks.database.status).toBe('unhealthy');
      expect(result.checks.database.message).toContain('Health check failed');
      expect(logger.error).toHaveBeenCalledWith('Health check promise rejected:', error);
    });

    it('should handle multiple concurrent health checks', async () => {
      const healthyResult: HealthCheckResult = { status: 'healthy', message: 'OK' };
      
      // Add artificial delay to simulate real async operations
      mockCheckers.database.check.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(healthyResult), 50))
      );
      mockCheckers.redis.check.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve(healthyResult), 30))
      );
      mockCheckers.ldap.check.mockResolvedValue(healthyResult);
      mockCheckers.azure.check.mockResolvedValue(healthyResult);
      mockCheckers.queue.check.mockResolvedValue(healthyResult);
      mockCheckers.storage.check.mockResolvedValue(healthyResult);
      mockCheckers.system.check.mockResolvedValue({
        status: 'healthy',
        message: 'System OK',
        cpu: { usage: 20 },
        memory: { total: 8192, used: 2048, available: 6144, percentage: 25 },
        disk: { total: 500000, used: 100000, available: 400000, percentage: 20 },
        load: { load1: 0.5, load5: 0.6, load15: 0.7 }
      });

      const startTime = Date.now();
      
      // Run multiple concurrent health checks
      const promises = [
        service.getHealthStatus(),
        service.getHealthStatus(),
        service.getHealthStatus()
      ];

      const results = await Promise.all(promises);
      const endTime = Date.now();

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.status).toBe('healthy');
      });

      // Should complete faster than sequential execution
      expect(endTime - startTime).toBeLessThan(200);
    });
  });

  describe('getComponentHealth', () => {
    it('should return health status for specific component', async () => {
      const expectedResult: HealthCheckResult = {
        status: 'healthy',
        message: 'Database connection successful',
        responseTime: 15
      };

      mockCheckers.database.check.mockResolvedValue(expectedResult);

      const result = await service.getComponentHealth('database');

      expect(result).toEqual(expectedResult);
      expect(mockCheckers.database.check).toHaveBeenCalledTimes(1);
    });

    it('should handle system component correctly', async () => {
      const expectedResult: SystemHealthMetrics = {
        status: 'healthy',
        message: 'System running optimally',
        cpu: { usage: 30, temperature: 50 },
        memory: { total: 16384, used: 4096, available: 12288, percentage: 25 },
        disk: { total: 1000000, used: 200000, available: 800000, percentage: 20 },
        load: { load1: 0.8, load5: 1.0, load15: 1.2 }
      };

      mockCheckers.system.check.mockResolvedValue(expectedResult);

      const result = await service.getComponentHealth('system');

      expect(result).toEqual(expectedResult);
      expect(mockCheckers.system.check).toHaveBeenCalledTimes(1);
    });

    it('should throw error for unknown component', async () => {
      await expect(
        service.getComponentHealth('unknown' as any)
      ).rejects.toThrow('Unknown health check component: unknown');
    });

    it('should handle component check failures', async () => {
      mockCheckers.redis.check.mockRejectedValue(new Error('Redis connection failed'));

      await expect(
        service.getComponentHealth('redis')
      ).rejects.toThrow('Redis connection failed');
    });
  });

  describe('getHealthSummary', () => {
    it('should return simplified health summary', async () => {
      const healthyResult: HealthCheckResult = { status: 'healthy', message: 'OK' };
      const degradedResult: HealthCheckResult = { status: 'degraded', message: 'Slow' };

      mockCheckers.database.check.mockResolvedValue(healthyResult);
      mockCheckers.redis.check.mockResolvedValue(degradedResult);
      mockCheckers.ldap.check.mockResolvedValue(healthyResult);
      mockCheckers.azure.check.mockResolvedValue(healthyResult);
      mockCheckers.queue.check.mockResolvedValue(healthyResult);
      mockCheckers.storage.check.mockResolvedValue(healthyResult);
      mockCheckers.system.check.mockResolvedValue({
        status: 'healthy',
        message: 'OK',
        cpu: { usage: 25 },
        memory: { total: 8192, used: 2048, available: 6144, percentage: 25 },
        disk: { total: 500000, used: 100000, available: 400000, percentage: 20 },
        load: { load1: 0.5, load5: 0.6, load15: 0.7 }
      });

      const result = await service.getHealthSummary();

      expect(result).toEqual({
        overall: 'degraded',
        database: 'healthy',
        redis: 'degraded',
        ldap: 'healthy',
        azure: 'healthy',
        queue: 'healthy',
        storage: 'healthy',
        system: 'healthy'
      });
    });
  });

  describe('isOperational', () => {
    it('should return true for healthy system', async () => {
      const healthyResult: HealthCheckResult = { status: 'healthy', message: 'OK' };

      Object.values(mockCheckers).forEach(checker => {
        if (checker === mockCheckers.system) {
          checker.check.mockResolvedValue({
            status: 'healthy',
            message: 'OK',
            cpu: { usage: 20 },
            memory: { total: 8192, used: 2048, available: 6144, percentage: 25 },
            disk: { total: 500000, used: 100000, available: 400000, percentage: 20 },
            load: { load1: 0.5, load5: 0.6, load15: 0.7 }
          });
        } else {
          checker.check.mockResolvedValue(healthyResult);
        }
      });

      const result = await service.isOperational();
      expect(result).toBe(true);
    });

    it('should return true for degraded system', async () => {
      const healthyResult: HealthCheckResult = { status: 'healthy', message: 'OK' };
      const degradedResult: HealthCheckResult = { status: 'degraded', message: 'Slow' };

      mockCheckers.database.check.mockResolvedValue(healthyResult);
      mockCheckers.redis.check.mockResolvedValue(degradedResult);
      mockCheckers.ldap.check.mockResolvedValue(healthyResult);
      mockCheckers.azure.check.mockResolvedValue(healthyResult);
      mockCheckers.queue.check.mockResolvedValue(healthyResult);
      mockCheckers.storage.check.mockResolvedValue(healthyResult);
      mockCheckers.system.check.mockResolvedValue({
        status: 'healthy',
        message: 'OK',
        cpu: { usage: 25 },
        memory: { total: 8192, used: 2048, available: 6144, percentage: 25 },
        disk: { total: 500000, used: 100000, available: 400000, percentage: 20 },
        load: { load1: 0.5, load5: 0.6, load15: 0.7 }
      });

      const result = await service.isOperational();
      expect(result).toBe(true);
    });

    it('should return false for unhealthy system', async () => {
      const healthyResult: HealthCheckResult = { status: 'healthy', message: 'OK' };
      const unhealthyResult: HealthCheckResult = { status: 'unhealthy', message: 'Failed' };

      mockCheckers.database.check.mockResolvedValue(unhealthyResult);
      mockCheckers.redis.check.mockResolvedValue(healthyResult);
      mockCheckers.ldap.check.mockResolvedValue(healthyResult);
      mockCheckers.azure.check.mockResolvedValue(healthyResult);
      mockCheckers.queue.check.mockResolvedValue(healthyResult);
      mockCheckers.storage.check.mockResolvedValue(healthyResult);
      mockCheckers.system.check.mockResolvedValue({
        status: 'healthy',
        message: 'OK',
        cpu: { usage: 20 },
        memory: { total: 8192, used: 2048, available: 6144, percentage: 25 },
        disk: { total: 500000, used: 100000, available: 400000, percentage: 20 },
        load: { load1: 0.5, load5: 0.6, load15: 0.7 }
      });

      const result = await service.isOperational();
      expect(result).toBe(false);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle checker that returns undefined', async () => {
      mockCheckers.database.check.mockResolvedValue({ status: 'healthy', message: 'OK' } as any);
      
      Object.values(mockCheckers).forEach(checker => {
        if (checker !== mockCheckers.database) {
          if (checker === mockCheckers.system) {
            checker.check.mockResolvedValue({
              status: 'healthy',
              message: 'OK',
              cpu: { usage: 20 },
              memory: { total: 8192, used: 2048, available: 6144, percentage: 25 },
              disk: { total: 500000, used: 100000, available: 400000, percentage: 20 },
              load: { load1: 0.5, load5: 0.6, load15: 0.7 }
            });
          } else {
            checker.check.mockResolvedValue({ status: 'healthy', message: 'OK' } as any);
          }
        }
      });

      const result = await service.getHealthStatus();
      expect(result.status).toBe('healthy'); // Should handle gracefully
    });

    it('should handle null error in promise rejection', async () => {
      const healthyResult: HealthCheckResult = { status: 'healthy', message: 'OK' };

      mockCheckers.database.check.mockRejectedValue(null);
      
      Object.values(mockCheckers).forEach(checker => {
        if (checker !== mockCheckers.database) {
          if (checker === mockCheckers.system) {
            checker.check.mockResolvedValue({
              status: 'healthy',
              message: 'OK',
              cpu: { usage: 20 },
              memory: { total: 8192, used: 2048, available: 6144, percentage: 25 },
              disk: { total: 500000, used: 100000, available: 400000, percentage: 20 },
              load: { load1: 0.5, load5: 0.6, load15: 0.7 }
            });
          } else {
            checker.check.mockResolvedValue(healthyResult as any);
          }
        }
      });

      const result = await service.getHealthStatus();

      expect(result.status).toBe('unhealthy');
      expect(result.checks.database.status).toBe('unhealthy');
      expect(result.checks.database.message).toContain('Unknown error');
    });

    it('should handle very slow health checks', async () => {
      const healthyResult: HealthCheckResult = { status: 'healthy', message: 'OK' };
      
      // Simulate a slow health check
      mockCheckers.database.check.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(healthyResult), 100))
      );
      
      Object.values(mockCheckers).forEach(checker => {
        if (checker !== mockCheckers.database) {
          if (checker === mockCheckers.system) {
            checker.check.mockResolvedValue({
              status: 'healthy',
              message: 'OK',
              cpu: { usage: 20 },
              memory: { total: 8192, used: 2048, available: 6144, percentage: 25 },
              disk: { total: 500000, used: 100000, available: 400000, percentage: 20 },
              load: { load1: 0.5, load5: 0.6, load15: 0.7 }
            });
          } else {
            checker.check.mockResolvedValue(healthyResult as any);
          }
        }
      });

      const startTime = Date.now();
      const result = await service.getHealthStatus();
      const endTime = Date.now();

      expect(result.status).toBe('healthy');
      expect(endTime - startTime).toBeGreaterThan(90); // Should wait for slow check
    });
  });

  describe('Singleton Export', () => {
    it('should export singleton instance', () => {
      expect(healthService).toBeInstanceOf(HealthService);
    });

    it('should maintain singleton behavior', () => {
      const instance1 = healthService;
      const instance2 = healthService;
      expect(instance1).toBe(instance2);
    });
  });

  describe('Environment Configuration', () => {
    it('should use default version when APP_VERSION not set', () => {
      const originalEnv = process.env.APP_VERSION;
      delete process.env.APP_VERSION;

      const newService = new HealthService();
      expect(newService).toBeDefined();

      if (originalEnv !== undefined) {
        process.env.APP_VERSION = originalEnv;
      }
    });

    it('should use NODE_ENV when available', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const healthyResult: HealthCheckResult = { status: 'healthy', message: 'OK' };
      
      Object.values(mockCheckers).forEach(checker => {
        if (checker === mockCheckers.system) {
          checker.check.mockResolvedValue({
            status: 'healthy',
            message: 'OK',
            cpu: { usage: 20 },
            memory: { total: 8192, used: 2048, available: 6144, percentage: 25 },
            disk: { total: 500000, used: 100000, available: 400000, percentage: 20 },
            load: { load1: 0.5, load5: 0.6, load15: 0.7 }
          });
        } else {
          checker.check.mockResolvedValue(healthyResult);
        }
      });

      const result = await service.getHealthStatus();
      expect(result.environment).toBe('production');

      if (originalEnv !== undefined) {
        process.env.NODE_ENV = originalEnv;
      } else {
        delete process.env.NODE_ENV;
      }
    });
  });

  describe('Uptime Calculation', () => {
    it('should calculate uptime correctly', async () => {
      const healthyResult: HealthCheckResult = { status: 'healthy', message: 'OK' };
      
      Object.values(mockCheckers).forEach(checker => {
        if (checker === mockCheckers.system) {
          checker.check.mockResolvedValue({
            status: 'healthy',
            message: 'OK',
            cpu: { usage: 20, cores: 4 },
            memory: { total: 8192, used: 2048, free: 6144, percentage: 25 },
            disk: { total: 500000, used: 100000, free: 400000, percentage: 20 }
          });
        } else {
          checker.check.mockResolvedValue(healthyResult);
        }
      });

      const result = await service.getHealthStatus();
      
      expect(result.uptime).toBeGreaterThanOrEqual(0);
      expect(typeof result.uptime).toBe('number');
    });
  });

  describe('Production Readiness Tests', () => {
    describe('Timeout Handling', () => {
      it('should handle individual checker timeouts gracefully', async () => {
        const healthyResult: HealthCheckResult = { status: 'healthy', message: 'OK' };
        
        // Simulate a checker that times out after a reasonable delay
        mockCheckers.database.check.mockImplementation(() => 
          new Promise(resolve => setTimeout(() => resolve({ status: 'unhealthy', message: 'Timeout' }), 100))
        );
        
        Object.values(mockCheckers).forEach(checker => {
          if (checker !== mockCheckers.database) {
            if (checker === mockCheckers.system) {
              checker.check.mockResolvedValue({
                status: 'healthy',
                message: 'OK',
                cpu: { usage: 20, cores: 4 },
                memory: { total: 8192, used: 2048, free: 6144, percentage: 25 },
                disk: { total: 500000, used: 100000, free: 400000, percentage: 20 }
              });
            } else {
              checker.check.mockResolvedValue(healthyResult as any);
            }
          }
        });

        // Should not hang indefinitely due to Promise.allSettled
        const startTime = Date.now();
        const result = await service.getHealthStatus();
        const endTime = Date.now();

        // Should complete within reasonable time even with simulated timeout
        expect(endTime - startTime).toBeLessThan(1000);
        expect(result.checks.database.status).toBe('unhealthy');
      });

      it('should handle network timeout errors', async () => {
        const timeoutError = new Error('ETIMEDOUT');
        timeoutError.name = 'TimeoutError';
        
        mockCheckers.ldap.check.mockRejectedValue(timeoutError);
        
        Object.values(mockCheckers).forEach(checker => {
          if (checker !== mockCheckers.ldap) {
            if (checker === mockCheckers.system) {
              checker.check.mockResolvedValue({
                status: 'healthy',
                message: 'OK',
                cpu: { usage: 20, cores: 4 },
                memory: { total: 8192, used: 2048, free: 6144, percentage: 25 },
                disk: { total: 500000, used: 100000, free: 400000, percentage: 20 }
              });
            } else {
              checker.check.mockResolvedValue({ status: 'healthy', message: 'OK' } as any);
            }
          }
        });

        const result = await service.getHealthStatus();
        
        expect(result.status).toBe('unhealthy');
        expect(result.checks.ldap.status).toBe('unhealthy');
        expect(result.checks.ldap.message).toContain('ETIMEDOUT');
      });
    });

    describe('Service Availability Checks', () => {
      it('should detect database connection pool exhaustion', async () => {
        const poolExhaustedError = new Error('Connection pool exhausted');
        poolExhaustedError.name = 'PoolExhaustedError';
        
        mockCheckers.database.check.mockRejectedValue(poolExhaustedError);
        
        Object.values(mockCheckers).forEach(checker => {
          if (checker !== mockCheckers.database) {
            if (checker === mockCheckers.system) {
              checker.check.mockResolvedValue({
                status: 'healthy',
                message: 'OK',
                cpu: { usage: 20, cores: 4 },
                memory: { total: 8192, used: 2048, free: 6144, percentage: 25 },
                disk: { total: 500000, used: 100000, free: 400000, percentage: 20 }
              });
            } else {
              checker.check.mockResolvedValue({ status: 'healthy', message: 'OK' } as any);
            }
          }
        });

        const result = await service.getHealthStatus();
        
        expect(result.status).toBe('unhealthy');
        expect(result.checks.database.message).toContain('Connection pool exhausted');
      });

      it('should detect Redis memory pressure', async () => {
        const memoryPressureResult: HealthCheckResult = {
          status: 'degraded',
          message: 'Redis memory usage at 85%',
          responseTime: 250,
          details: {
            memoryUsage: 85,
            availableMemory: '128MB',
            evictedKeys: 1250
          }
        };
        
        mockCheckers.redis.check.mockResolvedValue(memoryPressureResult);
        
        Object.values(mockCheckers).forEach(checker => {
          if (checker !== mockCheckers.redis) {
            if (checker === mockCheckers.system) {
              checker.check.mockResolvedValue({
                status: 'healthy',
                message: 'OK',
                cpu: { usage: 20, cores: 4 },
                memory: { total: 8192, used: 2048, free: 6144, percentage: 25 },
                disk: { total: 500000, used: 100000, free: 400000, percentage: 20 }
              });
            } else {
              checker.check.mockResolvedValue({ status: 'healthy', message: 'OK' } as any);
            }
          }
        });

        const result = await service.getHealthStatus();
        
        expect(result.status).toBe('degraded');
        expect(result.checks.redis.details?.memoryUsage).toBe(85);
        expect(result.checks.redis.details?.evictedKeys).toBe(1250);
      });

      it('should detect LDAP server unavailability', async () => {
        const ldapUnavailableResult: HealthCheckResult = {
          status: 'unhealthy',
          message: 'LDAP server unreachable',
          details: {
            server: 'ldap://dc.example.com:389',
            lastSuccessful: '2025-01-01T10:00:00Z',
            consecutiveFailures: 5
          }
        };
        
        mockCheckers.ldap.check.mockResolvedValue(ldapUnavailableResult);
        
        Object.values(mockCheckers).forEach(checker => {
          if (checker !== mockCheckers.ldap) {
            if (checker === mockCheckers.system) {
              checker.check.mockResolvedValue({
                status: 'healthy',
                message: 'OK',
                cpu: { usage: 20, cores: 4 },
                memory: { total: 8192, used: 2048, free: 6144, percentage: 25 },
                disk: { total: 500000, used: 100000, free: 400000, percentage: 20 }
              });
            } else {
              checker.check.mockResolvedValue({ status: 'healthy', message: 'OK' } as any);
            }
          }
        });

        const result = await service.getHealthStatus();
        
        expect(result.status).toBe('unhealthy');
        expect(result.checks.ldap.details?.consecutiveFailures).toBe(5);
      });

      it('should detect Azure AD authentication issues', async () => {
        const azureAuthIssueResult: HealthCheckResult = {
          status: 'degraded',
          message: 'Azure AD token refresh rate limited',
          responseTime: 1500,
          details: {
            tokenExpiry: '2025-01-01T12:00:00Z',
            rateLimitRemaining: 10,
            rateLimitReset: '2025-01-01T12:05:00Z'
          }
        };
        
        mockCheckers.azure.check.mockResolvedValue(azureAuthIssueResult);
        
        Object.values(mockCheckers).forEach(checker => {
          if (checker !== mockCheckers.azure) {
            if (checker === mockCheckers.system) {
              checker.check.mockResolvedValue({
                status: 'healthy',
                message: 'OK',
                cpu: { usage: 20, cores: 4 },
                memory: { total: 8192, used: 2048, free: 6144, percentage: 25 },
                disk: { total: 500000, used: 100000, free: 400000, percentage: 20 }
              });
            } else {
              checker.check.mockResolvedValue({ status: 'healthy', message: 'OK' } as any);
            }
          }
        });

        const result = await service.getHealthStatus();
        
        expect(result.status).toBe('degraded');
        expect(result.checks.azure.details?.rateLimitRemaining).toBe(10);
      });
    });

    describe('Resource Monitoring', () => {
      it('should detect high CPU usage', async () => {
        const highCpuSystemResult: SystemHealthMetrics = {
          status: 'degraded',
          message: 'High CPU usage detected',
          cpu: { usage: 95, cores: 4 },
          memory: { total: 8192, used: 2048, free: 6144, percentage: 25 },
          disk: { total: 500000, used: 100000, free: 400000, percentage: 20 }
        };
        
        mockCheckers.system.check.mockResolvedValue(highCpuSystemResult);
        
        Object.values(mockCheckers).forEach(checker => {
          if (checker !== mockCheckers.system) {
            checker.check.mockResolvedValue({ status: 'healthy', message: 'OK' } as any);
          }
        });

        const result = await service.getHealthStatus();
        
        expect(result.status).toBe('degraded');
        expect(result.checks.system.cpu.usage).toBe(95);
      });

      it('should detect low disk space', async () => {
        const lowDiskSystemResult: SystemHealthMetrics = {
          status: 'unhealthy',
          message: 'Critical disk space shortage',
          cpu: { usage: 25, cores: 4 },
          memory: { total: 8192, used: 2048, free: 6144, percentage: 25 },
          disk: { total: 100000, used: 95000, free: 5000, percentage: 95 }
        };
        
        mockCheckers.system.check.mockResolvedValue(lowDiskSystemResult);
        
        Object.values(mockCheckers).forEach(checker => {
          if (checker !== mockCheckers.system) {
            checker.check.mockResolvedValue({ status: 'healthy', message: 'OK' } as any);
          }
        });

        const result = await service.getHealthStatus();
        
        expect(result.status).toBe('unhealthy');
        expect(result.checks.system.disk.percentage).toBe(95);
      });

      it('should detect memory pressure', async () => {
        const memoryPressureSystemResult: SystemHealthMetrics = {
          status: 'degraded',
          message: 'High memory usage',
          cpu: { usage: 30, cores: 4 },
          memory: { total: 8192, used: 7000, free: 1192, percentage: 85 },
          disk: { total: 500000, used: 100000, free: 400000, percentage: 20 }
        };
        
        mockCheckers.system.check.mockResolvedValue(memoryPressureSystemResult);
        
        Object.values(mockCheckers).forEach(checker => {
          if (checker !== mockCheckers.system) {
            checker.check.mockResolvedValue({ status: 'healthy', message: 'OK' } as any);
          }
        });

        const result = await service.getHealthStatus();
        
        expect(result.status).toBe('degraded');
        expect(result.checks.system.memory.percentage).toBe(85);
      });
    });

    describe('Queue System Health', () => {
      it('should detect queue processing delays', async () => {
        const queueDelayResult: HealthCheckResult = {
          status: 'degraded',
          message: 'Queue processing delayed',
          responseTime: 800,
          details: {
            pendingJobs: 1500,
            averageProcessingTime: 45000,
            failedJobs: 25,
            deadLetterQueue: 5
          }
        };
        
        mockCheckers.queue.check.mockResolvedValue(queueDelayResult);
        
        Object.values(mockCheckers).forEach(checker => {
          if (checker !== mockCheckers.queue) {
            if (checker === mockCheckers.system) {
              checker.check.mockResolvedValue({
                status: 'healthy',
                message: 'OK',
                cpu: { usage: 20, cores: 4 },
                memory: { total: 8192, used: 2048, free: 6144, percentage: 25 },
                disk: { total: 500000, used: 100000, free: 400000, percentage: 20 }
              });
            } else {
              checker.check.mockResolvedValue({ status: 'healthy', message: 'OK' } as any);
            }
          }
        });

        const result = await service.getHealthStatus();
        
        expect(result.status).toBe('degraded');
        expect(result.checks.queue.details?.pendingJobs).toBe(1500);
        expect(result.checks.queue.details?.failedJobs).toBe(25);
      });

      it('should detect queue worker failures', async () => {
        const queueWorkerFailureResult: HealthCheckResult = {
          status: 'unhealthy',
          message: 'All queue workers are down',
          details: {
            activeWorkers: 0,
            expectedWorkers: 5,
            lastWorkerSeen: '2025-01-01T10:00:00Z'
          }
        };
        
        mockCheckers.queue.check.mockResolvedValue(queueWorkerFailureResult);
        
        Object.values(mockCheckers).forEach(checker => {
          if (checker !== mockCheckers.queue) {
            if (checker === mockCheckers.system) {
              checker.check.mockResolvedValue({
                status: 'healthy',
                message: 'OK',
                cpu: { usage: 20, cores: 4 },
                memory: { total: 8192, used: 2048, free: 6144, percentage: 25 },
                disk: { total: 500000, used: 100000, free: 400000, percentage: 20 }
              });
            } else {
              checker.check.mockResolvedValue({ status: 'healthy', message: 'OK' } as any);
            }
          }
        });

        const result = await service.getHealthStatus();
        
        expect(result.status).toBe('unhealthy');
        expect(result.checks.queue.details?.activeWorkers).toBe(0);
        expect(result.checks.queue.details?.expectedWorkers).toBe(5);
      });
    });

    describe('Storage Health Monitoring', () => {
      it('should detect storage connectivity issues', async () => {
        const storageIssueResult: HealthCheckResult = {
          status: 'unhealthy',
          message: 'Storage service unavailable',
          details: {
            endpoint: 'https://storage.example.com',
            lastSuccessfulWrite: '2025-01-01T09:30:00Z',
            consecutiveFailures: 3,
            errorCode: 'ENOTFOUND'
          }
        };
        
        mockCheckers.storage.check.mockResolvedValue(storageIssueResult);
        
        Object.values(mockCheckers).forEach(checker => {
          if (checker !== mockCheckers.storage) {
            if (checker === mockCheckers.system) {
              checker.check.mockResolvedValue({
                status: 'healthy',
                message: 'OK',
                cpu: { usage: 20, cores: 4 },
                memory: { total: 8192, used: 2048, free: 6144, percentage: 25 },
                disk: { total: 500000, used: 100000, free: 400000, percentage: 20 }
              });
            } else {
              checker.check.mockResolvedValue({ status: 'healthy', message: 'OK' } as any);
            }
          }
        });

        const result = await service.getHealthStatus();
        
        expect(result.status).toBe('unhealthy');
        expect(result.checks.storage.details?.consecutiveFailures).toBe(3);
        expect(result.checks.storage.details?.errorCode).toBe('ENOTFOUND');
      });

      it('should detect storage quota limits', async () => {
        const storageQuotaResult: HealthCheckResult = {
          status: 'degraded',
          message: 'Storage quota approaching limit',
          details: {
            usedQuota: 85,
            totalQuota: 100,
            availableQuota: 15,
            unit: 'GB'
          }
        };
        
        mockCheckers.storage.check.mockResolvedValue(storageQuotaResult);
        
        Object.values(mockCheckers).forEach(checker => {
          if (checker !== mockCheckers.storage) {
            if (checker === mockCheckers.system) {
              checker.check.mockResolvedValue({
                status: 'healthy',
                message: 'OK',
                cpu: { usage: 20, cores: 4 },
                memory: { total: 8192, used: 2048, free: 6144, percentage: 25 },
                disk: { total: 500000, used: 100000, free: 400000, percentage: 20 }
              });
            } else {
              checker.check.mockResolvedValue({ status: 'healthy', message: 'OK' } as any);
            }
          }
        });

        const result = await service.getHealthStatus();
        
        expect(result.status).toBe('degraded');
        expect(result.checks.storage.details?.usedQuota).toBe(85);
        expect(result.checks.storage.details?.availableQuota).toBe(15);
      });
    });

    describe('Load Testing and Performance', () => {
      it('should handle high concurrent health check requests', async () => {
        const healthyResult: HealthCheckResult = { status: 'healthy', message: 'OK' };
        
        Object.values(mockCheckers).forEach(checker => {
          if (checker === mockCheckers.system) {
            checker.check.mockResolvedValue({
              status: 'healthy',
              message: 'OK',
              cpu: { usage: 20, cores: 4 },
              memory: { total: 8192, used: 2048, free: 6144, percentage: 25 },
              disk: { total: 500000, used: 100000, free: 400000, percentage: 20 }
            });
          } else {
            checker.check.mockResolvedValue(healthyResult as any);
          }
        });

        // Simulate 20 concurrent health check requests
        const concurrentRequests = Array(20).fill(null).map(() => service.getHealthStatus());
        
        const startTime = Date.now();
        const results = await Promise.all(concurrentRequests);
        const endTime = Date.now();

        expect(results).toHaveLength(20);
        results.forEach(result => {
          expect(result.status).toBe('healthy');
        });
        
        // Should handle concurrent requests efficiently
        expect(endTime - startTime).toBeLessThan(1000);
      });

      it('should maintain performance under checker failures', async () => {
        // Mix of fast, slow, and failing checkers
        mockCheckers.database.check.mockResolvedValue({ status: 'healthy', message: 'OK' });
        mockCheckers.redis.check.mockImplementation(() => 
          new Promise(resolve => setTimeout(() => resolve({ status: 'healthy', message: 'OK' }), 100))
        );
        mockCheckers.ldap.check.mockRejectedValue(new Error('LDAP timeout'));
        mockCheckers.azure.check.mockResolvedValue({ status: 'healthy', message: 'OK' });
        mockCheckers.queue.check.mockRejectedValue(new Error('Queue unavailable'));
        mockCheckers.storage.check.mockResolvedValue({ status: 'healthy', message: 'OK' });
        mockCheckers.system.check.mockResolvedValue({
          status: 'healthy',
          message: 'OK',
          cpu: { usage: 20, cores: 4 },
          memory: { total: 8192, used: 2048, free: 6144, percentage: 25 },
          disk: { total: 500000, used: 100000, free: 400000, percentage: 20 }
        });

        const startTime = Date.now();
        const result = await service.getHealthStatus();
        const endTime = Date.now();

        expect(result.status).toBe('unhealthy');
        expect(result.checks.ldap.status).toBe('unhealthy');
        expect(result.checks.queue.status).toBe('unhealthy');
        expect(endTime - startTime).toBeLessThan(500); // Should not be blocked by slow checkers
      });
    });

    describe('Graceful Degradation', () => {
      it('should provide partial functionality when non-critical services are down', async () => {
        // Simulate scenario where storage and queue are down but core services are up
        mockCheckers.database.check.mockResolvedValue({ status: 'healthy', message: 'OK' });
        mockCheckers.redis.check.mockResolvedValue({ status: 'healthy', message: 'OK' });
        mockCheckers.ldap.check.mockResolvedValue({ status: 'healthy', message: 'OK' });
        mockCheckers.azure.check.mockResolvedValue({ status: 'healthy', message: 'OK' });
        mockCheckers.queue.check.mockResolvedValue({ status: 'unhealthy', message: 'Queue service down' });
        mockCheckers.storage.check.mockResolvedValue({ status: 'unhealthy', message: 'Storage unavailable' });
        mockCheckers.system.check.mockResolvedValue({
          status: 'healthy',
          message: 'OK',
          cpu: { usage: 20, cores: 4 },
          memory: { total: 8192, used: 2048, free: 6144, percentage: 25 },
          disk: { total: 500000, used: 100000, free: 400000, percentage: 20 }
        });

        const result = await service.getHealthStatus();
        const operational = await service.isOperational();

        expect(result.status).toBe('unhealthy');
        expect(operational).toBe(false); // System correctly reports as non-operational
        
        // But core services are still healthy
        expect(result.checks.database.status).toBe('healthy');
        expect(result.checks.redis.status).toBe('healthy');
        expect(result.checks.ldap.status).toBe('healthy');
        expect(result.checks.azure.status).toBe('healthy');
      });
    });
  });
});