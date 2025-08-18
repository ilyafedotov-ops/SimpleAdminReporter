# CI/CD Scripts Reference

This document provides detailed information about the modular CI/CD scripts used in the GitLab pipeline.

## Script Overview

All scripts are located in `.gitlab/ci/scripts/` and are designed to be:
- POSIX-compliant (work with `sh` shell)
- Reusable across different pipeline jobs
- Exit with proper status codes
- Generate metrics for monitoring

## lint-check.sh

**Purpose**: Execute ESLint and collect code quality metrics

**Location**: `.gitlab/ci/scripts/lint-check.sh`

**Usage**:
```bash
./lint-check.sh [backend|frontend]
```

**Features**:
- Runs ESLint with project-specific configuration
- Counts warnings and errors separately
- Saves metrics to `{component}-warnings.count` and `{component}-errors.count`
- Continues execution on warnings (exit 0)
- Fails on errors (exit 1)

**Example**:
```yaml
script:
  - chmod +x ../.gitlab/ci/scripts/lint-check.sh
  - ../.gitlab/ci/scripts/lint-check.sh backend
```

**Output Files**:
- `backend-lint-results.txt` - Full ESLint output
- `backend-warnings.count` - Number of warnings
- `backend-errors.count` - Number of errors

## quality-report.sh

**Purpose**: Generate GitLab-compatible code quality reports

**Location**: `.gitlab/ci/scripts/quality-report.sh`

**Usage**:
```bash
./quality-report.sh
```

**Features**:
- Reads warning/error counts from lint-check.sh output
- Generates JSON in GitLab Code Quality format
- Tracks both frontend and backend metrics
- Creates artifact for GitLab merge request UI

**Output**:
```json
[
  {
    "description": "ESLint warnings in backend",
    "severity": "minor",
    "fingerprint": "backend-eslint-warnings",
    "location": { "path": "backend", "lines": { "begin": 1 } }
  }
]
```

## security-audit.sh

**Purpose**: Perform security vulnerability scanning

**Location**: `.gitlab/ci/scripts/security-audit.sh`

**Usage**:
```bash
./security-audit.sh
```

**Features**:
- Runs `npm audit` with configurable severity level
- Checks for deprecated packages
- Identifies packages with known vulnerabilities
- Generates security report

**Checks Performed**:
1. **NPM Audit**: Production dependencies only, moderate+ severity
2. **Deprecated Packages**: Lists any deprecated dependencies
3. **License Compliance**: Summarizes package licenses
4. **Vulnerability Database**: Cross-references with known CVEs

## Template Files

### node-build.yml

**Purpose**: Reusable Node.js build configuration

**Location**: `.gitlab/ci/templates/node-build.yml`

**Usage**:
```yaml
build:backend:
  extends: .node_build_template
  variables:
    COMPONENT: backend
```

**Features**:
- Configurable Node.js version via `NODE_VERSION`
- Intelligent caching strategy
- npm ci for reproducible builds
- Working directory management

### test-template.yml

**Purpose**: Standardized test execution template

**Location**: `.gitlab/ci/templates/test-template.yml`

**Usage**:
```yaml
test:frontend:
  extends: .test_template
  variables:
    COMPONENT: frontend
```

**Features**:
- Coverage report generation
- Multiple report formats (text, cobertura)
- GitLab integration for MR coverage display
- Artifact management

## Writing New Scripts

### Guidelines

1. **Use POSIX Shell**:
   ```bash
   #!/bin/sh
   # Not #!/bin/bash
   ```

2. **Set Error Handling**:
   ```bash
   set -eu
   ```

3. **Accept Parameters**:
   ```bash
   COMPONENT=${1:-backend}
   ```

4. **Generate Metrics**:
   ```bash
   echo "$COUNT" > metrics.txt
   ```

5. **Exit Codes**:
   - 0: Success
   - 1: Error
   - 2: Warning (if needed)

### Example Template

```bash
#!/bin/sh
# script-name.sh - Brief description
set -eu

# Configuration
COMPONENT=${1:-backend}
OUTPUT_FILE="${COMPONENT}-results.txt"

# Main logic
echo "Processing $COMPONENT..."

# Error handling
if [ ! -f "package.json" ]; then
    echo "ERROR: package.json not found"
    exit 1
fi

# Generate output
echo "Results" > "$OUTPUT_FILE"

# Exit successfully
exit 0
```

## Integration with GitLab

### Artifact Collection
Scripts should output files that can be collected as artifacts:
```yaml
artifacts:
  paths:
    - "*-warnings.count"
    - "*-errors.count"
    - "code-quality-report.json"
```

### Report Integration
Use GitLab's report features:
```yaml
artifacts:
  reports:
    codequality: code-quality-report.json
    junit: test-results.xml
```

### Metrics Display
Metrics can be displayed in merge requests:
- Code coverage percentage
- Code quality issues
- Security vulnerabilities

## Troubleshooting

### Script Not Executable
```bash
chmod +x script-name.sh
```

### Alpine Linux Compatibility
```bash
# If script needs bash
apk add --no-cache bash
```

### Path Issues
```bash
# Always use relative paths
cd "$CI_PROJECT_DIR"
```

### Missing Commands
```bash
# Install required tools
apk add --no-cache git curl jq
```