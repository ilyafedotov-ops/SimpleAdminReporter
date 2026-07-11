import { randomUUID } from "crypto";
import { Request, Response, NextFunction } from "express";

/**
 * Attach a correlation ID to each request for structured logging and tracing.
 */
export function correlationIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.get("x-correlation-id");
  const correlationId =
    incoming && incoming.trim().length > 0 ? incoming.trim() : randomUUID();

  (req as Request & { correlationId?: string }).correlationId = correlationId;
  res.setHeader("X-Correlation-Id", correlationId);
  next();
}
