-- Create user search history table
CREATE TABLE IF NOT EXISTS user_search_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    query VARCHAR(255) NOT NULL,
    searched_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    results_count INTEGER DEFAULT 0,
    
    -- Index for efficient queries
    CONSTRAINT idx_user_search_history_user_query UNIQUE (user_id, query)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_search_history_user_id ON user_search_history(user_id);
CREATE INDEX IF NOT EXISTS idx_user_search_history_searched_at ON user_search_history(searched_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_search_history_query ON user_search_history(query);

-- Add search-related columns to report_history if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'report_history' 
                   AND column_name = 'search_keywords') THEN
        ALTER TABLE report_history ADD COLUMN search_keywords TEXT[];
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'report_history' 
                   AND column_name = 'access_count') THEN
        ALTER TABLE report_history ADD COLUMN access_count INTEGER DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'report_history' 
                   AND column_name = 'last_accessed_at') THEN
        ALTER TABLE report_history ADD COLUMN last_accessed_at TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- Add search-related columns to report_templates if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'report_templates' 
                   AND column_name = 'search_keywords') THEN
        ALTER TABLE report_templates ADD COLUMN search_keywords TEXT[];
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'report_templates' 
                   AND column_name = 'popularity_score') THEN
        ALTER TABLE report_templates ADD COLUMN popularity_score INTEGER DEFAULT 0;
    END IF;
END $$;

-- Add search-related columns to custom_report_templates if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'custom_report_templates' 
                   AND column_name = 'search_keywords') THEN
        ALTER TABLE custom_report_templates ADD COLUMN search_keywords TEXT[];
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'custom_report_templates' 
                   AND column_name = 'is_favorite') THEN
        ALTER TABLE custom_report_templates ADD COLUMN is_favorite BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- Create function to update search keywords automatically
CREATE OR REPLACE FUNCTION update_search_keywords()
RETURNS TRIGGER AS $$
BEGIN
    -- Extract keywords from name and description
    NEW.search_keywords := string_to_array(
        lower(
            regexp_replace(
                COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, ''),
                '[^a-zA-Z0-9\s]',
                ' ',
                'g'
            )
        ),
        ' '
    );
    
    -- Remove empty strings
    NEW.search_keywords := array_remove(NEW.search_keywords, '');
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic keyword extraction
DROP TRIGGER IF EXISTS update_report_templates_keywords ON report_templates;
CREATE TRIGGER update_report_templates_keywords
    BEFORE INSERT OR UPDATE OF name, description
    ON report_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_search_keywords();

DROP TRIGGER IF EXISTS update_custom_report_templates_keywords ON custom_report_templates;
CREATE TRIGGER update_custom_report_templates_keywords
    BEFORE INSERT OR UPDATE OF name, description
    ON custom_report_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_search_keywords();

-- Update existing records with search keywords
UPDATE report_templates 
SET search_keywords = string_to_array(
    lower(
        regexp_replace(
            COALESCE(name, '') || ' ' || COALESCE(description, ''),
            '[^a-zA-Z0-9\s]',
            ' ',
            'g'
        )
    ),
    ' '
)
WHERE search_keywords IS NULL;

UPDATE custom_report_templates 
SET search_keywords = string_to_array(
    lower(
        regexp_replace(
            COALESCE(name, '') || ' ' || COALESCE(description, ''),
            '[^a-zA-Z0-9\s]',
            ' ',
            'g'
        )
    ),
    ' '
)
WHERE search_keywords IS NULL;

-- Add comments
COMMENT ON TABLE user_search_history IS 'Stores user search queries for history and analytics';
COMMENT ON COLUMN user_search_history.query IS 'The search query entered by the user';
COMMENT ON COLUMN user_search_history.results_count IS 'Number of results returned for this search';
COMMENT ON COLUMN report_templates.search_keywords IS 'Array of keywords for full-text search';
COMMENT ON COLUMN report_templates.popularity_score IS 'Score based on usage frequency';
COMMENT ON COLUMN custom_report_templates.is_favorite IS 'Whether the user has marked this as favorite';