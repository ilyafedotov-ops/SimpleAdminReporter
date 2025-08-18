# Azure AD Integration Setup Guide

**Document Version:** 2.0  
**Last Updated:** August 18, 2025  
**Application Version:** 1.0.0  
**Integration Status:** ⚠️ **PARTIAL IMPLEMENTATION** - See [Current Status](#current-status) for details

## Overview

This guide provides comprehensive instructions for configuring Azure AD integration in SimpleAdminReporter. The application supports Azure AD authentication and Microsoft Graph API access for reporting on Azure AD users, groups, and security data.

**⚠️ IMPORTANT DISCLAIMER**: Azure AD integration is currently at **partial implementation status**. While the underlying architecture and services are built, the complete end-to-end flow requires additional configuration and testing. See the [Current Status](#current-status) section for what's working and what needs completion.

## Table of Contents

1. [Current Status](#current-status)
2. [Architecture Overview](#architecture-overview)
3. [Prerequisites](#prerequisites)
4. [Azure AD App Registration](#azure-ad-app-registration)
5. [Environment Configuration](#environment-configuration)
6. [MSAL Configuration](#msal-configuration)
7. [Graph API Integration](#graph-api-integration)
8. [Authentication Flow](#authentication-flow)
9. [Available Reports](#available-reports)
10. [Testing & Validation](#testing--validation)
11. [Troubleshooting](#troubleshooting)
12. [Known Limitations](#known-limitations)
13. [Implementation Roadmap](#implementation-roadmap)

## Current Status

### ✅ **Implemented and Working**

#### Core Services Architecture
- **AzureMsalService** (`/backend/src/services/azure-msal.service.ts`)
  - Microsoft Graph client initialization
  - App-only and delegated authentication flows
  - Token management with refresh capabilities
  - Connection pooling and error handling

- **MsalTokenManager** (`/backend/src/services/msal-token-manager.service.ts`)
  - Client credentials flow for app-only tokens
  - Delegated token acquisition and refresh
  - Redis-based token caching with TTL
  - Secure token encryption and storage

- **Graph API Utilities** (`/backend/src/utils/graph-utils.ts`)
  - Request building and response parsing
  - Error handling and rate limiting
  - Endpoint configuration and batch support

#### Authentication Controllers
- **AzureAuthController** (`/backend/src/auth/controllers/azure-auth.controller.ts`)
  - OAuth authorization URL generation with PKCE
  - Token exchange with authorization code flow
  - Secure credential storage with encryption
  - User info retrieval from Microsoft Graph

- **UnifiedAuthController** - Azure AD integration points
  - Multi-source authentication including Azure AD
  - Token management within unified auth system

#### Graph API Query System
- **Query Definitions** (`/backend/src/queries/graph/`)
  - 15+ pre-built Azure AD reports
  - Structured query definitions with parameters
  - Post-processing and transformation functions
  - Field mappings for display

- **Graph Query Executor** (`/backend/src/services/graph-query-executor.service.ts`)
  - Query execution with parameter validation
  - Batch query support for performance
  - Result transformation and caching

#### Health Monitoring
- **AzureHealthChecker** (`/backend/src/services/health/checkers/azure-health-checker.ts`)
  - Connection status verification
  - Configuration validation
  - Network connectivity testing

#### Security Features
- **Token Encryption**: AES-256-GCM encryption for stored tokens
- **PKCE Flow**: PKCE-enabled OAuth flow for enhanced security
- **Credential Management**: Encrypted storage with user-specific keys
- **CSRF Protection**: State validation for OAuth flows

### ⚠️ **Partially Implemented**

#### Frontend Integration
- **Status**: Basic MSAL configuration exists but needs integration testing
- **Available**: Frontend MSAL config (`/frontend/src/config/msal.config.ts`)
- **Missing**: Complete UI flow for Azure AD authentication

#### Token Refresh Flow
- **Status**: Backend infrastructure ready, needs end-to-end testing
- **Available**: Refresh token handling in MsalTokenManager
- **Missing**: Automatic token refresh in frontend

### ❌ **Not Yet Implemented**

#### Production Deployment Testing
- **Status**: Local development only
- **Missing**: Production environment configuration validation
- **Missing**: SSL/HTTPS configuration for OAuth redirects

#### Advanced Graph API Features
- **Status**: Basic queries implemented
- **Missing**: Advanced Graph API features (batching, delta queries)
- **Missing**: Real-time change notifications

## Architecture Overview

The Azure AD integration follows a multi-layer architecture:

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend Layer                           │
├─────────────────────────────────────────────────────────────────┤
│  • React App with MSAL Provider                                │
│  • Azure AD Login Components                                   │
│  • Token Management in Redux Store                             │
└─────────────────────────────────────────────────────────────────┘
                                    │
┌─────────────────────────────────────────────────────────────────┐
│                      API Gateway Layer                         │
├─────────────────────────────────────────────────────────────────┤
│  • Authentication Middleware                                   │
│  • Azure OAuth Controllers                                     │
│  • PKCE Validation                                            │
└─────────────────────────────────────────────────────────────────┘
                                    │
┌─────────────────────────────────────────────────────────────────┐
│                      Service Layer                             │
├─────────────────────────────────────────────────────────────────┤
│  • AzureMsalService (Graph client)                            │
│  • MsalTokenManager (Token management)                        │
│  • GraphQueryExecutor (Query execution)                       │
└─────────────────────────────────────────────────────────────────┘
                                    │
┌─────────────────────────────────────────────────────────────────┐
│                      Data Layer                                │
├─────────────────────────────────────────────────────────────────┤
│  • Redis (Token cache)                                        │
│  • PostgreSQL (Credential storage)                            │
│  • Microsoft Graph API                                        │
└─────────────────────────────────────────────────────────────────┘
```

## Prerequisites

### Technical Requirements
1. **Azure AD Tenant** with administrative access
2. **Application Registration** permissions in Azure AD
3. **Microsoft Graph API** access (requires admin consent for certain permissions)
4. **SSL/TLS Certificate** for production OAuth redirects
5. **Network Access** to Microsoft Graph API endpoints

### Required Permissions
- **Application.ReadWrite.OwnedBy** (to manage app registration)
- **Directory.Read.All** (to read directory objects)
- **User.Read.All** (to read user profiles)
- **Group.Read.All** (to read group information)
- **Reports.Read.All** (for usage reports)

## Azure AD App Registration

### Step 1: Create App Registration

1. Navigate to **Azure Portal** > **Azure Active Directory** > **App registrations**
2. Click **"New registration"**
3. Configure the registration:

```
Name: SimpleAdminReporter
Supported account types: Accounts in this organizational directory only
Redirect URI: 
  - Type: Web
  - URL: https://your-domain.com/auth/azure/callback
```

### Step 2: Configure Authentication

1. Go to **Authentication** section
2. Add additional redirect URIs if needed:
   ```
   https://your-domain.com/auth/azure/callback
   http://localhost:3000/auth/azure/callback (for development)
   ```
3. Enable **Access tokens** and **ID tokens**
4. Configure **Supported account types** as needed

### Step 3: Generate Client Secret

1. Go to **Certificates & secrets**
2. Click **"New client secret"**
3. Set description: "SimpleAdminReporter Secret"
4. Set expiration: **24 months** (recommended)
5. **⚠️ IMPORTANT**: Copy the secret value immediately - it won't be shown again

### Step 4: Configure API Permissions

Add the following **Microsoft Graph** permissions:

#### Application Permissions (for app-only access)
```
Directory.Read.All          - Read directory data
User.Read.All              - Read all users' full profiles
Group.Read.All             - Read all groups
Reports.Read.All           - Read usage reports
Organization.Read.All      - Read organization information
```

#### Delegated Permissions (for user access)
```
User.Read                  - Sign in and read user profile
Directory.Read.All         - Read directory data
Group.Read.All             - Read all groups
Reports.Read.All           - Read usage reports
```

### Step 5: Grant Admin Consent

1. Click **"Grant admin consent for [your organization]"**
2. Confirm the consent for all requested permissions
3. Verify all permissions show "Granted for [organization]"

### Step 6: Record Configuration Details

Save the following information for environment configuration:
- **Application (client) ID**
- **Directory (tenant) ID**
- **Client secret value** (from Step 3)

## Environment Configuration

### Required Environment Variables

Add the following to your `.env` file:

```bash
# Azure AD Configuration
AZURE_TENANT_ID=your-tenant-id-from-app-registration
AZURE_CLIENT_ID=your-client-id-from-app-registration  
AZURE_CLIENT_SECRET=your-client-secret-from-step-3

# Base URL for OAuth redirects
BASE_URL=https://your-domain.com
# For development:
# BASE_URL=http://localhost:5000

# Token Encryption (Required for secure token storage)
# Generate with: openssl rand -base64 32
ENCRYPTION_KEY=your-base64-encoded-encryption-key

# Redis Configuration (for token caching)
REDIS_URL=redis://redis:6379
REDIS_PASSWORD=your-redis-password
```

### Configuration Validation

The application includes configuration validation:

```typescript
// These will be rejected as invalid:
AZURE_TENANT_ID=placeholder-tenant-id
AZURE_CLIENT_ID=placeholder-client-id  
AZURE_CLIENT_SECRET=placeholder-client-secret
```

Use real values from your Azure AD app registration.

## MSAL Configuration

### Backend MSAL Setup

The backend uses **@azure/msal-node** for server-side authentication:

```typescript
// Located in: /backend/src/services/msal-token-manager.service.ts
const msalClient = new ConfidentialClientApplication({
  auth: {
    clientId: process.env.AZURE_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
    clientSecret: process.env.AZURE_CLIENT_SECRET,
  },
  system: {
    loggerOptions: {
      logLevel: 3, // Info level
      piiLoggingEnabled: false
    }
  }
});
```

### Frontend MSAL Setup

Frontend configuration is available in `/frontend/src/config/msal.config.ts`:

```typescript
export const msalConfig = {
  auth: {
    clientId: process.env.REACT_APP_AZURE_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${process.env.REACT_APP_AZURE_TENANT_ID}`,
    redirectUri: window.location.origin + "/auth/azure/callback"
  },
  cache: {
    cacheLocation: "localStorage",
    storeAuthStateInCookie: false
  }
};
```

## Graph API Integration

### Available Graph API Endpoints

The application supports the following Microsoft Graph API endpoints:

| Endpoint | Purpose | Implementation Status |
|----------|---------|----------------------|
| `/users` | User management and profiles | ✅ Implemented |
| `/groups` | Group information and membership | ✅ Implemented |
| `/organization` | Tenant information | ✅ Implemented |
| `/reports/getOffice365ActiveUserDetail` | User activity reports | ✅ Implemented |
| `/reports/getOffice365GroupsActivityDetail` | Groups activity | ✅ Implemented |
| `/directoryRoles` | Directory roles and assignments | ✅ Implemented |
| `/security/riskDetections` | Security risk information | ✅ Implemented |

### Query Execution Flow

1. **Token Acquisition**: App-only or delegated token from MSAL
2. **Graph Client Creation**: Microsoft Graph SDK client initialization
3. **Query Building**: Dynamic query construction with parameters
4. **API Call**: HTTP request to Microsoft Graph
5. **Response Processing**: JSON parsing and transformation
6. **Caching**: Redis-based result caching for performance

### Example Graph API Query

```typescript
// Execute a user query
const query: AzureQuery = {
  type: 'users',
  endpoint: '/users',
  graphOptions: {
    select: ['displayName', 'userPrincipalName', 'accountEnabled'],
    filter: "accountEnabled eq true",
    top: 100
  }
};

const result = await azureMsalService.executeQuery(query);
```

## Authentication Flow

### OAuth 2.0 Authorization Code Flow with PKCE

The application implements the secure OAuth 2.0 flow:

#### Step 1: Authorization URL Generation
```typescript
POST /api/auth/azure/authorize
{
  "scopes": ["https://graph.microsoft.com/.default"]
}

Response:
{
  "authUrl": "https://login.microsoftonline.com/...",
  "state": "secure-random-state"
}
```

#### Step 2: User Authentication
- User redirects to Azure AD login page
- User authenticates with Azure AD credentials
- Azure AD redirects back with authorization code

#### Step 3: Token Exchange
```typescript
POST /api/auth/azure/token
{
  "code": "authorization-code-from-azure",
  "state": "state-from-step-1"
}

Response:
{
  "message": "Authentication successful",
  "expiresAt": 1692345600000
}
```

#### Step 4: Token Storage
- Tokens encrypted with AES-256-GCM
- Stored in PostgreSQL with user association
- Redis caching for performance
- Automatic refresh handling

### Token Lifecycle Management

1. **Access Token**: 1-hour lifespan, cached in Redis
2. **Refresh Token**: Long-lived, stored encrypted in database  
3. **Token Refresh**: Automatic background refresh when needed
4. **Token Revocation**: Clean up on user logout

## Available Reports

### User Reports
| Report ID | Name | Description | Status |
|-----------|------|-------------|---------|
| `azure_guest_users` | Guest Users | External users in tenant | ✅ Ready |
| `azure_inactive_users` | Inactive Users | Users with no recent sign-ins | ✅ Ready |
| `azure_mfa_status` | MFA Status | Multi-factor authentication status | ✅ Ready |
| `azure_disabled_users` | Disabled Users | Accounts that are disabled | ✅ Ready |

### Security Reports
| Report ID | Name | Description | Status |
|-----------|------|-------------|---------|
| `azure_privileged_roles` | Privileged Roles | Users with admin roles | ✅ Ready |
| `azure_risky_users` | Risky Users | Users with security risks | ✅ Ready |
| `azure_conditional_access` | Conditional Access | Policy assignments | ⚠️ Partial |

### Group Reports
| Report ID | Name | Description | Status |
|-----------|------|-------------|---------|
| `azure_group_members` | Group Membership | Members of security groups | ✅ Ready |
| `azure_empty_groups` | Empty Groups | Groups with no members | ✅ Ready |

### Usage Reports (O365)
| Report ID | Name | Description | Status |
|-----------|------|-------------|---------|
| `o365_user_activity` | User Activity | Office 365 usage metrics | ✅ Ready |
| `o365_mailbox_usage` | Mailbox Usage | Exchange mailbox statistics | ✅ Ready |
| `o365_teams_usage` | Teams Usage | Teams activity and usage | ✅ Ready |

## Testing & Validation

### Health Check Validation

Test Azure AD connectivity:

```bash
# Authenticated health check
curl -H "Authorization: Bearer <token>" \
  http://localhost:5000/api/health/component/azure

Expected Response:
{
  "status": "healthy",
  "message": "Azure AD connection successful", 
  "responseTime": 150,
  "details": {
    "tenantId": "your-tenant-id",
    "connected": true
  }
}
```

### Connection Testing

Test MSAL token acquisition:

```bash
# Test app-only token
node -e "
const { msalTokenManager } = require('./dist/services/msal-token-manager.service');
msalTokenManager.getAppOnlyToken()
  .then(token => console.log('Token acquired:', token.substring(0, 20) + '...'))
  .catch(err => console.error('Error:', err.message));
"
```

### Graph API Testing

Test Graph API connectivity:

```bash
# Using the test script
npm run test:graph

# Or manual test
node backend/src/scripts/test-graph-queries.js
```

### Report Execution Testing

Test Azure AD reports:

```bash
# Test guest users report
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  http://localhost:5000/api/reports/execute/azure_guest_users \
  -d '{"parameters": {}}'
```

## Troubleshooting

### Common Configuration Issues

#### 1. "Azure AD configuration incomplete" Error
```bash
Error: Azure AD configuration incomplete. Please check AZURE_* environment variables.

Solution:
- Verify all three environment variables are set:
  - AZURE_TENANT_ID
  - AZURE_CLIENT_ID  
  - AZURE_CLIENT_SECRET
- Ensure values are not placeholder strings
```

#### 2. "Failed to acquire access token" Error
```bash
AADSTS70011: The provided value for the input parameter 'scope' is not valid

Solution:
- Check that app registration has the required API permissions
- Ensure admin consent has been granted
- Verify scopes in the request match configured permissions
```

#### 3. "Token exchange failed" Error
```bash
AADSTS50011: The redirect URI specified in the request does not match

Solution:
- Verify BASE_URL environment variable matches app registration
- Check redirect URI in Azure AD app registration matches:
  {BASE_URL}/auth/azure/callback
- For development, ensure localhost URLs are registered
```

#### 4. "Connection timeout" Error
```bash
Azure AD connection timeout

Solution:
- Check network connectivity to login.microsoftonline.com
- Verify firewall settings allow HTTPS traffic
- Test DNS resolution for Microsoft endpoints
```

### Graph API Issues

#### 1. "Insufficient privileges" Error
```bash
Forbidden - Insufficient privileges to complete the operation

Solution:
- Review required permissions in Azure AD app registration
- Grant admin consent for application permissions
- For delegated permissions, ensure user has required roles
```

#### 2. "Application not found" Error
```bash
AADSTS700016: Application with identifier 'xxx' was not found

Solution:
- Verify AZURE_CLIENT_ID matches the Application ID from app registration
- Ensure app registration exists and is not deleted
- Check tenant ID matches the tenant where app is registered
```

### Token Management Issues

#### 1. "Token decryption failed" Error
```bash
Failed to decrypt token

Solution:
- Verify ENCRYPTION_KEY environment variable is set
- Ensure encryption key is valid base64-encoded string
- Check that key hasn't changed since tokens were encrypted
```

#### 2. "Redis connection failed" Error  
```bash
Redis connection failed - token caching disabled

Solution:
- Verify Redis service is running
- Check REDIS_URL environment variable
- Test Redis connectivity: redis-cli ping
```

### Network and SSL Issues

#### 1. OAuth Redirect Issues in Production
```bash
redirect_uri_mismatch error

Solution:
- Ensure BASE_URL uses HTTPS in production
- Add both HTTP and HTTPS redirect URIs during development
- Verify SSL certificate is valid and trusted
```

#### 2. CORS Issues
```bash
Cross-Origin Request Blocked

Solution:
- Configure CORS_ORIGIN environment variable
- Include all domains that will access the application
- For development, include http://localhost:3000
```

## Known Limitations

### Current Implementation Limitations

1. **Frontend Integration**: Basic MSAL configuration exists but needs complete integration testing
2. **Production Testing**: Limited testing in production environments with SSL
3. **Advanced Graph Features**: Batch operations and delta queries not fully implemented
4. **Error Recovery**: Some error scenarios need enhanced recovery mechanisms
5. **Token Refresh**: Automatic token refresh in frontend needs completion

### Microsoft Graph API Limitations

1. **Rate Limiting**: Graph API has throttling limits (10,000 requests per 10 minutes)
2. **Permission Scope**: Some reports require specific admin roles
3. **Data Freshness**: Some reports have up to 48-hour delays
4. **Regional Restrictions**: Some features may not be available in all regions

### Security Considerations

1. **Client Secret Expiration**: Client secrets expire and need renewal
2. **Token Storage**: Encrypted tokens are only as secure as the encryption key
3. **Network Security**: OAuth flows require HTTPS in production
4. **Audit Trail**: Token usage should be monitored for security

## Implementation Roadmap

### Phase 1: Current Status (Completed)
- ✅ Core service architecture
- ✅ MSAL token management  
- ✅ Graph API query system
- ✅ Basic authentication flow
- ✅ Health monitoring
- ✅ Security encryption

### Phase 2: Integration Completion (In Progress)
- ⏳ Frontend MSAL provider integration
- ⏳ End-to-end authentication testing
- ⏳ Production SSL configuration
- ⏳ Token refresh flow completion

### Phase 3: Advanced Features (Planned)
- 📋 Graph API batch operations
- 📋 Delta queries for change tracking
- 📋 Real-time notifications
- 📋 Advanced error recovery
- 📋 Performance optimization

### Phase 4: Production Hardening (Future)
- 📋 Load testing and optimization
- 📋 Enhanced monitoring and alerting
- 📋 Compliance and audit features
- 📋 Multi-tenant support

## Getting Started

### Quick Start for Development

1. **Set up Azure AD app registration** (follow steps above)

2. **Configure environment variables**:
```bash
cp .env.example .env
# Edit .env with your Azure AD values
```

3. **Start the application**:
```bash
docker-compose up -d
```

4. **Test Azure AD connectivity**:
```bash
# Check health endpoint
curl -H "Authorization: Bearer <token>" \
  http://localhost/api/health/component/azure
```

5. **Try Azure AD authentication**:
- Navigate to application in browser
- Attempt Azure AD login flow
- Check logs for any configuration issues

### Production Deployment Checklist

- [ ] Azure AD app registration completed
- [ ] SSL certificate configured
- [ ] Production redirect URIs added
- [ ] Environment variables set
- [ ] Admin consent granted for all permissions
- [ ] Network connectivity to Microsoft Graph verified
- [ ] Token encryption key generated securely
- [ ] Redis cache configured
- [ ] Health checks responding correctly
- [ ] End-to-end authentication flow tested

## Support

For technical support with Azure AD integration:

1. **Check logs**: Application logs contain detailed error information
2. **Health endpoints**: Use authenticated health checks for status
3. **Azure AD logs**: Check Azure AD sign-in logs for OAuth flow issues
4. **Graph API logs**: Microsoft Graph has usage and error reporting
5. **Documentation**: Refer to Microsoft Graph API documentation

**Note**: This integration requires ongoing maintenance for client secret renewal and permission updates as Microsoft Graph API evolves.

---

**Document Maintained by**: Development Team  
**Next Review**: September 15, 2025  
**Status**: ⚠️ Partial Implementation - Core infrastructure complete, integration testing needed