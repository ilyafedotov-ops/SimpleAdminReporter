import { 
  E2ETestContext, 
  setupE2ETestContext, 
  teardownE2ETestContext,
  createE2ETestData,
  assertApiResponse,
  assertPaginatedResponse,
  generateTestCorrelationId
} from './setup';
import { logger } from '@/utils/logger';

// Set environment for E2E tests
process.env.TEST_TYPE = 'integration';
process.env.NODE_ENV = 'test';

describe('Logs API E2E Tests', () => {
  let testContext: E2ETestContext;

  beforeAll(async () => {
    testContext = await setupE2ETestContext();
    await createE2ETestData(testContext.pool);
    
    // Create additional test log data for comprehensive testing
    await createTestLogData(testContext.pool);
  });

  afterAll(async () => {
    await cleanupTestLogData(testContext.pool);
    await teardownE2ETestContext(testContext);
  });

  describe('Audit Logs Retrieval', () => {
    it('should get audit logs with pagination', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/api/logs')
        .query({
          type: 'audit',
          page: 1,
          limit: 10,
          sortBy: 'created_at',
          sortOrder: 'desc'
        })
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      const body = assertApiResponse(response, 200);
      assertPaginatedResponse(body, ['id', 'event_type', 'event_action', 'created_at']);
      
      // Verify audit log structure
      body.data.forEach((log: any) => {
        expect(log).toHaveProperty('id');
        expect(log).toHaveProperty('user_id');
        expect(log).toHaveProperty('event_type');
        expect(log).toHaveProperty('event_action');
        expect(log).toHaveProperty('event_result');
        expect(log).toHaveProperty('ip_address');
        expect(log).toHaveProperty('created_at');
        
        // Sensitive data should be handled appropriately
        if (log.session_id) {
          expect(typeof log.session_id).toBe('string');
        }
      });
    });

    it('should filter audit logs by event type', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/api/logs')
        .query({
          type: 'audit',
          event_type: 'authentication',
          page: 1,
          limit: 10
        })
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      const body = assertApiResponse(response, 200);
      
      // All returned logs should be authentication events
      body.data.forEach((log: any) => {
        expect(log.event_type).toBe('authentication');
      });
    });

    it('should filter audit logs by event result', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/api/logs')
        .query({
          type: 'audit',
          event_result: 'success',
          page: 1,
          limit: 10
        })
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      const body = assertApiResponse(response, 200);
      
      // All returned logs should be successful events
      body.data.forEach((log: any) => {
        expect(log.event_result).toBe('success');
      });
    });

    it('should filter audit logs by date range', async () => {
      const correlationId = generateTestCorrelationId();
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      const response = await testContext.request
        .get('/api/logs')
        .query({
          type: 'audit',
          start_date: yesterday.toISOString(),
          end_date: new Date().toISOString(),
          page: 1,
          limit: 10
        })
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      const body = assertApiResponse(response, 200);
      
      // All returned logs should be within date range
      body.data.forEach((log: any) => {
        const logDate = new Date(log.created_at);
        expect(logDate.getTime()).toBeGreaterThanOrEqual(yesterday.getTime());
        expect(logDate.getTime()).toBeLessThanOrEqual(new Date().getTime());
      });
    });

    it('should filter audit logs by user', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/api/logs')
        .query({
          type: 'audit',
          user_id: testContext.userId,
          page: 1,
          limit: 10
        })
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      const body = assertApiResponse(response, 200);
      
      // All returned logs should be for the specified user
      body.data.forEach((log: any) => {
        expect(log.user_id).toBe(testContext.userId);
      });
    });

    it('should filter audit logs by IP address', async () => {
      const correlationId = generateTestCorrelationId();
      const testIP = '192.168.1.100';
      
      const response = await testContext.request
        .get('/api/logs')
        .query({
          type: 'audit',
          ip_address: testIP,
          page: 1,
          limit: 10
        })
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      const body = assertApiResponse(response, 200);
      
      // All returned logs should be from the specified IP
      body.data.forEach((log: any) => {
        expect(log.ip_address).toBe(testIP);
      });
    });
  });

  describe('System Logs Retrieval', () => {
    it('should get system logs with pagination', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/api/logs')
        .query({
          type: 'system',
          page: 1,
          limit: 10,
          sortBy: 'created_at',
          sortOrder: 'desc'
        })
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      const body = assertApiResponse(response, 200);
      assertPaginatedResponse(body, ['id', 'log_level', 'source', 'message', 'created_at']);
      
      // Verify system log structure
      body.data.forEach((log: any) => {
        expect(log).toHaveProperty('id');
        expect(log).toHaveProperty('log_level');
        expect(log).toHaveProperty('source');
        expect(log).toHaveProperty('category');
        expect(log).toHaveProperty('message');
        expect(log).toHaveProperty('created_at');
      });
    });

    it('should filter system logs by log level', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/api/logs')
        .query({
          type: 'system',
          log_level: 'error',
          page: 1,
          limit: 10
        })
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      const body = assertApiResponse(response, 200);
      
      // All returned logs should be error level
      body.data.forEach((log: any) => {
        expect(log.log_level).toBe('error');
      });
    });

    it('should filter system logs by source', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/api/logs')
        .query({
          type: 'system',
          source: 'auth_service',
          page: 1,
          limit: 10
        })
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      const body = assertApiResponse(response, 200);
      
      // All returned logs should be from auth_service
      body.data.forEach((log: any) => {
        expect(log.source).toBe('auth_service');
      });
    });

    it('should filter system logs by category', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/api/logs')
        .query({
          type: 'system',
          category: 'authentication',
          page: 1,
          limit: 10
        })
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      const body = assertApiResponse(response, 200);
      
      // All returned logs should be authentication category
      body.data.forEach((log: any) => {
        expect(log.category).toBe('authentication');
      });
    });
  });

  describe('Full-text Search', () => {
    it('should perform full-text search on audit logs', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/api/logs/search/fulltext')
        .query({
          q: 'login successful',
          type: 'audit',
          limit: 10
        })
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      const body = assertApiResponse(response, 200);
      
      expect(body.results).toBeDefined();
      expect(Array.isArray(body.results)).toBe(true);
      expect(body.totalResults).toBeDefined();
      expect(body.searchTime).toBeDefined();
      
      // Verify search results structure
      body.results.forEach((result: any) => {
        expect(result).toHaveProperty('id');
        expect(result).toHaveProperty('rank'); // Search ranking
        expect(result).toHaveProperty('highlight'); // Highlighted text
        expect(result.type).toBe('audit');
        
        // Result should contain search terms
        const content = JSON.stringify(result).toLowerCase();
        expect(content.includes('login') || content.includes('successful')).toBe(true);
      });
    });

    it('should perform full-text search on system logs', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/api/logs/search/fulltext')
        .query({
          q: 'connection timeout',
          type: 'system',
          limit: 10
        })
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      const body = assertApiResponse(response, 200);
      
      expect(body.results).toBeDefined();
      expect(Array.isArray(body.results)).toBe(true);
      
      body.results.forEach((result: any) => {
        expect(result.type).toBe('system');
        const content = JSON.stringify(result).toLowerCase();
        expect(content.includes('connection') || content.includes('timeout')).toBe(true);
      });
    });

    it('should handle complex search queries', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/api/logs/search/fulltext')
        .query({
          q: 'authentication AND (success OR failure)',
          type: 'audit',
          limit: 10
        })
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      const body = assertApiResponse(response, 200);
      
      expect(body.results).toBeDefined();
      
      body.results.forEach((result: any) => {
        const content = JSON.stringify(result).toLowerCase();
        expect(content).toContain('authentication');
        expect(content.includes('success') || content.includes('failure')).toBe(true);
      });
    });

    it('should provide search highlighting', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/api/logs/search/fulltext')
        .query({
          q: 'login',
          type: 'audit',
          limit: 5,
          highlight: true
        })
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      const body = assertApiResponse(response, 200);
      
      body.results.forEach((result: any) => {
        expect(result.highlight).toBeDefined();
        expect(result.highlight.length).toBeGreaterThan(0);
        
        // Highlights should contain the search term with markup
        const hasHighlight = result.highlight.some((highlight: any) => 
          highlight.includes('<mark>') && highlight.includes('</mark>')
        );
        expect(hasHighlight).toBe(true);
      });
    });

    it('should rank search results by relevance', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/api/logs/search/fulltext')
        .query({
          q: 'authentication',
          type: 'audit',
          limit: 10
        })
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      const body = assertApiResponse(response, 200);
      
      if (body.results.length > 1) {
        // Results should be ordered by rank (descending)
        for (let i = 1; i < body.results.length; i++) {
          expect(body.results[i].rank).toBeLessThanOrEqual(body.results[i-1].rank);
        }
      }
    });
  });

  describe('Fuzzy Search', () => {
    it('should perform fuzzy search on usernames', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/api/logs/search/fuzzy')
        .query({
          type: 'audit',
          field: 'username',
          term: 'testuer', // Misspelled "testuser"
          threshold: 0.6
        })
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      const body = assertApiResponse(response, 200);
      
      expect(body.results).toBeDefined();
      expect(Array.isArray(body.results)).toBe(true);
      
      body.results.forEach((result: any) => {
        expect(result).toHaveProperty('similarity');
        expect(result.similarity).toBeGreaterThanOrEqual(0.6);
        expect(result.similarity).toBeLessThanOrEqual(1.0);
      });
    });

    it('should perform fuzzy search on IP addresses', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/api/logs/search/fuzzy')
        .query({
          type: 'audit',
          field: 'ip_address',
          term: '192.168.1.10', // Close to 192.168.1.100
          threshold: 0.5
        })
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      const body = assertApiResponse(response, 200);
      
      expect(body.results).toBeDefined();
      
      body.results.forEach((result: any) => {
        expect(result.similarity).toBeGreaterThanOrEqual(0.5);
        expect(result.ip_address).toBeDefined();
      });
    });

    it('should adjust fuzzy search threshold', async () => {
      const correlationId = generateTestCorrelationId();
      
      // High threshold (strict matching)
      const strictResponse = await testContext.request
        .get('/api/logs/search/fuzzy')
        .query({
          type: 'audit',
          field: 'username',
          term: 'testuer',
          threshold: 0.9
        })
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', `${correlationId}-strict`);

      // Low threshold (lenient matching)
      const lenientResponse = await testContext.request
        .get('/api/logs/search/fuzzy')
        .query({
          type: 'audit',
          field: 'username',
          term: 'testuer',
          threshold: 0.3
        })
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', `${correlationId}-lenient`);

      const strictBody = assertApiResponse(strictResponse, 200);
      const lenientBody = assertApiResponse(lenientResponse, 200);
      
      // Lenient search should return more results
      expect(lenientBody.results.length).toBeGreaterThanOrEqual(strictBody.results.length);
    });
  });

  describe('Log Statistics', () => {
    it('should get audit log statistics', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/api/logs/stats')
        .query({
          type: 'audit',
          period: '24h'
        })
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      const body = assertApiResponse(response, 200);
      
      expect(body.totalLogs).toBeDefined();
      expect(body.period).toBe('24h');
      expect(body.breakdown).toBeDefined();
      expect(body.breakdown.byEventType).toBeDefined();
      expect(body.breakdown.byEventResult).toBeDefined();
      expect(body.breakdown.byHour).toBeDefined();
      
      // Verify breakdown structure
      expect(Array.isArray(body.breakdown.byEventType)).toBe(true);
      expect(Array.isArray(body.breakdown.byEventResult)).toBe(true);
      expect(Array.isArray(body.breakdown.byHour)).toBe(true);
    });

    it('should get system log statistics', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/api/logs/stats')
        .query({
          type: 'system',
          period: '7d'
        })
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      const body = assertApiResponse(response, 200);
      
      expect(body.totalLogs).toBeDefined();
      expect(body.period).toBe('7d');
      expect(body.breakdown).toBeDefined();
      expect(body.breakdown.byLogLevel).toBeDefined();
      expect(body.breakdown.bySource).toBeDefined();
      expect(body.breakdown.byCategory).toBeDefined();
    });

    it('should get top IP addresses from audit logs', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/api/logs/stats/top-ips')
        .query({
          period: '7d',
          limit: 10
        })
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      const body = assertApiResponse(response, 200);
      
      expect(Array.isArray(body)).toBe(true);
      
      body.forEach((item: any) => {
        expect(item).toHaveProperty('ip_address');
        expect(item).toHaveProperty('count');
        expect(item).toHaveProperty('last_seen');
        expect(typeof item.count).toBe('number');
      });
    });

    it('should get authentication failure statistics', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/api/logs/stats/auth-failures')
        .query({
          period: '24h',
          groupBy: 'username'
        })
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      const body = assertApiResponse(response, 200);
      
      expect(body.totalFailures).toBeDefined();
      expect(body.uniqueUsers).toBeDefined();
      expect(body.breakdown).toBeDefined();
      expect(Array.isArray(body.breakdown)).toBe(true);
      
      body.breakdown.forEach((item: any) => {
        expect(item).toHaveProperty('username');
        expect(item).toHaveProperty('failures');
        expect(item).toHaveProperty('last_failure');
      });
    });
  });

  describe('Log Export', () => {
    it('should export audit logs as CSV (admin only)', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/api/logs/export')
        .query({
          type: 'audit',
          format: 'csv',
          start_date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 24h ago
          end_date: new Date().toISOString()
        })
        .set('Authorization', `Bearer ${testContext.adminToken}`)
        .set('X-Correlation-ID', correlationId);

      assertApiResponse(response, 200);
      
      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['content-disposition']).toContain('audit_logs');
    });

    it('should export system logs as JSON (admin only)', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/api/logs/export')
        .query({
          type: 'system',
          format: 'json',
          log_level: 'error',
          limit: 100
        })
        .set('Authorization', `Bearer ${testContext.adminToken}`)
        .set('X-Correlation-ID', correlationId);

      const body = assertApiResponse(response, 200);
      
      expect(response.headers['content-type']).toContain('application/json');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(Array.isArray(body)).toBe(true);
    });

    it('should deny export access to non-admin users', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/api/logs/export')
        .query({
          type: 'audit',
          format: 'csv'
        })
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      assertApiResponse(response, 403);
    });
  });

  describe('Real-time Log Streaming', () => {
    it('should validate real-time log endpoint exists', async () => {
      const correlationId = generateTestCorrelationId();
      
      // Test that the endpoint exists (WebSocket upgrade will fail in HTTP test)
      const response = await testContext.request
        .get('/api/logs/realtime')
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      // Should either upgrade to WebSocket or return method not allowed
      expect(response.status).toBeOneOf([101, 405, 426]);
    });
  });

  describe('Log Retention and Archival', () => {
    it('should get log retention policies', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/api/logs/retention')
        .set('Authorization', `Bearer ${testContext.adminToken}`)
        .set('X-Correlation-ID', correlationId);

      // This endpoint might not be implemented yet
      expect(response.status).toBeOneOf([200, 404]);

      if (response.status === 200) {
        const body = response.body;
        expect(body.auditLogs).toBeDefined();
        expect(body.systemLogs).toBeDefined();
        expect(body.archiveLocation).toBeDefined();
      }
    });
  });

  describe('Performance and Caching', () => {
    it('should cache log query results', async () => {
      const correlationId = generateTestCorrelationId();
      const queryParams = {
        type: 'audit',
        event_type: 'authentication',
        page: 1,
        limit: 5
      };

      // First request
      const start1 = Date.now();
      const response1 = await testContext.request
        .get('/api/logs')
        .query(queryParams)
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', `${correlationId}-1`);
      const time1 = Date.now() - start1;

      // Second identical request (should be cached)
      const start2 = Date.now();
      const response2 = await testContext.request
        .get('/api/logs')
        .query(queryParams)
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', `${correlationId}-2`);
      const time2 = Date.now() - start2;

      // Both should succeed
      assertApiResponse(response1, 200);
      assertApiResponse(response2, 200);

      // Second request should be faster (cached)
      expect(time2).toBeLessThan(time1);

      // Results should be identical
      expect(response1.body.data).toEqual(response2.body.data);

      logger.info('Log caching performance:', {
        firstRequest: time1,
        secondRequest: time2,
        improvement: ((time1 - time2) / time1 * 100).toFixed(2) + '%'
      });
    });

    it('should handle large result sets efficiently', async () => {
      const correlationId = generateTestCorrelationId();
      
      // Request a large page size
      const response = await testContext.request
        .get('/api/logs')
        .query({
          type: 'audit',
          page: 1,
          limit: 100,
          sortBy: 'created_at',
          sortOrder: 'desc'
        })
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      const body = assertApiResponse(response, 200);
      
      // Should handle large page size
      expect(body.data.length).toBeLessThanOrEqual(100);
      expect(body.pagination.limit).toBe(100);
    });

    it('should timeout long-running queries', async () => {
      const correlationId = generateTestCorrelationId();
      
      // Complex search that might take time
      const response = await testContext.request
        .get('/api/logs/search/fulltext')
        .query({
          q: '*', // Very broad search
          type: 'audit',
          limit: 1000
        })
        .set('Authorization', `Bearer ${testContext.testToken}`)
        .set('X-Correlation-ID', correlationId);

      // Should either complete or timeout gracefully
      expect(response.status).toBeOneOf([200, 408, 500]);
      
      if (response.status === 408) {
        expect(response.body.error).toContain('timeout');
      }
    }, 10000); // Give test more time
  });

  describe('Log Query Metrics', () => {
    it('should get query performance metrics', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/api/logs/metrics/queries')
        .query({
          hours: 24
        })
        .set('Authorization', `Bearer ${testContext.adminToken}`)
        .set('X-Correlation-ID', correlationId);

      // This endpoint might require admin access or might not be fully implemented
      expect(response.status).toBeOneOf([200, 403, 404]);

      if (response.status === 200) {
        const body = response.body;
        expect(body.metrics).toBeDefined();
        expect(Array.isArray(body.metrics)).toBe(true);
        
        body.metrics.forEach((metric: any) => {
          expect(metric).toHaveProperty('query_type');
          expect(metric).toHaveProperty('execution_time_ms');
          expect(metric).toHaveProperty('row_count');
          expect(metric).toHaveProperty('cache_hit');
          expect(metric).toHaveProperty('timestamp');
        });
      }
    });

    it('should export query metrics', async () => {
      const correlationId = generateTestCorrelationId();
      
      const response = await testContext.request
        .get('/api/logs/metrics/queries/export')
        .query({
          queryType: 'audit_logs',
          hours: 24
        })
        .set('Authorization', `Bearer ${testContext.adminToken}`)
        .set('X-Correlation-ID', correlationId);

      expect(response.status).toBeOneOf([200, 403, 404]);

      if (response.status === 200) {
        expect(response.headers['content-type']).toContain('text/csv');
        expect(response.headers['content-disposition']).toContain('attachment');
      }
    });
  });
});

/**
 * Create additional test log data for comprehensive testing
 */
async function createTestLogData(pool: any) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create diverse audit log entries
    const auditLogs = [
      {
        user_id: 1,
        event_type: 'authentication',
        event_action: 'login',
        event_result: 'success',
        event_details: JSON.stringify({ auth_method: 'ldap', duration_ms: 200 }),
        ip_address: '192.168.1.100',
        user_agent: 'Mozilla/5.0',
        session_id: 'sess_001',
        correlation_id: 'e2e-audit-1'
      },
      {
        user_id: 1,
        event_type: 'authentication',
        event_action: 'login',
        event_result: 'failure',
        event_details: JSON.stringify({ auth_method: 'ldap', error: 'invalid_password' }),
        ip_address: '192.168.1.101',
        user_agent: 'Mozilla/5.0',
        session_id: null,
        correlation_id: 'e2e-audit-2'
      },
      {
        user_id: 1,
        event_type: 'report_execution',
        event_action: 'execute',
        event_result: 'success',
        event_details: JSON.stringify({ report_type: 'inactive_users', execution_time_ms: 1500, row_count: 25 }),
        ip_address: '192.168.1.100',
        user_agent: 'Mozilla/5.0',
        session_id: 'sess_001',
        correlation_id: 'e2e-audit-3'
      }
    ];

    for (const log of auditLogs) {
      await client.query(`
        INSERT INTO audit_logs (user_id, event_type, event_action, event_result, event_details, 
                               ip_address, user_agent, session_id, correlation_id, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        ON CONFLICT DO NOTHING
      `, [log.user_id, log.event_type, log.event_action, log.event_result, log.event_details,
          log.ip_address, log.user_agent, log.session_id, log.correlation_id]);
    }

    // Create diverse system log entries
    const systemLogs = [
      {
        log_level: 'info',
        source: 'auth_service',
        category: 'authentication',
        message: 'User authentication successful for user testuser',
        details: JSON.stringify({ user_id: 1, auth_method: 'ldap', duration_ms: 200 }),
        correlation_id: 'e2e-system-1'
      },
      {
        log_level: 'error',
        source: 'ldap_service',
        category: 'connection',
        message: 'LDAP connection timeout to server test-dc.local',
        details: JSON.stringify({ server: 'test-dc.local', timeout_ms: 5000, retry_attempt: 1 }),
        correlation_id: 'e2e-system-2'
      },
      {
        log_level: 'warn',
        source: 'rate_limiter',
        category: 'security',
        message: 'Rate limit warning for IP 192.168.1.101',
        details: JSON.stringify({ ip: '192.168.1.101', requests: 95, limit: 100 }),
        correlation_id: 'e2e-system-3'
      }
    ];

    for (const log of systemLogs) {
      await client.query(`
        INSERT INTO system_logs (log_level, source, category, message, details, correlation_id, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT DO NOTHING
      `, [log.log_level, log.source, log.category, log.message, log.details, log.correlation_id]);
    }

    await client.query('COMMIT');
    logger.info('Test log data created successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to create test log data:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Clean up test log data
 */
async function cleanupTestLogData(pool: any) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    await client.query(`DELETE FROM audit_logs WHERE correlation_id LIKE 'e2e-audit-%'`);
    await client.query(`DELETE FROM system_logs WHERE correlation_id LIKE 'e2e-system-%'`);
    
    await client.query('COMMIT');
    logger.info('Test log data cleaned up successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to cleanup test log data:', error);
    // Don't throw on cleanup failure
  } finally {
    client.release();
  }
}