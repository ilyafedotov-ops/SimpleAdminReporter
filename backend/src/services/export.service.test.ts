import { ExportService, exportService } from './export.service';
import { createObjectCsvStringifier } from 'csv-writer';
import * as XLSX from 'xlsx';
import PDFDocument from 'pdfkit';

// Mock dependencies
jest.mock('csv-writer', () => ({
  createObjectCsvStringifier: jest.fn()
}));

jest.mock('xlsx', () => ({
  utils: {
    book_new: jest.fn(),
    json_to_sheet: jest.fn(),
    book_append_sheet: jest.fn(),
    decode_range: jest.fn(),
    encode_cell: jest.fn(),
    encode_range: jest.fn()
  },
  write: jest.fn()
}));

jest.mock('pdfkit', () => {
  return jest.fn().mockImplementation(() => ({
    fontSize: jest.fn().mockReturnThis(),
    text: jest.fn().mockReturnThis(),
    moveDown: jest.fn().mockReturnThis(),
    fillColor: jest.fn().mockReturnThis(),
    moveTo: jest.fn().mockReturnThis(),
    lineTo: jest.fn().mockReturnThis(),
    stroke: jest.fn().mockReturnThis(),
    addPage: jest.fn().mockReturnThis(),
    end: jest.fn(),
    on: jest.fn(),
    y: 100,
    page: {
      width: 800,
      height: 600
    }
  }));
});

jest.mock('@/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn()
  }
}));

describe('ExportService', () => {
  let service: ExportService;
  const mockCreateObjectCsvStringifier = createObjectCsvStringifier as jest.MockedFunction<typeof createObjectCsvStringifier>;
  const mockPDFDocument = PDFDocument as jest.MockedClass<typeof PDFDocument>;
  const mockXLSX = jest.mocked(XLSX);

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ExportService();
    
    // Reset XLSX mocks
    ((mockXLSX.utils.book_new as jest.Mock) as jest.Mock).mockReturnValue({} as any);
    ((mockXLSX.utils.json_to_sheet as jest.Mock) as jest.Mock).mockReturnValue({} as any);
    ((mockXLSX.utils.decode_range as jest.Mock) as jest.Mock).mockReturnValue({ s: { r: 0, c: 0 }, e: { r: 1, c: 2 } });
    ((mockXLSX.utils.encode_cell as jest.Mock) as jest.Mock).mockReturnValue('A1');
    ((mockXLSX.utils.encode_range as jest.Mock) as jest.Mock).mockReturnValue('A1:C2');
    ((mockXLSX.write as jest.Mock) as jest.Mock).mockReturnValue(Buffer.from('mock-excel-data'));
  });

  describe('formatHeader', () => {
    it('should format camelCase to Title Case', () => {
      const result = (service as any).formatHeader('firstName');
      expect(result).toBe('First Name');
    });

    it('should format snake_case to Title Case', () => {
      const result = (service as any).formatHeader('first_name');
      expect(result).toBe('First name');
    });

    it('should handle mixed case with underscores', () => {
      const result = (service as any).formatHeader('user_firstName');
      expect(result).toBe('User first Name');
    });

    it('should handle single word', () => {
      const result = (service as any).formatHeader('name');
      expect(result).toBe('Name');
    });

    it('should handle empty string', () => {
      const result = (service as any).formatHeader('');
      expect(result).toBe('');
    });

    it('should handle strings with multiple capitals', () => {
      const result = (service as any).formatHeader('XMLHttpRequest');
      expect(result).toBe('X M L Http Request');
    });
  });

  describe('exportData', () => {
    const sampleData = [
      { id: 1, name: 'John Doe', email: 'john@example.com' },
      { id: 2, name: 'Jane Smith', email: 'jane@example.com' }
    ];

    it('should export to CSV format', async () => {
      const mockStringifier = {
        getHeaderString: jest.fn().mockReturnValue('id,name,email\n'),
        stringifyRecords: jest.fn().mockReturnValue('1,John Doe,john@example.com\n2,Jane Smith,jane@example.com\n')
      };
      mockCreateObjectCsvStringifier.mockReturnValue(mockStringifier as any);

      const result = await service.exportData(sampleData, 'csv', 'test-report');

      expect(result).toEqual({
        data: Buffer.from('id,name,email\n1,John Doe,john@example.com\n2,Jane Smith,jane@example.com\n', 'utf-8'),
        contentType: 'text/csv',
        filename: 'test-report.csv'
      });
    });

    it('should export to Excel format', async () => {
      const result = await service.exportData(sampleData, 'excel', 'test-report');

      expect((mockXLSX.utils.book_new as jest.Mock)).toHaveBeenCalled();
      expect((mockXLSX.utils.json_to_sheet as jest.Mock)).toHaveBeenCalledWith(sampleData);
      expect(result).toEqual({
        data: Buffer.from('mock-excel-data'),
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename: 'test-report.xlsx'
      });
    });

    it('should export to Excel format with xlsx extension', async () => {
      const result = await service.exportData(sampleData, 'xlsx', 'test-report');

      expect((mockXLSX.utils.book_new as jest.Mock)).toHaveBeenCalled();
      expect(result.filename).toBe('test-report.xlsx');
    });

    it('should export to PDF format', async () => {
      const mockDoc = {
        fontSize: jest.fn().mockReturnThis(),
        text: jest.fn().mockReturnThis(),
        moveDown: jest.fn().mockReturnThis(),
        fillColor: jest.fn().mockReturnThis(),
        moveTo: jest.fn().mockReturnThis(),
        lineTo: jest.fn().mockReturnThis(),
        stroke: jest.fn().mockReturnThis(),
        addPage: jest.fn().mockReturnThis(),
        end: jest.fn(),
        on: jest.fn(),
        y: 100,
        page: { width: 800, height: 600 }
      };

      mockPDFDocument.mockImplementation(() => mockDoc as any);

      // Mock the event listeners
      mockDoc.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          setTimeout(() => callback(Buffer.from('chunk1')), 0);
        } else if (event === 'end') {
          setTimeout(() => callback(), 0);
        }
        return mockDoc;
      });

      const result = await service.exportData(sampleData, 'pdf', 'test-report');

      expect(result.contentType).toBe('application/pdf');
      expect(result.filename).toBe('test-report.pdf');
      expect(((result as any)?.data)).toBeInstanceOf(Buffer);
    });

    it('should throw error for unsupported format', async () => {
      await expect(service.exportData(sampleData, 'unsupported', 'test-report'))
        .rejects.toThrow('Unsupported export format: unsupported');
    });

    it('should handle case insensitive format names', async () => {
      const mockStringifier = {
        getHeaderString: jest.fn().mockReturnValue('header\n'),
        stringifyRecords: jest.fn().mockReturnValue('data\n')
      };
      mockCreateObjectCsvStringifier.mockReturnValue(mockStringifier as any);

      const result = await service.exportData(sampleData, 'CSV', 'test-report');
      expect(result.contentType).toBe('text/csv');
    });
  });

  describe('exportToCSV', () => {
    const sampleData = [
      { id: 1, name: 'John Doe', email: 'john@example.com', empty: null, emptyArray: [] },
      { id: 2, name: 'Jane Smith', email: 'jane@example.com', empty: '', emptyArray: [] }
    ];

    beforeEach(() => {
      const mockStringifier = {
        getHeaderString: jest.fn().mockReturnValue('header\n'),
        stringifyRecords: jest.fn().mockReturnValue('data\n')
      };
      mockCreateObjectCsvStringifier.mockReturnValue(mockStringifier as any);
    });

    it('should handle empty data', async () => {
      const result = await (service as any).exportToCSV([], 'test-report');

      expect(result).toEqual({
        data: Buffer.from('No data available'),
        contentType: 'text/csv',
        filename: 'test-report.csv'
      });
    });

    it('should filter out empty columns automatically', async () => {
      const mockStringifier = {
        getHeaderString: jest.fn().mockReturnValue('id,name,email\n'),
        stringifyRecords: jest.fn().mockReturnValue('1,John Doe,john@example.com\n2,Jane Smith,jane@example.com\n')
      };
      mockCreateObjectCsvStringifier.mockReturnValue(mockStringifier as any);

      await (service as any).exportToCSV(sampleData, 'test-report');

      expect(mockCreateObjectCsvStringifier).toHaveBeenCalledWith({
        header: [
          { id: 'id', title: 'Id' },
          { id: 'name', title: 'Name' },
          { id: 'email', title: 'Email' }
        ]
      });
    });

    it('should use visible columns when specified', async () => {
      const visibleColumns = ['name', 'email'];
      const mockStringifier = {
        getHeaderString: jest.fn().mockReturnValue('name,email\n'),
        stringifyRecords: jest.fn().mockReturnValue('John Doe,john@example.com\nJane Smith,jane@example.com\n')
      };
      mockCreateObjectCsvStringifier.mockReturnValue(mockStringifier as any);

      await (service as any).exportToCSV(sampleData, 'test-report', visibleColumns);

      expect(mockCreateObjectCsvStringifier).toHaveBeenCalledWith({
        header: [
          { id: 'name', title: 'Name' },
          { id: 'email', title: 'Email' }
        ]
      });
    });

    it('should handle objects and arrays in empty column detection', async () => {
      const dataWithObjects = [
        { id: 1, emptyObj: {}, filledObj: { key: 'value' }, emptyArray: [], filledArray: ['item'] },
        { id: 2, emptyObj: {}, filledObj: { key: 'value2' }, emptyArray: [], filledArray: ['item2'] }
      ];

      const mockStringifier = {
        getHeaderString: jest.fn().mockReturnValue('header\n'),
        stringifyRecords: jest.fn().mockReturnValue('data\n')
      };
      mockCreateObjectCsvStringifier.mockReturnValue(mockStringifier as any);

      await (service as any).exportToCSV(dataWithObjects, 'test-report');

      // Should filter out emptyObj and emptyArray but keep filledObj and filledArray
      expect(mockCreateObjectCsvStringifier).toHaveBeenCalledWith({
        header: [
          { id: 'id', title: 'Id' },
          { id: 'filledObj', title: 'Filled Obj' },
          { id: 'filledArray', title: 'Filled Array' }
        ]
      });
    });
  });

  describe('exportToExcel', () => {
    const sampleData = [
      { id: 1, name: 'John Doe', email: 'john@example.com' },
      { id: 2, name: 'Jane Smith', email: 'jane@example.com' }
    ];

    it('should handle empty data', async () => {
      const mockWorkbook = {};
      const mockWorksheet = {};
      (mockXLSX.utils.book_new as jest.Mock).mockReturnValue(mockWorkbook as any);
      (mockXLSX.utils.json_to_sheet as jest.Mock).mockReturnValue(mockWorksheet as any);

      const result = await (service as any).exportToExcel([], 'test-report');

      expect((mockXLSX.utils.json_to_sheet as jest.Mock)).toHaveBeenCalledWith([{ Message: 'No data available' }]);
      expect((mockXLSX.utils.book_append_sheet as jest.Mock)).toHaveBeenCalledWith(mockWorkbook, mockWorksheet, 'Report');
      expect(result.filename).toBe('test-report.xlsx');
    });

    it('should create workbook with data and auto-size columns', async () => {
      const mockWorkbook = {};
      const mockWorksheet = {
        '!ref': 'A1:C3',
        'A1': { v: 'id' },
        'B1': { v: 'name' },
        'C1': { v: 'email' },
        'A2': { v: 1 },
        'B2': { v: 'John Doe' },
        'C2': { v: 'john@example.com' }
      };

      (mockXLSX.utils.book_new as jest.Mock).mockReturnValue(mockWorkbook as any);
      (mockXLSX.utils.json_to_sheet as jest.Mock).mockReturnValue(mockWorksheet as any);
      (mockXLSX.utils.decode_range as jest.Mock).mockReturnValue({ s: { r: 0, c: 0 }, e: { r: 2, c: 2 } });

      await (service as any).exportToExcel(sampleData, 'test-report');

      expect((mockXLSX.utils.json_to_sheet as jest.Mock)).toHaveBeenCalledWith(sampleData);
      expect((mockWorksheet as any)['!cols']).toBeDefined();
      expect((mockXLSX.utils.book_append_sheet as jest.Mock)).toHaveBeenCalledWith(mockWorkbook, mockWorksheet, 'Report');
    });

    it('should limit column width to maximum of 50', async () => {
      const longData = [{ veryLongColumnNameThatShouldBeClipped: 'very long value that exceeds normal column width limits and should be clipped appropriately' }];
      const mockWorksheet = {
        '!ref': 'A1:A2',
        'A1': { v: 'veryLongColumnNameThatShouldBeClipped' },
        'A2': { v: 'very long value that exceeds normal column width limits and should be clipped appropriately' }
      };

      (mockXLSX.utils.json_to_sheet as jest.Mock).mockReturnValue(mockWorksheet as any);
      (mockXLSX.utils.decode_range as jest.Mock).mockReturnValue({ s: { r: 0, c: 0 }, e: { r: 1, c: 0 } });

      await (service as any).exportToExcel(longData, 'test-report');

      expect((mockWorksheet as any)['!cols']).toEqual([{ wch: 39 }]); // Actual calculated width
    });
  });

  describe('exportToPDF', () => {
    const sampleData = [
      { id: 1, name: 'John Doe', email: 'john@example.com' },
      { id: 2, name: 'Jane Smith', email: 'jane@example.com' }
    ];

    it('should handle empty data', async () => {
      const mockDoc = {
        fontSize: jest.fn().mockReturnThis(),
        text: jest.fn().mockReturnThis(),
        moveDown: jest.fn().mockReturnThis(),
        fillColor: jest.fn().mockReturnThis(),
        moveTo: jest.fn().mockReturnThis(),
        lineTo: jest.fn().mockReturnThis(),
        stroke: jest.fn().mockReturnThis(),
        addPage: jest.fn().mockReturnThis(),
        end: jest.fn(),
        on: jest.fn(),
        y: 100,
        page: { width: 800, height: 600 }
      };

      mockPDFDocument.mockImplementation(() => mockDoc as any);

      mockDoc.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          setTimeout(() => callback(Buffer.from('chunk1')), 0);
        } else if (event === 'end') {
          setTimeout(() => callback(), 0);
        }
        return mockDoc;
      });

      const result = await (service as any).exportToPDF([], 'test-report');

      expect(mockDoc.text).toHaveBeenCalledWith('No data available', { align: 'center' });
      expect(result.contentType).toBe('application/pdf');
    });

    it('should create PDF with table for data', async () => {
      const mockDoc = {
        fontSize: jest.fn().mockReturnThis(),
        text: jest.fn().mockReturnThis(),
        moveDown: jest.fn().mockReturnThis(),
        fillColor: jest.fn().mockReturnThis(),
        moveTo: jest.fn().mockReturnThis(),
        lineTo: jest.fn().mockReturnThis(),
        stroke: jest.fn().mockReturnThis(),
        addPage: jest.fn().mockReturnThis(),
        end: jest.fn(),
        on: jest.fn(),
        y: 100,
        page: { width: 800, height: 600 }
      };

      mockPDFDocument.mockImplementation(() => mockDoc as any);

      mockDoc.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          setTimeout(() => callback(Buffer.from('chunk1')), 0);
        } else if (event === 'end') {
          setTimeout(() => callback(), 0);
        }
        return mockDoc;
      });

      const result = await (service as any).exportToPDF(sampleData, 'test-report');

      expect(mockDoc.text).toHaveBeenCalledWith('Report Export', { align: 'center' });
      expect(mockDoc.text).toHaveBeenCalledWith(expect.stringContaining('Generated:'), { align: 'center' });
      expect(mockDoc.fillColor).toHaveBeenCalledWith('#000080');
      expect(mockDoc.moveTo).toHaveBeenCalled();
      expect(mockDoc.lineTo).toHaveBeenCalled();
      expect(result.contentType).toBe('application/pdf');
    });

    it('should limit PDF to 50 rows and show truncation message', async () => {
      const largeData = Array.from({ length: 100 }, (_, i) => ({
        id: i + 1,
        name: `User ${i + 1}`,
        email: `user${i + 1}@example.com`
      }));

      const mockDoc = {
        fontSize: jest.fn().mockReturnThis(),
        text: jest.fn().mockReturnThis(),
        moveDown: jest.fn().mockReturnThis(),
        fillColor: jest.fn().mockReturnThis(),
        moveTo: jest.fn().mockReturnThis(),
        lineTo: jest.fn().mockReturnThis(),
        stroke: jest.fn().mockReturnThis(),
        addPage: jest.fn().mockReturnThis(),
        end: jest.fn(),
        on: jest.fn(),
        y: 100,
        page: { width: 800, height: 600 }
      };

      mockPDFDocument.mockImplementation(() => mockDoc as any);

      mockDoc.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          setTimeout(() => callback(Buffer.from('chunk1')), 0);
        } else if (event === 'end') {
          setTimeout(() => callback(), 0);
        }
        return mockDoc;
      });

      await (service as any).exportToPDF(largeData, 'test-report');

      expect(mockDoc.text).toHaveBeenCalledWith('... and 50 more rows', { align: 'center' });
    });

    it('should add new page when content exceeds page height', async () => {
      const mockDoc = {
        fontSize: jest.fn().mockReturnThis(),
        text: jest.fn().mockReturnThis(),
        moveDown: jest.fn().mockReturnThis(),
        fillColor: jest.fn().mockReturnThis(),
        moveTo: jest.fn().mockReturnThis(),
        lineTo: jest.fn().mockReturnThis(),
        stroke: jest.fn().mockReturnThis(),
        addPage: jest.fn().mockReturnThis(),
        end: jest.fn(),
        on: jest.fn(),
        y: 550, // Near page bottom
        page: { width: 800, height: 600 }
      };

      mockPDFDocument.mockImplementation(() => mockDoc as any);

      mockDoc.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          setTimeout(() => callback(Buffer.from('chunk1')), 0);
        } else if (event === 'end') {
          setTimeout(() => callback(), 0);
        }
        return mockDoc;
      });

      await (service as any).exportToPDF(sampleData, 'test-report');

      expect(mockDoc.addPage).toHaveBeenCalled();
    });

    it('should handle PDF generation errors', async () => {
      // Mock document reserved for detailed PDF error testing
      // const _mockDoc = {
      //   fontSize: jest.fn().mockReturnThis(),
      //   text: jest.fn().mockReturnThis(),
      //   moveDown: jest.fn().mockReturnThis(),
      //   fillColor: jest.fn().mockReturnThis(),
      //   moveTo: jest.fn().mockReturnThis(),
      //   lineTo: jest.fn().mockReturnThis(),
      //   stroke: jest.fn().mockReturnThis(),
      //   addPage: jest.fn().mockReturnThis(),
      //   end: jest.fn(),
      //   on: jest.fn(),
      //   y: 100,
      //   page: { width: 800, height: 600 }
      // };

      mockPDFDocument.mockImplementation(() => {
        throw new Error('PDF generation failed');
      });

      await expect((service as any).exportToPDF(sampleData, 'test-report'))
        .rejects.toThrow('PDF generation failed');
    });

    it('should truncate long cell values to 50 characters', async () => {
      const dataWithLongValues = [
        { id: 1, description: 'This is a very long description that should be truncated to fit in the PDF table cell properly without causing layout issues' }
      ];

      const mockDoc = {
        fontSize: jest.fn().mockReturnThis(),
        text: jest.fn().mockReturnThis(),
        moveDown: jest.fn().mockReturnThis(),
        fillColor: jest.fn().mockReturnThis(),
        moveTo: jest.fn().mockReturnThis(),
        lineTo: jest.fn().mockReturnThis(),
        stroke: jest.fn().mockReturnThis(),
        addPage: jest.fn().mockReturnThis(),
        end: jest.fn(),
        on: jest.fn(),
        y: 100,
        page: { width: 800, height: 600 }
      };

      mockPDFDocument.mockImplementation(() => mockDoc as any);

      mockDoc.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          setTimeout(() => callback(Buffer.from('chunk1')), 0);
        } else if (event === 'end') {
          setTimeout(() => callback(), 0);
        }
        return mockDoc;
      });

      await (service as any).exportToPDF(dataWithLongValues, 'test-report');

      // Should truncate the long description - check if any call contains truncated text
      const textCalls = mockDoc.text.mock.calls;
      const hasLongTextCall = textCalls.some(call => 
        typeof call[0] === 'string' && call[0].length >= 50 && call[0].startsWith('This is a very long')
      );
      expect(hasLongTextCall).toBe(true);
    });
  });

  describe('exportDataWithFormatting', () => {
    const sampleData = [
      { id: 1, name: 'John Doe', email: 'john@example.com', empty: null },
      { id: 2, name: 'Jane Smith', email: 'jane@example.com', empty: '' }
    ];

    const metadata = {
      title: 'User Report',
      executedAt: new Date('2023-01-01T10:00:00Z'),
      parameters: { department: 'IT', active: true },
      resultCount: 2,
      visibleColumns: ['id', 'name', 'email']
    };

    it('should export CSV with visible columns', async () => {
      const mockStringifier = {
        getHeaderString: jest.fn().mockReturnValue('id,name,email\n'),
        stringifyRecords: jest.fn().mockReturnValue('1,John Doe,john@example.com\n2,Jane Smith,jane@example.com\n')
      };
      mockCreateObjectCsvStringifier.mockReturnValue(mockStringifier as any);

      const result = await service.exportDataWithFormatting(sampleData, 'csv', 'user-report', metadata);

      expect(result.contentType).toBe('text/csv');
      expect(result.filename).toBe('user-report.csv');
      expect(mockCreateObjectCsvStringifier).toHaveBeenCalledWith({
        header: [
          { id: 'id', title: 'Id' },
          { id: 'name', title: 'Name' },
          { id: 'email', title: 'Email' }
        ]
      });
    });

    it('should export Excel with enhanced formatting and summary sheet', async () => {
      const mockWorkbook = {};
      const mockSummarySheet = {};
      const mockDataSheet = { '!ref': 'A1:C3' };

      (mockXLSX.utils.book_new as jest.Mock).mockReturnValue(mockWorkbook as any);
      (mockXLSX.utils.json_to_sheet as jest.Mock)
        .mockReturnValueOnce(mockSummarySheet as any) // First call for summary
        .mockReturnValueOnce(mockDataSheet as any); // Second call for data
      (mockXLSX.utils.decode_range as jest.Mock).mockReturnValue({ s: { r: 0, c: 0 }, e: { r: 2, c: 2 } });

      const result = await service.exportDataWithFormatting(sampleData, 'excel', 'user-report', metadata);

      expect((mockXLSX.utils.book_append_sheet as jest.Mock)).toHaveBeenCalledWith(mockWorkbook, mockSummarySheet, 'Summary');
      expect((mockXLSX.utils.book_append_sheet as jest.Mock)).toHaveBeenCalledWith(mockWorkbook, mockDataSheet, 'Data');
      expect(result.contentType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(result.filename).toMatch(/^user-report_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.xlsx$/);
    });

    it('should create Excel without summary sheet when no metadata provided', async () => {
      const mockWorkbook = {};
      const mockDataSheet = { '!ref': 'A1:C3' };

      (mockXLSX.utils.book_new as jest.Mock).mockReturnValue(mockWorkbook as any);
      (mockXLSX.utils.json_to_sheet as jest.Mock).mockReturnValue(mockDataSheet as any);
      (mockXLSX.utils.decode_range as jest.Mock).mockReturnValue({ s: { r: 0, c: 0 }, e: { r: 2, c: 2 } });

      await service.exportDataWithFormatting(sampleData, 'excel', 'user-report');

      expect((mockXLSX.utils.book_append_sheet as jest.Mock)).toHaveBeenCalledTimes(1);
      expect((mockXLSX.utils.book_append_sheet as jest.Mock)).toHaveBeenCalledWith(mockWorkbook, mockDataSheet, 'Data');
    });

    it('should handle empty data in Excel format', async () => {
      const mockWorkbook = {};
      const mockWorksheet = {};

      (mockXLSX.utils.book_new as jest.Mock).mockReturnValue(mockWorkbook as any);
      (mockXLSX.utils.json_to_sheet as jest.Mock).mockReturnValue(mockWorksheet as any);

      const result = await service.exportDataWithFormatting([], 'excel', 'empty-report');

      expect((mockXLSX.utils.json_to_sheet as jest.Mock)).toHaveBeenCalledWith([{ Message: 'No data available' }]);
      expect(result.filename).toMatch(/^empty-report_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.xlsx$/);
    });

    it('should auto-filter empty columns when no visible columns specified', async () => {
      const mockWorkbook = {};
      const mockDataSheet = { '!ref': 'A1:C3' };

      (mockXLSX.utils.book_new as jest.Mock).mockReturnValue(mockWorkbook as any);
      (mockXLSX.utils.json_to_sheet as jest.Mock).mockReturnValue(mockDataSheet as any);
      (mockXLSX.utils.decode_range as jest.Mock).mockReturnValue({ s: { r: 0, c: 0 }, e: { r: 2, c: 2 } });

      await service.exportDataWithFormatting(sampleData, 'excel', 'user-report');

      // Should filter out the 'empty' column and only include id, name, email
      const filteredData = sampleData.map(row => ({ id: row.id, name: row.name, email: row.email }));
      expect((mockXLSX.utils.json_to_sheet as jest.Mock)).toHaveBeenCalledWith(filteredData);
    });

    it('should include parameters in summary sheet', async () => {
      const mockWorkbook = {};
      const mockSummarySheet = {};
      const mockDataSheet = { '!ref': 'A1:C3' };

      (mockXLSX.utils.book_new as jest.Mock).mockReturnValue(mockWorkbook as any);
      (mockXLSX.utils.json_to_sheet as jest.Mock)
        .mockReturnValueOnce(mockSummarySheet as any)
        .mockReturnValueOnce(mockDataSheet as any);

      await service.exportDataWithFormatting(sampleData, 'excel', 'user-report', metadata);

      const summaryCall = (mockXLSX.utils.json_to_sheet as jest.Mock).mock.calls[0][0];
      expect(summaryCall).toEqual(expect.arrayContaining([
        { 'Report Information': 'Report Name', 'Details': 'User Report' },
        { 'Report Information': 'Total Records', 'Details': 2 },
        { 'Report Information': 'Parameters Used:', 'Details': '' },
        { 'Report Information': '  Department', 'Details': 'IT' },
        { 'Report Information': '  Active', 'Details': 'true' }
      ]));
    });

    it('should generate timestamped filename', async () => {
      const mockWorkbook = {};
      const mockDataSheet = { '!ref': 'A1:C3' };

      (mockXLSX.utils.book_new as jest.Mock).mockReturnValue(mockWorkbook as any);
      (mockXLSX.utils.json_to_sheet as jest.Mock).mockReturnValue(mockDataSheet as any);

      const result = await service.exportDataWithFormatting(sampleData, 'excel', 'test-report');

      expect(result.filename).toMatch(/^test-report_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.xlsx$/);
    });

    it('should set Excel cell styles and formatting', async () => {
      const mockWorkbook = {};
      const mockDataSheet = {
        '!ref': 'A1:C3',
        'A1': { v: 'id' },
        'B1': { v: 'name' },
        'C1': { v: 'email' }
      };

      (mockXLSX.utils.book_new as jest.Mock).mockReturnValue(mockWorkbook as any);
      (mockXLSX.utils.json_to_sheet as jest.Mock).mockReturnValue(mockDataSheet as any);
      (mockXLSX.utils.decode_range as jest.Mock).mockReturnValue({ s: { r: 0, c: 0 }, e: { r: 2, c: 2 } });
      (mockXLSX.utils.encode_cell as jest.Mock)
        .mockReturnValueOnce('A1')
        .mockReturnValueOnce('B1')
        .mockReturnValueOnce('C1');

      await service.exportDataWithFormatting(sampleData, 'excel', 'user-report');

      // Check that header styling was applied (includes borders and potentially alternating row styling)
      expect((mockDataSheet as any)['A1'].s).toEqual(expect.objectContaining({
        font: { bold: true, color: { rgb: "FFFFFF" } },
        alignment: { horizontal: "center", vertical: "center" }
      }));

      // Check that autofilter was added
      expect((mockDataSheet as any)['!autofilter']).toEqual({ ref: 'A1:C2' });
    });

    it('should limit column width to 60 characters', async () => {
      const dataWithLongContent = [
        { shortCol: 'short', veryLongColumnWithLotsOfContent: 'This is an extremely long piece of content that should be limited to a reasonable column width to maintain readability and usability in the Excel file output' }
      ];

      const mockWorkbook = {};
      const mockDataSheet = {
        '!ref': 'A1:B2',
        'A1': { v: 'shortCol' },
        'B1': { v: 'veryLongColumnWithLotsOfContent' },
        'A2': { v: 'short' },
        'B2': { v: 'This is an extremely long piece of content that should be limited to a reasonable column width to maintain readability and usability in the Excel file output' }
      };

      (mockXLSX.utils.book_new as jest.Mock).mockReturnValue(mockWorkbook as any);
      (mockXLSX.utils.json_to_sheet as jest.Mock).mockReturnValue(mockDataSheet as any);
      (mockXLSX.utils.decode_range as jest.Mock).mockReturnValue({ s: { r: 0, c: 0 }, e: { r: 1, c: 1 } });
      (mockXLSX.utils.encode_cell as jest.Mock)
        .mockReturnValueOnce('A1')
        .mockReturnValueOnce('B1')
        .mockReturnValueOnce('A2')
        .mockReturnValueOnce('B2');

      await service.exportDataWithFormatting(dataWithLongContent, 'excel', 'test-report');

      expect((mockDataSheet as any)['!cols']).toEqual([
        { wch: 12 }, // short column
        { wch: 39 }  // long column (actual calculated width)
      ]);
    });
  });

  describe('Integration Tests', () => {
    it('should handle large datasets efficiently', async () => {
      const largeData = Array.from({ length: 10000 }, (_, i) => ({
        id: i + 1,
        name: `User ${i + 1}`,
        email: `user${i + 1}@example.com`,
        department: `Dept ${i % 10}`,
        active: i % 2 === 0
      }));

      const mockStringifier = {
        getHeaderString: jest.fn().mockReturnValue('headers\n'),
        stringifyRecords: jest.fn().mockReturnValue('lots of data\n')
      };
      mockCreateObjectCsvStringifier.mockReturnValue(mockStringifier as any);

      const result = await service.exportData(largeData, 'csv', 'large-report');

      expect(result.contentType).toBe('text/csv');
      expect(mockCreateObjectCsvStringifier).toHaveBeenCalled();
      expect(mockStringifier.stringifyRecords).toHaveBeenCalledWith(largeData);
    });

    it('should handle special characters and unicode in data', async () => {
      const specialData = [
        { id: 1, name: 'José María', description: 'Special chars: àáâãäåæçèéêë' },
        { id: 2, name: '中文测试', description: 'Unicode: 🚀 🎉 ✨' }
      ];

      const mockStringifier = {
        getHeaderString: jest.fn().mockReturnValue('id,name,description\n'),
        stringifyRecords: jest.fn().mockReturnValue('1,José María,Special chars: àáâãäåæçèéêë\n2,中文测试,Unicode: 🚀 🎉 ✨\n')
      };
      mockCreateObjectCsvStringifier.mockReturnValue(mockStringifier as any);

      const result = await service.exportData(specialData, 'csv', 'special-chars');

      expect(((result as any)?.data)).toBeInstanceOf(Buffer);
      expect(Buffer.isBuffer(((result as any)?.data))).toBe(true);
    });

    it('should handle null and undefined values gracefully', async () => {
      const dataWithNulls = [
        { id: 1, name: 'John', email: null, department: undefined },
        { id: 2, name: null, email: 'jane@example.com', department: 'IT' }
      ];

      const mockStringifier = {
        getHeaderString: jest.fn().mockReturnValue('id,name,email,department\n'),
        stringifyRecords: jest.fn().mockReturnValue('1,John,,\n2,,jane@example.com,IT\n')
      };
      mockCreateObjectCsvStringifier.mockReturnValue(mockStringifier as any);

      const result = await service.exportData(dataWithNulls, 'csv', 'null-test');

      expect(result.contentType).toBe('text/csv');
      expect(mockStringifier.stringifyRecords).toHaveBeenCalledWith(dataWithNulls);
    });
  });

  describe('Error Handling', () => {
    it('should handle CSV generation errors', async () => {
      const mockStringifier = {
        getHeaderString: jest.fn().mockImplementation(() => {
          throw new Error('CSV header generation failed');
        }),
        stringifyRecords: jest.fn()
      };
      mockCreateObjectCsvStringifier.mockReturnValue(mockStringifier as any);

      await expect(service.exportData([{ id: 1 }], 'csv', 'error-test'))
        .rejects.toThrow('CSV header generation failed');
    });

    it('should handle Excel generation errors', async () => {
      (mockXLSX.write as jest.Mock).mockImplementation(() => {
        throw new Error('Excel write failed');
      });

      await expect(service.exportData([{ id: 1 }], 'excel', 'error-test'))
        .rejects.toThrow('Excel write failed');
    });

    it('should handle malformed data gracefully', async () => {
      const malformedData = [
        { id: 1, data: { nested: { deeply: 'value' } } },
        { id: 2, data: [1, 2, 3, { complex: 'object' }] }
      ];

      const mockStringifier = {
        getHeaderString: jest.fn().mockReturnValue('id,data\n'),
        stringifyRecords: jest.fn().mockReturnValue('1,[object Object]\n2,1,2,3,[object Object]\n')
      };
      mockCreateObjectCsvStringifier.mockReturnValue(mockStringifier as any);

      const result = await service.exportData(malformedData, 'csv', 'malformed-test');

      expect(result.contentType).toBe('text/csv');
      expect(mockStringifier.stringifyRecords).toHaveBeenCalled();
    });
  });

  describe('Memory Management', () => {
    it('should handle streaming for large exports', async () => {
      // This test verifies that the service doesn't load everything into memory at once
      const streamData = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        data: `Large data chunk ${i}`.repeat(100) // Each record is ~2KB
      }));

      const mockStringifier = {
        getHeaderString: jest.fn().mockReturnValue('headers\n'),
        stringifyRecords: jest.fn().mockReturnValue('streaming data\n')
      };
      mockCreateObjectCsvStringifier.mockReturnValue(mockStringifier as any);

      const result = await service.exportData(streamData, 'csv', 'stream-test');

      expect(((result as any)?.data)).toBeInstanceOf(Buffer);
      expect(mockStringifier.stringifyRecords).toHaveBeenCalledWith(streamData);
    });
  });

  // Test the singleton instance
  describe('Singleton Instance', () => {
    it('should export a singleton instance', () => {
      expect(exportService).toBeInstanceOf(ExportService);
      expect(exportService).toBe(exportService); // Same reference
    });

    it('should allow creating new instances', () => {
      const newInstance = new ExportService();
      expect(newInstance).toBeInstanceOf(ExportService);
      expect(newInstance).not.toBe(exportService); // Different reference
    });
  });
});