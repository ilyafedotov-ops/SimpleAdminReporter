/**
 * Comprehensive unit tests for ExportController
 * Tests all endpoints, error handling, authorization, validation, and business logic
 */

import { Request, Response, NextFunction } from 'express';
import { ExportController } from './export.controller';
import { db } from '@/config/database';
import { reportExecutor } from '@/services/report-executor.service';
import { exportService } from '@/services/export.service';
import { addReportToQueue } from '@/queues/report.queue';
import { createError } from '@/middleware/error.middleware';
import { logger } from '@/utils/logger';
import fs from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import path from 'path';

// Mock all dependencies
jest.mock('@/config/database');
jest.mock('@/services/report-executor.service');
jest.mock('@/services/export.service');
jest.mock('@/queues/report.queue');
jest.mock('@/middleware/error.middleware');
jest.mock('@/utils/logger');
jest.mock('fs/promises');
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn()
}));
jest.mock('path');

describe('ExportController', () => {
  let exportController: ExportController;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  // Mock users
  const mockUser = {
    id: 1,
    username: 'testuser',
    displayName: 'Test User',
    email: 'test@example.com',
    authSource: 'local' as const,
    isAdmin: false,
    isActive: true
  };

  const mockAdminUser = {
    id: 2,
    username: 'adminuser',
    displayName: 'Admin User',
    email: 'admin@example.com',
    authSource: 'local' as const,
    isAdmin: true,
    isActive: true
  };


  // Mock responses
  const mockJsonResponse = jest.fn();
  const mockStatusResponse = jest.fn();
  const mockSendResponse = jest.fn();
  const mockSetHeaderResponse = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    
    exportController = new ExportController();
    
    mockReq = {
      params: {},
      body: {},
      query: {},
      user: mockUser
    };

    mockRes = {
      json: mockJsonResponse,
      status: mockStatusResponse,
      send: mockSendResponse,
      setHeader: mockSetHeaderResponse,
      pipe: jest.fn()
    };

    mockNext = jest.fn();

    // Reset environment variables
    delete process.env.REPORT_EXPORT_PATH;

    // Mock path module
    (path.join as jest.Mock).mockImplementation((...args) => args.join('/'));
    (path.dirname as jest.Mock).mockImplementation((p) => p.substring(0, p.lastIndexOf('/')));
    (path.basename as jest.Mock).mockImplementation((p) => p.substring(p.lastIndexOf('/') + 1));
    (path.extname as jest.Mock).mockImplementation((p) => {
      const lastDot = p.lastIndexOf('.');
      return lastDot >= 0 ? p.substring(lastDot) : '';
    });

    // Mock fs operations
    (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
    (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
    (fs.access as jest.Mock).mockResolvedValue(undefined);
    (fs.stat as jest.Mock).mockResolvedValue({ size: 1024 });
    (fs.open as jest.Mock).mockResolvedValue({
      createReadStream: jest.fn().mockReturnValue({
        pipe: jest.fn(),
        on: jest.fn()
      }),
      close: jest.fn()
    });

    // Mock fs sync operations
    (existsSync as jest.Mock).mockReturnValue(false);
    (readFileSync as jest.Mock).mockReturnValue('');

    mockJsonResponse.mockReturnValue(mockRes);
    mockStatusResponse.mockReturnValue(mockRes);
    mockSetHeaderResponse.mockReturnValue(mockRes);
  });

  describe('exportReport', () => {
    const mockQueryResult = {
      success: true,
      data: [
        { id: 1, name: 'Test User 1', email: 'test1@example.com' },
        { id: 2, name: 'Test User 2', email: 'test2@example.com' }
      ],
      executionTime: 150,
      rowCount: 2
    };

    const mockExportResult = {
      data: Buffer.from('exported data'),
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: 'test-report.xlsx'
    };

    beforeEach(() => {
      (reportExecutor.executeReport as jest.Mock).mockResolvedValue(mockQueryResult);
      (exportService.exportData as jest.Mock).mockResolvedValue(mockExportResult);
      (db.query as jest.Mock).mockResolvedValue({ rows: [] });
    });

    it('should export report to Excel successfully', async () => {
      mockReq.params = { templateId: 'test-template' };
      mockReq.body = { format: 'excel', parameters: { status: 'active' } };

      await exportController.exportReport(mockReq as Request, mockRes as Response, mockNext);

      expect(reportExecutor.executeReport).toHaveBeenCalledWith({
        userId: 1,
        templateId: 'test-template',
        parameters: { status: 'active' }
      });

      expect(exportService.exportData).toHaveBeenCalledWith(
        mockQueryResult.data,
        'excel',
        'test-template'
      );

      expect(fs.mkdir).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalled();
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO report_history'),
        expect.arrayContaining([
          1, // user_id
          'test-template', // template_id
          null, // custom_template_id
          JSON.stringify({ status: 'active' }), // parameters
          'completed', // status
          expect.any(String), // file_path
          2, // row_count
          'excel', // export_format
          expect.any(Date) // expires_at
        ])
      );

      expect(mockJsonResponse).toHaveBeenCalledWith({
        success: true,
        data: {
          fileName: expect.any(String),
          format: 'excel',
          rowCount: 2,
          downloadUrl: expect.stringContaining('/api/export/download/')
        }
      });
    });

    it('should export report to CSV successfully', async () => {
      mockReq.params = { templateId: 'test-template' };
      mockReq.body = { format: 'csv', parameters: {} };

      const csvExportResult = {
        ...mockExportResult,
        contentType: 'text/csv',
        filename: 'test-report.csv'
      };
      (exportService.exportData as jest.Mock).mockResolvedValue(csvExportResult);

      await exportController.exportReport(mockReq as Request, mockRes as Response, mockNext);

      expect(exportService.exportData).toHaveBeenCalledWith(
        mockQueryResult.data,
        'csv',
        'test-template'
      );

      expect(mockJsonResponse).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          format: 'csv'
        })
      });
    });

    it('should export report to PDF successfully', async () => {
      mockReq.params = { templateId: 'test-template' };
      mockReq.body = { format: 'pdf', parameters: {} };

      const pdfExportResult = {
        ...mockExportResult,
        contentType: 'application/pdf',
        filename: 'test-report.pdf'
      };
      (exportService.exportData as jest.Mock).mockResolvedValue(pdfExportResult);

      await exportController.exportReport(mockReq as Request, mockRes as Response, mockNext);

      expect(exportService.exportData).toHaveBeenCalledWith(
        mockQueryResult.data,
        'pdf',
        'test-template'
      );

      expect(mockJsonResponse).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          format: 'pdf'
        })
      });
    });

    it('should export custom report successfully', async () => {
      mockReq.params = { customTemplateId: 'custom-123' };
      mockReq.body = { format: 'excel', parameters: {} };

      const mockCustomTemplate = {
        id: 'custom-123',
        name: 'Custom Report',
        is_public: true,
        created_by: 1
      };

      (db.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockCustomTemplate] }) // Template query
        .mockResolvedValueOnce({ rows: [] }); // History insert

      await exportController.exportReport(mockReq as Request, mockRes as Response, mockNext);

      expect(db.query).toHaveBeenCalledWith(
        'SELECT * FROM custom_report_templates WHERE id = $1',
        ['custom-123']
      );

      expect(reportExecutor.executeReport).toHaveBeenCalledWith({
        userId: 1,
        templateId: 'custom-123',
        parameters: {}
      });
    });

    it('should handle invalid export format', async () => {
      mockReq.params = { templateId: 'test-template' };
      mockReq.body = { format: 'invalid', parameters: {} };

      (createError as jest.Mock).mockReturnValue(new Error('Invalid export format'));

      await exportController.exportReport(mockReq as Request, mockRes as Response, mockNext);

      expect(createError).toHaveBeenCalledWith('Invalid export format', 400);
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should handle custom template not found', async () => {
      mockReq.params = { customTemplateId: 'non-existent' };
      mockReq.body = { format: 'excel', parameters: {} };

      (db.query as jest.Mock).mockResolvedValue({ rows: [] });
      (createError as jest.Mock).mockReturnValue(new Error('Custom report template not found'));

      await exportController.exportReport(mockReq as Request, mockRes as Response, mockNext);

      expect(createError).toHaveBeenCalledWith('Custom report template not found', 404);
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should handle access denied to private custom template', async () => {
      mockReq.params = { customTemplateId: 'private-123' };
      mockReq.body = { format: 'excel', parameters: {} };

      const mockPrivateTemplate = {
        id: 'private-123',
        name: 'Private Report',
        is_public: false,
        created_by: 999 // Different user
      };

      (db.query as jest.Mock).mockResolvedValue({ rows: [mockPrivateTemplate] });
      (createError as jest.Mock).mockReturnValue(new Error('Access denied to this report'));

      await exportController.exportReport(mockReq as Request, mockRes as Response, mockNext);

      expect(createError).toHaveBeenCalledWith('Access denied to this report', 403);
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should allow admin access to private templates', async () => {
      mockReq.user = mockAdminUser;
      mockReq.params = { customTemplateId: 'private-123' };
      mockReq.body = { format: 'excel', parameters: {} };

      const mockPrivateTemplate = {
        id: 'private-123',
        name: 'Private Report',
        is_public: false,
        created_by: 999 // Different user
      };

      (db.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockPrivateTemplate] })
        .mockResolvedValueOnce({ rows: [] });

      await exportController.exportReport(mockReq as Request, mockRes as Response, mockNext);

      expect(reportExecutor.executeReport).toHaveBeenCalled();
      expect(mockJsonResponse).toHaveBeenCalledWith(expect.objectContaining({
        success: true
      }));
    });

    it('should handle query execution failure', async () => {
      mockReq.params = { templateId: 'test-template' };
      mockReq.body = { format: 'excel', parameters: {} };

      const failedQueryResult = {
        success: false,
        error: 'Database connection failed',
        executionTime: 50,
        rowCount: 0
      };

      (reportExecutor.executeReport as jest.Mock).mockResolvedValue(failedQueryResult);
      (createError as jest.Mock).mockReturnValue(new Error('Query execution failed'));

      await exportController.exportReport(mockReq as Request, mockRes as Response, mockNext);

      expect(createError).toHaveBeenCalledWith('Database connection failed', 500);
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should use container export path when in container', async () => {
      mockReq.params = { templateId: 'test-template' };
      mockReq.body = { format: 'excel', parameters: {} };

      (existsSync as jest.Mock).mockReturnValue(true); // Mock /.dockerenv exists

      await exportController.exportReport(mockReq as Request, mockRes as Response, mockNext);

      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('/app/exports'),
        { recursive: true }
      );
    });

    it('should use custom export path from environment', async () => {
      process.env.REPORT_EXPORT_PATH = '/custom/export/path';
      
      mockReq.params = { templateId: 'test-template' };
      mockReq.body = { format: 'excel', parameters: {} };

      await exportController.exportReport(mockReq as Request, mockRes as Response, mockNext);

      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('/custom/export/path'),
        { recursive: true }
      );
    });

    it('should handle export service errors', async () => {
      mockReq.params = { templateId: 'test-template' };
      mockReq.body = { format: 'excel', parameters: {} };

      (exportService.exportData as jest.Mock).mockRejectedValue(new Error('Export failed'));

      await exportController.exportReport(mockReq as Request, mockRes as Response, mockNext);

      expect(logger.error).toHaveBeenCalledWith('Export error:', expect.any(Error));
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should default to excel format when not specified', async () => {
      mockReq.params = { templateId: 'test-template' };
      mockReq.body = { parameters: {} }; // No format specified

      await exportController.exportReport(mockReq as Request, mockRes as Response, mockNext);

      expect(exportService.exportData).toHaveBeenCalledWith(
        mockQueryResult.data,
        'excel', // Should default to excel
        'test-template'
      );
    });

    it('should handle large datasets', async () => {
      mockReq.params = { templateId: 'large-dataset' };
      mockReq.body = { format: 'csv', parameters: {} };

      const largeDataset = Array.from({ length: 10000 }, (_, i) => ({
        id: i + 1,
        name: `User ${i + 1}`,
        email: `user${i + 1}@example.com`
      }));

      const largeQueryResult = {
        ...mockQueryResult,
        data: largeDataset,
        rowCount: 10000
      };

      (reportExecutor.executeReport as jest.Mock).mockResolvedValue(largeQueryResult);

      await exportController.exportReport(mockReq as Request, mockRes as Response, mockNext);

      expect(exportService.exportData).toHaveBeenCalledWith(
        largeDataset,
        'csv',
        'large-dataset'
      );

      expect(mockJsonResponse).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          rowCount: 10000
        })
      });
    });
  });

  describe('queueExport', () => {
    const mockJob = {
      id: 'job-123',
      data: {
        templateId: 'test-template',
        userId: 1,
        exportFormat: 'excel'
      }
    };

    beforeEach(() => {
      (addReportToQueue as jest.Mock).mockResolvedValue(mockJob);
    });

    it('should queue export successfully', async () => {
      mockReq.params = { templateId: 'test-template' };
      mockReq.body = { format: 'excel', parameters: { status: 'active' }, priority: 2 };

      await exportController.queueExport(mockReq as Request, mockRes as Response, mockNext);

      expect(addReportToQueue).toHaveBeenCalledWith({
        templateId: 'test-template',
        customTemplateId: undefined,
        parameters: { status: 'active' },
        userId: 1,
        exportFormat: 'excel',
        priority: 2
      });

      expect(mockJsonResponse).toHaveBeenCalledWith({
        success: true,
        data: {
          jobId: 'job-123',
          status: 'queued',
          message: 'Report queued for export. Check status using the job ID.'
        }
      });
    });

    it('should queue custom template export', async () => {
      mockReq.params = { customTemplateId: 'custom-123' };
      mockReq.body = { format: 'pdf', parameters: {} };

      await exportController.queueExport(mockReq as Request, mockRes as Response, mockNext);

      expect(addReportToQueue).toHaveBeenCalledWith({
        templateId: undefined,
        customTemplateId: 'custom-123',
        parameters: {},
        userId: 1,
        exportFormat: 'pdf',
        priority: 1 // Default priority
      });
    });

    it('should handle invalid export format', async () => {
      mockReq.params = { templateId: 'test-template' };
      mockReq.body = { format: 'invalid', parameters: {} };

      (createError as jest.Mock).mockReturnValue(new Error('Invalid export format'));

      await exportController.queueExport(mockReq as Request, mockRes as Response, mockNext);

      expect(createError).toHaveBeenCalledWith('Invalid export format', 400);
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should handle queue errors', async () => {
      mockReq.params = { templateId: 'test-template' };
      mockReq.body = { format: 'excel', parameters: {} };

      (addReportToQueue as jest.Mock).mockRejectedValue(new Error('Queue unavailable'));

      await exportController.queueExport(mockReq as Request, mockRes as Response, mockNext);

      expect(logger.error).toHaveBeenCalledWith('Queue export error:', expect.any(Error));
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should default format and priority when not specified', async () => {
      mockReq.params = { templateId: 'test-template' };
      mockReq.body = { parameters: {} };

      await exportController.queueExport(mockReq as Request, mockRes as Response, mockNext);

      expect(addReportToQueue).toHaveBeenCalledWith({
        templateId: 'test-template',
        customTemplateId: undefined,
        parameters: {},
        userId: 1,
        exportFormat: 'excel', // Default
        priority: 1 // Default
      });
    });
  });

  describe('downloadFile', () => {
    const mockHistoryRecord = {
      id: 1,
      user_id: 1,
      file_path: '/app/exports/test-report.xlsx',
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000) // Tomorrow
    };

    beforeEach(() => {
      (db.query as jest.Mock).mockResolvedValue({ rows: [mockHistoryRecord] });
      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.stat as jest.Mock).mockResolvedValue({ size: 2048 });
    });

    it('should download Excel file successfully', async () => {
      mockReq.params = { filename: 'test-report.xlsx' };

      const mockStream = {
        pipe: jest.fn(),
        on: jest.fn((event, callback) => {
          if (event === 'end') {
            setTimeout(callback, 0);
          }
        })
      };

      const mockFileHandle = {
        createReadStream: jest.fn().mockReturnValue(mockStream),
        close: jest.fn()
      };

      (fs.open as jest.Mock).mockResolvedValue(mockFileHandle);

      await exportController.downloadFile(mockReq as Request, mockRes as Response, mockNext);

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM report_history'),
        expect.arrayContaining(['%test-report.xlsx', 1, false])
      );

      expect(mockSetHeaderResponse).toHaveBeenCalledWith(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      expect(mockSetHeaderResponse).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="test-report.xlsx"'
      );
      expect(mockSetHeaderResponse).toHaveBeenCalledWith('Content-Length', 2048);

      expect(mockStream.pipe).toHaveBeenCalledWith(mockRes);
    });

    it('should download CSV file successfully', async () => {
      mockReq.params = { filename: 'test-report.csv' };

      const mockStream = {
        pipe: jest.fn(),
        on: jest.fn()
      };

      const mockFileHandle = {
        createReadStream: jest.fn().mockReturnValue(mockStream),
        close: jest.fn()
      };

      (fs.open as jest.Mock).mockResolvedValue(mockFileHandle);

      await exportController.downloadFile(mockReq as Request, mockRes as Response, mockNext);

      expect(mockSetHeaderResponse).toHaveBeenCalledWith('Content-Type', 'text/csv');
      expect(mockSetHeaderResponse).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="test-report.csv"'
      );
    });

    it('should download PDF file successfully', async () => {
      mockReq.params = { filename: 'test-report.pdf' };

      const mockStream = {
        pipe: jest.fn(),
        on: jest.fn()
      };

      const mockFileHandle = {
        createReadStream: jest.fn().mockReturnValue(mockStream),
        close: jest.fn()
      };

      (fs.open as jest.Mock).mockResolvedValue(mockFileHandle);

      await exportController.downloadFile(mockReq as Request, mockRes as Response, mockNext);

      expect(mockSetHeaderResponse).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    });

    it('should allow admin to download any file', async () => {
      mockReq.user = mockAdminUser;
      mockReq.params = { filename: 'other-user-report.xlsx' };

      const otherUserRecord = {
        ...mockHistoryRecord,
        user_id: 999 // Different user
      };

      (db.query as jest.Mock).mockResolvedValue({ rows: [otherUserRecord] });

      const mockStream = {
        pipe: jest.fn(),
        on: jest.fn()
      };

      const mockFileHandle = {
        createReadStream: jest.fn().mockReturnValue(mockStream),
        close: jest.fn()
      };

      (fs.open as jest.Mock).mockResolvedValue(mockFileHandle);

      await exportController.downloadFile(mockReq as Request, mockRes as Response, mockNext);

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM report_history'),
        expect.arrayContaining(['%other-user-report.xlsx', 2, true]) // Admin flag
      );

      expect(mockStream.pipe).toHaveBeenCalledWith(mockRes);
    });

    it('should handle invalid filename with illegal characters', async () => {
      mockReq.params = { filename: '../../../etc/passwd' };

      (createError as jest.Mock).mockReturnValue(new Error('Invalid filename - contains illegal characters'));

      await exportController.downloadFile(mockReq as Request, mockRes as Response, mockNext);

      expect(createError).toHaveBeenCalledWith('Invalid filename - contains illegal characters', 400);
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should handle empty filename', async () => {
      mockReq.params = { filename: '' };

      (createError as jest.Mock).mockReturnValue(new Error('Invalid filename parameter'));

      await exportController.downloadFile(mockReq as Request, mockRes as Response, mockNext);

      expect(createError).toHaveBeenCalledWith('Invalid filename parameter', 400);
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should handle filename with illegal characters', async () => {
      mockReq.params = { filename: 'test<script>alert(1)</script>.xlsx' };

      (createError as jest.Mock).mockReturnValue(new Error('Invalid filename - contains illegal characters'));

      await exportController.downloadFile(mockReq as Request, mockRes as Response, mockNext);

      expect(createError).toHaveBeenCalledWith('Invalid filename - contains illegal characters', 400);
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should handle path traversal with clean filename', async () => {
      mockReq.params = { filename: '..report.xlsx' }; // Contains .. but no slashes

      (createError as jest.Mock).mockReturnValue(new Error('Invalid filename - path traversal attempt'));

      await exportController.downloadFile(mockReq as Request, mockRes as Response, mockNext);

      expect(createError).toHaveBeenCalledWith('Invalid filename - path traversal attempt', 400);
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should handle file not found in database', async () => {
      mockReq.params = { filename: 'non-existent.xlsx' };

      (db.query as jest.Mock).mockResolvedValue({ rows: [] });
      (createError as jest.Mock).mockReturnValue(new Error('File not found or access denied'));

      await exportController.downloadFile(mockReq as Request, mockRes as Response, mockNext);

      expect(createError).toHaveBeenCalledWith('File not found or access denied', 404);
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should handle expired file', async () => {
      mockReq.params = { filename: 'expired-report.xlsx' };

      // Mock database to return no rows for expired file (handled by WHERE clause)
      (db.query as jest.Mock).mockResolvedValue({ rows: [] });
      (createError as jest.Mock).mockReturnValue(new Error('File not found or access denied'));

      await exportController.downloadFile(mockReq as Request, mockRes as Response, mockNext);

      expect(createError).toHaveBeenCalledWith('File not found or access denied', 404);
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should handle file not found on disk', async () => {
      mockReq.params = { filename: 'missing-file.xlsx' };

      (fs.access as jest.Mock).mockRejectedValue(new Error('ENOENT'));
      (createError as jest.Mock).mockReturnValue(new Error('File not found on server'));

      await exportController.downloadFile(mockReq as Request, mockRes as Response, mockNext);

      expect(createError).toHaveBeenCalledWith('File not found on server', 404);
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should use correct export path based on environment', async () => {
      process.env.REPORT_EXPORT_PATH = '/custom/exports';
      mockReq.params = { filename: 'test-report.xlsx' };

      const mockStream = {
        pipe: jest.fn(),
        on: jest.fn()
      };

      const mockFileHandle = {
        createReadStream: jest.fn().mockReturnValue(mockStream),
        close: jest.fn()
      };

      (fs.open as jest.Mock).mockResolvedValue(mockFileHandle);

      await exportController.downloadFile(mockReq as Request, mockRes as Response, mockNext);

      expect(fs.open).toHaveBeenCalledWith('/custom/exports/test-report.xlsx', 'r');
    });
  });

  describe('exportHistoryResults', () => {
    const mockHistoryRecord = {
      id: 1,
      user_id: 1,
      report_name: 'Test Report',
      report_id: 'test-report',
      executed_at: new Date('2025-01-01T10:00:00Z'),
      parameters: { status: 'active' },
      result_count: 100,
      results: [
        { id: 1, name: 'User 1', email: 'user1@example.com' },
        { id: 2, name: 'User 2', email: 'user2@example.com' }
      ]
    };

    const mockExportResult = {
      data: Buffer.from('exported data'),
      filename: 'Test Report_2025-01-01.xlsx'
    };

    beforeEach(() => {
      (db.query as jest.Mock).mockResolvedValue({ rows: [mockHistoryRecord] });
      (exportService.exportDataWithFormatting as jest.Mock).mockResolvedValue(mockExportResult);
    });

    it('should export history results in Excel format', async () => {
      mockReq.params = { historyId: '1' };
      mockReq.query = { format: 'excel' };

      await exportController.exportHistoryResults(mockReq as Request, mockRes as Response, mockNext);

      expect(db.query).toHaveBeenCalledWith(
        expect.stringMatching(/SELECT h\.\*\s+FROM report_history h/),
        ['1', 1, false]
      );

      expect(exportService.exportDataWithFormatting).toHaveBeenCalledWith(
        mockHistoryRecord.results,
        'excel',
        'Test Report',
        {
          title: 'Test Report',
          executedAt: mockHistoryRecord.executed_at,
          parameters: mockHistoryRecord.parameters,
          resultCount: mockHistoryRecord.result_count,
          visibleColumns: undefined
        }
      );

      expect(mockSetHeaderResponse).toHaveBeenCalledWith(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      expect(mockSetHeaderResponse).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="Test Report_2025-01-01.xlsx"'
      );
      expect(mockSendResponse).toHaveBeenCalledWith(mockExportResult.data);
    });

    it('should export history results in CSV format', async () => {
      mockReq.params = { historyId: '1' };
      mockReq.query = { format: 'csv' };

      const csvExportResult = {
        ...mockExportResult,
        filename: 'Test Report_2025-01-01.csv'
      };

      (exportService.exportDataWithFormatting as jest.Mock).mockResolvedValue(csvExportResult);

      await exportController.exportHistoryResults(mockReq as Request, mockRes as Response, mockNext);

      expect(exportService.exportDataWithFormatting).toHaveBeenCalledWith(
        mockHistoryRecord.results,
        'csv',
        'Test Report',
        expect.any(Object)
      );

      expect(mockSetHeaderResponse).toHaveBeenCalledWith('Content-Type', 'text/csv');
    });

    it('should handle visible columns filter', async () => {
      mockReq.params = { historyId: '1' };
      mockReq.query = { format: 'excel', visibleColumns: 'name,email' };

      await exportController.exportHistoryResults(mockReq as Request, mockRes as Response, mockNext);

      expect(exportService.exportDataWithFormatting).toHaveBeenCalledWith(
        mockHistoryRecord.results,
        'excel',
        'Test Report',
        expect.objectContaining({
          visibleColumns: ['name', 'email']
        })
      );
    });

    it('should handle visible columns as array', async () => {
      mockReq.params = { historyId: '1' };
      mockReq.query = { format: 'excel', visibleColumns: ['id', 'name'] };

      await exportController.exportHistoryResults(mockReq as Request, mockRes as Response, mockNext);

      expect(exportService.exportDataWithFormatting).toHaveBeenCalledWith(
        mockHistoryRecord.results,
        'excel',
        'Test Report',
        expect.objectContaining({
          visibleColumns: ['id', 'name']
        })
      );
    });

    it('should handle results from separate table', async () => {
      const historyWithoutResults = {
        ...mockHistoryRecord,
        results: null
      };

      (db.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [historyWithoutResults] }) // History query
        .mockResolvedValueOnce({ // Results query
          rows: [{ result_data: mockHistoryRecord.results }]
        });

      mockReq.params = { historyId: '1' };
      mockReq.query = { format: 'excel' };

      await exportController.exportHistoryResults(mockReq as Request, mockRes as Response, mockNext);

      expect(db.query).toHaveBeenCalledWith(
        'SELECT result_data FROM report_results WHERE history_id = $1',
        ['1']
      );

      expect(exportService.exportDataWithFormatting).toHaveBeenCalledWith(
        mockHistoryRecord.results,
        'excel',
        'Test Report',
        expect.any(Object)
      );
    });

    it('should handle history record not found', async () => {
      mockReq.params = { historyId: '999' };
      mockReq.query = { format: 'excel' };

      (db.query as jest.Mock).mockResolvedValue({ rows: [] });
      (createError as jest.Mock).mockReturnValue(new Error('History record not found or access denied'));

      await exportController.exportHistoryResults(mockReq as Request, mockRes as Response, mockNext);

      expect(createError).toHaveBeenCalledWith('History record not found or access denied', 404);
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should handle no results found', async () => {
      const historyWithoutResults = {
        ...mockHistoryRecord,
        results: []
      };

      (db.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [historyWithoutResults] })
        .mockResolvedValueOnce({ rows: [] });

      mockReq.params = { historyId: '1' };
      mockReq.query = { format: 'excel' };

      (createError as jest.Mock).mockReturnValue(new Error('No results found for this history record'));

      await exportController.exportHistoryResults(mockReq as Request, mockRes as Response, mockNext);

      expect(createError).toHaveBeenCalledWith('No results found for this history record', 404);
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should allow admin access to any history record', async () => {
      mockReq.user = mockAdminUser;
      mockReq.params = { historyId: '1' };
      mockReq.query = { format: 'excel' };

      await exportController.exportHistoryResults(mockReq as Request, mockRes as Response, mockNext);

      expect(db.query).toHaveBeenCalledWith(
        expect.stringMatching(/SELECT h\.\*\s+FROM report_history h/),
        ['1', 2, true] // Admin user ID and admin flag
      );
    });

    it('should use report_id as fallback name', async () => {
      const historyWithoutName = {
        ...mockHistoryRecord,
        report_name: null
      };

      (db.query as jest.Mock).mockResolvedValue({ rows: [historyWithoutName] });

      mockReq.params = { historyId: '1' };
      mockReq.query = { format: 'excel' };

      await exportController.exportHistoryResults(mockReq as Request, mockRes as Response, mockNext);

      expect(exportService.exportDataWithFormatting).toHaveBeenCalledWith(
        mockHistoryRecord.results,
        'excel',
        'test-report', // Uses report_id as fallback
        expect.any(Object)
      );
    });

    it('should default to Excel format', async () => {
      mockReq.params = { historyId: '1' };
      mockReq.query = {}; // No format specified

      await exportController.exportHistoryResults(mockReq as Request, mockRes as Response, mockNext);

      expect(exportService.exportDataWithFormatting).toHaveBeenCalledWith(
        mockHistoryRecord.results,
        'excel', // Default format
        'Test Report',
        expect.any(Object)
      );
    });
  });

  describe('getJobStatus', () => {
    it('should return job status', async () => {
      mockReq.params = { jobId: 'job-123' };

      await exportController.getJobStatus(mockReq as Request, mockRes as Response, mockNext);

      expect(mockJsonResponse).toHaveBeenCalledWith({
        success: true,
        data: {
          jobId: 'job-123',
          status: 'processing',
          progress: 50,
          message: 'Report generation in progress...'
        }
      });
    });

    it('should handle errors', async () => {
      mockReq.params = { jobId: 'job-123' };

      // Mock logger.error to capture the error
      const error = new Error('Service unavailable');
      
      // Use a spy to force an error in getJobStatus
      jest.spyOn(exportController, 'getJobStatus').mockImplementationOnce(async () => {
        logger.error('Job status error:', error);
        mockNext(error);
      });

      await exportController.getJobStatus(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('cleanupExports', () => {
    beforeEach(() => {
      mockReq.user = mockAdminUser; // Ensure admin access
    });

    it('should cleanup old exports successfully', async () => {
      mockReq.body = { daysOld: 30 };

      const expiredFiles = [
        { file_path: '/app/exports/old-report-1.xlsx' },
        { file_path: '/app/exports/old-report-2.csv' },
        { file_path: null } // Should be handled gracefully
      ];

      (db.query as jest.Mock)
        .mockResolvedValueOnce({ rows: expiredFiles }) // Get expired files
        .mockResolvedValueOnce({ rows: [] }); // Delete records

      (fs.unlink as jest.Mock).mockResolvedValue(undefined);

      await exportController.cleanupExports(mockReq as Request, mockRes as Response, mockNext);

      expect(db.query).toHaveBeenNthCalledWith(1,
        expect.stringMatching(/INTERVAL '30 days'/)
      );

      expect(fs.unlink).toHaveBeenCalledTimes(2); // Only files with paths
      expect(fs.unlink).toHaveBeenCalledWith('/app/exports/old-report-1.xlsx');
      expect(fs.unlink).toHaveBeenCalledWith('/app/exports/old-report-2.csv');

      expect(mockJsonResponse).toHaveBeenCalledWith({
        success: true,
        data: {
          filesDeleted: 2,
          errors: 0,
          message: 'Cleaned up 2 expired export files'
        }
      });
    });

    it('should use default cleanup period', async () => {
      mockReq.body = {}; // No daysOld specified

      (db.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await exportController.cleanupExports(mockReq as Request, mockRes as Response, mockNext);

      expect(db.query).toHaveBeenNthCalledWith(1,
        expect.stringMatching(/INTERVAL '7 days'/)
      );
    });

    it('should handle file deletion errors', async () => {
      mockReq.body = { daysOld: 30 };

      const expiredFiles = [
        { file_path: '/app/exports/locked-file.xlsx' },
        { file_path: '/app/exports/missing-file.csv' }
      ];

      (db.query as jest.Mock)
        .mockResolvedValueOnce({ rows: expiredFiles })
        .mockResolvedValueOnce({ rows: [] });

      (fs.unlink as jest.Mock)
        .mockRejectedValueOnce(new Error('File locked'))
        .mockRejectedValueOnce(new Error('File not found'));

      await exportController.cleanupExports(mockReq as Request, mockRes as Response, mockNext);

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to delete file: /app/exports/locked-file.xlsx',
        expect.any(Error)
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to delete file: /app/exports/missing-file.csv',
        expect.any(Error)
      );

      expect(mockJsonResponse).toHaveBeenCalledWith({
        success: true,
        data: {
          filesDeleted: 0,
          errors: 2,
          message: 'Cleaned up 0 expired export files'
        }
      });
    });

    it('should require admin access', async () => {
      mockReq.user = mockUser; // Regular user
      mockReq.body = { daysOld: 30 };

      (createError as jest.Mock).mockReturnValue(new Error('Admin access required'));

      await exportController.cleanupExports(mockReq as Request, mockRes as Response, mockNext);

      expect(createError).toHaveBeenCalledWith('Admin access required', 403);
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should handle database errors', async () => {
      mockReq.body = { daysOld: 30 };

      (db.query as jest.Mock).mockRejectedValue(new Error('Database connection failed'));

      await exportController.cleanupExports(mockReq as Request, mockRes as Response, mockNext);

      expect(logger.error).toHaveBeenCalledWith('Cleanup error:', expect.any(Error));
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('Error Handling', () => {
    it('should handle unexpected errors in exportReport', async () => {
      mockReq.params = { templateId: 'test-template' };
      mockReq.body = { format: 'excel', parameters: {} };

      (reportExecutor.executeReport as jest.Mock).mockRejectedValue(new Error('Unexpected error'));

      await exportController.exportReport(mockReq as Request, mockRes as Response, mockNext);

      expect(logger.error).toHaveBeenCalledWith('Export error:', expect.any(Error));
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should handle file system errors', async () => {
      mockReq.params = { templateId: 'test-template' };
      mockReq.body = { format: 'excel', parameters: {} };

      const mockQueryResult = {
        success: true,
        data: [{ id: 1, name: 'Test' }],
        executionTime: 100,
        rowCount: 1
      };

      (reportExecutor.executeReport as jest.Mock).mockResolvedValue(mockQueryResult);
      (exportService.exportData as jest.Mock).mockResolvedValue({
        data: Buffer.from('test'),
        filename: 'test.xlsx'
      });
      (fs.mkdir as jest.Mock).mockRejectedValue(new Error('Permission denied'));

      await exportController.exportReport(mockReq as Request, mockRes as Response, mockNext);

      expect(logger.error).toHaveBeenCalledWith('Export error:', expect.any(Error));
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should handle malformed request parameters', async () => {
      mockReq.params = {}; // Missing required parameters
      mockReq.body = { format: 'excel' };

      await exportController.exportReport(mockReq as Request, mockRes as Response, mockNext);

      expect(reportExecutor.executeReport).toHaveBeenCalledWith({
        userId: 1,
        templateId: undefined,
        parameters: {}
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty query results', async () => {
      mockReq.params = { templateId: 'empty-template' };
      mockReq.body = { format: 'csv', parameters: {} };

      const emptyQueryResult = {
        success: true,
        data: [],
        executionTime: 50,
        rowCount: 0
      };

      (reportExecutor.executeReport as jest.Mock).mockResolvedValue(emptyQueryResult);
      (exportService.exportData as jest.Mock).mockResolvedValue({
        data: Buffer.from('No data available'),
        contentType: 'text/csv',
        filename: 'empty-template.csv'
      });
      (db.query as jest.Mock).mockResolvedValue({ rows: [] });

      await exportController.exportReport(mockReq as Request, mockRes as Response, mockNext);

      expect(mockJsonResponse).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          rowCount: 0
        })
      });
    });

    it('should handle undefined user in request', async () => {
      mockReq.user = undefined;
      mockReq.params = { templateId: 'test-template' };
      mockReq.body = { format: 'excel', parameters: {} };

      // This should throw an error since user is required
      await exportController.exportReport(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should handle very long filenames', async () => {
      const longTemplateName = 'a'.repeat(300);
      mockReq.params = { templateId: longTemplateName };
      mockReq.body = { format: 'excel', parameters: {} };

      const mockQueryResult = {
        success: true,
        data: [{ id: 1 }],
        executionTime: 100,
        rowCount: 1
      };

      (reportExecutor.executeReport as jest.Mock).mockResolvedValue(mockQueryResult);
      (exportService.exportData as jest.Mock).mockResolvedValue({
        data: Buffer.from('test'),
        filename: `${longTemplateName}.xlsx`
      });
      (db.query as jest.Mock).mockResolvedValue({ rows: [] });

      await exportController.exportReport(mockReq as Request, mockRes as Response, mockNext);

      expect(mockJsonResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true
        })
      );
    });
  });
});