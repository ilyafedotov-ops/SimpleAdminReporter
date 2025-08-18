import { Page, Locator } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Page Object Model for Login Page
 * Handles authentication flows: LDAP, Azure AD, Local
 */
export class LoginPage extends BasePage {
  // Page selectors
  readonly authSourceSelect: Locator;
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;
  readonly rememberMeCheckbox: Locator;
  readonly errorAlert: Locator;
  readonly loadingSpinner: Locator;
  readonly azureSignInButton: Locator;
  readonly pageTitle: Locator;
  readonly authSourceDescription: Locator;

  constructor(page: Page) {
    super(page);
    
    // Initialize selectors
    this.authSourceSelect = page.locator('[data-testid="auth-source-select"], .ant-select-selection-search-input').first();
    this.usernameInput = page.locator('input[name="username"], [placeholder*="username"], [placeholder*="domain"]').first();
    this.passwordInput = page.locator('input[name="password"], input[type="password"]').first();
    this.loginButton = page.locator('button[type="submit"], button:has-text("Sign In"), button:has-text("Sign in with Microsoft")').first();
    this.rememberMeCheckbox = page.locator('input[type="checkbox"]:has-text("Remember"), .ant-checkbox').first();
    this.errorAlert = page.locator('.ant-alert-error, [role="alert"]').first();
    this.loadingSpinner = page.locator('.ant-spin, [data-testid="loading"]').first();
    this.azureSignInButton = page.locator('button:has-text("Sign in with Microsoft")');
    this.pageTitle = page.locator('h1, h2, h3').first();
    this.authSourceDescription = page.locator('.ant-typography, p').first();
  }

  /**
   * Navigate to login page
   */
  async goto(): Promise<void> {
    await this.navigate('/login');
    await this.waitForPageLoad();
  }

  /**
   * Check if login page is loaded
   */
  async isLoaded(): Promise<boolean> {
    try {
      await this.waitForElement('form', 10000);
      return await this.isElementVisible('form');
    } catch {
      return false;
    }
  }

  /**
   * Select authentication source
   */
  async selectAuthSource(authSource: 'ad' | 'azure' | 'local'): Promise<void> {
    // Click the select dropdown
    await this.page.locator('.ant-select-selector').click();
    
    // Wait for dropdown options to appear
    await this.page.waitForSelector('.ant-select-dropdown', { state: 'visible' });
    
    // Select the appropriate option based on auth source
    switch (authSource) {
      case 'ad':
        await this.page.locator('.ant-select-item:has-text("Active Directory")').click();
        break;
      case 'azure':
        await this.page.locator('.ant-select-item:has-text("Azure Active Directory")').click();
        break;
      case 'local':
        await this.page.locator('.ant-select-item:has-text("Local Account")').click();
        break;
    }
    
    // Wait for dropdown to close
    await this.page.waitForSelector('.ant-select-dropdown', { state: 'hidden' });
  }

  /**
   * Enter username
   */
  async enterUsername(username: string): Promise<void> {
    await this.usernameInput.fill(username);
  }

  /**
   * Enter password
   */
  async enterPassword(password: string): Promise<void> {
    await this.passwordInput.fill(password);
  }

  /**
   * Click login button
   */
  async clickLogin(): Promise<void> {
    await this.loginButton.click();
  }

  /**
   * Toggle remember me checkbox
   */
  async toggleRememberMe(): Promise<void> {
    if (await this.rememberMeCheckbox.isVisible()) {
      await this.rememberMeCheckbox.click();
    }
  }

  /**
   * Perform LDAP login
   */
  async loginWithAD(username: string, password: string, rememberMe: boolean = false): Promise<void> {
    await this.selectAuthSource('ad');
    await this.enterUsername(username);
    await this.enterPassword(password);
    
    if (rememberMe) {
      await this.toggleRememberMe();
    }
    
    await this.clickLogin();
  }

  /**
   * Perform Azure AD login (OAuth flow)
   */
  async loginWithAzureAD(): Promise<void> {
    await this.selectAuthSource('azure');
    await this.clickLogin();
    // Note: This will trigger Azure AD OAuth flow
    // Actual authentication would need to be handled in test setup
  }

  /**
   * Perform local account login
   */
  async loginWithLocal(username: string, password: string): Promise<void> {
    await this.selectAuthSource('local');
    await this.enterUsername(username);
    await this.enterPassword(password);
    await this.clickLogin();
  }

  /**
   * Wait for login to complete successfully
   */
  async waitForLoginSuccess(): Promise<void> {
    // Wait for redirect to dashboard or main page
    await this.page.waitForURL('**/dashboard', { timeout: 30000 });
    await this.waitForLoadingToComplete();
  }

  /**
   * Get login error message
   */
  async getErrorMessage(): Promise<string> {
    if (await this.errorAlert.isVisible()) {
      return await this.errorAlert.textContent() || '';
    }
    return '';
  }

  /**
   * Check if login failed
   */
  async hasError(): Promise<boolean> {
    return await this.errorAlert.isVisible();
  }

  /**
   * Check if login is in progress
   */
  async isLoading(): Promise<boolean> {
    return await this.loadingSpinner.isVisible();
  }

  /**
   * Wait for login process to complete (success or failure)
   */
  async waitForLoginCompletion(): Promise<'success' | 'error'> {
    try {
      // Race between success (redirect) and error message
      await Promise.race([
        this.page.waitForURL('**/dashboard', { timeout: 30000 }),
        this.errorAlert.waitFor({ state: 'visible', timeout: 30000 })
      ]);
      
      // Check which condition was met
      const currentUrl = this.getCurrentUrl();
      if (currentUrl.includes('dashboard') || currentUrl.includes('main')) {
        return 'success';
      } else if (await this.hasError()) {
        return 'error';
      }
      
      return 'error';
    } catch {
      return 'error';
    }
  }

  /**
   * Get available authentication sources
   */
  async getAvailableAuthSources(): Promise<string[]> {
    await this.page.locator('.ant-select-selector').click();
    await this.page.waitForSelector('.ant-select-dropdown', { state: 'visible' });
    
    const options = await this.page.locator('.ant-select-item').all();
    const authSources: string[] = [];
    
    for (const option of options) {
      const text = await option.textContent();
      if (text) authSources.push(text.trim());
    }
    
    // Close dropdown
    await this.page.keyboard.press('Escape');
    return authSources;
  }

  /**
   * Verify page elements are present
   */
  async verifyPageElements(): Promise<{
    hasAuthSourceSelect: boolean;
    hasUsernameField: boolean;
    hasPasswordField: boolean;
    hasLoginButton: boolean;
    hasTitle: boolean;
  }> {
    return {
      hasAuthSourceSelect: await this.isElementVisible('.ant-select-selector'),
      hasUsernameField: await this.usernameInput.isVisible(),
      hasPasswordField: await this.passwordInput.isVisible(),
      hasLoginButton: await this.loginButton.isVisible(),
      hasTitle: await this.pageTitle.isVisible()
    };
  }

  /**
   * Clear login form
   */
  async clearForm(): Promise<void> {
    if (await this.usernameInput.isVisible()) {
      await this.usernameInput.clear();
    }
    if (await this.passwordInput.isVisible()) {
      await this.passwordInput.clear();
    }
  }

  /**
   * Get form validation errors
   */
  async getFormErrors(): Promise<string[]> {
    return await this.getValidationErrors();
  }

  /**
   * Check if Azure AD auth flow is active
   */
  async isAzureAuthFlowActive(): Promise<boolean> {
    // Check for Azure-specific elements or flows
    return await this.azureSignInButton.isVisible();
  }
}