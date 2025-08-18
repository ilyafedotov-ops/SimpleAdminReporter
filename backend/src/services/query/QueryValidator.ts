import { QueryDefinition, QueryValidationResult, ParameterDefinition } from './types';
import { logger } from '@/utils/logger';

/**
 * Query Validator
 * 
 * Validates query definitions and parameters for security and correctness
 */
export class QueryValidator {
  
  /**
   * Validate a query definition and its parameters
   */
  async validateQuery(
    queryDef: QueryDefinition, 
    parameters: Record<string, any>
  ): Promise<QueryValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    try {
      // Validate query definition structure
      this.validateQueryDefinition(queryDef, errors, warnings);
      
      // Validate parameters
      if (queryDef.parameters) {
        if (Array.isArray(queryDef.parameters)) {
          this.validateParameters(queryDef.parameters, parameters, errors, warnings);
        } else if (typeof queryDef.parameters === 'object') {
          // Handle LDAP-style parameter definitions (object format)
          this.validateLDAPStyleParameters(queryDef.parameters as any, parameters, errors, warnings);
        } else {
          warnings.push('Query parameters should be an array or object');
        }
      }
      
      // SQL injection checks for PostgreSQL queries
      if (queryDef.dataSource === 'postgres' && queryDef.sql) {
        this.validateSQLSecurity(queryDef.sql, errors, warnings);
      }
      
      // Performance checks (only for SQL queries)
      if (queryDef.sql) {
        this.validatePerformance(queryDef, parameters, errors, warnings);
      }
      
      return {
        valid: errors.length === 0,
        errors,
        warnings
      };
      
    } catch (error) {
      logger.error('Query validation error:', error);
      return {
        valid: false,
        errors: [`Validation failed: ${(error as Error).message}`],
        warnings
      };
    }
  }
  
  /**
   * Validate query definition structure
   */
  private validateQueryDefinition(
    queryDef: QueryDefinition,
    errors: string[],
    warnings: string[]
  ): void {
    // Required fields
    if (!queryDef.id) errors.push('Query ID is required');
    if (!queryDef.name) errors.push('Query name is required');
    
    // Version is optional for LDAP queries
    if (!queryDef.version && queryDef.dataSource !== 'ad') {
      errors.push('Query version is required');
    }
    
    if (!queryDef.dataSource) errors.push('Data source is required');
    
    // SQL is required only for SQL-based data sources
    if (queryDef.dataSource === 'postgres' && !queryDef.sql) {
      errors.push('SQL is required for PostgreSQL queries');
    }
    
    // ID format validation
    if (queryDef.id && !/^[a-z0-9_]+$/i.test(queryDef.id)) {
      errors.push('Query ID must contain only alphanumeric characters and underscores');
    }
    
    // Version format validation
    if (queryDef.version && !/^\d+\.\d+\.\d+$/.test(queryDef.version)) {
      warnings.push('Query version should follow semantic versioning (x.y.z)');
    }
    
    // Access control validation (optional for LDAP queries)
    if (queryDef.dataSource !== 'ad' && !queryDef.access) {
      errors.push('Access configuration is required');
    } else if (queryDef.access) {
      if (queryDef.access.requiresAuth === undefined) {
        errors.push('requiresAuth must be explicitly set');
      }
    }
    
    // Cache configuration validation
    if (queryDef.cache) {
      if (queryDef.cache.enabled && !queryDef.cache.ttlSeconds) {
        errors.push('Cache TTL is required when caching is enabled');
      }
      if (queryDef.cache.ttlSeconds && queryDef.cache.ttlSeconds < 0) {
        errors.push('Cache TTL must be positive');
      }
      if (queryDef.cache.ttlSeconds && queryDef.cache.ttlSeconds > 86400) {
        warnings.push('Cache TTL over 24 hours may cause stale data issues');
      }
    }
    
    // Constraints validation
    if (queryDef.constraints) {
      if (queryDef.constraints.maxResults && queryDef.constraints.maxResults > 50000) {
        warnings.push('MaxResults over 50,000 may cause performance issues');
      }
      if (queryDef.constraints.timeoutMs && queryDef.constraints.timeoutMs > 300000) {
        warnings.push('Query timeout over 5 minutes may cause connection issues');
      }
    }
  }
  
  /**
   * Validate LDAP-style parameters (object format)
   */
  private validateLDAPStyleParameters(
    paramDefs: Record<string, any>,
    provided: Record<string, any>,
    errors: string[],
    warnings: string[]
  ): void {
    const paramNames = Object.keys(paramDefs);
    const providedKeys = Object.keys(provided);
    
    // Check for missing required parameters
    for (const paramName of paramNames) {
      const paramDef = paramDefs[paramName];
      if (paramDef.required && !providedKeys.includes(paramName)) {
        if (paramDef.default === undefined) {
          errors.push(`Required parameter missing: ${paramName}`);
        }
      }
    }
    
    // Check for unexpected parameters
    for (const key of providedKeys) {
      if (!paramNames.includes(key)) {
        warnings.push(`Unexpected parameter: ${key}`);
      }
    }
    
    // Validate individual parameter values
    for (const key of providedKeys) {
      if (paramDefs[key]) {
        const paramDef = paramDefs[key];
        const value = provided[key];
        
        // Type validation
        if (paramDef.type && value !== null && value !== undefined) {
          const actualType = typeof value;
          const expectedType = paramDef.type;
          
          if (expectedType === 'number' && actualType !== 'number') {
            errors.push(`Parameter ${key} should be a number, got ${actualType}`);
          } else if (expectedType === 'string' && actualType !== 'string') {
            errors.push(`Parameter ${key} should be a string, got ${actualType}`);
          } else if (expectedType === 'boolean' && actualType !== 'boolean') {
            errors.push(`Parameter ${key} should be a boolean, got ${actualType}`);
          }
        }
      }
    }
  }
  
  /**
   * Validate query parameters
   */
  private validateParameters(
    paramDefs: ParameterDefinition[],
    provided: Record<string, any>,
    errors: string[],
    warnings: string[]
  ): void {
    // Safety check
    if (!Array.isArray(paramDefs)) {
      errors.push('Parameter definitions must be an array');
      return;
    }
    
    const requiredParams = paramDefs.filter(p => p.required);
    const providedKeys = Object.keys(provided);
    
    // Check for missing required parameters
    for (const param of requiredParams) {
      if (!providedKeys.includes(param.name)) {
        if (param.default === undefined) {
          errors.push(`Required parameter missing: ${param.name}`);
        }
      }
    }
    
    // Check for unexpected parameters
    const expectedParams = paramDefs.map(p => p.name);
    for (const key of providedKeys) {
      if (!expectedParams.includes(key)) {
        warnings.push(`Unexpected parameter: ${key}`);
      }
    }
    
    // Validate individual parameter values
    for (const param of paramDefs) {
      const value = provided[param.name];
      if (value !== undefined && value !== null) {
        this.validateParameterValue(param, value, errors, warnings);
      }
    }
  }
  
  /**
   * Validate individual parameter value
   */
  private validateParameterValue(
    param: ParameterDefinition,
    value: any,
    errors: string[],
    warnings: string[]
  ): void {
    // Type validation
    switch (param.type) {
      case 'string':
        if (typeof value !== 'string') {
          errors.push(`Parameter ${param.name} must be a string`);
        }
        break;
      case 'number':
        if (typeof value !== 'number' || isNaN(value)) {
          errors.push(`Parameter ${param.name} must be a valid number`);
        }
        break;
      case 'boolean':
        if (typeof value !== 'boolean') {
          errors.push(`Parameter ${param.name} must be a boolean`);
        }
        break;
      case 'date':
        if (!(value instanceof Date) && !this.isValidDateString(value)) {
          errors.push(`Parameter ${param.name} must be a valid date`);
        }
        break;
      case 'array':
        if (!Array.isArray(value)) {
          errors.push(`Parameter ${param.name} must be an array`);
        }
        break;
      case 'object':
        if (typeof value !== 'object' || Array.isArray(value)) {
          errors.push(`Parameter ${param.name} must be an object`);
        }
        break;
    }
    
    // Validation rules
    if (param.validation) {
      this.validateParameterRules(param, value, errors, warnings);
    }
  }
  
  /**
   * Validate parameter against validation rules
   */
  private validateParameterRules(
    param: ParameterDefinition,
    value: any,
    errors: string[],
    _warnings: string[]
  ): void {
    const rules = param.validation!;
    
    // Min/Max validation for numbers
    if (param.type === 'number') {
      if (rules.min !== undefined && value < rules.min) {
        errors.push(`Parameter ${param.name} must be >= ${rules.min}`);
      }
      if (rules.max !== undefined && value > rules.max) {
        errors.push(`Parameter ${param.name} must be <= ${rules.max}`);
      }
    }
    
    // Length validation for strings
    if (param.type === 'string') {
      if (rules.min !== undefined && value.length < rules.min) {
        errors.push(`Parameter ${param.name} must be at least ${rules.min} characters`);
      }
      if (rules.max !== undefined && value.length > rules.max) {
        errors.push(`Parameter ${param.name} must be at most ${rules.max} characters`);
      }
    }
    
    // Pattern validation for strings
    if (param.type === 'string' && rules.pattern) {
      const regex = new RegExp(rules.pattern);
      if (!regex.test(value)) {
        errors.push(`Parameter ${param.name} does not match required pattern`);
      }
    }
    
    // Enum validation
    if (rules.enum && !rules.enum.includes(value)) {
      errors.push(`Parameter ${param.name} must be one of: ${rules.enum.join(', ')}`);
    }
  }
  
  /**
   * Validate SQL for security issues
   */
  private validateSQLSecurity(
    sql: string,
    errors: string[],
    warnings: string[]
  ): void {
    const upperSQL = sql.toUpperCase();
    
    // Check for dangerous SQL operations
    const dangerousOperations = [
      'DROP ', 'DELETE ', 'UPDATE ', 'INSERT ', 'ALTER ', 'CREATE ',
      'TRUNCATE ', 'GRANT ', 'REVOKE ', 'EXEC ', 'EXECUTE '
    ];
    
    for (const op of dangerousOperations) {
      if (upperSQL.includes(op)) {
        errors.push(`SQL contains potentially dangerous operation: ${op.trim()}`);
      }
    }
    
    // Check for SQL injection patterns
    const injectionPatterns = [
      /;\s*(DROP|DELETE|UPDATE|INSERT|ALTER|CREATE)/i,
      /UNION\s+SELECT/i,
      /'\s*(OR|AND)\s*'?1'?\s*='?1/i,
      /--\s*$/m,
      /\/\*.*?\*\//s
    ];
    
    for (const pattern of injectionPatterns) {
      if (pattern.test(sql)) {
        errors.push('SQL contains potential injection patterns');
        break;
      }
    }
    
    // Check parameter placeholders
    const paramPlaceholders = sql.match(/\$\d+/g);
    if (!paramPlaceholders || paramPlaceholders.length === 0) {
      warnings.push('SQL does not use parameterized queries - potential security risk');
    }
  }
  
  /**
   * Validate performance characteristics
   */
  private validatePerformance(
    queryDef: QueryDefinition,
    parameters: Record<string, any>,
    errors: string[],
    warnings: string[]
  ): void {
    if (!queryDef.sql) {
      return; // Skip performance validation for non-SQL queries
    }
    
    const sql = queryDef.sql.toUpperCase();
    
    // Check for missing WHERE clauses on potentially large tables
    const largeTables = ['USERS', 'REPORT_HISTORY', 'AUDIT_LOG'];
    for (const table of largeTables) {
      if (sql.includes(`FROM ${table}`) && !sql.includes('WHERE')) {
        warnings.push(`Query on large table ${table} without WHERE clause may be slow`);
      }
    }
    
    // Check for SELECT * usage
    if (sql.includes('SELECT *')) {
      warnings.push('SELECT * may retrieve unnecessary data and impact performance');
    }
    
    // Check for missing LIMIT clause
    if (sql.includes('SELECT') && !sql.includes('LIMIT') && !queryDef.constraints?.maxResults) {
      warnings.push('Query without LIMIT clause may return large result sets');
    }
    
    // Check for complex JOINs without explicit result limits
    const joinCount = (sql.match(/JOIN/g) || []).length;
    if (joinCount > 3 && !sql.includes('LIMIT') && !queryDef.constraints?.maxResults) {
      warnings.push('Complex JOIN query without result limits may be slow');
    }
  }
  
  /**
   * Check if string is a valid date
   */
  private isValidDateString(value: any): boolean {
    if (typeof value !== 'string') return false;
    const date = new Date(value);
    return !isNaN(date.getTime());
  }
}