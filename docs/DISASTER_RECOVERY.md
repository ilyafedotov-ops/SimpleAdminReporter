# Disaster Recovery

## Objectives

| Metric                         | Target                   |
| ------------------------------ | ------------------------ |
| RPO (Recovery Point Objective) | 24 hours (daily backups) |
| RTO (Recovery Time Objective)  | 4 hours                  |

## Backup Strategy

- Full PostgreSQL dumps via `scripts/backup.sh`
- Retention controlled by `BACKUP_RETENTION_DAYS` (default: 30)
- Weekly integrity verification via `scripts/verify-backups.sh`

Backups include audit logs and report history by default.

## Restore Procedure

1. Stop application services:

   ```bash
   docker compose down
   ```

2. Restore database:

   ```bash
   ./scripts/restore.sh /path/to/backup.sql.gz
   ```

3. Run pending migrations:

   ```bash
   cd backend && npm run migrate
   ```

4. Restart and verify:
   ```bash
   docker compose up -d
   ./scripts/health-check.sh
   ./scripts/verify-backups.sh
   ```

## Secret Rotation

Rotate these secrets on a scheduled basis and after personnel changes:

- `JWT_SECRET`, `SESSION_SECRET`, `COOKIE_SECRET`
- `CREDENTIAL_ENCRYPTION_KEY`, `CREDENTIAL_ENCRYPTION_SALT`
- `POSTGRES_PASSWORD`, `REDIS_PASSWORD`
- `AZURE_CLIENT_SECRET`, `AD_PASSWORD`

After rotation, restart all backend containers and invalidate active sessions.

## Monitoring Checklist

- `/health/live` returns 200
- `/health/ready` returns 200 for authenticated probes
- Backup job completes and `verify-backups.sh` passes
- Queue depth and failed job counts remain within SLO
