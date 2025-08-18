import { LDAPQueryDefinition } from '../types';

export const passwordExpiryQuery: LDAPQueryDefinition = {
  id: 'password_expiry',
  name: 'Password Expiry Report',
  description: 'Find users whose passwords will expire within specified days',
  category: 'users',
  
  query: {
    scope: 'sub',
    filter: '(&(objectClass=user)(objectCategory=person)(!(userAccountControl:1.2.840.113556.1.4.803:=65536))(passwordLastSet>=1))',
    attributes: [
      'sAMAccountName',
      'displayName',
      'mail',
      'passwordLastSet',
      'userAccountControl',
      'department',
      'title',
      'whenCreated'
    ],
    sizeLimit: 5000
  },
  
  parameters: {
    days: {
      type: 'number',
      required: false,
      default: 7,
      description: 'Days until password expires'
    }
  },
  
  postProcess: {
    filter: [{
      field: 'daysUntilExpiry',
      operator: 'lte',
      value: '{{days}}'
    }],
    sort: {
      field: 'daysUntilExpiry',
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
    daysUntilExpiry: {
      displayName: 'Days Until Expiry',
      type: 'number'
    }
  }
};