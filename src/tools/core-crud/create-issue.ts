import { BaseJiraTool, ToolResult, ValidationResult, ToolValidator } from '../base-tool.js';

/**
 * Parameters for creating a new Jira issue
 */
interface CreateIssueParams {
  projectKey: string;
  summary: string;
  description?: string;
  issueType: string;
  priority?: string;
  assignee?: string;
  reporter?: string;
  labels?: string[];
  components?: string[];
  fixVersions?: string[];
  customFields?: { [key: string]: any };
  parentKey?: string; // For subtasks
}

/**
 * Tool for creating new Jira issues with comprehensive field support
 */
export class JiraCreateIssueTool extends BaseJiraTool {
  execute(params: CreateIssueParams): Promise<ToolResult> {
    return this.createIssue(params);
  }

  validate(params: CreateIssueParams): ValidationResult {
    return ToolValidator.combine(
      ToolValidator.required(params.projectKey, 'projectKey'),
      ToolValidator.string(params.projectKey, 'projectKey'),
      ToolValidator.required(params.summary, 'summary'),
      ToolValidator.string(params.summary, 'summary'),
      ToolValidator.required(params.issueType, 'issueType'),
      ToolValidator.string(params.issueType, 'issueType')
    );
  }

  private async createIssue(params: CreateIssueParams): Promise<ToolResult> {
    try {
      // Validate parameters
      const validation = this.validate(params);
      if (!validation.valid) {
        return this.formatError(validation.errors.join(', '), 'Parameter validation');
      }

      // Build the issue creation payload
      const issuePayload = await this.buildIssuePayload(params);

      // Make API call to create issue
      const response = await this.jiraClient.makeRequest('/rest/api/3/issue', {
        method: 'POST',
        data: issuePayload
      });

      if (!response.key) {
        return this.formatError('Issue creation failed - no issue key returned', 'Issue creation');
      }
      // Get the created issue details
      const createdIssueKey = response.key;
      const issueUrl = `${this.jiraClient.getBaseUrl()}/browse/${createdIssueKey}`;

      // Format success response
      const creationInfo = [
        `🎫 **Issue Created**: ${createdIssueKey}`,
        `🔗 **URL**: ${issueUrl}`,
        `📝 **Summary**: ${params.summary}`,
        `📋 **Project**: ${params.projectKey}`,
        `🏷️ **Type**: ${params.issueType}`
      ];

      if (params.priority) {
        creationInfo.push(`⚡ **Priority**: ${params.priority}`);
      }

      if (params.assignee) {
        creationInfo.push(`👤 **Assignee**: ${params.assignee}`);
      }

      if (params.description) {
        creationInfo.push(`📄 **Description**: ${this.truncateText(params.description, 200)}`);
      }

      if (params.labels && params.labels.length > 0) {
        creationInfo.push(`🏷️ **Labels**: ${params.labels.join(', ')}`);
      }

      if (params.components && params.components.length > 0) {
        creationInfo.push(`🔧 **Components**: ${params.components.join(', ')}`);
      }

      if (params.parentKey) {
        creationInfo.push(`👆 **Parent Issue**: ${params.parentKey}`);
      }

      return this.formatSuccess(
        `Issue ${createdIssueKey} Created Successfully`,
        creationInfo.join('\n')
      );

    } catch (error: any) {
      if (error.response?.status === 400) {
        return this.formatError('Invalid issue data - check required fields and values', 'Issue creation');
      }
      if (error.response?.status === 403) {
        return this.formatError('Permission denied - check project access and issue creation permissions', 'Issue creation');
      }
      return this.formatError(error, 'Issue creation');
    }
  }

  /**
   * Build the issue creation payload for Jira API
   */
  private async buildIssuePayload(params: CreateIssueParams): Promise<any> {
    const fields: any = {
      project: {
        key: params.projectKey
      },
      summary: params.summary,
      issuetype: {
        name: params.issueType
      }
    };

    // Add description if provided
    if (params.description) {
      fields.description = {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [
              {
                text: params.description,
                type: 'text'
              }
            ]
          }
        ]
      };
    }

    // Add priority if provided
    if (params.priority) {
      fields.priority = {
        name: params.priority
      };
    }

    // Add assignee if provided
    if (params.assignee) {
      fields.assignee = {
        accountId: params.assignee // Assuming accountId format
      };
    }

    // Add reporter if provided
    if (params.reporter) {
      fields.reporter = {
        accountId: params.reporter
      };
    }

    // Add labels if provided
    if (params.labels && params.labels.length > 0) {
      fields.labels = params.labels;
    }

    // Add components if provided
    if (params.components && params.components.length > 0) {
      fields.components = params.components.map(component => ({ name: component }));
    }

    // Add fix versions if provided
    if (params.fixVersions && params.fixVersions.length > 0) {
      fields.fixVersions = params.fixVersions.map(version => ({ name: version }));
    }

    // Add parent for subtasks
    if (params.parentKey) {
      fields.parent = {
        key: params.parentKey
      };
    }

    // Add custom fields if provided
    if (params.customFields) {
      Object.assign(fields, params.customFields);
    }

    return { fields };
  }

  /**
   * Helper method to truncate text
   */
  private truncateText(text: string, maxLength: number): string {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  rateLimit() {
    return {
      requestsPerMinute: 50, // Creation is moderately expensive
      burstLimit: 10
    };
  }
}
