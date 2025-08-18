import { Request, Response, NextFunction } from 'express';
import {
  authenticate,
  requireAuth,
  requireAdmin,
  optionalAuth,
  requireCSRF,
  roleCheckers,
} from './unified-auth.middleware';
import { unifiedAuthService } from '../services/unified-auth.service';
import { AuthStrategyFactory } from '../strategies';
import { csrfService } from '@/services/csrf.service';
import { AuthMode, User } from '../types';
import { createError } from '@/middleware/error.middleware';

// Mock dependencies
jest.mock('../services/unified-auth.service');
jest.mock('../strategies');
jest.mock('@/services/csrf.service');
jest.mock('@/middleware/error.middleware');
jest.mock('@/utils/logger');
jest.mock('@/services/audit-logger.service');
jest.mock('@/config/database');

describe('Unified Auth Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let mockUser: User;
  let mockStrategy: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mock user
    mockUser = {
      id: 1,
      username: 'testuser',
      displayName: 'Test User',
      email: 'test@example.com',
      authSource: 'local',
      isAdmin: false,
      isActive: true
    };
    
    // Setup mock request
    mockRequest = {
      method: 'GET',
      path: '/api/test',
      headers: {},
      cookies: {},
      get: jest.fn(),
      ip: '127.0.0.1'
    };
    
    // Setup mock response
    mockResponse = {
      cookie: jest.fn(),
      on: jest.fn(),
      statusCode: 200
    };
    
    // Setup mock next function
    mockNext = jest.fn();
    
    // Setup mock strategy
    mockStrategy = {
      extractToken: jest.fn().mockReturnValue('valid.jwt.token')
    };
    
    // Setup default mocks
    (unifiedAuthService.getAuthMode as jest.Mock).mockReturnValue(AuthMode.JWT);
    (AuthStrategyFactory.getStrategy as jest.Mock).mockReturnValue(mockStrategy);
    (unifiedAuthService.verifyAccessToken as jest.Mock).mockResolvedValue(mockUser);
    (csrfService.validateCSRFToken as jest.Mock).mockReturnValue(true);
    (createError as jest.Mock).mockImplementation((message: string, statusCode: number) => {
      const error = new Error(message) as any;
      error.statusCode = statusCode;
      return error;
    });
  });

  describe('authenticate', () => {
    it('should authenticate valid JWT token successfully', async () => {
      // Mock JWT token payload for session extraction
      const tokenPayload = { sessionId: 'session-123', userId: 1 };
      const mockToken = 'header.' + Buffer.from(JSON.stringify(tokenPayload)).toString('base64') + '.signature';
      mockStrategy.extractToken.mockReturnValue(mockToken);
      
      const middleware = authenticate();
      
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(unifiedAuthService.getAuthMode).toHaveBeenCalledWith(mockRequest);
      expect(AuthStrategyFactory.getStrategy).toHaveBeenCalledWith(AuthMode.JWT);
      expect(mockStrategy.extractToken).toHaveBeenCalledWith(mockRequest);
      expect(unifiedAuthService.verifyAccessToken).toHaveBeenCalledWith(mockToken, {
        skipBlacklistCheck: false
      });
      expect(mockRequest.user).toBe(mockUser);
      expect(mockRequest.authMode).toBe(AuthMode.JWT);
      expect(mockRequest.sessionId).toBe('session-123');
      expect(mockNext).toHaveBeenCalledWith();
    });
    
    it('should skip blacklist check for cookie mode', async () => {
      (unifiedAuthService.getAuthMode as jest.Mock).mockReturnValue(AuthMode.COOKIE);
      
      // Mock a proper token structure for session extraction
      const tokenPayload = { sessionId: 'session-123', userId: 1 };
      const mockToken = 'header.' + Buffer.from(JSON.stringify(tokenPayload)).toString('base64') + '.signature';
      mockStrategy.extractToken.mockReturnValue(mockToken);
      
      const middleware = authenticate();
      
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(unifiedAuthService.verifyAccessToken).toHaveBeenCalledWith(mockToken, {
        skipBlacklistCheck: true
      });
    });
    
    it('should handle missing token when auth is required', async () => {
      mockStrategy.extractToken.mockReturnValue(null);
      
      const middleware = authenticate({ required: true });
      
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Access token required. Please login to continue.',
        statusCode: 401
      }));
    });
    
    it('should continue without user when auth is optional and no token', async () => {
      mockStrategy.extractToken.mockReturnValue(null);
      
      const middleware = authenticate({ required: false });
      
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockRequest.user).toBeUndefined();
      expect(mockNext).toHaveBeenCalledWith();
    });
  });

  describe('requireAuth', () => {
    it('should require authentication', async () => {
      // Mock a proper token structure for session extraction
      const tokenPayload = { sessionId: 'session-123', userId: 1 };
      const mockToken = 'header.' + Buffer.from(JSON.stringify(tokenPayload)).toString('base64') + '.signature';
      mockStrategy.extractToken.mockReturnValue(mockToken);
      
      await requireAuth(mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(unifiedAuthService.verifyAccessToken).toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalledWith();
    });
  });

  describe('requireAdmin', () => {
    it('should require admin authentication', async () => {
      const adminUser = { ...mockUser, isAdmin: true };
      (unifiedAuthService.verifyAccessToken as jest.Mock).mockResolvedValue(adminUser);
      
      // Mock a proper token structure for session extraction
      const tokenPayload = { sessionId: 'session-123', userId: 1 };
      const mockToken = 'header.' + Buffer.from(JSON.stringify(tokenPayload)).toString('base64') + '.signature';
      mockStrategy.extractToken.mockReturnValue(mockToken);
      
      await requireAdmin(mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalledWith();
    });
    
    it('should reject non-admin users', async () => {
      await requireAdmin(mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Administrator access required'
      }));
    });
  });

  describe('optionalAuth', () => {
    it('should allow requests without authentication', async () => {
      mockStrategy.extractToken.mockReturnValue(null);
      
      await optionalAuth(mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalledWith();
      expect(mockRequest.user).toBeUndefined();
    });
  });

  describe('requireCSRF', () => {
    it('should skip CSRF validation for safe methods', async () => {
      mockRequest.method = 'GET';
      
      await requireCSRF(mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(csrfService.validateCSRFToken).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalledWith();
    });
    
    it('should skip CSRF validation for JWT mode', async () => {
      mockRequest.method = 'POST';
      mockRequest.authMode = AuthMode.JWT;
      
      await requireCSRF(mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(csrfService.validateCSRFToken).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalledWith();
    });
    
    it('should validate CSRF for cookie mode state-changing requests', async () => {
      mockRequest.method = 'POST';
      mockRequest.authMode = AuthMode.COOKIE;
      
      await requireCSRF(mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(csrfService.validateCSRFToken).toHaveBeenCalledWith(mockRequest);
      expect(mockNext).toHaveBeenCalledWith();
    });
  });

  describe('roleCheckers', () => {
    describe('isAdmin', () => {
      it('should return true for admin users', () => {
        mockRequest.user = { ...mockUser, isAdmin: true };
        
        const result = roleCheckers.isAdmin(mockRequest as Request);
        
        expect(result).toBe(true);
      });
      
      it('should return false for non-admin users', () => {
        mockRequest.user = { ...mockUser, isAdmin: false };
        
        const result = roleCheckers.isAdmin(mockRequest as Request);
        
        expect(result).toBe(false);
      });
    });
  });
});