import apiService from '@/services/api';
import { 
  ServiceCredential, 
  CreateCredentialDto, 
  UpdateCredentialDto, 
  TestCredentialResult,
  DefaultCredentials,
  ApiResponse 
} from '@/types';

class CredentialsApiService {
  private readonly basePath = '/credentials';
  private readonly api = apiService;

  /**
   * Get all credentials for the current user
   * @param serviceType Optional filter by service type
   */
  async getCredentials(serviceType?: 'ad' | 'azure' | 'o365'): Promise<ApiResponse<ServiceCredential[]>> {
    const params = serviceType ? { serviceType } : undefined;
    return await this.api.get<ServiceCredential[]>(this.basePath, params);
  }

  /**
   * Get a specific credential by ID
   * @param credentialId The credential ID
   */
  async getCredential(credentialId: number): Promise<ServiceCredential> {
    const response = await this.api.get<ServiceCredential>(`${this.basePath}/${credentialId}`);
    if (!(response as { data?: ServiceCredential[] }).data) {
      throw new Error('Credential not found');
    }
    return (response as { data: ServiceCredential[] }).data;
  }

  /**
   * Get default credentials for all service types
   */
  async getDefaultCredentials(): Promise<DefaultCredentials> {
    const response = await this.api.get<DefaultCredentials>(`${this.basePath}/defaults`);
    return (response as { data?: DefaultCredentials }).data || { ad: null, azure: null, o365: null };
  }

  /**
   * Create a new credential
   * @param credential The credential data
   */
  async createCredential(credential: CreateCredentialDto): Promise<ServiceCredential> {
    const response = await this.api.post<ServiceCredential>(this.basePath, credential);
    if (!(response as { data?: ServiceCredential[] }).data) {
      throw new Error('Failed to create credential');
    }
    return (response as { data: ServiceCredential[] }).data;
  }

  /**
   * Update an existing credential
   * @param credentialId The credential ID
   * @param updates The fields to update
   */
  async updateCredential(
    credentialId: number, 
    updates: UpdateCredentialDto
  ): Promise<ServiceCredential> {
    const response = await this.api.put<ServiceCredential>(
      `${this.basePath}/${credentialId}`, 
      updates
    );
    if (!(response as { data?: ServiceCredential[] }).data) {
      throw new Error('Failed to update credential');
    }
    return (response as { data: ServiceCredential[] }).data;
  }

  /**
   * Delete a credential
   * @param credentialId The credential ID
   */
  async deleteCredential(credentialId: number): Promise<void> {
    await this.api.delete(`${this.basePath}/${credentialId}`);
  }

  /**
   * Test a credential connection
   * @param credentialId The credential ID
   */
  async testCredential(credentialId: number): Promise<TestCredentialResult> {
    const response = await this.api.post<TestCredentialResult>(
      `${this.basePath}/${credentialId}/test`
    );
    if (!(response as { data?: ServiceCredential[] }).data) {
      throw new Error('Failed to test credential');
    }
    return (response as { data: ServiceCredential[] }).data;
  }

  /**
   * Set a credential as default for its service type
   * @param credentialId The credential ID
   */
  async setDefaultCredential(credentialId: number): Promise<void> {
    await this.api.put(`${this.basePath}/${credentialId}/set-default`);
  }

  /**
   * Validate credential fields before submission
   */
  validateCredential(credential: CreateCredentialDto): string[] {
    const errors: string[] = [];

    if (!credential.credentialName || credential.credentialName.trim() === '') {
      errors.push('Credential name is required');
    }

    switch (credential.serviceType) {
      case 'ad':
        if (!credential.username) {
          errors.push('Username is required for AD credentials');
        }
        if (!credential.password) {
          errors.push('Password is required for AD credentials');
        }
        break;

      case 'azure':
      case 'o365':
        if (!credential.tenantId) {
          errors.push('Tenant ID is required for Azure/O365 credentials');
        }
        if (!credential.clientId) {
          errors.push('Client ID is required for Azure/O365 credentials');
        }
        if (!credential.clientSecret) {
          errors.push('Client Secret is required for Azure/O365 credentials');
        }
        break;
    }

    return errors;
  }

  /**
   * Get credential type display name
   */
  getServiceTypeDisplayName(serviceType: 'ad' | 'azure' | 'o365'): string {
    const displayNames = {
      ad: 'Active Directory',
      azure: 'Azure Active Directory',
      o365: 'Office 365'
    };
    return displayNames[serviceType] || serviceType.toUpperCase();
  }

  /**
   * Get credential type description
   */
  getServiceTypeDescription(serviceType: 'ad' | 'azure' | 'o365'): string {
    const descriptions = {
      ad: 'On-premises Active Directory using LDAP',
      azure: 'Azure Active Directory (Microsoft Entra ID)',
      o365: 'Microsoft 365 and Office 365 services'
    };
    return descriptions[serviceType] || '';
  }

  /**
   * Check OAuth status for Azure AD
   */
  async getAzureOAuthUrl(credentialName: string): Promise<{ authUrl: string }> {
    const response = await this.api.get<{ authUrl: string }>(
      '/auth/azure/oauth/url', 
      { credentialName }
    );
    return (response as { data: TestCredentialResult }).data;
  }

  async checkOAuthStatus(): Promise<{
    hasToken: boolean;
    credentialName?: string;
    tenantId?: string;
    clientId?: string;
    hasRefreshToken?: boolean;
  }> {
    const response = await this.api.get<{
      hasToken: boolean;
      credentialName?: string;
      tenantId?: string;
      clientId?: string;
      hasRefreshToken?: boolean;
    }>('/auth/azure/oauth/status');
    return (response as { data: TestCredentialResult }).data;
  }

  /**
   * Get credential status info
   */
  getCredentialStatus(credential: ServiceCredential): {
    status: 'success' | 'error' | 'warning' | 'default';
    message: string;
  } {
    if (!credential.lastTested) {
      return {
        status: 'default',
        message: 'Not tested'
      };
    }

    const lastTestedDate = new Date(credential.lastTested);
    const daysSinceTest = Math.floor((Date.now() - lastTestedDate.getTime()) / (1000 * 60 * 60 * 24));

    if (credential.lastTestSuccess) {
      if (daysSinceTest > 30) {
        return {
          status: 'warning',
          message: `Last tested ${daysSinceTest} days ago`
        };
      }
      return {
        status: 'success',
        message: credential.lastTestMessage || 'Connection successful'
      };
    }

    return {
      status: 'error',
      message: credential.lastTestMessage || 'Connection failed'
    };
  }
}

// Export singleton instance
export const credentialsAPI = new CredentialsApiService();
export const credentialsApi = credentialsAPI;
export default credentialsAPI;