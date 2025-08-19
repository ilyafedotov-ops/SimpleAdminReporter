/**
 * Test data fixtures for E2E tests
 * Contains test users, mock data, and configuration
 */

import { randomBytes } from 'crypto';

export interface TestUser {
  username: string;
  password: string;
  displayName: string;
  email: string;
  authSource: 'ad' | 'azure' | 'local';
  roles: string[];
  permissions: string[];
}

export interface TestReport {
  name: string;
  description: string;
  category: string;
  dataSource: 'ad' | 'azure' | 'o365';
  parameters: Record<string, any>;
}

/**
 * Test users for different authentication scenarios
 */
export const TEST_USERS: Record<string, TestUser> = {
  AD_USER: {
    username: 'testuser@testdomain.local',
    password: 'TestPass123!',
    displayName: 'Test User (AD)',
    email: 'testuser@testdomain.local',
    authSource: 'ad',
    roles: ['user', 'viewer'],
    permissions: ['read:reports', 'read:templates']
  },
  
  AZURE_USER: {
    username: 'testuser@company.com',
    password: 'TestPass123!',
    displayName: 'Test User (Azure)',
    email: 'testuser@company.com',
    authSource: 'azure',
    roles: ['user', 'viewer'],
    permissions: ['read:reports', 'read:templates', 'read:azure']
  },
  
  LOCAL_ADMIN: {
    username: 'admin',
    password: 'AdminPass123!',
    displayName: 'Local Administrator',
    email: 'admin@localhost',
    authSource: 'local',
    roles: ['admin', 'super-admin'],
    permissions: ['admin:all', 'read:all', 'write:all', 'delete:all']
  },
  
  LIMITED_USER: {
    username: 'limited@testdomain.local',
    password: 'LimitedPass123!',
    displayName: 'Limited User',
    email: 'limited@testdomain.local',
    authSource: 'ad',
    roles: ['viewer'],
    permissions: ['read:reports']
  }
};

/**
 * Test reports for different scenarios
 */
export const TEST_REPORTS: Record<string, TestReport> = {
  AD_INACTIVE_USERS: {
    name: 'Inactive Users',
    description: 'Find users who have not logged in recently',
    category: 'Security',
    dataSource: 'ad',
    parameters: {
      days: 90,
      includeDisabled: false
    }
  },
  
  AD_PASSWORD_EXPIRY: {
    name: 'Password Expiry Report',
    description: 'Users with passwords expiring soon',
    category: 'Security',
    dataSource: 'ad',
    parameters: {
      daysUntilExpiry: 30
    }
  },
  
  AZURE_GUEST_USERS: {
    name: 'Guest Users Report',
    description: 'List all external guest users',
    category: 'Users',
    dataSource: 'azure',
    parameters: {}
  },
  
  O365_MAILBOX_USAGE: {
    name: 'Mailbox Usage Report',
    description: 'Mailbox storage utilization',
    category: 'Usage',
    dataSource: 'o365',
    parameters: {
      period: '30days'
    }
  }
};

/**
 * Custom report builder test data
 */
export const CUSTOM_REPORT_TESTS = {
  SIMPLE_USER_QUERY: {
    dataSource: 'ad',
    fields: ['sAMAccountName', 'displayName', 'mail'],
    filters: [
      { field: 'enabled', operator: 'equals', value: 'true' }
    ],
    orderBy: { field: 'displayName', direction: 'asc' }
  },
  
  COMPLEX_SECURITY_QUERY: {
    dataSource: 'ad',
    fields: ['sAMAccountName', 'lastLogon', 'memberOf', 'lockoutTime'],
    filters: [
      { field: 'lastLogon', operator: 'older_than', value: '90 days' },
      { field: 'enabled', operator: 'equals', value: 'true' }
    ],
    groupBy: 'department',
    orderBy: { field: 'lastLogon', direction: 'desc' }
  }
};

/**
 * Mock API responses for testing
 */
export const MOCK_API_RESPONSES = {
  LOGIN_SUCCESS: {
    success: true,
    user: {
      id: 1,
      username: 'testuser@testdomain.local',
      displayName: 'Test User',
      email: 'testuser@testdomain.local',
      roles: ['user'],
      permissions: ['read:reports']
    },
    token: 'mock-jwt-token'
  },
  
  LOGIN_ERROR: {
    success: false,
    error: 'Invalid credentials'
  },
  
  REPORTS_LIST: [
    {
      id: 1,
      name: 'Inactive Users',
      description: 'Find inactive user accounts',
      category: 'Security',
      dataSource: 'ad'
    },
    {
      id: 2,
      name: 'Password Expiry',
      description: 'Users with expiring passwords',
      category: 'Security', 
      dataSource: 'ad'
    }
  ],
  
  REPORT_EXECUTION_RESULT: {
    success: true,
    data: {
      results: [
        { username: 'user1', displayName: 'User One', lastLogin: '2025-01-01' },
        { username: 'user2', displayName: 'User Two', lastLogin: '2025-01-02' }
      ],
      totalRecords: 2,
      executionTime: '0.45s'
    }
  },
  
  FIELD_DISCOVERY: {
    categories: [
      {
        name: 'Basic Information',
        fields: [
          { name: 'sAMAccountName', type: 'string', description: 'Username' },
          { name: 'displayName', type: 'string', description: 'Display Name' },
          { name: 'mail', type: 'string', description: 'Email Address' }
        ]
      },
      {
        name: 'Security',
        fields: [
          { name: 'enabled', type: 'boolean', description: 'Account Enabled' },
          { name: 'lastLogon', type: 'datetime', description: 'Last Login Time' },
          { name: 'memberOf', type: 'array', description: 'Group Memberships' }
        ]
      }
    ]
  }
};

/**
 * Test configuration
 */
export const TEST_CONFIG = {
  DEFAULT_TIMEOUT: 30000,
  REPORT_EXECUTION_TIMEOUT: 60000,
  API_RESPONSE_TIMEOUT: 10000,
  
  // Test environment URLs
  BASE_URL: process.env.BASE_URL || 'http://localhost:3000',
  API_BASE_URL: process.env.API_BASE_URL || 'http://localhost:5000/api',
  
  // Authentication endpoints
  ENDPOINTS: {
    LOGIN: '/auth/login',
    LOGOUT: '/auth/logout',
    PROFILE: '/auth/profile',
    REPORTS: '/reports',
    EXECUTE_REPORT: '/reports/execute',
    FIELD_DISCOVERY: '/reports/fields'
  },
  
  // Visual testing thresholds
  VISUAL_THRESHOLD: 0.2, // 20% difference threshold
  PIXEL_THRESHOLD: 1000, // Max pixels difference
  
  // Performance thresholds
  PERFORMANCE: {
    PAGE_LOAD_TIMEOUT: 10000,
    API_RESPONSE_TIMEOUT: 5000,
    REPORT_EXECUTION_TIMEOUT: 30000
  }
};

/**
 * Test utilities
 */
export class TestDataHelper {
  /**
   * Get user credentials for authentication
   */
  static getUserCredentials(userType: keyof typeof TEST_USERS) {
    const user = TEST_USERS[userType];
    if (!user) {
      throw new Error(`Unknown user type: ${userType}`);
    }
    return {
      username: user.username,
      password: user.password,
      authSource: user.authSource
    };
  }

  /**
   * Get report parameters for testing
   */
  static getReportParameters(reportType: keyof typeof TEST_REPORTS) {
    const report = TEST_REPORTS[reportType];
    if (!report) {
      throw new Error(`Unknown report type: ${reportType}`);
    }
    return report.parameters;
  }

  /**
   * Generate random test data using cryptographically secure randomness
   */
  static generateRandomUser(): TestUser {
    // Use cryptographically secure random bytes to generate unique ID
    const randomId = randomBytes(4).readUInt32BE(0) % 10000;
    return {
      username: `testuser${randomId}@testdomain.local`,
      password: `TestPass${randomId}!`,
      displayName: `Test User ${randomId}`,
      email: `testuser${randomId}@testdomain.local`,
      authSource: 'ad',
      roles: ['user'],
      permissions: ['read:reports']
    };
  }

  /**
   * Get mock API response
   */
  static getMockResponse(responseType: keyof typeof MOCK_API_RESPONSES) {
    return MOCK_API_RESPONSES[responseType];
  }

  /**
   * Generate test report template
   */
  static generateTestTemplate(name: string) {
    return {
      name: `Test Template - ${name}`,
      description: `Generated test template for ${name}`,
      query: CUSTOM_REPORT_TESTS.SIMPLE_USER_QUERY,
      category: 'Test',
      createdBy: 'automated-test',
      createdAt: new Date().toISOString()
    };
  }

  /**
   * Validate test environment
   */
  static validateTestEnvironment(): boolean {
    const requiredEnvVars = ['BASE_URL'];
    const missing = requiredEnvVars.filter(env => !process.env[env] && !TEST_CONFIG.BASE_URL);
    
    if (missing.length > 0) {
      console.warn(`Missing environment variables: ${missing.join(', ')}`);
      return false;
    }
    
    return true;
  }
}