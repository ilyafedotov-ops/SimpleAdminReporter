/**
 * API Endpoint Tests for /api/reports/testCustomQuery
 * Testing standardized response data structure implementation in the API layer
 */

import request from 'supertest';
import express from 'express';
import { ReportsController } from './reports.controller';
import { serviceFactory } from '@/services/service.factory';
// Mock the unified auth middleware since it's not exported directly
const mockUnifiedAuthMiddleware = jest.fn();
import type { 
  PreviewResponse, 
  PreviewRequest,
  CustomQuery,
  DataSourceType
} from '@/types/shared-types';

// Mock dependencies
jest.mock('@/services/service.factory');
jest.mock('@/utils/logger');

describe('API Endpoint: POST /api/reports/testCustomQuery', () => {
  let app: express.Application;
  let reportsController: ReportsController;
  let mockPreviewService: any;
  let mockServiceFactory: jest.Mocked<typeof serviceFactory>;

  // Type definitions for test data
  interface ADUser {
    sAMAccountName: string;
    displayName: string;
    department: string;
    enabled: boolean;
  }

  interface AzureUser {
    userPrincipalName: string;
    displayName: string;
    jobTitle: string;
    accountEnabled: boolean;
  }

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup express app
    app = express();
    app.use(express.json());

    // Mock authentication middleware
    mockUnifiedAuthMiddleware.mockImplementation((req: any, res: any, next: any) => {
      req.user = {
        id: 1,
        username: 'testuser',
        roles: ['user']
      };
      next();
    });

    // Setup controller
    reportsController = new ReportsController();

    // Setup mock preview service
    mockPreviewService = {
      executePreview: jest.fn()
    };

    mockServiceFactory = serviceFactory as jest.Mocked<typeof serviceFactory>;
    mockServiceFactory.getPreviewService.mockResolvedValue(mockPreviewService);

    // Setup route
    app.post('/api/reports/testCustomQuery', mockUnifiedAuthMiddleware, reportsController.testCustomQuery);
  });

  describe('Successful Response Scenarios', () => {
    
    it('should return standardized PreviewResponse for AD query', async () => {
      const testUsers: ADUser[] = [
        {
          sAMAccountName: 'jdoe',
          displayName: 'John Doe',
          department: 'IT',
          enabled: true
        },
        {
          sAMAccountName: 'asmith',
          displayName: 'Alice Smith',
          department: 'Finance',
          enabled: true
        }
      ];

      const expectedResponse: PreviewResponse<ADUser> = {
        success: true,
        data: {
          source: 'ad',
          executionTime: 150,
          testData: testUsers,
          rowCount: 2,
          isTestRun: true,
          cached: false,
          metadata: {
            originalFormat: 'direct_array',
            extractedDataLength: 2,
            isArray: true,
            hasData: true
          }
        }
      };

      mockPreviewService.executePreview.mockResolvedValue(expectedResponse);

      const requestBody: PreviewRequest = {
        source: 'ad',
        query: {
          source: 'ad',
          fields: [
            { name: 'sAMAccountName', displayName: 'Username' },
            { name: 'displayName', displayName: 'Full Name' },
            { name: 'department', displayName: 'Department' }
          ],
          filters: [
            { field: 'enabled', operator: 'equals', value: true }
          ]
        },
        parameters: { orgUnit: 'CN=Users,DC=company,DC=com' },
        limit: 10
      };

      const response = await request(app)
        .post('/api/reports/testCustomQuery')
        .send(requestBody)
        .expect(200);

      // Verify service was called with correct parameters
      expect(mockServiceFactory.getPreviewService).toHaveBeenCalled();
      expect(mockPreviewService.executePreview).toHaveBeenCalledWith({
        source: 'ad',
        query: requestBody.query,
        parameters: { orgUnit: 'CN=Users,DC=company,DC=com' },
        limit: 10
      });

      // Verify standardized response structure
      expect(response.body).toEqual(expectedResponse);
      expect(response.body.success).toBe(true);
      expect(response.body.data.source).toBe('ad');
      expect(response.body.data.testData).toHaveLength(2);
      expect(response.body.data.rowCount).toBe(2);
      expect(response.body.data.isTestRun).toBe(true);
      expect(response.body.data.metadata).toBeDefined();

      // Verify typed data structure
      const firstUser = response.body.data.testData[0] as ADUser;
      expect(firstUser.sAMAccountName).toBe('jdoe');
      expect(firstUser.displayName).toBe('John Doe');
      expect(firstUser.department).toBe('IT');
      expect(firstUser.enabled).toBe(true);
    });

    it('should return standardized PreviewResponse for Azure query', async () => {
      const testUsers: AzureUser[] = [
        {
          userPrincipalName: 'john.doe@company.com',
          displayName: 'John Doe',
          jobTitle: 'Software Engineer',
          accountEnabled: true
        }
      ];

      const expectedResponse: PreviewResponse<AzureUser> = {
        success: true,
        data: {
          source: 'azure',
          executionTime: 200,
          testData: testUsers,
          rowCount: 1,
          isTestRun: true,
          cached: false,
          metadata: {
            originalFormat: 'graph_api_value',
            extractedDataLength: 1,
            isArray: false,
            hasData: true,
            responseKeys: ['value', '@odata.count']
          }
        }
      };

      mockPreviewService.executePreview.mockResolvedValue(expectedResponse);

      const requestBody: PreviewRequest = {
        source: 'azure',
        query: {
          source: 'azure',
          fields: [
            { name: 'userPrincipalName', displayName: 'UPN' },
            { name: 'displayName', displayName: 'Name' },
            { name: 'jobTitle', displayName: 'Job Title' }
          ],
          filters: [
            { field: 'accountEnabled', operator: 'equals', value: true }
          ]
        },
        limit: 25
      };

      const response = await request(app)
        .post('/api/reports/testCustomQuery')
        .send(requestBody)
        .expect(200);

      // Verify response structure
      expect(response.body).toEqual(expectedResponse);
      expect(response.body.data.source).toBe('azure');
      expect(response.body.data.testData[0].userPrincipalName).toBe('john.doe@company.com');
      expect(response.body.data.metadata.originalFormat).toBe('graph_api_value');
    });

    it('should handle empty results with proper response structure', async () => {
      const emptyResponse: PreviewResponse = {
        success: true,
        data: {
          source: 'o365',
          executionTime: 75,
          testData: [],
          rowCount: 0,
          isTestRun: true,
          cached: false,
          metadata: {
            originalFormat: 'graph_api_value',
            extractedDataLength: 0,
            isArray: false,
            hasData: false
          }
        }
      };

      mockPreviewService.executePreview.mockResolvedValue(emptyResponse);

      const requestBody: PreviewRequest = {
        source: 'o365',
        query: {
          source: 'o365',
          fields: [{ name: 'userPrincipalName' }],
          filters: [{ field: 'storageUsedInBytes', operator: 'greater_than', value: 999999999 }]
        }
      };

      const response = await request(app)
        .post('/api/reports/testCustomQuery')
        .send(requestBody)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.testData).toEqual([]);
      expect(response.body.data.rowCount).toBe(0);
      expect(response.body.data.metadata.hasData).toBe(false);
    });

    it('should preserve execution time in response', async () => {
      const slowResponse: PreviewResponse = {
        success: true,
        data: {
          source: 'ad',
          executionTime: 2500, // 2.5 seconds
          testData: [{ id: 1, name: 'Test' }],
          rowCount: 1,
          isTestRun: true
        }
      };

      mockPreviewService.executePreview.mockResolvedValue(slowResponse);

      const response = await request(app)
        .post('/api/reports/testCustomQuery')
        .send({
          source: 'ad',
          query: { source: 'ad', fields: [{ name: 'test' }] }
        })
        .expect(200);

      expect(response.body.data.executionTime).toBe(2500);
    });

    it('should indicate cached responses', async () => {
      const cachedResponse: PreviewResponse = {
        success: true,
        data: {
          source: 'azure',
          executionTime: 50, // Fast due to cache
          testData: [{ userPrincipalName: 'cached@test.com' }],
          rowCount: 1,
          isTestRun: true,
          cached: true
        }
      };

      mockPreviewService.executePreview.mockResolvedValue(cachedResponse);

      const response = await request(app)
        .post('/api/reports/testCustomQuery')
        .send({
          source: 'azure',
          query: { source: 'azure', fields: [{ name: 'userPrincipalName' }] }
        })
        .expect(200);

      expect(response.body.data.cached).toBe(true);
    });
  });

  describe('Default Parameter Handling', () => {
    
    it('should apply default limit when not specified', async () => {
      const response: PreviewResponse = {
        success: true,
        data: {
          source: 'ad',
          executionTime: 100,
          testData: [],
          rowCount: 0,
          isTestRun: true
        }
      };

      mockPreviewService.executePreview.mockResolvedValue(response);

      await request(app)
        .post('/api/reports/testCustomQuery')
        .send({
          source: 'ad',
          query: { source: 'ad', fields: [{ name: 'test' }] }
          // No limit specified
        })
        .expect(200);

      expect(mockPreviewService.executePreview).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 10 // Default limit
        })
      );
    });

    it('should apply default parameters when not specified', async () => {
      const response: PreviewResponse = {
        success: true,
        data: {
          source: 'ad',
          executionTime: 100,
          testData: [],
          rowCount: 0,
          isTestRun: true
        }
      };

      mockPreviewService.executePreview.mockResolvedValue(response);

      await request(app)
        .post('/api/reports/testCustomQuery')
        .send({
          source: 'ad',
          query: { source: 'ad', fields: [{ name: 'test' }] }
          // No parameters specified
        })
        .expect(200);

      expect(mockPreviewService.executePreview).toHaveBeenCalledWith(
        expect.objectContaining({
          parameters: {} // Default empty parameters
        })
      );
    });

    it('should preserve custom limit when specified', async () => {
      const response: PreviewResponse = {
        success: true,
        data: {
          source: 'ad',
          executionTime: 100,
          testData: [],
          rowCount: 0,
          isTestRun: true
        }
      };

      mockPreviewService.executePreview.mockResolvedValue(response);

      await request(app)
        .post('/api/reports/testCustomQuery')
        .send({
          source: 'ad',
          query: { source: 'ad', fields: [{ name: 'test' }] },
          limit: 50
        })
        .expect(200);

      expect(mockPreviewService.executePreview).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 50
        })
      );
    });
  });

  describe('Error Handling', () => {
    
    it('should return 401 when user is not authenticated', async () => {
      // Override auth middleware to simulate unauthenticated request
      app = express();
      app.use(express.json());
      app.post('/api/reports/testCustomQuery', (req: any, res: any, next: any) => {
        req.user = null; // No user
        next();
      }, reportsController.testCustomQuery);

      const response = await request(app)
        .post('/api/reports/testCustomQuery')
        .send({
          source: 'ad',
          query: { source: 'ad', fields: [{ name: 'test' }] }
        })
        .expect(401);

      expect(response.body.message || response.body.error).toMatch(/authentication/i);
    });

    it('should handle service errors and maintain error structure', async () => {
      const serviceError = new Error('LDAP connection failed');
      mockPreviewService.executePreview.mockRejectedValue(serviceError);

      const response = await request(app)
        .post('/api/reports/testCustomQuery')
        .send({
          source: 'ad',
          query: { source: 'ad', fields: [{ name: 'test' }] }
        })
        .expect(500);

      // Should still be a structured error response
      expect(response.body).toHaveProperty('error');
    });

    it('should handle validation errors from preview service', async () => {
      const validationError = new Error('Invalid or missing data source');
      (validationError as any).statusCode = 400;
      mockPreviewService.executePreview.mockRejectedValue(validationError);

      const response = await request(app)
        .post('/api/reports/testCustomQuery')
        .send({
          source: 'invalid',
          query: { source: 'invalid', fields: [] }
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should handle malformed request bodies', async () => {
      await request(app)
        .post('/api/reports/testCustomQuery')
        .send({
          // Missing required fields
        })
        .expect(400);
    });

    it('should handle JSON parsing errors', async () => {
      await request(app)
        .post('/api/reports/testCustomQuery')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);
    });
  });

  describe('Complex Query Scenarios', () => {
    
    it('should handle complex queries with multiple filters', async () => {
      const complexQuery: CustomQuery = {
        source: 'ad',
        fields: [
          { name: 'sAMAccountName', displayName: 'Username' },
          { name: 'department', displayName: 'Department' },
          { name: 'lastLogon', displayName: 'Last Login' }
        ],
        filters: [
          { field: 'enabled', operator: 'equals', value: true },
          { field: 'department', operator: 'contains', value: 'IT' },
          { field: 'lastLogon', operator: 'older_than', value: '30d' }
        ],
        orderBy: { field: 'lastLogon', direction: 'desc' },
        limit: 20
      };

      const response: PreviewResponse = {
        success: true,
        data: {
          source: 'ad',
          executionTime: 250,
          testData: [{ sAMAccountName: 'test', department: 'IT', lastLogon: new Date() }],
          rowCount: 1,
          isTestRun: true
        }
      };

      mockPreviewService.executePreview.mockResolvedValue(response);

      const requestBody: PreviewRequest = {
        source: 'ad',
        query: complexQuery,
        parameters: { searchBase: 'CN=Users,DC=company,DC=com' },
        limit: 20
      };

      await request(app)
        .post('/api/reports/testCustomQuery')
        .send(requestBody)
        .expect(200);

      expect(mockPreviewService.executePreview).toHaveBeenCalledWith({
        source: 'ad',
        query: complexQuery,
        parameters: { searchBase: 'CN=Users,DC=company,DC=com' },
        limit: 20
      });
    });

    it('should handle aggregation queries', async () => {
      const aggregationQuery: CustomQuery = {
        source: 'azure',
        fields: [
          { name: 'jobTitle', displayName: 'Job Title' }
        ],
        aggregations: [
          { field: 'userPrincipalName', function: 'count', alias: 'user_count' }
        ],
        groupBy: ['jobTitle'],
        orderBy: { field: 'user_count', direction: 'desc' }
      };

      const response: PreviewResponse = {
        success: true,
        data: {
          source: 'azure',
          executionTime: 300,
          testData: [
            { jobTitle: 'Software Engineer', user_count: 25 },
            { jobTitle: 'Manager', user_count: 8 }
          ],
          rowCount: 2,
          isTestRun: true
        }
      };

      mockPreviewService.executePreview.mockResolvedValue(response);

      await request(app)
        .post('/api/reports/testCustomQuery')
        .send({
          source: 'azure',
          query: aggregationQuery
        })
        .expect(200);

      const result = await request(app)
        .post('/api/reports/testCustomQuery')
        .send({
          source: 'azure',
          query: aggregationQuery
        });

      expect(result.body.data.testData[0]).toHaveProperty('user_count', 25);
    });
  });

  describe('Response Format Validation', () => {
    
    it('should always return PreviewResponse structure', async () => {
      const response: PreviewResponse = {
        success: true,
        data: {
          source: 'ad',
          executionTime: 100,
          testData: [{ test: 'data' }],
          rowCount: 1,
          isTestRun: true
        }
      };

      mockPreviewService.executePreview.mockResolvedValue(response);

      const result = await request(app)
        .post('/api/reports/testCustomQuery')
        .send({
          source: 'ad',
          query: { source: 'ad', fields: [{ name: 'test' }] }
        })
        .expect(200);

      // Verify required PreviewResponse structure
      expect(result.body).toHaveProperty('success');
      expect(result.body).toHaveProperty('data');
      expect(result.body.data).toHaveProperty('source');
      expect(result.body.data).toHaveProperty('executionTime');
      expect(result.body.data).toHaveProperty('testData');
      expect(result.body.data).toHaveProperty('rowCount');
      expect(result.body.data).toHaveProperty('isTestRun');
    });

    it('should maintain consistent response structure across all data sources', async () => {
      const sources: DataSourceType[] = ['ad', 'azure', 'o365'];
      
      for (const source of sources) {
        const response: PreviewResponse = {
          success: true,
          data: {
            source: source,
            executionTime: 100,
            testData: [{ id: 1 }],
            rowCount: 1,
            isTestRun: true
          }
        };

        mockPreviewService.executePreview.mockResolvedValue(response);

        const result = await request(app)
          .post('/api/reports/testCustomQuery')
          .send({
            source: source,
            query: { source: source, fields: [{ name: 'id' }] }
          })
          .expect(200);

        expect(result.body.data.source).toBe(source);
        expect(result.body).toMatchObject({
          success: true,
          data: {
            source: source,
            executionTime: expect.any(Number),
            testData: expect.any(Array),
            rowCount: expect.any(Number),
            isTestRun: true
          }
        });
      }
    });

    it('should preserve all metadata in response', async () => {
      const responseWithMetadata: PreviewResponse = {
        success: true,
        data: {
          source: 'azure',
          executionTime: 150,
          testData: [{ id: 1 }],
          rowCount: 1,
          isTestRun: true,
          cached: true,
          metadata: {
            originalFormat: 'graph_api_value',
            extractedDataLength: 1,
            isArray: false,
            hasData: true,
            responseKeys: ['value', '@odata.count'],
            debugInfo: {
              queryComplexity: 'medium',
              optimizations: ['cache_hit']
            }
          }
        }
      };

      mockPreviewService.executePreview.mockResolvedValue(responseWithMetadata);

      const result = await request(app)
        .post('/api/reports/testCustomQuery')
        .send({
          source: 'azure',
          query: { source: 'azure', fields: [{ name: 'id' }] }
        })
        .expect(200);

      expect(result.body.data.cached).toBe(true);
      expect(result.body.data.metadata).toBeDefined();
      expect(result.body.data.metadata.originalFormat).toBe('graph_api_value');
      expect(result.body.data.metadata.debugInfo).toBeDefined();
      expect(result.body.data.metadata.debugInfo.queryComplexity).toBe('medium');
    });
  });

  describe('Performance and Timeout Handling', () => {
    
    it('should handle timeout scenarios gracefully', async () => {
      const timeoutError = new Error('Query timeout after 30 seconds');
      (timeoutError as any).statusCode = 408;
      mockPreviewService.executePreview.mockRejectedValue(timeoutError);

      const response = await request(app)
        .post('/api/reports/testCustomQuery')
        .send({
          source: 'ad',
          query: { source: 'ad', fields: [{ name: 'test' }] }
        })
        .expect(408);

      expect(response.body).toHaveProperty('error');
    });

    it('should report execution time accurately', async () => {
      const startTime = Date.now(); // eslint-disable-line @typescript-eslint/no-unused-vars
      
      const response: PreviewResponse = {
        success: true,
        data: {
          source: 'ad',
          executionTime: 1250,
          testData: [],
          rowCount: 0,
          isTestRun: true
        }
      };

      mockPreviewService.executePreview.mockResolvedValue(response);

      const result = await request(app)
        .post('/api/reports/testCustomQuery')
        .send({
          source: 'ad',
          query: { source: 'ad', fields: [{ name: 'test' }] }
        })
        .expect(200);

      expect(result.body.data.executionTime).toBe(1250);
    });
  });
});