/**
 * LDAP Health Checker
 * Implements health checks for Active Directory LDAP connection
 * Only checks port connectivity, not LDAP protocol
 */

import * as net from 'net';
import { BaseHealthChecker } from '../base-health-checker';
import { HealthCheckResult, HealthCheckContext } from '../types';
import { logger } from '@/utils/logger';

export class LDAPHealthChecker extends BaseHealthChecker {
  constructor() {
    super('ldap');
  }

  private async checkTcpPort(host: string, port: number, timeout: number = 5000): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      
      socket.setTimeout(timeout);
      
      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });
      
      socket.on('error', (err) => {
        logger.debug(`TCP port check failed for ${host}:${port}:`, err.message);
        resolve(false);
      });
      
      socket.on('timeout', () => {
        socket.destroy();
        logger.debug(`TCP port check timed out for ${host}:${port}`);
        resolve(false);
      });
      
      socket.connect(port, host);
    });
  }

  protected async performCheck(context: HealthCheckContext): Promise<HealthCheckResult> {
    // Check if LDAP environment variables exist
    const server = process.env.AD_SERVER;
    const baseDN = process.env.AD_BASE_DN;
    const username = process.env.AD_USERNAME;
    const password = process.env.AD_PASSWORD;
    
    // If no environment variables at all, service is not configured
    if (!server || !baseDN || !username || !password) {
      return this.createNotConfiguredResult();
    }
    
    // Check if using placeholder values - treat as not configured
    if (server === 'placeholder' || server === 'dc.example.com' ||
        baseDN === 'DC=example,DC=com' ||
        username === 'placeholder' ||
        password === 'placeholder' ||
        server.toLowerCase().includes('placeholder') ||
        server.toLowerCase().includes('example.com')) {
      return {
        status: 'healthy',
        message: 'LDAP/AD not configured (using placeholder credentials)',
        responseTime: Date.now() - context.startTime,
        details: {
          configured: false,
          placeholder: true,
          reason: 'Service not in use - placeholder credentials detected'
        }
      };
    }

    try {
      // Determine LDAP port based on LDAPS setting
      const useLDAPS = process.env.AD_USE_LDAPS === 'true';
      const port = useLDAPS ? 636 : 389;
      
      logger.debug(`LDAP health check: Testing TCP connection to ${server}:${port}`);
      
      // Simple TCP port check
      const isPortOpen = await this.checkTcpPort(server, port, 5000);
      
      if (isPortOpen) {
        return this.createHealthyResult(
          Date.now() - context.startTime,
          {
            server: server,
            port: port,
            protocol: useLDAPS ? 'LDAPS' : 'LDAP',
            status: 'Port is open and accepting connections'
          }
        );
      } else {
        return this.createUnhealthyResult(
          `LDAP server port ${port} is not reachable`,
          Date.now() - context.startTime
        );
      }
    } catch (error: any) {
      logger.error('LDAP health check error:', error);
      return this.handleError(error, context);
    }
  }
}