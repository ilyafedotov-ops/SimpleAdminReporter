/**
 * Comprehensive unit tests for ScheduledReportsController
 * Tests all endpoints, error handling, authorization, validation, and business logic
 */

// import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { scheduledReportsController, createScheduleValidation, updateScheduleValidation } from './scheduled-reports.controller';
import { db } from '@/config/database';
import { logger } from '@/utils/logger';
import { calculateNextRun, validateScheduleConfig } from '@/utils/schedule';

// Mock all dependencies
jest.mock('@/config/database');
jest.mock('@/utils/logger');
jest.mock('@/utils/schedule');

// Mock express-validator
jest.mock('express-validator', () => ({
  validationResult: jest.fn(() => ({
    isEmpty: () => true,
    array: () => []
  })),
  body: jest.fn(() => ({
    isLength: jest.fn().mockReturnThis(),
    withMessage: jest.fn().mockReturnThis(),
    trim: jest.fn().mockReturnThis(),
    escape: jest.fn().mockReturnThis(),
    optional: jest.fn().mockReturnThis(),
    isObject: jest.fn().mockReturnThis(),
    isArray: jest.fn().mockReturnThis(),
    isBoolean: jest.fn().mockReturnThis(),
    isIn: jest.fn().mockReturnThis(),
    isUUID: jest.fn().mockReturnThis(),
    matches: jest.fn().mockReturnThis(),
    isInt: jest.fn().mockReturnThis(),
    isEmail: jest.fn().mockReturnThis()
  })),
  param: jest.fn(() => ({
    isUUID: jest.fn().mockReturnThis(),
    withMessage: jest.fn().mockReturnThis()
  })),
  query: jest.fn(() => ({
    optional: jest.fn().mockReturnThis(),
    isObject: jest.fn().mockReturnThis(),
    withMessage: jest.fn().mockReturnThis(),
    isIn: jest.fn().mockReturnThis()
  }))
}));

jest.mock('@/middleware/error.middleware', () => ({
  asyncHandler: (fn: any) => fn, // Return the function as-is for synchronous testing
  createError: jest.fn((message, statusCode) => {
    const error = new Error(message) as any;
    error.statusCode = statusCode;
    return error;
  })
}));

describe('ScheduledReportsController', () => {
  // Mock users
  const mockUser = {
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
    role: 'user',
    isAdmin: false
  };

  // Mock admin user reserved for admin-specific tests
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const mockAdminUser = {
    id: 2,
    username: 'admin',
    email: 'admin@example.com',
    role: 'admin'
  };

  // Mock schedule data
  const mockSchedule = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'Daily User Report',
    description: 'Daily report of inactive users',
    template_id: '660e8400-e29b-41d4-a716-446655440001',
    custom_template_id: null,
    parameters: { days: 30 },
    schedule_config: {
      frequency: 'daily',
      time: '09:00'
    },
    recipients: ['admin@example.com'],
    export_format: 'excel',
    is_active: true,
    next_run: new Date('2025-08-05T09:00:00.000Z'),
    created_by: 1,
    created_at: new Date('2025-08-01T10:00:00.000Z'),
    updated_at: new Date('2025-08-01T10:00:00.000Z'),
    // Joined data from query
    template_name: 'Inactive Users',
    template_category: 'ad',
    custom_template_name: null,
    custom_template_source: null,
    created_by_name: 'Test User'
  };

  const mockWeeklySchedule = {
    ...mockSchedule,
    id: '660e8400-e29b-41d4-a716-446655440002',
    name: 'Weekly Report',
    schedule_config: {
      frequency: 'weekly',
      time: '10:00',
      dayOfWeek: 1 // Monday
    }
  };

  // Mock monthly schedule reserved for monthly frequency tests
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const mockMonthlySchedule = {
    ...mockSchedule,
    id: '770e8400-e29b-41d4-a716-446655440003',
    name: 'Monthly Report',
    schedule_config: {
      frequency: 'monthly',
      time: '11:00',
      dayOfMonth: 1
    }
  };

  // Mock execution history
  const mockExecution = {
    id: 1,
    report_name: 'Daily User Report',
    status: 'completed',
    row_count: 25,
    execution_time_ms: 1500,
    error_message: null,
    started_at: new Date('2025-08-04T09:00:00.000Z'),
    completed_at: new Date('2025-08-04T09:00:01.500Z')
  };

  // Mock request and response objects
  const createMockRequest = (overrides: any = {}) => ({
    query: {},
    body: {},
    params: {},
    user: mockUser,
    ...overrides
  });

  const createMockResponse = () => {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.send = jest.fn().mockReturnValue(res);
    return res;
  };

  const mockNext = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mock for calculateNextRun
    (calculateNextRun as jest.Mock).mockReturnValue(new Date('2025-08-05T09:00:00.000Z'));
    
    // Default mock for validateScheduleConfig
    (validateScheduleConfig as jest.Mock).mockReturnValue({ valid: true });
    
    // Default mock for validation - most tests expect validation to pass
    (validationResult as jest.MockedFunction<typeof validationResult>).mockReturnValue({
      isEmpty: () => true,
      array: () => []
    } as any);
  });

  describe('getSchedules', () => {

    it('should return all scheduled reports for the current user', async () => {
      const req = createMockRequest();
      const res = createMockResponse();
      
      (db.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ total: '2' }] }) // Count query
        .mockResolvedValueOnce({ rows: [mockSchedule, mockWeeklySchedule] }); // Data query

      await scheduledReportsController.getSchedules(req as any, res as any, mockNext);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          schedules: [mockSchedule, mockWeeklySchedule],
          pagination: {
            page: 1,
            pageSize: 20,
            totalCount: 2,
            totalPages: 1
          }
        }
      });
    });

    it('should filter by active status', async () => {
      const req = createMockRequest({ query: { isActive: 'true' } });
      const res = createMockResponse();
      
      (db.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ total: '2' }] }) // Count query
        .mockResolvedValueOnce({ rows: [mockSchedule, mockWeeklySchedule] }); // Data query

      await scheduledReportsController.getSchedules(req as any, res as any, mockNext);

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE rs.created_by = $1 AND rs.is_active = $2'),
        [mockUser.id, true]
      );
    });

    it('should handle pagination parameters', async () => {
      const req = createMockRequest({ query: { page: '2', pageSize: '10' } });
      const res = createMockResponse();
      
      (db.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ total: '2' }] }) // Count query
        .mockResolvedValueOnce({ rows: [mockSchedule, mockWeeklySchedule] }); // Data query

      await scheduledReportsController.getSchedules(req as any, res as any, mockNext);

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $2 OFFSET $3'),
        [mockUser.id, '10', 10] // page 2, pageSize 10, offset = (2-1)*10 = 10
      );
    });

    it('should require authentication', async () => {
      const req = createMockRequest({ user: null });
      const res = createMockResponse();

      await scheduledReportsController.getSchedules(req as any, res as any, mockNext);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Unauthorized'
      });
    });

    it('should handle database errors', async () => {
      jest.clearAllMocks();
      const dbError = new Error('Database error');
      (db.query as jest.Mock).mockRejectedValue(dbError);
      
      const req = createMockRequest();
      const res = createMockResponse();

      await scheduledReportsController.getSchedules(req as any, res as any, mockNext);

      expect(logger.error).toHaveBeenCalledWith('Error fetching scheduled reports:', dbError);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to fetch scheduled reports'
      });
    });
  });

  describe('getSchedule', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      (db.query as jest.Mock).mockResolvedValue({ rows: [mockSchedule] });
    });

    it('should return a specific scheduled report', async () => {
      const req = createMockRequest({ params: { scheduleId: mockSchedule.id } });
      const res = createMockResponse();

      await scheduledReportsController.getSchedule(req as any, res as any, mockNext);

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE rs.id = $1 AND rs.created_by = $2'),
        [mockSchedule.id, mockUser.id]
      );

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockSchedule
      });
    });

    it('should return 404 for non-existent schedule', async () => {
      jest.clearAllMocks();
      (db.query as jest.Mock).mockResolvedValue({ rows: [] });
      
      const req = createMockRequest({ params: { scheduleId: 'non-existent' } });
      const res = createMockResponse();

      await scheduledReportsController.getSchedule(req as any, res as any, mockNext);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Scheduled report not found'
      });
    });

    it('should require authentication', async () => {
      const req = createMockRequest({ 
        params: { scheduleId: mockSchedule.id },
        user: null 
      });
      const res = createMockResponse();

      await scheduledReportsController.getSchedule(req as any, res as any, mockNext);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Unauthorized'
      });
    });

    it('should handle database errors', async () => {
      (db.query as jest.Mock).mockRejectedValue(new Error('Database error'));
      
      const req = createMockRequest({ params: { scheduleId: mockSchedule.id } });
      const res = createMockResponse();

      await scheduledReportsController.getSchedule(req as any, res as any, mockNext);

      expect(logger.error).toHaveBeenCalledWith('Error fetching scheduled report:', expect.any(Error));
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('createSchedule', () => {
    const validScheduleData = {
      name: 'Test Schedule',
      description: 'A test schedule',
      templateId: '660e8400-e29b-41d4-a716-446655440001',
      parameters: { days: 30 },
      scheduleConfig: {
        frequency: 'daily',
        time: '09:00'
      },
      recipients: ['test@example.com'],
      exportFormat: 'excel'
    };

    beforeEach(() => {
      jest.clearAllMocks();
      (db.query as jest.Mock).mockResolvedValue({
        rows: [{
          id: '550e8400-e29b-41d4-a716-446655440000',
          ...validScheduleData,
          created_at: new Date(),
          updated_at: new Date()
        }]
      });
    });

    it('should create a new scheduled report with template ID', async () => {
      const req = createMockRequest({ body: validScheduleData });
      const res = createMockResponse();

      await scheduledReportsController.createSchedule(req as any, res as any, mockNext);

      expect(calculateNextRun).toHaveBeenCalledWith(validScheduleData.scheduleConfig);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO report_schedules'),
        expect.arrayContaining([
          validScheduleData.name,
          validScheduleData.description,
          validScheduleData.templateId,
          null, // custom_template_id
          JSON.stringify(validScheduleData.parameters),
          JSON.stringify(validScheduleData.scheduleConfig),
          validScheduleData.recipients,
          validScheduleData.exportFormat,
          true, // is_active
          new Date('2025-08-05T09:00:00.000Z'), // next_run
          mockUser.id
        ])
      );

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          name: validScheduleData.name
        })
      });
    });

    it('should create a schedule with custom template ID', async () => {
      const customScheduleData = {
        ...validScheduleData,
        templateId: undefined,
        customTemplateId: '770e8400-e29b-41d4-a716-446655440003'
      };

      const req = createMockRequest({ body: customScheduleData });
      const res = createMockResponse();

      await scheduledReportsController.createSchedule(req as any, res as any, mockNext);

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO report_schedules'),
        expect.arrayContaining([
          customScheduleData.name,
          customScheduleData.description,
          null, // template_id
          customScheduleData.customTemplateId,
          JSON.stringify(customScheduleData.parameters),
          JSON.stringify(customScheduleData.scheduleConfig),
          customScheduleData.recipients,
          customScheduleData.exportFormat,
          true,
          new Date('2025-08-05T09:00:00.000Z'),
          mockUser.id
        ])
      );
    });

    it('should handle weekly schedule configuration', async () => {
      const weeklyScheduleData = {
        ...validScheduleData,
        scheduleConfig: {
          frequency: 'weekly',
          time: '10:00',
          dayOfWeek: 1
        }
      };

      const req = createMockRequest({ body: weeklyScheduleData });
      const res = createMockResponse();

      await scheduledReportsController.createSchedule(req as any, res as any, mockNext);

      expect(calculateNextRun).toHaveBeenCalledWith(weeklyScheduleData.scheduleConfig);
    });

    it('should handle monthly schedule configuration', async () => {
      const monthlyScheduleData = {
        ...validScheduleData,
        scheduleConfig: {
          frequency: 'monthly',
          time: '11:00',
          dayOfMonth: 15
        }
      };

      const req = createMockRequest({ body: monthlyScheduleData });
      const res = createMockResponse();

      await scheduledReportsController.createSchedule(req as any, res as any, mockNext);

      expect(calculateNextRun).toHaveBeenCalledWith(monthlyScheduleData.scheduleConfig);
    });

    it('should validate that either templateId or customTemplateId is provided', async () => {
      const invalidScheduleData = {
        ...validScheduleData,
        templateId: undefined,
        customTemplateId: undefined
      };

      const req = createMockRequest({ body: invalidScheduleData });
      const res = createMockResponse();

      await scheduledReportsController.createSchedule(req as any, res as any, mockNext);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Either templateId or customTemplateId must be provided'
      });
    });

    it('should handle validation errors', async () => {
      (validationResult as jest.MockedFunction<typeof validationResult>).mockReturnValue({
        isEmpty: () => false,
        array: () => [{ msg: 'Name is required', param: 'name' }]
      } as any);

      const req = createMockRequest({ body: {} });
      const res = createMockResponse();

      await scheduledReportsController.createSchedule(req as any, res as any, mockNext);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Validation failed',
        details: [{ msg: 'Name is required', param: 'name' }]
      });
    });

    it('should require authentication', async () => {
      jest.clearAllMocks();
      // Mock validation to pass so we can test auth
      (validationResult as jest.MockedFunction<typeof validationResult>).mockReturnValue({
        isEmpty: () => true,
        array: () => []
      } as any);

      const req = createMockRequest({ 
        body: validScheduleData,
        user: null 
      });
      const res = createMockResponse();

      await scheduledReportsController.createSchedule(req as any, res as any, mockNext);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Unauthorized'
      });
    });

    it('should use default export format if not provided', async () => {
      jest.clearAllMocks();
      (db.query as jest.Mock).mockResolvedValue({
        rows: [{
          id: '550e8400-e29b-41d4-a716-446655440000',
          ...validScheduleData,
          export_format: 'excel', // Default format should be used
          created_at: new Date(),
          updated_at: new Date()
        }]
      });

      const scheduleDataWithoutFormat = {
        ...validScheduleData,
        exportFormat: undefined
      };

      const req = createMockRequest({ body: scheduleDataWithoutFormat, user: mockUser });
      const res = createMockResponse();

      await scheduledReportsController.createSchedule(req as any, res as any, mockNext);

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO report_schedules'),
        expect.arrayContaining(['excel']) // Default format
      );
    });

    it('should handle database errors during creation', async () => {
      jest.clearAllMocks();
      (db.query as jest.Mock).mockRejectedValue(new Error('Database error'));
      
      const req = createMockRequest({ body: validScheduleData, user: mockUser });
      const res = createMockResponse();

      await scheduledReportsController.createSchedule(req as any, res as any, mockNext);

      expect(logger.error).toHaveBeenCalledWith('Error creating scheduled report:', expect.any(Error));
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to create scheduled report'
      });
    });
  });

  describe('updateSchedule', () => {
    const updateData = {
      name: 'Updated Schedule Name',
      description: 'Updated description',
      parameters: { days: 45 },
      scheduleConfig: {
        frequency: 'weekly',
        time: '10:30',
        dayOfWeek: 2
      },
      recipients: ['updated@example.com'],
      exportFormat: 'csv',
      isActive: false
    };

    beforeEach(() => {
      jest.clearAllMocks();
      (db.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockSchedule] }) // Check existing
        .mockResolvedValueOnce({ rows: [{ ...mockSchedule, ...updateData }] }); // Update
    });

    it('should update a scheduled report', async () => {
      const req = createMockRequest({ 
        params: { scheduleId: mockSchedule.id },
        body: updateData 
      });
      const res = createMockResponse();

      await scheduledReportsController.updateSchedule(req as any, res as any, mockNext);

      expect(db.query).toHaveBeenCalledWith(
        'SELECT * FROM report_schedules WHERE id = $1 AND created_by = $2',
        [mockSchedule.id, mockUser.id]
      );

      expect(calculateNextRun).toHaveBeenCalledWith(updateData.scheduleConfig);

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE report_schedules'),
        expect.arrayContaining([
          updateData.name,
          updateData.description,
          JSON.stringify(updateData.parameters),
          JSON.stringify(updateData.scheduleConfig),
          new Date('2025-08-05T09:00:00.000Z'), // next_run
          updateData.recipients,
          updateData.exportFormat,
          updateData.isActive,
          mockSchedule.id
        ])
      );

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          name: updateData.name
        })
      });
    });

    it('should update only provided fields', async () => {
      const partialUpdate = { name: 'New Name Only' };
      
      const req = createMockRequest({ 
        params: { scheduleId: mockSchedule.id },
        body: partialUpdate 
      });
      const res = createMockResponse();

      await scheduledReportsController.updateSchedule(req as any, res as any, mockNext);

      // The second call to db.query should be the UPDATE query
      expect(db.query).toHaveBeenNthCalledWith(2,
        expect.stringContaining('UPDATE report_schedules'),
        expect.arrayContaining([partialUpdate.name, mockSchedule.id])
      );
      
      // Verify the query contains the expected fields
      const updateQuery = (db.query as jest.Mock).mock.calls[1][0];
      expect(updateQuery).toContain('name = $1');
      expect(updateQuery).toContain('updated_at = CURRENT_TIMESTAMP');
      expect(updateQuery).toContain('WHERE id = $2');
    });

    it('should recalculate next run when schedule config is updated', async () => {
      const scheduleConfigUpdate = {
        scheduleConfig: {
          frequency: 'monthly',
          time: '15:00',
          dayOfMonth: 10
        }
      };

      const req = createMockRequest({ 
        params: { scheduleId: mockSchedule.id },
        body: scheduleConfigUpdate 
      });
      const res = createMockResponse();

      await scheduledReportsController.updateSchedule(req as any, res as any, mockNext);

      expect(calculateNextRun).toHaveBeenCalledWith(scheduleConfigUpdate.scheduleConfig);
    });

    it('should return 404 for non-existent schedule', async () => {
      // Reset only the db.query mock to override the beforeEach setup
      (db.query as jest.Mock).mockReset();
      (db.query as jest.Mock).mockResolvedValueOnce({ rows: [] }); // No existing schedule

      const req = createMockRequest({ 
        params: { scheduleId: '660e8400-e29b-41d4-a716-446655440002' }, // Valid UUID that doesn't exist
        body: updateData 
      });
      const res = createMockResponse();

      await scheduledReportsController.updateSchedule(req as any, res as any, mockNext);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Scheduled report not found'
      });
    });

    it('should handle validation errors', async () => {
      (validationResult as jest.MockedFunction<typeof validationResult>).mockReturnValue({
        isEmpty: () => false,
        array: () => [{ msg: 'Invalid schedule ID', param: 'scheduleId' }]
      } as any);

      const req = createMockRequest({ 
        params: { scheduleId: 'invalid-id' },
        body: updateData 
      });
      const res = createMockResponse();

      await scheduledReportsController.updateSchedule(req as any, res as any, mockNext);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Validation failed',
        details: [{ msg: 'Invalid schedule ID', param: 'scheduleId' }]
      });
    });

    it('should require authentication', async () => {
      // Reset validation to pass
      (validationResult as jest.MockedFunction<typeof validationResult>).mockReturnValue({
        isEmpty: () => true,
        array: () => []
      } as any);
      
      const req = createMockRequest({ 
        params: { scheduleId: mockSchedule.id },
        body: updateData,
        user: null 
      });
      const res = createMockResponse();

      await scheduledReportsController.updateSchedule(req as any, res as any, mockNext);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Unauthorized'
      });
    });

    it('should handle database errors during update', async () => {
      // Reset only the db.query mock to override the beforeEach setup
      (db.query as jest.Mock).mockReset();
      (db.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockSchedule] }) // Check existing succeeds
        .mockRejectedValueOnce(new Error('Database error')); // Update fails

      const req = createMockRequest({ 
        params: { scheduleId: mockSchedule.id },
        body: updateData 
      });
      const res = createMockResponse();

      await scheduledReportsController.updateSchedule(req as any, res as any, mockNext);

      expect(logger.error).toHaveBeenCalledWith('Error updating scheduled report:', expect.any(Error));
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to update scheduled report'
      });
    });
  });

  describe('deleteSchedule', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      (db.query as jest.Mock).mockResolvedValue({ rows: [{ id: mockSchedule.id }] });
    });

    it('should delete a scheduled report', async () => {
      const req = createMockRequest({ params: { scheduleId: mockSchedule.id } });
      const res = createMockResponse();

      await scheduledReportsController.deleteSchedule(req as any, res as any, mockNext);

      expect(db.query).toHaveBeenCalledWith(
        'DELETE FROM report_schedules WHERE id = $1 AND created_by = $2 RETURNING id',
        [mockSchedule.id, mockUser.id]
      );

      expect(logger.info).toHaveBeenCalledWith(`Scheduled report deleted: ${mockSchedule.id} by user ${mockUser.id}`);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Scheduled report deleted successfully'
      });
    });

    it('should return 404 for non-existent schedule', async () => {
      // Reset only the db.query mock to override the beforeEach setup
      (db.query as jest.Mock).mockReset();
      (db.query as jest.Mock).mockResolvedValue({ rows: [] });

      const req = createMockRequest({ params: { scheduleId: '660e8400-e29b-41d4-a716-446655440003' } }); // Valid UUID that doesn't exist
      const res = createMockResponse();

      await scheduledReportsController.deleteSchedule(req as any, res as any, mockNext);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Scheduled report not found'
      });
    });

    it('should require authentication', async () => {
      const req = createMockRequest({ 
        params: { scheduleId: mockSchedule.id },
        user: null 
      });
      const res = createMockResponse();

      await scheduledReportsController.deleteSchedule(req as any, res as any, mockNext);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Unauthorized'
      });
    });

    it('should handle database errors during deletion', async () => {
      // Reset only the db.query mock to override the beforeEach setup
      (db.query as jest.Mock).mockReset();
      (db.query as jest.Mock).mockRejectedValue(new Error('Database error'));

      const req = createMockRequest({ params: { scheduleId: mockSchedule.id } });
      const res = createMockResponse();

      await scheduledReportsController.deleteSchedule(req as any, res as any, mockNext);

      expect(logger.error).toHaveBeenCalledWith('Error deleting scheduled report:', expect.any(Error));
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to delete scheduled report'
      });
    });
  });

  describe('toggleSchedule', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      (db.query as jest.Mock).mockResolvedValue({ 
        rows: [{ ...mockSchedule, is_active: !mockSchedule.is_active }] 
      });
    });

    it('should toggle schedule active state', async () => {
      const req = createMockRequest({ params: { scheduleId: mockSchedule.id } });
      const res = createMockResponse();

      await scheduledReportsController.toggleSchedule(req as any, res as any, mockNext);

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE report_schedules'),
        [mockSchedule.id, mockUser.id]
      );
      
      // Verify the query contains the expected parts
      const query = (db.query as jest.Mock).mock.calls[0][0];
      expect(query).toContain('is_active = NOT is_active');
      expect(query).toContain('updated_at = CURRENT_TIMESTAMP');
      expect(query).toContain('WHERE id = $1 AND created_by = $2');

      expect(logger.info).toHaveBeenCalledWith(
        `Scheduled report toggled: ${mockSchedule.id} to ${!mockSchedule.is_active} by user ${mockUser.id}`
      );

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          is_active: !mockSchedule.is_active
        })
      });
    });

    it('should return 404 for non-existent schedule', async () => {
      // Reset only the db.query mock to override the beforeEach setup
      (db.query as jest.Mock).mockReset();
      (db.query as jest.Mock).mockResolvedValue({ rows: [] });

      const req = createMockRequest({ params: { scheduleId: '660e8400-e29b-41d4-a716-446655440004' } }); // Valid UUID that doesn't exist
      const res = createMockResponse();

      await scheduledReportsController.toggleSchedule(req as any, res as any, mockNext);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Scheduled report not found'
      });
    });

    it('should require authentication', async () => {
      const req = createMockRequest({ 
        params: { scheduleId: mockSchedule.id },
        user: null 
      });
      const res = createMockResponse();

      await scheduledReportsController.toggleSchedule(req as any, res as any, mockNext);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Unauthorized'
      });
    });

    it('should handle database errors during toggle', async () => {
      // Reset only the db.query mock to override the beforeEach setup
      (db.query as jest.Mock).mockReset();
      (db.query as jest.Mock).mockRejectedValue(new Error('Database error'));

      const req = createMockRequest({ params: { scheduleId: mockSchedule.id } });
      const res = createMockResponse();

      await scheduledReportsController.toggleSchedule(req as any, res as any, mockNext);

      expect(logger.error).toHaveBeenCalledWith('Error toggling scheduled report:', expect.any(Error));
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to toggle scheduled report'
      });
    });
  });

  describe('getScheduleHistory', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      (db.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ id: mockSchedule.id }] }) // Verify schedule ownership
        .mockResolvedValueOnce({ rows: [mockExecution] }); // Get history
    });

    it('should return schedule execution history', async () => {
      // Note: This test uses the default mocks from beforeEach - no need to reset
      const req = createMockRequest({ 
        params: { scheduleId: mockSchedule.id },
        query: { page: '1', pageSize: '20' }
      });
      const res = createMockResponse();

      await scheduledReportsController.getScheduleHistory(req as any, res as any, mockNext);

      expect(db.query).toHaveBeenCalledWith(
        'SELECT id FROM report_schedules WHERE id = $1 AND created_by = $2',
        [mockSchedule.id, mockUser.id]
      );

      // Should be called twice - verify ownership and get history
      expect(db.query).toHaveBeenCalledTimes(2);
      
      // Check the second call (history query)
      expect(db.query).toHaveBeenNthCalledWith(2,
        expect.stringContaining('SELECT'),
        [mockSchedule.id, '20', 0]
      );
      
      // Verify the query contains the expected fields
      const historyQuery = (db.query as jest.Mock).mock.calls[1][0];
      expect(historyQuery).toContain('rh.id');
      expect(historyQuery).toContain('rh.report_name');
      expect(historyQuery).toContain('rh.status');

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          executions: [mockExecution],
          pagination: {
            page: 1,
            pageSize: 20
          }
        }
      });
    });

    it('should handle pagination parameters', async () => {
      const req = createMockRequest({ 
        params: { scheduleId: mockSchedule.id },
        query: { page: '3', pageSize: '5' }
      });
      const res = createMockResponse();

      await scheduledReportsController.getScheduleHistory(req as any, res as any, mockNext);

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $2 OFFSET $3'),
        [mockSchedule.id, '5', 10] // page 3, pageSize 5, offset = (3-1)*5 = 10
      );
    });

    it('should return 404 for non-existent schedule', async () => {
      // Reset only the db.query mock to override the beforeEach setup
      (db.query as jest.Mock).mockReset();
      (db.query as jest.Mock).mockResolvedValueOnce({ rows: [] }); // Schedule not found

      const req = createMockRequest({ params: { scheduleId: '660e8400-e29b-41d4-a716-446655440005' } }); // Valid UUID that doesn't exist
      const res = createMockResponse();

      await scheduledReportsController.getScheduleHistory(req as any, res as any, mockNext);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Scheduled report not found'
      });
    });

    it('should require authentication', async () => {
      const req = createMockRequest({ 
        params: { scheduleId: mockSchedule.id },
        user: null 
      });
      const res = createMockResponse();

      await scheduledReportsController.getScheduleHistory(req as any, res as any, mockNext);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Unauthorized'
      });
    });

    it('should handle database errors during history fetch', async () => {
      // Reset only the db.query mock to override the beforeEach setup
      (db.query as jest.Mock).mockReset();
      (db.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ id: mockSchedule.id }] }) // Verify schedule ownership succeeds
        .mockRejectedValueOnce(new Error('Database error')); // History fetch fails

      const req = createMockRequest({ params: { scheduleId: mockSchedule.id } });
      const res = createMockResponse();

      await scheduledReportsController.getScheduleHistory(req as any, res as any, mockNext);

      expect(logger.error).toHaveBeenCalledWith('Error fetching schedule history:', expect.any(Error));
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to fetch schedule history'
      });
    });
  });

  describe('Validation rules', () => {
    describe('createScheduleValidation', () => {
      it('should include all required validation rules for creation', () => {
        expect(createScheduleValidation).toBeDefined();
        expect(Array.isArray(createScheduleValidation)).toBe(true);
        expect(createScheduleValidation.length).toBeGreaterThan(0);
      });
    });

    describe('updateScheduleValidation', () => {
      it('should include all required validation rules for updates', () => {
        expect(updateScheduleValidation).toBeDefined();
        expect(Array.isArray(updateScheduleValidation)).toBe(true);
        expect(updateScheduleValidation.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Authorization and security', () => {
    it('should only allow users to access their own schedules', async () => {
      // User should only see schedules they created
      const req = createMockRequest();
      const res = createMockResponse();

      (db.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ total: '1' }] })
        .mockResolvedValueOnce({ rows: [mockSchedule] });

      await scheduledReportsController.getSchedules(req as any, res as any, mockNext);

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE rs.created_by = $1'),
        expect.arrayContaining([mockUser.id])
      );
    });

    it('should prevent access to schedules from other users', async () => {
      jest.clearAllMocks();
      
      // Re-setup validation mock since clearAllMocks() cleared it
      (validationResult as jest.MockedFunction<typeof validationResult>).mockReturnValue({
        isEmpty: () => true,
        array: () => []
      } as any);
      
      // Try to access a schedule created by another user
      const otherUserSchedule = { ...mockSchedule, created_by: 999 };
      (db.query as jest.Mock).mockResolvedValue({ rows: [] }); // No results due to user filter

      const req = createMockRequest({ params: { scheduleId: otherUserSchedule.id } });
      const res = createMockResponse();

      await scheduledReportsController.getSchedule(req as any, res as any, mockNext);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Scheduled report not found'
      });
    });

    it('should prevent unauthorized operations on schedules', async () => {
      const operations = [
        'updateSchedule',
        'deleteSchedule',
        'toggleSchedule',
        'getScheduleHistory'
      ];

      for (const operation of operations) {
        jest.clearAllMocks();
        const req = createMockRequest({ 
          params: { scheduleId: mockSchedule.id },
          user: null 
        });
        const res = createMockResponse();

        await (scheduledReportsController as any)[operation](req, res, mockNext);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          error: 'Unauthorized'
        });
      }
    });
  });

  describe('Error handling scenarios', () => {
    it('should handle empty database results gracefully', async () => {
      jest.clearAllMocks();
      jest.resetAllMocks();
      
      // Reset validation to ensure it passes
      (validationResult as jest.MockedFunction<typeof validationResult>).mockReturnValue({
        isEmpty: () => true,
        array: () => []
      } as any);
      
      // Reset calculateNextRun mock
      (calculateNextRun as jest.Mock).mockReturnValue(new Date('2025-08-05T09:00:00.000Z'));
      
      (db.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ total: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      const req = createMockRequest();
      const res = createMockResponse();

      await scheduledReportsController.getSchedules(req as any, res as any, mockNext);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          schedules: [],
          pagination: {
            page: 1,
            pageSize: 20,
            totalCount: 0,
            totalPages: 0
          }
        }
      });
    });

    it('should handle null/undefined user gracefully', async () => {
      const req = createMockRequest({ user: undefined });
      const res = createMockResponse();

      await scheduledReportsController.getSchedules(req as any, res as any, mockNext);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Unauthorized'
      });
    });

    it('should handle database connection timeouts', async () => {
      jest.clearAllMocks();
      jest.resetAllMocks();
      
      const timeoutError = new Error('Connection timeout');
      (timeoutError as any).code = 'ETIMEDOUT';
      
      // Reset validation to ensure it passes
      (validationResult as jest.MockedFunction<typeof validationResult>).mockReturnValue({
        isEmpty: () => true,
        array: () => []
      } as any);
      
      // Reset calculateNextRun mock
      (calculateNextRun as jest.Mock).mockReturnValue(new Date('2025-08-05T09:00:00.000Z'));
      
      (db.query as jest.Mock).mockRejectedValue(timeoutError);

      const req = createMockRequest();
      const res = createMockResponse();

      await scheduledReportsController.getSchedules(req as any, res as any, mockNext);

      expect(logger.error).toHaveBeenCalledWith('Error fetching scheduled reports:', timeoutError);
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('should handle malformed schedule configuration', async () => {
      const malformedConfig = {
        frequency: 'invalid',
        time: '25:70' // Invalid time
      };

      // First, the validation should catch this, but if it passes, calculateNextRun will throw
      (calculateNextRun as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid schedule configuration');
      });

      const req = createMockRequest({ 
        body: {
          name: 'Test Schedule',
          templateId: '660e8400-e29b-41d4-a716-446655440001',
          scheduleConfig: malformedConfig
        }
      });
      const res = createMockResponse();

      await scheduledReportsController.createSchedule(req as any, res as any, mockNext);

      // Since we're bypassing validation in the test setup, calculateNextRun will throw
      // and the controller will return 500
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to create scheduled report'
      });
    });
  });

  describe('Schedule configuration validation', () => {
    it('should handle different frequency types correctly', async () => {
      const frequencyTests = [
        {
          frequency: 'daily',
          time: '09:00',
          expectedCall: { frequency: 'daily', time: '09:00' }
        },
        {
          frequency: 'weekly',
          time: '10:00',
          dayOfWeek: 1,
          expectedCall: { frequency: 'weekly', time: '10:00', dayOfWeek: 1 }
        },
        {
          frequency: 'monthly',
          time: '11:00',
          dayOfMonth: 15,
          expectedCall: { frequency: 'monthly', time: '11:00', dayOfMonth: 15 }
        }
      ];

      for (const test of frequencyTests) {
        jest.clearAllMocks();
        // Reset validation to ensure it passes
        (validationResult as jest.MockedFunction<typeof validationResult>).mockReturnValue({
          isEmpty: () => true,
          array: () => []
        } as any);
        
        (calculateNextRun as jest.Mock).mockReturnValue(new Date('2025-08-05T09:00:00.000Z'));
        (db.query as jest.Mock).mockResolvedValue({ rows: [{ id: 'test-id' }] });

        const req = createMockRequest({ 
          body: {
            name: 'Test Schedule',
            templateId: '660e8400-e29b-41d4-a716-446655440001',
            scheduleConfig: test.expectedCall
          },
          user: mockUser
        });
        const res = createMockResponse();

        await scheduledReportsController.createSchedule(req as any, res as any, mockNext);

        expect(calculateNextRun).toHaveBeenCalledWith(test.expectedCall);
      }
    });

    it('should handle timezone considerations in schedule calculations', async () => {
      jest.clearAllMocks();
      // Reset validation to ensure it passes
      (validationResult as jest.MockedFunction<typeof validationResult>).mockReturnValue({
        isEmpty: () => true,
        array: () => []
      } as any);
      
      (calculateNextRun as jest.Mock).mockReturnValue(new Date('2025-08-05T09:00:00.000Z'));
      
      // This test ensures that timezone handling is properly delegated to the calculateNextRun utility
      const scheduleConfig = {
        frequency: 'daily',
        time: '09:00'
      };

      const req = createMockRequest({ 
        body: {
          name: 'Timezone Test Schedule',
          templateId: '660e8400-e29b-41d4-a716-446655440001',
          scheduleConfig
        },
        user: mockUser
      });
      const res = createMockResponse();

      (db.query as jest.Mock).mockResolvedValue({ rows: [{ id: 'test-id' }] });

      await scheduledReportsController.createSchedule(req as any, res as any, mockNext);

      expect(calculateNextRun).toHaveBeenCalledWith(scheduleConfig);
      // The actual timezone handling logic is tested in the schedule utils tests
    });
  });

  describe('Performance and edge cases', () => {
    it('should handle large pagination requests', async () => {
      const req = createMockRequest({ 
        query: { page: '1000', pageSize: '100' }
      });
      const res = createMockResponse();

      (db.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ total: '50000' }] })
        .mockResolvedValueOnce({ rows: [] });

      await scheduledReportsController.getSchedules(req as any, res as any, mockNext);

      // Should have been called twice - count and data query
      expect(db.query).toHaveBeenCalledTimes(2);
      
      // Check the second call (data query) has the correct pagination
      expect(db.query).toHaveBeenNthCalledWith(2,
        expect.stringContaining('LIMIT'),
        expect.arrayContaining(['100', 99900]) // pageSize, offset = (1000-1) * 100
      );
    });

    it('should handle concurrent schedule creation requests', async () => {
      jest.clearAllMocks();
      
      // Reset validation to ensure it passes
      (validationResult as jest.MockedFunction<typeof validationResult>).mockReturnValue({
        isEmpty: () => true,
        array: () => []
      } as any);
      
      const scheduleData = {
        name: 'Concurrent Test',
        templateId: '660e8400-e29b-41d4-a716-446655440001',
        scheduleConfig: { frequency: 'daily', time: '09:00' }
      };

      (db.query as jest.Mock).mockResolvedValue({ rows: [{ id: 'new-id' }] });

      const requests = Array.from({ length: 5 }, () => {
        const req = createMockRequest({ body: scheduleData, user: mockUser });
        const res = createMockResponse();
        return scheduledReportsController.createSchedule(req as any, res as any, mockNext);
      });

      await Promise.all(requests);

      expect(db.query).toHaveBeenCalledTimes(5);
    });

    it('should handle very large recipient lists', async () => {
      jest.clearAllMocks();
      // Reset validation to ensure it passes
      (validationResult as jest.MockedFunction<typeof validationResult>).mockReturnValue({
        isEmpty: () => true,
        array: () => []
      } as any);
      
      const manyRecipients = Array.from({ length: 100 }, (_, i) => `user${i}@example.com`);
      
      const req = createMockRequest({ 
        body: {
          name: 'Large Recipients List',
          templateId: '660e8400-e29b-41d4-a716-446655440001',
          scheduleConfig: { frequency: 'daily', time: '09:00' },
          recipients: manyRecipients
        },
        user: mockUser
      });
      const res = createMockResponse();

      (db.query as jest.Mock).mockResolvedValue({ rows: [{ id: 'test-id' }] });

      await scheduledReportsController.createSchedule(req as any, res as any, mockNext);

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO report_schedules'),
        expect.arrayContaining([manyRecipients])
      );
    });
  });
});