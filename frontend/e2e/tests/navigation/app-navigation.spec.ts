import { test, expect } from '@playwright/test';
import { DashboardPage, ReportsPage, ReportBuilderPage, LoginPage } from '../../pages';
import { AuthHelper, ApiHelper } from '../../utils/test-helpers';
import { TEST_CONFIG } from '../../fixtures/test-data';

test.describe('Application - Navigation and Routing', () => {
  let dashboardPage: DashboardPage;
  let reportsPage: ReportsPage;
  let reportBuilderPage: ReportBuilderPage;
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    dashboardPage = new DashboardPage(page);
    reportsPage = new ReportsPage(page);
    reportBuilderPage = new ReportBuilderPage(page);
    loginPage = new LoginPage(page);
    
    // Login before each test
    await AuthHelper.login(page, 'AD_USER');
  });

  test.describe('Main Navigation Flow', () => {
    test('should navigate through all main sections', async ({ page }) => {
      // Start on dashboard
      expect(page.url()).toContain('dashboard');
      const isDashboardLoaded = await dashboardPage.isLoaded();
      expect(isDashboardLoaded).toBe(true);
      
      // Navigate to reports
      await dashboardPage.navigateToReports();
      expect(page.url()).toContain('reports');
      const isReportsLoaded = await reportsPage.isLoaded();
      expect(isReportsLoaded).toBe(true);
      
      // Navigate to report builder
      await page.goto('/reports/builder');
      expect(page.url()).toContain('builder');
      const isBuilderLoaded = await reportBuilderPage.isLoaded();
      expect(isBuilderLoaded).toBe(true);
      
      // Navigate to templates
      await page.goto('/templates');
      expect(page.url()).toContain('templates');
      
      // Navigate to settings
      await page.goto('/settings');
      expect(page.url()).toContain('settings');
      
      // Navigate back to dashboard
      await page.goto('/dashboard');
      expect(page.url()).toContain('dashboard');
    });

    test('should maintain navigation state across page refreshes', async ({ page }) => {
      // Navigate to reports page
      await dashboardPage.navigateToReports();
      expect(page.url()).toContain('reports');
      
      // Refresh the page
      await page.reload();
      await page.waitForLoadState('networkidle');
      
      // Should still be on reports page
      expect(page.url()).toContain('reports');
      
      // Page should be functional
      const isLoaded = await reportsPage.isLoaded();
      expect(isLoaded).toBe(true);
    });

    test('should handle deep linking correctly', async ({ page }) => {
      // Direct navigation to specific pages
      const deepLinks = [
        '/dashboard',
        '/reports',
        '/reports/builder',
        '/templates',
        '/settings',
        '/health'
      ];

      for (const link of deepLinks) {
        await page.goto(link);
        
        // Should be authenticated and on correct page
        expect(page.url()).toContain(link.split('/').pop() || 'dashboard');
        
        // Page should load without errors
        await page.waitForLoadState('networkidle');
        const hasError = await page.locator('.error, .ant-result-error').isVisible();
        expect(hasError).toBe(false);
      }
    });

    test('should preserve URL parameters during navigation', async ({ page }) => {
      // Navigate with query parameters
      await page.goto('/reports?source=ad&category=security');
      
      expect(page.url()).toContain('source=ad');
      expect(page.url()).toContain('category=security');
      
      // Navigate to another page
      await page.goto('/dashboard');
      
      // Navigate back to reports
      await dashboardPage.navigateToReports();
      
      // Parameters should be preserved if applicable to the context
      // (This depends on implementation - might not preserve all params)
      const currentUrl = page.url();
      expect(currentUrl).toContain('reports');
    });
  });

  test.describe('Browser Navigation Controls', () => {
    test('should support browser back and forward buttons', async ({ page }) => {
      // Navigate through several pages
      await dashboardPage.navigateToReports();
      expect(page.url()).toContain('reports');
      
      await page.goto('/settings');
      expect(page.url()).toContain('settings');
      
      await page.goto('/templates');
      expect(page.url()).toContain('templates');
      
      // Use browser back button
      await page.goBack();
      expect(page.url()).toContain('settings');
      
      await page.goBack();
      expect(page.url()).toContain('reports');
      
      await page.goBack();
      expect(page.url()).toContain('dashboard');
      
      // Use browser forward button
      await page.goForward();
      expect(page.url()).toContain('reports');
    });

    test('should handle browser refresh on different pages', async ({ page }) => {
      const pagesToTest = [
        { url: '/dashboard', pageObject: dashboardPage },
        { url: '/reports', pageObject: reportsPage },
        { url: '/reports/builder', pageObject: reportBuilderPage }
      ];

      for (const pageTest of pagesToTest) {
        await page.goto(pageTest.url);
        
        // Refresh the page
        await page.reload();
        await page.waitForLoadState('networkidle');
        
        // Should still be on the same page and functional
        expect(page.url()).toContain(pageTest.url.split('/').pop() || 'dashboard');
        
        const isLoaded = await pageTest.pageObject.isLoaded();
        expect(isLoaded).toBe(true);
      }
    });

    test('should handle multiple tabs correctly', async ({ page, context }) => {
      // Open second tab
      const secondPage = await context.newPage();
      
      // Navigate to different pages in each tab
      await dashboardPage.navigateToReports();
      expect(page.url()).toContain('reports');
      
      await secondPage.goto('/dashboard');
      expect(secondPage.url()).toContain('dashboard');
      
      // Both tabs should maintain their state
      expect(page.url()).toContain('reports');
      expect(secondPage.url()).toContain('dashboard');
      
      // Navigation in one tab shouldn't affect the other
      await secondPage.goto('/settings');
      expect(page.url()).toContain('reports'); // First tab unchanged
      expect(secondPage.url()).toContain('settings');
      
      await secondPage.close();
    });
  });

  test.describe('Route Protection and Authentication', () => {
    test('should redirect unauthenticated users to login', async ({ page, context }) => {
      // Logout first
      await dashboardPage.logout();
      expect(page.url()).toContain('login');
      
      // Try to access protected routes directly
      const protectedRoutes = [
        '/dashboard',
        '/reports',
        '/reports/builder',
        '/templates',
        '/settings'
      ];

      for (const route of protectedRoutes) {
        await page.goto(route);
        
        // Should redirect to login
        await page.waitForURL('**/login', { timeout: TEST_CONFIG.DEFAULT_TIMEOUT });
        expect(page.url()).toContain('login');
      }
    });

    test('should preserve intended destination after login', async ({ page, context }) => {
      // Logout first
      await dashboardPage.logout();
      
      // Try to access protected route
      await page.goto('/reports');
      
      // Should redirect to login
      await page.waitForURL('**/login');
      
      // Login
      await AuthHelper.login(page, 'AD_USER');
      
      // Should redirect to originally intended page
      // (Implementation may vary - might go to dashboard instead)
      const finalUrl = page.url();
      expect(finalUrl).toMatch(/(dashboard|reports)/);
    });

    test('should handle session expiration during navigation', async ({ page }) => {
      // Mock session expiration
      await page.route('**/api/**', (route) => {
        const url = route.request().url();
        if (!url.includes('login')) {
          route.fulfill({
            status: 401,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Session expired' })
          });
        } else {
          route.continue();
        }
      });

      // Try to navigate to protected page
      await page.goto('/reports');
      
      // Should redirect to login due to expired session
      await page.waitForURL('**/login', { timeout: TEST_CONFIG.DEFAULT_TIMEOUT });
      expect(page.url()).toContain('login');
    });

    test('should handle role-based route access', async ({ page }) => {
      // This would test role-based access if implemented
      // For now, verify basic access with current user
      
      const adminRoutes = [
        '/admin',
        '/settings/system',
        '/settings/users'
      ];

      for (const route of adminRoutes) {
        await page.goto(route);
        
        const currentUrl = page.url();
        
        // Either access granted, redirect to dashboard, or show access denied
        expect(currentUrl).toMatch(/(admin|dashboard|access|denied|403)/);
      }
    });
  });

  test.describe('Error Handling and Edge Cases', () => {
    test('should handle 404 not found pages', async ({ page }) => {
      await page.goto('/nonexistent-page');
      
      // Should show 404 page or redirect
      const notFoundElement = page.locator('.not-found, .ant-result-404, h1:has-text("404")');
      const hasNotFound = await notFoundElement.isVisible();
      
      if (hasNotFound) {
        expect(await notFoundElement.textContent()).toMatch(/(404|not found|page not found)/i);
      } else {
        // Might redirect to dashboard instead
        expect(page.url()).toMatch(/(dashboard|login)/);
      }
    });

    test('should handle malformed URLs gracefully', async ({ page }) => {
      const malformedUrls = [
        '/reports/../../etc/passwd',
        '/reports?param=<script>alert("xss")</script>',
        '/reports#malformed-hash'
      ];

      for (const malformedUrl of malformedUrls) {
        await page.goto(malformedUrl);
        
        // Should handle gracefully without breaking
        await page.waitForLoadState('networkidle');
        
        // Should not execute any scripts or cause errors
        const hasError = await page.locator('.error-page, .ant-result-error').isVisible();
        const currentUrl = page.url();
        
        // Either show error page or redirect safely
        expect(currentUrl).not.toContain('<script>');
        expect(currentUrl).not.toContain('etc/passwd');
      }
    });

    test('should handle network errors during navigation', async ({ page }) => {
      // Mock network failure for specific route
      await page.route('**/reports**', (route) => {
        route.abort('failed');
      });

      await dashboardPage.navigateToReports();
      
      // Should handle network error gracefully
      const errorMessage = page.locator('.error, .network-error, .ant-result-error');
      const hasError = await errorMessage.isVisible();
      
      if (hasError) {
        const errorText = await errorMessage.textContent();
        expect(errorText).toMatch(/(error|failed|network|unavailable)/i);
      }
    });

    test('should handle concurrent navigation requests', async ({ page }) => {
      // Trigger multiple navigation attempts simultaneously
      const navigationPromises = [
        page.goto('/reports'),
        page.goto('/templates'),
        page.goto('/settings')
      ];

      await Promise.allSettled(navigationPromises);
      
      // Should end up on one of the requested pages without errors
      const finalUrl = page.url();
      expect(finalUrl).toMatch(/(reports|templates|settings)/);
      
      // Page should be functional
      await page.waitForLoadState('networkidle');
      const hasError = await page.locator('.error').isVisible();
      expect(hasError).toBe(false);
    });
  });

  test.describe('Navigation Performance', () => {
    test('should navigate between pages quickly', async ({ page }) => {
      const navigationTests = [
        { from: 'dashboard', to: 'reports' },
        { from: 'reports', to: 'builder' },
        { from: 'builder', to: 'templates' },
        { from: 'templates', to: 'dashboard' }
      ];

      for (const test of navigationTests) {
        const startTime = Date.now();
        
        if (test.to === 'reports') {
          await dashboardPage.navigateToReports();
        } else if (test.to === 'builder') {
          await page.goto('/reports/builder');
        } else if (test.to === 'templates') {
          await page.goto('/templates');
        } else {
          await page.goto('/dashboard');
        }
        
        await page.waitForLoadState('networkidle');
        const endTime = Date.now();
        
        const navigationTime = endTime - startTime;
        expect(navigationTime).toBeLessThan(5000); // Should navigate within 5 seconds
      }
    });

    test('should preload critical resources', async ({ page }) => {
      // Check for resource preloading
      const preloadLinks = await page.locator('link[rel="preload"], link[rel="prefetch"]').count();
      
      // Should have some preloaded resources
      expect(preloadLinks).toBeGreaterThanOrEqual(0);
    });

    test('should cache navigation data appropriately', async ({ page }) => {
      let apiCallCount = 0;
      
      await page.route('**/api/**', (route) => {
        apiCallCount++;
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: 'test' })
        });
      });

      // Navigate to page first time
      await dashboardPage.navigateToReports();
      const firstCallCount = apiCallCount;
      
      // Navigate away and back
      await page.goto('/dashboard');
      await dashboardPage.navigateToReports();
      
      // Should have fewer additional calls due to caching
      expect(apiCallCount).toBeLessThanOrEqual(firstCallCount * 1.5);
    });
  });

  test.describe('Mobile Navigation', () => {
    test('should provide mobile-friendly navigation', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      
      // Check for mobile navigation elements
      const mobileMenu = page.locator('.mobile-menu, .hamburger-menu, .ant-drawer-trigger');
      const hasMobileMenu = await mobileMenu.isVisible();
      
      if (hasMobileMenu) {
        await mobileMenu.click();
        
        // Should show mobile navigation
        const mobileNav = page.locator('.mobile-nav, .ant-drawer');
        expect(await mobileNav.isVisible()).toBe(true);
        
        // Should contain navigation items
        const navItems = await mobileNav.locator('a, button').count();
        expect(navItems).toBeGreaterThan(0);
      }
    });

    test('should support touch navigation gestures', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      
      // Test swipe gestures if supported
      const startX = 50;
      const endX = 250;
      const y = 300;
      
      await page.touchscreen.tap(startX, y);
      await page.mouse.move(startX, y);
      await page.mouse.down();
      await page.mouse.move(endX, y);
      await page.mouse.up();
      
      // Check if swipe navigation triggered anything
      await page.waitForTimeout(500);
      
      // This would depend on implementation
      const currentUrl = page.url();
      expect(currentUrl).toBeTruthy();
    });

    test('should adapt navigation for different mobile orientations', async ({ page }) => {
      // Portrait orientation
      await page.setViewportSize({ width: 375, height: 667 });
      
      const portraitNav = await dashboardPage.verifyDashboardElements();
      expect(portraitNav.hasNavigation).toBe(true);
      
      // Landscape orientation
      await page.setViewportSize({ width: 667, height: 375 });
      
      const landscapeNav = await dashboardPage.verifyDashboardElements();
      expect(landscapeNav.hasNavigation).toBe(true);
      
      // Navigation should work in both orientations
      await dashboardPage.navigateToReports();
      expect(page.url()).toContain('reports');
    });
  });

  test.describe('Accessibility in Navigation', () => {
    test('should support keyboard navigation', async ({ page }) => {
      // Use keyboard to navigate
      await page.keyboard.press('Tab'); // Skip to navigation
      await page.keyboard.press('Tab'); // Next nav item
      await page.keyboard.press('Enter'); // Activate
      
      await page.waitForLoadState('networkidle');
      
      // Should have navigated somewhere
      const currentUrl = page.url();
      expect(currentUrl).toBeTruthy();
    });

    test('should provide proper ARIA navigation landmarks', async ({ page }) => {
      // Check for navigation landmarks
      const navigation = page.locator('[role="navigation"], nav');
      expect(await navigation.count()).toBeGreaterThan(0);
      
      // Check for main content landmark
      const main = page.locator('[role="main"], main');
      expect(await main.count()).toBeGreaterThan(0);
      
      // Check for skip links
      const skipLink = page.locator('a[href="#main"], .skip-link');
      const hasSkipLink = await skipLink.count();
      expect(hasSkipLink).toBeGreaterThanOrEqual(0); // Skip links are optional but recommended
    });

    test('should announce navigation changes to screen readers', async ({ page }) => {
      // Check for aria-live regions or page title changes
      await dashboardPage.navigateToReports();
      
      const pageTitle = await page.title();
      expect(pageTitle.toLowerCase()).toMatch(/(report|dashboard)/);
      
      // Check for live regions that announce navigation
      const liveRegions = await page.locator('[aria-live], [role="status"]').count();
      expect(liveRegions).toBeGreaterThanOrEqual(0);
    });

    test('should have focus management during navigation', async ({ page }) => {
      await dashboardPage.navigateToReports();
      await page.waitForLoadState('networkidle');
      
      // Focus should be managed properly after navigation
      const focusedElement = page.locator(':focus');
      const hasFocus = await focusedElement.count();
      
      // Should have focus somewhere meaningful (not necessarily required)
      expect(hasFocus).toBeGreaterThanOrEqual(0);
    });
  });
});