#!/usr/bin/env node

import dotenv from 'dotenv';
import { JiraOAuthManager } from './dist/src/auth/oauth-manager.js';

// Load environment variables
dotenv.config();

/**
 * Live Issue Debugger
 * Simulates the exact issue happening in production
 */
async function debugLiveIssue() {
  console.log('🔍 ============ LIVE ISSUE DEBUGGING ============');
  console.log('Analyzing why "Invalid or expired OAuth state parameter" still occurs...\n');
  
  try {
    // Simulate the exact flow that's failing
    console.log('📋 Step 1: Simulating OAuth URL Generation (start_oauth tool)...');
    
    // This simulates what happens when user runs start_oauth
    const config = {
      companyUrl: 'https://codegenie.atlassian.net',
      userEmail: 'chiragbolarworkspace@gmail.com',
      authMethod: 'oauth'
    };
    
    const oauthConfig = {
      clientId: process.env.OAUTH_CLIENT_ID || process.env.JIRA_OAUTH_CLIENT_ID,
      clientSecret: process.env.OAUTH_CLIENT_SECRET || process.env.JIRA_OAUTH_CLIENT_SECRET,
      redirectUri: process.env.OAUTH_REDIRECT_URI || `${process.env.SERVER_URL || 'http://localhost:3000'}/oauth/callback`,
    };
    
    console.log('🔧 OAuth Config:', {
      clientId: oauthConfig.clientId ? 'Present' : 'Missing',
      clientSecret: oauthConfig.clientSecret ? 'Present' : 'Missing', 
      redirectUri: oauthConfig.redirectUri
    });
    
    const oauthManager1 = JiraOAuthManager.getInstance(config.companyUrl, oauthConfig);
    const { authUrl, state } = oauthManager1.generateAuthUrl(config.userEmail);
    
    console.log(`✅ Generated OAuth URL with state: ${state}`);
    console.log(`🔗 Redirect URI in URL: ${oauthConfig.redirectUri}`);
    
    console.log('\n📋 Step 2: Simulating time delay (user completes OAuth in browser)...');
    // Simulate the time that passes while user completes OAuth
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('\n📋 Step 3: Simulating OAuth Callback (what happens when Atlassian redirects)...');
    
    // This simulates what happens in the OAuth callback
    const simulatedCode = 'test_authorization_code_123';
    const simulatedState = state; // Same state from URL generation
    
    console.log(`📝 Callback receives - Code: ${simulatedCode}, State: ${simulatedState}`);
    
    // Create a NEW OAuth manager instance (this is what happens in callback)
    // This simulates the potential issue - different process/instance
    console.log('\n🔧 Creating NEW OAuth manager for callback (simulating separate process)...');
    
    const callbackOAuthManager = JiraOAuthManager.getInstance(process.env.JIRA_URL || 'https://codegenie.atlassian.net', {
      clientId: process.env.OAUTH_CLIENT_ID || process.env.JIRA_OAUTH_CLIENT_ID,
      clientSecret: process.env.OAUTH_CLIENT_SECRET || process.env.JIRA_OAUTH_CLIENT_SECRET,
      redirectUri: process.env.OAUTH_REDIRECT_URI || `${process.env.SERVER_URL || 'http://localhost:3000'}/oauth/callback`,
    });
    
    const sameInstance = oauthManager1 === callbackOAuthManager;
    console.log(`🔗 Same OAuth manager instance: ${sameInstance}`);
    
    if (!sameInstance) {
      console.log('⚠️ POTENTIAL ISSUE: Different OAuth manager instances detected!');
      console.log('   This could indicate separate processes/containers in Smithery');
    }
    
    console.log('\n📋 Step 4: Testing session lookup...');
    
    // Try to find the session - this is where the error happens
    try {
      // This will trigger the detailed session lookup logging
      const tokenResponse = await callbackOAuthManager.exchangeCodeForToken(simulatedCode, simulatedState);
      console.log('✅ Token exchange would succeed');
    } catch (error) {
      console.log('❌ Token exchange failed with error:', error.message);
      
      if (error.message.includes('Invalid or expired OAuth state parameter')) {
        console.log('\n🎯 ROOT CAUSE IDENTIFIED: OAuth state parameter not found during callback');
        console.log('\nPossible reasons:');
        console.log('1. Sessions stored in URL generation process not accessible in callback process');
        console.log('2. Different OAuth manager instances not sharing session store');
        console.log('3. Session TTL expired between URL generation and callback');
        console.log('4. Environment variables different between processes');
        console.log('5. File/memory storage not persistent across Smithery containers');
      }
    }
    
    console.log('\n📋 Step 5: Analyzing session storage state...');
    
    // Check all storage locations
    const memoryStore = JiraOAuthManager.sessionStore || new Map();
    console.log(`💾 Memory store size: ${memoryStore.size}`);
    console.log(`💾 Memory sessions: [${Array.from(memoryStore.keys()).join(', ')}]`);
    
    const envSessions = Object.keys(process.env).filter(key => key.startsWith('OAUTH_SESSION_'));
    console.log(`🌍 Environment sessions: ${envSessions.length}`);
    console.log(`🌍 Environment states: [${envSessions.map(key => key.replace('OAUTH_SESSION_', '')).join(', ')}]`);
    
    const globalSessions = globalThis.oauthSessions;
    console.log(`🌐 Global sessions: ${globalSessions ? globalSessions.size : 0}`);
    
    // Check for session expiry
    const sessionAge = Date.now() - Date.now(); // This session was just created
    const TTL = 15 * 60 * 1000; // 15 minutes
    console.log(`⏰ Session age: ${sessionAge}ms (TTL: ${TTL}ms)`);
    
    console.log('\n📋 Step 6: Environment analysis...');
    console.log(`🌍 NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
    console.log(`🌍 SMITHERY_HOSTNAME: ${process.env.SMITHERY_HOSTNAME || 'not set'}`);
    console.log(`🌍 SERVER_URL: ${process.env.SERVER_URL || 'not set'}`);
    console.log(`🌍 Process PID: ${process.pid}`);
    
    console.log('\n🎯 RECOMMENDATIONS:');
    console.log('1. Check Smithery logs for "TOKEN EXCHANGE DEBUG START" messages');
    console.log('2. Look for "SESSION STORAGE DEBUG" during start_oauth execution');
    console.log('3. Verify same redirect URI in both URL generation and callback');
    console.log('4. Confirm OAuth manager singleton working across processes');
    console.log('5. Check if Smithery uses separate containers for MCP vs HTTP');
    
  } catch (error) {
    console.error('\n❌ Debug simulation failed:', error);
  }
}

// Run the live issue debugger
debugLiveIssue().catch(console.error);