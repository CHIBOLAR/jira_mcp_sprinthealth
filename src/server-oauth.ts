#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import { JiraOAuthManager } from './auth/oauth-manager.js';
import { JiraApiClient } from './jira-client.js';

// Enhanced configuration schema with OAuth support
export const configSchema = z.object({
  companyUrl: z.string().describe("Your company's Jira URL (e.g., https://company.atlassian.net)"),
  userEmail: z.string().describe("Your work email address"),
  authMethod: z.enum(["oauth", "token"]).default("oauth").describe("OAuth (recommended) or API Token (fallback)"),
  jiraApiToken: z.string().optional().describe("Only needed if OAuth fails"),
  oauthClientId: z.string().optional().describe("OAuth Client ID from Atlassian Developer Console"),
  oauthClientSecret: z.string().optional().describe("OAuth Client Secret (server-side only)")
});

export type Config = z.infer<typeof configSchema>;

interface AuthenticatedSession {
  config: Config;
  accessToken?: string;
  refreshToken?: string | undefined;
  expiresAt?: number | undefined;
  isAuthenticated: boolean;
  jiraClient?: JiraApiClient;
}

/**
 * Enhanced Jira MCP Server with OAuth Browser Authentication
 * Supports individual user authentication without admin-level tokens
 */
class JiraMCPServerWithOAuth {  private mcpServer: McpServer;
  private sessions = new Map<string, AuthenticatedSession>();
  private oauthManager?: JiraOAuthManager;
  private serverUrl: string;

  constructor(serverUrl: string) {
    this.serverUrl = serverUrl;
    this.mcpServer = new McpServer({
      name: 'jira-mcp-oauth',
      version: '4.0.0',
    });

    this.setupTools();
    this.setupErrorHandling();
  }

  /**
   * Initialize OAuth manager when config is available
   */
  private initializeOAuth(config: Config): void {
    if (!this.oauthManager) {
      this.oauthManager = new JiraOAuthManager(config.companyUrl);
    }
  }

  /**
   * Get or create session for current request
   */
  private getSession(sessionId: string, config?: Config): AuthenticatedSession {
    if (!this.sessions.has(sessionId) && config) {
      this.sessions.set(sessionId, {
        config,
        isAuthenticated: false
      });
    }
    
    return this.sessions.get(sessionId) || {
      config: config!,
      isAuthenticated: false
    };
  }
  /**
   * Check if session needs authentication
   */
  private async checkAuthentication(session: AuthenticatedSession): Promise<boolean> {
    if (!session.accessToken) return false;
    
    // Check if token is expired
    if (session.expiresAt && Date.now() >= session.expiresAt) {
      if (session.refreshToken) {
        return await this.refreshAccessToken(session);
      }
      return false;
    }

    // Validate token with Jira
    if (session.jiraClient) {
      return await session.jiraClient.isAuthenticated();
    }

    return false;
  }

  /**
   * Refresh access token using refresh token
   */
  private async refreshAccessToken(session: AuthenticatedSession): Promise<boolean> {
    if (!this.oauthManager || !session.refreshToken) return false;

    try {
      const tokenResponse = await this.oauthManager.refreshToken(session.refreshToken);
      session.accessToken = tokenResponse.access_token;
      session.refreshToken = tokenResponse.refresh_token || session.refreshToken || undefined;
      session.expiresAt = tokenResponse.expires_in 
        ? Date.now() + (tokenResponse.expires_in * 1000)
        : undefined;

      // Update Jira client with new token
      if (session.jiraClient) {
        session.jiraClient.updateAccessToken(tokenResponse.access_token);
      }

      return true;
    } catch (error) {
      console.error('Failed to refresh token:', error);
      return false;
    }
  }
  /**
   * Setup all MCP tools with OAuth authentication
   */
  private setupTools(): void {
    // OAuth initiation tool
    this.mcpServer.tool('initiate_oauth', 
      'Initiate OAuth authentication flow for Jira access',
      {},
      async (params, extra) => {
        try {
          const sessionId = extra?.sessionId || 'default';
          const session = this.getSession(sessionId);
          
          if (!session.config) {
            return {
              content: [{
                type: 'text' as const,
                text: '❌ **Configuration Required**\n\nPlease provide your Jira configuration first.'
              }]
            };
          }

          this.initializeOAuth(session.config);
          
          // Check if already authenticated
          if (await this.checkAuthentication(session)) {
            return {
              content: [{
                type: 'text' as const,
                text: '✅ **Already Authenticated**\n\nYou are already authenticated with Jira. You can use other tools directly.'
              }]
            };
          }

          // Generate OAuth URL
          const { authUrl, state } = this.oauthManager!.generateAuthUrl(session.config.userEmail);
          
          return {
            content: [{
              type: 'text' as const,
              text: '🔐 **OAuth Authentication Required**\n\n' +
                    '**Please follow these steps:**\n\n' +
                    '1. Click the link below to authenticate with Jira\n' +
                    '2. Complete the authorization in your browser\n' +
                    '3. The browser will redirect back automatically\n\n' +
                    `**OAuth URL:** [Authenticate with Jira](${authUrl})\n\n` +
                    '**State Token:** `' + state + '`\n\n' +
                    '💡 After authentication, use `complete_oauth` with the authorization code.'
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text' as const,
              text: '❌ **OAuth Initialization Failed**\n\n' + (error as Error).message
            }]
          };
        }
      }
    );
    // OAuth completion tool
    this.mcpServer.tool('complete_oauth',
      'Complete OAuth authentication with authorization code',
      {
        authCode: z.string().describe('Authorization code from OAuth redirect'),
        state: z.string().describe('State parameter from OAuth initiation')
      },
      async ({ authCode, state }, extra) => {
        try {
          const sessionId = extra?.sessionId || 'default';
          const session = this.getSession(sessionId);

          if (!this.oauthManager) {
            return {
              content: [{
                type: 'text' as const,
                text: '❌ **OAuth Not Initialized**\n\nPlease run `initiate_oauth` first.'
              }]
            };
          }

          // Exchange code for tokens
          const tokenResponse = await this.oauthManager.exchangeCodeForToken(authCode, state);
          
          // Store tokens in session
          session.accessToken = tokenResponse.access_token;
          session.refreshToken = tokenResponse.refresh_token || undefined;
          session.expiresAt = tokenResponse.expires_in 
            ? Date.now() + (tokenResponse.expires_in * 1000)
            : undefined;
          session.isAuthenticated = true;

          // Initialize Jira client with OAuth token
          session.jiraClient = new JiraApiClient({
            baseUrl: session.config.companyUrl,
            email: session.config.userEmail,
            authMethod: 'oauth',
            accessToken: tokenResponse.access_token
          });

          // Test the connection
          const connectionTest = await session.jiraClient.testConnection();
          
          return {
            content: [{
              type: 'text' as const,
              text: '✅ **OAuth Authentication Successful!**\n\n' +
                    '🔗 **Connected to:** ' + session.config.companyUrl + '\n' +
                    '👤 **User:** ' + session.config.userEmail + '\n' +
                    '🔑 **Token Type:** ' + tokenResponse.token_type + '\n' +
                    '⏰ **Expires:** ' + (session.expiresAt ? new Date(session.expiresAt).toLocaleString() : 'Never') + '\n\n' +
                    '🚀 **You can now use all Jira tools!**\n\n' +
                    '**Available Tools:**\n' +
                    '• `jira_get_issue` - Get issue details\n' +
                    '• `jira_search` - Search issues with JQL\n' +
                    '• `list_projects` - List accessible projects\n' +
                    '• `test_jira_connection` - Test connection'
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text' as const,
              text: '❌ **OAuth Completion Failed**\n\n' + (error as Error).message
            }]
          };
        }
      }
    );
    // Connection test tool (now with real API calls)
    this.mcpServer.tool('test_jira_connection', 
      'Test connection to Jira instance and verify credentials',
      {},
      async (params, extra) => {
        try {
          const sessionId = extra?.sessionId || 'default';
          const session = this.getSession(sessionId);

          if (!session.isAuthenticated) {
            return {
              content: [{
                type: 'text' as const,
                text: '🔐 **Authentication Required**\n\n' +
                      'Please run `initiate_oauth` to authenticate with Jira first.'
              }]
            };
          }

          if (!await this.checkAuthentication(session)) {
            return {
              content: [{
                type: 'text' as const,
                text: '🔄 **Authentication Expired**\n\n' +
                      'Please re-authenticate using `initiate_oauth`.'
              }]
            };
          }

          // Test actual connection
          const isConnected = await session.jiraClient!.testConnection();
          
          if (isConnected) {
            return {
              content: [{
                type: 'text' as const,
                text: '✅ **Jira Connection Successful!**\n\n' +
                      '🔗 **Connected to:** ' + session.config.companyUrl + '\n' +
                      '👤 **Authenticated as:** ' + session.config.userEmail + '\n' +
                      '🔑 **Auth Method:** OAuth 2.0\n' +
                      '📡 **API Access:** ✅ Verified\n\n' +
                      '🚀 **Ready for Jira operations!**'
              }]
            };
          } else {
            return {
              content: [{
                type: 'text' as const,
                text: '❌ **Connection Failed**\n\n' +
                      'Unable to connect to Jira. Please check your configuration and re-authenticate.'
              }]
            };
          }
        } catch (error) {
          return {
            content: [{
              type: 'text' as const,
              text: '❌ **Connection Test Failed**\n\n' + (error as Error).message
            }]
          };
        }
      }
    );
    // Get issue tool (with real API calls)
    this.mcpServer.tool('jira_get_issue', 
      'Get details of a specific Jira issue',
      {
        issueKey: z.string().describe('Jira issue key (e.g., "PROJ-123")')
      },
      async ({ issueKey }, extra) => {
        try {
          const sessionId = extra?.sessionId || 'default';
          const session = this.getSession(sessionId);

          if (!session.isAuthenticated || !await this.checkAuthentication(session)) {
            return {
              content: [{
                type: 'text' as const,
                text: '🔐 **Authentication Required**\n\n' +
                      'Please authenticate using `initiate_oauth` first.'
              }]
            };
          }

          // Make actual API call
          const issueData = await session.jiraClient!.makeRequest(`/rest/api/3/issue/${issueKey}`);
          
          return {
            content: [{
              type: 'text' as const,
              text: '📋 **Issue Details: ' + issueKey + '**\n\n' +
                    '**Title:** ' + issueData.fields.summary + '\n' +
                    '**Status:** ' + issueData.fields.status.name + '\n' +
                    '**Type:** ' + issueData.fields.issuetype.name + '\n' +
                    '**Reporter:** ' + (issueData.fields.reporter?.displayName || 'Unknown') + '\n' +
                    '**Assignee:** ' + (issueData.fields.assignee?.displayName || 'Unassigned') + '\n' +
                    '**Project:** ' + issueData.fields.project.name + '\n' +
                    '**Created:** ' + new Date(issueData.fields.created).toLocaleDateString() + '\n\n' +
                    '**Description:**\n' + (issueData.fields.description?.content?.[0]?.content?.[0]?.text || 'No description') + '\n\n' +
                    '**Issue URL:** [' + issueKey + '](' + session.config.companyUrl + '/browse/' + issueKey + ')'
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text' as const,
              text: '❌ **Failed to Get Issue**\n\n' + (error as Error).message
            }]
          };
        }
      }
    );
    // Search issues tool (with real API calls)
    this.mcpServer.tool('jira_search', 
      'Search Jira issues using JQL',
      {
        jql: z.string().describe('JQL query string (e.g., "project = PROJ AND status = Open")'),
        maxResults: z.number().optional().default(10).describe('Maximum number of results to return')
      },
      async ({ jql, maxResults }, extra) => {
        try {
          const sessionId = extra?.sessionId || 'default';
          const session = this.getSession(sessionId);

          if (!session.isAuthenticated || !await this.checkAuthentication(session)) {
            return {
              content: [{
                type: 'text' as const,
                text: '🔐 **Authentication Required**\n\n' +
                      'Please authenticate using `initiate_oauth` first.'
              }]
            };
          }

          // Make actual search API call
          const searchResults = await session.jiraClient!.searchIssues(jql, { maxResults });
          
          if (searchResults.issues.length === 0) {
            return {
              content: [{
                type: 'text' as const,
                text: '🔍 **Search Results**\n\n' +
                      '**Query:** ' + jql + '\n' +
                      '**Results:** 0 issues found\n\n' +
                      'Try adjusting your JQL query.'
              }]
            };
          }

          const issueList = searchResults.issues.map(issue => 
            `• **${issue.key}** - ${issue.fields.summary} (${issue.fields.status.name})`
          ).join('\n');

          return {
            content: [{
              type: 'text' as const,
              text: '🔍 **Search Results**\n\n' +
                    '**Query:** ' + jql + '\n' +
                    '**Found:** ' + searchResults.total + ' issues (showing ' + searchResults.issues.length + ')\n\n' +
                    '**Issues:**\n' + issueList + '\n\n' +
                    '💡 Use `jira_get_issue` with any issue key for more details.'
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text' as const,
              text: '❌ **Search Failed**\n\n' + (error as Error).message
            }]
          };
        }
      }
    );
    // List projects tool (with real API calls)
    this.mcpServer.tool('list_projects', 
      'List all accessible Jira projects',
      {},
      async (params, extra) => {
        try {
          const sessionId = extra?.sessionId || 'default';
          const session = this.getSession(sessionId);

          if (!session.isAuthenticated || !await this.checkAuthentication(session)) {
            return {
              content: [{
                type: 'text' as const,
                text: '🔐 **Authentication Required**\n\n' +
                      'Please authenticate using `initiate_oauth` first.'
              }]
            };
          }

          // Make actual API call to get projects
          const projects = await session.jiraClient!.getProjects();
          
          if (projects.length === 0) {
            return {
              content: [{
                type: 'text' as const,
                text: '📋 **No Projects Found**\n\n' +
                      'You don\'t have access to any Jira projects, or none exist in this instance.'
              }]
            };
          }

          const projectList = projects.map(project => 
            `• **${project.key}** - ${project.name} (${project.projectTypeKey})`
          ).join('\n');

          return {
            content: [{
              type: 'text' as const,
              text: '📋 **Accessible Projects**\n\n' +
                    '**Found:** ' + projects.length + ' projects\n\n' +
                    '**Projects:**\n' + projectList + '\n\n' +
                    '💡 Use project keys in JQL queries with `jira_search`.'
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text' as const,
              text: '❌ **Failed to List Projects**\n\n' + (error as Error).message
            }]
          };
        }
      }
    );
    // Help tool
    this.mcpServer.tool('help', 
      'Get help and information about available tools',
      {},
      async () => {
        return {
          content: [{
            type: 'text' as const,
            text: '🚀 **Jira MCP Server with OAuth - Help Guide**\n\n' +
                  '📋 **Available Tools:**\n\n' +
                  '1. **initiate_oauth** - Start OAuth authentication\n' +
                  '2. **complete_oauth** - Complete OAuth with auth code\n' +
                  '3. **test_jira_connection** - Test authenticated connection\n' +
                  '4. **jira_get_issue** - Get detailed issue information\n' +
                  '5. **jira_search** - Search issues with JQL\n' +
                  '6. **list_projects** - List accessible projects\n' +
                  '7. **help** - This help guide\n\n' +
                  '🔐 **Getting Started:**\n' +
                  '1. Ensure your Jira configuration is set\n' +
                  '2. Run `initiate_oauth` to get authentication URL\n' +
                  '3. Complete authentication in browser\n' +
                  '4. Use `complete_oauth` with the auth code\n' +
                  '5. Use other tools once authenticated\n\n' +
                  '💡 **Features:**\n' +
                  '• Browser-based OAuth 2.0 authentication\n' +
                  '• No admin-level API tokens required\n' +
                  '• Automatic token refresh\n' +
                  '• Real-time Jira API integration\n' +
                  '• Session-based authentication\n\n' +
                  '🔄 **Token expires automatically and will be refreshed as needed.**'
          }]
        };
      }
    );
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
   * Parse configuration from Smithery
   */
  private parseSmitheryConfig(configParam?: string): Config | null {
    if (!configParam) return null;
    
    try {
      const decoded = Buffer.from(configParam, 'base64').toString('utf-8');
      const parsed = JSON.parse(decoded);
      return configSchema.parse(parsed);
    } catch (error) {
      console.error('Failed to parse Smithery config:', error);
      return null;
    }
  }
  /**
   * Start HTTP server with OAuth support
   */
  async startHttpServer(): Promise<void> {
    const PORT = parseInt(process.env.PORT || '3000');
    const HOST = '0.0.0.0';

    const app = express();
    app.use(cors());
    app.use(express.json());

    const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

    // Health check
    app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'jira-mcp-oauth',
        version: '4.0.0',
        features: ['oauth', 'browser-auth', 'real-api']
      });
    });

    // OAuth callback endpoint
    app.get('/oauth/callback', async (req, res) => {
      const { code, state, error } = req.query;

      if (error) {
        res.send(`
          <html>
            <head><title>OAuth Error</title></head>
            <body>
              <h1>❌ OAuth Authentication Failed</h1>
              <p><strong>Error:</strong> ${error}</p>
              <p>Please try again.</p>
            </body>
          </html>
        `);
        return;
      }
      if (code && state) {
        res.send(`
          <html>
            <head><title>OAuth Success</title></head>
            <body>
              <h1>✅ Authentication Successful!</h1>
              <p>Authorization code received. Please copy the details below:</p>
              <div style="background: #f5f5f5; padding: 10px; margin: 10px 0; font-family: monospace;">
                <strong>Authorization Code:</strong><br>
                <code>${code}</code><br><br>
                <strong>State:</strong><br>
                <code>${state}</code>
              </div>
              <p>Use these values with the <code>complete_oauth</code> tool in your MCP client.</p>
              <p>You can close this window.</p>
            </body>
          </html>
        `);
      } else {
        res.send(`
          <html>
            <head><title>OAuth Error</title></head>
            <body>
              <h1>❌ Invalid OAuth Response</h1>
              <p>Missing authorization code or state parameter.</p>
            </body>
          </html>
        `);
      }
    });

    // Enhanced config schema for OAuth
    app.get('/config-schema', (req, res) => {
      res.json({
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
            enum: ["oauth", "token"],
            default: "oauth",
            description: "OAuth (recommended) or API Token (fallback)"
          },
          jiraApiToken: {
            type: "string",
            description: "Only needed if OAuth fails"
          },
          oauthClientId: {
            type: "string",
            description: "OAuth Client ID from Atlassian Developer Console (optional - uses default if not provided)"
          }
        },
        required: ["companyUrl", "userEmail"]
      });
    });
    // MCP endpoint with session management
    app.all('/mcp', async (req, res) => {
      try {
        const configParam = req.query.config as string | undefined;
        const smitheryConfig = this.parseSmitheryConfig(configParam);
        
        const sessionId = req.headers['mcp-session-id'] as string || 
                         'session-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

        if (smitheryConfig) {
          const session = this.getSession(sessionId, smitheryConfig);
          this.sessions.set(sessionId, session);
        }

        let transport: StreamableHTTPServerTransport;

        if (transports[sessionId]) {
          transport = transports[sessionId];
        } else {
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => sessionId,
          });

          transports[sessionId] = transport;

          transport.onclose = () => {
            if (transports[sessionId]) {
              delete transports[sessionId];
              this.sessions.delete(sessionId);
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
    // Welcome page
    app.get('/', (req, res) => {
      res.send(`
        <!DOCTYPE html>
        <html>
          <head><title>Jira MCP Server with OAuth</title></head>
          <body>
            <h1>🚀 Jira MCP Server with OAuth Authentication</h1>
            <p>✅ Server is running with OAuth browser authentication!</p>
            
            <h2>🔐 Authentication Flow:</h2>
            <ol>
              <li>Configure your Jira settings in MCP client</li>
              <li>Use <code>initiate_oauth</code> tool to start authentication</li>
              <li>Complete authentication in browser (redirects to /oauth/callback)</li>
              <li>Use <code>complete_oauth</code> with authorization code</li>
              <li>Access all Jira tools with authenticated session</li>
            </ol>

            <h2>🛠️ Available Tools:</h2>
            <ul>
              <li><strong>initiate_oauth</strong> - Start OAuth flow</li>
              <li><strong>complete_oauth</strong> - Complete authentication</li>
              <li><strong>test_jira_connection</strong> - Test authenticated connection</li>
              <li><strong>jira_get_issue</strong> - Get issue details</li>
              <li><strong>jira_search</strong> - Search with JQL</li>
              <li><strong>list_projects</strong> - List accessible projects</li>
              <li><strong>help</strong> - Usage guide</li>
            </ul>

            <h2>🔗 Endpoints:</h2>
            <ul>
              <li><strong>GET /health</strong> - Health check</li>
              <li><strong>GET /oauth/callback</strong> - OAuth redirect handler</li>
              <li><strong>ALL /mcp</strong> - MCP protocol endpoint</li>
            </ul>

            <p><strong>Server URL:</strong> ${this.serverUrl}</p>
          </body>
        </html>
      `);
    });
    return new Promise((resolve) => {
      app.listen(PORT, HOST, () => {
        console.log('\n🚀 Jira MCP Server with OAuth Started!');
        console.log('📍 Server URL: http://' + HOST + ':' + PORT);
        console.log('🔗 MCP Endpoint: http://' + HOST + ':' + PORT + '/mcp');
        console.log('🔐 OAuth Callback: http://' + HOST + ':' + PORT + '/oauth/callback');
        console.log('\n⚙️ Features:');
        console.log('   ✅ Browser-based OAuth 2.0 authentication');
        console.log('   ✅ No admin-level API tokens required');
        console.log('   ✅ Automatic token refresh');
        console.log('   ✅ Real Jira API integration');
        console.log('   ✅ Session-based authentication');
        console.log('\n✅ Ready for production use!');
        resolve();
      });
    });
  }
}

// Start server
const SERVER_URL = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3000}`;
const server = new JiraMCPServerWithOAuth(SERVER_URL);
server.startHttpServer().catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});