/* eslint-disable @typescript-eslint/no-explicit-any */
import { apiClient } from '@/utils/apiClient';

// Types matching backend
export interface Notification {
  id: string;
  userId: number;
  type: 'info' | 'success' | 'warning' | 'error' | 'report_complete' | 'report_failed' | 'system' | 'reminder';
  title: string;
  message: string;
  data?: Record<string, any>;
  isRead: boolean;
  isDismissed: boolean;
  priority: 1 | 2 | 3 | 4 | 5;
  category?: string;
  expiresAt?: string;
  createdAt: string;
  readAt?: string;
  dismissedAt?: string;
  createdBy?: number;
  source?: string;
}

export interface NotificationStats {
  totalCount: number;
  unreadCount: number;
  highPriorityUnread: number;
  recentCount: number;
}

export interface NotificationFilters {
  types?: string[];
  categories?: string[];
  isRead?: boolean;
  isDismissed?: boolean;
  priority?: number[];
  dateFrom?: string;
  dateTo?: string;
}

export interface PaginatedNotifications {
  data: Notification[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}

export interface CreateNotificationRequest {
  userId: number;
  type: Notification['type'];
  title: string;
  message: string;
  data?: Record<string, any>;
  priority?: number;
  category?: string;
  expiresAt?: string;
  source?: string;
}

export interface UpdateNotificationRequest {
  isRead?: boolean;
  isDismissed?: boolean;
}

export interface BulkNotificationOperation {
  notificationIds: string[];
  operation: 'mark_read' | 'mark_unread' | 'dismiss' | 'delete';
}

class NotificationService {
  /**
   * Get user notifications with pagination and filtering
   */
  async getUserNotifications(
    page: number = 1,
    pageSize: number = 20,
    filters: NotificationFilters = {}
  ): Promise<PaginatedNotifications> {
    const params = new URLSearchParams({
      page: page.toString(),
      pageSize: pageSize.toString()
    });

    // Add filters to params
    if (filters.types && filters.types.length > 0) {
      params.append('types', filters.types.join(','));
    }
    if (filters.categories && filters.categories.length > 0) {
      params.append('categories', filters.categories.join(','));
    }
    if (filters.isRead !== undefined) {
      params.append('isRead', filters.isRead.toString());
    }
    if (filters.isDismissed !== undefined) {
      params.append('isDismissed', filters.isDismissed.toString());
    }
    if (filters.priority && filters.priority.length > 0) {
      params.append('priority', filters.priority.join(','));
    }
    if (filters.dateFrom) {
      params.append('dateFrom', filters.dateFrom);
    }
    if (filters.dateTo) {
      params.append('dateTo', filters.dateTo);
    }

    const response = await apiClient.get<PaginatedNotifications>(`/notifications?${params.toString()}`);
    return ((response as any).data)!;
  }

  /**
   * Get notification statistics
   */
  async getNotificationStats(): Promise<NotificationStats> {
    const response = await apiClient.get<NotificationStats>('/notifications/stats');
    return ((response as any).data)!;
  }

  /**
   * Get notification by ID
   */
  async getNotificationById(id: string): Promise<Notification> {
    const response = await apiClient.get<Notification>(`/notifications/${id}`);
    return ((response as any).data)!;
  }

  /**
   * Create a new notification
   */
  async createNotification(request: CreateNotificationRequest): Promise<Notification> {
    const response = await apiClient.post<Notification>('/notifications', request);
    return ((response as any).data)!;
  }

  /**
   * Update a notification (mark as read/dismissed)
   */
  async updateNotification(id: string, updates: UpdateNotificationRequest): Promise<Notification> {
    const response = await apiClient.put<Notification>(`/notifications/${id}`, updates);
    return ((response as any).data)!;
  }

  /**
   * Delete a notification
   */
  async deleteNotification(id: string): Promise<void> {
    await apiClient.delete(`/notifications/${id}`);
  }

  /**
   * Perform bulk operations on notifications
   */
  async bulkUpdateNotifications(operation: BulkNotificationOperation): Promise<{
    updated: number;
    errors: string[];
  }> {
    const response = await apiClient.post<{ updated: number; errors: string[] }>('/notifications/bulk', operation);
    return ((response as any).data)!;
  }

  /**
   * Mark notification as read
   */
  async markAsRead(id: string): Promise<Notification> {
    return this.updateNotification(id, { isRead: true });
  }

  /**
   * Mark notification as unread
   */
  async markAsUnread(id: string): Promise<Notification> {
    return this.updateNotification(id, { isRead: false });
  }

  /**
   * Dismiss notification
   */
  async dismissNotification(id: string): Promise<Notification> {
    return this.updateNotification(id, { isDismissed: true });
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(): Promise<{ updated: number; errors: string[] }> {
    // First get all unread notification IDs
    const notifications = await this.getUserNotifications(1, 1000, { isRead: false });
    const notificationIds = notifications.data.map(n => n.id);
    
    if (notificationIds.length === 0) {
      return { updated: 0, errors: [] };
    }

    return this.bulkUpdateNotifications({
      notificationIds,
      operation: 'mark_read'
    });
  }

  /**
   * Dismiss all notifications
   */
  async dismissAll(): Promise<{ updated: number; errors: string[] }> {
    // First get all non-dismissed notification IDs
    const notifications = await this.getUserNotifications(1, 1000, { isDismissed: false });
    const notificationIds = notifications.data.map(n => n.id);
    
    if (notificationIds.length === 0) {
      return { updated: 0, errors: [] };
    }

    return this.bulkUpdateNotifications({
      notificationIds,
      operation: 'dismiss'
    });
  }

  /**
   * Create system notification (admin only)
   */
  async createSystemNotification(
    title: string,
    message: string,
    type: 'info' | 'warning' | 'error' = 'info',
    priority: number = 2,
    expiresAt?: string
  ): Promise<{ message: string; usersNotified: number }> {
    const response = await apiClient.post<{ message: string; usersNotified: number }>('/notifications/system', {
      title,
      message,
      type,
      priority,
      expiresAt
    });
    return ((response as any).data)!;
  }

  /**
   * Cleanup expired notifications (admin only)
   */
  async cleanupExpiredNotifications(): Promise<{ message: string; deletedCount: number }> {
    const response = await apiClient.post<{ message: string; deletedCount: number }>('/notifications/cleanup');
    return ((response as any).data)!;
  }

  /**
   * Get unread notifications count
   */
  async getUnreadCount(): Promise<number> {
    const stats = await this.getNotificationStats();
    return stats.unreadCount;
  }

  /**
   * Get recent notifications (last 10 unread)
   */
  async getRecentNotifications(): Promise<Notification[]> {
    const result = await this.getUserNotifications(1, 10, { isDismissed: false });
    return ((result as any)?.data);
  }
}

// Export singleton instance
export const notificationService = new NotificationService();
export default notificationService;