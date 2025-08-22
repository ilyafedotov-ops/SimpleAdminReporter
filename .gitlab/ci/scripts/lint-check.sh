#!/bin/sh
# lint-check.sh - Run ESLint and collect metrics

set -eu

COMPONENT=${1:-backend}
RESULTS_FILE="${COMPONENT}-lint-results.txt"

echo "=== Running ESLint for ${COMPONENT} ==="

# Run lint from component directory using local npm scripts
RESULTS_PATH="${RESULTS_FILE}"
COUNTS_PREFIX=""

# Run lint and capture output - use component-specific script in component directory
if [ "${COMPONENT}" = "backend" ]; then
    npm run lint 2>&1 | tee "${RESULTS_PATH}" || LINT_FAILED=true
else
    npm run lint 2>&1 | tee "${RESULTS_PATH}" || LINT_FAILED=true
fi

# Count warnings and errors
WARNINGS=$(grep -c "warning" "${RESULTS_PATH}" || echo "0")
ERRORS=$(grep -c "error" "${RESULTS_PATH}" || echo "0")

echo "ESLint Results for ${COMPONENT}:"
echo "- Warnings: ${WARNINGS}"
echo "- Errors: ${ERRORS}"

# Exit with appropriate code
if [ "${LINT_FAILED:-false}" = "true" ]; then
    if [ "${ERRORS}" -gt "0" ]; then
        echo "❌ ESLint errors found - build failed\!"
        echo "Please fix all ESLint errors before committing."
        exit 1  # Fail the build on errors
    fi
    # Set component-specific warning thresholds
    if [ "${COMPONENT}" = "backend" ]; then
        WARNING_THRESHOLD=10  # Backend should stay very clean
    else
        WARNING_THRESHOLD=10  # Frontend: reduced to 10 for highest code quality standards
    fi
    
    if [ "${WARNINGS}" -gt "${WARNING_THRESHOLD}" ]; then
        echo "⚠️  Too many ESLint warnings (${WARNINGS} > ${WARNING_THRESHOLD}) - build failed\!"
        echo "Please reduce warnings to below ${WARNING_THRESHOLD} before committing."
        exit 1  # Fail if warnings exceed threshold
    fi
fi

# Output metrics for later use
echo "${WARNINGS}" > "${COUNTS_PREFIX}${COMPONENT}-warnings.count"
echo "${ERRORS}" > "${COUNTS_PREFIX}${COMPONENT}-errors.count"

