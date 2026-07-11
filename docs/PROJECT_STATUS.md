# SimpleAdminReporter - Current Project Status

**Last updated:** 2026-07-11
**Version:** 1.0.0
**Repository:** `ilyafedotov-ops/SimpleAdminReporter`
**Status:** Post-merge hardening in progress after PR #2.

## Executive summary

SimpleAdminReporter is a containerized enterprise reporting platform for Active Directory, Azure AD, and Office 365. The core application is implemented and CI is operational on GitHub Actions. PR #2 was merged after security, CI, and CodeQL checks passed, but the post-merge audit found additional follow-up work:

- open Dependabot PR backlog;
- stale documentation references to old GitLab-era workflow;
- additional CodeQL findings, including a mix of real production issues and test-only noise;
- Dependabot Docker directory misconfiguration.

A follow-up branch is being prepared to address these issues with small commits.

## Current verified baseline

| Area             | Current state                                                                                                                                             |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hosting / VCS    | GitHub repository under `ilyafedotov-ops`.                                                                                                                |
| CI               | GitHub Actions with validation, backend/frontend build, backend/frontend tests, security scan, GitGuardian, and repo-managed CodeQL.                      |
| Deployment model | Docker Compose with nginx, frontend, backend, PostgreSQL, and Redis.                                                                                      |
| Backend          | Node.js / Express / TypeScript backend with authentication, reporting, export, query validation, logs, health checks, queues, and credentials encryption. |
| Frontend         | React / TypeScript / Vite / Ant Design frontend with dashboard, reports, report builder, history, logs, health, and settings areas.                       |
| Security posture | CSRF middleware, rate limiting, encrypted credentials, audit logging, CodeQL, GitGuardian, and local gitleaks verification.                               |
| Documentation    | Partially stale; this file and `DEPENDENCY_PR_TRIAGE.md` are the refreshed source for current status.                                                     |

## Recently completed in PR #2

- Hardened CSRF middleware and mounted it consistently for cookie-authenticated unsafe methods.
- Stabilized cookie-auth/e2e test setup around CSRF behavior.
- Parameterized report query statement timeout handling.
- Replaced arbitrary validation regex compilation with an allowlisted validation pattern path.
- Added repo-managed CodeQL workflow/config and disabled GitHub CodeQL default setup to allow repository-controlled analysis.
- Fixed lint, whitespace, GitGuardian/history, and CodeQL issues until PR checks were green.
- Merged PR #2 via normal branch protection flow, without bypass.

## Post-merge follow-up branch

Branch: `fix/post-merge-security-followups`

Completed commits so far:

1. `ci: fix dependabot docker directories`
   - split Docker Dependabot directories into `/backend` and `/frontend`.
2. `fix: address post-merge security findings`
   - fixed biased secure password generation by using `crypto.randomInt`;
   - escaped Azure OAuth exception text before rendering HTML;
   - constrained export filenames and paths to the configured export directory;
   - replaced bad script-tag filtering regex with HTML escaping;
   - replaced frontend OAuth callback `innerHTML` updates with DOM/textContent updates;
   - tightened LDAP placeholder-domain matching;
   - aligned session `authSource` augmentation with the existing global session type.
3. `chore: ignore test-only codeql noise`
   - ignored test paths in CodeQL config;
   - removed stale unused `backend/src/app.cookie.ts` that CodeQL still scanned.

## Verification performed on the follow-up branch

| Command / check                                                                                                               | Result                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `cd backend && npm test -- encryption.test.ts validation.middleware.test.ts export.controller.test.ts --runInBand --no-cache` | Passed: 3 suites, 209 tests.                                             |
| `cd backend && npm run lint -- --max-warnings 0 && npm run typecheck`                                                         | Passed.                                                                  |
| `git diff --check`                                                                                                            | Passed.                                                                  |
| `gitleaks detect --no-banner --redact --verbose`                                                                              | Passed: no leaks found.                                                  |
| pre-commit hook during commits                                                                                                | Passed frontend/backend typecheck and hardening/socket regression tests. |

## Open Dependabot PR status

See [`DEPENDENCY_PR_TRIAGE.md`](DEPENDENCY_PR_TRIAGE.md) for the full table.

Current summary from the latest audit:

- **20 open Dependabot PRs**.
- **12 clean/green** and candidates for normal review/merge.
- **8 unstable/failing** and require targeted fixes before merge.

## Documentation state

### Refreshed

- `docs/PROJECT_STATUS.md`
- `docs/README.md`
- `docs/DEPENDENCY_PR_TRIAGE.md`
- root `PROJECT_STATUS.md` now points here instead of maintaining a conflicting duplicate.

### Known stale patterns still to audit

- GitLab CI/CD references in older docs.
- Old Node 18 / Vite 6 / TypeScript 5.3 references.
- Roadmaps using Q3/Q4 2025 dates.
- Feature completion percentages that predate PR #2 and the GitHub Actions/CodeQL hardening.

## Next recommended work

1. Push `fix/post-merge-security-followups` and create a PR.
2. Wait for GitHub Actions, GitGuardian, CodeQL, and Dependabot checks.
3. If CodeQL alerts remain open, separate true production issues from stale/test-only findings and fix production issues first.
4. Merge clean Dependabot PRs in small batches only after checks are green.
5. Investigate unstable Dependabot PRs one by one:
   - frontend Vite/Vitest/ESLint major update group;
   - backend TypeScript major update;
   - backend PDF/export update.
6. Continue documentation cleanup across architecture/deployment/API docs.
