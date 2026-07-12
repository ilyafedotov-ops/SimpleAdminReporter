#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

for compose_file in docker-compose.production.yml docker-compose.staging.yml; do
  if rg -n '(DB_PASSWORD|REDIS_PASSWORD)=\$\{[^}]+:-' "$ROOT_DIR/$compose_file"; then
    echo "$compose_file contains a password fallback"
    exit 1
  fi
done

if rg -n '(\*\*/\*\.test|\*\*/\*\.spec|docs/\*\*|docker-compose|\.github/workflows|\.*/tests?/\.\*)' \
  "$ROOT_DIR/.gitleaks.toml" "$ROOT_DIR/.gitguardian.yaml"; then
  echo "Secret-scanner configuration contains a blanket source exclusion"
  exit 1
fi

if ! rg -q 'gitleaks/gitleaks-action@e0c47f4f8be36e29cdc102c57e68cb5cbf0e8d1e' \
  "$ROOT_DIR/.github/workflows/ci.yml"; then
  echo "Gitleaks action is not pinned to the reviewed redacting implementation"
  exit 1
fi

if ! rg -q 'GITLEAKS_VERSION: "8\.30\.1"' "$ROOT_DIR/.github/workflows/ci.yml"; then
  echo "Gitleaks engine version is not pinned"
  exit 1
fi

for setting in GITLEAKS_ENABLE_COMMENTS GITLEAKS_ENABLE_SUMMARY GITLEAKS_ENABLE_UPLOAD_ARTIFACT; do
  if ! rg -q "$setting: \"false\"" "$ROOT_DIR/.github/workflows/ci.yml"; then
    echo "$setting must remain disabled"
    exit 1
  fi
done

if ! rg -q 'rev: v8\.30\.1' "$ROOT_DIR/.pre-commit-config.yaml"; then
  echo "The local Gitleaks hook is not pinned"
  exit 1
fi

if ! rg -q -- '--redact' "$ROOT_DIR/.pre-commit-config.yaml"; then
  echo "The local Gitleaks hook must redact findings"
  exit 1
fi
