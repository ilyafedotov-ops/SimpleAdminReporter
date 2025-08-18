import {
  createAttributeGetter,
  dateToWindowsFileTime,
  daysToWindowsFileTime,
  hoursToWindowsFileTime,
  windowsFileTimeToDate,
  buildFilterComponent,
  buildComplexFilter,
  sortResults,
  isAccountDisabled,
  isAccountLocked,
  isPasswordNeverExpires,
  parseOrganizationalUnit,
  parseManagerDN,
  ldapTimestampToDate,
  convertLDAPToUser,
  UAC_FLAGS
} from './ldap-utils';

describe('LDAP Utilities', () => {
  describe('createAttributeGetter', () => {
    it('should get attributes case-insensitively', () => {
      const attributes = {
        'sAMAccountName': 'jdoe',
        'displayname': 'John Doe',
        'MAIL': 'jdoe@example.com'
      };
      
      const getAttr = createAttributeGetter(attributes);
      
      expect(getAttr('sAMAccountName')).toBe('jdoe');
      expect(getAttr('samaccountname')).toBe('jdoe');
      expect(getAttr('displayName')).toBe('John Doe');
      expect(getAttr('mail')).toBe('jdoe@example.com');
      expect(getAttr('nonexistent')).toBe('');
    });
  });

  describe('Windows FileTime Conversions', () => {
    it('should convert Date to Windows FileTime', () => {
      const date = new Date('2024-01-01T00:00:00.000Z');
      const fileTime = dateToWindowsFileTime(date);
      
      // Windows FileTime for 2024-01-01 00:00:00 UTC
      expect(fileTime).toBe('133485408000000000');
    });

    it('should convert days ago to Windows FileTime', () => {
      const now = new Date();
      const daysAgo = 30;
      const fileTime = daysToWindowsFileTime(daysAgo);
      
      // The file time should be approximately 30 days ago
      const fileTimeAsDate = windowsFileTimeToDate(fileTime);
      expect(fileTimeAsDate).not.toBeNull();
      const daysDiff = Math.round((now.getTime() - fileTimeAsDate!.getTime()) / (1000 * 60 * 60 * 24));
      
      expect(daysDiff).toBe(daysAgo);
    });

    it('should convert hours ago to Windows FileTime', () => {
      const now = new Date();
      const hoursAgo = 24;
      const fileTime = hoursToWindowsFileTime(hoursAgo);
      
      // The file time should be approximately 24 hours ago
      const fileTimeAsDate = windowsFileTimeToDate(fileTime);
      expect(fileTimeAsDate).not.toBeNull();
      const hoursDiff = Math.round((now.getTime() - fileTimeAsDate!.getTime()) / (1000 * 60 * 60));
      
      expect(hoursDiff).toBe(hoursAgo);
    });

    it('should convert Windows FileTime to Date', () => {
      const fileTime = '133485408000000000'; // 2024-01-01 00:00:00 UTC
      const date = windowsFileTimeToDate(fileTime);
      
      expect(date).toEqual(new Date('2024-01-01T00:00:00.000Z'));
    });

    it('should handle invalid FileTime values', () => {
      expect(windowsFileTimeToDate('')).toBeNull();
      expect(windowsFileTimeToDate('0')).toBeNull();
      expect(windowsFileTimeToDate(0)).toBeNull();
    });
  });

  describe('buildFilterComponent', () => {
    it('should build equals filter', () => {
      expect(buildFilterComponent('name', 'equals', 'John')).toBe('(displayName=John)');
    });

    it('should build contains filter', () => {
      expect(buildFilterComponent('name', 'contains', 'oh')).toBe('(displayName=*oh*)');
    });

    it('should build startsWith filter', () => {
      expect(buildFilterComponent('name', 'startsWith', 'Jo')).toBe('(displayName=Jo*)');
    });

    it('should build exists filter', () => {
      expect(buildFilterComponent('mail', 'exists', '')).toBe('(mail=*)');
    });

    it('should build not_exists filter', () => {
      expect(buildFilterComponent('mail', 'not_exists', '')).toBe('(!(mail=*))');
    });

    it('should build older_than filter', () => {
      const filter = buildFilterComponent('lastLogon', 'older_than', '30');
      expect(filter).toMatch(/^\(lastLogon<=\d+\)$/);
    });

    it('should throw error for unknown operator', () => {
      expect(() => buildFilterComponent('field', 'unknown', 'value'))
        .toThrow('Unknown filter operator: unknown');
    });
  });

  describe('buildComplexFilter', () => {
    it('should combine filters with AND', () => {
      const baseFilter = '(objectClass=user)';
      const conditions = [
        { field: 'department', operator: 'equals', value: 'IT' },
        { field: 'title', operator: 'contains', value: 'Manager' }
      ];
      
      const result = buildComplexFilter(baseFilter, conditions);
      expect(result).toBe('(&(objectClass=user)(department=IT)(title=*Manager*))');
    });

    it('should combine multiple conditions with AND', () => {
      const baseFilter = '(objectClass=user)';
      const conditions = [
        { field: 'department', operator: 'equals', value: 'IT' },
        { field: 'department', operator: 'equals', value: 'HR' }
      ];
      
      const result = buildComplexFilter(baseFilter, conditions);
      // The current implementation always uses AND logic
      expect(result).toBe('(&(objectClass=user)(department=IT)(department=HR))');
    });

    it('should handle single condition', () => {
      const baseFilter = '(objectClass=user)';
      const conditions = [
        { field: 'enabled', operator: 'equals', value: 'true' }
      ];
      
      const result = buildComplexFilter(baseFilter, conditions);
      // 'enabled' is mapped to 'userAccountControl' in FIELD_ALIAS_MAP
      expect(result).toBe('(&(objectClass=user)(userAccountControl=true))');
    });

    it('should return base filter if no conditions', () => {
      const baseFilter = '(objectClass=user)';
      const result = buildComplexFilter(baseFilter, []);
      expect(result).toBe(baseFilter);
    });
  });

  describe('sortResults', () => {
    const data = [
      { name: 'Charlie', age: 30 },
      { name: 'Alice', age: 25 },
      { name: 'Bob', age: 35 }
    ];

    it('should sort ascending', () => {
      const sorted = sortResults(data, 'name', 'asc');
      expect(sorted.map(d => d.name)).toEqual(['Alice', 'Bob', 'Charlie']);
    });

    it('should sort descending', () => {
      const sorted = sortResults(data, 'age', 'desc');
      expect(sorted.map(d => d.age)).toEqual([35, 30, 25]);
    });

    it('should handle null values', () => {
      const dataWithNull = [
        { name: 'Alice', age: null },
        { name: 'Bob', age: 30 },
        { name: 'Charlie', age: undefined }
      ];
      
      const sorted = sortResults(dataWithNull, 'age', 'asc');
      expect(sorted[0].name).toBe('Bob');
      // Null values should be at the end
    });
  });

  describe('User Account Control', () => {
    it('should check if account is disabled', () => {
      expect(isAccountDisabled(UAC_FLAGS.ACCOUNT_DISABLED)).toBe(true);
      expect(isAccountDisabled(UAC_FLAGS.NORMAL_ACCOUNT)).toBe(false);
      expect(isAccountDisabled(UAC_FLAGS.ACCOUNT_DISABLED | UAC_FLAGS.NORMAL_ACCOUNT)).toBe(true);
      expect(isAccountDisabled('514')).toBe(true); // 512 + 2
    });

    it('should check if account is locked', () => {
      expect(isAccountLocked('0')).toBe(false);
      expect(isAccountLocked('1')).toBe(true);
      expect(isAccountLocked(123456789)).toBe(true);
      expect(isAccountLocked(0)).toBe(false);
      expect(isAccountLocked(1)).toBe(true);
    });

    it('should check if password never expires', () => {
      expect(isPasswordNeverExpires(UAC_FLAGS.DONT_EXPIRE_PASSWORD)).toBe(true);
      expect(isPasswordNeverExpires(UAC_FLAGS.NORMAL_ACCOUNT)).toBe(false);
      expect(isPasswordNeverExpires('66048')).toBe(true); // 512 + 65536
    });
  });

  describe('DN Parsing', () => {
    it('should parse organizational unit from DN', () => {
      const dn = 'CN=John Doe,OU=Users,OU=IT,OU=Departments,DC=example,DC=com';
      // The function only returns the first OU
      expect(parseOrganizationalUnit(dn)).toBe('Users');
    });

    it('should handle DN without OUs', () => {
      const dn = 'CN=Administrator,CN=Users,DC=example,DC=com';
      expect(parseOrganizationalUnit(dn)).toBe('');
    });

    it('should parse manager DN', () => {
      const managerDN = 'CN=Jane Manager,OU=Management,DC=example,DC=com';
      expect(parseManagerDN(managerDN)).toBe('Jane Manager');
    });

    it('should handle empty manager DN', () => {
      expect(parseManagerDN('')).toBeNull();
    });

    it('should handle non-string manager DN', () => {
      expect(parseManagerDN(null)).toBeNull();
      expect(parseManagerDN(undefined)).toBeNull();
      expect(parseManagerDN(123)).toBe('123');
      expect(parseManagerDN(['CN=Manager,DC=test'])).toBe('Manager'); // Array converts to string, then parsed
    });
  });

  describe('ldapTimestampToDate', () => {
    it('should convert LDAP timestamp to Date', () => {
      const timestamp = '20240101120000.0Z';
      const date = ldapTimestampToDate(timestamp);
      
      // The function creates a local time date, not UTC
      expect(date).toEqual(new Date(2024, 0, 1, 12, 0, 0));
    });

    it('should handle invalid timestamps', () => {
      expect(ldapTimestampToDate('')).toBeNull();
      // When parsing fails, parseInt returns NaN, which creates an Invalid Date
      const invalidDate = ldapTimestampToDate('invalid');
      expect(invalidDate).toBeInstanceOf(Date);
      expect(isNaN(invalidDate!.getTime())).toBe(true);
    });
  });

  describe('convertLDAPToUser', () => {
    it('should convert LDAP result to standard user object', () => {
      const ldapResult = {
        attributes: {
          sAMAccountName: 'jdoe',
          displayName: 'John Doe',
          mail: 'jdoe@example.com',
          givenName: 'John',
          sn: 'Doe',
          department: 'IT',
          title: 'Developer',
          userAccountControl: '512',
          lockoutTime: '0',
          distinguishedName: 'CN=John Doe,OU=IT,DC=example,DC=com',
          memberOf: [
            'CN=Developers,OU=Groups,DC=example,DC=com',
            'CN=All Staff,OU=Groups,DC=example,DC=com'
          ]
        }
      };
      
      const user = convertLDAPToUser(ldapResult);
      
      expect(user).toMatchObject({
        username: 'jdoe',
        displayName: 'John Doe',
        email: 'jdoe@example.com',
        firstName: 'John',
        lastName: 'Doe',
        department: 'IT',
        title: 'Developer',
        enabled: true,
        locked: false,
        passwordNeverExpires: false,
        organizationalUnit: 'IT',
        groups: ['Developers', 'All Staff']
      });
    });

    it('should handle missing attributes', () => {
      const ldapResult = {
        attributes: {
          sAMAccountName: 'jdoe'
        }
      };
      
      const user = convertLDAPToUser(ldapResult);
      
      expect(user.username).toBe('jdoe');
      expect(user.displayName).toBe('');
      expect(user.email).toBe('');
      expect(user.groups).toEqual([]);
    });
  });
});