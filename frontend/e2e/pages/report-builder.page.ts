import { Page, Locator } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Page Object Model for Report Builder Page
 * Handles custom report builder functionality with drag-and-drop
 */
export class ReportBuilderPage extends BasePage {
  // Main builder components
  readonly pageTitle: Locator;
  readonly dataSourceSelector: Locator;
  readonly fieldsPanel: Locator;
  readonly queryBuilder: Locator;
  readonly previewPanel: Locator;
  
  // Field explorer
  readonly fieldCategories: Locator;
  readonly availableFields: Locator;
  readonly selectedFields: Locator;
  readonly fieldSearch: Locator;
  
  // Query builder components
  readonly selectFieldsArea: Locator;
  readonly filtersArea: Locator;
  readonly groupByArea: Locator;
  readonly orderByArea: Locator;
  
  // Filter builder
  readonly filterBuilder: Locator;
  readonly addFilterButton: Locator;
  readonly filterRows: Locator;
  
  // Actions
  readonly previewButton: Locator;
  readonly executeButton: Locator;
  readonly saveTemplateButton: Locator;
  readonly clearButton: Locator;
  readonly exportQueryButton: Locator;
  
  // Preview and results
  readonly previewResults: Locator;
  readonly queryPreview: Locator;
  readonly executionTime: Locator;
  readonly resultCount: Locator;

  constructor(page: Page) {
    super(page);
    
    // Main builder components
    this.pageTitle = page.locator('h1, .page-title').first();
    this.dataSourceSelector = page.locator('[data-testid="data-source-select"], .data-source-select').first();
    this.fieldsPanel = page.locator('[data-testid="fields-panel"], .fields-panel').first();
    this.queryBuilder = page.locator('[data-testid="query-builder"], .query-builder').first();
    this.previewPanel = page.locator('[data-testid="preview-panel"], .preview-panel').first();
    
    // Field explorer
    this.fieldCategories = page.locator('[data-testid="field-categories"], .field-categories').first();
    this.availableFields = page.locator('[data-testid="available-fields"], .available-fields').first();
    this.selectedFields = page.locator('[data-testid="selected-fields"], .selected-fields').first();
    this.fieldSearch = page.locator('input[placeholder*="Search fields"], .field-search').first();
    
    // Query builder components
    this.selectFieldsArea = page.locator('[data-testid="select-fields"], .select-fields-area').first();
    this.filtersArea = page.locator('[data-testid="filters-area"], .filters-area').first();
    this.groupByArea = page.locator('[data-testid="group-by"], .group-by-area').first();
    this.orderByArea = page.locator('[data-testid="order-by"], .order-by-area').first();
    
    // Filter builder
    this.filterBuilder = page.locator('[data-testid="filter-builder"], .filter-builder').first();
    this.addFilterButton = page.locator('button:has-text("Add Filter"), .add-filter-btn').first();
    this.filterRows = page.locator('[data-testid="filter-row"], .filter-row').first();
    
    // Actions
    this.previewButton = page.locator('button:has-text("Preview"), .preview-btn').first();
    this.executeButton = page.locator('button:has-text("Execute"), button:has-text("Run Query")').first();
    this.saveTemplateButton = page.locator('button:has-text("Save Template"), .save-template-btn').first();
    this.clearButton = page.locator('button:has-text("Clear"), .clear-btn').first();
    this.exportQueryButton = page.locator('button:has-text("Export Query"), .export-query-btn').first();
    
    // Preview and results
    this.previewResults = page.locator('[data-testid="preview-results"], .preview-results').first();
    this.queryPreview = page.locator('[data-testid="query-preview"], .query-preview').first();
    this.executionTime = page.locator('[data-testid="execution-time"], .execution-time').first();
    this.resultCount = page.locator('[data-testid="result-count"], .result-count').first();
  }

  /**
   * Navigate to report builder page
   */
  async goto(): Promise<void> {
    await this.navigate('/reports/builder');
    await this.waitForPageLoad();
  }

  /**
   * Check if report builder page is loaded
   */
  async isLoaded(): Promise<boolean> {
    try {
      await this.waitForElement('[data-testid="report-builder"], .report-builder', 10000);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Select data source for query building
   */
  async selectDataSource(source: 'ad' | 'azure' | 'o365'): Promise<void> {
    await this.dataSourceSelector.click();
    
    const option = this.page.locator(`.ant-select-item:has-text("${source}"), [data-value="${source}"]`);
    await option.click();
    
    await this.waitForLoadingToComplete();
  }

  /**
   * Search for fields in the field explorer
   */
  async searchFields(query: string): Promise<void> {
    await this.fieldSearch.fill(query);
    await this.page.waitForTimeout(500); // Debounce search
  }

  /**
   * Get available field categories
   */
  async getFieldCategories(): Promise<string[]> {
    const categories: string[] = [];
    
    if (await this.fieldCategories.isVisible()) {
      const categoryItems = await this.fieldCategories.locator('.category-item, .ant-collapse-header').all();
      
      for (const item of categoryItems) {
        const text = await item.textContent();
        if (text) categories.push(text.trim());
      }
    }
    
    return categories;
  }

  /**
   * Expand field category
   */
  async expandFieldCategory(categoryName: string): Promise<void> {
    const category = this.fieldCategories.locator(`.category-item:has-text("${categoryName}"), .ant-collapse-header:has-text("${categoryName}")`);
    await category.click();
    await this.page.waitForTimeout(300); // Wait for expand animation
  }

  /**
   * Get available fields for current data source
   */
  async getAvailableFields(): Promise<Array<{name: string, type: string, description: string}>> {
    const fields: Array<{name: string, type: string, description: string}> = [];
    
    if (await this.availableFields.isVisible()) {
      const fieldItems = await this.availableFields.locator('.field-item, [data-testid="field-item"]').all();
      
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

  /**
   * Drag field to select fields area
   */
  async dragFieldToSelect(fieldName: string): Promise<void> {
    const sourceField = this.availableFields.locator(`[data-field-name="${fieldName}"], .field-item:has-text("${fieldName}")`);
    const targetArea = this.selectFieldsArea;
    
    // Perform drag and drop
    await sourceField.dragTo(targetArea);
    await this.page.waitForTimeout(500); // Wait for drop animation
  }

  /**
   * Add field to query by clicking
   */
  async addFieldToQuery(fieldName: string): Promise<void> {
    const field = this.availableFields.locator(`[data-field-name="${fieldName}"], .field-item:has-text("${fieldName}")`);
    
    // Double-click to add field
    await field.dblclick();
    await this.page.waitForTimeout(300);
  }

  /**
   * Remove field from query
   */
  async removeFieldFromQuery(fieldName: string): Promise<void> {
    const selectedField = this.selectedFields.locator(`[data-field-name="${fieldName}"], .selected-field:has-text("${fieldName}")`);
    
    // Look for remove button (X icon)
    const removeButton = selectedField.locator('.remove-field, .ant-tag-close-icon');
    await removeButton.click();
  }

  /**
   * Add filter to query
   */
  async addFilter(field: string, operator: string, value: string): Promise<void> {
    await this.addFilterButton.click();
    
    // Get the new filter row (last one)
    const filterRow = this.filtersArea.locator('.filter-row').last();
    
    // Select field
    const fieldSelect = filterRow.locator('.field-select, [data-testid="filter-field"]');
    await fieldSelect.click();
    await this.page.locator(`.ant-select-item:has-text("${field}")`).click();
    
    // Select operator
    const operatorSelect = filterRow.locator('.operator-select, [data-testid="filter-operator"]');
    await operatorSelect.click();
    await this.page.locator(`.ant-select-item:has-text("${operator}")`).click();
    
    // Enter value
    const valueInput = filterRow.locator('.value-input, [data-testid="filter-value"]');
    await valueInput.fill(value);
  }

  /**
   * Remove filter from query
   */
  async removeFilter(index: number): Promise<void> {
    const filterRows = await this.filtersArea.locator('.filter-row').all();
    if (filterRows[index]) {
      const removeButton = filterRows[index].locator('.remove-filter, .delete-filter');
      await removeButton.click();
    }
  }

  /**
   * Add group by field
   */
  async addGroupBy(fieldName: string): Promise<void> {
    const field = this.availableFields.locator(`[data-field-name="${fieldName}"], .field-item:has-text("${fieldName}")`);
    await field.dragTo(this.groupByArea);
  }

  /**
   * Add order by field
   */
  async addOrderBy(fieldName: string, direction: 'asc' | 'desc' = 'asc'): Promise<void> {
    const field = this.availableFields.locator(`[data-field-name="${fieldName}"], .field-item:has-text("${fieldName}")`);
    await field.dragTo(this.orderByArea);
    
    // Set sort direction if control is available
    const sortDirectionButton = this.orderByArea.locator(`[data-field="${fieldName}"] .sort-direction`);
    if (await sortDirectionButton.isVisible()) {
      // Click to toggle between asc/desc until we get the desired direction
      const currentDirection = await sortDirectionButton.getAttribute('data-direction');
      if (currentDirection !== direction) {
        await sortDirectionButton.click();
      }
    }
  }

  /**
   * Preview query without executing
   */
  async previewQuery(): Promise<void> {
    await this.previewButton.click();
    await this.waitForLoadingToComplete();
  }

  /**
   * Execute query and get results
   */
  async executeQuery(): Promise<void> {
    await this.executeButton.click();
    await this.waitForLoadingToComplete();
  }

  /**
   * Get generated query preview
   */
  async getQueryPreview(): Promise<string> {
    if (await this.queryPreview.isVisible()) {
      return await this.queryPreview.textContent() || '';
    }
    return '';
  }

  /**
   * Get query execution results
   */
  async getQueryResults(): Promise<{
    totalRecords: number;
    executionTime: string;
    data: Array<Record<string, string>>;
  }> {
    const result = {
      totalRecords: 0,
      executionTime: '',
      data: [] as Array<Record<string, string>>
    };

    // Get result count
    if (await this.resultCount.isVisible()) {
      const countText = await this.resultCount.textContent();
      const match = countText?.match(/(\d+)/);
      if (match) {
        result.totalRecords = parseInt(match[1]);
      }
    }

    // Get execution time
    if (await this.executionTime.isVisible()) {
      result.executionTime = await this.executionTime.textContent() || '';
    }

    // Get result data
    if (await this.previewResults.isVisible()) {
      const table = this.previewResults.locator('table').first();
      if (await table.isVisible()) {
        const rows = await table.locator('tbody tr').all();
        const headers = await table.locator('thead th').allTextContents();
        
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
      }
    }

    return result;
  }

  /**
   * Save query as template
   */
  async saveAsTemplate(name: string, description?: string, category?: string): Promise<void> {
    await this.saveTemplateButton.click();
    
    const modal = this.page.locator('.save-template-modal, .ant-modal');
    await modal.waitFor({ state: 'visible' });
    
    // Fill template details
    await modal.locator('input[name="name"]').fill(name);
    if (description) {
      await modal.locator('textarea[name="description"]').fill(description);
    }
    if (category) {
      await modal.locator('.category-select').click();
      await this.page.locator(`.ant-select-item:has-text("${category}")`).click();
    }
    
    // Save
    await modal.locator('button:has-text("Save")').click();
    await modal.waitFor({ state: 'hidden' });
  }

  /**
   * Clear all query components
   */
  async clearQuery(): Promise<void> {
    await this.clearButton.click();
    
    // Confirm if confirmation dialog appears
    const confirmDialog = this.page.locator('.ant-modal-confirm, .ant-popconfirm');
    if (await confirmDialog.isVisible()) {
      await confirmDialog.locator('button:has-text("Yes"), button:has-text("OK")').click();
    }
  }

  /**
   * Export query as SQL or other format
   */
  async exportQuery(format: 'sql' | 'json' = 'sql'): Promise<void> {
    await this.exportQueryButton.click();
    
    const exportDropdown = this.page.locator('.export-dropdown, .ant-dropdown-menu');
    if (await exportDropdown.isVisible()) {
      await exportDropdown.locator(`button:has-text("${format.toUpperCase()}")`).click();
    }
  }

  /**
   * Get selected fields in query
   */
  async getSelectedFields(): Promise<string[]> {
    const fields: string[] = [];
    
    if (await this.selectedFields.isVisible()) {
      const fieldItems = await this.selectedFields.locator('.selected-field, .ant-tag').all();
      
      for (const item of fieldItems) {
        const text = await item.textContent();
        if (text) fields.push(text.trim());
      }
    }
    
    return fields;
  }

  /**
   * Get applied filters
   */
  async getAppliedFilters(): Promise<Array<{field: string, operator: string, value: string}>> {
    const filters: Array<{field: string, operator: string, value: string}> = [];
    
    if (await this.filtersArea.isVisible()) {
      const filterRows = await this.filtersArea.locator('.filter-row').all();
      
      for (const row of filterRows) {
        const field = await row.locator('.field-select .ant-select-selection-item').textContent();
        const operator = await row.locator('.operator-select .ant-select-selection-item').textContent();
        const value = await row.locator('.value-input').inputValue();
        
        if (field && operator && value) {
          filters.push({
            field: field.trim(),
            operator: operator.trim(),
            value: value.trim()
          });
        }
      }
    }
    
    return filters;
  }

  /**
   * Verify report builder elements
   */
  async verifyPageElements(): Promise<{
    hasDataSourceSelector: boolean;
    hasFieldsPanel: boolean;
    hasQueryBuilder: boolean;
    hasPreviewPanel: boolean;
    hasActionButtons: boolean;
  }> {
    return {
      hasDataSourceSelector: await this.dataSourceSelector.isVisible(),
      hasFieldsPanel: await this.fieldsPanel.isVisible(),
      hasQueryBuilder: await this.queryBuilder.isVisible(),
      hasPreviewPanel: await this.previewPanel.isVisible(),
      hasActionButtons: await this.previewButton.isVisible() && await this.executeButton.isVisible()
    };
  }
}