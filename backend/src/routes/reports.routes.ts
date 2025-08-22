
import { Router, Request, Response } from 'express';
import { reportsController, createCustomReportValidation, executeReportValidation } from '@/controllers/reports.controller';
import { 
  queryController, 
  executeQueryValidation, 
  buildQueryValidation,
  executeGraphQueryValidation,
  executeGraphBatchValidation
} from '@/controllers/query.controller';
import { ExportController } from '@/controllers/export.controller';
// Use the auth wrapper to automatically select the correct authentication middleware
import { 
  requireAuth, 
  requireAdmin, 
  optionalAuth, 
  auditAction, 
  userRateLimit, 
  requireResourceAccess, 
  resourceCheckers, 
} from '@/middleware/auth-wrapper';
import { body, param, query } from 'express-validator';
import { validateRequest, handleValidationErrors } from '@/middleware/validation.middleware';

const router = Router();
const exportController = new ExportController();

// ============================================================================
// PRE-BUILT REPORT TEMPLATES
// ============================================================================

router.get('/templates',
  optionalAuth,
  query('category').optional().isIn(['ad', 'azure', 'o365']).withMessage('Invalid category'),
  query('source').optional().isIn(['ad', 'azure', 'o365']).withMessage('Invalid source'),
  handleValidationErrors,
  reportsController.getTemplates
);

router.post('/execute/:templateId',
  requireAuth,
  userRateLimit(30),
  executeReportValidation,
  auditAction('execute_report_template', 'report_execution'),
  reportsController.executeTemplate
);

// ============================================================================
// FIELD DISCOVERY
// ============================================================================

router.get('/fields/:source',
  optionalAuth,
  param('source').isIn(['ad', 'azure', 'o365']).withMessage('Invalid data source'),
  query('category').optional().isString().withMessage('Category must be a string'),
  query('search').optional().isString().withMessage('Search must be a string'),
  reportsController.getFields
);

// Dynamic schema discovery endpoint (for AD)
router.get('/schema/:source/discover',
  requireAuth,
  param('source').isIn(['ad']).withMessage('Schema discovery currently only supports AD'),
  query('refresh').optional().isBoolean().withMessage('Refresh must be a boolean'),
  query('credentialId').optional().isNumeric().withMessage('Credential ID must be a number'),
  reportsController.discoverSchema
);

// ============================================================================
// CUSTOM REPORTS
// ============================================================================

router.post('/custom',
  requireAuth,
  userRateLimit(20),
  createCustomReportValidation,
  auditAction('create_custom_report', 'custom_report'),
  reportsController.createCustomReport
);

router.get('/custom',
  optionalAuth,
  query('source').optional().isIn(['ad', 'azure', 'o365']).withMessage('Invalid source'),
  query('category').optional().isString().withMessage('Category must be a string'),
  query('isPublic').optional().isBoolean().withMessage('isPublic must be boolean'),
  query('includePublic').optional().isBoolean().withMessage('includePublic must be boolean'),
  reportsController.getCustomReports
);

// Debug endpoint to list all custom reports with IDs
router.get('/custom/debug',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { db } = await import('@/config/database');
      
      const result = await db.query(`
        SELECT id, name, source, is_active, is_public, created_by, user_id, created_at
        FROM custom_report_templates 
        ORDER BY created_at DESC
      `);

      // Also get the count of users
      const userResult = await db.query('SELECT COUNT(*) as count FROM users WHERE is_active = true');

      res.json({
        success: true,
        data: {
          total: result.rows.length,
          activeUsers: userResult.rows[0].count,
          reports: result.rows,
          currentUser: {
            id: req.user?.id,
            username: req.user?.username
          }
        }
      });
    } catch {
      res.status(500).json({
        success: false,
        error: 'Failed to fetch debug info'
      });
    }
  }
);

router.get('/custom/:reportId',
  optionalAuth,
  param('reportId').isUUID().withMessage('Invalid report ID'),
  reportsController.getCustomReport
);

router.put('/custom/:reportId',
  requireAuth,
  param('reportId').isUUID().withMessage('Invalid report ID'),
  body('name').optional().isLength({ min: 1, max: 255 }).withMessage('Name must be 1-255 characters').trim().escape(),
  body('description').optional().isLength({ max: 1000 }).withMessage('Description max 1000 characters').trim().escape(),
  body('query').optional().isObject().withMessage('Query must be an object'),
  body('isPublic').optional().isBoolean().withMessage('isPublic must be boolean'),
  body('category').optional().isLength({ max: 100 }).withMessage('Category max 100 characters').trim().escape(),
  body('tags').optional().isArray().withMessage('Tags must be an array'),
  requireResourceAccess(resourceCheckers.ownResource),
  auditAction('update_custom_report', 'custom_report'),
  reportsController.updateCustomReport
);

router.delete('/custom/:reportId',
  requireAuth,
  param('reportId').isUUID().withMessage('Invalid report ID'),
  requireResourceAccess(resourceCheckers.ownResource),
  auditAction('delete_custom_report', 'custom_report'),
  reportsController.deleteCustomReport
);

router.post('/custom/:reportId/execute',
  requireAuth,
  userRateLimit(30),
  param('reportId').isUUID().withMessage('Invalid report ID'),
  body('parameters').optional().isObject().withMessage('Parameters must be an object'),
  body('format').optional().isIn(['json', 'csv', 'excel']).withMessage('Invalid format'),
  requireResourceAccess(resourceCheckers.customReport),
  auditAction('execute_custom_report', 'report_execution'),
  reportsController.executeCustomReport
);

router.post('/custom/test',
  requireAuth,
  userRateLimit(60),
  body('source').isIn(['ad', 'azure', 'o365']).withMessage('Invalid data source'),
  body('query').isObject().withMessage('Query must be an object'),
  body('query.fields').isArray({ min: 1 }).withMessage('At least one field required'),
  body('parameters').optional().isObject().withMessage('Parameters must be an object'),
  body('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be 1-50'),
  auditAction('test_custom_query', 'query_testing'),
  reportsController.testCustomQuery
);

// Custom report preview endpoint (similar to template preview but for custom reports)
router.post('/custom/:reportId/preview',
  requireAuth,
  userRateLimit(60),
  param('reportId').isUUID().withMessage('Invalid report ID'),
  body('parameters').optional().isObject().withMessage('Parameters must be an object'),
  body('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be 1-50'),
  requireResourceAccess(resourceCheckers.customReport),
  auditAction('preview_custom_report', 'template_preview'),
  reportsController.previewCustomReport
);

// Template preview endpoint
router.post('/templates/:id/preview',
  requireAuth,
  userRateLimit(60),
  param('id').isUUID().withMessage('Invalid template ID'),
  body('parameters').optional().isObject().withMessage('Parameters must be an object'),
  body('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be 1-50'),
  auditAction('preview_template', 'template_preview'),
  reportsController.previewTemplate
);

// ============================================================================
// REPORT HISTORY
// ============================================================================

router.get('/stats',
  requireAuth,
  reportsController.getReportStats
);

router.get('/history',
  optionalAuth,
  query('status').optional().isIn(['pending', 'running', 'completed', 'failed', 'cancelled']).withMessage('Invalid status'),
  query('source').optional().isIn(['ad', 'azure', 'o365']).withMessage('Invalid source'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100'),
  query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be >= 0'),
  reportsController.getReportHistory
);

router.get('/history/:id',
  optionalAuth,
  param('id').isUUID().withMessage('Invalid report execution ID'),
  reportsController.getReportExecution
);

router.get('/history/:id/results',
  optionalAuth,
  param('id').isUUID().withMessage('Invalid report execution ID'),
  reportsController.getReportResults
);

// Delete single report execution
router.delete('/history/:id',
  requireAuth,
  param('id').isUUID().withMessage('Invalid report execution ID'),
  reportsController.deleteReportExecution
);

// Bulk delete report executions
router.delete('/history/bulk',
  requireAuth,
  body('ids').isArray().withMessage('ids must be an array'),
  body('ids.*').isUUID().withMessage('All ids must be valid UUIDs'),
  reportsController.bulkDeleteReportExecutions
);

// ============================================================================
// ADMIN ROUTES
// ============================================================================

router.get('/admin/templates',
  requireAdmin,
  async (req, res) => {
    try {
      const { db } = await import('@/config/database');
      
      const result = await db.query(
        `SELECT crt.*, u.display_name as creator_name, u.username as creator_username
         FROM custom_report_templates crt
         LEFT JOIN users u ON crt.created_by = u.id
         WHERE crt.is_active = true
         ORDER BY crt.updated_at DESC`
      );

      res.json({
        success: true,
        data: {
          reports: result.rows,
          totalCount: result.rows.length
        }
      });
    } catch {
      res.status(500).json({
        success: false,
        error: 'Failed to get admin templates'
      });
    }
  }
);

router.get('/admin/usage',
  requireAdmin,
  async (req, res) => {
    try {
      const { db } = await import('@/config/database');
      
      const [templateStats, customStats, userStats] = await Promise.all([
        // Pre-built template usage
        db.query(`
          SELECT rt.name, rt.category, rt.execution_count, rt.average_execution_time
          FROM report_templates rt
          WHERE rt.is_active = true
          ORDER BY rt.execution_count DESC
          LIMIT 10
        `),
        
        // Custom report usage
        db.query(`
          SELECT crt.name, crt.source, crt.execution_count, crt.average_execution_time,
                 u.display_name as creator_name
          FROM custom_report_templates crt
          LEFT JOIN users u ON crt.created_by = u.id
          WHERE crt.is_active = true
          ORDER BY crt.execution_count DESC
          LIMIT 10
        `),
        
        // User activity
        db.query(`
          SELECT u.display_name, u.username, COUNT(rh.id) as total_reports,
                 COUNT(CASE WHEN rh.generated_at > NOW() - INTERVAL '30 days' THEN 1 END) as recent_reports
          FROM users u
          LEFT JOIN report_history rh ON u.id = rh.user_id
          WHERE u.is_active = true
          GROUP BY u.id, u.display_name, u.username
          ORDER BY total_reports DESC
          LIMIT 10
        `)
      ]);

      res.json({
        success: true,
        data: {
          topTemplates: templateStats.rows,
          topCustomReports: customStats.rows,
          topUsers: userStats.rows
        }
      });
    } catch {
      res.status(500).json({
        success: false,
        error: 'Failed to get usage statistics'
      });
    }
  }
);

router.delete('/admin/cleanup',
  requireAdmin,
  auditAction('cleanup_report_history', 'system_maintenance'),
  async (req, res) => {
    try {
      const { db } = await import('@/config/database');
      
      // Clean up expired reports
      const result = await db.query(`
        DELETE FROM report_history 
        WHERE expires_at < CURRENT_TIMESTAMP 
          AND status = 'completed'
        RETURNING id
      `);

      res.json({
        success: true,
        message: `Cleaned up ${result.rowCount} expired report records`
      });
    } catch {
      res.status(500).json({
        success: false,
        error: 'Failed to cleanup report history'
      });
    }
  }
);

// ============================================================================
// QUERY ROUTES
// ============================================================================

const queryRouter = Router();

queryRouter.post(
  '/execute',
  requireAuth,
  executeQueryValidation,
  queryController.executeQuery
);

queryRouter.post(
  '/build',
  requireAuth,
  buildQueryValidation,
  queryController.buildAndExecuteQuery
);

queryRouter.get(
  '/definitions',
  optionalAuth,
  validateRequest([
    query('dataSource')
      .optional()
      .isIn(['postgres', 'ad', 'azure', 'o365'])
      .withMessage('Invalid data source'),
    query('category')
      .optional()
      .isString()
      .trim(),
    query('search')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 2 })
      .withMessage('Search term must be at least 2 characters')
  ]),
  queryController.getQueryDefinitions
);

queryRouter.get(
  '/schema/:dataSource',
  requireAuth,
  validateRequest([
    param('dataSource')
      .isIn(['postgres', 'ad', 'azure', 'o365'])
      .withMessage('Invalid data source'),
    query('table')
      .optional()
      .isString()
      .trim()
      .matches(/^[a-zA-Z_][a-zA-Z0-9_]*$/)
      .withMessage('Invalid table name')
  ]),
  queryController.getSchema
);

queryRouter.post(
  '/validate',
  requireAuth,
  validateRequest([
    body('queryDef')
      .isObject()
      .withMessage('Query definition is required'),
    body('queryDef.id')
      .isString()
      .notEmpty()
      .withMessage('Query ID is required'),
    body('queryDef.sql')
      .isString()
      .notEmpty()
      .withMessage('SQL is required'),
    body('parameters')
      .optional()
      .isObject()
      .withMessage('Parameters must be an object')
  ]),
  queryController.validateQuery
);

queryRouter.get(
  '/cache/:queryId',
  requireAuth,
  validateRequest([
    param('queryId')
      .isString()
      .notEmpty()
      .withMessage('Query ID is required'),
    query('parameters')
      .optional()
      .isObject()
      .withMessage('Parameters must be an object')
  ]),
  queryController.getCachedResult
);

// Route for getting all query stats (without specific queryId)
queryRouter.get(
  '/stats',
  optionalAuth,
  validateRequest([
    query('startDate')
      .optional()
      .isISO8601()
      .withMessage('Start date must be a valid ISO date'),
    query('endDate')
      .optional()
      .isISO8601()
      .withMessage('End date must be a valid ISO date')
  ]),
  queryController.getQueryStats
);

// Route for getting specific query stats (with queryId)
queryRouter.get(
  '/stats/:queryId',
  optionalAuth,
  validateRequest([
    param('queryId')
      .isString()
      .notEmpty()
      .withMessage('Query ID must be a non-empty string'),
    query('startDate')
      .optional()
      .isISO8601()
      .withMessage('Start date must be a valid ISO date'),
    query('endDate')
      .optional()
      .isISO8601()
      .withMessage('End date must be a valid ISO date')
  ]),
  queryController.getQueryStats
);

// Route for clearing all cache
queryRouter.delete(
  '/cache',
  requireAuth,
  queryController.clearCache
);

// Route for clearing specific query cache
queryRouter.delete(
  '/cache/:queryId',
  requireAuth,
  validateRequest([
    param('queryId')
      .isString()
      .notEmpty()
      .withMessage('Query ID must be a non-empty string')
  ]),
  queryController.clearCache
);

queryRouter.get('/health', async (req, res) => {
  try {
    const { QueryService } = await import('@/services/query/QueryService');
    const { db } = await import('@/config/database');
    
    const queryService = QueryService.getInstance(db.getPool());
    
    const healthCheck = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        postgres: await queryService.testConnection('postgres'),
        ad: await queryService.testConnection('ad'),
        azure: await queryService.testConnection('azure'),
        o365: await queryService.testConnection('o365')
      }
    };
    
    const overallHealthy = Object.values(healthCheck.services).some(status => status);
    
    res.status(overallHealthy ? 200 : 503).json({
      success: overallHealthy,
      data: healthCheck
    });
    
  } catch {
    res.status(500).json({
      success: false,
      error: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

queryRouter.get('/metrics', async (req, res) => {
  try {
    const { db } = await import('@/config/database');
    
    // Get query execution metrics from the database
    const [
      totalQueries,
      recentQueries,
      queryStats,
      errorStats
    ] = await Promise.all([
      db.query('SELECT COUNT(*) as total FROM query_metrics'),
      db.query(`
        SELECT query_id, COUNT(*) as executions, AVG(execution_time_ms) as avg_time
        FROM query_metrics 
        WHERE executed_at >= NOW() - INTERVAL '24 hours'
        GROUP BY query_id
        ORDER BY executions DESC
        LIMIT 10
      `),
      db.query(`
        SELECT 
          COUNT(*) as total_executions,
          AVG(execution_time_ms) as avg_execution_time,
          MAX(execution_time_ms) as max_execution_time,
          SUM(CASE WHEN cached THEN 1 ELSE 0 END) as cached_executions
        FROM query_metrics
        WHERE executed_at >= NOW() - INTERVAL '24 hours'
      `),
      db.query(`
        SELECT COUNT(*) as error_count
        FROM query_metrics qm
        LEFT JOIN report_history rh ON qm.query_id = rh.template_id::text
        WHERE rh.status = 'failed' AND rh.generated_at >= NOW() - INTERVAL '24 hours'
      `)
    ]);
    
    const metrics = {
      totalQueries: parseInt(totalQueries.rows[0].total),
      last24Hours: {
        totalExecutions: parseInt(queryStats.rows[0]?.total_executions || 0),
        averageExecutionTime: parseFloat(queryStats.rows[0]?.avg_execution_time || 0),
        maxExecutionTime: parseInt(queryStats.rows[0]?.max_execution_time || 0),
        cachedExecutions: parseInt(queryStats.rows[0]?.cached_executions || 0),
        errors: parseInt(errorStats.rows[0]?.error_count || 0)
      },
      topQueries: recentQueries.rows.map((row: any) => ({
        queryId: row.query_id,
        executions: parseInt(row.executions),
        averageTime: parseFloat(row.avg_time)
      }))
    };
    
    res.json({
      success: true,
      data: {
        metrics,
        retrievedAt: new Date().toISOString()
      }
    });
    
  } catch {
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve metrics'
    });
  }
});

// ============================================================================
// Graph Query Routes
// ============================================================================

// Execute a Graph API query
queryRouter.post(
  '/graph/execute',
  requireAuth,
  executeGraphQueryValidation,
  queryController.executeGraphQuery
);

// Get available Graph query definitions
queryRouter.get(
  '/graph/definitions',
  requireAuth,
  validateRequest([
    query('category')
      .optional()
      .isIn(['users', 'groups', 'security', 'licenses', 'reports'])
      .withMessage('Invalid category'),
    query('search')
      .optional()
      .isString()
      .withMessage('Search must be a string')
  ]),
  queryController.getGraphQueryDefinitions
);

// Get Graph query execution history
queryRouter.get(
  '/graph/history',
  requireAuth,
  validateRequest([
    query('queryId')
      .optional()
      .isString()
      .withMessage('Query ID must be a string'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('offset')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Offset must be a positive integer')
  ]),
  queryController.getGraphQueryHistory
);

// Execute multiple Graph queries in batch
queryRouter.post(
  '/graph/batch',
  requireAuth,
  executeGraphBatchValidation,
  queryController.executeGraphBatch
);

router.use('/query', queryRouter);

// ============================================================================
// EXPORT ROUTES
// ============================================================================

const exportRouter = Router();
exportRouter.use(requireAuth);



exportRouter.post(
  '/report/:templateId',
  validateRequest([
    param('templateId').isUUID().withMessage('Invalid template ID'),
    body('format').optional().isIn(['excel', 'csv', 'pdf']).withMessage('Invalid format'),
    body('parameters').optional().isObject().withMessage('Parameters must be an object'),
  ]),
  exportController.exportReport.bind(exportController)
);

exportRouter.post(
  '/custom/:customTemplateId',
  validateRequest([
    param('customTemplateId').isUUID().withMessage('Invalid custom template ID'),
    body('format').optional().isIn(['excel', 'csv', 'pdf']).withMessage('Invalid format'),
    body('parameters').optional().isObject().withMessage('Parameters must be an object'),
  ]),
  exportController.exportReport.bind(exportController)
);

exportRouter.post(
  '/queue/report/:templateId',
  validateRequest([
    param('templateId').isUUID().withMessage('Invalid template ID'),
    body('format').optional().isIn(['excel', 'csv', 'pdf']).withMessage('Invalid format'),
    body('parameters').optional().isObject().withMessage('Parameters must be an object'),
    body('priority').optional().isInt({ min: 1, max: 10 }).withMessage('Priority must be 1-10'),
  ]),
  exportController.queueExport.bind(exportController)
);

exportRouter.post(
  '/queue/custom/:customTemplateId',
  validateRequest([
    param('customTemplateId').isUUID().withMessage('Invalid custom template ID'),
    body('format').optional().isIn(['excel', 'csv', 'pdf']).withMessage('Invalid format'),
    body('parameters').optional().isObject().withMessage('Parameters must be an object'),
    body('priority').optional().isInt({ min: 1, max: 10 }).withMessage('Priority must be 1-10'),
  ]),
  exportController.queueExport.bind(exportController)
);

exportRouter.get(
  '/history/:historyId',
  validateRequest([
    param('historyId').isUUID().withMessage('Invalid history ID'),
    query('format').optional().isIn(['excel', 'csv']).withMessage('Invalid format'),
  ]),
  exportController.exportHistoryResults.bind(exportController)
);

exportRouter.get(
  '/download/:filename',
  validateRequest([
    param('filename').matches(/^[a-zA-Z0-9_.-]+\.(xlsx|csv|pdf)$/).withMessage('Invalid filename'),
  ]),
  exportController.downloadFile.bind(exportController)
);

exportRouter.get(
  '/job/:jobId',
  validateRequest([
    param('jobId').isNumeric().withMessage('Invalid job ID'),
  ]),
  exportController.getJobStatus.bind(exportController)
);

exportRouter.post(
  '/cleanup',
  requireAdmin,
  validateRequest([
    body('daysOld').optional().isInt({ min: 1, max: 365 }).withMessage('Days must be 1-365'),
  ]),
  exportController.cleanupExports.bind(exportController)
);

router.use('/export', exportRouter);

// ============================================================================
// FAVORITES
// ============================================================================

// Get user's favorite reports
router.get('/favorites',
  requireAuth,
  reportsController.getFavorites
);

// Add report to favorites
router.post('/favorites',
  requireAuth,
  validateRequest([
    body('templateId').optional().isUUID().withMessage('Invalid template ID'),
    body('customTemplateId').optional().isUUID().withMessage('Invalid custom template ID')
  ]),
  reportsController.addToFavorites
);

// Remove report from favorites
router.delete('/favorites',
  requireAuth,
  validateRequest([
    body('templateId').optional().isUUID().withMessage('Invalid template ID'),
    body('customTemplateId').optional().isUUID().withMessage('Invalid custom template ID')
  ]),
  reportsController.removeFromFavorites
);

export default router;
