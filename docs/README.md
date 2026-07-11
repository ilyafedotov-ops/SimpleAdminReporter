# SimpleAdminReporter Documentation Index

SimpleAdminReporter is a GitHub-hosted, Docker Compose based AD / Azure AD / Office 365 reporting application.

> **Status note (2026-07-11):** This documentation set has been partially refreshed after PR #2 and the post-merge security/Dependabot audit. Some deep-dive documents still contain older implementation notes; prefer the status and triage docs below when they conflict.

## Start here

| Document                                                                   | Purpose                                                     |
| -------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [`PROJECT_STATUS.md`](PROJECT_STATUS.md)                                   | Current implementation, security, CI, and open-work status. |
| [`DEPENDENCY_PR_TRIAGE.md`](DEPENDENCY_PR_TRIAGE.md)                       | Open Dependabot PR inventory and recommended merge order.   |
| [`ARCHITECTURE.md`](ARCHITECTURE.md)                                       | System architecture and component breakdown.                |
| [`API_DOCUMENTATION.md`](API_DOCUMENTATION.md)                             | REST API reference.                                         |
| [`DEPLOYMENT_GUIDE.md`](DEPLOYMENT_GUIDE.md)                               | Docker Compose deployment guidance.                         |
| [`SECURITY_TESTING_GUIDE.md`](SECURITY_TESTING_GUIDE.md)                   | Security test strategy and verification commands.           |
| [`SECRETS_MANAGEMENT_ARCHITECTURE.md`](SECRETS_MANAGEMENT_ARCHITECTURE.md) | Secret storage and operational secret handling.             |

## Current development workflow

The repository now uses GitHub and GitHub Actions, not GitLab CI.

```bash
# Install dependencies
npm ci --prefer-offline
cd backend && npm ci --prefer-offline
cd ../frontend && npm ci --prefer-offline

# Local verification
npm run type-check
npm run lint
cd backend && npm test -- encryption.test.ts validation.middleware.test.ts export.controller.test.ts --runInBand
```

## CI/CD

GitHub Actions runs validation, backend/frontend builds, backend/frontend tests, security scan, GitGuardian, and repo-managed CodeQL. Deployment/image jobs are conditional and can be skipped when their trigger conditions are not met.

## Known stale areas to keep auditing

- Older docs may still mention GitLab, `develop` branch deployment, Node 18, or Vite 6; those are stale.
- Some roadmap sections still reference Q3 2025 / Q4 2025 phases and should be re-baselined against the current GitHub state.
- Feature completion percentages in older status reports should not be treated as authoritative unless they match `PROJECT_STATUS.md`.
