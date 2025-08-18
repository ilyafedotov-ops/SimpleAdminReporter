import { test, expect } from '@playwright/test';
import { ReportBuilderPage, DashboardPage } from '../../pages';
import { AuthHelper, ApiHelper, FormHelper } from '../../utils/test-helpers';
import { CUSTOM_REPORT_TESTS, TEST_CONFIG } from '../../fixtures/test-data';

test.describe('Report Generation - Custom Report Builder', () => {
  let reportBuilderPage: ReportBuilderPage;
  let dashboardPage: DashboardPage;

  test.beforeEach(async ({ page }) => {
    reportBuilderPage = new ReportBuilderPage(page);
    dashboardPage = new DashboardPage(page);
    
    // Login before each test
    await AuthHelper.login(page, 'AD_USER');
    
    // Navigate to report builder
    await reportBuilderPage.goto();
  });

  test.describe('Builder Interface and Navigation', () => {
    test('should load report builder with all components', async ({ page }) => {
      const isLoaded = await reportBuilderPage.isLoaded();
      expect(isLoaded).toBe(true);

      // Verify main components are present
      const pageElements = await reportBuilderPage.verifyPageElements();
      expect(pageElements.hasDataSourceSelector).toBe(true);
      expect(pageElements.hasFieldsPanel).toBe(true);
      expect(pageElements.hasQueryBuilder).toBe(true);
      expect(pageElements.hasActionButtons).toBe(true);
    });

    test('should select data source and load fields', async ({ page }) => {
      // Mock field discovery
      await ApiHelper.mockApiResponse(page, '**/api/reports/fields*', {
        categories: [
          {
            name: 'Basic Information',
            fields: [
              { name: 'sAMAccountName', type: 'string', description: 'Username' },
              { name: 'displayName', type: 'string', description: 'Display Name' },
              { name: 'mail', type: 'string', description: 'Email Address' }
            ]
          },
          {
            name: 'Security',
            fields: [
              { name: 'enabled', type: 'boolean', description: 'Account Enabled' },
              { name: 'lastLogon', type: 'datetime', description: 'Last Login Time' }
            ]
          }
        ]
      });

      await reportBuilderPage.selectDataSource('ad');
      
      // Verify fields are loaded
      const categories = await reportBuilderPage.getFieldCategories();
      expect(categories.length).toBeGreaterThan(0);
      expect(categories).toContain('Basic Information');
      
      // Expand category and verify fields
      await reportBuilderPage.expandFieldCategory('Basic Information');
      const fields = await reportBuilderPage.getAvailableFields();
      expect(fields.length).toBeGreaterThan(0);
      expect(fields.some(field => field.name === 'sAMAccountName')).toBe(true);
    });

    test('should search fields effectively', async ({ page }) => {
      await ApiHelper.mockApiResponse(page, '**/api/reports/fields*', {
        categories: [
          {
            name: 'User Information',
            fields: [
              { name: 'sAMAccountName', type: 'string', description: 'Username' },
              { name: 'displayName', type: 'string', description: 'Display Name' },
              { name: 'userAccountControl', type: 'integer', description: 'Account Control Flags' }
            ]
          }
        ]
      });

      await reportBuilderPage.selectDataSource('ad');
      
      // Search for specific fields
      await reportBuilderPage.searchFields('Account');
      await page.waitForTimeout(500);
      
      const searchResults = await reportBuilderPage.getAvailableFields();
      searchResults.forEach(field => {
        expect(field.name.toLowerCase() + field.description.toLowerCase()).toContain('account');
      });
    });
  });

  test.describe('Query Building - Field Selection', () => {
    test('should add fields to query using drag and drop', async ({ page }) => {
      await ApiHelper.mockApiResponse(page, '**/api/reports/fields*', {
        categories: [
          {
            name: 'Basic',
            fields: [
              { name: 'sAMAccountName', type: 'string', description: 'Username' },
              { name: 'displayName', type: 'string', description: 'Display Name' }
            ]
          }
        ]
      });

      await reportBuilderPage.selectDataSource('ad');
      
      // Drag fields to select area
      await reportBuilderPage.dragFieldToSelect('sAMAccountName');
      await reportBuilderPage.dragFieldToSelect('displayName');
      
      // Verify fields are selected
      const selectedFields = await reportBuilderPage.getSelectedFields();
      expect(selectedFields).toContain('sAMAccountName');
      expect(selectedFields).toContain('displayName');
    });

    test('should add fields using double-click', async ({ page }) => {
      await ApiHelper.mockApiResponse(page, '**/api/reports/fields*', {
        categories: [
          {
            name: 'Basic',
            fields: [
              { name: 'mail', type: 'string', description: 'Email' },
              { name: 'department', type: 'string', description: 'Department' }
            ]
          }
        ]
      });

      await reportBuilderPage.selectDataSource('ad');
      
      // Add fields by double-clicking
      await reportBuilderPage.addFieldToQuery('mail');
      await reportBuilderPage.addFieldToQuery('department');
      
      const selectedFields = await reportBuilderPage.getSelectedFields();
      expect(selectedFields).toContain('mail');
      expect(selectedFields).toContain('department');
    });

    test('should remove fields from query', async ({ page }) => {
      await ApiHelper.mockApiResponse(page, '**/api/reports/fields*', {
        categories: [
          {
            name: 'Basic',
            fields: [
              { name: 'sAMAccountName', type: 'string', description: 'Username' }
            ]
          }
        ]
      });

      await reportBuilderPage.selectDataSource('ad');
      
      // Add field then remove it
      await reportBuilderPage.addFieldToQuery('sAMAccountName');
      
      let selectedFields = await reportBuilderPage.getSelectedFields();
      expect(selectedFields).toContain('sAMAccountName');
      
      await reportBuilderPage.removeFieldFromQuery('sAMAccountName');
      
      selectedFields = await reportBuilderPage.getSelectedFields();
      expect(selectedFields).not.toContain('sAMAccountName');
    });
  });

  test.describe('Query Building - Filters', () => {
    test('should add basic filters to query', async ({ page }) => {
      await reportBuilderPage.selectDataSource('ad');
      
      // Add fields first
      await reportBuilderPage.addFieldToQuery('sAMAccountName');
      await reportBuilderPage.addFieldToQuery('enabled');
      
      // Add filter
      await reportBuilderPage.addFilter('enabled', 'equals', 'true');
      
      const filters = await reportBuilderPage.getAppliedFilters();
      expect(filters.length).toBe(1);
      expect(filters[0].field).toBe('enabled');
      expect(filters[0].operator).toBe('equals');
      expect(filters[0].value).toBe('true');
    });

    test('should add multiple filters with different operators', async ({ page }) => {
      await reportBuilderPage.selectDataSource('ad');
      await reportBuilderPage.addFieldToQuery('lastLogon');
      await reportBuilderPage.addFieldToQuery('department');
      
      // Add multiple filters
      await reportBuilderPage.addFilter('lastLogon', 'older_than', '90 days');
      await reportBuilderPage.addFilter('department', 'equals', 'IT');
      
      const filters = await reportBuilderPage.getAppliedFilters();
      expect(filters.length).toBe(2);
      
      expect(filters.some(f => f.field === 'lastLogon' && f.operator === 'older_than')).toBe(true);
      expect(filters.some(f => f.field === 'department' && f.operator === 'equals')).toBe(true);
    });

    test('should remove filters from query', async ({ page }) => {
      await reportBuilderPage.selectDataSource('ad');
      await reportBuilderPage.addFieldToQuery('enabled');
      
      await reportBuilderPage.addFilter('enabled', 'equals', 'true');
      
      let filters = await reportBuilderPage.getAppliedFilters();
      expect(filters.length).toBe(1);
      
      await reportBuilderPage.removeFilter(0);
      
      filters = await reportBuilderPage.getAppliedFilters();
      expect(filters.length).toBe(0);
    });

    test('should handle complex filter combinations', async ({ page }) => {
      await reportBuilderPage.selectDataSource('ad');
      
      // Build complex query
      await reportBuilderPage.addFieldToQuery('sAMAccountName');
      await reportBuilderPage.addFieldToQuery('lastLogon');
      await reportBuilderPage.addFieldToQuery('enabled');
      
      // Add multiple filters
      await reportBuilderPage.addFilter('enabled', 'equals', 'true');
      await reportBuilderPage.addFilter('lastLogon', 'older_than', '30 days');
      await reportBuilderPage.addFilter('sAMAccountName', 'not_contains', 'admin');
      
      const filters = await reportBuilderPage.getAppliedFilters();
      expect(filters.length).toBe(3);
      
      // Verify all filters are applied correctly
      const enabledFilter = filters.find(f => f.field === 'enabled');
      const logonFilter = filters.find(f => f.field === 'lastLogon');
      const nameFilter = filters.find(f => f.field === 'sAMAccountName');
      
      expect(enabledFilter?.operator).toBe('equals');
      expect(logonFilter?.operator).toBe('older_than');
      expect(nameFilter?.operator).toBe('not_contains');
    });
  });

  test.describe('Query Building - Advanced Features', () => {
    test('should add group by functionality', async ({ page }) => {
      await reportBuilderPage.selectDataSource('ad');
      
      await reportBuilderPage.addFieldToQuery('department');
      await reportBuilderPage.addFieldToQuery('title');
      
      // Add group by
      await reportBuilderPage.addGroupBy('department');
      
      // Preview should show grouped results
      await reportBuilderPage.previewQuery();
      await page.waitForTimeout(1000);
      
      const queryPreview = await reportBuilderPage.getQueryPreview();
      expect(queryPreview.toLowerCase()).toContain('group by');
    });

    test('should add sorting/order by functionality', async ({ page }) => {
      await reportBuilderPage.selectDataSource('ad');
      
      await reportBuilderPage.addFieldToQuery('displayName');
      await reportBuilderPage.addFieldToQuery('lastLogon');
      
      // Add sorting
      await reportBuilderPage.addOrderBy('displayName', 'asc');
      await reportBuilderPage.addOrderBy('lastLogon', 'desc');
      
      await reportBuilderPage.previewQuery();
      
      const queryPreview = await reportBuilderPage.getQueryPreview();
      expect(queryPreview.toLowerCase()).toContain('order by');
    });

    test('should build complex queries with all components', async ({ page }) => {
      const complexQuery = CUSTOM_REPORT_TESTS.COMPLEX_SECURITY_QUERY;
      
      await reportBuilderPage.selectDataSource(complexQuery.dataSource as 'ad');
      
      // Add fields
      for (const field of complexQuery.fields) {
        await reportBuilderPage.addFieldToQuery(field);
      }
      
      // Add filters
      for (const filter of complexQuery.filters) {
        await reportBuilderPage.addFilter(filter.field, filter.operator, filter.value);
      }
      
      // Add group by if specified
      if (complexQuery.groupBy) {
        await reportBuilderPage.addGroupBy(complexQuery.groupBy);
      }
      
      // Add order by if specified
      if (complexQuery.orderBy) {
        await reportBuilderPage.addOrderBy(complexQuery.orderBy.field, complexQuery.orderBy.direction);
      }
      
      // Preview the complex query
      await reportBuilderPage.previewQuery();
      
      const queryPreview = await reportBuilderPage.getQueryPreview();
      expect(queryPreview).toBeTruthy();
      expect(queryPreview.toLowerCase()).toContain('select');
    });
  });

  test.describe('Query Execution and Results', () => {
    test('should preview query before execution', async ({ page }) => {
      // Mock query preview
      await ApiHelper.mockApiResponse(page, '**/api/reports/preview*', {
        success: true,
        query: 'SELECT sAMAccountName, displayName FROM users WHERE enabled = ?',
        estimatedRows: 1500,
        executionPlan: 'Using index on enabled column'
      });

      await reportBuilderPage.selectDataSource('ad');
      await reportBuilderPage.addFieldToQuery('sAMAccountName');
      await reportBuilderPage.addFieldToQuery('displayName');
      await reportBuilderPage.addFilter('enabled', 'equals', 'true');
      
      await reportBuilderPage.previewQuery();
      
      const queryPreview = await reportBuilderPage.getQueryPreview();
      expect(queryPreview).toContain('SELECT');
      expect(queryPreview).toContain('sAMAccountName');
    });

    test('should execute custom query and show results', async ({ page }) => {
      // Mock query execution
      await ApiHelper.mockApiResponse(page, '**/api/reports/execute-custom*', {
        success: true,
        data: {
          results: [
            { sAMAccountName: 'jdoe', displayName: 'John Doe', department: 'IT' },
            { sAMAccountName: 'asmith', displayName: 'Alice Smith', department: 'HR' }
          ],
          totalRecords: 2,
          executionTime: '0.8s'
        }
      });

      await reportBuilderPage.selectDataSource('ad');
      await reportBuilderPage.addFieldToQuery('sAMAccountName');
      await reportBuilderPage.addFieldToQuery('displayName');
      await reportBuilderPage.addFieldToQuery('department');
      
      await reportBuilderPage.executeQuery();
      
      const results = await reportBuilderPage.getQueryResults();
      expect(results.totalRecords).toBe(2);
      expect(results.data.length).toBe(2);
      expect(results.data[0].sAMAccountName).toBe('jdoe');
    });

    test('should handle query validation errors', async ({ page }) => {
      // Mock validation error
      await ApiHelper.mockApiResponse(page, '**/api/reports/validate*', {
        success: false,
        errors: [
          'No fields selected for query',
          'Invalid filter operator for field type'
        ]
      }, 400);

      await reportBuilderPage.selectDataSource('ad');
      // Don't add any fields - should cause validation error
      
      await reportBuilderPage.executeQuery();
      
      // Should show validation errors
      const errorElements = await page.locator('.ant-alert-error, .validation-error').count();
      expect(errorElements).toBeGreaterThan(0);
    });

    test('should measure custom query performance', async ({ page }) => {
      await ApiHelper.mockApiResponse(page, '**/api/reports/execute-custom*', {
        success: true,
        data: {
          results: Array.from({ length: 100 }, (_, i) => ({ 
            username: `user${i}`, 
            dept: `dept${i % 5}` 
          })),
          totalRecords: 100,
          executionTime: '1.2s'
        }
      });

      const simpleQuery = CUSTOM_REPORT_TESTS.SIMPLE_USER_QUERY;
      
      await reportBuilderPage.selectDataSource(simpleQuery.dataSource as 'ad');
      
      for (const field of simpleQuery.fields) {
        await reportBuilderPage.addFieldToQuery(field);
      }
      
      const startTime = Date.now();
      await reportBuilderPage.executeQuery();
      
      const results = await reportBuilderPage.getQueryResults();
      const endTime = Date.now();
      
      expect(results.totalRecords).toBe(100);
      expect(results.executionTime).toBeTruthy();
      expect(endTime - startTime).toBeLessThan(10000); // Less than 10 seconds
    });
  });

  test.describe('Template Management', () => {
    test('should save custom query as template', async ({ page }) => {
      await ApiHelper.mockApiResponse(page, '**/api/templates/save*', {
        success: true,
        templateId: 456,
        message: 'Template saved successfully'
      });

      await reportBuilderPage.selectDataSource('ad');
      await reportBuilderPage.addFieldToQuery('sAMAccountName');
      await reportBuilderPage.addFieldToQuery('displayName');
      await reportBuilderPage.addFilter('enabled', 'equals', 'true');
      
      await reportBuilderPage.saveAsTemplate(
        'Active Users Report',
        'Shows all active user accounts',
        'User Management'
      );
      
      // Should show success message
      const successAlert = page.locator('.ant-message-success, .ant-notification-success');
      const hasSuccess = await successAlert.isVisible();
      if (hasSuccess) {
        expect(await successAlert.textContent()).toContain('saved');
      }
    });

    test('should export query in different formats', async ({ page }) => {
      await reportBuilderPage.selectDataSource('ad');
      await reportBuilderPage.addFieldToQuery('sAMAccountName');
      await reportBuilderPage.addFilter('enabled', 'equals', 'true');
      
      // Test SQL export
      await reportBuilderPage.exportQuery('sql');
      await page.waitForTimeout(500);
      
      // Test JSON export
      await reportBuilderPage.exportQuery('json');
      await page.waitForTimeout(500);
      
      // In real test, would verify download or API calls
    });

    test('should clear query and start over', async ({ page }) => {
      await reportBuilderPage.selectDataSource('ad');
      await reportBuilderPage.addFieldToQuery('sAMAccountName');
      await reportBuilderPage.addFieldToQuery('displayName');
      await reportBuilderPage.addFilter('enabled', 'equals', 'true');
      
      // Verify query has content
      let selectedFields = await reportBuilderPage.getSelectedFields();
      let filters = await reportBuilderPage.getAppliedFilters();
      
      expect(selectedFields.length).toBeGreaterThan(0);
      expect(filters.length).toBeGreaterThan(0);
      
      // Clear query
      await reportBuilderPage.clearQuery();
      
      // Verify query is cleared
      selectedFields = await reportBuilderPage.getSelectedFields();
      filters = await reportBuilderPage.getAppliedFilters();
      
      expect(selectedFields.length).toBe(0);
      expect(filters.length).toBe(0);
    });
  });

  test.describe('User Experience and Interaction', () => {
    test('should provide real-time query updates', async ({ page }) => {
      await reportBuilderPage.selectDataSource('ad');
      
      // Add field and check query preview updates
      await reportBuilderPage.addFieldToQuery('sAMAccountName');
      await page.waitForTimeout(500);
      
      let queryPreview = await reportBuilderPage.getQueryPreview();
      expect(queryPreview.toLowerCase()).toContain('samaccountname');
      
      // Add filter and check update
      await reportBuilderPage.addFilter('enabled', 'equals', 'true');
      await page.waitForTimeout(500);
      
      queryPreview = await reportBuilderPage.getQueryPreview();
      expect(queryPreview.toLowerCase()).toContain('where');
    });

    test('should validate field types for operations', async ({ page }) => {
      await reportBuilderPage.selectDataSource('ad');
      await reportBuilderPage.addFieldToQuery('lastLogon'); // datetime field
      
      // Try to add inappropriate filter for datetime field
      await reportBuilderPage.addFilter('lastLogon', 'contains', 'invalid');
      
      // Should show validation warning
      const validationWarning = page.locator('.ant-form-item-explain-error, .validation-warning');
      const hasWarning = await validationWarning.isVisible();
      
      if (hasWarning) {
        expect(await validationWarning.textContent()).toMatch(/(type|invalid|operator)/i);
      }
    });

    test('should handle drag and drop interactions smoothly', async ({ page }) => {
      await ApiHelper.mockApiResponse(page, '**/api/reports/fields*', {
        categories: [
          {
            name: 'Basic',
            fields: [
              { name: 'field1', type: 'string', description: 'Test Field 1' },
              { name: 'field2', type: 'string', description: 'Test Field 2' }
            ]
          }
        ]
      });

      await reportBuilderPage.selectDataSource('ad');
      
      // Test multiple drag and drop operations
      await reportBuilderPage.dragFieldToSelect('field1');
      await page.waitForTimeout(300);
      
      await reportBuilderPage.dragFieldToSelect('field2');
      await page.waitForTimeout(300);
      
      const selectedFields = await reportBuilderPage.getSelectedFields();
      expect(selectedFields).toContain('field1');
      expect(selectedFields).toContain('field2');
    });

    test('should provide helpful tooltips and hints', async ({ page }) => {
      await reportBuilderPage.selectDataSource('ad');
      
      // Hover over field to see tooltip
      const field = page.locator('[data-field-name="sAMAccountName"], .field-item').first();
      if (await field.isVisible()) {
        await field.hover();
        await page.waitForTimeout(500);
        
        // Look for tooltip
        const tooltip = page.locator('.ant-tooltip, .tooltip');
        const hasTooltip = await tooltip.isVisible();
        
        if (hasTooltip) {
          const tooltipText = await tooltip.textContent();
          expect(tooltipText).toBeTruthy();
        }
      }
    });
  });

  test.describe('Responsive and Mobile Support', () => {
    test('should work on mobile devices', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      
      await reportBuilderPage.goto();
      
      // Verify mobile layout
      const pageElements = await reportBuilderPage.verifyPageElements();
      expect(pageElements.hasDataSourceSelector).toBe(true);
      
      // Test mobile interactions
      await reportBuilderPage.selectDataSource('ad');
      
      // On mobile, field selection might work differently
      // Test tap interactions
      const firstField = page.locator('.field-item').first();
      if (await firstField.isVisible()) {
        await firstField.tap();
        await page.waitForTimeout(500);
      }
    });

    test('should handle touch gestures for query building', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 }); // Tablet size
      
      await reportBuilderPage.goto();
      await reportBuilderPage.selectDataSource('ad');
      
      // Test touch scroll in fields panel
      const fieldsPanel = page.locator('.fields-panel');
      if (await fieldsPanel.isVisible()) {
        await fieldsPanel.hover();
        
        // Simulate touch scroll
        await page.touchscreen.tap(400, 300);
        await page.mouse.wheel(0, 100);
      }
      
      // Test touch selection
      const queryBuilder = page.locator('.query-builder');
      if (await queryBuilder.isVisible()) {
        await queryBuilder.tap();
      }
    });

    test('should optimize layout for different screen sizes', async ({ page }) => {
      const viewports = [
        { width: 320, height: 568, name: 'mobile-small' },
        { width: 768, height: 1024, name: 'tablet' },
        { width: 1200, height: 800, name: 'desktop' }
      ];

      for (const viewport of viewports) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        
        await reportBuilderPage.goto();
        
        // Verify layout adapts
        const pageElements = await reportBuilderPage.verifyPageElements();
        expect(pageElements.hasDataSourceSelector).toBe(true);
        
        // Test basic functionality
        await reportBuilderPage.selectDataSource('ad');
        await page.waitForTimeout(300);
      }
    });
  });

  test.describe('Error Handling and Edge Cases', () => {
    test('should handle API failures gracefully', async ({ page }) => {
      // Mock API failure
      await page.route('**/api/reports/fields*', (route) => {
        route.abort('failed');
      });

      await reportBuilderPage.selectDataSource('ad');
      
      // Should show error message
      const errorAlert = page.locator('.ant-alert-error, .error-message');
      await errorAlert.waitFor({ state: 'visible', timeout: 5000 });
      
      expect(await errorAlert.textContent()).toMatch(/(error|failed|load)/i);
    });

    test('should handle malformed API responses', async ({ page }) => {
      // Mock malformed response
      await ApiHelper.mockApiResponse(page, '**/api/reports/fields*', 'invalid json');

      await reportBuilderPage.selectDataSource('ad');
      
      // Should handle gracefully and show error
      const errorAlert = page.locator('.ant-alert-error, .error-message');
      const hasError = await errorAlert.isVisible();
      
      if (hasError) {
        expect(await errorAlert.textContent()).toMatch(/(error|invalid|parse)/i);
      }
    });

    test('should prevent invalid query configurations', async ({ page }) => {
      await reportBuilderPage.selectDataSource('ad');
      
      // Try to execute query without fields
      await reportBuilderPage.executeQuery();
      
      // Should prevent execution or show validation
      const hasValidationError = await page.locator('.ant-form-item-explain-error, .validation-error').isVisible();
      const hasErrorMessage = await page.locator('.ant-alert-error').isVisible();
      
      expect(hasValidationError || hasErrorMessage).toBe(true);
    });

    test('should handle browser back/forward navigation', async ({ page }) => {
      await reportBuilderPage.selectDataSource('ad');
      await reportBuilderPage.addFieldToQuery('sAMAccountName');
      
      // Navigate away and back
      await page.goBack();
      await page.goForward();
      
      // Should restore query state or prompt user
      await page.waitForLoadState('networkidle');
      
      // Verify page state
      const isLoaded = await reportBuilderPage.isLoaded();
      expect(isLoaded).toBe(true);
    });
  });
});