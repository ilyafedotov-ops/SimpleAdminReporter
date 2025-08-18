import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { requireAuth } from '@/middleware/auth-wrapper';
import { userPreferencesService } from '@/services/user-preferences.service';
import { logger } from '@/utils/logger';

// Validation rules
const updateUserPreferencesValidation = [
  body('defaultExportFormat').optional().isIn(['excel', 'csv', 'pdf', 'json'])
    .withMessage('Invalid export format'),
  body('theme').optional().isIn(['light', 'dark', 'system'])
    .withMessage('Invalid theme'),
  body('pageSize').optional().isInt({ min: 10, max: 1000 })
    .withMessage('Page size must be between 10 and 1000'),
  body('timezone').optional().isString().isLength({ min: 1, max: 100 })
    .withMessage('Invalid timezone'),
  body('dateFormat').optional().isIn(['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'])
    .withMessage('Invalid date format'),
  body('timeFormat').optional().isIn(['12h', '24h'])
    .withMessage('Invalid time format'),
  body('emailNotifications').optional().isBoolean()
    .withMessage('Email notifications must be a boolean'),
  body('notificationPreferences').optional().isObject()
    .withMessage('Notification preferences must be an object'),
  body('notificationPreferences.reportCompletion').optional().isBoolean()
    .withMessage('Report completion notification must be a boolean'),
  body('notificationPreferences.scheduledReports').optional().isBoolean()
    .withMessage('Scheduled reports notification must be a boolean'),
  body('notificationPreferences.systemAlerts').optional().isBoolean()
    .withMessage('System alerts notification must be a boolean'),
  body('notificationPreferences.weeklyDigest').optional().isBoolean()
    .withMessage('Weekly digest notification must be a boolean'),
  body('notificationPreferences.notificationTime').optional().matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .withMessage('Notification time must be in HH:MM format')
];

const updateNotificationPreferencesValidation = [
  body('emailNotifications').optional().isBoolean()
    .withMessage('Email notifications must be a boolean'),
  body('reportCompletion').optional().isBoolean()
    .withMessage('Report completion notification must be a boolean'),
  body('scheduledReports').optional().isBoolean()
    .withMessage('Scheduled reports notification must be a boolean'),
  body('systemAlerts').optional().isBoolean()
    .withMessage('System alerts notification must be a boolean'),
  body('weeklyDigest').optional().isBoolean()
    .withMessage('Weekly digest notification must be a boolean'),
  body('notificationTime').optional().matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .withMessage('Notification time must be in HH:MM format')
];

const router = Router();

// Apply authentication to all routes
router.use(requireAuth);

/**
 * @route GET /api/user/preferences
 * @desc Get current user's preferences
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    
    const result = await userPreferencesService.getUserPreferences(userId);

    if (!result.success) {
      return res.status(500).json({
        error: result.error?.message || 'Failed to fetch user preferences',
        code: result.error?.code
      });
    }

    res.json(((result as any)?.data));
  } catch (error) {
    logger.error('Error fetching user preferences:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch user preferences'
    });
  }
});

/**
 * @route PUT /api/user/preferences
 * @desc Update current user's preferences
 */
router.put('/', updateUserPreferencesValidation, async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const userId = req.user!.id;
      const updates = req.body;

      const result = await userPreferencesService.updateUserPreferences(userId, updates);

      if (!result.success) {
        return res.status(500).json({
          error: result.error?.message || 'Failed to update user preferences',
          code: result.error?.code
        });
      }

      res.json(((result as any)?.data));
    } catch (error) {
      logger.error('Error updating user preferences:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to update user preferences'
      });
    }
  }
);

/**
 * @route PUT /api/user/preferences/notifications
 * @desc Update notification preferences only
 */
router.put('/notifications', updateNotificationPreferencesValidation, async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const userId = req.user!.id;
      const notificationPreferences = req.body;

      // Wrap in notificationPreferences object
      const updates = {
        emailNotifications: notificationPreferences.emailNotifications,
        notificationPreferences: {
          reportCompletion: notificationPreferences.reportCompletion,
          scheduledReports: notificationPreferences.scheduledReports,
          systemAlerts: notificationPreferences.systemAlerts,
          weeklyDigest: notificationPreferences.weeklyDigest,
          notificationTime: notificationPreferences.notificationTime
        }
      };

      const result = await userPreferencesService.updateUserPreferences(userId, updates);

      if (!result.success) {
        return res.status(500).json({
          error: result.error?.message || 'Failed to update notification preferences',
          code: result.error?.code
        });
      }

      res.json(((result as any)?.data));
    } catch (error) {
      logger.error('Error updating notification preferences:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to update notification preferences'
      });
    }
  }
);

export default router;