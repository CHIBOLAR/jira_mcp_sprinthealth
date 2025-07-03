#!/bin/bash

# Start OAuth Server Script
echo "🚀 Starting Jira OAuth Server..."

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "❌ .env file not found. Please create one based on .env.example"
    exit 1
fi

# Load environment variables
export $(cat .env | xargs)

# Check if required environment variables are set
if [ -z "$OAUTH_CLIENT_ID" ] || [ -z "$OAUTH_CLIENT_SECRET" ]; then
    echo "❌ Missing required OAuth configuration:"
    echo "   OAUTH_CLIENT_ID=${OAUTH_CLIENT_ID:-'NOT SET'}"
    echo "   OAUTH_CLIENT_SECRET=${OAUTH_CLIENT_SECRET:-'NOT SET'}"
    echo ""
    echo "Please check your .env file and ensure these variables are properly set."
    exit 1
fi

echo "✅ OAuth Configuration:"
echo "   Client ID: ${OAUTH_CLIENT_ID}"
echo "   Client Secret: ${OAUTH_CLIENT_SECRET:0:10}..."
echo "   Port: ${PORT:-3000}"
echo ""

# Clean up any existing tokens
rm -f /tmp/jira-mcp-tokens.json
rm -f /tmp/jira-oauth-sessions.json

echo "🧹 Cleaned up existing tokens and sessions"
echo ""

# Start the OAuth server
echo "🔧 Starting OAuth server..."
npm run dev-oauth-fixed