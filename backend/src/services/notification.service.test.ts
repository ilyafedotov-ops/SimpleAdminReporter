import { NotificationService } from './notification.service';
import { db } from '@/config/database';
import { logger } from '@/utils/logger';
import {
  Notification,
  CreateNotificationRequest,
  UpdateNotificationRequest,
  NotificationFilters,
  // NotificationStats,
  BulkNotificationOperation,
  // ServiceResponse,
  // PaginatedResult,
  PaginationOptions
} from '@/types/shared-types';

// Mock dependencies
jest.mock('@/config/database', () => ({
  db: {
    query: jest.fn()
  }
}));

jest.mock('@/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn()
  }
}));

describe('NotificationService', () => {
  let notificationService: NotificationService;
  const mockDbQuery = db.query as jest.MockedFunction<typeof db.query>;
  const mockLogger = logger as jest.Mocked<typeof logger>;

  // Sample data for testing
  const sampleNotificationRow = {
    id: 'notification-123',
    user_id: 1,
    type: 'info',
    title: 'Test Notification',
    message: 'This is a test notification',
    data: { key: 'value' }, // Assume the database driver already parses JSON
    is_read: false,
    is_dismissed: false,
    priority: 2,
    category: 'test',
    expires_at: null,
    created_at: '2025-01-01T10:00:00Z',
    read_at: null,
    dismissed_at: null,
    created_by: 1,
    source: 'system'
  };

  const sampleNotification: Notification = {
    id: 'notification-123',
    userId: 1,
    type: 'info',
    title: 'Test Notification',
    message: 'This is a test notification',
    data: { key: 'value' },
    isRead: false,
    isDismissed: false,
    priority: 2,
    category: 'test',
    expiresAt: undefined,
    createdAt: new Date('2025-01-01T10:00:00Z'),
    readAt: undefined,
    dismissedAt: undefined,
    createdBy: 1,
    source: 'system'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    notificationService = new NotificationService();
  });

  describe('createNotification', () => {
    const createRequest: CreateNotificationRequest = {
      userId: 1,
      type: 'info',
      title: 'Test Notification',
      message: 'This is a test notification',
      data: { key: 'value' },
      priority: 2,
      category: 'test',
      source: 'system'
    };

    it('should create a notification successfully', async () => {
      mockDbQuery.mockResolvedValueOnce({
        rows: [sampleNotificationRow],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: []
      });

      const result = await notificationService.createNotification(createRequest);

      expect(result.success).toBe(true);
      expect(((result as any)?.data)).toEqual(sampleNotification);
      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO notifications'),
        [
          1,
          'info',
          'Test Notification',
          'This is a test notification',
          '{"key":"value"}',
          2,
          'test',
          null,
          'system'
        ]
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Creating notification',
        { userId: 1, type: 'info' }
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Notification created successfully',
        { notificationId: 'notification-123', userId: 1 }
      );
    });

    it('should use default values for optional fields', async () => {
      const minimalRequest: CreateNotificationRequest = {
        userId: 1,
        type: 'info',
        title: 'Test',
        message: 'Test message'
      };

      mockDbQuery.mockResolvedValueOnce({
        rows: [{ ...sampleNotificationRow, priority: 2, category: null, source: 'system' }],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: []
      });

      const result = await notificationService.createNotification(minimalRequest);

      expect(result.success).toBe(true);
      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO notifications'),
        [1, 'info', 'Test', 'Test message', '{}', 2, null, null, 'system']
      );
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Database connection failed');
      mockDbQuery.mockRejectedValueOnce(dbError);

      const result = await notificationService.createNotification(createRequest);

      expect(result.success).toBe(false);
      expect(result.error).toEqual({
        code: 'NOTIFICATION_CREATE_FAILED',
        message: 'Failed to create notification',
        details: dbError
      });
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to create notification:', dbError);
    });

    it('should handle expiration date properly', async () => {
      const expirationDate = new Date('2025-12-31T23:59:59Z');
      const requestWithExpiration = {
        ...createRequest,
        expiresAt: expirationDate
      };

      mockDbQuery.mockResolvedValueOnce({
        rows: [{ ...sampleNotificationRow, expires_at: expirationDate.toISOString() }],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: []
      });

      const result = await notificationService.createNotification(requestWithExpiration);

      expect(result.success).toBe(true);
      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO notifications'),
        expect.arrayContaining([expirationDate])
      );
    });
  });

  describe('getUserNotifications', () => {
    const mockNotificationRows = [
      sampleNotificationRow,
      {
        ...sampleNotificationRow,
        id: 'notification-456',
        title: 'Second Notification',
        is_read: true,
        read_at: '2025-01-02T10:00:00Z'
      }
    ];

    it('should get user notifications with default pagination', async () => {
      mockDbQuery
        .mockResolvedValueOnce({ rows: [{ count: '2' }], rowCount: 1, command: 'SELECT', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: mockNotificationRows, rowCount: 2, command: 'SELECT', oid: 0, fields: [] });

      const result = await notificationService.getUserNotifications(1);

      expect(result.success).toBe(true);
      expect(((result as any)?.data)?.data).toHaveLength(2);
      expect(((result as any)?.data)?.pagination).toEqual({
        total: 2,
        page: 1,
        pageSize: 20,
        hasNext: false,
        hasPrevious: false
      });
    });

    it('should apply filters correctly', async () => {
      const filters: NotificationFilters = {
        types: ['info', 'warning'],
        categories: ['system'],
        isRead: false,
        isDismissed: false,
        priority: [1, 2, 3],
        dateFrom: new Date('2025-01-01'),
        dateTo: new Date('2025-01-31')
      };

      mockDbQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1, command: 'SELECT', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [sampleNotificationRow], rowCount: 1, command: 'SELECT', oid: 0, fields: [] });

      const result = await notificationService.getUserNotifications(1, filters);

      expect(result.success).toBe(true);
      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('type = ANY($2)'),
        expect.arrayContaining([1, ['info', 'warning']])
      );
      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('category = ANY($3)'),
        expect.arrayContaining([['system']])
      );
    });

    it('should handle custom pagination', async () => {
      const pagination: PaginationOptions = {
        page: 2,
        pageSize: 10
      };

      mockDbQuery
        .mockResolvedValueOnce({ rows: [{ count: '25' }], rowCount: 1, command: 'SELECT', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: mockNotificationRows, rowCount: 2, command: 'SELECT', oid: 0, fields: [] });

      const result = await notificationService.getUserNotifications(1, {}, pagination);

      expect(result.success).toBe(true);
      expect(((result as any)?.data)?.pagination).toEqual({
        total: 25,
        page: 2,
        pageSize: 10,
        hasNext: true,
        hasPrevious: true
      });
      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $2 OFFSET $3'),
        expect.arrayContaining([10, 10])
      );
    });

    it('should exclude expired notifications', async () => {
      mockDbQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1, command: 'SELECT', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [sampleNotificationRow], rowCount: 1, command: 'SELECT', oid: 0, fields: [] });

      await notificationService.getUserNotifications(1);

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('(expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)'),
        expect.any(Array)
      );
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Database query failed');
      mockDbQuery.mockRejectedValueOnce(dbError);

      const result = await notificationService.getUserNotifications(1);

      expect(result.success).toBe(false);
      expect(result.error).toEqual({
        code: 'NOTIFICATIONS_FETCH_FAILED',
        message: 'Failed to fetch notifications',
        details: dbError
      });
    });

    it('should sort notifications properly (unread high priority first)', async () => {
      mockDbQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1, command: 'SELECT', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [sampleNotificationRow], rowCount: 1, command: 'SELECT', oid: 0, fields: [] });

      await notificationService.getUserNotifications(1);

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY'),
        expect.any(Array)
      );
      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('CASE WHEN is_read = false THEN priority ELSE 0 END DESC'),
        expect.any(Array)
      );
    });
  });

  describe('getNotificationById', () => {
    it('should get notification by ID successfully', async () => {
      mockDbQuery.mockResolvedValueOnce({
        rows: [sampleNotificationRow],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: []
      });

      const result = await notificationService.getNotificationById('notification-123', 1);

      expect(result.success).toBe(true);
      expect(((result as any)?.data)).toEqual(sampleNotification);
      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = $1 AND user_id = $2'),
        ['notification-123', 1]
      );
    });

    it('should return not found when notification does not exist', async () => {
      mockDbQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: []
      });

      const result = await notificationService.getNotificationById('nonexistent', 1);

      expect(result.success).toBe(false);
      expect(result.error).toEqual({
        code: 'NOTIFICATION_NOT_FOUND',
        message: 'Notification not found'
      });
    });

    it('should exclude expired notifications', async () => {
      await notificationService.getNotificationById('notification-123', 1);

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('(expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)'),
        expect.any(Array)
      );
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Database query failed');
      mockDbQuery.mockRejectedValueOnce(dbError);

      const result = await notificationService.getNotificationById('notification-123', 1);

      expect(result.success).toBe(false);
      expect(result.error).toEqual({
        code: 'NOTIFICATION_FETCH_FAILED',
        message: 'Failed to fetch notification',
        details: dbError
      });
    });
  });

  describe('updateNotification', () => {
    it('should mark notification as read', async () => {
      const updatedRow = {
        ...sampleNotificationRow,
        is_read: true,
        read_at: '2025-01-02T10:00:00Z'
      };

      mockDbQuery.mockResolvedValueOnce({
        rows: [updatedRow],
        rowCount: 1,
        command: 'UPDATE',
        oid: 0,
        fields: []
      });

      const updates: UpdateNotificationRequest = { isRead: true };
      const result = await notificationService.updateNotification('notification-123', 1, updates);

      expect(result.success).toBe(true);
      expect(((result as any)?.data)?.isRead).toBe(true);
      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('is_read = $1'),
        expect.arrayContaining([true])
      );
      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('read_at = CURRENT_TIMESTAMP'),
        expect.any(Array)
      );
    });

    it('should mark notification as unread', async () => {
      const updatedRow = {
        ...sampleNotificationRow,
        is_read: false,
        read_at: null
      };

      mockDbQuery.mockResolvedValueOnce({
        rows: [updatedRow],
        rowCount: 1,
        command: 'UPDATE',
        oid: 0,
        fields: []
      });

      const updates: UpdateNotificationRequest = { isRead: false };
      const result = await notificationService.updateNotification('notification-123', 1, updates);

      expect(result.success).toBe(true);
      expect(((result as any)?.data)?.isRead).toBe(false);
      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('read_at = NULL'),
        expect.any(Array)
      );
    });

    it('should dismiss notification', async () => {
      const updatedRow = {
        ...sampleNotificationRow,
        is_dismissed: true,
        dismissed_at: '2025-01-02T10:00:00Z'
      };

      mockDbQuery.mockResolvedValueOnce({
        rows: [updatedRow],
        rowCount: 1,
        command: 'UPDATE',
        oid: 0,
        fields: []
      });

      const updates: UpdateNotificationRequest = { isDismissed: true };
      const result = await notificationService.updateNotification('notification-123', 1, updates);

      expect(result.success).toBe(true);
      expect(((result as any)?.data)?.isDismissed).toBe(true);
      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('dismissed_at = CURRENT_TIMESTAMP'),
        expect.any(Array)
      );
    });

    it('should undismiss notification', async () => {
      const updatedRow = {
        ...sampleNotificationRow,
        is_dismissed: false,
        dismissed_at: null
      };

      mockDbQuery.mockResolvedValueOnce({
        rows: [updatedRow],
        rowCount: 1,
        command: 'UPDATE',
        oid: 0,
        fields: []
      });

      const updates: UpdateNotificationRequest = { isDismissed: false };
      const result = await notificationService.updateNotification('notification-123', 1, updates);

      expect(result.success).toBe(true);
      expect(((result as any)?.data)?.isDismissed).toBe(false);
      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('dismissed_at = NULL'),
        expect.any(Array)
      );
    });

    it('should handle both read and dismiss updates', async () => {
      const updatedRow = {
        ...sampleNotificationRow,
        is_read: true,
        is_dismissed: true,
        read_at: '2025-01-02T10:00:00Z',
        dismissed_at: '2025-01-02T10:00:00Z'
      };

      mockDbQuery.mockResolvedValueOnce({
        rows: [updatedRow],
        rowCount: 1,
        command: 'UPDATE',
        oid: 0,
        fields: []
      });

      const updates: UpdateNotificationRequest = { isRead: true, isDismissed: true };
      const result = await notificationService.updateNotification('notification-123', 1, updates);

      expect(result.success).toBe(true);
      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('is_read = $1'),
        expect.arrayContaining([true])
      );
      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('is_dismissed = $2'),
        expect.arrayContaining([true])
      );
    });

    it('should return error when no updates provided', async () => {
      const result = await notificationService.updateNotification('notification-123', 1, {});

      expect(result.success).toBe(false);
      expect(result.error).toEqual({
        code: 'NO_UPDATES_PROVIDED',
        message: 'No valid updates provided'
      });
      expect(mockDbQuery).not.toHaveBeenCalled();
    });

    it('should return not found when notification does not exist', async () => {
      mockDbQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: 'UPDATE',
        oid: 0,
        fields: []
      });

      const updates: UpdateNotificationRequest = { isRead: true };
      const result = await notificationService.updateNotification('nonexistent', 1, updates);

      expect(result.success).toBe(false);
      expect(result.error).toEqual({
        code: 'NOTIFICATION_NOT_FOUND',
        message: 'Notification not found'
      });
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Database update failed');
      mockDbQuery.mockRejectedValueOnce(dbError);

      const updates: UpdateNotificationRequest = { isRead: true };
      const result = await notificationService.updateNotification('notification-123', 1, updates);

      expect(result.success).toBe(false);
      expect(result.error).toEqual({
        code: 'NOTIFICATION_UPDATE_FAILED',
        message: 'Failed to update notification',
        details: dbError
      });
    });

    it('should log successful updates', async () => {
      mockDbQuery.mockResolvedValueOnce({
        rows: [sampleNotificationRow],
        rowCount: 1,
        command: 'UPDATE',
        oid: 0,
        fields: []
      });

      const updates: UpdateNotificationRequest = { isRead: true };
      await notificationService.updateNotification('notification-123', 1, updates);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Notification updated successfully',
        {
          notificationId: 'notification-123',
          userId: 1,
          updates
        }
      );
    });
  });

  describe('deleteNotification', () => {
    it('should delete notification successfully', async () => {
      mockDbQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
        command: 'DELETE',
        oid: 0,
        fields: []
      });

      const result = await notificationService.deleteNotification('notification-123', 1);

      expect(result.success).toBe(true);
      expect(((result as any)?.data)).toBe(true);
      expect(mockDbQuery).toHaveBeenCalledWith(
        'DELETE FROM notifications WHERE id = $1 AND user_id = $2',
        ['notification-123', 1]
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Notification deleted successfully',
        { notificationId: 'notification-123', userId: 1 }
      );
    });

    it('should return not found when notification does not exist', async () => {
      mockDbQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: 'DELETE',
        oid: 0,
        fields: []
      });

      const result = await notificationService.deleteNotification('nonexistent', 1);

      expect(result.success).toBe(false);
      expect(result.error).toEqual({
        code: 'NOTIFICATION_NOT_FOUND',
        message: 'Notification not found'
      });
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Database delete failed');
      mockDbQuery.mockRejectedValueOnce(dbError);

      const result = await notificationService.deleteNotification('notification-123', 1);

      expect(result.success).toBe(false);
      expect(result.error).toEqual({
        code: 'NOTIFICATION_DELETE_FAILED',
        message: 'Failed to delete notification',
        details: dbError
      });
    });
  });

  describe('getUserNotificationStats', () => {
    const mockStatsRow = {
      total_count: '10',
      unread_count: '5',
      high_priority_unread: '2',
      recent_count: '3'
    };

    it('should get notification statistics successfully', async () => {
      mockDbQuery.mockResolvedValueOnce({
        rows: [mockStatsRow],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: []
      });

      const result = await notificationService.getUserNotificationStats(1);

      expect(result.success).toBe(true);
      expect(((result as any)?.data)).toEqual({
        totalCount: 10,
        unreadCount: 5,
        highPriorityUnread: 2,
        recentCount: 3
      });
      expect(mockDbQuery).toHaveBeenCalledWith(
        'SELECT * FROM get_user_notification_stats($1)',
        [1]
      );
    });

    it('should handle empty stats result', async () => {
      mockDbQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: []
      });

      const result = await notificationService.getUserNotificationStats(1);

      expect(result.success).toBe(true);
      expect(((result as any)?.data)).toEqual({
        totalCount: 0,
        unreadCount: 0,
        highPriorityUnread: 0,
        recentCount: 0
      });
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Database stats query failed');
      mockDbQuery.mockRejectedValueOnce(dbError);

      const result = await notificationService.getUserNotificationStats(1);

      expect(result.success).toBe(false);
      expect(result.error).toEqual({
        code: 'NOTIFICATION_STATS_FAILED',
        message: 'Failed to get notification statistics',
        details: dbError
      });
    });
  });

  describe('bulkUpdateNotifications', () => {
    beforeEach(() => {
      // Mock the individual update/delete methods
      jest.spyOn(notificationService, 'updateNotification');
      jest.spyOn(notificationService, 'deleteNotification');
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should perform bulk mark as read operation', async () => {
      const mockUpdate = notificationService.updateNotification as jest.MockedFunction<typeof notificationService.updateNotification>;
      mockUpdate.mockResolvedValue({
        success: true,
        data: sampleNotification
      });

      const operation: BulkNotificationOperation = {
        notificationIds: ['notification-1', 'notification-2'],
        operation: 'mark_read'
      };

      const result = await notificationService.bulkUpdateNotifications(1, operation);

      expect(result.success).toBe(true);
      expect(((result as any)?.data)).toEqual({
        updated: 2,
        errors: []
      });
      expect(mockUpdate).toHaveBeenCalledTimes(2);
      expect(mockUpdate).toHaveBeenCalledWith('notification-1', 1, { isRead: true });
      expect(mockUpdate).toHaveBeenCalledWith('notification-2', 1, { isRead: true });
    });

    it('should perform bulk mark as unread operation', async () => {
      const mockUpdate = notificationService.updateNotification as jest.MockedFunction<typeof notificationService.updateNotification>;
      mockUpdate.mockResolvedValue({
        success: true,
        data: sampleNotification
      });

      const operation: BulkNotificationOperation = {
        notificationIds: ['notification-1'],
        operation: 'mark_unread'
      };

      const result = await notificationService.bulkUpdateNotifications(1, operation);

      expect(result.success).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith('notification-1', 1, { isRead: false });
    });

    it('should perform bulk dismiss operation', async () => {
      const mockUpdate = notificationService.updateNotification as jest.MockedFunction<typeof notificationService.updateNotification>;
      mockUpdate.mockResolvedValue({
        success: true,
        data: sampleNotification
      });

      const operation: BulkNotificationOperation = {
        notificationIds: ['notification-1'],
        operation: 'dismiss'
      };

      const result = await notificationService.bulkUpdateNotifications(1, operation);

      expect(result.success).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith('notification-1', 1, { isDismissed: true });
    });

    it('should perform bulk delete operation', async () => {
      const mockDelete = notificationService.deleteNotification as jest.MockedFunction<typeof notificationService.deleteNotification>;
      mockDelete.mockResolvedValue({
        success: true,
        data: true
      });

      const operation: BulkNotificationOperation = {
        notificationIds: ['notification-1'],
        operation: 'delete'
      };

      const result = await notificationService.bulkUpdateNotifications(1, operation);

      expect(result.success).toBe(true);
      expect(mockDelete).toHaveBeenCalledWith('notification-1', 1);
    });

    it('should handle mixed success and failure results', async () => {
      const mockUpdate = notificationService.updateNotification as jest.MockedFunction<typeof notificationService.updateNotification>;
      mockUpdate
        .mockResolvedValueOnce({
          success: true,
          data: sampleNotification
        })
        .mockResolvedValueOnce({
          success: false,
          error: {
            code: 'NOTIFICATION_NOT_FOUND',
            message: 'Notification not found'
          }
        });

      const operation: BulkNotificationOperation = {
        notificationIds: ['notification-1', 'notification-2'],
        operation: 'mark_read'
      };

      const result = await notificationService.bulkUpdateNotifications(1, operation);

      expect(result.success).toBe(true);
      expect(((result as any)?.data)).toEqual({
        updated: 1,
        errors: ['Failed to mark_read notification notification-2: Notification not found']
      });
    });

    it('should handle invalid operations', async () => {
      const operation = {
        notificationIds: ['notification-1'],
        operation: 'invalid_operation' as any
      };

      const result = await notificationService.bulkUpdateNotifications(1, operation);

      expect(result.success).toBe(true);
      expect(((result as any)?.data)).toEqual({
        updated: 0,
        errors: ['Invalid operation: invalid_operation']
      });
    });

    it('should handle exceptions during individual operations', async () => {
      const mockUpdate = notificationService.updateNotification as jest.MockedFunction<typeof notificationService.updateNotification>;
      mockUpdate.mockRejectedValueOnce(new Error('Network error'));

      const operation: BulkNotificationOperation = {
        notificationIds: ['notification-1'],
        operation: 'mark_read'
      };

      const result = await notificationService.bulkUpdateNotifications(1, operation);

      expect(result.success).toBe(true);
      expect(((result as any)?.data)).toEqual({
        updated: 0,
        errors: ['Error processing notification notification-1: Error: Network error']
      });
    });

    it('should handle top-level errors', async () => {
      // Force an error in the destructuring phase by passing malformed operation
      const malformedOperation = {
        notificationIds: ['notification-1'],
        operation: 'mark_read'
      } as BulkNotificationOperation;

      // Mock the destructuring to fail by corrupting the operation object
      Object.defineProperty(malformedOperation, 'notificationIds', {
        get() {
          throw new Error('Destructuring error');
        }
      });

      const result = await notificationService.bulkUpdateNotifications(1, malformedOperation);

      expect(result.success).toBe(false);
      expect(result.error).toEqual({
        code: 'BULK_OPERATION_FAILED',
        message: 'Failed to perform bulk operation',
        details: expect.any(Error)
      });
    });
  });

  describe('cleanupExpiredNotifications', () => {
    it('should cleanup expired notifications successfully', async () => {
      mockDbQuery.mockResolvedValueOnce({
        rows: [{ cleanup_expired_notifications: 5 }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: []
      });

      const result = await notificationService.cleanupExpiredNotifications();

      expect(result.success).toBe(true);
      expect(((result as any)?.data)).toBe(5);
      expect(mockDbQuery).toHaveBeenCalledWith('SELECT cleanup_expired_notifications()');
      expect(mockLogger.info).toHaveBeenCalledWith('Cleaned up 5 expired notifications');
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Database cleanup failed');
      mockDbQuery.mockRejectedValueOnce(dbError);

      const result = await notificationService.cleanupExpiredNotifications();

      expect(result.success).toBe(false);
      expect(result.error).toEqual({
        code: 'CLEANUP_FAILED',
        message: 'Failed to cleanup expired notifications',
        details: dbError
      });
    });
  });

  describe('createSystemNotification', () => {
    const mockUserRows = [
      { id: 1 },
      { id: 2 },
      { id: 3 }
    ];

    beforeEach(() => {
      jest.spyOn(notificationService, 'createNotification');
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should create system notification for all active users', async () => {
      const mockCreateNotification = notificationService.createNotification as jest.MockedFunction<typeof notificationService.createNotification>;
      
      mockDbQuery.mockResolvedValueOnce({
        rows: mockUserRows,
        rowCount: 3,
        command: 'SELECT',
        oid: 0,
        fields: []
      });

      mockCreateNotification.mockResolvedValue({
        success: true,
        data: sampleNotification
      });

      const result = await notificationService.createSystemNotification(
        'System Maintenance',
        'System will be down for maintenance',
        'warning',
        4
      );

      expect(result.success).toBe(true);
      expect(((result as any)?.data)).toBe(3);
      expect(mockDbQuery).toHaveBeenCalledWith(
        'SELECT id FROM users WHERE is_active = true'
      );
      expect(mockCreateNotification).toHaveBeenCalledTimes(3);
      expect(mockCreateNotification).toHaveBeenCalledWith({
        userId: 1,
        type: 'warning',
        title: 'System Maintenance',
        message: 'System will be down for maintenance',
        priority: 4,
        category: 'system',
        source: 'system',
        expiresAt: undefined
      });
      expect(mockLogger.info).toHaveBeenCalledWith('Created system notification for 3 users');
    });

    it('should use default values for optional parameters', async () => {
      const mockCreateNotification = notificationService.createNotification as jest.MockedFunction<typeof notificationService.createNotification>;
      
      mockDbQuery.mockResolvedValueOnce({
        rows: [{ id: 1 }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: []
      });

      mockCreateNotification.mockResolvedValue({
        success: true,
        data: sampleNotification
      });

      const result = await notificationService.createSystemNotification(
        'System Info',
        'System information'
      );

      expect(result.success).toBe(true);
      expect(mockCreateNotification).toHaveBeenCalledWith({
        userId: 1,
        type: 'info',
        title: 'System Info',
        message: 'System information',
        priority: 2,
        category: 'system',
        source: 'system',
        expiresAt: undefined
      });
    });

    it('should handle expiration date', async () => {
      const mockCreateNotification = notificationService.createNotification as jest.MockedFunction<typeof notificationService.createNotification>;
      const expirationDate = new Date('2025-12-31T23:59:59Z');
      
      mockDbQuery.mockResolvedValueOnce({
        rows: [{ id: 1 }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: []
      });

      mockCreateNotification.mockResolvedValue({
        success: true,
        data: sampleNotification
      });

      const result = await notificationService.createSystemNotification(
        'Expiring Notification',
        'This notification will expire',
        'info',
        2,
        expirationDate
      );

      expect(result.success).toBe(true);
      expect(mockCreateNotification).toHaveBeenCalledWith({
        userId: 1,
        type: 'info',
        title: 'Expiring Notification',
        message: 'This notification will expire',
        priority: 2,
        category: 'system',
        source: 'system',
        expiresAt: expirationDate
      });
    });

    it('should handle partial failures', async () => {
      const mockCreateNotification = notificationService.createNotification as jest.MockedFunction<typeof notificationService.createNotification>;
      
      mockDbQuery.mockResolvedValueOnce({
        rows: mockUserRows,
        rowCount: 3,
        command: 'SELECT',
        oid: 0,
        fields: []
      });

      mockCreateNotification
        .mockResolvedValueOnce({
          success: true,
          data: sampleNotification
        })
        .mockResolvedValueOnce({
          success: false,
          error: {
            code: 'NOTIFICATION_CREATE_FAILED',
            message: 'Failed to create notification'
          }
        })
        .mockResolvedValueOnce({
          success: true,
          data: sampleNotification
        });

      const result = await notificationService.createSystemNotification(
        'System Notification',
        'Test message'
      );

      expect(result.success).toBe(true);
      expect(((result as any)?.data)).toBe(2); // Only 2 out of 3 succeeded
      expect(mockLogger.info).toHaveBeenCalledWith('Created system notification for 2 users');
    });

    it('should handle database errors when fetching users', async () => {
      const dbError = new Error('Database query failed');
      mockDbQuery.mockRejectedValueOnce(dbError);

      const result = await notificationService.createSystemNotification(
        'System Notification',
        'Test message'
      );

      expect(result.success).toBe(false);
      expect(result.error).toEqual({
        code: 'SYSTEM_NOTIFICATION_FAILED',
        message: 'Failed to create system notification',
        details: dbError
      });
    });

    it('should handle no active users', async () => {
      mockDbQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: []
      });

      const result = await notificationService.createSystemNotification(
        'System Notification',
        'Test message'
      );

      expect(result.success).toBe(true);
      expect(((result as any)?.data)).toBe(0);
      expect(mockLogger.info).toHaveBeenCalledWith('Created system notification for 0 users');
    });
  });

  describe('mapRowToNotification', () => {
    it('should map database row to notification object correctly', () => {
      const service = new NotificationService();
      const result = (service as any).mapRowToNotification(sampleNotificationRow);

      expect(result).toEqual(sampleNotification);
    });

    it('should handle null/undefined data field', () => {
      const service = new NotificationService();
      const rowWithNullData = {
        ...sampleNotificationRow,
        data: null
      };

      const result = (service as any).mapRowToNotification(rowWithNullData);

      expect(((result as any)?.data)).toEqual({});
    });

    it('should handle null date fields', () => {
      const service = new NotificationService();
      const rowWithNullDates = {
        ...sampleNotificationRow,
        expires_at: null,
        read_at: null,
        dismissed_at: null
      };

      const result = (service as any).mapRowToNotification(rowWithNullDates);

      expect(result.expiresAt).toBeUndefined();
      expect(result.readAt).toBeUndefined();
      expect(result.dismissedAt).toBeUndefined();
    });

    it('should handle complex data correctly', () => {
      const service = new NotificationService();
      const complexData = {
        reportId: "123",
        params: {
          filter: "active"
        }
      };
      const rowWithComplexData = {
        ...sampleNotificationRow,
        data: complexData
      };

      const result = (service as any).mapRowToNotification(rowWithComplexData);

      expect(((result as any)?.data)).toEqual(complexData);
    });

    it('should handle date parsing correctly', () => {
      const service = new NotificationService();
      const now = new Date().toISOString();
      const rowWithDates = {
        ...sampleNotificationRow,
        expires_at: now,
        read_at: now,
        dismissed_at: now
      };

      const result = (service as any).mapRowToNotification(rowWithDates);

      expect(result.expiresAt).toEqual(new Date(now));
      expect(result.readAt).toEqual(new Date(now));
      expect(result.dismissedAt).toEqual(new Date(now));
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle non-object data field gracefully', () => {
      const service = new NotificationService();
      const rowWithStringData = {
        ...sampleNotificationRow,
        data: 'simple string data'
      };

      // This should not throw an error, but return the string as-is
      const result = (service as any).mapRowToNotification(rowWithStringData);
      expect(((result as any)?.data)).toBe('simple string data');
    });

    it('should handle empty notification IDs in bulk operations', async () => {
      const operation: BulkNotificationOperation = {
        notificationIds: [],
        operation: 'mark_read'
      };

      const result = await notificationService.bulkUpdateNotifications(1, operation);

      expect(result.success).toBe(true);
      expect(((result as any)?.data)).toEqual({
        updated: 0,
        errors: []
      });
    });

    it('should handle extremely large datasets in pagination', async () => {
      mockDbQuery
        .mockResolvedValueOnce({ rows: [{ count: '999999' }], rowCount: 1, command: 'SELECT', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [sampleNotificationRow], rowCount: 1, command: 'SELECT', oid: 0, fields: [] });

      const pagination: PaginationOptions = {
        page: 50000,
        pageSize: 20
      };

      const result = await notificationService.getUserNotifications(1, {}, pagination);

      expect(result.success).toBe(true);
      expect(((result as any)?.data)?.pagination.hasNext).toBe(false);
      expect(((result as any)?.data)?.pagination.hasPrevious).toBe(true);
    });

    it('should handle SQL injection attempts in filters', async () => {
      const maliciousFilters: NotificationFilters = {
        types: ["'; DROP TABLE notifications; --" as any],
        categories: ["'; DELETE FROM users; --"]
      };

      mockDbQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1, command: 'SELECT', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] });

      const result = await notificationService.getUserNotifications(1, maliciousFilters);

      expect(result.success).toBe(true);
      // The service should handle this gracefully without executing malicious SQL
      expect(mockDbQuery).toHaveBeenCalled();
    });
  });

  describe('Performance and Memory Tests', () => {
    it('should handle large bulk operations efficiently', async () => {
      const mockUpdate = jest.spyOn(notificationService, 'updateNotification');
      mockUpdate.mockResolvedValue({
        success: true,
        data: sampleNotification
      });

      // Test with 1000 notifications
      const largeOperation: BulkNotificationOperation = {
        notificationIds: Array.from({ length: 1000 }, (_, i) => `notification-${i}`),
        operation: 'mark_read'
      };

      const result = await notificationService.bulkUpdateNotifications(1, largeOperation);

      expect(result.success).toBe(true);
      expect(((result as any)?.data)?.updated).toBe(1000);
      expect(mockUpdate).toHaveBeenCalledTimes(1000);
    });

    it('should handle concurrent operations safely', async () => {
      mockDbQuery.mockResolvedValue({
        rows: [sampleNotificationRow],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: []
      });

      // Run multiple operations concurrently
      const promises = Array.from({ length: 10 }, (_, i) =>
        notificationService.getNotificationById(`notification-${i}`, 1)
      );

      const results = await Promise.all(promises);

      results.forEach(result => {
        expect(result.success).toBe(true);
      });
      expect(mockDbQuery).toHaveBeenCalledTimes(10);
    });
  });
});