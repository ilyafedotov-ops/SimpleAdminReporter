import { LDAPQueryDefinition } from '../types';

export const recentPasswordChangesQuery: LDAPQueryDefinition = {
  id: 'recent_password_changes',
  name: 'Recent Password Changes',
  description: 'Find users who have changed their password within the specified time period',
  category: 'users',
  
  query: {
    scope: 'sub',
    filter: '(&(objectClass=user)(objectCategory=person)(passwordLastSet>=1))',
    attributes: [
      'sAMAccountName',
      'displayName',
      'mail',
      'passwordLastSet',
      'userPrincipalName',
      'department',
      'title',
      'whenChanged',
      'userAccountControl'
    ],
    sizeLimit: 5000
  },
  
  parameters: {
    hours: {
      type: 'number',
      required: true,
      default: 1,
      description: 'Number of hours to look back',
      transform: 'hoursToTimestamp'
    }
  },
  
  postProcess: {
    filter: [
      {
        field: 'passwordLastSet',
        operator: 'gte',
        value: '{{hours_timestamp}}'
      }
    ],
    sort: {
      field: 'passwordLastSet',
      direction: 'desc'
    }
  },
  
  fieldMappings: {
    sAMAccountName: { displayName: 'Username' },
    displayName: { displayName: 'Display Name' },
    mail: { displayName: 'Email' },
    userPrincipalName: { displayName: 'User Principal Name' },
    passwordLastSet: { 
      displayName: 'Password Changed',
      type: 'date',
      transform: 'fileTimeToDate'
    },
    department: { displayName: 'Department' },
    title: { displayName: 'Job Title' },
    whenChanged: {
      displayName: 'Last Modified',
      type: 'date'
    },
    userAccountControl: {
      displayName: 'Account Status',
      transform: 'userAccountControlToFlags'
    }
  }
};

export const passwordChangesByDayQuery: LDAPQueryDefinition = {
  ...recentPasswordChangesQuery,
  id: 'password_changes_by_day',
  name: 'Password Changes by Day',
  description: 'Find users who have changed their password within the specified number of days',
  
  parameters: {
    days: {
      type: 'number',
      required: true,
      default: 7,
      description: 'Number of days to look back',
      transform: 'daysToTimestamp'
    }
  },
  
  postProcess: {
    filter: [
      {
        field: 'passwordLastSet',
        operator: 'gte',
        value: '{{days_timestamp}}'
      }
    ],
    sort: {
      field: 'passwordLastSet',
      direction: 'desc'
    }
  }
};