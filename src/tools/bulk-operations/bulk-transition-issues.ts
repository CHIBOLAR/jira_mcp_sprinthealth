import { BaseJiraTool, ToolResult, ValidationResult, ToolValidator } from '../base-tool.js';

/**
 * Bulk Transition Issues Tool - TIER 1 Priority
 * 
 * Manual Work Eliminated: Move multiple issues through workflow in bulk
 * Time Saved: 2-3 hours of status updates → 5 minutes
 * Impact Score: ⭐⭐⭐⭐
 */

interface BulkTransitionParams {
  jql: string;                        // JQL to select issues to transition
  transitionName: string;             // Target transition name (e.g., "In Progress", "Done")
  comment?: string;                   // Optional comment to add during transition
  assigneeId?: string;               // Optional assignee to set during transition
  resolution?: string;               // Resolution for closing transitions
  dryRun?: boolean;                  // Preview transitions without applying (default: true)
  batchSize?: number;                // Process in batches (default: 20, max: 30)
  continueOnError?: boolean;         // Continue if individual transitions fail
  notifyUsers?: boolean;             // Send notifications to watchers (default: false)
  validateTransitions?: boolean;     // Check if transition is valid for each issue (default: true)
}

export class JiraBulkTransitionIssuesTool extends BaseJiraTool {
  execute(params: BulkTransitionParams): Promise<ToolResult> {
    return this.bulkTransitionIssues(params);
  }

  validate(params: BulkTransitionParams): ValidationResult {
    const errors: string[] = [];

    if (!params.jql || params.jql.trim().length === 0) {
      errors.push('JQL query is required');
    }

    if (!params.transitionName || params.transitionName.trim().length === 0) {
      errors.push('Transition name is required');
    }

    // Validate batch size
    if (params.batchSize && (params.batchSize < 1 || params.batchSize > 30)) {
      errors.push('Batch size must be between 1 and 30 for transitions');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  private async bulkTransitionIssues(params: BulkTransitionParams): Promise<ToolResult> {
    try {
      // Validate parameters
      const validation = this.validate(params);
      if (!validation.valid) {
        return this.formatError(validation.errors.join(', '), 'Parameter validation');
      }

      // Set defaults
      const config = {
        dryRun: params.dryRun ?? true,  // Safe default: always preview first
        batchSize: Math.min(params.batchSize || 20, 30), // Smaller batches for transitions
        continueOnError: params.continueOnError ?? true,
        notifyUsers: params.notifyUsers ?? false,
        validateTransitions: params.validateTransitions ?? true,
      };

      const startTime = Date.now();

      // Step 1: Execute JQL search to get target issues
      const searchRequest = {
        jql: params.jql,
        startAt: 0,
        maxResults: 1000,
        fields: ['summary', 'status', 'assignee']
      };

      const searchResult = await this.jiraClient.makeRequest('/rest/api/3/search', {
        method: 'POST',
        data: searchRequest
      });

      if (!searchResult.issues || searchResult.issues.length === 0) {
        return this.formatSuccess(
          'Bulk Transition Complete',
          `🔍 **JQL Query**: \`${params.jql}\`\n\n❌ **No issues found** matching the query.\n\n**Recommendations:**\n• Verify your JQL query\n• Check project permissions`
        );
      }

      // Step 2: Process issues in batches
      const result = {
        totalIssues: searchResult.issues.length,
        transitionedIssues: 0,
        failedIssues: 0,
        skippedIssues: 0,
        targetTransition: params.transitionName,
        successful: [] as Array<{ issueKey: string; fromStatus: string; toStatus: string; message: string }>,
        failed: [] as Array<{ issueKey: string; currentStatus: string; error: string; reason: string }>,
        skipped: [] as Array<{ issueKey: string; currentStatus: string; reason: string }>
      };

      // Process in batches
      const batches = this.createBatches(searchResult.issues, config.batchSize);
      
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        
        if (config.dryRun) {
          // Preview mode: validate transitions without applying
          await this.previewBatch(batch, params.transitionName, result, config.validateTransitions);
        } else {
          // Execute mode: apply transitions
          await this.executeBatch(
            batch, 
            params.transitionName, 
            params.comment,
            params.assigneeId,
            params.resolution,
            config.notifyUsers,
            result, 
            config.continueOnError,
            config.validateTransitions
          );
        }

        // Add delay between batches
        if (batchIndex < batches.length - 1) {
          await this.delay(150); // Slightly longer delay for transitions
        }
      }

      // Calculate final metrics
      const executionTimeMs = Date.now() - startTime;
      const summary = this.generateSummary(result, config.dryRun, executionTimeMs);

      return this.formatSuccess(
        `Bulk Transition ${config.dryRun ? 'Preview' : 'Complete'}`,
        summary
      );

    } catch (error: any) {
      return this.formatError(error, 'Bulk transition operation');
    }
  }

  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  private async previewBatch(
    issues: any[], 
    transitionName: string, 
    result: any,
    validateTransitions: boolean
  ): Promise<void> {
    for (const issue of issues) {
      try {
        const currentStatus = issue.fields.status.name;
        
        if (validateTransitions) {
          // Get available transitions for this issue
          const transitions = await this.jiraClient.makeRequest(`/rest/api/3/issue/${issue.key}/transitions`);
          const targetTransition = transitions.transitions?.find((t: any) => 
            t.name.toLowerCase() === transitionName.toLowerCase()
          );

          if (!targetTransition) {
            result.skippedIssues++;
            result.skipped.push({
              issueKey: issue.key,
              currentStatus,
              reason: `Transition "${transitionName}" not available from "${currentStatus}"`
            });
            continue;
          }

          // Preview successful transition
          result.transitionedIssues++;
          result.successful.push({
            issueKey: issue.key,
            fromStatus: currentStatus,
            toStatus: targetTransition.to?.name || 'Unknown',
            message: `PREVIEW: Would transition from "${currentStatus}" to "${targetTransition.to?.name}"`
          });
        } else {
          // Skip validation, assume transition is possible
          result.transitionedIssues++;
          result.successful.push({
            issueKey: issue.key,
            fromStatus: currentStatus,
            toStatus: transitionName,
            message: `PREVIEW: Would attempt transition to "${transitionName}"`
          });
        }
      } catch (error) {
        result.failedIssues++;
        result.failed.push({
          issueKey: issue.key,
          currentStatus: issue.fields.status?.name || 'Unknown',
          error: error instanceof Error ? error.message : 'Unknown error',
          reason: 'Validation failed during preview'
        });
      }
    }
  }

  private async executeBatch(
    issues: any[], 
    transitionName: string,
    comment: string | undefined,
    assigneeId: string | undefined,
    resolution: string | undefined,
    notifyUsers: boolean,
    result: any,
    continueOnError: boolean,
    validateTransitions: boolean
  ): Promise<void> {
    for (const issue of issues) {
      try {
        const currentStatus = issue.fields.status.name;
        
        // Get available transitions
        const transitionsResponse = await this.jiraClient.makeRequest(`/rest/api/3/issue/${issue.key}/transitions`);
        const targetTransition = transitionsResponse.transitions?.find((t: any) => 
          t.name.toLowerCase() === transitionName.toLowerCase()
        );

        if (validateTransitions && !targetTransition) {
          result.skippedIssues++;
          result.skipped.push({
            issueKey: issue.key,
            currentStatus,
            reason: `Transition "${transitionName}" not available`
          });
          continue;
        }

        // Prepare transition payload
        const transitionPayload: any = {
          transition: {
            id: targetTransition?.id || transitionName
          }
        };

        // Add optional fields
        if (comment || assigneeId || resolution) {
          transitionPayload.fields = {};
          
          if (assigneeId) {
            transitionPayload.fields.assignee = { accountId: assigneeId };
          }
          
          if (resolution) {
            transitionPayload.fields.resolution = { name: resolution };
          }
        }

        // Add comment if specified
        if (comment) {
          transitionPayload.update = {
            comment: [{
              add: {
                body: comment
              }
            }]
          };
        }

        // Execute the transition
        await this.jiraClient.makeRequest(`/rest/api/3/issue/${issue.key}/transitions`, {
          method: 'POST',
          data: transitionPayload
        });

        result.transitionedIssues++;
        result.successful.push({
          issueKey: issue.key,
          fromStatus: currentStatus,
          toStatus: targetTransition?.to?.name || transitionName,
          message: `Successfully transitioned from "${currentStatus}" to "${targetTransition?.to?.name || transitionName}"`
        });

      } catch (error) {
        result.failedIssues++;
        result.failed.push({
          issueKey: issue.key,
          currentStatus: issue.fields.status?.name || 'Unknown',
          error: error instanceof Error ? error.message : 'Unknown error',
          reason: 'Transition operation failed'
        });

        if (!continueOnError) {
          throw error;
        }
      }
    }
  }

  private generateSummary(result: any, isDryRun: boolean, executionTimeMs: number): string {
    const estimatedTimePerTransition = 1.5; // minutes for manual transition
    const actualTimeSpent = executionTimeMs / 1000 / 60; // minutes
    const timeSavedMinutes = Math.max(0, (result.totalIssues * estimatedTimePerTransition) - actualTimeSpent);

    const summary = [
      `📊 **Results Summary**:`,
      `• Total Issues: ${result.totalIssues}`,
      `• ${isDryRun ? 'Would Transition' : 'Transitioned'}: ${result.transitionedIssues}`,
      `• Failed: ${result.failedIssues}`,
      `• Skipped: ${result.skippedIssues}`,
      `• Target Status: "${result.targetTransition}"`,
      '',
      `⏱️ **Time Impact**:`,
      `• Execution Time: ${Math.round(actualTimeSpent * 100) / 100} minutes`,
      `• Time Saved: ${Math.round(timeSavedMinutes)} minutes vs manual transitions`,
      ''
    ];

    if (isDryRun) {
      summary.push(
        `🔍 **Preview Mode**: Run with \`dryRun: false\` to apply transitions`,
        ''
      );
    }

    // Show sample results
    if (result.successful.length > 0) {
      summary.push(`✅ **${isDryRun ? 'Preview' : 'Successful'} Transitions** (showing first 5):`);
      result.successful.slice(0, 5).forEach((item: any) => {
        summary.push(`• ${item.issueKey}: ${item.message}`);
      });
      if (result.successful.length > 5) {
        summary.push(`• ... and ${result.successful.length - 5} more`);
      }
      summary.push('');
    }

    if (result.failed.length > 0) {
      summary.push(`❌ **Failed Transitions** (showing first 3):`);
      result.failed.slice(0, 3).forEach((item: any) => {
        summary.push(`• ${item.issueKey}: ${item.error}`);
      });
      if (result.failed.length > 3) {
        summary.push(`• ... and ${result.failed.length - 3} more failures`);
      }
      summary.push('');
    }

    // Recommendations
    const recommendations: string[] = [];
    
    if (isDryRun && result.failedIssues === 0 && result.transitionedIssues > 0) {
      recommendations.push("Ready to execute - run with dryRun=false to apply transitions");
    }
    if (result.failedIssues > 0) {
      recommendations.push("Review failed transitions and retry if needed");
    }
    if (result.skippedIssues > 0) {
      recommendations.push("Skipped issues don't have the target transition available");
    }
    if (result.transitionedIssues > 50) {
      recommendations.push("Large workflow changes completed - consider notifying stakeholders");
    }

    if (recommendations.length > 0) {
      summary.push(`💡 **Recommendations**:`);
      recommendations.forEach(rec => summary.push(`• ${rec}`));
    }

    return summary.join('\n');
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
