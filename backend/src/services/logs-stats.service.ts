import { db } from '@/config/database';

export class LogsStatsService {
  /**
   * Get log statistics for a given time period
   */
  async getLogStats(hours: number = 24): Promise<any> {
    const [auditStats, systemStats, errorTrends, topErrors] = await Promise.all([
      this.getAuditStats(hours),
      this.getSystemStats(hours),
      this.getErrorTrends(hours),
      this.getTopErrors(hours)
    ]);

    return {
      auditStats,
      systemStats,
      errorTrends,
      topErrors,
      period: `${hours} hours`
    };
  }

  /**
   * Get audit log statistics
   */
  private async getAuditStats(hours: number): Promise<any[]> {
    const sql = `
      SELECT 
        event_type,
        event_action,
        COUNT(*) as count,
        COUNT(CASE WHEN success = false THEN 1 END) as failed_count,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(DISTINCT ip_address) as unique_ips
      FROM audit_logs
      WHERE created_at > CURRENT_TIMESTAMP - INTERVAL $1
      GROUP BY event_type, event_action
      ORDER BY count DESC
      LIMIT 20
    `;
    
    const result = await db.query(sql, [`${hours} hours`]);
    return result.rows;
  }

  /**
   * Get system log statistics
   */
  private async getSystemStats(hours: number): Promise<any[]> {
    const sql = `
      SELECT 
        level,
        module,
        COUNT(*) as count,
        AVG(duration_ms) as avg_duration,
        MAX(duration_ms) as max_duration,
        MIN(duration_ms) as min_duration,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms) as p95_duration
      FROM system_logs
      WHERE timestamp > CURRENT_TIMESTAMP - INTERVAL $1
      GROUP BY level, module
      ORDER BY count DESC
      LIMIT 20
    `;
    
    const result = await db.query(sql, [`${hours} hours`]);
    return result.rows;
  }

  /**
   * Get error trends over time
   */
  private async getErrorTrends(hours: number): Promise<any[]> {
    const sql = `
      SELECT 
        DATE_TRUNC('hour', timestamp) as hour,
        COUNT(*) as error_count,
        COUNT(DISTINCT module) as affected_modules
      FROM system_logs
      WHERE level = 'error'
      AND timestamp > CURRENT_TIMESTAMP - INTERVAL $1
      GROUP BY DATE_TRUNC('hour', timestamp)
      ORDER BY hour
    `;
    
    const result = await db.query(sql, [`${hours} hours`]);
    return result.rows;
  }

  /**
   * Get top error messages
   */
  private async getTopErrors(hours: number): Promise<any[]> {
    const sql = `
      SELECT 
        message,
        module,
        COUNT(*) as count,
        MAX(timestamp) as last_occurrence
      FROM system_logs
      WHERE level = 'error'
      AND timestamp > CURRENT_TIMESTAMP - INTERVAL $1
      GROUP BY message, module
      ORDER BY count DESC
      LIMIT 10
    `;
    
    const result = await db.query(sql, [`${hours} hours`]);
    return result.rows;
  }

  /**
   * Get logging system metrics
   */
  async getMetrics(): Promise<any> {
    const sql = `
      SELECT 
        (SELECT COUNT(*) FROM audit_logs) as total_audit_logs,
        (SELECT COUNT(*) FROM system_logs) as total_system_logs,
        (SELECT pg_size_pretty(pg_total_relation_size('audit_logs'))) as audit_table_size,
        (SELECT pg_size_pretty(pg_total_relation_size('system_logs'))) as system_table_size,
        (SELECT COUNT(*) FROM audit_logs WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour') as audit_logs_last_hour,
        (SELECT COUNT(*) FROM system_logs WHERE timestamp > CURRENT_TIMESTAMP - INTERVAL '1 hour') as system_logs_last_hour
    `;
    
    const result = await db.query(sql);
    return result.rows[0];
  }

  /**
   * Get cleanup statistics
   */
  async getCleanupStats(retentionDays: number): Promise<any> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const [auditResult, systemResult] = await Promise.all([
      db.query('SELECT COUNT(*) FROM audit_logs WHERE created_at < $1', [cutoffDate]),
      db.query('SELECT COUNT(*) FROM system_logs WHERE timestamp < $1', [cutoffDate])
    ]);

    return {
      auditLogsToDelete: parseInt(auditResult.rows[0].count),
      systemLogsToDelete: parseInt(systemResult.rows[0].count),
      cutoffDate,
      retentionDays
    };
  }

  /**
   * Perform log cleanup
   */
  async performCleanup(retentionDays: number): Promise<any> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const [auditResult, systemResult] = await Promise.all([
      db.query('DELETE FROM audit_logs WHERE created_at < $1', [cutoffDate]),
      db.query('DELETE FROM system_logs WHERE timestamp < $1', [cutoffDate])
    ]);

    return {
      auditLogsDeleted: auditResult.rowCount || 0,
      systemLogsDeleted: systemResult.rowCount || 0,
      cutoffDate,
      retentionDays
    };
  }
}

export const logsStatsService = new LogsStatsService();