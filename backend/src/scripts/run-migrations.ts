import logger from '../utils/logger';
import { Pool } from 'pg';



async function runMigrations() {
  logger.info('Starting migration process...');
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@postgres:5432/reporting'
  });

  try {
    // First migration: Fix token_encryption_audit foreign key constraint
    logger.info('Running migration 1: Fix token_encryption_audit foreign key constraint');
    await pool.query(`
      ALTER TABLE token_encryption_audit 
      ALTER COLUMN credential_id DROP NOT NULL
    `);
    logger.info('✓ Migration 1 completed successfully');

    // Second migration: Add expires_at column to service_credentials
    logger.info('Running migration 2: Add expires_at column to service_credentials');
    
    // Check if column already exists
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'service_credentials' 
      AND column_name = 'expires_at'
    `);
    
    if (columnCheck.rows.length === 0) {
      await pool.query(`
        ALTER TABLE service_credentials
        ADD COLUMN expires_at TIMESTAMPTZ
      `);
      logger.info('✓ Migration 2 completed successfully');
    } else {
      logger.info('✓ Migration 2 skipped - expires_at column already exists');
    }

    logger.info('All migrations completed successfully!');
  } catch (error) {
    logger.error('Migration failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  runMigrations()
    .then(() => {
      logger.info('Migration process completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Migration process failed:', error);
      process.exit(1);
    });
}

export { runMigrations };