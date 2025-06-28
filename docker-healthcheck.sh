#!/bin/bash

# 🔍 Simple Health Check for Jira MCP Server (STDIO Mode)

# Check if the MCP server process is running
if pgrep -f "node.*dist/index.js" > /dev/null; then
    echo "OK: Jira MCP Server process is running"
    exit 0
else
    echo "ERROR: Jira MCP Server process not found"
    exit 1
fi