-- Seed report templates (minimal bootstrap set)
-- Full template library can be loaded via npm run seed after deployment

INSERT INTO report_templates (name, description, category, data_source, query_config, field_mappings, is_active)
VALUES
(
    'Active Directory Users',
    'List all active directory user accounts',
    'users',
    'ad',
    '{"queryId": "ad_active_users", "baseDN": "", "filter": "(&(objectClass=user)(!(userAccountControl:1.2.840.113556.1.4.803:=2)))", "attributes": ["sAMAccountName", "displayName", "mail", "department", "title", "lastLogonTimestamp"]}',
    '{"sAMAccountName": "Username", "displayName": "Display Name", "mail": "Email", "department": "Department", "title": "Title", "lastLogonTimestamp": "Last Logon"}',
    TRUE
),
(
    'Disabled AD Accounts',
    'List disabled Active Directory accounts',
    'security',
    'ad',
    '{"queryId": "ad_disabled_users", "baseDN": "", "filter": "(&(objectClass=user)(userAccountControl:1.2.840.113556.1.4.803:=2))", "attributes": ["sAMAccountName", "displayName", "mail", "whenChanged"]}',
    '{"sAMAccountName": "Username", "displayName": "Display Name", "mail": "Email", "whenChanged": "Last Changed"}',
    TRUE
),
(
    'Azure AD Users',
    'List Azure Active Directory users',
    'users',
    'azure',
    '{"queryId": "azure_users", "endpoint": "/users", "select": ["displayName", "userPrincipalName", "mail", "department", "jobTitle", "accountEnabled"]}',
    '{"displayName": "Display Name", "userPrincipalName": "UPN", "mail": "Email", "department": "Department", "jobTitle": "Job Title", "accountEnabled": "Enabled"}',
    TRUE
)
ON CONFLICT (name) DO NOTHING;
