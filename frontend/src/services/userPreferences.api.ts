/* eslint-disable @typescript-eslint/no-explicit-any */
import { apiClient } from '@/utils/apiClient';
import { queryCache } from '@/utils/apiCache';

export interface UserPreferences {
  id: number;
  userId: number;
  defaultExportFormat: 'excel' | 'csv' | 'pdf' | 'json';
  defaultPageSize: number;
  timezone: string;
  dateFormat: string;
  theme: 'light' | 'dark' | 'system';
  emailNotifications: boolean;
  notificationPreferences: {
    reportCompletion: boolean;
    scheduledReports: boolean;
    systemAlerts: boolean;
    weeklyDigest: boolean;
    notificationTime: string;
  };
  preferences?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateUserPreferencesDto {
  defaultExportFormat?: 'excel' | 'csv' | 'pdf' | 'json';
  defaultPageSize?: number;
  timezone?: string;
  dateFormat?: string;
  theme?: 'light' | 'dark' | 'system';
  emailNotifications?: boolean;
  notificationPreferences?: {
    reportCompletion?: boolean;
    scheduledReports?: boolean;
    systemAlerts?: boolean;
    weeklyDigest?: boolean;
    notificationTime?: string;
  };
  preferences?: Record<string, unknown>;
}

export interface NotificationPreferencesUpdateDto {
  emailNotifications?: boolean;
  reportCompletion?: boolean;
  scheduledReports?: boolean;
  systemAlerts?: boolean;
  weeklyDigest?: boolean;
  notificationTime?: string;
}

class UserPreferencesApi {
  /**
   * Get current user's preferences
   */
  async getUserPreferences(): Promise<UserPreferences> {
    try {
      // Disable cache for user preferences to always get fresh data
      const response = await apiClient.get<UserPreferences>('/user/preferences', undefined, { 
        useCache: false,
        immediate: true 
      });
      
      // Check if response has a data property or is the data itself
      const data = (response as any).data || response;
      
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid response structure');
      }
      
      return data as UserPreferences;
    } catch (error: any) {
      throw new Error(((error as any)?.message || String(error)) || 'Failed to fetch user preferences');
    }
  }

  /**
   * Update user preferences
   */
  async updateUserPreferences(updates: UpdateUserPreferencesDto): Promise<UserPreferences> {
    try {
      const response = await apiClient.put<UserPreferences>('/user/preferences', updates);
      // Clear cache for user preferences after update
      queryCache.clearPattern('/user/preferences');
      // Check if response has a data property or is the data itself
      const data = (response as any).data || response;
      return data as UserPreferences;
    } catch (error: any) {
      throw new Error(((error as any)?.message || String(error)) || 'Failed to update user preferences');
    }
  }

  /**
   * Update notification preferences only
   */
  async updateNotificationPreferences(updates: NotificationPreferencesUpdateDto): Promise<UserPreferences> {
    try {
      const response = await apiClient.put<UserPreferences>('/user/preferences/notifications', updates);
      // Clear cache for user preferences after update
      queryCache.clearPattern('/user/preferences');
      // Check if response has a data property or is the data itself
      const data = (response as any).data || response;
      return data as UserPreferences;
    } catch (error: any) {
      throw new Error(((error as any)?.message || String(error)) || 'Failed to update notification preferences');
    }
  }

  /**
   * Get notification preferences only
   */
  async getNotificationPreferences(): Promise<{
    emailNotifications: boolean;
    notificationPreferences: UserPreferences['notificationPreferences'];
  }> {
    const preferences = await this.getUserPreferences();
    
    // Check if preferences is valid
    if (!preferences || typeof preferences !== 'object') {
      throw new Error('Invalid API response');
    }
    
    return {
      emailNotifications: preferences.emailNotifications ?? true,
      notificationPreferences: preferences.notificationPreferences || {
        reportCompletion: true,
        scheduledReports: true,
        systemAlerts: false,
        weeklyDigest: true,
        notificationTime: '09:00'
      }
    };
  }
}

// Export singleton instance
export const userPreferencesApi = new UserPreferencesApi();
export default userPreferencesApi;