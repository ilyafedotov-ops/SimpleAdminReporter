const SENSITIVE_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-csrf-token",
  "x-api-key",
  "proxy-authorization",
]);

/**
 * Redact sensitive values from request headers before logging.
 */
export function sanitizeHeadersForLogging(
  headers: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!headers) {
    return {};
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (SENSITIVE_HEADERS.has(key.toLowerCase())) {
      sanitized[key] = "[REDACTED]";
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}
