// Export types
export * from './types';

// Export services
export { unifiedAuthService } from './services/unified-auth.service';

// Export middleware
export {
  authenticate,
  requireAuth,
  requireAdmin,
  optionalAuth,
  requireAuthSource,
  requireCSRF,
  requireRole,
  requireResourceAccess,
  auditAction,
  userRateLimit,
  autoRefreshToken,
  roleCheckers,
  resourceCheckers
} from './middleware/unified-auth.middleware';

// Export controller
export { unifiedAuthController } from './controllers/unified-auth.controller';

// Export routes
export { default as authRoutes } from './routes/unified-auth.routes';

// Export strategies
export { AuthStrategyFactory } from './strategies';