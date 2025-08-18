import { Request, Response } from 'express';
import { configService } from '@/config/config.service';
import { logger } from '@/utils/logger';
import { asyncHandler } from '@/middleware/error.middleware';

/**
 * System Configuration Controller
 * Handles system-wide configuration management and status monitoring
 */
export class SystemController {
  /**
   * Get system configuration and status
   */
  getSystemConfig = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      const config = configService.getConfig();
      const availability = configService.getServiceAvailability();
      // const __errors = configService.getErrors();
      const validationResult = await configService.initialize();

      // Calculate uptime
      const uptime = process.uptime();
      const uptimeString = this.formatUptime(uptime);

      const systemInfo = {
        availability,
        errors: validationResult.errors,
        warnings: validationResult.warnings,
        environment: config.app.nodeEnv,
        version: process.env.npm_package_version || '1.0.0',
        uptime: uptimeString,
        jwtConfigured: !!config.app.jwtSecret,
        rateLimiting: true, // Default enabled
        mockData: config.mockData,
        services: {
          database: {
            host: config.database.host,
            database: config.database.database,
            connected: availability.database
          },
          redis: {
            host: config.redis.host,
            connected: availability.redis
          },
          ad: config.ad ? {
            server: config.ad.server,
            configured: availability.ad
          } : null,
          azure: config.azure ? {
            tenantId: config.azure.tenantId,
            configured: availability.azure
          } : null
        }
      };

      res.json(systemInfo);
    } catch (error: any) {
      logger.error('Failed to get system configuration:', error);
      res.status(500).json({
        error: 'Failed to retrieve system configuration',
        message: ((error as any)?.message || String(error))
      });
    }
  });

  /**
   * Update system configuration
   */
  updateSystemConfig = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      const { rateLimiting, mockData } = req.body;

      // For now, we'll only support updating certain configuration flags
      // In a full implementation, you might want to update environment variables
      // or configuration files and restart services

      // Log the configuration change
      logger.info('System configuration update requested', {
        userId: req.user?.id,
        changes: req.body
      });

      // Return the updated configuration
      const config = configService.getConfig();
      const availability = configService.getServiceAvailability();
      const validationResult = await configService.initialize();

      const uptime = process.uptime();
      const uptimeString = this.formatUptime(uptime);

      const systemInfo = {
        availability,
        errors: validationResult.errors,
        warnings: validationResult.warnings,
        environment: config.app.nodeEnv,
        version: process.env.npm_package_version || '1.0.0',
        uptime: uptimeString,
        jwtConfigured: !!config.app.jwtSecret,
        rateLimiting: rateLimiting !== undefined ? rateLimiting : true,
        mockData: mockData !== undefined ? mockData : config.mockData,
        services: {
          database: {
            host: config.database.host,
            database: config.database.database,
            connected: availability.database
          },
          redis: {
            host: config.redis.host,
            connected: availability.redis
          },
          ad: config.ad ? {
            server: config.ad.server,
            configured: availability.ad
          } : null,
          azure: config.azure ? {
            tenantId: config.azure.tenantId,
            configured: availability.azure
          } : null
        }
      };

      res.json(systemInfo);
    } catch (error: any) {
      logger.error('Failed to update system configuration:', error);
      res.status(500).json({
        error: 'Failed to update system configuration',
        message: ((error as any)?.message || String(error))
      });
    }
  });

  /**
   * Get system health status
   */
  getSystemHealth = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      const availability = configService.getServiceAvailability();
      const __errors = configService.getErrors();
      const hasErrors = configService.hasErrors();

      const health = {
        status: hasErrors ? 'unhealthy' : 'healthy',
        timestamp: new Date().toISOString(),
        services: availability,
        errors: __errors,
        uptime: process.uptime()
      };

      const statusCode = hasErrors ? 503 : 200;
      res.status(statusCode).json(health);
    } catch (error: any) {
      logger.error('Failed to get system health:', error);
      res.status(500).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        error: 'Failed to retrieve system health',
        message: ((error as any)?.message || String(error))
      });
    }
  });

  /**
   * Format uptime in human readable format
   */
  private formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);

    return parts.length > 0 ? parts.join(' ') : '< 1m';
  }
}

export const systemController = new SystemController();