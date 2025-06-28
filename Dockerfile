# Ultra-minimal Dockerfile for Smithery deployment
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files first (for layer caching)
COPY package*.json ./

# Install dependencies and build in one step
RUN npm ci && npm cache clean --force

# Copy only essential source files
COPY src/ ./src/
COPY types/ ./types/
COPY tsconfig.json ./

# Build TypeScript
RUN npm run build

# Copy runtime scripts
COPY docker-entrypoint.sh docker-healthcheck.sh ./
RUN chmod +x docker-entrypoint.sh docker-healthcheck.sh

# Clean up to reduce image size
RUN npm prune --production && \
    rm -rf src/ types/ tsconfig.json && \
    rm -rf /root/.npm /tmp/*

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S mcp -u 1001 && \
    mkdir -p logs config && \
    chown -R mcp:nodejs /app

USER mcp

# Expose port
EXPOSE 3000

# Environment variables
ENV NODE_ENV=production PORT=3000 MODE=http

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD ./docker-healthcheck.sh

# Start command
ENTRYPOINT ["./docker-entrypoint.sh"]
