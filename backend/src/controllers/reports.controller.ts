import { Request, Response } from 'express';
import { db } from '@/config/database';
import { fieldDiscoveryService } from '@/services/fieldDiscovery.service';
import { reportExecutor } from '@/services/report-executor.service';
import { serviceFactory } from '@/services/service.factory';
import { logger } from '@/utils/logger';
import { asyncHandler, createError } from '@/middleware/error.middleware';
import { body, param, validationResult } from 'express-validator';
import type {
  CustomQuery
} from '@/types/shared-types';

/**
 * Legacy interface maintained for backward compatibility
 * @deprecated Use CustomQuery from shared-types instead
 */
export interface CustomReportQuery extends CustomQuery {}

export interface CustomReportTemplate {
  id: string;
  name: string;
  description?: string;
  source: 'ad' | 'azure' | 'o365';
  query: CustomReportQuery;
  createdBy: number;
  isPublic: boolean;
  category?: string;
  tags: string[];
}

export class ReportsController {
  /**
   * Get all pre-built report templates
   * GET /api/reports/templates
   */
  getTemplates = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { category, source } = req.query;

    try {
      // Fetch actual templates from database
      let whereClause = 'WHERE is_active = true';
      const params: any[] = [];
      
      if (category) {
        whereClause += ' AND category = $' + (params.length + 1);
        params.push(category);
      }
      
      if (source) {
        whereClause += ' AND category = $' + (params.length + 1);
        params.push(source);
      }
      
      const result = await db.query(
        `SELECT id, name, description, category, subcategory, report_type, required_parameters,
                default_parameters, execution_count, average_execution_time,
                created_at, updated_at
         FROM report_templates
         ${whereClause}
         ORDER BY category, subcategory, name`,
        params
      );
      
      // Convert templates to QueryDefinition format expected by frontend
      const definitions = result.rows.map((template: any) => {
        // Convert parameters from database format to frontend format
        const parameters: any[] = [];
        if (template.required_parameters) {
          Object.entries(template.required_parameters).forEach(([name, config]: [string, any]) => {
            parameters.push({
              name,
              type: config.type || 'string',
              required: true,
              defaultValue: template.default_parameters?.[name] || config.default,
              description: config.description || name,
              displayName: config.displayName || name
            });
          });
        }
        
        return {
          id: template.id, // Use the actual UUID
          reportType: template.report_type, // Include report_type as a separate field if needed
          name: template.name,
          description: template.description,
          version: "1.0.0",
          dataSource: template.category === 'ad' ? 'ad' : 
                     template.category === 'azure' ? 'azure' : 
                     template.category === 'o365' ? 'o365' : 'ad',
          category: template.category,
          subcategory: template.subcategory,
          parameters,
          isSystem: true,
          createdAt: template.created_at,
          updatedAt: template.updated_at,
          executionCount: template.execution_count,
          avgExecutionTime: template.average_execution_time
        };
      });

      res.json({
        success: true,
        data: {
          definitions,
          totalCount: definitions.length
        }
      });

    } catch (error) {
      logger.error('Failed to get report templates:', error);
      throw error;
    }
  });

  /**
   * Execute a pre-built report
   * POST /api/reports/execute/:templateId
   */
  executeTemplate = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { templateId } = req.params;
    const { parameters = {}, format = 'json', credentialId } = req.body;

    if (!req.user) {
      throw createError('Authentication required', 401);
    }

    try {
      // Use the report executor service with unified QueryService backend
      const result = await reportExecutor.executeReport({
        userId: req.user.id,
        templateId,
        parameters,
        credentialId: credentialId ? parseInt(credentialId) : undefined
      });

      if (!result.success) {
        throw createError(result.error || 'Report execution failed', 500);
      }

      // Get template details for response
      // Check if templateId is a valid UUID format
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(templateId);
      
      let templateResult;
      if (isUUID) {
        // If it's a UUID, query by id
        templateResult = await db.query(
          'SELECT name, category FROM report_templates WHERE id = $1',
          [templateId]
        );
      } else {
        // If it's not a UUID, assume it's a report_type
        templateResult = await db.query(
          'SELECT name, category FROM report_templates WHERE report_type = $1',
          [templateId]
        );
      }
      
      const template = templateResult.rows[0] || { 
        name: templateId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), 
        category: 'ad' 
      };

      // Fetch actual results data from report_results table
      let actualData: any[] = [];
      if (result.executionId && result.success) {
        try {
          const resultsQuery = await db.query(
            'SELECT result_data FROM report_results WHERE history_id = $1',
            [result.executionId]
          );
          
          if (resultsQuery.rows.length > 0) {
            const rawData = resultsQuery.rows[0].result_data;
            // Check if data is already parsed or needs parsing
            if (typeof rawData === 'string') {
              actualData = JSON.parse(rawData) || [];
            } else {
              actualData = rawData || [];
            }
          }
        } catch (error) {
          logger.error('Failed to fetch results data:', error);
          // Fall back to result.data if available
          actualData = ((result as any)?.data) || [];
        }
      } else {
        // Fall back to result.data if available
        actualData = ((result as any)?.data) || [];
      }

      // Format response based on requested format
      if (format === 'json') {
        res.json({
          success: true,
          data: {
            executionId: result.executionId,
            reportName: template.name,
            category: template.category,
            executedAt: result.executedAt,
            executionTime: result.executionTime,
            parameters,
            totalCount: result.rowCount,
            status: result.status,
            data: actualData,
            message: `Report executed successfully with ${actualData.length} records.`
          }
        });
      } else {
        // Export to other formats
        // Export functionality is implemented in export controller
        // This endpoint returns JSON only
        throw createError('Export format not supported in this endpoint. Use /api/export endpoints for CSV/Excel export', 400);
      }

    } catch (error) {
      logger.error(`Failed to execute template ${templateId}:`, error);
      
      // Save failed execution
      await this.saveReportHistory({
        templateId,
        userId: req.user!.id,
        parameters,
        status: 'failed',
        errorMessage: (error as Error).message
      });

      throw error;
    }
  });

  /**
   * Get available fields for a data source
   * GET /api/reports/fields/:source
   */
  getFields = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { source } = req.params;
    const { category, search, refresh, credentialId } = req.query;

    if (!['ad', 'azure', 'o365'].includes(source)) {
      throw createError('Invalid data source', 400);
    }
    
    if (!req.user) {
      throw createError('Authentication required', 401);
    }

    try {
      // Clear cache if refresh requested
      if (refresh === 'true') {
        const { redis } = await import('@/config/redis');
        await redis.del(`fields:${source}:all`);
        await redis.del(`fields:${source}:discovered`);
        logger.info(`Cleared field cache for ${source} due to refresh request`);
      }
      
      // Get credentials if source is AD
      let serviceAccountDn: string | undefined;
      let serviceAccountPassword: string | undefined;
      
      if (source === 'ad' && credentialId) {
        const credentialQuery = await db.query(
          `SELECT * FROM service_credentials 
           WHERE id = $1 AND user_id = $2 AND service_type = 'ad' AND is_active = true`,
          [credentialId, req.user.id]
        );
        
        if (credentialQuery.rows.length > 0) {
          const cred = credentialQuery.rows[0];
          // Decrypt credentials
          const { getCredentialEncryption } = await import('@/utils/encryption');
          const encryption = getCredentialEncryption();
          const decrypted = cred.password_salt ? 
            encryption.decryptWithSalt(cred.encrypted_password, cred.password_salt) :
            encryption.decrypt(cred.encrypted_password);
          
          serviceAccountDn = cred.username;
          serviceAccountPassword = decrypted;
        }
      }
      
      let fields;

      // Use Graph field discovery for Azure
      if (source === 'azure') {
        const { GraphFieldDiscoveryService } = await import('@/services/graph-field-discovery.service');
        const graphFieldDiscovery = new GraphFieldDiscoveryService();
        
        // Get all fields for users entity by default
        const schema = await graphFieldDiscovery.discoverFields('user');
        let fields = schema.fields;
        
        // Filter by search if provided
        if (search) {
          const searchTerm = (search as string).toLowerCase();
          fields = fields.filter(field =>
            field.name.toLowerCase().includes(searchTerm) ||
            field.displayName.toLowerCase().includes(searchTerm) ||
            (field.description && field.description.toLowerCase().includes(searchTerm))
          );
        }
        
        // Filter by category if provided
        if (category) {
          fields = fields.filter(field => field.category === category);
        }
        
        // Transform to match expected format
        res.json({
          success: true,
          data: {
            fields: fields.map((f: any) => ({
              fieldName: f.name,
              displayName: f.displayName,
              dataType: f.type,
              category: f.category,
              description: f.description,
              isSearchable: f.isSearchable,
              isSortable: f.isSortable,
              isExportable: true
            }))
          }
        });
        return;
      }

      // Original logic for AD and O365
      if (search) {
        // Search fields across the source
        fields = await fieldDiscoveryService.searchFields(search as string, [source as any]);
      } else if (category) {
        // Get fields by category
        const categories = await fieldDiscoveryService.getFieldsByCategory(source as any, serviceAccountDn, serviceAccountPassword);
        const targetCategory = categories.find(cat => cat.name === category);
        fields = targetCategory ? targetCategory.fields : [];
      } else {
        // Get all fields organized by category
        const categories = await fieldDiscoveryService.getFieldsByCategory(source as any, serviceAccountDn, serviceAccountPassword);
        res.json({
          success: true,
          data: {
            source,
            categories,
            totalFields: categories.reduce((sum, cat) => sum + cat.fields.length, 0)
          }
        });
        return;
      }

      res.json({
        success: true,
        data: {
          source,
          fields,
          totalCount: fields.length
        }
      });

    } catch (error) {
      logger.error(`Failed to get fields for source ${source}:`, error);
      throw error;
    }
  });

  /**
   * Discover schema dynamically from data source
   * GET /api/reports/schema/:source/discover
   */
  discoverSchema = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { source } = req.params;
    const { refresh, credentialId } = req.query;
    
    if (!req.user) {
      throw createError('Authentication required', 401);
    }

    try {
      // Import the schema discovery service
      const { adSchemaDiscovery } = await import('@/services/adSchemaDiscovery.service');
      
      if (source === 'ad') {
        let serviceAccountDn: string | undefined;
        let serviceAccountPassword: string | undefined;
        
        if (credentialId) {
          // Use specific credential
          const credentialQuery = await db.query(
            `SELECT * FROM service_credentials 
             WHERE id = $1 AND user_id = $2 AND service_type = 'ad' AND is_active = true`,
            [credentialId, req.user.id]
          );
          
          if (credentialQuery.rows.length === 0) {
            throw createError('Invalid or inactive credential', 400);
          }
          
          const cred = credentialQuery.rows[0];
          // Decrypt credentials
          const { getCredentialEncryption } = await import('@/utils/encryption');
          const encryption = getCredentialEncryption();
          const decrypted = cred.password_salt ? 
            encryption.decryptWithSalt(cred.encrypted_password, cred.password_salt) :
            encryption.decrypt(cred.encrypted_password);
          
          serviceAccountDn = cred.username;
          serviceAccountPassword = decrypted;
        } else {
          // Fall back to default credential
          const credentialQuery = await db.query(
            `SELECT * FROM service_credentials 
             WHERE user_id = $1 AND service_type = 'ad' AND is_active = true
             ORDER BY is_default DESC, created_at DESC 
             LIMIT 1`,
            [req.user.id]
          );
          
          if (credentialQuery.rows.length > 0) {
            const cred = credentialQuery.rows[0];
            // Decrypt credentials
            const { getCredentialEncryption } = await import('@/utils/encryption');
            const encryption = getCredentialEncryption();
            const decrypted = cred.password_salt ? 
              encryption.decryptWithSalt(cred.encrypted_password, cred.password_salt) :
              encryption.decrypt(cred.encrypted_password);
            
            serviceAccountDn = cred.username;
            serviceAccountPassword = decrypted;
          }
        }
        
        if (!serviceAccountDn || !serviceAccountPassword) {
          throw createError('No valid AD credentials found. Please configure credentials in Settings.', 400);
        }
        
        // Clear cache if refresh requested
        if (refresh === 'true') {
          const { redis } = await import('@/config/redis');
          // Clear both general and credential-specific cache
          const clearedCount = await redis.invalidatePattern('ad:schema:full*');
          logger.info(`Cleared ${clearedCount} cached schema entries for refresh`);
        }
        
        // Discover schema
        const schemaResult = await adSchemaDiscovery.discoverFullSchema(
          serviceAccountDn,
          serviceAccountPassword
        );
        
        // Convert to field metadata format
        const fieldMetadata = await adSchemaDiscovery.convertToFieldMetadata(schemaResult.attributes);
        
        // Disable caching for schema discovery to prevent 304 responses that hang the frontend
        res.set({
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        });
        
        res.json({
          success: true,
          data: {
            source,
            totalAttributes: schemaResult.totalCount,
            commonAttributes: await adSchemaDiscovery.convertToFieldMetadata(schemaResult.commonAttributes),
            allFields: fieldMetadata,
            categories: this.categorizeFields(fieldMetadata),
            objectClasses: schemaResult.objectClasses
          }
        });
      } else {
        throw createError('Schema discovery is currently only supported for Active Directory', 400);
      }
    } catch (error) {
      logger.error(`Failed to discover schema for ${source}:`, error);
      throw error;
    }
  });

  /**
   * Helper method to categorize fields
   */
  private categorizeFields(fields: any[]): any[] {
    const categories = new Map<string, any[]>();
    
    fields.forEach(field => {
      const category = field.category || 'other';
      if (!categories.has(category)) {
        categories.set(category, []);
      }
      categories.get(category)!.push(field);
    });
    
    return Array.from(categories.entries()).map(([name, fields]) => ({
      name,
      displayName: this.getCategoryDisplayName(name),
      fields: fields.sort((a, b) => a.displayName.localeCompare(b.displayName)),
      count: fields.length
    }));
  }

  private getCategoryDisplayName(category: string): string {
    const displayNames: Record<string, string> = {
      identity: 'Identity',
      personal: 'Personal Information',
      contact: 'Contact Details',
      organization: 'Organization',
      location: 'Location',
      audit: 'Audit & Timestamps',
      security: 'Security',
      other: 'Other Attributes'
    };
    return displayNames[category] || category;
  }

  /**
   * Create a custom report template
   * POST /api/reports/custom
   */
  createCustomReport = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw createError('Authentication required', 401);
    }

    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw createError('Validation failed: ' + errors.array().map(e => e.msg).join(', '), 400);
    }

    const { name, description, source, query, isPublic, category, tags } = req.body;

    try {
      // Validate the query structure
      this.validateCustomQuery(query);

      // Check if name already exists for this user
      const existingReport = await db.query(
        'SELECT id FROM custom_report_templates WHERE name = $1 AND created_by = $2',
        [name, req.user.id]
      );

      if (existingReport.rows.length > 0) {
        throw createError('A report with this name already exists', 409);
      }

      // Create the custom report template with explicit UUID generation
      const result = await db.query(
        `INSERT INTO custom_report_templates 
         (id, name, description, source, query, created_by, user_id, is_public, category, tags)
         VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, $5, $6, $7, $8)
         RETURNING id, created_at`,
        [name, description, source, JSON.stringify(query), req.user.id, isPublic || false, category, tags || []]
      );

      const reportId = result.rows[0].id;
      
      // Validate that we got a proper UUID
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(reportId)) {
        logger.error(`Created custom report with invalid UUID: ${reportId}`);
        throw createError('Failed to generate proper report ID', 500);
      }

      logger.info(`Custom report created: ${name} (ID: ${reportId}) by user ${req.user.username}`);

      res.status(201).json({
        success: true,
        message: 'Custom report created successfully',
        data: {
          id: reportId,
          name,
          description,
          source,
          isPublic,
          category,
          tags,
          createdAt: result.rows[0].created_at,
          createdBy: req.user.id
        }
      });

    } catch (error) {
      logger.error('Failed to create custom report:', error);
      throw error;
    }
  });

  /**
   * Get user's custom reports
   * GET /api/reports/custom
   */
  getCustomReports = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw createError('Authentication required', 401);
    }

    const { source, category, isPublic, includePublic = 'true' } = req.query;

    try {
      let whereClause = 'WHERE (crt.created_by = $1';
      const params: any[] = [req.user.id];

      // Include public reports if requested
      if (includePublic === 'true') {
        whereClause += ' OR crt.is_public = true';
      }
      whereClause += ') AND crt.is_active = true';

      if (source) {
        whereClause += ' AND crt.source = $' + (params.length + 1);
        params.push(source);
      }

      if (category) {
        whereClause += ' AND crt.category = $' + (params.length + 1);
        params.push(category);
      }

      if (isPublic !== undefined) {
        whereClause += ' AND crt.is_public = $' + (params.length + 1);
        params.push(isPublic === 'true');
      }

      const result = await db.query(
        `SELECT crt.id, crt.name, crt.description, crt.source, crt.category, crt.tags,
                crt.is_public, crt.execution_count, crt.last_executed, crt.average_execution_time,
                crt.created_at, crt.updated_at, crt.created_by, crt.version,
                crt.query, -- Include the full query object
                u.display_name as creator_name,
                jsonb_array_length(crt.query->'fields') as field_count,
                COALESCE(jsonb_array_length(crt.query->'filters'), 0) as filter_count
         FROM custom_report_templates crt
         LEFT JOIN users u ON crt.created_by = u.id
         ${whereClause}
         ORDER BY crt.updated_at DESC`,
        params
      );

      res.json({
        success: true,
        data: {
          reports: result.rows,
          totalCount: result.rows.length
        }
      });

    } catch (error) {
      logger.error('Failed to get custom reports:', error);
      throw error;
    }
  });

  /**
   * Get a specific custom report
   * GET /api/reports/custom/:reportId
   */
  getCustomReport = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw createError('Authentication required', 401);
    }

    const { reportId } = req.params;

    try {
      const result = await db.query(
        `SELECT crt.*, u.display_name as creator_name, u.username as creator_username
         FROM custom_report_templates crt
         LEFT JOIN users u ON crt.created_by = u.id
         WHERE crt.id = $1 AND crt.is_active = true`,
        [reportId]
      );

      if (result.rows.length === 0) {
        throw createError('Custom report not found', 404);
      }

      const report = result.rows[0];

      // Check access permissions
      if (!report.is_public && report.created_by !== req.user.id && !req.user.isAdmin) {
        throw createError('Access denied to this report', 403);
      }

      res.json({
        success: true,
        data: {
          ...report,
          // query is already a JSON object from JSONB column, no need to parse
          query: report.query
        }
      });

    } catch (error) {
      logger.error(`Failed to get custom report ${reportId}:`, error);
      throw error;
    }
  });

  /**
   * Execute a custom report
   * POST /api/reports/custom/:reportId/execute
   */
  executeCustomReport = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw createError('Authentication required', 401);
    }

    const { reportId } = req.params;
    const { parameters = {}, format = 'json' } = req.body;

    try {
      logger.info(`Executing custom report ${reportId} for user ${req.user.username} (ID: ${req.user.id})`);
      
      // Get custom report template with owner information
      const templateResult = await db.query(
        'SELECT *, user_id, created_by FROM custom_report_templates WHERE id = $1 AND is_active = true',
        [reportId]
      );

      logger.debug(`Query result for report ${reportId}: ${templateResult.rows.length} rows found`);

      if (templateResult.rows.length === 0) {
        // Check if report exists but is inactive
        const inactiveResult = await db.query(
          'SELECT id, is_active, user_id, created_by FROM custom_report_templates WHERE id = $1',
          [reportId]
        );
        
        if (inactiveResult.rows.length > 0) {
          const report = inactiveResult.rows[0];
          logger.warn(`Attempted access to inactive report ${reportId}. Owner: ${report.user_id || report.created_by}, Requestor: ${req.user.id}`);
          throw createError('Custom report is inactive', 410);
        } else {
          logger.warn(`Custom report ${reportId} not found in database`);
          throw createError('Custom report not found', 404);
        }
      }

      const template = templateResult.rows[0];

      // Check access permissions
      const ownerId = template.user_id || template.created_by; // Support both columns during transition
      if (!template.is_public && ownerId !== req.user.id && !req.user.isAdmin) {
        throw createError('Access denied to this report', 403);
      }

      const query = template.query;
      const startTime = Date.now();

      // Execute using the unified PreviewService for consistent data processing
      const previewService = await serviceFactory.getPreviewService();
      const previewResponse = await previewService.executePreview({
        source: template.source as 'ad' | 'azure' | 'o365',
        query: query,
        parameters: parameters,
        limit: query.limit || 1000
      });

      if (!previewResponse.success || !previewResponse.data) {
        throw createError(previewResponse.error?.message || 'Query execution failed', 500);
      }

      // Extract the actual data from the standardized response
      const reportData = previewResponse.data.testData || [];

      const executionTime = Date.now() - startTime;

      // Save execution history and get the execution ID
      const executionId = await this.saveReportHistory({
        customTemplateId: template.id,
        userId: req.user.id,
        parameters,
        status: 'completed',
        rowCount: previewResponse.data.rowCount || reportData.length || 0,
        executionTime,
        format,
        results: reportData
      });

      // Update template statistics
      await this.updateCustomTemplateStats(template.id, executionTime);

      res.json({
        success: true,
        data: {
          executionId,
          reportName: template.name,
          source: template.source,
          executedAt: new Date(),
          executionTime,
          parameters,
          data: reportData,
          totalCount: previewResponse.data.rowCount || reportData.length || 0
        }
      });

    } catch (error) {
      logger.error(`Failed to execute custom report ${reportId}:`, error);
      
      // Save failed execution
      await this.saveReportHistory({
        customTemplateId: reportId,
        userId: req.user.id,
        parameters,
        status: 'failed',
        errorMessage: (error as Error).message
      });

      throw error;
    }
  });

  /**
   * Update a custom report template
   * PUT /api/reports/custom/:reportId
   */
  updateCustomReport = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw createError('Authentication required', 401);
    }

    const { reportId } = req.params;
    const { name, description, query, isPublic, category, tags } = req.body;

    try {
      // Get existing report
      const existingResult = await db.query(
        'SELECT * FROM custom_report_templates WHERE id = $1 AND is_active = true',
        [reportId]
      );

      if (existingResult.rows.length === 0) {
        throw createError('Custom report not found', 404);
      }

      const existingReport = existingResult.rows[0];

      // Check permissions
      if (existingReport.created_by !== req.user.id && !req.user.isAdmin) {
        throw createError('Permission denied to update this report', 403);
      }

      // Validate query if provided
      if (query) {
        this.validateCustomQuery(query);
      }

      // Check for name conflicts if name is being changed
      if (name && name !== existingReport.name) {
        const nameCheck = await db.query(
          'SELECT id FROM custom_report_templates WHERE name = $1 AND created_by = $2 AND id != $3',
          [name, req.user.id, reportId]
        );

        if (nameCheck.rows.length > 0) {
          throw createError('A report with this name already exists', 409);
        }
      }

      // Update the report
      const updateFields: string[] = [];
      const updateValues: any[] = [];
      let valueIndex = 1;

      if (name !== undefined) {
        updateFields.push(`name = $${valueIndex++}`);
        updateValues.push(name);
      }
      if (description !== undefined) {
        updateFields.push(`description = $${valueIndex++}`);
        updateValues.push(description);
      }
      if (query !== undefined) {
        updateFields.push(`query = $${valueIndex++}`);
        updateValues.push(JSON.stringify(query));
      }
      if (isPublic !== undefined) {
        updateFields.push(`is_public = $${valueIndex++}`);
        updateValues.push(isPublic);
      }
      if (category !== undefined) {
        updateFields.push(`category = $${valueIndex++}`);
        updateValues.push(category);
      }
      if (tags !== undefined) {
        updateFields.push(`tags = $${valueIndex++}`);
        updateValues.push(tags);
      }

      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
      updateFields.push(`version = version + 1`);
      updateValues.push(reportId);

      await db.query(
        `UPDATE custom_report_templates 
         SET ${updateFields.join(', ')}
         WHERE id = $${valueIndex}`,
        updateValues
      );

      logger.info(`Custom report updated: ${reportId} by user ${req.user.username}`);

      res.json({
        success: true,
        message: 'Custom report updated successfully'
      });

    } catch (error) {
      logger.error(`Failed to update custom report ${reportId}:`, error);
      throw error;
    }
  });

  /**
   * Delete a custom report template
   * DELETE /api/reports/custom/:reportId
   */
  deleteCustomReport = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw createError('Authentication required', 401);
    }

    const { reportId } = req.params;

    try {
      // Get existing report
      const existingResult = await db.query(
        'SELECT created_by FROM custom_report_templates WHERE id = $1 AND is_active = true',
        [reportId]
      );

      if (existingResult.rows.length === 0) {
        throw createError('Custom report not found', 404);
      }

      const existingReport = existingResult.rows[0];

      // Check permissions
      if (existingReport.created_by !== req.user.id && !req.user.isAdmin) {
        throw createError('Permission denied to delete this report', 403);
      }

      // Soft delete the report
      await db.query(
        'UPDATE custom_report_templates SET is_active = false WHERE id = $1',
        [reportId]
      );

      logger.info(`Custom report deleted: ${reportId} by user ${req.user.username}`);

      res.json({
        success: true,
        message: 'Custom report deleted successfully'
      });

    } catch (error) {
      logger.error(`Failed to delete custom report ${reportId}:`, error);
      throw error;
    }
  });

  /**
   * Test a custom query without saving
   * POST /api/reports/custom/test
   */
  testCustomQuery = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw createError('Authentication required', 401);
    }

    const { source, query, parameters = {}, limit = 10 } = req.body;

    try {
      // Use the unified PreviewService for all preview functionality
      const previewService = await serviceFactory.getPreviewService();
      
      const previewResponse = await previewService.executePreview({
        source,
        query,
        parameters,
        limit
      });
      
      res.json(previewResponse);

    } catch (error) {
      logger.error('Custom query test failed:', error);
      throw error;
    }
  });

  /**
   * Preview a report template with limited results
   * POST /api/reports/templates/:id/preview
   */
  previewTemplate = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw createError('Authentication required', 401);
    }

    const { id } = req.params;
    const { parameters = {}, limit = 10 } = req.body;

    try {
      const startTime = Date.now();

      // Get template details 
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
      
      let templateResult;
      if (isUUID) {
        templateResult = await db.query(
          'SELECT name, category, report_type FROM report_templates WHERE id = $1',
          [id]
        );
      } else {
        templateResult = await db.query(
          'SELECT name, category, report_type FROM report_templates WHERE report_type = $1',
          [id]
        );
      }
      
      if (templateResult.rows.length === 0) {
        throw createError('Template not found', 404);
      }

      const template = templateResult.rows[0];

      // Get template query configuration (if it exists)
      let templateQuery = null;
      try {
        const queryResult = await db.query(
          'SELECT query_config FROM report_templates WHERE ' + (isUUID ? 'id = $1' : 'report_type = $1'),
          [isUUID ? id : template.report_type]
        );
        
        if (queryResult.rows.length > 0 && queryResult.rows[0].query_config) {
          templateQuery = queryResult.rows[0].query_config;
        }
      } catch (error) {
        logger.warn('Could not fetch template query config:', error);
      }

      let previewData: any[] = [];
      let executionTime = 0;

      if (templateQuery) {
        // If we have a query configuration, use the PreviewService
        const previewService = await serviceFactory.getPreviewService();
        const previewResponse = await previewService.executePreview({
          source: template.category as 'ad' | 'azure' | 'o365',
          query: templateQuery,
          parameters: parameters,
          limit: limit || 10
        });

        if (previewResponse.success && previewResponse.data) {
          previewData = previewResponse.data.testData || [];
          executionTime = previewResponse.data.executionTime || 0;
        } else {
          throw createError(previewResponse.error?.message || 'Preview execution failed', 500);
        }
      } else {
        // Fallback: Use reportExecutor with limited results 
        // This is the safest approach - same execution as full report but limit the data
        // Note: This will save to history, but ensures same data as full report
        const result = await reportExecutor.executeReport({
          userId: req.user.id,
          templateId: isUUID ? id : template.report_type,
          parameters,
          credentialId: req.body.credentialId ? parseInt(req.body.credentialId) : undefined
        });

        if (!result.success) {
          throw createError(result.error || 'Preview execution failed', 500);
        }

        // Get the actual data, but limit it for preview
        const fullData = ((result as any)?.data) || [];
        previewData = fullData.slice(0, limit || 10);
        executionTime = Date.now() - startTime;
        
        logger.info('Preview used execution with history saved', {
          templateId: id,
          userId: req.user.id,
          executionId: result.executionId,
          previewRowCount: previewData.length,
          totalRowCount: fullData.length
        });
      }

      // Return in PreviewResponse format
      const previewResponse = {
        success: true,
        data: {
          source: template.category || 'ad',
          executionTime,
          testData: previewData,
          rowCount: previewData.length,
          isTestRun: true,
          templateInfo: {
            id: id,
            name: template.name,
            category: template.category,
            reportType: template.report_type
          }
        }
      };

      res.json(previewResponse);

    } catch (error) {
      logger.error(`Template preview failed for ${id}:`, error);
      throw error;
    }
  });

  /**
   * Preview a custom report template with limited results
   * POST /api/reports/custom/:reportId/preview
   */
  previewCustomReport = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw createError('Authentication required', 401);
    }

    const { reportId } = req.params;
    const { parameters = {}, limit = 10 } = req.body;

    try {
      const startTime = Date.now();

      // Get custom report details
      const reportResult = await db.query(
        'SELECT name, source, query FROM custom_report_templates WHERE id = $1 AND is_active = true',
        [reportId]
      );
      
      if (reportResult.rows.length === 0) {
        throw createError('Custom report not found', 404);
      }

      const customReport = reportResult.rows[0];

      // Get the PreviewService
      const previewService = await serviceFactory.getPreviewService();

      // Execute preview using the stored query
      const previewResponse = await previewService.executePreview({
        source: customReport.source as 'ad' | 'azure' | 'o365',
        query: customReport.query,
        parameters: parameters,
        limit: limit || 10
      });

      if (!previewResponse.success || !previewResponse.data) {
        throw createError(previewResponse.error?.message || 'Custom report preview failed', 500);
      }

      // Return in PreviewResponse format
      const response = {
        success: true,
        data: {
          source: customReport.source,
          executionTime: previewResponse.data.executionTime || (Date.now() - startTime),
          testData: previewResponse.data.testData || [],
          rowCount: previewResponse.data.rowCount || 0,
          isTestRun: true,
          templateInfo: {
            id: reportId,
            name: customReport.name,
            source: customReport.source,
            isCustom: true
          }
        }
      };

      res.json(response);

    } catch (error) {
      logger.error(`Custom report preview failed for ${reportId}:`, error);
      throw error;
    }
  });

  /**
   * Get report statistics for dashboard
   * GET /api/reports/stats
   */
  getReportStats = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw createError('Authentication required', 401);
    }

    try {
      // Get basic counts
      const [templatesCount, customReportsCount, executionsCount, recentExecutions, popularReports] = await Promise.all([
        // Total pre-built templates
        db.query('SELECT COUNT(*) as count FROM report_templates WHERE is_active = true'),
        
        // Total custom reports (user's + public)
        db.query(
          'SELECT COUNT(*) as count FROM custom_report_templates WHERE is_active = true AND (created_by = $1 OR is_public = true)',
          [req.user.id]
        ),
        
        // Total executions by user
        db.query('SELECT COUNT(*) as count FROM report_history WHERE user_id = $1', [req.user.id]),
        
        // Recent executions (last 10)
        db.query(
          `SELECT rh.id, 
                  COALESCE(rt.name, crt.name) as "reportName",
                  COALESCE(rt.category, crt.source) as "reportCategory",
                  rh.generated_at as "generatedAt",
                  rh.row_count as "rowCount",
                  rh.execution_time_ms as "executionTimeMs",
                  rh.status
           FROM report_history rh
           LEFT JOIN report_templates rt ON rh.template_id = rt.id
           LEFT JOIN custom_report_templates crt ON rh.custom_template_id = crt.id
           WHERE rh.user_id = $1 AND rh.status = 'completed'
           ORDER BY rh.generated_at DESC
           LIMIT 10`,
          [req.user.id]
        ),
        
        // Popular pre-built reports
        db.query(
          `SELECT id, name, description, category, execution_count, average_execution_time
           FROM report_templates 
           WHERE is_active = true 
           ORDER BY execution_count DESC 
           LIMIT 5`
        )
      ]);

      // Calculate reports by source
      const reportsBySource = await db.query(
        `SELECT 
           source,
           COUNT(*) as count
         FROM (
           SELECT category as source FROM report_templates WHERE is_active = true
           UNION ALL
           SELECT source FROM custom_report_templates 
           WHERE is_active = true AND (created_by = $1 OR is_public = true)
         ) combined
         GROUP BY source`,
        [req.user.id]
      );

      // Calculate executions by status
      const executionsByStatus = await db.query(
        `SELECT status, COUNT(*) as count
         FROM report_history 
         WHERE user_id = $1
         GROUP BY status`,
        [req.user.id]
      );

      // Transform data for response
      const reportsBySourceObj = reportsBySource.rows.reduce((acc: any, row: any) => {
        acc[row.source] = parseInt(row.count);
        return acc;
      }, {});

      const executionsByStatusObj = executionsByStatus.rows.reduce((acc: any, row: any) => {
        acc[row.status] = parseInt(row.count);
        return acc;
      }, {});

      res.json({
        success: true,
        data: {
          totalReports: parseInt(templatesCount.rows[0].count),
          totalCustomReports: parseInt(customReportsCount.rows[0].count),
          totalExecutions: parseInt(executionsCount.rows[0].count),
          recentExecutions: recentExecutions.rows,
          popularReports: popularReports.rows,
          reportsBySource: reportsBySourceObj,
          executionsByStatus: executionsByStatusObj
        }
      });

    } catch (error) {
      logger.error('Failed to get report statistics:', error);
      throw error;
    }
  });

  /**
   * GET /api/reports/history/:id
   * Get specific report execution details (metadata only)
   */
  getReportExecution = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    
    if (!req.user) {
      res.status(401).json({ message: 'User not authenticated' });
      return;
    }
    
    const userId = req.user.id;

    const result = await db.query(
      `SELECT rh.*, 
              rt.name as template_name,
              rt.category as template_category,
              rt.description as template_description,
              crt.name as custom_template_name,
              crt.source as custom_template_source
       FROM report_history rh
       LEFT JOIN report_templates rt ON rt.id = rh.template_id
       LEFT JOIN custom_report_templates crt ON crt.id = rh.custom_template_id
       WHERE rh.id = $1 AND rh.user_id = $2`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      throw createError('Report execution not found', 404);
    }

    const execution = result.rows[0];

    // Disable caching for execution data to ensure immediate updates
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    res.json({
      success: true,
      data: {
        id: execution.id,
        templateId: execution.template_id,
        customTemplateId: execution.custom_template_id,
        templateName: execution.template_name || execution.custom_template_name,
        category: execution.template_category || execution.custom_template_source,
        description: execution.template_description,
        generatedAt: execution.generated_at,
        startedAt: execution.started_at,
        completedAt: execution.completed_at,
        status: execution.status,
        parameters: execution.parameters,
        rowCount: execution.row_count,
        executionTimeMs: execution.execution_time_ms,
        errorMessage: execution.error_message
      }
    });
  });

  /**
   * GET /api/reports/history/:id/results
   * Get actual results data for a specific report execution
   */
  getReportResults = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    
    if (!req.user) {
      throw createError('Authentication required', 401);
    }

    // First verify the user owns this report history
    const historyResult = await db.query(
      `SELECT rh.id, rh.status, rh.row_count
       FROM report_history rh
       WHERE rh.id = $1 AND rh.user_id = $2`,
      [id, req.user.id]
    );

    if (historyResult.rows.length === 0) {
      throw createError('Report execution not found', 404);
    }

    const history = historyResult.rows[0];

    // Check status - the status enum values in the database
    if (history.status !== 'completed' && history.status !== 'success') {
      throw createError('Results only available for completed reports', 400);
    }

    // Get the results data from report_results table
    const resultsQuery = await db.query(
      `SELECT result_data, created_at, expires_at
       FROM report_results
       WHERE history_id = $1`,
      [id]
    );

    // Disable caching for results data to ensure immediate updates
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    if (resultsQuery.rows.length === 0) {
      // No results in report_results table
      // Check if this is a report with 0 results or truly missing data
      if (history.row_count === 0) {
        // Report completed successfully but found no matching records
        res.json({
          success: true,
          data: {
            historyId: id,
            results: [],
            resultCount: 0,
            createdAt: new Date().toISOString(),
            expiresAt: null,
            message: 'Report completed successfully but no matching records were found.'
          }
        });
      } else {
        // Results data is missing (older reports or data expired)
        res.json({
          success: true,
          data: {
            historyId: id,
            results: [],
            resultCount: history.row_count || 0,
            createdAt: new Date().toISOString(),
            expiresAt: null,
            message: 'Results data not available. This may be an older report or the results have expired.'
          }
        });
      }
      return;
    }

    const results = resultsQuery.rows[0];

    res.json({
      success: true,
      data: {
        historyId: id,
        results: results.result_data,
        resultCount: history.row_count,
        createdAt: results.created_at,
        expiresAt: results.expires_at
      }
    });
  });

  /**
   * Get report execution history
   * GET /api/reports/history
   */
  getReportHistory = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw createError('Authentication required', 401);
    }

    const { status, source, limit = 50, offset = 0 } = req.query;

    try {
      let whereClause = 'WHERE rh.user_id = $1';
      const params: any[] = [req.user.id];

      if (status) {
        whereClause += ' AND rh.status = $' + (params.length + 1);
        params.push(status);
      }

      if (source) {
        whereClause += ' AND (rt.category = $' + (params.length + 1) + ' OR crt.source = $' + (params.length + 1) + ')';
        params.push(source);
      }

      const limitNum = parseInt(limit as string);
      const offsetNum = parseInt(offset as string);
      
      // First get the total count without limit/offset
      const countResult = await db.query(
        `SELECT COUNT(*) as total
         FROM report_history rh
         LEFT JOIN report_templates rt ON rh.template_id = rt.id
         LEFT JOIN custom_report_templates crt ON rh.custom_template_id = crt.id
         ${whereClause}`,
        params // Don't modify params yet
      );

      const totalCount = parseInt(countResult.rows[0].total);
      const page = Math.floor(offsetNum / limitNum) + 1;
      const totalPages = Math.ceil(totalCount / limitNum);

      // Now add limit and offset for the main query
      params.push(limitNum);
      params.push(offsetNum);

      const result = await db.query(
        `SELECT rh.*, 
                rt.name as template_name, rt.category as template_category,
                crt.name as custom_template_name, crt.source as custom_template_source
         FROM report_history rh
         LEFT JOIN report_templates rt ON rh.template_id = rt.id
         LEFT JOIN custom_report_templates crt ON rh.custom_template_id = crt.id
         ${whereClause}
         ORDER BY rh.generated_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );

      // Disable caching for history data to ensure immediate updates
      res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });

      res.json({
        success: true,
        data: result.rows,
        history: result.rows, // For backwards compatibility
        page,
        pageSize: limitNum,
        totalCount,
        totalPages,
        limit: limitNum,
        offset: offsetNum
      });

    } catch (error) {
      logger.error('Failed to get report history:', error);
      throw error;
    }
  });

  // Helper methods
  private validateCustomQuery(query: CustomQuery): void {
    if (!query.source || !['ad', 'azure', 'o365'].includes(query.source)) {
      throw createError('Invalid or missing data source', 400);
    }

    if (!query.fields || !Array.isArray(query.fields) || query.fields.length === 0) {
      throw createError('At least one field must be selected', 400);
    }

    // Validate field names
    for (const field of query.fields) {
      if (!field.name || typeof field.name !== 'string') {
        throw createError('Invalid field specification', 400);
      }
    }

    // Validate filters if provided
    if (query.filters && Array.isArray(query.filters)) {
      for (const filter of query.filters) {
        if (!filter.field || !filter.operator) {
          throw createError('Invalid filter specification', 400);
        }
        
        const validOperators = ['equals', 'notEquals', 'contains', 'notContains', 'startsWith', 'endsWith', 
                                'greaterThan', 'lessThan', 'greaterThanOrEqual', 'lessThanOrEqual', 
                                'isEmpty', 'isNotEmpty', 'not_equals', 'greater_than', 'less_than', 
                                'older_than', 'newer_than', 'exists', 'not_exists'];
        if (!validOperators.includes(filter.operator)) {
          throw createError(`Invalid filter operator: ${filter.operator}`, 400);
        }
      }
    }
  }




  private async saveReportHistory(historyData: {
    templateId?: string;
    customTemplateId?: string;
    userId: number;
    parameters: any;
    status: 'completed' | 'failed';
    rowCount?: number;
    executionTime?: number;
    format?: string;
    errorMessage?: string;
    results?: any[];
  }): Promise<string | null> {
    try {
      // Status should match the enum values: pending, running, completed, failed, cancelled
      const status = historyData.status;
      
      // Use templateId or customTemplateId as the report_id
      // const __reportId = historyData.templateId || historyData.customTemplateId || 'unknown';

      // Get template UUID if we have a report_type string
      let templateUUID = historyData.templateId;
      if (templateUUID && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(templateUUID)) {
        // It's a report_type, not a UUID - fetch the actual template
        const templateResult = await db.query(
          'SELECT id FROM report_templates WHERE report_type = $1',
          [templateUUID]
        );
        if (templateResult.rows.length > 0) {
          templateUUID = templateResult.rows[0].id;
        }
      }

      // Get data source and report name from template if available
      let dataSource = null;
      let reportName = null;
      if (templateUUID) {
        const sourceResult = await db.query(
          'SELECT category, name FROM report_templates WHERE id = $1',
          [templateUUID]
        );
        if (sourceResult.rows.length > 0) {
          dataSource = sourceResult.rows[0].category;
          reportName = sourceResult.rows[0].name;
        }
      } else if (historyData.customTemplateId) {
        const sourceResult = await db.query(
          'SELECT source, name FROM custom_report_templates WHERE id = $1',
          [historyData.customTemplateId]
        );
        if (sourceResult.rows.length > 0) {
          dataSource = sourceResult.rows[0].source;
          reportName = sourceResult.rows[0].name;
        }
      }

      // Get request info if available
      const req = (historyData as any).req;
      const clientIp = req?.ip || req?.connection?.remoteAddress || null;
      const userAgent = req?.headers?.['user-agent'] || null;

      // Insert into report_history - try with new columns, fallback if they don't exist
      let historyResult;
      try {
        // Try with all new columns
        historyResult = await db.query(
          `INSERT INTO report_history 
           (user_id, template_id, custom_template_id, generated_at, started_at, completed_at,
            parameters, status, row_count, execution_time_ms, error_message, data_source,
            report_name, client_ip, user_agent, metadata)
           VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
            $4, $5::report_status_type, $6, $7, $8, $9,
            $10, $11, $12, $13)
           RETURNING id`,
          [
            historyData.userId,
            templateUUID || null,
            historyData.customTemplateId || null,
            JSON.stringify(historyData.parameters),
            status,
            historyData.rowCount || 0,
            historyData.executionTime || 0,
            historyData.errorMessage || null,
            dataSource,
            reportName,
            clientIp,
            userAgent,
            JSON.stringify({
              format: historyData.format || 'json',
              executionType: 'api',
              version: '2.0'
            })
          ]
        );
      } catch (error: any) {
        // If columns don't exist, try without them
        if (error.code === '42703') { // column does not exist
          logger.warn('New columns not available, using fallback insert');
          historyResult = await db.query(
            `INSERT INTO report_history 
             (user_id, template_id, custom_template_id, generated_at, started_at, completed_at,
              parameters, status, row_count, execution_time_ms, error_message, data_source)
             VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
              $4, $5::report_status_type, $6, $7, $8, $9)
             RETURNING id`,
            [
              historyData.userId,
              templateUUID || null,
              historyData.customTemplateId || null,
              JSON.stringify(historyData.parameters),
              status,
              historyData.rowCount || 0,
              historyData.executionTime || 0,
              historyData.errorMessage || null,
              dataSource
            ]
          );
        } else {
          throw error;
        }
      }

      // Store results in report_results table if we have them
      if (historyData.results && historyResult.rows.length > 0) {
        const historyId = historyResult.rows[0].id;
        await db.query(
          `INSERT INTO report_results (history_id, result_data, expires_at)
           VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
          [historyId, JSON.stringify(historyData.results)]
        );
      }
      
      // Return the execution ID
      return historyResult.rows.length > 0 ? historyResult.rows[0].id : null;
    } catch (error) {
      logger.error('Failed to save report history:', error);
      return null;
    }
  }

  private async updateTemplateStats(templateId: string, executionTime: number): Promise<void> {
    try {
      await db.query(
        `UPDATE report_templates 
         SET execution_count = execution_count + 1,
             average_execution_time = COALESCE(
               (average_execution_time * (execution_count - 1) + $1) / execution_count,
               $1
             )
         WHERE id = $2`,
        [executionTime, templateId]
      );
    } catch (error) {
      logger.error('Failed to update template stats:', error);
    }
  }

  private async updateCustomTemplateStats(templateId: string, executionTime: number): Promise<void> {
    try {
      await db.query(
        `UPDATE custom_report_templates 
         SET execution_count = execution_count + 1,
             last_executed = CURRENT_TIMESTAMP,
             average_execution_time = COALESCE(
               (average_execution_time * (execution_count - 1) + $1) / execution_count,
               $1
             )
         WHERE id = $2`,
        [executionTime, templateId]
      );
    } catch (error) {
      logger.error('Failed to update custom template stats:', error);
    }
  }

  /**
   * Add a report to user's favorites
   * POST /api/reports/favorites
   */
  addToFavorites = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { templateId, customTemplateId } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      throw createError('Authentication required', 401);
    }

    if (!templateId && !customTemplateId) {
      throw createError('Either templateId or customTemplateId is required', 400);
    }

    if (templateId && customTemplateId) {
      throw createError('Only one of templateId or customTemplateId should be provided', 400);
    }

    try {
      // Check if already favorited
      const existingQuery = `
        SELECT id FROM report_favorites 
        WHERE user_id = $1 
        AND (
          (template_id = $2 AND $2 IS NOT NULL) OR 
          (custom_template_id = $3 AND $3 IS NOT NULL)
        )
      `;
      const existing = await db.query(existingQuery, [userId, templateId || null, customTemplateId || null]);

      if (existing.rows.length > 0) {
        res.json({ success: true, message: 'Already in favorites' });
        return;
      }

      // Add to favorites
      const insertQuery = `
        INSERT INTO report_favorites (user_id, template_id, custom_template_id)
        VALUES ($1, $2, $3)
        RETURNING id
      `;
      await db.query(insertQuery, [userId, templateId || null, customTemplateId || null]);

      logger.info(`Report added to favorites`, { userId, templateId, customTemplateId });
      res.json({ success: true, message: 'Added to favorites' });
    } catch (error) {
      logger.error('Error adding to favorites:', error);
      throw createError('Failed to add to favorites', 500);
    }
  });

  /**
   * Remove a report from user's favorites
   * DELETE /api/reports/favorites
   */
  removeFromFavorites = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { templateId, customTemplateId } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      throw createError('Authentication required', 401);
    }

    if (!templateId && !customTemplateId) {
      throw createError('Either templateId or customTemplateId is required', 400);
    }

    try {
      const deleteQuery = `
        DELETE FROM report_favorites 
        WHERE user_id = $1 
        AND (
          (template_id = $2 AND $2 IS NOT NULL) OR 
          (custom_template_id = $3 AND $3 IS NOT NULL)
        )
      `;
      const result = await db.query(deleteQuery, [userId, templateId || null, customTemplateId || null]);

      if (result.rowCount === 0) {
        throw createError('Favorite not found', 404);
      }

      logger.info(`Report removed from favorites`, { userId, templateId, customTemplateId });
      res.json({ success: true, message: 'Removed from favorites' });
    } catch (error: any) {
      if (error.statusCode === 404) throw error;
      logger.error('Error removing from favorites:', error);
      throw createError('Failed to remove from favorites', 500);
    }
  });

  /**
   * Get user's favorite reports
   * GET /api/reports/favorites
   */
  getFavorites = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id;

    if (!userId) {
      throw createError('Authentication required', 401);
    }

    try {
      // Get both pre-built and custom favorite reports
      const query = `
        SELECT 
          rf.id as favorite_id,
          rf.created_at as favorited_at,
          -- Pre-built template fields
          rt.id as template_id,
          rt.name,
          rt.description,
          rt.category,
          rt.report_type,
          rt.category as data_source,
          rt.query_template,
          rt.default_parameters as parameters,
          rt.is_active,
          'pre-built' as type,
          -- Custom template fields
          crt.id as custom_template_id,
          crt.name as custom_name,
          crt.description as custom_description,
          crt.query as custom_query,
          crt.source as custom_source,
          crt.is_public as custom_is_public,
          crt.tags as custom_tags,
          crt.category as custom_category,
          'custom' as custom_type
        FROM report_favorites rf
        LEFT JOIN report_templates rt ON rf.template_id = rt.id
        LEFT JOIN custom_report_templates crt ON rf.custom_template_id = crt.id
        WHERE rf.user_id = $1
        ORDER BY rf.created_at DESC
      `;

      const result = await db.query(query, [userId]);

      // Transform the results to a unified format
      const favorites = result.rows.map((row: any) => {
        if (row.template_id) {
          // Pre-built template
          return {
            id: row.template_id,
            name: row.name,
            description: row.description,
            category: row.category,
            dataSource: row.data_source,
            type: 'pre-built',
            isFavorite: true,
            favoritedAt: row.favorited_at,
            reportType: row.report_type,
            parameters: row.parameters
          };
        } else {
          // Custom template
          return {
            id: row.custom_template_id,
            name: row.custom_name,
            description: row.custom_description,
            category: row.custom_category,
            dataSource: row.custom_source,
            type: 'custom',
            isFavorite: true,
            favoritedAt: row.favorited_at,
            query: row.custom_query,
            tags: row.custom_tags,
            isPublic: row.custom_is_public
          };
        }
      });

      res.json({
        success: true,
        data: favorites,
        total: favorites.length
      });
    } catch (error) {
      logger.error('Error fetching favorites:', error);
      throw createError('Failed to fetch favorites', 500);
    }
  });

  /**
   * Delete a single report execution from history
   * DELETE /api/reports/history/:id
   */
  deleteReportExecution = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const userId = (req as any).user?.id;

    if (!userId) {
      throw createError('User not authenticated', 401);
    }

    try {
      // Check if the report execution exists and belongs to the user
      const existingExecution = await db.query(
        'SELECT id, user_id FROM report_history WHERE id = $1',
        [id]
      );

      if (existingExecution.rows.length === 0) {
        throw createError('Report execution not found', 404);
      }

      if (existingExecution.rows[0].user_id !== userId) {
        throw createError('Access denied', 403);
      }

      // Delete the report execution
      await db.query(
        'DELETE FROM report_history WHERE id = $1 AND user_id = $2',
        [id, userId]
      );

      logger.info(`Report execution ${id} deleted by user ${userId}`);
      
      res.status(200).json({
        success: true,
        message: 'Report execution deleted successfully'
      });
    } catch (error: any) {
      if (error.statusCode) {
        throw error;
      }
      logger.error('Error deleting report execution:', error);
      throw createError('Failed to delete report execution', 500);
    }
  });

  /**
   * Delete multiple report executions from history (bulk delete)
   * DELETE /api/reports/history/bulk
   */
  bulkDeleteReportExecutions = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { ids } = req.body;
    const userId = (req as any).user?.id;

    if (!userId) {
      throw createError('User not authenticated', 401);
    }

    if (!Array.isArray(ids) || ids.length === 0) {
      throw createError('Invalid or empty ids array', 400);
    }

    // Validate that all IDs are valid UUIDs
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const invalidIds = ids.filter(id => typeof id !== 'string' || !uuidRegex.test(id));
    
    if (invalidIds.length > 0) {
      throw createError('Invalid UUID format in ids array', 400);
    }

    try {
      // Check which reports exist and belong to the user
      const existingExecutions = await db.query(
        'SELECT id FROM report_history WHERE id = ANY($1) AND user_id = $2',
        [ids, userId]
      );

      const existingIds = existingExecutions.rows.map((row: any) => row.id);
      const notFoundIds = ids.filter(id => !existingIds.includes(id));

      if (existingIds.length === 0) {
        throw createError('No report executions found or access denied', 404);
      }

      // Delete the report executions
      const result = await db.query(
        'DELETE FROM report_history WHERE id = ANY($1) AND user_id = $2',
        [existingIds, userId]
      );

      logger.info(`Bulk deleted ${result.rowCount} report executions by user ${userId}`);
      
      res.status(200).json({
        success: true,
        message: `Successfully deleted ${result.rowCount} report executions`,
        deleted: result.rowCount,
        notFound: notFoundIds.length,
        notFoundIds: notFoundIds.length > 0 ? notFoundIds : undefined
      });
    } catch (error: any) {
      if (error.statusCode) {
        throw error;
      }
      logger.error('Error bulk deleting report executions:', error);
      throw createError('Failed to bulk delete report executions', 500);
    }
  });
}

// Validation rules
export const createCustomReportValidation = [
  body('name')
    .isLength({ min: 1, max: 255 })
    .withMessage('Report name is required and must be less than 255 characters')
    .trim()
    .escape(),
  body('description')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Description must be less than 1000 characters')
    .trim()
    .escape(),
  body('source')
    .isIn(['ad', 'azure', 'o365'])
    .withMessage('Data source must be ad, azure, or o365'),
  body('query')
    .isObject()
    .withMessage('Query must be a valid object'),
  body('query.fields')
    .isArray({ min: 1 })
    .withMessage('At least one field must be selected'),
  body('isPublic')
    .optional()
    .isBoolean()
    .withMessage('isPublic must be a boolean'),
  body('category')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Category must be less than 100 characters')
    .trim()
    .escape(),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array')
];

export const executeReportValidation = [
  param('templateId')
    .isUUID()
    .withMessage('Invalid template ID'),
  body('parameters')
    .optional()
    .isObject()
    .withMessage('Parameters must be an object'),
  body('format')
    .optional()
    .isIn(['json', 'csv', 'excel'])
    .withMessage('Format must be json, csv, or excel')
];

// Export controller instance
export const reportsController = new ReportsController();
