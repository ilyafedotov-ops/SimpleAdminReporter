import { QueryBuilder } from './query/QueryBuilder';
import { db } from '@/config/database';
import { WhereCondition } from './query/types';
// import { loggingConfig } from '@/config/logging.config';
import { logger } from '@/utils/logger';
import { logsCacheService } from './logs-cache.service';
import { queryMetricsService } from './query-metrics.service';
// import { materializedViewsService } from './materialized-views.service';

export interface LogQueryParams {
  type?: 'audit' | 'system' | 'all';
  level?: string;
  eventType?: string;
  eventAction?: string;
  userId?: number;
  module?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  correlationId?: string;
}

interface LogQueryResult {
  logs: any[];
  total: number;
}

export class LogsService {
  private readonly ALLOWED_AUDIT_SORT_COLUMNS = ['created_at', 'event_type', 'event_action', 'username', 'ip_address'];
  private readonly ALLOWED_SYSTEM_SORT_COLUMNS = ['timestamp', 'level', 'module', 'ip_address', 'status_code', 'duration_ms'];
  private readonly SENSITIVE_KEYS = ['password', 'token', 'secret', 'apikey', 'creditcard', 'ssn', 'pin'];

  /**
   * Get audit logs with filtering using QueryBuilder
   */
  async getAuditLogs(params: LogQueryParams, offset: number = 0): Promise<LogQueryResult> {
    logger.info('Getting audit logs with params:', params);
    
    const startTime = Date.now();
    let cacheHit = false;
    let rowCount = 0;
    let error: string | undefined;
    
    try {
      // Apply 300 record limit if no time range is specified
      const hasTimeRange = params.startDate || params.endDate;
      const effectiveLimit = params.pageSize || 50;
      
      // Check cache first
      const cached = await logsCacheService.getCachedAuditLogs(params, offset);
      if (cached) {
        logger.debug('Returning cached audit logs');
        cacheHit = true;
        rowCount = cached.data.logs.length;
        
        // Record cache hit metric
        await queryMetricsService.recordQueryMetric({
          queryType: 'audit_logs',
          executionTimeMs: Date.now() - startTime,
          rowCount,
          cacheHit: true,
          timestamp: new Date(),
          queryParams: params
        });
        
        return cached.data;
      }
    
    // Build where conditions
    const whereConditions: WhereCondition[] = [];
    
    if (params.eventType) {
      whereConditions.push({ field: 'event_type', operator: 'eq', value: params.eventType });
    }
    if (params.eventAction) {
      whereConditions.push({ field: 'event_action', operator: 'eq', value: params.eventAction });
    }
    if (params.userId) {
      whereConditions.push({ field: 'user_id', operator: 'eq', value: params.userId });
    }
    if (params.correlationId) {
      whereConditions.push({ field: 'correlation_id', operator: 'eq', value: params.correlationId });
    }
    // Check if we can use materialized view
    const canUseMV = this.canUseMaterializedViewForQuery(params);
    const tableName = canUseMV ? 'mv_combined_logs' : 'audit_logs';
    const timestampField = canUseMV ? 'timestamp' : 'created_at';
    
    if (params.startDate) {
      whereConditions.push({ field: timestampField, operator: 'gte', value: new Date(params.startDate) });
    }
    if (params.endDate) {
      whereConditions.push({ field: timestampField, operator: 'lte', value: new Date(params.endDate) });
    }
    
    // Get total count with search - use materialized view if appropriate
    const countQuery = QueryBuilder.create()
      .select('COUNT(*) as count')
      .from(tableName);
    
    // Add log_type filter if using materialized view
    if (canUseMV) {
      whereConditions.push({ field: 'log_type', operator: 'eq', value: 'audit' });
    }
    
    if (whereConditions.length > 0) {
      countQuery.where(whereConditions);
    }
    
    // Handle search separately due to OR logic
    if (params.search) {
      const searchQuery = this.buildAuditSearchQuery(countQuery, params.search, tableName);
      const countResult = await db.query(searchQuery.sql, searchQuery.parameters);
      const total = parseInt(countResult.rows[0].count);
      
      // Get paginated data with search
      const dataQuery = this.buildAuditDataQuery(params, whereConditions, offset, tableName, timestampField);
      const dataResult = await db.query(dataQuery.sql, dataQuery.parameters);
      
      return {
        logs: this.sanitizeLogs(dataResult.rows),
        total
      };
    }
    
    // Standard query without search
    const { sql, parameters } = countQuery.build();
    let countResult;
    let total;
    
    try {
      countResult = await db.query(sql, parameters);
      total = parseInt(countResult.rows[0].count);
      
      // For no time range, we want to show the most recent 300 records
      // but still allow pagination through them
      if (!hasTimeRange) {
        // Get the actual total but cap the query results
        const actualTotal = total;
        total = Math.min(actualTotal, 300);
      }
    } catch (err) {
      logger.error('Error executing count query:', err);
      throw err;
    }
    
    // Build data query - reuse already determined variables
    const selectFields = [
      'id', 'event_type', 'event_action', 'user_id', 'username',
      'ip_address', 'user_agent', 'session_id', 'resource_type',
      'resource_id', 'details', 'success', 'error_message',
      'correlation_id'
    ];
    
    // Add timestamp field based on table type
    selectFields.push(canUseMV ? 'timestamp' : 'created_at');
    
    const dataQueryBuilder = QueryBuilder.create()
      .select(selectFields)
      .from(tableName);
    
    // Note: log_type filter already added above for materialized view
    
    if (whereConditions.length > 0) {
      dataQueryBuilder.where(whereConditions);
    }
    
    // Apply sorting - handle field mapping for materialized view
    const sortColumn = this.validateAuditSortColumn(params.sortBy);
    const actualSortColumn = (canUseMV && sortColumn === 'created_at') ? 'timestamp' : sortColumn;
    dataQueryBuilder.orderBy(actualSortColumn, params.sortOrder || 'desc');
    
    // Apply pagination
    dataQueryBuilder
      .limit(effectiveLimit)
      .offset(offset); // Allow pagination even without time range
    
    const dataQuery = dataQueryBuilder.build();
    
    logger.info('Executing audit logs data query:', {
      sql: dataQuery.sql,
      parameters: dataQuery.parameters,
      offset,
      limit: effectiveLimit
    });
    
    const dataResult = await db.query(dataQuery.sql, dataQuery.parameters);
    
    logger.info(`Audit logs query returned ${dataResult.rows.length} rows`);
    if (dataResult.rows.length > 0) {
      logger.debug('Sample audit log row:', dataResult.rows[0]);
    }
    
    let sanitizedLogs;
    try {
      // Map timestamp field to created_at if using materialized view
      let resultRows = dataResult.rows;
      if (canUseMV) {
        resultRows = dataResult.rows.map((row: any) => ({
          ...row,
          created_at: row.timestamp
        }));
      }
      
      sanitizedLogs = this.sanitizeLogs(resultRows);
      logger.info(`Sanitized ${sanitizedLogs.length} audit logs`);
    } catch (err) {
      logger.error('Error sanitizing audit logs:', err);
      throw err;
    }
    
    const result = {
      logs: sanitizedLogs,
      total
    };
    
    logger.info(`Returning ${result.logs.length} sanitized audit logs, total: ${result.total}`);
    
    // Cache the result
    await logsCacheService.cacheAuditLogs(params, offset, result);
    
    rowCount = result.logs.length;
    
    // Record query metric
    await queryMetricsService.recordQueryMetric({
      queryType: 'audit_logs',
      executionTimeMs: Date.now() - startTime,
      rowCount,
      cacheHit: false,
      timestamp: new Date(),
      queryParams: params
    });
    
    return result;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Error in getAuditLogs:', err);
      
      // Record error metric
      await queryMetricsService.recordQueryMetric({
        queryType: 'audit_logs',
        executionTimeMs: Date.now() - startTime,
        rowCount: 0,
        cacheHit,
        timestamp: new Date(),
        queryParams: params,
        error
      });
      
      throw err;
    }
  }

  /**
   * Get system logs with filtering using QueryBuilder
   */
  async getSystemLogs(params: LogQueryParams, offset: number = 0): Promise<LogQueryResult> {
    const startTime = Date.now();
    let cacheHit = false;
    let rowCount = 0;
    let error: string | undefined;
    
    try {
      // Apply 300 record limit if no time range is specified
      const hasTimeRange = params.startDate || params.endDate;
      const effectiveLimit = params.pageSize || 50;
      
      // Check cache first
      const cached = await logsCacheService.getCachedSystemLogs(params, offset);
      if (cached) {
        logger.debug('Returning cached system logs');
        cacheHit = true;
        rowCount = cached.data.logs.length;
        
        // Record cache hit metric
        await queryMetricsService.recordQueryMetric({
          queryType: 'system_logs',
          executionTimeMs: Date.now() - startTime,
          rowCount,
          cacheHit: true,
          timestamp: new Date(),
          queryParams: params
        });
        
        return cached.data;
      }
    
    // Check if we can use materialized view
    const canUseMV = this.canUseMaterializedViewForQuery(params);
    const tableName = canUseMV ? 'mv_combined_logs' : 'system_logs';
    
    // Build where conditions
    const whereConditions: WhereCondition[] = [];
    
    if (params.level) {
      whereConditions.push({ field: 'level', operator: 'eq', value: params.level });
    }
    if (params.module) {
      whereConditions.push({ field: 'module', operator: 'eq', value: params.module });
    }
    if (params.userId) {
      whereConditions.push({ field: 'user_id', operator: 'eq', value: params.userId });
    }
    if (params.correlationId) {
      whereConditions.push({ field: 'request_id', operator: 'eq', value: params.correlationId });
    }
    if (params.startDate) {
      whereConditions.push({ field: 'timestamp', operator: 'gte', value: new Date(params.startDate) });
    }
    if (params.endDate) {
      whereConditions.push({ field: 'timestamp', operator: 'lte', value: new Date(params.endDate) });
    }
    
    // Add log_type filter if using materialized view
    if (canUseMV) {
      whereConditions.push({ field: 'log_type', operator: 'eq', value: 'system' });
    }
    
    // Handle search with custom logic
    if (params.search) {
      const searchQuery = this.buildSystemSearchQuery(whereConditions, params.search);
      const countResult = await db.query(searchQuery.countSql, searchQuery.countParams);
      const total = parseInt(countResult.rows[0].count);
      
      const dataResult = await db.query(searchQuery.dataSql, searchQuery.dataParams);
      
      return {
        logs: this.sanitizeLogs(dataResult.rows),
        total
      };
    }
    
    // Standard query without search
    const countQuery = QueryBuilder.create()
      .select('COUNT(*) as count')
      .from(tableName);
    
    if (whereConditions.length > 0) {
      countQuery.where(whereConditions);
    }
    
    const { sql, parameters } = countQuery.build();
    const countResult = await db.query(sql, parameters);
    let total = parseInt(countResult.rows[0].count);
    
    // For no time range, we want to show the most recent 300 records
    // but still allow pagination through them
    if (!hasTimeRange) {
      // Get the actual total but cap the query results
      const actualTotal = total;
      total = Math.min(actualTotal, 300);
    }
    
    // Build data query
    const dataQueryBuilder = QueryBuilder.create()
      .select([
        'id', 'level', 'message', 'timestamp', 'service', 'module',
        'user_id', 'request_id', 'ip_address', 'method', 'url',
        'status_code', 'duration_ms', 'error_stack', 'metadata'
      ])
      .from(tableName);
    
    if (whereConditions.length > 0) {
      dataQueryBuilder.where(whereConditions);
    }
    
    // Apply sorting
    const sortColumn = this.validateSystemSortColumn(params.sortBy);
    dataQueryBuilder.orderBy(sortColumn, params.sortOrder || 'desc');
    
    // Apply pagination
    dataQueryBuilder
      .limit(effectiveLimit)
      .offset(offset); // Allow pagination even without time range
    
    const dataQuery = dataQueryBuilder.build();
    
    logger.info('Executing audit logs data query:', {
      sql: dataQuery.sql,
      parameters: dataQuery.parameters,
      offset,
      limit: effectiveLimit
    });
    
    const dataResult = await db.query(dataQuery.sql, dataQuery.parameters);
    
    logger.info(`Audit logs query returned ${dataResult.rows.length} rows`);
    if (dataResult.rows.length > 0) {
      logger.debug('Sample audit log row:', dataResult.rows[0]);
    }
    
    let sanitizedLogs;
    try {
      // Map timestamp field to created_at if using materialized view
      let resultRows = dataResult.rows;
      if (canUseMV) {
        resultRows = dataResult.rows.map((row: any) => ({
          ...row,
          created_at: row.timestamp
        }));
      }
      
      sanitizedLogs = this.sanitizeLogs(resultRows);
      logger.info(`Sanitized ${sanitizedLogs.length} audit logs`);
    } catch (err) {
      logger.error('Error sanitizing audit logs:', err);
      throw err;
    }
    
    const result = {
      logs: sanitizedLogs,
      total
    };
    
    logger.info(`Returning ${result.logs.length} sanitized audit logs, total: ${result.total}`);
    
    // Cache the result
    await logsCacheService.cacheSystemLogs(params, offset, result);
    
    rowCount = result.logs.length;
    
    // Record query metric
    await queryMetricsService.recordQueryMetric({
      queryType: 'system_logs',
      executionTimeMs: Date.now() - startTime,
      rowCount,
      cacheHit: false,
      timestamp: new Date(),
      queryParams: params
    });
    
    return result;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Error in getSystemLogs:', err);
      
      // Record error metric
      await queryMetricsService.recordQueryMetric({
        queryType: 'system_logs',
        executionTimeMs: Date.now() - startTime,
        rowCount: 0,
        cacheHit,
        timestamp: new Date(),
        queryParams: params,
        error
      });
      
      throw err;
    }
  }

  /**
   * Build audit search query with OR conditions
   */
  private buildAuditSearchQuery(baseQuery: QueryBuilder, search: string, tableName: string): any {
    const query = baseQuery.clone();
    const built = query.build();
    
    // Add search condition with OR logic
    const searchCondition = `(
      username ILIKE $${built.parameterCount + 1} OR 
      event_action ILIKE $${built.parameterCount + 1} OR 
      resource_type ILIKE $${built.parameterCount + 1} OR 
      details::text ILIKE $${built.parameterCount + 1}
    )`;
    
    const tablePattern = `FROM "${tableName === 'mv_combined_logs' ? 'mv_combined_logs' : 'audit_logs'}"`;
    const whereClause = built.sql.includes('WHERE') 
      ? built.sql.replace(tablePattern, `${tablePattern} WHERE ${searchCondition} AND (`) + ')'
      : built.sql.replace(tablePattern, `${tablePattern} WHERE ${searchCondition}`);
    
    return {
      sql: whereClause,
      parameters: [...built.parameters, `%${search}%`]
    };
  }

  /**
   * Build audit data query with search
   */
  private buildAuditDataQuery(params: LogQueryParams, whereConditions: WhereCondition[], offset: number, tableName: string, timestampField: string): any {
    const sortColumn = this.validateAuditSortColumn(params.sortBy);
    const sortOrder = params.sortOrder === 'asc' ? 'ASC' : 'DESC';
    
    // Use standard page size
    const effectiveLimit = params.pageSize || 50;
    
    // Build base conditions
    let whereClause = '';
    const parameters: any[] = [];
    let paramIndex = 1;
    
    whereConditions.forEach((condition, index) => {
      if (index === 0) {
        whereClause = 'WHERE ';
      } else {
        whereClause += ' AND ';
      }
      whereClause += `"${condition.field}" ${this.getOperatorSQL(condition.operator)} $${paramIndex++}`;
      parameters.push(condition.value);
    });
    
    // Add search condition
    if (params.search) {
      if (whereClause) {
        whereClause += ' AND ';
      } else {
        whereClause = 'WHERE ';
      }
      whereClause += `(
        username ILIKE $${paramIndex} OR 
        event_action ILIKE $${paramIndex} OR 
        resource_type ILIKE $${paramIndex} OR 
        details::text ILIKE $${paramIndex}
      )`;
      parameters.push(`%${params.search}%`);
      paramIndex++;
    }
    
    // Determine timestamp column alias for SELECT - handle raw SQL here
    const timestampSelect = tableName === 'mv_combined_logs' ? 'timestamp AS created_at' : 'created_at';
    
    const sql = `
      SELECT 
        id, event_type, event_action, user_id, username,
        ip_address, user_agent, session_id, resource_type,
        resource_id, details, success, error_message,
        correlation_id, ${timestampSelect}
      FROM ${tableName} 
      ${whereClause}
      ORDER BY "${sortColumn === 'created_at' ? timestampField : sortColumn}" ${sortOrder}
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    
    parameters.push(effectiveLimit, offset);
    
    return { sql, parameters };
  }

  /**
   * Build system search query with custom logic
   */
  private buildSystemSearchQuery(whereConditions: WhereCondition[], search: string): any {
    // Build base where clause
    let whereClause = '';
    const parameters: any[] = [];
    let paramIndex = 1;
    
    whereConditions.forEach((condition, index) => {
      if (index === 0) {
        whereClause = 'WHERE ';
      } else {
        whereClause += ' AND ';
      }
      whereClause += `"${condition.field}" ${this.getOperatorSQL(condition.operator)} $${paramIndex++}`;
      parameters.push(condition.value);
    });
    
    // Add search condition
    if (whereClause) {
      whereClause += ' AND ';
    } else {
      whereClause = 'WHERE ';
    }
    whereClause += `(
      message ILIKE $${paramIndex} OR 
      module ILIKE $${paramIndex} OR 
      url ILIKE $${paramIndex} OR 
      metadata::text ILIKE $${paramIndex}
    )`;
    parameters.push(`%${search}%`);
    
    const countSql = `SELECT COUNT(*) as count FROM system_logs ${whereClause}`;
    const countParams = [...parameters];
    
    paramIndex++;
    const dataSql = `
      SELECT 
        id, level, message, timestamp, service, module,
        user_id, request_id, ip_address, method, url,
        status_code, duration_ms, error_stack, metadata
      FROM system_logs 
      ${whereClause}
      ORDER BY timestamp DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    
    // Apply standard pagination
    const effectiveLimit = 50;
    const dataParams = [...parameters, effectiveLimit, 0];
    
    return { countSql, countParams, dataSql, dataParams };
  }

  /**
   * Get operator SQL representation
   */
  private getOperatorSQL(operator: string): string {
    const operatorMap: Record<string, string> = {
      'eq': '=',
      'ne': '!=',
      'gt': '>',
      'gte': '>=',
      'lt': '<',
      'lte': '<=',
      'like': 'LIKE',
      'ilike': 'ILIKE'
    };
    return operatorMap[operator] || '=';
  }

  /**
   * Validate and return audit log sort column
   */
  private validateAuditSortColumn(sortBy?: string): string {
    if (sortBy === 'timestamp') {
      return 'created_at';
    }
    if (sortBy && this.ALLOWED_AUDIT_SORT_COLUMNS.includes(sortBy)) {
      return sortBy;
    }
    return 'created_at';
  }

  /**
   * Validate and return system log sort column
   */
  private validateSystemSortColumn(sortBy?: string): string {
    if (sortBy && this.ALLOWED_SYSTEM_SORT_COLUMNS.includes(sortBy)) {
      return sortBy;
    }
    return 'timestamp';
  }

  /**
   * Sanitize logs to remove sensitive data
   */
  sanitizeLogs(logs: any[]): any[] {
    logger.debug(`sanitizeLogs called with ${logs.length} logs`);
    return logs.map(log => ({
      ...log,
      details: log.details ? this.sanitizeObject(log.details) : undefined,
      metadata: log.metadata ? this.sanitizeObject(log.metadata) : undefined
    }));
  }

  /**
   * Sanitize object to redact sensitive keys
   */
  private sanitizeObject(obj: any): any {
    if (!obj || typeof obj !== 'object') return obj;
    
    const sanitized = JSON.parse(JSON.stringify(obj));
    
    const sanitizeRecursive = (target: any): void => {
      for (const key in target) {
        if (typeof target[key] === 'object' && target[key] !== null) {
          sanitizeRecursive(target[key]);
        } else if (this.SENSITIVE_KEYS.some(sensitive => key.toLowerCase().includes(sensitive))) {
          target[key] = '[REDACTED]';
        }
      }
    };
    
    sanitizeRecursive(sanitized);
    return sanitized;
  }

  /**
   * Get combined logs (audit + system) with single query when type=all
   */
  async getCombinedLogs(params: LogQueryParams): Promise<any> {
    logger.info('getCombinedLogs called with params:', params);
    
    const offset = ((params.page || 1) - 1) * (params.pageSize || 50);
    const results: any = {
      audit: [],
      system: [],
      totalAudit: 0,
      totalSystem: 0
    };

    try {
      // If only one type is requested, use the specific method
      if (params.type === 'audit') {
        const auditResult = await this.getAuditLogs(params, offset);
        results.audit = auditResult.logs;
        results.totalAudit = auditResult.total;
        return results;
      }
      
      if (params.type === 'system') {
        const systemResult = await this.getSystemLogs(params, offset);
        results.system = systemResult.logs;
        results.totalSystem = systemResult.total;
        return results;
      }
      
      // For type='all', use a single combined query
      const startTime = Date.now();
      const hasTimeRange = params.startDate || params.endDate;
      const effectiveLimit = params.pageSize || 50;
      
      // Check cache first
      const cacheKeyParams = { ...params, offset };
      const cached = await logsCacheService.getCachedSystemLogs(cacheKeyParams, offset);
      if (cached) {
        logger.debug('Returning cached combined logs');
        return cached.data;
      }
      
      // Build and execute the combined query
      const usingMaterializedView = this.canUseMaterializedViewForQuery(params);
      const combinedQuery = this.buildCombinedQuery(params, offset, effectiveLimit);
      
      // Log the query for debugging
      logger.info('Executing combined logs query:', {
        usingMaterializedView,
        sql: combinedQuery.sql,
        parameters: combinedQuery.parameters,
        offset,
        limit: effectiveLimit
      });
      
      const queryStartTime = Date.now();
      const result = await db.query(combinedQuery.sql, combinedQuery.parameters);
      const queryTime = Date.now() - queryStartTime;
      
      logger.info(`Combined logs query executed in ${queryTime}ms, returned ${result.rows.length} rows`);
      
      // Debug: Log first few rows
      if (result.rows.length > 0) {
        logger.debug('Sample rows:', result.rows.slice(0, 2));
      } else {
        logger.warn('No rows returned from combined logs query');
      }
      
      // Get counts - use materialized view if possible
      const countQuery = this.canUseMaterializedViewForQuery(params) 
        ? this.buildMaterializedViewCountQuery(params)
        : this.buildCombinedCountQuery(params);
      
      logger.info('Executing count query:', {
        sql: countQuery.sql,
        parameters: countQuery.parameters
      });
      
      const countStartTime = Date.now();
      const countResult = await db.query(countQuery.sql, countQuery.parameters);
      const countTime = Date.now() - countStartTime;
      
      logger.info(`Count query executed in ${countTime}ms`);
      
      const counts = countResult.rows[0] || { audit_count: 0, system_count: 0 };
      
      // Separate results by type
      logger.info(`Processing ${result.rows.length} combined log rows`);
      result.rows.forEach((row: any, index: number) => {
        try {
          if (row.log_type === 'audit') {
            results.audit.push(this.mapAuditLogFromCombined(row));
          } else if (row.log_type === 'system') {
            results.system.push(this.mapSystemLogFromCombined(row));
          } else {
            logger.warn(`Unknown log type at index ${index}:`, row.log_type);
          }
        } catch (err) {
          logger.error(`Error processing row ${index}:`, err, { row });
        }
      });
      
      logger.info(`Processed results - Audit: ${results.audit.length}, System: ${results.system.length}`);
      
      // Set the totals with 300 record cap for no time range
      results.totalAudit = !hasTimeRange ? Math.min(counts.audit_count, 300) : counts.audit_count;
      results.totalSystem = !hasTimeRange ? Math.min(counts.system_count, 300) : counts.system_count;
      
      // Sanitize logs
      results.audit = this.sanitizeLogs(results.audit);
      results.system = this.sanitizeLogs(results.system);
      
      // Note: Combined logs caching is handled differently than single-type logs
      // We don't cache combined results to avoid cache complexity
      
      // Record metric
      await queryMetricsService.recordQueryMetric({
        queryType: 'combined_logs',
        executionTimeMs: Date.now() - startTime,
        rowCount: result.rows.length,
        cacheHit: false,
        timestamp: new Date(),
        queryParams: params
      });
      
      return results;
    } catch (error) {
      logger.error('Error in getCombinedLogs:', error);
      throw error;
    }
  }

  /**
   * Search audit logs using PostgreSQL full-text search
   */
  async searchAuditLogsFullText(searchQuery: string, page: number = 1, pageSize: number = 50): Promise<any> {
    const startTime = Date.now();
    let rowCount = 0;
    
    try {
      const offset = (page - 1) * pageSize;
      
      // Get total count using full-text search
      const countQuery = `
        SELECT COUNT(*) as count 
        FROM audit_logs 
        WHERE search_vector @@ websearch_to_tsquery('english', $1)
      `;
      const countResult = await db.query(countQuery, [searchQuery]);
      const total = parseInt(countResult.rows[0].count);
      
      // Get results using the search function
      const searchQuery2 = `
        SELECT 
          al.id,
          al.event_type,
          al.event_action,
          al.user_id,
          al.username,
          al.ip_address,
          al.user_agent,
          al.session_id,
          al.resource_type,
          al.resource_id,
          al.details,
          al.success,
          al.error_message,
          al.correlation_id,
          al.created_at,
          r.rank,
          r.headline
        FROM search_audit_logs($1, $2, $3) r
        JOIN audit_logs al ON al.id = r.id
        ORDER BY r.rank DESC, al.created_at DESC
      `;
      
      const result = await db.query(searchQuery2, [searchQuery, pageSize, offset]);
      
      rowCount = result.rows.length;
      
      // Record query metric
      await queryMetricsService.recordQueryMetric({
        queryType: 'audit_logs_fulltext',
        executionTimeMs: Date.now() - startTime,
        rowCount,
        cacheHit: false,
        timestamp: new Date(),
        queryParams: { searchQuery, page, pageSize }
      });
      
      return {
        logs: this.sanitizeLogs(result.rows.map((row: any) => ({
          ...row,
          searchHighlight: row.headline,
          searchRank: row.rank
        }))),
        total,
        searchQuery,
        page,
        pageSize
      };
    } catch (error) {
      logger.error('Error in full-text search for audit logs:', error);
      
      // Record error metric
      await queryMetricsService.recordQueryMetric({
        queryType: 'audit_logs_fulltext',
        executionTimeMs: Date.now() - startTime,
        rowCount: 0,
        cacheHit: false,
        timestamp: new Date(),
        queryParams: { searchQuery, page, pageSize },
        error: error instanceof Error ? ((error as any)?.message || String(error)) : 'Unknown error'
      });
      
      throw error;
    }
  }

  /**
   * Search system logs using PostgreSQL full-text search
   */
  async searchSystemLogsFullText(searchQuery: string, page: number = 1, pageSize: number = 50): Promise<any> {
    const startTime = Date.now();
    let rowCount = 0;
    
    try {
      const offset = (page - 1) * pageSize;
      
      // Get total count using full-text search
      const countQuery = `
        SELECT COUNT(*) as count 
        FROM system_logs 
        WHERE search_vector @@ websearch_to_tsquery('english', $1)
      `;
      const countResult = await db.query(countQuery, [searchQuery]);
      const total = parseInt(countResult.rows[0].count);
      
      // Get results using the search function
      const searchQuery2 = `
        SELECT 
          sl.id,
          sl.level,
          sl.message,
          sl.timestamp,
          sl.service,
          sl.module,
          sl.user_id,
          sl.request_id,
          sl.ip_address,
          sl.method,
          sl.url,
          sl.status_code,
          sl.duration_ms,
          sl.error_stack,
          sl.metadata,
          r.rank,
          r.headline
        FROM search_system_logs($1, $2, $3) r
        JOIN system_logs sl ON sl.id = r.id
        ORDER BY r.rank DESC, sl.timestamp DESC
      `;
      
      const result = await db.query(searchQuery2, [searchQuery, pageSize, offset]);
      
      rowCount = result.rows.length;
      
      // Record query metric
      await queryMetricsService.recordQueryMetric({
        queryType: 'system_logs_fulltext',
        executionTimeMs: Date.now() - startTime,
        rowCount,
        cacheHit: false,
        timestamp: new Date(),
        queryParams: { searchQuery, page, pageSize }
      });
      
      return {
        logs: this.sanitizeLogs(result.rows.map((row: any) => ({
          ...row,
          searchHighlight: row.headline,
          searchRank: row.rank
        }))),
        total,
        searchQuery,
        page,
        pageSize
      };
    } catch (error) {
      logger.error('Error in full-text search for system logs:', error);
      
      // Record error metric
      await queryMetricsService.recordQueryMetric({
        queryType: 'system_logs_fulltext',
        executionTimeMs: Date.now() - startTime,
        rowCount: 0,
        cacheHit: false,
        timestamp: new Date(),
        queryParams: { searchQuery, page, pageSize },
        error: error instanceof Error ? ((error as any)?.message || String(error)) : 'Unknown error'
      });
      
      throw error;
    }
  }

  /**
   * Perform fuzzy search on logs using trigram similarity
   */
  async fuzzySearchLogs(params: {
    type: 'audit' | 'system';
    field: string;
    searchTerm: string;
    threshold?: number;
    page?: number;
    pageSize?: number;
  }): Promise<any> {
    const { type, field, searchTerm, threshold = 0.3, page = 1, pageSize = 50 } = params;
    const offset = (page - 1) * pageSize;
    
    try {
      // Validate field based on log type
      const allowedFields = type === 'audit' 
        ? ['username', 'event_action', 'resource_type']
        : ['message', 'module', 'url'];
      
      if (!allowedFields.includes(field)) {
        throw new Error(`Invalid field for fuzzy search: ${field}`);
      }
      
      const table = type === 'audit' ? 'audit_logs' : 'system_logs';
      
      // Count query with similarity threshold
      const countQuery = `
        SELECT COUNT(*) as count
        FROM ${table}
        WHERE similarity("${field}", $1) > $2
      `;
      const countResult = await db.query(countQuery, [searchTerm, threshold]);
      const total = parseInt(countResult.rows[0].count);
      
      // Data query with similarity score
      const dataQuery = `
        SELECT *, 
               similarity("${field}", $1) AS similarity_score
        FROM ${table}
        WHERE similarity("${field}", $1) > $2
        ORDER BY similarity_score DESC, ${type === 'audit' ? 'created_at' : 'timestamp'} DESC
        LIMIT $3 OFFSET $4
      `;
      
      const result = await db.query(dataQuery, [searchTerm, threshold, pageSize, offset]);
      
      return {
        logs: this.sanitizeLogs(result.rows),
        total,
        searchTerm,
        field,
        threshold,
        page,
        pageSize
      };
    } catch (error) {
      logger.error('Error in fuzzy search:', error);
      throw error;
    }
  }

  /**
   * Enhanced search that combines full-text and fuzzy search
   */
  async enhancedSearch(params: LogQueryParams & { fuzzyThreshold?: number }): Promise<any> {
    const { search, type = 'all', fuzzyThreshold = 0.3 } = params;
    
    if (!search) {
      // Fall back to regular search
      return this.getCombinedLogs(params);
    }
    
    try {
      const results: any = {
        fullText: { audit: null, system: null },
        fuzzy: { audit: null, system: null },
        combined: []
      };
      
      // Perform full-text search if search has multiple words or operators
      const hasMultipleWords = search.trim().split(/\s+/).length > 1;
      const hasOperators = /[&|!()]/.test(search);
      
      if (hasMultipleWords || hasOperators) {
        if (type === 'audit' || type === 'all') {
          results.fullText.audit = await this.searchAuditLogsFullText(
            search, 
            params.page || 1, 
            params.pageSize || 50
          );
        }
        
        if (type === 'system' || type === 'all') {
          results.fullText.system = await this.searchSystemLogsFullText(
            search, 
            params.page || 1, 
            params.pageSize || 50
          );
        }
      } else {
        // For single words, use fuzzy search
        if (type === 'audit' || type === 'all') {
          results.fuzzy.audit = await this.fuzzySearchLogs({
            type: 'audit',
            field: 'username',
            searchTerm: search,
            threshold: fuzzyThreshold,
            page: params.page,
            pageSize: params.pageSize
          });
        }
        
        if (type === 'system' || type === 'all') {
          results.fuzzy.system = await this.fuzzySearchLogs({
            type: 'system',
            field: 'message',
            searchTerm: search,
            threshold: fuzzyThreshold,
            page: params.page,
            pageSize: params.pageSize
          });
        }
      }
      
      // Combine and deduplicate results
      const combinedLogs = this.combineSearchResults(results);
      
      return {
        logs: combinedLogs,
        total: combinedLogs.length,
        searchMethod: hasMultipleWords || hasOperators ? 'fulltext' : 'fuzzy',
        searchQuery: search
      };
    } catch (error) {
      logger.error('Error in enhanced search:', error);
      // Fall back to basic search
      return this.getCombinedLogs(params);
    }
  }

  /**
   * Combine search results from different methods
   */
  private combineSearchResults(results: any): any[] {
    const combined: any[] = [];
    const seen = new Set<string>();
    
    // Add full-text results first (higher priority)
    if (results.fullText.audit?.logs) {
      results.fullText.audit.logs.forEach((log: any) => {
        const key = `audit-${log.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          combined.push({ ...log, logType: 'audit', searchMethod: 'fulltext' });
        }
      });
    }
    
    if (results.fullText.system?.logs) {
      results.fullText.system.logs.forEach((log: any) => {
        const key = `system-${log.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          combined.push({ ...log, logType: 'system', searchMethod: 'fulltext' });
        }
      });
    }
    
    // Add fuzzy results
    if (results.fuzzy.audit?.logs) {
      results.fuzzy.audit.logs.forEach((log: any) => {
        const key = `audit-${log.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          combined.push({ ...log, logType: 'audit', searchMethod: 'fuzzy' });
        }
      });
    }
    
    if (results.fuzzy.system?.logs) {
      results.fuzzy.system.logs.forEach((log: any) => {
        const key = `system-${log.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          combined.push({ ...log, logType: 'system', searchMethod: 'fuzzy' });
        }
      });
    }
    
    // Sort by timestamp/created_at descending
    return combined.sort((a, b) => {
      const dateA = new Date(a.created_at || a.timestamp).getTime();
      const dateB = new Date(b.created_at || b.timestamp).getTime();
      return dateB - dateA;
    });
  }

  /**
   * Build combined query using materialized view or UNION ALL
   */
  private buildCombinedQuery(params: LogQueryParams, offset: number, limit: number): { sql: string; parameters: any[] } {
    // Check if we can use materialized view
    const canUseMaterializedView = this.canUseMaterializedViewForQuery(params);
    
    if (canUseMaterializedView) {
      return this.buildMaterializedViewQuery(params, offset, limit);
    }
    
    // Fallback to original UNION ALL query
    const parameters: any[] = [];
    let paramIndex = 1;
    
    // Check if we have time range filters
    const hasTimeRange = params.startDate || params.endDate;
    
    // Build audit WHERE conditions
    const auditConditions: string[] = [];
    if (params.eventType) {
      auditConditions.push(`event_type = $${paramIndex}`);
      parameters.push(params.eventType);
      paramIndex++;
    }
    if (params.eventAction) {
      auditConditions.push(`event_action = $${paramIndex}`);
      parameters.push(params.eventAction);
      paramIndex++;
    }
    
    // Store positions for shared parameters
    let userIdParamPos = 0;
    let correlationIdParamPos = 0;
    let startDateParamPos = 0;
    let endDateParamPos = 0;
    let searchParamPos = 0;
    
    if (params.userId) {
      userIdParamPos = paramIndex;
      auditConditions.push(`user_id = $${paramIndex}`);
      parameters.push(params.userId);
      paramIndex++;
    }
    if (params.correlationId) {
      correlationIdParamPos = paramIndex;
      auditConditions.push(`correlation_id = $${paramIndex}`);
      parameters.push(params.correlationId);
      paramIndex++;
    }
    if (params.startDate) {
      startDateParamPos = paramIndex;
      auditConditions.push(`created_at >= $${paramIndex}`);
      parameters.push(new Date(params.startDate));
      paramIndex++;
    }
    if (params.endDate) {
      endDateParamPos = paramIndex;
      auditConditions.push(`created_at <= $${paramIndex}`);
      parameters.push(new Date(params.endDate));
      paramIndex++;
    }
    if (params.search) {
      searchParamPos = paramIndex;
      auditConditions.push(`(
        username ILIKE $${paramIndex} OR 
        event_action ILIKE $${paramIndex} OR 
        resource_type ILIKE $${paramIndex} OR 
        details::text ILIKE $${paramIndex}
      )`);
      parameters.push(`%${params.search}%`);
      paramIndex++;
    }
    
    // Build system WHERE conditions - reuse parameter positions for shared params
    const systemConditions: string[] = [];
    if (params.level) {
      systemConditions.push(`level = $${paramIndex}`);
      parameters.push(params.level);
      paramIndex++;
    }
    if (params.module) {
      systemConditions.push(`module = $${paramIndex}`);
      parameters.push(params.module);
      paramIndex++;
    }
    if (params.userId && userIdParamPos > 0) {
      systemConditions.push(`user_id = $${userIdParamPos}`);
      // Don't push again, reuse existing parameter
    }
    if (params.correlationId && correlationIdParamPos > 0) {
      systemConditions.push(`request_id = $${correlationIdParamPos}`);
      // Don't push again, reuse existing parameter
    }
    if (params.startDate && startDateParamPos > 0) {
      systemConditions.push(`timestamp >= $${startDateParamPos}`);
      // Don't push again, reuse existing parameter
    }
    if (params.endDate && endDateParamPos > 0) {
      systemConditions.push(`timestamp <= $${endDateParamPos}`);
      // Don't push again, reuse existing parameter
    }
    if (params.search && searchParamPos > 0) {
      systemConditions.push(`(
        message ILIKE $${searchParamPos} OR 
        module ILIKE $${searchParamPos} OR 
        url ILIKE $${searchParamPos} OR 
        metadata::text ILIKE $${searchParamPos}
      )`);
      // Don't push again, reuse existing parameter
    }
    
    const auditWhere = auditConditions.length > 0 ? `WHERE ${auditConditions.join(' AND ')}` : '';
    const systemWhere = systemConditions.length > 0 ? `WHERE ${systemConditions.join(' AND ')}` : '';
    
    const sortOrder = params.sortOrder === 'asc' ? 'ASC' : 'DESC';
    
    let sql: string;
    
    if (!hasTimeRange) {
      // When no time range is specified, limit to the most recent 300 records first,
      // then apply pagination within those 300 records
      sql = `
        WITH combined_logs AS (
          SELECT 
            'audit' as log_type,
            id,
            created_at as timestamp,
            event_type,
            event_action,
            user_id,
            username,
            ip_address,
            user_agent,
            session_id,
            resource_type,
            resource_id,
            details,
            success,
            error_message,
            correlation_id,
            NULL::varchar as level,
            NULL::text as message,
            NULL::varchar as service,
            NULL::varchar as module,
            NULL::varchar as request_id,
            NULL::varchar as method,
            NULL::varchar as url,
            NULL::integer as status_code,
            NULL::integer as duration_ms,
            NULL::text as error_stack,
            NULL::jsonb as metadata
          FROM audit_logs
          ${auditWhere}
          
          UNION ALL
          
          SELECT 
            'system' as log_type,
            id,
            timestamp,
            NULL as event_type,
            NULL as event_action,
            user_id,
            NULL as username,
            ip_address,
            NULL as user_agent,
            NULL as session_id,
            NULL as resource_type,
            NULL as resource_id,
            NULL::jsonb as details,
            NULL::boolean as success,
            NULL as error_message,
            request_id as correlation_id,
            level,
            message,
            service,
            module,
            request_id,
            method,
            url,
            status_code,
            duration_ms,
            error_stack,
            metadata
          FROM system_logs
          ${systemWhere}
        ),
        latest_logs AS (
          SELECT * FROM combined_logs
          ORDER BY timestamp DESC
          LIMIT 300
        )
        SELECT * FROM latest_logs
        ORDER BY timestamp ${sortOrder}
        LIMIT $${parameters.length + 1} OFFSET $${parameters.length + 2}
      `;
    } else {
      // When time range is specified, use normal pagination
      sql = `
        WITH combined_logs AS (
          SELECT 
            'audit' as log_type,
            id,
            created_at as timestamp,
            event_type,
            event_action,
            user_id,
            username,
            ip_address,
            user_agent,
            session_id,
            resource_type,
            resource_id,
            details,
            success,
            error_message,
            correlation_id,
            NULL::varchar as level,
            NULL::text as message,
            NULL::varchar as service,
            NULL::varchar as module,
            NULL::varchar as request_id,
            NULL::varchar as method,
            NULL::varchar as url,
            NULL::integer as status_code,
            NULL::integer as duration_ms,
            NULL::text as error_stack,
            NULL::jsonb as metadata
          FROM audit_logs
          ${auditWhere}
          
          UNION ALL
          
          SELECT 
            'system' as log_type,
            id,
            timestamp,
            NULL as event_type,
            NULL as event_action,
            user_id,
            NULL as username,
            ip_address,
            NULL as user_agent,
            NULL as session_id,
            NULL as resource_type,
            NULL as resource_id,
            NULL::jsonb as details,
            NULL::boolean as success,
            NULL as error_message,
            request_id as correlation_id,
            level,
            message,
            service,
            module,
            request_id,
            method,
            url,
            status_code,
            duration_ms,
            error_stack,
            metadata
          FROM system_logs
          ${systemWhere}
        )
        SELECT * FROM combined_logs
        ORDER BY timestamp ${sortOrder}
        LIMIT $${parameters.length + 1} OFFSET $${parameters.length + 2}
      `;
    }
    
    parameters.push(limit, offset);
    
    return { sql, parameters };
  }

  /**
   * Build count query for combined logs
   */
  private buildCombinedCountQuery(params: LogQueryParams): { sql: string; parameters: any[] } {
    const parameters: any[] = [];
    let paramIndex = 1;
    
    // Build audit WHERE conditions (same logic as buildCombinedQuery)
    const auditConditions: string[] = [];
    if (params.eventType) {
      auditConditions.push(`event_type = $${paramIndex++}`);
      parameters.push(params.eventType);
    }
    if (params.eventAction) {
      auditConditions.push(`event_action = $${paramIndex++}`);
      parameters.push(params.eventAction);
    }
    if (params.userId) {
      auditConditions.push(`user_id = $${paramIndex++}`);
      parameters.push(params.userId);
    }
    if (params.correlationId) {
      auditConditions.push(`correlation_id = $${paramIndex++}`);
      parameters.push(params.correlationId);
    }
    if (params.startDate) {
      auditConditions.push(`created_at >= $${paramIndex++}`);
      parameters.push(new Date(params.startDate));
    }
    if (params.endDate) {
      auditConditions.push(`created_at <= $${paramIndex++}`);
      parameters.push(new Date(params.endDate));
    }
    if (params.search) {
      auditConditions.push(`(
        username ILIKE $${paramIndex} OR 
        event_action ILIKE $${paramIndex} OR 
        resource_type ILIKE $${paramIndex} OR 
        details::text ILIKE $${paramIndex}
      )`);
      parameters.push(`%${params.search}%`);
      paramIndex++;
    }
    
    const auditWhere = auditConditions.length > 0 ? `WHERE ${auditConditions.join(' AND ')}` : '';
    
    // For system logs, we need to reuse the same parameters in the same order
    const systemWhere = auditWhere
      .replace(/created_at/g, 'timestamp')
      .replace(/correlation_id/g, 'request_id');
    
    const sql = `
      SELECT 
        (SELECT COUNT(*) FROM audit_logs ${auditWhere}) as audit_count,
        (SELECT COUNT(*) FROM system_logs ${systemWhere}) as system_count
    `;
    
    return { sql, parameters };
  }

  /**
   * Map audit log from combined query result
   */
  private mapAuditLogFromCombined(row: any): any {
    return {
      id: row.id,
      event_type: row.event_type,
      event_action: row.event_action,
      user_id: row.user_id,
      username: row.username,
      ip_address: row.ip_address,
      user_agent: row.user_agent,
      session_id: row.session_id,
      resource_type: row.resource_type,
      resource_id: row.resource_id,
      details: row.details,
      success: row.success,
      error_message: row.error_message,
      correlation_id: row.correlation_id,
      created_at: row.timestamp
    };
  }

  /**
   * Map system log from combined query result
   */
  private mapSystemLogFromCombined(row: any): any {
    return {
      id: row.id,
      level: row.level,
      message: row.message,
      timestamp: row.timestamp,
      service: row.service,
      module: row.module,
      user_id: row.user_id,
      request_id: row.request_id,
      ip_address: row.ip_address,
      method: row.method,
      url: row.url,
      status_code: row.status_code,
      duration_ms: row.duration_ms,
      error_stack: row.error_stack,
      metadata: row.metadata
    };
  }

  /**
   * Check if we can use materialized view for the query
   */
  private canUseMaterializedViewForQuery(params: LogQueryParams): boolean {
    // Check if materialized views are enabled
    const mvEnabled = process.env.USE_MATERIALIZED_VIEWS !== 'false';
    if (!mvEnabled) return false;

    // Check if query is within materialized view date range (90 days)
    if (params.startDate) {
      const startDate = new Date(params.startDate);
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      
      if (startDate < ninetyDaysAgo) {
        return false; // Query includes data older than materialized view
      }
    }

    // All other queries can use materialized view
    return true;
  }

  /**
   * Build query using materialized view
   */
  private buildMaterializedViewQuery(params: LogQueryParams, offset: number, limit: number): { sql: string; parameters: any[] } {
    const conditions: string[] = [];
    const parameters: any[] = [];
    let paramIndex = 1;

    // Check if we have time range filters
    const hasTimeRange = params.startDate || params.endDate;

    // Log type filter
    if (params.type && params.type !== 'all') {
      conditions.push(`log_type = $${paramIndex++}`);
      parameters.push(params.type);
    }

    // Event type filter
    if (params.eventType) {
      conditions.push(`event_type = $${paramIndex++}`);
      parameters.push(params.eventType);
    }

    // Event action filter
    if (params.eventAction) {
      conditions.push(`event_action = $${paramIndex++}`);
      parameters.push(params.eventAction);
    }

    // Level filter
    if (params.level) {
      conditions.push(`level = $${paramIndex++}`);
      parameters.push(params.level);
    }

    // Module filter
    if (params.module) {
      conditions.push(`module = $${paramIndex++}`);
      parameters.push(params.module);
    }

    // User ID filter
    if (params.userId) {
      conditions.push(`user_id = $${paramIndex++}`);
      parameters.push(params.userId);
    }

    // Correlation ID filter
    if (params.correlationId) {
      conditions.push(`correlation_id = $${paramIndex++}`);
      parameters.push(params.correlationId);
    }

    // Date range filters
    if (params.startDate) {
      conditions.push(`timestamp >= $${paramIndex++}`);
      parameters.push(new Date(params.startDate));
    }

    if (params.endDate) {
      conditions.push(`timestamp <= $${paramIndex++}`);
      parameters.push(new Date(params.endDate));
    }

    // Search filter
    if (params.search) {
      const searchParam = `%${params.search}%`;
      conditions.push(`(
        username ILIKE $${paramIndex} OR 
        event_action ILIKE $${paramIndex} OR 
        resource_type ILIKE $${paramIndex} OR 
        details::text ILIKE $${paramIndex} OR
        message ILIKE $${paramIndex} OR 
        module ILIKE $${paramIndex} OR 
        url ILIKE $${paramIndex} OR 
        metadata::text ILIKE $${paramIndex}
      )`);
      parameters.push(searchParam);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sortOrder = params.sortOrder === 'asc' ? 'ASC' : 'DESC';
    const sortColumn = params.sortBy || 'timestamp';

    let sql: string;

    if (!hasTimeRange) {
      // When no time range is specified, limit to the most recent 300 records first,
      // then apply pagination within those 300 records
      sql = `
        WITH latest_logs AS (
          SELECT * FROM mv_combined_logs
          ${whereClause}
          ORDER BY timestamp DESC
          LIMIT 300
        )
        SELECT * FROM latest_logs
        ORDER BY ${sortColumn} ${sortOrder}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
    } else {
      // When time range is specified, use normal pagination
      sql = `
        SELECT * FROM mv_combined_logs
        ${whereClause}
        ORDER BY ${sortColumn} ${sortOrder}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
    }

    parameters.push(limit, offset);

    return { sql, parameters };
  }

  /**
   * Build count query using materialized view
   */
  private buildMaterializedViewCountQuery(params: LogQueryParams): { sql: string; parameters: any[] } {
    const canUseMaterializedView = this.canUseMaterializedViewForQuery(params);
    
    if (!canUseMaterializedView) {
      return this.buildCombinedCountQuery(params);
    }

    const conditions: string[] = [];
    const parameters: any[] = [];
    let paramIndex = 1;

    // Apply same filters as main query
    if (params.type && params.type !== 'all') {
      conditions.push(`log_type = $${paramIndex++}`);
      parameters.push(params.type);
    }

    if (params.eventType) {
      conditions.push(`event_type = $${paramIndex++}`);
      parameters.push(params.eventType);
    }

    if (params.eventAction) {
      conditions.push(`event_action = $${paramIndex++}`);
      parameters.push(params.eventAction);
    }

    if (params.level) {
      conditions.push(`level = $${paramIndex++}`);
      parameters.push(params.level);
    }

    if (params.module) {
      conditions.push(`module = $${paramIndex++}`);
      parameters.push(params.module);
    }

    if (params.userId) {
      conditions.push(`user_id = $${paramIndex++}`);
      parameters.push(params.userId);
    }

    if (params.correlationId) {
      conditions.push(`correlation_id = $${paramIndex++}`);
      parameters.push(params.correlationId);
    }

    if (params.startDate) {
      conditions.push(`timestamp >= $${paramIndex++}`);
      parameters.push(new Date(params.startDate));
    }

    if (params.endDate) {
      conditions.push(`timestamp <= $${paramIndex++}`);
      parameters.push(new Date(params.endDate));
    }

    if (params.search) {
      const searchParam = `%${params.search}%`;
      conditions.push(`(
        username ILIKE $${paramIndex} OR 
        event_action ILIKE $${paramIndex} OR 
        resource_type ILIKE $${paramIndex} OR 
        details::text ILIKE $${paramIndex} OR
        message ILIKE $${paramIndex} OR 
        module ILIKE $${paramIndex} OR 
        url ILIKE $${paramIndex} OR 
        metadata::text ILIKE $${paramIndex}
      )`);
      parameters.push(searchParam);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT 
        COUNT(CASE WHEN log_type = 'audit' THEN 1 END) as audit_count,
        COUNT(CASE WHEN log_type = 'system' THEN 1 END) as system_count
      FROM mv_combined_logs
      ${whereClause}
    `;

    return { sql, parameters };
  }

  /**
   * Get a single log entry by ID
   */
  async getLogById(id: string | number): Promise<any | null> {
    try {
      // Try audit logs first
      const auditQuery = 'SELECT * FROM audit_logs WHERE id = $1';
      const auditResult = await db.query(auditQuery, [id]);
      
      if (auditResult.rows.length > 0) {
        return {
          ...auditResult.rows[0],
          logType: 'audit'
        };
      }

      // Try system logs
      const systemQuery = 'SELECT * FROM system_logs WHERE id = $1';
      const systemResult = await db.query(systemQuery, [id]);
      
      if (systemResult.rows.length > 0) {
        return {
          ...systemResult.rows[0],
          logType: 'system'
        };
      }

      return null;
    } catch (error) {
      logger.error('Error fetching log by ID:', error);
      throw error;
    }
  }

  /**
   * Test database connectivity
   */
  async testConnection(): Promise<{ connected: boolean; latency?: number; error?: string }> {
    const startTime = Date.now();
    
    try {
      // Test basic database connection
      await db.query('SELECT 1');
      const latency = Date.now() - startTime;
      
      logger.info(`Database connection test successful - latency: ${latency}ms`);
      
      return {
        connected: true,
        latency
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? ((error as any)?.message || String(error)) : 'Unknown database error';
      logger.error('Database connection test failed:', error);
      
      return {
        connected: false,
        error: errorMessage
      };
    }
  }
}

export const logsService = new LogsService();