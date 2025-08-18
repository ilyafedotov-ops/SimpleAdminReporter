-- Create materialized view for combined logs with optimized schema
-- This view pre-joins and transforms data for better query performance

-- Drop existing views if they exist
DROP MATERIALIZED VIEW IF EXISTS mv_combined_logs CASCADE;
DROP MATERIALIZED VIEW IF EXISTS mv_logs_daily_summary CASCADE;
DROP MATERIALIZED VIEW IF EXISTS mv_logs_hourly_stats CASCADE;

-- Create materialized view for combined logs
CREATE MATERIALIZED VIEW mv_combined_logs AS
WITH combined_logs AS (
  SELECT 
    'audit' as log_type,
    id,
    created_at as timestamp,
    event_type,
    event_action,
    user_id,
    username,
    ip_address,
    user_agent,
    session_id,
    resource_type,
    resource_id,
    details,
    success,
    error_message,
    correlation_id,
    NULL::varchar as level,
    NULL::text as message,
    NULL::varchar as service,
    NULL::varchar as module,
    NULL::varchar as request_id,
    NULL::varchar as method,
    NULL::varchar as url,
    NULL::integer as status_code,
    NULL::integer as duration_ms,
    NULL::text as error_stack,
    NULL::jsonb as metadata,
    -- Add computed fields for better filtering
    EXTRACT(YEAR FROM created_at) as year,
    EXTRACT(MONTH FROM created_at) as month,
    EXTRACT(DAY FROM created_at) as day,
    EXTRACT(HOUR FROM created_at) as hour
  FROM audit_logs
  WHERE created_at >= CURRENT_DATE - INTERVAL '90 days' -- Keep only recent data
  
  UNION ALL
  
  SELECT 
    'system' as log_type,
    id,
    timestamp,
    NULL as event_type,
    NULL as event_action,
    user_id,
    NULL as username,
    ip_address,
    NULL as user_agent,
    NULL as session_id,
    NULL as resource_type,
    NULL as resource_id,
    NULL::jsonb as details,
    NULL::boolean as success,
    NULL as error_message,
    request_id as correlation_id,
    level,
    message,
    service,
    module,
    request_id,
    method,
    url,
    status_code,
    duration_ms,
    error_stack,
    metadata,
    -- Add computed fields
    EXTRACT(YEAR FROM timestamp) as year,
    EXTRACT(MONTH FROM timestamp) as month,
    EXTRACT(DAY FROM timestamp) as day,
    EXTRACT(HOUR FROM timestamp) as hour
  FROM system_logs
  WHERE timestamp >= CURRENT_DATE - INTERVAL '90 days'
)
SELECT * FROM combined_logs;

-- Create indexes on materialized view
CREATE INDEX idx_mv_combined_logs_timestamp ON mv_combined_logs(timestamp DESC);
CREATE INDEX idx_mv_combined_logs_log_type ON mv_combined_logs(log_type);
CREATE INDEX idx_mv_combined_logs_event_type ON mv_combined_logs(event_type) WHERE event_type IS NOT NULL;
CREATE INDEX idx_mv_combined_logs_level ON mv_combined_logs(level) WHERE level IS NOT NULL;
CREATE INDEX idx_mv_combined_logs_user_id ON mv_combined_logs(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_mv_combined_logs_username ON mv_combined_logs(username) WHERE username IS NOT NULL;
CREATE INDEX idx_mv_combined_logs_correlation_id ON mv_combined_logs(correlation_id) WHERE correlation_id IS NOT NULL;
CREATE INDEX idx_mv_combined_logs_date_parts ON mv_combined_logs(year, month, day, hour);
CREATE INDEX idx_mv_combined_logs_success ON mv_combined_logs(success) WHERE log_type = 'audit';

-- Create GIN index for JSONB fields
CREATE INDEX idx_mv_combined_logs_details_gin ON mv_combined_logs USING GIN(details) WHERE details IS NOT NULL;
CREATE INDEX idx_mv_combined_logs_metadata_gin ON mv_combined_logs USING GIN(metadata) WHERE metadata IS NOT NULL;

-- Create daily summary materialized view for dashboard
CREATE MATERIALIZED VIEW mv_logs_daily_summary AS
SELECT 
  DATE(timestamp) as date,
  log_type,
  COUNT(*) as total_count,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(CASE WHEN log_type = 'audit' AND success = true THEN 1 END) as successful_actions,
  COUNT(CASE WHEN log_type = 'audit' AND success = false THEN 1 END) as failed_actions,
  COUNT(CASE WHEN level = 'error' THEN 1 END) as error_count,
  COUNT(CASE WHEN level = 'warning' THEN 1 END) as warning_count,
  COUNT(CASE WHEN level = 'info' THEN 1 END) as info_count,
  -- Top event types
  jsonb_object_agg(
    event_type, 
    event_count
    ORDER BY event_count DESC
  ) FILTER (WHERE event_type IS NOT NULL AND rn <= 5) as top_event_types,
  -- Average response time for system logs
  AVG(duration_ms) FILTER (WHERE duration_ms IS NOT NULL) as avg_response_time,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms) FILTER (WHERE duration_ms IS NOT NULL) as p95_response_time
FROM (
  SELECT 
    *,
    COUNT(*) OVER (PARTITION BY DATE(timestamp), log_type, event_type) as event_count,
    ROW_NUMBER() OVER (PARTITION BY DATE(timestamp), log_type ORDER BY COUNT(*) OVER (PARTITION BY DATE(timestamp), log_type, event_type) DESC) as rn
  FROM mv_combined_logs
) t
WHERE date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY date, log_type;

-- Create indexes for daily summary
CREATE INDEX idx_mv_logs_daily_summary_date ON mv_logs_daily_summary(date DESC);
CREATE INDEX idx_mv_logs_daily_summary_log_type ON mv_logs_daily_summary(log_type);

-- Create hourly stats for real-time monitoring
CREATE MATERIALIZED VIEW mv_logs_hourly_stats AS
SELECT 
  DATE_TRUNC('hour', timestamp) as hour,
  log_type,
  COUNT(*) as total_count,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(CASE WHEN level = 'error' THEN 1 END) as error_count,
  COUNT(CASE WHEN log_type = 'audit' AND success = false THEN 1 END) as failed_actions,
  -- Performance metrics
  AVG(duration_ms) FILTER (WHERE duration_ms IS NOT NULL) as avg_response_time,
  MAX(duration_ms) FILTER (WHERE duration_ms IS NOT NULL) as max_response_time,
  MIN(duration_ms) FILTER (WHERE duration_ms IS NOT NULL) as min_response_time,
  -- Top IPs
  MODE() WITHIN GROUP (ORDER BY ip_address) as most_active_ip
FROM mv_combined_logs
WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', timestamp), log_type;

-- Create indexes for hourly stats
CREATE INDEX idx_mv_logs_hourly_stats_hour ON mv_logs_hourly_stats(hour DESC);
CREATE INDEX idx_mv_logs_hourly_stats_log_type ON mv_logs_hourly_stats(log_type);

-- Create function to refresh all materialized views
CREATE OR REPLACE FUNCTION refresh_logs_materialized_views()
RETURNS void AS $$
BEGIN
  -- Refresh in dependency order
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_combined_logs;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_logs_daily_summary;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_logs_hourly_stats;
END;
$$ LANGUAGE plpgsql;

-- Create unique indexes to support CONCURRENTLY refresh
CREATE UNIQUE INDEX idx_mv_combined_logs_unique ON mv_combined_logs(log_type, id);
CREATE UNIQUE INDEX idx_mv_logs_daily_summary_unique ON mv_logs_daily_summary(date, log_type);
CREATE UNIQUE INDEX idx_mv_logs_hourly_stats_unique ON mv_logs_hourly_stats(hour, log_type);

-- Grant permissions
GRANT SELECT ON mv_combined_logs TO PUBLIC;
GRANT SELECT ON mv_logs_daily_summary TO PUBLIC;
GRANT SELECT ON mv_logs_hourly_stats TO PUBLIC;

-- Add comments
COMMENT ON MATERIALIZED VIEW mv_combined_logs IS 'Pre-joined and indexed view of audit and system logs for fast querying';
COMMENT ON MATERIALIZED VIEW mv_logs_daily_summary IS 'Daily aggregated statistics for dashboard and reporting';
COMMENT ON MATERIALIZED VIEW mv_logs_hourly_stats IS 'Hourly statistics for real-time monitoring and alerting';