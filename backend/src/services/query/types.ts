/**
 * Query Service Types and Interfaces
 * 
 * New unified query system for all database operations
 */

export type DataSource = 'postgres' | 'ad' | 'azure' | 'o365';

export type QueryParameterType = 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object';

export type WhereOperator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin' | 'like' | 'ilike' | 'contains' | 'startsWith' | 'is_null' | 'is_not_null' | 'isEmpty' | 'isNotEmpty';

export interface ParameterDefinition {
  name: string;
  type: QueryParameterType;
  required: boolean;
  default?: any;
  description?: string;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    enum?: any[];
  };
  transform?: 'daysToTimestamp' | 'hoursToTimestamp' | 'encrypt' | 'hash';
}

export interface QueryResult<T = any> {
  success: boolean;
  data: T[];
  metadata: {
    executionTime: number;
    rowCount: number;
    queryId?: string;
    cached?: boolean;
    dataSource: DataSource;
  };
  error?: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface QueryDefinition<T = any> {
  id: string;
  name: string;
  description: string;
  version: string;
  dataSource: DataSource;
  
  // SQL configuration
  sql: string;
  parameters: ParameterDefinition[];
  
  // Result configuration
  resultMapping?: ResultMapping;
  
  // Performance and caching
  cache?: {
    enabled: boolean;
    ttlSeconds: number;
    keyTemplate: string;
  };
  
  // Security
  access: {
    requiresAuth: boolean;
    roles?: string[];
    permissions?: string[];
  };
  
  // Query constraints
  constraints?: {
    maxResults?: number;
    timeoutMs?: number;
    rateLimitPerMinute?: number;
  };
}

export interface ResultMapping {
  fieldMappings: {
    [sourceField: string]: {
      targetField: string;
      type?: 'string' | 'number' | 'date' | 'boolean' | 'array' | 'object';
      transform?: ResultTransform;
      format?: string; // For dates, numbers etc
    };
  };
  postProcess?: {
    filter?: FilterCondition[];
    sort?: SortCondition[];
    limit?: number;
  };
}

export interface FilterCondition {
  field: string;
  operator: WhereOperator;
  value: any;
}

export interface SortCondition {
  field: string;
  direction: 'asc' | 'desc';
}

export type ResultTransform = 
  | 'fileTimeToDate' 
  | 'dnToName' 
  | 'userAccountControlToFlags' 
  | 'bytesToMB' 
  | 'msToSeconds'
  | 'uppercaseFirst'
  | 'truncate'
  | 'anonymize';

export interface WhereCondition {
  field: string;
  operator: WhereOperator;
  value: any;
  logic?: 'AND' | 'OR';
}

export interface QueryExecutionContext {
  userId: number;
  parameters: Record<string, any>;
  options?: {
    skipCache?: boolean;
    timeout?: number;
    maxResults?: number;
    credentialId?: number; // Optional user-specific credential ID
  };
}

export interface QueryBuilderResult {
  sql: string;
  parameters: any[];
  parameterCount: number;
}

export interface CacheOptions {
  key: string;
  ttlSeconds: number;
  enabled: boolean;
}

export interface QueryMetrics {
  queryId: string;
  executionTime: number;
  rowCount: number;
  cached: boolean;
  userId: number;
  timestamp: Date;
  parameters: Record<string, any>;
}

export interface QueryValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}