import { Router } from 'express';
import { unifiedAuthController } from '@/auth/controllers/unified-auth.controller';
import { azureAuthController } from '@/auth/controllers/azure-auth.controller';
import { loginValidation, createUserValidation, changePasswordValidation } from '@/validation/auth.validation';
// Use the auth wrapper to automatically select the correct authentication middleware
import { requireAuth, requireAdmin, optionalAuth, auditAction } from '@/middleware/auth-wrapper';
import { createLoginRateLimiter, refreshTokenRateLimiter, authEndpointsRateLimiter } from '@/middleware/rate-limit.middleware';

const router = Router();

/**
 * Authentication Routes
 * Base path: /api/auth
 */

/**
 * @route   GET /api/auth/method
 * @desc    Get authentication method configuration
 * @access  Public
 */
router.get('/method', (_req, res) => {
  const USE_COOKIE_AUTH = process.env.USE_COOKIE_AUTH === 'true';
  
  res.json({
    method: USE_COOKIE_AUTH ? 'cookie' : 'token',
    supportsCookies: true,
    supportsTokens: true,
    csrfRequired: USE_COOKIE_AUTH
  });
});

/**
 * @route   POST /api/auth/login
 * @desc    User login with username/password
 * @access  Public
 * @body    { username: string, password: string, authSource?: 'ad' | 'azure' | 'local' }
 */
router.post('/login', 
  createLoginRateLimiter(), // 5 login attempts per 15 minutes
  loginValidation,
  auditAction('login_attempt', 'authentication'),
  unifiedAuthController.login
);

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh access token using refresh token
 * @access  Public
 * @body    { refreshToken: string }
 */
router.post('/refresh',
  refreshTokenRateLimiter, // 10 attempts per hour
  unifiedAuthController.refresh
);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout current session
 * @access  Public (with optional auth)
 */
router.post('/logout',
  optionalAuth,
  auditAction('logout', 'authentication'),
  unifiedAuthController.logout
);

/**
 * @route   POST /api/auth/logout-all
 * @desc    Logout from all sessions
 * @access  Private
 */
router.post('/logout-all',
  requireAuth,
  auditAction('logout_all_sessions', 'authentication'),
  unifiedAuthController.logoutAll
);

/**
 * @route   GET /api/auth/profile
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/profile',
  requireAuth,
  authEndpointsRateLimiter, // 30 requests per 15 minutes
  unifiedAuthController.getProfile
);

router.put('/profile',
  requireAuth,
  authEndpointsRateLimiter, // 30 requests per 15 minutes
  auditAction('update_profile', 'user_management'),
  unifiedAuthController.updateProfile
);

/**
 * @route   GET /api/auth/verify
 * @desc    Verify JWT token
 * @access  Public
 */
router.get('/verify',
  authEndpointsRateLimiter, // 30 requests per 15 minutes
  unifiedAuthController.verifyToken
);

/**
 * @route   POST /api/auth/change-password
 * @desc    Change user password
 * @access  Private
 */
router.post('/change-password',
  requireAuth,
  changePasswordValidation,
  authEndpointsRateLimiter, // 30 requests per 15 minutes
  auditAction('change_password', 'security'),
  unifiedAuthController.changePassword
);

/**
 * @route   POST /api/auth/create-user
 * @desc    Create local user account (admin only)
 * @access  Private (Admin)
 * @body    { username: string, password: string, displayName: string, email: string, isAdmin?: boolean }
 */
router.post('/create-user',
  requireAdmin,
  createUserValidation,
  auditAction('create_local_user', 'user_management'),
  unifiedAuthController.createUser
);

/**
 * @route   GET /api/auth/test-connections
 * @desc    Test authentication connections (admin only)
 * @access  Private (Admin)
 */
router.get('/test-connections',
  requireAdmin,
  auditAction('test_auth_connections', 'system_administration'),
  unifiedAuthController.testConnections
);

/**
 * @route   GET /api/auth/azure/config
 * @desc    Get Azure AD public configuration
 * @access  Private
 */
router.get('/azure/config',
  requireAuth,
  azureAuthController.getAzurePublicConfig
);

export default router;
