import { db } from '@/config/database';
import { logger } from '@/utils/logger';
import fs from 'fs';
import path from 'path';

async function runMigrations() {
  try {
    logger.info('Starting database migrations...');
    
    // Read the SQL migration file
    const migrationPath = path.join(__dirname, 'create-logs-materialized-views.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Execute the migration
    await db.query(migrationSQL);
    
    logger.info('Materialized views created successfully');
    
    // Initial data population
    logger.info('Refreshing materialized views with initial data...');
    await db.query('SELECT refresh_logs_materialized_views()');
    
    logger.info('Database migrations completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run migrations if this file is executed directly
if (require.main === module) {
  runMigrations();
}