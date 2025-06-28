import { BaseJiraTool, ToolResult, ValidationResult, ToolValidator } from '../base-tool.js';

/**
 * Parameters for getting project versions
 */
interface GetVersionsParams {
  projectKey: string;
  expand?: string[];
}

/**
 * Tool for retrieving project versions
 */
export class JiraGetVersionsTool extends BaseJiraTool {
  execute(params: GetVersionsParams): Promise<ToolResult> {
    return this.getVersions(params);
  }

  validate(params: GetVersionsParams): ValidationResult {
    const projectKeyValidation = ToolValidator.combine(
      ToolValidator.required(params.projectKey, 'projectKey'),
      ToolValidator.string(params.projectKey, 'projectKey')
    );

    if (params.expand && !Array.isArray(params.expand)) {
      return {
        valid: false,
        errors: ['expand must be an array of strings']
      };
    }

    return projectKeyValidation;
  }

  private async getVersions(params: GetVersionsParams): Promise<ToolResult> {
    try {
      // Build query parameters
      const queryParams = new URLSearchParams();
      if (params.expand && params.expand.length > 0) {
        queryParams.append('expand', params.expand.join(','));
      }

      const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
      
      // Get project versions
      const versions = await this.jiraClient.makeRequest(
        `/rest/api/3/project/${params.projectKey}/version${queryString}`
      );

      if (!versions || versions.length === 0) {
        return this.formatSuccess(
          'No Versions Found',
          `❌ No versions found in project "${params.projectKey}".`
        );
      }

      // Sort versions by release date (most recent first)
      const sortedVersions = versions.sort((a: any, b: any) => {
        if (a.releaseDate && b.releaseDate) {
          return new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime();
        }
        if (a.releaseDate) return -1;
        if (b.releaseDate) return 1;
        return a.name.localeCompare(b.name);
      });

      // Separate versions by status
      const releasedVersions = sortedVersions.filter((v: any) => v.released);
      const unreleasedVersions = sortedVersions.filter((v: any) => !v.released);
      const archivedVersions = sortedVersions.filter((v: any) => v.archived);

      // Format versions information
      const versionInfo = [
        `📦 **Project Versions for ${params.projectKey}** (${versions.length} total)`,
        ``
      ];

      // Add unreleased versions first (most important)
      if (unreleasedVersions.length > 0) {
        versionInfo.push(`🚧 **Unreleased Versions (${unreleasedVersions.length})**`, '');
        unreleasedVersions.forEach((version: any, index: number) => {
          versionInfo.push(...this.formatVersionInfo(version, index + 1), '');
        });
      }

      // Add released versions
      if (releasedVersions.length > 0) {
        versionInfo.push(`✅ **Released Versions (${releasedVersions.length})**`, '');
        releasedVersions.slice(0, 10).forEach((version: any, index: number) => {
          versionInfo.push(...this.formatVersionInfo(version, index + 1), '');
        });
        
        if (releasedVersions.length > 10) {
          versionInfo.push(`   ... and ${releasedVersions.length - 10} more released versions`, '');
        }
      }

      // Add archived versions summary
      if (archivedVersions.length > 0) {
        versionInfo.push(`📁 **Archived Versions**: ${archivedVersions.length} versions`, '');
      }

      // Add usage information
      versionInfo.push('**💡 Usage Tips**:');
      versionInfo.push('• Use version name or ID when creating/updating issues');
      versionInfo.push('• "Fix Version" indicates when issue will be resolved');
      versionInfo.push('• "Affects Version" indicates which version has the issue');
      versionInfo.push(`• Example: \`jira_create_issue\` with fixVersions=["${unreleasedVersions[0]?.name || releasedVersions[0]?.name}"]`);

      return this.formatSuccess(
        `Versions Retrieved (${versions.length})`,
        versionInfo.join('\n')
      );

    } catch (error: any) {
      if (error.response?.status === 404) {
        return this.formatError(`Project "${params.projectKey}" not found or not accessible`, 'Versions retrieval');
      }
      if (error.response?.status === 403) {
        return this.formatError('Permission denied - check project access', 'Versions retrieval');
      }
      return this.formatError(error, 'Versions retrieval');
    }
  }

  private formatVersionInfo(version: any, index: number): string[] {
    const info = [`**${index}. ${version.name}** (ID: ${version.id})`];
    
    if (version.description) {
      info.push(`   Description: ${version.description}`);
    }
    
    if (version.releaseDate) {
      const releaseDate = new Date(version.releaseDate).toLocaleDateString();
      info.push(`   Release Date: ${releaseDate}`);
    }
    
    if (version.startDate) {
      const startDate = new Date(version.startDate).toLocaleDateString();
      info.push(`   Start Date: ${startDate}`);
    }
    
    // Status indicators
    const status = [];
    if (version.released) status.push('Released');
    if (version.archived) status.push('Archived');
    if (version.overdue) status.push('Overdue');
    if (status.length > 0) {
      info.push(`   Status: ${status.join(', ')}`);
    }

    return info;
  }

  rateLimit() {
    return {
      requestsPerMinute: 80, // Version operations are lightweight
      burstLimit: 25
    };
  }
}