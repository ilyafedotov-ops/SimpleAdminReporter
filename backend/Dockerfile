# Multi-stage Dockerfile for Backend
# Build stage
FROM node:26-alpine AS builder

WORKDIR /app/backend

# Install build dependencies
RUN apk add --no-cache python3 make g++ curl

# Update npm bundled with the base image to pick up security fixes for npm's dependencies.
RUN npm install -g npm@12.0.1

# Copy package files
COPY backend/package*.json ./
COPY backend/tsconfig.json ./

# Install all dependencies (including devDependencies for building)
RUN npm ci --prefer-offline --allow-remote=all

# Copy source files
COPY backend/src ./src

# Build TypeScript
RUN npm run build

# Test stage (for CI)
FROM node:26-alpine AS test

WORKDIR /app/backend

# Install test dependencies
RUN apk add --no-cache python3 make g++ curl postgresql-client

# Update npm bundled with the base image to pick up security fixes for npm's dependencies.
RUN npm install -g npm@12.0.1

# Copy package files
COPY backend/package*.json ./
COPY backend/tsconfig.json ./
COPY backend/jest.config.js* ./

# Install all dependencies
RUN npm ci --allow-remote=all

# Copy backend and database for testing
COPY backend/ .
COPY database /app/backend/database

# Run linting and type checking
RUN npm run lint
RUN npm run build

# Test command
CMD ["npm", "run", "test:ci"]

# Production stage
FROM node:26-alpine AS production

WORKDIR /app/backend

# Install runtime dependencies
RUN apk add --no-cache \
    dumb-init \
    curl \
    postgresql-client \
    && rm -rf /var/cache/apk/*

# Update npm bundled with the base image to pick up security fixes for npm's dependencies.
RUN npm install -g npm@12.0.1

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

# Copy package files
COPY backend/package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev --prefer-offline --allow-remote=all && \
    npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/backend/dist ./dist
COPY database /app/backend/database

# Copy any additional runtime files
COPY backend/package.json ./

# Create necessary directories and set permissions
RUN mkdir -p /app/backend/logs /app/backend/uploads /app/backend/temp /app/backend/exports && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:5000/health || exit 1

# Expose port
EXPOSE 5000

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["npm", "start"]

# Development stage
FROM node:26-alpine AS development

WORKDIR /app/backend

# Install build dependencies including nodemon
RUN apk add --no-cache python3 make g++ curl postgresql-client

# Update npm bundled with the base image to pick up security fixes for npm's dependencies.
RUN npm install -g npm@12.0.1

# Copy package files
COPY backend/package*.json ./
COPY backend/tsconfig.json ./

# Install all dependencies
RUN npm ci --allow-remote=all

# Copy source files (will be overridden by volume mount in dev)
COPY backend/src ./src
COPY database /app/backend/database

# Expose port
EXPOSE 5000

# Start with nodemon for hot reload
CMD ["npm", "run", "dev"]
