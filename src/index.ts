// Jira MCP Sprint Health Server - Production Entry Point

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolRequest,
} from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';
import { JiraApiClient } from './jira-client.js';
import { DashboardGenerator } from './dashboard-generator.js';
import { AdvancedAnalyticsEngine } from './advanced-analytics.js';
import { ErrorHandler, PerformanceMonitor } from './error-handler.js';
import { ConfigurationManager } from './config-manager.js';
import { JiraToolRegistry } from './tools/tool-registry.js';
import { JiraConfig, MCPToolResponse } from '../types/index.js';

// Load environment variables
dotenv.config();

/**
 * Enhanced Jira MCP Server - Focused 65 Tools Implementation
 * Features: 65 focused tools + existing analytics capabilities
 * Deployment: Smithery-ready production system
 */
class JiraMCPServer {
  private server: Server;
  private jiraClient: JiraApiClient;
  private dashboardGenerator: DashboardGenerator;
  private analyticsEngine: AdvancedAnalyticsEngine;
  private configManager: ConfigurationManager;
  private toolRegistry: JiraToolRegistry;

  constructor() {
    this.configManager = ConfigurationManager.getInstance();
    
    // Initialize server with enhanced capabilities
    this.server = new Server(
      {
        name: 'jira-mcp-focused-tools',
        version: '3.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Initialize components with graceful degradation for deployment scanning
    this.initializeComponents();
    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  /**
   * Initialize components with graceful degradation for deployment scanning
   */
  private initializeComponents(): void {
    // Always create mock/placeholder components for schema discovery
    // The actual validation will happen when tools are called
    const mockConfig: JiraConfig = {
      baseUrl: 'https://example.atlassian.net',
      email: 'user@example.com',
      apiToken: 'placeholder'
    };
    
    // Initialize components in schema-only mode
    // Real configuration will be validated when tools are executed
    this.jiraClient = new JiraApiClient(mockConfig);
    this.dashboardGenerator = new DashboardGenerator(this.jiraClient);
    this.analyticsEngine = new AdvancedAnalyticsEngine(this.jiraClient);
    this.toolRegistry = new JiraToolRegistry(this.jiraClient);
    
    console.error('✅ Jira components initialized for schema discovery');
  }

  /**
   * Check if server has valid Jira configuration
   */
  private hasValidConfiguration(): boolean {
    try {
      const validation = this.configManager.validateConfiguration();
      return validation.valid;
    } catch {
      return false;
    }
  }

  /**
   * Enhanced configuration validation
   */
  private validateConfiguration(): JiraConfig {
    try {
      const validation = this.configManager.validateConfiguration();
      
      if (!validation.valid) {
        throw ErrorHandler.handleConfigError(validation.errors);
      }
      
      return this.configManager.getJiraConfig();
    } catch (error) {
      if ((error as any).code === 'CONFIG_ERROR') {
        throw error;
      }
      throw ErrorHandler.handleConfigError(['JIRA_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN']);
    }
  }
  /**
   * Setup enhanced error handling
   */
  private setupErrorHandling(): void {
    process.on('uncaughtException', (error) => {
      console.error('❌ Uncaught Exception:', error);
      // Don't exit immediately, log and continue
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
      // Don't exit immediately, log and continue
    });
  }

  /**
   * Setup comprehensive MCP tool handlers - Focused 65 Tools + Analytics
   */
  private setupToolHandlers(): void {
    // Get all tool definitions from registry
    const focusedTools = this.toolRegistry.getToolDefinitions();
    const stats = this.toolRegistry.getStats();

    // List all available tools including focused tools and analytics
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        // Focused Tools from Registry
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
    this.server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
      const startTime = Date.now();
      PerformanceMonitor.startTimer(`tool_${request.params.name}`);
      
      try {
        const result = await this.handleToolCall(request);
        const duration = PerformanceMonitor.endTimer(`tool_${request.params.name}`);
        
        // Add performance metadata to response
        if (this.configManager.getEnvironmentConfig().enablePerformanceLogging) {
          console.error(`✅ Tool '${request.params.name}' completed in ${PerformanceMonitor.formatDuration(duration)}`);
        }
        
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
  }

  /**
   * Enhanced tool call handler with focused tools + analytics
   */
  private async handleToolCall(request: CallToolRequest) {
    const { name, arguments: args } = request.params;

    // Check if we have valid Jira configuration before executing tools
    try {
      this.validateConfiguration();
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `❌ **Configuration Required**\n\n` +
                `This Jira MCP server requires valid credentials to execute tools.\n\n` +
                `**Required Environment Variables:**\n` +
                `• JIRA_URL - Your Jira instance URL (e.g., https://company.atlassian.net)\n` +
                `• JIRA_EMAIL - Your Jira account email\n` +
                `• JIRA_API_TOKEN - Your Jira API token\n\n` +
                `**To get an API token:**\n` +
                `1. Go to https://id.atlassian.com/manage-profile/security/api-tokens\n` +
                `2. Create a new API token\n` +
                `3. Copy it to your JIRA_API_TOKEN environment variable\n\n` +
                `**Tool attempted:** \`${name}\``
        }]
      };
    }

    // Check if this is a focused tool from the registry
    if (this.toolRegistry.hasTool(name)) {
      const tool = this.toolRegistry.getTool(name);
      if (tool) {
        return await tool.execute(args);
      }
    }

    // Handle existing analytics tools (maintained for compatibility)
    switch (name) {
      case 'test_jira_connection':
        return await this.testConnectionEnhanced();
      
      case 'list_projects':
        return await this.listProjectsEnhanced();
      
      case 'get_sprint_burndown':
        return await this.dashboardGenerator.generateSprintBurndown(
          args?.projectKey as string,
          args?.sprintId as string | undefined
        );
      
      case 'get_team_velocity':
        return await this.dashboardGenerator.generateTeamVelocity(
          args?.projectKey as string,
          args?.sprintCount as number | undefined
        );
      
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  /**
   * Enhanced connection test with focused tools information
   */
  private async testConnectionEnhanced() {
    try {
      const isConnected = await this.jiraClient.testConnection();
      const configStatus = this.configManager.getConfigurationStatus();
      const stats = this.toolRegistry.getStats();
      
      if (isConnected) {
        return {
          content: [{
            type: 'text',
            text: '✅ **Jira Connection Successful!**\n\n' +
                  'Your Jira instance is accessible and credentials are valid.\n\n' +
                  `${configStatus}\n\n` +
                  '🚀 **Focused Tools Implementation Active:**\n' +
                  `• ✅ ${stats.implemented} tools implemented\n` +
                  `• 📋 ${stats.planned} tools planned\n` +
                  `• 🎯 ${Math.round((stats.implemented / stats.total) * 100)}% completion\n\n` +
                  '💡 **Available Tool Categories:**\n' +
                  '• ✅ Core CRUD Operations (get, search, create, update, delete)\n' +
                  '• ✅ Configuration & Metadata (issue types, priorities, statuses)\n' +
                  '• 📅 User & Permission Management (coming soon)\n' +
                  '• 📅 Bulk Operations (coming soon)\n' +
                  '• 📅 Advanced Issue Management (coming soon)\n\n' +
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
      throw error;
    }
  }

  /**
   * Enhanced project listing with focused tools integration
   */
  private async listProjectsEnhanced() {
    try {
      const projects = await this.jiraClient.getProjects();
      const stats = this.toolRegistry.getStats();
      
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
                `🛠️ **Available Tools** (${stats.implemented}/${stats.total} implemented):\n` +
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
      throw error;
    }
  }

  /**
   * Start the enhanced MCP server with focused tools
   */
  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    // Enhanced startup logging
    const stats = this.toolRegistry.getStats();
    const hasValidConfig = this.hasValidConfiguration();
    
    console.error('🚀 Enhanced Jira MCP Server (Focused Tools) started');
    console.error(`🛠️ Tools: ${stats.implemented}/${stats.total} implemented (${Math.round((stats.implemented / stats.total) * 100)}%)`);
    console.error(`🔧 Configuration: ${hasValidConfig ? '✅ Ready' : '⚠️ Schema-only mode (credentials required for execution)'}`);
    console.error(`📊 Smithery Ready: ✅ Schema discovery enabled`);
    
    if (!hasValidConfig) {
      console.error('💡 To enable full functionality, configure: JIRA_URL, JIRA_EMAIL, JIRA_API_TOKEN');
    } else {
      try {
        const envConfig = this.configManager.getEnvironmentConfig();
        if (envConfig.enableDebugLogging) {
          console.error('🐛 Debug logging enabled');
        }
        if (envConfig.enablePerformanceLogging) {
          console.error('⚡ Performance monitoring enabled');
        }
      } catch (error) {
        // Environment config unavailable, continue silently
      }
    }
  }
}

// Start the enhanced server
const server = new JiraMCPServer();
server.run().catch((error) => {
  console.error('❌ Failed to start Enhanced Jira MCP Server:', error);
  if (error.code === 'CONFIG_ERROR') {
    console.error('\n💡 Configuration help:');
    console.error('1. Copy .env.example to .env');
    console.error('2. Fill in your Jira credentials');
    console.error('3. Get API token from: https://id.atlassian.com/manage-profile/security/api-tokens');
  }
  process.exit(1);
});
