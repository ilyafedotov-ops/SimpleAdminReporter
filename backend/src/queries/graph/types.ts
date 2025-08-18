/**
 * Microsoft Graph API Query Types and Interfaces
 */



export interface GraphQueryDefinition {
  id: string;
  name: string;
  description: string;
  category: 'users' | 'groups' | 'security' | 'licenses' | 'reports' | 'general';
  
  // Graph API query configuration
  query: {
    endpoint: string;                    // Graph API endpoint (e.g., '/users', '/groups/{id}/members')
    method?: 'GET' | 'POST';            // HTTP method, defaults to GET
    apiVersion?: 'v1.0' | 'beta';       // API version, defaults to v1.0
    select?: string[];                  // Fields to retrieve
    expand?: string[];                  // Related entities to expand
    filter?: string;                    // OData filter template with parameter placeholders
    orderBy?: string;                   // Sort order
    top?: number;                       // Page size limit
    skip?: number;                      // Skip for pagination
    count?: boolean;                    // Include @odata.count
    headers?: Record<string, string>;   // Additional headers
  };
  
  // Parameter definitions
  parameters?: {
    [key: string]: {
      type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object';
      required?: boolean;
      default?: any;
      description?: string;
      // Parameter transformations
      transform?: 'daysToDate' | 'hoursToDate' | 'formatDate' | 'buildFilter' | 'escapeOData';
      validation?: {
        min?: number;
        max?: number;
        pattern?: string;
        enum?: any[];
      };
    };
  };
  
  // Post-processing configuration
  postProcess?: {
    // Client-side filtering after Graph API response
    clientFilter?: {
      field: string;
      operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'in' | 'not_in';
      value: string | number | boolean | any[]; // Can reference parameters with {{paramName}}
    }[];
    
    // Transform function name (implemented in GraphQueryExecutor)
    transform?: 'expandAuthMethods' | 'enrichLicenseData' | 'calculateInactivity' | 'aggregateRoles' | 'enrichGuestData' | 'enrichRiskData' | 'expandGroupMembers';
    
    // Aggregation configuration
    aggregate?: {
      groupBy?: string;
      count?: string;
      sum?: string;
      avg?: string;
    };
    
    // Sort results
    sort?: {
      field: string;
      direction: 'asc' | 'desc';
    };
    
    // Limit results
    limit?: number;
  };
  
  // Field transformations and display mappings
  fieldMappings?: {
    [graphField: string]: {
      displayName: string;
      type?: 'string' | 'number' | 'date' | 'boolean' | 'array' | 'object';
      transform?: 'dateToLocal' | 'booleanToYesNo' | 'arrayToCommaSeparated' | 'extractProperty';
      format?: string; // For date formatting or custom formats
      hide?: boolean; // Hide from default display
    };
  };
  
  // Pagination support
  pagination?: {
    pageSize: number;
    supportsDelta?: boolean; // Supports delta queries for change tracking
  };
  
  // Performance hints
  performance?: {
    estimatedDuration?: number; // Estimated execution time in seconds
    cacheable?: boolean;        // Whether results can be cached
    cacheTTL?: number;         // Cache TTL in seconds
    requiresMultipleCalls?: boolean; // Requires multiple API calls
  };
  
  // Report metadata
  reportMetadata?: {
    exportFormats?: ('excel' | 'csv' | 'pdf' | 'json')[];
    defaultColumns?: string[];
    groupingOptions?: string[];
    chartType?: 'table' | 'bar' | 'pie' | 'line';
  };
}

export interface GraphQueryResult {
  queryId: string;
  executedAt: Date;
  executionTimeMs: number;
  rowCount: number;
  data: any[];
  parameters?: Record<string, any>;
  metadata?: {
    totalCount?: number;      // From @odata.count
    nextLink?: string;        // For pagination
    deltaLink?: string;       // For delta queries
  };
  error?: string;
}

export interface GraphQueryExecutionContext {
  userId: number;
  credentialId?: number;
  parameters: Record<string, any>;
  options?: {
    includeCount?: boolean;
    pageSize?: number;
    maxRecords?: number;
    timeout?: number;
  };
  saveHistory?: boolean;
  // Enhanced context options
  graphContext?: {
    queryContext?: 'application' | 'user' | 'organization';
    targetUser?: string;
    targetOrganization?: string;
  };
}

export interface GraphBatchQuery {
  id: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: any;
}

export interface GraphBatchResponse {
  id: string;
  status: number;
  headers?: Record<string, string>;
  body?: any;
}

// Helper functions for parameter transformations

/**
 * Convert days to a date in the past
 */
export function daysToDate(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

/**
 * Convert hours to a date in the past
 */
export function hoursToDate(hours: number): Date {
  const date = new Date();
  date.setHours(date.getHours() - hours);
  return date;
}

/**
 * Format date for Graph API (ISO 8601)
 */
export function formatDateForGraph(date: Date): string {
  return date.toISOString();
}

/**
 * Escape special characters in OData filter values
 */
export function escapeODataValue(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Build a dynamic filter expression from parameters
 */
export function buildDynamicFilter(template: string, parameters: Record<string, any>): string {
  let filter = template;
  
  // Replace parameter placeholders
  Object.entries(parameters).forEach(([key, value]) => {
    const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    let formattedValue = value;
    
    // Format based on type
    if (value instanceof Date) {
      formattedValue = formatDateForGraph(value);
    } else if (typeof value === 'string') {
      formattedValue = `'${escapeODataValue(value)}'`;
    } else if (typeof value === 'boolean') {
      formattedValue = value.toString();
    }
    
    filter = filter.replace(placeholder, formattedValue);
  });
  
  return filter;
}

// Common Graph API response types

export interface GraphUser {
  id: string;
  displayName: string;
  userPrincipalName: string;
  mail?: string;
  userType?: 'Member' | 'Guest';
  accountEnabled?: boolean;
  createdDateTime?: string;
  signInActivity?: {
    lastSignInDateTime?: string;
    lastNonInteractiveSignInDateTime?: string;
  };
  department?: string;
  jobTitle?: string;
  officeLocation?: string;
  manager?: GraphUser;
  assignedLicenses?: any[];
  authentication?: {
    methods?: any[];
  };
}

export interface GraphGroup {
  id: string;
  displayName: string;
  description?: string;
  mail?: string;
  groupTypes?: string[];
  securityEnabled?: boolean;
  mailEnabled?: boolean;
  createdDateTime?: string;
  membershipRule?: string;
  membershipRuleProcessingState?: string;
  members?: GraphUser[];
}

export interface GraphDirectoryRole {
  id: string;
  displayName: string;
  description?: string;
  roleTemplateId?: string;
  members?: GraphUser[];
}

// Query validation types

export interface QueryValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
  estimatedCost?: {
    apiCalls: number;
    estimatedTimeMs: number;
  };
}

// Export type guards

export function isGraphQueryDefinition(obj: any): obj is GraphQueryDefinition {
  return obj &&
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.query === 'object' &&
    typeof obj.query.endpoint === 'string';
}

export function hasParameters(query: GraphQueryDefinition): boolean {
  return !!query.parameters && Object.keys(query.parameters).length > 0;
}

export function requiresAuthentication(_query: GraphQueryDefinition): boolean {
  // All Graph API queries require authentication
  return true;
}

// Common query templates

export const COMMON_SELECT_FIELDS = {
  USER_BASIC: ['id', 'displayName', 'userPrincipalName', 'mail', 'userType', 'accountEnabled'],
  USER_FULL: ['id', 'displayName', 'userPrincipalName', 'mail', 'userType', 'accountEnabled', 
               'createdDateTime', 'department', 'jobTitle', 'officeLocation', 'companyName'],
  GROUP_BASIC: ['id', 'displayName', 'description', 'groupTypes', 'securityEnabled', 'mailEnabled'],
  GROUP_FULL: ['id', 'displayName', 'description', 'mail', 'groupTypes', 'securityEnabled', 
                'mailEnabled', 'createdDateTime', 'membershipRule']
};

export const COMMON_FILTERS = {
  ACTIVE_USERS: "accountEnabled eq true",
  GUEST_USERS: "userType eq 'Guest'",
  MEMBER_USERS: "userType eq 'Member'",
  SECURITY_GROUPS: "securityEnabled eq true and mailEnabled eq false",
  MAIL_ENABLED_GROUPS: "mailEnabled eq true",
  DYNAMIC_GROUPS: "membershipRuleProcessingState eq 'On'"
};