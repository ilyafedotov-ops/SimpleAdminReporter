/**
 * Comprehensive Unit Tests for Shared Types
 * Testing TypeScript interfaces, type guards, and type safety validation
 */

import type {
  PreviewResponse,
  PreviewMetadata,
  RawServiceResponse,
  NormalizedPreviewData,
  DataSourceType,
  CustomQuery,
  QueryField,
  QueryFilter,
  FilterOperator,
  PreviewRequest,
  ServiceResponse,
  ServiceError
} from './shared-types';

describe('Shared Types - Type Safety and Validation', () => {
  
  describe('PreviewResponse<T> Interface', () => {
    it('should allow valid PreviewResponse structure', () => {
      interface TestUser {
        id: string;
        name: string;
        email: string;
      }

      const validResponse: PreviewResponse<TestUser> = {
        success: true,
        data: {
          source: 'ad',
          executionTime: 150,
          testData: [
            { id: '1', name: 'John Doe', email: 'john@example.com' },
            { id: '2', name: 'Jane Smith', email: 'jane@example.com' }
          ],
          rowCount: 2,
          isTestRun: true,
          cached: false,
          metadata: {
            originalFormat: 'direct_array',
            extractedDataLength: 2,
            isArray: true,
            hasData: true,
            responseKeys: ['id', 'name', 'email']
          }
        }
      };

      // TypeScript should allow this structure
      expect(validResponse.success).toBe(true);
      expect(validResponse.data.source).toBe('ad');
      expect(validResponse.data.testData).toHaveLength(2);
      expect(validResponse.data.testData[0].id).toBe('1');
    });

    it('should allow PreviewResponse with error', () => {
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
          message: 'Database connection timeout',
          timestamp: new Date()
        }
      };

      expect(errorResponse.success).toBe(false);
      expect(errorResponse.error).toBeDefined();
      expect(errorResponse.error?.code).toBe('QUERY_FAILED');
    });

    it('should support generic type parameter for different data structures', () => {
      interface ADUser {
        sAMAccountName: string;
        displayName: string;
        department: string;
      }

      interface AzureUser {
        userPrincipalName: string;
        displayName: string;
        jobTitle: string;
      }

      const adResponse: PreviewResponse<ADUser> = {
        success: true,
        data: {
          source: 'ad',
          executionTime: 100,
          testData: [
            { sAMAccountName: 'jdoe', displayName: 'John Doe', department: 'IT' }
          ],
          rowCount: 1,
          isTestRun: true
        }
      };

      const azureResponse: PreviewResponse<AzureUser> = {
        success: true,
        data: {
          source: 'azure',
          executionTime: 200,
          testData: [
            { userPrincipalName: 'jdoe@company.com', displayName: 'John Doe', jobTitle: 'Developer' }
          ],
          rowCount: 1,
          isTestRun: true
        }
      };

      // Type safety - accessing correct properties for each type
      expect(adResponse.data.testData[0].sAMAccountName).toBe('jdoe');
      expect(azureResponse.data.testData[0].userPrincipalName).toBe('jdoe@company.com');
    });

    it('should support optional properties', () => {
      const minimalResponse: PreviewResponse = {
        success: true,
        data: {
          source: 'ad',
          executionTime: 50,
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

  describe('PreviewMetadata Interface', () => {
    it('should allow valid metadata structure', () => {
      const metadata: PreviewMetadata = {
        originalFormat: 'graph_api_value',
        extractedDataLength: 25,
        isArray: true,
        hasData: true,
        responseKeys: ['value', '@odata.count', '@odata.nextLink'],
        debugInfo: {
          processingTime: 45,
          transformations: ['flatten', 'normalize'],
          warnings: []
        }
      };

      expect(metadata.originalFormat).toBe('graph_api_value');
      expect(metadata.extractedDataLength).toBe(25);
      expect(metadata.debugInfo?.processingTime).toBe(45);
    });

    it('should support minimal metadata', () => {
      const minimalMetadata: PreviewMetadata = {
        originalFormat: 'direct_array',
        extractedDataLength: 0,
        isArray: false,
        hasData: false
      };

      expect(minimalMetadata.responseKeys).toBeUndefined();
      expect(minimalMetadata.debugInfo).toBeUndefined();
    });
  });

  describe('DataSourceType Validation', () => {
    it('should accept valid data source types', () => {
      const validSources: DataSourceType[] = ['ad', 'azure', 'o365', 'postgres'];
      
      validSources.forEach(source => {
        const response: PreviewResponse = {
          success: true,
          data: {
            source: source,
            executionTime: 100,
            testData: [],
            rowCount: 0,
            isTestRun: true
          }
        };

        expect(response.data.source).toBe(source);
      });
    });
  });

  describe('CustomQuery Interface', () => {
    it('should allow complete query structure', () => {
      const complexQuery: CustomQuery = {
        source: 'ad',
        type: 'custom',
        fields: [
          { name: 'sAMAccountName', displayName: 'Username', type: 'string' },
          { name: 'displayName', displayName: 'Full Name', type: 'string' },
          { name: 'lastLogon', displayName: 'Last Login', type: 'date', format: 'ISO' }
        ],
        filters: [
          { field: 'enabled', operator: 'equals', value: true, type: 'boolean' },
          { field: 'department', operator: 'contains', value: 'IT', type: 'string' },
          { field: 'lastLogon', operator: 'older_than', value: '30d', type: 'date' }
        ],
        groupBy: ['department'],
        orderBy: { field: 'displayName', direction: 'asc' },
        aggregations: [
          { field: 'sAMAccountName', function: 'count', alias: 'user_count' }
        ],
        limit: 50
      };

      expect(complexQuery.source).toBe('ad');
      expect(complexQuery.fields).toHaveLength(3);
      expect(complexQuery.filters).toHaveLength(3);
      expect(complexQuery.aggregations).toHaveLength(1);
    });

    it('should allow minimal query structure', () => {
      const minimalQuery: CustomQuery = {
        source: 'azure',
        fields: [
          { name: 'userPrincipalName' }
        ]
      };

      expect(minimalQuery.source).toBe('azure');
      expect(minimalQuery.fields).toHaveLength(1);
      expect(minimalQuery.type).toBeUndefined();
      expect(minimalQuery.filters).toBeUndefined();
    });
  });

  describe('QueryField Interface', () => {
    it('should support all field properties', () => {
      const field: QueryField = {
        name: 'lastLogonTimestamp',
        displayName: 'Last Logon Date',
        type: 'datetime',
        format: 'yyyy-MM-dd HH:mm:ss',
        transform: 'fileTimeToDate'
      };

      expect(field.name).toBe('lastLogonTimestamp');
      expect(field.type).toBe('datetime');
      expect(field.transform).toBe('fileTimeToDate');
    });

    it('should allow minimal field definition', () => {
      const field: QueryField = {
        name: 'sAMAccountName'
      };

      expect(field.name).toBe('sAMAccountName');
      expect(field.displayName).toBeUndefined();
      expect(field.type).toBeUndefined();
    });
  });

  describe('QueryFilter Interface', () => {
    it('should support all filter operators', () => {
      const operators: FilterOperator[] = [
        'equals', 'not_equals', 'contains', 'not_contains',
        'startsWith', 'endsWith', 'greater_than', 'greater_or_equal',
        'less_than', 'less_or_equal', 'in', 'not_in',
        'exists', 'not_exists', 'older_than', 'newer_than'
      ];

      operators.forEach(operator => {
        const filter: QueryFilter = {
          field: 'testField',
          operator: operator,
          value: 'testValue'
        };

        expect(filter.operator).toBe(operator);
      });
    });

    it('should support complex filter values', () => {
      const filters: QueryFilter[] = [
        { field: 'enabled', operator: 'equals', value: true, type: 'boolean' },
        { field: 'count', operator: 'greater_than', value: 10, type: 'number' },
        { field: 'tags', operator: 'in', value: ['admin', 'user'], type: 'array' },
        { field: 'lastLogon', operator: 'older_than', value: new Date('2024-01-01'), type: 'date' }
      ];

      expect(filters[0].value).toBe(true);
      expect(filters[1].value).toBe(10);
      expect(Array.isArray(filters[2].value)).toBe(true);
      expect(filters[3].value).toBeInstanceOf(Date);
    });
  });

  describe('PreviewRequest Interface', () => {
    it('should allow complete request structure', () => {
      const request: PreviewRequest = {
        source: 'ad',
        query: {
          source: 'ad',
          fields: [{ name: 'sAMAccountName' }],
          filters: [{ field: 'enabled', operator: 'equals', value: true }]
        },
        parameters: {
          orgUnit: 'CN=Users,DC=company,DC=com',
          maxResults: 100
        },
        limit: 25
      };

      expect(request.source).toBe('ad');
      expect(request.parameters?.orgUnit).toBe('CN=Users,DC=company,DC=com');
      expect(request.limit).toBe(25);
    });

    it('should allow minimal request structure', () => {
      const request: PreviewRequest = {
        source: 'azure',
        query: {
          source: 'azure',
          fields: [{ name: 'userPrincipalName' }]
        }
      };

      expect(request.source).toBe('azure');
      expect(request.parameters).toBeUndefined();
      expect(request.limit).toBeUndefined();
    });
  });

  describe('RawServiceResponse Interface', () => {
    it('should support various response formats', () => {
      // Graph API format
      const graphResponse: RawServiceResponse = {
        value: [{ id: '1', name: 'Test' }],
        '@odata.count': 1,
        success: true
      };

      // Query result format
      const queryResponse: RawServiceResponse = {
        data: [{ id: '1', name: 'Test' }],
        count: 1,
        totalCount: 1,
        success: true,
        cached: false
      };

      // Processed format
      const processedResponse: RawServiceResponse = {
        testData: [{ id: '1', name: 'Test' }],
        rowCount: 1,
        success: true
      };

      expect(graphResponse.value).toHaveLength(1);
      expect(queryResponse.data).toHaveLength(1);
      expect(processedResponse.testData).toHaveLength(1);
    });
  });

  describe('ServiceResponse<T> Interface', () => {
    it('should support successful service responses', () => {
      interface User {
        id: string;
        name: string;
      }

      const successResponse: ServiceResponse<User[]> = {
        success: true,
        data: [
          { id: '1', name: 'John' },
          { id: '2', name: 'Jane' }
        ],
        metadata: {
          executionTime: 150,
          source: 'database'
        }
      };

      expect(successResponse.success).toBe(true);
      expect(successResponse.data).toHaveLength(2);
      expect(successResponse.data?.[0].name).toBe('John');
    });

    it('should support error service responses', () => {
      const errorResponse: ServiceResponse = {
        success: false,
        error: {
          code: 'DB_CONNECTION_FAILED',
          message: 'Unable to connect to database',
          details: { host: 'localhost', port: 5432 },
          timestamp: new Date()
        }
      };

      expect(errorResponse.success).toBe(false);
      expect(errorResponse.error?.code).toBe('DB_CONNECTION_FAILED');
      expect(errorResponse.data).toBeUndefined();
    });
  });

  describe('Type Compatibility and Inference', () => {
    it('should infer types correctly in generic functions', () => {
      function processPreviewResponse<T>(response: PreviewResponse<T>): T[] {
        return response.data.testData;
      }

      interface TestUser {
        username: string;
        active: boolean;
      }

      const response: PreviewResponse<TestUser> = {
        success: true,
        data: {
          source: 'ad',
          executionTime: 100,
          testData: [
            { username: 'test', active: true }
          ],
          rowCount: 1,
          isTestRun: true
        }
      };

      const users = processPreviewResponse(response);
      
      // TypeScript should infer this as TestUser[]
      expect(users[0].username).toBe('test');
      expect(users[0].active).toBe(true);
    });

    it('should allow type unions for data source responses', () => {
      type AnyPreviewResponse = PreviewResponse<Record<string, unknown>>;

      const responses: AnyPreviewResponse[] = [
        {
          success: true,
          data: {
            source: 'ad',
            executionTime: 100,
            testData: [{ sAMAccountName: 'test' }],
            rowCount: 1,
            isTestRun: true
          }
        },
        {
          success: true,
          data: {
            source: 'azure',
            executionTime: 200,
            testData: [{ userPrincipalName: 'test@domain.com' }],
            rowCount: 1,
            isTestRun: true
          }
        }
      ];

      expect(responses).toHaveLength(2);
      expect(responses[0].data.source).toBe('ad');
      expect(responses[1].data.source).toBe('azure');
    });
  });

  describe('Error Handling Types', () => {
    it('should provide comprehensive error information', () => {
      const error: ServiceError = {
        code: 'VALIDATION_FAILED',
        message: 'Query validation failed: Invalid field name',
        details: {
          field: 'invalidFieldName',
          validFields: ['sAMAccountName', 'displayName'],
          query: { source: 'ad', fields: [{ name: 'invalidFieldName' }] }
        },
        timestamp: new Date('2025-01-01T10:00:00Z')
      };

      expect(error.code).toBe('VALIDATION_FAILED');
      expect(error.details.field).toBe('invalidFieldName');
      expect(error.details.validFields).toContain('sAMAccountName');
    });
  });

  describe('Backward Compatibility', () => {
    it('should maintain compatibility with legacy response format', () => {
      // Legacy format (what might come from existing services)
      const legacyResponse = {
        data: [{ sAMAccountName: 'test', displayName: 'Test User' }],
        success: true,
        count: 1
      };

      // Should be compatible with RawServiceResponse
      const rawResponse: RawServiceResponse = legacyResponse;
      
      expect(rawResponse.data).toHaveLength(1);
      expect(rawResponse.success).toBe(true);
      expect(rawResponse.count).toBe(1);
    });
  });
});