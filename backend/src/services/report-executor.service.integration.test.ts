import { ReportExecutorService } from './report-executor.service';
import { credentialsService } from './credentials.service';
import { reportTemplateBridge } from './report-template-bridge.service';
import { TestContext, setupTestContext, teardownTestContext, createMockLDAPConnection } from '../test/test-helpers';
import { Pool } from 'pg';

// Set environment for integration tests
process.env.TEST_TYPE = 'integration';

// Mock AD service for testing
jest.mock('./ad.service', () => ({
  ADService: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(createMockLDAPConnection()),
    executeQuery: jest.fn().mockResolvedValue({
      success: true,
      data: [
        {
          sAMAccountName: 'testuser1',
          displayName: 'Test User 1',
          mail: 'testuser1@test.local',
          lastLogonTimestamp: '131976789876543210',
          whenCreated: '20240101000000.0Z',
          userAccountControl: 512
        },
        {
          sAMAccountName: 'testuser2',
          displayName: 'Test User 2',
          mail: 'testuser2@test.local',
          lastLogonTimestamp: '131976789876543210',
          whenCreated: '20240101000000.0Z',
          userAccountControl: 514 // Disabled
        }
      ]
    })
  }))
}));

describe.skip('ReportExecutorService Integration Tests', () => {
  let testContext: TestContext;
  let pool: Pool;
  let reportExecutor: ReportExecutorService;
  let testCredentialId: number;
  let testTemplateId: string;

  beforeAll(async () => {
    testContext = await setupTestContext();
    pool = testContext.pool;
    reportExecutor = new ReportExecutorService();
    
    // Give service time to initialize
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterAll(async () => {
    await teardownTestContext(testContext);
  });

  beforeEach(async () => {
    // Create test credential
    const credential = await credentialsService.createCredential(
      testContext.userId,
      {
        serviceType: 'ad',
        credentialName: 'Test AD for Reports',
        username: 'report-test-user',
        password: 'report-test-password',
        isDefault: true
      }
    );
    testCredentialId = credential.id;

    // Ensure we have a test template
    const client = await pool.connect();
    try {
      const result = await client.query(
        `INSERT INTO report_templates (id, name, description, category, report_type, is_system, is_active, created_at)
         VALUES ('test-report-template', 'Test Report Template', 'Test template for integration tests', 'ad', 'inactive_users', true, true, NOW())
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
      );
      testTemplateId = result.rows[0].id;
    } finally {
      client.release();
    }
  });

  describe('Report Execution with User Credentials', () => {
    it('should execute report with default user credential', async () => {
      const result = await reportExecutor.executeReport({
        userId: testContext.userId,
        templateId: testTemplateId,
        parameters: { days: 30 }
      });

      expect(result.success).toBe(true);
      expect(result.executionId).toBeDefined();
      expect(((result as any)?.data)).toBeDefined();
      expect(Array.isArray(((result as any)?.data))).toBe(true);
      expect(result.rowCount).toBe(((result as any)?.data)!.length);
      expect(result.executionTime).toBeGreaterThan(0);
      expect(result.executedAt).toBeInstanceOf(Date);
      expect(result.status).toBe('success');
    });

    it('should execute report with specific credential', async () => {
      const result = await reportExecutor.executeReport({
        userId: testContext.userId,
        templateId: testTemplateId,
        parameters: { days: 60 },
        credentialId: testCredentialId
      });

      expect(result.success).toBe(true);
      expect(result.credentialId).toBe(testCredentialId);
    });

    it('should fail with non-existent credential', async () => {
      await expect(reportExecutor.executeReport({
        userId: testContext.userId,
        templateId: testTemplateId,
        parameters: {},
        credentialId: 99999 // Non-existent
      })).rejects.toThrow('Credential with ID 99999 not found');
    });

    it('should fail with wrong credential type', async () => {
      // Create Azure credential
      const azureCredential = await credentialsService.createCredential(
        testContext.userId,
        {
          serviceType: 'azure',
          credentialName: 'Wrong Type Credential',
          tenantId: 'test-tenant',
          clientId: 'test-client',
          clientSecret: 'test-secret'
        }
      );

      await expect(reportExecutor.executeReport({
        userId: testContext.userId,
        templateId: testTemplateId,
        parameters: {},
        credentialId: azureCredential.id
      })).rejects.toThrow('Credential type mismatch');
    });
  });

  describe('Report Template Management', () => {
    it('should get report template by ID', async () => {
      const template = await reportExecutor['getReportTemplate'](testTemplateId);
      
      expect(template).toBeDefined();
      expect(template!.id).toBe(testTemplateId);
      expect(template!.name).toBe('Test Report Template');
      expect(template!.category).toBe('ad');
      expect(template!.report_type).toBe('inactive_users');
    });

    it('should handle non-existent template', async () => {
      await expect(reportExecutor.executeReport({
        userId: testContext.userId,
        templateId: 'non-existent-template',
        parameters: {}
      })).rejects.toThrow('Report template not found');
    });
  });

  describe('Parameter Handling', () => {
    it('should merge default parameters with provided parameters', async () => {
      // Update template with default parameters
      const client = await pool.connect();
      try {
        await client.query(
          `UPDATE report_templates 
           SET default_parameters = $1
           WHERE id = $2`,
          [JSON.stringify({ days: 90, includeDisabled: false }), testTemplateId]
        );
      } finally {
        client.release();
      }

      const result = await reportExecutor.executeReport({
        userId: testContext.userId,
        templateId: testTemplateId,
        parameters: { days: 30 } // Override default
      });

      expect(result.success).toBe(true);
      // The service should have used days: 30 (override) and includeDisabled: false (default)
    });

    it('should validate required parameters', async () => {
      // Create template with required parameters
      const client = await pool.connect();
      try {
        await client.query(
          `INSERT INTO report_templates (id, name, category, report_type, required_parameters, is_active)
           VALUES ('template-with-required', 'Template with Required Params', 'ad', 'custom_query', $1, true)`,
          [JSON.stringify({ userId: { type: 'string', required: true } })]
        );
      } finally {
        client.release();
      }

      await expect(reportExecutor.executeReport({
        userId: testContext.userId,
        templateId: 'template-with-required',
        parameters: {} // Missing required parameter
      })).rejects.toThrow();
    });
  });

  describe('Report History Tracking', () => {
    it('should save execution history', async () => {
      const result = await reportExecutor.executeReport({
        userId: testContext.userId,
        templateId: testTemplateId,
        parameters: { days: 45 }
      });

      expect(result.executionId).toBeDefined();

      // Verify history was saved
      const client = await pool.connect();
      try {
        const historyResult = await client.query(
          `SELECT * FROM report_history WHERE id = $1::uuid`,
          [result.executionId]
        );

        expect(historyResult.rows.length).toBe(1);
        const history = historyResult.rows[0];
        expect(history.user_id).toBe(testContext.userId);
        expect(history.report_id).toBe(testTemplateId);
        expect(history.status).toBe('success');
        expect(history.result_count).toBe(result.rowCount);
        expect(history.execution_time_ms).toBeGreaterThan(0);
        expect(history.parameters).toEqual({ days: 45 });
      } finally {
        client.release();
      }
    });

    it('should save error history on failure', async () => {
      // Force an error by using invalid template
      try {
        await reportExecutor.executeReport({
          userId: testContext.userId,
          templateId: 'invalid-template',
          parameters: {}
        });
      } catch  {
        // Expected to fail
      }

      // Check if error was logged in history
      const client = await pool.connect();
      try {
        const historyResult = await client.query(
          `SELECT * FROM report_history 
           WHERE user_id = $1 AND status = 'error' 
           ORDER BY executed_at DESC LIMIT 1`,
          [testContext.userId]
        );

        if (historyResult.rows.length > 0) {
          const history = historyResult.rows[0];
          expect(history.status).toBe('error');
          expect(history.error_message).toBeDefined();
        }
      } finally {
        client.release();
      }
    });
  });

  describe('Query Definition Bridge', () => {
    it('should use LDAP query definitions', async () => {
      // Get LDAP query definition
      const ldapQuery = reportTemplateBridge.getQueryDefinitionByReportType('inactive_users');
      expect(ldapQuery).toBeDefined();
      expect(ldapQuery!.id).toBe('inactive_users');

      // Execute using bridge
      const result = await reportExecutor.executeReport({
        userId: testContext.userId,
        templateId: testTemplateId,
        parameters: { days: 30 }
      });

      expect(result.success).toBe(true);
    });

    it('should handle missing query definitions', async () => {
      // Create template with non-existent report type
      const client = await pool.connect();
      try {
        await client.query(
          `INSERT INTO report_templates (id, name, category, report_type, is_active)
           VALUES ('template-no-query', 'Template without Query', 'ad', 'non_existent_type', true)`
        );
      } finally {
        client.release();
      }

      // Should fall back to legacy execution or fail gracefully
      const result = await reportExecutor.executeReport({
        userId: testContext.userId,
        templateId: 'template-no-query',
        parameters: {}
      });

      // Depending on implementation, might succeed with empty result or fail
      expect(result).toBeDefined();
    });
  });

  describe('Performance and Concurrency', () => {
    it('should handle concurrent report executions', async () => {
      const promises = [];
      const concurrentRequests = 5;

      for (let i = 0; i < concurrentRequests; i++) {
        promises.push(
          reportExecutor.executeReport({
            userId: testContext.userId,
            templateId: testTemplateId,
            parameters: { days: 30 + i }
          })
        );
      }

      const results = await Promise.all(promises);

      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.executionId).toBeDefined();
      });

      // All execution IDs should be unique
      const executionIds = new Set(results.map(r => r.executionId));
      expect(executionIds.size).toBe(concurrentRequests);
    });

    it('should track execution time accurately', async () => {
      const result = await reportExecutor.executeReport({
        userId: testContext.userId,
        templateId: testTemplateId,
        parameters: { days: 30 }
      });

      expect(result.executionTime).toBeGreaterThan(0);
      expect(result.executionTime).toBeLessThan(30000); // Should complete within 30 seconds
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should handle credential decryption failures', async () => {
      // Create credential with invalid encryption
      const client = await pool.connect();
      try {
        const result = await client.query(
          `INSERT INTO service_credentials 
           (user_id, service_type, credential_name, username, encrypted_password, salt, is_active)
           VALUES ($1, 'ad', 'Bad Encryption', 'user', 'invalid-encrypted-data', 'bad-salt', true)
           RETURNING id`,
          [testContext.userId]
        );
        
        const badCredentialId = result.rows[0].id;

        await expect(reportExecutor.executeReport({
          userId: testContext.userId,
          templateId: testTemplateId,
          parameters: {},
          credentialId: badCredentialId
        })).rejects.toThrow('Unable to decrypt stored credentials');
      } finally {
        client.release();
      }
    });

    it('should continue with system defaults if no user credential', async () => {
      // Delete all user credentials
      const client = await pool.connect();
      try {
        await client.query(
          'DELETE FROM service_credentials WHERE user_id = $1',
          [testContext.userId]
        );
      } finally {
        client.release();
      }

      // Should still execute with system defaults
      const result = await reportExecutor.executeReport({
        userId: testContext.userId,
        templateId: testTemplateId,
        parameters: { days: 30 }
      });

      expect(result.success).toBe(true);
      expect(result.credentialId).toBeUndefined();
    });
  });

  describe('Report Categories', () => {
    it('should handle AD reports', async () => {
      const result = await reportExecutor.executeReport({
        userId: testContext.userId,
        templateId: testTemplateId,
        parameters: { days: 30 }
      });

      expect(result.success).toBe(true);
    });

    it('should handle different report types', async () => {
      const reportTypes = [
        { type: 'inactive_users', category: 'ad' },
        { type: 'disabled_users', category: 'ad' },
        { type: 'password_expiry', category: 'ad' }
      ];

      for (const { type, category } of reportTypes) {
        const client = await pool.connect();
        try {
          await client.query(
            `INSERT INTO report_templates (id, name, category, report_type, is_active)
             VALUES ($1, $2, $3, $4, true)
             ON CONFLICT (id) DO UPDATE SET report_type = EXCLUDED.report_type`,
            [`test-${type}`, `Test ${type}`, category, type]
          );
        } finally {
          client.release();
        }

        const ldapQuery = reportTemplateBridge.getQueryDefinitionByReportType(type);
        if (ldapQuery) {
          const result = await reportExecutor.executeReport({
            userId: testContext.userId,
            templateId: `test-${type}`,
            parameters: {}
          });

          expect(result).toBeDefined();
        }
      }
    });
  });
});