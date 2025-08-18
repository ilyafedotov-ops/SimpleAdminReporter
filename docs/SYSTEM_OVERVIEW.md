# SimpleAdminReporter - System Overview

## Executive Summary

SimpleAdminReporter is a comprehensive enterprise reporting platform that delivers Active Directory, Azure AD, and Office 365 analytics through a modern containerized architecture. Built with TypeScript, React, and PostgreSQL, it provides both pre-built reports and a custom query builder for enterprise identity and collaboration system reporting.

**Current Status**: Production-ready system with 15+ pre-built LDAP reports, robust authentication, comprehensive logging, and enterprise security features. As of August 2025, the system includes 236 test files with ~65-70% test coverage.

## System Purpose & Value Proposition

### Business Value
- **Identity Visibility**: Comprehensive reporting on user accounts, security status, and access patterns
- **Security Monitoring**: Automated detection of inactive accounts, password issues, and security risks
- **Operational Efficiency**: Self-service reporting capabilities with custom query builder
- **Audit Support**: Complete audit trails and compliance reporting capabilities
- **Decision Support**: Data-driven insights for identity and access management decisions

### Technical Value
- **Modern Architecture**: Containerized microservices with React frontend and Node.js backend
- **Multi-Source Integration**: LDAP for Active Directory, Microsoft Graph API for Azure AD/O365
- **Advanced Caching**: Redis-based multi-tier caching with smart invalidation
- **Security-First Design**: Comprehensive authentication, encryption, and audit logging
- **Developer-Friendly**: Extensive test coverage, TypeScript throughout, comprehensive API documentation

## Core Capabilities Matrix

| Capability | Status | Implementation |
|------------|--------|------------------|
| **Active Directory Reports** | ✅ Production | 15+ modular LDAP queries with parameter support |
| **Azure AD Integration** | 🟡 Partial | Microsoft Graph API integration, OAuth flow |
| **Office 365 Data** | 🟡 Partial | Graph API endpoints, basic O365 reporting |
| **Custom Query Builder** | ✅ Production | SQL query builder with security validation |
| **Real-time Logs** | ✅ Production | WebSocket-based log streaming with full-text search |
| **Export & Scheduling** | ✅ Production | Excel/CSV export, background job processing |
| **Advanced Search** | ✅ Production | PostgreSQL full-text search with fuzzy matching |
| **Comprehensive Audit** | ✅ Production | Security audit logs with correlation IDs |
| **Multi-Auth Support** | ✅ Production | JWT, Cookie, LDAP, and Azure AD authentication |
| **Health Monitoring** | ✅ Production | Comprehensive health checks and system metrics |

## System Requirements

### Hardware Requirements
- **Minimum**: 4 CPU cores, 8GB RAM, 50GB storage
- **Recommended**: 8 CPU cores, 16GB RAM, 100GB SSD storage
- **Network**: LDAP/LDAPS access to AD controllers, HTTPS for Microsoft Graph API

### Software Requirements
- **Operating System**: Linux (Ubuntu 20.04+) or Windows with WSL2
- **Container Runtime**: Docker 20.10+ with Docker Compose 2.0+
- **Database**: PostgreSQL 17-alpine (containerized)
- **Cache**: Redis 7-alpine (containerized)
- **Web Server**: Nginx 1.27-alpine (containerized)

### External Dependencies
- **Active Directory**: LDAP/LDAPS access with service account
- **Azure AD**: Registered application with appropriate permissions
- **Network**: Outbound HTTPS for Microsoft Graph API

## Architecture Overview

### Container Architecture
```
┌─────────────────────────────────────────────────────┐
│                 Nginx (Port 80/443)                 │
│         Reverse Proxy + SSL Termination             │
└──────────────────┬────────────────┬─────────────────┘
                   │                │
┌──────────────────▼────────┐  ┌───▼──────────────────┐
│   Frontend (Internal)     │  │  Backend (Port 5000) │
│   React 19 + TypeScript 5 │  │  Node.js 18 + Express│
│   Ant Design 5.27         │  │  TypeScript + Auth   │
│   Vite Build              │  │  Multi-Strategy Auth │
└───────────────────────────┘  └──────────┬───────────┘
                                          │
                  ┌───────────────────────┼────────────┐
                  │                       │            │
        ┌─────────▼──────┐      ┌────────▼────┐  ┌───▼────────┐
        │ PostgreSQL 17  │      │   Redis 7   │  │ External   │
        │ Internal Only  │      │ Cache/Queue │  │ Services   │
        │ Multi-tier Net │      │ Background  │  │ LDAP/Graph │
        └────────────────┘      └─────────────┘  └────────────┘
```

### Security Architecture

#### Authentication Flow
1. **Unified Auth System**: JWT and Cookie-based strategies with automatic fallback
2. **Multi-source Support**: LDAP (Active Directory), Azure AD (OAuth2), Local (Database)
3. **Token Management**: JWT with configurable expiration, refresh tokens, blacklisting
4. **Session Security**: CSRF protection, secure cookie flags, session correlation
5. **Failed Login Protection**: Progressive lockout, IP-based tracking, audit logging

#### Data Security
- **Encryption at Rest**: AES-256-GCM for service credentials with user-specific salts
- **Password Security**: bcrypt hashing with configurable rounds
- **Encryption in Transit**: TLS support, LDAPS for AD connections
- **Comprehensive Auditing**: Security logs with correlation IDs, failed login tracking
- **Input Validation**: Parameterized SQL queries, LDAP injection prevention, XSS protection
- **Query Security**: Whitelist-based column validation, SQL injection prevention

### Performance Architecture

#### Caching Strategy
- **Redis Cache**: Smart invalidation with TTL-based expiration
- **Query Results**: 5-minute TTL for logs queries, 1-minute for statistics
- **Cache Metrics**: Hit rate tracking and performance monitoring
- **Pattern-based Invalidation**: Automatic cache clearing on data changes

#### Query Optimization
- **Advanced Query Builder**: Type-safe SQL generation with injection protection
- **Connection Pooling**: PostgreSQL connection pool with recovery mechanisms
- **Database Indexes**: GIN indexes for JSONB fields, B-tree for range queries
- **Full-text Search**: PostgreSQL search vectors with weighted rankings
- **Background Jobs**: Bull Queue for report generation and exports

## Component Details

### Frontend Application
- **Framework**: React 19.1 with TypeScript 5.9
- **UI Library**: Ant Design 5.27 with responsive design
- **State Management**: Redux Toolkit 2.8
- **Build Tool**: Vite 7.1 (development and production builds)
- **Testing**: Vitest for unit tests, Playwright for E2E testing
- **Key Features**:
  - Real-time WebSocket log streaming
  - Advanced query builder with drag-and-drop
  - Multi-authentication support (JWT/Cookie)
  - Comprehensive error handling and validation
  - Microsoft Graph API integration

### Backend Services

#### Core Services
- **UnifiedAuthService**: Multi-strategy authentication (JWT/Cookie) with automatic fallback
- **LDAPQueryExecutor**: Modular LDAP query system with 15+ pre-built reports
- **AzureMsalService**: Microsoft Graph API integration with token management
- **LogsService**: Comprehensive logging with full-text search capabilities
- **QueryService**: Advanced SQL query builder with security validation
- **CacheService**: Redis-based caching with intelligent invalidation
- **ExportService**: Excel/CSV export with background processing

#### Enhanced Features (August 2025)
- **Full-text Search**: PostgreSQL text search with fuzzy matching and highlighting
- **Query Performance**: Real-time metrics collection and monitoring
- **Health Monitoring**: Comprehensive system health checks with component status
- **Security Auditing**: Complete audit trails with correlation ID tracking
- **Failed Login Protection**: Progressive lockout with IP-based tracking

### Database Schema

#### Core Tables
- `users`: User accounts with multi-source authentication support
- `service_credentials`: AES-256-GCM encrypted per-user credentials with salts
- `report_templates`: Pre-built LDAP report definitions with JSONB query storage
- `custom_report_templates`: User-created custom reports with sharing capabilities
- `report_history`: Complete execution history with results and performance metrics
- `audit_logs`: Security audit trail with correlation IDs and full-text search
- `system_logs`: Application logs with searchable vectors
- `query_metrics`: Performance monitoring data for optimization

#### Performance Features
- **Advanced Indexing**: GIN indexes for JSONB and full-text search vectors
- **Search Optimization**: Text search vectors with weighted field rankings
- **Query Caching**: Redis-based result caching with smart invalidation
- **Connection Pooling**: Optimized database connections with recovery mechanisms

## API Overview

### Endpoint Categories
- **Authentication**: `/api/auth/*` - Multi-strategy login, token refresh, logout
- **Reports**: `/api/reports/*` - Template management, execution, history
- **Custom Queries**: `/api/reports/query/*` - Advanced query builder with validation
- **Logs**: `/api/logs/*` - Real-time search, full-text search, export
- **Health**: `/api/health/*` - Component status, system metrics (auth required)
- **Credentials**: `/api/credentials/*` - Service credential management
- **System**: `/api/system/*` - Configuration and maintenance

### Rate Limiting (Production-Ready)
- **Authentication**: 10 login attempts/minute per IP
- **Query Execution**: 30 queries/minute per user
- **Log Search**: 50 searches/minute per user
- **Export Operations**: 5 exports/10 minutes per user
- **Health Checks**: 20 requests/minute (authenticated users only)

## Deployment Options

### Docker Deployment (Primary Method)
```bash
# Development deployment
docker-compose up -d

# Production deployment
docker-compose -f docker-compose.yml -f docker-compose.production.yml up -d

# CI/CD deployment
docker-compose -f docker-compose.ci.yml up -d
```

### Network Security Features
- **Multi-tier Networks**: Separate frontend and backend network tiers
- **Internal Database Access**: PostgreSQL and Redis not exposed to host
- **SSL Support**: HTTPS termination at Nginx with certificate mounting
- **Security Headers**: Comprehensive HTTP security headers

## Monitoring & Maintenance

### Health Monitoring (Authentication Required)
- **Comprehensive Health API**: Component-specific health checks for all services
- **Real-time Metrics**: Query performance, cache hit rates, connection status
- **Web Health Dashboard**: Real-time system status page with auto-refresh
- **Container Monitoring**: Docker stats and log aggregation

### Operational Features
- **Database Backups**: Docker volume-based persistence with backup scripts
- **Log Management**: Structured logging with rotation (10MB, 5 files)
- **Performance Monitoring**: Query metrics service with CSV export
- **Background Jobs**: Bull Queue for long-running operations
- **WebSocket Support**: Real-time log streaming and system updates

## Security Implementation

### Security Implementation (No Compliance Claims)
- **Input Validation**: Comprehensive validation for all user inputs
- **SQL Injection Prevention**: Parameterized queries with whitelist validation
- **Authentication Security**: Multi-strategy auth with failed login protection
- **Encryption**: AES-256-GCM for credentials, bcrypt for passwords
- **Audit Logging**: Complete security event logging with correlation IDs
- **CSRF Protection**: Double-submit cookie pattern with timing attack prevention

### Security Features
- **Progressive Lockout**: IP-based failed login tracking and temporary blocking
- **Token Security**: JWT blacklisting and secure cookie management
- **Network Isolation**: Multi-tier Docker networks with internal-only database access
- **Input Sanitization**: XSS prevention and LDAP injection protection

## Testing & Quality Assurance

### Test Coverage (August 2025)
- **Total Test Files**: 236 test files across backend and frontend
- **Backend Coverage**: ~65-70% overall coverage with comprehensive service testing
- **Test Types**: Unit tests (Jest), Integration tests, E2E tests (Playwright)
- **Security Testing**: Comprehensive security test suites for authentication and input validation
- **CI/CD Integration**: Automated test execution in GitLab CI/CD pipeline

### Test Quality Standards
- **TDD Approach**: Test-driven development for critical components
- **Security Focus**: Extensive security testing for authentication and authorization
- **Performance Testing**: Query performance monitoring and benchmarking
- **Error Handling**: Comprehensive error scenario testing

## Troubleshooting

### Common Issues
1. **Container Startup**: Check logs with `docker-compose logs <service>`
2. **Authentication Problems**: Verify LDAP/Azure credentials and network connectivity
3. **Performance Issues**: Use query metrics API and cache hit rate monitoring
4. **Export Failures**: Check Redis queue status and disk space availability
5. **Health Check Failures**: All health endpoints require authentication tokens

### Debug Tools
- **Application Logs**: `docker-compose logs -f backend` (structured JSON logs)
- **Database Access**: `docker-compose exec postgres psql -U postgres reporting`
- **Redis Monitoring**: `docker-compose exec redis redis-cli`
- **Health Status**: `curl -H "Authorization: Bearer <token>" http://localhost/api/health/detailed`
- **Query Performance**: `/api/logs/metrics/queries` endpoint for performance data

## Future Roadmap

### Immediate Priorities
- Complete Azure AD/O365 report template implementation
- Enhance PDF export capabilities
- Implement comprehensive E2E testing
- Performance optimization and load testing

### Medium-term Goals
- Multi-factor authentication integration
- Advanced analytics and dashboards
- Kubernetes deployment support
- Enhanced mobile responsiveness

## Support & Resources

### Documentation
- **API Documentation**: `/docs/API_DOCUMENTATION.md`
- **System Architecture**: `/docs/ARCHITECTURE.md`
- **Deployment Guide**: `/docs/DEPLOYMENT_GUIDE.md`
- **Development Guide**: `/CLAUDE.md`
- **Security Testing**: `/docs/SECURITY_TESTING_GUIDE.md`
- **CI/CD Pipeline**: `/docs/CICD_PIPELINE_GUIDE.md`

### Getting Help
- **GitLab Issues**: Bug reports and feature requests
- **Test Coverage**: 236 test files with ~65-70% coverage
- **System Status**: Health monitoring dashboard at `/health`

## License & Credits

SimpleAdminReporter is an enterprise application developed for internal organizational use.

### Key Technologies
- **Backend**: Node.js 18+, Express 5, TypeScript 5.9, PostgreSQL 17, Redis 7
- **Frontend**: React 19, Ant Design 5.27, TypeScript 5.9, Vite 7.1
- **Infrastructure**: Docker Compose, Nginx 1.27, Alpine Linux containers
- **Integration**: Microsoft Graph API, LDAP/LDAPS, WebSocket
- **Testing**: Jest, Playwright, Vitest (236 test files, ~65-70% coverage)
- **Security**: JWT/Cookie auth, AES-256-GCM encryption, comprehensive auditing

---

**Version**: 1.0.0  
**Last Updated**: August 2025  
**Status**: Production Ready with Comprehensive Testing  
**Test Coverage**: 236 test files, ~65-70% overall coverage  
**Security**: Multi-layer authentication, encryption, and audit logging