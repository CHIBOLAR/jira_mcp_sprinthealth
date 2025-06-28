import { BaseJiraTool, ToolResult, ValidationResult, ToolValidator } from '../base-tool.js';

/**
 * Parameters for adding a comment to an issue
 */
interface AddCommentParams {
  issueKey: string;
  body: string;
  visibility?: {
    type: 'group' | 'role';
    value: string;
  };
}

/**
 * Tool for adding comments to Jira issues
 */
export class JiraAddCommentTool extends BaseJiraTool {
  execute(params: AddCommentParams): Promise<ToolResult> {
    return this.addComment(params);
  }

  validate(params: AddCommentParams): ValidationResult {
    return ToolValidator.combine(
      ToolValidator.required(params.issueKey, 'issueKey'),
      ToolValidator.string(params.issueKey, 'issueKey'),
      ToolValidator.required(params.body, 'body'),
      ToolValidator.string(params.body, 'body')
    );
  }

  private async addComment(params: AddCommentParams): Promise<ToolResult> {
    try {
      // Validate parameters
      const validation = this.validate(params);
      if (!validation.valid) {
        return this.formatError(validation.errors.join(', '), 'Parameter validation');
      }

      // Build comment payload
      const commentPayload = this.buildCommentPayload(params);

      // Add the comment
      const response = await this.jiraClient.makeRequest(
        `/rest/api/3/issue/${params.issueKey}/comment`,
        {
          method: 'POST',
          data: commentPayload
        }
      );

      if (!response.id) {
        return this.formatError('Comment creation failed - no comment ID returned', 'Comment creation');
      }

      // Get comment details from response
      const commentId = response.id;
      const author = response.author?.displayName || 'Unknown';
      const created = response.created || new Date().toISOString();
      const issueUrl = `${this.jiraClient.getBaseUrl()}/browse/${params.issueKey}`;

      // Format success response
      const commentInfo = [
        `💬 **Comment Added to ${params.issueKey}**`,
        `🔗 **Issue URL**: ${issueUrl}`,
        `📝 **Comment ID**: ${commentId}`,
        `👤 **Author**: ${author}`,
        `🕒 **Added**: ${this.formatDate(created)}`,
        `📄 **Content**: "${this.truncateText(params.body, 200)}"`
      ];

      if (params.visibility) {
        commentInfo.push(`🔒 **Visibility**: ${params.visibility.type} - ${params.visibility.value}`);
      } else {
        commentInfo.push(`👁️ **Visibility**: Public (all users with issue access)`);
      }

      return this.formatSuccess(
        `Comment Added to ${params.issueKey}`,
        commentInfo.join('\n')
      );

    } catch (error: any) {
      if (error.response?.status === 400) {
        return this.formatError('Invalid comment data - check comment body and visibility settings', 'Comment creation');
      }
      if (error.response?.status === 403) {
        return this.formatError('Permission denied - check comment permissions for this issue', 'Comment creation');
      }
      if (error.response?.status === 404) {
        return this.formatError(`Issue ${params.issueKey} not found`, 'Comment creation');
      }
      return this.formatError(error, 'Comment creation');
    }
  }

  /**
   * Build comment payload for API request
   */
  private buildCommentPayload(params: AddCommentParams): any {
    const payload: any = {
      body: {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [
              {
                text: params.body,
                type: 'text'
              }
            ]
          }
        ]
      }
    };

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
      requestsPerMinute: 60, // Comments are common operations
      burstLimit: 15
    };
  }
}
