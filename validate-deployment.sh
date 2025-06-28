#!/bin/bash

# Quick validation script for Smithery deployment
echo "🧪 Validating Jira MCP Server for Smithery deployment..."

# Check if built files exist
if [ ! -f "dist/index.js" ]; then
    echo "❌ Built files missing. Running build..."
    npm run build
fi

# Check if Docker build works
echo "🐳 Testing Docker build..."
docker build -t jira-mcp-validation . > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo "✅ Docker build successful"
else
    echo "❌ Docker build failed"
    exit 1
fi

# Test that the server can start (timeout after 5 seconds)
echo "🚀 Testing MCP server startup..."
timeout 5 node dist/index.js < /dev/null > /dev/null 2>&1

if [ $? -eq 124 ]; then
    echo "✅ MCP server starts correctly (timeout expected)"
elif [ $? -eq 0 ]; then
    echo "✅ MCP server started and exited cleanly"
else
    echo "❌ MCP server failed to start"
    exit 1
fi

echo "🎉 All validation checks passed! Ready for Smithery deployment."