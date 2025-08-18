import { db, Database } from '@/config/database';
import { logger } from '@/utils/logger';
import { 
  Notification, 
  CreateNotificationRequest, 
  UpdateNotificationRequest,
  NotificationFilters,
  NotificationStats,
  BulkNotificationOperation,
  ServiceResponse,
  PaginatedResult,
  PaginationOptions
} from '@/types/shared-types';

export class NotificationService {
  private db: Database;

  constructor() {
    this.db = db;
  }

  /**
   * Create a new notification
   */
  async createNotification(request: CreateNotificationRequest): Promise<ServiceResponse<Notification>> {
    try {
      logger.info('Creating notification', { userId: request.userId, type: request.type });

      const query = `
        INSERT INTO notifications (
          user_id, type, title, message, data, priority, category, expires_at, source
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `;

      const values = [
        request.userId,
        request.type,
        request.title,
        request.message,
        request.data ? JSON.stringify(request.data) : '{}',
        request.priority || 2, // Default to normal priority
        request.category || null,
        request.expiresAt || null,
        request.source || 'system'
      ];

      const result = await this.db.query(query, values);
      const notification = this.mapRowToNotification(result.rows[0]);

      logger.info('Notification created successfully', { 
        notificationId: notification.id,
        userId: request.userId 
      });

      return {
        success: true,
        data: notification
      };
    } catch (error) {
      logger.error('Failed to create notification:', error);
      return {
        success: false,
        error: {
          code: 'NOTIFICATION_CREATE_FAILED',
          message: 'Failed to create notification',
          details: error
        }
      };
    }
  }

  /**
   * Get user notifications with pagination and filtering
   */
  async getUserNotifications(
    userId: number, 
    filters: NotificationFilters = {},
    pagination: PaginationOptions = {}
  ): Promise<ServiceResponse<PaginatedResult<Notification>>> {
    try {
      const { page = 1, pageSize = 20 } = pagination;
      const offset = (page - 1) * pageSize;

      // Build WHERE clause based on filters
      const whereConditions = ['user_id = $1'];
      const queryParams: any[] = [userId];
      let paramIndex = 2;

      if (filters.types && filters.types.length > 0) {
        whereConditions.push(`type = ANY($${paramIndex})`);
        queryParams.push(filters.types);
        paramIndex++;
      }

      if (filters.categories && filters.categories.length > 0) {
        whereConditions.push(`category = ANY($${paramIndex})`);
        queryParams.push(filters.categories);
        paramIndex++;
      }

      if (filters.isRead !== undefined) {
        whereConditions.push(`is_read = $${paramIndex}`);
        queryParams.push(filters.isRead);
        paramIndex++;
      }

      if (filters.isDismissed !== undefined) {
        whereConditions.push(`is_dismissed = $${paramIndex}`);
        queryParams.push(filters.isDismissed);
        paramIndex++;
      }

      if (filters.priority && filters.priority.length > 0) {
        whereConditions.push(`priority = ANY($${paramIndex})`);
        queryParams.push(filters.priority);
        paramIndex++;
      }

      if (filters.dateFrom) {
        whereConditions.push(`created_at >= $${paramIndex}`);
        queryParams.push(filters.dateFrom);
        paramIndex++;
      }

      if (filters.dateTo) {
        whereConditions.push(`created_at <= $${paramIndex}`);
        queryParams.push(filters.dateTo);
        paramIndex++;
      }

      // Auto-filter expired notifications
      whereConditions.push('(expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)');

      const whereClause = whereConditions.join(' AND ');

      // Get total count
      const countQuery = `SELECT COUNT(*) FROM notifications WHERE ${whereClause}`;
      const countResult = await this.db.query(countQuery, queryParams);
      const total = parseInt(countResult.rows[0].count);

      // Get notifications with pagination
      const query = `
        SELECT * FROM notifications 
        WHERE ${whereClause}
        ORDER BY 
          CASE WHEN is_read = false THEN priority ELSE 0 END DESC,
          created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      queryParams.push(pageSize, offset);
      const result = await this.db.query(query, queryParams);
      const notifications = result.rows.map((row: any) => this.mapRowToNotification(row));

      return {
        success: true,
        data: {
          data: notifications,
          pagination: {
            total,
            page,
            pageSize,
            hasNext: offset + pageSize < total,
            hasPrevious: page > 1
          }
        }
      };
    } catch (error) {
      logger.error('Failed to get user notifications:', error);
      return {
        success: false,
        error: {
          code: 'NOTIFICATIONS_FETCH_FAILED',
          message: 'Failed to fetch notifications',
          details: error
        }
      };
    }
  }

  /**
   * Get notification by ID (for specific user)
   */
  async getNotificationById(notificationId: string, userId: number): Promise<ServiceResponse<Notification>> {
    try {
      const query = `
        SELECT * FROM notifications 
        WHERE id = $1 AND user_id = $2
        AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
      `;
      
      const result = await this.db.query(query, [notificationId, userId]);

      if (result.rows.length === 0) {
        return {
          success: false,
          error: {
            code: 'NOTIFICATION_NOT_FOUND',
            message: 'Notification not found'
          }
        };
      }

      const notification = this.mapRowToNotification(result.rows[0]);

      return {
        success: true,
        data: notification
      };
    } catch (error) {
      logger.error('Failed to get notification by ID:', error);
      return {
        success: false,
        error: {
          code: 'NOTIFICATION_FETCH_FAILED',
          message: 'Failed to fetch notification',
          details: error
        }
      };
    }
  }

  /**
   * Update a notification (mark as read/dismissed)
   */
  async updateNotification(
    notificationId: string, 
    userId: number, 
    updates: UpdateNotificationRequest
  ): Promise<ServiceResponse<Notification>> {
    try {
      const setParts: string[] = [];
      const queryParams: any[] = [];
      let paramIndex = 1;

      if (updates.isRead !== undefined) {
        setParts.push(`is_read = $${paramIndex}`);
        queryParams.push(updates.isRead);
        paramIndex++;

        if (updates.isRead) {
          setParts.push(`read_at = CURRENT_TIMESTAMP`);
        } else {
          setParts.push(`read_at = NULL`);
        }
      }

      if (updates.isDismissed !== undefined) {
        setParts.push(`is_dismissed = $${paramIndex}`);
        queryParams.push(updates.isDismissed);
        paramIndex++;

        if (updates.isDismissed) {
          setParts.push(`dismissed_at = CURRENT_TIMESTAMP`);
        } else {
          setParts.push(`dismissed_at = NULL`);
        }
      }

      if (setParts.length === 0) {
        return {
          success: false,
          error: {
            code: 'NO_UPDATES_PROVIDED',
            message: 'No valid updates provided'
          }
        };
      }

      queryParams.push(notificationId, userId);
      const query = `
        UPDATE notifications 
        SET ${setParts.join(', ')}
        WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
        RETURNING *
      `;

      const result = await this.db.query(query, queryParams);

      if (result.rows.length === 0) {
        return {
          success: false,
          error: {
            code: 'NOTIFICATION_NOT_FOUND',
            message: 'Notification not found'
          }
        };
      }

      const notification = this.mapRowToNotification(result.rows[0]);

      logger.info('Notification updated successfully', { 
        notificationId, 
        userId, 
        updates 
      });

      return {
        success: true,
        data: notification
      };
    } catch (error) {
      logger.error('Failed to update notification:', error);
      return {
        success: false,
        error: {
          code: 'NOTIFICATION_UPDATE_FAILED',
          message: 'Failed to update notification',
          details: error
        }
      };
    }
  }

  /**
   * Delete a notification
   */
  async deleteNotification(notificationId: string, userId: number): Promise<ServiceResponse<boolean>> {
    try {
      const query = 'DELETE FROM notifications WHERE id = $1 AND user_id = $2';
      const result = await this.db.query(query, [notificationId, userId]);

      if (result.rowCount === 0) {
        return {
          success: false,
          error: {
            code: 'NOTIFICATION_NOT_FOUND',
            message: 'Notification not found'
          }
        };
      }

      logger.info('Notification deleted successfully', { notificationId, userId });

      return {
        success: true,
        data: true
      };
    } catch (error) {
      logger.error('Failed to delete notification:', error);
      return {
        success: false,
        error: {
          code: 'NOTIFICATION_DELETE_FAILED',
          message: 'Failed to delete notification',
          details: error
        }
      };
    }
  }

  /**
   * Get notification statistics for a user
   */
  async getUserNotificationStats(userId: number): Promise<ServiceResponse<NotificationStats>> {
    try {
      const query = 'SELECT * FROM get_user_notification_stats($1)';
      const result = await this.db.query(query, [userId]);

      const stats = result.rows[0] || {
        total_count: 0,
        unread_count: 0,
        high_priority_unread: 0,
        recent_count: 0
      };

      return {
        success: true,
        data: {
          totalCount: parseInt(stats.total_count),
          unreadCount: parseInt(stats.unread_count),
          highPriorityUnread: parseInt(stats.high_priority_unread),
          recentCount: parseInt(stats.recent_count)
        }
      };
    } catch (error) {
      logger.error('Failed to get notification stats:', error);
      return {
        success: false,
        error: {
          code: 'NOTIFICATION_STATS_FAILED',
          message: 'Failed to get notification statistics',
          details: error
        }
      };
    }
  }

  /**
   * Bulk operations on notifications
   */
  async bulkUpdateNotifications(
    userId: number, 
    operation: BulkNotificationOperation
  ): Promise<ServiceResponse<{ updated: number; errors: string[] }>> {
    try {
      const { notificationIds, operation: op } = operation;
      const errors: string[] = [];
      let updated = 0;

      for (const notificationId of notificationIds) {
        try {
          let result: ServiceResponse<any>;

          switch (op) {
            case 'mark_read':
              result = await this.updateNotification(notificationId, userId, { isRead: true });
              break;
            case 'mark_unread':
              result = await this.updateNotification(notificationId, userId, { isRead: false });
              break;
            case 'dismiss':
              result = await this.updateNotification(notificationId, userId, { isDismissed: true });
              break;
            case 'delete':
              result = await this.deleteNotification(notificationId, userId);
              break;
            default:
              errors.push(`Invalid operation: ${op}`);
              continue;
          }

          if (result.success) {
            updated++;
          } else {
            errors.push(`Failed to ${op} notification ${notificationId}: ${result.error?.message}`);
          }
        } catch (error) {
          errors.push(`Error processing notification ${notificationId}: ${error}`);
        }
      }

      return {
        success: true,
        data: { updated, errors }
      };
    } catch (error) {
      logger.error('Failed to perform bulk notification operation:', error);
      return {
        success: false,
        error: {
          code: 'BULK_OPERATION_FAILED',
          message: 'Failed to perform bulk operation',
          details: error
        }
      };
    }
  }

  /**
   * Clean up expired notifications
   */
  async cleanupExpiredNotifications(): Promise<ServiceResponse<number>> {
    try {
      const query = 'SELECT cleanup_expired_notifications()';
      const result = await this.db.query(query);
      const deletedCount = result.rows[0].cleanup_expired_notifications;

      logger.info(`Cleaned up ${deletedCount} expired notifications`);

      return {
        success: true,
        data: deletedCount
      };
    } catch (error) {
      logger.error('Failed to cleanup expired notifications:', error);
      return {
        success: false,
        error: {
          code: 'CLEANUP_FAILED',
          message: 'Failed to cleanup expired notifications',
          details: error
        }
      };
    }
  }

  /**
   * Create system-wide notification for all users
   */
  async createSystemNotification(
    title: string, 
    message: string, 
    type: 'info' | 'warning' | 'error' = 'info',
    priority: 1 | 2 | 3 | 4 | 5 = 2,
    expiresAt?: Date
  ): Promise<ServiceResponse<number>> {
    try {
      // Get all active users
      const usersQuery = 'SELECT id FROM users WHERE is_active = true';
      const usersResult = await this.db.query(usersQuery);
      
      const userIds = usersResult.rows.map((row: any) => row.id);
      let created = 0;

      for (const userId of userIds) {
        const result = await this.createNotification({
          userId,
          type,
          title,
          message,
          priority,
          category: 'system',
          source: 'system',
          expiresAt
        });

        if (result.success) {
          created++;
        }
      }

      logger.info(`Created system notification for ${created} users`);

      return {
        success: true,
        data: created
      };
    } catch (error) {
      logger.error('Failed to create system notification:', error);
      return {
        success: false,
        error: {
          code: 'SYSTEM_NOTIFICATION_FAILED',
          message: 'Failed to create system notification',
          details: error
        }
      };
    }
  }

  /**
   * Map database row to Notification interface
   */
  private mapRowToNotification(row: any): Notification {
    return {
      id: row.id,
      userId: row.user_id,
      type: row.type,
      title: row.title,
      message: row.message,
      data: row.data || {},
      isRead: row.is_read,
      isDismissed: row.is_dismissed,
      priority: row.priority,
      category: row.category,
      expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
      createdAt: new Date(row.created_at),
      readAt: row.read_at ? new Date(row.read_at) : undefined,
      dismissedAt: row.dismissed_at ? new Date(row.dismissed_at) : undefined,
      createdBy: row.created_by,
      source: row.source
    };
  }
}

// Export singleton instance
export const notificationService = new NotificationService();