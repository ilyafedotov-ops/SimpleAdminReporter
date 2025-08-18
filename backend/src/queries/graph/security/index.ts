export * from "./risky-users";
export * from "./privileged-roles";

import { riskyUsersQuery } from "./risky-users";
import { privilegedRolesQuery } from "./privileged-roles";

export const securityQueries = [
  riskyUsersQuery,
  privilegedRolesQuery
];
