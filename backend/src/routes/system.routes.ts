import express from 'express';
import { systemController } from '@/controllers/system.controller';
// Use the auth wrapper to automatically select the correct authentication middleware
import { requireAuth, requireAdmin } from '@/middleware/auth-wrapper';

const router = express.Router();

/**
 * System Configuration Routes
 * All routes require authentication and admin privileges
 */

// Get system configuration and status
router.get('/config', requireAuth, requireAdmin, systemController.getSystemConfig);
router.post('/config', requireAuth, requireAdmin, systemController.updateSystemConfig);
router.get('/health', requireAuth, systemController.getSystemHealth);

export { router as systemRoutes };