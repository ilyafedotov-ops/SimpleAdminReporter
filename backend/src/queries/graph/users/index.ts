export * from "./inactive-users";
export * from "./guest-users";
export * from "./mfa-status";

import { inactiveUsersQuery } from "./inactive-users";
import { guestUsersQuery } from "./guest-users";
import { mfaStatusQuery } from "./mfa-status";

export const userQueries = [
  inactiveUsersQuery,
  guestUsersQuery,
  mfaStatusQuery
];
