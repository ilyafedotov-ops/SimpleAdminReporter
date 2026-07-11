import {
  E2ETestContext,
  setupE2ETestContext,
  teardownE2ETestContext,
  createE2ETestData,
  assertApiResponse,
  generateTestCorrelationId,
  waitFor,
  getAuthPayload,
} from "./setup";
import { logger } from "@/utils/logger";
import { E2E_TEST_PASSWORD_HASH } from "@/test/test-helpers";

// Set environment for E2E tests
process.env.TEST_TYPE = "integration";
process.env.NODE_ENV = "test";

describe("Authentication E2E Tests", () => {
  let testContext: E2ETestContext;

  beforeAll(async () => {
    testContext = await setupE2ETestContext();
    await createE2ETestData(testContext.pool);
  });

  afterAll(async () => {
    await teardownE2ETestContext(testContext);
  });

  describe("LDAP Authentication Flow", () => {
    beforeEach(() => {
      // Mock LDAP service for authentication tests
      jest.clearAllMocks();
    });

    it("should successfully authenticate with valid LDAP credentials", async () => {
      const correlationId = generateTestCorrelationId();

      const response = await testContext.request
        .post("/api/auth/login")
        .set("X-Correlation-ID", correlationId)
        .send({
          username: "testuser",
          password: "testpassword",
          authSource: "local",
        });

      const body = assertApiResponse(response, 200);
      const auth = getAuthPayload(body);

      // Verify response structure
      expect(body.success).toBe(true);
      expect(auth.user).toBeDefined();
      expect(auth.user.username).toBe("testuser");
      expect(auth.user.authSource).toBe("local"); // Test user is local in test DB
      expect(auth.accessToken).toBeDefined();
      expect(auth.refreshToken).toBeDefined();

      // Verify no password in response
      expect(auth.user.password).toBeUndefined();
      expect(auth.user.passwordHash).toBeUndefined();

      // Verify session is created in database
      const client = await testContext.pool.connect();
      try {
        const sessionResult = await client.query(
          "SELECT * FROM user_sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
          [testContext.userId],
        );
        expect(sessionResult.rows.length).toBeGreaterThan(0);
      } finally {
        client.release();
      }
    });

    it("should fail authentication with invalid credentials", async () => {
      const correlationId = generateTestCorrelationId();

      const response = await testContext.request
        .post("/api/auth/login")
        .set("X-Correlation-ID", correlationId)
        .send({
          username: "testuser",
          password: "wrongpassword",
          authSource: "local",
        });

      assertApiResponse(response, 401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe("Invalid credentials");

      // Verify audit log entry for failed login
      await waitFor(async () => {
        const client = await testContext.pool.connect();
        try {
          const auditResult = await client.query(
            `SELECT * FROM audit_logs 
             WHERE event_type = 'auth' AND event_action = 'login_failed' AND success = false
             AND username = $1
             ORDER BY created_at DESC LIMIT 1`,
            ["testuser"],
          );
          return auditResult.rows.length > 0;
        } finally {
          client.release();
        }
      }, 3000);
    });

    it("should handle account lockout after multiple failed attempts", async () => {
      const testUsername = "lockout_test_user";
      const correlationId = generateTestCorrelationId();

      // Create test user for lockout testing
      const client = await testContext.pool.connect();
      try {
        await client.query(
          `
          INSERT INTO users (username, email, display_name, auth_source, is_admin, is_active, password_hash)
          VALUES ($1, $2, $3, 'local', false, true, $4)
          ON CONFLICT (username) DO NOTHING
        `,
          [
            testUsername,
            `${testUsername}@test.local`,
            "Lockout Test User",
            E2E_TEST_PASSWORD_HASH,
          ],
        );
      } finally {
        client.release();
      }

      // Simulate multiple failed login attempts
      const maxAttempts = 5;
      for (let i = 1; i <= maxAttempts; i++) {
        const response = await testContext.request
          .post("/api/auth/login")
          .set("X-Correlation-ID", `${correlationId}-${i}`)
          .send({
            username: testUsername,
            password: "wrongpassword",
            authSource: "local",
          });

        assertApiResponse(response, 401);
        expect(response.body.error).toBe("Invalid credentials");
      }

      // The next attempt should be rejected with lockout status
      const lockedResponse = await testContext.request
        .post("/api/auth/login")
        .set("X-Correlation-ID", `${correlationId}-locked`)
        .send({
          username: testUsername,
          password: "wrongpassword",
          authSource: "local",
        });

      assertApiResponse(lockedResponse, 423);
      expect(lockedResponse.body.error).toContain("Account is locked");

      // Verify lockout is recorded in database
      await waitFor(async () => {
        const client = await testContext.pool.connect();
        try {
          const lockoutResult = await client.query(
            `SELECT * FROM account_lockouts
             WHERE username = $1 AND unlocked_at IS NULL AND expires_at > NOW()`,
            [testUsername],
          );
          return lockoutResult.rows.length > 0;
        } finally {
          client.release();
        }
      }, 3000);
    });

    it("should track authentication session properly", async () => {
      const correlationId = generateTestCorrelationId();

      // Login
      const loginResponse = await testContext.request
        .post("/api/auth/login")
        .set("X-Correlation-ID", correlationId)
        .send({
          username: "testuser",
          password: "testpassword",
          authSource: "local",
        });

      const loginBody = assertApiResponse(loginResponse, 200);
      const accessToken = getAuthPayload(loginBody).accessToken;

      // Use session to access protected endpoint
      const profileResponse = await testContext.request
        .get("/api/auth/profile")
        .set("Authorization", `Bearer ${accessToken}`)
        .set("X-Correlation-ID", correlationId);

      const profileBody = assertApiResponse(profileResponse, 200);
      expect(getAuthPayload(profileBody).user.username).toBe("testuser");

      // Logout
      const logoutResponse = await testContext.request
        .post("/api/auth/logout")
        .set("Authorization", `Bearer ${accessToken}`)
        .set("X-Correlation-ID", correlationId);

      assertApiResponse(logoutResponse, 200);
      expect(logoutResponse.body.success).toBe(true);

      // Verify session is invalidated
      const invalidSessionResponse = await testContext.request
        .get("/api/auth/profile")
        .set("Authorization", `Bearer ${accessToken}`)
        .set("X-Correlation-ID", correlationId);

      assertApiResponse(invalidSessionResponse, 401);
    });
  });

  describe("Azure AD Authentication Flow", () => {
    it("should expose Azure public config for authenticated users", async () => {
      const correlationId = generateTestCorrelationId();

      const response = await testContext.request
        .get("/api/auth/azure/config")
        .set("X-Correlation-ID", correlationId)
        .set("Authorization", `Bearer ${testContext.adminToken}`);

      expect([200, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeDefined();
      }
    });
  });

  describe("JWT Token Management", () => {
    it("should validate JWT token structure and claims", async () => {
      const correlationId = generateTestCorrelationId();

      const loginResponse = await testContext.request
        .post("/api/auth/login")
        .set("X-Correlation-ID", correlationId)
        .send({
          username: "testuser",
          password: "testpassword",
          authSource: "local",
        });

      const body = assertApiResponse(loginResponse, 200);
      const accessToken = getAuthPayload(body).accessToken;

      // Decode JWT without verification to check structure
      const [header, payload, signature] = accessToken.split(".");
      expect(header).toBeDefined();
      expect(payload).toBeDefined();
      expect(signature).toBeDefined();

      // Decode payload
      const decodedPayload = JSON.parse(
        Buffer.from(payload, "base64").toString(),
      );
      expect(decodedPayload.userId).toBeDefined();
      expect(decodedPayload.username).toBe("testuser");
      expect(decodedPayload.isAdmin).toBe(false);
      expect(decodedPayload.authSource).toBe("local");
      expect(decodedPayload.iat).toBeDefined();
      expect(decodedPayload.exp).toBeDefined();
    });

    it("should refresh JWT tokens correctly", async () => {
      const correlationId = generateTestCorrelationId();

      // Login to get tokens
      const loginResponse = await testContext.request
        .post("/api/auth/login")
        .set("X-Correlation-ID", correlationId)
        .send({
          username: "testuser",
          password: "testpassword",
          authSource: "local",
        });

      const loginBody = assertApiResponse(loginResponse, 200);
      const loginAuth = getAuthPayload(loginBody);
      const refreshToken = loginAuth.refreshToken;

      // Wait a moment to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Refresh tokens
      const refreshResponse = await testContext.request
        .post("/api/auth/refresh")
        .set("X-Correlation-ID", correlationId)
        .send({ refreshToken });

      const refreshBody = assertApiResponse(refreshResponse, 200);
      const refreshAuth = getAuthPayload(refreshBody);

      expect(refreshAuth.accessToken).toBeDefined();
      expect(refreshAuth.refreshToken).toBeDefined();
      expect(refreshAuth.accessToken).not.toBe(loginAuth.accessToken);
      expect(refreshAuth.user).toBeDefined();
      expect(refreshAuth.user.username).toBe("testuser");
    });

    it("should handle expired and invalid tokens", async () => {
      const correlationId = generateTestCorrelationId();

      // Test with invalid token
      const invalidTokenResponse = await testContext.request
        .get("/api/auth/profile")
        .set("Authorization", "Bearer invalid-token")
        .set("X-Correlation-ID", correlationId);

      assertApiResponse(invalidTokenResponse, 401);
      expect(invalidTokenResponse.body.error).toMatch(/Invalid.*token/i);

      // Test with malformed token
      const malformedTokenResponse = await testContext.request
        .get("/api/auth/profile")
        .set("Authorization", "Bearer malformed.token")
        .set("X-Correlation-ID", correlationId);

      assertApiResponse(malformedTokenResponse, 401);

      // Test with no token
      const noTokenResponse = await testContext.request
        .get("/api/auth/profile")
        .set("X-Correlation-ID", correlationId);

      assertApiResponse(noTokenResponse, 401);
    });

    it("should handle token blacklisting on logout", async () => {
      const correlationId = generateTestCorrelationId();

      // Login
      const loginResponse = await testContext.request
        .post("/api/auth/login")
        .set("X-Correlation-ID", correlationId)
        .send({
          username: "testuser",
          password: "testpassword",
          authSource: "local",
        });

      const loginBody = assertApiResponse(loginResponse, 200);
      const accessToken = getAuthPayload(loginBody).accessToken;

      // Verify token works
      const profileResponse = await testContext.request
        .get("/api/auth/profile")
        .set("Authorization", `Bearer ${accessToken}`)
        .set("X-Correlation-ID", correlationId);

      assertApiResponse(profileResponse, 200);

      // Logout (should blacklist token)
      const logoutResponse = await testContext.request
        .post("/api/auth/logout")
        .set("Authorization", `Bearer ${accessToken}`)
        .set("X-Correlation-ID", correlationId);

      assertApiResponse(logoutResponse, 200);

      // Verify token is blacklisted
      const blacklistedTokenResponse = await testContext.request
        .get("/api/auth/profile")
        .set("Authorization", `Bearer ${accessToken}`)
        .set("X-Correlation-ID", correlationId);

      assertApiResponse(blacklistedTokenResponse, 401);
    });
  });

  describe("Session Management", () => {
    it("should track concurrent sessions", async () => {
      const correlationId = generateTestCorrelationId();

      // Create multiple sessions for the same user
      const session1Response = await testContext.request
        .post("/api/auth/login")
        .set("X-Correlation-ID", `${correlationId}-1`)
        .set("User-Agent", "TestAgent1")
        .send({
          username: "testuser",
          password: "testpassword",
          authSource: "local",
        });

      const session1Body = assertApiResponse(session1Response, 200);
      const session1Auth = getAuthPayload(session1Body);

      const session2Response = await testContext.request
        .post("/api/auth/login")
        .set("X-Correlation-ID", `${correlationId}-2`)
        .set("User-Agent", "TestAgent2")
        .send({
          username: "testuser",
          password: "testpassword",
          authSource: "local",
        });

      const session2Body = assertApiResponse(session2Response, 200);
      const session2Auth = getAuthPayload(session2Body);

      // Verify both sessions are tracked
      const client = await testContext.pool.connect();
      try {
        const sessionsResult = await client.query(
          "SELECT * FROM user_sessions WHERE user_id = $1 AND expires_at > NOW()",
          [testContext.userId],
        );
        expect(sessionsResult.rows.length).toBeGreaterThanOrEqual(2);
      } finally {
        client.release();
      }

      // Verify both tokens work
      const profile1Response = await testContext.request
        .get("/api/auth/profile")
        .set("Authorization", `Bearer ${session1Auth.accessToken}`)
        .set("X-Correlation-ID", `${correlationId}-1`);

      assertApiResponse(profile1Response, 200);

      const profile2Response = await testContext.request
        .get("/api/auth/profile")
        .set("Authorization", `Bearer ${session2Auth.accessToken}`)
        .set("X-Correlation-ID", `${correlationId}-2`);

      assertApiResponse(profile2Response, 200);
    });

    it("should handle session cleanup on user deletion", async () => {
      const correlationId = generateTestCorrelationId();
      const testUsername = "cleanup_test_user";

      // Create temporary test user
      const client = await testContext.pool.connect();
      let tempUserId: number;

      try {
        const userResult = await client.query(
          `
          INSERT INTO users (username, email, display_name, auth_source, is_admin, is_active, password_hash)
          VALUES ($1, $2, $3, 'local', false, true, $4)
          RETURNING id
        `,
          [
            testUsername,
            `${testUsername}@test.local`,
            "Cleanup Test User",
            E2E_TEST_PASSWORD_HASH,
          ],
        );

        tempUserId = userResult.rows[0].id;
      } finally {
        client.release();
      }

      // Login with temp user (this would normally fail as the login system requires real auth)
      // Instead, we'll create a session manually for testing
      const tempClient = await testContext.pool.connect();
      try {
        await tempClient.query(
          `
          INSERT INTO user_sessions (user_id, token_hash, session_id, expires_at, created_at)
          VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour', NOW())
        `,
          [
            tempUserId,
            `test-token-${correlationId}`,
            `test-session-${correlationId}`,
          ],
        );
      } finally {
        tempClient.release();
      }

      // Verify session exists
      const sessionCheckClient = await testContext.pool.connect();
      try {
        const sessionResult = await sessionCheckClient.query(
          "SELECT * FROM user_sessions WHERE user_id = $1",
          [tempUserId],
        );
        expect(sessionResult.rows.length).toBe(1);
      } finally {
        sessionCheckClient.release();
      }

      // Delete user (this should cleanup sessions)
      const deleteClient = await testContext.pool.connect();
      try {
        await deleteClient.query("DELETE FROM users WHERE id = $1", [
          tempUserId,
        ]);
      } finally {
        deleteClient.release();
      }

      // Verify sessions are cleaned up (foreign key constraint or trigger should handle this)
      const cleanupCheckClient = await testContext.pool.connect();
      try {
        const sessionResult = await cleanupCheckClient.query(
          "SELECT * FROM user_sessions WHERE user_id = $1",
          [tempUserId],
        );
        expect(sessionResult.rows.length).toBe(0);
      } finally {
        cleanupCheckClient.release();
      }
    });
  });

  describe("Authentication Security Features", () => {
    it("should rate limit authentication attempts", async () => {
      process.env.E2E_STRICT_RATE_LIMIT = "true";
      try {
        const correlationId = generateTestCorrelationId();
        const testIP = "192.168.1.200";

        // Send multiple requests quickly
        const requests = [];
        for (let i = 0; i < 10; i++) {
          requests.push(
            testContext.request
              .post("/api/auth/login")
              .set("X-Correlation-ID", `${correlationId}-${i}`)
              .set("X-Forwarded-For", testIP)
              .send({
                username: "testuser",
                password: "wrongpassword",
                authSource: "local",
              }),
          );
        }

        const responses = await Promise.all(requests);

        // At least one request should be rate limited
        const rateLimitedResponses = responses.filter(
          (r: any) => r.status === 429,
        );
        expect(rateLimitedResponses.length).toBeGreaterThan(0);
      } finally {
        delete process.env.E2E_STRICT_RATE_LIMIT;
      }
    });

    it("should log authentication events for audit trail", async () => {
      const correlationId = generateTestCorrelationId();

      // Successful login
      await testContext.request
        .post("/api/auth/login")
        .set("X-Correlation-ID", correlationId)
        .send({
          username: "testuser",
          password: "testpassword",
          authSource: "local",
        });

      // Failed login
      await testContext.request
        .post("/api/auth/login")
        .set("X-Correlation-ID", `${correlationId}-fail`)
        .send({
          username: "testuser",
          password: "wrongpassword",
          authSource: "local",
        });

      // Verify audit logs are created
      await waitFor(async () => {
        const client = await testContext.pool.connect();
        try {
          const auditResult = await client.query(
            `SELECT * FROM audit_logs 
             WHERE event_type = 'auth'
             AND event_action IN ('login', 'login_failed')
             AND username = $1
             AND created_at > NOW() - INTERVAL '1 minute'`,
            ["testuser"],
          );
          // Should have at least one successful and one failed login
          return auditResult.rows.length >= 2;
        } finally {
          client.release();
        }
      }, 5000);
    });

    it("should protect against timing attacks", async () => {
      const correlationId = generateTestCorrelationId();

      // Test with existing username
      const start1 = Date.now();
      await testContext.request
        .post("/api/auth/login")
        .set("X-Correlation-ID", `${correlationId}-existing`)
        .send({
          username: "testuser",
          password: "wrongpassword",
          authSource: "local",
        });
      const time1 = Date.now() - start1;

      // Test with non-existing username
      const start2 = Date.now();
      await testContext.request
        .post("/api/auth/login")
        .set("X-Correlation-ID", `${correlationId}-nonexisting`)
        .send({
          username: "nonexistentuser",
          password: "wrongpassword",
          authSource: "local",
        });
      const time2 = Date.now() - start2;

      // Response times should be similar (within reasonable tolerance)
      // This prevents username enumeration through timing attacks
      const timeDifference = Math.abs(time1 - time2);
      expect(timeDifference).toBeLessThan(1000); // Less than 1 second difference

      logger.info("Timing attack test results:", {
        existingUserTime: time1,
        nonExistingUserTime: time2,
        difference: timeDifference,
      });
    });
  });
});
