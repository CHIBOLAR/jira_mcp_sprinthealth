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
import { JiraGetResolutionsTool } from './configuration/get-resolutions.js';
import { JiraGetCustomFieldsTool } from './configuration/get-custom-fields.js';
import { JiraGetVersionsTool } from './configuration/get-versions.js';
import { JiraGetComponentsTool } from './configuration/get-components.js';
import { JiraGetProjectRolesTool } from './configuration/get-project-roles.js';

// Bulk Operations - TIER 1 Priority Features
import { JiraBulkUpdateIssuesTool } from './bulk-operations/bulk-update-issues.js';
import { JiraBulkTransitionIssuesTool } from './bulk-operations/bulk-transition-issues.js';
import { JiraSimpleAutoAssignTool } from './bulk-operations/auto-assign-workload.js';

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

    this.registerTool('jira_get_resolutions', {
      description: 'Get available resolution types for closing issues',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      },
      tool: new JiraGetResolutionsTool(this.jiraClient)
    });

    this.registerTool('jira_get_custom_fields', {
      description: 'Get custom field definitions with type and context information',
      inputSchema: {
        type: 'object',
        properties: {
          projectKey: { 
            type: 'string', 
            description: 'Project key for project-specific fields (optional)' 
          },
          type: { 
            type: 'string', 
            description: 'Filter by field type (optional)' 
          }
        },
        required: []
      },
      tool: new JiraGetCustomFieldsTool(this.jiraClient)
    });

    this.registerTool('jira_get_versions', {
      description: 'Get project versions with release and status information',
      inputSchema: {
        type: 'object',
        properties: {
          projectKey: { 
            type: 'string', 
            description: 'Project key to get versions for (e.g., "PROJ")' 
          },
          expand: { 
            type: 'array', 
            items: { type: 'string' },
            description: 'Additional fields to expand (optional)' 
          }
        },
        required: ['projectKey']
      },
      tool: new JiraGetVersionsTool(this.jiraClient)
    });

    this.registerTool('jira_get_components', {
      description: 'Get project components with lead and assignment information',
      inputSchema: {
        type: 'object',
        properties: {
          projectKey: { 
            type: 'string', 
            description: 'Project key to get components for (e.g., "PROJ")' 
          }
        },
        required: ['projectKey']
      },
      tool: new JiraGetComponentsTool(this.jiraClient)
    });

    this.registerTool('jira_get_project_roles', {
      description: 'Get project roles with assignments and permissions information',
      inputSchema: {
        type: 'object',
        properties: {
          projectKey: { 
            type: 'string', 
            description: 'Project key to get roles for (e.g., "PROJ")' 
          }
        },
        required: ['projectKey']
      },
      tool: new JiraGetProjectRolesTool(this.jiraClient)
    });

    // ✅ Phase 1 Complete: Foundation Sprint (18/18 tools implemented)
    
    // 🚀 Phase 2A: Bulk Operations - TIER 1 Priority (3/3 tools implemented)
    this.registerTool('bulk_update_issues', {
      description: 'Update multiple issues in bulk with comprehensive field support and dry-run capability',
      inputSchema: {
        type: 'object',
        properties: {
          jql: { 
            type: 'string', 
            description: 'JQL query to select issues to update (e.g., "project = PROJ AND status = Open")' 
          },
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
          dryRun: { 
            type: 'boolean', 
            description: 'Preview changes without applying (default: true)' 
          },
          batchSize: { 
            type: 'number', 
            description: 'Process in batches (default: 25, max: 50)' 
          },
          continueOnError: { 
            type: 'boolean', 
            description: 'Continue processing if individual updates fail' 
          },
          notifyUsers: { 
            type: 'boolean', 
            description: 'Send notifications to watchers (default: false for bulk)' 
          },
          addComment: { 
            type: 'string', 
            description: 'Optional comment to add to all updated issues' 
          }
        },
        required: ['jql', 'updates']
      },
      tool: new JiraBulkUpdateIssuesTool(this.jiraClient)
    });

    this.registerTool('bulk_transition_issues', {
      description: 'Transition multiple issues through workflow states in bulk with validation',
      inputSchema: {
        type: 'object',
        properties: {
          jql: { 
            type: 'string', 
            description: 'JQL query to select issues to transition' 
          },
          transitionName: { 
            type: 'string', 
            description: 'Target transition name (e.g., "In Progress", "Done")' 
          },
          comment: { 
            type: 'string', 
            description: 'Optional comment to add during transition' 
          },
          assigneeId: { 
            type: 'string', 
            description: 'Optional assignee to set during transition' 
          },
          resolution: { 
            type: 'string', 
            description: 'Resolution for closing transitions' 
          },
          dryRun: { 
            type: 'boolean', 
            description: 'Preview transitions without applying (default: true)' 
          },
          batchSize: { 
            type: 'number', 
            description: 'Process in batches (default: 20, max: 30)' 
          },
          continueOnError: { 
            type: 'boolean', 
            description: 'Continue if individual transitions fail' 
          },
          notifyUsers: { 
            type: 'boolean', 
            description: 'Send notifications to watchers (default: false)' 
          },
          validateTransitions: { 
            type: 'boolean', 
            description: 'Check if transition is valid for each issue (default: true)' 
          }
        },
        required: ['jql', 'transitionName']
      },
      tool: new JiraBulkTransitionIssuesTool(this.jiraClient)
    });

    this.registerTool('auto_assign_based_on_workload', {
      description: 'Automatically assign issues based on team workload with intelligent balancing (simplified version)',
      inputSchema: {
        type: 'object',
        properties: {
          projectKey: { 
            type: 'string', 
            description: 'Target project for assignment' 
          },
          jql: { 
            type: 'string', 
            description: 'Optional JQL filter for specific issues (default: unassigned)' 
          },
          assignmentStrategy: { 
            type: 'string', 
            enum: ['balanced', 'round-robin'],
            description: 'Assignment strategy to use' 
          },
          teamMembers: { 
            type: 'array', 
            items: { type: 'string' },
            description: 'Required: team member account IDs' 
          },
          maxAssignmentsPerPerson: { 
            type: 'number', 
            description: 'Limit assignments per person' 
          },
          dryRun: { 
            type: 'boolean', 
            description: 'Preview assignments (default: true)' 
          }
        },
        required: ['projectKey', 'assignmentStrategy', 'teamMembers']
      },
      tool: new JiraSimpleAutoAssignTool(this.jiraClient)
    });

    // 🚀 Ready for Phase 2B: Advanced Dashboard & Analytics (4 tools remaining)
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
