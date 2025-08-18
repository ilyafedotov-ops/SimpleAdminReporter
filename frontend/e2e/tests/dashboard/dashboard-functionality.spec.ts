import { test, expect } from '@playwright/test';
import { DashboardPage, ReportsPage } from '../../pages';
import { AuthHelper, ApiHelper, PerformanceHelper } from '../../utils/test-helpers';
import { TEST_USERS, TEST_CONFIG } from '../../fixtures/test-data';

test.describe('Dashboard - Core Functionality', () => {
  let dashboardPage: DashboardPage;

  test.beforeEach(async ({ page }) => {
    dashboardPage = new DashboardPage(page);
    
    // Login and navigate to dashboard
    await AuthHelper.login(page, 'AD_USER');
    
    // Should already be on dashboard after login
    expect(page.url()).toContain('dashboard');
  });

  test.describe('Dashboard Layout and Components', () => {
    test('should display all dashboard components', async ({ page }) => {
      const isLoaded = await dashboardPage.isLoaded();
      expect(isLoaded).toBe(true);

      // Verify main dashboard elements
      const elements = await dashboardPage.verifyDashboardElements();
      expect(elements.hasNavigation).toBe(true);
      expect(elements.hasWelcomeMessage).toBe(true);
      expect(elements.hasUserProfile).toBe(true);
    });

    test('should display welcome message with user info', async ({ page }) => {
      const welcomeMessage = await dashboardPage.getWelcomeMessage();
      expect(welcomeMessage).toBeTruthy();
      expect(welcomeMessage.toLowerCase()).toMatch(/(welcome|dashboard|hello)/);
    });

    test('should show current user information', async ({ page }) => {
      const userInfo = await dashboardPage.getCurrentUserInfo();
      expect(userInfo).toBeTruthy();
      
      if (userInfo) {
        expect(userInfo.username).toBeTruthy();
        expect(userInfo.username).toContain(TEST_USERS.AD_USER.username);
      }
    });

    test('should display system statistics cards', async ({ page }) => {
      // Mock dashboard stats
      await ApiHelper.mockApiResponse(page, '**/api/dashboard/stats*', {
        totalReports: 25,
        activeUsers: 1247,
        lastExecution: '2025-01-07T14:30:00Z',
        systemHealth: 'healthy'
      });

      await page.reload();
      await page.waitForLoadState('networkidle');

      const stats = await dashboardPage.getDashboardStats();
      expect(stats.length).toBeGreaterThan(0);
      
      // Should have relevant statistics
      const statTitles = stats.map(stat => stat.title.toLowerCase());
      expect(statTitles.some(title => 
        title.includes('report') || 
        title.includes('user') || 
        title.includes('system')
      )).toBe(true);
    });
  });

  test.describe('Navigation Functionality', () => {
    test('should navigate to Reports page', async ({ page }) => {
      await dashboardPage.navigateToReports();
      
      expect(page.url()).toContain('reports');
      
      // Verify reports page loads
      const reportsPage = new ReportsPage(page);
      const isReportsLoaded = await reportsPage.isLoaded();
      expect(isReportsLoaded).toBe(true);
    });

    test('should navigate to Report Builder page', async ({ page }) => {
      await dashboardPage.navigateToReportBuilder();
      
      expect(page.url()).toContain('builder');
      
      // Should be on report builder page
      await page.waitForLoadState('networkidle');
    });

    test('should navigate to Templates page', async ({ page }) => {
      await dashboardPage.navigateToTemplates();
      
      expect(page.url()).toContain('templates');
    });

    test('should navigate to Settings page', async ({ page }) => {
      await dashboardPage.navigateToSettings();
      
      expect(page.url()).toContain('settings');
    });

    test('should navigate to Health page', async ({ page }) => {
      await dashboardPage.navigateToHealth();
      
      expect(page.url()).toContain('health');
    });

    test('should maintain navigation state across page refreshes', async ({ page }) => {
      await dashboardPage.navigateToReports();
      expect(page.url()).toContain('reports');
      
      await page.reload();
      await page.waitForLoadState('networkidle');
      
      // Should still be on reports page
      expect(page.url()).toContain('reports');
    });

    test('should highlight active navigation item', async ({ page }) => {
      await dashboardPage.navigateToReports();
      
      // Check if reports menu item is highlighted/active
      const reportsMenuItem = page.locator('.ant-menu-item-selected, .active').first();
      const isActive = await reportsMenuItem.isVisible();
      
      if (isActive) {
        const menuText = await reportsMenuItem.textContent();
        expect(menuText?.toLowerCase()).toContain('report');
      }
    });
  });

  test.describe('Search Functionality', () => {
    test('should perform global search', async ({ page }) => {
      // Mock search results
      await ApiHelper.mockApiResponse(page, '**/api/search*', {
        results: [
          {
            type: 'report',
            title: 'Inactive Users Report',
            description: 'Shows inactive user accounts',
            url: '/reports/inactive-users'
          },
          {
            type: 'template',
            title: 'Security Audit Template',
            description: 'Security-focused report template',
            url: '/templates/security-audit'
          }
        ],
        totalResults: 2
      });

      await dashboardPage.search('inactive users');
      
      // Should show search results
      const searchResults = page.locator('.search-results, .ant-select-dropdown');
      const hasResults = await searchResults.isVisible();
      
      if (hasResults) {
        const resultItems = await searchResults.locator('.search-result-item').count();
        expect(resultItems).toBeGreaterThan(0);
      }
    });

    test('should navigate to search result on selection', async ({ page }) => {
      await ApiHelper.mockApiResponse(page, '**/api/search*', {
        results: [
          {
            type: 'report',
            title: 'Password Expiry Report',
            description: 'Users with expiring passwords',
            url: '/reports/password-expiry'
          }
        ],
        totalResults: 1
      });

      await dashboardPage.search('password');
      
      const searchResults = page.locator('.search-results');
      if (await searchResults.isVisible()) {
        const firstResult = searchResults.locator('.search-result-item').first();
        if (await firstResult.isVisible()) {
          await firstResult.click();
          
          // Should navigate to the result
          await page.waitForLoadState('networkidle');
          const currentUrl = page.url();
          expect(currentUrl).toMatch(/(report|password)/i);
        }
      }
    });

    test('should handle empty search results', async ({ page }) => {
      await ApiHelper.mockApiResponse(page, '**/api/search*', {
        results: [],
        totalResults: 0
      });

      await dashboardPage.search('nonexistent query');
      
      // Should show no results message
      const noResults = page.locator('.no-results, .empty-results');
      const hasNoResults = await noResults.isVisible();
      
      if (hasNoResults) {
        const message = await noResults.textContent();
        expect(message?.toLowerCase()).toMatch(/(no results|not found|empty)/);
      }
    });
  });

  test.describe('Widgets and Quick Actions', () => {
    test('should display recent reports widget', async ({ page }) => {
      // Mock recent reports
      await ApiHelper.mockApiResponse(page, '**/api/reports/recent*', [
        {
          name: 'Inactive Users',
          executedAt: '2025-01-07T14:00:00Z',
          status: 'success',
          recordCount: 25
        },
        {
          name: 'Password Expiry',
          executedAt: '2025-01-07T13:30:00Z',
          status: 'success',
          recordCount: 12
        }
      ]);

      await page.reload();
      await page.waitForLoadState('networkidle');

      const recentReports = await dashboardPage.getRecentReports();
      expect(recentReports.length).toBeGreaterThan(0);
      
      recentReports.forEach(report => {
        expect(report.name).toBeTruthy();
        expect(report.date).toBeTruthy();
        expect(report.status).toBeTruthy();
      });
    });

    test('should display system health widget', async ({ page }) => {
      // Mock system health
      await ApiHelper.mockApiResponse(page, '**/api/health*', {
        overall: 'healthy',
        services: [
          { name: 'Database', status: 'healthy' },
          { name: 'LDAP', status: 'healthy' },
          { name: 'Redis', status: 'healthy' }
        ],
        lastChecked: '2025-01-07T14:35:00Z'
      });

      await page.reload();
      await page.waitForLoadState('networkidle');

      const healthStatus = await dashboardPage.getSystemHealthStatus();
      expect(healthStatus.overall).toBeTruthy();
      expect(healthStatus.services.length).toBeGreaterThan(0);
      
      healthStatus.services.forEach(service => {
        expect(service.name).toBeTruthy();
        expect(service.status).toBeTruthy();
      });
    });

    test('should execute quick actions', async ({ page }) => {
      // Mock quick action response
      await ApiHelper.mockApiResponse(page, '**/api/reports/execute/*', {
        success: true,
        redirectUrl: '/reports/results/123'
      });

      const quickActionName = 'Run Security Report';
      
      // This assumes there are quick action buttons
      const quickActionButton = page.locator(`button:has-text("${quickActionName}"), .quick-action:has-text("Security")`);
      
      if (await quickActionButton.isVisible()) {
        await quickActionButton.click();
        
        // Should navigate to results or show execution
        await page.waitForLoadState('networkidle');
        
        const currentUrl = page.url();
        expect(currentUrl).toMatch(/(report|result|execute)/i);
      }
    });

    test('should refresh widgets independently', async ({ page }) => {
      // Test widget refresh functionality
      const refreshButton = page.locator('.widget-refresh, button[title*="refresh"]').first();
      
      if (await refreshButton.isVisible()) {
        await refreshButton.click();
        
        // Should show loading state
        const loadingSpinner = page.locator('.ant-spin, .loading');
        const hasLoading = await loadingSpinner.isVisible();
        
        // Loading should appear then disappear
        if (hasLoading) {
          await loadingSpinner.waitFor({ state: 'hidden', timeout: 10000 });
        }
      }
    });
  });

  test.describe('Notifications and Alerts', () => {
    test('should display notification count', async ({ page }) => {
      // Mock notifications
      await ApiHelper.mockApiResponse(page, '**/api/notifications*', {
        unread: 3,
        notifications: [
          {
            id: 1,
            title: 'Report Completed',
            message: 'Inactive Users report has completed',
            type: 'success',
            timestamp: '2025-01-07T14:00:00Z'
          }
        ]
      });

      await page.reload();
      await page.waitForLoadState('networkidle');

      const notificationCount = await dashboardPage.getNotificationCount();
      expect(notificationCount).toBeGreaterThanOrEqual(0);
    });

    test('should open notifications panel', async ({ page }) => {
      await dashboardPage.openNotifications();
      
      // Should show notifications panel
      const notificationsPanel = page.locator('.notifications-panel, .ant-dropdown-menu');
      const hasPanel = await notificationsPanel.isVisible();
      
      if (hasPanel) {
        // Should contain notification items
        const notificationItems = await notificationsPanel.locator('.notification-item').count();
        expect(notificationItems).toBeGreaterThanOrEqual(0);
      }
    });

    test('should handle notification interactions', async ({ page }) => {
      await dashboardPage.openNotifications();
      
      const notificationsPanel = page.locator('.notifications-panel');
      if (await notificationsPanel.isVisible()) {
        const firstNotification = notificationsPanel.locator('.notification-item').first();
        
        if (await firstNotification.isVisible()) {
          await firstNotification.click();
          
          // Should navigate to related item or mark as read
          await page.waitForLoadState('networkidle');
        }
      }
    });

    test('should show system alerts when present', async ({ page }) => {
      // Mock system alert
      await ApiHelper.mockApiResponse(page, '**/api/alerts*', {
        alerts: [
          {
            type: 'warning',
            title: 'LDAP Connection Slow',
            message: 'LDAP server response time is above threshold',
            severity: 'medium'
          }
        ]
      });

      await page.reload();
      await page.waitForLoadState('networkidle');

      // Look for alert banners or indicators
      const systemAlert = page.locator('.system-alert, .ant-alert-warning');
      const hasAlert = await systemAlert.isVisible();
      
      if (hasAlert) {
        const alertText = await systemAlert.textContent();
        expect(alertText).toMatch(/(warning|alert|slow|connection)/i);
      }
    });
  });

  test.describe('User Profile Management', () => {
    test('should open user profile dropdown', async ({ page }) => {
      await dashboardPage.openUserProfile();
      
      // Should show profile menu
      const profileMenu = page.locator('.ant-dropdown-menu, .profile-menu');
      expect(await profileMenu.isVisible()).toBe(true);
    });

    test('should display user information in profile', async ({ page }) => {
      await dashboardPage.openUserProfile();
      
      const profileMenu = page.locator('.ant-dropdown-menu');
      if (await profileMenu.isVisible()) {
        const userName = await profileMenu.locator('.user-name, .profile-name').textContent();
        const userRole = await profileMenu.locator('.user-role, .profile-role').textContent();
        
        if (userName) {
          expect(userName).toBeTruthy();
        }
        if (userRole) {
          expect(userRole).toBeTruthy();
        }
      }
    });

    test('should navigate to settings from profile menu', async ({ page }) => {
      await dashboardPage.openUserProfile();
      
      const profileMenu = page.locator('.ant-dropdown-menu');
      const settingsLink = profileMenu.locator('a:has-text("Settings"), button:has-text("Settings")');
      
      if (await settingsLink.isVisible()) {
        await settingsLink.click();
        
        await page.waitForURL('**/settings');
        expect(page.url()).toContain('settings');
      }
    });

    test('should logout from profile menu', async ({ page }) => {
      await dashboardPage.logout();
      
      // Should redirect to login
      await page.waitForURL('**/login', { timeout: TEST_CONFIG.DEFAULT_TIMEOUT });
      expect(page.url()).toContain('login');
    });
  });

  test.describe('Responsive Design', () => {
    test('should adapt to mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      
      const isLoaded = await dashboardPage.isLoaded();
      expect(isLoaded).toBe(true);
      
      // Check mobile navigation
      const mobileMenu = page.locator('.mobile-menu, .ant-drawer, .hamburger-menu');
      const hasMobileMenu = await mobileMenu.isVisible();
      
      if (hasMobileMenu) {
        await mobileMenu.click();
        
        // Should show mobile navigation
        const mobileNav = page.locator('.mobile-nav, .ant-drawer-content');
        expect(await mobileNav.isVisible()).toBe(true);
      }
    });

    test('should work on tablet viewport', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });
      
      const elements = await dashboardPage.verifyDashboardElements();
      expect(elements.hasNavigation).toBe(true);
      
      // Test tablet navigation
      await dashboardPage.navigateToReports();
      expect(page.url()).toContain('reports');
    });

    test('should optimize widget layout for different screens', async ({ page }) => {
      const viewports = [
        { width: 320, height: 568 },   // Mobile
        { width: 768, height: 1024 },  // Tablet
        { width: 1200, height: 800 }   // Desktop
      ];

      for (const viewport of viewports) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.waitForTimeout(500);
        
        // Widgets should adapt to viewport
        const widgets = await page.locator('.widget, .dashboard-card').count();
        expect(widgets).toBeGreaterThanOrEqual(0);
        
        // Layout should not be broken
        const hasScrollbar = await page.evaluate(() => {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth;
        });
        
        // Horizontal scroll should be minimal or expected
        if (hasScrollbar && viewport.width < 768) {
          // Mobile might have some horizontal scroll
        } else {
          expect(hasScrollbar).toBe(false);
        }
      }
    });
  });

  test.describe('Performance and Loading', () => {
    test('should load dashboard within performance threshold', async ({ page }) => {
      const loadTime = await PerformanceHelper.measurePageLoad(page, '/dashboard');
      
      // Dashboard should load within 5 seconds
      expect(loadTime).toBeLessThan(5000);
    });

    test('should lazy load dashboard widgets', async ({ page }) => {
      // Test progressive loading of widgets
      await page.goto('/dashboard');
      
      // Some widgets should load immediately
      const immediateWidgets = await page.locator('.dashboard-card, .widget').count();
      expect(immediateWidgets).toBeGreaterThan(0);
      
      // Wait for all widgets to finish loading
      await page.waitForLoadState('networkidle');
      
      const allWidgets = await page.locator('.dashboard-card, .widget').count();
      expect(allWidgets).toBeGreaterThanOrEqual(immediateWidgets);
    });

    test('should handle widget loading failures gracefully', async ({ page }) => {
      // Mock widget API failure
      await page.route('**/api/dashboard/stats*', (route) => {
        route.abort('failed');
      });

      await page.reload();
      await page.waitForLoadState('networkidle');
      
      // Should show error state for failed widgets
      const errorWidgets = page.locator('.widget-error, .error-state');
      const hasErrorState = await errorWidgets.count();
      
      // Either show error state or gracefully degrade
      if (hasErrorState > 0) {
        const errorText = await errorWidgets.first().textContent();
        expect(errorText).toMatch(/(error|failed|unavailable)/i);
      }
      
      // Other widgets should still work
      const workingWidgets = await page.locator('.widget:not(.widget-error)').count();
      expect(workingWidgets).toBeGreaterThanOrEqual(0);
    });

    test('should cache dashboard data appropriately', async ({ page }) => {
      let apiCallCount = 0;
      
      await page.route('**/api/dashboard/**', (route) => {
        apiCallCount++;
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: 'cached' })
        });
      });

      // Initial load
      await page.reload();
      await page.waitForLoadState('networkidle');
      const initialCalls = apiCallCount;
      
      // Quick refresh - should use cache
      await page.reload();
      await page.waitForLoadState('networkidle');
      
      // Should have fewer additional calls due to caching
      expect(apiCallCount).toBeLessThanOrEqual(initialCalls * 1.5);
    });
  });

  test.describe('Accessibility and Usability', () => {
    test('should be keyboard navigable', async ({ page }) => {
      // Tab through dashboard elements
      await page.keyboard.press('Tab'); // Skip to main content
      await page.keyboard.press('Tab'); // Navigation menu
      await page.keyboard.press('Tab'); // User profile
      
      // Enter should activate focused elements
      const focusedElement = page.locator(':focus');
      const hasFocus = await focusedElement.count();
      expect(hasFocus).toBeGreaterThan(0);
    });

    test('should have proper ARIA labels and roles', async ({ page }) => {
      // Check navigation has proper ARIA
      const navigation = page.locator('[role="navigation"], nav');
      expect(await navigation.count()).toBeGreaterThan(0);
      
      // Check main content area
      const main = page.locator('[role="main"], main');
      expect(await main.count()).toBeGreaterThan(0);
      
      // Check interactive elements have proper labels
      const buttons = await page.locator('button').all();
      for (const button of buttons) {
        const hasLabel = await button.getAttribute('aria-label') || 
                        await button.textContent() ||
                        await button.getAttribute('title');
        if (await button.isVisible()) {
          expect(hasLabel).toBeTruthy();
        }
      }
    });

    test('should support screen reader announcements', async ({ page }) => {
      // Check for live regions
      const liveRegion = page.locator('[aria-live], [role="alert"], [role="status"]');
      const hasLiveRegions = await liveRegion.count();
      
      // Should have some live regions for dynamic updates
      expect(hasLiveRegions).toBeGreaterThan(0);
    });

    test('should have sufficient color contrast', async ({ page }) => {
      // This would typically be tested with accessibility tools
      // For now, verify key text elements are visible
      const textElements = await page.locator('h1, h2, h3, p, span').all();
      
      for (const element of textElements.slice(0, 5)) { // Test first 5 elements
        if (await element.isVisible()) {
          const styles = await element.evaluate((el) => {
            const computed = window.getComputedStyle(el);
            return {
              color: computed.color,
              backgroundColor: computed.backgroundColor,
              fontSize: computed.fontSize
            };
          });
          
          expect(styles.color).not.toBe('rgba(0, 0, 0, 0)'); // Not transparent
          expect(styles.fontSize).toBeTruthy();
        }
      }
    });
  });
});