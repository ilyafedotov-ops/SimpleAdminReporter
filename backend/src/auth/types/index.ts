import { Request } from 'express';

// User types
export interface User {
  id: number;
  username: string;
  displayName: string;
  email: string;
  authSource: 'ad' | 'azure' | 'o365' | 'local';
  externalId?: string;
  department?: string;
  title?: string;
  isAdmin: boolean;
  isActive: boolean;
  lastLogin?: Date;
  createdAt?: Date;
  updatedAt?: Date;
  role?: string; // Optional role property for backward compatibility with tests
}

// Authentication types
export interface LoginRequest {
  username: string;
  password: string;
  authSource?: 'ad' | 'azure' | 'o365' | 'local';
}

export interface LoginResponse {
  user: User;
  csrfToken?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresIn: number;
}

// JWT types
export interface JWTPayload {
  userId: number;
  username: string;
  authSource: string;
  isAdmin: boolean;
  sessionId: string;
  jti?: string;  // JWT ID for blacklisting
  iat: number;
  exp: number;
}

export interface RefreshTokenPayload {
  userId: number;
  sessionId: string;
  familyId?: string;  // Token family for rotation
  jti?: string;  // JWT ID for blacklisting
  iat: number;
  exp: number;
}

// Authentication options
export interface AuthOptions {
  required?: boolean;
  adminOnly?: boolean;
  allowedSources?: ('ad' | 'azure' | 'o365' | 'local')[];
}

// Strategy types
export enum AuthMode {
  JWT = 'jwt',
  COOKIE = 'cookie'
}

export interface AuthStrategy {
  mode: AuthMode;
  extractToken(req: Request): string | null;
  setAuthResponse(res: any, loginResponse: LoginResponse): void;
  clearAuth(res: any): void;
}

// Session types
export interface SessionData {
  userId: number;
  username: string;
  isAdmin: boolean;
  authSource: string;
  createdAt: Date;
}

// Cache types
export interface CachedUser {
  user: User;
  timestamp: number;
}

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: User;
      sessionId?: string;
      authMode?: AuthMode;
    }
  }
}