import Transport from 'winston-transport';
import { db } from '@/config/database';
import { emitLogEvent } from '@/events/log-events';

interface DatabaseTransportOptions extends Transport.TransportStreamOptions {
  tableName?: string;
  connectionPool?: typeof db;
  service?: string;
  module?: string;
  batchSize?: number;
  flushInterval?: number;
}

interface LogEntry {
  level: string;
  message: string;
  timestamp?: Date;
  service?: string;
  module?: string;
  userId?: number;
  requestId?: string;
  ipAddress?: string;
  method?: string;
  url?: string;
  statusCode?: number;
  durationMs?: number;
  errorStack?: string;
  metadata?: any;
}

/**
 * Custom Winston transport for PostgreSQL database
 * Batches log entries for efficient database writes
 */
export class DatabaseTransport extends Transport {
  private tableName: string;
  private connectionPool: typeof db;
  private service: string;
  private module?: string;
  private batchSize: number;
  private flushInterval: number;
  private logBatch: LogEntry[] = [];
  private flushTimer?: NodeJS.Timeout;
  private isClosing: boolean = false;

  constructor(options: DatabaseTransportOptions = {}) {
    super(options);
    
    this.tableName = options.tableName || 'system_logs';
    this.connectionPool = options.connectionPool || db;
    this.service = options.service || 'ad-reporting-backend';
    this.module = options.module;
    this.batchSize = options.batchSize || 50;
    this.flushInterval = options.flushInterval || 5000; // 5 seconds
    
    // Start the flush timer
    this.startFlushTimer();
  }

  /**
   * Log method called by Winston
   */
  async log(info: any, callback: () => void): Promise<void> {
    setImmediate(() => {
      this.emit('logged', info);
    });

    // Skip database logging in test environment to avoid connection issues
    if (process.env.NODE_ENV === 'test') {
      callback();
      return;
    }

    // Skip logging database queries to prevent infinite loop
    if (info.module === 'database' || info.message?.includes('Executed query') || info.message?.includes('system_logs')) {
      callback();
      return;
    }

    // Extract log entry from Winston info object
    const logEntry: LogEntry = {
      level: info.level,
      message: info.message,
      timestamp: info.timestamp ? new Date(info.timestamp) : new Date(),
      service: info.service || this.service,
      module: info.module || this.module,
      userId: info.userId,
      requestId: info.requestId,
      ipAddress: info.ipAddress,
      method: info.method,
      url: info.url,
      statusCode: info.statusCode,
      durationMs: info.durationMs,
      errorStack: info.stack,
      metadata: this.extractMetadata(info)
    };

    // Add to batch
    this.logBatch.push(logEntry);

    // Flush if batch is full
    if (this.logBatch.length >= this.batchSize) {
      await this.flush();
    }

    callback();
  }

  /**
   * Extract metadata from log info, excluding standard fields
   */
  private extractMetadata(info: any): any {
    const standardFields = [
      'level', 'message', 'timestamp', 'service', 'module',
      'userId', 'requestId', 'ipAddress', 'method', 'url',
      'statusCode', 'durationMs', 'stack'
    ];

    const metadata: any = {};
    
    for (const key in info) {
      if (!standardFields.includes(key) && key !== 'Symbol(level)' && key !== 'Symbol(message)') {
        metadata[key] = info[key];
      }
    }

    return Object.keys(metadata).length > 0 ? metadata : null;
  }

  /**
   * Sanitize string to remove null bytes and other invalid UTF-8 characters
   */
  private sanitizeString(str: any): any {
    if (typeof str !== 'string') {
      return str;
    }
    
    // Remove null bytes (0x00) and other control characters that PostgreSQL doesn't accept
    return str
      .replace(/\x00/g, '') // Remove null bytes
      .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove other control characters except \t, \n, \r
      .trim();
  }

  /**
   * Recursively sanitize an object
   */
  private sanitizeObject(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }
    
    if (typeof obj === 'string') {
      return this.sanitizeString(obj);
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item));
    }
    
    if (typeof obj === 'object') {
      const sanitized: any = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          sanitized[key] = this.sanitizeObject(obj[key]);
        }
      }
      return sanitized;
    }
    
    return obj;
  }

  /**
   * Start the flush timer
   */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      if (this.logBatch.length > 0) {
        this.flush().catch(err => {
          // eslint-disable-next-line no-console
          console.error('Error flushing logs:', err);
        });
      }
    }, this.flushInterval);
  }

  /**
   * Flush the log batch to database
   */
  private async flush(): Promise<void> {
    if (this.logBatch.length === 0 || this.isClosing) {
      return;
    }

    const logsToFlush = [...this.logBatch];
    this.logBatch = [];

    const client = await this.connectionPool.getClient();

    try {
      await client.query('BEGIN');

      // Prepare bulk insert
      const values: any[] = [];
      const placeholders: string[] = [];
      let paramIndex = 1;

      for (const log of logsToFlush) {
        placeholders.push(
          `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, 
           $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, 
           $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, 
           $${paramIndex++}, $${paramIndex++})`
        );

        values.push(
          this.sanitizeString(log.level),
          this.sanitizeString(log.message),
          log.timestamp,
          this.sanitizeString(log.service),
          this.sanitizeString(log.module) || null,
          log.userId || null,
          this.sanitizeString(log.requestId) || null,
          this.sanitizeString(log.ipAddress) || null,
          this.sanitizeString(log.method) || null,
          this.sanitizeString(log.url) || null,
          log.statusCode || null,
          log.durationMs || null,
          this.sanitizeString(log.errorStack) || null,
          log.metadata ? JSON.stringify(this.sanitizeObject(log.metadata)) : null
        );
      }

      const query = `
        INSERT INTO ${this.tableName} 
        (level, message, timestamp, service, module, user_id, request_id, 
         ip_address, method, url, status_code, duration_ms, error_stack, metadata)
        VALUES ${placeholders.join(', ')}
      `;

      await client.query(query, values);
      await client.query('COMMIT');
      
      // Emit events for real-time streaming
      for (const log of logsToFlush) {
        // Only emit important logs (not debug/verbose)
        if (['error', 'warn', 'info'].includes(log.level)) {
          emitLogEvent({
            log_type: 'system',
            id: Date.now().toString(), // Temporary ID
            timestamp: log.timestamp?.toISOString() || new Date().toISOString(),
            level: log.level,
            message: log.message,
            module: log.module,
            success: log.level !== 'error'
          });
        }
      }

    } catch (error) {
      await client.query('ROLLBACK');
      
      // Re-add logs to batch for retry
      this.logBatch.unshift(...logsToFlush);
      
      // Log error to console as fallback
      // eslint-disable-next-line no-console
      console.error('Failed to write logs to database:', error);
      
    } finally {
      client.release();
    }
  }

  /**
   * Close the transport
   */
  async close(): Promise<void> {
    this.isClosing = true;
    
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    
    // Final flush
    await this.flush();
  }
}

/**
 * Factory function to create database transport
 */
export function createDatabaseTransport(options?: DatabaseTransportOptions): DatabaseTransport {
  return new DatabaseTransport(options);
}