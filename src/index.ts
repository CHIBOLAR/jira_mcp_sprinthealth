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
  private jiraClient: JiraApiClient | null = null;
  private dashboardGenerator: DashboardGenerator | null = null;
  private analyticsEngine: AdvancedAnalyticsEngine | null = null;
  private configManager: ConfigurationManager;
  private toolRegistry: JiraToolRegistry | null = null;

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

    // No component initialization - fully lazy loading
    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  /**
   * Lazy initialize components only when needed
   */
  private ensureComponentsInitialized(): void {
    if (this.jiraClient) return; // Already initialized

    // Validate configuration before creating components
    const config = this.validateConfiguration();
    
    // Initialize components with valid config
    this.jiraClient = new JiraApiClient(config);
    this.dashboardGenerator = new DashboardGenerator(this.jiraClient);
    this.analyticsEngine = new AdvancedAnalyticsEngine(this.jiraClient);
    this.toolRegistry = new JiraToolRegistry(this.jiraClient);
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
   * Get comprehensive tool definitions - combines registry tools with static fallback for Smithery
   * This approach ensures Smithery can cache tool schemas while providing full functionality when configured
   */
  private getToolDefinitions() {
    // For Smithery compatibility: Always provide static comprehensive definitions for schema discovery
    // This allows Smithery to cache and display all available tools even without credentials
    return [
      // 🚀 CORE CRUD OPERATIONS (10 tools)
      {
        name: 'jira_get_issue',
        description: 'Retrieve single issue details with comprehensive information',
        inputSchema: {
          type: 'object',
          properties: {
            issueKey: { type: 'string', description: 'Jira issue key (e.g., "PROJ-123")' },
            expand: { type: 'array', items: { type: 'string' }, description: 'Additional fields to expand (optional)' }
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
            jql: { type: 'string', description: 'JQL query string (e.g., "project = PROJ AND status = Open")' },
            startAt: { type: 'number', description: 'Starting index for pagination (default: 0)' },
            maxResults: { type: 'number', description: 'Maximum results to return (1-1000, default: 50)' },
            fields: { type: 'array', items: { type: 'string' }, description: 'Specific fields to include in results (optional)' }
          },
          required: ['jql']
        }
      },
      {
        name: 'jira_create_issue',
        description: 'Create new Jira issues with comprehensive field support',
        inputSchema: {
          type: 'object',
          properties: {
            projectKey: { type: 'string', description: 'Project key (e.g., "PROJ")' },
            summary: { type: 'string', description: 'Issue summary/title' },
            description: { type: 'string', description: 'Issue description (optional)' },
            issueType: { type: 'string', description: 'Issue type name (e.g., "Story", "Bug", "Task")' },
            priority: { type: 'string', description: 'Priority name (e.g., "High", "Medium", "Low") (optional)' },
            assignee: { type: 'string', description: 'Assignee account ID (optional)' },
            labels: { type: 'array', items: { type: 'string' }, description: 'Labels to add (optional)' },
            parentKey: { type: 'string', description: 'Parent issue key for subtasks (optional)' }
          },
          required: ['projectKey', 'summary', 'issueType']
        }
      },
      {
        name: 'jira_update_issue',
        description: 'Update existing Jira issues with flexible field modifications',
        inputSchema: {
          type: 'object',
          properties: {
            issueKey: { type: 'string', description: 'Issue key to update (e.g., "PROJ-123")' },
            summary: { type: 'string', description: 'New summary (optional)' },
            description: { type: 'string', description: 'New description (optional)' },
            priority: { type: 'string', description: 'New priority (optional)' },
            assignee: { type: 'string', description: 'New assignee account ID (optional, use "unassigned" to remove)' },
            labels: { type: 'array', items: { type: 'string' }, description: 'New labels array (optional)' },
            notifyUsers: { type: 'boolean', description: 'Send notifications to watchers (default: true)' }
          },
          required: ['issueKey']
        }
      },
      {
        name: 'jira_delete_issue',
        description: 'Delete Jira issues with safety checks and subtask handling',
        inputSchema: {
          type: 'object',
          properties: {
            issueKey: { type: 'string', description: 'Issue key to delete (e.g., "PROJ-123")' },
            deleteSubtasks: { type: 'boolean', description: 'Delete subtasks along with parent issue (default: false)' },
            confirmDeletion: { type: 'boolean', description: 'Required confirmation for deletion (must be true)' }
          },
          required: ['issueKey', 'confirmDeletion']
        }
      },
      {
        name: 'jira_get_transitions',
        description: 'Get available workflow transitions for an issue',
        inputSchema: {
          type: 'object',
          properties: {
            issueKey: { type: 'string', description: 'Issue key to get transitions for (e.g., "PROJ-123")' }
          },
          required: ['issueKey']
        }
      },
      {
        name: 'jira_transition_issue',
        description: 'Execute workflow transitions on Jira issues',
        inputSchema: {
          type: 'object',
          properties: {
            issueKey: { type: 'string', description: 'Issue key to transition (e.g., "PROJ-123")' },
            transitionId: { type: 'string', description: 'Transition ID (use either this or transitionName)' },
            transitionName: { type: 'string', description: 'Transition name (use either this or transitionId)' },
            comment: { type: 'string', description: 'Comment to add during transition (optional)' },
            assignee: { type: 'string', description: 'New assignee account ID (optional)' },
            resolution: { type: 'string', description: 'Resolution name for closing transitions (optional)' }
          },
          required: ['issueKey']
        }
      },
      {
        name: 'jira_add_comment',
        description: 'Add comments to Jira issues with visibility controls',
        inputSchema: {
          type: 'object',
          properties: {
            issueKey: { type: 'string', description: 'Issue key to comment on (e.g., "PROJ-123")' },
            body: { type: 'string', description: 'Comment text content' },
            visibility: { 
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['group', 'role'] },
                value: { type: 'string' }
              },
              description: 'Visibility restrictions (optional)' 
            }
          },
          required: ['issueKey', 'body']
        }
      },
      {
        name: 'jira_add_worklog',
        description: 'Log time on Jira issues with estimate adjustments',
        inputSchema: {
          type: 'object',
          properties: {
            issueKey: { type: 'string', description: 'Issue key to log time on (e.g., "PROJ-123")' },
            timeSpent: { type: 'string', description: 'Time spent (e.g., "1h 30m", "2d", "45m")' },
            comment: { type: 'string', description: 'Work description comment (optional)' },
            started: { type: 'string', description: 'ISO date when work started (optional)' },
            adjustEstimate: { type: 'string', enum: ['new', 'leave', 'manual', 'auto'], description: 'How to adjust remaining estimate (optional)' },
            newEstimate: { type: 'string', description: 'New estimate (required if adjustEstimate is "new")' }
          },
          required: ['issueKey', 'timeSpent']
        }
      },
      {
        name: 'jira_get_worklog',
        description: 'Retrieve work logs from Jira issues with filtering',
        inputSchema: {
          type: 'object',
          properties: {
            issueKey: { type: 'string', description: 'Issue key to get worklogs from (e.g., "PROJ-123")' },
            startAt: { type: 'number', description: 'Starting index for pagination (default: 0)' },
            maxResults: { type: 'number', description: 'Maximum results to return (1-1000, default: 50)' },
            startedAfter: { type: 'string', description: 'ISO date to filter worklogs started after' },
            startedBefore: { type: 'string', description: 'ISO date to filter worklogs started before' },
            author: { type: 'string', description: 'Filter by author account ID' }
          },
          required: ['issueKey']
        }
      },

      // 🛠️ CONFIGURATION & METADATA TOOLS (9 tools)
      {
        name: 'jira_get_issue_types',
        description: 'Get available issue types for project or globally',
        inputSchema: {
          type: 'object',
          properties: {
            projectKey: { type: 'string', description: 'Project key for project-specific types (optional)' }
          },
          required: []
        }
      },
      {
        name: 'jira_get_priorities',
        description: 'Get available priority levels',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'jira_get_statuses',
        description: 'Get available status values for project or globally',
        inputSchema: {
          type: 'object',
          properties: {
            projectKey: { type: 'string', description: 'Project key for project-specific statuses (optional)' }
          },
          required: []
        }
      },
      {
        name: 'jira_get_projects',
        description: 'List accessible Jira projects with comprehensive information',
        inputSchema: {
          type: 'object',
          properties: {
            expand: { type: 'array', items: { type: 'string' }, description: 'Additional fields to expand (optional)' },
            recent: { type: 'number', description: 'Number of recent projects to highlight (optional)' }
          },
          required: []
        }
      },
      {
        name: 'jira_get_resolutions',
        description: 'Get available resolution types for closing issues',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'jira_get_custom_fields',
        description: 'Get custom field definitions with type and context information',
        inputSchema: {
          type: 'object',
          properties: {
            projectKey: { type: 'string', description: 'Project key for project-specific fields (optional)' },
            type: { type: 'string', description: 'Filter by field type (optional)' }
          },
          required: []
        }
      },
      {
        name: 'jira_get_versions',
        description: 'Get project versions with release and status information',
        inputSchema: {
          type: 'object',
          properties: {
            projectKey: { type: 'string', description: 'Project key to get versions for (e.g., "PROJ")' },
            expand: { type: 'array', items: { type: 'string' }, description: 'Additional fields to expand (optional)' }
          },
          required: ['projectKey']
        }
      },
      {
        name: 'jira_get_components',
        description: 'Get project components with lead and assignment information',
        inputSchema: {
          type: 'object',
          properties: {
            projectKey: { type: 'string', description: 'Project key to get components for (e.g., "PROJ")' }
          },
          required: ['projectKey']
        }
      },
      {
        name: 'jira_get_project_roles',
        description: 'Get project roles with assignments and permissions information',
        inputSchema: {
          type: 'object',
          properties: {
            projectKey: { type: 'string', description: 'Project key to get roles for (e.g., "PROJ")' }
          },
          required: ['projectKey']
        }
      },

      // 🚀 BULK OPERATIONS TOOLS (3 tools)
      {
        name: 'bulk_update_issues',
        description: 'Update multiple issues in bulk with comprehensive field support and dry-run capability',
        inputSchema: {
          type: 'object',
          properties: {
            jql: { type: 'string', description: 'JQL query to select issues to update (e.g., "project = PROJ AND status = Open")' },
            updates: {
              type: 'object',
              properties: {
                assignee: { type: 'string', description: 'Account ID or "unassigned"' },
                priority: { type: 'string', description: 'Priority name (High, Medium, Low)' },
                labels: { type: 'array', items: { type: 'string' }, description: 'Array of labels to set' },
                summary: { type: 'string', description: 'New summary (use with caution on bulk)' },
                description: { type: 'string', description: 'New description (use with caution on bulk)' },
                fixVersion: { type: 'string', description: 'Fix version name' },
                component: { type: 'string', description: 'Component name' },
                customFields: { type: 'object', description: 'Custom field updates' }
              },
              description: 'Fields to update'
            },
            dryRun: { type: 'boolean', description: 'Preview changes without applying (default: true)' },
            batchSize: { type: 'number', description: 'Process in batches (default: 25, max: 50)' },
            continueOnError: { type: 'boolean', description: 'Continue processing if individual updates fail' },
            notifyUsers: { type: 'boolean', description: 'Send notifications to watchers (default: false for bulk)' },
            addComment: { type: 'string', description: 'Optional comment to add to all updated issues' }
          },
          required: ['jql', 'updates']
        }
      },
      {
        name: 'bulk_transition_issues',
        description: 'Transition multiple issues through workflow states in bulk with validation',
        inputSchema: {
          type: 'object',
          properties: {
            jql: { type: 'string', description: 'JQL query to select issues to transition' },
            transitionName: { type: 'string', description: 'Target transition name (e.g., "In Progress", "Done")' },
            comment: { type: 'string', description: 'Optional comment to add during transition' },
            assigneeId: { type: 'string', description: 'Optional assignee to set during transition' },
            resolution: { type: 'string', description: 'Resolution for closing transitions' },
            dryRun: { type: 'boolean', description: 'Preview transitions without applying (default: true)' },
            batchSize: { type: 'number', description: 'Process in batches (default: 20, max: 30)' },
            continueOnError: { type: 'boolean', description: 'Continue if individual transitions fail' },
            notifyUsers: { type: 'boolean', description: 'Send notifications to watchers (default: false)' },
            validateTransitions: { type: 'boolean', description: 'Check if transition is valid for each issue (default: true)' }
          },
          required: ['jql', 'transitionName']
        }
      },
      {
        name: 'auto_assign_based_on_workload',
        description: 'Automatically assign issues based on team workload with intelligent balancing',
        inputSchema: {
          type: 'object',
          properties: {
            projectKey: { type: 'string', description: 'Target project for assignment' },
            jql: { type: 'string', description: 'Optional JQL filter for specific issues (default: unassigned)' },
            assignmentStrategy: { type: 'string', enum: ['balanced', 'round-robin'], description: 'Assignment strategy to use' },
            teamMembers: { type: 'array', items: { type: 'string' }, description: 'Required: team member account IDs' },
            maxAssignmentsPerPerson: { type: 'number', description: 'Limit assignments per person' },
            dryRun: { type: 'boolean', description: 'Preview assignments (default: true)' }
          },
          required: ['projectKey', 'assignmentStrategy', 'teamMembers']
        }
      },

      // 📊 SPRINT HEALTH DASHBOARD TOOLS (7 tools) - comprehensive analytics
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
      },
      {
        name: 'get_sprint_goal_progress',
        description: 'Analyze sprint goal progress with completion tracking and risk assessment',
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
        name: 'get_blocked_issues',
        description: 'Identify and analyze blocked issues with impact assessment and resolution suggestions',
        inputSchema: {
          type: 'object',
          properties: {
            projectKey: { type: 'string', description: 'Jira project key (e.g., "PROJ")' }
          },
          required: ['projectKey']
        }
      },
      {
        name: 'get_comprehensive_dashboard',
        description: 'Generate comprehensive sprint health dashboard with all key metrics and insights',
        inputSchema: {
          type: 'object',
          properties: {
            projectKey: { type: 'string', description: 'Jira project key (e.g., "PROJ")' },
            sprintId: { type: 'string', description: 'Sprint ID (optional, defaults to active sprint)' }
          },
          required: ['projectKey']
        }
      }
    ];
  }

  /**
   * Setup enhanced MCP tool handlers with comprehensive tool support
   * Uses static definitions for Smithery compatibility, but leverages tool registry for execution
   */
  private setupToolHandlers(): void {
    // Get comprehensive tool definitions for Smithery schema discovery
    const comprehensiveTools = this.getToolDefinitions();

    // List all available tools (26 focused tools + analytics)
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: comprehensiveTools
    }));

    // Enhanced tool call handler with dual-mode execution
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
   * Enhanced tool call handler with lazy component initialization
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

    // Lazy initialize components only when needed
    this.ensureComponentsInitialized();

    // Check if this is a focused tool from the registry
    if (this.toolRegistry && this.toolRegistry.hasTool(name)) {
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
        if (!this.dashboardGenerator) throw new Error('Components not initialized');
        return await this.dashboardGenerator.generateSprintBurndown(
          args?.projectKey as string,
          args?.sprintId as string | undefined
        );
      
      case 'get_team_velocity':
        if (!this.dashboardGenerator) throw new Error('Components not initialized');
        return await this.dashboardGenerator.generateTeamVelocity(
          args?.projectKey as string,
          args?.sprintCount as number | undefined
        );
      
      case 'get_sprint_goal_progress':
        if (!this.dashboardGenerator) throw new Error('Components not initialized');
        return await this.dashboardGenerator.generateSprintGoalProgress(
          args?.projectKey as string,
          args?.sprintId as string | undefined
        );
      
      case 'get_blocked_issues':
        if (!this.dashboardGenerator) throw new Error('Components not initialized');
        return await this.dashboardGenerator.generateBlockedIssues(
          args?.projectKey as string
        );
      
      case 'get_comprehensive_dashboard':
        if (!this.dashboardGenerator) throw new Error('Components not initialized');
        return await this.dashboardGenerator.generateComprehensiveDashboard(
          args?.projectKey as string,
          args?.sprintId as string | undefined
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
      if (!this.jiraClient) throw new Error('Components not initialized');
      
      const isConnected = await this.jiraClient.testConnection();
      const configStatus = this.configManager.getConfigurationStatus();
      
      if (isConnected) {
        return {
          content: [{
            type: 'text',
            text: '✅ **Jira Connection Successful!**\n\n' +
                  'Your Jira instance is accessible and credentials are valid.\n\n' +
                  `${configStatus}\n\n` +
                  '🚀 **Comprehensive Tools Implementation Active:**\n' +
                  `• ✅ 29 tools available (22 focused + 7 sprint health dashboard)\n` +
                  `• 📋 Full CRUD operations\n` +
                  `• 🎯 Advanced sprint health analytics ready\n\n` +
                  '💡 **Available Tool Categories:**\n' +
                  '• ✅ Core CRUD Operations (10 tools): get, search, create, update, delete, transitions, comments, worklogs\n' +
                  '• ✅ Configuration & Metadata (9 tools): issue types, priorities, statuses, projects, custom fields\n' +
                  '• ✅ Bulk Operations (3 tools): bulk updates, bulk transitions, auto-assignment\n' +
                  '• 📊 Sprint Health Dashboard (7 tools): connection test, projects, burndown, velocity, goal progress, blocked issues, comprehensive dashboard\n\n' +
                  '💡 **Ready for comprehensive Jira automation with sprint health insights!**'
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
      if (!this.jiraClient) throw new Error('Components not initialized');
      
      const projects = await this.jiraClient.getProjects();
      
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
                `🛠️ **Available Tools** (29 comprehensive tools):\n` +
                `• \`jira_get_issue PROJ-123\` - Get issue details\n` +
                `• \`jira_search "project = ${projects[0].key}"\` - Search issues\n` +
                `• \`jira_create_issue\` - Create new issues\n` +
                `• \`jira_update_issue PROJ-123\` - Update issues\n` +
                `• \`jira_get_issue_types\` - List available issue types\n` +
                `• \`bulk_update_issues\` - Bulk update operations\n\n` +
                `🚀 **Example Usage:**\n` +
                `• Get issue: \`jira_get_issue ${projects[0].key}-1\`\n` +
                `• Search: \`jira_search "project = ${projects[0].key} AND status = Open"\`\n` +
                `• Create: \`jira_create_issue\` with projectKey="${projects[0].key}"\n` +
                `• Bulk update: \`bulk_update_issues\` with JQL filter`
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
    const hasValidConfig = this.hasValidConfiguration();
    
    console.error('🚀 Enhanced Jira MCP Server (Comprehensive Tools) started');
    console.error(`🛠️ Tools: 29 comprehensive tools available (22 focused + 7 sprint health dashboard)`);
    console.error(`📋 Categories: Core CRUD (10) + Configuration (9) + Bulk Operations (3) + Sprint Health Dashboard (7)`);
    console.error(`🔧 Configuration: ${hasValidConfig ? '✅ Ready' : '⚠️ Schema-only mode (credentials required for execution)'}`);
    console.error(`📊 Smithery Compatible: ✅ Full schema discovery enabled`);
    
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
