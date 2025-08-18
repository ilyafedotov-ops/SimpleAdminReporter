# CI/CD Pipeline Guide

## Overview

This document describes the GitLab CI/CD pipeline configuration for the SimpleAdminReporter project. The pipeline has been refactored to use a modular structure with reusable templates and scripts.

## Pipeline Architecture

### Directory Structure
```
.gitlab/
├── ci/
│   ├── scripts/
│   │   ├── lint-check.sh        # ESLint execution with metrics collection
│   │   ├── quality-report.sh    # Code quality report generation
│   │   └── security-audit.sh    # Security vulnerability scanning
│   └── templates/
│       ├── node-build.yml       # Reusable Node.js build configuration
│       └── test-template.yml    # Reusable test execution template
```

### Pipeline Stages

1. **validate** - Commit message and branch naming validation
2. **build** - Code compilation, linting, and type checking
3. **test** - Unit and integration tests with coverage
4. **security** - Dependency audits and vulnerability scanning
5. **report** - Code quality metrics and artifact monitoring

## Key Features

### 1. Shell Compatibility
All scripts are POSIX-compliant to work with Alpine Linux's `sh` shell:
```bash
#!/bin/sh
# Not #!/bin/bash
```

For bash-specific syntax, we install bash first:
```yaml
before_script:
  - apk add --no-cache bash
```

### 2. Artifact Optimization
To prevent GitLab artifact size limit errors:
- Exclude source maps (`*.map`)
- Exclude TypeScript declarations (`*.d.ts`)
- Remove HTML coverage reports
- Enable FastZip compression

```yaml
artifacts:
  paths:
    - backend/dist/
  exclude:
    - backend/dist/**/*.map
    - backend/dist/**/*.d.ts
```

### 3. ESLint Warning Handling
The pipeline continues on warnings while tracking technical debt:
```bash
npm run lint || echo "Lint warnings found - continuing..."
```

Warning counts are saved for monitoring:
```bash
WARNINGS=$(grep -c "warning" lint-results.txt || echo "0")
echo "$WARNINGS" > "${COMPONENT}-warnings.count"
```

### 4. Coverage Thresholds
Enforced minimums:
- Branches: 50%
- Functions: 50%  
- Lines: 60%
- Statements: 60%

### 5. Parallel Execution
Frontend and backend jobs run concurrently using the `needs` keyword.

## Reusable Templates

### Node Build Template
```yaml
.node_build_template:
  image: node:${NODE_VERSION}-alpine
  cache:
    key: ${CI_COMMIT_REF_SLUG}-${COMPONENT}-node
    paths:
      - .npm/
      - ${COMPONENT}/node_modules/
  before_script:
    - cd ${COMPONENT}
    - npm ci --prefer-offline
```

### Test Template
```yaml
.test_template:
  image: node:${NODE_VERSION}-alpine
  coverage: '/Lines\s*:\s*(\d+\.\d+)%/'
  artifacts:
    reports:
      coverage_report:
        coverage_format: cobertura
        path: ${COMPONENT}/coverage/cobertura-coverage.xml
```

## Script Files

### lint-check.sh
Executes ESLint and collects metrics:
- Counts warnings and errors separately
- Saves results for reporting
- Continues on warnings

### quality-report.sh
Generates GitLab code quality report:
- Converts ESLint output to GitLab format
- Tracks warning trends
- Creates JSON report for GitLab UI

### security-audit.sh
Performs security scanning:
- npm audit for dependencies
- License compliance checks
- Deprecated package detection

## Common Issues and Solutions

### 1. Shell Syntax Errors
**Problem**: `syntax error: unexpected "(" (expecting "then")`
**Solution**: Use POSIX-compliant syntax or install bash

### 2. Artifact Size Limits
**Problem**: `ERROR: Uploading artifacts to coordinator... too large archive`
**Solution**: Exclude unnecessary files and enable compression

### 3. Coverage Failures
**Problem**: Tests fail due to coverage thresholds
**Solution**: Either improve test coverage or adjust thresholds

### 4. Alpine Linux Issues
**Problem**: Command not found errors
**Solution**: Install required packages with `apk add`

## Local Testing

Test pipeline jobs locally:
```bash
# Install gitlab-runner
gitlab-runner exec docker validate:commits
gitlab-runner exec docker build:backend
gitlab-runner exec docker test:frontend
```

## Monitoring and Metrics

### Code Quality Tracking
- ESLint warning/error counts per build
- Coverage trend analysis
- Artifact size monitoring

### Pipeline Performance
- Job duration tracking
- Cache hit rates
- Parallel execution efficiency

## Best Practices

1. **Always use POSIX shell syntax** in scripts
2. **Exclude build artifacts** that aren't needed
3. **Run tests in parallel** when possible
4. **Cache dependencies** aggressively
5. **Monitor artifact sizes** to stay under limits
6. **Track technical debt** through warning counts
7. **Use reusable templates** for consistency

## Future Improvements

1. Add deployment stages for staging/production
2. Implement automatic rollback capabilities
3. Add performance testing stage
4. Integrate with monitoring tools
