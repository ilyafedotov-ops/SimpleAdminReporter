/**
 * Database Health Checker
 * Implements health checks for PostgreSQL database
 */

import { db } from '@/config/database';
import { BaseHealthChecker } from '../base-health-checker';
import { HealthCheckResult, HealthCheckContext } from '../types';

export class DatabaseHealthChecker extends BaseHealthChecker {
  constructor() {
    super('database');
  }

  protected async performCheck(context: HealthCheckContext): Promise<HealthCheckResult> {
    const result = await db.query('SELECT 1 as health_check');
    
    if (result.rows[0].health_check !== 1) {
      return this.createDegradedResult(
        'Database returned unexpected result',
        Date.now() - context.startTime
      );
    }

    // Get connection pool statistics
    const poolStats = await this.getPoolStats();
    
    return this.createHealthyResult(
      Date.now() - context.startTime,
      { pool: poolStats }
    );
  }

  private async getPoolStats(): Promise<Record<string, any>> {
    try {
      const result = await db.query(`
        SELECT 
          numbackends as active_connections,
          (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') as max_connections,
          datname as database_name
        FROM pg_stat_database 
        WHERE datname = current_database()
      `);
      
      return result.rows[0] || {};
    } catch (error) {
      this.logger.warn('Failed to get pool stats:', error);
      return {};
    }
  }
}