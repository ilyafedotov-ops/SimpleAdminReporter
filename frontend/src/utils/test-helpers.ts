import { waitFor } from '@testing-library/react';
import { store } from '@/store';
import { loginAsync } from '@/store/slices/authSlice';
import { configureStore } from '@reduxjs/toolkit';
import { vi } from 'vitest';
import { mockStoreState } from './test-mocks';

// Mock store state type
export type MockStoreState = typeof mockStoreState;

// Test credentials - should be configured in your test environment
export const TEST_CREDENTIALS = {
  username: process.env.TEST_USERNAME || 'testuser',
  password: process.env.TEST_PASSWORD || 'testpass',
  authSource: 'ad' as const,
};

// Create simple mock reducers for testing
export const createMockReducer = (initialState: unknown) => (
  state = initialState, 
  action: { type: string; payload?: unknown }
) => {
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

// Wait for async operations
export const waitForAsync = () => new Promise(resolve => setTimeout(resolve, 0));

// Login helper for tests that require authentication
export const loginForTest = async () => {
  const result = await store.dispatch(loginAsync(TEST_CREDENTIALS));
  if (loginAsync.rejected.match(result)) {
    throw new Error(`Login failed: ${result.payload}`);
  }
  return result.payload;
};

// Wait for API response
export const waitForApiResponse = async (condition: () => boolean, timeout = 5000) => {
  await waitFor(condition, { timeout });
};

// Check if user is authenticated
export const isAuthenticated = () => {
  const state = store.getState();
  return state.auth.isAuthenticated;
};

// Clear all data and logout
export const cleanupAfterTest = async () => {
  const state = store.getState();
  if (state.auth.isAuthenticated) {
    // Logout will be handled by the auth service
    localStorage.clear();
    sessionStorage.clear();
  }
};

// Wait for component to be ready
export const waitForComponentReady = async (testId: string) => {
  await waitFor(() => {
    const element = document.querySelector(`[data-testid="${testId}"]`);
    return element !== null;
  });
};

// Retry helper for flaky operations
export const retryOperation = async <T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  delay = 1000
): Promise<T> => {
  let lastError: Error | undefined;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
};

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
    global.fetch = vi.fn().mockImplementation(async (..._args: unknown[]) => {
      await new Promise(resolve => setTimeout(resolve, 2000));
      return new globalThis.Response('{}', { status: 200 });
    });
  },
};

/**
 * Comprehensive error testing utilities
 */
export const errorTestUtils = {
  mockNetworkError: () => new Error('Network Error'),
  mockTimeoutError: () => {
    const error = new Error('Timeout') as Error & { code: string };
    error.code = 'TIMEOUT';
    return error;
  },
  mockValidationError: (fields: Record<string, string>) => {
    const error = new Error('Validation Error') as Error & { details: Record<string, string> };
    error.details = fields;
    return error;
  },
  mockAppError: (type: string, message: string, code?: string, details?: unknown) => {
    const error = new Error(message) as Error & { 
      type: string; 
      code: string; 
      details?: unknown; 
    };
    error.type = type;
    error.code = code || 'TEST_ERROR';
    error.details = details;
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

type MockFunction<T extends (...args: never[]) => unknown> = ReturnType<typeof vi.fn<T>>;

/**
 * Mock management utilities
 */
export const mockUtils = {
  createMockFunction: <T extends (...args: never[]) => unknown>(impl?: T): MockFunction<T> => {
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
  
  verifyMockCalled: (mock: MockFunction<(...args: never[]) => unknown>, times?: number, args?: unknown[]) => {
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
    const { screen } = await import('@testing-library/react');
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