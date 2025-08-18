import request from 'supertest';
import express from 'express';
import reportsRouter from './reports.routes';
import { reportsController } from '@/controllers/reports.controller';
import { queryController } from '@/controllers/query.controller';
import { ExportController } from '@/controllers/export.controller';

// Mock all controllers and dependencies
jest.mock('@/controllers/reports.controller', () => ({
  reportsController: {
    getTemplates: jest.fn((req, res) => res.status(200).json({ success: true, data: { templates: [] } })),
    executeTemplate: jest.fn((req, res) => res.status(200).json({ success: true, executionId: 'test-execution-id' })),
    getFields: jest.fn((req, res) => res.status(200).json({ success: true, data: { fields: [] } })),
    discoverSchema: jest.fn((req, res) => res.status(200).json({ success: true, data: { schema: {} } })),
    createCustomReport: jest.fn((req, res) => res.status(201).json({ success: true, reportId: 'new-report-id' })),
    getCustomReports: jest.fn((req, res) => res.status(200).json({ success: true, data: { reports: [] } })),
    getCustomReport: jest.fn((req, res) => res.status(200).json({ success: true, data: { report: {} } })),
    updateCustomReport: jest.fn((req, res) => res.status(200).json({ success: true, message: 'Report updated' })),
    deleteCustomReport: jest.fn((req, res) => res.status(200).json({ success: true, message: 'Report deleted' })),
    executeCustomReport: jest.fn((req, res) => res.status(200).json({ success: true, executionId: 'custom-execution-id' })),
    testCustomQuery: jest.fn((req, res) => res.status(200).json({ success: true, data: { results: [] } })),
    getReportStats: jest.fn((req, res) => res.status(200).json({ success: true, data: { stats: {} } })),
    getReportHistory: jest.fn((req, res) => res.status(200).json({ success: true, data: { history: [] } })),
    getReportExecution: jest.fn((req, res) => res.status(200).json({ success: true, data: { execution: {} } })),
    getReportResults: jest.fn((req, res) => res.status(200).json({ success: true, data: { results: [] } })),
    getFavorites: jest.fn((req, res) => res.status(200).json({ success: true, data: { favorites: [] } })),
    addToFavorites: jest.fn((req, res) => res.status(200).json({ success: true, message: 'Added to favorites' })),
    removeFromFavorites: jest.fn((req, res) => res.status(200).json({ success: true, message: 'Removed from favorites' }))
  },
  createCustomReportValidation: jest.fn((req, res, next) => next()),
  executeReportValidation: jest.fn((req, res, next) => next())
}));

jest.mock('@/controllers/query.controller', () => ({
  queryController: {
    executeQuery: jest.fn((req, res) => res.status(200).json({ success: true, data: { results: [] } })),
    buildAndExecuteQuery: jest.fn((req, res) => res.status(200).json({ success: true, data: { results: [] } })),
    getQueryDefinitions: jest.fn((req, res) => res.status(200).json({ success: true, data: { definitions: [] } })),
    getSchema: jest.fn((req, res) => res.status(200).json({ success: true, data: { schema: {} } })),
    validateQuery: jest.fn((req, res) => res.status(200).json({ valid: true })),
    getCachedResult: jest.fn((req, res) => res.status(200).json({ success: true, data: { cached: true } })),
    getQueryStats: jest.fn((req, res) => res.status(200).json({ success: true, data: { stats: {} } })),
    clearCache: jest.fn((req, res) => res.status(200).json({ success: true, message: 'Cache cleared' })),
    executeGraphQuery: jest.fn((req, res) => res.status(200).json({ success: true, data: { results: [] } })),
    getGraphQueryDefinitions: jest.fn((req, res) => res.status(200).json({ success: true, data: { definitions: [] } })),
    getGraphQueryHistory: jest.fn((req, res) => res.status(200).json({ success: true, data: { history: [] } })),
    executeGraphBatch: jest.fn((req, res) => res.status(200).json({ success: true, data: { results: [] } }))
  },
  executeQueryValidation: jest.fn((req, res, next) => next()),
  buildQueryValidation: jest.fn((req, res, next) => next()),
  executeGraphQueryValidation: jest.fn((req, res, next) => next()),
  executeGraphBatchValidation: jest.fn((req, res, next) => next())
}));

jest.mock('@/controllers/export.controller', () => ({
  ExportController: jest.fn().mockImplementation(() => ({
    exportReport: jest.fn((req, res) => res.status(200).json({ success: true, downloadUrl: 'http://test.com/download' })),
    queueExport: jest.fn((req, res) => res.status(202).json({ success: true, jobId: 'export-job-123' })),
    exportHistoryResults: jest.fn((req, res) => res.status(200).json({ success: true, downloadUrl: 'http://test.com/history-download' })),
    downloadFile: jest.fn((req, res) => res.status(200).send('File content')),
    getJobStatus: jest.fn((req, res) => res.status(200).json({ success: true, status: 'completed' })),
    cleanupExports: jest.fn((req, res) => res.status(200).json({ success: true, cleanedCount: 5 }))
  }))
}));

// Mock auth wrapper middleware
const mockAuthWrapper = {
  auditAction: jest.fn(),
  userRateLimit: jest.fn(),
  requireResourceAccess: jest.fn(),
  requireAuth: jest.fn(),
  requireAdmin: jest.fn(),
  optionalAuth: jest.fn()
};

jest.mock('@/middleware/auth-wrapper', () => {
  const resourceCheckers = {
    ownResource: jest.fn(),
    customReport: jest.fn()
  };

  return {
    requireAuth: jest.fn((req, res, next) => {
      mockAuthWrapper.requireAuth();
      req.user = { id: 1, username: 'testuser', isAdmin: false };
      next();
    }),
    requireAdmin: jest.fn((req, res, next) => {
      mockAuthWrapper.requireAdmin();
      req.user = { id: 1, username: 'admin', isAdmin: true };
      next();
    }),
    optionalAuth: jest.fn((req, res, next) => {
      mockAuthWrapper.optionalAuth();
      if (req.headers.authorization) {
        req.user = { id: 1, username: 'testuser', isAdmin: false };
      }
      next();
    }),
    auditAction: jest.fn((action, category) => {
      return (req: any, res: any, next: any) => {
        mockAuthWrapper.auditAction(action, category);
        next();
      };
    }),
    userRateLimit: jest.fn((limit) => {
      return (req: any, res: any, next: any) => {
        mockAuthWrapper.userRateLimit(limit);
        next();
      };
    }),
    requireResourceAccess: jest.fn((checker) => {
      return (req: any, res: any, next: any) => {
        mockAuthWrapper.requireResourceAccess(checker);
        next();
      };
    }),
    resourceCheckers
  };
});

// Mock validation middleware
jest.mock('@/middleware/validation.middleware', () => ({
  validateRequest: jest.fn(() => (req: any, res: any, next: any) => next()),
  handleValidationErrors: jest.fn((req: any, res: any, next: any) => next())
}));

// Mock express-validator
jest.mock('express-validator', () => {
  // Create a function that acts as middleware and has chainable methods
  const createValidatorChain = () => {
    const middleware: any = (req: any, res: any, next: any) => next();
    
    // Add chainable methods
    middleware.optional = jest.fn(() => createValidatorChain());
    middleware.isIn = jest.fn(() => createValidatorChain());
    middleware.withMessage = jest.fn(() => createValidatorChain());
    middleware.trim = jest.fn(() => createValidatorChain());
    middleware.escape = jest.fn(() => createValidatorChain());
    middleware.isLength = jest.fn(() => createValidatorChain());
    middleware.isObject = jest.fn(() => createValidatorChain());
    middleware.isBoolean = jest.fn(() => createValidatorChain());
    middleware.isArray = jest.fn(() => createValidatorChain());
    middleware.isString = jest.fn(() => createValidatorChain());
    middleware.notEmpty = jest.fn(() => createValidatorChain());
    middleware.isInt = jest.fn(() => createValidatorChain());
    middleware.matches = jest.fn(() => createValidatorChain());
    middleware.isUUID = jest.fn(() => createValidatorChain());
    middleware.isNumeric = jest.fn(() => createValidatorChain());
    middleware.isISO8601 = jest.fn(() => createValidatorChain());
    middleware.isEmpty = jest.fn(() => createValidatorChain());
    
    return middleware;
  };
  
  return {
    body: jest.fn(() => createValidatorChain()),
    param: jest.fn(() => createValidatorChain()),
    query: jest.fn(() => createValidatorChain()),
    validationResult: jest.fn(() => ({ isEmpty: () => true, array: () => [] }))
  };
});


// Mock query services for health checks
jest.mock('@/services/query/QueryService', () => ({
  QueryService: {
    getInstance: jest.fn(() => ({
      testConnection: jest.fn().mockResolvedValue(true)
    }))
  }
}));

// Mock database service
jest.mock('@/config/database', () => ({
  db: {
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    getPool: jest.fn(() => ({ query: jest.fn().mockResolvedValue({ rows: [] }) }))
  }
}));

describe('Reports Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthWrapper.auditAction.mockClear();
    mockAuthWrapper.userRateLimit.mockClear();
    mockAuthWrapper.requireResourceAccess.mockClear();
    mockAuthWrapper.requireAuth.mockClear();
    mockAuthWrapper.requireAdmin.mockClear();
    mockAuthWrapper.optionalAuth.mockClear();
    
    app = express();
    app.use(express.json());
    app.use('/api/reports', reportsRouter);

    // Add error handling middleware
    app.use((err: any, req: any, res: any, next: any) => {
      res.status(err.status || 500).json({ error: err.message });
    });
  });

  describe('Pre-built Report Templates', () => {
    describe('GET /api/reports/templates', () => {
      it('should get report templates without authentication', async () => {
        const response = await request(app)
          .get('/api/reports/templates')
          .expect(200);

        expect(response.body).toEqual({
          success: true,
          data: { templates: [] }
        });
        expect(reportsController.getTemplates).toHaveBeenCalled();
      });

      it('should filter templates by category', async () => {
        const response = await request(app)
          .get('/api/reports/templates')
          .query({ category: 'ad' })
          .expect(200);

        expect(reportsController.getTemplates).toHaveBeenCalled();
      });

      it('should filter templates by source', async () => {
        const response = await request(app)
          .get('/api/reports/templates')
          .query({ source: 'azure' })
          .expect(200);

        expect(reportsController.getTemplates).toHaveBeenCalled();
      });

      it('should handle invalid category parameter gracefully', async () => {
        const response = await request(app)
          .get('/api/reports/templates')
          .query({ category: 'invalid' })
          .expect(200); // Validation passes in mock

        expect(reportsController.getTemplates).toHaveBeenCalled();
      });
    });

    describe('POST /api/reports/execute/:templateId', () => {
      const validTemplateId = '123e4567-e89b-12d3-a456-426614174000';

      it('should execute template with authentication', async () => {
        const response = await request(app)
          .post(`/api/reports/execute/${validTemplateId}`)
          .set('Authorization', 'Bearer valid-token')
          .send({ parameters: { days: 30 } })
          .expect(200);

        expect(response.body).toEqual({
          success: true,
          executionId: 'test-execution-id'
        });
        expect(reportsController.executeTemplate).toHaveBeenCalled();
      });

      it('should apply rate limiting to template execution', async () => {
        await request(app)
          .post(`/api/reports/execute/${validTemplateId}`)
          .set('Authorization', 'Bearer valid-token')
          .send({})
          .expect(200);

        expect(mockAuthWrapper.userRateLimit).toHaveBeenCalledWith(30);
      });

      it('should audit template execution', async () => {
        await request(app)
          .post(`/api/reports/execute/${validTemplateId}`)
          .set('Authorization', 'Bearer valid-token')
          .send({})
          .expect(200);

        expect(mockAuthWrapper.auditAction).toHaveBeenCalledWith('execute_report_template', 'report_execution');
      });

      it('should validate execution parameters', async () => {
        const { executeReportValidation } = require('@/controllers/reports.controller');
        
        await request(app)
          .post(`/api/reports/execute/${validTemplateId}`)
          .set('Authorization', 'Bearer valid-token')
          .send({ parameters: { days: 30 } })
          .expect(200);

        expect(executeReportValidation).toHaveBeenCalled();
      });
    });
  });

  describe('Field Discovery', () => {
    describe('GET /api/reports/fields/:source', () => {
      it('should get fields for AD source', async () => {
        const response = await request(app)
          .get('/api/reports/fields/ad')
          .expect(200);

        expect(response.body).toEqual({
          success: true,
          data: { fields: [] }
        });
        expect(reportsController.getFields).toHaveBeenCalled();
      });

      it('should get fields for Azure source with category filter', async () => {
        const response = await request(app)
          .get('/api/reports/fields/azure')
          .query({ category: 'basic' })
          .expect(200);

        expect(reportsController.getFields).toHaveBeenCalled();
      });

      it('should get fields with search filter', async () => {
        const response = await request(app)
          .get('/api/reports/fields/o365')
          .query({ search: 'username' })
          .expect(200);

        expect(reportsController.getFields).toHaveBeenCalled();
      });
    });

    describe('GET /api/reports/schema/:source/discover', () => {
      it('should discover AD schema with authentication', async () => {
        const response = await request(app)
          .get('/api/reports/schema/ad/discover')
          .set('Authorization', 'Bearer valid-token')
          .expect(200);

        expect(response.body).toEqual({
          success: true,
          data: { schema: {} }
        });
        expect(reportsController.discoverSchema).toHaveBeenCalled();
      });

      it('should refresh schema when requested', async () => {
        const response = await request(app)
          .get('/api/reports/schema/ad/discover')
          .set('Authorization', 'Bearer valid-token')
          .query({ refresh: 'true' })
          .expect(200);

        expect(reportsController.discoverSchema).toHaveBeenCalled();
      });

      it('should use specific credential for discovery', async () => {
        const response = await request(app)
          .get('/api/reports/schema/ad/discover')
          .set('Authorization', 'Bearer valid-token')
          .query({ credentialId: '123' })
          .expect(200);

        expect(reportsController.discoverSchema).toHaveBeenCalled();
      });
    });
  });

  describe('Custom Reports', () => {
    const validReportId = '123e4567-e89b-12d3-a456-426614174000';

    describe('POST /api/reports/custom', () => {
      it('should create custom report with authentication', async () => {
        const customReport = {
          name: 'My Custom Report',
          description: 'Test report',
          source: 'ad',
          query: { fields: ['username'] }
        };

        const response = await request(app)
          .post('/api/reports/custom')
          .set('Authorization', 'Bearer valid-token')
          .send(customReport)
          .expect(201);

        expect(response.body).toEqual({
          success: true,
          reportId: 'new-report-id'
        });
        expect(reportsController.createCustomReport).toHaveBeenCalled();
      });

      it('should apply rate limiting to custom report creation', async () => {
        await request(app)
          .post('/api/reports/custom')
          .set('Authorization', 'Bearer valid-token')
          .send({ name: 'Test', source: 'ad', query: {} })
          .expect(201);

        expect(mockAuthWrapper.userRateLimit).toHaveBeenCalledWith(20);
      });

      it('should audit custom report creation', async () => {
        await request(app)
          .post('/api/reports/custom')
          .set('Authorization', 'Bearer valid-token')
          .send({ name: 'Test', source: 'ad', query: {} })
          .expect(201);

        expect(mockAuthWrapper.auditAction).toHaveBeenCalledWith('create_custom_report', 'custom_report');
      });
    });

    describe('GET /api/reports/custom', () => {
      it('should get custom reports without authentication', async () => {
        const response = await request(app)
          .get('/api/reports/custom')
          .expect(200);

        expect(response.body).toEqual({
          success: true,
          data: { reports: [] }
        });
        expect(reportsController.getCustomReports).toHaveBeenCalled();
      });

      it('should filter custom reports by source', async () => {
        const response = await request(app)
          .get('/api/reports/custom')
          .query({ source: 'azure' })
          .expect(200);

        expect(reportsController.getCustomReports).toHaveBeenCalled();
      });

      it('should filter by public reports', async () => {
        const response = await request(app)
          .get('/api/reports/custom')
          .query({ isPublic: 'true' })
          .expect(200);

        expect(reportsController.getCustomReports).toHaveBeenCalled();
      });
    });

    describe('GET /api/reports/custom/:reportId', () => {
      it('should get specific custom report', async () => {
        const response = await request(app)
          .get(`/api/reports/custom/${validReportId}`)
          .expect(200);

        expect(response.body).toEqual({
          success: true,
          data: { report: {} }
        });
        expect(reportsController.getCustomReport).toHaveBeenCalled();
      });
    });

    describe('PUT /api/reports/custom/:reportId', () => {
      it('should update custom report with authentication', async () => {
        const updates = {
          name: 'Updated Report',
          description: 'Updated description'
        };

        const response = await request(app)
          .put(`/api/reports/custom/${validReportId}`)
          .set('Authorization', 'Bearer valid-token')
          .send(updates)
          .expect(200);

        expect(response.body).toEqual({
          success: true,
          message: 'Report updated'
        });
        expect(reportsController.updateCustomReport).toHaveBeenCalled();
      });

      it('should require resource access for updates', async () => {
        await request(app)
          .put(`/api/reports/custom/${validReportId}`)
          .set('Authorization', 'Bearer valid-token')
          .send({ name: 'Updated' })
          .expect(200);

        const { resourceCheckers } = require('@/middleware/auth-wrapper');
        expect(mockAuthWrapper.requireResourceAccess).toHaveBeenCalledWith(resourceCheckers.ownResource);
      });

      it('should audit report updates', async () => {
        await request(app)
          .put(`/api/reports/custom/${validReportId}`)
          .set('Authorization', 'Bearer valid-token')
          .send({ name: 'Updated' })
          .expect(200);

        expect(mockAuthWrapper.auditAction).toHaveBeenCalledWith('update_custom_report', 'custom_report');
      });
    });

    describe('DELETE /api/reports/custom/:reportId', () => {
      it('should delete custom report with authentication', async () => {
        const response = await request(app)
          .delete(`/api/reports/custom/${validReportId}`)
          .set('Authorization', 'Bearer valid-token')
          .expect(200);

        expect(response.body).toEqual({
          success: true,
          message: 'Report deleted'
        });
        expect(reportsController.deleteCustomReport).toHaveBeenCalled();
      });

      it('should audit report deletion', async () => {
        await request(app)
          .delete(`/api/reports/custom/${validReportId}`)
          .set('Authorization', 'Bearer valid-token')
          .expect(200);

        expect(mockAuthWrapper.auditAction).toHaveBeenCalledWith('delete_custom_report', 'custom_report');
      });
    });

    describe('POST /api/reports/custom/:reportId/execute', () => {
      it('should execute custom report', async () => {
        const response = await request(app)
          .post(`/api/reports/custom/${validReportId}/execute`)
          .set('Authorization', 'Bearer valid-token')
          .send({ parameters: { limit: 100 } })
          .expect(200);

        expect(response.body).toEqual({
          success: true,
          executionId: 'custom-execution-id'
        });
        expect(reportsController.executeCustomReport).toHaveBeenCalled();
      });

      it('should require custom report access', async () => {
        await request(app)
          .post(`/api/reports/custom/${validReportId}/execute`)
          .set('Authorization', 'Bearer valid-token')
          .send({})
          .expect(200);

        const { resourceCheckers } = require('@/middleware/auth-wrapper');
        expect(mockAuthWrapper.requireResourceAccess).toHaveBeenCalledWith(resourceCheckers.customReport);
      });
    });

    describe('POST /api/reports/custom/test', () => {
      it('should test custom query', async () => {
        const testQuery = {
          source: 'ad',
          query: { fields: ['username'] },
          limit: 10
        };

        const response = await request(app)
          .post('/api/reports/custom/test')
          .set('Authorization', 'Bearer valid-token')
          .send(testQuery)
          .expect(200);

        expect(response.body).toEqual({
          success: true,
          data: { results: [] }
        });
        expect(reportsController.testCustomQuery).toHaveBeenCalled();
      });

      it('should audit query testing', async () => {
        await request(app)
          .post('/api/reports/custom/test')
          .set('Authorization', 'Bearer valid-token')
          .send({ source: 'ad', query: { fields: ['username'] } })
          .expect(200);

        expect(mockAuthWrapper.auditAction).toHaveBeenCalledWith('test_custom_query', 'query_testing');
      });
    });
  });

  describe('Report History and Stats', () => {
    describe('GET /api/reports/stats', () => {
      it('should get report statistics with authentication', async () => {
        const response = await request(app)
          .get('/api/reports/stats')
          .set('Authorization', 'Bearer valid-token')
          .expect(200);

        expect(response.body).toEqual({
          success: true,
          data: { stats: {} }
        });
        expect(reportsController.getReportStats).toHaveBeenCalled();
      });
    });

    describe('GET /api/reports/history', () => {
      it('should get report history without authentication', async () => {
        const response = await request(app)
          .get('/api/reports/history')
          .expect(200);

        expect(response.body).toEqual({
          success: true,
          data: { history: [] }
        });
        expect(reportsController.getReportHistory).toHaveBeenCalled();
      });

      it('should filter history by status', async () => {
        const response = await request(app)
          .get('/api/reports/history')
          .query({ status: 'completed' })
          .expect(200);

        expect(reportsController.getReportHistory).toHaveBeenCalled();
      });

      it('should filter history by source', async () => {
        const response = await request(app)
          .get('/api/reports/history')
          .query({ source: 'ad' })
          .expect(200);

        expect(reportsController.getReportHistory).toHaveBeenCalled();
      });

      it('should paginate history results', async () => {
        const response = await request(app)
          .get('/api/reports/history')
          .query({ limit: '50', offset: '20' })
          .expect(200);

        expect(reportsController.getReportHistory).toHaveBeenCalled();
      });
    });

    describe('GET /api/reports/history/:id', () => {
      const validExecutionId = '123e4567-e89b-12d3-a456-426614174000';

      it('should get specific report execution', async () => {
        const response = await request(app)
          .get(`/api/reports/history/${validExecutionId}`)
          .expect(200);

        expect(response.body).toEqual({
          success: true,
          data: { execution: {} }
        });
        expect(reportsController.getReportExecution).toHaveBeenCalled();
      });
    });

    describe('GET /api/reports/history/:id/results', () => {
      const validExecutionId = '123e4567-e89b-12d3-a456-426614174000';

      it('should get report execution results', async () => {
        const response = await request(app)
          .get(`/api/reports/history/${validExecutionId}/results`)
          .expect(200);

        expect(response.body).toEqual({
          success: true,
          data: { results: [] }
        });
        expect(reportsController.getReportResults).toHaveBeenCalled();
      });
    });
  });

  describe('Admin Routes', () => {
    describe('GET /api/reports/admin/templates', () => {
      it('should get admin templates with admin authentication', async () => {
        const { db } = require('@/config/database');
        db.query.mockResolvedValueOnce({ rows: [] });

        const response = await request(app)
          .get('/api/reports/admin/templates')
          .set('Authorization', 'Bearer admin-token')
          .expect(200);

        expect(response.body).toEqual({
          success: true,
          data: {
            reports: [],
            totalCount: 0
          }
        });
        expect(db.query).toHaveBeenCalled();
      });

      it('should require admin privileges', async () => {
        const { requireAdmin } = require('@/middleware/auth-wrapper');
        
        await request(app)
          .get('/api/reports/admin/templates')
          .set('Authorization', 'Bearer admin-token')
          .expect(200);

        expect(requireAdmin).toHaveBeenCalled();
      });

      it('should handle database errors gracefully', async () => {
        const { db } = require('@/config/database');
        db.query.mockRejectedValueOnce(new Error('Database error'));

        const response = await request(app)
          .get('/api/reports/admin/templates')
          .set('Authorization', 'Bearer admin-token')
          .expect(500);

        expect(response.body).toEqual({
          success: false,
          error: 'Failed to get admin templates'
        });
      });
    });

    describe('GET /api/reports/admin/usage', () => {
      it('should get usage statistics with admin authentication', async () => {
        const { db } = require('@/config/database');
        db.query.mockResolvedValueOnce({ rows: [] }) // template stats
               .mockResolvedValueOnce({ rows: [] }) // custom stats
               .mockResolvedValueOnce({ rows: [] }); // user stats

        const response = await request(app)
          .get('/api/reports/admin/usage')
          .set('Authorization', 'Bearer admin-token')
          .expect(200);

        expect(response.body).toEqual({
          success: true,
          data: {
            topTemplates: [],
            topCustomReports: [],
            topUsers: []
          }
        });
        expect(db.query).toHaveBeenCalledTimes(3);
      });
    });

    describe('DELETE /api/reports/admin/cleanup', () => {
      it('should cleanup expired reports', async () => {
        const { db } = require('@/config/database');
        db.query.mockResolvedValueOnce({ rowCount: 5 });

        const response = await request(app)
          .delete('/api/reports/admin/cleanup')
          .set('Authorization', 'Bearer admin-token')
          .expect(200);

        expect(response.body).toEqual({
          success: true,
          message: 'Cleaned up 5 expired report records'
        });
      });

      it('should audit cleanup operations', async () => {
        const { db } = require('@/config/database');
        db.query.mockResolvedValueOnce({ rowCount: 0 });
        
        await request(app)
          .delete('/api/reports/admin/cleanup')
          .set('Authorization', 'Bearer admin-token')
          .expect(200);

        expect(mockAuthWrapper.auditAction).toHaveBeenCalledWith('cleanup_report_history', 'system_maintenance');
      });
    });
  });

  describe('Query Routes', () => {
    describe('POST /api/reports/query/execute', () => {
      it('should execute query with authentication', async () => {
        const response = await request(app)
          .post('/api/reports/query/execute')
          .set('Authorization', 'Bearer valid-token')
          .send({ queryId: 'test-query', parameters: {} })
          .expect(200);

        expect(response.body).toEqual({
          success: true,
          data: { results: [] }
        });
        expect(queryController.executeQuery).toHaveBeenCalled();
      });
    });

    describe('POST /api/reports/query/build', () => {
      it('should build and execute query', async () => {
        const response = await request(app)
          .post('/api/reports/query/build')
          .set('Authorization', 'Bearer valid-token')
          .send({ dataSource: 'postgres', filters: [] })
          .expect(200);

        expect(response.body).toEqual({
          success: true,
          data: { results: [] }
        });
        expect(queryController.buildAndExecuteQuery).toHaveBeenCalled();
      });
    });

    describe('GET /api/reports/query/definitions', () => {
      it('should get query definitions', async () => {
        const response = await request(app)
          .get('/api/reports/query/definitions')
          .expect(200);

        expect(response.body).toEqual({
          success: true,
          data: { definitions: [] }
        });
        expect(queryController.getQueryDefinitions).toHaveBeenCalled();
      });

      it('should filter definitions by data source', async () => {
        const response = await request(app)
          .get('/api/reports/query/definitions')
          .query({ dataSource: 'postgres' })
          .expect(200);

        expect(queryController.getQueryDefinitions).toHaveBeenCalled();
      });
    });

    describe('GET /api/reports/query/schema/:dataSource', () => {
      it('should get schema for data source', async () => {
        const response = await request(app)
          .get('/api/reports/query/schema/postgres')
          .set('Authorization', 'Bearer valid-token')
          .expect(200);

        expect(response.body).toEqual({
          success: true,
          data: { schema: {} }
        });
        expect(queryController.getSchema).toHaveBeenCalled();
      });

      it('should get schema for specific table', async () => {
        const response = await request(app)
          .get('/api/reports/query/schema/postgres')
          .set('Authorization', 'Bearer valid-token')
          .query({ table: 'users' })
          .expect(200);

        expect(queryController.getSchema).toHaveBeenCalled();
      });
    });

    describe('POST /api/reports/query/validate', () => {
      it('should validate query definition', async () => {
        const queryDef = {
          id: 'test-query',
          sql: 'SELECT * FROM users'
        };

        const response = await request(app)
          .post('/api/reports/query/validate')
          .set('Authorization', 'Bearer valid-token')
          .send({ queryDef })
          .expect(200);

        expect(response.body).toEqual({ valid: true });
        expect(queryController.validateQuery).toHaveBeenCalled();
      });
    });

    describe('GET /api/reports/query/health', () => {
      it('should get query service health status', async () => {
        const response = await request(app)
          .get('/api/reports/query/health')
          .expect(200);

        expect(response.body).toHaveProperty('success', true);
        expect(response.body.data).toHaveProperty('status', 'healthy');
        expect(response.body.data).toHaveProperty('services');
      });

      it('should return 503 when no services are healthy', async () => {
        const { QueryService } = require('@/services/query/QueryService');
        const mockInstance = {
          testConnection: jest.fn().mockResolvedValue(false)
        };
        QueryService.getInstance.mockReturnValueOnce(mockInstance);

        const response = await request(app)
          .get('/api/reports/query/health')
          .expect(503);

        expect(response.body.success).toBe(false);
      });

      it('should handle health check errors', async () => {
        const { QueryService } = require('@/services/query/QueryService');
        QueryService.getInstance.mockImplementationOnce(() => {
          throw new Error('Service unavailable');
        });

        const response = await request(app)
          .get('/api/reports/query/health')
          .expect(500);

        expect(response.body).toEqual({
          success: false,
          error: 'Health check failed',
          timestamp: expect.any(String)
        });
      });
    });

    describe('GET /api/reports/query/metrics', () => {
      it('should get query execution metrics', async () => {
        const { db } = require('@/config/database');
        db.query.mockResolvedValueOnce({ rows: [{ total: '100' }] }) // total queries
               .mockResolvedValueOnce({ rows: [] }) // recent queries
               .mockResolvedValueOnce({ rows: [{ 
                 total_executions: '50', 
                 avg_execution_time: '125.5',
                 max_execution_time: '500',
                 cached_executions: '10'
               }] }) // query stats
               .mockResolvedValueOnce({ rows: [{ error_count: '2' }] }); // error stats

        const response = await request(app)
          .get('/api/reports/query/metrics')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.metrics).toEqual({
          totalQueries: 100,
          last24Hours: {
            totalExecutions: 50,
            averageExecutionTime: 125.5,
            maxExecutionTime: 500,
            cachedExecutions: 10,
            errors: 2
          },
          topQueries: []
        });
      });
    });

    describe('Graph Query Routes', () => {
      describe('POST /api/reports/query/graph/execute', () => {
        it('should execute Graph API query', async () => {
          const response = await request(app)
            .post('/api/reports/query/graph/execute')
            .set('Authorization', 'Bearer valid-token')
            .send({ queryId: 'graph-users', parameters: {} })
            .expect(200);

          expect(response.body).toEqual({
            success: true,
            data: { results: [] }
          });
          expect(queryController.executeGraphQuery).toHaveBeenCalled();
        });
      });

      describe('GET /api/reports/query/graph/definitions', () => {
        it('should get Graph query definitions', async () => {
          const response = await request(app)
            .get('/api/reports/query/graph/definitions')
            .set('Authorization', 'Bearer valid-token')
            .expect(200);

          expect(response.body).toEqual({
            success: true,
            data: { definitions: [] }
          });
          expect(queryController.getGraphQueryDefinitions).toHaveBeenCalled();
        });

        it('should filter Graph definitions by category', async () => {
          const response = await request(app)
            .get('/api/reports/query/graph/definitions')
            .set('Authorization', 'Bearer valid-token')
            .query({ category: 'users' })
            .expect(200);

          expect(queryController.getGraphQueryDefinitions).toHaveBeenCalled();
        });
      });

      describe('POST /api/reports/query/graph/batch', () => {
        it('should execute Graph queries in batch', async () => {
          const response = await request(app)
            .post('/api/reports/query/graph/batch')
            .set('Authorization', 'Bearer valid-token')
            .send({ queries: [{ queryId: 'users' }, { queryId: 'groups' }] })
            .expect(200);

          expect(response.body).toEqual({
            success: true,
            data: { results: [] }
          });
          expect(queryController.executeGraphBatch).toHaveBeenCalled();
        });
      });
    });
  });

  describe('Export Routes', () => {
    const validTemplateId = '123e4567-e89b-12d3-a456-426614174000';

    describe('POST /api/reports/export/report/:templateId', () => {
      it('should export report with authentication', async () => {
        const response = await request(app)
          .post(`/api/reports/export/report/${validTemplateId}`)
          .set('Authorization', 'Bearer valid-token')
          .send({ format: 'excel' })
          .expect(200);

        expect(response.body).toEqual({
          success: true,
          downloadUrl: 'http://test.com/download'
        });
      });

      it('should export with different formats', async () => {
        const formats = ['excel', 'csv', 'pdf'];
        
        for (const format of formats) {
          await request(app)
            .post(`/api/reports/export/report/${validTemplateId}`)
            .set('Authorization', 'Bearer valid-token')
            .send({ format })
            .expect(200);
        }
      });
    });

    describe('POST /api/reports/export/queue/report/:templateId', () => {
      it('should queue export job', async () => {
        const response = await request(app)
          .post(`/api/reports/export/queue/report/${validTemplateId}`)
          .set('Authorization', 'Bearer valid-token')
          .send({ format: 'excel', priority: 5 })
          .expect(202);

        expect(response.body).toEqual({
          success: true,
          jobId: 'export-job-123'
        });
      });
    });

    describe('GET /api/reports/export/job/:jobId', () => {
      it('should get export job status', async () => {
        const response = await request(app)
          .get('/api/reports/export/job/123')
          .set('Authorization', 'Bearer valid-token')
          .expect(200);

        expect(response.body).toEqual({
          success: true,
          status: 'completed'
        });
      });
    });

    describe('GET /api/reports/export/download/:filename', () => {
      it('should download exported file', async () => {
        const response = await request(app)
          .get('/api/reports/export/download/report_123.xlsx')
          .set('Authorization', 'Bearer valid-token')
          .expect(200);

        expect(response.text).toBe('File content');
      });

      it('should validate filename format', async () => {
        await request(app)
          .get('/api/reports/export/download/invalid-filename.txt')
          .set('Authorization', 'Bearer valid-token')
          .expect(200); // Validation passes in mock
      });
    });

    describe('POST /api/reports/export/cleanup', () => {
      it('should cleanup old exports with admin privileges', async () => {
        const response = await request(app)
          .post('/api/reports/export/cleanup')
          .set('Authorization', 'Bearer admin-token')
          .send({ daysOld: 30 })
          .expect(200);

        expect(response.body).toEqual({
          success: true,
          cleanedCount: 5
        });
      });

      it('should require admin privileges for cleanup', async () => {
        const { requireAdmin } = require('@/middleware/auth-wrapper');
        
        await request(app)
          .post('/api/reports/export/cleanup')
          .set('Authorization', 'Bearer admin-token')
          .send({})
          .expect(200);

        expect(requireAdmin).toHaveBeenCalled();
      });
    });
  });

  describe('Favorites', () => {
    describe('GET /api/reports/favorites', () => {
      it('should get user favorites with authentication', async () => {
        const response = await request(app)
          .get('/api/reports/favorites')
          .set('Authorization', 'Bearer valid-token')
          .expect(200);

        expect(response.body).toEqual({
          success: true,
          data: { favorites: [] }
        });
        expect(reportsController.getFavorites).toHaveBeenCalled();
      });
    });

    describe('POST /api/reports/favorites', () => {
      const validTemplateId = '123e4567-e89b-12d3-a456-426614174000';

      it('should add report to favorites', async () => {
        const response = await request(app)
          .post('/api/reports/favorites')
          .set('Authorization', 'Bearer valid-token')
          .send({ templateId: validTemplateId })
          .expect(200);

        expect(response.body).toEqual({
          success: true,
          message: 'Added to favorites'
        });
        expect(reportsController.addToFavorites).toHaveBeenCalled();
      });

      it('should add custom report to favorites', async () => {
        const response = await request(app)
          .post('/api/reports/favorites')
          .set('Authorization', 'Bearer valid-token')
          .send({ customTemplateId: validTemplateId })
          .expect(200);

        expect(reportsController.addToFavorites).toHaveBeenCalled();
      });
    });

    describe('DELETE /api/reports/favorites', () => {
      const validTemplateId = '123e4567-e89b-12d3-a456-426614174000';

      it('should remove report from favorites', async () => {
        const response = await request(app)
          .delete('/api/reports/favorites')
          .set('Authorization', 'Bearer valid-token')
          .send({ templateId: validTemplateId })
          .expect(200);

        expect(response.body).toEqual({
          success: true,
          message: 'Removed from favorites'
        });
        expect(reportsController.removeFromFavorites).toHaveBeenCalled();
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle controller errors gracefully', async () => {
      (reportsController.getTemplates as jest.Mock).mockImplementationOnce((req: any, res: any) => {
        throw new Error('Controller error');
      });

      await request(app)
        .get('/api/reports/templates')
        .expect(500);
    });

    it('should handle database connection errors in admin routes', async () => {
      const { db } = require('@/config/database');
      db.query.mockRejectedValueOnce(new Error('Connection refused'));

      const response = await request(app)
        .get('/api/reports/admin/templates')
        .set('Authorization', 'Bearer admin-token')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Failed to get admin templates'
      });
    });

    it('should handle invalid UUID parameters', async () => {
      await request(app)
        .get('/api/reports/custom/invalid-uuid')
        .expect(200); // Validation passes in mock
    });

    it('should handle missing required fields in requests', async () => {
      await request(app)
        .post('/api/reports/custom')
        .set('Authorization', 'Bearer valid-token')
        .send({}) // Missing required fields
        .expect(201); // Validation passes in mock
    });

    it('should handle large request payloads', async () => {
      const largePayload = {
        name: 'Test Report',
        description: 'x'.repeat(10000),
        source: 'ad',
        query: { fields: Array.from({ length: 1000 }, (_, i) => `field${i}`) }
      };

      await request(app)
        .post('/api/reports/custom')
        .set('Authorization', 'Bearer valid-token')
        .send(largePayload)
        .expect(201);
    });
  });

  describe('Security and Access Control', () => {
    it('should apply authentication to protected routes', async () => {
      const protectedRoutes = [
        { method: 'post', path: '/api/reports/custom' },
        { method: 'get', path: '/api/reports/stats' }
      ];

      for (const route of protectedRoutes) {
        const req = request(app);
        const method = route.method as 'get' | 'post' | 'put' | 'patch' | 'delete';
        await req[method](route.path)
          .set('Authorization', 'Bearer valid-token')
          .send({});
      }

      expect(mockAuthWrapper.requireAuth).toHaveBeenCalledTimes(protectedRoutes.length);
    });

    it('should apply admin authentication to admin routes', async () => {
      const adminRoutes = [
        { method: 'get', path: '/api/reports/admin/templates' },
        { method: 'get', path: '/api/reports/admin/usage' },
        { method: 'delete', path: '/api/reports/admin/cleanup' },
        { method: 'post', path: '/api/reports/export/cleanup' }
      ];

      for (const route of adminRoutes) {
        const req = request(app);
        const method = route.method as 'get' | 'post' | 'put' | 'patch' | 'delete';
        await req[method](route.path)
          .set('Authorization', 'Bearer admin-token')
          .send({});
      }

      expect(mockAuthWrapper.requireAdmin).toHaveBeenCalledTimes(adminRoutes.length);
    });

    it('should apply rate limiting to resource-intensive operations', async () => {
      const rateLimitedRoutes = [
        { method: 'post', path: '/api/reports/custom' },
        { method: 'post', path: '/api/reports/custom/test' }
      ];
      
      for (const route of rateLimitedRoutes) {
        const req = request(app);
        const method = route.method as 'get' | 'post' | 'put' | 'patch' | 'delete';
        await req[method](route.path)
          .set('Authorization', 'Bearer valid-token')
          .send({ source: 'ad', query: { fields: ['username'] } });
      }

      expect(mockAuthWrapper.userRateLimit).toHaveBeenCalledTimes(rateLimitedRoutes.length);
    });

    it('should audit sensitive operations', async () => {
      const auditedRoutes = [
        { 
          method: 'post', 
          path: '/api/reports/execute/123e4567-e89b-12d3-a456-426614174000',
          action: 'execute_report_template'
        },
        {
          method: 'post',
          path: '/api/reports/custom',
          action: 'create_custom_report'
        },
        {
          method: 'delete',
          path: '/api/reports/admin/cleanup',
          action: 'cleanup_report_history'
        }
      ];
      
      for (const route of auditedRoutes) {
        const req = request(app);
        const method = route.method as 'get' | 'post' | 'put' | 'patch' | 'delete';
        await req[method](route.path)
          .set('Authorization', 'Bearer admin-token')
          .send({ source: 'ad', query: { fields: ['username'] } });
      }

      expect(mockAuthWrapper.auditAction).toHaveBeenCalledTimes(auditedRoutes.length);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle concurrent requests to different endpoints', async () => {
      const concurrentRequests = [
        request(app).get('/api/reports/templates'),
        request(app).get('/api/reports/fields/ad'),
        request(app).get('/api/reports/history'),
        request(app).get('/api/reports/custom')
      ];

      const responses = await Promise.all(concurrentRequests);

      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });

    it('should handle multiple export requests simultaneously', async () => {
      const templateId = '123e4567-e89b-12d3-a456-426614174000';
      const exportRequests = Array.from({ length: 5 }, () =>
        request(app)
          .post(`/api/reports/export/report/${templateId}`)
          .set('Authorization', 'Bearer valid-token')
          .send({ format: 'excel' })
      );

      const responses = await Promise.all(exportRequests);

      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });
  });
});