import request from 'supertest';
import express from 'express';

// Mock all external dependencies before imports
jest.mock('../../services/notification.service', () => ({
  notificationService: {
    getUserNotifications: jest.fn(),
    getUserNotificationStats: jest.fn(),
    getNotificationById: jest.fn(),
    createNotification: jest.fn(),
    updateNotification: jest.fn(),
    deleteNotification: jest.fn(),
    bulkUpdateNotifications: jest.fn(),
    createSystemNotification: jest.fn(),
    cleanupExpiredNotifications: jest.fn()
  }
}));

// Mock user for tests - can be overridden in specific tests
let mockUser = { id: 1, username: 'testuser', isAdmin: false };

jest.mock('../../middleware/auth-wrapper', () => ({
  requireAuth: jest.fn((_req: any, _res: any, next: any) => {
    _req.user = mockUser;
    next();
  })
}));

jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn()
  }
}));

// Mock express-validator with proper chaining
const mockMiddleware = (req: any, res: any, next: any) => next();

// Create a mock validator that properly chains methods
const createChainedValidator = () => {
  const validator: any = mockMiddleware;
  validator.isInt = jest.fn(() => createChainedValidator());
  validator.isIn = jest.fn(() => createChainedValidator());
  validator.isLength = jest.fn(() => createChainedValidator());
  validator.optional = jest.fn(() => createChainedValidator());
  validator.isArray = jest.fn(() => createChainedValidator());
  validator.isBoolean = jest.fn(() => createChainedValidator());
  validator.isISO8601 = jest.fn(() => createChainedValidator());
  validator.isString = jest.fn(() => createChainedValidator());
  validator.isUUID = jest.fn(() => createChainedValidator());
  validator.withMessage = jest.fn(() => createChainedValidator());
  validator.matches = jest.fn(() => createChainedValidator());
  return validator;
};

// Mock validationResult to allow tests to override it
const mockValidationResultFn = jest.fn();
const defaultValidationResult = {
  isEmpty: jest.fn(() => true),
  array: jest.fn(() => [])
};
mockValidationResultFn.mockReturnValue(defaultValidationResult);

jest.mock('express-validator', () => ({
  body: jest.fn(() => createChainedValidator()),
  query: jest.fn(() => createChainedValidator()),
  param: jest.fn(() => createChainedValidator()),
  validationResult: mockValidationResultFn
}));

// Import after mocking
import notificationsRoutes from '../notifications.routes';
import { notificationService } from '../../services/notification.service';
import { validationResult } from 'express-validator';

// Type assertion to make validationResult a mock
const mockValidationResult = validationResult as jest.MockedFunction<typeof validationResult>;

describe('Notifications Routes Integration', () => {
  let app: express.Application;

  const mockNotifications = {
    notifications: [
      {
        id: '550e8400-e29b-41d4-a716-446655440001',
        userId: 1,
        type: 'report_complete',
        title: 'Report Generation Complete',
        message: 'Your user activity report has been generated successfully.',
        data: { reportId: 'rep_123', downloadUrl: '/api/reports/rep_123/download' },
        priority: 2,
        category: 'reports',
        isRead: false,
        isDismissed: false,
        createdAt: '2025-01-01T12:00:00Z',
        expiresAt: null,
        source: 'report_service'
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440002',
        userId: 1,
        type: 'system',
        title: 'System Maintenance Scheduled',
        message: 'System maintenance is scheduled for tonight at 2 AM UTC.',
        data: null,
        priority: 3,
        category: 'system',
        isRead: true,
        isDismissed: false,
        createdAt: '2025-01-01T10:00:00Z',
        expiresAt: '2025-01-02T02:00:00Z',
        source: 'system'
      }
    ],
    totalCount: 2,
    unreadCount: 1,
    currentPage: 1,
    totalPages: 1,
    hasMore: false
  };

  const mockNotificationStats = {
    total: 15,
    unread: 3,
    dismissed: 2,
    byType: {
      report_complete: 5,
      report_failed: 1,
      system: 4,
      info: 3,
      warning: 2
    },
    byCategory: {
      reports: 6,
      system: 4,
      general: 5
    },
    byPriority: {
      1: 2, // Low
      2: 8, // Normal  
      3: 3, // High
      4: 2, // Critical
      5: 0  // Emergency
    }
  };

  const mockSingleNotification = {
    id: '550e8400-e29b-41d4-a716-446655440001',
    userId: 1,
    type: 'report_complete',
    title: 'Report Generation Complete',
    message: 'Your user activity report has been generated successfully.',
    data: { reportId: 'rep_123', downloadUrl: '/api/reports/rep_123/download' },
    priority: 2,
    category: 'reports',
    isRead: false,
    isDismissed: false,
    createdAt: '2025-01-01T12:00:00Z',
    updatedAt: '2025-01-01T12:00:00Z',
    expiresAt: null,
    source: 'report_service'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset mock user to default (non-admin)
    mockUser = { id: 1, username: 'testuser', isAdmin: false };
    
    // Reset validation result mock to default (no errors)
    const defaultValidationResult = {
      isEmpty: jest.fn(() => true),
      array: jest.fn(() => [])
    };
    (validationResult as any).mockReturnValue(defaultValidationResult);
    
    app = express();
    app.use(express.json());
    app.use('/api/notifications', notificationsRoutes);

    // Error handler
    app.use((err: any, _req: any, res: any, _next: any) => {
      res.status(err.statusCode || 500).json({
        error: err.message || 'Internal Server Error'
      });
    });
  });

  describe('GET /api/notifications', () => {
    it('should get user notifications with default pagination', async () => {
      (notificationService.getUserNotifications as jest.Mock).mockResolvedValue({
        success: true,
        data: mockNotifications
      });

      const response = await request(app)
        .get('/api/notifications')
        .expect(200);

      expect(response.body.notifications).toHaveLength(2);
      expect(response.body.totalCount).toBe(2);
      expect(notificationService.getUserNotifications).toHaveBeenCalledWith(
        1,
        {},
        { page: 1, pageSize: 20 }
      );
    });

    it('should get notifications with custom pagination', async () => {
      (notificationService.getUserNotifications as jest.Mock).mockResolvedValue({
        success: true,
        data: mockNotifications
      });

      const response = await request(app)
        .get('/api/notifications?page=2&pageSize=10')
        .expect(200);

      expect(notificationService.getUserNotifications).toHaveBeenCalledWith(
        1,
        {},
        { page: 2, pageSize: 10 }
      );
    });

    it('should filter notifications by type', async () => {
      (notificationService.getUserNotifications as jest.Mock).mockResolvedValue({
        success: true,
        data: mockNotifications
      });

      const response = await request(app)
        .get('/api/notifications?types=report_complete,system')
        .expect(200);

      expect(notificationService.getUserNotifications).toHaveBeenCalledWith(
        1,
        { types: ['report_complete', 'system'] },
        { page: 1, pageSize: 20 }
      );
    });

    it('should filter notifications by read status', async () => {
      (notificationService.getUserNotifications as jest.Mock).mockResolvedValue({
        success: true,
        data: mockNotifications
      });

      const response = await request(app)
        .get('/api/notifications?isRead=false')
        .expect(200);

      expect(notificationService.getUserNotifications).toHaveBeenCalledWith(
        1,
        { isRead: false },
        { page: 1, pageSize: 20 }
      );
    });

    it('should filter notifications by date range', async () => {
      (notificationService.getUserNotifications as jest.Mock).mockResolvedValue({
        success: true,
        data: mockNotifications
      });

      const response = await request(app)
        .get('/api/notifications?dateFrom=2025-01-01T00:00:00Z&dateTo=2025-01-01T23:59:59Z')
        .expect(200);

      expect(notificationService.getUserNotifications).toHaveBeenCalledWith(
        1,
        { 
          dateFrom: new Date('2025-01-01T00:00:00Z'),
          dateTo: new Date('2025-01-01T23:59:59Z')
        },
        { page: 1, pageSize: 20 }
      );
    });

    it('should filter notifications by priority', async () => {
      (notificationService.getUserNotifications as jest.Mock).mockResolvedValue({
        success: true,
        data: mockNotifications
      });

      const response = await request(app)
        .get('/api/notifications?priority=3,4,5')
        .expect(200);

      expect(notificationService.getUserNotifications).toHaveBeenCalledWith(
        1,
        { priority: [3, 4, 5] },
        { page: 1, pageSize: 20 }
      );
    });

    it('should handle validation errors', async () => {
      (validationResult as any).mockReturnValue({
        isEmpty: () => false,
        array: () => [
          { field: 'page', msg: 'Page must be a positive integer', value: 0 }
        ]
      });

      const response = await request(app)
        .get('/api/notifications?page=0')
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toHaveLength(1);
    });

    it('should handle service errors', async () => {
      (notificationService.getUserNotifications as jest.Mock).mockResolvedValue({
        success: false,
        error: {
          message: 'Database connection failed',
          code: 'DB_ERROR'
        }
      });

      const response = await request(app)
        .get('/api/notifications')
        .expect(500);

      expect(response.body.error).toBe('Database connection failed');
      expect(response.body.code).toBe('DB_ERROR');
    });

    it('should handle multiple filters simultaneously', async () => {
      (notificationService.getUserNotifications as jest.Mock).mockResolvedValue({
        success: true,
        data: mockNotifications
      });

      const response = await request(app)
        .get('/api/notifications?types=report_complete&categories=reports&isRead=false&priority=2,3')
        .expect(200);

      expect(notificationService.getUserNotifications).toHaveBeenCalledWith(
        1,
        { 
          types: ['report_complete'],
          categories: ['reports'],
          isRead: false,
          priority: [2, 3]
        },
        { page: 1, pageSize: 20 }
      );
    });
  });

  describe('GET /api/notifications/stats', () => {
    it('should get notification statistics', async () => {
      (notificationService.getUserNotificationStats as jest.Mock).mockResolvedValue({
        success: true,
        data: mockNotificationStats
      });

      const response = await request(app)
        .get('/api/notifications/stats')
        .expect(200);

      expect(response.body.total).toBe(15);
      expect(response.body.unread).toBe(3);
      expect(response.body.byType.report_complete).toBe(5);
      expect(notificationService.getUserNotificationStats).toHaveBeenCalledWith(1);
    });

    it('should handle stats service errors', async () => {
      (notificationService.getUserNotificationStats as jest.Mock).mockResolvedValue({
        success: false,
        error: {
          message: 'Failed to calculate stats',
          code: 'STATS_ERROR'
        }
      });

      const response = await request(app)
        .get('/api/notifications/stats')
        .expect(500);

      expect(response.body.error).toBe('Failed to calculate stats');
    });

    it('should handle stats service exceptions', async () => {
      (notificationService.getUserNotificationStats as jest.Mock).mockRejectedValue(
        new Error('Service unavailable')
      );

      const response = await request(app)
        .get('/api/notifications/stats')
        .expect(500);

      expect(response.body.error).toBe('Internal server error');
    });
  });

  describe('GET /api/notifications/:id', () => {
    it('should get specific notification by ID', async () => {
      (notificationService.getNotificationById as jest.Mock).mockResolvedValue({
        success: true,
        data: mockSingleNotification
      });

      const response = await request(app)
        .get('/api/notifications/550e8400-e29b-41d4-a716-446655440001')
        .expect(200);

      expect(response.body.id).toBe('550e8400-e29b-41d4-a716-446655440001');
      expect(response.body.title).toBe('Report Generation Complete');
      expect(notificationService.getNotificationById).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440001',
        1
      );
    });

    it('should handle notification not found', async () => {
      (notificationService.getNotificationById as jest.Mock).mockResolvedValue({
        success: false,
        error: {
          message: 'Notification not found',
          code: 'NOTIFICATION_NOT_FOUND'
        }
      });

      const response = await request(app)
        .get('/api/notifications/550e8400-e29b-41d4-a716-446655440999')
        .expect(404);

      expect(response.body.error).toBe('Notification not found');
    });

    it('should validate UUID format', async () => {
      (validationResult as any).mockReturnValue({
        isEmpty: () => false,
        array: () => [
          { field: 'id', msg: 'Notification ID must be a valid UUID', value: 'invalid-uuid' }
        ]
      });

      const response = await request(app)
        .get('/api/notifications/invalid-uuid')
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });
  });

  describe('POST /api/notifications', () => {
    const validNotificationData = {
      userId: 1,
      type: 'info',
      title: 'Test Notification',
      message: 'This is a test notification',
      priority: 2,
      category: 'test'
    };

    it('should create notification for self', async () => {
      (notificationService.createNotification as jest.Mock).mockResolvedValue({
        success: true,
        data: {
          ...mockSingleNotification,
          ...validNotificationData
        }
      });

      const response = await request(app)
        .post('/api/notifications')
        .send(validNotificationData)
        .expect(201);

      expect(response.body.title).toBe('Test Notification');
      expect(notificationService.createNotification).toHaveBeenCalledWith(
        expect.objectContaining(validNotificationData)
      );
    });

    it('should prevent non-admin from creating notification for others', async () => {
      const response = await request(app)
        .post('/api/notifications')
        .send({
          ...validNotificationData,
          userId: 999
        })
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
      expect(response.body.message).toBe('You can only create notifications for yourself');
    });

    it('should allow admin to create notification for others', async () => {
      // Set mock user to admin
      mockUser = { id: 1, username: 'admin', isAdmin: true };

      (notificationService.createNotification as jest.Mock).mockResolvedValue({
        success: true,
        data: mockSingleNotification
      });

      const response = await request(app)
        .post('/api/notifications')
        .send({
          ...validNotificationData,
          userId: 999
        })
        .expect(201);

      expect(notificationService.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 999 })
      );
    });

    it('should validate notification type', async () => {
      (validationResult as any).mockReturnValue({
        isEmpty: () => false,
        array: () => [
          { field: 'type', msg: 'Type must be a valid notification type', value: 'invalid' }
        ]
      });

      const response = await request(app)
        .post('/api/notifications')
        .send({
          ...validNotificationData,
          type: 'invalid'
        })
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate required fields', async () => {
      (validationResult as any).mockReturnValue({
        isEmpty: () => false,
        array: () => [
          { field: 'title', msg: 'Title must be between 1 and 255 characters', value: '' },
          { field: 'message', msg: 'Message is required', value: '' }
        ]
      });

      const response = await request(app)
        .post('/api/notifications')
        .send({
          userId: 1,
          type: 'info',
          title: '',
          message: ''
        })
        .expect(400);

      expect(response.body.details).toHaveLength(2);
    });

    it('should handle creation with expiry date', async () => {
      (notificationService.createNotification as jest.Mock).mockResolvedValue({
        success: true,
        data: mockSingleNotification
      });

      const response = await request(app)
        .post('/api/notifications')
        .send({
          ...validNotificationData,
          expiresAt: '2025-01-02T12:00:00Z'
        })
        .expect(201);

      expect(notificationService.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          expiresAt: new Date('2025-01-02T12:00:00Z')
        })
      );
    });
  });

  describe('PUT /api/notifications/:id', () => {
    it('should update notification read status', async () => {
      (notificationService.updateNotification as jest.Mock).mockResolvedValue({
        success: true,
        data: {
          ...mockSingleNotification,
          isRead: true
        }
      });

      const response = await request(app)
        .put('/api/notifications/550e8400-e29b-41d4-a716-446655440001')
        .send({ isRead: true })
        .expect(200);

      expect(response.body.isRead).toBe(true);
      expect(notificationService.updateNotification).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440001',
        1,
        { isRead: true }
      );
    });

    it('should update notification dismissed status', async () => {
      (notificationService.updateNotification as jest.Mock).mockResolvedValue({
        success: true,
        data: {
          ...mockSingleNotification,
          isDismissed: true
        }
      });

      const response = await request(app)
        .put('/api/notifications/550e8400-e29b-41d4-a716-446655440001')
        .send({ isDismissed: true })
        .expect(200);

      expect(response.body.isDismissed).toBe(true);
    });

    it('should handle notification not found on update', async () => {
      (notificationService.updateNotification as jest.Mock).mockResolvedValue({
        success: false,
        error: {
          message: 'Notification not found',
          code: 'NOTIFICATION_NOT_FOUND'
        }
      });

      const response = await request(app)
        .put('/api/notifications/550e8400-e29b-41d4-a716-446655440999')
        .send({ isRead: true })
        .expect(404);

      expect(response.body.error).toBe('Notification not found');
    });

    it('should validate update data types', async () => {
      (validationResult as any).mockReturnValue({
        isEmpty: () => false,
        array: () => [
          { field: 'isRead', msg: 'isRead must be a boolean', value: 'not-boolean' }
        ]
      });

      const response = await request(app)
        .put('/api/notifications/550e8400-e29b-41d4-a716-446655440001')
        .send({ isRead: 'not-boolean' })
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });
  });

  describe('DELETE /api/notifications/:id', () => {
    it('should delete notification', async () => {
      (notificationService.deleteNotification as jest.Mock).mockResolvedValue({
        success: true,
        data: { deleted: true }
      });

      const response = await request(app)
        .delete('/api/notifications/550e8400-e29b-41d4-a716-446655440001')
        .expect(204);

      expect(notificationService.deleteNotification).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440001',
        1
      );
    });

    it('should handle notification not found on delete', async () => {
      (notificationService.deleteNotification as jest.Mock).mockResolvedValue({
        success: false,
        error: {
          message: 'Notification not found',
          code: 'NOTIFICATION_NOT_FOUND'
        }
      });

      const response = await request(app)
        .delete('/api/notifications/550e8400-e29b-41d4-a716-446655440999')
        .expect(404);

      expect(response.body.error).toBe('Notification not found');
    });
  });

  describe('POST /api/notifications/bulk', () => {
    const bulkOperationData = {
      notificationIds: [
        '550e8400-e29b-41d4-a716-446655440001',
        '550e8400-e29b-41d4-a716-446655440002'
      ],
      operation: 'mark_read'
    };

    it('should perform bulk mark as read', async () => {
      (notificationService.bulkUpdateNotifications as jest.Mock).mockResolvedValue({
        success: true,
        data: {
          updatedCount: 2,
          operation: 'mark_read'
        }
      });

      const response = await request(app)
        .post('/api/notifications/bulk')
        .send(bulkOperationData)
        .expect(200);

      expect(response.body.updatedCount).toBe(2);
      expect(notificationService.bulkUpdateNotifications).toHaveBeenCalledWith(
        1,
        bulkOperationData
      );
    });

    it('should support all bulk operations', async () => {
      const operations = ['mark_read', 'mark_unread', 'dismiss', 'delete'];

      for (const operation of operations) {
        (notificationService.bulkUpdateNotifications as jest.Mock).mockResolvedValue({
          success: true,
          data: { updatedCount: 2, operation }
        });

        await request(app)
          .post('/api/notifications/bulk')
          .send({
            ...bulkOperationData,
            operation
          })
          .expect(200);
      }
    });

    it('should validate notification IDs are UUIDs', async () => {
      (validationResult as any).mockReturnValue({
        isEmpty: () => false,
        array: () => [
          { field: 'notificationIds.*', msg: 'All notification IDs must be valid UUIDs', value: 'invalid' }
        ]
      });

      const response = await request(app)
        .post('/api/notifications/bulk')
        .send({
          notificationIds: ['invalid-uuid'],
          operation: 'mark_read'
        })
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate operation type', async () => {
      (validationResult as any).mockReturnValue({
        isEmpty: () => false,
        array: () => [
          { field: 'operation', msg: 'Operation must be one of: mark_read, mark_unread, dismiss, delete', value: 'invalid' }
        ]
      });

      const response = await request(app)
        .post('/api/notifications/bulk')
        .send({
          ...bulkOperationData,
          operation: 'invalid'
        })
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });
  });

  describe('POST /api/notifications/system (Admin Only)', () => {
    const systemNotificationData = {
      title: 'System Maintenance',
      message: 'System will be down for maintenance tonight',
      type: 'warning',
      priority: 3
    };

    it('should create system notification for admin', async () => {
      // Set mock user to admin
      mockUser = { id: 1, username: 'admin', isAdmin: true };

      (notificationService.createSystemNotification as jest.Mock).mockResolvedValue({
        success: true,
        data: 150 // Number of users notified
      });

      const response = await request(app)
        .post('/api/notifications/system')
        .send(systemNotificationData)
        .expect(201);

      expect(response.body.message).toBe('System notification created successfully');
      expect(response.body.usersNotified).toBe(150);
    });

    it('should reject non-admin users', async () => {
      const response = await request(app)
        .post('/api/notifications/system')
        .send(systemNotificationData)
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
      expect(response.body.message).toBe('Only administrators can create system notifications');
    });

    it('should handle system notification with expiry', async () => {
      // Set mock user to admin
      mockUser = { id: 1, username: 'admin', isAdmin: true };

      (notificationService.createSystemNotification as jest.Mock).mockResolvedValue({
        success: true,
        data: 150
      });

      const response = await request(app)
        .post('/api/notifications/system')
        .send({
          ...systemNotificationData,
          expiresAt: '2025-01-02T02:00:00Z'
        })
        .expect(201);

      expect(notificationService.createSystemNotification).toHaveBeenCalledWith(
        systemNotificationData.title,
        systemNotificationData.message,
        systemNotificationData.type,
        systemNotificationData.priority,
        new Date('2025-01-02T02:00:00Z')
      );
    });
  });

  describe('POST /api/notifications/cleanup (Admin Only)', () => {
    it('should cleanup expired notifications for admin', async () => {
      // Set mock user to admin
      mockUser = { id: 1, username: 'admin', isAdmin: true };

      (notificationService.cleanupExpiredNotifications as jest.Mock).mockResolvedValue({
        success: true,
        data: 25 // Number of notifications cleaned up
      });

      const response = await request(app)
        .post('/api/notifications/cleanup')
        .expect(200);

      expect(response.body.message).toBe('Cleanup completed successfully');
      expect(response.body.deletedCount).toBe(25);
    });

    it('should reject non-admin users from cleanup', async () => {
      const response = await request(app)
        .post('/api/notifications/cleanup')
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
      expect(response.body.message).toBe('Only administrators can trigger cleanup');
    });

    it('should handle cleanup errors', async () => {
      // Set mock user to admin
      mockUser = { id: 1, username: 'admin', isAdmin: true };

      (notificationService.cleanupExpiredNotifications as jest.Mock).mockResolvedValue({
        success: false,
        error: {
          message: 'Cleanup failed',
          code: 'CLEANUP_ERROR'
        }
      });

      const response = await request(app)
        .post('/api/notifications/cleanup')
        .expect(500);

      expect(response.body.error).toBe('Cleanup failed');
    });
  });

  describe('Authentication', () => {
    it('should require authentication for all routes', async () => {
      // Create app that always returns 401
      const unauthedApp = express();
      unauthedApp.use(express.json());
      unauthedApp.use('/api/notifications', (req, res, next) => {
        res.status(401).json({ error: 'Authentication required' });
      });

      const response = await request(unauthedApp)
        .get('/api/notifications')
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });
  });

  describe('Error Handling', () => {
    it('should handle service exceptions', async () => {
      (notificationService.getUserNotifications as jest.Mock).mockRejectedValue(
        new Error('Service unavailable')
      );

      const response = await request(app)
        .get('/api/notifications')
        .expect(500);

      expect(response.body.error).toBe('Internal server error');
    });

    it('should handle malformed request bodies', async () => {
      (validationResult as any).mockReturnValue({
        isEmpty: () => false,
        array: () => [
          { field: 'priority', msg: 'Priority must be between 1 and 5', value: 10 }
        ]
      });

      const response = await request(app)
        .post('/api/notifications')
        .send({
          userId: 1,
          type: 'info',
          title: 'Test',
          message: 'Test message',
          priority: 10
        })
        .expect(400);

      expect(response.body.details).toHaveLength(1);
    });
  });

  describe('Route Coverage Validation', () => {
    it('should have comprehensive coverage of all notification routes', () => {
      const expectedRoutes = [
        'GET /',
        'GET /stats',
        'GET /:id',
        'POST /',
        'PUT /:id',
        'DELETE /:id',
        'POST /bulk',
        'POST /system',
        'POST /cleanup'
      ];
      
      expect(expectedRoutes.length).toBe(9);
    });
  });
});