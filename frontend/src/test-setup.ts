import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock window.matchMedia
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

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock window.location
Object.defineProperty(window, 'location', {
  value: {
    href: 'http://localhost:3000',
    origin: 'http://localhost:3000',
    protocol: 'http:',
    host: 'localhost:3000',
    hostname: 'localhost',
    port: '3000',
    pathname: '/',
    search: '',
    hash: '',
    reload: vi.fn(),
    replace: vi.fn(),
    assign: vi.fn(),
  },
  writable: true,
});

// Suppress console errors in tests unless needed
global.console.error = vi.fn();
global.console.warn = vi.fn();

// Mock timer functions for vitest compatibility
// These ensure that timer functions work properly in the test environment
Object.defineProperty(global, 'setTimeout', {
  value: (fn: (...args: unknown[]) => void, delay?: number, ...args: unknown[]) => {
    return setTimeout(fn, delay, ...args);
  },
  writable: true,
});

Object.defineProperty(global, 'clearTimeout', {
  value: (id?: NodeJS.Timeout) => {
    if (id !== null && id !== undefined) {
      clearTimeout(id);
    }
  },
  writable: true,
});

Object.defineProperty(global, 'setInterval', {
  value: (fn: (...args: unknown[]) => void, delay?: number, ...args: unknown[]) => {
    return setInterval(fn, delay, ...args);
  },
  writable: true,
});

Object.defineProperty(global, 'clearInterval', {
  value: (id?: NodeJS.Timeout) => {
    if (id !== null && id !== undefined) {
      clearInterval(id);
    }
  },
  writable: true,
});