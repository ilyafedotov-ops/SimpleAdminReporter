import { User, JWTPayload, RefreshTokenPayload, AuthMode } from '../types';
import { unifiedAuthService } from '../services/unified-auth.service';
import { randomBytes } from 'crypto';

/**
 * Unified Auth Test Utilities
 * Provides test helpers that use the unified auth service instead of direct JWT manipulation
 */

export interface TestUser extends User {
  password?: string;
}

export interface TestTokens {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  user: User;
  csrfToken?: string;
}

/**
 * Create a test user object
 */
export function createTestUser(overrides: Partial<TestUser> = {}): TestUser {
  const defaultUser: TestUser = {
    id: 1,
    username: 'testuser',
    displayName: 'Test User',
    email: 'test@example.com',
    authSource: 'local',
    isAdmin: false,
    isActive: true,
    password: 'TestPassword123!',
    ...overrides
  };
  
  return defaultUser;
}

/**
 * Create an admin test user
 */
export function createAdminUser(overrides: Partial<TestUser> = {}): TestUser {
  return createTestUser({
    username: 'adminuser',
    displayName: 'Admin User',
    email: 'admin@example.com',
    isAdmin: true,
    ...overrides
  });
}

/**
 * Generate test tokens using the unified auth service
 * This replaces direct JWT signing in tests
 */
export async function generateTestTokens(
  user: User = createTestUser(),
  mode: AuthMode = AuthMode.JWT
): Promise<TestTokens> {
  // Create a session for the user
  const sessionId = await unifiedAuthService.createSession(user, mode);
  
  // Use the service's internal methods (exposed for testing)
  const accessToken = (unifiedAuthService as any).generateAccessToken(user, sessionId);
  const refreshToken = await (unifiedAuthService as any).generateRefreshToken(user.id, sessionId);
  
  const result: TestTokens = {
    accessToken,
    refreshToken,
    sessionId,
    user
  };
  
  // Generate CSRF token for cookie mode
  if (mode === AuthMode.COOKIE) {
    const { csrfService } = await import('@/services/csrf.service');
    result.csrfToken = csrfService.generateToken();
  }
  
  return result;
}

/**
 * Create a test JWT token with custom payload
 * For cases where specific JWT structure is needed for testing
 */
export function createCustomTestToken(payload: Partial<JWTPayload>): string {
  const jwt = require('jsonwebtoken');
  const jwtSecret = process.env.JWT_SECRET || 'test-secret';
  
  const defaultPayload: JWTPayload = {
    userId: 1,
    username: 'testuser',
    authSource: 'local',
    isAdmin: false,
    sessionId: randomBytes(16).toString('hex'),
    jti: randomBytes(16).toString('hex'),
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...payload
  };
  
  return jwt.sign(defaultPayload, jwtSecret);
}

/**
 * Create a test refresh token with custom payload
 */
export function createCustomRefreshToken(payload: Partial<RefreshTokenPayload>): string {
  const jwt = require('jsonwebtoken');
  const refreshSecret = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';
  
  const defaultPayload: RefreshTokenPayload = {
    userId: 1,
    sessionId: randomBytes(16).toString('hex'),
    familyId: randomBytes(16).toString('hex'),
    jti: randomBytes(16).toString('hex'),
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (7 * 24 * 3600),
    ...payload
  };
  
  return jwt.sign(defaultPayload, refreshSecret);
}

/**
 * Create an expired test token
 */
export function createExpiredToken(user: User = createTestUser()): string {
  return createCustomTestToken({
    userId: user.id,
    username: user.username,
    authSource: user.authSource,
    isAdmin: user.isAdmin,
    exp: Math.floor(Date.now() / 1000) - 3600 // Expired 1 hour ago
  });
}

/**
 * Verify a test token using the unified auth service
 */
export async function verifyTestToken(token: string): Promise<User> {
  return unifiedAuthService.verifyAccessToken(token, { skipBlacklistCheck: true });
}

/**
 * Create test authentication headers
 */
export function createAuthHeaders(token: string, csrfToken?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${token}`
  };
  
  if (csrfToken) {
    headers['X-CSRF-Token'] = csrfToken;
  }
  
  return headers;
}

/**
 * Mock authenticated request
 */
export function mockAuthenticatedRequest(user: User = createTestUser(), sessionId?: string): any {
  return {
    user,
    sessionId: sessionId || randomBytes(16).toString('hex'),
    headers: {},
    get: (_header: string) => null
  };
}

/**
 * Clean up test sessions and cache
 */
export async function cleanupTestAuth(userId?: number): Promise<void> {
  if (userId) {
    await unifiedAuthService.logoutAllSessions(userId);
  }
  
  // Clear user cache
  (unifiedAuthService as any).userCache.clear();
}

/**
 * Setup test authentication for integration tests
 */
export async function setupTestAuth(options: {
  createUser?: boolean;
  user?: TestUser;
  mode?: AuthMode;
} = {}): Promise<TestTokens> {
  const { 
    createUser = true, 
    user = createTestUser(), 
    mode = AuthMode.JWT 
  } = options;
  
  if (createUser) {
    // In a real test, you would insert the user into the test database
    // For now, we'll just use the user object
  }
  
  return generateTestTokens(user, mode);
}

/**
 * Backward compatibility: Replace createTestToken from test-helpers
 */
export function createTestToken(userId: number, isAdmin: boolean = false): string {
  return createCustomTestToken({
    userId,
    username: isAdmin ? 'adminuser' : 'testuser',
    isAdmin
  });
}