import { Pool } from 'pg';
import { createClient } from 'redis';
import { logger } from '@/utils/logger';
import { config } from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load test environment variables
config({ path: path.resolve(__dirname, '../../.env.test') });

// Test database connection pool
let testPool: Pool;
let redisClient: any;

export interface TestContext {
  pool: Pool;
  redis: any;
  userId: number;
  adminUserId: number;
}

/**
 * Initialize test database connection with improved pooling
 */
export async function initializeTestDatabase(): Promise<Pool> {
  if (testPool && !testPool.ended) {
    // Test if existing pool is still healthy
    try {
      const client = await testPool.connect();
      await client.query('SELECT 1');
      client.release();
      return testPool;
    } catch (error) {
      logger.warn('Existing test pool unhealthy, recreating:', error);
      try {
        await testPool.end();
      } catch {
        // Ignore cleanup errors
      }
      testPool = undefined as any;
    }
  }

  const connectionString = process.env.DATABASE_URL || 
    `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;

  testPool = new Pool({
    connectionString,
    max: 10, // Increased pool size for E2E tests
    min: 2,  // Keep minimum connections open
    idleTimeoutMillis: 60000, // Increased idle timeout
    connectionTimeoutMillis: 15000, // Increased connection timeout
    // acquireTimeoutMillis: 30000, // Wait longer for connection acquisition - not supported in pg
    statement_timeout: 30000, // Prevent long-running statements
    query_timeout: 30000, // Query-level timeout
    application_name: 'e2e-test-suite'
  });

  // Enhanced connection testing with retry logic
  let retries = 3;
  let lastError;
  
  while (retries > 0) {
    try {
      const client = await testPool.connect();
      await client.query('SELECT 1');
      client.release();
      logger.info('Test database connection established', {
        totalConnections: testPool.totalCount,
        idleConnections: testPool.idleCount,
        waitingClients: testPool.waitingCount
      });
      return testPool;
    } catch (error) {
      lastError = error;
      retries--;
      logger.warn(`Database connection attempt failed, retries left: ${retries}`, error);
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s between retries
      }
    }
  }
  
  // All retries failed
  logger.error('Failed to connect to test database after all retries:', lastError);
  try {
    await testPool.end();
  } catch {
    // Ignore cleanup errors
  }
  testPool = undefined as any;
  throw lastError;
}

/**
 * Initialize test Redis connection with improved error handling
 */
export async function initializeTestRedis(): Promise<any> {
  if (redisClient && redisClient.isReady) {
    try {
      await redisClient.ping();
      return redisClient;
    } catch (error) {
      logger.warn('Existing Redis client unhealthy, recreating:', error);
      try {
        await redisClient.quit();
      } catch {
        // Ignore cleanup errors
      }
      redisClient = undefined as any;
    }
  }

  redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    socket: {
      connectTimeout: 10000,
      // lazyConnect: true, // Not supported in this Redis client version
      reconnectStrategy: (retries) => {
        if (retries > 3) return false;
        return Math.min(retries * 100, 1000);
      }
    },
    name: 'e2e-test-client'
  });

  redisClient.on('error', (err: any) => {
    logger.error('Redis Client Error', err);
  });
  
  redisClient.on('connect', () => {
    logger.info('Redis client connected');
  });
  
  redisClient.on('disconnect', () => {
    logger.warn('Redis client disconnected');
  });

  try {
    await redisClient.connect();
    await redisClient.ping();
    logger.info('Test Redis connection established');
  } catch (error) {
    logger.error('Failed to connect to test Redis:', error);
    try {
      await redisClient.quit();
    } catch {
      // Ignore cleanup errors
    }
    redisClient = undefined as any;
    throw error;
  }

  return redisClient;
}

/**
 * Create test database schema
 */
export async function createTestSchema(pool: Pool): Promise<void> {
  // Schema already exists in test database, skip creation
  const client = await pool.connect();
  try {
    // Check if schema already exists
    const result = await client.query(`
      SELECT COUNT(*) as table_count 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    const tableCount = parseInt(result.rows[0].table_count);
    
    if (tableCount > 0) {
      logger.info('Test database schema already exists, skipping creation');
      return;
    }
    
    // If no tables exist, try to load the main schema
    const schemaPath = path.resolve(__dirname, '../../../database/init.sql');
    
    if (fs.existsSync(schemaPath)) {
      const schema = fs.readFileSync(schemaPath, 'utf8');
      await client.query(schema);
      logger.info('Test database schema created from init.sql');
    } else {
      logger.warn('No schema file found, assuming schema is already created');
    }
  } catch (error) {
    logger.error('Failed to create test schema:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Seed test data with improved transaction isolation
 */
export async function seedTestData(pool: Pool): Promise<{ userId: number; adminUserId: number }> {
  const client = await pool.connect();
  try {
    // Use serializable isolation to prevent deadlocks
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    
    // Add a small delay to prevent concurrent test collisions
    const testSuffix = Date.now().toString().slice(-6);

    // Create test users with unique constraints
    const userResult = await client.query(`
      INSERT INTO users (username, email, display_name, auth_source, is_admin, is_active, password_hash, created_at)
      VALUES 
        ($1, $2, 'Test User', 'local', false, true, '$2a$10$K4h0h6I8.F0h0h6I8.F0hO', NOW()),
        ($3, $4, 'Admin User', 'local', true, true, '$2a$10$K4h0h6I8.F0h0h6I8.F0hO', NOW())
      ON CONFLICT (username) DO UPDATE SET
        email = EXCLUDED.email,
        display_name = EXCLUDED.display_name,
        updated_at = NOW()
      RETURNING id, username
    `, [
      `testuser_${testSuffix}`,
      `testuser_${testSuffix}@test.local`, 
      `adminuser_${testSuffix}`,
      `admin_${testSuffix}@test.local`
    ]);

    const userId = userResult.rows[0].id;
    const adminUserId = userResult.rows[1].id;

    // Create test credentials with explicit locking to prevent deadlocks
    await client.query('LOCK TABLE service_credentials IN SHARE ROW EXCLUSIVE MODE');
    
    // Insert credentials one by one to avoid deadlock on unique constraints
    await client.query(`
      INSERT INTO service_credentials (user_id, service_type, credential_name, username, encrypted_password, is_active, is_default, created_at)
      VALUES ($1, 'ad', $2, 'test-ad-user', 'encrypted-password', true, true, NOW())
      ON CONFLICT (user_id, service_type, credential_name) DO UPDATE SET
        username = EXCLUDED.username,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
    `, [userId, `Test AD Credential ${testSuffix}`]);
    
    await client.query(`
      INSERT INTO service_credentials (user_id, service_type, credential_name, username, encrypted_password, is_active, is_default, created_at)
      VALUES ($1, 'azure', $2, 'test-azure-user', 'encrypted-password', true, false, NOW())
      ON CONFLICT (user_id, service_type, credential_name) DO UPDATE SET
        username = EXCLUDED.username,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
    `, [userId, `Test Azure Credential ${testSuffix}`]);
    
    await client.query(`
      INSERT INTO service_credentials (user_id, service_type, credential_name, username, encrypted_password, is_active, is_default, created_at)
      VALUES ($1, 'ad', $2, 'admin-ad-user', 'encrypted-password', true, true, NOW())
      ON CONFLICT (user_id, service_type, credential_name) DO UPDATE SET
        username = EXCLUDED.username,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
    `, [adminUserId, `Admin AD Credential ${testSuffix}`]);

    // Create test report templates with conflict resolution
    await client.query(`
      INSERT INTO report_templates (name, description, category, data_source, query_config, field_mappings, is_active, created_at)
      VALUES 
        ($1, 'Test AD users report', 'ad', 'ad', '{"fields": ["sAMAccountName", "displayName"], "filters": []}', '{"sAMAccountName": {"displayName": "Username"}, "displayName": {"displayName": "Display Name"}}', true, NOW()),
        ($2, 'Test Azure users report', 'azure', 'azure', '{"fields": ["displayName", "mail"], "filters": []}', '{"displayName": {"displayName": "Display Name"}, "mail": {"displayName": "Email"}}', true, NOW()),
        ($3, 'Test O365 usage report', 'o365', 'o365', '{"fields": ["displayName", "mail"], "filters": []}', '{"displayName": {"displayName": "Display Name"}, "mail": {"displayName": "Email"}}', true, NOW())
      ON CONFLICT (name) DO UPDATE SET
        description = EXCLUDED.description,
        query_config = EXCLUDED.query_config,
        updated_at = NOW()
    `, [
      `Test AD Users Report ${testSuffix}`,
      `Test Azure Users Report ${testSuffix}`, 
      `Test O365 Usage Report ${testSuffix}`
    ]);

    // Get report template IDs for history
    const templateResult = await client.query(`
      SELECT id, name FROM report_templates WHERE name LIKE $1 LIMIT 2
    `, [`%${testSuffix}%`]);
    
    if (templateResult.rows.length > 0) {
      const templateId1 = templateResult.rows[0].id;
      const templateId2 = templateResult.rows[1]?.id || templateId1;
      
      // Create test report history with unique identifiers
      await client.query(`
        INSERT INTO report_history (user_id, template_id, parameters, result_count, status, execution_time_ms, executed_at, completed_at)
        VALUES 
          ($1, $3, '{"days": 30}', 10, 'success', 150, NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day'),
          ($1, $4, '{}', 5, 'success', 200, NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days'),
          ($2, $3, '{"days": 60}', 15, 'success', 175, NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days')
        ON CONFLICT DO NOTHING
      `, [userId, adminUserId, templateId1, templateId2]);
    }
    
    logger.info('Test data seeded successfully', {
      userId,
      adminUserId,
      testSuffix
    });

    await client.query('COMMIT');

    return { userId, adminUserId };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to seed test data:', error);
    
    // If it's a serialization failure, it might be safe to retry once
    if ((error as any).code === '40001' && !(client as any).retried) {
      logger.warn('Serialization failure detected, retrying once...');
      (client as any).retried = true;
      await new Promise(resolve => setTimeout(resolve, Math.random() * 1000));
      return seedTestData(pool);
    }
    
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Clean up test database with improved error handling
 */
export async function cleanupTestDatabase(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Get list of existing tables
    const tablesResult = await client.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename NOT LIKE 'pg_%'
      AND tablename NOT LIKE 'sql_%'
      ORDER BY tablename
    `);
    const existingTables = tablesResult.rows.map(row => row.tablename);
    
    // Tables to clean in dependency order (child tables first)
    const tablesToClean = [
      'audit_logs',
      'system_logs', 
      'search_history',
      'notifications',
      'report_history',
      'report_schedules',
      'custom_report_templates',
      'service_credentials',
      'user_sessions',
      'field_metadata',
      'report_templates',
      'users'
    ];
    
    // Disable foreign key checks temporarily for faster cleanup
    await client.query('SET session_replication_role = replica');
    
    // Only truncate tables that exist
    for (const table of tablesToClean) {
      if (existingTables.includes(table)) {
        try {
          await client.query(`TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE`);
          logger.debug(`Cleaned table: ${table}`);
        } catch (error) {
          logger.warn(`Failed to clean table ${table}:`, (error as Error).message);
          // Continue with other tables
        }
      }
    }
    
    // Re-enable foreign key checks
    await client.query('SET session_replication_role = DEFAULT');
    
    await client.query('COMMIT');
    logger.info('Test database cleaned up', {
      tablesFound: existingTables.length,
      tablesCleaned: tablesToClean.filter(t => existingTables.includes(t)).length
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to cleanup test database:', error);
    // Don't throw on cleanup failure - just log it
  } finally {
    // Re-enable foreign key checks in case of error
    try {
      await client.query('SET session_replication_role = DEFAULT');
    } catch {
      // Ignore
    }
    client.release();
  }
}

/**
 * Setup test context with improved timing and error handling
 */
export async function setupTestContext(): Promise<TestContext> {
  logger.info('Setting up test context...');
  const startTime = Date.now();
  
  try {
    // Initialize connections with timeout
    const connectionPromises = [
      initializeTestDatabase(),
      initializeTestRedis()
    ];
    
    const [pool, redis] = await Promise.all(connectionPromises);
    logger.info('Test connections established', {
      duration: Date.now() - startTime
    });
    
    // Setup database schema and data
    const setupStart = Date.now();
    await cleanupTestDatabase(pool);
    await createTestSchema(pool);
    
    const { userId, adminUserId } = await seedTestData(pool);
    
    logger.info('Test context setup complete', {
      setupDuration: Date.now() - setupStart,
      totalDuration: Date.now() - startTime,
      userId,
      adminUserId
    });
    
    return {
      pool,
      redis,
      userId,
      adminUserId
    };
  } catch (error) {
    logger.error('Failed to setup test context:', error);
    throw new Error(`Test context setup failed: ${(error as Error).message}`);
  }
}

/**
 * Teardown test context with improved cleanup
 */
export async function teardownTestContext(context: TestContext): Promise<void> {
  logger.info('Tearing down test context...');
  
  try {
    if (process.env.TEST_CLEANUP_AFTER_RUN !== 'false') {
      await cleanupTestDatabase(context.pool);
    }
  } catch (error) {
    logger.warn('Failed to cleanup test database during teardown:', error as Error);
  }
  
  try {
    if (context.pool && !context.pool.ended) {
      await context.pool.end();
      logger.debug('Database pool closed');
    }
  } catch (error) {
    logger.warn('Failed to close database pool:', error as Error);
  }
  
  try {
    if (context.redis && context.redis.isReady) {
      await context.redis.quit();
      logger.debug('Redis connection closed');
    }
  } catch (error) {
    logger.warn('Failed to close Redis connection:', error as Error);
  }
  
  logger.info('Test context teardown complete');
}

/**
 * Create a mock LDAP connection for testing
 */
export function createMockLDAPConnection() {
  return {
    bind: jest.fn((dn: string, password: string, callback: Function) => {
      callback(null);
    }),
    search: jest.fn((baseDN: string, options: any, callback: Function) => {
      const mockResults = [
        {
          dn: 'CN=Test User,CN=Users,DC=test,DC=local',
          attributes: {
            sAMAccountName: 'testuser',
            displayName: 'Test User',
            mail: 'testuser@test.local',
            userAccountControl: 512,
            whenCreated: '20240101000000.0Z',
            lastLogon: '131976789876543210'
          }
        }
      ];
      
      const searchEntry = {
        on: jest.fn((event: string, handler: Function) => {
          if (event === 'searchEntry') {
            mockResults.forEach(entry => handler({ object: entry }));
          } else if (event === 'end') {
            handler({ status: 0 });
          }
        })
      };
      
      callback(null, searchEntry);
    }),
    unbind: jest.fn((callback: Function) => {
      callback(null);
    })
  };
}

/**
 * Create a mock Graph API client for testing
 */
export function createMockGraphClient() {
  return {
    api: jest.fn((_path: string) => ({
      get: jest.fn().mockResolvedValue({
        value: [
          {
            id: 'test-user-1',
            displayName: 'Test User 1',
            mail: 'testuser1@test.com',
            userPrincipalName: 'testuser1@test.com',
            accountEnabled: true
          }
        ]
      }),
      post: jest.fn().mockResolvedValue({ id: 'new-id' }),
      patch: jest.fn().mockResolvedValue({ id: 'updated-id' }),
      delete: jest.fn().mockResolvedValue(null)
    }))
  };
}

/**
 * Wait for async operations to complete
 */
export async function waitForAsync(ms: number = 100): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create test JWT token
 * @deprecated Use createTestToken from @/auth/test-utils/auth-test.utils instead
 */
export function createTestToken(userId: number, isAdmin: boolean = false): string {
  // Import and use the unified auth test utilities
  const { createTestToken: unifiedCreateTestToken } = require('@/auth/test-utils/auth-test.utils');
  return unifiedCreateTestToken(userId, isAdmin);
}