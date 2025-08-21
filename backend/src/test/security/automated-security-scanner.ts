/**
 * Automated Security Testing Framework
 * 
 * Comprehensive automated security scanner that can be run in CI/CD pipelines
 * or as standalone security assessments for the AD/Azure AD/O365 reporting application.
 */

import { describe, test, expect } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '@/app';
import { db } from '@/config/database';
import { logger } from '@/utils/logger';
import fs from 'fs';
import path from 'path';

interface SecurityScanResult {
  testSuite: string;
  testName: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  status: 'pass' | 'fail' | 'warning';
  description: string;
  details?: any;
  recommendation?: string;
  timestamp: Date;
}

interface ScanConfiguration {
  endpoints: string[];
  payloads: {
    sql: string[];
    xss: string[];
    ldap: string[];
    command: string[];
  };
  headers: Record<string, string>;
  cookies: Record<string, string>;
  timeouts: {
    request: number;
    scan: number;
  };
  reporting: {
    format: 'json' | 'html' | 'csv';
    outputPath: string;
    includeSuccesses: boolean;
  };
}

class AutomatedSecurityScanner {
  private results: SecurityScanResult[] = [];
  private config: ScanConfiguration;
  private testToken: string = '';
  private adminToken: string = '';

  constructor(config?: Partial<ScanConfiguration>) {
    this.config = {
      endpoints: [
        '/api/auth/login',
        '/api/reports',
        '/api/search',
        '/api/logs',
        '/api/export',
        '/api/health',
        '/api/admin'
      ],
      payloads: {
        sql: [
          "'; DROP TABLE users; --",
          "' OR '1'='1",
          "' UNION SELECT password FROM users --",
          "'; INSERT INTO users (username, is_admin) VALUES ('hacker', true); --"
        ],
        xss: [
          "<script>alert('XSS')</script>",
          "<img src=x onerror=alert('XSS')>",
          "javascript:alert('XSS')",
          "<svg onload=alert('XSS')>"
        ],
        ldap: [
          "*)(&(objectClass=user)(cn=admin))",
          "*)(|(cn=*))(|(cn=*",
          "admin)(|(password=*))"
        ],
        command: [
          "; cat /etc/passwd",
          "| ls -la",
          "&& whoami",
          "`id`"
        ]
      },
      headers: {},
      cookies: {},
      timeouts: {
        request: 10000,
        scan: 300000
      },
      reporting: {
        format: 'json',
        outputPath: './security-scan-results',
        includeSuccesses: false
      },
      ...config
    };
  }

  async initialize(): Promise<void> {
    // Setup test user and tokens
    const userResult = await db.query(`
      INSERT INTO users (username, password_hash, email, is_active, is_admin, auth_source)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, ['scanner_test_user', 'hashed_password', 'scanner@example.com', true, false, 'local']);
    
    const adminResult = await db.query(`
      INSERT INTO users (username, password_hash, email, is_active, is_admin, auth_source)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, ['scanner_admin_user', 'admin_hash', 'scanner-admin@example.com', true, true, 'local']);
    
    const testUserId = userResult.rows[0].id;
    const adminUserId = adminResult.rows[0].id;
    
    // Generate tokens
    const secret = process.env.JWT_SECRET || 'test-secret';
    
    this.testToken = jwt.sign(
      { userId: testUserId, username: 'scanner_test_user', isAdmin: false, authSource: 'local' },
      secret,
      { expiresIn: '1h' }
    );
    
    this.adminToken = jwt.sign(
      { userId: adminUserId, username: 'scanner_admin_user', isAdmin: true, authSource: 'local' },
      secret,
      { expiresIn: '1h' }
    );
  }

  async cleanup(): Promise<void> {
    try {
      await db.query('DELETE FROM users WHERE username LIKE $1', ['scanner_%_user']);
    } catch (error) {
      logger.warn('Scanner cleanup error:', error);
    }
  }

  private addResult(result: Omit<SecurityScanResult, 'timestamp'>): void {
    this.results.push({
      ...result,
      timestamp: new Date()
    });
  }

  // =====================================================
  // AUTOMATED VULNERABILITY SCANNING
  // =====================================================

  async scanSQLInjection(): Promise<void> {
    for (const endpoint of this.config.endpoints) {
      for (const payload of this.config.payloads.sql) {
        try {
          // Test in query parameters
          const queryResponse = await request(app)
            .get(endpoint)
            .query({ q: payload, search: payload, filter: payload })
            .set('Authorization', `Bearer ${this.testToken}`)
            .timeout(this.config.timeouts.request);

          this.analyzeSQLResponse(endpoint, payload, 'query', queryResponse);

          // Test in body parameters
          if (['POST', 'PUT', 'PATCH'].includes('POST')) {
            const bodyResponse = await request(app)
              .post(endpoint)
              .send({ 
                name: payload, 
                description: payload,
                filters: [{ field: 'name', value: payload }]
              })
              .set('Authorization', `Bearer ${this.testToken}`)
              .timeout(this.config.timeouts.request);

            this.analyzeSQLResponse(endpoint, payload, 'body', bodyResponse);
          }

        } catch (error) {
          this.addResult({
            testSuite: 'SQL Injection',
            testName: `${endpoint} - ${payload}`,
            severity: 'medium',
            status: 'warning',
            description: 'Request failed during SQL injection test',
            details: { error: (error as Error).message },
            recommendation: 'Investigate request handling and error responses'
          });
        }
      }
    }
  }

  private analyzeSQLResponse(endpoint: string, payload: string, location: string, response: any): void {
    const responseText = JSON.stringify(response.body);
    
    // Check for SQL error indicators
    const sqlErrorPatterns = [
      /syntax error/i,
      /mysql|postgresql|oracle|sql server/i,
      /table.*doesn.*exist/i,
      /column.*not found/i,
      /ORA-\d+/,
      /ERROR \d+/,
      /sqlite_/i,
      /SELECT.*FROM/i,
      /INSERT.*INTO/i,
      /UPDATE.*SET/i,
      /DELETE.*FROM/i
    ];

    let hasVulnerability = false;
    let severityLevel: 'critical' | 'high' | 'medium' | 'low' = 'low';

    for (const pattern of sqlErrorPatterns) {
      if (pattern.test(responseText)) {
        hasVulnerability = true;
        severityLevel = 'high';
        break;
      }
    }

    // Check for data exposure
    if (responseText.includes('password') || responseText.includes('hash') || responseText.includes('secret')) {
      hasVulnerability = true;
      severityLevel = 'critical';
    }

    // Check response status
    if (response.status === 500) {
      hasVulnerability = true;
      severityLevel = severityLevel === 'critical' ? 'critical' : 'medium';
    }

    this.addResult({
      testSuite: 'SQL Injection',
      testName: `${endpoint} (${location}) - ${payload.substring(0, 30)}`,
      severity: hasVulnerability ? severityLevel : 'info',
      status: hasVulnerability ? 'fail' : 'pass',
      description: hasVulnerability 
        ? `Potential SQL injection vulnerability detected`
        : 'No SQL injection vulnerability detected',
      details: {
        endpoint,
        payload,
        location,
        responseStatus: response.status,
        hasErrorPatterns: hasVulnerability
      },
      recommendation: hasVulnerability 
        ? 'Implement parameterized queries and input validation'
        : undefined
    });
  }

  async scanXSSVulnerabilities(): Promise<void> {
    for (const endpoint of this.config.endpoints) {
      for (const payload of this.config.payloads.xss) {
        try {
          const response = await request(app)
            .post(endpoint)
            .send({ 
              name: payload, 
              description: payload,
              message: payload,
              comment: payload
            })
            .set('Authorization', `Bearer ${this.testToken}`)
            .timeout(this.config.timeouts.request);

          this.analyzeXSSResponse(endpoint, payload, response);

        } catch (error) {
          this.addResult({
            testSuite: 'XSS Vulnerabilities',
            testName: `${endpoint} - ${payload}`,
            severity: 'medium',
            status: 'warning',
            description: 'Request failed during XSS test',
            details: { error: (error as Error).message }
          });
        }
      }
    }
  }

  private analyzeXSSResponse(endpoint: string, payload: string, response: any): void {
    const responseText = JSON.stringify(response.body);
    
    // Check if payload is reflected unescaped
    const isReflected = responseText.includes(payload);
    const isUnescaped = responseText.includes('<script>') || 
                       responseText.includes('javascript:') ||
                       responseText.includes('onerror=') ||
                       responseText.includes('onload=');

    const hasVulnerability = isReflected && isUnescaped;

    this.addResult({
      testSuite: 'XSS Vulnerabilities',
      testName: `${endpoint} - ${payload.substring(0, 30)}`,
      severity: hasVulnerability ? 'high' : 'info',
      status: hasVulnerability ? 'fail' : 'pass',
      description: hasVulnerability 
        ? 'Potential XSS vulnerability detected - payload reflected unescaped'
        : 'No XSS vulnerability detected',
      details: {
        endpoint,
        payload,
        isReflected,
        isUnescaped,
        responseStatus: response.status
      },
      recommendation: hasVulnerability 
        ? 'Implement proper output encoding and Content Security Policy'
        : undefined
    });
  }

  async scanAuthenticationFlaws(): Promise<void> {
    const authTests = [
      {
        name: 'No authentication bypass',
        test: async () => {
          const response = await request(app)
            .get('/api/reports')
            .timeout(this.config.timeouts.request);
          return response.status === 401;
        }
      },
      {
        name: 'Invalid token rejection',
        test: async () => {
          const response = await request(app)
            .get('/api/reports')
            .set('Authorization', 'Bearer invalid.token.here')
            .timeout(this.config.timeouts.request);
          return response.status === 401;
        }
      },
      {
        name: 'Expired token rejection',
        test: async () => {
          const expiredToken = jwt.sign(
            { userId: 1, exp: Math.floor(Date.now() / 1000) - 3600 },
            process.env.JWT_SECRET || 'test-secret'
          );
          const response = await request(app)
            .get('/api/reports')
            .set('Authorization', `Bearer ${expiredToken}`)
            .timeout(this.config.timeouts.request);
          return response.status === 401;
        }
      },
      {
        name: 'Admin endpoint protection',
        test: async () => {
          const response = await request(app)
            .get('/api/admin/users')
            .set('Authorization', `Bearer ${this.testToken}`)
            .timeout(this.config.timeouts.request);
          return response.status === 403;
        }
      }
    ];

    for (const authTest of authTests) {
      try {
        const passed = await authTest.test();
        
        this.addResult({
          testSuite: 'Authentication Security',
          testName: authTest.name,
          severity: passed ? 'info' : 'critical',
          status: passed ? 'pass' : 'fail',
          description: passed 
            ? 'Authentication control working correctly'
            : 'Authentication bypass detected',
          recommendation: passed ? undefined : 'Review authentication middleware and access controls'
        });
      } catch (error) {
        this.addResult({
          testSuite: 'Authentication Security',
          testName: authTest.name,
          severity: 'medium',
          status: 'warning',
          description: 'Authentication test failed to execute',
          details: { error: (error as Error).message }
        });
      }
    }
  }

  async scanInformationDisclosure(): Promise<void> {
    const sensitivePatterns = [
      /password/i,
      /secret/i,
      /key/i,
      /token/i,
      /hash/i,
      /salt/i,
      /database.*url/i,
      /connection.*string/i,
      /env/i,
      /config/i
    ];

    for (const endpoint of this.config.endpoints) {
      try {
        const response = await request(app)
          .get(endpoint)
          .set('Authorization', `Bearer ${this.testToken}`)
          .timeout(this.config.timeouts.request);

        const responseText = JSON.stringify(response.body);
        let hasDisclosure = false;
        const foundPatterns: string[] = [];

        for (const pattern of sensitivePatterns) {
          if (pattern.test(responseText)) {
            hasDisclosure = true;
            foundPatterns.push(pattern.toString());
          }
        }

        this.addResult({
          testSuite: 'Information Disclosure',
          testName: `${endpoint} - Sensitive data exposure`,
          severity: hasDisclosure ? 'medium' : 'info',
          status: hasDisclosure ? 'fail' : 'pass',
          description: hasDisclosure 
            ? 'Potential sensitive information disclosure'
            : 'No sensitive information disclosed',
          details: {
            endpoint,
            foundPatterns,
            responseStatus: response.status
          },
          recommendation: hasDisclosure 
            ? 'Review response data and implement data filtering'
            : undefined
        });

      } catch (_error) {
        // Endpoint might not exist, which is fine
        continue;
      }
    }
  }

  async scanRateLimiting(): Promise<void> {
    const endpoints = ['/api/auth/login', '/api/reports', '/api/search'];
    
    for (const endpoint of endpoints) {
      try {
        const requests = Array(20).fill(null).map(() =>
          request(app)
            .get(endpoint)
            .set('Authorization', `Bearer ${this.testToken}`)
            .timeout(this.config.timeouts.request)
        );

        const responses = await Promise.all(requests.map(req => 
          req.catch(err => ({ status: 500, error: err }))
        ));

        const rateLimitedCount = responses.filter(r => r.status === 429).length;
        const hasRateLimit = rateLimitedCount > 0;

        this.addResult({
          testSuite: 'Rate Limiting',
          testName: `${endpoint} - Rate limit enforcement`,
          severity: hasRateLimit ? 'info' : 'medium',
          status: hasRateLimit ? 'pass' : 'warning',
          description: hasRateLimit 
            ? 'Rate limiting is enforced'
            : 'No rate limiting detected',
          details: {
            endpoint,
            totalRequests: 20,
            rateLimitedRequests: rateLimitedCount
          },
          recommendation: hasRateLimit ? undefined : 'Implement rate limiting to prevent abuse'
        });

      } catch (error) {
        this.addResult({
          testSuite: 'Rate Limiting',
          testName: `${endpoint} - Rate limit test`,
          severity: 'low',
          status: 'warning',
          description: 'Rate limiting test failed',
          details: { error: (error as Error).message }
        });
      }
    }
  }

  async scanSecurityHeaders(): Promise<void> {
    const requiredHeaders = [
      { name: 'X-Content-Type-Options', value: 'nosniff' },
      { name: 'X-Frame-Options', value: ['DENY', 'SAMEORIGIN'] },
      { name: 'X-XSS-Protection', value: '1; mode=block' },
      { name: 'Strict-Transport-Security', value: null }, // Any value is good
      { name: 'Content-Security-Policy', value: null }
    ];

    try {
      const response = await request(app)
        .get('/api/health')
        .set('Authorization', `Bearer ${this.testToken}`)
        .timeout(this.config.timeouts.request);

      for (const header of requiredHeaders) {
        const headerValue = response.headers[header.name.toLowerCase()];
        const hasHeader = !!headerValue;
        const isValidValue = header.value === null || 
                           (Array.isArray(header.value) 
                             ? header.value.includes(headerValue) 
                             : headerValue === header.value);

        this.addResult({
          testSuite: 'Security Headers',
          testName: `${header.name} header check`,
          severity: hasHeader && isValidValue ? 'info' : 'medium',
          status: hasHeader && isValidValue ? 'pass' : 'fail',
          description: hasHeader 
            ? (isValidValue ? 'Security header properly configured' : 'Security header has invalid value')
            : 'Security header missing',
          details: {
            headerName: header.name,
            expectedValue: header.value,
            actualValue: headerValue
          },
          recommendation: hasHeader && isValidValue ? undefined : `Add ${header.name} header for better security`
        });
      }

    } catch (error) {
      this.addResult({
        testSuite: 'Security Headers',
        testName: 'Security headers test',
        severity: 'medium',
        status: 'warning',
        description: 'Failed to test security headers',
        details: { error: (error as Error).message }
      });
    }
  }

  // =====================================================
  // REPORTING AND OUTPUT
  // =====================================================

  generateReport(): any {
    const summary = {
      totalTests: this.results.length,
      passed: this.results.filter(r => r.status === 'pass').length,
      failed: this.results.filter(r => r.status === 'fail').length,
      warnings: this.results.filter(r => r.status === 'warning').length,
      criticalIssues: this.results.filter(r => r.severity === 'critical').length,
      highIssues: this.results.filter(r => r.severity === 'high').length,
      mediumIssues: this.results.filter(r => r.severity === 'medium').length,
      lowIssues: this.results.filter(r => r.severity === 'low').length
    };

    const report = {
      scanTimestamp: new Date(),
      summary,
      results: this.config.reporting.includeSuccesses 
        ? this.results 
        : this.results.filter(r => r.status !== 'pass'),
      recommendations: this.generateRecommendations()
    };

    return report;
  }

  private generateRecommendations(): string[] {
    const recommendations = new Set<string>();
    
    this.results
      .filter(r => r.recommendation)
      .forEach(r => recommendations.add(r.recommendation!));
    
    return Array.from(recommendations);
  }

  async saveReport(): Promise<void> {
    const report = this.generateReport();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    if (!fs.existsSync(this.config.reporting.outputPath)) {
      fs.mkdirSync(this.config.reporting.outputPath, { recursive: true });
    }

    switch (this.config.reporting.format) {
      case 'json':
        const jsonPath = path.join(this.config.reporting.outputPath, `security-scan-${timestamp}.json`);
        fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
        logger.info(`Security scan report saved to: ${jsonPath}`);
        break;
        
      case 'html':
        const htmlPath = path.join(this.config.reporting.outputPath, `security-scan-${timestamp}.html`);
        const htmlContent = this.generateHTMLReport(report);
        fs.writeFileSync(htmlPath, htmlContent);
        logger.info(`Security scan report saved to: ${htmlPath}`);
        break;
        
      case 'csv':
        const csvPath = path.join(this.config.reporting.outputPath, `security-scan-${timestamp}.csv`);
        const csvContent = this.generateCSVReport(report);
        fs.writeFileSync(csvPath, csvContent);
        logger.info(`Security scan report saved to: ${csvPath}`);
        break;
    }
  }

  private generateHTMLReport(report: any): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Security Scan Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .summary { background: #f5f5f5; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
        .critical { color: #d32f2f; }
        .high { color: #f57c00; }
        .medium { color: #fbc02d; }
        .low { color: #388e3c; }
        .pass { color: #4caf50; }
        .fail { color: #f44336; }
        .warning { color: #ff9800; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
    </style>
</head>
<body>
    <h1>Security Scan Report</h1>
    <div class="summary">
        <h2>Summary</h2>
        <p>Scan Date: ${report.scanTimestamp}</p>
        <p>Total Tests: ${report.summary.totalTests}</p>
        <p>Passed: <span class="pass">${report.summary.passed}</span></p>
        <p>Failed: <span class="fail">${report.summary.failed}</span></p>
        <p>Warnings: <span class="warning">${report.summary.warnings}</span></p>
        <p>Critical Issues: <span class="critical">${report.summary.criticalIssues}</span></p>
        <p>High Issues: <span class="high">${report.summary.highIssues}</span></p>
        <p>Medium Issues: <span class="medium">${report.summary.mediumIssues}</span></p>
        <p>Low Issues: <span class="low">${report.summary.lowIssues}</span></p>
    </div>
    
    <h2>Test Results</h2>
    <table>
        <tr>
            <th>Test Suite</th>
            <th>Test Name</th>
            <th>Severity</th>
            <th>Status</th>
            <th>Description</th>
            <th>Recommendation</th>
        </tr>
        ${report.results.map((result: SecurityScanResult) => `
        <tr>
            <td>${result.testSuite}</td>
            <td>${result.testName}</td>
            <td class="${result.severity}">${result.severity.toUpperCase()}</td>
            <td class="${result.status}">${result.status.toUpperCase()}</td>
            <td>${result.description}</td>
            <td>${result.recommendation || ''}</td>
        </tr>
        `).join('')}
    </table>
    
    <h2>Recommendations</h2>
    <ul>
        ${report.recommendations.map((rec: string) => `<li>${rec}</li>`).join('')}
    </ul>
</body>
</html>`;
  }

  private generateCSVReport(report: any): string {
    const headers = ['Test Suite', 'Test Name', 'Severity', 'Status', 'Description', 'Recommendation', 'Timestamp'];
    const rows = report.results.map((result: SecurityScanResult) => [
      result.testSuite,
      result.testName,
      result.severity,
      result.status,
      result.description,
      result.recommendation || '',
      result.timestamp.toISOString()
    ]);
    
    return [headers, ...rows]
      .map(row => row.map((cell: any) => `"${cell}"`).join(','))
      .join('\n');
  }

  // =====================================================
  // MAIN SCAN EXECUTION
  // =====================================================

  async runFullScan(): Promise<any> {
    logger.info('Starting automated security scan...');
    
    await this.initialize();
    
    try {
      await this.scanSQLInjection();
      await this.scanXSSVulnerabilities();
      await this.scanAuthenticationFlaws();
      await this.scanInformationDisclosure();
      await this.scanRateLimiting();
      await this.scanSecurityHeaders();
      
      const report = this.generateReport();
      await this.saveReport();
      
      logger.info(`Security scan completed. Found ${report.summary.failed} failures and ${report.summary.warnings} warnings.`);
      
      return report;
      
    } finally {
      await this.cleanup();
    }
  }
}

// Export for use in CI/CD and standalone execution
export { AutomatedSecurityScanner, SecurityScanResult, ScanConfiguration };

// CLI execution
if (require.main === module) {
  const scanner = new AutomatedSecurityScanner({
    reporting: {
      format: 'json',
      outputPath: './security-reports',
      includeSuccesses: false
    }
  });
  
  scanner.runFullScan()
    .then(report => {
      console.log('Security scan completed');
      logger.info(`Failed tests: ${report.summary.failed}`);
      console.log(`Critical issues: ${report.summary.criticalIssues}`);
      console.log(`High issues: ${report.summary.highIssues}`);
      
      // Exit with error code if critical issues found
      if (report.summary.criticalIssues > 0) {
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('Security scan failed:', error);
      process.exit(1);
    });
}

// Jest test integration
describe('Automated Security Scanner', () => {
  test('Run full security scan', async () => {
    const scanner = new AutomatedSecurityScanner({
      reporting: { format: 'json', outputPath: './test-reports', includeSuccesses: false }
    });
    
    const report = await scanner.runFullScan();
    
    // Assert no critical vulnerabilities found
    expect(report.summary.criticalIssues).toBe(0);
    
    // Log summary for CI/CD visibility
    console.log('Security Scan Summary:', report.summary);
    
  }, 300000); // 5 minute timeout
});