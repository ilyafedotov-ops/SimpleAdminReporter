/**
 * Preview Data Extractor Utility
 * Handles extraction and normalization of test data from various service response formats
 * Extracted from reports controller to eliminate duplication and improve maintainability
 */

import { logger } from './logger';
import type {
  PreviewResponse,
  PreviewMetadata,
  RawServiceResponse,
  NormalizedPreviewData,
  DataSourceType
} from '@/types/shared-types';

// Legacy interfaces maintained for backward compatibility
// TODO: Remove these after all consumers are migrated to shared-types

/**
 * @deprecated Use RawServiceResponse from shared-types instead
 */
export interface ServiceResponse extends RawServiceResponse {}

/**
 * @deprecated Use PreviewResponse from shared-types instead
 */
export interface LegacyPreviewResponse {
  success: boolean;
  data: {
    source: string;
    executionTime: number;
    testData: unknown[];
    rowCount: number;
    isTestRun: boolean;
  };
}

/**
 * Extract and normalize test data from various service response formats
 * 
 * This function handles multiple response patterns:
 * - Direct array responses (AD/LDAP services)
 * - QueryResult objects with data/count properties (database queries)
 * - Graph API responses with value property
 * - Already processed testData objects
 * - Primitive or null responses
 * 
 * @param rawData Raw response from service layer
 * @returns Normalized data structure with metadata
 */
export function extractPreviewData<T = Record<string, unknown>>(
  rawData: unknown
): NormalizedPreviewData<T> {
  let responseData: T[] = [];
  let rowCount = 0;
  let originalFormat = 'unknown';

  logger.debug('Starting preview data extraction:', {
    rawDataType: typeof rawData,
    isArray: Array.isArray(rawData),
    isNull: rawData === null,
    isUndefined: rawData === undefined,
    hasKeys: rawData && typeof rawData === 'object' ? Object.keys(rawData).slice(0, 10) : [] // Limit keys for logging
  });

  if (Array.isArray(rawData)) {
    // Direct array response (most common for AD/LDAP services)
    originalFormat = 'direct_array';
    responseData = rawData as T[];
    rowCount = rawData.length;
    
    logger.debug('Extracted direct array response:', {
      arrayLength: rawData.length
    });
    
  } else if (rawData && typeof rawData === 'object') {
    // Object response - need to determine the format
    const serviceResponse = rawData as RawServiceResponse;
    
    if (Array.isArray(serviceResponse.value)) {
      // Microsoft Graph API format with 'value' property
      originalFormat = 'graph_api_value';
      responseData = serviceResponse.value as T[];
      rowCount = serviceResponse['@odata.count'] ?? 
                 serviceResponse.totalCount ?? 
                 serviceResponse.resultCount ?? 
                 responseData.length;
      
      logger.debug('Extracted Graph API value response:', {
        valueLength: serviceResponse.value.length,
        odataCount: serviceResponse['@odata.count'],
        calculatedRowCount: rowCount
      });
      
    } else if (Array.isArray(serviceResponse.data)) {
      // QueryResult object format (has data and count properties)
      originalFormat = 'query_result';
      responseData = serviceResponse.data as T[];
      rowCount = serviceResponse.count ?? 
                 serviceResponse.totalCount ?? 
                 serviceResponse.resultCount ?? 
                 responseData.length;
      
      logger.debug('Extracted QueryResult response:', {
        dataLength: serviceResponse.data.length,
        providedCount: serviceResponse.count,
        calculatedRowCount: rowCount
      });
      
    } else if (serviceResponse.testData && Array.isArray(serviceResponse.testData)) {
      // Already processed testData format (recursive call or cached response)
      originalFormat = 'processed_test_data';
      responseData = serviceResponse.testData as T[];
      rowCount = serviceResponse.rowCount ?? responseData.length;
      
      logger.debug('Extracted processed testData response:', {
        testDataLength: serviceResponse.testData.length,
        providedRowCount: serviceResponse.rowCount
      });
      
    } else {
      // Fallback: treat the whole object as data (single record response)
      originalFormat = 'single_object';
      responseData = [rawData as T];
      rowCount = 1;
      
      logger.debug('Treated single object as data:', {
        objectKeys: Object.keys(rawData).slice(0, 10) // Limit for logging
      });
    }
    
  } else {
    // Primitive or null response
    originalFormat = (rawData === null || rawData === undefined) ? 'null_response' : 'primitive_response';
    responseData = rawData ? [rawData as T] : [];
    rowCount = responseData.length;
    
    logger.debug('Handled primitive/null response:', {
      originalValue: rawData,
      resultingArrayLength: responseData.length
    });
  }

  const metadata: PreviewMetadata = {
    isArray: Array.isArray(rawData),
    hasData: Array.isArray(responseData) && responseData.length > 0,
    originalFormat,
    extractedDataLength: Array.isArray(responseData) ? responseData.length : 0,
    responseKeys: rawData && typeof rawData === 'object' ? Object.keys(rawData) : undefined,
    debugInfo: {
      calculatedRowCount: rowCount
    }
  };

  logger.debug('Preview data extraction completed:', metadata);

  return {
    data: responseData,
    rowCount,
    metadata
  };
}

/**
 * Create a standardized preview response for the API
 * 
 * @param source Data source identifier (ad, azure, o365, etc.)
 * @param executionTime Query execution time in milliseconds
 * @param extractedData Normalized preview data from extractPreviewData()
 * @returns Formatted API response
 */
export function createPreviewResponse<T = Record<string, unknown>>(
  source: DataSourceType,
  executionTime: number,
  extractedData: NormalizedPreviewData<T>,
  cached?: boolean
): PreviewResponse<T> {
  logger.debug('Creating preview response:', {
    source,
    executionTime,
    dataLength: extractedData.data.length,
    rowCount: extractedData.rowCount,
    originalFormat: extractedData.metadata.originalFormat,
    cached: cached || false
  });

  return {
    success: true,
    data: {
      source,
      executionTime,
      testData: extractedData.data,
      rowCount: extractedData.rowCount,
      isTestRun: true,
      cached,
      metadata: extractedData.metadata
    }
  };
}

/**
 * Comprehensive preview data processing
 * Combines extraction and response formatting in a single call
 * 
 * @param rawData Raw service response
 * @param source Data source identifier
 * @param executionTime Query execution time in milliseconds
 * @param cached Whether the result was cached
 * @returns Complete API response object
 */
export function processPreviewData<T = Record<string, unknown>>(
  rawData: unknown,
  source: DataSourceType,
  executionTime: number,
  cached?: boolean
): PreviewResponse<T> {
  const extractedData = extractPreviewData<T>(rawData);
  return createPreviewResponse<T>(source, executionTime, extractedData, cached);
}

/**
 * Type guard to check if response is a RawServiceResponse object
 */
export function isServiceResponse(obj: unknown): obj is RawServiceResponse {
  return obj !== null && 
         obj !== undefined &&
         typeof obj === 'object' && 
         !Array.isArray(obj) &&
         ((obj as any).data !== undefined || 
          (obj as any).value !== undefined || 
          (obj as any).testData !== undefined ||
          (obj as any).count !== undefined);
}

/**
 * Type guard to check if response is a Graph API response
 */
export function isGraphApiResponse(obj: unknown): obj is RawServiceResponse {
  return obj !== null &&
         obj !== undefined &&
         typeof obj === 'object' && 
         !Array.isArray(obj) &&
         ((obj as any).value !== undefined || (obj as any)['@odata.count'] !== undefined);
}

/**
 * Extract count information from various response formats
 * Useful for pagination and result summary
 */
export function extractRowCount(response: unknown): number {
  if (Array.isArray(response)) {
    return response.length;
  }
  
  if (response && typeof response === 'object') {
    const serviceResponse = response as RawServiceResponse;
    
    // Try various count properties in order of preference
    if ((serviceResponse as any).count !== undefined) return (serviceResponse as any).count;
    if ((serviceResponse as any).totalCount !== undefined) return (serviceResponse as any).totalCount;
    if ((serviceResponse as any).resultCount !== undefined) return (serviceResponse as any).resultCount;
    if ((serviceResponse as any)['@odata.count'] !== undefined) return (serviceResponse as any)['@odata.count'];
    if ((serviceResponse as any).rowCount !== undefined) return (serviceResponse as any).rowCount;
    
    // Try array properties
    if (Array.isArray((serviceResponse as any).data)) return (serviceResponse as any).data.length;
    if (Array.isArray((serviceResponse as any).value)) return (serviceResponse as any).value.length;
    if (Array.isArray((serviceResponse as any).testData)) return (serviceResponse as any).testData.length;
    
    // Single object
    return 1;
  }
  
  return response ? 1 : 0;
}