import { getAllQueries, getQueryById } from './index';
import { LDAPQueryDefinition } from './types';
import { 
  daysToWindowsFileTime, 
  hoursToWindowsFileTime,
  windowsFileTimeToDate,
  parseOrganizationalUnit,
  parseManagerDN,
  isAccountDisabled,
  isAccountLocked,
  isPasswordNeverExpires
} from '../../utils/ldap-utils';

describe('LDAP Query Definitions Integration Tests', () => {
  describe('Query Registry', () => {
    it('should load all LDAP query definitions', () => {
      const queries = getAllQueries();
      
      expect(queries).toBeDefined();
      expect(queries.length).toBeGreaterThan(0);
      
      // Verify we have queries from different categories
      const categories = [...new Set(queries.map(q => q.category))];
      expect(categories).toContain('users');
      expect(categories).toContain('computers');
      expect(categories).toContain('groups');
    });

    it('should have valid query structure for all definitions', () => {
      const queries = getAllQueries();
      
      queries.forEach(query => {
          // Validate required fields
          expect(query.id).toBeDefined();
          expect(query.name).toBeDefined();
          expect(query.description).toBeDefined();
          expect(query.category).toMatch(/^(users|computers|groups)$/);
          
          // Validate query structure
          expect(query.query).toBeDefined();
          expect(query.query.scope).toMatch(/^(base|one|sub)$/);
          expect(query.query.filter).toBeDefined();
          expect(Array.isArray(query.query.attributes)).toBe(true);
          expect(query.query.attributes.length).toBeGreaterThan(0);
          
          // Validate field mappings
          expect(query.fieldMappings).toBeDefined();
          if (query.fieldMappings) {
            expect(Object.keys(query.fieldMappings).length).toBeGreaterThan(0);
          }
      });
    });

    it('should get query by ID', () => {
      const query = getQueryById('inactive_users');
      
      expect(query).toBeDefined();
      expect(query!.id).toBe('inactive_users');
      expect(query!.category).toBe('users');
    });

    it('should return undefined for non-existent query', () => {
      const query = getQueryById('non_existent_query');
      expect(query).toBeUndefined();
    });
  });

  describe('User Queries', () => {
    describe('Inactive Users Query', () => {
      let query: LDAPQueryDefinition;

      beforeEach(() => {
        query = getQueryById('inactive_users')!;
      });

      it('should have correct structure', () => {
        expect(query.name).toBe('Inactive Users');
        expect(query.parameters).toBeDefined();
        expect(query.parameters!.days).toBeDefined();
        expect(query.parameters!.days.type).toBe('number');
        expect(query.parameters!.days.default).toBe(90);
        expect(query.parameters!.days.transform).toBe('daysToFileTime');
      });

      it('should generate correct LDAP filter', () => {
        const days = 30;
        const fileTime = daysToWindowsFileTime(days);
        const expectedFilter = query.query.filter.replace('{days}', fileTime.toString());
        
        expect(expectedFilter).toContain('(&(objectClass=user)');
        expect(expectedFilter).toContain('(objectCategory=person)');
        expect(expectedFilter).toContain(`(lastLogonTimestamp<=${fileTime})`);
        expect(expectedFilter).toContain('(!(userAccountControl:1.2.840.113556.1.4.803:=2))');
      });

      it('should have appropriate attributes', () => {
        const requiredAttributes = [
          'sAMAccountName',
          'displayName',
          'mail',
          'lastLogonTimestamp',
          'whenCreated',
          'userAccountControl',
          'distinguishedName'
        ];
        
        requiredAttributes.forEach(attr => {
          expect(query.query.attributes).toContain(attr);
        });
      });
    });

    describe('Password Expiry Query', () => {
      let query: LDAPQueryDefinition;

      beforeEach(() => {
        query = getQueryById('password_expiry')!;
      });

      it('should have correct parameters', () => {
        expect(query.parameters).toBeDefined();
        expect(query.parameters!.days).toBeDefined();
        expect(query.parameters!.days.default).toBe(7);
        expect(query.parameters!.days.transform).toBe('daysToFileTime');
      });

      it('should include password-related attributes', () => {
        expect(query.query.attributes).toContain('pwdLastSet');
        expect(query.query.attributes).toContain('userAccountControl');
      });

      it('should have post-processing for expiry calculation', () => {
        expect(query.postProcess).toBeDefined();
        expect(query.postProcess!.sort).toBeDefined();
        expect(query.postProcess!.sort!.field).toBe('daysUntilExpiry');
        expect(query.postProcess!.sort!.direction).toBe('asc');
      });
    });

    describe('Privileged Users Query', () => {
      let query: LDAPQueryDefinition;

      beforeEach(() => {
        query = getQueryById('privileged_users')!;
      });

      it('should filter for admin groups', () => {
        const filter = query.query.filter;
        
        expect(filter).toContain('(memberOf=');
        expect(filter).toContain('Domain Admins');
        expect(filter).toContain('Enterprise Admins');
        expect(filter).toContain('Schema Admins');
        expect(filter).toContain('Administrators');
      });

      it('should include group membership attributes', () => {
        expect(query.query.attributes).toContain('memberOf');
        expect(query.query.attributes).toContain('adminCount');
      });
    });
  });

  describe('Computer Queries', () => {
    describe('Inactive Computers Query', () => {
      let query: LDAPQueryDefinition;

      beforeEach(() => {
        query = getQueryById('inactive_computers')!;
      });

      it('should filter for computer objects', () => {
        expect(query.query.filter).toContain('(objectClass=computer)');
      });

      it('should include computer-specific attributes', () => {
        expect(query.query.attributes).toContain('operatingSystem');
        expect(query.query.attributes).toContain('operatingSystemVersion');
        expect(query.query.attributes).toContain('lastLogonTimestamp');
      });
    });

    describe('Domain Servers Query', () => {
      let query: LDAPQueryDefinition;

      beforeEach(() => {
        query = getQueryById('domain_servers')!;
      });

      it('should filter for server operating systems', () => {
        const filter = query.query.filter;
        
        expect(filter).toContain('(operatingSystem=*Server*)');
        expect(filter).toContain('(!(userAccountControl:1.2.840.113556.1.4.803:=2))');
      });
    });
  });

  describe('Group Queries', () => {
    describe('Empty Groups Query', () => {
      let query: LDAPQueryDefinition;

      beforeEach(() => {
        query = getQueryById('empty_groups')!;
      });

      it('should filter for group objects', () => {
        expect(query.query.filter).toContain('(objectClass=group)');
      });

      it('should not include member attribute since groups are already filtered for emptiness', () => {
        // The query already filters for empty groups with (!(member=*))
        // so we don't need the member attribute in results
        expect(query.query.attributes).not.toContain('member');
      });

      it('should not need post-processing to filter empty groups', () => {
        // The query already filters for empty groups with (!(member=*))
        // so no post-processing is needed
        expect(query.query.filter).toContain('(!(member=*))');
      });
    });
  });

  describe('Parameter Transformations', () => {
    it('should transform days to Windows FileTime', () => {
      const days = 30;
      const fileTime = daysToWindowsFileTime(days);
      
      expect(fileTime).toBeGreaterThan(0);
      expect(typeof fileTime).toBe('string');
      
      // Verify it's a valid FileTime (should be a large number)
      expect(BigInt(fileTime)).toBeGreaterThan(BigInt('116444736000000000'));
    });

    it('should transform hours to Windows FileTime', () => {
      const hours = 24;
      const fileTime = hoursToWindowsFileTime(hours);
      
      expect(fileTime).toBeGreaterThan(0);
      expect(typeof fileTime).toBe('string');
    });

    it('should convert Windows FileTime to Date', () => {
      const fileTime = '131976789876543210';
      const date = windowsFileTimeToDate(fileTime);
      
      expect(date).not.toBeNull();
      expect(date).toBeInstanceOf(Date);
      expect(date!.getFullYear()).toBeGreaterThan(2000);
    });
  });

  describe('Field Transformations', () => {
    it('should parse organizational unit from DN', () => {
      const dn = 'CN=John Doe,OU=Sales,OU=Users,DC=company,DC=com';
      const ou = parseOrganizationalUnit(dn);
      
      expect(ou).toBe('Sales/Users');
    });

    it('should parse manager DN', () => {
      const managerDN = 'CN=Jane Manager,OU=Management,DC=company,DC=com';
      const manager = parseManagerDN(managerDN);
      
      expect(manager).toBe('Jane Manager');
    });

    it('should check account status flags', () => {
      const DISABLED = 2;
      const LOCKOUT = 16;
      const PASSWORD_NEVER_EXPIRES = 65536;
      
      expect(isAccountDisabled(DISABLED)).toBe(true);
      expect(isAccountDisabled(512)).toBe(false); // Normal account
      
      expect(isAccountLocked(LOCKOUT)).toBe(true);
      expect(isAccountLocked(512)).toBe(false);
      
      expect(isPasswordNeverExpires(PASSWORD_NEVER_EXPIRES)).toBe(true);
      expect(isPasswordNeverExpires(512)).toBe(false);
    });
  });

  describe('Query Validation', () => {
    it('should validate all queries have unique IDs', () => {
      const queries = getAllQueries();
      const allIds = new Set<string>();
      
      queries.forEach(query => {
          expect(allIds.has(query.id)).toBe(false);
          allIds.add(query.id);
      });
    });

    it('should validate all field mappings reference existing attributes', () => {
      const queries = getAllQueries();
      
      queries.forEach(query => {
        if (query.fieldMappings) {
          Object.keys(query.fieldMappings).forEach(field => {
            // Special computed fields may not be in attributes
            const computedFields = ['daysInactive', 'daysUntilExpiry', 'isDisabled', 'isLocked'];
            
            if (!computedFields.includes(field)) {
              expect(query.query.attributes).toContain(field);
            }
          });
        }
      });
    });
  });

  describe('Query Performance Hints', () => {
    it('should have appropriate size limits', () => {
      const queries = getAllQueries();
      
      queries.forEach(query => {
          if (query.query.sizeLimit) {
            expect(query.query.sizeLimit).toBeGreaterThan(0);
            expect(query.query.sizeLimit).toBeLessThanOrEqual(10000);
          }
      });
    });

    it('should use indexed attributes in filters', () => {
      // Common indexed attributes in AD
      const indexedAttributes = [
        'sAMAccountName',
        'objectClass',
        'objectCategory',
        'userPrincipalName',
        'mail',
        'cn',
        'distinguishedName'
      ];
      
      const queries = getAllQueries();
      
      queries.forEach(query => {
          const filter = query.query.filter;
          
          // Check if filter uses at least one indexed attribute
          const usesIndexed = indexedAttributes.some(attr => 
            filter.includes(`(${attr}=`) || filter.includes(`(${attr}:`)
          );
          
          expect(usesIndexed).toBe(true);
      });
    });
  });
});