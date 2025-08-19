# CLAUDE.md



This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.


## LEVER Framework (Core Optimization Principles)

**L** – Leverage existing patterns  
**E** – Extend before creating  
**V** – Verify through reactivity  
**E** – Eliminate duplication  
**R** – Reduce complexity  

### Core Philosophy

"The best code is no code. The second-best code is code that already exists and works."

### LEVER Decision Framework
Before writing any code, ask:  
1. Can I extend an existing module/class? (vs creating new)  
2. Can I enhance an existing function? (vs new function)  
3. Can I modify an existing component? (vs new component)  
4. Can I reuse an existing pattern? (vs creating new pattern)

## Core Development Rules 

- **Follow LEVER framework** for all development decisions

## Project Overview

This is a containerized AD/Azure AD/O365 reporting application designed for Docker/WSL deployment. The application provides pre-built reports, custom report builder functionality, and enterprise authentication.

### Technology Stack
- **Frontend**: React with TypeScript, Ant Design UI library, Redux Toolkit
- **Backend**: Node.js with Express.js and TypeScript  
- **Database**: PostgreSQL with Prisma/TypeORM ORM
- **Cache/Queue**: Redis with Bull Queue for background jobs
- **Infrastructure**: Docker Compose, Nginx reverse proxy
- **Authentication**: LDAP for AD, MSAL for Azure AD/O365, JWT tokens

## Architecture

### Key Components
- **Frontend Container**: React app served by Nginx on port 3000
- **Backend Container**: Node.js API server on port 5000
- **Nginx Container**: Reverse proxy on port 80 
- **PostgreSQL Container**: Database on port 5432
- **Redis Container**: Cache and job queue on port 6379

### Project Structure (Expected)
```
/
├── frontend/          # React TypeScript application
├── backend/           # Node.js Express API
├── nginx/             # Nginx configuration
├── database/          # Database schemas and migrations
├── docker-compose.yml # Container orchestration
└── .env              # Environment configuration
```

## Development Commands

### Docker Environment
```bash
# Build and start all services
docker-compose build
docker-compose up -d

# View container status and logs
docker-compose ps
docker-compose logs -f [service-name]

# Database operations
docker-compose exec backend npm run migrate
docker-compose exec backend npm run seed

# Stop and cleanup
docker-compose down
docker-compose down -v  # Include volumes
```

### Local Development
```bash
# Frontend development (if applicable)
cd frontend && npm install && npm start

# Backend development (if applicable) 
cd backend && npm install && npm run dev

# Database only for local dev
docker-compose up postgres redis
```

### Testing and Quality
```bash
# Backend Testing
cd backend
npm test                    # Run all tests
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests only
npm run test:coverage      # With coverage report
npm run lint              # ESLint check
npm run typecheck         # TypeScript type checking

# Frontend Testing  
cd frontend
npm test                   # Run Vitest tests
npm run test:coverage      # With coverage report
npm run lint              # ESLint check (max 10 warnings)
npm run type-check        # TypeScript type checking

# Code Quality Metrics
# - Backend: 85 ESLint warnings (being addressed)
# - Frontend: 361 ESLint warnings (being addressed)
# - Test Coverage: 50% branch/function, 60% line/statement minimum
```

#### Logs API Test Coverage (2025)
Comprehensive test suites for all new components:

- **QueryBuilder Tests**: 51 tests covering all SQL building functionality
- **LogsService Tests**: 24 tests for core service logic
- **Full-text Search Tests**: 20 tests for PostgreSQL search features
- **Cache Service Tests**: 20 tests for Redis caching layer
- **Query Metrics Tests**: 15 tests for performance monitoring
- **Total New Tests**: 130+ tests ensuring robust functionality

Test files location:
```
backend/src/services/
├── query/QueryBuilder.test.ts
├── logs.service.test.ts
├── logs-fulltext-search.test.ts
├── logs-cache.service.test.ts
└── query-metrics.service.test.ts
```

## Core Features

### Report Types
1. **Pre-built Reports**: 15+ reports each for AD, Azure AD, and O365
   - Inactive Users, Password Expiry, Locked Accounts (AD)
   - Guest Users, MFA Status, Risky Sign-ins (Azure AD) 
   - Mailbox Usage, OneDrive Storage, Teams Activity (O365)

2. **Custom Report Builder**: Visual query builder with drag-and-drop interface
   - Dynamic field discovery from data sources
   - Advanced filtering with multiple operators
   - Template gallery for sharing custom reports
   - Real-time preview and export capabilities

### Data Sources Integration
- **Active Directory**: LDAP connection using ldapjs library
- **Azure AD**: Microsoft Graph API with MSAL authentication
- **Office 365**: Graph API reports and analytics endpoints

### Background Processing
- **Bull Queue**: Redis-backed job processing for report generation
- **Scheduling**: Automated report generation with configurable schedules
- **Export Formats**: Excel, CSV, PDF with configurable templates

## Database Schema

### Key Tables
- `users`: Authentication and user management
- `report_templates`: Pre-built report definitions
- `custom_report_templates`: User-created report templates with JSONB query storage
- `report_history`: Execution history and audit trail
- `field_metadata`: Cached field information from data sources
- `report_schedules`: Automated report scheduling configuration

## Authentication & Security

### Authentication Flow
1. LDAP authentication for Active Directory users
2. MSAL (Microsoft Authentication Library) for Azure AD
3. JWT token generation for session management
4. Role-based access control with user permissions

### Security Considerations
- Network access limited to internal/WSL environment
- HTTP-only configuration (internal network use)
- Query validation to prevent LDAP injection
- Rate limiting on report generation
- Audit logging for all report access

### SQL Security Implementation

#### Strengths
1. **Security Implementation**
```typescript
// Good SQL injection prevention
const allowedSortColumns = ['created_at', 'event_type', 'event_action', 'username', 'ip_address'];
if (params.sortBy && allowedSortColumns.includes(params.sortBy)) {
  sortColumn = params.sortBy;
}
```

2. **Parameterized Queries**
- All user inputs are properly parameterized using placeholders ($1, $2, etc.)
- Dynamic SQL construction is avoided where possible
- Query timeouts prevent long-running malicious queries

3. **Input Validation**
- Whitelist approach for sort columns prevents injection via ORDER BY
- Sort order restricted to 'ASC' or 'DESC' only
- Page size limited to prevent resource exhaustion

4. **Database Indexes**
- GIN indexes for JSONB fields enable efficient searches
- Functional indexes on LOWER() for case-insensitive searches
- Text search indexes for full-text queries on large text fields

## Environment Configuration

### Required Environment Variables
```bash
# Active Directory
AD_SERVER=your-dc.domain.local
AD_BASE_DN=DC=domain,DC=local  
AD_USERNAME=service-account-dn
AD_PASSWORD=service-account-password

# Azure AD Application
AZURE_TENANT_ID=your-tenant-id
AZURE_CLIENT_ID=your-app-id
AZURE_CLIENT_SECRET=your-app-secret

# Security & Database
JWT_SECRET=long-random-secret
DATABASE_URL=postgresql://postgres:password@postgres:5432/reporting
REDIS_URL=redis://redis:6379
```

## Network Access (WSL/Docker)

### Windows Browser Access
- Application runs in WSL2 Docker containers
- Access via `http://[WSL-IP]` from Windows browsers
- WSL IP can be found with: `hostname -I | awk '{print $1}'`
- Windows Firewall configuration may be required for external access

### Troubleshooting Network Issues
```bash
# Get WSL IP address
hostname -I

# Test local connectivity
curl http://localhost  # Should work in WSL
docker-compose ps      # Check container status

# Test AD connectivity
ldapsearch -x -H ldap://DC_IP -D "user@domain" -W
```

## Custom Report Builder

### Query Structure
Custom reports store queries as JSONB with structure:
```javascript
{
  source: 'ad' | 'azure' | 'o365',
  fields: [{ name: 'fieldName', displayName: 'Display Name' }],
  filters: [{ field: 'fieldName', operator: 'equals', value: 'filterValue' }],
  groupBy: 'fieldName',
  orderBy: { field: 'fieldName', direction: 'asc' | 'desc' }
}
```

### Field Discovery
- Dynamic field metadata retrieval from each data source
- Categorized fields (basic, organization, security, etc.)
- Cached field information for performance
- Support for custom field extensions

## Refactored Reporting Architecture (Updated 2025)

### LDAP Query Definitions
The reporting system now uses a modular architecture with separate query definition files:

#### Directory Structure
```
backend/src/queries/ldap/
├── types.ts           # TypeScript interfaces for query definitions
├── index.ts           # Query registry and helper functions
├── users/             # User-related queries
│   ├── inactive-users.ts
│   ├── disabled-users.ts
│   ├── locked-accounts.ts
│   ├── password-expiry.ts
│   ├── never-expiring-passwords.ts
│   ├── privileged-users.ts
│   ├── recent-lockouts.ts
│   └── recent-password-changes.ts
├── computers/         # Computer-related queries
│   ├── disabled-computers.ts
│   ├── inactive-computers.ts
│   ├── domain-servers.ts
│   └── os-summary.ts
└── groups/           # Group-related queries
    └── empty-groups.ts
```

#### Query Definition Structure
Each query is defined with:
```typescript
interface LDAPQueryDefinition {
  id: string;                    // Unique identifier matching report_type
  name: string;                  // Display name
  description: string;           // User-friendly description
  category: string;              // Query category (users/computers/groups)
  query: {                       // LDAP search options
    scope: 'base' | 'one' | 'sub';
    filter: string;              // LDAP filter with parameter placeholders
    attributes: string[];        // Fields to retrieve
    sizeLimit?: number;
  };
  parameters: {                  // Runtime parameters
    [key: string]: {
      type: string;
      required?: boolean;
      default?: any;
      description?: string;
      transform?: string;        // Parameter transformation (e.g., 'daysToFileTime')
    };
  };
  postProcess?: {                // Post-query processing
    filter?: any;                // Additional filtering
    sort?: { field: string; direction: 'asc' | 'desc' };
    limit?: number;
  };
  fieldMappings: {               // Field display configuration
    [field: string]: {
      displayName: string;
      type?: string;
      transform?: string;        // Field transformation (e.g., 'fileTimeToDate')
    };
  };
}
```

### LDAP Query Executor Service
Located at `/backend/src/services/ldap-query-executor.service.ts`:

#### Key Features:
1. **User-Specific Credentials**: Uses stored service credentials per user from `service_credentials` table
2. **Parameter Transformations**: Converts user-friendly values (days/hours) to LDAP formats (Windows FileTime)
3. **Post-Processing**: Applies filtering, sorting, and limiting after query execution
4. **History Storage**: Stores complete execution history with results in `report_history` table
5. **Error Handling**: Comprehensive error tracking and reporting

#### Usage Example:
```typescript
const result = await ldapQueryExecutor.executeQuery({
  userId: 1,
  queryId: 'inactive_users',
  parameters: { days: 90 }
});
```

### Report History Storage
All report executions are now stored in the `report_history` table:

```sql
CREATE TABLE report_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  report_id VARCHAR(255) NOT NULL,    -- Query/template ID
  executed_at TIMESTAMP,
  parameters JSONB,                    -- Execution parameters
  result_count INTEGER,                -- Number of results
  results JSONB,                       -- Complete result data
  status VARCHAR(20),                  -- 'success' or 'error'
  error_message TEXT,                  -- Error details if failed
  execution_time_ms INTEGER            -- Query execution time
);
```

### API Endpoints
- `GET /api/reports/history` - List execution history
- `GET /api/reports/history/:id` - Get specific execution details with results
- `POST /api/reports/execute/:templateId` - Execute report and store history

### Adding New Reports
1. Create a new query definition file in the appropriate directory:
```typescript
// backend/src/queries/ldap/users/new-report.ts
import { LDAPQueryDefinition } from '../types';

export const newReportQuery: LDAPQueryDefinition = {
  id: 'new_report',
  name: 'New Report Name',
  description: 'Description of what this report does',
  category: 'users',
  query: {
    scope: 'sub',
    filter: '(&(objectClass=user)(yourFilter=value))',
    attributes: ['sAMAccountName', 'displayName'],
    sizeLimit: 1000
  },
  parameters: {},
  fieldMappings: {
    sAMAccountName: { displayName: 'Username' },
    displayName: { displayName: 'Display Name' }
  }
};
```

2. Export it from the category index file:
```typescript
// backend/src/queries/ldap/users/index.ts
export { newReportQuery } from './new-report';
```

3. The query is automatically registered and available for execution

### Service Credentials Integration
- Each user can store multiple service credentials (AD, Azure AD, O365)
- Credentials are encrypted with per-credential salts (v1 format)
- Reports execute with user-specific credentials, not system defaults
- Credential selection is automatic based on service type

## Performance & Monitoring

### Optimization Strategies
- Redis caching for field metadata and frequently accessed data
- Database indexing on common query patterns
- Connection pooling for LDAP and database connections
- Background job processing for large reports
- Pagination for large result sets (default 1000 records)

### Logs API Architecture (Updated 2025)

#### Enhanced Query Builder
The application now includes a powerful SQL query builder with advanced features:

```typescript
// Example usage
const query = QueryBuilder.create()
  .select(['department', 'COUNT(*) as user_count'])
  .from('users')
  .where([
    { field: 'active', operator: 'eq', value: true },
    { field: 'created_at', operator: 'gte', value: new Date('2025-01-01') }
  ])
  .groupBy('department')
  .having('COUNT(*) > 5')
  .orderBy('user_count', 'desc')
  .limit(10)
  .build();
```

Features:
- **SQL Injection Protection**: Parameterized queries with field validation
- **GROUP BY & HAVING**: Full support for aggregation queries
- **Complex WHERE Conditions**: Multiple operators (eq, ne, gt, gte, lt, lte, like, ilike, in, nin)
- **JOIN Support**: INNER, LEFT, RIGHT, and FULL OUTER joins
- **Type Safety**: Full TypeScript support with interfaces

#### Redis Caching Layer
Comprehensive caching implementation for logs queries:

```typescript
// Automatic caching with TTL
const result = await logsService.getAuditLogs(params);
// Results are automatically cached and returned from cache on subsequent calls
```

Features:
- **Smart Cache Invalidation**: Automatic invalidation on new log events
- **TTL Management**: 5 minutes for queries, 1 minute for statistics
- **Cache Statistics**: Track hit rates and performance
- **Pattern-based Invalidation**: Clear related cache entries

#### PostgreSQL Full-Text Search
Advanced search capabilities with PostgreSQL:

```sql
-- Weighted search with ranking
SELECT *, ts_rank(search_vector, query) as rank
FROM audit_logs
WHERE search_vector @@ websearch_to_tsquery('english', 'login failed')
ORDER BY rank DESC;
```

Features:
- **Weighted Search**: Different weights for different fields (A-D)
- **Search Highlighting**: Returns matched text snippets
- **Fuzzy Search**: Trigram similarity for typo tolerance
- **Multi-language Support**: Configurable text search configurations

#### Query Performance Metrics
Real-time performance monitoring:

```typescript
// Automatic metric collection
await queryMetricsService.recordQueryMetric({
  queryType: 'audit_logs',
  executionTimeMs: 150,
  rowCount: 50,
  cacheHit: false,
  timestamp: new Date()
});
```

Features:
- **Execution Time Tracking**: Identify slow queries
- **Cache Hit Rate**: Monitor cache effectiveness
- **Error Tracking**: Track query failures
- **CSV Export**: Export metrics for analysis
- **Real-time Events**: EventEmitter for live monitoring

#### Rate Limiting
Protection against API abuse:

```typescript
// Specialized rate limiters
logsQueryRateLimiter: 30 requests/minute
logsExportRateLimiter: 5 exports/10 minutes
logsStreamRateLimiter: 5 concurrent streams/minute
```

#### New API Endpoints
Enhanced logs API with new endpoints:

```bash
# Full-text search
GET /api/logs/search/fulltext?q=error+database&type=system

# Fuzzy search
GET /api/logs/search/fuzzy?type=audit&field=username&term=admin&threshold=0.3

# Query performance metrics
GET /api/logs/metrics/queries?hours=24
GET /api/logs/metrics/queries?queryType=audit_logs

# Export metrics
GET /api/logs/metrics/queries/export?queryType=system_logs
```

#### Database Schema Updates
New fields and indexes:

```sql
-- Correlation ID for request tracing
ALTER TABLE audit_logs ADD COLUMN correlation_id VARCHAR(100);
CREATE INDEX idx_audit_logs_correlation_id ON audit_logs(correlation_id);

-- Full-text search vectors
ALTER TABLE audit_logs ADD COLUMN search_vector tsvector;
ALTER TABLE system_logs ADD COLUMN search_vector tsvector;

-- GIN indexes for fast search
CREATE INDEX idx_audit_logs_search_vector ON audit_logs USING GIN(search_vector);
CREATE INDEX idx_system_logs_search_vector ON system_logs USING GIN(search_vector);
```

### Health Monitoring

The application includes comprehensive health monitoring with the following endpoints:

#### Health Check Endpoints (Authentication Required)
All health endpoints require authentication for security reasons:

```bash
# Basic health check (REQUIRES AUTH)
curl -H "Authorization: Bearer <token>" http://localhost/api/health

# Liveness probe (REQUIRES AUTH)
curl -H "Authorization: Bearer <token>" http://localhost/api/health/live

# Detailed health status (REQUIRES AUTH)
curl -H "Authorization: Bearer <token>" http://localhost/api/health/detailed

# Readiness probe (REQUIRES AUTH)
curl -H "Authorization: Bearer <token>" http://localhost/api/health/ready

# Component-specific health (REQUIRES AUTH)
curl -H "Authorization: Bearer <token>" http://localhost/api/health/component/database
curl -H "Authorization: Bearer <token>" http://localhost/api/health/component/redis
curl -H "Authorization: Bearer <token>" http://localhost/api/health/component/ldap
curl -H "Authorization: Bearer <token>" http://localhost/api/health/component/azure

# Health summary (REQUIRES AUTH)
curl -H "Authorization: Bearer <token>" http://localhost/api/health/summary

# Operational status (REQUIRES AUTH)
curl -H "Authorization: Bearer <token>" http://localhost/api/health/operational
```

#### Health Page
- Accessible via the web UI at `/health` when logged in
- Shows real-time status of all system components
- Auto-refreshes every 30 seconds
- Displays CPU, memory, and disk usage metrics
- Shows service response times and connection status

#### Container Monitoring
```bash
# View all container logs
docker-compose logs -f

# Monitor container resource usage
docker stats $(docker-compose ps -q)

# Check specific service logs
docker-compose logs -f backend
docker-compose logs -f frontend
```

**Note**: Health checks test only service accessibility, not authentication. LDAP and Azure AD health checks verify that services are reachable without attempting to authenticate.

## Backup & Maintenance

### Database Backup
```bash
# Manual backup
docker-compose exec -T postgres pg_dump -U postgres reporting | gzip > backup.sql.gz

# Automated backup script location (if implemented)
./scripts/backup.sh
```

### Log Management
- Docker log rotation configured (10MB, 5 files)
- Application logs structured for analysis
- Audit trail in database for compliance

## Common Development Tasks

### Adding New Pre-built Reports
1. Define report template in `report_templates` table
2. Implement service method in appropriate data source service
3. Add controller endpoint for report execution
4. Update frontend report selection interface

### Creating Custom Field Types
1. Update field discovery service for data source
2. Add field metadata to database cache
3. Implement query translation in report execution
4. Update frontend field picker interface

### Extending Authentication
1. Add new authentication provider service
2. Update JWT token generation with provider info
3. Implement user synchronization if needed
4. Update frontend login interface

## Troubleshooting

### Common Issues
- **LDAP Connection**: Verify AD service account permissions and network connectivity
- **Azure AD**: Check app registration permissions and client secret validity
- **Database**: Ensure PostgreSQL container is running and migrations completed
- **Redis**: Verify Redis container for background job processing
- **Network**: Check WSL IP and Windows Firewall for browser access issues

### CI/CD Pipeline Issues
- **Shell Syntax Errors**: Ensure scripts use POSIX-compliant syntax (sh, not bash specific)
- **Artifact Size Limits**: Check that source maps and unnecessary files are excluded
- **Alpine Linux Compatibility**: Install bash if needed: `apk add --no-cache bash`
- **ESLint Failures**: Set `--max-warnings` flag or configure warning thresholds
- **Coverage Failures**: Adjust thresholds in jest.config.js and vite.config.ts

### Debug Commands
```bash
# Check all container status
docker-compose ps

# View specific service logs
docker-compose logs [frontend|backend|postgres|redis|nginx]

# Test database connection
docker-compose exec postgres psql -U postgres -d reporting -c "SELECT 1"

# Test Redis connection  
docker-compose exec redis redis-cli ping

# Check CI/CD pipeline locally
gitlab-runner exec docker validate:commits
gitlab-runner exec docker build:backend
```



## GitLab Server Configuration & CI/CD Pipeline

### GitLab Server Information
- **Repository**: Configure in `.env` file with `GITLAB_URL` and `GITLAB_PROJECT_ID`
- **Registry**: Uses GitLab Container Registry for Docker images
- **Branches**: `main` for production, `develop` for staging
- **CI/CD**: Automated pipeline with build, test, security, and deploy stages

### CI/CD Pipeline Overview
The pipeline has been refactored with a modular structure and includes these stages:
1. **Validate**: Commit message validation and branch naming conventions
2. **Build**: Frontend and backend compilation with linting
3. **Test**: Unit tests, integration tests with coverage thresholds
4. **Security**: Dependency audits, Dockerfile scanning, and secrets detection
5. **Report**: Code quality metrics and artifact size monitoring

#### Modular Pipeline Structure
```
.gitlab/
├── ci/
│   ├── scripts/
│   │   ├── lint-check.sh        # ESLint execution with metrics
│   │   ├── quality-report.sh    # Code quality report generation
│   │   └── security-audit.sh    # Security vulnerability scanning
│   └── templates/
│       ├── node-build.yml       # Reusable Node.js build template
│       └── test-template.yml    # Reusable test execution template
```

### Required GitLab CI/CD Variables
Configure these in GitLab Project Settings > CI/CD > Variables:

#### Registry & Deployment
```bash
CI_REGISTRY_PASSWORD        # GitLab registry password
STAGING_SERVER              # Staging server hostname/IP
STAGING_USER                # SSH user for staging deployment
STAGING_SSH_PRIVATE_KEY     # SSH private key for staging access
PRODUCTION_SERVER           # Production server hostname/IP  
PRODUCTION_USER             # SSH user for production deployment
PRODUCTION_SSH_PRIVATE_KEY  # SSH private key for production access
```

#### Application Secrets (Protected)
```bash
DATABASE_URL                # Production database connection string
REDIS_URL                   # Production Redis connection string
JWT_SECRET                  # JWT signing secret
AD_SERVER                   # Active Directory server
AD_USERNAME                 # AD service account
AD_PASSWORD                 # AD service account password (Masked)
AZURE_TENANT_ID            # Azure AD tenant ID
AZURE_CLIENT_ID            # Azure AD application ID
AZURE_CLIENT_SECRET        # Azure AD application secret (Masked)
```

### Deployment Commands
```bash
# Manual deployment using script
./scripts/deploy.sh staging
./scripts/deploy.sh production

# GitLab CI/CD deployment (automatic)
# Staging: Push to develop branch
# Production: Manual job trigger on main branch
```

### Pipeline Features
- **Shell Compatibility**: Alpine Linux compatible with POSIX-compliant scripts
- **Artifact Optimization**: Excludes source maps and type definitions to reduce size
- **Parallel Execution**: Frontend and backend builds run concurrently
- **Warning Tolerance**: Continues on ESLint warnings while tracking technical debt
- **Coverage Thresholds**: Enforces 50% branch/function and 60% line/statement coverage
- **Security Scanning**: Uses Hadolint for Dockerfiles and Gitleaks for secrets
- **Modular Scripts**: Reusable shell scripts for common CI/CD tasks

### Environment Configuration Files
- `.env.example`: Template with all required variables
- `docker-compose.ci.yml`: CI/CD optimized compose file
- `.gitlab-ci.yml`: Complete pipeline configuration

### Mandatory Commit Policy ⚠️ CRITICAL
**RULE**: When tasks completed start double check if some tasks and continue work on missed tasks
**RULE**: Always commit and push changes to trigger CI/CD pipeline


#### Commit Workflow:
1. **Complete development task**
2. **Run local tests**: `npm test` or equivalent
3. **Stage changes**: `git add <files>`
4. **Commit with descriptive message**
5. **Push to GitLab**: `git push origin <branch>`
6. **Monitor CI/CD pipeline in GitLab**
7. **Verify deployment success**

## Implementation Guidelines

- Always start with exploration and understanding before coding
- Use the LEVER framework for all development decisions
- Maintain clear documentation of patterns and conventions
- Experiment with different approaches to find optimal workflows
- Balance speed with safety and code quality
- **Always commit and push changes to GitLab server immediately**

## GitHub Configuration & Commit Standards

### GitHub Repository Information
- **Repository**: [ilyafedotov-ops/SimpleAdminReporter](https://github.com/ilyafedotov-ops/SimpleAdminReporter)
- **Main Branch**: `main`
- **Actions**: GitHub Actions CI/CD pipeline configured
- **Security**: CodeQL analysis enabled for security scanning

### Conventional Commit Standards
The project uses **commitlint** with conventional commit format. All commits must follow this structure:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

#### Required Commit Types
```bash
feat     # New features
fix      # Bug fixes
docs     # Documentation changes
style    # Code style changes (formatting, etc.)
refactor # Code refactoring
perf     # Performance improvements
test     # Test-related changes
chore    # Maintenance tasks
ci       # CI/CD related changes
build    # Build system changes
revert   # Reverts previous commits
```

#### Commit Examples
```bash
# Feature addition
feat: add user authentication with JWT tokens

# Bug fix (including security fixes)
fix: replace Math.random() with crypto.randomBytes() for secure random generation

# Documentation update
docs: update API documentation with new endpoints

# Refactoring
refactor: extract common validation logic into utility functions

# Styling/linting fixes
style: fix ESLint violations and improve type safety
```

#### Commitlint Configuration
The project uses `@commitlint/config-conventional` with these rules:
- **Type**: Must be one of the allowed types above
- **Subject**: Must be lowercase, no period at the end
- **Body**: Optional detailed explanation
- **Footer**: Optional breaking changes or issue references

### GitHub Actions Workflow
The repository includes a CI/CD pipeline (`.github/workflows/ci.yml`) with:

#### Pipeline Stages
1. **Validate**: Commit message validation with commitlint
2. **Build**: Frontend and backend compilation with linting
3. **Test**: Unit tests, integration tests with coverage thresholds
4. **Security**: Dependency audits and CodeQL security scanning
5. **Deploy**: Staging and production deployment (manual triggers)

#### Key Features
- **Parallel Execution**: Frontend and backend builds run concurrently
- **Cache Optimization**: NPM cache for dependency installation speed
- **Coverage Thresholds**: Enforces minimum test coverage requirements
- **Security Scanning**: Automated vulnerability detection with CodeQL
- **Artifact Management**: Build artifacts with size optimization

### Development Workflow with GitHub
```bash
# 1. Create feature branch
git checkout -b feature/your-feature-name

# 2. Make changes and commit with conventional format
git add .
git commit -m "feat: add new reporting dashboard"

# 3. Push to GitHub
git push origin feature/your-feature-name

# 4. Create Pull Request on GitHub
# 5. Wait for CI/CD pipeline to pass
# 6. Merge after code review
```

### GitHub Security Features
- **CodeQL Analysis**: Automatic security vulnerability scanning
- **Dependabot**: Automated dependency security updates  
- **Secret Scanning**: Prevents committing sensitive information
- **Branch Protection**: Requires PR reviews and status checks

### Commit Message Validation
Install commitlint globally for local validation:
```bash
npm install -g @commitlint/cli @commitlint/config-conventional
```

Validate commit messages locally:
```bash
echo "feat: add new feature" | commitlint
```

### Emergency Commit Fixes
If commitlint fails, fix the commit message:
```bash
# For the last commit
git commit --amend -m "fix: correct commit message format"
git push --force-with-lease origin main

# For multiple commits
git rebase -i HEAD~n  # where n is number of commits to fix
```

### GitHub Actions Troubleshooting

#### Recent Fixes Applied (2025)

**Issue**: GitHub Actions failing with "Dependencies lock file is not found" error
- **Root Cause**: NPM cache configuration in `validate` job looking for package-lock.json at root level
- **Solution**: Removed cache configuration from validate job since it only installs global packages
- **Fix Location**: `.github/workflows/ci.yml` line 32
- **Status**: ✅ Resolved in commit `7fa5c37`

**Issue**: CodeQL Security Alert #54 - Insecure randomness
- **Root Cause**: Using `Math.random()` in test data generation for passwords
- **Solution**: Replaced with `crypto.randomBytes()` for cryptographically secure random generation
- **Fix Location**: `frontend/e2e/fixtures/test-data.ts:279`
- **Status**: ✅ Resolved in commit `965352e`

**Issue**: ESLint linting violations in test files
- **Root Cause**: Excessive use of `any` types, missing type annotations, magic numbers
- **Solution**: Added proper TypeScript interfaces, constants, and type safety improvements
- **Fix Location**: `backend/src/routes/reports.routes.test.ts`
- **Status**: ✅ Resolved in commit `ea8a1c2`

#### Common GitHub Actions Issues
```bash
# Cache dependency path issues
- Problem: "Dependencies lock file is not found"
- Solution: Ensure cache-dependency-path points to correct package-lock.json location
- Example: `cache-dependency-path: backend/package-lock.json`

# Commitlint failures
- Problem: "type must be one of [feat, fix, docs...]"
- Solution: Use conventional commit types only
- Invalid: "security:", "bugfix:", "update:"
- Valid: "fix:", "feat:", "docs:", "refactor:"

# ESLint max-warnings exceeded
- Problem: Too many linting violations
- Solution: Fix TypeScript any types, add proper interfaces, remove unused imports
- Run locally: `npm run lint -- --max-warnings 0`
```