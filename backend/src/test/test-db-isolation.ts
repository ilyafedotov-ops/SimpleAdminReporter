/**
 * Test Database Isolation Utilities
 * Provides database isolation for concurrent test execution
 */

import { Pool } from 'pg';
import { logger } from '@/utils/logger';

export interface IsolatedTestDatabase {
  pool: Pool;
  schemaName: string;
  cleanup: () => Promise<void>;
}

/**
 * Creates an isolated database schema for test execution
 * This allows multiple test suites to run concurrently without interference
 */
export async function createIsolatedTestDatabase(): Promise<IsolatedTestDatabase> {
  const testId = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const schemaName = `test_schema_${testId}`;
  
  const connectionString = process.env.DATABASE_URL || 
    `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;

  // Create main pool for schema creation
  const mainPool = new Pool({
    connectionString,
    max: 2,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  try {
    // Create isolated schema
    const client = await mainPool.connect();
    try {
      await client.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
      await client.query(`SET search_path TO "${schemaName}"`);
      
      logger.info('Created isolated test schema', { schemaName });
    } finally {
      client.release();
    }
    
    // Create schema-specific pool
    const schemaPool = new Pool({
      connectionString,
      max: 10,
      min: 2,
      idleTimeoutMillis: 60000,
      connectionTimeoutMillis: 15000,
      options: `-c search_path="${schemaName}"`,
      application_name: `e2e-test-${testId}`
    });
    
    // Create tables in the isolated schema
    await createSchemaTablesInIsolation(schemaPool, schemaName);
    
    const cleanup = async () => {
      logger.info('Cleaning up isolated test schema', { schemaName });
      try {
        await schemaPool.end();
        
        const cleanupClient = await mainPool.connect();
        try {
          await cleanupClient.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
          logger.info('Isolated test schema dropped', { schemaName });
        } finally {
          cleanupClient.release();
        }
      } catch (error) {
        logger.error('Failed to cleanup isolated schema:', error);
      } finally {
        await mainPool.end();
      }
    };
    
    return {
      pool: schemaPool,
      schemaName,
      cleanup
    };
    
  } catch (error) {
    await mainPool.end();
    throw error;
  }
}

/**
 * Creates the necessary tables in the isolated schema
 */
async function createSchemaTablesInIsolation(pool: Pool, schemaName: string): Promise<void> {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Create essential tables for testing
    const createTablesSQL = `
      SET search_path TO "${schemaName}";
      
      -- Extensions (if needed)
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";
      
      -- Users table
      CREATE TABLE users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(255) UNIQUE NOT NULL,
          display_name VARCHAR(255) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255),
          auth_source VARCHAR(50) NOT NULL DEFAULT 'local',
          is_admin BOOLEAN DEFAULT FALSE,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Service credentials table
      CREATE TABLE service_credentials (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          service_type VARCHAR(50) NOT NULL,
          credential_name VARCHAR(255) NOT NULL,
          username VARCHAR(255),
          encrypted_password TEXT,
          encrypted_client_secret TEXT,
          tenant_id VARCHAR(255),
          client_id VARCHAR(255),
          server VARCHAR(255),
          base_dn VARCHAR(500),
          port INTEGER DEFAULT 389,
          use_ssl BOOLEAN DEFAULT FALSE,
          is_active BOOLEAN DEFAULT TRUE,
          is_default BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, service_type, credential_name)
      );

      -- Report templates table
      CREATE TABLE report_templates (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          name VARCHAR(255) NOT NULL UNIQUE,
          description TEXT,
          category VARCHAR(100) NOT NULL,
          data_source VARCHAR(50) NOT NULL,
          query_config JSONB NOT NULL,
          field_mappings JSONB NOT NULL,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Report history table
      CREATE TABLE report_history (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          user_id INTEGER NOT NULL REFERENCES users(id),
          template_id UUID REFERENCES report_templates(id),
          parameters JSONB,
          result_count INTEGER,
          status VARCHAR(20) DEFAULT 'pending',
          execution_time_ms INTEGER,
          executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          completed_at TIMESTAMP WITH TIME ZONE,
          error_message TEXT
      );

      -- Audit logs table
      CREATE TABLE audit_logs (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          user_id INTEGER REFERENCES users(id),
          event_type VARCHAR(100) NOT NULL,
          event_action VARCHAR(100) NOT NULL,
          event_result VARCHAR(50) NOT NULL,
          event_details JSONB,
          ip_address INET,
          user_agent TEXT,
          session_id VARCHAR(255),
          correlation_id VARCHAR(255),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- System logs table
      CREATE TABLE system_logs (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          log_level VARCHAR(20) NOT NULL,
          source VARCHAR(100) NOT NULL,
          category VARCHAR(100),
          message TEXT NOT NULL,
          details JSONB,
          correlation_id VARCHAR(255),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Create indexes
      CREATE INDEX idx_users_username ON users(username);
      CREATE INDEX idx_service_credentials_user_id ON service_credentials(user_id);
      CREATE INDEX idx_report_history_user_id ON report_history(user_id);
      CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
      CREATE INDEX idx_audit_logs_correlation_id ON audit_logs(correlation_id);
      CREATE INDEX idx_system_logs_correlation_id ON system_logs(correlation_id);
    `;
    
    await client.query(createTablesSQL);
    await client.query('COMMIT');
    
    logger.info('Tables created in isolated schema', { schemaName });
    
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to create tables in isolated schema:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Creates a connection pool with proper isolation settings
 */
export function createIsolatedPool(schemaName: string): Pool {
  const connectionString = process.env.DATABASE_URL || 
    `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;

  return new Pool({
    connectionString,
    max: 10,
    min: 2,
    idleTimeoutMillis: 60000,
    connectionTimeoutMillis: 15000,
    // acquireTimeoutMillis: 30000, // Not supported in pg module
    options: `-c search_path="${schemaName}"`,
    application_name: `isolated-test-${schemaName}`
  });
}

/**
 * Enhanced test data seeding for isolated schemas
 */
export async function seedIsolatedTestData(pool: Pool, schemaName: string): Promise<{ userId: number; adminUserId: number }> {
  const client = await pool.connect();
  const testSuffix = Date.now().toString().slice(-6);
  
  try {
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    await client.query(`SET search_path TO "${schemaName}"`);
    
    // Create test users
    const userResult = await client.query(`
      INSERT INTO users (username, email, display_name, auth_source, is_admin, is_active, password_hash, created_at)
      VALUES 
        ($1, $2, 'Test User', 'local', false, true, '$2a$10$K4h0h6I8.F0h0h6I8.F0hO', NOW()),
        ($3, $4, 'Admin User', 'local', true, true, '$2a$10$K4h0h6I8.F0h0h6I8.F0hO', NOW())
      RETURNING id, username
    `, [
      `testuser_${testSuffix}`,
      `testuser_${testSuffix}@test.local`, 
      `adminuser_${testSuffix}`,
      `admin_${testSuffix}@test.local`
    ]);

    const userId = userResult.rows[0].id;
    const adminUserId = userResult.rows[1].id;

    // Create service credentials
    await client.query(`
      INSERT INTO service_credentials (user_id, service_type, credential_name, username, encrypted_password, is_active, is_default, created_at)
      VALUES 
        ($1, 'ad', $2, 'test-ad-user', 'encrypted-password', true, true, NOW()),
        ($1, 'azure', $3, 'test-azure-user', 'encrypted-password', true, false, NOW()),
        ($4, 'ad', $5, 'admin-ad-user', 'encrypted-password', true, true, NOW())
    `, [
      userId, `Test AD Credential ${testSuffix}`,
      `Test Azure Credential ${testSuffix}`,
      adminUserId, `Admin AD Credential ${testSuffix}`
    ]);

    await client.query('COMMIT');
    
    logger.info('Isolated test data seeded successfully', {
      schemaName,
      userId,
      adminUserId,
      testSuffix
    });

    return { userId, adminUserId };
    
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to seed isolated test data:', error);
    throw error;
  } finally {
    client.release();
  }
}