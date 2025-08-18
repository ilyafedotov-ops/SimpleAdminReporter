# SimpleAdminReporter Deployment Guide

## Overview

This guide provides step-by-step instructions for deploying SimpleAdminReporter based on the current Docker implementation as of August 2025. The application uses a multi-container architecture with secure networking and production-ready configurations.

## Prerequisites

### System Requirements
- **Operating System**: Linux (Ubuntu 20.04+) or WSL2 on Windows 10/11
- **Docker**: Version 24.0+ with Docker Compose 2.20+
- **Hardware**: 
  - Development: 4 CPU cores, 8GB RAM, 20GB storage
  - Production: 8 CPU cores, 16GB RAM, 100GB SSD storage
- **Network**: Access to Active Directory domain controllers, Azure AD endpoints

### Software Requirements
- Git 2.30+
- OpenSSL (for certificate generation)
- curl and jq (for health checks)
- PostgreSQL client tools (optional, for database management)
- Redis client tools (optional, for cache management)

## Quick Start Deployment

### 1. Clone Repository and Setup Environment
```bash
# Clone the repository
git clone https://your-gitlab-server/path/to/SimpleAdminReporter.git
cd SimpleAdminReporter

# Create environment file from template
cp .env.example .env
```

### 2. Configure Environment Variables
Edit `.env` file with your environment-specific values:

```bash
# === REQUIRED CONFIGURATION ===

# Application Security
JWT_SECRET=generate-with-openssl-rand-base64-32
SESSION_SECRET=another-long-random-string-for-sessions
ENCRYPTION_KEY=CHANGE-ME-generate-base64-key-with-openssl-rand-base64-32

# Database Configuration
POSTGRES_PASSWORD=your-secure-postgres-password
DATABASE_URL=postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/reporting

# Redis Configuration  
REDIS_PASSWORD=your-secure-redis-password
REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379

# Active Directory Integration
AD_SERVER=your-dc.domain.local
AD_DOMAIN=domain.local
AD_BASE_DN=DC=domain,DC=local
AD_USERNAME=CN=svc_reporting,OU=ServiceAccounts,DC=domain,DC=local
AD_PASSWORD=your-service-account-password

# Azure AD Configuration (if using Azure integration)
AZURE_TENANT_ID=your-azure-tenant-id
AZURE_CLIENT_ID=your-azure-app-id
AZURE_CLIENT_SECRET=your-azure-app-secret

# === OPTIONAL CONFIGURATION ===

# Application Settings
NODE_ENV=production
USE_COOKIE_AUTH=true
USE_UNIFIED_AUTH=true
LOG_LEVEL=warn

# Performance Tuning
REPORT_TIMEOUT=300000
REPORT_MAX_ROWS=50000
REPORT_DEFAULT_LIMIT=1000
USE_MATERIALIZED_VIEWS=true
```

### 3. SSL Certificate Setup (Required)
Generate SSL certificates for secure HTTPS access:

```bash
# Create SSL directory
mkdir -p ssl

# Generate self-signed certificate for development/internal use
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout ssl/app.key \
  -out ssl/app.crt \
  -config ssl/openssl.conf \
  -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"

# For production, obtain certificates from your CA and place them as:
# ssl/app.crt (certificate)
# ssl/app.key (private key)
```

### 4. Network Configuration

#### For WSL2 Users
```bash
# Get WSL2 IP address
WSL_IP=$(hostname -I | awk '{print $1}')
echo "WSL2 IP: $WSL_IP"

# Add to Windows hosts file (run as Administrator in Windows):
echo "$WSL_IP reporting.local" >> /mnt/c/Windows/System32/drivers/etc/hosts

# Access application at: https://reporting.local
```

#### Firewall Configuration
```bash
# Allow Docker networks
sudo ufw allow from 172.20.0.0/24  # Frontend network
sudo ufw allow from 172.21.0.0/24  # Backend network

# Allow HTTP/HTTPS ports
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

## Deployment Options

### Standard Development/Production Deployment

```bash
# 1. Build all container images
docker-compose build

# 2. Start all services in detached mode
docker-compose up -d

# 3. Wait for services to start (30-60 seconds)
echo "Waiting for services to start..."
sleep 60

# 4. Initialize database with schema and seed data
docker-compose exec backend npm run migrate

# 5. Verify deployment
docker-compose ps
./scripts/health-check.sh
```

### High-Security Production Deployment

For production environments with enhanced security:

```bash
# 1. Create Docker secrets directory
mkdir -p secrets

# 2. Create secret files (replace with your actual secrets)
echo "your-database-url" > secrets/database_url.txt
echo "your-jwt-secret" > secrets/jwt_secret.txt
echo "your-session-secret" > secrets/session_secret.txt
echo "your-postgres-password" > secrets/postgres_password.txt
echo "your-redis-password" > secrets/redis_password.txt
echo "your-ad-password" > secrets/ad_password.txt
echo "your-azure-client-secret" > secrets/azure_client_secret.txt
echo "your-encryption-key" > secrets/encryption_key.txt

# 3. Secure the secrets directory
chmod 600 secrets/*
chown root:root secrets/*

# 4. Deploy with production configuration
docker-compose -f docker-compose.prod.yml up -d

# 5. Verify secure deployment
docker-compose -f docker-compose.prod.yml ps
```

### Network Architecture Overview
The application uses a secure multi-tier network architecture:

- **Frontend Tier (172.20.0.0/24)**: Nginx proxy, Frontend container
- **Backend Tier (172.21.0.0/24)**: Backend API, PostgreSQL, Redis
- **Security**: Backend tier has no external internet access
- **Access**: Only HTTPS traffic allowed through Nginx proxy

### Container Health Monitoring

All containers include built-in health checks:

```bash
# Check container health status
docker-compose ps

# View health check details
docker inspect --format='{{json .State.Health}}' reporting-backend | jq

# Monitor health checks in real-time
watch -n 5 "docker-compose ps"
```

## Post-Deployment Setup

### 1. Access the Application

```bash
# Check if application is responding
curl -k https://localhost/nginx-health
# Should return: healthy

# For WSL2 users, access via:
https://reporting.local  # (after adding to Windows hosts file)
# or
https://<wsl-ip>  # (get IP with: hostname -I | awk '{print $1}')
```

### 2. Initial Authentication Setup

The application supports multiple authentication methods:

#### Option A: Active Directory Authentication
- Navigate to the login page
- Use your AD credentials (domain\username or username@domain.local)
- First successful AD login creates user account automatically

#### Option B: Reset Admin Password (if needed)
```bash
# Reset the admin password for emergency access
docker-compose exec backend node reset-admin-password.js
# Follow the prompts to set new admin credentials
```

### 3. Configure Service Credentials

After logging in:

1. Navigate to **Settings > Credentials**
2. Add service account credentials for data sources:

**Active Directory Credentials:**
- Service Type: AD
- Username: `CN=svc_reporting,OU=ServiceAccounts,DC=domain,DC=local`
- Password: `[your-service-account-password]`
- Server: `your-dc.domain.local`

**Azure AD Credentials (if using):**
- Service Type: Azure AD
- Tenant ID: `[your-tenant-id]`
- Client ID: `[your-application-id]`
- Client Secret: `[your-application-secret]`

### 4. Verify System Health

```bash
# Run comprehensive health check
./scripts/health-check.sh

# Test database connectivity
docker-compose exec postgres psql -U postgres -d reporting -c "SELECT version();"

# Test Redis connectivity
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" ping
# Should return: PONG

# Check application logs
docker-compose logs backend | tail -20
```

### 5. Load Pre-built Reports

The application comes with 15+ pre-built reports that are automatically loaded during database initialization. Verify they're available:

1. Navigate to **Reports > Pre-built Reports**
2. You should see categories for:
   - Active Directory (Users, Computers, Groups)
   - Azure AD (Users, Security, Compliance)
   - Office 365 (Exchange, SharePoint, Teams)

### 6. Test Report Execution

1. Navigate to **Reports > Pre-built Reports**
2. Select "Inactive Users (AD)" or similar report
3. Click **Execute Report**
4. Verify the report runs successfully and returns data

## System Monitoring & Maintenance

### Health Monitoring

#### Automated Health Monitoring
```bash
# Setup comprehensive health check cron job
crontab -e
# Add this line for checks every 5 minutes:
*/5 * * * * /path/to/SimpleAdminReporter/scripts/health-check.sh || /usr/bin/docker-compose -f /path/to/SimpleAdminReporter/docker-compose.yml restart
```

#### Manual Health Checks
```bash
# Run comprehensive health check script
./scripts/health-check.sh

# Quick health check (requires authentication)
curl -k https://localhost/api/health

# Detailed component health (requires authentication)
curl -k -H "Authorization: Bearer <your-jwt-token>" https://localhost/api/health/detailed

# Check specific components
curl -k -H "Authorization: Bearer <token>" https://localhost/api/health/component/database
curl -k -H "Authorization: Bearer <token>" https://localhost/api/health/component/redis
curl -k -H "Authorization: Bearer <token>" https://localhost/api/health/component/ldap
```

#### Container Resource Monitoring
```bash
# Monitor container resource usage
docker stats --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}"

# Check container health status
docker-compose ps

# Monitor container logs in real-time
docker-compose logs -f --tail=50
```

### Log Management

#### View Application Logs
```bash
# View all service logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f backend      # API server logs
docker-compose logs -f frontend     # Frontend container logs
docker-compose logs -f nginx        # Web server access/error logs
docker-compose logs -f postgres     # Database logs
docker-compose logs -f redis        # Cache server logs

# View recent logs (last 100 lines)
docker-compose logs --tail=100 backend

# Follow logs with timestamps
docker-compose logs -f -t backend
```

#### Log Rotation Configuration
Log rotation is pre-configured in docker-compose.yml:
```yaml
logging:
  driver: "json-file"
  options:
    max-size: "10m"    # Max 10MB per log file
    max-file: "3"      # Keep 3 rotated files
```

#### Application-Level Logging
```bash
# Check backend application logs
docker-compose exec backend ls -la logs/
docker-compose exec backend tail -f logs/combined.log

# Audit and system logs (if configured)
docker-compose exec backend tail -f logs/audit.log
docker-compose exec backend tail -f logs/error.log
```

### Backup & Recovery Procedures

#### Automated Database Backup
```bash
# Use the provided backup script
./scripts/backup.sh

# Setup automated backups
crontab -e
# Add: 0 2 * * * /path/to/SimpleAdminReporter/scripts/backup.sh
```

#### Manual Database Backup
```bash
# Create timestamped backup
BACKUP_FILE="backup_$(date +%Y%m%d_%H%M%S).sql.gz"
docker-compose exec -T postgres pg_dump -U postgres -h localhost reporting | gzip > "$BACKUP_FILE"
echo "Backup created: $BACKUP_FILE"

# Verify backup integrity
gunzip -t "$BACKUP_FILE" && echo "Backup file is valid"
```

#### Database Restore Procedure
```bash
# 1. Stop backend services to prevent writes
docker-compose stop backend nginx

# 2. Create restore point backup
docker-compose exec -T postgres pg_dump -U postgres reporting | gzip > "restore_point_$(date +%Y%m%d_%H%M%S).sql.gz"

# 3. Restore from backup
gunzip -c backup_file.sql.gz | docker-compose exec -T postgres psql -U postgres -d reporting

# 4. Restart services
docker-compose start backend nginx

# 5. Verify restoration
docker-compose exec backend npm run migrate  # Ensure schema is current
./scripts/health-check.sh
```

#### Configuration Backup
```bash
# Backup configuration and secrets (run regularly)
tar -czf "config_backup_$(date +%Y%m%d).tar.gz" \
  .env \
  docker-compose.yml \
  docker-compose.prod.yml \
  nginx/ \
  ssl/ \
  secrets/

# Store configuration backups securely off-site
```

#### Volume Backup
```bash
# Backup Docker volumes (includes uploaded files, logs)
docker run --rm -v reporting_postgres-data:/data -v $(pwd):/backup alpine tar czf /backup/postgres_volume_$(date +%Y%m%d).tar.gz /data
docker run --rm -v reporting_redis-data:/data -v $(pwd):/backup alpine tar czf /backup/redis_volume_$(date +%Y%m%d).tar.gz /data
```

### Performance Tuning

#### Application-Level Tuning
```bash
# Increase report timeouts for large datasets
# Edit .env file:
REPORT_TIMEOUT=600000        # 10 minutes for complex reports
REPORT_MAX_ROWS=100000       # Maximum rows per report
REPORT_DEFAULT_LIMIT=1000    # Default page size

# Enable materialized views for better performance
USE_MATERIALIZED_VIEWS=true

# Restart to apply changes
docker-compose restart backend
```

#### Database Performance Tuning
```bash
# Monitor slow queries
docker-compose exec postgres psql -U postgres -d reporting -c \
  "SELECT query, calls, total_time, mean_time FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;"

# Check database statistics
docker-compose exec postgres psql -U postgres -d reporting -c \
  "SELECT schemaname, tablename, n_tup_ins, n_tup_upd, n_tup_del FROM pg_stat_user_tables;"

# Analyze and reindex if needed
docker-compose exec postgres psql -U postgres -d reporting -c "ANALYZE;"
```

#### Redis Cache Optimization
```bash
# Monitor cache hit rates
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" info stats | grep cache_hits

# Check memory usage
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" info memory

# Clear cache if needed
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" flushall
```

#### Network Performance
```bash
# Test internal network latency
docker-compose exec backend ping -c 5 postgres
docker-compose exec backend ping -c 5 redis

# Monitor nginx performance
docker-compose exec nginx tail -f /var/log/nginx/access.log | grep -E '[0-9]{3}\.[0-9]{3}'
```

## Troubleshooting Guide

### Quick Diagnostic Commands

```bash
# Run comprehensive system check
./scripts/health-check.sh

# Check all container statuses
docker-compose ps

# View environment configuration
docker-compose config

# Check disk space
df -h

# Monitor system resources
docker stats --no-stream
```

### Common Issues and Solutions

#### 1. Application Won't Start / Container Failures

```bash
# Check specific container logs
docker-compose logs backend
docker-compose logs postgres
docker-compose logs redis

# Common issues:
# - Missing environment variables
docker-compose exec backend printenv | grep -E '(JWT_SECRET|DATABASE_URL|REDIS_URL)'

# - Port conflicts
sudo netstat -tlnp | grep -E ':(80|443|5432|6379)'

# - Insufficient disk space
df -h /var/lib/docker

# - SSL certificate issues
ls -la ssl/
openssl x509 -in ssl/app.crt -text -noout | grep -A1 'Subject:'
```

#### 2. Database Connection Issues

```bash
# Test database connectivity
docker-compose exec postgres pg_isready -U postgres

# Direct database connection test
docker-compose exec postgres psql -U postgres -d reporting -c "SELECT version();"

# Check database logs for errors
docker-compose logs postgres | grep -i error

# Verify database initialization
docker-compose exec postgres psql -U postgres -d reporting -c "\dt"

# If database is corrupted, restore from backup
# (see Backup & Recovery section)
```

#### 3. Authentication and Login Issues

```bash
# Check authentication configuration
docker-compose exec backend printenv | grep -E '(USE_COOKIE_AUTH|USE_UNIFIED_AUTH|JWT_SECRET)'

# Clear authentication cache
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" flushall

# Test Active Directory connectivity
docker-compose exec backend node -e "console.log(require('ldapjs').createClient({url: 'ldap://$AD_SERVER'}))"

# Check failed login attempts
docker-compose logs backend | grep -i "login\|auth\|failed"

# Reset admin password if needed
docker-compose exec backend node reset-admin-password.js
```

#### 4. HTTPS/SSL Certificate Issues

```bash
# Verify SSL certificate is valid
openssl x509 -in ssl/app.crt -noout -dates

# Test SSL connection
curl -I -k https://localhost

# Regenerate self-signed certificate
rm ssl/app.{crt,key}
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout ssl/app.key -out ssl/app.crt \
  -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"

# Restart nginx to pick up new certificates
docker-compose restart nginx
```

#### 5. Report Execution Failures

```bash
# Check report execution logs
docker-compose logs backend | grep -i "report\|execute\|ldap\|azure"

# Test service account credentials
docker-compose exec backend node -e "const ldap = require('ldapjs'); const client = ldap.createClient({url: 'ldap://$AD_SERVER'}); client.bind('$AD_USERNAME', '$AD_PASSWORD', (err) => console.log(err || 'Success'));"

# Verify report templates are loaded
docker-compose exec postgres psql -U postgres -d reporting -c "SELECT id, name, category FROM report_templates LIMIT 10;"

# Check service credentials in database
docker-compose exec postgres psql -U postgres -d reporting -c "SELECT id, service_type, username FROM service_credentials;"
```

#### 6. Performance and Timeout Issues

```bash
# Monitor resource usage
docker stats

# Check long-running queries
docker-compose exec postgres psql -U postgres -d reporting -c \
  "SELECT pid, now() - pg_stat_activity.query_start AS duration, query FROM pg_stat_activity WHERE (now() - pg_stat_activity.query_start) > interval '5 minutes';"

# Increase timeout settings
# Edit .env:
REPORT_TIMEOUT=600000  # 10 minutes

# Clear Redis cache
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" flushall

# Restart services to apply changes
docker-compose restart backend
```

#### 7. Network Connectivity Issues (WSL2)

```bash
# Check WSL2 IP address
hostname -I

# Test connectivity from Windows
# Open PowerShell as Administrator:
Test-NetConnection -ComputerName <WSL-IP> -Port 80
Test-NetConnection -ComputerName <WSL-IP> -Port 443

# Check Windows firewall rules
# In PowerShell as Administrator:
Get-NetFirewallRule | Where-Object {$_.DisplayName -match "WSL"}

# Add firewall rule if needed:
New-NetFirewallRule -DisplayName "WSL2" -Direction Inbound -LocalPort 80,443 -Protocol TCP -Action Allow
```

### Debug Mode and Detailed Logging

```bash
# Enable verbose logging in .env file
LOG_LEVEL=debug
ENABLE_DB_LOGS=true
DB_LOG_LEVEL=debug
LOG_DB_QUERIES=true

# Restart backend to apply logging changes
docker-compose restart backend

# Monitor debug logs
docker-compose logs -f backend | grep -E '(DEBUG|ERROR|WARN)'

# Enable specific component debugging
DEBUG=app:auth,app:ldap,app:database

# Monitor specific log files
docker-compose exec backend tail -f logs/combined.log
docker-compose exec backend tail -f logs/error.log
```

### Emergency Recovery Procedures

```bash
# Complete system reset (nuclear option)
echo "WARNING: This will destroy all data and containers!"
read -p "Type 'yes' to continue: " confirm
if [ "$confirm" = "yes" ]; then
  docker-compose down -v
  docker system prune -a -f
  docker volume prune -f
  # Rebuild and start
  docker-compose build --no-cache
  docker-compose up -d
  # Restore from backup
  gunzip -c latest_backup.sql.gz | docker-compose exec -T postgres psql -U postgres -d reporting
fi
```

## Security Best Practices

### Network Security (Already Implemented)
The application uses a secure multi-tier network architecture:

```yaml
# Current network configuration
networks:
  frontend-tier:    # External access (172.20.0.0/24)
    - nginx (port 80/443 exposed)
    - frontend
    - backend (API access)
  
  backend-tier:     # Internal only (172.21.0.0/24)
    internal: true  # No internet access
    - backend
    - postgres
    - redis
```

### Secret Management

```bash
# For production, use Docker secrets (requires Swarm mode)
# Initialize swarm mode
docker swarm init

# Create secrets
echo "your-jwt-secret" | docker secret create jwt_secret -
echo "your-database-password" | docker secret create postgres_password -
echo "your-redis-password" | docker secret create redis_password -

# Deploy with secrets
docker stack deploy -c docker-compose.prod.yml simpleadminreporter
```

### SSL/TLS Security

```bash
# Generate strong SSL certificates for production
# Use a proper CA certificate instead of self-signed

# Example with Let's Encrypt (adjust for your domain)
certbot --nginx -d your-domain.com

# Or generate strong self-signed certificates
openssl req -x509 -nodes -days 365 -newkey rsa:4096 \
  -keyout ssl/app.key \
  -out ssl/app.crt \
  -subj "/C=US/ST=State/L=City/O=YourOrg/CN=your-domain.com"

# Set appropriate permissions
chmod 600 ssl/app.key
chmod 644 ssl/app.crt
```

### System Updates and Maintenance

```bash
# Regular update procedure
#!/bin/bash
# Create update script: ./scripts/update-system.sh

echo "Starting system update..."

# 1. Backup before updates
./scripts/backup.sh

# 2. Pull latest base images
docker-compose pull

# 3. Rebuild with latest dependencies
docker-compose build --no-cache

# 4. Update in rolling fashion (minimal downtime)
docker-compose up -d postgres redis  # Backend services first
sleep 30
docker-compose up -d backend         # Application layer
sleep 30
docker-compose up -d frontend nginx  # Frontend layer

# 5. Verify health
./scripts/health-check.sh

echo "System update completed!"
```

### Access Control and Auditing

```bash
# Monitor access logs
docker-compose logs nginx | grep -E '(POST|PUT|DELETE)' | tail -20

# Check authentication logs
docker-compose logs backend | grep -i auth | tail -20

# Monitor failed login attempts
docker-compose logs backend | grep -i "failed\|invalid" | tail -20

# Export audit logs
docker-compose exec postgres psql -U postgres -d reporting -c \
  "SELECT * FROM audit_logs WHERE event_date >= NOW() - INTERVAL '24 hours' ORDER BY event_date DESC;"
```

## Production Scaling and High Availability

### Resource Scaling

#### Vertical Scaling (Increase Container Resources)
```yaml
# Create docker-compose.override.yml for resource limits
version: '3.8'
services:
  backend:
    cpus: '2.0'
    mem_limit: 4g
    mem_reservation: 2g
    
  postgres:
    cpus: '2.0'
    mem_limit: 8g
    mem_reservation: 4g
    
  redis:
    cpus: '1.0'
    mem_limit: 2g
    mem_reservation: 1g
```

#### Database Connection Optimization
```bash
# Monitor database connections
docker-compose exec postgres psql -U postgres -d reporting -c \
  "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"

# Adjust PostgreSQL settings for higher concurrency
# Edit docker-compose.yml postgres environment:
POSTGRES_INITDB_ARGS: '--auth-host=md5 --auth-local=trust'
command: >
  postgres
  -c max_connections=200
  -c shared_buffers=256MB
  -c effective_cache_size=1GB
  -c maintenance_work_mem=64MB
  -c checkpoint_completion_target=0.9
  -c wal_buffers=16MB
  -c default_statistics_target=100
```

### Load Distribution

#### Report Queue Management
```bash
# Monitor report queue status
docker-compose exec backend node -e "const Queue = require('bull'); const q = new Queue('reports', 'redis://redis:6379'); q.getJobs(['waiting', 'active', 'completed', 'failed']).then(jobs => console.log('Queue status:', jobs.length));"

# Configure queue concurrency in .env
QUEUE_CONCURRENCY=5  # Number of concurrent report executions
QUEUE_MAX_ATTEMPTS=3 # Retry failed reports
```

### High Availability Setup

#### Database Backup and Failover
```bash
# Setup automated backups with rotation
cat > /etc/cron.d/reporting-backup << 'EOF'
# Daily database backup at 2 AM
0 2 * * * root /path/to/SimpleAdminReporter/scripts/backup.sh
# Weekly full system backup
0 3 * * 0 root /path/to/SimpleAdminReporter/scripts/full-backup.sh
EOF

# Test backup restoration regularly
# Schedule monthly restore tests
```

#### Container Health and Recovery
```bash
# Automatic container restart on failure
# Already configured in docker-compose.yml:
# restart: unless-stopped

# Monitor container health
watch -n 30 'docker-compose ps; echo "----"; docker stats --no-stream'
```

## Disaster Recovery

### Recovery Objectives
- **Recovery Time Objective (RTO)**: 2 hours
- **Recovery Point Objective (RPO)**: 4 hours (with automated backups)

### Disaster Recovery Plan

1. **Automated Backups**: 4-hour intervals with 30-day retention
2. **Configuration Management**: All configs in version control
3. **Documentation**: This deployment guide and runbooks
4. **Testing**: Monthly recovery drills

### Complete System Recovery Procedure

```bash
#!/bin/bash
# Emergency recovery script: scripts/emergency-recovery.sh

set -e

echo "Starting emergency recovery procedure..."

# 1. Prepare clean environment
docker-compose down -v 2>/dev/null || true
docker system prune -f

# 2. Restore configuration files
if [ ! -f .env ]; then
    echo "ERROR: .env file missing! Restore from backup."
    exit 1
fi

# 3. Start infrastructure services
echo "Starting infrastructure services..."
docker-compose up -d postgres redis
echo "Waiting for database to be ready..."
sleep 60

# 4. Restore database from latest backup
echo "Restoring database..."
LATEST_BACKUP=$(ls -t backup_*.sql.gz | head -1)
if [ -z "$LATEST_BACKUP" ]; then
    echo "ERROR: No database backup found!"
    exit 1
fi

echo "Restoring from: $LATEST_BACKUP"
gunzip -c "$LATEST_BACKUP" | docker-compose exec -T postgres psql -U postgres reporting

# 5. Start application services
echo "Starting application services..."
docker-compose up -d backend
sleep 30
docker-compose up -d frontend nginx

# 6. Verify recovery
echo "Verifying system health..."
sleep 60
if ./scripts/health-check.sh; then
    echo "✅ Emergency recovery completed successfully!"
    echo "🔗 Application available at: https://localhost"
else
    echo "❌ Recovery verification failed! Check logs."
    docker-compose logs --tail=50
    exit 1
fi
```

### Recovery Testing

```bash
# Monthly disaster recovery test
#!/bin/bash
# scripts/dr-test.sh

echo "Starting DR test ($(date))"

# 1. Create test backup
./scripts/backup.sh

# 2. Document current state
docker-compose ps > dr-test-before.txt
curl -k https://localhost/api/health > dr-test-health-before.json

# 3. Simulate disaster (controlled)
docker-compose stop backend frontend

# 4. Run recovery procedure
./scripts/emergency-recovery.sh

# 5. Validate recovery
if ./scripts/health-check.sh; then
    echo "✅ DR test passed"
else
    echo "❌ DR test failed"
    exit 1
fi

echo "DR test completed successfully ($(date))"
```

## Support and Maintenance Contacts

### Self-Service Troubleshooting
1. **Check System Health**: `./scripts/health-check.sh`
2. **Review Logs**: `docker-compose logs -f backend`
3. **Check Documentation**: `/docs` directory contains detailed guides
4. **Common Issues**: See Troubleshooting section above

### Escalation Path
1. **Level 1**: System Administrator / IT Support
2. **Level 2**: Database Administrator (for data issues)
3. **Level 3**: Application Development Team
4. **Critical Issues**: Submit GitLab issue with logs and error details

### Regular Maintenance Schedule

```bash
# Weekly maintenance tasks
#!/bin/bash
# Add to cron: 0 3 * * 1 /path/to/weekly-maintenance.sh

echo "Starting weekly maintenance ($(date))"

# 1. Health check
./scripts/health-check.sh || exit 1

# 2. Database maintenance
docker-compose exec postgres psql -U postgres -d reporting -c "VACUUM ANALYZE;"

# 3. Clear old logs
docker-compose exec backend find logs/ -name "*.log" -mtime +7 -delete

# 4. Redis memory optimization
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" MEMORY PURGE

# 5. Container cleanup
docker system prune -f

echo "Weekly maintenance completed ($(date))"
```

### Emergency Contacts
- **System Administrator**: [Your contact info]
- **Database Issues**: [DBA contact info]
- **Network Issues**: [Network admin contact info]
- **After Hours**: [On-call rotation or emergency number]

### Documentation Updates
This deployment guide is maintained in the project repository. Please update it when:
- Configuration changes are made
- New features are deployed
- Issues and solutions are discovered
- Environment requirements change

Last Updated: August 2025 - Version 2.1