 
import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { message } from 'antd';

export interface WebSocketLog {
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

interface UseWebSocketLogsOptions {
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

interface UseWebSocketLogsReturn {
  logs: WebSocketLog[];
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  reconnectCount: number;
  clearLogs: () => void;
  setFilters: (filters: UseWebSocketLogsOptions['filters']) => void;
  subscribe: (types: ('audit' | 'system' | 'combined')[]) => void;
  unsubscribe: (types: ('audit' | 'system' | 'combined')[]) => void;
}

const DEFAULT_OPTIONS: UseWebSocketLogsOptions = {
  maxLogs: 50,
  reconnectInterval: 5000,
  reconnectAttempts: 5,
  logTypes: ['combined']
};

export const useWebSocketLogs = (
  enabled: boolean,
  options: UseWebSocketLogsOptions = {}
): UseWebSocketLogsReturn => {
  const { maxLogs, reconnectInterval, reconnectAttempts, logTypes, filters: initialFilters } = { 
    ...DEFAULT_OPTIONS, 
    ...options 
  };
  
  const [logs, setLogs] = useState<WebSocketLog[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<UseWebSocketLogsReturn['connectionStatus']>('disconnected');
  const [reconnectCount, setReconnectCount] = useState(0);
  const [filters, setFiltersState] = useState(initialFilters);
  
  const socketRef = useRef<Socket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectCountRef = useRef(0);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const setFilters = useCallback((newFilters: UseWebSocketLogsOptions['filters']) => {
    setFiltersState(newFilters);
    if (socketRef.current?.connected) {
      socketRef.current.emit('setFilters', newFilters);
    }
  }, []);

  const subscribe = useCallback((types: ('audit' | 'system' | 'combined')[]) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('subscribe', types);
    }
  }, []);

  const unsubscribe = useCallback((types: ('audit' | 'system' | 'combined')[]) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('unsubscribe', types);
    }
  }, []);

  const connect = useCallback(() => {
    if (!enabled || socketRef.current?.connected) {
      return;
    }

    try {
      setConnectionStatus('connecting');
      
      const token = localStorage.getItem('accessToken');
      const baseUrl = import.meta.env.VITE_API_URL || '/api';
      
      // Extract base URL without /api suffix for Socket.IO
      const socketUrl = baseUrl.replace(/\/api$/, '');
      
      const socket = io(`${socketUrl}/logs`, {
        auth: {
          token: token || ''
        },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: reconnectInterval,
        reconnectionAttempts: reconnectAttempts,
        timeout: 10000
      });

      socket.on('connect', () => {
        console.log('WebSocket connected');
        setConnectionStatus('connected');
        setReconnectCount(0);
        reconnectCountRef.current = 0;
        
        // Clear any pending reconnect timeout
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }

        // Subscribe to initial log types
        if (logTypes && logTypes.length > 0) {
          socket.emit('subscribe', logTypes);
        }

        // Set initial filters
        if (filters) {
          socket.emit('setFilters', filters);
        }
      });

      socket.on('connected', (data) => {
        console.log('WebSocket connection confirmed:', data);
      });

      socket.on('subscribed', (data) => {
        console.log('Subscribed to log types:', data.types);
      });

      socket.on('filtersSet', (data) => {
        console.log('Filters applied:', data.filters);
      });

      socket.on('newLog', (data) => {
        const { type, log } = data;
        setLogs(prev => {
          const newLog = { ...log, log_type: type };
          const newLogs = [newLog, ...prev];
          return newLogs.slice(0, maxLogs);
        });
      });

      socket.on('filteredLog', (data) => {
        const { type, log } = data;
        setLogs(prev => {
          const newLog = { ...log, log_type: type };
          const newLogs = [newLog, ...prev];
          return newLogs.slice(0, maxLogs);
        });
      });

      socket.on('disconnect', (reason) => {
        console.log('WebSocket disconnected:', reason);
        setConnectionStatus('disconnected');
        
        // Socket.IO will handle reconnection automatically
        if (reason === 'io server disconnect') {
          // Server initiated disconnect, need to manually reconnect
          socket.connect();
        }
      });

      socket.on('connect_error', (error) => {
        console.error('WebSocket connection error:', error);
        setConnectionStatus('error');
        
        reconnectCountRef.current++;
        setReconnectCount(reconnectCountRef.current);
        
        if (reconnectCountRef.current >= reconnectAttempts) {
          message.error('Failed to establish WebSocket connection after multiple attempts');
        }
      });

      socket.on('serverShutdown', (data) => {
        console.log('Server shutdown notification:', data);
        message.warning('Server is shutting down. Connection will be lost.');
      });

      socketRef.current = socket;
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      setConnectionStatus('error');
    }
  }, [enabled, maxLogs, reconnectInterval, reconnectAttempts, logTypes, filters]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    setConnectionStatus('disconnected');
    setReconnectCount(0);
    reconnectCountRef.current = 0;
  }, []);

  useEffect(() => {
    if (enabled) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [enabled, connect, disconnect]);

  // Update filters when they change
  useEffect(() => {
    if (socketRef.current?.connected && filters) {
      socketRef.current.emit('setFilters', filters);
    }
  }, [filters]);

  return {
    logs,
    connectionStatus,
    reconnectCount,
    clearLogs,
    setFilters,
    subscribe,
    unsubscribe
  };
};