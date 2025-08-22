/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import React, { useCallback } from 'react';
import { message } from 'antd';
import { useAppDispatch } from '@/store';
import { parseError, getUserFriendlyMessage, isRetryableError, getRecoveryGuidance, AppError } from '@/utils/errorHandler';

/**
 * Custom hook for handling errors in components
 */
export function useErrorHandler() {
  const dispatch = useAppDispatch();

  /**
   * Handle error with optional retry callback
   */
  const handleError = useCallback((
    error: unknown,
    options?: {
      showNotification?: boolean;
      retryCallback?: () => void;
      context?: string;
    }
  ) => {
    const { showNotification = true, retryCallback, context } = options || {};
    
    // Parse the error
    const appError = parseError(error);
    
    // Get user-friendly message
    const userMessage = getUserFriendlyMessage(appError);
    
    // Show notification if enabled
    if (showNotification) {
      if (isRetryableError(appError) && retryCallback) {
        // Show error with retry option
        message.error({
          content: userMessage,
          duration: 5,
          key: 'error-notification',
          onClick: () => {
            message.destroy('error-notification');
            retryCallback();
          },
          style: { cursor: 'pointer' }
        });
      } else {
        // Show regular error
        message.error(userMessage);
      }
    }

    // Return the parsed error for further handling
    return appError;
  }, []);

  /**
   * Handle async operations with error handling
   */
  const handleAsync = useCallback(async <T,>(
    asyncFn: () => Promise<T>,
    options?: {
      showNotification?: boolean;
      retryCallback?: () => void;
      context?: string;
      onError?: (error: AppError) => void;
      onSuccess?: (result: T) => void;
    }
  ): Promise<T | null> => {
    try {
      const result = await asyncFn();
      options?.onSuccess?.(result);
      return result;
    } catch (error) {
      const appError = handleError(error, {
        showNotification: options?.showNotification,
        retryCallback: options?.retryCallback,
        context: options?.context
      });
      
      options?.onError?.(appError);
      return null;
    }
  }, [handleError]);

  /**
   * Create a retry handler with exponential backoff
   */
  const createRetryHandler = useCallback(<T,>(
    asyncFn: () => Promise<T>,
    maxAttempts = 3
  ) => {
    let attempts = 0;
    
    const retry = async (): Promise<T | null> => {
      attempts++;
      
      try {
        return await asyncFn();
      } catch (error) {
        const appError = parseError(error);
        
        if (isRetryableError(appError) && attempts < maxAttempts) {
          // Wait before retrying
          const delay = Math.min(1000 * Math.pow(2, attempts - 1), 10000);
          await new Promise(resolve => setTimeout(resolve, delay));
          
          // Retry
          return retry();
        }
        
        // Max attempts reached or non-retryable error
        handleError(error, {
          showNotification: true,
          context: `After ${attempts} attempts`
        });
        
        return null;
      }
    };
    
    return retry;
  }, [handleError]);

  /**
   * Enhanced preview error handler with automatic retry and recovery guidance
   */
  const handlePreviewError = useCallback((
    error: unknown,
    options?: {
      showNotification?: boolean;
      retryCallback?: () => Promise<void>;
      onGoBack?: () => void;
      context?: string;
      maxRetries?: number;
      enableAutoRetry?: boolean;
    }
  ) => {
    const { 
      showNotification = true, 
      retryCallback, 
      onGoBack,
      context = 'Preview',
      maxRetries = 3,
      enableAutoRetry = true
    } = options || {};
    
    // Parse the error
    const appError = parseError(error);
    
    // Log error with context
    console.error(`Preview Error [${context}]:`, appError);
    
    // Get user-friendly message
    const userMessage = getUserFriendlyMessage(appError);
    
    // Show enhanced notification for preview errors
    if (showNotification) {
      if (isRetryableError(appError) && retryCallback && enableAutoRetry) {
        // Show enhanced error notification with retry and recovery options
        const getContextualMessage = () => {
          switch (appError.type) {
            case 'TIMEOUT':
              return 'Try reducing filters or selected fields';
            case 'NETWORK':
              return 'Check your connection and try again';
            case 'RATE_LIMIT':
              return `Wait ${appError.retryAfter || '60'} seconds before retrying`;
            case 'SERVER':
              return 'Server issue - please try again in a moment';
            default:
              return '';
          }
        };

        message.error({
          content: React.createElement('div', {},
            React.createElement('div', { style: { marginBottom: 8 } }, userMessage),
            React.createElement('div', { style: { fontSize: '12px', opacity: 0.8 } }, getContextualMessage())
          ),
          duration: 8,
          key: 'preview-error-notification',
          onClick: () => {
            message.destroy('preview-error-notification');
            retryCallback();
          },
          style: { cursor: 'pointer' }
        });
      } else if (appError.type === 'VALIDATION' || appError.type === 'QUERY_VALIDATION') {
        // Show validation error with go back option
        message.error({
          content: React.createElement('div', {},
            React.createElement('div', { style: { marginBottom: 8 } }, userMessage),
            React.createElement('div', { style: { fontSize: '12px', opacity: 0.8 } }, 'Click to go back and fix the configuration')
          ),
          duration: 10,
          key: 'preview-validation-error',
          onClick: () => {
            message.destroy('preview-validation-error');
            if (onGoBack) onGoBack();
          },
          style: { cursor: 'pointer' }
        });
      } else {
        // Show regular error
        message.error(userMessage);
      }
    }

    // Return the parsed error with additional preview context
    // Ensure all original AppError properties are preserved
    const enhancedError = {
      ...appError,
      message: appError.message || getUserFriendlyMessage(appError), // Ensure message property is always present
      context,
      canRetry: isRetryableError(appError),
      maxRetries,
      recoveryGuidance: getRecoveryGuidance(appError)
    };
    
    return enhancedError;
  }, []);

  /**
   * Create an enhanced retry handler specifically for preview operations
   */
  const createPreviewRetryHandler = useCallback(<T,>(
    asyncFn: () => Promise<T>,
    options?: {
      maxAttempts?: number;
      context?: string;
      onProgress?: (attempt: number, error: AppError) => void;
      onSuccess?: (result: T, attempts: number) => void;
      onFailure?: (finalError: AppError, attempts: number) => void;
    }
  ) => {
    const { 
      maxAttempts = 3, 
      context = 'Preview',
      onProgress,
      onSuccess,
      onFailure
    } = options || {};
    
    let attempts = 0;
    
    const retry = async (): Promise<T | null> => {
      attempts++;
      
      try {
        const result = await asyncFn();
        
        // Call success callback
        if (onSuccess) {
          onSuccess(result, attempts);
        }
        
        return result;
      } catch (error) {
        const appError = parseError(error);
        
        // Call progress callback
        if (onProgress) {
          onProgress(attempts, appError);
        }
        
        // Check if we should retry
        if (isRetryableError(appError) && attempts < maxAttempts) {
          // Calculate delay with exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempts - 1), 8000);
          
          console.log(`Retrying ${context} operation in ${delay}ms (attempt ${attempts}/${maxAttempts})`);
          
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, delay));
          
          // Retry
          return retry();
        }
        
        // Max attempts reached or non-retryable error
        console.error(`${context} operation failed after ${attempts} attempts:`, appError);
        
        // Call failure callback
        if (onFailure) {
          onFailure(appError, attempts);
        }
        
        // Show final error message
        handleError(error, {
          showNotification: true,
          context: `${context} - Failed after ${attempts} attempts`
        });
        
        return null;
      }
    };
    
    return retry;
  }, [handleError]);

  /**
   * Handle preview operation with comprehensive error handling and recovery
   */
  const handlePreviewOperation = useCallback(async <T,>(
    operation: () => Promise<T>,
    options?: {
      context?: string;
      maxRetries?: number;
      enableAutoRetry?: boolean;
      onRetry?: () => void;
      onGoBack?: () => void;
      onSuccess?: (result: T) => void;
      onError?: (error: AppError & { context?: string; canRetry?: boolean; maxRetries?: number; recoveryGuidance?: string }) => void;
      showNotification?: boolean;
    }
  ): Promise<T | null> => {
    const {
      context = 'Preview',
      maxRetries = 3,
      enableAutoRetry = true,
      onRetry,
      onGoBack,
      onSuccess,
      onError,
      showNotification = true
    } = options || {};

    try {
      const result = await operation();
      
      if (onSuccess) {
        onSuccess(result);
      }
      
      return result;
    } catch (error) {
      const enhancedError = handlePreviewError(error, {
        showNotification,
        retryCallback: onRetry,
        onGoBack,
        context,
        maxRetries,
        enableAutoRetry
      });
      
      if (onError) {
        onError(enhancedError);
      }
      
      return null;
    }
  }, [handlePreviewError]);

  return {
    handleError,
    handleAsync,
    createRetryHandler,
    // Enhanced preview-specific methods
    handlePreviewError,
    createPreviewRetryHandler,
    handlePreviewOperation
  };
}

/**
 * Hook for handling form validation errors
 */
export function useFormErrorHandler() {
  const { handleError } = useErrorHandler();

  const handleFormError = useCallback((error: unknown, form?: any) => {
    const appError = handleError(error, { showNotification: false });
    
    // If it's a validation error with field details, set form errors
    if (appError.details && form && typeof appError.details === 'object') {
      const fieldErrors = Object.entries(appError.details).map(([field, error]) => ({
        name: field,
        errors: Array.isArray(error) ? error : [String(error)]
      }));
      
      form.setFields(fieldErrors);
    } else {
      // Show general error message
      const friendlyMessage = getUserFriendlyMessage(appError);
      message.error(friendlyMessage);
    }
  }, [handleError]);

  return { handleFormError };
}