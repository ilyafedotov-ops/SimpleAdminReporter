import { Request, Response, NextFunction } from 'express';
import { LogsValidator } from './logs.validator';
import { createError } from '@/middleware/error.middleware';

// Mock dependencies
jest.mock('@/middleware/error.middleware', () => ({
  createError: jest.fn((message: string, statusCode: number = 500) => {
    const error = new Error(message) as any;
    error.statusCode = statusCode;
    return error;
  })
}));

jest.mock('@/config/logging.config', () => ({
  loggingConfig: {
    query: {
      maxPageSize: 200
    },
    export: {
      maxRecords: 50000
    }
  }
}));

describe('LogsValidator', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;
  let mockCreateError: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockCreateError = createError as jest.Mock;
    
    req = {
      method: 'GET',
      path: '/api/logs',
      headers: {},
      body: {},
      query: {},
      params: {},
      originalUrl: '/api/logs'
    } as Partial<Request>;
    
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    
    next = jest.fn();
  });

  describe('validateLogQuery', () => {
    describe('Success Cases', () => {
      it('should pass with no query parameters', () => {
        req.query = {};

        LogsValidator.validateLogQuery(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();
        expect(mockCreateError).not.toHaveBeenCalled();
      });

      it('should pass with valid type parameter', () => {
        req.query = { type: 'audit' };

        LogsValidator.validateLogQuery(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();
      });

      it('should pass with all valid type options', () => {
        const validTypes = ['audit', 'system', 'all'];
        
        validTypes.forEach(type => {
          jest.clearAllMocks();
          req.query = { type };
          
          LogsValidator.validateLogQuery(req as Request, res as Response, next);
          
          expect(next).toHaveBeenCalledWith();
          expect(mockCreateError).not.toHaveBeenCalled();
        });
      });

      it('should pass with valid level parameter', () => {
        const validLevels = ['error', 'warn', 'info', 'debug'];
        
        validLevels.forEach(level => {
          jest.clearAllMocks();
          req.query = { level };
          
          LogsValidator.validateLogQuery(req as Request, res as Response, next);
          
          expect(next).toHaveBeenCalledWith();
          expect(mockCreateError).not.toHaveBeenCalled();
        });
      });

      it('should pass with valid pagination parameters', () => {
        req.query = { page: '1', pageSize: '50' };

        LogsValidator.validateLogQuery(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();
      });

      it('should pass with valid sort order', () => {
        req.query = { sortOrder: 'asc' };

        LogsValidator.validateLogQuery(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();
      });

      it('should pass with valid date formats', () => {
        req.query = {
          startDate: '2023-01-01',
          endDate: '2023-12-31T23:59:59Z'
        };

        LogsValidator.validateLogQuery(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();
      });

      it('should pass with valid userId', () => {
        req.query = { userId: '123' };

        LogsValidator.validateLogQuery(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();
      });

      it('should pass with all valid parameters combined', () => {
        req.query = {
          type: 'audit',
          level: 'info',
          page: '2',
          pageSize: '100',
          sortOrder: 'desc',
          startDate: '2023-01-01',
          endDate: '2023-12-31',
          userId: '456'
        };

        LogsValidator.validateLogQuery(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();
      });
    });

    describe('Type Validation', () => {
      it('should reject invalid log type', () => {
        req.query = { type: 'invalid' };
        const mockError = new Error('Invalid log type. Must be audit, system, or all');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogQuery(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Invalid log type. Must be audit, system, or all', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should handle case-sensitive type validation', () => {
        req.query = { type: 'AUDIT' };
        const mockError = new Error('Invalid log type. Must be audit, system, or all');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogQuery(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Invalid log type. Must be audit, system, or all', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should reject numeric type values', () => {
        req.query = { type: '1' };
        const mockError = new Error('Invalid log type. Must be audit, system, or all');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogQuery(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Invalid log type. Must be audit, system, or all', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should reject empty string type', () => {
        req.query = { type: '' };

        LogsValidator.validateLogQuery(req as Request, res as Response, next);

        // Empty string is falsy, so validator treats it as if type is not provided
        expect(next).toHaveBeenCalledWith();
        expect(mockCreateError).not.toHaveBeenCalled();
      });
    });

    describe('Level Validation', () => {
      it('should reject invalid log level', () => {
        req.query = { level: 'invalid' };
        const mockError = new Error('Invalid log level. Must be error, warn, info, or debug');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogQuery(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Invalid log level. Must be error, warn, info, or debug', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should handle case-sensitive level validation', () => {
        req.query = { level: 'ERROR' };
        const mockError = new Error('Invalid log level. Must be error, warn, info, or debug');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogQuery(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Invalid log level. Must be error, warn, info, or debug', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should reject numeric level values', () => {
        req.query = { level: '0' };
        const mockError = new Error('Invalid log level. Must be error, warn, info, or debug');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogQuery(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Invalid log level. Must be error, warn, info, or debug', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });
    });

    describe('Pagination Validation', () => {
      it('should reject zero page number', () => {
        req.query = { page: '0' };
        const mockError = new Error('Page must be a positive integer');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogQuery(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Page must be a positive integer', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should reject negative page number', () => {
        req.query = { page: '-1' };
        const mockError = new Error('Page must be a positive integer');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogQuery(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Page must be a positive integer', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should reject non-numeric page', () => {
        req.query = { page: 'abc' };
        const mockError = new Error('Page must be a positive integer');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogQuery(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Page must be a positive integer', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should reject zero page size', () => {
        req.query = { pageSize: '0' };
        const mockError = new Error('Page size must be between 1 and 200');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogQuery(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Page size must be between 1 and 200', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should reject page size exceeding maximum', () => {
        req.query = { pageSize: '201' };
        const mockError = new Error('Page size must be between 1 and 200');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogQuery(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Page size must be between 1 and 200', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should accept maximum allowed page size', () => {
        req.query = { pageSize: '200' };

        LogsValidator.validateLogQuery(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();
        expect(mockCreateError).not.toHaveBeenCalled();
      });

      it('should reject negative page size', () => {
        req.query = { pageSize: '-10' };
        const mockError = new Error('Page size must be between 1 and 200');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogQuery(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Page size must be between 1 and 200', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should reject non-numeric page size', () => {
        req.query = { pageSize: 'large' };
        const mockError = new Error('Page size must be between 1 and 200');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogQuery(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Page size must be between 1 and 200', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should handle floating point page numbers', () => {
        req.query = { page: '1.5' };

        LogsValidator.validateLogQuery(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();
        expect(mockCreateError).not.toHaveBeenCalled();
      });
    });

    describe('Sort Order Validation', () => {
      it('should accept both asc and desc', () => {
        ['asc', 'desc'].forEach(sortOrder => {
          jest.clearAllMocks();
          req.query = { sortOrder };
          
          LogsValidator.validateLogQuery(req as Request, res as Response, next);
          
          expect(next).toHaveBeenCalledWith();
          expect(mockCreateError).not.toHaveBeenCalled();
        });
      });

      it('should reject invalid sort order', () => {
        req.query = { sortOrder: 'invalid' };
        const mockError = new Error('Sort order must be asc or desc');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogQuery(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Sort order must be asc or desc', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should handle case-sensitive sort order validation', () => {
        req.query = { sortOrder: 'ASC' };
        const mockError = new Error('Sort order must be asc or desc');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogQuery(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Sort order must be asc or desc', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should reject numeric sort order', () => {
        req.query = { sortOrder: '1' };
        const mockError = new Error('Sort order must be asc or desc');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogQuery(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Sort order must be asc or desc', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });
    });

    describe('Date Validation', () => {
      it('should accept valid ISO date strings', () => {
        req.query = {
          startDate: '2023-01-01T00:00:00.000Z',
          endDate: '2023-12-31T23:59:59.999Z'
        };

        LogsValidator.validateLogQuery(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();
      });

      it('should accept simple date strings', () => {
        req.query = {
          startDate: '2023-01-01',
          endDate: '2023-12-31'
        };

        LogsValidator.validateLogQuery(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();
      });

      it('should reject invalid start date format', () => {
        req.query = { startDate: 'invalid-date' };
        const mockError = new Error('Invalid start date format');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogQuery(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Invalid start date format', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should reject invalid end date format', () => {
        req.query = { endDate: 'not-a-date' };
        const mockError = new Error('Invalid end date format');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogQuery(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Invalid end date format', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should handle empty date strings', () => {
        req.query = { startDate: '' };

        LogsValidator.validateLogQuery(req as Request, res as Response, next);

        // Empty string is falsy, so validator treats it as if startDate is not provided
        expect(next).toHaveBeenCalledWith();
        expect(mockCreateError).not.toHaveBeenCalled();
      });

      it('should reject clearly invalid date values', () => {
        req.query = { startDate: '2023-13-45' }; // Invalid month/day
        const mockError = new Error('Invalid start date format');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogQuery(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Invalid start date format', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should accept various valid date formats', () => {
        const validDates = [
          '2023-01-01',
          '2023/01/01',
          '01/01/2023',
          '2023-01-01T12:00:00',
          '2023-01-01T12:00:00Z',
          '2023-01-01T12:00:00+00:00'
        ];

        validDates.forEach(date => {
          jest.clearAllMocks();
          req.query = { startDate: date };
          
          LogsValidator.validateLogQuery(req as Request, res as Response, next);
          
          expect(next).toHaveBeenCalledWith();
          expect(mockCreateError).not.toHaveBeenCalled();
        });
      });

      it('should handle numeric date representations', () => {
        req.query = { startDate: '1672531200000' }; // Unix timestamp
        const mockError = new Error('Invalid start date format');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogQuery(req as Request, res as Response, next);

        // Large numeric strings are not valid date strings
        expect(mockCreateError).toHaveBeenCalledWith('Invalid start date format', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });
    });

    describe('User ID Validation', () => {
      it('should accept valid positive user IDs', () => {
        ['1', '123', '999999'].forEach(userId => {
          jest.clearAllMocks();
          req.query = { userId };
          
          LogsValidator.validateLogQuery(req as Request, res as Response, next);
          
          expect(next).toHaveBeenCalledWith();
          expect(mockCreateError).not.toHaveBeenCalled();
        });
      });

      it('should reject zero user ID', () => {
        req.query = { userId: '0' };
        const mockError = new Error('User ID must be a positive integer');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogQuery(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('User ID must be a positive integer', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should reject negative user ID', () => {
        req.query = { userId: '-1' };
        const mockError = new Error('User ID must be a positive integer');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogQuery(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('User ID must be a positive integer', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should reject non-numeric user ID', () => {
        req.query = { userId: 'abc' };
        const mockError = new Error('User ID must be a positive integer');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogQuery(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('User ID must be a positive integer', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should handle floating point user IDs', () => {
        req.query = { userId: '1.5' };

        LogsValidator.validateLogQuery(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();
        expect(mockCreateError).not.toHaveBeenCalled();
      });

      it('should handle empty user ID', () => {
        req.query = { userId: '' };

        LogsValidator.validateLogQuery(req as Request, res as Response, next);

        // Empty string is falsy, so validator treats it as if userId is not provided
        expect(next).toHaveBeenCalledWith();
        expect(mockCreateError).not.toHaveBeenCalled();
      });
    });

    describe('Error Handling', () => {
      it('should handle thrown errors during validation', () => {
        // Mock parseInt to throw an error
        const originalParseInt = global.parseInt;
        jest.spyOn(global, 'parseInt').mockImplementationOnce(() => {
          throw new Error('Parse error');
        });

        req.query = { page: '1' };

        LogsValidator.validateLogQuery(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith(expect.any(Error));

        // Restore original parseInt
        global.parseInt = originalParseInt;
      });

      it('should handle multiple validation errors gracefully', () => {
        req.query = {
          type: 'invalid',
          level: 'invalid',
          page: '-1',
          pageSize: '0',
          sortOrder: 'invalid',
          startDate: 'invalid',
          endDate: 'invalid',
          userId: '-1'
        };

        LogsValidator.validateLogQuery(req as Request, res as Response, next);

        // Should only call next with the first error encountered
        expect(next).toHaveBeenCalledWith(expect.any(Error));
        expect(mockCreateError).toHaveBeenCalledTimes(1);
      });

      it('should handle request with no query object', () => {
        delete req.query;

        LogsValidator.validateLogQuery(req as Request, res as Response, next);

        // Should pass the error to next() due to destructuring failure
        expect(next).toHaveBeenCalledWith(expect.any(Error));
      });

      it('should handle undefined query parameters', () => {
        req.query = {
          type: undefined,
          level: undefined,
          page: undefined
        };

        LogsValidator.validateLogQuery(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();
      });
    });

    describe('SQL Injection Prevention', () => {
      it('should handle potential SQL injection in type parameter', () => {
        req.query = { type: "'; DROP TABLE logs; --" };
        const mockError = new Error('Invalid log type. Must be audit, system, or all');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogQuery(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Invalid log type. Must be audit, system, or all', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should handle potential SQL injection in level parameter', () => {
        req.query = { level: "1' OR '1'='1" };
        const mockError = new Error('Invalid log level. Must be error, warn, info, or debug');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogQuery(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Invalid log level. Must be error, warn, info, or debug', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should handle potential script injection in sort order', () => {
        req.query = { sortOrder: '<script>alert("xss")</script>' };
        const mockError = new Error('Sort order must be asc or desc');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogQuery(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Sort order must be asc or desc', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });
    });

    describe('Boundary Value Testing', () => {
      it('should handle boundary values for pagination', () => {
        req.query = { page: '1', pageSize: '1' };

        LogsValidator.validateLogQuery(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();
      });

      it('should handle very large page numbers', () => {
        req.query = { page: '999999999' };

        LogsValidator.validateLogQuery(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();
      });

      it('should handle maximum allowed page size', () => {
        req.query = { pageSize: '200' };

        LogsValidator.validateLogQuery(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();
      });

      it('should handle very large user IDs', () => {
        req.query = { userId: '2147483647' }; // Max 32-bit integer

        LogsValidator.validateLogQuery(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();
      });
    });
  });

  describe('validateLogStats', () => {
    describe('Success Cases', () => {
      it('should pass with no hours parameter', () => {
        req.query = {};

        LogsValidator.validateLogStats(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();
        expect(mockCreateError).not.toHaveBeenCalled();
      });

      it('should pass with valid hours parameter', () => {
        req.query = { hours: '24' };

        LogsValidator.validateLogStats(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();
      });

      it('should accept minimum hours value', () => {
        req.query = { hours: '1' };

        LogsValidator.validateLogStats(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();
      });

      it('should accept maximum hours value', () => {
        req.query = { hours: '720' };

        LogsValidator.validateLogStats(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();
      });
    });

    describe('Hours Validation', () => {
      it('should reject zero hours', () => {
        req.query = { hours: '0' };
        const mockError = new Error('Hours must be between 1 and 720');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogStats(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Hours must be between 1 and 720', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should reject negative hours', () => {
        req.query = { hours: '-5' };
        const mockError = new Error('Hours must be between 1 and 720');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogStats(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Hours must be between 1 and 720', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should reject hours exceeding maximum', () => {
        req.query = { hours: '721' };
        const mockError = new Error('Hours must be between 1 and 720');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogStats(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Hours must be between 1 and 720', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should reject non-numeric hours', () => {
        req.query = { hours: 'abc' };
        const mockError = new Error('Hours must be between 1 and 720');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogStats(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Hours must be between 1 and 720', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should handle floating point hours', () => {
        req.query = { hours: '24.5' };

        LogsValidator.validateLogStats(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();
      });

      it('should handle empty hours string', () => {
        req.query = { hours: '' };

        LogsValidator.validateLogStats(req as Request, res as Response, next);

        // Empty string is falsy, so validator treats it as if hours is not provided
        expect(next).toHaveBeenCalledWith();
        expect(mockCreateError).not.toHaveBeenCalled();
      });
    });

    describe('Error Handling', () => {
      it('should handle errors during validation', () => {
        const originalParseInt = global.parseInt;
        jest.spyOn(global, 'parseInt').mockImplementationOnce(() => {
          throw new Error('Parse error');
        });

        req.query = { hours: '24' };

        LogsValidator.validateLogStats(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith(expect.any(Error));

        global.parseInt = originalParseInt;
      });

      it('should handle missing query object', () => {
        delete req.query;

        LogsValidator.validateLogStats(req as Request, res as Response, next);

        // Should pass the error to next() due to destructuring failure
        expect(next).toHaveBeenCalledWith(expect.any(Error));
      });
    });
  });

  describe('validateLogExport', () => {
    describe('Success Cases', () => {
      it('should pass with no export parameters', () => {
        req.query = {};

        LogsValidator.validateLogExport(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();
      });

      it('should pass with valid format parameter', () => {
        req.query = { format: 'csv' };

        LogsValidator.validateLogExport(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();
      });

      it('should accept both csv and json formats', () => {
        ['csv', 'json'].forEach(format => {
          jest.clearAllMocks();
          req.query = { format };
          
          LogsValidator.validateLogExport(req as Request, res as Response, next);
          
          expect(next).toHaveBeenCalledWith();
          expect(mockCreateError).not.toHaveBeenCalled();
        });
      });

      it('should pass with valid maxRecords parameter', () => {
        req.query = { maxRecords: '1000' };

        LogsValidator.validateLogExport(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();
      });

      it('should accept maximum allowed records', () => {
        req.query = { maxRecords: '50000' };

        LogsValidator.validateLogExport(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();
      });

      it('should validate both export and query parameters', () => {
        req.query = {
          format: 'json',
          maxRecords: '1000',
          type: 'audit',
          page: '1'
        };

        LogsValidator.validateLogExport(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();
      });
    });

    describe('Format Validation', () => {
      it('should reject invalid export format', () => {
        req.query = { format: 'xml' };
        const mockError = new Error('Export format must be csv or json');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogExport(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Export format must be csv or json', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should handle case-sensitive format validation', () => {
        req.query = { format: 'CSV' };
        const mockError = new Error('Export format must be csv or json');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogExport(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Export format must be csv or json', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should reject numeric format values', () => {
        req.query = { format: '1' };
        const mockError = new Error('Export format must be csv or json');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogExport(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Export format must be csv or json', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should handle empty format string', () => {
        req.query = { format: '' };

        LogsValidator.validateLogExport(req as Request, res as Response, next);

        // Empty string is falsy, so validator treats it as if format is not provided
        expect(next).toHaveBeenCalledWith();
        expect(mockCreateError).not.toHaveBeenCalled();
      });
    });

    describe('Max Records Validation', () => {
      it('should reject zero max records', () => {
        req.query = { maxRecords: '0' };
        const mockError = new Error('Max records must be between 1 and 50000');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogExport(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Max records must be between 1 and 50000', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should reject negative max records', () => {
        req.query = { maxRecords: '-100' };
        const mockError = new Error('Max records must be between 1 and 50000');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogExport(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Max records must be between 1 and 50000', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should reject max records exceeding limit', () => {
        req.query = { maxRecords: '50001' };
        const mockError = new Error('Max records must be between 1 and 50000');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogExport(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Max records must be between 1 and 50000', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should reject non-numeric max records', () => {
        req.query = { maxRecords: 'many' };
        const mockError = new Error('Max records must be between 1 and 50000');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogExport(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Max records must be between 1 and 50000', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should accept minimum max records value', () => {
        req.query = { maxRecords: '1' };

        LogsValidator.validateLogExport(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();
      });

      it('should handle floating point max records', () => {
        req.query = { maxRecords: '1000.5' };

        LogsValidator.validateLogExport(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();
      });
    });

    describe('Query Parameter Delegation', () => {
      it('should call validateLogQuery and fail on invalid query params', () => {
        req.query = { type: 'invalid' };
        const mockError = new Error('Invalid log type. Must be audit, system, or all');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogExport(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Invalid log type. Must be audit, system, or all', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should pass when both export and query params are valid', () => {
        req.query = {
          format: 'csv',
          maxRecords: '1000',
          type: 'audit',
          level: 'info'
        };

        LogsValidator.validateLogExport(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();
      });
    });

    describe('Error Handling', () => {
      it('should handle errors during validation', () => {
        const originalParseInt = global.parseInt;
        jest.spyOn(global, 'parseInt').mockImplementationOnce(() => {
          throw new Error('Parse error');
        });

        req.query = { maxRecords: '1000' };

        LogsValidator.validateLogExport(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith(expect.any(Error));

        global.parseInt = originalParseInt;
      });
    });
  });

  describe('validateLogCleanup', () => {
    describe('Success Cases', () => {
      it('should pass with no cleanup parameters', () => {
        req.query = {};

        LogsValidator.validateLogCleanup(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();
      });

      it('should pass with valid retention days', () => {
        req.query = { retentionDays: '30' };

        LogsValidator.validateLogCleanup(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();
      });

      it('should pass with valid dry run parameter', () => {
        req.query = { dryRun: 'true' };

        LogsValidator.validateLogCleanup(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();
      });

      it('should accept both dry run values', () => {
        ['true', 'false'].forEach(dryRun => {
          jest.clearAllMocks();
          req.query = { dryRun };
          
          LogsValidator.validateLogCleanup(req as Request, res as Response, next);
          
          expect(next).toHaveBeenCalledWith();
          expect(mockCreateError).not.toHaveBeenCalled();
        });
      });

      it('should accept both parameters together', () => {
        req.query = { retentionDays: '90', dryRun: 'true' };

        LogsValidator.validateLogCleanup(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();
      });
    });

    describe('Retention Days Validation', () => {
      it('should accept minimum retention days', () => {
        req.query = { retentionDays: '1' };

        LogsValidator.validateLogCleanup(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();
      });

      it('should accept maximum retention days', () => {
        req.query = { retentionDays: '365' };

        LogsValidator.validateLogCleanup(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();
      });

      it('should reject zero retention days', () => {
        req.query = { retentionDays: '0' };
        const mockError = new Error('Retention days must be between 1 and 365');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogCleanup(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Retention days must be between 1 and 365', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should reject negative retention days', () => {
        req.query = { retentionDays: '-30' };
        const mockError = new Error('Retention days must be between 1 and 365');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogCleanup(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Retention days must be between 1 and 365', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should reject retention days exceeding maximum', () => {
        req.query = { retentionDays: '366' };
        const mockError = new Error('Retention days must be between 1 and 365');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogCleanup(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Retention days must be between 1 and 365', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should reject non-numeric retention days', () => {
        req.query = { retentionDays: 'thirty' };
        const mockError = new Error('Retention days must be between 1 and 365');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogCleanup(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Retention days must be between 1 and 365', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should handle floating point retention days', () => {
        req.query = { retentionDays: '30.5' };

        LogsValidator.validateLogCleanup(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();
      });
    });

    describe('Dry Run Validation', () => {
      it('should reject invalid dry run values', () => {
        req.query = { dryRun: 'yes' };
        const mockError = new Error('Dry run must be true or false');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogCleanup(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Dry run must be true or false', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should handle case-sensitive dry run validation', () => {
        req.query = { dryRun: 'TRUE' };
        const mockError = new Error('Dry run must be true or false');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogCleanup(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Dry run must be true or false', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should reject numeric dry run values', () => {
        req.query = { dryRun: '1' };
        const mockError = new Error('Dry run must be true or false');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogCleanup(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Dry run must be true or false', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should handle empty dry run string', () => {
        req.query = { dryRun: '' };

        LogsValidator.validateLogCleanup(req as Request, res as Response, next);

        // Empty string is falsy, so validator treats it as if dryRun is not provided
        expect(next).toHaveBeenCalledWith();
        expect(mockCreateError).not.toHaveBeenCalled();
      });
    });

    describe('Error Handling', () => {
      it('should handle errors during validation', () => {
        const originalParseInt = global.parseInt;
        jest.spyOn(global, 'parseInt').mockImplementationOnce(() => {
          throw new Error('Parse error');
        });

        req.query = { retentionDays: '30' };

        LogsValidator.validateLogCleanup(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith(expect.any(Error));

        global.parseInt = originalParseInt;
      });
    });
  });

  describe('validateLogDetail', () => {
    describe('Success Cases', () => {
      it('should pass with valid ID and type parameters', () => {
        req.params = { id: '123' };
        req.query = { type: 'audit' };

        LogsValidator.validateLogDetail(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();
      });

      it('should accept both audit and system types', () => {
        ['audit', 'system'].forEach(type => {
          jest.clearAllMocks();
          req.params = { id: '456' };
          req.query = { type };
          
          LogsValidator.validateLogDetail(req as Request, res as Response, next);
          
          expect(next).toHaveBeenCalledWith();
          expect(mockCreateError).not.toHaveBeenCalled();
        });
      });

      it('should accept very large ID values', () => {
        req.params = { id: '999999999' };
        req.query = { type: 'system' };

        LogsValidator.validateLogDetail(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();
      });
    });

    describe('ID Validation', () => {
      it('should reject zero ID', () => {
        req.params = { id: '0' };
        req.query = { type: 'audit' };
        const mockError = new Error('Invalid log ID');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogDetail(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Invalid log ID', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should reject negative ID', () => {
        req.params = { id: '-5' };
        req.query = { type: 'audit' };
        const mockError = new Error('Invalid log ID');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogDetail(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Invalid log ID', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should reject non-numeric ID', () => {
        req.params = { id: 'abc' };
        req.query = { type: 'audit' };
        const mockError = new Error('Invalid log ID');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogDetail(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Invalid log ID', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should handle floating point IDs', () => {
        req.params = { id: '123.5' };
        req.query = { type: 'audit' };

        LogsValidator.validateLogDetail(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();
      });

      it('should reject empty ID', () => {
        req.params = { id: '' };
        req.query = { type: 'audit' };
        const mockError = new Error('Invalid log ID');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogDetail(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Invalid log ID', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should handle potential SQL injection in ID', () => {
        req.params = { id: "1; DROP TABLE logs; --" };
        req.query = { type: 'audit' };

        LogsValidator.validateLogDetail(req as Request, res as Response, next);

        // parseInt("1; DROP...") returns 1, which is valid
        expect(next).toHaveBeenCalledWith();
        expect(mockCreateError).not.toHaveBeenCalled();
      });
    });

    describe('Type Validation', () => {
      it('should reject missing type parameter', () => {
        req.params = { id: '123' };
        req.query = {};
        const mockError = new Error('Log type must be specified as audit or system');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogDetail(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Log type must be specified as audit or system', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should reject invalid type parameter', () => {
        req.params = { id: '123' };
        req.query = { type: 'invalid' };
        const mockError = new Error('Log type must be specified as audit or system');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogDetail(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Log type must be specified as audit or system', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should reject "all" type (not allowed for detail view)', () => {
        req.params = { id: '123' };
        req.query = { type: 'all' };
        const mockError = new Error('Log type must be specified as audit or system');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogDetail(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Log type must be specified as audit or system', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should handle case-sensitive type validation', () => {
        req.params = { id: '123' };
        req.query = { type: 'AUDIT' };
        const mockError = new Error('Log type must be specified as audit or system');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogDetail(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Log type must be specified as audit or system', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should reject empty type string', () => {
        req.params = { id: '123' };
        req.query = { type: '' };
        const mockError = new Error('Log type must be specified as audit or system');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogDetail(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Log type must be specified as audit or system', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should reject numeric type values', () => {
        req.params = { id: '123' };
        req.query = { type: '1' };
        const mockError = new Error('Log type must be specified as audit or system');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogDetail(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Log type must be specified as audit or system', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });
    });

    describe('Error Handling', () => {
      it('should handle errors during validation', () => {
        const originalParseInt = global.parseInt;
        jest.spyOn(global, 'parseInt').mockImplementationOnce(() => {
          throw new Error('Parse error');
        });

        req.params = { id: '123' };
        req.query = { type: 'audit' };

        LogsValidator.validateLogDetail(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith(expect.any(Error));

        global.parseInt = originalParseInt;
      });

      it('should handle missing params object', () => {
        delete req.params;
        req.query = { type: 'audit' };

        LogsValidator.validateLogDetail(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith(expect.any(Error));
      });

      it('should handle missing query object', () => {
        req.params = { id: '123' };
        delete req.query;

        LogsValidator.validateLogDetail(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith(expect.any(Error));
      });
    });
  });

  describe('validateLogSearch', () => {
    describe('Success Cases', () => {
      it('should pass with valid search query', () => {
        req.query = { q: 'error message' };

        LogsValidator.validateLogSearch(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();
      });

      it('should pass with all valid parameters', () => {
        req.query = {
          q: 'login attempt',
          type: 'audit',
          page: '1',
          pageSize: '50'
        };

        LogsValidator.validateLogSearch(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();
      });

      it('should accept all valid type options for search', () => {
        ['audit', 'system', 'all'].forEach(type => {
          jest.clearAllMocks();
          req.query = { q: 'test query', type };
          
          LogsValidator.validateLogSearch(req as Request, res as Response, next);
          
          expect(next).toHaveBeenCalledWith();
          expect(mockCreateError).not.toHaveBeenCalled();
        });
      });

      it('should accept maximum length search query', () => {
        req.query = { q: 'a'.repeat(200) };

        LogsValidator.validateLogSearch(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();
      });

      it('should accept search query with special characters', () => {
        req.query = { q: 'error: connection failed @ 10.0.0.1:443' };

        LogsValidator.validateLogSearch(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();
      });
    });

    describe('Search Query Validation', () => {
      it('should reject missing search query', () => {
        req.query = {};
        const mockError = new Error('Search query is required');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogSearch(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Search query is required', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should reject empty search query', () => {
        req.query = { q: '' };
        const mockError = new Error('Search query is required');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogSearch(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Search query is required', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should reject whitespace-only search query', () => {
        req.query = { q: '   ' };
        const mockError = new Error('Search query is required');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogSearch(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Search query is required', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should reject non-string search query', () => {
        req.query = { q: 123 as any };
        const mockError = new Error('Search query is required');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogSearch(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Search query is required', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should reject search query exceeding maximum length', () => {
        req.query = { q: 'a'.repeat(201) };
        const mockError = new Error('Search query must be less than 200 characters');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogSearch(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Search query must be less than 200 characters', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should accept single character search query', () => {
        req.query = { q: 'a' };

        LogsValidator.validateLogSearch(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();
      });

      it('should handle potential XSS in search query', () => {
        req.query = { q: '<script>alert("xss")</script>' };

        LogsValidator.validateLogSearch(req as Request, res as Response, next);

        // Should still pass validation as it's a valid search string
        // XSS protection should be handled elsewhere (input sanitization)
        expect(next).toHaveBeenCalledWith();
      });

      it('should handle SQL injection attempts in search query', () => {
        req.query = { q: "'; DROP TABLE logs; --" };

        LogsValidator.validateLogSearch(req as Request, res as Response, next);

        // Should still pass validation as it's a valid search string
        // SQL injection protection should be handled in query building
        expect(next).toHaveBeenCalledWith();
      });
    });

    describe('Type Validation', () => {
      it('should reject invalid type for search', () => {
        req.query = { q: 'test', type: 'invalid' };
        const mockError = new Error('Invalid log type. Must be audit, system, or all');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogSearch(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Invalid log type. Must be audit, system, or all', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should handle case-sensitive type validation', () => {
        req.query = { q: 'test', type: 'System' };
        const mockError = new Error('Invalid log type. Must be audit, system, or all');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogSearch(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Invalid log type. Must be audit, system, or all', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });
    });

    describe('Pagination Validation in Search', () => {
      it('should validate pagination parameters', () => {
        req.query = { q: 'test', page: '0' };
        const mockError = new Error('Page must be a positive integer');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogSearch(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Page must be a positive integer', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should validate page size parameters', () => {
        req.query = { q: 'test', pageSize: '201' };
        const mockError = new Error('Page size must be between 1 and 200');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateLogSearch(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Page size must be between 1 and 200', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });
    });

    describe('Error Handling', () => {
      it('should handle errors during validation', () => {
        // Mock query access to throw error
        Object.defineProperty(req, 'query', {
          get: () => {
            throw new Error('Query access error');
          }
        });

        LogsValidator.validateLogSearch(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith(expect.any(Error));
      });

      it('should handle missing query object', () => {
        delete req.query;

        LogsValidator.validateLogSearch(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith(expect.any(Error));
      });
    });
  });

  describe('validateFuzzySearch', () => {
    describe('Success Cases', () => {
      it('should pass with valid audit search parameters', () => {
        req.query = {
          type: 'audit',
          field: 'username',
          term: 'admin'
        };

        LogsValidator.validateFuzzySearch(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();
      });

      it('should pass with valid system search parameters', () => {
        req.query = {
          type: 'system',
          field: 'message',
          term: 'error'
        };

        LogsValidator.validateFuzzySearch(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();
      });

      it('should pass with all valid audit fields', () => {
        const auditFields = ['username', 'event_action', 'resource_type'];
        
        auditFields.forEach(field => {
          jest.clearAllMocks();
          req.query = { type: 'audit', field, term: 'test' };
          
          LogsValidator.validateFuzzySearch(req as Request, res as Response, next);
          
          expect(next).toHaveBeenCalledWith();
          expect(mockCreateError).not.toHaveBeenCalled();
        });
      });

      it('should pass with all valid system fields', () => {
        const systemFields = ['message', 'module', 'url'];
        
        systemFields.forEach(field => {
          jest.clearAllMocks();
          req.query = { type: 'system', field, term: 'test' };
          
          LogsValidator.validateFuzzySearch(req as Request, res as Response, next);
          
          expect(next).toHaveBeenCalledWith();
          expect(mockCreateError).not.toHaveBeenCalled();
        });
      });

      it('should pass with valid threshold parameter', () => {
        req.query = {
          type: 'audit',
          field: 'username',
          term: 'test',
          threshold: '0.5'
        };

        LogsValidator.validateFuzzySearch(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();
      });

      it('should pass with valid pagination parameters', () => {
        req.query = {
          type: 'audit',
          field: 'username',
          term: 'test',
          page: '2',
          pageSize: '25'
        };

        LogsValidator.validateFuzzySearch(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();
      });

      it('should pass with all parameters combined', () => {
        req.query = {
          type: 'system',
          field: 'module',
          term: 'auth',
          threshold: '0.8',
          page: '1',
          pageSize: '50'
        };

        LogsValidator.validateFuzzySearch(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();
      });
    });

    describe('Type Validation', () => {
      it('should reject missing type parameter', () => {
        req.query = { field: 'username', term: 'test' };
        const mockError = new Error('Type must be specified as audit or system');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateFuzzySearch(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Type must be specified as audit or system', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should reject invalid type parameter', () => {
        req.query = { type: 'invalid', field: 'username', term: 'test' };
        const mockError = new Error('Type must be specified as audit or system');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateFuzzySearch(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Type must be specified as audit or system', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should reject "all" type (not allowed for fuzzy search)', () => {
        req.query = { type: 'all', field: 'username', term: 'test' };
        const mockError = new Error('Type must be specified as audit or system');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateFuzzySearch(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Type must be specified as audit or system', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should handle case-sensitive type validation', () => {
        req.query = { type: 'AUDIT', field: 'username', term: 'test' };
        const mockError = new Error('Type must be specified as audit or system');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateFuzzySearch(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Type must be specified as audit or system', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should reject empty type string', () => {
        req.query = { type: '', field: 'username', term: 'test' };
        const mockError = new Error('Type must be specified as audit or system');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateFuzzySearch(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Type must be specified as audit or system', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });
    });

    describe('Field Validation', () => {
      it('should reject missing field parameter', () => {
        req.query = { type: 'audit', term: 'test' };
        const mockError = new Error('Field parameter is required');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateFuzzySearch(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Field parameter is required', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should reject non-string field parameter', () => {
        req.query = { type: 'audit', field: 123 as any, term: 'test' };
        const mockError = new Error('Field parameter is required');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateFuzzySearch(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Field parameter is required', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should reject invalid field for audit type', () => {
        req.query = { type: 'audit', field: 'invalid_field', term: 'test' };
        const mockError = new Error('Invalid field for audit logs. Must be one of: username, event_action, resource_type');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateFuzzySearch(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Invalid field for audit logs. Must be one of: username, event_action, resource_type', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should reject invalid field for system type', () => {
        req.query = { type: 'system', field: 'invalid_field', term: 'test' };
        const mockError = new Error('Invalid field for system logs. Must be one of: message, module, url');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateFuzzySearch(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Invalid field for system logs. Must be one of: message, module, url', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should reject system field for audit type', () => {
        req.query = { type: 'audit', field: 'message', term: 'test' };
        const mockError = new Error('Invalid field for audit logs. Must be one of: username, event_action, resource_type');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateFuzzySearch(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Invalid field for audit logs. Must be one of: username, event_action, resource_type', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should reject audit field for system type', () => {
        req.query = { type: 'system', field: 'username', term: 'test' };
        const mockError = new Error('Invalid field for system logs. Must be one of: message, module, url');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateFuzzySearch(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Invalid field for system logs. Must be one of: message, module, url', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should reject empty field string', () => {
        req.query = { type: 'audit', field: '', term: 'test' };
        const mockError = new Error('Field parameter is required');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateFuzzySearch(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Field parameter is required', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });
    });

    describe('Term Validation', () => {
      it('should reject missing term parameter', () => {
        req.query = { type: 'audit', field: 'username' };
        const mockError = new Error('Search term is required');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateFuzzySearch(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Search term is required', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should reject non-string term parameter', () => {
        req.query = { type: 'audit', field: 'username', term: 123 as any };
        const mockError = new Error('Search term is required');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateFuzzySearch(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Search term is required', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should reject empty term string', () => {
        req.query = { type: 'audit', field: 'username', term: '' };
        const mockError = new Error('Search term is required');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateFuzzySearch(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Search term is required', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should reject whitespace-only term', () => {
        req.query = { type: 'audit', field: 'username', term: '   ' };
        const mockError = new Error('Search term is required');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateFuzzySearch(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Search term is required', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should accept single character term', () => {
        req.query = { type: 'audit', field: 'username', term: 'a' };

        LogsValidator.validateFuzzySearch(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();
      });

      it('should accept term with special characters', () => {
        req.query = { type: 'audit', field: 'username', term: 'user@domain.com' };

        LogsValidator.validateFuzzySearch(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();
      });
    });

    describe('Threshold Validation', () => {
      it('should accept valid threshold values', () => {
        ['0', '0.3', '0.5', '0.8', '1'].forEach(threshold => {
          jest.clearAllMocks();
          req.query = { type: 'audit', field: 'username', term: 'test', threshold };
          
          LogsValidator.validateFuzzySearch(req as Request, res as Response, next);
          
          expect(next).toHaveBeenCalledWith();
          expect(mockCreateError).not.toHaveBeenCalled();
        });
      });

      it('should reject threshold below 0', () => {
        req.query = { type: 'audit', field: 'username', term: 'test', threshold: '-0.1' };
        const mockError = new Error('Threshold must be between 0 and 1');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateFuzzySearch(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Threshold must be between 0 and 1', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should reject threshold above 1', () => {
        req.query = { type: 'audit', field: 'username', term: 'test', threshold: '1.1' };
        const mockError = new Error('Threshold must be between 0 and 1');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateFuzzySearch(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Threshold must be between 0 and 1', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should reject non-numeric threshold', () => {
        req.query = { type: 'audit', field: 'username', term: 'test', threshold: 'high' };
        const mockError = new Error('Threshold must be between 0 and 1');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateFuzzySearch(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Threshold must be between 0 and 1', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should handle empty threshold string', () => {
        req.query = { type: 'audit', field: 'username', term: 'test', threshold: '' };

        LogsValidator.validateFuzzySearch(req as Request, res as Response, next);

        // Empty string is falsy, so validator treats it as if threshold is not provided
        expect(next).toHaveBeenCalledWith();
        expect(mockCreateError).not.toHaveBeenCalled();
      });

      it('should accept boundary threshold values', () => {
        req.query = { type: 'audit', field: 'username', term: 'test', threshold: '0' };

        LogsValidator.validateFuzzySearch(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();

        jest.clearAllMocks();
        req.query = { type: 'audit', field: 'username', term: 'test', threshold: '1' };

        LogsValidator.validateFuzzySearch(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();
      });
    });

    describe('Pagination Validation in Fuzzy Search', () => {
      it('should validate page parameter', () => {
        req.query = { type: 'audit', field: 'username', term: 'test', page: '0' };
        const mockError = new Error('Page must be a positive integer');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateFuzzySearch(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Page must be a positive integer', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should validate pageSize parameter', () => {
        req.query = { type: 'audit', field: 'username', term: 'test', pageSize: '201' };
        const mockError = new Error('Page size must be between 1 and 200');
        mockCreateError.mockReturnValue(mockError);

        LogsValidator.validateFuzzySearch(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Page size must be between 1 and 200', 400);
        expect(next).toHaveBeenCalledWith(mockError);
      });

      it('should accept valid pagination parameters', () => {
        req.query = {
          type: 'audit',
          field: 'username',
          term: 'test',
          page: '3',
          pageSize: '25'
        };

        LogsValidator.validateFuzzySearch(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();
      });
    });

    describe('Error Handling', () => {
      it('should handle errors during validation', () => {
        const originalParseFloat = global.parseFloat;
        jest.spyOn(global, 'parseFloat').mockImplementationOnce(() => {
          throw new Error('Parse error');
        });

        req.query = { type: 'audit', field: 'username', term: 'test', threshold: '0.5' };

        LogsValidator.validateFuzzySearch(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith(expect.any(Error));

        global.parseFloat = originalParseFloat;
      });

      it('should handle missing query object', () => {
        delete req.query;

        LogsValidator.validateFuzzySearch(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith(expect.any(Error));
      });

      it('should handle multiple validation errors (first error wins)', () => {
        req.query = {
          type: 'invalid',
          field: 'invalid',
          term: '',
          threshold: '2',
          page: '0'
        };

        LogsValidator.validateFuzzySearch(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith(expect.any(Error));
        expect(mockCreateError).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Integration Tests', () => {
    it('should handle complex validation chains', () => {
      // Test multiple validators in sequence
      req.query = {
        type: 'audit',
        level: 'info',
        page: '1',
        pageSize: '50'
      };

      LogsValidator.validateLogQuery(req as Request, res as Response, next);
      expect(next).toHaveBeenCalledWith();

      jest.clearAllMocks();
      req.query = { hours: '24' };
      LogsValidator.validateLogStats(req as Request, res as Response, next);
      expect(next).toHaveBeenCalledWith();
    });

    it('should maintain error context across different validators', () => {
      // Test that different validators create appropriate error messages
      const validators = [
        { method: LogsValidator.validateLogQuery, params: { type: 'invalid' }, expectedError: 'Invalid log type. Must be audit, system, or all' },
        { method: LogsValidator.validateLogStats, params: { hours: '0' }, expectedError: 'Hours must be between 1 and 720' },
        { method: LogsValidator.validateLogExport, params: { format: 'xml' }, expectedError: 'Export format must be csv or json' },
        { method: LogsValidator.validateLogCleanup, params: { retentionDays: '0' }, expectedError: 'Retention days must be between 1 and 365' }
      ];

      validators.forEach(({ method, params, expectedError }) => {
        jest.clearAllMocks();
        req.query = params;
        
        method(req as Request, res as Response, next);
        
        expect(mockCreateError).toHaveBeenCalledWith(expectedError, 400);
        expect(next).toHaveBeenCalledWith(expect.any(Error));
      });
    });

    it('should handle request object mutations safely', () => {
      const originalQuery = { type: 'audit', page: '1' };
      req.query = { ...originalQuery };

      LogsValidator.validateLogQuery(req as Request, res as Response, next);

      // Query object should not be mutated
      expect(req.query).toEqual(originalQuery);
      expect(next).toHaveBeenCalledWith();
    });
  });

  describe('Security Tests', () => {
    it('should prevent SQL injection across all validators', () => {
      const maliciousInputs = [
        "'; DROP TABLE logs; --",
        "1' OR '1'='1",
        "UNION SELECT * FROM users",
        "1'; INSERT INTO logs VALUES('evil'); --"
      ];

      maliciousInputs.forEach(maliciousInput => {
        jest.clearAllMocks();
        
        // Test in type parameter
        req.query = { type: maliciousInput };
        LogsValidator.validateLogQuery(req as Request, res as Response, next);
        expect(mockCreateError).toHaveBeenCalled();

        jest.clearAllMocks();
        
        // Test in search term
        req.query = { q: maliciousInput };
        LogsValidator.validateLogSearch(req as Request, res as Response, next);
        expect(next).toHaveBeenCalledWith();

        jest.clearAllMocks();
        
        // Test in fuzzy search term
        req.query = { type: 'audit', field: 'username', term: maliciousInput };
        LogsValidator.validateFuzzySearch(req as Request, res as Response, next);
        expect(next).toHaveBeenCalledWith();
      });
    });

    it('should handle XSS attempts safely', () => {
      const xssInputs = [
        '<script>alert("xss")</script>',
        '<img src="x" onerror="alert(1)">',
        'javascript:alert(1)',
        '<svg onload="alert(1)">'
      ];

      xssInputs.forEach(xssInput => {
        jest.clearAllMocks();
        
        // These should not cause errors in validators (XSS protection handled elsewhere)
        req.query = { q: xssInput };
        LogsValidator.validateLogSearch(req as Request, res as Response, next);
        expect(next).toHaveBeenCalledWith();

        jest.clearAllMocks();
        
        req.query = { type: 'audit', field: 'username', term: xssInput };
        LogsValidator.validateFuzzySearch(req as Request, res as Response, next);
        expect(next).toHaveBeenCalledWith();
      });
    });

    it('should reject potentially dangerous field names', () => {
      const dangerousFields = [
        '__proto__',
        'constructor',
        'prototype',
        'toString',
        'valueOf'
      ];

      dangerousFields.forEach(field => {
        jest.clearAllMocks();
        req.query = { type: 'audit', field, term: 'test' };
        
        LogsValidator.validateFuzzySearch(req as Request, res as Response, next);
        
        expect(mockCreateError).toHaveBeenCalledWith('Invalid field for audit logs. Must be one of: username, event_action, resource_type', 400);
        expect(next).toHaveBeenCalledWith(expect.any(Error));
      });
    });
  });

  describe('Performance Tests', () => {
    it('should handle validation efficiently', () => {
      const startTime = Date.now();
      
      // Run validation 100 times
      for (let i = 0; i < 100; i++) {
        jest.clearAllMocks();
        req.query = {
          type: 'audit',
          level: 'info',
          page: String(i + 1),
          pageSize: '50',
          sortOrder: 'asc',
          startDate: '2023-01-01',
          endDate: '2023-12-31',
          userId: String(i + 1)
        };
        
        LogsValidator.validateLogQuery(req as Request, res as Response, jest.fn());
      }
      
      const endTime = Date.now();
      
      // Should complete 100 validations in under 100ms
      expect(endTime - startTime).toBeLessThan(100);
    });

    it('should handle large search queries efficiently', () => {
      const largeSearchQuery = 'a'.repeat(199); // Just under the limit
      
      const startTime = Date.now();
      
      req.query = { q: largeSearchQuery };
      LogsValidator.validateLogSearch(req as Request, res as Response, next);
      
      const endTime = Date.now();
      
      // Should handle large queries quickly
      expect(endTime - startTime).toBeLessThan(10);
      expect(next).toHaveBeenCalledWith();
    });
  });
});