import { BaseJiraTool, ToolResult, ValidationResult } from '../base-tool.js';

/**
 * Parameters for getting projects
 */
interface GetProjectsParams {
  expand?: string[];
  recent?: number; // Number of recent projects to highlight
}

/**
 * Tool for retrieving accessible Jira projects with comprehensive information
 */
export class JiraGetProjectsTool extends BaseJiraTool {
  execute(params: GetProjectsParams): Promise<ToolResult> {
    return this.getProjects(params);
  }

  validate(params: GetProjectsParams): ValidationResult {
    if (params.expand && !Array.isArray(params.expand)) {
      return {
        valid: false,
        errors: ['expand must be an array if provided']
      };
    }
    
    if (params.recent !== undefined && (typeof params.recent !== 'number' || params.recent < 0)) {
      return {
        valid: false,
        errors: ['recent must be a non-negative number if provided']
      };
    }
    
    return { valid: true, errors: [] };
  }

  private async getProjects(params: GetProjectsParams): Promise<ToolResult> {
    try {
      // Validate parameters
      const validation = this.validate(params);
      if (!validation.valid) {
        return this.formatError(validation.errors.join(', '), 'Parameter validation');
      }

      // Build expand parameters
      const defaultExpand = ['description', 'lead', 'url', 'projectKeys'];
      const expand = params.expand && params.expand.length > 0 
        ? params.expand 
        : defaultExpand;

      // Get projects with expanded information
      const projects = await this.jiraClient.makeRequest(
        `/rest/api/3/project?expand=${expand.join(',')}`
      );

      if (!projects || projects.length === 0) {
        return this.formatSuccess(
          'No Projects Found',
          `❌ No accessible projects found.\n\n` +
          `This could mean:\n` +
          `• You don't have browse permissions for any projects\n` +
          `• No projects exist in this Jira instance\n` +
          `• Your account has restricted access`
        );
      }

      // Sort projects by name for consistent ordering
      projects.sort((a: any, b: any) => a.name.localeCompare(b.name));

      // Format projects information
      const projectInfo = [
        `📋 **Accessible Jira Projects** (${projects.length} found)`,
        ``
      ];

      // Group projects by type if available
      const groupedProjects = this.groupProjectsByType(projects);
      
      Object.keys(groupedProjects).forEach(projectType => {
        if (projectType !== 'undefined') {
          projectInfo.push(`**${projectType} Projects:**`);
        }
        
        groupedProjects[projectType].forEach((project: any) => {
          const projectDetail = [
            `• **${project.key}** - ${project.name}`
          ];
          
          // Add project type if not grouped
          if (projectType === 'undefined' && project.projectTypeKey) {
            projectDetail.push(`(${project.projectTypeKey})`);
          }
          
          if (project.description) {
            projectDetail.push(`\n  Description: ${this.truncateText(project.description, 150)}`);
          }
          
          if (project.lead?.displayName) {
            projectDetail.push(`\n  Lead: ${project.lead.displayName}`);
          }
          
          if (project.url) {
            projectDetail.push(`\n  URL: ${project.url}`);
          }
          
          projectInfo.push(projectDetail.join(''), '');
        });
      });

      // Add project statistics
      const stats = this.generateProjectStatistics(projects);
      if (stats.length > 0) {
        projectInfo.push('**📊 Project Statistics**:', ...stats, '');
      }

      // Add recent projects if requested
      if (params.recent && params.recent > 0) {
        const recentProjects = this.getRecentProjects(projects, params.recent);
        if (recentProjects.length > 0) {
          projectInfo.push('**🕒 Recent Projects**:');
          recentProjects.forEach(project => {
            projectInfo.push(`• ${project.key} - ${project.name}`);
          });
          projectInfo.push('');
        }
      }

      // Add usage examples
      projectInfo.push('**💡 Usage Examples**:');
      const exampleProject = projects[0];
      projectInfo.push(`• Get issues: \`jira_search "project = ${exampleProject.key}"\``);
      projectInfo.push(`• Create issue: \`jira_create_issue\` with projectKey="${exampleProject.key}"`);
      projectInfo.push(`• Get issue types: \`jira_get_issue_types ${exampleProject.key}\``);
      projectInfo.push(`• Get statuses: \`jira_get_statuses ${exampleProject.key}\``);

      return this.formatSuccess(
        `Projects Retrieved (${projects.length})`,
        projectInfo.join('\n')
      );

    } catch (error: any) {
      if (error.response?.status === 403) {
        return this.formatError('Permission denied - check project browse permissions', 'Projects retrieval');
      }
      return this.formatError(error, 'Projects retrieval');
    }
  }

  /**
   * Group projects by their project type
   */
  private groupProjectsByType(projects: any[]): { [key: string]: any[] } {
    const groups: { [key: string]: any[] } = {};
    
    projects.forEach(project => {
      const projectType = project.projectTypeKey || 'undefined';
      if (!groups[projectType]) {
        groups[projectType] = [];
      }
      groups[projectType].push(project);
    });
    
    // Sort groups with common types first
    const sortedGroups: { [key: string]: any[] } = {};
    const typeOrder = ['software', 'business', 'service_desk', 'undefined'];
    
    typeOrder.forEach(type => {
      if (groups[type]) {
        sortedGroups[type] = groups[type];
      }
    });
    
    // Add any remaining types
    Object.keys(groups).forEach(type => {
      if (!sortedGroups[type]) {
        sortedGroups[type] = groups[type];
      }
    });
    
    return sortedGroups;
  }

  /**
   * Generate project statistics
   */
  private generateProjectStatistics(projects: any[]): string[] {
    const stats = [];
    
    // Count by project type
    const typeCount: { [key: string]: number } = {};
    projects.forEach(project => {
      const type = project.projectTypeKey || 'Unknown';
      typeCount[type] = (typeCount[type] || 0) + 1;
    });
    
    const typeSummary = Object.entries(typeCount)
      .map(([type, count]) => `${type}: ${count}`)
      .join(', ');
    
    if (typeSummary) {
      stats.push(`• **Project Types**: ${typeSummary}`);
    }
    
    // Count projects with leads
    const projectsWithLeads = projects.filter(p => p.lead?.displayName).length;
    stats.push(`• **Projects with Leads**: ${projectsWithLeads}/${projects.length}`);
    
    // Count projects with descriptions
    const projectsWithDescriptions = projects.filter(p => p.description).length;
    stats.push(`• **Projects with Descriptions**: ${projectsWithDescriptions}/${projects.length}`);
    
    return stats;
  }

  /**
   * Get recent projects (simplified logic based on name/key sorting)
   */
  private getRecentProjects(projects: any[], count: number): any[] {
    // Note: Real implementation would use actual access history
    // For now, return first N projects as "recent"
    return projects.slice(0, Math.min(count, projects.length));
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
      requestsPerMinute: 100, // Project metadata is lightweight
      burstLimit: 20
    };
  }
}
