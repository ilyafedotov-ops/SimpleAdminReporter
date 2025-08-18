import { LDAPQueryDefinition } from '../types';

export const emptyGroupsQuery: LDAPQueryDefinition = {
  id: 'empty_groups',
  name: 'Empty Security Groups',
  description: 'Find security groups with no members',
  category: 'groups',
  
  query: {
    scope: 'sub',
    filter: '(&(objectClass=group)(!(member=*)))',
    attributes: [
      'name',
      'description',
      'groupType',
      'whenCreated',
      'whenChanged',
      'distinguishedName',
      'managedBy',
      'mail'
    ],
    sizeLimit: 5000
  },
  
  parameters: {},
  
  postProcess: {
    sort: {
      field: 'name',
      direction: 'asc'
    }
  },
  
  fieldMappings: {
    name: { displayName: 'Group Name' },
    description: { displayName: 'Description' },
    groupType: { 
      displayName: 'Group Type',
      type: 'number'
    },
    whenCreated: {
      displayName: 'Created Date',
      type: 'date'
    },
    whenChanged: {
      displayName: 'Last Modified',
      type: 'date'
    },
    distinguishedName: { displayName: 'Location' },
    managedBy: { displayName: 'Managed By' },
    mail: { displayName: 'Email' }
  }
};