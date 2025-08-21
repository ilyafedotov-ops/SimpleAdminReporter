import { WhereCondition,  QueryBuilderResult } from './types';
import { logger } from '@/utils/logger';
import { createError } from '@/middleware/error.middleware';

/**
 * Query Builder
 * 
 * Builds safe, parameterized SQL queries dynamically
 */
export class QueryBuilder {
  private selectFields: string[] = [];
  private fromTable: string = '';
  private whereConditions: WhereCondition[] = [];
  private joinClauses: string[] = [];
  private groupByFields: string[] = [];
  private havingConditions: WhereCondition[] = [];
  private orderByClause: string = '';
  private limitValue: number = 0;
  private offsetValue: number = 0;
  private parameters: any[] = [];
  private parameterIndex: number = 0;
  
  /**
   * Set SELECT fields
   */
  select(fields: string | string[]): QueryBuilder {
    if (typeof fields === 'string') {
      this.selectFields = [fields];
    } else if (Array.isArray(fields)) {
      this.selectFields = [...fields];
    } else {
      throw createError('Select fields must be string or array of strings', 400);
    }
    
    // Validate field names for security
    this.validateFieldNames(this.selectFields);
    
    return this;
  }
  
  /**
   * Set FROM table
   */
  from(table: string): QueryBuilder {
    if (!table || typeof table !== 'string') {
      throw createError('Table name is required and must be a string', 400);
    }
    
    // Validate table name for security
    this.validateTableName(table);
    
    this.fromTable = table;
    return this;
  }
  
  /**
   * Add WHERE condition
   */
  where(condition: WhereCondition | WhereCondition[]): QueryBuilder {
    if (Array.isArray(condition)) {
      this.whereConditions.push(...condition);
    } else {
      this.whereConditions.push(condition);
    }
    return this;
  }
  
  /**
   * Add JOIN clause
   */
  join(table: string, onCondition: string, type: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL' = 'INNER'): QueryBuilder {
    this.validateTableName(table);
    this.validateJoinCondition(onCondition);
    
    this.joinClauses.push(`${type} JOIN ${this.escapeIdentifier(table)} ON ${onCondition}`);
    return this;
  }
  
  /**
   * Add GROUP BY fields
   */
  groupBy(fields: string | string[]): QueryBuilder {
    if (typeof fields === 'string') {
      this.groupByFields = [fields];
    } else if (Array.isArray(fields)) {
      this.groupByFields = [...fields];
    } else {
      throw createError('GROUP BY fields must be string or array of strings', 400);
    }
    
    // Validate field names for security
    this.validateFieldNames(this.groupByFields);
    
    return this;
  }
  
  /**
   * Add HAVING condition (requires GROUP BY)
   */
  having(condition: WhereCondition | WhereCondition[]): QueryBuilder {
    if (Array.isArray(condition)) {
      this.havingConditions.push(...condition);
    } else {
      this.havingConditions.push(condition);
    }
    return this;
  }
  
  /**
   * Set ORDER BY clause
   */
  orderBy(field?: string, direction: 'asc' | 'desc' = 'asc'): QueryBuilder {
    if (field) {
      this.validateFieldName(field);
      this.orderByClause = `ORDER BY ${this.escapeIdentifier(field)} ${direction.toUpperCase()}`;
    }
    return this;
  }
  
  /**
   * Set LIMIT
   */
  limit(count: number): QueryBuilder {
    if (count && count > 0) {
      this.limitValue = Math.min(count, 10000); // Cap at 10,000 for safety
    }
    return this;
  }
  
  /**
   * Set OFFSET
   */
  offset(count: number): QueryBuilder {
    if (count && count >= 0) {
      this.offsetValue = count;
    }
    return this;
  }
  
  /**
   * Build the final SQL query
   */
  build(): QueryBuilderResult {
    this.parameters = [];
    this.parameterIndex = 0;
    
    try {
      // Validate required components
      if (this.selectFields.length === 0) {
        throw createError('SELECT fields are required', 400);
      }
      
      if (!this.fromTable) {
        throw createError('FROM table is required', 400);
      }
      
      // Validate HAVING requires GROUP BY
      if (this.havingConditions.length > 0 && this.groupByFields.length === 0) {
        throw createError('HAVING clause requires GROUP BY', 400);
      }
      
      // Build SQL components
      const selectClause = this.buildSelectClause();
      const fromClause = this.buildFromClause();
      const whereClause = this.buildWhereClause();
      const joinClause = this.buildJoinClause();
      const groupByClause = this.buildGroupByClause();
      const havingClause = this.buildHavingClause();
      const orderClause = this.orderByClause;
      const limitClause = this.buildLimitClause();
      
      // Assemble final SQL
      const sql = [
        selectClause,
        fromClause,
        joinClause,
        whereClause,
        groupByClause,
        havingClause,
        orderClause,
        limitClause
      ].filter(clause => clause).join('\n');
      
      logger.debug('Built SQL query:', { 
        sql, 
        parameterCount: this.parameters.length,
        parameters: this.parameters 
      });
      
      return {
        sql: sql.trim(),
        parameters: this.parameters,
        parameterCount: this.parameters.length
      };
      
    } catch (error) {
      logger.error('Query building failed:', error);
      throw error;
    }
  }
  
  /**
   * Reset the builder for reuse
   */
  reset(): QueryBuilder {
    this.selectFields = [];
    this.fromTable = '';
    this.whereConditions = [];
    this.joinClauses = [];
    this.groupByFields = [];
    this.havingConditions = [];
    this.orderByClause = '';
    this.limitValue = 0;
    this.offsetValue = 0;
    this.parameters = [];
    this.parameterIndex = 0;
    
    return this;
  }
  
  /**
   * Create a copy of this builder
   */
  clone(): QueryBuilder {
    const cloned = new QueryBuilder();
    cloned.selectFields = [...this.selectFields];
    cloned.fromTable = this.fromTable;
    cloned.whereConditions = [...this.whereConditions];
    cloned.joinClauses = [...this.joinClauses];
    cloned.groupByFields = [...this.groupByFields];
    cloned.havingConditions = [...this.havingConditions];
    cloned.orderByClause = this.orderByClause;
    cloned.limitValue = this.limitValue;
    cloned.offsetValue = this.offsetValue;
    
    return cloned;
  }
  
  // Private helper methods
  
  /**
   * Build SELECT clause
   */
  private buildSelectClause(): string {
    const fields = this.selectFields.map(field => {
      // Handle aggregate functions and expressions
      if (this.isAggregrateFunction(field) || this.isExpression(field)) {
        return field; // Allow as-is for aggregate functions and expressions
      }
      return this.escapeIdentifier(field);
    });
    
    return `SELECT ${fields.join(', ')}`;
  }
  
  /**
   * Build FROM clause
   */
  private buildFromClause(): string {
    return `FROM ${this.escapeIdentifier(this.fromTable)}`;
  }
  
  /**
   * Build JOIN clauses
   */
  private buildJoinClause(): string {
    return this.joinClauses.join('\n');
  }
  
  /**
   * Build WHERE clause with parameterized conditions
   */
  private buildWhereClause(): string {
    if (this.whereConditions.length === 0) {
      return '';
    }
    
    const conditions = this.whereConditions.map((condition, index) => {
      const conditionSQL = this.buildWhereCondition(condition);
      
      // Add logical operator (AND/OR) between conditions
      if (index > 0) {
        const logic = condition.logic || 'AND';
        return `${logic} ${conditionSQL}`;
      }
      
      return conditionSQL;
    });
    
    return `WHERE ${conditions.join(' ')}`;
  }
  
  /**
   * Build individual WHERE condition
   */
  private buildWhereCondition(condition: WhereCondition): string {
    // Validate field exists
    if (!condition.field || typeof condition.field !== 'string') {
      throw createError('Field name must be a non-empty string', 400);
    }
    
    // For HAVING clause, check if it's an aggregate function
    const isAggregateField = this.isAggregrateFunction(condition.field);
    const field = isAggregateField ? condition.field : this.escapeIdentifier(condition.field);
    const operator = condition.operator;
    const value = condition.value;
    
    switch (operator) {
      case 'eq':
        return `${field} = ${this.addParameter(value)}`;
        
      case 'ne':
        return `${field} != ${this.addParameter(value)}`;
        
      case 'gt':
        return `${field} > ${this.addParameter(value)}`;
        
      case 'gte':
        return `${field} >= ${this.addParameter(value)}`;
        
      case 'lt':
        return `${field} < ${this.addParameter(value)}`;
        
      case 'lte':
        return `${field} <= ${this.addParameter(value)}`;
        
      case 'in':
        if (!Array.isArray(value)) {
          throw createError('IN operator requires array value', 400);
        }
        const inParams = value.map(v => this.addParameter(v));
        return `${field} IN (${inParams.join(', ')})`;
        
      case 'nin':
        if (!Array.isArray(value)) {
          throw createError('NOT IN operator requires array value', 400);
        }
        const ninParams = value.map(v => this.addParameter(v));
        return `${field} NOT IN (${ninParams.join(', ')})`;
        
      case 'like':
        return `${field} LIKE ${this.addParameter(value)}`;
        
      case 'ilike':
        return `${field} ILIKE ${this.addParameter(value)}`;
        
      case 'is_null':
        return `${field} IS NULL`;
        
      case 'is_not_null':
        return `${field} IS NOT NULL`;
        
      case 'isEmpty':
        return `(${field} IS NULL OR ${field} = '')`;
        
      case 'isNotEmpty':
        return `(${field} IS NOT NULL AND ${field} != '')`;
        
      default:
        throw createError(`Unsupported WHERE operator: ${operator}`, 400);
    }
  }
  
  /**
   * Build GROUP BY clause
   */
  private buildGroupByClause(): string {
    if (this.groupByFields.length === 0) {
      return '';
    }
    
    const fields = this.groupByFields.map(field => {
      // Handle aggregate functions and expressions in GROUP BY
      if (this.isAggregrateFunction(field) || this.isExpression(field)) {
        return field; // Allow as-is for complex expressions
      }
      return this.escapeIdentifier(field);
    });
    
    return `GROUP BY ${fields.join(', ')}`;
  }
  
  /**
   * Build HAVING clause with parameterized conditions
   */
  private buildHavingClause(): string {
    if (this.havingConditions.length === 0) {
      return '';
    }
    
    const conditions = this.havingConditions.map((condition, index) => {
      const conditionSQL = this.buildWhereCondition(condition);
      
      // Add logical operator (AND/OR) between conditions
      if (index > 0) {
        const logic = condition.logic || 'AND';
        return `${logic} ${conditionSQL}`;
      }
      
      return conditionSQL;
    });
    
    return `HAVING ${conditions.join(' ')}`;
  }
  
  /**
   * Build LIMIT and OFFSET clause
   */
  private buildLimitClause(): string {
    let clause = '';
    
    if (this.limitValue > 0) {
      clause += `LIMIT ${this.limitValue}`;
    }
    
    if (this.offsetValue > 0) {
      clause += clause ? ` OFFSET ${this.offsetValue}` : `OFFSET ${this.offsetValue}`;
    }
    
    return clause;
  }
  
  /**
   * Add parameter and return placeholder
   */
  private addParameter(value: any): string {
    this.parameters.push(value);
    return `$${++this.parameterIndex}`;
  }
  
  /**
   * Escape SQL identifier (table/column names)
   */
  private escapeIdentifier(identifier: string): string {
    // Type guard to prevent type confusion attacks
    if (typeof identifier !== 'string') {
      throw createError('Identifier must be a string', 400);
    }
    
    // Additional validation for security
    if (!identifier || identifier.length === 0) {
      throw createError('Identifier cannot be empty', 400);
    }
    
    // Don't escape *
    if (identifier === '*') {
      return '*';
    }
    
    // Handle table.column format
    if (identifier.includes('.')) {
      const parts = identifier.split('.');
      return parts.map(part => {
        const cleaned = part.replace(/[^\w_]/g, '');
        if (!cleaned || cleaned.length === 0) {
          throw createError('Invalid identifier part after sanitization', 400);
        }
        return `"${cleaned}"`;
      }).join('.');
    }
    
    // Remove dangerous characters and wrap in quotes
    const cleaned = identifier.replace(/[^\w_]/g, '');
    if (!cleaned || cleaned.length === 0) {
      throw createError('Invalid identifier after sanitization', 400);
    }
    return `"${cleaned}"`;
  }
  
  /**
   * Check if field is an aggregate function
   */
  private isAggregrateFunction(field: string): boolean {
    const aggregateFunctions = ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'DISTINCT'];
    const upperField = field.toUpperCase();
    return aggregateFunctions.some(func => upperField.includes(func + '('));
  }
  
  /**
   * Check if field is an expression
   */
  private isExpression(field: string): boolean {
    // Allow expressions with basic operators and functions
    // But check for more specific patterns to avoid false positives
    return field.includes('(') || 
           field.includes(' + ') || 
           field.includes(' - ') || 
           field.includes(' * ') || 
           field.includes(' / ') || 
           field.includes(' AS ') ||
           /^\w+\s*[\+\-\*\/]\s*\w+/.test(field); // Match "a + b" style expressions
  }
  
  // Validation methods
  
  /**
   * Validate field names for security
   */
  private validateFieldNames(fields: string[]): void {
    fields.forEach(field => this.validateFieldName(field));
  }
  
  /**
   * Validate single field name
   */
  private validateFieldName(field: string): void {
    if (!field || typeof field !== 'string') {
      throw createError('Field name must be a non-empty string', 400);
    }
    
    // Allow * for SELECT ALL
    if (field === '*') {
      return;
    }
    
    // Allow aggregate functions and expressions
    if (this.isAggregrateFunction(field) || this.isExpression(field)) {
      return; // Skip validation for complex expressions
    }
    
    // Check for SQL injection patterns first
    const dangerousPatterns = [
      /;.*DROP/i,
      /;.*DELETE/i,
      /;.*UPDATE/i,
      /;.*INSERT/i,
      /;.*ALTER/i,
      /;.*CREATE/i,
      /;.*TRUNCATE/i,
      /--/,
      /\/\*/
    ];
    
    if (dangerousPatterns.some(pattern => pattern.test(field))) {
      throw createError(`Invalid field name: ${field}`, 400);
    }
    
    // Basic field name validation - allow dots for table.column format
    if (!/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(field)) {
      throw createError(`Invalid field name: ${field}`, 400);
    }
  }
  
  /**
   * Validate table name
   */
  private validateTableName(table: string): void {
    if (!table || typeof table !== 'string') {
      throw createError('Table name must be a non-empty string', 400);
    }
    
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
      throw createError(`Invalid table name: ${table}`, 400);
    }
  }
  
  /**
   * Validate JOIN condition
   */
  private validateJoinCondition(condition: string): void {
    if (!condition || typeof condition !== 'string') {
      throw createError('JOIN condition is required', 400);
    }
    
    // Basic validation - should contain field references and operators
    if (!/^[a-zA-Z0-9_."'\s=<>!]+$/.test(condition)) {
      throw createError('Invalid JOIN condition', 400);
    }
  }
  
  /**
   * Static method to create a new QueryBuilder instance
   */
  static create(): QueryBuilder {
    return new QueryBuilder();
  }
  
  /**
   * Static method to build a simple SELECT query
   */
  static buildSelect(
    fields: string[],
    table: string,
    where?: WhereCondition[],
    orderBy?: { field: string; direction: 'asc' | 'desc' },
    limit?: number
  ): QueryBuilderResult {
    const builder = new QueryBuilder()
      .select(fields)
      .from(table);
    
    if (where && where.length > 0) {
      builder.where(where);
    }
    
    if (orderBy) {
      builder.orderBy(orderBy.field, orderBy.direction);
    }
    
    if (limit) {
      builder.limit(limit);
    }
    
    return builder.build();
  }
}