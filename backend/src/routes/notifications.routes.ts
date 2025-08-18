import { Router, Request, Response } from 'express';
import { body, query, param, validationResult } from 'express-validator';
import { requireAuth } from '@/middleware/auth-wrapper';
import { notificationService } from '@/services/notification.service';
import { logger } from '@/utils/logger';
import { 
  NotificationFilters,
  CreateNotificationRequest,
  UpdateNotificationRequest,
  BulkNotificationOperation,
  NotificationType
} from '@/types/shared-types';

// Validation rules
const getNotificationsValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('pageSize').optional().isInt({ min: 1, max: 100 }).withMessage('Page size must be between 1 and 100'),
  query('types').optional().isString().withMessage('Types must be a comma-separated string'),
  query('categories').optional().isString().withMessage('Categories must be a comma-separated string'),
  query('isRead').optional().isBoolean().withMessage('isRead must be a boolean'),
  query('isDismissed').optional().isBoolean().withMessage('isDismissed must be a boolean'),
  query('priority').optional().isString().withMessage('Priority must be a comma-separated string'),
  query('dateFrom').optional().isISO8601().withMessage('dateFrom must be a valid ISO date'),
  query('dateTo').optional().isISO8601().withMessage('dateTo must be a valid ISO date')
];

const createNotificationValidation = [
  body('userId').isInt({ min: 1 }).withMessage('User ID must be a positive integer'),
  body('type').isIn(['info', 'success', 'warning', 'error', 'report_complete', 'report_failed', 'system', 'reminder'])
    .withMessage('Type must be a valid notification type'),
  body('title').isLength({ min: 1, max: 255 }).withMessage('Title must be between 1 and 255 characters'),
  body('message').isLength({ min: 1 }).withMessage('Message is required'),
  body('priority').optional().isInt({ min: 1, max: 5 }).withMessage('Priority must be between 1 and 5'),
  body('category').optional().isLength({ max: 100 }).withMessage('Category must be less than 100 characters'),
  body('expiresAt').optional().isISO8601().withMessage('expiresAt must be a valid ISO date'),
  body('source').optional().isLength({ max: 100 }).withMessage('Source must be less than 100 characters')
];

const updateNotificationValidation = [
  param('id').isUUID().withMessage('Notification ID must be a valid UUID'),
  body('isRead').optional().isBoolean().withMessage('isRead must be a boolean'),
  body('isDismissed').optional().isBoolean().withMessage('isDismissed must be a boolean')
];

const deleteNotificationValidation = [
  param('id').isUUID().withMessage('Notification ID must be a valid UUID')
];

const bulkNotificationValidation = [
  body('notificationIds').isArray({ min: 1 }).withMessage('notificationIds must be a non-empty array'),
  body('notificationIds.*').isUUID().withMessage('All notification IDs must be valid UUIDs'),
  body('operation').isIn(['mark_read', 'mark_unread', 'dismiss', 'delete'])
    .withMessage('Operation must be one of: mark_read, mark_unread, dismiss, delete')
];

const systemNotificationValidation = [
  body('title').isLength({ min: 1, max: 255 }).withMessage('Title must be between 1 and 255 characters'),
  body('message').isLength({ min: 1 }).withMessage('Message is required'),
  body('type').optional().isIn(['info', 'warning', 'error']).withMessage('Type must be info, warning, or error'),
  body('priority').optional().isInt({ min: 1, max: 5 }).withMessage('Priority must be between 1 and 5'),
  body('expiresAt').optional().isISO8601().withMessage('expiresAt must be a valid ISO date')
];

const router = Router();

// Apply authentication to all routes
router.use(requireAuth);

/**
 * @route GET /api/notifications
 * @desc Get user notifications with pagination and filtering
 */
router.get('/', getNotificationsValidation, async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const userId = req.user!.id;
      const {
        page = 1,
        pageSize = 20,
        types,
        categories,
        isRead,
        isDismissed,
        priority,
        dateFrom,
        dateTo
      } = req.query;

      // Parse filters
      const filters: NotificationFilters = {};
      
      if (types) {
        filters.types = (types as string).split(',') as NotificationType[];
      }
      
      if (categories) {
        filters.categories = (categories as string).split(',');
      }
      
      if (isRead !== undefined) {
        filters.isRead = isRead === 'true';
      }
      
      if (isDismissed !== undefined) {
        filters.isDismissed = isDismissed === 'true';
      }
      
      if (priority) {
        filters.priority = (priority as string).split(',').map(p => parseInt(p)) as (1 | 2 | 3 | 4 | 5)[];
      }
      
      if (dateFrom) {
        filters.dateFrom = new Date(dateFrom as string);
      }
      
      if (dateTo) {
        filters.dateTo = new Date(dateTo as string);
      }

      const result = await notificationService.getUserNotifications(
        userId,
        filters,
        { page: parseInt(page as string), pageSize: parseInt(pageSize as string) }
      );

      if (!result.success) {
        return res.status(500).json({
          error: result.error?.message || 'Failed to fetch notifications',
          code: result.error?.code
        });
      }

      res.json(((result as any)?.data));
    } catch (error) {
      logger.error('Error fetching notifications:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to fetch notifications'
      });
    }
  }
);

/**
 * @route GET /api/notifications/stats
 * @desc Get notification statistics for the user
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    
    const result = await notificationService.getUserNotificationStats(userId);

    if (!result.success) {
      return res.status(500).json({
        error: result.error?.message || 'Failed to fetch notification stats',
        code: result.error?.code
      });
    }

    res.json(((result as any)?.data));
  } catch (error) {
    logger.error('Error fetching notification stats:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch notification statistics'
    });
  }
});

/**
 * @route GET /api/notifications/:id
 * @desc Get a specific notification by ID
 */
router.get('/:id',
  [
    param('id').isUUID().withMessage('Notification ID must be a valid UUID')
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const userId = req.user!.id;
      const notificationId = req.params.id;

      const result = await notificationService.getNotificationById(notificationId, userId);

      if (!result.success) {
        if (result.error?.code === 'NOTIFICATION_NOT_FOUND') {
          return res.status(404).json({
            error: 'Notification not found'
          });
        }
        
        return res.status(500).json({
          error: result.error?.message || 'Failed to fetch notification',
          code: result.error?.code
        });
      }

      res.json(((result as any)?.data));
    } catch (error) {
      logger.error('Error fetching notification:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to fetch notification'
      });
    }
  }
);

/**
 * @route POST /api/notifications
 * @desc Create a new notification (admin only or system)
 */
router.post('/', createNotificationValidation, async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
      }

      // Only allow admins or system to create notifications for other users
      const requestingUserId = req.user!.id;
      const targetUserId = req.body.userId;
      
      if (targetUserId !== requestingUserId && !req.user!.isAdmin) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'You can only create notifications for yourself'
        });
      }

      const createRequest: CreateNotificationRequest = {
        userId: targetUserId,
        type: req.body.type,
        title: req.body.title,
        message: req.body.message,
        data: req.body.data,
        priority: req.body.priority,
        category: req.body.category,
        expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : undefined,
        source: req.body.source
      };

      const result = await notificationService.createNotification(createRequest);

      if (!result.success) {
        return res.status(500).json({
          error: result.error?.message || 'Failed to create notification',
          code: result.error?.code
        });
      }

      res.status(201).json(((result as any)?.data));
    } catch (error) {
      logger.error('Error creating notification:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to create notification'
      });
    }
  }
);

/**
 * @route PUT /api/notifications/:id
 * @desc Update a notification (mark as read/dismissed)
 */
router.put('/:id', updateNotificationValidation, async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const userId = req.user!.id;
      const notificationId = req.params.id;
      
      const updates: UpdateNotificationRequest = {};
      if (req.body.isRead !== undefined) {
        updates.isRead = req.body.isRead;
      }
      if (req.body.isDismissed !== undefined) {
        updates.isDismissed = req.body.isDismissed;
      }

      const result = await notificationService.updateNotification(notificationId, userId, updates);

      if (!result.success) {
        if (result.error?.code === 'NOTIFICATION_NOT_FOUND') {
          return res.status(404).json({
            error: 'Notification not found'
          });
        }
        
        return res.status(500).json({
          error: result.error?.message || 'Failed to update notification',
          code: result.error?.code
        });
      }

      res.json(((result as any)?.data));
    } catch (error) {
      logger.error('Error updating notification:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to update notification'
      });
    }
  }
);

/**
 * @route DELETE /api/notifications/:id
 * @desc Delete a notification
 */
router.delete('/:id', deleteNotificationValidation, async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const userId = req.user!.id;
      const notificationId = req.params.id;

      const result = await notificationService.deleteNotification(notificationId, userId);

      if (!result.success) {
        if (result.error?.code === 'NOTIFICATION_NOT_FOUND') {
          return res.status(404).json({
            error: 'Notification not found'
          });
        }
        
        return res.status(500).json({
          error: result.error?.message || 'Failed to delete notification',
          code: result.error?.code
        });
      }

      res.status(204).send();
    } catch (error) {
      logger.error('Error deleting notification:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to delete notification'
      });
    }
  }
);

/**
 * @route POST /api/notifications/bulk
 * @desc Perform bulk operations on notifications
 */
router.post('/bulk', bulkNotificationValidation, async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const userId = req.user!.id;
      const bulkOperation: BulkNotificationOperation = {
        notificationIds: req.body.notificationIds,
        operation: req.body.operation
      };

      const result = await notificationService.bulkUpdateNotifications(userId, bulkOperation);

      if (!result.success) {
        return res.status(500).json({
          error: result.error?.message || 'Failed to perform bulk operation',
          code: result.error?.code
        });
      }

      res.json(((result as any)?.data));
    } catch (error) {
      logger.error('Error performing bulk notification operation:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to perform bulk operation'
      });
    }
  }
);

/**
 * @route POST /api/notifications/system
 * @desc Create system-wide notification (admin only)
 */
router.post('/system', systemNotificationValidation, async (req: Request, res: Response) => {
    try {
      // Check if user is admin
      if (!req.user!.isAdmin) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Only administrators can create system notifications'
        });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const result = await notificationService.createSystemNotification(
        req.body.title,
        req.body.message,
        req.body.type || 'info',
        req.body.priority || 2,
        req.body.expiresAt ? new Date(req.body.expiresAt) : undefined
      );

      if (!result.success) {
        return res.status(500).json({
          error: result.error?.message || 'Failed to create system notification',
          code: result.error?.code
        });
      }

      res.status(201).json({
        message: 'System notification created successfully',
        usersNotified: ((result as any)?.data)
      });
    } catch (error) {
      logger.error('Error creating system notification:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to create system notification'
      });
    }
  }
);

/**
 * @route POST /api/notifications/cleanup
 * @desc Clean up expired notifications (admin only)
 */
router.post('/cleanup', async (req: Request, res: Response) => {
  try {
    // Check if user is admin
    if (!req.user!.isAdmin) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only administrators can trigger cleanup'
      });
    }

    const result = await notificationService.cleanupExpiredNotifications();

    if (!result.success) {
      return res.status(500).json({
        error: result.error?.message || 'Failed to cleanup notifications',
        code: result.error?.code
      });
    }

    res.json({
      message: 'Cleanup completed successfully',
      deletedCount: ((result as any)?.data)
    });
  } catch (error) {
    logger.error('Error cleaning up notifications:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to cleanup notifications'
    });
  }
});

export default router;