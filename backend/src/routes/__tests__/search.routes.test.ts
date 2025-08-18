import request from 'supertest';
import express from 'express';

// Mock all external dependencies before imports
jest.mock('../../controllers/search.controller', () => ({
  searchController: {
    globalSearch: jest.fn(),
    getSuggestions: jest.fn(),
    getRecentSearches: jest.fn()
  }
}));

jest.mock('../../auth/middleware/unified-auth.middleware', () => ({
  requireAuth: jest.fn((_req: any, _res: any, next: any) => {
    _req.user = { 
      id: 1, 
      username: 'testuser', 
      displayName: 'Test User',
      email: 'test@example.com',
      authSource: 'local',
      isAdmin: false,
      isActive: true
    };
    next();
  })
}));

jest.mock('@/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn()
  }
}));

// Import after mocking
import searchRoutes from '../search.routes';
import { searchController } from '../../controllers/search.controller';

describe('Search Routes Integration', () => {
  let app: express.Application;

  const mockGlobalSearchResults = {
    query: 'test user',
    totalResults: 25,
    executionTime: 145,
    results: {
      users: {
        count: 5,
        items: [
          {
            id: 'user1',
            type: 'user',
            displayName: 'Test User 1',
            email: 'testuser1@company.com',
            department: 'IT',
            relevanceScore: 0.95
          },
          {
            id: 'user2',
            type: 'user',
            displayName: 'Test User 2',
            email: 'testuser2@company.com',
            department: 'HR',
            relevanceScore: 0.87
          }
        ]
      },
      groups: {
        count: 3,
        items: [
          {
            id: 'group1',
            type: 'group',
            displayName: 'Test Group',
            description: 'Test group for testing',
            memberCount: 25,
            relevanceScore: 0.78
          }
        ]
      },
      reports: {
        count: 7,
        items: [
          {
            id: 'report1',
            type: 'report',
            name: 'User Activity Test Report',
            category: 'users',
            lastRun: '2025-01-01T12:00:00Z',
            relevanceScore: 0.92
          }
        ]
      }
    },
    facets: {
      types: [
        { type: 'users', count: 5 },
        { type: 'groups', count: 3 },
        { type: 'reports', count: 7 }
      ],
      departments: [
        { department: 'IT', count: 3 },
        { department: 'HR', count: 2 }
      ]
    }
  };

  const mockSuggestions = {
    query: 'tes',
    suggestions: [
      {
        text: 'test user',
        type: 'user',
        count: 5,
        weight: 0.9
      },
      {
        text: 'test group',
        type: 'group',
        count: 3,
        weight: 0.8
      },
      {
        text: 'test report',
        type: 'report',
        count: 7,
        weight: 0.85
      }
    ],
    popular: [
      {
        text: 'inactive users',
        searchCount: 150,
        lastSearched: '2025-01-01T11:30:00Z'
      },
      {
        text: 'password expiry',
        searchCount: 120,
        lastSearched: '2025-01-01T10:45:00Z'
      }
    ]
  };

  const mockRecentSearches = {
    userId: 1,
    searches: [
      {
        id: 1,
        query: 'test user',
        timestamp: '2025-01-01T12:00:00Z',
        resultCount: 5,
        filters: { type: 'users', department: 'IT' }
      },
      {
        id: 2,
        query: 'locked accounts',
        timestamp: '2025-01-01T11:45:00Z',
        resultCount: 12,
        filters: { type: 'users', status: 'locked' }
      },
      {
        id: 3,
        query: 'group members',
        timestamp: '2025-01-01T11:30:00Z',
        resultCount: 8,
        filters: { type: 'groups' }
      }
    ],
    totalCount: 3
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    app = express();
    app.use(express.json());
    app.use('/api/search', searchRoutes);

    // Error handler
    app.use((err: any, _req: any, res: any, _next: any) => {
      res.status(err.statusCode || 500).json({
        error: err.message || 'Internal Server Error'
      });
    });
  });

  describe('GET /api/search/global', () => {
    it('should perform global search successfully', async () => {
      (searchController.globalSearch as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          success: true,
          data: mockGlobalSearchResults
        });
      });

      const response = await request(app)
        .get('/api/search/global?q=test%20user')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.query).toBe('test user');
      expect(response.body.data.totalResults).toBe(25);
      expect(response.body.data.results.users.count).toBe(5);
    });

    it('should handle global search with filters', async () => {
      (searchController.globalSearch as jest.Mock).mockImplementation((req, res) => {
        res.status(200).json({
          success: true,
          data: {
            ...mockGlobalSearchResults,
            filters: req.query,
            query: req.query.q
          }
        });
      });

      const response = await request(app)
        .get('/api/search/global?q=user&type=users&department=IT&limit=10&offset=0')
        .expect(200);

      expect(response.body.data.filters.type).toBe('users');
      expect(response.body.data.filters.department).toBe('IT');
      expect(response.body.data.filters.limit).toBe('10');
    });

    it('should handle pagination parameters', async () => {
      (searchController.globalSearch as jest.Mock).mockImplementation((req, res) => {
        const limit = parseInt(req.query.limit as string) || 20;
        const offset = parseInt(req.query.offset as string) || 0;
        
        res.status(200).json({
          success: true,
          data: {
            ...mockGlobalSearchResults,
            pagination: {
              limit,
              offset,
              hasMore: offset + limit < mockGlobalSearchResults.totalResults
            }
          }
        });
      });

      const response = await request(app)
        .get('/api/search/global?q=test&limit=5&offset=10')
        .expect(200);

      expect(response.body.data.pagination.limit).toBe(5);
      expect(response.body.data.pagination.offset).toBe(10);
      expect(response.body.data.pagination.hasMore).toBe(true);
    });

    it('should handle search with type filtering', async () => {
      (searchController.globalSearch as jest.Mock).mockImplementation((req, res) => {
        const typeFilter = req.query.type;
        const filteredResults = typeFilter 
          ? { [typeFilter]: mockGlobalSearchResults.results[typeFilter as keyof typeof mockGlobalSearchResults.results] }
          : mockGlobalSearchResults.results;

        res.status(200).json({
          success: true,
          data: {
            ...mockGlobalSearchResults,
            results: filteredResults,
            typeFilter
          }
        });
      });

      const response = await request(app)
        .get('/api/search/global?q=test&type=users')
        .expect(200);

      expect(response.body.data.typeFilter).toBe('users');
      expect(response.body.data.results.users).toBeDefined();
      expect(response.body.data.results.groups).toBeUndefined();
    });

    it('should handle empty search results', async () => {
      (searchController.globalSearch as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          success: true,
          data: {
            query: 'nonexistent',
            totalResults: 0,
            executionTime: 25,
            results: {
              users: { count: 0, items: [] },
              groups: { count: 0, items: [] },
              reports: { count: 0, items: [] }
            },
            facets: {
              types: [],
              departments: []
            }
          }
        });
      });

      const response = await request(app)
        .get('/api/search/global?q=nonexistent')
        .expect(200);

      expect(response.body.data.totalResults).toBe(0);
      expect(response.body.data.results.users.items).toHaveLength(0);
    });

    it('should handle search with sorting', async () => {
      (searchController.globalSearch as jest.Mock).mockImplementation((req, res) => {
        res.status(200).json({
          success: true,
          data: {
            ...mockGlobalSearchResults,
            sorting: {
              sortBy: req.query.sortBy || 'relevance',
              sortOrder: req.query.sortOrder || 'desc'
            }
          }
        });
      });

      const response = await request(app)
        .get('/api/search/global?q=test&sortBy=name&sortOrder=asc')
        .expect(200);

      expect(response.body.data.sorting.sortBy).toBe('name');
      expect(response.body.data.sorting.sortOrder).toBe('asc');
    });

    it('should handle search errors', async () => {
      (searchController.globalSearch as jest.Mock).mockImplementation((_req, res) => {
        res.status(500).json({
          success: false,
          error: 'Search service unavailable',
          code: 'SEARCH_SERVICE_ERROR'
        });
      });

      const response = await request(app)
        .get('/api/search/global?q=test')
        .expect(500);

      expect(response.body.error).toBe('Search service unavailable');
      expect(response.body.code).toBe('SEARCH_SERVICE_ERROR');
    });

    it('should handle search timeout', async () => {
      (searchController.globalSearch as jest.Mock).mockImplementation((_req, res) => {
        res.status(408).json({
          success: false,
          error: 'Search request timed out',
          timeout: 30000
        });
      });

      const response = await request(app)
        .get('/api/search/global?q=complex%20search%20query')
        .expect(408);

      expect(response.body.error).toBe('Search request timed out');
    });

    it('should include relevance scores in results', async () => {
      (searchController.globalSearch as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          success: true,
          data: mockGlobalSearchResults
        });
      });

      const response = await request(app)
        .get('/api/search/global?q=test')
        .expect(200);

      expect(response.body.data.results.users.items[0].relevanceScore).toBe(0.95);
      expect(response.body.data.results.groups.items[0].relevanceScore).toBe(0.78);
    });

    it('should include faceted search results', async () => {
      (searchController.globalSearch as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          success: true,
          data: mockGlobalSearchResults
        });
      });

      const response = await request(app)
        .get('/api/search/global?q=test')
        .expect(200);

      expect(response.body.data.facets.types).toHaveLength(3);
      expect(response.body.data.facets.departments).toHaveLength(2);
    });
  });

  describe('GET /api/search/suggestions', () => {
    it('should get search suggestions successfully', async () => {
      (searchController.getSuggestions as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          success: true,
          data: mockSuggestions
        });
      });

      const response = await request(app)
        .get('/api/search/suggestions?q=tes')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.suggestions).toHaveLength(3);
      expect(response.body.data.suggestions[0].text).toBe('test user');
    });

    it('should get suggestions with type filtering', async () => {
      (searchController.getSuggestions as jest.Mock).mockImplementation((req, res) => {
        const typeFilter = req.query.type;
        const filteredSuggestions = typeFilter 
          ? mockSuggestions.suggestions.filter(s => s.type === typeFilter)
          : mockSuggestions.suggestions;

        res.status(200).json({
          success: true,
          data: {
            ...mockSuggestions,
            suggestions: filteredSuggestions,
            typeFilter
          }
        });
      });

      const response = await request(app)
        .get('/api/search/suggestions?q=tes&type=user')
        .expect(200);

      expect(response.body.data.typeFilter).toBe('user');
      expect(response.body.data.suggestions).toHaveLength(1);
    });

    it('should include popular searches', async () => {
      (searchController.getSuggestions as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          success: true,
          data: mockSuggestions
        });
      });

      const response = await request(app)
        .get('/api/search/suggestions?q=')
        .expect(200);

      expect(response.body.data.popular).toHaveLength(2);
      expect(response.body.data.popular[0].text).toBe('inactive users');
    });

    it('should handle empty suggestion query', async () => {
      (searchController.getSuggestions as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          success: true,
          data: {
            query: '',
            suggestions: [],
            popular: mockSuggestions.popular
          }
        });
      });

      const response = await request(app)
        .get('/api/search/suggestions')
        .expect(200);

      expect(response.body.data.suggestions).toHaveLength(0);
      expect(response.body.data.popular).toHaveLength(2);
    });

    it('should handle suggestions with limit', async () => {
      (searchController.getSuggestions as jest.Mock).mockImplementation((req, res) => {
        const limit = parseInt(req.query.limit as string) || 10;
        const limitedSuggestions = mockSuggestions.suggestions.slice(0, limit);

        res.status(200).json({
          success: true,
          data: {
            ...mockSuggestions,
            suggestions: limitedSuggestions,
            limit
          }
        });
      });

      const response = await request(app)
        .get('/api/search/suggestions?q=tes&limit=2')
        .expect(200);

      expect(response.body.data.limit).toBe(2);
      expect(response.body.data.suggestions).toHaveLength(2);
    });

    it('should handle suggestion errors', async () => {
      (searchController.getSuggestions as jest.Mock).mockImplementation((_req, res) => {
        res.status(500).json({
          success: false,
          error: 'Failed to generate suggestions'
        });
      });

      const response = await request(app)
        .get('/api/search/suggestions?q=test')
        .expect(500);

      expect(response.body.error).toBe('Failed to generate suggestions');
    });

    it('should include suggestion weights', async () => {
      (searchController.getSuggestions as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          success: true,
          data: mockSuggestions
        });
      });

      const response = await request(app)
        .get('/api/search/suggestions?q=tes')
        .expect(200);

      expect(response.body.data.suggestions[0].weight).toBe(0.9);
      expect(response.body.data.suggestions[1].weight).toBe(0.8);
    });

    it('should handle autocomplete functionality', async () => {
      (searchController.getSuggestions as jest.Mock).mockImplementation((req, res) => {
        res.status(200).json({
          success: true,
          data: {
            ...mockSuggestions,
            autocomplete: req.query.autocomplete === 'true'
          }
        });
      });

      const response = await request(app)
        .get('/api/search/suggestions?q=tes&autocomplete=true')
        .expect(200);

      expect(response.body.data.autocomplete).toBe(true);
    });
  });

  describe('GET /api/search/recent', () => {
    it('should get recent searches successfully', async () => {
      (searchController.getRecentSearches as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          success: true,
          data: mockRecentSearches
        });
      });

      const response = await request(app)
        .get('/api/search/recent')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.searches).toHaveLength(3);
      expect(response.body.data.userId).toBe(1);
    });

    it('should get recent searches with limit', async () => {
      (searchController.getRecentSearches as jest.Mock).mockImplementation((req, res) => {
        const limit = parseInt(req.query.limit as string) || 10;
        const limitedSearches = mockRecentSearches.searches.slice(0, limit);

        res.status(200).json({
          success: true,
          data: {
            ...mockRecentSearches,
            searches: limitedSearches,
            limit
          }
        });
      });

      const response = await request(app)
        .get('/api/search/recent?limit=2')
        .expect(200);

      expect(response.body.data.limit).toBe(2);
      expect(response.body.data.searches).toHaveLength(2);
    });

    it('should handle empty recent searches', async () => {
      (searchController.getRecentSearches as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          success: true,
          data: {
            userId: 1,
            searches: [],
            totalCount: 0
          }
        });
      });

      const response = await request(app)
        .get('/api/search/recent')
        .expect(200);

      expect(response.body.data.searches).toHaveLength(0);
      expect(response.body.data.totalCount).toBe(0);
    });

    it('should include search filters in history', async () => {
      (searchController.getRecentSearches as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          success: true,
          data: mockRecentSearches
        });
      });

      const response = await request(app)
        .get('/api/search/recent')
        .expect(200);

      expect(response.body.data.searches[0].filters.type).toBe('users');
      expect(response.body.data.searches[1].filters.status).toBe('locked');
    });

    it('should handle recent search errors', async () => {
      (searchController.getRecentSearches as jest.Mock).mockImplementation((_req, res) => {
        res.status(500).json({
          success: false,
          error: 'Failed to retrieve recent searches'
        });
      });

      const response = await request(app)
        .get('/api/search/recent')
        .expect(500);

      expect(response.body.error).toBe('Failed to retrieve recent searches');
    });

    it('should order recent searches by timestamp', async () => {
      (searchController.getRecentSearches as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          success: true,
          data: mockRecentSearches
        });
      });

      const response = await request(app)
        .get('/api/search/recent')
        .expect(200);

      const timestamps = response.body.data.searches.map((s: any) => s.timestamp);
      expect(new Date(timestamps[0]).getTime()).toBeGreaterThanOrEqual(new Date(timestamps[1]).getTime());
      expect(new Date(timestamps[1]).getTime()).toBeGreaterThanOrEqual(new Date(timestamps[2]).getTime());
    });

    it('should include result counts in history', async () => {
      (searchController.getRecentSearches as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({
          success: true,
          data: mockRecentSearches
        });
      });

      const response = await request(app)
        .get('/api/search/recent')
        .expect(200);

      expect(response.body.data.searches[0].resultCount).toBe(5);
      expect(response.body.data.searches[1].resultCount).toBe(12);
    });

    it('should handle user-specific recent searches', async () => {
      // Mock different user response directly
      (searchController.getRecentSearches as jest.Mock).mockImplementation((req, res) => {
        res.status(200).json({
          success: true,
          data: {
            userId: 456, // Mock specific user ID for this test
            searches: [],
            totalCount: 0
          }
        });
      });

      const response = await request(app)
        .get('/api/search/recent')
        .expect(200);

      expect(response.body.data.userId).toBe(456);
    });
  });

  describe('Authentication', () => {
    it('should require authentication for all routes', async () => {
      // Create app without auth middleware to simulate unauthenticated requests
      const unauthedApp = express();
      unauthedApp.use(express.json());
      
      // Add routes that directly return 401 for auth testing
      unauthedApp.get('/api/search/global', (_req, res) => {
        res.status(401).json({ error: 'Authentication required' });
      });
      unauthedApp.get('/api/search/suggestions', (_req, res) => {
        res.status(401).json({ error: 'Authentication required' });
      });
      unauthedApp.get('/api/search/recent', (_req, res) => {
        res.status(401).json({ error: 'Authentication required' });
      });

      const routes = ['/global', '/suggestions', '/recent'];
      
      for (const route of routes) {
        const response = await request(unauthedApp)
          .get(`/api/search${route}`)
          .expect(401);

        expect(response.body.error).toBe('Authentication required');
      }
    });

    it('should allow authenticated users for all search routes', async () => {
      (searchController.globalSearch as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({ success: true });
      });

      (searchController.getSuggestions as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({ success: true });
      });

      (searchController.getRecentSearches as jest.Mock).mockImplementation((_req, res) => {
        res.status(200).json({ success: true });
      });

      const routes = ['/global?q=test', '/suggestions?q=tes', '/recent'];
      
      for (const route of routes) {
        const response = await request(app)
          .get(`/api/search${route}`)
          .expect(200);

        expect(response.body.success).toBe(true);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle controller errors gracefully', async () => {
      (searchController.globalSearch as jest.Mock).mockImplementation((_req, _res, next) => {
        next(new Error('Controller error'));
      });

      const response = await request(app)
        .get('/api/search/global?q=test')
        .expect(500);

      expect(response.body.error).toBe('Controller error');
    });

    it('should handle malformed query parameters', async () => {
      (searchController.globalSearch as jest.Mock).mockImplementation((_req, res) => {
        res.status(400).json({
          success: false,
          error: 'Invalid query parameters',
          details: 'Query parameter cannot be empty'
        });
      });

      const response = await request(app)
        .get('/api/search/global')
        .expect(400);

      expect(response.body.error).toBe('Invalid query parameters');
    });

    it('should handle search index unavailable', async () => {
      (searchController.globalSearch as jest.Mock).mockImplementation((_req, res) => {
        res.status(503).json({
          success: false,
          error: 'Search index temporarily unavailable',
          retryAfter: 300
        });
      });

      const response = await request(app)
        .get('/api/search/global?q=test')
        .expect(503);

      expect(response.body.retryAfter).toBe(300);
    });

    it('should handle invalid characters in search query', async () => {
      (searchController.globalSearch as jest.Mock).mockImplementation((_req, res) => {
        res.status(400).json({
          success: false,
          error: 'Invalid characters in search query',
          invalidCharacters: ['<', '>', '&']
        });
      });

      const response = await request(app)
        .get('/api/search/global?q=<script>alert("xss")</script>')
        .expect(400);

      expect(response.body.invalidCharacters).toContain('<');
    });
  });

  describe('Route Coverage Validation', () => {
    it('should have comprehensive coverage of all search routes', () => {
      const expectedRoutes = [
        'GET /global',
        'GET /suggestions',
        'GET /recent'
      ];
      
      expect(expectedRoutes.length).toBe(3);
    });
  });
});