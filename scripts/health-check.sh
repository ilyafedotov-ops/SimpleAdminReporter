#!/bin/bash
# Comprehensive health check script for AD Reporting Application

set -e

# Configuration
HEALTH_ENDPOINT=${HEALTH_ENDPOINT:-http://localhost/api/health}
MAX_RETRIES=${MAX_RETRIES:-10}
RETRY_INTERVAL=${RETRY_INTERVAL:-5}
TIMEOUT=${TIMEOUT:-10}

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_debug() {
    echo -e "${BLUE}[DEBUG]${NC} $1"
}

# Check if required tools are available
check_dependencies() {
    local deps=("curl" "jq")
    local missing=()
    
    for dep in "${deps[@]}"; do
        if ! command -v "$dep" &> /dev/null; then
            missing+=("$dep")
        fi
    done
    
    if [ ${#missing[@]} -ne 0 ]; then
        log_error "Missing dependencies: ${missing[*]}"
        log_info "Installing missing dependencies..."
        
        # Try to install missing dependencies
        if command -v apk &> /dev/null; then
            apk add --no-cache "${missing[@]}"
        elif command -v apt-get &> /dev/null; then
            apt-get update && apt-get install -y "${missing[@]}"
        elif command -v yum &> /dev/null; then
            yum install -y "${missing[@]}"
        else
            log_error "Cannot install dependencies automatically"
            exit 1
        fi
    fi
}

# Basic HTTP health check
check_http_health() {
    local url=$1
    local expected_status=${2:-200}
    
    log_debug "Checking HTTP health: $url"
    
    local response
    response=$(curl -s -w "%{http_code}" -o /dev/null --connect-timeout "$TIMEOUT" "$url")
    
    if [ "$response" = "$expected_status" ]; then
        log_info "HTTP health check passed ($response)"
        return 0
    else
        log_error "HTTP health check failed (expected: $expected_status, got: $response)"
        return 1
    fi
}

# Advanced API health check
check_api_health() {
    local url=$1
    
    log_debug "Checking API health: $url"
    
    local response
    response=$(curl -s --connect-timeout "$TIMEOUT" "$url")
    local exit_code=$?
    
    if [ $exit_code -ne 0 ]; then
        log_error "Failed to connect to API endpoint"
        return 1
    fi
    
    # Parse JSON response if available
    if echo "$response" | jq . &> /dev/null; then
        local status
        status=$(echo "$response" | jq -r '.status // "unknown"')
        
        case "$status" in
            "ok"|"healthy"|"up")
                log_info "API health check passed (status: $status)"
                
                # Check additional health indicators
                local database
                database=$(echo "$response" | jq -r '.checks.database // "unknown"')
                local redis
                redis=$(echo "$response" | jq -r '.checks.redis // "unknown"')
                
                log_info "Database status: $database"
                log_info "Redis status: $redis"
                
                if [ "$database" = "ok" ] && [ "$redis" = "ok" ]; then
                    return 0
                else
                    log_warn "Some services are not healthy"
                    return 1
                fi
                ;;
            *)
                log_error "API health check failed (status: $status)"
                return 1
                ;;
        esac
    else
        log_warn "Non-JSON response received: $response"
        return 1
    fi
}

# Check database connectivity
check_database() {
    local db_url=${DATABASE_URL:-postgresql://postgres:postgres@postgres:5432/reporting}
    
    log_debug "Checking database connectivity"
    
    if command -v psql &> /dev/null; then
        if psql "$db_url" -c "SELECT 1;" &> /dev/null; then
            log_info "Database connectivity check passed"
            return 0
        else
            log_error "Database connectivity check failed"
            return 1
        fi
    else
        log_warn "psql not available, skipping database check"
        return 0
    fi
}

# Check Redis connectivity
check_redis() {
    local redis_url=${REDIS_URL:-redis://redis:6379}
    local redis_host=$(echo "$redis_url" | sed 's/redis:\/\///' | cut -d: -f1)
    local redis_port=$(echo "$redis_url" | sed 's/redis:\/\///' | cut -d: -f2)
    
    log_debug "Checking Redis connectivity ($redis_host:$redis_port)"
    
    if command -v redis-cli &> /dev/null; then
        if redis-cli -h "$redis_host" -p "$redis_port" ping | grep -q "PONG"; then
            log_info "Redis connectivity check passed"
            return 0
        else
            log_error "Redis connectivity check failed"
            return 1
        fi
    else
        log_warn "redis-cli not available, skipping Redis check"
        return 0
    fi
}

# Check disk space
check_disk_space() {
    log_debug "Checking disk space"
    
    local usage
    usage=$(df /var/lib/docker 2>/dev/null | awk 'NR==2 {print $5}' | sed 's/%//' || echo "0")
    
    if [ "$usage" -gt 90 ]; then
        log_error "Disk usage is critical: ${usage}%"
        return 1
    elif [ "$usage" -gt 80 ]; then
        log_warn "Disk usage is high: ${usage}%"
        return 0
    else
        log_info "Disk usage is healthy: ${usage}%"
        return 0
    fi
}

# Check memory usage
check_memory() {
    log_debug "Checking memory usage"
    
    if command -v free &> /dev/null; then
        local mem_usage
        mem_usage=$(free | awk 'NR==2{printf "%.0f", $3*100/$2}')
        
        if [ "$mem_usage" -gt 90 ]; then
            log_error "Memory usage is critical: ${mem_usage}%"
            return 1
        elif [ "$mem_usage" -gt 80 ]; then
            log_warn "Memory usage is high: ${mem_usage}%"
            return 0
        else
            log_info "Memory usage is healthy: ${mem_usage}%"
            return 0
        fi
    else
        log_warn "free command not available, skipping memory check"
        return 0
    fi
}

# Check Docker containers
check_containers() {
    log_debug "Checking Docker containers"
    
    if command -v docker &> /dev/null; then
        local unhealthy_containers
        unhealthy_containers=$(docker ps --filter "health=unhealthy" --format "table {{.Names}}" 2>/dev/null | tail -n +2)
        
        if [ -n "$unhealthy_containers" ]; then
            log_error "Unhealthy containers found: $unhealthy_containers"
            return 1
        else
            log_info "All containers are healthy"
            return 0
        fi
    else
        log_warn "Docker not available, skipping container check"
        return 0
    fi
}

# Run comprehensive health check
run_health_check() {
    local failed_checks=0
    local total_checks=0
    
    log_info "Starting comprehensive health check..."
    log_info "Target endpoint: $HEALTH_ENDPOINT"
    log_info "Max retries: $MAX_RETRIES, Retry interval: ${RETRY_INTERVAL}s"
    
    # Check dependencies first
    check_dependencies
    
    # Run all health checks
    local checks=(
        "check_http_health $HEALTH_ENDPOINT"
        "check_api_health $HEALTH_ENDPOINT"
        "check_database"
        "check_redis"
        "check_disk_space"
        "check_memory"
        "check_containers"
    )
    
    for check in "${checks[@]}"; do
        total_checks=$((total_checks + 1))
        log_info "Running: $check"
        
        if ! eval "$check"; then
            failed_checks=$((failed_checks + 1))
        fi
        
        echo # Add spacing between checks
    done
    
    # Summary
    log_info "Health check summary:"
    log_info "Total checks: $total_checks"
    log_info "Failed checks: $failed_checks"
    log_info "Success rate: $(( (total_checks - failed_checks) * 100 / total_checks ))%"
    
    if [ "$failed_checks" -eq 0 ]; then
        log_info "All health checks passed! 🎉"
        return 0
    else
        log_error "Some health checks failed!"
        return 1
    fi
}

# Retry logic for health checks
main() {
    local attempt=1
    
    while [ $attempt -le $MAX_RETRIES ]; do
        log_info "Health check attempt $attempt of $MAX_RETRIES"
        
        if run_health_check; then
            log_info "Health check successful on attempt $attempt"
            exit 0
        fi
        
        if [ $attempt -lt $MAX_RETRIES ]; then
            log_warn "Health check failed, retrying in ${RETRY_INTERVAL}s..."
            sleep $RETRY_INTERVAL
        fi
        
        attempt=$((attempt + 1))
    done
    
    log_error "Health check failed after $MAX_RETRIES attempts!"
    exit 1
}

# Show usage information
show_usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Health check script for AD Reporting Application

OPTIONS:
    -e, --endpoint URL      Health check endpoint (default: http://localhost/api/health)
    -r, --retries NUM       Maximum number of retries (default: 10)
    -i, --interval SEC      Retry interval in seconds (default: 5)
    -t, --timeout SEC       Request timeout in seconds (default: 10)
    -h, --help              Show this help message

ENVIRONMENT VARIABLES:
    HEALTH_ENDPOINT         Health check endpoint URL
    MAX_RETRIES            Maximum number of retries
    RETRY_INTERVAL         Retry interval in seconds
    TIMEOUT                Request timeout in seconds
    DATABASE_URL           Database connection URL
    REDIS_URL             Redis connection URL

EXAMPLES:
    $0                                          # Use default settings
    $0 -e http://staging.example.com/health     # Custom endpoint
    $0 -r 5 -i 10                              # 5 retries with 10s interval
    HEALTH_ENDPOINT=http://localhost:8080/health $0  # Using environment variable

EXIT CODES:
    0    All health checks passed
    1    One or more health checks failed
EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--endpoint)
            HEALTH_ENDPOINT="$2"
            shift 2
            ;;
        -r|--retries)
            MAX_RETRIES="$2"
            shift 2
            ;;
        -i|--interval)
            RETRY_INTERVAL="$2"
            shift 2
            ;;
        -t|--timeout)
            TIMEOUT="$2"
            shift 2
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Run main function
main