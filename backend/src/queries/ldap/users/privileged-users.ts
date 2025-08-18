import { LDAPQueryDefinition } from '../types';

export const privilegedUsersQuery: LDAPQueryDefinition = {
  id: 'privileged_users',
  name: 'Privileged User Accounts',
  description: 'Find users who are members of privileged groups (Domain Admins, Enterprise Admins, etc.)',
  category: 'users',
  
  query: {
    scope: 'sub',
    filter: '(&(objectClass=user)(objectCategory=person)(|(memberOf=CN=Domain Admins,CN=Users,{{baseDN}})(memberOf=CN=Enterprise Admins,CN=Users,{{baseDN}})(memberOf=CN=Schema Admins,CN=Users,{{baseDN}})(memberOf=CN=Administrators,CN=Builtin,{{baseDN}})))',
    attributes: [
      'sAMAccountName',
      'displayName',
      'mail',
      'memberOf',
      'userAccountControl',
      'lastLogonTimestamp',
      'passwordLastSet',
      'whenCreated',
      'title',
      'department'
    ],
    sizeLimit: 1000
  },
  
  parameters: {
    baseDN: {
      type: 'string',
      required: false,
      description: 'Base DN for the domain',
      default: 'DC=domain,DC=local'
    }
  },
  
  postProcess: {
    sort: {
      field: 'displayName',
      direction: 'asc'
    }
  },
  
  fieldMappings: {
    sAMAccountName: { displayName: 'Username' },
    displayName: { displayName: 'Display Name' },
    mail: { displayName: 'Email' },
    memberOf: { 
      displayName: 'Group Memberships',
      type: 'array'
    },
    lastLogonTimestamp: {
      displayName: 'Last Logon',
      type: 'date',
      transform: 'fileTimeToDate'
    },
    passwordLastSet: {
      displayName: 'Password Last Set',
      type: 'date',
      transform: 'fileTimeToDate'
    },
    whenCreated: { 
      displayName: 'Account Created',
      type: 'date'
    },
    title: { displayName: 'Job Title' },
    department: { displayName: 'Department' }
  }
};