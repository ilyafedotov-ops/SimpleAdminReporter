import { db } from '@/config/database';
import { redis } from '@/config/redis';
// import { getLDAPClient } from '@/config/ldap';
// import { getAzureADClient } from '@/config/azure';
import { logger } from '@/utils/logger';

export interface FieldMetadata {
  source: 'ad' | 'azure' | 'o365';
  fieldName: string;
  displayName: string;
  dataType: 'string' | 'integer' | 'datetime' | 'boolean' | 'array' | 'reference' | 'decimal';
  category: string;
  description: string;
  isSearchable: boolean;
  isSortable: boolean;
  isExportable: boolean;
  isSensitive: boolean;
  sampleValues?: string[];
  validationRules?: any;
  aliases?: string[];  // Alternative names that can be used to reference this field
}

export interface FieldCategory {
  name: string;
  displayName: string;
  description: string;
  fields: FieldMetadata[];
}

export interface DataSourceSchema {
  source: 'ad' | 'azure' | 'o365';
  categories: FieldCategory[];
  totalFields: number;
  lastUpdated: Date;
  connectionStatus: boolean;
}

// Global initialization flag to prevent multiple instances from initializing
let globalInitialized = false;

export class FieldDiscoveryService {
  private cachePrefix = 'fields:';
  private cacheTTL = 3600; // 1 hour
  private schemaCacheTTL = 86400; // 24 hours
  private initialized = false;

  constructor() {
    // Field discovery will be initialized on first use, not during startup
  }

  private async ensureInitialized(): Promise<void> {
    if (!globalInitialized && !this.initialized) {
      globalInitialized = true;
      await this.initializeFieldMetadata();
      this.initialized = true;
    }
  }

  private async initializeFieldMetadata(): Promise<void> {
    try {
      // Check if field metadata exists in database
      const existingFields = await db.query('SELECT COUNT(*) as count FROM field_metadata');
      const fieldCount = parseInt(existingFields.rows[0].count);

      if (fieldCount === 0) {
        logger.info('No field metadata found, initializing from seed data...');
        // The seed data should already be loaded from database/seed.sql
        await this.updateFieldCache();
      } else {
        logger.info(`Found ${fieldCount} fields in metadata cache - skipping cache update to prevent loops`);
        // Don't update cache if we already have field metadata, this can cause loops
        // Cache will be updated on-demand when needed
      }
    } catch (error) {
      logger.error('Failed to initialize field metadata:', error);
    }
  }

  /**
   * Discover fields from Active Directory LDAP schema
   */
  async discoverADFields(serviceAccountDn?: string, serviceAccountPassword?: string): Promise<FieldMetadata[]> {
    const cacheKey = `${this.cachePrefix}ad:discovered`;
    
    try {
      // Check cache first
      const cached = await redis.getJson<FieldMetadata[]>(cacheKey);
      if (cached) {
        return cached;
      }

      // const __ldapClient = getLDAPClient();
      const fields: FieldMetadata[] = [];

      // Standard AD user fields with their properties
      const standardFields: Partial<FieldMetadata>[] = [
        // Basic Identity Fields
        { fieldName: 'sAMAccountName', displayName: 'Username', dataType: 'string', category: 'basic', description: 'Windows logon name', isSensitive: false, aliases: ['username', 'samaccountname', 'accountName', 'loginName'] },
        { fieldName: 'userPrincipalName', displayName: 'User Principal Name', dataType: 'string', category: 'basic', description: 'UPN for authentication', isSensitive: false, aliases: ['upn', 'userprincipal', 'principalName'] },
        { fieldName: 'displayName', displayName: 'Display Name', dataType: 'string', category: 'basic', description: 'Full display name', isSensitive: false, aliases: ['fullName', 'name', 'displayname'] },
        { fieldName: 'givenName', displayName: 'First Name', dataType: 'string', category: 'basic', description: 'Given name', isSensitive: false, aliases: ['firstName', 'fname', 'given', 'firstname'] },
        { fieldName: 'sn', displayName: 'Last Name', dataType: 'string', category: 'basic', description: 'Surname', isSensitive: false, aliases: ['lastName', 'surname', 'lname', 'familyName', 'lastname'] },
        { fieldName: 'cn', displayName: 'Common Name', dataType: 'string', category: 'basic', description: 'Common name', isSensitive: false, aliases: ['commonName', 'commonname'] },
        
        // Contact Information
        { fieldName: 'mail', displayName: 'Email Address', dataType: 'string', category: 'contact', description: 'Primary email address', isSensitive: true, aliases: ['email', 'emailAddress', 'mailAddress'] },
        { fieldName: 'telephoneNumber', displayName: 'Phone Number', dataType: 'string', category: 'contact', description: 'Primary phone number', isSensitive: true, aliases: ['phone', 'phoneNumber', 'telephone'] },
        { fieldName: 'mobile', displayName: 'Mobile Phone', dataType: 'string', category: 'contact', description: 'Mobile phone number', isSensitive: true, aliases: ['mobilePhone', 'cellPhone', 'cell'] },
        { fieldName: 'facsimileTelephoneNumber', displayName: 'Fax Number', dataType: 'string', category: 'contact', description: 'Fax number', isSensitive: true },
        { fieldName: 'homePhone', displayName: 'Home Phone', dataType: 'string', category: 'contact', description: 'Home phone number', isSensitive: true },
        
        // Organization Information
        { fieldName: 'department', displayName: 'Department', dataType: 'string', category: 'organization', description: 'Department name', isSensitive: false, aliases: ['dept', 'departmentName'] },
        { fieldName: 'title', displayName: 'Job Title', dataType: 'string', category: 'organization', description: 'Job title', isSensitive: false, aliases: ['jobTitle', 'position'] },
        { fieldName: 'company', displayName: 'Company', dataType: 'string', category: 'organization', description: 'Company name', isSensitive: false, aliases: ['companyName', 'organization'] },
        { fieldName: 'manager', displayName: 'Manager', dataType: 'reference', category: 'organization', description: 'Direct manager DN', isSensitive: false, aliases: ['managerDN', 'supervisor'] },
        { fieldName: 'directReports', displayName: 'Direct Reports', dataType: 'array', category: 'organization', description: 'Direct report DNs', isSensitive: false, aliases: ['reports', 'subordinates'] },
        { fieldName: 'physicalDeliveryOfficeName', displayName: 'Office', dataType: 'string', category: 'organization', description: 'Office location', isSensitive: false, aliases: ['office', 'officeLocation', 'officeName'] },
        { fieldName: 'employeeID', displayName: 'Employee ID', dataType: 'string', category: 'organization', description: 'Employee identifier', isSensitive: true, aliases: ['employeeId', 'empId', 'employeeNumber'] },
        { fieldName: 'employeeType', displayName: 'Employee Type', dataType: 'string', category: 'organization', description: 'Employee classification', isSensitive: false },
        
        // Security and Account Control
        { fieldName: 'userAccountControl', displayName: 'Account Control', dataType: 'integer', category: 'security', description: 'Account control flags', isSensitive: false, isSearchable: false },
        { fieldName: 'memberOf', displayName: 'Group Memberships', dataType: 'array', category: 'security', description: 'Security group memberships', isSensitive: false },
        { fieldName: 'primaryGroupID', displayName: 'Primary Group ID', dataType: 'integer', category: 'security', description: 'Primary group identifier', isSensitive: false },
        { fieldName: 'adminCount', displayName: 'Admin Count', dataType: 'integer', category: 'security', description: 'Administrative privilege indicator', isSensitive: false },
        
        // Authentication and Password
        { fieldName: 'lastLogonTimestamp', displayName: 'Last Logon', dataType: 'datetime', category: 'audit', description: 'Last successful logon timestamp', isSensitive: false, isSearchable: false },
        { fieldName: 'lastLogon', displayName: 'Last Logon (DC)', dataType: 'datetime', category: 'audit', description: 'Last logon on this DC', isSensitive: false, isSearchable: false },
        { fieldName: 'passwordLastSet', displayName: 'Password Last Set', dataType: 'datetime', category: 'security', description: 'When password was last changed', isSensitive: false, isSearchable: false },
        { fieldName: 'accountExpires', displayName: 'Account Expires', dataType: 'datetime', category: 'security', description: 'Account expiration date', isSensitive: false, isSearchable: false },
        { fieldName: 'pwdLastSet', displayName: 'Password Last Set (Precise)', dataType: 'datetime', category: 'security', description: 'Precise password last set time', isSensitive: false, isSearchable: false },
        { fieldName: 'badPwdCount', displayName: 'Bad Password Count', dataType: 'integer', category: 'security', description: 'Number of failed password attempts', isSensitive: false },
        { fieldName: 'badPasswordTime', displayName: 'Bad Password Time', dataType: 'datetime', category: 'security', description: 'Time of last bad password attempt', isSensitive: false },
        { fieldName: 'lockoutTime', displayName: 'Lockout Time', dataType: 'datetime', category: 'security', description: 'When account was locked out', isSensitive: false },
        { fieldName: 'logonCount', displayName: 'Logon Count', dataType: 'integer', category: 'audit', description: 'Number of successful logons', isSensitive: false },
        
        // Audit and Metadata
        { fieldName: 'whenCreated', displayName: 'Created Date', dataType: 'datetime', category: 'audit', description: 'When account was created', isSensitive: false, isSearchable: false },
        { fieldName: 'whenChanged', displayName: 'Modified Date', dataType: 'datetime', category: 'audit', description: 'When account was last modified', isSensitive: false, isSearchable: false },
        { fieldName: 'uSNCreated', displayName: 'USN Created', dataType: 'integer', category: 'audit', description: 'Update Sequence Number when created', isSensitive: false },
        { fieldName: 'uSNChanged', displayName: 'USN Changed', dataType: 'integer', category: 'audit', description: 'Update Sequence Number when changed', isSensitive: false },
        { fieldName: 'objectGUID', displayName: 'Object GUID', dataType: 'string', category: 'audit', description: 'Unique object identifier', isSensitive: false, isSearchable: false },
        { fieldName: 'objectSid', displayName: 'Object SID', dataType: 'string', category: 'audit', description: 'Security identifier', isSensitive: false, isSearchable: false },
        
        // Additional Attributes
        { fieldName: 'description', displayName: 'Description', dataType: 'string', category: 'basic', description: 'Account description', isSensitive: false },
        { fieldName: 'info', displayName: 'Notes', dataType: 'string', category: 'basic', description: 'Additional notes', isSensitive: false },
        { fieldName: 'wWWHomePage', displayName: 'Web Page', dataType: 'string', category: 'contact', description: 'Personal web page', isSensitive: false },
        { fieldName: 'streetAddress', displayName: 'Street Address', dataType: 'string', category: 'contact', description: 'Street address', isSensitive: true },
        { fieldName: 'l', displayName: 'City', dataType: 'string', category: 'contact', description: 'City/locality', isSensitive: false },
        { fieldName: 'st', displayName: 'State', dataType: 'string', category: 'contact', description: 'State/province', isSensitive: false },
        { fieldName: 'postalCode', displayName: 'Postal Code', dataType: 'string', category: 'contact', description: 'Postal/ZIP code', isSensitive: false },
        { fieldName: 'co', displayName: 'Country', dataType: 'string', category: 'contact', description: 'Country', isSensitive: false },
        
        // Advanced Security Attributes
        { fieldName: 'sAMAccountType', displayName: 'SAM Account Type', dataType: 'integer', category: 'security', description: 'Type of SAM account', isSensitive: false },
        { fieldName: 'nTSecurityDescriptor', displayName: 'NT Security Descriptor', dataType: 'string', category: 'security', description: 'Security descriptor in NT format', isSensitive: true, isSearchable: false },
        { fieldName: 'msDS-SupportedEncryptionTypes', displayName: 'Supported Encryption Types', dataType: 'integer', category: 'security', description: 'Kerberos encryption types supported', isSensitive: false },
        { fieldName: 'servicePrincipalName', displayName: 'Service Principal Name', dataType: 'array', category: 'security', description: 'SPN for Kerberos authentication', isSensitive: false },
        
        // System Attributes
        { fieldName: 'dSCorePropagationData', displayName: 'DS Core Propagation Data', dataType: 'datetime', category: 'audit', description: 'DS replication metadata', isSensitive: false, isSearchable: false },
        { fieldName: 'instanceType', displayName: 'Instance Type', dataType: 'integer', category: 'audit', description: 'Type of directory object instance', isSensitive: false },
        { fieldName: 'isCriticalSystemObject', displayName: 'Is Critical System Object', dataType: 'boolean', category: 'audit', description: 'Indicates if object is critical to system', isSensitive: false },
        { fieldName: 'isDeleted', displayName: 'Is Deleted', dataType: 'boolean', category: 'audit', description: 'Indicates if object is deleted', isSensitive: false },
        
        // Photo Attributes
        { fieldName: 'thumbnailPhoto', displayName: 'Thumbnail Photo', dataType: 'string', category: 'contact', description: 'User thumbnail photo', isSensitive: true, isSearchable: false },
        { fieldName: 'jpegPhoto', displayName: 'JPEG Photo', dataType: 'string', category: 'contact', description: 'User photo in JPEG format', isSensitive: true, isSearchable: false },
        
        // Extension Attributes
        { fieldName: 'extensionAttribute1', displayName: 'Extension Attribute 1', dataType: 'string', category: 'organization', description: 'Custom extension attribute 1', isSensitive: false },
        { fieldName: 'extensionAttribute2', displayName: 'Extension Attribute 2', dataType: 'string', category: 'organization', description: 'Custom extension attribute 2', isSensitive: false },
        { fieldName: 'extensionAttribute3', displayName: 'Extension Attribute 3', dataType: 'string', category: 'organization', description: 'Custom extension attribute 3', isSensitive: false },
        { fieldName: 'extensionAttribute4', displayName: 'Extension Attribute 4', dataType: 'string', category: 'organization', description: 'Custom extension attribute 4', isSensitive: false },
        { fieldName: 'extensionAttribute5', displayName: 'Extension Attribute 5', dataType: 'string', category: 'organization', description: 'Custom extension attribute 5', isSensitive: false },
        
        // Proxy Addresses
        { fieldName: 'proxyAddresses', displayName: 'Proxy Addresses', dataType: 'array', category: 'contact', description: 'Email proxy addresses', isSensitive: false },
        
        // Code Page
        { fieldName: 'codePage', displayName: 'Code Page', dataType: 'integer', category: 'audit', description: 'Character encoding code page', isSensitive: false }
      ];

      // Convert to full FieldMetadata objects
      standardFields.forEach(field => {
        fields.push({
          source: 'ad',
          fieldName: field.fieldName!,
          displayName: field.displayName!,
          dataType: field.dataType!,
          category: field.category!,
          description: field.description!,
          isSearchable: field.isSearchable !== false,
          isSortable: field.dataType !== 'array' && field.isSearchable !== false,
          isExportable: true,
          isSensitive: field.isSensitive || false,
          sampleValues: [],
          validationRules: null
        });
      });

      // Try to discover additional fields dynamically from AD schema
      try {
        logger.info('Attempting to discover additional AD fields dynamically...');
        const { adSchemaDiscovery } = await import('./adSchemaDiscovery.service');
        
        // Get dynamically discovered schema
        const schemaResult = await adSchemaDiscovery.discoverFullSchema(serviceAccountDn, serviceAccountPassword);
        
        // Convert discovered attributes to field metadata
        const additionalFields = await adSchemaDiscovery.convertToFieldMetadata(schemaResult.attributes);
        
        // Create a map of existing field names for deduplication
        const existingFieldNames = new Set(fields.map(f => f.fieldName.toLowerCase()));
        
        // Add discovered fields that aren't already in the standard list
        let addedCount = 0;
        for (const field of additionalFields) {
          if (!existingFieldNames.has(field.fieldName.toLowerCase())) {
            fields.push(field);
            addedCount++;
          }
        }
        
        logger.info(`Added ${addedCount} additional fields from AD schema discovery. Total: ${fields.length} fields`);
      } catch (discoverError) {
        logger.error('Failed to discover additional AD fields:', discoverError);
        // Continue with standard fields if discovery fails
      }

      // Cache the results
      await redis.setJson(cacheKey, fields, this.cacheTTL);
      
      logger.info(`Total discovered AD fields: ${fields.length}`);
      return fields;

    } catch (error) {
      logger.error('Failed to discover AD fields:', error);
      
      // Return basic fields if discovery fails
      return this.getBasicADFields();
    }
  }

  /**
   * Discover fields from Azure AD using Graph API schema
   */
  async discoverAzureFields(): Promise<FieldMetadata[]> {
    const cacheKey = `${this.cachePrefix}azure:discovered`;
    
    try {
      // Check cache first
      const cached = await redis.getJson<FieldMetadata[]>(cacheKey);
      if (cached) {
        return cached;
      }

      // const __azureClient = getAzureADClient();
      const fields: FieldMetadata[] = [];

      // Standard Azure AD user fields
      const standardFields: Partial<FieldMetadata>[] = [
        // Basic Identity
        { fieldName: 'id', displayName: 'Object ID', dataType: 'string', category: 'basic', description: 'Unique object identifier', isSensitive: false, isSearchable: false },
        { fieldName: 'userPrincipalName', displayName: 'User Principal Name', dataType: 'string', category: 'basic', description: 'UPN for authentication', isSensitive: false },
        { fieldName: 'displayName', displayName: 'Display Name', dataType: 'string', category: 'basic', description: 'Display name', isSensitive: false },
        { fieldName: 'givenName', displayName: 'First Name', dataType: 'string', category: 'basic', description: 'Given name', isSensitive: false },
        { fieldName: 'surname', displayName: 'Last Name', dataType: 'string', category: 'basic', description: 'Surname', isSensitive: false },
        { fieldName: 'mail', displayName: 'Email', dataType: 'string', category: 'basic', description: 'Primary email address', isSensitive: true },
        { fieldName: 'mailNickname', displayName: 'Mail Nickname', dataType: 'string', category: 'basic', description: 'Email alias', isSensitive: false },
        { fieldName: 'userType', displayName: 'User Type', dataType: 'string', category: 'basic', description: 'Member or Guest', isSensitive: false },
        
        // Account Status
        { fieldName: 'accountEnabled', displayName: 'Account Enabled', dataType: 'boolean', category: 'security', description: 'Whether account is enabled', isSensitive: false },
        { fieldName: 'createdDateTime', displayName: 'Created Date', dataType: 'datetime', category: 'audit', description: 'Account creation date', isSensitive: false, isSearchable: false },
        { fieldName: 'deletedDateTime', displayName: 'Deleted Date', dataType: 'datetime', category: 'audit', description: 'Account deletion date', isSensitive: false, isSearchable: false },
        { fieldName: 'lastSignInDateTime', displayName: 'Last Sign In', dataType: 'datetime', category: 'audit', description: 'Last successful sign-in', isSensitive: false, isSearchable: false },
        { fieldName: 'signInActivity', displayName: 'Sign In Activity', dataType: 'string', category: 'audit', description: 'Sign-in activity summary', isSensitive: false, isSearchable: false },
        
        // Organization
        { fieldName: 'jobTitle', displayName: 'Job Title', dataType: 'string', category: 'organization', description: 'Job title', isSensitive: false },
        { fieldName: 'department', displayName: 'Department', dataType: 'string', category: 'organization', description: 'Department', isSensitive: false },
        { fieldName: 'companyName', displayName: 'Company', dataType: 'string', category: 'organization', description: 'Company name', isSensitive: false },
        { fieldName: 'officeLocation', displayName: 'Office Location', dataType: 'string', category: 'organization', description: 'Office location', isSensitive: false },
        { fieldName: 'employeeId', displayName: 'Employee ID', dataType: 'string', category: 'organization', description: 'Employee identifier', isSensitive: true },
        { fieldName: 'employeeType', displayName: 'Employee Type', dataType: 'string', category: 'organization', description: 'Employee classification', isSensitive: false },
        { fieldName: 'manager', displayName: 'Manager', dataType: 'reference', category: 'organization', description: 'Manager reference', isSensitive: false },
        
        // Contact Information
        { fieldName: 'businessPhones', displayName: 'Business Phones', dataType: 'array', category: 'contact', description: 'Business phone numbers', isSensitive: true },
        { fieldName: 'mobilePhone', displayName: 'Mobile Phone', dataType: 'string', category: 'contact', description: 'Mobile phone number', isSensitive: true },
        { fieldName: 'faxNumber', displayName: 'Fax Number', dataType: 'string', category: 'contact', description: 'Fax number', isSensitive: true },
        { fieldName: 'streetAddress', displayName: 'Street Address', dataType: 'string', category: 'contact', description: 'Street address', isSensitive: true },
        { fieldName: 'city', displayName: 'City', dataType: 'string', category: 'contact', description: 'City', isSensitive: false },
        { fieldName: 'state', displayName: 'State', dataType: 'string', category: 'contact', description: 'State/province', isSensitive: false },
        { fieldName: 'postalCode', displayName: 'Postal Code', dataType: 'string', category: 'contact', description: 'Postal code', isSensitive: false },
        { fieldName: 'country', displayName: 'Country', dataType: 'string', category: 'contact', description: 'Country', isSensitive: false },
        
        // Licensing and Usage
        { fieldName: 'assignedLicenses', displayName: 'Assigned Licenses', dataType: 'array', category: 'licenses', description: 'License assignments', isSensitive: false },
        { fieldName: 'usageLocation', displayName: 'Usage Location', dataType: 'string', category: 'basic', description: 'Country for license assignment', isSensitive: false },
        { fieldName: 'assignedPlans', displayName: 'Assigned Plans', dataType: 'array', category: 'licenses', description: 'Service plan assignments', isSensitive: false },
        { fieldName: 'provisionedPlans', displayName: 'Provisioned Plans', dataType: 'array', category: 'licenses', description: 'Provisioned service plans', isSensitive: false },
        
        // Identity Protection
        { fieldName: 'riskLevel', displayName: 'Risk Level', dataType: 'string', category: 'security', description: 'Identity protection risk level', isSensitive: false },
        { fieldName: 'riskState', displayName: 'Risk State', dataType: 'string', category: 'security', description: 'Identity protection risk state', isSensitive: false },
        { fieldName: 'riskDetail', displayName: 'Risk Detail', dataType: 'string', category: 'security', description: 'Risk detail information', isSensitive: false },
        
        // Additional Attributes
        { fieldName: 'aboutMe', displayName: 'About Me', dataType: 'string', category: 'basic', description: 'About me description', isSensitive: false },
        { fieldName: 'birthday', displayName: 'Birthday', dataType: 'datetime', category: 'personal', description: 'Birthday', isSensitive: true, isSearchable: false },
        { fieldName: 'interests', displayName: 'Interests', dataType: 'array', category: 'personal', description: 'Personal interests', isSensitive: false },
        { fieldName: 'responsibilities', displayName: 'Responsibilities', dataType: 'array', category: 'organization', description: 'Job responsibilities', isSensitive: false },
        { fieldName: 'skills', displayName: 'Skills', dataType: 'array', category: 'organization', description: 'Professional skills', isSensitive: false },
        { fieldName: 'schools', displayName: 'Schools', dataType: 'array', category: 'personal', description: 'Education history', isSensitive: false },
        { fieldName: 'proxyAddresses', displayName: 'Proxy Addresses', dataType: 'array', category: 'contact', description: 'Email proxy addresses', isSensitive: true }
      ];

      // Convert to full FieldMetadata objects
      standardFields.forEach(field => {
        fields.push({
          source: 'azure',
          fieldName: field.fieldName!,
          displayName: field.displayName!,
          dataType: field.dataType!,
          category: field.category!,
          description: field.description!,
          isSearchable: field.isSearchable !== false,
          isSortable: field.dataType !== 'array' && field.isSearchable !== false,
          isExportable: true,
          isSensitive: field.isSensitive || false,
          sampleValues: [],
          validationRules: null
        });
      });

      // Cache the results
      await redis.setJson(cacheKey, fields, this.cacheTTL);
      
      logger.info(`Discovered ${fields.length} Azure AD fields`);
      return fields;

    } catch (error) {
      logger.error('Failed to discover Azure AD fields:', error);
      
      // Return basic fields if discovery fails
      return this.getBasicAzureFields();
    }
  }

  /**
   * Discover fields from O365 reports
   */
  async discoverO365Fields(): Promise<FieldMetadata[]> {
    const cacheKey = `${this.cachePrefix}o365:discovered`;
    
    try {
      // Check cache first
      const cached = await redis.getJson<FieldMetadata[]>(cacheKey);
      if (cached) {
        return cached;
      }

      const fields: FieldMetadata[] = [];

      // O365 Report fields based on available Graph API reports
      const reportFields: Partial<FieldMetadata>[] = [
        // Mailbox Usage Fields
        { fieldName: 'userPrincipalName', displayName: 'User Principal Name', dataType: 'string', category: 'basic', description: 'User principal name', isSensitive: false },
        { fieldName: 'displayName', displayName: 'Display Name', dataType: 'string', category: 'basic', description: 'Display name', isSensitive: false },
        { fieldName: 'storageUsedInBytes', displayName: 'Storage Used', dataType: 'integer', category: 'storage', description: 'Storage used in bytes', isSensitive: false, isSearchable: false },
        { fieldName: 'storageAllocatedInBytes', displayName: 'Storage Allocated', dataType: 'integer', category: 'storage', description: 'Storage allocated in bytes', isSensitive: false, isSearchable: false },
        { fieldName: 'itemCount', displayName: 'Item Count', dataType: 'integer', category: 'mailbox', description: 'Number of items in mailbox', isSensitive: false, isSearchable: false },
        { fieldName: 'deletedItemCount', displayName: 'Deleted Item Count', dataType: 'integer', category: 'mailbox', description: 'Number of deleted items', isSensitive: false, isSearchable: false },
        { fieldName: 'deletedItemSizeInBytes', displayName: 'Deleted Item Size', dataType: 'integer', category: 'mailbox', description: 'Size of deleted items in bytes', isSensitive: false, isSearchable: false },
        { fieldName: 'quotaUsedPercentage', displayName: 'Quota Used %', dataType: 'decimal', category: 'storage', description: 'Percentage of quota used', isSensitive: false, isSearchable: false },
        
        // Email Activity Fields
        { fieldName: 'sendCount', displayName: 'Emails Sent', dataType: 'integer', category: 'activity', description: 'Number of emails sent', isSensitive: false, isSearchable: false },
        { fieldName: 'receiveCount', displayName: 'Emails Received', dataType: 'integer', category: 'activity', description: 'Number of emails received', isSensitive: false, isSearchable: false },
        { fieldName: 'readCount', displayName: 'Emails Read', dataType: 'integer', category: 'activity', description: 'Number of emails read', isSensitive: false, isSearchable: false },
        { fieldName: 'lastActivityDate', displayName: 'Last Activity', dataType: 'datetime', category: 'activity', description: 'Last activity date', isSensitive: false, isSearchable: false },
        
        // Teams Activity Fields
        { fieldName: 'teamChatMessageCount', displayName: 'Teams Chat Messages', dataType: 'integer', category: 'teams', description: 'Teams chat messages sent', isSensitive: false, isSearchable: false },
        { fieldName: 'privateChatMessageCount', displayName: 'Private Chat Messages', dataType: 'integer', category: 'teams', description: 'Private chat messages sent', isSensitive: false, isSearchable: false },
        { fieldName: 'meetingCount', displayName: 'Meetings Attended', dataType: 'integer', category: 'teams', description: 'Number of meetings attended', isSensitive: false, isSearchable: false },
        { fieldName: 'callCount', displayName: 'Calls Made', dataType: 'integer', category: 'teams', description: 'Number of calls made', isSensitive: false, isSearchable: false },
        { fieldName: 'urgentMessages', displayName: 'Urgent Messages', dataType: 'integer', category: 'teams', description: 'Number of urgent messages sent', isSensitive: false, isSearchable: false },
        { fieldName: 'audioMinutes', displayName: 'Audio Minutes', dataType: 'integer', category: 'teams', description: 'Minutes of audio calls', isSensitive: false, isSearchable: false },
        { fieldName: 'videoMinutes', displayName: 'Video Minutes', dataType: 'integer', category: 'teams', description: 'Minutes of video calls', isSensitive: false, isSearchable: false },
        { fieldName: 'screenShareCount', displayName: 'Screen Shares', dataType: 'integer', category: 'teams', description: 'Number of screen shares', isSensitive: false, isSearchable: false },
        
        // OneDrive Usage Fields
        { fieldName: 'ownerPrincipalName', displayName: 'Owner Principal Name', dataType: 'string', category: 'basic', description: 'OneDrive owner UPN', isSensitive: false },
        { fieldName: 'ownerDisplayName', displayName: 'Owner Display Name', dataType: 'string', category: 'basic', description: 'OneDrive owner display name', isSensitive: false },
        { fieldName: 'fileCount', displayName: 'File Count', dataType: 'integer', category: 'sharepoint', description: 'Number of files', isSensitive: false, isSearchable: false },
        { fieldName: 'activeFileCount', displayName: 'Active File Count', dataType: 'integer', category: 'sharepoint', description: 'Number of active files', isSensitive: false, isSearchable: false },
        { fieldName: 'storageQuotaInBytes', displayName: 'Storage Quota', dataType: 'integer', category: 'storage', description: 'Storage quota in bytes', isSensitive: false, isSearchable: false },
        
        // SharePoint Usage Fields
        { fieldName: 'siteUrl', displayName: 'Site URL', dataType: 'string', category: 'sharepoint', description: 'SharePoint site URL', isSensitive: false },
        { fieldName: 'siteType', displayName: 'Site Type', dataType: 'string', category: 'sharepoint', description: 'Type of SharePoint site', isSensitive: false },
        { fieldName: 'pageViewCount', displayName: 'Page Views', dataType: 'integer', category: 'sharepoint', description: 'Number of page views', isSensitive: false, isSearchable: false },
        { fieldName: 'visitedPageCount', displayName: 'Pages Visited', dataType: 'integer', category: 'sharepoint', description: 'Number of unique pages visited', isSensitive: false, isSearchable: false },
        { fieldName: 'uniqueVisitorCount', displayName: 'Unique Visitors', dataType: 'integer', category: 'sharepoint', description: 'Number of unique visitors', isSensitive: false, isSearchable: false },
        
        // Yammer Activity Fields
        { fieldName: 'messageCount', displayName: 'Messages Posted', dataType: 'integer', category: 'yammer', description: 'Number of Yammer messages posted', isSensitive: false, isSearchable: false },
        { fieldName: 'replyCount', displayName: 'Replies Posted', dataType: 'integer', category: 'yammer', description: 'Number of replies posted', isSensitive: false, isSearchable: false },
        { fieldName: 'likedCount', displayName: 'Messages Liked', dataType: 'integer', category: 'yammer', description: 'Number of messages liked', isSensitive: false, isSearchable: false },
        { fieldName: 'readCount', displayName: 'Messages Read', dataType: 'integer', category: 'yammer', description: 'Number of messages read', isSensitive: false, isSearchable: false },
        
        // Skype for Business Fields
        { fieldName: 'peerToPeerSessionCount', displayName: 'P2P Sessions', dataType: 'integer', category: 'skype', description: 'Peer-to-peer sessions', isSensitive: false, isSearchable: false },
        { fieldName: 'organizedConferenceCount', displayName: 'Conferences Organized', dataType: 'integer', category: 'skype', description: 'Conferences organized', isSensitive: false, isSearchable: false },
        { fieldName: 'participatedConferenceCount', displayName: 'Conferences Participated', dataType: 'integer', category: 'skype', description: 'Conferences participated in', isSensitive: false, isSearchable: false },
        
        // Report Metadata
        { fieldName: 'reportRefreshDate', displayName: 'Report Refresh Date', dataType: 'datetime', category: 'metadata', description: 'When report data was last refreshed', isSensitive: false, isSearchable: false },
        { fieldName: 'reportPeriod', displayName: 'Report Period', dataType: 'string', category: 'metadata', description: 'Report time period', isSensitive: false, isSearchable: false },
        { fieldName: 'isDeleted', displayName: 'Is Deleted', dataType: 'boolean', category: 'metadata', description: 'Whether the item is deleted', isSensitive: false }
      ];

      // Convert to full FieldMetadata objects
      reportFields.forEach(field => {
        fields.push({
          source: 'o365',
          fieldName: field.fieldName!,
          displayName: field.displayName!,
          dataType: field.dataType!,
          category: field.category!,
          description: field.description!,
          isSearchable: field.isSearchable !== false,
          isSortable: field.dataType !== 'array' && field.isSearchable !== false,
          isExportable: true,
          isSensitive: field.isSensitive || false,
          sampleValues: [],
          validationRules: null
        });
      });

      // Cache the results
      await redis.setJson(cacheKey, fields, this.cacheTTL);
      
      logger.info(`Discovered ${fields.length} O365 fields`);
      return fields;

    } catch (error) {
      logger.error('Failed to discover O365 fields:', error);
      
      // Return basic fields if discovery fails
      return this.getBasicO365Fields();
    }
  }

  private getBasicADFields(): FieldMetadata[] {
    return [
      { source: 'ad', fieldName: 'sAMAccountName', displayName: 'Username', dataType: 'string', category: 'basic', description: 'Windows logon name', isSearchable: true, isSortable: true, isExportable: true, isSensitive: false },
      { source: 'ad', fieldName: 'displayName', displayName: 'Display Name', dataType: 'string', category: 'basic', description: 'Full display name', isSearchable: true, isSortable: true, isExportable: true, isSensitive: false },
      { source: 'ad', fieldName: 'mail', displayName: 'Email', dataType: 'string', category: 'basic', description: 'Email address', isSearchable: true, isSortable: true, isExportable: true, isSensitive: true }
    ];
  }

  private getBasicAzureFields(): FieldMetadata[] {
    return [
      { source: 'azure', fieldName: 'userPrincipalName', displayName: 'User Principal Name', dataType: 'string', category: 'basic', description: 'UPN', isSearchable: true, isSortable: true, isExportable: true, isSensitive: false },
      { source: 'azure', fieldName: 'displayName', displayName: 'Display Name', dataType: 'string', category: 'basic', description: 'Display name', isSearchable: true, isSortable: true, isExportable: true, isSensitive: false },
      { source: 'azure', fieldName: 'mail', displayName: 'Email', dataType: 'string', category: 'basic', description: 'Email address', isSearchable: true, isSortable: true, isExportable: true, isSensitive: true }
    ];
  }

  private getBasicO365Fields(): FieldMetadata[] {
    return [
      { source: 'o365', fieldName: 'userPrincipalName', displayName: 'User Principal Name', dataType: 'string', category: 'basic', description: 'UPN', isSearchable: true, isSortable: true, isExportable: true, isSensitive: false },
      { source: 'o365', fieldName: 'displayName', displayName: 'Display Name', dataType: 'string', category: 'basic', description: 'Display name', isSearchable: true, isSortable: true, isExportable: true, isSensitive: false },
      { source: 'o365', fieldName: 'storageUsedInBytes', displayName: 'Storage Used', dataType: 'integer', category: 'storage', description: 'Storage used', isSearchable: false, isSortable: true, isExportable: true, isSensitive: false }
    ];
  }

  /**
   * Get all fields for a specific data source
   */
  async getFieldsForSource(source: 'ad' | 'azure' | 'o365', serviceAccountDn?: string, serviceAccountPassword?: string): Promise<FieldMetadata[]> {
    await this.ensureInitialized();
    
    try {
      // For AD, always use our hardcoded fields to ensure we have the latest 63 fields
      // This bypasses the database cache that only has 44 fields
      if (source === 'ad') {
        const adFields = await this.discoverADFields(serviceAccountDn, serviceAccountPassword);
        // Cache the results for performance
        const cacheKey = `${this.cachePrefix}${source}:all`;
        await redis.setJson(cacheKey, adFields, this.cacheTTL);
        return adFields;
      }
      
      // For other sources, use cache and database as normal
      const cacheKey = `${this.cachePrefix}${source}:all`;
      const cached = await redis.getJson<FieldMetadata[]>(cacheKey);
      if (cached) {
        return cached;
      }

      // Get from database
      const result = await db.query(
        'SELECT * FROM field_metadata WHERE source = $1 ORDER BY category, display_name',
        [source]
      );

      const fields: FieldMetadata[] = result.rows.map((row: any) => ({
        source: row.source,
        fieldName: row.field_name,
        displayName: row.display_name,
        dataType: row.data_type,
        category: row.category,
        description: row.description,
        isSearchable: row.is_searchable,
        isSortable: row.is_sortable,
        isExportable: row.is_exportable,
        isSensitive: row.is_sensitive,
        sampleValues: row.sample_values || [],
        validationRules: row.validation_rules
      }));

      // If no fields in database, discover them
      if (fields.length === 0) {
        // Note: AD is handled above, so this only applies to azure and o365
        if (source === 'azure') {
          return await this.discoverAzureFields();
        } else if (source === 'o365') {
          return await this.discoverO365Fields();
        }
      }

      // Cache the results
      await redis.setJson(cacheKey, fields, this.cacheTTL);
      
      return fields;

    } catch (error) {
      logger.error(`Failed to get fields for source ${source}:`, error);
      
      // Return basic fields as fallback
      switch (source) {
        case 'ad':
          return this.getBasicADFields();
        case 'azure':
          return this.getBasicAzureFields();
        case 'o365':
          return this.getBasicO365Fields();
        default:
          return [];
      }
    }
  }

  /**
   * Get fields organized by categories for a data source
   */
  async getFieldsByCategory(source: 'ad' | 'azure' | 'o365', serviceAccountDn?: string, serviceAccountPassword?: string): Promise<FieldCategory[]> {
    try {
      const fields = await this.getFieldsForSource(source, serviceAccountDn, serviceAccountPassword);
      const categories: { [key: string]: FieldCategory } = {};

      fields.forEach(field => {
        if (!categories[field.category]) {
          categories[field.category] = {
            name: field.category,
            displayName: this.getCategoryDisplayName(field.category),
            description: this.getCategoryDescription(field.category),
            fields: []
          };
        }
        categories[field.category].fields.push(field);
      });

      return Object.values(categories);
    } catch (error) {
      logger.error(`Failed to get fields by category for ${source}:`, error);
      return [];
    }
  }

  private getCategoryDisplayName(category: string): string {
    const categoryNames: { [key: string]: string } = {
      basic: 'Basic Information',
      contact: 'Contact Information',
      organization: 'Organization',
      security: 'Security & Access',
      audit: 'Audit & Tracking',
      licenses: 'Licenses & Plans',
      activity: 'Activity & Usage',
      storage: 'Storage & Quota',
      mailbox: 'Mailbox Statistics',
      teams: 'Microsoft Teams',
      sharepoint: 'SharePoint',
      yammer: 'Yammer',
      skype: 'Skype for Business',
      metadata: 'Report Metadata',
      personal: 'Personal Information'
    };
    return categoryNames[category] || category.charAt(0).toUpperCase() + category.slice(1);
  }

  private getCategoryDescription(category: string): string {
    const categoryDescriptions: { [key: string]: string } = {
      basic: 'Core user identity and basic information',
      contact: 'Phone numbers, addresses, and contact details',
      organization: 'Job titles, departments, and organizational hierarchy',
      security: 'Security settings, group memberships, and access control',
      audit: 'Tracking information, timestamps, and audit trails',
      licenses: 'License assignments and service plans',
      activity: 'User activity and engagement metrics',
      storage: 'Storage usage and quotas',
      mailbox: 'Email and mailbox statistics',
      teams: 'Microsoft Teams activity and usage',
      sharepoint: 'SharePoint and OneDrive usage',
      yammer: 'Yammer social activity',
      skype: 'Skype for Business usage',
      metadata: 'Report generation and refresh information',
      personal: 'Personal details and preferences'
    };
    return categoryDescriptions[category] || `Fields related to ${category}`;
  }

  /**
   * Update field metadata cache from database
   */
  async updateFieldCache(): Promise<void> {
    try {
      logger.info('Updating field metadata cache...');
      
      const sources: ('ad' | 'azure' | 'o365')[] = ['ad', 'azure', 'o365'];
      
      for (const source of sources) {
        // Clear existing cache
        await redis.del(`${this.cachePrefix}${source}:all`);
        await redis.del(`${this.cachePrefix}${source}:discovered`);
        
        // Load fresh data
        await this.getFieldsForSource(source);
      }
      
      logger.info('Field metadata cache updated successfully');
    } catch (error) {
      logger.error('Failed to update field cache:', error);
    }
  }

  /**
   * Search fields across all sources
   */
  async searchFields(query: string, sources?: ('ad' | 'azure' | 'o365')[]): Promise<FieldMetadata[]> {
    await this.ensureInitialized();
    
    try {
      const searchSources = sources || ['ad', 'azure', 'o365'];
      const allFields: FieldMetadata[] = [];
      
      for (const source of searchSources) {
        const fields = await this.getFieldsForSource(source);
        allFields.push(...fields);
      }
      
      const queryLower = query.toLowerCase();
      
      return allFields.filter(field => 
        field.fieldName.toLowerCase().includes(queryLower) ||
        field.displayName.toLowerCase().includes(queryLower) ||
        field.description.toLowerCase().includes(queryLower) ||
        field.category.toLowerCase().includes(queryLower)
      );
    } catch (error) {
      logger.error('Field search failed:', error);
      return [];
    }
  }

  /**
   * Get schema summary for all data sources
   */
  async getDataSourceSchemas(): Promise<DataSourceSchema[]> {
    try {
      const sources: ('ad' | 'azure' | 'o365')[] = ['ad', 'azure', 'o365'];
      const schemas: DataSourceSchema[] = [];
      
      for (const source of sources) {
        const categories = await this.getFieldsByCategory(source);
        const totalFields = categories.reduce((sum, cat) => sum + cat.fields.length, 0);
        
        // Get connection status (would be from actual service status)
        const connectionStatus = true; // Placeholder
        
        schemas.push({
          source,
          categories,
          totalFields,
          lastUpdated: new Date(),
          connectionStatus
        });
      }
      
      return schemas;
    } catch (error) {
      logger.error('Failed to get data source schemas:', error);
      return [];
    }
  }
}

// Export singleton instance
export const fieldDiscoveryService = new FieldDiscoveryService();