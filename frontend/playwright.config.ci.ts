import { defineConfig, devices } from '@playwright/test';

/**
 * CI-Optimized Playwright Configuration
 * Runs only essential tests on a single browser to avoid timeout issues
 * Use full config (playwright.config.ts) for comprehensive testing
 */
export default defineConfig({
  testDir: './e2e',  // Run full E2E test suite
  
  /* CI Configuration */
  fullyParallel: true,   // Enable parallel execution for better performance
  forbidOnly: true,      // Fail if test.only is found
  retries: 2,           // Allow retries for flaky tests
  workers: 2,           // Limited workers to prevent resource exhaustion
  
  /* Reporter optimized for CI */
  reporter: [
    ['list'],  // Minimal console output
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['json', { outputFile: 'test-results/results.json' }]
  ],
  
  /* Shared settings optimized for CI */
  use: {
    /* Base URL pointing to backend in CI */
    baseURL: process.env.FRONTEND_URL || 'http://localhost:3000',
    
    /* Reduced timeouts for faster failures */
    actionTimeout: 10000,  // 10 seconds
    navigationTimeout: 15000,  // 15 seconds
    
    /* Minimal media capture to save space */
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    
    /* Headless mode for CI */
    headless: true,
    
    /* Ignore HTTPS errors in test environment */
    ignoreHTTPSErrors: true,
  },

  /* Optimized projects for CI - primary browsers only */
  projects: [
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
        // Optimized browser launch for CI Docker environment
        launchOptions: {
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-software-rasterizer',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-features=TranslateUI',
            '--disable-ipc-flooding-protection',
            '--disable-features=VizDisplayCompositor'
          ]
        }
      },
    },
    {
      name: 'firefox',
      use: { 
        ...devices['Desktop Firefox'],
        viewport: { width: 1280, height: 720 },
        launchOptions: {
          firefoxUserPrefs: {
            'media.navigator.streams.fake': true,
            'media.navigator.permission.disabled': true,
          },
        }
      },
    }
  ],

  /* Web server for CI - start dev server */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 180 * 1000, // 3 minutes for dev server to start in CI
    stdout: 'ignore',
    stderr: 'pipe',
  },
  
  /* Reduced timeouts for CI */
  timeout: 30 * 1000,  // 30 seconds per test
  
  /* Expect timeout */
  expect: {
    timeout: 5 * 1000,  // 5 seconds for assertions
  },

  /* Output directory */
  outputDir: 'test-results/',
  
  /* Global setup and teardown for CI */
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
});