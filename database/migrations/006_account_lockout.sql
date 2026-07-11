-- Migration 006: Account lockout schema and helper functions

ALTER TABLE failed_login_attempts
  ADD COLUMN IF NOT EXISTS attempt_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

UPDATE failed_login_attempts
SET attempt_time = COALESCE(attempt_time, created_at)
WHERE attempt_time IS NULL;

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
