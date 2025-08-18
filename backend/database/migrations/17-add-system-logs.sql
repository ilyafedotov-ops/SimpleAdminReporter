-- System Logs Migration
-- Migration: 17-add-system-logs.sql
-- Date: 2025-07-27
-- Description: Adds system_logs table for storing application logs from Winston

-- =====================================================
-- Create system_logs table for application logs
-- =====================================================
CREATE TABLE IF NOT EXISTS system_logs (
    id SERIAL PRIMARY KEY,
    level VARCHAR(20) NOT NULL, -- error, warn, info, debug, verbose
    message TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    service VARCHAR(100), -- Service name (e.g., 'ad-reporting-backend')
    module VARCHAR(100), -- Module/component name
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    request_id VARCHAR(100), -- For request correlation
    ip_address INET,
    method VARCHAR(10), -- HTTP method if applicable
    url TEXT, -- Request URL if applicable
    status_code INTEGER, -- HTTP status code if applicable
    duration_ms INTEGER, -- Request duration if applicable
    error_stack TEXT, -- Stack trace for errors
    metadata JSONB DEFAULT '{}', -- Additional metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for efficient querying
CREATE INDEX idx_system_logs_timestamp ON system_logs(timestamp DESC);
CREATE INDEX idx_system_logs_level_timestamp ON system_logs(level, timestamp DESC);
CREATE INDEX idx_system_logs_module_timestamp ON system_logs(module, timestamp DESC) WHERE module IS NOT NULL;
CREATE INDEX idx_system_logs_user_timestamp ON system_logs(user_id, timestamp DESC) WHERE user_id IS NOT NULL;
CREATE INDEX idx_system_logs_request_id ON system_logs(request_id) WHERE request_id IS NOT NULL;
CREATE INDEX idx_system_logs_error_timestamp ON system_logs(timestamp DESC) WHERE level IN ('error', 'warn');

-- Create a partial index for faster error queries
CREATE INDEX idx_system_logs_errors ON system_logs(timestamp DESC, module, message) 
    WHERE level = 'error';

-- =====================================================
-- Create function to rotate old logs
-- =====================================================
CREATE OR REPLACE FUNCTION rotate_system_logs() RETURNS void AS $$
DECLARE
    retention_days INTEGER;
    deleted_count INTEGER;
BEGIN
    -- Get retention period from config or default to 30 days
    retention_days := COALESCE(
        (SELECT value::INTEGER FROM system_config WHERE key = 'log_retention_days'),
        30
    );
    
    -- Delete logs older than retention period
    DELETE FROM system_logs 
    WHERE timestamp < CURRENT_TIMESTAMP - (retention_days || ' days')::INTERVAL;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Log the rotation event
    IF deleted_count > 0 THEN
        INSERT INTO system_logs (level, message, service, module, metadata)
        VALUES (
            'info',
            'System logs rotated',
            'ad-reporting-backend',
            'log-rotation',
            jsonb_build_object(
                'deleted_count', deleted_count,
                'retention_days', retention_days
            )
        );
    END IF;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Create system_config table if not exists
-- =====================================================
CREATE TABLE IF NOT EXISTS system_config (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert default log retention config
INSERT INTO system_config (key, value, description) 
VALUES ('log_retention_days', '30', 'Number of days to retain system logs')
ON CONFLICT (key) DO NOTHING;

-- =====================================================
-- Create scheduled job for log rotation
-- =====================================================
-- Note: This would typically be handled by a cron job or scheduled task
-- For PostgreSQL, you could use pg_cron extension if available

-- =====================================================
-- Create view for log statistics
-- =====================================================
CREATE OR REPLACE VIEW system_log_stats AS
SELECT 
    DATE_TRUNC('hour', timestamp) as hour,
    level,
    module,
    COUNT(*) as count,
    COUNT(DISTINCT user_id) as unique_users,
    COUNT(DISTINCT ip_address) as unique_ips,
    AVG(duration_ms) as avg_duration_ms,
    MAX(duration_ms) as max_duration_ms
FROM system_logs
WHERE timestamp > CURRENT_TIMESTAMP - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', timestamp), level, module;

-- =====================================================
-- Grant permissions
-- =====================================================
GRANT SELECT, INSERT ON system_logs TO ad_reporting_user;
GRANT USAGE, SELECT ON SEQUENCE system_logs_id_seq TO ad_reporting_user;
GRANT SELECT ON system_log_stats TO ad_reporting_user;
GRANT SELECT, INSERT, UPDATE ON system_config TO ad_reporting_user;

-- =====================================================
-- Add comments for documentation
-- =====================================================
COMMENT ON TABLE system_logs IS 'Application logs from Winston logger stored for centralized viewing and analysis';
COMMENT ON TABLE system_config IS 'System configuration parameters';
COMMENT ON VIEW system_log_stats IS 'Hourly statistics of system logs for monitoring';

COMMENT ON COLUMN system_logs.level IS 'Log level: error, warn, info, debug, verbose';
COMMENT ON COLUMN system_logs.request_id IS 'Unique request ID for correlating logs across a single request';
COMMENT ON COLUMN system_logs.metadata IS 'Additional structured data in JSON format';