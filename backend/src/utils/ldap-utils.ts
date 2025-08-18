/**
 * LDAP Utility Functions
 * Common utilities for LDAP operations, extracted to eliminate duplication
 */

// LDAP Filter Constants
export const LDAP_FILTERS = {
  ALL_USERS: '(&(objectClass=user)(objectCategory=person))',
  USER: '(&(objectClass=user)(objectCategory=person))',
  DISABLED_USERS: '(&(objectClass=user)(userAccountControl:1.2.840.113556.1.4.803:=2))',
  LOCKED_USERS: '(&(objectClass=user)(lockoutTime>=1))',
  COMPUTERS: '(objectClass=computer)',
  GROUPS: '(objectClass=group)'
} as const;

// LDAP Attribute Constants  
export const LDAP_ATTRIBUTES = {
  USER_BASIC: ['sAMAccountName', 'displayName', 'mail', 'userPrincipalName'] as const,
  USER: ['sAMAccountName', 'userPrincipalName', 'displayName', 'givenName', 'sn', 'mail', 'department', 'title', 'company', 'manager', 'directReports', 'memberOf', 'telephoneNumber', 'mobile', 'description', 'userAccountControl', 'lastLogonTimestamp', 'passwordLastSet', 'accountExpires', 'lockoutTime', 'badPasswordTime', 'whenCreated', 'whenChanged', 'objectSid', 'objectGUID', 'primaryGroupID', 'pwdLastSet', 'employeeID', 'employeeNumber', 'employeeType', 'physicalDeliveryOfficeName', 'streetAddress', 'l', 'st', 'postalCode', 'co', 'c', 'info', 'wWWHomePage', 'homePhone', 'facsimileTelephoneNumber', 'distinguishedName', 'adminCount', 'badPwdCount', 'logonCount', 'lastLogon', 'sAMAccountType', 'servicePrincipalName', 'msDS-SupportedEncryptionTypes', 'thumbnailPhoto', 'proxyAddresses', 'extensionAttribute1', 'extensionAttribute2', 'extensionAttribute3', 'extensionAttribute4', 'extensionAttribute5', 'codePage', 'instanceType'] as const,
  COMPUTER: ['name', 'dNSHostName', 'operatingSystem', 'operatingSystemVersion', 'lastLogonTimestamp', 'whenCreated', 'userAccountControl'] as const,
  GROUP: ['name', 'sAMAccountName', 'description', 'member', 'memberOf', 'groupType', 'whenCreated', 'managedBy'] as const
} as const;

// User Account Control flags
export const UAC_FLAGS = {
  SCRIPT: 0x0001,
  ACCOUNT_DISABLED: 0x0002,
  HOMEDIR_REQUIRED: 0x0008,
  LOCKOUT: 0x0010,
  PASSWD_NOTREQD: 0x0020,
  PASSWD_CANT_CHANGE: 0x0040,
  ENCRYPTED_TEXT_PWD_ALLOWED: 0x0080,
  TEMP_DUPLICATE_ACCOUNT: 0x0100,
  NORMAL_ACCOUNT: 0x0200,
  INTERDOMAIN_TRUST_ACCOUNT: 0x0800,
  WORKSTATION_TRUST_ACCOUNT: 0x1000,
  SERVER_TRUST_ACCOUNT: 0x2000,
  DONT_EXPIRE_PASSWORD: 0x10000,
  MNS_LOGON_ACCOUNT: 0x20000,
  SMARTCARD_REQUIRED: 0x40000,
  TRUSTED_FOR_DELEGATION: 0x80000,
  NOT_DELEGATED: 0x100000,
  USE_DES_KEY_ONLY: 0x200000,
  DONT_REQ_PREAUTH: 0x400000,
  PASSWORD_EXPIRED: 0x800000,
  TRUSTED_TO_AUTH_FOR_DELEGATION: 0x1000000,
  PARTIAL_SECRETS_ACCOUNT: 0x04000000
} as const;

// Field alias mapping to resolve UI field names to actual LDAP attributes
export const FIELD_ALIAS_MAP: Record<string, string> = {
  // First name aliases
  'firstName': 'givenName',
  'fname': 'givenName',
  'given': 'givenName',
  'firstname': 'givenName',
  'first': 'givenName',
  
  // Last name aliases
  'lastName': 'sn',
  'surname': 'sn',
  'lname': 'sn',
  'familyName': 'sn',
  'lastname': 'sn',
  'last': 'sn',
  
  // Username aliases
  'username': 'sAMAccountName',
  'samaccountname': 'sAMAccountName',
  'accountName': 'sAMAccountName',
  'loginName': 'sAMAccountName',
  'login': 'sAMAccountName',
  'samaccount': 'sAMAccountName',
  'sam': 'sAMAccountName',
  
  // Display name aliases
  'fullName': 'displayName',
  'name': 'displayName',
  'displayname': 'displayName',
  'fullname': 'displayName',
  
  // Common name aliases
  'commonName': 'cn',
  'commonname': 'cn',
  
  // UPN aliases
  'upn': 'userPrincipalName',
  'userprincipal': 'userPrincipalName',
  'principalName': 'userPrincipalName',
  'userPrincipal': 'userPrincipalName',
  
  // Email aliases
  'email': 'mail',
  'emailAddress': 'mail',
  'emailaddress': 'mail',
  'mailAddress': 'mail',
  'primaryEmail': 'mail',
  'primaryemail': 'mail',
  
  // Phone aliases
  'phone': 'telephoneNumber',
  'phoneNumber': 'telephoneNumber',
  'telephone': 'telephoneNumber',
  'officePhone': 'telephoneNumber',
  'workPhone': 'telephoneNumber',
  'businessPhone': 'telephoneNumber',
  
  // Mobile phone aliases
  'mobilePhone': 'mobile',
  'cellPhone': 'mobile',
  'cell': 'mobile',
  'mobilephone': 'mobile',
  'cellphone': 'mobile',
  'mobileNumber': 'mobile',
  
  // Fax aliases
  'fax': 'facsimileTelephoneNumber',
  'faxNumber': 'facsimileTelephoneNumber',
  'facsimile': 'facsimileTelephoneNumber',
  
  // Home phone aliases
  'homephone': 'homePhone',
  'home': 'homePhone',
  'personalPhone': 'homePhone',
  
  // Job title aliases
  'jobTitle': 'title',
  'position': 'title',
  'jobtitle': 'title',
  'role': 'title',
  
  // Company aliases
  'org': 'company',
  'organization': 'company',
  'companyName': 'company',
  'employer': 'company',
  
  // Department aliases
  'dept': 'department',
  'departmentName': 'department',
  'deptName': 'department',
  'division': 'department',
  
  // Manager aliases
  'manager': 'manager',
  'managerDN': 'manager',
  'supervisor': 'manager',
  'reportsTo': 'manager',
  
  // Direct reports aliases
  'directReports': 'directReports',
  'reports': 'directReports',
  'subordinates': 'directReports',
  'managedObjects': 'directReports',
  
  // Office aliases
  'office': 'physicalDeliveryOfficeName',
  'officeLocation': 'physicalDeliveryOfficeName',
  'officeName': 'physicalDeliveryOfficeName',
  'location': 'physicalDeliveryOfficeName',
  'workLocation': 'physicalDeliveryOfficeName',
  
  // Address aliases
  'street': 'streetAddress',
  'address': 'streetAddress',
  'streetaddress': 'streetAddress',
  'city': 'l',
  'locality': 'l',
  'town': 'l',
  'state': 'st',
  'province': 'st',
  'stateOrProvince': 'st',
  'zip': 'postalCode',
  'zipCode': 'postalCode',
  'postal': 'postalCode',
  'postcode': 'postalCode',
  'country': 'co',
  'countryCode': 'c',
  'countryName': 'co',
  
  // Employee ID aliases
  'employeeId': 'employeeID',
  'empId': 'employeeID',
  'employeeid': 'employeeID',
  'staffId': 'employeeID',
  'personnelNumber': 'employeeNumber',
  'employeeNum': 'employeeNumber',
  'staffNumber': 'employeeNumber',
  
  // Employee type aliases
  'employeeType': 'employeeType',
  'empType': 'employeeType',
  'userType': 'employeeType',
  'accountType': 'employeeType',
  
  // Description aliases
  'description': 'description',
  'desc': 'description',
  'comment': 'description',
  'notes': 'info',
  'additionalInfo': 'info',
  
  // Web page aliases
  'homepage': 'wWWHomePage',
  'webpage': 'wWWHomePage',
  'website': 'wWWHomePage',
  'webPage': 'wWWHomePage',
  'url': 'wWWHomePage',
  
  // Organizational unit aliases
  'ou': 'organizationalUnit',
  'orgUnit': 'organizationalUnit',
  'organizationalunit': 'organizationalUnit',
  
  // Distinguished name aliases
  'dn': 'distinguishedName',
  'distinguishedname': 'distinguishedName',
  
  // Time-based aliases
  'created': 'whenCreated',
  'createdDate': 'whenCreated',
  'createDate': 'whenCreated',
  'creationDate': 'whenCreated',
  'modified': 'whenChanged',
  'changed': 'whenChanged',
  'modifiedDate': 'whenChanged',
  'lastModified': 'whenChanged',
  'updateDate': 'whenChanged',
  'lastLogon': 'lastLogonTimestamp',
  'lastLogin': 'lastLogonTimestamp',
  'lastLogonDate': 'lastLogonTimestamp',
  'lastActive': 'lastLogonTimestamp',
  'passwordLastChanged': 'passwordLastSet',
  'pwdLastSet': 'passwordLastSet',
  'passwordChanged': 'passwordLastSet',
  'passwordAge': 'passwordLastSet',
  'accountExpiry': 'accountExpires',
  'expirationDate': 'accountExpires',
  'expiryDate': 'accountExpires',
  
  // Security aliases
  'accountDisabled': 'userAccountControl',
  'accountEnabled': 'userAccountControl',
  'disabled': 'userAccountControl',
  'enabled': 'userAccountControl',
  'accountStatus': 'userAccountControl',
  'accountLocked': 'lockoutTime',
  'isLocked': 'lockoutTime',
  'locked': 'lockoutTime',
  'lockedOut': 'lockoutTime',
  'badPasswordCount': 'badPwdCount',
  'failedLogins': 'badPwdCount',
  'failedAttempts': 'badPwdCount',
  'lastBadPassword': 'badPasswordTime',
  'lastFailedLogin': 'badPasswordTime',
  'logonCount': 'logonCount',
  'loginCount': 'logonCount',
  'successfulLogons': 'logonCount',
  
  // Group membership aliases
  'memberOfGroups': 'memberOf',
  'groups': 'memberOf',
  'groupMembership': 'memberOf',
  'groupMemberships': 'memberOf',
  'securityGroups': 'memberOf',
  'primaryGroup': 'primaryGroupID',
  'primaryGroupId': 'primaryGroupID',
  
  // Admin aliases
  'adminCount': 'adminCount',
  'isAdmin': 'adminCount',
  'privileged': 'adminCount',
  'adminPrivileges': 'adminCount',
  
  // Object identifiers
  'guid': 'objectGUID',
  'objectGuid': 'objectGUID',
  'objectguid': 'objectGUID',
  'uniqueId': 'objectGUID',
  'sid': 'objectSid',
  'objectSid': 'objectSid',
  'securityId': 'objectSid',
  'securityIdentifier': 'objectSid',
  
  // USN aliases
  'usnCreated': 'uSNCreated',
  'createdUSN': 'uSNCreated',
  'usnChanged': 'uSNChanged',
  'changedUSN': 'uSNChanged',
  'updateSequenceNumber': 'uSNChanged',
  
  // Computer-specific aliases
  'computerName': 'name',
  'hostname': 'dNSHostName',
  'dnsHostname': 'dNSHostName',
  'fqdn': 'dNSHostName',
  'os': 'operatingSystem',
  'operatingSystem': 'operatingSystem',
  'osVersion': 'operatingSystemVersion',
  'operatingSystemVersion': 'operatingSystemVersion',
  'osServicePack': 'operatingSystemServicePack',
  'servicePack': 'operatingSystemServicePack',
  
  // Group-specific aliases
  'groupName': 'name',
  'groupDescription': 'description',
  'members': 'member',
  'groupMembers': 'member',
  'memberList': 'member',
  'managedBy': 'managedBy',
  'groupManager': 'managedBy',
  'owner': 'managedBy',
  'groupType': 'groupType',
  'groupCategory': 'groupType',
  'groupScope': 'groupType',
  
  // Additional SAM attributes
  'samAccountType': 'sAMAccountType',
  
  // DS attributes
  'dsCorePropagationData': 'dSCorePropagationData',
  'dsHeuristics': 'dSHeuristics',
  'dsMachineAccountQuota': 'dSMachineAccountQuota',
  
  // NT attributes
  'ntSecurityDescriptor': 'nTSecurityDescriptor',
  'ntGroupMembers': 'nTGroupMembers',
  'ntMixedDomain': 'nTMixedDomain',
  'ntPwdHistory': 'nTPwdHistory',
  
  // RID attributes
  'ridSetReferences': 'rIDSetReferences',
  'ridAllocationPool': 'rIDAllocationPool',
  'ridAvailablePool': 'rIDAvailablePool',
  'ridManagerReference': 'rIDManagerReference',
  'ridNextRID': 'rIDNextRID',
  'ridPreviousAllocationPool': 'rIDPreviousAllocationPool',
  'ridUsedPool': 'rIDUsedPool',
  
  // FRS attributes
  'frsComputerReferenceBL': 'fRSComputerReferenceBL',
  'frsMemberReferenceBL': 'fRSMemberReferenceBL',
  'frsPartnerAuthAndStatus': 'fRSPartnerAuthAndStatus',
  'frsPrimaryMember': 'fRSPrimaryMember',
  'frsRootPath': 'fRSRootPath',
  'frsServiceCommand': 'fRSServiceCommand',
  'frsUpdateTimeout': 'fRSUpdateTimeout',
  'frsVersionGUID': 'fRSVersionGUID',
  'frsWorkingPath': 'fRSWorkingPath',
  
  // FSMO attributes
  'fsmoRoleOwner': 'fSMORoleOwner',
  
  // Well-known objects
  'wellKnownObjects': 'wellKnownObjects',
  'otherWellKnownObjects': 'otherWellKnownObjects',
  
  // System attributes
  'isCriticalSystemObject': 'isCriticalSystemObject',
  'isDeleted': 'isDeleted',
  'isRecycled': 'isRecycled',
  'lastKnownParent': 'lastKnownParent',
  'bridgeheadServerListBL': 'bridgeheadServerListBL',
  'netbootSCPBL': 'netbootSCPBL',
  
  // MS-DS attributes (common ones)
  'msdsSupportedEncryptionTypes': 'msDS-SupportedEncryptionTypes',
  'msdsAllowedToDelegateTo': 'msDS-AllowedToDelegateTo',
  'msdsSiteName': 'msDS-SiteName',
  'msdsUserAccountControlComputed': 'msDS-UserAccountControlComputed',
  'msdsUserPasswordExpiryTimeComputed': 'msDS-UserPasswordExpiryTimeComputed',
  'msdsResultantPSO': 'msDS-ResultantPSO',
  'msdsKeyVersionNumber': 'msDS-KeyVersionNumber',
  
  // MS-PKI attributes
  'mspkiAccountCredentials': 'msPKI-AccountCredentials',
  'mspkiDPAPIMasterKeys': 'msPKI-DPAPIMasterKeys',
  'mspkiRoamingTimeStamp': 'msPKI-RoamingTimeStamp',
  
  // MS-RADIUS attributes
  'msradiusFramedIPAddress': 'msRADIUS-FramedIPAddress',
  'msradiusCallbackNumber': 'msRADIUSCallbackNumber',
  'msradiusFramedRoute': 'msRADIUSFramedRoute',
  'msradiusServiceType': 'msRADIUSServiceType',
  
  // MS-TS attributes
  'mstsProperty01': 'msTSProperty01',
  'mstsProperty02': 'msTSProperty02',
  'mstsExpireDate': 'msTSExpireDate',
  'mstsLicenseVersion': 'msTSLicenseVersion',
  'mstsManagingLS': 'msTSManagingLS',
  
  // MSMQ attributes
  'msmqDigests': 'mSMQDigests',
  'msmqSignCertificates': 'mSMQSignCertificates',
  'msmqOwnerID': 'mSMQOwnerID',
  'msmqSiteID': 'mSMQSiteID',
  'msmqEncryptKey': 'mSMQEncryptKey',
  'msmqSignKey': 'mSMQSignKey',
  'msmqServices': 'mSMQServices',
  'msmqServiceType': 'mSMQServiceType',
  
  // IPSec attributes
  'ipsecOwnersReference': 'ipsecOwnersReference',
  'ipsecISAKMPReference': 'ipsecISAKMPReference',
  'ipsecNFAReference': 'ipsecNFAReference',
  
  // Service attributes
  'servicePrincipalName': 'servicePrincipalName',
  'spn': 'servicePrincipalName',
  
  // Photo attributes
  'thumbnailPhoto': 'thumbnailPhoto',
  'photo': 'thumbnailPhoto',
  'jpegPhoto': 'jpegPhoto',
  'picture': 'jpegPhoto',
  
  // Proxy addresses
  'proxyAddresses': 'proxyAddresses',
  'proxyAddress': 'proxyAddresses',
  'emailAddresses': 'proxyAddresses',
  
  // Extension attributes
  'extensionAttribute1': 'extensionAttribute1',
  'extensionAttribute2': 'extensionAttribute2',
  'extensionAttribute3': 'extensionAttribute3',
  'extensionAttribute4': 'extensionAttribute4',
  'extensionAttribute5': 'extensionAttribute5',
  'extensionAttribute6': 'extensionAttribute6',
  'extensionAttribute7': 'extensionAttribute7',
  'extensionAttribute8': 'extensionAttribute8',
  'extensionAttribute9': 'extensionAttribute9',
  'extensionAttribute10': 'extensionAttribute10',
  'extensionAttribute11': 'extensionAttribute11',
  'extensionAttribute12': 'extensionAttribute12',
  'extensionAttribute13': 'extensionAttribute13',
  'extensionAttribute14': 'extensionAttribute14',
  'extensionAttribute15': 'extensionAttribute15',
  'customAttribute1': 'extensionAttribute1',
  'customAttribute2': 'extensionAttribute2',
  'customAttribute3': 'extensionAttribute3',
  'customAttribute4': 'extensionAttribute4',
  'customAttribute5': 'extensionAttribute5',
  
  // Code page and instance type
  'codePage': 'codePage',
  'instanceType': 'instanceType',
  
  // MS Exchange attributes
  'msExchHideFromAddressLists': 'msExchHideFromAddressLists',
  'hideFromAddressLists': 'msExchHideFromAddressLists',
  'exchangeHideFromAddressLists': 'msExchHideFromAddressLists'
} as const;

/**
 * Resolve field alias to actual LDAP attribute name
 */
export function resolveFieldAlias(field: string): string {
  // Check if it's an alias
  const lowercaseField = field.toLowerCase();
  if (FIELD_ALIAS_MAP[lowercaseField]) {
    return FIELD_ALIAS_MAP[lowercaseField];
  }
  
  // Return the original field if no alias found
  return field;
}

/**
 * Create reverse mapping from LDAP attributes to preferred aliases
 */
const LDAP_TO_ALIAS_MAP: Record<string, string> = Object.entries(FIELD_ALIAS_MAP).reduce((acc, [alias, ldapAttr]) => {
  // Define preferred aliases for common fields
  const preferredAliases: Record<string, string> = {
    'givenName': 'firstName',
    'sn': 'lastName',
    'sAMAccountName': 'username',
    'mail': 'email',
    'telephoneNumber': 'phone',
    'mobile': 'mobilePhone',
    'title': 'jobTitle',
    'department': 'department',
    'company': 'company',
    'physicalDeliveryOfficeName': 'office',
    'streetAddress': 'street',
    'l': 'city',
    'st': 'state',
    'postalCode': 'zip',
    'co': 'country',
    'employeeID': 'employeeId',
    'whenCreated': 'created',
    'whenChanged': 'modified',
    'lastLogonTimestamp': 'lastLogon',
    'passwordLastSet': 'passwordLastChanged',
    'lockoutTime': 'accountLocked',
    'memberOf': 'groups',
    'objectGUID': 'guid',
    'objectSid': 'sid',
    'dNSHostName': 'hostname',
    'operatingSystem': 'os',
    'operatingSystemVersion': 'osVersion',
    'sAMAccountType': 'samAccountType',
    'dSCorePropagationData': 'dsCorePropagationData',
    'nTSecurityDescriptor': 'ntSecurityDescriptor',
    'rIDSetReferences': 'ridSetReferences',
    'fRSComputerReferenceBL': 'frsComputerReferenceBL',
    'fSMORoleOwner': 'fsmoRoleOwner',
    'servicePrincipalName': 'spn',
    'thumbnailPhoto': 'photo',
    'jpegPhoto': 'picture',
    'proxyAddresses': 'emailAddresses',
    'msDS-SupportedEncryptionTypes': 'msdsSupportedEncryptionTypes',
    'msRADIUS-FramedIPAddress': 'msradiusFramedIPAddress',
    'msPKI-AccountCredentials': 'mspkiAccountCredentials',
    'mSMQDigests': 'msmqDigests'
  };
  
  // Use preferred alias if defined, otherwise use the first one we encounter
  if (!acc[ldapAttr]) {
    acc[ldapAttr] = preferredAliases[ldapAttr] || alias;
  }
  
  return acc;
}, {} as Record<string, string>);

/**
 * Resolve LDAP attribute name back to preferred field alias
 * This is used when returning results to match user's expected field names
 */
export function resolveLDAPToAlias(ldapAttribute: string): string {
  // If there's a preferred alias, use it
  if (LDAP_TO_ALIAS_MAP[ldapAttribute]) {
    return LDAP_TO_ALIAS_MAP[ldapAttribute];
  }
  
  // Otherwise return the LDAP attribute as-is
  return ldapAttribute;
}

export interface LDAPAttributeGetter {
  (name: string): any;
}

/**
 * Create a case-insensitive attribute getter for LDAP results
 */
export function createAttributeGetter(attributes: Record<string, any>): LDAPAttributeGetter {
  // Create a lowercase key map for case-insensitive lookups
  const lowerCaseMap: Record<string, string> = {};
  Object.keys(attributes).forEach(key => {
    lowerCaseMap[key.toLowerCase()] = key;
  });
  
  return (name: string): any => {
    // Try exact match first
    if (attributes[name] !== undefined) {
      return attributes[name];
    }
    
    // Try case-insensitive match
    const lowerName = name.toLowerCase();
    const actualKey = lowerCaseMap[lowerName];
    if (actualKey !== undefined) {
      return attributes[actualKey];
    }
    
    return '';
  };
}

/**
 * Convert JavaScript Date to Windows FileTime format
 * Windows FileTime = 100-nanosecond intervals since January 1, 1601 UTC
 */
export function dateToWindowsFileTime(date: Date): string {
  // Windows FileTime = 100-nanosecond intervals since January 1, 1601 UTC
  // JavaScript Date.getTime() returns milliseconds since January 1, 1970 UTC
  // Difference between 1601 and 1970 is 11644473600 seconds (116444736000000000 100-nanosecond intervals)
  const EPOCH_DIFFERENCE = 116444736000000000n;
  const jsTime = BigInt(date.getTime()) * 10000n; // Convert ms to 100-nanosecond intervals
  return (jsTime + EPOCH_DIFFERENCE).toString();
}

/**
 * Convert days ago to Windows FileTime
 */
export function daysToWindowsFileTime(days: number): string {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  return dateToWindowsFileTime(cutoffDate);
}

/**
 * Convert hours ago to Windows FileTime
 */
export function hoursToWindowsFileTime(hours: number): string {
  const cutoffTime = new Date();
  cutoffTime.setHours(cutoffTime.getHours() - hours);
  return dateToWindowsFileTime(cutoffTime);
}

/**
 * Convert Windows FileTime to JavaScript Date
 */
export function windowsFileTimeToDate(fileTime: string | number): Date | null {
  if (!fileTime || fileTime === '0') return null;
  
  // Convert Windows FileTime to JavaScript timestamp
  const EPOCH_DIFFERENCE = 116444736000000000n;
  const fileTimeBigInt = BigInt(fileTime);
  const jsTimeBigInt = fileTimeBigInt - EPOCH_DIFFERENCE;
  const jsTime = Number(jsTimeBigInt / 10000n); // Convert from 100-nanosecond to milliseconds
  return new Date(jsTime);
}

/**
 * Build LDAP filter component based on operator
 */
export function buildFilterComponent(field: string, operator: string, value: any): string {
  // Resolve field alias to actual LDAP attribute name
  const ldapField = resolveFieldAlias(field);
  
  // Handle empty/null/undefined values
  if (value === null || value === undefined || value === '') {
    switch (operator) {
      case 'equals':
      case 'isEmpty':
        // When the comparison value is empty, treat it as an "is empty" check.
        // An LDAP attribute cannot have an explicit empty string value, so the
        // closest semantic is that the attribute is either *not present* or
        // does not contain any characters. We therefore generate a filter that
        // matches the absence of the attribute only, avoiding the invalid
        // equality expression "(${field}=)" that triggers the
        // "must either provide a buffer via `raw` or some `value`" error in
        // @ldapjs/filter.
        return `(!(${ldapField}=*))`; // Attribute is not present (effectively empty)
      case 'notEquals':
      case 'not_equals':
      case 'isNotEmpty':
        // For an empty comparison value, "not equals" (and logically
        // "is not empty") should evaluate to the attribute being present.
        // Using the existence check avoids producing an invalid "(attr=)"
        // expression.
        return `(${ldapField}=*)`;
      case 'exists':
        return `(${ldapField}=*)`;
      case 'not_exists':
        return `(!(${ldapField}=*))`;
      default:
        // For other operators with empty value, check if field exists
        return `(${ldapField}=*)`;
    }
  }

  // Escape special LDAP characters in the value
  const escapedValue = String(value)
    .replace(/\\/g, '\\5c')
    .replace(/\*/g, '\\2a')
    .replace(/\(/g, '\\28')
    .replace(/\)/g, '\\29')
    .replace(/\0/g, '\\00');

  switch (operator) {
    case 'equals':
      return `(${ldapField}=${escapedValue})`;
    case 'notEquals':
    case 'not_equals':
      return `(!(${ldapField}=${escapedValue}))`;
    case 'contains':
      return `(${ldapField}=*${escapedValue}*)`;
    case 'notContains':
    case 'not_contains':
      return `(!(${ldapField}=*${escapedValue}*))`;
    case 'startsWith':
      return `(${ldapField}=${escapedValue}*)`;
    case 'endsWith':
      return `(${ldapField}=*${escapedValue})`;
    case 'greaterThan':
    case 'greater_than':
      return `(${ldapField}>${escapedValue})`;
    case 'lessThan':
    case 'less_than':
      return `(${ldapField}<${escapedValue})`;
    case 'greaterThanOrEqual':
    case 'greater_or_equal':
      return `(${ldapField}>=${escapedValue})`;
    case 'lessThanOrEqual':
    case 'less_or_equal':
      return `(${ldapField}<=${escapedValue})`;
    case 'exists':
      return `(${ldapField}=*)`;
    case 'not_exists':
      return `(!(${ldapField}=*))`;
    case 'isEmpty':
      // For LDAP, empty means either not set or empty string
      return `(|(!(${ldapField}=*))(${ldapField}=))`;
    case 'isNotEmpty':
      // For LDAP, not empty means has a value and not empty string
      return `(&(${ldapField}=*)(!(${ldapField}=)))`;
    case 'older_than':
      // Expects value to be number of days
      const windowsTime = daysToWindowsFileTime(parseInt(value));
      return `(${ldapField}<=${windowsTime})`;
    case 'newer_than':
      // Expects value to be number of days
      const recentTime = daysToWindowsFileTime(parseInt(value));
      return `(${ldapField}>=${recentTime})`;
    default:
      throw new Error(`Unknown filter operator: ${operator}`);
  }
}

/**
 * Build complex LDAP filter by combining multiple conditions
 */
export function buildComplexFilter(baseFilter: string, conditions: Array<{ field: string; operator: string; value: any }>): string {
  if (!conditions || conditions.length === 0) {
    return baseFilter;
  }
  
  // Filter out invalid conditions
  const validConditions = conditions.filter(condition => 
    condition && condition.field && condition.operator
  );
  
  if (validConditions.length === 0) {
    return baseFilter;
  }
  
  const conditionFilters = validConditions.map(condition => 
    buildFilterComponent(condition.field, condition.operator, condition.value)
  );
  
  // Combine base filter with conditions using AND logic
  return `(&${baseFilter}${conditionFilters.join('')})`;
}

/**
 * Sort array of results by field and direction
 */
export function sortResults<T extends Record<string, any>>(
  results: T[], 
  field: string, 
  direction: 'asc' | 'desc' = 'asc'
): T[] {
  return results.sort((a, b) => {
    const aVal = a[field];
    const bVal = b[field];
    
    if (aVal === null || aVal === undefined) return 1;
    if (bVal === null || bVal === undefined) return -1;
    
    let comparison = 0;
    if (aVal < bVal) comparison = -1;
    else if (aVal > bVal) comparison = 1;
    
    return direction === 'asc' ? comparison : -comparison;
  });
}

/**
 * Check if account is disabled
 */
export function isAccountDisabled(userAccountControl: string | number): boolean {
  const uac = typeof userAccountControl === 'string' ? parseInt(userAccountControl) : userAccountControl;
  return !!(uac & UAC_FLAGS.ACCOUNT_DISABLED);
}

/**
 * Check if account is locked
 */
export function isAccountLocked(lockoutTime: string | number): boolean {
  return lockoutTime !== '0' && lockoutTime !== 0 && !!lockoutTime;
}

/**
 * Check if password never expires
 */
export function isPasswordNeverExpires(userAccountControl: string | number): boolean {
  const uac = typeof userAccountControl === 'string' ? parseInt(userAccountControl) : userAccountControl;
  return !!(uac & UAC_FLAGS.DONT_EXPIRE_PASSWORD);
}

/**
 * Parse LDAP timestamp to Date
 */
export function ldapTimestampToDate(timestamp: string): Date | null {
  if (!timestamp) return null;
  
  const year = parseInt(timestamp.substring(0, 4));
  const month = parseInt(timestamp.substring(4, 6)) - 1;
  const day = parseInt(timestamp.substring(6, 8));
  const hour = parseInt(timestamp.substring(8, 10));
  const minute = parseInt(timestamp.substring(10, 12));
  const second = parseInt(timestamp.substring(12, 14));
  
  return new Date(year, month, day, hour, minute, second);
}

/**
 * Parse manager DN to get display name
 */
export function parseManagerDN(managerDN: string | any): string | null {
  if (!managerDN) return null;
  
  // Ensure managerDN is a string before calling .match()
  const managerDNString = String(managerDN);
  const match = managerDNString.match(/^CN=([^,]+),/i);
  return match ? match[1] : managerDNString;
}

/**
 * Parse organizational unit from distinguished name
 */
export function parseOrganizationalUnit(distinguishedName: string): string {
  if (!distinguishedName) return '';
  
  const ouMatch = distinguishedName.match(/OU=([^,]+)/i);
  return ouMatch ? ouMatch[1] : '';
}

// Standard AD User interface for convertLDAPToUser function
export interface StandardADUser {
  username: string;
  displayName?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  department?: string;
  title?: string;
  company?: string;
  manager?: string | null;
  phone?: string;
  mobile?: string;
  office?: string;
  lastLogon?: Date | null;
  passwordLastSet?: Date | null;
  accountExpires?: Date | null;
  whenCreated?: Date | null;
  whenChanged?: Date | null;
  distinguishedName: string;
  organizationalUnit: string;
  enabled: boolean;
  locked: boolean;
  passwordNeverExpires: boolean;
  groups: string[];
  objectGUID?: string;
}

/**
 * Convert LDAP result to standardized user object
 */
export function convertLDAPToUser(ldapResult: any): StandardADUser {
  const attrs = ldapResult.attributes || ldapResult;
  const getAttr = createAttributeGetter(attrs);
  
  const userAccountControl = getAttr('userAccountControl');
  const lockoutTime = getAttr('lockoutTime');
  const distinguishedName = getAttr('distinguishedName');
  
  return {
    username: getAttr('sAMAccountName'),
    displayName: getAttr('displayName'),
    email: getAttr('mail'),
    firstName: getAttr('givenName'),
    lastName: getAttr('sn'),
    department: getAttr('department'),
    title: getAttr('title'),
    company: getAttr('company'),
    manager: parseManagerDN(getAttr('manager')),
    phone: getAttr('telephoneNumber'),
    mobile: getAttr('mobile'),
    office: getAttr('physicalDeliveryOfficeName'),
    lastLogon: windowsFileTimeToDate(getAttr('lastLogonTimestamp')),
    passwordLastSet: windowsFileTimeToDate(getAttr('passwordLastSet')),
    accountExpires: windowsFileTimeToDate(getAttr('accountExpires')),
    whenCreated: ldapTimestampToDate(getAttr('whenCreated')),
    whenChanged: ldapTimestampToDate(getAttr('whenChanged')),
    distinguishedName: distinguishedName,
    organizationalUnit: parseOrganizationalUnit(distinguishedName),
    enabled: !isAccountDisabled(userAccountControl),
    locked: isAccountLocked(lockoutTime),
    passwordNeverExpires: isPasswordNeverExpires(userAccountControl),
    objectGUID: getAttr('objectGUID'),
    groups: Array.isArray(getAttr('memberOf')) 
      ? getAttr('memberOf').map((dn: string) => {
          const match = dn.match(/^CN=([^,]+),/i);
          return match ? match[1] : dn;
        })
      : []
  };
}