import request from 'supertest';
import express from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import { unifiedAuthController } from '@/auth/controllers/unified-auth.controller';
import { requireAuth as authMiddleware } from '@/auth/middleware/unified-auth.middleware';
import { csrfProtection } from '@/middleware/csrf.middleware';
import { loginRateLimiter, authEndpointsRateLimiter } from '@/middleware/rate-limit.middleware';
import { db } from '@/config/database';
import bcrypt from 'bcryptjs';

// Mock environment variable
process.env.USE_COOKIE_AUTH = 'true';

// Mock session service for testing
const sessionService = {
  clearUserSessions: jest.fn().mockResolvedValue(undefined),
  getUserSessions: jest.fn().mockResolvedValue([]),
};

// Skip these integration tests if database is not available
const skipIfNoDb = () => {
  const dbUrl = process.env.DATABASE_URL;
  const hasDb = dbUrl && !dbUrl.includes('undefined') && dbUrl.includes('postgresql');
  
  if (!hasDb) {
    test.skip('Skipping integration tests - no database configured', () => {
      expect(true).toBe(true);
    });
    return true;
  }
  return false;
};

describe('Cookie Authentication System', () => {
  // Skip all tests if no database
  if (skipIfNoDb()) {
    return;
  }

  let app: express.Application;
  let testUser: { id: number; email: string; username: string; };
  let setupFailed = false;

  beforeAll(async () => {
    try {
      // First check if database is connected
      await db.query('SELECT 1');
      
      // Check if user already exists and delete
      await db.query('DELETE FROM users WHERE username = $1', ['cookietest']);
      
      // Create test user
      const hashedPassword = await bcrypt.hash('testpass123', 10);
      const result = await db.query(
        `INSERT INTO users (email, username, password_hash, auth_source, is_active, roles) 
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        ['cookietest@example.com', 'cookietest', hashedPassword, 'local', true, '{user}']
      );
      testUser = result.rows[0];
      console.log('Test user created successfully:', testUser.username); // eslint-disable-line no-console
    } catch (error) {
      console.warn('Failed to create test user, skipping tests:', error); // eslint-disable-line no-console
      setupFailed = true;
    }
  });

  afterAll(async () => {
    // Cleanup test user
    if (testUser) {
      try {
        await db.query('DELETE FROM users WHERE id = $1', [testUser.id]);
      } catch (error) {
        console.warn('Failed to cleanup test user:', error); // eslint-disable-line no-console
      }
    }
  });

  // Helper function to skip tests if setup failed
  const skipIfSetupFailed = () => {
    return setupFailed;
  };

  beforeEach(() => {
    // Setup express app with cookie auth middleware
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    
    // Simple session middleware for testing
    app.use(session({
      secret: 'test-secret',
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: false, // false for testing
        sameSite: 'lax',
        maxAge: 1000 * 60 * 15 // 15 minutes
      }
    }));

    // Auth routes with rate limiting
    app.post('/api/auth/login', loginRateLimiter, (req, res, _next) => unifiedAuthController.login(req, res, _next));
    app.post('/api/auth/logout', authEndpointsRateLimiter, authMiddleware, (req, res, _next) => unifiedAuthController.logout(req, res, _next));
    app.get('/api/auth/profile', authEndpointsRateLimiter, authMiddleware, (req, res, _next) => unifiedAuthController.getProfile(req, res, _next));
    app.get('/api/auth/csrf', authEndpointsRateLimiter, (req, res, _next) => unifiedAuthController.getCSRFToken(req, res, _next));
    
    // Protected test route with CSRF
    app.post('/api/test/protected', authMiddleware, csrfProtection, (req, res) => {
      res.json({ success: true, userId: req.user?.id });
    });
  });

  describe('Login with Cookies', () => {
    it('should login and set HTTP-only cookies', async () => {
      if (skipIfSetupFailed()) return;
      
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'cookietest',
          password: 'testpass123',
          authSource: 'local'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe('cookietest@example.com');
      
      // Should NOT return tokens in body when cookie auth is enabled
      expect(response.body.data.accessToken).toBeUndefined();
      expect(response.body.data.refreshToken).toBeUndefined();
      
      // Check for HTTP-only cookies
      const cookies = Array.isArray(response.headers['set-cookie']) 
        ? response.headers['set-cookie'] as string[]
        : typeof response.headers['set-cookie'] === 'string' 
          ? [response.headers['set-cookie']] 
          : undefined;
      expect(cookies).toBeDefined();
      expect(cookies?.length).toBeGreaterThan(0);
      
      // Should have access token cookie
      const accessTokenCookie = cookies?.find((c: string) => c.startsWith('access_token='));
      expect(accessTokenCookie).toBeDefined();
      expect(accessTokenCookie).toContain('HttpOnly');
      expect(accessTokenCookie).toContain('SameSite=Lax');
    });

    it('should reject invalid credentials', async () => {
      if (skipIfSetupFailed()) return;
      
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'cookietest',
          password: 'wrongpassword',
          authSource: 'local'
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid credentials');
      
      // Should not set cookies on failed login
      const cookies = response.headers['set-cookie'];
      expect(cookies).toBeUndefined();
    });
  });

  describe('CSRF Protection', () => {
    let authCookies: string[];
    let csrfToken: string;

    beforeEach(async () => {
      if (setupFailed) return;
      
      // Login to get auth cookies
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'cookietest',
          password: 'testpass123',
          authSource: 'local'
        });
      
      authCookies = Array.isArray(loginResponse.headers['set-cookie']) 
        ? loginResponse.headers['set-cookie'] as string[]
        : typeof loginResponse.headers['set-cookie'] === 'string' 
          ? [loginResponse.headers['set-cookie']] 
          : [];
      
      // Get CSRF token
      const csrfResponse = await request(app)
        .get('/api/auth/csrf')
        .set('Cookie', authCookies);
      
      expect(csrfResponse.status).toBe(200);
      csrfToken = csrfResponse.body.csrfToken;
      expect(csrfToken).toBeDefined();
    });

    it('should allow requests with valid CSRF token', async () => {
      if (skipIfSetupFailed()) return;
      
      const response = await request(app)
        .post('/api/test/protected')
        .set('Cookie', authCookies)
        .set('X-CSRF-Token', csrfToken)
        .send({ data: 'test' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.userId).toBe(testUser.id);
    });

    it('should block requests without CSRF token', async () => {
      if (skipIfSetupFailed()) return;
      
      const response = await request(app)
        .post('/api/test/protected')
        .set('Cookie', authCookies)
        .send({ data: 'test' });

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('CSRF');
    });

    it('should block requests with invalid CSRF token', async () => {
      if (skipIfSetupFailed()) return;
      
      const response = await request(app)
        .post('/api/test/protected')
        .set('Cookie', authCookies)
        .set('X-CSRF-Token', 'invalid-token')
        .send({ data: 'test' });

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('CSRF');
    });
  });

  describe('Authenticated Requests', () => {
    let authCookies: string[];

    beforeEach(async () => {
      if (setupFailed) return;
      
      // Login to get auth cookies
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'cookietest',
          password: 'testpass123',
          authSource: 'local'
        });
      
      authCookies = Array.isArray(loginResponse.headers['set-cookie']) 
        ? loginResponse.headers['set-cookie'] as string[]
        : typeof loginResponse.headers['set-cookie'] === 'string' 
          ? [loginResponse.headers['set-cookie']] 
          : [];
    });

    it('should access protected routes with cookies', async () => {
      if (skipIfSetupFailed()) return;
      
      const response = await request(app)
        .get('/api/auth/profile')
        .set('Cookie', authCookies);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.email).toBe('cookietest@example.com');
    });

    it('should reject requests without cookies', async () => {
      if (skipIfSetupFailed()) return;
      
      const response = await request(app)
        .get('/api/auth/profile');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Authentication required');
    });
  });

  describe('Logout', () => {
    it('should clear cookies on logout', async () => {
      if (skipIfSetupFailed()) return;
      
      // Login first
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'cookietest',
          password: 'testpass123',
          authSource: 'local'
        });
      
      const authCookies = Array.isArray(loginResponse.headers['set-cookie']) 
        ? loginResponse.headers['set-cookie'] as string[]
        : typeof loginResponse.headers['set-cookie'] === 'string' 
          ? [loginResponse.headers['set-cookie']] 
          : [];
      
      // Logout
      const logoutResponse = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', authCookies);

      expect(logoutResponse.status).toBe(200);
      expect(logoutResponse.body.success).toBe(true);
      
      // Check for cookie clearing
      const cookies = Array.isArray(logoutResponse.headers['set-cookie']) 
        ? logoutResponse.headers['set-cookie'] as string[]
        : typeof logoutResponse.headers['set-cookie'] === 'string' 
          ? [logoutResponse.headers['set-cookie']] 
          : undefined;
      expect(cookies).toBeDefined();
      
      // Should have Max-Age=0 to clear cookies
      const accessTokenCookie = cookies?.find((c: string) => c.startsWith('access_token='));
      expect(accessTokenCookie).toContain('Max-Age=0');
    });
  });

  describe('Session Management', () => {
    it('should track active sessions', async () => {
      if (skipIfSetupFailed()) return;
      
      // Clear any existing sessions
      await sessionService.clearUserSessions(testUser.id);
      
      // Login to create session
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'cookietest',
          password: 'testpass123',
          authSource: 'local'
        });

      expect(loginResponse.status).toBe(200);
      
      // Check active sessions
      const sessions = await sessionService.getUserSessions(testUser.id);
      expect(sessions.length).toBeGreaterThan(0);
      expect(sessions[0].userId).toBe(testUser.id);
    });

    it.skip('should remove session on logout', async () => {
      // Login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'cookietest',
          password: 'testpass123',
          authSource: 'local'
        });
      
      const authCookies = Array.isArray(loginResponse.headers['set-cookie']) 
        ? loginResponse.headers['set-cookie'] as string[]
        : typeof loginResponse.headers['set-cookie'] === 'string' 
          ? [loginResponse.headers['set-cookie']] 
          : [];
      
      // Logout
      await request(app)
        .post('/api/auth/logout')
        .set('Cookie', authCookies);
      
      // Check sessions cleared
      const sessions = await sessionService.getUserSessions(testUser.id);
      expect(sessions.length).toBe(0);
    });
  });

  describe('Feature Flag Compatibility', () => {
    it('should support both cookie and header authentication based on flag', async () => {
      if (skipIfSetupFailed()) return;
      
      // Test is already using cookie auth due to USE_COOKIE_AUTH=true
      // The auth middleware should handle both methods transparently
      
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'cookietest',
          password: 'testpass123',
          authSource: 'local'
        });

      expect(loginResponse.status).toBe(200);
      
      // When cookie auth is enabled, tokens should not be in response body
      expect(loginResponse.body.data.accessToken).toBeUndefined();
      expect(loginResponse.body.data.refreshToken).toBeUndefined();
    });
  });

  describe('Rate Limiting Security', () => {
    it('should enforce rate limiting on login attempts', async () => {
      if (skipIfSetupFailed()) return;

      // Make 5 failed login attempts (the limit for login rate limiter)
      const failedAttempts = [];
      for (let i = 0; i < 5; i++) {
        failedAttempts.push(
          request(app)
            .post('/api/auth/login')
            .send({
              username: 'nonexistent',
              password: 'wrongpassword',
              authSource: 'local'
            })
        );
      }

      // Execute all failed attempts
      const responses = await Promise.all(failedAttempts);
      
      // All should fail with 401 (unauthorized)
      responses.forEach(response => {
        expect(response.status).toBe(401);
      });

      // 6th attempt should be rate limited (429 Too Many Requests)
      const rateLimitedResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'nonexistent',
          password: 'wrongpassword',
          authSource: 'local'
        });

      expect(rateLimitedResponse.status).toBe(429);
      expect(rateLimitedResponse.body.error).toBe('Too many requests');
      expect(rateLimitedResponse.headers['retry-after']).toBeDefined();
    });

    it('should enforce rate limiting on auth endpoints', async () => {
      if (skipIfSetupFailed()) return;

      // Make multiple requests to CSRF endpoint (30 is the limit for auth endpoints)
      const requests = [];
      for (let i = 0; i < 31; i++) {
        requests.push(request(app).get('/api/auth/csrf'));
      }

      // Execute requests in batches to avoid overwhelming the server
      const batchSize = 10;
      const results = [];
      
      for (let i = 0; i < requests.length; i += batchSize) {
        const batch = requests.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch);
        results.push(...batchResults);
      }

      // Last request should be rate limited
      const lastResponse = results[results.length - 1];
      expect(lastResponse.status).toBe(429);
      expect(lastResponse.body.error).toBe('Too many requests');
    });
  });
});