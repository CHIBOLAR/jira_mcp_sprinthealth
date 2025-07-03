#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Live OAuth Testing Log Setup
 * Creates centralized logging for real OAuth flow testing
 */

const LIVE_LOG_FILE = path.join(os.tmpdir(), 'oauth-live-test.log');
const SESSION_FILE = path.join(os.tmpdir(), 'jira-oauth-sessions.json');
const TOKEN_FILE = path.join(os.tmpdir(), 'jira-mcp-tokens.json');

function setupLiveLogging() {
  console.log('📋 ============ LIVE OAUTH TESTING SETUP ============');
  
  // Clear previous logs
  if (fs.existsSync(LIVE_LOG_FILE)) {
    fs.unlinkSync(LIVE_LOG_FILE);
    console.log('✅ Cleared previous live test logs');
  }
  
  // Clear previous sessions
  if (fs.existsSync(SESSION_FILE)) {
    fs.unlinkSync(SESSION_FILE);
    console.log('✅ Cleared previous OAuth sessions');
  }
  
  // Clear previous tokens
  if (fs.existsSync(TOKEN_FILE)) {
    fs.unlinkSync(TOKEN_FILE);
    console.log('✅ Cleared previous OAuth tokens');
  }
  
  // Create initial log entry
  const timestamp = new Date().toISOString();
  const initialLog = `[${timestamp}] LIVE OAUTH TEST SESSION STARTED\n` +
                    `[${timestamp}] Process PID: ${process.pid}\n` +
                    `[${timestamp}] Node Version: ${process.version}\n` +
                    `[${timestamp}] Environment: ${process.env.NODE_ENV || 'development'}\n` +
                    `[${timestamp}] Logs will be written to: ${LIVE_LOG_FILE}\n` +
                    `[${timestamp}] Sessions tracked in: ${SESSION_FILE}\n` +
                    `[${timestamp}] Tokens saved to: ${TOKEN_FILE}\n` +
                    `[${timestamp}] =====================================\n\n`;
  
  fs.writeFileSync(LIVE_LOG_FILE, initialLog);
  
  console.log('🔍 Live OAuth logging is now active!');
  console.log('');
  console.log('📁 Log Files:');
  console.log(`   Live Test Log: ${LIVE_LOG_FILE}`);
  console.log(`   OAuth Sessions: ${SESSION_FILE}`);
  console.log(`   OAuth Tokens: ${TOKEN_FILE}`);
  console.log('');
  console.log('📋 What happens during your test:');
  console.log('   1. When you run start_oauth - session creation logged');
  console.log('   2. When you click OAuth link - URL parameters logged');
  console.log('   3. When OAuth callback happens - token exchange logged');
  console.log('   4. All errors and success states logged in real-time');
  console.log('');
  console.log('🔍 To monitor logs in real-time, run:');
  console.log(`   tail -f ${LIVE_LOG_FILE}`);
  console.log('');
  console.log('📊 To check session state, run:');
  console.log('   node check-live-sessions.js');
  console.log('');
  console.log('✅ Ready for live OAuth testing!');
}

setupLiveLogging();