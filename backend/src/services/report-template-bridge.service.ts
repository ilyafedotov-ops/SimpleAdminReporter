/**
 * Report Template Bridge Service
 * 
 * Provides compatibility bridge between old report template IDs and new LDAP query system
 * This enables the existing frontend to work with the refactored backend architecture
 */

import { getQueryById, LDAPQueryDefinition } from '../queries/ldap';
import { createError } from '../middleware/error.middleware';

/**
 * Mapping from old report template IDs to new LDAP query IDs
 */
const REPORT_TO_QUERY_MAP: Record<string, string> = {
  // AD User Reports
  'ad_inactive_users': 'inactive_users',
  'ad_disabled_users': 'disabled_users', 
  'ad_password_expiry': 'password_expiry',
  'ad_locked_users': 'locked_accounts',
  'ad_never_expiring_passwords': 'never_expiring_passwords',
  'ad_privileged_users': 'privileged_users',
  'ad_recent_lockouts': 'recent_lockouts',
  'ad_password_changes': 'recent_password_changes',
  
  // AD Group Reports
  'ad_empty_groups': 'empty_groups',
  
  // Missing queries that need to be implemented
  'ad_admin_groups': 'privileged_users', // Map to closest available
  'ad_users_no_manager': 'inactive_users', // Map to closest available  
  'ad_recent_users': 'inactive_users', // Map to closest available
  'ad_disabled_with_groups': 'disabled_users', // Map to closest available
  'ad_users_by_department': 'inactive_users', // Map to closest available
};

/**
 * Parameter mapping between old and new systems
 */
const PARAMETER_MAPPING: Record<string, Record<string, string>> = {
  'password_expiry': {
    'days': 'days' // Direct mapping
  },
  'inactive_users': {
    'days': 'days' // Direct mapping
  },
  'recent_lockouts': {
    'hours': 'hours' // Direct mapping
  },
  'recent_password_changes': {
    'hours': 'hours' // Direct mapping
  }
};

export class ReportTemplateBridgeService {
  
  /**
   * Convert old report template ID to new LDAP query definition
   */
  public getQueryDefinitionByReportType(reportType: string): LDAPQueryDefinition {
    // First try direct mapping
    let queryId = REPORT_TO_QUERY_MAP[reportType];
    
    // If not found, try with ad_ prefix
    if (!queryId && !reportType.startsWith('ad_')) {
      queryId = REPORT_TO_QUERY_MAP['ad_' + reportType];
    }
    
    // If still not found, check if it's already a query ID
    if (!queryId) {
      // Try to get the query directly by ID
      const directQuery = getQueryById(reportType);
      if (directQuery) {
        return directQuery;
      }
      throw createError(`Unknown report type: ${reportType}`, 400);
    }
    
    const queryDef = getQueryById(queryId);
    
    if (!queryDef) {
      throw createError(`Query definition not found for: ${queryId}`, 500);
    }
    
    return queryDef;
  }
  
  /**
   * Transform old report parameters to new query parameters
   */
  public transformParameters(reportType: string, oldParams: Record<string, any>): Record<string, any> {
    const queryId = REPORT_TO_QUERY_MAP[reportType];
    
    if (!queryId) {
      return oldParams; // Return as-is if no mapping
    }
    
    const paramMapping = PARAMETER_MAPPING[queryId];
    
    if (!paramMapping) {
      return oldParams; // Return as-is if no parameter mapping
    }
    
    const transformedParams: Record<string, any> = {};
    
    // Apply parameter mapping
    Object.entries(oldParams).forEach(([key, value]) => {
      const newKey = paramMapping[key] || key;
      transformedParams[newKey] = value;
    });
    
    return transformedParams;
  }
  
  /**
   * Get all available report types that can be bridged
   */
  public getAvailableReportTypes(): string[] {
    return Object.keys(REPORT_TO_QUERY_MAP);
  }
  
  /**
   * Check if a report type can be bridged to the new system
   */
  public canBridgeReportType(reportType: string): boolean {
    return reportType in REPORT_TO_QUERY_MAP;
  }
  
  /**
   * Get the underlying query ID for a report type
   */
  public getQueryIdByReportType(reportType: string): string | null {
    return REPORT_TO_QUERY_MAP[reportType] || null;
  }

  /**
   * Get all available report types as QueryDefinitions
   */
  public getAllQueryDefinitions(): any[] {
    return this.getAvailableReportTypes().map(reportType => {
      const queryDef = this.getQueryDefinitionByReportType(reportType);
      
      // Map data source from query definition category or infer from report type
      const dataSource = this.getDataSourceByReportType(reportType);
      
      return {
        id: queryDef.id,
        name: queryDef.name,
        description: queryDef.description,
        version: "1.0.0",
        dataSource,
        category: queryDef.category,
        parameters: this.getParameterDefinitions(queryDef),
        isSystem: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    });
  }

  /**
   * Get data source type by report type
   */
  private getDataSourceByReportType(reportType: string): 'ad' | 'azure' | 'o365' {
    if (reportType.startsWith('ad_')) return 'ad';
    if (reportType.startsWith('azure_')) return 'azure';
    if (reportType.startsWith('o365_')) return 'o365';
    return 'ad'; // Default fallback
  }

  /**
   * Convert LDAP query parameters to frontend parameter definitions
   */
  private getParameterDefinitions(queryDef: any): any[] {
    if (!queryDef.parameters) return [];
    
    return Object.entries(queryDef.parameters).map(([name, config]: [string, any]) => ({
      name,
      type: config.type || 'string',
      required: config.required || false,
      defaultValue: config.default,
      description: config.description || `Parameter: ${name}`,
      displayName: name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, ' ')
    }));
  }
}

// Export singleton instance
export const reportTemplateBridge = new ReportTemplateBridgeService();