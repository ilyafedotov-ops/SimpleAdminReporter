import { LDAPQueryDefinition } from '../types';

export const operatingSystemSummaryQuery: LDAPQueryDefinition = {
  id: 'os_summary',
  name: 'Operating System Summary',
  description: 'Summary of all operating systems in use across the domain',
  category: 'computers',
  
  query: {
    scope: 'sub',
    filter: '(objectClass=computer)',
    attributes: [
      'name',
      'operatingSystem',
      'operatingSystemVersion',
      'operatingSystemServicePack',
      'lastLogonTimestamp',
      'whenCreated',
      'userAccountControl'
    ],
    sizeLimit: 10000
  },
  
  parameters: {},
  
  postProcess: {
    sort: {
      field: 'operatingSystem',
      direction: 'asc'
    }
  },
  
  fieldMappings: {
    name: { displayName: 'Computer Name' },
    operatingSystem: { displayName: 'Operating System' },
    operatingSystemVersion: { displayName: 'Version' },
    operatingSystemServicePack: { displayName: 'Service Pack' },
    lastLogonTimestamp: {
      displayName: 'Last Logon',
      type: 'date',
      transform: 'fileTimeToDate'
    },
    whenCreated: {
      displayName: 'Created Date',
      type: 'date'
    }
  }
};