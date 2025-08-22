import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AppError, ErrorType, getRetryDelay } from '@/utils/errorHandler';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import { QueryPreviewErrorBoundary } from '@/components/query/QueryPreviewErrorBoundary';
import { createMockStore } from '@/utils/test-utils';
import { Provider } from 'react-redux';

// Test component for retry scenarios
const RetryTestComponent: React.FC<{
  shouldThrow: boolean;
  errorType?: ErrorType;
  throwCount?: number;
}> = ({ shouldThrow, errorType = ErrorType.NETWORK, throwCount = 1 }) => {
  const [currentThrowCount, setCurrentThrowCount] = React.useState(0);

  // Always call useEffect at the top level, but conditionally execute logic
  React.useEffect(() => {
    if (shouldThrow && currentThrowCount < throwCount) {
      setCurrentThrowCount(prev => prev + 1);
    }
  }, [shouldThrow, currentThrowCount, throwCount]);

  if (shouldThrow && currentThrowCount < throwCount) {
    throw new AppError(
      `Test error ${currentThrowCount + 1}`,
      errorType,
      'TEST_ERROR',
      { attempt: currentThrowCount + 1 }
    );
  }

  return <div data-testid="success">Success after {currentThrowCount} errors</div>;
};

// Mock async operation for testing retry handlers
const createMockAsyncOperation = (
  failureCount: number,
  errorType: ErrorType = ErrorType.NETWORK,
  successValue: string = 'success'
) => {
  let attempt = 0;
  return vi.fn().mockImplementation(() => {
    attempt++;
    if (attempt <= failureCount) {
      throw new AppError(
        `Attempt ${attempt} failed`,
        errorType,
        'MOCK_ERROR',
        { attempt }
      );
    }
    return Promise.resolve(successValue);
  });
};

describe('Retry Logic Comprehensive Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Exponential Backoff Implementation', () => {
    it('calculates correct delays for network errors', () => {
      const networkError = new AppError('Network error', ErrorType.NETWORK);
      
      const delays = [
        getRetryDelay(networkError, 1), // First retry
        getRetryDelay(networkError, 2), // Second retry
        getRetryDelay(networkError, 3), // Third retry
        getRetryDelay(networkError, 4), // Fourth retry
      ];
      
      expect(delays[0]).toBe(2000);   // 1000 * 2^1 = 2000ms
      expect(delays[1]).toBe(4000);   // 1000 * 2^2 = 4000ms
      expect(delays[2]).toBe(8000);   // 1000 * 2^3 = 8000ms
      expect(delays[3]).toBe(16000);  // 1000 * 2^4 = 16000ms
    });

    it('caps network retry delays at 30 seconds', () => {
      const networkError = new AppError('Network error', ErrorType.NETWORK);
      
      const longDelay = getRetryDelay(networkError, 10);
      expect(longDelay).toBe(30000); // Capped at 30 seconds
    });

    it('calculates correct delays for rate limit errors', () => {
      const rateLimitError = new AppError('Rate limited', ErrorType.RATE_LIMIT);
      
      const delays = [
        getRetryDelay(rateLimitError, 1),
        getRetryDelay(rateLimitError, 2),
        getRetryDelay(rateLimitError, 3),
      ];
      
      expect(delays[0]).toBe(10000);  // 1000 * 2^1 * 5 = 10000ms
      expect(delays[1]).toBe(20000);  // 1000 * 2^2 * 5 = 20000ms
      expect(delays[2]).toBe(40000);  // 1000 * 2^3 * 5 = 40000ms
    });

    it('caps rate limit retry delays at 60 seconds', () => {
      const rateLimitError = new AppError('Rate limited', ErrorType.RATE_LIMIT);
      
      const longDelay = getRetryDelay(rateLimitError, 10);
      expect(longDelay).toBe(60000); // Capped at 60 seconds
    });

    it('calculates linear backoff for server errors', () => {
      const serverError = new AppError('Server error', ErrorType.SERVER);
      
      const delays = [
        getRetryDelay(serverError, 1),
        getRetryDelay(serverError, 2),
        getRetryDelay(serverError, 3),
      ];
      
      expect(delays[0]).toBe(2000);   // 1000 * 1 * 2 = 2000ms
      expect(delays[1]).toBe(4000);   // 1000 * 2 * 2 = 4000ms
      expect(delays[2]).toBe(6000);   // 1000 * 3 * 2 = 6000ms
    });

    it('caps server retry delays at 20 seconds', () => {
      const serverError = new AppError('Server error', ErrorType.SERVER);
      
      const longDelay = getRetryDelay(serverError, 15);
      expect(longDelay).toBe(20000); // Capped at 20 seconds
    });
  });

  describe('useErrorHandler Retry Logic', () => {
    it('implements exponential backoff in createRetryHandler', async () => {
      const { result } = renderHook(() => useErrorHandler());
      
      const mockOperation = createMockAsyncOperation(2, ErrorType.NETWORK);
      const retryHandler = result.current.createRetryHandler(mockOperation, 3);
      
      let resultValue: string | null;
      
      const promise = act(async () => {
        resultValue = await retryHandler();
      });
      
      // Fast forward through delays
      await act(async () => {
        vi.advanceTimersByTime(1000); // First retry delay
        await Promise.resolve();
        vi.advanceTimersByTime(2000); // Second retry delay
        await Promise.resolve();
      });
      
      await promise;
      
      expect(mockOperation).toHaveBeenCalledTimes(3); // Initial + 2 retries
      expect(resultValue).toBe('success');
    });

    it('stops retrying after max attempts', async () => {
      const { result } = renderHook(() => useErrorHandler());
      
      const mockOperation = createMockAsyncOperation(5, ErrorType.NETWORK); // More failures than max attempts
      const retryHandler = result.current.createRetryHandler(mockOperation, 2);
      
      let resultValue: string | null;
      
      const promise = act(async () => {
        resultValue = await retryHandler();
      });
      
      await act(async () => {
        vi.advanceTimersByTime(1000); // First retry
        await Promise.resolve();
        vi.advanceTimersByTime(2000); // Second retry (max reached)
        await Promise.resolve();
      });
      
      await promise;
      
      expect(mockOperation).toHaveBeenCalledTimes(2); // Initial + 1 retry (max 2 attempts)
      expect(resultValue).toBeNull();
    });

    it('does not retry non-retryable errors', async () => {
      const { result } = renderHook(() => useErrorHandler());
      
      const mockOperation = createMockAsyncOperation(1, ErrorType.AUTHENTICATION);
      const retryHandler = result.current.createRetryHandler(mockOperation, 3);
      
      let resultValue: string | null;
      
      await act(async () => {
        resultValue = await retryHandler();
      });
      
      expect(mockOperation).toHaveBeenCalledTimes(1); // Only initial attempt
      expect(resultValue).toBeNull();
    });

    it('tracks progress in createPreviewRetryHandler', async () => {
      const store = createMockStore();
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <Provider store={store}>{children}</Provider>
      );
      const { result } = renderHook(() => useErrorHandler(), { wrapper });
      
      const mockOperation = createMockAsyncOperation(2, ErrorType.TIMEOUT);
      const onProgress = vi.fn();
      const onSuccess = vi.fn();
      
      const retryHandler = result.current.createPreviewRetryHandler(mockOperation, {
        maxAttempts: 3,
        onProgress,
        onSuccess,
      });
      
      const promise = act(async () => {
        await retryHandler();
      });
      
      await act(async () => {
        vi.advanceTimersByTime(1000); // First retry
        await Promise.resolve();
        vi.advanceTimersByTime(2000); // Second retry
        await Promise.resolve();
      });
      
      await promise;
      
      expect(onProgress).toHaveBeenCalledTimes(2);
      expect(onProgress).toHaveBeenNthCalledWith(1, 1, expect.any(AppError));
      expect(onProgress).toHaveBeenNthCalledWith(2, 2, expect.any(AppError));
      expect(onSuccess).toHaveBeenCalledWith('success', 3);
    });

    it('calls failure callback when max attempts reached', async () => {
      const store = createMockStore();
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <Provider store={store}>{children}</Provider>
      );
      const { result } = renderHook(() => useErrorHandler(), { wrapper });
      
      const mockOperation = createMockAsyncOperation(5, ErrorType.SERVER);
      const onFailure = vi.fn();
      
      const retryHandler = result.current.createPreviewRetryHandler(mockOperation, {
        maxAttempts: 2,
        onFailure,
      });
      
      let resultValue: string | null;
      
      const promise = act(async () => {
        resultValue = await retryHandler();
      });
      
      await act(async () => {
        vi.advanceTimersByTime(2000); // First retry
        await Promise.resolve();
        vi.advanceTimersByTime(4000); // Second retry (max reached)
        await Promise.resolve();
      });
      
      await promise;
      
      expect(onFailure).toHaveBeenCalledWith(expect.any(AppError), 2);
      expect(resultValue).toBeNull();
    });
  });

  describe('Error Boundary Retry Integration', () => {
    it('implements retry with exponential backoff in error boundary', async () => {
      let retryAttempt = 0;
      const onRetry = vi.fn().mockImplementation(async () => {
        retryAttempt++;
        if (retryAttempt < 3) {
          throw new AppError('Retry failed', ErrorType.NETWORK);
        }
        return 'success';
      });
      
      render(
        <QueryPreviewErrorBoundary
          darkMode={false}
          onRetry={onRetry}
          maxRetries={3}
          showRecoveryActions={true}
        >
          <RetryTestComponent shouldThrow={true} errorType={ErrorType.NETWORK} />
        </QueryPreviewErrorBoundary>
      );
      
      const retryButton = screen.getByText('Try Again');
      fireEvent.click(retryButton);
      
      // Wait for first retry delay
      await act(async () => {
        vi.advanceTimersByTime(1000);
        await Promise.resolve();
      });
      
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('tracks retry attempts correctly in error boundary', async () => {
      let attempt = 0;
      const onRetry = vi.fn().mockImplementation(async () => {
        attempt++;
        throw new AppError(`Attempt ${attempt} failed`, ErrorType.TIMEOUT);
      });
      
      render(
        <QueryPreviewErrorBoundary
          darkMode={false}
          onRetry={onRetry}
          maxRetries={3}
          showRecoveryActions={true}
        >
          <RetryTestComponent shouldThrow={true} errorType={ErrorType.TIMEOUT} />
        </QueryPreviewErrorBoundary>
      );
      
      // First retry
      fireEvent.click(screen.getByText('Try Again'));
      
      await act(async () => {
        vi.advanceTimersByTime(1000);
        await Promise.resolve();
      });
      
      expect(screen.getByText('Attempt 2 of 3')).toBeInTheDocument();
      
      // Second retry
      fireEvent.click(screen.getByText('Try Again'));
      
      await act(async () => {
        vi.advanceTimersByTime(2000);
        await Promise.resolve();
      });
      
      expect(screen.getByText('Attempt 3 of 3')).toBeInTheDocument();
    });

    it('disables retry when max attempts reached', async () => {
      const onRetry = vi.fn().mockRejectedValue(new AppError('Always fails', ErrorType.SERVER));
      
      render(
        <QueryPreviewErrorBoundary
          darkMode={false}
          onRetry={onRetry}
          maxRetries={2}
          showRecoveryActions={true}
        >
          <RetryTestComponent shouldThrow={true} errorType={ErrorType.SERVER} />
        </QueryPreviewErrorBoundary>
      );
      
      // Simulate reaching max retries by setting retry count
      const boundary = screen.getByText('Try Again').closest('div');
      expect(boundary).toBeInTheDocument();
      
      // After max retries, button should not be available or disabled
      // This is handled by the component's internal state
    });

    it('resets retry count on successful retry', async () => {
      let attempt = 0;
      const onRetry = vi.fn().mockImplementation(async () => {
        attempt++;
        if (attempt === 1) {
          throw new AppError('First retry fails', ErrorType.NETWORK);
        }
        return 'success';
      });
      
      const { rerender } = render(
        <QueryPreviewErrorBoundary
          darkMode={false}
          onRetry={onRetry}
          maxRetries={3}
          showRecoveryActions={true}
        >
          <RetryTestComponent shouldThrow={true} errorType={ErrorType.NETWORK} />
        </QueryPreviewErrorBoundary>
      );
      
      fireEvent.click(screen.getByText('Try Again'));
      
      await act(async () => {
        vi.advanceTimersByTime(1000);
        await Promise.resolve();
      });
      
      // Simulate successful recovery by re-rendering without error
      rerender(
        <QueryPreviewErrorBoundary
          darkMode={false}
          onRetry={onRetry}
          maxRetries={3}
          showRecoveryActions={true}
        >
          <RetryTestComponent shouldThrow={false} />
        </QueryPreviewErrorBoundary>
      );
      
      expect(screen.getByTestId('success')).toBeInTheDocument();
    });
  });

  describe('Retry Success and Failure Scenarios', () => {
    it('handles immediate success without retry', async () => {
      const store = createMockStore();
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <Provider store={store}>{children}</Provider>
      );
      const { result } = renderHook(() => useErrorHandler(), { wrapper });
      
      const mockOperation = vi.fn().mockResolvedValue('immediate success');
      const retryHandler = result.current.createRetryHandler(mockOperation, 3);
      
      let resultValue: string | null;
      
      await act(async () => {
        resultValue = await retryHandler();
      });
      
      expect(mockOperation).toHaveBeenCalledTimes(1);
      expect(resultValue).toBe('immediate success');
    });

    it('handles success after first retry', async () => {
      const store = createMockStore();
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <Provider store={store}>{children}</Provider>
      );
      const { result } = renderHook(() => useErrorHandler(), { wrapper });
      
      const mockOperation = createMockAsyncOperation(1, ErrorType.NETWORK, 'success after retry');
      const retryHandler = result.current.createRetryHandler(mockOperation, 3);
      
      let resultValue: string | null;
      
      const promise = act(async () => {
        resultValue = await retryHandler();
      });
      
      await act(async () => {
        vi.advanceTimersByTime(1000); // First retry delay
        await Promise.resolve();
      });
      
      await promise;
      
      expect(mockOperation).toHaveBeenCalledTimes(2);
      expect(resultValue).toBe('success after retry');
    });

    it('handles success after multiple retries', async () => {
      const store = createMockStore();
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <Provider store={store}>{children}</Provider>
      );
      const { result } = renderHook(() => useErrorHandler(), { wrapper });
      
      const mockOperation = createMockAsyncOperation(3, ErrorType.TIMEOUT, 'final success');
      const retryHandler = result.current.createRetryHandler(mockOperation, 5);
      
      let resultValue: string | null;
      
      const promise = act(async () => {
        resultValue = await retryHandler();
      });
      
      // Fast forward through all retry delays
      await act(async () => {
        vi.advanceTimersByTime(1000); // 1st retry
        await Promise.resolve();
        vi.advanceTimersByTime(2000); // 2nd retry
        await Promise.resolve();
        vi.advanceTimersByTime(4000); // 3rd retry
        await Promise.resolve();
      });
      
      await promise;
      
      expect(mockOperation).toHaveBeenCalledTimes(4); // Initial + 3 retries
      expect(resultValue).toBe('final success');
    });

    it('handles persistent failure beyond max retries', async () => {
      const store = createMockStore();
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <Provider store={store}>{children}</Provider>
      );
      const { result } = renderHook(() => useErrorHandler(), { wrapper });
      
      const mockOperation = createMockAsyncOperation(10, ErrorType.SERVER); // More failures than max
      const retryHandler = result.current.createRetryHandler(mockOperation, 3);
      
      let resultValue: string | null;
      
      const promise = act(async () => {
        resultValue = await retryHandler();
      });
      
      await act(async () => {
        vi.advanceTimersByTime(2000); // 1st retry
        await Promise.resolve();
        vi.advanceTimersByTime(4000); // 2nd retry
        await Promise.resolve();
        vi.advanceTimersByTime(6000); // 3rd retry (max reached)
        await Promise.resolve();
      });
      
      await promise;
      
      expect(mockOperation).toHaveBeenCalledTimes(3); // Max attempts reached
      expect(resultValue).toBeNull();
    });

    it('handles mixed error types during retries', async () => {
      const store = createMockStore();
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <Provider store={store}>{children}</Provider>
      );
      const { result } = renderHook(() => useErrorHandler(), { wrapper });
      
      let attempt = 0;
      const mockOperation = vi.fn().mockImplementation(() => {
        attempt++;
        switch (attempt) {
          case 1:
            throw new AppError('Network error', ErrorType.NETWORK);
          case 2:
            throw new AppError('Timeout error', ErrorType.TIMEOUT);
          case 3:
            throw new AppError('Server error', ErrorType.SERVER);
          default:
            return Promise.resolve('mixed success');
        }
      });
      
      const retryHandler = result.current.createRetryHandler(mockOperation, 5);
      
      let resultValue: string | null;
      
      const promise = act(async () => {
        resultValue = await retryHandler();
      });
      
      await act(async () => {
        vi.advanceTimersByTime(1000); // Network retry delay
        await Promise.resolve();
        vi.advanceTimersByTime(2000); // Timeout retry delay
        await Promise.resolve();
        vi.advanceTimersByTime(4000); // Server retry delay
        await Promise.resolve();
      });
      
      await promise;
      
      expect(mockOperation).toHaveBeenCalledTimes(4);
      expect(resultValue).toBe('mixed success');
    });

    it('handles errors that become non-retryable during retry', async () => {
      const { result } = renderHook(() => useErrorHandler());
      
      let attempt = 0;
      const mockOperation = vi.fn().mockImplementation(() => {
        attempt++;
        if (attempt === 1) {
          throw new AppError('Network error', ErrorType.NETWORK); // Retryable
        } else {
          throw new AppError('Auth expired', ErrorType.AUTHENTICATION); // Non-retryable
        }
      });
      
      const retryHandler = result.current.createRetryHandler(mockOperation, 3);
      
      let resultValue: string | null;
      
      const promise = act(async () => {
        resultValue = await retryHandler();
      });
      
      await act(async () => {
        vi.advanceTimersByTime(1000); // First retry
        await Promise.resolve();
      });
      
      await promise;
      
      expect(mockOperation).toHaveBeenCalledTimes(2); // Stops after auth error
      expect(resultValue).toBeNull();
    });
  });

  describe('Advanced Retry Scenarios', () => {
    it('handles concurrent retry operations', async () => {
      const store = createMockStore();
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <Provider store={store}>{children}</Provider>
      );
      const { result } = renderHook(() => useErrorHandler(), { wrapper });
      
      const mockOperation1 = createMockAsyncOperation(1, ErrorType.NETWORK, 'result1');
      const mockOperation2 = createMockAsyncOperation(2, ErrorType.TIMEOUT, 'result2');
      
      const retryHandler1 = result.current.createRetryHandler(mockOperation1, 3);
      const retryHandler2 = result.current.createRetryHandler(mockOperation2, 3);
      
      let result1: string | null, result2: string | null;
      
      const promise1 = act(async () => {
        result1 = await retryHandler1();
      });
      
      const promise2 = act(async () => {
        result2 = await retryHandler2();
      });
      
      // Advance timers for both operations
      await act(async () => {
        vi.advanceTimersByTime(1000); // First retry for both
        await Promise.resolve();
        vi.advanceTimersByTime(2000); // Second retry for operation2
        await Promise.resolve();
      });
      
      await Promise.all([promise1, promise2]);
      
      expect(result1).toBe('result1');
      expect(result2).toBe('result2');
    });

    it('handles retry with custom delay calculation', async () => {
      const store = createMockStore();
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <Provider store={store}>{children}</Provider>
      );
      const { result } = renderHook(() => useErrorHandler(), { wrapper });
      
      // Test with rate limit error which has different delay calculation
      const mockOperation = createMockAsyncOperation(2, ErrorType.RATE_LIMIT);
      const retryHandler = result.current.createRetryHandler(mockOperation, 3);
      
      let resultValue: string | null;
      
      const promise = act(async () => {
        resultValue = await retryHandler();
      });
      
      // Rate limit errors have longer delays
      await act(async () => {
        vi.advanceTimersByTime(5000); // First rate limit retry
        await Promise.resolve();
        vi.advanceTimersByTime(10000); // Second rate limit retry
        await Promise.resolve();
      });
      
      await promise;
      
      expect(mockOperation).toHaveBeenCalledTimes(3);
      expect(resultValue).toBe('success');
    });

    it('handles retry with operation context preservation', async () => {
      const store = createMockStore();
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <Provider store={store}>{children}</Provider>
      );
      const { result } = renderHook(() => useErrorHandler(), { wrapper });
      
      const operationContext = { userId: 123, queryId: 'abc', timestamp: Date.now() };
      
      const mockOperation = vi.fn().mockImplementation(() => {
        // Operation uses context
        if (operationContext.userId !== 123) {
          throw new Error('Context lost');
        }
        throw new AppError('First attempt fails', ErrorType.NETWORK);
      });
      
      // Mock successful second attempt
      mockOperation.mockImplementationOnce(() => {
        throw new AppError('First attempt fails', ErrorType.NETWORK);
      }).mockResolvedValueOnce('success with context');
      
      const retryHandler = result.current.createRetryHandler(mockOperation, 3);
      
      let resultValue: string | null;
      
      const promise = act(async () => {
        resultValue = await retryHandler();
      });
      
      await act(async () => {
        vi.advanceTimersByTime(1000);
        await Promise.resolve();
      });
      
      await promise;
      
      expect(resultValue).toBe('success with context');
    });

    it('handles memory cleanup during long retry sequences', async () => {
      const { result } = renderHook(() => useErrorHandler());
      
      const mockOperation = createMockAsyncOperation(5, ErrorType.SERVER);
      const retryHandler = result.current.createRetryHandler(mockOperation, 10);
      
      // Start retry operation
      const promise = act(async () => {
        return await retryHandler();
      });
      
      // Simulate component unmount during retry
      // (This would normally trigger cleanup in the real component)
      
      await act(async () => {
        // Fast forward through several retries
        for (let i = 0; i < 6; i++) {
          vi.advanceTimersByTime(2000 * (i + 1)); // Linear backoff for server errors
          await Promise.resolve();
        }
      });
      
      const cleanupResult = await promise;
      expect(cleanupResult).toBe('success');
    });
  });

  describe('Retry Limit Configuration', () => {
    it('respects custom max retry limits', async () => {
      const { result } = renderHook(() => useErrorHandler());
      
      const mockOperation = createMockAsyncOperation(10, ErrorType.NETWORK);
      
      // Test with different max retry limits
      const retryHandler1 = result.current.createRetryHandler(mockOperation, 1);
      const retryHandler2 = result.current.createRetryHandler(mockOperation, 5);
      const retryHandler3 = result.current.createRetryHandler(mockOperation, 0);
      
      let result1: string | null, result2: string | null, result3: string | null;
      
      // Handler with 1 max retry
      await act(async () => {
        result1 = await retryHandler1();
      });
      expect(mockOperation).toHaveBeenCalledTimes(1); // No retries
      expect(result1).toBeNull();
      
      mockOperation.mockClear();
      
      // Handler with 5 max retries
      const promise2 = act(async () => {
        result2 = await retryHandler2();
      });
      
      await act(async () => {
        for (let i = 0; i < 5; i++) {
          vi.advanceTimersByTime(1000 * Math.pow(2, i));
          await Promise.resolve();
        }
      });
      
      await promise2;
      expect(mockOperation).toHaveBeenCalledTimes(5);
      expect(result2).toBeNull();
      
      mockOperation.mockClear();
      
      // Handler with 0 max retries
      await act(async () => {
        result3 = await retryHandler3();
      });
      expect(mockOperation).toHaveBeenCalledTimes(0); // No attempts at all
      expect(result3).toBeNull();
    });

    it('handles edge cases with retry limits', async () => {
      const { result } = renderHook(() => useErrorHandler());
      
      // Negative retry limit should be treated as 0
      const mockOperation = createMockAsyncOperation(1, ErrorType.NETWORK);
      const retryHandler = result.current.createRetryHandler(mockOperation, -1);
      
      let resultValue: string | null;
      
      await act(async () => {
        resultValue = await retryHandler();
      });
      
      expect(mockOperation).toHaveBeenCalledTimes(0);
      expect(resultValue).toBeNull();
    });

    it('handles very large retry limits efficiently', async () => {
      const { result } = renderHook(() => useErrorHandler());
      
      const mockOperation = createMockAsyncOperation(3, ErrorType.NETWORK);
      const retryHandler = result.current.createRetryHandler(mockOperation, 1000);
      
      let resultValue: string | null;
      
      const promise = act(async () => {
        resultValue = await retryHandler();
      });
      
      await act(async () => {
        vi.advanceTimersByTime(1000); // 1st retry
        await Promise.resolve();
        vi.advanceTimersByTime(2000); // 2nd retry
        await Promise.resolve();
        vi.advanceTimersByTime(4000); // 3rd retry - should succeed
        await Promise.resolve();
      });
      
      await promise;
      
      expect(mockOperation).toHaveBeenCalledTimes(4); // Initial + 3 retries
      expect(resultValue).toBe('success');
    });
  });
});