/**
 * Tests for Preview Data Extractor Utility
 * Comprehensive test suite covering all response format scenarios
 */

import { 
  extractPreviewData, 
  createPreviewResponse, 
  processPreviewData,
  isServiceResponse,
  isGraphApiResponse,
  extractRowCount
} from './preview-data-extractor';
import type { DataSourceType } from '@/types/shared-types';

describe('Preview Data Extractor', () => {
  describe('extractPreviewData', () => {
    it('should handle direct array responses', () => {
      const testData = [
        { id: 1, name: 'User 1' },
        { id: 2, name: 'User 2' }
      ];

      const result = extractPreviewData(testData);

      expect(result.data).toEqual(testData);
      expect(result.rowCount).toBe(2);
      expect(result.metadata.originalFormat).toBe('direct_array');
      expect(result.metadata.isArray).toBe(true);
      expect(result.metadata.hasData).toBe(true);
    });

    it('should handle QueryResult objects with data and count', () => {
      const testData = {
        data: [
          { id: 1, name: 'User 1' },
          { id: 2, name: 'User 2' }
        ],
        count: 2,
        totalCount: 100
      };

      const result = extractPreviewData(testData);

      expect(result.data).toEqual(testData.data);
      expect(result.rowCount).toBe(2); // Should use count, not totalCount
      expect(result.metadata.originalFormat).toBe('query_result');
      expect(result.metadata.isArray).toBe(false);
      expect(result.metadata.hasData).toBe(true);
    });

    it('should handle Graph API responses with value property', () => {
      const testData = {
        value: [
          { id: 1, displayName: 'User 1' },
          { id: 2, displayName: 'User 2' }
        ],
        '@odata.count': 50
      };

      const result = extractPreviewData(testData);

      expect(result.data).toEqual(testData.value);
      expect(result.rowCount).toBe(50); // Should use @odata.count
      expect(result.metadata.originalFormat).toBe('graph_api_value');
    });

    it('should handle already processed testData format', () => {
      const testData = {
        testData: [
          { id: 1, name: 'User 1' }
        ],
        rowCount: 1
      };

      const result = extractPreviewData(testData);

      expect(result.data).toEqual(testData.testData);
      expect(result.rowCount).toBe(1);
      expect(result.metadata.originalFormat).toBe('processed_test_data');
    });

    it('should handle single object responses', () => {
      const testData = { id: 1, name: 'Single User' };

      const result = extractPreviewData(testData);

      expect(result.data).toEqual([testData]);
      expect(result.rowCount).toBe(1);
      expect(result.metadata.originalFormat).toBe('single_object');
    });

    it('should handle null responses', () => {
      const result = extractPreviewData(null);

      expect(result.data).toEqual([]);
      expect(result.rowCount).toBe(0);
      expect(result.metadata.originalFormat).toBe('null_response');
    });

    it('should handle primitive responses', () => {
      const result = extractPreviewData('simple string');

      expect(result.data).toEqual(['simple string']);
      expect(result.rowCount).toBe(1);
      expect(result.metadata.originalFormat).toBe('primitive_response');
    });

    it('should prefer count over totalCount and resultCount', () => {
      const testData = {
        data: [{ id: 1 }],
        count: 5,
        totalCount: 10,
        resultCount: 15
      };

      const result = extractPreviewData(testData);

      expect(result.rowCount).toBe(5); // Should use count
    });

    it('should fallback to array length when no count provided', () => {
      const testData = {
        data: [
          { id: 1 },
          { id: 2 },
          { id: 3 }
        ]
      };

      const result = extractPreviewData(testData);

      expect(result.rowCount).toBe(3); // Should use array length
    });
  });

  describe('createPreviewResponse', () => {
    it('should create properly formatted API response', () => {
      const extractedData = {
        data: [{ id: 1, name: 'User 1' }],
        rowCount: 1,
        metadata: {
          isArray: true,
          hasData: true,
          originalFormat: 'direct_array',
          extractedDataLength: 1,
          debugInfo: { calculatedRowCount: 1 }
        }
      };

      const response = createPreviewResponse('ad', 150, extractedData);

      expect(response.success).toBe(true);
      expect(response.data.source).toBe('ad');
      expect(response.data.executionTime).toBe(150);
      expect(response.data.testData).toEqual([{ id: 1, name: 'User 1' }]);
      expect(response.data.rowCount).toBe(1);
      expect(response.data.isTestRun).toBe(true);
      expect(response.data.metadata).toBeDefined();
    });
  });

  describe('processPreviewData', () => {
    it('should combine extraction and response formatting', () => {
      const testData = [
        { id: 1, name: 'User 1' },
        { id: 2, name: 'User 2' }
      ];

      const response = processPreviewData(testData, 'azure' as DataSourceType, 250);

      expect(response.success).toBe(true);
      expect(response.data.source).toBe('azure');
      expect(response.data.executionTime).toBe(250);
      expect(response.data.testData).toEqual(testData);
      expect(response.data.rowCount).toBe(2);
      expect(response.data.isTestRun).toBe(true);
    });
  });

  describe('isServiceResponse', () => {
    it('should identify service responses correctly', () => {
      expect(isServiceResponse({ data: [] })).toBe(true);
      expect(isServiceResponse({ value: [] })).toBe(true);
      expect(isServiceResponse({ testData: [] })).toBe(true);
      expect(isServiceResponse({ count: 5 })).toBe(true);
      expect(isServiceResponse([])).toBe(false);
      expect(isServiceResponse('string')).toBe(false);
      expect(isServiceResponse(null)).toBe(false);
    });
  });

  describe('isGraphApiResponse', () => {
    it('should identify Graph API responses correctly', () => {
      expect(isGraphApiResponse({ value: [] })).toBe(true);
      expect(isGraphApiResponse({ '@odata.count': 5 })).toBe(true);
      expect(isGraphApiResponse({ data: [] })).toBe(false);
      expect(isGraphApiResponse([])).toBe(false);
    });
  });

  describe('extractRowCount', () => {
    it('should extract count from various response formats', () => {
      expect(extractRowCount([1, 2, 3])).toBe(3);
      expect(extractRowCount({ count: 5 })).toBe(5);
      expect(extractRowCount({ totalCount: 10 })).toBe(10);
      expect(extractRowCount({ '@odata.count': 15 })).toBe(15);
      expect(extractRowCount({ data: [1, 2] })).toBe(2);
      expect(extractRowCount({ value: [1, 2, 3] })).toBe(3);
      expect(extractRowCount({ testData: [1] })).toBe(1);
      expect(extractRowCount({ id: 1 })).toBe(1);
      expect(extractRowCount(null)).toBe(0);
      expect(extractRowCount('test')).toBe(1);
    });

    it('should prioritize count properties correctly', () => {
      const response = {
        count: 5,
        totalCount: 10,
        resultCount: 15,
        '@odata.count': 20,
        data: [1, 2, 3]
      };

      expect(extractRowCount(response)).toBe(5); // count has highest priority
    });
  });

  describe('Edge cases', () => {
    it('should handle empty arrays', () => {
      const result = extractPreviewData([]);
      
      expect(result.data).toEqual([]);
      expect(result.rowCount).toBe(0);
      expect(result.metadata.hasData).toBe(false);
    });

    it('should handle objects with empty data arrays', () => {
      const testData = {
        data: [],
        count: 0
      };

      const result = extractPreviewData(testData);

      expect(result.data).toEqual([]);
      expect(result.rowCount).toBe(0);
      expect(result.metadata.hasData).toBe(false);
    });

    it('should handle undefined values', () => {
      const result = extractPreviewData(undefined);

      expect(result.data).toEqual([]);
      expect(result.rowCount).toBe(0);
      expect(result.metadata.originalFormat).toBe('null_response');
    });

    it('should handle objects with null data property', () => {
      const testData = {
        data: null,
        count: 5
      };

      const result = extractPreviewData(testData);

      expect(result.data).toEqual([testData]);
      expect(result.rowCount).toBe(1);
      expect(result.metadata.originalFormat).toBe('single_object');
    });

    it('should handle complex nested objects', () => {
      const testData = {
        metadata: { total: 100 },
        results: [{ id: 1 }],
        pagination: { page: 1, size: 10 }
      };

      const result = extractPreviewData(testData);

      expect(result.data).toEqual([testData]);
      expect(result.rowCount).toBe(1);
      expect(result.metadata.originalFormat).toBe('single_object');
    });
  });

  describe('Response format compatibility', () => {
    it('should maintain backward compatibility with existing API format', () => {
      const testData = [
        { sAMAccountName: 'user1', displayName: 'User One' },
        { sAMAccountName: 'user2', displayName: 'User Two' }
      ];

      const response = processPreviewData(testData, 'ad' as DataSourceType, 123);

      // Check that the response has the exact structure expected by frontend
      expect(response).toHaveProperty('success', true);
      expect(response).toHaveProperty('data');
      expect(response.data).toHaveProperty('source', 'ad');
      expect(response.data).toHaveProperty('executionTime', 123);
      expect(response.data).toHaveProperty('testData', testData);
      expect(response.data).toHaveProperty('rowCount', 2);
      expect(response.data).toHaveProperty('isTestRun', true);
    });

    it('should handle all supported source types', () => {
      const testData = [{ id: 1 }];
      
      (['ad', 'azure', 'o365'] as DataSourceType[]).forEach(source => {
        const response = processPreviewData(testData, source, 100);
        expect(response.data.source).toBe(source);
      });
    });
  });
});