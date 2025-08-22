import { AxiosError } from 'axios';

/**
 * Error types for categorizing different kinds of errors
 */
export enum ErrorType {
  NETWORK = 'NETWORK',
  VALIDATION = 'VALIDATION',
  AUTHENTICATION = 'AUTHENTICATION',
  AUTHORIZATION = 'AUTHORIZATION',
  QUERY_EXECUTION = 'QUERY_EXECUTION',
  QUERY_VALIDATION = 'QUERY_VALIDATION',
  TIMEOUT = 'TIMEOUT',
  RATE_LIMIT = 'RATE_LIMIT',
  SERVER = 'SERVER',
  UNKNOWN = 'UNKNOWN'
}

/**
 * Extended error class with additional context
 */
export class AppError extends Error {
  public readonly type: ErrorType;
  public readonly code?: string;
  public readonly details?: Record<string, unknown>;
  public readonly statusCode?: number;
  public readonly retryAfter?: string | number;

  constructor(
    message: string,
    type: ErrorType = ErrorType.UNKNOWN,
    code?: string,
    details?: Record<string, unknown>,
    statusCode?: number,
    retryAfter?: string | number
  ) {
    super(message);
    this.name = 'AppError';
    this.type = type;
    this.code = code;
    this.details = details;
    this.statusCode = statusCode;
    this.retryAfter = retryAfter;
  }
}

/**
 * Parse error response and return a structured AppError
 */
export function parseError(error: unknown): AppError {
  // Handle AppError objects directly
  if (error instanceof AppError) {
    return error;
  }
  
  // Handle Axios errors
  if (error && typeof error === 'object' && 'isAxiosError' in error) {
    const axiosError = error as AxiosError<Record<string, unknown>>;
    
    if (!axiosError.response) {
      // Network error - no response received
      return new AppError(
        'Network error: Please check your internet connection',
        ErrorType.NETWORK,
        'NETWORK_ERROR'
      );
    }

    const status = axiosError.response.status;
    const data = (axiosError.response?.data) as { 
      result?: { error?: { message?: string; code?: string; details?: Record<string, unknown> } };
      message?: string;
      error?: string;
      code?: string;
      errors?: string[];
    };

    // Handle query service error format
    if (data?.result?.error) {
      const queryError = data.result.error as { message?: string; code?: string; details?: Record<string, unknown> };
      const errorType = determineQueryErrorType(queryError.code);
      return new AppError(
        queryError.message || 'Query execution failed',
        errorType,
        queryError.code,
        queryError.details,
        status
      );
    }

    // Handle validation errors
    if (data?.errors && Array.isArray(data.errors)) {
      return new AppError(
        `Validation failed: ${data.errors.join(', ')}`,
        ErrorType.VALIDATION,
        'VALIDATION_ERROR',
        { errors: data.errors },
        status
      );
    }

    // Handle specific status codes
    switch (status) {
      case 400:
        return new AppError(
          data?.message || 'Bad request',
          ErrorType.VALIDATION,
          'BAD_REQUEST',
          typeof data === 'object' && data !== null ? data : { data },
          status
        );
      case 401:
        return new AppError(
          data?.message || 'Authentication required',
          ErrorType.AUTHENTICATION,
          'UNAUTHORIZED',
          typeof data === 'object' && data !== null ? data : { data },
          status
        );
      case 403:
        return new AppError(
          data?.message || 'Access denied',
          ErrorType.AUTHORIZATION,
          'FORBIDDEN',
          typeof data === 'object' && data !== null ? data : { data },
          status
        );
      case 404:
        return new AppError(
          data?.message || 'Resource not found',
          ErrorType.UNKNOWN,
          'NOT_FOUND',
          typeof data === 'object' && data !== null ? data : { data },
          status
        );
      case 429: {
        const retryAfter = axiosError.response?.headers['retry-after'] || 
                          axiosError.response?.headers['x-ratelimit-reset'] || 
                          axiosError.response?.headers['ratelimit-reset'];
        return new AppError(
          data?.message || 'Too many requests',
          ErrorType.RATE_LIMIT,
          'RATE_LIMITED',
          typeof data === 'object' && data !== null ? data : { data },
          status,
          retryAfter
        );
      }
      case 408:
      case 504:
        return new AppError(
          data?.message || 'Request timeout',
          ErrorType.TIMEOUT,
          'TIMEOUT',
          typeof data === 'object' && data !== null ? data : { data },
          status
        );
      default:
        if (status >= 500) {
          return new AppError(
            data?.message || 'Server error',
            ErrorType.SERVER,
            'SERVER_ERROR',
            typeof data === 'object' && data !== null ? data : { data },
            status
          );
        }
    }

    // Generic error message
    return new AppError(
      data?.message || data?.error || 'An error occurred',
      ErrorType.UNKNOWN,
      data?.code,
      typeof data === 'object' && data !== null ? data : { data },
      status
    );
  }

  // Handle standard Error objects
  if (error instanceof Error) {
    return new AppError(error.message || String(error), ErrorType.UNKNOWN);
  }

  // Handle string errors
  if (typeof error === 'string') {
    return new AppError(error, ErrorType.UNKNOWN);
  }

  // Unknown error type
  return new AppError('An unexpected error occurred', ErrorType.UNKNOWN);
}

/**
 * Determine error type based on query error code
 */
function determineQueryErrorType(code?: string): ErrorType {
  if (!code) return ErrorType.QUERY_EXECUTION;

  const upperCode = code.toUpperCase();
  
  if (upperCode.includes('VALIDATION')) {
    return ErrorType.QUERY_VALIDATION;
  }
  if (upperCode.includes('TIMEOUT')) {
    return ErrorType.TIMEOUT;
  }
  if (upperCode.includes('AUTH')) {
    return ErrorType.AUTHENTICATION;
  }
  if (upperCode.includes('PERMISSION') || upperCode.includes('ACCESS')) {
    return ErrorType.AUTHORIZATION;
  }
  if (upperCode.includes('RATE')) {
    return ErrorType.RATE_LIMIT;
  }
  
  return ErrorType.QUERY_EXECUTION;
}

/**
 * Get user-friendly error message based on error type
 */
export function getUserFriendlyMessage(error: AppError): string {
  switch (error.type) {
    case ErrorType.NETWORK:
      return 'Unable to connect to the server. Please check your internet connection and try again.';
    case ErrorType.AUTHENTICATION:
      return 'Your session has expired. Please log in again.';
    case ErrorType.AUTHORIZATION:
      return 'You do not have permission to perform this action.';
    case ErrorType.VALIDATION:
      return error.message; // Validation errors are usually already user-friendly
    case ErrorType.QUERY_VALIDATION:
      return 'The query contains errors. Please check your query and try again.';
    case ErrorType.QUERY_EXECUTION:
      return 'Failed to execute the query. Please try again or contact support if the problem persists.';
    case ErrorType.TIMEOUT:
      return 'The request took too long to complete. Please try again with a smaller dataset.';
    case ErrorType.RATE_LIMIT:
      return 'Too many requests. Please wait a moment and try again.';
    case ErrorType.SERVER:
      return 'Server error occurred. Please try again later or contact support.';
    default:
      return error.message || 'An unexpected error occurred. Please try again.';
  }
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: AppError): boolean {
  return [
    ErrorType.NETWORK,
    ErrorType.TIMEOUT,
    ErrorType.RATE_LIMIT,
    ErrorType.SERVER
  ].includes(error.type);
}

/**
 * Get retry delay in milliseconds based on error type
 */
export function getRetryDelay(error: AppError, attemptNumber: number): number {
  const baseDelay = 1000; // 1 second
  
  switch (error.type) {
    case ErrorType.RATE_LIMIT:
      // For rate limits, use exponential backoff with longer delays
      return Math.min(baseDelay * Math.pow(2, attemptNumber) * 5, 60000);
    case ErrorType.NETWORK:
    case ErrorType.TIMEOUT:
      // For network issues, use exponential backoff
      return Math.min(baseDelay * Math.pow(2, attemptNumber), 30000);
    case ErrorType.SERVER:
      // For server errors, use linear backoff
      return Math.min(baseDelay * attemptNumber * 2, 20000);
    default:
      return baseDelay;
  }
}

/**
 * Get recovery guidance for different error types
 */
export function getRecoveryGuidance(error: AppError): string {
  switch (error.type) {
    case ErrorType.NETWORK:
      return 'Check your internet connection and try again. If using VPN, verify the connection is stable.';
    case ErrorType.TIMEOUT:
      return 'Try reducing the number of selected fields, adding more specific filters, or limiting the date range.';
    case ErrorType.QUERY_VALIDATION:
    case ErrorType.VALIDATION:
      return 'Review your query configuration. Ensure all selected fields are valid and filters are properly configured.';
    case ErrorType.AUTHENTICATION:
      return 'Your session has expired. Please refresh the page and log in again.';
    case ErrorType.AUTHORIZATION:
      return 'Contact your administrator to request the necessary permissions for this operation.';
    case ErrorType.RATE_LIMIT:
      return `You've reached the rate limit. Wait ${error.retryAfter || '60 seconds'} before trying again.`;
    case ErrorType.SERVER:
      return 'The server is experiencing issues. Try again in a few minutes or contact support if the problem persists.';
    case ErrorType.QUERY_EXECUTION:
      return 'The query failed to execute. Try simplifying your query or contact support for assistance.';
    default:
      return 'Try refreshing the page or contact support if the problem continues.';
  }
}

/**
 * Log error with appropriate level based on type
 */
export function logError(error: AppError, context?: string): void {
  const logContext = context ? `[${context}]` : '';
  
  switch (error.type) {
    case ErrorType.VALIDATION:
    case ErrorType.QUERY_VALIDATION:
      console.warn(`${logContext} Validation Error:`, error.message || String(error), error.details);
      break;
    case ErrorType.AUTHENTICATION:
    case ErrorType.AUTHORIZATION:
      console.warn(`${logContext} Auth Error:`, error.message || String(error));
      break;
    case ErrorType.NETWORK:
    case ErrorType.TIMEOUT:
      console.error(`${logContext} Network Error:`, error.message || String(error));
      break;
    case ErrorType.SERVER:
    case ErrorType.QUERY_EXECUTION:
      console.error(`${logContext} Server Error:`, error.message || String(error), error.details);
      break;
    default:
      console.error(`${logContext} Error:`, error.message || String(error), error.details);
  }
}