import React from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { Provider } from 'react-redux';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import { configureStore } from '@reduxjs/toolkit';
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
export { 
  screen, 
  fireEvent, 
  waitFor, 
  waitForElementToBeRemoved,
  within,
  cleanup
} from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';

