 
import { useState, useEffect, useCallback } from 'react';
import { ApiResponse } from '@/types';
import { apiClient } from '@/utils/apiClient';

interface DashboardStats {
  totalReports: number;
  totalCustomReports: number;
  totalExecutions: number;
  recentExecutions: Array<{
    id: number;
    reportName: string;
    reportCategory: string;
    generatedAt: string;
    rowCount: number;
    status: string;
  }>;
  popularReports: Array<{
    id: string;
    name: string;
    description: string;
    category: string;
    executionCount: number;
    averageExecutionTime: number;
  }>;
  reportsBySource: Record<string, number>;
  executionsByStatus: Record<string, number>;
}

interface UseDashboardStatsReturn {
  stats: DashboardStats | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export const useDashboardStats = (): UseDashboardStatsReturn => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const result: ApiResponse<DashboardStats> = await apiClient.get<DashboardStats>(
        '/reports/stats',
        undefined,
        { useCache: true, cacheTTL: 60 * 5 }
      );
      
      if (result.success && (result as { data?: Record<string, unknown> }).data) {
        setStats((result as { data: Record<string, unknown> }).data);
      } else {
        throw new Error(result.error || 'Failed to load dashboard statistics');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error('Dashboard stats fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const refetch = useCallback(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return {
    stats,
    loading,
    error,
    refetch
  };
};

export default useDashboardStats;