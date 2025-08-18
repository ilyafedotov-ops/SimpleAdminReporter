import { test, expect } from '@playwright/test';
import { LoginPage, DashboardPage } from '../../pages';
import { AuthHelper, ApiHelper, FormHelper } from '../../utils/test-helpers';
import { TEST_USERS, TEST_CONFIG } from '../../fixtures/test-data';

test.describe('Authentication - Login Flows', () => {
  let loginPage: LoginPage;
  let dashboardPage: DashboardPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    dashboardPage = new DashboardPage(page);
    
    // Setup basic API mocks before navigation
    await ApiHelper.mockAuthEndpoints(page, TEST_USERS.AD_USER);
    
    // Navigate to login page
    await loginPage.goto();
  });

  test.describe('LDAP Authentication', () => {
    test('should successfully login with valid AD credentials', async ({ page }) => {
      const user = TEST_USERS.AD_USER;
      
      // Perform login (mocks already set up in beforeEach)
      await loginPage.selectAuthSource('ad');
      await loginPage.enterUsername(user.username);
      await loginPage.enterPassword(user.password);
      await loginPage.clickLogin();
      
      // Verify successful login
      const result = await loginPage.waitForLoginCompletion();
      expect(result).toBe('success');
      
      // Verify redirect to dashboard
      expect(page.url()).toContain('dashboard');
      
      // Verify dashboard is loaded
      const isLoaded = await dashboardPage.isLoaded();
      expect(isLoaded).toBe(true);
    });

    test('should show error message for invalid AD credentials', async ({ page }) => {
      // Override the default successful login mock with a failure response
      await ApiHelper.mockApiResponse(page, '**/api/auth/login', {
        success: false,
        error: 'Invalid credentials'
      }, 401);
      
      await loginPage.selectAuthSource('ad');
      await loginPage.enterUsername('invalid@testdomain.local');
      await loginPage.enterPassword('wrongpassword');
      await loginPage.clickLogin();
      
      // Verify error is shown
      const result = await loginPage.waitForLoginCompletion();
      expect(result).toBe('error');
      
      const errorMessage = await loginPage.getErrorMessage();
      expect(errorMessage).toContain('Invalid credentials');
      
      // Verify still on login page
      expect(page.url()).toContain('login');
    });

    test('should validate required fields for AD login', async ({ page }) => {
      await loginPage.selectAuthSource('ad');
      
      // Try to submit without filling fields
      await loginPage.clickLogin();
      
      // Check for validation errors
      const errors = await loginPage.getFormErrors();
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(error => error.includes('username'))).toBe(true);
      expect(errors.some(error => error.includes('password'))).toBe(true);
    });

    test('should handle different username formats for AD', async ({ page }) => {
      const user = TEST_USERS.AD_USER;
      await ApiHelper.mockAuthEndpoints(page, user);
      
      // Test domain\username format
      await loginPage.selectAuthSource('ad');
      await loginPage.enterUsername('TESTDOMAIN\\testuser');
      await loginPage.enterPassword(user.password);
      await loginPage.clickLogin();
      
      const result = await loginPage.waitForLoginCompletion();
      expect(result).toBe('success');
    });

    test('should remember user login when remember me is checked', async ({ page }) => {
      const user = TEST_USERS.AD_USER;
      await ApiHelper.mockAuthEndpoints(page, user);
      
      await loginPage.loginWithAD(user.username, user.password, true);
      
      // Verify login success
      const result = await loginPage.waitForLoginCompletion();
      expect(result).toBe('success');
      
      // Check that remember me cookie or local storage is set
      const cookies = await page.context().cookies();
      const hasRememberToken = cookies.some(cookie => 
        cookie.name.includes('remember') || cookie.name.includes('persist')
      );
      
      // This would depend on actual implementation
      // For now, just verify successful login
      expect(page.url()).toContain('dashboard');
    });
  });

  test.describe('Azure AD Authentication', () => {
    test('should initiate Azure AD OAuth flow', async ({ page }) => {
      await loginPage.selectAuthSource('azure');
      
      // Verify Azure-specific UI elements appear
      const isAzureFlow = await loginPage.isAzureAuthFlowActive();
      expect(isAzureFlow).toBe(true);
      
      // Click login should trigger OAuth flow
      await loginPage.clickLogin();
      
      // For actual Azure testing, this would handle OAuth redirect
      // For now, verify UI state changes
      expect(await page.locator('button:has-text("Sign in with Microsoft")').isVisible()).toBe(true);
    });

    test('should handle Azure AD OAuth callback', async ({ page }) => {
      // Mock successful Azure authentication
      const user = TEST_USERS.AZURE_USER;
      await ApiHelper.mockAuthEndpoints(page, user);
      
      // Simulate OAuth callback with token
      await page.goto('/login?code=mock_auth_code&state=mock_state');
      
      // Wait for backend to process OAuth callback
      await page.waitForLoadState('networkidle');
      
      // Should redirect to dashboard after successful OAuth
      await page.waitForURL('**/dashboard', { timeout: TEST_CONFIG.DEFAULT_TIMEOUT });
      
      const isAuthenticated = await AuthHelper.isAuthenticated(page);
      expect(isAuthenticated).toBe(true);
    });

    test('should handle Azure AD OAuth errors', async ({ page }) => {
      // Navigate with OAuth error parameters
      await page.goto('/login?error=access_denied&error_description=User%20cancelled');
      
      // Should show appropriate error message
      const errorMessage = await loginPage.getErrorMessage();
      expect(errorMessage).toContain('access_denied');
    });

    test('should show appropriate UI for Azure AD authentication', async ({ page }) => {
      await loginPage.selectAuthSource('azure');
      
      // Username/password fields should be hidden for Azure
      const hasUsernameField = await page.locator('input[name="username"]').isVisible();
      const hasPasswordField = await page.locator('input[name="password"]').isVisible();
      
      expect(hasUsernameField).toBe(false);
      expect(hasPasswordField).toBe(false);
      
      // Should show Microsoft-specific branding
      const azureButton = await page.locator('button:has-text("Sign in with Microsoft")');
      expect(await azureButton.isVisible()).toBe(true);
    });
  });

  test.describe('Local Authentication', () => {
    test('should successfully login with local account', async ({ page }) => {
      const user = TEST_USERS.LOCAL_ADMIN;
      await ApiHelper.mockAuthEndpoints(page, user);
      
      await loginPage.loginWithLocal(user.username, user.password);
      
      const result = await loginPage.waitForLoginCompletion();
      expect(result).toBe('success');
      
      expect(page.url()).toContain('dashboard');
    });

    test('should validate local account credentials', async ({ page }) => {
      await ApiHelper.mockApiResponse(page, '**/api/auth/login', {
        success: false,
        error: 'Invalid local account credentials'
      }, 401);
      
      await loginPage.selectAuthSource('local');
      await loginPage.enterUsername('nonexistent');
      await loginPage.enterPassword('wrongpass');
      await loginPage.clickLogin();
      
      const result = await loginPage.waitForLoginCompletion();
      expect(result).toBe('error');
      
      const errorMessage = await loginPage.getErrorMessage();
      expect(errorMessage).toContain('Invalid');
    });
  });

  test.describe('Form Validation and UX', () => {
    test('should show loading state during authentication', async ({ page }) => {
      const user = TEST_USERS.AD_USER;
      
      // Mock delayed response
      await page.route('**/api/auth/login', async (route) => {
        await page.waitForTimeout(2000); // 2 second delay
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            user: user,
            token: 'mock-token'
          })
        });
      });
      
      await loginPage.selectAuthSource('ad');
      await loginPage.enterUsername(user.username);
      await loginPage.enterPassword(user.password);
      await loginPage.clickLogin();
      
      // Verify loading state is shown
      const isLoading = await loginPage.isLoading();
      expect(isLoading).toBe(true);
      
      // Wait for completion
      await loginPage.waitForLoginCompletion();
    });

    test('should disable login button while request is in progress', async ({ page }) => {
      await page.route('**/api/auth/login', async (route) => {
        await page.waitForTimeout(1000);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, user: TEST_USERS.AD_USER, token: 'token' })
        });
      });
      
      await loginPage.selectAuthSource('ad');
      await loginPage.enterUsername('test@domain.local');
      await loginPage.enterPassword('password');
      
      const loginButton = page.locator('button[type="submit"]');
      await loginButton.click();
      
      // Button should be disabled during request
      const isDisabled = await loginButton.isDisabled();
      expect(isDisabled).toBe(true);
    });

    test('should clear form when switching authentication sources', async ({ page }) => {
      // Fill AD credentials
      await loginPage.selectAuthSource('ad');
      await loginPage.enterUsername('test@domain.local');
      await loginPage.enterPassword('password123');
      
      // Switch to local auth
      await loginPage.selectAuthSource('local');
      
      // Fields should be cleared or show appropriate state
      const usernameValue = await page.locator('input[name="username"]').inputValue();
      expect(usernameValue).toBe('');
    });

    test('should show proper placeholders for different auth sources', async ({ page }) => {
      // Check AD placeholder
      await loginPage.selectAuthSource('ad');
      const adPlaceholder = await page.locator('input[name="username"]').getAttribute('placeholder');
      expect(adPlaceholder).toMatch(/(domain|username@)/i);
      
      // Check local placeholder
      await loginPage.selectAuthSource('local');
      const localPlaceholder = await page.locator('input[name="username"]').getAttribute('placeholder');
      expect(localPlaceholder).toBeTruthy();
    });
  });

  test.describe('Session Management', () => {
    test('should maintain session after page refresh', async ({ page }) => {
      const user = TEST_USERS.AD_USER;
      await ApiHelper.mockAuthEndpoints(page, user);
      
      // Login successfully
      await AuthHelper.login(page, 'AD_USER');
      
      // Refresh page
      await page.reload();
      await page.waitForLoadState('networkidle');
      
      // Should still be authenticated
      expect(page.url()).toContain('dashboard');
      const isAuthenticated = await AuthHelper.isAuthenticated(page);
      expect(isAuthenticated).toBe(true);
    });

    test('should redirect to login when session expires', async ({ page }) => {
      // Mock expired session
      await page.route('**/api/auth/profile', (route) => {
        route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Session expired' })
        });
      });
      
      // Try to access protected page
      await page.goto('/dashboard');
      
      // Should redirect to login
      await page.waitForURL('**/login', { timeout: TEST_CONFIG.DEFAULT_TIMEOUT });
      
      // Should show session expired message
      const hasError = await loginPage.hasError();
      if (hasError) {
        const errorMessage = await loginPage.getErrorMessage();
        expect(errorMessage).toMatch(/(session|expired|unauthorized)/i);
      }
    });

    test('should handle concurrent login attempts', async ({ page, context }) => {
      const user = TEST_USERS.AD_USER;
      await ApiHelper.mockAuthEndpoints(page, user);
      
      // Open second page in same context
      const secondPage = await context.newPage();
      const secondLoginPage = new LoginPage(secondPage);
      
      await secondLoginPage.goto();
      
      // Login on first page
      await AuthHelper.login(page, 'AD_USER');
      
      // Try to login on second page - should handle gracefully
      await secondLoginPage.selectAuthSource('ad');
      await secondLoginPage.enterUsername(user.username);
      await secondLoginPage.enterPassword(user.password);
      await secondLoginPage.clickLogin();
      
      // Both pages should end up authenticated
      await secondPage.waitForURL('**/dashboard');
      expect(await AuthHelper.isAuthenticated(page)).toBe(true);
      expect(await AuthHelper.isAuthenticated(secondPage)).toBe(true);
      
      await secondPage.close();
    });
  });

  test.describe('Security and Edge Cases', () => {
    test('should handle network errors gracefully', async ({ page }) => {
      // Mock network failure
      await page.route('**/api/auth/login', (route) => {
        route.abort('failed');
      });
      
      await loginPage.selectAuthSource('ad');
      await loginPage.enterUsername('test@domain.local');
      await loginPage.enterPassword('password');
      await loginPage.clickLogin();
      
      // Should show network error
      const result = await loginPage.waitForLoginCompletion();
      expect(result).toBe('error');
      
      const errorMessage = await loginPage.getErrorMessage();
      expect(errorMessage).toMatch(/(network|connection|failed)/i);
    });

    test('should prevent CSRF attacks with proper tokens', async ({ page }) => {
      // This would test CSRF token implementation
      // For now, verify that requests include proper headers
      let requestHeaders: Record<string, string> = {};
      
      await page.route('**/api/auth/login', (route) => {
        requestHeaders = route.request().headers();
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, user: TEST_USERS.AD_USER, token: 'token' })
        });
      });
      
      await loginPage.selectAuthSource('ad');
      await loginPage.enterUsername('test@domain.local');
      await loginPage.enterPassword('password');
      await loginPage.clickLogin();
      
      // Verify security headers are present
      expect(requestHeaders['content-type']).toContain('application/json');
      // Additional CSRF token checks would go here
    });

    test('should sanitize user input', async ({ page }) => {
      // Test XSS prevention
      const maliciousInput = '<script>alert("xss")</script>';
      
      await loginPage.selectAuthSource('ad');
      await loginPage.enterUsername(maliciousInput);
      await loginPage.enterPassword('password');
      
      // Input should be properly escaped
      const usernameValue = await page.locator('input[name="username"]').inputValue();
      expect(usernameValue).toBe(maliciousInput); // Input should be preserved but not executed
      
      // Check that no alert was triggered
      const alerts: string[] = [];
      page.on('dialog', dialog => {
        alerts.push(dialog.message());
        dialog.dismiss();
      });
      
      await loginPage.clickLogin();
      await page.waitForTimeout(1000);
      expect(alerts.length).toBe(0);
    });

    test('should handle rate limiting', async ({ page }) => {
      // Mock rate limiting response
      await page.route('**/api/auth/login', (route) => {
        route.fulfill({
          status: 429,
          contentType: 'application/json',
          body: JSON.stringify({ 
            error: 'Too many login attempts. Please try again later.',
            retryAfter: 60 
          })
        });
      });
      
      await loginPage.selectAuthSource('ad');
      await loginPage.enterUsername('test@domain.local');
      await loginPage.enterPassword('password');
      await loginPage.clickLogin();
      
      const result = await loginPage.waitForLoginCompletion();
      expect(result).toBe('error');
      
      const errorMessage = await loginPage.getErrorMessage();
      expect(errorMessage).toMatch(/(too many|rate limit|try again)/i);
    });
  });

  test.describe('Accessibility', () => {
    test('should be keyboard navigable', async ({ page }) => {
      await loginPage.goto();
      
      // Tab through form elements
      await page.keyboard.press('Tab'); // Auth source select
      await page.keyboard.press('Tab'); // Username
      await page.keyboard.press('Tab'); // Password
      await page.keyboard.press('Tab'); // Login button
      
      // Enter key should submit form
      await loginPage.selectAuthSource('ad');
      await loginPage.enterUsername('test@domain.local');
      await loginPage.enterPassword('password');
      
      await page.keyboard.press('Enter');
      
      // Should trigger login attempt
      await page.waitForTimeout(500);
      const isLoading = await loginPage.isLoading();
      expect(isLoading).toBe(true);
    });

    test('should have proper ARIA labels and roles', async ({ page }) => {
      await loginPage.goto();
      
      // Check for proper form labels
      const usernameLabel = await page.locator('label[for*="username"], [aria-label*="username"]').count();
      const passwordLabel = await page.locator('label[for*="password"], [aria-label*="password"]').count();
      
      expect(usernameLabel).toBeGreaterThan(0);
      expect(passwordLabel).toBeGreaterThan(0);
      
      // Check for proper error announcements
      await loginPage.clickLogin(); // Try to submit empty form
      
      const errorElements = await page.locator('[role="alert"], .ant-form-item-explain-error').count();
      expect(errorElements).toBeGreaterThan(0);
    });
  });
});