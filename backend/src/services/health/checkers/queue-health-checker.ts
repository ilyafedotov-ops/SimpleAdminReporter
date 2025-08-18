/**
 * Queue Health Checker
 * Implements health checks for Bull Queue system
 */

import { getQueueStatus } from '@/queues/report.queue';
import { BaseHealthChecker } from '../base-health-checker';
import { HealthCheckResult, HealthCheckContext } from '../types';
import { HEALTH_THRESHOLDS } from '../config';

export class QueueHealthChecker extends BaseHealthChecker {
  constructor() {
    super('queue');
  }

  protected async performCheck(context: HealthCheckContext): Promise<HealthCheckResult> {
    const queueStats = await getQueueStatus();
    
    // Determine health based on queue metrics
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    let message = this.messages.healthy.queue;
    
    if (queueStats.failed > HEALTH_THRESHOLDS.queue.failedJobsThreshold) {
      status = 'unhealthy';
      message = 'High number of failed jobs detected';
    } else if (queueStats.waiting > HEALTH_THRESHOLDS.queue.waitingJobsThreshold) {
      status = 'degraded';
      message = 'Large queue backlog detected';
    }
    
    return {
      status,
      message,
      responseTime: Date.now() - context.startTime,
      details: queueStats
    };
  }
}