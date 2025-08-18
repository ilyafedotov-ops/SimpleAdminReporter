-- Migration: Add missing LDAP query templates
-- This migration adds templates for recent_password_changes and password_changes_by_day queries
-- and fixes the never_expiring_passwords template name

BEGIN;

-- Fix the report_type for never expiring passwords template
UPDATE report_templates 
SET report_type = 'never_expiring_passwords'
WHERE report_type = 'never_expire_passwords' AND category = 'ad';

-- Add missing template: Recent Password Changes
INSERT INTO report_templates (
    name, 
    description, 
    category, 
    report_type, 
    query_template, 
    required_parameters, 
    default_parameters,
    is_active
)
VALUES (
    'Recent Password Changes',
    'Users who changed their passwords within specified hours',
    'ad',
    'recent_password_changes',
    '{
        "type": "ldap",
        "base": "{{baseDN}}",
        "filter": "(&(objectClass=user)(objectCategory=person)(passwordLastSet>=1))",
        "attributes": [
            "sAMAccountName",
            "displayName",
            "mail",
            "passwordLastSet",
            "department",
            "title",
            "userAccountControl",
            "whenCreated"
        ],
        "scope": "sub",
        "sizeLimit": 1000
    }'::jsonb,
    '["hours"]'::jsonb,
    '{"hours": 24}'::jsonb,
    true
);

-- Add missing template: Password Changes by Day
INSERT INTO report_templates (
    name, 
    description, 
    category, 
    report_type, 
    query_template, 
    required_parameters, 
    default_parameters,
    is_active
)
VALUES (
    'Password Changes by Day',
    'Summary of password changes grouped by day',
    'ad',
    'password_changes_by_day',
    '{
        "type": "ldap",
        "base": "{{baseDN}}",
        "filter": "(&(objectClass=user)(objectCategory=person)(passwordLastSet>=1))",
        "attributes": [
            "sAMAccountName",
            "displayName",
            "passwordLastSet",
            "department"
        ],
        "scope": "sub",
        "sizeLimit": 10000
    }'::jsonb,
    '["days"]'::jsonb,
    '{"days": 30}'::jsonb,
    true
);

-- Update the query_template format for all AD templates to match the new LDAP query system
-- This ensures they use the proper JSON structure expected by QueryService

-- Update inactive_users template
UPDATE report_templates
SET query_template = '{
    "type": "ldap",
    "base": "DC=domain,DC=local",
    "scope": "sub",
    "filter": "(&(objectClass=user)(objectCategory=person)(lastLogonTimestamp>=1))",
    "attributes": [
        "sAMAccountName",
        "displayName",
        "mail",
        "lastLogonTimestamp",
        "userAccountControl",
        "whenCreated",
        "department",
        "title",
        "manager"
    ],
    "sizeLimit": 5000
}'::jsonb
WHERE report_type = 'inactive_users' AND category = 'ad';

-- Update password_expiry template
UPDATE report_templates
SET query_template = '{
    "type": "ldap",
    "base": "DC=domain,DC=local",
    "scope": "sub",
    "filter": "(&(objectClass=user)(objectCategory=person)(!(userAccountControl:1.2.840.113556.1.4.803:=65536))(passwordLastSet>=1))",
    "attributes": [
        "sAMAccountName",
        "displayName",
        "mail",
        "passwordLastSet",
        "userAccountControl",
        "department",
        "title",
        "whenCreated"
    ],
    "sizeLimit": 5000
}'::jsonb
WHERE report_type = 'password_expiry' AND category = 'ad';

-- Update locked_accounts template  
UPDATE report_templates
SET query_template = '{
    "type": "ldap",
    "base": "DC=domain,DC=local",
    "scope": "sub",
    "filter": "(&(objectClass=user)(lockoutTime>=1))",
    "attributes": [
        "sAMAccountName",
        "displayName",
        "mail",
        "lockoutTime",
        "badPwdCount",
        "lastBadPasswordAttempt",
        "department",
        "title",
        "userAccountControl"
    ],
    "sizeLimit": 1000
}'::jsonb
WHERE report_type = 'locked_accounts' AND category = 'ad';

-- Update disabled_users template
UPDATE report_templates
SET query_template = '{
    "type": "ldap",
    "base": "DC=domain,DC=local",
    "scope": "sub",
    "filter": "(&(objectClass=user)(objectCategory=person)(userAccountControl:1.2.840.113556.1.4.803:=2))",
    "attributes": [
        "sAMAccountName",
        "displayName",
        "mail",
        "whenChanged",
        "description",
        "department",
        "title",
        "userAccountControl"
    ],
    "sizeLimit": 5000
}'::jsonb
WHERE report_type = 'disabled_users' AND category = 'ad';

-- Update never_expiring_passwords template
UPDATE report_templates
SET query_template = '{
    "type": "ldap",
    "base": "DC=domain,DC=local",
    "scope": "sub",
    "filter": "(&(objectClass=user)(objectCategory=person)(userAccountControl:1.2.840.113556.1.4.803:=65536))",
    "attributes": [
        "sAMAccountName",
        "displayName",
        "mail",
        "passwordLastSet",
        "whenCreated",
        "department",
        "title",
        "userAccountControl"
    ],
    "sizeLimit": 5000
}'::jsonb
WHERE report_type = 'never_expiring_passwords' AND category = 'ad';

-- Update privileged_users template
UPDATE report_templates
SET query_template = '{
    "type": "ldap",
    "base": "DC=domain,DC=local",
    "scope": "sub",
    "filter": "(&(objectClass=user)(objectCategory=person)(|(memberOf=CN=Domain Admins,CN=Users,DC=domain,DC=local)(memberOf=CN=Enterprise Admins,CN=Users,DC=domain,DC=local)(memberOf=CN=Schema Admins,CN=Users,DC=domain,DC=local)(memberOf=CN=Administrators,CN=Builtin,DC=domain,DC=local)))",
    "attributes": [
        "sAMAccountName",
        "displayName",
        "mail",
        "memberOf",
        "userAccountControl",
        "lastLogonTimestamp",
        "passwordLastSet",
        "whenCreated",
        "title",
        "department"
    ],
    "sizeLimit": 1000
}'::jsonb
WHERE report_type = 'privileged_users' AND category = 'ad';

-- Update recent_lockouts template
UPDATE report_templates
SET query_template = '{
    "type": "ldap",
    "base": "DC=domain,DC=local",
    "scope": "sub",
    "filter": "(&(objectClass=user)(objectCategory=person)(lockoutTime>=1))",
    "attributes": [
        "sAMAccountName",
        "displayName",
        "mail",
        "lockoutTime",
        "badPwdCount",
        "lastBadPasswordAttempt",
        "department",
        "title",
        "userAccountControl",
        "lockedOut"
    ],
    "sizeLimit": 1000
}'::jsonb
WHERE report_type = 'recent_lockouts' AND category = 'ad';

-- Update empty_groups template
UPDATE report_templates
SET query_template = '{
    "type": "ldap",
    "base": "DC=domain,DC=local",
    "scope": "sub",
    "filter": "(&(objectClass=group)(!(member=*)))",
    "attributes": [
        "name",
        "description",
        "groupType",
        "whenCreated",
        "whenChanged",
        "distinguishedName",
        "managedBy",
        "mail"
    ],
    "sizeLimit": 5000
}'::jsonb
WHERE report_type = 'empty_groups' AND category = 'ad';

-- Update inactive_computers template
UPDATE report_templates
SET query_template = '{
    "type": "ldap",
    "base": "DC=domain,DC=local",
    "scope": "sub",
    "filter": "(&(objectClass=computer)(lastLogonTimestamp>=1))",
    "attributes": [
        "name",
        "operatingSystem",
        "operatingSystemVersion",
        "lastLogonTimestamp",
        "whenCreated",
        "description",
        "distinguishedName",
        "userAccountControl",
        "servicePrincipalName"
    ],
    "sizeLimit": 5000
}'::jsonb
WHERE report_type = 'inactive_computers' AND category = 'ad';

-- Update os_summary template
UPDATE report_templates
SET query_template = '{
    "type": "ldap",
    "base": "DC=domain,DC=local",
    "scope": "sub",
    "filter": "(objectClass=computer)",
    "attributes": [
        "name",
        "operatingSystem",
        "operatingSystemVersion",
        "operatingSystemServicePack",
        "whenCreated",
        "lastLogonTimestamp",
        "distinguishedName"
    ],
    "sizeLimit": 10000
}'::jsonb
WHERE report_type = 'os_summary' AND category = 'ad';

-- Update domain_servers template
UPDATE report_templates
SET query_template = '{
    "type": "ldap",
    "base": "DC=domain,DC=local",
    "scope": "sub",
    "filter": "(&(objectClass=computer)(operatingSystem=*Server*))",
    "attributes": [
        "name",
        "operatingSystem",
        "operatingSystemVersion",
        "operatingSystemServicePack",
        "lastLogonTimestamp",
        "whenCreated",
        "description",
        "distinguishedName",
        "servicePrincipalName",
        "dNSHostName"
    ],
    "sizeLimit": 1000
}'::jsonb
WHERE report_type = 'domain_servers' AND category = 'ad';

-- Update disabled_computers template
UPDATE report_templates
SET query_template = '{
    "type": "ldap",
    "base": "DC=domain,DC=local",
    "scope": "sub",
    "filter": "(&(objectClass=computer)(userAccountControl:1.2.840.113556.1.4.803:=2))",
    "attributes": [
        "name",
        "operatingSystem",
        "operatingSystemVersion",
        "whenChanged",
        "description",
        "distinguishedName",
        "userAccountControl",
        "lastLogonTimestamp"
    ],
    "sizeLimit": 5000
}'::jsonb
WHERE report_type = 'disabled_computers' AND category = 'ad';

-- Add field metadata for the new password-related fields if not exists
INSERT INTO field_metadata (data_source, field_name, display_name, data_type, category, is_filterable, is_sortable)
VALUES 
    ('ad', 'passwordLastSet', 'Password Last Set', 'date', 'Security', true, true),
    ('ad', 'lockoutTime', 'Lockout Time', 'date', 'Security', true, true),
    ('ad', 'badPwdCount', 'Bad Password Count', 'number', 'Security', true, true),
    ('ad', 'lastBadPasswordAttempt', 'Last Bad Password Attempt', 'date', 'Security', true, true),
    ('ad', 'lockedOut', 'Currently Locked', 'boolean', 'Security', true, true)
ON CONFLICT (data_source, field_name) DO NOTHING;

COMMIT;