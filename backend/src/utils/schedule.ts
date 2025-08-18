import dayjs from 'dayjs';

export interface ScheduleConfig {
  frequency: 'daily' | 'weekly' | 'monthly';
  time: string; // HH:MM format
  dayOfWeek?: number; // 0-6 (Sunday-Saturday)
  dayOfMonth?: number; // 1-31
}

/**
 * Calculate the next run time based on schedule configuration
 */
export function calculateNextRun(config: ScheduleConfig): Date {
  const [hours, minutes] = config.time.split(':').map(Number);
  const now = dayjs();
  let nextRun = dayjs();

  switch (config.frequency) {
    case 'daily':
      nextRun = nextRun.hour(hours).minute(minutes).second(0).millisecond(0);
      // If the time has already passed today, move to tomorrow
      if (nextRun.isBefore(now)) {
        nextRun = nextRun.add(1, 'day');
      }
      break;

    case 'weekly':
      if (config.dayOfWeek === undefined) {
        throw new Error('Day of week is required for weekly schedules');
      }
      
      nextRun = nextRun.hour(hours).minute(minutes).second(0).millisecond(0);
      
      // Find the next occurrence of the specified day
      const currentDay = nextRun.day();
      const targetDay = config.dayOfWeek;
      let daysToAdd = targetDay - currentDay;
      
      if (daysToAdd < 0 || (daysToAdd === 0 && nextRun.isBefore(now))) {
        daysToAdd += 7;
      }
      
      nextRun = nextRun.add(daysToAdd, 'day');
      break;

    case 'monthly':
      if (config.dayOfMonth === undefined) {
        throw new Error('Day of month is required for monthly schedules');
      }
      
      nextRun = nextRun
        .date(config.dayOfMonth)
        .hour(hours)
        .minute(minutes)
        .second(0)
        .millisecond(0);
      
      // If the date has already passed this month, move to next month
      if (nextRun.isBefore(now)) {
        nextRun = nextRun.add(1, 'month');
      }
      
      // Handle months with fewer days
      if (nextRun.date() !== config.dayOfMonth) {
        nextRun = nextRun.endOf('month');
      }
      break;

    default:
      throw new Error(`Unknown frequency: ${config.frequency}`);
  }

  return nextRun.toDate();
}

/**
 * Get a human-readable description of the schedule
 */
export function getScheduleDescription(config: ScheduleConfig): string {
  const time = config.time;
  
  switch (config.frequency) {
    case 'daily':
      return `Daily at ${time}`;
      
    case 'weekly':
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayName = config.dayOfWeek !== undefined ? days[config.dayOfWeek] : 'Unknown';
      return `Every ${dayName} at ${time}`;
      
    case 'monthly':
      const dayStr = config.dayOfMonth === 31 ? 'last day' : `day ${config.dayOfMonth}`;
      return `Monthly on ${dayStr} at ${time}`;
      
    default:
      return 'Unknown schedule';
  }
}

/**
 * Validate schedule configuration
 */
export function validateScheduleConfig(config: ScheduleConfig): { valid: boolean; error?: string } {
  // Validate time format
  const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
  if (!timeRegex.test(config.time)) {
    return { valid: false, error: 'Invalid time format. Use HH:MM' };
  }

  switch (config.frequency) {
    case 'daily':
      // No additional validation needed
      break;

    case 'weekly':
      if (config.dayOfWeek === undefined || config.dayOfWeek < 0 || config.dayOfWeek > 6) {
        return { valid: false, error: 'Day of week must be between 0 (Sunday) and 6 (Saturday)' };
      }
      break;

    case 'monthly':
      if (config.dayOfMonth === undefined || config.dayOfMonth < 1 || config.dayOfMonth > 31) {
        return { valid: false, error: 'Day of month must be between 1 and 31' };
      }
      break;

    default:
      return { valid: false, error: 'Invalid frequency. Use daily, weekly, or monthly' };
  }

  return { valid: true };
}