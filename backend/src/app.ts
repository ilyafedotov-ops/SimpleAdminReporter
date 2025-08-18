// Load environment variables FIRST before any other imports
import dotenv from 'dotenv';
import path from 'path';
// Load from parent directory (project root)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
// Load local development overrides if they exist (override=true allows overwriting)
dotenv.config({ path: path.resolve(__dirname, '../../.env.development'), override: true });

import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
// import session from 'express-session';
// import ConnectRedisStore from 'connect-redis';
import { errorHandler } from '@/middleware/error.middleware';
import { logger } from '@/utils/logger';
import { connectDatabase } from '@/config/database';
import { connectRedis } from '@/config/redis';
import { setupQueues } from '@/queues/setup';

const app: Application = express();
const PORT = process.env.PORT || 5000;

// Trust proxy for accurate client IPs
app.set('trust proxy', 1);

// SECURITY: Enhanced security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],  // Removed 'unsafe-inline' for better XSS protection
      styleSrc: ["'self'", "'unsafe-inline'"],  // Keep for now, but should be removed later
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://graph.microsoft.com", "https://login.microsoftonline.com"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: "same-origin" },
  crossOriginResourcePolicy: { policy: "same-origin" },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,
  originAgentCluster: true,
  permittedCrossDomainPolicies: false,
  referrerPolicy: { policy: ["strict-origin-when-cross-origin"] },
  xssFilter: true
}));

// SECURITY: Enhanced CORS configuration
const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // SECURITY: Default to HTTPS origins in production
    const defaultOrigins = process.env.NODE_ENV === 'production' 
      ? ['https://localhost'] 
      : ['http://localhost:3000', 'https://localhost'];
    const allowedOrigins = process.env.CORS_ORIGIN?.split(',') || defaultOrigins;
    
    // Allow requests with no origin (e.g., mobile apps, Postman)
    if (!origin) {
      return callback(null, true);
    }
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Re-enable for cookie support
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-Token'],
  exposedHeaders: ['X-Total-Count', 'X-Page-Count']
};
app.use(cors(corsOptions));

// Compression middleware
app.use(compression());

// Request logging
app.use(morgan('combined', {
  stream: {
    write: (message: string) => logger.info(message.trim())
  }
}));

// Database pool monitoring middleware - import dynamically to avoid circular deps
app.use(async (req, res, next) => {
  try {
    const { dbPoolMonitor, ensureDbCleanup } = await import('@/middleware/db-pool-monitor.middleware');
    dbPoolMonitor(req, res, () => {
      ensureDbCleanup(req, res, next);
    });
  } catch {
    // If middleware fails to load, continue without it
    next();
  }
});

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '900000'), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'), // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skipSuccessfulRequests: false, // Count successful requests
  skipFailedRequests: true, // Don't count failed requests
});

// Apply rate limiting only in production
if (process.env.NODE_ENV === 'production') {
  app.use('/api/', limiter);
} else {
  // More lenient rate limiting for development
  const devLimiter = rateLimit({
    windowMs: 60000, // 1 minute
    max: 1000, // 1000 requests per minute
    message: { error: 'Too many requests in development mode' }
  });
  app.use('/api/', devLimiter);
}

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Cookie parsing middleware
app.use(cookieParser(process.env.COOKIE_SECRET || 'default-cookie-secret'));

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'AD/Azure AD/O365 Reporting API',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    status: 'running',
    endpoints: {
      api: 'http://localhost:5000/api',
      health: 'http://localhost:5000/health',
      docs: 'See /api for full endpoint list'
    }
  });
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Dynamically import health service to avoid circular dependencies
    const { healthService } = await import('@/services/health/health.service');
    const health = await healthService.getHealthStatus();
    
    // Always return 200 to allow frontend to display information
    // The status is indicated in the response body
    res.status(200).json(health);
  } catch (_error) {
    const { logger } = await import('@/utils/logger');
    logger.error('Root health check error:', _error);
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date(),
      error: 'Health check failed',
      message: (_error as Error).message
    });
  }
});

// API routes will be added in startServer function

// 404 handler will be added after routes are configured

// Error handling middleware (must be last)
app.use(errorHandler);

// Graceful shutdown handling
let server: any;

const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  
  // Stop accepting new connections
  if (server) {
    server.close(async () => {
      logger.info('HTTP server closed');
      
      try {
        // Shutdown Socket.IO
        const { socketService } = await import('@/services/socket.service');
        socketService.shutdown();
        logger.info('Socket.IO server shut down');
        
        // Flush audit logs
        const { auditLogger } = await import('@/services/audit-logger.service');
        await auditLogger.forceFlush();
        logger.info('Audit logs flushed');
        
        // Close Redis connection
        const { redis } = await import('@/config/redis');
        await redis.close();
        logger.info('Redis connection closed');
        
        // Close database connection pool
        const { db } = await import('@/config/database');
        await db.close();
        logger.info('Database connection pool closed');
        
        process.exit(0);
      } catch (_error) {
        logger.error('Error during graceful shutdown:', _error);
        process.exit(1);
      }
    });

    // Force close server after 30 seconds
    setTimeout(() => {
      logger.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 30000);
  } else {
    logger.info('Server not running, exiting immediately');
    process.exit(0);
  }
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  
  // Handle specific error types that shouldn't crash the app
  if (reason && typeof reason === 'object' && 'code' in reason) {
    const errorCode = (reason as any).code;
    if (['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EHOSTUNREACH'].includes(errorCode)) {
      logger.warn(`Network error handled gracefully: ${errorCode}`);
      return; // Don't exit for network errors
    }
  }
  
  // For critical errors that could indicate application corruption, we still exit
  const reasonStr = String(reason);
  if (reasonStr.includes('CRITICAL') || reasonStr.includes('DATABASE') || reasonStr.includes('REDIS')) {
    logger.error('Critical system error detected, initiating graceful shutdown');
    gracefulShutdown('unhandledRejection');
  } else {
    logger.warn('Non-critical unhandled rejection, continuing operation');
  }
});

// Initialize application
async function startServer(): Promise<void> {
  try {
    // Initialize configuration system with dynamic import
    try {
      const { configService } = await import('@/config/config.service');
      const configResult = await configService.initialize();
      
      if (configResult.errors.length > 0) {
        logger.error('Configuration validation failed:', configResult.errors);
        logger.warn('Continuing with degraded functionality due to configuration issues');
      } else {
        logger.info(configService.getConfigSummary());
      }
    } catch (_error) {
      logger.error('Configuration system initialization failed:', _error);
      logger.warn('Continuing without configuration service - using environment variables directly');
    }
    
    // Connect to databases
    await connectDatabase();
    logger.info('Database connected successfully');

    await connectRedis();
    logger.info('Redis connected successfully');

    // Session store not needed for JWT authentication
    logger.info('Using JWT authentication - session store not configured');

    // Setup background job queues
    await setupQueues();
    logger.info('Job queues setup completed');

    // Start database pool monitoring
    const { dbPoolRecovery } = await import('@/utils/db-pool-recovery');
    dbPoolRecovery.startMonitoring(5000); // Check every 5 seconds
    logger.info('Database pool monitoring started');

    // Import and setup routes
    logger.info('Importing route modules...');
    const routes = await import('@/routes');
    logger.info('Route modules imported successfully');
    
    logger.info('Mounting API routes at /api');
    try {
      app.use('/api', routes.default);
      logger.info('API routes configured successfully');
    } catch (error) {
      logger.error('Critical error during route mounting:', error);
      logger.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available');
      throw error;
    }
    
    // Add 404 handler after all routes are configured
    logger.info('Adding 404 handler');
    app.use((req, res) => {
      logger.warn(`Route not found: ${req.method} ${req.originalUrl}`);
      res.status(404).json({
        error: 'Route not found',
        path: req.originalUrl,
        method: req.method
      });
    });
    logger.info('404 handler added successfully');

    // Create HTTP server
    logger.info('Creating HTTP server');
    const http = await import('http');
    const server = http.createServer(app);
    logger.info('HTTP server created successfully');
    
    // Initialize Socket.IO
    logger.info('Initializing Socket.IO service');
    try {
      const { socketService } = await import('@/services/socket.service');
      socketService.initialize(server);
      logger.info('Socket.IO service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Socket.IO service:', error);
      throw error;
    }

    // Start HTTP server with Socket.IO support
    server.listen(PORT, () => {
      logger.info(`Server is running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`Health check available at http://localhost:${PORT}/health`);
      logger.info(`WebSocket support enabled at ws://localhost:${PORT}/socket/logs`);
    });

  } catch (_error) {
    logger.error('Failed to start server:', _error);
    process.exit(1);
  }
}

// Start the server only if not in test environment
if (process.env.NODE_ENV !== 'test') {
  logger.info('Starting application...');
  startServer().catch(error => {
    logger.error('Fatal error starting server:', error);
    process.exit(1);
  });
}

export default app;
