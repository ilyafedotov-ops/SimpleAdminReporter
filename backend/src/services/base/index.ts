/**
 * Base Service Components
 * Export all base classes and utilities for data source services
 */

export { 
  BaseDataSourceService,
  Query,
  QueryResult,
  CredentialContext
} from './BaseDataSourceService';
export { CredentialContextManager } from './CredentialContextManager';
export * from './types';
export * from './errors';

// Re-export selected utilities to avoid conflicts
export {
  createAttributeGetter,
  convertLDAPToUser,
  buildComplexFilter,
  sortResults,
  daysToWindowsFileTime,
  windowsFileTimeToDate,
  isAccountDisabled,
  isAccountLocked,
  isPasswordNeverExpires,
  LDAP_FILTERS,
  LDAP_ATTRIBUTES,
  UAC_FLAGS
} from '../../utils/ldap-utils';

export {
  buildGraphRequest,
  parseGraphResponse,
  parseCSVResponse,
  applyClientSideFilter,
  applySortToData,
  handleGraphError,
  GRAPH_ENDPOINTS
} from '../../utils/graph-utils';