import { db } from '@/config/database';
import { logger } from '@/utils/logger';
import fs from 'fs/promises';
import path from 'path';

async function seedDatabase() {
  logger.info('Starting database seeding...');
  
  try {
    // Check if we already have templates
    const existingTemplates = await db.query('SELECT COUNT(*) as count FROM report_templates');
    const templateCount = parseInt(existingTemplates.rows[0].count);
    
    if (templateCount > 0) {
      logger.warn(`Database already contains ${templateCount} report templates. Skipping seed to avoid duplicates.`);
      logger.info('To force re-seeding, manually truncate the report_templates table first.');
      return;
    }

    // Read the SQL seed file
    const seedFilePath = path.join(__dirname, '../../../database/seed-templates.sql');
    const seedSQL = await fs.readFile(seedFilePath, 'utf-8');
    
    // Execute the seed SQL
    logger.info('Executing seed SQL...');
    await db.query(seedSQL);
    
    // Verify the seeding
    const newTemplates = await db.query('SELECT COUNT(*) as count FROM report_templates');
    const newCount = parseInt(newTemplates.rows[0].count);
    
    const fieldMetadata = await db.query('SELECT COUNT(*) as count FROM field_metadata');
    const fieldCount = parseInt(fieldMetadata.rows[0].count);
    
    logger.info(`✅ Database seeding completed successfully!`);
    logger.info(`   - Report templates created: ${newCount}`);
    logger.info(`   - Field metadata entries created: ${fieldCount}`);
    
    // Show sample of created templates
    const sampleTemplates = await db.query(
      'SELECT name, category FROM report_templates ORDER BY category, name LIMIT 10'
    );
    
    logger.info('Sample templates created:');
    sampleTemplates.rows.forEach((template: any) => {
      logger.info(`   - [${template.category}] ${template.name}`);
    });
    
  } catch (error) {
    logger.error('Database seeding failed:', error);
    throw error;
  } finally {
    // Close database connection if needed
    // await db.end();
  }
}

// Run the seeding if this file is executed directly
if (require.main === module) {
  seedDatabase()
    .then(() => {
      logger.info('Seeding process completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Seeding process failed:', error);
      process.exit(1);
    });
}

export { seedDatabase };