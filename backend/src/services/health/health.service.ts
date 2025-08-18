/**
 * Health Service
 * Orchestrates health checks for all system components following LEVER principles
 */

import { logger } from '@/utils/logger';
import {
  OverallHealthStatus,
  HealthStatus,
  HealthCheckResult,
  SystemHealthMetrics
} from './types';
import {
  DatabaseHealthChecker,
  RedisHealthChecker,
  LDAPHealthChecker,
  AzureHealthChecker,
  QueueHealthChecker,
  StorageHealthChecker,
  SystemHealthChecker
} from './checkers';

export class HealthService {
  private readonly startTime: Date;
  private readonly version: string;
  private readonly checkers: {
    database: DatabaseHealthChecker;
    redis: RedisHealthChecker;
    ldap: LDAPHealthChecker;
    azure: AzureHealthChecker;
    queue: QueueHealthChecker;
    storage: StorageHealthChecker;
    system: SystemHealthChecker;
  };

  constructor() {
    this.startTime = new Date();
    this.version = process.env.APP_VERSION || '1.0.0';
    
    // Initialize all health checkers
    this.checkers = {
      database: new DatabaseHealthChecker(),
      redis: new RedisHealthChecker(),
      ldap: new LDAPHealthChecker(),
      azure: new AzureHealthChecker(),
      queue: new QueueHealthChecker(),
      storage: new StorageHealthChecker(),
      system: new SystemHealthChecker()
    };
  }

  /**
   * Get comprehensive health status of all system components
   * @returns Overall health status with individual component statuses
   */
  async getHealthStatus(): Promise<OverallHealthStatus> {
    // Execute all health checks in parallel for better performance
    const [
      database,
      redisHealth,
      ldap,
      azure,
      queue,
      storage,
      system
    ] = await Promise.allSettled([
      this.checkers.database.check(),
      this.checkers.redis.check(),
      this.checkers.ldap.check(),
      this.checkers.azure.check(),
      this.checkers.queue.check(),
      this.checkers.storage.check(),
      this.checkers.system.check()
    ]);

    // Process results using the helper method
    const checks = {
      database: this.unwrapHealthCheck(database),
      redis: this.unwrapHealthCheck(redisHealth),
      ldap: this.unwrapHealthCheck(ldap),
      azure: this.unwrapHealthCheck(azure),
      queue: this.unwrapHealthCheck(queue),
      storage: this.unwrapHealthCheck(storage),
      system: this.unwrapHealthCheck(system) as SystemHealthMetrics
    };

    // Calculate overall status
    const overallStatus = this.calculateOverallStatus(checks);

    return {
      status: overallStatus,
      timestamp: new Date(),
      uptime: this.getUptime(),
      version: this.version,
      environment: process.env.NODE_ENV || 'development',
      checks
    };
  }

  /**
   * Get health status for a specific component
   * @param component Component name to check
   * @returns Health status for the specified component
   */
  async getComponentHealth(component: keyof typeof this.checkers): Promise<HealthCheckResult | SystemHealthMetrics> {
    if (!this.checkers[component]) {
      throw new Error(`Unknown health check component: ${component}`);
    }
    
    return this.checkers[component].check();
  }

  /**
   * Calculate overall system status based on individual component statuses
   * @param checks Individual component health check results
   * @returns Overall health status
   */
  private calculateOverallStatus(checks: Record<string, HealthCheckResult | SystemHealthMetrics>): HealthStatus {
    const statuses = Object.values(checks).map(check => check.status);
    
    // System is unhealthy if any component is unhealthy
    if (statuses.includes('unhealthy')) {
      return 'unhealthy';
    }
    
    // System is degraded if any component is degraded
    if (statuses.includes('degraded')) {
      return 'degraded';
    }
    
    // Otherwise, system is healthy
    return 'healthy';
  }

  /**
   * Unwrap Promise.allSettled result and handle errors gracefully
   * @param result Promise settled result
   * @returns Health check result
   */
  private unwrapHealthCheck(
    result: PromiseSettledResult<HealthCheckResult | SystemHealthMetrics>
  ): HealthCheckResult | SystemHealthMetrics {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    
    // Handle failed health checks
    logger.error('Health check promise rejected:', result.reason);
    
    return {
      status: 'unhealthy',
      message: `Health check failed: ${result.reason?.message || 'Unknown error'}`
    } as HealthCheckResult;
  }

  /**
   * Get system uptime in seconds
   * @returns Uptime in seconds
   */
  private getUptime(): number {
    return Math.floor((Date.now() - this.startTime.getTime()) / 1000);
  }

  /**
   * Get a summary of health statuses (useful for quick checks)
   * @returns Object with component names and their statuses
   */
  async getHealthSummary(): Promise<Record<string, HealthStatus>> {
    const fullStatus = await this.getHealthStatus();
    const summary: Record<string, HealthStatus> = {
      overall: fullStatus.status
    };
    
    Object.entries(fullStatus.checks).forEach(([key, value]) => {
      summary[key] = value.status;
    });
    
    return summary;
  }

  /**
   * Check if the system is healthy enough to accept requests
   * @returns True if system is healthy or degraded, false if unhealthy
   */
  async isOperational(): Promise<boolean> {
    const status = await this.getHealthStatus();
    return status.status !== 'unhealthy';
  }
}

// Export singleton instance
export const healthService = new HealthService();