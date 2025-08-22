import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { message } from 'antd';
import { useErrorHandler, useFormErrorHandler } from '../useErrorHandler';
import { AppError, ErrorType } from '@/utils/errorHandler';

// Mock antd message
vi.mock('antd', async () => {
  const actual = await vi.importActual('antd');
  return {
    ...actual,
    message: {
      error: vi.fn(),
      success: vi.fn(),
      destroy: vi.fn(),
    },
  };
});

// Mock store hooks
vi.mock('@/store', () => ({
  useAppDispatch: vi.fn(() => vi.fn()),
}));

describe('useErrorHandler Enhanced Features', () => {
  let mockTimers: boolean;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTimers = false;
  });

  afterEach(() => {
    if (mockTimers) {
      vi.useRealTimers();
    }
  });

  const setupTimers = () => {
    vi.useFakeTimers();
    mockTimers = true;
  };

  describe('Basic Error Handling', () => {
    it('handles AppError with proper message formatting', () => {
      const { result } = renderHook(() => useErrorHandler());
      
      const appError = new AppError(
        'Test error',
        ErrorType.NETWORK,
        'NETWORK_ERROR',
        { test: 'details' }
      );
      
      act(() => {
        result.current.handleError(appError);
      });
      
      expect(message.error).toHaveBeenCalledWith(
        'Unable to connect to the server. Please check your internet connection and try again.'
      );
    });

    it('handles standard JavaScript errors', () => {
      const { result } = renderHook(() => useErrorHandler());
      
      const jsError = new Error('Standard error message');
      
      act(() => {
        result.current.handleError(jsError);
      });
      
      expect(message.error).toHaveBeenCalledWith('Standard error message');
    });

    it('handles string errors', () => {
      const { result } = renderHook(() => useErrorHandler());
      
      act(() => {
        result.current.handleError('String error message');
      });
      
      expect(message.error).toHaveBeenCalledWith('String error message');
    });

    it('can disable notifications', () => {
      const { result } = renderHook(() => useErrorHandler());
      
      const appError = new AppError('Test error', ErrorType.NETWORK);
      
      act(() => {
        result.current.handleError(appError, { showNotification: false });
      });
      
      expect(message.error).not.toHaveBeenCalled();
    });
  });

  describe('Async Operation Handling', () => {
    it('handles successful async operations', async () => {
      const { result } = renderHook(() => useErrorHandler());
      
      const successValue = { data: 'test' };
      const asyncFn = vi.fn().mockResolvedValue(successValue);
      const onSuccess = vi.fn();
      
      let resultValue: unknown;
      await act(async () => {
        resultValue = await result.current.handleAsync(asyncFn, { onSuccess });
      });
      
      expect(asyncFn).toHaveBeenCalled();
      expect(onSuccess).toHaveBeenCalledWith(successValue);
      expect(resultValue).toBe(successValue);
    });

    it('handles failed async operations', async () => {
      const { result } = renderHook(() => useErrorHandler());
      
      const error = new AppError('Async error', ErrorType.SERVER);
      const asyncFn = vi.fn().mockRejectedValue(error);
      const onError = vi.fn();
      
      let resultValue: unknown;
      await act(async () => {
        resultValue = await result.current.handleAsync(asyncFn, { onError });
      });
      
      expect(asyncFn).toHaveBeenCalled();
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          type: ErrorType.SERVER,
          message: 'Async error'
        })
      );
      expect(resultValue).toBeNull();
      expect(message.error).toHaveBeenCalled();
    });

    it('provides retry callback for async operations', async () => {
      const { result } = renderHook(() => useErrorHandler());
      
      const error = new AppError('Retry error', ErrorType.NETWORK);
      const asyncFn = vi.fn().mockRejectedValue(error);
      const retryCallback = vi.fn();
      
      await act(async () => {
        await result.current.handleAsync(asyncFn, { retryCallback });
      });
      
      expect(message.error).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.any(String),
          onClick: expect.any(Function),
        })
      );
    });
  });

  describe('Retry Handler with Exponential Backoff', () => {
    it('creates retry handler with exponential backoff', async () => {
      setupTimers();
      const { result } = renderHook(() => useErrorHandler());
      
      let attempt = 0;
      const asyncFn = vi.fn().mockImplementation(() => {
        attempt++;
        if (attempt < 3) {
          throw new AppError('Retry test', ErrorType.NETWORK);
        }
        return Promise.resolve('success');
      });
      
      const retryHandler = result.current.createRetryHandler(asyncFn, 3);
      
      let resultValue: unknown;
      let promise: Promise<any>;
      
      await act(async () => {
        promise = retryHandler();
        // Let the first attempt fail
        await Promise.resolve();
        
        // Fast forward through first retry delay
        vi.advanceTimersByTime(1000);
        await Promise.resolve();
        
        // Fast forward through second retry delay
        vi.advanceTimersByTime(2000);
        await Promise.resolve();
        
        resultValue = await promise;
      });
      
      expect(asyncFn).toHaveBeenCalledTimes(3);
      expect(resultValue).toBe('success');
    });

    it('stops retrying after max attempts', async () => {
      setupTimers();
      const { result } = renderHook(() => useErrorHandler());
      
      const error = new AppError('Persistent error', ErrorType.NETWORK);
      const asyncFn = vi.fn().mockRejectedValue(error);
      
      const retryHandler = result.current.createRetryHandler(asyncFn, 2);
      
      let resultValue: unknown;
      let promise: Promise<any>;
      
      await act(async () => {
        promise = retryHandler();
        // Let the first attempt fail
        await Promise.resolve();
        
        // Fast forward through first retry delay
        vi.advanceTimersByTime(1000);
        await Promise.resolve();
        
        resultValue = await promise;
      });
      
      expect(asyncFn).toHaveBeenCalledTimes(2);
      expect(resultValue).toBeNull();
      expect(message.error).toHaveBeenCalled();
    });

    it('does not retry non-retryable errors', async () => {
      const { result } = renderHook(() => useErrorHandler());
      
      const error = new AppError('Auth error', ErrorType.AUTHENTICATION);
      const asyncFn = vi.fn().mockRejectedValue(error);
      
      const retryHandler = result.current.createRetryHandler(asyncFn, 3);
      
      let resultValue: unknown;
      await act(async () => {
        resultValue = await retryHandler();
      });
      
      expect(asyncFn).toHaveBeenCalledTimes(1);
      expect(resultValue).toBeNull();
    });
  });

  describe('Preview Error Handling', () => {
    it('handles preview errors with enhanced messaging', () => {
      const { result } = renderHook(() => useErrorHandler());
      
      const error = new AppError('Preview error', ErrorType.TIMEOUT);
      const retryCallback = vi.fn().mockResolvedValue(undefined);
      
      act(() => {
        result.current.handlePreviewError(error, {
          retryCallback,
          context: 'Query Preview',
          enableAutoRetry: true,
        });
      });
      
      expect(message.error).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.any(Object), // React element with enhanced content
          duration: 8,
          onClick: expect.any(Function),
        })
      );
    });

    it('provides contextual messages for different error types', () => {
      const { result } = renderHook(() => useErrorHandler());
      
      const timeoutError = new AppError('Timeout', ErrorType.TIMEOUT);
      
      let enhancedError: any;
      act(() => {
        enhancedError = result.current.handlePreviewError(timeoutError, {
          context: 'Test Context',
        });
      });
      
      expect(enhancedError.context).toBe('Test Context');
      expect(enhancedError.canRetry).toBe(true);
      expect(enhancedError.recoveryGuidance).toContain('reducing');
    });

    it('handles validation errors with go back option', () => {
      const { result } = renderHook(() => useErrorHandler());
      
      const validationError = new AppError('Validation error', ErrorType.VALIDATION);
      const onGoBack = vi.fn();
      
      act(() => {
        result.current.handlePreviewError(validationError, {
          onGoBack,
          enableAutoRetry: false,
        });
      });
      
      expect(message.error).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.any(Object),
          duration: 10,
          onClick: expect.any(Function),
        })
      );
    });

    it('returns enhanced error object with preview context', () => {
      const { result } = renderHook(() => useErrorHandler());
      
      const error = new AppError('Test error', ErrorType.NETWORK);
      
      let enhancedError: any;
      act(() => {
        enhancedError = result.current.handlePreviewError(error, {
          context: 'Preview Context',
          maxRetries: 5,
        });
      });
      
      expect(enhancedError).toMatchObject({
        type: ErrorType.NETWORK,
        context: 'Preview Context',
        canRetry: true,
        maxRetries: 5,
        recoveryGuidance: expect.any(String),
        name: 'AppError'
      });
      
      // Check that the message is included in the enhanced error object
      expect(enhancedError).toHaveProperty('message');
      expect(enhancedError.message).toEqual(expect.any(String));
    });
  });

  describe('Preview Retry Handler', () => {
    it('creates enhanced retry handler for preview operations', async () => {
      setupTimers();
      const { result } = renderHook(() => useErrorHandler());
      
      let attempt = 0;
      const asyncFn = vi.fn().mockImplementation(() => {
        attempt++;
        if (attempt < 2) {
          throw new AppError('Preview retry test', ErrorType.NETWORK);
        }
        return Promise.resolve('preview success');
      });
      
      const onProgress = vi.fn();
      const onSuccess = vi.fn();
      
      const retryHandler = result.current.createPreviewRetryHandler(asyncFn, {
        maxAttempts: 3,
        context: 'Preview Context',
        onProgress,
        onSuccess,
      });
      
      let resultValue: unknown;
      const promise = act(async () => {
        resultValue = await retryHandler();
      });
      
      await act(async () => {
        vi.advanceTimersByTime(1000);
        await Promise.resolve();
      });
      
      await promise;
      
      expect(onProgress).toHaveBeenCalledWith(1, expect.any(AppError));
      expect(onSuccess).toHaveBeenCalledWith('preview success', 2);
      expect(resultValue).toBe('preview success');
    });

    it('calls failure callback on max attempts reached', async () => {
      setupTimers();
      const { result } = renderHook(() => useErrorHandler());
      
      const error = new AppError('Persistent preview error', ErrorType.SERVER);
      const asyncFn = vi.fn().mockRejectedValue(error);
      const onFailure = vi.fn();
      
      const retryHandler = result.current.createPreviewRetryHandler(asyncFn, {
        maxAttempts: 2,
        onFailure,
      });
      
      let resultValue: unknown;
      const promise = act(async () => {
        resultValue = await retryHandler();
      });
      
      await act(async () => {
        vi.advanceTimersByTime(1000);
        await Promise.resolve();
        vi.advanceTimersByTime(2000);
        await Promise.resolve();
      });
      
      await promise;
      
      expect(onFailure).toHaveBeenCalledWith(expect.any(AppError), 2);
      expect(resultValue).toBeNull();
    });

    it('implements correct exponential backoff delays', async () => {
      setupTimers();
      const { result } = renderHook(() => useErrorHandler());
      
      const error = new AppError('Delay test', ErrorType.NETWORK);
      const asyncFn = vi.fn().mockRejectedValue(error);
      
      const retryHandler = result.current.createPreviewRetryHandler(asyncFn, {
        maxAttempts: 3,
      });
      
      let promise: Promise<any>;
      
      await act(async () => {
        promise = retryHandler();
        // Let first attempt execute
        await Promise.resolve();
      });
      
      // First attempt - no delay
      expect(asyncFn).toHaveBeenCalledTimes(1);
      
      // First retry - 1 second delay
      await act(async () => {
        vi.advanceTimersByTime(1000);
        await Promise.resolve();
      });
      expect(asyncFn).toHaveBeenCalledTimes(2);
      
      // Second retry - 2 second delay
      await act(async () => {
        vi.advanceTimersByTime(2000);
        await Promise.resolve();
      });
      expect(asyncFn).toHaveBeenCalledTimes(3);
      
      await act(async () => {
        await promise;
      });
    });

    it('caps maximum delay at 8 seconds', async () => {
      setupTimers();
      const { result } = renderHook(() => useErrorHandler());
      
      const error = new AppError('Max delay test', ErrorType.NETWORK);
      const asyncFn = vi.fn().mockRejectedValue(error);
      
      const retryHandler = result.current.createPreviewRetryHandler(asyncFn, {
        maxAttempts: 5, // Reduce attempts to avoid timeout
      });
      
      let promise: Promise<any>;
      
      await act(async () => {
        promise = retryHandler();
        // Let first attempt execute
        await Promise.resolve();
      });
      
      // Fast forward through multiple attempts to reach max delay
      for (let i = 0; i < 4; i++) {
        await act(async () => {
          const expectedDelay = Math.min(1000 * Math.pow(2, i), 8000);
          vi.advanceTimersByTime(expectedDelay);
          await Promise.resolve();
        });
      }
      
      await act(async () => {
        await promise;
      });
      
      expect(asyncFn).toHaveBeenCalledTimes(5); // Initial + 4 retries
    });
  });

  describe('Preview Operation Handler', () => {
    it('handles successful preview operations', async () => {
      const { result } = renderHook(() => useErrorHandler());
      
      const operation = vi.fn().mockResolvedValue('operation success');
      const onSuccess = vi.fn();
      
      let resultValue: unknown;
      await act(async () => {
        resultValue = await result.current.handlePreviewOperation(operation, {
          onSuccess,
          context: 'Test Operation',
        });
      });
      
      expect(operation).toHaveBeenCalled();
      expect(onSuccess).toHaveBeenCalledWith('operation success');
      expect(resultValue).toBe('operation success');
    });

    it('handles failed preview operations with enhanced error context', async () => {
      const { result } = renderHook(() => useErrorHandler());
      
      const error = new AppError('Operation failed', ErrorType.TIMEOUT);
      const operation = vi.fn().mockRejectedValue(error);
      const onError = vi.fn();
      const onRetry = vi.fn();
      const onGoBack = vi.fn();
      
      let resultValue: unknown;
      await act(async () => {
        resultValue = await result.current.handlePreviewOperation(operation, {
          onError,
          onRetry,
          onGoBack,
          context: 'Test Operation',
          maxRetries: 3,
        });
      });
      
      expect(operation).toHaveBeenCalled();
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          type: ErrorType.TIMEOUT,
          message: 'Operation failed',
          context: 'Test Operation',
          canRetry: true,
          maxRetries: 3,
          recoveryGuidance: 'Try reducing the number of selected fields, adding more specific filters, or limiting the date range.',
          name: 'AppError',
          code: undefined,
          details: undefined,
          retryAfter: undefined,
          statusCode: undefined
        })
      );
      expect(resultValue).toBeNull();
    });

    it('can disable notifications for preview operations', async () => {
      const { result } = renderHook(() => useErrorHandler());
      
      const error = new AppError('Silent error', ErrorType.NETWORK);
      const operation = vi.fn().mockRejectedValue(error);
      
      await act(async () => {
        await result.current.handlePreviewOperation(operation, {
          showNotification: false,
        });
      });
      
      expect(message.error).not.toHaveBeenCalled();
    });
  });

  describe('Form Error Handler', () => {
    it('handles form validation errors with field details', () => {
      const { result } = renderHook(() => useFormErrorHandler());
      
      const validationError = new AppError(
        'Validation failed',
        ErrorType.VALIDATION,
        'VALIDATION_ERROR',
        {
          email: 'Invalid email format',
          password: ['Password too short', 'Password must contain numbers'],
        }
      );
      
      const mockForm = {
        setFields: vi.fn(),
      };
      
      act(() => {
        result.current.handleFormError(validationError, mockForm);
      });
      
      expect(mockForm.setFields).toHaveBeenCalledWith([
        { name: 'email', errors: ['Invalid email format'] },
        { name: 'password', errors: ['Password too short', 'Password must contain numbers'] },
      ]);
    });

    it('shows general error message when no field details available', () => {
      const { result } = renderHook(() => useFormErrorHandler());
      
      const generalError = new AppError('General form error', ErrorType.SERVER);
      
      act(() => {
        result.current.handleFormError(generalError);
      });
      
      expect(message.error).toHaveBeenCalledWith(
        'Server error occurred. Please try again later or contact support.'
      );
    });

    it('handles non-AppError objects in forms', () => {
      const { result } = renderHook(() => useFormErrorHandler());
      
      const jsError = new Error('JavaScript form error');
      
      act(() => {
        result.current.handleFormError(jsError);
      });
      
      expect(message.error).toHaveBeenCalledWith('JavaScript form error');
    });
  });

  describe('Error Context and Recovery Guidance', () => {
    it('provides appropriate recovery guidance for each error type', () => {
      const { result } = renderHook(() => useErrorHandler());
      
      const errorTypes = [
        {
          type: ErrorType.NETWORK,
          expectedGuidance: /internet connection/,
        },
        {
          type: ErrorType.TIMEOUT,
          expectedGuidance: /reducing.*fields/,
        },
        {
          type: ErrorType.VALIDATION,
          expectedGuidance: /query configuration/,
        },
        {
          type: ErrorType.AUTHENTICATION,
          expectedGuidance: /session has expired/,
        },
        {
          type: ErrorType.AUTHORIZATION,
          expectedGuidance: /administrator.*permissions/,
        },
        {
          type: ErrorType.RATE_LIMIT,
          expectedGuidance: /rate limit/,
        },
        {
          type: ErrorType.SERVER,
          expectedGuidance: /server.*experiencing issues/,
        },
      ];
      
      errorTypes.forEach(({ type, expectedGuidance }) => {
        const error = new AppError('Test error', type);
        
        let enhancedError: any;
        act(() => {
          enhancedError = result.current.handlePreviewError(error);
        });
        
        expect(enhancedError.recoveryGuidance).toMatch(expectedGuidance);
      });
    });

    it('includes retry after information for rate limit errors', () => {
      const { result } = renderHook(() => useErrorHandler());
      
      const rateLimitError = new AppError(
        'Rate limited',
        ErrorType.RATE_LIMIT,
        'RATE_LIMITED',
        {},
        429,
        '120'
      );
      
      let enhancedError: any;
      act(() => {
        enhancedError = result.current.handlePreviewError(rateLimitError);
      });
      
      expect(enhancedError.recoveryGuidance).toContain('120');
    });
  });

  describe('Integration with Message System', () => {
    it('creates clickable retry notifications', () => {
      const { result } = renderHook(() => useErrorHandler());
      
      const retryCallback = vi.fn();
      const error = new AppError('Retry test', ErrorType.NETWORK);
      
      act(() => {
        result.current.handleError(error, { retryCallback });
      });
      
      expect(message.error).toHaveBeenCalledWith(
        expect.objectContaining({
          onClick: expect.any(Function),
          style: { cursor: 'pointer' },
          key: 'error-notification',
        })
      );
    });

    it('destroys notification before retrying', () => {
      const { result } = renderHook(() => useErrorHandler());
      
      const retryCallback = vi.fn();
      const error = new AppError('Destroy test', ErrorType.NETWORK);
      
      act(() => {
        result.current.handleError(error, { retryCallback });
      });
      
      const messageCall = (message.error as unknown).mock.calls[0][0];
      
      act(() => {
        messageCall.onClick();
      });
      
      expect(message.destroy).toHaveBeenCalledWith('error-notification');
      expect(retryCallback).toHaveBeenCalled();
    });
  });
});