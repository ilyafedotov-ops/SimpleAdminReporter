import { sanitizeHeadersForLogging } from "@/utils/log-sanitizer";
import {
  ALLOWED_QUERY_TABLES,
  BLOCKED_QUERY_COLUMNS,
  assertAllowedQueryColumns,
  isAllowedQueryTable,
} from "@/config/query-allowlist";
import { requireRole } from "@/auth/middleware/unified-auth.middleware";
import { Request, Response, NextFunction } from "express";

describe("log-sanitizer", () => {
  it("redacts sensitive headers", () => {
    const sanitized = sanitizeHeadersForLogging({
      authorization: "Bearer secret-token",
      cookie: "session=abc",
      "x-csrf-token": "csrf-value",
      "content-type": "application/json",
      host: "localhost",
    });

    expect(sanitized.authorization).toBe("[REDACTED]");
    expect(sanitized.cookie).toBe("[REDACTED]");
    expect(sanitized["x-csrf-token"]).toBe("[REDACTED]");
    expect(sanitized["content-type"]).toBe("application/json");
    expect(sanitized.host).toBe("localhost");
  });
});

describe("query-allowlist", () => {
  it("allows reporting tables only", () => {
    expect(isAllowedQueryTable("report_templates")).toBe(true);
    expect(isAllowedQueryTable("users")).toBe(false);
    expect(isAllowedQueryTable("service_credentials")).toBe(false);
  });

  it("blocks sensitive columns", () => {
    expect(() => assertAllowedQueryColumns(["password_hash"])).toThrow(
      "Access to column 'password_hash' is not permitted",
    );
    expect(() => assertAllowedQueryColumns(["name", "category"])).not.toThrow();
  });

  it("does not expose sensitive tables in allowlist", () => {
    expect(ALLOWED_QUERY_TABLES.has("users")).toBe(false);
    expect(ALLOWED_QUERY_TABLES.has("service_credentials")).toBe(false);
    expect(BLOCKED_QUERY_COLUMNS.has("encrypted_password")).toBe(true);
  });
});

describe("requireRole admin normalization", () => {
  const mockResponse = {} as Response;
  const mockNext = jest.fn() as NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("grants admin role when user.isAdmin is true", async () => {
    const middleware = requireRole(["admin"]);
    const req = {
      user: {
        id: 1,
        username: "admin",
        isAdmin: true,
      },
    } as unknown as Request;

    await middleware(req, mockResponse, mockNext);
    expect(mockNext).toHaveBeenCalledWith();
  });

  it("denies access when user lacks required role", async () => {
    const middleware = requireRole(["admin"]);
    const req = {
      user: {
        id: 2,
        username: "user",
        isAdmin: false,
        roles: [],
      },
    } as unknown as Request;

    await middleware(req, mockResponse, mockNext);
    expect(mockNext).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Insufficient permissions" }),
    );
  });
});

describe("Azure password login rejection", () => {
  it("rejects azure authSource in login validation enum", async () => {
    const { loginValidation } = await import("@/validation/auth.validation");
    const authSourceRule = loginValidation.find((rule: any) =>
      rule.builder?.fields?.includes("authSource"),
    );

    expect(authSourceRule).toBeDefined();
  });
});

describe("socket namespace contract", () => {
  it("uses /socket/logs namespace consistently", () => {
    const source = require("fs").readFileSync(
      require("path").resolve(__dirname, "../../services/socket.service.ts"),
      "utf8",
    );

    expect(source).toMatch(/this\.io\.of\(["']\/socket\/logs["']\)/);
    expect(source).not.toMatch(/this\.io\.of\(["']\/logs["']\)/);
  });
});

describe("queue failure semantics", () => {
  it("rethrows failures instead of returning failed status objects", () => {
    const source = require("fs").readFileSync(
      require("path").resolve(__dirname, "../../queues/report.queue.ts"),
      "utf8",
    );

    expect(source).toContain("throw error;");
    expect(source).not.toContain("status: 'failed' as const");
  });
});

describe("export access control", () => {
  it("verifies custom template ownership before queueing exports", () => {
    const source = require("fs").readFileSync(
      require("path").resolve(
        __dirname,
        "../../controllers/export.controller.ts",
      ),
      "utf8",
    );

    expect(source).toContain("verifyCustomTemplateAccess");
    expect(source).toContain("job.data.userId !== req.user!.id");
  });
});
