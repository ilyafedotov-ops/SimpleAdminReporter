import { ResultMapping, ResultTransform, FilterCondition, SortCondition } from './types';
import { logger } from '@/utils/logger';

/**
 * Result Transformer
 * 
 * Transforms and processes query results according to mapping definitions
 */
export class ResultTransformer {
  
  /**
   * Transform query results according to result mapping configuration
   */
  async transformResults<T>(
    rawResults: any[],
    mapping: ResultMapping
  ): Promise<T[]> {
    if (!rawResults || rawResults.length === 0) {
      return [] as T[];
    }
    
    try {
      let results = rawResults;
      
      // 1. Apply field mappings and transformations
      if (mapping.fieldMappings) {
        results = await this.applyFieldMappings(results, mapping.fieldMappings);
      }
      
      // 2. Apply post-processing
      if (mapping.postProcess) {
        results = await this.applyPostProcessing(results, mapping.postProcess);
      }
      
      return results as T[];
      
    } catch (error) {
      logger.error('Result transformation failed:', error);
      throw error;
    }
  }
  
  /**
   * Apply field mappings and transformations
   */
  private async applyFieldMappings(
    results: any[],
    fieldMappings: ResultMapping['fieldMappings']
  ): Promise<any[]> {
    return Promise.all(results.map(async (row) => {
      const transformedRow: any = {};
      
      // Process each field mapping
      for (const [sourceField, mapping] of Object.entries(fieldMappings)) {
        const sourceValue = row[sourceField];
        let transformedValue = sourceValue;
        
        // Apply type conversion
        if (mapping.type && sourceValue !== null && sourceValue !== undefined) {
          transformedValue = this.convertFieldType(sourceValue, mapping.type, mapping.format);
        }
        
        // Apply transformation
        if (mapping.transform && transformedValue !== null && transformedValue !== undefined) {
          transformedValue = await this.applyFieldTransform(transformedValue, mapping.transform, sourceField);
        }
        
        // Set the transformed value with the target field name
        transformedRow[mapping.targetField] = transformedValue;
      }
      
      // Include any unmapped fields
      for (const [key, value] of Object.entries(row)) {
        if (!fieldMappings[key]) {
          transformedRow[key] = value;
        }
      }
      
      return transformedRow;
    }));
  }
  
  /**
   * Convert field value to specified type
   */
  private convertFieldType(value: any, type: string, format?: string): any {
    try {
      switch (type) {
        case 'string':
          return String(value);
          
        case 'number':
          const num = Number(value);
          return isNaN(num) ? null : num;
          
        case 'boolean':
          if (typeof value === 'boolean') return value;
          if (typeof value === 'string') {
            const lower = value.toLowerCase();
            return lower === 'true' || lower === '1' || lower === 'yes';
          }
          return Boolean(value);
          
        case 'date':
          if (value instanceof Date) {
            return format ? this.formatDate(value, format) : value.toISOString();
          }
          const date = new Date(value);
          if (isNaN(date.getTime())) return null;
          return format ? this.formatDate(date, format) : date.toISOString();
          
        case 'array':
          if (Array.isArray(value)) return value;
          if (typeof value === 'string') {
            try {
              const parsed = JSON.parse(value);
              return Array.isArray(parsed) ? parsed : [value];
            } catch {
              return value.split(',').map(v => v.trim());
            }
          }
          return [value];
          
        case 'object':
          if (typeof value === 'object' && !Array.isArray(value)) return value;
          if (typeof value === 'string') {
            try {
              return JSON.parse(value);
            } catch {
              return null;
            }
          }
          return null;
          
        default:
          return value;
      }
    } catch (error) {
      logger.warn(`Field type conversion failed for type ${type}:`, error);
      return value; // Return original value on conversion failure
    }
  }
  
  /**
   * Apply field transformation
   */
  private async applyFieldTransform(
    value: any,
    transform: ResultTransform,
    fieldName: string
  ): Promise<any> {
    try {
      switch (transform) {
        case 'fileTimeToDate':
          return this.fileTimeToDate(value);
          
        case 'dnToName':
          return this.dnToName(value);
          
        case 'userAccountControlToFlags':
          return this.userAccountControlToFlags(value);
          
        case 'bytesToMB':
          return this.bytesToMB(value);
          
        case 'msToSeconds':
          return this.msToSeconds(value);
          
        case 'uppercaseFirst':
          return this.uppercaseFirst(value);
          
        case 'truncate':
          return this.truncateString(value, 100); // Default truncate length
          
        case 'anonymize':
          return this.anonymizeValue(value, fieldName);
          
        default:
          logger.warn(`Unknown field transformation: ${transform}`);
          return value;
      }
    } catch (error) {
      logger.warn(`Field transformation failed for ${transform}:`, error);
      return value; // Return original value on transformation failure
    }
  }
  
  /**
   * Apply post-processing filters, sorting, and limits
   */
  private async applyPostProcessing(
    results: any[],
    postProcess: ResultMapping['postProcess']
  ): Promise<any[]> {
    let processedResults = [...results];
    
    // Apply filters
    if (postProcess?.filter && postProcess.filter.length > 0) {
      processedResults = this.applyFilters(processedResults, postProcess.filter);
    }
    
    // Apply sorting
    if (postProcess?.sort && postProcess.sort.length > 0) {
      processedResults = this.applySorting(processedResults, postProcess.sort);
    }
    
    // Apply limit
    if (postProcess?.limit && postProcess.limit > 0) {
      processedResults = processedResults.slice(0, postProcess.limit);
    }
    
    return processedResults;
  }
  
  /**
   * Apply filters to results
   */
  private applyFilters(results: any[], filters: FilterCondition[]): any[] {
    return results.filter(row => {
      return filters.every(filter => this.evaluateFilter(row, filter));
    });
  }
  
  /**
   * Evaluate a single filter condition
   */
  private evaluateFilter(row: any, filter: FilterCondition): boolean {
    const fieldValue = row[filter.field];
    const filterValue = filter.value;
    
    switch (filter.operator) {
      case 'eq':
        return fieldValue === filterValue;
      case 'ne':
        return fieldValue !== filterValue;
      case 'gt':
        return fieldValue > filterValue;
      case 'gte':
        return fieldValue >= filterValue;
      case 'lt':
        return fieldValue < filterValue;
      case 'lte':
        return fieldValue <= filterValue;
      case 'in':
        return Array.isArray(filterValue) && filterValue.includes(fieldValue);
      case 'nin':
        return Array.isArray(filterValue) && !filterValue.includes(fieldValue);
      case 'like':
        return typeof fieldValue === 'string' && typeof filterValue === 'string' &&
               fieldValue.toLowerCase().includes(filterValue.toLowerCase());
      case 'ilike':
        return typeof fieldValue === 'string' && typeof filterValue === 'string' &&
               fieldValue.toLowerCase().includes(filterValue.toLowerCase());
      case 'is_null':
        return fieldValue === null || fieldValue === undefined;
      case 'is_not_null':
        return fieldValue !== null && fieldValue !== undefined;
      default:
        logger.warn(`Unknown filter operator: ${filter.operator}`);
        return true;
    }
  }
  
  /**
   * Apply sorting to results
   */
  private applySorting(results: any[], sorts: SortCondition[]): any[] {
    return results.sort((a, b) => {
      for (const sort of sorts) {
        const aVal = a[sort.field];
        const bVal = b[sort.field];
        
        let comparison = 0;
        
        if (aVal === null || aVal === undefined) comparison = -1;
        else if (bVal === null || bVal === undefined) comparison = 1;
        else if (aVal < bVal) comparison = -1;
        else if (aVal > bVal) comparison = 1;
        
        if (comparison !== 0) {
          return sort.direction === 'desc' ? -comparison : comparison;
        }
      }
      return 0;
    });
  }
  
  // Transformation helper methods
  
  /**
   * Convert Windows FileTime to ISO date string
   */
  private fileTimeToDate(fileTime: string | number): string | null {
    try {
      const timestamp = typeof fileTime === 'string' ? parseInt(fileTime) : fileTime;
      if (timestamp === 0 || timestamp === 9223372036854775807) {
        return null; // Never expires
      }
      const date = new Date(timestamp / 10000 - 11644473600000);
      return date.toISOString();
    } catch {
      return null;
    }
  }
  
  /**
   * Extract name from Distinguished Name
   */
  private dnToName(dn: string): string {
    if (!dn || typeof dn !== 'string') return dn;
    const match = dn.match(/^CN=([^,]+)/);
    return match ? match[1] : dn;
  }
  
  /**
   * Convert UserAccountControl flags to readable format
   */
  private userAccountControlToFlags(uac: number): any {
    if (typeof uac !== 'number') return uac;
    
    const flags = {
      disabled: (uac & 0x0002) !== 0,
      lockedOut: (uac & 0x0010) !== 0,
      passwordNotRequired: (uac & 0x0020) !== 0,
      passwordCantChange: (uac & 0x0040) !== 0,
      passwordNeverExpires: (uac & 0x10000) !== 0,
      accountLocked: (uac & 0x0010) !== 0
    };
    
    return {
      value: uac,
      flags,
      status: flags.disabled ? 'Disabled' : 
              flags.lockedOut ? 'Locked' : 'Active'
    };
  }
  
  /**
   * Convert bytes to megabytes
   */
  private bytesToMB(bytes: number): number {
    return typeof bytes === 'number' ? Math.round(bytes / (1024 * 1024) * 100) / 100 : 0;
  }
  
  /**
   * Convert milliseconds to seconds
   */
  private msToSeconds(ms: number): number {
    return typeof ms === 'number' ? Math.round(ms / 1000 * 100) / 100 : 0;
  }
  
  /**
   * Uppercase first letter of string
   */
  private uppercaseFirst(str: string): string {
    if (!str || typeof str !== 'string') return str;
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }
  
  /**
   * Truncate string to specified length
   */
  private truncateString(str: string, maxLength: number = 100): string {
    if (!str || typeof str !== 'string') return str;
    return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
  }
  
  /**
   * Anonymize sensitive field values
   */
  private anonymizeValue(value: any, fieldName: string): string {
    if (!value) return value;
    
    const str = String(value);
    
    // Email anonymization
    if (fieldName.toLowerCase().includes('email') || fieldName.toLowerCase().includes('mail')) {
      const atIndex = str.indexOf('@');
      if (atIndex > 0) {
        const username = str.substring(0, atIndex);
        const domain = str.substring(atIndex);
        return username.charAt(0) + '*'.repeat(username.length - 1) + domain;
      }
    }
    
    // Phone number anonymization
    if (fieldName.toLowerCase().includes('phone') || fieldName.toLowerCase().includes('tel')) {
      return str.replace(/\d/g, (digit, index) => index < 3 ? digit : '*');
    }
    
    // Default anonymization - show first and last character
    if (str.length <= 2) return '*'.repeat(str.length);
    return str.charAt(0) + '*'.repeat(str.length - 2) + str.charAt(str.length - 1);
  }
  
  /**
   * Format date according to specified format
   */
  private formatDate(date: Date, format: string): string {
    const formatters: Record<string, string> = {
      'YYYY-MM-DD': date.toISOString().split('T')[0],
      'DD/MM/YYYY': `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`,
      'MM/DD/YYYY': `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}/${date.getFullYear()}`,
      'ISO': date.toISOString(),
      'UTC': date.toUTCString()
    };
    
    return formatters[format] || date.toISOString();
  }
}