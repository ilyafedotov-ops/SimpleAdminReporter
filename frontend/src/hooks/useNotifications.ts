/* eslint-disable @typescript-eslint/no-unused-vars */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAppSelector, useAppDispatch } from '@/store';
import { 
  selectPersistentNotifications, 
  setPersistentNotificationStats,
  updateUnreadCount,
  decrementUnreadCount,
  incrementUnreadCount
} from '@/store/slices/uiSlice';
import notificationService, { NotificationStats } from '@/services/notificationService';

export const useNotifications = () => {
  const dispatch = useAppDispatch();
  const persistentNotifications = useAppSelector(selectPersistentNotifications);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Polling interval ref
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const newStats = await notificationService.getNotificationStats();
      dispatch(setPersistentNotificationStats(newStats));
    } catch (err) {
      console.error('Failed to fetch notification stats:', err);
      setError('Failed to load notification stats');
    } finally {
      setLoading(false);
    }
  }, [dispatch]);

  const startPolling = useCallback(() => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    
    // Fetch immediately
    fetchStats();
    
    // Poll every 30 seconds
    intervalRef.current = setInterval(() => {
      fetchStats();
    }, 30000);
  }, [fetchStats]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const refreshStats = useCallback(() => {
    fetchStats();
  }, [fetchStats]);

  // Update unread count (for optimistic updates)
  const handleUpdateUnreadCount = useCallback((count: number) => {
    dispatch(updateUnreadCount(count));
  }, [dispatch]);

  const handleDecrementUnreadCount = useCallback((amount: number = 1) => {
    dispatch(decrementUnreadCount(amount));
  }, [dispatch]);

  const handleIncrementUnreadCount = useCallback((amount: number = 1) => {
    dispatch(incrementUnreadCount(amount));
  }, [dispatch]);

  // Start polling when hook is used
  useEffect(() => {
    startPolling();
    
    // Cleanup on unmount
    return () => {
      stopPolling();
    };
  }, [startPolling, stopPolling]);

  // Handle visibility change to refresh when tab becomes active
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchStats();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchStats]);

  return {
    stats: persistentNotifications || {
      totalCount: 0,
      unreadCount: 0,
      highPriorityUnread: 0,
      recentCount: 0
    },
    loading,
    error,
    refreshStats,
    updateUnreadCount: handleUpdateUnreadCount,
    decrementUnreadCount: handleDecrementUnreadCount,
    incrementUnreadCount: handleIncrementUnreadCount,
    startPolling,
    stopPolling
  };
};

export default useNotifications;