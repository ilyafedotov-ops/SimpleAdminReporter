/* eslint-disable @typescript-eslint/no-explicit-any */
import { ApiResponse } from '@/types';
import apiService from './api';
import { ApiPriority } from '@/utils/apiQueue';

export interface GraphFieldMetadata {
  name: string;
  displayName: string;
  type: string;
  description?: string;
  category?: string;
  isSearchable?: boolean;
  isSortable?: boolean;
  isFilterable?: boolean;
  isExpanded?: boolean;
  expandedType?: string;
  possibleValues?: string[];
}

export interface GraphQueryTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  endpoint: string;
  requiredScopes: string[];
  parameters?: Record<string, any>;
  fields?: string[];
  filters?: Record<string, unknown>[];
}

export interface GraphExecutionResult {
  id: string;
  queryId: string;
  userId: number;
  executedAt: string;
  parameters: Record<string, any>;
  resultCount: number;
  executionTimeMs: number;
  status: 'success' | 'error';
  error?: string;
  data?: Record<string, unknown>[];
}

/**
 * Graph API Service - Direct access to Graph API endpoints
 */
class GraphService {
  /**
   * Get available Graph query templates
   */
  async getTemplates(): Promise<ApiResponse<{
    templates: GraphQueryTemplate[];
    total: number;
  }>> {
    return apiService.get('/graph/templates', undefined, {
      useCache: true,
      cacheTTL: 300, // 5 minutes
      priority: ApiPriority.NORMAL
    });
  }

  /**
   * Execute a Graph query
   * @param queryId - The Graph query ID to execute
   * @param parameters - Query parameters
   * @param credentialId - Optional credential ID
   */
  async executeQuery(
    queryId: string,
    parameters?: Record<string, any>,
    credentialId?: number
  ): Promise<ApiResponse<GraphExecutionResult>> {
    return apiService.post(`/graph/execute/${queryId}`, {
      parameters,
      credentialId
    });
  }

  /**
   * Execute multiple Graph queries in batch
   * @param queries - Array of queries to execute
   */
  async executeBatch(
    queries: Array<{
      queryId: string;
      parameters?: Record<string, any>;
    }>
  ): Promise<ApiResponse<{
    results: GraphExecutionResult[];
    totalQueries: number;
    successCount: number;
  }>> {
    return apiService.post('/graph/batch', { queries });
  }

  /**
   * Discover available fields for a Graph entity type
   * @param entityType - The entity type (users, groups, devices, etc.)
   * @param credentialId - Optional credential ID for user-specific discovery
   */
  async discoverFields(
    entityType: string,
    credentialId?: number
  ): Promise<ApiResponse<{
    entityType: string;
    fields: GraphFieldMetadata[];
    totalFields: number;
  }>> {
    const params = credentialId ? { credentialId } : undefined;
    return apiService.get(`/graph/fields/${entityType}`, params, {
      useCache: true,
      cacheTTL: 600, // 10 minutes
      priority: ApiPriority.HIGH
    });
  }

  /**
   * Search fields for a Graph entity type
   * @param entityType - The entity type
   * @param search - Search term
   */
  async searchFields(
    entityType: string,
    search: string
  ): Promise<ApiResponse<{
    entityType: string;
    fields: GraphFieldMetadata[];
    searchTerm: string;
  }>> {
    return apiService.get(`/graph/fields/${entityType}/search`, { search });
  }

  /**
   * Get Graph query execution history
   * @param limit - Number of records to return
   * @param offset - Offset for pagination
   */
  async getHistory(
    limit?: number,
    offset?: number
  ): Promise<ApiResponse<{
    executions: GraphExecutionResult[];
    total: number;
    limit: number;
    offset: number;
  }>> {
    const params = {
      limit: limit || 50,
      offset: offset || 0
    };
    return apiService.get('/graph/history', params);
  }

  /**
   * Get specific execution details
   * @param executionId - The execution ID
   */
  async getExecution(executionId: string): Promise<ApiResponse<GraphExecutionResult>> {
    return apiService.get(`/graph/history/${executionId}`);
  }

  /**
   * Get available entity types for Graph API
   */
  async getEntityTypes(): Promise<ApiResponse<string[]>> {
    // Common Graph API entity types
    return {
      success: true,
      data: [
        'users',
        'groups',
        'devices',
        'applications',
        'servicePrincipals',
        'directoryRoles',
        'domains',
        'licenses',
        'organization',
        'policies'
      ]
    };
  }

  /**
   * Convert Graph query to Azure AD field format for compatibility
   */
  async convertFieldsToAzureFormat(fields: GraphFieldMetadata[]): Promise<Record<string, unknown>[]> {
    return fields.map(field => ({
      fieldName: field.name,
      displayName: field.displayName,
      dataType: this.mapGraphTypeToAzureType(field.type),
      category: field.category || 'General',
      description: field.description,
      isSearchable: field.isSearchable !== false,
      isSortable: field.isSortable !== false,
      isExportable: true,
      source: 'azure'
    }));
  }

  private mapGraphTypeToAzureType(graphType: string): string {
    const typeMap: Record<string, string> = {
      'Edm.String': 'string',
      'Edm.Boolean': 'boolean',
      'Edm.Int32': 'number',
      'Edm.Int64': 'number',
      'Edm.DateTime': 'datetime',
      'Edm.DateTimeOffset': 'datetime',
      'Collection': 'array',
      'ComplexType': 'object'
    };
    
    return typeMap[graphType] || 'string';
  }

  /**
   * Store Azure AD credentials for the current session
   * @param credentials - The Azure AD credentials from OAuth flow
   */
  async storeSessionCredentials(credentials: {
    accessToken: string;
    refreshToken?: string;
    expiresAt: number;
    userInfo: Record<string, unknown>;
  }): Promise<ApiResponse<{ credentialId: number }>> {
    return apiService.post('/auth/azure/store-credentials', {
      credentials,
      serviceType: 'azure'
    });
  }
}

// Create singleton instance
export const graphService = new GraphService();
export default graphService;