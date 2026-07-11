import { CredentialContextManager } from "./CredentialContextManager";
import { Pool } from "pg";
import { DataSourceType, UserContext, QueryContext } from "./types";

// Mock Pool
jest.mock("pg", () => ({
  Pool: jest.fn().mockImplementation(() => ({
    query: jest.fn(),
  })),
}));

// Mock encryption utilities: v1 payloads decrypt via decrypt(); legacy payloads
// decrypt via decryptWithSalt(value, salt).
const mockDecrypt = jest.fn((value: string) => `decrypted:${value}`);
const mockDecryptWithSalt = jest.fn(
  (value: string, salt: string) => `decrypted:${value}:${salt}`,
);
jest.mock("../../utils/encryption", () => ({
  getCredentialEncryption: jest.fn(() => ({
    decrypt: mockDecrypt,
    decryptWithSalt: mockDecryptWithSalt,
  })),
}));

describe("CredentialContextManager", () => {
  let manager: CredentialContextManager;
  let mockPool: any;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Setup mock pool
    mockPool = new Pool();
    manager = new CredentialContextManager(mockPool);

    // Mock environment variables
    process.env.AD_USERNAME = "system-ad-user";
    process.env.AD_PASSWORD = "system-ad-pass";
    process.env.AD_DOMAIN = "DOMAIN";
    process.env.AZURE_TENANT_ID = "tenant-123";
    process.env.AZURE_CLIENT_ID = "client-123";
    process.env.AZURE_CLIENT_SECRET = "secret-123";
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.AD_USERNAME;
    delete process.env.AD_PASSWORD;
    delete process.env.AD_DOMAIN;
    delete process.env.AZURE_TENANT_ID;
    delete process.env.AZURE_CLIENT_ID;
    delete process.env.AZURE_CLIENT_SECRET;
  });

  describe("getCredentials", () => {
    it("should return system credentials when no context provided", async () => {
      const credentials = await manager.getCredentials("ad");

      expect(credentials).toEqual({
        username: "system-ad-user",
        password: "system-ad-pass",
        domain: "DOMAIN",
      });
    });

    it("should return system credentials when explicitly requested", async () => {
      const context: QueryContext = {
        user: { id: 1, email: "user@test.com", name: "Test User" },
        useSystemCredentials: true,
      };

      const credentials = await manager.getCredentials("ad", context);

      expect(credentials).toEqual({
        username: "system-ad-user",
        password: "system-ad-pass",
        domain: "DOMAIN",
      });
    });

    it("should return provided credentials from context", async () => {
      const context: QueryContext = {
        credentials: {
          username: "custom-user",
          password: "custom-pass",
        },
      };

      const credentials = await manager.getCredentials("ad", context);

      expect(credentials).toEqual({
        username: "custom-user",
        password: "custom-pass",
      });
    });

    it("should return user credentials when available", async () => {
      const mockCredential = {
        user_id: 1,
        service_type: "ad",
        username: "user-ad",
        encrypted_password: "v1:encrypted-pass",
        encryption_salt: "salt123",
        domain: "USER_DOMAIN",
      };

      mockPool.query.mockResolvedValue({
        rows: [mockCredential],
      });

      const context: QueryContext = {
        user: { id: 1, email: "user@test.com", name: "Test User" },
      };

      const credentials = await manager.getCredentials("ad", context);

      expect(mockPool.query).toHaveBeenCalledWith(
        "SELECT * FROM service_credentials WHERE user_id = $1 AND service_type = $2 AND is_active = true LIMIT 1",
        [1, "ad"],
      );

      expect(credentials).toEqual({
        username: "user-ad",
        password: "decrypted:v1:encrypted-pass",
        domain: "USER_DOMAIN",
      });
    });

    it("should fall back to system credentials if user credentials not found", async () => {
      mockPool.query.mockResolvedValue({
        rows: [],
      });

      const context: QueryContext = {
        user: { id: 1, email: "user@test.com", name: "Test User" },
      };

      const credentials = await manager.getCredentials("ad", context);

      expect(credentials).toEqual({
        username: "system-ad-user",
        password: "system-ad-pass",
        domain: "DOMAIN",
      });
    });

    it("should handle Azure credentials correctly", async () => {
      const credentials = await manager.getCredentials("azure");

      expect(credentials).toEqual({
        tenantId: "tenant-123",
        clientId: "client-123",
        clientSecret: "secret-123",
        username: "",
        password: "",
      });
    });

    it("should throw error for unknown data source type", async () => {
      await expect(
        manager.getCredentials("unknown" as DataSourceType),
      ).rejects.toThrow("Unknown data source type: unknown");
    });

    it("should throw error if required credentials are missing", async () => {
      delete process.env.AD_USERNAME;

      await expect(manager.getCredentials("ad")).rejects.toThrow(
        "AD credentials are not configured",
      );
    });
  });

  describe("Credential Caching", () => {
    it("should cache system credentials", async () => {
      // First call
      await manager.getCredentials("ad");

      // Second call should use cache
      await manager.getCredentials("ad");

      // Environment check should only happen once due to caching
      expect(manager.getMetrics().cacheSize).toBe(1);
    });

    it("should cache user credentials", async () => {
      const mockCredential = {
        user_id: 1,
        service_type: "ad",
        username: "user-ad",
        encryptedPassword: "encrypted-pass",
        salt: "salt123",
      };

      mockPool.query.mockResolvedValue({
        rows: [mockCredential],
      });

      const context: QueryContext = {
        user: { id: 1, email: "user@test.com", name: "Test User" },
      };

      // First call
      await manager.getCredentials("ad", context);

      // Second call should use cache
      await manager.getCredentials("ad", context);

      // Database query should only happen once
      expect(mockPool.query).toHaveBeenCalledTimes(1);
    });

    it("should respect cache TTL", async () => {
      // Set a very short TTL for testing
      (manager as any).cacheTTL = 100; // 100ms

      await manager.getCredentials("ad");

      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      // This should not use cache
      await manager.getCredentials("ad");

      // Should still only have one cache entry, but it should be fresh
      expect(manager.getMetrics().cacheSize).toBe(1);
    });
  });

  describe("clearCache", () => {
    beforeEach(async () => {
      // Populate cache with some entries
      await manager.getCredentials("ad");
      await manager.getCredentials("azure");

      const mockCredential = {
        user_id: 1,
        service_type: "ad",
        username: "user-ad",
        encryptedPassword: "encrypted",
        salt: "salt",
      };

      mockPool.query.mockResolvedValue({
        rows: [mockCredential],
      });

      await manager.getCredentials("ad", {
        user: { id: 1, email: "user@test.com", name: "Test" },
      });
    });

    it("should clear specific user and service cache", () => {
      expect(manager.getMetrics().cacheSize).toBe(3);

      manager.clearCache(1, "ad");

      expect(manager.getMetrics().cacheSize).toBe(2);
    });

    it("should clear all cache for a user", () => {
      manager.clearCache(1);

      expect(manager.getMetrics().cacheSize).toBe(2); // Only system caches remain
    });

    it("should clear entire cache", () => {
      manager.clearCache();

      expect(manager.getMetrics().cacheSize).toBe(0);
    });
  });

  describe("createContext", () => {
    it("should create context with system credentials", async () => {
      const context = await manager.createContext("ad");

      expect(context).toMatchObject({
        user: undefined,
        useSystemCredentials: undefined,
        credentials: {
          username: "system-ad-user",
          password: "system-ad-pass",
          domain: "DOMAIN",
        },
        startTime: expect.any(Date),
      });
    });

    it("should create context with user credentials", async () => {
      const user: UserContext = {
        id: 1,
        email: "user@test.com",
        name: "Test User",
      };

      const mockCredential = {
        user_id: 1,
        service_type: "ad",
        username: "user-ad",
        encrypted_password: "v1:encrypted",
        encryption_salt: "salt",
      };

      mockPool.query.mockResolvedValue({
        rows: [mockCredential],
      });

      const context = await manager.createContext("ad", user);

      expect(context).toMatchObject({
        user,
        credentials: {
          username: "user-ad",
          password: "decrypted:v1:encrypted",
        },
      });
    });

    it("should include request ID if provided", async () => {
      const context = await manager.createContext("ad", undefined, {
        requestId: "req-123",
      });

      expect(context.requestId).toBe("req-123");
    });
  });

  describe("decryptCredentials", () => {
    it("should decrypt a v1 password for AD credentials", async () => {
      const credential = {
        username: "test-user",
        encrypted_password: "v1:encrypted-pass",
        encryption_salt: "salt123",
        domain: "DOMAIN",
      };

      const decrypted = await (manager as any).decryptCredentials(credential);

      expect(mockDecrypt).toHaveBeenCalledWith("v1:encrypted-pass");
      expect(decrypted).toEqual({
        username: "test-user",
        password: "decrypted:v1:encrypted-pass",
        domain: "DOMAIN",
      });
    });

    it("should decrypt a legacy password using the stored salt", async () => {
      const credential = {
        username: "legacy-user",
        encrypted_password: "legacy-pass",
        encryption_salt: "salt123",
      };

      const decrypted = await (manager as any).decryptCredentials(credential);

      expect(mockDecryptWithSalt).toHaveBeenCalledWith(
        "legacy-pass",
        "salt123",
      );
      expect(decrypted.password).toBe("decrypted:legacy-pass:salt123");
    });

    it("should decrypt client secret for Azure/O365", async () => {
      const credential = {
        username: "not-used",
        tenant_id: "tenant-123",
        client_id: "client-123",
        encrypted_client_secret: "v1:encrypted-secret",
        encryption_salt: "salt123",
      };

      const decrypted = await (manager as any).decryptCredentials(credential);

      expect(decrypted).toEqual({
        username: "not-used",
        password: "",
        domain: undefined,
        tenantId: "tenant-123",
        clientId: "client-123",
        clientSecret: "decrypted:v1:encrypted-secret",
      });
    });

    it("should throw when credentials need regeneration", async () => {
      const credential = {
        username: "test",
        encrypted_password: "v1:encrypted",
        encryption_salt: "NEEDS_REGENERATION",
      };

      await expect(
        (manager as any).decryptCredentials(credential),
      ).rejects.toThrow(/need to be re-entered/i);
    });

    it("should throw for legacy credentials without a salt", async () => {
      const credential = {
        username: "test",
        encrypted_password: "legacy-pass",
      };

      await expect(
        (manager as any).decryptCredentials(credential),
      ).rejects.toThrow(/Cannot decrypt legacy password without salt/i);
    });

    it("should wrap underlying decryption errors as CredentialError", async () => {
      mockDecrypt.mockImplementationOnce(() => {
        throw new Error("bad auth tag");
      });
      const credential = {
        username: "test",
        encrypted_password: "v1:corrupt",
        encryption_salt: "salt",
      };

      await expect(
        (manager as any).decryptCredentials(credential),
      ).rejects.toThrow(/Failed to decrypt password/i);
    });
  });

  describe("getMetrics", () => {
    it("should return cache metrics", async () => {
      await manager.getCredentials("ad");
      await manager.getCredentials("azure");

      const metrics = manager.getMetrics();

      expect(metrics).toMatchObject({
        cacheSize: 2,
        cacheTTL: 300000,
        cachedCredentials: expect.arrayContaining([
          { type: "system", id: "ad", service: undefined },
          { type: "system", id: "azure", service: undefined },
        ]),
      });
    });
  });
});
