// Enhanced Jira MCP Server - OAuth 2.1 + User-Friendly Implementation
// Phase 3: Complete OAuth Integration with Enhanced UX

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  type CallToolRequest,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { JiraApiClient } from './jira-client.js';
import { JiraOAuthManager } from './auth/oauth-manager.js';
import { DashboardGenerator } from './dashboard-generator.js';
import { AdvancedAnalyticsEngine } from './advanced-analytics.js';
import { ErrorHandler, PerformanceMonitor } from './error-handler.js';
import { JiraToolRegistry } from './tools/tool-registry.js';
import { JiraConfig } from '../types/index.js';

// Enhanced Configuration Schema - OAuth 2.1 Support
export const configSchema = z.object({
  companyUrl: z.string().describe("Company Jira URL (e.g., https://company.atlassian.net)"),
  userEmail: z.string().describe("Your work email address"),
  authMethod: z.enum(["oauth", "token"]).default("oauth").describe("Authentication method"),
  jiraApiToken: z.string().optional().describe("API token (fallback only)")
});

export type Config = z.infer<typeof configSchema>;

// Tool schema types
interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required: string[];
  };
}

/**
 * Next-Generation Jira MCP Server - User-Friendly OAuth Implementation
 * Features:
 * - OAuth 2.1 with PKCE (no admin required!)
 * - API token fallback (enterprise compatibility)
 * - Protected Resource Metadata (RFC 9728)
 * - 65+ focused tools + advanced analytics
 * - Seamless user experience
 */
export default function createServer({ config }: { config: Config }) {
  const server = new Server(
    {
      name: 'jira-mcp-oauth',
      version: '4.0.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {}, // For OAuth metadata discovery
      },
    }
  );

  // Component instances
  let jiraClient: JiraApiClient | null = null;
  let oauthManager: JiraOAuthManager | null = null;
  let dashboardGenerator: DashboardGenerator | null = null;
  let analyticsEngine: AdvancedAnalyticsEngine | null = null;
  let toolRegistry: JiraToolRegistry | null = null;
  let isAuthenticated = false;

  /**
   * Initialize OAuth manager (always available)
   */
  function initializeOAuthManager(): JiraOAuthManager {
    if (!oauthManager) {
      oauthManager = new JiraOAuthManager(config.companyUrl);
    }
    return oauthManager;
  }

  /**
   * Initialize components after successful authentication
   */
  function initializeComponents(accessToken?: string): void {
    if (jiraClient && isAuthenticated) return;

    const jiraConfig: JiraConfig = {
      baseUrl: config.companyUrl,
      email: config.userEmail,
      authMethod: config.authMethod
    };

    // Set credentials based on auth method
    if (config.authMethod === 'oauth' && accessToken) {
      jiraConfig.accessToken = accessToken;
      jiraConfig.authMethod = 'oauth';
    } else if (config.jiraApiToken) {
      jiraConfig.apiToken = config.jiraApiToken;
      jiraConfig.authMethod = 'token';
    } else {
      // Will be handled by tools that require authentication
      return;
    }

    // Initialize all components
    jiraClient = new JiraApiClient(jiraConfig);
    dashboardGenerator = new DashboardGenerator(jiraClient);
    analyticsEngine = new AdvancedAnalyticsEngine(jiraClient);
    toolRegistry = new JiraToolRegistry(jiraClient);
    isAuthenticated = true;
  }

  /**
   * Protected Resource Metadata (RFC 9728) - OAuth Discovery
   */
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      {
        uri: '/.well-known/oauth-protected-resource',
        name: 'OAuth Protected Resource Metadata',
        description: 'RFC 9728 metadata for OAuth discovery',
        mimeType: 'application/json'
      },
      {
        uri: '/oauth/status',
        name: 'OAuth Authentication Status',
        description: 'Current authentication status and user info',
        mimeType: 'application/json'
      }
    ]
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    
    if (uri === '/.well-known/oauth-protected-resource') {
      const manager = initializeOAuthManager();
      return {
        contents: [{
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(manager.getResourceMetadata(), null, 2)
        }]
      };
    }
    
    if (uri === '/oauth/status') {
      return {
        contents: [{
          uri,
          mimeType: 'application/json',
          text: JSON.stringify({
            authenticated: isAuthenticated,
            authMethod: config.authMethod,
            userEmail: config.userEmail,
            companyUrl: config.companyUrl,
            timestamp: new Date().toISOString()
          }, null, 2)
        }]
      };
    }
    
    throw new Error(`Resource not found: ${uri}`);
  });

  /**
   * Enhanced Tool Definitions - OAuth + Analytics + CRUD
   */
  function getToolDefinitions(): ToolDefinition[] {
    const tools: ToolDefinition[] = [
      // OAuth Connection Tool (always available)
      {
        name: 'jira_connect',
        description: 'Connect to Jira using OAuth (recommended) or API token',
        inputSchema: {
          type: 'object',
          properties: {
            forceApiToken: {
              type: 'boolean',
              description: 'Force API token authentication instead of OAuth',
              default: false
            }
          },
          required: []
        }
      },
      
      // Authentication Status
      {
        name: 'jira_auth_status',
        description: 'Check current authentication status and method',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      }
    ];

    // Add protected tools only if authenticated
    if (isAuthenticated) {
      tools.push(
        // Core CRUD Operations
        {
          name: 'jira_get_issue',
          description: 'Get detailed issue information',
          inputSchema: {
            type: 'object',
            properties: {
              issueKey: { type: 'string', description: 'Issue key (e.g., "PROJ-123")' },
              expand: { type: 'array', items: { type: 'string' }, description: 'Fields to expand' }
            },
            required: ['issueKey']
          }
        },
        {
          name: 'jira_search',
          description: 'Search issues using JQL',
          inputSchema: {
            type: 'object',
            properties: {
              jql: { type: 'string', description: 'JQL query string' },
              maxResults: { type: 'number', description: 'Max results (1-1000)', default: 50 }
            },
            required: ['jql']
          }
        },
        {
          name: 'jira_create_issue',
          description: 'Create new Jira issue',
          inputSchema: {
            type: 'object',
            properties: {
              projectKey: { type: 'string', description: 'Project key' },
              issueType: { type: 'string', description: 'Issue type' },
              summary: { type: 'string', description: 'Issue summary' },
              description: { type: 'string', description: 'Issue description' }
            },
            required: ['projectKey', 'issueType', 'summary']
          }
        },
        {
          name: 'jira_update_issue',
          description: 'Update existing issue',
          inputSchema: {
            type: 'object',
            properties: {
              issueKey: { type: 'string', description: 'Issue key to update' },
              fields: { type: 'object', description: 'Fields to update' }
            },
            required: ['issueKey', 'fields']
          }
        },

        // Discovery Tools
        {
          name: 'jira_get_projects',
          description: 'List all accessible projects',
          inputSchema: { type: 'object', properties: {}, required: [] }
        },
        {
          name: 'jira_get_issue_types',
          description: 'Get available issue types',
          inputSchema: {
            type: 'object',
            properties: {
              projectKey: { type: 'string', description: 'Project key (optional)' }
            },
            required: []
          }
        },

        // Advanced Analytics (existing features)
        {
          name: 'test_jira_connection',
          description: 'Test connection and show available capabilities',
          inputSchema: { type: 'object', properties: {}, required: [] }
        },
        {
          name: 'get_sprint_burndown',
          description: 'Generate sprint burndown analytics with visualization',
          inputSchema: {
            type: 'object',
            properties: {
              projectKey: { type: 'string', description: 'Project key' },
              sprintId: { type: 'string', description: 'Sprint ID (optional)' }
            },
            required: ['projectKey']
          }
        },
        {
          name: 'get_team_velocity',
          description: 'Analyze team velocity trends',
          inputSchema: {
            type: 'object',
            properties: {
              projectKey: { type: 'string', description: 'Project key' },
              sprintCount: { type: 'number', description: 'Sprints to analyze', default: 6 }
            },
            required: ['projectKey']
          }
        }
      );
    }

    return tools;
  }

  // Dynamic tool listing based on authentication state
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: getToolDefinitions()
  }));

  // Enhanced tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
    const startTime = Date.now();
    const { name, arguments: args } = request.params;
    
    try {
      // Handle OAuth and connection tools (always available)
      if (name === 'jira_connect') {
        return await handleJiraConnect(args);
      }
      
      if (name === 'jira_auth_status') {
        return await handleAuthStatus();
      }

      // Check authentication for protected tools
      if (!isAuthenticated) {
        return {
          content: [{
            type: 'text',
            text: '🔐 **Authentication Required**\n\n' +
                  'Please connect to Jira first:\n\n' +
                  '• Run `jira_connect` for OAuth login (recommended)\n' +
                  '• Or run `jira_connect` with `forceApiToken: true` for API token auth\n\n' +
                  '✨ OAuth is user-friendly - no admin setup required!'
          }]
        };
      }

      // Handle protected tools
      return await handleProtectedTool(name, args);
      
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`Tool ${name} failed after ${duration}ms:`, error);
      
      return {
        content: [{
          type: 'text',
          text: `❌ **Error in ${name}**: ${error instanceof Error ? error.message : 'Unknown error'}`
        }]
      };
    }
  });

  /**
   * Handle Jira Connection (OAuth or API Token)
   */
  async function handleJiraConnect(args: any) {
    const forceApiToken = args?.forceApiToken === true;
    
    try {
      // API Token Mode
      if (forceApiToken || config.authMethod === 'token') {
        if (!config.jiraApiToken) {
          return {
            content: [{
              type: 'text',
              text: '🔑 **API Token Required**\n\n' +
                    'Please provide your Jira API token in the server configuration.\n\n' +
                    '**How to get an API token:**\n' +
                    '1. Go to: https://id.atlassian.com/manage-profile/security/api-tokens\n' +
                    '2. Click "Create API token"\n' +
                    '3. Copy the token and add it to your server config\n\n' +
                    '💡 **Prefer OAuth?** Run `jira_connect` without `forceApiToken` for a better experience!'
            }]
          };
        }
        
        initializeComponents();
        const testResult = await jiraClient!.testConnection();
        
        if (testResult) {
          return {
            content: [{
              type: 'text',
              text: '✅ **Connected via API Token!**\n\n' +
                    `Connected to: ${config.companyUrl}\n` +
                    `User: ${config.userEmail}\n` +
                    `Auth: API Token\n\n` +
                    '🚀 **Ready!** All 65+ tools are now available.\n' +
                    'Try: `jira_get_projects` or `test_jira_connection`'
            }]
          };
        }
      }
      
      // OAuth Mode (default and recommended)
      const manager = initializeOAuthManager();
      const { authUrl, state } = manager.generateAuthUrl(config.userEmail);
      
      return {
        content: [{
          type: 'text',
          text: '🔐 **OAuth Login to Jira**\n\n' +
                '**Step 1:** Click the link below to login with your existing Jira credentials:\n\n' +
                `🔗 **[Login to ${config.companyUrl}](${authUrl})**\n\n` +
                '**Step 2:** After login, you\'ll be redirected back automatically.\n\n' +
                '**Step 3:** Run this command again to complete the connection.\n\n' +
                '✨ **Benefits of OAuth:**\n' +
                '• No admin setup required\n' +
                '• Uses your existing Jira permissions\n' +
                '• Secure and industry-standard\n' +
                '• Works immediately\n\n' +
                `**Session State:** \`${state}\`\n\n` +
                '🔄 **Having issues?** Try `jira_connect` with `forceApiToken: true` as fallback.'
        }]
      };
      
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `❌ **Connection Error**: ${error instanceof Error ? error.message : 'Unknown error'}\n\n` +
                '🔄 **Try these solutions:**\n' +
                '• Check your company URL is correct\n' +
                '• Verify your email address\n' +
                '• Try API token fallback: `jira_connect` with `forceApiToken: true`'
        }]
      };
    }
  }

  /**
   * Handle Authentication Status Check
   */
  async function handleAuthStatus() {
    const manager = initializeOAuthManager();
    const stats = manager.getSessionStats();
    
    return {
      content: [{
        type: 'text',
        text: `🔍 **Authentication Status**\n\n` +
              `**Authenticated:** ${isAuthenticated ? '✅ Yes' : '❌ No'}\n` +
              `**Method:** ${isAuthenticated ? (jiraClient?.getAuthMethod() || 'unknown') : 'none'}\n` +
              `**Company:** ${config.companyUrl}\n` +
              `**User:** ${config.userEmail}\n` +
              `**Preferred Method:** ${config.authMethod}\n\n` +
              `**OAuth Sessions:** ${stats.activeSessions} active\n\n` +
              `${!isAuthenticated ? '💡 **Run `jira_connect` to authenticate**' : '✅ **Ready to use all tools!**'}`
      }]
    };
  }

  /**
   * Handle authenticated/protected tools
   */
  async function handleProtectedTool(name: string, args: any) {
    // Check if this is a focused tool from the registry
    if (toolRegistry && toolRegistry.hasTool(name)) {
      const tool = toolRegistry.getTool(name);
      if (tool) {
        return await tool.execute(args);
      }
    }

    // Handle built-in tools
    switch (name) {
      case 'test_jira_connection':
        return await testConnectionEnhanced();
        
      case 'jira_get_projects':
        return await listProjectsEnhanced();
        
      case 'get_sprint_burndown':
        if (!dashboardGenerator) throw new Error('Dashboard generator not initialized');
        return await dashboardGenerator.generateSprintBurndown(
          args?.projectKey as string,
          args?.sprintId as string | undefined
        );
        
      case 'get_team_velocity':
        if (!dashboardGenerator) throw new Error('Dashboard generator not initialized');
        return await dashboardGenerator.generateTeamVelocity(
          args?.projectKey as string,
          args?.sprintCount as number | undefined
        );
        
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  /**
   * Enhanced connection test with authentication info
   */
  async function testConnectionEnhanced() {
    try {
      if (!jiraClient) throw new Error('Jira client not initialized');
      
      const isConnected = await jiraClient.testConnection();
      const authMethod = jiraClient.getAuthMethod();
      
      if (isConnected) {
        return {
          content: [{
            type: 'text',
            text: '✅ **Jira Connection Successful!**\n\n' +
                  `**Connected to:** ${config.companyUrl}\n` +
                  `**User:** ${config.userEmail}\n` +
                  `**Auth Method:** ${authMethod.toUpperCase()}\n` +
                  `**Status:** ${authMethod === 'oauth' ? 'OAuth 2.1 Active 🔐' : 'API Token Active 🔑'}\n\n` +
                  '🚀 **Available Features:**\n' +
                  '• ✅ 65+ focused Jira tools\n' +
                  '• 📊 Advanced sprint analytics\n' +
                  '• 📈 Burndown & velocity charts\n' +
                  '• 🎯 Goal tracking & insights\n' +
                  '• 🔍 Smart issue search & management\n\n' +
                  '💡 **Quick Start:**\n' +
                  '• `jira_get_projects` - List your projects\n' +
                  '• `jira_search "project = PROJ"` - Search issues\n' +
                  '• `get_sprint_burndown projectKey="PROJ"` - Sprint analytics\n\n' +
                  '🎉 **Ready for comprehensive Jira automation!**'
          }]
        };
      } else {
        return {
          content: [{
            type: 'text',
            text: '❌ **Connection Failed**\n\nPlease check your credentials and try reconnecting with `jira_connect`.'
          }]
        };
      }
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `❌ **Connection Error**: ${error instanceof Error ? error.message : 'Unknown error'}`
        }]
      };
    }
  }

  /**
   * Enhanced project listing with usage examples
   */
  async function listProjectsEnhanced() {
    try {
      if (!jiraClient) throw new Error('Jira client not initialized');
      
      const projects = await jiraClient.getProjects();
      
      if (projects.length === 0) {
        return {
          content: [{
            type: 'text',
            text: '📭 **No Projects Found**\n\nNo accessible projects found. Please check your permissions.'
          }]
        };
      }

      const projectList = projects
        .slice(0, 10) // Show first 10
        .map(project => `• **${project.key}** - ${project.name}`)
        .join('\n');

      const hasMore = projects.length > 10;

      return {
        content: [{
          type: 'text',
          text: `📋 **Accessible Jira Projects** (${projects.length} total)\n\n` +
                `${projectList}\n` +
                `${hasMore ? `\n..and ${projects.length - 10} more projects\n` : ''}\n` +
                `🛠️ **Available Actions:**\n` +
                `• \`jira_search "project = ${projects[0].key}"\` - Search issues\n` +
                `• \`jira_get_issue ${projects[0].key}-1\` - Get specific issue\n` +
                `• \`jira_create_issue\` - Create new issue\n` +
                `• \`get_sprint_burndown projectKey="${projects[0].key}"\` - Sprint analytics\n\n` +
                `🚀 **OAuth Status:** ${isAuthenticated && jiraClient?.getAuthMethod() === 'oauth' ? '✅ Active' : '🔑 API Token'}`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `❌ **Error listing projects**: ${error instanceof Error ? error.message : 'Unknown error'}`
        }]
      };
    }
  }

  return server;
}