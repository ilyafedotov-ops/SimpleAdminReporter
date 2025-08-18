import { GraphQueryDefinition } from '../types';
export const groupMembersQuery: GraphQueryDefinition = {
  id: 'group_members',
  name: 'Group Members',
  description: 'List members of groups',
  category: 'groups',
  query: {
    endpoint: '/groups{{groupId ? "/" + groupId + "/members" : ""}}',
    select: ['id', 'displayName']
  },
  parameters: {
    groupId: { type: 'string', required: false }
  },
  postProcess: { transform: 'expandGroupMembers' }
};
export function expandGroupMembers(data: any[]): any[] { return data; }
