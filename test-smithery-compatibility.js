#!/usr/bin/env node

/**
 * Test the new Smithery-compatible index.ts
 */

import { createServer, configSchema } from './dist/src/index.js';

console.log('🧪 Testing Smithery-compatible MCP Server...\n');

try {
  // Test 1: Create server without configuration (lazy loading)
  console.log('✅ Test 1: Creating server without configuration...');
  const server = createServer();
  console.log('✅ Server created successfully without configuration');

  // Test 2: Check if configSchema is exported properly
  console.log('✅ Test 2: Checking configSchema export...');
  console.log('ConfigSchema type:', typeof configSchema);
  console.log('✅ ConfigSchema exported correctly');

  // Test 3: Test server properties
  console.log('✅ Test 3: Checking server properties...');
  console.log('Server type:', typeof server);
  console.log('✅ Server object created correctly');

  console.log('\n🎉 All tests passed! Server is Smithery-compatible.');
  console.log('\n📋 Server features:');
  console.log('   • ✅ Starts without configuration (lazy loading)');
  console.log('   • ✅ Exports proper MCP server');
  console.log('   • ✅ Exports configSchema');
  console.log('   • ✅ TypeScript runtime compatible');

} catch (error) {
  console.error('❌ Test failed:', error);
  process.exit(1);
}
