const isIntegrationTest = process.env.TEST_TYPE === 'integration';
const isE2ETest = process.env.TEST_TYPE === 'e2e';

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: isIntegrationTest
    ? ['**/*integration.test.ts'] // Only integration tests
    : isE2ETest
    ? ['**/*e2e.test.ts'] // Only E2E tests
    : [
        '**/__tests__/**/*.ts', 
        '**/?(*.)+(spec|test).ts',
        '!**/*integration.test.ts', // Exclude integration tests by default
        '!**/*e2e.test.ts' // Exclude E2E tests by default
      ],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@/auth/(.*)$': '<rootDir>/src/auth/$1',
    '^@/config/(.*)$': '<rootDir>/src/config/$1',
    '^@/controllers/(.*)$': '<rootDir>/src/controllers/$1',
    '^@/services/(.*)$': '<rootDir>/src/services/$1',
    '^@/middleware/(.*)$': '<rootDir>/src/middleware/$1',
    '^@/models/(.*)$': '<rootDir>/src/models/$1',
    '^@/queues/(.*)$': '<rootDir>/src/queues/$1',
    '^@/types/(.*)$': '<rootDir>/src/types/$1',
    '^@/utils/(.*)$': '<rootDir>/src/utils/$1',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.integration.test.ts',
    '!src/**/*.e2e.test.ts',
    '!src/app.ts',
    '!src/scripts/**',
    '!src/test/**',
    '!src/types/**',
    '!src/database/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'cobertura'],
  coverageThreshold: isE2ETest ? undefined : {
    global: {
      branches: 50,
      functions: 50,
      lines: 60,
      statements: 60,
    },
  },
  setupFilesAfterEnv: isE2ETest 
    ? ['<rootDir>/src/test/e2e-setup.ts']
    : ['<rootDir>/src/test/setup.ts'],
  testTimeout: isE2ETest ? 60000 : 10000, // 60s for E2E tests, 10s for unit tests
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: '.',
        outputName: 'junit.xml',
        ancestorSeparator: ' › ',
        uniqueOutputName: 'false',
        suiteNameTemplate: '{filepath}',
        classNameTemplate: '{classname}',
        titleTemplate: '{title}',
      },
    ],
  ],
};