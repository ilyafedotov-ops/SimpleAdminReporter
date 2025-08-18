/**
 * Microsoft Graph API Query Registry
 */

import { GraphQueryDefinition } from './types';
import { userQueries } from './users';
import { securityQueries } from './security';
import { licenseQueries } from './licenses';
import { groupQueries } from './groups';

// Export types
export * from './types';

// Export all query categories
export * from './users';
export * from './security';
export * from './licenses';
export * from './groups';

// Combined query registry
const allGraphQueries: GraphQueryDefinition[] = [
  ...userQueries,
  ...securityQueries,
  ...licenseQueries,
  ...groupQueries
];

// Query registry map for quick lookup
const queryRegistry = new Map<string, GraphQueryDefinition>();
allGraphQueries.forEach(query => {
  queryRegistry.set(query.id, query);
});

/**
 * Get all registered Graph queries
 */
export function getAllGraphQueries(): GraphQueryDefinition[] {
  return [...allGraphQueries];
}

/**
 * Get a specific Graph query by ID
 */
export function getGraphQuery(queryId: string): GraphQueryDefinition | undefined {
  return queryRegistry.get(queryId);
}

/**
 * Get Graph queries by category
 */
export function getGraphQueriesByCategory(category: string): GraphQueryDefinition[] {
  return allGraphQueries.filter(query => query.category === category);
}

/**
 * Get Graph queries by data source (for compatibility)
 */
export function getGraphQueriesForDataSource(): GraphQueryDefinition[] {
  return allGraphQueries;
}

/**
 * Register a new Graph query
 */
export function registerGraphQuery(query: GraphQueryDefinition): void {
  if (queryRegistry.has(query.id)) {
    throw new Error(`Graph query with ID ${query.id} already exists`);
  }
  queryRegistry.set(query.id, query);
  allGraphQueries.push(query);
}

/**
 * Get query categories
 */
export function getGraphQueryCategories(): string[] {
  const categories = new Set(allGraphQueries.map(q => q.category));
  return Array.from(categories).sort();
}

/**
 * Search queries by name or description
 */
export function searchGraphQueries(searchTerm: string): GraphQueryDefinition[] {
  const term = searchTerm.toLowerCase();
  return allGraphQueries.filter(query => 
    query.name.toLowerCase().includes(term) ||
    query.description.toLowerCase().includes(term)
  );
}

// Export post-processing functions
export { calculateInactivity } from './users/inactive-users';
export { enrichGuestData } from './users/guest-users';
export { expandAuthMethods } from './users/mfa-status';
export { aggregateRoles } from './security/privileged-roles';
export { enrichRiskData } from './security/risky-users';
export { enrichLicenseData } from './licenses/license-assignments';
export { expandGroupMembers } from './groups/group-members';

// Aliases for compatibility with graph controller
export const getQueryById = getGraphQuery;
export const getQueriesByCategory = getGraphQueriesByCategory;
export const getAllQueries = getAllGraphQueries;

// Map of transform functions for the executor
export const transformFunctions: Record<string, Function> = {
  calculateInactivity: require('./users/inactive-users').calculateInactivity,
  enrichGuestData: require('./users/guest-users').enrichGuestData,
  expandAuthMethods: require('./users/mfa-status').expandAuthMethods,
  aggregateRoles: require('./security/privileged-roles').aggregateRoles,
  enrichRiskData: require('./security/risky-users').enrichRiskData,
  enrichLicenseData: require('./licenses/license-assignments').enrichLicenseData,
  expandGroupMembers: require('./groups/group-members').expandGroupMembers
};