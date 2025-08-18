import { createObjectCsvStringifier } from 'csv-writer';
import * as XLSX from 'xlsx';
import PDFDocument from 'pdfkit';
// import { logger } from '@/utils/logger';

export interface ExportResult {
  data: Buffer;
  contentType: string;
  filename: string;
}

export class ExportService {
  async exportData(data: any[], format: string, baseFilename: string): Promise<ExportResult> {
    switch (format.toLowerCase()) {
      case 'csv':
        return this.exportToCSV(data, baseFilename);
      case 'excel':
      case 'xlsx':
        return this.exportToExcel(data, baseFilename);
      case 'pdf':
        return this.exportToPDF(data, baseFilename);
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  private async exportToCSV(data: any[], baseFilename: string, visibleColumns?: string[]): Promise<ExportResult> {
    if (data.length === 0) {
      return {
        data: Buffer.from('No data available'),
        contentType: 'text/csv',
        filename: `${baseFilename}.csv`
      };
    }

    // Filter data to only include visible columns if specified
    let filteredData = data;
    let columnsToExport = Object.keys(data[0]);
    
    if (visibleColumns && visibleColumns.length > 0) {
      columnsToExport = visibleColumns;
      filteredData = data.map(row => {
        const filteredRow: any = {};
        visibleColumns.forEach(col => {
          if (row.hasOwnProperty(col)) {
            filteredRow[col] = row[col];
          }
        });
        return filteredRow;
      });
    } else {
      // If no visible columns specified, automatically filter out empty columns
      const allColumns = Object.keys(data[0]);
      
      // Filter out columns that have no data (all null, undefined, or empty string)
      const columnsWithData = allColumns.filter(col => {
        return data.some(row => {
          const value = row[col];
          return value !== null && 
                 value !== undefined && 
                 value !== '' &&
                 !(Array.isArray(value) && value.length === 0) &&
                 !(typeof value === 'object' && Object.keys(value).length === 0);
        });
      });
      
      columnsToExport = columnsWithData;
      
      // Filter data to only include columns with data
      if (columnsWithData.length < allColumns.length) {
        filteredData = data.map(row => {
          const filteredRow: any = {};
          columnsWithData.forEach(col => {
            filteredRow[col] = row[col];
          });
          return filteredRow;
        });
      }
    }

    // Get headers from columns to export
    const headers = columnsToExport.map(key => ({
      id: key,
      title: this.formatHeader(key)
    }));

    const csvStringifier = createObjectCsvStringifier({
      header: headers
    });

    const csvContent = csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(filteredData);

    return {
      data: Buffer.from(csvContent, 'utf-8'),
      contentType: 'text/csv',
      filename: `${baseFilename}.csv`
    };
  }

  private async exportToExcel(data: any[], baseFilename: string): Promise<ExportResult> {
    const workbook = XLSX.utils.book_new();
    
    if (data.length === 0) {
      // Create empty sheet with message
      const worksheet = XLSX.utils.json_to_sheet([{ Message: 'No data available' }]);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');
    } else {
      // Convert data to worksheet
      const worksheet = XLSX.utils.json_to_sheet(data);
      
      // Auto-size columns
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
      const cols: any[] = [];
      
      for (let C = range.s.c; C <= range.e.c; ++C) {
        let max = 0;
        for (let R = range.s.r; R <= range.e.r; ++R) {
          const cell = worksheet[XLSX.utils.encode_cell({ r: R, c: C })];
          if (cell && cell.v) {
            const len = cell.v.toString().length;
            if (len > max) max = len;
          }
        }
        cols.push({ wch: Math.min(max + 2, 50) });
      }
      
      worksheet['!cols'] = cols;
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');
    }

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    return {
      data: buffer,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: `${baseFilename}.xlsx`
    };
  }

  private async exportToPDF(data: any[], baseFilename: string): Promise<ExportResult> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          layout: 'landscape',
          margins: {
            top: 50,
            bottom: 50,
            left: 50,
            right: 50
          }
        });

        const chunks: Buffer[] = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => {
          const buffer = Buffer.concat(chunks);
          resolve({
            data: buffer,
            contentType: 'application/pdf',
            filename: `${baseFilename}.pdf`
          });
        });

        // Add title
        doc.fontSize(16).text('Report Export', { align: 'center' });
        doc.moveDown();
        doc.fontSize(10).text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
        doc.moveDown(2);

        if (data.length === 0) {
          doc.fontSize(12).text('No data available', { align: 'center' });
        } else {
          // Create table
          const headers = Object.keys(data[0]);
          const tableTop = doc.y;
          const tableLeft = 50;
          const columnWidth = (doc.page.width - 100) / headers.length;
          
          // Draw headers
          doc.fontSize(10).fillColor('#000080');
          headers.forEach((header, i) => {
            doc.text(
              this.formatHeader(header),
              tableLeft + (i * columnWidth),
              tableTop,
              { width: columnWidth - 5, align: 'left' }
            );
          });

          // Draw header line
          doc.moveTo(tableLeft, tableTop + 20)
             .lineTo(doc.page.width - 50, tableTop + 20)
             .stroke();

          // Draw data rows
          doc.fillColor('black').fontSize(8);
          let y = tableTop + 25;
          
          data.slice(0, 50).forEach((row, _rowIndex) => { // Limit to 50 rows for PDF
            if (y > doc.page.height - 100) {
              doc.addPage();
              y = 50;
            }

            headers.forEach((header, i) => {
              const value = row[header] || '';
              doc.text(
                String(value).substring(0, 50),
                tableLeft + (i * columnWidth),
                y,
                { width: columnWidth - 5, align: 'left' }
              );
            });

            y += 15;
          });

          if (data.length > 50) {
            doc.moveDown(2);
            doc.fontSize(10).text(`... and ${data.length - 50} more rows`, { align: 'center' });
          }
        }

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  private formatHeader(key: string): string {
    // Convert camelCase or snake_case to Title Case
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .replace(/^\w/, c => c.toUpperCase())
      .trim();
  }

  async exportDataWithFormatting(
    data: any[], 
    format: 'excel' | 'csv', 
    reportName: string,
    metadata?: {
      title?: string;
      executedAt?: Date;
      parameters?: any;
      resultCount?: number;
      visibleColumns?: string[];
    }
  ): Promise<ExportResult> {
    if (format === 'csv') {
      return this.exportToCSV(data, reportName, metadata?.visibleColumns);
    }

    // Filter data to only include visible columns if specified
    let filteredData = data;
    if (metadata?.visibleColumns && metadata.visibleColumns.length > 0) {
      filteredData = data.map(row => {
        const filteredRow: any = {};
        metadata.visibleColumns!.forEach(col => {
          if (row.hasOwnProperty(col)) {
            filteredRow[col] = row[col];
          }
        });
        return filteredRow;
      });
    } else {
      // If no visible columns specified, automatically filter out empty columns
      if (data.length > 0) {
        // Get all column keys
        const allColumns = Object.keys(data[0]);
        
        // Filter out columns that have no data (all null, undefined, or empty string)
        const columnsWithData = allColumns.filter(col => {
          return data.some(row => {
            const value = row[col];
            return value !== null && 
                   value !== undefined && 
                   value !== '' &&
                   !(Array.isArray(value) && value.length === 0) &&
                   !(typeof value === 'object' && Object.keys(value).length === 0);
          });
        });
        
        // Filter data to only include columns with data
        if (columnsWithData.length < allColumns.length) {
          filteredData = data.map(row => {
            const filteredRow: any = {};
            columnsWithData.forEach(col => {
              filteredRow[col] = row[col];
            });
            return filteredRow;
          });
        }
      }
    }

    // Enhanced Excel export with formatting
    const workbook = XLSX.utils.book_new();
    
    // Create main data sheet
    if (filteredData.length === 0) {
      const worksheet = XLSX.utils.json_to_sheet([{ Message: 'No data available' }]);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');
    } else {
      // Create summary sheet if metadata provided
      if (metadata) {
        const summaryData = [
          { 'Report Information': 'Report Name', 'Details': metadata.title || reportName },
          { 'Report Information': 'Generated On', 'Details': new Date().toLocaleString() },
          { 'Report Information': 'Executed At', 'Details': metadata.executedAt ? new Date(metadata.executedAt).toLocaleString() : 'N/A' },
          { 'Report Information': 'Total Records', 'Details': metadata.resultCount || filteredData.length },
          { 'Report Information': '', 'Details': '' },
          { 'Report Information': 'Parameters Used:', 'Details': '' }
        ];

        // Add parameters if provided
        if (metadata.parameters && Object.keys(metadata.parameters).length > 0) {
          Object.entries(metadata.parameters).forEach(([key, value]) => {
            summaryData.push({
              'Report Information': `  ${this.formatHeader(key)}`,
              'Details': String(value)
            });
          });
        }

        const summarySheet = XLSX.utils.json_to_sheet(summaryData);
        
        // Style the summary sheet
        const summaryRange = XLSX.utils.decode_range(summarySheet['!ref'] || 'A1');
        summarySheet['!cols'] = [{ wch: 25 }, { wch: 50 }];
        
        // Add cell formatting for headers
        for (let R = summaryRange.s.r; R <= summaryRange.e.r; R++) {
          const cellAddress = XLSX.utils.encode_cell({ r: R, c: 0 });
          if (summarySheet[cellAddress]) {
            summarySheet[cellAddress].s = {
              font: { bold: true },
              fill: { fgColor: { rgb: "E8E8E8" } }
            };
          }
        }

        XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');
      }

      // Create data sheet with enhanced formatting
      const worksheet = XLSX.utils.json_to_sheet(filteredData);
      
      // Get range
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
      
      // Auto-size columns with better logic
      const cols: any[] = [];
      const headers = filteredData.length > 0 ? Object.keys(filteredData[0]) : [];
      
      for (let C = range.s.c; C <= range.e.c; ++C) {
        let maxLength = 10; // Minimum column width
        
        // Check header length
        if (headers[C]) {
          maxLength = Math.max(maxLength, this.formatHeader(headers[C]).length);
        }
        
        // Check data lengths (sample first 100 rows for performance)
        for (let R = range.s.r + 1; R <= Math.min(range.e.r, 100); ++R) {
          const cell = worksheet[XLSX.utils.encode_cell({ r: R, c: C })];
          if (cell && cell.v) {
            const cellValue = String(cell.v);
            // For dates and long strings, use reasonable limits
            if (cellValue.length > 50) {
              maxLength = Math.max(maxLength, 50);
            } else {
              maxLength = Math.max(maxLength, cellValue.length);
            }
          }
        }
        
        cols.push({ wch: Math.min(maxLength + 2, 60) }); // Max width of 60
      }
      
      worksheet['!cols'] = cols;

      // Format headers
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: 0, c: C });
        if (worksheet[cellAddress]) {
          // Update header text to be more readable
          const originalValue = worksheet[cellAddress].v;
          worksheet[cellAddress].v = this.formatHeader(String(originalValue));
          
          // Add header styling
          worksheet[cellAddress].s = {
            font: { bold: true, color: { rgb: "FFFFFF" } },
            fill: { fgColor: { rgb: "366092" } },
            alignment: { horizontal: "center", vertical: "center" }
          };
        }
      }

      // Add borders and alternate row coloring
      for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
          if (worksheet[cellAddress]) {
            // Initialize style if not exists
            if (!worksheet[cellAddress].s) {
              worksheet[cellAddress].s = {};
            }
            
            // Add borders
            worksheet[cellAddress].s.border = {
              top: { style: "thin", color: { rgb: "D3D3D3" } },
              bottom: { style: "thin", color: { rgb: "D3D3D3" } },
              left: { style: "thin", color: { rgb: "D3D3D3" } },
              right: { style: "thin", color: { rgb: "D3D3D3" } }
            };
            
            // Alternate row colors (skip header)
            if (R > 0 && R % 2 === 0) {
              worksheet[cellAddress].s.fill = { fgColor: { rgb: "F5F5F5" } };
            }
          }
        }
      }

      // Add autofilter
      worksheet['!autofilter'] = { ref: XLSX.utils.encode_range(range) };

      XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');
    }

    // Write workbook with styles
    const buffer = XLSX.write(workbook, { 
      type: 'buffer', 
      bookType: 'xlsx',
      bookSST: true,
      cellStyles: true
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const filename = `${reportName}_${timestamp}.xlsx`;

    return {
      data: buffer,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename
    };
  }
}

// Export singleton instance
export const exportService = new ExportService();