#!/bin/bash

# Security Testing Script for CI/CD Pipeline
# Runs comprehensive security tests and generates reports

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$PROJECT_ROOT/backend"
REPORTS_DIR="$PROJECT_ROOT/security-reports"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if Docker is running
    if ! docker info > /dev/null 2>&1; then
        log_error "Docker is not running. Please start Docker and try again."
        exit 1
    fi
    
    # Check if Node.js is available
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed or not in PATH"
        exit 1
    fi
    
    # Check if npm is available
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed or not in PATH"
        exit 1
    fi
    
    # Check if we're in the right directory
    if [[ ! -f "$PROJECT_ROOT/docker-compose.yml" ]]; then
        log_error "docker-compose.yml not found. Please run this script from the project root."
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Start the application stack
start_application() {
    log_info "Starting application stack..."
    
    cd "$PROJECT_ROOT"
    
    # Stop any existing containers
    docker-compose down -v > /dev/null 2>&1 || true
    
    # Build and start services
    docker-compose up -d --build
    
    # Wait for services to be ready
    log_info "Waiting for services to be ready..."
    sleep 30
    
    # Health check
    local max_attempts=30
    local attempt=1
    
    while [[ $attempt -le $max_attempts ]]; do
        if curl -f http://localhost/api/health > /dev/null 2>&1; then
            log_success "Application is ready"
            return 0
        fi
        
        log_info "Attempt $attempt/$max_attempts - Waiting for application..."
        sleep 10
        ((attempt++))
    done
    
    log_error "Application failed to start within timeout"
    docker-compose logs
    exit 1
}

# Run static security analysis
run_static_analysis() {
    log_info "Running static security analysis..."
    
    cd "$BACKEND_DIR"
    
    # Install dependencies if needed
    if [[ ! -d "node_modules" ]]; then
        npm install
    fi
    
    # Run ESLint security rules
    log_info "Running ESLint security checks..."
    npm run lint -- --format=json > "$REPORTS_DIR/eslint-security-$TIMESTAMP.json" 2>/dev/null || true
    
    # Run audit for known vulnerabilities
    log_info "Running npm audit..."
    npm audit --json > "$REPORTS_DIR/npm-audit-$TIMESTAMP.json" 2>/dev/null || true
    
    # Check for hardcoded secrets (if available)
    if command -v gitleaks &> /dev/null; then
        log_info "Running Gitleaks for secret detection..."
        gitleaks detect --source="$PROJECT_ROOT" --report-format=json --report-path="$REPORTS_DIR/gitleaks-$TIMESTAMP.json" --no-git || true
    else
        log_warning "Gitleaks not found, skipping secret detection"
    fi
    
    # Check for insecure dependencies
    if command -v safety &> /dev/null; then
        log_info "Running safety check..."
        safety check --json --output="$REPORTS_DIR/safety-$TIMESTAMP.json" || true
    fi
    
    log_success "Static analysis completed"
}

# Run dynamic security tests
run_dynamic_tests() {
    log_info "Running dynamic security tests..."
    
    cd "$BACKEND_DIR"
    
    # Run comprehensive security test suite
    log_info "Running comprehensive security test suite..."
    npm test -- --testPathPattern="security" --json --outputFile="$REPORTS_DIR/security-tests-$TIMESTAMP.json" || true
    
    # Run automated security scanner
    log_info "Running automated security scanner..."
    npm run test:security-scan > "$REPORTS_DIR/security-scan-$TIMESTAMP.log" 2>&1 || true
    
    # Run OWASP ZAP scan if available
    if command -v zap-baseline.py &> /dev/null; then
        log_info "Running OWASP ZAP baseline scan..."
        zap-baseline.py -t http://localhost -J "$REPORTS_DIR/zap-baseline-$TIMESTAMP.json" || true
    else
        log_warning "OWASP ZAP not found, skipping web application security scan"
    fi
    
    log_success "Dynamic tests completed"
}

# Run infrastructure security checks
run_infrastructure_checks() {
    log_info "Running infrastructure security checks..."
    
    cd "$PROJECT_ROOT"
    
    # Check Docker security
    log_info "Checking Docker security configuration..."
    
    # Scan Docker images for vulnerabilities (if available)
    if command -v trivy &> /dev/null; then
        log_info "Scanning Docker images with Trivy..."
        docker images --format "table {{.Repository}}:{{.Tag}}" | grep -v REPOSITORY | while read image; do
            trivy image --format json --output "$REPORTS_DIR/trivy-$(echo $image | tr '/:' '_')-$TIMESTAMP.json" "$image" || true
        done
    else
        log_warning "Trivy not found, skipping Docker image vulnerability scan"
    fi
    
    # Check docker-compose security
    log_info "Checking docker-compose configuration..."
    python3 -c "
import yaml
import json
import sys

try:
    with open('docker-compose.yml', 'r') as f:
        compose = yaml.safe_load(f)
    
    security_issues = []
    
    for service_name, service in compose.get('services', {}).items():
        # Check for privileged containers
        if service.get('privileged'):
            security_issues.append(f'{service_name}: Running in privileged mode')
        
        # Check for exposed ports
        ports = service.get('ports', [])
        for port in ports:
            if isinstance(port, str) and ':' in port:
                host_port = port.split(':')[0]
                if host_port in ['22', '3389', '5432', '6379', '27017']:
                    security_issues.append(f'{service_name}: Exposing sensitive port {host_port}')
        
        # Check for volume mounts
        volumes = service.get('volumes', [])
        for volume in volumes:
            if isinstance(volume, str) and volume.startswith('/'):
                if ':/etc' in volume or ':/var' in volume:
                    security_issues.append(f'{service_name}: Mounting sensitive system directory')
    
    result = {
        'timestamp': '$TIMESTAMP',
        'security_issues': security_issues,
        'total_issues': len(security_issues)
    }
    
    with open('$REPORTS_DIR/docker-compose-security-$TIMESTAMP.json', 'w') as f:
        json.dump(result, f, indent=2)
        
except Exception as e:
    print(f'Error analyzing docker-compose.yml: {e}', file=sys.stderr)
" || log_warning "Failed to analyze docker-compose configuration"
    
    log_success "Infrastructure checks completed"
}

# Generate consolidated report
generate_report() {
    log_info "Generating consolidated security report..."
    
    mkdir -p "$REPORTS_DIR"
    
    # Create HTML report
    cat > "$REPORTS_DIR/security-report-$TIMESTAMP.html" << EOF
<!DOCTYPE html>
<html>
<head>
    <title>Security Assessment Report - $TIMESTAMP</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f0f0f0; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
        .section { margin-bottom: 30px; border: 1px solid #ddd; border-radius: 5px; overflow: hidden; }
        .section-header { background: #e0e0e0; padding: 15px; font-weight: bold; }
        .section-content { padding: 15px; }
        .critical { color: #d32f2f; font-weight: bold; }
        .high { color: #f57c00; font-weight: bold; }
        .medium { color: #fbc02d; font-weight: bold; }
        .low { color: #388e3c; font-weight: bold; }
        .pass { color: #4caf50; }
        .fail { color: #f44336; }
        pre { background: #f5f5f5; padding: 10px; border-radius: 3px; overflow-x: auto; }
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; }
        .summary-card { background: #f9f9f9; padding: 15px; border-radius: 5px; text-align: center; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Security Assessment Report</h1>
        <p><strong>Generated:</strong> $(date)</p>
        <p><strong>Target:</strong> AD/Azure AD/O365 Reporting Application</p>
        <p><strong>Version:</strong> $(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')</p>
    </div>
    
    <div class="summary-grid">
        <div class="summary-card">
            <h3>Static Analysis</h3>
            <p>ESLint, npm audit, secret detection</p>
        </div>
        <div class="summary-card">
            <h3>Dynamic Testing</h3>
            <p>Security test suites, automated scanner</p>
        </div>
        <div class="summary-card">
            <h3>Infrastructure</h3>
            <p>Docker security, configuration review</p>
        </div>
    </div>
    
    <div class="section">
        <div class="section-header">Test Results Summary</div>
        <div class="section-content">
            <p>Security testing completed at $(date)</p>
            <p>Report files generated in: $REPORTS_DIR</p>
            <p>Review individual report files for detailed findings.</p>
        </div>
    </div>
    
    <div class="section">
        <div class="section-header">Recommendations</div>
        <div class="section-content">
            <ul>
                <li>Review all CRITICAL and HIGH severity findings immediately</li>
                <li>Implement automated security testing in CI/CD pipeline</li>
                <li>Regular security assessments should be conducted</li>
                <li>Monitor for new vulnerabilities in dependencies</li>
                <li>Keep all security tools and scanning tools updated</li>
            </ul>
        </div>
    </div>
    
    <div class="section">
        <div class="section-header">Report Files</div>
        <div class="section-content">
            <ul>
EOF

    # List all generated report files
    find "$REPORTS_DIR" -name "*$TIMESTAMP*" -type f | while read file; do
        basename_file=$(basename "$file")
        echo "                <li><a href=\"$basename_file\">$basename_file</a></li>" >> "$REPORTS_DIR/security-report-$TIMESTAMP.html"
    done

    cat >> "$REPORTS_DIR/security-report-$TIMESTAMP.html" << EOF
            </ul>
        </div>
    </div>
</body>
</html>
EOF

    log_success "Consolidated report generated: $REPORTS_DIR/security-report-$TIMESTAMP.html"
}

# Analyze results and set exit code
analyze_results() {
    log_info "Analyzing security test results..."
    
    local exit_code=0
    local critical_issues=0
    local high_issues=0
    
    # Check npm audit results
    if [[ -f "$REPORTS_DIR/npm-audit-$TIMESTAMP.json" ]]; then
        critical_issues=$( (jq '.metadata.vulnerabilities.critical // 0' "$REPORTS_DIR/npm-audit-$TIMESTAMP.json" 2>/dev/null) || echo 0)
        high_issues=$( (jq '.metadata.vulnerabilities.high // 0' "$REPORTS_DIR/npm-audit-$TIMESTAMP.json" 2>/dev/null) || echo 0)
    fi
    
    # Check security test results
    if [[ -f "$REPORTS_DIR/security-tests-$TIMESTAMP.json" ]]; then
        local test_failures=$( (jq '.numFailedTests // 0' "$REPORTS_DIR/security-tests-$TIMESTAMP.json" 2>/dev/null) || echo 0)
        if [[ $test_failures -gt 0 ]]; then
            log_error "Security tests failed: $test_failures failures"
            exit_code=1
        fi
    fi
    
    # Summary
    log_info "Security Assessment Summary:"
    log_info "  Critical vulnerabilities: $critical_issues"
    log_info "  High vulnerabilities: $high_issues"
    
    if [[ $critical_issues -gt 0 ]]; then
        log_error "CRITICAL security issues found! Build should fail."
        exit_code=1
    elif [[ $high_issues -gt 0 ]]; then
        log_warning "HIGH severity security issues found. Review recommended."
        # Don't fail build for high issues in this example, but you might want to
    fi
    
    return $exit_code
}

# Cleanup function
cleanup() {
    log_info "Cleaning up..."
    cd "$PROJECT_ROOT"
    docker-compose down -v > /dev/null 2>&1 || true
}

# Main execution
main() {
    log_info "Starting security testing pipeline..."
    
    # Create reports directory
    mkdir -p "$REPORTS_DIR"
    
    # Set trap for cleanup
    trap cleanup EXIT
    
    # Run security testing pipeline
    check_prerequisites
    start_application
    run_static_analysis
    run_dynamic_tests
    run_infrastructure_checks
    generate_report
    
    # Analyze results and set appropriate exit code
    if analyze_results; then
        log_success "Security testing completed successfully"
        exit 0
    else
        log_error "Security testing found critical issues"
        exit 1
    fi
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --no-docker)
            NO_DOCKER=1
            shift
            ;;
        --reports-dir)
            REPORTS_DIR="$2"
            shift 2
            ;;
        --help|-h)
            echo "Security Testing Script"
            echo ""
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --no-docker         Skip Docker-related tests"
            echo "  --reports-dir DIR   Specify custom reports directory"
            echo "  --help, -h          Show this help message"
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Run main function
main "$@"