import { Router } from "express";
import { logsController } from "@/controllers/logs.controller";
import { requireAuth, requireAdmin } from "@/middleware/auth-wrapper";
import { LogsValidator } from "@/validators/logs.validator";
import {
  logsQueryRateLimiter,
  logsExportRateLimiter,
} from "@/middleware/rate-limit.middleware";

const router = Router();

// All logs routes require authentication and admin privileges
router.use(requireAuth);
router.use(requireAdmin);

// Get logs with filtering and pagination
router.get(
  "/",
  logsQueryRateLimiter,
  LogsValidator.validateLogQuery,
  logsController.getLogs.bind(logsController),
);

// Get log statistics
router.get(
  "/stats",
  logsQueryRateLimiter,
  LogsValidator.validateLogStats,
  logsController.getLogStats.bind(logsController),
);

// Get real-time logs (most recent)
router.get(
  "/realtime",
  logsQueryRateLimiter,
  LogsValidator.validateLogQuery,
  logsController.getLogs.bind(logsController),
);

// Export logs
router.get(
  "/export",
  logsExportRateLimiter,
  LogsValidator.validateLogExport,
  logsController.exportLogs.bind(logsController),
);

// Get logging system metrics
router.get(
  "/metrics",
  logsQueryRateLimiter,
  logsController.getMetrics.bind(logsController),
);

// Get query performance metrics
router.get(
  "/metrics/queries",
  logsQueryRateLimiter,
  logsController.getQueryMetrics.bind(logsController),
);

// Export query metrics as CSV
router.get(
  "/metrics/queries/export",
  logsExportRateLimiter,
  logsController.exportQueryMetrics.bind(logsController),
);

// Get WebSocket connection statistics
router.get(
  "/websocket/stats",
  logsQueryRateLimiter,
  logsController.getWebSocketStats.bind(logsController),
);

// Get materialized view statistics
router.get(
  "/materialized-views/stats",
  logsQueryRateLimiter,
  logsController.getMaterializedViewStats.bind(logsController),
);

// Manually refresh materialized views
router.post(
  "/materialized-views/refresh",
  logsController.refreshMaterializedViews.bind(logsController),
);

// Clean up old logs
router.post(
  "/cleanup",
  LogsValidator.validateLogCleanup,
  logsController.cleanupOldLogs.bind(logsController),
);

// Full-text search endpoint
router.get(
  "/search/fulltext",
  logsQueryRateLimiter,
  LogsValidator.validateLogSearch,
  logsController.searchLogs.bind(logsController),
);

// Fuzzy search endpoint
router.get(
  "/search/fuzzy",
  logsQueryRateLimiter,
  LogsValidator.validateFuzzySearch,
  logsController.fuzzySearchLogs.bind(logsController),
);

// Get specific log details
router.get(
  "/:id",
  logsQueryRateLimiter,
  LogsValidator.validateLogDetail,
  logsController.getLogDetails.bind(logsController),
);

export default router;
