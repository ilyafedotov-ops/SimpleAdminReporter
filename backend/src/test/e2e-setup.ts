/**
 * E2E Test Setup - Global configuration for E2E tests
 * This file is loaded by Jest for E2E test runs only
 */

import { logger } from '@/utils/logger';

// Set environment for E2E tests
process.env.NODE_ENV = 'test';
process.env.TEST_TYPE = 'e2e';
process.env.TEST_CLEANUP_AFTER_RUN = 'true';

// Increase timeout for all E2E tests globally
jest.setTimeout(60000); // 60 seconds for all E2E tests

// Add custom matchers for E2E tests
expect.extend({
  toBeOneOf(received: any, expected: any[]) {
    const pass = expected.includes(received);
    return {
      message: () =>
        pass
          ? `Expected ${received} not to be one of ${expected.join(', ')}`
          : `Expected ${received} to be one of ${expected.join(', ')}`,
      pass,
    };
  },
});

// Enhanced error handling for E2E tests
// eslint-disable-next-line no-console
const originalConsoleError = console.error;
// eslint-disable-next-line no-console
console.error = (...args: any[]) => {
  // Filter out known non-critical E2E warnings
  const message = args[0]?.toString() || '';
  
  if (
    message.includes('Warning: ReactDOM.render is deprecated') ||
    message.includes('Warning: validateDOMNesting') ||
    message.includes('punycode') ||
    message.includes('deprecated')
  ) {
    return; // Suppress these warnings in E2E tests
  }
  
  originalConsoleError.apply(console, args);
};

// Global test lifecycle logging
beforeAll(() => {
  logger.info('Starting E2E test suite', {
    nodeEnv: process.env.NODE_ENV,
    testType: process.env.TEST_TYPE,
    timeout: 60000
  });
});

afterAll(() => {
  logger.info('E2E test suite completed');
});

// Handle uncaught exceptions gracefully in tests
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
});

// Add global type declarations for custom matchers
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeOneOf(expected: any[]): R;
    }
  }
}