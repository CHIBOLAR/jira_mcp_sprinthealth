# Multi-stage build for optimal size and security
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files for dependency caching
COPY package*.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci --include=dev

# Copy source code
COPY src/ ./src/
COPY types/ ./types/
COPY tsconfig.json ./

# Build the application
RUN npm run build

# Production stage - minimal runtime image
FROM node:20-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create app directory
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S mcp -u 1001 -G nodejs

# Copy package.json for production install
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Copy runtime scripts
COPY docker-entrypoint.sh docker-healthcheck.sh ./
RUN chmod +x docker-entrypoint.sh docker-healthcheck.sh

# Create necessary directories
RUN mkdir -p logs config && \
    chown -R mcp:nodejs /app

# Switch to non-root user
USER mcp

# Expose port
EXPOSE 3000

# Environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    MODE=stdio \
    LOG_LEVEL=info \
    ENABLE_CACHING=false

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD ./docker-healthcheck.sh

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start command
CMD ["./docker-entrypoint.sh"]