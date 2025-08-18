import { LDAPQueryDefinition } from '../types';

export const recentLockoutsQuery: LDAPQueryDefinition = {
  id: 'recent_lockouts',
  name: 'Recent Account Lockouts',
  description: 'Find user accounts that were recently locked out',
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
      'userAccountControl',
      'lockedOut'
    ],
    sizeLimit: 1000
  },
  
  parameters: {
    days: {
      type: 'number',
      required: false,
      default: 7,
      description: 'Number of days to look back for lockouts',
      transform: 'daysToFileTime'
    }
  },
  
  postProcess: {
    filter: [{
      field: 'lockoutTime',
      operator: 'gte',
      value: '{{days}}'
    }],
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
    title: { displayName: 'Job Title' },
    lockedOut: {
      displayName: 'Currently Locked',
      type: 'boolean'
    }
  }
};