import { Request, Response } from 'express';
import { logger } from '@/utils/logger';
import { asyncHandler, createError } from '@/middleware/error.middleware';
import { validationResult } from 'express-validator';
import { unifiedAuthService } from '../services/unified-auth.service';
import { AuthStrategyFactory } from '../strategies';
import { LoginRequest, AuthMode } from '../types';
import { csrfService } from '@/services/csrf.service';

export class UnifiedAuthController {
  /**
   * User login - supports both JWT and cookie modes
   * POST /api/auth/login
   */
  login = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw createError('Validation failed: ' + errors.array().map(e => e.msg).join(', '), 400);
    }

    const loginRequest: LoginRequest = req.body;
    
    // Session regeneration for security
    if (req.session) {
      await new Promise<void>((resolve, reject) => {
        req.session.regenerate((err) => {
          if (err) {
            logger.error('Session regeneration failed:', err);
            reject(createError('Session regeneration failed', 500));
          } else {
            resolve();
          }
        });
      });
    }

    try {
      // Determine auth mode
      const authMode = unifiedAuthService.getAuthMode(req);
      
      // Authenticate user
      const loginResponse = await unifiedAuthService.authenticate(loginRequest, req, {
        mode: authMode
      });
      
      logger.info(`User logged in successfully: ${loginRequest.username} (mode: ${authMode})`);

      // Get strategy and set response
      const strategy = AuthStrategyFactory.getStrategy(authMode);
      strategy.setAuthResponse(res, loginResponse);

    } catch (error) {
      logger.warn(`Login failed for user: ${loginRequest.username}`, error);
      throw error;
    }
  });

  /**
   * Token refresh - supports both JWT and cookie modes
   * POST /api/auth/refresh
   */
  refresh = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    // Determine auth mode
    const authMode = unifiedAuthService.getAuthMode(req);
    
    // Extract refresh token based on mode
    const refreshToken = unifiedAuthService.extractRefreshToken(req, authMode);

    if (!refreshToken) {
      throw createError('Refresh token is required', 400);
    }

    try {
      const tokenResponse = await unifiedAuthService.refreshAccessToken(refreshToken, req, {
        mode: authMode
      });
      
      logger.info('Access token refreshed successfully');

      // Get strategy and set response
      const strategy = AuthStrategyFactory.getStrategy(authMode);
      strategy.setAuthResponse(res, tokenResponse);

    } catch (error) {
      logger.warn('Token refresh failed:', error);
      throw error;
    }
  });

  /**
   * User logout - supports both modes
   * POST /api/auth/logout
   */
  logout = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    // Determine auth mode
    const authMode = req.authMode || unifiedAuthService.getAuthMode(req);
    
    // Extract token for blacklisting (JWT mode)
    let token: string | undefined;
    if (authMode === AuthMode.JWT) {
      const authHeader = req.headers.authorization;
      token = authHeader && authHeader.startsWith('Bearer ') 
        ? authHeader.substring(7) 
        : undefined;
    }
    
    // If user is authenticated, logout from backend session
    if (req.user && req.sessionId) {
      try {
        await unifiedAuthService.logout(req.sessionId, token, req);
        logger.info(`User logged out: ${req.user.username} (mode: ${authMode})`);
      } catch (error) {
        // Log error but don't fail the logout
        logger.error('Backend logout failed:', error);
      }
    }

    // Clear auth based on strategy
    const strategy = AuthStrategyFactory.getStrategy(authMode);
    strategy.clearAuth(res);
    
    // Always return success to allow client to clear its state
    res.json({
      success: true,
      message: 'Logout successful'
    });
  });

  /**
   * Logout from all sessions
   * POST /api/auth/logout-all
   */
  logoutAll = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw createError('Not authenticated', 401);
    }

    try {
      await unifiedAuthService.logoutAllSessions(req.user.id);
      
      logger.info(`All sessions logged out for user: ${req.user.username}`);

      // Clear auth cookies if in cookie mode
      const authMode = req.authMode || unifiedAuthService.getAuthMode(req);
      if (authMode === AuthMode.COOKIE) {
        const strategy = AuthStrategyFactory.getStrategy(authMode);
        strategy.clearAuth(res);
      }

      res.json({
        success: true,
        message: 'Logged out from all sessions'
      });

    } catch (error) {
      logger.error('Logout all failed:', error);
      throw error;
    }
  });

  /**
   * Get current user profile
   * GET /api/auth/profile
   */
  getProfile = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw createError('Not authenticated', 401);
    }

    try {
      // Get fresh user data
      const user = await unifiedAuthService.getUserById(req.user.id);
      
      if (!user) {
        throw createError('User not found', 404);
      }

      res.json({
        success: true,
        data: {
          user: {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            email: user.email,
            authSource: user.authSource,
            department: user.department,
            title: user.title,
            isAdmin: user.isAdmin,
            isActive: user.isActive,
            lastLogin: user.lastLogin
          }
        }
      });

    } catch (error) {
      logger.error('Get profile failed:', error);
      throw error;
    }
  });

  /**
   * Update user profile
   * PUT /api/auth/profile
   */
  updateProfile = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw createError('Not authenticated', 401);
    }

    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw createError('Validation failed: ' + errors.array().map(e => e.msg).join(', '), 400);
    }

    const { displayName, email, department, title } = req.body;

    try {
      const updatedUser = await unifiedAuthService.updateUserProfile(req.user.id, {
        displayName,
        email,
        department,
        title
      });

      if (!updatedUser) {
        throw createError('User update failed', 500);
      }

      res.json({
        success: true,
        message: 'Profile updated successfully',
        data: {
          user: {
            id: updatedUser.id,
            username: updatedUser.username,
            displayName: updatedUser.displayName,
            email: updatedUser.email,
            authSource: updatedUser.authSource,
            department: updatedUser.department,
            title: updatedUser.title,
            isAdmin: updatedUser.isAdmin,
            isActive: updatedUser.isActive,
            lastLogin: updatedUser.lastLogin
          }
        }
      });

    } catch (error) {
      logger.error('Update profile failed:', error);
      throw error;
    }
  });

  /**
   * Change password (local users only)
   * POST /api/auth/change-password
   */
  changePassword = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw createError('Not authenticated', 401);
    }

    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw createError('Validation failed: ' + errors.array().map(e => e.msg).join(', '), 400);
    }

    const { currentPassword, newPassword } = req.body;

    try {
      await unifiedAuthService.changePassword(req.user.id, currentPassword, newPassword, req);

      // Clear auth cookies if in cookie mode to force re-login
      const authMode = req.authMode || unifiedAuthService.getAuthMode(req);
      if (authMode === AuthMode.COOKIE) {
        const strategy = AuthStrategyFactory.getStrategy(authMode);
        strategy.clearAuth(res);
      }

      res.json({
        success: true,
        message: 'Password changed successfully. Please login with your new password.'
      });

    } catch (error) {
      logger.error('Change password failed:', error);
      throw error;
    }
  });

  /**
   * Verify session status
   * GET /api/auth/verify
   */
  verify = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw createError('Not authenticated', 401);
    }

    res.json({
      success: true,
      data: {
        valid: true,
        user: {
          id: req.user.id,
          username: req.user.username,
          isAdmin: req.user.isAdmin
        }
      }
    });
  });

  /**
   * Get CSRF token
   * GET /api/auth/csrf
   * Returns a CSRF token for use with state-changing requests
   */
  getCSRFToken = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      // Generate and set CSRF token
      const token = csrfService.setCSRFToken(res);
      
      // If session is available, also store in Redis for enhanced security
      if (req.session?.id) {
        await csrfService.generateAndStoreToken(req.session.id);
      }

      logger.debug('CSRF token generated successfully');

      res.json({
        success: true,
        csrfToken: token
      });

    } catch (error) {
      logger.error('Failed to generate CSRF token:', error);
      throw createError('Failed to generate CSRF token', 500);
    }
  });

  /**
   * Verify token validity (alias for verify)
   * GET /api/auth/verify
   */
  verifyToken = this.verify;

  /**
   * Create a new local user (admin only)
   * POST /api/auth/create-user
   */
  createUser = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user || !req.user.isAdmin) {
      throw createError('Admin access required', 403);
    }

    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw createError('Validation failed: ' + errors.array().map(e => e.msg).join(', '), 400);
    }

    const { username, password, displayName, email, isAdmin } = req.body;

    try {
      const newUser = await unifiedAuthService.createLocalUser({
        username,
        password,
        displayName,
        email,
        isAdmin: isAdmin || false
      });

      logger.info(`Local user created successfully: ${username} by admin: ${req.user.username}`);

      res.status(201).json({
        success: true,
        message: 'User created successfully',
        data: {
          user: {
            id: newUser.id,
            username: newUser.username,
            displayName: newUser.displayName,
            email: newUser.email,
            authSource: newUser.authSource,
            isAdmin: newUser.isAdmin,
            isActive: newUser.isActive
          }
        }
      });

    } catch (error) {
      logger.error('Create user failed:', error);
      throw error;
    }
  });

  /**
   * Test connections to all authentication sources
   * GET /api/auth/test-connections
   */
  testConnections = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user || !req.user.isAdmin) {
      throw createError('Admin access required', 403);
    }

    try {
      const results = await unifiedAuthService.testAuthConnections();

      res.json({
        success: true,
        data: results
      });

    } catch (error) {
      logger.error('Test connections failed:', error);
      throw error;
    }
  });

  /**
   * DEPRECATED: Azure auth methods have been moved to azure-auth.controller.ts
   * These methods are kept for backward compatibility only and will be removed in v2.0
   */
}

// Export singleton instance
export const unifiedAuthController = new UnifiedAuthController();