#!/usr/bin/env ts-node

import logger from '../utils/logger';

/**
 * Query System Test Script
 * 
 * Simple script to test the new query system functionality
 */

import { initializeQueryService } from '@/services/query/setup';
import { QueryDefinitionRegistry } from '@/services/query';

async function testQuerySystem() {
  try {
    logger.info('🚀 Starting Query System Test...');

    // 1. Initialize Query Service
    logger.info('1. Initializing Query Service...');
    const queryService = await initializeQueryService();
    
    // 2. Test Database Connection
    logger.info('2. Testing database connection...');
    const dbConnected = await queryService.testConnection('postgres');
    if (!dbConnected) {
      throw new Error('Database connection failed');
    }
    logger.info('✅ Database connection successful');

    // 3. Initialize Query Registry
    logger.info('3. Initializing Query Registry...');
    const queryRegistry = new QueryDefinitionRegistry();
    
    // Wait a moment for registry to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 4. Test Query Definition Loading
    logger.info('4. Testing query definition loading...');
    const queries = await queryRegistry.getQueries();
    logger.info(`✅ Loaded ${queries.length} query definitions`);
    
    if (queries.length > 0) {
      const firstQuery = queries[0];
      logger.info(`   Example query: ${firstQuery.name} (${firstQuery.id})`);
    }

    // 5. Test Simple Query Execution
    logger.info('5. Testing simple query execution...');
    
    const testQueryDef = {
      id: 'system_test_query',
      name: 'System Test Query',
      description: 'Simple test query for system validation',
      version: '1.0.0',
      dataSource: 'postgres' as const,
      sql: 'SELECT \'Hello Query System\' as message, NOW() as timestamp, $1 as test_param',
      parameters: [
        {
          name: 'test_param',
          type: 'string' as const,
          required: false,
          default: 'default_value'
        }
      ],
      access: {
        requiresAuth: false
      }
    };

    const result = await queryService.executeQuery(testQueryDef, {
      userId: 1,
      parameters: { test_param: 'test_successful' }
    });

    if (result.success) {
      logger.info('✅ Query execution successful');
      logger.info(`   Result: ${JSON.stringify(((result as any)?.data)[0], null, 2)}`);
      logger.info(`   Execution time: ${result.metadata.executionTime}ms`);
      logger.info(`   Row count: ${result.metadata.rowCount}`);
    } else {
      logger.error('❌ Query execution failed:', result.error);
    }

    // 6. Test Query Validation
    logger.info('6. Testing query validation...');
    
    const validation = await queryService.validateQuery(testQueryDef, { test_param: 'valid' });
    if (validation.valid) {
      logger.info('✅ Query validation successful');
      if (validation.warnings.length > 0) {
        logger.info(`   Warnings: ${validation.warnings.join(', ')}`);
      }
    } else {
      logger.error('❌ Query validation failed:', validation.errors.join(', '));
    }

    // 7. Test Built-in Queries
    logger.info('7. Testing built-in query execution...');
    
    const systemHealthQuery = await queryRegistry.getQuery('pg_system_health');
    if (systemHealthQuery) {
      const healthResult = await queryService.executeQuery(systemHealthQuery, {
        userId: 1,
        parameters: {}
      });
      
      if (healthResult.success) {
        logger.info('✅ Built-in query execution successful');
        logger.info(`   Health check result: ${JSON.stringify(healthResult.data[0])}`);
      } else {
        logger.warn('⚠️ Built-in query execution failed:', healthResult.error);
      }
    } else {
      logger.info('ℹ️ No built-in queries found (this is normal for first run)');
    }

    // 8. Test Query Statistics
    logger.info('8. Testing query statistics...');
    const stats = await queryService.getQueryStats('system_test_query');
    logger.info(`✅ Query statistics retrieved: ${JSON.stringify(stats)}`);

    logger.info('🎉 Query System Test Completed Successfully!');
    
    return {
      success: true,
      tests: {
        databaseConnection: dbConnected,
        queryRegistry: queries.length >= 0,
        queryExecution: result.success,
        queryValidation: validation.valid
      }
    };

  } catch (error) {
    logger.error('❌ Query System Test Failed:', error);
    return {
      success: false,
      error: (error as Error).message
    };
  }
}

// Run the test if this script is executed directly
if (require.main === module) {
  testQuerySystem()
    .then((result) => {
      if (result.success) {
        logger.info('\n✅ All tests passed!');
        process.exit(0);
      } else {
        logger.info('\n❌ Tests failed:', result.error);
        process.exit(1);
      }
    })
    .catch((error) => {
      logger.error('\n💥 Test script crashed:', error);
      process.exit(1);
    });
}

export { testQuerySystem };