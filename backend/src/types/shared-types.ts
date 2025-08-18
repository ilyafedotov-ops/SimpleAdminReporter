/**
 * Shared Type Definitions
 * Common interfaces and types used across multiple services
 */

// ==================== Common Base Types ====================

export interface BaseEntity {
  id: string | number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface QueryOptions {
  filter?: string;
  select?: string[];
  orderBy?: OrderByClause;
  limit?: number;
  offset?: number;
  includeCount?: boolean;
}

export interface OrderByClause {
  field: string;
  direction: 'asc' | 'desc';
}

export interface PaginationOptions {
  page?: number;
  pageSize?: number;
  cursor?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    total?: number;
    page?: number;
    pageSize?: number;
    hasNext?: boolean;
    hasPrevious?: boolean;
    cursor?: string;
  };
}

// ==================== Report Types ====================

export interface ReportResult<T = any> {
  reportType: string;
  generatedAt: Date;
  parameters?: Record<string, any>;
  data: T[];
  count: number;
  executionTime?: number;
  metadata?: Record<string, any>;
}

export interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  category: 'ad' | 'azure' | 'o365' | 'custom';
  source: DataSourceType;
  queryConfig: CustomQuery;
  parameters?: ReportParameter[];
  isActive: boolean;
  createdBy?: string;
  tags?: string[];
}

export interface ReportParameter {
  name: string;
  type: 'string' | 'number' | 'date' | 'boolean' | 'select';
  label: string;
  description?: string;
  required?: boolean;
  defaultValue?: any;
  options?: Array<{ label: string; value: any }>;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    message?: string;
  };
}

export interface ReportExecution {
  id: number;
  userId: number;
  reportId: string;
  executedAt: Date;
  status: 'pending' | 'running' | 'completed' | 'failed';
  parameters?: Record<string, any>;
  resultCount?: number;
  results?: any;
  error?: string;
  executionTimeMs?: number;
}

// ==================== Query Types ====================

export interface CustomQuery {
  source: DataSourceType;
  type?: string;
  fields?: QueryField[];
  filters?: QueryFilter[];
  groupBy?: string[];
  orderBy?: OrderByClause;
  aggregations?: QueryAggregation[];
  limit?: number;
}

export interface QueryField {
  name: string;
  displayName?: string;
  type?: FieldType;
  format?: string;
  transform?: string;
}

export interface QueryFilter {
  field: string;
  operator: FilterOperator;
  value: any;
  type?: FieldType;
  combineWith?: 'AND' | 'OR';
}

export interface QueryAggregation {
  field: string;
  function: 'count' | 'sum' | 'avg' | 'min' | 'max';
  alias?: string;
}

export type DataSourceType = 'ad' | 'azure' | 'o365' | 'postgres';

export type FieldType = 
  | 'string' 
  | 'number' 
  | 'boolean' 
  | 'date' 
  | 'datetime' 
  | 'array' 
  | 'object';

export type FilterOperator = 
  | 'equals' 
  | 'not_equals' 
  | 'contains' 
  | 'not_contains' 
  | 'startsWith' 
  | 'endsWith' 
  | 'greater_than' 
  | 'greater_or_equal' 
  | 'less_than' 
  | 'less_or_equal' 
  | 'in' 
  | 'not_in' 
  | 'exists' 
  | 'not_exists' 
  | 'older_than' 
  | 'newer_than';

// ==================== User Types ====================

export interface BaseUser {
  id: string;
  username: string;
  displayName: string;
  email: string;
  enabled: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ADUser extends BaseUser {
  firstName: string;
  lastName: string;
  department: string;
  title: string;
  company: string;
  manager: string;
  phone: string;
  mobile: string;
  office: string;
  lastLogon: Date | null;
  passwordLastSet: Date | null;
  accountExpires: Date | null;
  whenCreated: Date | null;
  whenChanged: Date | null;
  distinguishedName: string;
  organizationalUnit: string;
  locked: boolean;
  passwordNeverExpires: boolean;
  groups: string[];
  userAccountControl?: number;
  badPasswordCount?: number;
  employeeId?: string;
}

export interface AzureADUser extends BaseUser {
  userPrincipalName: string;
  mail: string;
  userType: 'Member' | 'Guest';
  accountEnabled: boolean;
  department?: string;
  jobTitle?: string;
  companyName?: string;
  officeLocation?: string;
  mobilePhone?: string;
  businessPhones?: string[];
  assignedLicenses?: string[];
  lastSignInDateTime: Date | null;
  createdDateTime: Date;
  mfaEnabled?: boolean;
  manager?: string;
}

export interface O365User extends BaseUser {
  userPrincipalName: string;
  assignedLicenses: string[];
  lastActivityDate?: Date;
  hasOneDrive?: boolean;
  hasMailbox?: boolean;
  hasTeams?: boolean;
  hasSharePoint?: boolean;
}

// ==================== Resource Types ====================

export interface ADComputer {
  name: string;
  dnsHostName: string;
  distinguishedName: string;
  operatingSystem: string;
  operatingSystemVersion: string;
  lastLogonTimestamp: Date | null;
  whenCreated: Date | null;
  whenChanged: Date | null;
  enabled: boolean;
  description?: string;
  managedBy?: string;
  location?: string;
}

export interface ADGroup {
  name: string;
  distinguishedName: string;
  description: string;
  members: string[];
  memberOf: string[];
  groupType: string;
  whenCreated: Date | null;
  whenChanged: Date | null;
  managedBy?: string;
  email?: string;
}

export interface O365MailboxUsage {
  userPrincipalName: string;
  displayName: string;
  storageUsedInBytes: number;
  itemCount: number;
  deletedItemCount?: number;
  deletedItemSizeInBytes?: number;
  issueWarningQuotaInBytes?: number;
  prohibitSendQuotaInBytes?: number;
  prohibitSendReceiveQuotaInBytes?: number;
  lastActivityDate?: Date;
  reportDate: Date;
}

export interface O365OneDriveUsage {
  userPrincipalName: string;
  displayName: string;
  storageUsedInBytes: number;
  fileCount: number;
  activeFileCount?: number;
  storageAllocatedInBytes?: number;
  lastActivityDate?: Date;
  reportDate: Date;
}

export interface O365TeamsActivity {
  userPrincipalName: string;
  displayName: string;
  lastActivityDate?: Date;
  teamChatMessageCount?: number;
  privateChatMessageCount?: number;
  callCount?: number;
  meetingCount?: number;
  meetingsOrganizedCount?: number;
  meetingsAttendedCount?: number;
  reportDate: Date;
}

// ==================== Service Response Types ====================

export interface ServiceResponse<T = any> {
  success: boolean;
  data?: T;
  error?: ServiceError;
  metadata?: Record<string, any>;
}

export interface ServiceError {
  code: string;
  message: string;
  details?: any;
  timestamp?: Date;
}

export interface BatchOperationResult<T = any> {
  successful: T[];
  failed: Array<{
    item: any;
    error: ServiceError;
  }>;
  totalProcessed: number;
  successCount: number;
  failureCount: number;
}

// ==================== Field Discovery Types ====================

export interface FieldMetadata {
  name: string;
  displayName: string;
  type: FieldType;
  description?: string;
  category?: string;
  searchable?: boolean;
  sortable?: boolean;
  filterable?: boolean;
  operators?: FilterOperator[];
  format?: string;
  example?: any;
  source?: DataSourceType;
}

export interface FieldCategory {
  name: string;
  displayName: string;
  description?: string;
  fields: FieldMetadata[];
  icon?: string;
}

// ==================== Preview Types ====================

/**
 * Standardized response format for preview operations
 * Generic type T represents the structure of individual data records
 */
export interface PreviewResponse<T = Record<string, unknown>> {
  success: boolean;
  data: {
    source: DataSourceType;
    executionTime: number;
    testData: T[];
    rowCount: number;
    isTestRun: boolean;
    cached?: boolean;
    metadata?: PreviewMetadata;
  };
  error?: ServiceError;
}

/**
 * Metadata for preview responses
 */
export interface PreviewMetadata {
  originalFormat: string;
  extractedDataLength: number;
  isArray: boolean;
  hasData: boolean;
  responseKeys?: string[];
  debugInfo?: Record<string, unknown>;
}

/**
 * Raw service response that needs to be processed into preview format
 */
export interface RawServiceResponse {
  data?: unknown[];
  count?: number;
  totalCount?: number;
  resultCount?: number;
  testData?: unknown[];
  rowCount?: number;
  value?: unknown[]; // Microsoft Graph API format
  '@odata.count'?: number; // OData count format
  success?: boolean;
  cached?: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Normalized data structure after processing
 */
export interface NormalizedPreviewData<T = Record<string, unknown>> {
  data: T[];
  rowCount: number;
  metadata: PreviewMetadata;
}

/**
 * Preview request parameters
 */
export interface PreviewRequest {
  source: DataSourceType;
  query: CustomQuery;
  parameters?: Record<string, unknown>;
  limit?: number;
}

// ==================== Export Types ====================

export interface ExportOptions {
  format: 'csv' | 'excel' | 'pdf' | 'json';
  filename?: string;
  includeHeaders?: boolean;
  fields?: string[];
  formatting?: {
    dateFormat?: string;
    numberFormat?: string;
    booleanFormat?: { true: string; false: string };
  };
  pdf?: {
    orientation?: 'portrait' | 'landscape';
    pageSize?: 'A4' | 'Letter';
    margins?: { top: number; right: number; bottom: number; left: number };
  };
}

// ==================== Cache Types ====================

export interface CacheEntry<T = any> {
  key: string;
  value: T;
  expiresAt: Date;
  createdAt: Date;
  hits?: number;
  tags?: string[];
}

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  tags?: string[];
  invalidateOn?: string[]; // Events that invalidate this cache
}

// ==================== Metric Types ====================

export interface QueryMetrics {
  queryId: string;
  executionCount: number;
  totalExecutionTime: number;
  averageExecutionTime: number;
  minExecutionTime: number;
  maxExecutionTime: number;
  errorCount: number;
  cacheHitCount: number;
  cacheHitRate: number;
  lastExecuted: Date;
  lastError?: string;
}

export interface ServiceMetrics {
  serviceName: string;
  uptime: number;
  requestCount: number;
  errorRate: number;
  averageResponseTime: number;
  activeConnections: number;
  queuedRequests?: number;
}

// ==================== Schedule Types ====================

export interface ReportSchedule {
  id: number;
  reportId: string;
  userId: number;
  name: string;
  description?: string;
  schedule: ScheduleConfig;
  recipients?: string[];
  exportFormat?: ExportOptions['format'];
  isActive: boolean;
  lastRun?: Date;
  nextRun?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScheduleConfig {
  frequency: 'once' | 'daily' | 'weekly' | 'monthly' | 'custom';
  time?: string; // HH:mm format
  daysOfWeek?: number[]; // 0-6 (Sunday-Saturday)
  dayOfMonth?: number; // 1-31
  cronExpression?: string; // For custom schedules
  timezone?: string;
}

// ==================== Audit Types ====================

export interface AuditLog {
  id: number;
  userId: number;
  action: string;
  resource: string;
  resourceId?: string;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
  success: boolean;
  errorMessage?: string;
}

// ==================== Notification Types ====================

export interface Notification {
  id: string;
  userId: number;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, any>;
  isRead: boolean;
  isDismissed: boolean;
  priority: NotificationPriority;
  category?: string;
  expiresAt?: Date;
  createdAt: Date;
  readAt?: Date;
  dismissedAt?: Date;
  createdBy?: number;
  source?: string;
}

export type NotificationType = 
  | 'info'
  | 'success' 
  | 'warning' 
  | 'error' 
  | 'report_complete' 
  | 'report_failed' 
  | 'system' 
  | 'reminder';

export type NotificationPriority = 1 | 2 | 3 | 4 | 5; // 1=low, 3=normal, 5=critical

export interface CreateNotificationRequest {
  userId: number;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, any>;
  priority?: NotificationPriority;
  category?: string;
  expiresAt?: Date;
  source?: string;
}

export interface UpdateNotificationRequest {
  isRead?: boolean;
  isDismissed?: boolean;
}

export interface NotificationFilters {
  types?: NotificationType[];
  categories?: string[];
  isRead?: boolean;
  isDismissed?: boolean;
  priority?: NotificationPriority[];
  dateFrom?: Date;
  dateTo?: Date;
}

export interface NotificationStats {
  totalCount: number;
  unreadCount: number;
  highPriorityUnread: number;
  recentCount: number;
}

export interface BulkNotificationOperation {
  notificationIds: string[];
  operation: 'mark_read' | 'mark_unread' | 'dismiss' | 'delete';
}