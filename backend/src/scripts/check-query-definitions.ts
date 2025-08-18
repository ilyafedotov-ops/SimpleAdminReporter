import 'dotenv/config';
import { db } from '@/config/database';
import { logger } from '@/utils/logger';

async function checkQueryDefinitions() {
  try {
    // Check if table exists
    const tableExists = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'query_definitions'
      );
    `);
    
    logger.info('Table exists:', tableExists.rows[0].exists);
    
    if (tableExists.rows[0].exists) {
      // Check current data
      const data = await db.query(`
        SELECT 
          id, 
          name, 
          data_source,
          pg_typeof(definition_data) as data_type,
          definition_data
        FROM query_definitions 
        LIMIT 5
      `);
      
      logger.info(`Found ${data.rowCount} query definitions`);
      
      for (const row of data.rows) {
        logger.info('Query definition:', {
          id: row.id,
          name: row.name,
          dataSource: row.data_source,
          dataType: row.data_type,
          definitionDataType: typeof row.definition_data,
          isObject: typeof row.definition_data === 'object'
        });
        
        // Check if it's already an object or needs parsing
        if (typeof row.definition_data === 'string') {
          logger.warn(`Definition ${row.id} is stored as string, should be JSONB object`);
        }
      }
      
      // Clear the table for fresh start
      await db.query('TRUNCATE TABLE query_definitions CASCADE');
      logger.info('Cleared query_definitions table');
    }
    
    process.exit(0);
  } catch (error) {
    logger.error('Error checking query definitions:', error);
    process.exit(1);
  }
}

checkQueryDefinitions();