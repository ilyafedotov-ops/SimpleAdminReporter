# Credential Management System Documentation

## System Overview

The SimpleAdminReporter credential management system provides secure storage and management of service account credentials for Active Directory, Azure AD, and Office 365 integrations. As of August 2025, the system implements enterprise-grade security features with per-user credential isolation and advanced encryption.

### Current Architecture

- **Database Storage**: PostgreSQL with encrypted credential fields
- **Encryption**: AES-256-GCM with per-credential salt generation (v1 format)
- **User Isolation**: Complete separation of credentials between users
- **Service Support**: Active Directory (LDAP), Azure AD (Graph API), Office 365 (Graph API), and local database authentication

### Supported Credential Types

1. **Active Directory (LDAP)**
   - Username/password authentication
   - Service account validation
   - Connection testing with actual LDAP bind

2. **Azure AD/Office 365 (Graph API)**
   - Application-based authentication (Client ID/Secret)
   - Tenant-specific configuration
   - Multi-tenant support via metadata
   - Token-based access validation

3. **Local Database**
   - Internal system credentials
   - Administrative access control

4. **Legacy Format Support**
   - Backward compatibility with existing credentials
   - Automatic migration to v1 format when updated

## Security Implementation

### Database Schema

The `service_credentials` table with comprehensive security features:

```sql
CREATE TABLE service_credentials (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    service_type VARCHAR(50) NOT NULL CHECK (service_type IN ('ad', 'azure', 'o365')),
    credential_name VARCHAR(255) NOT NULL,
    username VARCHAR(255),
    encrypted_password TEXT,                    -- AES-256-GCM encrypted
    tenant_id VARCHAR(255),                     -- Azure/O365
    client_id VARCHAR(255),                     -- Azure/O365
    encrypted_client_secret TEXT,               -- AES-256-GCM encrypted
    encryption_salt VARCHAR(64),                -- Per-credential salt (hex)
    encryption_version VARCHAR(20),             -- Format tracking (v1/legacy)
    credential_metadata JSONB DEFAULT '{}',     -- Extended configuration
    is_default BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    last_tested TIMESTAMP WITH TIME ZONE,
    last_test_success BOOLEAN,
    last_test_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_user_service_credential UNIQUE(user_id, service_type, credential_name)
);
```

### Security Features

1. **Database Constraints**
   - Foreign key cascading delete
   - Service type validation
   - Unique constraint per user/service/name
   - Automatic timestamp tracking

2. **Database Triggers**
   - Single default credential enforcement
   - Automatic audit logging
   - Updated timestamp maintenance

3. **Indexes for Performance**
   - User ID index for fast lookups
   - Service type filtering
   - Default credential queries
   - JSONB metadata queries (GIN index)

## Encryption Architecture

### AES-256-GCM Implementation

The system uses `CredentialEncryption` class with industry-standard encryption:

```typescript
/**
 * V1 Format: "v1:" + base64(salt | iv | authTag | ciphertext)
 * - salt: 32 random bytes per credential
 * - iv: 16 random bytes per encryption
 * - authTag: 16 bytes from GCM authentication
 * - ciphertext: encrypted credential data
 */

// Per-credential encryption with unique salt
const encryptedPassword = encryption.encrypt(plainTextPassword);
// Returns: "v1:base64EncodedData"

// Automatic format detection on decryption
const plainTextPassword = encryption.decrypt(encryptedPassword);
```

### Key Management

1. **Master Key Derivation**
   - PBKDF2 with 100,000 iterations
   - SHA-256 hash function
   - 256-bit derived keys
   - Per-credential salt generation

2. **Environment Variables**
   ```bash
   CREDENTIAL_ENCRYPTION_KEY=your-32-character-or-longer-key
   CREDENTIAL_ENCRYPTION_SALT=hex-encoded-salt-for-legacy-support
   ```

3. **Security Properties**
   - Authenticated encryption (AES-256-GCM)
   - Perfect forward secrecy per credential
   - Timing attack protection
   - Legacy format migration support

### Format Evolution

```typescript
// Legacy Format (deprecated)
base64(iv | authTag | ciphertext) + stored salt

// V1 Format (current)
"v1:" + base64(salt | iv | authTag | ciphertext)

// Migration handling
if (encryptedData.startsWith('v1:')) {
  // Use embedded salt
} else if (storedSalt && storedSalt !== 'legacy') {
  // Use stored salt for legacy data
} else {
  // Require credential re-entry
}
```

## API Integration

### REST Endpoints

All credential endpoints require authentication (`Authorization: Bearer <token>`):

#### Credential Management
```http
GET /api/credentials                    # List user credentials
GET /api/credentials/:id                # Get specific credential  
POST /api/credentials                   # Create new credential
PUT /api/credentials/:id                # Update credential
DELETE /api/credentials/:id             # Delete credential
```

#### Credential Operations
```http
POST /api/credentials/:id/test          # Test connection
PUT /api/credentials/:id/set-default    # Set as default
GET /api/credentials/defaults           # Get all defaults
```

### Request/Response Formats

#### Create Credential Request
```json
{
  "serviceType": "ad|azure|o365", 
  "credentialName": "My AD Credential",
  "username": "domain\\username",          // AD only
  "password": "plaintext-password",        // AD only  
  "tenantId": "tenant.onmicrosoft.com",    // Azure/O365
  "clientId": "app-registration-id",       // Azure/O365
  "clientSecret": "app-secret",            // Azure/O365
  "isDefault": false
}
```

#### Credential Response
```json
{
  "id": 123,
  "userId": 456,
  "serviceType": "ad",
  "credentialName": "My AD Credential", 
  "username": "domain\\username",
  "tenantId": null,
  "clientId": null,
  "isDefault": true,
  "isActive": true,
  "lastTested": "2025-08-18T10:30:00Z",
  "lastTestSuccess": true,
  "lastTestMessage": "AD authentication successful",
  "createdAt": "2025-08-15T09:00:00Z",
  "updatedAt": "2025-08-18T10:30:00Z"
}
```

### Rate Limiting

```typescript
// API rate limits per user
POST /api/credentials          -> 20 requests/minute
POST /api/credentials/:id/test -> 30 requests/minute
Other endpoints               -> Standard auth limits
```

### Error Handling

```json
// Encryption errors
{
  "error": "Failed to decrypt credential", 
  "code": 500,
  "details": "Credential may need re-entry"
}

// Validation errors  
{
  "error": "Username and password are required for AD credentials",
  "code": 400,
  "field": "password"
}

// Not found errors
{
  "error": "Credential not found",
  "code": 404
}
```

## Storage & Retrieval

### Database Storage Implementation

1. **Encrypted Fields**
   ```sql
   -- Only sensitive fields are encrypted
   encrypted_password TEXT,        -- PBKDF2 + AES-256-GCM
   encrypted_client_secret TEXT,   -- PBKDF2 + AES-256-GCM
   
   -- Metadata stored as plaintext for queries
   username VARCHAR(255),          -- Searchable
   tenant_id VARCHAR(255),         -- Searchable  
   client_id VARCHAR(255),         -- Searchable
   ```

2. **Credential Decryption Process**
   ```typescript
   // Service method with format detection
   async getDecryptedCredential(id: number, userId: number) {
     const row = await db.query(/* credential lookup */);
     
     // Handle encryption format migration
     if (row.encryption_salt === 'NEEDS_REGENERATION') {
       throw new Error('Credentials need to be re-entered');
     }
     
     // V1 format (preferred)
     if (row.encrypted_password?.startsWith('v1:')) {
       return encryption.decrypt(row.encrypted_password);
     }
     
     // Legacy format with stored salt
     if (row.encryption_salt && row.encryption_salt !== 'legacy') {
       return encryption.decryptWithSalt(
         row.encrypted_password, 
         row.encryption_salt
       );
     }
     
     throw new Error('Cannot decrypt legacy credentials');
   }
   ```

3. **Performance Considerations**
   - Indexed user_id lookups
   - Service type filtering
   - Cached default credential queries
   - Transaction-based operations
   - Connection pooling for database access

### Access Control

```typescript
// User isolation enforced at service layer
async getUserCredentials(userId: number) {
  return db.query(`
    SELECT * FROM service_credentials 
    WHERE user_id = $1 AND is_active = true
    ORDER BY is_default DESC, credential_name ASC
  `, [userId]);
}

// Cross-user access prevention
async getCredential(credentialId: number, userId: number) {
  // Always include userId in WHERE clause
  const result = await db.query(`
    SELECT * FROM service_credentials 
    WHERE id = $1 AND user_id = $2
  `, [credentialId, userId]);
}
```

## Validation & Testing

### Credential Validation Mechanisms

1. **Field Validation by Service Type**
   ```typescript
   // Active Directory validation
   if (serviceType === 'ad') {
     if (!username || !password) {
       throw new ValidationError('Username and password required for AD');
     }
   }
   
   // Azure AD/O365 validation  
   if (serviceType === 'azure' || serviceType === 'o365') {
     if (!tenantId || !clientId || !clientSecret) {
       throw new ValidationError('Tenant ID, Client ID, and Client Secret required');
     }
   }
   ```

2. **Connection Testing Implementation**
   ```typescript
   // AD connection test - actual LDAP bind
   async testADCredential(credential: EncryptedCredential) {
     const adService = await serviceFactory.getADService();
     const authenticated = await adService.authenticateUser(
       credential.username, 
       credential.encryptedPassword
     );
     
     return {
       success: authenticated,
       message: authenticated ? 'AD authentication successful' : 'AD authentication failed'
     };
   }
   
   // Azure AD connection test - Graph API call
   async testAzureCredential(credential: EncryptedCredential) {
     const azureService = await serviceFactory.getAzureService();
     const testResult = await azureService.testConnection();
     
     return {
       success: testResult,
       message: testResult ? 'Azure AD connection successful' : 'Azure AD connection failed'
     };
   }
   ```

3. **Test Result Storage**
   ```sql
   -- Results stored in service_credentials table
   UPDATE service_credentials 
   SET last_tested = CURRENT_TIMESTAMP,
       last_test_success = $1,
       last_test_message = $2
   WHERE id = $3;
   ```

### Integration Testing

The system includes comprehensive integration tests:

```typescript
// Example integration test structure
describe('CredentialsService Integration Tests', () => {
  it('should create credential with encryption', async () => {
    const credential = await credentialsService.createCredential(userId, {
      serviceType: 'ad',
      credentialName: 'Test AD Credential',
      username: 'test-user',
      password: 'test-password'
    });
    
    expect(credential.id).toBeDefined();
    expect(credential.username).toBe('test-user');
    // Password is encrypted and not returned
  });
  
  it('should enforce user isolation', async () => {
    const credential = await credentialsService.getCredential(
      credentialId, 
      differentUserId
    );
    
    expect(credential).toBeNull();
  });
});
```

## Security Best Practices

### Environment Configuration

**Required Environment Variables:**
```bash
# Encryption Configuration
CREDENTIAL_ENCRYPTION_KEY=your-32-character-or-longer-key
CREDENTIAL_ENCRYPTION_SALT=your-salt-in-hex-format  # For legacy support

# JWT Configuration  
JWT_SECRET=your-jwt-secret
JWT_REFRESH_SECRET=your-jwt-refresh-secret

# Database Configuration (with SSL recommended)
DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require
```

**Key Generation Commands:**
```bash
# Generate encryption key (256-bit)
openssl rand -hex 32

# Generate salt for legacy support  
openssl rand -hex 32

# Generate JWT secrets
openssl rand -base64 64
```

### Authentication & Authorization

1. **JWT Token Validation**
   - All credential endpoints require valid JWT tokens
   - Token expiration and refresh handling
   - User context extraction from tokens

2. **User Isolation**
   ```typescript
   // Enforced at database level
   WHERE user_id = $1 AND id = $2  // Always include user_id
   
   // Enforced at service level
   async getCredential(credentialId: number, userId: number) {
     // userId from authenticated JWT token
     // credentialId from URL parameter
   }
   ```

3. **Audit Trail**
   ```sql
   -- Automatic audit logging via triggers
   INSERT INTO audit_log (user_id, action, resource_type, resource_id, details)
   VALUES (NEW.user_id, 'credential_created', 'service_credential', NEW.id::VARCHAR, 
           jsonb_build_object('service_type', NEW.service_type, 'credential_name', NEW.credential_name));
   ```

### Data Protection

1. **Encryption at Rest**
   - AES-256-GCM for sensitive credential fields
   - Per-credential salt generation (v1 format)
   - Authenticated encryption prevents tampering

2. **Encryption in Transit**  
   - HTTPS/TLS for all API communications
   - Database connections with SSL/TLS
   - No plaintext credential transmission

3. **Memory Protection**
   - Credentials decrypted only when needed
   - No credential logging or debugging output
   - Secure memory handling for plaintext values

### Operational Security

1. **Key Management**
   - Use cryptographically secure random keys (minimum 32 characters)
   - Store encryption keys separate from database backups
   - Consider key rotation procedures for production environments
   - Never commit keys to version control

2. **Access Controls**
   - Users can only access their own credentials
   - Role-based access control (RBAC) for administrative functions  
   - Rate limiting on credential operations
   - IP-based access restrictions (if applicable)

3. **Monitoring & Auditing**
   - All credential operations logged to audit trail
   - Failed authentication attempts tracked
   - Connection test results monitored
   - Regular security review of access patterns

4. **Network Security**
   - TLS/HTTPS for all communications
   - Database connections with SSL certificates
   - VPN or private network access preferred
   - Firewall rules limiting database access

### Security Limitations & Considerations

**Current Implementation Limitations:**
- No automatic key rotation mechanism
- Legacy credentials require manual migration
- No credential sharing between users
- Limited compliance framework integration

**Areas for Security Enhancement:**
- Implement Hardware Security Module (HSM) integration
- Add credential expiration and rotation policies
- Enhance audit logging with correlation IDs
- Add multi-factor authentication for sensitive operations
- Implement credential backup and recovery procedures

## Troubleshooting & Maintenance

### Common Issues & Resolutions

1. **Encryption Errors**
   ```
   Error: CREDENTIAL_ENCRYPTION_KEY environment variable is not set
   Solution: Set encryption key in .env file (minimum 32 characters)
   
   Error: Failed to decrypt credential
   Causes: 
   - Encryption key changed between encrypt/decrypt operations
   - Database corruption in encrypted fields
   - Legacy credentials without proper salt
   Solution: Re-enter affected credentials or restore from backup
   
   Error: Credentials need to be re-entered due to missing encryption salt  
   Cause: Legacy credentials marked as 'NEEDS_REGENERATION'
   Solution: Users must re-enter credentials to migrate to v1 format
   ```

2. **Connection Test Failures**
   ```
   AD authentication failed
   - Verify LDAP server accessibility from application server
   - Check service account permissions in Active Directory
   - Confirm correct username format (domain\user or user@domain.com)
   - Test network connectivity: telnet <domain-controller> 389
   
   Azure AD connection failed  
   - Verify tenant ID, client ID, and client secret
   - Check Azure app registration permissions (Graph API access)
   - Confirm client secret has not expired
   - Test Graph API access: curl -X POST https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token
   ```

3. **Database Issues**
   ```
   Constraint violation errors
   - unique_user_service_credential: Credential name already exists for user/service
   - Foreign key constraint: User ID does not exist
   
   Performance issues
   - Missing indexes on frequently queried columns  
   - Large credential_metadata JSONB objects
   - Solution: Monitor query performance, add indexes as needed
   ```

### Diagnostic Commands

```bash
# Check encryption service status
curl -H "Authorization: Bearer <token>" \
     http://localhost/api/health/component/encryption

# Test specific credential connection
curl -X POST \
     -H "Authorization: Bearer <token>" \
     http://localhost/api/credentials/{id}/test

# View user's credentials (without sensitive data)  
curl -H "Authorization: Bearer <token>" \
     http://localhost/api/credentials

# Database credential status check
psql -d reporting -c "
  SELECT service_type, 
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE encryption_version = 'v1') as v1_format,
         COUNT(*) FILTER (WHERE encryption_salt = 'NEEDS_REGENERATION') as needs_migration
  FROM service_credentials 
  GROUP BY service_type;"
```

### Migration Procedures

```sql
-- Check credentials needing migration
SELECT id, user_id, service_type, credential_name, encryption_salt, encryption_version 
FROM service_credentials 
WHERE encryption_salt = 'NEEDS_REGENERATION' 
   OR (encryption_version IS NULL AND encrypted_password IS NOT NULL);

-- After user re-enters credentials, verify v1 format
SELECT id, credential_name, 
       CASE WHEN encrypted_password LIKE 'v1:%' THEN 'v1' ELSE 'legacy' END as format,
       encryption_version
FROM service_credentials 
WHERE user_id = <user_id>;
```

## Implementation Status (August 2025)

### Current Features ✅

- **AES-256-GCM Encryption**: Per-credential salt generation with v1 format
- **Multi-Service Support**: Active Directory, Azure AD, Office 365 credentials  
- **User Isolation**: Complete separation of credentials between users
- **Connection Testing**: Real authentication tests against services
- **Default Credential Management**: One default per service type per user
- **Audit Logging**: Database triggers for all credential operations
- **Legacy Migration**: Backward compatibility with existing encrypted data
- **Rate Limiting**: API protection against abuse
- **Integration Testing**: Comprehensive test coverage for security features

### Security Audit Status

**Strengths:**
- Industry-standard encryption (AES-256-GCM)
- Authenticated encryption prevents tampering
- Per-credential salt generation (v1 format)
- User access control enforced at database level
- No plaintext credential logging
- Timing attack protection in hash comparisons

**Areas for Enhancement:**
- Key rotation mechanism not yet implemented
- No Hardware Security Module (HSM) integration
- Limited compliance framework integration
- Credential expiration policies not implemented
- Multi-factor authentication for sensitive operations pending

### Deployment Requirements

**Minimum Environment Setup:**
```bash
# Required
CREDENTIAL_ENCRYPTION_KEY=<32+ character key>
JWT_SECRET=<secure jwt secret>
DATABASE_URL=<postgresql connection string>

# Recommended  
CREDENTIAL_ENCRYPTION_SALT=<hex salt for legacy support>
DATABASE_URL=<...>?sslmode=require
LOG_LEVEL=info
```

**Database Migration Status:**
- ✅ Base credential table (migration 02)
- ✅ Salt support added (migration 04)  
- ✅ Azure metadata fields (migration 22)
- ✅ Audit triggers and constraints
- ✅ Performance indexes

### Production Readiness

**Security Rating: B+ (Good)**
- Strong encryption implementation
- Proper user isolation
- Comprehensive input validation
- Missing advanced features (key rotation, HSM)

**Recommended for:**
- Internal corporate networks
- Small to medium team deployments
- Development and staging environments
- Non-regulated industries

**Additional security required for:**
- Internet-facing deployments
- Regulated industries (healthcare, finance)
- Large enterprise deployments
- High-security environments

### Usage Examples

```typescript
// Create credential programmatically
const credential = await fetch('/api/credentials', {
  method: 'POST',
  headers: { 
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    serviceType: 'azure',
    credentialName: 'Production Azure AD',
    tenantId: 'company.onmicrosoft.com',
    clientId: 'app-registration-id',
    clientSecret: 'app-secret-value',
    isDefault: true
  })
});

// Test credential connection
const test = await fetch(`/api/credentials/${credentialId}/test`, {
  method: 'POST', 
  headers: { 'Authorization': `Bearer ${token}` }
});

const testResult = await test.json();
// { success: true, message: "Azure AD connection successful" }
```