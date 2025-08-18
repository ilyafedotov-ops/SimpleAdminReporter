import { Request, Response } from 'express';
import { auditLogger } from '@/services/audit-logger.service';
import { failedLoginTracker } from '@/services/failed-login-tracker.service';
import { logger } from '@/utils/logger';
import { asyncHandler, createError } from '@/middleware/error.middleware';
import { query, validationResult } from 'express-validator';

export class SecurityController {
  /**
   * Get audit logs
   * GET /api/admin/security/audit-logs
   */
  getAuditLogs = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user?.isAdmin) {
      throw createError('Administrator access required', 403);
    }

    // Validate query parameters
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw createError('Validation failed: ' + errors.array().map(e => e.msg).join(', '), 400);
    }

    const {
      eventType,
      eventAction,
      userId,
      username,
      startDate,
      endDate,
      success,
      limit = 100,
      offset = 0
    } = req.query;

    try {
      const result = await auditLogger.queryLogs({
        eventType: eventType as any,
        eventAction: eventAction as any,
        userId: userId ? parseInt(userId as string) : undefined,
        username: username as string,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        success: success === 'true' ? true : success === 'false' ? false : undefined,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string)
      });

      res.json({
        success: true,
        data: {
          logs: result.logs,
          total: result.total,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string)
        }
      });

    } catch (error) {
      logger.error('Failed to fetch audit logs:', error);
      throw error;
    }
  });

  /**
   * Get security events summary
   * GET /api/admin/security/events-summary
   */
  getSecurityEventsSummary = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user?.isAdmin) {
      throw createError('Administrator access required', 403);
    }

    const hours = parseInt(req.query.hours as string) || 24;

    try {
      const summary = await auditLogger.getSecurityEventsSummary(hours);

      res.json({
        success: true,
        data: {
          summary,
          period: `${hours} hours`
        }
      });

    } catch (error) {
      logger.error('Failed to fetch security events summary:', error);
      throw error;
    }
  });

  /**
   * Get user activity summary
   * GET /api/admin/security/user-activity/:userId
   */
  getUserActivity = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user?.isAdmin) {
      throw createError('Administrator access required', 403);
    }

    const userId = parseInt(req.params.userId);
    const days = parseInt(req.query.days as string) || 30;

    if (isNaN(userId)) {
      throw createError('Invalid user ID', 400);
    }

    try {
      const activity = await auditLogger.getUserActivitySummary(userId, days);

      res.json({
        success: true,
        data: {
          userId,
          activity,
          period: `${days} days`
        }
      });

    } catch (error) {
      logger.error('Failed to fetch user activity:', error);
      throw error;
    }
  });

  /**
   * Get locked accounts
   * GET /api/admin/security/locked-accounts
   */
  getLockedAccounts = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user?.isAdmin) {
      throw createError('Administrator access required', 403);
    }

    try {
      // Query database for currently locked accounts
      const { db } = await import('@/config/database');
      const result = await db.query(
        `SELECT DISTINCT ON (username) 
          username, ip_address, lockout_reason, failed_attempts, 
          lockout_duration_minutes, locked_at, expires_at
        FROM account_lockouts
        WHERE expires_at > CURRENT_TIMESTAMP 
          AND unlocked_at IS NULL
        ORDER BY username, locked_at DESC`
      );

      res.json({
        success: true,
        data: {
          lockedAccounts: result.rows,
          total: result.rows.length
        }
      });

    } catch (error) {
      logger.error('Failed to fetch locked accounts:', error);
      throw error;
    }
  });

  /**
   * Get lockout history for a user
   * GET /api/admin/security/lockout-history/:username
   */
  getLockoutHistory = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user?.isAdmin) {
      throw createError('Administrator access required', 403);
    }

    const { username } = req.params;
    const limit = parseInt(req.query.limit as string) || 10;

    try {
      const history = await failedLoginTracker.getLockoutHistory(username, limit);

      res.json({
        success: true,
        data: {
          username,
          history,
          total: history.length
        }
      });

    } catch (error) {
      logger.error('Failed to fetch lockout history:', error);
      throw error;
    }
  });

  /**
   * Unlock an account
   * POST /api/admin/security/unlock-account
   */
  unlockAccount = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user?.isAdmin) {
      throw createError('Administrator access required', 403);
    }

    const { username, reason } = req.body;

    if (!username) {
      throw createError('Username is required', 400);
    }

    try {
      await failedLoginTracker.unlockAccount(
        username, 
        req.user.id, 
        reason || 'Unlocked by administrator'
      );

      // Log admin action
      await auditLogger.logAdmin('user_updated',
        { request: req, user: req.user },
        'account_lockout',
        username,
        { action: 'unlock_account', reason }
      );

      logger.info(`Account unlocked by admin: ${username} (admin: ${req.user.username})`);

      res.json({
        success: true,
        message: `Account ${username} has been unlocked`
      });

    } catch (error) {
      logger.error('Failed to unlock account:', error);
      throw error;
    }
  });

  /**
   * Get failed login attempts
   * GET /api/admin/security/failed-logins
   */
  getFailedLogins = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user?.isAdmin) {
      throw createError('Administrator access required', 403);
    }

    const {
      username,
      ipAddress,
      startDate,
      endDate,
      limit = 100,
      offset = 0
    } = req.query;

    try {
      const { db } = await import('@/config/database');
      let query = 'SELECT * FROM failed_login_attempts WHERE 1=1';
      const params: any[] = [];
      let paramIndex = 1;

      if (username) {
        query += ` AND username = $${paramIndex++}`;
        params.push(username);
      }
      if (ipAddress) {
        query += ` AND ip_address = $${paramIndex++}`;
        params.push(ipAddress);
      }
      if (startDate) {
        query += ` AND attempt_time >= $${paramIndex++}`;
        params.push(new Date(startDate as string));
      }
      if (endDate) {
        query += ` AND attempt_time <= $${paramIndex++}`;
        params.push(new Date(endDate as string));
      }

      // Get total count
      const countResult = await db.query(
        query.replace('SELECT *', 'SELECT COUNT(*)'),
        params
      );
      const total = parseInt(countResult.rows[0].count);

      // Get paginated results
      query += ` ORDER BY attempt_time DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
      params.push(parseInt(limit as string), parseInt(offset as string));

      const result = await db.query(query, params);

      res.json({
        success: true,
        data: {
          attempts: result.rows,
          total,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string)
        }
      });

    } catch (error) {
      logger.error('Failed to fetch failed login attempts:', error);
      throw error;
    }
  });
}

// Validation rules
export const auditLogQueryValidation = [
  query('eventType')
    .optional()
    .isIn(['auth', 'access', 'admin', 'security', 'data', 'system'])
    .withMessage('Invalid event type'),
  query('userId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Invalid user ID'),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid start date'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid end date'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Limit must be between 1 and 1000'),
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset must be non-negative')
];

// Export controller instance
export const securityController = new SecurityController();