#!/bin/bash

# 🐳 Docker Entrypoint for Jira MCP Server (Smithery Compatible)
# Supports both HTTP and MCP modes with flexible environment handling

set -e

# Default values
MODE="${MODE:-stdio}"
PORT="${PORT:-3000}"
NODE_ENV="${NODE_ENV:-production}"

echo "🚀 Starting Jira MCP Server..."
echo "📡 Mode: $MODE"
echo "🔌 Port: $PORT"
echo "🌍 Environment: $NODE_ENV"

# Create necessary directories
mkdir -p /app/logs
mkdir -p /app/config

# Set permissions (only if running as root, otherwise skip)
if [ "$(id -u)" = "0" ]; then
    chown -R mcp:nodejs /app/logs 2>/dev/null || true
    chown -R mcp:nodejs /app/config 2>/dev/null || true
fi

# Check if this is a Smithery deployment validation (no JIRA env vars)
if [ -z "$JIRA_URL" ] && [ -z "$JIRA_EMAIL" ] && [ -z "$JIRA_API_TOKEN" ]; then
    echo "⚠️  No JIRA credentials found - this might be a deployment validation"
    echo "💡 For production use, set: JIRA_URL, JIRA_EMAIL, JIRA_API_TOKEN"
    
    # For deployment validation, start the server with mock credentials
    export JIRA_URL="https://example.atlassian.net"
    export JIRA_EMAIL="validation@example.com" 
    export JIRA_API_TOKEN="validation-token"
    echo "🔧 Using mock credentials for validation..."
fi

echo "✅ Environment setup complete"

# Choose execution mode
case "$MODE" in
    "http"|"server"|"oauth")
        echo "🌐 Starting HTTP/OAuth server mode..."
        exec node dist/oauth-server.js
        ;;
    "mcp"|"stdio"|*)
        echo "📡 Starting MCP stdio mode..."
        exec node dist/index.js
        ;;
esac