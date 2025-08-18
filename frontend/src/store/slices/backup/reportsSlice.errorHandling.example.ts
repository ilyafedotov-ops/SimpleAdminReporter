/**
 * Example of how to use the new error handling with Redux Toolkit
 * This file demonstrates best practices for error handling in async thunks
 */

import { createAsyncThunk } from '@reduxjs/toolkit';
import { reportsService } from '@/services/reportsService';
import { parseError, ErrorType } from '@/utils/errorHandler';

/**
 * Example: Enhanced executeReport thunk with proper error handling
 */
export const executeReportWithEnhancedErrorHandling = createAsyncThunk(
  'reports/executeReportEnhanced',
  async (
    params: { 
      templateId: string; 
      parameters?: Record<string, any>;
      credentialId?: number;
    }, 
    { rejectWithValue }
  ) => {
    try {
      const response = await reportsService.executeReport(
        params.templateId, 
        params.parameters, 
        params.credentialId
      );
      
      if (response.success && ((response as any).data)) {
        return ((response as any).data);
      } else {
        // Handle API-level failure
        const error = parseError(new Error(response.error || 'Report execution failed'));
        return rejectWithValue({
          message: ((error as any)?.message || String(error)),
          type: error.type,
          code: error.code,
          details: error.details
        });
      }
    } catch (error) {
      // Handle network/server errors
      const appError = parseError(error);
      
      // You can handle specific error types differently
      switch (appError.type) {
        case ErrorType.AUTHENTICATION:
          // Could dispatch a logout action here
          break;
        case ErrorType.RATE_LIMIT:
          // Could show a specific rate limit message
          break;
        case ErrorType.QUERY_VALIDATION:
          // Could highlight specific validation issues
          break;
      }
      
      return rejectWithValue({
        message: appError.message,
        type: appError.type,
        code: appError.code,
        details: appError.details
      });
    }
  }
);

/**
 * Example: Using the error handler in a React component
 */
import React from 'react';
import { useAppDispatch } from '@/store';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import { executeReportAsync } from '@/store/slices/reportsSlice';

export const ReportExecutorExample: React.FC = () => {
  const dispatch = useAppDispatch();
  const { handleAsync, createRetryHandler } = useErrorHandler();
  
  const executeReport = async (templateId: string) => {
    // Method 1: Using handleAsync for simple error handling
    await handleAsync(
      () => dispatch(executeReportAsync({ templateId, parameters: {} })).unwrap(),
      {
        showNotification: true,
        context: 'Report Execution',
        onSuccess: (result) => {
          console.log('Report executed successfully:', result);
        },
        onError: (error) => {
          console.error('Report execution failed:', error);
          
          // Handle specific error types
          if (error.type === ErrorType.QUERY_VALIDATION) {
            // Show validation errors in a special way
          }
        }
      }
    );
  };
  
  const executeReportWithRetry = async (templateId: string) => {
    // Method 2: Using retry handler for network-resilient operations
    const retryHandler = createRetryHandler(
      () => dispatch(executeReportAsync({ templateId, parameters: {} })).unwrap(),
      3 // max attempts
    );
    
    const result = await retryHandler();
    if (result) {
      console.log('Report executed after retry:', result);
    }
  };
  
  return (
    <div>
      <button onClick={() => executeReport('template_001')}>
        Execute Report
      </button>
      <button onClick={() => executeReportWithRetry('template_002')}>
        Execute with Retry
      </button>
    </div>
  );
};

/**
 * Example: Enhanced Redux slice with error handling
 */
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface ReportsStateWithError {
  // ... other state
  lastError: {
    message: string;
    type: string;
    code?: string;
    timestamp: string;
  } | null;
}

const enhancedReportsSlice = createSlice({
  name: 'reports',
  initialState: {
    lastError: null
  } as ReportsStateWithError,
  reducers: {
    clearError: (state) => {
      state.lastError = null;
    }
  },
  extraReducers: (builder) => {
    // Handle all rejected actions consistently
    builder.addMatcher(
      (action) => action.type.endsWith('/rejected'),
      (state, action: any) => {
        state.lastError = {
          message: action.payload?.message || 'An error occurred',
          type: action.payload?.type || ErrorType.UNKNOWN,
          code: action.payload?.code,
          timestamp: new Date().toISOString()
        };
      }
    );
  }
});

/**
 * Example: Using error handler in a form component
 */
import { Form, Button } from 'antd';
import { useFormErrorHandler } from '@/hooks/useErrorHandler';

export const ReportFormExample: React.FC = () => {
  const [form] = Form.useForm();
  const { handleFormError } = useFormErrorHandler();
  const dispatch = useAppDispatch();
  
  const handleSubmit = async (values: any) => {
    try {
      await dispatch(executeReportAsync({
        templateId: values.templateId,
        parameters: values.parameters
      })).unwrap();
      
      // Success
      form.resetFields();
    } catch (error) {
      // Form-specific error handling
      handleFormError(error, form);
    }
  };
  
  return (
    <Form form={form} onFinish={handleSubmit}>
      {/* Form fields */}
      <Button type="primary" htmlType="submit">
        Execute Report
      </Button>
    </Form>
  );
};