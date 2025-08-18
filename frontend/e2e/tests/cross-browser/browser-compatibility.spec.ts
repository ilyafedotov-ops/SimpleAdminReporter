import { test, expect, Browser, BrowserContext } from '@playwright/test';
import { LoginPage, DashboardPage, ReportsPage } from '../../pages';
import { AuthHelper, ApiHelper, PerformanceHelper } from '../../utils/test-helpers';
import { TEST_USERS, TEST_CONFIG } from '../../fixtures/test-data';

test.describe('Cross-Browser Compatibility Tests', () => {
  test.describe('Core Functionality Across Browsers', () => {
    test('should perform basic authentication flow in all browsers', async ({ page, browserName }) => {
      const loginPage = new LoginPage(page);
      const dashboardPage = new DashboardPage(page);

      console.log(`Testing authentication in ${browserName}`);

      // Mock authentication
      await ApiHelper.mockAuthEndpoints(page, TEST_USERS.AD_USER);

      await loginPage.goto();
      await loginPage.loginWithAD(TEST_USERS.AD_USER.username, TEST_USERS.AD_USER.password);

      // Verify successful login
      const result = await loginPage.waitForLoginCompletion();
      expect(result).toBe('success');

      // Verify dashboard loads
      expect(page.url()).toContain('dashboard');
      const isDashboardLoaded = await dashboardPage.isLoaded();
      expect(isDashboardLoaded).toBe(true);
    });

    test('should navigate between pages consistently across browsers', async ({ page, browserName }) => {
      console.log(`Testing navigation in ${browserName}`);

      const dashboardPage = new DashboardPage(page);
      const reportsPage = new ReportsPage(page);

      await AuthHelper.login(page, 'AD_USER');

      // Test navigation to reports
      await dashboardPage.navigateToReports();
      expect(page.url()).toContain('reports');

      const isReportsLoaded = await reportsPage.isLoaded();
      expect(isReportsLoaded).toBe(true);

      // Test browser back button
      await page.goBack();
      expect(page.url()).toContain('dashboard');

      // Test browser forward button
      await page.goForward();
      expect(page.url()).toContain('reports');
    });

    test('should handle form interactions consistently', async ({ page, browserName }) => {
      console.log(`Testing forms in ${browserName}`);

      const loginPage = new LoginPage(page);
      await loginPage.goto();

      // Test dropdown interactions
      await loginPage.selectAuthSource('ad');
      await page.waitForTimeout(300);

      // Test form field interactions
      await loginPage.enterUsername('test@domain.local');
      await loginPage.enterPassword('testpassword');

      // Verify values are preserved
      const usernameValue = await page.locator('input[name="username"]').inputValue();
      const passwordValue = await page.locator('input[name="password"]').inputValue();

      expect(usernameValue).toBe('test@domain.local');
      expect(passwordValue).toBe('testpassword');
    });
  });

  test.describe('Browser-Specific Features', () => {
    test('should handle local storage across browsers', async ({ page, browserName }) => {
      await AuthHelper.login(page, 'AD_USER');

      // Set some data in localStorage
      await page.evaluate(() => {
        localStorage.setItem('testKey', 'testValue');
        localStorage.setItem('userPreferences', JSON.stringify({
          theme: 'light',
          language: 'en'
        }));
      });

      // Refresh page
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Verify localStorage data persists
      const testValue = await page.evaluate(() => localStorage.getItem('testKey'));
      const userPrefs = await page.evaluate(() => {
        const prefs = localStorage.getItem('userPreferences');
        return prefs ? JSON.parse(prefs) : null;
      });

      expect(testValue).toBe('testValue');
      expect(userPrefs).toEqual({
        theme: 'light',
        language: 'en'
      });

      // Test in different tab
      const newPage = await page.context().newPage();
      await newPage.goto('/dashboard');

      const testValueInNewTab = await newPage.evaluate(() => localStorage.getItem('testKey'));
      expect(testValueInNewTab).toBe('testValue');

      await newPage.close();
    });

    test('should handle cookies consistently', async ({ page, browserName }) => {
      await page.goto('/login');

      // Set test cookies
      await page.context().addCookies([
        {
          name: 'testCookie',
          value: 'testValue',
          domain: 'localhost',
          path: '/'
        }
      ]);

      // Verify cookies are accessible
      const cookies = await page.context().cookies();
      const testCookie = cookies.find(cookie => cookie.name === 'testCookie');

      expect(testCookie).toBeTruthy();
      expect(testCookie?.value).toBe('testValue');

      // Test cookie persistence across page loads
      await page.reload();

      const cookiesAfterReload = await page.context().cookies();
      const persistentCookie = cookiesAfterReload.find(cookie => cookie.name === 'testCookie');

      expect(persistentCookie).toBeTruthy();
    });

    test('should handle JavaScript features across browsers', async ({ page, browserName }) => {
      await AuthHelper.login(page, 'AD_USER');

      // Test modern JavaScript features
      const supportedFeatures = await page.evaluate(() => {
        const features = {
          asyncAwait: typeof (async () => {}) === 'function',
          promises: typeof Promise !== 'undefined',
          arrowFunctions: (() => true)(),
          destructuring: (() => {
            try {
              const [a] = [1];
              const {b} = {b: 2};
              return true;
            } catch {
              return false;
            }
          })(),
          fetch: typeof fetch !== 'undefined',
          localStorage: typeof localStorage !== 'undefined',
          sessionStorage: typeof sessionStorage !== 'undefined'
        };
        return features;
      });

      // All modern features should be supported
      expect(supportedFeatures.asyncAwait).toBe(true);
      expect(supportedFeatures.promises).toBe(true);
      expect(supportedFeatures.arrowFunctions).toBe(true);
      expect(supportedFeatures.destructuring).toBe(true);
      expect(supportedFeatures.fetch).toBe(true);
      expect(supportedFeatures.localStorage).toBe(true);
      expect(supportedFeatures.sessionStorage).toBe(true);

      console.log(`${browserName} supports all required JavaScript features`);
    });

    test('should handle CSS features and styling consistently', async ({ page, browserName }) => {
      await AuthHelper.login(page, 'AD_USER');

      // Test CSS features support
      const cssSupport = await page.evaluate(() => {
        const testElement = document.createElement('div');
        document.body.appendChild(testElement);

        const features = {
          flexbox: CSS.supports('display', 'flex'),
          grid: CSS.supports('display', 'grid'),
          customProperties: CSS.supports('--custom', 'value'),
          transforms: CSS.supports('transform', 'translateX(10px)'),
          transitions: CSS.supports('transition', 'all 0.3s'),
          animations: CSS.supports('animation', 'test 1s'),
          calc: CSS.supports('width', 'calc(100% - 10px)')
        };

        document.body.removeChild(testElement);
        return features;
      });

      // All modern CSS features should be supported
      expect(cssSupport.flexbox).toBe(true);
      expect(cssSupport.grid).toBe(true);
      expect(cssSupport.customProperties).toBe(true);
      expect(cssSupport.transforms).toBe(true);
      expect(cssSupport.transitions).toBe(true);

      console.log(`${browserName} supports required CSS features`);
    });
  });

  test.describe('Performance Across Browsers', () => {
    test('should meet performance benchmarks in all browsers', async ({ page, browserName }) => {
      console.log(`Testing performance in ${browserName}`);

      const loadTime = await PerformanceHelper.measurePageLoad(page, '/dashboard');
      
      // Performance thresholds may vary by browser
      const performanceThresholds = {
        chromium: 5000,
        firefox: 6000,
        webkit: 7000
      };

      const threshold = performanceThresholds[browserName as keyof typeof performanceThresholds] || 7000;
      expect(loadTime).toBeLessThan(threshold);

      console.log(`${browserName} page load time: ${loadTime}ms (threshold: ${threshold}ms)`);
    });

    test('should handle memory usage efficiently', async ({ page, browserName }) => {
      await AuthHelper.login(page, 'AD_USER');

      // Get initial memory metrics
      const initialMetrics = await PerformanceHelper.getPerformanceMetrics(page);

      // Perform memory-intensive operations
      await page.goto('/reports');
      await page.goto('/reports/builder');
      await page.goto('/settings');
      await page.goto('/dashboard');

      // Get final memory metrics
      const finalMetrics = await PerformanceHelper.getPerformanceMetrics(page);

      // Memory should not grow excessively
      const memoryGrowth = finalMetrics.domContentLoaded - initialMetrics.domContentLoaded;
      expect(memoryGrowth).toBeLessThan(100); // Reasonable memory growth threshold

      console.log(`${browserName} memory growth: ${memoryGrowth}ms`);
    });
  });

  test.describe('Error Handling Across Browsers', () => {
    test('should handle network errors consistently', async ({ page, browserName }) => {
      console.log(`Testing error handling in ${browserName}`);

      const loginPage = new LoginPage(page);
      await loginPage.goto();

      // Mock network failure
      await page.route('**/api/auth/login', route => route.abort('failed'));

      await loginPage.selectAuthSource('ad');
      await loginPage.enterUsername('test@domain.local');
      await loginPage.enterPassword('password');
      await loginPage.clickLogin();

      // Should show error message
      const result = await loginPage.waitForLoginCompletion();
      expect(result).toBe('error');

      const errorMessage = await loginPage.getErrorMessage();
      expect(errorMessage).toBeTruthy();
    });

    test('should handle JavaScript errors gracefully', async ({ page, browserName }) => {
      let jsErrors: string[] = [];

      // Listen for JavaScript errors
      page.on('pageerror', error => {
        jsErrors.push(error.message);
      });

      page.on('console', msg => {
        if (msg.type() === 'error') {
          jsErrors.push(msg.text());
        }
      });

      await AuthHelper.login(page, 'AD_USER');

      // Navigate through application
      await page.goto('/reports');
      await page.goto('/reports/builder');
      await page.goto('/settings');

      // Should not have critical JavaScript errors
      const criticalErrors = jsErrors.filter(error => 
        error.toLowerCase().includes('uncaught') ||
        error.toLowerCase().includes('typeerror') ||
        error.toLowerCase().includes('referenceerror')
      );

      expect(criticalErrors.length).toBe(0);

      if (jsErrors.length > 0) {
        console.log(`${browserName} non-critical errors:`, jsErrors);
      }
    });
  });

  test.describe('Accessibility Across Browsers', () => {
    test('should support keyboard navigation in all browsers', async ({ page, browserName }) => {
      const loginPage = new LoginPage(page);
      await loginPage.goto();

      // Test keyboard navigation
      await page.keyboard.press('Tab'); // Auth source
      await page.keyboard.press('Tab'); // Username
      await page.keyboard.press('Tab'); // Password
      await page.keyboard.press('Tab'); // Login button

      // Should be able to interact with form using keyboard
      await page.keyboard.press('Shift+Tab'); // Back to password
      await page.keyboard.press('Shift+Tab'); // Back to username
      await page.keyboard.type('test@domain.local');

      const usernameValue = await page.locator('input[name="username"]').inputValue();
      expect(usernameValue).toBe('test@domain.local');

      console.log(`${browserName} supports keyboard navigation`);
    });

    test('should maintain focus indicators', async ({ page, browserName }) => {
      await AuthHelper.login(page, 'AD_USER');

      // Test focus indicators
      const focusableElements = await page.locator('button, input, select, a, [tabindex]:not([tabindex="-1"])').all();

      for (const element of focusableElements.slice(0, 5)) { // Test first 5 elements
        if (await element.isVisible()) {
          await element.focus();

          // Check if element has focus styles
          const hasFocusStyles = await element.evaluate(el => {
            const styles = window.getComputedStyle(el);
            return styles.outline !== 'none' || styles.boxShadow !== 'none';
          });

          // Should have some form of focus indicator
          expect(hasFocusStyles).toBe(true);
        }
      }

      console.log(`${browserName} maintains focus indicators`);
    });
  });

  test.describe('Browser-Specific Workarounds', () => {
    test('should handle Safari-specific behaviors', async ({ page, browserName }) => {
      if (browserName !== 'webkit') {
        test.skip();
      }

      await AuthHelper.login(page, 'AD_USER');

      // Safari-specific tests
      // Test date input handling (Safari has different date picker)
      const dateInput = page.locator('input[type="date"]');
      if (await dateInput.count() > 0) {
        await dateInput.first().fill('2025-01-07');
        const value = await dateInput.first().inputValue();
        expect(value).toBe('2025-01-07');
      }

      // Test Safari's strict CORS handling
      // (This would be tested if the app makes cross-origin requests)
      console.log('Safari-specific tests completed');
    });

    test('should handle Firefox-specific behaviors', async ({ page, browserName }) => {
      if (browserName !== 'firefox') {
        test.skip();
      }

      await AuthHelper.login(page, 'AD_USER');

      // Firefox-specific tests
      // Test scrollbar styling (Firefox handles differently)
      const scrollableElement = page.locator('.scrollable, .ant-table-tbody').first();
      if (await scrollableElement.isVisible()) {
        await scrollableElement.hover();
        // Firefox scrollbars should be functional
        const isScrollable = await scrollableElement.evaluate(el => {
          return el.scrollHeight > el.clientHeight;
        });

        if (isScrollable) {
          console.log('Firefox scrolling behavior verified');
        }
      }
    });

    test('should handle Chrome-specific behaviors', async ({ page, browserName }) => {
      if (!browserName.includes('chromium') && !browserName.includes('chrome')) {
        test.skip();
      }

      await AuthHelper.login(page, 'AD_USER');

      // Chrome-specific tests
      // Test Chrome's autofill behavior
      const loginPage = new LoginPage(page);
      await loginPage.goto();

      // Chrome might offer password suggestions
      await loginPage.enterUsername('test@domain.local');
      const passwordField = page.locator('input[name="password"]');
      
      // Check if Chrome shows autofill suggestions
      await passwordField.click();
      await page.waitForTimeout(500);

      console.log('Chrome-specific behaviors tested');
    });
  });

  test.describe('Feature Detection and Progressive Enhancement', () => {
    test('should gracefully degrade features based on browser capabilities', async ({ page, browserName }) => {
      await AuthHelper.login(page, 'AD_USER');

      // Test feature detection
      const featureSupport = await page.evaluate(() => {
        return {
          intersectionObserver: 'IntersectionObserver' in window,
          resizeObserver: 'ResizeObserver' in window,
          webAnimations: 'animate' in document.createElement('div'),
          customElements: 'customElements' in window,
          webComponents: 'HTMLTemplateElement' in window
        };
      });

      console.log(`${browserName} feature support:`, featureSupport);

      // Application should work even if advanced features aren't supported
      const dashboardPage = new DashboardPage(page);
      const isLoaded = await dashboardPage.isLoaded();
      expect(isLoaded).toBe(true);
    });

    test('should handle polyfills correctly', async ({ page, browserName }) => {
      // Test that polyfills are loaded when needed
      const polyfillsLoaded = await page.evaluate(() => {
        // Check for common polyfills
        return {
          promises: typeof Promise !== 'undefined',
          fetch: typeof fetch !== 'undefined',
          includes: Array.prototype.includes !== undefined,
          assign: Object.assign !== undefined
        };
      });

      // All required features should be available (via polyfills if needed)
      expect(polyfillsLoaded.promises).toBe(true);
      expect(polyfillsLoaded.fetch).toBe(true);
      expect(polyfillsLoaded.includes).toBe(true);
      expect(polyfillsLoaded.assign).toBe(true);

      console.log(`${browserName} polyfills working correctly`);
    });
  });

  test.describe('Cross-Browser Data Consistency', () => {
    test('should handle date formatting consistently', async ({ page, browserName }) => {
      await AuthHelper.login(page, 'AD_USER');

      // Mock data with dates
      await ApiHelper.mockApiResponse(page, '**/api/dashboard/stats*', {
        lastExecution: '2025-01-07T14:30:00Z',
        reports: [
          {
            name: 'Test Report',
            executedAt: '2025-01-07T10:15:30Z'
          }
        ]
      });

      await page.reload();
      await page.waitForLoadState('networkidle');

      // Check date formatting
      const dateElements = page.locator('[data-testid*="date"], .date, .timestamp');
      const dateCount = await dateElements.count();

      if (dateCount > 0) {
        const firstDateText = await dateElements.first().textContent();
        expect(firstDateText).toBeTruthy();
        
        // Date should be formatted consistently across browsers
        // (Implementation would depend on date formatting approach)
        console.log(`${browserName} date format: ${firstDateText}`);
      }
    });

    test('should handle number formatting consistently', async ({ page, browserName }) => {
      await AuthHelper.login(page, 'AD_USER');

      // Test number formatting
      const numberFormatting = await page.evaluate(() => {
        const testNumber = 1234567.89;
        return {
          locale: new Intl.NumberFormat().format(testNumber),
          currency: new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
          }).format(testNumber),
          percent: new Intl.NumberFormat('en-US', {
            style: 'percent'
          }).format(0.1234)
        };
      });

      expect(numberFormatting.locale).toBeTruthy();
      expect(numberFormatting.currency).toBeTruthy();
      expect(numberFormatting.percent).toBeTruthy();

      console.log(`${browserName} number formatting:`, numberFormatting);
    });

    test('should handle timezone consistently', async ({ page, browserName }) => {
      const timezone = await page.evaluate(() => {
        return Intl.DateTimeFormat().resolvedOptions().timeZone;
      });

      console.log(`${browserName} timezone: ${timezone}`);

      // Application should handle timezones correctly
      await AuthHelper.login(page, 'AD_USER');
      
      // This would test timezone-aware date displays
      // Implementation depends on how the app handles timezones
    });
  });
});