import { Request, Response } from 'express';
import { healthService } from '@/services/health/health.service';
import { logger } from '@/utils/logger';
import { db } from '@/config/database';

export class HealthController {
  /**
   * Basic health check endpoint
   */
  async getBasicHealth(req: Request, res: Response) {
    try {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'ad-reporting-api',
        version: process.env.APP_VERSION || '1.0.0'
      });
    } catch (error) {
      logger.error('Basic health check error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Health check failed'
      });
    }
  }

  /**
   * Detailed health check endpoint
   */
  async getDetailedHealth(req: Request, res: Response) {
    try {
      const health = await healthService.getHealthStatus();
      
      // Always return 200 for detailed health endpoint to allow frontend to display information
      // The status is indicated in the response body
      res.status(200).json(health);
    } catch (error) {
      logger.error('Detailed health check error:', error);
      res.status(500).json({
        status: 'unhealthy',
        timestamp: new Date(),
        error: 'Health check failed',
        message: (error as Error).message
      });
    }
  }

  /**
   * Readiness probe for Kubernetes/Docker
   */
  async getReadiness(req: Request, res: Response) {
    try {
      const health = await healthService.getHealthStatus();
      
      // Service is ready if database and redis are healthy
      const isReady = 
        health.checks.database.status === 'healthy' &&
        health.checks.redis.status === 'healthy';
      
      if (isReady) {
        res.json({
          status: 'ready',
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(503).json({
          status: 'not ready',
          timestamp: new Date().toISOString(),
          reason: 'Required services are not healthy'
        });
      }
    } catch (error) {
      logger.error('Readiness check error:', error);
      res.status(503).json({
        status: 'not ready',
        error: (error as Error).message
      });
    }
  }

  /**
   * Liveness probe for Kubernetes/Docker
   */
  async getLiveness(req: Request, res: Response) {
    try {
      // Simple check that the process is alive and can respond
      res.json({
        status: 'alive',
        timestamp: new Date().toISOString(),
        pid: process.pid,
        uptime: process.uptime()
      });
    } catch (error) {
      logger.error('Liveness check error:', error);
      res.status(500).json({
        status: 'error',
        error: (error as Error).message
      });
    }
  }

  /**
   * Get specific component health
   */
  async getComponentHealth(req: Request, res: Response) {
    try {
      const { component } = req.params;
      const validComponents = ['database', 'redis', 'ldap', 'azure', 'queue', 'storage', 'system'];
      
      if (!validComponents.includes(component)) {
        return res.status(400).json({
          error: 'Invalid component',
          validComponents
        });
      }
      
      const health = await healthService.getHealthStatus();
      const componentHealth = (health.checks as any)[component];
      
      res.json({
        component,
        ...componentHealth,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Component health check error:', error);
      res.status(500).json({
        status: 'error',
        error: (error as Error).message
      });
    }
  }

  /**
   * Get health summary (statuses only)
   */
  async getHealthSummary(req: Request, res: Response) {
    try {
      const summary = await healthService.getHealthSummary();
      res.json(summary);
    } catch (error) {
      logger.error('Health summary error:', error);
      res.status(500).json({
        status: 'error',
        error: (error as Error).message
      });
    }
  }

  /**
   * Check if system is operational
   */
  async getOperational(req: Request, res: Response) {
    try {
      const operational = await healthService.isOperational();
      res.json({
        operational,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Operational check error:', error);
      res.status(500).json({
        operational: false,
        error: (error as Error).message
      });
    }
  }

  /**
   * Get database pool statistics
   */
  async getDatabasePoolStats(req: Request, res: Response) {
    try {
      const poolStats = db.getPoolStats();
      const healthy = poolStats.idleCount > 0 || poolStats.totalCount < 50;
      
      res.status(healthy ? 200 : 503).json({
        success: true,
        data: {
          healthy,
          pool: poolStats,
          maxConnections: 50,
          utilizationPercent: ((poolStats.totalCount - poolStats.idleCount) / 50) * 100,
          warning: poolStats.waitingCount > 0 ? 'Connections are waiting for available pool slots' : null
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error getting database pool stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get database pool statistics'
      });
    }
  }
}

export default new HealthController();
