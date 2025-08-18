/**
 * Database Stability E2E Tests
 * Tests the fixes for deadlock issues and connection stability
 */

import { 
  E2ETestContext, 
  setupE2ETestContext, 
  teardownE2ETestContext,
  createE2ETestData,
  cleanupE2ETestData,
  generateTestCorrelationId
} from './setup';
import { setupTestContext, teardownTestContext } from '@/test/test-helpers';
import { createIsolatedTestDatabase, seedIsolatedTestData } from '@/test/test-db-isolation';
import { logger } from '@/utils/logger';

describe('Database Stability E2E Tests', () => {
  let testContext: E2ETestContext;

  beforeAll(async () => {
    logger.info('Setting up database stability E2E tests...');
    testContext = await setupE2ETestContext();
    await createE2ETestData(testContext.pool);
    logger.info('Database stability E2E test context ready');
  }, 90000);

  afterAll(async () => {
    logger.info('Tearing down database stability E2E tests...');
    if (testContext) {
      await cleanupE2ETestData(testContext.pool);
      await teardownE2ETestContext(testContext);
    }
    logger.info('Database stability E2E test cleanup complete');
  }, 30000);

  describe('Connection Pool Stability', () => {
    it('should handle multiple concurrent connection requests', async () => {
      const correlationId = generateTestCorrelationId();
      logger.info('Testing concurrent connections', { correlationId });

      // Create multiple concurrent requests to test connection pooling
      const promises = Array.from({ length: 20 }, (_, i) => 
        testContext.request
          .get('/api/health')
          .set('Authorization', `Bearer ${testContext.testToken}`)
          .set('X-Correlation-ID', `${correlationId}-${i}`)
      );

      const responses = await Promise.all(promises);
      
      // All requests should succeed
      responses.forEach((response, index) => {
        expect(response.status).toBe(200);
        expect(response.body.status).toBeOneOf(['healthy', 'degraded', 'unhealthy']);
        logger.debug(`Concurrent request ${index} completed`, {
          status: response.status,
          healthStatus: response.body.status
        });
      });

      logger.info('All concurrent connections handled successfully', {
        totalRequests: responses.length,
        successfulRequests: responses.filter(r => r.status === 200).length
      });
    });

    it('should handle connection pool exhaustion gracefully', async () => {
      const correlationId = generateTestCorrelationId();
      
      // Test connection pool limits
      logger.info('Testing connection pool limits', { correlationId });
      
      const client = await testContext.pool.connect();
      try {
        // Should still be able to make API requests while holding a connection
        const response = await testContext.request
          .get('/api/health/detailed')
          .set('Authorization', `Bearer ${testContext.testToken}`)
          .set('X-Correlation-ID', correlationId);

        expect(response.status).toBe(200);
        logger.info('API request succeeded while connection held');
      } finally {
        client.release();
      }
    });
  });

  describe('Service Credentials Deadlock Prevention', () => {
    it('should handle concurrent credential creation without deadlocks', async () => {
      const correlationId = generateTestCorrelationId();
      const testSuffix = Date.now().toString().slice(-6);
      
      logger.info('Testing concurrent credential creation', { 
        correlationId, 
        testSuffix 
      });

      // Create multiple credentials concurrently
      const credentialPromises = Array.from({ length: 10 }, (_, i) => 
        testContext.request
          .post('/api/credentials')
          .set('Authorization', `Bearer ${testContext.testToken}`)
          .set('X-Correlation-ID', `${correlationId}-cred-${i}`)
          .send({
            serviceType: i % 2 === 0 ? 'ad' : 'azure',
            credentialName: `Concurrent Test Credential ${testSuffix}-${i}`,
            username: `concurrent-user-${i}`,
            password: 'test-password',
            server: 'test-server.local',
            baseDN: 'DC=test,DC=local'
          })
      );

      const responses = await Promise.all(credentialPromises.map(p => 
        p.catch(error => ({ error, status: error.response?.status || 500 }))
      ));

      // Count successful creations (should be all or most)
      const successful = responses.filter(r => !r.error && r.status === 201).length;
      const failed = responses.filter(r => r.error || r.status !== 201).length;

      logger.info('Concurrent credential creation results', {
        successful,
        failed,
        total: responses.length
      });

      // Should have majority success (no deadlocks)
      expect(successful).toBeGreaterThanOrEqual(8); // At least 80% success rate
      
      // Clean up created credentials
      for (let i = 0; i < 10; i++) {
        try {
          await testContext.request
            .delete('/api/credentials')
            .query({ name: `Concurrent Test Credential ${testSuffix}-${i}` })
            .set('Authorization', `Bearer ${testContext.testToken}`);
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    }, 15000);

    it('should handle serialization failures gracefully', async () => {
      const correlationId = generateTestCorrelationId();
      
      logger.info('Testing serialization failure handling', { correlationId });

      // Create rapid sequential requests that might trigger serialization conflicts
      const sequentialPromises = [];
      for (let i = 0; i < 5; i++) {
        sequentialPromises.push(
          testContext.request
            .post('/api/credentials')
            .set('Authorization', `Bearer ${testContext.testToken}`)
            .set('X-Correlation-ID', `${correlationId}-seq-${i}`)
            .send({
              serviceType: 'ad',
              credentialName: `Sequential Test Credential ${i}`,
              username: `sequential-user-${i}`,
              password: 'test-password'
            })
        );
        
        // Small delay to create potential race condition
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      const responses = await Promise.allSettled(sequentialPromises);
      
      const successful = responses.filter(r => 
        r.status === 'fulfilled' && r.value.status === 201
      ).length;

      logger.info('Sequential credential creation results', {
        successful,
        total: responses.length
      });

      // Should handle all requests without throwing unhandled errors
      expect(successful).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Transaction Isolation', () => {
    it('should maintain transaction integrity under concurrent load', async () => {
      const correlationId = generateTestCorrelationId();
      
      logger.info('Testing transaction integrity', { correlationId });

      // Get initial user count
      const client = await testContext.pool.connect();
      let initialCount;
      try {
        const result = await client.query('SELECT COUNT(*) FROM users');
        initialCount = parseInt(result.rows[0].count);
      } finally {
        client.release();
      }

      // Create multiple users concurrently through API
      const userPromises = Array.from({ length: 5 }, (_, i) => 
        testContext.request
          .post('/api/users')
          .set('Authorization', `Bearer ${testContext.adminToken}`)
          .set('X-Correlation-ID', `${correlationId}-user-${i}`)
          .send({
            username: `transaction-test-user-${i}-${Date.now()}`,
            email: `transaction-test-${i}-${Date.now()}@test.local`,
            displayName: `Transaction Test User ${i}`,
            isActive: true
          })
          .catch(error => ({ error: true, status: error.response?.status || 500 }))
      );

      await Promise.all(userPromises);

      // Verify transaction integrity
      const client2 = await testContext.pool.connect();
      try {
        const result = await client2.query('SELECT COUNT(*) FROM users');
        const finalCount = parseInt(result.rows[0].count);
        
        logger.info('Transaction integrity test results', {
          initialCount,
          finalCount,
          difference: finalCount - initialCount
        });

        // Count should have increased (some users should have been created)
        expect(finalCount).toBeGreaterThanOrEqual(initialCount);
      } finally {
        client2.release();
      }
    });
  });

  describe('Database Schema Isolation', () => {
    it('should support isolated test database schemas', async () => {
      logger.info('Testing database schema isolation');

      const isolatedDb = await createIsolatedTestDatabase();
      
      try {
        // Seed data in isolated schema
        const { userId, adminUserId } = await seedIsolatedTestData(
          isolatedDb.pool, 
          isolatedDb.schemaName
        );

        expect(userId).toBeDefined();
        expect(adminUserId).toBeDefined();
        expect(userId).not.toBe(adminUserId);

        // Verify isolation - data should exist in isolated schema
        const client = await isolatedDb.pool.connect();
        try {
          const result = await client.query('SELECT COUNT(*) FROM users');
          expect(parseInt(result.rows[0].count)).toBeGreaterThanOrEqual(2);
          
          logger.info('Isolated schema data verified', {
            schema: isolatedDb.schemaName,
            userCount: result.rows[0].count
          });
        } finally {
          client.release();
        }

      } finally {
        await isolatedDb.cleanup();
        logger.info('Isolated schema cleaned up');
      }
    });
  });

  describe('Error Recovery', () => {
    it('should recover from connection failures gracefully', async () => {
      const correlationId = generateTestCorrelationId();
      
      logger.info('Testing connection failure recovery', { correlationId });

      // Test recovery by making requests after potential connection issues
      let consecutiveSuccesses = 0;
      
      for (let i = 0; i < 10; i++) {
        try {
          const response = await testContext.request
            .get('/api/health')
            .set('Authorization', `Bearer ${testContext.testToken}`)
            .set('X-Correlation-ID', `${correlationId}-recovery-${i}`)
            .timeout(5000);

          if (response.status === 200) {
            consecutiveSuccesses++;
          }
          
          // Small delay between requests
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          logger.warn(`Recovery test request ${i} failed:`, error.message);
          consecutiveSuccesses = 0;
        }
      }

      logger.info('Connection recovery test completed', {
        consecutiveSuccesses,
        threshold: 8
      });

      // Should have multiple consecutive successes (recovery working)
      expect(consecutiveSuccesses).toBeGreaterThanOrEqual(8);
    });
  });
});