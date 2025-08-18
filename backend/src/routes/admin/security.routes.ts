import { Router } from 'express';
import { securityController, auditLogQueryValidation } from '@/controllers/admin/security.controller';
import { requireAdmin, auditAction } from '@/middleware/auth-wrapper';
import { adminRateLimiter } from '@/middleware/rate-limit.middleware';

const router = Router();

/**
 * Security Administration Routes
 * Base path: /api/admin/security
 * All routes require admin authentication
 */

// Apply admin rate limiter to all routes
router.use(adminRateLimiter);

/**
 * @route   GET /api/admin/security/audit-logs
 * @desc    Get audit logs with filtering
 * @access  Private (Admin)
 * @query   eventType, eventAction, userId, username, startDate, endDate, success, limit, offset
 */
router.get('/audit-logs',
  requireAdmin,
  auditLogQueryValidation,
  auditAction('view_audit_logs', 'security_admin'),
  securityController.getAuditLogs
);

/**
 * @route   GET /api/admin/security/events-summary
 * @desc    Get security events summary
 * @access  Private (Admin)
 * @query   hours (default: 24)
 */
router.get('/events-summary',
  requireAdmin,
  auditAction('view_security_summary', 'security_admin'),
  securityController.getSecurityEventsSummary
);

/**
 * @route   GET /api/admin/security/user-activity/:userId
 * @desc    Get activity summary for a specific user
 * @access  Private (Admin)
 * @query   days (default: 30)
 */
router.get('/user-activity/:userId',
  requireAdmin,
  auditAction('view_user_activity', 'security_admin'),
  securityController.getUserActivity
);

/**
 * @route   GET /api/admin/security/locked-accounts
 * @desc    Get list of currently locked accounts
 * @access  Private (Admin)
 */
router.get('/locked-accounts',
  requireAdmin,
  auditAction('view_locked_accounts', 'security_admin'),
  securityController.getLockedAccounts
);

/**
 * @route   GET /api/admin/security/lockout-history/:username
 * @desc    Get lockout history for a specific user
 * @access  Private (Admin)
 * @query   limit (default: 10)
 */
router.get('/lockout-history/:username',
  requireAdmin,
  auditAction('view_lockout_history', 'security_admin'),
  securityController.getLockoutHistory
);

/**
 * @route   POST /api/admin/security/unlock-account
 * @desc    Manually unlock a locked account
 * @access  Private (Admin)
 * @body    { username: string, reason?: string }
 */
router.post('/unlock-account',
  requireAdmin,
  auditAction('unlock_account', 'security_admin'),
  securityController.unlockAccount
);

/**
 * @route   GET /api/admin/security/failed-logins
 * @desc    Get failed login attempts with filtering
 * @access  Private (Admin)
 * @query   username, ipAddress, startDate, endDate, limit, offset
 */
router.get('/failed-logins',
  requireAdmin,
  auditAction('view_failed_logins', 'security_admin'),
  securityController.getFailedLogins
);

export default router;