import { Request, Response, NextFunction } from 'express';
import { db } from '@/config/database';

import { reportExecutor } from '@/services/report-executor.service';
import { addReportToQueue } from '@/queues/report.queue';
import { exportService } from '@/services/export.service';
import { createError } from '@/middleware/error.middleware';
import { logger } from '@/utils/logger';
import path from 'path';
import fs from 'fs/promises';
import { existsSync, readFileSync } from 'fs';

export class ExportController {
  constructor() {
    // Services are accessed through service factory
  }

  /**
   * Export a report immediately
   */
  async exportReport(req: Request, res: Response, _next: NextFunction) {
    try {
      const { templateId, customTemplateId } = req.params;
      const { format = 'excel', parameters = {} } = req.body;

      if (!['excel', 'csv', 'pdf'].includes(format)) {
        throw createError('Invalid export format', 400);
      }

      // Check if user has access to the report
      if (customTemplateId) {
        const templateResult = await db.query(
          'SELECT * FROM custom_report_templates WHERE id = $1',
          [customTemplateId]
        );

        if (templateResult.rows.length === 0) {
          throw createError('Custom report template not found', 404);
        }

        const template = templateResult.rows[0];
        if (!template.is_public && template.created_by !== req.user!.id && !req.user!.isAdmin) {
          throw createError('Access denied to this report', 403);
        }
      }

      // Execute query using unified report executor
      const queryResult = await reportExecutor.executeReport({
        userId: req.user!.id,
        templateId: templateId || customTemplateId!,
        parameters
      });

      if (!queryResult.success) {
        throw createError(queryResult.error || 'Query execution failed', 500);
      }

      // Export report using ExportService
      const exportResult = await exportService.exportData(
        queryResult.data || [],
        format,
        templateId || customTemplateId!
      );

      // Save export file to filesystem
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${exportResult.filename.replace(/\.[^.]+$/, '')}_${timestamp}${path.extname(exportResult.filename)}`;
      // Better container detection - check for actual container patterns
      const isRunningInContainer = () => {
        // Check for .dockerenv file (most reliable)
        if (existsSync('/.dockerenv')) {
          return true;
        }
        
        // Check cgroup for docker/containerd patterns
        try {
          if (existsSync('/proc/1/cgroup')) {
            const cgroup = readFileSync('/proc/1/cgroup', 'utf8');
            // Look for docker, containerd, or k8s patterns
            if (cgroup.includes('docker') || cgroup.includes('containerd') || cgroup.includes('kubepods')) {
              return true;
            }
          }
        } catch {
          // Ignore errors
        }
        
        return false;
      };
      
      const isInContainer = process.env.REPORT_EXPORT_PATH || isRunningInContainer();
      const exportBasePath = process.env.REPORT_EXPORT_PATH || 
        (isInContainer ? '/app/exports' : './exports');
      const filePath = path.join(exportBasePath, filename);
      
      // Ensure export directory exists
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, exportResult.data);

      // Save export history
      await db.query(
        `INSERT INTO report_history 
         (user_id, template_id, custom_template_id, parameters, status, file_path, row_count, export_format, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          req.user!.id,
          templateId || null,
          customTemplateId || null,
          JSON.stringify(parameters),
          'completed',
          filePath,
          queryResult.data?.length || 0,
          format,
          new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days expiry
        ]
      );

      // Send file info
      res.json({
        success: true,
        data: {
          fileName: path.basename(filePath),
          format,
          rowCount: queryResult.data?.length || 0,
          downloadUrl: `/api/export/download/${path.basename(filePath)}`
        }
      });

    } catch (error) {
      logger.error('Export error:', error);
      _next(error);
    }
  }

  /**
   * Queue a report for export (for large reports)
   */
  async queueExport(req: Request, res: Response, _next: NextFunction) {
    try {
      const { templateId, customTemplateId } = req.params;
      const { format = 'excel', parameters = {}, priority = 1 } = req.body;

      if (!['excel', 'csv', 'pdf'].includes(format)) {
        throw createError('Invalid export format', 400);
      }

      // Queue the export job
      const job = await addReportToQueue({
        templateId,
        customTemplateId,
        parameters,
        userId: req.user!.id,
        exportFormat: format as 'excel' | 'csv' | 'pdf',
        priority
      });

      res.json({
        success: true,
        data: {
          jobId: job.id,
          status: 'queued',
          message: 'Report queued for export. Check status using the job ID.'
        }
      });

    } catch (error) {
      logger.error('Queue export error:', error);
      _next(error);
    }
  }

  /**
   * Download an exported file
   */
  async downloadFile(req: Request, res: Response, _next: NextFunction) {
    try {
      const { filename } = req.params;
      
      // Validate filename first - prevent directory traversal and special characters
      if (!filename || typeof filename !== 'string') {
        throw createError('Invalid filename parameter', 400);
      }
      
      // Sanitize filename - allow only alphanumeric, dots, hyphens, underscores
      const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '');
      if (!sanitizedFilename || sanitizedFilename !== filename) {
        throw createError('Invalid filename - contains illegal characters', 400);
      }
      
      // Additional security checks
      if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        throw createError('Invalid filename - path traversal attempt', 400);
      }

      // Use container detection logic for export path  
      const exportPath = process.env.REPORT_EXPORT_PATH || './exports';
      
      // Resolve and normalize paths to prevent directory traversal
      const resolvedExportPath = path.resolve(exportPath);
      const requestedFilePath = path.resolve(resolvedExportPath, sanitizedFilename);
      
      // Security validation - ensure the resolved path is within the export directory
      if (!requestedFilePath.startsWith(resolvedExportPath + path.sep) && 
          requestedFilePath !== resolvedExportPath) {
        throw createError('Invalid file path - outside allowed directory', 403);
      }
      
      const filePath = requestedFilePath;

      // Check if file exists and user has access
      const historyResult = await db.query(
        `SELECT * FROM report_history 
         WHERE file_path LIKE $1 
         AND (user_id = $2 OR $3 = true)
         AND expires_at > NOW()`,
        [`%${sanitizedFilename}`, req.user!.id, req.user!.isAdmin]
      );

      if (historyResult.rows.length === 0) {
        throw createError('File not found or access denied', 404);
      }

      // Check if file exists on disk
      try {
        await fs.access(filePath);
      } catch {
        throw createError('File not found on server', 404);
      }

      // Get file stats
      const stats = await fs.stat(filePath);
      
      // Determine content type based on file extension
      const ext = path.extname(sanitizedFilename).toLowerCase();
      let contentType = 'application/octet-stream';
      
      switch (ext) {
        case '.xlsx':
          contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          break;
        case '.csv':
          contentType = 'text/csv';
          break;
        case '.pdf':
          contentType = 'application/pdf';
          break;
      }

      // Set headers
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFilename}"`);
      res.setHeader('Content-Length', stats.size);

      // Stream file
      const fileStream = await fs.open(filePath, 'r');
      const stream = fileStream.createReadStream();
      stream.pipe(res);

      stream.on('end', () => {
        fileStream.close();
      });

    } catch (error) {
      logger.error('Download error:', error);
      _next(error);
    }
  }

  /**
   * Export history results in Excel format with enhanced formatting
   */
  async exportHistoryResults(req: Request, res: Response, _next: NextFunction) {
    try {
      const { historyId } = req.params;
      const { format = 'excel', visibleColumns } = req.query;

      // Get history record with results
      const historyResult = await db.query(
        `SELECT h.*
         FROM report_history h
         WHERE h.id = $1 AND (h.user_id = $2 OR $3 = true)`,
        [historyId, req.user!.id, req.user!.isAdmin]
      );

      if (historyResult.rows.length === 0) {
        throw createError('History record not found or access denied', 404);
      }

      const history = historyResult.rows[0];
      const reportName = history.report_name || history.report_id || 'Report';

      // Check if results are in the history record itself
      let results = history.results;
      
      // If not, check the separate report_results table
      if (!results || results.length === 0) {
        const resultsQuery = await db.query(
          'SELECT result_data FROM report_results WHERE history_id = $1',
          [historyId]
        );
        
        if (resultsQuery.rows.length > 0) {
          results = resultsQuery.rows[0].result_data;
        }
      }

      if (!results || results.length === 0) {
        throw createError('No results found for this history record', 404);
      }

      // Parse visible columns if provided
      let visibleColumnsArray: string[] | undefined;
      if (visibleColumns) {
        if (typeof visibleColumns === 'string') {
          visibleColumnsArray = visibleColumns.split(',').filter(col => col.trim());
        } else if (Array.isArray(visibleColumns)) {
          visibleColumnsArray = visibleColumns as string[];
        }
      }

      // Export with enhanced formatting
      const exportResult = await exportService.exportDataWithFormatting(
        results,
        format as 'excel' | 'csv',
        reportName,
        {
          title: reportName,
          executedAt: history.executed_at,
          parameters: history.parameters,
          resultCount: history.result_count,
          visibleColumns: visibleColumnsArray
        }
      );

      // Set response headers
      const contentTypes: Record<string, string> = {
        excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        csv: 'text/csv'
      };

      res.setHeader('Content-Type', contentTypes[format as string] || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${exportResult.filename}"`);
      res.setHeader('Content-Length', exportResult.data.length);

      // Send file directly
      res.send(exportResult.data);

    } catch (error) {
      logger.error('Export history results error:', error);
      _next(error);
    }
  }

  /**
   * Get export job status
   */
  async getJobStatus(req: Request, res: Response, _next: NextFunction) {
    try {
      const { jobId } = req.params;
      
      // Job status functionality requires Bull Queue implementation
      // Returning placeholder status for now
      res.json({
        success: true,
        data: {
          jobId,
          status: 'processing',
          progress: 50,
          message: 'Report generation in progress...'
        }
      });

    } catch (error) {
      logger.error('Job status error:', error);
      _next(error);
    }
  }

  /**
   * Clean up old export files
   */
  async cleanupExports(req: Request, res: Response, _next: NextFunction) {
    try {
      if (!req.user!.isAdmin) {
        throw createError('Admin access required', 403);
      }

      const { daysOld = 7 } = req.body;
      
      // Get expired files
      const expiredResult = await db.query(
        `SELECT file_path FROM report_history 
         WHERE expires_at < NOW() 
         OR created_at < NOW() - INTERVAL '${daysOld} days'`
      );

      let deletedCount = 0;
      let errorCount = 0;

      // Delete files
      for (const row of expiredResult.rows) {
        if (row.file_path) {
          try {
            await fs.unlink(row.file_path);
            deletedCount++;
          } catch (error) {
            errorCount++;
            logger.error(`Failed to delete file: ${row.file_path}`, error);
          }
        }
      }

      // Clean up database records
      await db.query(
        `DELETE FROM report_history 
         WHERE expires_at < NOW() 
         OR created_at < NOW() - INTERVAL '${daysOld} days'`
      );

      res.json({
        success: true,
        data: {
          filesDeleted: deletedCount,
          errors: errorCount,
          message: `Cleaned up ${deletedCount} expired export files`
        }
      });

    } catch (error) {
      logger.error('Cleanup error:', error);
      _next(error);
    }
  }
}