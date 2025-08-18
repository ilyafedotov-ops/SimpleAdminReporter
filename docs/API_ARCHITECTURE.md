# SimpleAdminReporter - API Architecture Documentation

## Overview

The SimpleAdminReporter API architecture follows RESTful principles with a service-oriented design, providing comprehensive endpoints for Active Directory, Azure AD, and Office 365 reporting. The API is built using Node.js with Express.js and TypeScript, featuring JWT authentication, role-based access control, and comprehensive audit logging.

## Table of Contents

1. [API Design Principles](#api-design-principles)
2. [Architecture Overview](#architecture-overview)
3. [Authentication & Security](#authentication--security)
4. [API Versioning Strategy](#api-versioning-strategy)
5. [Endpoint Architecture](#endpoint-architecture)
6. [Request/Response Patterns](#requestresponse-patterns)
7. [Error Handling Architecture](#error-handling-architecture)
8. [Rate Limiting & Throttling](#rate-limiting--throttling)
9. [Caching Strategy](#caching-strategy)
10. [Performance Optimization](#performance-optimization)
11. [Monitoring & Observability](#monitoring--observability)
12. [API Gateway & Proxy](#api-gateway--proxy)

---

## API Design Principles

### Core Principles

1. **RESTful Design**: HTTP methods map to CRUD operations with resource-based URLs
2. **Stateless Architecture**: Each request contains all necessary information for processing
3. **Consistent Interface**: Standardized request/response formats across all endpoints
4. **Layered System**: Clear separation between presentation, business logic, and data layers
5. **Cacheable**: Responses include appropriate caching headers and support cache validation
6. **Secure by Default**: Authentication required for all non-public endpoints

### Design Guidelines

```typescript
// Consistent naming conventions
interface APIDesignGuidelines {
  // URL structure: /api/{version}/{resource}/{id?}/{sub-resource?}
  urlStructure: '/api/v1/reports/123/history';
  
  // HTTP method usage
  methods: {
    GET: 'Retrieve resources or collections';
    POST: 'Create new resources';
    PUT: 'Update complete resources';
    PATCH: 'Partial resource updates';
    DELETE: 'Remove resources';
    OPTIONS: 'CORS preflight requests';
  };
  
  // Response format consistency
  responseFormat: {
    success: 'Wrap all responses in standard envelope';
    error: 'Consistent error structure with codes';
    metadata: 'Include pagination and timing info';
  };
  
  // Resource naming
  resourceNaming: {
    plural: 'Use plural nouns for collections (/reports)';
    singular: 'Use singular for individual resources (/report/123)';
    kebabCase: 'Use kebab-case for multi-word resources';
  };
}
```

---

## Architecture Overview

### API Layer Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Client Applications                        │
├─────────────────────────────────────────────────────────────────┤
│  React Frontend │ Mobile Apps │ Third-party APIs │ CLI Tools   │
└─────────────────┬───────────────────────────────────────────────┘
                  │ HTTP/HTTPS
┌─────────────────▼───────────────────────────────────────────────┐
│                    API Gateway Layer                           │
├─────────────────────────────────────────────────────────────────┤
│  Nginx Reverse Proxy                                           │
│  • SSL Termination                                             │
│  • Load Balancing                                              │
│  • Request Routing                                             │
│  • Rate Limiting (Primary)                                     │
│  • Static Asset Serving                                        │
└─────────────────┬───────────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────────────┐
│                   Express API Layer                            │
├─────────────────────────────────────────────────────────────────┤
│  Middleware Stack:                                             │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Security Middleware (Helmet, CORS)                         ││
│  │ ↓                                                           ││
│  │ Request Parsing (Body Parser, URL Encoded)                 ││
│  │ ↓                                                           ││
│  │ Authentication Middleware (JWT Validation)                 ││
│  │ ↓                                                           ││
│  │ Authorization Middleware (Role/Permission Checks)          ││
│  │ ↓                                                           ││
│  │ Rate Limiting Middleware (User-specific)                   ││
│  │ ↓                                                           ││
│  │ Validation Middleware (Input Validation)                   ││
│  │ ↓                                                           ││
│  │ Audit Logging Middleware                                   ││
│  │ ↓                                                           ││
│  │ Route Controllers                                           ││
│  │ ↓                                                           ││
│  │ Error Handling Middleware                                  ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────┬───────────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────────────┐
│                   Service Layer                                │
├─────────────────────────────────────────────────────────────────┤
│  Business Logic Services:                                      │
│  • AuthService (Authentication & Authorization)                │
│  • ReportExecutorService (Report Generation)                   │
│  • QueryService (Universal Query Processing)                   │
│  • FieldDiscoveryService (Schema Discovery)                    │
│  • ExportService (Multi-format Export)                         │
│  • CredentialService (Secure Credential Management)            │
│  • ScheduledReportService (Report Scheduling)                  │
│  • AuditService (Compliance Logging)                           │
└─────────────────┬───────────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────────────┐
│                  Data Access Layer                             │
├─────────────────────────────────────────────────────────────────┤
│  Data Sources:                                                 │
│  • PostgreSQL Database (Primary Data Store)                    │
│  • Redis Cache (Session & Query Cache)                         │
│  • Active Directory (LDAP Protocol)                            │
│  • Azure AD/Graph API (OAuth 2.0/REST)                         │
│  • Office 365 (Graph API/REST)                                 │
│  • File System (Export Storage)                                │
└─────────────────────────────────────────────────────────────────┘
```

### API Module Structure

```typescript
interface APIModuleStructure {
  controllers: {
    purpose: 'Handle HTTP requests and responses';
    responsibilities: [
      'Request validation',
      'Business logic delegation',
      'Response formatting',
      'Error handling'
    ];
    location: 'src/controllers/';
  };
  
  routes: {
    purpose: 'Define API endpoints and middleware';
    responsibilities: [
      'Route definitions',
      'Middleware application',
      'Parameter extraction',
      'Route-level validation'
    ];
    location: 'src/routes/';
  };
  
  middleware: {
    purpose: 'Cross-cutting concerns';
    responsibilities: [
      'Authentication',
      'Authorization',
      'Rate limiting',
      'Input validation',
      'Audit logging',
      'Error handling'
    ];
    location: 'src/middleware/';
  };
  
  services: {
    purpose: 'Business logic implementation';
    responsibilities: [
      'Data source integration',
      'Business rule enforcement',
      'Data transformation',
      'Cache management'
    ];
    location: 'src/services/';
  };
  
  types: {
    purpose: 'TypeScript type definitions';
    responsibilities: [
      'API contracts',
      'Data models',
      'Configuration types',
      'Validation schemas'
    ];
    location: 'src/types/';
  };
}
```

---

## Authentication & Security

### Authentication Architecture

```typescript
interface AuthenticationArchitecture {
  // Multi-source authentication support
  authSources: {
    active_directory: {
      protocol: 'LDAP/LDAPS';
      method: 'Simple bind authentication';
      userLookup: 'DN-based user resolution';
      groupMembership: 'Nested group expansion';
    };
    
    azure_ad: {
      protocol: 'OAuth 2.0 / OpenID Connect';
      method: 'Authorization code flow';
      tokenValidation: 'JWT signature verification';
      claimsExtraction: 'User attributes from token';
    };
    
    local: {
      protocol: 'Database-based';
      method: 'bcrypt password hashing';
      userStorage: 'PostgreSQL users table';
      sessionManagement: 'JWT token generation';
    };
  };
  
  // JWT token architecture
  tokenStructure: {
    accessToken: {
      purpose: 'API access authorization';
      expiry: '1 hour';
      claims: ['sub', 'iat', 'exp', 'aud', 'iss', 'roles', 'permissions'];
      algorithm: 'HS256';
    };
    
    refreshToken: {
      purpose: 'Access token renewal';
      expiry: '7 days';
      storage: 'PostgreSQL user_sessions table';
      oneTimeUse: false;
    };
  };
}
```

### Security Middleware Stack

```typescript
// Security middleware implementation
interface SecurityMiddlewareStack {
  helmet: {
    purpose: 'HTTP security headers';
    configuration: {
      contentSecurityPolicy: 'Enabled with custom directives';
      crossOriginEmbedderPolicy: 'Disabled for iframe support';
      hsts: 'Enabled in production';
      noSniff: 'X-Content-Type-Options: nosniff';
      xssFilter: 'X-XSS-Protection: 1; mode=block';
    };
  };
  
  cors: {
    purpose: 'Cross-origin resource sharing';
    configuration: {
      origin: 'Environment configurable';
      credentials: true;
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'];
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'];
      exposedHeaders: ['X-Total-Count', 'X-Has-More'];
    };
  };
  
  rateLimit: {
    purpose: 'Request throttling';
    implementation: 'express-rate-limit with Redis store';
    configuration: {
      global: '100 requests per 15 minutes in production';
      userSpecific: 'Configurable per endpoint';
      skipSuccessfulRequests: false;
      skipFailedRequests: false;
    };
  };
  
  authentication: {
    purpose: 'User identity verification';
    implementation: 'Custom JWT middleware';
    features: [
      'Token validation',
      'User context injection',
      'Session verification',
      'Token refresh suggestion'
    ];
  };
  
  authorization: {
    purpose: 'Access control enforcement';
    implementation: 'Role and permission-based middleware';
    strategies: [
      'Role-based access (admin, user)',
      'Permission-based access (granular)',
      'Resource ownership verification',
      'Data source access control'
    ];
  };
}
```

### API Security Features

```typescript
interface APISecurityFeatures {
  inputValidation: {
    implementation: 'Joi schemas with express-validator';
    features: [
      'Request body validation',
      'Query parameter validation',
      'Path parameter validation',
      'File upload validation',
      'SQL injection prevention',
      'LDAP injection prevention',
      'XSS prevention'
    ];
  };
  
  auditLogging: {
    implementation: 'Comprehensive audit middleware';
    logged_events: [
      'Authentication attempts',
      'Authorization failures',
      'Report executions',
      'Credential operations',
      'Administrative actions',
      'Data exports',
      'Configuration changes'
    ];
    
    audit_data: {
      userId: 'Authenticated user ID';
      action: 'Action performed';
      resource: 'Resource accessed';
      timestamp: 'ISO 8601 timestamp';
      ipAddress: 'Client IP address';
      userAgent: 'Client user agent';
      success: 'Operation success status';
      details: 'Additional context (JSONB)';
    };
  };
  
  errorHandling: {
    implementation: 'Centralized error handling middleware';
    features: [
      'Error classification',
      'Sensitive data filtering',
      'Stack trace sanitization',
      'Development vs production error details',
      'Error correlation IDs',
      'Automatic error logging'
    ];
  };
}
```

---

## API Versioning Strategy

### Current Versioning Approach

```typescript
interface APIVersioningStrategy {
  currentApproach: {
    method: 'URI versioning';
    format: '/api/v{major}.{minor}';
    currentVersion: 'v1.0';
    example: '/api/v1/reports';
  };
  
  versioningPolicy: {
    majorVersion: {
      trigger: 'Breaking changes to existing endpoints';
      examples: [
        'Removing endpoints',
        'Changing response structure',
        'Modifying required parameters',
        'Authentication changes'
      ];
      supportPolicy: 'Previous major version supported for 12 months';
    };
    
    minorVersion: {
      trigger: 'Backward-compatible additions';
      examples: [
        'New endpoints',
        'Additional optional parameters',
        'New response fields',
        'Performance improvements'
      ];
      supportPolicy: 'All minor versions within major version supported';
    };
    
    patchVersion: {
      trigger: 'Bug fixes and security updates';
      examples: [
        'Bug fixes',
        'Security patches',
        'Performance optimizations',
        'Documentation updates'
      ];
      supportPolicy: 'Latest patch version only';
    };
  };
  
  migrationStrategy: {
    deprecationNotice: {
      timeline: '6 months minimum before removal';
      method: 'HTTP headers and documentation';
      headers: {
        'X-API-Deprecated': 'true',
        'X-API-Sunset': 'ISO 8601 sunset date',
        'X-API-Replacement': 'URL to replacement endpoint'
      };
    };
    
    backwardCompatibility: {
      implementation: 'Version-aware middleware';
      features: [
        'Request transformation',
        'Response transformation',
        'Default value injection',
        'Field aliasing'
      ];
    };
  };
}
```

### Future Versioning Considerations

```typescript
interface FutureVersioningPlans {
  headerBasedVersioning: {
    header: 'Accept-Version: v2.0';
    advantages: [
      'Cleaner URLs',
      'Better caching',
      'Content negotiation'
    ];
    implementation: 'Custom middleware for header parsing';
  };
  
  mediaTypeVersioning: {
    mediaType: 'application/vnd.simpleadminreporter.v2+json';
    advantages: [
      'REST compliant',
      'Rich content negotiation',
      'Format and version in one header'
    ];
    implementation: 'Accept header parsing middleware';
  };
  
  schemaEvolution: {
    implementation: 'JSON Schema versioning';
    features: [
      'Automated schema migration',
      'Backward compatibility validation',
      'Client SDK generation',
      'API documentation generation'
    ];
  };
}
```

---

## Endpoint Architecture

### Resource-Based URL Design

```typescript
interface ResourceURLDesign {
  // Primary resources
  users: {
    collection: '/api/v1/users';
    individual: '/api/v1/users/{userId}';
    nested: {
      sessions: '/api/v1/users/{userId}/sessions';
      preferences: '/api/v1/users/{userId}/preferences';
      credentials: '/api/v1/users/{userId}/credentials';
    };
  };
  
  reports: {
    templates: '/api/v1/reports/templates';
    custom: '/api/v1/reports/custom';
    history: '/api/v1/reports/history';
    execution: '/api/v1/reports/execute/{templateId}';
    export: '/api/v1/reports/export/{reportId}';
  };
  
  query: {
    definitions: '/api/v1/queries/definitions';
    execute: '/api/v1/queries/execute';
    validate: '/api/v1/queries/validate';
    schema: '/api/v1/queries/schema/{dataSource}';
    cache: '/api/v1/queries/cache';
  };
  
  // System resources
  system: {
    health: '/api/v1/health';
    metrics: '/api/v1/metrics';
    configuration: '/api/v1/config';
  };
}
```

### Endpoint Categories

```typescript
interface EndpointCategories {
  publicEndpoints: {
    description: 'No authentication required';
    endpoints: [
      'GET /api/v1/health',
      'GET /api/v1/health/ready',
      'GET /api/v1/health/live',
      'GET /api/v1/',
      'OPTIONS *'  // CORS preflight
    ];
    features: [
      'Rate limiting applied',
      'CORS headers included',
      'Minimal response data'
    ];
  };
  
  authenticationEndpoints: {
    description: 'Authentication and session management';
    endpoints: [
      'POST /api/v1/auth/login',
      'POST /api/v1/auth/refresh',
      'POST /api/v1/auth/logout',
      'GET /api/v1/auth/profile',
      'GET /api/v1/auth/verify'
    ];
    features: [
      'Enhanced rate limiting',
      'Comprehensive audit logging',
      'Security headers',
      'IP-based restrictions'
    ];
  };
  
  dataEndpoints: {
    description: 'Core business functionality';
    endpoints: [
      '/api/v1/reports/*',
      '/api/v1/queries/*',
      '/api/v1/credentials/*',
      '/api/v1/scheduled-reports/*'
    ];
    features: [
      'Authentication required',
      'Authorization checks',
      'Resource-based access control',
      'Comprehensive audit logging',
      'Performance monitoring'
    ];
  };
  
  adminEndpoints: {
    description: 'Administrative functionality';
    endpoints: [
      'GET /api/v1/admin/*',
      'POST /api/v1/auth/create-user',
      'DELETE /api/v1/reports/admin/cleanup'
    ];
    features: [
      'Admin role requirement',
      'Enhanced audit logging',
      'Additional security checks',
      'Operation approval workflows'
    ];
  };
}
```

### HTTP Method Usage Patterns

```typescript
interface HTTPMethodPatterns {
  GET: {
    purpose: 'Retrieve resources or collections';
    characteristics: [
      'Idempotent operation',
      'No side effects',
      'Cacheable responses',
      'Query parameters for filtering'
    ];
    examples: {
      collection: 'GET /api/v1/reports/templates';
      individual: 'GET /api/v1/reports/templates/{id}';
      filtered: 'GET /api/v1/reports/history?status=completed';
      nested: 'GET /api/v1/users/{id}/credentials';
    };
  };
  
  POST: {
    purpose: 'Create new resources or trigger actions';
    characteristics: [
      'Non-idempotent operation',
      'Side effects expected',
      'Request body contains data',
      'Returns created resource or action result'
    ];
    examples: {
      create: 'POST /api/v1/reports/custom';
      action: 'POST /api/v1/reports/execute/{templateId}';
      bulk: 'POST /api/v1/reports/export/batch';
    };
  };
  
  PUT: {
    purpose: 'Update complete resources';
    characteristics: [
      'Idempotent operation',
      'Complete resource replacement',
      'Request body contains full resource',
      'Creates resource if not exists'
    ];
    examples: {
      update: 'PUT /api/v1/reports/custom/{id}';
      upsert: 'PUT /api/v1/users/{id}/preferences';
    };
  };
  
  PATCH: {
    purpose: 'Partial resource updates';
    characteristics: [
      'Non-idempotent operation',
      'Partial resource modification',
      'Request body contains changes only',
      'JSON Patch or custom format'
    ];
    examples: {
      partial: 'PATCH /api/v1/users/{id}';
      status: 'PATCH /api/v1/scheduled-reports/{id}/status';
    };
  };
  
  DELETE: {
    purpose: 'Remove resources';
    characteristics: [
      'Idempotent operation',
      'Resource removal',
      'May include soft delete',
      'Cascade behavior documented'
    ];
    examples: {
      single: 'DELETE /api/v1/reports/custom/{id}';
      cascade: 'DELETE /api/v1/users/{id}';  // Removes related data
      bulk: 'DELETE /api/v1/reports/history?before=2024-01-01';
    };
  };
}
```

---

## Request/Response Patterns

### Standard Request Format

```typescript
interface StandardRequestFormat {
  headers: {
    required: {
      'Content-Type': 'application/json';
      'Authorization': 'Bearer {jwt_token}';
    };
    optional: {
      'Accept': 'application/json';
      'Accept-Encoding': 'gzip, deflate, br';
      'User-Agent': 'Client identification';
      'X-Request-ID': 'Request correlation ID';
      'X-Client-Version': 'Client version information';
    };
  };
  
  queryParameters: {
    pagination: {
      page: 'Page number (1-based)';
      limit: 'Items per page (1-100)';
      offset: 'Alternative to page-based pagination';
    };
    
    filtering: {
      filter: 'Filter expression';
      search: 'Search query';
      category: 'Category filter';
      status: 'Status filter';
    };
    
    sorting: {
      sort: 'Sort field';
      order: 'Sort direction (asc|desc)';
      sortBy: 'Alternative sort field parameter';
    };
    
    options: {
      include: 'Related resources to include';
      exclude: 'Fields to exclude from response';
      format: 'Response format (json|csv|excel)';
      pretty: 'Pretty print JSON (development)';
    };
  };
  
  requestBody: {
    format: 'JSON (application/json)';
    validation: 'Joi schema validation';
    maxSize: '50MB for file uploads, 10MB for JSON';
    encoding: 'UTF-8';
  };
}
```

### Standard Response Format

```typescript
interface StandardResponseFormat {
  successResponse: {
    structure: {
      success: true;
      data: 'Response payload';
      metadata?: 'Additional information';
      message?: 'Optional success message';
    };
    
    example: {
      success: true;
      data: {
        id: 'uuid-string';
        name: 'Report Template Name';
        createdAt: '2024-01-15T10:30:00.000Z';
      };
      metadata: {
        executionTime: 150;  // milliseconds
        cached: false;
        version: '1.0.0';
      };
    };
  };
  
  collectionResponse: {
    structure: {
      success: true;
      data: 'Array of resources';
      pagination: 'Pagination metadata';
      metadata?: 'Collection-level metadata';
    };
    
    example: {
      success: true;
      data: [
        { id: '1', name: 'Item 1' },
        { id: '2', name: 'Item 2' }
      ];
      pagination: {
        page: 1;
        limit: 50;
        total: 150;
        pages: 3;
        hasNext: true;
        hasPrev: false;
      };
      metadata: {
        executionTime: 75;
        cached: true;
        cacheExpiry: '2024-01-15T11:00:00.000Z';
      };
    };
  };
  
  errorResponse: {
    structure: {
      success: false;
      error: {
        message: 'Human-readable error message';
        code?: 'Error code for programmatic handling';
        details?: 'Additional error details';
        field?: 'Field name for validation errors';
        statusCode: 'HTTP status code';
        timestamp: 'ISO 8601 timestamp';
        correlationId?: 'Request correlation ID';
      };
    };
    
    examples: {
      validation: {
        success: false;
        error: {
          message: 'Validation failed';
          code: 'VALIDATION_ERROR';
          details: 'Name is required and must be at least 3 characters';
          field: 'name';
          statusCode: 400;
          timestamp: '2024-01-15T10:30:00.000Z';
        };
      };
      
      authorization: {
        success: false;
        error: {
          message: 'Insufficient privileges';
          code: 'AUTHORIZATION_ERROR';
          statusCode: 403;
          timestamp: '2024-01-15T10:30:00.000Z';
        };
      };
      
      notFound: {
        success: false;
        error: {
          message: 'Resource not found';
          code: 'RESOURCE_NOT_FOUND';
          details: 'Report template with ID abc-123 does not exist';
          statusCode: 404;
          timestamp: '2024-01-15T10:30:00.000Z';
        };
      };
    };
  };
}
```

### Response Headers

```typescript
interface ResponseHeaders {
  standard: {
    'Content-Type': 'application/json; charset=utf-8';
    'Content-Encoding': 'gzip (when compressed)';
    'X-Response-Time': 'Response time in milliseconds';
    'X-Request-ID': 'Request correlation ID';
    'X-API-Version': 'API version used';
  };
  
  caching: {
    'Cache-Control': 'Caching directives';
    'ETag': 'Resource version identifier';
    'Last-Modified': 'Resource modification timestamp';
    'Expires': 'Cache expiration time';
  };
  
  pagination: {
    'X-Total-Count': 'Total number of items';
    'X-Page-Count': 'Total number of pages';
    'X-Page': 'Current page number';
    'X-Per-Page': 'Items per page';
    'X-Has-More': 'Boolean indicating more pages available';
  };
  
  rateLimit: {
    'X-RateLimit-Limit': 'Request limit per window';
    'X-RateLimit-Remaining': 'Remaining requests in window';
    'X-RateLimit-Reset': 'Window reset timestamp';
    'Retry-After': 'Seconds to wait before retry (when rate limited)';
  };
  
  security: {
    'X-Content-Type-Options': 'nosniff';
    'X-Frame-Options': 'DENY';
    'X-XSS-Protection': '1; mode=block';
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains';
  };
  
  api_specific: {
    'X-Execution-Time': 'Query execution time in milliseconds';
    'X-Cache-Status': 'HIT, MISS, or BYPASS';
    'X-Data-Source': 'Primary data source used';
    'X-Record-Count': 'Number of records in response';
    'X-Token-Refresh-Suggested': 'Boolean suggesting token refresh';
  };
}
```

---

## Error Handling Architecture

### Error Classification System

```typescript
interface ErrorClassificationSystem {
  errorCategories: {
    CLIENT_ERROR: {
      statusRange: '400-499';
      description: 'Client-side errors';
      handling: 'Return detailed error information';
      examples: [
        'Invalid request format',
        'Missing required parameters',
        'Authentication failures',
        'Authorization failures'
      ];
    };
    
    SERVER_ERROR: {
      statusRange: '500-599';
      description: 'Server-side errors';
      handling: 'Log detailed information, return generic message';
      examples: [
        'Database connection failures',
        'External service timeouts',
        'Unhandled exceptions',
        'Configuration errors'
      ];
    };
    
    BUSINESS_ERROR: {
      statusRange: '422';
      description: 'Business logic violations';
      handling: 'Return business-friendly error messages';
      examples: [
        'Insufficient permissions for data source',
        'Query complexity exceeds limits',
        'Report generation quota exceeded',
        'Invalid credential configuration'
      ];
    };
  };
  
  errorCodes: {
    // Authentication errors (AUTH_*)
    AUTH_TOKEN_INVALID: 'JWT token is invalid or expired';
    AUTH_TOKEN_MISSING: 'Authorization header missing';
    AUTH_CREDENTIALS_INVALID: 'Username or password incorrect';
    AUTH_SOURCE_UNAVAILABLE: 'Authentication source unavailable';
    
    // Authorization errors (AUTHZ_*)
    AUTHZ_INSUFFICIENT_PRIVILEGES: 'User lacks required permissions';
    AUTHZ_RESOURCE_ACCESS_DENIED: 'Access to resource denied';
    AUTHZ_DATA_SOURCE_RESTRICTED: 'Data source access restricted';
    
    // Validation errors (VALIDATION_*)
    VALIDATION_REQUIRED_FIELD: 'Required field missing';
    VALIDATION_INVALID_FORMAT: 'Field format invalid';
    VALIDATION_VALUE_OUT_OF_RANGE: 'Value outside acceptable range';
    VALIDATION_INVALID_ENUM: 'Value not in allowed enumeration';
    
    // Resource errors (RESOURCE_*)
    RESOURCE_NOT_FOUND: 'Requested resource does not exist';
    RESOURCE_ALREADY_EXISTS: 'Resource already exists';
    RESOURCE_CONFLICT: 'Resource state conflict';
    RESOURCE_LOCKED: 'Resource is locked for modification';
    
    // Query errors (QUERY_*)
    QUERY_SYNTAX_ERROR: 'Query syntax is invalid';
    QUERY_EXECUTION_ERROR: 'Query execution failed';
    QUERY_TIMEOUT: 'Query execution timed out';
    QUERY_COMPLEXITY_EXCEEDED: 'Query complexity exceeds limits';
    
    // System errors (SYSTEM_*)
    SYSTEM_DATABASE_ERROR: 'Database operation failed';
    SYSTEM_CACHE_ERROR: 'Cache operation failed';
    SYSTEM_EXTERNAL_SERVICE_ERROR: 'External service unavailable';
    SYSTEM_CONFIGURATION_ERROR: 'System configuration invalid';
  };
}
```

### Error Handling Middleware

```typescript
interface ErrorHandlingMiddleware {
  globalErrorHandler: {
    purpose: 'Catch and process all unhandled errors';
    implementation: `
      app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
        // Error classification
        const errorInfo = classifyError(err);
        
        // Error logging
        logger.error('API Error', {
          error: err.message,
          stack: err.stack,
          requestId: req.headers['x-request-id'],
          userId: req.user?.id,
          endpoint: req.path,
          method: req.method,
          timestamp: new Date().toISOString()
        });
        
        // Error response formatting
        const errorResponse = formatErrorResponse(errorInfo, req);
        
        // Send response
        res.status(errorInfo.statusCode).json(errorResponse);
      });
    `;
  };
  
  asyncErrorHandler: {
    purpose: 'Handle errors in async route handlers';
    implementation: `
      const asyncHandler = (fn: Function) => {
        return (req: Request, res: Response, next: NextFunction) => {
          Promise.resolve(fn(req, res, next)).catch(next);
        };
      };
    `;
  };
  
  validationErrorHandler: {
    purpose: 'Handle Joi validation errors';
    implementation: `
      const validationErrorHandler = (err: ValidationError) => {
        return {
          type: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: err.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message,
            value: detail.context?.value
          }))
        };
      };
    `;
  };
}
```

### Error Response Formatting

```typescript
interface ErrorResponseFormatting {
  developmentMode: {
    includeStack: true;
    includeRequestInfo: true;
    detailedMessages: true;
    
    example: {
      success: false;
      error: {
        message: 'Database connection failed';
        code: 'SYSTEM_DATABASE_ERROR';
        statusCode: 500;
        timestamp: '2024-01-15T10:30:00.000Z';
        stack: 'Error: Connection timeout\n    at ...',
        request: {
          method: 'GET';
          path: '/api/v1/reports';
          query: { page: 1 };
          headers: { 'user-agent': '...' };
        };
        correlationId: 'req_123456789';
      };
    };
  };
  
  productionMode: {
    includeStack: false;
    includeRequestInfo: false;
    sanitizedMessages: true;
    
    example: {
      success: false;
      error: {
        message: 'Internal server error';
        code: 'SYSTEM_ERROR';
        statusCode: 500;
        timestamp: '2024-01-15T10:30:00.000Z';
        correlationId: 'req_123456789';
      };
    };
  };
  
  validationErrors: {
    format: 'Detailed field-level validation errors';
    
    example: {
      success: false;
      error: {
        message: 'Validation failed';
        code: 'VALIDATION_ERROR';
        statusCode: 400;
        timestamp: '2024-01-15T10:30:00.000Z';
        details: [
          {
            field: 'name';
            message: 'Name is required';
            value: null;
          },
          {
            field: 'email';
            message: 'Email format is invalid';
            value: 'invalid-email';
          }
        ];
      };
    };
  };
}
```

---

## Rate Limiting & Throttling

### Multi-Level Rate Limiting

```typescript
interface RateLimitingArchitecture {
  globalRateLimit: {
    implementation: 'express-rate-limit with Redis store';
    configuration: {
      production: {
        windowMs: 15 * 60 * 1000;  // 15 minutes
        max: 100;  // requests per window
        message: 'Too many requests from this IP';
        standardHeaders: true;
        legacyHeaders: false;
      };
      development: {
        windowMs: 60 * 1000;  // 1 minute
        max: 1000;  // requests per window
        skip: 'Skip for localhost in development';
      };
    };
  };
  
  userRateLimit: {
    implementation: 'Custom middleware with Redis';
    configuration: {
      keyGenerator: '(req) => req.user?.id || req.ip';
      
      endpointLimits: {
        'POST /api/v1/auth/login': {
          windowMs: 60 * 1000;
          max: 10;
          message: 'Too many login attempts';
        };
        
        'POST /api/v1/reports/execute/*': {
          windowMs: 60 * 1000;
          max: 30;
          message: 'Report execution rate limit exceeded';
        };
        
        'POST /api/v1/credentials/*': {
          windowMs: 60 * 1000;
          max: 20;
          message: 'Credential operation rate limit exceeded';
        };
        
        'POST /api/v1/credentials/*/test': {
          windowMs: 60 * 1000;
          max: 30;
          message: 'Credential testing rate limit exceeded';
        };
      };
    };
  };
  
  apiKeyRateLimit: {
    implementation: 'Future implementation for API keys';
    configuration: {
      tierBasedLimits: {
        basic: { requestsPerHour: 1000 };
        premium: { requestsPerHour: 10000 };
        enterprise: { requestsPerHour: 100000 };
      };
    };
  };
}
```

### Throttling Strategies

```typescript
interface ThrottlingStrategies {
  requestThrottling: {
    algorithm: 'Token bucket with Redis backing';
    implementation: `
      class RequestThrottler {
        async checkLimit(key: string, limit: number, window: number): Promise<{
          allowed: boolean;
          remaining: number;
          resetTime: number;
        }> {
          const current = await redis.incr(key);
          if (current === 1) {
            await redis.expire(key, window);
          }
          
          const remaining = Math.max(0, limit - current);
          const resetTime = await redis.ttl(key);
          
          return {
            allowed: current <= limit,
            remaining,
            resetTime: Date.now() + (resetTime * 1000)
          };
        }
      }
    `;
  };
  
  resourceThrottling: {
    purpose: 'Limit resource-intensive operations';
    strategies: {
      queryComplexity: {
        metric: 'Estimated query execution time';
        limit: '30 seconds maximum execution time';
        implementation: 'Pre-execution complexity analysis';
      };
      
      resultSize: {
        metric: 'Number of records in result set';
        limit: '10,000 records per query';
        implementation: 'LIMIT clause injection';
      };
      
      exportSize: {
        metric: 'File size for exports';
        limit: '100MB maximum export file';
        implementation: 'Streaming export with size monitoring';
      };
      
      concurrentRequests: {
        metric: 'Simultaneous requests per user';
        limit: '5 concurrent report executions';
        implementation: 'Redis-based concurrency tracking';
      };
    };
  };
  
  adaptiveThrottling: {
    purpose: 'Dynamic rate limiting based on system load';
    implementation: `
      class AdaptiveThrottler {
        async getAdaptiveLimit(baseLimit: number): Promise<number> {
          const systemMetrics = await getSystemMetrics();
          
          // Reduce limits under high load
          if (systemMetrics.cpuUsage > 80 || systemMetrics.memoryUsage > 80) {
            return Math.floor(baseLimit * 0.5);
          }
          
          // Increase limits under low load
          if (systemMetrics.cpuUsage < 30 && systemMetrics.memoryUsage < 50) {
            return Math.floor(baseLimit * 1.5);
          }
          
          return baseLimit;
        }
      }
    `;
  };
}
```

---

## Caching Strategy

### Multi-Layer Caching Architecture

```typescript
interface CachingArchitecture {
  layers: {
    L1_InMemory: {
      purpose: 'Hot data and frequently accessed information';
      implementation: 'Node.js Map with TTL';
      scope: 'Single process';
      size: '100MB maximum';
      ttl: '5 minutes default';
      
      cachedData: [
        'User session data',
        'Field metadata',
        'Query definitions',
        'Configuration values'
      ];
    };
    
    L2_Redis: {
      purpose: 'Shared cache across multiple processes';
      implementation: 'Redis with key namespacing';
      scope: 'All API instances';
      size: '1GB allocated';
      ttl: 'Configurable per key pattern';
      
      cachedData: [
        'Query results',
        'User preferences',
        'Rate limiting counters',
        'Background job status',
        'Authentication tokens'
      ];
    };
    
    L3_CDN: {
      purpose: 'Static assets and public data';
      implementation: 'Future: CloudFlare or AWS CloudFront';
      scope: 'Global edge locations';
      size: 'Unlimited';
      ttl: 'Based on content type';
      
      cachedData: [
        'API documentation',
        'Static report templates',
        'Public schema definitions',
        'Client applications'
      ];
    };
  };
  
  cachingPatterns: {
    readThrough: {
      pattern: 'Cache miss triggers data source query';
      implementation: `
        async getCachedData(key: string): Promise<any> {
          let data = await cache.get(key);
          if (!data) {
            data = await dataSource.fetch(key);
            await cache.set(key, data, TTL);
          }
          return data;
        }
      `;
      useCases: [
        'Field metadata retrieval',
        'User profile information',
        'Report template definitions'
      ];
    };
    
    writeThrough: {
      pattern: 'Write to cache and data source simultaneously';
      implementation: `
        async updateData(key: string, data: any): Promise<void> {
          await Promise.all([
            dataSource.update(key, data),
            cache.set(key, data, TTL)
          ]);
        }
      `;
      useCases: [
        'User preferences updates',
        'Report template modifications',
        'Configuration changes'
      ];
    };
    
    writeAround: {
      pattern: 'Write to data source, invalidate cache';
      implementation: `
        async updateData(key: string, data: any): Promise<void> {
          await dataSource.update(key, data);
          await cache.delete(key);
        }
      `;
      useCases: [
        'Large report results',
        'Infrequently accessed data',
        'One-time query results'
      ];
    };
    
    refreshAhead: {
      pattern: 'Proactively refresh cache before expiration';
      implementation: `
        class RefreshAheadCache {
          async get(key: string): Promise<any> {
            const { data, expiresAt } = await cache.getWithTTL(key);
            
            // Refresh if within 20% of expiration
            if (Date.now() > expiresAt - (TTL * 0.2)) {
              this.backgroundRefresh(key);
            }
            
            return data;
          }
        }
      `;
      useCases: [
        'Frequently accessed field metadata',
        'Popular report templates',
        'System configuration'
      ];
    };
  };
}
```

### Cache Key Design

```typescript
interface CacheKeyDesign {
  keyNamespacing: {
    pattern: '{service}:{resource}:{identifier}:{version?}';
    examples: {
      userSession: 'auth:session:user_uuid:v1';
      queryResult: 'query:result:query_hash:v1';
      fieldMetadata: 'schema:fields:ad:users:v1';
      reportTemplate: 'report:template:template_uuid:v2';
    };
  };
  
  keyStrategies: {
    hierarchical: {
      purpose: 'Support pattern-based operations';
      example: 'reports:templates:ad:users:*';
      operations: ['SCAN', 'DEL pattern', 'EXPIRE pattern'];
    };
    
    hashed: {
      purpose: 'Handle complex query parameters';
      implementation: `
        function generateQueryCacheKey(query: QueryDefinition, params: any): string {
          const queryHash = createHash('sha256')
            .update(JSON.stringify({ query, params }))
            .digest('hex')
            .substring(0, 16);
          
          return \`query:result:\${queryHash}:v1\`;
        }
      `;
    };
    
    tagged: {
      purpose: 'Support cache invalidation by tags';
      example: {
        key: 'report:result:abc123:v1';
        tags: ['user:user123', 'template:template456', 'datasource:ad'];
      };
      invalidation: 'Invalidate all keys with specific tag';
    };
  };
  
  ttlStrategies: {
    fixed: {
      description: 'Fixed expiration time';
      examples: {
        userSessions: '1 hour',
        fieldMetadata: '4 hours',
        queryResults: '15 minutes',
        systemConfig: '24 hours'
      };
    };
    
    sliding: {
      description: 'Reset expiration on access';
      implementation: `
        async getSlidingTTL(key: string): Promise<any> {
          const data = await cache.get(key);
          if (data) {
            await cache.expire(key, SLIDING_TTL);
          }
          return data;
        }
      `;
      useCases: ['Active user sessions', 'Frequently accessed templates'];
    };
    
    adaptive: {
      description: 'TTL based on access patterns';
      algorithm: `
        TTL = baseTTL * (1 + log(accessFrequency)) * qualityFactor
      `;
      factors: {
        accessFrequency: 'How often the data is accessed';
        qualityFactor: 'Data freshness importance (0.5-2.0)';
        baseTTL: 'Minimum cache duration';
      };
    };
  };
}
```

### Cache Invalidation

```typescript
interface CacheInvalidationStrategy {
  invalidationMethods: {
    timeToLive: {
      description: 'Automatic expiration based on TTL';
      implementation: 'Redis native TTL support';
      useCases: ['General query results', 'Session data'];
    };
    
    explicit: {
      description: 'Manual cache invalidation';
      implementation: `
        async invalidateCache(pattern: string): Promise<void> {
          const keys = await cache.keys(pattern);
          if (keys.length > 0) {
            await cache.del(...keys);
          }
        }
      `;
      triggers: [
        'Data modifications',
        'Template updates',
        'User permission changes',
        'System configuration changes'
      ];
    };
    
    eventDriven: {
      description: 'Invalidation based on system events';
      implementation: `
        eventEmitter.on('user:updated', async (userId: string) => {
          await invalidateCache(\`auth:session:\${userId}:*\`);
          await invalidateCache(\`user:preferences:\${userId}:*\`);
        });
        
        eventEmitter.on('template:updated', async (templateId: string) => {
          await invalidateCache(\`report:template:\${templateId}:*\`);
          await invalidateCache(\`query:result:*:template:\${templateId}:*\`);
        });
      `;
    };
    
    writeThrough: {
      description: 'Update cache on data writes';
      implementation: `
        async updateUserPreferences(userId: string, preferences: any): Promise<void> {
          // Update database
          await db.updateUserPreferences(userId, preferences);
          
          // Update cache
          const cacheKey = \`user:preferences:\${userId}:v1\`;
          await cache.set(cacheKey, preferences, PREFERENCES_TTL);
        }
      `;
    };
  };
  
  invalidationPolicies: {
    userContext: {
      triggers: ['User login/logout', 'Permission changes', 'Profile updates'];
      scope: 'All user-specific cache entries';
      pattern: 'user:{userId}:*';
    };
    
    dataSource: {
      triggers: ['Schema changes', 'Connection updates', 'Discovery refresh'];
      scope: 'All data source metadata';
      pattern: 'schema:{dataSource}:*';
    };
    
    template: {
      triggers: ['Template creation/update/deletion', 'Permission changes'];
      scope: 'Template and related query results';
      patterns: ['report:template:{templateId}:*', 'query:result:*:template:{templateId}:*'];
    };
    
    global: {
      triggers: ['System maintenance', 'Version deployment', 'Emergency flush'];
      scope: 'All cached data';
      implementation: 'Redis FLUSHDB command';
    };
  };
}
```

---

## Performance Optimization

### API Performance Strategies

```typescript
interface APIPerformanceOptimization {
  requestOptimization: {
    compression: {
      implementation: 'Express compression middleware';
      algorithms: ['gzip', 'deflate', 'br'];
      configuration: {
        level: 6;  // Compression level (1-9)
        threshold: 1024;  // Minimum size to compress (bytes)
        filter: 'Compress JSON, text, and JavaScript responses';
      };
    };
    
    keepAlive: {
      implementation: 'HTTP Keep-Alive connections';
      configuration: {
        timeout: 5000;  // 5 seconds
        maxRequests: 100;  // Requests per connection
      };
    };
    
    requestParsing: {
      optimization: 'Limit request body size and parsing';
      configuration: {
        jsonLimit: '10mb';
        urlEncodedLimit: '10mb';
        parameterLimit: 1000;
      };
    };
  };
  
  databaseOptimization: {
    connectionPooling: {
      implementation: 'PostgreSQL connection pool';
      configuration: {
        min: 5;   // Minimum connections
        max: 20;  // Maximum connections
        idleTimeoutMillis: 30000;
        connectionTimeoutMillis: 2000;
      };
    };
    
    queryOptimization: {
      strategies: [
        'Prepared statements for repeated queries',
        'Index optimization for common query patterns',
        'Query result pagination',
        'Selective field retrieval',
        'Batch operations where possible'
      ];
      
      indexStrategy: {
        userQueries: 'Composite index on (user_id, status, executed_at DESC)';
        reportHistory: 'Partial index on active reports only';
        auditLogs: 'Time-based partitioning for scalability';
      };
    };
    
    readReplicas: {
      purpose: 'Separate read and write operations';
      implementation: 'Future: PostgreSQL read replicas';
      routing: {
        writes: 'Primary database instance';
        reads: 'Load-balanced across read replicas';
        reports: 'Dedicated reporting replica';
      };
    };
  };
  
  responseOptimization: {
    fieldSelection: {
      implementation: 'GraphQL-style field selection';
      queryParameter: '?fields=id,name,createdAt';
      example: `
        GET /api/v1/reports/templates?fields=id,name,description
        // Returns only specified fields, reducing payload size
      `;
    };
    
    dataTransformation: {
      lazy: 'Transform data only when requested';
      streaming: 'Stream large result sets';
      pagination: 'Limit result set size with pagination';
    };
    
    conditionalRequests: {
      etags: 'Generate ETags for cacheable resources';
      lastModified: 'Include Last-Modified headers';
      implementation: `
        app.get('/api/v1/reports/templates/:id', (req, res) => {
          const template = getTemplate(req.params.id);
          
          // Set ETag based on template version/modified date
          const etag = generateETag(template);
          res.set('ETag', etag);
          
          // Check if client has current version
          if (req.headers['if-none-match'] === etag) {
            return res.status(304).send();
          }
          
          res.json(template);
        });
      `;
    };
  };
  
  concurrencyOptimization: {
    asyncProcessing: {
      implementation: 'Non-blocking I/O operations';
      strategies: [
        'Async/await for all database operations',
        'Promise.all for parallel operations',
        'Background job queues for long-running tasks',
        'Streaming for large data transfers'
      ];
    };
    
    backgroundJobs: {
      implementation: 'Bull queue with Redis';
      jobTypes: [
        'Report generation',
        'Data export',
        'Cache warming',
        'Cleanup operations',
        'Audit log processing'
      ];
      
      configuration: {
        concurrency: 5;  // Concurrent job processing
        retryAttempts: 3;
        retryDelay: 5000;  // Exponential backoff
      };
    };
    
    resourcePooling: {
      ldapConnections: 'Pool LDAP connections (5 per server)';
      httpClients: 'Reuse HTTP clients for Graph API';
      fileHandles: 'Limit concurrent file operations';
    };
  };
}
```

### Monitoring & Observability

```typescript
interface MonitoringObservability {
  applicationMetrics: {
    responseTime: {
      metric: 'HTTP request duration';
      labels: ['method', 'route', 'status_code'];
      buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10];  // Histogram buckets in seconds
      implementation: 'Express middleware with histogram tracking';
    };
    
    throughput: {
      metric: 'Requests per second';
      labels: ['method', 'route'];
      implementation: 'Counter incremented on each request';
    };
    
    errorRate: {
      metric: 'Error rate by endpoint and type';
      labels: ['method', 'route', 'error_type', 'status_code'];
      implementation: 'Counter incremented on error responses';
    };
    
    activeConnections: {
      metric: 'Current active connections';
      implementation: 'Gauge tracking connection count';
    };
  };
  
  businessMetrics: {
    reportExecutions: {
      metric: 'Report execution count and duration';
      labels: ['data_source', 'template_type', 'user_type'];
      dimensions: ['success_rate', 'execution_time', 'result_size'];
    };
    
    userActivity: {
      metric: 'Active users and session duration';
      labels: ['auth_source'];
      dimensions: ['daily_active_users', 'session_duration', 'feature_usage'];
    };
    
    dataSourceHealth: {
      metric: 'Data source availability and performance';
      labels: ['data_source', 'operation'];
      dimensions: ['availability', 'response_time', 'error_rate'];
    };
    
    cachePerformance: {
      metric: 'Cache hit rate and operation timing';
      labels: ['cache_layer', 'operation_type'];
      dimensions: ['hit_rate', 'operation_duration', 'memory_usage'];
    };
  };
  
  healthChecks: {
    endpoints: {
      '/api/v1/health': 'Basic health status';
      '/api/v1/health/ready': 'Readiness probe for Kubernetes';
      '/api/v1/health/live': 'Liveness probe for Kubernetes';
      '/api/v1/health/detailed': 'Comprehensive system health';
    };
    
    checks: {
      database: {
        test: 'SELECT 1 query execution';
        timeout: 5000;  // 5 seconds
        critical: true;
      };
      
      redis: {
        test: 'PING command execution';
        timeout: 2000;  // 2 seconds
        critical: true;
      };
      
      activeDirectory: {
        test: 'LDAP bind operation';
        timeout: 10000;  // 10 seconds
        critical: false;  // Non-critical for API availability
      };
      
      azureAD: {
        test: 'Graph API token validation';
        timeout: 10000;  // 10 seconds
        critical: false;  // Non-critical for API availability
      };
      
      fileSystem: {
        test: 'Write/read test file';
        timeout: 3000;  // 3 seconds
        critical: false;
      };
    };
  };
  
  logging: {
    structured: {
      format: 'JSON structured logging';
      fields: {
        timestamp: 'ISO 8601 timestamp';
        level: 'Log level (error, warn, info, debug)';
        message: 'Human-readable message';
        requestId: 'Request correlation ID';
        userId: 'Authenticated user ID';
        component: 'Source component/service';
        metadata: 'Additional context (object)';
      };
    };
    
    levels: {
      error: 'System errors, exceptions, critical issues';
      warn: 'Warning conditions, performance issues';
      info: 'General information, business events';
      debug: 'Detailed debugging information';
      trace: 'Fine-grained execution tracing';
    };
    
    destinations: {
      console: 'Development and container logs';
      file: 'Structured log files with rotation';
      external: 'Future: ELK stack or cloud logging';
    };
    
    retention: {
      error: '90 days';
      warn: '30 days';
      info: '14 days';
      debug: '7 days (development only)';
    };
  };
  
  alerting: {
    triggers: {
      high_error_rate: 'Error rate > 5% for 5 minutes';
      slow_response: '95th percentile response time > 2 seconds';
      database_connection_failed: 'Database health check fails';
      memory_usage_high: 'Memory usage > 80% for 10 minutes';
      disk_space_low: 'Disk space < 10% remaining';
    };
    
    channels: {
      email: 'Critical alerts to operations team';
      slack: 'Warning and error notifications';
      webhook: 'Integration with external monitoring systems';
    };
    
    escalation: {
      immediate: 'Critical system failures';
      hourly: 'Performance degradation';
      daily: 'Usage and capacity reports';
    };
  };
}
```

---

## API Gateway & Proxy

### Nginx Reverse Proxy Configuration

```typescript
interface NginxProxyConfiguration {
  upstreamConfiguration: {
    definition: `
      upstream backend {
        server backend:5000 max_fails=3 fail_timeout=30s;
        # Future: Add multiple backend instances for load balancing
        # server backend2:5000 max_fails=3 fail_timeout=30s;
        keepalive 32;
      }
    `;
    
    healthChecks: {
      passive: 'Monitor failed requests and timeouts';
      active: 'Future: Periodic health check requests';
    };
  };
  
  locationBlocks: {
    api: {
      pattern: '/api/';
      configuration: `
        location /api/ {
          proxy_pass http://backend;
          proxy_http_version 1.1;
          proxy_set_header Upgrade $http_upgrade;
          proxy_set_header Connection 'upgrade';
          proxy_set_header Host $host;
          proxy_set_header X-Real-IP $remote_addr;
          proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
          proxy_set_header X-Forwarded-Proto $scheme;
          
          # Timeouts
          proxy_connect_timeout 30s;
          proxy_send_timeout 30s;
          proxy_read_timeout 30s;
          
          # Buffer configuration
          proxy_buffering on;
          proxy_buffer_size 4k;
          proxy_buffers 8 4k;
          
          # Error handling
          proxy_next_upstream error timeout invalid_header http_500 http_502 http_503;
        }
      `;
    };
    
    static: {
      pattern: '/';
      configuration: `
        location / {
          try_files $uri $uri/ /index.html;
          
          # Cache static assets
          location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
            add_header Vary Accept-Encoding;
          }
          
          # Security headers
          add_header X-Frame-Options DENY;
          add_header X-Content-Type-Options nosniff;
          add_header X-XSS-Protection "1; mode=block";
        }
      `;
    };
  };
  
  rateLimiting: {
    zones: `
      # Rate limiting zones
      limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
      limit_req_zone $binary_remote_addr zone=login:10m rate=1r/s;
      limit_req_zone $binary_remote_addr zone=general:10m rate=100r/m;
    `;
    
    application: `
      # Apply rate limiting
      location /api/auth/login {
        limit_req zone=login burst=5 nodelay;
        proxy_pass http://backend;
      }
      
      location /api/ {
        limit_req zone=api burst=20 nodelay;
        limit_req zone=general burst=50 nodelay;
        proxy_pass http://backend;
      }
    `;
  };
  
  compression: {
    configuration: `
      gzip on;
      gzip_vary on;
      gzip_min_length 1024;
      gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/json
        application/javascript
        application/xml+rss
        application/atom+xml
        image/svg+xml;
    `;
  };
  
  security: {
    ssl: `
      # SSL Configuration (when enabled)
      ssl_protocols TLSv1.2 TLSv1.3;
      ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384;
      ssl_prefer_server_ciphers off;
      
      # HSTS
      add_header Strict-Transport-Security "max-age=63072000" always;
    `;
    
    headers: `
      # Security headers
      add_header X-Frame-Options DENY;
      add_header X-Content-Type-Options nosniff;
      add_header X-XSS-Protection "1; mode=block";
      add_header Referrer-Policy "strict-origin-when-cross-origin";
    `;
  };
}
```

### Future API Gateway Features

```typescript
interface FutureAPIGatewayFeatures {
  advancedLoadBalancing: {
    algorithms: ['round_robin', 'least_connections', 'ip_hash', 'weighted'];
    healthChecks: 'Active and passive health monitoring';
    circuitBreaker: 'Automatic failover and recovery';
  };
  
  apiVersioning: {
    headerBased: 'Accept-Version header routing';
    pathBased: 'URL path version routing';
    parameterBased: 'Query parameter version routing';
  };
  
  requestTransformation: {
    headerManipulation: 'Add, remove, or modify headers';
    bodyTransformation: 'Request/response body modification';
    parameterMapping: 'Query parameter transformation';
  };
  
  authentication: {
    jwtValidation: 'JWT token validation at gateway level';
    apiKeyManagement: 'API key authentication and management';
    oauthIntegration: 'OAuth 2.0 / OpenID Connect integration';
  };
  
  analytics: {
    requestTracking: 'Detailed request/response analytics';
    performanceMetrics: 'Latency and throughput monitoring';
    userBehavior: 'API usage patterns and trends';
  };
  
  developerPortal: {
    apiDocumentation: 'Auto-generated API documentation';
    sdkGeneration: 'Client SDK generation';
    testingTools: 'Interactive API testing interface';
  };
}
```

## Current Implementation Status (2025 Update)

### LDAP Query System
The application now uses a modular LDAP query system:
- **Query Definitions**: Structured JSON definitions in `/backend/src/queries/ldap/`
- **Query Executor**: Service for executing pre-defined reports with user credentials
- **Report History**: Complete execution history stored in `report_history` table
- **Parameter Validation**: Runtime parameter validation and transformation

### Enhanced Logs API
Comprehensive logs system with advanced features:
- **SQL Query Builder**: Type-safe query construction with injection protection
- **Redis Caching**: Intelligent caching with pattern-based invalidation
- **Full-text Search**: PostgreSQL tsvector search with ranking
- **Performance Metrics**: Real-time query performance monitoring

### Rate Limiting Implementation
Actual rate limiting configuration:
```typescript
// Current rate limits
logsQueryRateLimiter: 30 requests/minute
logsExportRateLimiter: 5 exports/10 minutes
logsStreamRateLimiter: 5 concurrent streams/minute
globalRateLimit: 100 requests per 15 minutes (production)
```

This API architecture provides a comprehensive foundation for enterprise-grade reporting services with robust security, performance optimization, and observability features, supporting current needs while allowing for future scalability and enhancement.