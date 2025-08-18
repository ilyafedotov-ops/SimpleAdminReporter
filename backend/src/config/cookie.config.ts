import { CookieOptions } from 'express';

/**
 * Get secure cookie options based on environment
 */
export const getCookieOptions = (maxAge?: number): CookieOptions => {
  const isProduction = process.env.NODE_ENV === 'production';
  
  return {
    httpOnly: true, // Prevent XSS access
    secure: isProduction, // HTTPS only in production
    sameSite: 'lax', // CSRF protection (lax for OAuth compatibility)
    path: '/',
    maxAge: maxAge || 1000 * 60 * 15, // Default 15 minutes
    domain: process.env.COOKIE_DOMAIN || undefined, // Allow subdomain access if needed
  };
};

/**
 * Cookie names
 */
export const COOKIE_NAMES = {
  ACCESS_TOKEN: 'access_token',
  REFRESH_TOKEN: 'refresh_token',
  CSRF_TOKEN: 'csrf_token',
  SESSION_ID: 'session_id',
} as const;

/**
 * Cookie expiration times
 */
export const COOKIE_MAX_AGE = {
  ACCESS_TOKEN: 1000 * 60 * 15, // 15 minutes
  REFRESH_TOKEN: 1000 * 60 * 60 * 24 * 7, // 7 days
  SESSION: 1000 * 60 * 60 * 24, // 24 hours
  CSRF_TOKEN: 1000 * 60 * 60 * 24, // 24 hours
} as const;

/**
 * Get refresh token cookie options with restricted path
 */
export const getRefreshTokenCookieOptions = (): CookieOptions => {
  return {
    ...getCookieOptions(COOKIE_MAX_AGE.REFRESH_TOKEN),
    path: '/api/auth/refresh', // Only sent to refresh endpoint
  };
};