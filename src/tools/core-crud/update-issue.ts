import { BaseJiraTool, ToolResult, ValidationResult, ToolValidator } from '../base-tool.js';

/**
 * Parameters for updating a Jira issue
 */
interface UpdateIssueParams {
  issueKey: string;
  summary?: string;
  description?: string;
  priority?: string;
  assignee?: string;
  labels?: string[];
  components?: string[];
  fixVersions?: string[];
  customFields?: { [key: string]: any };
  notifyUsers?: boolean;
}

/**
 * Tool for updating existing Jira issues
 */
export class JiraUpdateIssueTool extends BaseJiraTool {
  execute(params: UpdateIssueParams): Promise<ToolResult> {
    return this.updateIssue(params);
  }

  validate(params: UpdateIssueParams): ValidationResult {
    const validation = ToolValidator.combine(
      ToolValidator.required(params.issueKey, 'issueKey'),
      ToolValidator.string(params.issueKey, 'issueKey')
    );

    // Check that at least one field to update is provided
    const hasUpdates = params.summary || params.description || params.priority || 
                      params.assignee || params.labels || params.components || 
                      params.fixVersions || params.customFields;

    if (!hasUpdates) {
      return {
        valid: false,
        errors: [...validation.errors, 'At least one field must be provided for update']
      };
    }

    return validation;
  }

  private async updateIssue(params: UpdateIssueParams): Promise<ToolResult> {
    try {
      // Validate parameters
      const validation = this.validate(params);
      if (!validation.valid) {
        return this.formatError(validation.errors.join(', '), 'Parameter validation');
      }

      // Build update payload
      const updatePayload = this.buildUpdatePayload(params);
      const notifyUsers = params.notifyUsers !== false; // Default to true

      // Make API call to update issue
      await this.jiraClient.makeRequest(
        `/rest/api/3/issue/${params.issueKey}?notifyUsers=${notifyUsers}`,
        {
          method: 'PUT',
          data: updatePayload
        }
      );

      // Get updated issue details to confirm changes
      const updatedIssue = await this.jiraClient.makeRequest(
        `/rest/api/3/issue/${params.issueKey}?fields=summary,status,priority,assignee,updated`
      );

      const fields = updatedIssue.fields || {};
      const issueUrl = `${this.jiraClient.getBaseUrl()}/browse/${params.issueKey}`;

      // Format success response with updated information
      const updateInfo = [
        `🎫 **Issue Updated**: ${params.issueKey}`,
        `🔗 **URL**: ${issueUrl}`,
        `📝 **Current Summary**: ${fields.summary || 'No summary'}`,
        `📊 **Current Status**: ${fields.status?.name || 'Unknown'}`,
        `⚡ **Current Priority**: ${fields.priority?.name || 'None'}`,
        `👤 **Current Assignee**: ${fields.assignee?.displayName || 'Unassigned'}`,
        `🕒 **Last Updated**: ${this.formatDate(fields.updated)}`
      ];

      // Add information about what was updated
      const updatedFields = [];
      if (params.summary) updatedFields.push('Summary');
      if (params.description) updatedFields.push('Description');
      if (params.priority) updatedFields.push('Priority');
      if (params.assignee) updatedFields.push('Assignee');
      if (params.labels) updatedFields.push('Labels');
      if (params.components) updatedFields.push('Components');
      if (params.fixVersions) updatedFields.push('Fix Versions');
      if (params.customFields) updatedFields.push('Custom Fields');

      if (updatedFields.length > 0) {
        updateInfo.push(``, `✅ **Updated Fields**: ${updatedFields.join(', ')}`);
      }

      updateInfo.push(``, `📬 **Notifications**: ${notifyUsers ? 'Sent to watchers' : 'Suppressed'}`);

      return this.formatSuccess(
        `Issue ${params.issueKey} Updated Successfully`,
        updateInfo.join('\n')
      );

    } catch (error: any) {
      if (error.response?.status === 400) {
        return this.formatError('Invalid update data - check field values and permissions', 'Issue update');
      }
      if (error.response?.status === 403) {
        return this.formatError('Permission denied - check edit permissions for this issue', 'Issue update');
      }
      if (error.response?.status === 404) {
        return this.formatError(`Issue ${params.issueKey} not found`, 'Issue update');
      }
      return this.formatError(error, 'Issue update');
    }
  }

  /**
   * Build the update payload for Jira API
   */
  private buildUpdatePayload(params: UpdateIssueParams): any {
    const fields: any = {};

    // Update summary
    if (params.summary) {
      fields.summary = params.summary;
    }

    // Update description
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

    // Update priority
    if (params.priority) {
      fields.priority = {
        name: params.priority
      };
    }

    // Update assignee
    if (params.assignee) {
      if (params.assignee.toLowerCase() === 'unassigned' || params.assignee === '') {
        fields.assignee = null;
      } else {
        fields.assignee = {
          accountId: params.assignee
        };
      }
    }

    // Update labels
    if (params.labels) {
      fields.labels = params.labels;
    }

    // Update components
    if (params.components) {
      fields.components = params.components.map(component => ({ name: component }));
    }

    // Update fix versions
    if (params.fixVersions) {
      fields.fixVersions = params.fixVersions.map(version => ({ name: version }));
    }

    // Add custom fields
    if (params.customFields) {
      Object.assign(fields, params.customFields);
    }

    return { fields };
  }

  /**
   * Helper method to format dates
   */
  private formatDate(dateString: string): string {
    if (!dateString) return 'Unknown';
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return dateString;
    }
  }

  rateLimit() {
    return {
      requestsPerMinute: 60, // Updates are common operations
      burstLimit: 15
    };
  }
}
