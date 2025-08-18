# ==================== GitLab CI/CD Variables Configuration ====================
# Set these variables in GitLab UI: Settings -> CI/CD -> Variables

# Registry Variables
CI_REGISTRY_USER=gitlab-ci-token
CI_REGISTRY_PASSWORD=$CI_JOB_TOKEN  # Automatically provided by GitLab

# Deployment SSH Keys (Protected, Masked)
SSH_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
<your-deployment-private-key>
-----END RSA PRIVATE KEY-----"

# Staging Environment Variables
STAGING_HOST=staging.example.com
STAGING_USER=deploy
STAGING_PATH=/opt/reporting-app

# Production Environment Variables  
PRODUCTION_HOST=prod.example.com
PRODUCTION_USER=deploy
PRODUCTION_PATH=/opt/reporting-app

# Notification Webhooks (Masked)
SLACK_WEBHOOK=https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK
TEAMS_WEBHOOK=https://outlook.office.com/webhook/YOUR/TEAMS/WEBHOOK

# Application Secrets (Protected, Masked)
JWT_SECRET=your-super-secret-jwt-key-for-production
AD_PASSWORD=your-ad-service-account-password
AZURE_CLIENT_SECRET=your-azure-app-client-secret

# ==================== .env.example ====================
# Example environment file for local development
# Copy to .env and fill in your values

# Application
NODE_ENV=development
PORT=5000

# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/reporting
REDIS_URL=redis://localhost:6379

# Active Directory
AD_SERVER=dc.company.local
AD_BASE_DN=DC=company,DC=local
AD_USERNAME=CN=svc_reporting,OU=ServiceAccounts,DC=company,DC=local
AD_PASSWORD=

# Azure AD
AZURE_TENANT_ID=
AZURE_CLIENT_ID=
AZURE_CLIENT_SECRET=

# JWT
JWT_SECRET=development-secret-change-in-production
JWT_EXPIRY=24h

# Email (for notifications)
SMTP_HOST=smtp.company.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=reporting@company.com

# ==================== .env.staging ====================
# Staging environment configuration
NODE_ENV=staging
PORT=5000

# Database
DATABASE_URL=postgresql://postgres:staging_password@postgres:5432/reporting_staging
REDIS_URL=redis://redis:6379

# Use staging AD test environment
AD_SERVER=dc-staging.company.local
AD_BASE_DN=DC=staging,DC=company,DC=local

# Staging Azure AD App
AZURE_TENANT_ID=staging-tenant-id
AZURE_CLIENT_ID=staging-client-id

# ==================== .env.production ====================
# Production environment configuration
NODE_ENV=production
PORT=5000

# Database
DATABASE_URL=postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/reporting
REDIS_URL=redis://redis:6379

# Production AD
AD_SERVER=dc.company.local
AD_BASE_DN=DC=company,DC=local
AD_USERNAME=CN=svc_reporting_prod,OU=ServiceAccounts,DC=company,DC=local

# Production Azure AD App
AZURE_TENANT_ID=production-tenant-id
AZURE_CLIENT_ID=production-client-id

# Security Headers
HELMET_CSP=true
CORS_ORIGIN=http://prod.example.com

# ==================== docker-compose.staging.yml ====================
# Override configuration for staging environment
version: '3.8'

services:
  frontend:
    environment:
      - REACT_APP_API_URL=http://staging.example.com/api
      - REACT_APP_ENVIRONMENT=staging

  backend:
    environment:
      - NODE_ENV=staging
      - LOG_LEVEL=debug
      - ENABLE_SWAGGER=true
    volumes:
      - ./logs:/app/logs
      - staging-reports:/app/reports

  postgres:
    volumes:
      - staging-postgres-data:/var/lib/postgresql/data

  redis:
    volumes:
      - staging-redis-data:/data

volumes:
  staging-postgres-data:
  staging-redis-data:
  staging-reports:

# ==================== docker-compose.production.yml ====================
# Override configuration for production environment
version: '3.8'

services:
  frontend:
    environment:
      - REACT_APP_API_URL=http://prod.example.com/api
      - REACT_APP_ENVIRONMENT=production
    restart: always

  backend:
    environment:
      - NODE_ENV=production
      - LOG_LEVEL=info
      - ENABLE_SWAGGER=false
    volumes:
      - ./logs:/app/logs
      - production-reports:/app/reports
    restart: always
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G

  postgres:
    volumes:
      - production-postgres-data:/var/lib/postgresql/data
    environment:
      - POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password
    secrets:
      - postgres_password
    restart: always

  redis:
    volumes:
      - production-redis-data:/data
    restart: always
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}

  nginx:
    restart: always
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M

volumes:
  production-postgres-data:
  production-redis-data:
  production-reports:

secrets:
  postgres_password:
    external: true

# ==================== scripts/setup-gitlab-variables.sh ====================
#!/bin/bash
# Script to setup GitLab CI/CD variables via API

GITLAB_URL="https://gitlab.com"
PROJECT_ID="your-project-id"
PRIVATE_TOKEN="your-private-token"

# Function to create or update variable
create_variable() {
    local key=$1
    local value=$2
    local protected=${3:-false}
    local masked=${4:-false}
    local environment=$5

    echo "Creating variable: $key"
    
    curl --request POST \
      --header "PRIVATE-TOKEN: $PRIVATE_TOKEN" \
      --form "key=$key" \
      --form "value=$value" \
      --form "protected=$protected" \
      --form "masked=$masked" \
      --form "environment_scope=${environment:-*}" \
      "$GITLAB_URL/api/v4/projects/$PROJECT_ID/variables"
}

# Deployment variables
create_variable "STAGING_HOST" "staging.example.com" false false "staging"
create_variable "STAGING_USER" "deploy" false false "staging"
create_variable "STAGING_PATH" "/opt/reporting-app" false false "staging"

create_variable "PRODUCTION_HOST" "prod.example.com" false false "production"
create_variable "PRODUCTION_USER" "deploy" false false "production"
create_variable "PRODUCTION_PATH" "/opt/reporting-app" false false "production"

# Secrets (protected and masked)
create_variable "SSH_PRIVATE_KEY" "$(cat ~/.ssh/deploy_key)" true true "*"
create_variable "JWT_SECRET" "$(openssl rand -base64 32)" true true "*"
create_variable "SLACK_WEBHOOK" "your-slack-webhook" true true "*"

echo "Variables created successfully!"

# ==================== monitoring/prometheus.yml ====================
# Prometheus configuration for CI/CD metrics
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'gitlab-ci'
    static_configs:
      - targets: ['gitlab.com']
    
  - job_name: 'reporting-app'
    static_configs:
      - targets: 
        - 'staging.example.com:9090'
        - 'prod.example.com:9090'
    
  - job_name: 'node-exporter'
    static_configs:
      - targets:
        - 'staging.example.com:9100'
        - 'prod.example.com:9100'

# ==================== .gitlab/ci/security-scan.yml ====================
# Additional security scanning configuration
include:
  - template: Security/SAST.gitlab-ci.yml
  - template: Security/Dependency-Scanning.gitlab-ci.yml
  - template: Security/Secret-Detection.gitlab-ci.yml
  - template: Security/Container-Scanning.gitlab-ci.yml

# Override security job settings
sast:
  variables:
    SAST_EXCLUDED_PATHS: "node_modules,build,dist,coverage"
    SAST_EXCLUDED_ANALYZERS: "brakeman,flawfinder,phpcs-security-audit"

dependency_scanning:
  variables:
    DS_EXCLUDED_PATHS: "frontend/build,backend/dist"

secret_detection:
  variables:
    SECRET_DETECTION_EXCLUDED_PATHS: "node_modules,build,dist"

container_scanning:
  variables:
    CS_SEVERITY_THRESHOLD: "MEDIUM"
    CS_IGNORE_UNFIXED: "true"

# ==================== scripts/local-ci-test.sh ====================
#!/bin/bash
# Test CI pipeline locally using gitlab-runner

# Install gitlab-runner if not present
if ! command -v gitlab-runner &> /dev/null; then
    echo "Installing gitlab-runner..."
    curl -L --output /usr/local/bin/gitlab-runner https://gitlab-runner-downloads.s3.amazonaws.com/latest/binaries/gitlab-runner-linux-amd64
    chmod +x /usr/local/bin/gitlab-runner
fi

# Run specific job locally
gitlab-runner exec docker build:frontend \
  --docker-image node:18-alpine \
  --docker-volumes /var/run/docker.sock:/var/run/docker.sock

# Run entire pipeline locally
gitlab-runner exec docker \
  --docker-image docker:latest \
  --docker-privileged \
  --docker-volumes /var/run/docker.sock:/var/run/docker.sock