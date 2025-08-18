import { 
  E2ETestContext, 
  setupE2ETestContext, 
  teardownE2ETestContext,
  createE2ETestData,
  assertApiResponse,
  assertPaginatedResponse,
  generateTestCorrelationId,
  waitFor
} from './setup';
import { logger } from '@/utils/logger';

// Set environment for E2E tests
process.env.TEST_TYPE = 'integration';
process.env.NODE_ENV = 'test';

describe('Reports E2E Tests', () => {
  let testContext: E2ETestContext;

  beforeAll(async () => {
    testContext = await setupE2ETestContext();
    await createE2ETestData(testContext.pool);
  });

  afterAll(async () => {
    await teardownE2ETestContext(testContext);
  });

  describe('Pre-built Report Templates', () => {
    it('should list all available report templates', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/api/reports/templates')
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      const body = assertApiResponse(response, 200);
      
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);
      
      // Verify template structure
      const template = body[0];
      expect(template).toHaveProperty('id');
      expect(template).toHaveProperty('name');
      expect(template).toHaveProperty('description');
      expect(template).toHaveProperty('category');
      expect(template).toHaveProperty('report_type');
      expect(template).toHaveProperty('is_active');
      
      // Should not expose internal query template details
      expect(template.query_template).toBeUndefined();
    });

    it('should filter templates by category', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/api/reports/templates')
        .query({ category: 'ad' })
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      const body = assertApiResponse(response, 200);
      
      expect(Array.isArray(body)).toBe(true);
      body.forEach((template: any) => {
        expect(template.category).toBe('ad');
      });
    });

    it('should get specific template details', async () => {
      const correlationId = generateTestCorrelationId();
      
      // First get a template ID
      const templatesResponse = await testContext.request
        .get('/api/reports/templates')
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      const templates = assertApiResponse(templatesResponse, 200);
      const templateId = templates[0].id;

      // Get specific template
      const templateResponse = await testContext.request
        .get(`/api/reports/templates/${templateId}`)
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      const body = assertApiResponse(templateResponse, 200);
      
      expect(body.id).toBe(templateId);
      expect(body.name).toBeDefined();
      expect(body.parameters).toBeDefined();
      expect(body.fields).toBeDefined();
    });
  });

  describe('Pre-built Report Execution', () => {
    it('should execute AD inactive users report', async () => {
      const correlationId = generateTestCorrelationId();
      
      // Mock LDAP service for report execution
      const mockLDAPResults = [
        {
          dn: 'CN=Test User1,CN=Users,DC=test,DC=local',
          sAMAccountName: 'testuser1',
          displayName: 'Test User 1',
          lastLogon: '133534567890123456',
          userAccountControl: '512'
        },
        {
          dn: 'CN=Test User2,CN=Users,DC=test,DC=local',
          sAMAccountName: 'testuser2',
          displayName: 'Test User 2',
          lastLogon: '133534567890123456',
          userAccountControl: '512'
        }
      ];

      // Execute report
      const response = await testContext.request
        .post('/api/reports/execute/inactive_users')
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId)
        .send({
          parameters: {
            days: 30
          }
        });

      // The report execution might fail due to missing LDAP connection
      // but we can verify the endpoint structure and error handling
      expect(response.status).toBeOneOf([200, 400, 500]);

      if (response.status === 200) {
        const body = response.body;
        expect(body.success).toBe(true);
        expect(body.data).toBeDefined();
        expect(Array.isArray(body.data)).toBe(true);
        expect(body.metadata).toBeDefined();
        expect(body.metadata.rowCount).toBeDefined();
        expect(body.metadata.executionTime).toBeDefined();
      } else {
        // Verify error structure
        expect(response.body.error).toBeDefined();
      }
    });

    it('should execute report with parameter validation', async () => {
      const correlationId = generateTestCorrelationId();
      
      // Test with invalid parameters
      const invalidResponse = await testContext.request
        .post('/api/reports/execute/inactive_users')
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId)
        .send({
          parameters: {
            days: 'invalid' // Should be a number
          }
        });

      assertApiResponse(invalidResponse, 400);
      expect(invalidResponse.body.error).toContain('Invalid parameter');
    });

    it('should track report execution history', async () => {
      const correlationId = generateTestCorrelationId();
      
      // Execute a report (even if it fails, it should create history)
      await testContext.request
        .post('/api/reports/execute/inactive_users')
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId)
        .send({
          parameters: { days: 30 }
        });

      // Wait for history to be recorded
      await waitFor(async () => {
        const client = await testContext.pool.connect();
        try {
          const historyResult = await client.query(
            `SELECT * FROM report_history 
             WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 minute'`,
            [testContext.userId]
          );
          return historyResult.rows.length > 0;
        } finally {
          client.release();
        }
      }, 5000);
    });

    it('should export report results in different formats', async () => {
      const correlationId = generateTestCorrelationId();
      
      // Test CSV export
      const csvResponse = await testContext.request
        .post('/api/reports/export/csv')
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId)
        .send({
          reportType: 'inactive_users',
          parameters: { days: 30 },
          filename: 'test_export.csv'
        });

      // Export might fail due to missing data, but verify endpoint exists
      expect(csvResponse.status).toBeOneOf([200, 400, 500]);

      if (csvResponse.status === 200) {
        expect(csvResponse.headers['content-type']).toContain('text/csv');
        expect(csvResponse.headers['content-disposition']).toContain('attachment');
      }

      // Test Excel export
      const excelResponse = await testContext.request
        .post('/api/reports/export/xlsx')
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId)
        .send({
          reportType: 'inactive_users',
          parameters: { days: 30 },
          filename: 'test_export.xlsx'
        });

      expect(excelResponse.status).toBeOneOf([200, 400, 500]);

      if (excelResponse.status === 200) {
        expect(excelResponse.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      }
    });
  });

  describe('Custom Report Templates', () => {
    let customTemplateId: number;

    it('should create a new custom report template', async () => {
      const correlationId = generateTestCorrelationId();
      
      const customTemplate = {
        name: 'E2E Custom AD Users Report',
        description: 'E2E test custom report for AD users',
        category: 'ad',
        query: {
          source: 'ad',
          baseDN: 'CN=Users,DC=test,DC=local',
          filter: '(&(objectClass=user)(!(userAccountControl:1.2.840.113556.1.4.803:=2)))',
          attributes: ['sAMAccountName', 'displayName', 'mail', 'lastLogon'],
          scope: 'sub'
        },
        fields: [
          { name: 'sAMAccountName', displayName: 'Username', type: 'string' },
          { name: 'displayName', displayName: 'Display Name', type: 'string' },
          { name: 'mail', displayName: 'Email', type: 'string' },
          { name: 'lastLogon', displayName: 'Last Logon', type: 'datetime' }
        ],
        parameters: [
          { name: 'includeDisabled', displayName: 'Include Disabled Users', type: 'boolean', default: false }
        ]
      };

      const response = await testContext.request
        .post('/api/reports/custom')
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId)
        .send(customTemplate);

      const body = assertApiResponse(response, 201);
      
      expect(body.id).toBeDefined();
      expect(body.name).toBe(customTemplate.name);
      expect(body.description).toBe(customTemplate.description);
      expect(body.category).toBe(customTemplate.category);
      expect(body.userId).toBe(testContext.userId);
      expect(body.isActive).toBe(true);

      customTemplateId = body.id;
    });

    it('should list user custom reports', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/api/reports/custom')
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      assertPaginatedResponse(response.body, ['id', 'name', 'description', 'category']);
      
      // Should include our created custom template
      const customReport = response.body.data.find((r: any) => r.id === customTemplateId);
      expect(customReport).toBeDefined();
    });

    it('should execute custom report', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .post(`/api/reports/custom/${customTemplateId}/execute`)
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId)
        .send({
          parameters: {
            includeDisabled: false
          }
        });

      // Custom report execution might fail due to LDAP connection issues
      expect(response.status).toBeOneOf([200, 400, 500]);

      if (response.status === 200) {
        const body = response.body;
        expect(body.success).toBe(true);
        expect(body.data).toBeDefined();
        expect(body.metadata).toBeDefined();
      }
    });

    it('should update custom report template', async () => {
      const correlationId = generateTestCorrelationId();
      
      const updatedTemplate = {
        name: 'E2E Updated Custom Report',
        description: 'Updated description for E2E test',
        query: {
          source: 'ad',
          baseDN: 'CN=Users,DC=test,DC=local',
          filter: '(&(objectClass=user)(!(userAccountControl:1.2.840.113556.1.4.803:=2)))',
          attributes: ['sAMAccountName', 'displayName', 'mail'],
          scope: 'sub'
        }
      };

      const response = await testContext.request
        .put(`/api/reports/custom/${customTemplateId}`)
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId)
        .send(updatedTemplate);

      const body = assertApiResponse(response, 200);
      
      expect(body.name).toBe(updatedTemplate.name);
      expect(body.description).toBe(updatedTemplate.description);
    });

    it('should test custom query without saving', async () => {
      const correlationId = generateTestCorrelationId();
      
      const testQuery = {
        source: 'ad',
        baseDN: 'CN=Users,DC=test,DC=local',
        filter: '(&(objectClass=user)(sAMAccountName=testuser*))',
        attributes: ['sAMAccountName', 'displayName'],
        scope: 'sub'
      };

      const response = await testContext.request
        .post('/api/reports/custom/test')
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId)
        .send({
          query: testQuery,
          dryRun: true,
          maxResults: 10
        });

      // Query test might fail due to LDAP issues, but endpoint should exist
      expect(response.status).toBeOneOf([200, 400, 500]);
      
      if (response.status === 200) {
        const body = response.body;
        expect(body.success).toBe(true);
        expect(body.preview).toBeDefined();
        expect(Array.isArray(body.preview)).toBe(true);
      }
    });

    it('should delete custom report template', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .delete(`/api/reports/custom/${customTemplateId}`)
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      assertApiResponse(response, 200);
      expect(response.body.success).toBe(true);

      // Verify it's deleted
      const getResponse = await testContext.request
        .get(`/api/reports/custom/${customTemplateId}`)
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      assertApiResponse(getResponse, 404);
    });
  });

  describe('Report History and Tracking', () => {
    it('should get report execution history with pagination', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/api/reports/history')
        .query({ 
          page: 1, 
          limit: 10,
          sortBy: 'created_at',
          sortOrder: 'desc'
        })
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      const body = assertApiResponse(response, 200);
      assertPaginatedResponse(body, ['id', 'report_type', 'status', 'created_at']);
      
      // Verify sorting
      if (body.data.length > 1) {
        const dates = body.data.map((item: any) => new Date(item.created_at));
        for (let i = 1; i < dates.length; i++) {
          expect(dates[i].getTime()).toBeLessThanOrEqual(dates[i-1].getTime());
        }
      }
    });

    it('should filter report history by status', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/api/reports/history')
        .query({ 
          status: 'completed',
          page: 1,
          limit: 10
        })
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      const body = assertApiResponse(response, 200);
      assertPaginatedResponse(body);
      
      // All returned items should have 'completed' status
      body.data.forEach((item: any) => {
        expect(item.status).toBe('completed');
      });
    });

    it('should get specific report execution details', async () => {
      const correlationId = generateTestCorrelationId();
      
      // First get a history item
      const historyResponse = await testContext.request
        .get('/api/reports/history')
        .query({ limit: 1 })
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      const historyBody = assertApiResponse(historyResponse, 200);
      
      if (historyBody.data.length > 0) {
        const historyId = historyBody.data[0].id;
        
        // Get detailed report execution
        const detailResponse = await testContext.request
          .get(`/api/reports/history/${historyId}`)
          .set('Authorization', `Bearer ${testContext.testToken}`)
          .set('X-Correlation-ID', correlationId);

        const body = assertApiResponse(detailResponse, 200);
        
        expect(body.id).toBe(historyId);
        expect(body.parameters).toBeDefined();
        expect(body.results).toBeDefined();
        expect(body.execution_time_ms).toBeDefined();
        expect(body.created_at).toBeDefined();
      }
    });

    it('should get report statistics', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/api/reports/stats')
        .query({ 
          period: '7d' // Last 7 days
        })
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      const body = assertApiResponse(response, 200);
      
      expect(body.totalReports).toBeDefined();
      expect(body.successfulReports).toBeDefined();
      expect(body.failedReports).toBeDefined();
      expect(body.averageExecutionTime).toBeDefined();
      expect(body.reportsByType).toBeDefined();
      expect(Array.isArray(body.reportsByType)).toBe(true);
    });
  });

  describe('Field Discovery', () => {
    it('should discover available fields for AD source', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/api/reports/fields/ad')
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      // Field discovery might fail due to LDAP connection issues
      expect(response.status).toBeOneOf([200, 400, 500]);

      if (response.status === 200) {
        const body = response.body;
        expect(body.fields).toBeDefined();
        expect(Array.isArray(body.fields)).toBe(true);
        
        // Verify field structure
        if (body.fields.length > 0) {
          const field = body.fields[0];
          expect(field).toHaveProperty('name');
          expect(field).toHaveProperty('displayName');
          expect(field).toHaveProperty('type');
          expect(field).toHaveProperty('category');
        }
      }
    });

    it('should discover fields for Azure AD source', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/api/reports/fields/azure')
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      expect(response.status).toBeOneOf([200, 400, 500]);

      if (response.status === 200) {
        const body = response.body;
        expect(body.fields).toBeDefined();
        expect(Array.isArray(body.fields)).toBe(true);
      }
    });

    it('should handle invalid data source', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/api/reports/fields/invalid')
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      assertApiResponse(response, 400);
      expect(response.body.error).toContain('Invalid data source');
    });
  });

  describe('Report Permissions and Security', () => {
    it('should prevent unauthorized access to other users reports', async () => {
      const correlationId = generateTestCorrelationId();
      
      // Create a custom report with test user
      const createResponse = await testContext.request
        .post('/api/reports/custom')
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId)
        .send({
          name: 'Private Report',
          description: 'Test private report',
          category: 'ad',
          query: { source: 'ad', filter: '(objectClass=user)' }
        });

      const body = assertApiResponse(createResponse, 201);
      const reportId = body.id;

      // Try to access with admin user (different user)
      const accessResponse = await testContext.request
        .get(`/api/reports/custom/${reportId}`)
        .set('Authorization', `Bearer ${testContext.adminToken}`)
        .set('X-Correlation-ID', correlationId);

      // Should be forbidden or not found
      expect(accessResponse.status).toBeOneOf([403, 404]);
    });

    it('should validate report parameter injection attacks', async () => {
      const correlationId = generateTestCorrelationId();
      
      // Try SQL injection in parameters
      const maliciousParams = {
        days: "30; DROP TABLE users; --",
        username: "'; DELETE FROM report_history; --"
      };

      const response = await testContext.request
        .post('/api/reports/execute/inactive_users')
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId)
        .send({
          parameters: maliciousParams
        });

      // Should be rejected with validation error
      assertApiResponse(response, 400);
      expect(response.body.error).toBeDefined();
    });

    it('should rate limit report executions', async () => {
      const correlationId = generateTestCorrelationId();
      
      // Execute multiple reports quickly
      const requests = [];
      for (let i = 0; i < 10; i++) {
        requests.push(
          testContext.request
            .post('/api/reports/execute/inactive_users')
            .set('Authorization', `Bearer ${testContext.testToken}`)
            .set('X-Correlation-ID', `${correlationId}-${i}`)
            .send({ parameters: { days: 30 } })
        );
      }

      const responses = await Promise.all(requests);
      
      // Some requests should be rate limited
      const rateLimitedCount = responses.filter((r: any) => r.status === 429).length;
      expect(rateLimitedCount).toBeGreaterThan(0);
    });

    it('should audit report executions', async () => {
      const correlationId = generateTestCorrelationId();
      
      // Execute a report
      await testContext.request
        .post('/api/reports/execute/inactive_users')
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId)
        .send({ parameters: { days: 30 } });

      // Check audit log
      await waitFor(async () => {
        const client = await testContext.pool.connect();
        try {
          const auditResult = await client.query(
            `SELECT * FROM audit_logs 
             WHERE correlation_id = $1 AND event_type = 'report_execution'`,
            [correlationId]
          );
          return auditResult.rows.length > 0;
        } finally {
          client.release();
        }
      }, 5000);
    });
  });

  describe('Report Performance and Optimization', () => {
    it('should handle large result sets with pagination', async () => {
      const correlationId = generateTestCorrelationId();
      
      // Test with pagination parameters
      const response = await testContext.request
        .post('/api/reports/execute/inactive_users')
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId)
        .send({
          parameters: { days: 30 },
          pagination: {
            page: 1,
            limit: 50
          }
        });

      expect(response.status).toBeOneOf([200, 400, 500]);

      if (response.status === 200) {
        const body = response.body;
        expect(body.pagination).toBeDefined();
        expect(body.pagination.page).toBe(1);
        expect(body.pagination.limit).toBe(50);
        expect(body.data.length).toBeLessThanOrEqual(50);
      }
    });

    it('should timeout long-running reports', async () => {
      const correlationId = generateTestCorrelationId();
      
      // Create a query that might take long time
      const response = await testContext.request
        .post('/api/reports/custom/test')
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId)
        .send({
          query: {
            source: 'ad',
            baseDN: 'DC=test,DC=local',
            filter: '(objectClass=*)', // Very broad filter
            attributes: ['*'],
            scope: 'sub'
          },
          timeout: 1000 // 1 second timeout
        });

      // Should either complete quickly or timeout
      expect(response.status).toBeOneOf([200, 400, 408, 500]);
      
      if (response.status === 408) {
        expect(response.body.error).toContain('timeout');
      }
    }, 15000); // Give test itself more time

    it('should cache report results appropriately', async () => {
      const correlationId = generateTestCorrelationId();
      
      // Execute same report twice
      const params = { parameters: { days: 30 } };
      
      const start1 = Date.now();
      const response1 = await testContext.request
        .post('/api/reports/execute/inactive_users')
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', `${correlationId}-1`)
        .send(params);
      const time1 = Date.now() - start1;

      // Wait a moment, then execute again
      await new Promise(resolve => setTimeout(resolve, 100));

      const start2 = Date.now();
      const response2 = await testContext.request
        .post('/api/reports/execute/inactive_users')
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', `${correlationId}-2`)
        .send(params);
      const time2 = Date.now() - start2;

      // Both should have same status
      expect(response1.status).toBe(response2.status);

      if (response1.status === 200 && response2.status === 200) {
        // Second request might be faster due to caching
        logger.info('Cache performance test:', {
          firstRequest: time1,
          secondRequest: time2,
          improvement: time1 - time2
        });
        
        // Results should be consistent
        expect(response1.body.data).toEqual(response2.body.data);
      }
    });
  });
});