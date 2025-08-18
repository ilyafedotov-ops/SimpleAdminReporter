#!/bin/bash
# Local Development Service Management Script for AD Reporting Application
# Usage: ./scripts/manage-services-local.sh [command] [options]
# Runs backend and frontend locally, keeps DB/Redis in Docker

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

# Local services configuration
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
BACKEND_PID_FILE="/tmp/reporting-backend.pid"
FRONTEND_PID_FILE="/tmp/reporting-frontend.pid"
BACKEND_LOG_FILE="/tmp/reporting-backend.log"
FRONTEND_LOG_FILE="/tmp/reporting-frontend.log"

# Docker services (DB stays in Docker)
DOCKER_SERVICES=("postgres" "redis")

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
    local deps=("docker" "docker-compose" "node" "npm")
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
    # Load .env.local first (for local development), then .env as fallback
    if [[ -f "$PROJECT_DIR/.env.local" ]]; then
        set -a
        source "$PROJECT_DIR/.env.local"
        set +a
        log_debug "Loaded environment from .env.local"
    elif [[ -f "$PROJECT_DIR/.env" ]]; then
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

Local Development Mode:
- Backend and Frontend run locally with live reload
- Database and Redis run in Docker containers
- Direct access to logs and processes

Commands:
    start [service...]          Start services (all if none specified)
    stop [service...]           Stop services (all if none specified)
    force-stop [service...]     Force stop services and kill orphaned processes
    restart [service...]        Restart services (all if none specified)
    status                      Show status of all services
    logs [service] [-f]         Show logs for service (follow with -f)
    install                     Install dependencies for backend and frontend
    build                       Build frontend for production
    health                      Run health checks
    clean                       Clean stopped containers and logs
    reset                       Stop all services and clean logs
    
Services:
    backend   - Node.js API server (local)
    frontend  - React application (local)
    postgres  - PostgreSQL database (Docker)
    redis     - Redis cache/queue (Docker)

Examples:
    $0 start                    # Start all services
    $0 start backend            # Start only backend locally
    $0 logs backend -f          # Follow backend logs
    $0 install                  # Install all dependencies
    
Environment:
    Backend runs on: http://localhost:5000
    Frontend runs on: http://localhost:3000
    Database (Docker): localhost:5432
    Redis (Docker): localhost:6379
EOF
}

# Get compose command for Docker services
get_compose_cmd() {
    local compose_file="${COMPOSE_FILE:-docker-compose.yml}"
    echo "docker-compose -f $PROJECT_DIR/$compose_file"
}

# Check if service is running
is_service_running() {
    local service=$1
    case "$service" in
        backend)
            [ -f "$BACKEND_PID_FILE" ] && kill -0 "$(cat "$BACKEND_PID_FILE")" 2>/dev/null
            ;;
        frontend)
            [ -f "$FRONTEND_PID_FILE" ] && kill -0 "$(cat "$FRONTEND_PID_FILE")" 2>/dev/null
            ;;
        postgres|redis)
            docker ps --format "{{.Names}}" | grep -q "reporting-$service"
            ;;
        *)
            return 1
            ;;
    esac
}

# Install dependencies
install_dependencies() {
    log_header "Installing Dependencies"
    
    if [ -d "$BACKEND_DIR" ]; then
        log_info "Installing backend dependencies..."
        cd "$BACKEND_DIR" && npm install
    fi
    
    if [ -d "$FRONTEND_DIR" ]; then
        log_info "Installing frontend dependencies..."
        cd "$FRONTEND_DIR" && npm install
    fi
    
    cd "$PROJECT_DIR"
}

# Start Docker services
start_docker_services() {
    log_info "Starting Docker services: ${DOCKER_SERVICES[*]}"
    $(get_compose_cmd) up -d "${DOCKER_SERVICES[@]}"
}

# Start backend service
start_backend() {
    if is_service_running backend; then
        log_warn "Backend is already running"
        return
    fi
    
    if [ ! -d "$BACKEND_DIR" ]; then
        log_error "Backend directory not found: $BACKEND_DIR"
        return 1
    fi
    
    log_info "Starting backend server..."
    cd "$BACKEND_DIR"
    
    # Start backend in background and capture PID
    nohup npm run dev > "$BACKEND_LOG_FILE" 2>&1 &
    echo $! > "$BACKEND_PID_FILE"
    
    log_info "Backend started with PID $(cat "$BACKEND_PID_FILE")"
    log_info "Backend logs: $BACKEND_LOG_FILE"
    
    cd "$PROJECT_DIR"
}

# Start frontend service
start_frontend() {
    if is_service_running frontend; then
        log_warn "Frontend is already running"
        return
    fi
    
    if [ ! -d "$FRONTEND_DIR" ]; then
        log_error "Frontend directory not found: $FRONTEND_DIR"
        return 1
    fi
    
    log_info "Starting frontend server..."
    cd "$FRONTEND_DIR"
    
    # Start frontend in background and capture PID
    nohup npm run dev > "$FRONTEND_LOG_FILE" 2>&1 &
    echo $! > "$FRONTEND_PID_FILE"
    
    log_info "Frontend started with PID $(cat "$FRONTEND_PID_FILE")"
    log_info "Frontend logs: $FRONTEND_LOG_FILE"
    
    cd "$PROJECT_DIR"
}

# Start services
start_services() {
    local services=("$@")
    
    if [ ${#services[@]} -eq 0 ]; then
        services=("postgres" "redis" "backend" "frontend")
    fi
    
    log_header "Starting services: ${services[*]}"
    
    # Always start Docker services first if they're in the list
    local docker_to_start=()
    for service in "${services[@]}"; do
        if [[ " ${DOCKER_SERVICES[*]} " =~ " $service " ]]; then
            docker_to_start+=("$service")
        fi
    done
    
    if [ ${#docker_to_start[@]} -gt 0 ]; then
        log_info "Starting Docker services: ${docker_to_start[*]}"
        $(get_compose_cmd) up -d "${docker_to_start[@]}"
        sleep 3
    fi
    
    # Start local services
    for service in "${services[@]}"; do
        case "$service" in
            backend)
                start_backend
                ;;
            frontend)
                start_frontend
                ;;
        esac
    done
    
    log_info "Waiting for services to be ready..."
    sleep 2
    show_status
}

# Stop backend service
stop_backend() {
    if [ -f "$BACKEND_PID_FILE" ]; then
        local pid=$(cat "$BACKEND_PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            log_info "Stopping backend (PID: $pid)..."
            kill "$pid"
            
            # Wait up to 5 seconds for graceful shutdown
            local count=0
            while kill -0 "$pid" 2>/dev/null && [ $count -lt 5 ]; do
                sleep 1
                count=$((count + 1))
            done
            
            # Force kill if still running
            if kill -0 "$pid" 2>/dev/null; then
                log_warn "Backend didn't stop gracefully, force killing..."
                kill -9 "$pid"
            fi
            
            rm -f "$BACKEND_PID_FILE"
        else
            log_warn "Backend PID file exists but process not running"
            rm -f "$BACKEND_PID_FILE"
        fi
    else
        log_warn "Backend is not running"
    fi
    
    # Also kill any orphaned nodemon/ts-node processes
    local orphaned_pids=$(ps aux | grep -E "SimpleAdminReporter.*backend.*nodemon|SimpleAdminReporter.*backend.*ts-node" | grep -v grep | awk '{print $2}')
    if [ -n "$orphaned_pids" ]; then
        log_warn "Found orphaned backend processes, cleaning up..."
        echo "$orphaned_pids" | xargs -r kill -9
    fi
}

# Stop frontend service
stop_frontend() {
    if [ -f "$FRONTEND_PID_FILE" ]; then
        local pid=$(cat "$FRONTEND_PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            log_info "Stopping frontend (PID: $pid)..."
            kill "$pid"
            
            # Wait up to 5 seconds for graceful shutdown
            local count=0
            while kill -0 "$pid" 2>/dev/null && [ $count -lt 5 ]; do
                sleep 1
                count=$((count + 1))
            done
            
            # Force kill if still running
            if kill -0 "$pid" 2>/dev/null; then
                log_warn "Frontend didn't stop gracefully, force killing..."
                kill -9 "$pid"
            fi
            
            rm -f "$FRONTEND_PID_FILE"
        else
            log_warn "Frontend PID file exists but process not running"
            rm -f "$FRONTEND_PID_FILE"
        fi
    else
        log_warn "Frontend is not running"
    fi
    
    # Also kill any orphaned vite/esbuild processes
    local orphaned_pids=$(ps aux | grep -E "SimpleAdminReporter.*frontend.*vite|SimpleAdminReporter.*frontend.*esbuild" | grep -v grep | awk '{print $2}')
    if [ -n "$orphaned_pids" ]; then
        log_warn "Found orphaned frontend processes, cleaning up..."
        echo "$orphaned_pids" | xargs -r kill -9
    fi
}

# Stop services
stop_services() {
    local services=("$@")
    
    if [ ${#services[@]} -eq 0 ]; then
        services=("backend" "frontend" "postgres" "redis")
    fi
    
    log_header "Stopping services: ${services[*]}"
    
    # Stop local services
    for service in "${services[@]}"; do
        case "$service" in
            backend)
                stop_backend
                ;;
            frontend)
                stop_frontend
                ;;
        esac
    done
    
    # Stop Docker services
    local docker_to_stop=()
    for service in "${services[@]}"; do
        if [[ " ${DOCKER_SERVICES[*]} " =~ " $service " ]]; then
            docker_to_stop+=("$service")
        fi
    done
    
    if [ ${#docker_to_stop[@]} -gt 0 ]; then
        log_info "Stopping Docker services: ${docker_to_stop[*]}"
        $(get_compose_cmd) down
    fi
}

# Restart services
restart_services() {
    local services=("$@")
    if [ ${#services[@]} -eq 0 ]; then
        services=("backend" "frontend" "postgres" "redis")
    fi
    
    log_header "Restarting services: ${services[*]}"
    stop_services "${services[@]}"
    sleep 2
    start_services "${services[@]}"
}

# Show status
show_status() {
    log_header "Service Status"
    
    echo -e "${CYAN}Local Services:${NC}"
    
    # Backend status
    if is_service_running backend; then
        local pid=$(cat "$BACKEND_PID_FILE" 2>/dev/null || echo "unknown")
        echo -e "  ${GREEN}✓${NC} backend: running (PID: $pid) - http://localhost:5000"
    else
        echo -e "  ${RED}✗${NC} backend: stopped"
    fi
    
    # Frontend status
    if is_service_running frontend; then
        local pid=$(cat "$FRONTEND_PID_FILE" 2>/dev/null || echo "unknown")
        echo -e "  ${GREEN}✓${NC} frontend: running (PID: $pid) - http://localhost:3000"
    else
        echo -e "  ${RED}✗${NC} frontend: stopped"
    fi
    
    echo -e "\n${CYAN}Docker Services:${NC}"
    $(get_compose_cmd) ps
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
    
    case "$service" in
        backend)
            if [ "$follow" == "-f" ]; then
                tail -f "$BACKEND_LOG_FILE"
            else
                tail -n 100 "$BACKEND_LOG_FILE"
            fi
            ;;
        frontend)
            if [ "$follow" == "-f" ]; then
                tail -f "$FRONTEND_LOG_FILE"
            else
                tail -n 100 "$FRONTEND_LOG_FILE"
            fi
            ;;
        postgres|redis)
            if [ "$follow" == "-f" ]; then
                $(get_compose_cmd) logs -f "$service"
            else
                $(get_compose_cmd) logs --tail=100 "$service"
            fi
            ;;
        *)
            log_error "Unknown service: $service"
            exit 1
            ;;
    esac
}

# Build frontend
build_frontend() {
    log_header "Building Frontend"
    
    if [ ! -d "$FRONTEND_DIR" ]; then
        log_error "Frontend directory not found: $FRONTEND_DIR"
        return 1
    fi
    
    cd "$FRONTEND_DIR"
    npm run build
    cd "$PROJECT_DIR"
}

# Run health checks
run_health_checks() {
    log_header "Running Health Checks"
    
    # Check backend
    log_info "Checking backend health..."
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:5000 | grep -q "200\|301\|302"; then
        log_info "Backend: ${GREEN}OK${NC}"
    else
        log_error "Backend: ${RED}FAILED${NC}"
    fi
    
    # Check frontend
    log_info "Checking frontend health..."
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 | grep -q "200\|301\|302"; then
        log_info "Frontend: ${GREEN}OK${NC}"
    else
        log_error "Frontend: ${RED}FAILED${NC}"
    fi
    
    # Check Docker services
    for service in "${DOCKER_SERVICES[@]}"; do
        if is_service_running "$service"; then
            log_info "$service: ${GREEN}OK${NC}"
        else
            log_error "$service: ${RED}FAILED${NC}"
        fi
    done
}

# Clean resources
clean_resources() {
    log_header "Cleaning Resources"
    
    log_info "Cleaning Docker resources..."
    docker container prune -f
    docker volume prune -f
    
    log_info "Cleaning log files..."
    rm -f "$BACKEND_LOG_FILE" "$FRONTEND_LOG_FILE"
    
    # Clean up any lingering processes
    kill_orphaned_processes
}

# Kill all orphaned processes related to this project
kill_orphaned_processes() {
    log_info "Checking for orphaned processes..."
    
    # Kill any SimpleAdminReporter related Node processes
    local orphaned_pids=$(ps aux | grep -E "SimpleAdminReporter.*(node|vite|nodemon|ts-node|esbuild)" | grep -v grep | awk '{print $2}')
    
    if [ -n "$orphaned_pids" ]; then
        log_warn "Found orphaned processes, cleaning up..."
        local count=$(echo "$orphaned_pids" | wc -l)
        log_info "Killing $count orphaned process(es)..."
        echo "$orphaned_pids" | xargs -r kill -9
        log_info "Orphaned processes cleaned up"
    else
        log_info "No orphaned processes found"
    fi
}

# Reset all
reset_all() {
    log_warn "This will stop all services and clean logs!"
    read -p "Are you sure? (yes/no): " confirm
    
    if [ "$confirm" != "yes" ]; then
        log_info "Cancelled"
        exit 0
    fi
    
    log_header "Resetting All Services"
    
    stop_services
    $(get_compose_cmd) down -v
    rm -f "$BACKEND_LOG_FILE" "$FRONTEND_LOG_FILE"
    
    log_info "All services stopped and logs cleaned"
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
        install)
            install_dependencies
            ;;
        build)
            build_frontend
            ;;
        health)
            run_health_checks
            ;;
        clean)
            clean_resources
            ;;
        reset)
            reset_all
            ;;
        force-stop)
            shift
            stop_services "$@"
            kill_orphaned_processes
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