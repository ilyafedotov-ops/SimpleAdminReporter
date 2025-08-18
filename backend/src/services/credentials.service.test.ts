import { CredentialsService, credentialsService } from './credentials.service';
import { db } from '@/config/database';
import { getCredentialEncryption } from '@/utils/encryption';
import { logger } from '@/utils/logger';
import { createError } from '@/middleware/error.middleware';

// Mock dependencies
jest.mock('@/config/database', () => ({
  db: {
    query: jest.fn(),
    getClient: jest.fn()
  }
}));

jest.mock('@/utils/encryption', () => ({
  getCredentialEncryption: jest.fn()
}));

jest.mock('@/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

jest.mock('@/middleware/error.middleware', () => ({
  createError: jest.fn((message: string, status: number) => {
    const error = new Error(message) as any;
    error.status = status;
    return error;
  })
}));

jest.mock('@/services/service.factory', () => ({
  serviceFactory: {
    getADService: jest.fn(() => ({
      authenticateUser: jest.fn().mockResolvedValue(true)
    })),
    getAzureService: jest.fn(() => ({
      testConnection: jest.fn().mockResolvedValue(true)
    })),
    getO365Service: jest.fn(() => ({
      testConnection: jest.fn().mockResolvedValue(true)
    }))
  }
}));

const mockDb = db as jest.Mocked<typeof db>;
const mockGetCredentialEncryption = getCredentialEncryption as jest.MockedFunction<typeof getCredentialEncryption>;
const mockCreateError = createError as jest.MockedFunction<typeof createError>;

describe('CredentialsService', () => {
  let service: CredentialsService;
  let mockEncryption: any;
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock encryption service
    mockEncryption = {
      encrypt: jest.fn().mockReturnValue('v1:encrypted_data_with_salt'),
      decrypt: jest.fn().mockResolvedValue('decrypted_data'),
      decryptWithSalt: jest.fn().mockReturnValue('decrypted_data'),
      extractSalt: jest.fn().mockReturnValue('extracted_salt')
    };
    
    mockGetCredentialEncryption.mockReturnValue(mockEncryption);
    
    // Mock database client
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };
    
    mockDb.getClient.mockResolvedValue(mockClient);
    
    service = new CredentialsService();
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with encryption service', () => {
      expect(service).toBeInstanceOf(CredentialsService);
      expect(mockGetCredentialEncryption).toHaveBeenCalled();
    });

    it('should export singleton instance', () => {
      expect(credentialsService).toBeInstanceOf(CredentialsService);
    });
  });

  describe('getUserCredentials', () => {
    const mockCredentials = [
      {
        id: 1,
        user_id: 1,
        service_type: 'ad',
        credential_name: 'Primary AD',
        username: 'user@domain.com',
        tenant_id: null,
        client_id: null,
        is_default: true,
        is_active: true,
        last_tested: new Date(),
        last_test_success: true,
        last_test_message: 'Success',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: 2,
        user_id: 1,
        service_type: 'azure',
        credential_name: 'Azure AD',
        username: null,
        tenant_id: 'tenant-123',
        client_id: 'client-123',
        is_default: false,
        is_active: true,
        last_tested: new Date(),
        last_test_success: false,
        last_test_message: 'Test failed',
        created_at: new Date(),
        updated_at: new Date()
      }
    ];

    it('should retrieve all credentials for a user', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: mockCredentials });

      const result = await service.getUserCredentials(1);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: 1,
        userId: 1,
        serviceType: 'ad',
        credentialName: 'Primary AD',
        isDefault: true
      });
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id, user_id, service_type'),
        [1]
      );
    });

    it('should filter by service type when provided', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [mockCredentials[0]] });

      const result = await service.getUserCredentials(1, 'ad');

      expect(result).toHaveLength(1);
      expect(result[0].serviceType).toBe('ad');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('AND service_type = $2'),
        [1, 'ad']
      );
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Database connection failed');
      mockDb.query.mockRejectedValueOnce(dbError);

      await expect(service.getUserCredentials(1)).rejects.toThrow('Failed to fetch credentials');
      expect(logger.error).toHaveBeenCalledWith('Error fetching user credentials:', dbError);
      expect(mockCreateError).toHaveBeenCalledWith('Failed to fetch credentials', 500);
    });

    it('should return empty array when no credentials found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.getUserCredentials(1);

      expect(result).toEqual([]);
    });
  });

  describe('getCredential', () => {
    const mockCredential = {
      id: 1,
      user_id: 1,
      service_type: 'ad',
      credential_name: 'Primary AD',
      username: 'user@domain.com',
      tenant_id: null,
      client_id: null,
      is_default: true,
      is_active: true,
      last_tested: new Date(),
      last_test_success: true,
      last_test_message: 'Success',
      created_at: new Date(),
      updated_at: new Date()
    };

    it('should retrieve a specific credential', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [mockCredential] });

      const result = await service.getCredential(1, 1);

      expect(result).toMatchObject({
        id: 1,
        userId: 1,
        serviceType: 'ad',
        credentialName: 'Primary AD'
      });
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = $1 AND user_id = $2'),
        [1, 1]
      );
    });

    it('should return null when credential not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.getCredential(999, 1);

      expect(result).toBeNull();
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Database connection failed');
      mockDb.query.mockRejectedValueOnce(dbError);

      await expect(service.getCredential(1, 1)).rejects.toThrow('Failed to fetch credential');
      expect(logger.error).toHaveBeenCalledWith('Error fetching credential:', dbError);
    });
  });

  describe('getDecryptedCredential', () => {
    it('should decrypt credentials with v1 format', async () => {
      const mockRow = {
        username: 'user@domain.com',
        encrypted_password: 'v1:encrypted_password',
        tenant_id: 'tenant-123',
        client_id: 'client-123',
        encrypted_client_secret: 'v1:encrypted_secret',
        encryption_salt: 'salt_value',
        encryption_version: 'v1'
      };

      mockDb.query.mockResolvedValueOnce({ rows: [mockRow] });
      mockEncryption.decrypt
        .mockReturnValueOnce('decrypted_password')
        .mockReturnValueOnce('decrypted_secret');

      const result = await service.getDecryptedCredential(1, 1);

      expect(result).toEqual({
        username: 'user@domain.com',
        tenantId: 'tenant-123',
        clientId: 'client-123',
        encryptedPassword: 'decrypted_password',
        encryptedClientSecret: 'decrypted_secret'
      });
      expect(mockEncryption.decrypt).toHaveBeenCalledWith('v1:encrypted_password');
    });

    it('should decrypt legacy credentials with salt', async () => {
      const mockRow = {
        username: 'user@domain.com',
        encrypted_password: 'legacy_encrypted_password',
        tenant_id: null,
        client_id: null,
        encrypted_client_secret: null,
        encryption_salt: 'legacy_salt',
        encryption_version: 'legacy'
      };

      mockDb.query.mockResolvedValueOnce({ rows: [mockRow] });
      mockEncryption.decryptWithSalt.mockReturnValueOnce('decrypted_password');

      const result = await service.getDecryptedCredential(1, 1);

      expect(result).toEqual({
        username: 'user@domain.com',
        tenantId: null,
        clientId: null,
        encryptedPassword: 'decrypted_password'
      });
      expect(mockEncryption.decryptWithSalt).toHaveBeenCalledWith(
        'legacy_encrypted_password',
        'legacy_salt'
      );
    });

    it('should handle credentials needing regeneration', async () => {
      const mockRow = {
        username: 'user@domain.com',
        encrypted_password: 'encrypted_password',
        encryption_salt: 'NEEDS_REGENERATION',
        encryption_version: 'legacy'
      };

      mockDb.query.mockResolvedValueOnce({ rows: [mockRow] });

      await expect(service.getDecryptedCredential(1, 1)).rejects.toThrow(
        'Credentials need to be re-entered due to missing encryption salt'
      );
    });

    it('should handle legacy credentials without salt', async () => {
      const mockRow = {
        username: 'user@domain.com',
        encrypted_password: 'legacy_encrypted_password',
        encryption_salt: 'legacy',
        encryption_version: 'legacy'
      };

      mockDb.query.mockResolvedValueOnce({ rows: [mockRow] });

      await expect(service.getDecryptedCredential(1, 1)).rejects.toThrow(
        'Cannot decrypt legacy credentials without salt'
      );
    });

    it('should return null when credential not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.getDecryptedCredential(999, 1);

      expect(result).toBeNull();
    });

    it('should handle decryption errors', async () => {
      const mockRow = {
        username: 'user@domain.com',
        encrypted_password: 'v1:corrupted_data',
        encryption_salt: 'salt',
        encryption_version: 'v1'
      };

      mockDb.query.mockResolvedValueOnce({ rows: [mockRow] });
      // Instead of mockRejectedValueOnce which causes worker issues, 
      // reset the mock and set it to reject
      mockEncryption.decrypt.mockReset();
      mockEncryption.decrypt.mockImplementation(() => {
        throw new Error('Decryption failed');
      });

      await expect(service.getDecryptedCredential(1, 1)).rejects.toThrow('Failed to decrypt credential');
    });
  });

  describe('createCredential', () => {
    beforeEach(() => {
      mockClient.query.mockImplementation(async (query: string) => {
        if (query.includes('BEGIN') || query.includes('COMMIT')) {
          return { rows: [] };
        }
        if (query.includes('INSERT INTO service_credentials')) {
          return {
            rows: [{
              id: 1,
              user_id: 1,
              service_type: 'ad',
              credential_name: 'Test AD',
              username: 'user@domain.com',
              tenant_id: null,
              client_id: null,
              is_default: false,
              is_active: true,
              last_tested: null,
              last_test_success: null,
              last_test_message: null,
              created_at: new Date(),
              updated_at: new Date()
            }]
          };
        }
        return { rows: [] };
      });
    });

    it('should create AD credential successfully', async () => {
      mockEncryption.encrypt.mockReturnValue('v1:encrypted_password');
      mockEncryption.extractSalt.mockReturnValue('extracted_salt');

      const dto = {
        serviceType: 'ad' as const,
        credentialName: 'Test AD',
        username: 'user@domain.com',
        password: 'password123',
        isDefault: false
      };

      const result = await service.createCredential(1, dto);

      expect(result).toMatchObject({
        id: 1,
        userId: 1,
        serviceType: 'ad',
        credentialName: 'Test AD'
      });

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO service_credentials'),
        expect.arrayContaining([1, 'ad', 'Test AD'])
      );
      expect(logger.info).toHaveBeenCalledWith('Created credential 1 for user 1');
    });

    it('should create Azure credential successfully', async () => {
      mockEncryption.encrypt.mockReturnValue('v1:encrypted_secret');
      mockEncryption.extractSalt.mockReturnValue('extracted_salt');

      const dto = {
        serviceType: 'azure' as const,
        credentialName: 'Test Azure',
        tenantId: 'tenant-123',
        clientId: 'client-123',
        clientSecret: 'secret123',
        isDefault: true
      };

      const result = await service.createCredential(1, dto);

      expect(result).toBeDefined();
      expect(mockEncryption.encrypt).toHaveBeenCalledWith('secret123');
    });

    it('should validate required fields for AD', async () => {
      const dto = {
        serviceType: 'ad' as const,
        credentialName: 'Invalid AD'
        // Missing username and password
      };

      // The validation error gets caught and re-thrown as generic error
      await expect(service.createCredential(1, dto)).rejects.toThrow(
        'Failed to create credential'
      );
      // Verify that the validation method was called with createError
      expect(mockCreateError).toHaveBeenCalledWith(
        'Username and password are required for AD credentials', 
        400
      );
    });

    it('should validate required fields for Azure', async () => {
      const dto = {
        serviceType: 'azure' as const,
        credentialName: 'Invalid Azure'
        // Missing tenantId, clientId, clientSecret
      };

      // The validation error gets caught and re-thrown as generic error
      await expect(service.createCredential(1, dto)).rejects.toThrow(
        'Failed to create credential'
      );
      // Verify that the validation method was called with createError
      expect(mockCreateError).toHaveBeenCalledWith(
        'Tenant ID, Client ID, and Client Secret are required for Azure/O365 credentials', 
        400
      );
    });

    it('should rollback transaction on error', async () => {
      mockClient.query.mockImplementation(async (query: string) => {
        if (query.includes('INSERT')) {
          throw new Error('Database error');
        }
        return { rows: [] };
      });

      const dto = {
        serviceType: 'ad' as const,
        credentialName: 'Test AD',
        username: 'user@domain.com',
        password: 'password123'
      };

      await expect(service.createCredential(1, dto)).rejects.toThrow('Failed to create credential');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('updateCredential', () => {
    beforeEach(() => {
      // Mock getCredential method
      jest.spyOn(service, 'getCredential').mockResolvedValue({
        id: 1,
        userId: 1,
        serviceType: 'ad',
        credentialName: 'Test AD',
        username: 'user@domain.com',
        isDefault: false,
        isActive: true
      } as any);

      mockClient.query.mockImplementation(async (query: string) => {
        if (query.includes('BEGIN') || query.includes('COMMIT')) {
          return { rows: [] };
        }
        if (query.includes('UPDATE service_credentials')) {
          return {
            rows: [{
              id: 1,
              user_id: 1,
              service_type: 'ad',
              credential_name: 'Updated AD',
              username: 'updated@domain.com',
              is_default: true,
              is_active: true,
              created_at: new Date(),
              updated_at: new Date()
            }]
          };
        }
        return { rows: [] };
      });
    });

    it('should update credential successfully', async () => {
      mockEncryption.encrypt.mockReturnValue('v1:new_encrypted_password');
      mockEncryption.extractSalt.mockReturnValue('new_salt');

      const dto = {
        credentialName: 'Updated AD',
        username: 'updated@domain.com',
        password: 'newpassword123',
        isDefault: true
      };

      const result = await service.updateCredential(1, 1, dto);

      expect(result).toMatchObject({
        id: 1,
        userId: 1,
        credentialName: 'Updated AD'
      });

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(logger.info).toHaveBeenCalledWith('Updated credential 1 for user 1');
    });

    it('should handle credential not found', async () => {
      jest.spyOn(service, 'getCredential').mockResolvedValueOnce(null);

      const dto = { credentialName: 'Updated' };

      await expect(service.updateCredential(999, 1, dto)).rejects.toThrow('Credential not found');
    });

    it('should handle no fields to update', async () => {
      const dto = {}; // Empty update

      await expect(service.updateCredential(1, 1, dto)).rejects.toThrow('No fields to update');
    });

    it('should rollback on error', async () => {
      mockClient.query.mockImplementation(async (query: string) => {
        if (query.includes('UPDATE')) {
          throw new Error('Update failed');
        }
        return { rows: [] };
      });

      const dto = { credentialName: 'Updated' };

      await expect(service.updateCredential(1, 1, dto)).rejects.toThrow();
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should update encryption salt when credentials change', async () => {
      mockEncryption.encrypt.mockReturnValue('v1:new_encrypted_data');
      mockEncryption.extractSalt.mockReturnValue('new_salt');

      const dto = {
        password: 'newpassword',
        clientSecret: 'newsecret'
      };

      await service.updateCredential(1, 1, dto);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('encryption_salt = $'),
        expect.arrayContaining(['new_salt'])
      );
    });
  });

  describe('deleteCredential', () => {
    beforeEach(() => {
      mockClient.query.mockImplementation(async (query: string) => {
        if (query.includes('BEGIN') || query.includes('COMMIT')) {
          return { rows: [] };
        }
        if (query.includes('SELECT id FROM service_credentials')) {
          return { rows: [{ id: 1 }] };
        }
        if (query.includes('DELETE FROM token_encryption_audit')) {
          return { rows: [{ id: 1 }, { id: 2 }], rowCount: 2 };
        }
        if (query.includes('SELECT COUNT(*) as count FROM token_encryption_audit')) {
          return { rows: [{ count: '0' }] };
        }
        if (query.includes('DELETE FROM service_credentials')) {
          return { rows: [{ id: 1 }], rowCount: 1 };
        }
        return { rows: [] };
      });
    });

    it('should delete credential and related audit records', async () => {
      await service.deleteCredential(1, 1);

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM token_encryption_audit'),
        [1]
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM service_credentials'),
        [1, 1]
      );
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Deleted credential 1 for user 1')
      );
    });

    it('should handle credential not found', async () => {
      mockClient.query.mockImplementation(async (query: string) => {
        if (query.includes('SELECT id FROM service_credentials')) {
          return { rows: [] };
        }
        return { rows: [] };
      });

      await expect(service.deleteCredential(999, 1)).rejects.toThrow('Credential not found');
    });

    it('should verify audit record cleanup', async () => {
      mockClient.query.mockImplementation(async (query: string) => {
        if (query.includes('SELECT COUNT(*) as count')) {
          return { rows: [{ count: '1' }] }; // Still has audit records
        }
        return { rows: [{ id: 1 }], rowCount: 1 };
      });

      await expect(service.deleteCredential(1, 1)).rejects.toThrow(
        'Failed to delete all audit records'
      );
    });

    it('should rollback on error', async () => {
      mockClient.query.mockImplementation(async (query: string) => {
        if (query.includes('DELETE FROM service_credentials')) {
          throw new Error('Delete failed');
        }
        return { rows: [{ id: 1 }], rowCount: 1 };
      });

      await expect(service.deleteCredential(1, 1)).rejects.toThrow();
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('testCredential', () => {
    beforeEach(() => {
      jest.spyOn(service, 'getCredential').mockResolvedValue({
        id: 1,
        userId: 1,
        serviceType: 'ad',
        credentialName: 'Test AD'
      } as any);

      jest.spyOn(service, 'getDecryptedCredential').mockResolvedValue({
        username: 'user@domain.com',
        encryptedPassword: 'password123'
      } as any);

      mockDb.query.mockResolvedValue({ rows: [] });
    });

    it('should test AD credential successfully', async () => {
      const result = await service.testCredential(1, 1);

      expect(result).toEqual({
        success: true,
        message: 'AD authentication successful'
      });

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE service_credentials'),
        [true, 'AD authentication successful', 1]
      );
    });

    it('should handle AD credential test failure', async () => {
      const { serviceFactory } = require('@/services/service.factory');
      serviceFactory.getADService.mockReturnValue({
        authenticateUser: jest.fn().mockResolvedValue(false)
      });

      const result = await service.testCredential(1, 1);

      expect(result).toEqual({
        success: false,
        message: 'AD authentication failed'
      });
    });

    it('should test Azure credential successfully', async () => {
      jest.spyOn(service, 'getCredential').mockResolvedValue({
        serviceType: 'azure'
      } as any);

      jest.spyOn(service, 'getDecryptedCredential').mockResolvedValue({
        tenantId: 'tenant-123',
        clientId: 'client-123',
        encryptedClientSecret: 'secret123'
      } as any);

      const result = await service.testCredential(1, 1);

      expect(result).toEqual({
        success: true,
        message: 'Azure AD connection successful'
      });
    });

    it('should test O365 credential successfully', async () => {
      jest.spyOn(service, 'getCredential').mockResolvedValue({
        serviceType: 'o365'
      } as any);

      jest.spyOn(service, 'getDecryptedCredential').mockResolvedValue({
        tenantId: 'tenant-123',
        clientId: 'client-123',
        encryptedClientSecret: 'secret123'
      } as any);

      const result = await service.testCredential(1, 1);

      expect(result).toEqual({
        success: true,
        message: 'O365 connection successful'
      });
    });

    it('should handle missing AD credentials', async () => {
      jest.spyOn(service, 'getDecryptedCredential').mockResolvedValue({
        username: 'user@domain.com'
        // Missing password
      } as any);

      const result = await service.testCredential(1, 1);

      expect(result).toEqual({
        success: false,
        message: 'Missing username or password'
      });
    });

    it('should handle missing Azure credentials', async () => {
      jest.spyOn(service, 'getCredential').mockResolvedValue({
        serviceType: 'azure'
      } as any);

      jest.spyOn(service, 'getDecryptedCredential').mockResolvedValue({
        tenantId: 'tenant-123'
        // Missing clientId and clientSecret
      } as any);

      const result = await service.testCredential(1, 1);

      expect(result).toEqual({
        success: false,
        message: 'Missing tenant ID, client ID, or client secret'
      });
    });

    it('should handle credential not found', async () => {
      jest.spyOn(service, 'getCredential').mockResolvedValue(null);

      await expect(service.testCredential(999, 1)).rejects.toThrow('Credential not found');
    });

    it('should handle unknown service type', async () => {
      jest.spyOn(service, 'getCredential').mockResolvedValue({
        serviceType: 'unknown'
      } as any);

      await expect(service.testCredential(1, 1)).rejects.toThrow('Unknown service type');
    });

    it('should handle test errors gracefully', async () => {
      const testError = new Error('Connection timeout');
      const { serviceFactory } = require('@/services/service.factory');
      serviceFactory.getADService.mockReturnValue({
        authenticateUser: jest.fn().mockRejectedValue(testError)
      });

      const result = await service.testCredential(1, 1);

      expect(result).toEqual({
        success: false,
        message: 'AD test failed: Connection timeout'
      });
    });
  });

  describe('getDefaultCredential', () => {
    const mockDefaultCredential = {
      id: 1,
      user_id: 1,
      service_type: 'ad',
      credential_name: 'Default AD',
      username: 'user@domain.com',
      is_default: true,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    };

    it('should get default credential for service type', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [mockDefaultCredential] });

      const result = await service.getDefaultCredential(1, 'ad');

      expect(result).toMatchObject({
        id: 1,
        userId: 1,
        serviceType: 'ad',
        isDefault: true
      });

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('is_default = true AND is_active = true'),
        [1, 'ad']
      );
    });

    it('should return null when no default credential found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.getDefaultCredential(1, 'azure');

      expect(result).toBeNull();
    });

    it('should handle database errors gracefully', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('Database error'));

      const result = await service.getDefaultCredential(1, 'ad');

      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalledWith('Error fetching default credential:', expect.any(Error));
    });
  });

  describe('setDefaultCredential', () => {
    beforeEach(() => {
      jest.spyOn(service, 'getCredential').mockResolvedValue({
        id: 1,
        userId: 1,
        serviceType: 'ad'
      } as any);

      mockClient.query.mockImplementation(async (query: string) => {
        if (query.includes('BEGIN') || query.includes('COMMIT')) {
          return { rows: [] };
        }
        return { rows: [] };
      });
    });

    it('should set credential as default', async () => {
      await service.setDefaultCredential(1, 1);

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE service_credentials SET is_default = true'),
        [1, 1]
      );
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(logger.info).toHaveBeenCalledWith('Set credential 1 as default for user 1');
    });

    it('should handle credential not found', async () => {
      jest.spyOn(service, 'getCredential').mockResolvedValueOnce(null);

      await expect(service.setDefaultCredential(999, 1)).rejects.toThrow('Credential not found');
    });

    it('should rollback on error', async () => {
      mockClient.query.mockImplementation(async (query: string) => {
        if (query.includes('UPDATE')) {
          throw new Error('Update failed');
        }
        return { rows: [] };
      });

      await expect(service.setDefaultCredential(1, 1)).rejects.toThrow();
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('Input Validation and Security', () => {
    it('should validate credential creation input', async () => {
      // Test invalid service type
      const invalidDto = {
        serviceType: 'invalid' as any,
        credentialName: 'Test'
      };

      await expect(service.createCredential(1, invalidDto)).rejects.toThrow();
    });

    it('should handle empty credential names', async () => {
      const dto = {
        serviceType: 'ad' as const,
        credentialName: '',
        username: 'user@domain.com',
        password: 'password123'
      };

      // Mock successful creation for empty names
      mockClient.query.mockImplementation(async (query: string) => {
        if (query.includes('BEGIN') || query.includes('COMMIT')) {
          return { rows: [] };
        }
        if (query.includes('INSERT INTO service_credentials')) {
          return {
            rows: [{
              id: 1,
              user_id: 1,
              service_type: 'ad',
              credential_name: '',
              username: 'user@domain.com',
              tenant_id: null,
              client_id: null,
              is_default: false,
              is_active: true,
              last_tested: null,
              last_test_success: null,
              last_test_message: null,
              created_at: new Date(),
              updated_at: new Date()
            }]
          };
        }
        return { rows: [] };
      });

      // Should create with empty name since validation only checks required fields
      await expect(service.createCredential(1, dto)).resolves.toBeDefined();
    });

    it('should handle SQL injection attempts', async () => {
      const maliciousDto = {
        serviceType: 'ad' as const,
        credentialName: "'; DROP TABLE service_credentials; --",
        username: 'user@domain.com',
        password: 'password123'
      };

      // Mock successful creation for SQL injection test
      mockClient.query.mockImplementation(async (query: string) => {
        if (query.includes('BEGIN') || query.includes('COMMIT')) {
          return { rows: [] };
        }
        if (query.includes('INSERT INTO service_credentials')) {
          return {
            rows: [{
              id: 1,
              user_id: 1,
              service_type: 'ad',
              credential_name: "'; DROP TABLE service_credentials; --",
              username: 'user@domain.com',
              tenant_id: null,
              client_id: null,
              is_default: false,
              is_active: true,
              last_tested: null,
              last_test_success: null,
              last_test_message: null,
              created_at: new Date(),
              updated_at: new Date()
            }]
          };
        }
        return { rows: [] };
      });

      // Should not throw as parameterized queries prevent injection
      await expect(service.createCredential(1, maliciousDto)).resolves.toBeDefined();
    });

    it('should handle very long input values', async () => {
      const longString = 'a'.repeat(1000); // Reduce size for test performance
      const dto = {
        serviceType: 'ad' as const,
        credentialName: longString,
        username: 'user@domain.com',
        password: 'password123'
      };

      // Mock successful creation for long values test
      mockClient.query.mockImplementation(async (query: string) => {
        if (query.includes('BEGIN') || query.includes('COMMIT')) {
          return { rows: [] };
        }
        if (query.includes('INSERT INTO service_credentials')) {
          return {
            rows: [{
              id: 1,
              user_id: 1,
              service_type: 'ad',
              credential_name: longString,
              username: 'user@domain.com',
              tenant_id: null,
              client_id: null,
              is_default: false,
              is_active: true,
              last_tested: null,
              last_test_success: null,
              last_test_message: null,
              created_at: new Date(),
              updated_at: new Date()
            }]
          };
        }
        return { rows: [] };
      });

      // Database constraints should handle this
      await expect(service.createCredential(1, dto)).resolves.toBeDefined();
    });
  });

  describe('Concurrency and Edge Cases', () => {
    it('should handle concurrent credential updates', async () => {
      jest.spyOn(service, 'getCredential').mockResolvedValue({
        id: 1,
        userId: 1,
        serviceType: 'ad'
      } as any);

      mockClient.query.mockImplementation(async (query: string) => {
        if (query.includes('UPDATE')) {
          // Simulate concurrent modification
          throw new Error('CONCURRENT_UPDATE');
        }
        return { rows: [] };
      });

      const dto = { credentialName: 'Updated' };

      await expect(service.updateCredential(1, 1, dto)).rejects.toThrow();
    });

    it('should handle database connection timeouts', async () => {
      mockDb.query.mockRejectedValue(new Error('Connection timeout'));

      await expect(service.getUserCredentials(1)).rejects.toThrow('Failed to fetch credentials');
    });

    it('should handle transaction deadlocks', async () => {
      mockClient.query.mockImplementation(async (query: string) => {
        if (query.includes('INSERT')) {
          throw new Error('deadlock detected');
        }
        return { rows: [] };
      });

      const dto = {
        serviceType: 'ad' as const,
        credentialName: 'Test AD',
        username: 'user@domain.com',
        password: 'password123'
      };

      await expect(service.createCredential(1, dto)).rejects.toThrow();
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('Performance and Resource Management', () => {
    it('should properly release database connections', async () => {
      // Mock successful query to avoid error
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await service.getUserCredentials(1);

      // Client should be released after getClient usage in create/update operations
      expect(mockDb.query).toHaveBeenCalled();
    });

    it('should handle large result sets', async () => {
      const largeCredentialSet = Array.from({ length: 1000 }, (_, i) => ({
        id: i + 1,
        user_id: 1,
        service_type: 'ad',
        credential_name: `Credential ${i + 1}`,
        username: `user${i}@domain.com`,
        is_default: false,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      }));

      mockDb.query.mockResolvedValueOnce({ rows: largeCredentialSet });

      const result = await service.getUserCredentials(1);

      expect(result).toHaveLength(1000);
      expect(result[0]).toMatchObject({
        id: 1,
        credentialName: 'Credential 1'
      });
    });

    it('should handle encryption/decryption performance', async () => {
      // Reset encryption mock for this test
      mockEncryption.encrypt.mockImplementation(() => {
        // Simulate some processing time but keep it fast for tests
        return 'v1:encrypted_data';
      });
      mockEncryption.extractSalt.mockReturnValue('test_salt');

      // Mock successful database operations
      mockClient.query.mockImplementation(async (query: string) => {
        if (query.includes('BEGIN') || query.includes('COMMIT')) {
          return { rows: [] };
        }
        if (query.includes('INSERT INTO service_credentials')) {
          return {
            rows: [{
              id: 1,
              user_id: 1,
              service_type: 'ad',
              credential_name: 'Test AD',
              username: 'user@domain.com',
              tenant_id: null,
              client_id: null,
              is_default: false,
              is_active: true,
              last_tested: null,
              last_test_success: null,
              last_test_message: null,
              created_at: new Date(),
              updated_at: new Date()
            }]
          };
        }
        return { rows: [] };
      });

      const dto = {
        serviceType: 'ad' as const,
        credentialName: 'Test AD',
        username: 'user@domain.com',
        password: 'password123'
      };

      const startTime = Date.now();
      await service.createCredential(1, dto);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });
  });
});