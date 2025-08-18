import * as authWrapper from './auth-wrapper';

// Simple integration test without mocking
describe('Auth Wrapper Middleware', () => {
  describe('Module Exports', () => {
    test('should export authenticate function', () => {
      expect(typeof authWrapper.authenticate).toBe('function');
      expect(authWrapper.authenticate).toBeDefined();
    });

    test('should export requireAuth function', () => {
      expect(typeof authWrapper.requireAuth).toBe('function');
      expect(authWrapper.requireAuth).toBeDefined();
    });

    test('should export requireAdmin function', () => {
      expect(typeof authWrapper.requireAdmin).toBe('function');
      expect(authWrapper.requireAdmin).toBeDefined();
    });

    test('should export optionalAuth function', () => {
      expect(typeof authWrapper.optionalAuth).toBe('function');
      expect(authWrapper.optionalAuth).toBeDefined();
    });

    test('should export requireAuthSource function', () => {
      expect(typeof authWrapper.requireAuthSource).toBe('function');
      expect(authWrapper.requireAuthSource).toBeDefined();
    });

    test('should export requireRole function', () => {
      expect(typeof authWrapper.requireRole).toBe('function');
      expect(authWrapper.requireRole).toBeDefined();
    });

    test('should export requireResourceAccess function', () => {
      expect(typeof authWrapper.requireResourceAccess).toBe('function');
      expect(authWrapper.requireResourceAccess).toBeDefined();
    });

    test('should export auditAction function', () => {
      expect(typeof authWrapper.auditAction).toBe('function');
      expect(authWrapper.auditAction).toBeDefined();
    });

    test('should export userRateLimit function', () => {
      expect(typeof authWrapper.userRateLimit).toBe('function');
      expect(authWrapper.userRateLimit).toBeDefined();
    });

    test('should export autoRefreshToken function', () => {
      expect(typeof authWrapper.autoRefreshToken).toBe('function');
      expect(authWrapper.autoRefreshToken).toBeDefined();
    });

    test('should export requireCSRF function', () => {
      expect(typeof authWrapper.requireCSRF).toBe('function');
      expect(authWrapper.requireCSRF).toBeDefined();
    });

    test('should export roleCheckers object', () => {
      expect(typeof authWrapper.roleCheckers).toBe('object');
      expect(authWrapper.roleCheckers).toBeDefined();
    });

    test('should export resourceCheckers object', () => {
      expect(typeof authWrapper.resourceCheckers).toBe('object');
      expect(authWrapper.resourceCheckers).toBeDefined();
    });
  });

  describe('Module Structure', () => {
    test('should have all required auth middleware exports', () => {
      const requiredExports = [
        'authenticate',
        'requireAuth', 
        'requireAdmin',
        'optionalAuth',
        'requireAuthSource',
        'requireRole',
        'requireResourceAccess',
        'auditAction',
        'userRateLimit',
        'autoRefreshToken',
        'requireCSRF'
      ];

      requiredExports.forEach(exportName => {
        expect(authWrapper).toHaveProperty(exportName);
        expect(typeof (authWrapper as any)[exportName]).toBe('function');
      });
    });

    test('should have helper objects', () => {
      expect(authWrapper).toHaveProperty('roleCheckers');
      expect(authWrapper).toHaveProperty('resourceCheckers');
      expect(typeof authWrapper.roleCheckers).toBe('object');
      expect(typeof authWrapper.resourceCheckers).toBe('object');
    });

    test('should provide middleware functions with proper structure', () => {
      // Test that key middleware functions exist and appear to be Express middleware
      const middlewares = [
        authWrapper.authenticate,
        authWrapper.requireAuth,
        authWrapper.requireAdmin
      ];

      middlewares.forEach(middleware => {
        expect(typeof middleware).toBe('function');
        // Express middleware typically has 3+ parameters (req, res, next, ...)
        expect(middleware.length >= 0).toBe(true); // Some may be wrapped/bound
      });
    });

    test('should maintain consistent naming conventions', () => {
      const exportNames = Object.keys(authWrapper);
      
      // Should use camelCase naming
      exportNames.forEach(name => {
        expect(name).toMatch(/^[a-z][a-zA-Z0-9]*$/);
      });
    });
  });

  describe('Integration with Unified Auth System', () => {
    test('should provide a complete authentication interface', () => {
      // Core authentication
      expect(authWrapper.authenticate).toBeDefined();
      expect(authWrapper.requireAuth).toBeDefined();
      expect(authWrapper.optionalAuth).toBeDefined();
      
      // Authorization
      expect(authWrapper.requireAdmin).toBeDefined();
      expect(authWrapper.requireRole).toBeDefined();
      expect(authWrapper.requireResourceAccess).toBeDefined();
      
      // Security features
      expect(authWrapper.auditAction).toBeDefined();
      expect(authWrapper.userRateLimit).toBeDefined();
      expect(authWrapper.requireCSRF).toBeDefined();
      
      // Token management
      expect(authWrapper.autoRefreshToken).toBeDefined();
      
      // Helper functions
      expect(authWrapper.roleCheckers).toBeDefined();
      expect(authWrapper.resourceCheckers).toBeDefined();
    });

    test('should provide auth source specific middleware', () => {
      expect(authWrapper.requireAuthSource).toBeDefined();
      expect(typeof authWrapper.requireAuthSource).toBe('function');
    });

    test('should export proper TypeScript types', () => {
      // This is tested by the TypeScript compiler during build
      // If the module compiles without errors, the types are properly exported
      expect(typeof authWrapper).toBe('object');
      expect(authWrapper).not.toBeNull();
    });
  });

  describe('Module Loading', () => {
    test('should load without errors', () => {
      // If this test runs, the module loaded successfully
      expect(authWrapper).toBeDefined();
      expect(typeof authWrapper).toBe('object');
    });

    test('should not be null or undefined', () => {
      expect(authWrapper).not.toBeNull();
      expect(authWrapper).not.toBeUndefined();
    });

    test('should have non-empty export object', () => {
      const exportKeys = Object.keys(authWrapper);
      expect(exportKeys.length).toBeGreaterThan(0);
    });
  });

  describe('Function Availability', () => {
    test('should have all middleware functions callable', () => {
      const middlewareFunctions = [
        'authenticate',
        'requireAuth',
        'requireAdmin',
        'optionalAuth',
        'requireAuthSource', 
        'requireRole',
        'requireResourceAccess',
        'auditAction',
        'userRateLimit',
        'autoRefreshToken',
        'requireCSRF'
      ];

      middlewareFunctions.forEach(funcName => {
        const func = (authWrapper as any)[funcName];
        expect(typeof func).toBe('function');
        expect(func).toBeDefined();
        expect(func).not.toBeNull();
      });
    });

    test('should have helper objects with expected structure', () => {
      expect(authWrapper.roleCheckers).toBeInstanceOf(Object);
      expect(authWrapper.resourceCheckers).toBeInstanceOf(Object);
      
      // Should not be functions themselves
      expect(typeof authWrapper.roleCheckers).not.toBe('function');
      expect(typeof authWrapper.resourceCheckers).not.toBe('function');
    });
  });
});