import { Response } from 'express';
import { logsService, LogQueryParams } from './logs.service';
import { loggingConfig } from '@/config/logging.config';
import { logger } from '@/utils/logger';

export class LogsExportService {
  private readonly CHUNK_SIZE = loggingConfig.export.chunkSize || 1000;

  /**
   * Export logs in CSV format
   */
  async exportCSV(res: Response, params: LogQueryParams, maxRecords: number): Promise<void> {
    // Write CSV header
    res.write('Type,Timestamp,Level/EventType,Action/Message,User,IP Address,Status,Details\n');

    let totalExported = 0;
    let offset = 0;

    // Export audit logs
    if (params.type === 'audit' || params.type === 'all') {
      while (totalExported < maxRecords) {
        const result = await logsService.getAuditLogs({ ...params, pageSize: this.CHUNK_SIZE }, offset);
        if (result.logs.length === 0) break;

        for (const log of result.logs) {
          if (totalExported >= maxRecords) break;
          res.write(this.formatAuditLogAsCSV(log));
          totalExported++;
        }

        offset += this.CHUNK_SIZE;
      }
    }

    // Export system logs
    offset = 0;
    if (params.type === 'system' || params.type === 'all') {
      while (totalExported < maxRecords) {
        const result = await logsService.getSystemLogs({ ...params, pageSize: this.CHUNK_SIZE }, offset);
        if (result.logs.length === 0) break;

        for (const log of result.logs) {
          if (totalExported >= maxRecords) break;
          res.write(this.formatSystemLogAsCSV(log));
          totalExported++;
        }

        offset += this.CHUNK_SIZE;
      }
    }

    res.end();
  }

  /**
   * Export logs in JSON format
   */
  async exportJSON(res: Response, params: LogQueryParams, maxRecords: number): Promise<void> {
    res.write('{"audit":[');

    let totalExported = 0;
    let offset = 0;
    let firstAudit = true;

    // Export audit logs
    if (params.type === 'audit' || params.type === 'all') {
      while (totalExported < maxRecords) {
        const result = await logsService.getAuditLogs({ ...params, pageSize: this.CHUNK_SIZE }, offset);
        if (result.logs.length === 0) break;

        for (const log of result.logs) {
          if (totalExported >= maxRecords) break;
          if (!firstAudit) res.write(',');
          res.write(JSON.stringify(log));
          firstAudit = false;
          totalExported++;
        }

        offset += this.CHUNK_SIZE;
      }
    }

    res.write('],"system":[');

    // Export system logs
    offset = 0;
    let firstSystem = true;
    if (params.type === 'system' || params.type === 'all') {
      while (totalExported < maxRecords) {
        const result = await logsService.getSystemLogs({ ...params, pageSize: this.CHUNK_SIZE }, offset);
        if (result.logs.length === 0) break;

        for (const log of result.logs) {
          if (totalExported >= maxRecords) break;
          if (!firstSystem) res.write(',');
          res.write(JSON.stringify(log));
          firstSystem = false;
          totalExported++;
        }

        offset += this.CHUNK_SIZE;
      }
    }

    res.write(']}');
    res.end();
  }

  /**
   * Format audit log as CSV row
   */
  private formatAuditLogAsCSV(log: Record<string, any>): string {
    const fields = [
      'Audit',
      log.created_at,
      log.event_type,
      log.event_action,
      log.username || log.user_id || '',
      log.ip_address || '',
      log.success ? 'Success' : 'Failed',
      log.error_message || JSON.stringify(log.details || {})
    ];
    return fields.map(f => `"${String(f).replace(/"/g, '""')}"`).join(',') + '\n';
  }

  /**
   * Format system log as CSV row
   */
  private formatSystemLogAsCSV(log: Record<string, any>): string {
    const fields = [
      'System',
      log.timestamp,
      log.level,
      log.message,
      log.user_id || '',
      log.ip_address || '',
      log.status_code || '',
      log.error_stack || JSON.stringify(log.metadata || {})
    ];
    return fields.map(f => `"${String(f).replace(/"/g, '""')}"`).join(',') + '\n';
  }

  /**
   * Export logs with streaming
   */
  async streamExport(res: Response, params: LogQueryParams, format: string, maxRecords: number): Promise<void> {
    try {
      // Set response headers
      res.setHeader('Content-Type', format === 'csv' ? 'text/csv' : 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=logs_export_${Date.now()}.${format}`);

      if (format === 'csv') {
        await this.exportCSV(res, params, maxRecords);
      } else {
        await this.exportJSON(res, params, maxRecords);
      }
    } catch (error) {
      logger.error('Error during log export:', error);
      throw error;
    }
  }
}

export const logsExportService = new LogsExportService();