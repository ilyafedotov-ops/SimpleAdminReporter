import { Router } from 'express';
import healthController from '@/controllers/health.controller';
import { requireAuth } from '@/middleware/auth-wrapper';

const router = Router();

/**
 * @route   GET /api/health
 * @desc    Basic health check
 * @access  Public - No authentication required
 */
router.get('/', healthController.getBasicHealth);

/**
 * @route   GET /api/health/detailed
 * @desc    Detailed health check with all components
 * @access  Public - No authentication required
 */
router.get('/detailed', healthController.getDetailedHealth);

/**
 * @route   GET /api/health/ready
 * @desc    Readiness probe for container orchestration
 * @access  Protected - Requires authentication
 */
router.get('/ready', requireAuth, healthController.getReadiness);

/**
 * @route   GET /api/health/live
 * @desc    Liveness probe for container orchestration
 * @access  Public - No authentication required
 */
router.get('/live', healthController.getLiveness);

/**
 * @route   GET /api/health/component/:component
 * @desc    Get health status of a specific component
 * @access  Protected - Requires authentication
 */
router.get('/component/:component', requireAuth, healthController.getComponentHealth);

/**
 * @route   GET /api/health/summary
 * @desc    Get health summary (statuses only)
 * @access  Protected - Requires authentication
 */
router.get('/summary', requireAuth, healthController.getHealthSummary);

/**
 * @route   GET /api/health/operational
 * @desc    Check if system is operational
 * @access  Protected - Requires authentication
 */
router.get('/operational', requireAuth, healthController.getOperational);

/**
 * @route   GET /api/health/pool
 * @desc    Get database connection pool statistics
 * @access  Protected - Requires authentication
 */
router.get('/pool', requireAuth, healthController.getDatabasePoolStats);

export default router;
