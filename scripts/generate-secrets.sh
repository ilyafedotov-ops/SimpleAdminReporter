#!/usr/bin/env bash
#
# Generate real Docker secret files into secrets/ from the placeholder templates.
# The generated files are git-ignored (see .gitignore: secrets/*.txt).
#
# Usage:
#   ./scripts/generate-secrets.sh                 # generate any missing secrets
#   FORCE=1 ./scripts/generate-secrets.sh         # overwrite existing secrets (rotation)
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SECRETS_DIR="${ROOT_DIR}/secrets"
FORCE="${FORCE:-0}"

mkdir -p "${SECRETS_DIR}"

write_secret() {
  local name="$1"
  local value="$2"
  local path="${SECRETS_DIR}/${name}"

  if [[ -f "${path}" && "${FORCE}" != "1" ]]; then
    echo "  skip   ${name} (exists; use FORCE=1 to rotate)"
    return
  fi

  printf '%s' "${value}" > "${path}"
  chmod 600 "${path}"
  echo "  wrote  ${name}"
}

rand_hex() { openssl rand -hex "$1"; }

POSTGRES_PASSWORD="$(rand_hex 24)"
REDIS_PASSWORD="$(rand_hex 24)"

echo "Generating secrets into ${SECRETS_DIR} (FORCE=${FORCE})"
write_secret "postgres_password.txt" "${POSTGRES_PASSWORD}"
write_secret "redis_password.txt" "${REDIS_PASSWORD}"
write_secret "database_url.txt" "postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/reporting"
write_secret "jwt_secret.txt" "$(rand_hex 64)"
write_secret "session_secret.txt" "$(rand_hex 32)"
write_secret "encryption_key.txt" "$(rand_hex 32)"

cat <<'EOF'

Done. Remaining secrets must be supplied manually (no safe default exists):
  - secrets/ad_password.txt          (Active Directory service-account password)
  - secrets/azure_client_secret.txt  (Azure AD app registration client secret)

IMPORTANT: rotating jwt_secret / session_secret invalidates existing sessions,
and rotating encryption_key makes previously stored credentials undecryptable
(they must be re-entered). See docs/DISASTER_RECOVERY.md before rotating in prod.
EOF
