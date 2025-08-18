# Health Service Module

## Overview

The Health Service module provides comprehensive health monitoring for all system components following the LEVER framework principles. It has been refactored to be modular, extensible, and maintainable.

## Architecture

### Key Components

1. **Base Health Checker (`base-health-checker.ts`)**
   - Abstract base class for all health checkers
   - Provides common functionality: timeout handling, error handling, result formatting
   - Standardizes health check patterns across all components

2. **Individual Health Checkers (`checkers/`)**
   - `DatabaseHealthChecker`: PostgreSQL connection and pool statistics
   - `RedisHealthChecker`: Redis connection and memory statistics
   - `LDAPHealthChecker`: Active Directory LDAP connectivity
   - `AzureHealthChecker`: Azure AD authentication status
   - `QueueHealthChecker`: Bull Queue job statistics
   - `StorageHealthChecker`: File system write access
   - `SystemHealthChecker`: CPU, memory, and disk usage

3. **Health Service (`health.service.ts`)**
   - Orchestrates all health checks
   - Executes checks in parallel for performance
   - Calculates overall system health status

4. **Configuration (`config.ts`)**
   - Centralized timeout and threshold configuration
   - Environment variable support for all settings
   - Standard health check messages

5. **Types (`types.ts`)**
   - TypeScript interfaces for all health check results
   - Consistent type definitions across the module

## LEVER Framework Implementation

### L - Leverage Existing Patterns
- Extends base class for all health checkers
- Reuses error handling and timeout logic
- Leverages existing configuration service patterns

### E - Extend Before Creating
- Base health checker can be extended for new components
- Configuration easily extended through environment variables
- New health checkers simply extend the base class

### V - Verify Through Reactivity
- All health checks include proper error handling
- Timeout protection on all external service calls
- Graceful degradation when services are unavailable

### E - Eliminate Duplication
- Common health check logic consolidated in base class
- Shared configuration and message constants
- Reusable type definitions

### R - Reduce Complexity
- Simple, focused health checkers
- Clear separation of concerns
- Parallel execution for better performance

## Usage

```typescript
import { healthService } from '@/services/health';

// Get full health status
const health = await healthService.getHealthStatus();

// Get specific component health
const dbHealth = await healthService.getComponentHealth('database');

// Check if system is operational
const isHealthy = await healthService.isOperational();

// Get health summary
const summary = await healthService.getHealthSummary();
```

## Configuration

All health check parameters can be configured via environment variables:

```bash
# Timeouts (in milliseconds)
HEALTH_DB_TIMEOUT=5000
HEALTH_REDIS_TIMEOUT=3000
HEALTH_LDAP_TIMEOUT=10000
HEALTH_AZURE_TIMEOUT=8000
HEALTH_QUEUE_TIMEOUT=3000
HEALTH_STORAGE_TIMEOUT=2000
HEALTH_SYSTEM_TIMEOUT=1000

# Thresholds
HEALTH_CPU_DEGRADED=70
HEALTH_CPU_UNHEALTHY=90
HEALTH_MEMORY_DEGRADED=70
HEALTH_MEMORY_UNHEALTHY=90
HEALTH_DISK_DEGRADED=70
HEALTH_DISK_UNHEALTHY=90
HEALTH_QUEUE_FAILED_THRESHOLD=100
HEALTH_QUEUE_WAITING_THRESHOLD=1000
```

## Adding New Health Checks

1. Create a new checker class extending `BaseHealthChecker`:

```typescript
import { BaseHealthChecker } from '../base-health-checker';
import { HealthCheckResult, HealthCheckContext } from '../types';

export class MyServiceHealthChecker extends BaseHealthChecker {
  constructor() {
    super('myservice');
  }

  protected async performCheck(context: HealthCheckContext): Promise<HealthCheckResult> {
    // Implement your health check logic
    const isHealthy = await checkMyService();
    
    if (isHealthy) {
      return this.createHealthyResult(
        Date.now() - context.startTime,
        { /* additional details */ }
      );
    }
    
    return this.createDegradedResult(
      'Service is degraded',
      Date.now() - context.startTime
    );
  }
}
```

2. Add configuration to `config.ts`:

```typescript
myservice: {
  timeout: parseInt(process.env.HEALTH_MYSERVICE_TIMEOUT || '5000', 10)
}
```

3. Add the checker to the health service:

```typescript
private readonly checkers: {
  // ... existing checkers
  myservice: MyServiceHealthChecker;
};
```

## Health Status Levels

- **Healthy**: Component is functioning normally
- **Degraded**: Component is functional but not optimal
- **Unhealthy**: Component is not functioning properly

The overall system status is determined by the worst component status.

## Performance Considerations

- All health checks execute in parallel
- Individual timeouts prevent hanging checks
- Lightweight checks for minimal system impact
- Results include response time metrics

## Error Handling

- Network errors are gracefully handled
- Timeout protection on all external calls
- Specific error messages for common failures
- Fallback results when checks fail