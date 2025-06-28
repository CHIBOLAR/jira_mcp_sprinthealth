import { BaseJiraTool, ToolResult, ValidationResult } from '../base-tool.js';

/**
 * Parameters for getting custom fields
 */
interface GetCustomFieldsParams {
  projectKey?: string;
  type?: string;
}

/**
 * Tool for retrieving custom field definitions
 */
export class JiraGetCustomFieldsTool extends BaseJiraTool {
  execute(params: GetCustomFieldsParams): Promise<ToolResult> {
    return this.getCustomFields(params);
  }

  validate(params: GetCustomFieldsParams): ValidationResult {
    return { valid: true, errors: [] };
  }

  private async getCustomFields(params: GetCustomFieldsParams): Promise<ToolResult> {
    try {
      // Get all custom fields
      const fields = await this.jiraClient.makeRequest('/rest/api/3/field');

      // Filter to only custom fields (they start with 'customfield_')
      const customFields = fields.filter((field: any) => field.id.startsWith('customfield_'));

      if (!customFields || customFields.length === 0) {
        return this.formatSuccess(
          'No Custom Fields Found',
          `❌ No custom fields found in this Jira instance.`
        );
      }

      // Filter by type if specified
      let filteredFields = customFields;
      if (params.type) {
        filteredFields = customFields.filter((field: any) => 
          field.schema?.type?.toLowerCase().includes(params.type!.toLowerCase()) ||
          field.schema?.custom?.toLowerCase().includes(params.type!.toLowerCase())
        );
      }

      // Format custom fields information
      const fieldInfo = [
        `🔧 **Custom Fields** (${filteredFields.length} found${params.type ? ` for type "${params.type}"` : ''})`,
        ``
      ];

      filteredFields.forEach((field: any, index: number) => {
        const fieldDetail = [
          `**${index + 1}. ${field.name}** (${field.id})`
        ];

        if (field.description) {
          fieldDetail.push(`   Description: ${field.description}`);
        }

        // Add type information
        if (field.schema) {
          let typeInfo = field.schema.type;
          if (field.schema.items) {
            typeInfo += ` (array of ${field.schema.items})`;
          }
          if (field.schema.custom) {
            typeInfo += ` - ${field.schema.custom}`;
          }
          fieldDetail.push(`   Type: ${typeInfo}`);
        }

        // Add context information if available
        if (field.contexts && field.contexts.length > 0) {
          fieldDetail.push(`   Contexts: ${field.contexts.length} available`);
        }

        // Add searchability info
        if (field.searchable !== undefined) {
          fieldDetail.push(`   Searchable: ${field.searchable ? 'Yes' : 'No'}`);
        }

        fieldInfo.push(...fieldDetail, '');
      });

      // Add usage information
      fieldInfo.push('**💡 Usage Tips**:');
      fieldInfo.push('• Use field ID (customfield_xxxxx) in API calls');
      fieldInfo.push('• Custom fields are project and context dependent');
      fieldInfo.push('• Check field type for proper value formatting');
      fieldInfo.push(`• Example: Update field with \`jira_update_issue\` using field ID`);
      
      // Add type summary
      const typeGroups = filteredFields.reduce((acc: any, field: any) => {
        const type = field.schema?.type || 'unknown';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {});
      
      if (Object.keys(typeGroups).length > 0) {
        const typeSummary = Object.entries(typeGroups)
          .map(([type, count]) => `${type} (${count})`)
          .join(', ');
        fieldInfo.push(`• Field types: ${typeSummary}`);
      }

      return this.formatSuccess(
        `Custom Fields Retrieved (${filteredFields.length})`,
        fieldInfo.join('\n')
      );

    } catch (error: any) {
      if (error.response?.status === 403) {
        return this.formatError('Permission denied - check field configuration access', 'Custom fields retrieval');
      }
      return this.formatError(error, 'Custom fields retrieval');
    }
  }

  rateLimit() {
    return {
      requestsPerMinute: 80, // Field operations are lightweight but may be frequent
      burstLimit: 25
    };
  }
}