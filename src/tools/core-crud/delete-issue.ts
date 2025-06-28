import { BaseJiraTool, ToolResult, ValidationResult, ToolValidator } from '../base-tool.js';

/**
 * Parameters for deleting a Jira issue
 */
interface DeleteIssueParams {
  issueKey: string;
  deleteSubtasks?: boolean;
  confirmDeletion?: boolean;
}

/**
 * Tool for deleting Jira issues with safety checks
 */
export class JiraDeleteIssueTool extends BaseJiraTool {
  execute(params: DeleteIssueParams): Promise<ToolResult> {
    return this.deleteIssue(params);
  }

  validate(params: DeleteIssueParams): ValidationResult {
    return ToolValidator.combine(
      ToolValidator.required(params.issueKey, 'issueKey'),
      ToolValidator.string(params.issueKey, 'issueKey')
    );
  }

  private async deleteIssue(params: DeleteIssueParams): Promise<ToolResult> {
    try {
      // Validate parameters
      const validation = this.validate(params);
      if (!validation.valid) {
        return this.formatError(validation.errors.join(', '), 'Parameter validation');
      }

      // Safety check: require explicit confirmation
      if (!params.confirmDeletion) {
        return this.formatError(
          'Deletion requires explicit confirmation. Set confirmDeletion: true to proceed',
          'Safety check'
        );
      }

      // Get issue details before deletion for confirmation
      const issueDetails = await this.jiraClient.makeRequest(
        `/rest/api/3/issue/${params.issueKey}?fields=summary,project,issuetype,status,subtasks`
      );

      const fields = issueDetails.fields || {};
      const subtasks = fields.subtasks || [];
      
      // Check for subtasks if deleteSubtasks is not specified
      if (subtasks.length > 0 && !params.deleteSubtasks) {
        return this.formatError(
          `Issue ${params.issueKey} has ${subtasks.length} subtask(s). Set deleteSubtasks: true to delete them along with the parent issue`,
          'Subtask check'
        );
      }

      // Build delete URL with subtask parameter
      const deleteUrl = `/rest/api/3/issue/${params.issueKey}${params.deleteSubtasks ? '?deleteSubtasks=true' : ''}`;

      // Perform the deletion
      await this.jiraClient.makeRequest(deleteUrl, {
        method: 'DELETE'
      });

      // Format success response
      const deletionInfo = [
        `🗑️ **Issue Deleted**: ${params.issueKey}`,
        `📝 **Summary**: ${fields.summary || 'No summary'}`,
        `📋 **Project**: ${fields.project?.key || 'Unknown'}`,
        `🏷️ **Type**: ${fields.issuetype?.name || 'Unknown'}`,
        `📊 **Status**: ${fields.status?.name || 'Unknown'}`
      ];

      if (subtasks.length > 0 && params.deleteSubtasks) {
        deletionInfo.push(`🔗 **Subtasks Deleted**: ${subtasks.length} subtask(s) also removed`);
      }

      deletionInfo.push(
        ``,
        `⚠️ **Note**: This action cannot be undone. The issue and its history have been permanently removed.`
      );

      return this.formatSuccess(
        `Issue ${params.issueKey} Deleted Successfully`,
        deletionInfo.join('\n')
      );

    } catch (error: any) {
      if (error.response?.status === 403) {
        return this.formatError('Permission denied - check delete permissions for this issue', 'Issue deletion');
      }
      if (error.response?.status === 404) {
        return this.formatError(`Issue ${params.issueKey} not found or already deleted`, 'Issue deletion');
      }
      if (error.response?.status === 400) {
        return this.formatError('Cannot delete issue - check for blockers like subtasks or dependencies', 'Issue deletion');
      }
      return this.formatError(error, 'Issue deletion');
    }
  }

  rateLimit() {
    return {
      requestsPerMinute: 30, // Deletion is a sensitive operation
      burstLimit: 5
    };
  }
}
