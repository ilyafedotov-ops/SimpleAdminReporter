import { Page, Locator } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Page Object Model for Settings Page
 * Handles credential management, field discovery, and system settings
 */
export class SettingsPage extends BasePage {
  // Main page elements
  readonly pageTitle: Locator;
  readonly settingsMenu: Locator;
  readonly settingsContent: Locator;
  
  // Credential management section
  readonly credentialsTab: Locator;
  readonly addCredentialButton: Locator;
  readonly credentialsList: Locator;
  readonly credentialForm: Locator;
  
  // Field discovery section
  readonly fieldDiscoveryTab: Locator;
  readonly discoverFieldsButton: Locator;
  readonly fieldCategoriesView: Locator;
  readonly refreshFieldsButton: Locator;
  
  // User preferences section
  readonly preferencesTab: Locator;
  readonly themeSelector: Locator;
  readonly languageSelector: Locator;
  readonly notificationSettings: Locator;
  
  // System settings (admin only)
  readonly systemTab: Locator;
  readonly systemHealthStatus: Locator;
  readonly maintenanceMode: Locator;

  constructor(page: Page) {
    super(page);
    
    // Main page elements
    this.pageTitle = page.locator('h1, .page-title').first();
    this.settingsMenu = page.locator('.settings-menu, .ant-menu').first();
    this.settingsContent = page.locator('.settings-content, .ant-layout-content').first();
    
    // Credential management
    this.credentialsTab = page.locator('[data-testid="credentials-tab"], .ant-menu-item:has-text("Credentials")').first();
    this.addCredentialButton = page.locator('button:has-text("Add Credential"), .add-credential-btn').first();
    this.credentialsList = page.locator('[data-testid="credentials-list"], .credentials-list').first();
    this.credentialForm = page.locator('.credential-form, form').first();
    
    // Field discovery
    this.fieldDiscoveryTab = page.locator('[data-testid="fields-tab"], .ant-menu-item:has-text("Fields")').first();
    this.discoverFieldsButton = page.locator('button:has-text("Discover Fields"), .discover-fields-btn').first();
    this.fieldCategoriesView = page.locator('[data-testid="field-categories"], .field-categories').first();
    this.refreshFieldsButton = page.locator('button:has-text("Refresh"), .refresh-fields-btn').first();
    
    // User preferences
    this.preferencesTab = page.locator('[data-testid="preferences-tab"], .ant-menu-item:has-text("Preferences")').first();
    this.themeSelector = page.locator('[data-testid="theme-selector"], .theme-selector').first();
    this.languageSelector = page.locator('[data-testid="language-selector"], .language-selector').first();
    this.notificationSettings = page.locator('[data-testid="notifications"], .notification-settings').first();
    
    // System settings
    this.systemTab = page.locator('[data-testid="system-tab"], .ant-menu-item:has-text("System")').first();
    this.systemHealthStatus = page.locator('[data-testid="system-health"], .system-health').first();
    this.maintenanceMode = page.locator('[data-testid="maintenance-mode"], .maintenance-toggle').first();
  }

  /**
   * Navigate to settings page
   */
  async goto(): Promise<void> {
    await this.navigate('/settings');
    await this.waitForPageLoad();
  }

  /**
   * Check if settings page is loaded
   */
  async isLoaded(): Promise<boolean> {
    try {
      await this.waitForElement('[data-testid="settings-page"], .settings-page', 10000);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Navigate to credentials management section
   */
  async navigateToCredentials(): Promise<void> {
    await this.credentialsTab.click();
    await this.waitForLoadingToComplete();
  }

  /**
   * Navigate to field discovery section
   */
  async navigateToFieldDiscovery(): Promise<void> {
    await this.fieldDiscoveryTab.click();
    await this.waitForLoadingToComplete();
  }

  /**
   * Navigate to user preferences section
   */
  async navigateToPreferences(): Promise<void> {
    await this.preferencesTab.click();
    await this.waitForLoadingToComplete();
  }

  /**
   * Navigate to system settings (admin only)
   */
  async navigateToSystem(): Promise<void> {
    if (await this.systemTab.isVisible()) {
      await this.systemTab.click();
      await this.waitForLoadingToComplete();
    }
  }

  // Credential Management Methods

  /**
   * Add new credential
   */
  async addCredential(credentialData: {
    name: string;
    type: 'ad' | 'azure' | 'o365';
    server?: string;
    username: string;
    password: string;
    domain?: string;
    tenantId?: string;
    clientId?: string;
    clientSecret?: string;
  }): Promise<void> {
    await this.addCredentialButton.click();
    
    // Wait for form modal
    const modal = this.page.locator('.ant-modal, .credential-modal');
    await modal.waitFor({ state: 'visible' });
    
    // Fill credential form
    await modal.locator('input[name="name"]').fill(credentialData.name);
    
    // Select credential type
    await modal.locator('.credential-type-select, [data-testid="credential-type"]').click();
    await this.page.locator(`.ant-select-item:has-text("${credentialData.type.toUpperCase()}")`).click();
    
    // Fill type-specific fields
    if (credentialData.type === 'ad') {
      if (credentialData.server) {
        await modal.locator('input[name="server"]').fill(credentialData.server);
      }
      if (credentialData.domain) {
        await modal.locator('input[name="domain"]').fill(credentialData.domain);
      }
    }
    
    if (credentialData.type === 'azure' || credentialData.type === 'o365') {
      if (credentialData.tenantId) {
        await modal.locator('input[name="tenantId"]').fill(credentialData.tenantId);
      }
      if (credentialData.clientId) {
        await modal.locator('input[name="clientId"]').fill(credentialData.clientId);
      }
      if (credentialData.clientSecret) {
        await modal.locator('input[name="clientSecret"]').fill(credentialData.clientSecret);
      }
    }
    
    // Common fields
    await modal.locator('input[name="username"]').fill(credentialData.username);
    await modal.locator('input[name="password"], input[type="password"]').fill(credentialData.password);
    
    // Save credential
    await modal.locator('button:has-text("Save"), button:has-text("Add")').click();
    await modal.waitFor({ state: 'hidden' });
  }

  /**
   * Test credential connection
   */
  async testCredential(credentialName: string): Promise<'success' | 'error'> {
    const credentialItem = this.credentialsList.locator(`.credential-item:has-text("${credentialName}")`);
    const testButton = credentialItem.locator('button:has-text("Test"), .test-connection');
    
    await testButton.click();
    
    // Wait for test result
    await this.page.waitForTimeout(3000);
    
    const successIndicator = credentialItem.locator('.success-indicator, .ant-tag-success');
    const errorIndicator = credentialItem.locator('.error-indicator, .ant-tag-error');
    
    if (await successIndicator.isVisible()) {
      return 'success';
    } else if (await errorIndicator.isVisible()) {
      return 'error';
    }
    
    return 'error';
  }

  /**
   * Delete credential
   */
  async deleteCredential(credentialName: string): Promise<void> {
    const credentialItem = this.credentialsList.locator(`.credential-item:has-text("${credentialName}")`);
    const deleteButton = credentialItem.locator('button:has-text("Delete"), .delete-btn');
    
    await deleteButton.click();
    
    // Confirm deletion if modal appears
    const confirmModal = this.page.locator('.ant-modal-confirm, .delete-confirm');
    if (await confirmModal.isVisible()) {
      await confirmModal.locator('button:has-text("Yes"), button:has-text("Delete")').click();
    }
    
    await this.waitForLoadingToComplete();
  }

  /**
   * Get list of configured credentials
   */
  async getCredentialsList(): Promise<Array<{
    name: string;
    type: string;
    status: string;
    lastTested?: string;
  }>> {
    const credentials: Array<{
      name: string;
      type: string;
      status: string;
      lastTested?: string;
    }> = [];
    
    if (await this.credentialsList.isVisible()) {
      const credentialItems = await this.credentialsList.locator('.credential-item, .ant-card').all();
      
      for (const item of credentialItems) {
        const name = await item.locator('.credential-name, .ant-card-meta-title').textContent();
        const type = await item.locator('.credential-type, .type-badge').textContent();
        const status = await item.locator('.credential-status, .status-badge').textContent();
        const lastTested = await item.locator('.last-tested, .test-date').textContent();
        
        if (name && type && status) {
          credentials.push({
            name: name.trim(),
            type: type.trim(),
            status: status.trim(),
            lastTested: lastTested?.trim()
          });
        }
      }
    }
    
    return credentials;
  }

  // Field Discovery Methods

  /**
   * Discover fields for a data source
   */
  async discoverFields(dataSource: 'ad' | 'azure' | 'o365'): Promise<void> {
    // Select data source
    const dataSourceSelect = this.page.locator('.data-source-select, [data-testid="field-discovery-source"]');
    if (await dataSourceSelect.isVisible()) {
      await dataSourceSelect.click();
      await this.page.locator(`.ant-select-item:has-text("${dataSource.toUpperCase()}")`).click();
    }
    
    // Start field discovery
    await this.discoverFieldsButton.click();
    
    // Wait for discovery to complete
    await this.waitForLoadingToComplete();
  }

  /**
   * Refresh field metadata cache
   */
  async refreshFields(): Promise<void> {
    await this.refreshFieldsButton.click();
    await this.waitForLoadingToComplete();
  }

  /**
   * Get discovered field categories
   */
  async getFieldCategories(): Promise<Array<{
    name: string;
    fieldCount: number;
    lastUpdated?: string;
  }>> {
    const categories: Array<{
      name: string;
      fieldCount: number;
      lastUpdated?: string;
    }> = [];
    
    if (await this.fieldCategoriesView.isVisible()) {
      const categoryItems = await this.fieldCategoriesView.locator('.category-item, .field-category').all();
      
      for (const item of categoryItems) {
        const name = await item.locator('.category-name, .ant-collapse-header').textContent();
        const countText = await item.locator('.field-count, .count-badge').textContent();
        const lastUpdated = await item.locator('.last-updated, .update-time').textContent();
        
        if (name) {
          const fieldCount = countText ? parseInt(countText.match(/\d+/)?.[0] || '0') : 0;
          
          categories.push({
            name: name.trim(),
            fieldCount,
            lastUpdated: lastUpdated?.trim()
          });
        }
      }
    }
    
    return categories;
  }

  /**
   * Get fields in a specific category
   */
  async getFieldsInCategory(categoryName: string): Promise<Array<{
    name: string;
    type: string;
    description: string;
  }>> {
    // Expand category first
    const categoryHeader = this.fieldCategoriesView.locator(`.category-item:has-text("${categoryName}") .ant-collapse-header`);
    if (await categoryHeader.isVisible()) {
      await categoryHeader.click();
      await this.page.waitForTimeout(500);
    }
    
    const fields: Array<{
      name: string;
      type: string;
      description: string;
    }> = [];
    
    const categoryContent = this.fieldCategoriesView.locator(`.category-item:has-text("${categoryName}") .ant-collapse-content`);
    if (await categoryContent.isVisible()) {
      const fieldItems = await categoryContent.locator('.field-item').all();
      
      for (const item of fieldItems) {
        const name = await item.locator('.field-name').textContent();
        const type = await item.locator('.field-type').textContent();
        const description = await item.locator('.field-description').textContent();
        
        if (name) {
          fields.push({
            name: name.trim(),
            type: type?.trim() || '',
            description: description?.trim() || ''
          });
        }
      }
    }
    
    return fields;
  }

  // User Preferences Methods

  /**
   * Change theme
   */
  async changeTheme(theme: 'light' | 'dark' | 'auto'): Promise<void> {
    await this.themeSelector.click();
    await this.page.locator(`.ant-select-item:has-text("${theme}")`).click();
    
    // Save changes
    const saveButton = this.page.locator('button:has-text("Save"), .save-preferences-btn');
    if (await saveButton.isVisible()) {
      await saveButton.click();
    }
  }

  /**
   * Change language
   */
  async changeLanguage(language: string): Promise<void> {
    if (await this.languageSelector.isVisible()) {
      await this.languageSelector.click();
      await this.page.locator(`.ant-select-item:has-text("${language}")`).click();
      
      // Save changes
      const saveButton = this.page.locator('button:has-text("Save")');
      if (await saveButton.isVisible()) {
        await saveButton.click();
      }
    }
  }

  /**
   * Update notification settings
   */
  async updateNotificationSettings(settings: {
    emailNotifications?: boolean;
    reportCompletionAlerts?: boolean;
    systemAlerts?: boolean;
    weeklyDigest?: boolean;
  }): Promise<void> {
    if (await this.notificationSettings.isVisible()) {
      const settingsForm = this.notificationSettings;
      
      for (const [setting, value] of Object.entries(settings)) {
        const checkbox = settingsForm.locator(`input[name="${setting}"], [data-testid="${setting}"]`);
        if (await checkbox.isVisible()) {
          if (value) {
            await checkbox.check();
          } else {
            await checkbox.uncheck();
          }
        }
      }
      
      // Save settings
      const saveButton = settingsForm.locator('button:has-text("Save")');
      if (await saveButton.isVisible()) {
        await saveButton.click();
      }
    }
  }

  // System Settings Methods (Admin only)

  /**
   * Get system health status
   */
  async getSystemHealthStatus(): Promise<{
    overall: string;
    services: Array<{ name: string; status: string; responseTime?: string }>;
    lastChecked?: string;
  }> {
    const result = {
      overall: 'unknown',
      services: [] as Array<{ name: string; status: string; responseTime?: string }>,
      lastChecked: undefined as string | undefined
    };
    
    if (await this.systemHealthStatus.isVisible()) {
      const overallStatus = await this.systemHealthStatus.locator('.overall-status, .health-overall').textContent();
      if (overallStatus) {
        result.overall = overallStatus.trim();
      }
      
      const serviceItems = await this.systemHealthStatus.locator('.service-status, .health-service').all();
      for (const item of serviceItems) {
        const name = await item.locator('.service-name').textContent();
        const status = await item.locator('.service-status').textContent();
        const responseTime = await item.locator('.response-time').textContent();
        
        if (name && status) {
          result.services.push({
            name: name.trim(),
            status: status.trim(),
            responseTime: responseTime?.trim()
          });
        }
      }
      
      const lastChecked = await this.systemHealthStatus.locator('.last-checked').textContent();
      if (lastChecked) {
        result.lastChecked = lastChecked.trim();
      }
    }
    
    return result;
  }

  /**
   * Toggle maintenance mode (admin only)
   */
  async toggleMaintenanceMode(enable: boolean): Promise<void> {
    if (await this.maintenanceMode.isVisible()) {
      const toggle = this.maintenanceMode.locator('.ant-switch, input[type="checkbox"]');
      
      const isCurrentlyEnabled = await toggle.isChecked();
      
      if (isCurrentlyEnabled !== enable) {
        await toggle.click();
        
        // Confirm if confirmation dialog appears
        const confirmDialog = this.page.locator('.ant-modal-confirm');
        if (await confirmDialog.isVisible()) {
          await confirmDialog.locator('button:has-text("Yes"), button:has-text("OK")').click();
        }
      }
    }
  }

  /**
   * Verify settings page elements are loaded
   */
  async verifyPageElements(): Promise<{
    hasTitle: boolean;
    hasSettingsMenu: boolean;
    hasContent: boolean;
    hasCredentialsTab: boolean;
    hasFieldDiscoveryTab: boolean;
    hasPreferencesTab: boolean;
  }> {
    return {
      hasTitle: await this.pageTitle.isVisible(),
      hasSettingsMenu: await this.settingsMenu.isVisible(),
      hasContent: await this.settingsContent.isVisible(),
      hasCredentialsTab: await this.credentialsTab.isVisible(),
      hasFieldDiscoveryTab: await this.fieldDiscoveryTab.isVisible(),
      hasPreferencesTab: await this.preferencesTab.isVisible()
    };
  }

  /**
   * Search within settings
   */
  async searchSettings(query: string): Promise<void> {
    const searchInput = this.page.locator('.settings-search, input[placeholder*="search"]');
    if (await searchInput.isVisible()) {
      await searchInput.fill(query);
      await searchInput.press('Enter');
      await this.waitForLoadingToComplete();
    }
  }
}