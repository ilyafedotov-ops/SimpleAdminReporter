/**
 * LDAP Query Types and Interfaces
 */

export interface LDAPQueryDefinition {
  id: string;
  name: string;
  description: string;
  category: 'users' | 'computers' | 'groups' | 'general';
  
  // LDAP query configuration
  query: {
    base?: string; // Optional, defaults to AD_BASE_DN
    scope: 'base' | 'one' | 'sub';
    filter: string;
    attributes: string[];
    sizeLimit?: number;
    timeLimit?: number;
  };
  
  // Parameter definitions
  parameters?: {
    [key: string]: {
      type: 'string' | 'number' | 'boolean' | 'date';
      required: boolean;
      default?: any;
      description?: string;
      // For calculations (e.g., days to timestamp)
      transform?: 'daysToTimestamp' | 'hoursToTimestamp' | 'daysToPasswordExpiry' | 'daysToFileTime';
    };
  };
  
  // Post-processing configuration
  postProcess?: {
    // Filter results after LDAP query
    filter?: {
      field: string;
      operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'ne' | 'contains' | 'startsWith';
      value: string | number; // Can reference parameters with {{paramName}}
    }[];
    
    // Sort results
    sort?: {
      field: string;
      direction: 'asc' | 'desc';
    };
    
    // Limit results
    limit?: number;
  };
  
  // Field transformations
  fieldMappings?: {
    [ldapField: string]: {
      displayName: string;
      type?: 'string' | 'number' | 'date' | 'boolean' | 'array';
      transform?: 'fileTimeToDate' | 'dnToName' | 'userAccountControlToFlags';
    };
  };
}

export interface LDAPQueryResult {
  queryId: string;
  executedAt: Date;
  executionTimeMs: number;
  rowCount: number;
  data: any[];
  parameters?: Record<string, any>;
  error?: string;
}

export interface LDAPQueryExecutionResult {
  success: boolean;
  data?: any[];
  error?: string;
  metadata: {
    query: string;
    executionTime: number;
    resultCount?: number;
    parameters: Record<string, any>;
  };
}

export interface LDAPQueryExecutionContext {
  userId: number;
  credentialId?: number;
  parameters: Record<string, any>;
  saveHistory?: boolean;
}

// Helper type for Windows FileTime conversion
export const WINDOWS_FILETIME_OFFSET = 11644473600000; // Milliseconds between 1601-01-01 and 1970-01-01
export const WINDOWS_FILETIME_MULTIPLIER = 10000; // 100-nanosecond intervals to milliseconds

/**
 * Convert a JavaScript Date to Windows FileTime
 */
export function dateToWindowsFileTime(date: Date): string {
  return ((date.getTime() + WINDOWS_FILETIME_OFFSET) * WINDOWS_FILETIME_MULTIPLIER).toString();
}

/**
 * Convert Windows FileTime to JavaScript Date
 */
export function windowsFileTimeToDate(fileTime: string | number): Date | null {
  try {
    const timestamp = typeof fileTime === 'string' ? parseInt(fileTime) : fileTime;
    if (timestamp === 0 || timestamp === 9223372036854775807) { // Never expires
      return null;
    }
    return new Date(timestamp / WINDOWS_FILETIME_MULTIPLIER - WINDOWS_FILETIME_OFFSET);
  } catch {
    return null;
  }
}