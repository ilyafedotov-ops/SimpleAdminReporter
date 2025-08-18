import { Request, Response, NextFunction } from 'express';
import { createError } from '@/middleware/error.middleware';
import { loggingConfig } from '@/config/logging.config';

export class LogsValidator {
  /**
   * Validate log query parameters
   */
  static validateLogQuery(req: Request, res: Response, next: NextFunction): void {
    try {
      const {
        type,
        level,
        page,
        pageSize,
        sortOrder,
        startDate,
        endDate,
        userId
      } = req.query;

      // Validate type
      if (type && !['audit', 'system', 'all'].includes(type as string)) {
        throw createError('Invalid log type. Must be audit, system, or all', 400);
      }

      // Validate level
      if (level && !['error', 'warn', 'info', 'debug'].includes(level as string)) {
        throw createError('Invalid log level. Must be error, warn, info, or debug', 400);
      }

      // Validate pagination
      if (page) {
        const pageNum = parseInt(page as string);
        if (isNaN(pageNum) || pageNum < 1) {
          throw createError('Page must be a positive integer', 400);
        }
      }

      if (pageSize) {
        const size = parseInt(pageSize as string);
        if (isNaN(size) || size < 1 || size > loggingConfig.query.maxPageSize) {
          throw createError(`Page size must be between 1 and ${loggingConfig.query.maxPageSize}`, 400);
        }
      }

      // Validate sort order
      if (sortOrder && !['asc', 'desc'].includes(sortOrder as string)) {
        throw createError('Sort order must be asc or desc', 400);
      }

      // Validate dates
      if (startDate && isNaN(Date.parse(startDate as string))) {
        throw createError('Invalid start date format', 400);
      }

      if (endDate && isNaN(Date.parse(endDate as string))) {
        throw createError('Invalid end date format', 400);
      }

      // Validate userId
      if (userId) {
        const id = parseInt(userId as string);
        if (isNaN(id) || id < 1) {
          throw createError('User ID must be a positive integer', 400);
        }
      }

      next();
    } catch (error) {
      next(error);
    }
  }

  /**
   * Validate log stats parameters
   */
  static validateLogStats(req: Request, res: Response, next: NextFunction): void {
    try {
      const { hours } = req.query;

      if (hours) {
        const hoursNum = parseInt(hours as string);
        if (isNaN(hoursNum) || hoursNum < 1 || hoursNum > 720) { // Max 30 days
          throw createError('Hours must be between 1 and 720', 400);
        }
      }

      next();
    } catch (error) {
      next(error);
    }
  }

  /**
   * Validate log export parameters
   */
  static validateLogExport(req: Request, res: Response, next: NextFunction): void {
    try {
      const { format, maxRecords } = req.query;

      // Validate format
      if (format && !['csv', 'json'].includes(format as string)) {
        throw createError('Export format must be csv or json', 400);
      }

      // Validate max records
      if (maxRecords) {
        const max = parseInt(maxRecords as string);
        if (isNaN(max) || max < 1 || max > loggingConfig.export.maxRecords) {
          throw createError(`Max records must be between 1 and ${loggingConfig.export.maxRecords}`, 400);
        }
      }

      // Run standard query validation
      LogsValidator.validateLogQuery(req, res, next);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Validate log cleanup parameters
   */
  static validateLogCleanup(req: Request, res: Response, next: NextFunction): void {
    try {
      const { retentionDays, dryRun } = req.query;

      // Validate retention days
      if (retentionDays) {
        const days = parseInt(retentionDays as string);
        if (isNaN(days) || days < 1 || days > 365) {
          throw createError('Retention days must be between 1 and 365', 400);
        }
      }

      // Validate dry run
      if (dryRun && !['true', 'false'].includes(dryRun as string)) {
        throw createError('Dry run must be true or false', 400);
      }

      next();
    } catch (error) {
      next(error);
    }
  }

  /**
   * Validate log detail parameters
   */
  static validateLogDetail(req: Request, res: Response, next: NextFunction): void {
    try {
      const { id } = req.params;
      const { type } = req.query;

      // Validate ID
      const logId = parseInt(id);
      if (isNaN(logId) || logId < 1) {
        throw createError('Invalid log ID', 400);
      }

      // Validate type
      if (!type || !['audit', 'system'].includes(type as string)) {
        throw createError('Log type must be specified as audit or system', 400);
      }

      next();
    } catch (error) {
      next(error);
    }
  }

  /**
   * Validate log search parameters
   */
  static validateLogSearch(req: Request, res: Response, next: NextFunction): void {
    try {
      const { q, type, page, pageSize } = req.query;

      // Validate search query
      if (!q || typeof q !== 'string' || q.trim().length === 0) {
        throw createError('Search query is required', 400);
      }

      // Validate query length
      if (q.length > 200) {
        throw createError('Search query must be less than 200 characters', 400);
      }

      // Validate type
      if (type && !['audit', 'system', 'all'].includes(type as string)) {
        throw createError('Invalid log type. Must be audit, system, or all', 400);
      }

      // Validate pagination
      if (page) {
        const pageNum = parseInt(page as string);
        if (isNaN(pageNum) || pageNum < 1) {
          throw createError('Page must be a positive integer', 400);
        }
      }

      if (pageSize) {
        const size = parseInt(pageSize as string);
        if (isNaN(size) || size < 1 || size > loggingConfig.query.maxPageSize) {
          throw createError(`Page size must be between 1 and ${loggingConfig.query.maxPageSize}`, 400);
        }
      }

      next();
    } catch (error) {
      next(error);
    }
  }

  /**
   * Validate fuzzy search parameters
   */
  static validateFuzzySearch(req: Request, res: Response, next: NextFunction): void {
    try {
      const { type, field, term, threshold, page, pageSize } = req.query;

      // Validate required parameters
      if (!type || !['audit', 'system'].includes(type as string)) {
        throw createError('Type must be specified as audit or system', 400);
      }

      if (!field || typeof field !== 'string') {
        throw createError('Field parameter is required', 400);
      }

      if (!term || typeof term !== 'string' || term.trim().length === 0) {
        throw createError('Search term is required', 400);
      }

      // Validate field based on type
      const auditFields = ['username', 'event_action', 'resource_type'];
      const systemFields = ['message', 'module', 'url'];
      const allowedFields = type === 'audit' ? auditFields : systemFields;
      
      if (!allowedFields.includes(field as string)) {
        throw createError(`Invalid field for ${type} logs. Must be one of: ${allowedFields.join(', ')}`, 400);
      }

      // Validate threshold
      if (threshold) {
        const thresholdNum = parseFloat(threshold as string);
        if (isNaN(thresholdNum) || thresholdNum < 0 || thresholdNum > 1) {
          throw createError('Threshold must be between 0 and 1', 400);
        }
      }

      // Validate pagination
      if (page) {
        const pageNum = parseInt(page as string);
        if (isNaN(pageNum) || pageNum < 1) {
          throw createError('Page must be a positive integer', 400);
        }
      }

      if (pageSize) {
        const size = parseInt(pageSize as string);
        if (isNaN(size) || size < 1 || size > loggingConfig.query.maxPageSize) {
          throw createError(`Page size must be between 1 and ${loggingConfig.query.maxPageSize}`, 400);
        }
      }

      next();
    } catch (error) {
      next(error);
    }
  }
}