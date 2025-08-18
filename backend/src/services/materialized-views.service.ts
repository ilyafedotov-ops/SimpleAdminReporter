import { db } from '@/config/database';
import { logger } from '@/utils/logger';
import { EventEmitter } from 'node:events';

export interface MaterializedViewStats {
  viewName: string;
  lastRefreshed: Date | null;
  rowCount: number;
  refreshDuration: number | null;
  status: 'ready' | 'refreshing' | 'error';
  error?: string;
}

export class MaterializedViewsService extends EventEmitter {
  private refreshInProgress = new Set<string>();
  private lastRefreshTimes = new Map<string, Date>();
  private refreshDurations = new Map<string, number>();

  /**
   * Refresh all logs materialized views
   */
  async refreshAllViews(): Promise<void> {
    const startTime = Date.now();
    
    try {
      logger.info('Starting refresh of all materialized views');
      
      // Use the stored procedure to refresh all views
      await db.query('SELECT refresh_logs_materialized_views()');
      
      const duration = Date.now() - startTime;
      this.updateRefreshStats('all', duration);
      
      logger.info(`All materialized views refreshed successfully in ${duration}ms`);
      this.emit('refresh:complete', { views: 'all', duration });
    } catch (error) {
      logger.error('Failed to refresh materialized views:', error);
      this.emit('refresh:error', { views: 'all', error });
      throw error;
    }
  }

  /**
   * Refresh a specific materialized view
   */
  async refreshView(viewName: string): Promise<void> {
    if (this.refreshInProgress.has(viewName)) {
      logger.warn(`Refresh already in progress for view: ${viewName}`);
      return;
    }

    this.refreshInProgress.add(viewName);
    const startTime = Date.now();

    try {
      logger.info(`Starting refresh of materialized view: ${viewName}`);
      
      // Use CONCURRENTLY to avoid blocking reads
      await db.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${viewName}`);
      
      const duration = Date.now() - startTime;
      this.updateRefreshStats(viewName, duration);
      
      logger.info(`Materialized view ${viewName} refreshed successfully in ${duration}ms`);
      this.emit('refresh:complete', { view: viewName, duration });
    } catch (error) {
      logger.error(`Failed to refresh materialized view ${viewName}:`, error);
      this.emit('refresh:error', { view: viewName, error });
      throw error;
    } finally {
      this.refreshInProgress.delete(viewName);
    }
  }

  /**
   * Get statistics for all materialized views
   */
  async getViewStats(): Promise<MaterializedViewStats[]> {
    try {
      const query = `
        SELECT 
          schemaname,
          matviewname as view_name,
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||matviewname)) as size,
          (SELECT COUNT(*) FROM pg_class WHERE relname = matviewname) > 0 as exists
        FROM pg_matviews
        WHERE schemaname = 'public' 
          AND matviewname LIKE 'mv_logs%' OR matviewname = 'mv_combined_logs'
        ORDER BY matviewname;
      `;

      const result = await db.query(query);
      
      const stats: MaterializedViewStats[] = [];

      for (const row of result.rows) {
        const viewName = row.view_name;
        
        // Get row count
        let rowCount = 0;
        try {
          const countResult = await db.query(`SELECT COUNT(*) as count FROM ${viewName}`);
          rowCount = parseInt(countResult.rows[0].count);
        } catch (error) {
          logger.warn(`Could not get row count for ${viewName}:`, error);
        }

        stats.push({
          viewName,
          lastRefreshed: this.lastRefreshTimes.get(viewName) || null,
          rowCount,
          refreshDuration: this.refreshDurations.get(viewName) || null,
          status: this.refreshInProgress.has(viewName) ? 'refreshing' : 'ready'
        });
      }

      return stats;
    } catch (error) {
      logger.error('Failed to get materialized view stats:', error);
      throw error;
    }
  }

  /**
   * Check if materialized views exist
   */
  async checkViewsExist(): Promise<boolean> {
    try {
      const query = `
        SELECT COUNT(*) as count
        FROM pg_matviews
        WHERE schemaname = 'public' 
          AND matviewname IN ('mv_combined_logs', 'mv_logs_daily_summary', 'mv_logs_hourly_stats');
      `;

      const result = await db.query(query);
      return parseInt(result.rows[0].count) === 3;
    } catch (error) {
      logger.error('Failed to check materialized views:', error);
      return false;
    }
  }

  /**
   * Get the age of data in a materialized view
   */
  async getViewDataAge(viewName: string): Promise<number | null> {
    try {
      const query = `
        SELECT EXTRACT(EPOCH FROM (NOW() - MAX(timestamp))) as age_seconds
        FROM ${viewName}
        WHERE timestamp IS NOT NULL;
      `;

      const result = await db.query(query);
      
      if (result.rows.length > 0 && result.rows[0].age_seconds !== null) {
        return Math.floor(result.rows[0].age_seconds);
      }
      
      return null;
    } catch (error) {
      logger.warn(`Could not get data age for ${viewName}:`, error);
      return null;
    }
  }

  /**
   * Schedule automatic refresh based on age
   */
  async refreshIfNeeded(maxAgeMinutes: number = 5): Promise<boolean> {
    try {
      const ageSeconds = await this.getViewDataAge('mv_combined_logs');
      
      if (ageSeconds === null) {
        // No data or error, trigger refresh
        await this.refreshAllViews();
        return true;
      }

      const ageMinutes = ageSeconds / 60;
      
      if (ageMinutes > maxAgeMinutes) {
        logger.info(`Materialized views are ${ageMinutes.toFixed(1)} minutes old, refreshing...`);
        await this.refreshAllViews();
        return true;
      }

      logger.debug(`Materialized views are ${ageMinutes.toFixed(1)} minutes old, no refresh needed`);
      return false;
    } catch (error) {
      logger.error('Error checking materialized view age:', error);
      return false;
    }
  }

  /**
   * Update refresh statistics
   */
  private updateRefreshStats(viewName: string, duration: number): void {
    this.lastRefreshTimes.set(viewName, new Date());
    this.refreshDurations.set(viewName, duration);
  }

  /**
   * Get refresh history
   */
  getRefreshHistory(): Array<{
    viewName: string;
    lastRefreshed: Date | null;
    duration: number | null;
  }> {
    const history: Array<{
      viewName: string;
      lastRefreshed: Date | null;
      duration: number | null;
    }> = [];

    for (const [viewName, lastRefreshed] of this.lastRefreshTimes) {
      history.push({
        viewName,
        lastRefreshed,
        duration: this.refreshDurations.get(viewName) || null
      });
    }

    return history;
  }
}

export const materializedViewsService = new MaterializedViewsService();