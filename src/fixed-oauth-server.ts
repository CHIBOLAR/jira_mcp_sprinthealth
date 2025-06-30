import express from 'express';
import cors from 'cors';
import { JiraOAuthManager } from './auth/oauth-manager.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Initialize OAuth manager
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
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// OAuth callback - this is the key endpoint!
app.get('/oauth/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    res.status(400).send(`
      <html><body>
        <h1>🔐 OAuth Error</h1>
        <p>Error: ${error}</p>
        <script>setTimeout(() => window.close(), 3000);</script>
      </body></html>
    `);
    return;
  }

  if (!code || !state) {
    res.status(400).send(`
      <html><body>
        <h1>🔐 OAuth Error</h1>
        <p>Missing authorization code or state.</p>
        <script>setTimeout(() => window.close(), 3000);</script>
      </body></html>
    `);
    return;
  }

  try {
    // Exchange code for tokens
    const tokens = await oauthManager.exchangeCodeForToken(code as string, state as string);
    
    console.log('✅ OAuth successful!');
    
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
