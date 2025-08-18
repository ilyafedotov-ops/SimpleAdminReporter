-- Add user_id column to custom_report_templates table
-- This migration adds the user_id column that is expected by the application code

-- Add user_id column
ALTER TABLE custom_report_templates 
ADD COLUMN user_id INTEGER;

-- Populate user_id with existing created_by values
UPDATE custom_report_templates 
SET user_id = created_by;

-- Add foreign key constraint
ALTER TABLE custom_report_templates 
ADD CONSTRAINT custom_report_templates_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- Add index for performance
CREATE INDEX idx_custom_templates_user_id ON custom_report_templates(user_id);

-- Update unique constraint to use user_id instead of created_by
ALTER TABLE custom_report_templates 
DROP CONSTRAINT unique_name_per_user;

ALTER TABLE custom_report_templates 
ADD CONSTRAINT unique_name_per_user 
UNIQUE (name, user_id);