import { GraphFieldDiscoveryService } from "./graph-field-discovery.service";
// import { azureMsalService } from './azure-msal.service';
import { CredentialContext } from './base';
import { db } from '../config/database';

// Mock dependencies
jest.mock('./azure-msal.service');
jest.mock('../config/database', () => ({
  db: {
    getClient: jest.fn()
  }
}));

describe('GraphFieldDiscoveryService', () => {
  let fieldDiscoveryService: GraphFieldDiscoveryService;
  let mockAzureService: any;
  let mockDbClient: any;

  const mockContext: CredentialContext = {
    userId: 1
  };

  const mockUserResponse = {
    data: [{
      id: '123',
      displayName: 'Test User',
      userPrincipalName: 'test@example.com',
      mail: 'test@example.com',
      accountEnabled: true,
      createdDateTime: '2025-01-01T00:00:00Z',
      userType: 'Member',
      department: 'IT',
      jobTitle: 'Developer',
      officeLocation: 'Building A',
      signInActivity: {
        lastSignInDateTime: '2025-01-15T10:00:00Z',
        lastNonInteractiveSignInDateTime: '2025-01-15T09:00:00Z'
      }
    }]
  };

  const mockGroupResponse = {
    data: [{
      id: '456',
      displayName: 'Test Group',
      description: 'Test group description',
      groupTypes: ['Unified'],
      mailEnabled: true,
      securityEnabled: false,
      createdDateTime: '2025-01-01T00:00:00Z',
      mail: 'testgroup@example.com',
      membershipRule: null,
      membershipRuleProcessingState: null
    }]
  };

  beforeEach(() => {
    // Setup Azure service mock
    mockAzureService = {
      executeQuery: jest.fn()
    };

    // Setup database client mock
    mockDbClient = {
      query: jest.fn(),
      release: jest.fn()
    };

    // Mock db.getClient to return our mock client
    jest.mocked(db.getClient).mockResolvedValue(mockDbClient);

    // Create service instance with mocked Azure service
    fieldDiscoveryService = new GraphFieldDiscoveryService(mockAzureService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('discoverFields', () => {
    it('should return static schema for user entity type', async () => {
      mockAzureService.executeQuery.mockResolvedValue(mockUserResponse);

      const schema = await fieldDiscoveryService.discoverFields('user', mockContext);

      expect(schema).toBeDefined();
      expect(schema.entityType).toBe('user');
      expect(schema.fields).toBeDefined();
      expect(schema.fields.length).toBeGreaterThan(0);
      expect(schema.relationships).toBeDefined();
      expect(schema.supportedOperations).toContain('read');
    });

    it('should return static schema for group entity type', async () => {
      mockAzureService.executeQuery.mockResolvedValue(mockGroupResponse);

      const schema = await fieldDiscoveryService.discoverFields('group', mockContext);

      expect(schema).toBeDefined();
      expect(schema.entityType).toBe('group');
      expect(schema.fields).toBeDefined();
      expect(schema.fields.length).toBeGreaterThan(0);
      expect(schema.relationships).toBeDefined();
      expect(schema.supportedOperations).toContain('addMember');
    });

    it('should handle user entity discovery with enriched sample data', async () => {
      mockAzureService.executeQuery.mockResolvedValue(mockUserResponse);

      const schema = await fieldDiscoveryService.discoverFields('user', mockContext);

      // Check for expected user fields
      const fieldNames = schema.fields.map((f: any) => f.name);
      expect(fieldNames).toContain('id');
      expect(fieldNames).toContain('displayName');
      expect(fieldNames).toContain('userPrincipalName');
      expect(fieldNames).toContain('accountEnabled');
      expect(fieldNames).toContain('department');
      expect(fieldNames).toContain('signInActivity');
    });

    it('should handle group entity discovery', async () => {
      mockAzureService.executeQuery.mockResolvedValue(mockGroupResponse);

      const schema = await fieldDiscoveryService.discoverFields('group', mockContext);

      // Check for expected group fields
      const fieldNames = schema.fields.map((f: any) => f.name);
      expect(fieldNames).toContain('id');
      expect(fieldNames).toContain('displayName');
      expect(fieldNames).toContain('groupTypes');
      expect(fieldNames).toContain('mailEnabled');
      expect(fieldNames).toContain('securityEnabled');
    });

    it('should categorize fields correctly', async () => {
      const schema = await fieldDiscoveryService.discoverFields('user', mockContext);

      // Check field categories
      const idField = schema.fields.find((f: any) => f.name === 'id');
      expect(idField?.category).toBe('basic');

      const departmentField = schema.fields.find((f: any) => f.name === 'department');
      expect(departmentField?.category).toBe('organization');

      const signInField = schema.fields.find((f: any) => f.name === 'signInActivity');
      expect(signInField?.category).toBe('activity');
    });

    it('should set correct data types', async () => {
      const schema = await fieldDiscoveryService.discoverFields('user', mockContext);

      const booleanField = schema.fields.find((f: any) => f.name === 'accountEnabled');
      expect(booleanField?.type).toBe('boolean');

      const dateField = schema.fields.find((f: any) => f.name === 'createdDateTime');
      expect(dateField?.type).toBe('datetime');

      const stringField = schema.fields.find((f: any) => f.name === 'displayName');
      expect(stringField?.type).toBe('string');
    });

    it('should handle authentication errors in sample data gracefully', async () => {
      const authError: any = new Error('no credentials found for user');
      mockAzureService.executeQuery.mockRejectedValue(authError);

      // Authentication errors in getSampleData are caught and logged, schema is still returned
      const schema = await fieldDiscoveryService.discoverFields('user', mockContext);
      
      expect(schema).toBeDefined();
      expect(schema.entityType).toBe('user');
      expect(schema.fields.length).toBeGreaterThan(0);
      // The sample data enrichment would have failed, but static schema is returned
    });

    it('should handle general errors by returning static schema', async () => {
      mockAzureService.executeQuery.mockRejectedValue(new Error('Network error'));

      const schema = await fieldDiscoveryService.discoverFields('user', mockContext);
      
      // Should still return a valid static schema
      expect(schema).toBeDefined();
      expect(schema.entityType).toBe('user');
      expect(schema.fields.length).toBeGreaterThan(0);
    });

    it('should cache results for subsequent calls', async () => {
      mockAzureService.executeQuery.mockResolvedValue(mockUserResponse);

      // First call
      const schema1 = await fieldDiscoveryService.discoverFields('user', mockContext);
      
      // Second call - should return cached result
      const schema2 = await fieldDiscoveryService.discoverFields('user', mockContext);

      expect(schema1).toEqual(schema2);
      // executeQuery should only be called once due to caching
      expect(mockAzureService.executeQuery).toHaveBeenCalledTimes(1);
    });

    it('should store field metadata in database', async () => {
      mockAzureService.executeQuery.mockResolvedValue(mockUserResponse);

      await fieldDiscoveryService.discoverFields('user', mockContext);

      // Check that database transaction was started
      expect(mockDbClient.query).toHaveBeenCalledWith('BEGIN');
      
      // Check that old metadata was deleted
      expect(mockDbClient.query).toHaveBeenCalledWith(
        'DELETE FROM field_metadata WHERE source = $1 AND field_name LIKE $2',
        ['azure', 'user.%']
      );

      // Check that commit was called
      expect(mockDbClient.query).toHaveBeenCalledWith('COMMIT');
      
      // Check that client was released
      expect(mockDbClient.release).toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      mockAzureService.executeQuery.mockResolvedValue(mockUserResponse);
      mockDbClient.query.mockRejectedValueOnce(new Error('Database error'));

      // Should not throw, but should still return schema
      const schema = await fieldDiscoveryService.discoverFields('user', mockContext);
      
      expect(schema).toBeDefined();
      expect(schema.entityType).toBe('user');
    });
  });

  describe('getAvailableEntities', () => {
    it('should return list of available entities', async () => {
      const entities = await fieldDiscoveryService.getAvailableEntities();

      expect(entities).toBeDefined();
      expect(entities.length).toBeGreaterThan(0);
      
      const userEntity = entities.find((e: any) => e.name === 'user');
      expect(userEntity).toBeDefined();
      expect(userEntity?.displayName).toBe('Users');
      expect(userEntity?.fieldCount).toBeGreaterThan(0);

      const groupEntity = entities.find((e: any) => e.name === 'group');
      expect(groupEntity).toBeDefined();
      expect(groupEntity?.displayName).toBe('Groups');
    });
  });

  describe('Field Discovery for Different Entities', () => {
    it('should discover application fields', async () => {
      const mockAppResponse = {
        data: [{
          id: 'app-123',
          appId: 'client-123',
          displayName: 'Test App',
          createdDateTime: '2025-01-01T00:00:00Z',
          signInAudience: 'AzureADMyOrg',
          identifierUris: ['https://testapp.example.com']
        }]
      };

      mockAzureService.executeQuery.mockResolvedValue(mockAppResponse);

      const schema = await fieldDiscoveryService.discoverFields('application', mockContext);

      const fieldNames = schema.fields.map((f: any) => f.name);
      expect(fieldNames).toContain('appId');
      expect(fieldNames).toContain('signInAudience');
      expect(fieldNames).toContain('identifierUris');
    });

    it('should return basic schema for device entity', async () => {
      const schema = await fieldDiscoveryService.discoverFields('device', mockContext);

      expect(schema).toBeDefined();
      expect(schema.entityType).toBe('device');
      expect(schema.supportedOperations).toContain('read');
    });
  });

  describe('Field Metadata Enrichment', () => {
    it('should add appropriate descriptions to fields', async () => {
      const schema = await fieldDiscoveryService.discoverFields('user', mockContext);

      const signInField = schema.fields.find((f: any) => f.name === 'lastSignInDateTime');
      expect(signInField?.description).toContain('Part of signInActivity');
    });

    it('should set searchability flags correctly', async () => {
      const schema = await fieldDiscoveryService.discoverFields('user', mockContext);

      // Text fields should be searchable
      const displayNameField = schema.fields.find((f: any) => f.name === 'displayName');
      expect(displayNameField?.isSearchable).toBe(true);

      // Boolean fields should not be searchable
      const enabledField = schema.fields.find((f: any) => f.name === 'accountEnabled');
      expect(enabledField?.isSearchable).toBe(false);
    });

    it('should set sortability flags correctly', async () => {
      const schema = await fieldDiscoveryService.discoverFields('user', mockContext);

      // Most fields should be sortable
      const displayNameField = schema.fields.find((f: any) => f.name === 'displayName');
      expect(displayNameField?.isSortable).toBe(true);

      // Array fields should not be sortable
      const phonesField = schema.fields.find((f: any) => f.name === 'businessPhones');
      expect(phonesField?.isSortable).toBe(false);
    });

    it('should identify expandable fields', async () => {
      const schema = await fieldDiscoveryService.discoverFields('user', mockContext);

      // Relationship fields should be expandable
      const managerField = schema.fields.find((f: any) => f.name === 'manager');
      expect(managerField?.isExpandable).toBe(true);
      expect(managerField?.relatedEntity).toBe('user');

      // Simple fields should not be expandable
      const nameField = schema.fields.find((f: any) => f.name === 'displayName');
      expect(nameField?.isExpandable).toBe(false);
    });

    it('should include sample values for enum-like fields', async () => {
      const schema = await fieldDiscoveryService.discoverFields('user', mockContext);

      const userTypeField = schema.fields.find((f: any) => f.name === 'userType');
      expect(userTypeField?.sampleValues).toContain('Member');
      expect(userTypeField?.sampleValues).toContain('Guest');
    });
  });

  describe('Error Handling', () => {
    it('should handle various error types in sample data fetching', async () => {
      const authErrors = [
        { message: 'authentication failed' },
        { message: 'unauthorized access' },
        { message: '401 unauthorized' },
        { message: 'no credentials found' },
        { message: 'access denied' },
        { code: 'no_credentials' },
        { code: 'unauthenticated' },
        { status: 401 }
      ];

      for (const error of authErrors) {
        mockAzureService.executeQuery.mockRejectedValueOnce(error);
        
        // All these errors in getSampleData are caught and logged, static schema is returned
        const schema = await fieldDiscoveryService.discoverFields('user', mockContext);
        expect(schema).toBeDefined();
        expect(schema.entityType).toBe('user');
        expect(schema.fields.length).toBeGreaterThan(0);
      }
    });

    it('should handle empty sample data response', async () => {
      mockAzureService.executeQuery.mockResolvedValue({ data: [] });

      const schema = await fieldDiscoveryService.discoverFields('user', mockContext);
      
      // Should still return valid schema even without sample data
      expect(schema).toBeDefined();
      expect(schema.fields.length).toBeGreaterThan(0);
    });

    it('should handle malformed sample data response', async () => {
      mockAzureService.executeQuery.mockResolvedValue({ notData: [] });

      const schema = await fieldDiscoveryService.discoverFields('user', mockContext);
      
      // Should still return valid schema
      expect(schema).toBeDefined();
      expect(schema.fields.length).toBeGreaterThan(0);
    });

    it('should rollback database transaction on error', async () => {
      mockAzureService.executeQuery.mockResolvedValue(mockUserResponse);
      
      // Make the INSERT query fail
      mockDbClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // DELETE
        .mockRejectedValueOnce(new Error('Insert failed')); // INSERT

      await fieldDiscoveryService.discoverFields('user', mockContext);

      // Should have called ROLLBACK
      expect(mockDbClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockDbClient.release).toHaveBeenCalled();
    });
  });
});