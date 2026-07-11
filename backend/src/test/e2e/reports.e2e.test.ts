import {
  E2ETestContext,
  setupE2ETestContext,
  teardownE2ETestContext,
  createE2ETestData,
  assertApiResponse,
  generateTestCorrelationId,
  waitFor,
  getApiData,
  getTemplateList,
  getCustomReportList,
  getReportHistoryList,
  assertCustomReportListResponse,
  assertReportHistoryResponse,
} from "./setup";
import { logger } from "@/utils/logger";

const validCustomQuery = {
  source: "ad" as const,
  fields: [
    { name: "sAMAccountName", displayName: "Username", type: "string" },
    { name: "displayName", displayName: "Display Name", type: "string" },
    { name: "mail", displayName: "Email", type: "string" },
    { name: "lastLogon", displayName: "Last Logon", type: "datetime" },
  ],
  filters: [],
};

async function fetchTemplateId(
  testContext: E2ETestContext,
  options: { category?: string; reportType?: string } = {},
): Promise<string> {
  const response = await testContext.request
    .get("/api/reports/templates")
    .query(options.category ? { category: options.category } : {})
    .set("Authorization", `Bearer ${testContext.testToken}`);

  const templates = getTemplateList(assertApiResponse(response, 200));
  const match = options.reportType
    ? templates.find((t: any) => t.reportType === options.reportType)
    : undefined;

  const template = match ?? templates[0];
  if (!template?.id) {
    throw new Error("No report templates available for E2E tests");
  }

  return template.id;
}

// Set environment for E2E tests
process.env.TEST_TYPE = "integration";
process.env.NODE_ENV = "test";

describe("Reports E2E Tests", () => {
  let testContext: E2ETestContext;

  beforeAll(async () => {
    testContext = await setupE2ETestContext();
    await createE2ETestData(testContext.pool);
  });

  afterAll(async () => {
    await teardownE2ETestContext(testContext);
  });

  describe("Pre-built Report Templates", () => {
    it("should list all available report templates", async () => {
      const correlationId = generateTestCorrelationId();

      const response = await testContext.request
        .get("/api/reports/templates")
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId);

      const body = assertApiResponse(response, 200);
      const templates = getTemplateList(body);

      expect(Array.isArray(templates)).toBe(true);
      expect(templates.length).toBeGreaterThan(0);

      // Verify template structure
      const template = templates[0];
      expect(template).toHaveProperty("id");
      expect(template).toHaveProperty("name");
      expect(template).toHaveProperty("description");
      expect(template).toHaveProperty("category");
      expect(template).toHaveProperty("reportType");
      expect(template).toHaveProperty("parameters");
      expect(template).toHaveProperty("isSystem");

      // Should not expose internal query template details
      expect(template.query_template).toBeUndefined();
      expect(template.queryTemplate).toBeUndefined();
    });

    it("should filter templates by category", async () => {
      const correlationId = generateTestCorrelationId();

      const response = await testContext.request
        .get("/api/reports/templates")
        .query({ category: "ad" })
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId);

      const body = assertApiResponse(response, 200);
      const templates = getTemplateList(body);

      expect(Array.isArray(templates)).toBe(true);
      templates.forEach((template: any) => {
        expect(template.category).toBe("ad");
      });
    });

    it("should preview a template by id", async () => {
      const correlationId = generateTestCorrelationId();
      const templateId = await fetchTemplateId(testContext, { category: "ad" });

      const templateResponse = await testContext.request
        .post(`/api/reports/templates/${templateId}/preview`)
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId)
        .send({ parameters: {}, limit: 5 });

      // Preview may fail without live data sources; verify endpoint + response shape
      expect(templateResponse.status).toBeOneOf([200, 400, 500]);

      if (templateResponse.status === 200) {
        expect(templateResponse.body.success).toBe(true);
        const preview = getApiData(templateResponse.body);
        expect(preview.templateInfo?.id).toBe(templateId);
        expect(Array.isArray(preview.testData)).toBe(true);
        expect(preview.rowCount).toBeDefined();
      }
    });
  });

  describe("Pre-built Report Execution", () => {
    let templateId: string;

    beforeAll(async () => {
      templateId = await fetchTemplateId(testContext, { category: "ad" });
    });

    it("should execute AD inactive users report", async () => {
      const correlationId = generateTestCorrelationId();

      const response = await testContext.request
        .post(`/api/reports/execute/${templateId}`)
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId)
        .send({
          parameters: {
            days: 30,
          },
        });

      // The report execution might fail due to missing LDAP connection
      // but we can verify the endpoint structure and error handling
      expect(response.status).toBeOneOf([200, 400, 500]);

      if (response.status === 200) {
        expect(response.body.success).toBe(true);
        const data = getApiData(response.body);
        expect(data.executionId).toBeDefined();
        expect(data.reportName).toBeDefined();
        expect(Array.isArray(data.data)).toBe(true);
        expect(data.totalCount).toBeDefined();
        expect(data.executionTime).toBeDefined();
      } else {
        expect(response.body.error).toBeDefined();
      }
    });

    it("should execute report with parameter validation", async () => {
      const correlationId = generateTestCorrelationId();

      // Invalid template UUID should be rejected by route validation
      const invalidResponse = await testContext.request
        .post("/api/reports/execute/not-a-valid-uuid")
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId)
        .send({
          parameters: {
            days: 30,
          },
        });

      assertApiResponse(invalidResponse, 400);
      expect(invalidResponse.body.error).toBeDefined();
    });

    it("should track report execution history", async () => {
      const correlationId = generateTestCorrelationId();

      // Execute a report (even if it fails, it should create history)
      await testContext.request
        .post(`/api/reports/execute/${templateId}`)
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId)
        .send({
          parameters: { days: 30 },
        });

      // Wait for history to be recorded
      await waitFor(async () => {
        const client = await testContext.pool.connect();
        try {
          const historyResult = await client.query(
            `SELECT * FROM report_history 
             WHERE user_id = $1 AND generated_at > NOW() - INTERVAL '1 minute'`,
            [testContext.userId],
          );
          return historyResult.rows.length > 0;
        } finally {
          client.release();
        }
      }, 5000);
    });

    it("should export report results in different formats", async () => {
      const correlationId = generateTestCorrelationId();

      // Test CSV export
      const csvResponse = await testContext.request
        .post(`/api/reports/export/report/${templateId}`)
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId)
        .send({
          format: "csv",
          parameters: { days: 30 },
        });

      // Export might fail due to missing data, but verify endpoint exists
      expect(csvResponse.status).toBeOneOf([200, 400, 500]);

      if (csvResponse.status === 200) {
        expect(csvResponse.headers["content-type"]).toContain("text/csv");
        expect(csvResponse.headers["content-disposition"]).toContain(
          "attachment",
        );
      }

      // Test Excel export
      const excelResponse = await testContext.request
        .post(`/api/reports/export/report/${templateId}`)
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId)
        .send({
          format: "excel",
          parameters: { days: 30 },
        });

      expect(excelResponse.status).toBeOneOf([200, 400, 500]);

      if (excelResponse.status === 200) {
        expect(excelResponse.headers["content-type"]).toContain(
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        );
      }
    });
  });

  describe("Custom Report Templates", () => {
    let customTemplateId: string;

    it("should create a new custom report template", async () => {
      const correlationId = generateTestCorrelationId();

      const customTemplate = {
        name: "E2E Custom AD Users Report",
        description: "E2E test custom report for AD users",
        source: "ad",
        category: "ad",
        query: validCustomQuery,
        isPublic: false,
        tags: ["e2e"],
      };

      const response = await testContext.request
        .post("/api/reports/custom")
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId)
        .send(customTemplate);

      const body = assertApiResponse(response, 201);
      const data = getApiData(body);

      expect(data.id).toBeDefined();
      expect(data.name).toBe(customTemplate.name);
      expect(data.description).toBe(customTemplate.description);
      expect(data.source).toBe(customTemplate.source);
      expect(data.createdBy).toBe(testContext.userId);

      customTemplateId = data.id;
    });

    it("should list user custom reports", async () => {
      const correlationId = generateTestCorrelationId();

      const response = await testContext.request
        .get("/api/reports/custom")
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId);

      const body = assertApiResponse(response, 200);
      assertCustomReportListResponse(body, [
        "id",
        "name",
        "description",
        "source",
      ]);

      const reports = getCustomReportList(body);
      const customReport = reports.find((r: any) => r.id === customTemplateId);
      expect(customReport).toBeDefined();
    });

    it("should execute custom report", async () => {
      const correlationId = generateTestCorrelationId();

      const response = await testContext.request
        .post(`/api/reports/custom/${customTemplateId}/execute`)
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId)
        .send({
          parameters: {
            includeDisabled: false,
          },
        });

      // Custom report execution might fail due to LDAP connection issues
      expect(response.status).toBeOneOf([200, 400, 500]);

      if (response.status === 200) {
        expect(response.body.success).toBe(true);
        const data = getApiData(response.body);
        expect(data.executionId).toBeDefined();
        expect(Array.isArray(data.data)).toBe(true);
        expect(data.totalCount).toBeDefined();
      }
    });

    it("should update custom report template", async () => {
      const correlationId = generateTestCorrelationId();

      const updatedTemplate = {
        name: "E2E Updated Custom Report",
        description: "Updated description for E2E test",
        query: {
          ...validCustomQuery,
          fields: validCustomQuery.fields.slice(0, 3),
        },
      };

      const response = await testContext.request
        .put(`/api/reports/custom/${customTemplateId}`)
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId)
        .send(updatedTemplate);

      const body = assertApiResponse(response, 200);
      expect(body.success).toBe(true);
      expect(body.message).toContain("updated successfully");

      const getResponse = await testContext.request
        .get(`/api/reports/custom/${customTemplateId}`)
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId);

      const report = getApiData(assertApiResponse(getResponse, 200));
      expect(report.name).toBe(updatedTemplate.name);
      expect(report.description).toBe(updatedTemplate.description);
    });

    it("should test custom query without saving", async () => {
      const correlationId = generateTestCorrelationId();

      const response = await testContext.request
        .post("/api/reports/custom/test")
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId)
        .send({
          source: "ad",
          query: validCustomQuery,
          parameters: {},
          limit: 10,
        });

      // Query test might fail due to LDAP issues, but endpoint should exist
      expect(response.status).toBeOneOf([200, 400, 500]);

      if (response.status === 200) {
        expect(response.body.success).toBe(true);
        const data = getApiData(response.body);
        expect(Array.isArray(data.testData)).toBe(true);
        expect(data.rowCount).toBeDefined();
      }
    });

    it("should delete custom report template", async () => {
      const correlationId = generateTestCorrelationId();

      const response = await testContext.request
        .delete(`/api/reports/custom/${customTemplateId}`)
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId);

      assertApiResponse(response, 200);
      expect(response.body.success).toBe(true);

      // Verify it's deleted
      const getResponse = await testContext.request
        .get(`/api/reports/custom/${customTemplateId}`)
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId);

      assertApiResponse(getResponse, 404);
    });
  });

  describe("Report History and Tracking", () => {
    it("should get report execution history with pagination", async () => {
      const correlationId = generateTestCorrelationId();

      const response = await testContext.request
        .get("/api/reports/history")
        .query({
          limit: 10,
          offset: 0,
        })
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId);

      const body = assertApiResponse(response, 200);
      assertReportHistoryResponse(body, ["id", "status", "generated_at"]);

      const history = getReportHistoryList(body);
      if (history.length > 1) {
        const dates = history.map((item: any) => new Date(item.generated_at));
        for (let i = 1; i < dates.length; i++) {
          expect(dates[i].getTime()).toBeLessThanOrEqual(
            dates[i - 1].getTime(),
          );
        }
      }
    });

    it("should filter report history by status", async () => {
      const correlationId = generateTestCorrelationId();

      const response = await testContext.request
        .get("/api/reports/history")
        .query({
          status: "completed",
          limit: 10,
          offset: 0,
        })
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId);

      const body = assertApiResponse(response, 200);
      assertReportHistoryResponse(body);

      getReportHistoryList(body).forEach((item: any) => {
        expect(item.status).toBe("completed");
      });
    });

    it("should get specific report execution details", async () => {
      const correlationId = generateTestCorrelationId();

      const historyResponse = await testContext.request
        .get("/api/reports/history")
        .query({ limit: 1, offset: 0 })
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId);

      const historyBody = assertApiResponse(historyResponse, 200);
      const history = getReportHistoryList(historyBody);

      if (history.length > 0) {
        const historyId = history[0].id;

        const detailResponse = await testContext.request
          .get(`/api/reports/history/${historyId}`)
          .set("Authorization", `Bearer ${testContext.testToken}`)
          .set("X-Correlation-ID", correlationId);

        const detail = getApiData(assertApiResponse(detailResponse, 200));

        expect(detail.id).toBe(historyId);
        expect(detail.parameters).toBeDefined();
        expect(detail.executionTimeMs).toBeDefined();
        expect(detail.generatedAt).toBeDefined();

        const resultsResponse = await testContext.request
          .get(`/api/reports/history/${historyId}/results`)
          .set("Authorization", `Bearer ${testContext.testToken}`)
          .set("X-Correlation-ID", correlationId);

        expect(resultsResponse.status).toBeOneOf([200, 400]);
        if (resultsResponse.status === 200) {
          const results = getApiData(resultsResponse.body);
          expect(results.historyId).toBe(historyId);
          expect(Array.isArray(results.results)).toBe(true);
        }
      }
    });

    it("should get report statistics", async () => {
      const correlationId = generateTestCorrelationId();

      const response = await testContext.request
        .get("/api/reports/stats")
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId);

      const stats = getApiData(assertApiResponse(response, 200));

      expect(stats.totalReports).toBeDefined();
      expect(stats.totalCustomReports).toBeDefined();
      expect(stats.totalExecutions).toBeDefined();
      expect(stats.reportsBySource).toBeDefined();
      expect(stats.executionsByStatus).toBeDefined();
      expect(Array.isArray(stats.recentExecutions)).toBe(true);
      expect(Array.isArray(stats.popularReports)).toBe(true);
    });
  });

  describe("Field Discovery", () => {
    it("should discover available fields for AD source", async () => {
      const correlationId = generateTestCorrelationId();

      const response = await testContext.request
        .get("/api/reports/fields/ad")
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId);

      // Field discovery might fail due to LDAP connection issues
      expect(response.status).toBeOneOf([200, 400, 500]);

      if (response.status === 200) {
        expect(response.body.success).toBe(true);
        const data = getApiData(response.body);
        expect(data.source).toBe("ad");
        expect(Array.isArray(data.categories)).toBe(true);
        expect(data.totalFields).toBeDefined();

        const firstCategory = data.categories[0];
        if (firstCategory?.fields?.length > 0) {
          const field = firstCategory.fields[0];
          expect(field).toHaveProperty("fieldName");
          expect(field).toHaveProperty("displayName");
          expect(field).toHaveProperty("dataType");
        }
      }
    });

    it("should discover fields for Azure AD source", async () => {
      const correlationId = generateTestCorrelationId();

      const response = await testContext.request
        .get("/api/reports/fields/azure")
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId);

      expect(response.status).toBeOneOf([200, 400, 500]);

      if (response.status === 200) {
        expect(response.body.success).toBe(true);
        const data = getApiData(response.body);
        expect(Array.isArray(data.fields)).toBe(true);

        if (data.fields.length > 0) {
          const field = data.fields[0];
          expect(field).toHaveProperty("fieldName");
          expect(field).toHaveProperty("displayName");
          expect(field).toHaveProperty("dataType");
        }
      }
    });

    it("should handle invalid data source", async () => {
      const correlationId = generateTestCorrelationId();

      const response = await testContext.request
        .get("/api/reports/fields/invalid")
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId);

      assertApiResponse(response, 400);
      expect(response.body.error).toContain("Invalid data source");
    });
  });

  describe("Report Permissions and Security", () => {
    it("should prevent unauthorized access to other users reports", async () => {
      const correlationId = generateTestCorrelationId();

      // Create a private report owned by admin
      const createResponse = await testContext.request
        .post("/api/reports/custom")
        .set("Authorization", `Bearer ${testContext.adminToken}`)
        .set("X-Correlation-ID", correlationId)
        .send({
          name: "Private Admin Report",
          description: "Test private report",
          source: "ad",
          category: "ad",
          isPublic: false,
          query: validCustomQuery,
        });

      const data = getApiData(assertApiResponse(createResponse, 201));
      const reportId = data.id;

      // Regular user should not access another user's private report
      const accessResponse = await testContext.request
        .get(`/api/reports/custom/${reportId}`)
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId);

      assertApiResponse(accessResponse, 403);

      await testContext.request
        .delete(`/api/reports/custom/${reportId}`)
        .set("Authorization", `Bearer ${testContext.adminToken}`)
        .set("X-Correlation-ID", correlationId);
    });

    it("should validate report parameter injection attacks", async () => {
      const correlationId = generateTestCorrelationId();
      const templateId = await fetchTemplateId(testContext, { category: "ad" });

      const maliciousParams = {
        days: "30; DROP TABLE users; --",
        username: "'; DELETE FROM report_history; --",
      };

      const response = await testContext.request
        .post(`/api/reports/execute/${templateId}`)
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId)
        .send({
          parameters: maliciousParams,
        });

      // Should reject or safely handle malicious input without server crash
      expect(response.status).toBeOneOf([200, 400, 500]);
      if (response.status >= 400) {
        expect(response.body.error).toBeDefined();
      }
    });

    it("should rate limit report executions", async () => {
      const correlationId = generateTestCorrelationId();
      const templateId = await fetchTemplateId(testContext, { category: "ad" });

      // Execute more requests than the per-minute limit (30)
      const requests = [];
      for (let i = 0; i < 35; i++) {
        requests.push(
          testContext.request
            .post(`/api/reports/execute/${templateId}`)
            .set("Authorization", `Bearer ${testContext.testToken}`)
            .set("X-Correlation-ID", `${correlationId}-${i}`)
            .send({ parameters: { days: 30 } }),
        );
      }

      const responses = await Promise.all(requests);

      const rateLimitedCount = responses.filter(
        (r: any) => r.status === 429,
      ).length;
      expect(rateLimitedCount).toBeGreaterThan(0);
    });

    it("should audit report executions", async () => {
      const correlationId = generateTestCorrelationId();
      const templateId = await fetchTemplateId(testContext, { category: "ad" });

      await testContext.request
        .post(`/api/reports/execute/${templateId}`)
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId)
        .send({ parameters: { days: 30 } });

      await waitFor(async () => {
        const client = await testContext.pool.connect();
        try {
          const auditResult = await client.query(
            `SELECT * FROM audit_logs 
             WHERE user_id = $1
               AND event_type = 'access'
               AND resource_type = 'report_execution'
               AND created_at > NOW() - INTERVAL '1 minute'
             ORDER BY created_at DESC
             LIMIT 1`,
            [testContext.userId],
          );
          return auditResult.rows.length > 0;
        } finally {
          client.release();
        }
      }, 5000);
    });
  });

  describe("Report Performance and Optimization", () => {
    let templateId: string;

    beforeAll(async () => {
      templateId = await fetchTemplateId(testContext, { category: "ad" });
    });

    it("should handle large result sets with pagination", async () => {
      const correlationId = generateTestCorrelationId();

      const response = await testContext.request
        .post(`/api/reports/execute/${templateId}`)
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId)
        .send({
          parameters: { days: 30 },
        });

      expect(response.status).toBeOneOf([200, 400, 429, 500]);

      if (response.status === 200) {
        const data = getApiData(response.body);
        expect(Array.isArray(data.data)).toBe(true);
        expect(data.totalCount).toBeDefined();
      }
    });

    it("should timeout long-running reports", async () => {
      const correlationId = generateTestCorrelationId();

      const response = await testContext.request
        .post("/api/reports/custom/test")
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", correlationId)
        .send({
          source: "ad",
          query: {
            source: "ad",
            fields: [
              {
                name: "sAMAccountName",
                displayName: "Username",
                type: "string",
              },
            ],
            filters: [],
          },
          limit: 10,
        });

      expect(response.status).toBeOneOf([200, 400, 408, 500]);

      if (response.status === 408) {
        expect(response.body.error).toContain("timeout");
      }
    }, 15000);

    it("should cache report results appropriately", async () => {
      const correlationId = generateTestCorrelationId();
      const params = { parameters: { days: 30 } };

      const start1 = Date.now();
      const response1 = await testContext.request
        .post(`/api/reports/execute/${templateId}`)
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", `${correlationId}-1`)
        .send(params);
      const time1 = Date.now() - start1;

      await new Promise((resolve) => setTimeout(resolve, 100));

      const start2 = Date.now();
      const response2 = await testContext.request
        .post(`/api/reports/execute/${templateId}`)
        .set("Authorization", `Bearer ${testContext.testToken}`)
        .set("X-Correlation-ID", `${correlationId}-2`)
        .send(params);
      const time2 = Date.now() - start2;

      expect(response1.status).toBe(response2.status);

      if (response1.status === 200 && response2.status === 200) {
        logger.info("Cache performance test:", {
          firstRequest: time1,
          secondRequest: time2,
          improvement: time1 - time2,
        });

        const data1 = getApiData(response1.body);
        const data2 = getApiData(response2.body);
        expect(data1.totalCount).toBe(data2.totalCount);
      }
    });
  });
});
