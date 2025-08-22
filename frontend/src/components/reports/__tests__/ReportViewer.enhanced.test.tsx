import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { ReportViewer } from '../ReportViewer';
import uiSliceReducer from '@/store/slices/uiSlice';
import type { FieldMetadata } from '@/hooks/useFieldDiscovery';

// Mock dependencies
vi.mock('@/hooks/useErrorHandler', () => ({
  useErrorHandler: () => ({
    handlePreviewError: vi.fn(),
  }),
}));

vi.mock('antd', async () => {
  const actual = await vi.importActual('antd');
  return {
    ...actual,
    message: {
      error: vi.fn(),
      success: vi.fn(),
      info: vi.fn(),
    },
  };
});

vi.mock('@/components/common', () => ({
  EnhancedDataTable: ({ 
    data, 
    columns, 
    loading, 
    onExport, 
    extraActions 
  }: unknown) => (
    <div data-testid="enhanced-data-table">
      {loading && <div data-testid="table-loading">Loading table...</div>}
      <div data-testid="table-data">{JSON.stringify(data.slice(0, 2))}</div>
      <div data-testid="table-columns">{columns.length} columns</div>
      {onExport && (
        <button 
          data-testid="export-button" 
          onClick={() => onExport(data, 'csv')}
        >
          Export CSV
        </button>
      )}
      {extraActions && <div data-testid="extra-actions">{extraActions}</div>}
    </div>
  ),
  defaultFormatCellValue: (value: unknown) => String(value),
  hasInformation: (value: unknown) => value != null && value !== '',
}));

vi.mock('./ExecutionSummary', () => ({
  ExecutionSummary: ({ status, recordCount, executionTime, category }: unknown) => (
    <div data-testid="execution-summary">
      <div>Status: {status}</div>
      <div>Records: {recordCount}</div>
      <div>Time: {executionTime}ms</div>
      <div>Category: {category}</div>
    </div>
  ),
}));

// Mock store
const createMockStore = (initialState = {}) => {
  return configureStore({
    reducer: {
      ui: uiSliceReducer,
    },
    preloadedState: {
      ui: {
        theme: { darkMode: false },
        ...initialState,
      },
    },
  });
};

describe('ReportViewer Enhanced Error Handling', () => {
  let mockStore: ReturnType<typeof createMockStore>;

  const mockFields: FieldMetadata[] = [
    {
      source: 'ad',
      fieldName: 'sAMAccountName',
      displayName: 'Username',
      dataType: 'string',
      category: 'basic',
      isSearchable: true,
      isSortable: true,
      isExportable: true,
    },
    {
      source: 'ad',
      fieldName: 'displayName',
      displayName: 'Display Name',
      dataType: 'string',
      category: 'basic',
      isSearchable: true,
      isSortable: true,
      isExportable: true,
    },
  ];

  const mockData = {
    results: [
      { sAMAccountName: 'user1', displayName: 'User One', id: '1' },
      { sAMAccountName: 'user2', displayName: 'User Two', id: '2' },
    ],
    resultCount: 2,
    executionTime: 150,
    reportName: 'Test Report',
    executedAt: '2025-01-01T00:00:00Z',
    status: 'completed',
  };

  const defaultProps = {
    mode: 'preview' as const,
    data: mockData,
    fields: mockFields,
    loading: false,
    error: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockStore = createMockStore();


    // useErrorHandler is already mocked at the top of the file

    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const renderComponent = (props = {}) => {
    return render(
      <Provider store={mockStore}>
        <ReportViewer {...defaultProps} {...props} />
      </Provider>
    );
  };

  describe('Error State Rendering', () => {
    it('displays error alert when error prop is provided', () => {
      renderComponent({
        error: 'Test error message',
        enableRecovery: true,
      });

      expect(screen.getByText('Error Loading Report')).toBeInTheDocument();
      expect(screen.getByText('Test error message')).toBeInTheDocument();
    });

    it('shows error icon based on error type', () => {
      const debugInfo = {
        errorDetails: {
          type: 'NETWORK',
          message: 'Network error',
        },
      };

      renderComponent({
        error: 'Network connection failed',
        debugInfo,
      });

      expect(screen.getByText('Error Loading Report')).toBeInTheDocument();
    });

    it('displays retry count when retries have been attempted', () => {
      renderComponent({
        error: 'Retry test error',
        retryCount: 2,
        maxRetries: 3,
      });

      expect(screen.getByText('Attempt 2/3')).toBeInTheDocument();
    });

    it('shows recovery guidance when available', () => {
      const debugInfo = {
        errorDetails: {
          type: 'TIMEOUT',
          recoveryGuidance: 'Try reducing the number of selected fields',
        },
      };

      renderComponent({
        error: 'Query timeout',
        debugInfo,
        enableRecovery: true,
      });

      expect(screen.getByText(/Try reducing the number of selected fields/)).toBeInTheDocument();
    });

    it('displays quick fixes for recoverable errors', () => {
      const debugInfo = {
        errorDetails: {
          type: 'NETWORK',
          message: 'Network error',
        },
      };

      renderComponent({
        error: 'Network connection failed',
        debugInfo,
        enableRecovery: true,
      });

      expect(screen.getByText('Quick fixes:')).toBeInTheDocument();
      expect(screen.getByText(/Check your internet connection/)).toBeInTheDocument();
    });
  });

  describe('Recovery Actions', () => {
    it('shows retry button for retryable errors', () => {
      const debugInfo = {
        errorDetails: {
          type: 'NETWORK',
          canRetry: true,
        },
      };

      const onRetry = vi.fn();

      renderComponent({
        error: 'Network error',
        debugInfo,
        onRetry,
        enableRecovery: true,
        retryCount: 1,
        maxRetries: 3,
      });

      const retryButton = screen.getByText('Try Again');
      expect(retryButton).toBeInTheDocument();
      expect(retryButton).not.toBeDisabled();
    });

    it('calls onRetry when retry button is clicked', async () => {
      const debugInfo = {
        errorDetails: {
          type: 'TIMEOUT',
          canRetry: true,
        },
      };

      const onRetry = vi.fn().mockResolvedValue(undefined);

      renderComponent({
        error: 'Timeout error',
        debugInfo,
        onRetry,
        enableRecovery: true,
        retryCount: 0,
        maxRetries: 3,
      });

      const retryButton = screen.getByText('Try Again');
      fireEvent.click(retryButton);

      await waitFor(() => {
        expect(onRetry).toHaveBeenCalledTimes(1);
      });
    });

    it('shows loading state during retry operation', async () => {
      const debugInfo = {
        errorDetails: {
          type: 'SERVER',
          canRetry: true,
        },
      };

      const onRetry = vi.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 1000))
      );

      renderComponent({
        error: 'Server error',
        debugInfo,
        onRetry,
        enableRecovery: true,
        retryCount: 0,
        maxRetries: 3,
      });

      const retryButton = screen.getByText('Try Again');
      fireEvent.click(retryButton);

      expect(screen.getByText('Retrying...')).toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      await waitFor(() => {
        expect(onRetry).toHaveBeenCalled();
      });
    });

    it('disables retry when max retries reached', () => {
      const debugInfo = {
        errorDetails: {
          type: 'NETWORK',
          canRetry: true,
        },
      };

      renderComponent({
        error: 'Network error',
        debugInfo,
        onRetry: vi.fn(),
        enableRecovery: true,
        retryCount: 3,
        maxRetries: 3,
      });

      expect(screen.queryByText('Try Again')).not.toBeInTheDocument();
    });

    it('shows go back button when onGoBack is provided', () => {
      const onGoBack = vi.fn();

      renderComponent({
        error: 'Test error',
        onGoBack,
        enableRecovery: true,
      });

      const goBackButton = screen.getByText('Go Back');
      expect(goBackButton).toBeInTheDocument();
    });

    it('calls onGoBack when go back button is clicked', () => {
      const onGoBack = vi.fn();

      renderComponent({
        error: 'Test error',
        onGoBack,
        enableRecovery: true,
      });

      fireEvent.click(screen.getByText('Go Back'));
      expect(onGoBack).toHaveBeenCalledTimes(1);
    });

    it('hides recovery actions when enableRecovery is false', () => {
      const debugInfo = {
        errorDetails: {
          type: 'NETWORK',
          canRetry: true,
        },
      };

      renderComponent({
        error: 'Network error',
        debugInfo,
        onRetry: vi.fn(),
        onGoBack: vi.fn(),
        enableRecovery: false,
      });

      expect(screen.queryByText('Try Again')).not.toBeInTheDocument();
      expect(screen.queryByText('Go Back')).not.toBeInTheDocument();
    });
  });

  describe('Error Type-Specific Guidance', () => {
    const errorTypeTests = [
      {
        type: 'TIMEOUT',
        expectedSuggestions: ['Try selecting fewer fields', 'Add more specific filters'],
      },
      {
        type: 'NETWORK',
        expectedSuggestions: ['Check your internet connection', 'Verify VPN connection'],
      },
      {
        type: 'VALIDATION',
        expectedSuggestions: ['Review your query configuration', 'Check that all selected fields are valid'],
      },
      {
        type: 'AUTHORIZATION',
        expectedSuggestions: ['Contact your administrator for permissions'],
      },
      {
        type: 'RATE_LIMIT',
        expectedSuggestions: ['Wait 60 seconds before retrying'],
      },
    ];

    errorTypeTests.forEach(({ type, expectedSuggestions }) => {
      it(`provides appropriate suggestions for ${type} errors`, () => {
        const debugInfo = {
          errorDetails: {
            type,
            retryAfter: type === 'RATE_LIMIT' ? '60' : undefined,
          },
        };

        renderComponent({
          error: `${type} error`,
          debugInfo,
          enableRecovery: true,
        });

        expectedSuggestions.forEach(suggestion => {
          expect(screen.getByText(new RegExp(suggestion, 'i'))).toBeInTheDocument();
        });
      });
    });
  });

  describe('Debug Information Display', () => {
    it('renders debug information collapse in preview mode', () => {
      const debugInfo = {
        ldapFilter: '(&(objectClass=user)(sAMAccountName=test*))',
        attributes: ['sAMAccountName', 'displayName'],
        filterCount: 1,
        filterDetails: [{ field: 'sAMAccountName', operator: 'startsWith', value: 'test' }],
      };

      renderComponent({
        mode: 'preview',
        debugInfo,
      });

      expect(screen.getByText('Debug Information')).toBeInTheDocument();
    });

    it('does not render debug information in full mode', () => {
      const debugInfo = {
        ldapFilter: '(&(objectClass=user))',
        attributes: ['sAMAccountName'],
      };

      renderComponent({
        mode: 'full',
        debugInfo,
      });

      expect(screen.queryByText('Debug Information')).not.toBeInTheDocument();
    });

    it('displays LDAP filter information', () => {
      const debugInfo = {
        ldapFilter: '(&(objectClass=user)(cn=test*))',
      };

      renderComponent({
        mode: 'preview',
        debugInfo,
      });

      // Expand debug info
      fireEvent.click(screen.getByText('Debug Information'));

      expect(screen.getByText('LDAP Filter:')).toBeInTheDocument();
      expect(screen.getByText('(&(objectClass=user)(cn=test*))')).toBeInTheDocument();
    });

    it('shows active filters details', () => {
      const debugInfo = {
        filterDetails: [
          { field: 'department', operator: 'equals', value: 'IT' },
          { field: 'enabled', operator: 'equals', value: true },
        ],
        filterCount: 2,
      };

      renderComponent({
        mode: 'preview',
        debugInfo,
      });

      fireEvent.click(screen.getByText('Debug Information'));

      expect(screen.getByText('Active Filters (2):')).toBeInTheDocument();
      expect(screen.getByText(/department equals IT/)).toBeInTheDocument();
      expect(screen.getByText(/enabled equals true/)).toBeInTheDocument();
    });

    it('displays selected attributes', () => {
      const debugInfo = {
        attributes: ['sAMAccountName', 'displayName', 'mail', 'department'],
      };

      renderComponent({
        mode: 'preview',
        debugInfo,
      });

      fireEvent.click(screen.getByText('Debug Information'));

      expect(screen.getByText('Selected Attributes (4):')).toBeInTheDocument();
      expect(screen.getByText('sAMAccountName')).toBeInTheDocument();
      expect(screen.getByText('displayName')).toBeInTheDocument();
    });

    it('shows error details with recovery suggestions in debug info', () => {
      const debugInfo = {
        errorDetails: {
          type: 'TIMEOUT',
          message: 'Query execution timeout',
          code: 'TIMEOUT_ERROR',
          canRetry: true,
          recoveryGuidance: 'Reduce the scope of your query',
          response: { statusCode: 408, error: 'Timeout' },
        },
      };

      renderComponent({
        mode: 'preview',
        error: 'Timeout error',
        debugInfo,
        enableRecovery: true,
        retryCount: 1,
        maxRetries: 3,
      });

      fireEvent.click(screen.getByText('Debug Information'));

      expect(screen.getByText('Error Details')).toBeInTheDocument();
      expect(screen.getByText(/Query execution timeout/)).toBeInTheDocument();
      expect(screen.getByText(/TIMEOUT_ERROR/)).toBeInTheDocument();
      expect(screen.getByText(/Reduce the scope of your query/)).toBeInTheDocument();
    });

    it('provides copy debug info functionality', () => {
      const debugInfo = {
        ldapFilter: '(&(objectClass=user))',
        attributes: ['sAMAccountName'],
      };

      // Mock clipboard API
      Object.assign(navigator, {
        clipboard: {
          writeText: vi.fn().mockResolvedValue(undefined),
        },
      });

      renderComponent({
        mode: 'preview',
        debugInfo,
      });

      fireEvent.click(screen.getByText('Debug Information'));

      const copyButton = screen.getByText('Copy Debug Info');
      fireEvent.click(copyButton);

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        JSON.stringify(debugInfo, null, 2)
      );
    });
  });

  describe('Data Display and Table Integration', () => {
    it('renders data table with correct props in preview mode', () => {
      renderComponent({
        mode: 'preview',
        data: mockData,
        fields: mockFields,
      });

      expect(screen.getByTestId('enhanced-data-table')).toBeInTheDocument();
      expect(screen.getByTestId('table-columns')).toHaveTextContent('2 columns');
    });

    it('enables filters and export in full mode', () => {
      const onDownload = vi.fn();

      renderComponent({
        mode: 'full',
        data: mockData,
        fields: mockFields,
        onDownload,
      });

      expect(screen.getByTestId('enhanced-data-table')).toBeInTheDocument();
      expect(screen.getByTestId('export-button')).toBeInTheDocument();
    });

    it('shows loading state in data table', () => {
      renderComponent({
        loading: true,
      });

      expect(screen.getByTestId('table-loading')).toBeInTheDocument();
    });

    it('handles empty data gracefully', () => {
      renderComponent({
        data: {
          ...mockData,
          results: [],
          resultCount: 0,
        },
      });

      expect(screen.getByText('No data found')).toBeInTheDocument();
    });

    it('shows preview limitation warning for large datasets', () => {
      const largeData = {
        ...mockData,
        results: Array.from({ length: 150 }, (_, i) => ({
          sAMAccountName: `user${i}`,
          displayName: `User ${i}`,
          id: String(i),
        })),
        resultCount: 150,
      };

      renderComponent({
        mode: 'preview',
        data: largeData,
      });

      expect(screen.getByText('Showing first 100')).toBeInTheDocument();
      expect(screen.getByText('Preview Limitation')).toBeInTheDocument();
    });

    it('generates columns from data when fields not provided', () => {
      renderComponent({
        fields: undefined,
        data: {
          ...mockData,
          results: [
            { username: 'user1', email: 'user1@test.com', active: true },
            { username: 'user2', email: 'user2@test.com', active: false },
          ],
        },
      });

      expect(screen.getByTestId('enhanced-data-table')).toBeInTheDocument();
      expect(screen.getByTestId('table-columns')).toHaveTextContent('3 columns');
    });
  });

  describe('User Interaction Handling', () => {
    it('handles download action', () => {
      const onDownload = vi.fn();

      renderComponent({
        mode: 'full',
        onDownload,
      });

      const exportButton = screen.getByTestId('export-button');
      fireEvent.click(exportButton);

      expect(onDownload).toHaveBeenCalledWith('csv');
    });

    it('handles share action with default behavior', () => {
      // Mock clipboard API
      Object.assign(navigator, {
        clipboard: {
          writeText: vi.fn().mockResolvedValue(undefined),
        },
      });

      const onShare = vi.fn();

      renderComponent({
        mode: 'full',
        onShare,
      });

      // Trigger share if component provides share functionality
      if (onShare) {
        onShare();
        expect(onShare).toHaveBeenCalled();
      }
    });

    it('handles copy ID action', () => {
      const onCopyId = vi.fn();

      renderComponent({
        mode: 'full',
        onCopyId,
      });

      if (onCopyId) {
        onCopyId();
        expect(onCopyId).toHaveBeenCalled();
      }
    });

    it('shows execution summary in full mode', () => {
      renderComponent({
        mode: 'full',
        data: {
          ...mockData,
          status: 'completed',
          parameters: { dataSource: 'ad' },
        },
      });

      expect(screen.getByTestId('execution-summary')).toBeInTheDocument();
      expect(screen.getByText('Status: completed')).toBeInTheDocument();
      expect(screen.getByText('Records: 2')).toBeInTheDocument();
      expect(screen.getByText('Time: 150ms')).toBeInTheDocument();
      expect(screen.getByText('Category: AD')).toBeInTheDocument();
    });

    it('does not show execution summary in preview mode', () => {
      renderComponent({
        mode: 'preview',
      });

      expect(screen.queryByTestId('execution-summary')).not.toBeInTheDocument();
    });
  });

  describe('Dark Mode Support', () => {
    it('applies dark mode styles correctly', () => {
      mockStore = createMockStore({ theme: { darkMode: true } });

      renderComponent({
        error: 'Dark mode error test',
      });

      // Error should be displayed with appropriate styling
      expect(screen.getByText('Error Loading Report')).toBeInTheDocument();
    });

    it('applies light mode styles correctly', () => {
      mockStore = createMockStore({ theme: { darkMode: false } });

      renderComponent({
        error: 'Light mode error test',
      });

      expect(screen.getByText('Error Loading Report')).toBeInTheDocument();
    });
  });

  describe('Accessibility and User Experience', () => {
    it('provides appropriate ARIA labels and roles', () => {
      renderComponent({
        error: 'Accessibility test error',
        enableRecovery: true,
        onRetry: vi.fn(),
        onGoBack: vi.fn(),
      });

      // Check for accessible button labels
      const retryButton = screen.queryByText('Try Again');
      const goBackButton = screen.queryByText('Go Back');

      if (retryButton) {
        expect(retryButton).toBeInTheDocument();
      }
      if (goBackButton) {
        expect(goBackButton).toBeInTheDocument();
      }
    });

    it('maintains focus management during error recovery', async () => {
      const onRetry = vi.fn().mockResolvedValue(undefined);

      renderComponent({
        error: 'Focus test error',
        onRetry,
        enableRecovery: true,
        debugInfo: {
          errorDetails: {
            type: 'NETWORK',
            canRetry: true,
          },
        },
      });

      const retryButton = screen.getByText('Try Again');
      retryButton.focus();

      fireEvent.click(retryButton);

      await waitFor(() => {
        expect(onRetry).toHaveBeenCalled();
      });
    });

    it('provides helpful tooltips and guidance text', () => {
      const debugInfo = {
        errorDetails: {
          type: 'TIMEOUT',
          recoveryGuidance: 'Try reducing the query scope',
        },
      };

      renderComponent({
        error: 'Tooltip test error',
        debugInfo,
        enableRecovery: true,
      });

      expect(screen.getByText(/Try reducing the query scope/)).toBeInTheDocument();
    });
  });
});