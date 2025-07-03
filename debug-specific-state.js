#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Debug Specific OAuth State
 * Analyzes the exact state parameter from your OAuth callback
 */

const TARGET_STATE = 'i2kK4arE2-5Hsvi39LxDj3frU4xJ0laYQjno0a5Qrvc';

function debugSpecificState() {
  console.log('🔍 ============ SPECIFIC STATE ANALYSIS ============');
  console.log(`Target state: ${TARGET_STATE}`);
  console.log('');

  // Check all possible session storage locations
  const sessionLocations = [
    {
      name: 'Default tmp',
      path: '/tmp/jira-oauth-sessions.json'
    },
    {
      name: 'Smithery specific',
      path: '/tmp/smithery-jira-oauth-sessions.json'
    },
    {
      name: 'Persistent home',
      path: `${process.env.HOME || '/tmp'}/.jira-mcp/oauth-sessions.json`
    }
  ];

  let foundSession = null;
  let foundLocation = null;

  sessionLocations.forEach(location => {
    console.log(`📁 Checking: ${location.name}`);
    console.log(`   Path: ${location.path}`);
    
    if (fs.existsSync(location.path)) {
      try {
        const content = fs.readFileSync(location.path, 'utf8');
        const sessions = JSON.parse(content);
        
        console.log(`   ✅ File exists`);
        console.log(`   📊 Sessions found: ${Object.keys(sessions).length}`);
        
        if (sessions[TARGET_STATE]) {
          foundSession = sessions[TARGET_STATE];
          foundLocation = location.name;
          console.log(`   🎯 TARGET STATE FOUND!`);
        } else {
          console.log(`   ❌ Target state not found`);
          console.log(`   📝 Available states: [${Object.keys(sessions).join(', ')}]`);
        }
      } catch (error) {
        console.log(`   ❌ Parse error: ${error.message}`);
      }
    } else {
      console.log(`   ❌ File does not exist`);
    }
    console.log('');
  });

  // Check environment variables
  console.log('🌍 Environment Variables:');
  const envKey = `OAUTH_SESSION_${TARGET_STATE}`;
  if (process.env[envKey]) {
    try {
      const envSession = JSON.parse(process.env[envKey]);
      console.log('   ✅ Found in environment variables');
      if (!foundSession) {
        foundSession = envSession;
        foundLocation = 'Environment Variables';
      }
    } catch (error) {
      console.log('   ❌ Environment parse error:', error.message);
    }
  } else {
    console.log('   ❌ Not found in environment variables');
  }
  console.log('');

  // Analyze found session
  if (foundSession) {
    console.log('🎯 ============ SESSION ANALYSIS ============');
    console.log(`Found in: ${foundLocation}`);
    console.log(`State: ${TARGET_STATE}`);
    console.log(`Email: ${foundSession.userEmail || 'not set'}`);
    console.log(`Redirect URI: ${foundSession.redirectUri}`);
    console.log(`Code Verifier: ${foundSession.codeVerifier ? 'present' : 'missing'}`);
    console.log(`Timestamp: ${new Date(foundSession.timestamp).toISOString()}`);
    
    const age = Date.now() - foundSession.timestamp;
    const ageMinutes = Math.floor(age / 1000 / 60);
    console.log(`Age: ${ageMinutes} minutes (${age}ms)`);
    
    const TTL = 15 * 60 * 1000; // 15 minutes
    const isExpired = age > TTL;
    console.log(`Expired: ${isExpired ? 'YES' : 'NO'} (TTL: 15 minutes)`);
    
    console.log('');
    console.log('🔍 ============ REDIRECT URI ANALYSIS ============');
    console.log(`Session redirect URI: ${foundSession.redirectUri}`);
    console.log(`Callback redirect URI: http://localhost:3000/oauth/callback`);
    console.log(`URIs match: ${foundSession.redirectUri === 'http://localhost:3000/oauth/callback' ? 'YES' : 'NO'}`);
    
    if (foundSession.redirectUri !== 'http://localhost:3000/oauth/callback') {
      console.log('');
      console.log('🚨 ROOT CAUSE IDENTIFIED:');
      console.log('   The session was created with a different redirect URI');
      console.log('   than where the OAuth callback is being handled.');
      console.log('');
      console.log('   This explains the "Invalid or expired OAuth state parameter" error.');
      console.log('   The OAuth manager is looking for sessions with the callback redirect URI');
      console.log('   but the session was stored with a different redirect URI.');
    }
    
  } else {
    console.log('❌ ============ SESSION NOT FOUND ============');
    console.log('The target state was not found in any storage location.');
    console.log('This confirms the session persistence issue.');
    console.log('');
    console.log('Possible causes:');
    console.log('1. Session expired and was cleaned up');
    console.log('2. Session stored in different process/container');
    console.log('3. Session storage failed during creation');
    console.log('4. Different redirect URI used during creation vs callback');
  }
  
  console.log('');
  console.log('============================================');
}

debugSpecificState();