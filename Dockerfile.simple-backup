# 🐳 Jira Sprint Dashboard MCP Server - Simplified Production Build
FROM node:18-alpine

# Install system dependencies
RUN apk add --no-cache \
    bash \
    curl \
    wget \
    bc \
    && rm -rf /var/cache/apk/*

# Set working directory
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S mcp -u 1001

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including dev for building)
RUN npm ci && npm cache clean --force

# Copy source code and configuration
COPY --chown=mcp:nodejs . .

# Build TypeScript
RUN npm run build

# Remove devDependencies to reduce image size (but keep built files)
RUN npm prune --production

# Setup entrypoint scripts
COPY docker-entrypoint.sh /usr/local/bin/
COPY docker-healthcheck.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-healthcheck.sh

# Health check for HTTP mode
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD /usr/local/bin/docker-healthcheck.sh

# Create necessary directories
RUN mkdir -p /app/logs /app/config && \
    chown -R mcp:nodejs /app/logs /app/config

# Security cleanup
RUN rm -rf /root/.npm && \
    rm -rf /tmp/* && \
    find /app -name "*.ts" -not -path "*/node_modules/*" -delete || true

# Switch to non-root user
USER mcp

# Expose ports
EXPOSE 3000 3001

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV MODE=http

# Use the entrypoint script
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

# Labels for better container management
LABEL maintainer="jira-mcp@company.com"
LABEL version="2.0.0"
LABEL description="Jira Sprint Dashboard MCP Server - HTTP & MCP modes"
LABEL org.opencontainers.image.source="https://github.com/CHIBOLAR/jira_mcp_sprinthealth"
