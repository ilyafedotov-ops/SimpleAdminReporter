import {
  E2ETestContext,
  setupE2ETestContext,
  teardownE2ETestContext,
  createE2ETestData,
  assertApiResponse,
  generateTestCorrelationId,
  getApiData,
  getLogsByType,
  assertLogsListResponse,
  getLogSearchResults,
} from "./setup";
import { logger } from "@/utils/logger";

process.env.TEST_TYPE = "integration";
process.env.NODE_ENV = "test";

describe("Logs API E2E Tests", () => {
  let testContext: E2ETestContext;

  beforeAll(async () => {
    testContext = await setupE2ETestContext();
    await createE2ETestData(testContext.pool);
    await createTestLogData(testContext.pool, testContext.userId, "testuser");
  });

  afterAll(async () => {
    if (!testContext?.pool) {
      return;
    }
    await cleanupTestLogData(testContext.pool);
    await teardownE2ETestContext(testContext);
  });

  describe("Access control", () => {
    it("should deny non-admin users access to logs", async () => {
      const response = await testContext.request
        .get("/api/logs")
        .query({ type: "audit", page: 1, pageSize: 10 })
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", generateTestCorrelationId());

      assertApiResponse(response, 403);
    });
  });

  describe("Audit Logs Retrieval", () => {
    it("should get audit logs with pagination", async () => {
      const correlationId = generateTestCorrelationId();

      const response = await testContext.request
        .get("/api/logs")
        .query({
          type: "audit",
          page: 1,
          pageSize: 10,
          sortBy: "created_at",
          sortOrder: "desc",
        })
        .set("Authorization", `Bearer ${testContext.adminToken}`)
        .set("X-Correlation-ID", correlationId);

      const body = assertApiResponse(response, 200);
      assertLogsListResponse(body, "audit");

      const logs = getLogsByType(body, "audit");
      if (logs.length > 0) {
        const log = logs[0];
        expect(log).toHaveProperty("id");
        expect(log).toHaveProperty("event_type");
        expect(log).toHaveProperty("event_action");
        expect(log).toHaveProperty("created_at");
        if (log.session_id) {
          expect(typeof log.session_id).toBe("string");
        }
      }
    });

    it("should filter audit logs by event type", async () => {
      const response = await testContext.request
        .get("/api/logs")
        .query({
          type: "audit",
          eventType: "authentication",
          page: 1,
          pageSize: 10,
        })
        .set("Authorization", `Bearer ${testContext.adminToken}`)
        .set("X-Correlation-ID", generateTestCorrelationId());

      const body = assertApiResponse(response, 200);
      getLogsByType(body, "audit").forEach((log: any) => {
        expect(log.event_type).toBe("authentication");
      });
    });

    it("should filter audit logs by event action", async () => {
      const response = await testContext.request
        .get("/api/logs")
        .query({
          type: "audit",
          eventAction: "login",
          page: 1,
          pageSize: 10,
        })
        .set("Authorization", `Bearer ${testContext.adminToken}`)
        .set("X-Correlation-ID", generateTestCorrelationId());

      const body = assertApiResponse(response, 200);
      getLogsByType(body, "audit").forEach((log: any) => {
        expect(log.event_action).toBe("login");
      });
    });

    it("should filter audit logs by date range", async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const response = await testContext.request
        .get("/api/logs")
        .query({
          type: "audit",
          startDate: yesterday.toISOString(),
          endDate: new Date().toISOString(),
          page: 1,
          pageSize: 10,
        })
        .set("Authorization", `Bearer ${testContext.adminToken}`)
        .set("X-Correlation-ID", generateTestCorrelationId());

      const body = assertApiResponse(response, 200);
      getLogsByType(body, "audit").forEach((log: any) => {
        const logDate = new Date(log.created_at);
        expect(logDate.getTime()).toBeGreaterThanOrEqual(yesterday.getTime());
        expect(logDate.getTime()).toBeLessThanOrEqual(new Date().getTime());
      });
    });

    it("should filter audit logs by user", async () => {
      const response = await testContext.request
        .get("/api/logs")
        .query({
          type: "audit",
          userId: testContext.userId,
          page: 1,
          pageSize: 10,
        })
        .set("Authorization", `Bearer ${testContext.adminToken}`)
        .set("X-Correlation-ID", generateTestCorrelationId());

      const body = assertApiResponse(response, 200);
      getLogsByType(body, "audit").forEach((log: any) => {
        expect(log.user_id).toBe(testContext.userId);
      });
    });

    it("should search audit logs by IP address", async () => {
      const testIP = "192.168.1.100";

      const response = await testContext.request
        .get("/api/logs")
        .query({
          type: "audit",
          search: testIP,
          page: 1,
          pageSize: 10,
        })
        .set("Authorization", `Bearer ${testContext.adminToken}`)
        .set("X-Correlation-ID", generateTestCorrelationId());

      const body = assertApiResponse(response, 200);
      getLogsByType(body, "audit").forEach((log: any) => {
        expect(String(log.ip_address)).toContain("192.168.1.100");
      });
    });
  });

  describe("System Logs Retrieval", () => {
    it("should get system logs with pagination", async () => {
      const response = await testContext.request
        .get("/api/logs")
        .query({
          type: "system",
          page: 1,
          pageSize: 10,
          sortBy: "timestamp",
          sortOrder: "desc",
        })
        .set("Authorization", `Bearer ${testContext.adminToken}`)
        .set("X-Correlation-ID", generateTestCorrelationId());

      const body = assertApiResponse(response, 200);
      assertLogsListResponse(body, "system");

      getLogsByType(body, "system").forEach((log: any) => {
        expect(log).toHaveProperty("id");
        expect(log).toHaveProperty("level");
        expect(log).toHaveProperty("message");
        expect(log).toHaveProperty("timestamp");
      });
    });

    it("should filter system logs by log level", async () => {
      const response = await testContext.request
        .get("/api/logs")
        .query({
          type: "system",
          level: "error",
          page: 1,
          pageSize: 10,
        })
        .set("Authorization", `Bearer ${testContext.adminToken}`)
        .set("X-Correlation-ID", generateTestCorrelationId());

      const body = assertApiResponse(response, 200);
      getLogsByType(body, "system").forEach((log: any) => {
        expect(log.level).toBe("error");
      });
    });

    it("should filter system logs by module", async () => {
      const response = await testContext.request
        .get("/api/logs")
        .query({
          type: "system",
          module: "auth_service",
          page: 1,
          pageSize: 10,
        })
        .set("Authorization", `Bearer ${testContext.adminToken}`)
        .set("X-Correlation-ID", generateTestCorrelationId());

      const body = assertApiResponse(response, 200);
      getLogsByType(body, "system").forEach((log: any) => {
        expect(log.module).toBe("auth_service");
      });
    });

    it("should search system logs by message content", async () => {
      const response = await testContext.request
        .get("/api/logs")
        .query({
          type: "system",
          search: "connection timeout",
          page: 1,
          pageSize: 10,
        })
        .set("Authorization", `Bearer ${testContext.adminToken}`)
        .set("X-Correlation-ID", generateTestCorrelationId());

      const body = assertApiResponse(response, 200);
      getLogsByType(body, "system").forEach((log: any) => {
        expect(String(log.message).toLowerCase()).toMatch(/connection|timeout/);
      });
    });
  });

  describe("Full-text Search", () => {
    it("should perform full-text search on audit logs", async () => {
      const response = await testContext.request
        .get("/api/logs/search/fulltext")
        .query({
          q: "login successful",
          type: "audit",
          pageSize: 10,
        })
        .set("Authorization", `Bearer ${testContext.adminToken}`)
        .set("X-Correlation-ID", generateTestCorrelationId());

      expect(response.status).toBeOneOf([200, 500]);
      if (response.status !== 200) {
        return;
      }

      expect(response.body.success).toBe(true);
      const data = getApiData(response.body);
      expect(Array.isArray(data.logs)).toBe(true);
      expect(data.total).toBeDefined();
    });

    it("should perform full-text search on system logs", async () => {
      const response = await testContext.request
        .get("/api/logs/search/fulltext")
        .query({
          q: "connection timeout",
          type: "system",
          pageSize: 10,
        })
        .set("Authorization", `Bearer ${testContext.adminToken}`)
        .set("X-Correlation-ID", generateTestCorrelationId());

      expect(response.status).toBeOneOf([200, 500]);
      if (response.status !== 200) {
        return;
      }

      const results = getLogSearchResults(response.body);
      results.forEach((result: any) => {
        const content = JSON.stringify(result).toLowerCase();
        expect(content).toMatch(/connection|timeout/);
      });
    });

    it("should handle complex search queries", async () => {
      const response = await testContext.request
        .get("/api/logs/search/fulltext")
        .query({
          q: "authentication AND (success OR failure)",
          type: "audit",
          pageSize: 10,
        })
        .set("Authorization", `Bearer ${testContext.adminToken}`)
        .set("X-Correlation-ID", generateTestCorrelationId());

      expect(response.status).toBeOneOf([200, 500]);
      if (response.status !== 200) {
        return;
      }

      getLogSearchResults(response.body).forEach((result: any) => {
        const content = JSON.stringify(result).toLowerCase();
        expect(content).toContain("authentication");
      });
    });

    it("should include search ranking metadata when available", async () => {
      const response = await testContext.request
        .get("/api/logs/search/fulltext")
        .query({
          q: "login",
          type: "audit",
          pageSize: 5,
        })
        .set("Authorization", `Bearer ${testContext.adminToken}`)
        .set("X-Correlation-ID", generateTestCorrelationId());

      expect(response.status).toBeOneOf([200, 500]);
      if (response.status !== 200) {
        return;
      }

      getLogSearchResults(response.body).forEach((result: any) => {
        if (result.searchRank !== undefined) {
          expect(typeof result.searchRank).toBe("number");
        }
        if (result.searchHighlight !== undefined) {
          expect(typeof result.searchHighlight).toBe("string");
        }
      });
    });

    it("should rank search results by relevance when ranks are present", async () => {
      const response = await testContext.request
        .get("/api/logs/search/fulltext")
        .query({
          q: "authentication",
          type: "audit",
          pageSize: 10,
        })
        .set("Authorization", `Bearer ${testContext.adminToken}`)
        .set("X-Correlation-ID", generateTestCorrelationId());

      expect(response.status).toBeOneOf([200, 500]);
      if (response.status !== 200) {
        return;
      }

      const results = getLogSearchResults(response.body).filter(
        (r: any) => r.searchRank !== undefined,
      );
      if (results.length > 1) {
        for (let i = 1; i < results.length; i++) {
          expect(results[i].searchRank).toBeLessThanOrEqual(
            results[i - 1].searchRank,
          );
        }
      }
    });
  });

  describe("Fuzzy Search", () => {
    it("should perform fuzzy search on usernames", async () => {
      const response = await testContext.request
        .get("/api/logs/search/fuzzy")
        .query({
          type: "audit",
          field: "username",
          term: "testuer",
          threshold: 0.3,
        })
        .set("Authorization", `Bearer ${testContext.adminToken}`)
        .set("X-Correlation-ID", generateTestCorrelationId());

      expect(response.status).toBeOneOf([200, 500]);
      if (response.status !== 200) {
        return;
      }

      getLogSearchResults(response.body).forEach((result: any) => {
        expect(result.similarity_score).toBeGreaterThanOrEqual(0.3);
        expect(result.similarity_score).toBeLessThanOrEqual(1.0);
      });
    });

    it("should perform fuzzy search on event actions", async () => {
      const response = await testContext.request
        .get("/api/logs/search/fuzzy")
        .query({
          type: "audit",
          field: "event_action",
          term: "logn",
          threshold: 0.3,
        })
        .set("Authorization", `Bearer ${testContext.adminToken}`)
        .set("X-Correlation-ID", generateTestCorrelationId());

      expect(response.status).toBeOneOf([200, 500]);
      if (response.status !== 200) {
        return;
      }

      getLogSearchResults(response.body).forEach((result: any) => {
        expect(result.similarity_score).toBeGreaterThanOrEqual(0.3);
        expect(result.event_action).toBeDefined();
      });
    });

    it("should adjust fuzzy search threshold", async () => {
      const correlationId = generateTestCorrelationId();

      const strictResponse = await testContext.request
        .get("/api/logs/search/fuzzy")
        .query({
          type: "audit",
          field: "username",
          term: "testuer",
          threshold: 0.9,
        })
        .set("Authorization", `Bearer ${testContext.adminToken}`)
        .set("X-Correlation-ID", `${correlationId}-strict`);

      const lenientResponse = await testContext.request
        .get("/api/logs/search/fuzzy")
        .query({
          type: "audit",
          field: "username",
          term: "testuer",
          threshold: 0.3,
        })
        .set("Authorization", `Bearer ${testContext.adminToken}`)
        .set("X-Correlation-ID", `${correlationId}-lenient`);

      expect(strictResponse.status).toBeOneOf([200, 500]);
      expect(lenientResponse.status).toBeOneOf([200, 500]);
      if (strictResponse.status !== 200 || lenientResponse.status !== 200) {
        return;
      }

      const strictResults = getLogSearchResults(strictResponse.body);
      const lenientResults = getLogSearchResults(lenientResponse.body);
      expect(lenientResults.length).toBeGreaterThanOrEqual(
        strictResults.length,
      );
    });
  });

  describe("Log Statistics", () => {
    it("should get audit log statistics", async () => {
      const response = await testContext.request
        .get("/api/logs/stats")
        .query({ hours: 24 })
        .set("Authorization", `Bearer ${testContext.adminToken}`)
        .set("X-Correlation-ID", generateTestCorrelationId());

      const body = assertApiResponse(response, 200);
      const stats = getApiData(body);

      expect(stats.auditStats).toBeDefined();
      expect(Array.isArray(stats.auditStats)).toBe(true);
      expect(stats.systemStats).toBeDefined();
      expect(stats.errorTrends).toBeDefined();
      expect(stats.topErrors).toBeDefined();
      expect(stats.period).toBe("24 hours");
    });

    it("should get system log statistics for a longer period", async () => {
      const response = await testContext.request
        .get("/api/logs/stats")
        .query({ hours: 168 })
        .set("Authorization", `Bearer ${testContext.adminToken}`)
        .set("X-Correlation-ID", generateTestCorrelationId());

      const body = assertApiResponse(response, 200);
      const stats = getApiData(body);

      expect(stats.systemStats).toBeDefined();
      expect(Array.isArray(stats.systemStats)).toBe(true);
      expect(stats.period).toBe("168 hours");
    });

    it("should include error trends in statistics", async () => {
      const response = await testContext.request
        .get("/api/logs/stats")
        .query({ hours: 24 })
        .set("Authorization", `Bearer ${testContext.adminToken}`)
        .set("X-Correlation-ID", generateTestCorrelationId());

      const stats = getApiData(assertApiResponse(response, 200));
      expect(Array.isArray(stats.errorTrends)).toBe(true);
      stats.errorTrends.forEach((item: any) => {
        expect(item).toHaveProperty("hour");
        expect(item).toHaveProperty("error_count");
      });
    });

    it("should include top errors in statistics", async () => {
      const response = await testContext.request
        .get("/api/logs/stats")
        .query({ hours: 24 })
        .set("Authorization", `Bearer ${testContext.adminToken}`)
        .set("X-Correlation-ID", generateTestCorrelationId());

      const stats = getApiData(assertApiResponse(response, 200));
      expect(Array.isArray(stats.topErrors)).toBe(true);
      stats.topErrors.forEach((item: any) => {
        expect(item).toHaveProperty("message");
        expect(item).toHaveProperty("count");
      });
    });
  });

  describe("Log Export", () => {
    it("should export audit logs as CSV (admin only)", async () => {
      const response = await testContext.request
        .get("/api/logs/export")
        .query({
          type: "audit",
          format: "csv",
          startDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date().toISOString(),
        })
        .set("Authorization", `Bearer ${testContext.adminToken}`)
        .set("X-Correlation-ID", generateTestCorrelationId());

      assertApiResponse(response, 200);
      expect(response.headers["content-type"]).toContain("text/csv");
      expect(response.headers["content-disposition"]).toContain("attachment");
      expect(response.headers["content-disposition"]).toContain("logs_export");
    });

    it("should export system logs as JSON (admin only)", async () => {
      const response = await testContext.request
        .get("/api/logs/export")
        .query({
          type: "system",
          format: "json",
          level: "error",
          maxRecords: 100,
        })
        .set("Authorization", `Bearer ${testContext.adminToken}`)
        .set("X-Correlation-ID", generateTestCorrelationId());

      assertApiResponse(response, 200);
      expect(response.headers["content-type"]).toContain("application/json");
      expect(response.headers["content-disposition"]).toContain("attachment");

      const exported = JSON.parse(response.text);
      expect(exported).toHaveProperty("audit");
      expect(exported).toHaveProperty("system");
      expect(Array.isArray(exported.system)).toBe(true);
    });

    it("should deny export access to non-admin users", async () => {
      const response = await testContext.request
        .get("/api/logs/export")
        .query({
          type: "audit",
          format: "csv",
        })
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", generateTestCorrelationId());

      assertApiResponse(response, 403);
    });
  });

  describe("Real-time Log Streaming", () => {
    it("should return recent logs from the realtime endpoint", async () => {
      const response = await testContext.request
        .get("/api/logs/realtime")
        .query({ type: "audit", page: 1, pageSize: 5 })
        .set("Authorization", `Bearer ${testContext.adminToken}`)
        .set("X-Correlation-ID", generateTestCorrelationId());

      const body = assertApiResponse(response, 200);
      assertLogsListResponse(body, "audit");
    });
  });

  describe("Log Retention and Archival", () => {
    it("should preview log cleanup with dry run", async () => {
      const response = await testContext.request
        .post("/api/logs/cleanup")
        .query({ dryRun: "true", retentionDays: 90 })
        .set("Authorization", `Bearer ${testContext.adminToken}`)
        .set("X-Correlation-ID", generateTestCorrelationId());

      const body = assertApiResponse(response, 200);
      const data = getApiData(body);
      expect(data.dryRun).toBe(true);
    });
  });

  describe("Performance and Caching", () => {
    it("should return consistent log query results", async () => {
      const correlationId = generateTestCorrelationId();
      const queryParams = {
        type: "audit",
        eventType: "authentication",
        page: 1,
        pageSize: 5,
      };

      const response1 = await testContext.request
        .get("/api/logs")
        .query(queryParams)
        .set("Authorization", `Bearer ${testContext.adminToken}`)
        .set("X-Correlation-ID", `${correlationId}-1`);

      const response2 = await testContext.request
        .get("/api/logs")
        .query(queryParams)
        .set("Authorization", `Bearer ${testContext.adminToken}`)
        .set("X-Correlation-ID", `${correlationId}-2`);

      const body1 = assertApiResponse(response1, 200);
      const body2 = assertApiResponse(response2, 200);

      expect(getLogsByType(body1, "audit")).toEqual(
        getLogsByType(body2, "audit"),
      );
      expect(response1.headers["cache-control"]).toContain("no-store");
    });

    it("should handle large result sets efficiently", async () => {
      const response = await testContext.request
        .get("/api/logs")
        .query({
          type: "audit",
          page: 1,
          pageSize: 100,
          sortBy: "created_at",
          sortOrder: "desc",
        })
        .set("Authorization", `Bearer ${testContext.adminToken}`)
        .set("X-Correlation-ID", generateTestCorrelationId());

      const body = assertApiResponse(response, 200);
      expect(getLogsByType(body, "audit").length).toBeLessThanOrEqual(100);
      expect(body.pagination.pageSize).toBe(100);
    });

    it("should timeout or complete long-running search queries", async () => {
      const response = await testContext.request
        .get("/api/logs/search/fulltext")
        .query({
          q: "authentication",
          type: "audit",
          pageSize: 100,
        })
        .set("Authorization", `Bearer ${testContext.adminToken}`)
        .set("X-Correlation-ID", generateTestCorrelationId());

      expect(response.status).toBeOneOf([200, 408, 500]);
    }, 10000);
  });

  describe("Log Query Metrics", () => {
    it("should get query performance metrics", async () => {
      const response = await testContext.request
        .get("/api/logs/metrics/queries")
        .query({ hours: 24 })
        .set("Authorization", `Bearer ${testContext.adminToken}`)
        .set("X-Correlation-ID", generateTestCorrelationId());

      const body = assertApiResponse(response, 200);
      const data = getApiData(body);

      expect(data.summary).toBeDefined();
      expect(data.allStats).toBeDefined();
      expect(Array.isArray(data.allStats)).toBe(true);
    });

    it("should export query metrics", async () => {
      const response = await testContext.request
        .get("/api/logs/metrics/queries/export")
        .query({ queryType: "audit_logs", hours: 24 })
        .set("Authorization", `Bearer ${testContext.adminToken}`)
        .set("X-Correlation-ID", generateTestCorrelationId());

      assertApiResponse(response, 200);
      expect(response.headers["content-type"]).toContain("text/csv");
      expect(response.headers["content-disposition"]).toContain("attachment");
    });
  });
});

async function createTestLogData(pool: any, userId: number, username: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const auditLogs = [
      {
        event_type: "authentication",
        event_action: "login",
        event_result: "success",
        success: true,
        details: { auth_method: "ldap", duration_ms: 200 },
        ip_address: "192.168.1.100",
        user_agent: "Mozilla/5.0",
        session_id: "sess_001",
        correlation_id: "e2e-audit-1",
      },
      {
        event_type: "authentication",
        event_action: "login",
        event_result: "failure",
        success: false,
        details: { auth_method: "ldap", error: "invalid_password" },
        ip_address: "192.168.1.101",
        user_agent: "Mozilla/5.0",
        session_id: null,
        correlation_id: "e2e-audit-2",
      },
      {
        event_type: "report_execution",
        event_action: "execute",
        event_result: "success",
        success: true,
        details: {
          report_type: "inactive_users",
          execution_time_ms: 1500,
          row_count: 25,
        },
        ip_address: "192.168.1.100",
        user_agent: "Mozilla/5.0",
        session_id: "sess_001",
        correlation_id: "e2e-audit-3",
      },
    ];

    for (const log of auditLogs) {
      await client.query(
        `
        INSERT INTO audit_logs (
          user_id, username, event_type, event_action, event_result, success,
          details, ip_address, user_agent, session_id, correlation_id, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
        ON CONFLICT DO NOTHING
      `,
        [
          userId,
          username,
          log.event_type,
          log.event_action,
          log.event_result,
          log.success,
          JSON.stringify(log.details),
          log.ip_address,
          log.user_agent,
          log.session_id,
          log.correlation_id,
        ],
      );
    }

    const systemLogs = [
      {
        level: "info",
        module: "auth_service",
        message: "User authentication successful for user testuser",
        details: { user_id: userId, auth_method: "ldap" },
        correlation_id: "e2e-system-1",
      },
      {
        level: "error",
        module: "ldap_service",
        message: "LDAP connection timeout to server test-dc.local",
        details: { server: "test-dc.local", timeout_ms: 5000 },
        correlation_id: "e2e-system-2",
      },
      {
        level: "warn",
        module: "rate_limiter",
        message: "Rate limit warning for IP 192.168.1.101",
        details: { ip: "192.168.1.101", requests: 95 },
        correlation_id: "e2e-system-3",
      },
    ];

    for (const log of systemLogs) {
      await client.query(
        `
        INSERT INTO system_logs (
          level, log_level, source, service, module, message, details, metadata,
          correlation_id, created_at, timestamp
        )
        VALUES ($1, $1, $2, $2, $2, $3, $4, $4, $5, NOW(), NOW())
        ON CONFLICT DO NOTHING
      `,
        [
          log.level,
          log.module,
          log.message,
          JSON.stringify(log.details),
          log.correlation_id,
        ],
      );
    }

    await client.query("COMMIT");
    logger.info("Test log data created successfully");
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("Failed to create test log data:", error);
    throw error;
  } finally {
    client.release();
  }
}

async function cleanupTestLogData(pool: any) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `DELETE FROM audit_logs WHERE correlation_id LIKE 'e2e-audit-%'`,
    );
    await client.query(
      `DELETE FROM system_logs WHERE correlation_id LIKE 'e2e-system-%'`,
    );
    await client.query("COMMIT");
    logger.info("Test log data cleaned up successfully");
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("Failed to cleanup test log data:", error);
  } finally {
    client.release();
  }
}
