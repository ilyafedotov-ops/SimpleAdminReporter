import { Request, Response } from 'express';
import { logsService } from '@/services/logs.service';
import { logsStatsService } from '@/services/logs-stats.service';
import { logsExportService } from '@/services/logs-export.service';
import { auditLogger } from '@/services/audit-logger.service';
import { queryMetricsService } from '@/services/query-metrics.service';
import { socketService } from '@/services/socket.service';
import { materializedViewsService } from '@/services/materialized-views.service';
import { logger } from '@/utils/logger';
import { User } from '@/auth/types';
import { loggingConfig } from '@/config/logging.config';
import { db } from '@/config/database';
import { QueryAnalyzer } from '@/utils/query-analyzer';

// Extend Request to include user and correlation ID
interface AuthenticatedRequest extends Request {
  user?: User;
  correlationId?: string;
}

export class LogsController {
  /**
   * Get logs with filtering and pagination
   */
  async getLogs(req: AuthenticatedRequest, res: Response): Promise<void> {
    logger.info('GET /api/logs endpoint called with query:', req.query);
    
    try {
      const params = {
        type: req.query.type as any || 'all',
        level: req.query.level as string,
        eventType: req.query.eventType as string,
        eventAction: req.query.eventAction as string,
        userId: req.query.userId ? parseInt(req.query.userId as string) : undefined,
        module: req.query.module as string,
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
        search: req.query.search as string,
        page: parseInt(req.query.page as string) || 1,
        pageSize: parseInt(req.query.pageSize as string) || 50,
        sortBy: req.query.sortBy as string || 'timestamp',
        sortOrder: (req.query.sortOrder as any) || 'desc',
        correlationId: req.query.correlationId as string
      };

      // Validate and limit page size
      params.pageSize = Math.min(params.pageSize, loggingConfig.query.maxPageSize);

      // Debug mode: analyze query if requested
      if (req.query.analyze === 'true') {
        logger.info('Query analysis requested for logs endpoint');
        
        // Get table stats
        await QueryAnalyzer.getTableStats('audit_logs');
        await QueryAnalyzer.getTableStats('system_logs');
        
        // Check index usage
        await QueryAnalyzer.checkIndexUsage('audit_logs');
        await QueryAnalyzer.checkIndexUsage('system_logs');
      }

      // Set a timeout for the entire request
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), 28000); // 28 seconds (less than DB timeout)
      });

      // Get combined logs with timeout
      const results = await Promise.race([
        logsService.getCombinedLogs(params),
        timeoutPromise
      ]);

      // Log access
      try {
        await auditLogger.logAccess(
          'api_access',
          { user: req.user, request: req },
          'logs',
          undefined,
          {
            logType: params.type,
            filters: params,
            correlationId: req.correlationId
          }
        );
      } catch (auditError) {
        logger.error('Failed to log access to audit log:', auditError);
      }

      // Set headers to prevent caching
      res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Surrogate-Control': 'no-store'
      });
      
      res.json({
        success: true,
        data: results,
        pagination: {
          page: params.page,
          pageSize: params.pageSize,
          totalAudit: results.totalAudit,
          totalSystem: results.totalSystem,
          totalPages: Math.ceil(Math.max(results.totalAudit, results.totalSystem) / params.pageSize)
        },
        meta: {
          limited: !(params.startDate || params.endDate),
          limitApplied: !(params.startDate || params.endDate) ? 300 : null,
          message: !(params.startDate || params.endDate) 
            ? 'Showing most recent 300 records. Use date filters to view older records.' 
            : null
        },
        correlationId: req.correlationId
      });
    } catch (error) {
      logger.error('Error fetching logs:', error, { correlationId: req.correlationId });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch logs',
        correlationId: req.correlationId
      });
    }
  }

  /**
   * Get log statistics
   */
  async getLogStats(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const hours = parseInt(req.query.hours as string) || 24;
      const stats = await logsStatsService.getLogStats(hours);

      res.json({
        success: true,
        data: stats,
        correlationId: req.correlationId
      });
    } catch (error) {
      logger.error('Error fetching log statistics:', error, { correlationId: req.correlationId });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch log statistics',
        correlationId: req.correlationId
      });
    }
  }

  /**
   * Get log details by ID
   */
  async getLogDetails(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { type } = req.query;

      let result;
      if (type === 'audit') {
        result = await db.query('SELECT * FROM audit_logs WHERE id = $1', [id]);
      } else if (type === 'system') {
        result = await db.query('SELECT * FROM system_logs WHERE id = $1', [id]);
      } else {
        res.status(400).json({
          success: false,
          error: 'Invalid log type. Must be "audit" or "system"',
          correlationId: req.correlationId
        });
        return;
      }

      if (result.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: 'Log entry not found',
          correlationId: req.correlationId
        });
        return;
      }

      // Sanitize sensitive data
      const log = result.rows[0];
      const sanitized = logsService.sanitizeLogs([log])[0];

      res.json({
        success: true,
        data: sanitized,
        correlationId: req.correlationId
      });
    } catch (error) {
      logger.error('Error fetching log details:', error, { correlationId: req.correlationId });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch log details',
        correlationId: req.correlationId
      });
    }
  }

  /**
   * Export logs
   */
  async exportLogs(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const params = {
        type: req.query.type as any || 'all',
        level: req.query.level as string,
        eventType: req.query.eventType as string,
        eventAction: req.query.eventAction as string,
        userId: req.query.userId ? parseInt(req.query.userId as string) : undefined,
        module: req.query.module as string,
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
        search: req.query.search as string
      };

      const format = req.query.format as string || 'csv';
      const maxRecords = parseInt(req.query.maxRecords as string) || loggingConfig.export.maxRecords;

      // Log export action
      try {
        await auditLogger.logData(
          'report_exported',
          { user: req.user, request: req },
          'logs',
          undefined,
          {
            format,
            filters: params,
            correlationId: req.correlationId
          }
        );
      } catch (auditError) {
        logger.error('Failed to log export to audit log:', auditError);
      }

      await logsExportService.streamExport(res, params, format, maxRecords);
    } catch (error) {
      logger.error('Error exporting logs:', error, { correlationId: req.correlationId });
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: 'Failed to export logs',
          correlationId: req.correlationId
        });
      }
    }
  }


  /**
   * Clean up old logs based on retention policy
   */
  async cleanupOldLogs(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const retentionDays = parseInt(req.query.retentionDays as string) || loggingConfig.retention.defaultDays;
      const dryRun = req.query.dryRun === 'true';

      let result;
      if (dryRun) {
        result = await logsStatsService.getCleanupStats(retentionDays);
      } else {
        result = await logsStatsService.performCleanup(retentionDays);

        // Log cleanup action
        await auditLogger.logSystem('maintenance_mode', {
          action: 'log_cleanup',
          ...result,
          correlationId: req.correlationId
        });
      }

      res.json({
        success: true,
        data: {
          dryRun,
          ...result
        },
        correlationId: req.correlationId
      });
    } catch (error) {
      logger.error('Error cleaning up old logs:', error, { correlationId: req.correlationId });
      res.status(500).json({
        success: false,
        error: 'Failed to cleanup old logs',
        correlationId: req.correlationId
      });
    }
  }

  /**
   * Get logging system metrics
   */
  async getMetrics(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const dbMetrics = await logsStatsService.getMetrics();
      
      res.json({
        success: true,
        data: {
          auditLogger: { status: 'operational' },
          database: dbMetrics,
          webSocketConnections: socketService.getStats().totalConnections,
          timestamp: new Date()
        },
        correlationId: req.correlationId
      });
    } catch (error) {
      logger.error('Error fetching metrics:', error, { correlationId: req.correlationId });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch metrics',
        correlationId: req.correlationId
      });
    }
  }

  /**
   * Full-text search for logs
   */
  async searchLogs(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const {
        q: searchQuery,
        type = 'all',
        page = '1',
        pageSize = '50'
      } = req.query;

      if (!searchQuery) {
        res.status(400).json({
          success: false,
          error: 'Search query is required',
          correlationId: req.correlationId
        });
        return;
      }

      const pageNum = parseInt(page as string);
      const pageSizeNum = Math.min(parseInt(pageSize as string), loggingConfig.query.maxPageSize);

      let results;
      if (type === 'audit') {
        results = await logsService.searchAuditLogsFullText(
          searchQuery as string,
          pageNum,
          pageSizeNum
        );
      } else if (type === 'system') {
        results = await logsService.searchSystemLogsFullText(
          searchQuery as string,
          pageNum,
          pageSizeNum
        );
      } else {
        // Enhanced search for all types
        results = await logsService.enhancedSearch({
          search: searchQuery as string,
          type: 'all',
          page: pageNum,
          pageSize: pageSizeNum
        });
      }

      // Log search action
      try {
        await auditLogger.logAccess(
          'api_access',
          { user: req.user, request: req },
          'logs_search',
          undefined,
          {
            searchQuery,
            type,
            resultsCount: results.total,
            correlationId: req.correlationId
          }
        );
      } catch (auditError) {
        logger.error('Failed to log search to audit log:', auditError);
      }

      res.json({
        success: true,
        data: results,
        correlationId: req.correlationId
      });
    } catch (error) {
      logger.error('Error searching logs:', error, { correlationId: req.correlationId });
      res.status(500).json({
        success: false,
        error: 'Failed to search logs',
        correlationId: req.correlationId
      });
    }
  }

  /**
   * Fuzzy search for logs
   */
  async fuzzySearchLogs(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const {
        type,
        field,
        term: searchTerm,
        threshold = '0.3',
        page = '1',
        pageSize = '50'
      } = req.query;

      if (!type || !field || !searchTerm) {
        res.status(400).json({
          success: false,
          error: 'type, field, and term parameters are required',
          correlationId: req.correlationId
        });
        return;
      }

      const results = await logsService.fuzzySearchLogs({
        type: type as 'audit' | 'system',
        field: field as string,
        searchTerm: searchTerm as string,
        threshold: parseFloat(threshold as string),
        page: parseInt(page as string),
        pageSize: Math.min(parseInt(pageSize as string), loggingConfig.query.maxPageSize)
      });

      res.json({
        success: true,
        data: results,
        correlationId: req.correlationId
      });
    } catch (error) {
      logger.error('Error in fuzzy search:', error, { correlationId: req.correlationId });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? ((error as any)?.message || String(error)) : 'Failed to perform fuzzy search',
        correlationId: req.correlationId
      });
    }
  }

  /**
   * Get query performance metrics
   */
  async getQueryMetrics(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { queryType, hours = '1' } = req.query;

      if (queryType) {
        // Get metrics for specific query type
        const stats = await queryMetricsService.getStats(queryType as string);
        const recentMetrics = await queryMetricsService.getRecentMetrics(queryType as string, 100);
        
        res.json({
          success: true,
          data: {
            stats,
            recentMetrics,
            queryType
          },
          correlationId: req.correlationId
        });
      } else {
        // Get overall metrics summary
        const summary = await queryMetricsService.getMetricsSummary(parseInt(hours as string));
        const allStats = await queryMetricsService.getAllStats();
        
        res.json({
          success: true,
          data: {
            summary,
            allStats
          },
          correlationId: req.correlationId
        });
      }
    } catch (error) {
      logger.error('Error fetching query metrics:', error, { correlationId: req.correlationId });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch query metrics',
        correlationId: req.correlationId
      });
    }
  }

  /**
   * Export query metrics as CSV
   */
  async exportQueryMetrics(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { queryType } = req.query;
      
      const csv = await queryMetricsService.exportMetrics(queryType as string);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="query-metrics-${new Date().toISOString()}.csv"`);
      res.send(csv);
      
      // Log export action
      await auditLogger.logData(
        'report_exported',
        { user: req.user, request: req },
        'query_metrics',
        undefined,
        {
          queryType,
          exportType: 'metrics',
          correlationId: req.correlationId
        }
      );
    } catch (error) {
      logger.error('Error exporting query metrics:', error, { correlationId: req.correlationId });
      res.status(500).json({
        success: false,
        error: 'Failed to export query metrics',
        correlationId: req.correlationId
      });
    }
  }

  /**
   * Get WebSocket connection statistics
   */
  async getWebSocketStats(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const stats = socketService.getStats();
      
      res.json({
        success: true,
        data: {
          ...stats,
          timestamp: new Date()
        },
        correlationId: req.correlationId
      });
    } catch (error) {
      logger.error('Error getting WebSocket stats:', error, { correlationId: req.correlationId });
      res.status(500).json({
        success: false,
        error: 'Failed to get WebSocket statistics',
        correlationId: req.correlationId
      });
    }
  }

  /**
   * Get materialized view statistics
   */
  async getMaterializedViewStats(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const stats = await materializedViewsService.getViewStats();
      const refreshHistory = materializedViewsService.getRefreshHistory();
      
      res.json({
        success: true,
        data: {
          views: stats,
          refreshHistory,
          enabled: process.env.USE_MATERIALIZED_VIEWS !== 'false',
          timestamp: new Date()
        },
        correlationId: req.correlationId
      });
    } catch (error) {
      logger.error('Error getting materialized view stats:', error, { correlationId: req.correlationId });
      res.status(500).json({
        success: false,
        error: 'Failed to get materialized view statistics',
        correlationId: req.correlationId
      });
    }
  }

  /**
   * Manually refresh materialized views
   */
  async refreshMaterializedViews(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { viewName } = req.body;
      
      if (viewName) {
        await materializedViewsService.refreshView(viewName);
      } else {
        await materializedViewsService.refreshAllViews();
      }
      
      // Log the manual refresh
      await auditLogger.logSystem('maintenance_mode', {
        action: 'manual_materialized_views_refresh',
        viewName: viewName || 'all',
        user: req.user,
        correlationId: req.correlationId
      });
      
      res.json({
        success: true,
        message: `Materialized view${viewName ? ` ${viewName}` : 's'} refreshed successfully`,
        correlationId: req.correlationId
      });
    } catch (error) {
      logger.error('Error refreshing materialized views:', error, { correlationId: req.correlationId });
      res.status(500).json({
        success: false,
        error: 'Failed to refresh materialized views',
        correlationId: req.correlationId
      });
    }
  }
}

// Create and export singleton instance
export const logsController = new LogsController();