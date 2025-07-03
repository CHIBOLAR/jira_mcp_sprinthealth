#!/usr/bin/env node

import dotenv from 'dotenv';
import { JiraOAuthManager } from './dist/src/auth/oauth-manager.js';

// Load environment variables
dotenv.config();

async function generateOAuthUrl() {
  console.log('🔧 Generating fresh OAuth URL...');
  console.log('');
  
  try {
    // Clear any existing sessions first
    const fs = await import('fs');
    const sessionFile = '/tmp/jira-oauth-sessions.json';
    
    if (fs.existsSync(sessionFile)) {
      fs.unlinkSync(sessionFile);
      console.log('🧹 Cleared existing OAuth sessions');
    }
    
    // Initialize OAuth manager with exact same config as server
    const oauthManager = new JiraOAuthManager(
      process.env.JIRA_COMPANY_URL || process.env.JIRA_URL || 'https://codegenie.atlassian.net/',
      {
        clientId: process.env.OAUTH_CLIENT_ID || process.env.CLIENT_ID || 'EiNH97tfyGyZPlaMfrteiKeW2TXWVxFf',
        clientSecret: process.env.OAUTH_CLIENT_SECRET || process.env.CLIENT_SECRET,
        redirectUri: process.env.OAUTH_REDIRECT_URI || process.env.REDIRECT_URI || `http://localhost:${process.env.PORT || 3000}/oauth/callback`
      }
    );
    
    // Generate auth URL
    const { authUrl, state } = oauthManager.generateAuthUrl(process.env.USER_EMAIL);
    
    console.log('✅ OAuth URL generated successfully!');
    console.log('');
    console.log('🔗 **OAuth URL:**');
    console.log(authUrl);
    console.log('');
    console.log(`🏷️ **State:** ${state}`);
    console.log('');
    console.log('📋 **Instructions:**');
    console.log('1. Start the OAuth server: npm run dev-oauth-fixed');
    console.log('2. Open the OAuth URL above in your browser');
    console.log('3. Complete the Atlassian login');
    console.log('4. You should see a success page');
    console.log('');
    
    // Show session file for debugging
    console.log('📁 Session saved to:', sessionFile);
    
  } catch (error) {
    console.error('❌ Failed to generate OAuth URL:');
    console.error(error.message);
    process.exit(1);
  }
}

generateOAuthUrl();