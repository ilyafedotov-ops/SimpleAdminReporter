import { azureMsalService } from './services/azure-msal.service';
import { logger } from './utils/logger';

async function testGraphQuery() {
  try {
    logger.info('Testing Graph query with app-only authentication...');
    
    // Execute a guest users query without user context to force app-only auth
    const result = await azureMsalService.executeQueryAsApp({
      type: 'graph',
      endpoint: '/users',
      graphOptions: {
        filter: "userType eq 'Guest'",
        select: ['id', 'displayName', 'userPrincipalName', 'mail', 'userType', 'createdDateTime'],
        top: 10
      }
    });
    
    logger.info('Query executed successfully!');
    logger.info(`Found ${result.count} guest users`);
    
    if (((result as any)?.data).length > 0) {
      logger.info('Sample guest user:', {
        displayName: ((result as any)?.data)[0].displayName,
        userPrincipalName: ((result as any)?.data)[0].userPrincipalName,
        userType: ((result as any)?.data)[0].userType
      });
    }
    
    // Test another query - all users
    const allUsersResult = await azureMsalService.executeQueryAsApp({
      type: 'graph',
      endpoint: '/users',
      graphOptions: {
        select: ['id', 'displayName', 'userPrincipalName'],
        top: 5
      }
    });
    
    logger.info(`Total users found: ${allUsersResult.count}`);
    
    return true;
  } catch (error) {
    logger.error('Graph query test failed:', error);
    return false;
  }
}

// Initialize and run
async function run() {
  // Wait for services to initialize
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const success = await testGraphQuery();
  logger.info(`Test completed: ${success ? 'SUCCESS' : 'FAILED'}`);
  process.exit(success ? 0 : 1);
}

run();