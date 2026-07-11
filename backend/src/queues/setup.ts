import Bull from "bull";
import { logger } from "@/utils/logger";
import reportQueue, { scheduleQueue, cleanOldJobs } from "./report.queue";
import { db } from "@/config/database";
import * as cron from "node-cron";
import { parseExpression } from "cron-parser";
import {
  refreshMaterializedViewsJob,
  refreshMaterializedViewsJobConfig,
  refreshMaterializedViewsSchedule,
} from "@/jobs/refresh-materialized-views.job";

// Create materialized views queue
const materializedViewsQueue = new Bull("materialized-views", {
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379", 10) || 6379,
    password: process.env.REDIS_PASSWORD,
  },
});

// Process materialized views refresh jobs
materializedViewsQueue.process(
  refreshMaterializedViewsJobConfig.name,
  refreshMaterializedViewsJob,
);

export async function setupQueues() {
  logger.info("Setting up job queues...");

  try {
    // Test queue connections
    await reportQueue.isReady();
    await scheduleQueue.isReady();
    await materializedViewsQueue.isReady();

    logger.info("Report generation queue ready");
    logger.info("Schedule queue ready");
    logger.info("Materialized views queue ready");

    // Set up scheduled report cron job
    cron.schedule("* * * * *", async () => {
      try {
        // Check for reports that need to be scheduled
        const now = new Date();
        const scheduledReports = await db.query(
          `SELECT * FROM report_schedules 
           WHERE is_active = true 
           AND next_run <= $1`,
          [now],
        );

        for (const schedule of scheduledReports.rows) {
          const claimed = await db.query(
            `UPDATE report_schedules
             SET next_run = $1
             WHERE id = $2 AND next_run <= $3
             RETURNING id`,
            [new Date(Date.now() + 60000), schedule.id, now],
          );

          if (claimed.rows.length === 0) {
            continue;
          }

          await scheduleQueue.add("process-schedule", {
            scheduleId: schedule.id,
          });

          const scheduleConfig = schedule.schedule_config;
          const nextRun = calculateNextRun(scheduleConfig.cronExpression);

          await db.query(
            "UPDATE report_schedules SET next_run = $1, last_run = $2 WHERE id = $3",
            [nextRun, now, schedule.id],
          );
        }
      } catch (error) {
        logger.error("Error processing scheduled reports:", error);
      }
    });

    // Clean up old jobs daily
    cron.schedule("0 2 * * *", async () => {
      try {
        const result = await cleanOldJobs();
        logger.info("Cleaned old jobs:", result);
      } catch (error) {
        logger.error("Error cleaning old jobs:", error);
      }
    });

    // Schedule regular materialized views refresh
    cron.schedule(refreshMaterializedViewsSchedule.regular, async () => {
      try {
        await materializedViewsQueue.add(
          refreshMaterializedViewsJobConfig.name,
          { force: false },
          refreshMaterializedViewsJobConfig.options,
        );
      } catch (error) {
        logger.error("Error scheduling materialized views refresh:", error);
      }
    });

    // Schedule daily full refresh
    cron.schedule(refreshMaterializedViewsSchedule.daily, async () => {
      try {
        await materializedViewsQueue.add(
          refreshMaterializedViewsJobConfig.name,
          { force: true },
          refreshMaterializedViewsJobConfig.options,
        );
      } catch (error) {
        logger.error(
          "Error scheduling daily materialized views refresh:",
          error,
        );
      }
    });

    logger.info("Job queues setup completed");
  } catch (error) {
    logger.error("Failed to setup queues:", error);
    throw error;
  }
}

export async function closeQueues(): Promise<void> {
  await reportQueue.close();
  await scheduleQueue.close();
  await materializedViewsQueue.close();
}

function calculateNextRun(cronExpression: string): Date {
  if (!cron.validate(cronExpression)) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }

  try {
    const interval = parseExpression(cronExpression, {
      currentDate: new Date(),
    });
    return interval.next().toDate();
  } catch (error) {
    logger.warn(
      `Invalid cron expression '${cronExpression}', defaulting to daily`,
      error,
    );
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }
}

export { reportQueue, scheduleQueue };
