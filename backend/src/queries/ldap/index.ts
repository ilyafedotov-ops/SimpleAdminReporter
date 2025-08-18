/**
 * LDAP Query Registry
 * Central registry of all LDAP query definitions
 */

import { LDAPQueryDefinition } from './types';

// Import all query categories
import * as userQueries from './users';
import * as computerQueries from './computers';
import * as groupQueries from './groups';

// Create a registry of all queries
export const ldapQueryRegistry: Map<string, LDAPQueryDefinition> = new Map();

// Register user queries
Object.values(userQueries).forEach(query => {
  ldapQueryRegistry.set(query.id, query);
});

// Register computer queries
Object.values(computerQueries).forEach(query => {
  ldapQueryRegistry.set(query.id, query);
});

// Register group queries
Object.values(groupQueries).forEach(query => {
  ldapQueryRegistry.set(query.id, query);
});

// Export helper functions
export function getQueryById(id: string): LDAPQueryDefinition | undefined {
  return ldapQueryRegistry.get(id);
}

export function getQueriesByCategory(category: string): LDAPQueryDefinition[] {
  return Array.from(ldapQueryRegistry.values()).filter(q => q.category === category);
}

export function getAllQueries(): LDAPQueryDefinition[] {
  return Array.from(ldapQueryRegistry.values());
}

// Re-export types
export * from './types';