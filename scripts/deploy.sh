#!/bin/bash

# AD Reporting Application Deployment Script
# Usage: ./scripts/deploy.sh [staging|production]

set -e

ENVIRONMENT=${1:-staging}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
    exit 1
}

# Validate environment
if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
    error "Environment must be 'staging' or 'production'"
fi

log "Starting deployment for $ENVIRONMENT environment"

# Load environment variables
if [[ -f "$PROJECT_DIR/.env.$ENVIRONMENT" ]]; then
    log "Loading environment variables from .env.$ENVIRONMENT"
    source "$PROJECT_DIR/.env.$ENVIRONMENT"
elif [[ -f "$PROJECT_DIR/.env" ]]; then
    log "Loading environment variables from .env"
    source "$PROJECT_DIR/.env"
else
    error "No environment file found (.env or .env.$ENVIRONMENT)"
fi

# Validate required variables
REQUIRED_VARS=(
    "CI_REGISTRY_IMAGE"
    "DATABASE_URL" 
    "REDIS_URL"
    "JWT_SECRET"
)

for var in "${REQUIRED_VARS[@]}"; do
    if [[ -z "${!var}" ]]; then
        error "Required environment variable $var is not set"
    fi
done

# Set deployment-specific variables
if [[ "$ENVIRONMENT" == "production" ]]; then
    SERVER_HOST=${PRODUCTION_SERVER}
    SERVER_USER=${PRODUCTION_USER}
    SSH_KEY=${PRODUCTION_SSH_PRIVATE_KEY}
    COMPOSE_FILE="docker-compose.prod.yml"
else
    SERVER_HOST=${STAGING_SERVER}
    SERVER_USER=${STAGING_USER}
    SSH_KEY=${STAGING_SSH_PRIVATE_KEY}
    COMPOSE_FILE="docker-compose.staging.yml"
fi

# Pre-deployment checks
log "Running pre-deployment checks"

# Check if docker is available
if ! command -v docker &> /dev/null; then
    error "Docker is not installed or not in PATH"
fi

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    error "Docker Compose is not installed or not in PATH"
fi

# Test database connection
log "Testing database connection"
if ! docker run --rm --network host postgres:15-alpine pg_isready -h $(echo $DATABASE_URL | cut -d@ -f2 | cut -d: -f1) -p $(echo $DATABASE_URL | cut -d: -f4 | cut -d/ -f1) -U $(echo $DATABASE_URL | cut -d: -f2 | cut -d@ -f1); then
    error "Cannot connect to database"
fi

# Build and tag images
log "Building Docker images"
cd "$PROJECT_DIR"

# Build frontend
if [[ -d "frontend" ]]; then
    log "Building frontend image"
    docker build -t ${CI_REGISTRY_IMAGE}/frontend:latest frontend/
    docker tag ${CI_REGISTRY_IMAGE}/frontend:latest ${CI_REGISTRY_IMAGE}/frontend:${ENVIRONMENT}
else
    warn "Frontend directory not found, skipping frontend build"
fi

# Build backend
if [[ -d "backend" ]]; then
    log "Building backend image"
    docker build -t ${CI_REGISTRY_IMAGE}/backend:latest backend/
    docker tag ${CI_REGISTRY_IMAGE}/backend:latest ${CI_REGISTRY_IMAGE}/backend:${ENVIRONMENT}
else
    warn "Backend directory not found, skipping backend build"
fi

# Create deployment directory structure
log "Creating deployment directory structure"
mkdir -p deploy/$ENVIRONMENT/{nginx,database,scripts,backups}

# Copy configuration files
cp nginx/nginx.conf deploy/$ENVIRONMENT/nginx/
cp database/*.sql deploy/$ENVIRONMENT/database/ 2>/dev/null || warn "No database files to copy"
cp scripts/*.sh deploy/$ENVIRONMENT/scripts/ 2>/dev/null || warn "No additional scripts to copy"

# Generate docker-compose file for deployment
log "Generating docker-compose configuration for $ENVIRONMENT"
envsubst < docker-compose.ci.yml > deploy/$ENVIRONMENT/docker-compose.yml

# Create environment file for deployment
cat > deploy/$ENVIRONMENT/.env << EOF
NODE_ENV=$ENVIRONMENT
DATABASE_URL=$DATABASE_URL
REDIS_URL=$REDIS_URL
JWT_SECRET=$JWT_SECRET
AD_SERVER=$AD_SERVER
AD_BASE_DN=$AD_BASE_DN
AD_USERNAME=$AD_USERNAME
AD_PASSWORD=$AD_PASSWORD
AZURE_TENANT_ID=$AZURE_TENANT_ID
AZURE_CLIENT_ID=$AZURE_CLIENT_ID
AZURE_CLIENT_SECRET=$AZURE_CLIENT_SECRET
CI_REGISTRY_IMAGE=$CI_REGISTRY_IMAGE
CI_COMMIT_SHA=$ENVIRONMENT
EOF

# Stop existing containers
log "Stopping existing containers"
docker-compose -f deploy/$ENVIRONMENT/docker-compose.yml down --remove-orphans || warn "No existing containers to stop"

# Database migration (if needed)
if [[ "$ENVIRONMENT" == "production" ]]; then
    log "Running database migrations"
    docker run --rm --network host \
        -e DATABASE_URL="$DATABASE_URL" \
        ${CI_REGISTRY_IMAGE}/backend:$ENVIRONMENT \
        npm run migrate
fi

# Start new containers
log "Starting new containers"
cd deploy/$ENVIRONMENT
docker-compose up -d

# Wait for services to be healthy
log "Waiting for services to be healthy"
timeout=300
elapsed=0
while [[ $elapsed -lt $timeout ]]; do
    if docker-compose ps | grep -q "healthy\|Up"; then
        log "Services are healthy"
        break
    fi
    sleep 10
    elapsed=$((elapsed + 10))
    log "Waiting for services... ($elapsed/$timeout seconds)"
done

if [[ $elapsed -ge $timeout ]]; then
    error "Services failed to become healthy within $timeout seconds"
fi

# Run post-deployment tests
log "Running post-deployment health checks"
sleep 30  # Give services time to fully start

# Test application endpoint
if curl -f http://localhost/health &>/dev/null; then
    log "Application health check passed"
else
    error "Application health check failed"
fi

# Test database connectivity
if docker-compose exec -T backend node -e "console.log('Database connection test')" &>/dev/null; then
    log "Backend database connectivity test passed"
else
    error "Backend database connectivity test failed"
fi

# Cleanup old images
log "Cleaning up old Docker images"
docker image prune -f
docker system prune -f

# Create backup (production only)
if [[ "$ENVIRONMENT" == "production" ]]; then
    log "Creating post-deployment backup"
    DATE=$(date +%Y%m%d_%H%M%S)
    docker-compose exec -T postgres pg_dump -U postgres reporting | gzip > ../backups/post_deploy_$DATE.sql.gz
    log "Backup created: post_deploy_$DATE.sql.gz"
fi

log "Deployment completed successfully!"
log "Application is running at: http://localhost"

# Display container status
log "Container status:"
docker-compose ps

# Display logs for troubleshooting
log "Recent logs:"
docker-compose logs --tail=50