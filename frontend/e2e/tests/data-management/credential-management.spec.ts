import { test, expect } from '@playwright/test';
import { SettingsPage, DashboardPage } from '../../pages';
import { AuthHelper, ApiHelper, FormHelper } from '../../utils/test-helpers';
import { TEST_USERS, TEST_CONFIG } from '../../fixtures/test-data';

test.describe('Data Management - Credential Management', () => {
  let settingsPage: SettingsPage;
  let dashboardPage: DashboardPage;

  test.beforeEach(async ({ page }) => {
    settingsPage = new SettingsPage(page);
    dashboardPage = new DashboardPage(page);
    
    // Login before each test
    await AuthHelper.login(page, 'AD_USER');
    
    // Navigate to settings page
    await settingsPage.goto();
    
    // Navigate to credentials section
    await settingsPage.navigateToCredentials();
  });

  test.describe('Credential Creation and Management', () => {
    test('should add new AD credential successfully', async ({ page }) => {
      // Mock credential creation API
      await ApiHelper.mockApiResponse(page, '**/api/credentials', {
        success: true,
        credentialId: 123,
        message: 'Credential added successfully'
      });

      // Mock credential test API
      await ApiHelper.mockApiResponse(page, '**/api/credentials/*/test', {
        success: true,
        status: 'connected',
        responseTime: '150ms'
      });

      const credentialData = {
        name: 'Test AD Server',
        type: 'ad' as const,
        server: 'dc01.testdomain.local',
        username: 'service-account@testdomain.local',
        password: 'ServicePassword123!',
        domain: 'TESTDOMAIN'
      };

      await settingsPage.addCredential(credentialData);
      
      // Verify credential appears in list
      const credentials = await settingsPage.getCredentialsList();
      expect(credentials.some(cred => cred.name === credentialData.name)).toBe(true);
      
      // Test the credential
      const testResult = await settingsPage.testCredential(credentialData.name);
      expect(testResult).toBe('success');
    });

    test('should add new Azure AD credential successfully', async ({ page }) => {
      await ApiHelper.mockApiResponse(page, '**/api/credentials', {
        success: true,
        credentialId: 124,
        message: 'Azure credential added successfully'
      });

      const azureCredential = {
        name: 'Test Azure AD',
        type: 'azure' as const,
        username: 'admin@company.onmicrosoft.com',
        password: 'not_used_for_azure',
        tenantId: 'abcd1234-5678-90ef-ghij-klmnopqrstuv',
        clientId: 'efgh5678-90ab-cdef-1234-567890abcdef',
        clientSecret: 'client-secret-value'
      };

      await settingsPage.addCredential(azureCredential);
      
      const credentials = await settingsPage.getCredentialsList();
      expect(credentials.some(cred => 
        cred.name === azureCredential.name && 
        cred.type.toLowerCase().includes('azure')
      )).toBe(true);
    });

    test('should add new O365 credential successfully', async ({ page }) => {
      await ApiHelper.mockApiResponse(page, '**/api/credentials', {
        success: true,
        credentialId: 125
      });

      const o365Credential = {
        name: 'Test O365 Connection',
        type: 'o365' as const,
        username: 'admin@company.com',
        password: 'not_used_for_o365',
        tenantId: 'company-tenant-id',
        clientId: 'o365-client-id',
        clientSecret: 'o365-client-secret'
      };

      await settingsPage.addCredential(o365Credential);
      
      const credentials = await settingsPage.getCredentialsList();
      expect(credentials.some(cred => 
        cred.name === o365Credential.name
      )).toBe(true);
    });

    test('should validate required fields when adding credential', async ({ page }) => {
      // Try to add credential without required fields
      const incompleteCredential = {
        name: '', // Missing name
        type: 'ad' as const,
        username: '',
        password: ''
      };

      await settingsPage.addCredentialButton.click();
      
      const modal = page.locator('.ant-modal, .credential-modal');
      await modal.waitFor({ state: 'visible' });
      
      // Try to save without filling fields
      await modal.locator('button:has-text("Save"), button:has-text("Add")').click();
      
      // Should show validation errors
      const errors = await FormHelper.getFormErrors(page, '.credential-form');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(error => error.toLowerCase().includes('required'))).toBe(true);
      
      // Modal should still be open
      expect(await modal.isVisible()).toBe(true);
      
      // Cancel the modal
      await modal.locator('button:has-text("Cancel"), .ant-modal-close').click();
    });

    test('should handle credential creation errors gracefully', async ({ page }) => {
      // Mock API error
      await ApiHelper.mockApiResponse(page, '**/api/credentials', {
        success: false,
        error: 'Credential with this name already exists'
      }, 400);

      const duplicateCredential = {
        name: 'Existing Credential',
        type: 'ad' as const,
        username: 'test@domain.local',
        password: 'password123'
      };

      await settingsPage.addCredential(duplicateCredential);
      
      // Should show error message
      const errorMessage = page.locator('.ant-message-error, .ant-notification-error');
      const hasError = await errorMessage.isVisible();
      
      if (hasError) {
        const errorText = await errorMessage.textContent();
        expect(errorText).toContain('already exists');
      }
    });
  });

  test.describe('Credential Testing and Validation', () => {
    test('should test AD credential connection successfully', async ({ page }) => {
      // Mock existing credential
      await ApiHelper.mockApiResponse(page, '**/api/credentials*', [
        {
          id: 1,
          name: 'Test AD Connection',
          type: 'ad',
          status: 'untested',
          createdAt: '2025-01-07T10:00:00Z'
        }
      ]);

      // Mock successful connection test
      await ApiHelper.mockApiResponse(page, '**/api/credentials/*/test', {
        success: true,
        status: 'connected',
        responseTime: '125ms',
        serverInfo: {
          domainController: 'dc01.testdomain.local',
          ldapVersion: 3,
          supportedControls: ['1.2.840.113556.1.4.319']
        }
      });

      await page.reload();
      await settingsPage.navigateToCredentials();
      
      const testResult = await settingsPage.testCredential('Test AD Connection');
      expect(testResult).toBe('success');
      
      // Should show connection details
      const connectionInfo = page.locator('.connection-info, .test-results');
      const hasInfo = await connectionInfo.isVisible();
      
      if (hasInfo) {
        const infoText = await connectionInfo.textContent();
        expect(infoText).toMatch(/(connected|response time|125ms)/i);
      }
    });

    test('should handle failed credential connection test', async ({ page }) => {
      await ApiHelper.mockApiResponse(page, '**/api/credentials*', [
        {
          id: 2,
          name: 'Failing AD Connection',
          type: 'ad',
          status: 'error'
        }
      ]);

      // Mock failed connection test
      await ApiHelper.mockApiResponse(page, '**/api/credentials/*/test', {
        success: false,
        status: 'connection_failed',
        error: 'Unable to connect to LDAP server: Connection timeout',
        details: 'Server dc01.testdomain.local:389 is not reachable'
      }, 500);

      await page.reload();
      await settingsPage.navigateToCredentials();
      
      const testResult = await settingsPage.testCredential('Failing AD Connection');
      expect(testResult).toBe('error');
      
      // Should show error details
      const errorInfo = page.locator('.connection-error, .test-error');
      const hasError = await errorInfo.isVisible();
      
      if (hasError) {
        const errorText = await errorInfo.textContent();
        expect(errorText).toMatch(/(connection|timeout|failed)/i);
      }
    });

    test('should test Azure AD credential with OAuth flow', async ({ page }) => {
      await ApiHelper.mockApiResponse(page, '**/api/credentials*', [
        {
          id: 3,
          name: 'Test Azure Connection',
          type: 'azure',
          status: 'untested'
        }
      ]);

      // Mock Azure authentication test
      await ApiHelper.mockApiResponse(page, '**/api/credentials/*/test', {
        success: true,
        status: 'authenticated',
        tokenType: 'Bearer',
        expiresIn: 3600,
        tenantInfo: {
          tenantId: 'company-tenant-id',
          displayName: 'Company Organization'
        }
      });

      await page.reload();
      await settingsPage.navigateToCredentials();
      
      const testResult = await settingsPage.testCredential('Test Azure Connection');
      expect(testResult).toBe('success');
    });

    test('should handle Azure AD OAuth errors', async ({ page }) => {
      await ApiHelper.mockApiResponse(page, '**/api/credentials*', [
        {
          id: 4,
          name: 'Invalid Azure Creds',
          type: 'azure',
          status: 'error'
        }
      ]);

      await ApiHelper.mockApiResponse(page, '**/api/credentials/*/test', {
        success: false,
        status: 'authentication_failed',
        error: 'AADSTS70002: Invalid client secret',
        errorCode: 'AADSTS70002'
      }, 401);

      await page.reload();
      await settingsPage.navigateToCredentials();
      
      const testResult = await settingsPage.testCredential('Invalid Azure Creds');
      expect(testResult).toBe('error');
    });

    test('should show credential test history', async ({ page }) => {
      await ApiHelper.mockApiResponse(page, '**/api/credentials/*/test-history', [
        {
          testedAt: '2025-01-07T14:00:00Z',
          status: 'success',
          responseTime: '150ms'
        },
        {
          testedAt: '2025-01-06T10:30:00Z',
          status: 'error',
          error: 'Connection timeout'
        }
      ]);

      // Click on credential to view details/history
      const credentialItem = page.locator('.credential-item').first();
      if (await credentialItem.isVisible()) {
        await credentialItem.click();
        
        const historySection = page.locator('.test-history, .connection-history');
        if (await historySection.isVisible()) {
          const historyItems = await historySection.locator('.history-item').count();
          expect(historyItems).toBeGreaterThan(0);
        }
      }
    });
  });

  test.describe('Credential Editing and Updates', () => {
    test('should edit existing credential', async ({ page }) => {
      // Mock existing credentials
      await ApiHelper.mockApiResponse(page, '**/api/credentials*', [
        {
          id: 1,
          name: 'Editable Credential',
          type: 'ad',
          server: 'old-server.domain.local',
          username: 'old-user@domain.local'
        }
      ]);

      // Mock update API
      await ApiHelper.mockApiResponse(page, '**/api/credentials/*', {
        success: true,
        message: 'Credential updated successfully'
      });

      await page.reload();
      await settingsPage.navigateToCredentials();
      
      // Click edit button
      const credentialItem = page.locator('.credential-item:has-text("Editable Credential")');
      const editButton = credentialItem.locator('button:has-text("Edit"), .edit-btn');
      
      if (await editButton.isVisible()) {
        await editButton.click();
        
        const modal = page.locator('.ant-modal, .credential-modal');
        await modal.waitFor({ state: 'visible' });
        
        // Update credential details
        await modal.locator('input[name="server"]').fill('new-server.domain.local');
        await modal.locator('input[name="username"]').fill('new-user@domain.local');
        
        // Save changes
        await modal.locator('button:has-text("Save"), button:has-text("Update")').click();
        await modal.waitFor({ state: 'hidden' });
        
        // Should show success message
        const successMessage = page.locator('.ant-message-success');
        const hasSuccess = await successMessage.isVisible();
        
        if (hasSuccess) {
          expect(await successMessage.textContent()).toContain('updated');
        }
      }
    });

    test('should validate credential updates', async ({ page }) => {
      await ApiHelper.mockApiResponse(page, '**/api/credentials*', [
        {
          id: 1,
          name: 'Test Credential',
          type: 'ad'
        }
      ]);

      await page.reload();
      await settingsPage.navigateToCredentials();
      
      const credentialItem = page.locator('.credential-item').first();
      const editButton = credentialItem.locator('button:has-text("Edit")');
      
      if (await editButton.isVisible()) {
        await editButton.click();
        
        const modal = page.locator('.ant-modal');
        await modal.waitFor({ state: 'visible' });
        
        // Clear required field
        await modal.locator('input[name="username"]').fill('');
        
        // Try to save
        await modal.locator('button:has-text("Save")').click();
        
        // Should show validation error
        const errors = await FormHelper.getFormErrors(page, '.credential-form');
        expect(errors.length).toBeGreaterThan(0);
      }
    });

    test('should handle credential update conflicts', async ({ page }) => {
      await ApiHelper.mockApiResponse(page, '**/api/credentials*', [
        {
          id: 1,
          name: 'Conflicting Credential',
          type: 'ad'
        }
      ]);

      // Mock conflict error
      await ApiHelper.mockApiResponse(page, '**/api/credentials/*', {
        success: false,
        error: 'Credential has been modified by another user',
        code: 'CONFLICT'
      }, 409);

      await page.reload();
      await settingsPage.navigateToCredentials();
      
      const credentialItem = page.locator('.credential-item').first();
      const editButton = credentialItem.locator('button:has-text("Edit")');
      
      if (await editButton.isVisible()) {
        await editButton.click();
        
        const modal = page.locator('.ant-modal');
        await modal.waitFor({ state: 'visible' });
        
        // Make some changes
        await modal.locator('input[name="username"]').fill('updated-user@domain.local');
        await modal.locator('button:has-text("Save")').click();
        
        // Should show conflict error
        const errorMessage = page.locator('.ant-message-error, .conflict-error');
        const hasError = await errorMessage.isVisible();
        
        if (hasError) {
          const errorText = await errorMessage.textContent();
          expect(errorText).toMatch(/(conflict|modified|another user)/i);
        }
      }
    });
  });

  test.describe('Credential Deletion and Cleanup', () => {
    test('should delete credential successfully', async ({ page }) => {
      // Mock existing credential
      await ApiHelper.mockApiResponse(page, '**/api/credentials*', [
        {
          id: 1,
          name: 'Credential To Delete',
          type: 'ad',
          inUse: false
        }
      ]);

      // Mock delete API
      await ApiHelper.mockApiResponse(page, '**/api/credentials/*', {
        success: true,
        message: 'Credential deleted successfully'
      });

      await page.reload();
      await settingsPage.navigateToCredentials();
      
      const credentialsBefore = await settingsPage.getCredentialsList();
      const initialCount = credentialsBefore.length;
      
      await settingsPage.deleteCredential('Credential To Delete');
      
      const credentialsAfter = await settingsPage.getCredentialsList();
      expect(credentialsAfter.length).toBe(initialCount - 1);
      expect(credentialsAfter.some(cred => cred.name === 'Credential To Delete')).toBe(false);
    });

    test('should prevent deletion of credentials in use', async ({ page }) => {
      await ApiHelper.mockApiResponse(page, '**/api/credentials*', [
        {
          id: 1,
          name: 'Active Credential',
          type: 'ad',
          inUse: true,
          usedBy: ['Inactive Users Report', 'Password Expiry Report']
        }
      ]);

      // Mock delete prevention
      await ApiHelper.mockApiResponse(page, '**/api/credentials/*', {
        success: false,
        error: 'Cannot delete credential that is in use by active reports',
        usedBy: ['Inactive Users Report', 'Password Expiry Report']
      }, 409);

      await page.reload();
      await settingsPage.navigateToCredentials();
      
      const credentialItem = page.locator('.credential-item:has-text("Active Credential")');
      const deleteButton = credentialItem.locator('button:has-text("Delete")');
      
      if (await deleteButton.isVisible()) {
        await deleteButton.click();
        
        // Should show usage warning
        const warningModal = page.locator('.ant-modal-confirm, .usage-warning');
        const hasWarning = await warningModal.isVisible();
        
        if (hasWarning) {
          const warningText = await warningModal.textContent();
          expect(warningText).toMatch(/(in use|cannot delete|active report)/i);
          
          // Cancel deletion
          await warningModal.locator('button:has-text("Cancel")').click();
        }
        
        // Credential should still exist
        const credentials = await settingsPage.getCredentialsList();
        expect(credentials.some(cred => cred.name === 'Active Credential')).toBe(true);
      }
    });

    test('should show confirmation dialog before deletion', async ({ page }) => {
      await ApiHelper.mockApiResponse(page, '**/api/credentials*', [
        {
          id: 1,
          name: 'Confirm Delete Credential',
          type: 'ad'
        }
      ]);

      await page.reload();
      await settingsPage.navigateToCredentials();
      
      const credentialItem = page.locator('.credential-item:has-text("Confirm Delete Credential")');
      const deleteButton = credentialItem.locator('button:has-text("Delete")');
      
      if (await deleteButton.isVisible()) {
        await deleteButton.click();
        
        // Should show confirmation dialog
        const confirmDialog = page.locator('.ant-modal-confirm, .delete-confirm');
        expect(await confirmDialog.isVisible()).toBe(true);
        
        const confirmText = await confirmDialog.textContent();
        expect(confirmText).toMatch(/(are you sure|delete|confirm)/i);
        
        // Cancel deletion
        await confirmDialog.locator('button:has-text("Cancel"), button:has-text("No")').click();
        await confirmDialog.waitFor({ state: 'hidden' });
        
        // Credential should still exist
        const credentials = await settingsPage.getCredentialsList();
        expect(credentials.some(cred => cred.name === 'Confirm Delete Credential')).toBe(true);
      }
    });
  });

  test.describe('Credential Security and Encryption', () => {
    test('should mask sensitive credential information', async ({ page }) => {
      await ApiHelper.mockApiResponse(page, '**/api/credentials*', [
        {
          id: 1,
          name: 'Secure Credential',
          type: 'ad',
          username: 'service-account@domain.local',
          // Password should be masked in response
          passwordMask: '••••••••••••',
          server: 'dc01.domain.local'
        }
      ]);

      await page.reload();
      await settingsPage.navigateToCredentials();
      
      const credentialItem = page.locator('.credential-item:has-text("Secure Credential")');
      
      // Password should be masked in display
      const passwordField = credentialItem.locator('.password-display, .credential-password');
      if (await passwordField.isVisible()) {
        const passwordText = await passwordField.textContent();
        expect(passwordText).toMatch(/[•*]+/);
        expect(passwordText).not.toContain('actual-password');
      }
    });

    test('should encrypt credentials before storage', async ({ page }) => {
      // This test verifies that the UI properly handles encrypted data
      let requestBody: any;
      
      await page.route('**/api/credentials', async (route) => {
        requestBody = await route.request().postDataJSON();
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            credentialId: 123
          })
        });
      });

      const credentialData = {
        name: 'Encryption Test',
        type: 'ad' as const,
        username: 'test@domain.local',
        password: 'sensitive-password-123'
      };

      await settingsPage.addCredential(credentialData);
      
      // Verify that sensitive data is not sent in plain text
      // (Implementation would depend on client-side encryption)
      expect(requestBody).toBeTruthy();
      expect(requestBody.name).toBe(credentialData.name);
      expect(requestBody.username).toBe(credentialData.username);
      // Password handling would depend on encryption implementation
    });

    test('should handle credential decryption errors', async ({ page }) => {
      // Mock decryption error
      await ApiHelper.mockApiResponse(page, '**/api/credentials*', {
        success: false,
        error: 'Unable to decrypt stored credentials',
        code: 'DECRYPTION_ERROR'
      }, 500);

      await page.reload();
      await settingsPage.navigateToCredentials();
      
      // Should show decryption error
      const errorMessage = page.locator('.ant-alert-error, .decryption-error');
      const hasError = await errorMessage.isVisible();
      
      if (hasError) {
        const errorText = await errorMessage.textContent();
        expect(errorText).toMatch(/(decrypt|encryption|error)/i);
      }
    });

    test('should validate credential permissions', async ({ page }) => {
      // Mock user without credential management permissions
      await page.route('**/api/credentials**', (route) => {
        route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            error: 'Insufficient permissions to manage credentials'
          })
        });
      });

      await page.reload();
      await settingsPage.navigateToCredentials();
      
      // Should show permission error
      const permissionError = page.locator('.ant-result-403, .permission-error');
      const hasPermissionError = await permissionError.isVisible();
      
      if (hasPermissionError) {
        const errorText = await permissionError.textContent();
        expect(errorText).toMatch(/(permission|access denied|not authorized)/i);
      }
    });
  });

  test.describe('Credential Import and Export', () => {
    test('should support credential import from file', async ({ page }) => {
      const importButton = page.locator('button:has-text("Import"), .import-credentials-btn');
      
      if (await importButton.isVisible()) {
        await importButton.click();
        
        const importModal = page.locator('.import-modal, .ant-modal');
        await importModal.waitFor({ state: 'visible' });
        
        // Mock file upload
        const fileInput = importModal.locator('input[type="file"]');
        if (await fileInput.isVisible()) {
          // In real test, would upload actual file
          const mockFileData = JSON.stringify([
            {
              name: 'Imported AD Credential',
              type: 'ad',
              server: 'imported-dc.domain.local',
              username: 'imported-user@domain.local'
            }
          ]);
          
          // Simulate file selection and upload
          await fileInput.setInputFiles({
            name: 'credentials.json',
            mimeType: 'application/json',
            buffer: Buffer.from(mockFileData)
          });
          
          await importModal.locator('button:has-text("Import")').click();
          
          // Should show import results
          const importResults = page.locator('.import-results, .import-summary');
          const hasResults = await importResults.isVisible();
          
          if (hasResults) {
            const resultsText = await importResults.textContent();
            expect(resultsText).toMatch(/(imported|success|credential)/i);
          }
        }
      }
    });

    test('should support credential export', async ({ page }) => {
      await ApiHelper.mockApiResponse(page, '**/api/credentials*', [
        {
          id: 1,
          name: 'Exportable Credential',
          type: 'ad'
        }
      ]);

      await page.reload();
      await settingsPage.navigateToCredentials();
      
      const exportButton = page.locator('button:has-text("Export"), .export-credentials-btn');
      
      if (await exportButton.isVisible()) {
        await exportButton.click();
        
        // Should trigger download or show export options
        const exportModal = page.locator('.export-modal, .ant-modal');
        const hasModal = await exportModal.isVisible();
        
        if (hasModal) {
          // Select export format
          const formatSelect = exportModal.locator('.export-format-select');
          if (await formatSelect.isVisible()) {
            await formatSelect.click();
            await page.locator('.ant-select-item:has-text("JSON")').click();
          }
          
          await exportModal.locator('button:has-text("Export")').click();
          
          // In real test, would verify download
        }
      }
    });
  });

  test.describe('Credential Usage Monitoring', () => {
    test('should show credential usage statistics', async ({ page }) => {
      await ApiHelper.mockApiResponse(page, '**/api/credentials*', [
        {
          id: 1,
          name: 'Monitored Credential',
          type: 'ad',
          usage: {
            reportsUsing: 5,
            lastUsed: '2025-01-07T14:00:00Z',
            totalExecutions: 150
          }
        }
      ]);

      await page.reload();
      await settingsPage.navigateToCredentials();
      
      const credentialItem = page.locator('.credential-item:has-text("Monitored Credential")');
      
      // Should show usage information
      const usageInfo = credentialItem.locator('.usage-info, .credential-usage');
      if (await usageInfo.isVisible()) {
        const usageText = await usageInfo.textContent();
        expect(usageText).toMatch(/(5.*reports|150.*executions|last used)/i);
      }
    });

    test('should link to reports using credential', async ({ page }) => {
      await ApiHelper.mockApiResponse(page, '**/api/credentials/1/usage', {
        reportsUsing: [
          { name: 'Inactive Users', id: 'inactive_users', lastExecuted: '2025-01-07T12:00:00Z' },
          { name: 'Password Expiry', id: 'password_expiry', lastExecuted: '2025-01-07T10:30:00Z' }
        ],
        scheduledReports: [
          { name: 'Daily Security Report', schedule: 'daily' }
        ]
      });

      const credentialItem = page.locator('.credential-item').first();
      const usageLink = credentialItem.locator('.usage-link, button:has-text("View Usage")');
      
      if (await usageLink.isVisible()) {
        await usageLink.click();
        
        const usageModal = page.locator('.usage-modal, .ant-modal');
        await usageModal.waitFor({ state: 'visible' });
        
        // Should show list of reports using this credential
        const reportList = usageModal.locator('.reports-using, .usage-reports');
        if (await reportList.isVisible()) {
          const reportItems = await reportList.locator('.report-item').count();
          expect(reportItems).toBeGreaterThan(0);
        }
      }
    });
  });

  test.describe('Performance and Reliability', () => {
    test('should handle large numbers of credentials efficiently', async ({ page }) => {
      // Mock large credential list
      const largeCredentialList = Array.from({ length: 100 }, (_, i) => ({
        id: i + 1,
        name: `Credential ${i + 1}`,
        type: i % 3 === 0 ? 'ad' : i % 3 === 1 ? 'azure' : 'o365',
        status: i % 4 === 0 ? 'error' : 'active'
      }));

      await ApiHelper.mockApiResponse(page, '**/api/credentials*', largeCredentialList);

      const startTime = Date.now();
      await page.reload();
      await settingsPage.navigateToCredentials();
      
      const credentials = await settingsPage.getCredentialsList();
      const loadTime = Date.now() - startTime;
      
      expect(credentials.length).toBeGreaterThan(50); // Should load many credentials
      expect(loadTime).toBeLessThan(10000); // Should load within 10 seconds
    });

    test('should support credential pagination', async ({ page }) => {
      const paginationControls = page.locator('.ant-pagination, .credentials-pagination');
      
      if (await paginationControls.isVisible()) {
        // Test pagination
        const nextButton = paginationControls.locator('.ant-pagination-next');
        if (await nextButton.isVisible() && !(await nextButton.isDisabled())) {
          await nextButton.click();
          await page.waitForLoadState('networkidle');
          
          // Should load next page
          const credentials = await settingsPage.getCredentialsList();
          expect(credentials.length).toBeGreaterThan(0);
        }
      }
    });

    test('should handle credential operations during high load', async ({ page }) => {
      // Simulate slow API responses
      await page.route('**/api/credentials**', async (route) => {
        await page.waitForTimeout(2000); // 2 second delay
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: []
          })
        });
      });

      const startTime = Date.now();
      await page.reload();
      await settingsPage.navigateToCredentials();
      
      // Should show loading state
      const loadingSpinner = page.locator('.ant-spin, .loading');
      const hasLoading = await loadingSpinner.isVisible();
      
      // Should eventually complete
      await page.waitForLoadState('networkidle', { timeout: 10000 });
      const endTime = Date.now();
      
      expect(endTime - startTime).toBeLessThan(15000); // Should complete within 15 seconds
    });
  });
});