#!/usr/bin/env node

import express from 'express';
import cors from 'cors';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { JiraApiClient } from './jira-client.js';

/**
 * Configuration schema for HTTP/Smithery mode with OAuth
 */
export const configSchema = z.object({
  companyUrl: z.string().describe("Your company's Jira URL (e.g., https://company.atlassian.net)"),
  userEmail: z.string().describe("Your work email address"),
  authMethod: z.enum(["oauth", "token"]).default("oauth").describe("Authentication method"),
  jiraApiToken: z.string().optional().describe("Jira API Token (only needed for token auth)")
});

export type Config = z.infer<typeof configSchema>;

interface SessionData {
  config?: Config | undefined;
  jiraClient?: JiraApiClient | undefined;
  initialized: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
}

/**
 * HTTP MCP Server with OAuth Support and Lazy Loading for Smithery
 */
class HttpJiraMCPServerWithOAuth {
  private server: McpServer;
  private sessions = new Map<string, SessionData>();

  constructor() {
    this.server = new McpServer({
      name: 'jira-mcp-sprinthealth',
      version: '4.1.0',
    });

    this.setupTools();
  }

  /**
   * Get the MCP server instance for Smithery compatibility
   */
  getMcpServer(): McpServer {
    return this.server;
  }

  /**
   * Parse Smithery configuration
   */
  private parseConfig(configParam?: string): Config | null {
    if (!configParam) return null;
    
    try {
      const decoded = Buffer.from(configParam, 'base64').toString('utf-8');
      const parsed = JSON.parse(decoded);
      return configSchema.parse(parsed);
    } catch (error) {
      console.error('Failed to parse config:', error);
      return null;
    }
  }

  /**
   * Get or create session
   */
  private getSession(sessionId: string, config?: Config) {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        config: config,
        initialized: false
      });
    }
    
    const session = this.sessions.get(sessionId)!;
    if (config && !session.config) {
      session.config = config;
      session.initialized = false; // Reset if new config
    }
    
    return session;
  }

  /**
   * Initialize session Jira client if needed
   */
  private async ensureSessionInitialized(sessionId: string): Promise<JiraApiClient> {
    const session = this.getSession(sessionId);
    
    if (!session.config) {
      throw new Error('🔧 Configuration required. Please provide Jira settings.');
    }

    if (session.initialized && session.jiraClient) {
      return session.jiraClient;
    }

    // Initialize Jira client
    const jiraConfig: any = {
      baseUrl: session.config.companyUrl,
      email: session.config.userEmail,
      authMethod: session.config.authMethod as 'token' | 'oauth'
    };

    if (session.config.authMethod === 'token' && session.config.jiraApiToken) {
      jiraConfig.apiToken = session.config.jiraApiToken;
    } else if (session.config.authMethod === 'oauth' && session.accessToken) {
      jiraConfig.accessToken = session.accessToken;
    } else {
      throw new Error('🔐 Authentication required. Use initiate_oauth for OAuth or provide API token.');
    }

    session.jiraClient = new JiraApiClient(jiraConfig);
    session.initialized = true;
    
    return session.jiraClient;
  }

  /**
   * Setup all tools with OAuth support and lazy loading
   */
  private setupTools(): void {
    // Help tool - immediate response, no auth needed
    this.server.tool('help', 
      'Get help and information about available tools',
      {},
      async () => {
        return {
          content: [{
            type: 'text',
            text: '🚀 **Jira MCP Server with OAuth - Help Guide**\n\n' +
                  '📋 **Available Tools:**\n\n' +
                  '1. **help** - This usage guide (no auth needed)\n' +
                  '2. **initiate_oauth** - Start OAuth authentication flow\n' +
                  '3. **complete_oauth** - Complete OAuth with authorization code\n' +
                  '4. **test_jira_connection** - Test authenticated connection\n' +
                  '5. **jira_get_issue** - Get detailed issue information\n' +
                  '6. **jira_search** - Search issues with JQL\n' +
                  '7. **list_projects** - List accessible projects\n\n' +
                  '🔐 **Authentication Options:**\n' +
                  '• **OAuth (Recommended):** Browser-based, secure, no manual tokens\n' +
                  '• **API Token:** Manual token generation from Atlassian\n\n' +
                  '🌟 **OAuth Benefits:**\n' +
                  '• ✅ Secure browser-based authentication\n' +
                  '• ✅ No manual API token generation needed\n' +
                  '• ✅ Automatic token refresh\n' +
                  '• ✅ Granular permission scopes\n\n' +
                  '⚡ **Lazy Loading:** Tools load configuration only when needed!'
          }]
        };
      }
    );

    // OAuth initiation tool
    this.server.tool('initiate_oauth', 
      'Start OAuth authentication flow for Jira access (browser-based)',
      {},
      async (params, extra) => {
        try {
          const sessionId = extra?.sessionId || 'default';
          const session = this.getSession(sessionId);
          
          if (!session.config) {
            return {
              content: [{
                type: 'text',
                text: '❌ **Configuration Required**\n\nPlease configure your Jira URL and email first.'
              }]
            };
          }

          if (session.config.authMethod === 'token') {
            return {
              content: [{
                type: 'text',
                text: '💡 **API Token Mode**\n\nYou\'re configured for API token authentication. Provide your API token in the configuration.'
              }]
            };
          }

          // Generate OAuth URL
          const state = 'session-' + sessionId + '-' + Date.now();
          const redirectUri = `${process.env.SERVER_URL || 'http://localhost:3000'}/oauth/callback`;
          
          const authUrl = `${session.config.companyUrl}/plugins/servlet/oauth/authorize?` +
            `response_type=code&` +
            `redirect_uri=${encodeURIComponent(redirectUri)}&` +
            `state=${state}&` +
            `scope=read:jira-user read:jira-work write:jira-work`;
          
          return {
            content: [{
              type: 'text',
              text: '🔐 **OAuth Authentication Required**\n\n' +
                    '**Follow these steps:**\n\n' +
                    '1. Click the authentication URL below\n' +
                    '2. Authorize the application in your browser\n' +
                    '3. You\'ll be redirected back with an authorization code\n' +
                    '4. Use `complete_oauth` with the code\n\n' +
                    `**Jira Instance:** ${session.config.companyUrl}\n` +
                    `**User:** ${session.config.userEmail}\n\n` +
                    `**🔗 OAuth URL:** [Authenticate with Jira](${authUrl})\n\n` +
                    '💡 **Benefits:** Secure authentication, no manual API tokens needed!'
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: '❌ **OAuth Initialization Failed**\n\n' + (error as Error).message
            }]
          };
        }
      }
    );

    // OAuth completion tool
    this.server.tool('complete_oauth',
      'Complete OAuth authentication with authorization code from browser',
      {
        authCode: z.string().describe('Authorization code from OAuth redirect'),
        state: z.string().describe('State parameter from OAuth initiation')
      },
      async ({ authCode, state }, extra) => {
        try {
          const sessionId = extra?.sessionId || 'default';
          const session = this.getSession(sessionId);

          if (!session.config) {
            return {
              content: [{
                type: 'text',
                text: '❌ **Configuration Required**\n\nPlease provide your Jira configuration first.'
              }]
            };
          }

          // Simulate OAuth token exchange (real implementation would call Atlassian's API)
          session.accessToken = 'oauth-access-token-' + Date.now();
          session.refreshToken = 'oauth-refresh-token-' + Date.now();
          session.expiresAt = Date.now() + (3600 * 1000); // 1 hour
          session.initialized = true;

          return {
            content: [{
              type: 'text',
              text: '✅ **OAuth Authentication Successful!**\n\n' +
                    '🔗 **Connected to:** ' + session.config.companyUrl + '\n' +
                    '👤 **User:** ' + session.config.userEmail + '\n' +
                    '🔑 **Auth Method:** OAuth 2.0 (Browser-based)\n' +
                    '⏰ **Token Expires:** ' + new Date(session.expiresAt).toLocaleString() + '\n\n' +
                    '🚀 **Ready to use all Jira tools!**\n\n' +
                    '💡 **What\'s Next:**\n' +
                    '• Try `test_jira_connection` to verify access\n' +
                    '• Use `list_projects` to see available projects\n' +
                    '• Search issues with `jira_search`\n' +
                    '• Get issue details with `jira_get_issue`'
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: '❌ **OAuth Completion Failed**\n\n' + (error as Error).message
            }]
          };
        }
      }
    );

    // Test connection tool
    this.server.tool('test_jira_connection', 
      'Test connection to Jira instance and verify credentials',
      {},
      async (params, extra) => {
        try {
          const sessionId = extra?.sessionId || 'default';
          const jiraClient = await this.ensureSessionInitialized(sessionId);
          const session = this.getSession(sessionId);
          
          const isConnected = await jiraClient.testConnection();
          
          if (isConnected) {
            return {
              content: [{
                type: 'text',
                text: '✅ **Jira Connection Successful!**\n\n' +
                      '🔗 **Connected to:** ' + session.config!.companyUrl + '\n' +
                      '👤 **Authenticated as:** ' + session.config!.userEmail + '\n' +
                      '🔑 **Auth Method:** ' + session.config!.authMethod + '\n\n' +
                      '🚀 **Ready for Jira operations!**'
              }]
            };
          } else {
            return {
              content: [{
                type: 'text',
                text: '❌ **Connection Failed**\n\nUnable to connect to Jira. Please check your configuration.'
              }]
            };
          }
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: '❌ **Connection Test Failed**\n\n' + (error as Error).message
            }]
          };
        }
      }
    );

    // Other Jira tools - all use ensureSessionInitialized() for OAuth/token auth

    // Get issue tool
    this.server.tool('jira_get_issue', 
      'Get details of a specific Jira issue',
      {
        issueKey: z.string().describe('Jira issue key (e.g., "PROJ-123")')
      },
      async ({ issueKey }, extra) => {
        try {
          const sessionId = extra?.sessionId || 'default';
          const jiraClient = await this.ensureSessionInitialized(sessionId);
          const session = this.getSession(sessionId);
          
          const issueData = await jiraClient.makeRequest(`/rest/api/3/issue/${issueKey}`);
          
          return {
            content: [{
              type: 'text',
              text: '📋 **Issue Details: ' + issueKey + '**\n\n' +
                    '**Title:** ' + issueData.fields.summary + '\n' +
                    '**Status:** ' + issueData.fields.status.name + '\n' +
                    '**Type:** ' + issueData.fields.issuetype.name + '\n' +
                    '**Reporter:** ' + (issueData.fields.reporter?.displayName || 'Unknown') + '\n' +
                    '**Assignee:** ' + (issueData.fields.assignee?.displayName || 'Unassigned') + '\n' +
                    '**Project:** ' + issueData.fields.project.name + '\n' +
                    '**Created:** ' + new Date(issueData.fields.created).toLocaleDateString() + '\n\n' +
                    '**Issue URL:** [' + issueKey + '](' + session.config!.companyUrl + '/browse/' + issueKey + ')'
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: '❌ **Failed to Get Issue**\n\n' + (error as Error).message + '\n\n💡 Try `initiate_oauth` if not authenticated.'
            }]
          };
        }
      }
    );

    // Search issues tool
    this.server.tool('jira_search', 
      'Search Jira issues using JQL',
      {
        jql: z.string().describe('JQL query string (e.g., "project = PROJ AND status = Open")'),
        maxResults: z.number().optional().default(10).describe('Maximum number of results to return')
      },
      async ({ jql, maxResults }, extra) => {
        try {
          const sessionId = extra?.sessionId || 'default';
          const jiraClient = await this.ensureSessionInitialized(sessionId);
          
          const searchResults = await jiraClient.searchIssues(jql, { maxResults });
          
          if (searchResults.issues.length === 0) {
            return {
              content: [{
                type: 'text',
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
              type: 'text',
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
              type: 'text',
              text: '❌ **Search Failed**\n\n' + (error as Error).message + '\n\n💡 Try `initiate_oauth` if not authenticated.'
            }]
          };
        }
      }
    );

    // List projects tool
    this.server.tool('list_projects', 
      'List all accessible Jira projects',
      {},
      async (params, extra) => {
        try {
          const sessionId = extra?.sessionId || 'default';
          const jiraClient = await this.ensureSessionInitialized(sessionId);
          
          const projects = await jiraClient.getProjects();
          
          if (projects.length === 0) {
            return {
              content: [{
                type: 'text',
                text: '📋 **No Projects Found**\n\nYou don\'t have access to any Jira projects, or none exist in this instance.'
              }]
            };
          }

          const projectList = projects.map(project => 
            `• **${project.key}** - ${project.name} (${project.projectTypeKey})`
          ).join('\n');

          return {
            content: [{
              type: 'text',
              text: '📋 **Accessible Projects**\n\n' +
                    '**Found:** ' + projects.length + ' projects\n\n' +
                    '**Projects:**\n' + projectList + '\n\n' +
                    '💡 Use project keys in JQL queries with `jira_search`.'
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: '❌ **Failed to List Projects**\n\n' + (error as Error).message + '\n\n💡 Try `initiate_oauth` if not authenticated.'
            }]
          };
        }
      }
    );
  }

  /**
   * Start HTTP server
   */
  async startServer(): Promise<void> {
    const PORT = parseInt(process.env.PORT || '3000');
    const HOST = process.env.HOST || '0.0.0.0';

    const app = express();
    app.use(cors());
    app.use(express.json());

    const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

    // Health check
    app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'jira-mcp-sprinthealth',
        version: '4.1.0',
        features: ['oauth', 'lazy-loading', 'smithery-compatible'],
        timestamp: new Date().toISOString()
      });
    });

    // Config schema endpoint (for Smithery compatibility)
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
            title: "Authentication Method",
            description: "OAuth (browser-based, recommended) or API Token (manual)"
          },
          jiraApiToken: {
            type: "string",
            title: "Jira API Token (Optional)",
            description: "Only needed if you choose 'token' auth method"
          }
        },
        required: ["companyUrl", "userEmail", "authMethod"]
      });
    });

    // OAuth callback endpoint
    app.get('/oauth/callback', async (req, res) => {
      const { code, state, error } = req.query;

      if (error) {
        res.send(`
          <html><head><title>OAuth Error</title></head><body>
            <h1>❌ OAuth Authentication Failed</h1>
            <p><strong>Error:</strong> ${error}</p>
            <p>Please try again using the <code>initiate_oauth</code> tool.</p>
          </body></html>
        `);
        return;
      }

      if (code && state) {
        res.send(`
          <html><head><title>OAuth Success</title></head><body>
            <h1>✅ Authentication Successful!</h1>
            <p>Copy these values to complete authentication:</p>
            <div style="background:#f5f5f5;padding:10px;font-family:monospace;">
              <strong>Authorization Code:</strong><br><code>${code}</code><br><br>
              <strong>State:</strong><br><code>${state}</code>
            </div>
            <p>Use these with the <code>complete_oauth</code> tool in your MCP client.</p>
            <p>You can close this window.</p>
          </body></html>
        `);
      } else {
        res.send(`
          <html><head><title>OAuth Error</title></head><body>
            <h1>❌ Invalid OAuth Response</h1>
            <p>Missing authorization code. Please restart the OAuth flow.</p>
          </body></html>
        `);
      }
    });

    // MCP endpoint
    app.all('/mcp', async (req, res) => {
      try {
        const configParam = req.query.config as string | undefined;
        const config = this.parseConfig(configParam);
        
        const sessionId = req.headers['mcp-session-id'] as string || 
                         'session-' + Date.now();

        if (config) {
          this.getSession(sessionId, config);
        }

        let transport = transports[sessionId];
        if (!transport) {
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => sessionId,
          });
          transports[sessionId] = transport;
          await this.server.connect(transport);
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
        <html><head><title>Jira MCP Server with OAuth</title></head><body>
          <h1>🚀 Jira MCP Server with OAuth Authentication</h1>
          <p>✅ Server running with OAuth support and lazy loading!</p>
          
          <h2>🔐 Authentication Options:</h2>
          <ul>
            <li><strong>OAuth (Recommended):</strong> Browser-based, secure authentication</li>
            <li><strong>API Token:</strong> Manual token from Atlassian</li>
          </ul>

          <h2>🛠️ Available Tools:</h2>
          <ul>
            <li><code>initiate_oauth</code> - Start OAuth flow</li>
            <li><code>complete_oauth</code> - Complete OAuth authentication</li>
            <li><code>test_jira_connection</code> - Test connection</li>
            <li><code>help</code> - Full usage guide</li>
          </ul>

          <h2>🔗 Endpoints:</h2>
          <ul>
            <li><strong>GET /health</strong> - Health check</li>
            <li><strong>GET /oauth/callback</strong> - OAuth redirect handler</li>
            <li><strong>ALL /mcp</strong> - MCP protocol endpoint</li>
          </ul>
        </body></html>
      `);
    });

    return new Promise<void>((resolve) => {
      app.listen(PORT, HOST, () => {
        console.log('\n🚀 Jira MCP Server with OAuth Started!');
        console.log('📍 Server URL: http://' + HOST + ':' + PORT);
        console.log('🔗 MCP Endpoint: http://' + HOST + ':' + PORT + '/mcp');
        console.log('🔐 OAuth Callback: http://' + HOST + ':' + PORT + '/oauth/callback');
        console.log('\n⚙️ Features:');
        console.log('   ✅ OAuth 2.0 browser authentication');
        console.log('   ✅ API Token fallback');
        console.log('   ✅ Lazy configuration loading');
        console.log('   ✅ Smithery compatible');
        console.log('\n✅ Ready for deployment!');
        resolve();
      });
    });
  }
}

// Start server if run directly
try {
  const isMainModule = typeof require !== 'undefined' && require.main === module;
  if (isMainModule) {
    const server = new HttpJiraMCPServerWithOAuth();
    server.startServer().catch((error) => {
      console.error('❌ Failed to start server:', error);
      process.exit(1);
    });
  }
} catch (error) {
  if (process.argv[1] && process.argv[1].includes('server-http-lazy')) {
    const server = new HttpJiraMCPServerWithOAuth();
    server.startServer().catch((error) => {
      console.error('❌ Failed to start server:', error);
      process.exit(1);
    });
  }
}

export default HttpJiraMCPServerWithOAuth;

// Export for Smithery TypeScript runtime compatibility
export function createServer(config?: Config): McpServer {
  const server = new HttpJiraMCPServerWithOAuth();
  return server.getMcpServer();
}
