import { BaseJiraTool, ToolResult, ValidationResult, ToolValidator } from '../base-tool.js';

/**
 * Parameters for searching Jira issues with JQL
 */
interface SearchParams {
  jql: string;
  startAt?: number;
  maxResults?: number;
  fields?: string[];
  expand?: string[];
}

/**
 * Tool for JQL-based issue search with pagination support
 * Provides comprehensive search capabilities with flexible field selection
 */
export class JiraSearchTool extends BaseJiraTool {
  execute(params: SearchParams): Promise<ToolResult> {
    return this.searchIssues(params);
  }

  validate(params: SearchParams): ValidationResult {
    const jqlValidation = ToolValidator.combine(
      ToolValidator.required(params.jql, 'jql'),
      ToolValidator.string(params.jql, 'jql')
    );

    const errors = [...jqlValidation.errors];

    if (params.startAt !== undefined && (typeof params.startAt !== 'number' || params.startAt < 0)) {
      errors.push('startAt must be a non-negative number');
    }

    if (params.maxResults !== undefined && (typeof params.maxResults !== 'number' || params.maxResults < 1 || params.maxResults > 1000)) {
      errors.push('maxResults must be a number between 1 and 1000');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  private async searchIssues(params: SearchParams): Promise<ToolResult> {
    try {
      // Validate parameters
      const validation = this.validate(params);
      if (!validation.valid) {
        return this.formatError(validation.errors.join(', '), 'Parameter validation');
      }

      // Set default parameters
      const startAt = params.startAt || 0;
      const maxResults = params.maxResults || 50;
      
      // Default fields for search results
      const defaultFields = [
        'summary',
        'status',
        'priority',
        'issuetype',
        'assignee',
        'reporter',
        'created',
        'updated',
        'project'
      ];

      const fields = params.fields && params.fields.length > 0 
        ? params.fields 
        : defaultFields;

      const expand = params.expand || [];

      // Construct API request
      const searchRequest = {
        jql: params.jql,
        startAt,
        maxResults,
        fields,
        expand
      };

      // Make API call
      const response = await this.jiraClient.makeRequest('/rest/api/3/search', {
        method: 'POST',
        data: searchRequest
      });

      const { issues, total, startAt: responseStartAt, maxResults: responseMaxResults } = response;

      if (!issues || issues.length === 0) {
        return this.formatSuccess(
          'Search Complete',
          `🔍 **JQL Query**: \`${params.jql}\`\n\n❌ **No issues found** matching the search criteria.`
        );
      }

      // Format search results
      const resultInfo = [
        `🔍 **JQL Query**: \`${params.jql}\``,
        `📊 **Results**: Showing ${issues.length} of ${total} issues (starting from ${responseStartAt})`
      ];

      if (total > responseStartAt + responseMaxResults) {
        const nextStartAt = responseStartAt + responseMaxResults;
        resultInfo.push(`💡 **Pagination**: Use startAt=${nextStartAt} for next ${Math.min(maxResults, total - nextStartAt)} results`);
      }

      resultInfo.push('', '**📋 Issue List**:');

      // Format each issue
      issues.forEach((issue: any, index: number) => {
        const fields = issue.fields || {};
        const issueNumber = responseStartAt + index + 1;
        
        const issueInfo = [
          `**${issueNumber}. ${issue.key}** - ${fields.summary || 'No summary'}`,
          `   Status: ${fields.status?.name || 'Unknown'} | ` +
          `Type: ${fields.issuetype?.name || 'Unknown'} | ` +
          `Priority: ${fields.priority?.name || 'None'}`,
          `   Assignee: ${fields.assignee?.displayName || 'Unassigned'} | ` +
          `Project: ${fields.project?.key || 'Unknown'}`
        ];

        if (fields.created) {
          issueInfo.push(`   Created: ${this.formatDate(fields.created)}`);
        }

        resultInfo.push(...issueInfo, '');
      });

      // Add summary statistics
      const statistics = this.generateSearchStatistics(issues);
      if (statistics.length > 0) {
        resultInfo.push('**📈 Search Statistics**:', ...statistics);
      }

      return this.formatSuccess(
        `Search Results (${issues.length}/${total})`,
        resultInfo.join('\n')
      );

    } catch (error: any) {
      if (error.response?.status === 400) {
        return this.formatError('Invalid JQL query syntax', 'JQL search');
      }
      return this.formatError(error, 'Issue search');
    }
  }

  /**
   * Helper method to format dates
   */
  private formatDate(dateString: string): string {
    if (!dateString) return 'Unknown';
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
  }

  /**
   * Generate statistics from search results
   */
  private generateSearchStatistics(issues: any[]): string[] {
    if (issues.length === 0) return [];

    const stats: { [key: string]: number } = {};
    const statusStats: { [key: string]: number } = {};
    const typeStats: { [key: string]: number } = {};

    issues.forEach(issue => {
      const fields = issue.fields || {};
      
      // Status statistics
      const status = fields.status?.name || 'Unknown';
      statusStats[status] = (statusStats[status] || 0) + 1;
      
      // Issue type statistics
      const type = fields.issuetype?.name || 'Unknown';
      typeStats[type] = (typeStats[type] || 0) + 1;
    });

    const result = [];
    
    // Top statuses
    const topStatuses = Object.entries(statusStats)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([status, count]) => `${status}: ${count}`)
      .join(', ');
    
    if (topStatuses) {
      result.push(`• **Top Statuses**: ${topStatuses}`);
    }

    // Top issue types
    const topTypes = Object.entries(typeStats)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([type, count]) => `${type}: ${count}`)
      .join(', ');
    
    if (topTypes) {
      result.push(`• **Issue Types**: ${topTypes}`);
    }

    return result;
  }

  rateLimit() {
    return {
      requestsPerMinute: 30, // Search can be expensive
      burstLimit: 5
    };
  }
}
