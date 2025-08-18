import { Request, Response, NextFunction } from 'express';
import { db } from '@/config/database';
import { logger } from '@/utils/logger';
import { dbPoolMonitor, ensureDbCleanup } from './db-pool-monitor.middleware';

// Mock dependencies
jest.mock('@/config/database');
jest.mock('@/utils/logger');

describe('Database Pool Monitor Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let mockDb: jest.Mocked<typeof db>;
  let mockLogger: jest.Mocked<typeof logger>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockReq = {
      path: '/api/test',
      method: 'GET'
    };
    
    mockRes = {
      setHeader: jest.fn(),
      end: jest.fn(),
      statusCode: 200
    };
    
    mockNext = jest.fn();
    mockDb = db as jest.Mocked<typeof db>;
    mockLogger = logger as jest.Mocked<typeof logger>;
  });

  describe('dbPoolMonitor middleware', () => {
    test('should add pool statistics to response headers', () => {
      const mockPoolStats = {
        totalCount: 10,
        idleCount: 5,
        waitingCount: 0
      };
      
      mockDb.getPoolStats.mockReturnValue(mockPoolStats);
      
      dbPoolMonitor(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-DB-Pool-Total', '10');
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-DB-Pool-Idle', '5');
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-DB-Pool-Waiting', '0');
      expect(mockNext).toHaveBeenCalled();
    });

    test('should log warning when pool is exhausted', () => {
      const mockPoolStats = {
        totalCount: 10,
        idleCount: 0,
        waitingCount: 3
      };
      
      mockDb.getPoolStats.mockReturnValue(mockPoolStats);
      
      dbPoolMonitor(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Database connection pool exhausted',
        {
          poolStats: mockPoolStats,
          endpoint: mockReq.path,
          method: mockReq.method
        }
      );
      expect(mockNext).toHaveBeenCalled();
    });

    test('should not log warning when pool has idle connections', () => {
      const mockPoolStats = {
        totalCount: 10,
        idleCount: 5,
        waitingCount: 0
      };
      
      mockDb.getPoolStats.mockReturnValue(mockPoolStats);
      
      dbPoolMonitor(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockLogger.warn).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    test('should not log warning when there are idle connections even with waiting connections', () => {
      const mockPoolStats = {
        totalCount: 10,
        idleCount: 2,
        waitingCount: 1
      };
      
      mockDb.getPoolStats.mockReturnValue(mockPoolStats);
      
      dbPoolMonitor(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockLogger.warn).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    test('should handle undefined pool stats gracefully', () => {
      mockDb.getPoolStats.mockReturnValue(null as any);
      
      expect(() => {
        dbPoolMonitor(mockReq as Request, mockRes as Response, mockNext);
      }).toThrow();
    });

    test('should handle missing request path and method', () => {
      const mockPoolStats = {
        totalCount: 10,
        idleCount: 0,
        waitingCount: 2
      };
      
      mockDb.getPoolStats.mockReturnValue(mockPoolStats);
      const reqWithoutPath = {} as Request;
      
      dbPoolMonitor(reqWithoutPath, mockRes as Response, mockNext);
      
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Database connection pool exhausted',
        expect.objectContaining({
          poolStats: mockPoolStats,
          endpoint: undefined,
          method: undefined
        })
      );
      expect(mockNext).toHaveBeenCalled();
    });

    test('should handle pool stats with zero total connections', () => {
      const mockPoolStats = {
        totalCount: 0,
        idleCount: 0,
        waitingCount: 5
      };
      
      mockDb.getPoolStats.mockReturnValue(mockPoolStats);
      
      dbPoolMonitor(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockLogger.warn).toHaveBeenCalled();
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-DB-Pool-Total', '0');
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-DB-Pool-Idle', '0');
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-DB-Pool-Waiting', '5');
    });

    test('should handle database connection errors gracefully', () => {
      mockDb.getPoolStats.mockImplementation(() => {
        throw new Error('Database connection error');
      });
      
      expect(() => {
        dbPoolMonitor(mockReq as Request, mockRes as Response, mockNext);
      }).toThrow('Database connection error');
    });

    test('should convert all pool stats to strings in headers', () => {
      const mockPoolStats = {
        totalCount: 25,
        idleCount: 15,
        waitingCount: 3
      };
      
      mockDb.getPoolStats.mockReturnValue(mockPoolStats);
      
      dbPoolMonitor(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-DB-Pool-Total', '25');
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-DB-Pool-Idle', '15');
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-DB-Pool-Waiting', '3');
    });
  });

  describe('ensureDbCleanup middleware', () => {
    test('should override response end method', () => {
      const originalEnd = jest.fn();
      mockRes.end = originalEnd;
      
      ensureDbCleanup(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockRes.end).not.toBe(originalEnd);
      expect(mockNext).toHaveBeenCalled();
    });

    test('should call original end method with arguments', () => {
      const originalEnd = jest.fn();
      mockRes.end = originalEnd;
      
      ensureDbCleanup(mockReq as Request, mockRes as Response, mockNext);
      
      const mockPoolStats = {
        totalCount: 10,
        idleCount: 5,
        waitingCount: 0
      };
      mockDb.getPoolStats.mockReturnValue(mockPoolStats);
      
      const testData = 'test response data';
      (mockRes.end as any)(testData);
      
      expect(originalEnd).toHaveBeenCalledWith(testData);
    });

    test('should log warning when connections are waiting after request completion', () => {
      const originalEnd = jest.fn();
      mockRes.end = originalEnd;
      mockRes.statusCode = 200;
      
      ensureDbCleanup(mockReq as Request, mockRes as Response, mockNext);
      
      const mockPoolStats = {
        totalCount: 10,
        idleCount: 3,
        waitingCount: 2
      };
      mockDb.getPoolStats.mockReturnValue(mockPoolStats);
      
      (mockRes.end as any)();
      
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Database connections waiting after request completion',
        {
          poolStats: mockPoolStats,
          endpoint: mockReq.path,
          statusCode: 200
        }
      );
    });

    test('should not log warning when no connections are waiting', () => {
      const originalEnd = jest.fn();
      mockRes.end = originalEnd;
      
      ensureDbCleanup(mockReq as Request, mockRes as Response, mockNext);
      
      const mockPoolStats = {
        totalCount: 10,
        idleCount: 8,
        waitingCount: 0
      };
      mockDb.getPoolStats.mockReturnValue(mockPoolStats);
      
      (mockRes.end as any)();
      
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    test('should handle multiple arguments passed to end method', () => {
      const originalEnd = jest.fn();
      mockRes.end = originalEnd;
      
      ensureDbCleanup(mockReq as Request, mockRes as Response, mockNext);
      
      const mockPoolStats = {
        totalCount: 10,
        idleCount: 5,
        waitingCount: 0
      };
      mockDb.getPoolStats.mockReturnValue(mockPoolStats);
      
      const chunk = 'response data';
      const encoding = 'utf8';
      const callback = jest.fn();
      
      (mockRes.end as any)(chunk, encoding, callback);
      
      expect(originalEnd).toHaveBeenCalledWith(chunk, encoding, callback);
    });

    test('should handle end method called without arguments', () => {
      const originalEnd = jest.fn();
      mockRes.end = originalEnd;
      
      ensureDbCleanup(mockReq as Request, mockRes as Response, mockNext);
      
      const mockPoolStats = {
        totalCount: 10,
        idleCount: 5,
        waitingCount: 0
      };
      mockDb.getPoolStats.mockReturnValue(mockPoolStats);
      
      (mockRes.end as any)();
      
      expect(originalEnd).toHaveBeenCalledWith();
    });

    test('should return the result from original end method', () => {
      const originalEnd = jest.fn().mockReturnValue('end result');
      mockRes.end = originalEnd;
      
      ensureDbCleanup(mockReq as Request, mockRes as Response, mockNext);
      
      const mockPoolStats = {
        totalCount: 10,
        idleCount: 5,
        waitingCount: 0
      };
      mockDb.getPoolStats.mockReturnValue(mockPoolStats);
      
      const result = (mockRes.end as any)('test data');
      
      expect(result).toBe('end result');
    });

    test('should handle errors during pool stats retrieval', () => {
      const originalEnd = jest.fn();
      mockRes.end = originalEnd;
      
      ensureDbCleanup(mockReq as Request, mockRes as Response, mockNext);
      
      mockDb.getPoolStats.mockImplementation(() => {
        throw new Error('Pool stats error');
      });
      
      expect(() => {
        (mockRes.end as any)();
      }).toThrow('Pool stats error');
    });

    test('should handle missing request properties gracefully', () => {
      const originalEnd = jest.fn();
      mockRes.end = originalEnd;
      mockRes.statusCode = undefined as any;
      const reqWithoutProps = {} as Request;
      
      ensureDbCleanup(reqWithoutProps, mockRes as Response, mockNext);
      
      const mockPoolStats = {
        totalCount: 10,
        idleCount: 2,
        waitingCount: 3
      };
      mockDb.getPoolStats.mockReturnValue(mockPoolStats);
      
      (mockRes.end as any)();
      
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Database connections waiting after request completion',
        {
          poolStats: mockPoolStats,
          endpoint: undefined,
          statusCode: undefined
        }
      );
    });

    test('should preserve function binding context', () => {
      const originalEnd = jest.fn();
      mockRes.end = originalEnd;
      
      ensureDbCleanup(mockReq as Request, mockRes as Response, mockNext);
      
      const mockPoolStats = {
        totalCount: 10,
        idleCount: 5,
        waitingCount: 0
      };
      mockDb.getPoolStats.mockReturnValue(mockPoolStats);
      
      // Call the overridden end method
      (mockRes.end as any).call(mockRes, 'test data');
      
      // Verify original method was called with correct context
      expect(originalEnd).toHaveBeenCalledWith('test data');
    });

    test('should handle high waiting connection count scenarios', () => {
      const originalEnd = jest.fn();
      mockRes.end = originalEnd;
      
      ensureDbCleanup(mockReq as Request, mockRes as Response, mockNext);
      
      const mockPoolStats = {
        totalCount: 50,
        idleCount: 0,
        waitingCount: 25
      };
      mockDb.getPoolStats.mockReturnValue(mockPoolStats);
      
      (mockRes.end as any)();
      
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Database connections waiting after request completion',
        expect.objectContaining({
          poolStats: expect.objectContaining({
            waitingCount: 25
          })
        })
      );
    });
  });

  describe('Integration Tests', () => {
    test('should work together as middleware chain', () => {
      const originalEnd = jest.fn();
      mockRes.end = originalEnd;
      
      const mockPoolStats = {
        totalCount: 10,
        idleCount: 0, // Pool exhausted - no idle connections
        waitingCount: 2 // Connections waiting
      };
      mockDb.getPoolStats.mockReturnValue(mockPoolStats);
      
      // Apply both middleware
      dbPoolMonitor(mockReq as Request, mockRes as Response, mockNext);
      ensureDbCleanup(mockReq as Request, mockRes as Response, mockNext);
      
      // First middleware should add headers
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-DB-Pool-Total', '10');
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-DB-Pool-Idle', '0');
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-DB-Pool-Waiting', '2');
      
      // First middleware should log pool exhaustion warning
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Database connection pool exhausted',
        expect.any(Object)
      );
      
      // Simulate response end
      (mockRes.end as any)();
      
      // Second middleware should log cleanup warning
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Database connections waiting after request completion',
        expect.any(Object)
      );
      
      expect(mockNext).toHaveBeenCalledTimes(2);
    });

    test('should handle middleware order independence', () => {
      const originalEnd = jest.fn();
      mockRes.end = originalEnd;
      
      const mockPoolStats = {
        totalCount: 15,
        idleCount: 10,
        waitingCount: 0
      };
      mockDb.getPoolStats.mockReturnValue(mockPoolStats);
      
      // Apply middleware in reverse order
      ensureDbCleanup(mockReq as Request, mockRes as Response, mockNext);
      dbPoolMonitor(mockReq as Request, mockRes as Response, mockNext);
      
      // Both should work independently
      expect(mockRes.setHeader).toHaveBeenCalledTimes(3);
      expect(mockNext).toHaveBeenCalledTimes(2);
      
      (mockRes.end as any)();
      expect(originalEnd).toHaveBeenCalled();
    });
  });
});