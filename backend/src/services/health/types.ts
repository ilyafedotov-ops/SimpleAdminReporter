/**
 * Health Check Types and Interfaces
 * Centralized type definitions for health monitoring system
 */

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface HealthCheckResult {
  status: HealthStatus;
  message: string;
  responseTime?: number;
  details?: Record<string, any>;
}

export interface SystemHealthMetrics {
  status: HealthStatus;
  message: string;
  cpu: {
    usage: number;
    cores: number;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    percentage: number;
  };
  disk: {
    total: number;
    used: number;
    free: number;
    percentage: number;
  };
}

export interface OverallHealthStatus {
  status: HealthStatus;
  timestamp: Date;
  uptime: number;
  version: string;
  environment: string;
  checks: {
    database: HealthCheckResult;
    redis: HealthCheckResult;
    ldap: HealthCheckResult;
    azure: HealthCheckResult;
    queue: HealthCheckResult;
    storage: HealthCheckResult;
    system: SystemHealthMetrics;
  };
}

export interface HealthCheckConfig {
  timeout: number;
  retryCount?: number;
  retryDelay?: number;
}

export interface HealthThresholds {
  cpu: {
    degraded: number;
    unhealthy: number;
  };
  memory: {
    degraded: number;
    unhealthy: number;
  };
  disk: {
    degraded: number;
    unhealthy: number;
  };
  queue: {
    failedJobsThreshold: number;
    waitingJobsThreshold: number;
  };
}

export type HealthCheckFunction = () => Promise<HealthCheckResult>;
export type SystemHealthCheckFunction = () => Promise<SystemHealthMetrics>;

export interface HealthCheckContext {
  serviceName: string;
  timeout: number;
  startTime: number;
}