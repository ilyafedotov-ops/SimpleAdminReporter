# Docker Secrets Configuration

This directory contains sensitive configuration files that should be properly secured in production.

## Security Requirements

⚠️ **CRITICAL**: Never commit actual secret files to git! Only the placeholder
files under `secrets/templates/` are tracked. The real, git-ignored secret files
live directly in `secrets/*.txt`.

> **⚠️ Historical exposure:** earlier revisions of `secrets/templates/` contained
> **real** high-entropy values (JWT/session/encryption keys) and the weak
> `reporting123` / `redis123` passwords. Those values still exist in git history
> and must be treated as **compromised**. If any environment was ever deployed
> with them, rotate every affected secret (see **Rotation** below) before relying
> on this deployment.

## Generating secret files

Use the helper script — it writes strong, random values into `secrets/*.txt`
(git-ignored) from the templates:

```bash
./scripts/generate-secrets.sh          # create any missing secrets
FORCE=1 ./scripts/generate-secrets.sh  # rotate (overwrite) existing secrets
```

Then supply the two secrets that have no safe auto-generated default:

```bash
printf '%s' 'your-ad-service-account-password' > secrets/ad_password.txt
printf '%s' 'your-azure-client-secret'         > secrets/azure_client_secret.txt
```

Or create them all manually:

```bash
openssl rand -hex 32 > secrets/encryption_key.txt   # stored-credential encryption key
openssl rand -hex 64 > secrets/jwt_secret.txt        # JWT signing secret
openssl rand -hex 32 > secrets/session_secret.txt    # session secret
printf '%s' 'STRONG_PG_PASSWORD'    > secrets/postgres_password.txt
printf '%s' 'STRONG_REDIS_PASSWORD' > secrets/redis_password.txt
printf 'postgresql://postgres:STRONG_PG_PASSWORD@postgres:5432/reporting' > secrets/database_url.txt
```

## Rotation

- **postgres / redis passwords**: update the secret file, then restart the
  affected containers so the datastore and app pick up the new value.
- **jwt_secret / session_secret**: rotating invalidates all existing sessions
  (users must re-authenticate).
- **encryption_key**: rotating makes previously stored service credentials
  **undecryptable** — they must be re-entered by users afterward. Never rotate
  this without a plan (see `docs/DISASTER_RECOVERY.md`).

## File Permissions

Ensure proper file permissions:

```bash
chmod 600 secrets/*.txt
chown root:root secrets/*.txt  # In production
```

## Production Deployment

For production, consider using:

- **Azure Key Vault** for cloud deployments
- **HashiCorp Vault** for on-premises
- **Docker Swarm secrets** for orchestrated deployments
- **Kubernetes secrets** for K8s deployments

## Development Setup

The template files under `secrets/templates/` are **placeholders**, not working
values. For local development, generate real (random) secrets instead of copying
the templates:

```bash
./scripts/generate-secrets.sh
```

Then fill in `secrets/ad_password.txt` and `secrets/azure_client_secret.txt` if
you need AD/Azure connectivity.
