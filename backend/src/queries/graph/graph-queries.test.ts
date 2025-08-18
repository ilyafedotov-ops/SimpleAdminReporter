import { 
  GraphQueryDefinition, 
  daysToDate, 
  hoursToDate, 
  formatDateForGraph,
  escapeODataValue,
  buildDynamicFilter,
  isGraphQueryDefinition,
  hasParameters,
  requiresAuthentication
} from './types';
import { getAllQueries, getQueryById, getQueriesByCategory } from './index';
import { inactiveUsersQuery } from './users/inactive-users';
import { guestUsersQuery } from './users/guest-users';
import { mfaStatusQuery } from './users/mfa-status';
import { riskyUsersQuery } from './security/risky-users';
import { privilegedRolesQuery } from './security/privileged-roles';
import { licenseAssignmentsQuery } from './licenses/license-assignments';
import { groupMembersQuery } from './groups/group-members';

describe('Graph Query Definitions', () => {
  describe('Query Registry', () => {
    it('should retrieve all queries', () => {
      const queries = getAllQueries();
      expect(queries).toBeDefined();
      expect(queries.length).toBeGreaterThan(0);
      expect(queries.every(q => isGraphQueryDefinition(q))).toBe(true);
    });

    it('should retrieve query by ID', () => {
      const query = getQueryById('inactive_users');
      expect(query).toBeDefined();
      expect(query?.id).toBe('inactive_users');
      expect(query?.name).toBe('Inactive Users');
    });

    it('should return undefined for non-existent query ID', () => {
      const query = getQueryById('non_existent_query');
      expect(query).toBeUndefined();
    });

    it('should retrieve queries by category', () => {
      const userQueries = getQueriesByCategory('users');
      expect(userQueries.length).toBeGreaterThan(0);
      expect(userQueries.every(q => q.category === 'users')).toBe(true);

      const securityQueries = getQueriesByCategory('security');
      expect(securityQueries.length).toBeGreaterThan(0);
      expect(securityQueries.every(q => q.category === 'security')).toBe(true);
    });
  });

  describe('Individual Query Definitions', () => {
    describe('Inactive Users Query', () => {
      it('should have correct structure', () => {
        expect(inactiveUsersQuery.id).toBe('inactive_users');
        expect(inactiveUsersQuery.category).toBe('users');
        expect(inactiveUsersQuery.query.endpoint).toBe('/users');
        expect(inactiveUsersQuery.query.select).toContain('signInActivity');
      });

      it('should have days parameter', () => {
        expect(hasParameters(inactiveUsersQuery)).toBe(true);
        expect(inactiveUsersQuery.parameters?.days).toBeDefined();
        expect(inactiveUsersQuery.parameters?.days.type).toBe('number');
        expect(inactiveUsersQuery.parameters?.days.default).toBe(90);
      });

      it('should have post-processing transform', () => {
        expect(inactiveUsersQuery.postProcess?.transform).toBe('calculateInactivity');
      });
    });

    describe('Guest Users Query', () => {
      it('should have correct filter', () => {
        expect(guestUsersQuery.query.filter).toBe("userType eq 'Guest'");
        expect(guestUsersQuery.query.select).toContain('createdDateTime');
        expect(guestUsersQuery.query.select).toContain('externalUserState');
      });

      it('should have field mappings', () => {
        expect(guestUsersQuery.fieldMappings).toBeDefined();
        expect(guestUsersQuery.fieldMappings?.userPrincipalName.displayName).toBe('Email');
        expect(guestUsersQuery.fieldMappings?.externalUserState.displayName).toBe('Invitation Status');
      });
    });

    describe('MFA Status Query', () => {
      it('should use beta endpoint', () => {
        expect(mfaStatusQuery.query.apiVersion).toBe('beta');
        expect(mfaStatusQuery.query.endpoint).toBe('/users');
        expect(mfaStatusQuery.query.expand).toContain('authentication($select=methods)');
      });

      it('should have enrichment transform', () => {
        expect(mfaStatusQuery.postProcess?.transform).toBe('expandAuthMethods');
      });
    });

    describe('Risky Users Query', () => {
      it('should query identity protection endpoint', () => {
        expect(riskyUsersQuery.query.endpoint).toBe('/identityProtection/riskyUsers');
        expect(riskyUsersQuery.query.select).toContain('riskLevel');
        expect(riskyUsersQuery.query.select).toContain('riskState');
      });

      it('should order by risk level', () => {
        expect(riskyUsersQuery.query.orderBy).toBe('riskLevel desc');
      });
    });

    describe('Privileged Roles Query', () => {
      it('should use beta endpoint for directory roles', () => {
        expect(privilegedRolesQuery.query.apiVersion).toBe('beta');
        expect(privilegedRolesQuery.query.endpoint).toBe('/directoryRoles');
        expect(privilegedRolesQuery.query.expand).toContain('members');
      });

      it('should have aggregation transform', () => {
        expect(privilegedRolesQuery.postProcess?.transform).toBe('aggregateRoles');
      });
    });

    describe('License Assignments Query', () => {
      it('should have proper select fields', () => {
        expect(licenseAssignmentsQuery.query.select).toContain('assignedLicenses');
        expect(licenseAssignmentsQuery.query.select).toContain('assignedPlans');
      });

      it('should have license enrichment', () => {
        expect(licenseAssignmentsQuery.postProcess?.transform).toBe('enrichLicenseData');
      });
    });

    describe('Group Members Query', () => {
      it('should have groupId parameter', () => {
        expect(groupMembersQuery.parameters?.groupId).toBeDefined();
        expect(groupMembersQuery.parameters?.groupId.required).toBe(false);
        expect(groupMembersQuery.parameters?.groupId.type).toBe('string');
      });

      it('should have conditional endpoint', () => {
        expect(groupMembersQuery.query.endpoint).toContain('groupId');
      });
    });
  });

  describe('Helper Functions', () => {
    describe('Date Transformations', () => {
      it('should convert days to date', () => {
        const date = daysToDate(7);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const daysDiff = Math.floor(diff / (1000 * 60 * 60 * 24));
        expect(daysDiff).toBe(7);
      });

      it('should convert hours to date', () => {
        const date = hoursToDate(24);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const hoursDiff = Math.floor(diff / (1000 * 60 * 60));
        expect(hoursDiff).toBeCloseTo(24, 0);
      });

      it('should format date for Graph API', () => {
        const date = new Date('2025-01-15T10:00:00Z');
        const formatted = formatDateForGraph(date);
        expect(formatted).toBe('2025-01-15T10:00:00.000Z');
      });
    });

    describe('OData Value Escaping', () => {
      it('should escape single quotes', () => {
        expect(escapeODataValue("O'Brien")).toBe("O''Brien");
        expect(escapeODataValue("test's")).toBe("test''s");
      });

      it('should handle strings without quotes', () => {
        expect(escapeODataValue("test")).toBe("test");
      });
    });

    describe('Dynamic Filter Building', () => {
      it('should replace string parameters', () => {
        const template = "displayName eq {{name}}";
        const params = { name: "John Doe" };
        const result = buildDynamicFilter(template, params);
        expect(result).toBe("displayName eq 'John Doe'");
      });

      it('should replace date parameters', () => {
        const template = "createdDateTime ge {{startDate}}";
        const date = new Date('2025-01-01T00:00:00Z');
        const params = { startDate: date };
        const result = buildDynamicFilter(template, params);
        expect(result).toBe("createdDateTime ge 2025-01-01T00:00:00.000Z");
      });

      it('should replace boolean parameters', () => {
        const template = "accountEnabled eq {{enabled}}";
        const params = { enabled: true };
        const result = buildDynamicFilter(template, params);
        expect(result).toBe("accountEnabled eq true");
      });

      it('should handle multiple parameters', () => {
        const template = "userType eq {{type}} and accountEnabled eq {{enabled}}";
        const params = { type: "Guest", enabled: false };
        const result = buildDynamicFilter(template, params);
        expect(result).toBe("userType eq 'Guest' and accountEnabled eq false");
      });

      it('should escape special characters in strings', () => {
        const template = "displayName eq {{name}}";
        const params = { name: "O'Brien's Account" };
        const result = buildDynamicFilter(template, params);
        expect(result).toBe("displayName eq 'O''Brien''s Account'");
      });
    });

    describe('Type Guards', () => {
      it('should validate Graph query definition', () => {
        const validQuery: GraphQueryDefinition = {
          id: 'test',
          name: 'Test Query',
          description: 'Test',
          category: 'users',
          query: {
            endpoint: '/users'
          }
        };
        expect(isGraphQueryDefinition(validQuery)).toBe(true);
      });

      it('should reject invalid query definition', () => {
        const invalidQuery = {
          id: 'test',
          name: 'Test Query'
          // Missing required fields
        };
        expect(isGraphQueryDefinition(invalidQuery)).toBe(false);
      });

      it('should check if query has parameters', () => {
        const queryWithParams: GraphQueryDefinition = {
          id: 'test',
          name: 'Test',
          description: 'Test',
          category: 'users',
          query: { endpoint: '/users' },
          parameters: { days: { type: 'number' } }
        };
        expect(hasParameters(queryWithParams)).toBe(true);

        const queryWithoutParams: GraphQueryDefinition = {
          id: 'test',
          name: 'Test',
          description: 'Test',
          category: 'users',
          query: { endpoint: '/users' }
        };
        expect(hasParameters(queryWithoutParams)).toBe(false);
      });

      it('should confirm all Graph queries require authentication', () => {
        const query: GraphQueryDefinition = {
          id: 'test',
          name: 'Test',
          description: 'Test',
          category: 'users',
          query: { endpoint: '/users' }
        };
        expect(requiresAuthentication(query)).toBe(true);
      });
    });
  });

  describe('Query Validation', () => {
    it('should have unique IDs for all queries', () => {
      const queries = getAllQueries();
      const ids = queries.map(q => q.id);
      const uniqueIds = new Set(ids);
      expect(ids.length).toBe(uniqueIds.size);
    });

    it('should have valid categories for all queries', () => {
      const validCategories = ['users', 'groups', 'security', 'licenses', 'reports', 'general'];
      const queries = getAllQueries();
      queries.forEach(query => {
        expect(validCategories).toContain(query.category);
      });
    });

    it('should have required fields for all queries', () => {
      const queries = getAllQueries();
      queries.forEach(query => {
        expect(query.id).toBeTruthy();
        expect(query.name).toBeTruthy();
        expect(query.description).toBeTruthy();
        expect(query.category).toBeTruthy();
        expect(query.query).toBeTruthy();
        expect(query.query.endpoint).toBeTruthy();
      });
    });

    it('should have valid parameter types', () => {
      const validTypes = ['string', 'number', 'boolean', 'date', 'array', 'object'];
      const queries = getAllQueries();
      queries.forEach(query => {
        if (query.parameters) {
          Object.values(query.parameters).forEach(param => {
            expect(validTypes).toContain(param.type);
          });
        }
      });
    });
  });

  describe('Performance Hints', () => {
    it('should have reasonable estimated durations', () => {
      const queries = getAllQueries();
      queries.forEach(query => {
        if (query.performance?.estimatedDuration) {
          expect(query.performance.estimatedDuration).toBeGreaterThan(0);
          expect(query.performance.estimatedDuration).toBeLessThanOrEqual(300); // Max 5 minutes
        }
      });
    });

    it('should have valid cache TTL values', () => {
      const queries = getAllQueries();
      queries.forEach(query => {
        if (query.performance?.cacheTTL) {
          expect(query.performance.cacheTTL).toBeGreaterThan(0);
          expect(query.performance.cacheTTL).toBeLessThanOrEqual(86400); // Max 24 hours
        }
      });
    });
  });
});