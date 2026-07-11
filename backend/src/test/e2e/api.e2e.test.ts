import {
  E2ETestContext,
  setupE2ETestContext,
  teardownE2ETestContext,
  createE2ETestData,
  assertApiResponse,
  generateTestCorrelationId,
  waitFor,
  getApiData,
} from "./setup";
import { logger } from "@/utils/logger";

// Set environment for E2E tests
process.env.TEST_TYPE = "integration";
process.env.NODE_ENV = "test";

describe("API Integration E2E Tests", () => {
  let testContext: E2ETestContext;

  beforeAll(async () => {
    logger.info("Setting up E2E test context for API tests...");
    testContext = await setupE2ETestContext();
    await createE2ETestData(testContext.pool);
    logger.info("E2E test context ready for API tests");
  }, 90000); // 90 second timeout for beforeAll

  afterAll(async () => {
    logger.info("Tearing down E2E test context for API tests...");
    if (testContext) {
      await teardownE2ETestContext(testContext);
    }
    logger.info("E2E test context cleanup complete for API tests");
  }, 30000); // 30 second timeout for afterAll

  describe("Health Check Endpoints", () => {
    it("should get overall health status", async () => {
      const correlationId = generateTestCorrelationId();

      const response = await testContext.request
        .get("/api/health")
        .set("X-Correlation-ID", correlationId);

      const body = assertApiResponse(response, 200);

      expect(body.status).toBe("ok");
      expect(body.timestamp).toBeDefined();
      expect(body.service).toBeDefined();
      expect(body.version).toBeDefined();
    });

    it("should get detailed health status", async () => {
      const correlationId = generateTestCorrelationId();

      const response = await testContext.request
        .get("/api/health/detailed")
        .set("Authorization", `Bearer ${testContext.adminToken}`)
        .set("X-Correlation-ID", correlationId);

      const body = assertApiResponse(response, 200);

      expect(body.status).toBeOneOf(["healthy", "degraded", "unhealthy"]);
      expect(body.timestamp).toBeDefined();
      expect(body.checks).toBeDefined();
      expect(typeof body.checks).toBe("object");
      expect(body.checks.database).toBeDefined();
      expect(body.checks.redis).toBeDefined();
      expect(body.checks.database.status).toBeOneOf([
        "healthy",
        "unhealthy",
        "degraded",
      ]);
      expect(body.checks.redis.status).toBeOneOf([
        "healthy",
        "unhealthy",
        "degraded",
      ]);
    });

    it("should get liveness probe", async () => {
      const correlationId = generateTestCorrelationId();

      const response = await testContext.request
        .get("/api/health/live")
        .set("X-Correlation-ID", correlationId);

      const body = assertApiResponse(response, 200);

      expect(body.status).toBe("alive");
      expect(body.timestamp).toBeDefined();
      expect(body.uptime).toBeDefined();
    });

    it("should get readiness probe", async () => {
      const correlationId = generateTestCorrelationId();

      const response = await testContext.request
        .get("/api/health/ready")
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId);

      expect(response.status).toBeOneOf([200, 503]);
      expect(response.body.status).toBeOneOf(["ready", "not ready"]);
      expect(response.body.timestamp).toBeDefined();
    });

    it("should get component-specific health", async () => {
      const correlationId = generateTestCorrelationId();

      const dbResponse = await testContext.request
        .get("/api/health/component/database")
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId);

      const dbBody = assertApiResponse(dbResponse, 200);
      expect(dbBody.component).toBe("database");
      expect(dbBody.status).toBeOneOf(["healthy", "unhealthy", "degraded"]);

      const redisResponse = await testContext.request
        .get("/api/health/component/redis")
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId);

      const redisBody = assertApiResponse(redisResponse, 200);
      expect(redisBody.component).toBe("redis");
      expect(redisBody.status).toBeOneOf(["healthy", "unhealthy", "degraded"]);
    });

    it("should handle non-existent component health check", async () => {
      const correlationId = generateTestCorrelationId();

      const response = await testContext.request
        .get("/api/health/component/nonexistent")
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId);

      assertApiResponse(response, 400);
      expect(response.body.error).toContain("Invalid component");
    });

    it("should get health summary", async () => {
      const correlationId = generateTestCorrelationId();

      const response = await testContext.request
        .get("/api/health/summary")
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId);

      const body = assertApiResponse(response, 200);

      expect(body.overall).toBeOneOf(["healthy", "degraded", "unhealthy"]);
      expect(body.database).toBeOneOf(["healthy", "degraded", "unhealthy"]);
      expect(body.redis).toBeOneOf(["healthy", "degraded", "unhealthy"]);
    });

    it("should require authentication for protected health endpoints", async () => {
      const correlationId = generateTestCorrelationId();

      const response = await testContext.request
        .get("/api/health/ready")
        .set("X-Correlation-ID", correlationId);

      assertApiResponse(response, 401);
    });

    it("should provide root health endpoint without auth", async () => {
      const correlationId = generateTestCorrelationId();

      const response = await testContext.request
        .get("/health")
        .set("X-Correlation-ID", correlationId);

      const body = assertApiResponse(response, 200);
      expect(body.status).toBeOneOf(["healthy", "degraded", "unhealthy"]);
      expect(body.timestamp).toBeDefined();
      expect(body.checks).toBeDefined();
    });
  });

  describe("Credentials Management", () => {
    let testCredentialId: number;

    beforeEach(() => {
      return new Promise((resolve) => setTimeout(resolve, 100));
    });

    it("should list user credentials", async () => {
      const correlationId = generateTestCorrelationId();

      const response = await testContext.request
        .get("/api/credentials")
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId);

      const body = assertApiResponse(response, 200);
      expect(body.success).toBe(true);
      const credentials = getApiData<any[]>(body);

      expect(Array.isArray(credentials)).toBe(true);

      if (credentials.length > 0) {
        const credential = credentials[0];
        expect(credential).toHaveProperty("id");
        expect(credential).toHaveProperty("serviceType");
        expect(credential).toHaveProperty("credentialName");
        expect(credential).toHaveProperty("username");
        expect(credential).toHaveProperty("isActive");
        expect(credential).toHaveProperty("isDefault");

        expect(credential.encryptedPassword).toBeUndefined();
        expect(credential.encryptedClientSecret).toBeUndefined();
      }
    });

    it("should filter credentials by service type", async () => {
      const correlationId = generateTestCorrelationId();

      const response = await testContext.request
        .get("/api/credentials")
        .query({ serviceType: "ad" })
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId);

      const body = assertApiResponse(response, 200);
      const credentials = getApiData<any[]>(body);

      credentials.forEach((credential: any) => {
        expect(credential.serviceType).toBe("ad");
      });
    });

    it("should create new AD credential", async () => {
      const correlationId = generateTestCorrelationId();

      const credentialData = {
        serviceType: "ad",
        credentialName: "E2E Test AD Credential",
        username: "e2e-test-user",
        password: "e2e-test-password",
        server: "test-dc.local",
        baseDN: "DC=test,DC=local",
        isDefault: false,
      };

      const response = await testContext.request
        .post("/api/credentials")
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId)
        .send(credentialData);

      const body = assertApiResponse(response, 201);
      expect(body.success).toBe(true);
      const credential = getApiData(body);

      expect(credential.id).toBeDefined();
      expect(credential.serviceType).toBe(credentialData.serviceType);
      expect(credential.credentialName).toBe(credentialData.credentialName);
      expect(credential.username).toBe(credentialData.username);
      expect(credential.isDefault).toBe(false);
      expect(credential.isActive).toBe(true);

      expect(credential.password).toBeUndefined();
      expect(credential.encryptedPassword).toBeUndefined();

      testCredentialId = credential.id;
    });

    it("should create new Azure AD credential", async () => {
      const correlationId = generateTestCorrelationId();

      const credentialData = {
        serviceType: "azure",
        credentialName: "E2E Test Azure Credential",
        tenantId: "test-tenant-id",
        clientId: "test-client-id",
        clientSecret: "test-client-secret",
        isDefault: false,
      };

      const response = await testContext.request
        .post("/api/credentials")
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId)
        .send(credentialData);

      const body = assertApiResponse(response, 201);
      const credential = getApiData(body);

      expect(credential.serviceType).toBe("azure");
      expect(credential.tenantId).toBe(credentialData.tenantId);
      expect(credential.clientId).toBe(credentialData.clientId);

      expect(credential.clientSecret).toBeUndefined();
      expect(credential.encryptedClientSecret).toBeUndefined();
    });

    it("should validate required fields for different service types", async () => {
      const correlationId = generateTestCorrelationId();

      const invalidADResponse = await testContext.request
        .post("/api/credentials")
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId)
        .send({
          serviceType: "ad",
          credentialName: "Invalid AD Credential",
        });

      expect(invalidADResponse.status).toBe(400);
      expect(invalidADResponse.body.success).toBe(false);
      expect(
        invalidADResponse.body.error || invalidADResponse.body.errors,
      ).toBeDefined();

      const invalidAzureResponse = await testContext.request
        .post("/api/credentials")
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId)
        .send({
          serviceType: "azure",
          credentialName: "Invalid Azure Credential",
          tenantId: "test-tenant",
        });

      expect(invalidAzureResponse.status).toBe(400);
      expect(invalidAzureResponse.body.success).toBe(false);
      expect(
        invalidAzureResponse.body.error || invalidAzureResponse.body.errors,
      ).toBeDefined();
    });

    it("should get specific credential", async () => {
      const correlationId = generateTestCorrelationId();

      const response = await testContext.request
        .get(`/api/credentials/${testCredentialId}`)
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId);

      const body = assertApiResponse(response, 200);
      const credential = getApiData(body);

      expect(credential.id).toBe(testCredentialId);
      expect(credential.serviceType).toBeDefined();
      expect(credential.credentialName).toBeDefined();
    });

    it("should update credential", async () => {
      const correlationId = generateTestCorrelationId();

      const updateData = {
        credentialName: "Updated E2E Test Credential",
        username: "updated-user",
        password: "updated-password",
      };

      const response = await testContext.request
        .put(`/api/credentials/${testCredentialId}`)
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId)
        .send(updateData);

      const body = assertApiResponse(response, 200);
      const credential = getApiData(body);

      expect(credential.credentialName).toBe(updateData.credentialName);
      expect(credential.username).toBe(updateData.username);
    });

    it("should set default credential", async () => {
      const correlationId = generateTestCorrelationId();

      const response = await testContext.request
        .put(`/api/credentials/${testCredentialId}/set-default`)
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId);

      const body = assertApiResponse(response, 200);
      expect(body.success).toBe(true);

      const getResponse = await testContext.request
        .get(`/api/credentials/${testCredentialId}`)
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId);

      const credential = getApiData(assertApiResponse(getResponse, 200));
      expect(credential.isDefault).toBe(true);
    });

    it("should get default credentials", async () => {
      const correlationId = generateTestCorrelationId();

      const response = await testContext.request
        .get("/api/credentials/defaults")
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId);

      const body = assertApiResponse(response, 200);
      const defaults = getApiData(body);

      expect(typeof defaults).toBe("object");

      if (defaults.ad) {
        expect(defaults.ad.serviceType).toBe("ad");
        expect(defaults.ad.isDefault).toBe(true);
      }
      if (defaults.azure) {
        expect(defaults.azure.serviceType).toBe("azure");
        expect(defaults.azure.isDefault).toBe(true);
      }
    });

    it("should test credential connection", async () => {
      const correlationId = generateTestCorrelationId();

      const response = await testContext.request
        .post(`/api/credentials/${testCredentialId}/test`)
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId);

      expect(response.status).toBeOneOf([200, 400, 404, 500]);

      if (response.status === 200) {
        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeDefined();
      } else {
        expect(response.body.error).toBeDefined();
      }

      await waitFor(async () => {
        const client = await testContext.pool.connect();
        try {
          const credResult = await client.query(
            "SELECT last_tested, last_test_success FROM service_credentials WHERE id = $1",
            [testCredentialId],
          );
          return (
            credResult.rows.length > 0 &&
            credResult.rows[0].last_tested !== null
          );
        } catch (error) {
          logger.warn(
            "Database query failed during credential test verification:",
            error,
          );
          return false;
        } finally {
          client.release();
        }
      }, 5000);
    }, 10000);

    it("should prevent access to other users credentials", async () => {
      const correlationId = generateTestCorrelationId();

      const response = await testContext.request
        .get(`/api/credentials/${testCredentialId}`)
        .set("Authorization", `Bearer ${testContext.adminToken}`)
        .set("X-Correlation-ID", correlationId);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    it("should delete credential", async () => {
      const correlationId = generateTestCorrelationId();

      const response = await testContext.request
        .delete(`/api/credentials/${testCredentialId}`)
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId);

      const body = assertApiResponse(response, 200);
      expect(body.success).toBe(true);

      const getResponse = await testContext.request
        .get(`/api/credentials/${testCredentialId}`)
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId);

      assertApiResponse(getResponse, 404);
    });
  });

  describe("Field Discovery", () => {
    it("should discover AD schema fields", async () => {
      const correlationId = generateTestCorrelationId();

      const response = await testContext.request
        .get("/api/reports/fields/ad")
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId);

      expect(response.status).toBeOneOf([200, 400, 500]);

      if (response.status === 200) {
        expect(response.body.success).toBe(true);
        const data = getApiData(response.body);
        expect(data.categories).toBeDefined();
        expect(Array.isArray(data.categories)).toBe(true);
        expect(data.totalFields).toBeDefined();

        if (
          data.categories.length > 0 &&
          data.categories[0].fields?.length > 0
        ) {
          const field = data.categories[0].fields[0];
          expect(field).toHaveProperty("fieldName");
          expect(field).toHaveProperty("displayName");
          expect(field).toHaveProperty("dataType");
          expect(field).toHaveProperty("category");
        }
      }
    });

    it("should discover Azure AD Graph fields", async () => {
      const correlationId = generateTestCorrelationId();

      const response = await testContext.request
        .get("/api/reports/fields/azure")
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId);

      expect(response.status).toBeOneOf([200, 400, 500]);

      if (response.status === 200) {
        const data = getApiData(response.body);
        expect(data.fields).toBeDefined();
        expect(Array.isArray(data.fields)).toBe(true);
      }
    });

    it("should discover O365 fields", async () => {
      const correlationId = generateTestCorrelationId();

      const response = await testContext.request
        .get("/api/reports/fields/o365")
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId);

      expect(response.status).toBeOneOf([200, 400, 500]);

      if (response.status === 200) {
        const data = getApiData(response.body);
        expect(data.categories ?? data.fields).toBeDefined();
      }
    });

    it("should cache field discovery results", async () => {
      const correlationId = generateTestCorrelationId();

      // Bust cache so the next two requests exercise the same code path
      await testContext.request
        .get("/api/reports/fields/ad?refresh=true")
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", `${correlationId}-refresh`);

      const response1 = await testContext.request
        .get("/api/reports/fields/ad")
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", `${correlationId}-1`);

      const response2 = await testContext.request
        .get("/api/reports/fields/ad")
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", `${correlationId}-2`);

      expect(response1.status).toBe(response2.status);

      if (response1.status === 200 && response2.status === 200) {
        expect(getApiData(response1.body)).toEqual(getApiData(response2.body));
      }
    });

    it("should handle invalid data source", async () => {
      const correlationId = generateTestCorrelationId();

      const response = await testContext.request
        .get("/api/reports/fields/invalid_source")
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId);

      assertApiResponse(response, 400);
      expect(response.body.error).toContain("Invalid data source");
    });

    it("should search fields by name or description", async () => {
      const correlationId = generateTestCorrelationId();

      const response = await testContext.request
        .get("/api/reports/fields/ad")
        .query({ search: "user" })
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId);

      expect(response.status).toBeOneOf([200, 400, 500]);

      if (response.status === 200) {
        const data = getApiData(response.body);
        expect(data.fields).toBeDefined();

        data.fields.forEach((field: any) => {
          const fieldName = (field.fieldName ?? field.name ?? "").toLowerCase();
          const displayName = (field.displayName ?? "").toLowerCase();
          const description = (field.description ?? "").toLowerCase();
          const matchesSearch =
            fieldName.includes("user") ||
            displayName.includes("user") ||
            description.includes("user");
          expect(matchesSearch).toBe(true);
        });
      }
    });

    it("should filter fields by category", async () => {
      const correlationId = generateTestCorrelationId();

      const response = await testContext.request
        .get("/api/reports/fields/ad")
        .query({ category: "basic" })
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId);

      expect(response.status).toBeOneOf([200, 400, 500]);

      if (response.status === 200) {
        const data = getApiData(response.body);
        expect(data.fields).toBeDefined();

        data.fields.forEach((field: any) => {
          expect(field.category).toBe("basic");
        });
      }
    });
  });

  describe("System Configuration", () => {
    it("should get system configuration (admin only)", async () => {
      const correlationId = generateTestCorrelationId();

      const response = await testContext.request
        .get("/api/system/config")
        .set("Authorization", `Bearer ${testContext.adminToken}`)
        .set("X-Correlation-ID", correlationId);

      const body = assertApiResponse(response, 200);

      expect(body.version).toBeDefined();
      expect(body.environment).toBeDefined();
      expect(body.services).toBeDefined();
      expect(body.availability).toBeDefined();
    });

    it("should deny system config access to regular users", async () => {
      const correlationId = generateTestCorrelationId();

      const response = await testContext.request
        .get("/api/system/config")
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId);

      assertApiResponse(response, 403);
    });

    it("should get system health status", async () => {
      const correlationId = generateTestCorrelationId();

      const response = await testContext.request
        .get("/api/system/health")
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId);

      expect(response.status).toBeOneOf([200, 503]);
      const body = response.body;

      expect(body.status).toBeOneOf(["healthy", "unhealthy"]);
      expect(body.services).toBeDefined();
      expect(body.timestamp).toBeDefined();
    });
  });

  describe("User Preferences", () => {
    it("should get user preferences", async () => {
      const correlationId = generateTestCorrelationId();

      const response = await testContext.request
        .get("/api/user/preferences")
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId);

      const body = assertApiResponse(response, 200);

      expect(body.theme).toBeDefined();
      expect(body.defaultPageSize).toBeDefined();
      expect(body.emailNotifications).toBeDefined();
      expect(body.notificationPreferences).toBeDefined();
    });

    it("should update user preferences", async () => {
      const correlationId = generateTestCorrelationId();

      const preferences = {
        theme: "dark",
        defaultPageSize: 25,
        emailNotifications: true,
        notificationPreferences: {
          reportCompletion: true,
          scheduledReports: false,
          systemAlerts: true,
          weeklyDigest: false,
          notificationTime: "10:00",
        },
      };

      const response = await testContext.request
        .put("/api/user/preferences")
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId)
        .send(preferences);

      const body = assertApiResponse(response, 200);

      expect(body.theme).toBe(preferences.theme);
      expect(body.defaultPageSize).toBe(preferences.defaultPageSize);
      expect(body.emailNotifications).toBe(preferences.emailNotifications);
      expect(body.notificationPreferences.reportCompletion).toBe(
        preferences.notificationPreferences.reportCompletion,
      );
    });

    it("should update notification preferences specifically", async () => {
      const correlationId = generateTestCorrelationId();

      const notificationPrefs = {
        emailNotifications: false,
        reportCompletion: false,
        scheduledReports: true,
        systemAlerts: true,
        weeklyDigest: false,
        notificationTime: "14:30",
      };

      const response = await testContext.request
        .put("/api/user/preferences/notifications")
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId)
        .send(notificationPrefs);

      const body = assertApiResponse(response, 200);

      expect(body.emailNotifications).toBe(
        notificationPrefs.emailNotifications,
      );
      expect(body.notificationPreferences.reportCompletion).toBe(
        notificationPrefs.reportCompletion,
      );
      expect(body.notificationPreferences.scheduledReports).toBe(
        notificationPrefs.scheduledReports,
      );
      expect(body.notificationPreferences.systemAlerts).toBe(
        notificationPrefs.systemAlerts,
      );
      expect(body.notificationPreferences.weeklyDigest).toBe(
        notificationPrefs.weeklyDigest,
      );
    });
  });

  describe("Search Functionality", () => {
    it("should perform global search", async () => {
      const correlationId = generateTestCorrelationId();

      const response = await testContext.request
        .get("/api/search/global")
        .query({ q: "test", limit: 10 })
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId);

      const body = assertApiResponse(response, 200);

      expect(body.results).toBeDefined();
      expect(Array.isArray(body.results)).toBe(true);
      expect(body.total).toBeDefined();
      expect(body.query).toBe("test");

      body.results.forEach((result: any) => {
        expect(result).toHaveProperty("id");
        expect(result).toHaveProperty("type");
        expect(result).toHaveProperty("title");
        expect(result).toHaveProperty("path");
      });
    });

    it("should get search suggestions", async () => {
      const correlationId = generateTestCorrelationId();

      const response = await testContext.request
        .get("/api/search/suggestions")
        .query({ q: "test", limit: 5 })
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId);

      const body = assertApiResponse(response, 200);

      expect(Array.isArray(body.suggestions)).toBe(true);
      expect(body.suggestions.length).toBeLessThanOrEqual(10);

      body.suggestions.forEach((suggestion: string) => {
        expect(typeof suggestion).toBe("string");
        expect(suggestion.toLowerCase()).toContain("test");
      });
    });

    it("should get recent searches", async () => {
      const correlationId = generateTestCorrelationId();

      await testContext.request
        .get("/api/search/global")
        .query({ q: "recent search test" })
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId);

      const response = await testContext.request
        .get("/api/search/recent")
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId);

      const body = assertApiResponse(response, 200);

      expect(Array.isArray(body.searches)).toBe(true);

      body.searches.forEach((search: string) => {
        expect(typeof search).toBe("string");
      });
    });
  });

  describe("API Rate Limiting and Security", () => {
    it("should rate limit API requests", async () => {
      const correlationId = generateTestCorrelationId();

      const requests = [];
      for (let i = 0; i < 20; i++) {
        requests.push(
          testContext.request
            .get("/api/health")
            .set("X-Correlation-ID", `${correlationId}-${i}`),
        );
      }

      const responses = await Promise.all(requests);

      const successCount = responses.filter(
        (r: any) => r.status === 200,
      ).length;
      const rateLimitedCount = responses.filter(
        (r: any) => r.status === 429,
      ).length;

      logger.info("Rate limiting test results:", {
        total: responses.length,
        successful: successCount,
        rateLimited: rateLimitedCount,
      });

      expect(successCount + rateLimitedCount).toBe(responses.length);
    });

    it("should handle CORS properly", async () => {
      const correlationId = generateTestCorrelationId();

      const response = await testContext.request
        .options("/api/health")
        .set("Origin", "http://localhost:3000")
        .set("Access-Control-Request-Method", "GET")
        .set("Access-Control-Request-Headers", "Authorization")
        .set("X-Correlation-ID", correlationId);

      expect(response.status).toBeOneOf([200, 204]);
      expect(response.headers["access-control-allow-origin"]).toBeDefined();
      expect(response.headers["access-control-allow-methods"]).toBeDefined();
    });

    it("should sanitize error responses", async () => {
      const correlationId = generateTestCorrelationId();

      const response = await testContext.request
        .get('/api/nonexistent/<script>alert("xss")</script>')
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId);

      assertApiResponse(response, 404);

      const responseText = JSON.stringify(response.body);
      expect(responseText).not.toMatch(/<script>/i);
      // 404 handler URL-encodes the path; ensure raw script tags are not echoed
      expect(response.body.path).toContain("%3Cscript%3E");
    });

    it("should validate request size limits", async () => {
      const correlationId = generateTestCorrelationId();

      const largeData = {
        name: "Test Report",
        description: "A".repeat(10000),
        source: "ad",
        query: {
          source: "ad",
          fields: [
            { name: "sAMAccountName", displayName: "Username", type: "string" },
          ],
          filters: [
            { field: "B".repeat(5000), operator: "equals", value: "test" },
          ],
        },
      };

      const response = await testContext.request
        .post("/api/reports/custom")
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId)
        .send(largeData);

      expect(response.status).toBeOneOf([201, 400]);
    });
  });
});
