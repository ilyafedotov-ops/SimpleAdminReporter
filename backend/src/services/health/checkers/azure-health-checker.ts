/**
 * Azure AD Health Checker
 * Implements health checks for Azure Active Directory connection
 */

import { getAzureADClient } from '@/config/azure';
import { BaseHealthChecker } from '../base-health-checker';
import { HealthCheckResult, HealthCheckContext } from '../types';
import { logger } from '@/utils/logger';

export class AzureHealthChecker extends BaseHealthChecker {
  constructor() {
    super('azure');
  }

  protected async performCheck(context: HealthCheckContext): Promise<HealthCheckResult> {
    // Check if Azure AD environment variables exist
    const tenantId = process.env.AZURE_TENANT_ID;
    const clientId = process.env.AZURE_CLIENT_ID;
    const clientSecret = process.env.AZURE_CLIENT_SECRET;
    
    // If no environment variables at all, service is not configured
    if (!tenantId || !clientId || !clientSecret) {
      return this.createNotConfiguredResult();
    }
    
    // Check if using placeholder values - treat as not configured
    if (tenantId === 'placeholder-tenant-id' ||
        clientId === 'placeholder-client-id' ||
        clientSecret === 'placeholder-client-secret' ||
        tenantId === 'placeholder' ||
        tenantId.toLowerCase().includes('placeholder') ||
        clientId.toLowerCase().includes('placeholder')) {
      return {
        status: 'healthy',
        message: 'Azure AD not configured (using placeholder credentials)',
        responseTime: Date.now() - context.startTime,
        details: {
          configured: false,
          placeholder: true,
          reason: 'Service not in use - placeholder credentials detected'
        }
      };
    }

    try {
      const client = getAzureADClient();
      
      // This should not happen if we have real credentials
      if (!client) {
        return this.createUnhealthyResult(
          'Azure AD client could not be initialized',
          Date.now() - context.startTime
        );
      }
      
      // Test actual connection
      const connected = await client.testConnection();
      
      if (!connected) {
        return this.createDegradedResult(
          'Azure AD service not responding',
          Date.now() - context.startTime
        );
      }
      
      return this.createHealthyResult(
        Date.now() - context.startTime,
        {
          tenantId: process.env.AZURE_TENANT_ID,
          connected: true
        }
      );
    } catch (error: any) {
      // Only log non-network errors
      if (!['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT'].includes(error.code)) {
        logger.error('Azure AD health check error:', error);
      } else {
        logger.debug('Azure AD health check network error:', error.code);
      }
      
      // Handle specific network errors
      if (error.code === 'ECONNRESET') {
        return this.createUnhealthyResult(
          'Azure AD connection reset - network issue',
          Date.now() - context.startTime
        );
      } else if (error.code === 'ECONNREFUSED') {
        return this.createUnhealthyResult(
          'Azure AD connection refused',
          Date.now() - context.startTime
        );
      } else if (error.code === 'ETIMEDOUT') {
        return this.createUnhealthyResult(
          'Azure AD connection timeout',
          Date.now() - context.startTime
        );
      } else if (error.errorCode === 'invalid_request' && error.errorNo === 900023) {
        return this.createUnhealthyResult(
          'Azure AD configuration invalid - check tenant ID',
          Date.now() - context.startTime
        );
      }
      
      return this.handleError(error, context);
    }
  }
}