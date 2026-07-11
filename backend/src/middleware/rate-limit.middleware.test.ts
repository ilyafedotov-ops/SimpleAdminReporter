const mockMiddleware = jest.fn();
const mockRateLimit = jest.fn().mockReturnValue(mockMiddleware);

jest.mock("express-rate-limit", () => mockRateLimit);

jest.mock("@/config/redis", () => ({
  redis: {
    getClient: jest.fn().mockReturnValue({
      call: jest.fn().mockResolvedValue(1),
    }),
  },
}));

import {
  loginRateLimiter,
  passwordResetRateLimiter,
  apiRateLimiter,
  reportRateLimiter,
  createLoginRateLimiter,
  refreshTokenRateLimiter,
  authEndpointsRateLimiter,
  adminRateLimiter,
  logsQueryRateLimiter,
  logsExportRateLimiter,
  logsStreamRateLimiter,
} from "./rate-limit.middleware";

const EXPECTED_LIMITERS = [
  {
    name: "loginRateLimiter",
    limiter: loginRateLimiter,
    windowMs: 15 * 60 * 1000,
    max: () => 500,
  },
  {
    name: "passwordResetRateLimiter",
    limiter: passwordResetRateLimiter,
    windowMs: 60 * 60 * 1000,
    max: 3,
  },
  {
    name: "apiRateLimiter",
    limiter: apiRateLimiter,
    windowMs: 15 * 60 * 1000,
    max: 100,
  },
  {
    name: "reportRateLimiter",
    limiter: reportRateLimiter,
    windowMs: 10 * 60 * 1000,
    max: 10,
  },
  {
    name: "refreshTokenRateLimiter",
    limiter: refreshTokenRateLimiter,
    windowMs: 15 * 60 * 1000,
    max: () => 1000,
  },
  {
    name: "authEndpointsRateLimiter",
    limiter: authEndpointsRateLimiter,
    windowMs: 15 * 60 * 1000,
    max: () => 1000,
  },
  {
    name: "adminRateLimiter",
    limiter: adminRateLimiter,
    windowMs: 15 * 60 * 1000,
    max: 50,
  },
  {
    name: "logsQueryRateLimiter",
    limiter: logsQueryRateLimiter,
    windowMs: 10 * 60 * 1000,
    max: () => 10000,
  },
  {
    name: "logsExportRateLimiter",
    limiter: logsExportRateLimiter,
    windowMs: 15 * 60 * 1000,
    max: () => 1000,
  },
  {
    name: "logsStreamRateLimiter",
    limiter: logsStreamRateLimiter,
    windowMs: 10 * 60 * 1000,
    max: 10,
  },
] as const;

describe("Rate Limit Middleware", () => {
  beforeEach(() => {
    mockMiddleware.mockClear();
  });

  it("creates ten standard rate limiters at module load", () => {
    expect(mockRateLimit).toHaveBeenCalledTimes(10);
  });

  it("exports middleware functions for each limiter", () => {
    EXPECTED_LIMITERS.forEach(({ limiter }) => {
      expect(typeof limiter).toBe("function");
    });
  });

  it("configures standard headers for all limiters", () => {
    mockRateLimit.mock.calls.forEach((call) => {
      expect(call[0]).toEqual(
        expect.objectContaining({
          standardHeaders: true,
          legacyHeaders: false,
        }),
      );
    });
  });

  it("uses shared error message object for all limiters", () => {
    const messages = mockRateLimit.mock.calls.map((call) => call[0]?.message);
    messages.forEach((message) => {
      expect(message).toEqual(
        expect.objectContaining({
          error: "Too many requests",
          message: "Rate limit exceeded. Please try again later.",
        }),
      );
    });
  });

  it("configures expected window and max values", () => {
    const resolveMax = (max: number | (() => number)) =>
      typeof max === "function" ? max() : max;

    EXPECTED_LIMITERS.forEach(({ windowMs, max }) => {
      const config = mockRateLimit.mock.calls.find(
        (call) =>
          call[0]?.windowMs === windowMs &&
          resolveMax(call[0]?.max) === resolveMax(max),
      );
      expect(config).toBeDefined();
    });
  });

  it("skips Redis store in test environment by default", () => {
    mockRateLimit.mock.calls.forEach((call) => {
      expect(call[0]?.store).toBeUndefined();
    });
  });

  it("executes exported middleware without throwing", () => {
    const req = { ip: "127.0.0.1" } as any;
    const res = {} as any;
    const next = jest.fn();

    EXPECTED_LIMITERS.forEach(({ limiter }) => {
      expect(() => limiter(req, res, next)).not.toThrow();
      expect(mockMiddleware).toHaveBeenCalledWith(req, res, next);
    });
  });

  it("allows createLoginRateLimiter factory to create additional limiter", () => {
    const beforeCount = mockRateLimit.mock.calls.length;
    const customLimiter = createLoginRateLimiter({ max: 10 });
    expect(mockRateLimit.mock.calls.length).toBe(beforeCount + 1);
    expect(typeof customLimiter).toBe("function");
  });
});
