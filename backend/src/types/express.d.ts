import { User } from '@/auth/types';
import { AuthMode } from '@/auth/types';
import 'express-session';
import { Request } from 'express';

declare module 'express-session' {
  interface SessionData {
    userId?: number;
    userEmail?: string;
    authSource?: string;
    loginTime?: Date;
    lastActivity?: Date;
  }
}

declare global {
  namespace Express {
    interface Request {
      user?: User;
      sessionId?: string;
      authMode?: AuthMode;
      pagination?: {
        page: number;
        limit: number;
        offset: number;
      };
      sort?: {
        field: string;
        order: 'asc' | 'desc';
      };
      dateRange?: {
        start: Date | null;
        end: Date | null;
      };
    }
  }
}

export interface AuthRequest extends Request {
  user: {
    id: number;
    username: string;
    displayName: string;
    email: string;
    authSource: string;
    isActive: boolean;
    isAdmin: boolean;
    title?: string;
    department?: string;
  };
}