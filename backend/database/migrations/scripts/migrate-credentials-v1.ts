#!/usr/bin/env node
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables first
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// Set up module aliases
import 'module-alias/register';
import moduleAlias from 'module-alias';
moduleAlias.addAlias('@', path.resolve(__dirname, '..'));

// Now import other modules
import { db } from '@/config/database';
import { getCredentialEncryption } from '@/utils/encryption';
import { logger } from '@/utils/logger';

async function migrateCredentialsToV1() {
  const encryption = getCredentialEncryption();
  
  try {
    logger.info('Starting credential encryption migration to v1 format...');
    
    // Find all credentials not using v1 format
    const rows = await db.query(`
      SELECT id, user_id, encrypted_password, encrypted_client_secret
      FROM service_credentials
      WHERE (encrypted_password IS NOT NULL AND encrypted_password NOT LIKE 'v1:%')
         OR (encrypted_client_secret IS NOT NULL AND encrypted_client_secret NOT LIKE 'v1:%')
    `);
    
    logger.info(`Found ${rows.rows.length} credentials to migrate`);
    
    let migrated = 0;
    let failed = 0;
    
    for (const r of rows.rows) {
      try {
        const updates: any = {};
        
        // Migrate password if needed
        if (r.encrypted_password && !r.encrypted_password.startsWith('v1:')) {
          const plain = encryption.decrypt(r.encrypted_password);
          updates.encrypted_password = encryption.encrypt(plain);
          logger.debug(`Migrated password for credential ID ${r.id}`);
        }
        
        // Migrate client secret if needed
        if (r.encrypted_client_secret && !r.encrypted_client_secret.startsWith('v1:')) {
          const plain = encryption.decrypt(r.encrypted_client_secret);
          updates.encrypted_client_secret = encryption.encrypt(plain);
          logger.debug(`Migrated client secret for credential ID ${r.id}`);
        }
        
        // Update if there are changes
        if (Object.keys(updates).length) {
          await db.query(
            `UPDATE service_credentials
             SET encrypted_password = COALESCE($1, encrypted_password),
                 encrypted_client_secret = COALESCE($2, encrypted_client_secret),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $3`,
            [
              updates.encrypted_password || null,
              updates.encrypted_client_secret || null,
              r.id
            ]
          );
          migrated++;
          logger.info(`✓ Migrated credential ID ${r.id} (user_id: ${r.user_id})`);
        }
      } catch (error) {
        failed++;
        logger.error(`✗ Failed to migrate credential ID ${r.id}:`, error);
      }
    }
    
    // Verify migration
    const verifyResult = await db.query(`
      SELECT COUNT(*) as legacy_count
      FROM service_credentials
      WHERE (encrypted_password IS NOT NULL AND encrypted_password NOT LIKE 'v1:%')
         OR (encrypted_client_secret IS NOT NULL AND encrypted_client_secret NOT LIKE 'v1:%')
    `);
    
    const legacyCount = parseInt(verifyResult.rows[0].legacy_count);
    
    logger.info('');
    logger.info('Migration Summary:');
    logger.info(`  Total credentials checked: ${rows.rows.length}`);
    logger.info(`  Successfully migrated: ${migrated}`);
    logger.info(`  Failed: ${failed}`);
    logger.info(`  Remaining legacy format: ${legacyCount}`);
    
    if (legacyCount === 0 && failed === 0) {
      logger.info('✅ All credentials successfully migrated to v1 format!');
    } else if (legacyCount > 0) {
      logger.warn(`⚠️  ${legacyCount} credentials still using legacy format`);
    }
    
  } catch (error) {
    logger.error('Migration error:', error);
    process.exit(1);
  } finally {
    await db.close();
  }
}

// Run the migration
if (require.main === module) {
  migrateCredentialsToV1().catch(error => {
    logger.error('Unhandled error:', error);
    process.exit(1);
  });
}