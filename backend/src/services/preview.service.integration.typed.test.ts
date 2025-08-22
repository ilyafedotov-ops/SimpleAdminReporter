/**
 * Integration Tests for PreviewService with Typed Responses
 * Testing the complete flow from service execution to typed response generation
 */

import { previewService } from './preview.service';
import type { 
  PreviewResponse,
  PreviewRequest,

  CustomQuery
} from '@/types/shared-types';
import { redis } from '@/config/redis';
import { serviceFactory } from './service.factory';
import { processPreviewData } from '@/utils/preview-data-extractor';

// Mock external dependencies
jest.mock('@/config/redis');
jest.mock('./service.factory');
jest.mock('@/utils/preview-data-extractor');

describe('PreviewService - Typed Response Integration Tests', () => {
  let mockRedis: jest.Mocked<typeof redis>;
  let mockServiceFactory: jest.Mocked<typeof serviceFactory>;
  let mockProcessPreviewData: jest.MockedFunction<typeof processPreviewData>;

  // Type definitions for test data
  interface ADUser {
    sAMAccountName: string;
    displayName: string;
    department: string;
    enabled: boolean;
    lastLogon?: Date;
    memberOf: string[];
  }

  interface AzureUser {
    userPrincipalName: string;
    displayName: string;
    jobTitle: string;
    mail: string;
    accountEnabled: boolean;
    assignedLicenses: string[];
  }

  interface O365MailboxUsage {
    userPrincipalName: string;
    displayName: string;
    storageUsedInBytes: number;
    itemCount: number;
    lastActivityDate?: Date;
  }

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mocks
    mockRedis = redis as jest.Mocked<typeof redis>;
    mockServiceFactory = serviceFactory as jest.Mocked<typeof serviceFactory>;
    mockProcessPreviewData = processPreviewData as jest.MockedFunction<typeof processPreviewData>;

    // Default Redis behavior - no cached results
    mockRedis.getJson = jest.fn().mockResolvedValue(null);
    mockRedis.setJson = jest.fn().mockResolvedValue(undefined);
  });

  describe('AD Service Integration with Typed Responses', () => {
    
    const adUsers: ADUser[] = [
      {
        sAMAccountName: 'jdoe',
        displayName: 'John Doe',
        department: 'Information Technology',
        enabled: true,
        lastLogon: new Date('2025-01-01T10:00:00Z'),
        memberOf: ['CN=IT Users,OU=Groups,DC=company,DC=com', 'CN=All Users,OU=Groups,DC=company,DC=com']
      },
      {
        sAMAccountName: 'asmith',
        displayName: 'Alice Smith',
        department: 'Finance',
        enabled: false,
        memberOf: ['CN=Finance Users,OU=Groups,DC=company,DC=com']
      },
      {
        sAMAccountName: 'inactive_user',
        displayName: 'Inactive User',
        department: 'HR',
        enabled: true,
        // No lastLogon (never logged in)
        memberOf: []
      }
    ];

    it('should execute AD preview query and return typed response', async () => {
      const mockADService = {
        executeCustomQuery: jest.fn().mockResolvedValue({
          data: adUsers,
          success: true,
          count: 3
        })
      };

      mockServiceFactory.getADService.mockResolvedValue(mockADService as any);

      const expectedResponse: PreviewResponse<ADUser> = {
        success: true,
        data: {
          source: 'ad',
          executionTime: 150,
          testData: adUsers,
          rowCount: 3,
          isTestRun: true,
          cached: false,
          metadata: {
            originalFormat: 'query_result',
            extractedDataLength: 3,
            isArray: false,
            hasData: true
          }
        }
      };

      mockProcessPreviewData.mockReturnValue(expectedResponse as any);

      const request: PreviewRequest = {
        source: 'ad',
        query: {
          source: 'ad',
          fields: [
            { name: 'sAMAccountName', displayName: 'Username' },
            { name: 'displayName', displayName: 'Full Name' },
            { name: 'department', displayName: 'Department' }
          ],
          filters: [
            { field: 'enabled', operator: 'equals', value: true }
          ]
        },
        parameters: { orgUnit: 'CN=Users,DC=company,DC=com' },
        limit: 10
      };

      const result = await previewService.executePreview<ADUser>(request);

      // Verify service call
      expect(mockServiceFactory.getADService).toHaveBeenCalled();
      expect(mockADService.executeCustomQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'ad',
          fields: expect.arrayContaining([
            { name: 'sAMAccountName', displayName: 'Username' }
          ]),
          limit: 10
        }),
        { orgUnit: 'CN=Users,DC=company,DC=com' }
      );

      // Verify data processing
      expect(mockProcessPreviewData).toHaveBeenCalledWith(
        {
          data: adUsers,
          success: true,
          count: 3
        },
        'ad',
        expect.any(Number)
      );

      // Verify typed response
      expect(result.success).toBe(true);
      expect(result.data.source).toBe('ad');
      expect(result.data.testData).toHaveLength(3);
      
      // Type-safe access to AD-specific properties
      const firstUser = result.data.testData[0];
      expect(firstUser.sAMAccountName).toBe('jdoe');
      expect(firstUser.department).toBe('Information Technology');
      expect(firstUser.enabled).toBe(true);
      expect(firstUser.lastLogon).toBeInstanceOf(Date);
      expect(firstUser.memberOf).toContain('CN=IT Users,OU=Groups,DC=company,DC=com');
    });

    it('should handle AD service errors with proper error response', async () => {
      const mockADService = {
        executeCustomQuery: jest.fn().mockRejectedValue(new Error('LDAP connection failed'))
      };

      mockServiceFactory.getADService.mockResolvedValue(mockADService as any);

      const request: PreviewRequest = {
        source: 'ad',
        query: {
          source: 'ad',
          fields: [{ name: 'sAMAccountName' }]
        }
      };

      await expect(previewService.executePreview<ADUser>(request)).rejects.toThrow('LDAP connection failed');
    });
  });

  describe('Azure Service Integration with Typed Responses', () => {
    
    const azureUsers: AzureUser[] = [
      {
        userPrincipalName: 'john.doe@company.com',
        displayName: 'John Doe',
        jobTitle: 'Software Engineer',
        mail: 'john.doe@company.com',
        accountEnabled: true,
        assignedLicenses: ['Office 365 E3', 'Azure AD Premium P1']
      },
      {
        userPrincipalName: 'guest.user@external.com',
        displayName: 'Guest User',
        jobTitle: 'Consultant',
        mail: 'guest.user@external.com',
        accountEnabled: true,
        assignedLicenses: []
      }
    ];

    it('should execute Azure preview query and return typed response', async () => {
      const mockAzureService = {
        executeQuery: jest.fn().mockResolvedValue({
          value: azureUsers,
          '@odata.count': 2
        })
      };

      mockServiceFactory.getAzureService.mockResolvedValue(mockAzureService as any);

      const expectedResponse: PreviewResponse<AzureUser> = {
        success: true,
        data: {
          source: 'azure',
          executionTime: 200,
          testData: azureUsers,
          rowCount: 2,
          isTestRun: true,
          cached: false,
          metadata: {
            originalFormat: 'graph_api_value',
            extractedDataLength: 2,
            isArray: false,
            hasData: true
          }
        }
      };

      mockProcessPreviewData.mockReturnValue(expectedResponse as any);

      const request: PreviewRequest = {
        source: 'azure',
        query: {
          source: 'azure',
          fields: [
            { name: 'userPrincipalName', displayName: 'UPN' },
            { name: 'displayName', displayName: 'Name' },
            { name: 'jobTitle', displayName: 'Job Title' }
          ],
          filters: [
            { field: 'accountEnabled', operator: 'equals', value: true }
          ]
        },
        parameters: { userType: 'Member' },
        limit: 25
      };

      const result = await previewService.executePreview<AzureUser>(request);

      // Verify service call
      expect(mockServiceFactory.getAzureService).toHaveBeenCalled();
      expect(mockAzureService.executeQuery).toHaveBeenCalledWith({
        type: 'custom',
        source: 'azure',
        fields: expect.arrayContaining([
          { name: 'userPrincipalName', displayName: 'UPN' }
        ]),
        filters: expect.arrayContaining([
          { field: 'accountEnabled', operator: 'equals', value: true }
        ]),
        limit: 25,
        parameters: { userType: 'Member' }
      });

      // Verify typed response
      expect(result.success).toBe(true);
      expect(result.data.source).toBe('azure');
      expect(result.data.testData).toHaveLength(2);
      
      // Type-safe access to Azure-specific properties
      const firstUser = result.data.testData[0];
      expect(firstUser.userPrincipalName).toBe('john.doe@company.com');
      expect(firstUser.jobTitle).toBe('Software Engineer');
      expect(firstUser.assignedLicenses).toContain('Office 365 E3');

      const guestUser = result.data.testData[1];
      expect(guestUser.userPrincipalName).toBe('guest.user@external.com');
      expect(guestUser.assignedLicenses).toHaveLength(0);
    });
  });

  describe('O365 Service Integration with Typed Responses', () => {
    
    const mailboxUsage: O365MailboxUsage[] = [
      {
        userPrincipalName: 'user1@company.com',
        displayName: 'Active User',
        storageUsedInBytes: 1024 * 1024 * 500, // 500MB
        itemCount: 1250,
        lastActivityDate: new Date('2025-01-01T09:00:00Z')
      },
      {
        userPrincipalName: 'user2@company.com',
        displayName: 'Inactive User',
        storageUsedInBytes: 1024 * 1024 * 100, // 100MB
        itemCount: 300
        // No lastActivityDate
      }
    ];

    it('should execute O365 preview query and return typed response', async () => {
      const mockO365Service = {
        executeQuery: jest.fn().mockResolvedValue({
          value: mailboxUsage,
          '@odata.count': 2
        })
      };

      mockServiceFactory.getO365Service.mockResolvedValue(mockO365Service as any);

      const expectedResponse: PreviewResponse<O365MailboxUsage> = {
        success: true,
        data: {
          source: 'o365',
          executionTime: 300,
          testData: mailboxUsage,
          rowCount: 2,
          isTestRun: true,
          cached: false,
          metadata: {
            originalFormat: 'graph_api_value',
            extractedDataLength: 2,
            isArray: false,
            hasData: true
          }
        }
      };

      mockProcessPreviewData.mockReturnValue(expectedResponse as any);

      const request: PreviewRequest = {
        source: 'o365',
        query: {
          source: 'o365',
          fields: [
            { name: 'userPrincipalName', displayName: 'User' },
            { name: 'storageUsedInBytes', displayName: 'Storage Used' },
            { name: 'itemCount', displayName: 'Items' }
          ],
          filters: [
            { field: 'storageUsedInBytes', operator: 'greater_than', value: 1024 * 1024 * 50 } // > 50MB
          ]
        },
        limit: 50
      };

      const result = await previewService.executePreview<O365MailboxUsage>(request);

      // Verify typed response
      expect(result.success).toBe(true);
      expect(result.data.source).toBe('o365');
      expect(result.data.testData).toHaveLength(2);
      
      // Type-safe access to O365-specific properties
      const activeUser = result.data.testData[0];
      expect(activeUser.userPrincipalName).toBe('user1@company.com');
      expect(activeUser.storageUsedInBytes).toBe(524288000); // 500MB in bytes
      expect(activeUser.itemCount).toBe(1250);
      expect(activeUser.lastActivityDate).toBeInstanceOf(Date);

      const inactiveUser = result.data.testData[1];
      expect(inactiveUser.lastActivityDate).toBeUndefined();
    });
  });

  describe('Caching Integration with Typed Responses', () => {
    
    it('should cache and retrieve typed responses correctly', async () => {
      const cachedUsers: ADUser[] = [
        {
          sAMAccountName: 'cached_user',
          displayName: 'Cached User',
          department: 'IT',
          enabled: true,
          memberOf: []
        }
      ];

      const cachedResponse: PreviewResponse<ADUser> = {
        success: true,
        data: {
          source: 'ad',
          executionTime: 100,
          testData: cachedUsers,
          rowCount: 1,
          isTestRun: true,
          cached: true
        }
      };

      // Mock cached result
      mockRedis.getJson.mockResolvedValue({
        data: cachedResponse,
        cachedAt: Date.now() - 60000, // 1 minute ago
        expiresAt: Date.now() + 240000, // 4 minutes from now
        cacheHit: false
      });

      const request: PreviewRequest = {
        source: 'ad',
        query: {
          source: 'ad',
          fields: [{ name: 'sAMAccountName' }]
        }
      };

      const result = await previewService.executePreview<ADUser>(request);

      // Should return cached result without calling service
      expect(result).toBe(cachedResponse);
      expect(mockServiceFactory.getADService).not.toHaveBeenCalled();
      
      // Type safety should be maintained
      const cachedUser = result.data.testData[0];
      expect(cachedUser.sAMAccountName).toBe('cached_user');
      expect(cachedUser.department).toBe('IT');
    });

    it('should cache new typed responses after execution', async () => {
      const mockADService = {
        executeCustomQuery: jest.fn().mockResolvedValue({
          data: [{ sAMAccountName: 'new_user', displayName: 'New User', department: 'Sales', enabled: true, memberOf: [] }],
          success: true
        })
      };

      mockServiceFactory.getADService.mockResolvedValue(mockADService as any);

      const newResponse: PreviewResponse<ADUser> = {
        success: true,
        data: {
          source: 'ad',
          executionTime: 120,
          testData: [{ sAMAccountName: 'new_user', displayName: 'New User', department: 'Sales', enabled: true, memberOf: [] }],
          rowCount: 1,
          isTestRun: true,
          cached: false
        }
      };

      mockProcessPreviewData.mockReturnValue(newResponse as any);

      const request: PreviewRequest = {
        source: 'ad',
        query: {
          source: 'ad',
          fields: [{ name: 'sAMAccountName' }]
        }
      };

      await previewService.executePreview<ADUser>(request);

      // Verify caching was called
      expect(mockRedis.setJson).toHaveBeenCalledWith(
        expect.stringMatching(/^preview:ad:/),
        expect.objectContaining({
          data: newResponse,
          cachedAt: expect.any(Number),
          expiresAt: expect.any(Number),
          cacheHit: false
        }),
        300 // TTL
      );

      // Verify typed response
      expect(result.data.testData[0].sAMAccountName).toBe('new_user');
    });
  });

  describe('Error Scenarios with Typed Responses', () => {
    
    it('should handle validation errors before service execution', async () => {
      const invalidRequest: PreviewRequest = {
        source: 'invalid' as any, // Invalid source
        query: {
          source: 'ad',
          fields: []  // No fields
        }
      };

      await expect(previewService.executePreview(invalidRequest)).rejects.toThrow();
      
      // Service should not be called for validation errors
      expect(mockServiceFactory.getADService).not.toHaveBeenCalled();
      expect(mockServiceFactory.getAzureService).not.toHaveBeenCalled();
      expect(mockServiceFactory.getO365Service).not.toHaveBeenCalled();
    });

    it('should handle service connection errors gracefully', async () => {
      const mockAzureService = {
        executeQuery: jest.fn().mockRejectedValue(new Error('Azure AD connection timeout'))
      };

      mockServiceFactory.getAzureService.mockResolvedValue(mockAzureService as any);

      const request: PreviewRequest = {
        source: 'azure',
        query: {
          source: 'azure',
          fields: [{ name: 'userPrincipalName' }]
        }
      };

      await expect(previewService.executePreview<AzureUser>(request)).rejects.toThrow('Azure AD connection timeout');
    });

    it('should handle empty service responses correctly', async () => {
      const mockO365Service = {
        executeQuery: jest.fn().mockResolvedValue({
          value: [],
          '@odata.count': 0
        })
      };

      mockServiceFactory.getO365Service.mockResolvedValue(mockO365Service as any);

      const emptyResponse: PreviewResponse<O365MailboxUsage> = {
        success: true,
        data: {
          source: 'o365',
          executionTime: 50,
          testData: [],
          rowCount: 0,
          isTestRun: true,
          metadata: {
            originalFormat: 'graph_api_value',
            extractedDataLength: 0,
            isArray: false,
            hasData: false
          }
        }
      };

      mockProcessPreviewData.mockReturnValue(emptyResponse as any);

      const request: PreviewRequest = {
        source: 'o365',
        query: {
          source: 'o365',
          fields: [{ name: 'userPrincipalName' }]
        }
      };

      const result = await previewService.executePreview<O365MailboxUsage>(request);

      expect(result.success).toBe(true);
      expect(result.data.testData).toHaveLength(0);
      expect(result.data.rowCount).toBe(0);
      expect(result.data.metadata?.hasData).toBe(false);
    });
  });

  describe('Complex Query Integration with Types', () => {
    
    it('should handle complex queries with filters, grouping, and sorting', async () => {
      const complexQuery: CustomQuery = {
        source: 'ad',
        fields: [
          { name: 'department', displayName: 'Department' },
          { name: 'enabled', displayName: 'Status' }
        ],
        filters: [
          { field: 'enabled', operator: 'equals', value: true },
          { field: 'lastLogon', operator: 'newer_than', value: '30d' }
        ],
        groupBy: ['department'],
        orderBy: { field: 'department', direction: 'asc' },
        limit: 20
      };

      const departmentSummary = [
        { department: 'Finance', enabled: true, userCount: 15 },
        { department: 'IT', enabled: true, userCount: 8 },
        { department: 'Sales', enabled: true, userCount: 22 }
      ];

      const mockADService = {
        executeCustomQuery: jest.fn().mockResolvedValue({
          data: departmentSummary,
          success: true,
          count: 3
        })
      };

      mockServiceFactory.getADService.mockResolvedValue(mockADService as any);

      const expectedResponse: PreviewResponse = {
        success: true,
        data: {
          source: 'ad',
          executionTime: 180,
          testData: departmentSummary,
          rowCount: 3,
          isTestRun: true
        }
      };

      mockProcessPreviewData.mockReturnValue(expectedResponse as any);

      const request: PreviewRequest = {
        source: 'ad',
        query: complexQuery,
        parameters: { includeDisabled: false },
        limit: 20
      };

      const result = await previewService.executePreview(request);

      // Verify complex query was passed correctly
      expect(mockADService.executeCustomQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          fields: expect.arrayContaining([
            { name: 'department', displayName: 'Department' }
          ]),
          filters: expect.arrayContaining([
            { field: 'enabled', operator: 'equals', value: true }
          ]),
          groupBy: ['department'],
          orderBy: { field: 'department', direction: 'asc' },
          limit: 20
        }),
        { includeDisabled: false }
      );

      expect(result.success).toBe(true);
      expect(result.data.testData).toHaveLength(3);
    });

    it('should handle aggregation queries correctly', async () => {
      const aggregationQuery: CustomQuery = {
        source: 'azure',
        fields: [
          { name: 'jobTitle', displayName: 'Job Title' }
        ],
        aggregations: [
          { field: 'userPrincipalName', function: 'count', alias: 'user_count' }
        ],
        groupBy: ['jobTitle'],
        orderBy: { field: 'user_count', direction: 'desc' }
      };

      const jobTitleCounts = [
        { jobTitle: 'Software Engineer', user_count: 25 },
        { jobTitle: 'Project Manager', user_count: 8 },
        { jobTitle: 'Designer', user_count: 12 }
      ];

      const mockAzureService = {
        executeQuery: jest.fn().mockResolvedValue({
          value: jobTitleCounts,
          '@odata.count': 3
        })
      };

      mockServiceFactory.getAzureService.mockResolvedValue(mockAzureService as any);

      mockProcessPreviewData.mockReturnValue({
        success: true,
        data: {
          source: 'azure',
          executionTime: 250,
          testData: jobTitleCounts,
          rowCount: 3,
          isTestRun: true
        }
      } as any);

      const request: PreviewRequest = {
        source: 'azure',
        query: aggregationQuery
      };

      const result = await previewService.executePreview(request);

      expect(result.success).toBe(true);
      expect(result.data.testData[0]).toHaveProperty('user_count', 25);
    });
  });
});