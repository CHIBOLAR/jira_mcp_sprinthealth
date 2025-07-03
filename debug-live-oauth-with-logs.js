#!/usr/bin/env node

import dotenv from 'dotenv';
import { JiraOAuthManager } from './dist/src/auth/oauth-manager.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Load environment variables
dotenv.config();

/**
 * Live OAuth Flow Debugger with Comprehensive Logging
 * This simulates the exact live issue with full visibility
 */
async function debugLiveOAuthWithLogs() {
  const logFile = path.join(os.tmpdir(), 'oauth-debug-live.log');
  
  function log(message) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}\n`;
    console.log(`🔍 ${message}`);
    fs.appendFileSync(logFile, logEntry);
  }

  log('='.repeat(80));
  log('LIVE OAUTH DEBUGGING WITH COMPREHENSIVE LOGGING');
  log('='.repeat(80));
  
  try {
    // Clear previous logs
    if (fs.existsSync(logFile)) {
      fs.unlinkSync(logFile);
    }
    
    log('STEP 1: Environment Analysis');
    log(`Process PID: ${process.pid}`);
    log(`Node version: ${process.version}`);
    log(`NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
    log(`SMITHERY_HOSTNAME: ${process.env.SMITHERY_HOSTNAME || 'not set'}`);
    log(`SERVER_URL: ${process.env.SERVER_URL || 'not set'}`);
    log(`OAUTH_REDIRECT_URI: ${process.env.OAUTH_REDIRECT_URI || 'not set'}`);
    log(`OAUTH_CLIENT_ID: ${process.env.OAUTH_CLIENT_ID ? 'present' : 'missing'}`);
    log(`OAUTH_CLIENT_SECRET: ${process.env.OAUTH_CLIENT_SECRET ? 'present' : 'missing'}`);
    
    log('STEP 2: Simulating MCP Server Initialization (start_oauth tool call)');
    
    const config = {
      companyUrl: 'https://codegenie.atlassian.net',
      userEmail: 'chiragbolarworkspace@gmail.com',
      authMethod: 'oauth'
    };
    
    log(`Company URL: ${config.companyUrl}`);
    log(`User email: ${config.userEmail}`);
    
    // Simulate the exact OAuth configuration used in production
    const oauthConfig = {
      clientId: process.env.OAUTH_CLIENT_ID || process.env.JIRA_OAUTH_CLIENT_ID,
      clientSecret: process.env.OAUTH_CLIENT_SECRET || process.env.JIRA_OAUTH_CLIENT_SECRET,
      redirectUri: process.env.OAUTH_REDIRECT_URI || 
        (process.env.SMITHERY_HOSTNAME ? `https://${process.env.SMITHERY_HOSTNAME}/oauth/callback` : 
         `${process.env.SERVER_URL || 'http://localhost:3000'}/oauth/callback`)
    };
    
    log('OAuth Configuration:');
    log(`  Client ID: ${oauthConfig.clientId ? 'present' : 'missing'}`);
    log(`  Client Secret: ${oauthConfig.clientSecret ? 'present' : 'missing'}`);
    log(`  Redirect URI: ${oauthConfig.redirectUri}`);
    
    log('STEP 3: Creating OAuth Manager Instance');
    const oauthManager1 = JiraOAuthManager.getInstance(config.companyUrl, oauthConfig);
    log('OAuth manager created for URL generation');
    
    log('STEP 4: Generating OAuth URL (start_oauth tool execution)');
    const { authUrl, state } = oauthManager1.generateAuthUrl(config.userEmail);
    
    log(`Generated state: ${state}`);
    log(`Generated auth URL (first 100 chars): ${authUrl.substring(0, 100)}...`);
    
    // Check session storage immediately after generation
    log('STEP 5: Immediate Session Storage Check');
    
    function checkSessionStorage(stepName) {
      log(`${stepName} - Session Storage Status:`);
      
      // Memory store
      const memorySize = JiraOAuthManager.sessionStore ? JiraOAuthManager.sessionStore.size : 0;
      const memoryStates = JiraOAuthManager.sessionStore ? Array.from(JiraOAuthManager.sessionStore.keys()) : [];
      log(`  Memory store: ${memorySize} sessions, states: [${memoryStates.join(', ')}]`);
      
      // Environment variables
      const envSessions = Object.keys(process.env).filter(key => key.startsWith('OAUTH_SESSION_'));
      const envStates = envSessions.map(key => key.replace('OAUTH_SESSION_', ''));
      log(`  Environment: ${envSessions.length} sessions, states: [${envStates.join(', ')}]`);
      
      // Global storage
      const globalSessions = globalThis.oauthSessions;
      const globalSize = globalSessions ? globalSessions.size : 0;
      const globalStates = globalSessions ? Array.from(globalSessions.keys()) : [];
      log(`  Global: ${globalSize} sessions, states: [${globalStates.join(', ')}]`);
      
      // File storage
      const sessionFile = path.join(os.tmpdir(), 'jira-oauth-sessions.json');
      if (fs.existsSync(sessionFile)) {
        try {
          const fileContent = fs.readFileSync(sessionFile, 'utf8');
          const fileSessions = JSON.parse(fileContent);
          const fileStates = Object.keys(fileSessions);
          log(`  File: ${fileStates.length} sessions, states: [${fileStates.join(', ')}]`);
        } catch (error) {
          log(`  File: Error reading - ${error.message}`);
        }
      } else {
        log('  File: No session file exists');
      }
      
      // Check if our specific state exists
      const stateExists = memoryStates.includes(state) || envStates.includes(state) || globalStates.includes(state);
      log(`  Our state (${state}) exists: ${stateExists ? 'YES' : 'NO'}`);
    }
    
    checkSessionStorage('After URL Generation');
    
    log('STEP 6: Simulating Time Delay (user clicks OAuth link and completes authentication)');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    checkSessionStorage('After Time Delay');
    
    log('STEP 7: Simulating OAuth Callback (separate process/container)');
    
    // This is the critical part - simulating what happens when Atlassian redirects back
    // In Smithery, this might be a different process/container
    
    log('Creating NEW OAuth manager instance for callback (simulating separate process)');
    
    // Simulate potentially different environment in callback
    const callbackOAuthManager = JiraOAuthManager.getInstance(
      process.env.JIRA_URL || 'https://codegenie.atlassian.net',
      {
        clientId: process.env.OAUTH_CLIENT_ID || process.env.JIRA_OAUTH_CLIENT_ID,
        clientSecret: process.env.OAUTH_CLIENT_SECRET || process.env.JIRA_OAUTH_CLIENT_SECRET,
        redirectUri: process.env.OAUTH_REDIRECT_URI || 
          (process.env.SMITHERY_HOSTNAME ? `https://${process.env.SMITHERY_HOSTNAME}/oauth/callback` : 
           `${process.env.SERVER_URL || 'http://localhost:3000'}/oauth/callback`)
      }
    );
    
    const sameInstance = oauthManager1 === callbackOAuthManager;
    log(`Same OAuth manager instance: ${sameInstance ? 'YES' : 'NO'}`);
    
    checkSessionStorage('In Callback Process');
    
    log('STEP 8: Attempting Token Exchange (where the error occurs)');
    
    const simulatedCode = 'test_authorization_code_12345';
    const simulatedState = state; // Same state from URL generation
    
    log(`Callback parameters: code=${simulatedCode.substring(0, 10)}..., state=${simulatedState}`);
    
    try {
      // This will either succeed or fail with the "Invalid or expired OAuth state parameter" error
      const tokenResponse = await callbackOAuthManager.exchangeCodeForToken(simulatedCode, simulatedState);
      log('TOKEN EXCHANGE: SUCCESS');
      log('OAuth flow completed successfully');
    } catch (error) {
      log('TOKEN EXCHANGE: FAILED');
      log(`Error: ${error.message}`);
      
      if (error.message.includes('Invalid or expired OAuth state parameter')) {
        log('ROOT CAUSE CONFIRMED: Session state not found during callback');
        
        // Final diagnostic check
        log('FINAL DIAGNOSTIC: Checking all possible session sources');
        checkSessionStorage('Final Diagnostic');
        
        // Check if sessions were cleaned up too early
        log('Checking for auto-cleanup interference...');
        
        // Check TTL
        const SESSION_TTL = 15 * 60 * 1000; // 15 minutes
        const currentTime = Date.now();
        log(`Current time: ${currentTime}`);
        log(`Session TTL: ${SESSION_TTL}ms (${SESSION_TTL / 1000 / 60} minutes)`);
        
        // Check if there are any sessions in environment that weren't cleaned
        const envSessions = Object.keys(process.env).filter(key => key.startsWith('OAUTH_SESSION_'));
        log(`Remaining environment sessions: ${envSessions.length}`);
        
        envSessions.forEach(envKey => {
          try {
            const sessionData = JSON.parse(process.env[envKey]);
            const age = currentTime - sessionData.timestamp;
            log(`  ${envKey}: age=${age}ms, expired=${age > SESSION_TTL}`);
          } catch (error) {
            log(`  ${envKey}: parse error - ${error.message}`);
          }
        });
      }
    }
    
    log('STEP 9: Analysis Complete');
    log(`Debug log saved to: ${logFile}`);
    
  } catch (error) {
    log(`FATAL ERROR: ${error.message}`);
    log(`Stack trace: ${error.stack}`);
  }
  
  // Show log file contents
  console.log('\n📋 COMPLETE DEBUG LOG:');
  console.log('='.repeat(50));
  if (fs.existsSync(logFile)) {
    const logContents = fs.readFileSync(logFile, 'utf8');
    console.log(logContents);
  }
  console.log('='.repeat(50));
  console.log(`📁 Full log saved to: ${logFile}`);
}

// Run the live OAuth debugger
debugLiveOAuthWithLogs().catch(console.error);