#!/usr/bin/env node

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

/**
 * Production OAuth MCP Server - CommonJS Version
 * Like Official Atlassian Implementation
 */
class ProductionOAuthServer {
  constructor(port = 3000) {
    this.port = port;
    this.app = express();
    this.tokenStorage = new Map();
    this.pendingAuth = new Map();
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use(cors({ origin: '*' }));
  }

  setupRoutes() {
    // MCP Metadata Discovery - Like Official Implementation
    this.app.get('/.well-known/mcp-configuration', (req, res) => {
      res.json({
        name: 'jira-dashboard-mcp-enhanced',
        version: '2.0.0',
        description: 'Enhanced Jira Sprint Dashboard with OAuth like Atlassian',
        oauth: {
          authorization_endpoint: 'https://auth.atlassian.com/authorize',
          token_endpoint: 'https://auth.atlassian.com/oauth/token',
          registration_endpoint: 'https://auth.atlassian.com/oauth2/register',
          scopes_supported: ['read:jira-work', 'write:jira-work', 'offline_access'],
          grant_types_supported: ['authorization_code', 'refresh_token'],
          response_types_supported: ['code'],
          code_challenge_methods_supported: ['S256']
        },
        capabilities: {
          tools: true,
          dynamic_client_registration: true,
          automatic_token_refresh: true,
          dashboard_generation: true,
          sprint_analytics: true
        },
        endpoints: {
          authorize: '/oauth/authorize',
          callback: '/oauth/callback',
          sse: '/v1/sse',
          health: '/health'
        }
      });
    });

    // OAuth Authorization Flow
    this.app.get('/oauth/authorize', (req, res) => {
      console.log('🔐 Starting OAuth authorization flow...');
      
      const state = crypto.randomBytes(32).toString('hex');
      const codeVerifier = crypto.randomBytes(32).toString('base64url');
      const codeChallenge = crypto
        .createHash('sha256')
        .update(codeVerifier)
        .digest('base64url');

      // Store PKCE parameters
      this.pendingAuth.set(state, { 
        codeVerifier, 
        timestamp: Date.now() 
      });

      const clientId = process.env.ATLASSIAN_OAUTH_CLIENT_ID || 'demo-jira-mcp-client';

      const authUrl = new URL('https://auth.atlassian.com/authorize');
      authUrl.searchParams.set('audience', 'api.atlassian.com');
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('scope', 'read:jira-work write:jira-work offline_access');
      authUrl.searchParams.set('redirect_uri', `http://localhost:${this.port}/oauth/callback`);
      authUrl.searchParams.set('state', state);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('prompt', 'consent');
      authUrl.searchParams.set('code_challenge', codeChallenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');

      console.log(`🌐 Redirecting to: ${authUrl.toString()}`);
      res.redirect(authUrl.toString());
    });

    // OAuth Callback - Demo Implementation
    this.app.get('/oauth/callback', async (req, res) => {
      const { code, state, error } = req.query;

      if (error) {
        console.error('❌ OAuth Error:', error);
        return this.renderError(res, `OAuth Error: ${error}`);
      }

      const authData = this.pendingAuth.get(state);
      if (!authData) {
        console.error('❌ Invalid state parameter');
        return this.renderError(res, 'Invalid state parameter');
      }

      console.log('✅ OAuth callback received, processing...');

      // Simulate successful token exchange (for demo)
      const mockTokens = this.generateMockTokens();
      const userId = this.extractUserIdFromToken(mockTokens.access_token);
      
      this.tokenStorage.set(userId, {
        accessToken: mockTokens.access_token,
        refreshToken: mockTokens.refresh_token,
        expiresAt: Date.now() + (mockTokens.expires_in * 1000),
        cloudId: 'demo-cloud-id',
        userId
      });

      this.pendingAuth.delete(state);
      console.log(`✅ OAuth flow completed for user: ${userId}`);

      this.renderSuccess(res, userId);
    });

    // Server-Sent Events for MCP Communication
    this.app.get('/v1/sse', (req, res) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');

      console.log('🔄 SSE connection established');

      const authHeader = req.headers.authorization;
      let userId = 'demo-user';
      
      if (authHeader && authHeader.startsWith('Bearer ')) {
        userId = this.extractUserIdFromToken(authHeader.substring(7));
      }

      const tokens = this.tokenStorage.get(userId);
      if (!tokens || this.isTokenExpired(tokens)) {
        res.write(`event: error\ndata: ${JSON.stringify({ 
          error: 'Authentication required',
          action: 'redirect',
          url: '/oauth/authorize'
        })}\n\n`);
        return res.end();
      }

      // Send ready event
      res.write(`event: ready\ndata: ${JSON.stringify({ 
        status: 'connected',
        capabilities: ['sprint_analytics', 'dashboard_generation'],
        user: userId,
        timestamp: new Date().toISOString()
      })}\n\n`);

      // Keep connection alive
      const keepAlive = setInterval(() => {
        res.write(`event: ping\ndata: ${JSON.stringify({ timestamp: Date.now() })}\n\n`);
      }, 30000);

      req.on('close', () => {
        console.log('🔄 SSE connection closed');
        clearInterval(keepAlive);
      });
    });

    // Health Check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        oauth: 'enabled',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        connected_users: this.tokenStorage.size,
        uptime: process.uptime()
      });
    });

    // Start OAuth Flow
    this.app.get('/start-auth', (req, res) => {
      res.redirect('/oauth/authorize');
    });

    // Test page
    this.app.get('/', (req, res) => {
      res.send(`
        <html>
          <head><title>Jira MCP OAuth Server</title></head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 50px;">
            <h1>🚀 Jira MCP OAuth Server</h1>
            <p>OAuth authentication server for Jira MCP integration with Claude Desktop.</p>
            <h2>Available Endpoints:</h2>
            <ul>
              <li><a href="/health">Health Check</a></li>
              <li><a href="/.well-known/mcp-configuration">MCP Configuration</a></li>
              <li><a href="/oauth/authorize">Start OAuth Flow</a></li>
              <li><a href="/v1/sse">SSE Endpoint</a></li>
            </ul>
            <h2>Status:</h2>
            <p>Connected users: ${this.tokenStorage.size}</p>
            <p>Server uptime: ${Math.floor(process.uptime())} seconds</p>
          </body>
        </html>
      `);
    });
  }

  generateMockTokens() {
    const mockAccessToken = jwt.sign({
      sub: 'demo-user@company.com',
      iss: 'https://auth.atlassian.com',
      aud: 'api.atlassian.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
      scope: 'read:jira-work write:jira-work offline_access'
    }, 'demo-secret');

    return {
      access_token: mockAccessToken,
      refresh_token: crypto.randomBytes(32).toString('hex'),
      expires_in: 3600,
      token_type: 'Bearer'
    };
  }

  extractUserIdFromToken(token) {
    try {
      const payload = jwt.decode(token);
      return payload?.sub || 'demo-user@company.com';
    } catch {
      return 'demo-user@company.com';
    }
  }

  isTokenExpired(tokens) {
    return Date.now() >= tokens.expiresAt - 60000;
  }

  renderSuccess(res, userId) {
    res.send(`
      <html>
        <head>
          <title>OAuth Success</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; text-align: center; padding: 50px; background: #f8f9fa;">
          <div style="max-width: 500px; margin: 0 auto; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
            <h1 style="color: #00875A; margin-bottom: 20px;">✅ Authentication Successful!</h1>
            <p style="font-size: 18px; color: #172B4D; margin-bottom: 30px;">
              Your Jira integration is now connected to Claude.
            </p>
            
            <div style="background: #F4F5F7; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0 0 15px 0; font-weight: 600; color: #172B4D;">🎯 What you can do now:</p>
              <div style="text-align: left;">
                <p style="margin: 8px 0; color: #5E6C84;">📊 Generate sprint dashboards</p>
                <p style="margin: 8px 0; color: #5E6C84;">📈 Analyze team velocity</p>
                <p style="margin: 8px 0; color: #5E6C84;">🎯 Track sprint goals</p>
                <p style="margin: 8px 0; color: #5E6C84;">🚫 Monitor blocked issues</p>
              </div>
            </div>
            
            <div style="background: #E3FCEF; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0; color: #00875A; font-size: 14px;">
                <strong>User:</strong> ${userId}
              </p>
            </div>
            
            <p style="color: #6B778C; font-size: 14px;">
              You can close this window and return to Claude Desktop.
            </p>
          </div>
          
          <script>
            // Notify parent window (Claude Desktop) of success
            if (window.opener) {
              window.opener.postMessage({ 
                type: 'OAUTH_SUCCESS', 
                data: { userId: '${userId}', status: 'connected' }
              }, '*');
            }
            
            // Auto-close after 5 seconds
            setTimeout(() => {
              try { 
                window.close(); 
              } catch(e) {
                console.log('Could not close window automatically');
              }
            }, 5000);
          </script>
        </body>
      </html>
    `);
  }

  renderError(res, errorMessage) {
    res.status(400).send(`
      <html>
        <head>
          <title>OAuth Error</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; text-align: center; padding: 50px; background: #f8f9fa;">
          <div style="max-width: 500px; margin: 0 auto; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
            <h1 style="color: #DE350B; margin-bottom: 20px;">❌ Authentication Failed</h1>
            <p style="color: #172B4D; margin-bottom: 20px;">${errorMessage}</p>
            <button onclick="window.close()" style="background: #0052CC; color: white; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer;">
              Close Window
            </button>
          </div>
        </body>
      </html>
    `);
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.port, () => {
        console.log(`\n🚀 Production OAuth MCP Server Started!`);
        console.log(`📡 Server: http://localhost:${this.port}`);
        console.log(`🔐 OAuth: http://localhost:${this.port}/oauth/authorize`);
        console.log(`💚 Health: http://localhost:${this.port}/health`);
        console.log(`📋 Config: http://localhost:${this.port}/.well-known/mcp-configuration`);
        console.log(`\n✨ Ready for Claude Desktop integration!\n`);
        resolve();
      });

      this.server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          console.error(`❌ Port ${this.port} is already in use`);
        }
        reject(error);
      });
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
      console.log('🛑 OAuth server stopped');
    }
  }
}

// Start server if run directly
if (require.main === module) {
  const port = parseInt(process.env.PORT || '3000');
  const server = new ProductionOAuthServer(port);
  
  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down OAuth server...');
    server.stop();
    process.exit(0);
  });

  server.start().catch(console.error);
}

module.exports = { ProductionOAuthServer };
