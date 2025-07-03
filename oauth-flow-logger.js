#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * OAuth Flow Logger - Comprehensive logging for debugging OAuth issues
 */
class OAuthFlowLogger {
  constructor() {
    this.logFile = path.join(os.tmpdir(), 'oauth-flow-debug.log');
    this.sessionFile = path.join(os.tmpdir(), 'jira-oauth-sessions.json');
    this.startLogging();
  }

  startLogging() {
    this.log('='.repeat(80));
    this.log('OAUTH FLOW LOGGER STARTED');
    this.log(`Timestamp: ${new Date().toISOString()}`);
    this.log(`Process PID: ${process.pid}`);
    this.log(`Node Version: ${process.version}`);
    this.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    this.log('='.repeat(80));
  }

  log(message) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}\n`;
    
    // Log to console
    console.log(`🔍 ${message}`);
    
    // Log to file
    try {
      fs.appendFileSync(this.logFile, logEntry);
    } catch (error) {
      console.warn('Failed to write to log file:', error.message);
    }
  }

  logEnvironment() {
    this.log('ENVIRONMENT ANALYSIS:');
    this.log(`  SMITHERY_HOSTNAME: ${process.env.SMITHERY_HOSTNAME || 'not set'}`);
    this.log(`  SERVER_URL: ${process.env.SERVER_URL || 'not set'}`);
    this.log(`  OAUTH_REDIRECT_URI: ${process.env.OAUTH_REDIRECT_URI || 'not set'}`);
    this.log(`  OAUTH_CLIENT_ID: ${process.env.OAUTH_CLIENT_ID ? 'present' : 'missing'}`);
    this.log(`  OAUTH_CLIENT_SECRET: ${process.env.OAUTH_CLIENT_SECRET ? 'present' : 'missing'}`);
    this.log(`  START_HTTP_SERVER: ${process.env.START_HTTP_SERVER || 'not set'}`);
  }

  logSessionState() {
    this.log('SESSION STORAGE ANALYSIS:');
    
    // Check session file
    if (fs.existsSync(this.sessionFile)) {
      try {
        const fileContent = fs.readFileSync(this.sessionFile, 'utf8');
        const sessions = JSON.parse(fileContent);
        const sessionStates = Object.keys(sessions);
        this.log(`  File sessions: ${sessionStates.length} found`);
        this.log(`  File states: [${sessionStates.join(', ')}]`);
        
        // Log session details
        sessionStates.forEach((state, index) => {
          const session = sessions[state];
          this.log(`  Session ${index + 1}:`);
          this.log(`    State: ${state}`);
          this.log(`    Email: ${session.userEmail || 'not set'}`);
          this.log(`    Redirect URI: ${session.redirectUri}`);
          this.log(`    Timestamp: ${new Date(session.timestamp).toISOString()}`);
          this.log(`    Age: ${Date.now() - session.timestamp}ms`);
        });
      } catch (error) {
        this.log(`  File session read error: ${error.message}`);
      }
    } else {
      this.log('  Session file does not exist');
    }

    // Check environment variables
    const envSessions = Object.keys(process.env).filter(key => key.startsWith('OAUTH_SESSION_'));
    this.log(`  Environment sessions: ${envSessions.length} found`);
    envSessions.forEach((envKey, index) => {
      const state = envKey.replace('OAUTH_SESSION_', '');
      this.log(`  Env session ${index + 1}: ${state}`);
    });

    // Check global storage
    if (globalThis.oauthSessions) {
      const globalStates = Array.from(globalThis.oauthSessions.keys());
      this.log(`  Global sessions: ${globalStates.length} found`);
      this.log(`  Global states: [${globalStates.join(', ')}]`);
    } else {
      this.log('  Global sessions: not initialized');
    }
  }

  logOAuthUrlGeneration(state, authUrl) {
    this.log('OAUTH URL GENERATION:');
    this.log(`  Generated state: ${state}`);
    this.log(`  Auth URL length: ${authUrl.length} characters`);
    this.log(`  Auth URL domain: ${new URL(authUrl).hostname}`);
    this.log(`  Redirect URI in URL: ${new URL(authUrl).searchParams.get('redirect_uri')}`);
  }

  logOAuthCallback(code, state, error) {
    this.log('OAUTH CALLBACK RECEIVED:');
    this.log(`  Code: ${code ? `present (${code.substring(0, 10)}...)` : 'missing'}`);
    this.log(`  State: ${state || 'missing'}`);
    this.log(`  Error: ${error || 'none'}`);
    this.log(`  Callback timestamp: ${new Date().toISOString()}`);
  }

  logSessionLookup(state, found, searchMethod) {
    this.log('SESSION LOOKUP ATTEMPT:');
    this.log(`  Looking for state: ${state}`);
    this.log(`  Search method: ${searchMethod}`);
    this.log(`  Result: ${found ? 'FOUND' : 'NOT FOUND'}`);
  }

  logTokenExchange(success, error) {
    this.log('TOKEN EXCHANGE RESULT:');
    this.log(`  Success: ${success}`);
    if (error) {
      this.log(`  Error: ${error}`);
    }
  }

  getLogPath() {
    return this.logFile;
  }

  readLogs() {
    try {
      if (fs.existsSync(this.logFile)) {
        return fs.readFileSync(this.logFile, 'utf8');
      }
      return 'No logs found';
    } catch (error) {
      return `Error reading logs: ${error.message}`;
    }
  }

  clearLogs() {
    try {
      if (fs.existsSync(this.logFile)) {
        fs.unlinkSync(this.logFile);
        this.log('Previous logs cleared');
      }
    } catch (error) {
      this.log(`Error clearing logs: ${error.message}`);
    }
  }
}

// Export singleton logger
const logger = new OAuthFlowLogger();

export default logger;

// If run directly, show current session state
if (import.meta.url === `file://${process.argv[1]}`) {
  logger.logEnvironment();
  logger.logSessionState();
  
  console.log('\n📋 OAUTH FLOW LOGGER READY');
  console.log(`📁 Log file: ${logger.getLogPath()}`);
  console.log('🔍 Use this logger in your OAuth flow to track session state');
}