# 🐳 Jira Sprint Dashboard MCP Server - Production Docker Image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S mcp -u 1001

# Install dependencies first for better layer caching
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY --chown=mcp:nodejs . .

# Build TypeScript
RUN npm run build

# Health check
COPY docker-healthcheck.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-healthcheck.sh
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD /usr/local/bin/docker-healthcheck.sh

# Security: Remove unnecessary packages and files
RUN apk del --no-cache \
    && rm -rf /var/cache/apk/* \
    && rm -rf /tmp/* \
    && rm -rf /root/.npm

# Switch to non-root user
USER mcp

# Expose port
EXPOSE 3000

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Start the application
CMD ["node", "dist/index.js"]

# Labels for better container management
LABEL maintainer="your-email@company.com"
LABEL version="1.0.0"
LABEL description="Jira Sprint Dashboard MCP Server - Production Ready"
LABEL org.opencontainers.image.source="https://github.com/your-org/jira-mcp-mvp"
