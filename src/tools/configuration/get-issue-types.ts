import { BaseJiraTool, ToolResult, ValidationResult, ToolValidator } from '../base-tool.js';

/**
 * Parameters for getting issue types
 */
interface GetIssueTypesParams {
  projectKey?: string;
}

/**
 * Tool for retrieving available issue types
 */
export class JiraGetIssueTypesTool extends BaseJiraTool {
  execute(params: GetIssueTypesParams): Promise<ToolResult> {
    return this.getIssueTypes(params);
  }

  validate(params: GetIssueTypesParams): ValidationResult {
    if (params.projectKey && typeof params.projectKey !== 'string') {
      return {
        valid: false,
        errors: ['projectKey must be a string if provided']
      };
    }
    return { valid: true, errors: [] };
  }

  private async getIssueTypes(params: GetIssueTypesParams): Promise<ToolResult> {
    try {
      // Validate parameters
      const validation = this.validate(params);
      if (!validation.valid) {
        return this.formatError(validation.errors.join(', '), 'Parameter validation');
      }

      let issueTypes: any[];
      let scope: string;

      if (params.projectKey) {
        // Get project-specific issue types
        const projectResponse = await this.jiraClient.makeRequest(
          `/rest/api/3/project/${params.projectKey}/statuses`
        );
        
        // Extract unique issue types from project statuses
        const issueTypeMap = new Map();
        projectResponse.forEach((statusGroup: any) => {
          if (statusGroup.issueTypes) {
            statusGroup.issueTypes.forEach((issueType: any) => {
              issueTypeMap.set(issueType.id, issueType);
            });
          }
        });
        
        issueTypes = Array.from(issueTypeMap.values());
        scope = `project ${params.projectKey}`;
      } else {
        // Get global issue types
        issueTypes = await this.jiraClient.makeRequest('/rest/api/3/issuetype');
        scope = 'all projects';
      }

      if (!issueTypes || issueTypes.length === 0) {
        return this.formatSuccess(
          'No Issue Types Found',
          `❌ No issue types found for ${scope}.`
        );
      }

      // Format issue types information
      const typeInfo = [
        `🏷️ **Issue Types for ${scope}** (${issueTypes.length} found)`,
        ``
      ];

      // Group issue types by hierarchy
      const standardTypes = issueTypes.filter(type => !type.subtask);
      const subtaskTypes = issueTypes.filter(type => type.subtask);

      if (standardTypes.length > 0) {
        typeInfo.push('**📋 Standard Issue Types**:');
        standardTypes.forEach(type => {
          typeInfo.push(this.formatIssueType(type));
        });
        typeInfo.push('');
      }

      if (subtaskTypes.length > 0) {
        typeInfo.push('**🔗 Subtask Types**:');
        subtaskTypes.forEach(type => {
          typeInfo.push(this.formatIssueType(type));
        });
        typeInfo.push('');
      }

      // Add usage suggestions
      typeInfo.push('**💡 Usage Tips**:');
      typeInfo.push('• Use the exact name when creating issues');
      typeInfo.push('• Subtask types can only be used with parent issues');
      if (params.projectKey) {
        typeInfo.push(`• These types are available for project ${params.projectKey}`);
      } else {
        typeInfo.push('• Specify a project key to see project-specific types');
      }

      return this.formatSuccess(
        `Issue Types Retrieved (${issueTypes.length})`,
        typeInfo.join('\n')
      );

    } catch (error: any) {
      if (error.response?.status === 404 && params.projectKey) {
        return this.formatError(`Project ${params.projectKey} not found`, 'Issue types retrieval');
      }
      if (error.response?.status === 403) {
        return this.formatError('Permission denied - check project access', 'Issue types retrieval');
      }
      return this.formatError(error, 'Issue types retrieval');
    }
  }

  /**
   * Format individual issue type information
   */
  private formatIssueType(type: any): string {
    const parts = [`• **${type.name}**`];
    
    if (type.description) {
      parts.push(`- ${type.description}`);
    }
    
    const attributes = [];
    if (type.subtask) attributes.push('Subtask');
    if (type.hierarchyLevel !== undefined) attributes.push(`Level ${type.hierarchyLevel}`);
    
    if (attributes.length > 0) {
      parts.push(`(${attributes.join(', ')})`);
    }
    
    return parts.join(' ');
  }

  rateLimit() {
    return {
      requestsPerMinute: 100, // Metadata operations are lightweight
      burstLimit: 20
    };
  }
}
