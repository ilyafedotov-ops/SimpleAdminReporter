# Multi-stage Dockerfile for Backend
# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++ curl

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including devDependencies for building)
RUN npm ci --prefer-offline

# Copy source files
COPY src ./src

# Build TypeScript
RUN npm run build

# Test stage (for CI)
FROM node:22-alpine AS test

WORKDIR /app

# Install test dependencies
RUN apk add --no-cache python3 make g++ curl postgresql-client

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./
COPY jest.config.js* ./

# Install all dependencies
RUN npm ci

# Copy everything for testing
COPY . .

# Run linting and type checking
RUN npm run lint
RUN npm run build

# Test command
CMD ["npm", "run", "test:ci"]

# Production stage
FROM node:22-alpine AS production

WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache \
    dumb-init \
    curl \
    postgresql-client \
    && rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production --prefer-offline && \
    npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Copy any additional runtime files
COPY package.json ./

# Create necessary directories and set permissions
RUN mkdir -p /app/logs /app/uploads /app/temp /app/exports && \
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
FROM node:22-alpine AS development

WORKDIR /app

# Install build dependencies including nodemon
RUN apk add --no-cache python3 make g++ curl postgresql-client

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies
RUN npm ci

# Copy source files (will be overridden by volume mount in dev)
COPY src ./src

# Expose port
EXPOSE 5000

# Start with nodemon for hot reload
CMD ["npm", "run", "dev"]