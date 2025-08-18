# Multi-stage Dockerfile for Frontend
# Build stage
FROM node:22-alpine AS builder

# Build arguments for environment variables
ARG VITE_AZURE_CLIENT_ID
ARG VITE_AZURE_TENANT_ID
ARG VITE_API_URL=/api

# Set environment variables for build
ENV VITE_AZURE_CLIENT_ID=$VITE_AZURE_CLIENT_ID
ENV VITE_AZURE_TENANT_ID=$VITE_AZURE_TENANT_ID
ENV VITE_API_URL=$VITE_API_URL

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files and configuration
COPY package*.json ./
COPY tsconfig.json ./
COPY tsconfig.node.json ./
COPY vite.config.ts ./
COPY index.html ./

# Install dependencies
RUN npm ci --prefer-offline

# Copy source files
COPY src ./src
COPY public ./public

# Build the application
RUN npm run build

# Create build info
RUN echo "Build info:" > build/build-info.txt && \
    echo "Timestamp: $(date)" >> build/build-info.txt && \
    echo "Node version: $(node --version)" >> build/build-info.txt && \
    echo "NPM version: $(npm --version)" >> build/build-info.txt

# Development stage
FROM node:22-alpine AS development

WORKDIR /app

# Install dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./
COPY tsconfig.node.json ./
COPY vite.config.ts ./
COPY index.html ./

# Install dependencies
RUN npm ci

# Copy source files
COPY src ./src
COPY public ./public

# Expose dev server port
EXPOSE 5173

# Start development server
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# Test stage (for CI)
FROM node:22-alpine AS test

WORKDIR /app

# Install test dependencies
RUN apk add --no-cache python3 make g++

# Copy package files and configuration
COPY package*.json ./
COPY tsconfig.json ./
COPY tsconfig.node.json ./
COPY vite.config.ts ./
COPY index.html ./
RUN npm ci

# Copy all source files
COPY . .

# Run tests and linting
RUN npm run lint
RUN npm run type-check

# Test command
CMD ["npm", "run", "type-check"]

# Production stage
FROM nginx:1.27-alpine AS production

# Install curl for health checks
RUN apk add --no-cache curl

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx configurations
COPY nginx-main.conf /etc/nginx/nginx.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built files from builder stage
COPY --from=builder /app/build /usr/share/nginx/html

# Add security headers
RUN echo 'add_header X-Frame-Options "SAMEORIGIN" always;' > /etc/nginx/conf.d/security.conf && \
    echo 'add_header X-Content-Type-Options "nosniff" always;' >> /etc/nginx/conf.d/security.conf && \
    echo 'add_header X-XSS-Protection "1; mode=block" always;' >> /etc/nginx/conf.d/security.conf && \
    echo 'add_header Referrer-Policy "strict-origin-when-cross-origin" always;' >> /etc/nginx/conf.d/security.conf && \
    echo 'add_header Content-Security-Policy "default-src '\''self'\''; script-src '\''self'\'' '\''unsafe-inline'\''; style-src '\''self'\'' '\''unsafe-inline'\''; img-src '\''self'\'' data:; font-src '\''self'\'';" always;' >> /etc/nginx/conf.d/security.conf

# Create non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

# Set proper permissions
RUN chown -R appuser:appgroup /var/cache/nginx /var/run /var/log/nginx /usr/share/nginx/html && \
    mkdir -p /tmp/nginx && \
    chown -R appuser:appgroup /tmp/nginx

# Switch to non-root user
USER appuser

# Add health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost/health || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]