import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import app from '../app';
import { db } from '../config/database';
import { GraphQueryExecutor } from '../services/graph-query-executor.service';
import { azureMsalService } from '../services/azure-msal.service';

let authToken: string = 'test-token';
let testUserId: number;

describe('Graph API Integration Tests', () => {
  let graphQueryExecutor: GraphQueryExecutor;

  beforeAll(async () => {
    // Create test user and get auth token
    const userResult = await db.query(`
      INSERT INTO users (username, email, password_hash, is_active)
      VALUES ($1, $2, $3, true)
      RETURNING id
    `, ['testgraph', 'testgraph@example.com', 'hashed_password']);
    
    testUserId = userResult.rows[0].id;

    // Create test credentials
    await db.query(`
      INSERT INTO service_credentials (user_id, service_type, credential_name, encrypted_data, is_active, is_default)
      VALUES ($1, $2, $3, $4, true, true)
    `, [
      testUserId,
      'azure',
      'Test Azure Credential',
      JSON.stringify({
        tenantId: process.env.TEST_AZURE_TENANT_ID || 'test-tenant',
        clientId: process.env.TEST_AZURE_CLIENT_ID || 'test-client',
        clientSecret: process.env.TEST_AZURE_CLIENT_SECRET || 'test-secret'
      })
    ]);

    // Mock auth token
    authToken = 'test-token';
    
    // Initialize Graph Query Executor
    graphQueryExecutor = new GraphQueryExecutor();
  });

  afterAll(async () => {
    // Cleanup
    await db.query('DELETE FROM report_history WHERE user_id = $1', [testUserId]);
    await db.query('DELETE FROM service_credentials WHERE user_id = $1', [testUserId]);
    await db.query('DELETE FROM users WHERE id = $1', [testUserId]);
  });

  describe('Query Definitions', () => {
    it('should load all Graph query definitions', async () => {
      const response = await request(app)
        .get('/api/queries/graph/definitions')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.queries).toBeInstanceOf(Array);
      expect(response.body.data.queries.length).toBeGreaterThan(0);
      
      // Check for specific query types
      const queryIds = response.body.data.queries.map((q: any) => q.id);
      expect(queryIds).toContain('graph_inactive_users');
      expect(queryIds).toContain('graph_guest_users');
      expect(queryIds).toContain('graph_license_summary');
    });

    it('should get specific Graph query definition', async () => {
      const response = await request(app)
        .get('/api/queries/graph/definitions/graph_inactive_users')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.query).toBeDefined();
      expect(response.body.data.query.id).toBe('graph_inactive_users');
      expect(response.body.data.query.parameters).toBeDefined();
      expect(response.body.data.query.parameters.days).toBeDefined();
    });
  });

  describe('Query Execution', () => {
    it('should execute a simple Graph query', async () => {
      const response = await request(app)
        .post('/api/queries/graph/execute')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          queryId: 'graph_inactive_users',
          parameters: { days: 30 }
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.executionId).toBeDefined();
      expect(response.body.data.result).toBeDefined();
    });

    it('should handle Graph query with OData parameters', async () => {
      const response = await request(app)
        .post('/api/queries/graph/execute')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          queryId: 'graph_guest_users',
          parameters: {
            $select: 'displayName,mail,userType,createdDateTime',
            $top: 10,
            $orderby: 'displayName asc'
          }
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
    });

    it('should validate required parameters', async () => {
      const response = await request(app)
        .post('/api/queries/graph/execute')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          queryId: 'graph_inactive_users'
          // Missing required 'days' parameter
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('required');
    });
  });

  describe('Field Discovery', () => {
    it('should discover fields for user entity', async () => {
      const response = await request(app)
        .get('/api/queries/graph/schema/user')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.entityType).toBe('user');
      expect(response.body.data.fields).toBeInstanceOf(Array);
      expect(response.body.data.fields.length).toBeGreaterThan(0);
      
      // Check for common user fields
      const fieldNames = response.body.data.fields.map((f: any) => f.name);
      expect(fieldNames).toContain('id');
      expect(fieldNames).toContain('displayName');
      expect(fieldNames).toContain('userPrincipalName');
    });

    it('should discover fields for group entity', async () => {
      const response = await request(app)
        .get('/api/queries/graph/schema/group')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.entityType).toBe('group');
      expect(response.body.data.relationships).toBeInstanceOf(Array);
    });
  });

  describe('Query History', () => {
    it('should save Graph query execution to history', async () => {
      // Execute a query
      const execResponse = await request(app)
        .post('/api/queries/graph/execute')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          queryId: 'graph_inactive_users',
          parameters: { days: 30 },
          saveHistory: true
        })
        .expect(200);

      const executionId = execResponse.body.data.executionId;

      // Check history
      const historyResponse = await request(app)
        .get('/api/reports/history')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(historyResponse.body.success).toBe(true);
      const history = historyResponse.body.data.data.find((h: any) => h.id === executionId);
      expect(history).toBeDefined();
      expect(history.report_id).toBe('graph_inactive_users');
    });
  });

  describe('Post-Processing', () => {
    it('should apply post-processing filters', async () => {
      // Mock Azure service to return test data
      const mockData = [
        { id: '1', displayName: 'User A', department: 'IT', accountEnabled: true },
        { id: '2', displayName: 'User B', department: 'HR', accountEnabled: false },
        { id: '3', displayName: 'User C', department: 'IT', accountEnabled: true }
      ];

      jest.spyOn(graphQueryExecutor, 'executeQuery').mockResolvedValueOnce({
        queryId: 'test_query',
        data: mockData,
        rowCount: mockData.length,
        executionTimeMs: Date.now(),
        executedAt: new Date(),
        metadata: {}
      });

      const result = await graphQueryExecutor.executeQuery({
        userId: testUserId,
        queryId: 'test_query',
        parameters: {}
      });

      expect(((result as any)?.data)).toHaveLength(2);
      expect(((result as any)?.data)[0].displayName).toBe('User C');
      expect(((result as any)?.data)[1].displayName).toBe('User A');
    });
  });

  describe('Error Handling', () => {
    it('should handle Graph API errors gracefully', async () => {
      jest.spyOn(azureMsalService, 'executeQuery').mockRejectedValueOnce(
        new Error('Graph API Error: Insufficient privileges')
      );

      const response = await request(app)
        .post('/api/queries/graph/execute')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          queryId: 'graph_inactive_users',
          parameters: { days: 30 }
        })
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('privileges');
    });

    it('should handle missing credentials', async () => {
      // Delete test credentials
      await db.query('DELETE FROM service_credentials WHERE user_id = $1', [testUserId]);

      const response = await request(app)
        .post('/api/queries/graph/execute')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          queryId: 'graph_inactive_users',
          parameters: { days: 30 }
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('credentials');
    });
  });
});

// Integration test for full flow
describe('End-to-End Graph API Flow', () => {
  it('should complete full Graph API reporting flow', async () => {
    // 1. Get available Graph queries
    const queriesResponse = await request(app)
      .get('/api/reports/templates?category=azure')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    const graphQueries = queriesResponse.body.data.definitions.filter((d: any) => 
      d.id.startsWith('graph_')
    );
    expect(graphQueries.length).toBeGreaterThan(0);

    // 2. Select a query and get its definition
    const queryId = 'graph_inactive_users';
    const queryDef = graphQueries.find((q: any) => q.id === queryId);
    expect(queryDef).toBeDefined();

    // 3. Execute the query with parameters
    const executeResponse = await request(app)
      .post('/api/reports/execute/' + queryId)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        parameters: { days: 90 },
        format: 'json'
      })
      .expect(200);

    expect(executeResponse.body.success).toBe(true);
    expect(executeResponse.body.data.executionId).toBeDefined();
    
    // 4. Verify history was saved
    const historyResponse = await request(app)
      .get(`/api/reports/history/${executeResponse.body.data.executionId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(historyResponse.body.success).toBe(true);
    expect(historyResponse.body.data.report_id).toBe(queryId);

    // 5. Export results
    const exportResponse = await request(app)
      .get(`/api/reports/export/history/${executeResponse.body.data.executionId}?format=csv`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(exportResponse.headers['content-type']).toContain('csv');
  });
});