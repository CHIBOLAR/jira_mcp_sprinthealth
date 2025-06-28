// Jira MCP Sprint Health Server - Smithery Compatible Entry Point

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolRequest,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { JiraApiClient } from './jira-client.js';
import { DashboardGenerator } from './dashboard-generator.js';
import { AdvancedAnalyticsEngine } from './advanced-analytics.js';
import { ErrorHandler, PerformanceMonitor } from './error-handler.js';
import { JiraToolRegistry } from './tools/tool-registry.js';
import { JiraConfig } from '../types/index.js';

// Configuration schema for Smithery - MUST match smithery.yaml
export const configSchema = z.object({
  jiraBaseUrl: z.string().describe("Base URL for your Jira instance (e.g., https://company.atlassian.net)"),
  jiraEmail: z.string().describe("Email address for Jira authentication"),
  jiraApiToken: z.string().describe("API token for Jira authentication")
});

export type Config = z.infer<typeof configSchema>;

/**
 * Enhanced Jira MCP Server - Smithery Compatible
 * Features: 65 focused tools + existing analytics capabilities
 * Deployment: Smithery-ready production system
 */
export default function createServer({ config }: { config: Config }) {
  const server = new Server(
    {
      name: 'jira-mcp-sprinthealth',
      version: '3.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Lazy-initialized components
  let jiraClient: JiraApiClient | null = null;
  let dashboardGenerator: DashboardGenerator | null = null;
  let analyticsEngine: AdvancedAnalyticsEngine | null = null;
  let toolRegistry: JiraToolRegistry | null = null;

  /**
   * Initialize components only when needed (lazy loading)
   */
  function ensureComponentsInitialized(): void {
    if (jiraClient) return; // Already initialized

    // Convert config to JiraConfig format
    const jiraConfig: JiraConfig = {
      baseUrl: config.jiraBaseUrl,
      email: config.jiraEmail,
      apiToken: config.jiraApiToken
    };

    // Initialize components
    jiraClient = new JiraApiClient(jiraConfig);
    dashboardGenerator = new DashboardGenerator(jiraClient);
    analyticsEngine = new AdvancedAnalyticsEngine(jiraClient);
    toolRegistry = new JiraToolRegistry(jiraClient);
  }

  /**
   * Get static tool definitions for schema discovery (no components required)
   */
  function getStaticToolDefinitions() {
    return [
      // Core CRUD Operations
      {
        name: 'jira_get_issue',
        description: 'Retrieve single issue details with comprehensive information',
        inputSchema: {
          type: 'object',
          properties: {
            issueKey: { 
              type: 'string', 
              description: 'Jira issue key (e.g., "PROJ-123")' 
            },
            expand: { 
              type: 'array', 
              items: { type: 'string' },
              description: 'Additional fields to expand (optional)' 
            }
          },
          required: ['issueKey']
        }
      },
      {
        name: 'jira_search',
        description: 'JQL-based issue search with pagination support',
        inputSchema: {
          type: 'object',
          properties: {
            jql: { 
              type: 'string', 
              description: 'JQL query string (e.g., "project = PROJ AND status = Open")' 
            },
            startAt: { 
              type: 'number', 
              description: 'Starting index for pagination (default: 0)' 
            },
            maxResults: { 
              type: 'number', 
              description: 'Maximum results to return (1-1000, default: 50)' 
            }
          },
          required: ['jql']
        }
      },
      {
        name: 'jira_create_issue',
        description: 'Create new Jira issue with required and optional fields',
        inputSchema: {
          type: 'object',
          properties: {
            projectKey: { type: 'string', description: 'Project key (e.g., "PROJ")' },
            issueType: { type: 'string', description: 'Issue type (e.g., "Task", "Bug", "Story")' },
            summary: { type: 'string', description: 'Issue summary/title' },
            description: { type: 'string', description: 'Issue description (optional)' }
          },
          required: ['projectKey', 'issueType', 'summary']
        }
      },
      {
        name: 'jira_update_issue',
        description: 'Update existing Jira issue fields',
        inputSchema: {
          type: 'object',
          properties: {
            issueKey: { type: 'string', description: 'Issue key to update' },
            fields: { type: 'object', description: 'Fields to update' }
          },
          required: ['issueKey', 'fields']
        }
      },
      {
        name: 'jira_get_projects',
        description: 'List all accessible Jira projects',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'jira_get_issue_types',
        description: 'Get available issue types for a project',
        inputSchema: {
          type: 'object',
          properties: {
            projectKey: { type: 'string', description: 'Project key (optional)' }
          },
          required: []
        }
      }
    ];
  }

  // Setup tool handlers
  const focusedTools = getStaticToolDefinitions();

  // List all available tools including focused tools and analytics
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      // Focused Tools (static definitions)
      ...focusedTools,
      
      // Existing Analytics Tools (maintained for compatibility)
      {
        name: 'test_jira_connection',
        description: 'Test connection to Jira instance and verify credentials with detailed diagnostics',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'list_projects',
        description: 'List all accessible Jira projects with enhanced project information',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'get_sprint_burndown',
        description: 'Get sprint burndown chart data with enhanced analytics and visual artifacts',
        inputSchema: {
          type: 'object',
          properties: {
            projectKey: { type: 'string', description: 'Jira project key (e.g., "PROJ")' },
            sprintId: { type: 'string', description: 'Sprint ID (optional, defaults to active sprint)' }
          },
          required: ['projectKey']
        }
      },
      {
        name: 'get_team_velocity',
        description: 'Calculate team velocity over last N sprints with advanced trend analysis',
        inputSchema: {
          type: 'object',
          properties: {
            projectKey: { type: 'string', description: 'Jira project key (e.g., "PROJ")' },
            sprintCount: { type: 'number', description: 'Number of sprints to analyze (default: 6)', default: 6 }
          },
          required: ['projectKey']
        }
      }
    ]
  }));

  // Enhanced tool call handler with focused tools integration
  server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
    const startTime = Date.now();
    PerformanceMonitor.startTimer(`tool_${request.params.name}`);
    
    try {
      const result = await handleToolCall(request);
      const duration = PerformanceMonitor.endTimer(`tool_${request.params.name}`);
      
      return result;
    } catch (error) {
      PerformanceMonitor.endTimer(`tool_${request.params.name}`);
      
      // Enhanced error handling with context
      if ((error as any).code && (error as any).troubleshooting) {
        return ErrorHandler.formatForMCP(error as any);
      }
      
      const errorContext: { operation?: string; projectKey?: string } = {
        operation: request.params.name
      };
      if (request.params.arguments?.projectKey) {
        errorContext.projectKey = request.params.arguments.projectKey as string;
      }
      
      const categorizedError = ErrorHandler.categorizeAndHandle(error, errorContext);
      
      return ErrorHandler.formatForMCP(categorizedError);
    }
  });

  /**
   * Enhanced tool call handler with lazy component initialization
   */
  async function handleToolCall(request: CallToolRequest) {
    const { name, arguments: args } = request.params;

    // Initialize components only when needed
    ensureComponentsInitialized();

    // Check if this is a focused tool from the registry
    if (toolRegistry && toolRegistry.hasTool(name)) {
      const tool = toolRegistry.getTool(name);
      if (tool) {
        return await tool.execute(args);
      }
    }

    // Handle existing analytics tools (maintained for compatibility)
    switch (name) {
      case 'test_jira_connection':
        return await testConnectionEnhanced();
      
      case 'list_projects':
        return await listProjectsEnhanced();
      
      case 'get_sprint_burndown':
        if (!dashboardGenerator) throw new Error('Components not initialized');
        return await dashboardGenerator.generateSprintBurndown(
          args?.projectKey as string,
          args?.sprintId as string | undefined
        );
      
      case 'get_team_velocity':
        if (!dashboardGenerator) throw new Error('Components not initialized');
        return await dashboardGenerator.generateTeamVelocity(
          args?.projectKey as string,
          args?.sprintCount as number | undefined
        );
      
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  /**
   * Enhanced connection test
   */
  async function testConnectionEnhanced() {
    try {
      if (!jiraClient) throw new Error('Components not initialized');
      
      const isConnected = await jiraClient.testConnection();
      
      if (isConnected) {
        return {
          content: [{
            type: 'text',
            text: '✅ **Jira Connection Successful!**\n\n' +
                  'Your Jira instance is accessible and credentials are valid.\n\n' +
                  '🚀 **Focused Tools Implementation Active:**\n' +
                  `• ✅ 65+ tools available\n` +
                  `• 📋 Full CRUD operations\n` +
                  `• 🎯 Advanced analytics ready\n\n` +
                  '💡 **Available Tool Categories:**\n' +
                  '• ✅ Core CRUD Operations (get, search, create, update, delete)\n' +
                  '• ✅ Configuration & Metadata (issue types, priorities, statuses)\n' +
                  '• ✅ User & Permission Management\n' +
                  '• ✅ Bulk Operations\n' +
                  '• 📅 Advanced Issue Management\n\n' +
                  '💡 **Ready for comprehensive Jira automation!**'
          }]
        };
      } else {
        return {
          content: [{
            type: 'text',
            text: '❌ **Jira Connection Failed**\n\nPlease check your credentials and instance URL.'
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
   * Enhanced project listing
   */
  async function listProjectsEnhanced() {
    try {
      if (!jiraClient) throw new Error('Components not initialized');
      
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
        .map(project => `• **${project.key}** - ${project.name} ${project.projectTypeKey ? `(${project.projectTypeKey})` : ''}`)
        .join('\n');

      return {
        content: [{
          type: 'text',
          text: `📋 **Accessible Jira Projects** (${projects.length} found)\n\n${projectList}\n\n` +
                `🛠️ **Available Tools** (65+ implemented):\n` +
                `• \`jira_get_issue PROJ-123\` - Get issue details\n` +
                `• \`jira_search "project = ${projects[0].key}"\` - Search issues\n` +
                `• \`jira_create_issue\` - Create new issues\n` +
                `• \`jira_update_issue PROJ-123\` - Update issues\n` +
                `• \`jira_get_issue_types\` - List available issue types\n\n` +
                `🚀 **Example Usage:**\n` +
                `• Get issue: \`jira_get_issue ${projects[0].key}-1\`\n` +
                `• Search: \`jira_search "project = ${projects[0].key} AND status = Open"\`\n` +
                `• Create: \`jira_create_issue\` with projectKey="${projects[0].key}"`
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
