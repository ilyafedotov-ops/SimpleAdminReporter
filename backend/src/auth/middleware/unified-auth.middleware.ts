import { Request, Response, NextFunction } from 'express';
import { logger } from '@/utils/logger';
import { createError } from '@/middleware/error.middleware';
import { csrfService } from '@/services/csrf.service';
import { unifiedAuthService } from '../services/unified-auth.service';
import { AuthStrategyFactory } from '../strategies';
import { AuthOptions, AuthMode } from '../types';

/**
 * Unified authentication middleware that supports both JWT and cookie strategies
 */
export const authenticate = (options: AuthOptions = { required: true }) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    logger.info(`Authentication middleware called for ${req.method} ${req.path}`);
    
    try {
      // Determine auth mode from request
      const authMode = unifiedAuthService.getAuthMode(req);
      req.authMode = authMode;

      // Get appropriate strategy
      const strategy = AuthStrategyFactory.getStrategy(authMode);

      // Extract token using strategy
      const token = strategy.extractToken(req);
      logger.info(`Token extracted: ${token ? 'yes' : 'no'} for ${req.path}`);

      // Handle missing token
      if (!token) {
        if (options.required) {
          logger.warn(`Authentication required but no token provided for ${req.path}`);
          return next(createError('Access token required. Please login to continue.', 401));
        } else {
          // Optional authentication - continue without user
          return next();
        }
      }

      try {
        // For cookie mode, validate CSRF token for state-changing requests
        if (authMode === AuthMode.COOKIE && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
          const isValidCSRF = csrfService.validateCSRFToken(req);
          if (!isValidCSRF) {
            logger.warn(`CSRF validation failed for ${req.path}`);
            return next(createError('CSRF validation failed', 403));
          }
        }

        // Verify token and get user
        // Skip blacklist check for cookie mode for better performance
        const user = await unifiedAuthService.verifyAccessToken(token, {
          skipBlacklistCheck: authMode === AuthMode.COOKIE
        });

        // Check if user is active
        if (!user.isActive) {
          logger.warn(`Inactive user attempted access: ${user.username}`);
          return next(createError('Account is inactive', 403));
        }

        // Check admin requirement
        if (options.adminOnly && !user.isAdmin) {
          logger.warn(`Non-admin user attempted admin access: ${user.username}`);
          return next(createError('Administrator access required', 403));
        }

        // Check allowed authentication sources
        if (options.allowedSources && !options.allowedSources.includes(user.authSource)) {
          logger.warn(`User with unauthorized auth source attempted access: ${user.username} (${user.authSource})`);
          return next(createError('Authentication source not allowed', 403));
        }

        // Attach user to request
        req.user = user;

        // Extract session ID from token
        const tokenPayload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        req.sessionId = tokenPayload.sessionId;

        logger.debug(`Authenticated user: ${user.username} (${user.authSource}) via ${authMode}`);
        next();

      } catch (tokenError) {
        logger.warn(`Token verification failed: ${(tokenError as Error).message}`);
        return next(createError('Invalid or expired token', 401));
      }

    } catch (error) {
      logger.error('Authentication middleware error:', error);
      next(createError('Authentication failed', 500));
    }
  };
};

/**
 * Middleware to require authentication
 */
export const requireAuth = authenticate({ required: true });

/**
 * Middleware to require admin access
 */
export const requireAdmin = authenticate({ required: true, adminOnly: true });

/**
 * Middleware for optional authentication
 */
export const optionalAuth = authenticate({ required: false });

/**
 * Middleware to require specific authentication sources
 */
export const requireAuthSource = (sources: ('ad' | 'azure' | 'o365' | 'local')[]) => {
  return authenticate({ required: true, allowedSources: sources });
};

/**
 * CSRF protection middleware for cookie-based auth
 */
export const requireCSRF = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  // Skip for non-state-changing methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Only enforce for cookie mode
  if (req.authMode !== AuthMode.COOKIE) {
    return next();
  }

  const isValid = csrfService.validateCSRFToken(req);
  if (!isValid) {
    logger.warn(`CSRF validation failed for ${req.path}`);
    return next(createError('CSRF validation failed', 403));
  }

  next();
};

/**
 * Role-based access control middleware
 */
export const requireRole = (roles: string[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      return next(createError('Authentication required', 401));
    }

    // Check if user has required role
    const userRoles = (req.user as any).roles || [];
    const hasRole = roles.some(role => userRoles.includes(role));

    if (!hasRole) {
      logger.warn(`Access denied for user ${req.user.id} - missing required roles: ${roles.join(', ')}`);
      return next(createError('Insufficient permissions', 403));
    }

    next();
  };
};

/**
 * Resource access control middleware
 */
export const requireResourceAccess = (checker: (req: Request) => Promise<boolean> | boolean) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      return next(createError('Authentication required', 401));
    }

    try {
      const hasAccess = await checker(req);
      if (!hasAccess) {
        logger.warn(`Resource access denied for user ${req.user.id}`);
        return next(createError('Access denied to this resource', 403));
      }
      next();
    } catch (error) {
      logger.error('Error checking resource access:', error);
      return next(createError('Error checking resource access', 500));
    }
  };
};

/**
 * Audit action middleware
 */
export const auditAction = (action: string, resourceType: string) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Store audit info in request for later logging
    (req as any).auditInfo = {
      action,
      resourceType,
      userId: req.user?.id,
      timestamp: new Date(),
      ip: req.ip,
      userAgent: req.get('user-agent')
    };

    // Log after response is sent
    res.on('finish', async () => {
      try {
        const { auditLogger } = await import('@/services/audit-logger.service');
        await auditLogger.logAccess(
          'api_access',
          { request: req, user: req.user },
          resourceType,
          undefined, // resourceId
          { action, statusCode: res.statusCode },
          res.statusCode < 400
        );
      } catch (error) {
        logger.error('Failed to log audit action:', error);
      }
    });

    next();
  };
};

/**
 * User-specific rate limiting middleware
 */
export const userRateLimit = (maxRequests: number, windowMinutes: number = 1) => {
  const requests = new Map<string, { count: number; resetTime: number }>();

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      return next(); // Skip rate limiting for unauthenticated requests
    }

    const key = `user:${req.user.id}:${req.path}`;
    const now = Date.now();
    const windowMs = windowMinutes * 60 * 1000;

    let userData = requests.get(key);
    
    if (!userData || userData.resetTime < now) {
      userData = { count: 1, resetTime: now + windowMs };
      requests.set(key, userData);
    } else {
      userData.count++;
    }

    if (userData.count > maxRequests) {
      const retryAfter = Math.ceil((userData.resetTime - now) / 1000);
      res.set('Retry-After', retryAfter.toString());
      return next(createError(`Rate limit exceeded. Try again in ${retryAfter} seconds`, 429));
    }

    next();
  };
};

/**
 * Auto refresh token middleware (for cookie mode)
 */
export const autoRefreshToken = () => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Auto refresh not needed for JWT mode
    return next();

    // Check if access token is about to expire
    const accessToken = req.cookies?.access_token;
    if (!accessToken) {
      return next();
    }

    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.decode(accessToken) as any;
      
      if (!decoded || !decoded.exp) {
        return next();
      }

      // Refresh if token expires in less than 5 minutes
      const expiresIn = decoded.exp * 1000 - Date.now();
      if (expiresIn < 5 * 60 * 1000 && expiresIn > 0) {
        const refreshToken = req.cookies?.refresh_token;
        if (refreshToken) {
          try {
            const { unifiedAuthService } = await import('../services/unified-auth.service');
            const response = await unifiedAuthService.refreshAccessToken(refreshToken, req);
            
            // Set new cookies
            res.cookie('access_token', response.accessToken, {
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'strict',
              maxAge: 60 * 60 * 1000 // 1 hour
            });
            
            res.cookie('refresh_token', response.refreshToken, {
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'strict',
              maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
            });
          } catch (error) {
            logger.debug('Auto refresh failed:', error);
          }
        }
      }
    } catch (error) {
      logger.debug('Error checking token expiry:', error);
    }

    next();
  };
};

/**
 * Role checker helpers
 */
export const roleCheckers = {
  isAdmin: (req: Request) => req.user?.isAdmin === true,
  hasRole: (role: string) => (req: Request) => {
    const userRoles = (req.user as any)?.roles || [];
    return userRoles.includes(role);
  },
  hasAnyRole: (roles: string[]) => (req: Request) => {
    const userRoles = (req.user as any)?.roles || [];
    return roles.some(role => userRoles.includes(role));
  }
};

/**
 * Resource checker helpers
 */
export const resourceCheckers = {
  ownResource: async (req: Request) => {
    const resourceUserId = req.params.userId || req.body?.userId;
    return resourceUserId === req.user?.id?.toString();
  },
  customReport: async (req: Request) => {
    const reportId = req.params.reportId;
    if (!reportId) {
      logger.warn('No reportId provided for custom report access check');
      return false;
    }
    
    try {
      const { db } = await import('@/config/database');
      const result = await db.query(
        'SELECT user_id, created_by FROM custom_report_templates WHERE id = $1',
        [reportId]
      );
      
      if (result.rows.length === 0) {
        logger.warn(`Custom report ${reportId} not found in database during access check`);
        return false;
      }
      
      const report = result.rows[0];
      const ownerId = report.user_id || report.created_by;
      const hasAccess = ownerId === req.user?.id;
      
      logger.debug(`Custom report access check for ${reportId}: Owner=${ownerId}, User=${req.user?.id}, HasAccess=${hasAccess}`);
      
      return hasAccess;
    } catch (error) {
      logger.error('Error checking custom report ownership:', error);
      return false;
    }
  }
};