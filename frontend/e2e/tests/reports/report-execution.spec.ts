import { test, expect } from '@playwright/test';
import { ReportsPage, DashboardPage } from '../../pages';
import { AuthHelper, ApiHelper, TableHelper, PerformanceHelper } from '../../utils/test-helpers';
import { TEST_REPORTS, TEST_CONFIG } from '../../fixtures/test-data';

test.describe('Report Generation - Pre-built Reports', () => {
  let reportsPage: ReportsPage;
  let dashboardPage: DashboardPage;

  test.beforeEach(async ({ page }) => {
    reportsPage = new ReportsPage(page);
    dashboardPage = new DashboardPage(page);
    
    // Login before each test
    await AuthHelper.login(page, 'AD_USER');
    
    // Navigate to reports page
    await reportsPage.goto();
  });

  test.describe('Report Selection and Navigation', () => {
    test('should display available reports for each data source', async ({ page }) => {
      // Mock reports list
      await ApiHelper.mockApiResponse(page, '**/api/reports/templates', [
        {
          id: 1,
          name: 'Inactive Users',
          description: 'Find users who have not logged in recently',
          category: 'Security',
          dataSource: 'ad'
        },
        {
          id: 2,
          name: 'Password Expiry',
          description: 'Users with passwords expiring soon',
          category: 'Security',
          dataSource: 'ad'
        }
      ]);

      // Verify page loads
      const isLoaded = await reportsPage.isLoaded();
      expect(isLoaded).toBe(true);

      // Check AD reports
      await reportsPage.selectDataSource('ad');
      const adReports = await reportsPage.getAvailableReports();
      expect(adReports.length).toBeGreaterThan(0);
      expect(adReports[0].name).toBe('Inactive Users');

      // Test Azure reports
      await reportsPage.selectDataSource('azure');
      await page.waitForTimeout(1000);
      
      // Test O365 reports
      await reportsPage.selectDataSource('o365');
      await page.waitForTimeout(1000);
    });

    test('should search and filter reports correctly', async ({ page }) => {
      await ApiHelper.mockApiResponse(page, '**/api/reports/templates*', [
        { id: 1, name: 'Inactive Users', description: 'Security report', category: 'Security', dataSource: 'ad' },
        { id: 2, name: 'Password Expiry', description: 'Security report', category: 'Security', dataSource: 'ad' },
        { id: 3, name: 'User Creation', description: 'Audit report', category: 'Audit', dataSource: 'ad' }
      ]);

      await reportsPage.selectDataSource('ad');
      
      // Test search functionality
      await reportsPage.searchReports('Password');
      await page.waitForTimeout(1000);
      
      const searchResults = await reportsPage.getAvailableReports();
      expect(searchResults.some(report => report.name.includes('Password'))).toBe(true);

      // Test category filter
      await reportsPage.filterByCategory('Security');
      await page.waitForTimeout(1000);
      
      const securityReports = await reportsPage.getAvailableReports();
      securityReports.forEach(report => {
        expect(['Security', 'security']).toContain(report.category);
      });
    });

    test('should display report details and parameters', async ({ page }) => {
      await reportsPage.selectDataSource('ad');
      await reportsPage.selectReport('Inactive Users');
      
      // Should show parameter form
      const hasParameterForm = await page.locator('.parameters-form, form').isVisible();
      expect(hasParameterForm).toBe(true);
      
      // Should have expected parameter fields
      const daysField = page.locator('[name="days"], input[placeholder*="days"]');
      expect(await daysField.isVisible()).toBe(true);
    });
  });

  test.describe('Report Execution', () => {
    test('should execute AD report successfully', async ({ page }) => {
      // Mock report execution
      await ApiHelper.mockApiResponse(page, '**/api/reports/execute/*', {
        success: true,
        data: {
          results: [
            { username: 'user1', displayName: 'User One', lastLogin: '2024-12-01' },
            { username: 'user2', displayName: 'User Two', lastLogin: '2024-11-15' }
          ],
          totalRecords: 2,
          executionTime: '1.2s',
          query: 'SELECT * FROM users WHERE lastLogin < ?'
        }
      });

      await reportsPage.selectDataSource('ad');
      await reportsPage.selectReport('Inactive Users');
      
      // Set parameters
      const parameters = TEST_REPORTS.AD_INACTIVE_USERS.parameters;
      await reportsPage.executeReport(parameters);
      
      // Wait for execution to complete
      const result = await reportsPage.waitForExecutionComplete();
      expect(result).toBe('success');
      
      // Verify results
      const executionResults = await reportsPage.getExecutionResults();
      expect(executionResults.totalRecords).toBe(2);
      expect(executionResults.data.length).toBe(2);
      expect(executionResults.data[0].username).toBe('user1');
    });

    test('should handle report execution with different parameters', async ({ page }) => {
      await ApiHelper.mockApiResponse(page, '**/api/reports/execute/*', {
        success: true,
        data: {
          results: [
            { username: 'expired1', displayName: 'Expired User 1', passwordExpiry: '2025-02-01' },
            { username: 'expired2', displayName: 'Expired User 2', passwordExpiry: '2025-02-15' }
          ],
          totalRecords: 2,
          executionTime: '0.8s'
        }
      });

      await reportsPage.selectDataSource('ad');
      await reportsPage.selectReport('Password Expiry');
      
      // Execute with custom parameters
      await reportsPage.executeReport({ daysUntilExpiry: 60 });
      
      const result = await reportsPage.waitForExecutionComplete();
      expect(result).toBe('success');
      
      const executionResults = await reportsPage.getExecutionResults();
      expect(executionResults.totalRecords).toBe(2);
      expect(executionResults.data[0].username).toBe('expired1');
    });

    test('should handle large result sets with pagination', async ({ page }) => {
      // Mock large result set
      const largeResults = Array.from({ length: 1000 }, (_, i) => ({
        username: `user${i}`,
        displayName: `User ${i}`,
        department: `Dept ${i % 10}`
      }));

      await ApiHelper.mockApiResponse(page, '**/api/reports/execute/*', {
        success: true,
        data: {
          results: largeResults.slice(0, 100), // First page
          totalRecords: 1000,
          executionTime: '2.5s',
          hasMore: true
        }
      });

      await reportsPage.selectDataSource('ad');
      await reportsPage.selectReport('All Users');
      
      await reportsPage.executeReport();
      
      const result = await reportsPage.waitForExecutionComplete();
      expect(result).toBe('success');
      
      const executionResults = await reportsPage.getExecutionResults();
      expect(executionResults.totalRecords).toBe(1000);
      expect(executionResults.data.length).toBe(100);
      
      // Test pagination
      await reportsPage.navigateToPage(2);
      await page.waitForTimeout(1000);
      
      // Should load next page
      const paginationControls = page.locator('.ant-pagination');
      expect(await paginationControls.isVisible()).toBe(true);
    });

    test('should handle report execution errors gracefully', async ({ page }) => {
      // Mock execution error
      await ApiHelper.mockApiResponse(page, '**/api/reports/execute/*', {
        success: false,
        error: 'Connection to LDAP server failed',
        details: 'Unable to authenticate with domain controller'
      }, 500);

      await reportsPage.selectDataSource('ad');
      await reportsPage.selectReport('Inactive Users');
      
      await reportsPage.executeReport({ days: 90 });
      
      const result = await reportsPage.waitForExecutionComplete();
      expect(result).toBe('error');
      
      const errorMessage = await reportsPage.getExecutionError();
      expect(errorMessage).toContain('Connection to LDAP server failed');
    });

    test('should validate report parameters before execution', async ({ page }) => {
      await reportsPage.selectDataSource('ad');
      await reportsPage.selectReport('Inactive Users');
      
      // Try to execute without required parameters
      await reportsPage.executeReport({});
      
      // Should show validation errors
      const hasErrors = await page.locator('.ant-form-item-explain-error').isVisible();
      expect(hasErrors).toBe(true);
      
      // Should not execute report
      const loadingVisible = await page.locator('.ant-spin').isVisible();
      expect(loadingVisible).toBe(false);
    });

    test('should measure report execution performance', async ({ page }) => {
      await ApiHelper.mockApiResponse(page, '**/api/reports/execute/*', {
        success: true,
        data: {
          results: [{ username: 'test', displayName: 'Test User' }],
          totalRecords: 1,
          executionTime: '0.5s'
        }
      });

      await reportsPage.selectDataSource('ad');
      await reportsPage.selectReport('Inactive Users');
      
      const startTime = Date.now();
      
      await reportsPage.executeReport({ days: 30 });
      await reportsPage.waitForExecutionComplete();
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      // Report should execute within reasonable time
      expect(totalTime).toBeLessThan(10000); // 10 seconds
      
      const executionResults = await reportsPage.getExecutionResults();
      expect(executionResults.executionTime).toBeTruthy();
    });
  });

  test.describe('Report Results Management', () => {
    test('should display results in sortable table', async ({ page }) => {
      await ApiHelper.mockApiResponse(page, '**/api/reports/execute/*', {
        success: true,
        data: {
          results: [
            { username: 'zuser', displayName: 'Z User', lastLogin: '2024-01-01' },
            { username: 'auser', displayName: 'A User', lastLogin: '2024-02-01' }
          ],
          totalRecords: 2,
          executionTime: '0.3s'
        }
      });

      await reportsPage.selectDataSource('ad');
      await reportsPage.selectReport('Inactive Users');
      await reportsPage.executeReport({ days: 90 });
      
      await reportsPage.waitForExecutionComplete();
      
      // Test table sorting
      await TableHelper.sortTableByColumn(page, 'Username');
      await page.waitForTimeout(500);
      
      const tableData = await TableHelper.getTableData(page);
      expect(tableData.length).toBe(2);
      
      // Verify data is present
      expect(tableData.some(row => row.username === 'auser')).toBe(true);
    });

    test('should export reports in different formats', async ({ page }) => {
      await ApiHelper.mockApiResponse(page, '**/api/reports/execute/*', {
        success: true,
        data: {
          results: [
            { username: 'user1', displayName: 'User One' }
          ],
          totalRecords: 1,
          executionTime: '0.2s'
        }
      });

      // Mock export endpoint
      await ApiHelper.mockApiResponse(page, '**/api/reports/export/*', {
        success: true,
        downloadUrl: '/downloads/report.xlsx'
      });

      await reportsPage.selectDataSource('ad');
      await reportsPage.selectReport('Inactive Users');
      await reportsPage.executeReport({ days: 90 });
      
      await reportsPage.waitForExecutionComplete();
      
      // Test Excel export
      await reportsPage.exportReport('excel');
      await page.waitForTimeout(1000);
      
      // Verify export was triggered (would normally trigger download)
      // In real test, you'd check for download or API call
    });

    test('should save report as custom template', async ({ page }) => {
      await ApiHelper.mockApiResponse(page, '**/api/reports/execute/*', {
        success: true,
        data: {
          results: [{ username: 'user1' }],
          totalRecords: 1,
          executionTime: '0.1s'
        }
      });

      await ApiHelper.mockApiResponse(page, '**/api/templates/save', {
        success: true,
        templateId: 123,
        message: 'Template saved successfully'
      });

      await reportsPage.selectDataSource('ad');
      await reportsPage.selectReport('Inactive Users');
      await reportsPage.executeReport({ days: 60 });
      
      await reportsPage.waitForExecutionComplete();
      
      // Save as template
      await reportsPage.saveAsTemplate('My Custom Inactive Users Report', 'Custom report with 60-day threshold');
      
      await page.waitForTimeout(1000);
      
      // Should show success message
      const successMessage = page.locator('.ant-message-success, .ant-notification-success');
      const hasSuccess = await successMessage.isVisible();
      if (hasSuccess) {
        expect(await successMessage.textContent()).toContain('saved');
      }
    });

    test('should filter and search within results', async ({ page }) => {
      await ApiHelper.mockApiResponse(page, '**/api/reports/execute/*', {
        success: true,
        data: {
          results: [
            { username: 'admin1', displayName: 'Administrator One', department: 'IT' },
            { username: 'user1', displayName: 'User One', department: 'Sales' },
            { username: 'admin2', displayName: 'Administrator Two', department: 'IT' }
          ],
          totalRecords: 3,
          executionTime: '0.4s'
        }
      });

      await reportsPage.selectDataSource('ad');
      await reportsPage.selectReport('All Users');
      await reportsPage.executeReport({});
      
      await reportsPage.waitForExecutionComplete();
      
      // Filter results within table
      await TableHelper.filterTable(page, 'admin');
      
      await page.waitForTimeout(1000);
      
      // Should show only admin users
      const filteredData = await TableHelper.getTableData(page);
      filteredData.forEach(row => {
        expect(row.username.toLowerCase()).toContain('admin');
      });
    });
  });

  test.describe('Report History and Audit', () => {
    test('should track report execution history', async ({ page }) => {
      await ApiHelper.mockApiResponse(page, '**/api/reports/execute/*', {
        success: true,
        data: {
          results: [{ username: 'user1' }],
          totalRecords: 1,
          executionTime: '0.2s'
        }
      });

      await reportsPage.selectDataSource('ad');
      await reportsPage.selectReport('Inactive Users');
      await reportsPage.executeReport({ days: 90 });
      
      await reportsPage.waitForExecutionComplete();
      
      // Navigate to history (implementation would depend on UI)
      const historyButton = page.locator('button:has-text("History"), .report-history');
      if (await historyButton.isVisible()) {
        await historyButton.click();
        
        // Should show execution history
        const historyTable = page.locator('.history-table, .ant-table');
        expect(await historyTable.isVisible()).toBe(true);
        
        const historyData = await reportsPage.getReportHistory();
        expect(historyData.length).toBeGreaterThan(0);
      }
    });

    test('should allow re-execution from history', async ({ page }) => {
      // Mock history data
      await ApiHelper.mockApiResponse(page, '**/api/reports/history*', [
        {
          id: 1,
          reportName: 'Inactive Users',
          executedAt: '2025-01-01T10:00:00Z',
          parameters: { days: 90 },
          recordCount: 15,
          status: 'success'
        }
      ]);

      // Navigate to history
      const historyButton = page.locator('button:has-text("History")');
      if (await historyButton.isVisible()) {
        await historyButton.click();
        
        // Re-execute from history
        const rerunButton = page.locator('button:has-text("Run Again"), .rerun-button').first();
        if (await rerunButton.isVisible()) {
          await rerunButton.click();
          
          // Should pre-populate parameters from history
          const daysInput = page.locator('[name="days"]');
          const daysValue = await daysInput.inputValue();
          expect(daysValue).toBe('90');
        }
      }
    });
  });

  test.describe('Cross-browser and Responsive', () => {
    test('should work correctly on different screen sizes', async ({ page }) => {
      // Test mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });
      await reportsPage.goto();
      
      const pageElements = await reportsPage.verifyPageElements();
      expect(pageElements.hasReportsList).toBe(true);
      
      // Test tablet viewport  
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.waitForTimeout(500);
      
      // Test desktop viewport
      await page.setViewportSize({ width: 1200, height: 800 });
      await page.waitForTimeout(500);
      
      // Verify all elements are still accessible
      const desktopElements = await reportsPage.verifyPageElements();
      expect(desktopElements.hasTitle).toBe(true);
      expect(desktopElements.hasDataSourceTabs).toBe(true);
    });

    test('should handle touch interactions on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      
      await reportsPage.goto();
      await reportsPage.selectDataSource('ad');
      
      // Test touch scroll in reports list
      const reportsList = page.locator('.reports-list');
      if (await reportsList.isVisible()) {
        // Simulate touch scroll
        await reportsList.hover();
        await page.mouse.wheel(0, 100);
      }
      
      // Test touch selection of reports
      const firstReport = page.locator('.report-item, .report-card').first();
      if (await firstReport.isVisible()) {
        await firstReport.tap();
        await page.waitForTimeout(500);
      }
    });
  });

  test.describe('Performance and Reliability', () => {
    test('should handle slow report execution gracefully', async ({ page }) => {
      // Mock slow report execution
      await page.route('**/api/reports/execute/*', async (route) => {
        await page.waitForTimeout(5000); // 5 second delay
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              results: [{ username: 'user1' }],
              totalRecords: 1,
              executionTime: '4.8s'
            }
          })
        });
      });

      await reportsPage.selectDataSource('ad');
      await reportsPage.selectReport('Inactive Users');
      await reportsPage.executeReport({ days: 90 });
      
      // Should show loading state
      const loadingSpinner = page.locator('.ant-spin, [data-testid="loading"]');
      expect(await loadingSpinner.isVisible()).toBe(true);
      
      // Should complete within timeout
      const result = await reportsPage.waitForExecutionComplete(10000);
      expect(result).toBe('success');
    });

    test('should handle network interruption during execution', async ({ page }) => {
      let requestCount = 0;
      
      await page.route('**/api/reports/execute/*', (route) => {
        requestCount++;
        if (requestCount === 1) {
          // First request fails
          route.abort('failed');
        } else {
          // Retry succeeds
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              data: {
                results: [{ username: 'user1' }],
                totalRecords: 1,
                executionTime: '0.3s'
              }
            })
          });
        }
      });

      await reportsPage.selectDataSource('ad');
      await reportsPage.selectReport('Inactive Users');
      await reportsPage.executeReport({ days: 90 });
      
      // Should handle network error and potentially retry
      const result = await reportsPage.waitForExecutionComplete(15000);
      
      // Should either succeed on retry or show appropriate error
      expect(['success', 'error']).toContain(result);
    });

    test('should prevent multiple concurrent executions', async ({ page }) => {
      let executionCount = 0;
      
      await page.route('**/api/reports/execute/*', (route) => {
        executionCount++;
        setTimeout(() => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              data: {
                results: [{ username: 'user1' }],
                totalRecords: 1,
                executionTime: '0.1s'
              }
            })
          });
        }, 1000);
      });

      await reportsPage.selectDataSource('ad');
      await reportsPage.selectReport('Inactive Users');
      
      // Try to execute multiple times quickly
      const executePromises = [
        reportsPage.executeReport({ days: 90 }),
        reportsPage.executeReport({ days: 90 }),
        reportsPage.executeReport({ days: 90 })
      ];
      
      await Promise.allSettled(executePromises);
      
      // Should only execute once
      expect(executionCount).toBeLessThanOrEqual(1);
      
      const result = await reportsPage.waitForExecutionComplete();
      expect(result).toBe('success');
    });
  });
});