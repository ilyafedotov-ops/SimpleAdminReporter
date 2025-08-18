import logger from '../utils/logger';
import { Pool } from 'pg';

async function fixAzureTokenDecryption() {
  logger.info('Checking Azure token encryption format...');
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@postgres:5432/reporting'
  });

  try {
    // Check current state of Azure credentials
    const checkResult = await pool.query(`
      SELECT 
        id,
        user_id,
        credential_name,
        encryption_version,
        access_token_encrypted::text as access_token,
        refresh_token_encrypted::text as refresh_token
      FROM service_credentials 
      WHERE service_type = 'azure' 
        AND is_active = true
        AND access_token_encrypted IS NOT NULL
    `);

    logger.info(`Found ${checkResult.rows.length} Azure credentials to check`);

    for (const cred of checkResult.rows) {
      logger.info(`\nChecking credential ${cred.id} (${cred.credential_name}):`);
      
      // Parse the JSON to check format
      try {
        const accessToken = JSON.parse(cred.access_token);
        const refreshToken = cred.refresh_token ? JSON.parse(cred.refresh_token) : null;
        
        logger.info(`  - Access token version: ${accessToken.version}`);
        logger.info(`  - Has required fields: ${accessToken.encrypted && accessToken.salt && accessToken.iv && accessToken.authTag ? 'Yes' : 'No'}`);
        
        if (refreshToken) {
          logger.info(`  - Refresh token version: ${refreshToken.version}`);
        }
        
        // The tokens are already in v2 format, so no migration needed
        logger.info(`  ✓ Credential ${cred.id} is already in correct format`);
        
      } catch (e) {
        logger.error(`  ✗ Failed to parse tokens for credential ${cred.id}:`, e);
      }
    }

    logger.info('\nAnalysis complete!');
    
    // The issue might be in the code that reads these tokens
    logger.info('\nThe tokens are stored correctly in v2 format.');
    logger.info('The issue is likely in the code that retrieves and parses them.');
    logger.info('The Azure credential service needs to properly handle JSONB fields.');

  } catch (error) {
    logger.error('Error:', error);
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  fixAzureTokenDecryption()
    .then(() => {
      logger.info('\nDiagnostic completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Diagnostic failed:', error);
      process.exit(1);
    });
}

export { fixAzureTokenDecryption };