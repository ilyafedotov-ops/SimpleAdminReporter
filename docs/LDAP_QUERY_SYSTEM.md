# LDAP Query System Documentation

## Overview

The SimpleAdminReporter implements a sophisticated LDAP query system with modular query definitions, user-specific credential management, and comprehensive security measures. This system provides pre-built reports for Active Directory analysis and supports custom query building with field discovery.

## Architecture

### Query Definition Files

All LDAP queries are defined in separate TypeScript files under `/backend/src/queries/ldap/`:

```
backend/src/queries/ldap/
├── types.ts                           # TypeScript interfaces and utility functions
├── index.ts                           # Central query registry
├── ldap-queries.integration.test.ts   # Comprehensive integration tests
├── users/                             # User-related queries (8 reports)
│   ├── index.ts
│   ├── inactive-users.ts
│   ├── disabled-users.ts
│   ├── locked-accounts.ts
│   ├── password-expiry.ts
│   ├── never-expiring-passwords.ts
│   ├── privileged-users.ts
│   ├── recent-lockouts.ts
│   └── recent-password-changes.ts
├── computers/                         # Computer-related queries (4 reports)
│   ├── index.ts
│   ├── disabled-computers.ts
│   ├── inactive-computers.ts
│   ├── domain-servers.ts
│   └── os-summary.ts
└── groups/                            # Group-related queries (1 report)
    ├── index.ts
    └── empty-groups.ts
```

### Query Structure

Each query is defined using the `LDAPQueryDefinition` interface:

```typescript
interface LDAPQueryDefinition {
  id: string;                           // Unique identifier matching report_type
  name: string;                         // Human-readable display name
  description: string;                  // Detailed description for users
  category: 'users' | 'computers' | 'groups' | 'general'; // Query category
  
  query: {                              // LDAP search configuration
    base?: string;                      // Optional, defaults to AD_BASE_DN
    scope: 'base' | 'one' | 'sub';      // Search scope
    filter: string;                     // LDAP filter with parameter placeholders
    attributes: string[];               // Attributes to retrieve
    sizeLimit?: number;                 // Max results (default: 1000)
    timeLimit?: number;                 // Query timeout in seconds
  };
  
  parameters?: {                        // Runtime parameters (optional)
    [key: string]: {
      type: 'string' | 'number' | 'boolean' | 'date';
      required: boolean;                // Whether parameter is required
      default?: any;                    // Default value if not provided
      description?: string;             // Parameter description
      transform?: 'daysToTimestamp' | 'hoursToTimestamp' | 
                 'daysToPasswordExpiry' | 'daysToFileTime'; // Parameter transformation
    };
  };
  
  postProcess?: {                       // Post-query processing (optional)
    filter?: {                          // Additional result filtering
      field: string;
      operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'ne' | 'contains' | 'startsWith';
      value: string | number;           // Can reference parameters with {{paramName}}
    }[];
    sort?: {                           // Result sorting
      field: string;
      direction: 'asc' | 'desc';
    };
    limit?: number;                    // Limit results after processing
  };
  
  fieldMappings?: {                     // Field display and transformation
    [ldapField: string]: {
      displayName: string;              // User-friendly field name
      type?: 'string' | 'number' | 'date' | 'boolean' | 'array';
      transform?: 'fileTimeToDate' | 'dnToName' | 'userAccountControlToFlags'; // Field transformation
    };
  };
}
```

## LDAP Service Architecture

### ADService (Main LDAP Service)

The `ADService` extends `BaseDataSourceService` and handles:

1. **Connection Management**: LDAP connection pooling with automatic cleanup
2. **Credential Management**: User-specific and system credential integration
3. **Query Execution**: LDAP search operations with proper error handling
4. **Security**: LDAP injection prevention and input sanitization
5. **Performance**: Connection pooling, caching, and query optimization

### Report Execution Flow

```typescript
// Actual execution flow through ReportExecutorService
const result = await reportExecutor.executeReport({
  userId: 1,
  templateId: 'inactive_users',
  parameters: { days: 90 },
  credentialId: 123 // Optional specific credential
});
```

### Service Integration

The system integrates through:
- **ServiceFactory**: Dependency injection and service lifecycle management
- **ReportExecutorService**: High-level report execution with credential resolution
- **QueryService**: Unified query interface across data sources
- **CredentialContextManager**: User-specific credential management

## Parameter Transformations

The system supports automatic parameter transformations in query definitions:

| Transform | Description | Example |
|-----------|-------------|---------|  
| `daysToTimestamp` | Converts days to Unix timestamp | 90 → 1735689600 |
| `hoursToTimestamp` | Converts hours to Unix timestamp | 24 → 86400 |
| `daysToPasswordExpiry` | Days until password expiry | 30 → calculated based on policy |
| `daysToFileTime` | Converts days to Windows FileTime | 90 → "132850560000000000" |

### Utility Functions Available

```typescript
// From ldap-utils.ts
daysToWindowsFileTime(days: number): string
hoursToWindowsFileTime(hours: number): string  
windowsFileTimeToDate(fileTime: string): Date | null
dateToWindowsFileTime(date: Date): string
```

## Field Transformations

Field values are transformed for display in query results:

| Transform | Description | Example |
|-----------|-------------|---------|
| `fileTimeToDate` | Converts Windows FileTime to Date | "132850560000000000" → Date object |
| `dnToName` | Extracts name from Distinguished Name | "CN=John Doe,OU=Users,DC=example,DC=com" → "John Doe" |
| `userAccountControlToFlags` | Decodes UAC flags | 514 → "Account Disabled" |

### Additional Utility Functions

```typescript
// From ldap-utils.ts
isAccountDisabled(uac: number): boolean
isAccountLocked(lockoutTime: string): boolean
isPasswordNeverExpires(uac: number): boolean
parseOrganizationalUnit(dn: string): string
parseManagerDN(managerDN: string): string
```

## Available Pre-built Reports

### User Queries (8 Reports)
- `inactive_users` - Users who haven't logged in for specified days (with department, title, manager)
- `disabled_users` - All disabled user accounts with account details
- `locked_accounts` - Currently locked user accounts with lockout information
- `password_expiry` - Passwords expiring within specified days
- `never_expiring_passwords` - User accounts with passwords set to never expire
- `privileged_users` - Members of administrative groups (Domain Admins, Enterprise Admins, etc.)
- `recent_lockouts` - Account lockouts within specified time period
- `recent_password_changes` - Password changes within specified time period (2 variants)

### Computer Queries (4 Reports)
- `disabled_computers` - Disabled computer accounts in the domain
- `inactive_computers` - Computers not logged in for specified days
- `domain_servers` - All servers in the domain with OS information
- `os_summary` - Operating system distribution summary

### Group Queries (1 Report)
- `empty_groups` - Security groups with no members

### Query Registry Statistics
- **Total Queries**: 13 pre-built LDAP query definitions
- **Integration Tests**: 130+ test cases covering all functionality
- **Field Coverage**: Extensive LDAP attribute mapping (100+ fields)

## Adding New Queries

### 1. Create Query Definition

Create a new file in the appropriate directory following existing patterns:

```typescript
// backend/src/queries/ldap/users/expired-passwords.ts
import { LDAPQueryDefinition } from '../types';

export const expiredPasswordsQuery: LDAPQueryDefinition = {
  id: 'expired_passwords',
  name: 'Expired Passwords',
  description: 'Find users with expired passwords that need immediate attention',
  category: 'users',
  
  query: {
    scope: 'sub',
    filter: '(&(objectClass=user)(objectCategory=person)(userAccountControl:1.2.840.113556.1.4.803:=8388608))', // PASSWORD_EXPIRED flag
    attributes: [
      'sAMAccountName',
      'displayName', 
      'mail',
      'userAccountControl',
      'pwdLastSet',
      'whenCreated',
      'department',
      'manager'
    ],
    sizeLimit: 5000
  },
  
  parameters: {},
  
  postProcess: {
    sort: {
      field: 'pwdLastSet',
      direction: 'asc' // Oldest password changes first
    }
  },
  
  fieldMappings: {
    sAMAccountName: { displayName: 'Username' },
    displayName: { displayName: 'Display Name' },
    mail: { displayName: 'Email' },
    userAccountControl: {
      displayName: 'Account Status',
      transform: 'userAccountControlToFlags'
    },
    pwdLastSet: {
      displayName: 'Password Last Set',
      type: 'date',
      transform: 'fileTimeToDate'
    },
    whenCreated: { 
      displayName: 'Account Created',
      type: 'date'
    },
    department: { displayName: 'Department' },
    manager: {
      displayName: 'Manager',
      transform: 'dnToName'
    }
  }
};
```

### 2. Export from Index

Add to the category index file (queries auto-register):

```typescript
// backend/src/queries/ldap/users/index.ts
export { expiredPasswordsQuery } from './expired-passwords';
```

### 3. Add Report Template to Database

Insert into report_templates table for UI integration:

```sql
INSERT INTO report_templates (
  id, name, description, category, subcategory, report_type,
  query_template, required_parameters, default_parameters,
  is_active, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'Expired Passwords',
  'Find user accounts with expired passwords requiring immediate attention',
  'ad',
  'Security',
  'expired_passwords',
  '{}',
  '{}', -- No parameters needed
  '{}',
  true,
  NOW(),
  NOW()
);
```

### 4. Test the Query

Add integration tests following existing patterns:

```typescript
// Add to ldap-queries.integration.test.ts
it('should validate expired_passwords query definition', () => {
  const query = getQueryById('expired_passwords');
  expect(query).toBeDefined();
  expect(query?.category).toBe('users');
  expect(query?.query.filter).toContain('PASSWORD_EXPIRED');
});
```

## Report History and Result Storage

### Database Schema

All executions are stored in the `report_history` table with complete result data:

```sql
CREATE TABLE report_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  report_id VARCHAR(255) NOT NULL,    -- Query/template ID
  executed_at TIMESTAMP DEFAULT NOW(),
  parameters JSONB,                    -- Execution parameters
  result_count INTEGER,                -- Number of results
  results JSONB,                       -- Complete result data
  status VARCHAR(20) DEFAULT 'success', -- 'success' or 'error'
  error_message TEXT,                  -- Error details if failed
  execution_time_ms INTEGER            -- Query execution time
);

CREATE TABLE report_results (
  id SERIAL PRIMARY KEY,
  history_id INTEGER REFERENCES report_history(id),
  result_data JSONB NOT NULL,          -- Detailed result data
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Query Examples

```sql
-- View recent executions with summary
SELECT 
  rh.id,
  rh.report_id,
  rh.executed_at,
  rh.status,
  rh.result_count,
  rh.execution_time_ms,
  rh.parameters
FROM report_history rh
WHERE rh.user_id = 1
ORDER BY rh.executed_at DESC
LIMIT 10;

-- Get execution with full results
SELECT 
  rh.*,
  rr.result_data
FROM report_history rh
LEFT JOIN report_results rr ON rh.id = rr.history_id
WHERE rh.id = 123;

-- Performance analysis
SELECT 
  report_id,
  AVG(execution_time_ms) as avg_time,
  COUNT(*) as executions,
  AVG(result_count) as avg_results
FROM report_history 
WHERE status = 'success'
GROUP BY report_id
ORDER BY avg_time DESC;
```

## API Integration

### Report Execution Endpoints

#### Execute Pre-built Report
```bash
POST /api/reports/execute/:templateId
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "parameters": {
    "days": 90
  },
  "credentialId": 123,  // Optional: use specific credential
  "format": "json"      // Optional: json, csv, excel
}

# Response
{
  "success": true,
  "executionId": "550e8400-e29b-41d4-a716-446655440000",
  "data": [...],        // Query results
  "metadata": {
    "executionTime": 1250,
    "rowCount": 42,
    "parameters": {"days": 90}
  }
}
```

#### Get Report Templates
```bash
GET /api/reports/templates?category=ad&source=ad
Authorization: Bearer <jwt_token>

# Response: Array of available LDAP report definitions
```

#### Get Field Discovery
```bash
GET /api/reports/fields/ad?category=users
Authorization: Bearer <jwt_token>

# Response: Available LDAP fields for query building
```

#### Get Schema Discovery
```bash
GET /api/reports/schema/ad/discover?refresh=true&credentialId=123
Authorization: Bearer <jwt_token>

# Response: Live LDAP schema information
```

### Report History Endpoints

```bash
# Get execution history
GET /api/reports/history?limit=20&offset=0
Authorization: Bearer <jwt_token>

# Get specific execution with results
GET /api/reports/history/:id
Authorization: Bearer <jwt_token>
```

### Custom Query Execution

```bash
POST /api/query/execute
Authorization: Bearer <jwt_token>

{
  "source": "ad",
  "queryId": "inactive_users",
  "parameters": {"days": 90},
  "credentialId": 123
}
```

## Security & Permissions

### LDAP Injection Prevention

The system implements comprehensive LDAP injection prevention:

```typescript
// From ldap-utils.ts - All LDAP values are escaped
// LDAP Injection Prevention - All values escaped
const escapedValue = String(value)
  .replace(/\\/g, '\\5c')    // Backslash (\) -> \5c
  .replace(/\*/g, '\\2a')     // Asterisk (*) -> \2a  
  .replace(/\(/g, '\\28')     // Left parenthesis (() -> \28
  .replace(/\)/g, '\\29')     // Right parenthesis ()) -> \29
  .replace(/\0/g, '\\00');    // Null character (\0) -> \00

// Additional security validations:
// - Field names validated against whitelist
// - Operators restricted to known safe values
// - Parameters type-checked before transformation
```

### Credential Security

1. **Encryption**: All credentials encrypted with AES-256 and per-credential salts
2. **User Isolation**: Users can only access their own stored credentials
3. **Service Account Validation**: Credentials validated on storage
4. **System Fallback**: System credentials used when user credentials unavailable

### Connection Security

```typescript
// LDAPS support with TLS configuration
const client = new Client({
  url: 'ldaps://dc.example.com:636',
  tlsOptions: {
    rejectUnauthorized: false,  // For internal/test environments
    minVersion: 'TLSv1.2'
  }
});
```

### Access Control

- **Authentication Required**: All LDAP endpoints require valid JWT tokens
- **Rate Limiting**: 30 requests/minute for report execution
- **User Context**: All queries executed with user-specific credentials
- **Audit Logging**: Complete audit trail in `report_history` and `audit_logs`

### Query Validation

```typescript
// Query validation includes:
- Parameter type checking
- LDAP filter syntax validation  
- Attribute whitelist validation
- Size limit enforcement (max 5000 results)
- Timeout protection (30 second limit)
```

### Security Testing

The system includes comprehensive security tests:
- **LDAP Injection Tests**: 130+ test cases covering injection vectors
- **Input Validation**: Parameter sanitization validation
- **Authentication Tests**: Token validation and user context
- **Authorization Tests**: Credential access restrictions

## Performance Optimization

### Connection Pooling

The `ADService` implements sophisticated connection pooling:

```typescript
// Automatic connection pooling by credential context
protected getConnectionPoolKey(options: ConnectionOptions): string {
  return `${options.host}:${options.port}:${options.username}`;
}

// Periodic cleanup every 5 minutes
this.cleanupInterval = setInterval(() => {
  this.cleanupStaleConnections();
}, 5 * 60 * 1000);
```

### Caching Strategy

1. **Field Metadata**: 5-minute TTL for discovered LDAP fields
2. **Schema Discovery**: Cached LDAP schema information
3. **Connection Validation**: Cached connection health checks
4. **Query Results**: Optional result caching for expensive queries

### Query Optimization

```typescript
// Optimized query configuration
query: {
  scope: 'sub',                    // Appropriate search scope
  sizeLimit: 5000,                 // Prevent runaway queries
  timeLimit: 30,                   // 30 second timeout
  attributes: ['specific', 'attrs'] // Only request needed fields
}
```

### Performance Metrics

- **Execution Time Tracking**: All queries timed and stored
- **Result Count Monitoring**: Track query result sizes
- **Connection Health**: Monitor LDAP connection status
- **Error Rate Tracking**: Failed query analysis

## Best Practices

### Query Development
1. **Query IDs**: Use descriptive, snake_case IDs matching report_type
2. **LDAP Filters**: Test filters with `ldapsearch` before implementation
3. **Attribute Selection**: Only request needed attributes for performance
4. **Size Limits**: Set conservative limits (max 5000) to prevent overload
5. **Error Handling**: Implement comprehensive error scenarios

### Field Mappings
1. **Display Names**: Use user-friendly field names
2. **Transformations**: Leverage built-in transforms (fileTimeToDate, dnToName)
3. **Type Hints**: Specify field types for proper UI rendering
4. **Sorting**: Define logical default sort orders

### Parameter Design
1. **Validation**: Use strong typing and validation
2. **Defaults**: Provide sensible default values
3. **Descriptions**: Document parameter purpose and format
4. **Transformations**: Use parameter transforms for complex calculations

## Troubleshooting

### Common Issues and Solutions

#### 1. Empty Results / No Data
```bash
# Check LDAP connectivity
ldapsearch -x -H ldap://dc.example.com -D "serviceaccount@example.com" -W -b "DC=example,DC=com" "(objectClass=user)" sAMAccountName

# Verify in application logs:
# - LDAP bind successful
# - Query execution time
# - Result count
```

**Common Causes:**
- Incorrect LDAP filter syntax
- Wrong base DN in credentials
- Insufficient service account permissions
- Network connectivity issues

#### 2. Authentication Failures
```
LDAP bind failed: InvalidCredentialsError
```

**Solutions:**
- Verify service account credentials in database
- Check credential encryption/decryption
- Ensure account not locked/expired
- Validate LDAP URL format (ldap:// vs ldaps://)

#### 3. Performance Issues
```
Query timeout after 30 seconds
```

**Optimization Steps:**
- Reduce requested attributes in query definition
- Add more specific LDAP filters
- Implement size limits (< 5000 results)
- Use indexed LDAP attributes
- Check LDAP server performance

#### 4. Parameter Transformation Errors
```
Invalid parameter transformation: daysToFileTime
```

**Debug Steps:**
- Verify parameter exists in query definition
- Check transformation function spelling
- Validate parameter type (number for time transforms)
- Review ldap-utils.ts for available transforms

### Debugging Tools

#### Application Logging
```typescript
// Enable debug level in environment
NODE_ENV=development LOG_LEVEL=debug npm start

// Log output includes:
// - LDAP connection attempts
// - Query execution details
// - Parameter transformations
// - Result processing
```

#### Database Queries
```sql
-- Check recent executions
SELECT * FROM report_history 
WHERE status = 'error' 
ORDER BY executed_at DESC 
LIMIT 10;

-- Analyze query performance
SELECT 
  report_id,
  AVG(execution_time_ms) as avg_time,
  MAX(execution_time_ms) as max_time,
  COUNT(*) as executions
FROM report_history 
WHERE executed_at > NOW() - INTERVAL '24 hours'
GROUP BY report_id
ORDER BY avg_time DESC;
```

#### LDAP Testing
```bash
# Test LDAP connectivity
ldapsearch -x -H ldap://dc.example.com:389 -D "CN=ServiceAccount,OU=Users,DC=example,DC=com" -W

# Test specific query
ldapsearch -x -H ldap://dc.example.com -D "serviceaccount@example.com" -W -b "DC=example,DC=com" "(&(objectClass=user)(lastLogonTimestamp>=132850560000000000))" sAMAccountName displayName

# Test LDAPS (secure)
ldapsearch -x -H ldaps://dc.example.com:636 -D "serviceaccount@example.com" -W
```

### Health Monitoring

The system provides health check endpoints for monitoring:

```bash
# Check LDAP service health
curl -H "Authorization: Bearer <token>" http://localhost/api/health/component/ldap

# Response includes:
{
  "component": "ldap",
  "status": "healthy",
  "responseTime": 45,
  "details": {
    "connected": true,
    "server": "ldap://dc.example.com:389",
    "lastCheck": "2025-01-15T10:30:00.000Z"
  }
}
```

## Integration Testing

The LDAP query system includes comprehensive integration tests:

### Test Coverage

```
backend/src/queries/ldap/ldap-queries.integration.test.ts
- Query Registry Tests: Verify all queries load correctly
- Query Structure Validation: Ensure all queries have proper structure  
- Parameter Validation: Test parameter types and transformations
- Field Mapping Tests: Verify field transformations work
- LDAP Utility Tests: Test Windows FileTime conversions
- Error Handling: Test malformed query definitions
```

### Test Execution

```bash
# Run LDAP integration tests
npm test -- --testNamePattern="LDAP Query"

# Run with coverage
npm run test:coverage -- --testNamePattern="LDAP"

# Test specific query definition
npm test -- --testNamePattern="inactive_users"
```

### Mock Data Testing

Tests use realistic AD data structures:

```typescript
// Test data includes actual LDAP attribute formats
const mockLDAPResult = {
  sAMAccountName: 'jdoe',
  displayName: 'John Doe',
  lastLogonTimestamp: '132850560000000000', // Windows FileTime
  userAccountControl: 512,                  // Normal account
  whenCreated: '20240101120000.0Z'         // GeneralizedTime
};
```

## Current Implementation Status

### ✅ Implemented Features

1. **Query System**: 13 pre-built LDAP queries across 3 categories
2. **Security**: Comprehensive LDAP injection prevention
3. **Connection Management**: Pooling, cleanup, and health monitoring
4. **Credential Integration**: User-specific credential support
5. **Field Discovery**: Dynamic LDAP schema discovery
6. **Result Storage**: Complete execution history with results
7. **API Integration**: RESTful endpoints with authentication
8. **Performance Monitoring**: Execution time and result tracking
9. **Integration Testing**: 130+ test cases covering all functionality

### 🚧 Areas for Enhancement

1. **Query Caching**: Result caching for expensive queries
2. **Custom Query Builder**: Visual LDAP filter construction
3. **Scheduled Reports**: Automated report generation
4. **Performance Analytics**: Query optimization recommendations
5. **Advanced Transforms**: Additional field transformation functions
6. **Multi-Domain Support**: Cross-domain LDAP queries
7. **Export Formats**: Enhanced export capabilities (PDF, Excel)
8. **Real-time Monitoring**: Live query execution monitoring

### 📊 System Metrics (Current)

- **Total LDAP Queries**: 13 pre-built definitions
- **Test Coverage**: 130+ integration tests
- **Security Tests**: Comprehensive injection prevention
- **Field Mappings**: 100+ LDAP attribute aliases
- **Performance**: Sub-second execution for most queries
- **Reliability**: Connection pooling with automatic recovery