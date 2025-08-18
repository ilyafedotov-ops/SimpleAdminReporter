/**
 * Storage Health Checker
 * Implements health checks for file system storage
 */

import fs from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { BaseHealthChecker } from '../base-health-checker';
import { HealthCheckResult, HealthCheckContext } from '../types';

export class StorageHealthChecker extends BaseHealthChecker {
  constructor() {
    super('storage');
  }

  protected async performCheck(context: HealthCheckContext): Promise<HealthCheckResult> {
    const isInContainer = this.isRunningInContainer();
    const exportPath = process.env.REPORT_EXPORT_PATH || 
      (isInContainer ? '/app/exports' : './exports');
    
    // For development, ensure we use a writable path
    const actualExportPath = process.env.NODE_ENV === 'development' 
      ? './exports' 
      : exportPath;
    
    try {
      // Ensure directory exists
      await this.ensureDirectoryExists(actualExportPath);
      
      // Check write access
      await fs.access(actualExportPath, fs.constants.W_OK);
      
      // Get directory statistics
      const stats = await this.getDirectoryStats(actualExportPath);
      
      return this.createHealthyResult(
        Date.now() - context.startTime,
        {
          path: actualExportPath,
          fileCount: stats.fileCount,
          totalSize: `${(stats.totalSize / 1024 / 1024).toFixed(2)} MB`
        }
      );
    } catch (error) {
      return this.createStorageError(error, context, actualExportPath);
    }
  }

  private async ensureDirectoryExists(path: string): Promise<void> {
    try {
      await fs.access(path, fs.constants.F_OK);
    } catch {
      await fs.mkdir(path, { recursive: true });
    }
  }

  private async getDirectoryStats(dirPath: string): Promise<{ fileCount: number; totalSize: number }> {
    const files = await fs.readdir(dirPath);
    let totalSize = 0;
    
    for (const file of files) {
      try {
        const stats = await fs.stat(path.join(dirPath, file));
        totalSize += stats.size;
      } catch {
        // Ignore individual file errors
      }
    }
    
    return { fileCount: files.length, totalSize };
  }

  private isRunningInContainer(): boolean {
    // Check for .dockerenv file
    if (existsSync('/.dockerenv')) {
      return true;
    }
    
    // Check cgroup for container patterns
    try {
      if (existsSync('/proc/1/cgroup')) {
        const cgroup = readFileSync('/proc/1/cgroup', 'utf8');
        return cgroup.includes('docker') || 
               cgroup.includes('containerd') || 
               cgroup.includes('kubepods');
      }
    } catch {
      // Ignore errors
    }
    
    return false;
  }

  private createStorageError(error: any, context: HealthCheckContext, path: string): HealthCheckResult {
    return {
      status: 'unhealthy',
      message: `Storage check failed: ${this.getErrorMessage(error)}`,
      responseTime: Date.now() - context.startTime,
      details: { path }
    };
  }
}
