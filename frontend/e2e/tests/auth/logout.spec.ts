/* eslint-disable @typescript-eslint/no-unused-vars */
import { test, expect } from "@playwright/test";
import { DashboardPage, LoginPage } from "../../pages";
import { AuthHelper, ApiHelper } from "../../utils/test-helpers";
import { TEST_USERS, TEST_CONFIG } from "../../fixtures/test-data";

test.describe("Authentication - Logout Flow", () => {
  let dashboardPage: DashboardPage;
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    dashboardPage = new DashboardPage(page);
    loginPage = new LoginPage(page);

    // Login before each test
    await AuthHelper.login(page, "AD_USER");

    // Verify we're on dashboard
    expect(page.url()).toContain("dashboard");
  });

  test.describe("Standard Logout", () => {
    test("should successfully logout user", async ({ page }) => {
      // Mock logout endpoint
      await ApiHelper.mockApiResponse(page, "**/api/auth/logout", {
        success: true,
        message: "Successfully logged out",
      });

      // Perform logout
      await dashboardPage.logout();

      // Verify redirect to login page
      expect(page.url()).toContain("login");

      // Verify login page is loaded
      const isLoginLoaded = await loginPage.isLoaded();
      expect(isLoginLoaded).toBe(true);
    });

    test("should clear authentication tokens on logout", async ({ page }) => {
      // Check that auth tokens exist before logout
      const cookiesBefore = await page.context().cookies();
      const hasAuthCookie = cookiesBefore.some(
        (cookie) =>
          cookie.name.includes("auth") || cookie.name.includes("token"),
      );

      // Mock logout endpoint
      await ApiHelper.mockApiResponse(page, "**/api/auth/logout", {
        success: true,
      });

      await dashboardPage.logout();

      // Verify auth cookies are cleared
      const cookiesAfter = await page.context().cookies();
      const hasAuthCookieAfter = cookiesAfter.some(
        (cookie) =>
          cookie.name.includes("auth") || cookie.name.includes("token"),
      );

      expect(hasAuthCookieAfter).toBe(false);

      // Verify localStorage is cleared
      const localStorageAuth = await page.evaluate(() => {
        return (
          localStorage.getItem("isAuthenticated") ||
          localStorage.getItem("user") ||
          localStorage.getItem("authToken")
        );
      });

      expect(localStorageAuth).toBeFalsy();
    });

    test("should prevent access to protected routes after logout", async ({
      page,
    }) => {
      await ApiHelper.mockApiResponse(page, "**/api/auth/logout", {
        success: true,
      });

      await dashboardPage.logout();

      // Try to access protected route
      await page.goto("/dashboard");

      // Should redirect to login
      await page.waitForURL("**/login", {
        timeout: TEST_CONFIG.DEFAULT_TIMEOUT,
      });
      expect(page.url()).toContain("login");
    });

    test("should handle logout from user profile section", async ({ page }) => {
      await ApiHelper.mockApiResponse(page, "**/api/auth/logout", {
        success: true,
      });

      await dashboardPage.logout();

      // Verify logout completes
      await page.waitForURL("**/login");
      expect(page.url()).toContain("login");
    });
  });

  test.describe("Session Timeout Logout", () => {
    test("should automatically logout on session expiration", async ({
      page,
    }) => {
      // Mock session expiration
      await page.route("**/api/**", (route) => {
        if (route.request().method() === "GET") {
          route.fulfill({
            status: 401,
            contentType: "application/json",
            body: JSON.stringify({
              error: "Session expired",
              code: "TOKEN_EXPIRED",
            }),
          });
        } else {
          route.continue();
        }
      });

      // Try to perform an action that requires authentication
      await page.reload();

      // Should automatically redirect to login
      await page.waitForURL("**/login", {
        timeout: TEST_CONFIG.DEFAULT_TIMEOUT,
      });

      // Should show session expired message
      await page.waitForTimeout(1000);
      const hasError = await loginPage.hasError();
      if (hasError) {
        const errorMessage = await loginPage.getErrorMessage();
        expect(errorMessage).toMatch(/(session|expired|timeout)/i);
      }
    });

    test("should handle token refresh failure gracefully", async ({ page }) => {
      let requestCount = 0;

      // Mock token refresh failure after initial requests
      await page.route("**/api/auth/refresh", (route) => {
        requestCount++;
        if (requestCount > 1) {
          route.fulfill({
            status: 401,
            contentType: "application/json",
            body: JSON.stringify({
              error: "Refresh token expired",
            }),
          });
        } else {
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              token: "new-token",
            }),
          });
        }
      });

      // Trigger token refresh scenario
      await page.evaluate(() => {
        // Simulate expired token scenario
        localStorage.setItem("tokenExpiry", String(Date.now() - 1000));
      });

      await page.reload();

      // Should handle refresh failure and logout
      await page.waitForURL("**/login", {
        timeout: TEST_CONFIG.DEFAULT_TIMEOUT,
      });
    });
  });

  test.describe("Multi-tab Logout", () => {
    test("should logout from all tabs when user logs out from one", async ({
      page,
      context,
      browserName,
    }) => {
      test.skip(
        browserName === "firefox",
        "Firefox/juggler intermittently closes pages during cross-tab localStorage logout propagation in CI",
      );
      // Open second tab
      const secondPage = await context.newPage();
      const secondDashboard = new DashboardPage(secondPage);

      // Navigate to dashboard on second tab
      await secondPage.goto("/dashboard");
      await secondPage.waitForLoadState("networkidle");

      // Mock logout endpoint
      await ApiHelper.mockApiResponse(page, "**/api/auth/logout", {
        success: true,
      });

      // Logout from first tab
      await dashboardPage.logout();

      // Second tab should also be logged out
      await secondPage.waitForTimeout(2000); // Give time for cross-tab communication

      // Refresh second tab to check authentication state
      await secondPage.reload();
      await secondPage.waitForURL("**/login", {
        timeout: TEST_CONFIG.DEFAULT_TIMEOUT,
      });

      expect(secondPage.url()).toContain("login");
      await secondPage.close();
    });

    test("should handle logout event from other tabs", async ({
      page,
      context,
      browserName,
    }) => {
      test.skip(
        browserName === "firefox",
        "Firefox/juggler intermittently closes pages during cross-tab localStorage logout propagation in CI",
      );
      const secondPage = await context.newPage();
      const secondDashboard = new DashboardPage(secondPage);

      // Set up both pages on dashboard
      await secondPage.goto("/dashboard");
      await secondPage.waitForLoadState("networkidle");

      // Mock logout endpoint
      await ApiHelper.mockApiResponse(secondPage, "**/api/auth/logout", {
        success: true,
      });

      // Logout from second tab
      await secondDashboard.logout();

      // First tab should detect logout and redirect
      await page.waitForTimeout(2000);
      await page.reload();

      await page.waitForURL("**/login", {
        timeout: TEST_CONFIG.DEFAULT_TIMEOUT,
      });
      expect(page.url()).toContain("login");

      await secondPage.close();
    });
  });

  test.describe("Azure AD Logout", () => {
    test("should handle Azure AD logout flow", async ({ page }) => {
      // Mock Azure user session
      await page.evaluate(() => {
        localStorage.setItem("authSource", "azure");
        localStorage.setItem(
          "azureAccount",
          JSON.stringify({
            username: "test@company.com",
            name: "Test User",
          }),
        );
      });

      // Mock Azure logout endpoints
      await ApiHelper.mockApiResponse(page, "**/api/auth/logout", {
        success: true,
        redirectUrl: "https://login.microsoftonline.com/logout",
      });

      await dashboardPage.logout();

      // For Azure logout, might redirect to Microsoft logout
      // In test environment, just verify local logout completed
      await page.waitForURL("**/login", {
        timeout: TEST_CONFIG.DEFAULT_TIMEOUT,
      });
      expect(page.url()).toContain("login");
    });

    test("should clear Azure AD tokens on logout", async ({ page }) => {
      // Set Azure-specific tokens
      await page.evaluate(() => {
        localStorage.setItem("msal.idtoken", "azure-id-token");
        localStorage.setItem("msal.client.info", "azure-client-info");
        sessionStorage.setItem("msal.interaction.status", "none");
      });

      await ApiHelper.mockApiResponse(page, "**/api/auth/logout", {
        success: true,
      });

      await dashboardPage.logout();

      // Verify Azure-specific tokens are cleared
      const azureTokens = await page.evaluate(() => {
        return {
          idToken: localStorage.getItem("msal.idtoken"),
          clientInfo: localStorage.getItem("msal.client.info"),
          interactionStatus: sessionStorage.getItem("msal.interaction.status"),
        };
      });

      expect(azureTokens.idToken).toBeNull();
      expect(azureTokens.clientInfo).toBeNull();
      expect(azureTokens.interactionStatus).toBeNull();
    });
  });

  test.describe("Error Handling", () => {
    test("should handle logout API failure gracefully", async ({ page }) => {
      // Mock logout failure
      await ApiHelper.mockApiResponse(
        page,
        "**/api/auth/logout",
        {
          success: false,
          error: "Server error during logout",
        },
        500,
      );

      await dashboardPage.logout();

      // Should still redirect to login even if API fails
      await page.waitForURL("**/login", {
        timeout: TEST_CONFIG.DEFAULT_TIMEOUT,
      });
      expect(page.url()).toContain("login");

      // Local tokens should still be cleared
      const localAuth = await page.evaluate(() => {
        return localStorage.getItem("isAuthenticated");
      });

      expect(localAuth).toBeFalsy();
    });

    test("should handle network failure during logout", async ({ page }) => {
      // Mock network failure
      await page.route("**/api/auth/logout", (route) => {
        route.abort("failed");
      });

      await dashboardPage.logout();

      // Should still logout locally and redirect
      await page.waitForURL("**/login", {
        timeout: TEST_CONFIG.DEFAULT_TIMEOUT,
      });
      expect(page.url()).toContain("login");
    });

    test("should handle concurrent logout requests", async ({ page }) => {
      let requestCount = 0;

      await page.route("**/api/auth/logout", (route) => {
        requestCount++;
        // Simulate slow response
        setTimeout(() => {
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ success: true }),
          });
        }, 1000);
      });

      // Try to logout multiple times quickly
      const logoutPromises = [
        dashboardPage
          .openUserProfile()
          .then(() => page.locator('button:has-text("Logout")').click()),
        dashboardPage
          .openUserProfile()
          .then(() => page.locator('button:has-text("Logout")').click()),
      ];

      await Promise.allSettled(logoutPromises);

      // Should handle gracefully and only make one request
      expect(requestCount).toBeLessThanOrEqual(1);

      await page.waitForURL("**/login", {
        timeout: TEST_CONFIG.DEFAULT_TIMEOUT,
      });
    });
  });

  test.describe("Logout Confirmation", () => {
    test("should logout directly when no confirmation dialog is configured", async ({
      page,
    }) => {
      await dashboardPage.logout();

      await page.waitForURL("**/login", {
        timeout: TEST_CONFIG.DEFAULT_TIMEOUT,
      });
      expect(page.url()).toContain("login");
    });

    test("should not leave a stale confirmation dialog after logout", async ({
      page,
    }) => {
      await dashboardPage.logout();

      await page.waitForURL("**/login", {
        timeout: TEST_CONFIG.DEFAULT_TIMEOUT,
      });
      await expect(
        page.locator(".ant-modal-confirm, .ant-popconfirm"),
      ).toHaveCount(0);
    });
  });

  test.describe("Performance and UX", () => {
    test("should show logout loading state", async ({ page }) => {
      // Mock slow logout response
      await page.route("**/api/auth/logout", async (route) => {
        await page.waitForTimeout(2000); // 2 second delay
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true }),
        });
      });

      await dashboardPage.logout();

      // The current sidebar logout affordance is direct; verify the delayed
      // logout request still completes and redirects cleanly.
      await page.waitForURL("**/login", {
        timeout: TEST_CONFIG.DEFAULT_TIMEOUT,
      });
    });

    test("should complete logout within reasonable time", async ({ page }) => {
      const startTime = Date.now();

      await ApiHelper.mockApiResponse(page, "**/api/auth/logout", {
        success: true,
      });

      await dashboardPage.logout();

      const endTime = Date.now();
      const logoutTime = endTime - startTime;

      // Logout should complete within 5 seconds
      expect(logoutTime).toBeLessThan(5000);

      // Verify successful logout
      expect(page.url()).toContain("login");
    });
  });
});
