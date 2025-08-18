 
/* eslint-disable @typescript-eslint/no-explicit-any */
import { AppError, ErrorType } from './errorHandler';

interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
}

/**
 * Execute a function with automatic retry on rate limit errors
 */
export async function withRateLimitRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 60000,
    backoffMultiplier = 2
  } = options;

  let lastError: AppError | Error | undefined;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as AppError | Error;
      
      // Only retry on rate limit errors
      if (!(error instanceof AppError) || error.type !== ErrorType.RATE_LIMIT) {
        throw error;
      }
      
      // Don't retry if we've exceeded max attempts
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Calculate delay
      let delay = initialDelay * Math.pow(backoffMultiplier, attempt);
      
      // If server provided retry-after header, use it
      if (error.retryAfter) {
        const retryAfterMs = parseRetryAfter(error.retryAfter);
        if (retryAfterMs) {
          delay = retryAfterMs;
        }
      }
      
      // Cap the delay at maxDelay
      delay = Math.min(delay, maxDelay);
      
      // Log the retry attempt
      console.warn(`Rate limited. Retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
      
      // Wait before retrying
      await sleep(delay);
    }
  }
  
  throw lastError || new Error('Rate limit retry failed');
}

/**
 * Parse retry-after header value to milliseconds
 */
function parseRetryAfter(value: string | number): number | null {
  if (typeof value === 'number') {
    // Unix timestamp - convert to milliseconds from now
    const now = Date.now() / 1000;
    if (value > now) {
      return (value - now) * 1000;
    }
    // Otherwise assume it's seconds
    return value * 1000;
  }
  
  if (typeof value === 'string') {
    // Try to parse as number (seconds)
    const seconds = parseInt(value, 10);
    if (!isNaN(seconds)) {
      return seconds * 1000;
    }
    
    // Try to parse as date
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      const delay = date.getTime() - Date.now();
      return delay > 0 ? delay : 0;
    }
  }
  
  return null;
}

/**
 * Sleep for the specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a rate limit aware wrapper for API calls
 */
export function createRateLimitAwareCall<TArgs extends any[], TResult>(
  apiCall: (...args: TArgs) => Promise<TResult>,
  options?: RetryOptions
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    return withRateLimitRetry(() => apiCall(...args), options);
  };
}

/**
 * Check if we should retry based on error and attempt count
 */
export function shouldRetry(error: AppError, attempt: number, maxRetries: number): boolean {
  if (attempt >= maxRetries) {
    return false;
  }
  
  return error.type === ErrorType.RATE_LIMIT || 
         error.type === ErrorType.NETWORK ||
         error.type === ErrorType.TIMEOUT ||
         (error.type === ErrorType.SERVER && error.statusCode !== undefined && error.statusCode >= 500);
}