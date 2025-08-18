const { Pool } = require('pg');
const crypto = require('crypto');

// Simple encryption class (matching the TypeScript implementation)
class CredentialEncryption {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32;
    this.ivLength = 16;
    this.tagLength = 16;
    this.saltLength = 32;
    this.iterations = 100000;
    
    const encryptionKey = process.env.CREDENTIAL_ENCRYPTION_KEY;
    if (!encryptionKey || encryptionKey.length < 32) {
      throw new Error('CREDENTIAL_ENCRYPTION_KEY must be set and at least 32 characters');
    }
    
    this.encryptionPassword = encryptionKey;
    
    // Legacy master key for decryption
    const salt = process.env.CREDENTIAL_ENCRYPTION_SALT
      ? Buffer.from(process.env.CREDENTIAL_ENCRYPTION_SALT, 'hex')
      : Buffer.alloc(32); // Dummy salt if not set
      
    this.masterKey = crypto.pbkdf2Sync(encryptionKey, salt, this.iterations, this.keyLength, 'sha256');
  }
  
  decrypt(encryptedData) {
    let combined;
    let key;
    let offset = 0;
    
    if (encryptedData.startsWith('v1:')) {
      // New format with embedded salt
      combined = Buffer.from(encryptedData.slice(3), 'base64');
      const salt = combined.slice(0, this.saltLength);
      offset += this.saltLength;
      key = crypto.pbkdf2Sync(this.encryptionPassword, salt, this.iterations, this.keyLength, 'sha256');
    } else {
      // Legacy format
      combined = Buffer.from(encryptedData, 'base64');
      key = this.masterKey;
    }
    
    const iv = combined.slice(offset, offset + this.ivLength);
    const authTag = combined.slice(offset + this.ivLength, offset + this.ivLength + this.tagLength);
    const encrypted = combined.slice(offset + this.ivLength + this.tagLength);
    
    const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
    decipher.setAuthTag(authTag);
    
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);
    
    return decrypted.toString('utf8');
  }
  
  encrypt(plaintext) {
    // Generate per-credential salt
    const salt = crypto.randomBytes(this.saltLength);
    const key = crypto.pbkdf2Sync(this.encryptionPassword, salt, this.iterations, this.keyLength, 'sha256');
    
    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);
    
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final()
    ]);
    
    const authTag = cipher.getAuthTag();
    const combined = Buffer.concat([salt, iv, authTag, encrypted]);
    
    return `v1:${combined.toString('base64')}`;
  }
}

async function migrate() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });
  
  const encryption = new CredentialEncryption();
  
  try {
    console.log('Starting v1 encryption migration...');
    
    // Get all credentials needing migration
    const result = await pool.query(`
      SELECT id, encrypted_password, encrypted_client_secret
      FROM service_credentials
      WHERE (encrypted_password IS NOT NULL AND encrypted_password NOT LIKE 'v1:%')
         OR (encrypted_client_secret IS NOT NULL AND encrypted_client_secret NOT LIKE 'v1:%')
    `);
    
    console.log(`Found ${result.rows.length} credentials to migrate`);
    
    let migrated = 0;
    let failed = 0;
    
    for (const row of result.rows) {
      try {
        const updates = {};
        
        if (row.encrypted_password && !row.encrypted_password.startsWith('v1:')) {
          const plain = encryption.decrypt(row.encrypted_password);
          updates.encrypted_password = encryption.encrypt(plain);
          console.log(`  Migrating password for credential ID ${row.id}`);
        }
        
        if (row.encrypted_client_secret && !row.encrypted_client_secret.startsWith('v1:')) {
          const plain = encryption.decrypt(row.encrypted_client_secret);
          updates.encrypted_client_secret = encryption.encrypt(plain);
          console.log(`  Migrating client secret for credential ID ${row.id}`);
        }
        
        if (Object.keys(updates).length > 0) {
          await pool.query(
            `UPDATE service_credentials
             SET encrypted_password = COALESCE($1, encrypted_password),
                 encrypted_client_secret = COALESCE($2, encrypted_client_secret),
                 encryption_version = 'v1',
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $3`,
            [updates.encrypted_password || null, updates.encrypted_client_secret || null, row.id]
          );
          
          // Update migration status
          if (updates.encrypted_password) {
            await pool.query(
              `UPDATE encryption_migration_status 
               SET migration_status = 'completed', migrated_at = CURRENT_TIMESTAMP
               WHERE credential_id = $1 AND field_name = 'encrypted_password'`,
              [row.id]
            );
          }
          
          if (updates.encrypted_client_secret) {
            await pool.query(
              `UPDATE encryption_migration_status 
               SET migration_status = 'completed', migrated_at = CURRENT_TIMESTAMP
               WHERE credential_id = $1 AND field_name = 'encrypted_client_secret'`,
              [row.id]
            );
          }
          
          migrated++;
          console.log(`  ✓ Migrated credential ID ${row.id}`);
        }
      } catch (error) {
        failed++;
        console.error(`  ✗ Failed to migrate credential ID ${row.id}:`, error.message);
        
        // Log error to migration status
        await pool.query(
          `UPDATE encryption_migration_status 
           SET migration_status = 'failed', error_message = $1, migrated_at = CURRENT_TIMESTAMP
           WHERE credential_id = $2`,
          [error.message, row.id]
        );
      }
    }
    
    // Final verification
    const verify = await pool.query(`
      SELECT COUNT(*) as count
      FROM service_credentials
      WHERE (encrypted_password IS NOT NULL AND encrypted_password NOT LIKE 'v1:%')
         OR (encrypted_client_secret IS NOT NULL AND encrypted_client_secret NOT LIKE 'v1:%')
    `);
    
    console.log('\nMigration Summary:');
    console.log(`  Total migrated: ${migrated}`);
    console.log(`  Failed: ${failed}`);
    console.log(`  Remaining legacy: ${verify.rows[0].count}`);
    
    if (verify.rows[0].count === 0 && failed === 0) {
      console.log('\n✅ All credentials successfully migrated to v1 format!');
    }
    
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run migration
migrate().catch(console.error);