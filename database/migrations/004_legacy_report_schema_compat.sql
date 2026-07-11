-- Migration 004: Restore legacy report columns expected by application code and E2E tests

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'report_status_type') THEN
    CREATE TYPE report_status_type AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled');
  END IF;
END $$;

ALTER TABLE report_templates
  ADD COLUMN IF NOT EXISTS report_type VARCHAR(100),
  ADD COLUMN IF NOT EXISTS subcategory VARCHAR(100),
  ADD COLUMN IF NOT EXISTS query_template JSONB,
  ADD COLUMN IF NOT EXISTS query_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS required_parameters JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS default_parameters JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS execution_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS average_execution_time INTEGER;

UPDATE report_templates
SET report_type = COALESCE(report_type, data_source)
WHERE report_type IS NULL;

UPDATE report_templates
SET query_template = COALESCE(query_template, query_config)
WHERE query_template IS NULL;

ALTER TABLE report_history
  ADD COLUMN IF NOT EXISTS generated_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS data_source VARCHAR(50),
  ADD COLUMN IF NOT EXISTS credential_id INTEGER,
  ADD COLUMN IF NOT EXISTS report_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS client_ip INET,
  ADD COLUMN IF NOT EXISTS user_agent TEXT;

UPDATE report_history
SET generated_at = COALESCE(generated_at, executed_at, created_at)
WHERE generated_at IS NULL;

UPDATE report_history
SET started_at = COALESCE(started_at, generated_at, executed_at, created_at)
WHERE started_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_report_templates_report_type ON report_templates(report_type);

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS event_result VARCHAR(50),
  ADD COLUMN IF NOT EXISTS event_details JSONB DEFAULT '{}';

UPDATE audit_logs
SET event_result = COALESCE(
  event_result,
  CASE WHEN success IS FALSE THEN 'failure' ELSE 'success' END
)
WHERE event_result IS NULL;

UPDATE audit_logs
SET event_details = COALESCE(event_details, details)
WHERE event_details IS NULL OR event_details = '{}'::jsonb;

ALTER TABLE system_logs
  ADD COLUMN IF NOT EXISTS log_level VARCHAR(20),
  ADD COLUMN IF NOT EXISTS source VARCHAR(100),
  ADD COLUMN IF NOT EXISTS category VARCHAR(100),
  ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE;

UPDATE system_logs
SET log_level = COALESCE(log_level, level)
WHERE log_level IS NULL;

UPDATE system_logs
SET source = COALESCE(source, service)
WHERE source IS NULL;

UPDATE system_logs
SET details = COALESCE(NULLIF(details, '{}'::jsonb), metadata)
WHERE details IS NULL OR details = '{}'::jsonb;

UPDATE system_logs
SET created_at = COALESCE(created_at, timestamp)
WHERE created_at IS NULL;

INSERT INTO schema_migrations (version, name)
VALUES ('004', 'legacy_report_schema_compat')
ON CONFLICT (version) DO NOTHING;
