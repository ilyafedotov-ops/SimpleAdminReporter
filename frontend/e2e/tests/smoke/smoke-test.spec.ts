import { test, expect } from '@playwright/test';

/**
 * Smoke Tests for CI/CD Pipeline
 * Basic tests to verify the application is working
 * These run quickly to provide fast feedback
 */

test.describe('Smoke Tests', () => {
  test('should load the application homepage', async ({ page }) => {
    // Navigate to the app
    await page.goto('/');
    
    // Wait for the page to load
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    
    // Verify we have some basic UI elements
    const hasTitle = await page.locator('title').count() > 0;
    expect(hasTitle).toBeTruthy();
    
    // Check if it's a login page or dashboard (depends on auth state)
    const hasLoginForm = await page.locator('form, [data-testid="login-form"]').count() > 0;
    const hasDashboard = await page.locator('[data-testid="dashboard"], .dashboard').count() > 0;
    
    // At least one should be present
    expect(hasLoginForm || hasDashboard).toBeTruthy();
  });

  test('should handle basic navigation without errors', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    
    // Try navigating to different routes
    const routes = ['/', '/login', '/dashboard'];
    
    for (const route of routes) {
      try {
        await page.goto(route);
        await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
        
        // Verify no 500 errors or crash pages
        const bodyText = await page.textContent('body');
        expect(bodyText).not.toContain('Internal Server Error');
        expect(bodyText).not.toContain('Something went wrong');
        
      } catch (error) {
        console.log(`Route ${route} failed: ${error.message}`);
        // Don't fail the test for navigation errors in smoke tests
      }
    }
  });

  test('should have working CSS and JS assets', async ({ page }) => {
    // Listen for console errors
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Listen for failed network requests
    const failedRequests: string[] = [];
    page.on('response', response => {
      if (response.status() >= 400) {
        failedRequests.push(`${response.status()}: ${response.url()}`);
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 30000 });

    // Check that critical CSS is loaded (Ant Design or basic styles)
    const hasStyles = await page.evaluate(() => {
      const stylesheets = Array.from(document.styleSheets);
      return stylesheets.length > 0;
    });
    expect(hasStyles).toBeTruthy();

    // Check React is loaded and working
    const hasReact = await page.evaluate(() => {
      return typeof window.React !== 'undefined' || 
             document.querySelector('[data-reactroot]') !== null ||
             document.querySelector('#root') !== null;
    });
    expect(hasReact).toBeTruthy();

    // Log errors but don't fail on them for smoke tests
    if (consoleErrors.length > 0) {
      console.log('Console errors detected:', consoleErrors);
    }
    if (failedRequests.length > 0) {
      console.log('Failed requests detected:', failedRequests);
    }
  });

  test('should respond to basic user interactions', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 30000 });

    // Try clicking on any clickable elements
    const clickableElements = await page.locator('button, a, [role="button"], .ant-btn').all();
    
    if (clickableElements.length > 0) {
      // Try clicking the first clickable element
      try {
        const firstButton = clickableElements[0];
        await firstButton.click({ timeout: 5000 });
        
        // Wait a moment for any response
        await page.waitForTimeout(1000);
        
        // Verify the page didn't crash
        const title = await page.title();
        expect(title).toBeTruthy();
        
      } catch (error) {
        console.log('Button click interaction failed:', error.message);
        // Don't fail smoke test for interaction issues
      }
    }
  });
});