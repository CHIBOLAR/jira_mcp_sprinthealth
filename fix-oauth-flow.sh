#!/bin/bash

echo "🔧 Jira OAuth Flow - Complete Fix"
echo "=================================="

# Load environment variables
export $(cat .env | xargs)

echo "🧹 Step 1: Clean up existing tokens and sessions..."
rm -f /tmp/jira-mcp-tokens.json
rm -f /tmp/jira-oauth-sessions.json
echo "✅ Cleaned up"

echo ""
echo "🔗 Step 2: Generate fresh OAuth URL..."
node generate-oauth-url.js

echo ""
echo "🚀 Step 3: Ready to test OAuth flow!"
echo ""
echo "INSTRUCTIONS:"
echo "1. Copy the OAuth URL from above"
echo "2. In a new terminal, run: npm run dev-oauth-fixed"
echo "3. Open the OAuth URL in your browser"
echo "4. Complete Atlassian login"
echo "5. Check for success message"
echo ""
echo "If you get the 'Invalid OAuth state parameter' error again:"
echo "- Make sure you're using the URL generated above"
echo "- Make sure the OAuth server is running when you click the link"
echo "- Check that both processes are using the same .env file"