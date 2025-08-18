import { defineConfig, devices } from '@playwright/test';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// require('dotenv').config();

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './e2e',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html'],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['json', { outputFile: 'test-results/results.json' }]
  ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    
    /* Take screenshot on failure */
    screenshot: 'only-on-failure',
    
    /* Capture video on failure */
    video: 'retain-on-failure',

    /* Global timeout for each action */
    actionTimeout: 15000,
  },

  /* Configure projects for major browsers */
  projects: [
    // Desktop browsers
    {
      name: 'Desktop Chrome',
      use: { 
        ...devices['Desktop Chrome'],
        viewport: { width: 1200, height: 800 }
      },
    },

    {
      name: 'Desktop Firefox',
      use: { 
        ...devices['Desktop Firefox'],
        viewport: { width: 1200, height: 800 }
      },
    },

    {
      name: 'Desktop Safari',
      use: { 
        ...devices['Desktop Safari'],
        viewport: { width: 1200, height: 800 }
      },
    },

    // Tablet viewports
    {
      name: 'iPad',
      use: { 
        ...devices['iPad Pro'],
        viewport: { width: 1024, height: 1366 }
      },
    },

    {
      name: 'iPad Landscape',
      use: { 
        ...devices['iPad Pro landscape'],
        viewport: { width: 1366, height: 1024 }
      },
    },

    // Mobile viewports
    {
      name: 'Mobile Chrome',
      use: { 
        ...devices['Pixel 5'],
        viewport: { width: 393, height: 851 }
      },
    },

    {
      name: 'Mobile Safari',
      use: { 
        ...devices['iPhone 12'],
        viewport: { width: 390, height: 844 }
      },
    },

    {
      name: 'Mobile Chrome Small',
      use: { 
        ...devices['Galaxy S9+'],
        viewport: { width: 320, height: 658 }
      },
    },

    // Branded browsers (uncomment if needed)
    {
      name: 'Microsoft Edge',
      use: { 
        ...devices['Desktop Edge'], 
        channel: 'msedge',
        viewport: { width: 1200, height: 800 }
      },
    },

    {
      name: 'Google Chrome',
      use: { 
        ...devices['Desktop Chrome'], 
        channel: 'chrome',
        viewport: { width: 1200, height: 800 }
      },
    },

    // High DPI displays
    {
      name: 'Desktop Chrome High DPI',
      use: { 
        ...devices['Desktop Chrome'],
        viewport: { width: 1200, height: 800 },
        deviceScaleFactor: 2
      },
    },

    // Accessibility testing with screen reader simulation
    {
      name: 'Desktop Chrome A11y',
      use: { 
        ...devices['Desktop Chrome'],
        viewport: { width: 1200, height: 800 },
        // Additional accessibility settings can be added here
        reducedMotion: 'reduce',
        forcedColors: 'none'
      },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000, // 2 minutes for dev server to start
  },
  
  /* Global test timeout */
  timeout: 60 * 1000, // 1 minute per test
  
  /* Expect timeout */
  expect: {
    timeout: 10 * 1000, // 10 seconds for expect assertions
  },

  /* Output directory for test artifacts */
  outputDir: 'test-results/',
});