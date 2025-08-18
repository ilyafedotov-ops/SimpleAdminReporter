#!/usr/bin/env node
import dotenv from 'dotenv';
import path from 'path';
import { db } from '../config/database';
import { getCredentialEncryption } from '../utils/encryption';
import { logger } from '../utils/logger';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

interface CredentialRow {
  id: number;
  encrypted_password?: string;
  encrypted_client_secret?: string;
}

/**
 * Migration script to convert legacy encrypted credentials to v1 format
 * 
 * This script:
 * 1. Finds all credentials with legacy format (no v1: prefix)
 * 2. Decrypts them using the legacy method
 * 3. Re-encrypts them using the v1 format (with embedded salt)
 * 4. Updates the database
 */
async function migrateToV1Format() {
  const encryption = getCredentialEncryption();
  let totalMigrated = 0;
  let totalFailed = 0;

  try {
    logger.info('Starting encryption format migration to v1...');

    // Begin transaction
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');

      // Find all credentials with encrypted data
      const result = await client.query<CredentialRow>(`
        SELECT id, encrypted_password, encrypted_client_secret
        FROM service_credentials
        WHERE encrypted_password IS NOT NULL 
           OR encrypted_client_secret IS NOT NULL
      `);

      logger.info(`Found ${result.rows.length} credentials to check`);

      for (const row of result.rows) {
        let passwordMigrated = false;
        let secretMigrated = false;

        // Migrate encrypted_password if present and in legacy format
        if (row.encrypted_password && !row.encrypted_password.startsWith('v1:')) {
          try {
            logger.info(`Migrating password for credential ID ${row.id}...`);
            
            // Decrypt using current method (handles both formats)
            const decrypted = encryption.decrypt(row.encrypted_password);
            
            // Re-encrypt using v1 format
            const reencrypted = encryption.encrypt(decrypted);
            
            // Verify it's v1 format
            if (!reencrypted.startsWith('v1:')) {
              throw new Error('Re-encryption did not produce v1 format');
            }

            // Update in database
            await client.query(
              'UPDATE service_credentials SET encrypted_password = $1 WHERE id = $2',
              [reencrypted, row.id]
            );
            
            passwordMigrated = true;
            logger.info(`✓ Password migrated for credential ID ${row.id}`);
          } catch (error) {
            logger.error(`Failed to migrate password for credential ID ${row.id}:`, error);
            totalFailed++;
          }
        }

        // Migrate encrypted_client_secret if present and in legacy format
        if (row.encrypted_client_secret && !row.encrypted_client_secret.startsWith('v1:')) {
          try {
            logger.info(`Migrating client secret for credential ID ${row.id}...`);
            
            // Decrypt using current method
            const decrypted = encryption.decrypt(row.encrypted_client_secret);
            
            // Re-encrypt using v1 format
            const reencrypted = encryption.encrypt(decrypted);
            
            // Verify it's v1 format
            if (!reencrypted.startsWith('v1:')) {
              throw new Error('Re-encryption did not produce v1 format');
            }

            // Update in database
            await client.query(
              'UPDATE service_credentials SET encrypted_client_secret = $1 WHERE id = $2',
              [reencrypted, row.id]
            );
            
            secretMigrated = true;
            logger.info(`✓ Client secret migrated for credential ID ${row.id}`);
          } catch (error) {
            logger.error(`Failed to migrate client secret for credential ID ${row.id}:`, error);
            totalFailed++;
          }
        }

        if (passwordMigrated || secretMigrated) {
          totalMigrated++;
        }
      }

      // Verify migration
      const verifyResult = await client.query<{ legacy_count: string }>(`
        SELECT COUNT(*) as legacy_count
        FROM service_credentials
        WHERE (encrypted_password IS NOT NULL AND NOT encrypted_password LIKE 'v1:%')
           OR (encrypted_client_secret IS NOT NULL AND NOT encrypted_client_secret LIKE 'v1:%')
      `);

      const legacyCount = parseInt(verifyResult.rows[0].legacy_count);
      
      if (legacyCount > 0) {
        throw new Error(`${legacyCount} credentials still in legacy format after migration`);
      }

      await client.query('COMMIT');
      logger.info(`✅ Migration completed successfully!`);
      logger.info(`   Total credentials migrated: ${totalMigrated}`);
      logger.info(`   Total failures: ${totalFailed}`);

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    logger.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await db.close();
  }
}

// Run migration
migrateToV1Format().catch(error => {
  logger.error('Unhandled error:', error);
  process.exit(1);
});