import { db } from '@/config/database';
import { logger } from '@/utils/logger';

export class QueryAnalyzer {
  /**
   * Analyze a query execution plan
   */
  static async analyzeQuery(sql: string, parameters: any[]): Promise<void> {
    try {
      // Run EXPLAIN ANALYZE on the query
      const explainSql = `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`;
      
      logger.info('Running EXPLAIN ANALYZE on query...');
      const result = await db.query(explainSql, parameters);
      
      const plan = result.rows[0]['QUERY PLAN'][0];
      
      // Log key metrics
      logger.info('Query Execution Plan:', {
        executionTime: plan['Execution Time'],
        planningTime: plan['Planning Time'],
        totalCost: plan['Plan']['Total Cost'],
        actualRows: plan['Plan']['Actual Rows'],
        planRows: plan['Plan']['Plan Rows'],
        planWidth: plan['Plan']['Plan Width'],
        nodeType: plan['Plan']['Node Type']
      });
      
      // Check for performance issues
      this.checkPerformanceIssues(plan['Plan']);
      
    } catch (error) {
      logger.error('Error analyzing query:', error);
    }
  }
  
  /**
   * Check for common performance issues in query plan
   */
  private static checkPerformanceIssues(plan: any, depth: number = 0): void {
    const indent = '  '.repeat(depth);
    
    // Check for sequential scans on large tables
    if (plan['Node Type'] === 'Seq Scan') {
      const rows = plan['Actual Rows'] || plan['Plan Rows'];
      if (rows > 1000) {
        logger.warn(`${indent}⚠️  Sequential scan on ${plan['Relation Name']} with ${rows} rows - consider adding index`);
      }
    }
    
    // Check for nested loops with high row counts
    if (plan['Node Type'] === 'Nested Loop' && plan['Actual Rows'] > 10000) {
      logger.warn(`${indent}⚠️  Nested Loop with ${plan['Actual Rows']} rows - might be inefficient`);
    }
    
    // Check for sort operations
    if (plan['Node Type'] === 'Sort') {
      logger.info(`${indent}📊 Sort operation: ${plan['Sort Key']} - Using ${plan['Sort Space Used']} KB`);
    }
    
    // Check for hash joins
    if (plan['Node Type'] === 'Hash Join') {
      logger.info(`${indent}#️⃣  Hash Join on ${plan['Hash Cond']}`);
    }
    
    // Log index usage
    if (plan['Node Type'] === 'Index Scan' || plan['Node Type'] === 'Index Only Scan') {
      logger.info(`${indent}✅ Using index: ${plan['Index Name']} on ${plan['Relation Name']}`);
    }
    
    // Recursively check child plans
    if (plan['Plans']) {
      plan['Plans'].forEach((childPlan: any) => {
        this.checkPerformanceIssues(childPlan, depth + 1);
      });
    }
  }
  
  /**
   * Get table statistics
   */
  static async getTableStats(tableName: string): Promise<void> {
    try {
      const statsQuery = `
        SELECT 
          schemaname,
          tablename,
          n_live_tup as live_rows,
          n_dead_tup as dead_rows,
          last_vacuum,
          last_autovacuum,
          last_analyze,
          last_autoanalyze
        FROM pg_stat_user_tables
        WHERE tablename = $1
      `;
      
      const result = await db.query(statsQuery, [tableName]);
      
      if (result.rows[0]) {
        logger.info(`Table statistics for ${tableName}:`, result.rows[0]);
      }
    } catch (error) {
      logger.error('Error getting table stats:', error);
    }
  }
  
  /**
   * Check index usage for a table
   */
  static async checkIndexUsage(tableName: string): Promise<void> {
    try {
      const indexQuery = `
        SELECT 
          indexname,
          idx_scan as index_scans,
          idx_tup_read as tuples_read,
          idx_tup_fetch as tuples_fetched
        FROM pg_stat_user_indexes
        WHERE tablename = $1
        ORDER BY idx_scan DESC
      `;
      
      const result = await db.query(indexQuery, [tableName]);
      
      logger.info(`Index usage for ${tableName}:`, result.rows);
    } catch (error) {
      logger.error('Error checking index usage:', error);
    }
  }
}