/**
 * User-related LDAP Query Definitions
 */

export { inactiveUsersQuery } from './inactive-users';
export { recentPasswordChangesQuery, passwordChangesByDayQuery } from './recent-password-changes';
export { disabledUsersQuery } from './disabled-users';
export { lockedAccountsQuery } from './locked-accounts';
export { passwordExpiryQuery } from './password-expiry';
export { neverExpiringPasswordsQuery } from './never-expiring-passwords';
export { privilegedUsersQuery } from './privileged-users';
export { recentLockoutsQuery } from './recent-lockouts';