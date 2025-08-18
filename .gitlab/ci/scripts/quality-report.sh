#!/bin/sh
# quality-report.sh - Generate comprehensive code quality report

set -eu

echo "=== CODE QUALITY REPORT ==="
echo "Generated at: $(date)"
echo ""

# Read metrics from previous jobs
FRONTEND_WARNINGS=$(cat frontend-warnings.count 2>/dev/null || echo "0")
FRONTEND_ERRORS=$(cat frontend-errors.count 2>/dev/null || echo "0")
BACKEND_WARNINGS=$(cat backend-warnings.count 2>/dev/null || echo "0")
BACKEND_ERRORS=$(cat backend-errors.count 2>/dev/null || echo "0")

echo "Frontend Analysis:"
echo "- Warnings: ${FRONTEND_WARNINGS}"
echo "- Errors: ${FRONTEND_ERRORS}"
echo ""

echo "Backend Analysis:"
echo "- Warnings: ${BACKEND_WARNINGS}"
echo "- Errors: ${BACKEND_ERRORS}"
echo ""

# Calculate totals
TOTAL_ISSUES=$((FRONTEND_WARNINGS + FRONTEND_ERRORS + BACKEND_WARNINGS + BACKEND_ERRORS))
echo "=== TECHNICAL DEBT TRACKING ==="
echo "Total Code Quality Issues: ${TOTAL_ISSUES}"

# Generate GitLab Code Quality report
cat > code-quality-report.json <<EOF
[
  {
    "description": "Frontend ESLint Warnings: ${FRONTEND_WARNINGS}",
    "fingerprint": "frontend-eslint-warnings",
    "severity": "minor",
    "location": {"path": "frontend", "lines": {"begin": 1}}
  },
  {
    "description": "Frontend ESLint Errors: ${FRONTEND_ERRORS}",
    "fingerprint": "frontend-eslint-errors",
    "severity": "major",
    "location": {"path": "frontend", "lines": {"begin": 1}}
  },
  {
    "description": "Backend ESLint Warnings: ${BACKEND_WARNINGS}",
    "fingerprint": "backend-eslint-warnings",
    "severity": "minor",
    "location": {"path": "backend", "lines": {"begin": 1}}
  },
  {
    "description": "Backend ESLint Errors: ${BACKEND_ERRORS}",
    "fingerprint": "backend-eslint-errors",
    "severity": "major",
    "location": {"path": "backend", "lines": {"begin": 1}}
  }
]
EOF

if [ "${FRONTEND_ERRORS}" -gt "0" ] || [ "${BACKEND_ERRORS}" -gt "0" ]; then
    echo ""
    echo "⚠️  CRITICAL: ESLint errors must be fixed!"
    echo "Run 'npm run lint:fix' locally to auto-fix some issues"
fi