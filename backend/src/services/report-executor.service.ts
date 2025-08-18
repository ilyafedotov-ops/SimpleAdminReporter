import { db } from '@/config/database';
import { logger } from '@/utils/logger';
import { createError } from '@/middleware/error.middleware';
import { serviceFactory } from './service.factory';
import { credentialsService } from './credentials.service';
import { EncryptedCredential } from '@/utils/encryption';
import { reportTemplateBridge } from './report-template-bridge.service';
import { QueryExecutionContext, QueryResult } from './query/types';

export interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  category: 'ad' | 'azure' | 'o365';
  report_type: string;
  query_template?: any;
  query_config?: any;
  field_mappings?: any;
  required_parameters?: any;
  default_parameters?: any;
  execution_count?: number;
  average_execution_time?: number;
}

export interface ReportExecutionResult {
  success: boolean;
  executionId?: string;
  data?: any[];
  error?: string;
  executionTime: number;
  rowCount: number;
  executedAt: Date;
  status?: string;
  credentialId?: number;
}

export interface ExecutionContext {
  userId: number;
  templateId: string;
  parameters?: any;
  credentialId?: number; // Optional specific credential, uses default if not provided
}

/**
 * Report Executor Service with User Credential Support
 * Allows reports to be executed with user-specific credentials
 */
export class ReportExecutorService {
  private queryService: any;

  constructor() {
    // Initialize QueryService through service factory
    this.initializeQueryService();
  }

  private async initializeQueryService() {
    try {
      this.queryService = await serviceFactory.getQueryService();
      logger.info('ReportExecutorService initialized with QueryService');
    } catch (error) {
      logger.error('Failed to initialize QueryService:', error);
    }
  }

  /**
   * Execute a report with user credentials
   */
  async executeReport(context: ExecutionContext): Promise<ReportExecutionResult> {
    const { userId, templateId, parameters, credentialId } = context;
    const startTime = Date.now();
    
    try {
      // Get report template from database
      const template = await this.getReportTemplate(templateId);
      if (!template) {
        throw new Error('Report template not found');
      }

      logger.info(`Executing report: ${template.name} (${template.category}) for user ${userId}`);

      // Get the appropriate credential
      let credential;
      let decryptedCreds: EncryptedCredential | null = null;
      
      if (credentialId) {
        // Use specific credential if provided
        credential = await credentialsService.getCredential(credentialId, userId);
        if (!credential) {
          throw new Error(`Credential with ID ${credentialId} not found for user`);
        }
        if (credential.serviceType !== template.category) {
          throw new Error(`Credential type mismatch: credential is for ${credential.serviceType} but report requires ${template.category}`);
        }
      } else {
        // Try to get default credential for the service
        credential = await credentialsService.getDefaultCredential(userId, template.category);
        if (!credential) {
          logger.info(`No default ${template.category} credential found for user ${userId}, will use system defaults`);
        }
      }

      // Get decrypted credentials if available
      if (credential) {
        try {
          decryptedCreds = await credentialsService.getDecryptedCredential(credential.id, userId);
          logger.info(`Using credential ${credential.id} (${credential.credentialName}) for report execution`);
        } catch (decryptError) {
          logger.error(`Failed to decrypt credential ${credential.id}:`, decryptError);
          
          // Security: Don't allow execution with invalid credentials
          throw createError(
            'Unable to decrypt stored credentials. Please update your credentials in the settings.',
            400
          );
        }
      } else {
        logger.warn(`No user credential found for ${template.category}, using system defaults`);
      }

      // Merge default parameters with provided parameters
      const finalParameters = {
        ...template.default_parameters,
        ...parameters
      };

      // Ensure QueryService is initialized
      if (!this.queryService) {
        await this.initializeQueryService();
      }

      // Check if we have a new query definition for this template
      let queryDef: any = null;
      
      try {
        const ldapQueryDef = reportTemplateBridge.getQueryDefinitionByReportType(template.report_type);
        // Convert LDAP query to standard QueryDefinition format
        if (ldapQueryDef) {
          queryDef = {
            id: ldapQueryDef.id,
            name: ldapQueryDef.name,
            description: ldapQueryDef.description,
            version: '1.0.0',
            dataSource: 'ad' as const,
            sql: JSON.stringify({
              type: 'ldap',
              base: ldapQueryDef.query.base || process.env.AD_BASE_DN,
              scope: ldapQueryDef.query.scope,
              filter: ldapQueryDef.query.filter,
              attributes: ldapQueryDef.query.attributes,
              sizeLimit: ldapQueryDef.query.sizeLimit,
              timeLimit: ldapQueryDef.query.timeLimit
            }),
            parameters: Object.entries(ldapQueryDef.parameters || {}).map(([key, param]: [string, any]) => ({
              name: key,
              type: param.type,
              required: param.required,
              default: param.default,
              description: param.description,
              transform: param.transform
            })),
            access: {
              requiresAuth: true
            },
            // Add cache configuration
            cache: {
              enabled: true,
              ttlSeconds: 300,
              keyTemplate: `ldap:${ldapQueryDef.id}:{{parameters_hash}}`
            },
            // Add constraints
            constraints: {
              maxResults: ldapQueryDef.query.sizeLimit || 5000,
              timeoutMs: (ldapQueryDef.query.timeLimit || 30) * 1000
            }
          };
        }
      } catch (error) {
        logger.debug(`Could not get LDAP query definition: ${error}`);
      }
      
      let data: any[];
      
      if (queryDef && this.queryService) {
        // Use the new unified QueryService
        const queryContext: QueryExecutionContext = {
          userId,
          parameters: finalParameters,
          options: {
            skipCache: false,
            timeout: 30000, // 30s timeout
            maxResults: 10000, // Default limit
            credentialId: credential?.id // Pass credential ID for user-specific credentials
          }
        };

        const result: QueryResult<any> = await this.queryService.executeQuery(queryDef, queryContext);

        if (!result.success) {
          throw new Error(result.error || 'Query execution failed');
        }

        data = ((result as any)?.data);
      } else {
        // Use unified PreviewService for consistent data processing across all execution paths
        try {
          const previewService = await serviceFactory.getPreviewService();
          
          // Convert template parameters to preview format
          const previewRequest = {
            source: template.category as 'ad' | 'azure' | 'o365',
            query: {
              fields: template.field_mappings ? Object.keys(template.field_mappings).map(field => ({
                name: field,
                displayName: template.field_mappings[field]?.displayName || field
              })) : [],
              filters: [],
              source: template.category
            },
            parameters: finalParameters,
            limit: 1000
          };

          const previewResponse = await previewService.executePreview(previewRequest);
          
          if (!previewResponse.success || !previewResponse.data) {
            throw new Error(previewResponse.error?.message || 'Preview service execution failed');
          }

          data = previewResponse.data.testData || [];
        } catch (previewError) {
          logger.warn(`PreviewService failed for template ${templateId}, falling back to direct service execution:`, previewError);
          
          // Fall back to direct service execution for templates without query definitions
          switch (template.category) {
            case 'ad':
              data = await this.executeADReport(template, finalParameters, decryptedCreds, userId);
              break;
            case 'azure':
              data = await this.executeAzureReport(template, finalParameters, decryptedCreds, userId);
              break;
            case 'o365':
              data = await this.executeO365Report(template, finalParameters, decryptedCreds);
              break;
            default:
              throw new Error(`Unknown data source: ${template.category}`);
          }
        }
      }

      const executionTime = Date.now() - startTime;

      // Apply field mappings if specified
      if (template.field_mappings && data.length > 0) {
        data = this.applyFieldMappings(data, template.field_mappings);
      }

      // Save execution history with user context - use the actual template ID from database
      const executionId = await this.saveExecutionHistory(template.id, userId, {
        status: 'completed',
        rowCount: data.length,
        executionTime,
        parameters: finalParameters,
        credentialId: credential?.id,
        results: data // Include the actual results
      });

      return {
        success: true,
        executionId,
        data,
        executionTime,
        rowCount: data.length,
        executedAt: new Date(),
        status: 'completed',
        credentialId: credential?.id
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      logger.error(`Report execution failed for user ${userId}: ${(error as Error).message}`);

      // Save failed execution - need to get template first to get its UUID
      try {
        const template = await this.getReportTemplate(templateId);
        if (template) {
          await this.saveExecutionHistory(template.id, userId, {
            status: 'failed',
            errorMessage: (error as Error).message,
            executionTime,
            parameters,
            credentialId
          });
        }
      } catch (saveError) {
        logger.error('Failed to save execution history for failed report:', saveError);
      }

      return {
        success: false,
        error: (error as Error).message,
        executionTime,
        rowCount: 0,
        executedAt: new Date(),
        credentialId
      };
    }
  }

  private async getReportTemplate(templateId: string): Promise<ReportTemplate | null> {
    try {
      // Check if templateId is a valid UUID format
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(templateId);
      
      let result;
      if (isUUID) {
        // If it's a UUID, query by id
        result = await db.query(
          'SELECT * FROM report_templates WHERE id = $1',
          [templateId]
        );
      } else {
        // If it's not a UUID, assume it's a report_type
        result = await db.query(
          'SELECT * FROM report_templates WHERE report_type = $1',
          [templateId]
        );
      }
      
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to get report template:', error);
      throw error;
    }
  }

  /**
   * Execute AD report with optional user credentials
   */
  private async executeADReport(
    template: ReportTemplate, 
    parameters: any,
    credentials?: EncryptedCredential | null,
    _userId?: number
  ): Promise<any[]> {
    // This method is now primarily for legacy templates without query definitions
    // Most reports should be handled by QueryService in the main executeReport method

    // const __queryConfig = template.query_config;
    
    // Create service instance with user credentials or use default
    let service: any;
    
    if (credentials && credentials.username && credentials.encryptedPassword) {
      try {
        // Create a new AD service instance with user credentials
        service = await this.createUserADService(credentials);
      } catch (error) {
        logger.error('Failed to create AD service with user credentials:', error);
        logger.warn('Falling back to system AD service');
        // Fall back to system service
        const { serviceFactory } = await import('./service.factory');
        service = await serviceFactory.getADService();
      }
    } else {
      // Use the default service with system credentials through service factory
      const { serviceFactory } = await import('./service.factory');
      service = await serviceFactory.getADService();
    }

    // Execute LDAP query from template
    if (template.query_template) {
      // Clone the query template
      const query = JSON.parse(JSON.stringify(template.query_template));
      
      // Get AD configuration from environment
      const adConfig = {
        baseDN: process.env.AD_BASE_DN,
        server: process.env.AD_SERVER,
        // Connection parameters come from .env, credentials come from service store
      };
      
      // Validate required environment variables
      if (!adConfig.baseDN) {
        throw new Error('AD_BASE_DN environment variable is not configured');
      }
      if (!adConfig.server) {
        throw new Error('AD_SERVER environment variable is not configured');
      }
      
      // Replace template variables with environment config values
      if (query.base) {
        query.base = query.base.replace('{{baseDN}}', adConfig.baseDN);
        query.base = query.base.replace('{{BASE_DN}}', adConfig.baseDN);
      }
      
      // Calculate derived parameters based on report type
      const calculatedParams = this.calculateReportParameters(template.report_type, parameters);
      
      // Apply all parameters (provided + calculated) to the query
      const allParams = { ...parameters, ...calculatedParams };
      
      if (query.filter && Object.keys(allParams).length > 0) {
        Object.keys(allParams).forEach(key => {
          const regex = new RegExp(`{{${key}}}`, 'g');
          query.filter = query.filter.replace(regex, allParams[key]);
        });
      }
      
      logger.info(`Executing LDAP query for report ${template.name}:`, { 
        query,
        server: adConfig.server,
        usingCredentials: credentials ? 'user-specific' : 'service-default'
      });
      
      // The service already has credentials (either user-specific or service default)
      // Connection parameters come from environment
      
      // For raw LDAP queries, we need to access the LDAP client directly
      // or use the executeCustomQuery method with proper format
      let result;
      
      if (query.type === 'ldap' && query.filter) {
        // This is a raw LDAP query from the template
        // Convert to custom query format for executeCustomQuery
        const customQuery = {
          source: 'ad',
          filter: query.filter,
          fields: (query.attributes || []).map((attr: string) => ({ 
            name: attr, 
            displayName: attr 
          })),
          limit: query.limit || 1000,
          baseDN: query.base || process.env.AD_BASE_DN,
          scope: query.scope || 'sub'
        };
        
        // Use executeCustomQuery for all LDAP queries (users, computers, etc.)
        result = await service.executeCustomQuery(customQuery, parameters);
      } else {
        // Use executeCustomQuery for structured queries
        result = await service.executeCustomQuery(query, parameters);
      }
      
      let finalResult = Array.isArray(result) ? result : result.entries || ((result as any)?.data) || [];
      
      // Apply post-processing filters if needed
      if (parameters.postFilter === 'passwordChangeCutoff' && calculatedParams.passwordChangeCutoff) {
        const cutoffTimestamp = BigInt(calculatedParams.passwordChangeCutoff);
        finalResult = finalResult.filter((user: any) => {
          if (user.passwordLastSet) {
            try {
              // Convert LDAP timestamp to BigInt for comparison
              const userTimestamp = BigInt(user.passwordLastSet);
              return userTimestamp >= cutoffTimestamp;
            } catch (e) {
              logger.debug(`Failed to parse passwordLastSet for user ${user.sAMAccountName}:`, e);
              return false;
            }
          }
          return false;
        });
        logger.info(`Filtered ${Array.isArray(result) ? result.length : 0} users to ${finalResult.length} based on password change cutoff (cutoff: ${new Date(Number(cutoffTimestamp) / 10000 - 11644473600000).toISOString()})`);
      }
      
      return finalResult;
    } else {
      throw new Error(`No query template found for report: ${template.name}`);
    }
  }

  /**
   * Execute Azure report with optional user credentials
   */
  private async executeAzureReport(
    template: ReportTemplate,
    parameters: any,
    credentials?: EncryptedCredential | null,
    userId?: number
  ): Promise<any[]> {
    // Check if this is a Graph query
    const templateWithType = await db.query(
      'SELECT query_type FROM report_templates WHERE id = $1',
      [template.id]
    );
    const isGraphQuery = templateWithType.rows[0]?.query_type === 'graph';

    if (isGraphQuery) {
      // Use Graph query executor
      const { GraphQueryExecutor } = await import('@/services/graph-query-executor.service');
      const { getQueryById } = await import('@/queries/graph');
      
      const executor = new GraphQueryExecutor();
      const queryDef = getQueryById(template.report_type.replace('graph_', ''));
      
      if (!queryDef) {
        throw new Error(`Graph query definition not found for ${template.report_type}`);
      }

      const result = await executor.executeQuery({
        queryId: template.report_type.replace('graph_', ''),
        userId: userId || 0,
        parameters,
        saveHistory: false // We'll save history ourselves
      });

      return ((result as any)?.data) || [];
    }

    // Original Azure report logic
    // const __queryConfig = template.query_config;
    
    // Create service instance with user credentials or use default
    let service: any;
    
    if (credentials && credentials.tenantId && credentials.clientId && credentials.encryptedClientSecret) {
      // Create a new Azure service instance with user credentials
      service = await this.createUserAzureService(credentials);
    } else {
      // Use the default service with system credentials through service factory
      const { serviceFactory } = await import('./service.factory');
      service = await serviceFactory.getAzureService();
    }

    // Execute Graph API query from template
    if (template.query_template) {
      const query = JSON.parse(JSON.stringify(template.query_template));
      
      // Get Azure configuration from environment
      const azureConfig = {
        tenantId: process.env.AZURE_TENANT_ID,
        // Connection parameters come from .env, credentials come from service store
      };
      
      // Validate required environment variables
      if (!azureConfig.tenantId) {
        throw new Error('AZURE_TENANT_ID environment variable is not configured');
      }
      
      // Replace template variables with environment config
      if (query.endpoint) {
        query.endpoint = query.endpoint.replace('{{tenantId}}', azureConfig.tenantId);
      }
      
      // Apply any runtime parameters to the query
      if (parameters) {
        if (query.filter) {
          Object.keys(parameters).forEach(key => {
            const regex = new RegExp(`{{${key}}}`, 'g');
            query.filter = query.filter.replace(regex, parameters[key]);
          });
        }
      }
      
      logger.info(`Executing Graph API query for report ${template.name}:`, { 
        query,
        tenant: azureConfig.tenantId,
        usingCredentials: credentials ? 'user-specific' : 'service-default'
      });
      
      // The service already has credentials (either user-specific or service default)
      const result = await service.executeGraphQuery(query);
      return result.value || ((result as any)?.data) || result;
    } else {
      throw new Error(`No query template found for report: ${template.name}`);
    }
  }

  /**
   * Execute O365 report with optional user credentials
   */
  private async executeO365Report(
    template: ReportTemplate,
    parameters: any,
    credentials?: EncryptedCredential | null
  ): Promise<any[]> {
    // const __queryConfig = template.query_config;
    
    // Create service instance with user credentials or use default
    let service: any;
    
    if (credentials && credentials.tenantId && credentials.clientId && credentials.encryptedClientSecret) {
      // Create a new O365 service instance with user credentials
      service = await this.createUserO365Service(credentials);
    } else {
      // Use the default service with system credentials through service factory
      const { serviceFactory } = await import('./service.factory');
      service = await serviceFactory.getO365Service();
    }

    // Execute Graph API query from template (O365 uses Graph API)
    if (template.query_template) {
      const query = JSON.parse(JSON.stringify(template.query_template));
      
      // Apply any parameters to the query
      if (parameters) {
        if (query.filter) {
          Object.keys(parameters).forEach(key => {
            query.filter = query.filter.replace(`{{${key}}}`, parameters[key]);
          });
        }
        
        // Some O365 reports use period parameter
        if (parameters.period && query.endpoint) {
          query.endpoint = query.endpoint.replace('{{period}}', parameters.period);
        }
      }
      
      logger.info(`Executing O365 Graph API query for report ${template.name}:`, { query });
      
      // Execute the Graph API query
      const result = await service.executeGraphQuery(query);
      return result.value || ((result as any)?.data) || result;
    } else {
      throw new Error(`No query template found for report: ${template.name}`);
    }
  }

  /**
   * Create an AD service instance with user credentials
   */
  private async createUserADService(credentials: EncryptedCredential): Promise<any> {
    logger.debug('Creating AD service with user credentials');
    
    try {
      const { serviceFactory } = await import('@/services/service.factory');
      const __credentialContext = {
        credentials: {
          username: credentials.username,
          password: credentials.encryptedPassword, // TODO: Decrypt when encryption service is available
          domain: process.env.AD_DOMAIN // Use env default since domain not in EncryptedCredential
        }
      };
      void __credentialContext; // Reserved for future credential context passing
      
      const service = await serviceFactory.getADService();
      
      // Test the connection
      const isConnected = await service.testConnection();
      if (!isConnected) {
        throw new Error('Failed to connect to AD with user credentials');
      }
      return service;
    } catch (error) {
      logger.error('Failed to create AD service with user credentials:', error);
      throw error;
    }
  }

  /**
   * Create an Azure service instance with user credentials
   */
  private async createUserAzureService(_credentials: EncryptedCredential): Promise<any> {
    logger.debug('Creating Azure service with user credentials');
    
    try {
      const { serviceFactory } = await import('@/services/service.factory');
      
      // Get the MSAL service (singleton)
      const service = await serviceFactory.getAzureService();
      
      // Service will use credentials from the credential context
      
      // Test the connection
      const isConnected = await service.testConnection();
      if (!isConnected) {
        throw new Error('Failed to connect to Azure with user credentials');
      }
      
      return service;
    } catch (error) {
      logger.error('Failed to create Azure service with user credentials:', error);
      throw error;
    }
  }

  /**
   * Create an O365 service instance with user credentials
   */
  private async createUserO365Service(_credentials: EncryptedCredential): Promise<any> {
    logger.debug('Creating O365 service with user credentials');
    
    try {
      const { serviceFactory } = await import('@/services/service.factory');
      
      // Get the MSAL service (singleton)
      const service = await serviceFactory.getO365Service();
      
      // Service will use credentials from the credential context
      
      // Test the connection
      const isConnected = await service.testConnection();
      if (!isConnected) {
        throw new Error('Failed to connect to O365 with user credentials');
      }
      
      return service;
    } catch (error) {
      logger.error('Failed to create O365 service with user credentials:', error);
      throw error;
    }
  }

  /**
   * Calculate derived parameters based on report type
   * Converts user-friendly parameters (like days) to LDAP-specific values (like timestamps)
   */
  private calculateReportParameters(reportType: string, parameters: any): any {
    const calculated: any = {};
    
    switch (reportType) {
      case 'inactive_users':
      case 'inactive_computers':
        // Convert days to Windows FileTime timestamp
        if (parameters.days !== undefined) {
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - parseInt(parameters.days));
          // Convert to Windows FileTime (100-nanosecond intervals since 1601-01-01)
          const windowsFileTime = ((cutoffDate.getTime() + 11644473600000) * 10000).toString();
          calculated.lastLogonTimestamp = windowsFileTime;
        }
        break;
        
      case 'password_expiry':
        // Calculate password cutoff date
        if (parameters.days !== undefined) {
          const maxPasswordAge = 42; // Default AD password policy
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() + parseInt(parameters.days) - maxPasswordAge);
          const windowsFileTime = ((cutoffDate.getTime() + 11644473600000) * 10000).toString();
          calculated.passwordCutoff = windowsFileTime;
        }
        break;
        
      case 'recent_lockouts':
        // Calculate lockout cutoff date
        if (parameters.days !== undefined) {
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - parseInt(parameters.days));
          const windowsFileTime = ((cutoffDate.getTime() + 11644473600000) * 10000).toString();
          calculated.lockoutCutoff = windowsFileTime;
        }
        break;
        
      case 'recent_password_changes':
        // Calculate password change cutoff for hours
        if (parameters.hours !== undefined) {
          const cutoffDate = new Date();
          cutoffDate.setHours(cutoffDate.getHours() - parseInt(parameters.hours));
          const windowsFileTime = ((cutoffDate.getTime() + 11644473600000) * 10000).toString();
          calculated.passwordChangeCutoff = windowsFileTime;
        }
        break;
        
      case 'password_changes_by_day':
        // Calculate password change cutoff for days
        if (parameters.days !== undefined) {
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - parseInt(parameters.days));
          const windowsFileTime = ((cutoffDate.getTime() + 11644473600000) * 10000).toString();
          calculated.passwordChangeCutoff = windowsFileTime;
        }
        break;
    }
    
    return calculated;
  }

  private applyFieldMappings(data: any[], fieldMappings: any): any[] {
    return data.map(row => {
      const mappedRow: any = {};
      
      Object.keys(fieldMappings).forEach(fieldName => {
        const mapping = fieldMappings[fieldName];
        let value = row[fieldName];
        
        // Apply type conversions if specified
        if (mapping.type === 'date' && value) {
          value = new Date(value).toISOString();
        } else if (mapping.type === 'boolean') {
          value = Boolean(value);
        } else if (mapping.type === 'number') {
          value = Number(value) || 0;
        }
        
        // Use display name if specified, otherwise use original field name
        const displayField = mapping.displayName || fieldName;
        mappedRow[displayField] = value;
      });
      
      return mappedRow;
    });
  }

  /**
   * Save execution history with user context
   */
  private async saveExecutionHistory(
    templateId: string, 
    userId: number, 
    execution: any
  ): Promise<string> {
    try {
      // Map status values to match the existing schema
      const status = execution.status === 'completed' ? 'completed' : 
                     execution.status === 'failed' ? 'failed' : 
                     execution.status || 'completed';

      // Get the template to access its data source and name
      let dataSource = null;
      let reportName = null;
      try {
        const templateResult = await db.query(
          'SELECT category, name FROM report_templates WHERE id = $1',
          [templateId]
        );
        if (templateResult.rows.length > 0) {
          dataSource = templateResult.rows[0].category;
          reportName = templateResult.rows[0].name;
        }
      } catch (e) {
        logger.debug('Could not fetch template details:', e);
      }

      // Insert history record with all metadata
      const historyResult = await db.query(
        `INSERT INTO report_history 
         (user_id, template_id, generated_at, started_at, completed_at, 
          parameters, status, row_count, execution_time_ms, error_message, 
          data_source, credential_id, report_name, metadata)
         VALUES ($1, $2::uuid, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 
          $3, $4::report_status_type, $5, $6, $7, 
          $8, $9, $10, $11)
         RETURNING id`,
        [
          userId,
          templateId,
          JSON.stringify(execution.parameters || {}),
          status,
          execution.rowCount || 0,
          execution.executionTime || 0,
          execution.errorMessage || null,
          dataSource,
          execution.credentialId || null,
          reportName,
          JSON.stringify({
            cached: execution.cached || false,
            version: '2.0',
            executionType: 'manual'
          })
        ]
      );

      const historyId = historyResult.rows[0].id;

      // Store actual results in separate table (for all successful executions, even if empty)
      if (status === 'completed' && execution.results !== undefined) {
        await db.query(
          `INSERT INTO report_results (history_id, result_data, expires_at)
           VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
          [
            historyId,
            JSON.stringify(execution.results || [])
          ]
        );
      }

      // Also log credential usage if applicable
      if (execution.credentialId) {
        logger.info(`Report executed with credential ${execution.credentialId} for user ${userId}`);
      }

      logger.info(`Report execution history saved with ID: ${historyId}`, {
        userId,
        templateId,
        status,
        rowCount: execution.rowCount || 0,
        hasResults: execution.results !== undefined
      });

      return historyId;

    } catch (error) {
      logger.error('Failed to save execution history:', error);
      // Don't throw - this is not critical for report execution, return a fallback ID
      return 'error-' + Date.now(); // Fallback ID for when history save fails
    }
  }
}

// Export singleton instance
export const reportExecutor = new ReportExecutorService();
