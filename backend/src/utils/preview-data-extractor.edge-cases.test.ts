/**
 * Comprehensive Edge Case Tests for Preview Data Structure
 * Testing error scenarios, empty data, malformed inputs, and boundary conditions
 */

import { 
  extractPreviewData, 
  createPreviewResponse, 
  processPreviewData,
  isServiceResponse,
  isGraphApiResponse,
  extractRowCount
} from './preview-data-extractor';
import type { 
  DataSourceType,
  PreviewResponse,
  RawServiceResponse,
  NormalizedPreviewData
} from '@/types/shared-types';

describe('Preview Data Extractor - Edge Cases and Error Scenarios', () => {
  
  describe('Null and Undefined Handling', () => {
    
    it('should handle null input gracefully', () => {
      const result = extractPreviewData(null);

      expect(result.data).toEqual([]);
      expect(result.rowCount).toBe(0);
      expect(result.metadata.originalFormat).toBe('null_response');
      expect(result.metadata.hasData).toBe(false);
      expect(result.metadata.isArray).toBe(false);
    });

    it('should handle undefined input gracefully', () => {
      const result = extractPreviewData(undefined);

      expect(result.data).toEqual([]);
      expect(result.rowCount).toBe(0);
      expect(result.metadata.originalFormat).toBe('null_response');
      expect(result.metadata.hasData).toBe(false);
    });

    it('should handle objects with null data property', () => {
      const input = {
        data: null,
        count: 5,
        success: true
      };

      const result = extractPreviewData(input);

      expect(result.data).toEqual([input]);
      expect(result.rowCount).toBe(1);
      expect(result.metadata.originalFormat).toBe('single_object');
    });

    it('should handle objects with undefined data property', () => {
      const input = {
        data: undefined,
        count: 10,
        totalCount: 20
      };

      const result = extractPreviewData(input);

      expect(result.data).toEqual([input]);
      expect(result.rowCount).toBe(1);
      expect(result.metadata.originalFormat).toBe('single_object');
    });
  });

  describe('Empty Data Scenarios', () => {
    
    it('should handle empty arrays', () => {
      const result = extractPreviewData([]);

      expect(result.data).toEqual([]);
      expect(result.rowCount).toBe(0);
      expect(result.metadata.originalFormat).toBe('direct_array');
      expect(result.metadata.hasData).toBe(false);
      expect(result.metadata.isArray).toBe(true);
      expect(result.metadata.extractedDataLength).toBe(0);
    });

    it('should handle objects with empty data arrays', () => {
      const input = {
        data: [],
        count: 0,
        totalCount: 0
      };

      const result = extractPreviewData(input);

      expect(result.data).toEqual([]);
      expect(result.rowCount).toBe(0);
      expect(result.metadata.originalFormat).toBe('query_result');
      expect(result.metadata.hasData).toBe(false);
    });

    it('should handle Graph API responses with empty value arrays', () => {
      const input = {
        value: [],
        '@odata.count': 0
      };

      const result = extractPreviewData(input);

      expect(result.data).toEqual([]);
      expect(result.rowCount).toBe(0);
      expect(result.metadata.originalFormat).toBe('graph_api_value');
      expect(result.metadata.hasData).toBe(false);
    });

    it('should handle processed responses with empty testData', () => {
      const input = {
        testData: [],
        rowCount: 0
      };

      const result = extractPreviewData(input);

      expect(result.data).toEqual([]);
      expect(result.rowCount).toBe(0);
      expect(result.metadata.originalFormat).toBe('processed_test_data');
    });
  });

  describe('Malformed Input Handling', () => {
    
    it('should handle circular references', () => {
      const circular: any = { name: 'test' };
      circular.self = circular;

      const result = extractPreviewData(circular);

      expect(result.data).toEqual([circular]);
      expect(result.rowCount).toBe(1);
      expect(result.metadata.originalFormat).toBe('single_object');
    });

    it('should handle objects with non-array data property', () => {
      const input = {
        data: 'not an array',
        count: 1
      };

      const result = extractPreviewData(input);

      expect(result.data).toEqual([input]);
      expect(result.rowCount).toBe(1);
      expect(result.metadata.originalFormat).toBe('single_object');
    });

    it('should handle objects with non-array value property', () => {
      const input = {
        value: 'not an array',
        '@odata.count': 1
      };

      const result = extractPreviewData(input);

      expect(result.data).toEqual([input]);
      expect(result.rowCount).toBe(1);
      expect(result.metadata.originalFormat).toBe('single_object');
    });

    it('should handle objects with invalid count values', () => {
      const input = {
        data: [{ id: 1 }, { id: 2 }],
        count: 'invalid',
        totalCount: null,
        resultCount: undefined
      };

      const result = extractPreviewData(input);

      expect(result.data).toEqual(input.data);
      expect(result.rowCount).toBe("invalid"); // Should preserve original count even if invalid
      expect(result.metadata.originalFormat).toBe('query_result');
    });

    it('should handle negative count values', () => {
      const input = {
        data: [{ id: 1 }],
        count: -5
      };

      const result = extractPreviewData(input);

      expect(result.data).toEqual(input.data);
      expect(result.rowCount).toBe(-5); // Should preserve original count even if negative
      expect(result.metadata.originalFormat).toBe('query_result');
    });
  });

  describe('Large Data Set Handling', () => {
    
    it('should handle very large arrays efficiently', () => {
      const largeArray = Array.from({ length: 10000 }, (_, i) => ({ id: i, data: `item-${i}` }));
      
      const startTime = Date.now();
      const result = extractPreviewData(largeArray);
      const processingTime = Date.now() - startTime;

      expect(result.data).toHaveLength(10000);
      expect(result.rowCount).toBe(10000);
      expect(result.metadata.extractedDataLength).toBe(10000);
      expect(processingTime).toBeLessThan(100); // Should be fast (under 100ms)
    });

    it('should handle objects with mismatched count and array length', () => {
      const input = {
        data: [{ id: 1 }, { id: 2 }, { id: 3 }],
        count: 100, // Much larger than actual array
        totalCount: 50,
        resultCount: 25
      };

      const result = extractPreviewData(input);

      expect(result.data).toHaveLength(3);
      expect(result.rowCount).toBe(100); // Should use count, not array length
      expect(result.metadata.originalFormat).toBe('query_result');
    });
  });

  describe('Primitive Value Handling', () => {
    
    it('should handle string primitives', () => {
      const result = extractPreviewData('simple string');

      expect(result.data).toEqual(['simple string']);
      expect(result.rowCount).toBe(1);
      expect(result.metadata.originalFormat).toBe('primitive_response');
    });

    it('should handle number primitives', () => {
      const result = extractPreviewData(42);

      expect(result.data).toEqual([42]);
      expect(result.rowCount).toBe(1);
      expect(result.metadata.originalFormat).toBe('primitive_response');
    });

    it('should handle boolean primitives', () => {
      const result = extractPreviewData(true);

      expect(result.data).toEqual([true]);
      expect(result.rowCount).toBe(1);
      expect(result.metadata.originalFormat).toBe('primitive_response');
    });

    it('should handle zero as primitive', () => {
      const result = extractPreviewData(0);

      expect(result.data).toEqual([]); // 0 is falsy, so rawData ? [rawData] : [] returns []
      expect(result.rowCount).toBe(0);
      expect(result.metadata.originalFormat).toBe('primitive_response'); // 0 !== null/undefined
    });

    it('should handle empty string as primitive', () => {
      const result = extractPreviewData('');

      expect(result.data).toEqual([]); // '' is falsy, so rawData ? [rawData] : [] returns []
      expect(result.rowCount).toBe(0);
      expect(result.metadata.originalFormat).toBe('primitive_response');
    });
  });

  describe('Complex Nested Structure Handling', () => {
    
    it('should handle deeply nested objects', () => {
      const deeplyNested = {
        level1: {
          level2: {
            level3: {
              level4: {
                data: [{ id: 1, name: 'deep' }]
              }
            }
          }
        }
      };

      const result = extractPreviewData(deeplyNested);

      expect(result.data).toEqual([deeplyNested]);
      expect(result.rowCount).toBe(1);
      expect(result.metadata.originalFormat).toBe('single_object');
    });

    it('should handle arrays with mixed data types', () => {
      const mixedArray = [
        { type: 'object', id: 1 },
        'string value',
        42,
        true,
        null,
        { type: 'another object', value: 'test' }
      ];

      const result = extractPreviewData(mixedArray);

      expect(result.data).toEqual(mixedArray);
      expect(result.rowCount).toBe(6);
      expect(result.metadata.originalFormat).toBe('direct_array');
      expect(result.metadata.hasData).toBe(true);
    });

    it('should handle objects with functions (should be serializable)', () => {
      const objectWithFunction = {
        data: [{ id: 1, name: 'test' }],
        count: 1,
        helper: () => 'function'
      };

      const result = extractPreviewData(objectWithFunction);

      expect(result.data).toEqual(objectWithFunction.data);
      expect(result.rowCount).toBe(1);
      expect(result.metadata.originalFormat).toBe('query_result');
    });
  });

  describe('Type Guard Edge Cases', () => {
    
    it('should handle edge cases in isServiceResponse', () => {
      expect(isServiceResponse({})).toBe(false);
      expect(isServiceResponse({ randomProperty: 'value' })).toBe(false);
      expect(isServiceResponse({ data: 'not array' })).toBe(true); // Still considered service response
      expect(isServiceResponse({ value: 'not array' })).toBe(true);
      expect(isServiceResponse({ testData: 'not array' })).toBe(true);
      expect(isServiceResponse({ count: 'not number' })).toBe(true);
    });

    it('should handle edge cases in isGraphApiResponse', () => {
      expect(isGraphApiResponse({})).toBe(false);
      expect(isGraphApiResponse({ randomProperty: 'value' })).toBe(false);
      expect(isGraphApiResponse({ value: null })).toBe(true);
      expect(isGraphApiResponse({ '@odata.count': 'not number' })).toBe(true);
      expect(isGraphApiResponse({ value: [], '@odata.count': 10 })).toBe(true);
    });

    it('should handle edge cases in extractRowCount', () => {
      expect(extractRowCount({})).toBe(1); // Empty object treated as single item
      expect(extractRowCount({ randomProperty: 'value' })).toBe(1);
      expect(extractRowCount({ count: 'invalid' })).toBe("invalid"); // Invalid count preserved
      expect(extractRowCount({ data: 'not array' })).toBe(1);
      expect(extractRowCount({ value: 'not array' })).toBe(1);
    });
  });

  describe('Memory and Performance Edge Cases', () => {
    
    it('should handle very deep object nesting without stack overflow', () => {
      let deepObject: any = { data: [] };
      
      // Create 100 levels of nesting
      for (let i = 0; i < 100; i++) {
        deepObject = { nested: deepObject };
      }

      expect(() => {
        const result = extractPreviewData(deepObject);
        expect(result.data).toEqual([deepObject]);
      }).not.toThrow();
    });

    it('should handle objects with many properties', () => {
      const objectWithManyProps: any = {
        data: [{ id: 1 }],
        count: 1
      };

      // Add 1000 additional properties
      for (let i = 0; i < 1000; i++) {
        objectWithManyProps[`prop${i}`] = `value${i}`;
      }

      const result = extractPreviewData(objectWithManyProps);

      expect(result.data).toEqual(objectWithManyProps.data);
      expect(result.rowCount).toBe(1);
      expect(result.metadata.originalFormat).toBe('query_result');
    });
  });

  describe('Error Response Processing', () => {
    
    it('should handle error responses from services', () => {
      const errorResponse = {
        success: false,
        error: 'Database connection failed',
        data: null
      };

      const result = processPreviewData(errorResponse, 'ad', 100);

      expect(result.success).toBe(true); // processPreviewData always returns success: true
      expect(result.data.testData).toEqual([errorResponse]);
      expect(result.data.rowCount).toBe(1);
      expect(result.data.source).toBe('ad');
    });

    it('should handle timeout responses', () => {
      const timeoutResponse = {
        error: 'Query timeout after 30 seconds',
        timeout: true
      };

      const result = processPreviewData(timeoutResponse, 'azure', 30000);

      expect(result.success).toBe(true);
      expect(result.data.executionTime).toBe(30000);
      expect(result.data.testData).toEqual([timeoutResponse]);
    });

    it('should handle partial failure responses', () => {
      const partialFailure = {
        data: [{ id: 1, name: 'success' }],
        errors: [{ id: 2, error: 'failed to fetch' }],
        count: 1,
        totalRequested: 2
      };

      const result = processPreviewData(partialFailure, 'o365', 200);

      expect(result.data.testData).toEqual(partialFailure.data);
      expect(result.data.rowCount).toBe(1);
      expect(result.data.source).toBe('o365');
    });
  });

  describe('Cache-Related Edge Cases', () => {
    
    it('should handle cached responses with stale data', () => {
      const staleResponse = {
        testData: [{ id: 1, lastUpdated: '2020-01-01' }],
        rowCount: 1,
        cached: true,
        cacheTimestamp: '2020-01-01T00:00:00Z'
      };

      const result = processPreviewData(staleResponse, 'ad', 10, true);

      expect(result.data.testData).toEqual(staleResponse.testData);
      expect(result.data.cached).toBe(true);
      expect(result.data.executionTime).toBe(10); // Fast due to cache
    });

    it('should handle cache corruption scenarios', () => {
      const corruptedCache = {
        testData: 'corrupted data',
        rowCount: 'invalid',
        metadata: null
      };

      const result = processPreviewData(corruptedCache, 'azure', 50);

      expect(result.data.testData).toEqual([corruptedCache]);
      expect(result.data.rowCount).toBe(1);
      expect(result.data.source).toBe('azure');
    });
  });

  describe('Data Source Specific Edge Cases', () => {
    
    it('should handle AD-specific edge cases', () => {
      const adResponse = {
        data: [
          { sAMAccountName: null, displayName: '' }, // Null/empty values
          { sAMAccountName: 'user@domain.com', displayName: undefined },
          { distinguishedName: 'CN=Test,DC=domain,DC=com' } // Missing expected fields
        ],
        count: 3
      };

      const result = processPreviewData(adResponse, 'ad', 150);

      expect(result.data.testData).toHaveLength(3);
      expect(result.data.source).toBe('ad');
      expect(result.data.testData[0].sAMAccountName).toBeNull();
      expect(result.data.testData[1].displayName).toBeUndefined();
    });

    it('should handle Azure Graph API edge cases', () => {
      const azureResponse = {
        value: [
          { '@odata.type': '#microsoft.graph.user', id: '1' },
          { '@odata.context': 'https://graph.microsoft.com/v1.0/$metadata#users' }
        ],
        '@odata.count': 2,
        '@odata.nextLink': 'https://graph.microsoft.com/v1.0/users?$skiptoken=...'
      };

      const result = processPreviewData(azureResponse, 'azure', 300);

      expect(result.data.testData).toHaveLength(2);
      expect(result.data.rowCount).toBe(2);
      expect(result.data.source).toBe('azure');
      expect(result.data.metadata?.originalFormat).toBe('graph_api_value');
    });

    it('should handle O365 reporting API edge cases', () => {
      const o365Response = {
        value: [
          { userPrincipalName: 'user1@domain.com', storageUsedInBytes: 0 },
          { userPrincipalName: 'user2@domain.com', storageUsedInBytes: null },
          { userPrincipalName: null, storageUsedInBytes: 1024 } // Malformed data
        ],
        '@odata.count': 3
      };

      const result = processPreviewData(o365Response, 'o365', 250);

      expect(result.data.testData).toHaveLength(3);
      expect(result.data.testData[1].storageUsedInBytes).toBeNull();
      expect(result.data.testData[2].userPrincipalName).toBeNull();
    });
  });

  describe('Boundary Value Testing', () => {
    
    it('should handle maximum safe integer values', () => {
      const input = {
        data: [{ id: Number.MAX_SAFE_INTEGER }],
        count: Number.MAX_SAFE_INTEGER
      };

      const result = extractPreviewData(input);

      expect(result.data[0].id).toBe(Number.MAX_SAFE_INTEGER);
      expect(result.rowCount).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('should handle minimum safe integer values', () => {
      const input = {
        data: [{ id: Number.MIN_SAFE_INTEGER }],
        count: Number.MIN_SAFE_INTEGER
      };

      const result = extractPreviewData(input);

      expect(result.data[0].id).toBe(Number.MIN_SAFE_INTEGER);
      expect(result.rowCount).toBe(Number.MIN_SAFE_INTEGER);
    });

    it('should handle floating point edge cases', () => {
      const input = {
        data: [
          { value: Number.POSITIVE_INFINITY },
          { value: Number.NEGATIVE_INFINITY },
          { value: NaN },
          { value: 0.1 + 0.2 } // Floating point precision issue
        ],
        count: 4
      };

      const result = extractPreviewData(input);

      expect(result.data).toHaveLength(4);
      expect(result.data[0].value).toBe(Number.POSITIVE_INFINITY);
      expect(result.data[1].value).toBe(Number.NEGATIVE_INFINITY);
      expect(Number.isNaN(result.data[2].value)).toBe(true);
      expect(result.data[3].value).toBeCloseTo(0.3);
    });
  });

  describe('Unicode and Special Character Handling', () => {
    
    it('should handle unicode characters', () => {
      const unicodeData = [
        { name: '测试用户', emoji: '👨‍💻' },
        { name: 'Müller', special: 'café' },
        { name: 'عربي', rtl: 'شخص' }
      ];

      const result = extractPreviewData(unicodeData);

      expect(result.data).toHaveLength(3);
      expect(result.data[0].name).toBe('测试用户');
      expect(result.data[0].emoji).toBe('👨‍💻');
      expect(result.data[1].name).toBe('Müller');
      expect(result.data[2].name).toBe('عربي');
    });

    it('should handle special control characters', () => {
      const specialChars = [
        { data: 'line1\nline2' },
        { data: 'tab\tseparated' },
        { data: 'carriage\rreturn' },
        { data: 'null\0character' }
      ];

      const result = extractPreviewData(specialChars);

      expect(result.data).toHaveLength(4);
      expect(result.data[0].data).toContain('\n');
      expect(result.data[1].data).toContain('\t');
    });
  });

  describe('Date and Time Edge Cases', () => {
    
    it('should handle various date formats', () => {
      const dateData = [
        { date: new Date('2025-01-01') },
        { date: new Date('invalid') }, // Invalid date
        { date: new Date(0) }, // Unix epoch
        { timestamp: Date.now() }
      ];

      const result = extractPreviewData(dateData);

      expect(result.data).toHaveLength(4);
      expect(result.data[0].date).toBeInstanceOf(Date);
      expect(Number.isNaN((result.data[1] as any).date.getTime())).toBe(true);
      expect((result.data[2] as any).date.getTime()).toBe(0);
    });
  });
});