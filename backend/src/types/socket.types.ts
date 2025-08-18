import { Socket } from 'socket.io';
import { User } from '@/auth/types';

export interface AuthenticatedSocket extends Socket {
  user: User;
  userId: number;
  filters?: {
    eventType?: string;
    level?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
  };
}

export interface LogSubscriptionOptions {
  types: ('audit' | 'system' | 'combined')[];
  filters?: {
    eventType?: string;
    level?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
  };
}

export interface SocketLogEvent {
  type: 'audit' | 'system' | 'combined';
  log: {
    id: number | string;
    timestamp: string;
    [key: string]: any;
  };
}

export interface SocketConnectionEvent {
  timestamp: Date;
  userId: number;
  socketId: string;
}

export interface SocketStats {
  totalConnections: number;
  namespaces: {
    logs: {
      sockets: number;
      rooms: {
        audit: number;
        system: number;
        combined: number;
      };
    };
  };
}