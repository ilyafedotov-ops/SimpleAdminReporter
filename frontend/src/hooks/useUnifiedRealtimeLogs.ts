 
import { useEffect } from 'react';
import { message } from 'antd';
import { useWebSocketLogs } from './useWebSocketLogs';

export interface UnifiedRealtimeLog {
  log_type: 'audit' | 'system';
  id: string;
  timestamp: string;
  type?: string;
  action?: string;
  level?: string;
  message?: string;
  module?: string;
  username?: string;
  success?: boolean;
}

interface UseUnifiedRealtimeLogsOptions {
  maxLogs?: number;
  reconnectInterval?: number;
  reconnectAttempts?: number;
  logTypes?: ('audit' | 'system' | 'combined')[];
  filters?: {
    eventType?: string;
    level?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
  };
}

interface UseUnifiedRealtimeLogsReturn {
  logs: UnifiedRealtimeLog[];
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  reconnectCount: number;
  clearLogs: () => void;
  setFilters: (filters: UseUnifiedRealtimeLogsOptions['filters']) => void;
  subscribe: (types: ('audit' | 'system' | 'combined')[]) => void;
  unsubscribe: (types: ('audit' | 'system' | 'combined')[]) => void;
}

const DEFAULT_OPTIONS: UseUnifiedRealtimeLogsOptions = {
  maxLogs: 50,
  reconnectInterval: 5000,
  reconnectAttempts: 5,
  logTypes: ['combined']
};

/**
 * Unified real-time logs hook that uses WebSocket for real-time updates
 */
export const useUnifiedRealtimeLogs = (
  enabled: boolean,
  options: UseUnifiedRealtimeLogsOptions = {}
): UseUnifiedRealtimeLogsReturn => {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };

  // Use WebSocket hook directly
  const webSocketResult = useWebSocketLogs(enabled, mergedOptions);

  // Log connection method on mount
  useEffect(() => {
    if (enabled) {
      console.log('Using WebSocket for real-time logs');
    }
  }, [enabled]);

  // Check WebSocket support on mount
  useEffect(() => {
    if (enabled && typeof WebSocket === 'undefined') {
      message.error('WebSocket is not supported in your browser. Real-time updates will not be available.');
    }
  }, [enabled]);

  return {
    logs: webSocketResult.logs,
    connectionStatus: webSocketResult.connectionStatus,
    reconnectCount: webSocketResult.reconnectCount,
    clearLogs: webSocketResult.clearLogs,
    setFilters: webSocketResult.setFilters,
    subscribe: webSocketResult.subscribe,
    unsubscribe: webSocketResult.unsubscribe
  };
};