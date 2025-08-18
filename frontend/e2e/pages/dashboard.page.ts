import { Page, Locator } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Page Object Model for Dashboard Page
 * Handles main dashboard functionality and navigation
 */
export class DashboardPage extends BasePage {
  // Navigation elements
  readonly mainNavigation: Locator;
  readonly userProfileDropdown: Locator;
  readonly logoutButton: Locator;
  readonly settingsButton: Locator;
  
  // Dashboard widgets
  readonly statsCards: Locator;
  readonly recentReportsWidget: Locator;
  readonly quickActionsWidget: Locator;
  readonly systemHealthWidget: Locator;
  
  // Page sections
  readonly welcomeMessage: Locator;
  readonly searchBar: Locator;
  readonly notificationBell: Locator;
  
  // Navigation menu items
  readonly reportsMenuItem: Locator;
  readonly reportBuilderMenuItem: Locator;
  readonly templatesMenuItem: Locator;
  readonly settingsMenuItem: Locator;
  readonly healthMenuItem: Locator;

  constructor(page: Page) {
    super(page);
    
    // Navigation elements
    this.mainNavigation = page.locator('[role="navigation"], .ant-menu, nav').first();
    this.userProfileDropdown = page.locator('[data-testid="user-profile"], .ant-dropdown-trigger').first();
    this.logoutButton = page.locator('button:has-text("Logout"), button:has-text("Sign Out")').first();
    this.settingsButton = page.locator('button:has-text("Settings"), a[href*="settings"]').first();
    
    // Dashboard widgets
    this.statsCards = page.locator('[data-testid="stats-card"], .ant-card').first();
    this.recentReportsWidget = page.locator('[data-testid="recent-reports"], .recent-reports').first();
    this.quickActionsWidget = page.locator('[data-testid="quick-actions"], .quick-actions').first();
    this.systemHealthWidget = page.locator('[data-testid="system-health"], .system-health').first();
    
    // Page sections
    this.welcomeMessage = page.locator('h1, .welcome-message, [data-testid="welcome"]').first();
    this.searchBar = page.locator('input[type="search"], .ant-input-search, [placeholder*="search"]').first();
    this.notificationBell = page.locator('[data-testid="notifications"], .notification-bell').first();
    
    // Navigation menu items
    this.reportsMenuItem = page.locator('a[href*="reports"], .ant-menu-item:has-text("Reports")').first();
    this.reportBuilderMenuItem = page.locator('a[href*="builder"], .ant-menu-item:has-text("Report Builder")').first();
    this.templatesMenuItem = page.locator('a[href*="templates"], .ant-menu-item:has-text("Templates")').first();
    this.settingsMenuItem = page.locator('a[href*="settings"], .ant-menu-item:has-text("Settings")').first();
    this.healthMenuItem = page.locator('a[href*="health"], .ant-menu-item:has-text("Health")').first();
  }

  /**
   * Navigate to dashboard page
   */
  async goto(): Promise<void> {
    await this.navigate('/dashboard');
    await this.waitForPageLoad();
  }

  /**
   * Check if dashboard page is loaded
   */
  async isLoaded(): Promise<boolean> {
    try {
      await this.waitForElement('[data-testid="dashboard"], .dashboard, main', 10000);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get welcome message text
   */
  async getWelcomeMessage(): Promise<string> {
    if (await this.welcomeMessage.isVisible()) {
      return await this.welcomeMessage.textContent() || '';
    }
    return '';
  }

  /**
   * Navigate to Reports page
   */
  async navigateToReports(): Promise<void> {
    await this.reportsMenuItem.click();
    await this.page.waitForURL('**/reports');
    await this.waitForLoadingToComplete();
  }

  /**
   * Navigate to Report Builder page
   */
  async navigateToReportBuilder(): Promise<void> {
    await this.reportBuilderMenuItem.click();
    await this.page.waitForURL('**/builder');
    await this.waitForLoadingToComplete();
  }

  /**
   * Navigate to Templates page
   */
  async navigateToTemplates(): Promise<void> {
    await this.templatesMenuItem.click();
    await this.page.waitForURL('**/templates');
    await this.waitForLoadingToComplete();
  }

  /**
   * Navigate to Settings page
   */
  async navigateToSettings(): Promise<void> {
    await this.settingsMenuItem.click();
    await this.page.waitForURL('**/settings');
    await this.waitForLoadingToComplete();
  }

  /**
   * Navigate to Health page
   */
  async navigateToHealth(): Promise<void> {
    await this.healthMenuItem.click();
    await this.page.waitForURL('**/health');
    await this.waitForLoadingToComplete();
  }

  /**
   * Open user profile dropdown
   */
  async openUserProfile(): Promise<void> {
    await this.userProfileDropdown.click();
    await this.page.waitForSelector('.ant-dropdown-menu', { state: 'visible' });
  }

  /**
   * Logout from the application
   */
  async logout(): Promise<void> {
    await this.openUserProfile();
    await this.logoutButton.click();
    await this.page.waitForURL('**/login');
  }

  /**
   * Perform global search
   */
  async search(query: string): Promise<void> {
    await this.searchBar.fill(query);
    await this.searchBar.press('Enter');
    await this.waitForLoadingToComplete();
  }

  /**
   * Get dashboard statistics
   */
  async getDashboardStats(): Promise<Array<{title: string, value: string}>> {
    const cards = await this.page.locator('[data-testid="stats-card"], .ant-statistic').all();
    const stats: Array<{title: string, value: string}> = [];
    
    for (const card of cards) {
      const title = await card.locator('.ant-statistic-title, .stats-title').textContent();
      const value = await card.locator('.ant-statistic-content-value, .stats-value').textContent();
      
      if (title && value) {
        stats.push({ title: title.trim(), value: value.trim() });
      }
    }
    
    return stats;
  }

  /**
   * Get recent reports from widget
   */
  async getRecentReports(): Promise<Array<{name: string, date: string, status: string}>> {
    const reports: Array<{name: string, date: string, status: string}> = [];
    
    if (await this.recentReportsWidget.isVisible()) {
      const reportItems = await this.recentReportsWidget.locator('.report-item, tr').all();
      
      for (const item of reportItems) {
        const name = await item.locator('.report-name, td:nth-child(1)').textContent();
        const date = await item.locator('.report-date, td:nth-child(2)').textContent();
        const status = await item.locator('.report-status, td:nth-child(3)').textContent();
        
        if (name && date && status) {
          reports.push({
            name: name.trim(),
            date: date.trim(),
            status: status.trim()
          });
        }
      }
    }
    
    return reports;
  }

  /**
   * Check system health status
   */
  async getSystemHealthStatus(): Promise<{
    overall: string,
    services: Array<{name: string, status: string}>
  }> {
    const result = {
      overall: 'unknown',
      services: [] as Array<{name: string, status: string}>
    };
    
    if (await this.systemHealthWidget.isVisible()) {
      const overallStatus = await this.systemHealthWidget.locator('.health-overall, .health-status').textContent();
      if (overallStatus) {
        result.overall = overallStatus.trim();
      }
      
      const serviceItems = await this.systemHealthWidget.locator('.service-item, .health-item').all();
      for (const item of serviceItems) {
        const name = await item.locator('.service-name').textContent();
        const status = await item.locator('.service-status').textContent();
        
        if (name && status) {
          result.services.push({
            name: name.trim(),
            status: status.trim()
          });
        }
      }
    }
    
    return result;
  }

  /**
   * Click quick action button
   */
  async clickQuickAction(actionName: string): Promise<void> {
    const actions = await this.quickActionsWidget.locator('button, .action-button').all();
    
    for (const action of actions) {
      const text = await action.textContent();
      if (text && text.toLowerCase().includes(actionName.toLowerCase())) {
        await action.click();
        await this.waitForLoadingToComplete();
        break;
      }
    }
  }

  /**
   * Get notification count
   */
  async getNotificationCount(): Promise<number> {
    if (await this.notificationBell.isVisible()) {
      const badge = await this.notificationBell.locator('.ant-badge-count').textContent();
      return badge ? parseInt(badge) : 0;
    }
    return 0;
  }

  /**
   * Open notifications panel
   */
  async openNotifications(): Promise<void> {
    await this.notificationBell.click();
    await this.page.waitForSelector('.notifications-panel, .ant-dropdown-menu', { state: 'visible' });
  }

  /**
   * Verify dashboard elements are loaded
   */
  async verifyDashboardElements(): Promise<{
    hasNavigation: boolean;
    hasWelcomeMessage: boolean;
    hasStatsCards: boolean;
    hasUserProfile: boolean;
    hasSearchBar: boolean;
  }> {
    return {
      hasNavigation: await this.mainNavigation.isVisible(),
      hasWelcomeMessage: await this.welcomeMessage.isVisible(),
      hasStatsCards: await this.statsCards.isVisible(),
      hasUserProfile: await this.userProfileDropdown.isVisible(),
      hasSearchBar: await this.searchBar.isVisible()
    };
  }

  /**
   * Check if user is authenticated (dashboard accessible)
   */
  async isUserAuthenticated(): Promise<boolean> {
    const currentUrl = this.getCurrentUrl();
    return !currentUrl.includes('login') && await this.isLoaded();
  }

  /**
   * Get current user info from profile
   */
  async getCurrentUserInfo(): Promise<{username: string, role: string} | null> {
    try {
      await this.openUserProfile();
      
      const username = await this.page.locator('.user-name, .profile-name').textContent();
      const role = await this.page.locator('.user-role, .profile-role').textContent();
      
      // Close dropdown
      await this.page.keyboard.press('Escape');
      
      return {
        username: username?.trim() || '',
        role: role?.trim() || ''
      };
    } catch {
      return null;
    }
  }
}