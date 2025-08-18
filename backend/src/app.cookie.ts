import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import dotenv from 'dotenv';
import { errorHandler } from '@/middleware/error.middleware';
import { logger } from '@/utils/logger';
import { connectDatabase } from '@/config/database';
import { connectRedis } from '@/config/redis';
import { setupQueues } from '@/queues/setup';
import { sessionConfig } from '@/config/session.config';
import { csrfProtection } from '@/middleware/csrf.middleware';

// Load environment variables from project root
dotenv.config({ path: '../.env' });
// Load local development overrides if they exist (override=true allows overwriting)
dotenv.config({ path: '.env.development', override: true });

const app: Application = express();
const PORT = process.env.PORT || 5000;

// Feature flag for cookie authentication
const USE_COOKIE_AUTH = process.env.USE_COOKIE_AUTH === 'true';

// Trust proxy for accurate client IPs
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false
}));

// CORS configuration
const corsOptions = {
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
  credentials: true, // Required for cookies
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-Token', 'CSRF-Token']
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

// Cookie parser middleware (must be before session)
app.use(cookieParser(process.env.COOKIE_SECRET || 'dev-cookie-secret'));

// Session middleware (only if cookie auth is enabled)
if (USE_COOKIE_AUTH) {
  app.use(session(sessionConfig));
  
  // CSRF protection middleware
  app.use(csrfProtection);
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    cookieAuth: USE_COOKIE_AUTH
  });
});

// API routes will be added in startServer function

// 404 handler will be added after routes are configured

// Error handling middleware (must be last)
app.use(errorHandler);

// Graceful shutdown handling
const gracefulShutdown = (signal: string) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  
  const server = app.listen(PORT);
  
  server.close(() => {
    logger.info('HTTP server closed');
    
    // Close database connections, queues, etc.
    process.exit(0);
  });

  // Force close server after 30 seconds
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 30000);
};

// Register signal handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Function to start the server with all connections
export const startServer = async () => {
  try {
    // Initialize database
    await connectDatabase();
    logger.info('Database connection established');

    // Initialize Redis
    await connectRedis();
    logger.info('Redis connection established');

    // Setup message queues
    await setupQueues();
    logger.info('Message queues initialized');

    // Import and configure API routes
    const apiRoutes = await import('@/routes');
    app.use('/api', apiRoutes.default);

    // 404 handler for API routes
    app.use('/api', (req, res) => {
      res.status(404).json({
        error: 'Endpoint not found',
        path: req.originalUrl,
        method: req.method
      });
    });

    // Start server
    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
      logger.info(`Cookie authentication: ${USE_COOKIE_AUTH ? 'ENABLED' : 'DISABLED (using localStorage)'}`);
      if (USE_COOKIE_AUTH) {
        logger.info('CSRF protection: ENABLED');
        logger.info(`Session store: Redis`);
      }
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Export app for testing
export default app;