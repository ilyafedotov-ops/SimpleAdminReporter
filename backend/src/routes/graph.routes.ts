import { Router } from 'express';
import { graphController } from '../controllers/graph.controller';
import { requireAuth, userRateLimit, auditAction } from '../middleware/auth-wrapper';
import { body, param, query } from 'express-validator';
import { validateRequest } from '../middleware/validation.middleware';

const router = Router();

// All Graph routes require authentication
router.use(requireAuth);

// ============================================================================
// GRAPH QUERY TEMPLATES
// ============================================================================

// Get available Graph query templates
router.get('/templates',
  validateRequest([
    query('category').optional().isIn(['users', 'groups', 'security', 'licenses', 'reports'])
  ]),
  graphController.getTemplates
);

// ============================================================================
// GRAPH QUERY EXECUTION
// ============================================================================

// Execute a single Graph query
router.post('/execute/:queryId',
  userRateLimit(30),
  validateRequest([
    param('queryId').notEmpty().withMessage('Query ID is required'),
    body('parameters').optional().isObject(),
    body('credentialId').optional().isInt(),
    body('context').optional().isObject()
  ]),
  auditAction('execute_graph_query', 'graph_execution'),
  graphController.executeQuery
);

// Execute batch Graph queries
router.post('/batch',
  userRateLimit(10),
  validateRequest([
    body('queries').isArray().withMessage('Queries must be an array'),
    body('queries.*.queryId').notEmpty().withMessage('Query ID is required'),
    body('queries.*.parameters').optional().isObject()
  ]),
  auditAction('execute_graph_batch', 'graph_execution'),
  graphController.executeBatch
);

// ============================================================================
// FIELD DISCOVERY
// ============================================================================

// Discover fields for a Graph entity type
router.get('/fields/:entityType',
  validateRequest([
    param('entityType').isIn(['users', 'groups', 'devices', 'applications']),
    query('refresh').optional().isBoolean(),
    query('category').optional().isString()
  ]),
  graphController.discoverFields
);

// Search fields
router.get('/fields/:entityType/search',
  validateRequest([
    param('entityType').isIn(['users', 'groups', 'devices', 'applications']),
    query('search').notEmpty().withMessage('Search term is required')
  ]),
  graphController.searchFields
);

// ============================================================================
// EXECUTION HISTORY
// ============================================================================

// Get execution history
router.get('/history',
  validateRequest([
    query('queryId').optional().isString(),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 })
  ]),
  graphController.getHistory
);

// Get specific execution result
router.get('/history/:executionId',
  validateRequest([
    param('executionId').isInt()
  ]),
  graphController.getExecutionResult
);

export default router;