import { LDAPQueryDefinition } from '../types';

export const inactiveComputersQuery: LDAPQueryDefinition = {
  id: 'inactive_computers',
  name: 'Inactive Computer Accounts',
  description: 'Find computer accounts that have not logged on recently',
  category: 'computers',
  
  query: {
    scope: 'sub',
    filter: '(&(objectClass=computer)(lastLogonTimestamp<={{lastLogonTimestamp}}))',
    attributes: [
      'name',
      'operatingSystem',
      'operatingSystemVersion',
      'lastLogonTimestamp',
      'whenChanged',
      'distinguishedName',
      'description',
      'dNSHostName',
      'userAccountControl'
    ],
    sizeLimit: 5000
  },
  
  parameters: {
    days: {
      type: 'number',
      required: false,
      default: 90,
      description: 'Number of days of inactivity',
      transform: 'daysToFileTime'
    }
  },
  
  postProcess: {
    sort: {
      field: 'lastLogonTimestamp',
      direction: 'asc'
    }
  },
  
  fieldMappings: {
    name: { displayName: 'Computer Name' },
    operatingSystem: { displayName: 'Operating System' },
    operatingSystemVersion: { displayName: 'OS Version' },
    lastLogonTimestamp: {
      displayName: 'Last Logon',
      type: 'date',
      transform: 'fileTimeToDate'
    },
    whenChanged: {
      displayName: 'Last Modified',
      type: 'date'
    },
    distinguishedName: { displayName: 'Location' },
    description: { displayName: 'Description' },
    dNSHostName: { displayName: 'DNS Name' }
  }
};