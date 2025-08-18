import { Request, Response, NextFunction } from 'express';
import { 
  errorHandler, 
  asyncHandler, 
  createError, 
  notFound, 
  AppError 
} from './error.middleware';
import { logger } from '@/utils/logger';
import { 
  DataSourceError,
  ConnectionError,
  AuthenticationError,
  QueryError,
  // ValidationError,
  TimeoutError,
  CredentialError
} from '@/services/base/errors';

// Mock dependencies
jest.mock('@/utils/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  }
}));

describe('Error Middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;
  let mockJson: jest.Mock;
  let mockStatus: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset environment
    process.env.NODE_ENV = 'test';
    
    mockJson = jest.fn();
    mockStatus = jest.fn().mockReturnValue({ json: mockJson });
    
    req = {
      originalUrl: '/api/test',
      method: 'GET',
      ip: '127.0.0.1',
      get: jest.fn().mockReturnValue('Jest Test Agent'),
      user: { id: 123 }
    } as any;
    
    res = {
      status: mockStatus,
      json: mockJson
    };
    
    next = jest.fn();
  });

  describe('errorHandler', () => {
    describe('HTTP Status Code Mapping', () => {
      it('should handle ValidationError with 400 status', () => {
        const error = new Error('Invalid input') as AppError;
        error.name = 'ValidationError';

        errorHandler(error, req as Request, res as Response, next);

        expect(mockStatus).toHaveBeenCalledWith(400);
        expect(mockJson).toHaveBeenCalledWith({
          success: false,
          error: 'Validation Error: Invalid input'
        });
      });

      it('should handle JsonWebTokenError with 401 status', () => {
        const error = new Error('jwt malformed') as AppError;
        error.name = 'JsonWebTokenError';

        errorHandler(error, req as Request, res as Response, next);

        expect(mockStatus).toHaveBeenCalledWith(401);
        expect(mockJson).toHaveBeenCalledWith({
          success: false,
          error: 'Invalid token'
        });
      });

      it('should handle TokenExpiredError with 401 status', () => {
        const error = new Error('jwt expired') as AppError;
        error.name = 'TokenExpiredError';

        errorHandler(error, req as Request, res as Response, next);

        expect(mockStatus).toHaveBeenCalledWith(401);
        expect(mockJson).toHaveBeenCalledWith({
          success: false,
          error: 'Token expired'
        });
      });

      it('should handle ECONNREFUSED with 503 status', () => {
        const error = new Error('Database connection failed') as AppError;
        error.code = 'ECONNREFUSED';

        errorHandler(error, req as Request, res as Response, next);

        expect(mockStatus).toHaveBeenCalledWith(503);
        expect(mockJson).toHaveBeenCalledWith({
          success: false,
          error: 'Service unavailable - database connection failed'
        });
      });

      it('should handle PostgreSQL unique violation (23505) with 409 status', () => {
        const error = new Error('Duplicate key violation') as AppError;
        error.code = '23505';

        errorHandler(error, req as Request, res as Response, next);

        expect(mockStatus).toHaveBeenCalledWith(409);
        expect(mockJson).toHaveBeenCalledWith({
          success: false,
          error: 'Resource already exists'
        });
      });

      it('should handle PostgreSQL foreign key violation (23503) with 400 status', () => {
        const error = new Error('Foreign key constraint failed') as AppError;
        error.code = '23503';

        errorHandler(error, req as Request, res as Response, next);

        expect(mockStatus).toHaveBeenCalledWith(400);
        expect(mockJson).toHaveBeenCalledWith({
          success: false,
          error: 'Reference constraint violation'
        });
      });

      it('should use custom statusCode when provided', () => {
        const error = new Error('Custom error') as AppError;
        error.statusCode = 422;

        errorHandler(error, req as Request, res as Response, next);

        expect(mockStatus).toHaveBeenCalledWith(422);
        expect(mockJson).toHaveBeenCalledWith({
          success: false,
          error: 'Custom error'
        });
      });

      it('should default to 500 status for unknown errors', () => {
        const error = new Error('Unknown error') as AppError;

        errorHandler(error, req as Request, res as Response, next);

        expect(mockStatus).toHaveBeenCalledWith(500);
        expect(mockJson).toHaveBeenCalledWith({
          success: false,
          error: 'Unknown error'
        });
      });
    });

    describe('Custom Application Errors', () => {
      it('should handle DataSourceError', () => {
        const error = new DataSourceError('Data source failed', 'DATA_ERROR');

        errorHandler(error, req as Request, res as Response, next);

        expect(mockStatus).toHaveBeenCalledWith(500);
        expect(mockJson).toHaveBeenCalledWith({
          success: false,
          error: 'Data source failed'
        });
      });

      it('should handle ConnectionError', () => {
        const error = new ConnectionError('Connection failed');

        errorHandler(error, req as Request, res as Response, next);

        expect(mockStatus).toHaveBeenCalledWith(500);
        expect(mockJson).toHaveBeenCalledWith({
          success: false,
          error: 'Connection failed'
        });
      });

      it('should handle AuthenticationError', () => {
        const error = new AuthenticationError('Auth failed');

        errorHandler(error, req as Request, res as Response, next);

        expect(mockStatus).toHaveBeenCalledWith(500);
        expect(mockJson).toHaveBeenCalledWith({
          success: false,
          error: 'Auth failed'
        });
      });

      it('should handle QueryError', () => {
        const error = new QueryError('Query failed');

        errorHandler(error, req as Request, res as Response, next);

        expect(mockStatus).toHaveBeenCalledWith(500);
        expect(mockJson).toHaveBeenCalledWith({
          success: false,
          error: 'Query failed'
        });
      });

      it('should handle TimeoutError', () => {
        const error = new TimeoutError('Request timeout');

        errorHandler(error, req as Request, res as Response, next);

        expect(mockStatus).toHaveBeenCalledWith(500);
        expect(mockJson).toHaveBeenCalledWith({
          success: false,
          error: 'Request timeout'
        });
      });

      it('should handle CredentialError', () => {
        const error = new CredentialError('Invalid credentials');

        errorHandler(error, req as Request, res as Response, next);

        expect(mockStatus).toHaveBeenCalledWith(500);
        expect(mockJson).toHaveBeenCalledWith({
          success: false,
          error: 'Invalid credentials'
        });
      });
    });

    describe('Error Logging', () => {
      it('should log server errors (>=500) as error level', () => {
        const error = new Error('Internal server error') as AppError;
        error.statusCode = 500;

        errorHandler(error, req as Request, res as Response, next);

        expect(logger.error).toHaveBeenCalledWith('Server Error:', {
          message: 'Internal server error',
          stack: error.stack,
          statusCode: 500,
          isOperational: false,
          url: '/api/test',
          method: 'GET',
          ip: '127.0.0.1',
          userAgent: 'Jest Test Agent',
          userId: 123,
          timestamp: expect.any(String)
        });
      });

      it('should log client errors (<500) as warn level', () => {
        const error = new Error('Bad request') as AppError;
        error.statusCode = 400;

        errorHandler(error, req as Request, res as Response, next);

        expect(logger.warn).toHaveBeenCalledWith('Client Error:', {
          message: 'Bad request',
          stack: error.stack,
          statusCode: 400,
          isOperational: false,
          url: '/api/test',
          method: 'GET',
          ip: '127.0.0.1',
          userAgent: 'Jest Test Agent',
          userId: 123,
          timestamp: expect.any(String)
        });
      });

      it('should include request context in error logging', () => {
        const error = new Error('Test error') as AppError;
        
        // Test with different request context
        const customReq = {
          originalUrl: '/api/users/123',
          method: 'POST',
          ip: '192.168.1.100',
          get: jest.fn().mockReturnValue('Custom User Agent'),
          user: { id: 456 }
        } as any;

        errorHandler(error, customReq as Request, res as Response, next);

        expect(logger.error).toHaveBeenCalledWith('Server Error:', expect.objectContaining({
          url: '/api/users/123',
          method: 'POST',
          ip: '192.168.1.100',
          userAgent: 'Custom User Agent',
          userId: 456
        }));
      });

      it('should handle missing user context gracefully', () => {
        const error = new Error('Test error') as AppError;
        delete (req as any).user;

        errorHandler(error, req as Request, res as Response, next);

        expect(logger.error).toHaveBeenCalledWith('Server Error:', expect.objectContaining({
          userId: undefined
        }));
      });

      it('should handle missing user agent gracefully', () => {
        const error = new Error('Test error') as AppError;
        (req.get as jest.Mock).mockReturnValue(undefined);

        errorHandler(error, req as Request, res as Response, next);

        expect(logger.error).toHaveBeenCalledWith('Server Error:', expect.objectContaining({
          userAgent: undefined
        }));
      });
    });

    describe('Development vs Production Error Responses', () => {
      it('should include stack trace and details in development', () => {
        process.env.NODE_ENV = 'development';
        
        const error = new Error('Development error') as AppError;
        error.statusCode = 500;

        errorHandler(error, req as Request, res as Response, next);

        expect(mockJson).toHaveBeenCalledWith({
          success: false,
          error: 'Development error',
          errorDetails: {
            stack: error.stack,
            details: error,
            statusCode: 500,
            timestamp: expect.any(String)
          }
        });
      });

      it('should not include stack trace in production', () => {
        process.env.NODE_ENV = 'production';
        
        const error = new Error('Production error') as AppError;
        error.statusCode = 500;

        errorHandler(error, req as Request, res as Response, next);

        expect(mockJson).toHaveBeenCalledWith({
          success: false,
          error: 'Production error'
        });
      });

      it('should not include stack trace in test environment', () => {
        process.env.NODE_ENV = 'test';
        
        const error = new Error('Test error') as AppError;
        error.statusCode = 500;

        errorHandler(error, req as Request, res as Response, next);

        expect(mockJson).toHaveBeenCalledWith({
          success: false,
          error: 'Test error'
        });
      });
    });

    describe('Error Message Formatting', () => {
      it('should use default message for errors without message', () => {
        const error = new Error() as AppError;
        error.message = '';

        errorHandler(error, req as Request, res as Response, next);

        expect(mockJson).toHaveBeenCalledWith({
          success: false,
          error: 'Internal Server Error'
        });
      });

      it('should preserve original error message', () => {
        const error = new Error('Original message') as AppError;

        errorHandler(error, req as Request, res as Response, next);

        expect(mockJson).toHaveBeenCalledWith({
          success: false,
          error: 'Original message'
        });
      });

      it('should format ValidationError message correctly', () => {
        const error = new Error('Field is required') as AppError;
        error.name = 'ValidationError';

        errorHandler(error, req as Request, res as Response, next);

        expect(mockJson).toHaveBeenCalledWith({
          success: false,
          error: 'Validation Error: Field is required'
        });
      });
    });

    describe('isOperational Flag Handling', () => {
      it('should respect explicit isOperational flag', () => {
        const error = new Error('Operational error') as AppError;
        error.isOperational = true;

        errorHandler(error, req as Request, res as Response, next);

        expect(logger.error).toHaveBeenCalledWith('Server Error:', expect.objectContaining({
          isOperational: true
        }));
      });

      it('should default isOperational to false', () => {
        const error = new Error('Non-operational error') as AppError;

        errorHandler(error, req as Request, res as Response, next);

        expect(logger.error).toHaveBeenCalledWith('Server Error:', expect.objectContaining({
          isOperational: false
        }));
      });

      it('should set isOperational to true for known error types', () => {
        const error = new Error('Token error') as AppError;
        error.name = 'JsonWebTokenError';

        errorHandler(error, req as Request, res as Response, next);

        expect(logger.warn).toHaveBeenCalledWith('Client Error:', expect.objectContaining({
          isOperational: true
        }));
      });
    });

    describe('Edge Cases', () => {
      it('should handle null error', () => {
        const error = null as any;

        expect(() => {
          errorHandler(error, req as Request, res as Response, next);
        }).toThrow('Cannot read properties of null');
      });

      it('should handle undefined error', () => {
        const error = undefined as any;

        expect(() => {
          errorHandler(error, req as Request, res as Response, next);
        }).toThrow('Cannot read properties of undefined');
      });

      it('should handle error with circular references', () => {
        const error = new Error('Circular error') as AppError;
        (error as any).circular = error; // Create circular reference

        expect(() => {
          errorHandler(error, req as Request, res as Response, next);
        }).not.toThrow();

        expect(mockStatus).toHaveBeenCalledWith(500);
      });

      it('should handle very long error messages', () => {
        const longMessage = 'A'.repeat(10000);
        const error = new Error(longMessage) as AppError;

        errorHandler(error, req as Request, res as Response, next);

        expect(mockJson).toHaveBeenCalledWith({
          success: false,
          error: longMessage
        });
      });
    });
  });

  describe('asyncHandler', () => {
    it('should call next with error for rejected promise', async () => {
      const error = new Error('Async error');
      const asyncFn = jest.fn().mockRejectedValue(error);
      const wrappedFn = asyncHandler(asyncFn);

      await wrappedFn(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(error);
    });

    it('should not call next for successful promise', async () => {
      const asyncFn = jest.fn().mockResolvedValue('success');
      const wrappedFn = asyncHandler(asyncFn);

      await wrappedFn(req as Request, res as Response, next);

      expect(next).not.toHaveBeenCalled();
      expect(asyncFn).toHaveBeenCalledWith(req, res, next);
    });

    it('should handle synchronous functions', async () => {
      const syncFn = jest.fn().mockReturnValue('sync result');
      const wrappedFn = asyncHandler(syncFn);

      await wrappedFn(req as Request, res as Response, next);

      expect(next).not.toHaveBeenCalled();
      expect(syncFn).toHaveBeenCalledWith(req, res, next);
    });

  });

  describe('createError', () => {
    it('should create error with default values', () => {
      const error = createError('Test message');

      expect(error).toBeInstanceOf(Error);
      expect(((error as any)?.message || String(error))).toBe('Test message');
      expect(error.statusCode).toBe(500);
      expect(error.isOperational).toBe(true);
    });

    it('should create error with custom values', () => {
      const error = createError('Custom message', 422, false);

      expect(((error as any)?.message || String(error))).toBe('Custom message');
      expect(error.statusCode).toBe(422);
      expect(error.isOperational).toBe(false);
    });

    it('should create error with partial custom values', () => {
      const error = createError('Message', 404);

      expect(((error as any)?.message || String(error))).toBe('Message');
      expect(error.statusCode).toBe(404);
      expect(error.isOperational).toBe(true);
    });

    it('should preserve stack trace', () => {
      const error = createError('Test error');
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('Test error');
    });
  });

  describe('notFound', () => {
    it('should create 404 error and call next', () => {
      req.originalUrl = '/api/nonexistent';

      notFound(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Route /api/nonexistent not found',
          statusCode: 404,
          isOperational: true
        })
      );
    });

    it('should handle root path', () => {
      req.originalUrl = '/';

      notFound(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Route / not found',
          statusCode: 404
        })
      );
    });

    it('should handle complex paths', () => {
      req.originalUrl = '/api/users/123/reports?filter=active';

      notFound(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Route /api/users/123/reports?filter=active not found',
          statusCode: 404
        })
      );
    });
  });

  describe('Integration Tests', () => {
    it('should handle error flow from notFound through errorHandler', () => {
      req.originalUrl = '/api/missing';

      // Simulate notFound middleware
      notFound(req as Request, res as Response, next);
      
      // Get the error that was passed to next
      const error = (next as jest.Mock).mock.calls[0][0];
      
      // Simulate error handler being called with that error
      errorHandler(error, req as Request, res as Response, next);

      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        error: 'Route /api/missing not found'
      });
    });

    it('should handle async error flow', async () => {
      const error = new Error('Async database error');
      const asyncController = jest.fn().mockRejectedValue(error);
      const wrappedController = asyncHandler(asyncController);

      // Simulate async controller execution
      await wrappedController(req as Request, res as Response, next);
      
      // Get the error that was passed to next
      const caughtError = (next as jest.Mock).mock.calls[0][0];
      
      // Simulate error handler being called
      errorHandler(caughtError, req as Request, res as Response, next);

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(logger.error).toHaveBeenCalledWith('Server Error:', expect.objectContaining({
        message: 'Async database error'
      }));
    });
  });

  describe('Performance Tests', () => {
    it('should handle high-frequency error logging efficiently', () => {
      const errors = Array.from({ length: 100 }, (_, i) => {
        const error = new Error(`Error ${i}`) as AppError;
        error.statusCode = 400 + (i % 100);
        return error;
      });

      const start = Date.now();
      
      errors.forEach(error => {
        errorHandler(error, req as Request, res as Response, next);
      });
      
      const duration = Date.now() - start;
      
      // Should handle 100 errors in under 500ms (performance test)
      expect(duration).toBeLessThan(500);
      expect(logger.warn).toHaveBeenCalledTimes(100);
    });
  });

  describe('Memory Leak Prevention', () => {
    it('should not retain references to request/response objects', () => {
      const error = new Error('Memory test') as AppError;
      
      // Create a request with a large payload to test memory handling
      const largeReq = {
        ...req,
        body: { data: 'x'.repeat(10000) },
        files: { upload: Buffer.alloc(1000) }
      };

      errorHandler(error, largeReq as Request, res as Response, next);

      // The error handler should not keep references to large request data
      const logCall = (logger.error as jest.Mock).mock.calls[0][1];
      expect(logCall.body).toBeUndefined();
      expect(logCall.files).toBeUndefined();
    });
  });
});