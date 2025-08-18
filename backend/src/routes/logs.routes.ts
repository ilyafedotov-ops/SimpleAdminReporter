import { Router } from 'express';
import { logsController } from '@/controllers/logs.controller';
import { authenticate } from '@/auth/middleware/unified-auth.middleware';
import { requireRole } from '@/middleware/auth-wrapper';
import { LogsValidator } from '@/validators/logs.validator';
import { db } from '@/config/database';
import { 
  logsQueryRateLimiter, 
  logsExportRateLimiter 
} from '@/middleware/rate-limit.middleware';
import { logger } from '@/utils/logger';

const router = Router();

// Debug logging for route registration
logger.info('Logs routes file loaded');
// Log all incoming requests to logs routes
router.use((req, res, next) => {
  logger.info(`Logs route accessed: ${req.method} ${req.path} - Full URL: ${req.originalUrl}`);
  logger.info(`Request headers: ${JSON.stringify(req.headers)}`);
  next();
});

// All logs routes require authentication
router.use(authenticate({ required: true }));

// Test endpoint to check if database queries work
router.get('/test', async (req, res) => {
  try {
    logger.info('Testing simple database query...');
    const auditCount = await db.query('SELECT COUNT(*) as count FROM audit_logs');
    const systemCount = await db.query('SELECT COUNT(*) as count FROM system_logs');
    
    // Test the exact same combined query
    const testQuery = `
      WITH combined_logs AS (
        SELECT 
          'audit' as log_type,
          id,
          created_at as timestamp,
          event_type,
          event_action,
          user_id,
          username,
          ip_address,
          user_agent,
          session_id,
          resource_type,
          resource_id,
          details,
          success,
          error_message,
          correlation_id,
          NULL::varchar as level,
          NULL::text as message,
          NULL::varchar as service,
          NULL::varchar as module,
          NULL::varchar as request_id,
          NULL::varchar as method,
          NULL::varchar as url,
          NULL::integer as status_code,
          NULL::integer as duration_ms,
          NULL::text as error_stack,
          NULL::jsonb as metadata
        FROM audit_logs
        
        UNION ALL
        
        SELECT 
          'system' as log_type,
          id,
          timestamp,
          NULL as event_type,
          NULL as event_action,
          user_id,
          NULL as username,
          ip_address,
          NULL as user_agent,
          NULL as session_id,
          NULL as resource_type,
          NULL as resource_id,
          NULL::jsonb as details,
          NULL::boolean as success,
          NULL as error_message,
          request_id as correlation_id,
          level,
          message,
          service,
          module,
          request_id,
          method,
          url,
          status_code,
          duration_ms,
          error_stack,
          metadata
        FROM system_logs
      )
      SELECT * FROM combined_logs
      ORDER BY timestamp DESC
      LIMIT 10 OFFSET 0
    `;
    
    logger.info('Executing combined query...');
    const combinedResult = await db.query(testQuery);
    logger.info('Combined query returned:', combinedResult.rows.length, 'rows');
    
    res.json({ 
      success: true, 
      auditCount: auditCount.rows[0].count,
      systemCount: systemCount.rows[0].count,
      combinedRows: combinedResult.rows.length,
      sampleData: combinedResult.rows.slice(0, 3)
    });
  } catch (error) {
    logger.error('Database test error:', error);
    const errorMessage = error instanceof Error ? ((error as any)?.message || String(error)) : 'Unknown error occurred';
    res.status(500).json({ success: false, error: errorMessage });
  }
});

// Get logs with filtering and pagination
router.get('/', logsQueryRateLimiter, LogsValidator.validateLogQuery, logsController.getLogs.bind(logsController));

// Get log statistics
router.get('/stats', logsQueryRateLimiter, LogsValidator.validateLogStats, logsController.getLogStats.bind(logsController));

// Get real-time logs (most recent)
router.get('/realtime', logsQueryRateLimiter, LogsValidator.validateLogQuery, logsController.getLogs.bind(logsController));

// Export logs (admin only)
router.get('/export', requireRole(['admin']), logsExportRateLimiter, LogsValidator.validateLogExport, logsController.exportLogs.bind(logsController));

// Get logging system metrics (admin only)
router.get('/metrics', requireRole(['admin']), logsQueryRateLimiter, logsController.getMetrics.bind(logsController));

// Get query performance metrics (admin only)
router.get('/metrics/queries', requireRole(['admin']), logsQueryRateLimiter, logsController.getQueryMetrics.bind(logsController));

// Export query metrics as CSV (admin only)
router.get('/metrics/queries/export', requireRole(['admin']), logsExportRateLimiter, logsController.exportQueryMetrics.bind(logsController));

// Get WebSocket connection statistics (admin only)
router.get('/websocket/stats', requireRole(['admin']), logsQueryRateLimiter, logsController.getWebSocketStats.bind(logsController));

// Get materialized view statistics (admin only)
router.get('/materialized-views/stats', requireRole(['admin']), logsQueryRateLimiter, logsController.getMaterializedViewStats.bind(logsController));

// Manually refresh materialized views (admin only)
router.post('/materialized-views/refresh', requireRole(['admin']), logsController.refreshMaterializedViews.bind(logsController));

// Clean up old logs (admin only)
router.post('/cleanup', requireRole(['admin']), LogsValidator.validateLogCleanup, logsController.cleanupOldLogs.bind(logsController));

// Full-text search endpoint
router.get('/search/fulltext', logsQueryRateLimiter, LogsValidator.validateLogSearch, logsController.searchLogs.bind(logsController));

// Fuzzy search endpoint
router.get('/search/fuzzy', logsQueryRateLimiter, LogsValidator.validateFuzzySearch, logsController.fuzzySearchLogs.bind(logsController));

// Get specific log details
router.get('/:id', logsQueryRateLimiter, LogsValidator.validateLogDetail, logsController.getLogDetails.bind(logsController));

export default router;