# AD Reporting Backend

Enterprise reporting application backend for Active Directory, Azure AD, and Office 365.

## Features

- **Multi-Source Reporting**: Generate reports from AD, Azure AD, and O365
- **Custom Report Builder**: Create custom queries with visual builder
- **Real-Time Logs**: Stream logs with Server-Sent Events
- **Advanced Search**: Full-text and fuzzy search capabilities
- **Performance Monitoring**: Track query performance and optimize
- **Enterprise Security**: LDAP/MSAL auth, rate limiting, audit trails

## Recent Improvements (2025)

### Enhanced Logs API
- **PostgreSQL Full-Text Search**: Advanced search with ranking and highlighting
- **Fuzzy Search**: Handle typos with trigram similarity
- **Query Builder**: Type-safe SQL builder with injection protection
- **Redis Caching**: Automatic caching with smart invalidation
- **Performance Metrics**: Real-time query performance monitoring
- **Rate Limiting**: Protect against API abuse

See [Logs API Improvements](docs/logs-api-improvements-summary.md) for details.

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Redis 6+
- Docker & Docker Compose

### Installation

```bash
# Clone repository
git clone <repository-url>
cd SimpleAdminReporter/backend

# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env with your configuration

# Run migrations
npm run migrate

# Start development server
npm run dev
```

### Docker Setup

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f backend

# Run migrations
docker-compose exec backend npm run migrate
```

## API Documentation

### Authentication
```bash
POST /api/auth/login
POST /api/auth/refresh
POST /api/auth/logout
```

### Reports
```bash
GET /api/reports/templates
POST /api/reports/execute/:templateId
GET /api/reports/history
```

### Logs (Enhanced)
```bash
GET /api/logs
GET /api/logs/search/fulltext
GET /api/logs/search/fuzzy
GET /api/logs/metrics/queries
GET /api/logs/stream/realtime
```

See [API Reference](docs/api/logs-api-reference.md) for complete documentation.

## Architecture

### Technology Stack
- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL with raw SQL
- **Cache**: Redis with ioredis
- **Queue**: Bull Queue for background jobs
- **Auth**: JWT with LDAP/MSAL providers
- **Logging**: Winston with database transport

### Key Services
- **QueryBuilder**: Type-safe SQL query construction
- **LogsService**: Core logging functionality
- **CacheService**: Redis caching layer
- **MetricsService**: Performance monitoring
- **AuditLogger**: Security audit trails

### Database Schema
- `users`: User authentication and profiles
- `audit_logs`: Security audit trail
- `system_logs`: Application logs
- `report_templates`: Pre-built reports
- `report_history`: Execution history
- `service_credentials`: Encrypted credentials

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific suite
npm test -- QueryBuilder.test.ts

# Run in watch mode
npm run test:watch
```

### Test Coverage
- QueryBuilder: 51 tests
- LogsService: 24 tests
- Full-text Search: 20 tests
- Cache Service: 20 tests
- Query Metrics: 15 tests

## Development

### Code Style
```bash
# Run linter
npm run lint

# Fix lint issues
npm run lint:fix

# Type checking
npm run typecheck
```

### Database Migrations
```bash
# Run pending migrations
npm run migrate

# Create new migration
npm run migrate:create -- add-new-feature

# Rollback last migration
npm run migrate:rollback
```

### Debugging
```bash
# Start with debugger
npm run dev:debug

# Attach debugger to port 9229
```

## Configuration

### Environment Variables
```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/reporting

# Redis
REDIS_URL=redis://localhost:6379

# Authentication
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=1h

# Active Directory
AD_SERVER=dc.domain.local
AD_BASE_DN=DC=domain,DC=local
AD_USERNAME=service-account
AD_PASSWORD=password

# Azure AD (Optional)
AZURE_TENANT_ID=tenant-id
AZURE_CLIENT_ID=client-id
AZURE_CLIENT_SECRET=secret
```

### Logging Configuration
Configure in `src/config/logging.config.ts`:
- Log levels: error, warn, info, debug
- Transports: Console, File, Database
- Retention: 30 days default

## Performance

### Optimization Tips
1. Use date filters in queries
2. Enable Redis caching
3. Create appropriate indexes
4. Monitor slow queries
5. Use pagination

### Monitoring
- Health check: `/api/health`
- Metrics: `/api/logs/metrics/queries`
- Cache stats: Redis INFO command

## Security

### Best Practices
- All inputs are sanitized
- SQL injection prevention via QueryBuilder
- Rate limiting on all endpoints
- Audit logging for sensitive operations
- Encrypted credential storage

### Rate Limits
- General API: 100 req/min
- Authentication: 5 req/15 min
- Logs queries: 30 req/min
- Export: 5 req/10 min

## Deployment

### Production Build
```bash
# Build TypeScript
npm run build

# Start production server
npm start
```

### Docker Deployment
```bash
# Build image
docker build -t ad-reporting-backend .

# Run container
docker run -d \
  --name backend \
  -p 5000:5000 \
  --env-file .env \
  ad-reporting-backend
```

### Health Checks
- Liveness: `/api/health/live`
- Readiness: `/api/health/ready`
- Dependencies: `/api/health/detailed`

## Troubleshooting

### Common Issues

#### Database Connection
```bash
# Test connection
npm run db:test

# Check migrations
npm run migrate:status
```

#### Redis Connection
```bash
# Test Redis
docker-compose exec redis redis-cli ping
```

#### LDAP Issues
```bash
# Test LDAP connection
npm run ldap:test
```

### Debug Logging
```typescript
// Enable debug logs
process.env.LOG_LEVEL = 'debug';

// Filter by module
logger.debug('Message', { module: 'QueryBuilder' });
```

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

### Coding Standards
- Follow TypeScript best practices
- Write tests for new features
- Update documentation
- Run linter before commit

## License

Proprietary - All rights reserved

## Support

For issues and questions:
- Check [documentation](docs/)
- Review [logs API guide](docs/logs-api-improvements-readme.md)
- Open GitHub issue