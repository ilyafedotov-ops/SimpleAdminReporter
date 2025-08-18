/**
 * Authentication Middleware Wrapper
 * 
 * This wrapper module provides a unified interface for authentication middleware
 * from the unified authentication system.
 * 
 * The unified authentication system:
 * - Supports both JWT and cookie authentication modes
 * - Includes CSRF protection for cookie mode
 * - Provides comprehensive middleware for authentication, authorization, and auditing
 */

import { logger } from '@/utils/logger';

// Import unified auth middleware
import * as unifiedAuthMiddleware from '@/auth/middleware/unified-auth.middleware';

// Log authentication mode
logger.info('Auth Wrapper: Using unified authentication system in JWT mode');

/**
 * Core authentication middleware
 */
export const authenticate = unifiedAuthMiddleware.authenticate;
export const requireAuth = unifiedAuthMiddleware.requireAuth;
export const requireAdmin = unifiedAuthMiddleware.requireAdmin;
export const optionalAuth = unifiedAuthMiddleware.optionalAuth;
export const requireAuthSource = unifiedAuthMiddleware.requireAuthSource;

/**
 * Authorization middleware
 */
export const requireRole = unifiedAuthMiddleware.requireRole;
export const requireResourceAccess = unifiedAuthMiddleware.requireResourceAccess;

/**
 * Security and audit middleware
 */
export const auditAction = unifiedAuthMiddleware.auditAction;
export const userRateLimit = unifiedAuthMiddleware.userRateLimit;
export const autoRefreshToken = unifiedAuthMiddleware.autoRefreshToken;
export const requireCSRF = unifiedAuthMiddleware.requireCSRF;

/**
 * Helper functions
 */
export const roleCheckers = unifiedAuthMiddleware.roleCheckers;
export const resourceCheckers = unifiedAuthMiddleware.resourceCheckers;

/**
 * Type exports for better TypeScript support
 */
export type { AuthOptions } from '@/auth/types';

// Log active middleware configuration on module load
logger.info('Auth wrapper initialized with unified authentication system', {
  authMode: 'JWT',
  middleware: 'unified'
});