import { Pool } from 'pg';
import { logger } from '@/utils/logger';

/**
 * Comprehensive test data management utilities for E2E tests
 */
export class TestDataManager {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Create comprehensive test dataset
   */
  async createTestDataset(): Promise<TestDataset> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Create test users
      const users = await this.createTestUsers(client);
      
      // Create test credentials
      const credentials = await this.createTestCredentials(client, users);
      
      // Create test report templates
      const templates = await this.createTestReportTemplates(client);
      
      // Create test report history
      const reportHistory = await this.createTestReportHistory(client, users, templates);
      
      // Create test audit logs
      const auditLogs = await this.createTestAuditLogs(client, users);
      
      // Create test system logs
      const systemLogs = await this.createTestSystemLogs(client);
      
      // Create test custom reports
      const customReports = await this.createTestCustomReports(client, users);
      
      // Create test notifications
      const notifications = await this.createTestNotifications(client, users);

      await client.query('COMMIT');

      const dataset: TestDataset = {
        users,
        credentials,
        templates,
        reportHistory,
        auditLogs,
        systemLogs,
        customReports,
        notifications
      };

      logger.info('Comprehensive test dataset created', {
        users: users.length,
        credentials: credentials.length,
        templates: templates.length,
        reportHistory: reportHistory.length,
        auditLogs: auditLogs.length,
        systemLogs: systemLogs.length,
        customReports: customReports.length,
        notifications: notifications.length
      });

      return dataset;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to create test dataset:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Clean up all test data
   */
  async cleanupTestDataset(_dataset?: TestDataset): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Clean up in dependency order (child tables first)
      await client.query(`DELETE FROM notifications WHERE created_by IN (SELECT id FROM users WHERE username LIKE 'e2e_%')`);
      await client.query(`DELETE FROM report_history WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'e2e_%')`);
      await client.query(`DELETE FROM custom_report_templates WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'e2e_%')`);
      await client.query(`DELETE FROM service_credentials WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'e2e_%')`);
      await client.query(`DELETE FROM audit_logs WHERE correlation_id LIKE 'e2e-%'`);
      await client.query(`DELETE FROM system_logs WHERE correlation_id LIKE 'e2e-%'`);
      await client.query(`DELETE FROM report_templates WHERE name LIKE 'E2E %'`);
      await client.query(`DELETE FROM users WHERE username LIKE 'e2e_%'`);

      // Clean up any materialized views that might cache test data
      await this.refreshMaterializedViews(client);

      await client.query('COMMIT');
      logger.info('Test dataset cleaned up successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to cleanup test dataset:', error);
      // Don't throw on cleanup failure
    } finally {
      client.release();
    }
  }

  /**
   * Create test users with various roles and states
   */
  private async createTestUsers(client: any): Promise<TestUser[]> {
    const users: TestUser[] = [
      {
        username: 'e2e_regular_user',
        email: 'e2e.regular@test.local',
        displayName: 'E2E Regular User',
        authSource: 'local',
        isAdmin: false,
        isActive: true,
        passwordHash: '$2a$10$K4h0h6I8.F0h0h6I8.F0hO'
      },
      {
        username: 'e2e_admin_user',
        email: 'e2e.admin@test.local',
        displayName: 'E2E Admin User',
        authSource: 'local',
        isAdmin: true,
        isActive: true,
        passwordHash: '$2a$10$K4h0h6I8.F0h0h6I8.F0hO'
      },
      {
        username: 'e2e_ldap_user',
        email: 'e2e.ldap@test.local',
        displayName: 'E2E LDAP User',
        authSource: 'ldap',
        isAdmin: false,
        isActive: true,
        passwordHash: null
      },
      {
        username: 'e2e_azure_user',
        email: 'e2e.azure@test.com',
        displayName: 'E2E Azure User',
        authSource: 'azure',
        isAdmin: false,
        isActive: true,
        passwordHash: null
      },
      {
        username: 'e2e_disabled_user',
        email: 'e2e.disabled@test.local',
        displayName: 'E2E Disabled User',
        authSource: 'local',
        isAdmin: false,
        isActive: false,
        passwordHash: '$2a$10$K4h0h6I8.F0h0h6I8.F0hO'
      }
    ];

    const createdUsers: TestUser[] = [];
    for (const user of users) {
      const result = await client.query(`
        INSERT INTO users (username, email, display_name, auth_source, is_admin, is_active, password_hash, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT (username) DO UPDATE SET
          email = EXCLUDED.email,
          display_name = EXCLUDED.display_name,
          auth_source = EXCLUDED.auth_source,
          is_admin = EXCLUDED.is_admin,
          is_active = EXCLUDED.is_active
        RETURNING id, username, email, display_name, auth_source, is_admin, is_active
      `, [user.username, user.email, user.displayName, user.authSource, user.isAdmin, user.isActive, user.passwordHash]);

      createdUsers.push({
        id: result.rows[0].id,
        ...user
      });
    }

    return createdUsers;
  }

  /**
   * Create test service credentials
   */
  private async createTestCredentials(client: any, users: TestUser[]): Promise<TestCredential[]> {
    const regularUser = users.find(u => u.username === 'e2e_regular_user')!;
    const adminUser = users.find(u => u.username === 'e2e_admin_user')!;
    
    if (!regularUser.id || !adminUser.id) {
      throw new Error('User IDs are required for creating test credentials');
    }

    const credentials = [
      {
        userId: regularUser.id,
        serviceType: 'ad',
        credentialName: 'E2E Test AD Credential',
        username: 'e2e-test-ad-user',
        encryptedPassword: 'encrypted-test-password-123',
        server: 'test-dc.local',
        baseDN: 'DC=test,DC=local',
        isActive: true,
        isDefault: true
      },
      {
        userId: regularUser.id,
        serviceType: 'azure',
        credentialName: 'E2E Test Azure Credential',
        tenantId: 'e2e-test-tenant-id',
        clientId: 'e2e-test-client-id',
        encryptedClientSecret: 'encrypted-test-secret-123',
        isActive: true,
        isDefault: false
      },
      {
        userId: adminUser.id,
        serviceType: 'ad',
        credentialName: 'E2E Admin AD Credential',
        username: 'e2e-admin-ad-user',
        encryptedPassword: 'encrypted-admin-password-123',
        server: 'test-dc.local',
        baseDN: 'DC=test,DC=local',
        isActive: true,
        isDefault: true
      },
      {
        userId: regularUser.id,
        serviceType: 'o365',
        credentialName: 'E2E Test O365 Credential',
        tenantId: 'e2e-test-o365-tenant',
        clientId: 'e2e-test-o365-client',
        encryptedClientSecret: 'encrypted-o365-secret-123',
        isActive: true,
        isDefault: true
      }
    ];

    const createdCredentials: TestCredential[] = [];
    for (const cred of credentials) {
      const result = await client.query(`
        INSERT INTO service_credentials (
          user_id, service_type, credential_name, username, encrypted_password,
          tenant_id, client_id, encrypted_client_secret, server, base_dn,
          is_active, is_default, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
        ON CONFLICT (user_id, service_type, credential_name) DO UPDATE SET
          username = EXCLUDED.username,
          is_active = EXCLUDED.is_active,
          is_default = EXCLUDED.is_default
        RETURNING id
      `, [
        cred.userId, cred.serviceType, cred.credentialName, cred.username, cred.encryptedPassword,
        cred.tenantId || null, cred.clientId || null, cred.encryptedClientSecret || null,
        cred.server || null, cred.baseDN || null, cred.isActive, cred.isDefault
      ]);

      createdCredentials.push({
        id: result.rows[0].id,
        ...cred
      });
    }

    return createdCredentials;
  }

  /**
   * Create comprehensive test report templates
   */
  private async createTestReportTemplates(client: any): Promise<TestReportTemplate[]> {
    const templates = [
      {
        name: 'E2E AD Inactive Users',
        description: 'E2E test template for AD inactive users',
        category: 'ad',
        reportType: 'inactive_users',
        queryTemplate: JSON.stringify({
          fields: ['sAMAccountName', 'displayName', 'lastLogon', 'userAccountControl'],
          parameters: { days: { type: 'number', default: 30, min: 1, max: 365 } }
        }),
        isActive: true
      },
      {
        name: 'E2E Azure Guest Users',
        description: 'E2E test template for Azure guest users',
        category: 'azure',
        reportType: 'guest_users',
        queryTemplate: JSON.stringify({
          fields: ['displayName', 'mail', 'userType', 'createdDateTime'],
          parameters: {}
        }),
        isActive: true
      },
      {
        name: 'E2E O365 Mailbox Usage',
        description: 'E2E test template for O365 mailbox usage',
        category: 'o365',
        reportType: 'mailbox_usage',
        queryTemplate: JSON.stringify({
          fields: ['displayName', 'mail', 'storageUsedInBytes', 'itemCount'],
          parameters: { includeInactive: { type: 'boolean', default: false } }
        }),
        isActive: true
      },
      {
        name: 'E2E Custom LDAP Query',
        description: 'E2E test template for custom LDAP queries',
        category: 'custom',
        reportType: 'custom_ldap',
        queryTemplate: JSON.stringify({
          fields: ['*'],
          source: 'ad',
          baseDN: 'DC=test,DC=local',
          filter: '(objectClass=user)',
          scope: 'sub'
        }),
        isActive: true
      }
    ];

    const createdTemplates: TestReportTemplate[] = [];
    for (const template of templates) {
      const result = await client.query(`
        INSERT INTO report_templates (name, description, category, report_type, query_template, is_active, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (report_type) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          query_template = EXCLUDED.query_template
        RETURNING id
      `, [template.name, template.description, template.category, template.reportType, template.queryTemplate, template.isActive]);

      createdTemplates.push({
        id: result.rows[0].id,
        ...template
      });
    }

    return createdTemplates;
  }

  /**
   * Create test report execution history
   */
  private async createTestReportHistory(client: any, users: TestUser[], templates: TestReportTemplate[]): Promise<TestReportHistory[]> {
    const regularUser = users.find(u => u.username === 'e2e_regular_user')!;
    const adminUser = users.find(u => u.username === 'e2e_admin_user')!;
    
    if (!regularUser.id || !adminUser.id) {
      throw new Error('User IDs are required for creating test report history');
    }
    
    const template1 = templates[0];
    const template2 = templates[1];

    if (!template1.id || !template2.id) {
      throw new Error('Template IDs are required for creating test report history');
    }

    const history = [
      {
        userId: regularUser.id,
        templateId: template1.id,
        parameters: JSON.stringify({ days: 30 }),
        rowCount: 15,
        status: 'completed',
        executionTimeMs: 1250,
        generatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        completedAt: new Date(Date.now() - 2 * 60 * 60 * 1000 + 1250)
      },
      {
        userId: regularUser.id,
        templateId: template2.id,
        parameters: JSON.stringify({}),
        rowCount: 8,
        status: 'completed',
        executionTimeMs: 890,
        generatedAt: new Date(Date.now() - 4 * 60 * 60 * 1000), // 4 hours ago
        completedAt: new Date(Date.now() - 4 * 60 * 60 * 1000 + 890)
      },
      {
        userId: adminUser.id,
        templateId: template1.id,
        parameters: JSON.stringify({ days: 60 }),
        rowCount: 32,
        status: 'completed',
        executionTimeMs: 2100,
        generatedAt: new Date(Date.now() - 6 * 60 * 60 * 1000), // 6 hours ago
        completedAt: new Date(Date.now() - 6 * 60 * 60 * 1000 + 2100)
      },
      {
        userId: regularUser.id,
        templateId: template1.id,
        parameters: JSON.stringify({ days: 7 }),
        rowCount: 0,
        status: 'failed',
        executionTimeMs: 500,
        generatedAt: new Date(Date.now() - 8 * 60 * 60 * 1000), // 8 hours ago
        completedAt: null,
        errorMessage: 'LDAP connection timeout'
      }
    ];

    const createdHistory: TestReportHistory[] = [];
    for (const item of history) {
      const result = await client.query(`
        INSERT INTO report_history (
          user_id, template_id, parameters, row_count, status, execution_time_ms,
          generated_at, completed_at, error_message
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id
      `, [
        item.userId, item.templateId, item.parameters, item.rowCount, item.status,
        item.executionTimeMs, item.generatedAt, item.completedAt, item.errorMessage || null
      ]);

      createdHistory.push({
        id: result.rows[0].id,
        ...item
      });
    }

    return createdHistory;
  }

  /**
   * Create comprehensive test audit logs
   */
  private async createTestAuditLogs(client: any, users: TestUser[]): Promise<TestAuditLog[]> {
    const regularUser = users.find(u => u.username === 'e2e_regular_user')!;
    const adminUser = users.find(u => u.username === 'e2e_admin_user')!;
    
    if (!regularUser.id || !adminUser.id) {
      throw new Error('User IDs are required for creating test audit logs');
    }

    const auditLogs = [
      {
        userId: regularUser.id,
        eventType: 'authentication',
        eventAction: 'login',
        eventResult: 'success',
        eventDetails: JSON.stringify({ 
          auth_method: 'local', 
          duration_ms: 180, 
          user_agent: 'E2E-Test-Browser/1.0' 
        }),
        ipAddress: '192.168.1.100',
        userAgent: 'E2E-Test-Browser/1.0',
        sessionId: 'e2e-session-001',
        correlationId: 'e2e-auth-success-1',
        createdAt: new Date(Date.now() - 30 * 60 * 1000) // 30 minutes ago
      },
      {
        userId: regularUser.id,
        eventType: 'authentication',
        eventAction: 'login',
        eventResult: 'failure',
        eventDetails: JSON.stringify({ 
          auth_method: 'local', 
          error: 'invalid_password',
          attempt_count: 1
        }),
        ipAddress: '192.168.1.101',
        userAgent: 'E2E-Test-Browser/1.0',
        sessionId: null,
        correlationId: 'e2e-auth-failure-1',
        createdAt: new Date(Date.now() - 45 * 60 * 1000) // 45 minutes ago
      },
      {
        userId: regularUser.id,
        eventType: 'report_execution',
        eventAction: 'execute',
        eventResult: 'success',
        eventDetails: JSON.stringify({ 
          report_type: 'inactive_users', 
          parameters: { days: 30 },
          execution_time_ms: 1250,
          row_count: 15
        }),
        ipAddress: '192.168.1.100',
        userAgent: 'E2E-Test-Browser/1.0',
        sessionId: 'e2e-session-001',
        correlationId: 'e2e-report-exec-1',
        createdAt: new Date(Date.now() - 20 * 60 * 1000) // 20 minutes ago
      },
      {
        userId: adminUser.id,
        eventType: 'admin_action',
        eventAction: 'user_management',
        eventResult: 'success',
        eventDetails: JSON.stringify({ 
          action: 'create_user',
          target_user: 'new_test_user',
          permissions_granted: ['read_reports']
        }),
        ipAddress: '192.168.1.105',
        userAgent: 'E2E-Admin-Browser/1.0',
        sessionId: 'e2e-admin-session-001',
        correlationId: 'e2e-admin-action-1',
        createdAt: new Date(Date.now() - 10 * 60 * 1000) // 10 minutes ago
      },
      {
        userId: regularUser.id,
        eventType: 'credential_management',
        eventAction: 'create',
        eventResult: 'success',
        eventDetails: JSON.stringify({ 
          service_type: 'ad',
          credential_name: 'Test AD Connection'
        }),
        ipAddress: '192.168.1.100',
        userAgent: 'E2E-Test-Browser/1.0',
        sessionId: 'e2e-session-001',
        correlationId: 'e2e-cred-create-1',
        createdAt: new Date(Date.now() - 60 * 60 * 1000) // 1 hour ago
      }
    ];

    const createdAuditLogs: TestAuditLog[] = [];
    for (const log of auditLogs) {
      const result = await client.query(`
        INSERT INTO audit_logs (
          user_id, event_type, event_action, event_result, event_details,
          ip_address, user_agent, session_id, correlation_id, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT DO NOTHING
        RETURNING id
      `, [
        log.userId, log.eventType, log.eventAction, log.eventResult, log.eventDetails,
        log.ipAddress, log.userAgent, log.sessionId, log.correlationId, log.createdAt
      ]);

      if (result.rows.length > 0) {
        createdAuditLogs.push({
          id: result.rows[0].id,
          ...log
        });
      }
    }

    return createdAuditLogs;
  }

  /**
   * Create test system logs
   */
  private async createTestSystemLogs(client: any): Promise<TestSystemLog[]> {
    const systemLogs = [
      {
        logLevel: 'info',
        source: 'auth_service',
        category: 'authentication',
        message: 'User authentication successful',
        details: JSON.stringify({ 
          user_id: 1, 
          auth_method: 'local', 
          duration_ms: 180 
        }),
        correlationId: 'e2e-sys-info-1',
        createdAt: new Date(Date.now() - 25 * 60 * 1000) // 25 minutes ago
      },
      {
        logLevel: 'error',
        source: 'ldap_service',
        category: 'connection',
        message: 'LDAP connection failed to test-dc.local',
        details: JSON.stringify({ 
          server: 'test-dc.local', 
          port: 389,
          error: 'Connection timeout after 5000ms',
          retry_attempt: 2
        }),
        correlationId: 'e2e-sys-error-1',
        createdAt: new Date(Date.now() - 50 * 60 * 1000) // 50 minutes ago
      },
      {
        logLevel: 'warn',
        source: 'rate_limiter',
        category: 'security',
        message: 'Rate limit approaching for IP address',
        details: JSON.stringify({ 
          ip_address: '192.168.1.101', 
          current_requests: 85,
          limit: 100,
          window_minutes: 15
        }),
        correlationId: 'e2e-sys-warn-1',
        createdAt: new Date(Date.now() - 35 * 60 * 1000) // 35 minutes ago
      },
      {
        logLevel: 'debug',
        source: 'query_service',
        category: 'performance',
        message: 'Query execution completed',
        details: JSON.stringify({ 
          query_type: 'inactive_users',
          execution_time_ms: 1250,
          result_rows: 15,
          cache_hit: false
        }),
        correlationId: 'e2e-sys-debug-1',
        createdAt: new Date(Date.now() - 15 * 60 * 1000) // 15 minutes ago
      }
    ];

    const createdSystemLogs: TestSystemLog[] = [];
    for (const log of systemLogs) {
      const result = await client.query(`
        INSERT INTO system_logs (
          log_level, source, category, message, details, correlation_id, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT DO NOTHING
        RETURNING id
      `, [
        log.logLevel, log.source, log.category, log.message,
        log.details, log.correlationId, log.createdAt
      ]);

      if (result.rows.length > 0) {
        createdSystemLogs.push({
          id: result.rows[0].id,
          ...log
        });
      }
    }

    return createdSystemLogs;
  }

  /**
   * Create test custom reports
   */
  private async createTestCustomReports(client: any, users: TestUser[]): Promise<TestCustomReport[]> {
    const regularUser = users.find(u => u.username === 'e2e_regular_user')!;
    const adminUser = users.find(u => u.username === 'e2e_admin_user')!;
    
    if (!regularUser.id || !adminUser.id) {
      throw new Error('User IDs are required for creating test custom reports');
    }

    const customReports = [
      {
        userId: regularUser.id,
        name: 'E2E Custom AD Users Report',
        description: 'E2E test custom report for active AD users',
        category: 'ad',
        queryDefinition: JSON.stringify({
          source: 'ad',
          baseDN: 'CN=Users,DC=test,DC=local',
          filter: '(&(objectClass=user)(!(userAccountControl:1.2.840.113556.1.4.803:=2)))',
          attributes: ['sAMAccountName', 'displayName', 'mail', 'lastLogon'],
          scope: 'sub'
        }),
        isActive: true,
        isShared: false
      },
      {
        userId: adminUser.id,
        name: 'E2E Admin Security Report',
        description: 'E2E test admin report for security analysis',
        category: 'security',
        queryDefinition: JSON.stringify({
          source: 'ad',
          baseDN: 'CN=Builtin,DC=test,DC=local',
          filter: '(objectClass=group)',
          attributes: ['cn', 'member', 'description'],
          scope: 'one'
        }),
        isActive: true,
        isShared: true
      }
    ];

    const createdCustomReports: TestCustomReport[] = [];
    for (const report of customReports) {
      const result = await client.query(`
        INSERT INTO custom_report_templates (
          user_id, name, description, category, query_definition, is_active, is_shared, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING id
      `, [
        report.userId, report.name, report.description, report.category,
        report.queryDefinition, report.isActive, report.isShared
      ]);

      createdCustomReports.push({
        id: result.rows[0].id,
        ...report
      });
    }

    return createdCustomReports;
  }

  /**
   * Create test notifications
   */
  private async createTestNotifications(client: any, users: TestUser[]): Promise<TestNotification[]> {
    const regularUser = users.find(u => u.username === 'e2e_regular_user')!;
    const adminUser = users.find(u => u.username === 'e2e_admin_user')!;
    
    if (!regularUser.id || !adminUser.id) {
      throw new Error('User IDs are required for creating test notifications');
    }

    const notifications = [
      {
        userId: regularUser.id,
        type: 'report_completion',
        title: 'Report Generation Complete',
        message: 'Your inactive users report has been generated successfully.',
        data: JSON.stringify({ 
          report_id: 1, 
          report_name: 'Inactive Users',
          execution_time: '1.25s'
        }),
        isRead: false,
        createdBy: null,
        createdAt: new Date(Date.now() - 10 * 60 * 1000) // 10 minutes ago
      },
      {
        userId: regularUser.id,
        type: 'system_alert',
        title: 'Credential Test Failed',
        message: 'The test connection for your AD credential failed.',
        data: JSON.stringify({ 
          credential_id: 1, 
          error: 'Connection timeout'
        }),
        isRead: true,
        createdBy: null,
        createdAt: new Date(Date.now() - 30 * 60 * 1000) // 30 minutes ago
      },
      {
        userId: adminUser.id,
        type: 'admin_alert',
        title: 'High Failed Login Activity',
        message: 'Unusual number of failed login attempts detected.',
        data: JSON.stringify({ 
          ip_address: '192.168.1.101', 
          failed_attempts: 5,
          time_window: '5 minutes'
        }),
        isRead: false,
        createdBy: null,
        createdAt: new Date(Date.now() - 5 * 60 * 1000) // 5 minutes ago
      }
    ];

    const createdNotifications: TestNotification[] = [];
    for (const notification of notifications) {
      const result = await client.query(`
        INSERT INTO notifications (
          user_id, type, title, message, data, is_read, created_by, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `, [
        notification.userId, notification.type, notification.title, notification.message,
        notification.data, notification.isRead, notification.createdBy, notification.createdAt
      ]);

      createdNotifications.push({
        id: result.rows[0].id,
        ...notification
      });
    }

    return createdNotifications;
  }

  /**
   * Refresh materialized views to clear cached test data
   */
  private async refreshMaterializedViews(client: any): Promise<void> {
    try {
      // Check if materialized views exist and refresh them
      const viewsResult = await client.query(`
        SELECT matviewname FROM pg_matviews WHERE schemaname = 'public'
      `);

      for (const row of viewsResult.rows) {
        await client.query(`REFRESH MATERIALIZED VIEW ${row.matviewname}`);
        logger.debug(`Refreshed materialized view: ${row.matviewname}`);
      }
    } catch (error) {
      logger.warn('Failed to refresh materialized views:', error);
      // Don't throw, as views might not exist yet
    }
  }

  /**
   * Verify test data integrity
   */
  async verifyTestDataIntegrity(): Promise<TestDataIntegrity> {
    const client = await this.pool.connect();
    try {
      const results = await Promise.all([
        client.query(`SELECT COUNT(*) as count FROM users WHERE username LIKE 'e2e_%'`),
        client.query(`SELECT COUNT(*) as count FROM service_credentials WHERE credential_name LIKE 'E2E %'`),
        client.query(`SELECT COUNT(*) as count FROM report_templates WHERE name LIKE 'E2E %'`),
        client.query(`SELECT COUNT(*) as count FROM audit_logs WHERE correlation_id LIKE 'e2e-%'`),
        client.query(`SELECT COUNT(*) as count FROM system_logs WHERE correlation_id LIKE 'e2e-%'`),
        client.query(`SELECT COUNT(*) as count FROM custom_report_templates WHERE name LIKE 'E2E %'`),
      ]);

      return {
        users: parseInt(results[0].rows[0].count),
        credentials: parseInt(results[1].rows[0].count),
        templates: parseInt(results[2].rows[0].count),
        auditLogs: parseInt(results[3].rows[0].count),
        systemLogs: parseInt(results[4].rows[0].count),
        customReports: parseInt(results[5].rows[0].count),
        isValid: results.every(r => parseInt(r.rows[0].count) > 0)
      };
    } finally {
      client.release();
    }
  }
}

// Type definitions for test data
export interface TestDataset {
  users: TestUser[];
  credentials: TestCredential[];
  templates: TestReportTemplate[];
  reportHistory: TestReportHistory[];
  auditLogs: TestAuditLog[];
  systemLogs: TestSystemLog[];
  customReports: TestCustomReport[];
  notifications: TestNotification[];
}

export interface TestUser {
  id?: number;
  username: string;
  email: string;
  displayName: string;
  authSource: string;
  isAdmin: boolean;
  isActive: boolean;
  passwordHash: string | null;
}

export interface TestCredential {
  id?: number;
  userId: number;
  serviceType: string;
  credentialName: string;
  username?: string;
  encryptedPassword?: string;
  tenantId?: string;
  clientId?: string;
  encryptedClientSecret?: string;
  server?: string;
  baseDN?: string;
  isActive: boolean;
  isDefault: boolean;
}

export interface TestReportTemplate {
  id?: number;
  name: string;
  description: string;
  category: string;
  reportType: string;
  queryTemplate: string;
  isActive: boolean;
}

export interface TestReportHistory {
  id?: number;
  userId: number;
  templateId: number;
  parameters: string;
  rowCount: number;
  status: string;
  executionTimeMs: number;
  generatedAt: Date;
  completedAt: Date | null;
  errorMessage?: string;
}

export interface TestAuditLog {
  id?: number;
  userId: number;
  eventType: string;
  eventAction: string;
  eventResult: string;
  eventDetails: string;
  ipAddress: string;
  userAgent: string;
  sessionId: string | null;
  correlationId: string;
  createdAt: Date;
}

export interface TestSystemLog {
  id?: number;
  logLevel: string;
  source: string;
  category: string;
  message: string;
  details: string;
  correlationId: string;
  createdAt: Date;
}

export interface TestCustomReport {
  id?: number;
  userId: number;
  name: string;
  description: string;
  category: string;
  queryDefinition: string;
  isActive: boolean;
  isShared: boolean;
}

export interface TestNotification {
  id?: number;
  userId: number;
  type: string;
  title: string;
  message: string;
  data: string;
  isRead: boolean;
  createdBy: number | null;
  createdAt: Date;
}

export interface TestDataIntegrity {
  users: number;
  credentials: number;
  templates: number;
  auditLogs: number;
  systemLogs: number;
  customReports: number;
  isValid: boolean;
}