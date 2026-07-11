import { Request, Response, NextFunction } from "express";
import { csrfService } from "@/services/csrf.service";
import { createError } from "@/middleware/error.middleware";
import { logger } from "@/utils/logger";

/**
 * CSRF protection middleware
 * Uses double-submit cookie pattern
 */
export const csrfProtection = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  // Bearer-token clients are not vulnerable to CSRF
  const authHeader = req.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return next();
  }

  // Safe methods do not mutate server state and must remain accessible to
  // cookie-authenticated clients without forcing a CSRF token round trip.
  const safeMethods = ["GET", "HEAD", "OPTIONS"];
  if (req.method && safeMethods.includes(req.method.toUpperCase())) {
    return next();
  }

  // Skip CSRF for certain paths
  const skipPaths = [
    "/api/auth/login",
    "/api/auth/refresh",
    "/api/auth/csrf", // CSRF token endpoint itself
    "/api/health",
  ];

  if (req.path && skipPaths.some((path) => req.path.startsWith(path))) {
    return next();
  }

  // Validate CSRF token
  const isValid = csrfService.validateCSRFToken(req);

  if (!isValid) {
    logger.warn("CSRF validation failed", {
      path: req.path,
      method: req.method,
      ip: req.ip,
      userAgent: req.get("User-Agent"),
    });

    return next(createError("Invalid CSRF token", 403));
  }

  next();
};

/**
 * Add CSRF token to response
 * Can be used on any endpoint to refresh CSRF token
 */
export const addCSRFToken = (
  _req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const token = csrfService.setCSRFToken(res);

  // Add token to response locals for use in controllers
  res.locals.csrfToken = token;

  next();
};
