import { Request, Response, NextFunction } from 'express';

import {
  handleValidationErrors,
  validate,
  requireJsonBody,
  requireJsonContentType,
  sanitizeInput,
  validatePagination,
  validateSort,
  validateFileUpload,
  validateDateRange,
  validateRequest
} from './validation.middleware';
import { logger } from '@/utils/logger';
import { createError } from '@/middleware/error.middleware';

// Mock dependencies
jest.mock('@/utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  }
}));

jest.mock('@/middleware/error.middleware', () => ({
  createError: jest.fn((message: string, statusCode: number = 500) => {
    const error = new Error(message) as any;
    error.statusCode = statusCode;
    return error;
  })
}));

jest.mock('express-validator', () => ({
  validationResult: jest.fn(),
  ValidationChain: jest.fn()
}));

describe('Validation Middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;
  let mockCreateError: jest.Mock;
  let mockValidationResult: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockCreateError = createError as jest.Mock;
    
    // Get the mocked validationResult function
    const { validationResult } = require('express-validator');
    mockValidationResult = validationResult;
    
    req = {
      method: 'POST',
      path: '/api/test',
      headers: {
        'content-type': 'application/json'
      },
      body: { test: 'data' },
      query: {},
      params: {},
      originalUrl: '/api/test'
    } as Partial<Request>;
    
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    
    next = jest.fn();
  });

  describe('handleValidationErrors', () => {
    describe('Success Cases', () => {
      it('should call next() when no validation errors exist', () => {
        mockValidationResult.mockReturnValue({
          isEmpty: () => true,
          array: () => []
        });

        handleValidationErrors(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith();
        expect(mockCreateError).not.toHaveBeenCalled();
        expect(logger.warn).not.toHaveBeenCalled();
      });
    });

    describe('Validation Error Handling', () => {
      it('should handle single field validation error', () => {
        const mockErrors = [
          {
            type: 'field',
            path: 'email',
            msg: 'Email is required',
            value: undefined
          }
        ];

        mockValidationResult.mockReturnValue({
          isEmpty: () => false,
          array: () => mockErrors
        });

        const mockError = new Error('Validation failed: Email is required');
        mockCreateError.mockReturnValue(mockError);

        handleValidationErrors(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith(
          'Validation failed: Email is required',
          400
        );
        expect(next).toHaveBeenCalledWith(mockError);
        expect((mockError as any).details).toEqual([
          {
            field: 'email',
            message: 'Email is required',
            value: undefined
          }
        ]);
      });

      it('should handle multiple field validation errors', () => {
        const mockErrors = [
          {
            type: 'field',
            path: 'email',
            msg: 'Email is required',
            value: ''
          },
          {
            type: 'field',
            path: 'password',
            msg: 'Password must be at least 8 characters',
            value: '123'
          },
          {
            type: 'field',
            path: 'age',
            msg: 'Age must be a number',
            value: 'invalid'
          }
        ];

        mockValidationResult.mockReturnValue({
          isEmpty: () => false,
          array: () => mockErrors
        });

        const mockError = new Error('Validation failed: Email is required, Password must be at least 8 characters, Age must be a number');
        mockCreateError.mockReturnValue(mockError);

        handleValidationErrors(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith(
          'Validation failed: Email is required, Password must be at least 8 characters, Age must be a number',
          400
        );
        expect((mockError as any).details).toEqual([
          { field: 'email', message: 'Email is required', value: '' },
          { field: 'password', message: 'Password must be at least 8 characters', value: '123' },
          { field: 'age', message: 'Age must be a number', value: 'invalid' }
        ]);
      });

      it('should handle non-field validation errors', () => {
        const mockErrors = [
          {
            type: 'alternative',
            msg: 'At least one field is required',
            nestedErrors: []
          }
        ];

        mockValidationResult.mockReturnValue({
          isEmpty: () => false,
          array: () => mockErrors
        });

        const mockError = new Error('Validation failed: At least one field is required');
        mockCreateError.mockReturnValue(mockError);

        handleValidationErrors(req as Request, res as Response, next);

        expect((mockError as any).details).toEqual([
          {
            field: 'unknown',
            message: 'At least one field is required',
            value: undefined
          }
        ]);
      });

      it('should handle errors with different value types', () => {
        const mockErrors = [
          {
            type: 'field',
            path: 'isActive',
            msg: 'Must be boolean',
            value: 'true'
          },
          {
            type: 'field',
            path: 'count',
            msg: 'Must be number',
            value: null
          },
          {
            type: 'field',
            path: 'tags',
            msg: 'Must be array',
            value: { tag: 'test' }
          }
        ];

        mockValidationResult.mockReturnValue({
          isEmpty: () => false,
          array: () => mockErrors
        });

        const mockError = new Error('Validation failed');
        mockCreateError.mockReturnValue(mockError);

        handleValidationErrors(req as Request, res as Response, next);

        expect((mockError as any).details).toEqual([
          { field: 'isActive', message: 'Must be boolean', value: 'true' },
          { field: 'count', message: 'Must be number', value: null },
          { field: 'tags', message: 'Must be array', value: { tag: 'test' } }
        ]);
      });
    });

    describe('Logging Behavior', () => {
      it('should log validation errors with request context', () => {
        const mockErrors = [
          {
            type: 'field',
            path: 'username',
            msg: 'Username is required',
            value: ''
          }
        ];

        mockValidationResult.mockReturnValue({
          isEmpty: () => false,
          array: () => mockErrors
        });

        req = {
          ...req,
          method: 'POST',
          path: '/api/users',
          body: { email: 'test@example.com' },
          query: { format: 'json' },
          params: { id: '123' }
        };

        handleValidationErrors(req as Request, res as Response, next);

        expect(logger.warn).toHaveBeenCalledWith('Validation errors:', {
          path: '/api/users',
          method: 'POST',
          errors: [
            {
              field: 'username',
              message: 'Username is required',
              value: ''
            }
          ],
          body: { email: 'test@example.com' },
          query: { format: 'json' },
          params: { id: '123' }
        });
      });

      it('should handle missing request context gracefully', () => {
        const mockErrors = [
          {
            type: 'field',
            path: 'field',
            msg: 'Error message',
            value: 'value'
          }
        ];

        mockValidationResult.mockReturnValue({
          isEmpty: () => false,
          array: () => mockErrors
        });

        const minimalReq = { path: '/test', method: 'GET' } as Request;

        handleValidationErrors(minimalReq, res as Response, next);

        expect(logger.warn).toHaveBeenCalledWith('Validation errors:', expect.objectContaining({
          path: '/test',
          method: 'GET',
          errors: expect.any(Array),
          body: undefined,
          query: undefined,
          params: undefined
        }));
      });
    });

    describe('Error Message Formatting', () => {
      it('should handle empty error messages', () => {
        const mockErrors = [
          {
            type: 'field',
            path: 'field',
            msg: '',
            value: 'value'
          }
        ];

        mockValidationResult.mockReturnValue({
          isEmpty: () => false,
          array: () => mockErrors
        });

        handleValidationErrors(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith('Validation failed: ', 400);
      });

      it('should handle very long error messages', () => {
        const longMessage = 'A'.repeat(1000);
        const mockErrors = [
          {
            type: 'field',
            path: 'field',
            msg: longMessage,
            value: 'value'
          }
        ];

        mockValidationResult.mockReturnValue({
          isEmpty: () => false,
          array: () => mockErrors
        });

        handleValidationErrors(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith(`Validation failed: ${longMessage}`, 400);
      });

      it('should handle special characters in error messages', () => {
        const specialMessage = 'Field contains invalid characters: <>&"\'';
        const mockErrors = [
          {
            type: 'field',
            path: 'content',
            msg: specialMessage,
            value: '<script>alert("xss")</script>'
          }
        ];

        mockValidationResult.mockReturnValue({
          isEmpty: () => false,
          array: () => mockErrors
        });

        handleValidationErrors(req as Request, res as Response, next);

        expect(mockCreateError).toHaveBeenCalledWith(`Validation failed: ${specialMessage}`, 400);
      });
    });

    describe('Edge Cases', () => {
      it('should handle validationResult throwing an error', () => {
        mockValidationResult.mockImplementation(() => {
          throw new Error('ValidationResult error');
        });

        expect(() => {
          handleValidationErrors(req as Request, res as Response, next);
        }).toThrow('ValidationResult error');
      });

      it('should handle null validation errors array', () => {
        mockValidationResult.mockReturnValue({
          isEmpty: () => false,
          array: () => null
        });

        expect(() => {
          handleValidationErrors(req as Request, res as Response, next);
        }).toThrow();
      });

      it('should handle malformed error objects', () => {
        const mockErrors = [
          {
            // Missing type field
            path: 'field',
            msg: 'Error message'
          },
          {
            type: 'field',
            // Missing path field
            msg: 'Another error'
          }
        ];

        mockValidationResult.mockReturnValue({
          isEmpty: () => false,
          array: () => mockErrors
        });

        const mockError = new Error('Validation failed');
        mockCreateError.mockReturnValue(mockError);

        handleValidationErrors(req as Request, res as Response, next);

        expect((mockError as any).details).toEqual([
          { field: 'unknown', message: 'Error message', value: undefined },
          { field: undefined, message: 'Another error', value: undefined }
        ]);
      });
    });
  });

  describe('validate', () => {
    it('should return array with validation chains and error handler', () => {
      const mockValidationChain1 = jest.fn() as any;
      const mockValidationChain2 = jest.fn() as any;
      const validationChains = [mockValidationChain1, mockValidationChain2];

      const result = validate(validationChains);

      expect(result).toHaveLength(3);
      expect(result[0]).toBe(mockValidationChain1);
      expect(result[1]).toBe(mockValidationChain2);
      expect(result[2]).toBe(handleValidationErrors);
    });

    it('should handle empty validation chains array', () => {
      const result = validate([]);

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(handleValidationErrors);
    });

    it('should work with validateRequest alias', () => {
      const mockValidationChain = jest.fn() as any;
      const result = validateRequest([mockValidationChain]);

      expect(result).toHaveLength(2);
      expect(result[0]).toBe(mockValidationChain);
      expect(result[1]).toBe(handleValidationErrors);
    });
  });

  describe('requireJsonBody', () => {
    it('should call next() when body exists and has content', () => {
      req.body = { data: 'test' };

      requireJsonBody(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith();
      expect(mockCreateError).not.toHaveBeenCalled();
    });

    it('should call next() with error when body is missing', () => {
      req.body = undefined;
      const mockError = new Error('Request body is required');
      mockCreateError.mockReturnValue(mockError);

      requireJsonBody(req as Request, res as Response, next);

      expect(mockCreateError).toHaveBeenCalledWith('Request body is required', 400);
      expect(next).toHaveBeenCalledWith(mockError);
    });

    it('should call next() with error when body is empty object', () => {
      req.body = {};
      const mockError = new Error('Request body is required');
      mockCreateError.mockReturnValue(mockError);

      requireJsonBody(req as Request, res as Response, next);

      expect(mockCreateError).toHaveBeenCalledWith('Request body is required', 400);
      expect(next).toHaveBeenCalledWith(mockError);
    });

    it('should call next() with error when body is null', () => {
      req.body = null;
      const mockError = new Error('Request body is required');
      mockCreateError.mockReturnValue(mockError);

      requireJsonBody(req as Request, res as Response, next);

      expect(mockCreateError).toHaveBeenCalledWith('Request body is required', 400);
      expect(next).toHaveBeenCalledWith(mockError);
    });

    it('should accept body with nested objects', () => {
      req.body = {
        user: { name: 'John', email: 'john@example.com' },
        preferences: { theme: 'dark' }
      };

      requireJsonBody(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('should accept body with arrays', () => {
      req.body = {
        items: ['item1', 'item2', 'item3']
      };

      requireJsonBody(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith();
    });
  });

  describe('requireJsonContentType', () => {
    it('should call next() for POST with application/json content type', () => {
      req.method = 'POST';
      req.headers = { 'content-type': 'application/json' };

      requireJsonContentType(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith();
      expect(mockCreateError).not.toHaveBeenCalled();
    });

    it('should call next() for PUT with application/json content type', () => {
      req.method = 'PUT';
      req.headers = { 'content-type': 'application/json; charset=utf-8' };

      requireJsonContentType(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('should call next() for PATCH with application/json content type', () => {
      req.method = 'PATCH';
      req.headers = { 'content-type': 'application/json' };

      requireJsonContentType(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('should call next() for GET requests without checking content type', () => {
      req.method = 'GET';
      req.headers = { 'content-type': 'text/html' };

      requireJsonContentType(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith();
      expect(mockCreateError).not.toHaveBeenCalled();
    });

    it('should call next() for DELETE requests without checking content type', () => {
      req.method = 'DELETE';
      req.headers = {};

      requireJsonContentType(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('should call next() with error for POST without content-type header', () => {
      req.method = 'POST';
      req.headers = {};
      const mockError = new Error('Content-Type must be application/json');
      mockCreateError.mockReturnValue(mockError);

      requireJsonContentType(req as Request, res as Response, next);

      expect(mockCreateError).toHaveBeenCalledWith('Content-Type must be application/json', 400);
      expect(next).toHaveBeenCalledWith(mockError);
    });

    it('should call next() with error for POST with wrong content type', () => {
      req.method = 'POST';
      req.headers = { 'content-type': 'text/plain' };
      const mockError = new Error('Content-Type must be application/json');
      mockCreateError.mockReturnValue(mockError);

      requireJsonContentType(req as Request, res as Response, next);

      expect(mockCreateError).toHaveBeenCalledWith('Content-Type must be application/json', 400);
      expect(next).toHaveBeenCalledWith(mockError);
    });

    it('should handle content-type with charset parameter', () => {
      req.method = 'POST';
      req.headers = { 'content-type': 'application/json; charset=utf-8' };

      requireJsonContentType(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('should reject case-sensitive content-type mismatch', () => {
      req = {
        ...req,
        method: 'POST',
        headers: { 'content-type': 'Application/JSON' }
      };
      const mockError = new Error('Content-Type must be application/json');
      mockCreateError.mockReturnValue(mockError);

      requireJsonContentType(req as Request, res as Response, next);

      expect(mockCreateError).toHaveBeenCalledWith('Content-Type must be application/json', 400);
      expect(next).toHaveBeenCalledWith(mockError);
    });
  });

  describe('sanitizeInput', () => {
    it('should sanitize script tags from string values in body', () => {
      req.body = {
        name: 'John<script>alert("xss")</script>Doe',
        description: 'Safe description'
      };

      sanitizeInput(req as Request, res as Response, next);

      expect(req.body).toEqual({
        name: 'JohnDoe',
        description: 'Safe description'
      });
      expect(next).toHaveBeenCalledWith();
    });

    it('should sanitize script tags from query parameters', () => {
      req.query = {
        search: 'term<script>alert("xss")</script>',
        filter: 'safe'
      };

      sanitizeInput(req as Request, res as Response, next);

      expect(req.query).toEqual({
        search: 'term',
        filter: 'safe'
      });
    });

    it('should sanitize script tags from URL parameters', () => {
      req.params = {
        id: '123<script>alert("xss")</script>',
        category: 'safe'
      };

      sanitizeInput(req as Request, res as Response, next);

      expect(req.params).toEqual({
        id: '123',
        category: 'safe'
      });
    });

    it('should sanitize nested objects recursively', () => {
      req.body = {
        user: {
          name: 'John<script>alert("xss")</script>',
          profile: {
            bio: 'Hello<script>alert("nested")</script>World'
          }
        }
      };

      sanitizeInput(req as Request, res as Response, next);

      expect(req.body).toEqual({
        user: {
          name: 'John',
          profile: {
            bio: 'HelloWorld'
          }
        }
      });
    });

    it('should sanitize arrays recursively', () => {
      req.body = {
        tags: [
          'safe',
          'dangerous<script>alert("xss")</script>',
          { name: 'nested<script>alert("nested")</script>' }
        ]
      };

      sanitizeInput(req as Request, res as Response, next);

      expect(req.body).toEqual({
        tags: [
          'safe',
          'dangerous',
          { name: 'nested' }
        ]
      });
    });

    it('should preserve non-string values', () => {
      const testDate = new Date('2023-01-01');
      req.body = {
        count: 42,
        isActive: true,
        date: testDate,
        nullValue: null,
        undefinedValue: undefined
      };

      sanitizeInput(req as Request, res as Response, next);

      // The sanitization creates a new object, so dates will be processed
      expect(req.body.count).toBe(42);
      expect(req.body.isActive).toBe(true);
      expect(req.body.nullValue).toBe(null);
      expect(req.body.undefinedValue).toBe(undefined);
      // Date objects are preserved but might be in a new object
      expect(req.body.date).toBeDefined();
    });

    it('should handle complex script tag variations', () => {
      req.body = {
        content1: 'Hello<SCRIPT>alert("uppercase")</SCRIPT>World',
        content2: 'Hello<script type="text/javascript">alert("typed")</script>World',
        content3: 'Hello<script\nsrc="malicious.js"></script>World',
        content4: 'Hello<script>var x=1; alert(x);</script>World'
      };

      sanitizeInput(req as Request, res as Response, next);

      expect(req.body).toEqual({
        content1: 'HelloWorld',
        content2: 'HelloWorld',
        content3: 'HelloWorld',
        content4: 'HelloWorld'
      });
    });

    it('should handle missing request properties gracefully', () => {
      const minimalReq = { method: 'GET' } as Request;

      sanitizeInput(minimalReq, res as Response, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('should handle sanitization errors', () => {
      // Mock Object.entries to throw an error
      const originalEntries = Object.entries;
      Object.entries = jest.fn(() => {
        throw new Error('Object.entries error');
      });

      req.body = { test: 'value' };

      const mockError = new Error('Input sanitization failed');
      mockCreateError.mockReturnValue(mockError);

      sanitizeInput(req as Request, res as Response, next);

      expect(logger.error).toHaveBeenCalledWith('Input sanitization error:', expect.any(Error));
      expect(mockCreateError).toHaveBeenCalledWith('Input sanitization failed', 500);
      expect(next).toHaveBeenCalledWith(mockError);

      // Restore original Object.entries
      Object.entries = originalEntries;
    });

    it('should not modify original objects when sanitizing', () => {
      const originalBody = {
        content: 'Hello<script>alert("xss")</script>World'
      };
      req.body = originalBody;

      sanitizeInput(req as Request, res as Response, next);

      // The original object should not be the same reference after sanitization
      expect(req.body).not.toBe(originalBody);
    });
  });

  describe('validatePagination', () => {
    it('should set default pagination values', () => {
      req.query = {};

      validatePagination(req as Request, res as Response, next);

      expect((req as any).pagination).toEqual({
        page: 1,
        limit: 50,
        offset: 0
      });
      expect(next).toHaveBeenCalledWith();
    });

    it('should parse valid pagination parameters', () => {
      req.query = {
        page: '3',
        limit: '25'
      };

      validatePagination(req as Request, res as Response, next);

      expect((req as any).pagination).toEqual({
        page: 3,
        limit: 25,
        offset: 50
      });
    });

    it('should handle explicit offset parameter', () => {
      req.query = {
        page: '2',
        limit: '10',
        offset: '100'
      };

      validatePagination(req as Request, res as Response, next);

      expect((req as any).pagination).toEqual({
        page: 2,
        limit: 10,
        offset: 100
      });
    });

    it('should treat page 0 as page 1 due to OR operator', () => {
      req = { ...req, query: { page: '0' } };

      validatePagination(req as Request, res as Response, next);

      expect((req as any).pagination).toEqual({
        page: 1,  // parseInt('0') || 1 = 1
        limit: 50,
        offset: 0
      });
      expect(next).toHaveBeenCalledWith();
    });

    it('should reject negative page', () => {
      req.query = { page: '-1' };
      const mockError = new Error('Page must be greater than 0');
      mockCreateError.mockReturnValue(mockError);

      validatePagination(req as Request, res as Response, next);

      expect(mockCreateError).toHaveBeenCalledWith('Page must be greater than 0', 400);
      expect(next).toHaveBeenCalledWith(mockError);
    });

    it('should treat limit 0 as limit 50 due to OR operator', () => {
      req = { ...req, query: { limit: '0' } };

      validatePagination(req as Request, res as Response, next);

      expect((req as any).pagination).toEqual({
        page: 1,
        limit: 50,  // parseInt('0') || 50 = 50
        offset: 0
      });
      expect(next).toHaveBeenCalledWith();
    });

    it('should reject limit greater than 1000', () => {
      req.query = { limit: '1001' };
      const mockError = new Error('Limit must be between 1 and 1000');
      mockCreateError.mockReturnValue(mockError);

      validatePagination(req as Request, res as Response, next);

      expect(mockCreateError).toHaveBeenCalledWith('Limit must be between 1 and 1000', 400);
      expect(next).toHaveBeenCalledWith(mockError);
    });

    it('should reject negative offset', () => {
      req.query = { offset: '-10' };
      const mockError = new Error('Offset must be greater than or equal to 0');
      mockCreateError.mockReturnValue(mockError);

      validatePagination(req as Request, res as Response, next);

      expect(mockCreateError).toHaveBeenCalledWith('Offset must be greater than or equal to 0', 400);
      expect(next).toHaveBeenCalledWith(mockError);
    });

    it('should handle non-numeric parameters gracefully', () => {
      req.query = {
        page: 'invalid',
        limit: 'also-invalid'
      };

      validatePagination(req as Request, res as Response, next);

      expect((req as any).pagination).toEqual({
        page: 1,
        limit: 50,
        offset: 0
      });
      expect(next).toHaveBeenCalledWith();
    });

    it('should handle parsing errors', () => {
      // Mock parseInt to throw an error
      const originalParseInt = global.parseInt;
      jest.spyOn(global, 'parseInt').mockImplementationOnce(() => {
        throw new Error('Parse error');
      });

      const mockError = new Error('Invalid pagination parameters');
      mockCreateError.mockReturnValue(mockError);

      validatePagination(req as Request, res as Response, next);

      expect(mockCreateError).toHaveBeenCalledWith('Invalid pagination parameters', 400);
      expect(next).toHaveBeenCalledWith(mockError);

      // Restore original parseInt
      global.parseInt = originalParseInt;
    });

    it('should handle boundary values correctly', () => {
      req.query = {
        page: '1',
        limit: '1000',
        offset: '0'
      };

      validatePagination(req as Request, res as Response, next);

      expect((req as any).pagination).toEqual({
        page: 1,
        limit: 1000,
        offset: 0
      });
      expect(next).toHaveBeenCalledWith();
    });
  });

  describe('validateSort', () => {
    const allowedFields = ['name', 'email', 'createdAt', 'updatedAt'];

    it('should set default sort values when no parameters provided', () => {
      req.query = {};
      const sortValidator = validateSort(allowedFields);

      sortValidator(req as Request, res as Response, next);

      expect((req as any).sort).toEqual({
        field: 'name',
        order: 'asc'
      });
      expect(next).toHaveBeenCalledWith();
    });

    it('should validate and set custom sort parameters', () => {
      req.query = {
        sortBy: 'email',
        sortOrder: 'desc'
      };
      const sortValidator = validateSort(allowedFields);

      sortValidator(req as Request, res as Response, next);

      expect((req as any).sort).toEqual({
        field: 'email',
        order: 'desc'
      });
    });

    it('should handle case-insensitive sort order', () => {
      req.query = {
        sortBy: 'createdAt',
        sortOrder: 'DESC'
      };
      const sortValidator = validateSort(allowedFields);

      sortValidator(req as Request, res as Response, next);

      expect((req as any).sort).toEqual({
        field: 'createdAt',
        order: 'desc'
      });
    });

    it('should reject invalid sort field', () => {
      req.query = { sortBy: 'invalidField' };
      const mockError = new Error('Invalid sort field. Allowed fields: name, email, createdAt, updatedAt');
      mockCreateError.mockReturnValue(mockError);
      const sortValidator = validateSort(allowedFields);

      sortValidator(req as Request, res as Response, next);

      expect(mockCreateError).toHaveBeenCalledWith(
        'Invalid sort field. Allowed fields: name, email, createdAt, updatedAt',
        400
      );
      expect(next).toHaveBeenCalledWith(mockError);
    });

    it('should reject invalid sort order', () => {
      req.query = {
        sortBy: 'name',
        sortOrder: 'invalid'
      };
      const mockError = new Error('Sort order must be "asc" or "desc"');
      mockCreateError.mockReturnValue(mockError);
      const sortValidator = validateSort(allowedFields);

      sortValidator(req as Request, res as Response, next);

      expect(mockCreateError).toHaveBeenCalledWith('Sort order must be "asc" or "desc"', 400);
      expect(next).toHaveBeenCalledWith(mockError);
    });

    it('should handle empty allowed fields array', () => {
      req.query = {};
      const sortValidator = validateSort([]);

      sortValidator(req as Request, res as Response, next);

      expect((req as any).sort).toEqual({
        field: 'id',
        order: 'asc'
      });
    });

    it('should use first allowed field as default when no sortBy provided', () => {
      req.query = { sortOrder: 'desc' };
      const customFields = ['username', 'lastName', 'firstName'];
      const sortValidator = validateSort(customFields);

      sortValidator(req as Request, res as Response, next);

      expect((req as any).sort).toEqual({
        field: 'username',
        order: 'desc'
      });
    });

    it('should handle validation errors gracefully', () => {
      const sortValidator = validateSort(allowedFields);
      
      // Mock an error in the try-catch block
      jest.spyOn(String.prototype, 'toLowerCase').mockImplementationOnce(() => {
        throw new Error('toLowerCase error');
      });

      const mockError = new Error('Invalid sort parameters');
      mockCreateError.mockReturnValue(mockError);

      req.query = { sortOrder: 'desc' };
      sortValidator(req as Request, res as Response, next);

      expect(mockCreateError).toHaveBeenCalledWith('Invalid sort parameters', 400);
      expect(next).toHaveBeenCalledWith(mockError);
    });

    it('should handle special characters in field names', () => {
      const specialFields = ['user-name', 'created_at', 'email.address'];
      req.query = { sortBy: 'user-name' };
      const sortValidator = validateSort(specialFields);

      sortValidator(req as Request, res as Response, next);

      expect((req as any).sort).toEqual({
        field: 'user-name',
        order: 'asc'
      });
    });
  });

  describe('validateFileUpload', () => {
    beforeEach(() => {
      (req as any).file = undefined;
      (req as any).files = undefined;
    });

    it('should pass when file is not required and not provided', () => {
      const fileValidator = validateFileUpload({ required: false });

      fileValidator(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('should fail when file is required but not provided', () => {
      const mockError = new Error('File upload is required');
      mockCreateError.mockReturnValue(mockError);
      const fileValidator = validateFileUpload({ required: true });

      fileValidator(req as Request, res as Response, next);

      expect(mockCreateError).toHaveBeenCalledWith('File upload is required', 400);
      expect(next).toHaveBeenCalledWith(mockError);
    });

    it('should validate file type when allowed types are specified', () => {
      (req as any).file = {
        mimetype: 'image/jpeg',
        size: 1000
      };
      const fileValidator = validateFileUpload({
        allowedTypes: ['image/jpeg', 'image/png']
      });

      fileValidator(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('should reject invalid file type', () => {
      (req as any).file = {
        mimetype: 'application/pdf',
        size: 1000
      };
      const mockError = new Error('Invalid file type. Allowed types: image/jpeg, image/png');
      mockCreateError.mockReturnValue(mockError);
      const fileValidator = validateFileUpload({
        allowedTypes: ['image/jpeg', 'image/png']
      });

      fileValidator(req as Request, res as Response, next);

      expect(mockCreateError).toHaveBeenCalledWith(
        'Invalid file type. Allowed types: image/jpeg, image/png',
        400
      );
      expect(next).toHaveBeenCalledWith(mockError);
    });

    it('should validate file size when max size is specified', () => {
      (req as any).file = {
        mimetype: 'image/jpeg',
        size: 5000
      };
      const fileValidator = validateFileUpload({
        maxSize: 10000
      });

      fileValidator(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('should reject file that exceeds max size', () => {
      (req as any).file = {
        mimetype: 'image/jpeg',
        size: 15000
      };
      const mockError = new Error('File too large. Maximum size: 10000 bytes');
      mockCreateError.mockReturnValue(mockError);
      const fileValidator = validateFileUpload({
        maxSize: 10000
      });

      fileValidator(req as Request, res as Response, next);

      expect(mockCreateError).toHaveBeenCalledWith('File too large. Maximum size: 10000 bytes', 400);
      expect(next).toHaveBeenCalledWith(mockError);
    });

    it('should handle multiple files in files array', () => {
      (req as any).files = [
        { mimetype: 'image/jpeg', size: 1000 },
        { mimetype: 'image/png', size: 2000 }
      ];
      const fileValidator = validateFileUpload({ required: true });

      fileValidator(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('should validate all constraints together', () => {
      (req as any).file = {
        mimetype: 'image/png',
        size: 8000
      };
      const fileValidator = validateFileUpload({
        required: true,
        allowedTypes: ['image/jpeg', 'image/png', 'image/gif'],
        maxSize: 10000
      });

      fileValidator(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('should handle validation errors gracefully', () => {
      // Override file object to cause an error
      Object.defineProperty(req, 'file', {
        get: () => {
          throw new Error('File access error');
        }
      });

      const mockError = new Error('File validation failed');
      mockCreateError.mockReturnValue(mockError);

      const fileValidator = validateFileUpload({ allowedTypes: ['image/jpeg'] });
      fileValidator(req as Request, res as Response, next);

      expect(logger.error).toHaveBeenCalledWith('File validation error:', expect.any(Error));
      expect(mockCreateError).toHaveBeenCalledWith('File validation failed', 500);
      expect(next).toHaveBeenCalledWith(mockError);
    });

    it('should handle missing file properties gracefully', () => {
      (req as any).file = {
        // Missing mimetype and size
        originalname: 'test.jpg'
      };
      const fileValidator = validateFileUpload({
        allowedTypes: ['image/jpeg'],
        maxSize: 10000
      });

      fileValidator(req as Request, res as Response, next);

      // Should not throw, but may create validation errors
      expect(next).toHaveBeenCalled();
    });
  });

  describe('validateDateRange', () => {
    it('should pass when no date parameters provided', () => {
      req.query = {};

      validateDateRange(req as Request, res as Response, next);

      expect((req as any).dateRange).toEqual({
        start: null,
        end: null
      });
      expect(next).toHaveBeenCalledWith();
    });

    it('should parse valid date range', () => {
      req.query = {
        startDate: '2023-01-01',
        endDate: '2023-12-31'
      };

      validateDateRange(req as Request, res as Response, next);

      expect((req as any).dateRange).toEqual({
        start: new Date('2023-01-01'),
        end: new Date('2023-12-31')
      });
      expect(next).toHaveBeenCalledWith();
    });

    it('should handle only start date', () => {
      req.query = { startDate: '2023-06-15' };

      validateDateRange(req as Request, res as Response, next);

      expect((req as any).dateRange).toEqual({
        start: new Date('2023-06-15'),
        end: null
      });
    });

    it('should handle only end date', () => {
      req.query = { endDate: '2023-06-15' };

      validateDateRange(req as Request, res as Response, next);

      expect((req as any).dateRange).toEqual({
        start: null,
        end: new Date('2023-06-15')
      });
    });

    it('should reject invalid start date format', () => {
      req.query = { startDate: 'invalid-date' };
      const mockError = new Error('Invalid start date format');
      mockCreateError.mockReturnValue(mockError);

      validateDateRange(req as Request, res as Response, next);

      expect(mockCreateError).toHaveBeenCalledWith('Invalid start date format', 400);
      expect(next).toHaveBeenCalledWith(mockError);
    });

    it('should reject invalid end date format', () => {
      req.query = { endDate: 'not-a-date' };
      const mockError = new Error('Invalid end date format');
      mockCreateError.mockReturnValue(mockError);

      validateDateRange(req as Request, res as Response, next);

      expect(mockCreateError).toHaveBeenCalledWith('Invalid end date format', 400);
      expect(next).toHaveBeenCalledWith(mockError);
    });

    it('should reject when start date is after end date', () => {
      req.query = {
        startDate: '2023-12-31',
        endDate: '2023-01-01'
      };
      const mockError = new Error('Start date must be before end date');
      mockCreateError.mockReturnValue(mockError);

      validateDateRange(req as Request, res as Response, next);

      expect(mockCreateError).toHaveBeenCalledWith('Start date must be before end date', 400);
      expect(next).toHaveBeenCalledWith(mockError);
    });

    it('should accept same start and end date', () => {
      req.query = {
        startDate: '2023-06-15',
        endDate: '2023-06-15'
      };

      validateDateRange(req as Request, res as Response, next);

      expect((req as any).dateRange).toEqual({
        start: new Date('2023-06-15'),
        end: new Date('2023-06-15')
      });
      expect(next).toHaveBeenCalledWith();
    });

    it('should handle different date formats', () => {
      req.query = {
        startDate: '2023-01-01T00:00:00Z',
        endDate: '01/31/2023'
      };

      validateDateRange(req as Request, res as Response, next);

      expect((req as any).dateRange.start).toBeInstanceOf(Date);
      expect((req as any).dateRange.end).toBeInstanceOf(Date);
      expect(next).toHaveBeenCalledWith();
    });

    it('should handle validation errors gracefully', () => {
      // Mock Date.parse to throw an error
      const originalDateParse = Date.parse;
      jest.spyOn(Date, 'parse').mockImplementationOnce(() => {
        throw new Error('Date parse error');
      });

      const mockError = new Error('Invalid date range parameters');
      mockCreateError.mockReturnValue(mockError);

      req.query = { startDate: '2023-01-01' };
      validateDateRange(req as Request, res as Response, next);

      expect(mockCreateError).toHaveBeenCalledWith('Invalid date range parameters', 400);
      expect(next).toHaveBeenCalledWith(mockError);

      // Restore original Date.parse
      Date.parse = originalDateParse;
    });

    it('should handle edge case date values', () => {
      req.query = {
        startDate: '1970-01-01',
        endDate: '2099-12-31'
      };

      validateDateRange(req as Request, res as Response, next);

      expect((req as any).dateRange.start).toEqual(new Date('1970-01-01'));
      expect((req as any).dateRange.end).toEqual(new Date('2099-12-31'));
      expect(next).toHaveBeenCalledWith();
    });
  });

  describe('Integration Tests', () => {
    it('should chain validation middleware correctly', () => {
      const mockValidationChain = jest.fn((req: Request, res: Response, next: NextFunction) => {
        next();
      });

      const validationStack = validate([mockValidationChain as any]);
      
      // Simulate express calling each middleware in sequence
      validationStack[0](req as Request, res as Response, next);
      expect(mockValidationChain).toHaveBeenCalled();
      
      // Simulate no validation errors
      mockValidationResult.mockReturnValue({
        isEmpty: () => true,
        array: () => []
      });
      
      validationStack[1](req as Request, res as Response, next);
      expect(next).toHaveBeenCalledWith();
    });

    it('should handle multiple validation failures in chain', () => {
      req.body = {};
      req.headers = {};
      req.method = 'POST';

      // Test requireJsonBody
      const mockError1 = new Error('Request body is required');
      mockCreateError.mockReturnValueOnce(mockError1);
      requireJsonBody(req as Request, res as Response, next);
      expect(next).toHaveBeenCalledWith(mockError1);

      // Reset next mock
      next = jest.fn();

      // Test requireJsonContentType
      const mockError2 = new Error('Content-Type must be application/json');
      mockCreateError.mockReturnValueOnce(mockError2);
      requireJsonContentType(req as Request, res as Response, next);
      expect(next).toHaveBeenCalledWith(mockError2);
    });

    it('should handle complete request validation flow', () => {
      // Setup a valid request
      req = {
        method: 'POST',
        path: '/api/users',
        headers: { 'content-type': 'application/json' },
        body: { name: 'John Doe', email: 'john@example.com' },
        query: { page: '1', limit: '10', sortBy: 'name', sortOrder: 'asc' },
        params: { id: '123' }
      };

      // Run through validation chain
      requireJsonContentType(req as Request, res as Response, next);
      expect(next).toHaveBeenCalledWith();

      requireJsonBody(req as Request, res as Response, next);
      expect(next).toHaveBeenCalledWith();

      sanitizeInput(req as Request, res as Response, next);
      expect(next).toHaveBeenCalledWith();

      validatePagination(req as Request, res as Response, next);
      expect((req as any).pagination).toBeDefined();

      const sortValidator = validateSort(['name', 'email']);
      sortValidator(req as Request, res as Response, next);
      expect((req as any).sort).toBeDefined();
    });
  });

  describe('Performance Tests', () => {
    it('should handle large request bodies efficiently', () => {
      const largeBody = {
        items: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          name: `Item ${i}`,
          description: 'A'.repeat(100)
        }))
      };
      req.body = largeBody;

      const startTime = Date.now();
      sanitizeInput(req as Request, res as Response, next);
      const endTime = Date.now();

      // Should process large bodies in reasonable time (under 100ms)
      expect(endTime - startTime).toBeLessThan(100);
      expect(next).toHaveBeenCalledWith();
    });

    it('should handle high-frequency validation calls efficiently', () => {
      const requests = Array.from({ length: 100 }, (_, i) => ({
        method: 'GET',
        query: { page: String(i + 1), limit: '10' }
      }));

      const startTime = Date.now();
      
      requests.forEach(testReq => {
        const mockReq = { ...req, ...testReq };
        validatePagination(mockReq as Request, res as Response, jest.fn());
      });
      
      const endTime = Date.now();

      // Should handle 100 validations in under 50ms
      expect(endTime - startTime).toBeLessThan(50);
    });
  });
});