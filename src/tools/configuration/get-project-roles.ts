import { BaseJiraTool, ToolResult, ValidationResult, ToolValidator } from '../base-tool.js';

/**
 * Parameters for getting project roles
 */
interface GetProjectRolesParams {
  projectKey: string;
}

/**
 * Tool for retrieving project roles and their assignments
 */
export class JiraGetProjectRolesTool extends BaseJiraTool {
  execute(params: GetProjectRolesParams): Promise<ToolResult> {
    return this.getProjectRoles(params);
  }

  validate(params: GetProjectRolesParams): ValidationResult {
    return ToolValidator.combine(
      ToolValidator.required(params.projectKey, 'projectKey'),
      ToolValidator.string(params.projectKey, 'projectKey')
    );
  }

  private async getProjectRoles(params: GetProjectRolesParams): Promise<ToolResult> {
    try {
      // Get project roles
      const roles = await this.jiraClient.makeRequest(
        `/rest/api/3/project/${params.projectKey}/role`
      );

      if (!roles || Object.keys(roles).length === 0) {
        return this.formatSuccess(
          'No Project Roles Found',
          `❌ No project roles found in project "${params.projectKey}".`
        );
      }

      // Get detailed information for each role
      const roleDetails = await Promise.all(
        Object.entries(roles).map(async ([roleName, roleUrl]: [string, any]) => {
          try {
            // Extract role ID from URL
            const roleId = roleUrl.split('/').pop();
            const roleDetail = await this.jiraClient.makeRequest(
              `/rest/api/3/project/${params.projectKey}/role/${roleId}`
            );
            return { name: roleName, id: roleId, detail: roleDetail };
          } catch (error) {
            // If we can't get details, just return basic info
            return { name: roleName, id: null, detail: null };
          }
        })
      );

      // Sort roles by name
      const sortedRoles = roleDetails.sort((a, b) => a.name.localeCompare(b.name));

      // Format roles information
      const roleInfo = [
        `👥 **Project Roles for ${params.projectKey}** (${sortedRoles.length} found)`,
        ``
      ];

      sortedRoles.forEach((role, index) => {
        const roleDetail = [
          `**${index + 1}. ${role.name}** (ID: ${role.id || 'N/A'})`
        ];

        if (role.detail) {
          // Add description if available
          if (role.detail.description) {
            roleDetail.push(`   Description: ${role.detail.description}`);
          }

          // Add actors (users/groups assigned to this role)
          if (role.detail.actors && role.detail.actors.length > 0) {
            const actors = role.detail.actors.map((actor: any) => {
              if (actor.type === 'atlassian-user-role-actor') {
                return `User: ${actor.displayName || actor.name}`;
              } else if (actor.type === 'atlassian-group-role-actor') {
                return `Group: ${actor.displayName || actor.name}`;
              }
              return `${actor.type}: ${actor.displayName || actor.name}`;
            });
            
            if (actors.length <= 3) {
              roleDetail.push(`   Assigned to: ${actors.join(', ')}`);
            } else {
              roleDetail.push(`   Assigned to: ${actors.slice(0, 3).join(', ')} and ${actors.length - 3} more`);
            }
          } else {
            roleDetail.push(`   Assigned to: No assignments`);
          }
        }

        roleInfo.push(...roleDetail, '');
      });

      // Add usage information
      roleInfo.push('**💡 Usage Tips**:');
      roleInfo.push('• Project roles define permissions and responsibilities');
      roleInfo.push('• Roles can be assigned to users or groups');
      roleInfo.push('• Common roles include "Administrators", "Developers", "Users"');
      roleInfo.push('• Use role names when assigning permissions or notifications');
      
      // Add role summary
      const roleTypes = sortedRoles.reduce((acc: any, role) => {
        if (role.detail?.actors) {
          const hasUsers = role.detail.actors.some((actor: any) => actor.type === 'atlassian-user-role-actor');
          const hasGroups = role.detail.actors.some((actor: any) => actor.type === 'atlassian-group-role-actor');
          
          if (hasUsers && hasGroups) acc.mixed = (acc.mixed || 0) + 1;
          else if (hasUsers) acc.users = (acc.users || 0) + 1;
          else if (hasGroups) acc.groups = (acc.groups || 0) + 1;
          else acc.empty = (acc.empty || 0) + 1;
        }
        return acc;
      }, {});
      
      if (Object.keys(roleTypes).length > 0) {
        const typeSummary = Object.entries(roleTypes)
          .map(([type, count]) => `${type} (${count})`)
          .join(', ');
        roleInfo.push(`• Assignment types: ${typeSummary}`);
      }

      return this.formatSuccess(
        `Project Roles Retrieved (${sortedRoles.length})`,
        roleInfo.join('\n')
      );

    } catch (error: any) {
      if (error.response?.status === 404) {
        return this.formatError(`Project "${params.projectKey}" not found or not accessible`, 'Project roles retrieval');
      }
      if (error.response?.status === 403) {
        return this.formatError('Permission denied - check project access', 'Project roles retrieval');
      }
      return this.formatError(error, 'Project roles retrieval');
    }
  }

  rateLimit() {
    return {
      requestsPerMinute: 60, // Project role operations may need multiple API calls
      burstLimit: 20
    };
  }
}