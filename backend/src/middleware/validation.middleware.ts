import { Request, Response, NextFunction } from 'express';
import { ValidationChain, validationResult } from 'express-validator';
import { logger } from '@/utils/logger';
import { createError } from '@/middleware/error.middleware';

/**
 * Middleware to handle validation results from express-validator
 */
export const handleValidationErrors = (req: Request, res: Response, next: NextFunction): void => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorDetails = errors.array().map(error => ({
      field: error.type === 'field' ? (error as any).path : 'unknown',
      message: error.msg,
      value: error.type === 'field' ? (error as any).value : undefined
    }));

    logger.warn('Validation errors:', {
      path: req.path,
      method: req.method,
      errors: errorDetails,
      body: req.body,
      query: req.query,
      params: req.params
    });

    const error = createError(
      `Validation failed: ${errorDetails.map(e => e.message).join(', ')}`,
      400
    );
    (error as any).details = errorDetails;
    
    return next(error);
  }

  next();
};

/**
 * Combine validation chains with error handling
 */
export const validate = (validations: ValidationChain[]) => {
  return [
    ...validations,
    handleValidationErrors
  ];
};

/**
 * Middleware to validate JSON body exists
 */
export const requireJsonBody = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.body || Object.keys(req.body).length === 0) {
    return next(createError('Request body is required', 400));
  }
  next();
};

/**
 * Middleware to validate content type is JSON
 */
export const requireJsonContentType = (req: Request, res: Response, next: NextFunction): void => {
  if (req.method !== 'GET' && req.method !== 'DELETE') {
    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.includes('application/json')) {
      return next(createError('Content-Type must be application/json', 400));
    }
  }
  next();
};

/**
 * Middleware to sanitize request data
 */
export const sanitizeInput = (req: Request, res: Response, next: NextFunction): void => {
  try {
    // Basic XSS protection - strip HTML tags from string values
    const sanitizeValue = (value: any): any => {
      if (typeof value === 'string') {
        return value.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      }
      if (Array.isArray(value)) {
        return value.map(sanitizeValue);
      }
      if (value && typeof value === 'object') {
        const sanitized: any = {};
        for (const [key, val] of Object.entries(value)) {
          sanitized[key] = sanitizeValue(val);
        }
        return sanitized;
      }
      return value;
    };

    if (req.body) {
      req.body = sanitizeValue(req.body);
    }
    if (req.query) {
      req.query = sanitizeValue(req.query);
    }
    if (req.params) {
      req.params = sanitizeValue(req.params);
    }

    next();
  } catch (error) {
    logger.error('Input sanitization error:', error);
    next(createError('Input sanitization failed', 500));
  }
};

/**
 * Middleware to validate pagination parameters
 */
export const validatePagination = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || (page - 1) * limit;

    // Validate bounds
    if (page < 1) {
      return next(createError('Page must be greater than 0', 400));
    }
    if (limit < 1 || limit > 1000) {
      return next(createError('Limit must be between 1 and 1000', 400));
    }
    if (offset < 0) {
      return next(createError('Offset must be greater than or equal to 0', 400));
    }

    // Attach validated pagination to request
    (req as any).pagination = {
      page,
      limit,
      offset
    };

    next();
  } catch {
    next(createError('Invalid pagination parameters', 400));
  }
};

/**
 * Middleware to validate sort parameters
 */
export const validateSort = (allowedFields: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const sortBy = req.query.sortBy as string;
      const sortOrder = (req.query.sortOrder as string)?.toLowerCase();

      if (sortBy && !allowedFields.includes(sortBy)) {
        return next(createError(`Invalid sort field. Allowed fields: ${allowedFields.join(', ')}`, 400));
      }

      if (sortOrder && !['asc', 'desc'].includes(sortOrder)) {
        return next(createError('Sort order must be "asc" or "desc"', 400));
      }

      // Attach validated sort to request
      (req as any).sort = {
        field: sortBy || allowedFields[0] || 'id',
        order: sortOrder || 'asc'
      };

      next();
    } catch {
      next(createError('Invalid sort parameters', 400));
    }
  };
};

/**
 * Middleware to validate file upload requirements
 */
export const validateFileUpload = (options: {
  required?: boolean;
  allowedTypes?: string[];
  maxSize?: number; // in bytes
} = {}) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const file = (req as any).file;
      const files = (req as any).files;

      // Check if file is required
      if (options.required && !file && !files) {
        return next(createError('File upload is required', 400));
      }

      if (file) {
        // Check file type
        if (options.allowedTypes && !options.allowedTypes.includes(file.mimetype)) {
          return next(createError(`Invalid file type. Allowed types: ${options.allowedTypes.join(', ')}`, 400));
        }

        // Check file size
        if (options.maxSize && file.size > options.maxSize) {
          return next(createError(`File too large. Maximum size: ${options.maxSize} bytes`, 400));
        }
      }

      next();
    } catch (error) {
      logger.error('File validation error:', error);
      next(createError('File validation failed', 500));
    }
  };
};

/**
 * Middleware to validate date range parameters
 */
export const validateDateRange = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    if (startDate && isNaN(Date.parse(startDate))) {
      return next(createError('Invalid start date format', 400));
    }

    if (endDate && isNaN(Date.parse(endDate))) {
      return next(createError('Invalid end date format', 400));
    }

    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      return next(createError('Start date must be before end date', 400));
    }

    // Attach validated dates to request
    (req as any).dateRange = {
      start: startDate ? new Date(startDate) : null,
      end: endDate ? new Date(endDate) : null
    };

    next();
  } catch {
    next(createError('Invalid date range parameters', 400));
  }
};

// Backward compatibility
export const validateRequest = validate;