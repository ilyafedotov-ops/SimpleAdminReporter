/**
 * Input Validation and Output Encoding Security Tests
 * 
 * Comprehensive testing for input sanitization, validation, and output encoding
 * to prevent various security vulnerabilities.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from '@/app';
import { db } from '@/config/database';
import { logger } from '@/utils/logger';

interface ValidationTestContext {
  validToken: string;
  testUserId: number;
}

class InputValidationTestRunner {
  private context: ValidationTestContext = {} as ValidationTestContext;

  async setup(): Promise<void> {
    // Create test user and generate token
    const userResult = await db.query(`
      INSERT INTO users (username, password_hash, email, is_active, is_admin, auth_source)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, ['validation_test_user', 'hashed_password', 'validation-test@example.com', true, false, 'local']);
    
    this.context.testUserId = userResult.rows[0].id;
    
    // Generate JWT token
    const jwt = require('jsonwebtoken');
    this.context.validToken = jwt.sign(
      { 
        userId: this.context.testUserId, 
        username: 'validation_test_user',
        isAdmin: false,
        authSource: 'local'
      },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );
  }

  async cleanup(): Promise<void> {
    try {
      await db.query('DELETE FROM users WHERE username = $1', ['validation_test_user']);
      await db.query('DELETE FROM report_history WHERE user_id = $1', [this.context.testUserId]);
    } catch (error) {
      logger.warn('Cleanup error:', error);
    }
  }

  // =====================================================
  // PATH TRAVERSAL TESTS
  // =====================================================

  async testPathTraversalValidation(): Promise<void> {
    const pathTraversalPayloads = [
      "../../../etc/passwd",
      "..\\..\\..\\windows\\system32\\config\\sam",
      "%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd",
      "....//....//....//etc/passwd",
      "..%252f..%252f..%252fetc%252fpasswd",
      "..%c0%af..%c0%af..%c0%afetc%c0%afpasswd",
      "/var/log/auth.log",
      "../.env",
      "../../docker-compose.yml",
      "../package.json",
      "..\\..\\..\\etc\\passwd",
      "/proc/self/environ",
      "/proc/version",
      "/proc/cmdline",
      "\\\\..\\\\..\\\\..\\\\etc\\\\passwd",
      "file:///etc/passwd",
      "php://filter/read=convert.base64-encode/resource=/etc/passwd"
    ];

    describe('Path Traversal Validation Tests', () => {
      pathTraversalPayloads.forEach((payload, index) => {
        test(`Should prevent path traversal ${index + 1}: ${payload}`, async () => {
          const testEndpoints = [
            { method: 'GET', url: `/api/export/${payload}` },
            { method: 'GET', url: '/api/reports/download', query: { filename: payload } },
            { method: 'POST', url: '/api/files/upload', body: { path: payload } },
            { method: 'GET', url: '/api/logs/download', query: { logfile: payload } }
          ];

          for (const endpoint of testEndpoints) {
            const req = request(app)[endpoint.method.toLowerCase() as 'get' | 'post'](endpoint.url)
              .set('Authorization', `Bearer ${this.context.validToken}`);

            if (endpoint.query) {
              req.query(endpoint.query);
            }
            if (endpoint.body) {
              req.send(endpoint.body);
            }

            const response = await req;
            
            // Should not return file contents or expose system files
            expect(response.status).not.toBe(200);
            expect(response.body).not.toMatch(/root:x:|daemon:|bin:|sys:/);
            expect(response.body).not.toMatch(/\[boot loader\]|\[operating systems\]/);
            expect(response.body).not.toMatch(/version \d+\.\d+/);
            
            const responseText = JSON.stringify(response.body);
            expect(responseText).not.toMatch(/etc\/passwd|windows\/system32|docker-compose/i);
          }
        });
      });
    });
  }

  // =====================================================
  // FILE TYPE VALIDATION TESTS
  // =====================================================

  async testFileTypeValidation(): Promise<void> {
    const maliciousFileTypes = [
      { filename: 'malicious.exe', contentType: 'application/x-executable' },
      { filename: 'script.php', contentType: 'application/x-php' },
      { filename: 'shell.sh', contentType: 'application/x-sh' },
      { filename: 'virus.bat', contentType: 'application/x-bat' },
      { filename: 'trojan.com', contentType: 'application/x-ms-dos-executable' },
      { filename: 'malware.scr', contentType: 'application/x-ms-dos-executable' },
      { filename: 'backdoor.jsp', contentType: 'application/x-jsp' },
      { filename: 'webshell.aspx', contentType: 'application/x-aspx' },
      { filename: 'payload.jar', contentType: 'application/java-archive' },
      { filename: 'exploit.py', contentType: 'text/x-python' }
    ];

    describe('File Type Validation Tests', () => {
      maliciousFileTypes.forEach(({ filename, contentType }, index) => {
        test(`Should prevent upload of ${filename}`, async () => {
          const response = await request(app)
            .post('/api/files/upload')
            .set('Authorization', `Bearer ${this.context.validToken}`)
            .set('Content-Type', contentType)
            .attach('file', Buffer.from('malicious content'), filename);

          expect(response.status).not.toBe(200);
          expect(response.body).not.toHaveProperty('fileUrl');
        });
      });
    });
  }

  // =====================================================
  // SIZE LIMIT VALIDATION TESTS
  // =====================================================

  async testSizeLimitValidation(): Promise<void> {
    describe('Size Limit Validation Tests', () => {
      test('Should prevent oversized JSON payloads', async () => {
        const oversizedPayload = {
          data: 'x'.repeat(10 * 1024 * 1024), // 10MB string
          array: new Array(100000).fill('large data')
        };

        const response = await request(app)
          .post('/api/reports/custom')
          .set('Authorization', `Bearer ${this.context.validToken}`)
          .send(oversizedPayload);

        expect(response.status).toBe(413); // Payload Too Large
      });

      test('Should prevent deep nesting attacks', async () => {
        let deepNestedObject: any = { value: 'deep' };
        for (let i = 0; i < 1000; i++) {
          deepNestedObject = { nested: deepNestedObject };
        }

        const response = await request(app)
          .post('/api/reports/custom')
          .set('Authorization', `Bearer ${this.context.validToken}`)
          .send({ data: deepNestedObject });

        expect(response.status).toBeLessThan(500);
      });

      test('Should prevent large array attacks', async () => {
        const largeArray = new Array(1000000).fill({
          id: 1,
          name: 'test',
          data: 'x'.repeat(1000)
        });

        const response = await request(app)
          .post('/api/reports/execute/1')
          .set('Authorization', `Bearer ${this.context.validToken}`)
          .send({ filters: largeArray });

        expect(response.status).toBe(413);
      });
    });
  }

  // =====================================================
  // DATA TYPE VALIDATION TESTS
  // =====================================================

  async testDataTypeValidation(): Promise<void> {
    const invalidDataTypes = [
      { field: 'userId', value: 'not-a-number', expectedType: 'number' },
      { field: 'isActive', value: 'not-a-boolean', expectedType: 'boolean' },
      { field: 'email', value: 'not-an-email', expectedType: 'email' },
      { field: 'date', value: 'not-a-date', expectedType: 'date' },
      { field: 'url', value: 'not-a-url', expectedType: 'url' },
      { field: 'uuid', value: 'not-a-uuid', expectedType: 'uuid' },
      { field: 'json', value: 'invalid json', expectedType: 'json' }
    ];

    describe('Data Type Validation Tests', () => {
      invalidDataTypes.forEach(({ field, value, expectedType }) => {
        test(`Should validate ${expectedType} type for ${field}`, async () => {
          const testPayload: any = {};
          testPayload[field] = value;

          const response = await request(app)
            .post('/api/reports/custom')
            .set('Authorization', `Bearer ${this.context.validToken}`)
            .send(testPayload);

          expect(response.status).toBe(400);
          expect(response.body.error).toMatch(/validation|invalid|type/i);
        });
      });
    });
  }

  // =====================================================
  // UNICODE AND ENCODING TESTS
  // =====================================================

  async testUnicodeAndEncodingValidation(): Promise<void> {
    const unicodePayloads = [
      "\u0000", // Null byte
      "\u0001\u0002\u0003", // Control characters
      "\uFEFF", // Byte order mark
      "\u200E\u200F", // Bidirectional override
      "\u2028\u2029", // Line/paragraph separators
      "test\uD800", // Invalid UTF-16 surrogate
      "test\uDFFF", // Invalid UTF-16 surrogate
      "\uFFFE\uFFFF", // Non-characters
      "🚫💻🔓", // Emoji that might break parsers
      "＜script＞alert(1)＜/script＞", // Full-width characters
      "тест", // Cyrillic
      "测试", // Chinese
      "اختبار", // Arabic (RTL)
      String.fromCharCode(0x1F4A9), // Pile of poo emoji
      "\x00\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0A\x0B\x0C\x0D\x0E\x0F"
    ];

    describe('Unicode and Encoding Validation Tests', () => {
      unicodePayloads.forEach((payload, index) => {
        test(`Should handle unicode payload ${index + 1}`, async () => {
          const testEndpoints = [
            { 
              method: 'POST', 
              url: '/api/reports/custom', 
              body: { name: payload, description: payload } 
            },
            { 
              method: 'GET', 
              url: '/api/search', 
              query: { q: payload } 
            }
          ];

          for (const endpoint of testEndpoints) {
            const req = request(app)[endpoint.method.toLowerCase() as 'get' | 'post'](endpoint.url)
              .set('Authorization', `Bearer ${this.context.validToken}`);

            if (endpoint.query) {
              req.query(endpoint.query);
            }
            if (endpoint.body) {
              req.send(endpoint.body);
            }

            const response = await req;
            
            // Should handle unicode gracefully
            expect(response.status).toBeLessThan(500);
            
            // Should not cause encoding issues
            if (response.headers['content-type']?.includes('application/json')) {
              expect(() => JSON.parse(JSON.stringify(response.body))).not.toThrow();
            }
          }
        });
      });
    });
  }

  // =====================================================
  // PARAMETER POLLUTION TESTS
  // =====================================================

  async testParameterPollution(): Promise<void> {
    describe('Parameter Pollution Tests', () => {
      test('Should handle duplicate query parameters', async () => {
        const response = await request(app)
          .get('/api/search?q=test&q=admin&q=system')
          .set('Authorization', `Bearer ${this.context.validToken}`);

        expect(response.status).toBeLessThan(500);
      });

      test('Should handle conflicting parameters', async () => {
        const response = await request(app)
          .get('/api/reports?sortBy=name&sortBy=date&sortOrder=asc&sortOrder=desc')
          .set('Authorization', `Bearer ${this.context.validToken}`);

        expect(response.status).toBeLessThan(500);
      });

      test('Should handle array parameter confusion', async () => {
        const response = await request(app)
          .post('/api/reports/execute/1')
          .set('Authorization', `Bearer ${this.context.validToken}`)
          .send({
            filters: [
              { field: 'name', value: 'test' },
              { field: 'name', value: 'admin' }
            ]
          });

        expect(response.status).toBeLessThan(500);
      });
    });
  }

  // =====================================================
  // MIME TYPE SPOOFING TESTS
  // =====================================================

  async testMimeTypeSpoofing(): Promise<void> {
    const spoofedFiles = [
      { 
        filename: 'image.jpg', 
        content: '<?php system($_GET["cmd"]); ?>', 
        mimeType: 'image/jpeg' 
      },
      { 
        filename: 'document.pdf', 
        content: '<script>alert("xss")</script>', 
        mimeType: 'application/pdf' 
      },
      { 
        filename: 'script.txt', 
        content: '#!/bin/bash\nrm -rf /', 
        mimeType: 'text/plain' 
      }
    ];

    describe('MIME Type Spoofing Tests', () => {
      spoofedFiles.forEach(({ filename, content, mimeType }, index) => {
        test(`Should detect spoofed file ${index + 1}: ${filename}`, async () => {
          const response = await request(app)
            .post('/api/files/upload')
            .set('Authorization', `Bearer ${this.context.validToken}`)
            .set('Content-Type', `multipart/form-data`)
            .attach('file', Buffer.from(content), {
              filename,
              contentType: mimeType
            });

          // Should either reject or properly validate the file
          if (response.status === 200) {
            expect(response.body.contentType).toBe(mimeType);
            expect(response.body.validated).toBe(true);
          } else {
            expect(response.status).toBeGreaterThanOrEqual(400);
          }
        });
      });
    });
  }

  // =====================================================
  // OUTPUT ENCODING TESTS
  // =====================================================

  async testOutputEncoding(): Promise<void> {
    const encodingTestData = [
      '<script>alert("xss")</script>',
      '&lt;script&gt;alert("xss")&lt;/script&gt;',
      "'; DROP TABLE users; --",
      '"onmouseover="alert(1)"',
      'javascript:alert(1)',
      '${alert(1)}',
      '{{constructor.constructor("alert(1)")()}}',
      '#{alert(1)}',
      '<%=alert(1)%>'
    ];

    describe('Output Encoding Tests', () => {
      encodingTestData.forEach((payload, index) => {
        test(`Should properly encode output ${index + 1}`, async () => {
          // First, create a report with the malicious data
          const createResponse = await request(app)
            .post('/api/reports/custom')
            .set('Authorization', `Bearer ${this.context.validToken}`)
            .send({
              name: payload,
              description: payload,
              query: { source: 'ad', fields: ['username'] }
            });

          if (createResponse.status === 200 || createResponse.status === 201) {
            // Then retrieve it and check encoding
            const reportId = createResponse.body.id;
            const getResponse = await request(app)
              .get(`/api/reports/${reportId}`)
              .set('Authorization', `Bearer ${this.context.validToken}`);

            if (getResponse.status === 200) {
              const responseText = JSON.stringify(getResponse.body);
              
              // Should be properly encoded
              expect(responseText).not.toContain('<script>');
              expect(responseText).not.toContain('javascript:');
              expect(responseText).not.toContain('onmouseover=');
              
              // Should contain encoded versions or be sanitized
              if (payload.includes('<script>')) {
                expect(responseText).toMatch(/&lt;script&gt;|&amp;lt;script&amp;gt;/);
              }
            }
          }
        });
      });
    });
  }

  // =====================================================
  // CONTENT TYPE VALIDATION TESTS
  // =====================================================

  async testContentTypeValidation(): Promise<void> {
    const invalidContentTypes = [
      'application/x-httpd-php',
      'text/x-php',
      'application/x-executable',
      'application/x-msdownload',
      'application/x-sh',
      'text/x-python',
      'application/javascript',
      'text/html',
      'image/svg+xml'
    ];

    describe('Content Type Validation Tests', () => {
      invalidContentTypes.forEach((contentType, index) => {
        test(`Should reject dangerous content type: ${contentType}`, async () => {
          const response = await request(app)
            .post('/api/files/upload')
            .set('Authorization', `Bearer ${this.context.validToken}`)
            .set('Content-Type', contentType)
            .send('potentially malicious content');

          expect(response.status).toBeGreaterThanOrEqual(400);
        });
      });
    });
  }

  // =====================================================
  // MAIN TEST RUNNER
  // =====================================================

  async runAllValidationTests(): Promise<void> {
    await this.testPathTraversalValidation();
    await this.testFileTypeValidation();
    await this.testSizeLimitValidation();
    await this.testDataTypeValidation();
    await this.testUnicodeAndEncodingValidation();
    await this.testParameterPollution();
    await this.testMimeTypeSpoofing();
    await this.testOutputEncoding();
    await this.testContentTypeValidation();
  }
}

// Export for use in other test files
export { InputValidationTestRunner };

// Main test execution
describe('Input Validation and Output Encoding Test Suite', () => {
  let testRunner: InputValidationTestRunner;

  beforeAll(async () => {
    testRunner = new InputValidationTestRunner();
    await testRunner.setup();
  });

  afterAll(async () => {
    await testRunner.cleanup();
  });

  test('Execute all input validation tests', async () => {
    await testRunner.runAllValidationTests();
  }, 180000); // 3 minute timeout for comprehensive validation tests
});