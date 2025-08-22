import rateLimit from 'express-rate-limit';

/**
 * Redis-based rate limiting store for distributed systems
 * Falls back to memory store if Redis is unavailable
 */
const createRateLimitStore = () => {
  // For now, use memory store to ensure compatibility
  // TODO: Implement proper Redis store with correct client interface
  return undefined;
};

/**
 * Standard error message for rate limiting
 */
const rateLimitMessage = {
  error: 'Too many requests',
  message: 'Rate limit exceeded. Please try again later.',
  retryAfter: 'Check Retry-After header for wait time'
};

/**
 * Login rate limiter - strict limits for authentication attempts
 * 5 attempts per 15 minutes per IP
 */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: rateLimitMessage,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRateLimitStore(),
  // Use default keyGenerator which handles IPv6 properly
});

/**
 * Password reset rate limiter - prevent password reset abuse
 * 3 attempts per hour per IP
 */
export const passwordResetRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 attempts per hour
  message: rateLimitMessage,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRateLimitStore(),
  // Use default keyGenerator which handles IPv6 properly
});

/**
 * General API rate limiter - moderate limits for regular API usage
 * 100 requests per 15 minutes per IP
 */
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: rateLimitMessage,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRateLimitStore(),
  // Use default keyGenerator which handles IPv6 properly
});

/**
 * Report generation rate limiter - prevent resource-intensive report abuse
 * 10 reports per 10 minutes per IP
 */
export const reportRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 10, // 10 reports per window
  message: rateLimitMessage,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRateLimitStore(),
  // Use default keyGenerator which handles IPv6 properly
});

/**
 * Factory function for creating login rate limiters with custom settings
 */
export const createLoginRateLimiter = (customOptions?: any) => {
  return rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window
    message: rateLimitMessage,
    standardHeaders: true,
    legacyHeaders: false,
    store: createRateLimitStore(),
    // Use default keyGenerator which handles IPv6 properly,
    ...customOptions
  });
};

/**
 * Refresh token rate limiter - prevent token refresh abuse
 * 20 refresh attempts per 15 minutes per IP
 */
export const refreshTokenRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 refreshes per window
  message: rateLimitMessage,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRateLimitStore(),
  // Use default keyGenerator which handles IPv6 properly
});

/**
 * Authentication endpoints rate limiter - general auth operations
 * 30 requests per 15 minutes per IP
 */
export const authEndpointsRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 requests per window
  message: rateLimitMessage,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRateLimitStore(),
  // Use default keyGenerator which handles IPv6 properly
});

/**
 * Admin operations rate limiter - stricter limits for admin actions
 * 50 requests per 15 minutes per IP
 */
export const adminRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 requests per window
  message: rateLimitMessage,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRateLimitStore(),
  // Use default keyGenerator which handles IPv6 properly
});

/**
 * Logs query rate limiter - prevent log query abuse
 * 25 queries per 10 minutes per IP
 */
export const logsQueryRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 25, // 25 queries per window
  message: rateLimitMessage,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRateLimitStore(),
  // Use default keyGenerator which handles IPv6 properly
});

/**
 * Logs export rate limiter - prevent export abuse
 * 5 exports per 15 minutes per IP
 */
export const logsExportRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 exports per window
  message: rateLimitMessage,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRateLimitStore(),
  // Use default keyGenerator which handles IPv6 properly
});

/**
 * Logs streaming rate limiter - prevent streaming abuse
 * 10 streams per 10 minutes per IP
 */
export const logsStreamRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 10, // 10 streams per window
  message: rateLimitMessage,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRateLimitStore(),
  // Use default keyGenerator which handles IPv6 properly
});