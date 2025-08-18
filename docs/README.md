# Simple Admin Reporter

A containerized AD/Azure AD/O365 reporting application designed for Docker/WSL deployment with GitLab CI/CD integration.

## Quick Start

### Prerequisites
- Docker and Docker Compose
- Git
- GitLab server access
- Node.js 18+ (for local development, containers use Node.js 22)
- npm 10+ (for local development)

### Initial Setup

1. **Clone the repository:**
   ```bash
   git clone http://192.168.88.33/root/SimpleAdminReporter.git
   cd SimpleAdminReporter
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your specific configuration
   ```

3. **Build and start services:**
   ```bash
   docker-compose build
   docker-compose up -d
   ```

## GitLab CI/CD Setup

### Required GitLab Variables
Configure these in GitLab Project Settings > CI/CD > Variables:

- `CI_REGISTRY_PASSWORD` - GitLab registry password
- `DATABASE_URL` - Production database connection string
- `REDIS_URL` - Production Redis connection string
- `JWT_SECRET` - JWT signing secret
- `AD_SERVER` - Active Directory server
- `AD_USERNAME` - AD service account
- `AD_PASSWORD` - AD service account password (Masked)
- `AZURE_TENANT_ID` - Azure AD tenant ID
- `AZURE_CLIENT_ID` - Azure AD application ID
- `AZURE_CLIENT_SECRET` - Azure AD application secret (Masked)

### Deployment
- **Staging**: Automatic deployment on push to `develop` branch
- **Production**: Manual deployment trigger on `main` branch

## Architecture

This enterprise-grade reporting application provides:
- **Pre-built Reports**: 45+ modular LDAP query definitions across AD, Azure AD, and O365
- **Custom Report Builder**: Visual query builder with drag-and-drop interface
- **Unified Authentication**: Multi-source auth with OAuth 2.0, JWT tokens, and progressive lockout
- **Enhanced Security**: Token family rotation, CSRF protection, and encrypted credential storage
- **Advanced Query System**: SQL query builder with injection protection and full-text search
- **Performance Optimization**: Redis caching, materialized views, and real-time metrics
- **Background Processing**: Bull Queue for report generation and scheduling
- **Export Capabilities**: Excel and CSV formats with rate limiting

## Documentation

- See `CLAUDE.md` for development guidelines and LEVER framework
- See `ARCHITECTURE.md` for detailed system architecture
- See `PROJECT_STATUS.md` for implementation status and features
- CI/CD pipeline configuration in `.gitlab-ci.yml` and `.gitlab/` directory

## Development

### Local Development

**Note**: Requires Node.js 18+ and npm 10+ for Vite 6 compatibility.

```bash
# Frontend development
cd frontend && npm install && npm run dev

# Backend development  
cd backend && npm install && npm run dev

# Database only for local dev
docker-compose up postgres redis
```

### Testing
```bash
# Run tests
docker-compose exec backend npm test
docker-compose exec frontend npm test

# Code quality
npm run lint
npm run typecheck
```

### Deployment
```bash
# Deploy to staging
./scripts/deploy.sh staging

# Deploy to production
./scripts/deploy.sh production
```

## Support

For issues and feature requests, please use the GitLab issue tracker.