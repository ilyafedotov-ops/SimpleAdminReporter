import { logger } from '@/utils/logger';

// Mock dependencies first
const mockPool = {
  query: jest.fn()
};

jest.mock('@/config/database', () => ({
  db: {
    getPool: jest.fn(() => mockPool)
  }
}));

jest.mock('@/utils/logger');

// Import after mocking
import { userPreferencesService, UserPreferences, UpdateUserPreferencesDto } from './user-preferences.service';

describe('UserPreferencesService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createMockPreferencesRow = (overrides = {}) => ({
    id: 1,
    user_id: 123,
    default_export_format: 'excel',
    default_page_size: 50,
    timezone: 'UTC',
    date_format: 'YYYY-MM-DD',
    theme: 'light',
    email_notifications: true,
    notification_preferences: {
      reportCompletion: true,
      scheduledReports: true,
      systemAlerts: false,
      weeklyDigest: true,
      notificationTime: '09:00'
    },
    preferences: undefined,
    created_at: new Date('2025-01-01'),
    updated_at: new Date('2025-01-01'),
    ...overrides
  });

  const createExpectedPreferences = (overrides = {}): UserPreferences => ({
    id: 1,
    userId: 123,
    defaultExportFormat: 'excel',
    defaultPageSize: 50,
    timezone: 'UTC',
    dateFormat: 'YYYY-MM-DD',
    theme: 'light',
    emailNotifications: true,
    notificationPreferences: {
      reportCompletion: true,
      scheduledReports: true,
      systemAlerts: false,
      weeklyDigest: true,
      notificationTime: '09:00'
    },
    preferences: undefined,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides
  });

  describe('getUserPreferences', () => {
    it('should return existing user preferences', async () => {
      const mockRow = createMockPreferencesRow();
      mockPool.query.mockResolvedValueOnce({
        rows: [mockRow]
      });

      const result = await userPreferencesService.getUserPreferences(123);

      expect(result.success).toBe(true);
      expect(((result as any)?.data)).toEqual(createExpectedPreferences());
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        [123]
      );
    });

    it('should create default preferences when none exist', async () => {
      // First query returns empty (no preferences)
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      
      // Second query returns newly created preferences
      const mockRow = createMockPreferencesRow();
      mockPool.query.mockResolvedValueOnce({
        rows: [mockRow]
      });

      const result = await userPreferencesService.getUserPreferences(123);

      expect(result.success).toBe(true);
      expect(((result as any)?.data)).toEqual(createExpectedPreferences());
      expect(mockPool.query).toHaveBeenCalledTimes(2);
      expect(mockPool.query).toHaveBeenNthCalledWith(2,
        expect.stringContaining('INSERT INTO user_preferences'),
        [123]
      );
    });

    it('should handle database errors gracefully', async () => {
      const dbError = new Error('Database connection failed');
      mockPool.query.mockRejectedValueOnce(dbError);

      const result = await userPreferencesService.getUserPreferences(123);

      expect(result.success).toBe(false);
      expect(result.error).toEqual({
        code: 'PREFERENCES_FETCH_ERROR',
        message: 'Failed to fetch user preferences'
      });
      expect(logger.error).toHaveBeenCalledWith('Error getting user preferences:', dbError);
    });

    it('should handle null notification_preferences in database', async () => {
      const mockRow = createMockPreferencesRow({
        notification_preferences: null
      });
      mockPool.query.mockResolvedValueOnce({
        rows: [mockRow]
      });

      const result = await userPreferencesService.getUserPreferences(123);

      expect(result.success).toBe(true);
      expect(((result as any)?.data)?.notificationPreferences).toEqual({
        reportCompletion: true,
        scheduledReports: true,
        systemAlerts: false,
        weeklyDigest: true,
        notificationTime: '09:00'
      });
    });

    it('should properly map custom preferences from JSON', async () => {
      const customPrefs = { customSetting: 'value', anotherSetting: 123 };
      const mockRow = createMockPreferencesRow({
        preferences: customPrefs
      });
      mockPool.query.mockResolvedValueOnce({
        rows: [mockRow]
      });

      const result = await userPreferencesService.getUserPreferences(123);

      expect(result.success).toBe(true);
      expect(((result as any)?.data)?.preferences).toEqual(customPrefs);
    });
  });

  describe('updateUserPreferences', () => {
    beforeEach(() => {
      // Mock the getUserPreferences call that happens at the start of updateUserPreferences
      jest.spyOn(userPreferencesService, 'getUserPreferences')
        .mockResolvedValue({
          success: true,
          data: createExpectedPreferences()
        });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should update single preference field', async () => {
      const updates: UpdateUserPreferencesDto = {
        defaultExportFormat: 'csv'
      };

      const updatedRow = createMockPreferencesRow({
        default_export_format: 'csv'
      });
      mockPool.query.mockResolvedValueOnce({
        rows: [updatedRow]
      });

      const result = await userPreferencesService.updateUserPreferences(123, updates);

      expect(result.success).toBe(true);
      expect(((result as any)?.data)?.defaultExportFormat).toBe('csv');
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE user_preferences'),
        expect.arrayContaining(['csv', 123])
      );
    });

    it('should update multiple preference fields', async () => {
      const updates: UpdateUserPreferencesDto = {
        defaultExportFormat: 'pdf',
        defaultPageSize: 100,
        theme: 'dark',
        emailNotifications: false
      };

      const updatedRow = createMockPreferencesRow({
        default_export_format: 'pdf',
        default_page_size: 100,
        theme: 'dark',
        email_notifications: false
      });
      mockPool.query.mockResolvedValueOnce({
        rows: [updatedRow]
      });

      const result = await userPreferencesService.updateUserPreferences(123, updates);

      expect(result.success).toBe(true);
      expect(((result as any)?.data)?.defaultExportFormat).toBe('pdf');
      expect(((result as any)?.data)?.defaultPageSize).toBe(100);
      expect(((result as any)?.data)?.theme).toBe('dark');
      expect(((result as any)?.data)?.emailNotifications).toBe(false);
    });

    it('should merge notification preferences with existing ones', async () => {
      const existingNotificationPrefs = {
        reportCompletion: true,
        scheduledReports: true,
        systemAlerts: false,
        weeklyDigest: true,
        notificationTime: '09:00'
      };

      // Mock the query that fetches existing notification preferences
      mockPool.query.mockResolvedValueOnce({
        rows: [{ notification_preferences: existingNotificationPrefs }]
      });

      // Mock the final update query
      const updatedRow = createMockPreferencesRow({
        notification_preferences: {
          ...existingNotificationPrefs,
          systemAlerts: true,
          notificationTime: '10:00'
        }
      });
      mockPool.query.mockResolvedValueOnce({
        rows: [updatedRow]
      });

      const updates: UpdateUserPreferencesDto = {
        notificationPreferences: {
          systemAlerts: true,
          notificationTime: '10:00'
        }
      };

      const result = await userPreferencesService.updateUserPreferences(123, updates);

      expect(result.success).toBe(true);
      expect(((result as any)?.data)?.notificationPreferences).toEqual({
        reportCompletion: true,
        scheduledReports: true,
        systemAlerts: true,
        weeklyDigest: true,
        notificationTime: '10:00'
      });
    });

    it('should handle empty notification preferences when merging', async () => {
      // Mock the query that fetches existing notification preferences (empty result)
      mockPool.query.mockResolvedValueOnce({
        rows: [{ notification_preferences: null }]
      });

      // Mock the final update query
      const updatedRow = createMockPreferencesRow({
        notification_preferences: {
          systemAlerts: true
        }
      });
      mockPool.query.mockResolvedValueOnce({
        rows: [updatedRow]
      });

      const updates: UpdateUserPreferencesDto = {
        notificationPreferences: {
          systemAlerts: true
        }
      };

      const result = await userPreferencesService.updateUserPreferences(123, updates);

      expect(result.success).toBe(true);
      expect(((result as any)?.data)?.notificationPreferences.systemAlerts).toBe(true);
    });

    it('should return current preferences when no updates provided', async () => {
      const getCurrentPreferencesSpy = jest.spyOn(userPreferencesService, 'getUserPreferences');
      
      const result = await userPreferencesService.updateUserPreferences(123, {});

      expect(result.success).toBe(true);
      expect(getCurrentPreferencesSpy).toHaveBeenCalledTimes(2); // Once for ensuring existence, once for returning current
      expect(mockPool.query).not.toHaveBeenCalledWith(
        expect.stringContaining('UPDATE'),
        expect.any(Array)
      );
    });

    it('should handle user preferences not found during update', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [] // No rows returned from update
      });

      const updates: UpdateUserPreferencesDto = {
        theme: 'dark'
      };

      const result = await userPreferencesService.updateUserPreferences(123, updates);

      expect(result.success).toBe(false);
      expect(result.error).toEqual({
        code: 'PREFERENCES_NOT_FOUND',
        message: 'User preferences not found'
      });
    });

    it('should handle database errors during update', async () => {
      const dbError = new Error('Update failed');
      mockPool.query.mockRejectedValueOnce(dbError);

      const updates: UpdateUserPreferencesDto = {
        theme: 'dark'
      };

      const result = await userPreferencesService.updateUserPreferences(123, updates);

      expect(result.success).toBe(false);
      expect(result.error).toEqual({
        code: 'PREFERENCES_UPDATE_ERROR',
        message: 'Failed to update user preferences'
      });
      expect(logger.error).toHaveBeenCalledWith('Error updating user preferences:', dbError);
    });

    it('should update custom preferences field', async () => {
      const customPrefs = { customSetting: 'newValue', newSetting: true };
      const updates: UpdateUserPreferencesDto = {
        preferences: customPrefs
      };

      const updatedRow = createMockPreferencesRow({
        preferences: customPrefs
      });
      mockPool.query.mockResolvedValueOnce({
        rows: [updatedRow]
      });

      const result = await userPreferencesService.updateUserPreferences(123, updates);

      expect(result.success).toBe(true);
      expect(((result as any)?.data)?.preferences).toEqual(customPrefs);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('preferences = $1'),
        expect.arrayContaining([JSON.stringify(customPrefs), 123])
      );
    });

    it('should always update the updated_at timestamp', async () => {
      const updates: UpdateUserPreferencesDto = {
        theme: 'dark'
      };

      const updatedRow = createMockPreferencesRow({
        theme: 'dark'
      });
      mockPool.query.mockResolvedValueOnce({
        rows: [updatedRow]
      });

      await userPreferencesService.updateUserPreferences(123, updates);

      const updateQuery = mockPool.query.mock.calls[0][0];
      expect(updateQuery).toContain('updated_at = CURRENT_TIMESTAMP');
    });

    it('should handle undefined values correctly', async () => {
      const updates: UpdateUserPreferencesDto = {
        defaultExportFormat: 'csv',
        defaultPageSize: undefined, // Should be ignored
        timezone: 'America/New_York',
        theme: undefined // Should be ignored
      };

      const updatedRow = createMockPreferencesRow({
        default_export_format: 'csv',
        timezone: 'America/New_York'
      });
      mockPool.query.mockResolvedValueOnce({
        rows: [updatedRow]
      });

      const result = await userPreferencesService.updateUserPreferences(123, updates);

      expect(result.success).toBe(true);
      expect(((result as any)?.data)?.defaultExportFormat).toBe('csv');
      expect(((result as any)?.data)?.timezone).toBe('America/New_York');
      
      const updateQuery = mockPool.query.mock.calls[0][0];
      expect(updateQuery).toContain('default_export_format = $1');
      expect(updateQuery).toContain('timezone = $2');
      expect(updateQuery).not.toContain('default_page_size');
      expect(updateQuery).not.toContain('theme');
    });
  });

  describe('getNotificationPreferences', () => {
    it('should return existing notification preferences', async () => {
      const mockRow = {
        email_notifications: true,
        notification_preferences: {
          reportCompletion: false,
          scheduledReports: true,
          systemAlerts: true,
          weeklyDigest: false,
          notificationTime: '14:00'
        }
      };
      mockPool.query.mockResolvedValueOnce({
        rows: [mockRow]
      });

      const result = await userPreferencesService.getNotificationPreferences(123);

      expect(result.success).toBe(true);
      expect(((result as any)?.data)).toEqual({
        emailNotifications: true,
        notificationPreferences: {
          reportCompletion: false,
          scheduledReports: true,
          systemAlerts: true,
          weeklyDigest: false,
          notificationTime: '14:00'
        }
      });
    });

    it('should create default preferences when none exist', async () => {
      // First query returns empty
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      
      // Mock getUserPreferences to return defaults
      const getUserPreferencesSpy = jest.spyOn(userPreferencesService, 'getUserPreferences')
        .mockResolvedValueOnce({
          success: true,
          data: createExpectedPreferences()
        });

      const result = await userPreferencesService.getNotificationPreferences(123);

      expect(result.success).toBe(true);
      expect(((result as any)?.data)).toEqual({
        emailNotifications: true,
        notificationPreferences: {
          reportCompletion: true,
          scheduledReports: true,
          systemAlerts: false,
          weeklyDigest: true,
          notificationTime: '09:00'
        }
      });
      expect(getUserPreferencesSpy).toHaveBeenCalledWith(123);
      
      getUserPreferencesSpy.mockRestore();
    });

    it('should handle null notification preferences with defaults', async () => {
      const mockRow = {
        email_notifications: false,
        notification_preferences: null
      };
      mockPool.query.mockResolvedValueOnce({
        rows: [mockRow]
      });

      const result = await userPreferencesService.getNotificationPreferences(123);

      expect(result.success).toBe(true);
      expect(((result as any)?.data)).toEqual({
        emailNotifications: false,
        notificationPreferences: {
          reportCompletion: true,
          scheduledReports: true,
          systemAlerts: false,
          weeklyDigest: true,
          notificationTime: '09:00'
        }
      });
    });

    it('should handle getUserPreferences failure when creating defaults', async () => {
      // First query returns empty
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      
      // Mock getUserPreferences to fail
      const getUserPreferencesSpy = jest.spyOn(userPreferencesService, 'getUserPreferences')
        .mockResolvedValueOnce({
          success: false,
          error: {
            code: 'PREFERENCES_FETCH_ERROR',
            message: 'Failed to fetch user preferences'
          }
        });

      const result = await userPreferencesService.getNotificationPreferences(123);

      expect(result.success).toBe(false);
      expect(result.error).toEqual({
        code: 'PREFERENCES_FETCH_ERROR',
        message: 'Failed to fetch user preferences'
      });
      
      getUserPreferencesSpy.mockRestore();
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Database query failed');
      mockPool.query.mockRejectedValueOnce(dbError);

      const result = await userPreferencesService.getNotificationPreferences(123);

      expect(result.success).toBe(false);
      expect(result.error).toEqual({
        code: 'NOTIFICATION_PREFERENCES_FETCH_ERROR',
        message: 'Failed to fetch notification preferences'
      });
      expect(logger.error).toHaveBeenCalledWith('Error getting notification preferences:', dbError);
    });
  });

  describe('mapRowToPreferences', () => {
    it('should correctly map database row to UserPreferences object', () => {
      const mockRow = createMockPreferencesRow();
      
      // Access private method through any type
      const result = (userPreferencesService as any).mapRowToPreferences(mockRow);
      
      expect(result).toEqual(createExpectedPreferences());
    });

    it('should handle null notification_preferences with default values', () => {
      const mockRow = createMockPreferencesRow({
        notification_preferences: null
      });
      
      const result = (userPreferencesService as any).mapRowToPreferences(mockRow);
      
      expect(result.notificationPreferences).toEqual({
        reportCompletion: true,
        scheduledReports: true,
        systemAlerts: false,
        weeklyDigest: true,
        notificationTime: '09:00'
      });
    });

    it('should preserve existing notification_preferences when not null', () => {
      const customNotificationPrefs = {
        reportCompletion: false,
        scheduledReports: false,
        systemAlerts: true,
        weeklyDigest: false,
        notificationTime: '18:00'
      };
      const mockRow = createMockPreferencesRow({
        notification_preferences: customNotificationPrefs
      });
      
      const result = (userPreferencesService as any).mapRowToPreferences(mockRow);
      
      expect(result.notificationPreferences).toEqual(customNotificationPrefs);
    });
  });

  describe('User Isolation', () => {
    it('should only fetch preferences for the specified user', async () => {
      const mockRow = createMockPreferencesRow({ user_id: 123 });
      mockPool.query.mockResolvedValueOnce({
        rows: [mockRow]
      });

      await userPreferencesService.getUserPreferences(123);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE user_id = $1'),
        [123]
      );
    });

    it('should only update preferences for the specified user', async () => {
      jest.spyOn(userPreferencesService, 'getUserPreferences')
        .mockResolvedValue({
          success: true,
          data: createExpectedPreferences()
        });

      const updatedRow = createMockPreferencesRow({ user_id: 456 });
      mockPool.query.mockResolvedValueOnce({
        rows: [updatedRow]
      });

      const updates: UpdateUserPreferencesDto = { theme: 'dark' };
      await userPreferencesService.updateUserPreferences(456, updates);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE user_id = $'),
        expect.arrayContaining([456])
      );
    });

    it('should only fetch notification preferences for the specified user', async () => {
      const mockRow = {
        email_notifications: true,
        notification_preferences: { reportCompletion: true }
      };
      mockPool.query.mockResolvedValueOnce({
        rows: [mockRow]
      });

      await userPreferencesService.getNotificationPreferences(789);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE user_id = $1'),
        [789]
      );
    });
  });

  describe('Concurrent Updates', () => {
    it('should handle concurrent preference updates', async () => {
      const getUserPreferencesSpy = jest.spyOn(userPreferencesService, 'getUserPreferences')
        .mockResolvedValue({
          success: true,
          data: createExpectedPreferences()
        });

      // Simulate two concurrent updates
      const updates1: UpdateUserPreferencesDto = { theme: 'dark' };
      const updates2: UpdateUserPreferencesDto = { defaultPageSize: 100 };

      // Mock successful updates
      mockPool.query
        .mockResolvedValueOnce({
          rows: [createMockPreferencesRow({ theme: 'dark' })]
        })
        .mockResolvedValueOnce({
          rows: [createMockPreferencesRow({ default_page_size: 100 })]
        });

      const [result1, result2] = await Promise.all([
        userPreferencesService.updateUserPreferences(123, updates1),
        userPreferencesService.updateUserPreferences(123, updates2)
      ]);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(getUserPreferencesSpy).toHaveBeenCalledTimes(2);
      
      getUserPreferencesSpy.mockRestore();
    });

    it('should handle concurrent notification preference merges', async () => {
      const getUserPreferencesSpy = jest.spyOn(userPreferencesService, 'getUserPreferences')
        .mockResolvedValue({
          success: true,
          data: createExpectedPreferences()
        });

      const existingPrefs = {
        reportCompletion: true,
        scheduledReports: true,
        systemAlerts: false,
        weeklyDigest: true,
        notificationTime: '09:00'
      };

      // Set up mocks for sequential calls
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ notification_preferences: existingPrefs }] })
        .mockResolvedValueOnce({
          rows: [createMockPreferencesRow({
            notification_preferences: { ...existingPrefs, systemAlerts: true }
          })]
        });

      const updates1: UpdateUserPreferencesDto = {
        notificationPreferences: { systemAlerts: true }
      };

      const result1 = await userPreferencesService.updateUserPreferences(123, updates1);

      // Set up mocks for second call
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ notification_preferences: existingPrefs }] })
        .mockResolvedValueOnce({
          rows: [createMockPreferencesRow({
            notification_preferences: { ...existingPrefs, weeklyDigest: false }
          })]
        });

      const updates2: UpdateUserPreferencesDto = {
        notificationPreferences: { weeklyDigest: false }
      };

      const result2 = await userPreferencesService.updateUserPreferences(123, updates2);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result1.data?.notificationPreferences.systemAlerts).toBe(true);
      expect(result2.data?.notificationPreferences.weeklyDigest).toBe(false);
      
      getUserPreferencesSpy.mockRestore();
    });
  });

  describe('Invalid Preference Values', () => {
    it('should accept valid preference values', async () => {
      const getUserPreferencesSpy = jest.spyOn(userPreferencesService, 'getUserPreferences')
        .mockResolvedValue({
          success: true,
          data: createExpectedPreferences()
        });

      const validUpdates: UpdateUserPreferencesDto = {
        defaultExportFormat: 'pdf',
        defaultPageSize: 25,
        timezone: 'America/New_York',
        dateFormat: 'DD/MM/YYYY',
        theme: 'dark',
        emailNotifications: false,
        notificationPreferences: {
          reportCompletion: false,
          scheduledReports: true,
          systemAlerts: true,
          weeklyDigest: false,
          notificationTime: '14:30'
        },
        preferences: { customKey: 'customValue' }
      };

      // Mock the notification preferences query first
      mockPool.query.mockResolvedValueOnce({
        rows: [{ notification_preferences: {
          reportCompletion: true,
          scheduledReports: true,
          systemAlerts: false,
          weeklyDigest: true,
          notificationTime: '09:00'
        }}]
      });

      const updatedRow = createMockPreferencesRow({
        default_export_format: 'pdf',
        default_page_size: 25,
        timezone: 'America/New_York',
        date_format: 'DD/MM/YYYY',
        theme: 'dark',
        email_notifications: false,
        notification_preferences: {
          reportCompletion: false,
          scheduledReports: true,
          systemAlerts: true,
          weeklyDigest: false,
          notificationTime: '14:30'
        },
        preferences: { customKey: 'customValue' }
      });
      mockPool.query.mockResolvedValueOnce({
        rows: [updatedRow]
      });

      const result = await userPreferencesService.updateUserPreferences(123, validUpdates);

      expect(result.success).toBe(true);
      expect(((result as any)?.data)?.defaultExportFormat).toBe('pdf');
      expect(((result as any)?.data)?.defaultPageSize).toBe(25);
      expect(((result as any)?.data)?.timezone).toBe('America/New_York');
      expect(((result as any)?.data)?.dateFormat).toBe('DD/MM/YYYY');
      expect(((result as any)?.data)?.theme).toBe('dark');
      expect(((result as any)?.data)?.emailNotifications).toBe(false);
      expect(((result as any)?.data)?.preferences).toEqual({ customKey: 'customValue' });
      
      getUserPreferencesSpy.mockRestore();
    });

    it('should handle potentially problematic values in custom preferences', async () => {
      jest.spyOn(userPreferencesService, 'getUserPreferences')
        .mockResolvedValue({
          success: true,
          data: createExpectedPreferences()
        });

      const problematicPrefs = {
        null_value: null,
        // undefined_value: undefined, // undefined values don't survive JSON serialization
        empty_string: '',
        zero: 0,
        false_boolean: false,
        nested_object: { deep: { value: 'test' } },
        array_value: [1, 2, 3],
        special_chars: '!@#$%^&*()_+-=[]{}|;:,.<>?'
      };

      const updates: UpdateUserPreferencesDto = {
        preferences: problematicPrefs
      };

      const updatedRow = createMockPreferencesRow({
        preferences: problematicPrefs
      });
      mockPool.query.mockResolvedValueOnce({
        rows: [updatedRow]
      });

      const result = await userPreferencesService.updateUserPreferences(123, updates);

      expect(result.success).toBe(true);
      expect(((result as any)?.data)?.preferences).toEqual(problematicPrefs);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('preferences = $1'),
        expect.arrayContaining([JSON.stringify(problematicPrefs), 123])
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle extremely large page sizes', async () => {
      jest.spyOn(userPreferencesService, 'getUserPreferences')
        .mockResolvedValue({
          success: true,
          data: createExpectedPreferences()
        });

      const updates: UpdateUserPreferencesDto = {
        defaultPageSize: 999999
      };

      const updatedRow = createMockPreferencesRow({
        default_page_size: 999999
      });
      mockPool.query.mockResolvedValueOnce({
        rows: [updatedRow]
      });

      const result = await userPreferencesService.updateUserPreferences(123, updates);

      expect(result.success).toBe(true);
      expect(((result as any)?.data)?.defaultPageSize).toBe(999999);
    });

    it('should handle empty string values', async () => {
      jest.spyOn(userPreferencesService, 'getUserPreferences')
        .mockResolvedValue({
          success: true,
          data: createExpectedPreferences()
        });

      const updates: UpdateUserPreferencesDto = {
        defaultExportFormat: '',
        timezone: '',
        dateFormat: '',
        theme: ''
      };

      const updatedRow = createMockPreferencesRow({
        default_export_format: '',
        timezone: '',
        date_format: '',
        theme: ''
      });
      mockPool.query.mockResolvedValueOnce({
        rows: [updatedRow]
      });

      const result = await userPreferencesService.updateUserPreferences(123, updates);

      expect(result.success).toBe(true);
      expect(((result as any)?.data)?.defaultExportFormat).toBe('');
      expect(((result as any)?.data)?.timezone).toBe('');
      expect(((result as any)?.data)?.dateFormat).toBe('');
      expect(((result as any)?.data)?.theme).toBe('');
    });

    it('should handle very long strings in preferences', async () => {
      jest.spyOn(userPreferencesService, 'getUserPreferences')
        .mockResolvedValue({
          success: true,
          data: createExpectedPreferences()
        });

      const longString = 'a'.repeat(10000);
      const updates: UpdateUserPreferencesDto = {
        preferences: {
          longValue: longString
        }
      };

      const updatedRow = createMockPreferencesRow({
        preferences: { longValue: longString }
      });
      mockPool.query.mockResolvedValueOnce({
        rows: [updatedRow]
      });

      const result = await userPreferencesService.updateUserPreferences(123, updates);

      expect(result.success).toBe(true);
      expect(((result as any)?.data)?.preferences?.longValue).toBe(longString);
    });
  });
});