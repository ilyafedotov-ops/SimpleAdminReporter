import { Page, Locator } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Page Object Model for Reports Page
 * Handles pre-built reports, report execution, and results display
 */
export class ReportsPage extends BasePage {
  // Main page elements
  readonly pageTitle: Locator;
  readonly dataSourceTabs: Locator;
  readonly reportsList: Locator;
  readonly searchInput: Locator;
  readonly filterDropdown: Locator;
  
  // Report execution
  readonly executeButton: Locator;
  readonly reportParametersForm: Locator;
  readonly executionModal: Locator;
  readonly resultsTable: Locator;
  readonly loadingSpinner: Locator;
  
  // Report results
  readonly exportButton: Locator;
  readonly previewButton: Locator;
  readonly saveTemplateButton: Locator;
  readonly resultsCount: Locator;
  readonly paginationControls: Locator;
  
  // Data source tabs
  readonly adTab: Locator;
  readonly azureTab: Locator;
  readonly o365Tab: Locator;

  constructor(page: Page) {
    super(page);
    
    // Main page elements
    this.pageTitle = page.locator('h1, .page-title').first();
    this.dataSourceTabs = page.locator('.ant-tabs, [role="tablist"]').first();
    this.reportsList = page.locator('.reports-list, .ant-list, [data-testid="reports-list"]').first();
    this.searchInput = page.locator('input[placeholder*="search"], .ant-input-search').first();
    this.filterDropdown = page.locator('.filter-dropdown, .ant-select').first();
    
    // Report execution
    this.executeButton = page.locator('button:has-text("Execute"), button:has-text("Run Report")').first();
    this.reportParametersForm = page.locator('.parameters-form, form').first();
    this.executionModal = page.locator('.ant-modal, [role="dialog"]').first();
    this.resultsTable = page.locator('.results-table, .ant-table, table').first();
    this.loadingSpinner = page.locator('.ant-spin, [data-testid="loading"]').first();
    
    // Report results
    this.exportButton = page.locator('button:has-text("Export"), .export-button').first();
    this.previewButton = page.locator('button:has-text("Preview"), .preview-button').first();
    this.saveTemplateButton = page.locator('button:has-text("Save Template"), .save-template').first();
    this.resultsCount = page.locator('.results-count, .total-records').first();
    this.paginationControls = page.locator('.ant-pagination').first();
    
    // Data source tabs
    this.adTab = page.locator('[data-testid="ad-tab"], .ant-tabs-tab:has-text("Active Directory")').first();
    this.azureTab = page.locator('[data-testid="azure-tab"], .ant-tabs-tab:has-text("Azure AD")').first();
    this.o365Tab = page.locator('[data-testid="o365-tab"], .ant-tabs-tab:has-text("Office 365")').first();
  }

  /**
   * Navigate to reports page
   */
  async goto(): Promise<void> {
    await this.navigate('/reports');
    await this.waitForPageLoad();
  }

  /**
   * Check if reports page is loaded
   */
  async isLoaded(): Promise<boolean> {
    try {
      await this.waitForElement('.reports-page, [data-testid="reports-page"]', 10000);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Select data source tab
   */
  async selectDataSource(source: 'ad' | 'azure' | 'o365'): Promise<void> {
    switch (source) {
      case 'ad':
        await this.adTab.click();
        break;
      case 'azure':
        await this.azureTab.click();
        break;
      case 'o365':
        await this.o365Tab.click();
        break;
    }
    
    await this.waitForLoadingToComplete();
  }

  /**
   * Get list of available reports for current data source
   */
  async getAvailableReports(): Promise<Array<{name: string, description: string, category: string}>> {
    const reports: Array<{name: string, description: string, category: string}> = [];
    
    if (await this.reportsList.isVisible()) {
      const reportItems = await this.reportsList.locator('.report-item, .ant-list-item, .report-card').all();
      
      for (const item of reportItems) {
        const name = await item.locator('.report-name, .ant-list-item-meta-title').textContent();
        const description = await item.locator('.report-description, .ant-list-item-meta-description').textContent();
        const category = await item.locator('.report-category, .category-tag').textContent();
        
        if (name) {
          reports.push({
            name: name.trim(),
            description: description?.trim() || '',
            category: category?.trim() || ''
          });
        }
      }
    }
    
    return reports;
  }

  /**
   * Select a specific report by name
   */
  async selectReport(reportName: string): Promise<void> {
    const reportItems = await this.reportsList.locator('.report-item, .ant-list-item, .report-card').all();
    
    for (const item of reportItems) {
      const name = await item.locator('.report-name, .ant-list-item-meta-title').textContent();
      if (name && name.toLowerCase().includes(reportName.toLowerCase())) {
        await item.click();
        break;
      }
    }
  }

  /**
   * Execute a report with parameters
   */
  async executeReport(parameters: Record<string, any> = {}): Promise<void> {
    // Fill parameters if form is visible
    if (await this.reportParametersForm.isVisible()) {
      for (const [key, value] of Object.entries(parameters)) {
        const field = this.reportParametersForm.locator(`[name="${key}"], [data-testid="${key}"]`);
        if (await field.isVisible()) {
          if (typeof value === 'string') {
            await field.fill(value);
          } else if (typeof value === 'boolean') {
            if (value) await field.check();
            else await field.uncheck();
          }
        }
      }
    }
    
    // Click execute button
    await this.executeButton.click();
    
    // Wait for execution to start
    await this.waitForLoadingToComplete();
  }

  /**
   * Wait for report execution to complete
   */
  async waitForExecutionComplete(timeout: number = 60000): Promise<'success' | 'error' | 'timeout'> {
    try {
      // Wait for either results table to appear or error message
      await Promise.race([
        this.resultsTable.waitFor({ state: 'visible', timeout }),
        this.page.locator('.ant-alert-error, .error-message').waitFor({ state: 'visible', timeout })
      ]);
      
      // Check which condition was met
      if (await this.resultsTable.isVisible()) {
        return 'success';
      } else if (await this.page.locator('.ant-alert-error, .error-message').isVisible()) {
        return 'error';
      }
      
      return 'timeout';
    } catch {
      return 'timeout';
    }
  }

  /**
   * Get execution results
   */
  async getExecutionResults(): Promise<{
    totalRecords: number;
    data: Array<Record<string, string>>;
    executionTime?: string;
  }> {
    const result = {
      totalRecords: 0,
      data: [] as Array<Record<string, string>>,
      executionTime: undefined as string | undefined
    };

    if (await this.resultsTable.isVisible()) {
      // Get total records count
      if (await this.resultsCount.isVisible()) {
        const countText = await this.resultsCount.textContent();
        const match = countText?.match(/(\d+)/);
        if (match) {
          result.totalRecords = parseInt(match[1]);
        }
      }

      // Get table data
      const rows = await this.resultsTable.locator('tbody tr').all();
      const headers = await this.resultsTable.locator('thead th').allTextContents();
      
      for (const row of rows) {
        const cells = await row.locator('td').allTextContents();
        const rowData: Record<string, string> = {};
        
        headers.forEach((header, index) => {
          if (cells[index]) {
            rowData[header.trim()] = cells[index].trim();
          }
        });
        
        result.data.push(rowData);
      }
      
      // Get execution time if available
      const executionInfo = await this.page.locator('.execution-time, .exec-time').textContent();
      if (executionInfo) {
        result.executionTime = executionInfo.trim();
      }
    }

    return result;
  }

  /**
   * Export report results
   */
  async exportReport(format: 'excel' | 'csv' | 'pdf' = 'excel'): Promise<void> {
    await this.exportButton.click();
    
    // Wait for export dropdown if it appears
    const exportDropdown = this.page.locator('.export-dropdown, .ant-dropdown-menu');
    if (await exportDropdown.isVisible()) {
      const formatButton = exportDropdown.locator(`button:has-text("${format}"), .export-${format}`);
      await formatButton.click();
    }
    
    // Wait for download to initiate
    await this.page.waitForTimeout(2000);
  }

  /**
   * Search for reports
   */
  async searchReports(query: string): Promise<void> {
    await this.searchInput.fill(query);
    await this.searchInput.press('Enter');
    await this.waitForLoadingToComplete();
  }

  /**
   * Filter reports by category
   */
  async filterByCategory(category: string): Promise<void> {
    if (await this.filterDropdown.isVisible()) {
      await this.filterDropdown.click();
      
      const option = this.page.locator(`.ant-select-item:has-text("${category}")`);
      await option.click();
      
      await this.waitForLoadingToComplete();
    }
  }

  /**
   * Save report as template
   */
  async saveAsTemplate(templateName: string, description?: string): Promise<void> {
    await this.saveTemplateButton.click();
    
    // Wait for save template modal
    const modal = this.page.locator('.save-template-modal, .ant-modal');
    await modal.waitFor({ state: 'visible' });
    
    // Fill template details
    await modal.locator('input[name="name"]').fill(templateName);
    if (description) {
      await modal.locator('textarea[name="description"]').fill(description);
    }
    
    // Save template
    await modal.locator('button:has-text("Save")').click();
    await modal.waitFor({ state: 'hidden' });
  }

  /**
   * Get error message if execution failed
   */
  async getExecutionError(): Promise<string> {
    const errorElement = this.page.locator('.ant-alert-error .ant-alert-message, .error-message');
    if (await errorElement.isVisible()) {
      return await errorElement.textContent() || '';
    }
    return '';
  }

  /**
   * Preview report without executing
   */
  async previewReport(): Promise<void> {
    await this.previewButton.click();
    
    // Wait for preview modal or panel
    const preview = this.page.locator('.preview-modal, .preview-panel, .ant-modal');
    await preview.waitFor({ state: 'visible' });
  }

  /**
   * Navigate through results pages
   */
  async navigateToPage(pageNumber: number): Promise<void> {
    if (await this.paginationControls.isVisible()) {
      const pageButton = this.paginationControls.locator(`button:has-text("${pageNumber}")`);
      if (await pageButton.isVisible()) {
        await pageButton.click();
        await this.waitForLoadingToComplete();
      }
    }
  }

  /**
   * Get report execution history
   */
  async getReportHistory(): Promise<Array<{
    reportName: string;
    executedAt: string;
    status: string;
    recordCount: number;
  }>> {
    const history: Array<{
      reportName: string;
      executedAt: string;
      status: string;
      recordCount: number;
    }> = [];
    
    // This would need to navigate to history section or be implemented
    // based on actual UI structure
    
    return history;
  }

  /**
   * Verify reports page elements
   */
  async verifyPageElements(): Promise<{
    hasTitle: boolean;
    hasDataSourceTabs: boolean;
    hasReportsList: boolean;
    hasSearchBar: boolean;
  }> {
    return {
      hasTitle: await this.pageTitle.isVisible(),
      hasDataSourceTabs: await this.dataSourceTabs.isVisible(),
      hasReportsList: await this.reportsList.isVisible(),
      hasSearchBar: await this.searchInput.isVisible()
    };
  }
}