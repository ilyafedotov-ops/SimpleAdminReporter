// Test setup file
import { config } from 'dotenv';
import path from 'path';
import { logger } from "../utils/logger";
import 'jest-extended';

// Add custom matchers
expect.extend({
  toBeOneOf(received: any, array: any[]) {
    const pass = array.includes(received);
    if (pass) {
      return {
        message: () => `expected ${received} not to be one of ${JSON.stringify(array)}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be one of ${JSON.stringify(array)}`,
        pass: false,
      };
    }
  },
});

// Load test environment variables before anything else
config({ path: path.resolve(__dirname, '../../.env.test') });

// Set test environment
process.env.NODE_ENV = 'test';

// Increase test timeout for integration tests
jest.setTimeout(30000);

// Mock database and Redis connections for unit tests
// Only mock if not running integration tests
if (process.env.TEST_TYPE !== 'integration') {
  // Mock the database module
  jest.mock('@/config/database', () => {
    const { setupDatabaseMocks } = require('./mock-utils');
    return setupDatabaseMocks();
  });
  
  // Mock the Redis module  
  jest.mock('@/config/redis', () => {
    const { setupRedisMocks } = require('./mock-utils');
    return setupRedisMocks();
  });
  
  // Note: LDAP module is mocked individually in tests that need it
  // to avoid module resolution issues in global setup
}

// Mock console methods to reduce noise during tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  // Keep error for debugging
  // eslint-disable-next-line no-console
  error: console.error,
};

// Mock winston logger
jest.mock('@/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    })
  }
}));

// Global test utilities
import { TestContext, setupTestContext, teardownTestContext } from './test-helpers';

// Global test context
let globalContext: TestContext;

// Cleanup after each test to prevent test pollution
afterEach(async () => {
  try {
    // Clean up singleton services after each test
    const { AuditLogger } = require('@/services/audit-logger.service');
    const { unifiedAuthService } = require('@/auth/services/unified-auth.service');
    
    if (AuditLogger.instance) {
      AuditLogger.cleanup();
    }
    if (unifiedAuthService.cleanupInterval) {
      unifiedAuthService.cleanup();
    }
    
    // Reset singleton instances to prevent test interference
    if (process.env.TEST_TYPE !== 'integration') {
      // Reset Database singleton using reset method
      try {
        const { Database } = require('@/config/database');
        if (Database.resetInstance) {
          Database.resetInstance();
        }
      } catch {
        // Ignore if module not loaded yet
      }
      
      // Reset RedisClient singleton using reset method
      try {
        const { RedisClient } = require('@/config/redis');
        if (RedisClient.resetInstance) {
          RedisClient.resetInstance();
        }
      } catch {
        // Ignore if module not loaded yet
      }
    }
  } catch {
    // Ignore cleanup errors in individual tests
  }
});

// Setup before all tests
beforeAll(async () => {
  try {
    // Only setup global context for integration tests
    if (process.env.TEST_TYPE === 'integration') {
      // Check if database is available before setting up
      const dbUrl = process.env.DATABASE_URL;
      const hasDb = dbUrl && !dbUrl.includes('undefined') && dbUrl.includes('postgresql');
      
      if (hasDb) {
        globalContext = await setupTestContext();
        
        // Make context available globally
        (global as any).testContext = globalContext;
      } else {
        logger.warn('Integration tests skipped - no database configured');
      }
    }
  } catch (_error) {
    logger.error('Failed to setup test environment:', _error);
    // Don't exit in test mode - just warn and continue
    if (process.env.NODE_ENV === 'test') {
      logger.warn('Continuing without test context...');
    } else {
      process.exit(1);
    }
  }
});

// Cleanup after all tests
afterAll(async () => {
  try {
    // Clean up singleton services
    const { AuditLogger } = require('@/services/audit-logger.service');
    const { unifiedAuthService } = require('@/auth/services/unified-auth.service');
    
    AuditLogger.cleanup();
    unifiedAuthService.cleanup();
    
    if (globalContext) {
      await teardownTestContext(globalContext);
    }
  } catch (_error) {
    logger.error('Failed to cleanup test environment:', _error);
  }
});

// Ensure unhandled promise rejections fail tests
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Promise Rejection:', reason);
  throw reason;
});