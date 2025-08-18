import { ADSchemaDiscoveryService } from './adSchemaDiscovery.service';
import { logger } from '@/utils/logger';
import { redis } from '@/config/redis';
import { serviceFactory } from '@/services/service.factory';

// Mock dependencies
jest.mock('@/utils/logger');
jest.mock('@/config/redis');
jest.mock('@/services/service.factory');

describe('ADSchemaDiscoveryService', () => {
  let service: ADSchemaDiscoveryService;
  let mockADService: any;
  
  const mockLogger = logger as jest.Mocked<typeof logger>;
  const mockRedis = redis as jest.Mocked<typeof redis>;
  const mockServiceFactory = serviceFactory as jest.Mocked<typeof serviceFactory>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset NODE_ENV
    process.env.NODE_ENV = 'production';
    delete process.env.DISABLE_SCHEMA_CACHE;
    
    // Create fresh service instance
    service = new ADSchemaDiscoveryService();
    
    // Mock AD service
    mockADService = {
      testConnection: jest.fn().mockResolvedValue(true),
      executeQuery: jest.fn(),
      close: jest.fn()
    };
    
    mockServiceFactory.getADService.mockResolvedValue(mockADService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('discoverFullSchema', () => {
    const mockServiceAccountDn = 'CN=service,DC=test,DC=com';
    const mockServiceAccountPassword = 'testPass123';
    
    const mockSearchResults = [
      {
        cn: 'John Doe',
        sAMAccountName: 'jdoe',
        mail: 'john.doe@test.com',
        lastLogon: '133524336000000000',
        userAccountControl: 512,
        memberOf: ['CN=Users,DC=test,DC=com'],
        objectSid: 'S-1-5-21-1234567890',
        whenCreated: '20240101120000.0Z',
        department: 'IT',
        manager: 'CN=Manager,DC=test,DC=com'
      },
      {
        cn: 'Jane Smith',
        sAMAccountName: 'jsmith',
        mail: 'jane.smith@test.com',
        userAccountControl: 514,
        accountExpires: '9223372036854775807',
        thumbnailPhoto: Buffer.from('photo'),
        proxyAddresses: ['SMTP:jane@test.com', 'smtp:jsmith@test.com'],
        description: 'Test user account'
      }
    ];

    it('should discover schema successfully with valid credentials', async () => {
      mockRedis.getJson.mockResolvedValue(null);
      mockADService.executeQuery.mockResolvedValue({ data: mockSearchResults });
      
      const result = await service.discoverFullSchema(mockServiceAccountDn, mockServiceAccountPassword);
      
      expect(result).toBeDefined();
      expect(result.attributes).toBeInstanceOf(Array);
      expect(result.attributes.length).toBeGreaterThan(0);
      expect(result.objectClasses).toEqual(['user', 'person', 'organizationalPerson']);
      expect(result.totalCount).toBe(result.attributes.length);
      expect(result.commonAttributes).toBeInstanceOf(Array);
      
      // Verify cache was set
      expect(mockRedis.setJson).toHaveBeenCalledWith(
        expect.stringContaining('ad:schema:full'),
        result,
        86400
      );
    });

    it('should return cached schema when available', async () => {
      const cachedSchema = {
        attributes: [{ name: 'cn', displayName: 'Common Name' }],
        objectClasses: ['user'],
        totalCount: 1,
        commonAttributes: []
      };
      
      mockRedis.getJson.mockResolvedValue(cachedSchema);
      
      const result = await service.discoverFullSchema(mockServiceAccountDn, mockServiceAccountPassword);
      
      expect(result).toEqual(cachedSchema);
      expect(mockServiceFactory.getADService).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Returning cached AD schema');
    });

    it('should throw error when credentials are missing', async () => {
      mockRedis.getJson.mockResolvedValue(null);
      
      await expect(service.discoverFullSchema()).rejects.toThrow(
        'Schema discovery requires valid service account credentials'
      );
      
      await expect(service.discoverFullSchema('dn', '')).rejects.toThrow(
        'Schema discovery requires valid service account credentials'
      );
    });

    it('should handle connection test failure', async () => {
      mockRedis.getJson.mockResolvedValue(null);
      mockADService.testConnection.mockResolvedValue(false);
      
      await expect(
        service.discoverFullSchema(mockServiceAccountDn, mockServiceAccountPassword)
      ).rejects.toThrow('Service account credentials are invalid or expired');
    });

    it('should handle AD service errors', async () => {
      mockRedis.getJson.mockResolvedValue(null);
      mockServiceFactory.getADService.mockRejectedValue(new Error('Connection failed'));
      
      await expect(
        service.discoverFullSchema(mockServiceAccountDn, mockServiceAccountPassword)
      ).rejects.toThrow('Failed to discover AD schema: Connection failed');
    });

    it('should skip caching when disabled', async () => {
      process.env.DISABLE_SCHEMA_CACHE = 'true';
      service = new ADSchemaDiscoveryService();
      
      mockRedis.getJson.mockResolvedValue(null);
      mockADService.executeQuery.mockResolvedValue({ data: mockSearchResults });
      
      await service.discoverFullSchema(mockServiceAccountDn, mockServiceAccountPassword);
      
      expect(mockRedis.getJson).not.toHaveBeenCalled();
      expect(mockRedis.setJson).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Schema caching disabled - discovering fresh schema');
    });

    it('should skip caching in non-production environment', async () => {
      process.env.NODE_ENV = 'development';
      service = new ADSchemaDiscoveryService();
      
      mockRedis.getJson.mockResolvedValue(null);
      mockADService.executeQuery.mockResolvedValue({ data: mockSearchResults });
      
      await service.discoverFullSchema(mockServiceAccountDn, mockServiceAccountPassword);
      
      expect(mockRedis.getJson).not.toHaveBeenCalled();
      expect(mockRedis.setJson).not.toHaveBeenCalled();
    });

    it('should clean credentials before use', async () => {
      const dirtyDn = '  CN=service,DC=test,DC=com\r\n';
      const dirtyPassword = 'testPass123\u0000  ';
      
      mockRedis.getJson.mockResolvedValue(null);
      mockADService.executeQuery.mockResolvedValue({ data: mockSearchResults });
      
      await service.discoverFullSchema(dirtyDn, dirtyPassword);
      
      expect(mockServiceFactory.getADService).toHaveBeenCalled();
      expect(mockADService.testConnection).toHaveBeenCalled();
    });

    it('should handle empty query results', async () => {
      mockRedis.getJson.mockResolvedValue(null);
      mockADService.executeQuery.mockResolvedValue({ data: [] });
      
      const result = await service.discoverFullSchema(mockServiceAccountDn, mockServiceAccountPassword);
      
      expect(result.attributes).toEqual([]);
      expect(result.totalCount).toBe(0);
      expect(result.commonAttributes).toEqual([]);
    });

    it('should handle query results without data property', async () => {
      mockRedis.getJson.mockResolvedValue(null);
      mockADService.executeQuery.mockResolvedValue({});
      
      const result = await service.discoverFullSchema(mockServiceAccountDn, mockServiceAccountPassword);
      
      expect(result.attributes).toEqual([]);
      expect(result.totalCount).toBe(0);
    });

    it('should re-throw credential-related errors as-is', async () => {
      mockRedis.getJson.mockResolvedValue(null);
      const credError = new Error('Invalid credentials provided');
      mockServiceFactory.getADService.mockRejectedValue(credError);
      
      await expect(
        service.discoverFullSchema(mockServiceAccountDn, mockServiceAccountPassword)
      ).rejects.toThrow('Invalid credentials provided');
    });
  });

  describe('convertToFieldMetadata', () => {
    const mockAttributes = [
      { name: 'cn', displayName: 'Common Name', syntax: 'string', description: 'Common Name field' },
      { name: 'sAMAccountName', displayName: 'Username', syntax: 'string', description: 'Username field' },
      { name: 'userAccountControl', displayName: 'User Account Control', syntax: 'integer', description: 'User account control flags' },
      { name: 'lastLogon', displayName: 'Last Logon', syntax: 'datetime', description: 'Last logon timestamp' },
      { name: 'memberOf', displayName: 'Member Of', syntax: 'array', description: 'Group memberships' }
    ];

    it('should convert attributes to field metadata format', async () => {
      const result = await service.convertToFieldMetadata(mockAttributes);
      
      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBe(mockAttributes.length);
      
      // Check first attribute conversion
      const cnField = result.find(f => f.fieldName === 'cn');
      expect(cnField).toBeDefined();
      expect(cnField.source).toBe('ad');
      expect(cnField.displayName).toBe('Common Name');
      expect(cnField.dataType).toBe('string');
      expect(cnField.category).toBe('identity');
      expect(cnField.isSearchable).toBe(true);
      expect(cnField.isSortable).toBe(true);
      expect(cnField.isExportable).toBe(true);
      expect(cnField.isSensitive).toBe(false);
      
      // Check username field has aliases
      const usernameField = result.find(f => f.fieldName === 'sAMAccountName');
      expect(usernameField?.aliases).toEqual(['username', 'samaccountname', 'accountName', 'loginName']);
    });

    it('should categorize fields correctly', async () => {
      const result = await service.convertToFieldMetadata(mockAttributes);
      
      const cnField = result.find(f => f.fieldName === 'cn');
      expect(cnField?.category).toBe('identity');
      
      const uacField = result.find(f => f.fieldName === 'userAccountControl');
      expect(uacField?.category).toBe('security');
      
      const lastLogonField = result.find(f => f.fieldName === 'lastLogon');
      expect(lastLogonField?.category).toBe('audit');
    });

    it('should identify sensitive fields', async () => {
      const sensitiveAttrs = [
        { name: 'unicodePwd', displayName: 'Password', syntax: 'string' },
        { name: 'employeeNumber', displayName: 'Employee Number', syntax: 'string' }
      ];
      
      const result = await service.convertToFieldMetadata(sensitiveAttrs);
      
      const pwdField = result.find(f => f.fieldName === 'unicodePwd');
      expect(pwdField?.isSensitive).toBe(true);
      
      const empField = result.find(f => f.fieldName === 'employeeNumber');
      expect(empField?.isSensitive).toBe(true);
    });

    it('should handle binary/octet string fields correctly', async () => {
      const binaryAttrs = [
        { name: 'objectGUID', displayName: 'Object GUID', syntax: '2.5.5.10' },
        { name: 'thumbnailPhoto', displayName: 'Thumbnail Photo', syntax: '2.5.5.10' }
      ];
      
      const result = await service.convertToFieldMetadata(binaryAttrs);
      
      const guidField = result.find(f => f.fieldName === 'objectGUID');
      expect(guidField?.isSortable).toBe(false); // Binary fields are not sortable
      
      const photoField = result.find(f => f.fieldName === 'thumbnailPhoto');
      expect(photoField?.isSortable).toBe(false);
    });
  });

  describe('attribute type inference and discovery', () => {
    it('should infer correct data types from sample data', async () => {
      const mockSearchResults = [
        {
          cn: 'John Doe',
          sAMAccountName: 'jdoe',
          userAccountControl: 512,
          lastLogon: '133524336000000000',
          whenCreated: '20240101120000.0Z',
          memberOf: ['Group1', 'Group2'],
          badPwdCount: 0,
          isDeleted: 'FALSE'
        },
        {
          cn: 'Jane Smith',
          userAccountControl: 514,
          lastLogonTimestamp: '133524336000000000',
          proxyAddresses: ['SMTP:jane@test.com', 'smtp:jsmith@test.com'],
          logonCount: 100
        }
      ];

      mockRedis.getJson.mockResolvedValue(null);
      mockADService.executeQuery.mockResolvedValue({ data: mockSearchResults });
      
      const result = await service.discoverFullSchema('dn', 'pass');
      
      // Find specific attributes and check their inferred types
      const cnAttr = result.attributes.find(a => a.name === 'cn');
      expect(cnAttr?.syntax).toBe('string');
      
      const uacAttr = result.attributes.find(a => a.name === 'userAccountControl');
      expect(uacAttr?.syntax).toBe('integer');
      
      const lastLogonAttr = result.attributes.find(a => a.name === 'lastLogon');
      expect(lastLogonAttr?.syntax).toBe('datetime');
      
      const memberOfAttr = result.attributes.find(a => a.name === 'memberOf');
      expect(memberOfAttr?.syntax).toBe('array');
      
      const boolAttr = result.attributes.find(a => a.name === 'isDeleted');
      expect(boolAttr?.syntax).toBe('boolean');
    });

    it('should correctly identify common attributes', async () => {
      const mockSearchResults = [
        {
          sAMAccountName: 'jdoe',
          userPrincipalName: 'jdoe@test.com',
          displayName: 'John Doe',
          givenName: 'John',
          sn: 'Doe',
          mail: 'john.doe@test.com',
          department: 'IT',
          title: 'Developer',
          memberOf: ['Group1'],
          whenCreated: '20240101120000.0Z',
          userAccountControl: 512,
          customAttribute1: 'custom'
        }
      ];

      mockRedis.getJson.mockResolvedValue(null);
      mockADService.executeQuery.mockResolvedValue({ data: mockSearchResults });
      
      const result = await service.discoverFullSchema('dn', 'pass');
      
      // Check that common attributes are identified
      expect(result.commonAttributes.length).toBeGreaterThan(0);
      
      const commonNames = result.commonAttributes.map(a => a.name);
      expect(commonNames).toContain('sAMAccountName');
      expect(commonNames).toContain('displayName');
      expect(commonNames).toContain('mail');
      expect(commonNames).toContain('department');
      
      // Custom attributes should not be in common attributes
      expect(commonNames).not.toContain('customAttribute1');
    });

    it('should filter out dn and distinguishedName attributes during discovery', async () => {
      const mockSearchResults = [
        {
          dn: 'CN=John Doe,DC=test,DC=com',
          distinguishedName: 'CN=John Doe,DC=test,DC=com',
          cn: 'John Doe',
          sAMAccountName: 'jdoe'
        }
      ];

      mockRedis.getJson.mockResolvedValue(null);
      mockADService.executeQuery.mockResolvedValue({ data: mockSearchResults });
      
      const result = await service.discoverFullSchema('dn', 'pass');
      
      // dn and distinguishedName should be filtered out
      const attributeNames = result.attributes.map(a => a.name);
      expect(attributeNames).not.toContain('dn');
      expect(attributeNames).not.toContain('distinguishedName');
      
      // But other attributes should be present
      expect(attributeNames).toContain('cn');
      expect(attributeNames).toContain('sAMAccountName');
    });

    it('should use fallback schema when query fails', async () => {
      mockRedis.getJson.mockResolvedValue(null);
      mockADService.executeQuery.mockRejectedValue(new Error('Query failed'));
      
      const result = await service.discoverFullSchema('dn', 'pass');
      
      // Should contain fallback attributes
      expect(result.attributes.length).toBeGreaterThan(0);
      const attributeNames = result.attributes.map(a => a.name);
      expect(attributeNames).toContain('sAMAccountName');
      expect(attributeNames).toContain('displayName');
      expect(attributeNames).toContain('mail');
    });

    it('should generate proper display names for attributes', async () => {
      const mockSearchResults = [
        {
          sAMAccountName: 'jdoe',
          userPrincipalName: 'jdoe@test.com',
          'msDS-UserPasswordExpiryTimeComputed': '133524336000000000',
          'mS-DS-ConsistencyGuid': 'guid',
          objectGUID: Buffer.from('test'),
          dSCorePropagationData: 'data'
        }
      ];

      mockRedis.getJson.mockResolvedValue(null);
      mockADService.executeQuery.mockResolvedValue({ data: mockSearchResults });
      
      const result = await service.discoverFullSchema('dn', 'pass');
      
      // Check display name generation
      const samAttr = result.attributes.find(a => a.name === 'sAMAccountName');
      expect(samAttr?.displayName).toBe('SAM Account Name');
      
      const upnAttr = result.attributes.find(a => a.name === 'userPrincipalName');
      expect(upnAttr?.displayName).toBe('User Principal Name');
      
      const msdsAttr = result.attributes.find(a => a.name === 'msDS-UserPasswordExpiryTimeComputed');
      expect(msdsAttr?.displayName).toBe('MS-DS User Password Expiry Time Computed');
      
      const guidAttr = result.attributes.find(a => a.name === 'objectGUID');
      expect(guidAttr?.displayName).toBe('Object GUID');
    });
  });
});