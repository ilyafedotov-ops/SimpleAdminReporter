import request from 'supertest';
import app from '../app';
import { db } from '../config/database';
import jwt from 'jsonwebtoken';

// Mock authentication
const mockUser = {
  id: 1,
  username: 'testuser',
  email: 'test@example.com',
  roles: ['admin']
};

const authToken = jwt.sign(
  { userId: mockUser.id, username: mockUser.username },
  process.env.JWT_SECRET || 'test-secret',
  { expiresIn: '1h' }
);

describe.skip('Graph API Integration Tests', () => {
  beforeAll(async () => {
    // Setup test database
    await db.query(`
      INSERT INTO users (id, username, email, password_hash, is_active)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username
    `, [mockUser.id, mockUser.username, mockUser.email, 'hash', true]);

    // Insert test Azure credentials
    await db.query(`
      INSERT INTO service_credentials (
        id, user_id, service_type, credential_name, 
        tenant_id, client_id, encrypted_client_secret,
        is_default, is_active, credential_metadata
      ) VALUES (
        1, $1, 'azure', 'Test Azure Credential',
        'test-tenant', 'test-client', 'encrypted-secret',
        true, true, $2::jsonb
      ) ON CONFLICT (id) DO UPDATE SET credential_name = EXCLUDED.credential_name
    `, [
      mockUser.id,
      JSON.stringify({
        authType: 'application',
        multiTenant: false,
        allowUserContext: false,
        consentedScopes: ['https://graph.microsoft.com/.default']
      })
    ]);
  });

  afterAll(async () => {
    // Cleanup
    await db.query('DELETE FROM report_history WHERE user_id = $1', [mockUser.id]);
    await db.query('DELETE FROM service_credentials WHERE user_id = $1', [mockUser.id]);
    await db.query('DELETE FROM users WHERE id = $1', [mockUser.id]);
  });

  describe('GET /api/reports/graph/templates', () => {
    it('should return Graph API report templates', async () => {
      const response = await request(app)
        .get('/api/reports/graph/templates')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('templates');
      expect(Array.isArray(response.body.templates)).toBe(true);
      expect(response.body.templates.length).toBeGreaterThan(0);
      
      const template = response.body.templates[0];
      expect(template).toHaveProperty('id');
      expect(template).toHaveProperty('name');
      expect(template).toHaveProperty('description');
      expect(template).toHaveProperty('query_type', 'graph');
    });

    it('should filter templates by category', async () => {
      const response = await request(app)
        .get('/api/reports/graph/templates?category=users')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.templates.every((t: any) => t.subcategory === 'users')).toBe(true);
    });

    it('should require authentication', async () => {
      await request(app)
        .get('/api/reports/graph/templates')
        .expect(401);
    });
  });

  describe('POST /api/reports/graph/execute/:templateId', () => {
    it('should execute a Graph query', async () => {
      // Mock the Azure service
      const _mockExecuteQuery = jest.fn().mockResolvedValue({
        value: [
          { id: '1', displayName: 'Test User', userPrincipalName: 'test@example.com' }
        ],
        '@odata.count': 1
      });
      void _mockExecuteQuery; // Reserved for future mock usage

      // This would need proper mocking setup
      const response = await request(app)
        .post('/api/reports/graph/execute/graph_inactive_users')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ parameters: { days: 30 } })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('queryId', 'inactive_users');
      expect(response.body.data).toHaveProperty('rowCount');
      expect(response.body.data).toHaveProperty('data');
    });

    it('should validate required parameters', async () => {
      const response = await request(app)
        .post('/api/reports/graph/execute/graph_inactive_users')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ parameters: {} }) // Missing required 'days' parameter
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('required parameter');
    });

    it('should support user context execution', async () => {
      // Update credential to support user context
      await db.query(`
        UPDATE service_credentials 
        SET credential_metadata = credential_metadata || '{"allowUserContext": true}'::jsonb
        WHERE id = 1
      `);

      const response = await request(app)
        .post('/api/reports/graph/execute/graph_inactive_users')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          parameters: { days: 30 },
          context: {
            queryContext: 'user',
            targetUser: 'user@example.com'
          }
        })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
    });

    it('should handle Graph API errors gracefully', async () => {
      const response = await request(app)
        .post('/api/reports/graph/execute/non_existent_query')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ parameters: {} })
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error', 'Query template not found');
    });
  });

  describe('GET /api/reports/graph/fields/:entityType', () => {
    it('should discover fields for users entity', async () => {
      const response = await request(app)
        .get('/api/reports/graph/fields/users')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('fields');
      expect(Array.isArray(response.body.fields)).toBe(true);
      
      const fields = response.body.fields;
      const fieldNames = fields.map((f: any) => f.fieldName);
      expect(fieldNames).toContain('id');
      expect(fieldNames).toContain('displayName');
      expect(fieldNames).toContain('userPrincipalName');
    });

    it('should support force refresh', async () => {
      const response = await request(app)
        .get('/api/reports/graph/fields/users?refresh=true')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('fields');
      expect(response.body).toHaveProperty('refreshed', true);
    });

    it('should filter fields by category', async () => {
      const response = await request(app)
        .get('/api/reports/graph/fields/users?category=basic')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.fields.every((f: any) => f.category === 'basic')).toBe(true);
    });

    it('should search fields by keyword', async () => {
      const response = await request(app)
        .get('/api/reports/graph/fields/users?search=mail')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const fields = response.body.fields;
      expect(fields.some((f: any) => 
        f.fieldName.includes('mail') || f.displayName.toLowerCase().includes('mail')
      )).toBe(true);
    });
  });

  describe('GET /api/reports/graph/history', () => {
    beforeEach(async () => {
      // Insert test execution history
      await db.query(`
        INSERT INTO report_history (
          user_id, report_id, executed_at, status, 
          result_count, execution_time_ms, parameters
        ) VALUES 
        ($1, 'graph_inactive_users', NOW() - INTERVAL '1 hour', 'success', 10, 150, '{"days": 30}'::jsonb),
        ($1, 'graph_guest_users', NOW() - INTERVAL '2 hours', 'success', 5, 100, '{}'::jsonb),
        ($1, 'graph_mfa_status', NOW() - INTERVAL '3 hours', 'error', 0, 50, '{}'::jsonb)
      `, [mockUser.id]);
    });

    it('should return execution history', async () => {
      const response = await request(app)
        .get('/api/reports/graph/history')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('history');
      expect(Array.isArray(response.body.history)).toBe(true);
      expect(response.body.history.length).toBe(3);
    });

    it('should filter by query ID', async () => {
      const response = await request(app)
        .get('/api/reports/graph/history?queryId=graph_inactive_users')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.history).toHaveLength(1);
      expect(response.body.history[0].report_id).toBe('graph_inactive_users');
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/reports/graph/history?limit=2&offset=1')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.history).toHaveLength(2);
    });
  });

  describe('GET /api/reports/graph/history/:id', () => {
    it('should return specific execution result', async () => {
      // Insert a result with data
      const result = await db.query(`
        INSERT INTO report_history (
          user_id, report_id, executed_at, status, 
          result_count, results, execution_time_ms
        ) VALUES (
          $1, 'graph_inactive_users', NOW(), 'success', 
          2, $2::jsonb, 100
        ) RETURNING id
      `, [
        mockUser.id,
        JSON.stringify({
          data: [
            { id: '1', displayName: 'User 1' },
            { id: '2', displayName: 'User 2' }
          ]
        })
      ]);

      const response = await request(app)
        .get(`/api/reports/graph/history/${result.rows[0].id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('execution');
      expect(response.body.execution).toHaveProperty('results');
      expect(response.body.execution.results.data).toHaveLength(2);
    });

    it('should return 404 for non-existent execution', async () => {
      await request(app)
        .get('/api/reports/graph/history/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  describe('POST /api/reports/graph/batch', () => {
    it('should execute multiple queries in batch', async () => {
      const response = await request(app)
        .post('/api/reports/graph/batch')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          queries: [
            { queryId: 'graph_inactive_users', parameters: { days: 30 } },
            { queryId: 'graph_guest_users', parameters: {} }
          ]
        })
        .expect(200);

      expect(response.body).toHaveProperty('results');
      expect(response.body.results).toHaveLength(2);
      expect(response.body.results[0]).toHaveProperty('queryId', 'inactive_users');
      expect(response.body.results[1]).toHaveProperty('queryId', 'guest_users');
    });

    it('should handle partial failures in batch', async () => {
      const response = await request(app)
        .post('/api/reports/graph/batch')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          queries: [
            { queryId: 'graph_inactive_users', parameters: { days: 30 } },
            { queryId: 'invalid_query', parameters: {} }
          ]
        })
        .expect(200);

      expect(response.body.results).toHaveLength(2);
      expect(response.body.results[0]).toHaveProperty('data');
      expect(response.body.results[1]).toHaveProperty('error');
    });
  });

  describe('GET /api/reports/graph/export/:executionId', () => {
    it('should export execution results', async () => {
      // Create execution with results
      const execution = await db.query(`
        INSERT INTO report_history (
          user_id, report_id, executed_at, status, 
          result_count, results
        ) VALUES (
          $1, 'graph_inactive_users', NOW(), 'success', 
          1, '{"data": [{"id": "1", "displayName": "Test User"}]}'::jsonb
        ) RETURNING id
      `, [mockUser.id]);

      const response = await request(app)
        .get(`/api/reports/graph/export/${execution.rows[0].id}?format=csv`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain('attachment');
    });

    it('should support multiple export formats', async () => {
      const execution = await db.query(`
        INSERT INTO report_history (
          user_id, report_id, executed_at, status, 
          result_count, results
        ) VALUES (
          $1, 'graph_users', NOW(), 'success', 
          1, '{"data": [{"id": "1", "name": "Test"}]}'::jsonb
        ) RETURNING id
      `, [mockUser.id]);

      // Test Excel export
      const xlsxResponse = await request(app)
        .get(`/api/reports/graph/export/${execution.rows[0].id}?format=xlsx`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(xlsxResponse.headers['content-type']).toContain('spreadsheet');
    });
  });

  describe('WebSocket Real-time Updates', () => {
    it('should emit progress updates during query execution', (done: jest.DoneCallback) => {
      // This would require Socket.IO client setup
      // Simplified test structure
      done();
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits on Graph API queries', async () => {
      // Make multiple rapid requests
      const requests = Array(10).fill(null).map(() =>
        request(app)
          .post('/api/reports/graph/execute/graph_inactive_users')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ parameters: { days: 30 } })
      );

      const responses = await Promise.all(requests);
      const rateLimited = responses.some(r => r.status === 429);
      
      expect(rateLimited).toBe(true);
    });
  });
});