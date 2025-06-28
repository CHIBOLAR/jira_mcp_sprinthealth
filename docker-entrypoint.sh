#!/bin/bash

# 🐳 Docker Entrypoint for Jira MCP Server
# Supports both HTTP and MCP modes with health monitoring

set -e

# Default values
MODE="${MODE:-http}"
PORT="${PORT:-3000}"
NODE_ENV="${NODE_ENV:-production}"

echo "🚀 Starting Jira MCP Server..."
echo "📡 Mode: $MODE"
echo "🔌 Port: $PORT"
echo "🌍 Environment: $NODE_ENV"

# Validate environment variables
if [ -z "$JIRA_URL" ] || [ -z "$JIRA_EMAIL" ] || [ -z "$JIRA_API_TOKEN" ]; then
    echo "❌ Missing required environment variables:"
    echo "   JIRA_URL, JIRA_EMAIL, JIRA_API_TOKEN"
    echo ""
    echo "💡 Solution:"
    echo "   1. Copy .env.example to .env"
    echo "   2. Fill in your Jira credentials"
    echo "   3. Get API token from: https://id.atlassian.com/manage-profile/security/api-tokens"
    exit 1
fi

# Create necessary directories
mkdir -p /app/logs
mkdir -p /app/config

# Set permissions
chown -R mcp:nodejs /app/logs
chown -R mcp:nodejs /app/config

echo "✅ Environment validated successfully"

# Choose execution mode
case "$MODE" in
    "http"|"server"|"oauth")
        echo "🌐 Starting HTTP/OAuth server mode..."
        exec node dist/oauth-server.js
        ;;
    "mcp"|"stdio")
        echo "📡 Starting MCP stdio mode..."
        exec node dist/index.js
        ;;
    *)
        echo "❌ Unknown mode: $MODE"
        echo "💡 Valid modes: http, mcp, oauth, stdio"
        exit 1
        ;;
esac
