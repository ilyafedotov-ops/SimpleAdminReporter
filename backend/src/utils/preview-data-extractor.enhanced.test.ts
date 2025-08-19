/**
 * Enhanced Tests for Preview Data Extractor Utility
 * Additional test coverage for edge cases and advanced scenarios
 */

import { 
  extractPreviewData, 
  createPreviewResponse, 
  processPreviewData,
  isServiceResponse,
  isGraphApiResponse,
  extractRowCount,
} from './preview-data-extractor';
import type { DataSourceType, NormalizedPreviewData, RawServiceResponse } from '@/types/shared-types';

describe('Preview Data Extractor - Enhanced Coverage', () => {
  describe('Advanced Edge Cases', () => {
    it('should handle objects with zero count but existing data', () => {
      const testData = {
        data: [{ id: 1, name: 'Test' }],
        count: 0 // Inconsistent: has data but count says 0
      };

      const result = extractPreviewData(testData);

      expect(result.data).toEqual(testData.data);
      expect(result.rowCount).toBe(0); // Should trust the explicit count
      expect(result.metadata.originalFormat).toBe('query_result');
      expect(result.metadata.hasData).toBe(true); // Has data array
      expect(result.metadata.extractedDataLength).toBe(1);
      expect(result.metadata.debugInfo?.calculatedRowCount).toBe(0);
    });

    it('should handle objects with negative count', () => {
      const testData = {
        data: [{ id: 1 }, { id: 2 }],
        count: -5 // Invalid negative count
      };

      const result = extractPreviewData(testData);

      expect(result.data).toEqual(testData.data);
      expect(result.rowCount).toBe(-5); // Should preserve the original value even if invalid
      expect(result.metadata.originalFormat).toBe('query_result');
    });

    it('should handle Graph API response with zero @odata.count but existing value array', () => {
      const testData = {
        value: [{ id: 1, displayName: 'User 1' }],
        '@odata.count': 0 // Inconsistent: has value but count says 0
      };

      const result = extractPreviewData(testData);

      expect(result.data).toEqual(testData.value);
      expect(result.rowCount).toBe(0); // Should trust the explicit @odata.count
      expect(result.metadata.originalFormat).toBe('graph_api_value');
    });

    it('should handle objects with multiple count properties prioritizing count', () => {
      const testData = {
        data: [{ id: 1 }],
        count: 1,
        totalCount: 100,
        resultCount: 50,
        '@odata.count': 75,
        rowCount: 25
      };

      const result = extractPreviewData(testData);

      expect(result.rowCount).toBe(1); // Should use 'count' which has highest priority
    });

    it('should handle Graph API response with multiple count properties', () => {
      const testData = {
        value: [{ id: 1 }, { id: 2 }],
        totalCount: 100,
        resultCount: 50,
        '@odata.count': 75
      };

      const result = extractPreviewData(testData);

      expect(result.rowCount).toBe(75); // Should use '@odata.count' for Graph API
      expect(result.metadata.originalFormat).toBe('graph_api_value');
    });

    it('should handle processed testData with priority over rowCount', () => {
      const testData = {
        testData: [{ id: 1 }, { id: 2 }, { id: 3 }],
        rowCount: 10, // Higher than actual data length
        count: 5 // Should be ignored in processed format
      };

      const result = extractPreviewData(testData);

      expect(result.data).toEqual(testData.testData);
      expect(result.rowCount).toBe(10); // Should use provided rowCount
      expect(result.metadata.originalFormat).toBe('processed_test_data');
    });

    it('should handle object with null value property but other properties', () => {
      const testData = {
        value: null,
        data: [{ id: 1 }],
        count: 1
      };

      const result = extractPreviewData(testData);

      expect(result.data).toEqual(testData.data); // Should fallback to data property
      expect(result.rowCount).toBe(1);
      expect(result.metadata.originalFormat).toBe('query_result');
    });

    it('should handle object with empty string value property', () => {
      const testData = {
        value: '',
        data: [{ id: 1 }],
        count: 1
      };

      const result = extractPreviewData(testData);

      expect(result.data).toEqual(testData.data); // Should fallback to data property
      expect(result.rowCount).toBe(1);
      expect(result.metadata.originalFormat).toBe('query_result');
    });

    it('should handle numeric primitive responses', () => {
      const testData = 42;

      const result = extractPreviewData(testData);

      expect(result.data).toEqual([42]);
      expect(result.rowCount).toBe(1);
      expect(result.metadata.originalFormat).toBe('primitive_response');
      expect(result.metadata.isArray).toBe(false);
    });

    it('should handle boolean primitive responses', () => {
      const testData = true;

      const result = extractPreviewData(testData);

      expect(result.data).toEqual([true]);
      expect(result.rowCount).toBe(1);
      expect(result.metadata.originalFormat).toBe('primitive_response');
    });

    it('should handle zero as primitive response', () => {
      const testData = 0;

      const result = extractPreviewData(testData);

      expect(result.data).toEqual([]); // 0 is falsy, so empty array
      expect(result.rowCount).toBe(0);
      expect(result.metadata.originalFormat).toBe('primitive_response');
    });

    it('should handle false as primitive response', () => {
      const testData = false;

      const result = extractPreviewData(testData);

      expect(result.data).toEqual([]); // false is falsy, so empty array
      expect(result.rowCount).toBe(0);
      expect(result.metadata.originalFormat).toBe('primitive_response');
    });

    it('should handle empty string as primitive response', () => {
      const testData = '';

      const result = extractPreviewData(testData);

      expect(result.data).toEqual([]); // empty string is falsy, so empty array
      expect(result.rowCount).toBe(0);
      expect(result.metadata.originalFormat).toBe('primitive_response');
    });
  });

  describe('Type Guard Functions - Enhanced Coverage', () => {
    it('should identify RawServiceResponse with only count property', () => {
      expect(isServiceResponse({ count: 5 })).toBe(true);
      expect(isServiceResponse({ totalCount: 10 })).toBe(false); // totalCount is not in the type guard
      expect(isServiceResponse({ resultCount: 15 })).toBe(false); // resultCount is not in the type guard
      expect(isServiceResponse({ rowCount: 20 })).toBe(false); // rowCount is not in the type guard
    });

    it('should reject non-objects for RawServiceResponse', () => {
      expect(isServiceResponse('string')).toBe(false);
      expect(isServiceResponse(123)).toBe(false);
      expect(isServiceResponse(true)).toBe(false);
      expect(isServiceResponse([])).toBe(false);
    });

    it('should identify GraphApiResponse with only @odata.count', () => {
      expect(isGraphApiResponse({ '@odata.count': 5 })).toBe(true);
      expect(isGraphApiResponse({ '@odata.nextLink': 'url' })).toBe(false);
    });

    it('should handle objects with circular references safely', () => {
      const circularObj: any = { data: [] };
      circularObj.self = circularObj;

      expect(() => isServiceResponse(circularObj)).not.toThrow();
      expect(isServiceResponse(circularObj)).toBe(true);
    });
  });

  describe('Extract Row Count - Enhanced Coverage', () => {
    it('should handle objects with all count properties present', () => {
      const response = 
      {
        count: 5,
        totalCount: 10,
        resultCount: 15,
        '@odata.count': 20,
        rowCount: 25,
        data: [1, 2, 3],
        value: [1, 2],
        testData: [1]
      };

      expect(extractRowCount(response)).toBe(5); // count has highest priority
    });

    it('should fallback through count properties correctly', () => {
      // Test with only totalCount
      expect(extractRowCount({ totalCount: 10, data: [1, 2] })).toBe(10);
      
      // Test with only resultCount
      expect(extractRowCount({ resultCount: 15, data: [1, 2] })).toBe(15);
      
      // Test with only @odata.count
      expect(extractRowCount({ '@odata.count': 20, data: [1, 2] })).toBe(20);
      
      // Test with only rowCount
      expect(extractRowCount({ rowCount: 25, data: [1, 2] })).toBe(25);
    });

    it('should handle objects with only array properties', () => {
      expect(extractRowCount({ data: [1, 2, 3] })).toBe(3);
      expect(extractRowCount({ value: [1, 2] })).toBe(2);
      expect(extractRowCount({ testData: [1] })).toBe(1);
    });

    it('should handle objects with no relevant properties', () => {
      expect(extractRowCount({ randomProperty: 'value' })).toBe(1); // single object
      expect(extractRowCount({})).toBe(1); // empty object counts as 1
    });

    it('should handle primitive values correctly', () => {
      expect(extractRowCount(42)).toBe(1);
      expect(extractRowCount('string')).toBe(1);
      expect(extractRowCount(true)).toBe(1);
      expect(extractRowCount(false)).toBe(0); // false is falsy
      expect(extractRowCount(0)).toBe(0); // 0 is falsy
    });

    it('should handle null and undefined correctly', () => {
      expect(extractRowCount(null)).toBe(0);
      expect(extractRowCount(undefined)).toBe(0);
    });
  });

  describe('Response Creation - Enhanced Coverage', () => {
    it('should handle very large execution times', () => {
      const extractedData: NormalizedPreviewData = {
        data: [{ id: 1 }],
        rowCount: 1,
        metadata: {
          isArray: false,
          hasData: true,
          originalFormat: 'query_result',
          extractedDataLength: 1,
          debugInfo: { calculatedRowCount: 1 }
        }
      };

      const response = 
      createPreviewResponse('ad', 999999, extractedData);

      expect(response.data.executionTime).toBe(999999);
      expect(response.success).toBe(true);
    });

    it('should handle zero execution time', () => {
      const extractedData: NormalizedPreviewData = {
        data: [],
        rowCount: 0,
        metadata: {
          isArray: true,
          hasData: false,
          originalFormat: 'direct_array',
          extractedDataLength: 0,
          debugInfo: { calculatedRowCount: 0 }
        }
      };

      const response = 
      createPreviewResponse('azure', 0, extractedData);

      expect(response.data.executionTime).toBe(0);
      expect(response.data.rowCount).toBe(0);
      expect(response.data.testData).toEqual([]);
    });

    it('should handle negative execution time (edge case)', () => {
      const extractedData: NormalizedPreviewData = {
        data: [{ id: 1 }],
        rowCount: 1,
        metadata: {
          isArray: false,
          hasData: true,
          originalFormat: 'single_object',
          extractedDataLength: 1,
          debugInfo: { calculatedRowCount: 1 }
        }
      };

      const response = 
      createPreviewResponse('o365', -100, extractedData);

      expect(response.data.executionTime).toBe(-100);
      expect(response.success).toBe(true);
    });
  });

  describe('Complex Nested Objects', () => {
    it('should handle deeply nested structures without crashing', () => {
      const deeplyNested = {
        level1: {
          level2: {
            level3: {
              level4: {
                level5: {
                  data: [{ id: 1, name: 'deep' }]
                }
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

    it('should handle objects with function properties', () => {
      const objectWithFunction = {
        data: [{ id: 1 }],
        count: 1,
        someFunction: () => 'test',
        toString: () => 'custom toString'
      };

      const result = extractPreviewData(objectWithFunction);

      expect(result.data).toEqual(objectWithFunction.data);
      expect(result.rowCount).toBe(1);
      expect(result.metadata.originalFormat).toBe('query_result');
    });

    it('should handle objects with symbol properties', () => {
      const sym = Symbol('test');
      const objectWithSymbol = {
        data: [{ id: 1 }],
        count: 1,
        [sym]: 'symbol value'
      };

      const result = extractPreviewData(objectWithSymbol);

      expect(result.data).toEqual(objectWithSymbol.data);
      expect(result.rowCount).toBe(1);
      expect(result.metadata.originalFormat).toBe('query_result');
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle objects with getter properties that throw', () => {
      const objectWithThrowingGetter = {
        data: [{ id: 1 }],
        count: 1,
        get throwingProperty() {
          throw new Error('Property access failed');
        }
      };

      // Should not throw and should process normally
      expect(() => extractPreviewData(objectWithThrowingGetter)).not.toThrow();
      
      const result = extractPreviewData(objectWithThrowingGetter);
      expect(result.data).toEqual(objectWithThrowingGetter.data);
      expect(result.rowCount).toBe(1);
    });

    it('should handle Date objects as data', () => {
      const dateObj = new Date('2023-01-01T10:00:00Z');
      
      const result = extractPreviewData(dateObj);

      expect(result.data).toEqual([dateObj]);
      expect(result.rowCount).toBe(1);
      expect(result.metadata.originalFormat).toBe('single_object');
    });

    it('should handle RegExp objects as data', () => {
      const regexObj = /test-pattern/gi;
      
      const result = extractPreviewData(regexObj);

      expect(result.data).toEqual([regexObj]);
      expect(result.rowCount).toBe(1);
      expect(result.metadata.originalFormat).toBe('single_object');
    });

    it('should handle Error objects as data', () => {
      const errorObj = new Error('Test error message');
      
      const result = extractPreviewData(errorObj);

      expect(result.data).toEqual([errorObj]);
      expect(result.rowCount).toBe(1);
      expect(result.metadata.originalFormat).toBe('single_object');
    });
  });

  describe('Performance Edge Cases', () => {
    it('should handle extremely large arrays efficiently', () => {
      // Create a very large array
      const largeArray = Array.from({ length: 100000 }, (_, i) => ({ id: i, value: `item-${i}` }));
      
      const startTime = Date.now();
      const result = extractPreviewData(largeArray);
      const processingTime = Date.now() - startTime;

      expect(result.data).toBe(largeArray); // Should be same reference, not copied
      expect(result.rowCount).toBe(100000);
      expect(result.metadata.originalFormat).toBe('direct_array');
      expect(processingTime).toBeLessThan(1000); // Should process very quickly
    });

    it('should handle objects with many properties efficiently', () => {
      // Create object with many properties
      const objectWithManyProps: any = {
        data: [{ id: 1 }],
        count: 1
      };
      
      // Add 1000 additional properties
      for (let i = 0; i < 1000; i++) {
        objectWithManyProps[`prop${i}`] = `value${i}`;
      }

      const startTime = Date.now();
      const result = extractPreviewData(objectWithManyProps);
      const processingTime = Date.now() - startTime;

      expect(result.data).toEqual(objectWithManyProps.data);
      expect(result.rowCount).toBe(1);
      expect(processingTime).toBeLessThan(100); // Should be fast even with many properties
    });
  });

  describe('Integration with processPreviewData', () => {
    it('should handle end-to-end processing with all edge cases', () => {
      const testCases = [
        { data: null, source: 'ad', time: 100 },
        { data: [], source: 'azure', time: 200 },
        { data: [1, 2, 3], source: 'o365', time: 300 },
        { data: { value: [{ id: 1 }], '@odata.count': 1 }, source: 'azure', time: 150 },
        { data: { data: [], count: 0 }, source: 'ad', time: 50 },
        { data: 'simple string', source: 'o365', time: 75 }
      ];

      testCases.forEach(({ data, source, time }) => {
        const response = 
      processPreviewData(data, source as DataSourceType, time);
        
        expect(response).toHaveProperty('success', true);
        expect(response).toHaveProperty('data');
        expect(response.data).toHaveProperty('source', source);
        expect(response.data).toHaveProperty('executionTime', time);
        expect(response.data).toHaveProperty('testData');
        expect(response.data).toHaveProperty('rowCount');
        expect(response.data).toHaveProperty('isTestRun', true);
      });
    });
  });
});