import { Page, BrowserContext, expect } from '@playwright/test';
import { TEST_USERS, TEST_CONFIG, TestUser } from '../fixtures/test-data';

/**
 * Test helper utilities for E2E tests
 */

/**
 * Authentication helper
 */
export class AuthHelper {
  /**
   * Login with credentials
   */
  static async login(
    page: Page, 
    userType: keyof typeof TEST_USERS,
    rememberMe: boolean = false
  ): Promise<void> {
    const user = TEST_USERS[userType];
    
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Select authentication source
    await page.locator('.ant-select-selector').click();
    await page.waitForSelector('.ant-select-dropdown', { state: 'visible' });
    
    switch (user.authSource) {
      case 'ad':
        await page.locator('.ant-select-item:has-text("Active Directory")').click();
        break;
      case 'azure':
        await page.locator('.ant-select-item:has-text("Azure")').click();
        break;
      case 'local':
        await page.locator('.ant-select-item:has-text("Local")').click();
        break;
    }

    // Fill credentials (skip for Azure OAuth)
    if (user.authSource !== 'azure') {
      await page.locator('input[name="username"]').fill(user.username);
      await page.locator('input[name="password"]').fill(user.password);
      
      if (rememberMe) {
        const rememberCheckbox = page.locator('input[type="checkbox"]');
        if (await rememberCheckbox.isVisible()) {
          await rememberCheckbox.check();
        }
      }
    }

    // Submit login
    await page.locator('button[type="submit"]').click();
    
    // Wait for successful login (redirect to dashboard)
    await page.waitForURL('**/dashboard', { timeout: TEST_CONFIG.DEFAULT_TIMEOUT });
  }

  /**
   * Login with custom credentials
   */
  static async loginWithCredentials(
    page: Page,
    username: string,
    password: string,
    authSource: 'ad' | 'azure' | 'local' = 'ad'
  ): Promise<void> {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Select auth source
    await page.locator('.ant-select-selector').click();
    await page.waitForSelector('.ant-select-dropdown', { state: 'visible' });
    
    const sourceText = authSource === 'ad' ? 'Active Directory' : 
                      authSource === 'azure' ? 'Azure' : 'Local';
    await page.locator(`.ant-select-item:has-text("${sourceText}")`).click();

    if (authSource !== 'azure') {
      await page.locator('input[name="username"]').fill(username);
      await page.locator('input[name="password"]').fill(password);
    }

    await page.locator('button[type="submit"]').click();
  }

  /**
   * Logout from application
   */
  static async logout(page: Page): Promise<void> {
    // Open user menu
    await page.locator('[data-testid="user-profile"], .ant-dropdown-trigger').click();
    await page.waitForSelector('.ant-dropdown-menu', { state: 'visible' });
    
    // Click logout
    await page.locator('button:has-text("Logout")').click();
    
    // Verify redirect to login
    await page.waitForURL('**/login', { timeout: TEST_CONFIG.DEFAULT_TIMEOUT });
  }

  /**
   * Check if user is authenticated
   */
  static async isAuthenticated(page: Page): Promise<boolean> {
    const currentUrl = page.url();
    return !currentUrl.includes('login') && !currentUrl.includes('error');
  }
}

/**
 * API helper for mocking and validation
 */
export class ApiHelper {
  /**
   * Mock API response
   */
  static async mockApiResponse(
    page: Page,
    urlPattern: string | RegExp,
    response: any,
    status: number = 200
  ): Promise<void> {
    await page.route(urlPattern, (route) => {
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(response)
      });
    });
  }

  /**
   * Wait for API call and validate
   */
  static async waitForApiCall(
    page: Page,
    urlPattern: string | RegExp,
    method: string = 'GET',
    timeout: number = TEST_CONFIG.API_RESPONSE_TIMEOUT
  ): Promise<any> {
    const responsePromise = page.waitForResponse(
      response => {
        const url = response.url();
        const matchesUrl = typeof urlPattern === 'string' ? 
          url.includes(urlPattern) : urlPattern.test(url);
        return matchesUrl && response.request().method() === method.toUpperCase();
      },
      { timeout }
    );

    const response = await responsePromise;
    return await response.json();
  }

  /**
   * Mock all common API endpoints for E2E testing
   */
  static async mockAllCommonEndpoints(page: Page): Promise<void> {
    // Mock auth method endpoint (called during page load)
    await page.route('**/api/auth/method', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          authMethods: ['ad', 'azure', 'local'],
          defaultMethod: 'ad',
          azureConfig: {
            clientId: 'test-client-id',
            tenantId: 'test-tenant-id',
            redirectUri: 'http://localhost:3000/auth/callback'
          }
        })
      });
    });

    // Mock dashboard stats
    await page.route('**/api/dashboard/**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          totalReports: 25,
          activeUsers: 1247,
          lastExecution: new Date().toISOString(),
          systemHealth: 'healthy'
        })
      });
    });

    // Mock health check
    await page.route('**/api/health**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          services: {
            database: 'healthy',
            redis: 'healthy',
            ldap: 'healthy'
          }
        })
      });
    });

    // Mock reports endpoints
    await page.route('**/api/reports**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 1,
            name: 'Inactive Users Report',
            category: 'Security',
            lastRun: new Date().toISOString()
          }
        ])
      });
    });
  }

  /**
   * Mock authentication endpoints
   */
  static async mockAuthEndpoints(page: Page, user: TestUser): Promise<void> {
    // Setup common endpoints first
    await this.mockAllCommonEndpoints(page);

    // Mock login success
    await page.route('**/api/auth/login', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          user: {
            username: user.username,
            displayName: user.displayName,
            email: user.email,
            roles: user.roles,
            permissions: user.permissions
          },
          token: 'mock-jwt-token'
        })
      });
    });

    // Mock profile endpoint
    await page.route('**/api/auth/profile', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          username: user.username,
          displayName: user.displayName,
          email: user.email,
          roles: user.roles,
          permissions: user.permissions
        })
      });
    });

    // Mock logout endpoint
    await page.route('**/api/auth/logout', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Logged out successfully'
        })
      });
    });
  }
}

/**
 * Visual testing helper
 */
export class VisualHelper {
  /**
   * Take screenshot for visual comparison
   */
  static async takeScreenshot(
    page: Page,
    name: string,
    options: {
      fullPage?: boolean;
      clip?: { x: number; y: number; width: number; height: number };
      mask?: string[];
    } = {}
  ): Promise<void> {
    const screenshotOptions: any = {
      path: `test-results/screenshots/${name}.png`,
      fullPage: options.fullPage ?? true
    };

    if (options.clip) {
      screenshotOptions.clip = options.clip;
    }

    if (options.mask) {
      screenshotOptions.mask = options.mask.map(selector => page.locator(selector));
    }

    await page.screenshot(screenshotOptions);
  }

  /**
   * Compare visual elements
   */
  static async compareVisual(
    page: Page,
    selector: string,
    name: string,
    threshold: number = TEST_CONFIG.VISUAL_THRESHOLD
  ): Promise<void> {
    const element = page.locator(selector);
    await expect(element).toHaveScreenshot(`${name}.png`, { 
      threshold,
      maxDiffPixels: TEST_CONFIG.PIXEL_THRESHOLD 
    });
  }
}

/**
 * Form helper utilities
 */
export class FormHelper {
  /**
   * Fill form with data
   */
  static async fillForm(
    page: Page,
    formData: Record<string, any>,
    formSelector: string = 'form'
  ): Promise<void> {
    const form = page.locator(formSelector);
    
    for (const [fieldName, value] of Object.entries(formData)) {
      const field = form.locator(`[name="${fieldName}"], [data-testid="${fieldName}"]`);
      
      if (await field.isVisible()) {
        const inputType = await field.getAttribute('type') || 'text';
        
        switch (inputType) {
          case 'checkbox':
          case 'radio':
            if (value) {
              await field.check();
            } else {
              await field.uncheck();
            }
            break;
          case 'select':
            await field.selectOption(value.toString());
            break;
          default:
            await field.fill(value.toString());
            break;
        }
      }
    }
  }

  /**
   * Get form validation errors
   */
  static async getFormErrors(page: Page, formSelector: string = 'form'): Promise<string[]> {
    const form = page.locator(formSelector);
    const errorElements = form.locator('.ant-form-item-explain-error, .error-message');
    
    const errors: string[] = [];
    const count = await errorElements.count();
    
    for (let i = 0; i < count; i++) {
      const text = await errorElements.nth(i).textContent();
      if (text) errors.push(text.trim());
    }
    
    return errors;
  }

  /**
   * Validate form submission
   */
  static async submitFormAndValidate(
    page: Page,
    expectedResult: 'success' | 'error',
    formSelector: string = 'form'
  ): Promise<void> {
    const submitButton = page.locator(`${formSelector} button[type="submit"]`);
    await submitButton.click();
    
    if (expectedResult === 'success') {
      // Wait for success indicator or page navigation
      await Promise.race([
        page.waitForURL('**', { waitUntil: 'networkidle' }),
        page.locator('.ant-message-success, .success-message').waitFor({ state: 'visible' })
      ]);
    } else {
      // Wait for error message
      await page.locator('.ant-alert-error, .error-message').waitFor({ state: 'visible' });
    }
  }
}

/**
 * Data table helper utilities
 */
export class TableHelper {
  /**
   * Get table data
   */
  static async getTableData(page: Page, tableSelector: string = 'table'): Promise<Array<Record<string, string>>> {
    const table = page.locator(tableSelector);
    const data: Array<Record<string, string>> = [];
    
    if (await table.isVisible()) {
      const headers = await table.locator('thead th').allTextContents();
      const rows = await table.locator('tbody tr').all();
      
      for (const row of rows) {
        const cells = await row.locator('td').allTextContents();
        const rowData: Record<string, string> = {};
        
        headers.forEach((header, index) => {
          if (cells[index]) {
            rowData[header.trim()] = cells[index].trim();
          }
        });
        
        data.push(rowData);
      }
    }
    
    return data;
  }

  /**
   * Sort table by column
   */
  static async sortTableByColumn(page: Page, columnName: string, tableSelector: string = 'table'): Promise<void> {
    const table = page.locator(tableSelector);
    const header = table.locator(`th:has-text("${columnName}")`);
    await header.click();
  }

  /**
   * Filter table
   */
  static async filterTable(page: Page, filterValue: string, tableSelector: string = 'table'): Promise<void> {
    const searchInput = page.locator('.ant-input-search, input[placeholder*="search"]').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill(filterValue);
      await searchInput.press('Enter');
      await page.waitForTimeout(1000); // Wait for filter to apply
    }
  }
}

/**
 * Performance testing helper
 */
export class PerformanceHelper {
  /**
   * Measure page load time
   */
  static async measurePageLoad(page: Page, url: string): Promise<number> {
    const startTime = Date.now();
    await page.goto(url);
    await page.waitForLoadState('networkidle');
    const endTime = Date.now();
    return endTime - startTime;
  }

  /**
   * Measure API response time
   */
  static async measureApiResponseTime(page: Page, apiCall: () => Promise<void>): Promise<number> {
    const startTime = Date.now();
    await apiCall();
    const endTime = Date.now();
    return endTime - startTime;
  }

  /**
   * Get performance metrics
   */
  static async getPerformanceMetrics(page: Page): Promise<any> {
    return await page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      return {
        domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
        load: navigation.loadEventEnd - navigation.loadEventStart,
        firstContentfulPaint: performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0,
        largestContentfulPaint: performance.getEntriesByName('largest-contentful-paint')[0]?.startTime || 0
      };
    });
  }
}

/**
 * Browser context helper
 */
export class BrowserHelper {
  /**
   * Set up browser context with authentication
   */
  static async setupAuthenticatedContext(
    context: BrowserContext,
    userType: keyof typeof TEST_USERS
  ): Promise<void> {
    const user = TEST_USERS[userType];
    
    // Add authentication cookies/tokens to context
    await context.addCookies([
      {
        name: 'auth-token',
        value: 'mock-jwt-token',
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        secure: false
      }
    ]);

    // Set local storage with user data
    await context.addInitScript((userData) => {
      localStorage.setItem('user', JSON.stringify(userData));
      localStorage.setItem('isAuthenticated', 'true');
    }, {
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      roles: user.roles,
      permissions: user.permissions
    });
  }

  /**
   * Clear browser context
   */
  static async clearContext(context: BrowserContext): Promise<void> {
    await context.clearCookies();
    await context.clearPermissions();
    await context.storageState({ path: undefined });
  }
}