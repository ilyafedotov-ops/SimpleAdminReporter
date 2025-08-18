import { Router } from 'express';
import { 
  scheduledReportsController, 
  createScheduleValidation, 
  updateScheduleValidation 
} from '@/controllers/scheduled-reports.controller';
// Use the auth wrapper to automatically select the correct authentication middleware
import { 
  requireAuth, 
  auditAction, 
  userRateLimit 
} from '@/middleware/auth-wrapper';
import { param, query } from 'express-validator';

const router = Router();

/**
 * Scheduled Reports Routes
 * Base path: /api/scheduled-reports
 */

/**
 * @route   GET /api/scheduled-reports
 * @desc    Get all scheduled reports for the current user
 * @access  Private
 * @query   isActive?: boolean, page?: number, pageSize?: number
 */
router.get('/',
  requireAuth,
  query('isActive').optional().isBoolean().withMessage('isActive must be boolean'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be >= 1'),
  query('pageSize').optional().isInt({ min: 1, max: 100 }).withMessage('Page size must be 1-100'),
  scheduledReportsController.getSchedules
);

/**
 * @route   GET /api/scheduled-reports/:scheduleId
 * @desc    Get a specific scheduled report
 * @access  Private (Owner only)
 * @param   scheduleId - Schedule UUID
 */
router.get('/:scheduleId',
  requireAuth,
  param('scheduleId').isUUID().withMessage('Invalid schedule ID'),
  scheduledReportsController.getSchedule
);

/**
 * @route   POST /api/scheduled-reports
 * @desc    Create a new scheduled report
 * @access  Private
 * @body    { name, description?, templateId?, customTemplateId?, parameters?, scheduleConfig, recipients?, exportFormat? }
 */
router.post('/',
  requireAuth,
  userRateLimit(10), // 10 schedules per minute
  createScheduleValidation,
  auditAction('create_scheduled_report', 'scheduled_report'),
  scheduledReportsController.createSchedule
);

/**
 * @route   PUT /api/scheduled-reports/:scheduleId
 * @desc    Update a scheduled report
 * @access  Private (Owner only)
 * @param   scheduleId - Schedule UUID
 * @body    { name?, description?, parameters?, scheduleConfig?, recipients?, exportFormat?, isActive? }
 */
router.put('/:scheduleId',
  requireAuth,
  updateScheduleValidation,
  auditAction('update_scheduled_report', 'scheduled_report'),
  scheduledReportsController.updateSchedule
);

/**
 * @route   DELETE /api/scheduled-reports/:scheduleId
 * @desc    Delete a scheduled report
 * @access  Private (Owner only)
 * @param   scheduleId - Schedule UUID
 */
router.delete('/:scheduleId',
  requireAuth,
  param('scheduleId').isUUID().withMessage('Invalid schedule ID'),
  auditAction('delete_scheduled_report', 'scheduled_report'),
  scheduledReportsController.deleteSchedule
);

/**
 * @route   POST /api/scheduled-reports/:scheduleId/toggle
 * @desc    Toggle a scheduled report's active state
 * @access  Private (Owner only)
 * @param   scheduleId - Schedule UUID
 */
router.post('/:scheduleId/toggle',
  requireAuth,
  param('scheduleId').isUUID().withMessage('Invalid schedule ID'),
  auditAction('toggle_scheduled_report', 'scheduled_report'),
  scheduledReportsController.toggleSchedule
);

/**
 * @route   GET /api/scheduled-reports/:scheduleId/history
 * @desc    Get execution history for a scheduled report
 * @access  Private (Owner only)
 * @param   scheduleId - Schedule UUID
 * @query   page?: number, pageSize?: number
 */
router.get('/:scheduleId/history',
  requireAuth,
  param('scheduleId').isUUID().withMessage('Invalid schedule ID'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be >= 1'),
  query('pageSize').optional().isInt({ min: 1, max: 100 }).withMessage('Page size must be 1-100'),
  scheduledReportsController.getScheduleHistory
);

export default router;