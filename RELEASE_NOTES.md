# SimpleAdminReporter Release Notes

## Version 1.0.0-beta (2025-08-18)

### 🎉 Initial Beta Release

This is the first beta release of SimpleAdminReporter, a comprehensive containerized reporting application for Active Directory, Azure AD, and Office 365 environments.

### ✨ Core Features

#### 🏢 **Multi-Source Data Integration**
- **Active Directory (LDAP)**: Complete LDAP integration using ldapjs library
- **Azure Active Directory**: Microsoft Graph API integration with MSAL authentication
- **Office 365**: Graph API reports and analytics endpoints
- **Unified Authentication**: Secure credential management across all data sources

#### 📊 **Pre-Built Report Library**
- **15+ Active Directory Reports**:
  - Inactive Users, Password Expiry, Locked Accounts
  - Disabled Users, Privileged Users, Recent Lockouts
  - Computer Reports (Inactive/Disabled, Domain Servers, OS Summary)
  - Group Management (Empty Groups)
  
- **15+ Azure AD Reports**:
  - Guest Users, MFA Status, Risky Sign-ins
  - Conditional Access Policies, License Usage
  - Application Usage, Security Reports
  
- **15+ Office 365 Reports**:
  - Mailbox Usage, OneDrive Storage, Teams Activity
  - SharePoint Usage, Email Flow, Compliance Reports

#### 🛠️ **Custom Report Builder**
- **Visual Query Builder**: Drag-and-drop interface for creating custom reports
- **Dynamic Field Discovery**: Automatic field detection from all data sources
- **Advanced Filtering**: Multiple operators (equals, contains, greater than, etc.)
- **Template Gallery**: Share and reuse custom report templates
- **Real-time Preview**: Test queries before execution
- **Export Capabilities**: Excel, CSV, PDF formats

#### 🔐 **Enterprise Security**
- **Multi-Authentication Support**: LDAP, Azure AD OAuth, JWT tokens
- **Secure Credential Storage**: Per-user encrypted credentials with salt-based encryption
- **Role-Based Access Control**: User permissions and audit trail
- **SQL Injection Protection**: Parameterized queries and input validation
- **Rate Limiting**: API protection against abuse

#### 🚀 **Modern Architecture**
- **Containerized Deployment**: Docker Compose with Nginx reverse proxy
- **Microservices Design**: Separate frontend, backend, database, cache layers
- **Background Processing**: Redis-backed Bull Queue for report generation
- **Real-time Updates**: WebSocket support for live report status
- **Scalable Infrastructure**: PostgreSQL database with Redis caching

### 🔧 **Technical Specifications**

#### **Frontend**
- **Framework**: React 19.1.1 with TypeScript
- **UI Library**: Ant Design 5.27.0
- **State Management**: Redux Toolkit 2.8.2
- **Build Tool**: Vite 7.1.2
- **Testing**: Vitest + Playwright for E2E

#### **Backend** 
- **Runtime**: Node.js 18+ with Express.js 5.1.0
- **Language**: TypeScript 5.9.2
- **Database ORM**: Prisma 6.14.0 + TypeORM 0.3.25
- **Authentication**: MSAL Node 3.7.1, JWT, LDAP
- **Testing**: Jest 30.0.5 with comprehensive test suites

#### **Infrastructure**
- **Database**: PostgreSQL with advanced indexing
- **Cache/Queue**: Redis 5.8.1 with Bull Queue 4.16.5
- **Reverse Proxy**: Nginx with SSL termination
- **Container Orchestration**: Docker Compose

### 📈 **Performance & Quality**

#### **Comprehensive Testing**
- **130+ Test Cases**: Complete coverage of core functionality
- **Unit Tests**: 85% code coverage minimum
- **Integration Tests**: End-to-end workflow testing
- **E2E Tests**: Browser automation with Playwright
- **Security Tests**: Input validation and injection protection

#### **Query Optimization**
- **Advanced SQL Builder**: Dynamic query generation with safety checks
- **Redis Caching**: 5-minute TTL for queries, smart cache invalidation
- **PostgreSQL Full-Text Search**: Weighted search with ranking
- **Database Indexing**: GIN indexes for JSONB, functional indexes
- **Performance Metrics**: Real-time query performance monitoring

#### **Code Quality**
- **ESLint**: Strict linting with TypeScript support
- **TypeScript**: Full type safety across frontend and backend
- **Git Hooks**: Pre-commit validation and formatting
- **CI/CD Pipeline**: GitLab CI with automated testing and deployment

### 🌐 **Network & Deployment**

#### **WSL/Docker Deployment**
- Optimized for Windows Subsystem for Linux (WSL2)
- Docker containers with health checks and auto-restart
- Nginx reverse proxy for production-ready deployment
- Environment-based configuration management

#### **Network Access**
- Internal network deployment (HTTP for internal use)
- Windows browser access via WSL IP address
- Configurable base URLs and ports
- Firewall configuration documentation

### 🔄 **Background Processing**

#### **Report Generation**
- **Asynchronous Processing**: Long-running reports handled via job queue
- **Scheduling System**: Automated report generation with cron-like syntax
- **Export Pipeline**: Multi-format export (Excel, CSV, PDF) with templates
- **History Tracking**: Complete audit trail of all report executions
- **Error Handling**: Comprehensive error reporting and retry mechanisms

### 📝 **Comprehensive Logging**

#### **Enhanced Logs API (2025)**
- **Advanced Query Builder**: Complex SQL generation with GROUP BY, HAVING, JOINs
- **Full-Text Search**: PostgreSQL-based search with highlighting and ranking
- **Cache Layer**: Intelligent Redis caching with pattern-based invalidation
- **Performance Metrics**: Real-time query execution monitoring
- **Rate Limiting**: Specialized limits for different log operations

### 🏥 **Health Monitoring**
- **Multi-Component Health Checks**: Database, Redis, LDAP, Azure AD connectivity
- **Web-Based Health Dashboard**: Real-time system status with auto-refresh
- **Operational Metrics**: CPU, memory, disk usage monitoring
- **Service Response Times**: Connection status and performance tracking

### 🔐 **Security Features**
- **Credential Encryption**: AES encryption with per-user salts
- **OAuth 2.0 + PKCE**: Secure Azure AD authentication flow
- **CSRF Protection**: Cross-site request forgery prevention
- **JWT Token Management**: Secure session handling
- **Audit Logging**: Complete activity trail for compliance

### 📊 **Database Schema**
- **User Management**: Authentication and role-based permissions
- **Report Templates**: Pre-built and custom report definitions (JSONB storage)
- **Execution History**: Complete audit trail with results caching
- **Field Metadata**: Dynamic field discovery and caching
- **Service Credentials**: Encrypted multi-service authentication storage

### 🎯 **Known Beta Limitations**

#### **Development Areas**
- **ESLint Warnings**: 85 backend warnings, 361 frontend warnings (being addressed)
- **Test Coverage**: Expanding integration test coverage for edge cases
- **Documentation**: API documentation generation in progress
- **Performance**: Large dataset optimization for 10K+ records

#### **Feature Roadmap**
- **Single Sign-On (SSO)**: SAML 2.0 integration planned
- **Multi-Tenant Support**: Organization isolation capabilities
- **Advanced Dashboards**: Interactive charts and widgets
- **Mobile Responsiveness**: Tablet and mobile optimization
- **API Rate Limiting**: Per-user quota management

### 🚀 **Getting Started**

#### **System Requirements**
- **Operating System**: Windows with WSL2 or Linux
- **Docker**: Docker Desktop or Docker Engine 20.0+
- **Memory**: 4GB RAM minimum, 8GB recommended
- **Storage**: 2GB available disk space
- **Network**: Internal network access to AD/Azure AD

#### **Quick Start**
```bash
# Clone the repository
git clone https://github.com/ilyafedotov-ops/SimpleAdminReporter.git
cd SimpleAdminReporter

# Configure environment
cp .env.example .env
# Edit .env with your AD/Azure AD credentials

# Start all services
docker-compose up -d

# Access the application
# WSL: http://$(hostname -I | awk '{print $1}')
# Local: http://localhost
```

#### **Configuration Requirements**
- **Active Directory**: Service account with read permissions
- **Azure AD**: App registration with Graph API permissions
- **Database**: PostgreSQL connection (provided via Docker)
- **Cache**: Redis instance (provided via Docker)

### 🤝 **Contributing**
- **Development Workflow**: Feature branches with comprehensive testing
- **Code Standards**: TypeScript strict mode, ESLint compliance
- **Testing Requirements**: Unit + integration tests for all features
- **Documentation**: Inline comments and README updates required

### 📞 **Support & Documentation**
- **Repository**: https://github.com/ilyafedotov-ops/SimpleAdminReporter
- **Issue Tracker**: GitHub Issues for bug reports and feature requests
- **Documentation**: Comprehensive CLAUDE.md with setup and usage guides
- **Architecture**: Detailed technical documentation in codebase

---

### 🙏 **Acknowledgments**
Developed by Ilya Fedotov with AI assistance, leveraging modern containerization and enterprise authentication patterns for secure, scalable Active Directory and Azure AD reporting.

### 📄 **License**
MIT License - See LICENSE file for details

---

**Note**: This is a beta release intended for testing and feedback. Please report any issues via the GitHub issue tracker.