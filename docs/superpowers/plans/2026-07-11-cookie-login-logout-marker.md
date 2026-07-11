# Cookie Login Logout Marker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent a stale `auth:logout` marker from invalidating a newly established cookie-auth session.

**Architecture:** Keep the existing cross-tab logout signal and auth-state predicate unchanged. Treat a successful `/auth/login` response as a newer authentication event by removing the persisted logout marker before storing the returned user.

**Tech Stack:** TypeScript, Vitest, jsdom, Vite

## Global Constraints

- Change only the successful cookie-login path.
- Do not change logout broadcasting or storage-event handling.
- Failed logins must retain the existing logout marker.
- Add a regression test before changing production code.

---

## File Structure

- Create `frontend/src/services/authService.cookie.test.ts`: focused unit regression coverage for cookie-auth login state persistence.
- Modify `frontend/src/services/authService.cookie.ts`: clear the obsolete logout marker after a successful login.

### Task 1: Preserve a New Cookie Session After an Earlier Logout

**Files:**

- Create: `frontend/src/services/authService.cookie.test.ts`
- Modify: `frontend/src/services/authService.cookie.ts:76-88`

**Interfaces:**

- Consumes: `CookieAuthService.login(credentials: LoginRequest): Promise<ApiResponse<AuthResponseData>>` and `CookieAuthService.getCurrentAuthState(): AuthState`.
- Produces: successful cookie login removes the `localStorage` key `auth:logout`; no public interface changes.

- [ ] **Step 1: Write the failing regression test**

Create `frontend/src/services/authService.cookie.test.ts` with:

```typescript
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
  });

  it("clears a stale logout marker after successful cookie login", async () => {
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
});
```

- [ ] **Step 2: Run the test to verify the regression is reproduced**

Run:

```bash
npm --prefix frontend run test:unit:run -- src/services/authService.cookie.test.ts
```

Expected: FAIL because `localStorage.getItem("auth:logout")` remains `"1234567890"` and the subsequent auth-state read clears the user.

- [ ] **Step 3: Implement the minimal production fix**

In the successful response branch of `CookieAuthService.login`, remove the stale marker before storing the new session:

```typescript
if (response.success && response.data) {
  const authData = response.data;
  this.csrfToken = authData.csrfToken;
  this.user = authData.user;
  localStorage.removeItem("auth:logout");
  localStorage.removeItem("sessionId");

  sessionStorage.setItem("user", JSON.stringify(authData.user));

  if (authData.accessToken && authData.refreshToken) {
    localStorage.setItem("accessToken", authData.accessToken);
    localStorage.setItem("refreshToken", authData.refreshToken);
    localStorage.setItem("user", JSON.stringify(authData.user));
  }
}
```

- [ ] **Step 4: Run the focused test to verify the fix**

Run:

```bash
npm --prefix frontend run test:unit:run -- src/services/authService.cookie.test.ts
```

Expected: PASS with one passing test.

- [ ] **Step 5: Run frontend type checking and relevant service tests**

Run:

```bash
npm --prefix frontend run type-check
npm --prefix frontend run test:unit:run -- src/services/authService.cookie.test.ts src/services/authService.test.ts src/services/__tests__/authService.test.ts
```

Expected: both commands exit successfully; the new regression test and existing auth-service tests pass.

- [ ] **Step 6: Commit the implementation**

```bash
git add frontend/src/services/authService.cookie.test.ts frontend/src/services/authService.cookie.ts
git commit -m "fix(frontend): clear stale logout marker on cookie login"
```
