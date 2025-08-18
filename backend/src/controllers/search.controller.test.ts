import request from 'supertest';
import express from 'express';
import { searchController } from './search.controller';
import { searchService } from '../services/search.service';
import { logger } from '../utils/logger';

// Mock dependencies
jest.mock('../services/search.service');
jest.mock('../utils/logger');

describe('SearchController', () => {
  let app: express.Application;
  
  const mockUser = {
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
    role: 'user'
  };

  const mockSearchService = searchService as jest.Mocked<typeof searchService>;
  const mockLogger = logger as jest.Mocked<typeof logger>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    app = express();
    app.use(express.json());
    
    // Mock authenticated middleware
    app.use((req: any, _res, next) => {
      req.user = mockUser;
      next();
    });

    // Setup routes
    app.get('/api/search', (req, res) => searchController.globalSearch(req as any, res));
    app.get('/api/search/suggestions', (req, res) => searchController.getSuggestions(req as any, res));
    app.get('/api/search/recent', (req, res) => searchController.getRecentSearches(req as any, res));
    
    // Error handling middleware
    app.use((err: any, req: any, _res: any, _next: any) => {
      const statusCode = err.statusCode || 500;
      _res.status(statusCode).json({
        error: err.message || 'Internal Server Error'
      });
    });
  });

  describe('globalSearch', () => {
    const mockSearchResults = [
      {
        id: '1',
        title: 'Test Template',
        description: 'Test description',
        type: 'template' as const,
        path: '/templates?id=1',
        tags: ['AD', 'users'],
        metadata: { category: 'AD', dataSource: 'AD' }
      },
      {
        id: 'custom-2',
        title: 'Custom Report',
        description: 'Custom description',
        type: 'report' as const,
        path: '/reports/builder?id=2',
        tags: ['custom', 'Azure'],
        favorite: false,
        metadata: { dataSource: 'Azure', isPublic: true }
      }
    ];

    it('should return search results successfully', async () => {
      mockSearchService.globalSearch.mockResolvedValueOnce(mockSearchResults);

      const response = await request(app)
        .get('/api/search')
        .query({ q: 'test query' })
        .expect(200);

      expect(response.body).toEqual({
        results: mockSearchResults,
        total: mockSearchResults.length,
        query: 'test query'
      });

      expect(mockSearchService.globalSearch).toHaveBeenCalledWith(
        'test query',
        mockUser.id,
        {
          types: undefined,
          limit: 20
        }
      );
    });

    it('should handle query parameters correctly', async () => {
      mockSearchService.globalSearch.mockResolvedValueOnce([]);

      await request(app)
        .get('/api/search')
        .query({
          q: 'user report',
          types: 'template,report',
          limit: '10'
        })
        .expect(200);

      expect(mockSearchService.globalSearch).toHaveBeenCalledWith(
        'user report',
        mockUser.id,
        {
          types: ['template', 'report'],
          limit: 10
        }
      );
    });

    it('should use default limit when not provided', async () => {
      mockSearchService.globalSearch.mockResolvedValueOnce([]);

      await request(app)
        .get('/api/search')
        .query({ q: 'test' })
        .expect(200);

      expect(mockSearchService.globalSearch).toHaveBeenCalledWith(
        'test',
        mockUser.id,
        {
          types: undefined,
          limit: 20
        }
      );
    });

    it('should handle single type filter', async () => {
      mockSearchService.globalSearch.mockResolvedValueOnce([]);

      await request(app)
        .get('/api/search')
        .query({
          q: 'dashboard',
          types: 'page'
        })
        .expect(200);

      expect(mockSearchService.globalSearch).toHaveBeenCalledWith(
        'dashboard',
        mockUser.id,
        {
          types: ['page'],
          limit: 20
        }
      );
    });

    it('should handle empty search results', async () => {
      mockSearchService.globalSearch.mockResolvedValueOnce([]);

      const response = await request(app)
        .get('/api/search')
        .query({ q: 'nonexistent' })
        .expect(200);

      expect(response.body).toEqual({
        results: [],
        total: 0,
        query: 'nonexistent'
      });
    });

    it('should return 400 for missing query parameter', async () => {
      const response = await request(app)
        .get('/api/search')
        .expect(400);

      expect(response.body).toEqual({
        error: 'Search query is required'
      });

      expect(mockSearchService.globalSearch).not.toHaveBeenCalled();
    });

    it('should return 400 for empty query parameter', async () => {
      const response = await request(app)
        .get('/api/search')
        .query({ q: '' })
        .expect(400);

      expect(response.body).toEqual({
        error: 'Search query is required'
      });
    });

    it('should handle numeric query parameter as string', async () => {
      mockSearchService.globalSearch.mockResolvedValueOnce([]);

      await request(app)
        .get('/api/search')
        .query({ q: 123 })
        .expect(200);

      expect(mockSearchService.globalSearch).toHaveBeenCalledWith(
        '123', // Express converts numbers to strings
        mockUser.id,
        {
          types: undefined,
          limit: 20
        }
      );
    });

    it('should handle array query parameters correctly', async () => {
      mockSearchService.globalSearch.mockResolvedValueOnce([]);

      // Express parses multiple values as array, but our code handles string with split()
      await request(app)
        .get('/api/search')
        .query({ q: 'test', types: ['template', 'report'] })
        .expect(200);

      expect(mockSearchService.globalSearch).toHaveBeenCalledWith(
        'test',
        mockUser.id,
        {
          types: ['template', 'report'],
          limit: 20
        }
      );
    });

    it('should handle numeric limits correctly', async () => {
      mockSearchService.globalSearch.mockResolvedValueOnce([]);

      await request(app)
        .get('/api/search')
        .query({ q: 'test', limit: '25' })
        .expect(200);

      expect(mockSearchService.globalSearch).toHaveBeenCalledWith(
        'test',
        mockUser.id,
        {
          types: undefined,
          limit: 25
        }
      );
    });

    it('should handle invalid numeric limits gracefully', async () => {
      mockSearchService.globalSearch.mockResolvedValueOnce([]);

      await request(app)
        .get('/api/search')
        .query({ q: 'test', limit: 'invalid' })
        .expect(200);

      expect(mockSearchService.globalSearch).toHaveBeenCalledWith(
        'test',
        mockUser.id,
        {
          types: undefined,
          limit: NaN // Number('invalid') returns NaN
        }
      );
    });

    it('should handle service errors and return 500', async () => {
      const serviceError = new Error('Database connection failed');
      mockSearchService.globalSearch.mockRejectedValueOnce(serviceError);

      const response = await request(app)
        .get('/api/search')
        .query({ q: 'test' })
        .expect(500);

      expect(response.body).toEqual({
        error: 'Search failed',
        message: 'Database connection failed'
      });

      expect(mockLogger.error).toHaveBeenCalledWith('Global search error:', serviceError);
    });

    it('should handle service errors without message', async () => {
      mockSearchService.globalSearch.mockRejectedValueOnce('String error');

      const response = await request(app)
        .get('/api/search')
        .query({ q: 'test' })
        .expect(500);

      expect(response.body).toEqual({
        error: 'Search failed',
        message: 'Unknown error'
      });
    });

    it('should handle special characters in search query', async () => {
      mockSearchService.globalSearch.mockResolvedValueOnce([]);

      const specialQuery = "test's \"quoted\" & special chars!@#$%";
      
      await request(app)
        .get('/api/search')
        .query({ q: specialQuery })
        .expect(200);

      expect(mockSearchService.globalSearch).toHaveBeenCalledWith(
        specialQuery,
        mockUser.id,
        {
          types: undefined,
          limit: 20
        }
      );
    });

    it('should handle Unicode characters in search query', async () => {
      mockSearchService.globalSearch.mockResolvedValueOnce([]);

      const unicodeQuery = 'test 测试 émoji 🔍';
      
      await request(app)
        .get('/api/search')
        .query({ q: unicodeQuery })
        .expect(200);

      expect(mockSearchService.globalSearch).toHaveBeenCalledWith(
        unicodeQuery,
        mockUser.id,
        {
          types: undefined,
          limit: 20
        }
      );
    });

    it('should handle very long search queries', async () => {
      mockSearchService.globalSearch.mockResolvedValueOnce([]);

      const longQuery = 'a'.repeat(1000);
      
      await request(app)
        .get('/api/search')
        .query({ q: longQuery })
        .expect(200);

      expect(mockSearchService.globalSearch).toHaveBeenCalledWith(
        longQuery,
        mockUser.id,
        {
          types: undefined,
          limit: 20
        }
      );
    });

    it('should handle whitespace-only query', async () => {
      mockSearchService.globalSearch.mockResolvedValueOnce([]);

      await request(app)
        .get('/api/search')
        .query({ q: '   ' })
        .expect(200);

      expect(mockSearchService.globalSearch).toHaveBeenCalledWith(
        '   ', // Controller doesn't trim whitespace
        mockUser.id,
        {
          types: undefined,
          limit: 20
        }
      );
    });

    it('should handle zero limit', async () => {
      mockSearchService.globalSearch.mockResolvedValueOnce([]);

      await request(app)
        .get('/api/search')
        .query({ q: 'test', limit: '0' })
        .expect(200);

      expect(mockSearchService.globalSearch).toHaveBeenCalledWith(
        'test',
        mockUser.id,
        {
          types: undefined,
          limit: 0
        }
      );
    });

    it('should handle negative limit', async () => {
      mockSearchService.globalSearch.mockResolvedValueOnce([]);

      await request(app)
        .get('/api/search')
        .query({ q: 'test', limit: '-5' })
        .expect(200);

      expect(mockSearchService.globalSearch).toHaveBeenCalledWith(
        'test',
        mockUser.id,
        {
          types: undefined,
          limit: -5
        }
      );
    });

    it('should pass user context correctly', async () => {
      const differentUser = { ...mockUser, id: 99, username: 'differentuser' };
      
      // Override middleware for this test
      app.use((req: any, _res, next) => {
        req.user = differentUser;
        next();
      });
      
      // Re-register route with new middleware
      const testApp = express();
      testApp.use(express.json());
      testApp.use((req: any, _res, next) => {
        req.user = differentUser;
        next();
      });
      testApp.get('/search', (req, _res) => searchController.globalSearch(req as any, _res));

      mockSearchService.globalSearch.mockResolvedValueOnce([]);

      await request(testApp)
        .get('/search')
        .query({ q: 'test' })
        .expect(200);

      expect(mockSearchService.globalSearch).toHaveBeenCalledWith(
        'test',
        differentUser.id,
        {
          types: undefined,
          limit: 20
        }
      );
    });
  });

  describe('getSuggestions', () => {
    const mockSuggestions = [
      'recent search 1',
      'recent search 2', 
      'Template Name 1',
      'Template Name 2'
    ];

    it('should return suggestions successfully', async () => {
      mockSearchService.getSuggestions.mockResolvedValueOnce(mockSuggestions);

      const response = await request(app)
        .get('/api/search/suggestions')
        .query({ q: 'test' })
        .expect(200);

      expect(response.body).toEqual({
        suggestions: mockSuggestions
      });

      expect(mockSearchService.getSuggestions).toHaveBeenCalledWith('test', mockUser.id);
    });

    it('should return empty suggestions for missing query', async () => {
      const response = await request(app)
        .get('/api/search/suggestions')
        .expect(200);

      expect(response.body).toEqual({
        suggestions: []
      });

      expect(mockSearchService.getSuggestions).not.toHaveBeenCalled();
    });

    it('should return empty suggestions for empty query', async () => {
      const response = await request(app)
        .get('/api/search/suggestions')
        .query({ q: '' })
        .expect(200);

      expect(response.body).toEqual({
        suggestions: []
      });

      expect(mockSearchService.getSuggestions).not.toHaveBeenCalled();
    });

    it('should handle numeric query for suggestions', async () => {
      mockSearchService.getSuggestions.mockResolvedValueOnce(['123 related', '123 template']);

      const response = await request(app)
        .get('/api/search/suggestions')
        .query({ q: 123 })
        .expect(200);

      expect(response.body).toEqual({
        suggestions: ['123 related', '123 template']
      });

      expect(mockSearchService.getSuggestions).toHaveBeenCalledWith('123', mockUser.id);
    });

    it('should handle service errors gracefully', async () => {
      const serviceError = new Error('Database error');
      mockSearchService.getSuggestions.mockRejectedValueOnce(serviceError);

      const response = await request(app)
        .get('/api/search/suggestions')
        .query({ q: 'test' })
        .expect(200);

      expect(response.body).toEqual({
        suggestions: []
      });

      expect(mockLogger.error).toHaveBeenCalledWith('Search suggestions error:', serviceError);
    });

    it('should handle empty suggestion results', async () => {
      mockSearchService.getSuggestions.mockResolvedValueOnce([]);

      const response = await request(app)
        .get('/api/search/suggestions')
        .query({ q: 'nonexistent' })
        .expect(200);

      expect(response.body).toEqual({
        suggestions: []
      });
    });

    it('should handle partial query strings', async () => {
      mockSearchService.getSuggestions.mockResolvedValueOnce(['test query', 'test template']);

      await request(app)
        .get('/api/search/suggestions')
        .query({ q: 'te' })
        .expect(200);

      expect(mockSearchService.getSuggestions).toHaveBeenCalledWith('te', mockUser.id);
    });

    it('should handle case sensitivity', async () => {
      mockSearchService.getSuggestions.mockResolvedValueOnce(['TEST', 'Test', 'test']);

      await request(app)
        .get('/api/search/suggestions')
        .query({ q: 'TEST' })
        .expect(200);

      expect(mockSearchService.getSuggestions).toHaveBeenCalledWith('TEST', mockUser.id);
    });

    it('should handle special characters in suggestions query', async () => {
      mockSearchService.getSuggestions.mockResolvedValueOnce([]);

      const specialQuery = "user's report";
      
      await request(app)
        .get('/api/search/suggestions')
        .query({ q: specialQuery })
        .expect(200);

      expect(mockSearchService.getSuggestions).toHaveBeenCalledWith(specialQuery, mockUser.id);
    });

    it('should pass correct user context', async () => {
      mockSearchService.getSuggestions.mockResolvedValueOnce([]);

      await request(app)
        .get('/api/search/suggestions')
        .query({ q: 'test' })
        .expect(200);

      expect(mockSearchService.getSuggestions).toHaveBeenCalledWith('test', mockUser.id);
    });
  });

  describe('getRecentSearches', () => {
    const mockRecentSearches = [
      'recent query 1',
      'recent query 2',
      'recent query 3'
    ];

    it('should return recent searches successfully', async () => {
      mockSearchService.getRecentSearches.mockResolvedValueOnce(mockRecentSearches);

      const response = await request(app)
        .get('/api/search/recent')
        .expect(200);

      expect(response.body).toEqual({
        searches: mockRecentSearches
      });

      expect(mockSearchService.getRecentSearches).toHaveBeenCalledWith(mockUser.id);
    });

    it('should handle empty recent searches', async () => {
      mockSearchService.getRecentSearches.mockResolvedValueOnce([]);

      const response = await request(app)
        .get('/api/search/recent')
        .expect(200);

      expect(response.body).toEqual({
        searches: []
      });
    });

    it('should handle service errors gracefully', async () => {
      const serviceError = new Error('Database connection failed');
      mockSearchService.getRecentSearches.mockRejectedValueOnce(serviceError);

      const response = await request(app)
        .get('/api/search/recent')
        .expect(200);

      expect(response.body).toEqual({
        searches: []
      });

      expect(mockLogger.error).toHaveBeenCalledWith('Recent searches error:', serviceError);
    });

    it('should pass correct user context', async () => {
      mockSearchService.getRecentSearches.mockResolvedValueOnce([]);

      await request(app)
        .get('/api/search/recent')
        .expect(200);

      expect(mockSearchService.getRecentSearches).toHaveBeenCalledWith(mockUser.id);
    });

    it('should not require any query parameters', async () => {
      mockSearchService.getRecentSearches.mockResolvedValueOnce([]);

      await request(app)
        .get('/api/search/recent')
        .expect(200);

      expect(mockSearchService.getRecentSearches).toHaveBeenCalledWith(mockUser.id);
    });

    it('should ignore query parameters if provided', async () => {
      mockSearchService.getRecentSearches.mockResolvedValueOnce([]);

      await request(app)
        .get('/api/search/recent')
        .query({ q: 'ignored', limit: '10' })
        .expect(200);

      expect(mockSearchService.getRecentSearches).toHaveBeenCalledWith(mockUser.id);
    });
  });

  describe('Authentication and Authorization', () => {
    let unauthenticatedApp: express.Application;

    beforeEach(() => {
      unauthenticatedApp = express();
      unauthenticatedApp.use(express.json());
      
      // No auth middleware - req.user will be undefined
      unauthenticatedApp.get('/search', (req, res) => searchController.globalSearch(req as any, res));
      unauthenticatedApp.get('/suggestions', (req, res) => searchController.getSuggestions(req as any, res));
      unauthenticatedApp.get('/recent', (req, res) => searchController.getRecentSearches(req as any, res));
    });

    it('should handle missing user context in globalSearch', async () => {
      await request(unauthenticatedApp)
        .get('/search')
        .query({ q: 'test' })
        .expect(500); // Will error when trying to access req.user!.id

      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle missing user context in getSuggestions', async () => {
      const response = await request(unauthenticatedApp)
        .get('/suggestions')
        .query({ q: 'test' })
        .expect(200); // Returns empty suggestions on error

      expect(response.body).toEqual({
        suggestions: []
      });

      expect(mockLogger.error).toHaveBeenCalledWith('Search suggestions error:', expect.any(Error));
    });

    it('should handle missing user context in getRecentSearches', async () => {
      const response = await request(unauthenticatedApp)
        .get('/recent')
        .expect(200); // Returns empty searches on error

      expect(response.body).toEqual({
        searches: []
      });

      expect(mockLogger.error).toHaveBeenCalledWith('Recent searches error:', expect.any(Error));
    });
  });

  describe('Performance and Edge Cases', () => {
    it('should handle concurrent search requests', async () => {
      mockSearchService.globalSearch.mockResolvedValue([]);

      const requests = Array.from({ length: 10 }, (_, i) =>
        request(app)
          .get('/api/search')
          .query({ q: `concurrent test ${i}` })
      );

      const responses = await Promise.all(requests);
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      expect(mockSearchService.globalSearch).toHaveBeenCalledTimes(10);
    });

    it('should handle very large search results', async () => {
      const largeResultSet = Array.from({ length: 1000 }, (_, i) => ({
        id: `result-${i}`,
        title: `Result ${i}`,
        description: `Description ${i}`,
        type: 'template' as const,
        path: `/templates?id=${i}`,
        tags: ['large', 'dataset'],
        metadata: {}
      }));

      mockSearchService.globalSearch.mockResolvedValueOnce(largeResultSet);

      const response = await request(app)
        .get('/api/search')
        .query({ q: 'test' })
        .expect(200);

      expect(response.body.results).toHaveLength(1000);
      expect(response.body.total).toBe(1000);
    });

    it('should handle service timeout gracefully', async () => {
      const timeoutError = new Error('Service timeout');
      timeoutError.name = 'TimeoutError';
      mockSearchService.globalSearch.mockRejectedValueOnce(timeoutError);

      const response = await request(app)
        .get('/api/search')
        .query({ q: 'test' })
        .expect(500);

      expect(response.body.error).toBe('Search failed');
      expect(response.body.message).toBe('Service timeout');
    });

    it('should handle malformed type filters', async () => {
      mockSearchService.globalSearch.mockResolvedValueOnce([]);

      await request(app)
        .get('/api/search')
        .query({ 
          q: 'test',
          types: 'template,,report,,' // Extra commas
        })
        .expect(200);

      expect(mockSearchService.globalSearch).toHaveBeenCalledWith(
        'test',
        mockUser.id,
        {
          types: ['template', '', 'report', '', ''], // Will be filtered by service
          limit: 20
        }
      );
    });

    it('should handle null/undefined service responses', async () => {
      mockSearchService.globalSearch.mockResolvedValueOnce(null as any);

      const response = await request(app)
        .get('/api/search')
        .query({ q: 'test' })
        .expect(500); // Will error when trying to access null.length

      expect(response.body.error).toBe('Search failed');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('Response Format Validation', () => {
    it('should return properly formatted globalSearch response', async () => {
      const mockResults = [
        {
          id: '1',
          title: 'Test Result',
          type: 'template' as const,
          path: '/test',
          tags: ['test']
        }
      ];

      mockSearchService.globalSearch.mockResolvedValueOnce(mockResults);

      const response = await request(app)
        .get('/api/search')
        .query({ q: 'test' })
        .expect(200);

      expect(response.body).toHaveProperty('results');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('query');
      expect(Array.isArray(response.body.results)).toBe(true);
      expect(typeof response.body.total).toBe('number');
      expect(typeof response.body.query).toBe('string');
    });

    it('should return properly formatted getSuggestions response', async () => {
      mockSearchService.getSuggestions.mockResolvedValueOnce(['suggestion1', 'suggestion2']);

      const response = await request(app)
        .get('/api/search/suggestions')
        .query({ q: 'test' })
        .expect(200);

      expect(response.body).toHaveProperty('suggestions');
      expect(Array.isArray(response.body.suggestions)).toBe(true);
      expect(response.body.suggestions.every((s: any) => typeof s === 'string')).toBe(true);
    });

    it('should return properly formatted getRecentSearches response', async () => {
      mockSearchService.getRecentSearches.mockResolvedValueOnce(['search1', 'search2']);

      const response = await request(app)
        .get('/api/search/recent')
        .expect(200);

      expect(response.body).toHaveProperty('searches');
      expect(Array.isArray(response.body.searches)).toBe(true);
      expect(response.body.searches.every((s: any) => typeof s === 'string')).toBe(true);
    });
  });

  describe('HTTP Method Handling', () => {
    it('should only accept GET requests for search endpoints', async () => {
      await request(app)
        .post('/api/search')
        .send({ q: 'test' })
        .expect(404); // Route not found for POST

      await request(app)
        .put('/api/search')
        .send({ q: 'test' })
        .expect(404); // Route not found for PUT

      await request(app)
        .delete('/api/search')
        .expect(404); // Route not found for DELETE
    });
  });

  describe('Query Parameter Edge Cases', () => {
    it('should handle boolean query parameters', async () => {
      mockSearchService.globalSearch.mockResolvedValueOnce([]);

      await request(app)
        .get('/api/search')
        .query({ 
          q: 'test',
          types: true as any // Invalid type
        })
        .expect(200);

      expect(mockSearchService.globalSearch).toHaveBeenCalledWith(
        'test',
        mockUser.id,
        {
          types: ['true'], // String('true').split(',') = ['true']
          limit: 20
        }
      );
    });

    it('should handle object query parameters', async () => {
      mockSearchService.globalSearch.mockResolvedValueOnce([]);

      // This would be unusual but could happen with malformed requests
      await request(app)
        .get('/api/search')
        .query({ 
          q: 'test',
          types: JSON.stringify({invalid: 'object'})
        })
        .expect(200);

      expect(mockSearchService.globalSearch).toHaveBeenCalledWith(
        'test',
        mockUser.id,
        {
          types: ['{"invalid":"object"}'], // Will be treated as string
          limit: 20
        }
      );
    });
  });
});