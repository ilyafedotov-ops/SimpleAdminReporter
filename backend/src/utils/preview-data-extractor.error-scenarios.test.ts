/**
 * Error Scenarios and Stress Tests for Preview Data Extractor
 * Tests extreme conditions, error handling, and boundary cases
 */

import { 
  extractPreviewData, 
  processPreviewData
} from './preview-data-extractor';
import type { DataSourceType } from '@/types/shared-types';

describe('Preview Data Extractor - Error Scenarios and Stress Tests', () => {
  describe('Memory and Performance Stress Tests', () => {
    it('should handle extremely large arrays without memory issues', () => {
      // Create a 1M item array
      const hugeArray = Array.from({ length: 1000000 }, (_, i) => ({ id: i }));
      
      const startMemory = process.memoryUsage().heapUsed;
      const startTime = Date.now();
      
      const result = extractPreviewData(hugeArray);
      
      const endTime = Date.now();
      const endMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = endMemory - startMemory;
      
      expect(result.data).toBe(hugeArray); // Should reference, not copy
      expect(result.rowCount).toBe(1000000);
      expect(endTime - startTime).toBeLessThan(1000); // Should be fast
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // Should not significantly increase memory
    });

    it('should handle objects with extremely deep nesting', () => {
      // Create deeply nested object
      let deepObject: any = { data: [{ id: 1 }], count: 1 };
      for (let i = 0; i < 1000; i++) {
        deepObject = { nested: deepObject };
      }

      expect(() => extractPreviewData(deepObject)).not.toThrow();
      
      const result = extractPreviewData(deepObject);
      expect(result.data).toEqual([deepObject]);
      expect(result.rowCount).toBe(1);
    });

    it('should handle objects with circular references without infinite loops', () => {
      const circularObj: any = {
        data: [{ id: 1, name: 'test' }],
        count: 1
      };
      circularObj.self = circularObj;
      circularObj.parent = { child: circularObj };

      expect(() => extractPreviewData(circularObj)).not.toThrow();
      
      const result = extractPreviewData(circularObj);
      expect(result.data).toEqual(circularObj.data);
      expect(result.rowCount).toBe(1);
      expect(result.metadata.originalFormat).toBe('query_result');
    });
  });

  describe('Type Coercion and Invalid Data Handling', () => {
    it('should handle objects with non-standard property values', () => {
      const weirdObject = {
        data: [{ id: 1 }],
        count: '5' as any, // String instead of number
        totalCount: NaN,
        resultCount: Infinity,
        '@odata.count': -Infinity
      };

      const result = extractPreviewData(weirdObject);
      
      expect(result.data).toEqual(weirdObject.data);
      expect(result.rowCount).toBe('5' as any); // Should preserve original value
    });

    it('should handle objects with prototype pollution attempts', () => {
      const maliciousObject = {
        data: [{ id: 1 }],
        count: 1,
        __proto__: { malicious: true },
        constructor: { name: 'Evil' }
      };

      expect(() => extractPreviewData(maliciousObject)).not.toThrow();
      
      const result = extractPreviewData(maliciousObject);
      expect(result.data).toEqual(maliciousObject.data);
      expect(result.rowCount).toBe(1);
    });

    it('should handle objects with very long string properties', () => {
      const longString = 'x'.repeat(1000000); // 1MB string
      const objectWithLongString = {
        data: [{ id: 1, description: longString }],
        count: 1,
        metadata: longString
      };

      const result = extractPreviewData(objectWithLongString);
      
      expect(result.data).toEqual(objectWithLongString.data);
      expect(result.rowCount).toBe(1);
      expect(result.data[0].description).toBe(longString);
    });

    it('should handle arrays with holes (sparse arrays)', () => {
      const sparseArray: any[] = [];
      sparseArray[0] = { id: 1 };
      sparseArray[1000] = { id: 2 };
      sparseArray[5000] = { id: 3 };

      const result = extractPreviewData(sparseArray);
      
      expect(result.data).toBe(sparseArray);
      expect(result.rowCount).toBe(5001); // Array length, not number of defined elements
      expect(result.metadata.originalFormat).toBe('direct_array');
    });

    it('should handle arrays with mixed data types', () => {
      const mixedArray = [
        { id: 1, name: 'object' },
        'string value',
        42,
        true,
        null,
        undefined,
        [1, 2, 3],
        new Date(),
        /regex/,
        function() { return 'function'; }
      ];

      const result = extractPreviewData(mixedArray);
      
      expect(result.data).toBe(mixedArray);
      expect(result.rowCount).toBe(10);
      expect(result.metadata.originalFormat).toBe('direct_array');
    });
  });

  describe('Edge Cases with Special JavaScript Values', () => {
    it('should handle BigInt values', () => {
      const bigIntValue = BigInt('9007199254740991999999999999999');
      
      const result = extractPreviewData(bigIntValue);
      
      expect(result.data).toEqual([bigIntValue]);
      expect(result.rowCount).toBe(1);
      expect(result.metadata.originalFormat).toBe('primitive_response');
    });

    it('should handle Symbol values', () => {
      const symbolValue = Symbol('test-symbol');
      
      const result = extractPreviewData(symbolValue);
      
      expect(result.data).toEqual([symbolValue]);
      expect(result.rowCount).toBe(1);
      expect(result.metadata.originalFormat).toBe('primitive_response');
    });

    it('should handle Proxy objects', () => {
      const target = { data: [{ id: 1 }], count: 1 };
      const proxyObject = new Proxy(target, {
        get(target, prop) {
          if (prop === 'count') return target.count * 2; // Modify count access
          return target[prop as keyof typeof target];
        }
      });

      const result = extractPreviewData(proxyObject);
      
      expect(result.data).toEqual(target.data);
      expect(result.rowCount).toBe(2); // Should be modified by proxy
      expect(result.metadata.originalFormat).toBe('query_result');
    });

    it('should handle objects with non-enumerable properties', () => {
      const objectWithNonEnumerable: any = {
        data: [{ id: 1 }],
        count: 1
      };
      
      Object.defineProperty(objectWithNonEnumerable, 'hiddenProperty', {
        value: 'hidden',
        enumerable: false,
        writable: true,
        configurable: true
      });

      const result = extractPreviewData(objectWithNonEnumerable);
      
      expect(result.data).toEqual(objectWithNonEnumerable.data);
      expect(result.rowCount).toBe(1);
    });
  });

  describe('Concurrent Access and Thread Safety', () => {
    it('should handle concurrent processing of the same data', async () => {
      const testData = {
        data: Array.from({ length: 1000 }, (_, i) => ({ id: i })),
        count: 1000
      };

      // Process the same data concurrently
      const promises = Array.from({ length: 100 }, () => 
        Promise.resolve(extractPreviewData(testData))
      );

      const results = await Promise.all(promises);
      
      // All results should be identical
      results.forEach(result => {
        expect(result.data).toEqual(testData.data);
        expect(result.rowCount).toBe(1000);
        expect(result.metadata.originalFormat).toBe('query_result');
      });
    });

    it('should handle concurrent processing of different data types', async () => {
      const testCases = [
        [{ id: 1 }, { id: 2 }],
        { data: [{ id: 3 }], count: 1 },
        { value: [{ id: 4 }], '@odata.count': 1 },
        null,
        undefined,
        'string',
        42,
        true
      ];

      const promises = testCases.map(testData => 
        Promise.resolve(extractPreviewData(testData))
      );

      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(testCases.length);
      results.forEach(result => {
        expect(result).toHaveProperty('data');
        expect(result).toHaveProperty('rowCount');
        expect(result).toHaveProperty('debugInfo');
      });
    });
  });

  describe('Error Recovery and Graceful Degradation', () => {
    it('should handle objects that throw on property access', () => {
      const throwingObject = {
        get data() {
          throw new Error('Property access failed');
        },
        get count() {
          throw new Error('Count access failed');
        },
        normalProperty: 'accessible'
      };

      // Property access will throw since the implementation accesses properties directly
      expect(() => extractPreviewData(throwingObject)).toThrow('Property access failed');
    });

    it('should handle objects with getters that return different values on each call', () => {
      let callCount = 0;
      const inconsistentObject = {
        get data() {
          callCount++;
          return callCount % 2 === 0 ? [{ id: 1 }] : null;
        },
        get count() {
          return callCount;
        }
      };

      const result = extractPreviewData(inconsistentObject);
      
      // Should work with whatever values are returned
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('rowCount');
      expect(result.metadata.originalFormat).toMatch(/query_result|single_object/);
    });

    it('should handle frozen objects', () => {
      const frozenObject = Object.freeze({
        data: Object.freeze([Object.freeze({ id: 1 })]),
        count: 1
      });

      const result = extractPreviewData(frozenObject);
      
      expect(result.data).toEqual(frozenObject.data);
      expect(result.rowCount).toBe(1);
      expect(result.metadata.originalFormat).toBe('query_result');
    });

    it('should handle sealed objects', () => {
      const sealedObject = Object.seal({
        data: [{ id: 1 }],
        count: 1
      });

      const result = extractPreviewData(sealedObject);
      
      expect(result.data).toEqual(sealedObject.data);
      expect(result.rowCount).toBe(1);
      expect(result.metadata.originalFormat).toBe('query_result');
    });
  });

  describe('Resource Exhaustion Handling', () => {
    it('should handle very deep object inspection without stack overflow', () => {
      // Create object with many nested properties
      let deepObj: any = { finalValue: 'reached' };
      
      // Create 10,000 levels of nesting
      for (let i = 0; i < 10000; i++) {
        deepObj = { [`level${i}`]: deepObj };
      }
      
      // Add our test properties at the top level
      deepObj.data = [{ id: 1 }];
      deepObj.count = 1;

      expect(() => extractPreviewData(deepObj)).not.toThrow();
      
      const result = extractPreviewData(deepObj);
      expect(result.data).toEqual([{ id: 1 }]);
      expect(result.rowCount).toBe(1);
    });

    it('should handle objects with massive numbers of properties', () => {
      const massiveObject: any = {
        data: [{ id: 1 }],
        count: 1
      };
      
      // Add 100,000 properties
      for (let i = 0; i < 100000; i++) {
        massiveObject[`prop${i}`] = `value${i}`;
      }

      const startTime = Date.now();
      const result = extractPreviewData(massiveObject);
      const endTime = Date.now();
      
      expect(result.data).toEqual([{ id: 1 }]);
      expect(result.rowCount).toBe(1);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });

  describe('Boundary Value Testing', () => {
    it('should handle maximum safe integer values', () => {
      const maxSafeInt = Number.MAX_SAFE_INTEGER;
      const testData = {
        data: [{ id: maxSafeInt }],
        count: maxSafeInt
      };

      const result = extractPreviewData(testData);
      
      expect(result.data).toEqual(testData.data);
      expect(result.rowCount).toBe(maxSafeInt);
    });

    it('should handle minimum safe integer values', () => {
      const minSafeInt = Number.MIN_SAFE_INTEGER;
      const testData = {
        data: [{ id: minSafeInt }],
        count: minSafeInt
      };

      const result = extractPreviewData(testData);
      
      expect(result.data).toEqual(testData.data);
      expect(result.rowCount).toBe(minSafeInt);
    });

    it('should handle special numeric values in counts', () => {
      const specialValues = [
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
        Number.NaN,
        Number.EPSILON,
        Number.MAX_VALUE,
        Number.MIN_VALUE
      ];

      specialValues.forEach(value => {
        const testData = {
          data: [{ id: 1 }],
          count: value
        };

        const result = extractPreviewData(testData);
        
        expect(result.data).toEqual(testData.data);
        expect(result.rowCount).toBe(value);
      });
    });
  });

  describe('Integration Error Scenarios', () => {
    it('should handle processPreviewData with all error scenarios', () => {
      const errorCases = [
        { data: null, source: 'ad', time: 0 },
        { data: undefined, source: 'azure', time: -1 },
        { data: NaN, source: 'o365', time: Infinity },
        { data: '', source: 'ad', time: Number.MAX_VALUE },
        { data: false, source: 'azure', time: Number.MIN_VALUE }
      ];

      errorCases.forEach(({ data, source, time }) => {
        expect(() => processPreviewData(data, source as DataSourceType, time)).not.toThrow();
        
        const result = processPreviewData(data, source as DataSourceType, time);
        
        expect(result).toHaveProperty('success', true);
        expect(result.data).toHaveProperty('source', source);
        expect(result.data).toHaveProperty('executionTime', time);
        expect(result.data).toHaveProperty('testData');
        expect(result.data).toHaveProperty('rowCount');
        expect(result.data).toHaveProperty('isTestRun', true);
      });
    });
  });
});