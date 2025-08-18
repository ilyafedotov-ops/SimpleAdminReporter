#!/bin/bash

# SimpleAdminReporter Test Runner Script
# This script manages different test scenarios for the backend

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test environment setup
export NODE_ENV=test
export TEST_TYPE=integration

# Function to print colored output
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check prerequisites
check_prerequisites() {
    print_info "Checking prerequisites..."
    
    # Check if PostgreSQL is running
    if ! pg_isready -h localhost -p 5432 > /dev/null 2>&1; then
        print_error "PostgreSQL is not running on localhost:5432"
        print_info "Please start PostgreSQL before running tests"
        exit 1
    fi
    
    # Check if Redis is running
    if ! redis-cli ping > /dev/null 2>&1; then
        print_warning "Redis is not running. Some tests may fail."
    fi
    
    # Check if .env.test exists
    if [ ! -f ".env.test" ]; then
        print_error ".env.test file not found"
        print_info "Creating default .env.test file..."
        cp .env.test.example .env.test 2>/dev/null || print_warning "Could not create .env.test from example"
    fi
    
    print_success "Prerequisites check complete"
}

# Function to setup test database
setup_test_db() {
    print_info "Setting up test database..."
    
    # Load environment variables
    source .env.test
    
    # Create test database if it doesn't exist
    psql -h localhost -U postgres -tc "SELECT 1 FROM pg_database WHERE datname = 'simpleadminreporter_test'" | grep -q 1 || \
    psql -h localhost -U postgres -c "CREATE DATABASE simpleadminreporter_test"
    
    print_success "Test database ready"
}

# Function to run unit tests
run_unit_tests() {
    print_info "Running unit tests..."
    export TEST_TYPE=unit
    npm run test -- --testPathPattern="\.test\.ts$" --testPathIgnorePatterns="integration\.test\.ts"
}

# Function to run integration tests
run_integration_tests() {
    print_info "Running integration tests..."
    export TEST_TYPE=integration
    npm run test -- --testPathPattern="integration\.test\.ts$"
}

# Function to run all tests
run_all_tests() {
    print_info "Running all tests..."
    npm run test
}

# Function to run tests with coverage
run_coverage() {
    print_info "Running tests with coverage..."
    npm run test:coverage
}

# Function to run specific test file
run_specific_test() {
    local test_file=$1
    print_info "Running specific test: $test_file"
    npm run test -- "$test_file"
}

# Function to clean test artifacts
clean_test_artifacts() {
    print_info "Cleaning test artifacts..."
    rm -rf coverage/
    rm -f junit.xml
    print_success "Test artifacts cleaned"
}

# Main script logic
main() {
    case "$1" in
        "unit")
            check_prerequisites
            run_unit_tests
            ;;
        "integration")
            check_prerequisites
            setup_test_db
            run_integration_tests
            ;;
        "all")
            check_prerequisites
            setup_test_db
            run_all_tests
            ;;
        "coverage")
            check_prerequisites
            setup_test_db
            run_coverage
            ;;
        "specific")
            if [ -z "$2" ]; then
                print_error "Please provide a test file path"
                exit 1
            fi
            check_prerequisites
            setup_test_db
            run_specific_test "$2"
            ;;
        "clean")
            clean_test_artifacts
            ;;
        "setup")
            check_prerequisites
            setup_test_db
            ;;
        *)
            echo "SimpleAdminReporter Test Runner"
            echo ""
            echo "Usage: $0 [command]"
            echo ""
            echo "Commands:"
            echo "  unit        Run unit tests only"
            echo "  integration Run integration tests only"
            echo "  all         Run all tests"
            echo "  coverage    Run tests with coverage report"
            echo "  specific    Run specific test file (provide path as second argument)"
            echo "  clean       Clean test artifacts"
            echo "  setup       Setup test environment only"
            echo ""
            echo "Examples:"
            echo "  $0 unit"
            echo "  $0 integration"
            echo "  $0 specific src/services/query/QueryService.test.ts"
            echo "  $0 coverage"
            ;;
    esac
}

# Run main function
main "$@"