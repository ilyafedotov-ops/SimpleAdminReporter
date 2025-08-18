#!/bin/bash

# Security Hooks Setup Script for SimpleAdminReporter
# Installs and configures pre-commit hooks to prevent secret leaks

set -e

echo "🔐 Setting up security hooks for SimpleAdminReporter..."

# Check if we're in the right directory
if [[ ! -f ".gitleaks.toml" ]]; then
    echo "❌ Error: .gitleaks.toml not found. Please run this script from the project root."
    exit 1
fi

# Install pre-commit if not available
if ! command -v pre-commit &> /dev/null; then
    echo "📦 Installing pre-commit..."
    if command -v pip3 &> /dev/null; then
        pip3 install pre-commit
    elif command -v pip &> /dev/null; then
        pip install pre-commit
    else
        echo "❌ Error: pip not found. Please install pip and pre-commit manually:"
        echo "   pip install pre-commit"
        exit 1
    fi
fi

# Install Gitleaks if not available
if [[ ! -f "./gitleaks" ]]; then
    echo "📦 Installing Gitleaks..."
    
    # Detect OS and architecture
    OS=$(uname -s | tr '[:upper:]' '[:lower:]')
    ARCH=$(uname -m)
    
    case $ARCH in
        x86_64) ARCH="x64" ;;
        aarch64) ARCH="arm64" ;;
        arm64) ARCH="arm64" ;;
    esac
    
    GITLEAKS_VERSION="v8.21.2"
    DOWNLOAD_URL="https://github.com/zricethezav/gitleaks/releases/download/${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION#v}_${OS}_${ARCH}.tar.gz"
    
    echo "📥 Downloading Gitleaks from: $DOWNLOAD_URL"
    curl -L "$DOWNLOAD_URL" | tar xz
    chmod +x gitleaks
    
    echo "✅ Gitleaks installed successfully"
fi

# Verify Gitleaks configuration
echo "🔍 Testing Gitleaks configuration..."
if ./gitleaks detect --config .gitleaks.toml --no-git > /dev/null 2>&1; then
    echo "✅ Gitleaks configuration is valid"
else
    echo "⚠️  Warning: Gitleaks configuration test failed, but continuing..."
fi

# Install pre-commit hooks
echo "🔗 Installing pre-commit hooks..."
pre-commit install

# Run pre-commit on all files to test setup
echo "🧪 Testing pre-commit hooks on all files..."
if pre-commit run --all-files; then
    echo "✅ All pre-commit hooks passed!"
else
    echo "⚠️  Some pre-commit hooks failed. Please review and fix the issues."
    echo "    You can skip hooks temporarily with: git commit --no-verify"
fi

# Create commit message template with security reminder
cat > .gitmessage << 'EOF'
# Commit Message Template
# 
# Subject line (50 chars max): Summary in imperative mood
#
# Body: Explain the what and why (not how), wrap at 72 chars
#
# Security Checklist:
# □ No hardcoded passwords, secrets, or API keys
# □ Test credentials use testCredentials fixture
# □ Environment variables for configuration
# □ No production data in test files
# □ Gitleaks scan passes
#
# Example commit types:
# feat: add new feature
# fix: bug fix
# docs: documentation changes
# style: formatting, missing semi colons, etc
# refactor: code change that neither fixes a bug nor adds a feature
# test: add missing tests
# chore: maintain, dependencies, build process
# security: security improvements
EOF

git config commit.template .gitmessage

# Create helpful aliases
git config alias.security-check '!./gitleaks detect --config .gitleaks.toml --verbose'
git config alias.security-scan '!./gitleaks detect --config .gitleaks.toml --report-format json --report-path security-report.json && echo "Security report generated: security-report.json"'

echo ""
echo "🎉 Security hooks setup complete!"
echo ""
echo "📋 Summary:"
echo "   ✅ Pre-commit hooks installed"
echo "   ✅ Gitleaks configured"
echo "   ✅ Commit message template created"
echo "   ✅ Git aliases added"
echo ""
echo "🔧 New Git Commands:"
echo "   git security-check    - Run Gitleaks scan"
echo "   git security-scan     - Generate security report"
echo ""
echo "⚠️  Important:"
echo "   - Hooks run automatically on commit"
echo "   - Use 'git commit --no-verify' to skip hooks (not recommended)"
echo "   - Update .gitleaks.toml if you get false positives"
echo ""
echo "🚀 You're now protected against accidental secret commits!"