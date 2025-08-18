-- Migration: Add subcategory field and update template categorization
-- Purpose: Add subcategory field to report_templates table and properly categorize existing templates
-- Author: Claude Code
-- Date: 2025-07-24

-- Add subcategory column to report_templates table
ALTER TABLE report_templates 
ADD COLUMN subcategory VARCHAR(50);

-- Create enum type for subcategories
CREATE TYPE subcategory_type AS ENUM (
    'users', 
    'groups', 
    'security', 
    'computers', 
    'apps', 
    'usage'
);

-- Update the subcategory column to use the enum type
ALTER TABLE report_templates 
ALTER COLUMN subcategory TYPE subcategory_type USING subcategory::subcategory_type;

-- Set default value and make it not null
ALTER TABLE report_templates 
ALTER COLUMN subcategory SET DEFAULT 'users';

-- Update existing templates with proper subcategories based on report_type

-- Security-related queries for AD, Azure, and O365
UPDATE report_templates 
SET subcategory = 'security' 
WHERE report_type IN (
    -- AD Security
    'privileged_users', 'locked_accounts', 'recent_lockouts', 
    'never_expiring_passwords', 'password_expiry', 'recent_password_changes',
    -- Azure Security  
    'privileged_roles', 'mfa_status', 'risky_signins', 'failed_signins',
    'conditional_access',
    -- O365 Security
    'dlp_violations', 'email_malware', 'spam_detections'
);

-- Computer/Device related queries
UPDATE report_templates 
SET subcategory = 'computers' 
WHERE report_type IN (
    -- AD Computers
    'disabled_computers', 'inactive_computers', 'domain_servers', 'os_summary',
    -- Azure Devices
    'stale_devices', 'noncompliant_devices', 'bitlocker_keys',
    -- O365 Devices
    'teams_devices'
);

-- Group related queries  
UPDATE report_templates 
SET subcategory = 'groups' 
WHERE report_type IN (
    -- AD Groups
    'empty_groups', 'nested_groups', 'distribution_lists',
    -- Azure Groups
    'dynamic_groups', 'm365_groups',
    -- O365 Groups/Teams
    'teams_channels'
);

-- Usage/Analytics related queries
UPDATE report_templates 
SET subcategory = 'usage' 
WHERE report_type IN (
    -- O365 Usage
    'mailbox_usage', 'onedrive_usage', 'sharepoint_usage', 'teams_usage',
    'onedrive_activity', 'sharepoint_activity',
    -- Azure Usage
    'license_usage', 'signin_logs'
);

-- Application related queries (primarily mailbox/user services)
UPDATE report_templates 
SET subcategory = 'apps' 
WHERE report_type IN (
    -- AD Applications/Services
    'service_accounts',
    -- Azure Applications
    'guest_users', 'unlicensed_users',
    -- O365 Applications  
    'inactive_mailboxes', 'shared_mailboxes', 'mailbox_quota', 'external_sharing'
);

-- Set remaining templates to 'users' as default (user-focused queries)
UPDATE report_templates 
SET subcategory = 'users' 
WHERE subcategory IS NULL;

-- Make subcategory not null now that all rows have values
ALTER TABLE report_templates 
ALTER COLUMN subcategory SET NOT NULL;

-- Add index for subcategory filtering
CREATE INDEX idx_report_templates_subcategory ON report_templates(subcategory);

-- Add composite index for category + subcategory filtering
CREATE INDEX idx_report_templates_category_subcategory ON report_templates(category, subcategory);

-- Update the unique constraint to include subcategory
ALTER TABLE report_templates 
DROP CONSTRAINT report_templates_report_type_category_key;

ALTER TABLE report_templates 
ADD CONSTRAINT report_templates_report_type_category_key 
UNIQUE (report_type, category);

-- Add comment to document the subcategory field
COMMENT ON COLUMN report_templates.subcategory IS 'Functional subcategory for organizing templates by task type (users, groups, security, computers, apps, usage)';

-- Create a view for easy category/subcategory analysis
CREATE OR REPLACE VIEW template_category_summary AS
SELECT 
    category,
    subcategory,
    COUNT(*) as template_count,
    STRING_AGG(name, ', ' ORDER BY name) as template_names
FROM report_templates 
WHERE is_active = true
GROUP BY category, subcategory
ORDER BY category, subcategory;

COMMENT ON VIEW template_category_summary IS 'Summary view of template distribution across categories and subcategories';