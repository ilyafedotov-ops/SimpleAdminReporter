import { test, expect } from '@playwright/test';
import { LoginPage, DashboardPage, ReportsPage, ReportBuilderPage, SettingsPage } from '../../pages';
import { AuthHelper, ApiHelper, VisualHelper } from '../../utils/test-helpers';
import { TEST_CONFIG } from '../../fixtures/test-data';

test.describe('Visual Regression Tests', () => {
  // Configure test for visual comparisons
  test.beforeEach(async ({ page }) => {
    // Set consistent viewport for visual tests
    await page.setViewportSize({ width: 1200, height: 800 });
    
    // Mock consistent data for visual tests
    await ApiHelper.mockApiResponse(page, '**/api/dashboard/stats*', {
      totalReports: 25,
      activeUsers: 1247,
      lastExecution: '2025-01-07T14:30:00Z',
      systemHealth: 'healthy'
    });
  });

  test.describe('Login Page Visual Tests', () => {
    test('should match login page layout', async ({ page }) => {
      const loginPage = new LoginPage(page);
      await loginPage.goto();
      
      // Wait for page to fully load
      await page.waitForLoadState('networkidle');
      
      // Take screenshot of full login page
      await expect(page).toHaveScreenshot('login-page-full.png');
      
      // Test login form specifically
      const loginForm = page.locator('form, .login-form');
      if (await loginForm.isVisible()) {
        await expect(loginForm).toHaveScreenshot('login-form.png');
      }
    });

    test('should match authentication source dropdown', async ({ page }) => {
      const loginPage = new LoginPage(page);
      await loginPage.goto();
      
      // Open authentication source dropdown
      await page.locator('.ant-select-selector').click();
      await page.waitForSelector('.ant-select-dropdown', { state: 'visible' });
      
      // Screenshot the dropdown options
      const dropdown = page.locator('.ant-select-dropdown');
      await expect(dropdown).toHaveScreenshot('auth-source-dropdown.png');
    });

    test('should match different authentication forms', async ({ page }) => {
      const loginPage = new LoginPage(page);
      await loginPage.goto();
      
      // Test AD authentication form
      await loginPage.selectAuthSource('ad');
      await expect(page.locator('form')).toHaveScreenshot('login-form-ad.png');
      
      // Test Azure AD authentication form
      await loginPage.selectAuthSource('azure');
      await expect(page.locator('form')).toHaveScreenshot('login-form-azure.png');
      
      // Test local authentication form
      await loginPage.selectAuthSource('local');
      await expect(page.locator('form')).toHaveScreenshot('login-form-local.png');
    });

    test('should match error states in login form', async ({ page }) => {
      const loginPage = new LoginPage(page);
      await loginPage.goto();
      
      // Mock login error
      await ApiHelper.mockApiResponse(page, '**/api/auth/login', {
        success: false,
        error: 'Invalid credentials provided'
      }, 401);
      
      // Attempt login with invalid credentials
      await loginPage.selectAuthSource('ad');
      await loginPage.enterUsername('invalid@domain.local');
      await loginPage.enterPassword('wrongpassword');
      await loginPage.clickLogin();
      
      // Wait for error to appear
      await page.waitForSelector('.ant-alert-error', { state: 'visible' });
      
      // Screenshot error state
      await expect(page).toHaveScreenshot('login-error-state.png');
    });
  });

  test.describe('Dashboard Visual Tests', () => {
    test('should match dashboard layout', async ({ page }) => {
      const dashboardPage = new DashboardPage(page);
      
      await AuthHelper.login(page, 'AD_USER');
      
      // Wait for all dashboard components to load
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000); // Allow for any animations
      
      // Full dashboard screenshot
      await expect(page).toHaveScreenshot('dashboard-full.png');
    });

    test('should match navigation menu states', async ({ page }) => {
      await AuthHelper.login(page, 'AD_USER');
      
      // Test collapsed navigation menu
      const navMenu = page.locator('.ant-layout-sider, nav');
      if (await navMenu.isVisible()) {
        await expect(navMenu).toHaveScreenshot('navigation-menu-expanded.png');
        
        // Test collapsed state if collapsible
        const collapseButton = page.locator('.ant-layout-sider-trigger, .nav-collapse');
        if (await collapseButton.isVisible()) {
          await collapseButton.click();
          await page.waitForTimeout(500);
          await expect(navMenu).toHaveScreenshot('navigation-menu-collapsed.png');
        }
      }
    });

    test('should match dashboard widgets', async ({ page }) => {
      await AuthHelper.login(page, 'AD_USER');
      await page.waitForLoadState('networkidle');
      
      // Test individual widgets
      const widgets = page.locator('.dashboard-card, .widget, .ant-card');
      const widgetCount = await widgets.count();
      
      for (let i = 0; i < Math.min(widgetCount, 6); i++) {
        const widget = widgets.nth(i);
        if (await widget.isVisible()) {
          await expect(widget).toHaveScreenshot(`dashboard-widget-${i}.png`);
        }
      }
    });

    test('should match user profile dropdown', async ({ page }) => {
      const dashboardPage = new DashboardPage(page);
      await AuthHelper.login(page, 'AD_USER');
      
      // Open user profile dropdown
      await dashboardPage.openUserProfile();
      await page.waitForSelector('.ant-dropdown-menu', { state: 'visible' });
      
      // Screenshot the dropdown
      const dropdown = page.locator('.ant-dropdown-menu');
      await expect(dropdown).toHaveScreenshot('user-profile-dropdown.png');
    });

    test('should match notification panel', async ({ page }) => {
      await AuthHelper.login(page, 'AD_USER');
      
      // Mock notifications
      await ApiHelper.mockApiResponse(page, '**/api/notifications*', {
        unread: 3,
        notifications: [
          {
            id: 1,
            title: 'Report Completed',
            message: 'Inactive Users report has completed successfully',
            type: 'success',
            timestamp: '2025-01-07T14:00:00Z'
          },
          {
            id: 2,
            title: 'System Alert',
            message: 'LDAP server response time is above threshold',
            type: 'warning',
            timestamp: '2025-01-07T13:45:00Z'
          }
        ]
      });
      
      // Open notifications
      const notificationBell = page.locator('[data-testid="notifications"], .notification-bell');
      if (await notificationBell.isVisible()) {
        await notificationBell.click();
        await page.waitForSelector('.notifications-panel, .ant-dropdown-menu', { state: 'visible' });
        
        const notificationsPanel = page.locator('.notifications-panel, .ant-dropdown-menu');
        await expect(notificationsPanel).toHaveScreenshot('notifications-panel.png');
      }
    });
  });

  test.describe('Reports Page Visual Tests', () => {
    test('should match reports page layout', async ({ page }) => {
      const reportsPage = new ReportsPage(page);
      
      await AuthHelper.login(page, 'AD_USER');
      await reportsPage.goto();
      await page.waitForLoadState('networkidle');
      
      // Mock reports data
      await ApiHelper.mockApiResponse(page, '**/api/reports/templates*', [
        {
          id: 1,
          name: 'Inactive Users',
          description: 'Find users who have not logged in recently',
          category: 'Security',
          dataSource: 'ad'
        },
        {
          id: 2,
          name: 'Password Expiry',
          description: 'Users with passwords expiring soon',
          category: 'Security',
          dataSource: 'ad'
        },
        {
          id: 3,
          name: 'Group Membership',
          description: 'Analyze group memberships',
          category: 'Administration',
          dataSource: 'ad'
        }
      ]);
      
      await page.reload();
      await page.waitForLoadState('networkidle');
      
      // Full reports page
      await expect(page).toHaveScreenshot('reports-page-full.png');
    });

    test('should match data source tabs', async ({ page }) => {
      const reportsPage = new ReportsPage(page);
      
      await AuthHelper.login(page, 'AD_USER');
      await reportsPage.goto();
      
      // Test each data source tab
      const tabsContainer = page.locator('.ant-tabs, [role="tablist"]');
      if (await tabsContainer.isVisible()) {
        await expect(tabsContainer).toHaveScreenshot('reports-data-source-tabs.png');
        
        // Test each tab selection
        await reportsPage.selectDataSource('ad');
        await page.waitForTimeout(500);
        await expect(tabsContainer).toHaveScreenshot('reports-tabs-ad-selected.png');
        
        await reportsPage.selectDataSource('azure');
        await page.waitForTimeout(500);
        await expect(tabsContainer).toHaveScreenshot('reports-tabs-azure-selected.png');
        
        await reportsPage.selectDataSource('o365');
        await page.waitForTimeout(500);
        await expect(tabsContainer).toHaveScreenshot('reports-tabs-o365-selected.png');
      }
    });

    test('should match report execution modal', async ({ page }) => {
      const reportsPage = new ReportsPage(page);
      
      await AuthHelper.login(page, 'AD_USER');
      await reportsPage.goto();
      await reportsPage.selectDataSource('ad');
      
      // Mock report execution
      await ApiHelper.mockApiResponse(page, '**/api/reports/execute/*', {
        success: true,
        data: {
          results: [
            { username: 'user1', displayName: 'User One', lastLogin: '2024-12-01' },
            { username: 'user2', displayName: 'User Two', lastLogin: '2024-11-15' }
          ],
          totalRecords: 2,
          executionTime: '1.2s'
        }
      });
      
      // Select and configure report
      await reportsPage.selectReport('Inactive Users');
      
      // Screenshot parameter form
      const parameterForm = page.locator('.parameters-form, form');
      if (await parameterForm.isVisible()) {
        await expect(parameterForm).toHaveScreenshot('report-parameters-form.png');
      }
      
      // Execute report
      await reportsPage.executeReport({ days: 90 });
      await reportsPage.waitForExecutionComplete();
      
      // Screenshot results
      const resultsTable = page.locator('.results-table, .ant-table, table');
      if (await resultsTable.isVisible()) {
        await expect(resultsTable).toHaveScreenshot('report-execution-results.png');
      }
    });

    test('should match report cards layout', async ({ page }) => {
      await AuthHelper.login(page, 'AD_USER');
      await page.goto('/reports');
      await page.waitForLoadState('networkidle');
      
      // Test report cards grid
      const reportsList = page.locator('.reports-list, .ant-list');
      if (await reportsList.isVisible()) {
        await expect(reportsList).toHaveScreenshot('reports-list-cards.png');
      }
      
      // Test individual report card
      const firstReportCard = page.locator('.report-item, .ant-list-item, .report-card').first();
      if (await firstReportCard.isVisible()) {
        await expect(firstReportCard).toHaveScreenshot('single-report-card.png');
      }
    });
  });

  test.describe('Report Builder Visual Tests', () => {
    test('should match report builder layout', async ({ page }) => {
      const reportBuilderPage = new ReportBuilderPage(page);
      
      await AuthHelper.login(page, 'AD_USER');
      await reportBuilderPage.goto();
      await page.waitForLoadState('networkidle');
      
      // Mock field discovery
      await ApiHelper.mockApiResponse(page, '**/api/reports/fields*', {
        categories: [
          {
            name: 'Basic Information',
            fields: [
              { name: 'sAMAccountName', type: 'string', description: 'Username' },
              { name: 'displayName', type: 'string', description: 'Display Name' },
              { name: 'mail', type: 'string', description: 'Email Address' }
            ]
          }
        ]
      });
      
      await reportBuilderPage.selectDataSource('ad');
      await page.waitForLoadState('networkidle');
      
      // Full report builder
      await expect(page).toHaveScreenshot('report-builder-full.png');
    });

    test('should match field explorer panel', async ({ page }) => {
      const reportBuilderPage = new ReportBuilderPage(page);
      
      await AuthHelper.login(page, 'AD_USER');
      await reportBuilderPage.goto();
      
      await ApiHelper.mockApiResponse(page, '**/api/reports/fields*', {
        categories: [
          {
            name: 'Basic Information',
            fields: [
              { name: 'sAMAccountName', type: 'string', description: 'Username' },
              { name: 'displayName', type: 'string', description: 'Display Name' }
            ]
          },
          {
            name: 'Security',
            fields: [
              { name: 'enabled', type: 'boolean', description: 'Account Enabled' },
              { name: 'lastLogon', type: 'datetime', description: 'Last Login Time' }
            ]
          }
        ]
      });
      
      await reportBuilderPage.selectDataSource('ad');
      
      const fieldsPanel = page.locator('.fields-panel, [data-testid="fields-panel"]');
      if (await fieldsPanel.isVisible()) {
        await expect(fieldsPanel).toHaveScreenshot('fields-explorer-panel.png');
      }
    });

    test('should match query builder components', async ({ page }) => {
      const reportBuilderPage = new ReportBuilderPage(page);
      
      await AuthHelper.login(page, 'AD_USER');
      await reportBuilderPage.goto();
      await reportBuilderPage.selectDataSource('ad');
      
      // Add some fields and filters
      await reportBuilderPage.addFieldToQuery('sAMAccountName');
      await reportBuilderPage.addFieldToQuery('displayName');
      await reportBuilderPage.addFilter('enabled', 'equals', 'true');
      
      await page.waitForTimeout(1000);
      
      // Screenshot query builder
      const queryBuilder = page.locator('.query-builder, [data-testid="query-builder"]');
      if (await queryBuilder.isVisible()) {
        await expect(queryBuilder).toHaveScreenshot('query-builder-with-fields.png');
      }
      
      // Screenshot selected fields area
      const selectedFields = page.locator('.selected-fields, [data-testid="selected-fields"]');
      if (await selectedFields.isVisible()) {
        await expect(selectedFields).toHaveScreenshot('selected-fields-area.png');
      }
      
      // Screenshot filters area
      const filtersArea = page.locator('.filters-area, [data-testid="filters-area"]');
      if (await filtersArea.isVisible()) {
        await expect(filtersArea).toHaveScreenshot('filters-area.png');
      }
    });

    test('should match query preview panel', async ({ page }) => {
      const reportBuilderPage = new ReportBuilderPage(page);
      
      await AuthHelper.login(page, 'AD_USER');
      await reportBuilderPage.goto();
      await reportBuilderPage.selectDataSource('ad');
      
      // Mock query preview
      await ApiHelper.mockApiResponse(page, '**/api/reports/preview*', {
        success: true,
        query: 'SELECT sAMAccountName, displayName FROM users WHERE enabled = true',
        estimatedRows: 1500
      });
      
      await reportBuilderPage.addFieldToQuery('sAMAccountName');
      await reportBuilderPage.addFieldToQuery('displayName');
      await reportBuilderPage.addFilter('enabled', 'equals', 'true');
      await reportBuilderPage.previewQuery();
      
      const previewPanel = page.locator('.preview-panel, [data-testid="preview-panel"]');
      if (await previewPanel.isVisible()) {
        await expect(previewPanel).toHaveScreenshot('query-preview-panel.png');
      }
    });
  });

  test.describe('Settings Page Visual Tests', () => {
    test('should match settings page layout', async ({ page }) => {
      const settingsPage = new SettingsPage(page);
      
      await AuthHelper.login(page, 'AD_USER');
      await settingsPage.goto();
      await page.waitForLoadState('networkidle');
      
      // Full settings page
      await expect(page).toHaveScreenshot('settings-page-full.png');
    });

    test('should match credentials management section', async ({ page }) => {
      const settingsPage = new SettingsPage(page);
      
      await AuthHelper.login(page, 'AD_USER');
      await settingsPage.goto();
      await settingsPage.navigateToCredentials();
      
      // Mock credentials data
      await ApiHelper.mockApiResponse(page, '**/api/credentials*', [
        {
          id: 1,
          name: 'Primary AD Server',
          type: 'ad',
          status: 'active',
          lastTested: '2025-01-07T14:00:00Z'
        },
        {
          id: 2,
          name: 'Azure AD Connection',
          type: 'azure',
          status: 'active',
          lastTested: '2025-01-07T13:30:00Z'
        }
      ]);
      
      await page.reload();
      await settingsPage.navigateToCredentials();
      await page.waitForLoadState('networkidle');
      
      const credentialsSection = page.locator('.credentials-section, .settings-content');
      await expect(credentialsSection).toHaveScreenshot('credentials-management-section.png');
    });

    test('should match credential creation modal', async ({ page }) => {
      const settingsPage = new SettingsPage(page);
      
      await AuthHelper.login(page, 'AD_USER');
      await settingsPage.goto();
      await settingsPage.navigateToCredentials();
      
      // Open add credential modal
      await settingsPage.addCredentialButton.click();
      const modal = page.locator('.ant-modal, .credential-modal');
      await modal.waitFor({ state: 'visible' });
      
      // Screenshot empty form
      await expect(modal).toHaveScreenshot('add-credential-modal-empty.png');
      
      // Fill some fields and screenshot
      await modal.locator('input[name="name"]').fill('Test Credential');
      await modal.locator('.credential-type-select').click();
      await page.locator('.ant-select-item:has-text("AD")').click();
      
      await expect(modal).toHaveScreenshot('add-credential-modal-filled.png');
    });

    test('should match field discovery section', async ({ page }) => {
      const settingsPage = new SettingsPage(page);
      
      await AuthHelper.login(page, 'AD_USER');
      await settingsPage.goto();
      await settingsPage.navigateToFieldDiscovery();
      
      // Mock field categories
      await ApiHelper.mockApiResponse(page, '**/api/fields*', {
        categories: [
          {
            name: 'Basic Information',
            fieldCount: 8,
            lastUpdated: '2025-01-07T10:00:00Z'
          },
          {
            name: 'Security',
            fieldCount: 12,
            lastUpdated: '2025-01-07T10:00:00Z'
          }
        ]
      });
      
      await page.reload();
      await settingsPage.navigateToFieldDiscovery();
      await page.waitForLoadState('networkidle');
      
      const fieldDiscoverySection = page.locator('.field-discovery-section, .settings-content');
      await expect(fieldDiscoverySection).toHaveScreenshot('field-discovery-section.png');
    });
  });

  test.describe('Responsive Visual Tests', () => {
    test('should match mobile login page', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      
      const loginPage = new LoginPage(page);
      await loginPage.goto();
      await page.waitForLoadState('networkidle');
      
      await expect(page).toHaveScreenshot('login-page-mobile.png');
    });

    test('should match tablet dashboard', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });
      
      await AuthHelper.login(page, 'AD_USER');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      
      await expect(page).toHaveScreenshot('dashboard-tablet.png');
    });

    test('should match mobile navigation menu', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      
      await AuthHelper.login(page, 'AD_USER');
      
      // Look for mobile menu trigger
      const mobileMenu = page.locator('.mobile-menu, .hamburger-menu, .ant-drawer-trigger');
      if (await mobileMenu.isVisible()) {
        await mobileMenu.click();
        await page.waitForSelector('.mobile-nav, .ant-drawer', { state: 'visible' });
        
        const mobileNav = page.locator('.mobile-nav, .ant-drawer');
        await expect(mobileNav).toHaveScreenshot('mobile-navigation-menu.png');
      }
    });

    test('should match mobile reports page', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      
      await AuthHelper.login(page, 'AD_USER');
      await page.goto('/reports');
      await page.waitForLoadState('networkidle');
      
      await expect(page).toHaveScreenshot('reports-page-mobile.png');
    });
  });

  test.describe('Theme and Color Scheme Tests', () => {
    test('should match light theme components', async ({ page }) => {
      await AuthHelper.login(page, 'AD_USER');
      
      // Ensure light theme is active
      await page.addStyleTag({
        content: `
          :root {
            --ant-primary-color: #1890ff;
            --ant-background-color: #ffffff;
            --ant-text-color: #000000d9;
          }
        `
      });
      
      await page.waitForTimeout(1000);
      
      // Test key components in light theme
      await expect(page).toHaveScreenshot('dashboard-light-theme.png');
      
      // Test navigation in light theme
      const navigation = page.locator('.ant-layout-sider, nav');
      if (await navigation.isVisible()) {
        await expect(navigation).toHaveScreenshot('navigation-light-theme.png');
      }
    });

    test('should match dark theme components', async ({ page }) => {
      await AuthHelper.login(page, 'AD_USER');
      
      // Apply dark theme styles
      await page.addStyleTag({
        content: `
          :root {
            --ant-primary-color: #1890ff;
            --ant-background-color: #141414;
            --ant-text-color: #ffffffd9;
          }
          body {
            background-color: #141414;
            color: #ffffffd9;
          }
          .ant-layout {
            background-color: #141414;
          }
        `
      });
      
      await page.waitForTimeout(1000);
      
      // Test components in dark theme
      await expect(page).toHaveScreenshot('dashboard-dark-theme.png');
    });

    test('should match high contrast mode', async ({ page }) => {
      await AuthHelper.login(page, 'AD_USER');
      
      // Apply high contrast styles
      await page.addStyleTag({
        content: `
          :root {
            --ant-primary-color: #ffffff;
            --ant-background-color: #000000;
            --ant-text-color: #ffffff;
          }
          body {
            background-color: #000000;
            color: #ffffff;
          }
          .ant-btn {
            border-color: #ffffff;
            color: #ffffff;
          }
        `
      });
      
      await page.waitForTimeout(1000);
      
      await expect(page).toHaveScreenshot('dashboard-high-contrast.png');
    });
  });

  test.describe('Loading and State Tests', () => {
    test('should match loading states', async ({ page }) => {
      const reportsPage = new ReportsPage(page);
      
      await AuthHelper.login(page, 'AD_USER');
      await reportsPage.goto();
      
      // Mock slow loading report execution
      await page.route('**/api/reports/execute/*', async (route) => {
        await page.waitForTimeout(2000);
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: { results: [], totalRecords: 0 }
          })
        });
      });
      
      // Start report execution
      await reportsPage.selectDataSource('ad');
      await reportsPage.selectReport('Inactive Users');
      await reportsPage.executeReport({ days: 90 });
      
      // Screenshot loading state
      const loadingSpinner = page.locator('.ant-spin, [data-testid="loading"]');
      if (await loadingSpinner.isVisible()) {
        await expect(page).toHaveScreenshot('report-execution-loading.png');
      }
    });

    test('should match empty states', async ({ page }) => {
      await AuthHelper.login(page, 'AD_USER');
      await page.goto('/reports');
      
      // Mock empty reports list
      await ApiHelper.mockApiResponse(page, '**/api/reports/templates*', []);
      
      await page.reload();
      await page.waitForLoadState('networkidle');
      
      const emptyState = page.locator('.ant-empty, .empty-state');
      if (await emptyState.isVisible()) {
        await expect(emptyState).toHaveScreenshot('reports-empty-state.png');
      }
    });

    test('should match error states', async ({ page }) => {
      await AuthHelper.login(page, 'AD_USER');
      
      // Mock API error
      await page.route('**/api/dashboard/stats*', (route) => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            error: 'Internal server error'
          })
        });
      });
      
      await page.reload();
      await page.waitForLoadState('networkidle');
      
      const errorState = page.locator('.ant-result-error, .error-state');
      if (await errorState.isVisible()) {
        await expect(errorState).toHaveScreenshot('dashboard-error-state.png');
      }
    });
  });

  test.describe('Component Interaction States', () => {
    test('should match button hover states', async ({ page }) => {
      await AuthHelper.login(page, 'AD_USER');
      
      const primaryButton = page.locator('.ant-btn-primary').first();
      if (await primaryButton.isVisible()) {
        // Normal state
        await expect(primaryButton).toHaveScreenshot('button-primary-normal.png');
        
        // Hover state
        await primaryButton.hover();
        await page.waitForTimeout(200);
        await expect(primaryButton).toHaveScreenshot('button-primary-hover.png');
      }
    });

    test('should match form validation states', async ({ page }) => {
      const loginPage = new LoginPage(page);
      await loginPage.goto();
      
      // Trigger validation errors
      await loginPage.selectAuthSource('ad');
      await loginPage.clickLogin();
      
      // Wait for validation errors
      await page.waitForSelector('.ant-form-item-explain-error', { state: 'visible' });
      
      const form = page.locator('form');
      await expect(form).toHaveScreenshot('form-validation-errors.png');
    });

    test('should match dropdown focus states', async ({ page }) => {
      const loginPage = new LoginPage(page);
      await loginPage.goto();
      
      const authSelect = page.locator('.ant-select-selector');
      
      // Normal state
      await expect(authSelect).toHaveScreenshot('select-normal.png');
      
      // Focus state
      await authSelect.focus();
      await page.waitForTimeout(200);
      await expect(authSelect).toHaveScreenshot('select-focused.png');
    });
  });

  test.describe('Cross-browser Visual Consistency', () => {
    test('should match layout across different zoom levels', async ({ page }) => {
      await AuthHelper.login(page, 'AD_USER');
      
      // Test different zoom levels
      const zoomLevels = [0.8, 1.0, 1.2, 1.5];
      
      for (const zoom of zoomLevels) {
        // Set zoom level
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: zoom });
        
        await page.waitForTimeout(1000);
        await expect(page).toHaveScreenshot(`dashboard-zoom-${zoom}.png`);
      }
    });

    test('should match components with different font sizes', async ({ page }) => {
      await AuthHelper.login(page, 'AD_USER');
      
      // Test with larger font size (accessibility)
      await page.addStyleTag({
        content: `
          html {
            font-size: 16px;
          }
          body {
            font-size: 1.1em;
          }
        `
      });
      
      await page.waitForTimeout(1000);
      await expect(page).toHaveScreenshot('dashboard-large-font.png');
    });
  });
});