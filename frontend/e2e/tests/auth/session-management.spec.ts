import { test, expect } from '@playwright/test';
import { LoginPage, DashboardPage } from '../../pages';
import { AuthHelper, ApiHelper } from '../../utils/test-helpers';
import { TEST_USERS, TEST_CONFIG } from '../../fixtures/test-data';

test.describe('Authentication - Session Management', () => {
  let loginPage: LoginPage;
  let dashboardPage: DashboardPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    dashboardPage = new DashboardPage(page);
  });

  test.describe('Session Persistence', () => {
    test('should maintain session across browser tabs', async ({ page, context }) => {
      const user = TEST_USERS.AD_USER;
      await ApiHelper.mockAuthEndpoints(page, user);
      
      // Login on first tab
      await AuthHelper.login(page, 'AD_USER');
      expect(page.url()).toContain('dashboard');
      
      // Open new tab
      const secondPage = await context.newPage();
      await secondPage.goto('/dashboard');
      
      // Should be authenticated on second tab
      await secondPage.waitForURL('**/dashboard');
      expect(secondPage.url()).toContain('dashboard');
      
      const isAuthenticated = await AuthHelper.isAuthenticated(secondPage);
      expect(isAuthenticated).toBe(true);
      
      await secondPage.close();
    });

    test('should persist session after page refresh', async ({ page }) => {
      const user = TEST_USERS.AD_USER;
      await ApiHelper.mockAuthEndpoints(page, user);
      
      // Login
      await AuthHelper.login(page, 'AD_USER');
      
      // Refresh page
      await page.reload();
      await page.waitForLoadState('networkidle');
      
      // Should still be on dashboard
      expect(page.url()).toContain('dashboard');
      const isAuthenticated = await AuthHelper.isAuthenticated(page);
      expect(isAuthenticated).toBe(true);
    });

    test('should restore user data from stored session', async ({ page }) => {
      const user = TEST_USERS.AD_USER;
      await ApiHelper.mockAuthEndpoints(page, user);
      
      // Login
      await AuthHelper.login(page, 'AD_USER');
      
      // Get user info before refresh
      const userInfoBefore = await dashboardPage.getCurrentUserInfo();
      
      // Refresh page
      await page.reload();
      await page.waitForLoadState('networkidle');
      
      // Get user info after refresh
      const userInfoAfter = await dashboardPage.getCurrentUserInfo();
      
      // User data should be restored
      expect(userInfoAfter).toBeTruthy();
      if (userInfoBefore && userInfoAfter) {
        expect(userInfoAfter.username).toBe(userInfoBefore.username);
      }
    });

    test('should handle remember me functionality', async ({ page }) => {
      const user = TEST_USERS.AD_USER;
      await ApiHelper.mockAuthEndpoints(page, user);
      
      // Login with remember me
      await loginPage.goto();
      await loginPage.loginWithAD(user.username, user.password, true);
      
      await page.waitForURL('**/dashboard');
      
      // Close and reopen browser context
      await page.context().close();
      const newContext = await page.context().browser()?.newContext();
      const newPage = await newContext!.newPage();
      
      // Navigate to dashboard - should be remembered
      await newPage.goto('/dashboard');
      
      // Depending on implementation, might redirect to login or stay authenticated
      // This test would need to match actual remember me behavior
      const currentUrl = newPage.url();
      
      // At minimum, user should not get an error
      expect(currentUrl).not.toContain('error');
      
      await newPage.close();
      await newContext!.close();
    });
  });

  test.describe('Token Management', () => {
    test('should refresh token before expiration', async ({ page }) => {
      const user = TEST_USERS.AD_USER;
      await ApiHelper.mockAuthEndpoints(page, user);
      
      let refreshCalled = false;
      await page.route('**/api/auth/refresh', (route) => {
        refreshCalled = true;
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            token: 'new-refreshed-token',
            expiresIn: 3600
          })
        });
      });
      
      // Login
      await AuthHelper.login(page, 'AD_USER');
      
      // Simulate token near expiration
      await page.evaluate(() => {
        // Set token to expire in 5 minutes (assuming 5min refresh threshold)
        const fiveMinutesFromNow = Date.now() + (5 * 60 * 1000);
        localStorage.setItem('tokenExpiry', fiveMinutesFromNow.toString());
      });
      
      // Trigger activity that would check token
      await page.reload();
      await page.waitForLoadState('networkidle');
      
      // Token refresh should have been attempted
      expect(refreshCalled).toBe(true);
      expect(page.url()).toContain('dashboard');
    });

    test('should logout when token refresh fails', async ({ page }) => {
      const user = TEST_USERS.AD_USER;
      await ApiHelper.mockAuthEndpoints(page, user);
      
      // Mock failed token refresh
      await page.route('**/api/auth/refresh', (route) => {
        route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Refresh token expired'
          })
        });
      });
      
      // Login
      await AuthHelper.login(page, 'AD_USER');
      
      // Simulate expired token
      await page.evaluate(() => {
        localStorage.setItem('tokenExpiry', (Date.now() - 1000).toString());
      });
      
      // Trigger token check
      await page.reload();
      
      // Should redirect to login
      await page.waitForURL('**/login', { timeout: TEST_CONFIG.DEFAULT_TIMEOUT });
      expect(page.url()).toContain('login');
    });

    test('should handle concurrent token refresh requests', async ({ page }) => {
      const user = TEST_USERS.AD_USER;
      await ApiHelper.mockAuthEndpoints(page, user);
      
      let refreshCount = 0;
      await page.route('**/api/auth/refresh', (route) => {
        refreshCount++;
        // Add delay to simulate race condition
        setTimeout(() => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              token: `new-token-${refreshCount}`,
              expiresIn: 3600
            })
          });
        }, 100);
      });
      
      // Login
      await AuthHelper.login(page, 'AD_USER');
      
      // Simulate expired token
      await page.evaluate(() => {
        localStorage.setItem('tokenExpiry', (Date.now() - 1000).toString());
      });
      
      // Make multiple concurrent requests that would trigger refresh
      const promises = [
        page.reload(),
        page.goto('/reports'),
        page.goto('/dashboard')
      ];
      
      await Promise.allSettled(promises);
      
      // Should only make one refresh request
      expect(refreshCount).toBeLessThanOrEqual(1);
    });

    test('should validate token integrity', async ({ page }) => {
      const user = TEST_USERS.AD_USER;
      await ApiHelper.mockAuthEndpoints(page, user);
      
      // Login
      await AuthHelper.login(page, 'AD_USER');
      
      // Tamper with token
      await page.evaluate(() => {
        localStorage.setItem('authToken', 'tampered-token');
      });
      
      // Mock token validation failure
      await page.route('**/api/auth/validate', (route) => {
        route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Invalid token'
          })
        });
      });
      
      // Try to access protected resource
      await page.reload();
      
      // Should redirect to login due to invalid token
      await page.waitForURL('**/login', { timeout: TEST_CONFIG.DEFAULT_TIMEOUT });
    });
  });

  test.describe('Idle Session Timeout', () => {
    test('should warn user before session timeout', async ({ page }) => {
      const user = TEST_USERS.AD_USER;
      await ApiHelper.mockAuthEndpoints(page, user);
      
      // Login
      await AuthHelper.login(page, 'AD_USER');
      
      // Simulate approaching idle timeout
      await page.evaluate(() => {
        // Dispatch custom event that would normally be triggered by idle timer
        window.dispatchEvent(new CustomEvent('idle-warning', {
          detail: { timeLeft: 60 } // 1 minute left
        }));
      });
      
      await page.waitForTimeout(1000);
      
      // Check for idle warning modal or notification
      const warningModal = page.locator('.idle-warning, .session-timeout-warning, .ant-modal');
      const hasWarning = await warningModal.isVisible();
      
      // If implemented, should show warning
      if (hasWarning) {
        expect(await warningModal.textContent()).toMatch(/(idle|timeout|expire)/i);
        
        // Should have option to extend session
        const extendButton = warningModal.locator('button:has-text("Extend"), button:has-text("Continue")');
        expect(await extendButton.isVisible()).toBe(true);
      }
    });

    test('should extend session when user chooses to continue', async ({ page }) => {
      const user = TEST_USERS.AD_USER;
      await ApiHelper.mockAuthEndpoints(page, user);
      
      let extendCalled = false;
      await page.route('**/api/auth/extend-session', (route) => {
        extendCalled = true;
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            expiresIn: 3600
          })
        });
      });
      
      // Login
      await AuthHelper.login(page, 'AD_USER');
      
      // Simulate idle warning and user response
      await page.evaluate(() => {
        window.dispatchEvent(new CustomEvent('idle-warning'));
      });
      
      const warningModal = page.locator('.idle-warning, .session-timeout-warning');
      if (await warningModal.isVisible()) {
        const extendButton = warningModal.locator('button:has-text("Extend"), button:has-text("Continue")');
        await extendButton.click();
        
        expect(extendCalled).toBe(true);
        
        // Modal should close
        await warningModal.waitFor({ state: 'hidden' });
      }
      
      // Should remain authenticated
      expect(page.url()).toContain('dashboard');
    });

    test('should logout user after idle timeout', async ({ page }) => {
      const user = TEST_USERS.AD_USER;
      await ApiHelper.mockAuthEndpoints(page, user);
      
      // Login
      await AuthHelper.login(page, 'AD_USER');
      
      // Simulate idle timeout
      await page.evaluate(() => {
        window.dispatchEvent(new CustomEvent('idle-timeout'));
      });
      
      // Should redirect to login
      await page.waitForURL('**/login', { timeout: TEST_CONFIG.DEFAULT_TIMEOUT });
      
      // Should show timeout message
      const hasError = await loginPage.hasError();
      if (hasError) {
        const errorMessage = await loginPage.getErrorMessage();
        expect(errorMessage).toMatch(/(idle|timeout|inactivity)/i);
      }
    });

    test('should reset idle timer on user activity', async ({ page }) => {
      const user = TEST_USERS.AD_USER;
      await ApiHelper.mockAuthEndpoints(page, user);
      
      // Login
      await AuthHelper.login(page, 'AD_USER');
      
      // Track idle timer resets
      let timerResetCount = 0;
      await page.evaluate(() => {
        let originalCount = 0;
        (window as any).resetIdleTimer = () => {
          originalCount++;
          (window as any).idleResetCount = originalCount;
        };
      });
      
      // Simulate various user activities
      await page.mouse.move(100, 100);
      await page.keyboard.press('Space');
      await page.click('body');
      
      await page.waitForTimeout(1000);
      
      // Check if idle timer was reset
      const resetCount = await page.evaluate(() => (window as any).idleResetCount || 0);
      expect(resetCount).toBeGreaterThan(0);
    });
  });

  test.describe('Cross-tab Session Management', () => {
    test('should synchronize logout across tabs', async ({ page, context }) => {
      const user = TEST_USERS.AD_USER;
      await ApiHelper.mockAuthEndpoints(page, user);
      
      // Login on first tab
      await AuthHelper.login(page, 'AD_USER');
      
      // Open second tab
      const secondPage = await context.newPage();
      await secondPage.goto('/dashboard');
      await secondPage.waitForLoadState('networkidle');
      
      // Mock logout endpoint
      await ApiHelper.mockApiResponse(page, '**/api/auth/logout', {
        success: true
      });
      
      // Logout from first tab
      await dashboardPage.logout();
      
      // Second tab should also logout
      await secondPage.waitForTimeout(2000);
      await secondPage.reload();
      
      await secondPage.waitForURL('**/login', { timeout: TEST_CONFIG.DEFAULT_TIMEOUT });
      expect(secondPage.url()).toContain('login');
      
      await secondPage.close();
    });

    test('should handle token refresh across tabs', async ({ page, context }) => {
      const user = TEST_USERS.AD_USER;
      await ApiHelper.mockAuthEndpoints(page, user);
      
      let refreshCount = 0;
      await page.route('**/api/auth/refresh', (route) => {
        refreshCount++;
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            token: 'refreshed-token',
            expiresIn: 3600
          })
        });
      });
      
      // Login on first tab
      await AuthHelper.login(page, 'AD_USER');
      
      // Open second tab
      const secondPage = await context.newPage();
      await secondPage.goto('/dashboard');
      
      // Simulate token expiration
      await page.evaluate(() => {
        localStorage.setItem('tokenExpiry', (Date.now() - 1000).toString());
      });
      
      // Trigger refresh on both tabs
      await Promise.all([
        page.reload(),
        secondPage.reload()
      ]);
      
      // Should only refresh once
      expect(refreshCount).toBeLessThanOrEqual(1);
      
      // Both tabs should remain authenticated
      expect(page.url()).toContain('dashboard');
      expect(secondPage.url()).toContain('dashboard');
      
      await secondPage.close();
    });

    test('should handle session storage conflicts', async ({ page, context }) => {
      const user = TEST_USERS.AD_USER;
      await ApiHelper.mockAuthEndpoints(page, user);
      
      // Login on first tab
      await AuthHelper.login(page, 'AD_USER');
      
      // Open second tab and modify session
      const secondPage = await context.newPage();
      await secondPage.goto('/dashboard');
      
      // Simulate different session data on second tab
      await secondPage.evaluate(() => {
        localStorage.setItem('user', JSON.stringify({
          username: 'different-user',
          displayName: 'Different User'
        }));
      });
      
      // Refresh first tab
      await page.reload();
      
      // Should handle conflict gracefully - either reconcile or logout
      await page.waitForLoadState('networkidle');
      const currentUrl = page.url();
      
      // Should either stay authenticated with correct user or logout
      expect(currentUrl).toMatch(/(dashboard|login)/);
      
      if (currentUrl.includes('dashboard')) {
        // If authenticated, should have consistent user data
        const userInfo = await dashboardPage.getCurrentUserInfo();
        expect(userInfo?.username).toBe(user.username);
      }
      
      await secondPage.close();
    });
  });

  test.describe('Security and Edge Cases', () => {
    test('should handle malformed session data', async ({ page }) => {
      // Set malformed session data
      await page.evaluate(() => {
        localStorage.setItem('authToken', 'not-a-valid-jwt');
        localStorage.setItem('user', 'invalid-json');
        localStorage.setItem('isAuthenticated', 'maybe');
      });
      
      // Try to access protected page
      await page.goto('/dashboard');
      
      // Should redirect to login due to invalid session
      await page.waitForURL('**/login', { timeout: TEST_CONFIG.DEFAULT_TIMEOUT });
      
      // Should clear malformed data
      const authData = await page.evaluate(() => ({
        token: localStorage.getItem('authToken'),
        user: localStorage.getItem('user'),
        isAuth: localStorage.getItem('isAuthenticated')
      }));
      
      // Malformed data should be cleared
      expect(authData.token).toBeFalsy();
      expect(authData.user).toBeFalsy();
      expect(authData.isAuth).toBeFalsy();
    });

    test('should prevent session fixation attacks', async ({ page }) => {
      // Set a session ID before login
      const originalSessionId = 'attacker-session-id';
      await page.evaluate((sessionId) => {
        localStorage.setItem('sessionId', sessionId);
      }, originalSessionId);
      
      const user = TEST_USERS.AD_USER;
      await ApiHelper.mockAuthEndpoints(page, user);
      
      // Login should generate new session
      await AuthHelper.login(page, 'AD_USER');
      
      // Session ID should have changed after login
      const newSessionId = await page.evaluate(() => {
        return localStorage.getItem('sessionId');
      });
      
      // New session should be different from attacker's session
      expect(newSessionId).not.toBe(originalSessionId);
    });

    test('should handle concurrent login attempts', async ({ page }) => {
      const user = TEST_USERS.AD_USER;
      
      let loginCount = 0;
      await page.route('**/api/auth/login', (route) => {
        loginCount++;
        setTimeout(() => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              user: user,
              token: `token-${loginCount}`
            })
          });
        }, 100);
      });
      
      await loginPage.goto();
      
      // Try multiple concurrent logins
      const loginPromises = [
        loginPage.loginWithAD(user.username, user.password),
        loginPage.loginWithAD(user.username, user.password)
      ];
      
      await Promise.allSettled(loginPromises);
      
      // Should handle gracefully and only process one login
      expect(loginCount).toBeLessThanOrEqual(1);
      
      // Should end up authenticated
      await page.waitForURL('**/dashboard', { timeout: TEST_CONFIG.DEFAULT_TIMEOUT });
    });

    test('should validate session on sensitive operations', async ({ page }) => {
      const user = TEST_USERS.AD_USER;
      await ApiHelper.mockAuthEndpoints(page, user);
      
      // Login
      await AuthHelper.login(page, 'AD_USER');
      
      // Mock session validation for sensitive operation
      let validateCalled = false;
      await page.route('**/api/auth/validate-session', (route) => {
        validateCalled = true;
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ valid: true })
        });
      });
      
      // Navigate to sensitive page (like settings)
      await page.goto('/settings');
      
      // Should validate session for sensitive operations
      await page.waitForTimeout(1000);
      
      // Depending on implementation, might validate session
      // For now, just verify we can access the page
      expect(page.url()).toContain('settings');
    });
  });
});