import { BaseJiraTool, ToolResult, ValidationResult, ToolValidator } from '../base-tool.js';

/**
 * Parameters for adding worklog to an issue
 */
interface AddWorklogParams {
  issueKey: string;
  timeSpent: string; // e.g., "1h 30m", "2d", "45m"
  comment?: string;
  started?: string; // ISO date string
  visibility?: {
    type: 'group' | 'role';
    value: string;
  };
  adjustEstimate?: 'new' | 'leave' | 'manual' | 'auto';
  newEstimate?: string; // Required if adjustEstimate is 'new'
  reduceBy?: string; // Required if adjustEstimate is 'manual'
}

/**
 * Tool for adding work logs to Jira issues
 */
export class JiraAddWorklogTool extends BaseJiraTool {
  execute(params: AddWorklogParams): Promise<ToolResult> {
    return this.addWorklog(params);
  }

  validate(params: AddWorklogParams): ValidationResult {
    const validation = ToolValidator.combine(
      ToolValidator.required(params.issueKey, 'issueKey'),
      ToolValidator.string(params.issueKey, 'issueKey'),
      ToolValidator.required(params.timeSpent, 'timeSpent'),
      ToolValidator.string(params.timeSpent, 'timeSpent')
    );

    // Validate time format
    if (params.timeSpent && !this.isValidTimeFormat(params.timeSpent)) {
      return {
        valid: false,
        errors: [...validation.errors, 'timeSpent must be in valid format (e.g., "1h 30m", "2d", "45m")']
      };
    }

    // Validate adjustEstimate dependencies
    if (params.adjustEstimate === 'new' && !params.newEstimate) {
      return {
        valid: false,
        errors: [...validation.errors, 'newEstimate is required when adjustEstimate is "new"']
      };
    }

    if (params.adjustEstimate === 'manual' && !params.reduceBy) {
      return {
        valid: false,
        errors: [...validation.errors, 'reduceBy is required when adjustEstimate is "manual"']
      };
    }

    return validation;
  }

  private async addWorklog(params: AddWorklogParams): Promise<ToolResult> {
    try {
      // Validate parameters
      const validation = this.validate(params);
      if (!validation.valid) {
        return this.formatError(validation.errors.join(', '), 'Parameter validation');
      }

      // Build worklog payload
      const worklogPayload = this.buildWorklogPayload(params);
      
      // Build query parameters for estimate adjustment
      const queryParams = this.buildQueryParams(params);

      // Add the worklog
      const response = await this.jiraClient.makeRequest(
        `/rest/api/3/issue/${params.issueKey}/worklog${queryParams}`,
        {
          method: 'POST',
          data: worklogPayload
        }
      );

      if (!response.id) {
        return this.formatError('Worklog creation failed - no worklog ID returned', 'Worklog creation');
      }

      // Get worklog details from response
      const worklogId = response.id;
      const author = response.author?.displayName || 'Unknown';
      const created = response.created || new Date().toISOString();
      const started = response.started || params.started || created;
      const timeSpentSeconds = response.timeSpentSeconds || 0;
      const issueUrl = `${this.jiraClient.getBaseUrl()}/browse/${params.issueKey}`;

      // Format success response
      const worklogInfo = [
        `⏱️ **Worklog Added to ${params.issueKey}**`,
        `🔗 **Issue URL**: ${issueUrl}`,
        `📝 **Worklog ID**: ${worklogId}`,
        `👤 **Author**: ${author}`,
        `⏰ **Time Spent**: ${params.timeSpent} (${this.formatSeconds(timeSpentSeconds)})`,
        `📅 **Started**: ${this.formatDate(started)}`,
        `🕒 **Logged**: ${this.formatDate(created)}`
      ];

      if (params.comment) {
        worklogInfo.push(`💬 **Comment**: "${this.truncateText(params.comment, 150)}"`);
      }

      if (params.visibility) {
        worklogInfo.push(`🔒 **Visibility**: ${params.visibility.type} - ${params.visibility.value}`);
      } else {
        worklogInfo.push(`👁️ **Visibility**: Public (all users with issue access)`);
      }

      // Add estimate adjustment information
      if (params.adjustEstimate && params.adjustEstimate !== 'auto') {
        worklogInfo.push(`📊 **Estimate Adjustment**: ${params.adjustEstimate}`);
      }

      return this.formatSuccess(
        `Worklog Added to ${params.issueKey}`,
        worklogInfo.join('\n')
      );

    } catch (error: any) {
      if (error.response?.status === 400) {
        return this.formatError('Invalid worklog data - check time format and estimate values', 'Worklog creation');
      }
      if (error.response?.status === 403) {
        return this.formatError('Permission denied - check worklog permissions for this issue', 'Worklog creation');
      }
      if (error.response?.status === 404) {
        return this.formatError(`Issue ${params.issueKey} not found`, 'Worklog creation');
      }
      return this.formatError(error, 'Worklog creation');
    }
  }

  /**
   * Build worklog payload for API request
   */
  private buildWorklogPayload(params: AddWorklogParams): any {
    const payload: any = {
      timeSpent: params.timeSpent
    };

    // Add started date if provided
    if (params.started) {
      payload.started = params.started;
    }

    // Add comment if provided
    if (params.comment) {
      payload.comment = {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [
              {
                text: params.comment,
                type: 'text'
              }
            ]
          }
        ]
      };
    }

    // Add visibility restrictions if specified
    if (params.visibility) {
      payload.visibility = {
        type: params.visibility.type,
        value: params.visibility.value
      };
    }

    return payload;
  }

  /**
   * Build query parameters for estimate adjustment
   */
  private buildQueryParams(params: AddWorklogParams): string {
    const queryParts: string[] = [];

    if (params.adjustEstimate) {
      queryParts.push(`adjustEstimate=${params.adjustEstimate}`);
      
      if (params.adjustEstimate === 'new' && params.newEstimate) {
        queryParts.push(`newEstimate=${encodeURIComponent(params.newEstimate)}`);
      }
      
      if (params.adjustEstimate === 'manual' && params.reduceBy) {
        queryParts.push(`reduceBy=${encodeURIComponent(params.reduceBy)}`);
      }
    }

    return queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
  }

  /**
   * Validate time format (supports Jira time format)
   */
  private isValidTimeFormat(timeString: string): boolean {
    // Jira accepts formats like: 1h, 30m, 1d, 1h 30m, 2d 4h, etc.
    const timePattern = /^(\d+[wdhm]\s*)+$/;
    return timePattern.test(timeString.trim());
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
      requestsPerMinute: 50, // Worklog creation is moderately expensive
      burstLimit: 10
    };
  }
}
