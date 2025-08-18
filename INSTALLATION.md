# SimpleAdminReporter Installation Guide

## Overview

SimpleAdminReporter is a containerized AD/Azure AD/O365 reporting application designed for Docker deployment. This guide provides complete installation and configuration instructions for production and development environments.

## Table of Contents

1. [System Requirements](#system-requirements)
2. [Prerequisites](#prerequisites)
3. [Quick Start](#quick-start)
4. [Detailed Installation](#detailed-installation)
5. [Environment Configuration](#environment-configuration)
6. [Security Configuration](#security-configuration)
7. [Network Configuration](#network-configuration)
8. [First-Time Setup](#first-time-setup)
9. [Service Management](#service-management)
10. [Troubleshooting](#troubleshooting)
11. [Maintenance](#maintenance)
12. [Backup and Recovery](#backup-and-recovery)

## System Requirements

### Minimum Requirements
- **CPU**: 2 cores
- **RAM**: 4GB available memory
- **Storage**: 10GB available disk space
- **Network**: Access to Active Directory domain controller
- **OS**: Linux (Ubuntu 20.04+, CentOS 8+, RHEL 8+) or Windows with WSL2

### Recommended Requirements
- **CPU**: 4+ cores
- **RAM**: 8GB+ available memory
- **Storage**: 20GB+ available disk space (SSD preferred)
- **Network**: Gigabit network connection

### Supported Platforms
- Docker on Linux
- Docker Desktop on Windows with WSL2
- Docker Desktop on macOS
- Kubernetes (with provided manifests)

## Prerequisites

### Required Software

1. **Docker Engine 20.10+** or **Docker Desktop 4.0+**
   ```bash
   # Ubuntu/Debian
   curl -fsSL https://get.docker.com -o get-docker.sh
   sudo sh get-docker.sh
   
   # Add user to docker group
   sudo usermod -aG docker $USER
   ```

2. **Docker Compose v2.0+**
   ```bash
   # Install Docker Compose (if not included with Docker)
   sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
   sudo chmod +x /usr/local/bin/docker-compose
   ```

3. **Git** (for source code)
   ```bash
   sudo apt-get update && sudo apt-get install git
   ```

### Network Requirements

- **Outbound HTTPS (443)**: For Azure AD/O365 API access
- **LDAP (389)** or **LDAPS (636)**: To Active Directory domain controller
- **Inbound HTTP/HTTPS**: For web interface access
- **Internal Container Network**: Docker internal communication

### Active Directory Requirements

- Service account with read permissions
- Network connectivity to domain controller
- LDAP/LDAPS access enabled

### Azure AD Requirements (Optional)

- Azure AD application registration
- Microsoft Graph API permissions
- Client ID and secret

## Quick Start

### 1. Clone Repository
```bash
git clone https://github.com/yourusername/SimpleAdminReporter.git
cd SimpleAdminReporter
```

### 2. Configure Environment
```bash
# Copy environment template
cp .env.example .env

# Edit configuration (see Environment Configuration section)
nano .env
```

### 3. Start Services
```bash
# Make management script executable
chmod +x scripts/manage-services.sh

# Start all services
./scripts/manage-services.sh start
```

### 4. Access Application
- **Web Interface**: https://localhost
- **API Health**: https://localhost/api/health

## Detailed Installation

### Step 1: Download and Extract

```bash
# Method 1: Git Clone (Recommended)
git clone https://github.com/yourusername/SimpleAdminReporter.git
cd SimpleAdminReporter

# Method 2: Download ZIP
wget https://github.com/yourusername/SimpleAdminReporter/archive/main.zip
unzip main.zip
cd SimpleAdminReporter-main
```

### Step 2: Directory Structure Verification

Ensure the following directory structure exists:
```
SimpleAdminReporter/
├── backend/                 # Node.js API server
├── frontend/                # React application  
├── nginx/                   # Nginx configuration
├── database/                # Database schemas and migrations
├── scripts/                 # Management scripts
├── docker-compose.yml       # Container orchestration
├── .env.example            # Environment template
└── INSTALLATION.md         # This file
```

### Step 3: Environment Configuration

Create and configure the environment file:
```bash
cp .env.example .env
```

Edit `.env` with your specific configuration (see Environment Configuration section below).

### Step 4: SSL Certificates (Production)

For production environments, replace the self-signed certificates:
```bash
# Place your SSL certificates
mkdir -p nginx/ssl
cp your-certificate.crt nginx/ssl/
cp your-private-key.key nginx/ssl/

# Update nginx configuration to use your certificates
nano nginx/nginx.conf
```

### Step 5: Build and Start Services

```bash
# Build all services
./scripts/manage-services.sh build

# Start all services  
./scripts/manage-services.sh start

# Verify services are healthy
./scripts/manage-services.sh status
```

## Environment Configuration

### Core Configuration

Edit `.env` file with your environment-specific values:

```bash
# Active Directory Configuration
AD_SERVER=your-dc.domain.local
AD_DOMAIN=domain.local
AD_BASE_DN=DC=domain,DC=local
AD_USERNAME=service-account@domain.local
AD_PASSWORD=your-complex-password

# Database Configuration
DATABASE_URL=postgresql://postgres:secure-password@postgres:5432/reporting
POSTGRES_DB=reporting
POSTGRES_USER=postgres
POSTGRES_PASSWORD=secure-database-password

# Security Configuration (CHANGE THESE!)
JWT_SECRET=your-very-long-secret-key-minimum-64-characters-for-production-use
JWT_REFRESH_SECRET=another-very-long-secret-for-refresh-tokens-minimum-64-chars
SESSION_SECRET=session-secret-minimum-32-characters-long
CREDENTIAL_ENCRYPTION_KEY=base64-encoded-encryption-key-32-bytes
```

### Azure AD Configuration (Optional)

```bash
# Azure AD Application Registration
AZURE_TENANT_ID=your-azure-tenant-id
AZURE_CLIENT_ID=your-application-client-id  
AZURE_CLIENT_SECRET=your-application-client-secret
```

### Network Configuration

```bash
# CORS Origins (Update for your domain)
CORS_ORIGIN=http://localhost:3000,https://localhost,https://your-domain.com

# Allowed IP Ranges  
ALLOWED_IPS=192.168.0.0/16,10.0.0.0/8,172.16.0.0/12
```

### Security Configuration

```bash
# Rate Limiting
RATE_LIMIT_WINDOW=900000        # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100     # Max requests per window

# Logging
LOG_LEVEL=info                  # debug, info, warn, error
ENABLE_AUDIT_LOGGING=true
```

## Security Configuration

### 1. Generate Secure Secrets

```bash
# Generate JWT secrets (64+ characters recommended)
openssl rand -base64 64

# Generate encryption key
openssl rand -base64 32
```

### 2. Service Account Setup

Create a dedicated AD service account:
```powershell
# In Active Directory Users and Computers
New-ADUser -Name "SimpleAdminReporter-Service" `
          -UserPrincipalName "sar-service@domain.local" `
          -Path "OU=Service Accounts,DC=domain,DC=local" `
          -AccountPassword (ConvertTo-SecureString "YourComplexPassword123!" -AsPlainText -Force) `
          -Enabled $true `
          -PasswordNeverExpires $true
```

Grant minimal required permissions:
- Domain Users (read)
- No elevated privileges needed

### 3. Firewall Configuration

```bash
# Ubuntu/Debian UFW
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow from 192.168.0.0/16 to any port 80,443

# CentOS/RHEL Firewalld  
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

### 4. SSL/TLS Configuration

For production, use proper SSL certificates:
```bash
# Let's Encrypt (Recommended)
sudo apt-get install certbot
sudo certbot certonly --webroot -w /var/www/html -d your-domain.com

# Copy certificates to nginx directory
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem nginx/ssl/
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem nginx/ssl/
```

## Network Configuration

### Docker Networks

The application uses a custom Docker network:
```yaml
# Defined in docker-compose.yml
networks:
  reporting-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16
```

### Port Mapping

| Service | Internal Port | External Port | Purpose |
|---------|--------------|---------------|---------|
| Nginx | 80, 443 | 80, 443 | Web interface |
| Backend | 5000 | - | API server (internal) |
| Frontend | 80 | - | React app (internal) |
| PostgreSQL | 5432 | - | Database (internal) |
| Redis | 6379 | - | Cache/Queue (internal) |

### WSL2 Network Access (Windows)

For Windows WSL2 users:
```bash
# Get WSL IP address
hostname -I | awk '{print $1}'

# Access from Windows browser
https://[WSL-IP-ADDRESS]
```

## First-Time Setup

### 1. Verify Installation

```bash
# Check all services are running
./scripts/manage-services.sh status

# Check API health
curl -k https://localhost/api/health
```

Expected health response:
```json
{
  "status": "ok",
  "timestamp": "2025-08-14T12:00:00.000Z",
  "service": "ad-reporting-api", 
  "version": "1.0.0"
}
```

### 2. Database Initialization

Database is automatically initialized on first startup. To manually run migrations:
```bash
./scripts/manage-services.sh migrate
```

### 3. Create Admin User (Optional)

```bash
# Create admin user via API
curl -k -X POST https://localhost/api/auth/admin/create \
  -H "Content-Type: application/json" \
  -d '{"username": "admin@domain.local", "password": "AdminPassword123!"}'
```

### 4. Test AD Authentication

```bash
# Test login with your AD credentials  
curl -k -X POST https://localhost/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "your-user@domain.local", "password": "your-password"}'
```

### 5. Access Web Interface

1. Navigate to https://localhost
2. Login with your AD credentials
3. Verify report templates are loaded
4. Test running a simple report

## Service Management

### Management Script Usage

The `scripts/manage-services.sh` script provides comprehensive service management:

```bash
# Start services
./scripts/manage-services.sh start [service...] [--recreate]

# Stop services  
./scripts/manage-services.sh stop [service...]

# Restart services
./scripts/manage-services.sh restart [service...]

# View status
./scripts/manage-services.sh status

# View logs
./scripts/manage-services.sh logs [service] [-f]

# Build services
./scripts/manage-services.sh build [service...] [--no-cache]

# Health checks
./scripts/manage-services.sh health

# Database operations
./scripts/manage-services.sh migrate
./scripts/manage-services.sh backup
./scripts/manage-services.sh restore <backup-file>

# Cleanup
./scripts/manage-services.sh clean
```

### Individual Service Management

```bash
# Backend only
./scripts/manage-services.sh restart backend

# View backend logs  
./scripts/manage-services.sh logs backend -f

# Rebuild frontend
./scripts/manage-services.sh build frontend --no-cache
```

### Docker Compose Commands

Alternative direct Docker Compose usage:
```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Remove volumes (CAUTION: Data loss)
docker-compose down -v
```

## Troubleshooting

### Common Issues

#### 1. Services Won't Start
```bash
# Check Docker status
sudo systemctl status docker

# Check available resources
docker system df
free -h

# Check port conflicts
sudo netstat -tlnp | grep :80
sudo netstat -tlnp | grep :443
```

#### 2. AD Authentication Fails
```bash
# Test AD connectivity
./scripts/manage-services.sh exec backend nslookup your-dc.domain.local

# Check AD service logs
./scripts/manage-services.sh logs backend | grep -i ldap

# Test credentials manually
./scripts/manage-services.sh exec backend node dist/scripts/test-ldap-integration.js
```

#### 3. Database Connection Issues  
```bash
# Check database status
./scripts/manage-services.sh exec postgres pg_isready

# Test database connection
./scripts/manage-services.sh exec backend npm run db:test

# Reset database (CAUTION: Data loss)
docker-compose down -v
docker-compose up -d postgres
./scripts/manage-services.sh migrate
```

#### 4. CORS Errors
```bash
# Check CORS configuration
./scripts/manage-services.sh exec backend printenv CORS_ORIGIN

# Update CORS origins in .env
CORS_ORIGIN=https://your-domain.com,https://localhost

# Restart backend
./scripts/manage-services.sh restart backend --recreate
```

#### 5. SSL Certificate Issues
```bash
# Check certificate validity
openssl x509 -in nginx/ssl/cert.crt -text -noout

# Generate new self-signed certificate  
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/ssl/key.key \
  -out nginx/ssl/cert.crt \
  -subj "/CN=localhost"
```

### Log Analysis

```bash
# View all service logs
./scripts/manage-services.sh logs

# Filter for errors
./scripts/manage-services.sh logs | grep -i error

# Backend authentication logs
./scripts/manage-services.sh logs backend | grep -i auth

# Database logs  
./scripts/manage-services.sh logs postgres | grep -i error
```

### Performance Issues

```bash
# Check resource usage
./scripts/manage-services.sh status

# Monitor in real-time
docker stats

# Check disk usage
docker system df

# Cleanup unused resources
./scripts/manage-services.sh clean
docker system prune -f
```

## Maintenance

### Regular Maintenance Tasks

#### 1. Update Dependencies
```bash
# Pull latest images
./scripts/manage-services.sh pull

# Rebuild services  
./scripts/manage-services.sh build --no-cache

# Restart with new images
./scripts/manage-services.sh restart
```

#### 2. Database Maintenance
```bash
# Create backup
./scripts/manage-services.sh backup

# Analyze database performance
./scripts/manage-services.sh exec postgres psql -U postgres reporting -c "ANALYZE;"

# Vacuum database
./scripts/manage-services.sh exec postgres psql -U postgres reporting -c "VACUUM ANALYZE;"
```

#### 3. Log Rotation
```bash
# Configure Docker log rotation in daemon.json
sudo nano /etc/docker/daemon.json

{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "5"
  }
}

sudo systemctl restart docker
```

#### 4. SSL Certificate Renewal
```bash
# Renew Let's Encrypt certificates
sudo certbot renew

# Copy renewed certificates
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem nginx/ssl/
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem nginx/ssl/

# Restart nginx
./scripts/manage-services.sh restart nginx
```

### Monitoring and Alerting

```bash
# Setup basic monitoring
docker run -d --name monitoring \
  -p 3000:3000 \
  -v monitoring_data:/var/lib/grafana \
  grafana/grafana

# Monitor logs for errors
tail -f /var/log/docker.log | grep SimpleAdminReporter
```

## Backup and Recovery

### Automated Backup Setup

```bash
# Create backup script
cat > /opt/reporting-backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/opt/backups"
DATE=$(date +%Y%m%d_%H%M%S)
cd /path/to/SimpleAdminReporter

# Database backup
./scripts/manage-services.sh backup
mv backups/* "$BACKUP_DIR/db_backup_$DATE.sql.gz"

# Configuration backup  
tar -czf "$BACKUP_DIR/config_backup_$DATE.tar.gz" .env nginx/ssl/

# Cleanup old backups (keep 30 days)
find "$BACKUP_DIR" -name "*backup*" -mtime +30 -delete
EOF

chmod +x /opt/reporting-backup.sh
```

### Schedule Backups

```bash
# Add to crontab
crontab -e

# Daily backup at 2 AM
0 2 * * * /opt/reporting-backup.sh

# Weekly full backup
0 1 * * 0 /opt/reporting-full-backup.sh
```

### Recovery Procedures

#### Database Recovery
```bash
# Stop services
./scripts/manage-services.sh stop

# Restore database  
./scripts/manage-services.sh restore /path/to/backup.sql.gz

# Start services
./scripts/manage-services.sh start

# Verify restoration
./scripts/manage-services.sh exec postgres psql -U postgres reporting -c "SELECT COUNT(*) FROM users;"
```

#### Full System Recovery
```bash
# Restore configuration
tar -xzf config_backup_YYYYMMDD_HHMMSS.tar.gz

# Restore database
./scripts/manage-services.sh restore db_backup_YYYYMMDD_HHMMSS.sql.gz

# Restart services
./scripts/manage-services.sh restart
```

### Disaster Recovery

1. **Documentation**: Keep offline copies of this installation guide
2. **Backups**: Store backups in multiple locations (local, cloud, offsite)
3. **Configuration**: Maintain configuration backups separate from data
4. **Testing**: Regularly test backup restoration procedures
5. **Monitoring**: Implement alerting for service failures

## Production Deployment Checklist

- [ ] **Security**: Changed all default passwords and secrets
- [ ] **SSL**: Configured proper SSL certificates (not self-signed)
- [ ] **Firewall**: Configured appropriate firewall rules
- [ ] **Backup**: Automated backup system configured
- [ ] **Monitoring**: Service monitoring and alerting setup
- [ ] **DNS**: Proper domain configuration
- [ ] **Documentation**: Environment-specific documentation created
- [ ] **Testing**: Full authentication and reporting functionality tested
- [ ] **Performance**: Load testing completed for expected user count

## Support and Resources

### Documentation
- [CLAUDE.md](./CLAUDE.md) - Development and architecture guide
- [README.md](./README.md) - Project overview
- API documentation available at `/api/docs` when running

### Logs and Debugging
- Application logs: `./scripts/manage-services.sh logs`
- Database logs: Container logs via Docker
- Web server logs: Nginx access and error logs

### Community and Support
- GitHub Issues: [Project Issues](https://github.com/yourusername/SimpleAdminReporter/issues)
- Documentation: [Project Wiki](https://github.com/yourusername/SimpleAdminReporter/wiki)

---

## Version Information

- **Document Version**: 1.0
- **Application Version**: 1.0.0  
- **Last Updated**: August 2025
- **Supported Platforms**: Docker 20.10+, Docker Compose 2.0+

For the most up-to-date installation instructions, please refer to the project repository.