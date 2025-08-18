import session from 'express-session';
import { RedisStore } from 'connect-redis';
import { redis } from '@/config/redis';
import { COOKIE_MAX_AGE } from '@/config/cookie.config';

/**
 * Session configuration
 */
export const sessionConfig: session.SessionOptions = {
  store: new RedisStore({ 
    client: redis.getClient() as any, // Type compatibility with connect-redis
    prefix: 'sess:',
    ttl: COOKIE_MAX_AGE.SESSION / 1000, // Convert to seconds
  }),
  
  secret: process.env.SESSION_SECRET || (() => {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SESSION_SECRET must be set in production');
    }
    return 'dev-session-secret-' + Date.now(); // Unique for development
  })(),
  name: 'sessionId', // Don't use default 'connect.sid'
  
  resave: false, // Don't save session if unmodified
  saveUninitialized: false, // Don't create session until something stored
  rolling: true, // Reset expiry on activity
  
  cookie: {
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    httpOnly: true, // Prevent XSS access
    maxAge: COOKIE_MAX_AGE.SESSION,
    sameSite: 'lax', // CSRF protection
    domain: process.env.COOKIE_DOMAIN || undefined,
  },
  
  // Generate session ID
  genid: () => {
    const crypto = require('crypto');
    return crypto.randomBytes(32).toString('hex');
  },
};

// Extend Express session interface
declare module 'express-session' {
  interface SessionData {
    userId?: number;
    userEmail?: string;
    authSource?: 'ad' | 'azure' | 'o365' | 'local';
    loginTime?: Date;
    lastActivity?: Date;
    csrfSecret?: string;
  }
}