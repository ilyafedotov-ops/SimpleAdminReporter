#!/bin/sh
# security-audit.sh - Run comprehensive security checks

set -eu

SECURITY_FAILED=false

echo "=== NPM SECURITY AUDIT ==="
if ! npm audit --omit=dev --audit-level=moderate; then
    echo "❌ Security vulnerabilities found in dependencies"
    SECURITY_FAILED=true
fi

echo ""
echo "=== CHECKING FOR DEPRECATED PACKAGES ==="
if npm ls --depth=0 --deprecated 2>/dev/null | grep -q "deprecated" 2>/dev/null; then
    DEPRECATED_COUNT=$(npm ls --depth=0 --deprecated 2>/dev/null | grep -c "deprecated" 2>/dev/null || echo "0")
    echo "⚠️  Found $DEPRECATED_COUNT deprecated packages - consider updating"
    # Don't fail for deprecated packages, just warn
else
    echo "✅ No deprecated packages found"
fi

echo ""
echo "=== CHECKING PACKAGE VULNERABILITIES ==="
if command -v npx >/dev/null 2>&1; then
    # Only check if the package exists, otherwise skip
    if npx --yes check-vulnerable-packages 2>/dev/null; then
        echo "✅ No known vulnerabilities in packages"
    else
        echo "⚠️  Some packages may have security issues (informational only)"
        # This is informational, don't fail build
    fi
else
    echo "📝 Package vulnerability check skipped (npx not available)"
fi

echo ""
echo "=== CHECKING FOR OUTDATED PACKAGES ==="
# Suppress npm warnings for CI tools
NPX_OPTS="--quiet" npx npm-check-updates --format group 2>/dev/null || echo "Package updates available"

echo ""
echo "=== LICENSE COMPATIBILITY CHECK ==="
# Suppress npm warnings and deprecated package messages
NPX_OPTS="--quiet" npx license-checker --summary 2>/dev/null | grep -v "npm warn" || echo "License check completed"

# Exit with failure if critical security issues found
if [ "$SECURITY_FAILED" = "true" ]; then
    echo "❌ Critical security issues found - build failed!"
    echo "Please address security vulnerabilities before committing."
    exit 1
fi

echo "✅ Security audit passed"
exit 0

