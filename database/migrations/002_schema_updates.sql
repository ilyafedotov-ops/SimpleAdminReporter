-- Migration 002: Add expires_at to service_credentials if missing
ALTER TABLE service_credentials
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Migration 003: Allow NULL credential_id in token_encryption_audit
ALTER TABLE token_encryption_audit
    ALTER COLUMN credential_id DROP NOT NULL;

INSERT INTO schema_migrations (version, name)
VALUES ('002', 'service_credentials_expires_at')
ON CONFLICT (version) DO NOTHING;

INSERT INTO schema_migrations (version, name)
VALUES ('003', 'token_audit_nullable_credential')
ON CONFLICT (version) DO NOTHING;
