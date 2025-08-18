/**
 * Session Management and Token Security Tests
 * 
 * Comprehensive testing for session security, token handling, and authentication
 * mechanism vulnerabilities in the AD/Azure AD/O365 reporting application.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '@/app';
import { db } from '@/config/database';
import { cryptoService } from '@/services/crypto.service';
import { logger } from '@/utils/logger';

interface SessionTestContext {
  validToken: string;
  adminToken: string;
  refreshToken: string;
  testUserId: number;
  adminUserId: number;
  sessionId: string;
}

class SessionTokenSecurityTestRunner {
  private context: SessionTestContext = {} as SessionTestContext;

  async setup(): Promise<void> {
    // Create test users
    const userResult = await db.query(`
      INSERT INTO users (username, password_hash, email, is_active, is_admin, auth_source)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, ['session_test_user', 'hashed_password', 'session-test@example.com', true, false, 'local']);
    
    const adminResult = await db.query(`
      INSERT INTO users (username, password_hash, email, is_active, is_admin, auth_source)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, ['session_test_admin', 'hashed_password', 'session-admin@example.com', true, true, 'local']);
    
    this.context.testUserId = userResult.rows[0].id;
    this.context.adminUserId = adminResult.rows[0].id;
    this.context.sessionId = 'test-session-' + Date.now();
    
    // Generate tokens
    await this.generateTokens();
  }

  async cleanup(): Promise<void> {
    try {
      await db.query('DELETE FROM users WHERE username LIKE $1', ['session_test_%']);
      await db.query('DELETE FROM token_blacklist WHERE user_id IN ($1, $2)', [this.context.testUserId, this.context.adminUserId]);
      await db.query('DELETE FROM audit_logs WHERE user_id IN ($1, $2)', [this.context.testUserId, this.context.adminUserId]);
    } catch (error) {
      logger.warn('Cleanup error:', error);
    }
  }

  private async generateTokens(): Promise<void> {
    const secret = process.env.JWT_SECRET || 'test-secret';
    
    // Valid user token
    this.context.validToken = jwt.sign(
      { 
        userId: this.context.testUserId, 
        username: 'session_test_user',
        isAdmin: false,
        authSource: 'local',
        sessionId: this.context.sessionId,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600 // 1 hour
      },
      secret
    );

    // Valid admin token
    this.context.adminToken = jwt.sign(
      { 
        userId: this.context.adminUserId, 
        username: 'session_test_admin',
        isAdmin: true,
        authSource: 'local',
        sessionId: this.context.sessionId + '_admin',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600
      },
      secret
    );

    // Refresh token
    this.context.refreshToken = jwt.sign(
      { 
        userId: this.context.testUserId, 
        type: 'refresh',
        sessionId: this.context.sessionId
      },
      secret,
      { expiresIn: '7d' }
    );
  }

  // =====================================================
  // JWT TOKEN SECURITY TESTS
  // =====================================================

  async testJWTTokenSecurity(): Promise<void> {
    describe('JWT Token Security Tests', () => {
      test('Should reject tokens with no algorithm', async () => {
        const maliciousToken = jwt.sign(
          { userId: this.context.testUserId, isAdmin: true },
          '',
          { algorithm: 'none' }
        );

        const response = await request(app)
          .get('/api/reports')
          .set('Authorization', `Bearer ${maliciousToken}`);

        expect(response.status).toBe(401);
      });

      test('Should reject tokens with wrong signature', async () => {
        const maliciousToken = jwt.sign(
          { userId: this.context.testUserId, isAdmin: true },
          'wrong-secret'
        );

        const response = await request(app)
          .get('/api/reports')
          .set('Authorization', `Bearer ${maliciousToken}`);

        expect(response.status).toBe(401);
      });

      test('Should reject expired tokens', async () => {
        const expiredToken = jwt.sign(
          { 
            userId: this.context.testUserId,
            exp: Math.floor(Date.now() / 1000) - 3600 // Expired 1 hour ago
          },
          process.env.JWT_SECRET || 'test-secret'
        );

        const response = await request(app)
          .get('/api/reports')
          .set('Authorization', `Bearer ${expiredToken}`);

        expect(response.status).toBe(401);
      });

      test('Should reject tokens with future iat claim', async () => {
        const futureToken = jwt.sign(
          { 
            userId: this.context.testUserId,
            iat: Math.floor(Date.now() / 1000) + 3600, // Issued 1 hour in future
            exp: Math.floor(Date.now() / 1000) + 7200
          },
          process.env.JWT_SECRET || 'test-secret'
        );

        const response = await request(app)
          .get('/api/reports')
          .set('Authorization', `Bearer ${futureToken}`);

        expect(response.status).toBe(401);
      });

      test('Should reject tokens with invalid claims', async () => {
        const invalidClaims = [
          { userId: 'invalid-user-id', isAdmin: true },
          { userId: -1, isAdmin: true },
          { userId: null, isAdmin: true },
          { userId: this.context.testUserId, isAdmin: 'true' }, // String instead of boolean
          { userId: this.context.testUserId, authSource: null },
          { userId: this.context.testUserId, sessionId: '../admin' }
        ];

        for (const claims of invalidClaims) {
          const maliciousToken = jwt.sign(
            claims,
            process.env.JWT_SECRET || 'test-secret'
          );

          const response = await request(app)
            .get('/api/reports')
            .set('Authorization', `Bearer ${maliciousToken}`);

          expect(response.status).toBeGreaterThanOrEqual(401);
        }
      });

      test('Should handle malformed JWT tokens', async () => {
        const malformedTokens = [
          'invalid.jwt.token',
          'header.payload',
          'header.payload.signature.extra',
          'not-a-jwt-at-all',
          '',
          'Bearer ',
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature',
          btoa('{"alg":"none"}') + '.' + btoa('{"userId":1}') + '.'
        ];

        for (const token of malformedTokens) {
          const response = await request(app)
            .get('/api/reports')
            .set('Authorization', `Bearer ${token}`);

          expect(response.status).toBe(401);
        }
      });
    });
  }

  // =====================================================
  // SESSION MANAGEMENT TESTS
  // =====================================================

  async testSessionManagement(): Promise<void> {
    describe('Session Management Tests', () => {
      test('Should prevent session fixation', async () => {
        const fixedSessionId = 'fixed-session-123';
        
        // Attempt login with predetermined session ID
        const loginResponse = await request(app)
          .post('/api/auth/login')
          .set('Cookie', `sessionId=${fixedSessionId}`)
          .send({
            username: 'session_test_user',
            password: 'password'
          });

        // Should either reject or assign new session ID
        if (loginResponse.status === 200) {
          const cookies = loginResponse.headers['set-cookie'] as unknown as string[];
          if (cookies) {
            const sessionCookie = cookies.find((c: string) => c.startsWith('sessionId='));
            if (sessionCookie) {
              expect(sessionCookie).not.toContain(fixedSessionId);
            }
          }
        } else {
          expect(loginResponse.status).toBe(401);
        }
      });

      test('Should invalidate sessions on logout', async () => {
        // First, login to get a valid session
        const loginResponse = await request(app)
          .post('/api/auth/login')
          .send({
            username: 'session_test_user',
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

      test('Should handle concurrent sessions properly', async () => {
        const tokens: string[] = [];
        
        // Create multiple sessions for the same user
        for (let i = 0; i < 5; i++) {
          const sessionToken = jwt.sign(
            { 
              userId: this.context.testUserId,
              sessionId: `concurrent-session-${i}`,
              iat: Math.floor(Date.now() / 1000),
              exp: Math.floor(Date.now() / 1000) + 3600
            },
            process.env.JWT_SECRET || 'test-secret'
          );
          tokens.push(sessionToken);
        }

        // All tokens should be valid initially
        for (const token of tokens) {
          const response = await request(app)
            .get('/api/health')
            .set('Authorization', `Bearer ${token}`);
          
          expect(response.status).toBe(200);
        }

        // Check if there's any session limit enforcement
        const responses = await Promise.all(
          tokens.map(token => 
            request(app)
              .get('/api/reports')
              .set('Authorization', `Bearer ${token}`)
          )
        );

        const successfulResponses = responses.filter(r => r.status === 200);
        expect(successfulResponses.length).toBeGreaterThan(0);
      });

      test('Should detect session hijacking attempts', async () => {
        const originalToken = this.context.validToken;
        
        // Simulate session hijacking by changing user agent and IP
        const response1 = await request(app)
          .get('/api/reports')
          .set('Authorization', `Bearer ${originalToken}`)
          .set('User-Agent', 'Original Browser');

        const response2 = await request(app)
          .get('/api/reports')
          .set('Authorization', `Bearer ${originalToken}`)
          .set('User-Agent', 'Different Browser')
          .set('X-Forwarded-For', '192.168.1.100');

        // Both should work unless strict session binding is implemented
        expect(response1.status).toBe(200);
        expect(response2.status).toBe(200);
      });
    });
  }

  // =====================================================
  // TOKEN BLACKLIST TESTS
  // =====================================================

  async testTokenBlacklist(): Promise<void> {
    describe('Token Blacklist Tests', () => {
      test('Should blacklist tokens on logout', async () => {
        const token = this.context.validToken;
        
        // Logout to blacklist token
        await request(app)
          .post('/api/auth/logout')
          .set('Authorization', `Bearer ${token}`);

        // Token should be blacklisted
        const response = await request(app)
          .get('/api/reports')
          .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(401);
      });

      test('Should blacklist all user tokens on global logout', async () => {
        const tokens = [];
        
        // Create multiple tokens for same user
        for (let i = 0; i < 3; i++) {
          const token = jwt.sign(
            { 
              userId: this.context.testUserId,
              sessionId: `blacklist-test-${i}`,
              iat: Math.floor(Date.now() / 1000),
              exp: Math.floor(Date.now() / 1000) + 3600
            },
            process.env.JWT_SECRET || 'test-secret'
          );
          tokens.push(token);
        }

        // Global logout
        await request(app)
          .post('/api/auth/logout-all')
          .set('Authorization', `Bearer ${tokens[0]}`);

        // All tokens should be blacklisted
        for (const token of tokens) {
          const response = await request(app)
            .get('/api/reports')
            .set('Authorization', `Bearer ${token}`);

          expect(response.status).toBe(401);
        }
      });

      test('Should handle token blacklist race conditions', async () => {
        const token = jwt.sign(
          { 
            userId: this.context.testUserId,
            sessionId: 'race-condition-test',
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 3600
          },
          process.env.JWT_SECRET || 'test-secret'
        );

        // Make multiple simultaneous requests with the same token
        const promises = Array(10).fill(null).map(() =>
          request(app)
            .get('/api/reports')
            .set('Authorization', `Bearer ${token}`)
        );

        const responses = await Promise.all(promises);
        
        // Should handle concurrent requests gracefully
        const successCount = responses.filter(r => r.status === 200).length;
        expect(successCount).toBeGreaterThan(0);
      });
    });
  }

  // =====================================================
  // TOKEN REFRESH SECURITY TESTS
  // =====================================================

  async testTokenRefreshSecurity(): Promise<void> {
    describe('Token Refresh Security Tests', () => {
      test('Should validate refresh token properly', async () => {
        const invalidRefreshTokens = [
          'invalid.refresh.token',
          jwt.sign({ type: 'access' }, process.env.JWT_SECRET || 'test-secret'),
          jwt.sign({ userId: 999, type: 'refresh' }, process.env.JWT_SECRET || 'test-secret'),
          jwt.sign({ type: 'refresh' }, 'wrong-secret')
        ];

        for (const refreshToken of invalidRefreshTokens) {
          const response = await request(app)
            .post('/api/auth/refresh')
            .send({ refreshToken });

          expect(response.status).toBe(401);
        }
      });

      test('Should prevent refresh token replay attacks', async () => {
        const refreshToken = this.context.refreshToken;
        
        // Use refresh token once
        const firstResponse = await request(app)
          .post('/api/auth/refresh')
          .send({ refreshToken });

        if (firstResponse.status === 200) {
          // Try to use the same refresh token again
          const secondResponse = await request(app)
            .post('/api/auth/refresh')
            .send({ refreshToken });

          // Should be rejected (if one-time use is implemented)
          expect(secondResponse.status).toBe(401);
        }
      });

      test('Should rotate refresh tokens', async () => {
        const originalRefreshToken = this.context.refreshToken;
        
        const response = await request(app)
          .post('/api/auth/refresh')
          .send({ refreshToken: originalRefreshToken });

        if (response.status === 200) {
          const newRefreshToken = response.body.refreshToken;
          
          // New refresh token should be different
          expect(newRefreshToken).toBeDefined();
          expect(newRefreshToken).not.toBe(originalRefreshToken);
        }
      });
    });
  }

  // =====================================================
  // CSRF PROTECTION TESTS
  // =====================================================

  async testCSRFProtection(): Promise<void> {
    describe('CSRF Protection Tests', () => {
      test('Should require CSRF token for state-changing operations', async () => {
        const stateChangingEndpoints = [
          { method: 'POST', url: '/api/reports/custom', body: { name: 'test' } },
          { method: 'PUT', url: '/api/reports/1', body: { name: 'updated' } },
          { method: 'DELETE', url: '/api/reports/1' },
          { method: 'POST', url: '/api/auth/logout' }
        ];

        for (const endpoint of stateChangingEndpoints) {
          const req = request(app)[endpoint.method.toLowerCase() as 'post' | 'put' | 'delete'](endpoint.url)
            .set('Authorization', `Bearer ${this.context.validToken}`)
            .set('Origin', 'http://evil.com')
            .set('Referer', 'http://evil.com/attack');

          if (endpoint.body) {
            req.send(endpoint.body);
          }

          const response = await req;
          
          // Should be rejected without proper CSRF protection
          expect(response.status).toBeGreaterThanOrEqual(400);
        }
      });

      test('Should validate CSRF token origin', async () => {
        // This test would need a valid CSRF token first
        const csrfTokenResponse = await request(app)
          .get('/api/csrf-token')
          .set('Authorization', `Bearer ${this.context.validToken}`);

        if (csrfTokenResponse.status === 200) {
          const csrfToken = csrfTokenResponse.body.csrfToken;
          
          const response = await request(app)
            .post('/api/reports/custom')
            .set('Authorization', `Bearer ${this.context.validToken}`)
            .set('X-CSRF-Token', csrfToken)
            .set('Origin', 'http://evil.com')
            .send({ name: 'test report' });

          expect(response.status).toBeGreaterThanOrEqual(400);
        }
      });
    });
  }

  // =====================================================
  // COOKIE SECURITY TESTS
  // =====================================================

  async testCookieSecurity(): Promise<void> {
    describe('Cookie Security Tests', () => {
      test('Should set secure cookie flags', async () => {
        const loginResponse = await request(app)
          .post('/api/auth/login')
          .send({
            username: 'session_test_user',
            password: 'password'
          });

        if (loginResponse.status === 200) {
          const cookies = loginResponse.headers['set-cookie'] as unknown as string[];
          if (cookies) {
            cookies.forEach((cookie: string) => {
              if (cookie.includes('session') || cookie.includes('token')) {
                expect(cookie).toMatch(/HttpOnly/i);
                expect(cookie).toMatch(/SameSite/i);
                
                // In production, should also have Secure flag
                if (process.env.NODE_ENV === 'production') {
                  expect(cookie).toMatch(/Secure/i);
                }
              }
            });
          }
        }
      });

      test('Should handle cookie tampering', async () => {
        const tamperedCookies = [
          'sessionId=../admin',
          'userId=1; isAdmin=true',
          'token=<script>alert(1)</script>',
          'auth="; DROP TABLE users; --'
        ];

        for (const cookie of tamperedCookies) {
          const response = await request(app)
            .get('/api/reports')
            .set('Cookie', cookie);

          expect(response.status).toBe(401);
        }
      });
    });
  }

  // =====================================================
  // TIMING ATTACK PREVENTION TESTS
  // =====================================================

  async testTimingAttackPrevention(): Promise<void> {
    describe('Timing Attack Prevention Tests', () => {
      test('Should prevent username enumeration via timing', async () => {
        const validUsername = 'session_test_user';
        const invalidUsername = 'nonexistent_user_12345';
        
        const timings: number[] = [];
        
        // Test valid username
        for (let i = 0; i < 5; i++) {
          const start = Date.now();
          await request(app)
            .post('/api/auth/login')
            .send({ username: validUsername, password: 'wrong_password' });
          timings.push(Date.now() - start);
        }
        
        // Test invalid username
        for (let i = 0; i < 5; i++) {
          const start = Date.now();
          await request(app)
            .post('/api/auth/login')
            .send({ username: invalidUsername, password: 'wrong_password' });
          timings.push(Date.now() - start);
        }
        
        // Calculate average timings
        const validUserTimings = timings.slice(0, 5);
        const invalidUserTimings = timings.slice(5);
        
        const validAvg = validUserTimings.reduce((a, b) => a + b) / validUserTimings.length;
        const invalidAvg = invalidUserTimings.reduce((a, b) => a + b) / invalidUserTimings.length;
        
        // Timing difference should not be significant (within 100ms)
        const timingDifference = Math.abs(validAvg - invalidAvg);
        expect(timingDifference).toBeLessThan(100);
      });

      test('Should prevent token validation timing attacks', async () => {
        const validToken = this.context.validToken;
        const invalidToken = 'invalid.token.here';
        
        const timings: number[] = [];
        
        // Test valid token format (but might be expired/invalid)
        for (let i = 0; i < 5; i++) {
          const start = Date.now();
          await request(app)
            .get('/api/reports')
            .set('Authorization', `Bearer ${validToken}`);
          timings.push(Date.now() - start);
        }
        
        // Test completely invalid token
        for (let i = 0; i < 5; i++) {
          const start = Date.now();
          await request(app)
            .get('/api/reports')
            .set('Authorization', `Bearer ${invalidToken}`);
          timings.push(Date.now() - start);
        }
        
        // Timing difference should not reveal information
        const validTimings = timings.slice(0, 5);
        const invalidTimings = timings.slice(5);
        
        const validAvg = validTimings.reduce((a, b) => a + b) / validTimings.length;
        const invalidAvg = invalidTimings.reduce((a, b) => a + b) / invalidTimings.length;
        
        const timingDifference = Math.abs(validAvg - invalidAvg);
        expect(timingDifference).toBeLessThan(50);
      });
    });
  }

  // =====================================================
  // MAIN TEST RUNNER
  // =====================================================

  async runAllSessionTokenTests(): Promise<void> {
    await this.testJWTTokenSecurity();
    await this.testSessionManagement();
    await this.testTokenBlacklist();
    await this.testTokenRefreshSecurity();
    await this.testCSRFProtection();
    await this.testCookieSecurity();
    await this.testTimingAttackPrevention();
  }
}

// Export for use in other test files
export { SessionTokenSecurityTestRunner };

// Main test execution
describe('Session Management and Token Security Test Suite', () => {
  let testRunner: SessionTokenSecurityTestRunner;

  beforeAll(async () => {
    testRunner = new SessionTokenSecurityTestRunner();
    await testRunner.setup();
  });

  afterAll(async () => {
    await testRunner.cleanup();
  });

  test('Execute all session and token security tests', async () => {
    await testRunner.runAllSessionTokenTests();
  }, 240000); // 4 minute timeout for comprehensive session tests
});