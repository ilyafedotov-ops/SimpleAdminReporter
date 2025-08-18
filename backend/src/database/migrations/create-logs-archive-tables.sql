-- Create archive schema for log archival
CREATE SCHEMA IF NOT EXISTS archive;

-- Create archive metadata table
CREATE TABLE IF NOT EXISTS archive.archive_metadata (
  id SERIAL PRIMARY KEY,
  archive_date DATE NOT NULL,
  table_name VARCHAR(50) NOT NULL,
  row_count INTEGER NOT NULL,
  archive_type VARCHAR(20) NOT NULL, -- 'compressed', 'cold_storage', 'deleted'
  storage_location TEXT, -- S3 path or filesystem path for cold storage
  compressed_size_bytes BIGINT,
  original_size_bytes BIGINT,
  checksum VARCHAR(64), -- SHA256 checksum of archived data
  archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  archived_by VARCHAR(100),
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'archived', 'failed', 'restored'
  error_message TEXT,
  restored_at TIMESTAMP,
  UNIQUE(archive_date, table_name)
);

-- Create partitioned archive tables for audit logs
CREATE TABLE IF NOT EXISTS archive.audit_logs_archive (
  LIKE audit_logs INCLUDING ALL
) PARTITION BY RANGE (created_at);

-- Create partitioned archive tables for system logs
CREATE TABLE IF NOT EXISTS archive.system_logs_archive (
  LIKE system_logs INCLUDING ALL
) PARTITION BY RANGE (timestamp);

-- Create monthly partitions for the current year (example for 2025)
DO $$
DECLARE
  start_date DATE;
  end_date DATE;
  partition_name TEXT;
BEGIN
  FOR i IN 1..12 LOOP
    start_date := DATE '2025-01-01' + (i-1) * INTERVAL '1 month';
    end_date := start_date + INTERVAL '1 month';
    
    -- Audit logs partition
    partition_name := 'audit_logs_archive_' || TO_CHAR(start_date, 'YYYY_MM');
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS archive.%I PARTITION OF archive.audit_logs_archive
      FOR VALUES FROM (%L) TO (%L)',
      partition_name, start_date, end_date
    );
    
    -- System logs partition
    partition_name := 'system_logs_archive_' || TO_CHAR(start_date, 'YYYY_MM');
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS archive.%I PARTITION OF archive.system_logs_archive
      FOR VALUES FROM (%L) TO (%L)',
      partition_name, start_date, end_date
    );
  END LOOP;
END $$;

-- Create compressed storage tables using JSONB for better compression
CREATE TABLE IF NOT EXISTS archive.audit_logs_compressed (
  archive_date DATE NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  day INTEGER NOT NULL,
  hour INTEGER,
  compressed_data JSONB NOT NULL, -- Array of log entries
  row_count INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (archive_date, hour)
);

CREATE TABLE IF NOT EXISTS archive.system_logs_compressed (
  archive_date DATE NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  day INTEGER NOT NULL,
  hour INTEGER,
  compressed_data JSONB NOT NULL, -- Array of log entries
  row_count INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (archive_date, hour)
);

-- Create indexes for compressed tables
CREATE INDEX idx_audit_logs_compressed_date ON archive.audit_logs_compressed(archive_date);
CREATE INDEX idx_audit_logs_compressed_year_month ON archive.audit_logs_compressed(year, month);
CREATE INDEX idx_system_logs_compressed_date ON archive.system_logs_compressed(archive_date);
CREATE INDEX idx_system_logs_compressed_year_month ON archive.system_logs_compressed(year, month);

-- Function to archive logs to partitioned tables
CREATE OR REPLACE FUNCTION archive.archive_logs_to_partitions(
  p_table_name TEXT,
  p_date_column TEXT,
  p_days_to_keep INTEGER DEFAULT 90
) RETURNS TABLE (
  archived_count BIGINT,
  archive_date DATE
) AS $$
DECLARE
  v_archive_date DATE;
  v_archived_count BIGINT;
  v_source_table TEXT;
  v_archive_table TEXT;
BEGIN
  -- Calculate archive date
  v_archive_date := CURRENT_DATE - p_days_to_keep;
  
  -- Determine source and archive tables
  IF p_table_name = 'audit_logs' THEN
    v_source_table := 'public.audit_logs';
    v_archive_table := 'archive.audit_logs_archive';
  ELSIF p_table_name = 'system_logs' THEN
    v_source_table := 'public.system_logs';
    v_archive_table := 'archive.system_logs_archive';
  ELSE
    RAISE EXCEPTION 'Unknown table: %', p_table_name;
  END IF;
  
  -- Archive data
  EXECUTE format('
    WITH archived AS (
      INSERT INTO %s
      SELECT * FROM %s
      WHERE %I < %L
      RETURNING 1
    )
    SELECT COUNT(*) FROM archived',
    v_archive_table, v_source_table, p_date_column, v_archive_date
  ) INTO v_archived_count;
  
  -- Delete archived data from source
  IF v_archived_count > 0 THEN
    EXECUTE format('
      DELETE FROM %s WHERE %I < %L',
      v_source_table, p_date_column, v_archive_date
    );
  END IF;
  
  -- Return results
  RETURN QUERY SELECT v_archived_count, v_archive_date;
END;
$$ LANGUAGE plpgsql;

-- Function to compress logs into JSONB format
CREATE OR REPLACE FUNCTION archive.compress_logs_to_jsonb(
  p_table_name TEXT,
  p_date DATE,
  p_hour INTEGER DEFAULT NULL
) RETURNS TABLE (
  compressed_count BIGINT,
  compressed_size BIGINT
) AS $$
DECLARE
  v_compressed_count BIGINT;
  v_compressed_data JSONB;
  v_table_suffix TEXT;
BEGIN
  -- Determine table suffix
  v_table_suffix := CASE p_table_name
    WHEN 'audit_logs' THEN 'audit_logs'
    WHEN 'system_logs' THEN 'system_logs'
    ELSE RAISE EXCEPTION 'Unknown table: %', p_table_name
  END;
  
  -- Build query based on whether hour is specified
  IF p_hour IS NOT NULL THEN
    -- Compress specific hour
    EXECUTE format('
      SELECT jsonb_agg(row_to_json(t)), COUNT(*)
      FROM archive.%I_archive t
      WHERE DATE(%I) = %L 
        AND EXTRACT(HOUR FROM %I) = %L',
      v_table_suffix,
      CASE p_table_name 
        WHEN 'audit_logs' THEN 'created_at'
        WHEN 'system_logs' THEN 'timestamp'
      END,
      p_date,
      CASE p_table_name 
        WHEN 'audit_logs' THEN 'created_at'
        WHEN 'system_logs' THEN 'timestamp'
      END,
      p_hour
    ) INTO v_compressed_data, v_compressed_count;
  ELSE
    -- Compress entire day
    EXECUTE format('
      SELECT jsonb_agg(row_to_json(t)), COUNT(*)
      FROM archive.%I_archive t
      WHERE DATE(%I) = %L',
      v_table_suffix,
      CASE p_table_name 
        WHEN 'audit_logs' THEN 'created_at'
        WHEN 'system_logs' THEN 'timestamp'
      END,
      p_date
    ) INTO v_compressed_data, v_compressed_count;
  END IF;
  
  -- Insert compressed data
  IF v_compressed_count > 0 THEN
    EXECUTE format('
      INSERT INTO archive.%I_compressed 
      (archive_date, year, month, day, hour, compressed_data, row_count)
      VALUES (%L, %L, %L, %L, %L, %L, %L)
      ON CONFLICT (archive_date, hour) 
      DO UPDATE SET 
        compressed_data = EXCLUDED.compressed_data,
        row_count = EXCLUDED.row_count,
        created_at = CURRENT_TIMESTAMP',
      v_table_suffix,
      p_date,
      EXTRACT(YEAR FROM p_date),
      EXTRACT(MONTH FROM p_date),
      EXTRACT(DAY FROM p_date),
      COALESCE(p_hour, 0),
      v_compressed_data,
      v_compressed_count
    );
  END IF;
  
  RETURN QUERY SELECT 
    v_compressed_count,
    pg_column_size(v_compressed_data)::BIGINT;
END;
$$ LANGUAGE plpgsql;

-- Function to restore archived logs
CREATE OR REPLACE FUNCTION archive.restore_archived_logs(
  p_table_name TEXT,
  p_start_date DATE,
  p_end_date DATE
) RETURNS TABLE (
  restored_count BIGINT
) AS $$
DECLARE
  v_restored_count BIGINT;
  v_source_table TEXT;
  v_target_table TEXT;
  v_date_column TEXT;
BEGIN
  -- Determine tables and columns
  IF p_table_name = 'audit_logs' THEN
    v_source_table := 'archive.audit_logs_compressed';
    v_target_table := 'public.audit_logs';
    v_date_column := 'created_at';
  ELSIF p_table_name = 'system_logs' THEN
    v_source_table := 'archive.system_logs_compressed';
    v_target_table := 'public.system_logs';
    v_date_column := 'timestamp';
  ELSE
    RAISE EXCEPTION 'Unknown table: %', p_table_name;
  END IF;
  
  -- Restore from compressed format
  EXECUTE format('
    WITH restored AS (
      INSERT INTO %s
      SELECT (jsonb_array_elements(compressed_data))::jsonb->>' || quote_literal('*') || '
      FROM %s
      WHERE archive_date BETWEEN %L AND %L
      RETURNING 1
    )
    SELECT COUNT(*) FROM restored',
    v_target_table, v_source_table, p_start_date, p_end_date
  ) INTO v_restored_count;
  
  -- Update metadata
  UPDATE archive.archive_metadata
  SET status = 'restored',
      restored_at = CURRENT_TIMESTAMP
  WHERE table_name = p_table_name
    AND archive_date BETWEEN p_start_date AND p_end_date;
  
  RETURN QUERY SELECT v_restored_count;
END;
$$ LANGUAGE plpgsql;

-- Create views for easy access to archive statistics
CREATE OR REPLACE VIEW archive.archive_statistics AS
SELECT 
  table_name,
  COUNT(*) as archive_count,
  SUM(row_count) as total_rows,
  MIN(archive_date) as oldest_archive,
  MAX(archive_date) as newest_archive,
  SUM(compressed_size_bytes) as total_compressed_size,
  SUM(original_size_bytes) as total_original_size,
  CASE 
    WHEN SUM(original_size_bytes) > 0 
    THEN ROUND((1 - SUM(compressed_size_bytes)::NUMERIC / SUM(original_size_bytes)) * 100, 2)
    ELSE 0
  END as compression_ratio_percent
FROM archive.archive_metadata
WHERE status = 'archived'
GROUP BY table_name;

-- Retention policy table
CREATE TABLE IF NOT EXISTS archive.retention_policies (
  id SERIAL PRIMARY KEY,
  table_name VARCHAR(50) NOT NULL UNIQUE,
  retention_days INTEGER NOT NULL DEFAULT 90,
  archive_strategy VARCHAR(20) NOT NULL DEFAULT 'compress', -- 'compress', 'cold_storage', 'delete'
  cold_storage_after_days INTEGER DEFAULT 365,
  delete_after_days INTEGER DEFAULT 2555, -- 7 years
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default retention policies
INSERT INTO archive.retention_policies (table_name, retention_days, archive_strategy, cold_storage_after_days, delete_after_days)
VALUES 
  ('audit_logs', 90, 'compress', 365, 2555),
  ('system_logs', 30, 'compress', 180, 730)
ON CONFLICT (table_name) DO NOTHING;

-- Grant permissions
GRANT USAGE ON SCHEMA archive TO PUBLIC;
GRANT SELECT ON ALL TABLES IN SCHEMA archive TO PUBLIC;

-- Add comments
COMMENT ON SCHEMA archive IS 'Schema for archived log data and metadata';
COMMENT ON TABLE archive.archive_metadata IS 'Metadata tracking for all archive operations';
COMMENT ON TABLE archive.audit_logs_archive IS 'Partitioned archive table for audit logs';
COMMENT ON TABLE archive.system_logs_archive IS 'Partitioned archive table for system logs';
COMMENT ON TABLE archive.audit_logs_compressed IS 'Compressed storage for audit logs using JSONB';
COMMENT ON TABLE archive.system_logs_compressed IS 'Compressed storage for system logs using JSONB';
COMMENT ON TABLE archive.retention_policies IS 'Configurable retention policies for each log table';