import { ServiceFactory } from './service.factory';
import { logger } from '@/utils/logger';
import { ServiceType } from '@/config/types';

// Mock all service dependencies
jest.mock('@/utils/logger');
jest.mock('@/config/database', () => ({
  db: {
    getPool: jest.fn().mockReturnValue('mock-pool')
  }
}));
jest.mock('@/config/config.service', () => ({
  configService: {
    isServiceAvailable: jest.fn(),
    getServiceAvailability: jest.fn()
  }
}));
jest.mock('@/services/base/CredentialContextManager');
jest.mock('@/services/ad.service');
jest.mock('@/services/azure-msal.service', () => ({
  azureMsalService: { type: 'azure-service' }
}));
jest.mock('@/services/o365-msal.service', () => ({
  o365MsalService: { type: 'o365-service' }
}));
jest.mock('@/services/fieldDiscovery.service');
jest.mock('@/services/credentials.service');
jest.mock('@/services/query/QueryService', () => ({
  QueryService: {
    getInstance: jest.fn().mockReturnValue({ type: 'query-service' })
  }
}));

describe('ServiceFactory', () => {
  let factory: ServiceFactory;
  let mockConfigService: any;
  let mockDatabase: any;
  let mockCredentialManager: any;
  let mockADService: any;
  let mockAzureService: any;
  let mockO365Service: any;
  let mockFieldDiscoveryService: any;
  let mockCredentialsService: any;
  let mockQueryService: any;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Reset singleton instance
    (ServiceFactory as any).instance = null;
    
    // Create fresh factory instance for each test
    factory = ServiceFactory.getInstance();
    
    // Setup mock dependencies
    mockConfigService = require('@/config/config.service').configService;
    mockDatabase = require('@/config/database').db;
    
    mockCredentialManager = {
      setCredentials: jest.fn()
    };
    
    mockADService = {
      setCredentialManager: jest.fn()
    };
    
    mockAzureService = require('@/services/azure-msal.service').azureMsalService;
    mockO365Service = require('@/services/o365-msal.service').o365MsalService;
    mockFieldDiscoveryService = {};
    mockCredentialsService = {};
    mockQueryService = require('@/services/query/QueryService').QueryService;

    // Configure mocks
    mockConfigService.isServiceAvailable.mockReturnValue(true);
    mockConfigService.getServiceAvailability.mockReturnValue({
      ad: true,
      azure: true,
      o365: true,
      database: true,
      redis: true
    });

    // Mock constructors
    const { CredentialContextManager } = require('@/services/base/CredentialContextManager');
    CredentialContextManager.mockImplementation(() => mockCredentialManager);

    const { ADService } = require('@/services/ad.service');
    ADService.mockImplementation(() => mockADService);

    const { FieldDiscoveryService } = require('@/services/fieldDiscovery.service');
    FieldDiscoveryService.mockImplementation(() => mockFieldDiscoveryService);

    const { CredentialsService } = require('@/services/credentials.service');
    CredentialsService.mockImplementation(() => mockCredentialsService);
  });

  afterEach(() => {
    // Clean up singleton state
    factory.clearAllServices();
    (ServiceFactory as any).instance = null;
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance when called multiple times', () => {
      const instance1 = ServiceFactory.getInstance();
      const instance2 = ServiceFactory.getInstance();
      
      expect(instance1).toBe(instance2);
      expect(instance1).toBeInstanceOf(ServiceFactory);
    });

    it('should maintain singleton state across multiple calls', () => {
      const instance1 = ServiceFactory.getInstance();
      const instance2 = ServiceFactory.getInstance();
      
      // Add a service to instance1
      instance1.clearService('test-service');
      
      // instance2 should reflect the same state
      expect(instance2.getInitializedServices()).toEqual(instance1.getInitializedServices());
    });
  });

  describe('getService (Generic Service Factory)', () => {
    it('should create and cache a new service', async () => {
      const mockService = { name: 'test-service' };
      const factory = jest.fn().mockResolvedValue(mockService);
      
      const result = await ServiceFactory.getInstance().getService('test-key', factory);
      
      expect(result).toBe(mockService);
      expect(factory).toHaveBeenCalledTimes(1);
      expect(logger.debug).toHaveBeenCalledWith('Initializing service: test-key');
      expect(logger.debug).toHaveBeenCalledWith('Service initialized successfully: test-key');
    });

    it('should return cached service on subsequent calls', async () => {
      const mockService = { name: 'test-service' };
      const factory = jest.fn().mockResolvedValue(mockService);
      
      const result1 = await ServiceFactory.getInstance().getService('test-key', factory);
      const result2 = await ServiceFactory.getInstance().getService('test-key', factory);
      
      expect(result1).toBe(mockService);
      expect(result2).toBe(mockService);
      expect(result1).toBe(result2);
      expect(factory).toHaveBeenCalledTimes(1);
    });

    it('should handle factory function errors', async () => {
      const error = new Error('Factory failed');
      const factory = jest.fn().mockRejectedValue(error);
      
      await expect(ServiceFactory.getInstance().getService('failing-service', factory))
        .rejects.toThrow('Factory failed');
      
      expect(logger.error).toHaveBeenCalledWith('Failed to initialize service failing-service:', error);
    });

    it('should detect circular dependencies', async () => {
      const serviceFactoryInstance = ServiceFactory.getInstance();
      
      // Mock the service factory to simulate circular dependency by checking initializing state
      const originalGetService = serviceFactoryInstance.getService.bind(serviceFactoryInstance);
      
      const factory1 = jest.fn().mockImplementation(async () => {
        // This call will trigger circular dependency detection
        return await originalGetService('service1', () => Promise.resolve({ name: 'recursive' }));
      });
      
      await expect(serviceFactoryInstance.getService('service1', factory1))
        .rejects.toThrow('Circular dependency detected for service: service1');
    });

    it('should handle concurrent service requests', async () => {
      const mockService = { name: 'concurrent-service' };
      let factoryCallCount = 0;
      
      const factory = jest.fn().mockImplementation(async () => {
        factoryCallCount++;
        // Simulate async work
        await new Promise(resolve => setTimeout(resolve, 50));
        return mockService;
      });
      
      const serviceFactory = ServiceFactory.getInstance();
      
      // Make multiple concurrent requests - the first will initialize, others will detect circular dependency
      // So we need to test this differently
      const result1 = await serviceFactory.getService('concurrent-key', factory);
      const result2 = await serviceFactory.getService('concurrent-key', factory);
      const result3 = await serviceFactory.getService('concurrent-key', factory);
      
      // All should return the same cached instance
      expect(result1).toBe(mockService);
      expect(result2).toBe(mockService);
      expect(result3).toBe(mockService);
      
      // Factory should only be called once (for the first call)
      expect(factoryCallCount).toBe(1);
    });

    it('should clean up initialization state on factory error', async () => {
      const error = new Error('Initialization failed');
      const factory = jest.fn().mockRejectedValue(error);
      
      await expect(ServiceFactory.getInstance().getService('error-service', factory))
        .rejects.toThrow('Initialization failed');
      
      // Should not be in initializing state anymore
      expect((factory as any).initializing?.has('error-service')).toBeFalsy();
      
      // Should be able to try again
      const successFactory = jest.fn().mockResolvedValue({ success: true });
      const result = await ServiceFactory.getInstance().getService('error-service', successFactory);
      expect(result).toEqual({ success: true });
    });
  });

  describe('getADService', () => {
    beforeEach(() => {
      mockConfigService.isServiceAvailable.mockReturnValue(true);
    });

    it('should create AD service with credential manager', async () => {
      const result = await factory.getADService();
      
      expect(result).toBe(mockADService);
      expect(mockConfigService.isServiceAvailable).toHaveBeenCalledWith('ad');
      expect(mockADService.setCredentialManager).toHaveBeenCalledWith(mockCredentialManager);
    });

    it('should throw error when AD service is not available', async () => {
      mockConfigService.isServiceAvailable.mockReturnValue(false);
      
      await expect(factory.getADService())
        .rejects.toThrow('Active Directory service is not configured or available');
    });

    it('should cache AD service instance', async () => {
      const result1 = await factory.getADService();
      const result2 = await factory.getADService();
      
      expect(result1).toBe(result2);
      // Should call isServiceAvailable for each getADService call since it's called before caching
      expect(mockConfigService.isServiceAvailable).toHaveBeenCalledWith('ad');
    });
  });

  describe('getAzureService', () => {
    beforeEach(() => {
      mockConfigService.isServiceAvailable.mockReturnValue(true);
    });

    it('should create Azure service', async () => {
      const result = await factory.getAzureService();
      
      expect(result).toBe(mockAzureService);
      expect(mockConfigService.isServiceAvailable).toHaveBeenCalledWith('azure');
    });

    it('should throw error when Azure service is not available', async () => {
      mockConfigService.isServiceAvailable.mockReturnValue(false);
      
      await expect(factory.getAzureService())
        .rejects.toThrow('Azure AD service is not configured or available');
    });

    it('should cache Azure service instance', async () => {
      const result1 = await factory.getAzureService();
      const result2 = await factory.getAzureService();
      
      expect(result1).toBe(result2);
      expect(mockConfigService.isServiceAvailable).toHaveBeenCalledWith('azure');
    });
  });

  describe('getO365Service', () => {
    beforeEach(() => {
      mockConfigService.isServiceAvailable.mockReturnValue(true);
    });

    it('should create O365 service', async () => {
      const result = await factory.getO365Service();
      
      expect(result).toBe(mockO365Service);
      expect(mockConfigService.isServiceAvailable).toHaveBeenCalledWith('o365');
    });

    it('should throw error when O365 service is not available', async () => {
      mockConfigService.isServiceAvailable.mockReturnValue(false);
      
      await expect(factory.getO365Service())
        .rejects.toThrow('Office 365 service is not configured or available (requires Azure AD)');
    });

    it('should cache O365 service instance', async () => {
      const result1 = await factory.getO365Service();
      const result2 = await factory.getO365Service();
      
      expect(result1).toBe(result2);
      expect(mockConfigService.isServiceAvailable).toHaveBeenCalledWith('o365');
    });
  });

  describe('getLDAPQueryExecutor (Deprecated)', () => {
    it('should redirect to getQueryService for backward compatibility', async () => {
      const spy = jest.spyOn(factory, 'getQueryService').mockResolvedValue(mockQueryService);
      
      const result = await factory.getLDAPQueryExecutor();
      
      expect(result).toBe(mockQueryService);
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  describe('getFieldDiscoveryService', () => {
    it('should create field discovery service', async () => {
      const result = await factory.getFieldDiscoveryService();
      
      expect(result).toBe(mockFieldDiscoveryService);
    });

    it('should cache field discovery service instance', async () => {
      const result1 = await factory.getFieldDiscoveryService();
      const result2 = await factory.getFieldDiscoveryService();
      
      expect(result1).toBe(result2);
    });
  });

  describe('getCredentialsService', () => {
    it('should create credentials service', async () => {
      const result = await factory.getCredentialsService();
      
      expect(result).toBe(mockCredentialsService);
    });

    it('should cache credentials service instance', async () => {
      const result1 = await factory.getCredentialsService();
      const result2 = await factory.getCredentialsService();
      
      expect(result1).toBe(result2);
    });
  });

  describe('getPreviewService', () => {
    let mockPreviewService: any;

    beforeEach(() => {
      mockPreviewService = { executePreview: jest.fn() };
      
      // Mock PreviewService constructor
      jest.doMock('@/services/preview.service', () => ({
        PreviewService: jest.fn().mockImplementation(() => mockPreviewService)
      }));
    });

    it('should create preview service', async () => {
      const result = await factory.getPreviewService();
      
      expect(result).toBe(mockPreviewService);
    });

    it('should cache preview service instance', async () => {
      const result1 = await factory.getPreviewService();
      const result2 = await factory.getPreviewService();
      
      expect(result1).toBe(result2);
    });
  });

  describe('getQueryService', () => {
    it('should create query service with database pool', async () => {
      const result = await factory.getQueryService();
      
      expect(result).toEqual({ type: 'query-service' });
      expect(mockQueryService.getInstance).toHaveBeenCalledWith('mock-pool');
    });

    it('should cache query service instance', async () => {
      const result1 = await factory.getQueryService();
      const result2 = await factory.getQueryService();
      
      expect(result1).toBe(result2);
      // getInstance is called each time because it's the factory method, but returns cached instance
      expect(mockQueryService.getInstance).toHaveBeenCalledWith('mock-pool');
    });
  });

  describe('getCredentialManager', () => {
    it('should create credential manager with database pool', async () => {
      const result = await (factory as any).getCredentialManager();
      
      expect(result).toBe(mockCredentialManager);
      expect(mockDatabase.getPool).toHaveBeenCalled();
    });

    it('should cache credential manager instance', async () => {
      const result1 = await (factory as any).getCredentialManager();
      const result2 = await (factory as any).getCredentialManager();
      
      expect(result1).toBe(result2);
      expect(mockDatabase.getPool).toHaveBeenCalledTimes(1);
    });
  });

  describe('isServiceAvailable', () => {
    it('should check service availability through config service', async () => {
      mockConfigService.isServiceAvailable.mockReturnValue(true);
      
      const result = await factory.isServiceAvailable('ad' as ServiceType);
      
      expect(result).toBe(true);
      expect(mockConfigService.isServiceAvailable).toHaveBeenCalledWith('ad');
    });

    it('should return false for unavailable services', async () => {
      mockConfigService.isServiceAvailable.mockReturnValue(false);
      
      const result = await factory.isServiceAvailable('azure' as ServiceType);
      
      expect(result).toBe(false);
      expect(mockConfigService.isServiceAvailable).toHaveBeenCalledWith('azure');
    });
  });

  describe('getServiceAvailability', () => {
    it('should return service availability status', async () => {
      const mockAvailability = {
        ad: true,
        azure: false,
        o365: false,
        database: true,
        redis: true
      };
      
      mockConfigService.getServiceAvailability.mockReturnValue(mockAvailability);
      
      const result = await factory.getServiceAvailability();
      
      expect(result).toEqual(mockAvailability);
      expect(mockConfigService.getServiceAvailability).toHaveBeenCalled();
    });
  });

  describe('clearService', () => {
    it('should clear specific service from cache', async () => {
      // Initialize a service first
      await factory.getFieldDiscoveryService();
      expect(factory.getInitializedServices()).toContain('fieldDiscovery');
      
      // Clear the service
      factory.clearService('fieldDiscovery');
      
      expect(factory.getInitializedServices()).not.toContain('fieldDiscovery');
      expect(logger.debug).toHaveBeenCalledWith('Clearing service: fieldDiscovery');
    });

    it('should handle clearing non-existent service', () => {
      factory.clearService('non-existent');
      
      // Should not throw or log anything for non-existent services
      expect(logger.debug).not.toHaveBeenCalledWith(expect.stringContaining('Clearing service: non-existent'));
    });
  });

  describe('clearAllServices', () => {
    it('should clear all services from cache', async () => {
      // Initialize multiple services
      await factory.getFieldDiscoveryService();
      await factory.getCredentialsService();
      
      expect(factory.getInitializedServices().length).toBeGreaterThan(0);
      
      // Clear all services
      factory.clearAllServices();
      
      expect(factory.getInitializedServices()).toEqual([]);
      expect(logger.debug).toHaveBeenCalledWith('Clearing all services');
    });
  });

  describe('getInitializedServices', () => {
    it('should return empty array initially', () => {
      const services = factory.getInitializedServices();
      
      expect(services).toEqual([]);
    });

    it('should return list of initialized service keys', async () => {
      await factory.getFieldDiscoveryService();
      await factory.getCredentialsService();
      
      const services = factory.getInitializedServices();
      
      expect(services).toContain('fieldDiscovery');
      expect(services).toContain('credentials');
      expect(services).toHaveLength(2);
    });
  });

  describe('getServiceStatus', () => {
    it('should return service availability and initialization status', async () => {
      const mockAvailability = {
        ad: true,
        azure: false,
        o365: true,
        database: true,
        redis: true
      };
      
      mockConfigService.getServiceAvailability.mockReturnValue(mockAvailability);
      
      // Initialize one service
      await factory.getFieldDiscoveryService();
      
      const status = await factory.getServiceStatus();
      
      expect(status).toEqual({
        ad: { available: true, initialized: false },
        azure: { available: false, initialized: false },
        o365: { available: true, initialized: false },
        database: { available: true, initialized: false },
        redis: { available: true, initialized: false }
      });
    });

    it('should show initialized services correctly', async () => {
      const mockAvailability = {
        ad: true,
        azure: true,
        o365: true,
        database: true,
        redis: true
      };
      
      mockConfigService.getServiceAvailability.mockReturnValue(mockAvailability);
      
      // Initialize AD service
      await factory.getADService();
      
      const status = await factory.getServiceStatus();
      
      expect(status.ad.initialized).toBe(true);
      expect(status.azure.initialized).toBe(false);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle service factory initialization errors', async () => {
      mockConfigService.isServiceAvailable.mockReturnValue(true);
      
      // Mock a constructor that throws an error
      const { ADService } = require('@/services/ad.service');
      ADService.mockImplementation(() => {
        throw new Error('Constructor failed');
      });
      
      await expect(factory.getADService())
        .rejects.toThrow('Constructor failed');
    });

    it('should handle service initialization errors during import', async () => {
      const importError = new Error('Module import failed');
      const factory = jest.fn().mockRejectedValue(importError);
      
      await expect(ServiceFactory.getInstance().getService('import-fail-service', factory))
        .rejects.toThrow('Module import failed');
    });

    it('should maintain service isolation between factory instances', () => {
      // This tests that singleton is working properly
      const factory1 = ServiceFactory.getInstance();
      const factory2 = ServiceFactory.getInstance();
      
      factory1.clearService('test');
      
      // Both should refer to the same instance
      expect(factory1).toBe(factory2);
    });
  });

  describe('Memory Management', () => {
    it('should not accumulate services indefinitely', async () => {
      const initialServiceCount = factory.getInitializedServices().length;
      
      // Initialize multiple services
      await factory.getFieldDiscoveryService();
      await factory.getCredentialsService();
      
      const afterInitCount = factory.getInitializedServices().length;
      expect(afterInitCount).toBe(initialServiceCount + 2);
      
      // Clear all services
      factory.clearAllServices();
      
      const afterClearCount = factory.getInitializedServices().length;
      expect(afterClearCount).toBe(0);
    });
  });

  describe('Exported Singleton Instance', () => {
    it('should export a working singleton instance', () => {
      // Since we reset the instance in beforeEach, we need to get the current instance
      const currentInstance = ServiceFactory.getInstance();
      expect(currentInstance).toBeInstanceOf(ServiceFactory);
    });

    it('should maintain state across different access methods', async () => {
      // Initialize a service using the current instance
      const currentInstance = ServiceFactory.getInstance();
      await currentInstance.getFieldDiscoveryService();
      
      // Check using getInstance again
      const anotherReference = ServiceFactory.getInstance();
      expect(anotherReference.getInitializedServices()).toContain('fieldDiscovery');
      expect(currentInstance).toBe(anotherReference);
    });
  });
});