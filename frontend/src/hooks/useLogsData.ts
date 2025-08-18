/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps */
import { useState, useEffect, useCallback, useRef } from 'react';
import { logsService, AuditLog, SystemLog } from '@/services/logsService';
import * as dayjs from 'dayjs';

export interface LogsData {
  audit: AuditLog[];
  system: SystemLog[];
  totalAudit: number;
  totalSystem: number;
}

export interface FilterState {
  activeTab: 'all' | 'audit' | 'system';
  currentPage: number;
  pageSize: number;
  searchQuery: string;
  dateRange: [dayjs.Dayjs, dayjs.Dayjs] | null;
  eventType?: string;
  level?: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

interface UseLogsDataReturn {
  data: LogsData | null;
  loading: boolean;
  error: Error | null;
  retry: () => void;
  isRetrying: boolean;
  retryCount: number;
}

const MAX_RETRY_ATTEMPTS = 2;
const RETRY_DELAY_BASE = 2000; // Base delay in milliseconds

export const useLogsData = (filters: FilterState): UseLogsDataReturn => {
  const [data, setData] = useState<LogsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const retryTimeoutRef = useRef<number | null>(null);
  const fetchTimeoutRef = useRef<number | null>(null);
  const currentRetryCountRef = useRef(0);
  const prevFiltersRef = useRef<string>('');

  // Update retry count ref whenever state changes
  currentRetryCountRef.current = retryCount;

  const fetchData = useCallback(async (isManualRetry = false) => {
    // Prevent concurrent fetches using ref to avoid dependency issues
    if (abortControllerRef.current && !isManualRetry) {
      console.log('Fetch already in progress, skipping...');
      return;
    }
    
    try {
      // Cancel previous request if exists
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Clear any pending retry timeout
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }

      // Create new AbortController
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setLoading(true);
      setError(null);
      setIsRetrying(isManualRetry);
      
      const response = await logsService.getLogs({
        type: filters.activeTab === 'all' ? 'all' : filters.activeTab,
        search: filters.searchQuery || undefined,
        startDate: filters.dateRange?.[0].toISOString(),
        endDate: filters.dateRange?.[1].toISOString(),
        page: filters.currentPage,
        pageSize: filters.pageSize,
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder,
        eventType: filters.eventType,
        level: filters.level,
        signal: controller.signal
      });
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch logs');
      }
      
      console.log('Logs API response:', {
        success: response.success,
        auditCount: ((response as any).data).audit?.length,
        systemCount: ((response as any).data).system?.length,
        totalAudit: ((response as any).data).totalAudit,
        totalSystem: ((response as any).data).totalSystem,
        firstAuditLog: ((response as any).data).audit?.[0]
      });
      
      setData({
        audit: ((response as any).data).audit || [],
        system: ((response as any).data).system || [],
        totalAudit: ((response as any).data).totalAudit || 0,
        totalSystem: ((response as any).data).totalSystem || 0
      });
      setRetryCount(0);
      setError(null);
    } catch (err: any) {
      // Don't handle abort errors
      if (err.name === 'AbortError') {
        return;
      }

      setError(err as Error);
      
      // Check if error is retryable (not 4xx client errors)
      const status = err.response?.status;
      const isRetryable = !status?.toString().startsWith('4') || status === 0; // status 0 means network error
      const currentRetry = currentRetryCountRef.current;
      const canRetry = currentRetry < MAX_RETRY_ATTEMPTS && isRetryable;
      
      // Auto-retry logic with exponential backoff
      if (canRetry && !isManualRetry) {
        const delay = Math.min(
          RETRY_DELAY_BASE * Math.pow(2, currentRetry),
          15000 // Max delay of 15 seconds
        );
        
        console.log(`Retrying in ${delay}ms (attempt ${currentRetry + 1}/${MAX_RETRY_ATTEMPTS})`);
        
        retryTimeoutRef.current = window.setTimeout(() => {
          setRetryCount(prev => prev + 1);
          fetchData(false);
        }, delay);
      } else if (!canRetry && isRetryable) {
        // Max retries reached, show appropriate error message
        console.error(`Max retry attempts reached after ${currentRetry} attempts`);
      }
    } finally {
      setLoading(false);
      setIsRetrying(false);
      // Clear the abort controller to indicate fetch is complete
      abortControllerRef.current = null;
    }
  }, [filters]);

  // Manual retry function
  const retry = useCallback(() => {
    setRetryCount(0);
    fetchData(true);
  }, [fetchData]);

  // Fetch data when filters change with debouncing
  useEffect(() => {
    // Deep compare filters to check if they actually changed
    const filtersString = JSON.stringify(filters);
    
    // Only trigger if filters actually changed
    if (prevFiltersRef.current === filtersString) {
      console.log('useLogsData effect skipped - filters unchanged');
      return;
    }
    
    console.log('useLogsData effect triggered - filters changed from:', prevFiltersRef.current, 'to:', filtersString);
    prevFiltersRef.current = filtersString;
    
    // Clear any pending fetch
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
      fetchTimeoutRef.current = null;
    }
    
    // Debounce the fetch to prevent rapid successive calls
    fetchTimeoutRef.current = window.setTimeout(() => {
      console.log('Debounced fetch executing after 300ms');
      fetchData(false);
    }, 300); // 300ms debounce
  }, [filters]);

  // Cleanup effect
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
    };
  }, []);

  return { 
    data, 
    loading, 
    error, 
    retry, 
    isRetrying,
    retryCount 
  };
};