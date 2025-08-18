import { GraphQueryDefinition } from '../types';
export const privilegedRolesQuery: GraphQueryDefinition = {
  id: 'privileged_roles',
  name: 'Privileged Roles',
  description: 'List users with privileged roles',
  category: 'security',
  query: {
    endpoint: '/directoryRoles',
    apiVersion: 'beta',
    expand: ['members']
  },
  postProcess: { transform: 'aggregateRoles' }
};
export function aggregateRoles(roles: any[]): any[] { return roles; }
