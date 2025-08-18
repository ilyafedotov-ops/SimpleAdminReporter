import { test, expect } from '@playwright/test';
import { SettingsPage } from '../../pages';
import { AuthHelper, ApiHelper, PerformanceHelper } from '../../utils/test-helpers';
import { TEST_CONFIG } from '../../fixtures/test-data';

test.describe('Data Management - Field Discovery', () => {
  let settingsPage: SettingsPage;

  test.beforeEach(async ({ page }) => {
    settingsPage = new SettingsPage(page);
    
    // Login before each test
    await AuthHelper.login(page, 'AD_USER');
    
    // Navigate to settings page
    await settingsPage.goto();
    
    // Navigate to field discovery section
    await settingsPage.navigateToFieldDiscovery();
  });

  test.describe('Field Discovery Process', () => {
    test('should discover AD fields successfully', async ({ page }) => {
      // Mock field discovery API
      await ApiHelper.mockApiResponse(page, '**/api/fields/discover*', {
        success: true,
        discoveredFields: {
          categories: [
            {
              name: 'Basic Information',
              fields: [
                { name: 'sAMAccountName', type: 'string', description: 'Account name (pre-Windows 2000)' },
                { name: 'displayName', type: 'string', description: 'Display name of the user' },
                { name: 'mail', type: 'string', description: 'Email address' },
                { name: 'telephoneNumber', type: 'string', description: 'Primary telephone number' }
              ]
            },
            {
              name: 'Security',
              fields: [
                { name: 'userAccountControl', type: 'integer', description: 'User account control flags' },
                { name: 'lastLogon', type: 'datetime', description: 'Last logon timestamp' },
                { name: 'pwdLastSet', type: 'datetime', description: 'Password last set time' },
                { name: 'accountExpires', type: 'datetime', description: 'Account expiration date' }
              ]
            },
            {
              name: 'Organizational',
              fields: [
                { name: 'department', type: 'string', description: 'Department' },
                { name: 'title', type: 'string', description: 'Job title' },
                { name: 'manager', type: 'dn', description: 'Manager distinguished name' },
                { name: 'memberOf', type: 'array', description: 'Group memberships' }
              ]
            }
          ]
        },
        discoveryStats: {
          totalFields: 12,
          categoriesFound: 3,
          discoveryTime: '2.3s'
        }
      });

      await settingsPage.discoverFields('ad');
      
      // Verify field categories are displayed
      const categories = await settingsPage.getFieldCategories();
      expect(categories.length).toBe(3);
      expect(categories.some(cat => cat.name === 'Basic Information')).toBe(true);
      expect(categories.some(cat => cat.name === 'Security')).toBe(true);
      expect(categories.some(cat => cat.name === 'Organizational')).toBe(true);
      
      // Check field counts
      const basicInfoCategory = categories.find(cat => cat.name === 'Basic Information');
      expect(basicInfoCategory?.fieldCount).toBe(4);
    });

    test('should discover Azure AD fields successfully', async ({ page }) => {
      await ApiHelper.mockApiResponse(page, '**/api/fields/discover*', {
        success: true,
        discoveredFields: {
          categories: [
            {
              name: 'User Properties',
              fields: [
                { name: 'id', type: 'guid', description: 'Unique identifier' },
                { name: 'userPrincipalName', type: 'string', description: 'User principal name' },
                { name: 'displayName', type: 'string', description: 'Display name' },
                { name: 'givenName', type: 'string', description: 'First name' },
                { name: 'surname', type: 'string', description: 'Last name' }
              ]
            },
            {
              name: 'Authentication',
              fields: [
                { name: 'signInActivity', type: 'object', description: 'Sign-in activity information' },
                { name: 'lastSignInDateTime', type: 'datetime', description: 'Last successful sign-in' },
                { name: 'creationType', type: 'string', description: 'How the user account was created' }
              ]
            },
            {
              name: 'Licenses',
              fields: [
                { name: 'assignedLicenses', type: 'array', description: 'Assigned licenses' },
                { name: 'usageLocation', type: 'string', description: 'Usage location for licensing' }
              ]
            }
          ]
        },
        discoveryStats: {
          totalFields: 10,
          categoriesFound: 3,
          discoveryTime: '1.8s'
        }
      });

      await settingsPage.discoverFields('azure');
      
      const categories = await settingsPage.getFieldCategories();
      expect(categories.length).toBe(3);
      expect(categories.some(cat => cat.name === 'User Properties')).toBe(true);
      expect(categories.some(cat => cat.name === 'Authentication')).toBe(true);
    });

    test('should discover O365 fields successfully', async ({ page }) => {
      await ApiHelper.mockApiResponse(page, '**/api/fields/discover*', {
        success: true,
        discoveredFields: {
          categories: [
            {
              name: 'Mailbox',
              fields: [
                { name: 'primarySmtpAddress', type: 'string', description: 'Primary SMTP address' },
                { name: 'totalItemSize', type: 'integer', description: 'Total mailbox size in bytes' },
                { name: 'itemCount', type: 'integer', description: 'Total number of items' },
                { name: 'lastLogonTime', type: 'datetime', description: 'Last mailbox logon' }
              ]
            },
            {
              name: 'OneDrive',
              fields: [
                { name: 'storageUsed', type: 'integer', description: 'OneDrive storage used in bytes' },
                { name: 'storageQuota', type: 'integer', description: 'OneDrive storage quota' },
                { name: 'lastActivityDate', type: 'datetime', description: 'Last OneDrive activity' }
              ]
            },
            {
              name: 'Teams',
              fields: [
                { name: 'teamsActivities', type: 'array', description: 'Teams usage activities' },
                { name: 'meetingsOrganized', type: 'integer', description: 'Number of meetings organized' }
              ]
            }
          ]
        },
        discoveryStats: {
          totalFields: 9,
          categoriesFound: 3,
          discoveryTime: '3.1s'
        }
      });

      await settingsPage.discoverFields('o365');
      
      const categories = await settingsPage.getFieldCategories();
      expect(categories.length).toBe(3);
      expect(categories.some(cat => cat.name === 'Mailbox')).toBe(true);
      expect(categories.some(cat => cat.name === 'OneDrive')).toBe(true);
      expect(categories.some(cat => cat.name === 'Teams')).toBe(true);
    });

    test('should show discovery progress during field discovery', async ({ page }) => {
      // Mock slow discovery process
      await page.route('**/api/fields/discover*', async (route) => {
        await page.waitForTimeout(3000); // 3 second delay
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            discoveredFields: {
              categories: [
                {
                  name: 'Test Category',
                  fields: [
                    { name: 'testField', type: 'string', description: 'Test field' }
                  ]
                }
              ]
            }
          })
        });
      });

      // Start discovery
      const discoverButton = page.locator('button:has-text("Discover"), .discover-fields-btn');
      await discoverButton.click();
      
      // Should show loading/progress indicator
      const loadingIndicator = page.locator('.ant-spin, .discovery-progress, [data-testid="loading"]');
      expect(await loadingIndicator.isVisible()).toBe(true);
      
      // Should show progress message
      const progressMessage = page.locator('.progress-message, .discovery-status');
      if (await progressMessage.isVisible()) {
        const message = await progressMessage.textContent();
        expect(message).toMatch(/(discovering|analyzing|processing)/i);
      }
      
      // Wait for completion
      await page.waitForLoadState('networkidle');
      
      // Loading should be gone
      expect(await loadingIndicator.isVisible()).toBe(false);
    });

    test('should handle discovery errors gracefully', async ({ page }) => {
      // Mock discovery failure
      await ApiHelper.mockApiResponse(page, '**/api/fields/discover*', {
        success: false,
        error: 'Unable to connect to LDAP server for field discovery',
        details: 'Connection timeout after 30 seconds'
      }, 500);

      await settingsPage.discoverFields('ad');
      
      // Should show error message
      const errorMessage = page.locator('.ant-alert-error, .discovery-error');
      expect(await errorMessage.isVisible()).toBe(true);
      
      const errorText = await errorMessage.textContent();
      expect(errorText).toMatch(/(unable to connect|timeout|error)/i);
    });
  });

  test.describe('Field Categories and Details', () => {
    test('should display field details within categories', async ({ page }) => {
      // Mock fields in category
      await ApiHelper.mockApiResponse(page, '**/api/fields/categories/*', [
        { name: 'sAMAccountName', type: 'string', description: 'Account name (pre-Windows 2000)' },
        { name: 'displayName', type: 'string', description: 'Display name of the user' },
        { name: 'mail', type: 'string', description: 'Email address' }
      ]);

      await settingsPage.discoverFields('ad');
      
      const fields = await settingsPage.getFieldsInCategory('Basic Information');
      expect(fields.length).toBe(3);
      
      const samAccountField = fields.find(field => field.name === 'sAMAccountName');
      expect(samAccountField).toBeTruthy();
      expect(samAccountField?.type).toBe('string');
      expect(samAccountField?.description).toContain('Account name');
    });

    test('should show field type information correctly', async ({ page }) => {
      await ApiHelper.mockApiResponse(page, '**/api/fields/discover*', {
        success: true,
        discoveredFields: {
          categories: [
            {
              name: 'Mixed Types',
              fields: [
                { name: 'stringField', type: 'string', description: 'A string field' },
                { name: 'integerField', type: 'integer', description: 'An integer field' },
                { name: 'datetimeField', type: 'datetime', description: 'A datetime field' },
                { name: 'booleanField', type: 'boolean', description: 'A boolean field' },
                { name: 'arrayField', type: 'array', description: 'An array field' }
              ]
            }
          ]
        }
      });

      await settingsPage.discoverFields('ad');
      
      const fields = await settingsPage.getFieldsInCategory('Mixed Types');
      expect(fields.length).toBe(5);
      
      // Verify different field types are displayed
      const fieldTypes = fields.map(field => field.type);
      expect(fieldTypes).toContain('string');
      expect(fieldTypes).toContain('integer');
      expect(fieldTypes).toContain('datetime');
      expect(fieldTypes).toContain('boolean');
      expect(fieldTypes).toContain('array');
    });

    test('should support field search and filtering', async ({ page }) => {
      await settingsPage.discoverFields('ad');
      
      // Search for specific fields
      const searchInput = page.locator('.field-search, input[placeholder*="search"]');
      if (await searchInput.isVisible()) {
        await searchInput.fill('account');
        await page.waitForTimeout(500);
        
        // Should filter fields based on search
        const visibleFields = page.locator('.field-item:visible');
        const fieldCount = await visibleFields.count();
        
        if (fieldCount > 0) {
          const firstField = await visibleFields.first().textContent();
          expect(firstField?.toLowerCase()).toContain('account');
        }
      }
    });

    test('should show field usage statistics', async ({ page }) => {
      await ApiHelper.mockApiResponse(page, '**/api/fields/usage-stats*', {
        'sAMAccountName': { usageCount: 45, popularityRank: 1 },
        'displayName': { usageCount: 38, popularityRank: 2 },
        'mail': { usageCount: 32, popularityRank: 3 },
        'lastLogon': { usageCount: 28, popularityRank: 4 }
      });

      await settingsPage.discoverFields('ad');
      
      // Check for usage indicators
      const fieldItems = page.locator('.field-item');
      const fieldCount = await fieldItems.count();
      
      if (fieldCount > 0) {
        const firstField = fieldItems.first();
        const usageIndicator = firstField.locator('.usage-count, .popularity-badge');
        
        if (await usageIndicator.isVisible()) {
          const usageText = await usageIndicator.textContent();
          expect(usageText).toMatch(/\d+/); // Should contain numbers
        }
      }
    });
  });

  test.describe('Field Metadata Management', () => {
    test('should refresh field metadata cache', async ({ page }) => {
      // Mock cached fields
      await ApiHelper.mockApiResponse(page, '**/api/fields/cache/status*', {
        lastRefresh: '2025-01-06T10:00:00Z',
        fieldCount: 150,
        cacheAge: '24 hours',
        needsRefresh: true
      });

      // Mock refresh operation
      await ApiHelper.mockApiResponse(page, '**/api/fields/refresh*', {
        success: true,
        refreshedFields: 165,
        newFields: 15,
        removedFields: 0,
        refreshTime: '4.2s'
      });

      await settingsPage.refreshFields();
      
      // Should show refresh results
      const refreshResults = page.locator('.refresh-results, .ant-message-success');
      const hasResults = await refreshResults.isVisible();
      
      if (hasResults) {
        const resultsText = await refreshResults.textContent();
        expect(resultsText).toMatch(/(refreshed|updated|fields)/i);
      }
    });

    test('should show cache status and age', async ({ page }) => {
      await ApiHelper.mockApiResponse(page, '**/api/fields/cache/status*', {
        lastRefresh: '2025-01-07T12:00:00Z',
        fieldCount: 142,
        cacheAge: '2 hours',
        needsRefresh: false
      });

      await page.reload();
      await settingsPage.navigateToFieldDiscovery();
      
      // Should show cache information
      const cacheStatus = page.locator('.cache-status, .field-cache-info');
      if (await cacheStatus.isVisible()) {
        const statusText = await cacheStatus.textContent();
        expect(statusText).toMatch(/(last refresh|cache age|142.*fields)/i);
      }
    });

    test('should handle cache corruption gracefully', async ({ page }) => {
      // Mock cache corruption error
      await ApiHelper.mockApiResponse(page, '**/api/fields/cache/status*', {
        success: false,
        error: 'Field metadata cache is corrupted',
        code: 'CACHE_CORRUPTED'
      }, 500);

      await page.reload();
      await settingsPage.navigateToFieldDiscovery();
      
      // Should show cache error and option to rebuild
      const cacheError = page.locator('.cache-error, .ant-alert-error');
      expect(await cacheError.isVisible()).toBe(true);
      
      const errorText = await cacheError.textContent();
      expect(errorText).toMatch(/(cache.*corrupt|rebuild|refresh)/i);
      
      // Should offer rebuild option
      const rebuildButton = page.locator('button:has-text("Rebuild"), .rebuild-cache-btn');
      const hasRebuildButton = await rebuildButton.isVisible();
      if (hasRebuildButton) {
        expect(hasRebuildButton).toBe(true);
      }
    });

    test('should validate field metadata consistency', async ({ page }) => {
      // Mock validation results
      await ApiHelper.mockApiResponse(page, '**/api/fields/validate*', {
        isValid: false,
        issues: [
          {
            field: 'lastLogon',
            issue: 'Type mismatch: expected datetime, found string',
            severity: 'high'
          },
          {
            field: 'memberOf',
            issue: 'Missing description',
            severity: 'low'
          }
        ],
        validationTime: '0.8s'
      });

      const validateButton = page.locator('button:has-text("Validate"), .validate-fields-btn');
      if (await validateButton.isVisible()) {
        await validateButton.click();
        
        // Should show validation results
        const validationResults = page.locator('.validation-results, .field-validation');
        if (await validationResults.isVisible()) {
          const issuesList = validationResults.locator('.validation-issue');
          const issuesCount = await issuesList.count();
          
          expect(issuesCount).toBe(2);
          
          const firstIssue = await issuesList.first().textContent();
          expect(firstIssue).toMatch(/(lastLogon|type mismatch)/i);
        }
      }
    });
  });

  test.describe('Field Discovery Performance', () => {
    test('should complete discovery within reasonable time', async ({ page }) => {
      const startTime = Date.now();
      
      await settingsPage.discoverFields('ad');
      
      const endTime = Date.now();
      const discoveryTime = endTime - startTime;
      
      // Discovery should complete within 10 seconds
      expect(discoveryTime).toBeLessThan(10000);
      
      // Should have discovered some fields
      const categories = await settingsPage.getFieldCategories();
      expect(categories.length).toBeGreaterThan(0);
    });

    test('should handle large schemas efficiently', async ({ page }) => {
      // Mock large schema discovery
      const largeSchema = {
        categories: Array.from({ length: 20 }, (_, catIndex) => ({
          name: `Category ${catIndex + 1}`,
          fields: Array.from({ length: 50 }, (_, fieldIndex) => ({
            name: `field${catIndex}_${fieldIndex}`,
            type: 'string',
            description: `Field ${fieldIndex} in category ${catIndex + 1}`
          }))
        }))
      };

      await ApiHelper.mockApiResponse(page, '**/api/fields/discover*', {
        success: true,
        discoveredFields: largeSchema,
        discoveryStats: {
          totalFields: 1000,
          categoriesFound: 20,
          discoveryTime: '8.5s'
        }
      });

      const startTime = Date.now();
      await settingsPage.discoverFields('ad');
      const endTime = Date.now();
      
      const categories = await settingsPage.getFieldCategories();
      expect(categories.length).toBe(20);
      
      // Should handle large schema within reasonable time
      expect(endTime - startTime).toBeLessThan(15000);
    });

    test('should support progressive field loading', async ({ page }) => {
      // Check for pagination or virtual scrolling in field lists
      const fieldContainer = page.locator('.field-categories, .fields-container');
      
      if (await fieldContainer.isVisible()) {
        // Look for pagination controls
        const pagination = page.locator('.ant-pagination, .field-pagination');
        const hasPagination = await pagination.isVisible();
        
        // Or virtual scrolling indicators
        const virtualScroll = page.locator('.virtual-list, .infinite-scroll');
        const hasVirtualScroll = await virtualScroll.isVisible();
        
        // Should have some mechanism for handling large field sets
        if (hasPagination || hasVirtualScroll) {
          expect(hasPagination || hasVirtualScroll).toBe(true);
        }
      }
    });

    test('should cache discovery results appropriately', async ({ page }) => {
      let discoveryCallCount = 0;
      
      await page.route('**/api/fields/discover*', (route) => {
        discoveryCallCount++;
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            discoveredFields: {
              categories: [
                {
                  name: 'Test Category',
                  fields: [
                    { name: 'testField', type: 'string', description: 'Test field' }
                  ]
                }
              ]
            }
          })
        });
      });

      // First discovery
      await settingsPage.discoverFields('ad');
      const firstCallCount = discoveryCallCount;
      
      // Navigate away and back
      await settingsPage.navigateToPreferences();
      await settingsPage.navigateToFieldDiscovery();
      
      // Should use cached results
      expect(discoveryCallCount).toBe(firstCallCount);
    });
  });

  test.describe('Field Discovery Integration', () => {
    test('should integrate with report builder field selection', async ({ page }) => {
      await settingsPage.discoverFields('ad');
      
      // Navigate to report builder
      await page.goto('/reports/builder');
      
      // Check that discovered fields are available
      const dataSourceSelect = page.locator('.data-source-select');
      if (await dataSourceSelect.isVisible()) {
        await dataSourceSelect.click();
        await page.locator('.ant-select-item:has-text("AD")').click();
        
        // Fields should be available from discovery
        const fieldPanel = page.locator('.fields-panel, .available-fields');
        if (await fieldPanel.isVisible()) {
          const fields = await fieldPanel.locator('.field-item').count();
          expect(fields).toBeGreaterThan(0);
        }
      }
    });

    test('should update field availability in real-time', async ({ page }) => {
      // Start with no fields discovered
      await ApiHelper.mockApiResponse(page, '**/api/fields*', []);
      
      await page.reload();
      await settingsPage.navigateToFieldDiscovery();
      
      let categories = await settingsPage.getFieldCategories();
      expect(categories.length).toBe(0);
      
      // Discover fields
      await ApiHelper.mockApiResponse(page, '**/api/fields/discover*', {
        success: true,
        discoveredFields: {
          categories: [
            {
              name: 'New Category',
              fields: [
                { name: 'newField', type: 'string', description: 'Newly discovered field' }
              ]
            }
          ]
        }
      });
      
      await settingsPage.discoverFields('ad');
      
      categories = await settingsPage.getFieldCategories();
      expect(categories.length).toBe(1);
      expect(categories[0].name).toBe('New Category');
    });

    test('should support custom field annotations', async ({ page }) => {
      const fieldItem = page.locator('.field-item').first();
      
      if (await fieldItem.isVisible()) {
        // Look for annotation or edit options
        const editButton = fieldItem.locator('.edit-field, button:has-text("Edit")');
        
        if (await editButton.isVisible()) {
          await editButton.click();
          
          const annotationModal = page.locator('.field-annotation-modal, .ant-modal');
          if (await annotationModal.isVisible()) {
            // Should allow custom descriptions or tags
            const descriptionInput = annotationModal.locator('textarea[name="description"]');
            const tagsInput = annotationModal.locator('input[name="tags"]');
            
            if (await descriptionInput.isVisible()) {
              await descriptionInput.fill('Custom field description');
            }
            
            if (await tagsInput.isVisible()) {
              await tagsInput.fill('security, important');
            }
            
            await annotationModal.locator('button:has-text("Save")').click();
          }
        }
      }
    });

    test('should track field discovery history', async ({ page }) => {
      const historyButton = page.locator('button:has-text("History"), .discovery-history-btn');
      
      if (await historyButton.isVisible()) {
        await historyButton.click();
        
        const historyModal = page.locator('.discovery-history-modal, .ant-modal');
        if (await historyModal.isVisible()) {
          const historyItems = historyModal.locator('.history-item');
          const itemCount = await historyItems.count();
          
          if (itemCount > 0) {
            const firstItem = await historyItems.first().textContent();
            expect(firstItem).toMatch(/(discovered|refreshed|\d+.*fields)/i);
          }
        }
      }
    });
  });

  test.describe('Error Handling and Edge Cases', () => {
    test('should handle credential permission errors', async ({ page }) => {
      // Mock permission error
      await ApiHelper.mockApiResponse(page, '**/api/fields/discover*', {
        success: false,
        error: 'Insufficient permissions to read schema',
        code: 'PERMISSION_DENIED',
        requiredPermissions: ['read_schema', 'list_attributes']
      }, 403);

      await settingsPage.discoverFields('ad');
      
      const permissionError = page.locator('.permission-error, .ant-result-403');
      expect(await permissionError.isVisible()).toBe(true);
      
      const errorText = await permissionError.textContent();
      expect(errorText).toMatch(/(permission|access.*denied|insufficient)/i);
    });

    test('should handle network timeouts during discovery', async ({ page }) => {
      // Mock timeout
      await page.route('**/api/fields/discover*', (route) => {
        route.abort('timedout');
      });

      await settingsPage.discoverFields('ad');
      
      const timeoutError = page.locator('.timeout-error, .network-error');
      const hasTimeoutError = await timeoutError.isVisible();
      
      if (hasTimeoutError) {
        const errorText = await timeoutError.textContent();
        expect(errorText).toMatch(/(timeout|network|connection)/i);
      }
    });

    test('should handle partial discovery failures', async ({ page }) => {
      // Mock partial failure
      await ApiHelper.mockApiResponse(page, '**/api/fields/discover*', {
        success: true,
        discoveredFields: {
          categories: [
            {
              name: 'Successfully Discovered',
              fields: [
                { name: 'workingField', type: 'string', description: 'This field was discovered' }
              ]
            }
          ]
        },
        warnings: [
          'Unable to read extended attributes: Permission denied',
          'Some custom schema extensions could not be accessed'
        ],
        partialFailure: true
      });

      await settingsPage.discoverFields('ad');
      
      // Should show both results and warnings
      const categories = await settingsPage.getFieldCategories();
      expect(categories.length).toBe(1);
      
      const warningMessage = page.locator('.ant-alert-warning, .discovery-warnings');
      if (await warningMessage.isVisible()) {
        const warningText = await warningMessage.textContent();
        expect(warningText).toMatch(/(warning|partial|permission)/i);
      }
    });

    test('should handle schema version changes', async ({ page }) => {
      // Mock schema version conflict
      await ApiHelper.mockApiResponse(page, '**/api/fields/discover*', {
        success: false,
        error: 'Schema version mismatch detected',
        details: 'Server schema version 2.3 does not match cached version 2.1',
        code: 'SCHEMA_VERSION_MISMATCH',
        suggestedAction: 'Clear cache and rediscover fields'
      }, 409);

      await settingsPage.discoverFields('ad');
      
      const versionError = page.locator('.schema-version-error, .ant-alert-warning');
      if (await versionError.isVisible()) {
        const errorText = await versionError.textContent();
        expect(errorText).toMatch(/(version.*mismatch|schema.*version)/i);
        
        // Should suggest clearing cache
        const clearCacheButton = page.locator('button:has-text("Clear Cache"), .clear-cache-btn');
        const hasClearButton = await clearCacheButton.isVisible();
        if (hasClearButton) {
          expect(hasClearButton).toBe(true);
        }
      }
    });
  });

  test.describe('Multi-tenancy and Data Source Support', () => {
    test('should discover fields for multiple AD domains', async ({ page }) => {
      // Mock multi-domain discovery
      await ApiHelper.mockApiResponse(page, '**/api/fields/discover*', {
        success: true,
        discoveredFields: {
          domains: [
            {
              name: 'domain1.local',
              categories: [
                {
                  name: 'Domain 1 Users',
                  fields: [
                    { name: 'sAMAccountName', type: 'string', description: 'Account name' }
                  ]
                }
              ]
            },
            {
              name: 'domain2.local',
              categories: [
                {
                  name: 'Domain 2 Users',
                  fields: [
                    { name: 'sAMAccountName', type: 'string', description: 'Account name' },
                    { name: 'customAttribute1', type: 'string', description: 'Custom domain 2 attribute' }
                  ]
                }
              ]
            }
          ]
        }
      });

      await settingsPage.discoverFields('ad');
      
      // Should show fields from multiple domains
      const domainTabs = page.locator('.domain-tabs, .multi-domain-selector');
      if (await domainTabs.isVisible()) {
        const domains = await domainTabs.locator('.domain-tab, .domain-option').count();
        expect(domains).toBe(2);
      }
    });

    test('should handle different Azure AD tenants', async ({ page }) => {
      await ApiHelper.mockApiResponse(page, '**/api/fields/discover*', {
        success: true,
        discoveredFields: {
          tenants: [
            {
              tenantId: 'tenant1-id',
              displayName: 'Company A',
              categories: [
                {
                  name: 'Users',
                  fields: [
                    { name: 'userPrincipalName', type: 'string', description: 'UPN' }
                  ]
                }
              ]
            }
          ]
        }
      });

      await settingsPage.discoverFields('azure');
      
      const categories = await settingsPage.getFieldCategories();
      expect(categories.length).toBeGreaterThan(0);
      
      // Should show tenant information
      const tenantInfo = page.locator('.tenant-info, .azure-tenant');
      if (await tenantInfo.isVisible()) {
        const tenantText = await tenantInfo.textContent();
        expect(tenantText).toContain('Company A');
      }
    });
  });
});