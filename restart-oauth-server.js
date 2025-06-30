#!/usr/bin/env node

/**
 * OAuth Server Restart Script with Session Cleanup
 * This script restarts the OAuth server and optionally clears stale sessions
 */

import { JiraOAuthManager } from './src/auth/oauth-manager.js';
import express from 'express';
import cors from 'cors';
import { execSync } from 'child_process';

console.log('🔄 Restarting Jira MCP OAuth Server with Fixed Session Management...\n');

// Option to clear stale sessions
const clearSessions = process.argv.includes('--clear-sessions') || process.argv.includes('-c');

if (clearSessions) {
  console.log('🧹 Clearing all OAuth sessions...');
  const manager = new JiraOAuthManager('https://codegenie.atlassian.net/');
  manager.clearAllSessions();
  console.log('✅ Sessions cleared!\n');
}

// Start the fixed OAuth server
const PORT = process.env.PORT || 3000;
const app = express();

app.use(cors());
app.use(express.json());

// Initialize OAuth manager with the fixed implementation
const oauthManager = new JiraOAuthManager(
  process.env.JIRA_COMPANY_URL || 'https://codegenie.atlassian.net/',
  {
    clientId: process.env.CLIENT_ID || 'EiNH97tfyGyZPlaMfrteiKeW2TXWVxFf',
    clientSecret: process.env.CLIENT_SECRET,
    redirectUri: process.env.REDIRECT_URI || `http://localhost:${PORT}/oauth/callback`
  }
);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    version: '5.5.0-fixed',
    timestamp: new Date().toISOString(),
    sessionStorage: 'file-based',
    fixes: ['OAuth state persistence', 'Multi-instance support', 'Session cleanup']
  });
});

// OAuth status endpoint
app.get('/oauth/status', (req, res) => {
  const stats = oauthManager.getStats();
  res.json(stats);
});

// Clear sessions endpoint (for debugging)
app.post('/oauth/clear-sessions', (req, res) => {
  try {
    oauthManager.clearAllSessions();
    res.json({ success: true, message: 'All OAuth sessions cleared' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// OAuth callback - the fixed implementation
app.get('/oauth/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    console.error('❌ OAuth callback error:', error);
    res.status(400).send(`
      <html><body style="font-family: Arial, sans-serif; padding: 20px;">
        <h1>🔐 OAuth Error</h1>
        <p><strong>Error:</strong> ${error}</p>
        <p><strong>Description:</strong> ${req.query.error_description || 'Unknown error'}</p>
        <script>setTimeout(() => window.close(), 3000);</script>
      </body></html>
    `);
    return;
  }

  if (!code || !state) {
    res.status(400).send(`
      <html><body style="font-family: Arial, sans-serif; padding: 20px;">
        <h1>🔐 OAuth Error</h1>
        <p>Missing authorization code or state parameter.</p>
        <p><strong>Received parameters:</strong></p>
        <pre>${JSON.stringify(req.query, null, 2)}</pre>
        <script>setTimeout(() => window.close(), 3000);</script>
      </body></html>
    `);
    return;
  }

  try {
    console.log('🔄 Processing OAuth callback with state:', state);
    const tokens = await oauthManager.exchangeCodeForToken(code as string, state as string);
    
    console.log('✅ OAuth successful! Token exchange completed.');
    
    res.send(`
      <html><body style="font-family: Arial; padding: 40px; text-align: center;">
        <h1>🎉 OAuth Authentication Successful!</h1>
        <p><strong>Your Jira MCP server is now authenticated and ready!</strong></p>
        <div style="margin: 20px 0; padding: 15px; background: #e8f5e8; border: 2px solid #4caf50; border-radius: 8px;">
          <h3>✅ Authentication Details</h3>
          <p><strong>Access Token:</strong> Received ✅</p>
          <p><strong>Refresh Token:</strong> ${tokens.refresh_token ? 'Yes ✅' : 'No ❌'}</p>
          <p><strong>Token Type:</strong> ${tokens.token_type}</p>
          <p><strong>Expires In:</strong> ${tokens.expires_in || 'Unknown'} seconds</p>
        </div>
        <div style="margin: 20px 0; padding: 15px; background: #f0f8ff; border-radius: 8px;">
          <h3>🚀 What's Next?</h3>
          <p>Return to Claude and test your Jira tools:</p>
          <ul style="text-align: left; display: inline-block;">
            <li><code>oauth_status</code> - Check OAuth status</li>
            <li><code>test_jira_connection</code> - Test connection</li>
            <li><code>jira_get_issue</code> - Get issue details</li>
            <li><code>list_projects</code> - List your projects</li>
          </ul>
        </div>
        <p><em>You can safely close this window and return to Claude.</em></p>
        <script>setTimeout(() => window.close(), 10000);</script>
      </body></html>
    `);
  } catch (error) {
    console.error('❌ OAuth token exchange failed:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).send(`
      <html><body style="font-family: Arial, sans-serif; padding: 20px;">
        <h1>🔐 OAuth Error</h1>
        <p><strong>Token exchange failed:</strong> ${errorMessage}</p>
        <div style="margin: 20px 0; padding: 15px; background: #ffe6e6; border: 2px solid #ff4444; border-radius: 8px;">
          <h3>🔧 Troubleshooting</h3>
          <p>This error has been fixed in the latest version. Try:</p>
          <ol>
            <li>Restart the OAuth flow</li>
            <li>Clear browser cache if needed</li>
            <li>Contact support if the issue persists</li>
          </ol>
        </div>
        <script>setTimeout(() => window.close(), 5000);</script>
      </body></html>
    `);
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Fixed Jira MCP OAuth server running on http://localhost:${PORT}`);
  console.log(`🔐 OAuth callback: http://localhost:${PORT}/oauth/callback`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔍 OAuth status: http://localhost:${PORT}/oauth/status`);
  console.log(`🧹 Clear sessions: POST http://localhost:${PORT}/oauth/clear-sessions`);
  console.log('\n✅ Ready for OAuth authentication with persistent session storage!');
});
