#!/bin/bash
# Service Management Script for AD Reporting Application
# Usage: ./scripts/manage-services.sh [command] [options]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Services
SERVICES=("nginx" "frontend" "backend" "postgres" "redis")

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

log_header() {
    echo -e "\n${CYAN}========== $1 ==========${NC}\n"
}

# Check dependencies
check_dependencies() {
    local deps=("docker" "docker-compose")
    local missing=()
    
    for dep in "${deps[@]}"; do
        if ! command -v "$dep" &> /dev/null; then
            missing+=("$dep")
        fi
    done
    
    if [ ${#missing[@]} -ne 0 ]; then
        log_error "Missing dependencies: ${missing[*]}"
        exit 1
    fi
}

# Load environment
load_environment() {
    if [[ -f "$PROJECT_DIR/.env" ]]; then
        set -a
        source "$PROJECT_DIR/.env"
        set +a
        log_debug "Loaded environment from .env"
    fi
}

# Show usage
show_usage() {
    cat << EOF
Usage: $0 [command] [options]

Commands:
    start [service...] [--recreate]  Start services (all if none specified)
                                      Use --recreate to force recreate containers
    stop [service...]       Stop services (all if none specified)
    restart [service...]    Restart services (all if none specified)
    status                  Show status of all services
    logs [service] [-f]     Show logs for service (follow with -f)
    build [service...] [--no-cache|--force]  Build service images (all if none specified)
                                          Use --no-cache or --force for force rebuild
    pull                    Pull latest images
    ps                      Show running containers
    exec <service> <cmd>    Execute command in service container
    shell <service>         Open shell in service container
    health                  Run health checks
    clean                   Clean stopped containers and unused volumes
    reset                   Stop all services and remove volumes (CAUTION!)
    backup                  Create database backup
    restore <file>          Restore database from backup
    migrate                 Run database migrations
    seed                    Seed database with test data
    
Services:
    nginx     - Reverse proxy server
    frontend  - React application
    backend   - Node.js API server
    postgres  - PostgreSQL database
    redis     - Redis cache/queue

Environment:
    Set COMPOSE_FILE to use different docker-compose file
    Current: ${COMPOSE_FILE:-docker-compose.yml}
    Use COMPOSE_FILE=docker-compose.dev.yml for development mode with live logs

Examples:
    $0 start                    # Start all services
    $0 start backend postgres   # Start only backend and postgres
    $0 logs backend -f          # Follow backend logs
    $0 shell backend            # Open shell in backend container
    $0 exec backend npm test    # Run tests in backend
    
Development Mode (with live React logs):
    COMPOSE_FILE=docker-compose.dev.yml $0 start
    COMPOSE_FILE=docker-compose.dev.yml $0 logs frontend -f
EOF
}

# Get compose command
get_compose_cmd() {
    local compose_file="${COMPOSE_FILE:-docker-compose.yml}"
    echo "docker-compose -f $PROJECT_DIR/$compose_file"
}

# Start services
start_services() {
    local args=("$@")
    local services=()
    local recreate=false
    
    # Parse arguments
    for arg in "${args[@]}"; do
        if [ "$arg" = "--recreate" ]; then
            recreate=true
        else
            services+=("$arg")
        fi
    done
    
    if [ ${#services[@]} -eq 0 ]; then
        services=("${SERVICES[@]}")
    fi
    
    # Auto-include nginx when starting backend (nginx depends on backend)
    if [[ " ${services[*]} " =~ " backend " ]] && [[ ! " ${services[*]} " =~ " nginx " ]]; then
        services+=("nginx")
        log_info "Auto-including nginx (depends on backend)"
    fi
    
    if [ "$recreate" = true ]; then
        log_header "Starting services with force recreate: ${services[*]}"
        $(get_compose_cmd) up -d --force-recreate "${services[@]}"
    else
        log_header "Starting services: ${services[*]}"
        $(get_compose_cmd) up -d "${services[@]}"
    fi
    
    log_info "Waiting for services to be healthy..."
    sleep 5
    
    show_status
}

# Stop services
stop_services() {
    local services=("$@")
    if [ ${#services[@]} -eq 0 ]; then
        log_header "Stopping all services"
        $(get_compose_cmd) down
    else
        log_header "Stopping services: ${services[*]}"
        $(get_compose_cmd) stop "${services[@]}"
    fi
}

# Restart services
restart_services() {
    local services=("$@")
    if [ ${#services[@]} -eq 0 ]; then
        services=("${SERVICES[@]}")
    fi
    
    log_header "Restarting services: ${services[*]}"
    $(get_compose_cmd) restart "${services[@]}"
}

# Show status
show_status() {
    log_header "Service Status"
    $(get_compose_cmd) ps
    
    echo -e "\n${CYAN}Container Health:${NC}"
    for service in "${SERVICES[@]}"; do
        container_name="reporting-$service"
        if docker ps --format "table {{.Names}}" | grep -q "$container_name"; then
            status=$(docker inspect --format='{{.State.Status}}' "$container_name" 2>/dev/null || echo "unknown")
            health=$(docker inspect --format='{{.State.Health.Status}}' "$container_name" 2>/dev/null || echo "N/A")
            
            if [[ "$status" == "running" ]]; then
                echo -e "  ${GREEN}✓${NC} $service: $status (health: $health)"
            else
                echo -e "  ${RED}✗${NC} $service: $status"
            fi
        else
            echo -e "  ${RED}✗${NC} $service: not found"
        fi
    done
    
    echo -e "\n${CYAN}Resource Usage:${NC}"
    docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" | grep "reporting-" || true
}

# Show logs
show_logs() {
    local service=$1
    local follow=$2
    
    if [ -z "$service" ]; then
        log_error "Service name required"
        exit 1
    fi
    
    log_header "Logs for $service"
    if [ "$follow" == "-f" ]; then
        $(get_compose_cmd) logs -f "$service"
    else
        $(get_compose_cmd) logs --tail=100 "$service"
    fi
}

# Build services
build_services() {
    local args=("$@")
    local services=()
    local no_cache=false
    
    # Parse arguments
    for arg in "${args[@]}"; do
        if [ "$arg" = "--no-cache" ] || [ "$arg" = "--force" ]; then
            no_cache=true
        else
            services+=("$arg")
        fi
    done
    
    if [ ${#services[@]} -eq 0 ]; then
        services=("${SERVICES[@]}")
    fi
    
    if [ "$no_cache" = true ]; then
        log_header "Force building services (--no-cache/--force): ${services[*]}"
        $(get_compose_cmd) build --no-cache "${services[@]}"
    else
        log_header "Building services: ${services[*]}"
        $(get_compose_cmd) build "${services[@]}"
    fi
}

# Pull images
pull_images() {
    log_header "Pulling latest images"
    $(get_compose_cmd) pull
}

# Execute command
exec_command() {
    local service=$1
    shift
    local cmd="$@"
    
    if [ -z "$service" ] || [ -z "$cmd" ]; then
        log_error "Service and command required"
        exit 1
    fi
    
    log_info "Executing in $service: $cmd"
    $(get_compose_cmd) exec "$service" $cmd
}

# Open shell
open_shell() {
    local service=$1
    
    if [ -z "$service" ]; then
        log_error "Service name required"
        exit 1
    fi
    
    log_info "Opening shell in $service"
    
    case "$service" in
        frontend|backend)
            $(get_compose_cmd) exec "$service" /bin/sh
            ;;
        postgres)
            $(get_compose_cmd) exec "$service" psql -U postgres reporting
            ;;
        redis)
            $(get_compose_cmd) exec "$service" redis-cli
            ;;
        nginx)
            $(get_compose_cmd) exec "$service" /bin/sh
            ;;
        *)
            log_error "Unknown service: $service"
            exit 1
            ;;
    esac
}

# Run health checks
run_health_checks() {
    log_header "Running Health Checks"
    
    # Check if health check script exists
    if [ -f "$SCRIPT_DIR/health-check.sh" ]; then
        "$SCRIPT_DIR/health-check.sh"
    else
        log_warn "Health check script not found, running basic checks"
        
        # Basic health checks
        log_info "Checking HTTP endpoint..."
        if curl -s -o /dev/null -w "%{http_code}" http://localhost | grep -q "200\|301\|302"; then
            log_info "HTTP endpoint: ${GREEN}OK${NC}"
        else
            log_error "HTTP endpoint: ${RED}FAILED${NC}"
        fi
        
        log_info "Checking API health..."
        if curl -s http://localhost/api/health | grep -q "ok"; then
            log_info "API health: ${GREEN}OK${NC}"
        else
            log_error "API health: ${RED}FAILED${NC}"
        fi
    fi
}

# Clean containers and volumes
clean_containers() {
    log_header "Cleaning Docker Resources"
    
    log_info "Removing stopped containers..."
    docker container prune -f
    
    log_info "Removing unused volumes..."
    docker volume prune -f
    
    log_info "Removing unused networks..."
    docker network prune -f
    
    log_info "Removing dangling images..."
    docker image prune -f
}

# Reset all (dangerous!)
reset_all() {
    log_warn "This will stop all services and remove all data!"
    read -p "Are you sure? (yes/no): " confirm
    
    if [ "$confirm" != "yes" ]; then
        log_info "Cancelled"
        exit 0
    fi
    
    log_header "Resetting All Services and Data"
    
    $(get_compose_cmd) down -v
    
    log_info "All services stopped and volumes removed"
}

# Database backup
backup_database() {
    log_header "Creating Database Backup"
    
    if [ -f "$SCRIPT_DIR/backup.sh" ]; then
        "$SCRIPT_DIR/backup.sh"
    else
        log_info "Creating manual backup..."
        timestamp=$(date +%Y%m%d_%H%M%S)
        backup_file="$PROJECT_DIR/backups/manual_backup_$timestamp.sql.gz"
        
        mkdir -p "$PROJECT_DIR/backups"
        
        $(get_compose_cmd) exec -T postgres pg_dump -U postgres reporting | gzip > "$backup_file"
        
        log_info "Backup created: $backup_file"
    fi
}

# Database restore
restore_database() {
    local backup_file=$1
    
    if [ -z "$backup_file" ]; then
        log_error "Backup file required"
        exit 1
    fi
    
    log_header "Restoring Database from $backup_file"
    
    if [ -f "$SCRIPT_DIR/restore.sh" ]; then
        "$SCRIPT_DIR/restore.sh" "$backup_file"
    else
        log_warn "Restore script not found, using manual restore"
        
        if [ ! -f "$backup_file" ]; then
            log_error "Backup file not found: $backup_file"
            exit 1
        fi
        
        log_info "Restoring database..."
        gunzip -c "$backup_file" | $(get_compose_cmd) exec -T postgres psql -U postgres reporting
        
        log_info "Database restored"
    fi
}

# Run migrations
run_migrations() {
    log_header "Running Database Migrations"
    
    $(get_compose_cmd) exec backend npm run migrate
}

# Seed database
seed_database() {
    log_header "Seeding Database"
    
    $(get_compose_cmd) exec backend npm run seed
}

# Main execution
main() {
    cd "$PROJECT_DIR"
    
    check_dependencies
    load_environment
    
    case "${1:-help}" in
        start)
            shift
            start_services "$@"
            ;;
        stop)
            shift
            stop_services "$@"
            ;;
        restart)
            shift
            restart_services "$@"
            ;;
        status)
            show_status
            ;;
        logs)
            shift
            show_logs "$@"
            ;;
        build)
            shift
            build_services "$@"
            ;;
        pull)
            pull_images
            ;;
        ps)
            $(get_compose_cmd) ps
            ;;
        exec)
            shift
            exec_command "$@"
            ;;
        shell)
            shift
            open_shell "$@"
            ;;
        health)
            run_health_checks
            ;;
        clean)
            clean_containers
            ;;
        reset)
            reset_all
            ;;
        backup)
            backup_database
            ;;
        restore)
            shift
            restore_database "$@"
            ;;
        migrate)
            run_migrations
            ;;
        seed)
            seed_database
            ;;
        help|--help|-h)
            show_usage
            ;;
        *)
            log_error "Unknown command: $1"
            show_usage
            exit 1
            ;;
    esac
}

# Run main function
main "$@"