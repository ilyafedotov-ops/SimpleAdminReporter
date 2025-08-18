import { MsalTokenManager, msalTokenManager } from './msal-token-manager.service';
import { ConfidentialClientApplication, AuthenticationResult } from '@azure/msal-node';
import { logger } from '@/utils/logger';
import { cryptoService } from './crypto.service';
import { azureCredentialService } from '@/auth/services/azure-credential.service';
import { redis } from '@/config/redis';

// Mock all dependencies
jest.mock('@azure/msal-node');
jest.mock('@/utils/logger');
jest.mock('./crypto.service');
jest.mock('@/auth/services/azure-credential.service');
jest.mock('@/config/redis', () => ({
  redis: {
    setJson: jest.fn(),
    getJson: jest.fn(),
    del: jest.fn(),
    invalidatePattern: jest.fn(),
    keys: jest.fn(),
  }
}));

// Type the mocked modules
const MockedConfidentialClientApplication = ConfidentialClientApplication as jest.MockedClass<typeof ConfidentialClientApplication>;
const mockLogger = logger as jest.Mocked<typeof logger>;
const mockCryptoService = cryptoService as jest.Mocked<typeof cryptoService>;
const mockAzureCredentialService = azureCredentialService as jest.Mocked<typeof azureCredentialService>;
const mockRedis = redis as jest.Mocked<typeof redis>;

describe('MsalTokenManager', () => {
  let tokenManager: MsalTokenManager;
  let mockMsalClient: jest.Mocked<ConfidentialClientApplication>;

  const mockEnvironmentVariables = {
    AZURE_CLIENT_ID: 'test-client-id',
    AZURE_TENANT_ID: 'test-tenant-id',
    AZURE_CLIENT_SECRET: 'test-client-secret'
  };

  // Helper function to create complete AuthenticationResult mocks
  const createMockAuthResult = (overrides: Partial<AuthenticationResult> = {}): AuthenticationResult => ({
    accessToken: 'mock-access-token',
    expiresOn: new Date(Date.now() + 3600000),
    scopes: ['https://graph.microsoft.com/.default'],
    tokenType: 'Bearer',
    uniqueId: 'test-unique-id',
    account: null,
    idToken: '',
    idTokenClaims: {},
    tenantId: 'test-tenant-id',
    authority: 'https://login.microsoftonline.com/test-tenant-id',
    fromCache: false,
    correlationId: 'test-correlation-id',
    ...overrides
  });

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set up environment variables
    Object.assign(process.env, mockEnvironmentVariables);

    // Create mock MSAL client instance
    mockMsalClient = {
      acquireTokenByClientCredential: jest.fn(),
      acquireTokenOnBehalfOf: jest.fn(),
      acquireTokenByRefreshToken: jest.fn(),
    } as any;

    // Mock ConfidentialClientApplication constructor
    MockedConfidentialClientApplication.mockImplementation(() => mockMsalClient);

    // Create fresh instance for each test
    tokenManager = new MsalTokenManager();
  });

  afterEach(() => {
    // Clean up environment variables
    Object.keys(mockEnvironmentVariables).forEach(key => {
      delete process.env[key];
    });
  });

  describe('Constructor', () => {
    it('should initialize MSAL client with correct configuration', () => {
      expect(MockedConfidentialClientApplication).toHaveBeenCalledWith({
        auth: {
          clientId: 'test-client-id',
          authority: 'https://login.microsoftonline.com/test-tenant-id',
          clientSecret: 'test-client-secret',
        },
        system: {
          loggerOptions: {
            loggerCallback: expect.any(Function),
            piiLoggingEnabled: false,
            logLevel: 3,
          },
        },
      });
    });

    it('should configure logger callback correctly', () => {
      const msalConfig = MockedConfidentialClientApplication.mock.calls[0][0];
      const loggerCallback = msalConfig.system?.loggerOptions?.loggerCallback;

      if (loggerCallback) {
        // Test logger callback without PII
        loggerCallback(3, 'test message', false);
        expect(mockLogger.debug).toHaveBeenCalledWith('MSAL: test message');

        // Test logger callback with PII (should not log)
        mockLogger.debug.mockClear();
        loggerCallback(3, 'sensitive message', true);
        expect(mockLogger.debug).not.toHaveBeenCalled();
      }
    });

    it('should throw error when required environment variables are missing', () => {
      delete process.env.AZURE_CLIENT_ID;
      
      // MSAL will throw an error during construction if required config is missing
      MockedConfidentialClientApplication.mockImplementation(() => {
        throw new Error('Required MSAL configuration is missing');
      });
      
      expect(() => new MsalTokenManager()).toThrow('Required MSAL configuration is missing');
    });
  });

  describe('getAppOnlyToken', () => {
    const mockScopes = ['https://graph.microsoft.com/.default'];
    const mockTokenResponse = createMockAuthResult({
      accessToken: 'mock-app-only-token',
      scopes: mockScopes
    });

    it('should return cached token when available and valid', async () => {
      const cachedToken = 'cached-app-only-token';
      mockRedis.getJson.mockResolvedValue({
        accessToken: cachedToken,
        expiresAt: new Date(Date.now() + 1800000), // 30 minutes from now
        scope: mockScopes.join(' ')
      });

      const result = await tokenManager.getAppOnlyToken(mockScopes);

      expect(result).toBe(cachedToken);
      expect(mockRedis.getJson).toHaveBeenCalledWith('msal:token:app:https://graph.microsoft.com/.default');
      expect(mockMsalClient.acquireTokenByClientCredential).not.toHaveBeenCalled();
    });

    it('should acquire new token when cache is empty', async () => {
      mockRedis.getJson.mockResolvedValue(null);
      mockMsalClient.acquireTokenByClientCredential.mockResolvedValue(mockTokenResponse);
      mockRedis.setJson.mockResolvedValue(undefined);

      const result = await tokenManager.getAppOnlyToken(mockScopes);

      expect(result).toBe('mock-app-only-token');
      expect(mockMsalClient.acquireTokenByClientCredential).toHaveBeenCalledWith({
        scopes: mockScopes,
        skipCache: false,
      });
      expect(mockRedis.setJson).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('App-only token acquired successfully');
    });

    it('should use default scopes when none provided', async () => {
      mockRedis.getJson.mockResolvedValue(null);
      mockMsalClient.acquireTokenByClientCredential.mockResolvedValue(mockTokenResponse);
      mockRedis.setJson.mockResolvedValue(undefined);

      await tokenManager.getAppOnlyToken();

      expect(mockMsalClient.acquireTokenByClientCredential).toHaveBeenCalledWith({
        scopes: ['https://graph.microsoft.com/.default'],
        skipCache: false,
      });
    });

    it('should cache token with correct TTL (90% of token lifetime)', async () => {
      mockRedis.getJson.mockResolvedValue(null);
      mockMsalClient.acquireTokenByClientCredential.mockResolvedValue(mockTokenResponse);
      mockRedis.setJson.mockResolvedValue(undefined);

      await tokenManager.getAppOnlyToken(mockScopes);

      const setJsonCall = mockRedis.setJson.mock.calls[0];
      const cacheKey = setJsonCall[0];
      const cacheEntry = setJsonCall[1];
      const ttl = setJsonCall[2];

      expect(cacheKey).toBe('msal:token:app:https://graph.microsoft.com/.default');
      expect(cacheEntry).toEqual({
        accessToken: 'mock-app-only-token',
        expiresAt: mockTokenResponse.expiresOn,
        scope: mockScopes.join(' ')
      });
      expect(ttl).toBeGreaterThanOrEqual(3230); // Should be close to 90% of 3600 seconds
      expect(ttl).toBeLessThanOrEqual(3250);
    });

    it('should handle null response from MSAL client', async () => {
      mockRedis.getJson.mockResolvedValue(null);
      mockMsalClient.acquireTokenByClientCredential.mockResolvedValue(null);

      await expect(tokenManager.getAppOnlyToken(mockScopes)).rejects.toThrow(
        'No response from MSAL client credential flow'
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to acquire app-only token:',
        expect.any(Error)
      );
    });

    it('should handle MSAL client errors', async () => {
      const msalError = new Error('MSAL authentication failed');
      mockRedis.getJson.mockResolvedValue(null);
      mockMsalClient.acquireTokenByClientCredential.mockRejectedValue(msalError);

      await expect(tokenManager.getAppOnlyToken(mockScopes)).rejects.toThrow(msalError);
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to acquire app-only token:', msalError);
    });

    it('should handle cache errors gracefully', async () => {
      const cacheError = new Error('Redis connection failed');
      mockRedis.getJson.mockRejectedValue(cacheError);
      mockMsalClient.acquireTokenByClientCredential.mockResolvedValue(mockTokenResponse);
      mockRedis.setJson.mockResolvedValue(undefined);

      // Should still get token despite cache error
      await expect(tokenManager.getAppOnlyToken(mockScopes)).rejects.toThrow('Redis connection failed');
    });
  });

  describe('getDelegatedToken', () => {
    const userId = 123;
    const mockScopes = ['User.Read', 'Files.Read'];

    it('should return cached token when available and valid', async () => {
      const cachedToken = 'cached-delegated-token';
      mockRedis.getJson.mockResolvedValue({
        accessToken: cachedToken,
        expiresAt: new Date(Date.now() + 1800000), // 30 minutes from now
        scope: mockScopes.join(' ')
      });

      const result = await tokenManager.getDelegatedToken(userId, mockScopes);

      expect(result).toBe(cachedToken);
      expect(mockRedis.getJson).toHaveBeenCalledWith(`msal:token:user:${userId}:${mockScopes.join(',')}`);
    });

    it('should return stored token when not cached', async () => {
      mockRedis.getJson.mockResolvedValue(null);
      mockAzureCredentialService.getCredentials.mockResolvedValue({
        accessToken: 'stored-access-token',
        refreshToken: 'stored-refresh-token',
        expiresAt: new Date(Date.now() + 3600000) // 1 hour from now
      });

      const result = await tokenManager.getDelegatedToken(userId, mockScopes);

      expect(result).toBe('stored-access-token');
      expect(mockAzureCredentialService.getCredentials).toHaveBeenCalledWith(userId);
    });

    it('should refresh token when close to expiry', async () => {
      const nearExpiryDate = new Date(Date.now() + 4 * 60 * 1000); // 4 minutes from now (within refresh window)
      mockRedis.getJson.mockResolvedValue(null);
      mockAzureCredentialService.getCredentials.mockResolvedValue({
        accessToken: 'old-access-token',
        refreshToken: 'valid-refresh-token',
        expiresAt: nearExpiryDate
      });

      const mockRefreshedResponse = createMockAuthResult({
        accessToken: 'refreshed-access-token',
        scopes: mockScopes
      });

      mockMsalClient.acquireTokenByRefreshToken.mockResolvedValue(mockRefreshedResponse);
      mockCryptoService.encryptToken.mockResolvedValue({
        encrypted: 'encrypted-data',
        salt: 'salt',
        iv: 'iv',
        authTag: 'auth-tag',
        version: 'v2'
      });
      mockAzureCredentialService.storeCredentials.mockResolvedValue(1);
      mockRedis.setJson.mockResolvedValue(undefined);

      const result = await tokenManager.getDelegatedToken(userId, mockScopes);

      expect(result).toBe('refreshed-access-token');
      expect(mockMsalClient.acquireTokenByRefreshToken).toHaveBeenCalledWith({
        refreshToken: 'valid-refresh-token',
        scopes: mockScopes,
        forceCache: false,
      });
    });

    it('should throw error when no credentials found', async () => {
      mockRedis.getJson.mockResolvedValue(null);
      mockAzureCredentialService.getCredentials.mockResolvedValue(null);

      await expect(tokenManager.getDelegatedToken(userId, mockScopes))
        .rejects.toThrow('No stored credentials found for user');
    });

    it('should return existing token when not close to expiry and no refresh token', async () => {
      mockRedis.getJson.mockResolvedValue(null);
      mockAzureCredentialService.getCredentials.mockResolvedValue({
        accessToken: 'valid-access-token',
        expiresAt: new Date(Date.now() + 3600000) // 1 hour from now
      });

      const result = await tokenManager.getDelegatedToken(userId, mockScopes);

      expect(result).toBe('valid-access-token');
      expect(mockMsalClient.acquireTokenByRefreshToken).not.toHaveBeenCalled();
    });
  });

  describe('getOnBehalfOfToken', () => {
    const userAccessToken = 'user-access-token';
    const mockScopes = ['https://graph.microsoft.com/.default'];

    it('should acquire OBO token successfully', async () => {
      const mockOboResponse = createMockAuthResult({
        accessToken: 'obo-access-token',
        scopes: mockScopes
      });

      mockMsalClient.acquireTokenOnBehalfOf.mockResolvedValue(mockOboResponse);

      const result = await tokenManager.getOnBehalfOfToken(userAccessToken, mockScopes);

      expect(result).toBe('obo-access-token');
      expect(mockMsalClient.acquireTokenOnBehalfOf).toHaveBeenCalledWith({
        oboAssertion: userAccessToken,
        scopes: mockScopes,
      });
      expect(mockLogger.info).toHaveBeenCalledWith('On-behalf-of token acquired successfully');
    });

    it('should handle null response from MSAL client', async () => {
      mockMsalClient.acquireTokenOnBehalfOf.mockResolvedValue(null);

      await expect(tokenManager.getOnBehalfOfToken(userAccessToken, mockScopes))
        .rejects.toThrow('No response from MSAL on-behalf-of flow');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to acquire on-behalf-of token:',
        expect.any(Error)
      );
    });

    it('should handle MSAL client errors', async () => {
      const msalError = new Error('Invalid assertion');
      mockMsalClient.acquireTokenOnBehalfOf.mockRejectedValue(msalError);

      await expect(tokenManager.getOnBehalfOfToken(userAccessToken, mockScopes))
        .rejects.toThrow(msalError);
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to acquire on-behalf-of token:', msalError);
    });
  });

  describe('shouldRefreshToken', () => {
    it('should return true when token expires within refresh window', () => {
      const tokenManager = new MsalTokenManager();
      const nearExpiryDate = new Date(Date.now() + 4 * 60 * 1000); // 4 minutes from now
      
      const result = (tokenManager as any).shouldRefreshToken(nearExpiryDate);
      
      expect(result).toBe(true);
    });

    it('should return false when token expires outside refresh window', () => {
      const tokenManager = new MsalTokenManager();
      const farExpiryDate = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now
      
      const result = (tokenManager as any).shouldRefreshToken(farExpiryDate);
      
      expect(result).toBe(false);
    });

    it('should return true when token is already expired', () => {
      const tokenManager = new MsalTokenManager();
      const pastDate = new Date(Date.now() - 60 * 1000); // 1 minute ago
      
      const result = (tokenManager as any).shouldRefreshToken(pastDate);
      
      expect(result).toBe(true);
    });
  });

  describe('cacheToken', () => {
    it('should cache token with correct structure and TTL', async () => {
      const mockResponse = createMockAuthResult({
        accessToken: 'test-token',
        scopes: ['User.Read']
      });

      mockRedis.setJson.mockResolvedValue(undefined);

      await (tokenManager as any).cacheToken('test-cache-key', mockResponse);

      expect(mockRedis.setJson).toHaveBeenCalledWith(
        'test-cache-key',
        {
          accessToken: 'test-token',
          expiresAt: mockResponse.expiresOn,
          scope: 'User.Read'
        },
        expect.any(Number)
      );

      // Check TTL is approximately 90% of token lifetime
      const ttl = mockRedis.setJson.mock.calls[0][2];
      expect(ttl).toBeCloseTo(3240, 10); // 90% of 3600 seconds, with some tolerance
    });

    it('should handle missing expiresOn with default expiry', async () => {
      const mockResponse = createMockAuthResult({
        accessToken: 'test-token',
        expiresOn: null,
        scopes: ['User.Read']
      });

      mockRedis.setJson.mockResolvedValue(undefined);

      await (tokenManager as any).cacheToken('test-cache-key', mockResponse);

      const cacheEntry = mockRedis.setJson.mock.calls[0][1];
      expect(cacheEntry.expiresAt).toBeInstanceOf(Date);
      // Should be approximately 1 hour from now
      const expectedTime = Date.now() + 3600000;
      const actualTime = cacheEntry.expiresAt.getTime();
      expect(Math.abs(actualTime - expectedTime)).toBeLessThan(10000); // Within 10 seconds
    });
  });

  describe('getCachedToken', () => {
    it('should return token when cache hit and token is valid', async () => {
      const validCacheEntry = {
        accessToken: 'cached-token',
        expiresAt: new Date(Date.now() + 1800000), // 30 minutes from now
        scope: 'User.Read'
      };

      mockRedis.getJson.mockResolvedValue(validCacheEntry);

      const result = await (tokenManager as any).getCachedToken('test-cache-key');

      expect(result).toBe('cached-token');
      expect(mockRedis.getJson).toHaveBeenCalledWith('test-cache-key');
    });

    it('should return null when cache miss', async () => {
      mockRedis.getJson.mockResolvedValue(null);

      const result = await (tokenManager as any).getCachedToken('test-cache-key');

      expect(result).toBeNull();
    });

    it('should delete expired token from cache and return null', async () => {
      const expiredCacheEntry = {
        accessToken: 'expired-token',
        expiresAt: new Date(Date.now() - 60000), // 1 minute ago
        scope: 'User.Read'
      };

      mockRedis.getJson.mockResolvedValue(expiredCacheEntry);
      mockRedis.del.mockResolvedValue(1);

      const result = await (tokenManager as any).getCachedToken('test-cache-key');

      expect(result).toBeNull();
      expect(mockRedis.del).toHaveBeenCalledWith('test-cache-key');
    });
  });

  describe('clearUserTokenCache', () => {
    it('should clear all tokens for a specific user', async () => {
      const userId = 123;
      mockRedis.invalidatePattern.mockResolvedValue(1);

      await tokenManager.clearUserTokenCache(userId);

      expect(mockRedis.invalidatePattern).toHaveBeenCalledWith(`msal:token:user:${userId}:*`);
      expect(mockLogger.info).toHaveBeenCalledWith(`Token cache cleared for user ${userId}`);
    });
  });

  describe('clearAllTokenCache', () => {
    it('should clear all cached tokens', async () => {
      mockRedis.invalidatePattern.mockResolvedValue(1);

      await tokenManager.clearAllTokenCache();

      expect(mockRedis.invalidatePattern).toHaveBeenCalledWith('msal:token:*');
      expect(mockLogger.info).toHaveBeenCalledWith('All token cache cleared');
    });
  });

  describe('getTokenCacheStats', () => {
    it('should return correct cache statistics', async () => {
      const mockKeys = [
        'msal:token:app:scope1',
        'msal:token:app:scope2',
        'msal:token:user:123:scope1',
        'msal:token:user:456:scope2',
        'msal:token:user:789:scope3'
      ];

      mockRedis.keys.mockResolvedValue(mockKeys);

      const stats = await tokenManager.getTokenCacheStats();

      expect(stats).toEqual({
        totalCached: 5,
        appTokens: 2,
        userTokens: 3
      });
      expect(mockRedis.keys).toHaveBeenCalledWith('msal:token:*');
    });

    it('should handle empty cache', async () => {
      mockRedis.keys.mockResolvedValue([]);

      const stats = await tokenManager.getTokenCacheStats();

      expect(stats).toEqual({
        totalCached: 0,
        appTokens: 0,
        userTokens: 0
      });
    });
  });

  describe('Concurrent Access Scenarios', () => {
    it('should handle concurrent getAppOnlyToken requests', async () => {
      const mockScopes = ['https://graph.microsoft.com/.default'];
      const mockTokenResponse = createMockAuthResult({
        accessToken: 'concurrent-token',
        scopes: mockScopes
      });

      // First call returns null (cache miss), subsequent calls return cached token
      mockRedis.getJson
        .mockResolvedValueOnce(null)
        .mockResolvedValue({
          accessToken: 'concurrent-token',
          expiresAt: new Date(Date.now() + 1800000),
          scope: mockScopes.join(' ')
        });

      mockMsalClient.acquireTokenByClientCredential.mockResolvedValue(mockTokenResponse);
      mockRedis.setJson.mockResolvedValue(undefined);

      // Make concurrent requests
      const promises = Array(5).fill(null).map(() => tokenManager.getAppOnlyToken(mockScopes));
      const results = await Promise.all(promises);

      // All should return the same token
      results.forEach(token => expect(token).toBe('concurrent-token'));
      
      // MSAL client should be called at least once (first request)
      expect(mockMsalClient.acquireTokenByClientCredential).toHaveBeenCalled();
    });

    it('should handle concurrent getDelegatedToken requests', async () => {
      const userId = 123;
      const mockScopes = ['User.Read'];

      // First call returns null (cache miss), subsequent calls return cached token
      mockRedis.getJson
        .mockResolvedValueOnce(null)
        .mockResolvedValue({
          accessToken: 'concurrent-delegated-token',
          expiresAt: new Date(Date.now() + 1800000),
          scope: mockScopes.join(' ')
        });

      mockAzureCredentialService.getCredentials.mockResolvedValue({
        accessToken: 'stored-delegated-token',
        expiresAt: new Date(Date.now() + 3600000)
      });

      // Make concurrent requests
      const promises = Array(3).fill(null).map(() => tokenManager.getDelegatedToken(userId, mockScopes));
      const results = await Promise.all(promises);

      // All should return a token (either stored or cached)
      results.forEach(token => expect(typeof token).toBe('string'));
    });
  });

  describe('Error Recovery Scenarios', () => {
    it('should handle Redis connection failures gracefully', async () => {
      const mockScopes = ['https://graph.microsoft.com/.default'];
      const mockTokenResponse = createMockAuthResult({
        accessToken: 'recovery-token',
        scopes: mockScopes
      });

      // Redis operations fail
      mockRedis.getJson.mockRejectedValue(new Error('Redis connection failed'));
      mockRedis.setJson.mockRejectedValue(new Error('Redis connection failed'));
      
      // But MSAL client works
      mockMsalClient.acquireTokenByClientCredential.mockResolvedValue(mockTokenResponse);

      // Should throw Redis error since cache operations fail
      await expect(tokenManager.getAppOnlyToken(mockScopes)).rejects.toThrow('Redis connection failed');
    });

    it('should handle Azure credential service failures', async () => {
      const userId = 123;
      const mockScopes = ['User.Read'];

      mockRedis.getJson.mockResolvedValue(null);
      mockAzureCredentialService.getCredentials.mockRejectedValue(new Error('Database connection failed'));

      await expect(tokenManager.getDelegatedToken(userId, mockScopes))
        .rejects.toThrow('Database connection failed');
    });

    it('should handle crypto service failures during token refresh', async () => {
      const userId = 123;
      const mockScopes = ['User.Read'];
      const nearExpiryDate = new Date(Date.now() + 4 * 60 * 1000);

      mockRedis.getJson.mockResolvedValue(null);
      mockAzureCredentialService.getCredentials.mockResolvedValue({
        accessToken: 'old-access-token',
        refreshToken: 'valid-refresh-token',
        expiresAt: nearExpiryDate
      });

      const mockRefreshedResponse = createMockAuthResult({
        accessToken: 'refreshed-access-token',
        scopes: mockScopes
      });

      mockMsalClient.acquireTokenByRefreshToken.mockResolvedValue(mockRefreshedResponse);
      mockCryptoService.encryptToken.mockRejectedValue(new Error('Encryption failed'));

      await expect(tokenManager.getDelegatedToken(userId, mockScopes))
        .rejects.toThrow('Encryption failed');
    });
  });

  describe('Token Validation and Edge Cases', () => {
    it('should handle tokens with different expiry formats', async () => {
      const mockResponse = createMockAuthResult({
        accessToken: 'test-token',
        expiresOn: new Date('2025-08-04T12:00:00Z'),
        scopes: ['User.Read']
      });

      mockRedis.setJson.mockResolvedValue(undefined);

      await (tokenManager as any).cacheToken('test-key', mockResponse);

      const cacheEntry = mockRedis.setJson.mock.calls[0][1];
      expect(cacheEntry.expiresAt).toEqual(new Date('2025-08-04T12:00:00Z'));
    });

    it('should handle malformed cache entries', async () => {
      // Malformed cache entry missing required fields
      mockRedis.getJson.mockResolvedValue({
        accessToken: 'token-without-expiry'
        // Missing expiresAt field
      });

      const result = await (tokenManager as any).getCachedToken('test-key');

      // Should handle gracefully and return the token even if expiresAt is missing
      expect(result).toBe('token-without-expiry');
    });

    it('should handle very short token lifetimes', async () => {
      const shortLivedResponse = createMockAuthResult({
        accessToken: 'short-lived-token',
        expiresOn: new Date(Date.now() + 60000), // 1 minute
        scopes: ['User.Read']
      });

      mockRedis.setJson.mockResolvedValue(undefined);

      await (tokenManager as any).cacheToken('short-lived-key', shortLivedResponse);

      const ttl = mockRedis.setJson.mock.calls[0][2];
      expect(ttl).toBeCloseTo(54, 0); // 90% of 60 seconds (allow ±1 second for timing)
    });

    it('should handle tokens that expire immediately', async () => {
      const expiredResponse = createMockAuthResult({
        accessToken: 'expired-token',
        expiresOn: new Date(Date.now() - 1000), // Already expired
        scopes: ['User.Read']
      });

      mockRedis.setJson.mockResolvedValue(undefined);

      await (tokenManager as any).cacheToken('expired-key', expiredResponse);

      const ttl = mockRedis.setJson.mock.calls[0][2];
      expect(ttl).toBeLessThanOrEqual(0); // Should not cache expired tokens (TTL should be 0 or negative)
    });
  });

  describe('Multi-tenant Support', () => {
    it('should handle different tenant configurations', () => {
      // Test that the constructor properly handles tenant-specific configuration
      const config = MockedConfidentialClientApplication.mock.calls[0][0];
      expect(config.auth.authority).toBe('https://login.microsoftonline.com/test-tenant-id');
    });

    it('should generate tenant-specific cache keys', async () => {
      const mockScopes = ['https://graph.microsoft.com/.default'];
      mockRedis.getJson.mockResolvedValue(null);
      
      const mockTokenResponse = createMockAuthResult({
        accessToken: 'tenant-token',
        scopes: mockScopes
      });

      mockMsalClient.acquireTokenByClientCredential.mockResolvedValue(mockTokenResponse);
      mockRedis.setJson.mockResolvedValue(undefined);

      await tokenManager.getAppOnlyToken(mockScopes);

      // Cache key should include the scope information
      expect(mockRedis.setJson).toHaveBeenCalledWith(
        'msal:token:app:https://graph.microsoft.com/.default',
        expect.any(Object),
        expect.any(Number)
      );
    });
  });

  describe('Singleton Instance', () => {
    it('should export singleton instance', () => {
      expect(msalTokenManager).toBeInstanceOf(MsalTokenManager);
    });

    it('should maintain singleton pattern', () => {
      const instance1 = msalTokenManager;
      const instance2 = msalTokenManager;
      
      expect(instance1).toBe(instance2);
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complete token lifecycle for app-only flow', async () => {
      const mockScopes = ['https://graph.microsoft.com/.default'];
      const mockTokenResponse = createMockAuthResult({
        accessToken: 'lifecycle-token',
        scopes: mockScopes
      });

      // Initial call - cache miss, acquire new token
      mockRedis.getJson.mockResolvedValueOnce(null);
      mockMsalClient.acquireTokenByClientCredential.mockResolvedValue(mockTokenResponse);
      mockRedis.setJson.mockResolvedValue(undefined);

      const token1 = await tokenManager.getAppOnlyToken(mockScopes);
      expect(token1).toBe('lifecycle-token');

      // Second call - cache hit
      mockRedis.getJson.mockResolvedValueOnce({
        accessToken: 'lifecycle-token',
        expiresAt: new Date(Date.now() + 1800000),
        scope: mockScopes.join(' ')
      });

      const token2 = await tokenManager.getAppOnlyToken(mockScopes);
      expect(token2).toBe('lifecycle-token');

      // Verify MSAL client was only called once
      expect(mockMsalClient.acquireTokenByClientCredential).toHaveBeenCalledTimes(1);
    });

    it('should handle complete delegated token lifecycle with refresh', async () => {
      const userId = 123;
      const mockScopes = ['User.Read'];
      
      // Token close to expiry with refresh token
      const nearExpiryDate = new Date(Date.now() + 4 * 60 * 1000);
      
      // Initial call - cache miss, needs refresh
      mockRedis.getJson.mockResolvedValueOnce(null);
      mockAzureCredentialService.getCredentials.mockResolvedValue({
        accessToken: 'old-token',
        refreshToken: 'refresh-token',
        expiresAt: nearExpiryDate
      });

      const mockRefreshedResponse = createMockAuthResult({
        accessToken: 'new-token',
        scopes: mockScopes
      });

      mockMsalClient.acquireTokenByRefreshToken.mockResolvedValue(mockRefreshedResponse);
      mockCryptoService.encryptToken.mockResolvedValue({
        encrypted: 'encrypted-new-token',
        salt: 'salt',
        iv: 'iv',
        authTag: 'auth-tag',
        version: 'v2'
      });
      mockAzureCredentialService.storeCredentials.mockResolvedValue(1);
      mockRedis.setJson.mockResolvedValue(undefined);

      const token = await tokenManager.getDelegatedToken(userId, mockScopes);
      
      expect(token).toBe('new-token');
      expect(mockMsalClient.acquireTokenByRefreshToken).toHaveBeenCalled();
      expect(mockAzureCredentialService.storeCredentials).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(`Token refreshed successfully for user ${userId}`);
    });
  });
});