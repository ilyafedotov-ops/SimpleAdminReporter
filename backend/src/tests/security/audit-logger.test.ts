import { auditLogger } from '@/services/audit-logger.service';
import { db } from '@/config/database';
import { Request } from 'express';

// Mock dependencies
jest.mock('@/config/database');
jest.mock('@/utils/logger');

describe('AuditLogger', () => {
  let mockRequest: Partial<Request>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mock request
    mockRequest = {
      ip: '127.0.0.1',
      get: jest.fn((header: string) => {
        if (header === 'user-agent') return 'Test Browser';
        if (header === 'x-forwarded-for') return '192.168.1.1, 10.0.0.1';
        return undefined;
      }) as any
    };

    // Mock database client
    const mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };
    jest.mocked(db.getClient).mockResolvedValue(mockClient as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('logAuth', () => {
    it('should log authentication events', async () => {
      const context = {
        user: { id: 1, username: 'testuser' },
        request: mockRequest as Request,
        sessionId: 'session123'
      };

      await auditLogger.logAuth('login', context, { authSource: 'local' }, true);

      // Force flush to test batching
      await auditLogger.forceFlush();

      const mockClient = await db.getClient();
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO audit_logs'),
        expect.arrayContaining([
          'auth',
          'login',
          1,
          'testuser',
          '192.168.1.1',
          'Test Browser',
          'session123',
          null,
          null,
          expect.objectContaining({ authSource: 'local' }),
          true,
          null
        ])
      );
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should log failed authentication with error message', async () => {
      const context = {
        request: mockRequest as Request
      };

      await auditLogger.logAuth(
        'login_failed',
        context,
        { username: 'testuser', authSource: 'ad' },
        false,
        'Invalid credentials'
      );

      await auditLogger.forceFlush();

      const mockClient = await db.getClient();
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO audit_logs'),
        expect.arrayContaining([
          'auth',
          'login_failed',
          null,
          'testuser',
          '192.168.1.1',
          'Test Browser',
          null,
          null,
          null,
          expect.objectContaining({ username: 'testuser', authSource: 'ad' }),
          false,
          'Invalid credentials'
        ])
      );
    });
  });

  describe('logSecurity', () => {
    it('should log security events', async () => {
      const context = {
        user: { id: 1, username: 'testuser' },
        request: mockRequest as Request
      };

      await auditLogger.logSecurity(
        'password_changed',
        context,
        { passwordStrength: 'strong' },
        true
      );

      await auditLogger.forceFlush();

      const mockClient = await db.getClient();
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO audit_logs'),
        expect.arrayContaining([
          'security',
          'password_changed',
          1,
          'testuser',
          expect.any(String),
          expect.any(String),
          expect.any(String),
          expect.any(String),
          expect.any(String),
          expect.objectContaining({ passwordStrength: 'strong' }),
          true,
          null
        ])
      );
    });
  });

  describe('batch processing', () => {
    it('should batch multiple log entries', async () => {
      const context = {
        user: { id: 1, username: 'testuser' }
      };

      // Add multiple entries without forcing flush
      for (let i = 0; i < 5; i++) {
        await auditLogger.logAuth('login', context, {}, true);
      }

      // Verify no database calls yet (batching)
      const mockClient = await db.getClient();
      expect(mockClient.query).not.toHaveBeenCalled();

      // Force flush
      await auditLogger.forceFlush();

      // Should have batched all 5 entries in one INSERT
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO audit_logs'),
        expect.arrayContaining(Array(5 * 12).fill(expect.anything())) // 5 entries × 12 fields
      );
    });
  });

  describe('queryLogs', () => {
    it('should query logs with filters', async () => {
      const mockLogs = [
        { id: 1, event_type: 'auth', event_action: 'login', user_id: 1 },
        { id: 2, event_type: 'auth', event_action: 'logout', user_id: 1 }
      ];

      jest.mocked(db.query)
        .mockResolvedValueOnce({ rows: [{ count: '2' }], rowCount: 1 } as any) // Count query
        .mockResolvedValueOnce({ rows: mockLogs, rowCount: 2 } as any); // Data query

      const result = await auditLogger.queryLogs({
        eventType: 'auth',
        userId: 1,
        limit: 10,
        offset: 0
      });

      expect(result.logs).toEqual(mockLogs);
      expect(result.total).toBe(2);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT COUNT(*) FROM audit_logs'),
        expect.arrayContaining(['auth', 1])
      );
    });
  });

  describe('getUserActivitySummary', () => {
    it('should return user activity summary', async () => {
      const mockSummary = [
        { event_type: 'auth', event_action: 'login', count: '10', failed_count: '2' },
        { event_type: 'access', event_action: 'report_access', count: '25', failed_count: '0' }
      ];

      jest.mocked(db.query).mockResolvedValue({
        rows: mockSummary,
        rowCount: 2
      } as any);

      const result = await auditLogger.getUserActivitySummary(1, 30);

      expect(result).toEqual(mockSummary);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('GROUP BY event_type, event_action'),
        [1, '30 days']
      );
    });
  });

  describe('getSecurityEventsSummary', () => {
    it('should return security events summary', async () => {
      const mockSummary = [
        { event_action: 'login_failed', count: '15', unique_users: '5', unique_ips: '8' },
        { event_action: 'account_locked', count: '3', unique_users: '3', unique_ips: '3' }
      ];

      jest.mocked(db.query).mockResolvedValue({
        rows: mockSummary,
        rowCount: 2
      } as any);

      const result = await auditLogger.getSecurityEventsSummary(24);

      expect(result).toEqual(mockSummary);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining("WHERE event_type IN ('auth', 'security')"),
        ['24 hours']
      );
    });
  });
});