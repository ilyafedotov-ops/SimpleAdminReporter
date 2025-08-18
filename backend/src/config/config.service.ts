import { 
  ApplicationConfiguration, 
  ConfigValidationResult, 
  ServiceAvailability, 
  ADConfig, 
  AzureConfig,
  ServiceType
} from './types';
import { logger } from '@/utils/logger';

/**
 * Centralized Configuration Management Service
 * Handles all environment variable validation, parsing, and service availability detection
 */
export class ConfigurationService {
  private static instance: ConfigurationService | null = null;
  private config: ApplicationConfiguration | null = null;
  private validationResult: ConfigValidationResult | null = null;

  private constructor() {
    // Private constructor for singleton
  }

  static getInstance(): ConfigurationService {
    if (!this.instance) {
      this.instance = new ConfigurationService();
    }
    return this.instance;
  }

  /**
   * Initialize and validate configuration
   */
  async initialize(): Promise<ConfigValidationResult> {
    logger.info('Initializing configuration service...');
    
    this.config = this.loadConfiguration();
    this.validationResult = this.validateConfiguration(this.config);
    
    if (this.validationResult.errors.length > 0) {
      logger.error('Configuration validation errors:', this.validationResult.errors);
    }
    
    if (this.validationResult.warnings.length > 0) {
      logger.warn('Configuration validation warnings:', this.validationResult.warnings);
    }
    
    logger.info('Service availability:', this.validationResult.availability);
    return this.validationResult;
  }

  /**
   * Get full application configuration
   */
  getConfig(): ApplicationConfiguration {
    if (!this.config) {
      throw new Error('Configuration not initialized. Call initialize() first.');
    }
    return this.config;
  }

  /**
   * Get configuration for a specific service
   */
  getServiceConfig<T extends keyof ApplicationConfiguration>(service: T): ApplicationConfiguration[T] {
    return this.getConfig()[service];
  }

  /**
   * Check if a service is available and properly configured
   */
  isServiceAvailable(service: ServiceType): boolean {
    if (!this.validationResult) {
      throw new Error('Configuration not initialized. Call initialize() first.');
    }
    return this.validationResult.availability[service];
  }

  /**
   * Get service availability status
   */
  getServiceAvailability(): ServiceAvailability {
    if (!this.validationResult) {
      throw new Error('Configuration not initialized. Call initialize() first.');
    }
    return this.validationResult.availability;
  }

  /**
   * Check if configuration has critical errors
   */
  hasErrors(): boolean {
    return (this.validationResult?.errors?.length ?? 0) > 0;
  }

  /**
   * Get configuration validation errors
   */
  getErrors(): string[] {
    return this.validationResult?.errors || [];
  }

  /**
   * Load configuration from environment variables
   */
  private loadConfiguration(): ApplicationConfiguration {
    return {
      app: {
        port: parseInt(process.env.PORT || '5000', 10),
        nodeEnv: (process.env.NODE_ENV as any) || 'development',
        jwtSecret: process.env.JWT_SECRET || '',
        corsOrigins: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
        rateLimit: {
          windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '900000', 10),
          maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10)
        },
        logging: {
          level: (process.env.LOG_LEVEL as any) || 'info',
          format: process.env.LOG_FORMAT || 'combined'
        }
      },
      database: {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        database: process.env.DB_NAME || 'reporting',
        username: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        ssl: process.env.DB_SSL === 'true',
        maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '20', 10),
        connectionTimeoutMillis: parseInt(process.env.DB_TIMEOUT || '30000', 10)
      },
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10) || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        database: parseInt(process.env.REDIS_DB || '0', 10),
        maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES || '3', 10),
        retryDelayOnFailover: parseInt(process.env.REDIS_RETRY_DELAY || '100', 10)
      },
      ad: this.loadADConfig(),
      azure: this.loadAzureConfig(),
      mockData: process.env.MOCK_DATA === 'true'
    };
  }

  /**
   * Load Active Directory configuration
   */
  private loadADConfig(): ADConfig | undefined {
    const server = process.env.AD_SERVER;
    const baseDN = process.env.AD_BASE_DN;
    const username = process.env.AD_USERNAME;
    const password = process.env.AD_PASSWORD;

    if (!server || !baseDN || !username || !password) {
      return undefined;
    }

    return {
      server,
      baseDN,
      username,
      password,
      timeout: parseInt(process.env.AD_TIMEOUT || '10000', 10),
      reconnect: process.env.AD_RECONNECT !== 'false'
    };
  }

  /**
   * Load Azure AD configuration
   */
  private loadAzureConfig(): AzureConfig | undefined {
    const tenantId = process.env.AZURE_TENANT_ID;
    const clientId = process.env.AZURE_CLIENT_ID;
    const clientSecret = process.env.AZURE_CLIENT_SECRET;

    // Check for placeholder values
    if (!tenantId || !clientId || !clientSecret ||
        tenantId === 'placeholder-tenant-id' ||
        clientId === 'placeholder-client-id' ||
        clientSecret === 'placeholder-client-secret') {
      return undefined;
    }

    return {
      tenantId,
      clientId,
      clientSecret,
      authority: process.env.AZURE_AUTHORITY || `https://login.microsoftonline.com/${tenantId}`,
      scopes: process.env.AZURE_SCOPES?.split(',') || ['https://graph.microsoft.com/.default']
    };
  }

  /**
   * Validate the loaded configuration
   */
  private validateConfiguration(config: ApplicationConfiguration): ConfigValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate required app configuration
    if (!config.app.jwtSecret) {
      errors.push('JWT_SECRET is required for authentication');
    } else if (config.app.jwtSecret.length < 32) {
      warnings.push('JWT_SECRET should be at least 32 characters long');
    }

    if (config.app.port < 1 || config.app.port > 65535) {
      errors.push('PORT must be a valid port number (1-65535)');
    }

    // Validate database configuration
    if (!config.database.password) {
      warnings.push('Database password is not set');
    }

    // Check service availability
    const availability: ServiceAvailability = {
      ad: !!config.ad,
      azure: !!config.azure,
      o365: !!config.azure, // O365 uses Azure AD authentication
      database: !!config.database.host && !!config.database.database,
      redis: !!config.redis.host
    };

    // Service-specific validation
    if (!availability.ad) {
      warnings.push('Active Directory configuration not found - AD features will be disabled');
    }

    if (!availability.azure) {
      warnings.push('Azure AD configuration not found - Azure AD and O365 features will be disabled');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      availability
    };
  }

  /**
   * Get a human-readable configuration summary
   */
  getConfigSummary(): string {
    if (!this.config || !this.validationResult) {
      return 'Configuration not initialized';
    }

    const { availability } = this.validationResult;
    const enabledServices = Object.entries(availability)
      .filter(([_, enabled]) => enabled)
      .map(([service, _]) => service)
      .join(', ');

    return `Configuration loaded. Available services: ${enabledServices || 'none'}`;
  }
}

// Export singleton instance
export const configService = ConfigurationService.getInstance();