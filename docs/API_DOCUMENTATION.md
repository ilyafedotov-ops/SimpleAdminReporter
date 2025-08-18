# SimpleAdminReporter API Documentation

**Version:** 1.0.0  
**Base URL:** `http://localhost/api` (via Nginx reverse proxy)  
**Authentication:** JWT tokens or HTTP cookies with CSRF protection  
**Last Updated:** 2025-01-18

## Table of Contents

1. [API Overview](#api-overview)
2. [Authentication](#authentication)
3. [Report Management API](#report-management-api)
4. [Data Source Integration](#data-source-integration)
5. [Query System API](#query-system-api)
6. [Logs Management API](#logs-management-api)
7. [Admin & System API](#admin--system-api)
8. [User Management API](#user-management-api)
9. [Export & Download API](#export--download-api)
10. [Real-time API](#real-time-api)
11. [Error Responses](#error-responses)
12. [Rate Limiting](#rate-limiting)

---

## API Overview

### Base URLs
- **Production:** `http://[WSL-IP]/api`
- **Development:** `http://localhost:5000/api`
- **Nginx Proxy:** `http://localhost/api` (recommended)

### Response Format
All API responses follow this standard format:

```json
{
  "success": boolean,
  "data": any,
  "error": {
    "code": "string",
    "message": "string",
    "details": any
  },
  "metadata": {
    "pagination": object,
    "executionTime": number,
    "cached": boolean
  }
}
```

### Common Status Codes
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `429` - Too Many Requests
- `500` - Internal Server Error

---

## Authentication

### Authentication Methods

The API supports two authentication modes:

1. **JWT Token Authentication** (Default)
2. **Cookie-based Authentication** with CSRF protection

#### Get Authentication Method
```
GET /api/auth/method
```

**Response:**
```json
{
  "success": true,
  "data": {
    "method": "token|cookie",
    "supportsCookies": true,
    "supportsTokens": true,
    "csrfRequired": false
  }
}
```

### Login

#### User Login
```
POST /api/auth/login
```

**Rate Limit:** 5 attempts per 15 minutes

**Request Body:**
```json
{
  "username": "string",
  "password": "string",
  "authSource": "ad|azure|o365|local" // optional
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": 1,
      "username": "john.doe",
      "displayName": "John Doe",
      "email": "john.doe@company.com",
      "authSource": "ad",
      "isAdmin": false,
      "isActive": true,
      "department": "IT",
      "title": "Software Engineer"
    },
    "accessToken": "jwt_token_here",
    "refreshToken": "refresh_token_here",
    "expiresIn": 3600,
    "csrfToken": "csrf_token_if_cookie_mode"
  }
}
```

#### Refresh Token
```
POST /api/auth/refresh
```

**Rate Limit:** 10 attempts per hour

**Request Body:**
```json
{
  "refreshToken": "string"
}
```

#### Logout
```
POST /api/auth/logout
```

**Headers:** `Authorization: Bearer {token}` (optional)

#### Logout All Sessions
```
POST /api/auth/logout-all
```

**Headers:** `Authorization: Bearer {token}`

### User Profile

#### Get Profile
```
GET /api/auth/profile
```

**Headers:** `Authorization: Bearer {token}`

#### Update Profile
```
PUT /api/auth/profile
```

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "displayName": "string",
  "email": "string",
  "department": "string",
  "title": "string"
}
```

### Password Management

#### Change Password
```
POST /api/auth/change-password
```

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "currentPassword": "string",
  "newPassword": "string"
}
```

### Admin Authentication

#### Create User (Admin Only)
```
POST /api/auth/create-user
```

**Headers:** `Authorization: Bearer {admin_token}`

**Request Body:**
```json
{
  "username": "string",
  "password": "string",
  "displayName": "string",
  "email": "string",
  "isAdmin": false
}
```

#### Test Connections (Admin Only)
```
GET /api/auth/test-connections
```

**Headers:** `Authorization: Bearer {admin_token}`

#### Verify Token
```
GET /api/auth/verify
```

**Headers:** `Authorization: Bearer {token}`

---

## Report Management API

### Report Templates

#### List Report Templates
```
GET /api/reports/templates
```

**Query Parameters:**
- `category` (optional): `ad|azure|o365`
- `source` (optional): `ad|azure|o365`

**Response:**
```json
{
  "success": true,
  "data": {
    "templates": [
      {
        "id": "uuid",
        "name": "Inactive Users",
        "description": "Users who haven't logged in recently",
        "category": "ad",
        "source": "ad",
        "parameters": [
          {
            "name": "days",
            "type": "number",
            "label": "Days since last login",
            "defaultValue": 90,
            "required": true
          }
        ],
        "isActive": true,
        "executionCount": 42,
        "averageExecutionTime": 1250
      }
    ]
  }
}
```

#### Execute Report Template
```
POST /api/reports/execute/{templateId}
```

**Headers:** `Authorization: Bearer {token}`

**Rate Limit:** 30 requests per user

**Request Body:**
```json
{
  "parameters": {
    "days": 90,
    "department": "IT"
  },
  "format": "json|csv|excel" // optional
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "reportType": "inactive_users",
    "generatedAt": "2025-01-18T10:30:00Z",
    "parameters": {"days": 90},
    "data": [
      {
        "username": "jdoe",
        "displayName": "John Doe",
        "lastLogin": "2024-10-15T14:30:00Z",
        "department": "IT",
        "enabled": true
      }
    ],
    "count": 1,
    "executionTime": 1200
  }
}
```

#### Preview Report Template
```
POST /api/reports/templates/{id}/preview
```

**Headers:** `Authorization: Bearer {token}`

**Rate Limit:** 60 requests per user

**Request Body:**
```json
{
  "parameters": {"days": 30},
  "limit": 10
}
```

### Custom Reports

#### List Custom Reports
```
GET /api/reports/custom
```

**Query Parameters:**
- `source` (optional): `ad|azure|o365`
- `category` (optional): string
- `isPublic` (optional): boolean
- `includePublic` (optional): boolean

#### Create Custom Report
```
POST /api/reports/custom
```

**Headers:** `Authorization: Bearer {token}`

**Rate Limit:** 20 requests per user

**Request Body:**
```json
{
  "name": "Custom AD Report",
  "description": "Custom query for AD users",
  "source": "ad",
  "category": "users",
  "query": {
    "fields": [
      {"name": "sAMAccountName", "displayName": "Username"},
      {"name": "displayName", "displayName": "Full Name"}
    ],
    "filters": [
      {
        "field": "department",
        "operator": "equals",
        "value": "IT"
      }
    ],
    "orderBy": {"field": "displayName", "direction": "asc"},
    "limit": 100
  },
  "isPublic": false,
  "tags": ["users", "it"]
}
```

#### Get Custom Report
```
GET /api/reports/custom/{reportId}
```

#### Update Custom Report
```
PUT /api/reports/custom/{reportId}
```

**Headers:** `Authorization: Bearer {token}`

#### Delete Custom Report
```
DELETE /api/reports/custom/{reportId}
```

**Headers:** `Authorization: Bearer {token}`

#### Execute Custom Report
```
POST /api/reports/custom/{reportId}/execute
```

**Headers:** `Authorization: Bearer {token}`

**Rate Limit:** 30 requests per user

#### Test Custom Query
```
POST /api/reports/custom/test
```

**Headers:** `Authorization: Bearer {token}`

**Rate Limit:** 60 requests per user

**Request Body:**
```json
{
  "source": "ad",
  "query": {
    "fields": [{"name": "sAMAccountName"}],
    "filters": [{"field": "enabled", "operator": "equals", "value": true}]
  },
  "parameters": {},
  "limit": 10
}
```

### Field Discovery

#### Get Available Fields
```
GET /api/reports/fields/{source}
```

**Path Parameters:**
- `source`: `ad|azure|o365`

**Query Parameters:**
- `category` (optional): string
- `search` (optional): string

**Response:**
```json
{
  "success": true,
  "data": {
    "categories": [
      {
        "name": "basic",
        "displayName": "Basic Information",
        "fields": [
          {
            "name": "sAMAccountName",
            "displayName": "Username",
            "type": "string",
            "searchable": true,
            "sortable": true,
            "operators": ["equals", "contains", "startsWith"]
          }
        ]
      }
    ]
  }
}
```

#### Discover Schema (AD Only)
```
GET /api/reports/schema/{source}/discover
```

**Path Parameters:**
- `source`: `ad`

**Query Parameters:**
- `refresh` (optional): boolean
- `credentialId` (optional): number

### Report History

#### Get Report History
```
GET /api/reports/history
```

**Query Parameters:**
- `status` (optional): `pending|running|completed|failed|cancelled`
- `source` (optional): `ad|azure|o365`
- `limit` (optional): 1-100
- `offset` (optional): number >= 0

#### Get Report Execution
```
GET /api/reports/history/{id}
```

#### Get Report Results
```
GET /api/reports/history/{id}/results
```

#### Delete Report Execution
```
DELETE /api/reports/history/{id}
```

**Headers:** `Authorization: Bearer {token}`

#### Bulk Delete Report Executions
```
DELETE /api/reports/history/bulk
```

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "ids": ["uuid1", "uuid2", "uuid3"]
}
```

### Report Statistics

#### Get Report Statistics
```
GET /api/reports/stats
```

**Headers:** `Authorization: Bearer {token}`

### Favorites

#### Get Favorite Reports
```
GET /api/reports/favorites
```

**Headers:** `Authorization: Bearer {token}`

#### Add to Favorites
```
POST /api/reports/favorites
```

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "templateId": "uuid", // or
  "customTemplateId": "uuid"
}
```

#### Remove from Favorites
```
DELETE /api/reports/favorites
```

**Headers:** `Authorization: Bearer {token}`

---

## Data Source Integration

### Service Credentials

#### List Credentials
```
GET /api/credentials
```

**Headers:** `Authorization: Bearer {token}`

#### Get Default Credentials
```
GET /api/credentials/defaults
```

**Headers:** `Authorization: Bearer {token}`

#### Create Credential
```
POST /api/credentials
```

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "name": "AD Service Account",
  "service": "ad",
  "server": "dc01.company.local",
  "username": "service@company.local",
  "password": "encrypted_password",
  "baseDN": "DC=company,DC=local",
  "isDefault": false
}
```

#### Update Credential
```
PUT /api/credentials/{id}
```

**Headers:** `Authorization: Bearer {token}`

#### Delete Credential
```
DELETE /api/credentials/{id}
```

**Headers:** `Authorization: Bearer {token}`

#### Test Credential
```
POST /api/credentials/{id}/test
```

**Headers:** `Authorization: Bearer {token}`

#### Set Default Credential
```
PUT /api/credentials/{id}/set-default
```

**Headers:** `Authorization: Bearer {token}`

---

## Query System API

### Query Execution

#### Execute Predefined Query
```
POST /api/reports/query/execute
```

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "queryId": "inactive_users",
  "parameters": {
    "days": 90
  },
  "credentialId": 1
}
```

#### Build and Execute Dynamic Query
```
POST /api/reports/query/build
```

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "dataSource": "postgres",
  "select": ["department", "COUNT(*) as user_count"],
  "from": "users",
  "where": [
    {"field": "active", "operator": "eq", "value": true}
  ],
  "groupBy": ["department"],
  "orderBy": {"field": "user_count", "direction": "desc"},
  "limit": 10
}
```

### Query Definitions

#### Get Query Definitions
```
GET /api/reports/query/definitions
```

**Query Parameters:**
- `dataSource` (optional): `postgres|ad|azure|o365`
- `category` (optional): string
- `search` (optional): string (min 2 characters)

#### Get Schema
```
GET /api/reports/query/schema/{dataSource}
```

**Headers:** `Authorization: Bearer {token}`

**Path Parameters:**
- `dataSource`: `postgres|ad|azure|o365`

**Query Parameters:**
- `table` (optional): string

#### Validate Query
```
POST /api/reports/query/validate
```

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "queryDef": {
    "id": "test_query",
    "sql": "SELECT COUNT(*) FROM users WHERE active = $1"
  },
  "parameters": {"active": true}
}
```

### Query Cache

#### Get Cached Result
```
GET /api/reports/query/cache/{queryId}
```

**Headers:** `Authorization: Bearer {token}`

**Query Parameters:**
- `parameters` (optional): object

#### Clear All Cache
```
DELETE /api/reports/query/cache
```

**Headers:** `Authorization: Bearer {token}`

#### Clear Specific Query Cache
```
DELETE /api/reports/query/cache/{queryId}
```

**Headers:** `Authorization: Bearer {token}`

### Query Statistics

#### Get All Query Stats
```
GET /api/reports/query/stats
```

**Query Parameters:**
- `startDate` (optional): ISO date
- `endDate` (optional): ISO date

#### Get Specific Query Stats
```
GET /api/reports/query/stats/{queryId}
```

**Query Parameters:**
- `startDate` (optional): ISO date
- `endDate` (optional): ISO date

### Query Health

#### Query Service Health Check
```
GET /api/reports/query/health
```

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2025-01-18T10:30:00Z",
    "services": {
      "postgres": true,
      "ad": false,
      "azure": true,
      "o365": true
    }
  }
}
```

#### Query Service Metrics
```
GET /api/reports/query/metrics
```

### Graph Queries

#### Execute Graph Query
```
POST /api/reports/query/graph/execute
```

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "queryId": "guest_users",
  "parameters": {},
  "credentialId": 1
}
```

#### Get Graph Query Definitions
```
GET /api/reports/query/graph/definitions
```

**Query Parameters:**
- `category` (optional): `users|groups|security|licenses|reports`
- `search` (optional): string

#### Get Graph Query History
```
GET /api/reports/query/graph/history
```

**Headers:** `Authorization: Bearer {token}`

**Query Parameters:**
- `queryId` (optional): string
- `limit` (optional): 1-100
- `offset` (optional): number >= 0

#### Execute Graph Batch
```
POST /api/reports/query/graph/batch
```

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "queries": [
    {
      "queryId": "guest_users",
      "parameters": {}
    },
    {
      "queryId": "mfa_status",
      "parameters": {}
    }
  ]
}
```

---

## Logs Management API

### Log Retrieval

#### Get Logs
```
GET /api/logs
```

**Headers:** `Authorization: Bearer {token}`

**Rate Limit:** 30 requests per minute

**Query Parameters:**
- `type` (optional): `audit|system|combined`
- `level` (optional): `error|warn|info|debug`
- `startDate` (optional): ISO date
- `endDate` (optional): ISO date
- `userId` (optional): number
- `username` (optional): string
- `eventType` (optional): string
- `service` (optional): string
- `limit` (optional): 1-1000 (default: 100)
- `offset` (optional): number >= 0
- `sortBy` (optional): `created_at|event_type|username`
- `sortOrder` (optional): `asc|desc`

**Response:**
```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "id": 1,
        "log_type": "audit",
        "timestamp": "2025-01-18T10:30:00Z",
        "event_type": "login",
        "event_action": "success",
        "user_id": 1,
        "username": "john.doe",
        "ip_address": "192.168.1.100",
        "user_agent": "Mozilla/5.0...",
        "session_id": "sess_123",
        "success": true,
        "correlation_id": "req_456"
      }
    ],
    "pagination": {
      "total": 250,
      "offset": 0,
      "limit": 100,
      "hasMore": true
    }
  }
}
```

#### Get Real-time Logs
```
GET /api/logs/realtime
```

**Headers:** `Authorization: Bearer {token}`

**Rate Limit:** 30 requests per minute

#### Get Log Details
```
GET /api/logs/{id}
```

**Headers:** `Authorization: Bearer {token}`

**Rate Limit:** 30 requests per minute

### Log Statistics

#### Get Log Statistics
```
GET /api/logs/stats
```

**Headers:** `Authorization: Bearer {token}`

**Rate Limit:** 30 requests per minute

**Query Parameters:**
- `type` (optional): `audit|system|combined`
- `timeRange` (optional): `1h|6h|24h|7d|30d`
- `groupBy` (optional): `hour|day|week`

**Response:**
```json
{
  "success": true,
  "data": {
    "totalLogs": 10523,
    "auditLogs": 8234,
    "systemLogs": 2289,
    "errorCount": 45,
    "warningCount": 123,
    "timeRange": "24h",
    "breakdown": [
      {
        "period": "2025-01-18T09:00:00Z",
        "count": 234,
        "errors": 2,
        "warnings": 5
      }
    ]
  }
}
```

### Log Search

#### Full-text Search
```
GET /api/logs/search/fulltext
```

**Headers:** `Authorization: Bearer {token}`

**Rate Limit:** 30 requests per minute

**Query Parameters:**
- `q`: string (search query)
- `type` (optional): `audit|system|combined`
- `limit` (optional): 1-100
- `offset` (optional): number >= 0

#### Fuzzy Search
```
GET /api/logs/search/fuzzy
```

**Headers:** `Authorization: Bearer {token}`

**Rate Limit:** 30 requests per minute

**Query Parameters:**
- `type`: `audit|system`
- `field`: string (field to search)
- `term`: string (search term)
- `threshold` (optional): 0.0-1.0 (default: 0.3)

### Log Export (Admin Only)

#### Export Logs
```
GET /api/logs/export
```

**Headers:** `Authorization: Bearer {admin_token}`

**Rate Limit:** 5 exports per 10 minutes

**Query Parameters:**
- `type` (optional): `audit|system|combined`
- `format` (optional): `csv|json` (default: csv)
- `startDate`: ISO date
- `endDate`: ISO date
- `filters` (optional): JSON string

### Log Metrics (Admin Only)

#### Get Logging System Metrics
```
GET /api/logs/metrics
```

**Headers:** `Authorization: Bearer {admin_token}`

**Rate Limit:** 30 requests per minute

#### Get Query Performance Metrics
```
GET /api/logs/metrics/queries
```

**Headers:** `Authorization: Bearer {admin_token}`

**Rate Limit:** 30 requests per minute

**Query Parameters:**
- `hours` (optional): number (default: 24)
- `queryType` (optional): string

#### Export Query Metrics
```
GET /api/logs/metrics/queries/export
```

**Headers:** `Authorization: Bearer {admin_token}`

**Rate Limit:** 5 exports per 10 minutes

**Query Parameters:**
- `queryType` (optional): string

### Log Maintenance (Admin Only)

#### Clean Up Old Logs
```
POST /api/logs/cleanup
```

**Headers:** `Authorization: Bearer {admin_token}`

**Request Body:**
```json
{
  "daysToKeep": 90,
  "logTypes": ["audit", "system"],
  "dryRun": false
}
```

#### Get WebSocket Statistics
```
GET /api/logs/websocket/stats
```

**Headers:** `Authorization: Bearer {admin_token}`

**Rate Limit:** 30 requests per minute

#### Get Materialized View Statistics
```
GET /api/logs/materialized-views/stats
```

**Headers:** `Authorization: Bearer {admin_token}`

**Rate Limit:** 30 requests per minute

#### Refresh Materialized Views
```
POST /api/logs/materialized-views/refresh
```

**Headers:** `Authorization: Bearer {admin_token}`

---

## Admin & System API

### Health Monitoring

#### Basic Health Check
```
GET /api/health
```

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2025-01-18T10:30:00Z",
    "uptime": 86400,
    "version": "1.0.0"
  }
}
```

#### Detailed Health Check
```
GET /api/health/detailed
```

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2025-01-18T10:30:00Z",
    "components": {
      "database": {"status": "healthy", "responseTime": 5},
      "redis": {"status": "healthy", "responseTime": 2},
      "ldap": {"status": "degraded", "responseTime": 1500},
      "azure": {"status": "healthy", "responseTime": 200}
    },
    "system": {
      "cpuUsage": 45.2,
      "memoryUsage": 78.1,
      "diskUsage": 34.7
    }
  }
}
```

#### Readiness Probe
```
GET /api/health/ready
```

**Headers:** `Authorization: Bearer {token}`

#### Liveness Probe
```
GET /api/health/live
```

#### Component Health
```
GET /api/health/component/{component}
```

**Headers:** `Authorization: Bearer {token}`

**Path Parameters:**
- `component`: `database|redis|ldap|azure`

#### Health Summary
```
GET /api/health/summary
```

**Headers:** `Authorization: Bearer {token}`

#### Operational Status
```
GET /api/health/operational
```

**Headers:** `Authorization: Bearer {token}`

#### Database Pool Statistics
```
GET /api/health/pool
```

**Headers:** `Authorization: Bearer {token}`

### System Configuration

#### Get System Configuration
```
GET /api/system/config
```

**Headers:** `Authorization: Bearer {admin_token}`

#### Update System Configuration
```
POST /api/system/config
```

**Headers:** `Authorization: Bearer {admin_token}`

**Request Body:**
```json
{
  "maxReportHistory": 30,
  "defaultExportFormat": "csv",
  "enableNotifications": true,
  "logRetentionDays": 90
}
```

#### Get System Health
```
GET /api/system/health
```

**Headers:** `Authorization: Bearer {admin_token}`

### Security Administration

#### Get Audit Logs
```
GET /api/admin/security/audit-logs
```

**Headers:** `Authorization: Bearer {admin_token}`

**Query Parameters:**
- `startDate` (optional): ISO date
- `endDate` (optional): ISO date
- `userId` (optional): number
- `action` (optional): string
- `limit` (optional): 1-1000
- `offset` (optional): number >= 0

#### Get Security Events Summary
```
GET /api/admin/security/events-summary
```

**Headers:** `Authorization: Bearer {admin_token}`

#### Get User Activity
```
GET /api/admin/security/user-activity/{userId}
```

**Headers:** `Authorization: Bearer {admin_token}`

#### Get Locked Accounts
```
GET /api/admin/security/locked-accounts
```

**Headers:** `Authorization: Bearer {admin_token}`

#### Get Lockout History
```
GET /api/admin/security/lockout-history/{username}
```

**Headers:** `Authorization: Bearer {admin_token}`

#### Unlock Account
```
POST /api/admin/security/unlock-account
```

**Headers:** `Authorization: Bearer {admin_token}`

**Request Body:**
```json
{
  "username": "john.doe",
  "reason": "Administrative unlock"
}
```

#### Get Failed Login Attempts
```
GET /api/admin/security/failed-logins
```

**Headers:** `Authorization: Bearer {admin_token}`

### Report Administration

#### Get Admin Templates
```
GET /api/reports/admin/templates
```

**Headers:** `Authorization: Bearer {admin_token}`

#### Get Usage Statistics
```
GET /api/reports/admin/usage
```

**Headers:** `Authorization: Bearer {admin_token}`

#### Cleanup Report History
```
DELETE /api/reports/admin/cleanup
```

**Headers:** `Authorization: Bearer {admin_token}`

---

## User Management API

### User Preferences

#### Get User Preferences
```
GET /api/user/preferences
```

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
{
  "success": true,
  "data": {
    "dateFormat": "YYYY-MM-DD",
    "timeFormat": "24h",
    "timezone": "UTC",
    "language": "en",
    "theme": "light",
    "notifications": {
      "reportComplete": true,
      "reportFailed": true,
      "systemMaintenance": false
    },
    "defaultExportFormat": "csv",
    "defaultPageSize": 50
  }
}
```

#### Update User Preferences
```
PUT /api/user/preferences
```

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "dateFormat": "DD/MM/YYYY",
  "theme": "dark",
  "defaultPageSize": 100
}
```

#### Update Notification Preferences
```
PUT /api/user/preferences/notifications
```

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "reportComplete": true,
  "reportFailed": false,
  "systemMaintenance": true
}
```

### Notifications

#### Get Notifications
```
GET /api/notifications
```

**Headers:** `Authorization: Bearer {token}`

**Query Parameters:**
- `type` (optional): `info|success|warning|error|report_complete|report_failed|system|reminder`
- `isRead` (optional): boolean
- `isDismissed` (optional): boolean
- `priority` (optional): 1-5
- `limit` (optional): 1-100
- `offset` (optional): number >= 0

**Response:**
```json
{
  "success": true,
  "data": {
    "notifications": [
      {
        "id": "uuid",
        "type": "report_complete",
        "title": "Report Generated",
        "message": "Your Inactive Users report has been generated successfully",
        "priority": 3,
        "isRead": false,
        "isDismissed": false,
        "createdAt": "2025-01-18T10:30:00Z",
        "data": {
          "reportId": "uuid",
          "reportName": "Inactive Users"
        }
      }
    ],
    "pagination": {
      "total": 25,
      "unread": 5,
      "hasMore": false
    }
  }
}
```

#### Get Notification Statistics
```
GET /api/notifications/stats
```

**Headers:** `Authorization: Bearer {token}`

#### Get Notification by ID
```
GET /api/notifications/{id}
```

**Headers:** `Authorization: Bearer {token}`

#### Create Notification
```
POST /api/notifications
```

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "userId": 1,
  "type": "info",
  "title": "Test Notification",
  "message": "This is a test notification",
  "priority": 3,
  "data": {}
}
```

#### Update Notification
```
PUT /api/notifications/{id}
```

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "isRead": true,
  "isDismissed": false
}
```

#### Delete Notification
```
DELETE /api/notifications/{id}
```

**Headers:** `Authorization: Bearer {token}`

#### Bulk Notification Operations
```
POST /api/notifications/bulk
```

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "notificationIds": ["uuid1", "uuid2"],
  "operation": "mark_read|mark_unread|dismiss|delete"
}
```

#### Create System Notification (Admin)
```
POST /api/notifications/system
```

**Headers:** `Authorization: Bearer {admin_token}`

#### Cleanup Expired Notifications (Admin)
```
POST /api/notifications/cleanup
```

**Headers:** `Authorization: Bearer {admin_token}`

---

## Export & Download API

### Report Export

#### Export Report
```
POST /api/reports/export/report/{templateId}
```

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "format": "excel|csv|pdf",
  "parameters": {},
  "filename": "custom_filename.xlsx"
}
```

#### Export Custom Report
```
POST /api/reports/export/custom/{customTemplateId}
```

**Headers:** `Authorization: Bearer {token}`

### Queue Export

#### Queue Report Export
```
POST /api/reports/export/queue/report/{templateId}
```

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "format": "excel|csv|pdf",
  "parameters": {},
  "priority": 5
}
```

#### Queue Custom Report Export
```
POST /api/reports/export/queue/custom/{customTemplateId}
```

**Headers:** `Authorization: Bearer {token}`

### Export History

#### Export History Results
```
GET /api/reports/export/history/{historyId}
```

**Headers:** `Authorization: Bearer {token}`

**Query Parameters:**
- `format` (optional): `excel|csv`

### File Download

#### Download File
```
GET /api/reports/export/download/{filename}
```

**Headers:** `Authorization: Bearer {token}`

**Path Parameters:**
- `filename`: Must match pattern `^[a-zA-Z0-9_.-]+\.(xlsx|csv|pdf)$`

### Export Jobs

#### Get Job Status
```
GET /api/reports/export/job/{jobId}
```

**Headers:** `Authorization: Bearer {token}`

#### Cleanup Exports (Admin)
```
POST /api/reports/export/cleanup
```

**Headers:** `Authorization: Bearer {admin_token}`

**Request Body:**
```json
{
  "daysOld": 30
}
```

---

## Real-time API

### Search

#### Global Search
```
GET /api/search/global
```

**Headers:** `Authorization: Bearer {token}`

**Query Parameters:**
- `q`: string (search query)
- `type` (optional): `reports|users|templates`
- `limit` (optional): 1-50

#### Search Suggestions
```
GET /api/search/suggestions
```

**Headers:** `Authorization: Bearer {token}`

**Query Parameters:**
- `q`: string (partial query)
- `type` (optional): string

#### Recent Searches
```
GET /api/search/recent
```

**Headers:** `Authorization: Bearer {token}`

### Graph API Integration

#### Get Graph Templates
```
GET /api/graph/templates
```

**Headers:** `Authorization: Bearer {token}`

**Query Parameters:**
- `category` (optional): `users|groups|security|licenses|reports`

#### Execute Graph Query
```
POST /api/graph/execute/{queryId}
```

**Headers:** `Authorization: Bearer {token}`

**Rate Limit:** 30 requests per user

**Request Body:**
```json
{
  "parameters": {},
  "credentialId": 1,
  "context": {}
}
```

#### Execute Batch Graph Queries
```
POST /api/graph/batch
```

**Headers:** `Authorization: Bearer {token}`

**Rate Limit:** 10 requests per user

#### Discover Graph Fields
```
GET /api/graph/fields/{entityType}
```

**Headers:** `Authorization: Bearer {token}`

**Path Parameters:**
- `entityType`: `users|groups|devices|applications`

**Query Parameters:**
- `refresh` (optional): boolean
- `category` (optional): string

#### Search Graph Fields
```
GET /api/graph/fields/{entityType}/search
```

**Headers:** `Authorization: Bearer {token}`

**Query Parameters:**
- `search`: string (required)

#### Get Graph History
```
GET /api/graph/history
```

**Headers:** `Authorization: Bearer {token}`

**Query Parameters:**
- `queryId` (optional): string
- `limit` (optional): 1-100
- `offset` (optional): number >= 0

#### Get Graph Execution Result
```
GET /api/graph/history/{executionId}
```

**Headers:** `Authorization: Bearer {token}`

### Scheduled Reports

#### List Scheduled Reports
```
GET /api/scheduled-reports
```

**Headers:** `Authorization: Bearer {token}`

#### Get Scheduled Report
```
GET /api/scheduled-reports/{id}
```

**Headers:** `Authorization: Bearer {token}`

#### Create Scheduled Report
```
POST /api/scheduled-reports
```

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "reportId": "uuid",
  "name": "Weekly AD Report",
  "description": "Weekly inactive users report",
  "schedule": {
    "frequency": "weekly",
    "time": "09:00",
    "daysOfWeek": [1],
    "timezone": "UTC"
  },
  "recipients": ["admin@company.com"],
  "exportFormat": "excel",
  "isActive": true
}
```

#### Update Scheduled Report
```
PUT /api/scheduled-reports/{id}
```

**Headers:** `Authorization: Bearer {token}`

#### Delete Scheduled Report
```
DELETE /api/scheduled-reports/{id}
```

**Headers:** `Authorization: Bearer {token}`

#### Toggle Schedule
```
POST /api/scheduled-reports/{id}/toggle
```

**Headers:** `Authorization: Bearer {token}`

#### Get Schedule History
```
GET /api/scheduled-reports/{id}/history
```

**Headers:** `Authorization: Bearer {token}`

---

## Error Responses

### Standard Error Format

All error responses follow this format:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message",
    "details": {
      "field": "validation error details",
      "timestamp": "2025-01-18T10:30:00Z"
    }
  }
}
```

### Common Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `AUTHENTICATION_REQUIRED` | 401 | Authentication token required |
| `INVALID_TOKEN` | 401 | Token is invalid or expired |
| `INSUFFICIENT_PERMISSIONS` | 403 | User lacks required permissions |
| `RESOURCE_NOT_FOUND` | 404 | Requested resource does not exist |
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `LDAP_CONNECTION_ERROR` | 503 | LDAP service unavailable |
| `AZURE_API_ERROR` | 503 | Azure Graph API error |
| `DATABASE_ERROR` | 500 | Database operation failed |
| `QUERY_TIMEOUT` | 408 | Query execution timeout |
| `EXPORT_FAILED` | 500 | Report export failed |

### Error Response Examples

#### Authentication Error
```json
{
  "success": false,
  "error": {
    "code": "AUTHENTICATION_REQUIRED",
    "message": "Authentication token is required for this endpoint",
    "details": {
      "endpoint": "/api/reports/custom",
      "method": "POST"
    }
  }
}
```

#### Validation Error
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": {
      "fields": {
        "username": "Username is required",
        "password": "Password must be at least 8 characters"
      }
    }
  }
}
```

#### Rate Limit Error
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests, please try again later",
    "details": {
      "limit": 30,
      "window": "15 minutes",
      "retryAfter": 300
    }
  }
}
```

---

## Rate Limiting

### Rate Limit Implementation

The API implements user-based rate limiting with different limits for different endpoint categories:

| Endpoint Category | Limit | Window |
|------------------|-------|--------|
| Login attempts | 5 | 15 minutes |
| Token refresh | 10 | 1 hour |
| Auth endpoints | 30 | 15 minutes |
| Query execution | 30 | 1 minute |
| Export operations | 5 | 10 minutes |
| Log queries | 30 | 1 minute |
| Admin operations | 50 | 1 minute |

### Rate Limit Headers

All responses include rate limit information in headers:

```
X-RateLimit-Limit: 30
X-RateLimit-Remaining: 25
X-RateLimit-Reset: 1642507800
X-RateLimit-Window: 60
```

### Rate Limit Override

**Note:** Rate limiting is currently disabled (no-op implementation) due to IPv6 compatibility requirements. All rate limiters return immediately without applying limits.

---

## API Testing

### cURL Examples

#### Login
```bash
curl -X POST http://localhost/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "password123",
    "authSource": "local"
  }'
```

#### Get Reports with Authentication
```bash
curl -X GET http://localhost/api/reports/templates \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### Execute Report
```bash
curl -X POST http://localhost/api/reports/execute/template-uuid \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "parameters": {"days": 90}
  }'
```

### Postman Collection

A Postman collection is available with all endpoints pre-configured:
- Environment variables for base URL and tokens
- Authentication setup for all protected endpoints
- Example requests with sample data
- Test assertions for response validation

---

## API Versioning

### Current Version: 1.0.0

- **URL Versioning:** Not currently implemented
- **Header Versioning:** Not currently implemented
- **Media Type Versioning:** Not currently implemented

### Breaking Changes Policy

Breaking changes will be introduced in new major versions. Current minor version updates maintain backward compatibility.

### Deprecation Policy

Deprecated endpoints will be marked in documentation and include deprecation headers:
```
Deprecation: true
Sunset: Sat, 31 Dec 2025 23:59:59 GMT
```

---

## SDK and Client Libraries

### Official SDKs

Currently, no official SDKs are available. The API is designed to be consumed directly via HTTP requests.

### Community SDKs

Community-maintained SDKs may be available. Check the project repository for updates.

### OpenAPI Specification

An OpenAPI 3.0 specification file is available for generating client libraries:
- **Location:** `/docs/api/openapi.json`
- **Format:** OpenAPI 3.0.3
- **Generator Compatibility:** swagger-codegen, openapi-generator

---

## Support and Contact

### Documentation Updates

This documentation is maintained alongside the codebase. For corrections or updates, please submit issues or pull requests to the project repository.

### API Status

- **Current Status:** Stable
- **Uptime Target:** 99.5%
- **Maintenance Window:** Sundays 02:00-04:00 UTC

### Contact Information

- **GitHub Repository:** [Project Repository]
- **Issue Tracker:** [GitHub Issues]
- **Email Support:** Not currently available

---

**Generated with:** Claude Code (https://claude.ai/code)  
**Last Updated:** 2025-01-18  
**API Version:** 1.0.0