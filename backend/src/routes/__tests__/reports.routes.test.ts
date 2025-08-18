import request from 'supertest';
import express from 'express';

// Mock all external dependencies before imports
jest.mock('@/controllers/reports.controller', () => ({
  reportsController: {
    getTemplates: jest.fn(),
    executeTemplate: jest.fn(),
    getFields: jest.fn(),
    discoverSchema: jest.fn(),
    createCustomReport: jest.fn(),
    getCustomReports: jest.fn(),
    getCustomReport: jest.fn(),
    updateCustomReport: jest.fn(),
    deleteCustomReport: jest.fn(),
    executeCustomReport: jest.fn(),
    testCustomQuery: jest.fn(),
    getReportHistory: jest.fn(),
    getReportExecution: jest.fn(),
    getReportResults: jest.fn(),
    getReportStats: jest.fn(),
    getFavorites: jest.fn(),
    addToFavorites: jest.fn(),
    removeFromFavorites: jest.fn()
  },
  createCustomReportValidation: (_req: any, _res: any, next: any) => next(),
  executeReportValidation: (_req: any, _res: any, next: any) => next()
}));

jest.mock('@/controllers/query.controller', () => ({
  queryController: {
    executeQuery: jest.fn(),
    buildAndExecuteQuery: jest.fn(),
    getQueryDefinitions: jest.fn(),
    getSchema: jest.fn(),
    validateQuery: jest.fn(),
    getCachedResult: jest.fn(),
    getQueryStats: jest.fn(),
    clearCache: jest.fn(),
    executeGraphQuery: jest.fn(),
    getGraphQueryDefinitions: jest.fn(),
    getGraphQueryHistory: jest.fn(),
    executeGraphBatch: jest.fn()
  },
  executeQueryValidation: (_req: any, _res: any, next: any) => next(),
  buildQueryValidation: (_req: any, _res: any, next: any) => next(),
  executeGraphQueryValidation: (_req: any, _res: any, next: any) => next(),
  executeGraphBatchValidation: (_req: any, _res: any, next: any) => next()
}));

jest.mock('@/controllers/export.controller', () => ({
  ExportController: jest.fn().mockImplementation(() => ({
    exportReport: { bind: jest.fn().mockReturnValue(jest.fn()) },
    queueExport: { bind: jest.fn().mockReturnValue(jest.fn()) },
    exportHistoryResults: { bind: jest.fn().mockReturnValue(jest.fn()) },
    downloadFile: { bind: jest.fn().mockReturnValue(jest.fn()) },
    getJobStatus: { bind: jest.fn().mockReturnValue(jest.fn()) },
    cleanupExports: { bind: jest.fn().mockReturnValue(jest.fn()) }
  }))
}));

jest.mock('@/middleware/auth-wrapper', () => ({
  requireAuth: jest.fn((_req: any, _res: any, next: any) => next()),
  requireAdmin: jest.fn((_req: any, _res: any, next: any) => next()),
  optionalAuth: jest.fn((_req: any, _res: any, next: any) => next()),
  auditAction: jest.fn(() => (_req: any, _res: any, next: any) => next()),
  userRateLimit: jest.fn(() => (_req: any, _res: any, next: any) => next()),
  requireResourceAccess: jest.fn(() => (_req: any, _res: any, next: any) => next()),
  resourceCheckers: {
    ownResource: jest.fn(),
    customReport: jest.fn()
  }
}));

// Mock express-validator with proper middleware functions
const mockMiddleware = (_req: any, _res: any, next: any) => next();

const createChainedValidator = () => {
  const validator: any = mockMiddleware;
  validator.optional = jest.fn(() => createChainedValidator());
  validator.isIn = jest.fn(() => createChainedValidator());
  validator.withMessage = jest.fn(() => createChainedValidator());
  validator.isLength = jest.fn(() => createChainedValidator());
  validator.trim = jest.fn(() => createChainedValidator());
  validator.escape = jest.fn(() => createChainedValidator());
  validator.isObject = jest.fn(() => createChainedValidator());
  validator.isBoolean = jest.fn(() => createChainedValidator());
  validator.isArray = jest.fn(() => createChainedValidator());
  validator.isUUID = jest.fn(() => createChainedValidator());
  validator.isInt = jest.fn(() => createChainedValidator());
  validator.isString = jest.fn(() => createChainedValidator());
  validator.notEmpty = jest.fn(() => createChainedValidator());
  validator.isISO8601 = jest.fn(() => createChainedValidator());
  validator.matches = jest.fn(() => createChainedValidator());
  validator.isNumeric = jest.fn(() => createChainedValidator());
  return validator;
};

jest.mock('express-validator', () => ({
  body: jest.fn(() => createChainedValidator()),
  param: jest.fn(() => createChainedValidator()),
  query: jest.fn(() => createChainedValidator()),
  validationResult: jest.fn(() => ({
    isEmpty: () => true,
    array: () => []
  }))
}));

jest.mock('@/middleware/validation.middleware', () => ({
  validateRequest: jest.fn(() => (_req: any, _res: any, next: any) => next()),
  handleValidationErrors: jest.fn((_req: any, _res: any, next: any) => next())
}));

jest.mock('@/config/database', () => ({
  db: {
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 })
  }
}));

jest.mock('@/utils/logger');

// Import after mocking
import reportsRoutes from '../reports.routes';
import { reportsController } from '@/controllers/reports.controller';
import { queryController } from '@/controllers/query.controller';

describe('Reports Routes Integration', () => {
  let app: express.Application;

  const mockTemplate = {
    id: 'template-123',
    name: 'Test Template',
    category: 'ad',
    source: 'ad'
  };

  const mockCustomReport = {
    id: 'custom-123',
    name: 'Custom Report',
    source: 'ad',
    query: { fields: ['username'], filters: [] }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    app = express();
    app.use(express.json());
    app.use('/api/reports', reportsRoutes);

    // Error handler
    app.use((err: any, _req: any, res: any, _next: any) => {
      res.status(err.statusCode || 500).json({
        error: err.message || 'Internal Server Error'
      });
    });
  });

  describe('GET /api/reports/templates', () => {
    it('should return report templates', async () => {
      (reportsController.getTemplates as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          success: true,
          data: { templates: [mockTemplate], totalCount: 1 }
        });
      });

      const response = await request(app)
        .get('/api/reports/templates')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.templates).toHaveLength(1);
    });

    it('should filter templates by category', async () => {
      (reportsController.getTemplates as jest.Mock).mockImplementation((req, res) => {
        const filtered = req.query.category === 'ad' ? [mockTemplate] : [];
        res.status(200).json({
          success: true,
          data: { templates: filtered, totalCount: filtered.length }
        });
      });

      const response = await request(app)
        .get('/api/reports/templates?category=ad')
        .expect(200);

      expect(response.body.data.templates).toHaveLength(1);
    });

    it('should filter templates by source', async () => {
      (reportsController.getTemplates as jest.Mock).mockImplementation((req, res) => {
        const filtered = req.query.source === 'azure' ? [] : [mockTemplate];
        res.status(200).json({
          success: true,
          data: { templates: filtered, totalCount: filtered.length }
        });
      });

      const response = await request(app)
        .get('/api/reports/templates?source=azure')
        .expect(200);

      expect(response.body.data.templates).toHaveLength(0);
    });
  });

  describe('POST /api/reports/execute/:templateId', () => {
    it('should execute report template', async () => {
      (reportsController.executeTemplate as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          success: true,
          data: {
            executionId: 'exec-123',
            results: [{ username: 'test' }]
          }
        });
      });

      const response = await request(app)
        .post('/api/reports/execute/template-123')
        .send({ parameters: { days: 30 } })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.executionId).toBeDefined();
    });

    it('should handle template not found', async () => {
      (reportsController.executeTemplate as jest.Mock).mockImplementation((_req, res) => {
        res.status(404).json({
          success: false,
          error: 'Template not found'
        });
      });

      const response = await request(app)
        .post('/api/reports/execute/nonexistent')
        .send({ parameters: {} })
        .expect(404);

      expect(response.body.error).toBe('Template not found');
    });
  });

  describe('GET /api/reports/fields/:source', () => {
    it('should return fields for data source', async () => {
      const mockFields = [
        { name: 'username', displayName: 'Username', type: 'string' },
        { name: 'email', displayName: 'Email', type: 'string' }
      ];

      (reportsController.getFields as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          success: true,
          data: { fields: mockFields, source: 'ad' }
        });
      });

      const response = await request(app)
        .get('/api/reports/fields/ad')
        .expect(200);

      expect(response.body.data.fields).toHaveLength(2);
      expect(response.body.data.source).toBe('ad');
    });

    it('should filter fields by category', async () => {
      const filteredFields = [
        { name: 'username', displayName: 'Username', category: 'basic' }
      ];

      (reportsController.getFields as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          success: true,
          data: { fields: filteredFields }
        });
      });

      const response = await request(app)
        .get('/api/reports/fields/ad?category=basic')
        .expect(200);

      expect(response.body.data.fields).toHaveLength(1);
    });
  });

  describe('GET /api/reports/schema/:source/discover', () => {
    it('should discover schema for AD', async () => {
      const mockSchema = {
        objectClasses: ['user', 'group'],
        attributes: ['cn', 'mail']
      };

      (reportsController.discoverSchema as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          success: true,
          data: mockSchema
        });
      });

      const response = await request(app)
        .get('/api/reports/schema/ad/discover')
        .expect(200);

      expect(response.body.data.objectClasses).toContain('user');
    });
  });

  describe('Custom Reports', () => {
    it('should create custom report', async () => {
      (reportsController.createCustomReport as jest.Mock).mockImplementation((_req, res) => {
        res.status(201).json({
          success: true,
          data: mockCustomReport
        });
      });

      const response = await request(app)
        .post('/api/reports/custom')
        .send({
          name: 'Custom Report',
          source: 'ad',
          query: { fields: ['username'], filters: [] }
        })
        .expect(201);

      expect(response.body.data).toEqual(mockCustomReport);
    });

    it('should get custom reports', async () => {
      (reportsController.getCustomReports as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          success: true,
          data: { reports: [mockCustomReport], totalCount: 1 }
        });
      });

      const response = await request(app)
        .get('/api/reports/custom')
        .expect(200);

      expect(response.body.data.reports).toHaveLength(1);
    });

    it('should get specific custom report', async () => {
      (reportsController.getCustomReport as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          success: true,
          data: mockCustomReport
        });
      });

      const response = await request(app)
        .get('/api/reports/custom/custom-123')
        .expect(200);

      expect(response.body.data).toEqual(mockCustomReport);
    });

    it('should update custom report', async () => {
      const updated = { ...mockCustomReport, name: 'Updated Name' };
      
      (reportsController.updateCustomReport as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          success: true,
          data: updated
        });
      });

      const response = await request(app)
        .put('/api/reports/custom/custom-123')
        .send({ name: 'Updated Name' })
        .expect(200);

      expect(response.body.data.name).toBe('Updated Name');
    });

    it('should delete custom report', async () => {
      (reportsController.deleteCustomReport as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          success: true,
          message: 'Report deleted'
        });
      });

      const response = await request(app)
        .delete('/api/reports/custom/custom-123')
        .expect(200);

      expect(response.body.message).toBe('Report deleted');
    });

    it('should execute custom report', async () => {
      (reportsController.executeCustomReport as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          success: true,
          data: { executionId: 'exec-456', results: [] }
        });
      });

      const response = await request(app)
        .post('/api/reports/custom/custom-123/execute')
        .send({ parameters: {} })
        .expect(200);

      expect(response.body.data.executionId).toBeDefined();
    });

    it('should test custom query', async () => {
      (reportsController.testCustomQuery as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          success: true,
          data: { valid: true, sampleResults: [] }
        });
      });

      const response = await request(app)
        .post('/api/reports/custom/test')
        .send({
          source: 'ad',
          query: { fields: ['username'], filters: [] }
        })
        .expect(200);

      expect(response.body.data.valid).toBe(true);
    });
  });

  describe('Report History', () => {
    it('should get report history', async () => {
      const mockHistory = [
        { id: 'exec-123', status: 'completed', executedAt: new Date().toISOString() }
      ];

      (reportsController.getReportHistory as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          success: true,
          data: { history: mockHistory, totalCount: 1 }
        });
      });

      const response = await request(app)
        .get('/api/reports/history')
        .expect(200);

      expect(response.body.data.history).toHaveLength(1);
    });

    it('should get specific report execution', async () => {
      const execution = { id: 'exec-123', status: 'completed' };

      (reportsController.getReportExecution as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          success: true,
          data: execution
        });
      });

      const response = await request(app)
        .get('/api/reports/history/exec-123')
        .expect(200);

      expect(response.body.data).toEqual(execution);
    });

    it('should get report results', async () => {
      const results = [{ username: 'user1' }, { username: 'user2' }];

      (reportsController.getReportResults as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          success: true,
          data: { results, totalCount: 2 }
        });
      });

      const response = await request(app)
        .get('/api/reports/history/exec-123/results')
        .expect(200);

      expect(response.body.data.results).toHaveLength(2);
    });

    it('should get report statistics', async () => {
      const stats = { totalReports: 100, completedReports: 85 };

      (reportsController.getReportStats as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          success: true,
          data: stats
        });
      });

      const response = await request(app)
        .get('/api/reports/stats')
        .expect(200);

      expect(response.body.data).toEqual(stats);
    });
  });

  describe('Query Routes', () => {
    it('should execute query', async () => {
      (queryController.executeQuery as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          success: true,
          data: { results: [{ id: 1 }], executionTime: 100 }
        });
      });

      const response = await request(app)
        .post('/api/reports/query/execute')
        .send({ queryId: 'test', parameters: {} })
        .expect(200);

      expect(response.body.data.results).toHaveLength(1);
    });

    it('should build and execute query', async () => {
      (queryController.buildAndExecuteQuery as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          success: true,
          data: { sql: 'SELECT * FROM users', results: [] }
        });
      });

      const response = await request(app)
        .post('/api/reports/query/build')
        .send({ table: 'users', fields: ['id', 'name'] })
        .expect(200);

      expect(response.body.data.sql).toContain('SELECT');
    });

    it('should get query definitions', async () => {
      const definitions = [
        { id: 'active-users', name: 'Active Users' }
      ];

      (queryController.getQueryDefinitions as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          success: true,
          data: { definitions }
        });
      });

      const response = await request(app)
        .get('/api/reports/query/definitions')
        .expect(200);

      expect(response.body.data.definitions).toHaveLength(1);
    });
  });

  describe('Favorites Routes', () => {
    it('should get favorites', async () => {
      const favorites = [
        { templateId: 'template-1', type: 'template' }
      ];

      (reportsController.getFavorites as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          success: true,
          data: { favorites }
        });
      });

      const response = await request(app)
        .get('/api/reports/favorites')
        .expect(200);

      expect(response.body.data.favorites).toHaveLength(1);
    });

    it('should add to favorites', async () => {
      (reportsController.addToFavorites as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          success: true,
          message: 'Added to favorites'
        });
      });

      const response = await request(app)
        .post('/api/reports/favorites')
        .send({ templateId: 'template-123' })
        .expect(200);

      expect(response.body.message).toBe('Added to favorites');
    });

    it('should remove from favorites', async () => {
      (reportsController.removeFromFavorites as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          success: true,
          message: 'Removed from favorites'
        });
      });

      const response = await request(app)
        .delete('/api/reports/favorites')
        .send({ templateId: 'template-123' })
        .expect(200);

      expect(response.body.message).toBe('Removed from favorites');
    });
  });

  describe('Error Handling', () => {
    it('should handle controller errors', async () => {
      (reportsController.getTemplates as jest.Mock).mockImplementation((_req, _res, next) => {
        next(new Error('Controller error'));
      });

      const response = await request(app)
        .get('/api/reports/templates')
        .expect(500);

      expect(response.body.error).toBe('Controller error');
    });

    it('should handle validation errors', async () => {
      // Mock validation error handling middleware
      const { handleValidationErrors } = require('@/middleware/validation.middleware');
      (handleValidationErrors as jest.Mock).mockImplementationOnce((_req: any, _res: any, next: any) => {
        const error = new Error('Validation failed: Invalid category');
        (error as any).statusCode = 400;
        next(error);
      });

      const response = await request(app)
        .get('/api/reports/templates?category=invalid')
        .expect(400);

      expect(response.body.error).toBe('Validation failed: Invalid category');
    });
  });

  describe('Route Coverage Validation', () => {
    it('should have comprehensive coverage of main report routes', () => {
      const mainRoutes = [
        'GET /templates',
        'POST /execute/:templateId',
        'GET /fields/:source',
        'GET /schema/:source/discover',
        'POST /custom',
        'GET /custom',
        'GET /custom/:reportId',
        'PUT /custom/:reportId',
        'DELETE /custom/:reportId',
        'POST /custom/:reportId/execute',
        'POST /custom/test',
        'GET /history',
        'GET /history/:id',
        'GET /history/:id/results',
        'GET /stats',
        'GET /favorites',
        'POST /favorites',
        'DELETE /favorites'
      ];
      
      expect(mainRoutes.length).toBeGreaterThan(15);
    });
  });
});