/* eslint-disable @typescript-eslint/no-explicit-any */
import { apiClient } from '@/utils/apiClient';
import { ApiResponse } from '@/types';

export interface ScheduleConfig {
  frequency: 'daily' | 'weekly' | 'monthly';
  time: string;
  dayOfWeek?: number;
  dayOfMonth?: number;
}

export interface ReportSchedule {
  id: string;
  name: string;
  description?: string;
  template_id?: string;
  custom_template_id?: string;
  template_name?: string;
  template_category?: string;
  custom_template_name?: string;
  custom_template_source?: string;
  parameters?: Record<string, any>;
  schedule_config: ScheduleConfig;
  recipients?: string[];
  export_format: 'excel' | 'csv' | 'pdf';
  is_active: boolean;
  last_run?: string;
  next_run?: string;
  created_by: number;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateScheduleDto {
  name: string;
  description?: string;
  templateId?: string;
  customTemplateId?: string;
  parameters?: Record<string, any>;
  scheduleConfig: ScheduleConfig;
  recipients?: string[];
  exportFormat?: 'excel' | 'csv' | 'pdf';
}

export interface UpdateScheduleDto {
  name?: string;
  description?: string;
  parameters?: Record<string, any>;
  scheduleConfig?: ScheduleConfig;
  recipients?: string[];
  exportFormat?: 'excel' | 'csv' | 'pdf';
  isActive?: boolean;
  /**
   * When switching between or updating the linked pre-built template
   */
  templateId?: string;
  /**
   * When switching between or updating the linked custom template
   */
  customTemplateId?: string;
}

export interface ScheduleExecution {
  id: string;
  report_name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  row_count?: number;
  execution_time_ms?: number;
  error_message?: string;
  started_at: string;
  completed_at?: string;
  file_format?: string;
  file_size?: number;
}

export interface ScheduledReportsParams {
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}

class ScheduledReportsService {
  /**
   * Get all scheduled reports for the current user
   */
  async getSchedules(params?: ScheduledReportsParams): Promise<ApiResponse<{
    schedules: ReportSchedule[];
    pagination: {
      page: number;
      pageSize: number;
      totalCount: number;
      totalPages: number;
    };
  }>> {
    const queryParams = new URLSearchParams();
    if (params?.isActive !== undefined) queryParams.append('isActive', String(params.isActive));
    if (params?.page) queryParams.append('page', String(params.page));
    if (params?.pageSize) queryParams.append('pageSize', String(params.pageSize));

    const query = queryParams.toString();
    const url = `/scheduled-reports${query ? `?${query}` : ''}`;
    
    return apiClient.get(url, undefined, { useCache: false });
  }

  /**
   * Get a specific scheduled report
   */
  async getSchedule(scheduleId: string): Promise<ApiResponse<ReportSchedule>> {
    return apiClient.get(`/scheduled-reports/${scheduleId}`);
  }

  /**
   * Create a new scheduled report
   */
  async createSchedule(data: CreateScheduleDto): Promise<ApiResponse<ReportSchedule>> {
    return apiClient.post('/scheduled-reports', data);
  }

  /**
   * Update a scheduled report
   */
  async updateSchedule(scheduleId: string, data: UpdateScheduleDto): Promise<ApiResponse<ReportSchedule>> {
    return apiClient.put(`/scheduled-reports/${scheduleId}`, data);
  }

  /**
   * Delete a scheduled report
   */
  async deleteSchedule(scheduleId: string): Promise<ApiResponse> {
    return apiClient.delete(`/scheduled-reports/${scheduleId}`);
  }

  /**
   * Toggle a scheduled report's active state
   */
  async toggleSchedule(scheduleId: string): Promise<ApiResponse<ReportSchedule>> {
    return apiClient.post(`/scheduled-reports/${scheduleId}/toggle`);
  }

  /**
   * Get execution history for a scheduled report
   */
  async getScheduleHistory(scheduleId: string, params?: {
    page?: number;
    pageSize?: number;
  }): Promise<ApiResponse<{
    executions: ScheduleExecution[];
    pagination: {
      page: number;
      pageSize: number;
    };
  }>> {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', String(params.page));
    if (params?.pageSize) queryParams.append('pageSize', String(params.pageSize));

    const query = queryParams.toString();
    const url = `/scheduled-reports/${scheduleId}/history${query ? `?${query}` : ''}`;
    
    return apiClient.get(url);
  }

  /**
   * Get a human-readable description of the schedule
   */
  getScheduleDescription(config: ScheduleConfig): string {
    const time = config.time;
    
    switch (config.frequency) {
      case 'daily':
        return `Daily at ${time}`;
        
      case 'weekly': {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayName = config.dayOfWeek !== undefined ? days[config.dayOfWeek] : 'Unknown';
        return `Every ${dayName} at ${time}`;
      }
      case 'monthly': {
        const dayStr = config.dayOfMonth === 31 ? 'last day' : `day ${config.dayOfMonth}`;
        return `Monthly on ${dayStr} at ${time}`;
      }
      default:
        return 'Unknown schedule';
    }
  }

  /**
   * Get the next run time in a human-readable format
   */
  getNextRunDescription(nextRun: string): string {
    const now = new Date();
    const next = new Date(nextRun);
    const diffMs = next.getTime() - now.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (diffMs < 0) {
      return 'Overdue';
    }

    if (diffDays > 0) {
      return `In ${diffDays} day${diffDays > 1 ? 's' : ''}, ${diffHours} hour${diffHours !== 1 ? 's' : ''}`;
    } else if (diffHours > 0) {
      return `In ${diffHours} hour${diffHours !== 1 ? 's' : ''}, ${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''}`;
    } else if (diffMinutes > 0) {
      return `In ${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''}`;
    } else {
      return 'Very soon';
    }
  }
}

export const scheduledReportsService = new ScheduledReportsService();