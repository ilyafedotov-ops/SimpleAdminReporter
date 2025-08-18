import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AxiosError } from 'axios';
import { AppError, ErrorType, parseError, isRetryableError, getRecoveryGuidance } from '@/utils/errorHandler';
import { QueryPreviewErrorBoundary } from '@/components/query/QueryPreviewErrorBoundary';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import { renderHook } from '@testing-library/react';

// Test component that can throw different types of errors
const ErrorTestComponent: React.FC<{
  errorType?: 'network' | 'timeout' | 'validation' | 'auth' | 'authorization' | 'rateLimit' | 'server' | 'axios' | 'none';
  customError?: Error;
}> = ({ errorType = 'none', customError }) => {
  if (customError) {
    throw customError;
  }

  switch (errorType) {
    case 'network':
      throw new AppError(
        'Failed to connect to server',
        ErrorType.NETWORK,
        'NETWORK_ERROR',
        { endpoint: '/api/test', timeout: 5000 }
      );
    case 'timeout':
      throw new AppError(
        'Request timeout after 30 seconds',
        ErrorType.TIMEOUT,
        'TIMEOUT_ERROR',
        { duration: 30000, query: 'complex query' }
      );
    case 'validation':
      throw new AppError(
        'Invalid query parameters',
        ErrorType.VALIDATION,
        'VALIDATION_ERROR',
        { 
          fieldErrors: {
            startDate: 'Start date is required',
            fields: 'At least one field must be selected'
          }
        }
      );
    case 'auth':
      throw new AppError(
        'Session expired',
        ErrorType.AUTHENTICATION,
        'AUTH_EXPIRED',
        { expiresAt: '2025-01-01T00:00:00Z' }
      );
    case 'authorization':
      throw new AppError(
        'Insufficient permissions',
        ErrorType.AUTHORIZATION,
        'PERMISSION_DENIED',
        { requiredPermission: 'READ_USERS', userRole: 'viewer' }
      );
    case 'rateLimit':
      throw new AppError(
        'Rate limit exceeded',
        ErrorType.RATE_LIMIT,
        'RATE_LIMITED',
        { limit: 100, resetTime: 1672531200 },
        429,
        '60'
      );
    case 'server':
      throw new AppError(
        'Internal server error',
        ErrorType.SERVER,
        'INTERNAL_ERROR',
        { errorId: 'err_123456', service: 'ldap-service' },
        500
      );
    case 'axios':
      const axiosError = new Error('Network Error') as AxiosError;
      axiosError.isAxiosError = true;
      axiosError.response = {
        status: 500,
        data: { message: 'Server temporarily unavailable' },
        headers: {},
        statusText: 'Internal Server Error',
        config: {} as any,
      };
      throw axiosError;
    case 'none':
    default:
      return <div data-testid="success">No error</div>;
  }
};

// Mock console and timers
beforeEach(() => {
  console.error = vi.fn();
  console.warn = vi.fn();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Error Scenarios - Comprehensive Testing', () => {
  describe('Network Error Scenarios', () => {
    it('handles complete network failure', () => {
      render(
        <QueryPreviewErrorBoundary darkMode={false} showRecoveryActions={true}>
          <ErrorTestComponent errorType="network" />
        </QueryPreviewErrorBoundary>
      );

      expect(screen.getByText('Network Connection Issue')).toBeInTheDocument();
      expect(screen.getByText(/Check your internet connection/)).toBeInTheDocument();
      expect(screen.getByText('Try Again')).toBeInTheDocument();
    });

    it('handles DNS resolution failures', () => {
      const dnsError = new Error('getaddrinfo ENOTFOUND') as AxiosError;
      dnsError.isAxiosError = true;
      dnsError.code = 'ENOTFOUND';
      
      render(
        <QueryPreviewErrorBoundary darkMode={false} showRecoveryActions={true}>
          <ErrorTestComponent customError={dnsError} />
        </QueryPreviewErrorBoundary>
      );

      expect(screen.getByText('Network Connection Issue')).toBeInTheDocument();
    });

    it('handles connection refused errors', () => {
      const connectionError = new Error('connect ECONNREFUSED') as AxiosError;
      connectionError.isAxiosError = true;
      connectionError.code = 'ECONNREFUSED';
      
      render(
        <QueryPreviewErrorBoundary darkMode={false} showRecoveryActions={true}>
          <ErrorTestComponent customError={connectionError} />
        </QueryPreviewErrorBoundary>
      );

      expect(screen.getByText('Network Connection Issue')).toBeInTheDocument();
    });

    it('provides network-specific recovery guidance', () => {
      const { result } = renderHook(() => useErrorHandler());
      
      const networkError = new AppError('Network failed', ErrorType.NETWORK);
      const guidance = getRecoveryGuidance(networkError);
      
      expect(guidance).toContain('internet connection');
      expect(guidance).toContain('VPN');
    });
  });

  describe('Timeout Error Scenarios', () => {
    it('handles request timeouts', () => {
      render(
        <QueryPreviewErrorBoundary darkMode={false} showRecoveryActions={true}>
          <ErrorTestComponent errorType="timeout" />
        </QueryPreviewErrorBoundary>
      );

      expect(screen.getByText('Query Timeout')).toBeInTheDocument();
      expect(screen.getByText(/query took too long/)).toBeInTheDocument();
      expect(screen.getByText('Try Again')).toBeInTheDocument();
    });

    it('handles server timeout responses (408)', () => {
      const timeoutError = new Error('Timeout') as AxiosError;
      timeoutError.isAxiosError = true;
      timeoutError.response = {
        status: 408,
        data: { message: 'Request timeout' },
        headers: {},
        statusText: 'Request Timeout',
        config: {} as any,
      };
      
      render(
        <QueryPreviewErrorBoundary darkMode={false} showRecoveryActions={true}>
          <ErrorTestComponent customError={timeoutError} />
        </QueryPreviewErrorBoundary>
      );

      expect(screen.getByText('Query Timeout')).toBeInTheDocument();
    });

    it('handles gateway timeout responses (504)', () => {
      const gatewayTimeoutError = new Error('Gateway timeout') as AxiosError;
      gatewayTimeoutError.isAxiosError = true;
      gatewayTimeoutError.response = {
        status: 504,
        data: { message: 'Gateway timeout' },
        headers: {},
        statusText: 'Gateway Timeout',
        config: {} as any,
      };
      
      render(
        <QueryPreviewErrorBoundary darkMode={false} showRecoveryActions={true}>
          <ErrorTestComponent customError={gatewayTimeoutError} />
        </QueryPreviewErrorBoundary>
      );

      expect(screen.getByText('Query Timeout')).toBeInTheDocument();
    });

    it('provides timeout-specific recovery guidance', () => {
      const timeoutError = new AppError('Query timeout', ErrorType.TIMEOUT);
      const guidance = getRecoveryGuidance(timeoutError);
      
      expect(guidance).toContain('reducing');
      expect(guidance).toContain('fields');
      expect(guidance).toContain('filters');
    });
  });

  describe('Validation Error Scenarios', () => {
    it('handles query validation errors', () => {
      render(
        <QueryPreviewErrorBoundary darkMode={false} showRecoveryActions={true}>
          <ErrorTestComponent errorType="validation" />
        </QueryPreviewErrorBoundary>
      );

      expect(screen.getByText('Query Configuration Error')).toBeInTheDocument();
      expect(screen.getByText(/issue with your query configuration/)).toBeInTheDocument();
      expect(screen.getByText('Try Again')).toBeInTheDocument();
    });

    it('handles field validation errors', () => {
      const fieldValidationError = new AppError(
        'Invalid field selection',
        ErrorType.QUERY_VALIDATION,
        'INVALID_FIELDS',
        { 
          invalidFields: ['invalidField1', 'invalidField2'],
          validFields: ['sAMAccountName', 'displayName']
        }
      );
      
      render(
        <QueryPreviewErrorBoundary darkMode={false} showRecoveryActions={true}>
          <ErrorTestComponent customError={fieldValidationError} />
        </QueryPreviewErrorBoundary>
      );

      expect(screen.getByText('Query Configuration Error')).toBeInTheDocument();
    });

    it('handles filter validation errors', () => {
      const filterValidationError = new AppError(
        'Invalid filter configuration',
        ErrorType.VALIDATION,
        'INVALID_FILTER',
        { 
          filterErrors: [
            { field: 'date', message: 'Invalid date format' },
            { field: 'department', message: 'Department not found' }
          ]
        }
      );
      
      render(
        <QueryPreviewErrorBoundary darkMode={false} showRecoveryActions={true}>
          <ErrorTestComponent customError={filterValidationError} />
        </QueryPreviewErrorBoundary>
      );

      expect(screen.getByText('Query Configuration Error')).toBeInTheDocument();
    });

    it('provides validation-specific recovery guidance', () => {
      const validationError = new AppError('Validation failed', ErrorType.VALIDATION);
      const guidance = getRecoveryGuidance(validationError);
      
      expect(guidance).toContain('query configuration');
      expect(guidance).toContain('fields');
      expect(guidance).toContain('filters');
    });
  });

  describe('Authentication Error Scenarios', () => {
    it('handles session expiration', () => {
      render(
        <QueryPreviewErrorBoundary darkMode={false} showRecoveryActions={true}>
          <ErrorTestComponent errorType="auth" />
        </QueryPreviewErrorBoundary>
      );

      expect(screen.getByText('Authentication Required')).toBeInTheDocument();
      expect(screen.getByText(/session has expired/)).toBeInTheDocument();
      expect(screen.queryByText('Try Again')).not.toBeInTheDocument(); // Non-retryable
    });

    it('handles invalid credentials (401)', () => {
      const authError = new Error('Unauthorized') as AxiosError;
      authError.isAxiosError = true;
      authError.response = {
        status: 401,
        data: { message: 'Invalid credentials' },
        headers: {},
        statusText: 'Unauthorized',
        config: {} as any,
      };
      
      render(
        <QueryPreviewErrorBoundary darkMode={false} showRecoveryActions={true}>
          <ErrorTestComponent customError={authError} />
        </QueryPreviewErrorBoundary>
      );

      expect(screen.getByText('Authentication Required')).toBeInTheDocument();
    });

    it('handles token expiration', () => {
      const tokenError = new AppError(
        'Access token expired',
        ErrorType.AUTHENTICATION,
        'TOKEN_EXPIRED',
        { expiresAt: '2025-01-01T00:00:00Z' }
      );
      
      render(
        <QueryPreviewErrorBoundary darkMode={false} showRecoveryActions={true}>
          <ErrorTestComponent customError={tokenError} />
        </QueryPreviewErrorBoundary>
      );

      expect(screen.getByText('Authentication Required')).toBeInTheDocument();
    });

    it('marks authentication errors as non-retryable', () => {
      const authError = new AppError('Auth failed', ErrorType.AUTHENTICATION);
      expect(isRetryableError(authError)).toBe(false);
    });
  });

  describe('Authorization Error Scenarios', () => {
    it('handles insufficient permissions', () => {
      render(
        <QueryPreviewErrorBoundary darkMode={false} showRecoveryActions={true}>
          <ErrorTestComponent errorType="authorization" />
        </QueryPreviewErrorBoundary>
      );

      expect(screen.getByText('Access Denied')).toBeInTheDocument();
      expect(screen.getByText(/don't have permission/)).toBeInTheDocument();
      expect(screen.queryByText('Try Again')).not.toBeInTheDocument();
      expect(screen.getByText(/Contact your system administrator/)).toBeInTheDocument();
    });

    it('handles forbidden responses (403)', () => {
      const forbiddenError = new Error('Forbidden') as AxiosError;
      forbiddenError.isAxiosError = true;
      forbiddenError.response = {
        status: 403,
        data: { message: 'Access denied' },
        headers: {},
        statusText: 'Forbidden',
        config: {} as any,
      };
      
      render(
        <QueryPreviewErrorBoundary darkMode={false} showRecoveryActions={true}>
          <ErrorTestComponent customError={forbiddenError} />
        </QueryPreviewErrorBoundary>
      );

      expect(screen.getByText('Access Denied')).toBeInTheDocument();
    });

    it('handles resource-specific permission errors', () => {
      const resourceError = new AppError(
        'Cannot access user data',
        ErrorType.AUTHORIZATION,
        'RESOURCE_DENIED',
        { 
          resource: 'users',
          requiredPermission: 'READ_USERS',
          userPermissions: ['READ_GROUPS']
        }
      );
      
      render(
        <QueryPreviewErrorBoundary darkMode={false} showRecoveryActions={true}>
          <ErrorTestComponent customError={resourceError} />
        </QueryPreviewErrorBoundary>
      );

      expect(screen.getByText('Access Denied')).toBeInTheDocument();
    });

    it('marks authorization errors as non-retryable', () => {
      const authzError = new AppError('Access denied', ErrorType.AUTHORIZATION);
      expect(isRetryableError(authzError)).toBe(false);
    });
  });

  describe('Rate Limit Error Scenarios', () => {
    it('handles rate limit exceeded', () => {
      render(
        <QueryPreviewErrorBoundary darkMode={false} showRecoveryActions={true}>
          <ErrorTestComponent errorType="rateLimit" />
        </QueryPreviewErrorBoundary>
      );

      expect(screen.getByText('Too Many Requests')).toBeInTheDocument();
      expect(screen.getByText(/too many queries recently/)).toBeInTheDocument();
      expect(screen.getByText('Try Again')).toBeInTheDocument();
    });

    it('handles rate limit with retry-after header (429)', () => {
      const rateLimitError = new Error('Rate limited') as AxiosError;
      rateLimitError.isAxiosError = true;
      rateLimitError.response = {
        status: 429,
        data: { message: 'Too many requests' },
        headers: { 'retry-after': '120' },
        statusText: 'Too Many Requests',
        config: {} as any,
      };
      
      render(
        <QueryPreviewErrorBoundary darkMode={false} showRecoveryActions={true}>
          <ErrorTestComponent customError={rateLimitError} />
        </QueryPreviewErrorBoundary>
      );

      expect(screen.getByText('Too Many Requests')).toBeInTheDocument();
    });

    it('handles API quota exceeded', () => {
      const quotaError = new AppError(
        'Daily quota exceeded',
        ErrorType.RATE_LIMIT,
        'QUOTA_EXCEEDED',
        { 
          quota: 1000,
          used: 1000,
          resetTime: '2025-01-02T00:00:00Z'
        },
        429,
        '86400'
      );
      
      render(
        <QueryPreviewErrorBoundary darkMode={false} showRecoveryActions={true}>
          <ErrorTestComponent customError={quotaError} />
        </QueryPreviewErrorBoundary>
      );

      expect(screen.getByText('Too Many Requests')).toBeInTheDocument();
    });

    it('provides rate limit specific recovery guidance with retry after', () => {
      const rateLimitError = new AppError(
        'Rate limited',
        ErrorType.RATE_LIMIT,
        'RATE_LIMITED',
        {},
        429,
        '120'
      );
      const guidance = getRecoveryGuidance(rateLimitError);
      
      expect(guidance).toContain('120');
      expect(guidance).toContain('rate limit');
    });

    it('marks rate limit errors as retryable', () => {
      const rateLimitError = new AppError('Rate limited', ErrorType.RATE_LIMIT);
      expect(isRetryableError(rateLimitError)).toBe(true);
    });
  });

  describe('Server Error Scenarios', () => {
    it('handles internal server errors', () => {
      render(
        <QueryPreviewErrorBoundary darkMode={false} showRecoveryActions={true}>
          <ErrorTestComponent errorType="server" />
        </QueryPreviewErrorBoundary>
      );

      expect(screen.getByText('Server Error')).toBeInTheDocument();
      expect(screen.getByText(/temporary issue with the server/)).toBeInTheDocument();
      expect(screen.getByText('Try Again')).toBeInTheDocument();
    });

    it('handles 500 internal server error responses', () => {
      const serverError = new Error('Internal error') as AxiosError;
      serverError.isAxiosError = true;
      serverError.response = {
        status: 500,
        data: { 
          message: 'Database connection failed',
          errorId: 'ERR_DB_001'
        },
        headers: {},
        statusText: 'Internal Server Error',
        config: {} as any,
      };
      
      render(
        <QueryPreviewErrorBoundary darkMode={false} showRecoveryActions={true}>
          <ErrorTestComponent customError={serverError} />
        </QueryPreviewErrorBoundary>
      );

      expect(screen.getByText('Server Error')).toBeInTheDocument();
    });

    it('handles service unavailable (503)', () => {
      const unavailableError = new Error('Service unavailable') as AxiosError;
      unavailableError.isAxiosError = true;
      unavailableError.response = {
        status: 503,
        data: { message: 'Service temporarily unavailable' },
        headers: {},
        statusText: 'Service Unavailable',
        config: {} as any,
      };
      
      render(
        <QueryPreviewErrorBoundary darkMode={false} showRecoveryActions={true}>
          <ErrorTestComponent customError={unavailableError} />
        </QueryPreviewErrorBoundary>
      );

      expect(screen.getByText('Server Error')).toBeInTheDocument();
    });

    it('handles bad gateway (502)', () => {
      const badGatewayError = new Error('Bad gateway') as AxiosError;
      badGatewayError.isAxiosError = true;
      badGatewayError.response = {
        status: 502,
        data: { message: 'Bad gateway' },
        headers: {},
        statusText: 'Bad Gateway',
        config: {} as any,
      };
      
      render(
        <QueryPreviewErrorBoundary darkMode={false} showRecoveryActions={true}>
          <ErrorTestComponent customError={badGatewayError} />
        </QueryPreviewErrorBoundary>
      );

      expect(screen.getByText('Server Error')).toBeInTheDocument();
    });

    it('marks server errors as retryable', () => {
      const serverError = new AppError('Server failed', ErrorType.SERVER);
      expect(isRetryableError(serverError)).toBe(true);
    });
  });

  describe('Axios Error Parsing', () => {
    it('correctly parses axios network errors', () => {
      const networkError = new Error('Network Error') as AxiosError;
      networkError.isAxiosError = true;
      networkError.response = undefined; // No response = network error
      
      const parsed = parseError(networkError);
      
      expect(parsed.type).toBe(ErrorType.NETWORK);
      expect(parsed.message).toContain('Network error');
    });

    it('correctly parses axios response errors', () => {
      const responseError = new Error('Request failed') as AxiosError;
      responseError.isAxiosError = true;
      responseError.response = {
        status: 400,
        data: { message: 'Bad request' },
        headers: {},
        statusText: 'Bad Request',
        config: {} as any,
      };
      
      const parsed = parseError(responseError);
      
      expect(parsed.type).toBe(ErrorType.VALIDATION);
      expect(parsed.statusCode).toBe(400);
    });

    it('handles axios errors with nested error structures', () => {
      const nestedError = new Error('Complex error') as AxiosError;
      nestedError.isAxiosError = true;
      nestedError.response = {
        status: 400,
        data: {
          result: {
            error: {
              message: 'Query validation failed',
              code: 'QUERY_INVALID',
              details: { field: 'sAMAccountName', issue: 'Invalid syntax' }
            }
          }
        },
        headers: {},
        statusText: 'Bad Request',
        config: {} as any,
      };
      
      const parsed = parseError(nestedError);
      
      expect(parsed.message).toBe('Query validation failed');
      expect(parsed.code).toBe('QUERY_INVALID');
      expect(parsed.details).toEqual({ field: 'sAMAccountName', issue: 'Invalid syntax' });
    });

    it('handles axios errors with validation arrays', () => {
      const validationError = new Error('Validation failed') as AxiosError;
      validationError.isAxiosError = true;
      validationError.response = {
        status: 400,
        data: {
          errors: ['Field is required', 'Invalid format', 'Value out of range']
        },
        headers: {},
        statusText: 'Bad Request',
        config: {} as any,
      };
      
      const parsed = parseError(validationError);
      
      expect(parsed.type).toBe(ErrorType.VALIDATION);
      expect(parsed.message).toContain('Field is required');
      expect(parsed.details?.errors).toEqual(['Field is required', 'Invalid format', 'Value out of range']);
    });
  });

  describe('Error Recovery Workflows', () => {
    it('retries retryable errors automatically', async () => {
      const onRetry = vi.fn().mockResolvedValue(undefined);
      
      render(
        <QueryPreviewErrorBoundary 
          darkMode={false} 
          onRetry={onRetry}
          maxRetries={3}
          showRecoveryActions={true}
        >
          <ErrorTestComponent errorType="network" />
        </QueryPreviewErrorBoundary>
      );

      const retryButton = screen.getByText('Try Again');
      fireEvent.click(retryButton);

      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      expect(onRetry).toHaveBeenCalled();
    });

    it('does not retry non-retryable errors', () => {
      render(
        <QueryPreviewErrorBoundary 
          darkMode={false} 
          maxRetries={3}
          showRecoveryActions={true}
        >
          <ErrorTestComponent errorType="authorization" />
        </QueryPreviewErrorBoundary>
      );

      expect(screen.queryByText('Try Again')).not.toBeInTheDocument();
    });

    it('provides appropriate guidance for each error type', () => {
      const errorTypes = [
        { type: ErrorType.NETWORK, keyword: 'connection' },
        { type: ErrorType.TIMEOUT, keyword: 'reducing' },
        { type: ErrorType.VALIDATION, keyword: 'configuration' },
        { type: ErrorType.AUTHENTICATION, keyword: 'expired' },
        { type: ErrorType.AUTHORIZATION, keyword: 'administrator' },
        { type: ErrorType.RATE_LIMIT, keyword: 'rate limit' },
        { type: ErrorType.SERVER, keyword: 'server' },
      ];

      errorTypes.forEach(({ type, keyword }) => {
        const error = new AppError('Test error', type);
        const guidance = getRecoveryGuidance(error);
        expect(guidance.toLowerCase()).toContain(keyword);
      });
    });

    it('escalates to go back option when retry fails', async () => {
      const onRetry = vi.fn().mockRejectedValue(new Error('Retry failed'));
      const onGoBack = vi.fn();
      
      render(
        <QueryPreviewErrorBoundary 
          darkMode={false} 
          onRetry={onRetry}
          onGoBack={onGoBack}
          maxRetries={3}
          showRecoveryActions={true}
        >
          <ErrorTestComponent errorType="server" />
        </QueryPreviewErrorBoundary>
      );

      const retryButton = screen.getByText('Try Again');
      fireEvent.click(retryButton);

      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      // After retry fails, go back should still be available
      expect(screen.getByText('Go Back')).toBeInTheDocument();
    });
  });

  describe('Complex Error Scenarios', () => {
    it('handles cascading errors (error during error recovery)', async () => {
      let retryCount = 0;
      const onRetry = vi.fn().mockImplementation(() => {
        retryCount++;
        if (retryCount === 1) {
          throw new AppError('First retry failed', ErrorType.NETWORK);
        } else {
          throw new AppError('Second retry failed', ErrorType.SERVER);
        }
      });
      
      render(
        <QueryPreviewErrorBoundary 
          darkMode={false} 
          onRetry={onRetry}
          maxRetries={3}
          showRecoveryActions={true}
        >
          <ErrorTestComponent errorType="timeout" />
        </QueryPreviewErrorBoundary>
      );

      const retryButton = screen.getByText('Try Again');
      
      // First retry
      fireEvent.click(retryButton);
      
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      // Should still show error state
      expect(screen.getByText('Query Timeout')).toBeInTheDocument();
    });

    it('handles mixed error responses from different services', () => {
      const mixedError = new Error('Multiple services failed') as AxiosError;
      mixedError.isAxiosError = true;
      mixedError.response = {
        status: 502,
        data: {
          message: 'Gateway error',
          services: [
            { name: 'ldap', status: 'timeout', error: 'Connection timeout' },
            { name: 'database', status: 'error', error: 'Query failed' },
            { name: 'cache', status: 'ok', error: null }
          ]
        },
        headers: {},
        statusText: 'Bad Gateway',
        config: {} as any,
      };
      
      render(
        <QueryPreviewErrorBoundary darkMode={false} showRecoveryActions={true}>
          <ErrorTestComponent customError={mixedError} />
        </QueryPreviewErrorBoundary>
      );

      expect(screen.getByText('Server Error')).toBeInTheDocument();
    });

    it('handles errors with complex nested data structures', () => {
      const complexError = new AppError(
        'Complex operation failed',
        ErrorType.QUERY_EXECUTION,
        'COMPLEX_ERROR',
        {
          operation: 'ldap_query',
          stage: 'result_processing',
          context: {
            query: { filters: [{ field: 'dept', op: 'eq', val: 'IT' }] },
            metadata: { total: 1500, processed: 750, failed: 3 },
            errors: [
              { row: 100, field: 'manager', error: 'Invalid DN' },
              { row: 205, field: 'department', error: 'Value too long' },
              { row: 420, field: 'email', error: 'Invalid format' }
            ]
          }
        }
      );
      
      render(
        <QueryPreviewErrorBoundary darkMode={false} showRecoveryActions={true}>
          <ErrorTestComponent customError={complexError} />
        </QueryPreviewErrorBoundary>
      );

      expect(screen.getByText('Unexpected Error')).toBeInTheDocument();
    });
  });
});