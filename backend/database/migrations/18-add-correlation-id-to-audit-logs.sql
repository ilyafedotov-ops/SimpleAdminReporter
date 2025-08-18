-- Add Correlation ID to Audit Logs Migration
-- Migration: 18-add-correlation-id-to-audit-logs.sql
-- Date: 2025-07-27
-- Description: Adds correlation_id field to audit_logs table for request tracking

-- =====================================================
-- Add correlation_id column to audit_logs
-- =====================================================
ALTER TABLE audit_logs 
ADD COLUMN IF NOT EXISTS correlation_id VARCHAR(100);

-- =====================================================
-- Create index for efficient correlation queries
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_audit_logs_correlation_id 
ON audit_logs(correlation_id) 
WHERE correlation_id IS NOT NULL;

-- Create composite index for correlation + time queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_correlation_created 
ON audit_logs(correlation_id, created_at DESC) 
WHERE correlation_id IS NOT NULL;

-- =====================================================
-- Add comment for documentation
-- =====================================================
COMMENT ON COLUMN audit_logs.correlation_id IS 'Request correlation ID for tracking related events across services';

-- =====================================================
-- Grant permissions
-- =====================================================
-- Permissions already granted on the table in migration 15