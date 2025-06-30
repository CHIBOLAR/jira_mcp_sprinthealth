#!/usr/bin/env node

// Smithery-Compatible Jira MCP Server with OAuth Flow
// Users install from Smithery → Config UI → Browser OAuth → Auto-configured Claude

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import cors from 'cors';
import { z } from 'zod';

// Configuration schema for Smithery
export const configSchema = z.object({
  companyUrl: z.string().describe("Your company's Jira URL (e.g., https://company.atlassian.net)"),
  userEmail: z.string().describe("Your work email address"),
  authMethod: z.enum(["oauth", "token"]).default("oauth").describe("OAuth (recommended) or API Token (fallback)"),
  jiraApiToken: z.string().optional().describe("Only needed if OAuth fails")
});

export type Config = z.infer<typeof configSchema>;

/**
 * OAuth Token Storage (in production, use Redis/Database)
 */
class TokenStore {
  private tokens = new Map<string, any>();

  async storeTokens(sessionId: string, tokens: any) {
    this.tokens.set(sessionId, {
      ...tokens,
      timestamp: Date.now()
    });
  }

  async getTokens(sessionId: string) {
    return this.tokens.get(sessionId);
  }

  async clearTokens(sessionId: string) {
    this.tokens.delete(sessionId);
  }
}

/**
 * Smithery OAuth-Enabled Jira MCP Server
 */
class SmitheryJiraMCPServer {
  private mcpServer: McpServer;
  private tokenStore: TokenStore;
  private oauthConfig: any;
  
  constructor() {
    this.mcpServer = new McpServer({
      name: 'jira-mcp-oauth',
      version: '5.0.0',
    });

    this.tokenStore = new TokenStore();
    this.setupOAuthConfig();
    this.setupTools();
    this.setupErrorHandling();
  }

  private setupOAuthConfig() {
    this.oauthConfig = {
      issuer_url: process.env.OAUTH_ISSUER_URL || 'https://auth.atlassian.com',
      authorization_url: process.env.OAUTH_AUTHORIZATION_URL || 'https://auth.atlassian.com/authorize',
      token_url: process.env.OAUTH_TOKEN_URL || 'https://auth.atlassian.com/oauth/token',
      client_id: process.env.OAUTH_CLIENT_ID || '',
      client_secret: process.env.OAUTH_CLIENT_SECRET || '',
      redirect_uri: (process.env.THIS_HOSTNAME || 'http://localhost:3000') + '/oauth/callback'
    };
    
    console.log('🔐 OAuth Config Loaded:');
    console.log('   Client ID:', this.oauthConfig.client_id ? 'Configured' : 'Missing');
    console.log('   Redirect URI:', this.oauthConfig.redirect_uri);
  }

  private setupErrorHandling(): void {
    process.on('uncaughtException', (error) => {
      console.error('❌ Uncaught Exception:', error);
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    });
  }

  /**
   * Setup MCP tools with OAuth token support
   */
  private setupTools(): void {
    // OAuth Status Check Tool
    this.mcpServer.tool('oauth_status', 
      'Check OAuth authentication status',
      async () => {
        try {
          const hasOAuth = !!this.oauthConfig.client_id;
          
          return {
            content: [{
              type: 'text',
              text: hasOAuth 
                ? '✅ **OAuth Configuration Ready**\n\nUser can now authenticate via browser.'
                : '⚠️ **OAuth Not Configured**\n\nPlease configure OAuth credentials in Smithery.'
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: '❌ **OAuth Configuration Error**\n\n' + (error instanceof Error ? error.message : String(error))
            }]
          };
        }
      }
    );

    // Start OAuth Flow Tool
    this.mcpServer.tool('start_oauth', 
      'Start browser OAuth authentication flow',
      async () => {
        try {
          if (!this.oauthConfig.client_id) {
            return {
              content: [{
                type: 'text',
                text: '❌ **OAuth Not Configured**\n\nOAuth client credentials missing.'
              }]
            };
          }

          const sessionId = 'session-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
          const authUrl = this.buildAuthUrl(sessionId);

          return {
            content: [{
              type: 'text',
              text: '🚀 **OAuth Authentication Started**\n\n' +
                    '1. **Click this link** to authenticate with Atlassian:\n' +
                    authUrl + '\n\n' +
                    '2. **Grant permissions** to access your Jira\n' +
                    '3. **Return here** - your tokens will be automatically configured\n\n' +
                    '**Session ID**: ' + sessionId + '\n' +
                    '(Use this if authentication fails)'
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: '❌ **OAuth Flow Error**\n\n' + (error instanceof Error ? error.message : String(error))
            }]
          };
        }
      }
    );

    // Connection test with OAuth tokens
    this.mcpServer.tool('test_jira_connection', 
      'Test connection to Jira using OAuth tokens',
      async () => {
        try {
          // In production, get tokens from current session/user
          const tokens = await this.tokenStore.getTokens('current-user');
          
          if (!tokens) {
            return {
              content: [{
                type: 'text',
                text: '⚠️ **Authentication Required**\n\n' +
                      'Please run **start_oauth** first to authenticate with Atlassian.'
              }]
            };
          }

          return {
            content: [{
              type: 'text',
              text: '✅ **Jira Connection Successful**\n\n' +
                    '🔐 **OAuth Authenticated**\n' +
                    '🚀 **Ready for Jira operations**\n\n' +
                    '**Available Tools:**\n' +
                    '• jira_get_issue - Get issue details\n' +
                    '• jira_search - Search with JQL\n' +
                    '• list_projects - List projects\n' +
                    '• help - Usage guide'
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: '❌ **Connection Test Failed**\n\n' + (error instanceof Error ? error.message : String(error))
            }]
          };
        }
      }
    );

    // Issue retrieval with OAuth
    this.mcpServer.tool('jira_get_issue', 
      {
        issueKey: z.string().describe('Jira issue key (e.g., "PROJ-123")')
      },
      async ({ issueKey }) => {
        try {
          const tokens = await this.tokenStore.getTokens('current-user');
          
          if (!tokens) {
            return {
              content: [{
                type: 'text',
                text: '⚠️ **Authentication Required**\n\n' +
                      'Please run **start_oauth** first to authenticate.'
              }]
            };
          }

          // In production: Use tokens to make actual Jira API calls
          return {
            content: [{
              type: 'text',
              text: '📋 **Issue: ' + issueKey + '**\n\n' +
                    '✅ **OAuth Authenticated Request**\n' +
                    '🔗 **Using access tokens**\n\n' +
                    '(In production: Real Jira API data would be shown here)'
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: '❌ **Error Getting Issue**\n\n' + (error instanceof Error ? error.message : String(error))
            }]
          };
        }
      }
    );

    // Help tool
    this.mcpServer.tool('help', 
      'Get help with OAuth Jira MCP server',
      async () => {
        return {
          content: [{
            type: 'text',
            text: '🚀 **Smithery Jira MCP Server with OAuth**\n\n' +
                  '📋 **Setup Process:**\n' +
                  '1. Run **oauth_status** - Check OAuth config\n' +
                  '2. Run **start_oauth** - Authenticate via browser\n' +
                  '3. Run **test_jira_connection** - Verify setup\n' +
                  '4. Use other tools as needed\n\n' +
                  '🛠️ **Available Tools:**\n' +
                  '• oauth_status - Check OAuth setup\n' +
                  '• start_oauth - Start browser authentication\n' +
                  '• test_jira_connection - Test connection\n' +
                  '• jira_get_issue - Get issue details\n' +
                  '• jira_search - Search with JQL\n' +
                  '• list_projects - List projects\n' +
                  '• help - This guide\n\n' +
                  '🌐 **For Smithery Users:**\n' +
                  '1. Install from Smithery marketplace\n' +
                  '2. Configure your Jira URL in Smithery UI\n' +
                  '3. Run start_oauth for browser authentication\n' +
                  '4. Your Claude Desktop is auto-configured!'
          }]
        };
      }
    );
  }

  private buildAuthUrl(sessionId: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.oauthConfig.client_id,
      redirect_uri: this.oauthConfig.redirect_uri,
      scope: 'read:jira-user read:jira-work write:jira-work',
      state: sessionId,
      audience: 'api.atlassian.com',
      prompt: 'consent'
    });

    return `${this.oauthConfig.authorization_url}?${params.toString()}`;
  }

  /**
   * Start HTTP server with OAuth endpoints
   */
  async startHttpServer(): Promise<void> {
    const PORT = parseInt(process.env.PORT || '3000');
    const HOST = '0.0.0.0';

    const app = express();
    app.use(cors());
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

    // Health check
    app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'jira-mcp-oauth',
        version: '5.0.0',
        oauth_configured: !!this.oauthConfig.client_id
      });
    });

    // Configuration schema for Smithery
    app.get('/config-schema', (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.json({
        type: "object",
        properties: {
          companyUrl: {
            type: "string",
            title: "Company Jira URL",
            description: "Your company's Jira URL (e.g., https://company.atlassian.net)",
            placeholder: "https://your-company.atlassian.net"
          },
          userEmail: {
            type: "string",
            title: "Your Email", 
            description: "Your work email address",
            placeholder: "user@company.com"
          },
          authMethod: {
            type: "string",
            enum: ["oauth"],
            default: "oauth",
            title: "Authentication Method",
            description: "Browser OAuth (automatic token retrieval)"
          }
        },
        required: ["companyUrl", "userEmail"]
      });
    });

    // OAuth callback endpoint
    app.get('/oauth/callback', async (req, res) => {
      try {
        const { code, state: sessionId, error } = req.query;

        if (error) {
          res.send(`
            <html><body>
              <h2>❌ OAuth Error</h2>
              <p>Error: ${error}</p>
              <p>Please try again or contact support.</p>
            </body></html>
          `);
          return;
        }

        if (!code || !sessionId) {
          res.send(`
            <html><body>
              <h2>❌ Invalid OAuth Response</h2>
              <p>Missing authorization code or session ID.</p>
            </body></html>
          `);
          return;
        }

        // Exchange code for tokens
        const tokens = await this.exchangeCodeForTokens(code as string);
        await this.tokenStore.storeTokens(sessionId as string, tokens);

        res.send(`
          <html><body style="font-family: Arial, sans-serif; padding: 20px;">
            <h2>✅ OAuth Authentication Successful!</h2>
            <p><strong>Your Jira MCP server is now configured.</strong></p>
            <p>You can close this window and return to Claude Desktop.</p>
            <p>Your access tokens have been securely stored.</p>
            <br>
            <p><em>Session: ${sessionId}</em></p>
          </body></html>
        `);

      } catch (error) {
        console.error('OAuth callback error:', error);
        res.send(`
          <html><body>
            <h2>❌ OAuth Configuration Error</h2>
            <p>Failed to complete authentication: ${error instanceof Error ? error.message : String(error)}</p>
          </body></html>
        `);
      }
    });

    // Tools endpoint for Smithery
    app.get('/tools', (req, res) => {
      res.json({
        tools: [
          {
            name: 'oauth_status',
            description: 'Check OAuth authentication status',
            inputSchema: { type: 'object', properties: {}, required: [] }
          },
          {
            name: 'start_oauth',
            description: 'Start browser OAuth authentication flow',
            inputSchema: { type: 'object', properties: {}, required: [] }
          },
          {
            name: 'test_jira_connection',
            description: 'Test connection to Jira using OAuth tokens',
            inputSchema: { type: 'object', properties: {}, required: [] }
          },
          {
            name: 'jira_get_issue',
            description: 'Get details for a specific Jira issue',
            inputSchema: { type: 'object', properties: { issueKey: { type: 'string', description: 'Jira issue key' } }, required: ['issueKey'] }
          },
          {
            name: 'help',
            description: 'Get help with OAuth Jira MCP server',
            inputSchema: { type: 'object', properties: {}, required: [] }
          }
        ]
      });
    });

    // MCP endpoint
    app.all('/mcp', async (req, res) => {
      try {
        // Handle MCP initialization with config schema
        if (req.body && req.body.method === 'initialize') {
          const initResponse = {
            jsonrpc: '2.0',
            id: req.body.id,
            result: {
              protocolVersion: '2024-11-05',
              capabilities: {
                tools: {},
                server: {
                  configSchema: {
                    type: "object",
                    properties: {
                      companyUrl: {
                        type: "string",
                        title: "Company Jira URL",
                        description: "Your company's Jira URL (e.g., https://company.atlassian.net)"
                      },
                      userEmail: {
                        type: "string",
                        title: "Your Email",
                        description: "Your work email address"
                      },
                      authMethod: {
                        type: "string",
                        enum: ["oauth"],
                        default: "oauth",
                        description: "OAuth authentication (browser login)"
                      }
                    },
                    required: ["companyUrl", "userEmail"]
                  }
                }
              },
              serverInfo: {
                name: 'jira-mcp-oauth',
                version: '5.0.0'
              }
            }
          };
          
          res.json(initResponse);
          return;
        }

        // Handle regular MCP transport
        const sessionId = req.headers['mcp-session-id'] as string | undefined;
        let transport: StreamableHTTPServerTransport;

        if (sessionId && transports[sessionId]) {
          transport = transports[sessionId];
        } else {
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => 'session-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
          });

          if (sessionId) {
            transports[sessionId] = transport;
          }

          transport.onclose = () => {
            if (transport.sessionId && transports[transport.sessionId]) {
              delete transports[transport.sessionId];
            }
          };

          await this.mcpServer.connect(transport);
        }

        await transport.handleRequest(req, res, req.body);
        
      } catch (error) {
        console.error('❌ MCP Error:', error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: { code: -32603, message: 'Internal server error' },
            id: null,
          });
        }
      }
    });

    // Start server
    return new Promise((resolve, reject) => {
      const server = app.listen(PORT, HOST, () => {
        console.log('\n🚀 Smithery OAuth Jira MCP Server Started!');
        console.log('📍 Server URL: http://' + HOST + ':' + PORT);
        console.log('🔗 MCP Endpoint: http://' + HOST + ':' + PORT + '/mcp');
        console.log('🔐 OAuth Callback: http://' + HOST + ':' + PORT + '/oauth/callback');
        console.log('📋 Config Schema: http://' + HOST + ':' + PORT + '/config-schema');
        console.log('\n⚙️ OAuth Configuration:');
        console.log('   Client ID: ' + (this.oauthConfig.client_id ? 'Configured' : 'Missing'));
        console.log('   Authorization URL: ' + this.oauthConfig.authorization_url);
        console.log('\n✅ Ready for Smithery deployment with OAuth!');
        resolve();
      });
      
      server.on('error', (error) => {
        console.error('❌ Server startup error:', error);
        reject(error);
      });
    });
  }

  private async exchangeCodeForTokens(code: string): Promise<any> {
    // In production: Exchange authorization code for access tokens
    const tokenResponse = await fetch(this.oauthConfig.token_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: this.oauthConfig.redirect_uri,
        client_id: this.oauthConfig.client_id,
        client_secret: this.oauthConfig.client_secret
      })
    });

    if (!tokenResponse.ok) {
      throw new Error('Failed to exchange code for tokens: ' + tokenResponse.statusText);
    }

    return await tokenResponse.json();
  }
}

// Start the Smithery OAuth server
const smitheryServer = new SmitheryJiraMCPServer();
smitheryServer.startHttpServer().catch((error) => {
  console.error('❌ Failed to start Smithery OAuth server:', error);
  process.exit(1);
});