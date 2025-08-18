import { LDAPQueryDefinition } from '../types';

export const domainServersQuery: LDAPQueryDefinition = {
  id: 'domain_servers',
  name: 'Domain Servers',
  description: 'List all servers in the domain (Windows Server operating systems)',
  category: 'computers',
  
  query: {
    scope: 'sub',
    filter: '(&(objectClass=computer)(operatingSystem=*Server*))',
    attributes: [
      'name',
      'operatingSystem',
      'operatingSystemVersion',
      'operatingSystemServicePack',
      'lastLogonTimestamp',
      'whenCreated',
      'distinguishedName',
      'description',
      'dNSHostName',
      'servicePrincipalName'
    ],
    sizeLimit: 5000
  },
  
  parameters: {},
  
  postProcess: {
    sort: {
      field: 'name',
      direction: 'asc'
    }
  },
  
  fieldMappings: {
    name: { displayName: 'Server Name' },
    operatingSystem: { displayName: 'Operating System' },
    operatingSystemVersion: { displayName: 'OS Version' },
    operatingSystemServicePack: { displayName: 'Service Pack' },
    lastLogonTimestamp: {
      displayName: 'Last Logon',
      type: 'date',
      transform: 'fileTimeToDate'
    },
    whenCreated: {
      displayName: 'Created Date',
      type: 'date'
    },
    distinguishedName: { displayName: 'Location' },
    description: { displayName: 'Description' },
    dNSHostName: { displayName: 'DNS Name' },
    servicePrincipalName: {
      displayName: 'Service Principal Names',
      type: 'array'
    }
  }
};