import { JiraApiClient } from '../jira-client.js';
import { BaseJiraTool } from './base-tool.js';

// Core CRUD Operations
import { JiraGetIssueTool } from './core-crud/get-issue.js';
import { JiraSearchTool } from './core-crud/search.js';
import { JiraCreateIssueTool } from './core-crud/create-issue.js';
import { JiraUpdateIssueTool } from './core-crud/update-issue.js';
import { JiraDeleteIssueTool } from './core-crud/delete-issue.js';
import { JiraGetTransitionsTool } from './core-crud/get-transitions.js';
import { JiraTransitionIssueTool } from './core-crud/transition-issue.js';
import { JiraAddCommentTool } from './core-crud/add-comment.js';
import { JiraAddWorklogTool } from './core-crud/add-worklog.js';
import { JiraGetWorklogTool } from './core-crud/get-worklog.js';

// Configuration & Metadata
import { JiraGetIssueTypesTool } from './configuration/get-issue-types.js';
import { JiraGetPrioritiesTool } from './configuration/get-priorities.js';
import { JiraGetStatusesTool } from './configuration/get-statuses.js';
import { JiraGetProjectsTool } from './configuration/get-projects.js';

/**
 * Tool definition for MCP server registration
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: any;
  tool: BaseJiraTool;
}

/**
 * Registry for all Jira MCP tools
 */
export class JiraToolRegistry {
  private tools: Map<string, BaseJiraTool> = new Map();
  private definitions: ToolDefinition[] = [];

  constructor(private jiraClient: JiraApiClient) {
    this.registerTools();
  }

  /**
   * Register all available tools
   */
  private registerTools(): void {
    // Phase 1: Core CRUD Operations (Implemented)
    this.registerTool('jira_get_issue', {
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
      },
      tool: new JiraGetIssueTool(this.jiraClient)
    });

    this.registerTool('jira_search', {
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
          },
          fields: { 
            type: 'array', 
            items: { type: 'string' },
            description: 'Specific fields to include in results (optional)' 
          }
        },
        required: ['jql']
      },
      tool: new JiraSearchTool(this.jiraClient)
    });

    this.registerTool('jira_create_issue', {
      description: 'Create new Jira issues with comprehensive field support',
      inputSchema: {
        type: 'object',
        properties: {
          projectKey: { 
            type: 'string', 
            description: 'Project key (e.g., "PROJ")' 
          },
          summary: { 
            type: 'string', 
            description: 'Issue summary/title' 
          },
          description: { 
            type: 'string', 
            description: 'Issue description (optional)' 
          },
          issueType: { 
            type: 'string', 
            description: 'Issue type name (e.g., "Story", "Bug", "Task")' 
          },
          priority: { 
            type: 'string', 
            description: 'Priority name (e.g., "High", "Medium", "Low") (optional)' 
          },
          assignee: { 
            type: 'string', 
            description: 'Assignee account ID (optional)' 
          },
          labels: { 
            type: 'array', 
            items: { type: 'string' },
            description: 'Labels to add (optional)' 
          },
          parentKey: { 
            type: 'string', 
            description: 'Parent issue key for subtasks (optional)' 
          }
        },
        required: ['projectKey', 'summary', 'issueType']
      },
      tool: new JiraCreateIssueTool(this.jiraClient)
    });

    this.registerTool('jira_update_issue', {
      description: 'Update existing Jira issues with flexible field modifications',
      inputSchema: {
        type: 'object',
        properties: {
          issueKey: { 
            type: 'string', 
            description: 'Issue key to update (e.g., "PROJ-123")' 
          },
          summary: { 
            type: 'string', 
            description: 'New summary (optional)' 
          },
          description: { 
            type: 'string', 
            description: 'New description (optional)' 
          },
          priority: { 
            type: 'string', 
            description: 'New priority (optional)' 
          },
          assignee: { 
            type: 'string', 
            description: 'New assignee account ID (optional, use "unassigned" to remove)' 
          },
          labels: { 
            type: 'array', 
            items: { type: 'string' },
            description: 'New labels array (optional)' 
          },
          notifyUsers: { 
            type: 'boolean', 
            description: 'Send notifications to watchers (default: true)' 
          }
        },
        required: ['issueKey']
      },
      tool: new JiraUpdateIssueTool(this.jiraClient)
    });

    this.registerTool('jira_delete_issue', {
      description: 'Delete Jira issues with safety checks and subtask handling',
      inputSchema: {
        type: 'object',
        properties: {
          issueKey: { 
            type: 'string', 
            description: 'Issue key to delete (e.g., "PROJ-123")' 
          },
          deleteSubtasks: { 
            type: 'boolean', 
            description: 'Delete subtasks along with parent issue (default: false)' 
          },
          confirmDeletion: { 
            type: 'boolean', 
            description: 'Required confirmation for deletion (must be true)' 
          }
        },
        required: ['issueKey', 'confirmDeletion']
      },
      tool: new JiraDeleteIssueTool(this.jiraClient)
    });

    this.registerTool('jira_get_transitions', {
      description: 'Get available workflow transitions for an issue',
      inputSchema: {
        type: 'object',
        properties: {
          issueKey: { 
            type: 'string', 
            description: 'Issue key to get transitions for (e.g., "PROJ-123")' 
          }
        },
        required: ['issueKey']
      },
      tool: new JiraGetTransitionsTool(this.jiraClient)
    });

    this.registerTool('jira_transition_issue', {
      description: 'Execute workflow transitions on Jira issues',
      inputSchema: {
        type: 'object',
        properties: {
          issueKey: { 
            type: 'string', 
            description: 'Issue key to transition (e.g., "PROJ-123")' 
          },
          transitionId: { 
            type: 'string', 
            description: 'Transition ID (use either this or transitionName)' 
          },
          transitionName: { 
            type: 'string', 
            description: 'Transition name (use either this or transitionId)' 
          },
          comment: { 
            type: 'string', 
            description: 'Comment to add during transition (optional)' 
          },
          assignee: { 
            type: 'string', 
            description: 'New assignee account ID (optional)' 
          },
          resolution: { 
            type: 'string', 
            description: 'Resolution name for closing transitions (optional)' 
          }
        },
        required: ['issueKey']
      },
      tool: new JiraTransitionIssueTool(this.jiraClient)
    });

    this.registerTool('jira_add_comment', {
      description: 'Add comments to Jira issues with visibility controls',
      inputSchema: {
        type: 'object',
        properties: {
          issueKey: { 
            type: 'string', 
            description: 'Issue key to comment on (e.g., "PROJ-123")' 
          },
          body: { 
            type: 'string', 
            description: 'Comment text content' 
          },
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
      },
      tool: new JiraAddCommentTool(this.jiraClient)
    });

    this.registerTool('jira_add_worklog', {
      description: 'Log time on Jira issues with estimate adjustments',
      inputSchema: {
        type: 'object',
        properties: {
          issueKey: { 
            type: 'string', 
            description: 'Issue key to log time on (e.g., "PROJ-123")' 
          },
          timeSpent: { 
            type: 'string', 
            description: 'Time spent (e.g., "1h 30m", "2d", "45m")' 
          },
          comment: { 
            type: 'string', 
            description: 'Work description comment (optional)' 
          },
          started: { 
            type: 'string', 
            description: 'ISO date when work started (optional)' 
          },
          adjustEstimate: { 
            type: 'string', 
            enum: ['new', 'leave', 'manual', 'auto'],
            description: 'How to adjust remaining estimate (optional)' 
          },
          newEstimate: { 
            type: 'string', 
            description: 'New estimate (required if adjustEstimate is "new")' 
          }
        },
        required: ['issueKey', 'timeSpent']
      },
      tool: new JiraAddWorklogTool(this.jiraClient)
    });

    this.registerTool('jira_get_worklog', {
      description: 'Retrieve work logs from Jira issues with filtering',
      inputSchema: {
        type: 'object',
        properties: {
          issueKey: { 
            type: 'string', 
            description: 'Issue key to get worklogs from (e.g., "PROJ-123")' 
          },
          startAt: { 
            type: 'number', 
            description: 'Starting index for pagination (default: 0)' 
          },
          maxResults: { 
            type: 'number', 
            description: 'Maximum results to return (1-1000, default: 50)' 
          },
          startedAfter: { 
            type: 'string', 
            description: 'ISO date to filter worklogs started after' 
          },
          startedBefore: { 
            type: 'string', 
            description: 'ISO date to filter worklogs started before' 
          },
          author: { 
            type: 'string', 
            description: 'Filter by author account ID' 
          }
        },
        required: ['issueKey']
      },
      tool: new JiraGetWorklogTool(this.jiraClient)
    });

    // Configuration & Metadata Tools (Enhanced)
    this.registerTool('jira_get_issue_types', {
      description: 'Get available issue types for project or globally',
      inputSchema: {
        type: 'object',
        properties: {
          projectKey: { 
            type: 'string', 
            description: 'Project key for project-specific types (optional)' 
          }
        },
        required: []
      },
      tool: new JiraGetIssueTypesTool(this.jiraClient)
    });

    this.registerTool('jira_get_priorities', {
      description: 'Get available priority levels',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      },
      tool: new JiraGetPrioritiesTool(this.jiraClient)
    });

    this.registerTool('jira_get_statuses', {
      description: 'Get available status values for project or globally',
      inputSchema: {
        type: 'object',
        properties: {
          projectKey: { 
            type: 'string', 
            description: 'Project key for project-specific statuses (optional)' 
          }
        },
        required: []
      },
      tool: new JiraGetStatusesTool(this.jiraClient)
    });

    this.registerTool('jira_get_projects', {
      description: 'List accessible Jira projects with comprehensive information',
      inputSchema: {
        type: 'object',
        properties: {
          expand: { 
            type: 'array', 
            items: { type: 'string' },
            description: 'Additional fields to expand (optional)' 
          },
          recent: { 
            type: 'number', 
            description: 'Number of recent projects to highlight (optional)' 
          }
        },
        required: []
      },
      tool: new JiraGetProjectsTool(this.jiraClient)
    });

    // TODO: Add remaining tools as they are implemented
    // Phase 1 remaining tools (will be implemented next):
    // - jira_get_transitions
    // - jira_transition_issue
    // - jira_add_comment
    // - jira_add_worklog
    // - jira_get_worklog
    // - jira_get_priorities
    // - jira_get_resolutions
    // - jira_get_statuses
    // - jira_get_custom_fields
    // - jira_get_versions
    // - jira_get_components
    // - jira_get_project_roles
    // - jira_get_projects
  }

  /**
   * Register a single tool
   */
  private registerTool(name: string, definition: Omit<ToolDefinition, 'name' | 'tool'> & { tool: BaseJiraTool }): void {
    this.tools.set(name, definition.tool);
    this.definitions.push({
      name,
      description: definition.description,
      inputSchema: definition.inputSchema,
      tool: definition.tool
    });
  }

  /**
   * Get all tool definitions for MCP server registration
   */
  getToolDefinitions(): Array<{ name: string; description: string; inputSchema: any }> {
    return this.definitions.map(def => ({
      name: def.name,
      description: def.description,
      inputSchema: def.inputSchema
    }));
  }

  /**
   * Get a specific tool by name
   */
  getTool(name: string): BaseJiraTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Check if a tool exists
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get all registered tool names
   */
  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Get statistics about registered tools
   */
  getStats(): { total: number; implemented: number; planned: number } {
    const implemented = this.tools.size;
    const planned = 65; // Total tools from the focused plan
    
    return {
      total: planned,
      implemented,
      planned: planned - implemented
    };
  }
}
