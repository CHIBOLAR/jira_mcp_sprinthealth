import { BaseJiraTool, ToolResult, ValidationResult, ToolValidator } from '../base-tool.js';

/**
 * Bulk Update Issues Tool - TIER 1 Priority
 * 
 * Manual Work Eliminated: Update 50+ issues in one command vs manual one-by-one
 * Time Saved: 30 min per 10 issues → 2-3 min for 50+ issues (90% reduction)
 * Impact Score: ⭐⭐⭐⭐⭐
 */

interface BulkUpdateParams {
  jql: string;                        // JQL to select issues to update
  updates: {
    assignee?: string;                // Account ID or "unassigned"
    priority?: string;                // Priority name (High, Medium, Low)
    labels?: string[];                // Array of labels to set
    summary?: string;                 // New summary (use with caution on bulk)
    description?: string;             // New description (use with caution on bulk)
    fixVersion?: string;              // Fix version name
    component?: string;               // Component name
  };
  dryRun?: boolean;                   // Preview changes without applying (default: true)
  batchSize?: number;                 // Process in batches (default: 25, max: 50)
  continueOnError?: boolean;          // Continue processing if individual updates fail
  notifyUsers?: boolean;              // Send notifications to watchers (default: false for bulk)
  addComment?: string;                // Optional comment to add to all updated issues
}

export class JiraBulkUpdateIssuesTool extends BaseJiraTool {
  execute(params: BulkUpdateParams): Promise<ToolResult> {
    return this.bulkUpdateIssues(params);
  }

  validate(params: BulkUpdateParams): ValidationResult {
    const errors: string[] = [];

    // Validate JQL
    if (!params.jql || params.jql.trim().length === 0) {
      errors.push('JQL query is required');
    }

    // Validate updates object
    if (!params.updates || Object.keys(params.updates).length === 0) {
      errors.push('At least one update field must be specified');
    }

    // Validate batch size
    if (params.batchSize && (params.batchSize < 1 || params.batchSize > 50)) {
      errors.push('Batch size must be between 1 and 50');
    }

    // Validate dangerous operations on large batches
    if ((params.updates?.summary || params.updates?.description) && !params.dryRun) {
      errors.push('Bulk summary/description updates require dryRun=true first to preview changes');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  private async bulkUpdateIssues(params: BulkUpdateParams): Promise<ToolResult> {
    try {
      // Validate parameters
      const validation = this.validate(params);
      if (!validation.valid) {
        return this.formatError(validation.errors.join(', '), 'Parameter validation');
      }

      // Set defaults
      const config = {
        dryRun: params.dryRun ?? true,  // Safe default: always preview first
        batchSize: Math.min(params.batchSize || 25, 50), // Max 50 for safety
        continueOnError: params.continueOnError ?? true,
        notifyUsers: params.notifyUsers ?? false, // Don't spam on bulk operations
      };

      const startTime = Date.now();

      // Step 1: Execute JQL search to get target issues
      const searchRequest = {
        jql: params.jql,
        startAt: 0,
        maxResults: 1000, // Reasonable limit for bulk operations
        fields: ['summary', 'status', 'assignee', 'priority', 'labels']
      };

      const searchResult = await this.jiraClient.makeRequest('/rest/api/3/search', {
        method: 'POST',
        data: searchRequest
      });

      if (!searchResult.issues || searchResult.issues.length === 0) {
        return this.formatSuccess(
          'Bulk Update Complete',
          `🔍 **JQL Query**: \`${params.jql}\`\n\n❌ **No issues found** matching the query.\n\n**Recommendations:**\n• Verify your JQL query\n• Check project permissions`
        );
      }

      // Step 2: Process issues in batches
      const result = {
        totalIssues: searchResult.issues.length,
        updatedIssues: 0,
        failedIssues: 0,
        skippedIssues: 0,
        successful: [] as Array<{ issueKey: string; fieldsUpdated: string[]; message: string }>,
        failed: [] as Array<{ issueKey: string; error: string; reason: string }>,
        skipped: [] as Array<{ issueKey: string; reason: string }>
      };

      // Process in batches to avoid overwhelming the API
      const batches = this.createBatches(searchResult.issues, config.batchSize);
      
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        
        if (config.dryRun) {
          // Preview mode: validate updates without applying
          await this.previewBatch(batch, params.updates, result);
        } else {
          // Execute mode: apply updates
          await this.executeBatch(batch, params.updates, params.addComment, config.notifyUsers, result, config.continueOnError);
        }

        // Add small delay between batches to be respectful to Jira API
        if (batchIndex < batches.length - 1) {
          await this.delay(100);
        }
      }

      // Calculate final metrics
      const executionTimeMs = Date.now() - startTime;
      const summary = this.generateSummary(result, config.dryRun, executionTimeMs);

      return this.formatSuccess(
        `Bulk Update ${config.dryRun ? 'Preview' : 'Complete'}`,
        summary
      );

    } catch (error: any) {
      return this.formatError(error, 'Bulk update operation');
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
    updates: BulkUpdateParams['updates'], 
    result: any
  ): Promise<void> {
    for (const issue of issues) {
      try {
        const fieldsToUpdate = this.determineFieldChanges(issue, updates);
        
        if (fieldsToUpdate.length === 0) {
          result.skippedIssues++;
          result.skipped.push({
            issueKey: issue.key,
            reason: 'No changes needed (current values match requested updates)'
          });
        } else {
          result.updatedIssues++;
          result.successful.push({
            issueKey: issue.key,
            fieldsUpdated: fieldsToUpdate,
            message: `PREVIEW: Would update ${fieldsToUpdate.join(', ')}`
          });
        }
      } catch (error) {
        result.failedIssues++;
        result.failed.push({
          issueKey: issue.key,
          error: error instanceof Error ? error.message : 'Unknown error',
          reason: 'Validation failed during preview'
        });
      }
    }
  }

  private async executeBatch(
    issues: any[], 
    updates: BulkUpdateParams['updates'],
    addComment: string | undefined,
    notifyUsers: boolean,
    result: any,
    continueOnError: boolean
  ): Promise<void> {
    for (const issue of issues) {
      try {
        const fieldsToUpdate = this.determineFieldChanges(issue, updates);
        
        if (fieldsToUpdate.length === 0) {
          result.skippedIssues++;
          result.skipped.push({
            issueKey: issue.key,
            reason: 'No changes needed'
          });
          continue;
        }

        // Prepare update payload
        const updatePayload = this.buildUpdatePayload(updates);
        
        // Execute the update
        await this.jiraClient.makeRequest(`/rest/api/3/issue/${issue.key}`, {
          method: 'PUT',
          data: updatePayload,
          params: { notifyUsers }
        });

        // Add comment if requested
        if (addComment) {
          await this.jiraClient.makeRequest(`/rest/api/3/issue/${issue.key}/comment`, {
            method: 'POST',
            data: { body: addComment }
          });
        }

        result.updatedIssues++;
        result.successful.push({
          issueKey: issue.key,
          fieldsUpdated: fieldsToUpdate,
          message: `Successfully updated ${fieldsToUpdate.join(', ')}`
        });

      } catch (error) {
        result.failedIssues++;
        result.failed.push({
          issueKey: issue.key,
          error: error instanceof Error ? error.message : 'Unknown error',
          reason: 'Update operation failed'
        });

        if (!continueOnError) {
          throw error; // Stop processing on first error
        }
      }
    }
  }

  private determineFieldChanges(issue: any, updates: BulkUpdateParams['updates']): string[] {
    const changes: string[] = [];

    // Check assignee changes
    if (updates.assignee !== undefined) {
      const currentAssignee = issue.fields.assignee?.accountId || 'unassigned';
      const newAssignee = updates.assignee === 'unassigned' ? 'unassigned' : updates.assignee;
      if (currentAssignee !== newAssignee) {
        changes.push('assignee');
      }
    }

    // Check priority changes
    if (updates.priority !== undefined) {
      const currentPriority = issue.fields.priority?.name || '';
      if (currentPriority !== updates.priority) {
        changes.push('priority');
      }
    }

    // Check label changes
    if (updates.labels !== undefined) {
      const currentLabels = issue.fields.labels || [];
      const newLabels = updates.labels || [];
      if (!this.arraysEqual(currentLabels, newLabels)) {
        changes.push('labels');
      }
    }

    // Always include summary/description if specified (they're typically different)
    if (updates.summary !== undefined) changes.push('summary');
    if (updates.description !== undefined) changes.push('description');
    if (updates.fixVersion !== undefined) changes.push('fixVersion');
    if (updates.component !== undefined) changes.push('component');

    return changes;
  }

  private buildUpdatePayload(updates: BulkUpdateParams['updates']): any {
    const payload: any = { fields: {} };

    if (updates.assignee !== undefined) {
      payload.fields.assignee = updates.assignee === 'unassigned' 
        ? null 
        : { accountId: updates.assignee };
    }

    if (updates.priority !== undefined) {
      payload.fields.priority = { name: updates.priority };
    }

    if (updates.labels !== undefined) {
      payload.fields.labels = updates.labels;
    }

    if (updates.summary !== undefined) {
      payload.fields.summary = updates.summary;
    }

    if (updates.description !== undefined) {
      payload.fields.description = updates.description;
    }

    if (updates.fixVersion !== undefined) {
      payload.fields.fixVersions = [{ name: updates.fixVersion }];
    }

    if (updates.component !== undefined) {
      payload.fields.components = [{ name: updates.component }];
    }

    return payload;
  }

  private generateSummary(result: any, isDryRun: boolean, executionTimeMs: number): string {
    const estimatedTimePerIssue = 2; // minutes for manual update
    const actualTimeSpent = executionTimeMs / 1000 / 60; // minutes
    const timeSavedMinutes = Math.max(0, (result.totalIssues * estimatedTimePerIssue) - actualTimeSpent);

    const summary = [
      `📊 **Results Summary**:`,
      `• Total Issues: ${result.totalIssues}`,
      `• ${isDryRun ? 'Would Update' : 'Updated'}: ${result.updatedIssues}`,
      `• Failed: ${result.failedIssues}`,
      `• Skipped: ${result.skippedIssues}`,
      '',
      `⏱️ **Time Impact**:`,
      `• Execution Time: ${Math.round(actualTimeSpent * 100) / 100} minutes`,
      `• Time Saved: ${Math.round(timeSavedMinutes)} minutes vs manual updates`,
      ''
    ];

    if (isDryRun) {
      summary.push(
        `🔍 **Preview Mode**: Run with \`dryRun: false\` to apply changes`,
        ''
      );
    }

    // Show sample results
    if (result.successful.length > 0) {
      summary.push(`✅ **${isDryRun ? 'Preview' : 'Successful'} Updates** (showing first 5):`);
      result.successful.slice(0, 5).forEach((item: any) => {
        summary.push(`• ${item.issueKey}: ${item.message}`);
      });
      if (result.successful.length > 5) {
        summary.push(`• ... and ${result.successful.length - 5} more`);
      }
      summary.push('');
    }

    if (result.failed.length > 0) {
      summary.push(`❌ **Failed Updates** (showing first 3):`);
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
    
    if (isDryRun && result.failedIssues === 0 && result.updatedIssues > 0) {
      recommendations.push("Ready to execute - run with dryRun=false to apply changes");
    }
    if (result.failedIssues > 0) {
      recommendations.push("Review failed items before proceeding");
    }
    if (result.skippedIssues > 0) {
      recommendations.push("Skipped issues already had the target values");
    }
    if (result.totalIssues > 100) {
      recommendations.push("Consider breaking large operations into smaller batches");
    }

    if (recommendations.length > 0) {
      summary.push(`💡 **Recommendations**:`);
      recommendations.forEach(rec => summary.push(`• ${rec}`));
    }

    return summary.join('\n');
  }

  private arraysEqual(a: any[], b: any[]): boolean {
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return sortedA.every((val, index) => val === sortedB[index]);
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
