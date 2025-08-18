import { QueryDefinition } from './types';
import { logger } from '@/utils/logger';
import { db } from '@/config/database';
import path from 'path';
import fs from 'fs/promises';

/**
 * Query Definition Registry
 * 
 * Manages loading, storing, and retrieving query definitions
 */
export class QueryDefinitionRegistry {
  private definitions: Map<string, QueryDefinition> = new Map();
  private initialized: boolean = false;
  
  constructor() {
    // Note: Registry will be initialized lazily when first accessed
    // This prevents blocking during application startup
  }
  
  /**
   * Initialize the registry by loading definitions from various sources
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return; // Prevent double initialization
    
    try {
      // Quick initialization without heavy database operations during startup
      this.initialized = true;
      logger.info('Query registry ready (lazy initialization)');
      
    } catch (error) {
      logger.error('Failed to initialize query registry:', error);
      throw error;
    }
  }
  
  /**
   * Get a query definition by ID
   */
  async getQuery(queryId: string): Promise<QueryDefinition | null> {
    await this.ensureInitialized();
    return this.definitions.get(queryId) || null;
  }
  
  /**
   * Get all query definitions with optional filters
   */
  async getQueries(filters?: {
    dataSource?: string;
    category?: string;
    search?: string;
  }): Promise<QueryDefinition[]> {
    await this.ensureInitialized();
    
    let queries = Array.from(this.definitions.values());
    
    if (filters) {
      if (filters.dataSource) {
        queries = queries.filter(q => q.dataSource === filters.dataSource);
      }
      
      if (filters.category) {
        queries = queries.filter(q => 
          q.id.includes(filters.category!) || 
          q.name.toLowerCase().includes(filters.category!.toLowerCase())
        );
      }
      
      if (filters.search) {
        const searchTerm = filters.search.toLowerCase();
        queries = queries.filter(q => 
          q.name.toLowerCase().includes(searchTerm) ||
          q.description.toLowerCase().includes(searchTerm) ||
          q.id.toLowerCase().includes(searchTerm)
        );
      }
    }
    
    return queries;
  }
  
  /**
   * Register a new query definition
   */
  async registerQuery(queryDef: QueryDefinition): Promise<void> {
    // Validate query definition
    this.validateQueryDefinition(queryDef);
    
    // Store in memory
    this.definitions.set(queryDef.id, queryDef);
    
    // Store in database for persistence
    await this.storeQueryDefinition(queryDef);
    
    logger.info(`Registered query definition: ${queryDef.id}`);
  }
  
  /**
   * Update an existing query definition
   */
  async updateQuery(queryId: string, updates: Partial<QueryDefinition>): Promise<void> {
    await this.ensureInitialized();
    
    const existing = this.definitions.get(queryId);
    if (!existing) {
      throw new Error(`Query definition not found: ${queryId}`);
    }
    
    const updated = { ...existing, ...updates };
    this.validateQueryDefinition(updated);
    
    this.definitions.set(queryId, updated);
    await this.storeQueryDefinition(updated);
    
    logger.info(`Updated query definition: ${queryId}`);
  }
  
  /**
   * Remove a query definition
   */
  async removeQuery(queryId: string): Promise<void> {
    await this.ensureInitialized();
    
    if (!this.definitions.has(queryId)) {
      throw new Error(`Query definition not found: ${queryId}`);
    }
    
    this.definitions.delete(queryId);
    
    // Remove from database
    await db.query('DELETE FROM query_definitions WHERE id = $1', [queryId]);
    
    logger.info(`Removed query definition: ${queryId}`);
  }
  
  /**
   * Reload all definitions from sources
   */
  async reload(): Promise<void> {
    this.definitions.clear();
    this.initialized = false;
    await this.initialize();
  }
  
  /**
   * Load built-in query definitions from the queries directory
   */
  private async loadBuiltInDefinitions(): Promise<void> {
    try {
      // Load PostgreSQL query definitions
      await this.loadDefinitionsFromDirectory(
        path.join(__dirname, '../../queries/postgres'),
        'postgres'
      );
      
      // Load LDAP query definitions and convert them
      await this.loadLDAPDefinitions();
      
      logger.info('Built-in query definitions loaded');
    } catch (error) {
      logger.error('Failed to load built-in definitions:', error);
    }
  }
  
  /**
   * Load LDAP query definitions and convert to new format
   */
  private async loadLDAPDefinitions(): Promise<void> {
    try {
      // Import the existing LDAP query definitions
      const { getAllQueries } = await import('../../queries/ldap');
      const ldapQueries = getAllQueries();
      
      for (const ldapQuery of ldapQueries) {
        // Convert LDAP query definition to new format
        const converted: QueryDefinition = {
          id: ldapQuery.id,
          name: ldapQuery.name,
          description: ldapQuery.description,
          version: '1.0.0',
          dataSource: 'ad',
          
          // Convert LDAP query to SQL-like format for consistency
          sql: this.convertLDAPToSQL(ldapQuery),
          
          // Convert parameters
          parameters: Object.entries(ldapQuery.parameters || {}).map(([key, param]: [string, any]) => ({
            name: key,
            type: param.type,
            required: param.required,
            default: param.default,
            description: param.description,
            transform: param.transform
          })),
          
          // Result mapping
          resultMapping: ldapQuery.fieldMappings ? {
            fieldMappings: Object.entries(ldapQuery.fieldMappings).reduce((acc, [key, mapping]: [string, any]) => {
              acc[key] = {
                targetField: mapping.displayName || key,
                type: mapping.type,
                transform: mapping.transform
              };
              return acc;
            }, {} as any),
            postProcess: ldapQuery.postProcess ? {
              filter: ldapQuery.postProcess.filter,
              sort: ldapQuery.postProcess.sort ? [ldapQuery.postProcess.sort] : undefined,
              limit: ldapQuery.postProcess.limit
            } : undefined
          } : undefined,
          
          // Access control
          access: {
            requiresAuth: true
          },
          
          // Performance constraints
          constraints: {
            maxResults: ldapQuery.query.sizeLimit || 5000,
            timeoutMs: (ldapQuery.query.timeLimit || 30) * 1000
          },
          
          // Enable caching for LDAP queries (they're usually expensive)
          cache: {
            enabled: true,
            ttlSeconds: 300, // 5 minutes
            keyTemplate: `ldap:${ldapQuery.id}:{{parameters_hash}}`
          }
        };
        
        this.definitions.set(converted.id, converted);
      }
      
      logger.info(`Converted ${ldapQueries.length} LDAP queries to new format`);
    } catch (error) {
      logger.error('Failed to load LDAP definitions:', error);
    }
  }
  
  /**
   * Convert LDAP query to standardized format for new query system
   */
  private convertLDAPToSQL(ldapQuery: any): string {
    // For LDAP queries, we store the original LDAP configuration as a special SQL format
    // The actual execution will be handled by the LDAP query executor
    return JSON.stringify({
      type: 'ldap',
      base: ldapQuery.query.base || process.env.AD_BASE_DN || 'DC=domain,DC=local',
      scope: ldapQuery.query.scope,
      filter: ldapQuery.query.filter,
      attributes: ldapQuery.query.attributes || [],
      sizeLimit: ldapQuery.query.sizeLimit || 1000,
      timeLimit: ldapQuery.query.timeLimit || 30
    });
  }
  
  /**
   * Load query definitions from a directory
   */
  private async loadDefinitionsFromDirectory(dirPath: string, dataSource: string): Promise<void> {
    try {
      const exists = await fs.access(dirPath).then(() => true).catch(() => false);
      if (!exists) {
        logger.debug(`Query definitions directory does not exist: ${dirPath}`);
        return;
      }
      
      const files = await fs.readdir(dirPath);
      const definitionFiles = files.filter(file => file.endsWith('.json'));
      
      for (const file of definitionFiles) {
        try {
          const filePath = path.join(dirPath, file);
          const content = await fs.readFile(filePath, 'utf8');
          const queryDef = JSON.parse(content) as QueryDefinition;
          
          // Set data source if not specified
          if (!queryDef.dataSource) {
            queryDef.dataSource = dataSource as any;
          }
          
          this.definitions.set(queryDef.id, queryDef);
          logger.debug(`Loaded query definition: ${queryDef.id} from ${file}`);
          
        } catch (error) {
          logger.error(`Failed to load query definition from ${file}:`, error);
        }
      }
      
    } catch (error) {
      logger.error(`Failed to load definitions from directory ${dirPath}:`, error);
    }
  }
  
  /**
   * Load custom query definitions from database
   */
  private async loadCustomDefinitions(): Promise<void> {
    try {
      // First ensure the query_definitions table exists
      await this.ensureQueryDefinitionsTable();
      
      const result = await db.query(
        'SELECT id, definition_data FROM query_definitions WHERE is_active = true'
      );
      
      for (const row of result.rows) {
        try {
          // definition_data is JSONB, already parsed by PostgreSQL
          const queryDef = row.definition_data as QueryDefinition;
          this.definitions.set(queryDef.id, queryDef);
        } catch (error) {
          logger.error(`Failed to parse query definition ${row.id}:`, error);
        }
      }
      
      logger.info(`Loaded ${result.rows.length} custom query definitions from database`);
    } catch (error) {
      logger.error('Failed to load custom definitions:', error);
    }
  }
  
  /**
   * Load legacy report templates and convert to query definitions
   */
  private async loadLegacyTemplates(): Promise<void> {
    try {
      const result = await db.query(`
        SELECT id, name, description, category, report_type, 
               query_template as query_config, default_parameters, 
               COALESCE(query_template->'fieldMappings', '{}'::jsonb) as field_mappings
        FROM report_templates 
        WHERE is_active = true
      `);
      
      for (const template of result.rows) {
        try {
          const converted = this.convertLegacyTemplate(template);
          if (converted) {
            this.definitions.set(converted.id, converted);
          }
        } catch (error) {
          logger.error(`Failed to convert legacy template ${template.id}:`, error);
        }
      }
      
      logger.info(`Converted ${result.rows.length} legacy templates to query definitions`);
    } catch (error) {
      logger.error('Failed to load legacy templates:', error);
    }
  }
  
  /**
   * Convert legacy report template to query definition
   */
  private convertLegacyTemplate(template: any): QueryDefinition | null {
    try {
      const queryConfig = template.query_config || {};
      const defaultParams = template.default_parameters || {};
      const fieldMappings = template.field_mappings || {};
      
      return {
        id: `legacy_${template.id}`,
        name: template.name,
        description: template.description || '',
        version: '1.0.0',
        dataSource: template.category,
        
        // Convert legacy query config to SQL
        sql: this.convertLegacyQueryToSQL(queryConfig, template.report_type),
        
        // Convert default parameters to parameter definitions
        parameters: Object.entries(defaultParams).map(([key, value]) => ({
          name: key,
          type: this.inferParameterType(value),
          required: false,
          default: value
        })),
        
        // Convert field mappings
        resultMapping: Object.keys(fieldMappings).length > 0 ? {
          fieldMappings: Object.entries(fieldMappings).reduce((acc, [key, mapping]: [string, any]) => {
            acc[key] = {
              targetField: mapping.displayName || key,
              type: mapping.type,
              transform: mapping.transform
            };
            return acc;
          }, {} as any)
        } : undefined,
        
        access: {
          requiresAuth: true
        },
        
        cache: {
          enabled: true,
          ttlSeconds: 600, // 10 minutes for legacy queries
          keyTemplate: `legacy:${template.id}:{{parameters_hash}}`
        }
      };
    } catch (error) {
      logger.error(`Failed to convert legacy template ${template.id}:`, error);
      return null;
    }
  }
  
  /**
   * Convert legacy query config to SQL
   */
  private convertLegacyQueryToSQL(queryConfig: any, reportType: string): string {
    if (queryConfig.sql) {
      return queryConfig.sql;
    }
    
    // Legacy queries are no longer supported - should use LDAP query definitions
    throw new Error(`Legacy query format no longer supported for ${reportType}. Please migrate to LDAP query definitions.`);
  }
  
  /**
   * Infer parameter type from default value
   */
  private inferParameterType(value: any): 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object' {
    if (typeof value === 'string') return 'string';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (value instanceof Date) return 'date';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object') return 'object';
    return 'string';
  }
  
  /**
   * Store query definition in database
   */
  private async storeQueryDefinition(queryDef: QueryDefinition): Promise<void> {
    await this.ensureQueryDefinitionsTable();
    
    await db.query(`
      INSERT INTO query_definitions (id, name, version, data_source, definition_data, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        version = EXCLUDED.version,
        data_source = EXCLUDED.data_source,
        definition_data = EXCLUDED.definition_data,
        updated_at = CURRENT_TIMESTAMP
    `, [
      queryDef.id,
      queryDef.name,
      queryDef.version,
      queryDef.dataSource,
      queryDef  // JSONB column expects object, not string
    ]);
  }
  
  /**
   * Ensure query_definitions table exists
   */
  private async ensureQueryDefinitionsTable(): Promise<void> {
    await db.query(`
      CREATE TABLE IF NOT EXISTS query_definitions (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        version VARCHAR(50) NOT NULL,
        data_source VARCHAR(50) NOT NULL,
        definition_data JSONB NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Also ensure query_metrics table exists
    await db.query(`
      CREATE TABLE IF NOT EXISTS query_metrics (
        id SERIAL PRIMARY KEY,
        query_id VARCHAR(255) NOT NULL,
        execution_time_ms INTEGER NOT NULL,
        row_count INTEGER NOT NULL,
        cached BOOLEAN DEFAULT FALSE,
        user_id INTEGER,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        parameters JSONB
      )
    `);
  }
  
  /**
   * Validate query definition structure
   */
  private validateQueryDefinition(queryDef: QueryDefinition): void {
    const required = ['id', 'name', 'version', 'dataSource', 'sql'];
    for (const field of required) {
      if (!(queryDef as any)[field]) {
        throw new Error(`Query definition missing required field: ${field}`);
      }
    }
    
    if (!['postgres', 'ad', 'azure', 'o365'].includes(queryDef.dataSource)) {
      throw new Error(`Invalid data source: ${queryDef.dataSource}`);
    }
    
    if (!queryDef.access) {
      throw new Error('Query definition missing access configuration');
    }
  }
  
  /**
   * Ensure registry is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}