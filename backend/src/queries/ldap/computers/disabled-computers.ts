import { LDAPQueryDefinition } from '../types';

export const disabledComputersQuery: LDAPQueryDefinition = {
  id: 'disabled_computers',
  name: 'Disabled Computer Accounts',
  description: 'Find all disabled computer accounts in Active Directory',
  category: 'computers',
  
  query: {
    scope: 'sub',
    filter: '(&(objectClass=computer)(userAccountControl:1.2.840.113556.1.4.803:=2))',
    attributes: [
      'name',
      'operatingSystem',
      'operatingSystemVersion',
      'whenChanged',
      'description',
      'distinguishedName',
      'lastLogonTimestamp',
      'dNSHostName'
    ],
    sizeLimit: 5000
  },
  
  parameters: {},
  
  postProcess: {
    sort: {
      field: 'whenChanged',
      direction: 'desc'
    }
  },
  
  fieldMappings: {
    name: { displayName: 'Computer Name' },
    operatingSystem: { displayName: 'Operating System' },
    operatingSystemVersion: { displayName: 'OS Version' },
    whenChanged: {
      displayName: 'Last Modified',
      type: 'date'
    },
    description: { displayName: 'Description' },
    lastLogonTimestamp: {
      displayName: 'Last Logon',
      type: 'date',
      transform: 'fileTimeToDate'
    },
    dNSHostName: { displayName: 'DNS Name' },
    distinguishedName: { displayName: 'Location' }
  }
};