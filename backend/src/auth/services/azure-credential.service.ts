import { logger } from '@/utils/logger';
import { db } from '@/config/database';
import { cryptoService } from '@/services/crypto.service';
import { createError } from '@/middleware/error.middleware';

export interface AzureCredentialData {
  access_token_encrypted: any;
  refresh_token_encrypted?: any;
  expires_at: Date;
  token_type: string;
  scope?: string;
  user_principal_name?: string;
}

export class AzureCredentialService {
  /**
   * Store Azure credentials with encryption
   */
  async storeCredentials(userId: number, data: AzureCredentialData): Promise<number> {
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');

      // Check if credentials already exist for this user
      const existing = await client.query(
        'SELECT id FROM service_credentials WHERE user_id = $1 AND service_type = $2',
        [userId, 'azure']
      );

      let credentialId: number;

      if (existing.rows.length > 0) {
        // Update existing credentials
        const result = await client.query(`
          UPDATE service_credentials 
          SET 
            access_token_encrypted = $1,
            refresh_token_encrypted = $2,
            expires_at = $3,
            encryption_version = $4,
            updated_at = CURRENT_TIMESTAMP
          WHERE user_id = $5 AND service_type = $6
          RETURNING id
        `, [
          data.access_token_encrypted,
          data.refresh_token_encrypted,
          data.expires_at,
          'v2',
          userId,
          'azure'
        ]);
        credentialId = result.rows[0].id;
      } else {
        // Insert new credentials
        const result = await client.query(`
          INSERT INTO service_credentials (
            user_id, 
            service_type, 
            credential_name, 
            access_token_encrypted, 
            refresh_token_encrypted,
            expires_at,
            encryption_version,
            created_at, 
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          RETURNING id
        `, [
          userId,
          'azure',
          'Azure AD OAuth',
          data.access_token_encrypted,
          data.refresh_token_encrypted,
          data.expires_at,
          'v2'
        ]);
        credentialId = result.rows[0].id;
      }

      // Log encryption audit
      await client.query(`
        INSERT INTO token_encryption_audit (user_id, credential_id, operation, success)
        VALUES ($1, $2, $3, $4)
      `, [userId, credentialId, 'encrypt', true]);

      await client.query('COMMIT');
      
      logger.info(`Azure credentials stored securely for user ${userId}`);
      return credentialId;

    } catch (error) {
      await client.query('ROLLBACK');
      
      // Log encryption failure
      try {
        await client.query(`
          INSERT INTO token_encryption_audit (user_id, credential_id, operation, success, error_message)
          VALUES ($1, $2, $3, $4, $5)
        `, [userId, null, 'encrypt', false, (error as Error).message]);
      } catch (auditError) {
        logger.error('Failed to log encryption audit:', auditError);
      }
      
      logger.error('Failed to store Azure credentials:', error);
      throw createError('Failed to store credentials', 500);
    } finally {
      client.release();
    }
  }

  /**
   * Get decrypted Azure credentials
   */
  async getCredentials(userId: number): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresAt: Date;
  } | null> {
    const client = await db.getClient();
    
    try {
      const result = await client.query(`
        SELECT 
          id,
          access_token_encrypted,
          refresh_token_encrypted,
          expires_at,
          encryption_version
        FROM service_credentials
        WHERE user_id = $1 AND service_type = $2 AND is_active = true
        ORDER BY updated_at DESC
        LIMIT 1
      `, [userId, 'azure']);

      if (result.rows.length === 0) {
        return null;
      }

      const credential = result.rows[0];

      // Check if token is expired
      if (credential.expires_at && new Date(credential.expires_at) < new Date()) {
        logger.warn(`Azure token expired for user ${userId}`);
        return null;
      }

      // Decrypt tokens - ensure JSONB data is properly typed
      const accessTokenData = credential.access_token_encrypted as any;
      if (!accessTokenData || !accessTokenData.version) {
        logger.error('Invalid access token data structure', { 
          userId, 
          hasData: !!accessTokenData,
          keys: accessTokenData ? Object.keys(accessTokenData) : []
        });
        throw new Error('Invalid token encryption format');
      }

      const accessToken = await cryptoService.decryptToken(
        accessTokenData,
        userId
      );

      let refreshToken: string | undefined;
      if (credential.refresh_token_encrypted) {
        const refreshTokenData = credential.refresh_token_encrypted as any;
        if (refreshTokenData && refreshTokenData.version) {
          refreshToken = await cryptoService.decryptToken(
            refreshTokenData,
            userId
          );
        }
      }

      // Log decryption audit
      await client.query(`
        INSERT INTO token_encryption_audit (user_id, credential_id, operation, success)
        VALUES ($1, $2, $3, $4)
      `, [userId, credential.id, 'decrypt', true]);

      return {
        accessToken,
        refreshToken,
        expiresAt: credential.expires_at
      };

    } catch (error) {
      // Log decryption failure
      try {
        await client.query(`
          INSERT INTO token_encryption_audit (user_id, credential_id, operation, success, error_message)
          VALUES ($1, $2, $3, $4, $5)
        `, [userId, null, 'decrypt', false, (error as Error).message]);
      } catch (auditError) {
        logger.error('Failed to log decryption audit:', auditError);
      }
      
      logger.error('Failed to get Azure credentials:', error);
      return null;
    } finally {
      client.release();
    }
  }

  /**
   * Delete Azure credentials
   */
  async deleteCredentials(userId: number): Promise<void> {
    const client = await db.getClient();
    
    try {
      await client.query(`
        UPDATE service_credentials
        SET is_active = false, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1 AND service_type = $2
      `, [userId, 'azure']);

      logger.info(`Azure credentials deleted for user ${userId}`);
    } catch (error) {
      logger.error('Failed to delete Azure credentials:', error);
      throw createError('Failed to delete credentials', 500);
    } finally {
      client.release();
    }
  }

  /**
   * Check if user has valid Azure credentials
   */
  async hasValidCredentials(userId: number): Promise<boolean> {
    const credentials = await this.getCredentials(userId);
    return credentials !== null;
  }
}

// Export singleton instance
export const azureCredentialService = new AzureCredentialService();