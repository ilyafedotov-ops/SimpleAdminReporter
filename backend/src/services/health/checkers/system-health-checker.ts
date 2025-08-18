/**
 * System Health Checker
 * Implements health checks for system resources (CPU, Memory, Disk)
 */

import os from 'os';
import fs from 'fs/promises';
import { BaseHealthChecker } from '../base-health-checker';
import { SystemHealthMetrics, HealthCheckContext } from '../types';
import { HEALTH_THRESHOLDS } from '../config';

export class SystemHealthChecker extends BaseHealthChecker {
  constructor() {
    super('system');
  }

  async check(): Promise<SystemHealthMetrics> {
    const context: HealthCheckContext = {
      serviceName: this.serviceName,
      timeout: this.config[this.serviceName]?.timeout || 1000,
      startTime: Date.now()
    };

    try {
      const result = await this.withTimeout(
        this.performSystemCheck(context),
        context.timeout
      );
      return result;
    } catch (error) {
      return this.handleSystemError(error);
    }
  }

  protected async performCheck(context: HealthCheckContext): Promise<SystemHealthMetrics> {
    // This method is not used for system checks, but required by base class
    return this.performSystemCheck(context);
  }

  private async performSystemCheck(_context: HealthCheckContext): Promise<SystemHealthMetrics> {
    // Get system metrics
    const cpuUsage = this.calculateCPUUsage();
    const memoryMetrics = this.getMemoryMetrics();
    const diskMetrics = await this.getDiskMetrics();
    
    // Determine overall system health
    const cpuStatus = this.getThresholdStatus(
      cpuUsage,
      HEALTH_THRESHOLDS.cpu.degraded,
      HEALTH_THRESHOLDS.cpu.unhealthy
    );
    
    const memStatus = this.getThresholdStatus(
      memoryMetrics.percentage,
      HEALTH_THRESHOLDS.memory.degraded,
      HEALTH_THRESHOLDS.memory.unhealthy
    );
    
    const diskStatus = this.getThresholdStatus(
      diskMetrics.percentage,
      HEALTH_THRESHOLDS.disk.degraded,
      HEALTH_THRESHOLDS.disk.unhealthy
    );
    
    // Determine overall status (worst of all metrics)
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    let message = this.messages.healthy.system;
    
    if (cpuStatus === 'unhealthy' || memStatus === 'unhealthy' || diskStatus === 'unhealthy') {
      overallStatus = 'unhealthy';
      message = this.messages.unhealthy.system;
    } else if (cpuStatus === 'degraded' || memStatus === 'degraded' || diskStatus === 'degraded') {
      overallStatus = 'degraded';
      message = this.messages.degraded.system;
    }
    
    return {
      status: overallStatus,
      message,
      cpu: {
        usage: Math.round(cpuUsage),
        cores: os.cpus().length
      },
      memory: memoryMetrics,
      disk: diskMetrics
    };
  }

  private calculateCPUUsage(): number {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;
    
    cpus.forEach(cpu => {
      for (const type in cpu.times) {
        totalTick += (cpu.times as any)[type];
      }
      totalIdle += cpu.times.idle;
    });
    
    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;
    const usage = 100 - ~~(100 * idle / total);
    
    return usage;
  }

  private getMemoryMetrics() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const percentage = Math.round((usedMem / totalMem) * 100);
    
    return {
      total: totalMem,
      used: usedMem,
      free: freeMem,
      percentage
    };
  }

  private async getDiskMetrics() {
    try {
      const stats = await fs.statfs('/');
      const total = stats.blocks * stats.bsize;
      const free = stats.bfree * stats.bsize;
      const used = total - free;
      const percentage = Math.round((used / total) * 100);
      
      return { total, used, free, percentage };
    } catch {
      return { total: 0, used: 0, free: 0, percentage: 0 };
    }
  }

  private handleSystemError(error: any): SystemHealthMetrics {
    this.logger.error('System health check failed:', error);
    
    return {
      status: 'unhealthy',
      message: `System check failed: ${this.getErrorMessage(error)}`,
      cpu: { usage: 0, cores: 0 },
      memory: { total: 0, used: 0, free: 0, percentage: 0 },
      disk: { total: 0, used: 0, free: 0, percentage: 0 }
    };
  }
}