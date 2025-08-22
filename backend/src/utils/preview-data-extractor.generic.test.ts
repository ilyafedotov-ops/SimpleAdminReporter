/**
 * Comprehensive Tests for Generic processPreviewData<T>() Function
 * Testing type safety, data transformation, and edge cases with typed responses
 */

import { 
  processPreviewData,
  isServiceResponse,
  isGraphApiResponse,
} from './preview-data-extractor';
import type { 
  DataSourceType,
  RawServiceResponse,
} from '@/types/shared-types';

describe('Generic processPreviewData<T>() Function', () => {
  
  describe('Type Safety and Generic Support', () => {
    
    interface ADUser {
      sAMAccountName: string;
      displayName: string;
      department: string;
      enabled: boolean;
      lastLogon?: Date;
    }

    interface AzureUser {
      userPrincipalName: string;
      displayName: string;
      jobTitle: string;
      mail: string;
      accountEnabled: boolean;
    }

    interface O365Mailbox {
      userPrincipalName: string;
      storageUsedInBytes: number;
      itemCount: number;
      lastActivityDate?: Date;
    }

    it('should maintain type safety with AD user data', () => {
      const adUsers: ADUser[] = [
        {
          sAMAccountName: 'jdoe',
          displayName: 'John Doe',
          department: 'IT',
          enabled: true,
          lastLogon: new Date('2025-01-01')
        },
        {
          sAMAccountName: 'asmith',
          displayName: 'Alice Smith',
          department: 'Finance',
          enabled: false
        }
      ];

      const response = 
      processPreviewData<ADUser>(adUsers, 'ad', 150);

      // Type assertions should pass at compile time
      expect(response.success).toBe(true);
      expect(response.data.source).toBe('ad');
      expect(response.data.testData).toHaveLength(2);
      
      // Access typed properties
      const firstUser = response.data.testData[0];
      expect(firstUser.sAMAccountName).toBe('jdoe');
      expect(firstUser.department).toBe('IT');
      expect(firstUser.enabled).toBe(true);
      expect(firstUser.lastLogon).toBeInstanceOf(Date);

      const secondUser = response.data.testData[1];
      expect(secondUser.sAMAccountName).toBe('asmith');
      expect(secondUser.enabled).toBe(false);
      expect(secondUser.lastLogon).toBeUndefined();
    });

    it('should maintain type safety with Azure user data', () => {
      const azureUsers: AzureUser[] = [
        {
          userPrincipalName: 'john.doe@company.com',
          displayName: 'John Doe',
          jobTitle: 'Software Engineer',
          mail: 'john.doe@company.com',
          accountEnabled: true
        }
      ];

      const response = 
      processPreviewData<AzureUser>(azureUsers, 'azure', 200);

      expect(response.success).toBe(true);
      expect(response.data.source).toBe('azure');
      
      const user = response.data.testData[0];
      expect(user.userPrincipalName).toBe('john.doe@company.com');
      expect(user.jobTitle).toBe('Software Engineer');
      expect(user.accountEnabled).toBe(true);
    });

    it('should maintain type safety with O365 mailbox data', () => {
      const mailboxes: O365Mailbox[] = [
        {
          userPrincipalName: 'user1@company.com',
          storageUsedInBytes: 1024 * 1024 * 500, // 500MB
          itemCount: 1250,
          lastActivityDate: new Date('2025-01-01')
        },
        {
          userPrincipalName: 'user2@company.com',
          storageUsedInBytes: 1024 * 1024 * 200, // 200MB
          itemCount: 800
        }
      ];

      const response = 
      processPreviewData<O365Mailbox>(mailboxes, 'o365', 300);

      expect(response.success).toBe(true);
      expect(response.data.source).toBe('o365');
      expect(response.data.testData).toHaveLength(2);
      
      const firstMailbox = response.data.testData[0];
      expect(firstMailbox.storageUsedInBytes).toBe(524288000);
      expect(firstMailbox.itemCount).toBe(1250);
      expect(firstMailbox.lastActivityDate).toBeInstanceOf(Date);

      const secondMailbox = response.data.testData[1];
      expect(secondMailbox.lastActivityDate).toBeUndefined();
    });

    it('should handle generic Record<string, unknown> type', () => {
      const genericData: Record<string, unknown>[] = [
        { id: 1, name: 'Test', active: true, metadata: { tags: ['admin'] } },
        { id: 2, name: 'Another', active: false, count: 42 }
      ];

      const response = 
      processPreviewData(genericData, 'postgres', 100);

      expect(response.success).toBe(true);
      expect(response.data.testData).toHaveLength(2);
      
      // Generic access should work
      expect(response.data.testData[0].id).toBe(1);
      expect(response.data.testData[0].name).toBe('Test');
      expect(response.data.testData[1].count).toBe(42);
    });
  });

  describe('Raw Service Response Processing with Types', () => {
    
    interface TestUser {
      username: string;
      email: string;
      active: boolean;
    }

    it('should process Graph API response format with types', () => {
      const graphResponse: RawServiceResponse = {
        value: [
          { username: 'user1', email: 'user1@test.com', active: true },
          { username: 'user2', email: 'user2@test.com', active: false }
        ],
        '@odata.count': 50
      };

      const response = 
      processPreviewData<TestUser>(graphResponse, 'azure', 180);

      expect(response.success).toBe(true);
      expect(response.data.source).toBe('azure');
      expect(response.data.executionTime).toBe(180);
      expect(response.data.rowCount).toBe(50); // From @odata.count
      expect(response.data.testData).toHaveLength(2);
      
      const user = response.data.testData[0] as TestUser;
      expect(user.username).toBe('user1');
      expect(user.active).toBe(true);
    });

    it('should process query result format with types', () => {
      const queryResponse: RawServiceResponse = {
        data: [
          { username: 'admin', email: 'admin@test.com', active: true }
        ],
        count: 1,
        totalCount: 100,
        success: true,
        cached: false
      };

      const response = 
      processPreviewData<TestUser>(queryResponse, 'ad', 120);

      expect(response.success).toBe(true);
      expect(response.data.source).toBe('ad');
      expect(response.data.rowCount).toBe(1); // From count
      expect(response.data.cached).toBeUndefined();
      
      const user = response.data.testData[0] as TestUser;
      expect(user.username).toBe('admin');
      expect(user.email).toBe('admin@test.com');
    });

    it('should process already processed testData format with types', () => {
      const processedResponse: RawServiceResponse = {
        testData: [
          { username: 'test', email: 'test@test.com', active: true }
        ],
        rowCount: 1,
        success: true
      };

      const response = 
      processPreviewData<TestUser>(processedResponse, 'o365', 90);

      expect(response.success).toBe(true);
      expect(response.data.testData).toHaveLength(1);
      
      const user = response.data.testData[0] as TestUser;
      expect(user.username).toBe('test');
      expect(user.active).toBe(true);
    });
  });

  describe('Complex Data Structure Processing', () => {
    
    interface ComplexUser {
      id: string;
      profile: {
        firstName: string;
        lastName: string;
        contact: {
          email: string;
          phone?: string;
        };
      };
      permissions: string[];
      metadata: {
        createdAt: Date;
        lastLogin?: Date;
        settings: Record<string, unknown>;
      };
    }

    it('should handle complex nested object structures', () => {
      const complexUsers: ComplexUser[] = [
        {
          id: 'user1',
          profile: {
            firstName: 'John',
            lastName: 'Doe',
            contact: {
              email: 'john@test.com',
              phone: '+1234567890'
            }
          },
          permissions: ['read', 'write', 'admin'],
          metadata: {
            createdAt: new Date('2024-01-01'),
            lastLogin: new Date('2025-01-01'),
            settings: {
              theme: 'dark',
              notifications: true,
              language: 'en'
            }
          }
        }
      ];

      const response = 
      processPreviewData<ComplexUser>(complexUsers, 'ad', 250);

      expect(response.success).toBe(true);
      expect(response.data.testData).toHaveLength(1);
      
      const user = response.data.testData[0];
      expect(user.id).toBe('user1');
      expect(user.profile.firstName).toBe('John');
      expect(user.profile.contact.email).toBe('john@test.com');
      expect(user.permissions).toContain('admin');
      expect(user.metadata.createdAt).toBeInstanceOf(Date);
      expect(user.metadata.settings.theme).toBe('dark');
    });

    it('should preserve array and object references', () => {
      interface UserWithArrays {
        tags: string[];
        groups: { id: string; name: string }[];
        config: Record<string, unknown>;
      }

      const users: UserWithArrays[] = [
        {
          tags: ['admin', 'developer'],
          groups: [
            { id: 'group1', name: 'Administrators' },
            { id: 'group2', name: 'Developers' }
          ],
          config: {
            maxSessions: 5,
            allowRemote: true
          }
        }
      ];

      const response = 
      processPreviewData<UserWithArrays>(users, 'azure', 150);

      const user = response.data.testData[0];
      expect(Array.isArray(user.tags)).toBe(true);
      expect(user.tags).toHaveLength(2);
      expect(Array.isArray(user.groups)).toBe(true);
      expect(user.groups[0].name).toBe('Administrators');
      expect(typeof user.config).toBe('object');
      expect(user.config.maxSessions).toBe(5);
    });
  });

  describe('Error Handling and Edge Cases with Types', () => {
    
    interface SimpleUser {
      id: number;
      name: string;
    }

    it('should handle empty data arrays gracefully', () => {
      const emptyData: SimpleUser[] = [];

      const response = 
      processPreviewData<SimpleUser>(emptyData, 'ad', 50);

      expect(response.success).toBe(true);
      expect(response.data.testData).toEqual([]);
      expect(response.data.rowCount).toBe(0);
      expect(response.data.metadata?.hasData).toBe(false);
    });

    it('should handle null and undefined gracefully', () => {
      const response1 = processPreviewData<SimpleUser>(null, 'ad', 50);
      const response2 = processPreviewData<SimpleUser>(undefined, 'ad', 50);

      expect(response1.success).toBe(true);
      expect(response1.data.testData).toEqual([]);
      expect(response1.data.rowCount).toBe(0);

      expect(response2.success).toBe(true);
      expect(response2.data.testData).toEqual([]);
      expect(response2.data.rowCount).toBe(0);
    });

    it('should handle malformed service responses', () => {
      const malformedResponse = {
        value: null, // Invalid value property
        data: undefined, // Invalid data property
        count: 'invalid' // Invalid count type
      };

      const response = 
      processPreviewData<SimpleUser>(malformedResponse, 'azure', 100);

      expect(response.success).toBe(true);
      expect(response.data.testData).toEqual([malformedResponse]); // Should treat as single object
      expect(response.data.rowCount).toBe(1);
    });

    it('should handle mixed data types in arrays', () => {
      const mixedData = [
        { id: 1, name: 'User 1' },
        { id: 2, title: 'Different Structure' }, // Different structure
        { id: 3, name: 'User 3', extra: 'field' }  // Extra field
      ];

      const response = 
      processPreviewData(mixedData, 'postgres', 75);

      expect(response.success).toBe(true);
      expect(response.data.testData).toHaveLength(3);
      expect(response.data.testData[0].id).toBe(1);
      expect(response.data.testData[1].id).toBe(2);
      expect((response.data.testData[2] as any).extra).toBe('field');
    });
  });

  describe('Metadata Preservation with Generic Types', () => {
    
    interface MetadataTest {
      value: string;
      count: number;
    }

    it('should preserve execution time in response', () => {
      const data: MetadataTest[] = [{ value: 'test', count: 1 }];
      const executionTime = 12345;

      const response = 
      processPreviewData<MetadataTest>(data, 'ad', executionTime);

      expect(response.data.executionTime).toBe(executionTime);
    });

    it('should preserve source type in response', () => {
      const data: MetadataTest[] = [{ value: 'test', count: 1 }];

      const sources: DataSourceType[] = ['ad', 'azure', 'o365', 'postgres'];
      
      sources.forEach(source => {
        const response = 
      processPreviewData<MetadataTest>(data, source, 100);
        expect(response.data.source).toBe(source);
      });
    });

    it('should include metadata from extraction process', () => {
      const data: MetadataTest[] = [
        { value: 'test1', count: 1 },
        { value: 'test2', count: 2 }
      ];

      const response = 
      processPreviewData<MetadataTest>(data, 'ad', 100);

      expect(response.data.metadata).toBeDefined();
      expect(response.data.metadata?.originalFormat).toBe('direct_array');
      expect(response.data.metadata?.isArray).toBe(true);
      expect(response.data.metadata?.hasData).toBe(true);
      expect(response.data.metadata?.extractedDataLength).toBe(2);
    });

    it('should mark response as test run', () => {
      const data: MetadataTest[] = [{ value: 'test', count: 1 }];

      const response = 
      processPreviewData<MetadataTest>(data, 'azure', 100);

      expect(response.data.isTestRun).toBe(true);
    });

    it('should handle cached flag when provided', () => {
      const data: MetadataTest[] = [{ value: 'test', count: 1 }];

      const response = 
      processPreviewData<MetadataTest>(data, 'o365', 100, true);

      expect(response.data.cached).toBe(true);
    });
  });

  describe('Performance and Memory Efficiency', () => {
    
    interface LargeDataset {
      id: number;
      data: string;
      timestamp: Date;
    }

    it('should handle large datasets efficiently', () => {
      const largeDataset: LargeDataset[] = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        data: `Data item ${i}`,
        timestamp: new Date()
      }));

      const startTime = Date.now();
      const response = 
      processPreviewData<LargeDataset>(largeDataset, 'postgres', 500);
      const processingTime = Date.now() - startTime;

      expect(response.success).toBe(true);
      expect(response.data.testData).toHaveLength(1000);
      expect(response.data.rowCount).toBe(1000);
      
      // Processing should be fast (under 100ms for 1000 items)
      expect(processingTime).toBeLessThan(100);
    });

    it('should not modify original data objects', () => {
      const originalData: LargeDataset[] = [
        { id: 1, data: 'Original', timestamp: new Date() }
      ];
      
      const originalDataCopy = JSON.parse(JSON.stringify(originalData));

      const response = 
      processPreviewData<LargeDataset>(originalData, 'ad', 100);

      // Original data should remain unchanged (timestamps will differ in copy)
      expect(originalData[0].id).toBe(originalDataCopy[0].id);
      expect(originalData[0].data).toBe(originalDataCopy[0].data);
      
      // Response data should be the same reference since extractPreviewData returns the original array
      expect(response.data.testData).toBe(originalData);
      expect(response.data.testData[0]).toBe(originalData[0]);
    });
  });

  describe('Integration with Type Guards', () => {
    
    it('should work correctly with isServiceResponse type guard', () => {
      const serviceResponse = {
        data: [{ id: 1, name: 'Test' }],
        count: 1,
        success: true
      };

      expect(isServiceResponse(serviceResponse)).toBe(true);

      const response = 
      processPreviewData(serviceResponse, 'ad', 100);
      expect(response.success).toBe(true);
      expect(response.data.testData).toEqual(serviceResponse.data);
    });

    it('should work correctly with isGraphApiResponse type guard', () => {
      const graphResponse = {
        value: [{ id: 1, name: 'Test' }],
        '@odata.count': 1
      };

      expect(isGraphApiResponse(graphResponse)).toBe(true);

      const response = 
      processPreviewData(graphResponse, 'azure', 100);
      expect(response.success).toBe(true);
      expect(response.data.testData).toEqual(graphResponse.value);
      expect(response.data.rowCount).toBe(1);
    });
  });

  describe('Backward Compatibility', () => {
    
    it('should maintain compatibility with existing API consumers', () => {
      // Simulate what existing controllers might send
      const legacyData = [
        { sAMAccountName: 'user1', displayName: 'User One', enabled: true },
        { sAMAccountName: 'user2', displayName: 'User Two', enabled: false }
      ];

      const response = 
      processPreviewData(legacyData, 'ad', 150);

      // Verify exact structure expected by frontend
      expect(response).toMatchObject({
        success: true,
        data: {
          source: 'ad',
          executionTime: 150,
          testData: legacyData,
          rowCount: 2,
          isTestRun: true
        }
      });

      // Should have metadata but not error
      expect(response.data.metadata).toBeDefined();
      expect(response.error).toBeUndefined();
    });

    it('should handle responses that match legacy format exactly', () => {
      const legacyResponse = {
        success: true,
        data: {
          source: 'ad',
          executionTime: 200,
          testData: [{ id: 1 }],
          rowCount: 1,
          isTestRun: true
        }
      };

      // If someone passes a pre-formatted response, it should still work
      const rawData = legacyResponse.data.testData;
      const newResponse = processPreviewData(rawData, 'ad', 200);

      expect(newResponse.data.testData).toEqual(legacyResponse.data.testData);
      expect(newResponse.data.source).toBe(legacyResponse.data.source);
    });
  });
});