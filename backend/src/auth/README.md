# Unified Authentication Module

## Overview

This module provides a unified authentication system that supports both JWT and cookie-based authentication strategies, eliminating code duplication and providing a single, maintainable codebase.

## Architecture

```
src/auth/
├── types/              # Shared TypeScript interfaces and types
├── strategies/         # Authentication strategy implementations
│   ├── base.strategy.ts      # Abstract base strategy
│   ├── jwt.strategy.ts       # JWT authentication strategy
│   ├── cookie.strategy.ts    # Cookie authentication strategy
│   └── index.ts             # Strategy factory
├── services/           # Business logic
│   └── unified-auth.service.ts  # Unified authentication service
├── middleware/         # Express middleware
│   └── unified-auth.middleware.ts  # Unified auth middleware
├── controllers/        # Request handlers
│   └── unified-auth.controller.ts  # Unified auth controller
├── routes/            # Route definitions
│   └── unified-auth.routes.ts     # Auth endpoints
├── migration/         # Migration utilities
│   └── auth-migration.ts         # Backward compatibility helpers
└── tests/            # Test files
    └── unified-auth.test.ts      # Unit tests
```

## Key Features

1. **Strategy Pattern**: Clean separation between JWT and cookie authentication modes
2. **Single Codebase**: One service handles both authentication modes
3. **Backward Compatible**: Existing code continues to work during migration
4. **Type Safe**: Full TypeScript support with shared interfaces
5. **Secure**: Built-in CSRF protection for cookie mode, token blacklisting for JWT
6. **Performant**: Optimized caching and minimal database queries

## Usage

### Basic Import

```typescript
import { 
  unifiedAuthService, 
  requireAuth, 
  requireAdmin,
  AuthMode 
} from '@/auth';
```

### Route Protection

```typescript
// Require authentication
router.get('/protected', requireAuth, handler);

// Require admin privileges
router.post('/admin', requireAdmin, handler);

// Optional authentication
router.get('/public', optionalAuth, handler);

// Require specific auth sources
router.get('/ad-only', requireAuthSource(['ad']), handler);
```

### Service Usage

```typescript
// Authenticate user
const response = await unifiedAuthService.authenticate({
  username: 'user',
  password: 'pass',
  authSource: 'ad'
}, request);

// Verify token
const user = await unifiedAuthService.verifyAccessToken(token);

// Refresh token
const newTokens = await unifiedAuthService.refreshAccessToken(refreshToken);
```

## Configuration

### Environment Variables

- `USE_COOKIE_AUTH`: Use cookie mode (default: `false`)
- `SUPPORT_LEGACY_AUTH`: Return tokens in cookie mode (default: `false`)
- `JWT_SECRET`: Secret for JWT signing
- `JWT_REFRESH_SECRET`: Secret for refresh tokens
- `SESSION_SECRET`: Secret for session cookies
- `COOKIE_SECRET`: Secret for cookie signing

### Authentication Modes

#### JWT Mode (Default)
- Tokens in Authorization header
- Client manages token storage
- No CSRF protection needed
- Stateless authentication

#### Cookie Mode
- Tokens in HTTP-only cookies
- Server manages token storage
- CSRF protection enabled
- Session-based authentication

## API Endpoints

### POST /api/auth/login
Authenticate user and receive tokens/cookies

### POST /api/auth/refresh
Refresh expired access token

### POST /api/auth/logout
Logout current session

### POST /api/auth/logout-all
Logout all user sessions

### GET /api/auth/profile
Get current user profile

### PUT /api/auth/profile
Update user profile

### POST /api/auth/change-password
Change password (local users)

### GET /api/auth/verify
Verify current session status

## Security Features

1. **Token Blacklisting**: Revoked tokens are blacklisted
2. **Session Management**: Redis-backed session storage
3. **CSRF Protection**: Double-submit cookie pattern
4. **Rate Limiting**: Configurable per-user limits
5. **Audit Logging**: All auth events logged
6. **Failed Login Tracking**: Account lockout after failures
7. **Token Rotation**: Refresh tokens use family rotation

## Migration Guide

See [UNIFIED_AUTH_MIGRATION.md](/UNIFIED_AUTH_MIGRATION.md) for detailed migration instructions.

## Testing

```bash
# Run all auth tests
npm test -- --testPathPattern=auth

# Run unified auth tests
npm test -- --testPathPattern=unified-auth

# Run with coverage
npm test -- --testPathPattern=auth --coverage
```

## Performance Considerations

1. **User Caching**: In-memory cache with TTL
2. **Skip Blacklist Check**: Optional for cookie mode
3. **Connection Pooling**: Efficient database usage
4. **Async Operations**: Non-blocking I/O

## Best Practices

1. Always use HTTPS in production
2. Set secure cookie flags
3. Implement proper CORS policies
4. Regular token rotation
5. Monitor failed login attempts
6. Audit authentication events
7. Use strong secrets (32+ chars)

## Troubleshooting

### Common Issues

1. **CSRF validation fails**
   - Ensure CSRF token in header
   - Check cookie settings
   - Verify CORS configuration

2. **Tokens not returned**
   - Expected behavior in cookie mode
   - Set SUPPORT_LEGACY_AUTH=true if needed

3. **Session expires early**
   - Check Redis connection
   - Verify session TTL settings

4. **Authentication fails**
   - Check auth source configuration
   - Verify user credentials
   - Review audit logs

## Support

For issues or questions:
1. Check test files for examples
2. Review migration guide
3. Contact backend team