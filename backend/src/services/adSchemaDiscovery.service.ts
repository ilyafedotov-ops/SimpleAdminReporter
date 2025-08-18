import { logger } from '@/utils/logger';
import { redis } from '@/config/redis';
import { serviceFactory } from '@/services/service.factory';

interface ADAttribute {
  name: string;
  displayName?: string;
  description?: string;
  isSingleValued?: boolean;
  syntax?: string;
  systemOnly?: boolean;
  searchFlags?: number;
}

interface ADSchemaResult {
  attributes: ADAttribute[];
  objectClasses: string[];
  totalCount: number;
  commonAttributes: ADAttribute[];
}

export class ADSchemaDiscoveryService {
  private cacheKey = 'ad:schema:full';
  private cacheTTL = 86400; // 24 hours
  private cacheEnabled = process.env.NODE_ENV === 'production' && process.env.DISABLE_SCHEMA_CACHE !== 'true';
  
  /**
   * Discover all available attributes from AD schema dynamically
   */
  async discoverFullSchema(serviceAccountDn?: string, serviceAccountPassword?: string): Promise<ADSchemaResult> {
    try {
      // Create cache key that includes credential info
      const credentialCacheKey = serviceAccountDn ? 
        `${this.cacheKey}:${Buffer.from(serviceAccountDn).toString('base64').substring(0, 16)}` : 
        this.cacheKey;
      
      // Check cache first (if enabled)
      if (this.cacheEnabled) {
        const cached = await redis.getJson<ADSchemaResult>(credentialCacheKey);
        if (cached) {
          logger.info('Returning cached AD schema');
          return cached;
        }
      } else {
        logger.info('Schema caching disabled - discovering fresh schema');
      }

      // Service credentials are required - no fallback to environment
      if (!serviceAccountDn || !serviceAccountPassword) {
        throw new Error('Schema discovery requires valid service account credentials. Please configure your AD credentials in Settings.');
      }

      // Normalise credentials – remove whitespace & control chars that can
      // sneak in during decryption/copy-paste and cause bind failures (52e).
      const clean = (v: string) => v.replace(/[\u0000\r\n]/g, '').trim();
      serviceAccountDn = clean(serviceAccountDn);
      serviceAccountPassword = clean(serviceAccountPassword);

      logger.info('Using AD service (ldapjs) for schema discovery - same as working reports');
      
      // Get AD service instance with the working LDAP approach
      const adService = await serviceFactory.getADService();
      
      // Test connection first using the same method as reports
      const connectionTest = await adService.testConnection();
      if (!connectionTest) {
        throw new Error('Service account credentials are invalid or expired. Please update your AD credentials in Settings.');
      }
      
      logger.info('AD service connection test successful');
      
      // Discover attributes using the working LDAP connection
      const userAttributes = await this.discoverUserObjectAttributesWithADService(adService);

      // Categorize common/important attributes
      const commonAttributes = this.identifyCommonAttributes(userAttributes);

      const result: ADSchemaResult = {
        attributes: userAttributes,
        objectClasses: ['user', 'person', 'organizationalPerson'], // Basic AD object classes
        totalCount: userAttributes.length,
        commonAttributes
      };

      // Cache the result (if enabled)
      if (this.cacheEnabled) {
        await redis.setJson(credentialCacheKey, result, this.cacheTTL);
        logger.info('Schema cached for future requests');
      } else {
        logger.info('Schema caching disabled - not storing result');
      }

      return result;
    } catch (error: any) {
      logger.error('Failed to discover AD schema:', error);
      
      // Provide more specific error messages
      if (((error as any)?.message || String(error)).includes('credentials')) {
        throw error; // Re-throw credential errors as-is
      } else {
        throw new Error(`Failed to discover AD schema: ${((error as any)?.message || String(error))}. Please verify your AD server configuration.`);
      }
    }
  }


  /**
   * Discover attributes by sampling actual user objects using AD service (ldapjs)
   */
  private async discoverUserObjectAttributesWithADService(adService: any): Promise<ADAttribute[]> {
    try {
      const discoveredAttrs = new Map<string, ADAttribute>();
      
      // Create a query to sample user objects using the AD service
      const sampleQuery = {
        type: 'custom',
        filter: '(&(objectClass=user)(objectCategory=person))',
        attributes: [], // Empty array means return all attributes
        // Increase sample size significantly so we discover a broader set of
        // attributes across diverse user objects. A limit of 2000 keeps the
        // query fast while maximising coverage.
        options: { sizeLimit: 2000, scope: 'sub' }
      };

      logger.info('Sampling user objects for attribute discovery using AD service');
      
      // Execute query using the working AD service
      const queryResult = await adService.executeQuery(sampleQuery);
      const searchResults = queryResult.data || [];

      logger.info(`Sampling ${searchResults.length} user objects for attribute discovery`);

      // Process each user to discover attributes
      for (const entry of searchResults) {
        // Process all attributes from the entry
        for (const [attrName, attrValue] of Object.entries(entry)) {
          if (!discoveredAttrs.has(attrName) && attrName !== 'dn' && attrName !== 'distinguishedName') {
            // Infer data type from attribute name and value
            let dataType = 'string';
            const value = Array.isArray(attrValue) ? attrValue[0] : attrValue;
            const strValue = String(value);
            
            if (attrName.toLowerCase().includes('time') || 
                attrName.toLowerCase().includes('date') ||
                attrName === 'whenCreated' ||
                attrName === 'whenChanged' ||
                attrName === 'lastLogon' ||
                attrName === 'pwdLastSet' ||
                attrName === 'lastLogonTimestamp' ||
                attrName === 'passwordLastSet') {
              dataType = 'datetime';
            } else if (attrName.toLowerCase().includes('count') ||
                      attrName.toLowerCase().includes('number') ||
                      attrName === 'userAccountControl' ||
                      attrName === 'logonCount' ||
                      attrName === 'badPwdCount') {
              dataType = 'integer';
            } else if (strValue === 'TRUE' || strValue === 'FALSE') {
              dataType = 'boolean';
            } else if (Array.isArray(attrValue) && attrValue.length > 1) {
              dataType = 'array';
            }

            discoveredAttrs.set(attrName, {
              name: attrName,
              displayName: this.humanizeFieldName(attrName),
              syntax: dataType,
              description: `Active Directory ${attrName} attribute`
            });
          }
        }
      }

      const attributes = Array.from(discoveredAttrs.values());
      logger.info(`Discovered ${attributes.length} unique attributes from AD user objects using AD service`);
      
      return attributes;
    } catch (error) {
      logger.error('Failed to discover user attributes with AD service:', error);
      return this.getFallbackSchema().attributes;
    }
  }


  /**
   * Identify commonly used attributes
   */
  private identifyCommonAttributes(allAttributes: ADAttribute[]): ADAttribute[] {
    const commonNames = [
      'sAMAccountName', 'userPrincipalName', 'displayName', 'givenName', 'sn',
      'mail', 'telephoneNumber', 'department', 'title', 'manager', 'memberOf',
      'whenCreated', 'whenChanged', 'lastLogon', 'userAccountControl',
      'accountExpires', 'pwdLastSet', 'distinguishedName', 'objectClass',
      'cn', 'description', 'company', 'streetAddress', 'l', 'st', 'postalCode',
      'co', 'c', 'employeeID', 'employeeNumber', 'physicalDeliveryOfficeName'
    ];

    return allAttributes.filter(attr => 
      commonNames.includes(attr.name) || 
      commonNames.includes(attr.name.toLowerCase())
    );
  }

  /**
   * Convert field names to human-readable format
   */
  private humanizeFieldName(fieldName: string): string {
    // Handle common abbreviations and special cases
    const replacements: Record<string, string> = {
      // Special mixed-case acronyms - SAM prefix
      'sAMAccountName': 'SAM Account Name',
      'sAMAccountType': 'SAM Account Type',
      
      // DS prefix attributes
      'dSCorePropagationData': 'DS Core Propagation Data',
      'dSHeuristics': 'DS Heuristics',
      'dSMachineAccountQuota': 'DS Machine Account Quota',
      
      // MS prefix attributes
      'mS-DS-ConsistencyGuid': 'MS-DS Consistency GUID',
      'mS-DS-ConsistencyChildCount': 'MS-DS Consistency Child Count',
      'mS-DS-CreatorSID': 'MS-DS Creator SID',
      'mSMQDigests': 'MSMQ Digests',
      'mSMQSignCertificates': 'MSMQ Sign Certificates',
      'mSMQOwnerID': 'MSMQ Owner ID',
      'mSMQSiteID': 'MSMQ Site ID',
      'mSMQEncryptKey': 'MSMQ Encrypt Key',
      'mSMQSignKey': 'MSMQ Sign Key',
      'mSMQServices': 'MSMQ Services',
      'mSMQServiceType': 'MSMQ Service Type',
      'mSDFSR-ComputerReferenceBL': 'MS-DFSR Computer Reference BL',
      'mSDFSR-MemberReferenceBL': 'MS-DFSR Member Reference BL',
      'msDS-SupportedEncryptionTypes': 'MS-DS Supported Encryption Types',
      'msDS-AllowedToDelegateTo': 'MS-DS Allowed To Delegate To',
      'msDS-AllowedToActOnBehalfOfOtherIdentity': 'MS-DS Allowed To Act On Behalf Of Other Identity',
      'msDS-ManagedPassword': 'MS-DS Managed Password',
      'msDS-GroupMSAMembership': 'MS-DS Group MSA Membership',
      'msDS-SiteName': 'MS-DS Site Name',
      'msDS-SourceObjectDN': 'MS-DS Source Object DN',
      'msDS-IsDomainFor': 'MS-DS Is Domain For',
      'msDS-IsFullReplicaFor': 'MS-DS Is Full Replica For',
      'msDS-IsPartialReplicaFor': 'MS-DS Is Partial Replica For',
      'msDS-KeyVersionNumber': 'MS-DS Key Version Number',
      'msDS-KrbTgtLinkBl': 'MS-DS Krb Tgt Link BL',
      'msDS-ManagedPasswordId': 'MS-DS Managed Password ID',
      'msDS-ManagedPasswordInterval': 'MS-DS Managed Password Interval',
      'msDS-ManagedPasswordPreviousId': 'MS-DS Managed Password Previous ID',
      'msDS-Members': 'MS-DS Members',
      'msDS-MembersForAzRole': 'MS-DS Members For Az Role',
      'msDS-MembersForAzRoleBL': 'MS-DS Members For Az Role BL',
      'msDS-NCReplCursors': 'MS-DS NC Repl Cursors',
      'msDS-NCReplInboundNeighbors': 'MS-DS NC Repl Inbound Neighbors',
      'msDS-NCReplOutboundNeighbors': 'MS-DS NC Repl Outbound Neighbors',
      'msDS-ObjectReference': 'MS-DS Object Reference',
      'msDS-ObjectReferenceBL': 'MS-DS Object Reference BL',
      'msDS-OperationsForAzRole': 'MS-DS Operations For Az Role',
      'msDS-OperationsForAzRoleBL': 'MS-DS Operations For Az Role BL',
      'msDS-OperationsForAzTask': 'MS-DS Operations For Az Task',
      'msDS-OperationsForAzTaskBL': 'MS-DS Operations For Az Task BL',
      'msDS-PasswordHistoryLength': 'MS-DS Password History Length',
      'msDS-PasswordReversibleEncryptionEnabled': 'MS-DS Password Reversible Encryption Enabled',
      'msDS-PrincipalName': 'MS-DS Principal Name',
      'msDS-PromotionSettings': 'MS-DS Promotion Settings',
      'msDS-ReplAttributeMetaData': 'MS-DS Repl Attribute Meta Data',
      'msDS-ReplValueMetaData': 'MS-DS Repl Value Meta Data',
      'msDS-ReplicationEpoch': 'MS-DS Replication Epoch',
      'msDS-ReplicatesNCReason': 'MS-DS Replicates NC Reason',
      'msDS-ResultantPSO': 'MS-DS Resultant PSO',
      'msDS-RevealOnDemandGroup': 'MS-DS Reveal On Demand Group',
      'msDS-RevealedDSAs': 'MS-DS Revealed DSAs',
      'msDS-RevealedList': 'MS-DS Revealed List',
      'msDS-RevealedListBL': 'MS-DS Revealed List BL',
      'msDS-SecondaryKrbTgtNumber': 'MS-DS Secondary Krb Tgt Number',
      'msDS-TasksForAzRole': 'MS-DS Tasks For Az Role',
      'msDS-TasksForAzRoleBL': 'MS-DS Tasks For Az Role BL',
      'msDS-TasksForAzTask': 'MS-DS Tasks For Az Task',
      'msDS-TasksForAzTaskBL': 'MS-DS Tasks For Az Task BL',
      'msDS-TrustForestTrustInfo': 'MS-DS Trust Forest Trust Info',
      'msDS-UserAccountControlComputed': 'MS-DS User Account Control Computed',
      'msDS-UserPasswordExpiryTimeComputed': 'MS-DS User Password Expiry Time Computed',
      'msDS-Value': 'MS-DS Value',
      'msDS-ValueTypeReference': 'MS-DS Value Type Reference',
      'msDS-ValueTypeReferenceBL': 'MS-DS Value Type Reference BL',
      'msDS-cloudExtensionAttribute1': 'MS-DS Cloud Extension Attribute 1',
      'msDS-cloudExtensionAttribute2': 'MS-DS Cloud Extension Attribute 2',
      'msDS-cloudExtensionAttribute3': 'MS-DS Cloud Extension Attribute 3',
      'msDS-cloudExtensionAttribute4': 'MS-DS Cloud Extension Attribute 4',
      'msDS-cloudExtensionAttribute5': 'MS-DS Cloud Extension Attribute 5',
      'msDS-cloudExtensionAttribute6': 'MS-DS Cloud Extension Attribute 6',
      'msDS-cloudExtensionAttribute7': 'MS-DS Cloud Extension Attribute 7',
      'msDS-cloudExtensionAttribute8': 'MS-DS Cloud Extension Attribute 8',
      'msDS-cloudExtensionAttribute9': 'MS-DS Cloud Extension Attribute 9',
      'msDS-cloudExtensionAttribute10': 'MS-DS Cloud Extension Attribute 10',
      'msDS-cloudExtensionAttribute11': 'MS-DS Cloud Extension Attribute 11',
      'msDS-cloudExtensionAttribute12': 'MS-DS Cloud Extension Attribute 12',
      'msDS-cloudExtensionAttribute13': 'MS-DS Cloud Extension Attribute 13',
      'msDS-cloudExtensionAttribute14': 'MS-DS Cloud Extension Attribute 14',
      'msDS-cloudExtensionAttribute15': 'MS-DS Cloud Extension Attribute 15',
      'msDS-cloudExtensionAttribute16': 'MS-DS Cloud Extension Attribute 16',
      'msDS-cloudExtensionAttribute17': 'MS-DS Cloud Extension Attribute 17',
      'msDS-cloudExtensionAttribute18': 'MS-DS Cloud Extension Attribute 18',
      'msDS-cloudExtensionAttribute19': 'MS-DS Cloud Extension Attribute 19',
      'msDS-cloudExtensionAttribute20': 'MS-DS Cloud Extension Attribute 20',
      
      // NT prefix attributes
      'nTSecurityDescriptor': 'NT Security Descriptor',
      'nTGroupMembers': 'NT Group Members',
      'nTMixedDomain': 'NT Mixed Domain',
      'nTPwdHistory': 'NT Password History',
      
      // RID prefix attributes
      'rIDSetReferences': 'RID Set References',
      'rIDAllocationPool': 'RID Allocation Pool',
      'rIDAvailablePool': 'RID Available Pool',
      'rIDManagerReference': 'RID Manager Reference',
      'rIDNextRID': 'RID Next RID',
      'rIDPreviousAllocationPool': 'RID Previous Allocation Pool',
      'rIDUsedPool': 'RID Used Pool',
      
      // FRS prefix attributes
      'fRSComputerReferenceBL': 'FRS Computer Reference BL',
      'fRSMemberReferenceBL': 'FRS Member Reference BL',
      'fRSPartnerAuthAndStatus': 'FRS Partner Auth And Status',
      'fRSPrimaryMember': 'FRS Primary Member',
      'fRSRootPath': 'FRS Root Path',
      'fRSServiceCommand': 'FRS Service Command',
      'fRSUpdateTimeout': 'FRS Update Timeout',
      'fRSVersionGUID': 'FRS Version GUID',
      'fRSWorkingPath': 'FRS Working Path',
      
      // FSMO prefix attributes
      'fSMORoleOwner': 'FSMO Role Owner',
      
      // Other mixed-case attributes
      'ipsecOwnersReference': 'IPSec Owners Reference',
      'ipsecISAKMPReference': 'IPSec ISAKMP Reference',
      'ipsecNFAReference': 'IPSec NFA Reference',
      'wellKnownObjects': 'Well Known Objects',
      'otherWellKnownObjects': 'Other Well Known Objects',
      'bridgeheadServerListBL': 'Bridgehead Server List BL',
      'netbootSCPBL': 'Netboot SCP BL',
      'isCriticalSystemObject': 'Is Critical System Object',
      'isDeleted': 'Is Deleted',
      'isRecycled': 'Is Recycled',
      'lastKnownParent': 'Last Known Parent',
      'msIIS-FTPDir': 'MS-IIS FTP Dir',
      'msIIS-FTPRoot': 'MS-IIS FTP Root',
      'msCOM-PartitionSetLink': 'MS-COM Partition Set Link',
      'msCOM-UserLink': 'MS-COM User Link',
      'msDRM-IdentityCertificate': 'MS-DRM Identity Certificate',
      'msPKI-AccountCredentials': 'MS-PKI Account Credentials',
      'msPKI-DPAPIMasterKeys': 'MS-PKI DPAPI Master Keys',
      'msPKI-RoamingTimeStamp': 'MS-PKI Roaming Time Stamp',
      'msPKIAccountCredentials': 'MS-PKI Account Credentials',
      'msPKIDPAPIMasterKeys': 'MS-PKI DPAPI Master Keys',
      'msPKIRoamingTimeStamp': 'MS-PKI Roaming Time Stamp',
      'msRADIUS-FramedIPAddress': 'MS-RADIUS Framed IP Address',
      'msRADIUSCallbackNumber': 'MS-RADIUS Callback Number',
      'msRADIUSFramedIPAddress': 'MS-RADIUS Framed IP Address',
      'msRADIUSFramedRoute': 'MS-RADIUS Framed Route',
      'msRADIUSServiceType': 'MS-RADIUS Service Type',
      'msSFU30PosixMemberOf': 'MS-SFU30 Posix Member Of',
      'msTSProperty01': 'MS-TS Property 01',
      'msTSProperty02': 'MS-TS Property 02',
      'msTSExpireDate': 'MS-TS Expire Date',
      'msTSLicenseVersion': 'MS-TS License Version',
      'msTSManagingLS': 'MS-TS Managing LS',
      
      // Standard replacements
      'userPrincipalName': 'User Principal Name',
      'sn': 'Last Name',
      'givenName': 'First Name',
      'cn': 'Common Name',
      'dn': 'Distinguished Name',
      'ou': 'Organizational Unit',
      'dc': 'Domain Component',
      'l': 'City',
      'st': 'State/Province',
      'c': 'Country Code',
      'co': 'Country',
      'pwdLastSet': 'Password Last Set',
      'physicalDeliveryOfficeName': 'Office',
      
      // Acronym fields
      'uSNCreated': 'USN Created',
      'uSNChanged': 'USN Changed',
      'objectGUID': 'Object GUID',
      'objectSid': 'Object SID',
      'dNSHostName': 'DNS Host Name',
      'wWWHomePage': 'WWW Home Page',
      'badPwdCount': 'Bad Password Count',
      'adminCount': 'Admin Count',
      'primaryGroupID': 'Primary Group ID',
      'employeeID': 'Employee ID',
      'facsimileTelephoneNumber': 'Fax Number',
      'homePhone': 'Home Phone',
      'telephoneNumber': 'Telephone Number',
      'postalCode': 'Postal Code',
      'streetAddress': 'Street Address',
      'userAccountControl': 'User Account Control',
      'lastLogonTimestamp': 'Last Logon Timestamp',
      'passwordLastSet': 'Password Last Set',
      'accountExpires': 'Account Expires',
      'lockoutTime': 'Lockout Time',
      'badPasswordTime': 'Bad Password Time',
      'whenCreated': 'When Created',
      'whenChanged': 'When Changed',
      'memberOf': 'Member Of',
      'managedBy': 'Managed By',
      'directReports': 'Direct Reports',
      'employeeType': 'Employee Type',
      'employeeNumber': 'Employee Number',
      'mailNickname': 'Mail Nickname',
      
      // Additional common AD attributes
      'distinguishedName': 'Distinguished Name',
      'lastLogon': 'Last Logon',
      'logonCount': 'Logon Count',
      'codePage': 'Code Page',
      'countryCode': 'Country Code',
      'instanceType': 'Instance Type',
      'operatingSystem': 'Operating System',
      'operatingSystemVersion': 'Operating System Version',
      'operatingSystemServicePack': 'Operating System Service Pack',
      'servicePrincipalName': 'Service Principal Name',
      'thumbnailPhoto': 'Thumbnail Photo',
      'jpegPhoto': 'JPEG Photo',
      'proxyAddresses': 'Proxy Addresses',
      'extensionAttribute1': 'Extension Attribute 1',
      'extensionAttribute2': 'Extension Attribute 2',
      'extensionAttribute3': 'Extension Attribute 3',
      'extensionAttribute4': 'Extension Attribute 4',
      'extensionAttribute5': 'Extension Attribute 5',
      'msExchHideFromAddressLists': 'MS Exchange Hide From Address Lists'
    };

    if (replacements[fieldName]) {
      return replacements[fieldName];
    }

    // Handle special patterns
    // 1. Handle acronyms at the start (e.g., "DNSHostName" -> "DNS Host Name")
    fieldName = fieldName.replace(/^([A-Z]{2,})([A-Z][a-z])/g, '$1 $2');
    
    // 2. Handle acronyms in the middle (e.g., "objectGUID" -> "object GUID")
    fieldName = fieldName.replace(/([a-z])([A-Z]{2,})/g, '$1 $2');
    
    // 3. Handle consecutive capitals (e.g., "GUID" stays "GUID", not "G U I D")
    fieldName = fieldName.replace(/([A-Z]{2,})([A-Z][a-z])/g, '$1 $2');
    
    // 4. Standard camelCase to Title Case (but not for consecutive capitals)
    fieldName = fieldName.replace(/([a-z])([A-Z])/g, '$1 $2');
    
    // 5. Capitalize first letter
    fieldName = fieldName.replace(/^./, str => str.toUpperCase());
    
    return fieldName.trim();
  }

  /**
   * Get fallback schema when discovery fails
   */
  private getFallbackSchema(): ADSchemaResult {
    const fallbackAttributes: ADAttribute[] = [
      { name: 'sAMAccountName', displayName: 'Username', syntax: 'string' },
      { name: 'userPrincipalName', displayName: 'User Principal Name', syntax: 'string' },
      { name: 'displayName', displayName: 'Display Name', syntax: 'string' },
      { name: 'givenName', displayName: 'First Name', syntax: 'string' },
      { name: 'sn', displayName: 'Last Name', syntax: 'string' },
      { name: 'mail', displayName: 'Email', syntax: 'string' },
      { name: 'department', displayName: 'Department', syntax: 'string' },
      { name: 'title', displayName: 'Job Title', syntax: 'string' },
      { name: 'whenCreated', displayName: 'Created Date', syntax: 'datetime' },
      { name: 'whenChanged', displayName: 'Modified Date', syntax: 'datetime' }
    ];

    return {
      attributes: fallbackAttributes,
      objectClasses: ['user', 'person', 'organizationalPerson'],
      totalCount: fallbackAttributes.length,
      commonAttributes: fallbackAttributes
    };
  }

  /**
   * Convert discovered attributes to field metadata format
   */
  async convertToFieldMetadata(attributes: ADAttribute[]): Promise<any[]> {
    return attributes.map(attr => ({
      source: 'ad',
      fieldName: attr.name,
      displayName: attr.displayName || this.humanizeFieldName(attr.name),
      dataType: this.mapSyntaxToDataType(attr.syntax || 'string'),
      category: this.categorizeField(attr.name),
      description: attr.description || `Active Directory ${attr.displayName || attr.name} field`,
      isSearchable: true,
      isSortable: !attr.syntax?.includes('2.5.5.10'), // Not sortable if octet string
      isExportable: true,
      isSensitive: this.isSensitiveField(attr.name),
      aliases: this.getFieldAliases(attr.name)
    }));
  }

  /**
   * Map LDAP syntax OID to our data types
   */
  private mapSyntaxToDataType(syntax: string): string {
    const syntaxMap: Record<string, string> = {
      '2.5.5.8': 'boolean',      // Boolean
      '2.5.5.9': 'integer',      // Integer
      '2.5.5.11': 'datetime',    // UTC Time
      '2.5.5.12': 'string',      // Unicode String
      '2.5.5.5': 'string',       // IA5 String
      '2.5.5.10': 'string',      // Octet String
      'string': 'string',
      'integer': 'integer',
      'datetime': 'datetime',
      'boolean': 'boolean'
    };

    return syntaxMap[syntax] || 'string';
  }

  /**
   * Categorize field based on name
   */
  private categorizeField(fieldName: string): string {
    const name = fieldName.toLowerCase();
    
    if (['samaccountname', 'userprincipalname', 'displayname', 'cn', 'distinguishedname'].includes(name)) {
      return 'identity';
    } else if (['givenname', 'sn', 'initials', 'name'].includes(name)) {
      return 'personal';
    } else if (['mail', 'telephonenumber', 'mobile', 'facsimiletelephonenumber'].includes(name)) {
      return 'contact';
    } else if (['department', 'company', 'title', 'manager', 'employeeid'].includes(name)) {
      return 'organization';
    } else if (['streetaddress', 'l', 'st', 'postalcode', 'c', 'co'].includes(name)) {
      return 'location';
    } else if (['whencreated', 'whenchanged', 'lastlogon', 'pwdlastset'].includes(name)) {
      return 'audit';
    } else if (['useraccountcontrol', 'accountexpires', 'memberof'].includes(name)) {
      return 'security';
    }
    
    return 'other';
  }

  /**
   * Check if field contains sensitive data
   */
  private isSensitiveField(fieldName: string): boolean {
    const sensitiveFields = [
      'unicodePwd', 'userPassword', 'pwdLastSet', 'badPasswordTime',
      'employeeNumber', 'employeeID', 'socialSecurityNumber'
    ];
    
    return sensitiveFields.some(field => 
      fieldName.toLowerCase().includes(field.toLowerCase())
    );
  }

  /**
   * Get field aliases based on the LDAP attribute name
   */
  private getFieldAliases(fieldName: string): string[] | undefined {
    const aliasMap: Record<string, string[]> = {
      // Identity fields
      'sAMAccountName': ['username', 'samaccountname', 'accountName', 'loginName'],
      'userPrincipalName': ['upn', 'userprincipal', 'principalName'],
      'displayName': ['fullName', 'name', 'displayname'],
      'cn': ['commonName', 'commonname'],
      
      // Personal fields
      'givenName': ['firstName', 'fname', 'given', 'firstname'],
      'sn': ['lastName', 'surname', 'lname', 'familyName', 'lastname'],
      
      // Contact fields
      'mail': ['email', 'emailAddress', 'mailAddress'],
      'telephoneNumber': ['phone', 'phoneNumber', 'telephone'],
      'mobile': ['mobilePhone', 'cellPhone', 'cell'],
      'physicalDeliveryOfficeName': ['office', 'officeLocation', 'officeName'],
      
      // Organization fields
      'department': ['dept', 'departmentName'],
      'title': ['jobTitle', 'position'],
      'company': ['companyName', 'organization'],
      'manager': ['managerDN', 'supervisor'],
      'directReports': ['reports', 'subordinates'],
      'employeeID': ['employeeId', 'empId', 'employeeNumber'],
      
      // Additional common aliases
      'streetAddress': ['street', 'address'],
      'l': ['city', 'locality'],
      'st': ['state', 'stateOrProvince', 'province'],
      'postalCode': ['zipCode', 'zip'],
      'c': ['countryCode'],
      'co': ['country', 'countryName']
    };
    
    const aliases = aliasMap[fieldName];
    return aliases && aliases.length > 0 ? aliases : undefined;
  }
}

export const adSchemaDiscovery = new ADSchemaDiscoveryService();