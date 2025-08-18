import { Request, Response, NextFunction } from 'express';
import { logger } from '@/utils/logger';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
  code?: string | number;
}

export const errorHandler = (
  error: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Default error values
  let statusCode = error.statusCode || 500;
  let message = (error.message && error.message.trim() !== '' && error.message !== 'Error') 
    ? error.message 
    : 'Internal Server Error';
  let isOperational = error.isOperational !== undefined ? error.isOperational : false;

  // Handle specific error types
  if (error.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation Error: ' + ((error as any)?.message || String(error));
    isOperational = true;
  } else if (error.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
    isOperational = true;
  } else if (error.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
    isOperational = true;
  } else if (error.code === 'ECONNREFUSED') {
    statusCode = 503;
    message = 'Service unavailable - database connection failed';
    isOperational = true;
  } else if (error.code === '23505') { // PostgreSQL unique violation
    statusCode = 409;
    message = 'Resource already exists';
    isOperational = true;
  } else if (error.code === '23503') { // PostgreSQL foreign key violation
    statusCode = 400;
    message = 'Reference constraint violation';
    isOperational = true;
  }

  // Log error details
  const errorDetails = {
    message: ((error as any)?.message || String(error)),
    stack: error.stack,
    statusCode,
    isOperational,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: (req as any).user?.id,
    timestamp: new Date().toISOString()
  };

  if (statusCode >= 500) {
    logger.error('Server Error:', errorDetails);
  } else {
    logger.warn('Client Error:', errorDetails);
  }

  // Send error response
  const response: any = {
    success: false,
    error: message
  };

  // Include additional error details in development
  if (process.env.NODE_ENV === 'development') {
    response.errorDetails = {
      stack: error.stack,
      details: error,
      statusCode,
      timestamp: new Date().toISOString()
    };
  }

  res.status(statusCode).json(response);
};

export const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export const createError = (message: string, statusCode: number = 500, isOperational: boolean = true): AppError => {
  const error = new Error(message) as AppError;
  error.statusCode = statusCode;
  error.isOperational = isOperational;
  return error;
};

export const notFound = (req: Request, res: Response, next: NextFunction): void => {
  const error = createError(`Route ${req.originalUrl} not found`, 404);
  next(error);
};