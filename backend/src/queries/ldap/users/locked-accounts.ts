import { LDAPQueryDefinition } from '../types';

export const lockedAccountsQuery: LDAPQueryDefinition = {
  id: 'locked_accounts',
  name: 'Locked Out Accounts',
  description: 'Find user accounts that are currently locked out',
  category: 'users',
  
  query: {
    scope: 'sub',
    filter: '(&(objectClass=user)(objectCategory=person)(lockoutTime>=1))',
    attributes: [
      'sAMAccountName',
      'displayName',
      'mail',
      'lockoutTime',
      'badPwdCount',
      'lastBadPasswordAttempt',
      'department',
      'title',
      'userAccountControl'
    ],
    sizeLimit: 1000
  },
  
  parameters: {},
  
  postProcess: {
    sort: {
      field: 'lockoutTime',
      direction: 'desc'
    }
  },
  
  fieldMappings: {
    sAMAccountName: { displayName: 'Username' },
    displayName: { displayName: 'Display Name' },
    mail: { displayName: 'Email' },
    lockoutTime: {
      displayName: 'Lockout Time',
      type: 'date',
      transform: 'fileTimeToDate'
    },
    badPwdCount: {
      displayName: 'Bad Password Count',
      type: 'number'
    },
    lastBadPasswordAttempt: {
      displayName: 'Last Failed Attempt',
      type: 'date',
      transform: 'fileTimeToDate'
    },
    department: { displayName: 'Department' },
    title: { displayName: 'Job Title' }
  }
};