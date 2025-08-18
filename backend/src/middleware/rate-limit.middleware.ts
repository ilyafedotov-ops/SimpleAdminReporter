import { Request, Response, NextFunction } from 'express';

// No-op rate limiters since IPv6 support is not needed
const noOpRateLimiter = (req: Request, res: Response, next: NextFunction) => {
  next();
};

// All rate limiters are no-op since IPv6 support is not needed
export const loginRateLimiter = noOpRateLimiter;
export const passwordResetRateLimiter = noOpRateLimiter;
export const apiRateLimiter = noOpRateLimiter;
export const reportRateLimiter = noOpRateLimiter;
export const createLoginRateLimiter = () => noOpRateLimiter;
export const refreshTokenRateLimiter = noOpRateLimiter;
export const authEndpointsRateLimiter = noOpRateLimiter;
export const adminRateLimiter = noOpRateLimiter;
export const logsQueryRateLimiter = noOpRateLimiter;
export const logsExportRateLimiter = noOpRateLimiter;
export const logsStreamRateLimiter = noOpRateLimiter;