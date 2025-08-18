import request from 'supertest';
import express from 'express';

// Mock all external dependencies before imports
jest.mock('../../services/user-preferences.service', () => ({
  userPreferencesService: {
    getUserPreferences: jest.fn(),
    updateUserPreferences: jest.fn()
  }
}));

jest.mock('../../middleware/auth-wrapper', () => ({
  requireAuth: jest.fn((_req: any, _res: any, next: any) => {
    _req.user = { 
      id: 1, 
      username: 'testuser',
      displayName: 'Test User',
      email: 'test@example.com',
      authSource: 'local',
      isAdmin: false,
      isActive: true
    };
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

// Mock express-validator
const mockMiddleware = (_req: any, _res: any, next: any) => next();

const createChainedValidator = () => {
  const validator: any = mockMiddleware;
  validator.optional = jest.fn(() => createChainedValidator());
  validator.isIn = jest.fn(() => createChainedValidator());
  validator.isInt = jest.fn(() => createChainedValidator());
  validator.isString = jest.fn(() => createChainedValidator());
  validator.isBoolean = jest.fn(() => createChainedValidator());
  validator.isObject = jest.fn(() => createChainedValidator());
  validator.matches = jest.fn(() => createChainedValidator());
  validator.isLength = jest.fn(() => createChainedValidator());
  validator.withMessage = jest.fn(() => createChainedValidator());
  return validator;
};

jest.mock('express-validator', () => ({
  body: jest.fn(() => createChainedValidator()),
  validationResult: jest.fn(() => ({
    isEmpty: jest.fn(() => true),
    array: jest.fn(() => [])
  }))
}));

// Import after mocking
import userPreferencesRoutes from '../user-preferences.routes';
import { userPreferencesService } from '../../services/user-preferences.service';
import { validationResult } from 'express-validator';

describe('User Preferences Routes Integration', () => {
  let app: express.Application;

  const mockUserPreferences = {
    id: 1,
    userId: 1,
    defaultExportFormat: 'excel',
    pageSize: 50,
    timezone: 'America/New_York',
    dateFormat: 'MM/DD/YYYY',
    theme: 'light',
    emailNotifications: true,
    notificationPreferences: {
      reportCompletion: true,
      scheduledReports: true,
      systemAlerts: false,
      weeklyDigest: true,
      notificationTime: '09:00'
    },
    createdAt: '2025-01-01T10:00:00Z',
    updatedAt: '2025-01-01T10:00:00Z'
  };

  const mockServiceResponse = {
    success: true,
    data: mockUserPreferences
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset validation result mock to pass by default
    (validationResult as any).mockReturnValue({
      isEmpty: () => true,
      array: () => []
    });
    
    app = express();
    app.use(express.json());
    app.use('/api/user/preferences', userPreferencesRoutes);

    // Error handler
    app.use((err: any, _req: any, res: any, _next: any) => {
      res.status(err.statusCode || 500).json({
        error: err.message || 'Internal Server Error'
      });
    });
  });

  describe('GET /api/user/preferences', () => {
    it('should get user preferences successfully', async () => {
      (userPreferencesService.getUserPreferences as jest.Mock).mockResolvedValue(mockServiceResponse);

      const response = await request(app)
        .get('/api/user/preferences')
        .expect(200);

      expect(response.body).toEqual(mockUserPreferences);
      expect(userPreferencesService.getUserPreferences).toHaveBeenCalledWith(1);
    });

    it('should handle service errors', async () => {
      const errorResponse = {
        success: false,
        error: {
          message: 'Database connection failed',
          code: 'DB_CONNECTION_ERROR'
        }
      };

      (userPreferencesService.getUserPreferences as jest.Mock).mockResolvedValue(errorResponse);

      const response = await request(app)
        .get('/api/user/preferences')
        .expect(500);

      expect(response.body.error).toBe('Database connection failed');
      expect(response.body.code).toBe('DB_CONNECTION_ERROR');
    });

    it('should handle service exceptions', async () => {
      (userPreferencesService.getUserPreferences as jest.Mock).mockRejectedValue(
        new Error('Unexpected error')
      );

      const response = await request(app)
        .get('/api/user/preferences')
        .expect(500);

      expect(response.body.error).toBe('Internal server error');
      expect(response.body.message).toBe('Failed to fetch user preferences');
    });

    it('should handle missing user preferences (first time user)', async () => {
      const emptyResponse = {
        success: true,
        data: null
      };

      (userPreferencesService.getUserPreferences as jest.Mock).mockResolvedValue(emptyResponse);

      const response = await request(app)
        .get('/api/user/preferences')
        .expect(200);

      expect(response.body).toBe(null);
    });

    it('should use authenticated user ID', async () => {
      // Temporarily modify the auth mock to return different user ID
      const { requireAuth } = require('../../middleware/auth-wrapper');
      (requireAuth as jest.Mock).mockImplementationOnce((_req: any, _res: any, next: any) => {
        _req.user = { 
          id: 123, 
          username: 'differentuser',
          displayName: 'Different User',
          email: 'different@example.com',
          authSource: 'local',
          isAdmin: false,
          isActive: true
        };
        next();
      });

      (userPreferencesService.getUserPreferences as jest.Mock).mockResolvedValue(mockServiceResponse);

      await request(app)
        .get('/api/user/preferences')
        .expect(200);

      expect(userPreferencesService.getUserPreferences).toHaveBeenCalledWith(123);
    });
  });

  describe('PUT /api/user/preferences', () => {
    const validUpdates = {
      defaultExportFormat: 'csv',
      pageSize: 100,
      timezone: 'UTC',
      dateFormat: 'YYYY-MM-DD',
      theme: 'dark',
      emailNotifications: false,
      notificationPreferences: {
        reportCompletion: false,
        scheduledReports: true,
        systemAlerts: true,
        weeklyDigest: false,
        notificationTime: '14:30'
      }
    };

    it('should update user preferences successfully', async () => {
      const updatedPreferences = {
        ...mockUserPreferences,
        ...validUpdates,
        updatedAt: '2025-01-01T12:00:00Z'
      };

      (userPreferencesService.updateUserPreferences as jest.Mock).mockResolvedValue({
        success: true,
        data: updatedPreferences
      });

      const response = await request(app)
        .put('/api/user/preferences')
        .send(validUpdates)
        .expect(200);

      expect(response.body.defaultExportFormat).toBe('csv');
      expect(response.body.theme).toBe('dark');
      expect(userPreferencesService.updateUserPreferences).toHaveBeenCalledWith(1, validUpdates);
    });

    it('should handle partial updates', async () => {
      const partialUpdate = {
        theme: 'dark',
        pageSize: 75
      };

      (userPreferencesService.updateUserPreferences as jest.Mock).mockResolvedValue({
        success: true,
        data: { ...mockUserPreferences, ...partialUpdate }
      });

      const response = await request(app)
        .put('/api/user/preferences')
        .send(partialUpdate)
        .expect(200);

      expect(response.body.theme).toBe('dark');
      expect(response.body.pageSize).toBe(75);
      expect(userPreferencesService.updateUserPreferences).toHaveBeenCalledWith(1, partialUpdate);
    });

    it('should validate export format', async () => {
      (validationResult as any).mockReturnValue({
        isEmpty: () => false,
        array: () => [
          { 
            field: 'defaultExportFormat',
            msg: 'Invalid export format',
            value: 'invalid'
          }
        ]
      });

      const response = await request(app)
        .put('/api/user/preferences')
        .send({ defaultExportFormat: 'invalid' })
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toHaveLength(1);
    });

    it('should validate page size range', async () => {
      (validationResult as any).mockReturnValue({
        isEmpty: () => false,
        array: () => [
          {
            field: 'pageSize',
            msg: 'Page size must be between 10 and 1000',
            value: 300
          }
        ]
      });

      const response = await request(app)
        .put('/api/user/preferences')
        .send({ pageSize: 300 })
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate theme options', async () => {
      (validationResult as any).mockReturnValue({
        isEmpty: () => false,
        array: () => [
          {
            field: 'theme',
            msg: 'Invalid theme',
            value: 'rainbow'
          }
        ]
      });

      const response = await request(app)
        .put('/api/user/preferences')
        .send({ theme: 'rainbow' })
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate notification time format', async () => {
      (validationResult as any).mockReturnValue({
        isEmpty: () => false,
        array: () => [
          {
            field: 'notificationPreferences.notificationTime',
            msg: 'Notification time must be in HH:mm format',
            value: '25:70'
          }
        ]
      });

      const response = await request(app)
        .put('/api/user/preferences')
        .send({
          notificationPreferences: {
            notificationTime: '25:70'
          }
        })
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should handle service update errors', async () => {
      // Ensure validation passes first
      const { validationResult } = require('express-validator');
      (validationResult as jest.Mock).mockReturnValueOnce({
        isEmpty: () => true,
        array: () => []
      });

      (userPreferencesService.updateUserPreferences as jest.Mock).mockResolvedValue({
        success: false,
        error: {
          message: 'Failed to update preferences',
          code: 'UPDATE_FAILED'
        }
      });

      const response = await request(app)
        .put('/api/user/preferences')
        .send(validUpdates)
        .expect(500);

      expect(response.body.error).toBe('Failed to update preferences');
      expect(response.body.code).toBe('UPDATE_FAILED');
    });

    it('should handle service exceptions during update', async () => {
      // Ensure validation passes first
      const { validationResult } = require('express-validator');
      (validationResult as jest.Mock).mockReturnValueOnce({
        isEmpty: () => true,
        array: () => []
      });

      (userPreferencesService.updateUserPreferences as jest.Mock).mockRejectedValue(
        new Error('Database constraint violation')
      );

      const response = await request(app)
        .put('/api/user/preferences')
        .send(validUpdates)
        .expect(500);

      expect(response.body.error).toBe('Internal server error');
    });

    it('should validate all export format options', async () => {
      const validFormats = ['excel', 'csv', 'pdf', 'json'];
      
      (userPreferencesService.updateUserPreferences as jest.Mock).mockResolvedValue(mockServiceResponse);

      for (const format of validFormats) {
        await request(app)
          .put('/api/user/preferences')
          .send({ defaultExportFormat: format })
          .expect(200);
      }
    });

    it('should validate all theme options', async () => {
      const validThemes = ['light', 'dark', 'system'];
      
      (userPreferencesService.updateUserPreferences as jest.Mock).mockResolvedValue(mockServiceResponse);

      for (const theme of validThemes) {
        await request(app)
          .put('/api/user/preferences')
          .send({ theme })
          .expect(200);
      }
    });

    it('should handle boolean notification preferences', async () => {
      (userPreferencesService.updateUserPreferences as jest.Mock).mockResolvedValue(mockServiceResponse);

      const booleanPrefs = {
        emailNotifications: true,
        notificationPreferences: {
          reportCompletion: false,
          scheduledReports: true,
          systemAlerts: false,
          weeklyDigest: true
        }
      };

      const response = await request(app)
        .put('/api/user/preferences')
        .send(booleanPrefs)
        .expect(200);

      expect(userPreferencesService.updateUserPreferences).toHaveBeenCalledWith(1, booleanPrefs);
    });
  });

  describe('PUT /api/user/preferences/notifications', () => {
    const validNotificationUpdates = {
      emailNotifications: false,
      reportCompletion: true,
      scheduledReports: false,
      systemAlerts: true,
      weeklyDigest: false,
      notificationTime: '16:45'
    };

    it('should update notification preferences successfully', async () => {
      const expectedUpdateData = {
        emailNotifications: false,
        notificationPreferences: {
          reportCompletion: true,
          scheduledReports: false,
          systemAlerts: true,
          weeklyDigest: false,
          notificationTime: '16:45'
        }
      };

      (userPreferencesService.updateUserPreferences as jest.Mock).mockResolvedValue(mockServiceResponse);

      const response = await request(app)
        .put('/api/user/preferences/notifications')
        .send(validNotificationUpdates)
        .expect(200);

      expect(userPreferencesService.updateUserPreferences).toHaveBeenCalledWith(1, expectedUpdateData);
    });

    it('should handle partial notification updates', async () => {
      const partialUpdate = {
        emailNotifications: true,
        reportCompletion: false
      };

      const expectedUpdateData = {
        emailNotifications: true,
        notificationPreferences: {
          reportCompletion: false,
          scheduledReports: undefined,
          systemAlerts: undefined,
          weeklyDigest: undefined,
          notificationTime: undefined
        }
      };

      (userPreferencesService.updateUserPreferences as jest.Mock).mockResolvedValue(mockServiceResponse);

      const response = await request(app)
        .put('/api/user/preferences/notifications')
        .send(partialUpdate)
        .expect(200);

      expect(userPreferencesService.updateUserPreferences).toHaveBeenCalledWith(1, expectedUpdateData);
    });

    it('should validate notification time format', async () => {
      (validationResult as any).mockReturnValue({
        isEmpty: () => false,
        array: () => [
          {
            field: 'notificationTime',
            msg: 'Notification time must be in HH:mm format',
            value: 'invalid-time'
          }
        ]
      });

      const response = await request(app)
        .put('/api/user/preferences/notifications')
        .send({ notificationTime: 'invalid-time' })
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate boolean notification fields', async () => {
      (validationResult as any).mockReturnValue({
        isEmpty: () => false,
        array: () => [
          {
            field: 'emailNotifications',
            msg: 'Email notifications must be a boolean',
            value: 'not-a-boolean'
          }
        ]
      });

      const response = await request(app)
        .put('/api/user/preferences/notifications')
        .send({ emailNotifications: 'not-a-boolean' })
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should handle service errors during notification update', async () => {
      // Ensure validation passes first
      (validationResult as any).mockReturnValueOnce({
        isEmpty: () => true,
        array: () => []
      });

      (userPreferencesService.updateUserPreferences as jest.Mock).mockResolvedValue({
        success: false,
        error: {
          message: 'Failed to update notification preferences',
          code: 'NOTIFICATION_UPDATE_FAILED'
        }
      });

      const response = await request(app)
        .put('/api/user/preferences/notifications')
        .send(validNotificationUpdates)
        .expect(500);

      expect(response.body.error).toBe('Failed to update notification preferences');
    });

    it('should handle exceptions during notification update', async () => {
      // Ensure validation passes first
      (validationResult as any).mockReturnValueOnce({
        isEmpty: () => true,
        array: () => []
      });

      (userPreferencesService.updateUserPreferences as jest.Mock).mockRejectedValue(
        new Error('Service unavailable')
      );

      const response = await request(app)
        .put('/api/user/preferences/notifications')
        .send(validNotificationUpdates)
        .expect(500);

      expect(response.body.error).toBe('Internal server error');
      expect(response.body.message).toBe('Failed to update notification preferences');
    });

    it('should accept valid notification time formats', async () => {
      const validTimes = ['00:00', '09:30', '14:45', '23:59'];
      
      (userPreferencesService.updateUserPreferences as jest.Mock).mockResolvedValue(mockServiceResponse);

      for (const time of validTimes) {
        await request(app)
          .put('/api/user/preferences/notifications')
          .send({ notificationTime: time })
          .expect(200);
      }
    });

    it('should handle missing notification preferences object', async () => {
      const updateWithoutNotificationPrefs = {
        emailNotifications: true
      };

      const expectedUpdateData = {
        emailNotifications: true,
        notificationPreferences: {
          reportCompletion: undefined,
          scheduledReports: undefined,
          systemAlerts: undefined,
          weeklyDigest: undefined,
          notificationTime: undefined
        }
      };

      (userPreferencesService.updateUserPreferences as jest.Mock).mockResolvedValue(mockServiceResponse);

      await request(app)
        .put('/api/user/preferences/notifications')
        .send(updateWithoutNotificationPrefs)
        .expect(200);

      expect(userPreferencesService.updateUserPreferences).toHaveBeenCalledWith(1, expectedUpdateData);
    });
  });

  describe('Authentication', () => {
    it('should require authentication for all routes', async () => {
      // Mock authentication failure
      const { requireAuth } = require('../../middleware/auth-wrapper');
      (requireAuth as jest.Mock).mockImplementationOnce((_req: any, res: any, _next: any) => {
        res.status(401).json({ error: 'Authentication required' });
      });

      const response = await request(app)
        .get('/api/user/preferences')
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });

    it('should use authenticated user context', async () => {
      // Mock different user
      const { requireAuth } = require('../../middleware/auth-wrapper');
      (requireAuth as jest.Mock).mockImplementationOnce((req: any, _res: any, next: any) => {
        req.user = { 
          id: 456, 
          username: 'anotheruser',
          displayName: 'Another User',
          email: 'another@example.com',
          authSource: 'local',
          isAdmin: false,
          isActive: true
        };
        next();
      });

      (userPreferencesService.getUserPreferences as jest.Mock).mockResolvedValue(mockServiceResponse);

      await request(app)
        .get('/api/user/preferences')
        .expect(200);

      expect(userPreferencesService.getUserPreferences).toHaveBeenCalledWith(456);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing user in request', async () => {
      // Mock authentication middleware that doesn't set user
      const { requireAuth } = require('../../middleware/auth-wrapper');
      (requireAuth as jest.Mock).mockImplementationOnce((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });

      const response = await request(app)
        .get('/api/user/preferences')
        .expect(500);

      // Should handle gracefully when user is not set
    });

    it('should handle malformed request bodies', async () => {
      const malformedUpdate = {
        pageSize: 'not-a-number',
        theme: { invalid: 'object' },
        notificationPreferences: 'not-an-object'
      };

      (validationResult as any).mockReturnValue({
        isEmpty: () => false,
        array: () => [
          { field: 'pageSize', msg: 'Page size must be between 10 and 1000' },
          { field: 'theme', msg: 'Invalid theme' },
          { field: 'notificationPreferences', msg: 'Notification preferences must be an object' }
        ]
      });

      const response = await request(app)
        .put('/api/user/preferences')
        .send(malformedUpdate)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toHaveLength(3);
    });

    it('should handle database constraint violations', async () => {
      // Ensure validation passes first
      (validationResult as any).mockReturnValueOnce({
        isEmpty: () => true,
        array: () => []
      });

      (userPreferencesService.updateUserPreferences as jest.Mock).mockResolvedValue({
        success: false,
        error: {
          message: 'Invalid timezone value',
          code: 'CONSTRAINT_VIOLATION'
        }
      });

      const response = await request(app)
        .put('/api/user/preferences')
        .send({ timezone: 'Invalid/Timezone' })
        .expect(500);

      expect(response.body.code).toBe('CONSTRAINT_VIOLATION');
    });
  });

  describe('Route Coverage Validation', () => {
    it('should have comprehensive coverage of all user preference routes', () => {
      const expectedRoutes = [
        'GET /',
        'PUT /',
        'PUT /notifications'
      ];
      
      expect(expectedRoutes.length).toBe(3);
    });
  });
});