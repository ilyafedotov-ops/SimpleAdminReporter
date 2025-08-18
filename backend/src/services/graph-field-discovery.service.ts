import { azureMsalService } from './azure-msal.service';
import { CredentialContext } from './base';
import { logger } from '../utils/logger';
import { db } from '../config/database';
import { COMMON_SELECT_FIELDS } from '../queries/graph/types';

export interface GraphFieldInfo {
  name: string;
  displayName: string;
  type: string;
  description?: string;
  category: string;
  isSearchable: boolean;
  isSortable: boolean;
  isExpandable: boolean;
  sampleValues?: any[];
  relatedEntity?: string;
}

export interface GraphEntitySchema {
  entityType: 'user' | 'group' | 'application' | 'device' | 'directoryRole';
  fields: GraphFieldInfo[];
  relationships: {
    name: string;
    targetEntity: string;
    type: 'one-to-one' | 'one-to-many' | 'many-to-many';
  }[];
  supportedOperations: string[];
}

export class GraphFieldDiscoveryService {
  private azureService: typeof azureMsalService;
  private logger = logger.child({ service: 'GraphFieldDiscovery' });
  private schemaCache = new Map<string, GraphEntitySchema>();
  
  constructor(azureService?: typeof azureMsalService) {
    this.azureService = azureService || azureMsalService;
  }
  
  /**
   * Discover available fields for a Graph entity type
   */
  async discoverFields(
    entityType: 'user' | 'group' | 'application' | 'device' | 'directoryRole',
    context?: CredentialContext
  ): Promise<GraphEntitySchema> {
    // Check cache first
    const cacheKey = `${entityType}_${context?.userId || 'system'}`;
    if (this.schemaCache.has(cacheKey)) {
      return this.schemaCache.get(cacheKey)!;
    }
    
    try {
      // Get schema based on entity type
      const schema = await this.getEntitySchema(entityType);
      
      // Try to get sample data to enrich field information
      try {
        const sampleData = await this.getSampleData(entityType, context);
        if (sampleData.length > 0) {
          schema.fields = this.enrichFieldsWithSampleData(schema.fields, sampleData);
        }
      } catch (sampleError) {
        this.logger.warn('Failed to get sample data for field enrichment', {
          entityType,
          error: sampleError instanceof Error ? sampleError.message : sampleError
        });
        // Continue with static schema if sample data fails
      }
      
      // Cache the result
      this.schemaCache.set(cacheKey, schema);
      
      // Also store in database for persistence
      await this.storeFieldMetadata(entityType, schema);
      
      return schema;
    } catch (error) {
      this.logger.error('Failed to discover fields', { 
        entityType, 
        error: error instanceof Error ? ((error as any)?.message || String(error)) : error,
        stack: error instanceof Error ? error.stack : undefined,
        isAuthError: this.isAuthenticationError(error)
      });
      
      // Check if this is an authentication error and propagate it
      if (this.isAuthenticationError(error)) {
        throw new Error('Azure AD authentication required. Please authenticate with your Azure AD account to access Microsoft Graph API.');
      }
      
      // For other errors, return static schema as fallback
      this.logger.info(`Returning static schema for ${entityType} due to error`);
      return this.getStaticSchema(entityType);
    }
  }
  
  /**
   * Check if an error is an authentication error
   */
  private isAuthenticationError(error: any): boolean {
    if (!error) return false;
    
    const errorMsg = ((error as any)?.message || String(error))?.toLowerCase() || '';
    const errorCode = error.code?.toLowerCase() || '';
    
    return (
      errorMsg.includes('authentication') ||
      errorMsg.includes('unauthorized') ||
      errorMsg.includes('401') ||
      errorMsg.includes('no credentials') ||
      errorMsg.includes('access denied') ||
      errorCode === 'no_credentials' ||
      errorCode === 'unauthenticated' ||
      error.status === 401
    );
  }
  
  /**
   * Get static schema definition for an entity type
   */
  private getStaticSchema(entityType: string): GraphEntitySchema {
    switch (entityType) {
      case 'user':
        return {
          entityType: 'user',
          fields: this.getUserFields(),
          relationships: [
            { name: 'manager', targetEntity: 'user', type: 'one-to-one' },
            { name: 'directReports', targetEntity: 'user', type: 'one-to-many' },
            { name: 'memberOf', targetEntity: 'group', type: 'many-to-many' },
            { name: 'ownedDevices', targetEntity: 'device', type: 'one-to-many' }
          ],
          supportedOperations: ['read', 'update', 'delete', 'list']
        };
        
      case 'group':
        return {
          entityType: 'group',
          fields: this.getGroupFields(),
          relationships: [
            { name: 'members', targetEntity: 'user', type: 'many-to-many' },
            { name: 'owners', targetEntity: 'user', type: 'many-to-many' },
            { name: 'memberOf', targetEntity: 'group', type: 'many-to-many' }
          ],
          supportedOperations: ['read', 'update', 'delete', 'list', 'addMember', 'removeMember']
        };
        
      case 'application':
        return {
          entityType: 'application',
          fields: this.getApplicationFields(),
          relationships: [
            { name: 'owners', targetEntity: 'user', type: 'many-to-many' }
          ],
          supportedOperations: ['read', 'update', 'delete', 'list']
        };
        
      default:
        return {
          entityType: entityType as any,
          fields: [],
          relationships: [],
          supportedOperations: ['read', 'list']
        };
    }
  }
  
  /**
   * Get user fields
   */
  private getUserFields(): GraphFieldInfo[] {
    return [
      // Basic Information
      { name: 'id', displayName: 'User ID', type: 'string', category: 'basic', isSearchable: true, isSortable: true, isExpandable: false },
      { name: 'displayName', displayName: 'Display Name', type: 'string', category: 'basic', isSearchable: true, isSortable: true, isExpandable: false },
      { name: 'userPrincipalName', displayName: 'User Principal Name', type: 'string', category: 'basic', isSearchable: true, isSortable: true, isExpandable: false },
      { name: 'mail', displayName: 'Email', type: 'string', category: 'basic', isSearchable: true, isSortable: true, isExpandable: false },
      { name: 'mailNickname', displayName: 'Mail Nickname', type: 'string', category: 'basic', isSearchable: true, isSortable: true, isExpandable: false },
      { name: 'givenName', displayName: 'First Name', type: 'string', category: 'basic', isSearchable: true, isSortable: true, isExpandable: false },
      { name: 'surname', displayName: 'Last Name', type: 'string', category: 'basic', isSearchable: true, isSortable: true, isExpandable: false },
      
      // Account Information
      { name: 'accountEnabled', displayName: 'Account Enabled', type: 'boolean', category: 'account', isSearchable: false, isSortable: true, isExpandable: false },
      { name: 'userType', displayName: 'User Type', type: 'string', category: 'account', isSearchable: true, isSortable: true, isExpandable: false, sampleValues: ['Member', 'Guest'] },
      { name: 'createdDateTime', displayName: 'Created Date', type: 'datetime', category: 'account', isSearchable: false, isSortable: true, isExpandable: false },
      { name: 'deletedDateTime', displayName: 'Deleted Date', type: 'datetime', category: 'account', isSearchable: false, isSortable: true, isExpandable: false },
      { name: 'lastPasswordChangeDateTime', displayName: 'Last Password Change', type: 'datetime', category: 'account', isSearchable: false, isSortable: true, isExpandable: false },
      
      // Organization Information
      { name: 'department', displayName: 'Department', type: 'string', category: 'organization', isSearchable: true, isSortable: true, isExpandable: false },
      { name: 'jobTitle', displayName: 'Job Title', type: 'string', category: 'organization', isSearchable: true, isSortable: true, isExpandable: false },
      { name: 'companyName', displayName: 'Company', type: 'string', category: 'organization', isSearchable: true, isSortable: true, isExpandable: false },
      { name: 'officeLocation', displayName: 'Office Location', type: 'string', category: 'organization', isSearchable: true, isSortable: true, isExpandable: false },
      { name: 'employeeId', displayName: 'Employee ID', type: 'string', category: 'organization', isSearchable: true, isSortable: true, isExpandable: false },
      { name: 'employeeType', displayName: 'Employee Type', type: 'string', category: 'organization', isSearchable: true, isSortable: true, isExpandable: false },
      
      // Contact Information
      { name: 'businessPhones', displayName: 'Business Phones', type: 'array', category: 'contact', isSearchable: false, isSortable: false, isExpandable: false },
      { name: 'mobilePhone', displayName: 'Mobile Phone', type: 'string', category: 'contact', isSearchable: true, isSortable: true, isExpandable: false },
      { name: 'streetAddress', displayName: 'Street Address', type: 'string', category: 'contact', isSearchable: true, isSortable: true, isExpandable: false },
      { name: 'city', displayName: 'City', type: 'string', category: 'contact', isSearchable: true, isSortable: true, isExpandable: false },
      { name: 'state', displayName: 'State', type: 'string', category: 'contact', isSearchable: true, isSortable: true, isExpandable: false },
      { name: 'postalCode', displayName: 'Postal Code', type: 'string', category: 'contact', isSearchable: true, isSortable: true, isExpandable: false },
      { name: 'country', displayName: 'Country', type: 'string', category: 'contact', isSearchable: true, isSortable: true, isExpandable: false },
      
      // Activity Information
      { name: 'signInActivity', displayName: 'Sign-In Activity', type: 'object', category: 'activity', isSearchable: false, isSortable: false, isExpandable: true },
      { name: 'lastSignInDateTime', displayName: 'Last Sign In', type: 'datetime', category: 'activity', isSearchable: false, isSortable: true, isExpandable: false, description: 'Part of signInActivity' },
      
      // Licensing
      { name: 'assignedLicenses', displayName: 'Assigned Licenses', type: 'array', category: 'licensing', isSearchable: false, isSortable: false, isExpandable: true },
      { name: 'assignedPlans', displayName: 'Assigned Plans', type: 'array', category: 'licensing', isSearchable: false, isSortable: false, isExpandable: true },
      { name: 'licenseDetails', displayName: 'License Details', type: 'array', category: 'licensing', isSearchable: false, isSortable: false, isExpandable: true },
      { name: 'usageLocation', displayName: 'Usage Location', type: 'string', category: 'licensing', isSearchable: true, isSortable: true, isExpandable: false },
      
      // Relationships
      { name: 'manager', displayName: 'Manager', type: 'object', category: 'relationships', isSearchable: false, isSortable: false, isExpandable: true, relatedEntity: 'user' },
      { name: 'directReports', displayName: 'Direct Reports', type: 'array', category: 'relationships', isSearchable: false, isSortable: false, isExpandable: true, relatedEntity: 'user' },
      { name: 'memberOf', displayName: 'Member Of', type: 'array', category: 'relationships', isSearchable: false, isSortable: false, isExpandable: true, relatedEntity: 'group' },
      
      // Security
      { name: 'authentication', displayName: 'Authentication Methods', type: 'object', category: 'security', isSearchable: false, isSortable: false, isExpandable: true },
      { name: 'identities', displayName: 'Identities', type: 'array', category: 'security', isSearchable: false, isSortable: false, isExpandable: false },
      { name: 'securityIdentifier', displayName: 'Security ID (SID)', type: 'string', category: 'security', isSearchable: true, isSortable: true, isExpandable: false }
    ];
  }
  
  /**
   * Get group fields
   */
  private getGroupFields(): GraphFieldInfo[] {
    return [
      // Basic Information
      { name: 'id', displayName: 'Group ID', type: 'string', category: 'basic', isSearchable: true, isSortable: true, isExpandable: false },
      { name: 'displayName', displayName: 'Display Name', type: 'string', category: 'basic', isSearchable: true, isSortable: true, isExpandable: false },
      { name: 'description', displayName: 'Description', type: 'string', category: 'basic', isSearchable: true, isSortable: true, isExpandable: false },
      { name: 'mail', displayName: 'Email', type: 'string', category: 'basic', isSearchable: true, isSortable: true, isExpandable: false },
      { name: 'mailNickname', displayName: 'Mail Nickname', type: 'string', category: 'basic', isSearchable: true, isSortable: true, isExpandable: false },
      
      // Group Type Information
      { name: 'groupTypes', displayName: 'Group Types', type: 'array', category: 'type', isSearchable: false, isSortable: false, isExpandable: false, sampleValues: ['Unified', 'DynamicMembership'] },
      { name: 'securityEnabled', displayName: 'Security Enabled', type: 'boolean', category: 'type', isSearchable: false, isSortable: true, isExpandable: false },
      { name: 'mailEnabled', displayName: 'Mail Enabled', type: 'boolean', category: 'type', isSearchable: false, isSortable: true, isExpandable: false },
      { name: 'visibility', displayName: 'Visibility', type: 'string', category: 'type', isSearchable: true, isSortable: true, isExpandable: false, sampleValues: ['Public', 'Private', 'HiddenMembership'] },
      
      // Dynamic Group Information
      { name: 'membershipRule', displayName: 'Membership Rule', type: 'string', category: 'dynamic', isSearchable: true, isSortable: false, isExpandable: false },
      { name: 'membershipRuleProcessingState', displayName: 'Rule Processing State', type: 'string', category: 'dynamic', isSearchable: true, isSortable: true, isExpandable: false, sampleValues: ['On', 'Paused'] },
      
      // Metadata
      { name: 'createdDateTime', displayName: 'Created Date', type: 'datetime', category: 'metadata', isSearchable: false, isSortable: true, isExpandable: false },
      { name: 'deletedDateTime', displayName: 'Deleted Date', type: 'datetime', category: 'metadata', isSearchable: false, isSortable: true, isExpandable: false },
      { name: 'renewedDateTime', displayName: 'Renewed Date', type: 'datetime', category: 'metadata', isSearchable: false, isSortable: true, isExpandable: false },
      { name: 'expirationDateTime', displayName: 'Expiration Date', type: 'datetime', category: 'metadata', isSearchable: false, isSortable: true, isExpandable: false },
      
      // Relationships
      { name: 'members', displayName: 'Members', type: 'array', category: 'relationships', isSearchable: false, isSortable: false, isExpandable: true, relatedEntity: 'user' },
      { name: 'owners', displayName: 'Owners', type: 'array', category: 'relationships', isSearchable: false, isSortable: false, isExpandable: true, relatedEntity: 'user' },
      { name: 'memberOf', displayName: 'Member Of', type: 'array', category: 'relationships', isSearchable: false, isSortable: false, isExpandable: true, relatedEntity: 'group' }
    ];
  }
  
  /**
   * Get application fields
   */
  private getApplicationFields(): GraphFieldInfo[] {
    return [
      { name: 'id', displayName: 'Object ID', type: 'string', category: 'basic', isSearchable: true, isSortable: true, isExpandable: false },
      { name: 'appId', displayName: 'Application ID', type: 'string', category: 'basic', isSearchable: true, isSortable: true, isExpandable: false },
      { name: 'displayName', displayName: 'Display Name', type: 'string', category: 'basic', isSearchable: true, isSortable: true, isExpandable: false },
      { name: 'createdDateTime', displayName: 'Created Date', type: 'datetime', category: 'basic', isSearchable: false, isSortable: true, isExpandable: false },
      { name: 'signInAudience', displayName: 'Sign-In Audience', type: 'string', category: 'configuration', isSearchable: true, isSortable: true, isExpandable: false },
      { name: 'identifierUris', displayName: 'Identifier URIs', type: 'array', category: 'configuration', isSearchable: false, isSortable: false, isExpandable: false },
      { name: 'publisherDomain', displayName: 'Publisher Domain', type: 'string', category: 'configuration', isSearchable: true, isSortable: true, isExpandable: false }
    ];
  }
  
  /**
   * Get entity schema with dynamic discovery
   */
  private async getEntitySchema(entityType: string): Promise<GraphEntitySchema> {
    // Start with static schema
    const staticSchema = this.getStaticSchema(entityType);
    
    // For now, return static schema
    // In future, could enhance with $metadata endpoint or dynamic discovery
    return staticSchema;
  }
  
  /**
   * Get sample data for field discovery
   */
  private async getSampleData(entityType: string, context?: CredentialContext): Promise<any[]> {
    try {
      let endpoint = '';
      let select: string[] = [];
      
      switch (entityType) {
        case 'user':
          endpoint = '/users';
          select = COMMON_SELECT_FIELDS.USER_FULL;
          break;
        case 'group':
          endpoint = '/groups';
          select = COMMON_SELECT_FIELDS.GROUP_FULL;
          break;
        case 'application':
          endpoint = '/applications';
          select = ['id', 'appId', 'displayName', 'createdDateTime', 'signInAudience'];
          break;
        default:
          return [];
      }
      
      const result = await this.azureService.executeQuery(
        { type: 'discovery', endpoint, graphOptions: { select, top: 5 } },
        context
      );
      
      return ((result as any)?.data) || [];
    } catch (error) {
      this.logger.warn('Failed to get sample data', { entityType, error });
      return [];
    }
  }
  
  /**
   * Enrich fields with information from sample data
   */
  private enrichFieldsWithSampleData(fields: GraphFieldInfo[], sampleData: any[]): GraphFieldInfo[] {
    if (sampleData.length === 0) return fields;
    
    // Analyze sample data to get additional field information
    const fieldAnalysis = new Map<string, any>();
    
    sampleData.forEach(item => {
      Object.keys(item).forEach(key => {
        if (!fieldAnalysis.has(key)) {
          fieldAnalysis.set(key, {
            values: new Set(),
            types: new Set(),
            isNull: false
          });
        }
        
        const analysis = fieldAnalysis.get(key);
        const value = item[key];
        
        if (value === null || value === undefined) {
          analysis.isNull = true;
        } else {
          analysis.types.add(typeof value);
          if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            analysis.values.add(value);
          }
        }
      });
    });
    
    // Update fields with discovered information
    return fields.map(field => {
      const analysis = fieldAnalysis.get(field.name);
      if (!analysis) return field;
      
      // Add sample values if we found a reasonable number
      if (analysis.values.size > 0 && analysis.values.size <= 10) {
        field.sampleValues = Array.from(analysis.values);
      }
      
      return field;
    });
  }
  
  /**
   * Store field metadata in database
   */
  private async storeFieldMetadata(entityType: string, schema: GraphEntitySchema): Promise<void> {
    try {
      const client = await db.getClient();
      
      try {
        await client.query('BEGIN');
        
        // Delete existing metadata for this entity type
        await client.query(
          'DELETE FROM field_metadata WHERE source = $1 AND field_name LIKE $2',
          ['azure', `${entityType}.%`]
        );
        
        // Insert new metadata
        for (const field of schema.fields) {
          await client.query(`
            INSERT INTO field_metadata (
              source, field_name, display_name, data_type, 
              description, is_searchable, is_sortable, is_exportable,
              is_sensitive, sample_values, category
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          `, [
            'azure',
            `${entityType}.${field.name}`,
            field.displayName || field.name,
            field.type,
            field.description || null,
            field.isSearchable !== false,
            field.isSortable !== false,
            true, // is_exportable
            false, // is_sensitive - default to false
            field.sampleValues || null,
            field.category || 'general'
          ]);
        }
        
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error: any) {
      this.logger.error('Failed to store field metadata', { 
        entityType, 
        error: ((error as any)?.message || String(error)),
        detail: error.detail,
        query: error.query,
        position: error.position,
        code: error.code
      });
    }
  }
  
  /**
   * Get all available Graph entities
   */
  async getAvailableEntities(): Promise<Array<{
    name: string;
    displayName: string;
    description: string;
    fieldCount: number;
  }>> {
    return [
      {
        name: 'user',
        displayName: 'Users',
        description: 'Azure AD user accounts including members and guests',
        fieldCount: this.getUserFields().length
      },
      {
        name: 'group',
        displayName: 'Groups',
        description: 'Security groups, Microsoft 365 groups, and distribution lists',
        fieldCount: this.getGroupFields().length
      },
      {
        name: 'application',
        displayName: 'Applications',
        description: 'Registered applications and service principals',
        fieldCount: this.getApplicationFields().length
      },
      {
        name: 'device',
        displayName: 'Devices',
        description: 'Devices registered or joined to Azure AD',
        fieldCount: 15 // Approximate
      },
      {
        name: 'directoryRole',
        displayName: 'Directory Roles',
        description: 'Azure AD administrative roles',
        fieldCount: 10 // Approximate
      }
    ];
  }
}

// Export singleton instance
let instance: GraphFieldDiscoveryService | null = null;

export function getGraphFieldDiscoveryService(azureService?: typeof azureMsalService): GraphFieldDiscoveryService {
  if (!instance || azureService) {
    instance = new GraphFieldDiscoveryService(azureService);
  }
  return instance;
}