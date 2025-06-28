import { BaseJiraTool, ToolResult, ValidationResult, ToolValidator } from '../base-tool.js';

/**
 * Parameters for getting issue transitions
 */
interface GetTransitionsParams {
  issueKey: string;
}

/**
 * Tool for retrieving available workflow transitions for an issue
 */
export class JiraGetTransitionsTool extends BaseJiraTool {
  execute(params: GetTransitionsParams): Promise<ToolResult> {
    return this.getTransitions(params);
  }

  validate(params: GetTransitionsParams): ValidationResult {
    return ToolValidator.combine(
      ToolValidator.required(params.issueKey, 'issueKey'),
      ToolValidator.string(params.issueKey, 'issueKey')
    );
  }

  private async getTransitions(params: GetTransitionsParams): Promise<ToolResult> {
    try {
      // Validate parameters
      const validation = this.validate(params);
      if (!validation.valid) {
        return this.formatError(validation.errors.join(', '), 'Parameter validation');
      }

      // Get issue transitions
      const response = await this.jiraClient.makeRequest(
        `/rest/api/3/issue/${params.issueKey}/transitions`
      );

      const transitions = response.transitions || [];

      if (transitions.length === 0) {
        return this.formatSuccess(
          'No Transitions Available',
          `❌ No workflow transitions available for issue ${params.issueKey}.\n\n` +
          `This could mean:\n` +
          `• Issue is in a final state\n` +
          `• You don't have permission to transition this issue\n` +
          `• Issue has restrictive workflow rules`
        );
      }

      // Format transitions information
      const transitionInfo = [
        `🔄 **Available Transitions for ${params.issueKey}** (${transitions.length} found)`,
        ``
      ];

      transitions.forEach((transition: any, index: number) => {
        const transitionDetail = [
          `**${index + 1}. ${transition.name}** (ID: ${transition.id})`,
          `   To Status: ${transition.to?.name || 'Unknown'}`
        ];

        // Add description if available
        if (transition.to?.description) {
          transitionDetail.push(`   Description: ${transition.to.description}`);
        }

        // Add field requirements if any
        if (transition.fields && Object.keys(transition.fields).length > 0) {
          const requiredFields = Object.keys(transition.fields)
            .filter(fieldKey => transition.fields[fieldKey].required)
            .map(fieldKey => transition.fields[fieldKey].name || fieldKey);
          
          if (requiredFields.length > 0) {
            transitionDetail.push(`   Required Fields: ${requiredFields.join(', ')}`);
          }
        }

        transitionInfo.push(...transitionDetail, '');
      });

      // Add usage information
      transitionInfo.push(
        '**💡 Usage Tips**:',
        '• Use transition ID or name with `jira_transition_issue`',
        '• Some transitions may require additional field values',
        '• Check field requirements before attempting transition',
        `• Example: \`jira_transition_issue ${params.issueKey} "${transitions[0]?.name}"\``
      );

      return this.formatSuccess(
        `Transitions Retrieved (${transitions.length})`,
        transitionInfo.join('\n')
      );

    } catch (error: any) {
      if (error.response?.status === 404) {
        return this.formatError(`Issue ${params.issueKey} not found`, 'Transitions retrieval');
      }
      if (error.response?.status === 403) {
        return this.formatError(`Access denied to issue ${params.issueKey}`, 'Transitions retrieval');
      }
      return this.formatError(error, 'Transitions retrieval');
    }
  }

  rateLimit() {
    return {
      requestsPerMinute: 80, // Transition checks are lightweight
      burstLimit: 15
    };
  }
}
