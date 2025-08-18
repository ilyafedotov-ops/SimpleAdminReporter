# Security Testing Guide

## Overview

This guide documents the current security testing capabilities of the SimpleAdminReporter application as of August 2025. It provides an honest assessment of what security features are currently implemented and tested, along with practical guidance for security testing.

**Important**: This guide reflects actual implemented security features and tests. No compliance claims (SOX/HIPAA/GDPR) are made, and no external penetration testing or security certifications have been performed.

## Current Security Testing Capabilities

### Implemented Security Features

1. **Authentication & Authorization**
   - JWT token authentication (both Bearer and Cookie-based)
   - LDAP/Active Directory authentication
   - Azure AD/MSAL authentication
   - Admin role verification
   - Authentication source restrictions

2. **Failed Login Tracking**
   - Comprehensive failed attempt monitoring
   - Progressive account lockout system
   - Redis-cached lockout status
   - Admin account unlock functionality

3. **Audit Logging**
   - Batched audit log system
   - Authentication event logging
   - Security event tracking
   - User activity summaries

4. **Encryption & Data Protection**
   - AES-256-GCM credential encryption
   - PBKDF2 key derivation with per-credential salts
   - Versioned encryption format (v1)
   - Master key rotation support

5. **Network Security**
   - Comprehensive security headers (Nginx)
   - CSRF protection for cookie-based auth
   - Rate limiting framework (basic implementation)

6. **Input Validation**
   - Parameterized database queries
   - Express-validator integration
   - Whitelisted sort columns
   - Query timeout protection

## Existing Security Tests

### Currently Implemented Test Suites

#### 1. Failed Login Tracker Tests
**Location**: `/backend/src/tests/security/failed-login-tracker.test.ts`

**Coverage**: 772 lines of comprehensive tests including:
- Account lockout mechanism
- Progressive lockout duration (15→30→60 minutes)
- Redis caching integration
- Database transaction handling
- Error handling scenarios
- Concurrent access patterns

**Run Command**:
```bash
cd backend
npm test -- failed-login-tracker.test.ts
```

#### 2. Audit Logger Tests
**Location**: `/backend/src/tests/security/audit-logger.test.ts`

**Coverage**: 241 lines testing:
- Authentication event logging
- Security event logging
- Batch processing functionality
- Query and filtering capabilities
- User activity summaries

**Run Command**:
```bash
cd backend
npm test -- audit-logger.test.ts
```

#### 3. Authentication Security Integration Tests
**Location**: `/backend/src/tests/security/auth-security.integration.test.ts`

**Status**: Test structure exists but implementations are skipped
**Note**: Tests require full server setup and are currently placeholders

#### 4. Encryption Tests
**Location**: `/backend/src/utils/encryption.test.ts` and `/backend/src/services/crypto.service.test.ts`

**Coverage**: Tests for AES-256-GCM encryption, key derivation, and credential handling

**Run Command**:
```bash
cd backend
npm test -- encryption.test.ts
npm test -- crypto.service.test.ts
```

### Running Security Tests

#### Individual Test Suites
```bash
cd backend

# Failed login tracking
npm test -- failed-login-tracker.test.ts

# Audit logging
npm test -- audit-logger.test.ts

# Encryption/crypto
npm test -- encryption.test.ts
npm test -- crypto.service.test.ts

# Security controller
npm test -- security.controller.test.ts
```

#### All Security Tests
```bash
cd backend
npm test -- --testPathPattern="security|crypto|encryption"
```

#### With Coverage
```bash
cd backend
npm test -- --testPathPattern="security" --coverage
```

## Manual Security Testing

### Authentication Testing

#### 1. JWT Token Security Testing

**Test Case: Invalid Token Access**
```bash
# Test with malformed token
curl -H "Authorization: Bearer invalid.token.here" \
     http://localhost/api/admin/security/audit-logs

# Test with no authorization header
curl http://localhost/api/admin/security/audit-logs

# Test with empty Bearer token
curl -H "Authorization: Bearer " \
     http://localhost/api/admin/security/audit-logs
```

**Expected Results:**
- All requests should return 401 Unauthorized
- Error message: "Access token required. Please login to continue."
- No sensitive data exposure

#### 2. Admin Access Control Testing

**Test Case: Non-admin Access to Admin Endpoints**
```bash
# Get regular user token first
curl -X POST http://localhost/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username": "regular_user", "password": "password"}'

# Try to access admin endpoints with regular user token
curl -H "Authorization: Bearer <regular-user-token>" \
     http://localhost/api/admin/security/locked-accounts

curl -H "Authorization: Bearer <regular-user-token>" \
     http://localhost/api/admin/security/unlock-account
```

**Expected Results:**
- Response: 403 Forbidden
- Error message: "Administrator access required"

#### 3. Failed Login Tracking Testing

**Test Case: Account Lockout Mechanism**
```bash
# Make 5 failed login attempts to trigger lockout
for i in {1..5}; do
  curl -X POST http://localhost/api/auth/login \
       -H "Content-Type: application/json" \
       -d '{"username": "testuser", "password": "wrongpassword"}'
  echo "Attempt $i completed"
done

# Verify account is locked
curl -X POST http://localhost/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username": "testuser", "password": "correctpassword"}'
```

**Expected Results:**
- First 4 attempts: Login failure with attempt count
- 5th attempt: Account lockout for 15 minutes
- Subsequent attempts: Account locked error

### Database Security Testing

#### SQL Injection Prevention Testing

**Test Case: Parameterized Query Validation**
```bash
# Test admin endpoint with potential SQL injection
curl "http://localhost/api/admin/security/failed-logins?username='; DROP TABLE users; --" \
     -H "Authorization: Bearer <admin-token>"

# Test search functionality
curl "http://localhost/api/logs/search/fulltext?q=' UNION SELECT * FROM users --" \
     -H "Authorization: Bearer <valid-token>"
```

**Expected Results:**
- No database errors in response
- Queries should be parameterized and safe
- No unauthorized data access

### Input Validation Testing

#### Express Validator Testing

**Test Case: Audit Log Query Validation**
```bash
# Test invalid event type
curl "http://localhost/api/admin/security/audit-logs?eventType=invalid_type" \
     -H "Authorization: Bearer <admin-token>"

# Test invalid date format
curl "http://localhost/api/admin/security/audit-logs?startDate=invalid-date" \
     -H "Authorization: Bearer <admin-token>"

# Test excessive limit
curl "http://localhost/api/admin/security/audit-logs?limit=10000" \
     -H "Authorization: Bearer <admin-token>"
```

**Expected Results:**
- Response: 400 Bad Request
- Validation error messages for invalid inputs
- Limits enforced (max 1000 for audit logs)

## CI/CD Security Integration

### Current GitLab CI/CD Security Features

The application has integrated security testing in the CI/CD pipeline:

#### 1. Dependency Vulnerability Scanning
**Location**: `.gitlab/ci/scripts/security-audit.sh`

**Features**:
- npm audit for known vulnerabilities (moderate level)
- Deprecated package detection
- License compatibility checking

**Pipeline Stage**: `security:dependencies`

#### 2. Secrets Detection
**Tool**: Gitleaks
**Configuration**: `.gitleaks.toml`

**Features**:
- Scans for hardcoded secrets and credentials
- SARIF report generation for GitLab Security Dashboard
- Pipeline failure on secret detection

**Pipeline Stage**: `security:secrets`

#### 3. Dockerfile Security Scanning
**Tool**: Hadolint
**Coverage**: Scans all Dockerfile* files

**Pipeline Stage**: `security:dockerfile-scan`

### Running CI/CD Security Tests Locally

```bash
# Dependency audit
cd backend
chmod +x ../.gitlab/ci/scripts/security-audit.sh
../.gitlab/ci/scripts/security-audit.sh

# Secrets scanning
gitleaks detect --source . --config .gitleaks.toml --verbose

# Dockerfile scanning
find . -name "Dockerfile*" -exec hadolint {} \;
```

## Encryption & Data Protection Testing

### Credential Encryption Testing

The application uses AES-256-GCM encryption for sensitive credentials:

#### Testing Encryption Functionality
```bash
cd backend
npm test -- encryption.test.ts
npm test -- crypto.service.test.ts
```

#### Manual Encryption Testing
```javascript
// Test encryption/decryption
const { getCredentialEncryption } = require('./src/utils/encryption');
const encryption = getCredentialEncryption();

const plaintext = "sensitive_password";
const encrypted = encryption.encrypt(plaintext);
const decrypted = encryption.decrypt(encrypted);

console.log('Encryption test:', plaintext === decrypted);
```

### Password Security
- Credentials are encrypted using AES-256-GCM
- PBKDF2 key derivation with 100,000 iterations
- Per-credential salt generation (v1 format)
- Master key rotation capability

## Network Security Testing

### Security Headers Testing

**Current Headers** (from `nginx/prod/security-headers.conf`):
- Strict-Transport-Security (HSTS)
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- X-XSS-Protection: 1; mode=block
- Referrer-Policy: strict-origin-when-cross-origin
- Content-Security-Policy (restrictive)
- Permissions-Policy

**Testing Command**:
```bash
# Test security headers
curl -I http://localhost | grep -i "x-\|strict\|content-security"
```

### CSRF Protection Testing

For cookie-based authentication:
```bash
# Test state-changing request without CSRF token
curl -X POST http://localhost/api/admin/security/unlock-account \
     -H "Cookie: access_token=<valid-cookie>" \
     -H "Content-Type: application/json" \
     -d '{"username": "testuser"}'
```

**Expected Result**: 403 Forbidden - CSRF validation failed

## Current Testing Gaps

### What's NOT Currently Tested

1. **Penetration Testing**: No external security assessments performed
2. **XSS Testing**: Limited automated XSS protection testing
3. **LDAP Injection**: No specific LDAP injection test suite
4. **Rate Limiting**: Basic framework exists but comprehensive testing missing
5. **File Upload Security**: No file upload functionality currently implemented
6. **Session Management**: Cookie rotation and session fixation testing limited

### Missing Test Coverage Areas

1. **Integration Security Tests**: Auth security tests are mostly skipped
2. **End-to-End Security**: No comprehensive E2E security test suite
3. **Performance Security**: No security performance impact testing
4. **Container Security**: No runtime container security validation

## Security Testing Tools

### Currently Integrated Tools

#### 1. Gitleaks (Secret Detection)
**Status**: Fully integrated in CI/CD
```bash
# Scan for hardcoded secrets
gitleaks detect --source=. --config .gitleaks.toml --verbose
```

#### 2. npm audit (Dependency Vulnerabilities)
**Status**: Integrated in security pipeline
```bash
# Check for known vulnerabilities (moderate level)
npm audit --omit=dev --audit-level=moderate
```

#### 3. Hadolint (Dockerfile Security)
**Status**: Integrated in CI/CD
```bash
# Scan Dockerfiles for security issues
find . -name "Dockerfile*" -exec hadolint {} \;
```

### Recommended Additional Tools

#### OWASP ZAP (Not Currently Integrated)
```bash
# Baseline security scan (would need to be integrated)
# zap-baseline.py -t http://localhost -r zap-report.html
```

#### Trivy (Container Security - Not Currently Integrated)
```bash
# Would scan Docker images for vulnerabilities
# trivy image reporting-backend:latest
# trivy image reporting-frontend:latest
```

### Security Test Scripts

#### Available Scripts
```bash
# Run security audit (exists)
./scripts/run-security-tests.sh

# Set up security hooks (exists)
./scripts/setup-security-hooks.sh
```

**Note**: Some referenced security test files and scanners in the original guide do not actually exist in the codebase.

## Security Testing Checklist

### Pre-Testing Setup

- [ ] Application running locally (docker-compose up)
- [ ] PostgreSQL and Redis containers healthy
- [ ] Test user accounts created
- [ ] Admin and regular user tokens available
- [ ] Network connectivity verified

### Currently Testable Security Features

#### Authentication & Authorization ✅ IMPLEMENTED
- [ ] **JWT Token Validation**: Invalid/missing tokens rejected (401)
- [ ] **Admin Access Control**: Non-admin users blocked from admin endpoints (403)
- [ ] **Authentication Sources**: LDAP/AD, Azure AD, Local auth supported
- [ ] **Account Lockout**: Progressive lockout after 5 failed attempts
- [ ] **Session Management**: JWT sessions with proper expiration

#### Database Security ✅ IMPLEMENTED
- [ ] **SQL Injection Prevention**: Parameterized queries used
- [ ] **Query Validation**: Input validation on admin endpoints
- [ ] **Access Control**: User-specific data access enforced
- [ ] **Query Timeouts**: Protection against long-running queries

#### Encryption & Data Protection ✅ IMPLEMENTED
- [ ] **Credential Encryption**: AES-256-GCM encryption for passwords
- [ ] **Key Derivation**: PBKDF2 with 100k iterations + per-credential salts
- [ ] **Version Support**: v1 encryption format with backward compatibility
- [ ] **Key Rotation**: Master key rotation capability exists

#### Audit & Logging ✅ IMPLEMENTED
- [ ] **Authentication Events**: Login/logout events logged
- [ ] **Security Events**: Failed logins, lockouts tracked
- [ ] **Admin Actions**: Account unlocks and admin operations logged
- [ ] **User Activity**: Comprehensive activity summaries available

#### Network Security ✅ IMPLEMENTED
- [ ] **Security Headers**: Comprehensive headers configured (Nginx)
- [ ] **CSRF Protection**: Implemented for cookie-based auth
- [ ] **Input Validation**: Express-validator integration
- [ ] **Rate Limiting**: Basic framework exists (needs enhancement)

### Partially Implemented / Needs Testing

#### Session Management ⚠️ BASIC IMPLEMENTATION
- [ ] **Token Blacklisting**: Exists but limited testing
- [ ] **Session Fixation**: Basic protection, needs thorough testing
- [ ] **Concurrent Sessions**: Not extensively tested

#### Error Handling ⚠️ NEEDS REVIEW
- [ ] **Information Disclosure**: Error messages need review
- [ ] **Debug Information**: Production logging configuration review needed

### Not Currently Implemented ❌ GAPS

#### Advanced Security Testing
- [ ] **XSS Protection**: No comprehensive XSS test suite
- [ ] **LDAP Injection**: No specific LDAP injection testing
- [ ] **File Upload Security**: No file upload functionality
- [ ] **Content Security Policy**: Basic CSP, needs testing

## Security Testing Workflow

### Daily Development Testing
```bash
# Quick security test run
cd backend
npm test -- --testPathPattern="security" --verbose

# Check for new secrets
gitleaks detect --source . --config .gitleaks.toml
```

### Weekly Security Review
```bash
# Full security test suite
cd backend
npm test -- --testPathPattern="security|crypto|encryption" --coverage

# Dependency audit
chmod +x ../.gitlab/ci/scripts/security-audit.sh
../.gitlab/ci/scripts/security-audit.sh

# Manual authentication testing
curl -H "Authorization: Bearer invalid" http://localhost/api/admin/security/audit-logs
```

### Monthly Security Assessment
1. Review all security test results
2. Update dependency versions
3. Review audit logs for suspicious activity
4. Validate encryption key rotation procedures
5. Test account lockout and unlock procedures

## Current CI/CD Security Integration

The GitLab CI/CD pipeline includes these security stages:

### Implemented Security Pipeline
```yaml
# From .gitlab-ci.yml
security:dependencies:
  script:
    - cd backend && npm ci
    - ../.gitlab/ci/scripts/security-audit.sh

security:dockerfile-scan:
  image: hadolint/hadolint:latest-alpine
  script:
    - find . -name "Dockerfile*" -exec hadolint {} \;

security:secrets:
  image: zricethezav/gitleaks:latest
  script:
    - gitleaks detect --config .gitleaks.toml --report-format=sarif
  allow_failure: false  # Fails pipeline on security violations
```

## Test Results Interpretation

### Understanding Test Outputs

#### Failed Login Tracker Test Results
- **✅ Pass**: Account lockout works correctly
- **❌ Fail**: Check Redis connectivity and database schema

#### Audit Logger Test Results
- **✅ Pass**: Security events are properly logged
- **❌ Fail**: Review database permissions and batch configuration

#### Authentication Test Results (Skipped)
- **⏭️ Skipped**: Integration tests require full server setup
- **Manual Testing Required**: Use curl commands provided in this guide

### Severity Guidelines

**Critical Issues** (Fix Immediately):
- Authentication bypass possible
- SQL injection vulnerabilities
- Credential exposure in logs
- Admin privilege escalation

**High Priority** (Fix Within 1 Week):
- Failed login tracking not working
- Audit logging failures
- Encryption key compromise
- Missing security headers

**Medium Priority** (Fix Within 1 Month):
- Rate limiting bypasses
- Information disclosure in errors
- Session management issues
- Input validation gaps

## Recommendations for Improvement

### High Priority Improvements
1. **Complete Integration Tests**: Implement the skipped auth security integration tests
2. **XSS Testing**: Add comprehensive XSS protection testing
3. **LDAP Injection Testing**: Create specific LDAP injection test suite
4. **Rate Limiting Enhancement**: Implement and test comprehensive rate limiting

### Medium Priority Improvements
1. **Container Security**: Integrate Trivy or similar container scanning
2. **OWASP ZAP Integration**: Add dynamic application security testing
3. **Performance Security**: Test security feature performance impact
4. **E2E Security Testing**: Create end-to-end security test scenarios

### Monitoring and Alerting
1. Set up alerts for repeated failed login attempts
2. Monitor audit log volume and patterns
3. Track security test failures in CI/CD
4. Alert on dependency vulnerabilities

## Conclusion

This security testing guide reflects the current state of security testing in SimpleAdminReporter as of August 2025. While the application has solid foundational security features and testing, there are areas for improvement:

**Strengths**:
- Comprehensive failed login tracking and testing
- Strong encryption implementation with thorough tests
- Good CI/CD security integration
- Solid authentication and authorization framework

**Areas for Enhancement**:
- Complete the integration test implementations
- Add XSS and LDAP injection testing
- Enhance rate limiting and testing
- Consider external security assessment

**No Claims Made**:
- No penetration testing performed
- No security compliance certifications
- No external security audits completed
- No vulnerability assessments by security professionals

Regular review and enhancement of these security tests will help maintain and improve the application's security posture over time.