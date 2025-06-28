#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Jira MCP OAuth Integration - Quick Start');
console.log('='.repeat(50));

// Check if OAuth server exists
const oauthServerPath = path.join(__dirname, 'oauth-server-final.cjs');
if (!fs.existsSync(oauthServerPath)) {
  console.error('❌ OAuth server not found at:', oauthServerPath);
  console.log('💡 Please run the setup first');
  process.exit(1);
}

// Check dependencies
try {
  require('express');
  require('cors');
  require('jsonwebtoken');
  console.log('✅ Dependencies OK');
} catch (error) {
  console.error('❌ Missing dependencies. Run: npm install');
  process.exit(1);
}

// Start OAuth server
console.log('\n🔐 Starting OAuth server...');
const server = spawn('node', [oauthServerPath], {
  env: { ...process.env, PORT: '3001' },
  stdio: 'inherit'
});

console.log('📋 OAuth Server Commands:');
console.log('   • Health Check: curl http://localhost:3001/health');
console.log('   • Metadata: curl http://localhost:3001/.well-known/mcp-configuration');
console.log('   • OAuth Flow: start http://localhost:3001/oauth/authorize');
console.log('   • Server Status: start http://localhost:3001/');

console.log('\n🎯 Claude Desktop Integration:');
console.log('   1. Restart Claude Desktop');
console.log('   2. Test: "Test Jira connection"');
console.log('   3. OAuth: "Test OAuth server health"');

console.log('\n⚡ Quick Tests:');
console.log('   • npm run oauth:health');
console.log('   • npm run claude:validate');

console.log('\n🛑 Press Ctrl+C to stop the server');

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down OAuth server...');
  server.kill('SIGINT');
  process.exit(0);
});

// Handle server exit
server.on('close', (code) => {
  console.log(`\n📡 OAuth server stopped with code ${code}`);
  process.exit(code);
});

server.on('error', (error) => {
  console.error('❌ Failed to start OAuth server:', error);
  process.exit(1);
});
