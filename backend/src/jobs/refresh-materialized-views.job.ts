import { Job } from 'bull';
import { logger } from '@/utils/logger';
import { materializedViewsService } from '@/services/materialized-views.service';
import { auditLogger } from '@/services/audit-logger.service';

export interface RefreshMaterializedViewsJobData {
  viewName?: string;
  force?: boolean;
}

export const refreshMaterializedViewsJob = async (job: Job<RefreshMaterializedViewsJobData>) => {
  const { viewName, force = false } = job.data;
  const startTime = Date.now();

  try {
    logger.info('Starting materialized views refresh job', { viewName, force });

    // Check if views exist
    const viewsExist = await materializedViewsService.checkViewsExist();
    if (!viewsExist) {
      logger.warn('Materialized views do not exist, skipping refresh');
      return { 
        success: false, 
        message: 'Materialized views not found',
        duration: Date.now() - startTime 
      };
    }

    let refreshed = false;
    
    if (viewName) {
      // Refresh specific view
      await materializedViewsService.refreshView(viewName);
      refreshed = true;
    } else if (force) {
      // Force refresh all views
      await materializedViewsService.refreshAllViews();
      refreshed = true;
    } else {
      // Check if refresh is needed based on age
      refreshed = await materializedViewsService.refreshIfNeeded();
    }

    const duration = Date.now() - startTime;

    // Log the refresh operation
    await auditLogger.logSystem('maintenance_mode', {
      action: 'materialized_views_refresh',
      viewName: viewName || 'all',
      forced: force,
      refreshed,
      duration,
      jobId: job.id
    });

    logger.info('Materialized views refresh job completed', { 
      refreshed, 
      duration,
      viewName: viewName || 'all'
    });

    return { 
      success: true, 
      refreshed,
      duration,
      stats: await materializedViewsService.getViewStats()
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Materialized views refresh job failed:', error);

    // Log the error
    await auditLogger.logSystem('maintenance_mode', {
      action: 'materialized_views_refresh_error',
      viewName: viewName || 'all',
      error: error instanceof Error ? ((error as any)?.message || String(error)) : 'Unknown error',
      duration,
      jobId: job.id
    });

    throw error;
  }
};

// Job configuration
export const refreshMaterializedViewsJobConfig = {
  name: 'refresh-materialized-views',
  options: {
    // Remove completed jobs after 24 hours
    removeOnComplete: {
      age: 24 * 3600, // 24 hours in seconds
      count: 100 // Keep last 100 completed jobs
    },
    // Keep failed jobs for debugging
    removeOnFail: {
      age: 7 * 24 * 3600, // 7 days in seconds
      count: 50 // Keep last 50 failed jobs
    },
    // Retry configuration
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000 // Start with 5 second delay
    }
  }
};

// Schedule configuration (to be used in queue setup)
export const refreshMaterializedViewsSchedule = {
  // Run every 5 minutes
  regular: '*/5 * * * *',
  // Full refresh daily at 2 AM
  daily: '0 2 * * *'
};