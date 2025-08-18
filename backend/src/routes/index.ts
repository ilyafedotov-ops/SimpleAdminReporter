import { Router } from 'express';
import { logger } from '@/utils/logger';
// Import auth routes directly
import authRoutes from '@/routes/auth.routes';
import reportsRoutes from '@/routes/reports.routes';
import healthRoutes from '@/routes/health.routes';
import credentialsRoutes from '@/routes/credentials.routes';
import scheduledReportsRoutes from '@/routes/scheduled-reports.routes';
import notificationsRoutes from '@/routes/notifications.routes';
import userPreferencesRoutes from '@/routes/user-preferences.routes';
import { systemRoutes } from '@/routes/system.routes';
import adminSecurityRoutes from '@/routes/admin/security.routes';
import searchRoutes from '@/routes/search.routes';
import logsRoutes from '@/routes/logs.routes';
import graphRoutes from '@/routes/graph.routes';

// Feature flags for authentication
// const _USE_COOKIE_AUTH = process.env.USE_COOKIE_AUTH === 'true';

const router = Router();

// Health check routes
logger.info('Registering health routes at /health');
router.use('/health', healthRoutes);
logger.info('Registered health routes');



// API info endpoint
router.get('/', (req, res) => {
  res.json({
    message: 'AD/Azure AD/O365 Reporting API',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    endpoints: [
      'GET /api/health - API health check',
      'POST /api/auth/login - User authentication',
      'POST /api/auth/refresh - Refresh access token',
      'GET /api/auth/profile - Get user profile',
      'POST /api/auth/logout - User logout',
      'GET /api/reports/templates - List pre-built report templates',
      'POST /api/reports/execute/:id - Execute pre-built report',
      'GET /api/reports/fields/:source - Get available fields',
      'GET /api/reports/custom - List custom reports',
      'POST /api/reports/custom - Create custom report',
      'POST /api/reports/custom/:id/execute - Execute custom report',
      'POST /api/reports/custom/test - Test custom query',
      'GET /api/reports/history - Get report history',
      'POST /api/reports/query/execute - Execute pre-defined query',
      'POST /api/reports/query/build - Build and execute dynamic query',
      'GET /api/reports/query/definitions - Get available query definitions',
      'GET /api/reports/query/schema/:dataSource - Get schema for data source',
      'POST /api/reports/query/validate - Validate query without execution',
      'GET /api/reports/query/cache/:queryId - Get cached query results',
      'GET /api/reports/query/stats/:queryId - Get query execution statistics',
      'DELETE /api/reports/query/cache/:queryId - Clear query cache',
      'GET /api/reports/query/health - Query service health check',
      'GET /api/reports/query/metrics - Query service metrics',
      'POST /api/reports/query/graph/execute - Execute Graph API query',
      'GET /api/reports/query/graph/definitions - Get available Graph queries',
      'GET /api/reports/query/graph/history - Get Graph query execution history',
      'POST /api/reports/query/graph/batch - Execute multiple Graph queries',
      'GET /api/credentials - List user credentials',
      'GET /api/credentials/defaults - Get default credentials',
      'POST /api/credentials - Create credential',
      'PUT /api/credentials/:id - Update credential',
      'DELETE /api/credentials/:id - Delete credential',
      'POST /api/credentials/:id/test - Test credential',
      'PUT /api/credentials/:id/set-default - Set default credential',
      'GET /api/scheduled-reports - List scheduled reports',
      'GET /api/scheduled-reports/:id - Get scheduled report',
      'POST /api/scheduled-reports - Create scheduled report',
      'PUT /api/scheduled-reports/:id - Update scheduled report',
      'DELETE /api/scheduled-reports/:id - Delete scheduled report',
      'POST /api/scheduled-reports/:id/toggle - Toggle schedule active state',
      'GET /api/scheduled-reports/:id/history - Get schedule execution history',
      'GET /api/notifications - List user notifications',
      'GET /api/notifications/stats - Get notification statistics',
      'GET /api/notifications/:id - Get notification by ID', 
      'POST /api/notifications - Create notification',
      'PUT /api/notifications/:id - Update notification',
      'DELETE /api/notifications/:id - Delete notification',
      'POST /api/notifications/bulk - Bulk notification operations',
      'POST /api/notifications/system - Create system notification (admin)',
      'POST /api/notifications/cleanup - Cleanup expired notifications (admin)',
      'GET /api/user/preferences - Get user preferences',
      'PUT /api/user/preferences - Update user preferences',
      'PUT /api/user/preferences/notifications - Update notification preferences',
      'GET /api/system/config - Get system configuration (admin)',
      'POST /api/system/config - Update system configuration (admin)',
      'GET /api/system/health - Get system health status',
      'POST /api/auth/change-password - Change password (local users)',
      'GET /api/admin/security/audit-logs - Get audit logs (admin)',
      'GET /api/admin/security/events-summary - Get security events summary (admin)',
      'GET /api/admin/security/user-activity/:userId - Get user activity (admin)',
      'GET /api/admin/security/locked-accounts - Get locked accounts (admin)',
      'GET /api/admin/security/lockout-history/:username - Get lockout history (admin)',
      'POST /api/admin/security/unlock-account - Unlock account (admin)',
      'GET /api/admin/security/failed-logins - Get failed login attempts (admin)',
      'GET /api/search/global - Global search across all resources',
      'GET /api/search/suggestions - Get search suggestions',
      'GET /api/search/recent - Get recent searches',
      'GET /api/logs - Get logs with filtering and pagination',
      'GET /api/logs/stats - Get log statistics',
      'GET /api/logs/realtime - Get real-time logs',
      'GET /api/logs/export - Export logs (admin only)',
      'GET /api/logs/:id - Get specific log details',
      'GET /api/graph/templates - Get Graph query templates',
      'POST /api/graph/execute/:queryId - Execute Graph query',
      'POST /api/graph/batch - Execute batch Graph queries',
      'GET /api/graph/fields/:entityType - Discover Graph fields',
      'GET /api/graph/fields/:entityType/search - Search Graph fields',
      'GET /api/graph/history - Get Graph execution history',
      'GET /api/graph/history/:executionId - Get specific Graph execution'
    ]
  });
});

// Authentication routes
logger.info('Registering auth routes at /auth');
try {
  router.use('/auth', authRoutes);
  logger.info('Authentication routes registered successfully');
} catch (error) {
  logger.error('Failed to register auth routes:', error);
  throw error;
}

// Reports routes
logger.info('Registering reports routes at /reports');
try {
  router.use('/reports', reportsRoutes);
  logger.info('Reports routes registered successfully');
} catch (error) {
  logger.error('Failed to register reports routes:', error);
  throw error;
}

// Credentials routes
logger.info('Registering credentials routes at /credentials');
try {
  router.use('/credentials', credentialsRoutes);
  logger.info('Credentials routes registered successfully');
} catch (error) {
  logger.error('Failed to register credentials routes:', error);
  throw error;
}

// Scheduled reports routes
logger.info('Registering scheduled-reports routes at /scheduled-reports');
try {
  router.use('/scheduled-reports', scheduledReportsRoutes);
  logger.info('Scheduled reports routes registered successfully');
} catch (error) {
  logger.error('Failed to register scheduled-reports routes:', error);
  throw error;
}

// Notifications routes
logger.info('Registering notifications routes at /notifications');
try {
  router.use('/notifications', notificationsRoutes);
  logger.info('Notifications routes registered successfully');
} catch (error) {
  logger.error('Failed to register notifications routes:', error);
  throw error;
}

// User preferences routes
logger.info('Registering user preferences routes at /user/preferences');
try {
  router.use('/user/preferences', userPreferencesRoutes);
  logger.info('User preferences routes registered successfully');
} catch (error) {
  logger.error('Failed to register user preferences routes:', error);
  throw error;
}

// System configuration routes (admin only)
logger.info('Registering system routes at /system');
try {
  router.use('/system', systemRoutes);
  logger.info('System routes registered successfully');
} catch (error) {
  logger.error('Failed to register system routes:', error);
  throw error;
}

// Admin security routes (admin only)
logger.info('Registering admin security routes at /admin/security');
try {
  router.use('/admin/security', adminSecurityRoutes);
  logger.info('Admin security routes registered successfully');
} catch (error) {
  logger.error('Failed to register admin security routes:', error);
  throw error;
}

// Search routes
logger.info('Registering search routes at /search');
try {
  router.use('/search', searchRoutes);
  logger.info('Search routes registered successfully');
} catch (error) {
  logger.error('Failed to register search routes:', error);
  throw error;
}

// Logs routes (authenticated users only)
logger.info('Registering logs routes at /logs');
try {
  router.use('/logs', logsRoutes);
  logger.info('Logs routes registered successfully');
  logger.info('DEBUG: Logs routes registration completed, continuing...');
} catch (error) {
  logger.error('Failed to register logs routes:', error);
  throw error;
}

// DEBUGGING: Check if we reach here
logger.info('DEBUG: About to register graph routes');

// Graph API routes
logger.info('Registering graph routes at /graph');
try {
  router.use('/graph', graphRoutes);
  logger.info('Graph routes registered successfully');
} catch (error) {
  logger.error('Failed to register graph routes:', error);
  throw error;
}

// Catch-all for undefined API routes
router.use((req, res) => {
  logger.warn(`API route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    error: 'API endpoint not found',
    path: req.originalUrl,
    method: req.method,
    available_endpoints: [
      'GET /api/',
      'GET /api/health',
      'GET /api/auth/method',
      'POST /api/auth/login',
      'POST /api/auth/refresh',
      'GET /api/auth/profile',
      'PUT /api/auth/profile',
      'POST /api/auth/logout',
      'POST /api/auth/logout-all',
      'GET /api/auth/verify',
      'POST /api/auth/change-password',
      'POST /api/auth/create-user',
      'GET /api/auth/test-connections',
      'GET /api/auth/azure/config',
      'GET /api/reports/templates',
      'POST /api/reports/execute/:id',
      'GET /api/reports/fields/:source',
      'GET /api/reports/custom',
      'POST /api/reports/custom',
      'POST /api/reports/custom/:id/execute',
      'POST /api/reports/query/execute',
      'POST /api/reports/query/build',
      'GET /api/reports/query/definitions',
      'GET /api/reports/query/schema/:dataSource',
      'POST /api/reports/query/validate',
      'GET /api/reports/query/health',
      'GET /api/reports/query/metrics',
      'GET /api/credentials',
      'POST /api/credentials',
      'PUT /api/credentials/:id',
      'DELETE /api/credentials/:id',
      'GET /api/notifications',
      'GET /api/notifications/stats',
      'POST /api/notifications',
      'PUT /api/notifications/:id',
      'DELETE /api/notifications/:id',
      'POST /api/notifications/bulk',
      'POST /api/notifications/system',
      'POST /api/notifications/cleanup',
      'GET /api/user/preferences',
      'PUT /api/user/preferences',
      'PUT /api/user/preferences/notifications',
      'GET /api/system/config',
      'POST /api/system/config',
      'GET /api/system/health'
    ]
  });
});

export default router;