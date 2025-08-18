import { GraphQueryDefinition } from '../types';

export const guestUsersQuery: GraphQueryDefinition = {
  id: 'guest_users',
  name: 'Guest Users',
  description: 'List all guest users in the Azure AD tenant',
  category: 'users',
  query: {
    endpoint: '/users',
    select: [
      'id',
      'displayName',
      'userPrincipalName',
      'mail',
      'userType',
      'createdDateTime',
      'externalUserState',
      'externalUserStateChangeDateTime'
    ],
    filter: "userType eq 'Guest'",
    orderBy: 'displayName',
    count: true
  },
  postProcess: {
    transform: 'enrichGuestData'
  },
  fieldMappings: {
    userPrincipalName: { displayName: 'Email' },
    externalUserState: { displayName: 'Invitation Status' },
    externalUserStateChangeDateTime: { displayName: 'Status Changed', transform: 'dateToLocal' }
  }
};

export function enrichGuestData(users: any[]): any[] {
  return users.map(user => ({
    ...user,
    invitationAge: user.createdDateTime
      ? Math.floor((Date.now() - new Date(user.createdDateTime).getTime()) / (1000 * 60 * 60 * 24))
      : null
  }));
}