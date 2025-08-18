# Azure Graph API Authentication Guide

## Overview

This guide explains how Azure Graph API authentication works in SimpleAdminReporter and the various options for specifying user and organization context.

## Authentication Methods

### 1. Application-Only Authentication (Current Implementation)

This is the default method used by SimpleAdminReporter:

```javascript
// Uses Client Credentials OAuth 2.0 flow
const credential = new ClientSecretCredential(
  tenantId,      // Organization ID
  clientId,      // Application ID
  clientSecret   // Application Secret
);
```

**Characteristics:**
- The application acts on its own behalf
- Uses **Application Permissions** (not Delegated Permissions)
- No user context - queries return all data the app has access to
- Best for backend services and automation

**Required Permissions in Azure AD:**
- `User.Read.All` - Read all users
- `Group.Read.All` - Read all groups
- `Directory.Read.All` - Read directory data
- `AuditLog.Read.All` - Read audit logs (optional)

### 2. Delegated Authentication (On-Behalf-Of Flow)

This allows the application to act on behalf of a specific user:

```javascript
// Requires user token from frontend authentication
const credential = new OnBehalfOfCredential({
  tenantId: tenantId,
  clientId: clientId,
  clientSecret: clientSecret,
  userAssertionToken: userAccessToken  // Token from user login
});
```

**Characteristics:**
- Application acts with the permissions of the signed-in user
- Results filtered based on what the user can see
- Requires **Delegated Permissions** in Azure AD
- User must consent to the permissions

### 3. Multi-Tenant Authentication

For querying multiple organizations:

```javascript
// Configure multi-tenant app in Azure AD
const credential = new ClientSecretCredential(
  tenantId,      // Can be 'common', 'organizations', or specific tenant
  clientId,      
  clientSecret   
);
```

**Tenant Options:**
- `{tenant-id}` - Specific organization only
- `common` - Both work/school accounts and Microsoft accounts
- `organizations` - Work/school accounts only
- `consumers` - Microsoft accounts only

## Specifying Organization Context

### Method 1: Per-Credential Tenant ID

Store different credentials for different organizations:

```sql
-- In service_credentials table
INSERT INTO service_credentials (
  user_id, 
  service_type, 
  credential_name, 
  encrypted_data
) VALUES (
  1, 
  'azure', 
  'Contoso Azure AD',
  '{"tenantId": "contoso.onmicrosoft.com", "clientId": "...", "clientSecret": "..."}'
);
```

### Method 2: Dynamic Tenant Switching

```javascript
// In enhanced service
async executeQueryForTenant(query, tenantId) {
  // Override default tenant
  const connection = await this.createConnection({
    ...this.config,
    tenantId: tenantId  // Specific organization
  });
  
  return this.executeWithConnection(connection, query);
}
```

### Method 3: Cross-Tenant Queries

For multi-tenant applications with appropriate permissions:

```javascript
// Query users across all accessible tenants
const result = await client
  .api('/users')
  .header('x-ms-tenant-id', 'tenant1.onmicrosoft.com,tenant2.onmicrosoft.com')
  .get();
```

## Specifying User Context

### Method 1: User Impersonation Headers

Some Graph API endpoints support user context headers:

```javascript
const result = await client
  .api('/users')
  .header('X-AnchorMailbox', 'UPN:user@domain.com')
  .header('ConsistencyLevel', 'eventual')
  .get();
```

### Method 2: Scoped Queries

Use Graph API filters to limit results to specific users:

```javascript
// Get data for specific user
const result = await client
  .api('/users')
  .filter(`userPrincipalName eq 'user@domain.com'`)
  .get();

// Get user's direct reports
const reports = await client
  .api('/users/user@domain.com/directReports')
  .get();
```

### Method 3: "Me" Endpoint (Delegated Only)

When using delegated authentication:

```javascript
// Get current user's data
const me = await client.api('/me').get();

// Get current user's manager
const manager = await client.api('/me/manager').get();
```

## Implementation Examples

### Example 1: Query as Application for Specific Tenant

```typescript
// In your report execution
const credentials = await getCredentialsForTenant('contoso.onmicrosoft.com');
const result = await azureService.executeQuery({
  endpoint: '/users',
  filters: [{ field: 'accountEnabled', value: true }]
}, {
  tenantId: credentials.tenantId,
  clientId: credentials.clientId,
  clientSecret: credentials.clientSecret
});
```

### Example 2: Query with User Context

```typescript
// Enhanced query with user context
const result = await enhancedAzureService.executeQueryAsUser(
  {
    endpoint: '/users',
    select: ['displayName', 'mail', 'department']
  },
  'john.doe@contoso.com'  // Run query in context of this user
);
```

### Example 3: Multi-Organization Report

```typescript
// Query multiple tenants
const tenants = ['org1.onmicrosoft.com', 'org2.onmicrosoft.com'];
const results = [];

for (const tenantId of tenants) {
  const result = await azureService.executeQueryForOrganization(
    { endpoint: '/users', top: 100 },
    tenantId
  );
  results.push({
    tenant: tenantId,
    data: result.data
  });
}
```

## Security Considerations

### 1. Application Permissions
- **Pros**: Consistent access, good for automation
- **Cons**: Broad access, no user context
- **Best Practice**: Use least privilege principle

### 2. Delegated Permissions
- **Pros**: User context, follows user permissions
- **Cons**: Requires user authentication, limited by user access
- **Best Practice**: Use for user-facing features

### 3. Multi-Tenant Access
- **Requirement**: Admin consent in each tenant
- **Security**: Each tenant controls what data is accessible
- **Audit**: All access is logged in tenant audit logs

## Configuration in SimpleAdminReporter

### 1. Single Tenant Setup
```env
AZURE_TENANT_ID=contoso.onmicrosoft.com
AZURE_CLIENT_ID=your-app-id
AZURE_CLIENT_SECRET=your-secret
```

### 2. Multi-Tenant Setup
```env
AZURE_TENANT_ID=common  # or 'organizations'
AZURE_CLIENT_ID=your-app-id
AZURE_CLIENT_SECRET=your-secret
```

### 3. Per-User Credential Management (Current Implementation)
The application uses the `service_credentials` table for per-user Azure AD credentials:

```sql
-- Users store their own Azure AD credentials
INSERT INTO service_credentials (
  user_id, 
  service_type, 
  credential_name,
  encrypted_data,
  salt
) VALUES (
  1, 
  'azure', 
  'Contoso Azure AD',
  '{"tenantId": "contoso.onmicrosoft.com", "clientId": "...", "clientSecret": "..."}',
  'user-specific-salt'
);
```

Each user can configure multiple Azure AD connections:
- Credential 1: Contoso (contoso.onmicrosoft.com)
- Credential 2: Fabrikam (fabrikam.onmicrosoft.com)
- Credential 3: Multi-tenant (common)

### 4. Credential Storage Security
- **Encryption**: AES-256-GCM with per-credential salts
- **Access Control**: Users can only access their own credentials
- **Testing**: Credential validation before storage

## Best Practices

1. **Least Privilege**: Only request permissions you need
2. **Consent**: Get admin consent for application permissions
3. **Caching**: Cache tokens to reduce authentication calls
4. **Error Handling**: Handle tenant-specific errors gracefully
5. **Audit**: Log which tenant/user context is used for queries
6. **Rate Limiting**: Implement per-tenant rate limiting

## Common Scenarios

### Scenario 1: MSP Managing Multiple Customers
- Use multi-tenant app registration
- Store credentials per customer
- Execute queries with specific tenant context

### Scenario 2: Large Organization with Subsidiaries
- Single app registration in parent tenant
- Guest access to subsidiary tenants
- Query with organizational unit filters

### Scenario 3: User Self-Service Reporting
- Use delegated permissions
- Implement on-behalf-of flow
- Results automatically scoped to user's access

## Troubleshooting

### Issue: "Insufficient privileges"
- Check if app has required permissions
- Verify admin consent was granted
- For delegated: check user's permissions

### Issue: "Tenant not found"
- Verify tenant ID is correct
- Check if app is registered in tenant
- For multi-tenant: ensure app is consented in target tenant

### Issue: "Invalid audience"
- Token issued for wrong tenant
- Check token's `aud` claim matches Graph API
- Verify correct authority URL is used