import { GraphQueryDefinition } from '../types';

export const mfaStatusQuery: GraphQueryDefinition = {
  id: 'mfa_status',
  name: 'MFA Status',
  description: 'Check Multi-Factor Authentication status for all users',
  category: 'users',
  query: {
    endpoint: '/users',
    apiVersion: 'beta',
    select: ['id', 'displayName', 'userPrincipalName'],
    expand: ['authentication($select=methods)'],
    count: true
  },
  postProcess: {
    transform: 'expandAuthMethods'
  },
  fieldMappings: {
    userPrincipalName: { displayName: 'Email' }
  }
};

export function expandAuthMethods(users: any[]): any[] {
  return users;
}
