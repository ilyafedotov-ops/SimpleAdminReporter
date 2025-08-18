/**
 * API Tests for Reports Controller Preview Functionality
 * Testing testCustomQuery endpoint behavior preservation after PreviewService refactoring
 */

import { Request, Response, NextFunction } from 'express';
import { ReportsController } from './reports.controller';
import { serviceFactory } from '@/services/service.factory';
import { createError } from '@/middleware/error.middleware';

// Mock dependencies
jest.mock('@/services/service.factory');
jest.mock('@/middleware/error.middleware');
jest.mock('@/utils/logger');

describe('ReportsController - testCustomQuery API Tests', () => {
  let reportsController: ReportsController;
  let mockServiceFactory: jest.Mocked<typeof serviceFactory>;
  let mockCreateError: jest.MockedFunction<typeof createError>;
  let mockPreviewService: any;

  const createMockRequest = (overrides: Partial<Request> = {}): Partial<Request> => ({
    user: { 
      id: 1, 
      username: 'testuser', 
      role: 'user',
      displayName: 'Test User',
      email: 'test@example.com',
      authSource: 'local',
      isAdmin: false,
      isActive: true
    } as any,
    body: {},
    headers: {},
    ...overrides
  });

  const createMockResponse = (): Partial<Response> => {
    const res: Partial<Response> = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      locals: {}
    };
    return res;
  };

  const mockNext: NextFunction = jest.fn();

  const validRequestBody = {
    source: 'ad',
    query: {
      source: 'ad',
      fields: [
        { name: 'sAMAccountName', displayName: 'Username' },
        { name: 'displayName', displayName: 'Display Name' }
      ],
      filters: [
        { field: 'enabled', operator: 'equals', value: true }
      ]
    },
    parameters: { orgUnit: 'Users' },
    limit: 10
  };

  const mockPreviewResponse = {
    success: true,
    data: {
      source: 'ad',
      executionTime: 150,
      testData: [
        { sAMAccountName: 'jdoe', displayName: 'John Doe' },
        { sAMAccountName: 'asmith', displayName: 'Alice Smith' }
      ],
      rowCount: 2,
      isTestRun: true
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();

    reportsController = new ReportsController();
    
    mockServiceFactory = serviceFactory as jest.Mocked<typeof serviceFactory>;
    mockCreateError = createError as jest.MockedFunction<typeof createError>;

    // Setup PreviewService mock
    mockPreviewService = {
      executePreview: jest.fn()
    };

    mockServiceFactory.getPreviewService = jest.fn().mockResolvedValue(mockPreviewService);

    // Setup createError mock
    mockCreateError.mockImplementation((message: string, code?: number) => {
      const error = new Error(message) as any;
      error.statusCode = code || 500;
      return error;
    });
  });

  describe('POST /api/reports/custom/test - testCustomQuery', () => {

    it('should execute custom query preview successfully', async () => {
      mockPreviewService.executePreview.mockResolvedValue(mockPreviewResponse);

      const req = createMockRequest({ body: validRequestBody });
      const res = createMockResponse();

      await reportsController.testCustomQuery(req as Request, res as Response, mockNext);

      expect(mockServiceFactory.getPreviewService).toHaveBeenCalledTimes(1);
      expect(mockPreviewService.executePreview).toHaveBeenCalledWith({
        source: 'ad',
        query: validRequestBody.query,
        parameters: { orgUnit: 'Users' },
        limit: 10
      });
      expect(res.json).toHaveBeenCalledWith(mockPreviewResponse);
    });

    it('should handle missing parameters with default empty object', async () => {
      const requestWithoutParams = {
        ...validRequestBody,
        parameters: undefined
      };

      mockPreviewService.executePreview.mockResolvedValue(mockPreviewResponse);

      const req = createMockRequest({ body: requestWithoutParams });
      const res = createMockResponse();

      await reportsController.testCustomQuery(req as Request, res as Response, mockNext);

      expect(mockPreviewService.executePreview).toHaveBeenCalledWith({
        source: 'ad',
        query: validRequestBody.query,
        parameters: {},
        limit: 10
      });
    });

    it('should handle missing limit with default value', async () => {
      const requestWithoutLimit = {
        source: 'ad',
        query: validRequestBody.query,
        parameters: { orgUnit: 'Users' }
        // No limit property
      };

      mockPreviewService.executePreview.mockResolvedValue(mockPreviewResponse);

      const req = createMockRequest({ body: requestWithoutLimit });
      const res = createMockResponse();

      await reportsController.testCustomQuery(req as Request, res as Response, mockNext);

      expect(mockPreviewService.executePreview).toHaveBeenCalledWith({
        source: 'ad',
        query: validRequestBody.query,
        parameters: { orgUnit: 'Users' },
        limit: 10
      });
    });

    it('should preserve custom limit values', async () => {
      const requestWithCustomLimit = {
        ...validRequestBody,
        limit: 25
      };

      mockPreviewService.executePreview.mockResolvedValue(mockPreviewResponse);

      const req = createMockRequest({ body: requestWithCustomLimit });
      const res = createMockResponse();

      await reportsController.testCustomQuery(req as Request, res as Response, mockNext);

      expect(mockPreviewService.executePreview).toHaveBeenCalledWith({
        source: 'ad',
        query: validRequestBody.query,
        parameters: { orgUnit: 'Users' },
        limit: 25
      });
    });

    it('should handle Azure data source requests', async () => {
      const azureRequest = {
        source: 'azure',
        query: {
          source: 'azure',
          fields: [
            { name: 'userPrincipalName', displayName: 'User Principal Name' },
            { name: 'displayName', displayName: 'Display Name' }
          ]
        },
        parameters: { tenant: 'domain.onmicrosoft.com' },
        limit: 15
      };

      const azureResponse = {
        ...mockPreviewResponse,
        data: { ...mockPreviewResponse.data, source: 'azure' }
      };

      mockPreviewService.executePreview.mockResolvedValue(azureResponse);

      const req = createMockRequest({ body: azureRequest });
      const res = createMockResponse();

      await reportsController.testCustomQuery(req as Request, res as Response, mockNext);

      expect(mockPreviewService.executePreview).toHaveBeenCalledWith(azureRequest);
      expect(res.json).toHaveBeenCalledWith(azureResponse);
    });

    it('should handle O365 data source requests', async () => {
      const o365Request = {
        source: 'o365',
        query: {
          source: 'o365',
          fields: [
            { name: 'mail', displayName: 'Email Address' },
            { name: 'displayName', displayName: 'Display Name' }
          ]
        },
        parameters: { mailbox: 'All' },
        limit: 20
      };

      const o365Response = {
        ...mockPreviewResponse,
        data: { ...mockPreviewResponse.data, source: 'o365' }
      };

      mockPreviewService.executePreview.mockResolvedValue(o365Response);

      const req = createMockRequest({ body: o365Request });
      const res = createMockResponse();

      await reportsController.testCustomQuery(req as Request, res as Response, mockNext);

      expect(mockPreviewService.executePreview).toHaveBeenCalledWith(o365Request);
      expect(res.json).toHaveBeenCalledWith(o365Response);
    });

    it('should require authentication', async () => {
      const req = createMockRequest({ 
        user: undefined, // No authenticated user
        body: validRequestBody 
      });
      const res = createMockResponse();

      await reportsController.testCustomQuery(req as Request, res as Response, mockNext);

      expect(mockCreateError).toHaveBeenCalledWith('Authentication required', 401);
      expect(mockNext).toHaveBeenCalled();
      expect(mockPreviewService.executePreview).not.toHaveBeenCalled();
    });

    it('should handle PreviewService errors properly', async () => {
      const serviceError = new Error('Invalid query structure');
      mockPreviewService.executePreview.mockRejectedValue(serviceError);

      const req = createMockRequest({ body: validRequestBody });
      const res = createMockResponse();

      await reportsController.testCustomQuery(req as Request, res as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(serviceError);
      expect(res.json).not.toHaveBeenCalled();
    });

    it('should handle service factory initialization errors', async () => {
      const factoryError = new Error('PreviewService initialization failed');
      mockServiceFactory.getPreviewService.mockRejectedValue(factoryError);

      const req = createMockRequest({ body: validRequestBody });
      const res = createMockResponse();

      await reportsController.testCustomQuery(req as Request, res as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(factoryError);
      expect(res.json).not.toHaveBeenCalled();
    });

    it('should maintain exact response format from PreviewService', async () => {
      const complexPreviewResponse = {
        data: {
          columns: [
            { name: 'sAMAccountName', displayName: 'Username', type: 'string' },
            { name: 'displayName', displayName: 'Display Name', type: 'string' },
            { name: 'department', displayName: 'Department', type: 'string' },
            { name: 'lastLogon', displayName: 'Last Logon', type: 'datetime' }
          ],
          rows: [
            { 
              sAMAccountName: 'jdoe', 
              displayName: 'John Doe',
              department: 'IT',
              lastLogon: '2025-01-15T10:30:00Z'
            }
          ],
          rowCount: 1,
          totalCount: 50
        },
        metadata: {
          source: 'ad',
          executionTime: 245,
          cached: true,
          limit: 10,
          cacheHit: true,
          queryComplexity: 'medium'
        },
        success: true,
        warnings: ['Some fields may not be available in all environments']
      };

      mockPreviewService.executePreview.mockResolvedValue(complexPreviewResponse);

      const req = createMockRequest({ body: validRequestBody });
      const res = createMockResponse();

      await reportsController.testCustomQuery(req as Request, res as Response, mockNext);

      // Should return exactly what PreviewService returns, no modification
      expect(res.json).toHaveBeenCalledWith(complexPreviewResponse);
    });

    it('should pass through complex query structures correctly', async () => {
      const complexQuery = {
        source: 'ad',
        query: {
          source: 'ad',
          fields: [
            { name: 'sAMAccountName', displayName: 'Username' },
            { name: 'displayName', displayName: 'Display Name' },
            { name: 'department', displayName: 'Department' },
            { name: 'title', displayName: 'Job Title' }
          ],
          filters: [
            { field: 'enabled', operator: 'equals', value: true },
            { field: 'department', operator: 'contains', value: 'IT' },
            { field: 'lastLogon', operator: 'newer_than', value: '30d' }
          ],
          groupBy: 'department',
          orderBy: { field: 'displayName', direction: 'asc' }
        },
        parameters: { 
          includeDisabled: false,
          orgUnit: 'OU=Users,DC=domain,DC=local',
          maxResults: 100
        },
        limit: 50
      };

      mockPreviewService.executePreview.mockResolvedValue(mockPreviewResponse);

      const req = createMockRequest({ body: complexQuery });
      const res = createMockResponse();

      await reportsController.testCustomQuery(req as Request, res as Response, mockNext);

      expect(mockPreviewService.executePreview).toHaveBeenCalledWith(complexQuery);
    });

    it('should handle edge case with empty filters array', async () => {
      const requestWithEmptyFilters = {
        source: 'ad',
        query: {
          source: 'ad',
          fields: [{ name: 'sAMAccountName', displayName: 'Username' }],
          filters: [] // Empty filters array
        },
        parameters: {},
        limit: 5
      };

      mockPreviewService.executePreview.mockResolvedValue(mockPreviewResponse);

      const req = createMockRequest({ body: requestWithEmptyFilters });
      const res = createMockResponse();

      await reportsController.testCustomQuery(req as Request, res as Response, mockNext);

      expect(mockPreviewService.executePreview).toHaveBeenCalledWith(requestWithEmptyFilters);
    });

    it('should handle responses with different data structures', async () => {
      const responseWithNoData = {
        data: {
          columns: [],
          rows: [],
          rowCount: 0,
          totalCount: 0
        },
        metadata: {
          source: 'ad',
          executionTime: 50,
          cached: false,
          limit: 10
        },
        success: true,
        message: 'No data found matching the criteria'
      };

      mockPreviewService.executePreview.mockResolvedValue(responseWithNoData);

      const req = createMockRequest({ body: validRequestBody });
      const res = createMockResponse();

      await reportsController.testCustomQuery(req as Request, res as Response, mockNext);

      expect(res.json).toHaveBeenCalledWith(responseWithNoData);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle malformed request body gracefully', async () => {
      const malformedRequest = {
        // Missing required fields
        invalidField: 'invalid'
      };

      const req = createMockRequest({ body: malformedRequest });
      const res = createMockResponse();

      // PreviewService should handle validation
      const validationError = new Error('Invalid or missing data source');
      mockPreviewService.executePreview.mockRejectedValue(validationError);

      await reportsController.testCustomQuery(req as Request, res as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(validationError);
    });

    it('should handle timeout errors from PreviewService', async () => {
      const timeoutError = new Error('Query execution timeout');
      (timeoutError as any).code = 'TIMEOUT';
      mockPreviewService.executePreview.mockRejectedValue(timeoutError);

      const req = createMockRequest({ body: validRequestBody });
      const res = createMockResponse();

      await reportsController.testCustomQuery(req as Request, res as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(timeoutError);
    });

    it('should handle concurrent requests without interference', async () => {
      const responses = [
        { ...mockPreviewResponse, data: { ...mockPreviewResponse.data, queryId: 1 } },
        { ...mockPreviewResponse, data: { ...mockPreviewResponse.data, queryId: 2 } },
        { ...mockPreviewResponse, data: { ...mockPreviewResponse.data, queryId: 3 } }
      ];

      mockPreviewService.executePreview
        .mockResolvedValueOnce(responses[0])
        .mockResolvedValueOnce(responses[1])
        .mockResolvedValueOnce(responses[2]);

      const requests = [
        createMockRequest({ body: { ...validRequestBody, queryId: 1 } }),
        createMockRequest({ body: { ...validRequestBody, queryId: 2 } }),
        createMockRequest({ body: { ...validRequestBody, queryId: 3 } })
      ];

      const responseMocks = [
        createMockResponse(),
        createMockResponse(),
        createMockResponse()
      ];

      await Promise.all(requests.map((req, index) => 
        reportsController.testCustomQuery(req as Request, responseMocks[index] as Response, mockNext)
      ));

      responseMocks.forEach((resMock, index) => {
        expect(resMock.json).toHaveBeenCalledWith(responses[index]);
      });
    });
  });

  describe('Performance and Compatibility', () => {
    it('should maintain performance characteristics with new PreviewService', async () => {
      const startTime = Date.now();
      
      mockPreviewService.executePreview.mockImplementation(async () => {
        // Simulate fast response
        await new Promise(resolve => setTimeout(resolve, 10));
        return mockPreviewResponse;
      });

      const req = createMockRequest({ body: validRequestBody });
      const res = createMockResponse();

      await reportsController.testCustomQuery(req as Request, res as Response, mockNext);

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      expect(executionTime).toBeLessThan(100); // Should be fast
      expect(res.json).toHaveBeenCalledWith(mockPreviewResponse);
    });

    it('should maintain backward compatibility with existing API contract', async () => {
      // Test that the API still works with the exact same interface
      mockPreviewService.executePreview.mockResolvedValue(mockPreviewResponse);

      const legacyRequest = {
        source: 'ad',
        query: {
          source: 'ad',
          fields: [{ name: 'sAMAccountName', displayName: 'Username' }]
        }
        // No parameters or limit - should use defaults
      };

      const req = createMockRequest({ body: legacyRequest });
      const res = createMockResponse();

      await reportsController.testCustomQuery(req as Request, res as Response, mockNext);

      expect(mockPreviewService.executePreview).toHaveBeenCalledWith({
        source: 'ad',
        query: legacyRequest.query,
        parameters: {},
        limit: 10
      });
      expect(res.json).toHaveBeenCalledWith(mockPreviewResponse);
    });

    it('should handle large responses efficiently', async () => {
      const largeResponse = {
        ...mockPreviewResponse,
        data: {
          ...mockPreviewResponse.data,
          rows: Array.from({ length: 50 }, (_, i) => ({
            sAMAccountName: `user${i}`,
            displayName: `User ${i}`
          })),
          rowCount: 50
        }
      };

      mockPreviewService.executePreview.mockResolvedValue(largeResponse);

      const req = createMockRequest({ body: { ...validRequestBody, limit: 50 } });
      const res = createMockResponse();

      await reportsController.testCustomQuery(req as Request, res as Response, mockNext);

      expect(res.json).toHaveBeenCalledWith(largeResponse);
      expect(mockPreviewService.executePreview).toHaveBeenCalledWith({
        source: 'ad',
        query: validRequestBody.query,
        parameters: { orgUnit: 'Users' },
        limit: 50
      });
    });
  });

  describe('Service Integration Verification', () => {
    it('should properly delegate to PreviewService without modification', async () => {
      mockPreviewService.executePreview.mockResolvedValue(mockPreviewResponse);

      const req = createMockRequest({ body: validRequestBody });
      const res = createMockResponse();

      await reportsController.testCustomQuery(req as Request, res as Response, mockNext);

      // Verify exact delegation
      expect(mockServiceFactory.getPreviewService).toHaveBeenCalledTimes(1);
      expect(mockPreviewService.executePreview).toHaveBeenCalledTimes(1);
      expect(mockPreviewService.executePreview).toHaveBeenCalledWith({
        source: validRequestBody.source,
        query: validRequestBody.query,
        parameters: validRequestBody.parameters,
        limit: validRequestBody.limit
      });

      // Verify no transformation of response
      expect(res.json).toHaveBeenCalledWith(mockPreviewResponse);
    });

    it('should not add any additional processing or transformation', async () => {
      const originalResponse = {
        data: { test: 'value' },
        metadata: { custom: 'metadata' },
        success: true,
        customField: 'should be preserved'
      };

      mockPreviewService.executePreview.mockResolvedValue(originalResponse);

      const req = createMockRequest({ body: validRequestBody });
      const res = createMockResponse();

      await reportsController.testCustomQuery(req as Request, res as Response, mockNext);

      // Response should be exactly what PreviewService returned
      expect(res.json).toHaveBeenCalledWith(originalResponse);
    });
  });
});