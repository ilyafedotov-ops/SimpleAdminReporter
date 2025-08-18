import { Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { db } from '@/config/database';
import { logger } from '@/utils/logger';
import { calculateNextRun } from '@/utils/schedule';
import { asyncHandler } from '@/middleware/error.middleware';

// Validation rules
export const createScheduleValidation = [
  body('name').isLength({ min: 1, max: 255 }).withMessage('Name must be 1-255 characters').trim().escape(),
  body('description').optional().isLength({ max: 1000 }).withMessage('Description max 1000 characters').trim().escape(),
  body('templateId').optional().isUUID().withMessage('Invalid template ID'),
  body('customTemplateId').optional().isUUID().withMessage('Invalid custom template ID'),
  body('parameters').optional().isObject().withMessage('Parameters must be an object'),
  body('scheduleConfig.frequency').isIn(['daily', 'weekly', 'monthly']).withMessage('Invalid frequency'),
  body('scheduleConfig.time').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Invalid time format (HH:MM)'),
  body('scheduleConfig.dayOfWeek').optional().isInt({ min: 0, max: 6 }).withMessage('Day of week must be 0-6'),
  body('scheduleConfig.dayOfMonth').optional().isInt({ min: 1, max: 31 }).withMessage('Day of month must be 1-31'),
  body('recipients').optional().isArray().withMessage('Recipients must be an array'),
  body('recipients.*').optional().isEmail().withMessage('Invalid email address'),
  body('exportFormat').optional().isIn(['excel', 'csv', 'pdf']).withMessage('Invalid export format'),
];

export const updateScheduleValidation = [
  param('scheduleId').isUUID().withMessage('Invalid schedule ID'),
  body('name').optional().isLength({ min: 1, max: 255 }).withMessage('Name must be 1-255 characters').trim().escape(),
  body('description').optional().isLength({ max: 1000 }).withMessage('Description max 1000 characters').trim().escape(),
  body('parameters').optional().isObject().withMessage('Parameters must be an object'),
  body('scheduleConfig').optional().isObject().withMessage('Schedule config must be an object'),
  body('recipients').optional().isArray().withMessage('Recipients must be an array'),
  body('exportFormat').optional().isIn(['excel', 'csv', 'pdf']).withMessage('Invalid export format'),
  body('isActive').optional().isBoolean().withMessage('isActive must be boolean'),
];

class ScheduledReportsController {
  /**
   * Get all scheduled reports for the current user
   */
  getSchedules = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      const { isActive, page = 1, pageSize = 20 } = req.query;

      let whereClause = 'WHERE rs.created_by = $1';
      const params: any[] = [userId];
      let paramIndex = 2;

      if (isActive !== undefined) {
        whereClause += ` AND rs.is_active = $${paramIndex}`;
        params.push(isActive === 'true');
        paramIndex++;
      }

      // Count total records
      const countResult = await db.query(
        `SELECT COUNT(*) as total
         FROM report_schedules rs
         ${whereClause}`,
        params
      );

      const totalCount = parseInt(countResult.rows[0].total);
      const totalPages = Math.ceil(totalCount / Number(pageSize));
      const offset = (Number(page) - 1) * Number(pageSize);

      // Get paginated results
      const result = await db.query(
        `SELECT 
          rs.*,
          rt.name as template_name,
          rt.category as template_category,
          crt.name as custom_template_name,
          crt.source as custom_template_source,
          u.display_name as created_by_name
         FROM report_schedules rs
         LEFT JOIN report_templates rt ON rs.template_id = rt.id
         LEFT JOIN custom_report_templates crt ON rs.custom_template_id = crt.id
         LEFT JOIN users u ON rs.created_by = u.id
         ${whereClause}
         ORDER BY rs.created_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, pageSize, offset]
      );

      res.json({
        success: true,
        data: {
          schedules: result.rows,
          pagination: {
            page: Number(page),
            pageSize: Number(pageSize),
            totalCount,
            totalPages
          }
        }
      });
    } catch (error) {
      logger.error('Error fetching scheduled reports:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch scheduled reports'
      });
    }
  });

  /**
   * Get a specific scheduled report
   */
  getSchedule = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      const { scheduleId } = req.params;
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const result = await db.query(
        `SELECT 
          rs.*,
          rt.name as template_name,
          rt.category as template_category,
          crt.name as custom_template_name,
          crt.source as custom_template_source,
          u.display_name as created_by_name
         FROM report_schedules rs
         LEFT JOIN report_templates rt ON rs.template_id = rt.id
         LEFT JOIN custom_report_templates crt ON rs.custom_template_id = crt.id
         LEFT JOIN users u ON rs.created_by = u.id
         WHERE rs.id = $1 AND rs.created_by = $2`,
        [scheduleId, userId]
      );

      if (result.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: 'Scheduled report not found'
        });
        return;
      }

      res.json({
        success: true,
        data: result.rows[0]
      });
    } catch (error) {
      logger.error('Error fetching scheduled report:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch scheduled report'
      });
    }
  });

  /**
   * Create a new scheduled report
   */
  createSchedule = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
        return;
      }

      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      const {
        name,
        description,
        templateId,
        customTemplateId,
        parameters,
        scheduleConfig,
        recipients,
        exportFormat = 'excel'
      } = req.body;

      // Validate that either templateId or customTemplateId is provided
      if (!templateId && !customTemplateId) {
        res.status(400).json({
          success: false,
          error: 'Either templateId or customTemplateId must be provided'
        });
        return;
      }

      // Calculate next run time
      const nextRun = calculateNextRun(scheduleConfig);

      const result = await db.query(
        `INSERT INTO report_schedules (
          name, description, template_id, custom_template_id, parameters,
          schedule_config, recipients, export_format, is_active,
          next_run, created_by, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING *`,
        [
          name,
          description,
          templateId || null,
          customTemplateId || null,
          JSON.stringify(parameters || {}),
          JSON.stringify(scheduleConfig),
          recipients || [],
          exportFormat,
          true,
          nextRun,
          userId
        ]
      );

      logger.info(`Scheduled report created: ${result.rows[0].id} by user ${userId}`);

      res.status(201).json({
        success: true,
        data: result.rows[0]
      });
    } catch (error) {
      logger.error('Error creating scheduled report:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create scheduled report'
      });
    }
  });

  /**
   * Update a scheduled report
   */
  updateSchedule = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
        return;
      }

      const { scheduleId } = req.params;
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      const updates = req.body;

      // Check if schedule exists and belongs to user
      const existingResult = await db.query(
        'SELECT * FROM report_schedules WHERE id = $1 AND created_by = $2',
        [scheduleId, userId]
      );

      if (existingResult.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: 'Scheduled report not found'
        });
        return;
      }

      // Build update query
      const updateFields: string[] = [];
      const updateValues: any[] = [];
      let paramIndex = 1;

      if (updates.name !== undefined) {
        updateFields.push(`name = $${paramIndex++}`);
        updateValues.push(updates.name);
      }
      if (updates.description !== undefined) {
        updateFields.push(`description = $${paramIndex++}`);
        updateValues.push(updates.description);
      }
      if (updates.parameters !== undefined) {
        updateFields.push(`parameters = $${paramIndex++}`);
        updateValues.push(JSON.stringify(updates.parameters));
      }
      if (updates.scheduleConfig !== undefined) {
        updateFields.push(`schedule_config = $${paramIndex++}`);
        updateValues.push(JSON.stringify(updates.scheduleConfig));
        
        // Recalculate next run time
        const nextRun = calculateNextRun(updates.scheduleConfig);
        updateFields.push(`next_run = $${paramIndex++}`);
        updateValues.push(nextRun);
      }
      if (updates.recipients !== undefined) {
        updateFields.push(`recipients = $${paramIndex++}`);
        updateValues.push(updates.recipients);
      }
      if (updates.exportFormat !== undefined) {
        updateFields.push(`export_format = $${paramIndex++}`);
        updateValues.push(updates.exportFormat);
      }
      if (updates.isActive !== undefined) {
        updateFields.push(`is_active = $${paramIndex++}`);
        updateValues.push(updates.isActive);
      }

      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
      updateValues.push(scheduleId);

      const result = await db.query(
        `UPDATE report_schedules 
         SET ${updateFields.join(', ')}
         WHERE id = $${paramIndex}
         RETURNING *`,
        updateValues
      );

      logger.info(`Scheduled report updated: ${scheduleId} by user ${userId}`);

      res.json({
        success: true,
        data: result.rows[0]
      });
    } catch (error) {
      logger.error('Error updating scheduled report:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update scheduled report'
      });
    }
  });

  /**
   * Delete a scheduled report
   */
  deleteSchedule = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      const { scheduleId } = req.params;
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const result = await db.query(
        'DELETE FROM report_schedules WHERE id = $1 AND created_by = $2 RETURNING id',
        [scheduleId, userId]
      );

      if (result.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: 'Scheduled report not found'
        });
        return;
      }

      logger.info(`Scheduled report deleted: ${scheduleId} by user ${userId}`);

      res.json({
        success: true,
        message: 'Scheduled report deleted successfully'
      });
    } catch (error) {
      logger.error('Error deleting scheduled report:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete scheduled report'
      });
    }
  });

  /**
   * Toggle schedule active state
   */
  toggleSchedule = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      const { scheduleId } = req.params;
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const result = await db.query(
        `UPDATE report_schedules 
         SET is_active = NOT is_active, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND created_by = $2
         RETURNING *`,
        [scheduleId, userId]
      );

      if (result.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: 'Scheduled report not found'
        });
        return;
      }

      logger.info(`Scheduled report toggled: ${scheduleId} to ${result.rows[0].is_active} by user ${userId}`);

      res.json({
        success: true,
        data: result.rows[0]
      });
    } catch (error) {
      logger.error('Error toggling scheduled report:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to toggle scheduled report'
      });
    }
  });

  /**
   * Get schedule execution history
   */
  getScheduleHistory = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      const { scheduleId } = req.params;
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      const { page = 1, pageSize = 20 } = req.query;

      // Verify schedule belongs to user
      const scheduleResult = await db.query(
        'SELECT id FROM report_schedules WHERE id = $1 AND created_by = $2',
        [scheduleId, userId]
      );

      if (scheduleResult.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: 'Scheduled report not found'
        });
        return;
      }

      const offset = (Number(page) - 1) * Number(pageSize);

      const result = await db.query(
        `SELECT 
          rh.id,
          rh.report_name,
          rh.status,
          rh.row_count,
          rh.execution_time_ms,
          rh.error_message,
          rh.started_at,
          rh.completed_at
         FROM report_history rh
         WHERE rh.schedule_id = $1 AND rh.is_scheduled = true
         ORDER BY rh.started_at DESC
         LIMIT $2 OFFSET $3`,
        [scheduleId, pageSize, offset]
      );

      res.json({
        success: true,
        data: {
          executions: result.rows,
          pagination: {
            page: Number(page),
            pageSize: Number(pageSize)
          }
        }
      });
    } catch (error) {
      logger.error('Error fetching schedule history:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch schedule history'
      });
    }
  });
}

export const scheduledReportsController = new ScheduledReportsController();