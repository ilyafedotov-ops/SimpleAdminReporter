import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function runMigration(filename: string): Promise<void> {
  const filePath = path.join(__dirname, '../../database/migrations', filename);
  
  if (!fs.existsSync(filePath)) {
    logger.warn(`Migration file not found: ${filename}`);
    return;
  }

  try {
    const sql = fs.readFileSync(filePath, 'utf8');
    await pool.query(sql);
    logger.info(`Successfully ran migration: ${filename}`);
  } catch (error) {
    logger.error(`Failed to run migration ${filename}:`, error);
    throw error;
  }
}

async function runAllMigrations(): Promise<void> {
  try {
    // Run specific migration
    const migrationFile = process.argv[2];
    
    if (migrationFile) {
      // Run single migration
      await runMigration(migrationFile);
    } else {
      // Run all migrations in order
      const migrationsDir = path.join(__dirname, '../../database/migrations');
      const files = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql') && !f.includes('rollback'))
        .sort();
      
      for (const file of files) {
        await runMigration(file);
      }
    }
    
    logger.info('All migrations completed successfully');
  } catch (error) {
    logger.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run migrations
runAllMigrations();