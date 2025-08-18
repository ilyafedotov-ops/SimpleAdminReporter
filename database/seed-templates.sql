-- Seed data for report templates
-- This script populates the report_templates table with pre-built reports

-- Clear existing templates (optional - comment out if you want to preserve existing data)
-- TRUNCATE TABLE report_templates CASCADE;

-- Active Directory Reports
INSERT INTO report_templates (id, name, description, category, report_type, query_template, required_parameters, is_active) VALUES
-- AD User Reports
('11111111-1111-1111-1111-111111111111', 'Inactive Users Report', 'Find users who haven''t logged in for a specified number of days', 'AD', 'ad_inactive_users', '{"filter": "inactive", "attributes": ["username", "displayName", "lastLogon", "department"]}', '["days"]', true),
('11111111-1111-1111-1111-111111111112', 'Password Expiry Report', 'List users whose passwords will expire within specified days', 'AD', 'ad_password_expiry', '{"filter": "passwordExpiry", "attributes": ["username", "displayName", "passwordLastSet", "email"]}', '["days"]', true),
('11111111-1111-1111-1111-111111111113', 'Locked Users Report', 'Find all currently locked user accounts', 'AD', 'ad_locked_users', '{"filter": "locked", "attributes": ["username", "displayName", "lockoutTime", "badPasswordCount"]}', '[]', true),
('11111111-1111-1111-1111-111111111114', 'Administrative Groups Report', 'List all administrative and privileged groups with members', 'AD', 'ad_admin_groups', '{"filter": "adminGroups", "attributes": ["groupName", "members", "description"]}', '[]', true),
('11111111-1111-1111-1111-111111111115', 'Service Accounts Report', 'Identify all service accounts in the domain', 'AD', 'ad_service_accounts', '{"filter": "serviceAccounts", "attributes": ["username", "displayName", "servicePrincipalName", "lastLogon"]}', '[]', true),

-- AD Management Reports
('11111111-1111-1111-1111-111111111116', 'Users Without Manager', 'Find users who don''t have a manager assigned', 'AD', 'ad_users_without_manager', '{"filter": "noManager", "attributes": ["username", "displayName", "department", "title"]}', '[]', true),
('11111111-1111-1111-1111-111111111117', 'Recently Created Users', 'List users created within specified days', 'AD', 'ad_recently_created', '{"filter": "recentlyCreated", "attributes": ["username", "displayName", "whenCreated", "createdBy"]}', '["days"]', true),
('11111111-1111-1111-1111-111111111118', 'Recently Modified Users', 'List users modified within specified days', 'AD', 'ad_recently_modified', '{"filter": "recentlyModified", "attributes": ["username", "displayName", "whenChanged", "modifiedBy"]}', '["days"]', true),
('11111111-1111-1111-1111-111111111119', 'Disabled Users with Groups', 'Find disabled users who still have group memberships', 'AD', 'ad_disabled_with_groups', '{"filter": "disabledWithGroups", "attributes": ["username", "displayName", "memberOf", "whenDisabled"]}', '[]', true),
('11111111-1111-1111-1111-11111111111a', 'Users by Department', 'List all users in a specific department', 'AD', 'ad_users_by_department', '{"filter": "department", "attributes": ["username", "displayName", "title", "manager"]}', '["department"]', true),

-- AD Computer/System Reports
('11111111-1111-1111-1111-11111111111b', 'Stale Computer Accounts', 'Find computers that haven''t contacted the domain recently', 'AD', 'ad_stale_computers', '{"filter": "staleComputers", "attributes": ["computerName", "operatingSystem", "lastLogon", "distinguishedName"]}', '["days"]', true),
('11111111-1111-1111-1111-11111111111c', 'Group Membership Changes', 'Track recent group membership modifications', 'AD', 'ad_group_changes', '{"filter": "groupChanges", "attributes": ["groupName", "changeType", "member", "changeDate"]}', '["days"]', true),
('11111111-1111-1111-1111-11111111111d', 'Empty Groups', 'Find groups with no members', 'AD', 'ad_empty_groups', '{"filter": "emptyGroups", "attributes": ["groupName", "description", "whenCreated"]}', '[]', true),
('11111111-1111-1111-1111-11111111111e', 'Nested Group Analysis', 'Analyze nested group memberships for a specific group', 'AD', 'ad_nested_groups', '{"filter": "nestedGroups", "attributes": ["groupName", "nestedLevel", "memberCount"]}', '["groupName"]', true),
('11111111-1111-1111-1111-11111111111f', 'Failed Login Attempts', 'Track failed login attempts within specified days', 'AD', 'ad_failed_logins', '{"filter": "failedLogins", "attributes": ["username", "badPasswordCount", "lastBadPasswordAttempt", "source"]}', '["days"]', true);

-- Azure AD Reports
INSERT INTO report_templates (id, name, description, category, report_type, query_template, required_parameters, is_active) VALUES
-- Azure AD User Reports
('22222222-2222-2222-2222-222222222221', 'Guest Users Report', 'List all guest/external users in Azure AD', 'AzureAD', 'azure_guest_users', '{"resource": "users", "filter": "userType eq ''Guest''", "select": ["displayName", "mail", "createdDateTime", "externalUserState"]}', '[]', true),
('22222222-2222-2222-2222-222222222222', 'MFA Status Report', 'Check Multi-Factor Authentication status for all users', 'AzureAD', 'azure_mfa_status', '{"resource": "users", "expand": "authentication", "select": ["displayName", "userPrincipalName", "mfaStatus"]}', '[]', true),
('22222222-2222-2222-2222-222222222223', 'Risky Sign-ins Report', 'Identify risky sign-in attempts', 'AzureAD', 'azure_risky_signins', '{"resource": "riskDetections", "filter": "riskLevel ne ''none''", "orderBy": "detectedDateTime desc"}', '["days"]', true),
('22222222-2222-2222-2222-222222222224', 'Conditional Access Coverage', 'Analyze conditional access policy coverage', 'AzureAD', 'azure_conditional_access', '{"resource": "conditionalAccessPolicies", "expand": "conditions,grantControls", "select": ["displayName", "state", "conditions"]}', '[]', true),
('22222222-2222-2222-2222-222222222225', 'License Assignment Report', 'View license assignments across users', 'AzureAD', 'azure_license_assignment', '{"resource": "users", "expand": "licenseDetails", "select": ["displayName", "assignedLicenses", "department"]}', '[]', true),

-- Azure AD Security Reports
('22222222-2222-2222-2222-222222222226', 'Privileged Role Members', 'List members of privileged Azure AD roles', 'AzureAD', 'azure_privileged_roles', '{"resource": "directoryRoles", "expand": "members", "filter": "isBuiltIn eq true"}', '[]', true),
('22222222-2222-2222-2222-222222222227', 'Application Permissions', 'Audit application permissions and consent', 'AzureAD', 'azure_app_permissions', '{"resource": "applications", "expand": "appRoleAssignments", "select": ["displayName", "requiredResourceAccess"]}', '[]', true),
('22222222-2222-2222-2222-222222222228', 'Device Compliance Status', 'Check device compliance across the organization', 'AzureAD', 'azure_device_compliance', '{"resource": "devices", "select": ["displayName", "isCompliant", "operatingSystem", "lastSignInDateTime"]}', '[]', true),
('22222222-2222-2222-2222-222222222229', 'Inactive Guest Users', 'Find guest users who haven''t signed in recently', 'AzureAD', 'azure_inactive_guests', '{"resource": "users", "filter": "userType eq ''Guest'' and signInActivity/lastSignInDateTime le {date}"}', '["days"]', true),
('22222222-2222-2222-2222-22222222222a', 'Password Reset Activity', 'Track password reset activities', 'AzureAD', 'azure_password_reset', '{"resource": "auditLogs", "filter": "category eq ''UserManagement'' and activityDisplayName eq ''Reset password''"}', '["days"]', true),

-- Azure AD Management Reports
('22222222-2222-2222-2222-22222222222b', 'B2B Collaboration Settings', 'Review B2B collaboration configuration', 'AzureAD', 'azure_b2b_settings', '{"resource": "policies", "filter": "policyType eq ''B2BManagementPolicy''"}', '[]', true),
('22222222-2222-2222-2222-22222222222c', 'Application Sign-in Summary', 'Summary of application usage and sign-ins', 'AzureAD', 'azure_app_signin', '{"resource": "signIns", "groupBy": "appDisplayName", "aggregate": "count"}', '["days"]', true),
('22222222-2222-2222-2222-22222222222d', 'Directory Role Changes', 'Track changes to directory role memberships', 'AzureAD', 'azure_role_changes', '{"resource": "auditLogs", "filter": "category eq ''RoleManagement''"}', '["days"]', true),
('22222222-2222-2222-2222-22222222222e', 'Deleted Users', 'List recently deleted users', 'AzureAD', 'azure_deleted_users', '{"resource": "directory/deletedItems/users", "select": ["displayName", "deletedDateTime", "userPrincipalName"]}', '[]', true),
('22222222-2222-2222-2222-22222222222f', 'Dynamic Group Membership', 'Analyze dynamic group membership rules', 'AzureAD', 'azure_dynamic_groups', '{"resource": "groups", "filter": "membershipRuleProcessingState eq ''On''", "select": ["displayName", "membershipRule"]}', '[]', true);

-- Office 365 Reports
INSERT INTO report_templates (id, name, description, category, report_type, query_template, required_parameters, is_active) VALUES
-- O365 Email & Communication Reports
('33333333-3333-3333-3333-333333333331', 'Mailbox Usage Statistics', 'Get mailbox size and item count statistics', 'O365', 'o365_mailbox_usage', '{"report": "getMailboxUsageDetail", "period": "D7"}', '[]', true),
('33333333-3333-3333-3333-333333333332', 'Shared Mailbox Access', 'List shared mailboxes and their delegates', 'O365', 'o365_shared_mailbox', '{"resource": "sharedMailboxes", "expand": "delegates"}', '[]', true),
('33333333-3333-3333-3333-333333333333', 'Email Activity Summary', 'Summary of email send/receive activity', 'O365', 'o365_email_activity', '{"report": "getEmailActivityUserDetail", "period": "D7"}', '["period"]', true),
('33333333-3333-3333-3333-333333333334', 'Distribution List Usage', 'Analyze distribution list membership and usage', 'O365', 'o365_distribution_lists', '{"resource": "groups", "filter": "groupTypes/any(c:c eq ''Unified'')", "expand": "members"}', '[]', true),
('33333333-3333-3333-3333-333333333335', 'Large Mailboxes', 'Find mailboxes exceeding size threshold', 'O365', 'o365_large_mailboxes', '{"report": "getMailboxUsageDetail", "filter": "storageUsedInBytes gt {sizeGB}"}', '["sizeGB"]', true),

-- O365 Collaboration Reports
('33333333-3333-3333-3333-333333333336', 'OneDrive Storage Usage', 'Track OneDrive storage consumption', 'O365', 'o365_onedrive_usage', '{"report": "getOneDriveUsageAccountDetail", "period": "D7"}', '[]', true),
('33333333-3333-3333-3333-333333333337', 'Teams Activity Report', 'Microsoft Teams usage and activity', 'O365', 'o365_teams_activity', '{"report": "getTeamsUserActivityUserDetail", "period": "D7"}', '["period"]', true),
('33333333-3333-3333-3333-333333333338', 'SharePoint Site Usage', 'SharePoint site activity and storage', 'O365', 'o365_sharepoint_usage', '{"report": "getSharePointSiteUsageDetail", "period": "D7"}', '[]', true),
('33333333-3333-3333-3333-333333333339', 'Meeting Statistics', 'Teams/Skype meeting participation stats', 'O365', 'o365_meeting_stats', '{"report": "getSkypeForBusinessActivityUserDetail", "period": "D7"}', '["period"]', true),
('33333333-3333-3333-3333-33333333333a', 'External Sharing Report', 'Track external sharing in SharePoint/OneDrive', 'O365', 'o365_external_sharing', '{"report": "getSharePointActivityUserDetail", "filter": "sharedExternally eq true"}', '[]', true),

-- O365 License & Compliance Reports
('33333333-3333-3333-3333-33333333333b', 'License Usage by Service', 'Breakdown of license usage by service', 'O365', 'o365_license_usage', '{"report": "getOffice365ActiveUserDetail", "select": ["assignedProducts"]}', '[]', true),
('33333333-3333-3333-3333-33333333333c', 'Mobile Device Report', 'Mobile devices accessing O365 services', 'O365', 'o365_mobile_devices', '{"report": "getMobileDeviceUsageUserDetail"}', '[]', true),
('33333333-3333-3333-3333-33333333333d', 'Inactive OneDrive Users', 'Find inactive OneDrive accounts', 'O365', 'o365_inactive_onedrive', '{"report": "getOneDriveUsageAccountDetail", "filter": "lastActivityDate lt {date}"}', '["days"]', true),
('33333333-3333-3333-3333-33333333333e', 'Calendar Sharing Report', 'Track calendar sharing permissions', 'O365', 'o365_calendar_sharing', '{"resource": "calendarPermissions", "expand": "sharedWith"}', '[]', true),
('33333333-3333-3333-3333-33333333333f', 'Compliance Report Summary', 'Overview of compliance status', 'O365', 'o365_compliance_summary', '{"report": "getOffice365ActiveUserDetail", "includeCompliance": true}', '[]', true);

-- Add field metadata for dynamic field discovery
INSERT INTO field_metadata (source, field_name, display_name, data_type, category, description, is_searchable, is_sortable, is_exportable) VALUES
-- AD Fields
('ad', 'sAMAccountName', 'Username', 'string', 'Basic Information', 'User login name', true, true, true),
('ad', 'displayName', 'Display Name', 'string', 'Basic Information', 'Full name of the user', true, true, true),
('ad', 'mail', 'Email', 'string', 'Contact Information', 'Email address', true, true, true),
('ad', 'department', 'Department', 'string', 'Organization', 'Department name', true, true, true),
('ad', 'title', 'Job Title', 'string', 'Organization', 'Job title', true, true, true),
('ad', 'manager', 'Manager', 'string', 'Organization', 'Manager DN', true, true, true),
('ad', 'whenCreated', 'Created Date', 'datetime', 'Audit', 'Account creation date', true, true, true),
('ad', 'whenChanged', 'Modified Date', 'datetime', 'Audit', 'Last modification date', true, true, true),
('ad', 'lastLogon', 'Last Logon', 'datetime', 'Security', 'Last successful logon', true, true, true),
('ad', 'userAccountControl', 'Account Status', 'number', 'Security', 'Account control flags', false, true, true),
('ad', 'memberOf', 'Group Memberships', 'array', 'Security', 'Groups the user belongs to', true, false, true),

-- Azure AD Fields
('azure', 'id', 'Object ID', 'string', 'Basic Information', 'Unique identifier', true, true, true),
('azure', 'userPrincipalName', 'User Principal Name', 'string', 'Basic Information', 'Login name', true, true, true),
('azure', 'displayName', 'Display Name', 'string', 'Basic Information', 'Full name', true, true, true),
('azure', 'mail', 'Email', 'string', 'Contact Information', 'Primary email', true, true, true),
('azure', 'userType', 'User Type', 'string', 'Basic Information', 'Member or Guest', true, true, true),
('azure', 'accountEnabled', 'Account Enabled', 'boolean', 'Security', 'Account status', true, true, true),
('azure', 'createdDateTime', 'Created Date', 'datetime', 'Audit', 'Account creation date', true, true, true),
('azure', 'signInActivity', 'Sign-in Activity', 'object', 'Security', 'Last sign-in information', false, true, true),
('azure', 'assignedLicenses', 'Assigned Licenses', 'array', 'Licenses', 'Assigned license SKUs', true, false, true),

-- O365 Fields
('o365', 'userPrincipalName', 'User Principal Name', 'string', 'Basic Information', 'User identity', true, true, true),
('o365', 'displayName', 'Display Name', 'string', 'Basic Information', 'Display name', true, true, true),
('o365', 'mailboxSize', 'Mailbox Size', 'number', 'Storage', 'Mailbox size in MB', true, true, true),
('o365', 'itemCount', 'Item Count', 'number', 'Storage', 'Number of items', true, true, true),
('o365', 'lastActivityDate', 'Last Activity', 'datetime', 'Activity', 'Last activity date', true, true, true),
('o365', 'storageUsed', 'Storage Used', 'number', 'Storage', 'Storage used in bytes', true, true, true),
('o365', 'fileCount', 'File Count', 'number', 'Storage', 'Number of files', true, true, true),
('o365', 'activeFileCount', 'Active Files', 'number', 'Activity', 'Active file count', true, true, true),
('o365', 'assignedProducts', 'Assigned Products', 'array', 'Licenses', 'Assigned O365 products', true, false, true);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_report_templates_category ON report_templates(category);
CREATE INDEX IF NOT EXISTS idx_report_templates_active ON report_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_field_metadata_source ON field_metadata(source);
CREATE INDEX IF NOT EXISTS idx_field_metadata_category ON field_metadata(source, category);

-- Update sequences if needed
SELECT setval('report_templates_id_seq', COALESCE((SELECT MAX(id) FROM report_templates), 1), false);
SELECT setval('field_metadata_id_seq', COALESCE((SELECT MAX(id) FROM field_metadata), 1), false);