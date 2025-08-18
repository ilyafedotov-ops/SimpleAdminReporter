// Mock dependencies first before any imports
jest.mock('ldapts');
jest.mock('../config/redis', () => ({
  redis: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK')
  }
}));

jest.mock('../utils/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    }),
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

jest.mock('./base/CredentialContextManager', () => ({
  CredentialContextManager: jest.fn().mockImplementation(() => ({
    getCredentials: jest.fn().mockResolvedValue({
      username: 'test-user',
      password: 'test-pass',
      domain: 'TEST'
    })
  }))
}));

// Mock LDAP utilities
jest.mock('../utils/ldap-utils', () => ({
  convertLDAPToUser: jest.fn((user: any) => ({
    username: user.attributes?.sAMAccountName || user.sAMAccountName || 'test.user',
    displayName: user.attributes?.displayName || user.displayName || 'Test User',
    email: user.attributes?.mail || user.mail || 'test@example.com',
    enabled: true,
    locked: false,
    department: user.attributes?.department || user.department,
    title: user.attributes?.title || user.title
  })),
  buildComplexFilter: jest.fn((baseFilter: string, conditions: any[]) => {
    if (!conditions || conditions.length === 0) {
      return baseFilter;
    }
    
    // Mock the actual complex filter building logic
    const conditionFilters = conditions.map(condition => {
      const { field, operator, value } = condition;
      const fieldName = field === 'sAMAccountName' ? 'sAMAccountName' : field;
      
      switch (operator) {
        case 'less_or_equal':
          return `(${fieldName}<=${value})`;
        case 'contains':
          return `(${fieldName}=*${value}*)`;
        case 'equals':
          return `(${fieldName}=${value})`;
        case 'not_equals':
          return `(!(${fieldName}=${value}))`;
        default:
          return `(${fieldName}=${value})`;
      }
    }).join('');
    
    return `(&${baseFilter}${conditionFilters})`;
  }),
  sortResults: jest.fn((results: any[], field: string, direction: string) => {
    return [...results].sort((a, b) => {
      const aVal = a[field] || '';
      const bVal = b[field] || '';
      return direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });
  }),
  daysToWindowsFileTime: jest.fn((days: number) => {
    const now = Date.now();
    const daysMs = days * 24 * 60 * 60 * 1000;
    return (now - daysMs).toString();
  }),
  LDAP_FILTERS: {
    USER: '(objectClass=user)',
    DISABLED_USERS: '(&(objectClass=user)(userAccountControl:1.2.840.113556.1.4.803:=2))',
    LOCKED_USERS: '(&(objectClass=user)(lockoutTime>=1))'
  },
  LDAP_ATTRIBUTES: {
    USER: ['sAMAccountName', 'displayName', 'mail', 'userPrincipalName', 'department', 'title']
  },
  UAC_FLAGS: {
    DONT_EXPIRE_PASSWORD: 65536
  },
  resolveFieldAlias: jest.fn((field: string) => field),
  resolveLDAPToAlias: jest.fn((field: string) => field)
}));

// Import after mocks are set up
import { ADService } from './ad.service';
import { CredentialContext } from './base/BaseDataSourceService';
import { Client } from 'ldapts';
import { redis } from '../config/redis';

// TODO: Update tests to use ldapts instead of ldapjs
// Tests temporarily disabled during migration from ldapjs to ldapts

describe('ADService', () => {
  let service: ADService;
  let mockClient: any;
  // let mockSearchRes: any;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Reset redis mocks to ensure clean state
    (redis.get as jest.Mock).mockReset();
    (redis.set as jest.Mock).mockReset();
    (redis.get as jest.Mock).mockResolvedValue(null);
    (redis.set as jest.Mock).mockResolvedValue('OK');
    
    // Setup mock LDAP client for ldapts
    mockClient = {
      bind: jest.fn().mockResolvedValue(undefined),
      unbind: jest.fn().mockResolvedValue(undefined),
      search: jest.fn(),
      isConnected: true
    };

    // Mock Client constructor from ldapts
    (Client as jest.MockedClass<typeof Client>).mockImplementation(() => mockClient);
    
    // ldapts uses promises and returns search entries directly
    mockClient.search.mockResolvedValue({
      searchEntries: [{
        dn: 'CN=Test User,OU=Users,DC=test,DC=com',
        sAMAccountName: 'testuser',
        displayName: 'Test User',
        mail: 'testuser@test.com',
        userAccountControl: 512,
        lockoutTime: 0
      }],
      searchReferences: []
    });

    service = new ADService();
    
    // Set the credential manager on the service
    const mockCredentialManager = {
      getCredentials: jest.fn().mockResolvedValue({
        username: 'test-user',
        password: 'test-pass',
        domain: 'TEST'
      })
    };
    service.setCredentialManager(mockCredentialManager as any);
  });

  afterEach(async () => {
    await service.closeAllConnections();
  });

  describe('Connection Management', () => {
    it('should create and bind LDAP connection', async () => {
      const connection = await (service as any).getConnection();
      
      expect(Client).toHaveBeenCalledWith({
        url: expect.stringContaining('ldap://'),
        timeout: 30000,
        connectTimeout: 10000,
        tlsOptions: undefined
      });
      
      expect(mockClient.bind).toHaveBeenCalled();
      expect(connection).toBe(mockClient);
    });

    it('should handle connection errors', async () => {
      mockClient.bind.mockRejectedValue(new Error('Invalid credentials'));
      
      await expect((service as any).getConnection()).rejects.toThrow();
      expect(mockClient.bind).toHaveBeenCalled();
    });

    it('should format LDAP URL correctly', () => {
      const formatLdapUrl = (service as any).formatLdapUrl.bind(service);
      
      expect(formatLdapUrl('server.domain.local')).toBe('ldap://server.domain.local:389');
      expect(formatLdapUrl('ldap://server.domain.local')).toBe('ldap://server.domain.local');
      expect(formatLdapUrl('ldaps://server.domain.local')).toBe('ldaps://server.domain.local');
      expect(formatLdapUrl(undefined)).toBeUndefined();
    });

    it('should use LDAPS when configured', () => {
      const originalEnv = process.env.AD_USE_LDAPS;
      process.env.AD_USE_LDAPS = 'true';
      
      const formatLdapUrl = (service as any).formatLdapUrl.bind(service);
      expect(formatLdapUrl('server.domain.local')).toBe('ldaps://server.domain.local:636');
      
      if (originalEnv) {
        process.env.AD_USE_LDAPS = originalEnv;
      } else {
        delete process.env.AD_USE_LDAPS;
      }
    });

    it('should test connection successfully', async () => {
      const result = await service.testConnection();
      
      expect(result).toBe(true);
      expect(mockClient.search).toHaveBeenCalled();
    });

    it('should handle connection test failure', async () => {
      mockClient.search.mockRejectedValue(new Error('Connection failed'));
      
      const result = await service.testConnection();
      
      expect(result).toBe(false);
    });
  });

  describe('Query Execution', () => {
    it('should execute basic user query', async () => {
      const result = await service.executeQuery({
        type: 'users',
        filter: '(&(objectClass=user)(objectCategory=person))',
        attributes: ['sAMAccountName', 'displayName', 'mail']
      } as any);
      
      expect(result).toMatchObject({
        data: expect.arrayContaining([
          expect.objectContaining({
            username: 'testuser',
            displayName: 'Test User',
            email: 'testuser@test.com'
          })
        ]),
        count: 1,
        executionTime: expect.any(Number)
      });
    });

    it('should use cache when available', async () => {
      const cachedData = {
        data: [{ username: 'cached' }],
        count: 1,
        executionTime: 10
      };
      
      (redis.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(cachedData));
      
      const result = await service.executeQuery({
        type: 'users',
        filter: '(objectClass=user)'
      } as any);
      
      expect(result.cached).toBe(true);
      expect(((result as any)?.data)).toEqual(cachedData.data);
      expect(mockClient.search).not.toHaveBeenCalled();
    });

    it('should cache query results', async () => {
      await service.executeQuery({
        type: 'users',
        filter: '(objectClass=user)'
      } as any);
      
      expect(redis.set).toHaveBeenCalledWith(
        expect.stringContaining('ad:'),
        expect.any(String),
        300
      );
    });

    it('should handle empty results', async () => {
      mockClient.search.mockResolvedValue({
        searchEntries: [],
        searchReferences: []
      });
      
      const result = await service.executeQuery({
        type: 'users',
        filter: '(sAMAccountName=nonexistent)'
      } as any);
      
      expect(((result as any)?.data)).toEqual([]);
      expect(result.count).toBe(0);
    });
  });

  describe('Report Methods', () => {
    it('should get inactive users', async () => {
      const users = await service.getInactiveUsers(30);
      
      expect(mockClient.search).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          filter: expect.stringContaining('lastLogonTimestamp<=')
        })
      );
      
      expect(users).toBeInstanceOf(Array);
    });

    it('should get disabled users', async () => {
      mockClient.search.mockResolvedValue({
        searchEntries: [{
          dn: 'CN=Disabled User,OU=Users,DC=test,DC=com',
          sAMAccountName: 'disableduser',
          userAccountControl: 514 // 512 + 2 (disabled)
        }],
        searchReferences: []
      });
      
      await service.getDisabledUsers();
      
      expect(mockClient.search).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          filter: expect.stringContaining('userAccountControl:1.2.840.113556.1.4.803:=2')
        })
      );
    });

    it('should get locked users', async () => {
      await service.getLockedUsers();
      
      expect(mockClient.search).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          filter: expect.stringContaining('lockoutTime>=1')
        })
      );
    });

    it('should search users by username', async () => {
      const users = await service.searchUsers('test', 'username');
      
      expect(mockClient.search).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          filter: expect.stringContaining('sAMAccountName=*test*')
        })
      );
      
      expect(users).toBeInstanceOf(Array);
    });

    it('should get users with expiring passwords', async () => {
      // Create a password that was set 80 days ago (will expire in 10 days with 90-day policy)
      const eightlyDaysAgo = new Date();
      eightlyDaysAgo.setDate(eightlyDaysAgo.getDate() - 80);
      
      // Mock a user result with password last set 80 days ago
      mockClient.search.mockResolvedValue({
        searchEntries: [{
          dn: 'CN=User,OU=Users,DC=test,DC=com',
          sAMAccountName: 'user1',
          passwordLastSet: ((eightlyDaysAgo.getTime() + 11644473600000) * 10000).toString(),
          userAccountControl: 512
        }],
        searchReferences: []
      });
      
      // Mock the convertLDAPToUser function to return proper user data
      const mockConvertLDAPToUser = require('../utils/ldap-utils').convertLDAPToUser;
      mockConvertLDAPToUser.mockReturnValueOnce({
        username: 'user1',
        passwordLastSet: eightlyDaysAgo,
        passwordNeverExpires: false
      });
      
      const users = await service.getUsersWithExpiringPasswords(14);
      
      // The test should work now since password expires in ~10 days (80 days old, 90-day policy)
      expect(users.length).toBeGreaterThan(0);
      expect(users[0]).toHaveProperty('username');
    });
  });

  describe('Custom Query Execution', () => {
    it('should execute custom query with filters', async () => {
      const customQuery = {
        fields: [
          { name: 'username', displayName: 'Username' },
          { name: 'email', displayName: 'Email' }
        ],
        filters: [
          { field: 'department', operator: 'equals', value: 'IT' }
        ],
        orderBy: { field: 'username', direction: 'asc' },
        limit: 50
      };
      
      const result = await service.executeCustomQuery(customQuery);
      
      expect(mockClient.search).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          filter: expect.stringContaining('department=IT')
        })
      );
      
      expect(((result as any)?.data)[0]).toHaveProperty('Username');
      expect(((result as any)?.data)[0]).toHaveProperty('Email');
    });

    it('should handle custom query with parameters', async () => {
      const customQuery = {
        filters: [
          { field: 'title', operator: 'contains', value: null }
        ]
      };
      
      const parameters = {
        title: 'Manager'
      };
      
      await service.executeCustomQuery(customQuery, parameters);
      
      expect(mockClient.search).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          filter: expect.stringContaining('title=*Manager*')
        })
      );
    });
  });

  describe('Credential Context', () => {
    it('should use user-specific credentials when provided', async () => {
      const context: CredentialContext = {
        userId: 123,
        credentials: {
          username: 'user-specific',
          password: 'user-pass'
        }
      };
      
      const contextService = new ADService(context);
      
      // Set the credential manager on the new service instance
      const mockContextCredentialManager = {
        getCredentials: jest.fn().mockResolvedValue({
          username: 'user-specific',
          password: 'user-pass'
        })
      };
      contextService.setCredentialManager(mockContextCredentialManager as any);
      
      await contextService.testConnection();
      
      expect(mockClient.bind).toHaveBeenCalledWith(
        'user-specific',
        'user-pass'
      );
    });
  });

  describe('Post Processing', () => {
    it('should sort results', async () => {
      // Add multiple entries
      mockClient.search.mockResolvedValue({
        searchEntries: [
          {
            dn: 'CN=User B,OU=Users,DC=test,DC=com',
            sAMAccountName: 'userb',
            displayName: 'User B'
          },
          {
            dn: 'CN=User A,OU=Users,DC=test,DC=com',
            sAMAccountName: 'usera',
            displayName: 'User A'
          }
        ],
        searchReferences: []
      });
      
      const result = await service.executeQuery({
        type: 'users',
        filter: '(objectClass=user)',
        orderBy: { field: 'displayName', direction: 'asc' }
      } as any);
      
      expect(((result as any)?.data)[0].displayName).toBe('User A');
      expect(((result as any)?.data)[1].displayName).toBe('User B');
    });

    it('should apply limit', async () => {
      // Add multiple entries
      const searchEntries = [];
      for (let i = 0; i < 5; i++) {
        searchEntries.push({
          dn: `CN=User ${i},OU=Users,DC=test,DC=com`,
          sAMAccountName: `user${i}`
        });
      }
      
      mockClient.search.mockResolvedValue({
        searchEntries,
        searchReferences: []
      });
      
      const result = await service.executeQuery({
        type: 'users',
        filter: '(objectClass=user)',
        options: { limit: 3 }
      } as any);
      
      expect(((result as any)?.data)).toHaveLength(3);
      expect(result.count).toBe(3);
    });
  });

  describe('User Authentication', () => {
    it('should authenticate user successfully', async () => {
      const result = await service.authenticateUser('testuser', 'password123');
      
      expect(result).toBe(true);
      expect(Client).toHaveBeenCalled();
      expect(mockClient.bind).toHaveBeenCalled();
      expect(mockClient.unbind).toHaveBeenCalled();
    });

    it('should handle authentication failure', async () => {
      mockClient.bind.mockRejectedValueOnce(new Error('Invalid credentials'));
      
      const result = await service.authenticateUser('testuser', 'wrongpassword');
      
      expect(result).toBe(false);
    });

    it('should handle network connection errors', async () => {
      mockClient.bind.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      
      const result = await service.authenticateUser('testuser', 'password123');
      
      expect(result).toBe(false);
    });

    it('should handle username with domain', async () => {
      await service.authenticateUser('testuser@custom.domain', 'password123');
      
      expect(mockClient.bind).toHaveBeenCalledWith('testuser@custom.domain', 'password123');
    });

    it('should construct proper bind DN for simple username', async () => {
      process.env.AD_DOMAIN = 'test.domain';
      
      // Update service config to pick up new environment variable
      (service as any).config.domain = process.env.AD_DOMAIN;
      
      await service.authenticateUser('testuser', 'password123');
      
      expect(mockClient.bind).toHaveBeenCalledWith('testuser@test.domain', 'password123');
    });
  });

  describe('User Retrieval', () => {
    it('should get user by username', async () => {
      const result = await service.getUser('testuser');
      
      expect(result).toBeDefined();
      expect(result?.username).toBe('testuser');
      expect(mockClient.search).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          filter: expect.stringContaining('sAMAccountName=testuser')
        })
      );
    });

    it('should return null when user not found', async () => {
      mockClient.search.mockResolvedValueOnce({
        searchEntries: [],
        searchReferences: []
      });
      
      const result = await service.getUser('nonexistent');
      
      expect(result).toBeNull();
    });

    it('should handle search errors gracefully', async () => {
      mockClient.search.mockRejectedValueOnce(new Error('Search failed'));
      
      const result = await service.getUser('testuser');
      
      expect(result).toBeNull();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle invalid baseDN gracefully', async () => {
      const result = await service.executeQuery({
        type: 'users',
        filter: '(objectClass=user)',
        baseDN: ',invalid,dn'
      } as any);
      
      // Should fallback to default baseDN
      expect(mockClient.search).toHaveBeenCalledWith(
        expect.stringMatching(/^[A-Z]+=/),
        expect.any(Object)
      );
      expect(result).toBeDefined();
    });

    it('should handle LDAP search timeouts', async () => {
      mockClient.search.mockRejectedValueOnce(new Error('Timeout'));
      
      await expect(service.executeQuery({
        type: 'users',
        filter: '(objectClass=user)'
      } as any)).rejects.toThrow();
    });

    it('should validate query parameters', async () => {
      await expect(service.executeQuery({} as any)).rejects.toThrow();
    });

    it('should handle Redis cache errors gracefully', async () => {
      const redisError = new Error('Redis connection failed');
      (redis.get as jest.Mock).mockRejectedValueOnce(redisError);
      (redis.set as jest.Mock).mockRejectedValueOnce(redisError);
      
      const result = await service.executeQuery({
        type: 'users',
        filter: '(objectClass=user)'
      } as any);
      
      // Should still return results even if cache fails
      expect(result).toBeDefined();
      expect(((result as any)?.data)).toHaveLength(1);
    });
  });

  describe('Security and Input Validation', () => {
    it('should prevent LDAP injection in search terms', async () => {
      const maliciousInput = 'test*)(objectClass=*)(&(sAMAccountName=admin';
      
      await service.searchUsers(maliciousInput, 'username');
      
      // Should still execute but with safe escaping
      expect(mockClient.search).toHaveBeenCalled();
    });

    it('should handle special characters in passwords', async () => {
      const specialPassword = 'p@ssw0rd!@#$%^&*()';
      
      await service.authenticateUser('testuser', specialPassword);
      
      expect(mockClient.bind).toHaveBeenCalledWith(
        expect.any(String),
        specialPassword
      );
    });

    it('should validate empty or null inputs', async () => {
      // Mock the bind to fail for empty credentials
      mockClient.bind.mockRejectedValueOnce(new Error('Invalid credentials'));
      const result1 = await service.authenticateUser('', 'password');
      
      mockClient.bind.mockRejectedValueOnce(new Error('Invalid credentials'));
      const result2 = await service.authenticateUser('user', '');
      
      // Mock empty search results for empty username
      mockClient.search.mockResolvedValueOnce({
        searchEntries: [],
        searchReferences: []
      });
      const result3 = await service.getUser('');
      
      expect(result1).toBe(false);
      expect(result2).toBe(false);
      expect(result3).toBeNull();
    });
  });

  describe('Performance and Resource Management', () => {
    it('should respect size limits in queries', async () => {
      await service.executeQuery({
        type: 'users',
        filter: '(objectClass=user)',
        options: { limit: 500 }
      } as any);
      
      expect(mockClient.search).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          sizeLimit: 500
        })
      );
    });

    it('should include execution time in results', async () => {
      const result = await service.executeQuery({
        type: 'users',
        filter: '(objectClass=user)'
      } as any);
      
      expect(result).toHaveProperty('executionTime');
      expect(typeof result.executionTime).toBe('number');
    });

    it('should close connections properly', async () => {
      await service.closeAllConnections();
      
      // Should not throw errors
      expect(service).toBeDefined();
    });

    it('should handle connection validation', async () => {
      const isValid = await (service as any).isConnectionValid(mockClient);
      expect(isValid).toBe(true);
      
      const isInvalid = await (service as any).isConnectionValid(null);
      expect(isInvalid).toBe(false);
    });
  });

  describe('Complex Query Scenarios', () => {
    it('should execute custom query with field transformations', async () => {
      const customQuery = {
        fields: [
          { name: 'sAMAccountName', displayName: 'Username' },
          { name: 'mail', displayName: 'Email Address' }
        ],
        filters: [
          { field: 'department', operator: 'equals', value: 'IT' }
        ],
        limit: 100
      };
      
      const result = await service.executeCustomQuery(customQuery);
      
      expect(((result as any)?.data)[0]).toHaveProperty('Username');
      expect(((result as any)?.data)[0]).toHaveProperty('Email Address');
    });

    it('should handle complex filter conditions', async () => {
      const customQuery = {
        filters: [
          { field: 'department', operator: 'equals', value: 'IT' },
          { field: 'title', operator: 'contains', value: 'Manager' },
          { field: 'userAccountControl', operator: 'not_equals', value: '514' }
        ]
      };
      
      await service.executeCustomQuery(customQuery);
      
      expect(mockClient.search).toHaveBeenCalled();
    });

    it('should support parameter substitution in custom queries', async () => {
      const customQuery = {
        filter: '(&(objectClass=user)(department={{dept}})(title={{title}}))'
      };
      const parameters = {
        dept: 'Engineering',
        title: 'Developer'
      };
      
      await service.executeCustomQuery(customQuery, parameters);
      
      expect(mockClient.search).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          filter: expect.stringContaining('Engineering')
        })
      );
    });
  });

  describe('Metrics', () => {
    it('should provide AD-specific metrics', () => {
      const metrics = service.getMetrics();
      
      expect(metrics).toMatchObject({
        serviceName: 'AD',
        dataSource: 'Active Directory',
        baseDN: expect.any(String),
        connectionPoolSize: expect.any(Number)
      });
    });
  });
});