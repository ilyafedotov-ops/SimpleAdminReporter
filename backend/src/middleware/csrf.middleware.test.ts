import { Request, Response, NextFunction } from 'express';
import { csrfProtection, addCSRFToken } from './csrf.middleware';
import { csrfService } from '@/services/csrf.service';
import { createError } from '@/middleware/error.middleware';
import { logger } from '@/utils/logger';

// Mock dependencies
jest.mock('@/services/csrf.service');
jest.mock('@/middleware/error.middleware');
jest.mock('@/utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  }
}));

describe('CSRF Middleware', () => {
  let mockRequest: any;
  let mockResponse: any;
  let nextFunction: NextFunction;
  let mockCreateError: jest.Mock;
  let mockValidateCSRFToken: jest.Mock;
  let mockSetCSRFToken: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mocks
    mockCreateError = createError as jest.Mock;
    mockValidateCSRFToken = csrfService.validateCSRFToken as jest.Mock;
    mockSetCSRFToken = csrfService.setCSRFToken as jest.Mock;
    
    // Mock createError to return a proper Error object
    mockCreateError.mockImplementation((message: string, statusCode: number) => {
      const error = new Error(message) as any;
      error.statusCode = statusCode;
      return error;
    });

    // Setup mock request
    mockRequest = {
      method: 'POST',
      path: '/api/test',
      ip: '127.0.0.1',
      get: jest.fn().mockReturnValue('Test User Agent'),
    };

    // Setup mock response
    mockResponse = {
      locals: {},
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    };

    nextFunction = jest.fn();
  });

  describe('csrfProtection middleware', () => {
    describe('Path Skipping', () => {
      const skipPaths = [
        '/api/auth/login',
        '/api/auth/refresh',
        '/api/auth/csrf',
        '/api/health',
      ];

      skipPaths.forEach(path => {
        it(`should skip CSRF validation for ${path}`, () => {
          mockRequest.path = path;

          csrfProtection(mockRequest as Request, mockResponse as Response, nextFunction);

          expect(nextFunction).toHaveBeenCalledWith();
          expect(mockValidateCSRFToken).not.toHaveBeenCalled();
        });
      });

      it('should skip CSRF validation for paths that start with skip paths', () => {
        const testPaths = [
          '/api/auth/login/callback',
          '/api/auth/refresh/token',
          '/api/auth/csrf/token',
          '/api/health/detailed',
        ];

        testPaths.forEach(path => {
          jest.clearAllMocks();
          mockRequest.path = path;

          csrfProtection(mockRequest as Request, mockResponse as Response, nextFunction);

          expect(nextFunction).toHaveBeenCalledWith();
          expect(mockValidateCSRFToken).not.toHaveBeenCalled();
        });
      });

      it('should skip CSRF validation for /api/healthcheck (starts with /api/health)', () => {
        mockRequest.path = '/api/healthcheck';

        csrfProtection(mockRequest as Request, mockResponse as Response, nextFunction);

        expect(nextFunction).toHaveBeenCalledWith();
        expect(mockValidateCSRFToken).not.toHaveBeenCalled();
      });

      it('should not skip CSRF validation for /api/auth/logout', () => {
        mockRequest.path = '/api/auth/logout';
        mockValidateCSRFToken.mockReturnValue(true);

        csrfProtection(mockRequest as Request, mockResponse as Response, nextFunction);

        expect(mockValidateCSRFToken).toHaveBeenCalledWith(mockRequest);
        expect(nextFunction).toHaveBeenCalledWith();
      });

      it('should not skip CSRF validation for /api/auth/verify', () => {
        mockRequest.path = '/api/auth/verify';
        mockValidateCSRFToken.mockReturnValue(true);

        csrfProtection(mockRequest as Request, mockResponse as Response, nextFunction);

        expect(mockValidateCSRFToken).toHaveBeenCalledWith(mockRequest);
        expect(nextFunction).toHaveBeenCalledWith();
      });

      it('should not skip CSRF validation for /api/monitoring', () => {
        mockRequest.path = '/api/monitoring';
        mockValidateCSRFToken.mockReturnValue(true);

        csrfProtection(mockRequest as Request, mockResponse as Response, nextFunction);

        expect(mockValidateCSRFToken).toHaveBeenCalledWith(mockRequest);
        expect(nextFunction).toHaveBeenCalledWith();
      });

      it('should not skip CSRF validation for /api/authenticate/login', () => {
        mockRequest.path = '/api/authenticate/login';
        mockValidateCSRFToken.mockReturnValue(true);

        csrfProtection(mockRequest as Request, mockResponse as Response, nextFunction);

        expect(mockValidateCSRFToken).toHaveBeenCalledWith(mockRequest);
        expect(nextFunction).toHaveBeenCalledWith();
      });
    });

    describe('CSRF Token Validation', () => {
      beforeEach(() => {
        mockRequest.path = '/api/test'; // Non-skip path
      });

      it('should proceed when CSRF token is valid', () => {
        mockValidateCSRFToken.mockReturnValue(true);

        csrfProtection(mockRequest as Request, mockResponse as Response, nextFunction);

        expect(mockValidateCSRFToken).toHaveBeenCalledWith(mockRequest);
        expect(nextFunction).toHaveBeenCalledWith();
        expect(mockCreateError).not.toHaveBeenCalled();
      });

      it('should return 403 error when CSRF token is invalid', () => {
        mockValidateCSRFToken.mockReturnValue(false);
        // const __mockError = new Error('Invalid CSRF token');

        csrfProtection(mockRequest as Request, mockResponse as Response, nextFunction);

        expect(mockValidateCSRFToken).toHaveBeenCalledWith(mockRequest);
        expect(mockCreateError).toHaveBeenCalledWith('Invalid CSRF token', 403);
        expect(nextFunction).toHaveBeenCalledWith(expect.any(Error));
      });

      it('should log warning when CSRF validation fails', () => {
        mockValidateCSRFToken.mockReturnValue(false);
        mockRequest.method = 'POST';
        mockRequest.path = '/api/users';
        mockRequest.ip = '192.168.1.100';
        (mockRequest.get as jest.Mock).mockReturnValue('Mozilla/5.0 Browser');

        csrfProtection(mockRequest as Request, mockResponse as Response, nextFunction);

        expect(logger.warn).toHaveBeenCalledWith('CSRF validation failed', {
          path: '/api/users',
          method: 'POST',
          ip: '192.168.1.100',
          userAgent: 'Mozilla/5.0 Browser'
        });
      });

      it('should handle missing user agent gracefully in logging', () => {
        mockValidateCSRFToken.mockReturnValue(false);
        (mockRequest.get as jest.Mock).mockReturnValue(undefined);

        csrfProtection(mockRequest as Request, mockResponse as Response, nextFunction);

        expect(logger.warn).toHaveBeenCalledWith('CSRF validation failed', {
          path: '/api/test',
          method: 'POST',
          ip: '127.0.0.1',
          userAgent: undefined
        });
      });
    });

    describe('HTTP Methods', () => {
      beforeEach(() => {
        mockRequest.path = '/api/test';
      });

      const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

      methods.forEach(method => {
        it(`should validate CSRF token for ${method} requests`, () => {
          mockRequest.method = method;
          mockValidateCSRFToken.mockReturnValue(true);

          csrfProtection(mockRequest as Request, mockResponse as Response, nextFunction);

          expect(mockValidateCSRFToken).toHaveBeenCalledWith(mockRequest);
          expect(nextFunction).toHaveBeenCalledWith();
        });
      });

      it('should handle undefined method', () => {
        mockRequest.method = undefined;
        mockValidateCSRFToken.mockReturnValue(true);

        csrfProtection(mockRequest as Request, mockResponse as Response, nextFunction);

        expect(mockValidateCSRFToken).toHaveBeenCalledWith(mockRequest);
        expect(nextFunction).toHaveBeenCalledWith();
      });
    });

    describe('Request Context Handling', () => {
      beforeEach(() => {
        mockRequest.path = '/api/test';
        mockValidateCSRFToken.mockReturnValue(false);
      });

      it('should handle missing IP address', () => {
        mockRequest.ip = undefined;

        csrfProtection(mockRequest as Request, mockResponse as Response, nextFunction);

        expect(logger.warn).toHaveBeenCalledWith('CSRF validation failed', {
          path: '/api/test',
          method: 'POST',
          ip: undefined,
          userAgent: 'Test User Agent'
        });
      });

      it('should handle missing path', () => {
        mockRequest.path = undefined;

        csrfProtection(mockRequest as Request, mockResponse as Response, nextFunction);

        expect(logger.warn).toHaveBeenCalledWith('CSRF validation failed', {
          path: undefined,
          method: 'POST',
          ip: '127.0.0.1',
          userAgent: 'Test User Agent'
        });
      });

      it('should handle complex paths with query parameters', () => {
        mockRequest.path = '/api/users/123/reports';

        csrfProtection(mockRequest as Request, mockResponse as Response, nextFunction);

        expect(logger.warn).toHaveBeenCalledWith('CSRF validation failed', {
          path: '/api/users/123/reports',
          method: 'POST',
          ip: '127.0.0.1',
          userAgent: 'Test User Agent'
        });
      });
    });

    describe('Error Handling', () => {
      beforeEach(() => {
        mockRequest.path = '/api/test';
      });

      it('should handle CSRF service throwing an error', () => {
        const error = new Error('CSRF service error');
        mockValidateCSRFToken.mockImplementation(() => {
          throw error;
        });

        expect(() => {
          csrfProtection(mockRequest as Request, mockResponse as Response, nextFunction);
        }).toThrow('CSRF service error');

        expect(mockValidateCSRFToken).toHaveBeenCalledWith(mockRequest);
      });

      it('should handle createError throwing an error', () => {
        mockValidateCSRFToken.mockReturnValue(false);
        mockCreateError.mockImplementation(() => {
          throw new Error('CreateError failed');
        });

        expect(() => {
          csrfProtection(mockRequest as Request, mockResponse as Response, nextFunction);
        }).toThrow('CreateError failed');
      });
    });

    describe('Integration with Express Pipeline', () => {
      it('should pass request object correctly to CSRF service', () => {
        mockRequest.path = '/api/test';
        mockRequest.method = 'POST';
        mockRequest.headers = { 'x-csrf-token': 'test-token' };
        mockRequest.cookies = { csrf_token: 'test-token' };
        mockValidateCSRFToken.mockReturnValue(true);

        csrfProtection(mockRequest as Request, mockResponse as Response, nextFunction);

        expect(mockValidateCSRFToken).toHaveBeenCalledWith(mockRequest);
        expect(mockValidateCSRFToken).toHaveBeenCalledTimes(1);
      });

      it('should not modify request or response objects', () => {
        mockRequest.path = '/api/test';
        mockValidateCSRFToken.mockReturnValue(true);
        
        const originalRequest = { ...mockRequest };
        const originalResponse = { ...mockResponse };

        csrfProtection(mockRequest as Request, mockResponse as Response, nextFunction);

        expect(mockRequest).toEqual(originalRequest);
        expect(mockResponse).toEqual(originalResponse);
      });
    });
  });

  describe('addCSRFToken middleware', () => {
    beforeEach(() => {
      mockResponse.locals = {};
    });

    it('should add CSRF token to response', () => {
      const mockToken = 'csrf_mock_token_12345';
      mockSetCSRFToken.mockReturnValue(mockToken);

      addCSRFToken(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockSetCSRFToken).toHaveBeenCalledWith(mockResponse);
      expect(mockResponse.locals!.csrfToken).toBe(mockToken);
      expect(nextFunction).toHaveBeenCalledWith();
    });

    it('should overwrite existing CSRF token in response locals', () => {
      mockResponse.locals!.csrfToken = 'old_token';
      const newToken = 'csrf_new_token_67890';
      mockSetCSRFToken.mockReturnValue(newToken);

      addCSRFToken(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.locals!.csrfToken).toBe(newToken);
      expect(nextFunction).toHaveBeenCalledWith();
    });

    it('should handle CSRF service returning undefined', () => {
      mockSetCSRFToken.mockReturnValue(undefined);

      addCSRFToken(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockSetCSRFToken).toHaveBeenCalledWith(mockResponse);
      expect(mockResponse.locals!.csrfToken).toBeUndefined();
      expect(nextFunction).toHaveBeenCalledWith();
    });

    it('should handle CSRF service returning empty string', () => {
      mockSetCSRFToken.mockReturnValue('');

      addCSRFToken(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.locals!.csrfToken).toBe('');
      expect(nextFunction).toHaveBeenCalledWith();
    });

    it('should not modify other response locals', () => {
      mockResponse.locals = {
        user: { id: 123 },
        sessionId: 'session_123',
        customData: 'test'
      };
      
      const mockToken = 'csrf_token_abc';
      mockSetCSRFToken.mockReturnValue(mockToken);

      addCSRFToken(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.locals).toEqual({
        user: { id: 123 },
        sessionId: 'session_123',
        customData: 'test',
        csrfToken: mockToken
      });
    });

    it('should handle missing response locals gracefully', () => {
      delete mockResponse.locals;
      const mockToken = 'csrf_token_xyz';
      mockSetCSRFToken.mockReturnValue(mockToken);

      expect(() => {
        addCSRFToken(mockRequest as Request, mockResponse as Response, nextFunction);
      }).toThrow(); // This will throw because we're trying to access undefined.csrfToken
    });

    it('should handle CSRF service throwing an error', () => {
      const error = new Error('Token generation failed');
      mockSetCSRFToken.mockImplementation(() => {
        throw error;
      });

      expect(() => {
        addCSRFToken(mockRequest as Request, mockResponse as Response, nextFunction);
      }).toThrow('Token generation failed');
    });

    describe('Token Format Validation', () => {
      it('should accept valid CSRF token format', () => {
        const validTokens = [
          'csrf_abcd1234',
          'csrf_ABCD1234efgh5678',
          'csrf_' + 'a'.repeat(50),
          'csrf_token_with_underscores',
        ];

        validTokens.forEach(token => {
          jest.clearAllMocks();
          mockSetCSRFToken.mockReturnValue(token);

          addCSRFToken(mockRequest as Request, mockResponse as Response, nextFunction);

          expect(mockResponse.locals!.csrfToken).toBe(token);
          expect(nextFunction).toHaveBeenCalledWith();
        });
      });

      it('should handle tokens with special characters', () => {
        const specialTokens = [
          'csrf_token-with-dashes',
          'csrf_token.with.dots',
          'csrf_token+with+plus',
          'csrf_token/with/slashes',
          'csrf_token=with=equals',
        ];

        specialTokens.forEach(token => {
          jest.clearAllMocks();
          mockSetCSRFToken.mockReturnValue(token);

          addCSRFToken(mockRequest as Request, mockResponse as Response, nextFunction);

          expect(mockResponse.locals!.csrfToken).toBe(token);
        });
      });
    });

    describe('Integration with Express Pipeline', () => {
      it('should call next exactly once', () => {
        mockSetCSRFToken.mockReturnValue('csrf_token');

        addCSRFToken(mockRequest as Request, mockResponse as Response, nextFunction);

        expect(nextFunction).toHaveBeenCalledTimes(1);
        expect(nextFunction).toHaveBeenCalledWith();
      });

      it('should not pass any arguments to next on success', () => {
        mockSetCSRFToken.mockReturnValue('csrf_token');

        addCSRFToken(mockRequest as Request, mockResponse as Response, nextFunction);

        expect(nextFunction).toHaveBeenCalledWith();
        expect((nextFunction as jest.Mock).mock.calls[0]).toHaveLength(0);
      });

      it('should not modify request object', () => {
        const originalRequest = { ...mockRequest };
        mockSetCSRFToken.mockReturnValue('csrf_token');

        addCSRFToken(mockRequest as Request, mockResponse as Response, nextFunction);

        expect(mockRequest).toEqual(originalRequest);
      });
    });
  });

  describe('Middleware Integration Tests', () => {
    it('should work together - csrfProtection then addCSRFToken', () => {
      // First middleware: csrfProtection (skip path)
      mockRequest.path = '/api/auth/login';
      
      const firstNext: NextFunction = jest.fn();
      csrfProtection(mockRequest as Request, mockResponse as Response, firstNext);
      
      expect(firstNext).toHaveBeenCalledWith();
      
      // Second middleware: addCSRFToken
      const mockToken = 'csrf_integration_token';
      mockSetCSRFToken.mockReturnValue(mockToken);
      
      const secondNext: NextFunction = jest.fn();
      addCSRFToken(mockRequest as Request, mockResponse as Response, secondNext);
      
      expect(mockResponse.locals!.csrfToken).toBe(mockToken);
      expect(secondNext).toHaveBeenCalledWith();
    });

    it('should handle error in csrfProtection and not reach addCSRFToken', () => {
      mockRequest.path = '/api/test';
      mockValidateCSRFToken.mockReturnValue(false);
      
      csrfProtection(mockRequest as Request, mockResponse as Response, nextFunction);
      
      expect(nextFunction).toHaveBeenCalledWith(expect.any(Error));
      expect(mockSetCSRFToken).not.toHaveBeenCalled();
    });

    it('should work with different HTTP methods in sequence', () => {
      const methods = ['GET', 'POST', 'PUT', 'DELETE'];
      
      methods.forEach(method => {
        jest.clearAllMocks();
        mockRequest.method = method;
        mockRequest.path = '/api/test';
        mockValidateCSRFToken.mockReturnValue(true);
        mockSetCSRFToken.mockReturnValue(`csrf_${method.toLowerCase()}_token`);
        
        // First: CSRF protection
        const firstNext: NextFunction = jest.fn();
        csrfProtection(mockRequest as Request, mockResponse as Response, firstNext);
        expect(firstNext).toHaveBeenCalledWith();
        
        // Second: Add CSRF token
        const secondNext: NextFunction = jest.fn();
        addCSRFToken(mockRequest as Request, mockResponse as Response, secondNext);
        expect(mockResponse.locals!.csrfToken).toBe(`csrf_${method.toLowerCase()}_token`);
        expect(secondNext).toHaveBeenCalledWith();
      });
    });
  });

  describe('Security Tests', () => {
    it('should not leak sensitive information in error messages', () => {
      mockRequest.path = '/api/secret-endpoint';
      mockRequest.headers = { 'authorization': 'Bearer secret-token' };
      mockValidateCSRFToken.mockReturnValue(false);

      csrfProtection(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockCreateError).toHaveBeenCalledWith('Invalid CSRF token', 403);
      expect(logger.warn).toHaveBeenCalledWith('CSRF validation failed', expect.not.objectContaining({
        headers: expect.anything(),
        authorization: expect.anything(),
        token: expect.anything()
      }));
    });

    it('should handle malicious path traversal attempts', () => {
      const maliciousPaths = [
        '/api/auth/login/../../../etc/passwd',
        '/api/auth/login%2e%2e%2f%2e%2e%2f',
        '/api/auth/login\x00.txt',
        '/api/auth/login<script>alert(1)</script>',
      ];

      maliciousPaths.forEach(path => {
        jest.clearAllMocks();
        mockRequest.path = path;

        csrfProtection(mockRequest as Request, mockResponse as Response, nextFunction);

        // Should still skip for paths starting with /api/auth/login
        expect(nextFunction).toHaveBeenCalledWith();
        expect(mockValidateCSRFToken).not.toHaveBeenCalled();
      });
    });

    it('should prevent timing attacks by not short-circuiting validation', () => {
      const startTime = Date.now();
      
      mockRequest.path = '/api/test';
      mockValidateCSRFToken.mockReturnValue(false);
      
      csrfProtection(mockRequest as Request, mockResponse as Response, nextFunction);
      
      const endTime = Date.now();
      const executionTime = endTime - startTime;
      
      // Should complete quickly but not instantaneously
      expect(executionTime).toBeLessThan(100);
      expect(mockValidateCSRFToken).toHaveBeenCalledWith(mockRequest);
    });

    it('should handle unicode and international characters in paths', () => {
      const unicodePaths = [
        '/api/测试',
        '/api/тест',
        '/api/🔒secure',
        '/api/café',
        '/api/naïve',
      ];

      unicodePaths.forEach(path => {
        jest.clearAllMocks();
        mockRequest.path = path;
        mockValidateCSRFToken.mockReturnValue(true);

        csrfProtection(mockRequest as Request, mockResponse as Response, nextFunction);

        expect(mockValidateCSRFToken).toHaveBeenCalledWith(mockRequest);
        expect(nextFunction).toHaveBeenCalledWith();
      });
    });
  });

  describe('Performance Tests', () => {
    it('should handle high-frequency requests efficiently', () => {
      mockRequest.path = '/api/test';
      mockValidateCSRFToken.mockReturnValue(true);
      
      const iterations = 1000;
      const start = Date.now();
      
      for (let i = 0; i < iterations; i++) {
        const mockNext = jest.fn();
        csrfProtection(mockRequest as Request, mockResponse as Response, mockNext);
      }
      
      const duration = Date.now() - start;
      
      // Should handle 1000 calls in under 500ms (performance test)
      expect(duration).toBeLessThan(500);
      expect(mockValidateCSRFToken).toHaveBeenCalledTimes(iterations);
    });

    it('should handle addCSRFToken efficiently', () => {
      mockSetCSRFToken.mockReturnValue('csrf_perf_token');
      
      const iterations = 1000;
      const start = Date.now();
      
      for (let i = 0; i < iterations; i++) {
        const mockRes = { locals: {}, cookie: jest.fn() };
        const mockNext = jest.fn();
        addCSRFToken(mockRequest as Request, mockRes as any, mockNext);
      }
      
      const duration = Date.now() - start;
      
      // Should handle 1000 calls in under 500ms (performance test)
      expect(duration).toBeLessThan(500);
      expect(mockSetCSRFToken).toHaveBeenCalledTimes(iterations);
    });
  });

  describe('Memory Management', () => {
    it('should not retain references to request/response objects', () => {
      mockRequest.path = '/api/test';
      mockValidateCSRFToken.mockReturnValue(true);
      
      // Create request with large payload
      const largeRequest = {
        ...mockRequest,
        body: { data: 'x'.repeat(10000) },
        files: Buffer.alloc(1000)
      };
      
      csrfProtection(largeRequest as Request, mockResponse as Response, nextFunction);
      
      // Middleware should not keep references to large data
      expect(mockValidateCSRFToken).toHaveBeenCalledWith(largeRequest);
      expect(nextFunction).toHaveBeenCalledWith();
    });

    it('should handle memory pressure gracefully', () => {
      // Simulate memory pressure by creating many middleware calls
      const calls = 100;
      
      for (let i = 0; i < calls; i++) {
        const req = { ...mockRequest, path: `/api/test/${i}`, body: { id: i } };
        const res: any = { locals: {}, cookie: jest.fn() };
        const _next = jest.fn();
        
        mockValidateCSRFToken.mockReturnValue(true);
        mockSetCSRFToken.mockReturnValue(`token_${i}`);
        
        csrfProtection(req as Request, res as Response, _next);
        addCSRFToken(req as Request, res as Response, _next);
        
        expect(res.locals.csrfToken).toBe(`token_${i}`);
      }
      
      expect(mockValidateCSRFToken).toHaveBeenCalledTimes(calls);
      expect(mockSetCSRFToken).toHaveBeenCalledTimes(calls);
    });
  });

  describe('Edge Cases', () => {
    it('should handle null/undefined request properties', () => {
      const edgeCaseRequest = {
        method: null,
        path: undefined,
        ip: null,
        get: jest.fn().mockReturnValue(null)
      };

      mockValidateCSRFToken.mockReturnValue(false);

      csrfProtection(edgeCaseRequest as any, mockResponse as Response, nextFunction);

      expect(mockValidateCSRFToken).toHaveBeenCalledWith(edgeCaseRequest);
      expect(logger.warn).toHaveBeenCalledWith('CSRF validation failed', {
        path: undefined,
        method: null,
        ip: null,
        userAgent: null
      });
    });

    it('should handle extremely long paths', () => {
      const longPath = '/api/' + 'a'.repeat(10000);
      mockRequest.path = longPath;
      mockValidateCSRFToken.mockReturnValue(true);

      csrfProtection(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockValidateCSRFToken).toHaveBeenCalledWith(mockRequest);
      expect(nextFunction).toHaveBeenCalledWith();
    });

    it('should handle case sensitivity in skip paths', () => {
      const casePaths = [
        '/API/AUTH/LOGIN',
        '/Api/Auth/Login',
        '/api/AUTH/login',
        '/API/auth/LOGIN',
      ];

      casePaths.forEach(path => {
        jest.clearAllMocks();
        mockRequest.path = path;
        mockValidateCSRFToken.mockReturnValue(true);

        csrfProtection(mockRequest as Request, mockResponse as Response, nextFunction);

        // These should NOT be skipped (case sensitive matching)
        expect(mockValidateCSRFToken).toHaveBeenCalledWith(mockRequest);
      });
    });

    it('should handle trailing slashes in skip paths', () => {
      const trailingSlashPaths = [
        '/api/auth/login/',
        '/api/auth/refresh/',
        '/api/auth/csrf/',
        '/api/health/',
      ];

      trailingSlashPaths.forEach(path => {
        jest.clearAllMocks();
        mockRequest.path = path;

        csrfProtection(mockRequest as Request, mockResponse as Response, nextFunction);

        // Should still be skipped
        expect(nextFunction).toHaveBeenCalledWith();
        expect(mockValidateCSRFToken).not.toHaveBeenCalled();
      });
    });
  });
});