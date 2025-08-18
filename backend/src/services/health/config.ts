/**
 * Health Check Configuration
 * Centralized configuration for health monitoring thresholds and timeouts
 */

import { HealthThresholds, HealthCheckConfig } from './types';

export const DEFAULT_HEALTH_CONFIG: Record<string, HealthCheckConfig> = {
  database: {
    timeout: parseInt(process.env.HEALTH_DB_TIMEOUT || '5000', 10),
    retryCount: 1
  },
  redis: {
    timeout: parseInt(process.env.HEALTH_REDIS_TIMEOUT || '3000', 10),
    retryCount: 1
  },
  ldap: {
    timeout: parseInt(process.env.HEALTH_LDAP_TIMEOUT || '10000', 10),
    retryCount: 0
  },
  azure: {
    timeout: parseInt(process.env.HEALTH_AZURE_TIMEOUT || '8000', 10),
    retryCount: 0
  },
  queue: {
    timeout: parseInt(process.env.HEALTH_QUEUE_TIMEOUT || '3000', 10)
  },
  storage: {
    timeout: parseInt(process.env.HEALTH_STORAGE_TIMEOUT || '2000', 10)
  },
  system: {
    timeout: parseInt(process.env.HEALTH_SYSTEM_TIMEOUT || '1000', 10)
  }
};

export const HEALTH_THRESHOLDS: HealthThresholds = {
  cpu: {
    degraded: parseInt(process.env.HEALTH_CPU_DEGRADED || '70', 10),
    unhealthy: parseInt(process.env.HEALTH_CPU_UNHEALTHY || '90', 10)
  },
  memory: {
    degraded: parseInt(process.env.HEALTH_MEMORY_DEGRADED || '70', 10),
    unhealthy: parseInt(process.env.HEALTH_MEMORY_UNHEALTHY || '90', 10)
  },
  disk: {
    degraded: parseInt(process.env.HEALTH_DISK_DEGRADED || '70', 10),
    unhealthy: parseInt(process.env.HEALTH_DISK_UNHEALTHY || '90', 10)
  },
  queue: {
    failedJobsThreshold: parseInt(process.env.HEALTH_QUEUE_FAILED_THRESHOLD || '100', 10),
    waitingJobsThreshold: parseInt(process.env.HEALTH_QUEUE_WAITING_THRESHOLD || '1000', 10)
  }
};

export const HEALTH_CHECK_MESSAGES = {
  healthy: {
    database: 'Database connection is healthy',
    redis: 'Redis connection is healthy',
    ldap: 'LDAP connection is healthy',
    azure: 'Azure AD connection is healthy',
    queue: 'Queue system is healthy',
    storage: 'Storage is accessible and writable',
    system: 'System resources are healthy'
  },
  degraded: {
    database: 'Database returned unexpected result',
    redis: 'Redis returned unexpected response',
    ldap: 'LDAP connected but base DN not accessible',
    azure: 'Azure AD connected but no token acquired',
    queue: 'Large queue backlog detected',
    storage: 'Storage has limited capacity',
    system: 'High resource usage detected'
  },
  unhealthy: {
    database: 'Database connection failed',
    redis: 'Redis connection failed',
    ldap: 'LDAP connection failed',
    azure: 'Azure AD connection failed',
    queue: 'Queue system check failed',
    storage: 'Storage check failed',
    system: 'Critical resource usage detected'
  },
  notConfigured: {
    ldap: 'LDAP not configured',
    azure: 'Azure AD not configured'
  }
};