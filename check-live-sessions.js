#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Live OAuth Session Checker
 * Shows current state of OAuth sessions and tokens
 */

const LIVE_LOG_FILE = path.join(os.tmpdir(), 'oauth-live-test.log');
const SESSION_FILE = path.join(os.tmpdir(), 'jira-oauth-sessions.json');
const TOKEN_FILE = path.join(os.tmpdir(), 'jira-mcp-tokens.json');

function checkLiveSessions() {
  console.log('📊 ============ LIVE OAUTH SESSION STATUS ============');
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('');
  
  // Check session file
  console.log('📋 OAuth Sessions:');
  if (fs.existsSync(SESSION_FILE)) {
    try {
      const sessionContent = fs.readFileSync(SESSION_FILE, 'utf8');
      const sessions = JSON.parse(sessionContent);
      const sessionStates = Object.keys(sessions);
      
      console.log(`   File exists: ✅ (${sessionStates.length} sessions)`);
      
      if (sessionStates.length > 0) {
        sessionStates.forEach((state, index) => {
          const session = sessions[state];
          const age = Date.now() - session.timestamp;
          const ageMinutes = Math.floor(age / 1000 / 60);
          
          console.log(`   Session ${index + 1}:`);
          console.log(`     State: ${state}`);
          console.log(`     Email: ${session.userEmail || 'not set'}`);
          console.log(`     Redirect URI: ${session.redirectUri}`);
          console.log(`     Age: ${ageMinutes} minutes (${age}ms)`);
          console.log(`     Expired: ${age > 15 * 60 * 1000 ? 'YES' : 'NO'}`);
        });
      }
    } catch (error) {
      console.log(`   File exists but parse error: ${error.message}`);
    }
  } else {
    console.log('   File exists: ❌ (no sessions stored)');
  }
  
  // Check token file
  console.log('');
  console.log('🔑 OAuth Tokens:');
  if (fs.existsSync(TOKEN_FILE)) {
    try {
      const tokenContent = fs.readFileSync(TOKEN_FILE, 'utf8');
      const tokens = JSON.parse(tokenContent);
      
      console.log('   File exists: ✅');
      console.log(`   Access token: ${tokens.access_token ? 'present' : 'missing'}`);
      console.log(`   Refresh token: ${tokens.refresh_token ? 'present' : 'missing'}`);
      console.log(`   Token type: ${tokens.token_type || 'not set'}`);
      console.log(`   Expires in: ${tokens.expires_in || 'not set'} seconds`);
      
      if (tokens.timestamp) {
        const tokenAge = Date.now() - tokens.timestamp;
        const tokenAgeMinutes = Math.floor(tokenAge / 1000 / 60);
        console.log(`   Token age: ${tokenAgeMinutes} minutes`);
      }
    } catch (error) {
      console.log(`   File exists but parse error: ${error.message}`);
    }
  } else {
    console.log('   File exists: ❌ (no tokens stored)');
  }
  
  // Check environment sessions
  console.log('');
  console.log('🌍 Environment Sessions:');
  const envSessions = Object.keys(process.env).filter(key => key.startsWith('OAUTH_SESSION_'));
  if (envSessions.length > 0) {
    console.log(`   Count: ${envSessions.length}`);
    envSessions.forEach((envKey, index) => {
      const state = envKey.replace('OAUTH_SESSION_', '');
      console.log(`   Env session ${index + 1}: ${state}`);
    });
  } else {
    console.log('   Count: 0 (none found)');
  }
  
  // Check global sessions
  console.log('');
  console.log('🌐 Global Sessions:');
  if (globalThis.oauthSessions) {
    const globalStates = Array.from(globalThis.oauthSessions.keys());
    console.log(`   Count: ${globalStates.length}`);
    if (globalStates.length > 0) {
      console.log(`   States: [${globalStates.join(', ')}]`);
    }
  } else {
    console.log('   Global storage: not initialized');
  }
  
  console.log('');
  console.log('📁 Log Files:');
  console.log(`   Live test log: ${fs.existsSync(LIVE_LOG_FILE) ? '✅' : '❌'} ${LIVE_LOG_FILE}`);
  console.log(`   Session file: ${fs.existsSync(SESSION_FILE) ? '✅' : '❌'} ${SESSION_FILE}`);
  console.log(`   Token file: ${fs.existsSync(TOKEN_FILE) ? '✅' : '❌'} ${TOKEN_FILE}`);
  
  console.log('');
  console.log('====================================================');
}

checkLiveSessions();