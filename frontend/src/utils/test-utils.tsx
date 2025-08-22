import React from 'react';
import { render, RenderOptions, renderHook as originalRenderHook } from '@testing-library/react';
import { Provider } from 'react-redux';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import { configureStore } from '@reduxjs/toolkit';
import { 
  createMockStore,
  MockStoreState 
} from './test-helpers';
import { mockStoreState } from './test-mocks';


interface ExtendedRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  route?: string;
  initialState?: Partial<MockStoreState>;
  useMemoryRouter?: boolean;
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


// Re-export testing utilities from separate file
export * from './test-exports';

/**
 * Enhanced hook testing utility with proper Redux context and error handling
 */
export function renderHookEnhanced<TProps, TResult>(
  hook: (props: TProps) => TResult,
  options: {
    initialProps?: TProps;
    initialState?: Partial<MockStoreState>;
    withErrorBoundary?: boolean;
  } = {}
) {
  const { initialProps, initialState = {}, withErrorBoundary = false } = options;
  
  // Create a fresh store for each test to avoid interference
  // Use simplified state structure that matches what the hook expects
  const store = configureStore({
    reducer: {
      auth: (state = mockStoreState.auth, _action: { type: string; payload?: unknown }) => state,
      ui: (state = mockStoreState.ui, _action: { type: string; payload?: unknown }) => state,
      reports: (state = mockStoreState.reports, _action: { type: string; payload?: unknown }) => state,
      query: (state = mockStoreState.query, _action: { type: string; payload?: unknown }) => state,
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








