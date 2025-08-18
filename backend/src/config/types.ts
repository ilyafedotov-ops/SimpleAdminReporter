/**
 * Configuration Types and Interfaces
 * Centralized type definitions for all application configuration
 */

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
  maxConnections?: number;
  connectionTimeoutMillis?: number;
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  database?: number;
  maxRetriesPerRequest?: number;
  retryDelayOnFailover?: number;
}

export interface ADConfig {
  server: string;
  baseDN: string;
  username: string;
  password: string;
  timeout?: number;
  reconnect?: boolean;
}

export interface AzureConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  authority?: string;
  scopes?: string[];
}

export interface AppConfig {
  port: number;
  nodeEnv: 'development' | 'production' | 'test';
  jwtSecret: string;
  corsOrigins: string[];
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
  logging: {
    level: 'error' | 'warn' | 'info' | 'debug';
    format: string;
  };
}

export interface ApplicationConfiguration {
  app: AppConfig;
  database: DatabaseConfig;
  redis: RedisConfig;
  ad?: ADConfig;  // Optional - may not be configured
  azure?: AzureConfig;  // Optional - may not be configured
  mockData: boolean;
}

export interface ServiceAvailability {
  ad: boolean;
  azure: boolean;
  o365: boolean;
  database: boolean;
  redis: boolean;
}

export interface ConfigValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  availability: ServiceAvailability;
}

export type ServiceType = 'ad' | 'azure' | 'o365' | 'database' | 'redis';
export type ConfigSection = keyof ApplicationConfiguration;