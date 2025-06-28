import { BaseJiraTool, ToolResult, ValidationResult, ToolValidator } from '../base-tool.js';

/**
 * Parameters for getting a Jira issue
 */
interface GetIssueParams {
  issueKey: string;
  expand?: string[];
}

/**
 * Tool for retrieving single issue details from Jira
 * Supports comprehensive issue information with configurable expansion
 */
export class JiraGetIssueTool extends BaseJiraTool {
  execute(params: GetIssueParams): Promise<ToolResult> {
    return this.getIssue(params);
  }

  validate(params: GetIssueParams): ValidationResult {
    const issueKeyValidation = ToolValidator.combine(
      ToolValidator.required(params.issueKey, 'issueKey'),
      ToolValidator.string(params.issueKey, 'issueKey')
    );

    if (params.expand && !Array.isArray(params.expand)) {
      return {
        valid: false,
        errors: [...issueKeyValidation.errors, 'expand must be an array if provided']
      };
    }

    return issueKeyValidation;
  }

  private async getIssue(params: GetIssueParams): Promise<ToolResult> {
    try {
      // Validate parameters
      const validation = this.validate(params);
      if (!validation.valid) {
        return this.formatError(validation.errors.join(', '), 'Parameter validation');
      }

      // Default expand fields for comprehensive issue information
      const defaultExpand = [
        'renderedFields',
        'names',
        'schema',
        'transitions',
        'operations',
        'editmeta',
        'changelog'
      ];

      const expandFields = params.expand && params.expand.length > 0 
        ? params.expand 
        : defaultExpand;

      // Make API call to get issue
      const response = await this.jiraClient.makeRequest(
        `/rest/api/3/issue/${params.issueKey}?expand=${expandFields.join(',')}`
      );

      if (!response.key) {
        return this.formatError('Issue not found or access denied', 'Issue retrieval');
      }

      // Format comprehensive issue information
      const issue = response;
      const fields = issue.fields || {};
      
      const issueInfo = [
        `🎫 **Issue Details**: ${issue.key}`,
        `**Summary**: ${fields.summary || 'No summary'}`,
        `**Status**: ${fields.status?.name || 'Unknown'}`,
        `**Type**: ${fields.issuetype?.name || 'Unknown'}`,
        `**Priority**: ${fields.priority?.name || 'None'}`,
        `**Assignee**: ${fields.assignee?.displayName || 'Unassigned'}`,
        `**Reporter**: ${fields.reporter?.displayName || 'Unknown'}`,
        `**Created**: ${this.formatDate(fields.created)}`,
        `**Updated**: ${this.formatDate(fields.updated)}`,
        `**Project**: ${fields.project?.name || 'Unknown'} (${fields.project?.key || 'N/A'})`
      ];

      if (fields.description) {
        issueInfo.push(`**Description**: ${this.truncateText(fields.description, 500)}`);
      }

      // Add custom fields if present
      const customFields = this.extractCustomFields(fields);
      if (customFields.length > 0) {
        issueInfo.push('', '**Custom Fields**:');
        issueInfo.push(...customFields);
      }

      // Add component and version information
      if (fields.components && fields.components.length > 0) {
        issueInfo.push(`**Components**: ${fields.components.map((c: any) => c.name).join(', ')}`);
      }

      if (fields.fixVersions && fields.fixVersions.length > 0) {
        issueInfo.push(`**Fix Versions**: ${fields.fixVersions.map((v: any) => v.name).join(', ')}`);
      }

      // Add workflow information if available
      if (issue.transitions && issue.transitions.length > 0) {
        const transitions = issue.transitions.map((t: any) => t.name).join(', ');
        issueInfo.push(`**Available Transitions**: ${transitions}`);
      }

      return this.formatSuccess(
        `Issue ${issue.key} Retrieved`,
        issueInfo.join('\n')
      );

    } catch (error: any) {
      if (error.response?.status === 404) {
        return this.formatError(`Issue ${params.issueKey} not found`, 'Issue retrieval');
      }
      if (error.response?.status === 403) {
        return this.formatError(`Access denied to issue ${params.issueKey}`, 'Issue retrieval');
      }
      return this.formatError(error, 'Issue retrieval');
    }
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

  /**
   * Helper method to truncate text
   */
  private truncateText(text: string, maxLength: number): string {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  /**
   * Helper method to extract and format custom fields
   */
  private extractCustomFields(fields: any): string[] {
    const customFields: string[] = [];
    
    Object.keys(fields).forEach(key => {
      if (key.startsWith('customfield_')) {
        const value = fields[key];
        if (value != null) {
          // Handle different custom field types
          let displayValue: string;
          
          if (Array.isArray(value)) {
            displayValue = value.map(v => v.value || v.name || v).join(', ');
          } else if (typeof value === 'object' && value.value) {
            displayValue = value.value;
          } else if (typeof value === 'object' && value.name) {
            displayValue = value.name;
          } else {
            displayValue = String(value);
          }
          
          customFields.push(`• ${key}: ${displayValue}`);
        }
      }
    });
    
    return customFields;
  }
}
