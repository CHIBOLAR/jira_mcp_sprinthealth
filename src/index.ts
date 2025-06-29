#!/usr/bin/env node

/**
 * Jira MCP Server Launcher
 * Automatically detects the environment and starts the appropriate server
 */

import { createLazyServer } from './server-lazy.js';
import HttpJiraMCPServerWithOAuth from './server-http-oauth.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const isStdio = process.stdin.isTTY === false && process.stdout.isTTY === false;
const isHttp = process.env.HTTP_MODE === 'true' || process.env.PORT || process.argv.includes('--http');

async function main() {
  try {
    if (!isStdio && !isHttp) {
      // Interactive mode - show help
      console.log('🚀 Jira MCP Server Launcher\n');
      console.log('Usage:');
      console.log('  npm start                 # HTTP mode (Smithery compatible)');
      console.log('  npm run start:lazy        # Stdio mode (Claude Desktop)');
      console.log('  HTTP_MODE=true npm start  # Force HTTP mode');
      console.log('  PORT=3000 npm start       # HTTP mode on specific port');
      console.log('\nFor Claude Desktop configuration, use start:lazy');
      console.log('For Smithery deployment, use start (HTTP mode)');
      process.exit(0);
    }

    if (isStdio) {
      // Stdio mode for Claude Desktop
      console.error('🚀 Starting Jira MCP Server in Stdio mode...');
      const server = createLazyServer();
      const transport = new StdioServerTransport();
      await server.connect(transport);
    } else {
      // HTTP mode for Smithery and web deployments
      console.log('🚀 Starting Jira MCP Server in HTTP mode...');
      const httpServer = new HttpJiraMCPServerWithOAuth();
      await httpServer.startServer();
    }
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Handle process termination gracefully
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Received SIGTERM, shutting down...');
  process.exit(0);
});

// Check if this is the main module (CommonJS compatible)
try {
  const isMainModule = typeof require !== 'undefined' && require.main === module;
  if (isMainModule) {
    main();
  }
} catch (error) {
  // Fallback for module detection
  if (process.argv[1] && (process.argv[1].includes('index.js') || process.argv[1].includes('index.ts'))) {
    main();
  }
}
