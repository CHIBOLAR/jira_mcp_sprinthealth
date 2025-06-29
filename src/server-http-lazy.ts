#!/usr/bin/env node

import express from 'express';
import cors from 'cors';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { JiraApiClient } from './jira-client.js';

/**
 * Configuration schema for HTTP/Smithery mode
 */
export const configSchema = z.object({
  companyUrl: z.string().describe("Your company's Jira URL (e.g., https://company.atlassian.net)"),
  userEmail: z.string().describe("Your work email address"),
  authMethod: z.enum(["oauth", "token"]).default("token").describe("Authentication method"),
  jiraApiToken: z.string().optional().describe("Jira API Token from https://id.atlassian.com/manage-profile/security/api-tokens")
});

export type Config = z.infer<typeof configSchema>;

interface SessionData {
  config?: Config | undefined;
  jiraClient?: JiraApiClient | undefined;
  initialized: boolean;
}

/**
 * HTTP MCP Server with Proper Lazy Loading for Smithery
 */
class HttpJiraMCPServer {
  private server: McpServer;
  private sessions = new Map<string, SessionData>();

  constructor() {
    this.server = new McpServer({
      name: 'jira-mcp-sprinthealth',
      version: '4.0.0',
    });

    this.setupTools();
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

    if (session.config.jiraApiToken) {
      jiraConfig.apiToken = session.config.jiraApiToken;
    }

    session.jiraClient = new JiraApiClient(jiraConfig);
    session.initialized = true;
    
    return session.jiraClient;
  }

  /**
   * Setup all tools with lazy loading
   */
  private setupTools(): void {
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
                      '🔑 **Auth Method:** ' + session.config!.authMethod + '\n' +
                      '📡 **API Access:** ✅ Verified\n\n' +
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
              text: '❌ **Failed to Get Issue**\n\n' + (error as Error).message
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
              text: '❌ **Search Failed**\n\n' + (error as Error).message
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
              text: '❌ **Failed to List Projects**\n\n' + (error as Error).message
            }]
          };
        }
      }
    );

    // Help tool - no configuration needed, immediate response
    this.server.tool('help', 
      'Get help and information about available tools',
      {},
      async () => {
        // Return immediately without any async operations
        return {
          content: [{
            type: 'text',
            text: '🚀 **Jira MCP Server - Help Guide**\n\n' +
                  '📋 **Available Tools:**\n\n' +
                  '1. **test_jira_connection** - Test authenticated connection\n' +
                  '2. **jira_get_issue** - Get detailed issue information\n' +
                  '3. **jira_search** - Search issues with JQL\n' +
                  '4. **list_projects** - List accessible projects\n' +
                  '5. **help** - This help guide\n\n' +
                  '🔧 **Ready for Use:**\n' +
                  'Tools require Jira configuration when executed.\n' +
                  'Configuration is loaded lazily - no setup needed to browse tools!\n\n' +
                  '⚡ **Fast Response:** This server uses lazy loading for optimal performance.'
          }]
        };
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

    // Health check - immediate response
    app.get('/health', (req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.json({
        status: 'healthy',
        service: 'jira-mcp-sprinthealth',
        version: '4.0.0',
        features: ['lazy-loading', 'smithery-compatible', 'session-based'],
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });

    // Configuration schema endpoint for Smithery
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
            default: "token",
            description: "Authentication method"
          },
          jiraApiToken: {
            type: "string",
            description: "Jira API Token from https://id.atlassian.com/manage-profile/security/api-tokens"
          }
        },
        required: ["companyUrl", "userEmail"]
      });
    });

    // MCP endpoint with lazy loading and timeout optimization
    app.all('/mcp', async (req, res) => {
      // Set timeout headers for faster responses
      res.setTimeout(10000); // 10 second timeout
      
      try {
        const configParam = req.query.config as string | undefined;
        const config = this.parseConfig(configParam);
        
        const sessionId = req.headers['mcp-session-id'] as string || 
                         'session-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

        // Store config in session if provided
        if (config) {
          this.getSession(sessionId, config);
        }

        let transport: StreamableHTTPServerTransport;

        if (transports[sessionId]) {
          transport = transports[sessionId];
        } else {
          // Create transport with optimized settings
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

          // Connect server to transport
          await this.server.connect(transport);
        }

        // Handle request with timeout protection
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Request timeout')), 9000);
        });

        const requestPromise = transport.handleRequest(req, res, req.body);
        
        await Promise.race([requestPromise, timeoutPromise]);
        
      } catch (error) {
        console.error('❌ MCP Error:', error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: { 
              code: -32603, 
              message: error instanceof Error ? error.message : 'Internal server error' 
            },
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
          <head><title>Jira MCP Server</title></head>
          <body>
            <h1>🚀 Jira MCP Server with Lazy Loading</h1>
            <p>✅ Server running with proper lazy loading for Smithery compatibility!</p>
            
            <h2>✨ Features:</h2>
            <ul>
              <li>✅ Lazy configuration loading</li>
              <li>✅ Tools list available without config</li>
              <li>✅ Session-based configuration</li>
              <li>✅ Smithery compatible</li>
            </ul>

            <h2>🛠️ Available Tools:</h2>
            <ul>
              <li><strong>test_jira_connection</strong> - Test authenticated connection</li>
              <li><strong>jira_get_issue</strong> - Get issue details</li>
              <li><strong>jira_search</strong> - Search with JQL</li>
              <li><strong>list_projects</strong> - List accessible projects</li>
              <li><strong>help</strong> - Usage guide</li>
            </ul>

            <h2>🔗 Endpoints:</h2>
            <ul>
              <li><strong>GET /health</strong> - Health check</li>
              <li><strong>GET /config-schema</strong> - Configuration schema</li>
              <li><strong>ALL /mcp</strong> - MCP protocol endpoint</li>
            </ul>

            <p><strong>Server URL:</strong> http://${HOST}:${PORT}</p>
          </body>
        </html>
      `);
    });

    return new Promise((resolve) => {
      app.listen(PORT, HOST, () => {
        console.log('\n🚀 Jira MCP Server with Lazy Loading Started!');
        console.log('📍 Server URL: http://' + HOST + ':' + PORT);
        console.log('🔗 MCP Endpoint: http://' + HOST + ':' + PORT + '/mcp');
        console.log('📋 Config Schema: http://' + HOST + ':' + PORT + '/config-schema');
        console.log('\n⚙️ Features:');
        console.log('   ✅ Lazy configuration loading');
        console.log('   ✅ Tools list without configuration');
        console.log('   ✅ Session-based configuration');
        console.log('   ✅ Smithery compatible');
        console.log('\n✅ Ready for deployment!');
        resolve();
      });
    });
  }
}

// Start server if run directly (CommonJS compatible)
try {
  const isMainModule = typeof require !== 'undefined' && require.main === module;
  if (isMainModule) {
    const server = new HttpJiraMCPServer();
    server.startServer().catch((error) => {
      console.error('❌ Failed to start server:', error);
      process.exit(1);
    });
  }
} catch (error) {
  // Fallback for module detection issues
  if (process.argv[1] && process.argv[1].includes('server-http-lazy')) {
    const server = new HttpJiraMCPServer();
    server.startServer().catch((error) => {
      console.error('❌ Failed to start server:', error);
      process.exit(1);
    });
  }
}

export default HttpJiraMCPServer;
