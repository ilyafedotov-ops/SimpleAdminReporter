/**
 * Jest configuration for E2E tests
 * Separate configuration to avoid conflicts with unit tests
 */

module.exports = {
  displayName: 'E2E Tests',
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  // Test file patterns
  roots: ['<rootDir>/src/test/e2e'],
  testMatch: [
    '<rootDir>/src/test/e2e/**/*.e2e.test.ts'
  ],
  
  // TypeScript transformation
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  
  // Module resolution
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  
  // Test environment setup
  setupFilesAfterEnv: [
    '<rootDir>/src/test/e2e/setup.ts'
  ],
  
  // Test timeout (2 minutes for E2E tests)
  testTimeout: 120000,
  
  // Coverage configuration (optional for E2E tests)
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.e2e.test.ts',
    '!src/test/**',
    '!src/scripts/**',
    '!src/types/**',
    '!src/database/**',
  ],
  
  coverageDirectory: 'coverage/e2e',
  coverageReporters: ['text', 'lcov', 'html', 'cobertura'],
  
  // Coverage thresholds (more lenient for E2E tests)
  coverageThreshold: {
    global: {
      branches: 30,
      functions: 30,
      lines: 40,
      statements: 40,
    },
  },
  
  // Reporters
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: './test-results/e2e',
        outputName: 'e2e-results.xml',
        ancestorSeparator: ' › ',
        uniqueOutputName: 'false',
        suiteNameTemplate: '{filepath}',
        classNameTemplate: '{classname}',
        titleTemplate: '{title}',
        addFileAttribute: 'true'
      },
    ],
  ],
  
  // Global settings for E2E tests
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json',
    },
  },
  
  // Force exit after tests complete
  forceExit: true,
  
  // Detect open handles (useful for debugging connection leaks)
  detectOpenHandles: true,
  
  // Run tests serially (not in parallel) for E2E tests
  maxWorkers: 1,
  
  // Increase memory limit for E2E tests
  maxConcurrency: 1,
  
  // Verbose output for debugging
  verbose: true,
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Restore mocks after each test
  restoreMocks: true,
  
  // Bail on first test failure (can be overridden by CLI)
  bail: true,
  
  // Error on deprecated features
  errorOnDeprecated: true,
  
  // Test result processor (optional)
  // testResultsProcessor: './src/test/e2e/utils/test-results-processor.js'
};