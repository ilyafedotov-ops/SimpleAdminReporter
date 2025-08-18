import { msalTokenManager } from './services/msal-token-manager.service';
import { logger } from './utils/logger';

async function testAppOnlyAuth() {
  try {
    logger.info('Testing app-only authentication...');
    
    // Get app-only token
    const token = await msalTokenManager.getAppOnlyToken();
    
    logger.info('Successfully acquired app-only token');
    
    // Test Graph API call
    const { Client } = await import('@microsoft/microsoft-graph-client');
    
    const client = Client.init({
      authProvider: (done) => {
        done(null, token);
      }
    });
    
    // Try to get organization info
    const org = await client.api('/organization').get();
    logger.info('Organization info retrieved:', {
      name: org.value[0]?.displayName,
      id: org.value[0]?.id
    });
    
    // Try to get users
    const users = await client.api('/users').top(5).get();
    logger.info(`Retrieved ${users.value.length} users`);
    
    return true;
  } catch (error) {
    logger.error('App-only authentication test failed:', error);
    return false;
  }
}

// Run the test
testAppOnlyAuth().then(success => {
  logger.info(`Test completed: ${success ? 'SUCCESS' : 'FAILED'}`);
  process.exit(success ? 0 : 1);
});