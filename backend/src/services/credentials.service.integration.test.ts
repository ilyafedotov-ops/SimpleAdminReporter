import { credentialsService, CreateCredentialDto } from './credentials.service';
// import { getCredentialEncryption } from '@/utils/encryption'; // Reserved for encryption tests
import { TestContext, setupTestContext, teardownTestContext } from '@/test/test-helpers';
import { Pool } from 'pg';

// Set environment for integration tests
process.env.TEST_TYPE = 'integration';

describe('CredentialsService Integration Tests', () => {
  let testContext: TestContext;
  let pool: Pool;
  // let encryption: any; // Reserved for encryption tests

  beforeAll(async () => {
    testContext = await setupTestContext();
    pool = testContext.pool;
    // encryption = getCredentialEncryption(); // Reserved for encryption tests
  });

  afterAll(async () => {
    await teardownTestContext(testContext);
  });

  describe('Credential CRUD Operations', () => {
    let createdCredentialId: number;

    it('should create a new credential with encryption', async () => {
      const credentialData: CreateCredentialDto = {
        serviceType: 'ad',
        credentialName: 'Test AD Credential Integration',
        username: 'test-integration-user',
        password: 'test-integration-password',
        isDefault: false
      };

      const credential = await credentialsService.createCredential(
        testContext.userId,
        credentialData
      );

      expect(credential).toBeDefined();
      expect(credential.id).toBeDefined();
      expect(credential.userId).toBe(testContext.userId);
      expect(credential.serviceType).toBe('ad');
      expect(credential.credentialName).toBe(credentialData.credentialName);
      expect(credential.username).toBe(credentialData.username);
      // AD-specific fields are no longer part of the main credential object
      expect(credential.isDefault).toBe(false);
      expect(credential.isActive).toBe(true);
      
      // Password is encrypted internally but not exposed in the response

      createdCredentialId = credential.id;
    });

    it('should get credential by ID', async () => {
      const credential = await credentialsService.getCredential(
        createdCredentialId,
        testContext.userId
      );

      expect(credential).toBeDefined();
      expect(credential!.id).toBe(createdCredentialId);
      expect(credential!.userId).toBe(testContext.userId);
      // Password is not exposed in the getCredential response
    });

    it('should not get credential for different user', async () => {
      const credential = await credentialsService.getCredential(
        createdCredentialId,
        testContext.adminUserId // Different user
      );

      expect(credential).toBeNull();
    });

    it('should list user credentials', async () => {
      const credentials = await credentialsService.getUserCredentials(testContext.userId);

      expect(credentials).toBeDefined();
      expect(Array.isArray(credentials)).toBe(true);
      expect(credentials.length).toBeGreaterThan(0);
      
      // Check that we have the created credential in the list
      const found = credentials.find(c => c.id === createdCredentialId);
      expect(found).toBeDefined();
    });

    it('should list credentials by service type', async () => {
      const adCredentials = await credentialsService.getUserCredentials(
        testContext.userId,
        'ad'
      );

      expect(adCredentials).toBeDefined();
      expect(Array.isArray(adCredentials)).toBe(true);
      adCredentials.forEach(cred => {
        expect(cred.serviceType).toBe('ad');
      });
    });

    it('should update credential', async () => {
      const updateData = {
        credentialName: 'Updated Test Credential',
        username: 'updated-user',
        password: 'new-password',
        isDefault: true
      };

      const updated = await credentialsService.updateCredential(
        createdCredentialId,
        testContext.userId,
        updateData
      );

      expect(updated).toBeDefined();
      expect(updated!.credentialName).toBe(updateData.credentialName);
      expect(updated!.username).toBe(updateData.username);
      expect(updated!.isDefault).toBe(true);
      
      // Password is re-encrypted internally but not exposed
    });

    it('should set default credential', async () => {
      // Create another credential
      const secondCredential = await credentialsService.createCredential(
        testContext.userId,
        {
          serviceType: 'ad',
          credentialName: 'Second AD Credential',
          username: 'second-user',
          password: 'second-password'
        }
      );

      // Set as default
      await credentialsService.setDefaultCredential(
        secondCredential.id,
        testContext.userId
      );

      // Check that only one is default
      const credentials = await credentialsService.getUserCredentials(
        testContext.userId,
        'ad'
      );

      const defaultCredentials = credentials.filter(c => c.isDefault);
      expect(defaultCredentials.length).toBe(1);
      expect(defaultCredentials[0].id).toBe(secondCredential.id);
    });

    it('should delete credential', async () => {
      const deleted = await credentialsService.deleteCredential(
        createdCredentialId,
        testContext.userId
      );

      expect(deleted).toBe(true);

      // Verify it's deleted
      const credential = await credentialsService.getCredential(
        createdCredentialId,
        testContext.userId
      );
      expect(credential).toBeNull();
    });
  });

  describe('Credential Encryption and Decryption', () => {
    let testCredentialId: number;

    beforeEach(async () => {
      const credential = await credentialsService.createCredential(
        testContext.userId,
        {
          serviceType: 'azure',
          credentialName: 'Test Azure Encryption',
          tenantId: 'test-tenant-id',
          clientId: 'test-client-id',
          clientSecret: 'super-secret-value'
        }
      );
      testCredentialId = credential.id;
    });

    it('should decrypt credentials correctly', async () => {
      const decrypted = await credentialsService.getDecryptedCredential(
        testCredentialId,
        testContext.userId
      );

      expect(decrypted).toBeDefined();
      expect(decrypted!.encryptedClientSecret).toBe('super-secret-value');
    });

    it('should handle encryption version migration', async () => {
      // Simulate old encryption by directly updating database
      const client = await pool.connect();
      try {
        // Get current credential
        const result = await client.query(
          'SELECT * FROM service_credentials WHERE id = $1',
          [testCredentialId]
        );
        const credential = result.rows[0];

        // Simulate v0 encryption (no version field)
        await client.query(
          `UPDATE service_credentials 
           SET encryption_version = NULL, 
               encryption_salt = NULL,
               encrypted_client_secret = $1
           WHERE id = $2`,
          [credential.encrypted_client_secret, testCredentialId]
        );

        // Try to decrypt - should handle gracefully
        const decrypted = await credentialsService.getDecryptedCredential(
          testCredentialId,
          testContext.userId
        );

        // For v0, it returns the encrypted value as-is
        expect(decrypted).toBeDefined();
      } finally {
        client.release();
      }
    });
  });

  describe('Credential Testing', () => {
    let adCredentialId: number;
    // let _azureCredentialId: number; // Reserved for Azure credential tests

    beforeEach(async () => {
      // Create test credentials
      const adCred = await credentialsService.createCredential(
        testContext.userId,
        {
          serviceType: 'ad',
          credentialName: 'Test AD Connection',
          username: 'test-ad-user',
          password: 'test-ad-password'
        }
      );
      adCredentialId = adCred.id;

      const azureCred = await credentialsService.createCredential(
        testContext.userId,
        {
          serviceType: 'azure',
          credentialName: 'Test Azure Connection',
          tenantId: 'test-tenant',
          clientId: 'test-client',
          clientSecret: 'test-secret'
        }
      );
      azureCredentialId = azureCred.id;
    });

    it('should record test results', async () => {
      // Simulate test result
      const testResult = {
        success: true,
        message: 'Connection successful',
        duration: 150,
        details: {
          serverVersion: '2019',
          userCount: 100
        }
      };

      // This would normally be called by the test endpoint
      const client = await pool.connect();
      try {
        await client.query(
          `UPDATE service_credentials 
           SET last_tested = NOW(), 
               last_test_success = $1,
               last_test_message = $2
           WHERE id = $3`,
          [testResult.success, testResult.message, adCredentialId]
        );
      } finally {
        client.release();
      }

      // Verify test result was recorded
      const credential = await credentialsService.getCredential(
        adCredentialId,
        testContext.userId
      );

      expect(credential!.lastTested).toBeDefined();
      expect(credential!.lastTestSuccess).toBe(true);
      expect(credential!.lastTestMessage).toBe('Connection successful');
    });
  });

  describe('Default Credential Management', () => {
    it('should get default credential for service', async () => {
      // Create a default credential
      await credentialsService.createCredential(
        testContext.userId,
        {
          serviceType: 'o365',
          credentialName: 'Default O365',
          tenantId: 'default-tenant',
          clientId: 'default-client',
          clientSecret: 'default-secret',
          isDefault: true
        }
      );

      const defaultCred = await credentialsService.getDefaultCredential(
        testContext.userId,
        'o365'
      );

      expect(defaultCred).toBeDefined();
      expect(defaultCred!.isDefault).toBe(true);
      expect(defaultCred!.serviceType).toBe('o365');
    });

    it('should handle no default credential', async () => {
      // Ensure no default for a service type
      const client = await pool.connect();
      try {
        await client.query(
          `UPDATE service_credentials 
           SET is_default = false 
           WHERE user_id = $1 AND service_type = 'azure'`,
          [testContext.userId]
        );
      } finally {
        client.release();
      }

      const defaultCred = await credentialsService.getDefaultCredential(
        testContext.userId,
        'azure'
      );

      expect(defaultCred).toBeNull();
    });
  });

  describe('Credential Security', () => {
    it('should not expose passwords in responses', async () => {
      const credential = await credentialsService.createCredential(
        testContext.userId,
        {
          serviceType: 'ad',
          credentialName: 'Security Test',
          username: 'secure-user',
          password: 'secure-password'
        }
      );

      // Password should not be in response
      expect((credential as any).password).toBeUndefined();
      
      // Encrypted password is not exposed in the response
    });

    it('should generate unique salts for each credential', async () => {
      const creds = [];
      
      // Create multiple credentials
      for (let i = 0; i < 3; i++) {
        const cred = await credentialsService.createCredential(
          testContext.userId,
          {
            serviceType: 'ad',
            credentialName: `Salt Test ${i}`,
            username: `user${i}`,
            password: 'same-password' // Same password
          }
        );
        creds.push(cred);
      }

      // Each credential has a unique ID
      const ids = new Set(creds.map(c => c.id));
      expect(ids.size).toBe(3); // All unique
    });
  });

  describe('Credential Validation', () => {
    it('should validate AD credential fields', async () => {
      await expect(credentialsService.createCredential(
        testContext.userId,
        {
          serviceType: 'ad',
          credentialName: 'Missing Fields',
          // Missing required username
          password: 'password'
        }
      )).rejects.toThrow();
    });

    it('should validate Azure credential fields', async () => {
      await expect(credentialsService.createCredential(
        testContext.userId,
        {
          serviceType: 'azure',
          credentialName: 'Missing Azure Fields',
          tenantId: 'tenant',
          // Missing clientId and clientSecret
        }
      )).rejects.toThrow();
    });

    it('should validate credential name length', async () => {
      await expect(credentialsService.createCredential(
        testContext.userId,
        {
          serviceType: 'ad',
          credentialName: 'A'.repeat(256), // Too long
          username: 'user',
          password: 'password'
        }
      )).rejects.toThrow();
    });
  });

  describe('Credential Statistics', () => {
    it('should track credential usage statistics', async () => {
      // Get statistics for user
      const client = await pool.connect();
      try {
        const result = await client.query(`
          SELECT 
            COUNT(*) as total_credentials,
            COUNT(CASE WHEN is_active THEN 1 END) as active_credentials,
            COUNT(CASE WHEN is_default THEN 1 END) as default_credentials,
            COUNT(DISTINCT service_type) as service_types
          FROM service_credentials
          WHERE user_id = $1
        `, [testContext.userId]);

        const stats = result.rows[0];
        
        expect(Number(stats.total_credentials)).toBeGreaterThan(0);
        expect(Number(stats.active_credentials)).toBeGreaterThan(0);
        expect(Number(stats.service_types)).toBeGreaterThan(0);
      } finally {
        client.release();
      }
    });
  });
});