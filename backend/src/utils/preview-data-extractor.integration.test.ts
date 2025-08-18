/**
 * Integration tests for Preview Data Extractor
 * Tests real-world scenarios with actual service response formats
 */

import { processPreviewData } from './preview-data-extractor';

describe('Preview Data Extractor Integration', () => {
  describe('Real-world service response formats', () => {
    it('should handle AD/LDAP service direct array response', () => {
      // Simulates actual LDAP search results
      const adResponse = [
        {
          sAMAccountName: 'jdoe',
          displayName: 'John Doe',
          mail: 'john.doe@company.com',
          department: 'IT',
          accountExpires: '9223372036854775807',
          lastLogonTimestamp: '133123456789012345'
        },
        {
          sAMAccountName: 'msmith',
          displayName: 'Mary Smith', 
          mail: 'mary.smith@company.com',
          department: 'HR',
          accountExpires: '9223372036854775807',
          lastLogonTimestamp: '133123456789012346'
        }
      ];

      const result = processPreviewData(adResponse, 'ad', 245);

      expect(result.success).toBe(true);
      expect(result.data.source).toBe('ad');
      expect(result.data.executionTime).toBe(245);
      expect(result.data.testData).toEqual(adResponse);
      expect(result.data.rowCount).toBe(2);
      expect(result.data.isTestRun).toBe(true);
    });

    it('should handle Azure Graph API response with value array', () => {
      // Simulates Microsoft Graph API users response
      const azureResponse = {
        '@odata.context': 'https://graph.microsoft.com/v1.0/$metadata#users',
        '@odata.count': 150,
        value: [
          {
            id: '12345-abcde-67890',
            displayName: 'Alice Johnson',
            userPrincipalName: 'alice.johnson@company.onmicrosoft.com',
            mail: 'alice.johnson@company.com',
            accountEnabled: true,
            createdDateTime: '2023-01-15T10:30:00Z',
            userType: 'Member'
          },
          {
            id: '67890-fghij-12345',
            displayName: 'Bob Wilson',
            userPrincipalName: 'bob.wilson@company.onmicrosoft.com',
            mail: 'bob.wilson@company.com',
            accountEnabled: false,
            createdDateTime: '2023-02-20T14:45:00Z',
            userType: 'Guest'
          }
        ],
        '@odata.nextLink': 'https://graph.microsoft.com/v1.0/users?$skip=20'
      };

      const result = processPreviewData(azureResponse, 'azure', 180);

      expect(result.success).toBe(true);
      expect(result.data.source).toBe('azure');
      expect(result.data.executionTime).toBe(180);
      expect(result.data.testData).toEqual(azureResponse.value);
      expect(result.data.rowCount).toBe(150); // Should use @odata.count
      expect(result.data.isTestRun).toBe(true);
    });

    it('should handle O365 CSV report response', () => {
      // Simulates O365 usage report parsed into objects
      const o365Response = {
        data: [
          {
            'User Principal Name': 'user1@company.com',
            'Display Name': 'User One',
            'Last Activity Date': '2024-01-15',
            'Product': 'Microsoft 365 Apps for Enterprise',
            'License Assigned Date': '2023-06-01',
            'Is Deleted': 'False'
          },
          {
            'User Principal Name': 'user2@company.com',
            'Display Name': 'User Two', 
            'Last Activity Date': '2024-01-14',
            'Product': 'Microsoft 365 Apps for Enterprise',
            'License Assigned Date': '2023-06-15',
            'Is Deleted': 'False'
          }
        ],
        count: 2,
        totalCount: 500,
        cached: false
      };

      const result = processPreviewData(o365Response, 'o365', 320);

      expect(result.success).toBe(true);
      expect(result.data.source).toBe('o365');
      expect(result.data.executionTime).toBe(320);
      expect(result.data.testData).toEqual(o365Response.data);
      expect(result.data.rowCount).toBe(2); // Should use count, not totalCount
      expect(result.data.isTestRun).toBe(true);
    });

    it('should handle database query result format', () => {
      // Simulates result from custom database query
      const dbResponse = {
        data: [
          {
            id: 1,
            report_name: 'Inactive Users Report',
            created_at: '2024-01-15T10:30:00Z',
            created_by: 'admin',
            last_run: '2024-01-16T09:15:00Z'
          },
          {
            id: 2,
            report_name: 'Password Expiry Report',
            created_at: '2024-01-16T11:45:00Z', 
            created_by: 'manager',
            last_run: null
          }
        ],
        resultCount: 2,
        success: true,
        cached: false
      };

      const result = processPreviewData(dbResponse, 'ad', 95);

      expect(result.success).toBe(true);
      expect(result.data.source).toBe('ad');
      expect(result.data.executionTime).toBe(95);
      expect(result.data.testData).toEqual(dbResponse.data);
      expect(result.data.rowCount).toBe(2);
      expect(result.data.isTestRun).toBe(true);
    });

    it('should handle empty result sets correctly', () => {
      const emptyResponse = {
        data: [],
        count: 0,
        totalCount: 1000 // Large total but no current results
      };

      const result = processPreviewData(emptyResponse, 'azure', 125);

      expect(result.success).toBe(true);
      expect(result.data.source).toBe('azure');
      expect(result.data.executionTime).toBe(125);
      expect(result.data.testData).toEqual([]);
      expect(result.data.rowCount).toBe(0);
      expect(result.data.isTestRun).toBe(true);
    });

    it('should handle error response objects', () => {
      const errorResponse = {
        error: 'Connection timeout',
        code: 'LDAP_TIMEOUT',
        details: 'Unable to connect to domain controller within timeout period'
      };

      const result = processPreviewData(errorResponse, 'ad', 5000);

      expect(result.success).toBe(true);
      expect(result.data.source).toBe('ad');
      expect(result.data.executionTime).toBe(5000);
      expect(result.data.testData).toEqual([errorResponse]); // Treated as single object
      expect(result.data.rowCount).toBe(1);
      expect(result.data.isTestRun).toBe(true);
    });

    it('should handle nested data structures', () => {
      // Complex response with nested user data
      const complexResponse = {
        data: [
          {
            user: {
              id: '123',
              name: 'John Doe',
              email: 'john@company.com'
            },
            groups: ['Administrators', 'IT Support'],
            permissions: {
              read: true,
              write: false,
              admin: true
            },
            lastLogin: '2024-01-15T10:30:00Z'
          }
        ],
        count: 1,
        metadata: {
          queryTime: '2024-01-16T12:00:00Z',
          source: 'Active Directory',
          cacheEnabled: true
        }
      };

      const result = processPreviewData(complexResponse, 'ad', 175);

      expect(result.success).toBe(true);
      expect(result.data.testData).toEqual(complexResponse.data);
      expect(result.data.rowCount).toBe(1);
      expect(result.data.testData[0]).toHaveProperty('user.name', 'John Doe');
      expect(result.data.testData[0]).toHaveProperty('groups');
      expect(result.data.testData[0]).toHaveProperty('permissions');
    });
  });

  describe('Performance and edge cases', () => {
    it('should handle large datasets efficiently', () => {
      // Create a large dataset to test performance
      const largeDataset = Array.from({ length: 1000 }, (_, index) => ({
        id: index + 1,
        name: `User ${index + 1}`,
        email: `user${index + 1}@company.com`,
        department: `Department ${(index % 10) + 1}`
      }));

      const startTime = Date.now();
      const result = processPreviewData(largeDataset, 'ad', 500);
      const processingTime = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.data.testData).toEqual(largeDataset);
      expect(result.data.rowCount).toBe(1000);
      expect(processingTime).toBeLessThan(100); // Should process quickly
    });

    it('should handle malformed data gracefully', () => {
      const malformedResponse = {
        someRandomProperty: 'value',
        anotherProperty: { nested: 'data' },
        arrayProperty: [1, 2, 3],
        nullProperty: null,
        undefinedProperty: undefined
      };

      const result = processPreviewData(malformedResponse, 'o365', 200);

      expect(result.success).toBe(true);
      expect(result.data.testData).toEqual([malformedResponse]);
      expect(result.data.rowCount).toBe(1);
    });

    it('should maintain data integrity for special characters', () => {
      const specialCharResponse = [
        {
          name: 'User with "quotes" and \\backslashes\\',
          description: 'Special chars: äöü ñ 中文 🚀',
          path: 'C:\\Windows\\System32\\file.exe',
          json: '{"key": "value with \\"quotes\\""}',
          unicode: '\u0041\u0042\u0043'
        }
      ];

      const result = processPreviewData(specialCharResponse, 'ad', 100);

      expect(result.success).toBe(true);
      expect(result.data.testData).toEqual(specialCharResponse);
      expect(result.data.testData[0].name).toContain('"quotes"');
      expect(result.data.testData[0].description).toContain('🚀');
      expect(result.data.testData[0].unicode).toBe('ABC');
    });
  });
});