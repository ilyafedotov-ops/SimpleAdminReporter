// Ensure environment variables are loaded before creating queues
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import Bull from 'bull';
import { logger } from '@/utils/logger';
import { reportExecutor } from '@/services/report-executor.service';
import { exportService } from '@/services/export.service';
import { notificationService } from '@/services/notification.service';

import { db } from '@/config/database';

// Job interfaces
export interface ReportJob {
  templateId?: string;
  customTemplateId?: string;
  parameters: Record<string, any>;
  userId: number;
  isScheduled?: boolean;
  recipients?: string[];
  exportFormat?: 'excel' | 'csv' | 'pdf';
  priority?: number;
}

export interface ReportResult {
  reportId: string;
  filePath?: string;
  rowCount: number;
  executionTimeMs: number;
  status: 'completed' | 'failed';
  error?: string;
}

// Parse Redis connection details
const redisUrl = process.env.REDIS_URL;
const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10) || 6379;
const redisPassword = process.env.REDIS_PASSWORD || undefined;

// Log Redis configuration for debugging
logger.debug('Bull Redis Configuration:', {
  redisUrl: redisUrl ? 'SET' : 'NOT SET',
  host: redisHost,
  port: redisPort,
  hasPassword: !!redisPassword,
  passwordLength: redisPassword ? redisPassword.length : 0
});

// If REDIS_URL is provided, parse it for Bull
let redisConfig: any;
if (redisUrl) {
  // Bull doesn't support Redis URLs directly, we need to parse it
  const url = new URL(redisUrl);
  redisConfig = {
    host: url.hostname,
    port: parseInt(url.port || '6379'),
    password: url.password || redisPassword,
    maxRetriesPerRequest: 3,
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    }
  };
} else {
  redisConfig = {
    host: redisHost,
    port: redisPort,
    password: redisPassword,
    maxRetriesPerRequest: 3,
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    }
  };
}

// Create report generation queue
export const reportQueue = new Bull<ReportJob>('report-generation', {
  redis: redisConfig,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});

// Process report generation jobs
reportQueue.process(async (job) => {
  const startTime = Date.now();
  const { templateId, customTemplateId, parameters, userId, exportFormat } = job.data;
  
  logger.info(`Processing report job ${job.id}`, {
    templateId,
    customTemplateId,
    userId,
    exportFormat,
  });

  try {
    // Initialize variables
    let queryResult: any;

    // Create report history entry
    const historyResult = await db.query(
      `INSERT INTO report_history 
       (user_id, template_id, custom_template_id, parameters, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [userId, templateId || null, customTemplateId || null, JSON.stringify(parameters), 'running']
    );
    const reportHistoryId = historyResult.rows[0].id;

    // Update job progress
    await job.progress(10);

    try {
      // Execute query using unified report executor
      queryResult = await reportExecutor.executeReport({
        userId,
        templateId: templateId || customTemplateId!,
        parameters
      });
      
      if (!queryResult.success) {
        throw new Error(queryResult.error || 'Query execution failed');
      }

      // Update progress
      await job.progress(70);

      // Export if requested
      let filePath: string | undefined;
      if (exportFormat && queryResult.data) {
        const exportResult = await exportService.exportData(
          queryResult.data || [],
          exportFormat,
          queryResult.metadata?.query || templateId || customTemplateId!
        );
        
        // Save to filesystem
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `${exportResult.filename.replace(/\.[^.]+$/, '')}_${timestamp}${path.extname(exportResult.filename)}`;
        // Use container detection logic for export path
        const { existsSync } = await import('fs');
        const isInContainer = process.env.REPORT_EXPORT_PATH || 
          (existsSync('/.dockerenv') || existsSync('/proc/1/cgroup'));
        const exportPath = process.env.REPORT_EXPORT_PATH || 
          (isInContainer ? '/app/exports' : './exports');
        filePath = path.join(exportPath, filename);
        
        const fs = await import('fs/promises');
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, exportResult.data);
        
        await job.progress(90);
      }

      // Update report history with success
      const executionTime = Date.now() - startTime;
      await db.query(
        `UPDATE report_history 
         SET status = $1, file_path = $2, row_count = $3, execution_time_ms = $4, 
             expires_at = $5
         WHERE id = $6`,
        [
          'completed',
          filePath || null,
          queryResult.data?.length || 0,
          executionTime,
          new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days expiry
          reportHistoryId,
        ]
      );

      await job.progress(100);

      logger.info(`Report job ${job.id} completed successfully`, {
        reportHistoryId,
        rowCount: queryResult.data?.length || 0,
        executionTime,
      });

      // Create success notification
      const reportName = templateId || customTemplateId || 'Custom Report';
      await notificationService.createNotification({
        userId,
        type: 'report_complete',
        title: 'Report Generated Successfully',
        message: `Your report "${reportName}" has been generated successfully with ${queryResult.data?.length || 0} results.`,
        priority: 2,
        category: 'report',
        source: 'report_scheduler',
        data: {
          reportHistoryId,
          reportName,
          rowCount: queryResult.data?.length || 0,
          executionTimeMs: executionTime,
          filePath,
          templateId,
          customTemplateId
        }
      });

      return {
        reportId: reportHistoryId,
        filePath,
        rowCount: queryResult.data?.length || 0,
        executionTimeMs: executionTime,
        status: 'completed' as const,
      };
    } catch (error) {
      // Update report history with failure
      await db.query(
        `UPDATE report_history 
         SET status = $1, error_message = $2, execution_time_ms = $3
         WHERE id = $4`,
        ['failed', (error as Error).message, Date.now() - startTime, reportHistoryId]
      );

      // Create failure notification
      const reportName = templateId || customTemplateId || 'Custom Report';
      await notificationService.createNotification({
        userId,
        type: 'report_failed',
        title: 'Report Generation Failed',
        message: `Your report "${reportName}" failed to generate. Error: ${(error as Error).message}`,
        priority: 3,
        category: 'report',
        source: 'report_scheduler',
        data: {
          reportHistoryId,
          reportName,
          error: (error as Error).message,
          templateId,
          customTemplateId
        }
      });

      throw error;
    }
  } catch (error) {
    logger.error(`Report job ${job.id} failed:`, error);
    
    return {
      reportId: '',
      rowCount: 0,
      executionTimeMs: Date.now() - startTime,
      status: 'failed' as const,
      error: (error as Error).message,
    };
  }
});

// Event handlers
reportQueue.on('completed', (job, result) => {
  logger.info(`Report job ${job.id} completed`, {
    reportId: result.reportId,
    rowCount: result.rowCount,
    executionTimeMs: result.executionTimeMs,
  });

  // Send notification if needed
  if (job.data.recipients && job.data.recipients.length > 0) {
    // Email notification functionality would be implemented here
    logger.info(`Notification needed for job ${job.id} to ${job.data.recipients.join(', ')}`);
  }
});

reportQueue.on('failed', (job, err) => {
  logger.error(`Report job ${job.id} failed:`, {
    error: err.message,
    stack: err.stack,
    attempts: job.attemptsMade,
  });
});

reportQueue.on('stalled', (job) => {
  logger.warn(`Report job ${job.id} stalled and will be retried`);
});

// Schedule queue for recurring reports
export const scheduleQueue = new Bull('report-scheduling', {
  redis: redisConfig
});

scheduleQueue.process(async (job) => {
  const { scheduleId } = job.data;
  
  logger.info(`Processing scheduled report ${scheduleId}`);
  
  try {
    // Get schedule details
    const scheduleResult = await db.query(
      `SELECT * FROM report_schedules WHERE id = $1 AND is_active = true`,
      [scheduleId]
    );

    if (scheduleResult.rows.length === 0) {
      logger.warn(`Schedule ${scheduleId} not found or inactive`);
      return;
    }

    const schedule = scheduleResult.rows[0];

    // Add report to generation queue
    await reportQueue.add('generate-report', {
      templateId: schedule.template_id,
      customTemplateId: schedule.custom_template_id,
      parameters: schedule.parameters,
      userId: schedule.created_by,
      isScheduled: true,
      recipients: schedule.recipients,
      exportFormat: schedule.export_format,
    }, {
      priority: 2, // Lower priority than manual reports
    });

    // Update last run time
    await db.query(
      `UPDATE report_schedules SET last_run = $1 WHERE id = $2`,
      [new Date(), scheduleId]
    );

    logger.info(`Scheduled report ${scheduleId} queued for generation`);
  } catch (error) {
    logger.error(`Failed to process scheduled report ${scheduleId}:`, error);
    throw error;
  }
});

// Export queue utilities
export const addReportToQueue = async (
  jobData: ReportJob,
  options?: Bull.JobOptions
): Promise<Bull.Job<ReportJob>> => {
  const defaultOptions: Bull.JobOptions = {
    priority: jobData.priority || 1,
    delay: 0,
    attempts: 3,
  };

  return reportQueue.add('generate-report', jobData, {
    ...defaultOptions,
    ...options,
  });
};

export const getQueueStatus = async () => {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    reportQueue.getWaitingCount(),
    reportQueue.getActiveCount(),
    reportQueue.getCompletedCount(),
    reportQueue.getFailedCount(),
    reportQueue.getDelayedCount(),
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    total: waiting + active + completed + failed + delayed,
  };
};

export const cleanOldJobs = async (olderThanMs: number = 7 * 24 * 60 * 60 * 1000) => {
  const completedJobs = await reportQueue.clean(olderThanMs, 'completed');
  const failedJobs = await reportQueue.clean(olderThanMs, 'failed');
  
  logger.info(`Cleaned ${completedJobs.length} completed and ${failedJobs.length} failed jobs`);
  
  return {
    completed: completedJobs.length,
    failed: failedJobs.length,
  };
};

export default reportQueue;