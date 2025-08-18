import { Page, Locator } from '@playwright/test';

/**
 * Base Page Object Model class that provides common functionality
 * for all page objects in the application
 */
export class BasePage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Navigate to a specific URL
   */
  async navigate(url: string): Promise<void> {
    await this.page.goto(url);
  }

  /**
   * Wait for page to be fully loaded
   */
  async waitForPageLoad(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Get current URL
   */
  getCurrentUrl(): string {
    return this.page.url();
  }

  /**
   * Take a screenshot for visual testing
   */
  async takeScreenshot(name: string): Promise<Buffer> {
    return await this.page.screenshot({ 
      path: `test-results/screenshots/${name}.png`,
      fullPage: true 
    });
  }

  /**
   * Wait for element to be visible
   */
  async waitForElement(selector: string, timeout: number = 10000): Promise<Locator> {
    const element = this.page.locator(selector);
    await element.waitFor({ state: 'visible', timeout });
    return element;
  }

  /**
   * Wait for element to be hidden
   */
  async waitForElementToBeHidden(selector: string, timeout: number = 10000): Promise<void> {
    await this.page.locator(selector).waitFor({ state: 'hidden', timeout });
  }

  /**
   * Fill form field with value
   */
  async fillField(selector: string, value: string): Promise<void> {
    await this.page.locator(selector).fill(value);
  }

  /**
   * Click element with retry logic
   */
  async clickElement(selector: string): Promise<void> {
    await this.page.locator(selector).click();
  }

  /**
   * Select option from dropdown
   */
  async selectOption(selector: string, value: string): Promise<void> {
    await this.page.locator(selector).selectOption(value);
  }

  /**
   * Check if element is visible
   */
  async isElementVisible(selector: string): Promise<boolean> {
    try {
      await this.page.locator(selector).waitFor({ state: 'visible', timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get element text content
   */
  async getElementText(selector: string): Promise<string> {
    return await this.page.locator(selector).textContent() || '';
  }

  /**
   * Get element attribute value
   */
  async getElementAttribute(selector: string, attribute: string): Promise<string | null> {
    return await this.page.locator(selector).getAttribute(attribute);
  }

  /**
   * Scroll element into view
   */
  async scrollToElement(selector: string): Promise<void> {
    await this.page.locator(selector).scrollIntoViewIfNeeded();
  }

  /**
   * Wait for API response
   */
  async waitForApiResponse(urlPattern: string | RegExp, timeout: number = 30000): Promise<any> {
    const responsePromise = this.page.waitForResponse(
      response => {
        const url = response.url();
        return typeof urlPattern === 'string' ? 
          url.includes(urlPattern) : 
          urlPattern.test(url);
      },
      { timeout }
    );
    
    const response = await responsePromise;
    return await response.json();
  }

  /**
   * Handle alert dialogs
   */
  async handleAlert(accept: boolean = true): Promise<void> {
    this.page.on('dialog', async (dialog) => {
      if (accept) {
        await dialog.accept();
      } else {
        await dialog.dismiss();
      }
    });
  }

  /**
   * Wait for loading spinner to disappear
   */
  async waitForLoadingToComplete(): Promise<void> {
    // Common loading indicators in the app
    const loadingSelectors = [
      '[data-testid="loading-spinner"]',
      '.ant-spin',
      '.ant-skeleton',
      '[data-testid="page-loading"]'
    ];

    for (const selector of loadingSelectors) {
      try {
        await this.page.locator(selector).waitFor({ state: 'hidden', timeout: 5000 });
      } catch {
        // Continue if this loading indicator wasn't present
      }
    }
  }

  /**
   * Get validation error messages
   */
  async getValidationErrors(): Promise<string[]> {
    const errorElements = await this.page.locator('.ant-form-item-explain-error').all();
    const errors: string[] = [];
    
    for (const element of errorElements) {
      const text = await element.textContent();
      if (text) errors.push(text);
    }
    
    return errors;
  }

  /**
   * Check if form has validation errors
   */
  async hasValidationErrors(): Promise<boolean> {
    return await this.page.locator('.ant-form-item-explain-error').count() > 0;
  }

  /**
   * Clear all form fields
   */
  async clearAllFormFields(): Promise<void> {
    const inputs = await this.page.locator('input, textarea').all();
    for (const input of inputs) {
      await input.clear();
    }
  }
}