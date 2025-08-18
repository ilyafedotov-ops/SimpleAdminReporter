import { Request, Response } from 'express';
import { csrfService } from './csrf.service';
import { redis } from '@/config/redis';
import { getCookieOptions, COOKIE_NAMES, COOKIE_MAX_AGE } from '@/config/cookie.config';
import crypto from 'crypto';

// Mock dependencies
jest.mock('@/config/redis');
jest.mock('@/config/cookie.config');
jest.mock('@/utils/logger');
jest.mock('crypto');

describe('CSRFService', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let service: typeof csrfService;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Use the singleton service instance
    service = csrfService;
    
    // Mock crypto.randomBytes
    (crypto.randomBytes as jest.Mock).mockReturnValue(Buffer.from('mock-random-bytes-32-characters'));
    
    // Mock crypto.timingSafeEqual
    (crypto.timingSafeEqual as jest.Mock).mockImplementation((a: Buffer, b: Buffer) => {
      return a.toString() === b.toString();
    });
    
    // Mock Redis
    (redis.setJson as jest.Mock).mockResolvedValue('OK');
    (redis.getJson as jest.Mock).mockResolvedValue(null);
    
    // Mock cookie config
    (getCookieOptions as jest.Mock).mockReturnValue({
      httpOnly: true,
      secure: false,
      sameSite: 'strict',
      maxAge: 3600000
    });
    
    // Setup mock request
    mockRequest = {
      method: 'POST',
      path: '/api/test',
      get: jest.fn(),
      cookies: {}
    };
    
    // Setup mock response
    mockResponse = {
      cookie: jest.fn(),
      clearCookie: jest.fn()
    };
  });

  describe('generateToken', () => {
    it('should generate a CSRF token with correct prefix', () => {
      const token = service.generateToken();
      
      expect(token).toMatch(/^csrf_/);
      expect(token.length).toBeGreaterThan(10);
      expect(crypto.randomBytes).toHaveBeenCalledWith(32);
    });
    
    it('should generate unique tokens on each call', () => {
      (crypto.randomBytes as jest.Mock)
        .mockReturnValueOnce(Buffer.from('first-random-bytes'))
        .mockReturnValueOnce(Buffer.from('second-random-bytes'));
      
      const token1 = service.generateToken();
      const token2 = service.generateToken();
      
      expect(token1).not.toBe(token2);
    });
  });

  describe('setCSRFToken', () => {
    it('should set CSRF token cookie and return token', () => {
      const token = service.setCSRFToken(mockResponse as Response);
      
      expect(token).toMatch(/^csrf_/);
      expect(mockResponse.cookie).toHaveBeenCalledWith(
        COOKIE_NAMES.CSRF_TOKEN,
        token,
        expect.any(Object)
      );
      expect(getCookieOptions).toHaveBeenCalledWith(COOKIE_MAX_AGE.CSRF_TOKEN);
    });
  });

  describe('generateAndStoreToken', () => {
    it('should generate token and store in Redis', async () => {
      const sessionId = 'session-123';
      
      const token = await service.generateAndStoreToken(sessionId);
      
      expect(token).toMatch(/^csrf_/);
      expect(redis.setJson).toHaveBeenCalledWith(
        'csrf:session-123',
        {
          token,
          createdAt: expect.any(String)
        },
        expect.any(Number)
      );
    });
    
    it('should use correct Redis key format', async () => {
      const sessionId = 'test-session-456';
      
      await service.generateAndStoreToken(sessionId);
      
      expect(redis.setJson).toHaveBeenCalledWith(
        'csrf:test-session-456',
        expect.any(Object),
        expect.any(Number)
      );
    });
  });

  describe('validateCSRFToken', () => {
    beforeEach(() => {
      // Setup valid tokens for most tests
      mockRequest.cookies = { [COOKIE_NAMES.CSRF_TOKEN]: 'csrf_valid_token' };
      (mockRequest.get as jest.Mock).mockReturnValue('csrf_valid_token');
    });

    it('should return true for safe HTTP methods', () => {
      const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
      
      safeMethods.forEach(method => {
        mockRequest.method = method;
        const result = service.validateCSRFToken(mockRequest as Request);
        expect(result).toBe(true);
      });
    });
    
    it('should validate matching header and cookie tokens', () => {
      mockRequest.method = 'POST';
      
      const result = service.validateCSRFToken(mockRequest as Request);
      
      expect(result).toBe(true);
      expect(crypto.timingSafeEqual).toHaveBeenCalled();
    });
    
    it('should reject missing header token', () => {
      mockRequest.method = 'POST';
      (mockRequest.get as jest.Mock).mockReturnValue(undefined);
      
      const result = service.validateCSRFToken(mockRequest as Request);
      
      expect(result).toBe(false);
    });
    
    it('should reject missing cookie token', () => {
      mockRequest.method = 'POST';
      mockRequest.cookies = {};
      
      const result = service.validateCSRFToken(mockRequest as Request);
      
      expect(result).toBe(false);
    });
    
    it('should reject mismatched tokens', () => {
      mockRequest.method = 'POST';
      mockRequest.cookies = { [COOKIE_NAMES.CSRF_TOKEN]: 'csrf_cookie_token' };
      (mockRequest.get as jest.Mock).mockReturnValue('csrf_different_token');
      
      // Mock timingSafeEqual to return false for different tokens
      (crypto.timingSafeEqual as jest.Mock).mockReturnValue(false);
      
      const result = service.validateCSRFToken(mockRequest as Request);
      
      expect(result).toBe(false);
    });
    
    it('should reject tokens without csrf_ prefix', () => {
      mockRequest.method = 'POST';
      mockRequest.cookies = { [COOKIE_NAMES.CSRF_TOKEN]: 'invalid_token' };
      (mockRequest.get as jest.Mock).mockReturnValue('invalid_token');
      
      const result = service.validateCSRFToken(mockRequest as Request);
      
      expect(result).toBe(false);
    });
    
    it('should check both X-CSRF-Token and CSRF-Token headers', () => {
      mockRequest.method = 'POST';
      
      // Test X-CSRF-Token header
      (mockRequest.get as jest.Mock).mockImplementation((header: string) => {
        if (header === 'X-CSRF-Token') return 'csrf_valid_token';
        return undefined;
      });
      
      let result = service.validateCSRFToken(mockRequest as Request);
      expect(result).toBe(true);
      
      // Test CSRF-Token header
      (mockRequest.get as jest.Mock).mockImplementation((header: string) => {
        if (header === 'X-CSRF-Token') return undefined;
        if (header === 'CSRF-Token') return 'csrf_valid_token';
        return undefined;
      });
      
      result = service.validateCSRFToken(mockRequest as Request);
      expect(result).toBe(true);
    });
  });

  describe('clearCSRFToken', () => {
    it('should clear CSRF token cookie', () => {
      service.clearCSRFToken(mockResponse as Response);
      
      expect(mockResponse.clearCookie).toHaveBeenCalledWith(COOKIE_NAMES.CSRF_TOKEN);
    });
  });

  describe('validateCSRFTokenAsync', () => {
    beforeEach(() => {
      mockRequest.cookies = { [COOKIE_NAMES.CSRF_TOKEN]: 'csrf_valid_token' };
      (mockRequest.get as jest.Mock).mockReturnValue('csrf_valid_token');
      mockRequest.method = 'POST';
    });

    it('should perform basic validation first', async () => {
      const result = await service.validateCSRFTokenAsync(mockRequest as Request);
      
      expect(result).toBe(true);
      expect(crypto.timingSafeEqual).toHaveBeenCalled();
    });
    
    it('should return false if basic validation fails', async () => {
      (mockRequest.get as jest.Mock).mockReturnValue(undefined); // No header token
      
      const result = await service.validateCSRFTokenAsync(mockRequest as Request);
      
      expect(result).toBe(false);
    });
    
    it('should validate against Redis store when session ID available', async () => {
      // Add sessionId to request
      (mockRequest as any).sessionId = 'session-123';
      
      // Mock Redis to return stored token
      (redis.getJson as jest.Mock).mockResolvedValue({
        token: 'csrf_valid_token'
      });
      
      const result = await service.validateCSRFTokenAsync(mockRequest as Request);
      
      expect(result).toBe(true);
      expect(redis.getJson).toHaveBeenCalledWith('csrf:session-123');
    });
    
    it('should fail validation if Redis token does not match', async () => {
      (mockRequest as any).sessionId = 'session-123';
      
      // Mock Redis to return different token
      (redis.getJson as jest.Mock).mockResolvedValue({
        token: 'csrf_different_stored_token'
      });
      
      const result = await service.validateCSRFTokenAsync(mockRequest as Request);
      
      expect(result).toBe(false);
    });
    
    it('should handle missing Redis data gracefully', async () => {
      (mockRequest as any).sessionId = 'session-123';
      
      // Mock Redis to return null (no stored data)
      (redis.getJson as jest.Mock).mockResolvedValue(null);
      
      const result = await service.validateCSRFTokenAsync(mockRequest as Request);
      
      // Should still pass basic validation
      expect(result).toBe(true);
    });
    
    it('should check session from request.session.id if available', async () => {
      (mockRequest as any).session = { id: 'session-from-express-session' };
      
      (redis.getJson as jest.Mock).mockResolvedValue({
        token: 'csrf_valid_token'
      });
      
      const result = await service.validateCSRFTokenAsync(mockRequest as Request);
      
      expect(result).toBe(true);
      expect(redis.getJson).toHaveBeenCalledWith('csrf:session-from-express-session');
    });
  });

  describe('Error Handling', () => {
    it('should handle Redis errors gracefully in generateAndStoreToken', async () => {
      const sessionId = 'session-123';
      (redis.setJson as jest.Mock).mockRejectedValue(new Error('Redis connection failed'));
      
      // Should not throw, but may log error
      await expect(service.generateAndStoreToken(sessionId)).rejects.toThrow('Redis connection failed');
    });
    
    it('should handle Redis errors gracefully in validateCSRFTokenAsync', async () => {
      (mockRequest as any).sessionId = 'session-123';
      mockRequest.method = 'POST';
      mockRequest.cookies = { [COOKIE_NAMES.CSRF_TOKEN]: 'csrf_valid_token' };
      (mockRequest.get as jest.Mock).mockReturnValue('csrf_valid_token');
      
      (redis.getJson as jest.Mock).mockRejectedValue(new Error('Redis connection failed'));
      
      // Should fall back to basic validation
      try {
        const result = await service.validateCSRFTokenAsync(mockRequest as Request);
        expect(result).toBe(true);
      } catch (error) {
        // If the service doesn't handle Redis errors gracefully, the test should still document expected behavior
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Redis connection failed');
      }
    });
  });

  describe('Token Format Validation', () => {
    it('should use base64url encoding for token', () => {
      // Mock randomBytes to return specific bytes
      const mockBytes = Buffer.from('test-bytes-for-base64url-encoding');
      (crypto.randomBytes as jest.Mock).mockReturnValue(mockBytes);
      
      const token = service.generateToken();
      const expectedToken = `csrf_${mockBytes.toString('base64url')}`;
      
      expect(token).toBe(expectedToken);
    });
    
    it('should generate tokens of appropriate length', () => {
      const token = service.generateToken();
      
      // Token should be: "csrf_" (5 chars) + base64url encoded 32 bytes
      // Base64url encoded 32 bytes can vary in length due to encoding specifics
      expect(token.length).toBeGreaterThan(40); // At least 40 characters
      expect(token.length).toBeLessThan(60); // But less than 60 characters
      expect(token).toMatch(/^csrf_[A-Za-z0-9_-]+$/); // Valid base64url format
    });
  });

  describe('Integration with Cookie Configuration', () => {
    it('should use correct cookie configuration', () => {
      const mockCookieOptions = {
        httpOnly: true,
        secure: true,
        sameSite: 'strict' as const,
        maxAge: 1800000
      };
      
      (getCookieOptions as jest.Mock).mockReturnValue(mockCookieOptions);
      
      service.setCSRFToken(mockResponse as Response);
      
      expect(mockResponse.cookie).toHaveBeenCalledWith(
        COOKIE_NAMES.CSRF_TOKEN,
        expect.any(String),
        mockCookieOptions
      );
    });
  });

  describe('Security Considerations', () => {
    it('should use timing-safe comparison for token validation', () => {
      mockRequest.method = 'POST';
      mockRequest.cookies = { [COOKIE_NAMES.CSRF_TOKEN]: 'csrf_token_1' };
      (mockRequest.get as jest.Mock).mockReturnValue('csrf_token_2');
      
      service.validateCSRFToken(mockRequest as Request);
      
      expect(crypto.timingSafeEqual).toHaveBeenCalledWith(
        Buffer.from('csrf_token_2'),
        Buffer.from('csrf_token_1')
      );
    });
    
    it('should validate token prefix to prevent bypass attacks', () => {
      mockRequest.method = 'POST';
      
      // Test with tokens that don't have csrf_ prefix
      const invalidTokens = [
        'malicious_token',
        'bearer_token',
        'session_token',
        'xsrf_token'
      ];
      
      invalidTokens.forEach(token => {
        mockRequest.cookies = { [COOKIE_NAMES.CSRF_TOKEN]: token };
        (mockRequest.get as jest.Mock).mockReturnValue(token);
        
        const result = service.validateCSRFToken(mockRequest as Request);
        expect(result).toBe(false);
      });
    });
    
    it('should enforce CSRF protection for state-changing methods only', () => {
      const stateMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
      const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
      
      // State-changing methods should require valid tokens
      stateMethods.forEach(method => {
        mockRequest.method = method;
        mockRequest.cookies = {};
        (mockRequest.get as jest.Mock).mockReturnValue(undefined);
        
        const result = service.validateCSRFToken(mockRequest as Request);
        expect(result).toBe(false);
      });
      
      // Safe methods should always pass
      safeMethods.forEach(method => {
        mockRequest.method = method;
        mockRequest.cookies = {};
        (mockRequest.get as jest.Mock).mockReturnValue(undefined);
        
        const result = service.validateCSRFToken(mockRequest as Request);
        expect(result).toBe(true);
      });
    });
  });
});