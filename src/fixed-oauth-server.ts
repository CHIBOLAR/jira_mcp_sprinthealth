import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { JiraOAuthManager } from './auth/oauth-manager.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Validate OAuth configuration
const validateOAuthConfig = () => {
  const requiredEnvVars = [
    'OAUTH_CLIENT_ID',
    'OAUTH_CLIENT_SECRET'
  ];
  
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:', missingVars);
    console.error('Please check your .env file and ensure these variables are set:');
    missingVars.forEach(varName => {
      console.error(`  - ${varName}`);
    });
    return false;
  }
  
  return true;
};

// Initialize OAuth manager
if (!validateOAuthConfig()) {
  console.error('❌ OAuth configuration validation failed. Exiting...');
  process.exit(1);
}

const oauthManager = new JiraOAuthManager(
  process.env.JIRA_COMPANY_URL || process.env.JIRA_URL || 'https://codegenie.atlassian.net/',
  {
    clientId: process.env.OAUTH_CLIENT_ID || process.env.CLIENT_ID || 'EiNH97tfyGyZPlaMfrteiKeW2TXWVxFf',
    clientSecret: process.env.OAUTH_CLIENT_SECRET || process.env.CLIENT_SECRET,
    redirectUri: process.env.OAUTH_REDIRECT_URI || process.env.REDIRECT_URI || `http://localhost:${PORT}/oauth/callback`
  }
);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Debug endpoint to check OAuth sessions
app.get('/debug/sessions', (req, res) => {
  try {
    const fs = require('fs');
    const sessionFile = '/tmp/jira-oauth-sessions.json';
    
    if (!fs.existsSync(sessionFile)) {
      res.json({ 
        status: 'no_sessions',
        message: 'No OAuth sessions found',
        sessionFile 
      });
      return;
    }
    
    const sessionData = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
    const sessions = Object.keys(sessionData).map(state => ({
      state,
      timestamp: sessionData[state].timestamp,
      age: Math.round((Date.now() - sessionData[state].timestamp) / 1000),
      userEmail: sessionData[state].userEmail,
      redirectUri: sessionData[state].redirectUri
    }));
    
    res.json({
      status: 'sessions_found',
      sessionCount: sessions.length,
      sessions,
      sessionFile
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

// OAuth callback - this is the key endpoint!
app.get('/oauth/callback', async (req, res) => {
  const { code, state, error } = req.query;

  console.log('🔄 OAuth callback received:');
  console.log('  Code:', code ? 'Present' : 'Missing');
  console.log('  State:', state);
  console.log('  Error:', error || 'None');

  if (error) {
    console.error('❌ OAuth error in callback:', error);
    res.status(400).send(`
      <html><body>
        <h1>🔐 OAuth Error</h1>
        <p>Error: ${error}</p>
        <p>Description: ${req.query.error_description || 'No description provided'}</p>
        <script>setTimeout(() => window.close(), 3000);</script>
      </body></html>
    `);
    return;
  }

  if (!code || !state) {
    console.error('❌ Missing code or state parameter');
    res.status(400).send(`
      <html><body>
        <h1>🔐 OAuth Error</h1>
        <p>Missing authorization code or state.</p>
        <p>Received parameters: ${JSON.stringify(req.query)}</p>
        <script>setTimeout(() => window.close(), 3000);</script>
      </body></html>
    `);
    return;
  }

  // Debug session lookup
  console.log('🔍 Looking up OAuth session for state:', state);
  
  // Create a new OAuth manager instance to ensure fresh session data
  const callbackOAuthManager = new JiraOAuthManager(
    process.env.JIRA_COMPANY_URL || process.env.JIRA_URL || 'https://codegenie.atlassian.net/',
    {
      clientId: process.env.OAUTH_CLIENT_ID || process.env.CLIENT_ID || 'EiNH97tfyGyZPlaMfrteiKeW2TXWVxFf',
      clientSecret: process.env.OAUTH_CLIENT_SECRET || process.env.CLIENT_SECRET,
      redirectUri: process.env.OAUTH_REDIRECT_URI || process.env.REDIRECT_URI || `http://localhost:${PORT}/oauth/callback`
    }
  );

  try {
    console.log('🔄 Starting token exchange...');
    console.log('📝 Code:', code);
    console.log('🏷️ State:', state);
    
    // Exchange code for tokens using the callback manager
    const tokens = await callbackOAuthManager.exchangeCodeForToken(code as string, state as string);
    
    console.log('✅ OAuth successful!');
    console.log('🔑 Access token received:', tokens.access_token ? 'Yes' : 'No');
    console.log('🔄 Refresh token received:', tokens.refresh_token ? 'Yes' : 'No');
    
    // ✅ CRITICAL FIX: Save tokens for MCP server to use
    const fs = await import('fs');
    const os = await import('os');
    const path = await import('path');
    
    const tokenFile = path.join(os.tmpdir(), 'jira-mcp-tokens.json');
    const tokenData = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
      token_type: tokens.token_type,
      timestamp: Date.now()
    };
    
    fs.writeFileSync(tokenFile, JSON.stringify(tokenData, null, 2));
    console.log('💾 Tokens saved to:', tokenFile);
    
    // Test the token immediately
    try {
      const testResponse = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`,
          'Accept': 'application/json'
        }
      });
      
      if (testResponse.ok) {
        const resources = await testResponse.json();
        console.log('✅ Token validation successful. Accessible resources:', resources.length);
      } else {
        console.warn('⚠️ Token validation failed:', testResponse.status, await testResponse.text());
      }
    } catch (testError) {
      console.warn('⚠️ Token validation error:', testError);
    }
    
    res.send(`
      <html><body style="font-family: Arial; padding: 40px; text-align: center;">
        <h1>🎉 OAuth Authentication Successful!</h1>
        <p>You can close this window and return to Claude.</p>
        <div style="margin: 20px 0; padding: 15px; background: #f0f8ff; border-radius: 8px;">
          <p><strong>✅ Access Token:</strong> Received</p>
          <p><strong>🔄 Refresh Token:</strong> ${tokens.refresh_token ? 'Yes' : 'No'}</p>
        </div>
        <script>setTimeout(() => window.close(), 5000);</script>
      </body></html>
    `);
  } catch (error) {
    console.error('❌ Token exchange failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).send(`
      <html><body>
        <h1>🔐 OAuth Error</h1>
        <p>Token exchange failed: ${errorMessage}</p>
        <script>setTimeout(() => window.close(), 3000);</script>
      </body></html>
    `);
  }
});

app.listen(PORT, () => {
  console.log(`🚀 OAuth server running on http://localhost:${PORT}`);
  console.log(`📍 Callback URL: http://localhost:${PORT}/oauth/callback`);
});

export default app;
