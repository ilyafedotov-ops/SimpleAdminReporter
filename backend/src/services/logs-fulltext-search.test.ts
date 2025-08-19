import { LogsService } from './logs.service';
import { db } from '@/config/database';
import { logger } from '@/utils/logger';

jest.mock('@/config/database');
jest.mock('@/utils/logger');

describe('LogsService - Full-Text Search', () => {
  let logsService: LogsService;
  const mockDb = db as jest.Mocked<typeof db>;

  beforeEach(() => {
    jest.clearAllMocks();
    logsService = new LogsService();
  });

  describe('searchAuditLogsFullText', () => {
    it('should perform full-text search on audit logs', async () => {
      const mockCountResult = { rows: [{ count: '5' }] };
      const mockSearchResult = {
        rows: [
          {
            id: 1,
            event_type: 'login',
            event_action: 'user_login',
            username: 'testuser',
            created_at: new Date(),
            rank: 0.9,
            headline: 'User <b>login</b> successful'
          }
        ]
      };

      mockDb.query
        .mockResolvedValueOnce(mockCountResult)
        .mockResolvedValueOnce(mockSearchResult);

      const result = await logsService.searchAuditLogsFullText('login', 1, 10);

      expect(mockDb.query).toHaveBeenCalledTimes(2);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('websearch_to_tsquery'),
        ['login']
      );
      expect(result).toEqual({
        logs: expect.arrayContaining([
          expect.objectContaining({
            searchHighlight: 'User <b>login</b> successful',
            searchRank: 0.9
          })
        ]),
        total: 5,
        searchQuery: 'login',
        page: 1,
        pageSize: 10
      });
    });

    it('should handle pagination correctly', async () => {
      const mockCountResult = { rows: [{ count: '100' }] };
      const mockSearchResult = { rows: [] };

      mockDb.query
        .mockResolvedValueOnce(mockCountResult)
        .mockResolvedValueOnce(mockSearchResult);

      await logsService.searchAuditLogsFullText('test', 3, 20);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('search_audit_logs'),
        ['test', 20, 40] // pageSize, offset
      );
    });

    it('should handle search errors gracefully', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('Database error'));

      await expect(
        logsService.searchAuditLogsFullText('error query')
      ).rejects.toThrow('Database error');

      expect(logger.error).toHaveBeenCalledWith(
        'Error in full-text search for audit logs:',
        expect.any(Error)
      );
    });
  });

  describe('searchSystemLogsFullText', () => {
    it('should perform full-text search on system logs', async () => {
      const mockCountResult = { rows: [{ count: '10' }] };
      const mockSearchResult = {
        rows: [
          {
            id: 1,
            level: 'error',
            message: 'Database connection failed',
            timestamp: new Date(),
            rank: 0.95,
            headline: '<b>Database</b> connection failed'
          }
        ]
      };

      mockDb.query
        .mockResolvedValueOnce(mockCountResult)
        .mockResolvedValueOnce(mockSearchResult);

      const result = await logsService.searchSystemLogsFullText('database', 1, 50);

      expect(result).toEqual({
        logs: expect.arrayContaining([
          expect.objectContaining({
            searchHighlight: '<b>Database</b> connection failed',
            searchRank: 0.95
          })
        ]),
        total: 10,
        searchQuery: 'database',
        page: 1,
        pageSize: 50
      });
    });
  });

  describe('fuzzySearchLogs', () => {
    it('should perform fuzzy search on audit logs', async () => {
      const mockCountResult = { rows: [{ count: '3' }] };
      const mockDataResult = {
        rows: [
          {
            id: 1,
            username: 'testuser1',
            similarity_score: 0.8,
            created_at: new Date()
          },
          {
            id: 2,
            username: 'testuser2',
            similarity_score: 0.6,
            created_at: new Date()
          }
        ]
      };

      mockDb.query
        .mockResolvedValueOnce(mockCountResult)
        .mockResolvedValueOnce(mockDataResult);

      const result = await logsService.fuzzySearchLogs({
        type: 'audit',
        field: 'username',
        searchTerm: 'testuser',
        threshold: 0.3
      });

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('similarity'),
        ['testuser', 0.3]
      );
      expect(result.logs).toHaveLength(2);
      expect(result.logs[0].similarity_score).toBe(0.8);
    });

    it('should validate field names for fuzzy search', async () => {
      await expect(
        logsService.fuzzySearchLogs({
          type: 'audit',
          field: 'invalid_field',
          searchTerm: 'test'
        })
      ).rejects.toThrow('Invalid field for fuzzy search: invalid_field');
    });

    it('should use correct fields for system logs', async () => {
      const mockCountResult = { rows: [{ count: '5' }] };
      const mockDataResult = { rows: [] };

      mockDb.query
        .mockResolvedValueOnce(mockCountResult)
        .mockResolvedValueOnce(mockDataResult);

      await logsService.fuzzySearchLogs({
        type: 'system',
        field: 'message',
        searchTerm: 'error'
      });

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM system_logs'),
        expect.any(Array)
      );
    });
  });

  describe('enhancedSearch', () => {
    it('should use full-text search for multi-word queries', async () => {
      const mockAuditResult = {
        logs: [{ id: 1, logType: 'audit' }],
        total: 1
      };
      const mockSystemResult = {
        logs: [{ id: 2, logType: 'system' }],
        total: 1
      };

      // Mock searchAuditLogsFullText
      jest.spyOn(logsService, 'searchAuditLogsFullText')
        .mockResolvedValueOnce(mockAuditResult);
      jest.spyOn(logsService, 'searchSystemLogsFullText')
        .mockResolvedValueOnce(mockSystemResult);

      const result = await logsService.enhancedSearch({
        search: 'user login failed',
        type: 'all'
      });

      expect(logsService.searchAuditLogsFullText).toHaveBeenCalled();
      expect(logsService.searchSystemLogsFullText).toHaveBeenCalled();
      expect(result.searchMethod).toBe('fulltext');
    });

    it('should use fuzzy search for single words', async () => {
      const mockFuzzyResult = {
        logs: [{ id: 1, username: 'admin' }],
        total: 1
      };

      jest.spyOn(logsService, 'fuzzySearchLogs')
        .mockResolvedValue(mockFuzzyResult);

      const result = await logsService.enhancedSearch({
        search: 'admin',
        type: 'audit'
      });

      expect(logsService.fuzzySearchLogs).toHaveBeenCalledWith({
        type: 'audit',
        field: 'username',
        searchTerm: 'admin',
        threshold: 0.3,
        page: undefined,
        pageSize: undefined
      });
      expect(result.searchMethod).toBe('fuzzy');
    });

    it('should fall back to regular search on error', async () => {
      jest.spyOn(logsService, 'searchAuditLogsFullText')
        .mockRejectedValueOnce(new Error('Search failed'));
      jest.spyOn(logsService, 'getCombinedLogs')
        .mockResolvedValueOnce({ audit: [], system: [] });

      await logsService.enhancedSearch({
        search: 'test query',
        type: 'all'
      });

      expect(logsService.getCombinedLogs).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(
        'Error in enhanced search:',
        expect.any(Error)
      );
    });

    it('should detect search operators', async () => {
      jest.spyOn(logsService, 'searchAuditLogsFullText')
        .mockResolvedValueOnce({ logs: [], total: 0 });

      await logsService.enhancedSearch({
        search: 'login & !failed',
        type: 'audit'
      });

      expect(logsService.searchAuditLogsFullText).toHaveBeenCalled();
    });
  });

  describe('combineSearchResults', () => {
    it('should combine and deduplicate results', () => {
      const results = {
        fullText: {
          audit: {
            logs: [
              { id: 1, event_type: 'login' },
              { id: 2, event_type: 'logout' }
            ]
          },
          system: {
            logs: [
              { id: 3, level: 'error' }
            ]
          }
        },
        fuzzy: {
          audit: {
            logs: [
              { id: 1, event_type: 'login' }, // Duplicate
              { id: 4, event_type: 'access' }
            ]
          },
          system: null
        }
      };

      const combined = (logsService as any).combineSearchResults(results);

      expect(combined).toHaveLength(4);
      expect(combined.filter((log: any) => log.id === 1)).toHaveLength(1);
      expect(combined[0].searchMethod).toBe('fulltext');
    });

    it('should sort results by timestamp', () => {
      const now = new Date();
      const earlier = new Date(now.getTime() - 1000);
      const earliest = new Date(now.getTime() - 2000);

      const results = {
        fullText: {
          audit: {
            logs: [
              { id: 1, created_at: earliest },
              { id: 2, created_at: now }
            ]
          }
        },
        fuzzy: {
          system: {
            logs: [
              { id: 3, timestamp: earlier }
            ]
          }
        }
      };

      const combined = (logsService as any).combineSearchResults(results);

      expect(combined[0].id).toBe(2); // Most recent
      expect(combined[1].id).toBe(3);
      expect(combined[2].id).toBe(1); // Oldest
    });
  });
});