import { Pool } from 'pg';
import * as dotenv from 'dotenv';

import { logger } from "../utils/logger";
// Load environment variables
dotenv.config();

export class Database {
  private static instance: Database;
  private pool: Pool;

  private constructor() {
    // Parse DATABASE_URL or use individual parameters
    let connectionConfig: any;
    
    if (process.env.DATABASE_URL) {
      // Parse DATABASE_URL to ensure password is properly handled
      const dbUrl = new URL(process.env.DATABASE_URL);
      const password = dbUrl.password;
      
      if (!password) {
        throw new Error('Database password is missing in DATABASE_URL. Please include password in the connection string.');
      }
      
      connectionConfig = {
        host: dbUrl.hostname,
        port: parseInt(dbUrl.port || '5432', 10),
        database: dbUrl.pathname.slice(1), // Remove leading slash
        user: dbUrl.username,
        password: password,
      };
      // Use console for debugging to avoid circular dependencies
      if (process.env.NODE_ENV !== 'production' && logger && logger.debug) {
        logger.debug('Database config from DATABASE_URL:', {
          host: connectionConfig.host,
          port: connectionConfig.port,
          database: connectionConfig.database,
          user: connectionConfig.user,
          passwordLength: connectionConfig.password?.length
        });
      }
    } else {
      const password = process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD;
      
      if (!password) {
        throw new Error('Database password is missing. Please set DB_PASSWORD or POSTGRES_PASSWORD environment variable.');
      }
      
      connectionConfig = {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        database: process.env.DB_NAME || 'reporting',
        user: process.env.DB_USER || 'postgres',
        password: password
      };
    }

    this.pool = new Pool({
      ...connectionConfig,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 20, // Reduced maximum number of clients in the pool
      min: 2,  // Reduced minimum number of clients in the pool
      idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
      connectionTimeoutMillis: 10000, // Return an error after 10 seconds if connection could not be established
      maxUses: 7500, // Close connections after 7500 queries
      statement_timeout: 30000, // 30 second statement timeout
      query_timeout: 30000, // 30 second query timeout
      // Additional optimization settings
      allowExitOnIdle: false, // Keep the pool alive even if all clients are idle
    });

    // Handle pool errors
    this.pool.on('error', (err) => {
      if (logger && logger.error) {
        logger.error('Unexpected error on idle client:', err);
      } else if (process.env.NODE_ENV !== 'test') {
        // Only log in non-test environments, use stderr for critical database errors
        process.stderr.write(`Unexpected error on idle client: ${err.message}\n`);
      }
    });

    this.pool.on('connect', (_client) => {
      if (process.env.NODE_ENV !== 'production' && logger && logger.debug) {
        logger.debug('New client connected to database');
      }
    });

    this.pool.on('remove', (_client) => {
      if (process.env.NODE_ENV !== 'production') {
        // More detailed logging to diagnose pool issues
        const poolStats = {
          totalCount: this.pool.totalCount,
          idleCount: this.pool.idleCount,
          waitingCount: this.pool.waitingCount
        };
        logger.debug('Client removed from database pool', poolStats);
      }
    });
  }

  public static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }
  
  // Method for testing to reset singleton instance
  public static resetInstance(): void {
    if (process.env.NODE_ENV === 'test' && Database.instance) {
      Database.instance = null as any;
    }
  }

  public getPool(): Pool {
    return this.pool;
  }

  public async query(text: string, params?: any[]): Promise<any> {
    const start = Date.now();
    let client;
    
    try {
      // Get a client from the pool with timeout
      client = await Promise.race([
        this.pool.connect(),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Failed to acquire database connection from pool')), 10000)
        )
      ]);
      
      // Set statement timeout for this specific client
      await client.query('SET statement_timeout = 25000');
      
      // Execute the actual query
      const result = await client.query(text, params);
      
      const duration = Date.now() - start;
      if (process.env.NODE_ENV !== 'production' && process.env.LOG_DB_QUERIES === 'true') {
        logger.debug('Executed query', { text, duration, rows: result.rowCount });
      }
      
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      logger.error('Database query error:', { text, duration, error: (error as Error).message });
      
      // Check if it's a timeout error
      if ((error as any).code === '57014') {
        throw new Error('Query timeout: The query took too long to execute (>25s)');
      }
      
      throw error;
    } finally {
      // CRITICAL: Always release the client back to the pool
      if (client) {
        try {
          client.release();
        } catch (releaseError) {
          logger.error('Error releasing database client:', releaseError);
        }
      }
    }
  }

  public async getClient() {
    return await this.pool.connect();
  }

  public async testConnection(): Promise<boolean> {
    try {
      const result = await this.query('SELECT NOW() as current_time');
      logger.info('Database connection test successful:', result.rows[0]);
      return true;
    } catch (error) {
      logger.error('Database connection test failed:', error);
      return false;
    }
  }

  public async close(): Promise<void> {
    try {
      if (this.pool && !this.pool.ended) {
        await this.pool.end();
        logger.info('Database pool closed');
      }
    } catch (error) {
      logger.error('Error closing database pool:', error);
      throw error;
    }
  }

  // Get pool statistics for monitoring
  public getPoolStats(): {
    totalCount: number;
    idleCount: number;
    waitingCount: number;
  } {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount
    };
  }

  // Transaction helper
  public async transaction<T>(callback: (client: any) => Promise<T>): Promise<T> {
    const client = await this.getClient();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

// Export singleton instance
export const db = Database.getInstance();

// Connection function for app initialization
export const connectDatabase = async (): Promise<void> => {
  try {
    const connected = await db.testConnection();
    if (!connected) {
      throw new Error('Failed to connect to database');
    }
    logger.info('Database connected successfully');
  } catch (error) {
    logger.error('Database connection failed:', error);
    throw error;
  }
};