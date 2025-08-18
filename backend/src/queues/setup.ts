import Bull from 'bull';
import { logger } from '@/utils/logger';
import reportQueue, { scheduleQueue, cleanOldJobs } from './report.queue';
import { db } from '@/config/database';
import * as cron from 'node-cron';
import { refreshMaterializedViewsJob, refreshMaterializedViewsJobConfig, refreshMaterializedViewsSchedule } from '@/jobs/refresh-materialized-views.job';


// Create materialized views queue
const materializedViewsQueue = new Bull('materialized-views', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10) || 6379,
    password: process.env.REDIS_PASSWORD
  }
});

// Process materialized views refresh jobs
materializedViewsQueue.process(refreshMaterializedViewsJobConfig.name, refreshMaterializedViewsJob);

export async function setupQueues() {
  logger.info('Setting up job queues...');
  
  try {
    // Test queue connections
    await reportQueue.isReady();
    await scheduleQueue.isReady();
    await materializedViewsQueue.isReady();
    
    logger.info('Report generation queue ready');
    logger.info('Schedule queue ready');
    logger.info('Materialized views queue ready');

    // Set up scheduled report cron job
    cron.schedule('* * * * *', async () => {
      try {
        // Check for reports that need to be scheduled
        const now = new Date();
        const scheduledReports = await db.query(
          `SELECT * FROM report_schedules 
           WHERE is_active = true 
           AND next_run <= $1`,
          [now]
        );

        for (const schedule of scheduledReports.rows) {
          await scheduleQueue.add('process-schedule', {
            scheduleId: schedule.id,
          });

          // Calculate next run based on cron expression
          // schedule_config is JSONB, already parsed by PostgreSQL
          const scheduleConfig = schedule.schedule_config;
          const nextRun = calculateNextRun(scheduleConfig.cronExpression);
          
          await db.query(
            'UPDATE report_schedules SET next_run = $1 WHERE id = $2',
            [nextRun, schedule.id]
          );
        }
      } catch (error) {
        logger.error('Error processing scheduled reports:', error);
      }
    });

    // Clean up old jobs daily
    cron.schedule('0 2 * * *', async () => {
      try {
        const result = await cleanOldJobs();
        logger.info('Cleaned old jobs:', result);
      } catch (error) {
        logger.error('Error cleaning old jobs:', error);
      }
    });

    // Schedule regular materialized views refresh
    cron.schedule(refreshMaterializedViewsSchedule.regular, async () => {
      try {
        await materializedViewsQueue.add(
          refreshMaterializedViewsJobConfig.name,
          { force: false },
          refreshMaterializedViewsJobConfig.options
        );
      } catch (error) {
        logger.error('Error scheduling materialized views refresh:', error);
      }
    });

    // Schedule daily full refresh
    cron.schedule(refreshMaterializedViewsSchedule.daily, async () => {
      try {
        await materializedViewsQueue.add(
          refreshMaterializedViewsJobConfig.name,
          { force: true },
          refreshMaterializedViewsJobConfig.options
        );
      } catch (error) {
        logger.error('Error scheduling daily materialized views refresh:', error);
      }
    });

    // Set up graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, closing queues...');
      await reportQueue.close();
      await scheduleQueue.close();
      await materializedViewsQueue.close();
    });

    logger.info('Job queues setup completed');
  } catch (error) {
    logger.error('Failed to setup queues:', error);
    throw error;
  }
}

function calculateNextRun(cronExpression: string): Date {
  // Simple implementation - for production, use a proper cron parser
  const interval = cron.validate(cronExpression);
  if (!interval) {
    // Default to daily if invalid
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }

  // This is a simplified calculation
  // In production, use a library like cron-parser
  const next = new Date();
  next.setHours(next.getHours() + 1);
  return next;
}

export { reportQueue, scheduleQueue };