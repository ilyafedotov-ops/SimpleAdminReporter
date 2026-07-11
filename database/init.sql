-- SimpleAdminReporter initial database schema
-- Version: 1.0.0

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Migration tracking
CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY,
    version VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(500) NOT NULL,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Users
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    auth_source VARCHAR(50) NOT NULL DEFAULT 'local',
    is_admin BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    department VARCHAR(100),
    title VARCHAR(100),
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Service credentials
CREATE TABLE IF NOT EXISTS service_credentials (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    service_type VARCHAR(50) NOT NULL CHECK (service_type IN ('ad', 'azure', 'o365')),
    credential_name VARCHAR(255) NOT NULL,
    username VARCHAR(255),
    encrypted_password TEXT,
    encrypted_client_secret TEXT,
    tenant_id VARCHAR(255),
    client_id VARCHAR(255),
    server VARCHAR(255),
    base_dn VARCHAR(500),
    port INTEGER DEFAULT 389,
    use_ssl BOOLEAN DEFAULT FALSE,
    encryption_salt VARCHAR(64),
    encryption_version VARCHAR(20) DEFAULT 'v1',
    credential_metadata JSONB DEFAULT '{}',
    is_default BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMPTZ,
    last_tested TIMESTAMP WITH TIME ZONE,
    last_test_success BOOLEAN,
    last_test_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, service_type, credential_name)
);

-- Token encryption audit
CREATE TABLE IF NOT EXISTS token_encryption_audit (
    id SERIAL PRIMARY KEY,
    credential_id INTEGER REFERENCES service_credentials(id) ON DELETE SET NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    success BOOLEAN DEFAULT TRUE,
    details JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Report templates
CREATE TABLE IF NOT EXISTS report_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    category VARCHAR(100) NOT NULL,
    subcategory VARCHAR(100),
    report_type VARCHAR(100),
    data_source VARCHAR(50) NOT NULL,
    query_config JSONB NOT NULL,
    query_template JSONB,
    query_type VARCHAR(50),
    required_parameters JSONB DEFAULT '{}',
    default_parameters JSONB DEFAULT '{}',
    is_system BOOLEAN DEFAULT FALSE,
    execution_count INTEGER DEFAULT 0,
    average_execution_time INTEGER,
    field_mappings JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Custom report templates
CREATE TABLE IF NOT EXISTS custom_report_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    source VARCHAR(50) NOT NULL,
    query JSONB NOT NULL,
    created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_public BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    category VARCHAR(100),
    tags TEXT[] DEFAULT '{}',
    version INTEGER DEFAULT 1,
    execution_count INTEGER DEFAULT 0,
    last_executed TIMESTAMP WITH TIME ZONE,
    average_execution_time INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Report history
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'report_status_type') THEN
    CREATE TYPE report_status_type AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS report_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    template_id UUID REFERENCES report_templates(id) ON DELETE SET NULL,
    custom_template_id UUID REFERENCES custom_report_templates(id) ON DELETE SET NULL,
    parameters JSONB DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'pending',
    file_path TEXT,
    row_count INTEGER,
    result_count INTEGER,
    export_format VARCHAR(20),
    execution_time_ms INTEGER,
    error_message TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP WITH TIME ZONE,
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    data_source VARCHAR(50),
    credential_id INTEGER,
    report_name VARCHAR(255),
    metadata JSONB DEFAULT '{}',
    client_ip INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Report schedules
CREATE TABLE IF NOT EXISTS report_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    template_id UUID REFERENCES report_templates(id) ON DELETE SET NULL,
    custom_template_id UUID REFERENCES custom_report_templates(id) ON DELETE SET NULL,
    parameters JSONB DEFAULT '{}',
    schedule_config JSONB NOT NULL,
    recipients TEXT[] DEFAULT '{}',
    export_format VARCHAR(20) DEFAULT 'excel',
    is_active BOOLEAN DEFAULT TRUE,
    next_run TIMESTAMP WITH TIME ZONE,
    last_run TIMESTAMP WITH TIME ZONE,
    created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Audit logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type VARCHAR(100) NOT NULL,
    event_action VARCHAR(100) NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    username VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    session_id VARCHAR(255),
    resource_type VARCHAR(100),
    resource_id VARCHAR(255),
    details JSONB DEFAULT '{}',
    event_result VARCHAR(50),
    event_details JSONB DEFAULT '{}',
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    correlation_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- System logs
CREATE TABLE IF NOT EXISTS system_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    level VARCHAR(20) NOT NULL,
    log_level VARCHAR(20),
    message TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    service VARCHAR(100),
    source VARCHAR(100),
    module VARCHAR(100),
    category VARCHAR(100),
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    request_id VARCHAR(255),
    ip_address INET,
    method VARCHAR(10),
    url TEXT,
    status_code INTEGER,
    duration_ms INTEGER,
    error_stack TEXT,
    metadata JSONB DEFAULT '{}',
    details JSONB DEFAULT '{}',
    correlation_id VARCHAR(255)
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    data JSONB DEFAULT '{}',
    priority INTEGER DEFAULT 2,
    category VARCHAR(100),
    source VARCHAR(100) DEFAULT 'system',
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Field metadata
CREATE TABLE IF NOT EXISTS field_metadata (
    id SERIAL PRIMARY KEY,
    source VARCHAR(50) NOT NULL,
    field_name VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    data_type VARCHAR(50),
    description TEXT,
    is_searchable BOOLEAN DEFAULT TRUE,
    is_sortable BOOLEAN DEFAULT TRUE,
    is_exportable BOOLEAN DEFAULT TRUE,
    is_sensitive BOOLEAN DEFAULT FALSE,
    sample_values JSONB,
    category VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source, field_name)
);

-- Query definitions
CREATE TABLE IF NOT EXISTS query_definitions (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    version VARCHAR(50) NOT NULL,
    data_source VARCHAR(50) NOT NULL,
    definition_data JSONB NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Query metrics
CREATE TABLE IF NOT EXISTS query_metrics (
    id SERIAL PRIMARY KEY,
    query_id VARCHAR(255) NOT NULL,
    execution_time_ms INTEGER NOT NULL,
    row_count INTEGER NOT NULL,
    cached BOOLEAN DEFAULT FALSE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    parameters JSONB DEFAULT '{}'
);

-- Failed login attempts
CREATE TABLE IF NOT EXISTS failed_login_attempts (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    ip_address INET,
    user_agent TEXT,
    auth_source VARCHAR(50),
    error_type VARCHAR(100),
    is_locked BOOLEAN DEFAULT FALSE,
    locked_until TIMESTAMP WITH TIME ZONE,
    attempt_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Account lockouts
CREATE TABLE IF NOT EXISTS account_lockouts (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    ip_address INET,
    lockout_reason TEXT,
    failed_attempts INTEGER,
    lockout_duration_minutes INTEGER,
    locked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    unlocked_at TIMESTAMP WITH TIME ZONE,
    unlocked_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    unlock_reason TEXT
);

-- User sessions (JWT/session tracking)
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255),
    session_id VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- User preferences
CREATE TABLE IF NOT EXISTS user_preferences (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    default_export_format VARCHAR(20) DEFAULT 'excel',
    default_page_size INTEGER DEFAULT 50,
    timezone VARCHAR(100) DEFAULT 'UTC',
    date_format VARCHAR(20) DEFAULT 'YYYY-MM-DD',
    theme VARCHAR(20) DEFAULT 'light',
    email_notifications BOOLEAN DEFAULT true,
    notification_preferences JSONB DEFAULT '{"reportCompletion": true, "scheduledReports": true, "systemAlerts": false, "weeklyDigest": true, "notificationTime": "09:00"}'::jsonb,
    preferences JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- User search history
CREATE TABLE IF NOT EXISTS user_search_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    query TEXT NOT NULL,
    searched_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_service_credentials_user_id ON service_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_report_templates_created_by ON custom_report_templates(created_by);
CREATE INDEX IF NOT EXISTS idx_custom_report_templates_is_public ON custom_report_templates(is_public);
CREATE INDEX IF NOT EXISTS idx_report_history_user_id ON report_history(user_id);
CREATE INDEX IF NOT EXISTS idx_report_history_status ON report_history(status);
CREATE INDEX IF NOT EXISTS idx_report_schedules_next_run ON report_schedules(next_run) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_correlation_id ON audit_logs(correlation_id);
CREATE INDEX IF NOT EXISTS idx_system_logs_timestamp ON system_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_system_logs_correlation_id ON system_logs(correlation_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_field_metadata_source ON field_metadata(source);
CREATE INDEX IF NOT EXISTS idx_query_metrics_query_id ON query_metrics(query_id);
CREATE INDEX IF NOT EXISTS idx_failed_login_username ON failed_login_attempts(username);
CREATE INDEX IF NOT EXISTS idx_failed_login_created_at ON failed_login_attempts(created_at);
CREATE INDEX IF NOT EXISTS idx_failed_login_attempt_time ON failed_login_attempts(attempt_time);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_account_lockouts_username ON account_lockouts(username);
CREATE INDEX IF NOT EXISTS idx_account_lockouts_expires_at ON account_lockouts(expires_at);

CREATE OR REPLACE FUNCTION get_failed_attempt_count(
    p_username VARCHAR,
    p_ip_address INET,
    p_window_minutes INTEGER DEFAULT 15
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    attempt_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO attempt_count
    FROM failed_login_attempts
    WHERE username = p_username
      AND (p_ip_address IS NULL OR ip_address = p_ip_address)
      AND COALESCE(attempt_time, created_at) > CURRENT_TIMESTAMP - (p_window_minutes || ' minutes')::INTERVAL;

    RETURN COALESCE(attempt_count, 0);
END;
$$;

CREATE OR REPLACE FUNCTION is_account_locked(
    p_username VARCHAR,
    p_ip_address INET DEFAULT NULL
)
RETURNS TABLE(
    is_locked BOOLEAN,
    lockout_expires_at TIMESTAMP WITH TIME ZONE,
    lockout_reason TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT TRUE, al.expires_at, al.lockout_reason
    FROM account_lockouts al
    WHERE al.username = p_username
      AND (p_ip_address IS NULL OR al.ip_address = p_ip_address OR al.ip_address IS NULL)
      AND al.unlocked_at IS NULL
      AND al.expires_at > CURRENT_TIMESTAMP
    ORDER BY al.locked_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::TIMESTAMP WITH TIME ZONE, NULL::TEXT;
    END IF;
END;
$$;

-- Record initial migration
INSERT INTO schema_migrations (version, name)
VALUES ('001', 'initial_schema')
ON CONFLICT (version) DO NOTHING;
