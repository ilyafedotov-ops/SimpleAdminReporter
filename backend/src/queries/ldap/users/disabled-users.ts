import { LDAPQueryDefinition } from '../types';

export const disabledUsersQuery: LDAPQueryDefinition = {
  id: 'disabled_users',
  name: 'Disabled User Accounts',
  description: 'Find all disabled user accounts in Active Directory',
  category: 'users',
  
  query: {
    scope: 'sub',
    filter: '(&(objectClass=user)(objectCategory=person)(userAccountControl:1.2.840.113556.1.4.803:=2))',
    attributes: [
      'sAMAccountName',
      'displayName',
      'mail',
      'whenChanged',
      'description',
      'userAccountControl',
      'lastLogonTimestamp',
      'department',
      'title'
    ],
    sizeLimit: 5000
  },
  
  parameters: {},
  
  postProcess: {
    sort: {
      field: 'whenChanged',
      direction: 'desc'
    }
  },
  
  fieldMappings: {
    sAMAccountName: { displayName: 'Username' },
    displayName: { displayName: 'Display Name' },
    mail: { displayName: 'Email' },
    whenChanged: {
      displayName: 'Last Modified',
      type: 'date'
    },
    description: { displayName: 'Description' },
    lastLogonTimestamp: { 
      displayName: 'Last Logon',
      type: 'date',
      transform: 'fileTimeToDate'
    },
    department: { displayName: 'Department' },
    title: { displayName: 'Job Title' }
  }
};