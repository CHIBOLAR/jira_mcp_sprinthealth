import { BaseJiraTool, ToolResult, ValidationResult } from '../base-tool.js';

/**
 * Parameters for getting priorities (no parameters needed)
 */
interface GetPrioritiesParams {}

/**
 * Tool for retrieving available priority levels
 */
export class JiraGetPrioritiesTool extends BaseJiraTool {
  execute(params: GetPrioritiesParams): Promise<ToolResult> {
    return this.getPriorities(params);
  }

  validate(params: GetPrioritiesParams): ValidationResult {
    return { valid: true, errors: [] };
  }

  private async getPriorities(params: GetPrioritiesParams): Promise<ToolResult> {
    try {
      // Get all priorities
      const priorities = await this.jiraClient.makeRequest('/rest/api/3/priority');

      if (!priorities || priorities.length === 0) {
        return this.formatSuccess(
          'No Priorities Found',
          `❌ No priority levels found in this Jira instance.`
        );
      }

      // Format priorities information
      const priorityInfo = [
        `⚡ **Available Priorities** (${priorities.length} found)`,
        ``
      ];

      priorities.forEach((priority: any, index: number) => {
        const priorityDetail = [
          `**${index + 1}. ${priority.name}** (ID: ${priority.id})`
        ];

        if (priority.description) {
          priorityDetail.push(`   Description: ${priority.description}`);
        }

        // Add color information if available
        if (priority.statusColor) {
          priorityDetail.push(`   Color: ${priority.statusColor}`);
        }

        // Add icon information if available
        if (priority.iconUrl) {
          priorityDetail.push(`   Has Icon: Yes`);
        }

        priorityInfo.push(...priorityDetail, '');
      });

      // Add usage information
      priorityInfo.push('**💡 Usage Tips**:');
      priorityInfo.push('• Use the exact name when creating or updating issues');
      priorityInfo.push('• Priority affects issue ordering and visibility');
      priorityInfo.push(`• Example: \`jira_create_issue\` with priority="${priorities[0]?.name}"`);
      
      // Add common priorities note
      const commonPriorities = priorities.filter((p: any) => 
        ['highest', 'high', 'medium', 'low', 'lowest', 'critical', 'major', 'minor', 'trivial']
          .includes(p.name.toLowerCase())
      );
      
      if (commonPriorities.length > 0) {
        const commonNames = commonPriorities.map((p: any) => p.name).join(', ');
        priorityInfo.push(`• Common priorities available: ${commonNames}`);
      }

      return this.formatSuccess(
        `Priorities Retrieved (${priorities.length})`,
        priorityInfo.join('\n')
      );

    } catch (error: any) {
      if (error.response?.status === 403) {
        return this.formatError('Permission denied - check system administration access', 'Priorities retrieval');
      }
      return this.formatError(error, 'Priorities retrieval');
    }
  }

  rateLimit() {
    return {
      requestsPerMinute: 100, // Metadata operations are very lightweight
      burstLimit: 30
    };
  }
}
