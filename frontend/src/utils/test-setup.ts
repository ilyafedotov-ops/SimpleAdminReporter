import { vi } from 'vitest';
import { expect, afterEach, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Extend Vitest matchers
import * as matchers from '@testing-library/jest-dom/matchers';
expect.extend(matchers);

// Global test setup
beforeEach(() => {
  // Setup fake timers for all tests
  vi.useFakeTimers();
  
  // Mock browser APIs consistently
  setupBrowserMocks();
  
  // Mock console to avoid test noise
  setupConsoleMocks();
});

afterEach(() => {
  // Cleanup DOM after each test
  cleanup();
  
  // Restore real timers
  vi.useRealTimers();
  
  // Clear all mocks
  vi.clearAllMocks();
});

/**
 * Setup browser API mocks consistently across all tests
 */
function setupBrowserMocks() {
  // Mock localStorage
  const localStorageMock = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    length: 0,
    key: vi.fn()
  };
  
  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    writable: true,
  });
  
  // Mock sessionStorage
  Object.defineProperty(window, 'sessionStorage', {
    value: localStorageMock,
    writable: true,
  });
  
  // Mock performance API
  Object.defineProperty(window, 'performance', {
    value: {
      now: vi.fn(() => Date.now()),
      mark: vi.fn(),
      measure: vi.fn(),
      getEntriesByType: vi.fn(() => []),
    },
    writable: true,
  });
  
  // Mock navigator
  Object.defineProperty(window, 'navigator', {
    value: {
      ...window.navigator,
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
        readText: vi.fn().mockResolvedValue(''),
      },
      memory: {
        usedJSHeapSize: 50000000,
        totalJSHeapSize: 100000000,
        jsHeapSizeLimit: 200000000,
      },
    },
    writable: true,
  });
  
  // Mock IntersectionObserver
  global.IntersectionObserver = class IntersectionObserver {
    observe = vi.fn();
    disconnect = vi.fn();
    unobserve = vi.fn();
    constructor() {}
  };
  
  // Mock ResizeObserver
  global.ResizeObserver = class ResizeObserver {
    observe = vi.fn();
    disconnect = vi.fn();
    unobserve = vi.fn();
    constructor() {}
  };
  
  // Mock matchMedia
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(), // deprecated
      removeListener: vi.fn(), // deprecated
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

/**
 * Setup console mocks to reduce test noise
 */
function setupConsoleMocks() {
  const originalConsole = console;
  
  // Mock console methods but allow errors and warnings in tests
  global.console = {
    ...originalConsole,
    log: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: originalConsole.warn, // Keep warnings visible
    error: originalConsole.error, // Keep errors visible
  };
}

/**
 * Utility for testing async operations with fake timers
 */
export const advanceTimersAsync = async (ms: number) => {
  vi.advanceTimersByTime(ms);
  await new Promise(resolve => setTimeout(resolve, 0));
};

/**
 * Utility for waiting for DOM updates
 */
export const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0));

/**
 * Test timeout configuration
 */
export const TEST_TIMEOUTS = {
  SHORT: 1000,
  MEDIUM: 5000,
  LONG: 10000,
} as const;