#!/bin/bash

##
# Comprehensive Test Execution Script for CI/CD Pipeline
# 
# This script orchestrates the complete testing pipeline with:
# 1. Environment setup and validation
# 2. Service dependency management
# 3. Parallel test execution
# 4. Coverage aggregation
# 5. Performance benchmarking
# 6. Security scanning
# 7. Quality gate enforcement
# 8. Artifact generation and cleanup
##

set -euo pipefail

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOG_FILE="${PROJECT_ROOT}/logs/test-execution.log"
REPORTS_DIR="${PROJECT_ROOT}/reports"
COVERAGE_DIR="${PROJECT_ROOT}/coverage"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test configuration
PARALLEL_JOBS=${PARALLEL_JOBS:-4}
SKIP_PERFORMANCE=${SKIP_PERFORMANCE:-false}
SKIP_SECURITY=${SKIP_SECURITY:-false}
FAIL_FAST=${FAIL_FAST:-true}
BRANCH_NAME=${CI_COMMIT_REF_NAME:-$(git rev-parse --abbrev-ref HEAD)}

# Coverage thresholds
UNIT_COVERAGE_THRESHOLD=85
INTEGRATION_COVERAGE_THRESHOLD=75
OVERALL_COVERAGE_THRESHOLD=80

# Performance thresholds
MAX_RESPONSE_TIME=2000  # 2 seconds
MIN_THROUGHPUT=50       # requests per second
MAX_ERROR_RATE=5        # 5%

##
# Utility Functions
##

log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    case "$level" in
        "INFO")  echo -e "${BLUE}[INFO]${NC} ${timestamp} - $message" | tee -a "$LOG_FILE" ;;
        "WARN")  echo -e "${YELLOW}[WARN]${NC} ${timestamp} - $message" | tee -a "$LOG_FILE" ;;
        "ERROR") echo -e "${RED}[ERROR]${NC} ${timestamp} - $message" | tee -a "$LOG_FILE" ;;
        "SUCCESS") echo -e "${GREEN}[SUCCESS]${NC} ${timestamp} - $message" | tee -a "$LOG_FILE" ;;
    esac
}

check_dependencies() {
    log "INFO" "Checking system dependencies..."
    
    local deps=("node" "npm" "docker" "docker-compose" "git")
    local missing_deps=()
    
    for dep in "${deps[@]}"; do
        if ! command -v "$dep" &> /dev/null; then
            missing_deps+=("$dep")
        fi
    done
    
    if [ ${#missing_deps[@]} -ne 0 ]; then
        log "ERROR" "Missing dependencies: ${missing_deps[*]}"
        exit 1
    fi
    
    log "SUCCESS" "All dependencies are available"
}

setup_directories() {
    log "INFO" "Setting up test directories..."
    
    mkdir -p "$REPORTS_DIR"/{junit,coverage,performance,security}
    mkdir -p "$COVERAGE_DIR"/{unit,integration,overall}
    mkdir -p "${PROJECT_ROOT}/logs"
    
    log "SUCCESS" "Test directories created"
}

setup_environment() {
    log "INFO" "Setting up test environment..."
    
    # Load environment variables
    if [ -f "${PROJECT_ROOT}/.env.test" ]; then
        set -a
        source "${PROJECT_ROOT}/.env.test"
        set +a
        log "INFO" "Loaded test environment variables"
    fi
    
    # Set Node.js memory limit for tests
    export NODE_OPTIONS="--max-old-space-size=4096"
    export NODE_ENV="test"
    
    # Disable specific features for testing
    export DISABLE_RATE_LIMITING="true"
    export DISABLE_AUTHENTICATION="false"
    export LOG_LEVEL="error"
    
    log "SUCCESS" "Test environment configured"
}

start_services() {
    log "INFO" "Starting test services..."
    
    # Check if docker-compose file exists
    if [ ! -f "${PROJECT_ROOT}/docker-compose.test.yml" ]; then
        log "WARN" "Test docker-compose file not found, creating minimal setup..."
        create_test_compose
    fi
    
    # Start services in background
    docker-compose -f "${PROJECT_ROOT}/docker-compose.test.yml" up -d
    
    # Wait for services to be healthy
    wait_for_services
    
    log "SUCCESS" "Test services are running"
}

create_test_compose() {
    cat > "${PROJECT_ROOT}/docker-compose.test.yml" << EOF
version: '3.8'
services:
  postgres-test:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: test_db
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
    ports:
      - "5433:5432"
    healthcheck:
      test: pg_isready -U test -d test_db
      interval: 5s
      timeout: 3s
      retries: 5

  redis-test:
    image: redis:7-alpine
    ports:
      - "6380:6379"
    healthcheck:
      test: redis-cli ping
      interval: 5s
      timeout: 3s
      retries: 5

  ldap-test:
    image: osixia/openldap:1.5.0
    environment:
      LDAP_ORGANISATION: "Test Company"
      LDAP_DOMAIN: "test.local"
      LDAP_ADMIN_PASSWORD: "admin"
    ports:
      - "1389:389"
    healthcheck:
      test: ldapsearch -x -H ldap://localhost -b dc=test,dc=local
      interval: 10s
      timeout: 5s
      retries: 5
EOF
}

wait_for_services() {
    log "INFO" "Waiting for services to be healthy..."
    
    local max_attempts=30
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if docker-compose -f "${PROJECT_ROOT}/docker-compose.test.yml" ps | grep -q "healthy"; then
            local healthy_count=$(docker-compose -f "${PROJECT_ROOT}/docker-compose.test.yml" ps | grep -c "healthy" || true)
            local total_services=3
            
            if [ "$healthy_count" -eq "$total_services" ]; then
                log "SUCCESS" "All services are healthy"
                return 0
            fi
        fi
        
        attempt=$((attempt + 1))
        log "INFO" "Waiting for services... (attempt $attempt/$max_attempts)"
        sleep 5
    done
    
    log "ERROR" "Services failed to become healthy"
    docker-compose -f "${PROJECT_ROOT}/docker-compose.test.yml" logs
    exit 1
}

run_unit_tests() {
    log "INFO" "Running unit tests..."
    
    local start_time=$(date +%s)
    
    if npm run test:unit -- --coverage --coverageDirectory="$COVERAGE_DIR/unit" \
        --coverageReporters=text,lcov,cobertura,json \
        --reporters=default,jest-junit \
        --outputFile="$REPORTS_DIR/junit/unit-tests.xml"; then
        
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        
        log "SUCCESS" "Unit tests completed in ${duration}s"
        
        # Check coverage threshold
        check_coverage_threshold "$COVERAGE_DIR/unit/coverage-summary.json" "$UNIT_COVERAGE_THRESHOLD" "unit"
        
        return 0
    else
        log "ERROR" "Unit tests failed"
        return 1
    fi
}

run_integration_tests() {
    log "INFO" "Running integration tests..."
    
    local start_time=$(date +%s)
    
    # Ensure database is migrated
    npm run migrate
    
    if npm run test:integration -- --coverage --coverageDirectory="$COVERAGE_DIR/integration" \
        --coverageReporters=text,lcov,cobertura,json \
        --reporters=default,jest-junit \
        --outputFile="$REPORTS_DIR/junit/integration-tests.xml" \
        --maxWorkers=2; then
        
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        
        log "SUCCESS" "Integration tests completed in ${duration}s"
        
        # Check coverage threshold
        check_coverage_threshold "$COVERAGE_DIR/integration/coverage-summary.json" "$INTEGRATION_COVERAGE_THRESHOLD" "integration"
        
        return 0
    else
        log "ERROR" "Integration tests failed"
        return 1
    fi
}

run_performance_tests() {
    if [ "$SKIP_PERFORMANCE" = "true" ]; then
        log "INFO" "Skipping performance tests (SKIP_PERFORMANCE=true)"
        return 0
    fi
    
    # Only run performance tests on main branches or when explicitly requested
    if [[ ! "$BRANCH_NAME" =~ ^(main|master|develop)$ ]] && [ -z "${FORCE_PERFORMANCE:-}" ]; then
        log "INFO" "Skipping performance tests for branch: $BRANCH_NAME"
        return 0
    fi
    
    log "INFO" "Running performance tests..."
    
    local start_time=$(date +%s)
    
    # Enable garbage collection for memory testing
    export NODE_OPTIONS="$NODE_OPTIONS --expose-gc"
    
    if npm run test:performance -- --reporters=default,jest-junit \
        --outputFile="$REPORTS_DIR/junit/performance-tests.xml" \
        --maxWorkers=1 \
        --testTimeout=300000; then
        
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        
        log "SUCCESS" "Performance tests completed in ${duration}s"
        
        # Analyze performance results
        analyze_performance_results
        
        return 0
    else
        log "ERROR" "Performance tests failed"
        return 1
    fi
}

run_security_tests() {
    if [ "$SKIP_SECURITY" = "true" ]; then
        log "INFO" "Skipping security tests (SKIP_SECURITY=true)"
        return 0
    fi
    
    log "INFO" "Running security tests..."
    
    local start_time=$(date +%s)
    
    # Run dependency audit
    log "INFO" "Running dependency security audit..."
    if npm audit --audit-level=moderate --json > "$REPORTS_DIR/security/npm-audit.json"; then
        log "SUCCESS" "No high/critical vulnerabilities found in dependencies"
    else
        log "WARN" "Vulnerabilities found in dependencies, check report"
    fi
    
    # Run security-focused tests
    if npm run test:security -- --reporters=default,jest-junit \
        --outputFile="$REPORTS_DIR/junit/security-tests.xml" \
        --maxWorkers=1; then
        
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        
        log "SUCCESS" "Security tests completed in ${duration}s"
        return 0
    else
        log "ERROR" "Security tests failed"
        return 1
    fi
}

check_coverage_threshold() {
    local coverage_file="$1"
    local threshold="$2"
    local test_type="$3"
    
    if [ ! -f "$coverage_file" ]; then
        log "WARN" "Coverage file not found: $coverage_file"
        return 0
    fi
    
    local line_coverage=$(node -e "
        const coverage = require('$coverage_file');
        console.log(coverage.total.lines.pct);
    " 2>/dev/null || echo "0")
    
    local branch_coverage=$(node -e "
        const coverage = require('$coverage_file');
        console.log(coverage.total.branches.pct);
    " 2>/dev/null || echo "0")
    
    log "INFO" "$test_type coverage - Lines: ${line_coverage}%, Branches: ${branch_coverage}%"
    
    if (( $(echo "$line_coverage < $threshold" | bc -l) )); then
        log "ERROR" "$test_type line coverage ($line_coverage%) below threshold ($threshold%)"
        return 1
    fi
    
    if (( $(echo "$branch_coverage < $threshold" | bc -l) )); then
        log "ERROR" "$test_type branch coverage ($branch_coverage%) below threshold ($threshold%)"
        return 1
    fi
    
    log "SUCCESS" "$test_type coverage meets requirements"
    return 0
}

analyze_performance_results() {
    log "INFO" "Analyzing performance test results..."
    
    # Look for performance test output files
    local perf_files=($(find "$REPORTS_DIR" -name "*performance*.json" 2>/dev/null || true))
    
    if [ ${#perf_files[@]} -eq 0 ]; then
        log "WARN" "No performance test results found"
        return 0
    fi
    
    for file in "${perf_files[@]}"; do
        log "INFO" "Processing performance results from: $(basename "$file")"
        
        # Extract key metrics (this would be more sophisticated in a real implementation)
        local avg_response_time=$(grep -o '"averageResponseTime":[0-9.]*' "$file" | head -1 | cut -d':' -f2 || echo "0")
        local throughput=$(grep -o '"throughput":[0-9.]*' "$file" | head -1 | cut -d':' -f2 || echo "0")
        local error_rate=$(grep -o '"errorRate":[0-9.]*' "$file" | head -1 | cut -d':' -f2 || echo "0")
        
        log "INFO" "Performance metrics - Response time: ${avg_response_time}ms, Throughput: ${throughput} req/s, Error rate: ${error_rate}%"
        
        # Check thresholds
        if (( $(echo "$avg_response_time > $MAX_RESPONSE_TIME" | bc -l) )); then
            log "ERROR" "Average response time (${avg_response_time}ms) exceeds threshold (${MAX_RESPONSE_TIME}ms)"
            return 1
        fi
        
        if (( $(echo "$throughput < $MIN_THROUGHPUT" | bc -l) )); then
            log "ERROR" "Throughput (${throughput} req/s) below threshold (${MIN_THROUGHPUT} req/s)"
            return 1
        fi
        
        if (( $(echo "$error_rate > $MAX_ERROR_RATE" | bc -l) )); then
            log "ERROR" "Error rate (${error_rate}%) exceeds threshold (${MAX_ERROR_RATE}%)"
            return 1
        fi
    done
    
    log "SUCCESS" "Performance metrics meet requirements"
}

aggregate_coverage() {
    log "INFO" "Aggregating coverage reports..."
    
    # Merge coverage reports
    if command -v nyc &> /dev/null; then
        nyc merge "$COVERAGE_DIR" "$COVERAGE_DIR/overall/coverage.json"
        nyc report --reporter=html --reporter=cobertura --reporter=text-summary \
            --report-dir="$COVERAGE_DIR/overall" \
            --temp-dir="$COVERAGE_DIR"
        
        log "SUCCESS" "Coverage reports aggregated"
    else
        log "WARN" "NYC not available, skipping coverage aggregation"
    fi
}

generate_reports() {
    log "INFO" "Generating test reports..."
    
    # Create summary report
    cat > "$REPORTS_DIR/test-summary.md" << EOF
# Test Execution Summary

## Test Results
$(ls "$REPORTS_DIR/junit/"*.xml 2>/dev/null | wc -l) test suites executed

## Coverage Summary
- Unit Tests: $(find "$COVERAGE_DIR/unit" -name "coverage-summary.json" -exec node -e "console.log(require('{}').total.lines.pct + '% lines')" \; 2>/dev/null || echo "N/A")
- Integration Tests: $(find "$COVERAGE_DIR/integration" -name "coverage-summary.json" -exec node -e "console.log(require('{}').total.lines.pct + '% lines')" \; 2>/dev/null || echo "N/A")

## Performance Results
$([ -f "$REPORTS_DIR/performance.json" ] && echo "Performance tests completed" || echo "Performance tests skipped")

## Security Scan
$([ -f "$REPORTS_DIR/security/npm-audit.json" ] && echo "Security scan completed" || echo "Security scan skipped")

## Generated Reports
- JUnit XML: \`reports/junit/\`
- Coverage HTML: \`coverage/overall/\`
- Performance: \`reports/performance/\` 
- Security: \`reports/security/\`

Generated on: $(date)
Branch: $BRANCH_NAME
EOF
    
    log "SUCCESS" "Test summary report generated"
}

cleanup() {
    log "INFO" "Cleaning up test environment..."
    
    # Stop test services
    if [ -f "${PROJECT_ROOT}/docker-compose.test.yml" ]; then
        docker-compose -f "${PROJECT_ROOT}/docker-compose.test.yml" down -v --remove-orphans || true
    fi
    
    # Clean up temporary files
    find "$PROJECT_ROOT" -name "*.tmp" -delete 2>/dev/null || true
    
    # Archive old reports
    if [ -d "$REPORTS_DIR" ] && [ "$(ls -A "$REPORTS_DIR" 2>/dev/null)" ]; then
        local archive_name="test-reports-$(date +%Y%m%d-%H%M%S).tar.gz"
        tar -czf "${PROJECT_ROOT}/${archive_name}" -C "$REPORTS_DIR" . || true
        log "INFO" "Reports archived as: $archive_name"
    fi
    
    log "SUCCESS" "Cleanup completed"
}

main() {
    log "INFO" "Starting comprehensive test execution pipeline"
    log "INFO" "Branch: $BRANCH_NAME, Parallel jobs: $PARALLEL_JOBS"
    
    # Setup
    check_dependencies
    setup_directories
    setup_environment
    start_services
    
    local test_failures=0
    
    # Run tests in order
    if ! run_unit_tests; then
        test_failures=$((test_failures + 1))
        if [ "$FAIL_FAST" = "true" ]; then
            log "ERROR" "Stopping due to unit test failures (FAIL_FAST=true)"
            cleanup
            exit 1
        fi
    fi
    
    if ! run_integration_tests; then
        test_failures=$((test_failures + 1))
        if [ "$FAIL_FAST" = "true" ]; then
            log "ERROR" "Stopping due to integration test failures (FAIL_FAST=true)"
            cleanup
            exit 1
        fi
    fi
    
    if ! run_security_tests; then
        test_failures=$((test_failures + 1))
        if [ "$FAIL_FAST" = "true" ]; then
            log "ERROR" "Stopping due to security test failures (FAIL_FAST=true)"
            cleanup
            exit 1
        fi
    fi
    
    if ! run_performance_tests; then
        test_failures=$((test_failures + 1))
        # Performance test failures are often not blocking for PRs
        if [ "$FAIL_FAST" = "true" ] && [[ "$BRANCH_NAME" =~ ^(main|master)$ ]]; then
            log "ERROR" "Stopping due to performance test failures on main branch"
            cleanup
            exit 1
        fi
    fi
    
    # Post-processing
    aggregate_coverage
    generate_reports
    
    # Final results
    if [ $test_failures -eq 0 ]; then
        log "SUCCESS" "All tests passed successfully!"
        log "INFO" "Reports available in: $REPORTS_DIR"
    else
        log "ERROR" "$test_failures test suite(s) failed"
        log "INFO" "Check reports in: $REPORTS_DIR"
    fi
    
    # Cleanup
    cleanup
    
    # Exit with appropriate code
    exit $test_failures
}

# Trap cleanup on script exit
trap cleanup EXIT

# Run main function
main "$@"