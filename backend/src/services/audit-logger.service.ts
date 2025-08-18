import { db } from '@/config/database';
import { logger } from '@/utils/logger';
import { Request } from 'express';
import { emitLogEvent } from '@/events/log-events';

export type EventType = 'auth' | 'access' | 'admin' | 'security' | 'data' | 'system';

export type EventAction = 
  // Authentication events
  | 'login' | 'logout' | 'token_refresh' | 'login_failed' | 'account_locked' | 'account_unlocked'
  // Access events
  | 'report_access' | 'report_denied' | 'api_access' | 'unauthorized_access'
  // Admin events
  | 'user_created' | 'user_updated' | 'user_deleted' | 'permission_changed' | 'settings_updated'
  // Security events
  | 'password_changed' | 'password_reset' | 'mfa_enabled' | 'mfa_disabled' | 'suspicious_activity'
  // Data events
  | 'report_exported' | 'data_imported' | 'template_created' | 'template_modified' | 'template_deleted'
  // System events
  | 'service_started' | 'service_stopped' | 'config_changed' | 'maintenance_mode';

export interface AuditLogEntry {
  eventType: EventType;
  eventAction: EventAction;
  userId?: number;
  username?: string;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, any>;
  success?: boolean;
  errorMessage?: string;
}

export interface AuditContext {
  user?: {
    id: number;
    username: string;
  };
  request?: Request;
  sessionId?: string;
}

export class AuditLogger {
  private static instance: AuditLogger;
  private batchQueue: AuditLogEntry[] = [];
  private batchTimeout: NodeJS.Timeout | null = null;
  private flushInterval: NodeJS.Timeout | null = null;
  private readonly BATCH_SIZE = 10;
  private readonly BATCH_DELAY_MS = 1000;

  private constructor() {
    // Set up periodic flush only in non-test environments
    if (process.env.NODE_ENV !== 'test') {
      this.flushInterval = setInterval(() => this.flushBatch(), 30000); // Flush every 30 seconds
    }
  }

  public static getInstance(): AuditLogger {
    if (!AuditLogger.instance) {
      AuditLogger.instance = new AuditLogger();
    }
    return AuditLogger.instance;
  }

  /**
   * Cleanup method for tests
   */
  public static cleanup(): void {
    if (AuditLogger.instance) {
      if (AuditLogger.instance.flushInterval) {
        clearInterval(AuditLogger.instance.flushInterval);
        AuditLogger.instance.flushInterval = null;
      }
      if (AuditLogger.instance.batchTimeout) {
        clearTimeout(AuditLogger.instance.batchTimeout);
        AuditLogger.instance.batchTimeout = null;
      }
      AuditLogger.instance = undefined as any;
    }
  }

  /**
   * Log an authentication event
   */
  async logAuth(
    action: Extract<EventAction, 'login' | 'logout' | 'token_refresh' | 'login_failed' | 'account_locked' | 'account_unlocked'>,
    context: AuditContext,
    details?: Record<string, any>,
    success: boolean = true,
    errorMessage?: string
  ): Promise<void> {
    await this.log({
      eventType: 'auth',
      eventAction: action,
      userId: context.user?.id,
      username: context.user?.username || details?.username,
      ipAddress: this.getIpAddress(context.request),
      userAgent: context.request?.get('user-agent'),
      sessionId: context.sessionId,
      details,
      success,
      errorMessage
    });
  }

  /**
   * Log an access event
   */
  async logAccess(
    action: Extract<EventAction, 'report_access' | 'report_denied' | 'api_access' | 'unauthorized_access'>,
    context: AuditContext,
    resourceType?: string,
    resourceId?: string,
    details?: Record<string, any>,
    success: boolean = true
  ): Promise<void> {
    await this.log({
      eventType: 'access',
      eventAction: action,
      userId: context.user?.id,
      username: context.user?.username,
      ipAddress: this.getIpAddress(context.request),
      userAgent: context.request?.get('user-agent'),
      sessionId: context.sessionId,
      resourceType,
      resourceId,
      details,
      success
    });
  }

  /**
   * Log an admin event
   */
  async logAdmin(
    action: Extract<EventAction, 'user_created' | 'user_updated' | 'user_deleted' | 'permission_changed' | 'settings_updated'>,
    context: AuditContext,
    resourceType?: string,
    resourceId?: string,
    details?: Record<string, any>
  ): Promise<void> {
    await this.log({
      eventType: 'admin',
      eventAction: action,
      userId: context.user?.id,
      username: context.user?.username,
      ipAddress: this.getIpAddress(context.request),
      userAgent: context.request?.get('user-agent'),
      sessionId: context.sessionId,
      resourceType,
      resourceId,
      details,
      success: true
    });
  }

  /**
   * Log a security event
   */
  async logSecurity(
    action: Extract<EventAction, 'password_changed' | 'password_reset' | 'mfa_enabled' | 'mfa_disabled' | 'suspicious_activity'>,
    context: AuditContext,
    details?: Record<string, any>,
    success: boolean = true,
    errorMessage?: string
  ): Promise<void> {
    await this.log({
      eventType: 'security',
      eventAction: action,
      userId: context.user?.id,
      username: context.user?.username,
      ipAddress: this.getIpAddress(context.request),
      userAgent: context.request?.get('user-agent'),
      sessionId: context.sessionId,
      details,
      success,
      errorMessage
    });
  }

  /**
   * Log a data event
   */
  async logData(
    action: Extract<EventAction, 'report_exported' | 'data_imported' | 'template_created' | 'template_modified' | 'template_deleted'>,
    context: AuditContext,
    resourceType?: string,
    resourceId?: string,
    details?: Record<string, any>
  ): Promise<void> {
    await this.log({
      eventType: 'data',
      eventAction: action,
      userId: context.user?.id,
      username: context.user?.username,
      ipAddress: this.getIpAddress(context.request),
      userAgent: context.request?.get('user-agent'),
      sessionId: context.sessionId,
      resourceType,
      resourceId,
      details,
      success: true
    });
  }

  /**
   * Log a system event
   */
  async logSystem(
    action: Extract<EventAction, 'service_started' | 'service_stopped' | 'config_changed' | 'maintenance_mode'>,
    details?: Record<string, any>
  ): Promise<void> {
    await this.log({
      eventType: 'system',
      eventAction: action,
      details,
      success: true
    });
  }

  /**
   * Core logging method
   */
  private async log(entry: AuditLogEntry): Promise<void> {
    try {
      // Add to batch queue
      this.batchQueue.push(entry);

      // Log to application logger for real-time monitoring
      const logLevel = entry.success ? 'info' : 'warn';
      logger[logLevel](`Audit: ${entry.eventType}.${entry.eventAction}`, {
        userId: entry.userId,
        username: entry.username,
        ipAddress: entry.ipAddress,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        success: entry.success,
        errorMessage: entry.errorMessage
      });

      // Check if we should flush the batch
      if (this.batchQueue.length >= this.BATCH_SIZE) {
        await this.flushBatch();
      } else {
        // Set up delayed flush
        this.scheduleBatchFlush();
      }

    } catch (error) {
      logger.error('Error in audit logging:', error);
    }
  }

  /**
   * Schedule a batch flush
   */
  private scheduleBatchFlush(): void {
    if (this.batchTimeout) {
      return; // Already scheduled
    }

    this.batchTimeout = setTimeout(() => {
      this.flushBatch().catch(error => {
        logger.error('Error in scheduled batch flush:', error);
      });
    }, this.BATCH_DELAY_MS);
  }

  /**
   * Flush the batch queue to database
   */
  private async flushBatch(): Promise<void> {
    if (this.batchQueue.length === 0) {
      return;
    }

    // Clear timeout if set
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }

    // Get entries to flush
    const entriesToFlush = [...this.batchQueue];
    this.batchQueue = [];

    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      // Prepare bulk insert
      const values: any[] = [];
      const placeholders: string[] = [];
      let paramIndex = 1;

      for (const entry of entriesToFlush) {
        placeholders.push(
          `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`
        );

        values.push(
          entry.eventType,
          entry.eventAction,
          entry.userId || null,
          entry.username || null,
          entry.ipAddress || null,
          entry.userAgent || null,
          entry.sessionId || null,
          entry.resourceType || null,
          entry.resourceId || null,
          entry.details || {},
          entry.success !== false,
          entry.errorMessage || null
        );
      }

      const query = `
        INSERT INTO audit_logs 
        (event_type, event_action, user_id, username, ip_address, user_agent, 
         session_id, resource_type, resource_id, details, success, error_message)
        VALUES ${placeholders.join(', ')}
      `;

      await client.query(query, values);
      await client.query('COMMIT');

      logger.debug(`Flushed ${entriesToFlush.length} audit log entries to database`);
      
      // Emit events for real-time streaming
      for (const entry of entriesToFlush) {
        emitLogEvent({
          log_type: 'audit',
          id: Date.now().toString(), // Temporary ID
          timestamp: new Date().toISOString(),
          type: entry.eventType,
          action: entry.eventAction,
          username: entry.username,
          success: entry.success
        });
      }

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error flushing audit log batch:', error);
      
      // Re-add entries to queue for retry
      this.batchQueue.unshift(...entriesToFlush);
      
    } finally {
      client.release();
    }
  }

  /**
   * Extract IP address from request
   */
  private getIpAddress(request?: Request): string | undefined {
    if (!request) return undefined;

    // Check various headers for real IP
    const forwarded = request.get('x-forwarded-for');
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }

    return request.get('x-real-ip') || request.ip;
  }

  /**
   * Query audit logs
   */
  async queryLogs(params: {
    eventType?: EventType;
    eventAction?: EventAction;
    userId?: number;
    username?: string;
    startDate?: Date;
    endDate?: Date;
    success?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ logs: any[]; total: number }> {
    try {
      const conditions: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (params.eventType) {
        conditions.push(`event_type = $${paramIndex++}`);
        values.push(params.eventType);
      }
      if (params.eventAction) {
        conditions.push(`event_action = $${paramIndex++}`);
        values.push(params.eventAction);
      }
      if (params.userId !== undefined) {
        conditions.push(`user_id = $${paramIndex++}`);
        values.push(params.userId);
      }
      if (params.username) {
        conditions.push(`username = $${paramIndex++}`);
        values.push(params.username);
      }
      if (params.startDate) {
        conditions.push(`created_at >= $${paramIndex++}`);
        values.push(params.startDate);
      }
      if (params.endDate) {
        conditions.push(`created_at <= $${paramIndex++}`);
        values.push(params.endDate);
      }
      if (params.success !== undefined) {
        conditions.push(`success = $${paramIndex++}`);
        values.push(params.success);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Get total count
      const countQuery = `SELECT COUNT(*) FROM audit_logs ${whereClause}`;
      const countResult = await db.query(countQuery, values);
      const total = parseInt(countResult.rows[0].count);

      // Get paginated results
      const limit = params.limit || 100;
      const offset = params.offset || 0;
      
      const dataQuery = `
        SELECT * FROM audit_logs 
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;
      
      values.push(limit, offset);
      const dataResult = await db.query(dataQuery, values);

      return {
        logs: dataResult.rows,
        total
      };

    } catch (error) {
      logger.error('Error querying audit logs:', error);
      throw error;
    }
  }

  /**
   * Get user activity summary
   */
  async getUserActivitySummary(userId: number, days: number = 30): Promise<any> {
    try {
      const result = await db.query(
        `SELECT 
          event_type,
          event_action,
          COUNT(*) as count,
          COUNT(CASE WHEN success = false THEN 1 END) as failed_count,
          MAX(created_at) as last_occurrence
        FROM audit_logs
        WHERE user_id = $1
        AND created_at > CURRENT_TIMESTAMP - INTERVAL $2
        GROUP BY event_type, event_action
        ORDER BY count DESC`,
        [userId, `${days} days`]
      );

      return result.rows;

    } catch (error) {
      logger.error('Error getting user activity summary:', error);
      throw error;
    }
  }

  /**
   * Get security events summary
   */
  async getSecurityEventsSummary(hours: number = 24): Promise<any> {
    try {
      const result = await db.query(
        `SELECT 
          event_action,
          COUNT(*) as count,
          COUNT(DISTINCT user_id) as unique_users,
          COUNT(DISTINCT ip_address) as unique_ips
        FROM audit_logs
        WHERE event_type IN ('auth', 'security')
        AND created_at > CURRENT_TIMESTAMP - INTERVAL $1
        GROUP BY event_action
        ORDER BY count DESC`,
        [`${hours} hours`]
      );

      return result.rows;

    } catch (error) {
      logger.error('Error getting security events summary:', error);
      throw error;
    }
  }

  /**
   * Force flush (for graceful shutdown)
   */
  async forceFlush(): Promise<void> {
    await this.flushBatch();
  }
}

// Export singleton instance
export const auditLogger = AuditLogger.getInstance();