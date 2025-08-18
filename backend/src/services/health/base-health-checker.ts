/**
 * Base Health Checker
 * Abstract base class for implementing health checks with common functionality
 */

import { logger } from '@/utils/logger';
import { HealthCheckResult, HealthStatus, HealthCheckContext } from './types';
import { DEFAULT_HEALTH_CONFIG, HEALTH_CHECK_MESSAGES } from './config';

export abstract class BaseHealthChecker {
  protected logger: typeof logger;
  protected config: typeof DEFAULT_HEALTH_CONFIG;
  protected messages: typeof HEALTH_CHECK_MESSAGES;

  constructor(protected serviceName: string) {
    this.logger = logger.child({ service: `HealthCheck:${serviceName}` });
    this.config = DEFAULT_HEALTH_CONFIG;
    this.messages = HEALTH_CHECK_MESSAGES;
  }

  /**
   * Execute health check with timeout and error handling
   */
  async check(): Promise<HealthCheckResult> {
    const context: HealthCheckContext = {
      serviceName: this.serviceName,
      timeout: this.config[this.serviceName]?.timeout || 5000,
      startTime: Date.now()
    };

    try {
      // Execute with timeout
      const result = await this.withTimeout(
        this.performCheck(context),
        context.timeout
      );
      
      return this.enhanceResult(result, context);
    } catch (error) {
      return this.handleError(error, context);
    }
  }

  /**
   * Perform the actual health check - must be implemented by subclasses
   */
  protected abstract performCheck(context: HealthCheckContext): Promise<HealthCheckResult>;

  /**
   * Execute promise with timeout
   */
  protected async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => 
        setTimeout(() => reject(new Error('Health check timeout')), timeoutMs)
      )
    ]);
  }

  /**
   * Enhance result with response time if not already present
   */
  protected enhanceResult(result: HealthCheckResult, context: HealthCheckContext): HealthCheckResult {
    if (!result.responseTime) {
      result.responseTime = Date.now() - context.startTime;
    }
    return result;
  }

  /**
   * Standardized error handling
   */
  protected handleError(error: any, context: HealthCheckContext): HealthCheckResult {
    const errorMessage = this.getErrorMessage(error);
    this.logger.error(`${this.serviceName} health check failed:`, error);

    return {
      status: 'unhealthy',
      message: `${this.messages.unhealthy[this.serviceName as keyof typeof this.messages.unhealthy]}: ${errorMessage}`,
      responseTime: Date.now() - context.startTime,
      details: {
        error: error.code || 'UNKNOWN_ERROR',
        errorMessage
      }
    };
  }

  /**
   * Extract meaningful error message from various error types
   */
  protected getErrorMessage(error: any): string {
    if (((error as any)?.message || String(error)) === 'Health check timeout') {
      return 'Operation timed out';
    }

    if (error.code === 'ECONNRESET') {
      return 'Connection was reset - server may be unavailable';
    }

    if (error.code === 'ECONNREFUSED') {
      return 'Connection refused - check server address and port';
    }

    if (error.code === 'ETIMEDOUT') {
      return 'Connection timed out';
    }

    return ((error as any)?.message || String(error)) || 'Unknown error';
  }

  /**
   * Determine health status based on numeric thresholds
   */
  protected getThresholdStatus(
    value: number,
    degradedThreshold: number,
    unhealthyThreshold: number
  ): HealthStatus {
    if (value >= unhealthyThreshold) return 'unhealthy';
    if (value >= degradedThreshold) return 'degraded';
    return 'healthy';
  }

  /**
   * Create a not configured result
   */
  protected createNotConfiguredResult(): HealthCheckResult {
    return {
      status: 'degraded',
      message: this.messages.notConfigured[this.serviceName as keyof typeof this.messages.notConfigured] || `${this.serviceName} not configured`,
      details: { configured: false }
    };
  }

  /**
   * Create a healthy result
   */
  protected createHealthyResult(responseTime: number, details?: Record<string, any>): HealthCheckResult {
    return {
      status: 'healthy',
      message: this.messages.healthy[this.serviceName as keyof typeof this.messages.healthy],
      responseTime,
      details
    };
  }

  /**
   * Create a degraded result
   */
  protected createDegradedResult(message: string, responseTime: number, details?: Record<string, any>): HealthCheckResult {
    return {
      status: 'degraded',
      message,
      responseTime,
      details
    };
  }

  /**
   * Create an unhealthy result
   */
  protected createUnhealthyResult(message: string, responseTime: number, details?: Record<string, any>): HealthCheckResult {
    return {
      status: 'unhealthy',
      message,
      responseTime,
      details
    };
  }
}