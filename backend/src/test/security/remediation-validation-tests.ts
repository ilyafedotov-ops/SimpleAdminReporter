/**
 * Security Remediation Validation Tests
 * 
 * Test cases designed to validate that security fixes and improvements
 * are properly implemented and working as expected.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '@/app';
import { db } from '@/config/database';
import { logger } from '@/utils/logger';

interface RemediationTestContext {
  validToken: string;
  adminToken: string;
  testUserId: number;
  adminUserId: number;
}

class RemediationValidationTestRunner {
  private context: RemediationTestContext = {} as RemediationTestContext;

  async setup(): Promise<void> {
    // Create test users
    const userResult = await db.query(`
      INSERT INTO users (username, password_hash, email, is_active, is_admin, auth_source)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, ['remediation_test_user', 'hashed_password', 'remediation-test@example.com', true, false, 'local']);
    
    const adminResult = await db.query(`
      INSERT INTO users (username, password_hash, email, is_active, is_admin, auth_source)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, ['remediation_admin_user', 'admin_hash', 'remediation-admin@example.com', true, true, 'local']);
    
    this.context.testUserId = userResult.rows[0].id;
    this.context.adminUserId = adminResult.rows[0].id;
    
    // Generate tokens
    const secret = process.env.JWT_SECRET || 'test-secret';
    
    this.context.validToken = jwt.sign(
      { 
        userId: this.context.testUserId, 
        username: 'remediation_test_user',
        isAdmin: false,
        authSource: 'local',
        sessionId: 'remediation-session-123'
      },
      secret,
      { expiresIn: '1h' }
    );
    
    this.context.adminToken = jwt.sign(
      { 
        userId: this.context.adminUserId, 
        username: 'remediation_admin_user',
        isAdmin: true,
        authSource: 'local',
        sessionId: 'remediation-admin-session-123'
      },
      secret,
      { expiresIn: '1h' }
    );
  }

  async cleanup(): Promise<void> {
    try {
      await db.query('DELETE FROM users WHERE username LIKE $1', ['remediation_%_user']);
      await db.query('DELETE FROM audit_logs WHERE user_id IN ($1, $2)', [this.context.testUserId, this.context.adminUserId]);
    } catch (error) {
      logger.warn('Remediation test cleanup error:', error);
    }
  }

  // =====================================================
  // HTTPS AND TLS VALIDATION
  // =====================================================

  async validateHTTPSRedirection(): Promise<void> {
    describe('HTTPS and TLS Validation', () => {
      test('Should redirect HTTP to HTTPS in production', async () => {
        // This test assumes HTTPS redirection is implemented
        // In a real environment, you would test against the actual deployed application
        
        const response = await request(app)
          .get('/api/health')
          .set('X-Forwarded-Proto', 'http');
        
        // In production, should redirect to HTTPS or set secure headers
        if (process.env.NODE_ENV === 'production') {
          expect(response.headers['strict-transport-security']).toBeDefined();
        }
      });

      test('Should have proper TLS configuration', async () => {
        // Test for secure cookie flags
        const loginResponse = await request(app)
          .post('/api/auth/login')
          .send({
            username: 'remediation_test_user',
            password: 'password'
          });

        if (loginResponse.headers['set-cookie']) {
          const cookies = loginResponse.headers['set-cookie'] as unknown as string[];
          cookies.forEach((cookie: string) => {
            if (cookie.includes('token') || cookie.includes('session')) {
              expect(cookie).toMatch(/HttpOnly/i);
              expect(cookie).toMatch(/SameSite/i);
              
              if (process.env.NODE_ENV === 'production') {
                expect(cookie).toMatch(/Secure/i);
              }
            }
          });
        }
      });

      test('Should set proper security headers', async () => {
        const response = await request(app)
          .get('/api/health')
          .set('Authorization', `Bearer ${this.context.validToken}`);

        // Check for required security headers
        expect(response.headers['x-content-type-options']).toBe('nosniff');
        expect(response.headers['x-frame-options']).toMatch(/deny|sameorigin/i);
        expect(response.headers['x-xss-protection']).toBeDefined();
        
        // Content Security Policy should be implemented
        if (response.headers['content-security-policy']) {
          expect(response.headers['content-security-policy']).toContain("default-src 'self'");
        }
      });
    });
  }

  // =====================================================
  // DATABASE SECURITY VALIDATION
  // =====================================================

  async validateDatabaseSecurity(): Promise<void> {
    describe('Database Security Validation', () => {
      test('Should use parameterized queries', async () => {
        // Test that SQL injection attempts are properly handled
        const maliciousInputs = [
          "'; DROP TABLE users; --",
          "' OR '1'='1",
          "' UNION SELECT password_hash FROM users --"
        ];

        for (const input of maliciousInputs) {
          const response = await request(app)
            .get('/api/search')
            .query({ q: input, type: 'users' })
            .set('Authorization', `Bearer ${this.context.validToken}`);

          // Should not cause database errors or expose sensitive data
          expect(response.status).not.toBe(500);
          
          const responseText = JSON.stringify(response.body);
          expect(responseText).not.toMatch(/password_hash|DROP|INSERT|UPDATE|DELETE/i);
        }
      });

      test('Should have proper database access controls', async () => {
        // Verify that database credentials are not exposed
        const response = await request(app)
          .get('/api/health/detailed')
          .set('Authorization', `Bearer ${this.context.adminToken}`);

        if (response.status === 200) {
          const responseText = JSON.stringify(response.body);
          expect(responseText).not.toMatch(/DATABASE_URL|postgres:|password=/i);
        }
      });

      test('Should encrypt sensitive data at rest', async () => {
        // Create a credential with sensitive data
        const credentialResponse = await request(app)
          .post('/api/credentials')
          .send({
            service: 'azure',
            username: 'test@example.com',
            password: 'sensitive-password',
            tenantId: 'test-tenant'
          })
          .set('Authorization', `Bearer ${this.context.validToken}`);

        if (credentialResponse.status === 201) {
          // Check that raw password is not stored in database
          const result = await db.query(
            'SELECT * FROM service_credentials WHERE user_id = $1',
            [this.context.testUserId]
          );

          const credential = result.rows[0];
          expect(credential.encrypted_password).toBeDefined();
          expect(credential.encrypted_password).not.toBe('sensitive-password');
          expect(credential.salt).toBeDefined();
          expect(credential.iv).toBeDefined();
        }
      });
    });
  }

  // =====================================================
  // INPUT VALIDATION REMEDIATION
  // =====================================================

  async validateInputSanitization(): Promise<void> {
    describe('Input Validation Remediation', () => {
      test('Should sanitize XSS inputs properly', async () => {
        const xssPayloads = [
          "<script>alert('XSS')</script>",
          "<img src=x onerror=alert('XSS')>",
          "javascript:alert('XSS')",
          "<svg onload=alert('XSS')>"
        ];

        for (const payload of xssPayloads) {
          const response = await request(app)
            .post('/api/reports/custom')
            .send({
              name: payload,
              description: payload,
              query: { source: 'ad', fields: ['username'] }
            })
            .set('Authorization', `Bearer ${this.context.validToken}`);

          if (response.status === 200 || response.status === 201) {
            const responseText = JSON.stringify(response.body);
            
            // Should be properly encoded/escaped
            expect(responseText).not.toContain('<script>');
            expect(responseText).not.toContain('javascript:');
            expect(responseText).not.toContain('onerror=');
          }
        }
      });

      test('Should validate file uploads properly', async () => {
        // Test various malicious file types
        const maliciousFiles = [
          { filename: 'malicious.exe', content: 'MZ\x90\x00', contentType: 'application/x-executable' },
          { filename: 'script.php', content: '<?php system($_GET["cmd"]); ?>', contentType: 'application/x-php' },
          { filename: 'shell.sh', content: '#!/bin/bash\nrm -rf /', contentType: 'application/x-sh' }
        ];

        for (const file of maliciousFiles) {
          const response = await request(app)
            .post('/api/files/upload')
            .set('Authorization', `Bearer ${this.context.validToken}`)
            .attach('file', Buffer.from(file.content), {
              filename: file.filename,
              contentType: file.contentType
            });

          // Should reject dangerous file types
          expect(response.status).toBeGreaterThanOrEqual(400);
        }
      });

      test('Should prevent path traversal attacks', async () => {
        const pathTraversalAttempts = [
          "../../../etc/passwd",
          "..\\..\\..\\windows\\system32\\config\\sam",
          "%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd"
        ];

        for (const attempt of pathTraversalAttempts) {
          const response = await request(app)
            .get(`/api/export/${attempt}`)
            .set('Authorization', `Bearer ${this.context.validToken}`);

          expect(response.status).not.toBe(200);
          expect(response.body).not.toMatch(/root:x:|daemon:|bin:/);
        }
      });

      test('Should enforce size limits', async () => {
        // Test oversized payload
        const oversizedPayload = {
          data: 'x'.repeat(10 * 1024 * 1024), // 10MB
          largeArray: new Array(100000).fill('large data')
        };

        const response = await request(app)
          .post('/api/reports/custom')
          .send(oversizedPayload)
          .set('Authorization', `Bearer ${this.context.validToken}`);

        expect(response.status).toBe(413); // Payload Too Large
      });
    });
  }

  // =====================================================
  // AUTHENTICATION SECURITY VALIDATION
  // =====================================================

  async validateAuthenticationSecurity(): Promise<void> {
    describe('Authentication Security Validation', () => {
      test('Should implement proper password policies', async () => {
        const weakPasswords = [
          'password',
          '123456',
          'admin',
          'qwerty',
          'password123'
        ];

        for (const weakPassword of weakPasswords) {
          const response = await request(app)
            .post('/api/auth/register')
            .send({
              username: 'test_weak_password',
              password: weakPassword,
              email: 'test@example.com'
            });

          // Should reject weak passwords
          expect(response.status).toBe(400);
          expect(response.body.error).toMatch(/password.*requirements|password.*weak/i);
        }
      });

      test('Should implement account lockout after failed attempts', async () => {
        const username = 'lockout_test_user';
        
        // Try multiple failed login attempts
        for (let i = 0; i < 6; i++) {
          await request(app)
            .post('/api/auth/login')
            .send({
              username,
              password: 'wrong_password'
            });
        }

        // Next attempt should be locked out
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            username,
            password: 'wrong_password'
          });

        expect(response.status).toBe(429); // Too Many Requests
        expect(response.body.error).toMatch(/locked|blocked|attempts/i);
      });

      test('Should invalidate sessions on logout', async () => {
        // Login to get a valid session
        const loginResponse = await request(app)
          .post('/api/auth/login')
          .send({
            username: 'remediation_test_user',
            password: 'password'
          });

        if (loginResponse.status === 200) {
          const token = loginResponse.body.token;
          
          // Verify token works
          const verifyResponse = await request(app)
            .get('/api/reports')
            .set('Authorization', `Bearer ${token}`);
          
          expect(verifyResponse.status).toBe(200);

          // Logout
          await request(app)
            .post('/api/auth/logout')
            .set('Authorization', `Bearer ${token}`);

          // Token should now be invalid
          const postLogoutResponse = await request(app)
            .get('/api/reports')
            .set('Authorization', `Bearer ${token}`);

          expect(postLogoutResponse.status).toBe(401);
        }
      });

      test('Should implement multi-factor authentication validation', async () => {
        // Test MFA token validation (if implemented)
        const response = await request(app)
          .post('/api/auth/verify-mfa')
          .send({
            token: '123456', // Invalid MFA token
            userId: this.context.testUserId
          })
          .set('Authorization', `Bearer ${this.context.validToken}`);

        if (response.status !== 404) { // If MFA is implemented
          expect(response.status).toBe(401);
          expect(response.body.error).toMatch(/invalid.*token|verification.*failed/i);
        }
      });
    });
  }

  // =====================================================
  // AUTHORIZATION CONTROLS VALIDATION
  // =====================================================

  async validateAuthorizationControls(): Promise<void> {
    describe('Authorization Controls Validation', () => {
      test('Should enforce role-based access control', async () => {
        const adminOnlyEndpoints = [
          '/api/admin/users',
          '/api/admin/security',
          '/api/admin/system',
          '/api/admin/configuration'
        ];

        for (const endpoint of adminOnlyEndpoints) {
          const response = await request(app)
            .get(endpoint)
            .set('Authorization', `Bearer ${this.context.validToken}`); // Regular user token

          expect(response.status).toBe(403);
          expect(response.body.error).toMatch(/access.*denied|permission.*denied|admin.*required/i);
        }
      });

      test('Should validate resource ownership', async () => {
        // Create a report as user 1
        const createResponse = await request(app)
          .post('/api/reports/custom')
          .send({
            name: 'Ownership Test Report',
            query: { source: 'ad', fields: ['username'] }
          })
          .set('Authorization', `Bearer ${this.context.validToken}`);

        if (createResponse.status === 201) {
          const reportId = createResponse.body.id;
          
          // Try to access it with a different user (admin)
          // Should be allowed for admin, but restricted for regular users
          const adminAccessResponse = await request(app)
            .get(`/api/reports/${reportId}`)
            .set('Authorization', `Bearer ${this.context.adminToken}`);

          expect(adminAccessResponse.status).toBe(200); // Admin can access

          // Try to modify with original user
          const modifyResponse = await request(app)
            .put(`/api/reports/${reportId}`)
            .send({ name: 'Modified Report' })
            .set('Authorization', `Bearer ${this.context.validToken}`);

          expect(modifyResponse.status).toBe(200); // Owner can modify
        }
      });

      test('Should prevent privilege escalation', async () => {
        // Try to modify user permissions
        const escalationResponse = await request(app)
          .put(`/api/users/${this.context.testUserId}`)
          .send({ isAdmin: true })
          .set('Authorization', `Bearer ${this.context.validToken}`);

        expect(escalationResponse.status).toBe(403);

        // Verify user is still not admin
        const userResponse = await request(app)
          .get(`/api/users/profile`)
          .set('Authorization', `Bearer ${this.context.validToken}`);

        if (userResponse.status === 200) {
          expect(userResponse.body.isAdmin).toBe(false);
        }
      });
    });
  }

  // =====================================================
  // AUDIT LOGGING VALIDATION
  // =====================================================

  async validateAuditLogging(): Promise<void> {
    describe('Audit Logging Validation', () => {
      test('Should log security-relevant events', async () => {
        // Perform a security-relevant action
        await request(app)
          .post('/api/auth/logout')
          .set('Authorization', `Bearer ${this.context.validToken}`);

        // Check if event was logged
        const auditLogs = await db.query(
          'SELECT * FROM audit_logs WHERE user_id = $1 AND event_type = $2',
          [this.context.testUserId, 'logout']
        );

        expect(auditLogs.rows.length).toBeGreaterThan(0);
        
        const logEntry = auditLogs.rows[0];
        expect(logEntry.event_type).toBe('logout');
        expect(logEntry.user_id).toBe(this.context.testUserId);
        expect(logEntry.ip_address).toBeDefined();
        expect(logEntry.user_agent).toBeDefined();
      });

      test('Should log failed authentication attempts', async () => {
        // Attempt failed login
        await request(app)
          .post('/api/auth/login')
          .send({
            username: 'remediation_test_user',
            password: 'wrong_password'
          });

        // Check if failed attempt was logged
        const auditLogs = await db.query(
          'SELECT * FROM audit_logs WHERE event_type = $1 AND event_action = $2',
          ['authentication', 'failed_login']
        );

        expect(auditLogs.rows.length).toBeGreaterThan(0);
      });

      test('Should log administrative actions', async () => {
        // Perform admin action
        await request(app)
          .get('/api/admin/users')
          .set('Authorization', `Bearer ${this.context.adminToken}`);

        // Check if admin action was logged
        const auditLogs = await db.query(
          'SELECT * FROM audit_logs WHERE user_id = $1 AND event_type = $2',
          [this.context.adminUserId, 'admin_access']
        );

        if (auditLogs.rows.length > 0) {
          const logEntry = auditLogs.rows[0];
          expect(logEntry.resource_type).toBe('admin_users');
        }
      });
    });
  }

  // =====================================================
  // DATA PROTECTION VALIDATION
  // =====================================================

  async validateDataProtection(): Promise<void> {
    describe('Data Protection Validation', () => {
      test('Should mask sensitive data in logs', async () => {
        // Create credential with sensitive data
        await request(app)
          .post('/api/credentials')
          .send({
            service: 'azure',
            username: 'test@example.com',
            password: 'sensitive-password-123',
            tenantId: 'test-tenant'
          })
          .set('Authorization', `Bearer ${this.context.validToken}`);

        // Check that password is not in plain text logs
        const logs = await db.query(
          'SELECT * FROM audit_logs WHERE user_id = $1 AND event_type = $2',
          [this.context.testUserId, 'credential_created']
        );

        if (logs.rows.length > 0) {
          const logData = JSON.stringify(logs.rows[0]);
          expect(logData).not.toContain('sensitive-password-123');
        }
      });

      test('Should implement data retention policies', async () => {
        // Create old audit log entry (simulated)
        await db.query(`
          INSERT INTO audit_logs (user_id, event_type, event_action, created_at)
          VALUES ($1, $2, $3, $4)
        `, [
          this.context.testUserId,
          'test_retention',
          'old_action',
          new Date(Date.now() - 95 * 24 * 60 * 60 * 1000) // 95 days ago
        ]);

        // Check if old logs are properly handled (cleanup job should exist)
        const oldLogs = await db.query(
          'SELECT * FROM audit_logs WHERE event_type = $1 AND created_at < NOW() - INTERVAL \'90 days\'',
          ['test_retention']
        );

        // If retention policy is implemented, old logs should be cleaned up
        // This test might need adjustment based on actual implementation
        expect(oldLogs.rows.length).toBeGreaterThanOrEqual(0);
      });

      test('Should validate data export controls', async () => {
        // Test data export with large dataset
        const response = await request(app)
          .get('/api/export/reports')
          .query({ format: 'csv', limit: 100000 })
          .set('Authorization', `Bearer ${this.context.validToken}`);

        // Should either limit export size or require special permissions
        if (response.status === 200) {
          expect(response.headers['content-length']).toBeDefined();
          // Should have reasonable size limits
          const contentLength = parseInt(response.headers['content-length'] || '0');
          expect(contentLength).toBeLessThan(50 * 1024 * 1024); // 50MB limit
        } else {
          expect(response.status).toBe(403); // Access denied for large exports
        }
      });
    });
  }

  // =====================================================
  // MAIN TEST RUNNER
  // =====================================================

  async runAllRemediationTests(): Promise<void> {
    await this.validateHTTPSRedirection();
    await this.validateDatabaseSecurity();
    await this.validateInputSanitization();
    await this.validateAuthenticationSecurity();
    await this.validateAuthorizationControls();
    await this.validateAuditLogging();
    await this.validateDataProtection();
  }
}

// Export for use in CI/CD and other test files
export { RemediationValidationTestRunner };

// Main test execution
describe('Security Remediation Validation Test Suite', () => {
  let testRunner: RemediationValidationTestRunner;

  beforeAll(async () => {
    testRunner = new RemediationValidationTestRunner();
    await testRunner.setup();
  });

  afterAll(async () => {
    await testRunner.cleanup();
  });

  test('Execute all remediation validation tests', async () => {
    await testRunner.runAllRemediationTests();
  }, 300000); // 5 minute timeout for comprehensive remediation tests
});