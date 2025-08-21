/**
 * Frontend Type Integration Tests for Standardized Response Data Structure
 * Testing type safety, compatibility, and integration between frontend and backend types
 */

import type { 
  PreviewResponse, 
  PreviewMetadata, 
  CustomReportQuery,
  ReportField,
  ReportFilter 
} from './index';

describe('Frontend Types - PreviewResponse Integration', () => {
  
  describe('PreviewResponse<T> Type Safety', () => {
    
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

    interface O365Mailbox {
      userPrincipalName: string;
      displayName: string;
      storageUsedInBytes: number;
      itemCount: number;
      lastActivityDate?: Date;
    }

    it('should support typed AD user responses', () => {
      const adResponse: PreviewResponse<ADUser> = {
        success: true,
        data: {
          source: 'ad',
          executionTime: 150,
          testData: [
            {
              sAMAccountName: 'jdoe',
              displayName: 'John Doe',
              department: 'IT',
              enabled: true,
              lastLogon: new Date('2025-01-01'),
              memberOf: ['CN=IT Users,OU=Groups,DC=company,DC=com']
            }
          ],
          rowCount: 1,
          isTestRun: true,
          cached: false,
          metadata: {
            originalFormat: 'direct_array',
            extractedDataLength: 1,
            isArray: true,
            hasData: true
          }
        }
      };

      // Type assertions should work
      expect(adResponse.success).toBe(true);
      expect(adResponse.data.source).toBe('ad');
      expect(adResponse.data.testData).toHaveLength(1);
      
      // Typed access to AD-specific properties
      const user = adResponse.data.testData[0];
      expect(user.sAMAccountName).toBe('jdoe');
      expect(user.department).toBe('IT');
      expect(user.enabled).toBe(true);
      expect(user.memberOf).toContain('CN=IT Users,OU=Groups,DC=company,DC=com');
    });

    it('should support typed Azure user responses', () => {
      const azureResponse: PreviewResponse<AzureUser> = {
        success: true,
        data: {
          source: 'azure',
          executionTime: 200,
          testData: [
            {
              userPrincipalName: 'john.doe@company.com',
              displayName: 'John Doe',
              jobTitle: 'Software Engineer',
              mail: 'john.doe@company.com',
              accountEnabled: true,
              assignedLicenses: ['Office 365 E3', 'Azure AD Premium P1']
            }
          ],
          rowCount: 1,
          isTestRun: true
        }
      };

      const user = azureResponse.data.testData[0];
      expect(user.userPrincipalName).toBe('john.doe@company.com');
      expect(user.jobTitle).toBe('Software Engineer');
      expect(user.assignedLicenses).toHaveLength(2);
    });

    it('should support typed O365 mailbox responses', () => {
      const o365Response: PreviewResponse<O365Mailbox> = {
        success: true,
        data: {
          source: 'o365',
          executionTime: 300,
          testData: [
            {
              userPrincipalName: 'user@company.com',
              displayName: 'Test User',
              storageUsedInBytes: 1024 * 1024 * 500, // 500MB
              itemCount: 1250,
              lastActivityDate: new Date('2025-01-01')
            }
          ],
          rowCount: 1,
          isTestRun: true
        }
      };

      const mailbox = o365Response.data.testData[0];
      expect(mailbox.storageUsedInBytes).toBe(524288000);
      expect(mailbox.itemCount).toBe(1250);
      expect(mailbox.lastActivityDate).toBeInstanceOf(Date);
    });

    it('should support generic Record<string, unknown> type', () => {
      const genericResponse: PreviewResponse = {
        success: true,
        data: {
          source: 'postgres',
          executionTime: 100,
          testData: [
            { id: 1, name: 'Test', active: true },
            { id: 2, name: 'Another', count: 42 }
          ],
          rowCount: 2,
          isTestRun: true
        }
      };

      expect(genericResponse.data.testData).toHaveLength(2);
      expect(genericResponse.data.testData[0].id).toBe(1);
      expect(genericResponse.data.testData[1].count).toBe(42);
    });
  });

  describe('PreviewMetadata Integration', () => {
    
    it('should support comprehensive metadata structure', () => {
      const metadata: PreviewMetadata = {
        originalFormat: 'graph_api_value',
        extractedDataLength: 25,
        isArray: true,
        hasData: true,
        responseKeys: ['value', '@odata.count', '@odata.nextLink'],
        debugInfo: {
          processingTime: 45,
          transformations: ['flatten', 'normalize'],
          warnings: [],
          cacheStrategy: 'write-through'
        }
      };

      const response: PreviewResponse = {
        success: true,
        data: {
          source: 'azure',
          executionTime: 200,
          testData: [],
          rowCount: 25,
          isTestRun: true,
          metadata: metadata
        }
      };

      expect(response.data.metadata?.originalFormat).toBe('graph_api_value');
      expect(response.data.metadata?.debugInfo?.processingTime).toBe(45);
      expect(response.data.metadata?.responseKeys).toContain('@odata.count');
    });

    it('should handle optional metadata gracefully', () => {
      const response: PreviewResponse = {
        success: true,
        data: {
          source: 'ad',
          executionTime: 100,
          testData: [],
          rowCount: 0,
          isTestRun: true
          // No metadata
        }
      };

      expect(response.data.metadata).toBeUndefined();
    });
  });

  describe('Frontend-Backend Type Compatibility', () => {
    
    it('should match backend PreviewResponse structure exactly', () => {
      // This test ensures our frontend types match the backend implementation
      const backendResponse = {
        success: true,
        data: {
          source: 'ad',
          executionTime: 150,
          testData: [
            { sAMAccountName: 'user1', displayName: 'User One' }
          ],
          rowCount: 1,
          isTestRun: true,
          cached: false,
          metadata: {
            originalFormat: 'direct_array',
            extractedDataLength: 1,
            isArray: true,
            hasData: true
          }
        }
      };

      // Should be assignable to our frontend type
      const frontendResponse: PreviewResponse = backendResponse;
      
      expect(frontendResponse.success).toBe(true);
      expect(frontendResponse.data.source).toBe('ad');
      expect(frontendResponse.data.testData).toHaveLength(1);
    });

    it('should support all data source types', () => {
      const sources = ['ad', 'azure', 'o365', 'postgres'] as const;
      
      sources.forEach(source => {
        const response: PreviewResponse = {
          success: true,
          data: {
            source: source,
            executionTime: 100,
            testData: [{ id: 1 }],
            rowCount: 1,
            isTestRun: true
          }
        };

        expect(response.data.source).toBe(source);
      });
    });

    it('should handle error responses consistently', () => {
      const errorResponse: PreviewResponse = {
        success: false,
        data: {
          source: 'ad',
          executionTime: 50,
          testData: [],
          rowCount: 0,
          isTestRun: true
        },
        error: {
          code: 'QUERY_FAILED',
          message: 'Database connection timeout'
        }
      };

      expect(errorResponse.success).toBe(false);
      expect(errorResponse.error).toBeDefined();
      expect(errorResponse.error?.code).toBe('QUERY_FAILED');
    });
  });

  describe('CustomReportQuery Type Integration', () => {
    
    it('should support complex query structures', () => {
      const complexQuery: CustomReportQuery = {
        fields: [
          {
            name: 'sAMAccountName',
            displayName: 'Username',
            type: 'string',
            category: 'identity',
            isSelected: true
          },
          {
            name: 'department',
            displayName: 'Department',
            type: 'string',
            category: 'organization',
            isSelected: true
          },
          {
            name: 'lastLogon',
            displayName: 'Last Login',
            type: 'datetime',
            category: 'activity',
            isSelected: true
          }
        ],
        filters: [
          {
            field: 'enabled',
            operator: 'equals',
            value: true,
            dataType: 'boolean',
            logic: 'AND'
          },
          {
            field: 'department',
            operator: 'contains',
            value: 'IT',
            dataType: 'string',
            logic: 'AND'
          }
        ],
        groupBy: 'department',
        orderBy: [
          { field: 'lastLogon', direction: 'desc' }
        ],
        limit: 50
      };

      expect(complexQuery.fields).toHaveLength(3);
      expect(complexQuery.filters).toHaveLength(2);
      expect(complexQuery.groupBy).toBe('department');
      expect(complexQuery.orderBy?.[0].direction).toBe('desc');
    });

    it('should support minimal query structures', () => {
      const minimalQuery: CustomReportQuery = {
        fields: [
          {
            name: 'userPrincipalName',
            displayName: 'UPN',
            type: 'string',
            category: 'identity'
          }
        ],
        filters: []
      };

      expect(minimalQuery.fields).toHaveLength(1);
      expect(minimalQuery.filters).toHaveLength(0);
      expect(minimalQuery.groupBy).toBeUndefined();
      expect(minimalQuery.orderBy).toBeUndefined();
    });
  });

  describe('ReportField and ReportFilter Types', () => {
    
    it('should support all field types', () => {
      const fieldTypes = ['string', 'number', 'boolean', 'datetime', 'array'] as const;
      
      fieldTypes.forEach(type => {
        const field: ReportField = {
          name: `test_${type}`,
          displayName: `Test ${type}`,
          type: type,
          category: 'test',
          isSelected: true
        };

        expect(field.type).toBe(type);
      });
    });

    it('should support all filter operators', () => {
      const operators = [
        'equals', 'notEquals', 'contains', 'notContains',
        'startsWith', 'endsWith', 'greaterThan', 'lessThan',
        'greaterThanOrEqual', 'lessThanOrEqual', 'isEmpty', 'isNotEmpty'
      ] as const;

      operators.forEach(operator => {
        const filter: ReportFilter = {
          field: 'testField',
          operator: operator,
          value: 'testValue',
          dataType: 'string',
          logic: 'AND'
        };

        expect(filter.operator).toBe(operator);
      });
    });

    it('should support different data types and values', () => {
      const stringFilter: ReportFilter = {
        field: 'name',
        operator: 'contains',
        value: 'John',
        dataType: 'string'
      };

      const numberFilter: ReportFilter = {
        field: 'age',
        operator: 'greaterThan',
        value: 25,
        dataType: 'number'
      };

      const booleanFilter: ReportFilter = {
        field: 'enabled',
        operator: 'equals',
        value: true,
        dataType: 'boolean'
      };

      const nullFilter: ReportFilter = {
        field: 'lastLogin',
        operator: 'isEmpty',
        value: null,
        dataType: 'datetime'
      };

      expect(stringFilter.value).toBe('John');
      expect(numberFilter.value).toBe(25);
      expect(booleanFilter.value).toBe(true);
      expect(nullFilter.value).toBeNull();
    });
  });

  describe('Type Utility Functions', () => {
    
    it('should provide type guards for PreviewResponse', () => {
      function isSuccessfulPreviewResponse<T>(
        response: PreviewResponse<T>
      ): response is PreviewResponse<T> & { success: true } {
        return response.success === true;
      }

      const successResponse: PreviewResponse = {
        success: true,
        data: {
          source: 'ad',
          executionTime: 100,
          testData: [],
          rowCount: 0,
          isTestRun: true
        }
      };

      const errorResponse: PreviewResponse = {
        success: false,
        data: {
          source: 'ad',
          executionTime: 50,
          testData: [],
          rowCount: 0,
          isTestRun: true
        },
        error: { code: 'ERROR', message: 'Failed' }
      };

      expect(isSuccessfulPreviewResponse(successResponse)).toBe(true);
      expect(isSuccessfulPreviewResponse(errorResponse)).toBe(false);
    });

    it('should support type transformations', () => {
      type PreviewDataExtractor<T extends PreviewResponse> = 
        T extends PreviewResponse<infer U> ? U[] : never;

      interface TestUser {
        id: string;
        name: string;
      }

      type ExtractedUsers = PreviewDataExtractor<PreviewResponse<TestUser>>;
      
      // This should resolve to TestUser[]
      const users: ExtractedUsers = [
        { id: '1', name: 'User 1' },
        { id: '2', name: 'User 2' }
      ];

      expect(users).toHaveLength(2);
      expect(users[0].id).toBe('1');
    });
  });

  describe('Frontend Service Integration', () => {
    
    it('should support service method signatures', () => {
      // Mock service method that should accept our types
      function mockTestCustomQuery(
        source: 'ad' | 'azure' | 'o365',
        _query: CustomReportQuery,
        _parameters?: Record<string, unknown>,
        _limit?: number
      ): Promise<PreviewResponse> {
        return Promise.resolve({
          success: true,
          data: {
            source: source,
            executionTime: 100,
            testData: [],
            rowCount: 0,
            isTestRun: true
          }
        });
      }

      const query: CustomReportQuery = {
        fields: [{ name: 'test', displayName: 'Test', type: 'string', category: 'test' }],
        filters: []
      };

      // Should compile without errors
      const promise = mockTestCustomQuery('ad', query, { param: 'value' }, 10);
      expect(promise).toBeInstanceOf(Promise);
    });

    it('should support response processing', () => {
      function processPreviewResponse<T>(
        response: PreviewResponse<T>
      ): { data: T[]; count: number; cached: boolean } {
        return {
          data: response.data.testData,
          count: response.data.rowCount,
          cached: response.data.cached || false
        };
      }

      interface User {
        username: string;
        active: boolean;
      }

      const response: PreviewResponse<User> = {
        success: true,
        data: {
          source: 'ad',
          executionTime: 150,
          testData: [
            { username: 'user1', active: true },
            { username: 'user2', active: false }
          ],
          rowCount: 2,
          isTestRun: true,
          cached: true
        }
      };

      const processed = processPreviewResponse(response);
      
      expect(processed.data).toHaveLength(2);
      expect(processed.count).toBe(2);
      expect(processed.cached).toBe(true);
      expect(processed.data[0].username).toBe('user1');
    });
  });

  describe('Error Handling Types', () => {
    
    it('should support comprehensive error structures', () => {
      const detailedError: PreviewResponse = {
        success: false,
        data: {
          source: 'azure',
          executionTime: 30,
          testData: [],
          rowCount: 0,
          isTestRun: true
        },
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Query validation failed: Invalid field name',
          details: {
            field: 'invalidField',
            validFields: ['userPrincipalName', 'displayName'],
            suggestion: 'Use userPrincipalName instead of invalidField'
          },
          timestamp: new Date().toISOString()
        }
      };

      expect(detailedError.success).toBe(false);
      expect(detailedError.error?.code).toBe('VALIDATION_FAILED');
      expect(detailedError.error?.details?.field).toBe('invalidField');
    });
  });

  describe('Performance and Metadata Types', () => {
    
    it('should track execution metrics', () => {
      const performanceResponse: PreviewResponse = {
        success: true,
        data: {
          source: 'ad',
          executionTime: 2500, // 2.5 seconds
          testData: [{ id: 1 }],
          rowCount: 1000, // Large dataset
          isTestRun: true,
          cached: false,
          metadata: {
            originalFormat: 'query_result',
            extractedDataLength: 1000,
            isArray: false,
            hasData: true,
            debugInfo: {
              queryComplexity: 'high',
              optimizations: ['index_usage', 'limit_applied'],
              warnings: ['large_result_set'],
              cacheStrategy: 'no-cache'
            }
          }
        }
      };

      expect(performanceResponse.data.executionTime).toBe(2500);
      expect(performanceResponse.data.rowCount).toBe(1000);
      expect(performanceResponse.data.metadata?.debugInfo?.queryComplexity).toBe('high');
      expect(performanceResponse.data.metadata?.debugInfo?.warnings).toContain('large_result_set');
    });
  });

  describe('Backward Compatibility', () => {
    
    it('should maintain compatibility with legacy response formats', () => {
      // Legacy format that might still be returned by some endpoints
      const legacyResponse = {
        success: true,
        data: {
          source: 'ad',
          executionTime: 100,
          testData: [{ user: 'test' }],
          rowCount: 1,
          isTestRun: true
        }
      };

      // Should be compatible with current PreviewResponse type
      const modernResponse: PreviewResponse = legacyResponse;
      
      expect(modernResponse.success).toBe(true);
      expect(modernResponse.data.testData).toHaveLength(1);
    });

    it('should handle optional properties gracefully', () => {
      const minimalResponse: PreviewResponse = {
        success: true,
        data: {
          source: 'ad',
          executionTime: 100,
          testData: [],
          rowCount: 0,
          isTestRun: true
          // cached and metadata are optional
        }
      };

      expect(minimalResponse.data.cached).toBeUndefined();
      expect(minimalResponse.data.metadata).toBeUndefined();
    });
  });
});