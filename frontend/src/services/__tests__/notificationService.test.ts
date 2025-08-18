/* eslint-disable */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import notificationService, { 
  Notification, 
  NotificationStats, 
  NotificationFilters,
  PaginatedNotifications,
  CreateNotificationRequest,
  UpdateNotificationRequest,
  BulkNotificationOperation
} from '../notificationService';
import { apiClient } from '@/utils/apiClient';

// Mock the apiClient
vi.mock('@/utils/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  }
}));

describe('NotificationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getUserNotifications', () => {
    it('should fetch notifications with default pagination', async () => {
      const mockResponse: PaginatedNotifications = {
        data: [
          {
            id: '1',
            userId: 1,
            type: 'info',
            title: 'Test',
            message: 'Test message',
            isRead: false,
            isDismissed: false,
            priority: 3,
            createdAt: '2024-01-01T10:00:00Z'
          } as Notification
        ],
        pagination: {
          total: 1,
          page: 1,
          pageSize: 20,
          hasNext: false,
          hasPrevious: false
        }
      };

      (apiClient.get as any).mockResolvedValue({ data: mockResponse });

      const result = await notificationService.getUserNotifications();

      expect(apiClient.get).toHaveBeenCalledWith('/notifications?page=1&pageSize=20');
      expect(result).toEqual(mockResponse);
    });

    it('should fetch notifications with custom pagination and filters', async () => {
      const mockResponse: PaginatedNotifications = {
        data: [],
        pagination: {
          total: 0,
          page: 2,
          pageSize: 50,
          hasNext: false,
          hasPrevious: true
        }
      };

      (apiClient.get as any).mockResolvedValue({ data: mockResponse });

      const filters: NotificationFilters = {
        types: ['error', 'warning'],
        categories: ['system', 'security'],
        isRead: false,
        isDismissed: false,
        priority: [4, 5],
        dateFrom: '2024-01-01',
        dateTo: '2024-01-31'
      };

      const result = await notificationService.getUserNotifications(2, 50, filters);

      expect(apiClient.get).toHaveBeenCalledWith(
        '/notifications?page=2&pageSize=50&types=error%2Cwarning&categories=system%2Csecurity&isRead=false&isDismissed=false&priority=4%2C5&dateFrom=2024-01-01&dateTo=2024-01-31'
      );
      expect(result).toEqual(mockResponse);
    });

    it('should handle empty filters correctly', async () => {
      const mockResponse: PaginatedNotifications = {
        data: [],
        pagination: {
          total: 0,
          page: 1,
          pageSize: 20,
          hasNext: false,
          hasPrevious: false
        }
      };

      (apiClient.get as any).mockResolvedValue({ data: mockResponse });

      await notificationService.getUserNotifications(1, 20, {});

      expect(apiClient.get).toHaveBeenCalledWith('/notifications?page=1&pageSize=20');
    });
  });

  describe('getNotificationStats', () => {
    it('should fetch notification statistics', async () => {
      const mockStats: NotificationStats = {
        totalCount: 100,
        unreadCount: 25,
        highPriorityUnread: 5,
        recentCount: 10
      };

      (apiClient.get as any).mockResolvedValue({ data: mockStats });

      const result = await notificationService.getNotificationStats();

      expect(apiClient.get).toHaveBeenCalledWith('/notifications/stats');
      expect(result).toEqual(mockStats);
    });
  });

  describe('getNotificationById', () => {
    it('should fetch a specific notification', async () => {
      const mockNotification: Notification = {
        id: '123',
        userId: 1,
        type: 'info',
        title: 'Test Notification',
        message: 'Test message',
        isRead: false,
        isDismissed: false,
        priority: 3,
        createdAt: '2024-01-01T10:00:00Z'
      };

      (apiClient.get as any).mockResolvedValue({ data: mockNotification });

      const result = await notificationService.getNotificationById('123');

      expect(apiClient.get).toHaveBeenCalledWith('/notifications/123');
      expect(result).toEqual(mockNotification);
    });
  });

  describe('createNotification', () => {
    it('should create a new notification', async () => {
      const request: CreateNotificationRequest = {
        userId: 1,
        type: 'success',
        title: 'Success',
        message: 'Operation completed successfully',
        priority: 2,
        category: 'system'
      };

      const mockNotification: Notification = {
        id: '456',
        ...request,
        isRead: false,
        isDismissed: false,
        createdAt: '2024-01-01T10:00:00Z'
      };

      (apiClient.post as any).mockResolvedValue({ data: mockNotification });

      const result = await notificationService.createNotification(request);

      expect(apiClient.post).toHaveBeenCalledWith('/notifications', request);
      expect(result).toEqual(mockNotification);
    });
  });

  describe('updateNotification', () => {
    it('should update a notification', async () => {
      const updates: UpdateNotificationRequest = {
        isRead: true,
        isDismissed: false
      };

      const mockNotification: Notification = {
        id: '789',
        userId: 1,
        type: 'info',
        title: 'Updated',
        message: 'Updated message',
        isRead: true,
        isDismissed: false,
        priority: 3,
        createdAt: '2024-01-01T10:00:00Z',
        readAt: '2024-01-02T10:00:00Z'
      };

      (apiClient.put as any).mockResolvedValue({ data: mockNotification });

      const result = await notificationService.updateNotification('789', updates);

      expect(apiClient.put).toHaveBeenCalledWith('/notifications/789', updates);
      expect(result).toEqual(mockNotification);
    });
  });

  describe('deleteNotification', () => {
    it('should delete a notification', async () => {
      (apiClient.delete as any).mockResolvedValue({});

      await notificationService.deleteNotification('999');

      expect(apiClient.delete).toHaveBeenCalledWith('/notifications/999');
    });
  });

  describe('bulkUpdateNotifications', () => {
    it('should perform bulk operations on notifications', async () => {
      const operation: BulkNotificationOperation = {
        notificationIds: ['1', '2', '3'],
        operation: 'mark_read'
      };

      const mockResponse = {
        updated: 3,
        errors: []
      };

      (apiClient.post as any).mockResolvedValue({ data: mockResponse });

      const result = await notificationService.bulkUpdateNotifications(operation);

      expect(apiClient.post).toHaveBeenCalledWith('/notifications/bulk', operation);
      expect(result).toEqual(mockResponse);
    });

    it('should handle bulk operation with errors', async () => {
      const operation: BulkNotificationOperation = {
        notificationIds: ['1', '2', '3'],
        operation: 'delete'
      };

      const mockResponse = {
        updated: 2,
        errors: ['Notification 3 not found']
      };

      (apiClient.post as any).mockResolvedValue({ data: mockResponse });

      const result = await notificationService.bulkUpdateNotifications(operation);

      expect(result).toEqual(mockResponse);
    });
  });

  describe('convenience methods', () => {
    it('should mark notification as read', async () => {
      const mockNotification = { id: '1', isRead: true } as Notification;
      (apiClient.put as any).mockResolvedValue({ data: mockNotification });

      const result = await notificationService.markAsRead('1');

      expect(apiClient.put).toHaveBeenCalledWith('/notifications/1', { isRead: true });
      expect(result).toEqual(mockNotification);
    });

    it('should mark notification as unread', async () => {
      const mockNotification = { id: '1', isRead: false } as Notification;
      (apiClient.put as any).mockResolvedValue({ data: mockNotification });

      const result = await notificationService.markAsUnread('1');

      expect(apiClient.put).toHaveBeenCalledWith('/notifications/1', { isRead: false });
      expect(result).toEqual(mockNotification);
    });

    it('should dismiss notification', async () => {
      const mockNotification = { id: '1', isDismissed: true } as Notification;
      (apiClient.put as any).mockResolvedValue({ data: mockNotification });

      const result = await notificationService.dismissNotification('1');

      expect(apiClient.put).toHaveBeenCalledWith('/notifications/1', { isDismissed: true });
      expect(result).toEqual(mockNotification);
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all unread notifications as read', async () => {
      const mockNotifications: PaginatedNotifications = {
        data: [
          { id: '1', isRead: false } as Notification,
          { id: '2', isRead: false } as Notification
        ],
        pagination: {
          total: 2,
          page: 1,
          pageSize: 1000,
          hasNext: false,
          hasPrevious: false
        }
      };

      const mockBulkResponse = {
        updated: 2,
        errors: []
      };

      (apiClient.get as any).mockResolvedValue({ data: mockNotifications });
      (apiClient.post as any).mockResolvedValue({ data: mockBulkResponse });

      const result = await notificationService.markAllAsRead();

      expect(apiClient.get).toHaveBeenCalledWith('/notifications?page=1&pageSize=1000&isRead=false');
      expect(apiClient.post).toHaveBeenCalledWith('/notifications/bulk', {
        notificationIds: ['1', '2'],
        operation: 'mark_read'
      });
      expect(result).toEqual(mockBulkResponse);
    });

    it('should handle empty unread notifications', async () => {
      const mockNotifications: PaginatedNotifications = {
        data: [],
        pagination: {
          total: 0,
          page: 1,
          pageSize: 1000,
          hasNext: false,
          hasPrevious: false
        }
      };

      (apiClient.get as any).mockResolvedValue({ data: mockNotifications });

      const result = await notificationService.markAllAsRead();

      expect(apiClient.get).toHaveBeenCalledWith('/notifications?page=1&pageSize=1000&isRead=false');
      expect(apiClient.post).not.toHaveBeenCalled();
      expect(result).toEqual({ updated: 0, errors: [] });
    });
  });

  describe('dismissAll', () => {
    it('should dismiss all non-dismissed notifications', async () => {
      const mockNotifications: PaginatedNotifications = {
        data: [
          { id: '1', isDismissed: false } as Notification,
          { id: '2', isDismissed: false } as Notification,
          { id: '3', isDismissed: false } as Notification
        ],
        pagination: {
          total: 3,
          page: 1,
          pageSize: 1000,
          hasNext: false,
          hasPrevious: false
        }
      };

      const mockBulkResponse = {
        updated: 3,
        errors: []
      };

      (apiClient.get as any).mockResolvedValue({ data: mockNotifications });
      (apiClient.post as any).mockResolvedValue({ data: mockBulkResponse });

      const result = await notificationService.dismissAll();

      expect(apiClient.get).toHaveBeenCalledWith('/notifications?page=1&pageSize=1000&isDismissed=false');
      expect(apiClient.post).toHaveBeenCalledWith('/notifications/bulk', {
        notificationIds: ['1', '2', '3'],
        operation: 'dismiss'
      });
      expect(result).toEqual(mockBulkResponse);
    });
  });

  describe('createSystemNotification', () => {
    it('should create a system notification', async () => {
      const mockResponse = {
        message: 'System notification created successfully',
        usersNotified: 50
      };

      (apiClient.post as any).mockResolvedValue({ data: mockResponse });

      const result = await notificationService.createSystemNotification(
        'System Maintenance',
        'The system will be under maintenance from 2-3 PM',
        'warning',
        4,
        '2024-01-31T15:00:00Z'
      );

      expect(apiClient.post).toHaveBeenCalledWith('/notifications/system', {
        title: 'System Maintenance',
        message: 'The system will be under maintenance from 2-3 PM',
        type: 'warning',
        priority: 4,
        expiresAt: '2024-01-31T15:00:00Z'
      });
      expect(result).toEqual(mockResponse);
    });

    it('should create system notification with defaults', async () => {
      const mockResponse = {
        message: 'System notification created successfully',
        usersNotified: 30
      };

      (apiClient.post as any).mockResolvedValue({ data: mockResponse });

      const result = await notificationService.createSystemNotification(
        'Info',
        'This is an informational message'
      );

      expect(apiClient.post).toHaveBeenCalledWith('/notifications/system', {
        title: 'Info',
        message: 'This is an informational message',
        type: 'info',
        priority: 2,
        expiresAt: undefined
      });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('cleanupExpiredNotifications', () => {
    it('should cleanup expired notifications', async () => {
      const mockResponse = {
        message: 'Cleanup completed successfully',
        deletedCount: 25
      };

      (apiClient.post as any).mockResolvedValue({ data: mockResponse });

      const result = await notificationService.cleanupExpiredNotifications();

      expect(apiClient.post).toHaveBeenCalledWith('/notifications/cleanup');
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getUnreadCount', () => {
    it('should get unread notifications count', async () => {
      const mockStats: NotificationStats = {
        totalCount: 100,
        unreadCount: 15,
        highPriorityUnread: 3,
        recentCount: 10
      };

      (apiClient.get as any).mockResolvedValue({ data: mockStats });

      const result = await notificationService.getUnreadCount();

      expect(apiClient.get).toHaveBeenCalledWith('/notifications/stats');
      expect(result).toBe(15);
    });
  });

  describe('getRecentNotifications', () => {
    it('should get recent non-dismissed notifications', async () => {
      const mockNotifications: Notification[] = [
        { id: '1', isDismissed: false } as Notification,
        { id: '2', isDismissed: false } as Notification
      ];

      const mockResponse: PaginatedNotifications = {
        data: mockNotifications,
        pagination: {
          total: 2,
          page: 1,
          pageSize: 10,
          hasNext: false,
          hasPrevious: false
        }
      };

      (apiClient.get as any).mockResolvedValue({ data: mockResponse });

      const result = await notificationService.getRecentNotifications();

      expect(apiClient.get).toHaveBeenCalledWith('/notifications?page=1&pageSize=10&isDismissed=false');
      expect(result).toEqual(mockNotifications);
    });
  });

  describe('error handling', () => {
    it('should handle API errors', async () => {
      const errorMessage = 'Network error';
      (apiClient.get as any).mockRejectedValue(new Error(errorMessage));

      await expect(notificationService.getUserNotifications()).rejects.toThrow(errorMessage);
    });

    it('should handle malformed responses', async () => {
      (apiClient.get as any).mockResolvedValue({ data: null });

      const result = await notificationService.getUserNotifications();
      expect(result).toBeNull();
    });
  });
});