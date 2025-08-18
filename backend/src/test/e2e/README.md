# E2E Test Suite

Comprehensive End-to-End test suite for the SimpleAdminReporter backend API using real database and Redis instances.

## Overview

This E2E test suite provides comprehensive testing of the entire backend application stack, including:

- **Authentication & Authorization**: LDAP, Azure AD, JWT token management
- **Report Execution**: Pre-built reports, custom reports, export functionality
- **API Integration**: Health checks, credentials management, field discovery
- **Logs API**: Full-text search, fuzzy search, statistics, export
- **Security**: Rate limiting, input validation, audit logging

## Test Architecture

### Test Infrastructure

```
src/test/e2e/
├── setup.ts                    # E2E test setup and context management
├── auth.e2e.test.ts            # Authentication flow tests
├── reports.e2e.test.ts         # Report execution tests
├── api.e2e.test.ts             # API integration tests
├── logs.e2e.test.ts            # Logs API tests with full-text search
├── run-e2e-tests.ts            # Test runner script
├── utils/
│   └── test-data-manager.ts    # Comprehensive test data management
└── README.md                   # This documentation
```

### Key Features

- **Real Database Integration**: Tests use actual PostgreSQL database with comprehensive test data
- **Real Redis Integration**: Tests use actual Redis instance for caching and session management
- **Comprehensive Test Data**: Automated creation and cleanup of test users, credentials, reports, logs
- **Security Testing**: Rate limiting, input validation, SQL injection prevention
- **Performance Testing**: Query caching, large result sets, timeout handling
- **Multiple Report Formats**: JSON, XML, HTML, Console output

## Running E2E Tests

### Prerequisites

1. **Environment Variables**: Ensure these are set in `.env.test`:
```bash
DATABASE_URL=postgresql://user:password@localhost:5432/test_db
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-test-jwt-secret
CORS_ORIGIN=http://localhost:3000
```

2. **Database**: PostgreSQL instance with test database
3. **Redis**: Redis instance for caching and sessions
4. **Dependencies**: All npm dependencies installed

### Quick Start

```bash
# Run all E2E tests
npm run test:e2e

# Run specific test suites
npm run test:e2e:auth        # Authentication tests only
npm run test:e2e:reports     # Report execution tests only
npm run test:e2e:api         # API integration tests only
npm run test:e2e:logs        # Logs API tests only

# Run with coverage report
npm run test:e2e:coverage

# Debug mode (keeps test data for inspection)
npm run test:e2e:debug
```

### Advanced Usage

```bash
# Custom configuration
npm run test:e2e -- --suites auth,api --timeout 180000 --format html

# CI/CD mode
npm run test:e2e:ci

# Run specific test files directly
npx jest --config jest.e2e.config.js src/test/e2e/auth.e2e.test.ts
```

### Command Line Options

```bash
--suites <suites>     Comma-separated list of test suites (default: auth,reports,api,logs)
--timeout <ms>        Test timeout in milliseconds (default: 120000)
--parallel            Run tests in parallel (default: false)
--coverage            Generate code coverage report (default: false)
--bail                Stop on first failure (default: true)
--no-bail             Continue on failures
--verbose             Verbose output (default: true)
--quiet               Minimal output
--format <format>     Report format: json, junit, html, console (default: console)
--output <dir>        Output directory (default: ./test-results/e2e)
--no-cleanup          Skip test data cleanup (useful for debugging)
--help                Show help message
```

## Test Suites

### 1. Authentication Tests (`auth.e2e.test.ts`)

Tests comprehensive authentication flows:

- **LDAP Authentication**: Username/password validation, session creation
- **Azure AD OAuth**: OAuth flow simulation, token management
- **JWT Token Management**: Token validation, refresh, blacklisting
- **Session Management**: Concurrent sessions, cleanup, tracking
- **Security Features**: Rate limiting, audit logging, timing attack protection
- **Account Lockout**: Failed attempt tracking, lockout mechanisms

**Key Test Cases:**
- Valid/invalid credential authentication
- JWT token structure and claims validation  
- Session persistence and invalidation
- Rate limiting enforcement
- Audit trail verification

### 2. Report Tests (`reports.e2e.test.ts`)

Tests all report functionality:

- **Pre-built Reports**: Template listing, execution, parameter validation
- **Custom Reports**: Creation, modification, deletion, execution
- **Report History**: Execution tracking, pagination, filtering
- **Export Functionality**: CSV, Excel, PDF generation
- **Field Discovery**: Available fields for different data sources
- **Performance**: Caching, large result sets, timeouts

**Key Test Cases:**
- Report template CRUD operations
- Report execution with various parameters
- Export format validation
- Permission enforcement
- Performance optimization verification

### 3. API Integration Tests (`api.e2e.test.ts`)

Tests core API functionality:

- **Health Checks**: Service health, component status, readiness probes
- **Credentials Management**: CRUD operations, encryption, testing
- **Field Discovery**: Schema discovery for AD, Azure, O365
- **System Configuration**: Admin-only endpoints, user preferences
- **Search Functionality**: Global search, suggestions, recent searches
- **Security**: CORS, input validation, rate limiting

**Key Test Cases:**
- Health endpoint comprehensive testing
- Credential lifecycle management
- Permission-based access control
- API security measures validation

### 4. Logs API Tests (`logs.e2e.test.ts`)

Tests advanced logs functionality:

- **Audit Logs**: Retrieval, filtering, pagination
- **System Logs**: Multi-level logging, source filtering
- **Full-text Search**: PostgreSQL-based search with ranking
- **Fuzzy Search**: Typo-tolerant search with similarity scoring
- **Statistics**: Log analytics, trending, summaries
- **Export**: Admin-only log export in multiple formats
- **Performance**: Query caching, large dataset handling

**Key Test Cases:**
- Complex search queries with boolean operators
- Search result highlighting and ranking
- Fuzzy search with configurable thresholds
- Statistics generation and accuracy
- Export format validation and permissions

## Test Data Management

### Automated Test Data Creation

The `TestDataManager` class creates comprehensive test datasets:

```typescript
// Test users with different roles and authentication sources
const users = [
  { username: 'e2e_regular_user', authSource: 'local', isAdmin: false },
  { username: 'e2e_admin_user', authSource: 'local', isAdmin: true },
  { username: 'e2e_ldap_user', authSource: 'ldap', isAdmin: false },
  { username: 'e2e_azure_user', authSource: 'azure', isAdmin: false }
];

// Service credentials for different platforms
const credentials = [
  { serviceType: 'ad', credentialName: 'E2E Test AD Credential' },
  { serviceType: 'azure', credentialName: 'E2E Test Azure Credential' },
  { serviceType: 'o365', credentialName: 'E2E Test O365 Credential' }
];

// Report templates, execution history, audit logs, system logs, etc.
```

### Data Cleanup

- **Automatic Cleanup**: Test data is automatically cleaned up after tests complete
- **Debug Mode**: Use `--no-cleanup` to preserve test data for debugging
- **Isolation**: Test data uses prefixes (`e2e_`, `E2E `) to avoid conflicts

## Performance Considerations

### Test Execution Times

- **Authentication Tests**: ~30-60 seconds
- **Report Tests**: ~60-120 seconds (includes mock LDAP/Azure operations)
- **API Tests**: ~45-90 seconds
- **Logs Tests**: ~30-60 seconds

### Optimization Strategies

- **Serial Execution**: E2E tests run serially to avoid database conflicts
- **Connection Pooling**: Shared database connections across test suites
- **Smart Cleanup**: Only clean up test-specific data, not entire database
- **Caching**: Leverage Redis caching for improved performance

## Debugging E2E Tests

### Common Issues

1. **Database Connection Failures**
   ```bash
   # Check database connectivity
   psql $DATABASE_URL -c "SELECT 1"
   ```

2. **Redis Connection Issues**
   ```bash
   # Check Redis connectivity
   redis-cli -u $REDIS_URL ping
   ```

3. **Port Conflicts**
   ```bash
   # Check for port conflicts
   netstat -tlnp | grep :5432
   netstat -tlnp | grep :6379
   ```

### Debug Mode

Run tests in debug mode to investigate failures:

```bash
npm run test:e2e:debug
```

This will:
- Keep test data after completion
- Enable verbose logging
- Show detailed error messages
- Allow manual database inspection

### Test Data Inspection

When running in debug mode, inspect test data:

```sql
-- List test users
SELECT * FROM users WHERE username LIKE 'e2e_%';

-- Check test credentials
SELECT * FROM service_credentials WHERE credential_name LIKE 'E2E %';

-- View test audit logs
SELECT * FROM audit_logs WHERE correlation_id LIKE 'e2e-%';
```

## CI/CD Integration

### GitHub Actions / GitLab CI

Example CI configuration:

```yaml
e2e-tests:
  runs-on: ubuntu-latest
  services:
    postgres:
      image: postgres:13
      env:
        POSTGRES_PASSWORD: postgres
        POSTGRES_DB: test_db
      options: >-
        --health-cmd pg_isready
        --health-interval 10s
        --health-timeout 5s
        --health-retries 5
    redis:
      image: redis:6
      options: >-
        --health-cmd "redis-cli ping"
        --health-interval 10s
        --health-timeout 5s
        --health-retries 5
  
  steps:
    - uses: actions/checkout@v3
    - uses: actions/setup-node@v3
      with:
        node-version: '18'
    - run: npm ci
    - run: npm run test:e2e:ci
      env:
        DATABASE_URL: postgres://postgres:postgres@localhost:5432/test_db
        REDIS_URL: redis://localhost:6379
        JWT_SECRET: test-jwt-secret
```

### Test Reports

CI mode generates JUnit XML reports for integration with CI systems:

```bash
npm run test:e2e:ci  # Generates test-results/e2e/e2e-results.xml
```

## Best Practices

### Writing E2E Tests

1. **Use Real Services**: Test against actual database/Redis, not mocks
2. **Test User Journeys**: Focus on complete user workflows, not individual functions
3. **Include Error Cases**: Test authentication failures, network timeouts, invalid input
4. **Verify Side Effects**: Check database changes, audit logs, cache updates
5. **Test Security**: Validate input sanitization, rate limiting, permission enforcement

### Test Organization

1. **Logical Grouping**: Group related tests in describe blocks
2. **Clear Naming**: Use descriptive test names that explain the scenario
3. **Setup/Teardown**: Use beforeAll/afterAll for suite-level setup
4. **Independent Tests**: Each test should be independent and not rely on others

### Performance

1. **Minimize Database Operations**: Use transactions where possible
2. **Reuse Connections**: Share connection pools across tests  
3. **Smart Data Creation**: Only create data needed for specific tests
4. **Parallel Caution**: Be careful with parallel execution and shared resources

## Security Testing

### Areas Covered

- **Input Validation**: SQL injection, XSS prevention, parameter validation
- **Authentication**: Token validation, session management, logout security
- **Authorization**: Role-based access control, resource permissions
- **Rate Limiting**: API endpoint protection, user-specific limits
- **Audit Logging**: Security event tracking, compliance requirements

### Security Test Examples

```typescript
it('should prevent SQL injection in search parameters', async () => {
  const maliciousInput = "'; DROP TABLE users; --";
  const response = await testContext.request
    .get('/api/logs')
    .query({ search: maliciousInput })
    .set('Authorization', `Bearer ${testContext.testToken}`);
  
  // Should reject malicious input
  assertApiResponse(response, 400);
  expect(response.body.error).toContain('Invalid input');
});
```

## Monitoring and Observability

### Test Metrics

The E2E test suite tracks:

- **Execution Times**: Per test suite and overall
- **Success Rates**: Pass/fail ratios across test runs
- **Database Performance**: Query execution times, connection usage
- **API Response Times**: Endpoint performance under test conditions

### Alerting

Set up alerts for:

- **Test Failures**: E2E test failures in CI/CD pipeline
- **Performance Degradation**: Significant increases in test execution time
- **Infrastructure Issues**: Database/Redis connectivity problems

## Troubleshooting Guide

### Common Error Patterns

1. **"Connection refused"**: Check database/Redis services are running
2. **"Timeout exceeded"**: Increase timeout values or check service performance
3. **"Test data conflicts"**: Ensure proper cleanup between test runs
4. **"Permission denied"**: Verify authentication tokens and user permissions

### Recovery Procedures

1. **Clean Test Environment**: 
   ```bash
   npm run test:clean  # Clean up any leftover test data
   ```

2. **Reset Database**:
   ```bash
   # Reset test database to clean state
   psql $DATABASE_URL -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
   npm run migrate  # Re-run migrations
   ```

3. **Clear Redis Cache**:
   ```bash
   redis-cli -u $REDIS_URL FLUSHALL
   ```

## Contributing

### Adding New E2E Tests

1. **Choose Appropriate Suite**: Add to existing suite or create new one
2. **Follow Naming Conventions**: Use descriptive test names and consistent structure
3. **Include Documentation**: Document new test scenarios and expected behaviors
4. **Test Data**: Use the TestDataManager for consistent test data creation
5. **Error Handling**: Test both success and failure scenarios

### Code Review Checklist

- [ ] Tests cover both positive and negative scenarios
- [ ] Test data is properly managed (created and cleaned up)
- [ ] Security aspects are considered and tested
- [ ] Performance implications are evaluated
- [ ] Documentation is updated for new test scenarios
- [ ] CI/CD integration works correctly

---

This E2E test suite provides comprehensive coverage of the SimpleAdminReporter backend API, ensuring reliable and secure operation in production environments.