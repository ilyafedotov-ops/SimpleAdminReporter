/**
 * Microsoft Graph API Utility Functions
 * Common utilities for Graph API operations, extracted to eliminate duplication
 */

import { GraphRequest } from '@microsoft/microsoft-graph-client';

export interface GraphFilter {
  field: string;
  operator: string;
  value: any;
}

export interface GraphQueryOptions {
  filter?: string;
  select?: string[] | string;
  top?: number;
  skip?: number;
  orderBy?: string;
  count?: boolean;
  expand?: string;
}

export interface GraphError {
  code: string;
  message: string;
  innerError?: {
    code: string;
    message: string;
  };
}

/**
 * Build a Graph API request with common query parameters
 */
export function buildGraphRequest(
  request: GraphRequest,
  options: GraphQueryOptions
): GraphRequest {
  if (options.filter) {
    request = request.filter(options.filter);
  }
  
  if (options.select) {
    const selectStr = Array.isArray(options.select) 
      ? options.select.join(',') 
      : options.select;
    request = request.select(selectStr);
  }
  
  if (options.top) {
    request = request.top(options.top);
  }
  
  if (options.skip) {
    request = request.skip(options.skip);
  }
  
  if (options.orderBy) {
    request = request.orderby(options.orderBy);
  }
  
  if (options.count) {
    request = request.count(true);
    // Microsoft Graph requires ConsistencyLevel header when using $count
    request = request.header('ConsistencyLevel', 'eventual');
  }
  
  if (options.expand) {
    request = request.expand(options.expand);
    // signInActivity requires ConsistencyLevel header
    if (options.expand.includes('signInActivity')) {
      request = request.header('ConsistencyLevel', 'eventual');
    }
  }
  
  return request;
}

/**
 * Build OData filter expression from filter object
 */
export function buildFilterExpression(filter: GraphFilter): string {
  const { field, operator, value } = filter;
  
  // Handle null/undefined values
  if (value === null || value === undefined) {
    return operator === 'not_equals' 
      ? `${field} ne null` 
      : `${field} eq null`;
  }
  
  // Format value based on type
  const formattedValue = formatFilterValue(value);
  
  switch (operator) {
    case 'equals':
      return `${field} eq ${formattedValue}`;
    case 'not_equals':
      return `${field} ne ${formattedValue}`;
    case 'greater_than':
      return `${field} gt ${formattedValue}`;
    case 'greater_or_equal':
      return `${field} ge ${formattedValue}`;
    case 'less_than':
      return `${field} lt ${formattedValue}`;
    case 'less_or_equal':
      return `${field} le ${formattedValue}`;
    case 'contains':
      return `contains(${field},${formattedValue})`;
    case 'not_contains':
      return `not contains(${field},${formattedValue})`;
    case 'startsWith':
      return `startswith(${field},${formattedValue})`;
    case 'endsWith':
      return `endswith(${field},${formattedValue})`;
    case 'in':
      // Value should be an array
      const values = Array.isArray(value) ? value : [value];
      const formattedValues = values.map(v => formatFilterValue(v)).join(',');
      return `${field} in (${formattedValues})`;
    default:
      throw new Error(`Unknown filter operator: ${operator}`);
  }
}

/**
 * Format filter value based on its type for OData
 */
export function formatFilterValue(value: any): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  
  if (typeof value === 'string') {
    // Escape single quotes in string values
    const escaped = value.replace(/'/g, "''");
    return `'${escaped}'`;
  }
  
  if (typeof value === 'boolean') {
    return value.toString();
  }
  
  if (value instanceof Date) {
    return value.toISOString();
  }
  
  if (typeof value === 'number') {
    return value.toString();
  }
  
  // Default to string representation
  return `'${value.toString()}'`;
}

/**
 * Build complex filter from multiple conditions
 */
export function buildComplexGraphFilter(
  filters: GraphFilter[],
  combineWith: 'and' | 'or' = 'and'
): string {
  if (!filters || filters.length === 0) {
    return '';
  }
  
  const expressions = filters
    .map(filter => buildFilterExpression(filter))
    .filter(Boolean);
  
  if (expressions.length === 0) {
    return '';
  }
  
  if (expressions.length === 1) {
    return expressions[0];
  }
  
  return expressions.join(` ${combineWith} `);
}

/**
 * Calculate date offset for common time periods
 */
export function calculateDateOffset(
  period: string,
  value: number = 1
): Date {
  const date = new Date();
  
  switch (period.toLowerCase()) {
    case 'days':
    case 'day':
      date.setDate(date.getDate() - value);
      break;
    case 'weeks':
    case 'week':
      date.setDate(date.getDate() - (value * 7));
      break;
    case 'months':
    case 'month':
      date.setMonth(date.getMonth() - value);
      break;
    case 'years':
    case 'year':
      date.setFullYear(date.getFullYear() - value);
      break;
    case 'hours':
    case 'hour':
      date.setHours(date.getHours() - value);
      break;
    default:
      throw new Error(`Unknown time period: ${period}`);
  }
  
  return date;
}

/**
 * Format date for Graph API queries
 */
export function formatDateForGraph(date: Date): string {
  return date.toISOString();
}

/**
 * Parse Graph API response to extract data array
 */
export function parseGraphResponse<T = any>(response: any): { data: T[], totalCount?: number, nextLink?: string } {
  // Handle null/undefined
  if (!response) {
    return { data: [] };
  }
  
  // Handle value property (most common Graph API format)
  if (response.value !== undefined) {
    return {
      data: Array.isArray(response.value) ? response.value : [],
      totalCount: response['@odata.count'],
      nextLink: response['@odata.nextLink']
    };
  }
  
  // Handle direct array response
  if (Array.isArray(response)) {
    return { data: response };
  }
  
  // Handle single object response
  return { data: [response] };
}

/**
 * Parse CSV response from Graph API reports
 */
export function parseCSVResponse(csvData: string): { data: any[], headers: string[] } {
  if (!csvData || typeof csvData !== 'string') {
    return { data: [], headers: [] };
  }

  const lines = csvData.split('\n').filter(line => line.trim());
  if (lines.length < 2) {
    return { data: [], headers: [] };
  }

  // Parse headers
  const headers = parseCSVLine(lines[0]);
  const data: any[] = [];

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    
    if (values.length === headers.length) {
      const record: any = {};
      headers.forEach((header, index) => {
        record[header] = values[index];
      });
      data.push(record);
    }
  }

  return { data, headers };
}

/**
 * Parse a single CSV line handling quoted values
 */
function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // End of field
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  // Don't forget the last field
  values.push(current.trim());
  
  return values;
}

/**
 * Apply client-side filtering to data
 */
export function applyClientSideFilter<T extends Record<string, any>>(
  data: T[],
  filters: GraphFilter[]
): T[] {
  if (!filters || filters.length === 0) {
    return data;
  }
  
  return data.filter(item => {
    return filters.every(filter => {
      const itemValue = getNestedValue(item, filter.field);
      return evaluateFilter(itemValue, filter.operator, filter.value);
    });
  });
}

/**
 * Get nested object value using dot notation
 */
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * Evaluate a single filter condition
 */
function evaluateFilter(itemValue: any, operator: string, filterValue: any): boolean {
  // Handle null/undefined
  if (itemValue === null || itemValue === undefined) {
    return operator === 'not_equals' || operator === 'not_contains';
  }
  
  switch (operator) {
    case 'equals':
      return itemValue === filterValue;
    case 'not_equals':
      return itemValue !== filterValue;
    case 'greater_than':
      return itemValue > filterValue;
    case 'greater_or_equal':
      return itemValue >= filterValue;
    case 'less_than':
      return itemValue < filterValue;
    case 'less_or_equal':
      return itemValue <= filterValue;
    case 'contains':
      return itemValue.toString().toLowerCase().includes(filterValue.toString().toLowerCase());
    case 'not_contains':
      return !itemValue.toString().toLowerCase().includes(filterValue.toString().toLowerCase());
    case 'startsWith':
      return itemValue.toString().toLowerCase().startsWith(filterValue.toString().toLowerCase());
    case 'endsWith':
      return itemValue.toString().toLowerCase().endsWith(filterValue.toString().toLowerCase());
    case 'in':
      const values = Array.isArray(filterValue) ? filterValue : [filterValue];
      return values.includes(itemValue);
    default:
      return true;
  }
}

/**
 * Apply client-side sorting to data
 */
export function applySortToData<T extends Record<string, any>>(
  data: T[],
  orderBy: { field: string; direction: 'asc' | 'desc' }
): T[] {
  return [...data].sort((a, b) => {
    const aVal = getNestedValue(a, orderBy.field);
    const bVal = getNestedValue(b, orderBy.field);
    const modifier = orderBy.direction === 'desc' ? -1 : 1;
    
    // Handle null/undefined values
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1 * modifier;
    if (bVal == null) return -1 * modifier;
    
    // Compare values
    if (aVal < bVal) return -1 * modifier;
    if (aVal > bVal) return 1 * modifier;
    return 0;
  });
}

/**
 * Handle Graph API errors with common patterns
 */
export function handleGraphError(error: any): never {
  const graphError = error as GraphError;
  
  // Check for specific error codes
  if (graphError.code === 'Request_ResourceNotFound') {
    throw new Error('Resource not found');
  }
  
  if (graphError.code === 'Authorization_RequestDenied') {
    throw new Error('Insufficient permissions to perform this operation');
  }
  
  if (graphError.code === 'Request_UnsupportedQuery') {
    throw new Error('The query is not supported');
  }
  
  if (graphError.code === 'InvalidAuthenticationToken') {
    throw new Error('Authentication token is invalid or expired');
  }
  
  if (graphError.code === 'Request_Timeout') {
    throw new Error('Request timed out');
  }
  
  // Generic error message
  const message = graphError.message || 
    ((error as any)?.message && (error as any)?.message !== '[object Object]') || 
    'Unknown Graph API error';
  throw new Error(`Graph API error: ${message}`);
}

/**
 * Common Graph API endpoints
 */
export const GRAPH_ENDPOINTS = {
  // Users
  USERS: '/users',
  USER: (id: string) => `/users/${id}`,
  USER_SIGNIN_ACTIVITY: '/reports/getCredentialUserRegistrationCount',
  
  // Groups
  GROUPS: '/groups',
  GROUP: (id: string) => `/groups/${id}`,
  GROUP_MEMBERS: (id: string) => `/groups/${id}/members`,
  
  // Reports
  MAILBOX_USAGE: "/reports/getMailboxUsageDetail(period='D7')",
  MAILBOX_USAGE_STORAGE: "/reports/getMailboxUsageStorage(period='D7')",
  ONEDRIVE_USAGE: "/reports/getOneDriveUsageAccountDetail(period='D7')",
  ONEDRIVE_USAGE_STORAGE: "/reports/getOneDriveUsageStorage(period='D7')",
  SHAREPOINT_SITE_USAGE: "/reports/getSharePointSiteUsageDetail(period='D7')",
  TEAMS_USER_ACTIVITY: "/reports/getTeamsUserActivityDetail(period='D7')",
  TEAMS_DEVICE_USAGE: "/reports/getTeamsDeviceUsageDetail(period='D7')",
  O365_ACTIVATIONS: "/reports/getOffice365ActivationsUserDetail",
  O365_ACTIVE_USERS: "/reports/getOffice365ActiveUserDetail(period='D7')",
  
  // O365 Usage Reports
  O365: {
    USER_ACTIVITY: "/reports/getOffice365ActiveUserDetail(period='D7')",
    EMAIL_ACTIVITY: "/reports/getEmailActivityUserDetail(period='D7')"
  },
  
  // Applications
  APPLICATIONS: '/applications',
  SERVICE_PRINCIPALS: '/servicePrincipals',
  
  // Devices
  DEVICES: '/devices',
  DEVICE: (id: string) => `/devices/${id}`,
  
  // Organization
  ORGANIZATION: '/organization',
  
  // Directory
  DELETED_ITEMS: '/directory/deletedItems',
  DIRECTORY_ROLES: '/directoryRoles',
  DIRECTORY_ROLE_TEMPLATES: '/directoryRoleTemplates'
} as const;

/**
 * Common select fields for different entity types
 */
export const GRAPH_SELECT_FIELDS = {
  USER: [
    'id',
    'displayName',
    'userPrincipalName',
    'mail',
    'userType',
    'accountEnabled',
    'createdDateTime',
    'signInActivity',
    'department',
    'jobTitle',
    'officeLocation',
    'companyName',
    'manager',
    'mobilePhone',
    'businessPhones'
  ],
  GROUP: [
    'id',
    'displayName',
    'description',
    'mail',
    'groupTypes',
    'securityEnabled',
    'mailEnabled',
    'createdDateTime',
    'membershipRule',
    'membershipRuleProcessingState'
  ],
  APPLICATION: [
    'id',
    'displayName',
    'appId',
    'createdDateTime',
    'signInAudience',
    'identifierUris',
    'web',
    'requiredResourceAccess'
  ]
} as const;