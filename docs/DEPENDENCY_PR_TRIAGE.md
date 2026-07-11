# Dependency PR Triage

**Last updated:** 2026-07-11
**Source:** GitHub PR list for `ilyafedotov-ops/SimpleAdminReporter` after PR #2 merge.

## Summary

Dependabot opened **20 dependency PRs** after the post-merge dependency scan.

| Category              | Count | Action                                                                     |
| --------------------- | ----: | -------------------------------------------------------------------------- |
| Clean / CI green      |    12 | Can be reviewed and merged in small batches, respecting branch protection. |
| Unstable / CI failing |     8 | Needs targeted investigation before merge.                                 |

## Clean PRs

These were reported as `mergeStateStatus: CLEAN` with green required checks at the time of this audit:

|  PR | Package                       | Area                    |
| --: | ----------------------------- | ----------------------- |
| #22 | `http-proxy-middleware`       | frontend dev dependency |
| #20 | `jsdom`                       | frontend dev dependency |
| #18 | `lucide-react`                | frontend dependency     |
| #17 | `@types/node`                 | backend dev dependency  |
| #16 | `eslint`                      | backend dev dependency  |
| #15 | `eslint-plugin-react-refresh` | frontend dev dependency |
| #12 | `@types/nodemailer`           | backend dev dependency  |
| #10 | `redis`                       | backend dependency      |
|  #8 | `tough-cookie`                | backend dev dependency  |
|  #5 | `@azure/msal-node`            | backend dependency      |
|  #4 | `lint-staged`                 | root dev dependency     |
|  #3 | `axios-cookiejar-support`     | backend dev dependency  |

## Failing / unstable PRs

These had at least one failing required job and must not be merged until fixed:

|  PR | Package                     | Failing job observed | Notes                                                                           |
| --: | --------------------------- | -------------------- | ------------------------------------------------------------------------------- |
| #21 | `@azure/msal-react`         | `build-frontend`     | Major React/MSAL integration update; likely API/type changes.                   |
| #19 | `eslint-plugin-react-hooks` | `build-frontend`     | Lint/plugin major update; inspect frontend build logs.                          |
| #14 | `pdfkit`                    | `test-backend`       | Backend test failure; likely PDF/export behavior or typings changed.            |
| #13 | `@vitest/coverage-v8`       | `build-frontend`     | Vitest major tooling update.                                                    |
| #11 | `vitest`                    | `build-frontend`     | Vitest major update; should be grouped with #13 if compatible.                  |
|  #9 | `vite`                      | `build-frontend`     | Major Vite update; inspect build and plugin compatibility.                      |
|  #7 | `typescript`                | `build-backend`      | TypeScript 7 preview/major; high-risk, do not batch with other backend changes. |
|  #6 | `@eslint/js`                | `build-frontend`     | ESLint major update; may need config migration.                                 |

## Recommended merge order

1. Merge clean low-risk dev/test dependency PRs one at a time or in tiny batches:
   - #12, #15, #17, #20, #22
2. Merge clean runtime dependencies with extra smoke checks:
   - #3, #5, #8, #10, #18
3. Investigate unstable PRs individually using failing Actions logs and local reproduction.
4. Treat toolchain major updates as separate workstreams:
   - frontend Vite/Vitest/ESLint group: #6, #9, #11, #13, #19
   - backend TypeScript: #7
   - backend PDF/export: #14

## Rules

- Do **not** use admin bypass or skip branch protection.
- Do **not** merge unstable Dependabot PRs just because they are automated.
- For every failing PR: reproduce the failing job locally, fix root cause, push to the PR branch, then wait for GitHub checks.
- Keep commits small: CI/config fixes, security fixes, documentation updates, and dependency-specific fixes should remain separate.
