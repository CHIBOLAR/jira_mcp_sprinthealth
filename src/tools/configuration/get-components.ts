import { BaseJiraTool, ToolResult, ValidationResult, ToolValidator } from '../base-tool.js';

/**
 * Parameters for getting project components
 */
interface GetComponentsParams {
  projectKey: string;
}

/**
 * Tool for retrieving project components
 */
export class JiraGetComponentsTool extends BaseJiraTool {
  execute(params: GetComponentsParams): Promise<ToolResult> {
    return this.getComponents(params);
  }

  validate(params: GetComponentsParams): ValidationResult {
    return ToolValidator.combine(
      ToolValidator.required(params.projectKey, 'projectKey'),
      ToolValidator.string(params.projectKey, 'projectKey')
    );
  }

  private async getComponents(params: GetComponentsParams): Promise<ToolResult> {
    try {
      // Get project components
      const components = await this.jiraClient.makeRequest(
        `/rest/api/3/project/${params.projectKey}/component`
      );

      if (!components || components.length === 0) {
        return this.formatSuccess(
          'No Components Found',
          `❌ No components found in project "${params.projectKey}".`
        );
      }

      // Sort components by name
      const sortedComponents = components.sort((a: any, b: any) => 
        a.name.localeCompare(b.name)
      );

      // Format components information
      const componentInfo = [
        `🧩 **Project Components for ${params.projectKey}** (${components.length} found)`,
        ``
      ];

      sortedComponents.forEach((component: any, index: number) => {
        const componentDetail = [
          `**${index + 1}. ${component.name}** (ID: ${component.id})`
        ];

        if (component.description) {
          componentDetail.push(`   Description: ${component.description}`);
        }

        // Add lead information
        if (component.lead) {
          const leadName = component.lead.displayName || component.lead.name || 'Unknown';
          componentDetail.push(`   Lead: ${leadName}`);
        }

        // Add assignee type information
        if (component.assigneeType) {
          const assigneeTypes: { [key: string]: string } = {
            'PROJECT_DEFAULT': 'Project Default',
            'COMPONENT_LEAD': 'Component Lead',
            'PROJECT_LEAD': 'Project Lead',
            'UNASSIGNED': 'Unassigned'
          };
          const assigneeType = assigneeTypes[component.assigneeType] || component.assigneeType;
          componentDetail.push(`   Default Assignee: ${assigneeType}`);
        }

        // Add issue count if available
        if (component.issueCount !== undefined) {
          componentDetail.push(`   Open Issues: ${component.issueCount}`);
        }

        componentInfo.push(...componentDetail, '');
      });

      // Add usage information
      componentInfo.push('**💡 Usage Tips**:');
      componentInfo.push('• Components organize issues by functional area or team');
      componentInfo.push('• Use component name when creating or updating issues');
      componentInfo.push('• Components can have default assignees for automatic assignment');
      componentInfo.push(`• Example: \`jira_create_issue\` with components=["${sortedComponents[0]?.name}"]`);
      
      // Add component lead summary
      const leadsSet = new Set();
      sortedComponents.forEach((comp: any) => {
        if (comp.lead?.displayName) {
          leadsSet.add(comp.lead.displayName);
        }
      });
      
      if (leadsSet.size > 0) {
        const leads = Array.from(leadsSet).slice(0, 5);
        componentInfo.push(`• Component leads: ${leads.join(', ')}${leadsSet.size > 5 ? ' and others' : ''}`);
      }

      // Add assignee type summary
      const assigneeTypes = sortedComponents.reduce((acc: any, comp: any) => {
        const type = comp.assigneeType || 'UNKNOWN';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {});
      
      if (Object.keys(assigneeTypes).length > 0) {
        const typeSummary = Object.entries(assigneeTypes)
          .map(([type, count]) => `${type.toLowerCase().replace('_', ' ')} (${count})`)
          .join(', ');
        componentInfo.push(`• Assignment types: ${typeSummary}`);
      }

      return this.formatSuccess(
        `Components Retrieved (${components.length})`,
        componentInfo.join('\n')
      );

    } catch (error: any) {
      if (error.response?.status === 404) {
        return this.formatError(`Project "${params.projectKey}" not found or not accessible`, 'Components retrieval');
      }
      if (error.response?.status === 403) {
        return this.formatError('Permission denied - check project access', 'Components retrieval');
      }
      return this.formatError(error, 'Components retrieval');
    }
  }

  rateLimit() {
    return {
      requestsPerMinute: 80, // Component operations are lightweight
      burstLimit: 25
    };
  }
}