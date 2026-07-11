-- User preferences and search history tables

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

CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);

CREATE TABLE IF NOT EXISTS user_search_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  searched_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_search_history_user_id ON user_search_history(user_id);
CREATE INDEX IF NOT EXISTS idx_user_search_history_searched_at ON user_search_history(searched_at DESC);
