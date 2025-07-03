/**
 * Enhanced Error Handling System - Week 3 Implementation
 * Provides context-aware error responses with troubleshooting guides
 */

export class JiraError extends Error {
  constructor(
    message: string,
    public code: string,
    public troubleshooting: string[] = [],
    public httpStatus?: number
  ) {
    super(message);
    this.name = 'JiraError';
  }
}

export class ErrorHandler {
  /**
   * Handle authentication errors with specific guidance
   */
  static handleAuthError(error: any): JiraError {
    if (error.response?.status === 401) {
      return new JiraError(
        'Authentication failed with Jira',
        'AUTH_FAILED',
        [
          '1. Verify your Jira email is correct in .env file',
          '2. Generate a new API token at: https://id.atlassian.com/manage-profile/security/api-tokens',
          '3. Ensure your API token has not expired',
          '4. Check that your Jira URL includes https:// and ends with .atlassian.net',
          '5. Verify you have access to the Jira instance'
        ],
        401
      );
    }
    
    if (error.response?.status === 403) {
      return new JiraError(
        'Insufficient permissions for Jira operation',
        'PERMISSION_DENIED',
        [
          '1. Ensure your account has project access',
          '2. Check if your account has "Browse Projects" permission',
          '3. Verify you can access the project in Jira web interface',
          '4. Ask your Jira admin to grant necessary permissions'
        ],
        403
      );
    }

    return new JiraError(
      'Authentication error occurred',
      'AUTH_UNKNOWN',
      [
        '1. Check your internet connection',
        '2. Verify Jira instance is accessible',
        '3. Review all authentication credentials'
      ]
    );
  }

  /**
   * Handle project access errors
   */
  static handleProjectError(projectKey: string, error: any): JiraError {
    if (error.response?.status === 404) {
      return new JiraError(
        `Project '${projectKey}' not found or not accessible`,
        'PROJECT_NOT_FOUND',
        [
          `1. Verify project key '${projectKey}' is correct (case-sensitive)`,
          '2. Check if the project exists in your Jira instance',
          '3. Ensure you have permission to view this project',
          '4. Use the "list_projects" tool to see available projects'
        ],
        404
      );
    }

    return new JiraError(
      `Error accessing project '${projectKey}'`,
      'PROJECT_ACCESS_ERROR',
      [
        '1. Verify project permissions in Jira',
        '2. Check if project is archived or deleted',
        '3. Contact your Jira administrator for access'
      ]
    );
  }

  /**
   * Handle sprint-related errors
   */
  static handleSprintError(projectKey: string, error: any): JiraError {
    if (error.message?.includes('No active sprint')) {
      return new JiraError(
        `No active sprint found for project '${projectKey}'`,
        'NO_ACTIVE_SPRINT',
        [
          '1. Start a new sprint in your Scrum board',
          '2. Use a specific sprint ID if you want historical data',
          '3. Check if your project uses Scrum methodology (not Kanban)',
          '4. Verify the board has sprints configured'
        ]
      );
    }

    if (error.message?.includes('No Scrum boards')) {
      return new JiraError(
        `No Scrum boards found for project '${projectKey}'`,
        'NO_SCRUM_BOARDS',
        [
          '1. Create a Scrum board for your project',
          '2. Ensure the board is associated with your project',
          '3. Check if using Kanban boards (not supported for sprint analytics)',
          '4. Verify board permissions and configuration'
        ]
      );
    }

    return new JiraError(
      `Sprint data error for project '${projectKey}'`,
      'SPRINT_DATA_ERROR',
      [
        '1. Check if sprints are properly configured',
        '2. Verify board settings and permissions',
        '3. Ensure project uses Scrum methodology'
      ]
    );
  }

  /**
   * Handle API rate limiting
   */
  static handleRateLimitError(error: any): JiraError {
    return new JiraError(
      'Jira API rate limit exceeded',
      'RATE_LIMIT_EXCEEDED',
      [
        '1. Wait a few minutes before retrying',
        '2. Reduce the frequency of requests',
        '3. Consider upgrading your Jira plan for higher rate limits',
        '4. Contact your Jira administrator about API usage'
      ],
      429
    );
  }

  /**
   * Handle network and connectivity errors
   */
  static handleNetworkError(error: any): JiraError {
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return new JiraError(
        'Cannot connect to Jira instance',
        'NETWORK_ERROR',
        [
          '1. Check your internet connection',
          '2. Verify the Jira URL is correct and accessible',
          '3. Ensure firewall/proxy settings allow access',
          '4. Try accessing Jira in your web browser first'
        ]
      );
    }

    if (error.code === 'ETIMEDOUT') {
      return new JiraError(
        'Request to Jira timed out',
        'TIMEOUT_ERROR',
        [
          '1. Check your internet connection stability',
          '2. Retry the operation - Jira might be temporarily slow',
          '3. Verify Jira instance performance and status'
        ]
      );
    }

    return new JiraError(
      'Network error occurred',
      'UNKNOWN_NETWORK_ERROR',
      [
        '1. Check your network connection',
        '2. Verify Jira instance accessibility',
        '3. Retry the operation'
      ]
    );
  }

  /**
   * Handle configuration errors
   */
  static handleConfigError(missingVars: string[]): JiraError {
    return new JiraError(
      `Missing required configuration: ${missingVars.join(', ')}`,
      'CONFIG_ERROR',
      [
        '1. Copy .env.example to .env',
        '2. Fill in your Jira credentials in the .env file',
        '3. Get API token from: https://id.atlassian.com/manage-profile/security/api-tokens',
        '4. Restart Claude Desktop after configuration changes',
        '5. Example format:',
        '   JIRA_URL=https://yourcompany.atlassian.net',
        '   JIRA_EMAIL=your.email@company.com',
        '   JIRA_API_TOKEN=your_token_here'
      ]
    );
  }

  /**
   * Smart error categorization and response generation
   */
  static categorizeAndHandle(error: any, context: { operation?: string; projectKey?: string } = {}): JiraError {
    // Authentication errors
    if (error.response?.status === 401 || error.response?.status === 403) {
      return this.handleAuthError(error);
    }

    // Rate limiting
    if (error.response?.status === 429) {
      return this.handleRateLimitError(error);
    }

    // Project-specific errors
    if (context.projectKey && (error.response?.status === 404 || error.message?.includes('project'))) {
      return this.handleProjectError(context.projectKey, error);
    }

    // Sprint-specific errors
    if (context.operation?.includes('sprint') || error.message?.includes('sprint')) {
      return this.handleSprintError(context.projectKey || 'unknown', error);
    }

    // Network errors
    if (error.code || error.message?.includes('network') || error.message?.includes('connect')) {
      return this.handleNetworkError(error);
    }

    // Generic error fallback
    return new JiraError(
      error.message || 'An unexpected error occurred',
      'UNKNOWN_ERROR',
      [
        '1. Check your Jira configuration and credentials',
        '2. Verify your internet connection',
        '3. Try the operation again',
        '4. Contact support if the problem persists'
      ]
    );
  }

  /**
   * Format error for MCP response
   */
  static formatForMCP(error: JiraError): { content: { type: string; text: string }[] } {
    const troubleshootingText = error.troubleshooting.length > 0 
      ? `\n\n**Troubleshooting Steps:**\n${error.troubleshooting.map(step => `${step}`).join('\n')}`
      : '';

    return {
      content: [{
        type: 'text',
        text: `❌ **${error.message}**\n\n` +
              `**Error Code**: ${error.code}${troubleshootingText}\n\n` +
              `💡 **Need Help?** Use the "test_jira_connection" tool to validate your setup.`
      }]
    };
  }
}

/**
 * Performance monitoring utilities
 */
export class PerformanceMonitor {
  private static startTimes = new Map<string, number>();

  static startTimer(operation: string): void {
    this.startTimes.set(operation, Date.now());
  }

  static endTimer(operation: string): number {
    const startTime = this.startTimes.get(operation);
    if (!startTime) return 0;
    
    const duration = Date.now() - startTime;
    this.startTimes.delete(operation);
    
    // Log slow operations (>5 seconds)
    if (duration > 5000) {
      console.error(`⚠️ Slow operation detected: ${operation} took ${duration}ms`);
    }
    
    return duration;
  }

  static formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }
}
