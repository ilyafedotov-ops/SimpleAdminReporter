import { Pool } from 'pg';
import { db } from '@/config/database';
import { logger } from '@/utils/logger';
import { ServiceResponse } from '@/types/shared-types';

export interface UserPreferences {
  id: number;
  userId: number;
  defaultExportFormat: string;
  defaultPageSize: number;
  timezone: string;
  dateFormat: string;
  theme: string;
  emailNotifications: boolean;
  notificationPreferences: {
    reportCompletion: boolean;
    scheduledReports: boolean;
    systemAlerts: boolean;
    weeklyDigest: boolean;
    notificationTime: string;
  };
  preferences?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateUserPreferencesDto {
  defaultExportFormat?: string;
  defaultPageSize?: number;
  timezone?: string;
  dateFormat?: string;
  theme?: string;
  emailNotifications?: boolean;
  notificationPreferences?: {
    reportCompletion?: boolean;
    scheduledReports?: boolean;
    systemAlerts?: boolean;
    weeklyDigest?: boolean;
    notificationTime?: string;
  };
  preferences?: Record<string, any>;
}

class UserPreferencesService {
  private pool: Pool;

  constructor() {
    this.pool = db.getPool();
  }

  /**
   * Get user preferences
   */
  async getUserPreferences(userId: number): Promise<ServiceResponse<UserPreferences>> {
    try {
      // First try to get existing preferences
      const query = `
        SELECT 
          id,
          user_id,
          default_export_format,
          default_page_size,
          timezone,
          date_format,
          theme,
          email_notifications,
          notification_preferences,
          preferences,
          created_at,
          updated_at
        FROM user_preferences
        WHERE user_id = $1
      `;

      let result = await this.pool.query(query, [userId]);

      // If no preferences exist, create default ones
      if (result.rows.length === 0) {
        const createQuery = `
          INSERT INTO user_preferences (
            user_id,
            default_export_format,
            default_page_size,
            timezone,
            date_format,
            theme,
            email_notifications,
            notification_preferences
          ) VALUES (
            $1, 'excel', 50, 'UTC', 'YYYY-MM-DD', 'light', true,
            '{"reportCompletion": true, "scheduledReports": true, "systemAlerts": false, "weeklyDigest": true, "notificationTime": "09:00"}'::jsonb
          )
          RETURNING *
        `;

        result = await this.pool.query(createQuery, [userId]);
      }

      const preferences = this.mapRowToPreferences(result.rows[0]);

      return {
        success: true,
        data: preferences
      };
    } catch (error) {
      logger.error('Error getting user preferences:', error);
      return {
        success: false,
        error: {
          code: 'PREFERENCES_FETCH_ERROR',
          message: 'Failed to fetch user preferences'
        }
      };
    }
  }

  /**
   * Update user preferences
   */
  async updateUserPreferences(
    userId: number,
    updates: UpdateUserPreferencesDto
  ): Promise<ServiceResponse<UserPreferences>> {
    try {
      // First ensure preferences exist
      await this.getUserPreferences(userId);

      // Build update query dynamically
      const updateFields: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      if (updates.defaultExportFormat !== undefined) {
        updateFields.push(`default_export_format = $${paramCount++}`);
        values.push(updates.defaultExportFormat);
      }

      if (updates.defaultPageSize !== undefined) {
        updateFields.push(`default_page_size = $${paramCount++}`);
        values.push(updates.defaultPageSize);
      }

      if (updates.timezone !== undefined) {
        updateFields.push(`timezone = $${paramCount++}`);
        values.push(updates.timezone);
      }

      if (updates.dateFormat !== undefined) {
        updateFields.push(`date_format = $${paramCount++}`);
        values.push(updates.dateFormat);
      }

      if (updates.theme !== undefined) {
        updateFields.push(`theme = $${paramCount++}`);
        values.push(updates.theme);
      }

      if (updates.emailNotifications !== undefined) {
        updateFields.push(`email_notifications = $${paramCount++}`);
        values.push(updates.emailNotifications);
      }

      if (updates.notificationPreferences !== undefined) {
        // Merge with existing notification preferences
        const existingQuery = `
          SELECT notification_preferences 
          FROM user_preferences 
          WHERE user_id = $1
        `;
        const existingResult = await this.pool.query(existingQuery, [userId]);
        const existingPrefs = existingResult.rows[0]?.notification_preferences || {};
        
        const mergedPrefs = {
          ...existingPrefs,
          ...updates.notificationPreferences
        };
        
        updateFields.push(`notification_preferences = $${paramCount++}`);
        values.push(JSON.stringify(mergedPrefs));
      }

      if (updates.preferences !== undefined) {
        updateFields.push(`preferences = $${paramCount++}`);
        values.push(JSON.stringify(updates.preferences));
      }

      if (updateFields.length === 0) {
        // No updates provided, return current preferences
        return this.getUserPreferences(userId);
      }

      // Always update the updated_at timestamp
      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);

      // Add user_id to values
      values.push(userId);

      const query = `
        UPDATE user_preferences
        SET ${updateFields.join(', ')}
        WHERE user_id = $${paramCount}
        RETURNING *
      `;

      const result = await this.pool.query(query, values);

      if (result.rows.length === 0) {
        return {
          success: false,
          error: {
            code: 'PREFERENCES_NOT_FOUND',
            message: 'User preferences not found'
          }
        };
      }

      const preferences = this.mapRowToPreferences(result.rows[0]);

      return {
        success: true,
        data: preferences
      };
    } catch (error) {
      logger.error('Error updating user preferences:', error);
      return {
        success: false,
        error: {
          code: 'PREFERENCES_UPDATE_ERROR',
          message: 'Failed to update user preferences'
        }
      };
    }
  }

  /**
   * Get notification preferences for a user
   */
  async getNotificationPreferences(userId: number): Promise<ServiceResponse<{
    emailNotifications: boolean;
    notificationPreferences: UserPreferences['notificationPreferences'];
  }>> {
    try {
      const query = `
        SELECT 
          email_notifications,
          notification_preferences
        FROM user_preferences
        WHERE user_id = $1
      `;

      const result = await this.pool.query(query, [userId]);

      if (result.rows.length === 0) {
        // Create default preferences if they don't exist
        const createResult = await this.getUserPreferences(userId);
        if (!createResult.success) {
          return {
            success: false,
            error: createResult.error
          };
        }

        return {
          success: true,
          data: {
            emailNotifications: createResult.data!.emailNotifications,
            notificationPreferences: createResult.data!.notificationPreferences
          }
        };
      }

      return {
        success: true,
        data: {
          emailNotifications: result.rows[0].email_notifications,
          notificationPreferences: result.rows[0].notification_preferences || {
            reportCompletion: true,
            scheduledReports: true,
            systemAlerts: false,
            weeklyDigest: true,
            notificationTime: '09:00'
          }
        }
      };
    } catch (error) {
      logger.error('Error getting notification preferences:', error);
      return {
        success: false,
        error: {
          code: 'NOTIFICATION_PREFERENCES_FETCH_ERROR',
          message: 'Failed to fetch notification preferences'
        }
      };
    }
  }

  /**
   * Map database row to UserPreferences object
   */
  private mapRowToPreferences(row: any): UserPreferences {
    return {
      id: row.id,
      userId: row.user_id,
      defaultExportFormat: row.default_export_format,
      defaultPageSize: row.default_page_size,
      timezone: row.timezone,
      dateFormat: row.date_format,
      theme: row.theme,
      emailNotifications: row.email_notifications,
      notificationPreferences: row.notification_preferences || {
        reportCompletion: true,
        scheduledReports: true,
        systemAlerts: false,
        weeklyDigest: true,
        notificationTime: '09:00'
      },
      preferences: row.preferences,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

// Export singleton instance
export const userPreferencesService = new UserPreferencesService();
export default userPreferencesService;