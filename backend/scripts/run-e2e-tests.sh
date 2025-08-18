#!/bin/bash
#
# E2E Test Runner Shell Script
# Wrapper for the TypeScript E2E test runner
#

set -e

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Default configuration
DEFAULT_SUITES="auth,reports,api,logs"
DEFAULT_FORMAT="console"
DEFAULT_OUTPUT_DIR="./test-results/e2e"
DEFAULT_TIMEOUT="120000"

# Configuration variables
SUITES="$DEFAULT_SUITES"
FORMAT="$DEFAULT_FORMAT"
OUTPUT_DIR="$DEFAULT_OUTPUT_DIR"
TIMEOUT="$DEFAULT_TIMEOUT"
VERBOSE=true
COVERAGE=false
BAIL=true
CLEANUP=true
REPORTERS=""

# Environment setup
export NODE_ENV="test"
export TEST_TYPE="integration"

# Function to show usage
show_help() {
    cat << EOF
Usage: $0 [options] [test-pattern]

Options:
    --suites <suites>        Comma-separated list of test suites (default: $DEFAULT_SUITES)
    --format <format>        Report format: json, junit, html, console (default: $DEFAULT_FORMAT)
    --output <dir>           Output directory (default: $DEFAULT_OUTPUT_DIR)
    --timeout <ms>           Test timeout in milliseconds (default: $DEFAULT_TIMEOUT)
    --coverage               Generate code coverage report
    --no-bail                Continue on failures
    --no-cleanup             Skip test data cleanup
    --quiet                  Minimal output
    --verbose                Verbose output (default)
    --reporters <reporters>  Jest reporters (e.g., jest-junit)
    --forceExit              Force Jest to exit after tests complete
    --help                   Show this help message

Environment Variables:
    TEST_CLEANUP_AFTER_RUN   Set to 'false' to skip cleanup (CI mode)
    DATABASE_URL             Test database connection string
    REDIS_URL                Test Redis connection string
    JWT_SECRET               JWT signing secret for tests

Examples:
    $0                                    # Run all E2E tests
    $0 --suites auth,api                  # Run only auth and api tests
    $0 --format junit --output ./results  # Generate JUnit XML reports
    $0 --no-cleanup --verbose             # Debug mode with cleanup disabled
    $0 'auth.e2e.test.ts'                # Run specific test file

EOF
}

# Function to log messages
log() {
    if [[ "$VERBOSE" == "true" ]]; then
        echo "[E2E] $1" >&2
    fi
}

# Function to check dependencies
check_dependencies() {
    log "Checking dependencies..."
    
    # Check if TypeScript runner exists
    if [[ ! -f "$PROJECT_DIR/src/test/e2e/run-e2e-tests.ts" ]]; then
        echo "Error: E2E test runner not found at $PROJECT_DIR/src/test/e2e/run-e2e-tests.ts" >&2
        exit 1
    fi
    
    # Check if ts-node is available
    if ! command -v npx >/dev/null 2>&1; then
        echo "Error: npx is required but not installed" >&2
        exit 1
    fi
    
    log "Dependencies check passed"
}

# Function to setup test environment
setup_environment() {
    log "Setting up test environment..."
    
    # Create output directory
    mkdir -p "$OUTPUT_DIR"
    
    # Set environment variables based on configuration
    if [[ "$TEST_CLEANUP_AFTER_RUN" == "false" ]]; then
        CLEANUP=false
        log "Cleanup disabled via environment variable"
    fi
    
    # Export Jest configuration for JUnit reporting
    if [[ "$FORMAT" == "junit" ]] || [[ -n "$REPORTERS" ]]; then
        export JEST_JUNIT_OUTPUT_DIR="$OUTPUT_DIR"
        export JEST_JUNIT_OUTPUT_NAME="e2e-results.xml"
        log "JUnit reporting configured: $JEST_JUNIT_OUTPUT_DIR/$JEST_JUNIT_OUTPUT_NAME"
    fi
    
    log "Environment setup complete"
}

# Function to run TypeScript E2E runner
run_typescript_runner() {
    log "Running TypeScript E2E test runner..."
    
    # Build arguments for TypeScript runner
    local ts_args=()
    
    if [[ -n "$SUITES" ]]; then
        ts_args+=("--suites" "$SUITES")
    fi
    
    if [[ -n "$FORMAT" ]]; then
        ts_args+=("--format" "$FORMAT")
    fi
    
    if [[ -n "$OUTPUT_DIR" ]]; then
        ts_args+=("--output" "$OUTPUT_DIR")
    fi
    
    if [[ -n "$TIMEOUT" ]]; then
        ts_args+=("--timeout" "$TIMEOUT")
    fi
    
    if [[ "$COVERAGE" == "true" ]]; then
        ts_args+=("--coverage")
    fi
    
    if [[ "$BAIL" == "false" ]]; then
        ts_args+=("--no-bail")
    fi
    
    if [[ "$CLEANUP" == "false" ]]; then
        ts_args+=("--no-cleanup")
    fi
    
    if [[ "$VERBOSE" == "false" ]]; then
        ts_args+=("--quiet")
    fi
    
    # Change to project directory
    cd "$PROJECT_DIR"
    
    # Run the TypeScript E2E runner
    log "Executing: npx ts-node -r tsconfig-paths/register src/test/e2e/run-e2e-tests.ts ${ts_args[*]}"
    npx ts-node -r tsconfig-paths/register src/test/e2e/run-e2e-tests.ts "${ts_args[@]}"
}

# Function to run Jest directly for specific test patterns
run_jest_direct() {
    local test_pattern="$1"
    log "Running Jest directly for pattern: $test_pattern"
    
    # Build Jest arguments
    local jest_args=()
    
    if [[ -n "$test_pattern" ]]; then
        jest_args+=("--testPathPattern" "$test_pattern")
    fi
    
    jest_args+=("--testTimeout" "$TIMEOUT")
    jest_args+=("--maxWorkers" "1")  # E2E tests should run serially
    jest_args+=("--forceExit")
    jest_args+=("--detectOpenHandles")
    
    if [[ "$VERBOSE" == "true" ]]; then
        jest_args+=("--verbose")
    fi
    
    if [[ "$COVERAGE" == "true" ]]; then
        jest_args+=("--coverage")
    fi
    
    if [[ -n "$REPORTERS" ]]; then
        IFS=',' read -ra REPORTER_ARRAY <<< "$REPORTERS"
        for reporter in "${REPORTER_ARRAY[@]}"; do
            jest_args+=("--reporters" "$reporter")
        done
    fi
    
    # Add default reporter if custom reporters specified
    if [[ -n "$REPORTERS" ]]; then
        jest_args+=("--reporters" "default")
    fi
    
    # Change to project directory
    cd "$PROJECT_DIR"
    
    # Run Jest
    log "Executing: npx jest ${jest_args[*]}"
    npx jest "${jest_args[@]}"
}

# Parse command line arguments
POSITIONAL_ARGS=()
while [[ $# -gt 0 ]]; do
    case $1 in
        --suites)
            SUITES="$2"
            shift 2
            ;;
        --format)
            FORMAT="$2"
            shift 2
            ;;
        --output)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        --timeout)
            TIMEOUT="$2"
            shift 2
            ;;
        --coverage)
            COVERAGE=true
            shift
            ;;
        --no-bail)
            BAIL=false
            shift
            ;;
        --no-cleanup)
            CLEANUP=false
            shift
            ;;
        --quiet)
            VERBOSE=false
            shift
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        --reporters)
            REPORTERS="$2"
            shift 2
            ;;
        --forceExit)
            # This is handled by Jest directly
            shift
            ;;
        --help)
            show_help
            exit 0
            ;;
        -*)
            echo "Unknown option: $1" >&2
            echo "Use --help for usage information" >&2
            exit 1
            ;;
        *)
            POSITIONAL_ARGS+=("$1")
            shift
            ;;
    esac
done

# Function to create minimal JUnit XML for CI if tests fail
create_fallback_junit() {
    local exit_code=$1
    if [[ "$FORMAT" == "junit" ]] || [[ -n "$REPORTERS" ]]; then
        local junit_file="${JEST_JUNIT_OUTPUT_DIR}/${JEST_JUNIT_OUTPUT_NAME}"
        if [[ ! -f "$junit_file" ]]; then
            log "Creating fallback JUnit XML at $junit_file"
            cat > "$junit_file" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="E2E Tests" tests="0" failures="0" errors="1" time="0">
  <testsuite name="E2E Test Execution" tests="0" failures="0" errors="1" time="0">
    <testcase name="E2E Test Setup" classname="e2e">
      <error message="E2E tests failed to execute properly" type="TestSetupError">
        E2E test runner exited with code: $exit_code
        This may indicate missing dependencies, configuration issues, or test infrastructure problems.
        Check the CI logs for more details.
      </error>
    </testcase>
  </testsuite>
</testsuites>
EOF
        fi
    fi
}

# Main execution
main() {
    log "Starting E2E test execution..."
    log "Working directory: $PROJECT_DIR"
    
    # Check dependencies
    if ! check_dependencies; then
        create_fallback_junit 1
        exit 1
    fi
    
    # Setup environment
    setup_environment
    
    # Determine execution mode and run tests
    local test_exit_code=0
    if [[ ${#POSITIONAL_ARGS[@]} -gt 0 ]]; then
        # Direct Jest execution for specific test patterns
        test_pattern="${POSITIONAL_ARGS[0]}"
        log "Running specific test pattern: $test_pattern"
        run_jest_direct "$test_pattern" || test_exit_code=$?
    else
        # Use TypeScript runner for full E2E suite
        log "Running full E2E test suite"
        run_typescript_runner || test_exit_code=$?
    fi
    
    # Create fallback JUnit XML if needed
    if [[ $test_exit_code -ne 0 ]]; then
        create_fallback_junit $test_exit_code
    fi
    
    if [[ $test_exit_code -eq 0 ]]; then
        log "E2E test execution completed successfully"
    else
        log "E2E test execution completed with errors (exit code: $test_exit_code)"
    fi
    
    exit $test_exit_code
}

# Error handling
trap 'echo "Error: E2E test execution failed on line $LINENO" >&2; exit 1' ERR

# Execute main function
main "$@"