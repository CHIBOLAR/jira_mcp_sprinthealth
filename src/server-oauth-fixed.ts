#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { ProxyOAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/providers/proxyProvider.js';
import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import { JiraApiClient } from './jira-client.js';

// Configuration schema
export const configSchema = z.object({
  companyUrl: z.string().describe("Your company's Jira URL (e.g., https://company.atlassian.net)"),
  userEmail: z.string().describe("Your work email address"),
  authMethod: z.enum(["oauth", "token"]).default("oauth").describe("OAuth (recommended) or API Token"),
  jiraApiToken: z.string().optional().describe("Only needed if OAuth fails"),
  oauthClientId: z.string().optional().describe("OAuth Client ID from Atlassian Developer Console"),
  oauthClientSecret: z.string().optional().describe("OAuth Client Secret")
});

export type Config = z.infer<typeof configSchema>;

interface AuthInfo {
  token: string;
  clientId: string;
  scopes: string[];
  extra: {
    userId: string;
    userEmail: string;
    companyUrl: string;
  };
}

/**
 * Fixed Jira MCP Server using MCP SDK OAuth v1.13.2
 * Uses the working OAuth patterns from production deployments
 */
class JiraMCPServerFixed {
  private mcpServer: McpServer;
  private serverUrl: string;
  private proxyProvider: ProxyOAuthServerProvider;
  private jiraClients = new Map<string, JiraApiClient>();

  constructor(serverUrl: string) {
    this.serverUrl = serverUrl;
    
    // Initialize MCP Server
    this.mcpServer = new McpServer({
      name: 'jira-mcp-oauth-fixed',
      version: '5.0.0',
    });

    // Initialize OAuth Provider using working SDK pattern
    this.proxyProvider = new ProxyOAuthServerProvider({
      endpoints: {
        authorizationUrl: this.getAuthorizationUrl(),
        tokenUrl: this.getTokenUrl(),
        revocationUrl: this.getRevocationUrl(),
      },
      verifyAccessToken: async (token: string) => {
        return await this.verifyJiraToken(token);
      },
      getClient: async (client_id: string) => {
        return {
          client_id,
          redirect_uris: [`${this.serverUrl}/oauth/callback`],
        };
      }
    });

    this.setupTools();
    this.setupErrorHandling();
  }

  /**
   * Get Atlassian OAuth endpoints
   */
  private getAuthorizationUrl(): string {
    return process.env.JIRA_AUTH_URL || 'https://auth.atlassian.com/authorize';
  }

  private getTokenUrl(): string {
    return process.env.JIRA_TOKEN_URL || 'https://auth.atlassian.com/oauth/token';
  }

  private getRevocationUrl(): string {
    return process.env.JIRA_REVOKE_URL || 'https://auth.atlassian.com/oauth/revoke';
  }

  /**
   * Verify Jira access token using proper OAuth validation
   */
  private async verifyJiraToken(token: string): Promise<AuthInfo> {
    try {
      // First get accessible resources to validate token
      const resourcesResponse = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        }
      });

      if (!resourcesResponse.ok) {
        throw new Error(`Token validation failed: ${resourcesResponse.status}`);
      }

      const resources = await resourcesResponse.json();
      if (!resources || resources.length === 0) {
        throw new Error('No accessible Jira resources found');
      }

      // Get user info from first accessible resource
      const jiraResource = resources[0];
      const userResponse = await fetch(`${jiraResource.url}/rest/api/3/myself`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        }
      });

      if (!userResponse.ok) {
        throw new Error(`User info fetch failed: ${userResponse.status}`);
      }

      const userInfo = await userResponse.json();

      return {
        token,
        clientId: "jira-mcp-client",
        scopes: ["read:jira-work", "read:jira-user", "write:jira-work"],
        extra: {
          userId: userInfo.accountId,
          userEmail: userInfo.emailAddress,
          companyUrl: jiraResource.url,
        }
      };
    } catch (error) {
      console.error('❌ Token verification failed:', error);
      throw new Error(`Invalid access token: ${(error as Error).message}`);
    }
  }

  /**
   * Get or create Jira client for authenticated user
   */
  private async getJiraClient(authInfo: AuthInfo): Promise<JiraApiClient> {
    const key = `${authInfo.extra.userId}:${authInfo.extra.companyUrl}`;
    
    if (!this.jiraClients.has(key)) {
      const client = new JiraApiClient({
        baseUrl: authInfo.extra.companyUrl,
        email: authInfo.extra.userEmail,
        authMethod: 'oauth',
        accessToken: authInfo.token
      });
      
      this.jiraClients.set(key, client);
    }
    
    return this.jiraClients.get(key)!;
  }

  /**
   * Setup MCP tools with proper OAuth authentication
   */
  private setupTools(): void {
    // Help tool
    this.mcpServer.tool('help', 
      'Get help and information about available tools',
      {},
      async () => {
        return {
          content: [{
            type: 'text' as const,
            text: '🚀 **Jira MCP Server with OAuth (Fixed)** \n\n' +
                  '✅ **Working OAuth Implementation using MCP SDK v1.13.2**\n\n' +
                  '📋 **Available Tools:**\n' +
                  '• `test_jira_connection` - Test authenticated connection\n' +
                  '• `jira_get_issue` - Get detailed issue information\n' +
                  '• `jira_search` - Search issues with JQL\n' +
                  '• `list_projects` - List accessible projects\n' +
                  '• `help` - This help guide\n\n' +
                  '🔐 **Authentication:**\n' +
                  'OAuth 2.1 with PKCE is handled automatically by the MCP SDK.\n' +
                  'Use Bearer token in Authorization header.\n\n' +
                  '🎯 **Features:**\n' +
                  '• Automatic token validation\n' +
                  '• Multi-tenant support\n' +
                  '• Real Jira API integration\n' +
                  '• Production-ready OAuth flow'
          }]
        };
      }
    );

    // Test connection
    this.mcpServer.tool('test_jira_connection', 
      'Test connection to Jira instance and verify credentials',
      {},
      async (params, context) => {
        try {
          const authInfo = context?._meta?.authInfo as AuthInfo;
          if (!authInfo) {
            return {
              content: [{
                type: 'text' as const,
                text: '🔐 **Authentication Required**\n\nNo valid Bearer token found. Please authenticate with OAuth first.'
              }]
            };
          }

          const jiraClient = await this.getJiraClient(authInfo);
          const isConnected = await jiraClient.testConnection();
          
          if (isConnected) {
            return {
              content: [{
                type: 'text' as const,
                text: '✅ **Jira Connection Successful!**\n\n' +
                      '🔗 **Connected to:** ' + authInfo.extra.companyUrl + '\n' +
                      '👤 **Authenticated as:** ' + authInfo.extra.userEmail + '\n' +
                      '🔑 **User ID:** ' + authInfo.extra.userId + '\n' +
                      '📡 **API Access:** ✅ Verified\n\n' +
                      '🚀 **Ready for Jira operations!**'
              }]
            };
          } else {
            return {
              content: [{
                type: 'text' as const,
                text: '❌ **Connection Failed**\n\nUnable to connect to Jira. Please check your token.'
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

    // Get issue tool
    this.mcpServer.tool('jira_get_issue', 
      'Get details of a specific Jira issue',
      {
        issueKey: z.string().describe('Jira issue key (e.g., "PROJ-123")')
      },
      async ({ issueKey }, context) => {
        try {
          const authInfo = context?._meta?.authInfo as AuthInfo;
          if (!authInfo) {
            return {
              content: [{
                type: 'text' as const,
                text: '🔐 **Authentication Required**\n\nPlease authenticate first.'
              }]
            };
          }

          const jiraClient = await this.getJiraClient(authInfo);
          const issueData = await jiraClient.makeRequest(`/rest/api/3/issue/${issueKey}`);
          
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
                    '**Issue URL:** [' + issueKey + '](' + authInfo.extra.companyUrl + '/browse/' + issueKey + ')'
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

    // Search issues tool
    this.mcpServer.tool('jira_search', 
      'Search Jira issues using JQL',
      {
        jql: z.string().describe('JQL query string (e.g., "project = PROJ AND status = Open")'),
        maxResults: z.number().optional().default(10).describe('Maximum number of results to return')
      },
      async ({ jql, maxResults }, context) => {
        try {
          const authInfo = context?._meta?.authInfo as AuthInfo;
          if (!authInfo) {
            return {
              content: [{
                type: 'text' as const,
                text: '🔐 **Authentication Required**\n\nPlease authenticate first.'
              }]
            };
          }

          const jiraClient = await this.getJiraClient(authInfo);
          const searchResults = await jiraClient.searchIssues(jql, { maxResults });
          
          if (searchResults.issues.length === 0) {
            return {
              content: [{
                type: 'text' as const,
                text: '🔍 **Search Results**\n\n' +
                      '**Query:** ' + jql + '\n' +
                      '**Results:** 0 issues found'
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
                    '**Found:** ' + searchResults.total + ' issues\n\n' +
                    issueList
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

    // List projects tool
    this.mcpServer.tool('list_projects', 
      'List all accessible Jira projects',
      {},
      async (params, context) => {
        try {
          const authInfo = context?._meta?.authInfo as AuthInfo;
          if (!authInfo) {
            return {
              content: [{
                type: 'text' as const,
                text: '🔐 **Authentication Required**\n\nPlease authenticate first.'
              }]
            };
          }

          const jiraClient = await this.getJiraClient(authInfo);
          const projects = await jiraClient.getProjects();
          
          if (projects.length === 0) {
            return {
              content: [{
                type: 'text' as const,
                text: '📋 **No Projects Found**\n\nNo accessible projects.'
              }]
            };
          }

          const projectList = projects.map(project => 
            `• **${project.key}** - ${project.name}`
          ).join('\n');

          return {
            content: [{
              type: 'text' as const,
              text: '📋 **Accessible Projects**\n\n' +
                    '**Found:** ' + projects.length + ' projects\n\n' +
                    projectList
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
  }

  /**
   * Setup error handling
   */
  private setupErrorHandling(): void {
    process.on('uncaughtException', (error) => {
      console.error('❌ Uncaught Exception:', error);
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    });
  }

  /**
   * Start HTTP server with working OAuth implementation
   */
  async startHttpServer(): Promise<void> {
    const PORT = parseInt(process.env.PORT || '3000');
    const HOST = '0.0.0.0';

    const app = express();
    app.use(cors());
    app.use(express.json());

    // OAuth discovery and endpoints (using working SDK pattern)
    app.use(mcpAuthRouter({
      provider: this.proxyProvider,
      issuerUrl: new URL('https://auth.atlassian.com'),
      baseUrl: new URL(this.serverUrl),
      serviceDocumentationUrl: new URL('https://github.com/your-org/jira-mcp-mvp'),
    }));

    // Bearer token middleware (using working SDK pattern)
    const bearerAuthMiddleware = requireBearerAuth({
      requiredScopes: ['read:jira-work'],
      resourceMetadataUrl: new URL('https://auth.atlassian.com').toString(),
      verifier: {
        verifyAccessToken: async (token: string) => {
          return await this.verifyJiraToken(token);
        },
      },
    });

    const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

    // Health check
    app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'jira-mcp-oauth-fixed',
        version: '5.0.0',
        features: ['oauth-sdk-v1.13.2', 'bearer-auth', 'real-api'],
        oauth: {
          endpoints: {
            authorization: 'https://auth.atlassian.com/authorize',
            token: 'https://auth.atlassian.com/oauth/token',
            discovery: `${this.serverUrl}/.well-known/oauth-authorization-server`
          }
        }
      });
    });

    // Smithery-compatible endpoints
    app.get('/config-schema', (req, res) => {
      res.json(configSchema);
    });

    app.get('/config', (req, res) => {
      const configParam = req.query.config as string;
      if (configParam) {
        try {
          const decoded = Buffer.from(configParam, 'base64').toString('utf-8');
          const parsed = JSON.parse(decoded);
          const validated = configSchema.parse(parsed);
          res.json(validated);
        } catch (error) {
          res.status(400).json({ error: 'Invalid configuration' });
        }
      } else {
        res.json({
          companyUrl: process.env.JIRA_URL || 'https://your-company.atlassian.net',
          userEmail: process.env.JIRA_EMAIL || 'user@company.com',
          authMethod: 'oauth'
        });
      }
    });

    app.get('/tools', (req, res) => {
      res.json([
        {
          name: 'help',
          description: 'Get help and information about available tools',
          inputSchema: {}
        },
        {
          name: 'test_jira_connection',
          description: 'Test connection to Jira instance and verify credentials',
          inputSchema: {}
        },
        {
          name: 'jira_get_issue',
          description: 'Get detailed issue information',
          inputSchema: {
            type: 'object',
            properties: {
              issueKey: {
                type: 'string',
                description: 'Jira issue key (e.g., "PROJ-123")'
              }
            },
            required: ['issueKey']
          }
        },
        {
          name: 'jira_search',
          description: 'Search issues with JQL',
          inputSchema: {
            type: 'object',
            properties: {
              jql: {
                type: 'string',
                description: 'JQL query string'
              }
            },
            required: ['jql']
          }
        },
        {
          name: 'list_projects',
          description: 'List accessible projects',
          inputSchema: {}
        }
      ]);
    });

    app.get('/schema', (req, res) => {
      res.json(configSchema);
    });

    // MCP endpoint with OAuth authentication
    app.use('/mcp', bearerAuthMiddleware);  // ✅ Apply OAuth middleware
    
    app.all('/mcp', async (req, res) => {
      try {
        const sessionId = req.headers['mcp-session-id'] as string || 
                         'session-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

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
          <head><title>🚀 Jira MCP Server - OAuth Fixed!</title></head>
          <body>
            <h1>✅ Jira MCP Server with Working OAuth!</h1>
            <p><strong>Status:</strong> Using MCP SDK v1.13.2 with proper OAuth implementation</p>
            
            <h2>🔐 OAuth Implementation:</h2>
            <ul>
              <li>✅ ProxyOAuthServerProvider from MCP SDK</li>
              <li>✅ requireBearerAuth middleware</li>
              <li>✅ mcpAuthRouter for discovery</li>
              <li>✅ Automatic token validation</li>
              <li>✅ Atlassian OAuth 2.1 integration</li>
            </ul>

            <h2>🛠️ Available Tools:</h2>
            <ul>
              <li><strong>help</strong> - Usage guide</li>
              <li><strong>test_jira_connection</strong> - Test authenticated connection</li>
              <li><strong>jira_get_issue</strong> - Get issue details</li>
              <li><strong>jira_search</strong> - Search with JQL</li>
              <li><strong>list_projects</strong> - List accessible projects</li>
            </ul>

            <h2>🔗 Endpoints:</h2>
            <ul>
              <li><strong>GET /.well-known/oauth-authorization-server</strong> - OAuth discovery</li>
              <li><strong>GET /health</strong> - Health check</li>
              <li><strong>ALL /mcp</strong> - MCP protocol endpoint (requires Bearer token)</li>
            </ul>

            <h2>🎯 Testing:</h2>
            <pre>
# Test OAuth discovery
curl ${this.serverUrl}/.well-known/oauth-authorization-server

# Test with MCP Inspector
npx @modelcontextprotocol/inspector ${this.serverUrl}/mcp
            </pre>

            <p><strong>Server URL:</strong> ${this.serverUrl}</p>
            <p><strong>Version:</strong> 5.0.0 (OAuth Fixed)</p>
          </body>
        </html>
      `);
    });

    return new Promise((resolve) => {
      app.listen(PORT, HOST, () => {
        console.log('\n🚀 Jira MCP Server - OAuth FIXED!');
        console.log('✅ Using MCP SDK v1.13.2 with working OAuth');
        console.log('📍 Server URL: http://' + HOST + ':' + PORT);
        console.log('🔗 MCP Endpoint: http://' + HOST + ':' + PORT + '/mcp');
        console.log('🔐 OAuth Discovery: http://' + HOST + ':' + PORT + '/.well-known/oauth-authorization-server');
        console.log('\n⚙️ Fixed Features:');
        console.log('   ✅ ProxyOAuthServerProvider');
        console.log('   ✅ requireBearerAuth middleware');
        console.log('   ✅ mcpAuthRouter for discovery');
        console.log('   ✅ Automatic token validation');
        console.log('   ✅ Production-ready OAuth flow');
        console.log('\n🎯 Test with:');
        console.log('   curl http://' + HOST + ':' + PORT + '/.well-known/oauth-authorization-server');
        console.log('   npx @modelcontextprotocol/inspector http://' + HOST + ':' + PORT + '/mcp');
        console.log('\n✅ OAuth implementation FIXED and ready!');
        resolve();
      });
    });
  }
}

// Start the fixed server
const SERVER_URL = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3000}`;
const server = new JiraMCPServerFixed(SERVER_URL);
server.startHttpServer().catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});
