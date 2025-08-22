/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/utils/test-setup.ts'],
    css: true,
    
    // Test execution settings
    testTimeout: 30000, // 30 seconds for complex async tests
    hookTimeout: 10000, // 10 seconds for setup/teardown
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/utils/test-*',
        '**/*.d.ts',
        '**/*.config.*',
        '**/coverage/**',
        'src/main.tsx',
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
    },
    
    // Test file patterns
    include: [
      'src/**/__tests__/**/*.{test,spec}.{js,ts,tsx}',
      'src/**/*.{test,spec}.{js,ts,tsx}',
    ],
    exclude: [
      'node_modules/',
      'dist/',
      'e2e/',
      'src/utils/test-*',
      '**/*.integration.{test,spec}.{js,ts,tsx}', // Separate integration tests
    ],
    
    // Parallel execution
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        minThreads: 1,
        maxThreads: 4,
      },
    },
    
    // Reporter configuration
    reporter: process.env.CI 
      ? ['verbose', 'junit', 'github-actions']
      : ['verbose', 'html'],
    
    outputFile: {
      junit: './reports/junit.xml',
      html: './reports/test-report.html',
    },
    
    // Test categorization using tags
    // Usage: test.concurrent('test name', { tags: ['unit'] }, () => {})
    typecheck: {
      enabled: true,
      include: ['**/*.{test,spec}.{ts,tsx}'],
    },
  },
  
  // Define test environment variables
  define: {
    'import.meta.env.VITEST': true,
  },
});