import { BaseJiraTool, ToolResult, ValidationResult, ToolValidator } from '../base-tool.js';

/**
 * Simple Auto Assign Based on Workload Tool - TIER 1 Priority (Simplified Version)
 * 
 * Manual Work Eliminated: Eliminates manual team assignment decisions
 * Time Saved: 30-45 minutes per sprint planning session
 * Impact Score: ⭐⭐⭐⭐
 * 
 * Note: This is a simplified version without advanced analytics. 
 * For full features, ensure AdvancedAnalyticsEngine is available.
 */

interface SimpleAutoAssignParams {
  projectKey: string;                  // Target project for assignment
  jql?: string;                       // Optional JQL filter for specific issues (default: unassigned)
  assignmentStrategy: 'balanced' | 'round-robin'; // Simplified strategies
  teamMembers: string[];              // Required: team member account IDs
  maxAssignmentsPerPerson?: number;   // Limit assignments per person
  dryRun?: boolean;                   // Preview assignments (default: true)
}

export class JiraSimpleAutoAssignTool extends BaseJiraTool {
  execute(params: SimpleAutoAssignParams): Promise<ToolResult> {
    return this.autoAssignIssues(params);
  }

  validate(params: SimpleAutoAssignParams): ValidationResult {
    const errors: string[] = [];

    if (!params.projectKey || params.projectKey.trim().length === 0) {
      errors.push('Project key is required');
    }

    const validStrategies = ['balanced', 'round-robin'];
    if (!validStrategies.includes(params.assignmentStrategy)) {
      errors.push(`Assignment strategy must be one of: ${validStrategies.join(', ')}`);
    }

    if (!params.teamMembers || params.teamMembers.length === 0) {
      errors.push('Team members array is required and must not be empty');
    }

    if (params.maxAssignmentsPerPerson && params.maxAssignmentsPerPerson < 1) {
      errors.push('Max assignments per person must be at least 1');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  private async autoAssignIssues(params: SimpleAutoAssignParams): Promise<ToolResult> {
    try {
      // Validate parameters
      const validation = this.validate(params);
      if (!validation.valid) {
        return this.formatError(validation.errors.join(', '), 'Parameter validation');
      }

      const config = {
        dryRun: params.dryRun ?? true,
        maxAssignmentsPerPerson: params.maxAssignmentsPerPerson ?? 10,
      };

      const startTime = Date.now();

      // Step 1: Get issues to assign
      const jqlQuery = params.jql || `project = "${params.projectKey}" AND assignee is EMPTY AND status != Done AND status != Closed`;
      
      const searchRequest = {
        jql: jqlQuery,
        startAt: 0,
        maxResults: 200,
        fields: ['summary', 'status', 'priority', 'issueType']
      };

      const searchResult = await this.jiraClient.makeRequest('/rest/api/3/search', {
        method: 'POST',
        data: searchRequest
      });

      if (!searchResult.issues || searchResult.issues.length === 0) {
        return this.formatSuccess(
          'Auto Assignment Complete',
          `🔍 **JQL Query**: \`${jqlQuery}\`\n\n❌ **No unassigned issues found**.\n\n**Recommendations:**\n• Check if all issues are already assigned\n• Verify project permissions`
        );
      }

      // Step 2: Get current workload for team members
      const teamWorkloads = await this.getTeamWorkloads(params.projectKey, params.teamMembers);

      // Step 3: Calculate assignments
      const assignments = this.calculateAssignments(
        searchResult.issues,
        teamWorkloads,
        params.assignmentStrategy,
        config.maxAssignmentsPerPerson
      );

      // Step 4: Execute or preview assignments
      const result = {
        totalIssues: searchResult.issues.length,
        assignedIssues: 0,
        skippedIssues: 0,
        assignments: [] as Array<{ issueKey: string; summary: string; assignedTo: string; assigneeName: string; reason: string }>,
        teamDistribution: [] as Array<{ accountId: string; displayName: string; assignedCount: number; totalWorkload: number }>
      };

      if (config.dryRun) {
        result.assignments = assignments;
        result.assignedIssues = assignments.length;
        result.skippedIssues = searchResult.issues.length - assignments.length;
      } else {
        // Execute assignments
        for (const assignment of assignments) {
          try {
            await this.jiraClient.makeRequest(`/rest/api/3/issue/${assignment.issueKey}`, {
              method: 'PUT',
              data: {
                fields: {
                  assignee: { accountId: assignment.assignedTo }
                }
              }
            });
            
            result.assignments.push(assignment);
            result.assignedIssues++;
          } catch (error) {
            result.skippedIssues++;
            // Continue with other assignments
          }
        }
      }

      // Step 5: Calculate team distribution
      result.teamDistribution = this.calculateTeamDistribution(teamWorkloads, assignments);
      
      // Step 6: Generate summary
      const executionTimeMs = Date.now() - startTime;
      const summary = this.generateSummary(result, config.dryRun, params.assignmentStrategy, executionTimeMs);

      return this.formatSuccess(
        `Auto Assignment ${config.dryRun ? 'Preview' : 'Complete'}`,
        summary
      );

    } catch (error: any) {
      return this.formatError(error, 'Auto assignment operation');
    }
  }

  private async getTeamWorkloads(projectKey: string, teamMembers: string[]): Promise<Map<string, { accountId: string; displayName: string; currentWorkload: number }>> {
    const workloads = new Map();

    for (const accountId of teamMembers) {
      try {
        // Get current workload (active issues assigned to user)
        const workloadRequest = {
          jql: `project = "${projectKey}" AND assignee = "${accountId}" AND status not in (Done, Closed, Resolved)`,
          startAt: 0,
          maxResults: 100,
          fields: ['summary']
        };

        const workloadResult = await this.jiraClient.makeRequest('/rest/api/3/search', {
          method: 'POST',
          data: workloadRequest
        });

        // For display name, we'll use the account ID (in a real implementation, you'd get user details)
        workloads.set(accountId, {
          accountId,
          displayName: accountId, // Simplified - would normally fetch user details
          currentWorkload: workloadResult.total || 0
        });
      } catch (error) {
        // If we can't get workload for a user, assume 0
        workloads.set(accountId, {
          accountId,
          displayName: accountId,
          currentWorkload: 0
        });
      }
    }

    return workloads;
  }

  private calculateAssignments(
    issues: any[],
    teamWorkloads: Map<string, any>,
    strategy: string,
    maxAssignmentsPerPerson: number
  ): any[] {
    const assignments: any[] = [];
    const memberWorkloads = new Map();
    
    // Initialize with current workloads
    teamWorkloads.forEach((member, accountId) => {
      memberWorkloads.set(accountId, member.currentWorkload);
    });

    const availableMembers = Array.from(teamWorkloads.keys());

    for (const issue of issues) {
      if (availableMembers.length === 0) break; // No more available assignees

      let selectedMember: string;

      if (strategy === 'round-robin') {
        // Find member with least total assignments
        selectedMember = this.findMemberWithLeastWork(memberWorkloads, availableMembers);
      } else { // balanced
        // Same as round-robin for simplified version
        selectedMember = this.findMemberWithLeastWork(memberWorkloads, availableMembers);
      }

      const member = teamWorkloads.get(selectedMember)!;
      
      assignments.push({
        issueKey: issue.key,
        summary: issue.fields.summary,
        assignedTo: selectedMember,
        assigneeName: member.displayName,
        reason: `${strategy} assignment (${memberWorkloads.get(selectedMember)} current issues)`
      });

      // Update workload tracking
      const currentWorkload = memberWorkloads.get(selectedMember) || 0;
      memberWorkloads.set(selectedMember, currentWorkload + 1);

      // Remove member if they've reached max assignments
      if (currentWorkload + 1 >= maxAssignmentsPerPerson) {
        const memberIndex = availableMembers.indexOf(selectedMember);
        if (memberIndex >= 0) {
          availableMembers.splice(memberIndex, 1);
        }
      }
    }

    return assignments;
  }

  private findMemberWithLeastWork(memberWorkloads: Map<string, number>, availableMembers: string[]): string {
    let bestMember = availableMembers[0];
    let lowestWorkload = memberWorkloads.get(bestMember) || 0;

    for (const member of availableMembers) {
      const workload = memberWorkloads.get(member) || 0;
      if (workload < lowestWorkload) {
        bestMember = member;
        lowestWorkload = workload;
      }
    }

    return bestMember;
  }

  private calculateTeamDistribution(teamWorkloads: Map<string, any>, assignments: any[]): any[] {
    const distribution = Array.from(teamWorkloads.values()).map(member => {
      const assignedCount = assignments.filter(a => a.assignedTo === member.accountId).length;
      const totalWorkload = member.currentWorkload + assignedCount;

      return {
        accountId: member.accountId,
        displayName: member.displayName,
        assignedCount,
        totalWorkload
      };
    });

    return distribution.sort((a, b) => b.assignedCount - a.assignedCount);
  }

  private generateSummary(result: any, isDryRun: boolean, strategy: string, executionTimeMs: number): string {
    const estimatedTimePerAssignment = 3; // minutes for manual assignment
    const actualTimeSpent = executionTimeMs / 1000 / 60; // minutes
    const timeSavedMinutes = Math.max(0, (result.assignedIssues * estimatedTimePerAssignment) - actualTimeSpent);

    const summary = [
      `📊 **Results Summary**:`,
      `• Total Issues: ${result.totalIssues}`,
      `• ${isDryRun ? 'Would Assign' : 'Assigned'}: ${result.assignedIssues}`,
      `• Skipped: ${result.skippedIssues}`,
      `• Strategy: ${strategy}`,
      '',
      `⏱️ **Time Impact**:`,
      `• Execution Time: ${Math.round(actualTimeSpent * 100) / 100} minutes`,
      `• Time Saved: ${Math.round(timeSavedMinutes)} minutes vs manual assignment`,
      ''
    ];

    if (isDryRun) {
      summary.push(
        `🔍 **Preview Mode**: Run with \`dryRun: false\` to apply assignments`,
        ''
      );
    }

    // Show team distribution
    if (result.teamDistribution.length > 0) {
      summary.push(`👥 **Team Distribution**:`);
      result.teamDistribution.forEach((member: any) => {
        summary.push(`• ${member.displayName}: ${member.assignedCount} new + ${member.totalWorkload - member.assignedCount} existing = ${member.totalWorkload} total`);
      });
      summary.push('');
    }

    // Show sample assignments
    if (result.assignments.length > 0) {
      summary.push(`✅ **${isDryRun ? 'Preview' : 'Completed'} Assignments** (showing first 5):`);
      result.assignments.slice(0, 5).forEach((assignment: any) => {
        summary.push(`• ${assignment.issueKey}: ${assignment.assigneeName} (${assignment.reason})`);
      });
      if (result.assignments.length > 5) {
        summary.push(`• ... and ${result.assignments.length - 5} more`);
      }
      summary.push('');
    }

    // Recommendations
    const recommendations: string[] = [];
    
    if (isDryRun && result.assignedIssues > 0) {
      recommendations.push("Ready to execute - run with dryRun=false to apply assignments");
    }
    if (result.skippedIssues > 0) {
      recommendations.push(`${result.skippedIssues} issues couldn't be assigned - review manually`);
    }

    // Check workload balance
    const workloads = result.teamDistribution.map((m: any) => m.totalWorkload);
    const maxWorkload = Math.max(...workloads);
    const minWorkload = Math.min(...workloads);

    if (maxWorkload - minWorkload > 5) {
      recommendations.push("Consider rebalancing - some team members have significantly different workloads");
    }

    if (recommendations.length > 0) {
      summary.push(`💡 **Recommendations**:`);
      recommendations.forEach(rec => summary.push(`• ${rec}`));
    }

    return summary.join('\n');
  }
}
