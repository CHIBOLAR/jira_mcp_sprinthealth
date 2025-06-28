#!/bin/bash

# 🐳 Docker Entrypoint for Jira MCP Server (Smithery Compatible)
# Handles STDIO mode for MCP communication

set -e

echo "🚀 Starting Jira MCP Server..."

# Map Smithery config to environment variables
export JIRA_URL="${jiraBaseUrl:-${JIRA_URL:-https://example.atlassian.net}}"
export JIRA_EMAIL="${jiraEmail:-${JIRA_EMAIL:-validation@example.com}}"
export JIRA_API_TOKEN="${jiraApiToken:-${JIRA_API_TOKEN:-validation-token}}"

echo "📡 JIRA URL: $JIRA_URL"
echo "👤 JIRA Email: $JIRA_EMAIL"
echo "🔑 JIRA Token: [HIDDEN]"

# Create necessary directories
mkdir -p /app/logs /app/config

# Set permissions if running as root
if [ "$(id -u)" = "0" ]; then
    chown -R mcp:nodejs /app/logs /app/config 2>/dev/null || true
fi

echo "✅ Starting MCP server in STDIO mode..."

# Start the MCP server in STDIO mode
exec node dist/index.js