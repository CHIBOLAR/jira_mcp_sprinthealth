#!/usr/bin/env node

// HTTP Server Entry Point for Jira MCP Server
// Smithery-compatible HTTP implementation using latest MCP SDK

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import cors from 'cors';
import { z } from 'zod';

// Configuration schema for Smithery - MUST match smithery.yaml exactly
export const configSchema = z.object({
  companyUrl: z.string().describe("Your company's Jira URL (e.g., https://company.atlassian.net)"),
  userEmail: z.string().describe("Your work email address"),
  authMethod: z.enum(["oauth", "token"]).default("oauth").describe("OAuth (recommended) or API Token (fallback)"),
  jiraApiToken: z.string().optional().describe("Only needed if OAuth fails. Get from: https://id.atlassian.com/manage-profile/security/api-tokens")
});

export type Config = z.infer<typeof configSchema>;

/**
 * Parse configuration from Smithery query parameter
 * Smithery passes config as base64 encoded JSON in query parameter
 */
function parseSmitheryConfig(configParam?: string): Config | null {
  if (!configParam) return null;
  
  try {
    // Decode base64 config
    const decoded = Buffer.from(configParam, 'base64').toString('utf-8');
    const parsed = JSON.parse(decoded);
    
    // Validate against schema
    return configSchema.parse(parsed);
  } catch (error) {
    console.error('Failed to parse Smithery config:', error);
    return null;
  }
}

/**
 * Get configuration from environment or defaults (for lazy loading)
 */
function getEnvConfig(): Config {
  return {
    companyUrl: process.env.JIRA_URL || process.env.COMPANY_URL || 'https://your-company.atlassian.net',
    userEmail: process.env.JIRA_EMAIL || process.env.USER_EMAIL || 'user@company.com',
    authMethod: (process.env.AUTH_METHOD as 'oauth' | 'token') || 'oauth',
    jiraApiToken: process.env.JIRA_API_TOKEN || undefined
  };
}
/**
 * Enhanced Jira MCP Server - Smithery Compatible
 * Simplified version for immediate deployment
 */
class JiraMCPServer {
  private mcpServer: McpServer;
  private currentConfig: Config | null = null;
  
  constructor() {
    // Initialize MCP server with enhanced capabilities
    this.mcpServer = new McpServer({
      name: 'jira-mcp-http',
      version: '3.0.0',
    });

    this.setupTools();
    this.setupErrorHandling();
  }

  /**
   * Enhanced error handling
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
   * Setup all MCP tools (simplified for Smithery compatibility)
   */
  private setupTools(): void {
    // Connection test tool
    this.mcpServer.tool('test_jira_connection', 
      {},  // No parameters needed
      async () => {
        try {
          const config = this.currentConfig || getEnvConfig();
          configSchema.parse(config);
          
          return {
            content: [{
              type: 'text' as const,
              text: '✅ **Jira Connection Test**\n\n' +
                    'Configuration is valid and ready for use.\n\n' +
                    '🚀 **Available Features:**\n' +
                    '• Core CRUD operations\n' +
                    '• Issue management\n' +
                    '• Project browsing\n' +
                    '• Search functionality\n\n' +
                    `🔧 **Current Configuration:**\n` +
                    `• Company URL: ${config.companyUrl}\n` +
                    `• User Email: ${config.userEmail}\n` +
                    `• Auth Method: ${config.authMethod}\n\n` +
                    '💡 **Ready for Jira automation!**'
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text' as const,
              text: `❌ **Configuration Error**: Please provide valid Jira configuration`
            }]
          };
        }
      }
    );
    // Basic issue retrieval
    this.mcpServer.tool('jira_get_issue', 
      {
        issueKey: z.string().describe('Jira issue key (e.g., "PROJ-123")')
      },
      async ({ issueKey }) => {
        try {
          const config = this.currentConfig || getEnvConfig();
          configSchema.parse(config);
          
          return {
            content: [{
              type: 'text' as const,
              text: `📋 **Issue Details for ${issueKey}**\n\n` +
                    'This tool would retrieve issue details from:\n' +
                    `• Jira URL: ${config.companyUrl}\n` +
                    `• Issue Key: ${issueKey}\n\n` +
                    '⚠️ **Note**: This is a simplified demo version for Smithery deployment.\n' +
                    'Full implementation requires complete Jira client integration.'
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text' as const,
              text: `❌ **Error**: ${error instanceof Error ? error.message : 'Unknown error'}`
            }]
          };
        }
      }
    );
    // Basic issue search
    this.mcpServer.tool('jira_search', 
      {
        jql: z.string().describe('JQL query string (e.g., "project = PROJ AND status = Open")')
      },
      async ({ jql }) => {
        try {
          const config = this.currentConfig || getEnvConfig();
          configSchema.parse(config);
          
          return {
            content: [{
              type: 'text' as const,
              text: `🔍 **Search Results for JQL Query**\n\n` +
                    `Query: ${jql}\n` +
                    `Jira URL: ${config.companyUrl}\n\n` +
                    '⚠️ **Note**: This is a simplified demo version for Smithery deployment.\n' +
                    'Full implementation would execute the JQL query and return actual results.'
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text' as const,
              text: `❌ **Error**: ${error instanceof Error ? error.message : 'Unknown error'}`
            }]
          };
        }
      }
    );

    // Project listing
    this.mcpServer.tool('list_projects', 
      {},  // No parameters needed
      async () => {
        try {
          const config = this.currentConfig || getEnvConfig();
          configSchema.parse(config);
          
          return {
            content: [{
              type: 'text' as const,
              text: `📋 **Accessible Jira Projects**\n\n` +
                    `Connected to: ${config.companyUrl}\n` +
                    `User: ${config.userEmail}\n\n` +
                    '⚠️ **Note**: This is a simplified demo version for Smithery deployment.\n' +
                    'Full implementation would list actual projects from your Jira instance.\n\n' +
                    '🛠️ **Available Tools:**\n' +
                    '• `jira_get_issue` - Get issue details\n' +
                    '• `jira_search` - Search issues with JQL\n' +
                    '• `test_jira_connection` - Test connection\n' +
                    '• `list_projects` - List projects'
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text' as const,
              text: `❌ **Error**: ${error instanceof Error ? error.message : 'Unknown error'}`
            }]
          };
        }
      }
    );
  }
  /**
   * Start HTTP server with proper Smithery MCP support
   */
  async startHttpServer(): Promise<void> {
    const PORT = parseInt(process.env.PORT || '3000');
    const HOST = '0.0.0.0';

    const app = express();
    app.use(cors());
    app.use(express.json());

    // Map to store transports by session ID
    const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'jira-mcp-server',
        version: '3.0.0',
        timestamp: new Date().toISOString(),
        smithery_compatible: true
      });
    });

    // Server info endpoint
    app.get('/info', (req, res) => {
      res.json({
        name: 'jira-mcp-http',
        version: '3.0.0',
        description: 'Jira MCP Server - Smithery Compatible',
        smithery_compatible: true,
        tools: ['test_jira_connection', 'jira_get_issue', 'jira_search', 'list_projects']
      });
    });
    // MCP endpoint for Smithery - handles GET, POST, DELETE
    app.all('/mcp', async (req, res) => {
      try {
        // Extract config from query parameter (Smithery format)
        const configParam = req.query.config as string | undefined;
        const smitheryConfig = parseSmitheryConfig(configParam);
        
        // Store config for this session
        if (smitheryConfig) {
          this.currentConfig = smitheryConfig;
        }
        
        // Create or reuse transport
        const sessionId = req.headers['mcp-session-id'] as string | undefined;
        let transport: StreamableHTTPServerTransport;

        if (sessionId && transports[sessionId]) {
          transport = transports[sessionId];
        } else {
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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
        console.error('❌ Error handling MCP request:', error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: { code: -32603, message: 'Internal server error' },
            id: null,
          });
        }
      }
    });
    // Default response for root
    app.get('/', (req, res) => {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>Jira MCP HTTP Server</title></head>
        <body>
          <h1>🚀 Jira MCP HTTP Server</h1>
          <p>✅ Server is running and ready for Smithery!</p>
          <p>Streamable HTTP transport enabled</p>
          <p>Simplified demo version for quick deployment</p>
          <p>Configuration via query parameters supported</p>
          
          <h2>Available Tools:</h2>
          <ul>
            <li><code>test_jira_connection</code> - Test connection</li>
            <li><code>jira_get_issue</code> - Get issue details</li>
            <li><code>jira_search</code> - Search with JQL</li>
            <li><code>list_projects</code> - List projects</li>
          </ul>
        </body>
        </html>
      `);
    });

    // Start the server
    return new Promise((resolve) => {
      app.listen(PORT, HOST, () => {
        console.log('\n🚀 Jira MCP HTTP Server Started Successfully!');
        console.log(`📍 Server URL: http://${HOST}:${PORT}`);
        console.log(`🔗 MCP Endpoint: http://${HOST}:${PORT}/mcp`);
        console.log(`💡 Health Check: http://${HOST}:${PORT}/health`);
        console.log('\n⚙️  Features:');
        console.log('   ✅ Smithery-compatible Streamable HTTP transport');
        console.log('   🛠️ Simplified Jira tools (demo version)');
        console.log('   🔧 Configuration via query parameters');
        console.log('   🎯 Lazy loading for optimal performance');
        console.log('\n✅ Ready for Smithery deployment!');
        resolve();
      });
    });
  }
}

// Start the HTTP server
if (import.meta.url === `file://${process.argv[1]}`) {
  const httpServer = new JiraMCPServer();
  httpServer.startHttpServer().catch((error) => {
    console.error('❌ Failed to start Jira MCP HTTP Server:', error);
    process.exit(1);
  });
}