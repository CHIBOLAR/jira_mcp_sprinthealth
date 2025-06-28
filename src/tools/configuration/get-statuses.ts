import { BaseJiraTool, ToolResult, ValidationResult } from '../base-tool.js';

/**
 * Parameters for getting statuses
 */
interface GetStatusesParams {
  projectKey?: string;
}

/**
 * Tool for retrieving available status values
 */
export class JiraGetStatusesTool extends BaseJiraTool {
  execute(params: GetStatusesParams): Promise<ToolResult> {
    return this.getStatuses(params);
  }

  validate(params: GetStatusesParams): ValidationResult {
    if (params.projectKey && typeof params.projectKey !== 'string') {
      return {
        valid: false,
        errors: ['projectKey must be a string if provided']
      };
    }
    return { valid: true, errors: [] };
  }

  private async getStatuses(params: GetStatusesParams): Promise<ToolResult> {
    try {
      // Validate parameters
      const validation = this.validate(params);
      if (!validation.valid) {
        return this.formatError(validation.errors.join(', '), 'Parameter validation');
      }

      let statuses: any[];
      let scope: string;

      if (params.projectKey) {
        // Get project-specific statuses
        const projectStatuses = await this.jiraClient.makeRequest(
          `/rest/api/3/project/${params.projectKey}/statuses`
        );
        
        // Extract unique statuses from all issue types
        const statusMap = new Map();
        projectStatuses.forEach((issueTypeStatuses: any) => {
          if (issueTypeStatuses.statuses) {
            issueTypeStatuses.statuses.forEach((status: any) => {
              statusMap.set(status.id, {
                ...status,
                issueTypes: statusMap.has(status.id) 
                  ? [...statusMap.get(status.id).issueTypes, issueTypeStatuses.name]
                  : [issueTypeStatuses.name]
              });
            });
          }
        });
        
        statuses = Array.from(statusMap.values());
        scope = `project ${params.projectKey}`;
      } else {
        // Get global statuses
        statuses = await this.jiraClient.makeRequest('/rest/api/3/status');
        scope = 'all projects';
      }

      if (!statuses || statuses.length === 0) {
        return this.formatSuccess(
          'No Statuses Found',
          `❌ No status values found for ${scope}.`
        );
      }

      // Format statuses information
      const statusInfo = [
        `📊 **Available Statuses for ${scope}** (${statuses.length} found)`,
        ``
      ];

      // Group statuses by category if available
      const categorizedStatuses = this.categorizeStatuses(statuses);
      
      Object.keys(categorizedStatuses).forEach(category => {
        if (category !== 'undefined') {
          statusInfo.push(`**${category}:**`);
        }
        
        categorizedStatuses[category].forEach((status: any) => {
          const statusDetail = [`• **${status.name}**`];
          
          if (status.description) {
            statusDetail.push(`- ${status.description}`);
          }
          
          // Add category if not already grouped
          if (category === 'undefined' && status.statusCategory?.name) {
            statusDetail.push(`(${status.statusCategory.name})`);
          }
          
          // Add issue types for project-specific queries
          if (params.projectKey && status.issueTypes) {
            statusDetail.push(`[${status.issueTypes.join(', ')}]`);
          }
          
          statusInfo.push(statusDetail.join(' '));
        });
        
        statusInfo.push('');
      });

      // Add usage information
      statusInfo.push('**💡 Usage Tips**:');
      statusInfo.push('• Use exact status names for JQL queries');
      statusInfo.push('• Status determines available workflow transitions');
      statusInfo.push(`• Example JQL: \`status = "${statuses[0]?.name}"\``);
      if (params.projectKey) {
        statusInfo.push('• Statuses shown are available for this project');
      } else {
        statusInfo.push('• Specify projectKey to see project-specific statuses');
      }

      return this.formatSuccess(
        `Statuses Retrieved (${statuses.length})`,
        statusInfo.join('\n')
      );

    } catch (error: any) {
      if (error.response?.status === 404 && params.projectKey) {
        return this.formatError(`Project ${params.projectKey} not found`, 'Statuses retrieval');
      }
      if (error.response?.status === 403) {
        return this.formatError('Permission denied - check project access', 'Statuses retrieval');
      }
      return this.formatError(error, 'Statuses retrieval');
    }
  }

  /**
   * Categorize statuses by their status category
   */
  private categorizeStatuses(statuses: any[]): { [key: string]: any[] } {
    const categories: { [key: string]: any[] } = {};
    
    statuses.forEach(status => {
      const categoryName = status.statusCategory?.name || 'undefined';
      if (!categories[categoryName]) {
        categories[categoryName] = [];
      }
      categories[categoryName].push(status);
    });
    
    // Sort categories in logical order
    const sortedCategories: { [key: string]: any[] } = {};
    const categoryOrder = ['To Do', 'In Progress', 'Done', 'undefined'];
    
    categoryOrder.forEach(cat => {
      if (categories[cat]) {
        sortedCategories[cat] = categories[cat];
      }
    });
    
    // Add any remaining categories
    Object.keys(categories).forEach(cat => {
      if (!sortedCategories[cat]) {
        sortedCategories[cat] = categories[cat];
      }
    });
    
    return sortedCategories;
  }

  rateLimit() {
    return {
      requestsPerMinute: 100, // Metadata operations are lightweight
      burstLimit: 25
    };
  }
}
