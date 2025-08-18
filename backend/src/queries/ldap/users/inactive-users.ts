import { LDAPQueryDefinition } from '../types';

export const inactiveUsersQuery: LDAPQueryDefinition = {
  id: 'inactive_users',
  name: 'Inactive Users',
  description: 'Find users who have not logged in for a specified number of days',
  category: 'users',
  
  query: {
    scope: 'sub',
    filter: '(&(objectClass=user)(objectCategory=person)(lastLogonTimestamp>=1))',
    attributes: [
      'sAMAccountName',
      'displayName',
      'mail',
      'lastLogonTimestamp',
      'userAccountControl',
      'whenCreated',
      'department',
      'title',
      'manager'
    ],
    sizeLimit: 5000
  },
  
  parameters: {
    days: {
      type: 'number',
      required: true,
      default: 90,
      description: 'Number of days of inactivity',
      transform: 'daysToTimestamp'
    }
  },
  
  postProcess: {
    filter: [
      {
        field: 'lastLogonTimestamp',
        operator: 'lt',
        value: '{{days}}'
      },
      // Note: This filter is removed because filtering by userAccountControl bitmask
      // requires bitwise operations which are not supported in the current postProcess filter.
      // The LDAP query already filters for user objects, which typically excludes
      // disabled computer accounts. To filter disabled user accounts, a separate
      // query or enhanced postProcess filter logic would be needed.
    ],
    sort: {
      field: 'lastLogonTimestamp',
      direction: 'asc'
    }
  },
  
  fieldMappings: {
    sAMAccountName: { displayName: 'Username' },
    displayName: { displayName: 'Display Name' },
    mail: { displayName: 'Email' },
    lastLogonTimestamp: { 
      displayName: 'Last Logon',
      type: 'date',
      transform: 'fileTimeToDate'
    },
    userAccountControl: {
      displayName: 'Account Status',
      transform: 'userAccountControlToFlags'
    },
    whenCreated: {
      displayName: 'Created Date',
      type: 'date'
    },
    department: { displayName: 'Department' },
    title: { displayName: 'Job Title' },
    manager: {
      displayName: 'Manager',
      transform: 'dnToName'
    }
  }
};