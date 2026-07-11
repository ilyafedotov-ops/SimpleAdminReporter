import { beforeEach, describe, expect, it, vi } from "vitest";
import apiService from "./api";
import { CookieAuthService } from "./authService.cookie";

vi.mock("./api", () => ({
  default: {
    client: {
      defaults: {
        headers: {
          common: {},
        },
      },
    },
    get: vi.fn().mockResolvedValue({
      success: true,
      data: { method: "cookie" },
    }),
    post: vi.fn(),
  },
}));

describe("CookieAuthService", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    window.history.replaceState(null, "", "/dashboard");
  });

  const user = {
    id: "1",
    username: "testuser",
    displayName: "Test User",
    email: "test@example.com",
    authSource: "local" as const,
    roles: ["user"],
    permissions: [],
    isActive: true,
  };

  const credentials = {
    username: "testuser",
    password: "password",
    authSource: "local" as const,
  };

  it("clears a stale logout marker after successful cookie login", async () => {
    localStorage.setItem("auth:logout", "1234567890");
    vi.mocked(apiService.post).mockResolvedValueOnce({
      success: true,
      data: {
        user,
        csrfToken: "csrf-token",
      },
    });
    const service = new CookieAuthService();

    await service.login(credentials);

    expect(localStorage.getItem("auth:logout")).toBeNull();
    expect(service.getCurrentAuthState()).toMatchObject({
      user,
      isAuthenticated: true,
    });
  });

  it("ignores cross-tab logout marker removal events", async () => {
    localStorage.setItem("auth:logout", "1234567890");
    vi.mocked(apiService.post).mockResolvedValueOnce({
      success: true,
      data: {
        user,
        csrfToken: "csrf-token",
      },
    });
    const service = new CookieAuthService();
    await service.login(credentials);
    service.setupTokenRefresh();

    window.dispatchEvent(
      new window.StorageEvent("storage", {
        key: "auth:logout",
        oldValue: "1234567890",
        newValue: null,
        storageArea: localStorage,
      }),
    );

    expect(localStorage.getItem("auth:logout")).toBeNull();
    expect(window.location.pathname).not.toBe("/login");
    expect(service.getCurrentAuthState()).toMatchObject({
      user,
      isAuthenticated: true,
    });
  });

  it("retains a stale logout marker after failed cookie login", async () => {
    localStorage.setItem("auth:logout", "1234567890");
    vi.mocked(apiService.post).mockResolvedValueOnce({
      success: false,
      error: "Invalid credentials",
    });
    const service = new CookieAuthService();

    await service.login(credentials);

    expect(localStorage.getItem("auth:logout")).toBe("1234567890");
    expect(service.getCurrentAuthState()).toMatchObject({
      user: null,
      isAuthenticated: false,
    });
  });
});
