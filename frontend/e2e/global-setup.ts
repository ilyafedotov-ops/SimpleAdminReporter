import { chromium, firefox, FullConfig } from '@playwright/test';

/**
 * Global setup for Playwright E2E tests
 * Runs once before all tests
 */
async function globalSetup(config: FullConfig) {
  console.log('🚀 Starting Playwright E2E Global Setup...');
  
  // Log configuration for debugging
  const baseURL = config.projects[0].use.baseURL || 'http://localhost:3000';
  console.log(`🌐 Target application URL: ${baseURL}`);
  console.log(`🔧 Test directory: ${config.rootDir}`);
  
  // Basic environment checks
  console.log('📋 Environment Information:');
  console.log(`   - Node version: ${process.version}`);
  console.log(`   - Platform: ${process.platform}`);
  console.log(`   - CI: ${process.env.CI ? 'Yes' : 'No'}`);
  console.log(`   - PLAYWRIGHT_BROWSERS_PATH: ${process.env.PLAYWRIGHT_BROWSERS_PATH || 'default'}`);
  
  // Check if this is a CI environment and adjust expectations
  if (process.env.CI) {
    console.log('🏭 Running in CI environment - using optimized settings');
    
    // Verify browser availability in CI
    console.log('🔍 Verifying browser availability...');
    
    try {
      // Test Chromium launch
      console.log('🌐 Testing Chromium browser launch...');
      const chromiumBrowser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu'
        ]
      });
      await chromiumBrowser.close();
      console.log('✅ Chromium browser launch successful');
      
      // Test Firefox launch
      console.log('🦊 Testing Firefox browser launch...');
      const firefoxBrowser = await firefox.launch({
        headless: true
      });
      await firefoxBrowser.close();
      console.log('✅ Firefox browser launch successful');
      
    } catch (error) {
      console.error('❌ Browser launch test failed:', error.message);
      console.log('📝 This may indicate browser installation issues in the Docker container');
      // Don't fail setup, let individual tests handle browser issues
    }
  }
  
  // Note: API mocking is handled per-test since it requires page context
  console.log('💡 API mocking will be set up in individual test files');
  console.log('🔧 Tests should call ApiHelper.mockAuthEndpoints() or ApiHelper.mockAllCommonEndpoints()');
  
  console.log('✅ Global setup completed successfully');
}

export default globalSetup;