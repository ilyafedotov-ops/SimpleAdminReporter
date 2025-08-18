import { Pool } from 'pg';
import logger from '../utils/logger';

async function fixAzureTemplates() {
  logger.info('Fixing problematic Azure AD templates...');
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@postgres:5432/reporting'
  });

  try {
    // Update inactive_azure_users to use the new graph query system
    logger.info('Updating inactive_azure_users template...');
    await pool.query(`
      UPDATE report_templates 
      SET 
        query_template = '{"queryId": "inactive_users"}'::jsonb,
        query_type = 'graph',
        default_parameters = '{"days": 90}'::jsonb,
        updated_at = CURRENT_TIMESTAMP
      WHERE report_type = 'inactive_azure_users'
    `);
    logger.info('✓ Updated inactive_azure_users template');

    // Update graph_inactive_users to use the proper query
    logger.info('Updating graph_inactive_users template...');
    await pool.query(`
      UPDATE report_templates 
      SET 
        query_template = '{"queryId": "inactive_users"}'::jsonb,
        query_type = 'graph',
        default_parameters = '{"days": 90}'::jsonb,
        updated_at = CURRENT_TIMESTAMP
      WHERE report_type = 'graph_inactive_users'
    `);
    logger.info('✓ Updated graph_inactive_users template');

    // Update guest_users template to remove signInActivity expand
    logger.info('Updating guest_users template...');
    await pool.query(`
      UPDATE report_templates 
      SET 
        query_template = '{"queryId": "guest_users"}'::jsonb,
        query_type = 'graph',
        updated_at = CURRENT_TIMESTAMP
      WHERE report_type = 'guest_users'
    `);
    logger.info('✓ Updated guest_users template');

    // Update MFA status report to use new query system
    logger.info('Updating mfa_status template...');
    await pool.query(`
      UPDATE report_templates 
      SET 
        query_template = '{"queryId": "mfa_status"}'::jsonb,
        query_type = 'graph',
        updated_at = CURRENT_TIMESTAMP
      WHERE report_type = 'mfa_status'
    `);
    logger.info('✓ Updated mfa_status template');

    // Update BitLocker keys report
    logger.info('Updating bitlocker_keys template...');
    await pool.query(`
      UPDATE report_templates 
      SET 
        query_template = '{"queryId": "bitlocker_recovery_keys"}'::jsonb,
        query_type = 'graph',
        updated_at = CURRENT_TIMESTAMP
      WHERE report_type = 'bitlocker_keys'
    `);
    logger.info('✓ Updated bitlocker_keys template');

    logger.info('All templates updated successfully!');
    
    // Show the updated templates
    const result = await pool.query(`
      SELECT name, report_type, query_type, query_template
      FROM report_templates 
      WHERE category = 'azure' 
      AND report_type IN ('inactive_azure_users', 'graph_inactive_users', 'guest_users', 'mfa_status', 'bitlocker_keys')
      ORDER BY name
    `);
    
    logger.info('Updated templates:');
    result.rows.forEach(row => {
      logger.info(`- ${row.name} (${row.report_type}): ` + JSON.stringify(row.query_template));
    });

  } catch (error) {
    logger.error('Error updating templates:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  fixAzureTemplates()
    .then(() => {
      logger.info('Template fix completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Template fix failed:', error);
      process.exit(1);
    });
}

export { fixAzureTemplates };
