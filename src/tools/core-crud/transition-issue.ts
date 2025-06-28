import { BaseJiraTool, ToolResult, ValidationResult, ToolValidator } from '../base-tool.js';

/**
 * Parameters for transitioning an issue
 */
interface TransitionIssueParams {
  issueKey: string;
  transitionId?: string;
  transitionName?: string;
  comment?: string;
  fields?: { [key: string]: any };
  assignee?: string;
  resolution?: string;
}

/**
 * Tool for executing workflow transitions on Jira issues
 */
export class JiraTransitionIssueTool extends BaseJiraTool {
  execute(params: TransitionIssueParams): Promise<ToolResult> {
    return this.transitionIssue(params);
  }

  validate(params: TransitionIssueParams): ValidationResult {
    const validation = ToolValidator.combine(
      ToolValidator.required(params.issueKey, 'issueKey'),
      ToolValidator.string(params.issueKey, 'issueKey')
    );

    // Must have either transitionId or transitionName
    if (!params.transitionId && !params.transitionName) {
      return {
        valid: false,
        errors: [...validation.errors, 'Either transitionId or transitionName must be provided']
      };
    }

    return validation;
  }

  private async transitionIssue(params: TransitionIssueParams): Promise<ToolResult> {
    try {
      // Validate parameters
      const validation = this.validate(params);
      if (!validation.valid) {
        return this.formatError(validation.errors.join(', '), 'Parameter validation');
      }

      // Get available transitions to validate and get transition ID
      const transitionsResponse = await this.jiraClient.makeRequest(
        `/rest/api/3/issue/${params.issueKey}/transitions`
      );

      const availableTransitions = transitionsResponse.transitions || [];
      
      if (availableTransitions.length === 0) {
        return this.formatError('No transitions available for this issue', 'Transition validation');
      }

      // Find the target transition
      let targetTransition;
      if (params.transitionId) {
        targetTransition = availableTransitions.find((t: any) => t.id === params.transitionId);
      } else if (params.transitionName) {
        targetTransition = availableTransitions.find((t: any) => 
          t.name.toLowerCase() === params.transitionName!.toLowerCase()
        );
      }

      if (!targetTransition) {
        const availableNames = availableTransitions.map((t: any) => t.name).join(', ');
        return this.formatError(
          `Transition not found. Available transitions: ${availableNames}`, 
          'Transition validation'
        );
      }

      // Build transition payload
      const transitionPayload = this.buildTransitionPayload(targetTransition, params);

      // Execute the transition
      await this.jiraClient.makeRequest(
        `/rest/api/3/issue/${params.issueKey}/transitions`,
        {
          method: 'POST',
          data: transitionPayload
        }
      );

      // Get updated issue details
      const updatedIssue = await this.jiraClient.makeRequest(
        `/rest/api/3/issue/${params.issueKey}?fields=status,assignee,resolution,updated`
      );

      const fields = updatedIssue.fields || {};
      const issueUrl = `${this.jiraClient.getBaseUrl()}/browse/${params.issueKey}`;

      // Format success response
      const transitionInfo = [
        `🔄 **Issue Transitioned**: ${params.issueKey}`,
        `🔗 **URL**: ${issueUrl}`,
        `✅ **Transition**: ${targetTransition.name}`,
        `📊 **New Status**: ${fields.status?.name || 'Unknown'}`,
        `👤 **Assignee**: ${fields.assignee?.displayName || 'Unassigned'}`,
        `🕒 **Updated**: ${this.formatDate(fields.updated)}`
      ];

      if (fields.resolution) {
        transitionInfo.push(`🎯 **Resolution**: ${fields.resolution.name}`);
      }

      if (params.comment) {
        transitionInfo.push(`💬 **Comment Added**: "${this.truncateText(params.comment, 100)}"`);
      }

      return this.formatSuccess(
        `Issue ${params.issueKey} Transitioned Successfully`,
        transitionInfo.join('\n')
      );

    } catch (error: any) {
      if (error.response?.status === 400) {
        return this.formatError('Invalid transition data - check required fields', 'Issue transition');
      }
      if (error.response?.status === 403) {
        return this.formatError('Permission denied - check transition permissions', 'Issue transition');
      }
      if (error.response?.status === 404) {
        return this.formatError(`Issue ${params.issueKey} not found`, 'Issue transition');
      }
      return this.formatError(error, 'Issue transition');
    }
  }

  /**
   * Build transition payload for API request
   */
  private buildTransitionPayload(transition: any, params: TransitionIssueParams): any {
    const payload: any = {
      transition: {
        id: transition.id
      }
    };

    // Add fields if provided
    if (params.fields || params.assignee || params.resolution) {
      payload.fields = {};
      
      // Add custom fields
      if (params.fields) {
        Object.assign(payload.fields, params.fields);
      }
      
      // Add assignee if provided
      if (params.assignee) {
        if (params.assignee.toLowerCase() === 'unassigned' || params.assignee === '') {
          payload.fields.assignee = null;
        } else {
          payload.fields.assignee = {
            accountId: params.assignee
          };
        }
      }
      
      // Add resolution if provided
      if (params.resolution) {
        payload.fields.resolution = {
          name: params.resolution
        };
      }
    }

    // Add comment if provided
    if (params.comment) {
      payload.update = {
        comment: [
          {
            add: {
              body: {
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
              }
            }
          }
        ]
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
      requestsPerMinute: 50, // Transitions can have side effects
      burstLimit: 10
    };
  }
}
