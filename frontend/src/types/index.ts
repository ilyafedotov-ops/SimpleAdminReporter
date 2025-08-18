// Authentication Types
export interface User {
  id: string;
  username: string;
  displayName: string;
  email: string;
  authSource: 'ad' | 'azure' | 'local';
  roles: string[];
  permissions: string[];
  lastLogin?: string;
  isActive: boolean;
  isAdmin?: boolean;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface LoginRequest {
  username: string;
  password: string;
  authSource: 'ad' | 'azure' | 'local';
}

// Report Types
export interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  category: 'AD' | 'AzureAD' | 'O365';
  reportType: string;
  queryTemplate: Record<string, unknown>;
  requiredParameters: string[];
  isActive: boolean;
  createdAt: string;
}

export interface ReportParameter {
  name: string;
  displayName: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'datetime' | 'select' | 'multiselect';
  required: boolean;
  defaultValue?: string | number | boolean | string[];
  min?: number;
  max?: number;
  options?: { label: string; value: string | number }[];
  description?: string;
}

export interface CustomReportTemplate {
  id: string;
  name: string;
  description: string;
  source: 'ad' | 'azure' | 'o365';
  query: CustomReportQuery;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  isPublic: boolean;
  category?: string;
  tags: string[];
  executionCount: number;
  lastExecuted?: string;
  averageExecutionTime?: number;
  dataSource?: string;
  lastRun?: string;
  avgTime?: number;
}

export interface CustomReportQuery {
  fields: ReportField[];
  filters: ReportFilter[];
  groupBy?: string;
  orderBy?: {
    field: string;
    direction: 'asc' | 'desc';
  }[];
  limit?: number;
}

export interface ReportField {
  name: string;
  displayName: string;
  type: 'string' | 'number' | 'boolean' | 'datetime' | 'array';
  category: string;
  isSelected?: boolean;
}

export interface ReportFilter {
  field: string;
  operator: 'equals' | 'notEquals' | 'contains' | 'notContains' | 'startsWith' | 'endsWith' | 'greaterThan' | 'lessThan' | 'greaterThanOrEqual' | 'lessThanOrEqual' | 'isEmpty' | 'isNotEmpty';
  value: string | number | boolean | null;
  dataType: 'string' | 'number' | 'boolean' | 'datetime';
  logic?: 'AND' | 'OR';
}

export interface ReportExecution {
  id: string;
  user_id?: number;
  template_id?: string;
  custom_template_id?: string;
  report_name?: string;
  template_name?: string;
  report_id?: string;
  source?: 'ad' | 'azure' | 'o365';
  executed_at: string;
  executedAt?: string;
  generated_at: string;
  started_at?: string;
  completed_at?: string;
  status: 'pending' | 'running' | 'completed' | 'error' | 'success';
  parameters?: Record<string, unknown>;
  result_count?: number;
  execution_time_ms?: number;
  executionTime?: number;
  error_message?: string;
  error_details?: Record<string, unknown>;
  file_path?: string;
  file_name?: string;
  file_size?: number;
  file_size_bytes?: number;
  export_format?: string;
  expires_at?: string;
  is_scheduled?: boolean;
  schedule_id?: string;
  download_count?: number;
  last_downloaded?: string;
  result?: ReportResult;
}

export interface ReportResult {
  id?: string;
  executionId?: string;
  reportName: string;
  source: string;
  executedAt: string;
  rowCount: number;
  executionTimeMs: number;
  totalCount?: number;
  data: Record<string, unknown>[];
  columns: string[];
  metadata?: {
    executionTime: number;
    rowCount: number;
    cached: boolean;
    dataSource: string;
    queryId?: string;
    source?: string;
    executedAt?: string;
    templateName?: string;
  };
}

// Field Discovery Types
export interface FieldMetadata {
  source: 'ad' | 'azure' | 'o365';
  fieldName: string;
  displayName: string;
  dataType: 'string' | 'number' | 'boolean' | 'datetime' | 'array';
  category: string;
  description?: string;
  isSearchable: boolean;
  isSortable: boolean;
  isExportable: boolean;
}

// API Response Types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  status?: number;
}

// Preview Response Types
export interface PreviewResponse<T = Record<string, unknown>> {
  success: boolean;
  data: {
    source: 'ad' | 'azure' | 'o365' | 'postgres';
    executionTime: number;
    testData: T[];
    rowCount: number;
    isTestRun: boolean;
    cached?: boolean;
    metadata?: PreviewMetadata;
  };
  error?: {
    code: string;
    message: string;
    details?: unknown;
    timestamp?: string;
  };
}

export interface PreviewMetadata {
  originalFormat: string;
  extractedDataLength: number;
  isArray: boolean;
  hasData: boolean;
  responseKeys?: string[];
  debugInfo?: Record<string, unknown>;
}

export interface PaginatedResponse<T = unknown> extends ApiResponse<T[]> {
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// UI Types
export interface ThemeConfig {
  primaryColor: string;
  darkMode: boolean;
  compactMode: boolean;
}

export interface TableColumn {
  key: string;
  title: string;
  dataIndex: string;
  width?: number;
  sorter?: boolean;
  filterable?: boolean;
  render?: (value: unknown, record: Record<string, unknown>) => React.ReactNode;
}

export interface FilterOption {
  label: string;
  value: string;
  count?: number;
}

export interface ChartData {
  name: string;
  value: number;
  color?: string;
}

// Schedule Types
export interface ReportSchedule {
  id: string;
  reportId: string;
  reportType: 'template' | 'custom';
  templateId?: string;
  customTemplateId?: string;
  parameters?: Record<string, string | number | boolean | string[]>;
  schedule: {
    frequency: 'daily' | 'weekly' | 'monthly';
    time: string;
    dayOfWeek?: number;
    dayOfMonth?: number;
  };
  recipients?: string[];
  exportFormat?: ExportFormat;
  isActive: boolean;
  lastRun?: string;
  nextRun?: string;
  createdBy: string;
  createdAt: string;
}

// Export Types
export type ExportFormat = 'excel' | 'csv' | 'pdf' | 'json';

export interface ExportOptions {
  includeCharts?: boolean;
  includeFilters?: boolean;
  customTitle?: string;
  visibleColumns?: string[];
}

export interface ExportRequest {
  reportId: string;
  format: ExportFormat;
  options?: ExportOptions;
}

// System Types
export interface HealthCheck {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  services: {
    database: 'ok' | 'error';
    redis: 'ok' | 'error';
    ldap: 'ok' | 'error';
    azure: 'ok' | 'error';
  };
}

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'degraded';
  responseTime?: number;
  message?: string;
  timestamp: string;
}

export interface SystemHealthMetrics {
  cpu: number;
  memory: number;
  disk: number;
  uptime: number;
}

// Logs Types
export interface AuditLog {
  _type?: 'audit';
  _timestamp?: string;
  id: string;
  event_type: string;
  event_action: string;
  user_id?: number;
  username?: string;
  ip_address?: string;
  user_agent?: string;
  session_id?: string;
  resource_type?: string;
  resource_id?: string;
  details?: Record<string, unknown>;
  success: boolean;
  error_message?: string;
  created_at: string;
}

export interface SystemLog {
  _type?: 'system';
  _timestamp?: string;
  id: string;
  level: string;
  message: string;
  timestamp: string;
  service?: string;
  module?: string;
  user_id?: number;
  request_id?: string;
  ip_address?: string;
  method?: string;
  url?: string;
  status_code?: number;
  duration_ms?: number;
  error_stack?: string;
  metadata?: Record<string, unknown>;
}

export interface FilterState {
  type?: 'audit' | 'system';
  search?: string;
  startDate?: string;
  endDate?: string;
}

// Notification Types
export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  priority: 1 | 2 | 3 | 4 | 5;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  category?: string;
  expiresAt?: string;
  source?: string;
  userId: number;
  isRead: boolean;
  isDismissed: boolean;
  createdAt: string;
}

export interface NotificationStats {
  total: number;
  unread: number;
  byPriority: Record<number, number>;
  byType: Record<string, number>;
}

export interface PaginatedNotifications {
  notifications: Notification[];
  total: number;
  page: number;
  pageSize: number;
}

// Enhanced Column Types for Data Tables
export interface EnhancedColumn<T = Record<string, unknown>> {
  dataIndex: string;
  title: string;
  enableFilter?: boolean;
  filterType?: 'text' | 'select' | 'dateRange';
  width?: number;
  sorter?: boolean;
  defaultSortOrder?: 'ascend' | 'descend';
  render?: (value: unknown, record: T, index: number) => React.ReactNode;
  filterOptions?: Array<{ label: string; value: string | number }>;
}

export interface EnhancedDataTableProps<T = Record<string, unknown>> {
  data: T[];
  columns: EnhancedColumn<T>[];
  loading?: boolean;
  title?: string;
  description?: string;
  formatCellValue?: (value: unknown, columnKey: string) => string;
  onPageChange?: (page: number, pageSize: number) => void;
  onSort?: (sortBy: string, sortOrder: 'asc' | 'desc') => void;
  onFilter?: (filters: Record<string, unknown>) => void;
  onExport?: (format: ExportFormat, visibleColumns?: string[]) => void;
  pageSize?: number;
  currentPage?: number;
  totalCount?: number;
  showExport?: boolean;
  customToolbarActions?: React.ReactNode;
}

export interface ColumnFilter {
  type: 'text' | 'select' | 'dateRange';
  value: string | string[] | [string, string];
}

// Credential Types
export interface ServiceCredential {
  id: number;
  userId: number;
  serviceType: 'ad' | 'azure' | 'o365';
  credentialName: string;
  username?: string;
  tenantId?: string;
  clientId?: string;
  isDefault: boolean;
  isActive: boolean;
  lastTested?: string;
  lastTestSuccess?: boolean;
  lastTestMessage?: string;
  createdAt: string;
  updatedAt: string;
  // Enhanced metadata for Azure credentials
  metadata?: {
    authType?: 'application' | 'delegated';
    multiTenant?: boolean;
    supportedTenants?: string[];
    allowUserContext?: boolean;
    allowedUsers?: string[];
    consentedScopes?: string[];
    defaultOrganizationId?: string;
  };
}

export interface CreateCredentialDto {
  serviceType: 'ad' | 'azure' | 'o365';
  credentialName: string;
  username?: string;
  password?: string;
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
  isDefault?: boolean;
  authType?: 'oauth' | 'app';
}

export interface UpdateCredentialDto {
  credentialName?: string;
  username?: string;
  password?: string;
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
  isDefault?: boolean;
  isActive?: boolean;
  authType?: 'oauth' | 'app';
}

export interface TestCredentialResult {
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
}

export interface DefaultCredentials {
  ad: ServiceCredential | null;
  azure: ServiceCredential | null;
  o365: ServiceCredential | null;
}

// Query Service Types
export interface QueryDefinition {
  id: string;
  name: string;
  description?: string;
  version?: string;
  dataSource: string;
  sql?: string;
  parameters?: QueryParameter[];
  resultMapping?: QueryResultMapping;
  access?: QueryAccess;
  cache?: QueryCache;
  constraints?: QueryConstraints;
  createdAt?: string;
  updatedAt?: string;
  // Custom fields for templates page
  isCustom?: boolean;
  category?: string;
  subcategory?: string;
  executionCount?: number;
  lastExecuted?: string;
  avgExecutionTime?: number;
  successRate?: number;
  tags?: string[];
}

export interface QueryParameter {
  name: string;
  displayName?: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object';
  required?: boolean;
  default?: unknown;
  defaultValue?: unknown;
  description?: string;
  options?: unknown[];
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    enum?: unknown[];
  };
  transform?: string;
}

export interface QueryResultMapping {
  fields?: ReportField[];
  fieldMappings?: Record<string, {
    targetField?: string;
    type?: string;
    transform?: string;
  }>;
  postProcess?: {
    filter?: unknown[];
    sort?: Array<{
      field: string;
      direction: 'asc' | 'desc';
    }>;
    limit?: number;
  };
}

export interface QueryAccess {
  requiresAuth?: boolean;
  roles?: string[];
  permissions?: string[];
}

export interface QueryCache {
  enabled?: boolean;
  ttlSeconds?: number;
  keyTemplate?: string;
}

export interface QueryConstraints {
  maxResults?: number;
  timeoutMs?: number;
  rateLimitPerMinute?: number;
}

export interface QueryExecutionResult {
  id?: string;
  queryId: string;
  executionId?: string;
  executedAt: string;
  executedBy?: string;
  cached?: boolean;
  success?: boolean;
  data?: Record<string, unknown>[];
  metadata?: {
    executionTime: number;
    rowCount: number;
    cached: boolean;
    dataSource: string;
  };
  result: {
    success: boolean;
    data: Record<string, unknown>[];
    metadata: {
      executionTime: number;
      rowCount: number;
      cached: boolean;
      dataSource: string;
    };
    error?: {
      message: string;
      code?: string;
      details?: Record<string, unknown>;
    };
  };
  isPreview?: boolean; // Indicates if this is a preview execution (no history saved)
}

export interface QueryValidationResult {
  isValid: boolean;
  errors?: string[];
  warnings?: string[];
  suggestions?: string[];
}

export interface QueryHealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  message?: string;
  components: Record<string, {
    status: 'healthy' | 'unhealthy' | 'degraded';
    latency?: number;
    error?: string;
  }>;
  dataSources: Record<string, {
    status: 'healthy' | 'unhealthy';
    lastCheck: string;
    error?: string;
  }>;
  cache: {
    status: 'healthy' | 'unhealthy';
    size: number;
    hitRate: number;
  };
  timestamp: string;
}

export interface QueryStatistics {
  queryId?: string;
  executionCount: number;
  averageExecutionTime: number;
  cacheHitRate: number;
  lastExecuted?: string;
  errorRate: number;
  p95ExecutionTime?: number;
  p99ExecutionTime?: number;
}

export interface QueryMetrics {
  totalQueries: number;
  activeQueries: number;
  queuedQueries: number;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  errorCount: number;
  cacheSize: number;
  cacheHits: number;
  avgExecutionTime: number;
  uptime: number;
  throughput?: number;
}

// Graph API Query Definition
export interface GraphQueryDefinition {
  // Base properties from QueryDefinition (without parameters)
  id: string;
  name: string;
  description?: string;
  version?: string;
  dataSource: string;
  sql?: string;
  resultMapping?: QueryResultMapping;
  access?: QueryAccess;
  cache?: QueryCache;
  constraints?: QueryConstraints;
  createdAt?: string;
  updatedAt?: string;
  // Custom fields for templates page
  isCustom?: boolean;
  category?: string;
  subcategory?: string;
  executionCount?: number;
  lastExecuted?: string;
  avgExecutionTime?: number;
  successRate?: number;
  tags?: string[];
  // Graph-specific properties
  query: {
    endpoint: string;
    method?: 'GET' | 'POST';
    select?: string[];
    expand?: string[];
    filter?: string;
    orderBy?: string;
    top?: number;
    skip?: number;
    count?: boolean;
    search?: string;
    headers?: Record<string, string>;
    body?: Record<string, unknown>;
  };
  parameters?: Record<string, {
    type: 'string' | 'number' | 'boolean' | 'select' | 'multiselect';
    required?: boolean;
    default?: unknown;
    description?: string;
    displayName?: string;
    options?: string[];
    transform?: string;
    validation?: {
      pattern?: string;
      min?: number;
      max?: number;
      message?: string;
    };
  }>;
  postProcess?: {
    filter?: Record<string, unknown>;
    sort?: { field: string; direction: 'asc' | 'desc' };
    limit?: number;
    transform?: string;
  };
  fieldMappings?: Record<string, {
    displayName: string;
    type?: string;
    transform?: string;
  }>;
}

export interface DynamicQuerySpec {
  dataSource: string;
  select: string[];
  from: string;
  where?: Array<{
    field: string;
    operator: string;
    value: unknown;
    logic?: 'AND' | 'OR';
  }>;
  joins?: Array<{
    type: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';
    table: string;
    on: string;
  }>;
  groupBy?: string[];
  having?: string;
  orderBy?: {
    field: string;
    direction: 'asc' | 'desc';
  };
  limit?: number;
  offset?: number;
}