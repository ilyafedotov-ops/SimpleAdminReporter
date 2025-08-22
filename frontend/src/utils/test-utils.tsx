import React from 'react';
import { render, RenderOptions, renderHook as originalRenderHook } from '@testing-library/react';
import { Provider } from 'react-redux';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import { configureStore } from '@reduxjs/toolkit';
import { vi } from 'vitest';
import { mockStoreState } from './test-mocks';

// Create simple mock reducers for testing
const createMockReducer = (initialState: unknown) => (state = initialState, action: { type: string; payload?: unknown }) => {
  // Handle common Redux Toolkit action types
  switch (action.type) {
    case 'auth/login/pending':
      return { ...state, isLoading: true, error: null };
    case 'auth/login/fulfilled':
      return { ...state, isLoading: false, isAuthenticated: true, user: action.payload.user, token: action.payload.accessToken };
    case 'auth/login/rejected':
      return { ...state, isLoading: false, error: action.payload };
    case 'auth/logout':
      return { ...state, user: null, token: null, isAuthenticated: false };
    case 'ui/toggleSidebar':
      return { ...state, sidebar: { ...state.sidebar, collapsed: !state.sidebar.collapsed } };
    case 'ui/setTheme':
      return { ...state, theme: { ...state.theme, ...action.payload } };
    default:
      return state;
  }
};

// Mock store state type
type MockStoreState = typeof mockStoreState;

interface ExtendedRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  route?: string;
  initialState?: Partial<MockStoreState>;
  useMemoryRouter?: boolean;
}

export function createMockStore(initialState: Partial<MockStoreState> = {}) {
  const preloadedState = {
    auth: { ...mockStoreState.auth, ...initialState.auth },
    ui: { ...mockStoreState.ui, ...initialState.ui },
    reports: { ...mockStoreState.reports, ...initialState.reports },
    query: { ...mockStoreState.query, ...initialState.query },
  };

  return configureStore({
    reducer: {
      auth: createMockReducer(preloadedState.auth),
      ui: createMockReducer(preloadedState.ui),
      reports: createMockReducer(preloadedState.reports),
      query: createMockReducer(preloadedState.query),
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: {
          ignoredActions: ['persist/PERSIST'],
        },
      }),
  });
}

export function renderWithProviders(
  ui: React.ReactElement,
  {
    route = '/',
    initialState = {},
    useMemoryRouter = false,
    ...renderOptions
  }: ExtendedRenderOptions = {}
) {
  const store = createMockStore(initialState);

  if (!useMemoryRouter && route !== '/') {
    window.history.pushState({}, 'Test page', route);
  }

  function Wrapper({ children }: { children: React.ReactNode }) {
    const Router = useMemoryRouter ? MemoryRouter : BrowserRouter;
    const routerProps = useMemoryRouter ? { initialEntries: [route] } : {};

    return (
      <Provider store={store}>
        <Router {...routerProps}>
          <ConfigProvider
            theme={{
              token: {
                colorPrimary: '#1890ff',
              },
            }}
          >
            {children}
          </ConfigProvider>
        </Router>
      </Provider>
    );
  }

  return { store, ...render(ui, { wrapper: Wrapper, ...renderOptions }) };
}

// Re-export specific testing utilities for convenience
// Test wrapper component for hook testing
export function TestWrapper({ 
  children, 
  initialState = {} 
}: { 
  children: React.ReactNode; 
  initialState?: Partial<MockStoreState>; 
}) {
  const store = createMockStore(initialState);
  
  return (
    <Provider store={store}>
      <ConfigProvider
        theme={{
          token: {
            colorPrimary: '#1890ff',
          },
        }}
      >
        {children}
      </ConfigProvider>
    </Provider>
  );
}

// Hook testing utility
export function createTestWrapper(initialState: Partial<MockStoreState> = {}) {
  return ({ children }: { children: React.ReactNode }) => (
    <TestWrapper initialState={initialState}>{children}</TestWrapper>
  );
}

export { 
  screen, 
  fireEvent, 
  waitFor, 
  waitForElementToBeRemoved,
  within,
  cleanup,
  act
} from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';

/**
 * Enhanced hook testing utility with proper Redux context and error handling
 */
export function renderHookEnhanced<TProps, TResult>(
  hook: (props: TProps) => TResult,
  options: {
    initialProps?: TProps;
    initialState?: Partial<MockStoreState>;
    withErrorBoundary?: boolean;
    isolateHook?: boolean;
  } = {}
) {
  const { initialProps, initialState = {}, withErrorBoundary = false, isolateHook = true } = options;
  
  // Create a fresh store for each test to avoid interference
  // Use simplified state structure that matches what the hook expects
  const store = configureStore({
    reducer: {
      auth: (state = mockStoreState.auth, action) => state,
      ui: (state = mockStoreState.ui, action) => state,
      reports: (state = mockStoreState.reports, action) => state,
      query: (state = mockStoreState.query, action) => state,
    },
    preloadedState: {
      auth: { ...mockStoreState.auth, ...initialState.auth },
      ui: { ...mockStoreState.ui, ...initialState.ui },
      reports: { ...mockStoreState.reports, ...initialState.reports },
      query: { ...mockStoreState.query, ...initialState.query },
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: false,
      }),
  });
  
  const HookWrapper = ({ children }: { children: React.ReactNode }) => {
    const content = withErrorBoundary ? (
      <ErrorBoundary>
        {children}
      </ErrorBoundary>
    ) : children;
    
    return (
      <Provider store={store}>
        <ConfigProvider
          theme={{
            token: {
              colorPrimary: '#1890ff',
            },
          }}
        >
          {content}
        </ConfigProvider>
      </Provider>
    );
  };
  
  const result = originalRenderHook(hook, {
    wrapper: HookWrapper,
    initialProps
  });
  
  // Debug logging removed
  
  // Add store to result for test access
  return {
    ...result,
    store,
    // Helper to verify hook result is not null
    expectResult: () => {
      if (result.current === null || result.current === undefined) {
        throw new Error('Hook result is null/undefined. Check Redux Provider setup.');
      }
      return result.current;
    }
  };
}

/**
 * Custom hook testing utility with built-in error boundary
 */
// Export enhanced renderHook as the default renderHook for our tests
export const renderHook = renderHookEnhanced;

export function renderHookWithErrorBoundary<TProps, TResult>(
  hook: (props: TProps) => TResult,
  options: {
    initialProps?: TProps;
    initialState?: Partial<MockStoreState>;
    withErrorBoundary?: boolean;
  } = {}
) {
  return renderHookEnhanced(hook, { ...options, withErrorBoundary: true });
}

/**
 * Enhanced error boundary for testing with retry functionality
 */
class ErrorBoundary extends React.Component<
  { 
    children: React.ReactNode;
    onRetry?: () => void;
    maxRetries?: number;
  },
  { 
    hasError: boolean; 
    error?: Error;
    retryCount: number;
  }
> {
  constructor(props: { children: React.ReactNode; onRetry?: () => void; maxRetries?: number }) {
    super(props);
    this.state = { hasError: false, retryCount: 0 };
  }
  
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo);
  }
  
  handleRetry = () => {
    const { maxRetries = 3 } = this.props;
    if (this.state.retryCount < maxRetries) {
      this.setState(prevState => ({
        hasError: false,
        error: undefined,
        retryCount: prevState.retryCount + 1
      }));
      
      if (this.props.onRetry) {
        this.props.onRetry();
      }
    }
  };
  
  render() {
    if (this.state.hasError) {
      const { maxRetries = 3 } = this.props;
      const canRetry = this.state.retryCount < maxRetries;
      
      return (
        <div data-testid="error-boundary" style={{ padding: '16px', textAlign: 'center' }}>
          <div>Something went wrong</div>
          {canRetry && (
            <div style={{ marginTop: '8px' }}>
              <div>Attempt {this.state.retryCount + 1} of {maxRetries + 1}</div>
              <button 
                onClick={this.handleRetry}
                data-testid="retry-button"
                style={{ marginTop: '8px', padding: '4px 8px', cursor: 'pointer' }}
              >
                Retry
              </button>
            </div>
          )}
        </div>
      );
    }
    
    return this.props.children;
  }
}

/**
 * Utility to test component with different theme states
 */
export function renderWithThemes(
  component: React.ReactElement,
  options: ExtendedRenderOptions = {}
) {
  const lightTheme = renderWithProviders(component, {
    ...options,
    initialState: { 
      ...options.initialState, 
      ui: { theme: { darkMode: false } } 
    }
  });
  
  const darkTheme = renderWithProviders(component, {
    ...options,
    initialState: { 
      ...options.initialState, 
      ui: { theme: { darkMode: true } } 
    }
  });
  
  return { lightTheme, darkTheme };
}

/**
 * Utility for testing accessibility
 */
export async function checkAccessibility(container: HTMLElement) {
  // Check for basic accessibility requirements
  const form = container.querySelector('form');
  if (form) {
    const inputs = form.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
      const label = form.querySelector(`label[for="${input.id}"]`);
      const ariaLabel = input.getAttribute('aria-label');
      const ariaLabelledBy = input.getAttribute('aria-labelledby');
      
      expect(
        label || ariaLabel || ariaLabelledBy,
        `Input ${input.id || input.className} should have an associated label`
      ).toBeTruthy();
    });
  }
  
  // Check for required ARIA attributes on buttons
  const buttons = container.querySelectorAll('button[aria-expanded]');
  buttons.forEach(button => {
    expect(button.getAttribute('aria-controls')).toBeTruthy();
  });
}

/**
 * Utility to simulate network conditions
 */
export const networkConditions = {
  offline: () => {
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: false,
    });
    window.dispatchEvent(new Event('offline'));
  },
  
  online: () => {
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: true,
    });
    window.dispatchEvent(new Event('online'));
  },
  
  slowNetwork: () => {
    // Mock slow network by adding delays to fetch
    global.fetch = vi.fn().mockImplementation(async (...args) => {
      await new Promise(resolve => setTimeout(resolve, 2000));
      return new Response('{}', { status: 200 });
    });
  },
};

/**
 * Comprehensive error testing utilities
 */
export const errorTestUtils = {
  mockNetworkError: () => new Error('Network Error'),
  mockTimeoutError: () => {
    const error = new Error('Timeout');
    (error as any).code = 'TIMEOUT';
    return error;
  },
  mockValidationError: (fields: Record<string, string>) => {
    const error = new Error('Validation Error');
    (error as any).details = fields;
    return error;
  },
  mockAppError: (type: string, message: string, code?: string, details?: any) => {
    const error = new Error(message);
    (error as any).type = type;
    (error as any).code = code || 'TEST_ERROR';
    (error as any).details = details;
    return error;
  },
};

/**
 * Test isolation utilities
 */
export const testIsolation = {
  // Clean up all timers and async operations
  cleanupTimers: () => {
    vi.clearAllTimers();
    vi.runOnlyPendingTimers();
  },
  
  // Reset all mocks
  resetAllMocks: () => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  },
  
  // Wait for async operations to complete
  waitForAsync: async (timeout = 100) => {
    await new Promise(resolve => setTimeout(resolve, timeout));
  },
  
  // Flush all promises
  flushPromises: async () => {
    await new Promise(resolve => process.nextTick(resolve));
  }
};

/**
 * Mock management utilities
 */
export const mockUtils = {
  createMockFunction: <T extends (...args: any[]) => any>(impl?: T) => {
    return vi.fn(impl);
  },
  
  createMockPromise: <T,>(result: T, shouldReject = false, delay = 0) => {
    return vi.fn().mockImplementation(() => 
      new Promise((resolve, reject) => {
        setTimeout(() => {
          if (shouldReject) {
            reject(result);
          } else {
            resolve(result);
          }
        }, delay);
      })
    );
  },
  
  verifyMockCalled: (mock: any, times?: number, args?: any[]) => {
    if (times !== undefined) {
      expect(mock).toHaveBeenCalledTimes(times);
    } else {
      expect(mock).toHaveBeenCalled();
    }
    
    if (args) {
      expect(mock).toHaveBeenCalledWith(...args);
    }
  }
};

/**
 * Advanced component testing utilities
 */
export const componentTestUtils = {
  // Wait for component to stabilize after state changes
  waitForStabilization: async (timeout = 500) => {
    await new Promise(resolve => setTimeout(resolve, timeout));
    try {
      await waitFor(() => {}, { timeout: 100 });
    } catch {
      // Ignore timeout errors, just ensure we wait
    }
  },
  
  // Simulate user interactions with proper timing
  simulateUserInteraction: async (interaction: () => void | Promise<void>, delay = 50) => {
    await interaction();
    await new Promise(resolve => setTimeout(resolve, delay));
  },
  
  // Find element with retry mechanism
  findElementWithRetry: async (selector: () => HTMLElement, maxAttempts = 10, delay = 100) => {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const element = selector();
        if (element) return element;
      } catch {
        // Element not found, continue retrying
      }
      
      if (attempt < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw new Error(`Element not found after ${maxAttempts} attempts`);
  },
  
  // Check if text exists with flexible matching
  findTextWithRetry: async (text: string | RegExp, maxAttempts = 10, delay = 100) => {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const element = typeof text === 'string' 
          ? screen.getByText(text)
          : screen.getByText(text);
        if (element) return element;
      } catch {
        // Text not found, continue retrying
      }
      
      if (attempt < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw new Error(`Text ${text} not found after ${maxAttempts} attempts`);
  }
};

