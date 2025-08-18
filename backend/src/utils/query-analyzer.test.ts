import { QueryAnalyzer } from './query-analyzer';
import { db } from '@/config/database';
import { logger } from '@/utils/logger';

jest.mock('@/config/database', () => ({
  db: {
    query: jest.fn()
  }
}));

jest.mock('@/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

describe('QueryAnalyzer', () => {
  const mockDbQuery = db.query as jest.MockedFunction<typeof db.query>;
  const mockLogger = logger as jest.Mocked<typeof logger>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('analyzeQuery', () => {
    const mockQueryPlan = {
      'QUERY PLAN': [{
        'Execution Time': 125.5,
        'Planning Time': 5.2,
        'Plan': {
          'Total Cost': 1000.5,
          'Actual Rows': 250,
          'Plan Rows': 300,
          'Plan Width': 64,
          'Node Type': 'Seq Scan',
          'Relation Name': 'users'
        }
      }]
    };

    it('should analyze a simple query successfully', async () => {
      mockDbQuery.mockResolvedValueOnce({ rows: [mockQueryPlan] });

      await QueryAnalyzer.analyzeQuery('SELECT * FROM users', []);

      expect(mockDbQuery).toHaveBeenCalledWith(
        'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT * FROM users',
        []
      );
      expect(mockLogger.info).toHaveBeenCalledWith('Running EXPLAIN ANALYZE on query...');
      expect(mockLogger.info).toHaveBeenCalledWith('Query Execution Plan:', {
        executionTime: 125.5,
        planningTime: 5.2,
        totalCost: 1000.5,
        actualRows: 250,
        planRows: 300,
        planWidth: 64,
        nodeType: 'Seq Scan'
      });
    });

    it('should analyze query with parameters', async () => {
      mockDbQuery.mockResolvedValueOnce({ rows: [mockQueryPlan] });
      const parameters = [1, 'active'];

      await QueryAnalyzer.analyzeQuery('SELECT * FROM users WHERE id = $1 AND status = $2', parameters);

      expect(mockDbQuery).toHaveBeenCalledWith(
        'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT * FROM users WHERE id = $1 AND status = $2',
        parameters
      );
    });

    it('should handle database errors gracefully', async () => {
      const error = new Error('Database connection failed');
      mockDbQuery.mockRejectedValueOnce(error);

      await QueryAnalyzer.analyzeQuery('SELECT * FROM users', []);

      expect(mockLogger.error).toHaveBeenCalledWith('Error analyzing query:', error);
    });

    it('should handle missing plan data', async () => {
      const mockEmptyPlan = { 'QUERY PLAN': [{ 'Plan': {} }] };
      mockDbQuery.mockResolvedValueOnce({ rows: [mockEmptyPlan] });

      await QueryAnalyzer.analyzeQuery('SELECT * FROM users', []);

      expect(mockLogger.info).toHaveBeenCalledWith('Query Execution Plan:', {
        executionTime: undefined,
        planningTime: undefined,
        totalCost: undefined,
        actualRows: undefined,
        planRows: undefined,
        planWidth: undefined,
        nodeType: undefined
      });
    });

    it('should analyze complex queries with nested plans', async () => {
      const complexPlan = {
        'QUERY PLAN': [{
          'Execution Time': 500.75,
          'Planning Time': 15.3,
          'Plan': {
            'Total Cost': 5000.25,
            'Actual Rows': 1000,
            'Plan Rows': 1200,
            'Plan Width': 128,
            'Node Type': 'Hash Join',
            'Hash Cond': '(users.id = orders.user_id)',
            'Plans': [
              {
                'Node Type': 'Seq Scan',
                'Relation Name': 'users',
                'Actual Rows': 10000
              },
              {
                'Node Type': 'Index Scan',
                'Relation Name': 'orders',
                'Index Name': 'idx_orders_user_id',
                'Actual Rows': 5000
              }
            ]
          }
        }]
      };

      mockDbQuery.mockResolvedValueOnce({ rows: [complexPlan] });

      await QueryAnalyzer.analyzeQuery(
        'SELECT * FROM users JOIN orders ON users.id = orders.user_id',
        []
      );

      expect(mockLogger.info).toHaveBeenCalledWith('Query Execution Plan:', {
        executionTime: 500.75,
        planningTime: 15.3,
        totalCost: 5000.25,
        actualRows: 1000,
        planRows: 1200,
        planWidth: 128,
        nodeType: 'Hash Join'
      });
    });
  });

  describe('checkPerformanceIssues', () => {
    it('should warn about sequential scans on large tables', async () => {
      const planWithSeqScan = {
        'QUERY PLAN': [{
          'Plan': {
            'Node Type': 'Seq Scan',
            'Relation Name': 'large_table',
            'Actual Rows': 50000,
            'Plan Rows': 45000
          }
        }]
      };

      mockDbQuery.mockResolvedValueOnce({ rows: [planWithSeqScan] });

      await QueryAnalyzer.analyzeQuery('SELECT * FROM large_table', []);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        '⚠️  Sequential scan on large_table with 50000 rows - consider adding index'
      );
    });

    it('should not warn about sequential scans on small tables', async () => {
      const planWithSmallSeqScan = {
        'QUERY PLAN': [{
          'Plan': {
            'Node Type': 'Seq Scan',
            'Relation Name': 'small_table',
            'Actual Rows': 100
          }
        }]
      };

      mockDbQuery.mockResolvedValueOnce({ rows: [planWithSmallSeqScan] });

      await QueryAnalyzer.analyzeQuery('SELECT * FROM small_table', []);

      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should use Plan Rows when Actual Rows is not available', async () => {
      const planWithPlanRows = {
        'QUERY PLAN': [{
          'Plan': {
            'Node Type': 'Seq Scan',
            'Relation Name': 'table_name',
            'Plan Rows': 25000
          }
        }]
      };

      mockDbQuery.mockResolvedValueOnce({ rows: [planWithPlanRows] });

      await QueryAnalyzer.analyzeQuery('SELECT * FROM table_name', []);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        '⚠️  Sequential scan on table_name with 25000 rows - consider adding index'
      );
    });

    it('should warn about inefficient nested loops', async () => {
      const planWithNestedLoop = {
        'QUERY PLAN': [{
          'Plan': {
            'Node Type': 'Nested Loop',
            'Actual Rows': 50000
          }
        }]
      };

      mockDbQuery.mockResolvedValueOnce({ rows: [planWithNestedLoop] });

      await QueryAnalyzer.analyzeQuery('SELECT * FROM table1 t1, table2 t2', []);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        '⚠️  Nested Loop with 50000 rows - might be inefficient'
      );
    });

    it('should not warn about efficient nested loops', async () => {
      const planWithSmallNestedLoop = {
        'QUERY PLAN': [{
          'Plan': {
            'Node Type': 'Nested Loop',
            'Actual Rows': 500
          }
        }]
      };

      mockDbQuery.mockResolvedValueOnce({ rows: [planWithSmallNestedLoop] });

      await QueryAnalyzer.analyzeQuery('SELECT * FROM table1 t1, table2 t2', []);

      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should log sort operations', async () => {
      const planWithSort = {
        'QUERY PLAN': [{
          'Plan': {
            'Node Type': 'Sort',
            'Sort Key': ['created_at DESC'],
            'Sort Space Used': 2048
          }
        }]
      };

      mockDbQuery.mockResolvedValueOnce({ rows: [planWithSort] });

      await QueryAnalyzer.analyzeQuery('SELECT * FROM users ORDER BY created_at DESC', []);

      expect(mockLogger.info).toHaveBeenCalledWith(
        '📊 Sort operation: created_at DESC - Using 2048 KB'
      );
    });

    it('should log hash joins', async () => {
      const planWithHashJoin = {
        'QUERY PLAN': [{
          'Plan': {
            'Node Type': 'Hash Join',
            'Hash Cond': '(users.id = orders.user_id)'
          }
        }]
      };

      mockDbQuery.mockResolvedValueOnce({ rows: [planWithHashJoin] });

      await QueryAnalyzer.analyzeQuery(
        'SELECT * FROM users JOIN orders ON users.id = orders.user_id',
        []
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        '#️⃣  Hash Join on (users.id = orders.user_id)'
      );
    });

    it('should log index scans', async () => {
      const planWithIndexScan = {
        'QUERY PLAN': [{
          'Plan': {
            'Node Type': 'Index Scan',
            'Index Name': 'idx_users_email',
            'Relation Name': 'users'
          }
        }]
      };

      mockDbQuery.mockResolvedValueOnce({ rows: [planWithIndexScan] });

      await QueryAnalyzer.analyzeQuery('SELECT * FROM users WHERE email = $1', ['test@example.com']);

      expect(mockLogger.info).toHaveBeenCalledWith(
        '✅ Using index: idx_users_email on users'
      );
    });

    it('should log index only scans', async () => {
      const planWithIndexOnlyScan = {
        'QUERY PLAN': [{
          'Plan': {
            'Node Type': 'Index Only Scan',
            'Index Name': 'idx_users_id_email',
            'Relation Name': 'users'
          }
        }]
      };

      mockDbQuery.mockResolvedValueOnce({ rows: [planWithIndexOnlyScan] });

      await QueryAnalyzer.analyzeQuery('SELECT id, email FROM users WHERE email = $1', ['test@example.com']);

      expect(mockLogger.info).toHaveBeenCalledWith(
        '✅ Using index: idx_users_id_email on users'
      );
    });

    it('should handle nested plans recursively', async () => {
      const nestedPlan = {
        'QUERY PLAN': [{
          'Plan': {
            'Node Type': 'Hash Join',
            'Hash Cond': '(users.id = orders.user_id)',
            'Plans': [
              {
                'Node Type': 'Seq Scan',
                'Relation Name': 'users',
                'Actual Rows': 50000
              },
              {
                'Node Type': 'Hash',
                'Plans': [
                  {
                    'Node Type': 'Index Scan',
                    'Index Name': 'idx_orders_user_id',
                    'Relation Name': 'orders'
                  }
                ]
              }
            ]
          }
        }]
      };

      mockDbQuery.mockResolvedValueOnce({ rows: [nestedPlan] });

      await QueryAnalyzer.analyzeQuery(
        'SELECT * FROM users JOIN orders ON users.id = orders.user_id',
        []
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        '#️⃣  Hash Join on (users.id = orders.user_id)'
      );
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '  ⚠️  Sequential scan on users with 50000 rows - consider adding index'
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        '    ✅ Using index: idx_orders_user_id on orders'
      );
    });

    it('should handle plans without child plans', async () => {
      const simplePlan = {
        'QUERY PLAN': [{
          'Plan': {
            'Node Type': 'Index Scan',
            'Index Name': 'idx_users_id',
            'Relation Name': 'users'
          }
        }]
      };

      mockDbQuery.mockResolvedValueOnce({ rows: [simplePlan] });

      await QueryAnalyzer.analyzeQuery('SELECT * FROM users WHERE id = $1', [1]);

      expect(mockLogger.info).toHaveBeenCalledWith(
        '✅ Using index: idx_users_id on users'
      );
    });

    it('should handle multiple nested levels with proper indentation', async () => {
      const deeplyNestedPlan = {
        'QUERY PLAN': [{
          'Plan': {
            'Node Type': 'Merge Join',
            'Plans': [
              {
                'Node Type': 'Sort',
                'Sort Key': ['users.id'],
                'Plans': [
                  {
                    'Node Type': 'Seq Scan',
                    'Relation Name': 'users',
                    'Actual Rows': 15000
                  }
                ]
              },
              {
                'Node Type': 'Sort',
                'Sort Key': ['orders.user_id'],
                'Plans': [
                  {
                    'Node Type': 'Index Scan',
                    'Index Name': 'idx_orders_user_id',
                    'Relation Name': 'orders'
                  }
                ]
              }
            ]
          }
        }]
      };

      mockDbQuery.mockResolvedValueOnce({ rows: [deeplyNestedPlan] });

      await QueryAnalyzer.analyzeQuery(
        'SELECT * FROM users JOIN orders ON users.id = orders.user_id',
        []
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        '  📊 Sort operation: users.id - Using undefined KB'
      );
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '    ⚠️  Sequential scan on users with 15000 rows - consider adding index'
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        '  📊 Sort operation: orders.user_id - Using undefined KB'
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        '    ✅ Using index: idx_orders_user_id on orders'
      );
    });
  });

  describe('getTableStats', () => {
    const mockTableStats = {
      rows: [{
        schemaname: 'public',
        tablename: 'users',
        live_rows: 10000,
        dead_rows: 150,
        last_vacuum: '2025-01-01 10:00:00',
        last_autovacuum: '2025-01-02 02:00:00',
        last_analyze: '2025-01-01 10:30:00',
        last_autoanalyze: '2025-01-02 02:30:00'
      }]
    };

    it('should get table statistics successfully', async () => {
      mockDbQuery.mockResolvedValueOnce(mockTableStats);

      await QueryAnalyzer.getTableStats('users');

      expect(mockDbQuery).toHaveBeenCalledWith(
        `
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
      `,
        ['users']
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Table statistics for users:',
        mockTableStats.rows[0]
      );
    });

    it('should handle table not found', async () => {
      mockDbQuery.mockResolvedValueOnce({ rows: [] });

      await QueryAnalyzer.getTableStats('nonexistent_table');

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('FROM pg_stat_user_tables'),
        ['nonexistent_table']
      );

      expect(mockLogger.info).not.toHaveBeenCalledWith(
        expect.stringContaining('Table statistics for')
      );
    });

    it('should handle database errors when getting table stats', async () => {
      const error = new Error('Permission denied');
      mockDbQuery.mockRejectedValueOnce(error);

      await QueryAnalyzer.getTableStats('users');

      expect(mockLogger.error).toHaveBeenCalledWith('Error getting table stats:', error);
    });

    it('should handle null values in table stats', async () => {
      const statsWithNulls = {
        rows: [{
          schemaname: 'public',
          tablename: 'users',
          live_rows: 5000,
          dead_rows: null,
          last_vacuum: null,
          last_autovacuum: '2025-01-02 02:00:00',
          last_analyze: null,
          last_autoanalyze: '2025-01-02 02:30:00'
        }]
      };

      mockDbQuery.mockResolvedValueOnce(statsWithNulls);

      await QueryAnalyzer.getTableStats('users');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Table statistics for users:',
        statsWithNulls.rows[0]
      );
    });

    it('should handle special characters in table names', async () => {
      mockDbQuery.mockResolvedValueOnce({ rows: [] });

      await QueryAnalyzer.getTableStats('table_with_underscore');

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE tablename = $1'),
        ['table_with_underscore']
      );
    });
  });

  describe('checkIndexUsage', () => {
    const mockIndexStats = {
      rows: [
        {
          indexname: 'users_pkey',
          index_scans: 50000,
          tuples_read: 50000,
          tuples_fetched: 50000
        },
        {
          indexname: 'idx_users_email',
          index_scans: 25000,
          tuples_read: 25000,
          tuples_fetched: 25000
        },
        {
          indexname: 'idx_users_created_at',
          index_scans: 100,
          tuples_read: 5000,
          tuples_fetched: 5000
        }
      ]
    };

    it('should check index usage successfully', async () => {
      mockDbQuery.mockResolvedValueOnce(mockIndexStats);

      await QueryAnalyzer.checkIndexUsage('users');

      expect(mockDbQuery).toHaveBeenCalledWith(
        `
        SELECT 
          indexname,
          idx_scan as index_scans,
          idx_tup_read as tuples_read,
          idx_tup_fetch as tuples_fetched
        FROM pg_stat_user_indexes
        WHERE tablename = $1
        ORDER BY idx_scan DESC
      `,
        ['users']
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Index usage for users:',
        mockIndexStats.rows
      );
    });

    it('should handle table with no indexes', async () => {
      mockDbQuery.mockResolvedValueOnce({ rows: [] });

      await QueryAnalyzer.checkIndexUsage('table_without_indexes');

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('FROM pg_stat_user_indexes'),
        ['table_without_indexes']
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Index usage for table_without_indexes:',
        []
      );
    });

    it('should handle database errors when checking index usage', async () => {
      const error = new Error('Table does not exist');
      mockDbQuery.mockRejectedValueOnce(error);

      await QueryAnalyzer.checkIndexUsage('nonexistent_table');

      expect(mockLogger.error).toHaveBeenCalledWith('Error checking index usage:', error);
    });

    it('should handle indexes with zero usage', async () => {
      const unusedIndexStats = {
        rows: [
          {
            indexname: 'idx_unused_column',
            index_scans: 0,
            tuples_read: 0,
            tuples_fetched: 0
          }
        ]
      };

      mockDbQuery.mockResolvedValueOnce(unusedIndexStats);

      await QueryAnalyzer.checkIndexUsage('users');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Index usage for users:',
        unusedIndexStats.rows
      );
    });

    it('should handle null values in index statistics', async () => {
      const indexStatsWithNulls = {
        rows: [
          {
            indexname: 'idx_some_column',
            index_scans: null,
            tuples_read: 1000,
            tuples_fetched: null
          }
        ]
      };

      mockDbQuery.mockResolvedValueOnce(indexStatsWithNulls);

      await QueryAnalyzer.checkIndexUsage('users');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Index usage for users:',
        indexStatsWithNulls.rows
      );
    });

    it('should order results by index scans descending', async () => {
      const orderedIndexStats = {
        rows: [
          {
            indexname: 'most_used_index',
            index_scans: 100000,
            tuples_read: 100000,
            tuples_fetched: 100000
          },
          {
            indexname: 'less_used_index',
            index_scans: 1000,
            tuples_read: 5000,
            tuples_fetched: 5000
          }
        ]
      };

      mockDbQuery.mockResolvedValueOnce(orderedIndexStats);

      await QueryAnalyzer.checkIndexUsage('users');

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY idx_scan DESC'),
        ['users']
      );
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle malformed query plans', async () => {
      const malformedPlan = { 'QUERY PLAN': [null] };
      mockDbQuery.mockResolvedValueOnce({ rows: [malformedPlan] });

      await QueryAnalyzer.analyzeQuery('SELECT 1', []);

      expect(mockLogger.error).toHaveBeenCalledWith('Error analyzing query:', expect.any(Error));
    });

    it('should handle empty query strings', async () => {
      mockDbQuery.mockResolvedValueOnce({ rows: [{ 'QUERY PLAN': [{}] }] });

      await QueryAnalyzer.analyzeQuery('', []);

      expect(mockDbQuery).toHaveBeenCalledWith(
        'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ',
        []
      );
    });

    it('should handle complex SQL queries with multiple statements', async () => {
      const complexQuery = `
        WITH recent_orders AS (
          SELECT user_id, COUNT(*) as order_count
          FROM orders 
          WHERE created_at > $1
          GROUP BY user_id
        )
        SELECT u.name, ro.order_count
        FROM users u
        JOIN recent_orders ro ON u.id = ro.user_id
        WHERE ro.order_count > 5
        ORDER BY ro.order_count DESC
      `;

      mockDbQuery.mockResolvedValueOnce({ rows: [{ 'QUERY PLAN': [{}] }] });

      await QueryAnalyzer.analyzeQuery(complexQuery, ['2025-01-01']);

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)'),
        ['2025-01-01']
      );
    });

    it('should handle different types of query parameters', async () => {
      const parameters = [
        1,                    // number
        'test string',        // string
        true,                 // boolean
        new Date('2025-01-01'), // date
        null,                 // null
        [1, 2, 3]            // array
      ];

      mockDbQuery.mockResolvedValueOnce({ rows: [{ 'QUERY PLAN': [{}] }] });

      await QueryAnalyzer.analyzeQuery(
        'SELECT * FROM users WHERE id = $1 AND name = $2 AND active = $3 AND created_at = $4 AND deleted_at = $5 AND role_id = ANY($6)',
        parameters
      );

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)'),
        parameters
      );
    });

    it('should handle timeout errors', async () => {
      const timeoutError = new Error('Query timeout');
      timeoutError.name = 'TimeoutError';
      mockDbQuery.mockRejectedValueOnce(timeoutError);

      await QueryAnalyzer.analyzeQuery('SELECT * FROM huge_table', []);

      expect(mockLogger.error).toHaveBeenCalledWith('Error analyzing query:', timeoutError);
    });

    it('should handle connection errors', async () => {
      const connectionError = new Error('Connection terminated');
      connectionError.name = 'ConnectionError';
      mockDbQuery.mockRejectedValueOnce(connectionError);

      await QueryAnalyzer.getTableStats('users');

      expect(mockLogger.error).toHaveBeenCalledWith('Error getting table stats:', connectionError);
    });

    it('should handle permission errors', async () => {
      const permissionError = new Error('Access denied to system catalogs');
      mockDbQuery.mockRejectedValueOnce(permissionError);

      await QueryAnalyzer.checkIndexUsage('users');

      expect(mockLogger.error).toHaveBeenCalledWith('Error checking index usage:', permissionError);
    });
  });

  describe('Performance analysis for different query types', () => {
    it('should analyze SELECT queries', async () => {
      const selectPlan = {
        'QUERY PLAN': [{
          'Plan': {
            'Node Type': 'Index Scan',
            'Index Name': 'idx_users_email',
            'Relation Name': 'users'
          }
        }]
      };

      mockDbQuery.mockResolvedValueOnce({ rows: [selectPlan] });

      await QueryAnalyzer.analyzeQuery('SELECT * FROM users WHERE email = $1', ['test@example.com']);

      expect(mockLogger.info).toHaveBeenCalledWith(
        '✅ Using index: idx_users_email on users'
      );
    });

    it('should analyze INSERT queries', async () => {
      const insertPlan = {
        'QUERY PLAN': [{
          'Plan': {
            'Node Type': 'ModifyTable',
            'Operation': 'Insert',
            'Relation Name': 'users'
          }
        }]
      };

      mockDbQuery.mockResolvedValueOnce({ rows: [insertPlan] });

      await QueryAnalyzer.analyzeQuery(
        'INSERT INTO users (name, email) VALUES ($1, $2)',
        ['John Doe', 'john@example.com']
      );

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO users'),
        ['John Doe', 'john@example.com']
      );
    });

    it('should analyze UPDATE queries', async () => {
      const updatePlan = {
        'QUERY PLAN': [{
          'Plan': {
            'Node Type': 'ModifyTable',
            'Operation': 'Update',
            'Plans': [
              {
                'Node Type': 'Index Scan',
                'Index Name': 'users_pkey',
                'Relation Name': 'users'
              }
            ]
          }
        }]
      };

      mockDbQuery.mockResolvedValueOnce({ rows: [updatePlan] });

      await QueryAnalyzer.analyzeQuery('UPDATE users SET name = $1 WHERE id = $2', ['Jane Doe', 1]);

      expect(mockLogger.info).toHaveBeenCalledWith(
        '  ✅ Using index: users_pkey on users'
      );
    });

    it('should analyze DELETE queries', async () => {
      const deletePlan = {
        'QUERY PLAN': [{
          'Plan': {
            'Node Type': 'ModifyTable',
            'Operation': 'Delete',
            'Plans': [
              {
                'Node Type': 'Seq Scan',
                'Relation Name': 'users',
                'Actual Rows': 5000
              }
            ]
          }
        }]
      };

      mockDbQuery.mockResolvedValueOnce({ rows: [deletePlan] });

      await QueryAnalyzer.analyzeQuery('DELETE FROM users WHERE status = $1', ['inactive']);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        '  ⚠️  Sequential scan on users with 5000 rows - consider adding index'
      );
    });
  });

  describe('JOIN complexity analysis', () => {
    it('should detect multiple JOIN operations', async () => {
      const multiJoinPlan = {
        'QUERY PLAN': [{
          'Plan': {
            'Node Type': 'Hash Join',
            'Hash Cond': '(u.id = o.user_id)',
            'Plans': [
              {
                'Node Type': 'Hash Join',
                'Hash Cond': '(u.id = p.user_id)',
                'Plans': [
                  {
                    'Node Type': 'Seq Scan',
                    'Relation Name': 'users',
                    'Actual Rows': 10000
                  },
                  {
                    'Node Type': 'Hash',
                    'Plans': [
                      {
                        'Node Type': 'Index Scan',
                        'Index Name': 'idx_profiles_user_id',
                        'Relation Name': 'profiles'
                      }
                    ]
                  }
                ]
              },
              {
                'Node Type': 'Hash',
                'Plans': [
                  {
                    'Node Type': 'Index Scan',
                    'Index Name': 'idx_orders_user_id',
                    'Relation Name': 'orders'
                  }
                ]
              }
            ]
          }
        }]
      };

      mockDbQuery.mockResolvedValueOnce({ rows: [multiJoinPlan] });

      await QueryAnalyzer.analyzeQuery(
        'SELECT * FROM users u JOIN profiles p ON u.id = p.user_id JOIN orders o ON u.id = o.user_id',
        []
      );

      expect(mockLogger.info).toHaveBeenCalledWith('#️⃣  Hash Join on (u.id = o.user_id)');
      expect(mockLogger.info).toHaveBeenCalledWith('  #️⃣  Hash Join on (u.id = p.user_id)');
    });

    it('should detect subquery execution', async () => {
      const subqueryPlan = {
        'QUERY PLAN': [{
          'Plan': {
            'Node Type': 'Seq Scan',
            'Relation Name': 'users',
            'Filter': '(id IN $0)',
            'Plans': [
              {
                'Node Type': 'InitPlan',
                'Subplan Name': 'InitPlan 1 (returns $0)',
                'Plans': [
                  {
                    'Node Type': 'Aggregate',
                    'Plans': [
                      {
                        'Node Type': 'Index Scan',
                        'Index Name': 'idx_orders_user_id',
                        'Relation Name': 'orders'
                      }
                    ]
                  }
                ]
              }
            ]
          }
        }]
      };

      mockDbQuery.mockResolvedValueOnce({ rows: [subqueryPlan] });

      await QueryAnalyzer.analyzeQuery(
        'SELECT * FROM users WHERE id IN (SELECT user_id FROM orders WHERE total > 100)',
        []
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        '      ✅ Using index: idx_orders_user_id on orders'
      );
    });
  });

  describe('Query pattern recognition', () => {
    it('should recognize aggregation patterns', async () => {
      const aggregationPlan = {
        'QUERY PLAN': [{
          'Plan': {
            'Node Type': 'Aggregate',
            'Strategy': 'Plain',
            'Plans': [
              {
                'Node Type': 'Seq Scan',
                'Relation Name': 'orders',
                'Actual Rows': 100000
              }
            ]
          }
        }]
      };

      mockDbQuery.mockResolvedValueOnce({ rows: [aggregationPlan] });

      await QueryAnalyzer.analyzeQuery('SELECT COUNT(*) FROM orders', []);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        '  ⚠️  Sequential scan on orders with 100000 rows - consider adding index'
      );
    });

    it('should recognize window function patterns', async () => {
      const windowPlan = {
        'QUERY PLAN': [{
          'Plan': {
            'Node Type': 'WindowAgg',
            'Plans': [
              {
                'Node Type': 'Sort',
                'Sort Key': ['created_at DESC'],
                'Plans': [
                  {
                    'Node Type': 'Index Scan',
                    'Index Name': 'idx_orders_created_at',
                    'Relation Name': 'orders'
                  }
                ]
              }
            ]
          }
        }]
      };

      mockDbQuery.mockResolvedValueOnce({ rows: [windowPlan] });

      await QueryAnalyzer.analyzeQuery(
        'SELECT *, ROW_NUMBER() OVER (ORDER BY created_at DESC) FROM orders',
        []
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        '  📊 Sort operation: created_at DESC - Using undefined KB'
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        '    ✅ Using index: idx_orders_created_at on orders'
      );
    });
  });

  describe('Statistics aggregation', () => {
    it('should handle multiple method calls in sequence', async () => {
      const mockPlan = { 'QUERY PLAN': [{ 'Plan': { 'Node Type': 'Seq Scan' } }] };
      const mockStats = { rows: [{ tablename: 'users', live_rows: 1000 }] };
      const mockIndexes = { rows: [{ indexname: 'users_pkey', index_scans: 100 }] };

      mockDbQuery
        .mockResolvedValueOnce({ rows: [mockPlan] })
        .mockResolvedValueOnce(mockStats)
        .mockResolvedValueOnce(mockIndexes);

      await QueryAnalyzer.analyzeQuery('SELECT * FROM users', []);
      await QueryAnalyzer.getTableStats('users');
      await QueryAnalyzer.checkIndexUsage('users');

      expect(mockDbQuery).toHaveBeenCalledTimes(3);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Table statistics for users:',
        mockStats.rows[0]
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Index usage for users:',
        mockIndexes.rows
      );
    });

    it('should handle concurrent method calls', async () => {
      const mockStats = { rows: [{ tablename: 'users', live_rows: 1000 }] };
      const mockIndexes = { rows: [{ indexname: 'users_pkey', index_scans: 100 }] };

      mockDbQuery
        .mockResolvedValueOnce(mockStats)
        .mockResolvedValueOnce(mockIndexes);

      await Promise.all([
        QueryAnalyzer.getTableStats('users'),
        QueryAnalyzer.checkIndexUsage('users')
      ]);

      expect(mockDbQuery).toHaveBeenCalledTimes(2);
    });
  });

  describe('Memory and performance considerations', () => {
    it('should handle large result sets', async () => {
      const largePlan = {
        'QUERY PLAN': [{
          'Plan': {
            'Node Type': 'Seq Scan',
            'Relation Name': 'huge_table',
            'Actual Rows': 10000000,
            'Plan Rows': 9500000
          }
        }]
      };

      mockDbQuery.mockResolvedValueOnce({ rows: [largePlan] });

      await QueryAnalyzer.analyzeQuery('SELECT * FROM huge_table', []);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        '⚠️  Sequential scan on huge_table with 10000000 rows - consider adding index'
      );
    });

    it('should handle plans with missing execution statistics', async () => {
      const planWithoutActualStats = {
        'QUERY PLAN': [{
          'Plan': {
            'Node Type': 'Seq Scan',
            'Relation Name': 'table_name',
            'Plan Rows': 5000
            // No Actual Rows - plan only, not executed
          }
        }]
      };

      mockDbQuery.mockResolvedValueOnce({ rows: [planWithoutActualStats] });

      await QueryAnalyzer.analyzeQuery('EXPLAIN SELECT * FROM table_name', []);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        '⚠️  Sequential scan on table_name with 5000 rows - consider adding index'
      );
    });
  });
});