import express, { Application } from 'express';
import supertest from 'supertest';
import { Pool } from 'pg';
import { createClient } from 'redis';
import { logger } from '@/utils/logger';
import { TestContext, setupTestContext, teardownTestContext } from '@/test/test-helpers';
import { createTestToken } from '@/auth/test-utils/auth-test.utils';

// Import routes for E2E testing
import apiRoutes from '@/routes/index';
import { errorHandler } from '@/middleware/error.middleware';
import cors from 'cors';
import cookieParser from 'cookie-parser';

/**
 * E2E Test Context - extends base test context with Express app
 */
export interface E2ETestContext extends TestContext {
  app: Application;
  request: ReturnType<typeof supertest>;
  testToken: string;
  adminToken: string;
  authHeaders: { Authorization: string };
  adminAuthHeaders: { Authorization: string };
}

/**
 * Setup Express application for E2E testing
 */
export function createTestApp(): Application {
  const app = express();

  // Basic middleware
  app.use(cors({
    origin: true,
    credentials: true
  }));
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Mount API routes
  app.use('/api', apiRoutes);

  // Health check endpoint (matches production)
  app.get('/health', async (req, res) => {
    try {
      // Use import instead of require to match production patterns
      const { healthService } = await import('@/services/health/health.service');
      const health = await healthService.getHealthStatus();
      res.status(200).json(health);
    } catch (error) {
      res.status(500).json({
        status: 'unhealthy',
        timestamp: new Date(),
        error: 'Health check failed'
      });
    }
  });

  // Root endpoint (matches production)
  app.get('/', (req, res) => {
    res.json({
      message: 'AD/Azure AD/O365 Reporting API',
      version: process.env.npm_package_version || '1.0.0',
      environment: 'test',
      status: 'running'
    });
  });

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
}

/**
 * Setup complete E2E test context with real database, Redis, and Express app
 */
export async function setupE2ETestContext(): Promise<E2ETestContext> {
  const startTime = Date.now();
  logger.info('Starting E2E test context setup...');
  
  try {
    // Setup base test context (database, Redis, test data) with longer timeout
    const baseContext = await setupTestContext();
    logger.info('Base test context ready', {
      duration: Date.now() - startTime
    });

    // Create Express app
    const app = createTestApp();
    const request = supertest(app);

    // Generate test tokens
    const testToken = createTestToken(baseContext.userId, false);
    const adminToken = createTestToken(baseContext.adminUserId, true);

    const authHeaders = { Authorization: `Bearer ${testToken}` };
    const adminAuthHeaders = { Authorization: `Bearer ${adminToken}` };

    logger.info('E2E test context setup complete', {
      totalDuration: Date.now() - startTime,
      userId: baseContext.userId,
      adminUserId: baseContext.adminUserId,
      hasDatabase: !!baseContext.pool,
      hasRedis: !!baseContext.redis,
      dbConnections: baseContext.pool.totalCount,
      dbIdle: baseContext.pool.idleCount
    });

    return {
      ...baseContext,
      app,
      request,
      testToken,
      adminToken,
      authHeaders,
      adminAuthHeaders
    };
  } catch (error) {
    logger.error('Failed to setup E2E test context', {
      error: (error as Error).message,
      stack: (error as Error).stack,
      duration: Date.now() - startTime
    });
    throw new Error(`E2E test context setup failed after ${Date.now() - startTime}ms: ${(error as Error).message}`);
  }
}

/**
 * Teardown E2E test context
 */
export async function teardownE2ETestContext(context: E2ETestContext): Promise<void> {
  await teardownTestContext(context);
}

/**
 * Create test data for specific E2E scenarios with deadlock prevention
 */
export async function createE2ETestData(pool: Pool) {
  const client = await pool.connect();
  const testSuffix = Date.now().toString().slice(-6);
  
  try {
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    logger.info('Creating E2E test data...', { testSuffix });

    // Create additional test users for E2E scenarios
    await client.query(`
      INSERT INTO users (username, email, display_name, auth_source, is_admin, is_active, password_hash, created_at)
      VALUES 
        ($1, $2, 'E2E LDAP User', 'ldap', false, true, '$2a$10$K4h0h6I8.F0h0h6I8.F0hO', NOW()),
        ($3, $4, 'E2E Azure User', 'azure', false, true, NULL, NOW()),
        ($5, $6, 'E2E Disabled User', 'local', false, false, '$2a$10$K4h0h6I8.F0h0h6I8.F0hO', NOW())
      ON CONFLICT (username) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        updated_at = NOW()
    `, [
      `e2e_ldap_user_${testSuffix}`, `e2e.ldap.${testSuffix}@test.local`,
      `e2e_azure_user_${testSuffix}`, `e2e.azure.${testSuffix}@test.com`,
      `e2e_disabled_user_${testSuffix}`, `e2e.disabled.${testSuffix}@test.local`
    ]);

    // Create test report templates with realistic data
    await client.query(`
      INSERT INTO report_templates (name, description, category, data_source, query_config, field_mappings, is_active, created_at)
      VALUES 
        ($1, 'E2E test for AD inactive users report', 'ad', 'ad', 
         '{"fields": ["sAMAccountName", "displayName", "lastLogon"], "parameters": {"days": 30}}',
         '{"sAMAccountName": {"displayName": "Username"}, "displayName": {"displayName": "Display Name"}, "lastLogon": {"displayName": "Last Logon"}}', true, NOW()),
        ($2, 'E2E test for Azure guest users report', 'azure', 'azure', 
         '{"fields": ["displayName", "mail", "userType"], "parameters": {}}',
         '{"displayName": {"displayName": "Display Name"}, "mail": {"displayName": "Email"}, "userType": {"displayName": "User Type"}}', true, NOW()),
        ($3, 'E2E test for custom report functionality', 'custom', 'ad', 
         '{"fields": ["*"], "source": "ad", "filters": []}',
         '{"*": {"displayName": "All Fields"}}', true, NOW())
      ON CONFLICT (name) DO UPDATE SET 
        description = EXCLUDED.description,
        query_config = EXCLUDED.query_config,
        updated_at = NOW()
    `, [
      `E2E AD Inactive Users ${testSuffix}`,
      `E2E Azure Guest Users ${testSuffix}`,
      `E2E Custom Report ${testSuffix}`
    ]);

    // Create test credentials for E2E scenarios
    const userResult = await client.query(
      'SELECT id FROM users WHERE username LIKE $1 ORDER BY created_at DESC LIMIT 1', 
      [`%testuser%${testSuffix}`]
    );
    
    if (userResult.rows.length > 0) {
      const userId = userResult.rows[0].id;
      
      // Lock table to prevent deadlock
      await client.query('LOCK TABLE service_credentials IN SHARE ROW EXCLUSIVE MODE');
      
      await client.query(`
        INSERT INTO service_credentials (user_id, service_type, credential_name, username, encrypted_password, is_active, is_default, created_at)
        VALUES 
          ($1, 'ad', $2, 'e2e-ad-service', 'encrypted-test-password', true, false, NOW()),
          ($1, 'azure', $3, 'e2e-azure-app', 'encrypted-test-secret', true, false, NOW())
        ON CONFLICT (user_id, service_type, credential_name) DO UPDATE SET
          username = EXCLUDED.username,
          is_active = EXCLUDED.is_active,
          updated_at = NOW()
      `, [userId, `E2E AD Test Credential ${testSuffix}`, `E2E Azure Test Credential ${testSuffix}`]);
    }

    // Create test audit logs for logs API testing
    const auditLogResult = await client.query(
      'SELECT id FROM users LIMIT 1'
    );
    
    if (auditLogResult.rows.length > 0) {
      const testUserId = auditLogResult.rows[0].id;
      
      await client.query(`
        INSERT INTO audit_logs (user_id, event_type, event_action, event_result, event_details, ip_address, user_agent, session_id, correlation_id, created_at)
        VALUES 
          ($1, 'authentication', 'login', 'success', '{"auth_method": "ldap", "duration_ms": 150}', '192.168.1.100', 'E2E-Test-Agent/1.0', $2, $3, NOW() - INTERVAL '1 hour'),
          ($1, 'authentication', 'login', 'failure', '{"auth_method": "ldap", "error": "invalid_password"}', '192.168.1.101', 'E2E-Test-Agent/1.0', $4, $5, NOW() - INTERVAL '30 minutes'),
          ($1, 'report_execution', 'execute', 'success', '{"report_type": "inactive_users", "execution_time_ms": 250, "row_count": 15}', '192.168.1.100', 'E2E-Test-Agent/1.0', $2, $6, NOW() - INTERVAL '15 minutes')
        ON CONFLICT DO NOTHING
      `, [
        testUserId,
        `e2e-session-1-${testSuffix}`,
        `e2e-corr-1-${testSuffix}`, 
        `e2e-session-2-${testSuffix}`,
        `e2e-corr-2-${testSuffix}`,
        `e2e-corr-3-${testSuffix}`
      ]);
    }

    // Create test system logs for system log API testing
    await client.query(`
      INSERT INTO system_logs (log_level, source, category, message, details, correlation_id, created_at)
      VALUES 
        ('info', 'auth_service', 'authentication', 'User authentication successful', '{"user_id": 1, "auth_method": "ldap"}', $1, NOW() - INTERVAL '1 hour'),
        ('error', 'ldap_service', 'connection', 'LDAP connection timeout', '{"server": "test-dc.local", "timeout_ms": 5000}', $2, NOW() - INTERVAL '45 minutes'),
        ('warn', 'rate_limiter', 'security', 'Rate limit warning for IP', '{"ip": "192.168.1.101", "requests": 95}', $3, NOW() - INTERVAL '20 minutes')
      ON CONFLICT DO NOTHING  
    `, [
      `e2e-corr-1-${testSuffix}`,
      `e2e-corr-4-${testSuffix}`,
      `e2e-corr-5-${testSuffix}`
    ]);

    await client.query('COMMIT');
    logger.info('E2E test data created successfully', {
      testSuffix,
      duration: Date.now() - Date.now()
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to create E2E test data:', {
      error: (error as any).message,
      testSuffix,
      code: (error as any).code
    });
    
    // Retry once on serialization failure
    if ((error as any).code === '40001' && !(client as any).retried) {
      logger.warn('Serialization failure in E2E test data creation, retrying...');
      (client as any).retried = true;
      await new Promise(resolve => setTimeout(resolve, Math.random() * 2000));
      return createE2ETestData(pool);
    }
    
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Clean up E2E test-specific data with improved error handling
 */
export async function cleanupE2ETestData(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Clean up test-specific data in dependency order
    const cleanupQueries = [
      `DELETE FROM audit_logs WHERE correlation_id LIKE 'e2e-%'`,
      `DELETE FROM system_logs WHERE correlation_id LIKE 'e2e-%'`,
      `DELETE FROM service_credentials WHERE credential_name LIKE 'E2E %'`,
      `DELETE FROM report_history WHERE template_id IN (SELECT id FROM report_templates WHERE name LIKE 'E2E %')`,
      `DELETE FROM report_templates WHERE name LIKE 'E2E %'`,
      `DELETE FROM users WHERE username LIKE 'e2e_%'`
    ];
    
    for (const query of cleanupQueries) {
      try {
        const result = await client.query(query);
        logger.debug(`Cleanup query executed`, {
          query: query.split(' ')[2], // Table name
          rowsAffected: result.rowCount
        });
      } catch (error) {
        logger.warn(`Failed to execute cleanup query: ${query}`, (error as Error).message);
        // Continue with other cleanup operations
      }
    }

    await client.query('COMMIT');
    logger.info('E2E test data cleaned up successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to cleanup E2E test data:', error);
    // Don't throw on cleanup failure - tests should still be able to run
  } finally {
    client.release();
  }
}

/**
 * Wait for async operations with configurable timeout
 */
export async function waitFor(
  condition: () => Promise<boolean> | boolean,
  timeoutMs: number = 5000,
  intervalMs: number = 100
): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  
  throw new Error(`Condition not met within ${timeoutMs}ms`);
}

/**
 * Mock external services for E2E tests
 */
export function setupE2EMocks() {
  // Mock LDAP connection for tests that don't require real LDAP
  const mockLDAPClient = {
    bind: jest.fn(),
    search: jest.fn(),
    unbind: jest.fn(),
    connected: true
  };

  // Mock Graph API client
  const mockGraphClient = {
    api: jest.fn(() => ({
      get: jest.fn(),
      post: jest.fn(),
      patch: jest.fn(),
      delete: jest.fn()
    }))
  };

  return {
    mockLDAPClient,
    mockGraphClient
  };
}

/**
 * Assert response structure for API endpoints
 */
export function assertApiResponse(response: any, expectedStatus: number = 200) {
  expect(response.status).toBe(expectedStatus);
  
  if (response.status >= 200 && response.status < 300) {
    expect(response.body).toBeDefined();
  }
  
  if (response.status >= 400) {
    expect(response.body.error).toBeDefined();
  }
  
  return response.body;
}

/**
 * Assert pagination response structure
 */
export function assertPaginatedResponse(body: any, expectedFields: string[] = []) {
  expect(body.data).toBeDefined();
  expect(Array.isArray(body.data)).toBe(true);
  expect(body.pagination).toBeDefined();
  expect(body.pagination.page).toBeDefined();
  expect(body.pagination.limit).toBeDefined();
  expect(body.pagination.total).toBeDefined();
  
  if (expectedFields.length > 0 && body.data.length > 0) {
    expectedFields.forEach(field => {
      expect(body.data[0]).toHaveProperty(field);
    });
  }
}

/**
 * Generate test correlation ID for tracing E2E test requests
 */
export function generateTestCorrelationId(): string {
  return `e2e-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}