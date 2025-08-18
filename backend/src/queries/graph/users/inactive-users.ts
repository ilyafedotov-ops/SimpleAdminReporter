import { GraphQueryDefinition } from '../types';

export const inactiveUsersQuery: GraphQueryDefinition = {
  id: 'inactive_users',
  name: 'Inactive Users',
  description: 'Find users who have not signed in for a specified number of days',
  category: 'users',
  query: {
    endpoint: '/users',
    apiVersion: 'beta',
    select: [
      'id',
      'displayName',
      'userPrincipalName',
      'accountEnabled',
      'createdDateTime',
      'signInActivity'
    ],
    filter: 'accountEnabled eq true',
    orderBy: 'displayName',
    top: 999,
    count: true
  },
  parameters: {
    days: {
      type: 'number',
      required: false,
      default: 90,
      description: 'Number of days of inactivity',
      validation: {
        min: 1,
        max: 365
      }
    }
  },
  postProcess: {
    transform: 'calculateInactivity',
    sort: {
      field: 'lastSignIn',
      direction: 'asc'
    }
  },
  fieldMappings: {
    id: { displayName: 'User ID' },
    displayName: { displayName: 'Display Name' },
    userPrincipalName: { displayName: 'Email' },
    accountEnabled: { displayName: 'Account Enabled', transform: 'booleanToYesNo' },
    createdDateTime: { displayName: 'Created Date', transform: 'dateToLocal' },
    'signInActivity.lastSignInDateTime': { 
      displayName: 'Last Sign In',
      transform: 'dateToLocal'
    }
  },
  performance: {
    estimatedDuration: 30,
    cacheable: true,
    cacheTTL: 3600
  }
};

export function calculateInactivity(users: any[], parameters: any): any[] {
  const daysThreshold = parameters.days || 90;
  const thresholdDate = new Date();
  thresholdDate.setDate(thresholdDate.getDate() - daysThreshold);
  
  return users.filter(user => {
    if (!user.signInActivity?.lastSignInDateTime) {
      return true; // Never signed in
    }
    
    const lastSignIn = new Date(user.signInActivity.lastSignInDateTime);
    return lastSignIn < thresholdDate;
  }).map(user => ({
    ...user,
    daysSinceLastSignIn: user.signInActivity?.lastSignInDateTime
      ? Math.floor((Date.now() - new Date(user.signInActivity.lastSignInDateTime).getTime()) / (1000 * 60 * 60 * 24))
      : null
  }));
}