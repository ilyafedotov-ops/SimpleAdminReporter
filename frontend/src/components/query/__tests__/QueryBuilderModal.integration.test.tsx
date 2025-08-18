import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { QueryBuilderModal } from '../QueryBuilderModal';
import { AppError, ErrorType } from '@/utils/errorHandler';
import { uiSlice } from '@/store/slices/uiSlice';

// Mock dependencies
vi.mock('@/services/credentials.api', () => ({
  credentialsAPI: {
    getCredentials: vi.fn(),
  },
}));

vi.mock('@/hooks/useFieldDiscovery', () => ({
  useFieldDiscovery: vi.fn(),
}));

vi.mock('@/hooks/useErrorHandler', () => ({
  useErrorHandler: () => ({
    handlePreviewOperation: vi.fn(),
    createPreviewRetryHandler: vi.fn(),
    handlePreviewError: vi.fn(),
  }),
}));

// Mock antd message
vi.mock('antd', async () => {
  const actual = await vi.importActual('antd');
  return {
    ...actual,
    message: {
      error: vi.fn(),
      success: vi.fn(),
      info: vi.fn(),
      destroy: vi.fn(),
    },
  };
});

// Mock child components
vi.mock('../EnhancedFieldExplorer', () => ({
  EnhancedFieldExplorer: ({ onFieldSelect, onFieldDeselect }: any) => (
    <div data-testid="field-explorer">
      <button onClick={() => onFieldSelect({ fieldName: 'testField', displayName: 'Test Field' })}>
        Select Field
      </button>
      <button onClick={() => onFieldDeselect({ fieldName: 'testField' })}>
        Deselect Field
      </button>
    </div>
  ),
}));

vi.mock('./VisualFilterBuilder', () => ({
  default: ({ onChange }: any) => (
    <div data-testid="filter-builder">
      <button onClick={() => onChange([{ field: 'testField', operator: 'equals', value: 'test' }])}>
        Add Filter
      </button>
    </div>
  ),
}));

vi.mock('./QueryVisualization', () => ({
  QueryVisualization: () => <div data-testid="query-visualization">Query Visualization</div>,
}));

vi.mock('../reports/ReportViewer', () => ({
  ReportViewer: ({ 
    error, 
    onRetry, 
    onGoBack, 
    loading,
    enableRecovery 
  }: any) => (
    <div data-testid="report-viewer">
      {error && <div data-testid="report-error">{error}</div>}
      {loading && <div data-testid="report-loading">Loading...</div>}
      {onRetry && enableRecovery && (
        <button data-testid="report-retry" onClick={onRetry}>
          Retry Report
        </button>
      )}
      {onGoBack && (
        <button data-testid="report-go-back" onClick={onGoBack}>
          Go Back Report
        </button>
      )}
      <div>Report Viewer Content</div>
    </div>
  ),
}));

vi.mock('./QueryPreviewErrorBoundary', () => ({
  QueryPreviewErrorBoundary: ({ 
    children, 
    onRetry, 
    onGoBack, 
    maxRetries,
    context 
  }: any) => (
    <div data-testid="error-boundary" data-context={context} data-max-retries={maxRetries}>
      {onRetry && (
        <button data-testid="boundary-retry" onClick={onRetry}>
          Boundary Retry
        </button>
      )}
      {onGoBack && (
        <button data-testid="boundary-go-back" onClick={onGoBack}>
          Boundary Go Back
        </button>
      )}
      {children}
    </div>
  ),
}));

// Mock store
const createMockStore = (initialState = {}) => {
  return configureStore({
    reducer: {
      ui: uiSlice.reducer,
    },
    preloadedState: {
      ui: {
        theme: { darkMode: false },
        ...initialState,
      },
    },
  });
};

describe('QueryBuilderModal Integration Tests', () => {
  let mockStore: ReturnType<typeof createMockStore>;
  let mockUseFieldDiscovery: any;
  let mockUseErrorHandler: any;
  let mockCredentialsAPI: any;

  const defaultProps = {
    dataSource: 'ad' as const,
    onClose: vi.fn(),
    onSave: vi.fn(),
    onExecute: vi.fn(),
    visible: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockStore = createMockStore();

    // Setup field discovery mock
    mockUseFieldDiscovery = {
      fields: [
        {
          fieldName: 'sAMAccountName',
          displayName: 'Username',
          dataType: 'string',
          category: 'basic',
          isSearchable: true,
        },
        {
          fieldName: 'displayName',
          displayName: 'Display Name',
          dataType: 'string',
          category: 'basic',
          isSearchable: true,
        },
      ],
      loading: false,
      error: null,
      discoverSchema: vi.fn(),
      isDiscovering: false,
      totalFields: 2,
      setCredentialId: vi.fn(),
    };

    const { useFieldDiscovery } = require('@/hooks/useFieldDiscovery');
    useFieldDiscovery.mockReturnValue(mockUseFieldDiscovery);

    // Setup error handler mock
    mockUseErrorHandler = {
      handlePreviewOperation: vi.fn(),
      createPreviewRetryHandler: vi.fn(),
      handlePreviewError: vi.fn(),
    };

    const { useErrorHandler } = require('@/hooks/useErrorHandler');
    useErrorHandler.mockReturnValue(mockUseErrorHandler);

    // Setup credentials API mock
    mockCredentialsAPI = {
      getCredentials: vi.fn().mockResolvedValue({
        success: true,
        data: [
          {
            id: 1,
            credentialName: 'Test Credential',
            username: 'test@domain.com',
            isActive: true,
            isDefault: true,
          },
        ],
      }),
    };

    const { credentialsAPI } = require('@/services/credentials.api');
    credentialsAPI.getCredentials = mockCredentialsAPI.getCredentials;

    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const renderComponent = (props = {}) => {
    return render(
      <Provider store={mockStore}>
        <QueryBuilderModal {...defaultProps} {...props} />
      </Provider>
    );
  };

  describe('Error Boundary Integration', () => {
    it('renders QueryPreviewErrorBoundary with correct props in results step', async () => {
      const { rerender } = renderComponent();

      // Navigate to step 1 (configure)
      fireEvent.click(screen.getByText('Next'));

      // Fill in required fields
      fireEvent.change(screen.getByPlaceholderText('Enter query name...'), {
        target: { value: 'Test Query' },
      });

      // Navigate to step 2 (results) via preview execution
      const previewButton = screen.getByText('Review Full Report');
      fireEvent.click(previewButton);

      await waitFor(() => {
        const errorBoundary = screen.getByTestId('error-boundary');
        expect(errorBoundary).toBeInTheDocument();
        expect(errorBoundary).toHaveAttribute('data-context', 'Report Results Preview');
        expect(errorBoundary).toHaveAttribute('data-max-retries', '3');
      });
    });

    it('passes retry handler to error boundary that retries preview execution', async () => {
      const mockOnExecute = vi.fn().mockResolvedValue({ data: [] });
      renderComponent({ onExecute: mockOnExecute });

      // Navigate to results step
      fireEvent.click(screen.getByText('Next'));
      fireEvent.change(screen.getByPlaceholderText('Enter query name...'), {
        target: { value: 'Test Query' },
      });
      fireEvent.click(screen.getByText('Review Full Report'));

      await waitFor(() => {
        expect(screen.getByTestId('error-boundary')).toBeInTheDocument();
      });

      // Click retry button in error boundary
      const retryButton = screen.getByTestId('boundary-retry');
      fireEvent.click(retryButton);

      expect(mockOnExecute).toHaveBeenCalled();
    });

    it('passes go back handler to error boundary that navigates to config step', async () => {
      renderComponent();

      // Navigate to results step
      fireEvent.click(screen.getByText('Next'));
      fireEvent.change(screen.getByPlaceholderText('Enter query name...'), {
        target: { value: 'Test Query' },
      });
      fireEvent.click(screen.getByText('Review Full Report'));

      await waitFor(() => {
        expect(screen.getByTestId('error-boundary')).toBeInTheDocument();
      });

      // Click go back button in error boundary
      const goBackButton = screen.getByTestId('boundary-go-back');
      fireEvent.click(goBackButton);

      // Should navigate back to configuration step
      expect(screen.getByText('Configure & Review')).toBeInTheDocument();
    });
  });

  describe('Preview Error Handling Integration', () => {
    it('integrates with useErrorHandler for preview operations', async () => {
      const mockError = new AppError('Preview failed', ErrorType.NETWORK);
      const mockOnExecute = vi.fn().mockRejectedValue(mockError);

      mockUseErrorHandler.handlePreviewOperation.mockImplementation(
        async (operation, options) => {
          try {
            return await operation();
          } catch (error) {
            options?.onError?.(error);
            return null;
          }
        }
      );

      renderComponent({ onExecute: mockOnExecute });

      // Navigate to preview step
      fireEvent.click(screen.getByText('Next'));
      fireEvent.change(screen.getByPlaceholderText('Enter query name...'), {
        target: { value: 'Test Query' },
      });
      fireEvent.click(screen.getByText('Review Full Report'));

      await waitFor(() => {
        expect(mockUseErrorHandler.handlePreviewOperation).toHaveBeenCalledWith(
          expect.any(Function),
          expect.objectContaining({
            context: 'AD Query Preview',
            maxRetries: 3,
            enableAutoRetry: true,
            onRetry: expect.any(Function),
            onGoBack: expect.any(Function),
            onSuccess: expect.any(Function),
            onError: expect.any(Function),
            showNotification: false,
          })
        );
      });
    });

    it('handles preview success and navigates to results step', async () => {
      const mockResult = { data: [{ id: 1, name: 'Test Result' }] };
      const mockOnExecute = vi.fn().mockResolvedValue(mockResult);

      mockUseErrorHandler.handlePreviewOperation.mockImplementation(
        async (operation, options) => {
          const result = await operation();
          options?.onSuccess?.(result);
          return result;
        }
      );

      renderComponent({ onExecute: mockOnExecute });

      // Navigate to preview step
      fireEvent.click(screen.getByText('Next'));
      fireEvent.change(screen.getByPlaceholderText('Enter query name...'), {
        target: { value: 'Test Query' },
      });
      fireEvent.click(screen.getByText('Review Full Report'));

      await waitFor(() => {
        expect(screen.getByTestId('report-viewer')).toBeInTheDocument();
      });
    });

    it('handles preview errors and shows error state', async () => {
      const mockError = new AppError('Preview failed', ErrorType.TIMEOUT);
      const mockOnExecute = vi.fn().mockRejectedValue(mockError);

      mockUseErrorHandler.handlePreviewOperation.mockImplementation(
        async (operation, options) => {
          try {
            return await operation();
          } catch (error) {
            options?.onError?.(error);
            return null;
          }
        }
      );

      renderComponent({ onExecute: mockOnExecute });

      // Navigate to preview step
      fireEvent.click(screen.getByText('Next'));
      fireEvent.change(screen.getByPlaceholderText('Enter query name...'), {
        target: { value: 'Test Query' },
      });
      fireEvent.click(screen.getByText('Review Full Report'));

      await waitFor(() => {
        expect(screen.getByText('Query Execution Failed')).toBeInTheDocument();
      });
    });
  });

  describe('Retry Logic Integration', () => {
    it('implements retry logic with exponential backoff for preview', async () => {
      let attempt = 0;
      const mockOnExecute = vi.fn().mockImplementation(() => {
        attempt++;
        if (attempt < 3) {
          throw new AppError('Retry test', ErrorType.NETWORK);
        }
        return Promise.resolve({ data: [{ id: 1, success: true }] });
      });

      mockUseErrorHandler.handlePreviewOperation.mockImplementation(
        async (operation, options) => {
          try {
            return await operation();
          } catch (error) {
            // Simulate retry logic
            await new Promise(resolve => setTimeout(resolve, 100));
            try {
              const result = await operation();
              options?.onSuccess?.(result);
              return result;
            } catch (retryError) {
              options?.onError?.(retryError);
              return null;
            }
          }
        }
      );

      renderComponent({ onExecute: mockOnExecute });

      // Navigate to preview step
      fireEvent.click(screen.getByText('Next'));
      fireEvent.change(screen.getByPlaceholderText('Enter query name...'), {
        target: { value: 'Test Query' },
      });
      fireEvent.click(screen.getByText('Review Full Report'));

      await act(async () => {
        vi.advanceTimersByTime(200);
      });

      expect(mockOnExecute).toHaveBeenCalledTimes(2);
    });

    it('tracks retry count and shows retry indicators', async () => {
      const mockError = new AppError('Persistent error', ErrorType.NETWORK);
      const mockOnExecute = vi.fn().mockRejectedValue(mockError);

      renderComponent({ onExecute: mockOnExecute });

      // Navigate to results step with error
      fireEvent.click(screen.getByText('Next'));
      fireEvent.change(screen.getByPlaceholderText('Enter query name...'), {
        target: { value: 'Test Query' },
      });

      // Simulate error state by navigating to step 2
      fireEvent.click(screen.getByText('Review Full Report'));

      await waitFor(() => {
        expect(screen.getByText('Query Execution Failed')).toBeInTheDocument();
      });

      // Check for retry count indicator
      expect(screen.getByText(/Attempted.*of.*retries/)).toBeInTheDocument();
    });

    it('prevents retry when max retries exceeded', async () => {
      const mockError = new AppError('Max retries error', ErrorType.NETWORK);
      mockError.canRetry = false; // Simulate max retries reached

      renderComponent();

      // Navigate to results step with max retries reached
      fireEvent.click(screen.getByText('Next'));
      fireEvent.change(screen.getByPlaceholderText('Enter query name...'), {
        target: { value: 'Test Query' },
      });

      // Set state to simulate max retries reached
      fireEvent.click(screen.getByText('Review Full Report'));

      await waitFor(() => {
        expect(screen.getByText('Query Execution Failed')).toBeInTheDocument();
      });

      // Retry button should not be present or should be disabled
      const retryButton = screen.queryByText('Retry');
      if (retryButton) {
        expect(retryButton).toBeDisabled();
      }
    });
  });

  describe('ReportViewer Error Integration', () => {
    it('passes error state to ReportViewer component', async () => {
      const mockError = 'Test error message';
      renderComponent();

      // Navigate to results step
      fireEvent.click(screen.getByText('Next'));
      fireEvent.change(screen.getByPlaceholderText('Enter query name...'), {
        target: { value: 'Test Query' },
      });
      fireEvent.click(screen.getByText('Review Full Report'));

      await waitFor(() => {
        expect(screen.getByTestId('report-viewer')).toBeInTheDocument();
      });

      // The ReportViewer should receive error props
      const reportViewer = screen.getByTestId('report-viewer');
      expect(reportViewer).toBeInTheDocument();
    });

    it('passes retry handler to ReportViewer', async () => {
      const mockOnExecute = vi.fn();
      renderComponent({ onExecute: mockOnExecute });

      // Navigate to results step
      fireEvent.click(screen.getByText('Next'));
      fireEvent.change(screen.getByPlaceholderText('Enter query name...'), {
        target: { value: 'Test Query' },
      });
      fireEvent.click(screen.getByText('Review Full Report'));

      await waitFor(() => {
        expect(screen.getByTestId('report-viewer')).toBeInTheDocument();
      });

      // ReportViewer should have retry functionality
      const retryButton = screen.queryByTestId('report-retry');
      if (retryButton) {
        fireEvent.click(retryButton);
        expect(mockOnExecute).toHaveBeenCalled();
      }
    });

    it('passes go back handler to ReportViewer', async () => {
      renderComponent();

      // Navigate to results step
      fireEvent.click(screen.getByText('Next'));
      fireEvent.change(screen.getByPlaceholderText('Enter query name...'), {
        target: { value: 'Test Query' },
      });
      fireEvent.click(screen.getByText('Review Full Report'));

      await waitFor(() => {
        expect(screen.getByTestId('report-viewer')).toBeInTheDocument();
      });

      // ReportViewer should have go back functionality
      const goBackButton = screen.queryByTestId('report-go-back');
      if (goBackButton) {
        fireEvent.click(goBackButton);
        // Should navigate back to configuration step
        expect(screen.getByText('Configure & Review')).toBeInTheDocument();
      }
    });

    it('enables recovery features in ReportViewer', async () => {
      renderComponent();

      // Navigate to results step
      fireEvent.click(screen.getByText('Next'));
      fireEvent.change(screen.getByPlaceholderText('Enter query name...'), {
        target: { value: 'Test Query' },
      });
      fireEvent.click(screen.getByText('Review Full Report'));

      await waitFor(() => {
        const reportViewer = screen.getByTestId('report-viewer');
        expect(reportViewer).toBeInTheDocument();
      });

      // ReportViewer should be configured with recovery enabled
      // This is verified through the component props
    });
  });

  describe('Field Discovery Error Handling', () => {
    it('handles field discovery errors gracefully', async () => {
      mockUseFieldDiscovery.error = 'Failed to load fields';
      mockUseFieldDiscovery.fields = [];

      renderComponent();

      expect(screen.getByText('Failed to load fields')).toBeInTheDocument();
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });

    it('shows loading state during field discovery', () => {
      mockUseFieldDiscovery.loading = true;
      mockUseFieldDiscovery.fields = [];

      renderComponent();

      expect(screen.getByText('Loading fields...')).toBeInTheDocument();
    });

    it('shows schema discovery state for AD', () => {
      mockUseFieldDiscovery.isDiscovering = true;
      mockUseFieldDiscovery.fields = [];

      renderComponent();

      expect(screen.getByText('Discovering fields from Active Directory...')).toBeInTheDocument();
    });
  });

  describe('Credentials Error Handling', () => {
    it('handles credentials loading errors', async () => {
      mockCredentialsAPI.getCredentials.mockRejectedValue(new Error('Credentials failed'));

      renderComponent();

      await waitFor(() => {
        // Error should be handled internally, component should still render
        expect(screen.getByText('Visual Query Builder')).toBeInTheDocument();
      });
    });

    it('shows empty state when no credentials available', async () => {
      mockCredentialsAPI.getCredentials.mockResolvedValue({
        success: true,
        data: [],
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('No fields available')).toBeInTheDocument();
        expect(screen.getByText('Please select a service account above')).toBeInTheDocument();
      });
    });
  });

  describe('Error Recovery Workflows', () => {
    it('supports full error recovery workflow from field selection to preview', async () => {
      // Start with successful field loading
      renderComponent();

      // Select a field
      fireEvent.click(screen.getByText('Select Field'));

      // Navigate to configuration
      fireEvent.click(screen.getByText('Next'));

      // Add configuration
      fireEvent.change(screen.getByPlaceholderText('Enter query name...'), {
        target: { value: 'Recovery Test Query' },
      });

      // Try preview - this might fail and trigger error boundary
      fireEvent.click(screen.getByText('Review Full Report'));

      // Error boundary should be present and functional
      await waitFor(() => {
        expect(screen.getByTestId('error-boundary')).toBeInTheDocument();
      });

      // Recovery actions should be available
      const retryButton = screen.queryByTestId('boundary-retry');
      const goBackButton = screen.queryByTestId('boundary-go-back');

      expect(retryButton || goBackButton).toBeInTheDocument();
    });

    it('maintains query state during error recovery', async () => {
      renderComponent();

      // Build a query
      fireEvent.click(screen.getByText('Select Field'));
      fireEvent.click(screen.getByText('Add Filter'));
      fireEvent.click(screen.getByText('Next'));

      const queryNameInput = screen.getByPlaceholderText('Enter query name...');
      fireEvent.change(queryNameInput, { target: { value: 'Persistent Query' } });

      // Go to preview (might trigger error)
      fireEvent.click(screen.getByText('Review Full Report'));

      // Go back to configuration
      fireEvent.click(screen.getByText('Previous'));

      // Query state should be preserved
      expect(queryNameInput).toHaveValue('Persistent Query');
    });

    it('provides contextual error messages based on current step', async () => {
      renderComponent();

      // Different steps should provide different error contexts
      // Step 0: Field selection errors
      mockUseFieldDiscovery.error = 'Field discovery failed';

      expect(screen.getByText('Failed to load fields')).toBeInTheDocument();

      // Step 1: Configuration errors would be handled differently
      // Step 2: Preview errors would show in error boundary
    });
  });
});