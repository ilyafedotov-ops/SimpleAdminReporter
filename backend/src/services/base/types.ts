export interface ConnectionOptions {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  domain?: string;
  baseDN?: string;
  secure?: boolean;
  timeout?: number;
  [key: string]: any;
}

export interface ConnectionPool {
  maxSize: number;
  minSize: number;
  idleTimeout: number;
  connectionTimeout: number;
}

export interface ConnectionStatus {
  connected: boolean;
  lastCheck: Date | null;
  error: string | null;
}

export interface DataSourceCredentials {
  id: number;
  userId: number;
  serviceType: 'ad' | 'azure' | 'o365';
  username: string;
  encryptedPassword: string;
  salt: string;
  domain?: string;
  tenantId?: string;
  clientId?: string;
  encryptedClientSecret?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserContext {
  id: number;
  email: string;
  name: string;
  roles?: string[];
}

export interface ServiceCredentials {
  username: string;
  password: string;
  domain?: string;
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
}

export type DataSourceType = 'ad' | 'azure' | 'o365' | 'postgres';

export interface QueryContext {
  user?: UserContext;
  useSystemCredentials?: boolean;
  credentials?: ServiceCredentials;
  requestId?: string;
  startTime?: Date;
}

export interface CacheOptions {
  ttl?: number;
  key?: string;
  invalidateOn?: string[];
}

export interface MetricsData {
  queryCount: number;
  totalExecutionTime: number;
  averageExecutionTime: number;
  cacheHitRate: number;
  errorRate: number;
  lastExecuted: Date | null;
}