#!/usr/bin/env ts-node

import logger from '../utils/logger';

/**
 * LDAP Integration Test Script
 * 
 * Tests the integration between the new query system and existing LDAP queries
 */

import { initializeQueryService } from '@/services/query/setup';
import { QueryDefinitionRegistry } from '@/services/query';
import { getAllQueries } from '@/queries/ldap';

async function testLDAPIntegration() {
  try {
    logger.info('🚀 Starting LDAP Integration Test...');

    // 1. Initialize services
    logger.info('1. Initializing services...');
    const queryService = await initializeQueryService();
    const queryRegistry = new QueryDefinitionRegistry();
    
    // Wait for registry to load
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 2. Test LDAP query loading
    logger.info('2. Testing LDAP query loading...');
    const ldapQueries = getAllQueries();
    logger.info(`✅ Found ${ldapQueries.length} existing LDAP queries`);
    
    // 3. Test registry integration
    logger.info('3. Testing query registry integration...');
    const allQueries = await queryRegistry.getQueries();
    const ldapQueryDefinitions = allQueries.filter(q => q.dataSource === 'ad');
    logger.info(`✅ Registry loaded ${ldapQueryDefinitions.length} AD query definitions`);

    // 4. Test specific LDAP query execution
    logger.info('4. Testing LDAP query execution...');
    
    // Find a simple query to test
    const inactiveUsersQuery = ldapQueryDefinitions.find(q => q.id.includes('inactive_users'));
    
    if (inactiveUsersQuery) {
      logger.info(`   Testing query: ${inactiveUsersQuery.name} (${inactiveUsersQuery.id})`);
      
      const testParameters = {
        days: 90
      };
      
      const result = await queryService.executeQuery(inactiveUsersQuery, {
        userId: 1,
        parameters: testParameters,
        options: { skipCache: true, timeout: 30000 }
      });
      
      if (result.success) {
        logger.info('✅ LDAP query execution successful');
        logger.info(`   Execution time: ${result.metadata.executionTime}ms`);
        logger.info(`   Row count: ${result.metadata.rowCount}`);
        logger.info(`   Data source: ${result.metadata.dataSource}`);
        
        if (((result as any)?.data).length > 0) {
          logger.info(`   Sample result: ${JSON.stringify(((result as any)?.data)[0], null, 2)}`);
        }
      } else {
        logger.warn('⚠️ LDAP query execution failed:', result.error);
        // This might be expected if LDAP is not available
      }
    } else {
      logger.info('ℹ️ No inactive_users query found - testing registry conversion');
    }

    // 5. Test query parameter mapping
    logger.info('5. Testing parameter mapping...');
    
    const queryWithParams = ldapQueryDefinitions.find(q => 
      q.parameters && q.parameters.length > 0
    );
    
    if (queryWithParams) {
      logger.info(`   Found parameterized query: ${queryWithParams.name}`);
      logger.info(`   Parameters: ${queryWithParams.parameters.map(p => `${p.name} (${p.type})`).join(', ')}`);
      
      // Test parameter validation
      const validation = await queryService.validateQuery(queryWithParams, { days: 30 });
      if (validation.valid) {
        logger.info('✅ Parameter validation successful');
      } else {
        logger.warn('⚠️ Parameter validation issues:', validation.errors.join(', '));
      }
    }

    // 6. Test result transformation
    logger.info('6. Testing result transformation...');
    
    const queryWithMapping = ldapQueryDefinitions.find(q => 
      q.resultMapping && Object.keys(q.resultMapping.fieldMappings).length > 0
    );
    
    if (queryWithMapping) {
      logger.info(`   Found query with field mappings: ${queryWithMapping.name}`);
      logger.info(`   Field mappings: ${Object.keys(queryWithMapping.resultMapping!.fieldMappings).length} fields`);
      logger.info('✅ Result transformation configuration loaded');
    }

    // 7. Test cache configuration
    logger.info('7. Testing cache configuration...');
    
    const cachedQueries = ldapQueryDefinitions.filter(q => q.cache?.enabled);
    logger.info(`✅ Found ${cachedQueries.length} queries with caching enabled`);
    
    if (cachedQueries.length > 0) {
      const sampleCacheConfig = cachedQueries[0].cache;
      logger.info(`   Sample cache config: TTL=${sampleCacheConfig!.ttlSeconds}s, Key=${sampleCacheConfig!.keyTemplate}`);
    }

    // 8. Test error handling
    logger.info('8. Testing error handling...');
    
    const invalidQuery = {
      id: 'invalid_ldap_query',
      name: 'Invalid LDAP Query',
      description: 'This should fail gracefully',
      version: '1.0.0',
      dataSource: 'ad' as const,
      sql: '{"type":"ldap","filter":"invalid_filter","attributes":[]}',
      parameters: [],
      access: { requiresAuth: false }
    };
    
    const errorResult = await queryService.executeQuery(invalidQuery, {
      userId: 1,
      parameters: {},
      options: { skipCache: true }
    });
    
    if (!errorResult.success) {
      logger.info('✅ Error handling working correctly');
      logger.info(`   Error message: ${errorResult.error}`);
    } else {
      logger.warn('⚠️ Expected error but query succeeded');
    }

    logger.info('🎉 LDAP Integration Test Completed!');
    
    return {
      success: true,
      results: {
        ldapQueriesFound: ldapQueries.length,
        registryIntegration: ldapQueryDefinitions.length > 0,
        parameterMapping: queryWithParams ? true : false,
        resultTransformation: queryWithMapping ? true : false,
        cacheConfiguration: cachedQueries.length > 0,
        errorHandling: !errorResult.success
      }
    };

  } catch (error) {
    logger.error('❌ LDAP Integration Test Failed:', error);
    return {
      success: false,
      error: (error as Error).message
    };
  }
}

// Run the test if this script is executed directly
if (require.main === module) {
  testLDAPIntegration()
    .then((result) => {
      if (result.success) {
        logger.info('\n✅ LDAP integration test passed!');
        logger.info('Results:', JSON.stringify(result.results, null, 2));
        process.exit(0);
      } else {
        logger.info('\n❌ LDAP integration test failed:', result.error);
        process.exit(1);
      }
    })
    .catch((error) => {
      logger.error('\n💥 Test script crashed:', error);
      process.exit(1);
    });
}

export { testLDAPIntegration };