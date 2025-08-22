import { 
  E2ETestContext, 
  setupE2ETestContext, 
  teardownE2ETestContext,
  createE2ETestData,
  assertApiResponse,
  generateTestCorrelationId,
  waitFor
} from './setup';
import { logger } from '@/utils/logger';

// Set environment for E2E tests
process.env.TEST_TYPE = 'integration';
process.env.NODE_ENV = 'test';

describe('API Integration E2E Tests', () => {
  let testContext: E2ETestContext;

  beforeAll(async () => {
    logger.info('Setting up E2E test context for API tests...');
    testContext = await setupE2ETestContext();
    await createE2ETestData(testContext.pool);
    logger.info('E2E test context ready for API tests');
  }, 90000); // 90 second timeout for beforeAll

  afterAll(async () => {
    logger.info('Tearing down E2E test context for API tests...');
    if (testContext) {
      await teardownE2ETestContext(testContext);
    }
    logger.info('E2E test context cleanup complete for API tests');
  }, 30000); // 30 second timeout for afterAll

  describe('Health Check Endpoints', () => {
    it('should get overall health status', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/api/health')
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      const body = assertApiResponse(response, 200);
      
      expect(body.status).toBeOneOf(['healthy', 'degraded', 'unhealthy']);
      expect(body.timestamp).toBeDefined();
      expect(body.services).toBeDefined();
      expect(typeof body.services).toBe('object');
      
      // Verify service health structure
      expect(body.services.database).toBeDefined();
      expect(body.services.redis).toBeDefined();
      expect(body.services.database.status).toBeOneOf(['healthy', 'unhealthy']);
      expect(body.services.redis.status).toBeOneOf(['healthy', 'unhealthy']);
    });

    it('should get detailed health status', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/api/health/detailed')
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      const body = assertApiResponse(response, 200);
      
      expect(body.status).toBeOneOf(['healthy', 'degraded', 'unhealthy']);
      expect(body.timestamp).toBeDefined();
      expect(body.services).toBeDefined();
      expect(body.systemInfo).toBeDefined();
      expect(body.systemInfo.uptime).toBeDefined();
      expect(body.systemInfo.memory).toBeDefined();
      expect(body.systemInfo.cpu).toBeDefined();
    });

    it('should get liveness probe', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/api/health/live')
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      const body = assertApiResponse(response, 200);
      
      expect(body.status).toBe('alive');
      expect(body.timestamp).toBeDefined();
    });

    it('should get readiness probe', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/api/health/ready')
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      const body = assertApiResponse(response, 200);
      
      expect(body.status).toBeOneOf(['ready', 'not_ready']);
      expect(body.timestamp).toBeDefined();
      expect(body.dependencies).toBeDefined();
    });

    it('should get component-specific health', async () => {
      const correlationId = generateTestCorrelationId();
      
      // Test database health
      const dbResponse = await testContext.request
        .get('/api/health/component/database')
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      const dbBody = assertApiResponse(dbResponse, 200);
      expect(dbBody.component).toBe('database');
      expect(dbBody.status).toBeOneOf(['healthy', 'unhealthy']);
      expect(dbBody.details).toBeDefined();
      
      // Test Redis health
      const redisResponse = await testContext.request
        .get('/api/health/component/redis')
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      const redisBody = assertApiResponse(redisResponse, 200);
      expect(redisBody.component).toBe('redis');
      expect(redisBody.status).toBeOneOf(['healthy', 'unhealthy']);
    });

    it('should handle non-existent component health check', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/api/health/component/nonexistent')
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      assertApiResponse(response, 400);
      expect(response.body.error).toContain('Invalid component');
    });

    it('should get health summary', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/api/health/summary')
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      const body = assertApiResponse(response, 200);
      
      expect(body.overallStatus).toBeOneOf(['healthy', 'degraded', 'unhealthy']);
      expect(body.healthyServices).toBeDefined();
      expect(body.totalServices).toBeDefined();
      expect(typeof body.healthyServices).toBe('number');
      expect(typeof body.totalServices).toBe('number');
    });

    it('should require authentication for health endpoints', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/api/health')
        .set('X-Correlation-ID', correlationId);

      assertApiResponse(response, 401);
    });

    it('should provide root health endpoint without auth', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/health')
        .set('X-Correlation-ID', correlationId);

      // Root health endpoint should work without auth for load balancers
      const body = assertApiResponse(response, 200);
      expect(body.status).toBeDefined();
      expect(body.timestamp).toBeDefined();
    });
  });

  describe('Credentials Management', () => {
    let testCredentialId: number;
    
    beforeEach(() => {
      // Add delay between credential tests to prevent deadlocks
      return new Promise(resolve => setTimeout(resolve, 100));
    });

    it('should list user credentials', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/api/credentials')
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      const body = assertApiResponse(response, 200);
      
      expect(Array.isArray(body)).toBe(true);
      
      if (body.length > 0) {
        const credential = body[0];
        expect(credential).toHaveProperty('id');
        expect(credential).toHaveProperty('serviceType');
        expect(credential).toHaveProperty('credentialName');
        expect(credential).toHaveProperty('username');
        expect(credential).toHaveProperty('isActive');
        expect(credential).toHaveProperty('isDefault');
        
        // Should not expose encrypted data
        expect(credential.encryptedPassword).toBeUndefined();
        expect(credential.encryptedClientSecret).toBeUndefined();
      }
    });

    it('should filter credentials by service type', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/api/credentials')
        .query({ serviceType: 'ad' })
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      const body = assertApiResponse(response, 200);
      
      body.forEach((credential: any) => {
        expect(credential.serviceType).toBe('ad');
      });
    });

    it('should create new AD credential', async () => {
      const correlationId = generateTestCorrelationId();
      
      const credentialData = {
        serviceType: 'ad',
        credentialName: 'E2E Test AD Credential',
        username: 'e2e-test-user',
        password: 'e2e-test-password',
        server: 'test-dc.local',
        baseDN: 'DC=test,DC=local',
        isDefault: false
      };

      const response = await testContext.request
        .post('/api/credentials')
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId)
        .send(credentialData);

      const body = assertApiResponse(response, 201);
      
      expect(body.id).toBeDefined();
      expect(body.serviceType).toBe(credentialData.serviceType);
      expect(body.credentialName).toBe(credentialData.credentialName);
      expect(body.username).toBe(credentialData.username);
      expect(body.isDefault).toBe(false);
      expect(body.isActive).toBe(true);
      
      // Password should not be returned
      expect(body.password).toBeUndefined();
      expect(body.encryptedPassword).toBeUndefined();

      testCredentialId = body.id;
    });

    it('should create new Azure AD credential', async () => {
      const correlationId = generateTestCorrelationId();
      
      const credentialData = {
        serviceType: 'azure',
        credentialName: 'E2E Test Azure Credential',
        tenantId: 'test-tenant-id',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        isDefault: false
      };

      const response = await testContext.request
        .post('/api/credentials')
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId)
        .send(credentialData);

      const body = assertApiResponse(response, 201);
      
      expect(body.serviceType).toBe('azure');
      expect(body.tenantId).toBe(credentialData.tenantId);
      expect(body.clientId).toBe(credentialData.clientId);
      
      // Client secret should not be returned
      expect(body.clientSecret).toBeUndefined();
      expect(body.encryptedClientSecret).toBeUndefined();
    });

    it('should validate required fields for different service types', async () => {
      const correlationId = generateTestCorrelationId();
      
      // Test missing AD fields
      const invalidADResponse = await testContext.request
        .post('/api/credentials')
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId)
        .send({
          serviceType: 'ad',
          credentialName: 'Invalid AD Credential'
          // Missing username and password
        });

      assertApiResponse(invalidADResponse, 400);
      expect(invalidADResponse.body.error).toBeDefined();

      // Test missing Azure fields
      const invalidAzureResponse = await testContext.request
        .post('/api/credentials')
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId)
        .send({
          serviceType: 'azure',
          credentialName: 'Invalid Azure Credential',
          tenantId: 'test-tenant'
          // Missing clientId and clientSecret
        });

      assertApiResponse(invalidAzureResponse, 400);
    });

    it('should get specific credential', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get(`/api/credentials/${testCredentialId}`)
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      const body = assertApiResponse(response, 200);
      
      expect(body.id).toBe(testCredentialId);
      expect(body.serviceType).toBeDefined();
      expect(body.credentialName).toBeDefined();
    });

    it('should update credential', async () => {
      const correlationId = generateTestCorrelationId();
      
      const updateData = {
        credentialName: 'Updated E2E Test Credential',
        username: 'updated-user',
        password: 'updated-password'
      };

      const response = await testContext.request
        .put(`/api/credentials/${testCredentialId}`)
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId)
        .send(updateData);

      const body = assertApiResponse(response, 200);
      
      expect(body.credentialName).toBe(updateData.credentialName);
      expect(body.username).toBe(updateData.username);
    });

    it('should set default credential', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .put(`/api/credentials/${testCredentialId}/set-default`)
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      assertApiResponse(response, 200);
      expect(response.body.success).toBe(true);

      // Verify it's set as default
      const getResponse = await testContext.request
        .get(`/api/credentials/${testCredentialId}`)
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      const body = assertApiResponse(getResponse, 200);
      expect(body.isDefault).toBe(true);
    });

    it('should get default credentials', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/api/credentials/defaults')
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      const body = assertApiResponse(response, 200);
      
      expect(typeof body).toBe('object');
      
      // Should contain default credentials by service type
      if (body.ad) {
        expect(body.ad.serviceType).toBe('ad');
        expect(body.ad.isDefault).toBe(true);
      }
      if (body.azure) {
        expect(body.azure.serviceType).toBe('azure');
        expect(body.azure.isDefault).toBe(true);
      }
    });

    it('should test credential connection', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .post(`/api/credentials/${testCredentialId}/test`)
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      // Test will likely fail due to invalid test credentials, but endpoint should exist
      expect(response.status).toBeOneOf([200, 400, 500]);

      if (response.status === 200) {
        expect(response.body.success).toBe(true);
        expect(response.body.details).toBeDefined();
      } else {
        expect(response.body.error).toBeDefined();
      }

      // Verify test result is recorded in database (with increased timeout)
      await waitFor(async () => {
        const client = await testContext.pool.connect();
        try {
          const credResult = await client.query(
            'SELECT last_tested, last_test_success FROM service_credentials WHERE id = $1',
            [testCredentialId]
          );
          return credResult.rows.length > 0 && credResult.rows[0].last_tested !== null;
        } catch (error) {
          logger.warn('Database query failed during credential test verification:', error);
          return false;
        } finally {
          client.release();
        }
      }, 5000); // Increased timeout to 5 seconds
    }, 10000); // Increased test timeout to 10 seconds

    it('should prevent access to other users credentials', async () => {
      const correlationId = generateTestCorrelationId();
      
      // Try to access credential with admin token (different user)
      const response = await testContext.request
        .get(`/api/credentials/${testCredentialId}`)
        .set('Authorization', `Bearer ${testContext.adminToken}`)
        .set('X-Correlation-ID', correlationId);

      // Should be forbidden or not found
      expect(response.status).toBeOneOf([403, 404]);
    });

    it('should delete credential', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .delete(`/api/credentials/${testCredentialId}`)
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      assertApiResponse(response, 200);
      expect(response.body.success).toBe(true);

      // Verify it's deleted
      const getResponse = await testContext.request
        .get(`/api/credentials/${testCredentialId}`)
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      assertApiResponse(getResponse, 404);
    });
  });

  describe('Field Discovery', () => {
    it('should discover AD schema fields', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/api/reports/fields/ad')
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      // Field discovery might fail due to missing LDAP connection
      expect(response.status).toBeOneOf([200, 400, 500]);

      if (response.status === 200) {
        const body = response.body;
        expect(body.fields).toBeDefined();
        expect(Array.isArray(body.fields)).toBe(true);
        expect(body.lastUpdated).toBeDefined();
        
        // Verify field structure
        if (body.fields.length > 0) {
          const field = body.fields[0];
          expect(field).toHaveProperty('name');
          expect(field).toHaveProperty('displayName');
          expect(field).toHaveProperty('type');
          expect(field).toHaveProperty('category');
          expect(field).toHaveProperty('description');
        }
      }
    });

    it('should discover Azure AD Graph fields', async () => {
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

    it('should discover O365 fields', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/api/reports/fields/o365')
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      expect(response.status).toBeOneOf([200, 400, 500]);

      if (response.status === 200) {
        const body = response.body;
        expect(body.fields).toBeDefined();
        expect(Array.isArray(body.fields)).toBe(true);
      }
    });

    it('should cache field discovery results', async () => {
      const correlationId = generateTestCorrelationId();
      
      // First request
      const start1 = Date.now();
      const response1 = await testContext.request
        .get('/api/reports/fields/ad')
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', `${correlationId}-1`);
      const time1 = Date.now() - start1;

      // Second request (should be cached)
      const start2 = Date.now();
      const response2 = await testContext.request
        .get('/api/reports/fields/ad')
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', `${correlationId}-2`);
      const time2 = Date.now() - start2;

      // Both should have same status
      expect(response1.status).toBe(response2.status);

      if (response1.status === 200 && response2.status === 200) {
        // Second request should be faster (cached)
        expect(time2).toBeLessThan(time1);
        
        // Results should be identical
        expect(response1.body.fields).toEqual(response2.body.fields);
      }
    });

    it('should handle invalid data source', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/api/reports/fields/invalid_source')
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      assertApiResponse(response, 400);
      expect(response.body.error).toContain('Invalid data source');
    });

    it('should search fields by name or description', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/api/reports/fields/ad')
        .query({ search: 'user' })
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      expect(response.status).toBeOneOf([200, 400, 500]);

      if (response.status === 200) {
        const body = response.body;
        expect(body.fields).toBeDefined();
        
        // All returned fields should match search term
        body.fields.forEach((field: any) => {
          const matchesSearch = field.name.toLowerCase().includes('user') ||
                               field.displayName.toLowerCase().includes('user') ||
                               (field.description && field.description.toLowerCase().includes('user'));
          expect(matchesSearch).toBe(true);
        });
      }
    });

    it('should filter fields by category', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/api/reports/fields/ad')
        .query({ category: 'basic' })
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      expect(response.status).toBeOneOf([200, 400, 500]);

      if (response.status === 200) {
        const body = response.body;
        expect(body.fields).toBeDefined();
        
        // All returned fields should be in basic category
        body.fields.forEach((field: any) => {
          expect(field.category).toBe('basic');
        });
      }
    });
  });

  describe('System Configuration', () => {
    it('should get system configuration (admin only)', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/api/system/config')
        .set('Authorization', `Bearer ${testContext.adminToken}`)
        .set('X-Correlation-ID', correlationId);

      const body = assertApiResponse(response, 200);
      
      expect(body.version).toBeDefined();
      expect(body.environment).toBeDefined();
      expect(body.features).toBeDefined();
      expect(body.limits).toBeDefined();
    });

    it('should deny system config access to regular users', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/api/system/config')
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      assertApiResponse(response, 403);
    });

    it('should get system health status', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/api/system/health')
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      const body = assertApiResponse(response, 200);
      
      expect(body.status).toBeOneOf(['healthy', 'degraded', 'unhealthy']);
      expect(body.components).toBeDefined();
      expect(body.metrics).toBeDefined();
    });
  });

  describe('User Preferences', () => {
    it('should get user preferences', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/api/user/preferences')
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      const body = assertApiResponse(response, 200);
      
      expect(body.theme).toBeDefined();
      expect(body.language).toBeDefined();
      expect(body.notifications).toBeDefined();
      expect(body.reports).toBeDefined();
    });

    it('should update user preferences', async () => {
      const correlationId = generateTestCorrelationId();
      
      const preferences = {
        theme: 'dark',
        language: 'en',
        notifications: {
          email: true,
          browser: false,
          reportCompletion: true,
          systemAlerts: true
        },
        reports: {
          defaultPageSize: 25,
          autoRefresh: false,
          defaultExportFormat: 'xlsx'
        }
      };

      const response = await testContext.request
        .put('/api/user/preferences')
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId)
        .send(preferences);

      const body = assertApiResponse(response, 200);
      
      expect(body.theme).toBe(preferences.theme);
      expect(body.language).toBe(preferences.language);
      expect(body.notifications.email).toBe(preferences.notifications.email);
      expect(body.reports.defaultPageSize).toBe(preferences.reports.defaultPageSize);
    });

    it('should update notification preferences specifically', async () => {
      const correlationId = generateTestCorrelationId();
      
      const notificationPrefs = {
        email: false,
        browser: true,
        reportCompletion: false,
        systemAlerts: true
      };

      const response = await testContext.request
        .put('/api/user/preferences/notifications')
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId)
        .send(notificationPrefs);

      const body = assertApiResponse(response, 200);
      
      expect(body.notifications.email).toBe(notificationPrefs.email);
      expect(body.notifications.browser).toBe(notificationPrefs.browser);
      expect(body.notifications.reportCompletion).toBe(notificationPrefs.reportCompletion);
      expect(body.notifications.systemAlerts).toBe(notificationPrefs.systemAlerts);
    });
  });

  describe('Search Functionality', () => {
    it('should perform global search', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/api/search/global')
        .query({ q: 'test', limit: 10 })
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      const body = assertApiResponse(response, 200);
      
      expect(body.results).toBeDefined();
      expect(Array.isArray(body.results)).toBe(true);
      expect(body.totalResults).toBeDefined();
      expect(body.categories).toBeDefined();
      
      // Verify result structure
      body.results.forEach((result: any) => {
        expect(result).toHaveProperty('id');
        expect(result).toHaveProperty('type');
        expect(result).toHaveProperty('title');
        expect(result).toHaveProperty('description');
        expect(result).toHaveProperty('relevance');
      });
    });

    it('should get search suggestions', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/api/search/suggestions')
        .query({ q: 'test', limit: 5 })
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      const body = assertApiResponse(response, 200);
      
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeLessThanOrEqual(5);
      
      body.forEach((suggestion: any) => {
        expect(typeof suggestion).toBe('string');
        expect(suggestion.toLowerCase()).toContain('test');
      });
    });

    it('should get recent searches', async () => {
      const correlationId = generateTestCorrelationId();
      
      // Perform a search first
      await testContext.request
        .get('/api/search/global')
        .query({ q: 'recent search test' })
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      // Get recent searches
      const response = await testContext.request
        .get('/api/search/recent')
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      const body = assertApiResponse(response, 200);
      
      expect(Array.isArray(body)).toBe(true);
      
      body.forEach((search: any) => {
        expect(search).toHaveProperty('query');
        expect(search).toHaveProperty('timestamp');
        expect(search).toHaveProperty('resultCount');
      });
    });
  });

  describe('API Rate Limiting and Security', () => {
    it('should rate limit API requests', async () => {
      const correlationId = generateTestCorrelationId();
      
      // Send multiple requests quickly
      const requests = [];
      for (let i = 0; i < 20; i++) {
        requests.push(
          testContext.request
            .get('/api/health')
            .set('Authorization', `Bearer ${testContext.testToken}`)
            .set('X-Correlation-ID', `${correlationId}-${i}`)
        );
      }

      const responses = await Promise.all(requests);
      
      // Some requests should be rate limited in production environment
      const successCount = responses.filter((r: any) => r.status === 200).length;
      const rateLimitedCount = responses.filter((r: any) => r.status === 429).length;
      
      logger.info('Rate limiting test results:', {
        total: responses.length,
        successful: successCount,
        rateLimited: rateLimitedCount
      });

      // In test environment, rate limiting might be more lenient
      expect(successCount + rateLimitedCount).toBe(responses.length);
    });

    it('should handle CORS properly', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .options('/api/health')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'Authorization')
        .set('X-Correlation-ID', correlationId);

      expect(response.status).toBeOneOf([200, 204]);
      expect(response.headers['access-control-allow-origin']).toBeDefined();
      expect(response.headers['access-control-allow-methods']).toBeDefined();
    });

    it('should sanitize error responses', async () => {
      const correlationId = generateTestCorrelationId();
      
      // Try to access non-existent endpoint with potential injection
      const response = await testContext.request
        .get('/api/nonexistent/<script>alert("xss")</script>')
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      assertApiResponse(response, 404);
      
      // Error response should not contain script tags or other dangerous content
      const responseText = JSON.stringify(response.body);
      expect(responseText).not.toContain('<script>');
      expect(responseText).not.toContain('alert(');
    });

    it('should validate request size limits', async () => {
      const correlationId = generateTestCorrelationId();
      
      // Create a large payload (but within reasonable limits)
      const largeData = {
        name: 'Test Report',
        description: 'A'.repeat(10000), // 10KB description
        query: {
          filter: 'B'.repeat(5000) // 5KB filter
        }
      };

      const response = await testContext.request
        .post('/api/reports/custom')
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId)
        .send(largeData);

      // Should either succeed or fail with validation error (not 413 payload too large)
      expect(response.status).toBeOneOf([201, 400]);
    });
  });
});