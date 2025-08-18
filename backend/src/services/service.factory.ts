import { logger } from '@/utils/logger';
import { ServiceType } from '@/config/types';
import { CredentialContextManager } from '@/services/base/CredentialContextManager';

/**
 * Service Factory and Dependency Injection Container
 * Manages service lifecycle, lazy loading, and dependency injection
 */
export class ServiceFactory {
  private static instance: ServiceFactory | null = null;
  private services: Map<string, any> = new Map();
  private initializing: Set<string> = new Set();
  private credentialManager?: CredentialContextManager;

  private constructor() {
    // Private constructor for singleton
  }

  static getInstance(): ServiceFactory {
    if (!this.instance) {
      this.instance = new ServiceFactory();
    }
    return this.instance;
  }

  /**
   * Get or create credential manager (central component per architecture)
   */
  private async getCredentialManager(): Promise<CredentialContextManager> {
    if (!this.credentialManager) {
      const { db } = await import('@/config/database');
      this.credentialManager = new CredentialContextManager(db.getPool());
    }
    return this.credentialManager;
  }

  /**
   * Get or create a service instance
   */
  async getService<T>(serviceKey: string, factory: () => Promise<T>): Promise<T> {
    // Return existing instance if available
    if (this.services.has(serviceKey)) {
      return this.services.get(serviceKey);
    }

    // Prevent circular initialization
    if (this.initializing.has(serviceKey)) {
      throw new Error(`Circular dependency detected for service: ${serviceKey}`);
    }

    try {
      this.initializing.add(serviceKey);
      logger.debug(`Initializing service: ${serviceKey}`);
      
      const service = await factory();
      this.services.set(serviceKey, service);
      
      logger.debug(`Service initialized successfully: ${serviceKey}`);
      return service;
    } catch (error) {
      logger.error(`Failed to initialize service ${serviceKey}:`, error);
      throw error;
    } finally {
      this.initializing.delete(serviceKey);
    }
  }

  /**
   * Get Active Directory service
   */
  async getADService() {
    const { configService } = await import('@/config/config.service');
    
    if (!configService.isServiceAvailable('ad')) {
      throw new Error('Active Directory service is not configured or available');
    }

    return this.getService('ad', async () => {
      const { ADService } = await import('@/services/ad.service');
      const adService = new ADService();
      // Inject the shared CredentialContextManager so that ADService can fetch credentials
      adService.setCredentialManager(await this.getCredentialManager());
      return adService;
    });
  }

  /**
   * Get Azure AD service (MSAL-based)
   */
  async getAzureService() {
    const { configService } = await import('@/config/config.service');
    
    if (!configService.isServiceAvailable('azure')) {
      throw new Error('Azure AD service is not configured or available');
    }

    return this.getService('azure', async () => {
      const { azureMsalService } = await import('@/services/azure-msal.service');
      return azureMsalService;
    });
  }

  /**
   * Get Office 365 service (MSAL-based)
   */
  async getO365Service() {
    const { configService } = await import('@/config/config.service');
    
    if (!configService.isServiceAvailable('o365')) {
      throw new Error('Office 365 service is not configured or available (requires Azure AD)');
    }

    return this.getService('o365', async () => {
      const { o365MsalService } = await import('@/services/o365-msal.service');
      return o365MsalService;
    });
  }

  /**
   * Get LDAP Query Executor service
   * @deprecated Use getQueryService() instead
   */
  async getLDAPQueryExecutor() {
    // Redirect to QueryService for backward compatibility
    return this.getQueryService();
  }

  /**
   * Get Field Discovery service
   */
  async getFieldDiscoveryService() {
    return this.getService('fieldDiscovery', async () => {
      const { FieldDiscoveryService } = await import('@/services/fieldDiscovery.service');
      return new FieldDiscoveryService();
    });
  }

  /**
   * Get Credentials service
   */
  async getCredentialsService() {
    return this.getService('credentials', async () => {
      const { CredentialsService } = await import('@/services/credentials.service');
      return new CredentialsService();
    });
  }

  /**
   * Get Preview service for custom query testing
   */
  async getPreviewService() {
    return this.getService('preview', async () => {
      const { PreviewService } = await import('@/services/preview.service');
      return new PreviewService();
    });
  }

  /**
   * Get QueryService (Central Core Engine per target architecture)
   */
  async getQueryService() {
    return this.getService('query-core', async () => {
      const { QueryService } = await import('@/services/query/QueryService');
      const { db } = await import('@/config/database');
      
      // Get QueryService singleton instance - this is the central core engine
      return QueryService.getInstance(db.getPool());
    });
  }

  /**
   * Check if a service is available without initializing it
   */
  async isServiceAvailable(service: ServiceType): Promise<boolean> {
    const { configService } = await import('@/config/config.service');
    return configService.isServiceAvailable(service);
  }

  /**
   * Get service availability status
   */
  async getServiceAvailability() {
    const { configService } = await import('@/config/config.service');
    return configService.getServiceAvailability();
  }

  /**
   * Clear a specific service (for testing or reconfiguration)
   */
  clearService(serviceKey: string): void {
    if (this.services.has(serviceKey)) {
      logger.debug(`Clearing service: ${serviceKey}`);
      this.services.delete(serviceKey);
    }
  }

  /**
   * Clear all services
   */
  clearAllServices(): void {
    logger.debug('Clearing all services');
    this.services.clear();
    this.initializing.clear();
  }

  /**
   * Get list of initialized services
   */
  getInitializedServices(): string[] {
    return Array.from(this.services.keys());
  }

  /**
   * Get service initialization status
   */
  async getServiceStatus(): Promise<Record<string, any>> {
    const status: Record<string, any> = {};
    const availability = await this.getServiceAvailability();
    
    Object.keys(availability).forEach(service => {
      status[service] = {
        available: availability[service as ServiceType],
        initialized: this.services.has(service)
      };
    });
    
    return status;
  }
}

// Export singleton instance
export const serviceFactory = ServiceFactory.getInstance();