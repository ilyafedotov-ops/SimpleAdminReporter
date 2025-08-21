/* eslint-disable @typescript-eslint/no-explicit-any */
import { 
  ApiResponse, 
  PaginatedResponse, 
  QueryDefinition, 
  QueryExecutionResult,
  PreviewResponse
} from '@/types';
import { 
  ReportTemplate, 
  CustomReportTemplate, 
  CustomReportQuery,
  ReportExecution, 
  ReportResult,
  FieldMetadata,
  ExportRequest,
  ExportFormat,
  ReportSchedule,
  QueryHealthStatus,
  QueryStatistics,
  QueryMetrics,
  DynamicQuerySpec
} from '@/types';
import apiService from './api';
import queryService from './queryService';

export class ReportsService {

  // Pre-built Report Templates - Now returns QueryDefinitions
  async getReportTemplates(options?: { category?: string; source?: string; _t?: number } | undefined): Promise<ApiResponse<{ definitions: QueryDefinition[]; totalCount: number }>> {
    let params: any = {};
    
    if (options) {
      // Handle object with multiple parameters
      if (options.category) params.category = options.category;
      if (options.source) params.source = options.source;
      if (options._t) params._t = options._t;
    }
    
    // For Azure category, also fetch Graph queries
    if (options?.category === 'azure' || options?.source === 'azure') {
      // Get both regular templates and Graph queries
      const [templatesResponse, graphResponse] = await Promise.all([
        apiService.get('/reports/templates', params),
        queryService.getGraphDefinitions()
      ]);
      
      if (templatesResponse.success && graphResponse.success && templatesResponse.data && graphResponse.data) {
        // Merge Graph queries into the response
        const graphDefinitions = ((graphResponse.data as any).queries || []).map((q: any) => ({
          ...q,
          dataSource: 'azure',
          isSystem: true,
          version: '1.0.0'
        }));
        
        return {
          success: true,
          data: {
            definitions: [...((templatesResponse.data as any).definitions || []), ...graphDefinitions],
            totalCount: ((templatesResponse.data as any).totalCount || 0) + graphDefinitions.length
          }
        };
      }
    }
    
    return apiService.get('/reports/templates', params);
  }

  async getReportTemplate(id: string): Promise<ApiResponse<ReportTemplate>> {
    return apiService.get(`/reports/templates/${id}`);
  }

  async executeReport(
    templateId: string, 
    parameters?: Record<string, string | number | boolean | string[]>,
    credentialId?: number
  ): Promise<ApiResponse<QueryExecutionResult>> {
    // Check if this is a Graph query
    if (templateId.startsWith('graph_')) {
      // Use Graph API query execution
      return queryService.executeGraphQuery(templateId, parameters, {
        saveHistory: true
      });
    }
    
    // Use the reports endpoint which saves to history
    const response = await apiService.post(`/reports/execute/${templateId}`, {
      parameters: parameters || {},
      credentialId,
      format: 'json'
    });
    
    // Transform the response to match QueryExecutionResult format
    if (response.success && ((response as any).data)) {
      const data = ((response as any).data) as any;
      return {
        success: true,
        data: {
          queryId: templateId,
          executionId: data.executionId,
          executedAt: data.executedAt,
          result: {
            success: true,
            data: data.data || [],
            metadata: {
              rowCount: data.totalCount || (data.data?.length || 0),
              executionTime: data.executionTime || 0,
              cached: false,
              dataSource: data.category || 'unknown'
            }
          },
          cached: false
        }
      };
    }
    
    return response as ApiResponse<QueryExecutionResult>;
  }

  // Custom Report Templates
  async getCustomReports(params?: {
    page?: number;
    pageSize?: number;
    category?: string;
    source?: 'ad' | 'azure' | 'o365';
    isPublic?: boolean;
    search?: string;
  }): Promise<PaginatedResponse<CustomReportTemplate>> {
    return apiService.getPaginated('/reports/custom', params);
  }

  async getCustomReport(id: string): Promise<ApiResponse<CustomReportTemplate>> {
    return apiService.get(`/reports/custom/${id}`);
  }

  async createCustomReport(report: {
    name: string;
    description: string;
    source: 'ad' | 'azure' | 'o365';
    query: CustomReportQuery;
    isPublic?: boolean;
    category?: string;
    tags?: string[];
  }): Promise<ApiResponse<CustomReportTemplate>> {
    return apiService.post('/reports/custom', report);
  }

  async updateCustomReport(
    id: string, 
    report: Partial<CustomReportTemplate>
  ): Promise<ApiResponse<CustomReportTemplate>> {
    return apiService.put(`/reports/custom/${id}`, report);
  }

  async deleteCustomReport(id: string): Promise<ApiResponse> {
    return apiService.delete(`/reports/custom/${id}`);
  }

  async executeCustomReport(
    id: string, 
    parameters?: Record<string, string | number | boolean | string[]>,
    credentialId?: number
  ): Promise<ApiResponse<ReportResult>> {
    // Use the custom reports endpoint which saves to history
    const response = await apiService.post(`/reports/custom/${id}/execute`, {
      parameters: parameters || {},
      credentialId,
      format: 'json'
    });
    
    // Transform the response to match ReportResult format
    if (response.success && ((response as any).data)) {
      const data = ((response as any).data) as any;
      return {
        success: true,
        data: {
          executionId: data.executionId,
          reportName: data.reportName,
          source: data.source,
          executedAt: data.executedAt,
          rowCount: data.totalCount || (data.data?.length || 0),
          executionTimeMs: data.executionTime || 0,
          data: data.data || [],
          columns: data.data?.length > 0 
            ? Object.keys(data.data[0]) 
            : []
        }
      };
    }
    
    return {
      success: false,
      error: response.error || 'Custom report execution failed'
    };
  }

  async previewTemplate<T = Record<string, unknown>>(
    templateId: string,
    parameters?: Record<string, unknown>,
    limit?: number
  ): Promise<PreviewResponse<T>> {
    // Call the new template preview endpoint
    const response = await apiService.post(`/reports/templates/${templateId}/preview`, {
      parameters: parameters || {},
      limit: limit || 10
    });

    // Transform ApiResponse to PreviewResponse if needed
    if (response.success && response.data) {
      return response as PreviewResponse<T>;
    }

    // Handle error case
    return {
      success: false,
      data: {
        source: 'unknown',
        executionTime: 0,
        testData: [],
        rowCount: 0,
        isTestRun: true
      },
      error: {
        code: 'PREVIEW_ERROR',
        message: response.error || 'Template preview failed',
        timestamp: new Date().toISOString()
      }
    };
  }

  async previewCustomReport<T = Record<string, unknown>>(
    reportId: string,
    parameters?: Record<string, unknown>,
    limit?: number
  ): Promise<PreviewResponse<T>> {
    // Call the custom report preview endpoint
    const response = await apiService.post(`/reports/custom/${reportId}/preview`, {
      parameters: parameters || {},
      limit: limit || 10
    });

    // Transform ApiResponse to PreviewResponse if needed
    if (response.success && response.data) {
      return response as PreviewResponse<T>;
    }

    // Handle error case
    return {
      success: false,
      data: {
        source: 'unknown',
        executionTime: 0,
        testData: [],
        rowCount: 0,
        isTestRun: true
      },
      error: {
        code: 'PREVIEW_ERROR',
        message: response.error || 'Custom report preview failed',
        timestamp: new Date().toISOString()
      }
    };
  }

  async testCustomQuery<T = Record<string, unknown>>(
    query: CustomReportQuery, 
    source: 'ad' | 'azure' | 'o365', 
    parameters?: Record<string, unknown>, 
    limit?: number
  ): Promise<PreviewResponse<T>> {
    // Call the backend test endpoint directly
    const response = await apiService.post('/reports/custom/test', {
      source,
      query,
      parameters: parameters || {},
      limit: limit || 1000
    });

    // Transform ApiResponse to PreviewResponse if needed
    if (response.success && response.data) {
      return response as PreviewResponse<T>;
    }

    // Handle error case
    return {
      success: false,
      data: {
        source,
        executionTime: 0,
        testData: [],
        rowCount: 0,
        isTestRun: true
      },
      error: {
        code: 'PREVIEW_ERROR',
        message: response.error || 'Preview failed',
        timestamp: new Date().toISOString()
      }
    };
  }

  // Template Gallery
  async getTemplateGallery(params?: {
    page?: number;
    pageSize?: number;
    category?: string;
    source?: 'ad' | 'azure' | 'o365';
    tags?: string[];
    sortBy?: 'name' | 'executionCount' | 'createdAt';
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedResponse<CustomReportTemplate>> {
    return apiService.getPaginated('/reports/custom/templates', params);
  }

  async cloneTemplate(id: string, newName: string): Promise<ApiResponse<CustomReportTemplate>> {
    return apiService.post(`/reports/custom/${id}/clone`, { name: newName });
  }

  // Field Discovery
  async getAvailableFields(source: 'ad' | 'azure' | 'o365'): Promise<ApiResponse<{
    source: string;
    categories?: any[];
    fields?: FieldMetadata[];
    totalFields?: number;
    totalCount?: number;
  }>> {
    // Use new query schema endpoint
    const response = await queryService.getSchema(source);
    
    if (response.success && ((response as any).data)) {
      // Map schema to field metadata format
      const fields: FieldMetadata[] = [];
      const categoriesMap = new Map<string, FieldMetadata[]>();
      
      // Process fields from schema
      if (((response as any).data)?.fields) {
        ((response as any).data).fields.forEach((field: any) => {
          const fieldMeta: FieldMetadata = {
            source: source,
            fieldName: field.name || field.fieldName,
            displayName: field.displayName || field.name || field.fieldName,
            dataType: this.mapFieldType(field.type || field.dataType),
            category: field.category || 'General',
            description: field.description,
            isSearchable: field.searchable !== false,
            isSortable: field.sortable !== false,
            isExportable: field.exportable !== false
          };
          
          fields.push(fieldMeta);
          
          // Group by category
          const category = fieldMeta.category;
          if (!categoriesMap.has(category)) {
            categoriesMap.set(category, []);
          }
          const categoryFields = categoriesMap.get(category);
          if (categoryFields) {
            categoryFields.push(fieldMeta);
          }
        });
      }
      
      // Convert categories map to array format
      const categories = Array.from(categoriesMap.entries()).map(([name, fields]) => ({
        name,
        fields,
        count: fields.length
      }));
      
      return {
        success: true,
        data: {
          source,
          categories,
          fields,
          totalFields: fields.length,
          totalCount: fields.length
        }
      };
    }
    
    return {
      success: false,
      error: response.error || 'Failed to fetch schema'
    };
  }
  
  // Helper method to map field types
  private mapFieldType(type: string): 'string' | 'number' | 'boolean' | 'datetime' | 'array' {
    switch (type?.toLowerCase()) {
      case 'string':
      case 'text':
      case 'varchar':
        return 'string';
      case 'number':
      case 'int':
      case 'integer':
      case 'float':
      case 'decimal':
        return 'number';
      case 'boolean':
      case 'bool':
        return 'boolean';
      case 'date':
      case 'datetime':
      case 'timestamp':
        return 'datetime';
      case 'array':
      case 'list':
        return 'array';
      default:
        return 'string';
    }
  }

  async searchFields(
    source: 'ad' | 'azure' | 'o365',
    search: string,
    category?: string
  ): Promise<ApiResponse<FieldMetadata[]>> {
    // Get all fields from schema and filter client-side
    const response = await this.getAvailableFields(source);
    
    if (response.success && ((response as any).data)) {
      let fields = ((response as any).data).fields || [];
      
      // Filter by search term
      if (search) {
        const searchLower = search.toLowerCase();
        fields = fields.filter(field => 
          field.fieldName.toLowerCase().includes(searchLower) ||
          field.displayName.toLowerCase().includes(searchLower) ||
          (field.description && field.description.toLowerCase().includes(searchLower))
        );
      }
      
      // Filter by category
      if (category) {
        fields = fields.filter(field => field.category === category);
      }
      
      return {
        success: true,
        data: fields
      };
    }
    
    return {
      success: false,
      error: response.error || 'Failed to search fields'
    };
  }

  async getFieldCategories(source: 'ad' | 'azure' | 'o365'): Promise<ApiResponse<string[]>> {
    // Get all fields and extract unique categories
    const response = await this.getAvailableFields(source);
    
    if (response.success && ((response as any).data)) {
      const categories = ((response as any).data).categories?.map(cat => cat.name) || [];
      
      // If no categories from structured data, extract from fields
      if (categories.length === 0 && ((response as any).data).fields) {
        const uniqueCategories = new Set<string>();
        ((response as any).data).fields.forEach(field => {
          if (field.category) {
            uniqueCategories.add(field.category);
          }
        });
        categories.push(...Array.from(uniqueCategories).sort());
      }
      
      return {
        success: true,
        data: categories
      };
    }
    
    return {
      success: false,
      error: response.error || 'Failed to fetch field categories'
    };
  }

  // Report History
  async getReportHistory(params?: {
    page?: number;
    pageSize?: number;
    status?: 'pending' | 'running' | 'completed' | 'failed';
    source?: 'ad' | 'azure' | 'o365';
    dateFrom?: string;
    dateTo?: string;
  }): Promise<PaginatedResponse<ReportExecution>> {
    return apiService.getPaginated('/reports/history', params);
  }

  async getReportExecution(id: string): Promise<ApiResponse<ReportExecution>> {
    return apiService.get(`/reports/history/${id}`);
  }

  async getReportResults(id: string): Promise<ApiResponse<{
    historyId: string;
    results: any[];
    resultCount: number;
    createdAt: string;
    expiresAt: string;
  }>> {
    return apiService.get(`/reports/history/${id}/results`);
  }

  async downloadReportResult(id: string, format: 'excel' | 'csv' | 'pdf' | 'json'): Promise<void> {
    await apiService.downloadFile(`/reports/export/history/${id}?format=${format}`);
  }

  async exportHistoryResults(historyId: string, format: 'excel' | 'csv' = 'excel', visibleColumns?: string[]): Promise<void> {
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        throw new Error('No authentication token found');
      }

      // Build query parameters
      const params = new URLSearchParams();
      params.append('format', format);
      if (visibleColumns && visibleColumns.length > 0) {
        params.append('visibleColumns', visibleColumns.join(','));
      }

      const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/reports/export/history/${historyId}?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      // Get filename from Content-Disposition header
      const contentDisposition = response.headers.get('Content-Disposition');
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
      const filename = filenameMatch ? filenameMatch[1] : `report_${historyId}.${format === 'excel' ? 'xlsx' : 'csv'}`;

      // Download the file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export error:', error);
      throw error;
    }
  }

  async deleteReportExecution(id: string): Promise<ApiResponse> {
    return apiService.delete(`/reports/history/${id}`);
  }

  // Export Functions
  async exportReport(request: ExportRequest): Promise<ApiResponse<{ downloadUrl: string }>> {
    return apiService.post('/reports/export', request);
  }

  async exportReportData(reportResult: ReportResult, format: ExportFormat): Promise<Blob> {
    // Create export data based on format
    const data = reportResult.data || [];
    const columns = data.length > 0 ? Object.keys(data[0]) : [];
    
    if (format === 'csv') {
      // Generate CSV
      const headers = columns.join(',');
      const rows = data.map(row => 
        columns.map(col => {
          const value = row[col];
          // Escape quotes and wrap in quotes if contains comma or newline
          const stringValue = String(value ?? '');
          if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
            return `"${stringValue.replace(/"/g, '""')}"`;
          }
          return stringValue;
        }).join(',')
      );
      const csv = [headers, ...rows].join('\n');
      return new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    } else if (format === 'excel') {
      // For Excel, we would typically use a library like SheetJS
      // For now, return CSV with Excel mime type
      const headers = columns.join(',');
      const rows = data.map(row => 
        columns.map(col => {
          const value = row[col];
          const stringValue = String(value ?? '');
          if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
            return `"${stringValue.replace(/"/g, '""')}"`;
          }
          return stringValue;
        }).join(',')
      );
      const csv = [headers, ...rows].join('\n');
      return new Blob([csv], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    } else {
      throw new Error(`Unsupported export format: ${format}`);
    }
  }

  async exportCustomReport(
    reportId: string, 
    format: 'excel' | 'csv' | 'pdf',
    _options?: {
      includeCharts?: boolean;
      includeFilters?: boolean;
      customTitle?: string;
    }
  ): Promise<void> {
    // params would be used here if the API supported query parameters
    // const params = { format, ...options };
    // Map export format to correct file extension
    const extension = format === 'excel' ? 'xlsx' : format;
    await apiService.downloadFile(
      `/reports/custom/${reportId}/export`,
      `report-${reportId}.${extension}`
    );
  }

  // Bulk Operations
  async bulkDeleteReports(ids: string[]): Promise<ApiResponse> {
    try {
      const response = await (apiService as any).client.delete('/reports/history/bulk', {
        data: { ids }
      });
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to bulk delete reports');
    }
  }

  async bulkExportReports(
    ids: string[], 
    format: 'excel' | 'csv' | 'pdf'
  ): Promise<ApiResponse<{ downloadUrl: string }>> {
    return apiService.post('/reports/custom/bulk-export', { ids, format });
  }

  // Report Statistics
  async getReportStats(): Promise<ApiResponse<{
    totalReports: number;
    totalCustomReports: number;
    totalExecutions: number;
    recentExecutions: ReportExecution[];
    popularReports: ReportTemplate[];
    reportsBySource: Record<string, number>;
    executionsByStatus: Record<string, number>;
  }>> {
    return apiService.get('/reports/stats');
  }

  async getUserReportStats(userId?: string): Promise<ApiResponse<{
    totalReports: number;
    totalExecutions: number;
    favoriteReports: CustomReportTemplate[];
    recentActivity: ReportExecution[];
  }>> {
    const params = userId ? { userId } : undefined;
    return apiService.get('/reports/stats/user', params);
  }

  // Favorites
  async addToFavorites(reportId: string, isCustom: boolean = false): Promise<ApiResponse> {
    const body = isCustom ? { customTemplateId: reportId } : { templateId: reportId };
    return apiService.post('/reports/favorites', body);
  }

  async removeFromFavorites(reportId: string, isCustom: boolean = false): Promise<ApiResponse> {
    return apiService.delete(`/reports/favorites/${reportId}?isCustom=${isCustom}`);
  }

  async getFavoriteReports(): Promise<ApiResponse<any[]>> {
    return apiService.get('/reports/favorites');
  }

  // Sharing
  async shareReport(
    reportId: string, 
    users: string[], 
    permissions: ('read' | 'write' | 'execute')[]
  ): Promise<ApiResponse> {
    return apiService.post(`/reports/custom/${reportId}/share`, { users, permissions });
  }

  async getSharedReports(): Promise<ApiResponse<CustomReportTemplate[]>> {
    return apiService.get('/reports/shared');
  }

  async revokeReportAccess(reportId: string, userId: string): Promise<ApiResponse> {
    return apiService.delete(`/reports/custom/${reportId}/share/${userId}`);
  }

  // Scheduling (if implemented)
  async scheduleReport(
    reportId: string,
    schedule: {
      name: string;
      cronExpression: string;
      timezone: string;
      recipients: string[];
      format: 'excel' | 'csv' | 'pdf';
      isActive: boolean;
    }
  ): Promise<ApiResponse> {
    return apiService.post(`/reports/custom/${reportId}/schedule`, schedule);
  }

  async getScheduledReports(): Promise<ApiResponse<ReportSchedule[]>> {
    return apiService.get('/reports/schedules');
  }

  async updateSchedule(scheduleId: string, schedule: Partial<ReportSchedule>): Promise<ApiResponse> {
    return apiService.put(`/reports/schedules/${scheduleId}`, schedule);
  }

  async deleteSchedule(scheduleId: string): Promise<ApiResponse> {
    return apiService.delete(`/reports/schedules/${scheduleId}`);
  }

  // Query Service Health & Metrics
  async getQueryHealth(): Promise<ApiResponse<QueryHealthStatus>> {
    return queryService.getHealth();
  }

  async getQueryStats(queryId?: string): Promise<ApiResponse<QueryStatistics>> {
    return queryService.getStats(queryId);
  }

  async getQueryMetrics(): Promise<ApiResponse<QueryMetrics>> {
    return queryService.getMetrics();
  }

  async clearQueryCache(queryId?: string): Promise<ApiResponse<{
    cleared: boolean;
    entriesCleared: number;
  }>> {
    return queryService.clearCache(queryId);
  }

  // Dynamic Query Builder
  async buildDynamicQuery(querySpec: DynamicQuerySpec): Promise<ApiResponse<QueryExecutionResult>> {
    return queryService.build(querySpec);
  }

  async executeDynamicQuery(
    source: 'ad' | 'azure' | 'o365',
    query: {
      fields: string[];
      filters?: Array<{
        field: string;
        operator: string;
        value: any;
        logic?: 'AND' | 'OR';
      }>;
      orderBy?: {
        field: string;
        direction: 'asc' | 'desc';
      };
      limit?: number;
    }
  ): Promise<ApiResponse<ReportResult>> {
    // Build dynamic query specification
    const querySpec: DynamicQuerySpec = {
      dataSource: source,
      select: query.fields,
      from: this.getTableForSource(source),
      where: query.filters,
      orderBy: query.orderBy,
      limit: query.limit || 100
    };

    // Execute dynamic query
    const response = await this.buildDynamicQuery(querySpec);
    
    if (response.success && ((response as any).data)) {
      const queryResult = ((response as any).data);
      return {
        success: true,
        data: {
          reportName: 'Dynamic Query',
          source: queryResult.result?.metadata?.dataSource || source,
          executedAt: queryResult.executedAt || new Date().toISOString(),
          rowCount: queryResult.result?.metadata?.rowCount || queryResult.result?.data?.length || 0,
          executionTimeMs: queryResult.result?.metadata?.executionTime || 0,
          data: queryResult.result?.data || [],
          columns: queryResult.result?.data?.length > 0 
            ? Object.keys((queryResult.result?.data as any[])[0]) 
            : query.fields
        }
      };
    }
    
    return {
      success: false,
      error: response.error || 'Dynamic query execution failed'
    };
  }

  // Helper methods for query building

  private getTableForSource(source: string): string {
    // Map data source to table name
    switch (source.toLowerCase()) {
      case 'ad':
        return 'users'; // This would need to be adjusted based on actual LDAP queries
      case 'azure':
        return 'azure_users';
      case 'o365':
        return 'o365_data';
      default:
        return 'data';
    }
  }



}

export const reportsService = new ReportsService();
export default reportsService;