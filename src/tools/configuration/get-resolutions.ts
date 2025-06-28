import { BaseJiraTool, ToolResult, ValidationResult } from '../base-tool.js';

/**
 * Parameters for getting resolutions (no parameters needed)
 */
interface GetResolutionsParams {}

/**
 * Tool for retrieving available resolution types
 */
export class JiraGetResolutionsTool extends BaseJiraTool {
  execute(params: GetResolutionsParams): Promise<ToolResult> {
    return this.getResolutions(params);
  }

  validate(params: GetResolutionsParams): ValidationResult {
    return { valid: true, errors: [] };
  }

  private async getResolutions(params: GetResolutionsParams): Promise<ToolResult> {
    try {
      // Get all resolutions
      const resolutions = await this.jiraClient.makeRequest('/rest/api/3/resolution');

      if (!resolutions || resolutions.length === 0) {
        return this.formatSuccess(
          'No Resolutions Found',
          `❌ No resolution types found in this Jira instance.`
        );
      }

      // Format resolutions information
      const resolutionInfo = [
        `🏁 **Available Resolutions** (${resolutions.length} found)`,
        ``
      ];

      resolutions.forEach((resolution: any, index: number) => {
        const resolutionDetail = [
          `**${index + 1}. ${resolution.name}** (ID: ${resolution.id})`
        ];

        if (resolution.description) {
          resolutionDetail.push(`   Description: ${resolution.description}`);
        }

        resolutionInfo.push(...resolutionDetail, '');
      });

      // Add usage information
      resolutionInfo.push('**💡 Usage Tips**:');
      resolutionInfo.push('• Use when transitioning issues to "Done" or "Closed" status');
      resolutionInfo.push('• Resolution explains why an issue was completed');
      resolutionInfo.push(`• Example: \`jira_transition_issue\` with resolution="${resolutions[0]?.name}"`);
      
      // Add common resolutions note
      const commonResolutions = resolutions.filter((r: any) => 
        ['done', 'fixed', 'won\'t fix', 'duplicate', 'incomplete', 'cannot reproduce', 'resolved']
          .includes(r.name.toLowerCase())
      );
      
      if (commonResolutions.length > 0) {
        const commonNames = commonResolutions.map((r: any) => r.name).join(', ');
        resolutionInfo.push(`• Common resolutions available: ${commonNames}`);
      }

      return this.formatSuccess(
        `Resolutions Retrieved (${resolutions.length})`,
        resolutionInfo.join('\n')
      );

    } catch (error: any) {
      if (error.response?.status === 403) {
        return this.formatError('Permission denied - check system administration access', 'Resolutions retrieval');
      }
      return this.formatError(error, 'Resolutions retrieval');
    }
  }

  rateLimit() {
    return {
      requestsPerMinute: 100, // Metadata operations are very lightweight
      burstLimit: 30
    };
  }
}