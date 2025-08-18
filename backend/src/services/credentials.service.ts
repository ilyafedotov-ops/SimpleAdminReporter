import { db } from '@/config/database';
import { getCredentialEncryption, EncryptedCredential } from '@/utils/encryption';
import { logger } from '@/utils/logger';
import { createError } from '@/middleware/error.middleware';

export interface ServiceCredential {
  id: number;
  userId: number;
  serviceType: 'ad' | 'azure' | 'o365';
  credentialName: string;
  username?: string;
  tenantId?: string;
  clientId?: string;
  isDefault: boolean;
  isActive: boolean;
  lastTested?: Date;
  lastTestSuccess?: boolean;
  lastTestMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCredentialDto {
  serviceType: 'ad' | 'azure' | 'o365';
  credentialName: string;
  username?: string;
  password?: string;
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
  isDefault?: boolean;
}

export interface UpdateCredentialDto {
  credentialName?: string;
  username?: string;
  password?: string;
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
  isDefault?: boolean;
  isActive?: boolean;
}

export interface TestCredentialResult {
  success: boolean;
  message: string;
  details?: any;
}

export class CredentialsService {
  private encryption = getCredentialEncryption();

  /**
   * Get all credentials for a user
   */
  async getUserCredentials(userId: number, serviceType?: string): Promise<ServiceCredential[]> {
    try {
      let query = `
        SELECT id, user_id, service_type, credential_name, username, tenant_id, client_id,
               is_default, is_active, last_tested, last_test_success, last_test_message,
               created_at, updated_at
        FROM service_credentials
        WHERE user_id = $1
      `;
      const params: any[] = [userId];

      if (serviceType) {
        query += ' AND service_type = $2';
        params.push(serviceType);
      }

      query += ' ORDER BY is_default DESC, credential_name ASC';

      const result = await db.query(query, params);
      
      return result.rows.map((row: any) => ({
        id: row.id,
        userId: row.user_id,
        serviceType: row.service_type,
        credentialName: row.credential_name,
        username: row.username,
        tenantId: row.tenant_id,
        clientId: row.client_id,
        isDefault: row.is_default,
        isActive: row.is_active,
        lastTested: row.last_tested,
        lastTestSuccess: row.last_test_success,
        lastTestMessage: row.last_test_message,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    } catch (error) {
      logger.error('Error fetching user credentials:', error);
      throw createError('Failed to fetch credentials', 500);
    }
  }

  /**
   * Get a specific credential
   */
  async getCredential(credentialId: number, userId: number): Promise<ServiceCredential | null> {
    try {
      const result = await db.query(
        `SELECT id, user_id, service_type, credential_name, username, tenant_id, client_id,
                is_default, is_active, last_tested, last_test_success, last_test_message,
                created_at, updated_at
         FROM service_credentials
         WHERE id = $1 AND user_id = $2`,
        [credentialId, userId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        userId: row.user_id,
        serviceType: row.service_type,
        credentialName: row.credential_name,
        username: row.username,
        tenantId: row.tenant_id,
        clientId: row.client_id,
        isDefault: row.is_default,
        isActive: row.is_active,
        lastTested: row.last_tested,
        lastTestSuccess: row.last_test_success,
        lastTestMessage: row.last_test_message,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    } catch (error) {
      logger.error('Error fetching credential:', error);
      throw createError('Failed to fetch credential', 500);
    }
  }

  /**
   * Get decrypted credential (internal use only)
   */
  async getDecryptedCredential(credentialId: number, userId: number): Promise<EncryptedCredential | null> {
    try {
      const result = await db.query(
        `SELECT username, encrypted_password, tenant_id, client_id, encrypted_client_secret, 
                encryption_salt, encryption_version
         FROM service_credentials
         WHERE id = $1 AND user_id = $2 AND is_active = true`,
        [credentialId, userId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      const decrypted: EncryptedCredential = {
        username: row.username,
        tenantId: row.tenant_id,
        clientId: row.client_id
      };

      // Check if credentials need regeneration
      if (row.encryption_salt === 'NEEDS_REGENERATION') {
        throw createError('Credentials need to be re-entered due to missing encryption salt', 400);
      }

      // Decrypt passwords/secrets
      if (row.encrypted_password) {
        if (row.encrypted_password.startsWith('v1:')) {
          // v1 format has embedded salt
          decrypted.encryptedPassword = this.encryption.decrypt(row.encrypted_password);
        } else if (row.encryption_salt && row.encryption_salt !== 'legacy') {
          // Legacy format with stored salt
          decrypted.encryptedPassword = this.encryption.decryptWithSalt(
            row.encrypted_password,
            row.encryption_salt
          );
        } else {
          // Legacy format with unknown salt
          throw createError('Cannot decrypt legacy credentials without salt', 400);
        }
      }
      
      if (row.encrypted_client_secret) {
        if (row.encrypted_client_secret.startsWith('v1:')) {
          // v1 format has embedded salt
          decrypted.encryptedClientSecret = this.encryption.decrypt(row.encrypted_client_secret);
        } else if (row.encryption_salt && row.encryption_salt !== 'legacy') {
          // Legacy format with stored salt
          decrypted.encryptedClientSecret = this.encryption.decryptWithSalt(
            row.encrypted_client_secret,
            row.encryption_salt
          );
        } else {
          // Legacy format with unknown salt
          throw createError('Cannot decrypt legacy credentials without salt', 400);
        }
      }

      return decrypted;
    } catch (error) {
      logger.error('Error decrypting credential:', error);
      if (error instanceof Error && ((error as any)?.message || String(error)).includes('salt')) {
        throw error; // Re-throw salt-related errors
      }
      throw createError('Failed to decrypt credential', 500);
    }
  }

  /**
   * Create a new credential
   */
  async createCredential(userId: number, dto: CreateCredentialDto): Promise<ServiceCredential> {
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');

      // Validate required fields based on service type
      this.validateCredentialFields(dto);

      // Encrypt sensitive data
      const encryptedData: any = {
        username: dto.username,
        tenantId: dto.tenantId,
        clientId: dto.clientId
      };

      let salt: string | null = null;

      if (dto.password) {
        encryptedData.encryptedPassword = this.encryption.encrypt(dto.password);
        // Extract salt from v1 encrypted data
        salt = this.encryption.extractSalt(encryptedData.encryptedPassword);
      }
      if (dto.clientSecret) {
        encryptedData.encryptedClientSecret = this.encryption.encrypt(dto.clientSecret);
        // Extract salt if not already set
        if (!salt) {
          salt = this.encryption.extractSalt(encryptedData.encryptedClientSecret);
        }
      }

      // Insert credential with salt
      const result = await client.query(
        `INSERT INTO service_credentials 
         (user_id, service_type, credential_name, username, encrypted_password,
          tenant_id, client_id, encrypted_client_secret, is_default, 
          encryption_salt, encryption_version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          userId,
          dto.serviceType,
          dto.credentialName,
          encryptedData.username,
          encryptedData.encryptedPassword || null,
          encryptedData.tenantId || null,
          encryptedData.clientId || null,
          encryptedData.encryptedClientSecret || null,
          dto.isDefault || false,
          salt,
          salt ? 'v1' : null
        ]
      );

      await client.query('COMMIT');

      const credential = result.rows[0];
      logger.info(`Created credential ${credential.id} for user ${userId}`);

      return {
        id: credential.id,
        userId: credential.user_id,
        serviceType: credential.service_type,
        credentialName: credential.credential_name,
        username: credential.username,
        tenantId: credential.tenant_id,
        clientId: credential.client_id,
        isDefault: credential.is_default,
        isActive: credential.is_active,
        lastTested: credential.last_tested,
        lastTestSuccess: credential.last_test_success,
        lastTestMessage: credential.last_test_message,
        createdAt: credential.created_at,
        updatedAt: credential.updated_at
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error creating credential:', error);
      throw createError('Failed to create credential', 500);
    } finally {
      client.release();
    }
  }

  /**
   * Update a credential
   */
  async updateCredential(
    credentialId: number, 
    userId: number, 
    dto: UpdateCredentialDto
  ): Promise<ServiceCredential> {
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');

      // Get existing credential
      const existing = await this.getCredential(credentialId, userId);
      if (!existing) {
        throw createError('Credential not found', 404);
      }

      // Build update query
      const updates: string[] = [];
      const values: any[] = [];
      let paramCount = 1;
      let newSalt: string | null = null;

      if (dto.credentialName !== undefined) {
        updates.push(`credential_name = $${paramCount++}`);
        values.push(dto.credentialName);
      }
      if (dto.username !== undefined) {
        updates.push(`username = $${paramCount++}`);
        values.push(dto.username);
      }
      if (dto.password !== undefined) {
        const encryptedPassword = this.encryption.encrypt(dto.password);
        updates.push(`encrypted_password = $${paramCount++}`);
        values.push(encryptedPassword);
        // Extract salt from new encrypted data
        newSalt = this.encryption.extractSalt(encryptedPassword);
      }
      if (dto.tenantId !== undefined) {
        updates.push(`tenant_id = $${paramCount++}`);
        values.push(dto.tenantId);
      }
      if (dto.clientId !== undefined) {
        updates.push(`client_id = $${paramCount++}`);
        values.push(dto.clientId);
      }
      if (dto.clientSecret !== undefined) {
        const encryptedSecret = this.encryption.encrypt(dto.clientSecret);
        updates.push(`encrypted_client_secret = $${paramCount++}`);
        values.push(encryptedSecret);
        // Extract salt if not already set
        if (!newSalt) {
          newSalt = this.encryption.extractSalt(encryptedSecret);
        }
      }
      if (dto.isDefault !== undefined) {
        updates.push(`is_default = $${paramCount++}`);
        values.push(dto.isDefault);
      }
      if (dto.isActive !== undefined) {
        updates.push(`is_active = $${paramCount++}`);
        values.push(dto.isActive);
      }
      
      // Update salt and version if credentials were changed
      if (newSalt) {
        updates.push(`encryption_salt = $${paramCount++}`);
        values.push(newSalt);
        updates.push(`encryption_version = $${paramCount++}`);
        values.push('v1');
      }

      if (updates.length === 0) {
        throw createError('No fields to update', 400);
      }

      // Add WHERE clause parameters
      values.push(credentialId, userId);

      const result = await client.query(
        `UPDATE service_credentials 
         SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
         WHERE id = $${paramCount} AND user_id = $${paramCount + 1}
         RETURNING *`,
        values
      );

      await client.query('COMMIT');

      const credential = result.rows[0];
      logger.info(`Updated credential ${credentialId} for user ${userId}`);

      return {
        id: credential.id,
        userId: credential.user_id,
        serviceType: credential.service_type,
        credentialName: credential.credential_name,
        username: credential.username,
        tenantId: credential.tenant_id,
        clientId: credential.client_id,
        isDefault: credential.is_default,
        isActive: credential.is_active,
        lastTested: credential.last_tested,
        lastTestSuccess: credential.last_test_success,
        lastTestMessage: credential.last_test_message,
        createdAt: credential.created_at,
        updatedAt: credential.updated_at
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error updating credential:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Delete a credential
   */
  async deleteCredential(credentialId: number, userId: number): Promise<void> {
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');
      
      // First check if the credential exists
      const checkResult = await client.query(
        'SELECT id FROM service_credentials WHERE id = $1 AND user_id = $2',
        [credentialId, userId]
      );
      
      if (checkResult.rows.length === 0) {
        throw createError('Credential not found', 404);
      }
      
      // Delete related token_encryption_audit records first with verification
      const auditDeleteResult = await client.query(
        'DELETE FROM token_encryption_audit WHERE credential_id = $1 RETURNING id',
        [credentialId]
      );
      logger.info(`Deleted ${auditDeleteResult.rowCount} token_encryption_audit records for credential ${credentialId}`);
      
      // Verify no audit records remain
      const remainingAuditCheck = await client.query(
        'SELECT COUNT(*) as count FROM token_encryption_audit WHERE credential_id = $1',
        [credentialId]
      );
      if (parseInt(remainingAuditCheck.rows[0].count) > 0) {
        throw createError(`Failed to delete all audit records for credential ${credentialId}`, 500);
      }
      
      // Now delete the credential
      const credentialDeleteResult = await client.query(
        'DELETE FROM service_credentials WHERE id = $1 AND user_id = $2 RETURNING id',
        [credentialId, userId]
      );
      
      if (credentialDeleteResult.rowCount === 0) {
        throw createError('Credential not found', 404);
      }
      
      await client.query('COMMIT');
      logger.info(`Deleted credential ${credentialId} for user ${userId} (audit records: ${auditDeleteResult.rowCount})`);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error deleting credential:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Test a credential
   */
  async testCredential(credentialId: number, userId: number): Promise<TestCredentialResult> {
    try {
      // Get decrypted credential
      const credential = await this.getCredential(credentialId, userId);
      if (!credential) {
        throw createError('Credential not found', 404);
      }

      const decrypted = await this.getDecryptedCredential(credentialId, userId);
      if (!decrypted) {
        throw createError('Credential not found or inactive', 404);
      }

      // Test based on service type
      let result: TestCredentialResult;
      
      switch (credential.serviceType) {
        case 'ad':
          result = await this.testADCredential(decrypted);
          break;
        case 'azure':
          result = await this.testAzureCredential(decrypted);
          break;
        case 'o365':
          result = await this.testO365Credential(decrypted);
          break;
        default:
          throw createError('Unknown service type', 400);
      }

      // Update test results
      await db.query(
        `UPDATE service_credentials 
         SET last_tested = CURRENT_TIMESTAMP, 
             last_test_success = $1, 
             last_test_message = $2
         WHERE id = $3`,
        [result.success, result.message, credentialId]
      );

      logger.info(`Tested credential ${credentialId}: ${result.success ? 'success' : 'failed'}`);
      return result;
    } catch (error) {
      logger.error('Error testing credential:', error);
      throw error;
    }
  }

  /**
   * Get default credential for a service
   */
  async getDefaultCredential(userId: number, serviceType: string): Promise<ServiceCredential | null> {
    try {
      const result = await db.query(
        `SELECT id, user_id, service_type, credential_name, username, tenant_id, client_id,
                is_default, is_active, last_tested, last_test_success, last_test_message,
                created_at, updated_at
         FROM service_credentials
         WHERE user_id = $1 AND service_type = $2 AND is_default = true AND is_active = true`,
        [userId, serviceType]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        userId: row.user_id,
        serviceType: row.service_type,
        credentialName: row.credential_name,
        username: row.username,
        tenantId: row.tenant_id,
        clientId: row.client_id,
        isDefault: row.is_default,
        isActive: row.is_active,
        lastTested: row.last_tested,
        lastTestSuccess: row.last_test_success,
        lastTestMessage: row.last_test_message,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    } catch (error) {
      logger.error('Error fetching default credential:', error);
      return null;
    }
  }

  /**
   * Set a credential as default
   */
  async setDefaultCredential(credentialId: number, userId: number): Promise<void> {
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');

      // Get credential to find service type
      const credential = await this.getCredential(credentialId, userId);
      if (!credential) {
        throw createError('Credential not found', 404);
      }

      // The trigger will handle unsetting other defaults
      await client.query(
        'UPDATE service_credentials SET is_default = true WHERE id = $1 AND user_id = $2',
        [credentialId, userId]
      );

      await client.query('COMMIT');
      logger.info(`Set credential ${credentialId} as default for user ${userId}`);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error setting default credential:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Validate credential fields based on service type
   */
  private validateCredentialFields(dto: CreateCredentialDto): void {
    switch (dto.serviceType) {
      case 'ad':
        if (!dto.username || !dto.password) {
          throw createError('Username and password are required for AD credentials', 400);
        }
        break;
      case 'azure':
      case 'o365':
        if (!dto.tenantId || !dto.clientId || !dto.clientSecret) {
          throw createError('Tenant ID, Client ID, and Client Secret are required for Azure/O365 credentials', 400);
        }
        break;
    }
  }

  /**
   * Test AD credential
   */
  private async testADCredential(credential: EncryptedCredential): Promise<TestCredentialResult> {
    try {
      if (!credential.username || !credential.encryptedPassword) {
        return {
          success: false,
          message: 'Missing username or password'
        };
      }

      const { serviceFactory } = await import('@/services/service.factory');
      const adService = await serviceFactory.getADService();
      const isAuthenticated = await adService.authenticateUser(
        credential.username, 
        credential.encryptedPassword
      );

      return {
        success: isAuthenticated,
        message: isAuthenticated ? 'AD authentication successful' : 'AD authentication failed'
      };
    } catch (error: any) {
      return {
        success: false,
        message: `AD test failed: ${((error as any)?.message || String(error))}`
      };
    }
  }

  /**
   * Test Azure credential
   */
  private async testAzureCredential(credential: EncryptedCredential): Promise<TestCredentialResult> {
    try {
      if (!credential.tenantId || !credential.clientId || !credential.encryptedClientSecret) {
        return {
          success: false,
          message: 'Missing tenant ID, client ID, or client secret'
        };
      }

      // Test by trying to get users (minimal permission required)
      const { serviceFactory } = await import('@/services/service.factory');
      const azureService = await serviceFactory.getAzureService();
      const testResult = await azureService.testConnection();
      
      return {
        success: testResult,
        message: testResult ? 'Azure AD connection successful' : 'Azure AD connection failed'
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Azure test failed: ${((error as any)?.message || String(error))}`
      };
    }
  }

  /**
   * Test O365 credential
   */
  private async testO365Credential(credential: EncryptedCredential): Promise<TestCredentialResult> {
    try {
      if (!credential.tenantId || !credential.clientId || !credential.encryptedClientSecret) {
        return {
          success: false,
          message: 'Missing tenant ID, client ID, or client secret'
        };
      }

      // Test by trying to get mailbox usage (minimal permission required)
      const { serviceFactory } = await import('@/services/service.factory');
      const o365Service = await serviceFactory.getO365Service();
      const testResult = await o365Service.testConnection();
      
      return {
        success: testResult,
        message: testResult ? 'O365 connection successful' : 'O365 connection failed'
      };
    } catch (error: any) {
      return {
        success: false,
        message: `O365 test failed: ${((error as any)?.message || String(error))}`
      };
    }
  }
}

// Export singleton instance
export const credentialsService = new CredentialsService();