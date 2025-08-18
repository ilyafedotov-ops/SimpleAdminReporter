import { LDAPQueryDefinition } from '../types';

export const neverExpiringPasswordsQuery: LDAPQueryDefinition = {
  id: 'never_expiring_passwords',
  name: 'Never Expiring Passwords',
  description: 'Find user accounts with passwords set to never expire',
  category: 'users',
  
  query: {
    scope: 'sub',
    filter: '(&(objectClass=user)(objectCategory=person)(userAccountControl:1.2.840.113556.1.4.803:=65536))',
    attributes: [
      'sAMAccountName',
      'displayName',
      'mail',
      'passwordLastSet',
      'userAccountControl',
      'department',
      'title',
      'whenCreated',
      'lastLogonTimestamp',
      'description'
    ],
    sizeLimit: 5000
  },
  
  parameters: {},
  
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
    passwordLastSet: {
      displayName: 'Password Last Set',
      type: 'date',
      transform: 'fileTimeToDate'
    },
    department: { displayName: 'Department' },
    title: { displayName: 'Job Title' },
    whenCreated: { 
      displayName: 'Account Created',
      type: 'date'
    },
    lastLogonTimestamp: {
      displayName: 'Last Logon',
      type: 'date',
      transform: 'fileTimeToDate'
    },
    description: { displayName: 'Description' }
  }
};