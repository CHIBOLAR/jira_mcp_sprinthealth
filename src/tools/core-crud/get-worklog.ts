import { BaseJiraTool, ToolResult, ValidationResult, ToolValidator } from '../base-tool.js';

/**
 * Parameters for getting worklog from an issue
 */
interface GetWorklogParams {
  issueKey: string;
  startAt?: number;
  maxResults?: number;
  startedAfter?: string; // ISO date string
  startedBefore?: string; // ISO date string
  author?: string; // accountId
}

/**
 * Tool for retrieving work logs from Jira issues
 */
export class JiraGetWorklogTool extends BaseJiraTool {
  execute(params: GetWorklogParams): Promise<ToolResult> {
    return this.getWorklog(params);
  }

  validate(params: GetWorklogParams): ValidationResult {
    const validation = ToolValidator.combine(
      ToolValidator.required(params.issueKey, 'issueKey'),
      ToolValidator.string(params.issueKey, 'issueKey')
    );

    const errors = [...validation.errors];

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

  private async getWorklog(params: GetWorklogParams): Promise<ToolResult> {
    try {
      // Validate parameters
      const validation = this.validate(params);
      if (!validation.valid) {
        return this.formatError(validation.errors.join(', '), 'Parameter validation');
      }

      // Build query parameters
      const queryParams = this.buildQueryParams(params);

      // Get worklogs
      const response = await this.jiraClient.makeRequest(
        `/rest/api/3/issue/${params.issueKey}/worklog${queryParams}`
      );

      const worklogs = response.worklogs || [];
      const total = response.total || worklogs.length;
      const startAt = response.startAt || 0;
      const maxResults = response.maxResults || worklogs.length;

      if (worklogs.length === 0) {
        return this.formatSuccess(
          'No Worklogs Found',
          `❌ No work logs found for issue ${params.issueKey}.\n\n` +
          `This could mean:\n` +
          `• No time has been logged on this issue\n` +
          `• You don't have permission to view worklogs\n` +
          `• Filters (date/author) exclude all worklogs`
        );
      }

      // Format worklog information
      const worklogInfo = [
        `⏱️ **Work Logs for ${params.issueKey}** (${worklogs.length} of ${total} shown)`,
        ``
      ];

      if (total > startAt + maxResults) {
        const nextStartAt = startAt + maxResults;
        worklogInfo.push(`💡 **Pagination**: Use startAt=${nextStartAt} for next ${Math.min(params.maxResults || 50, total - nextStartAt)} results\n`);
      }

      // Calculate totals
      let totalTimeSpent = 0;
      const authorMap = new Map<string, number>();

      worklogs.forEach((worklog: any, index: number) => {
        const worklogNumber = startAt + index + 1;
        const author = worklog.author?.displayName || 'Unknown';
        const timeSpentSeconds = worklog.timeSpentSeconds || 0;
        const timeSpent = worklog.timeSpent || '0m';
        
        totalTimeSpent += timeSpentSeconds;
        authorMap.set(author, (authorMap.get(author) || 0) + timeSpentSeconds);

        const worklogDetail = [
          `**${worklogNumber}. ${author}** - ${timeSpent}`,
          `   Started: ${this.formatDate(worklog.started)}`,
          `   Logged: ${this.formatDate(worklog.created)}`
        ];

        if (worklog.comment && worklog.comment.content) {
          const commentText = this.extractTextFromComment(worklog.comment);
          if (commentText) {
            worklogDetail.push(`   Comment: "${this.truncateText(commentText, 100)}"`);
          }
        }

        if (worklog.visibility) {
          worklogDetail.push(`   Visibility: ${worklog.visibility.type} - ${worklog.visibility.value}`);
        }

        worklogInfo.push(...worklogDetail, '');
      });

      // Add summary statistics
      worklogInfo.push('**📊 Summary Statistics**:');
      worklogInfo.push(`• **Total Time**: ${this.formatSeconds(totalTimeSpent)}`);
      worklogInfo.push(`• **Total Entries**: ${total}`);
      
      if (authorMap.size > 1) {
        const topAuthors = Array.from(authorMap.entries())
          .sort(([,a], [,b]) => b - a)
          .slice(0, 3)
          .map(([author, seconds]) => `${author}: ${this.formatSeconds(seconds)}`)
          .join(', ');
        worklogInfo.push(`• **Top Contributors**: ${topAuthors}`);
      }

      const issueUrl = `${this.jiraClient.getBaseUrl()}/browse/${params.issueKey}`;
      worklogInfo.push(`\n🔗 **Issue URL**: ${issueUrl}`);

      return this.formatSuccess(
        `Work Logs Retrieved (${worklogs.length}/${total})`,
        worklogInfo.join('\n')
      );

    } catch (error: any) {
      if (error.response?.status === 404) {
        return this.formatError(`Issue ${params.issueKey} not found`, 'Worklog retrieval');
      }
      if (error.response?.status === 403) {
        return this.formatError(`Access denied to worklogs for issue ${params.issueKey}`, 'Worklog retrieval');
      }
      return this.formatError(error, 'Worklog retrieval');
    }
  }

  /**
   * Build query parameters for worklog filtering
   */
  private buildQueryParams(params: GetWorklogParams): string {
    const queryParts: string[] = [];

    if (params.startAt !== undefined) {
      queryParts.push(`startAt=${params.startAt}`);
    }

    if (params.maxResults !== undefined) {
      queryParts.push(`maxResults=${params.maxResults}`);
    } else {
      queryParts.push('maxResults=50'); // Default
    }

    if (params.startedAfter) {
      queryParts.push(`startedAfter=${encodeURIComponent(params.startedAfter)}`);
    }

    if (params.startedBefore) {
      queryParts.push(`startedBefore=${encodeURIComponent(params.startedBefore)}`);
    }

    if (params.author) {
      queryParts.push(`author=${encodeURIComponent(params.author)}`);
    }

    return queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
  }

  /**
   * Extract text content from Jira comment structure
   */
  private extractTextFromComment(comment: any): string {
    if (!comment || !comment.content) return '';
    
    let text = '';
    const extractText = (node: any) => {
      if (node.type === 'text' && node.text) {
        text += node.text;
      } else if (node.content && Array.isArray(node.content)) {
        node.content.forEach(extractText);
      }
    };
    
    comment.content.forEach(extractText);
    return text.trim();
  }

  /**
   * Helper method to format seconds into readable time
   */
  private formatSeconds(seconds: number): string {
    if (seconds < 60) return `${seconds} seconds`;
    if (seconds < 3600) return `${Math.round(seconds / 60)} minutes`;
    if (seconds < 86400) return `${(seconds / 3600).toFixed(1)} hours`;
    return `${(seconds / 86400).toFixed(1)} days`;
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

  rateLimit() {
    return {
      requestsPerMinute: 80, // Worklog retrieval is lightweight
      burstLimit: 20
    };
  }
}
