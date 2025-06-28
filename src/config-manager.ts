import { JiraError } from './error-handler.js';

/**
 * Advanced Configuration System - Week 3 Implementation
 * Supports multiple projects, custom field detection, and environment profiles
 */

export interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
  timeout?: number;
  maxRetries?: number;
  cacheTTL?: number;
}

export interface ProjectConfig {
  key: string;
  storyPointField?: string;
  epicLinkField?: string;
  sprintField?: string;
  healthThresholds?: HealthThresholds;
}

export interface HealthThresholds {
  excellent: number;    // >= 80
  good: number;        // >= 60
  warning: number;     // >= 40
  critical: number;    // < 40
}

export interface AdvancedConfig {
  jira: JiraConfig;
  projects: ProjectConfig[];
  performance: {
    enableCaching: boolean;
    cacheTTL: number;
    maxConcurrentRequests: number;
    requestTimeout: number;
  };
  analytics: {
    defaultSprintCount: number;
    defaultHealthThresholds: HealthThresholds;
    enablePredictiveAnalytics: boolean;
  };
  environment: 'development' | 'staging' | 'production';
}

export class ConfigurationManager {
  private static instance: ConfigurationManager;
  private config: AdvancedConfig | null = null;
  private detectedFields = new Map<string, { storyPoints: string; epic: string; sprint: string }>();

  private constructor() {
    // Don't load configuration during initialization - use lazy loading
  }

  static getInstance(): ConfigurationManager {
    if (!ConfigurationManager.instance) {
      ConfigurationManager.instance = new ConfigurationManager();
    }
    return ConfigurationManager.instance;
  }

  /**
   * Lazy load configuration only when needed
   */
  private ensureConfigLoaded(): AdvancedConfig {
    if (!this.config) {
      this.config = this.loadConfiguration();
    }
    return this.config;
  }

  /**
   * Load configuration from environment and defaults
   */
  private loadConfiguration(): AdvancedConfig {
    const requiredVars = ['JIRA_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN'];
    const missing = requiredVars.filter(varName => !process.env[varName]);
    
    if (missing.length > 0) {
      throw new JiraError(
        `Missing required environment variables: ${missing.join(', ')}`,
        'CONFIG_ERROR',
        [
          '1. Copy .env.example to .env',
          '2. Fill in your Jira credentials',
          '3. Get API token from: https://id.atlassian.com/manage-profile/security/api-tokens',
          '4. Restart Claude Desktop after changes'
        ]
      );
    }

    return {
      jira: {
        baseUrl: process.env.JIRA_URL!,
        email: process.env.JIRA_EMAIL!,
        apiToken: process.env.JIRA_API_TOKEN!,
        timeout: parseInt(process.env.JIRA_TIMEOUT || '30000'),
        maxRetries: parseInt(process.env.JIRA_MAX_RETRIES || '3'),
        cacheTTL: parseInt(process.env.CACHE_TTL || '300000') // 5 minutes
      },
      projects: this.loadProjectConfigs(),
      performance: {
        enableCaching: process.env.ENABLE_CACHING !== 'false',
        cacheTTL: parseInt(process.env.CACHE_TTL || '300000'),
        maxConcurrentRequests: parseInt(process.env.MAX_CONCURRENT || '10'),
        requestTimeout: parseInt(process.env.REQUEST_TIMEOUT || '10000')
      },
      analytics: {
        defaultSprintCount: parseInt(process.env.DEFAULT_SPRINT_COUNT || '6'),
        defaultHealthThresholds: {
          excellent: 80,
          good: 60,
          warning: 40,
          critical: 0
        },
        enablePredictiveAnalytics: process.env.ENABLE_PREDICTIONS === 'true'
      },
      environment: (process.env.NODE_ENV as any) || 'development'
    };
  }

  /**
   * Load project-specific configurations
   */
  private loadProjectConfigs(): ProjectConfig[] {
    const projectsEnv = process.env.JIRA_PROJECTS;
    if (!projectsEnv) return [];

    try {
      return JSON.parse(projectsEnv);
    } catch (error) {
      console.warn('Invalid JIRA_PROJECTS format, using defaults');
      return [];
    }
  }

  /**
   * Get configuration for the Jira client
   */
  getJiraConfig(): JiraConfig {
    return this.ensureConfigLoaded().jira;
  }

  /**
   * Get project-specific configuration
   */
  getProjectConfig(projectKey: string): ProjectConfig {
    const config = this.ensureConfigLoaded();
    const existing = config.projects.find(p => p.key === projectKey);
    return existing || { key: projectKey };
  }

  /**
   * Auto-detect custom fields for a project
   */
  async detectCustomFields(projectKey: string, jiraClient: any): Promise<void> {
    try {
      // Get field information from an issue
      const searchResponse = await jiraClient.searchIssues(
        `project = "${projectKey}"`,
        { maxResults: 1, expand: 'names' }
      );

      if (searchResponse.issues.length === 0) {
        console.warn(`No issues found in project ${projectKey} for field detection`);
        return;
      }

      const issue = searchResponse.issues[0];
      const fieldNames = searchResponse.names || {};
      
      // Detect story points field
      const storyPointField = this.findStoryPointField(issue.fields, fieldNames);
      
      // Detect epic link field
      const epicField = this.findEpicField(issue.fields, fieldNames);
      
      // Detect sprint field
      const sprintField = this.findSprintField(issue.fields, fieldNames);

      // Cache detected fields
      this.detectedFields.set(projectKey, {
        storyPoints: storyPointField,
        epic: epicField,
        sprint: sprintField
      });

      console.log(`✅ Auto-detected fields for ${projectKey}:`, {
        storyPoints: storyPointField,
        epic: epicField,
        sprint: sprintField
      });

    } catch (error) {
      console.warn(`Failed to auto-detect fields for ${projectKey}:`, error);
    }
  }

  /**
   * Find story points custom field
   */
  private findStoryPointField(fields: any, fieldNames: any): string {
    // Common story point field patterns
    const patterns = [
      'customfield_10016', // Most common default
      'customfield_10024', 
      'customfield_10008',
      'customfield_10002'
    ];

    // Look for field with story point indicators
    for (const [fieldId, fieldValue] of Object.entries(fields)) {
      if (fieldId.startsWith('customfield_') && typeof fieldValue === 'number') {
        const fieldName = fieldNames[fieldId]?.toLowerCase() || '';
        if (fieldName.includes('story') && fieldName.includes('point')) {
          return fieldId;
        }
      }
    }

    // Fallback to common patterns
    for (const pattern of patterns) {
      if (fields[pattern] !== undefined) {
        return pattern;
      }
    }

    return 'customfield_10016'; // Default fallback
  }

  /**
   * Find epic link custom field
   */
  private findEpicField(fields: any, fieldNames: any): string {
    for (const [fieldId, fieldValue] of Object.entries(fields)) {
      if (fieldId.startsWith('customfield_')) {
        const fieldName = fieldNames[fieldId]?.toLowerCase() || '';
        if (fieldName.includes('epic') && fieldName.includes('link')) {
          return fieldId;
        }
      }
    }
    return 'customfield_10014'; // Common default
  }

  /**
   * Find sprint custom field
   */
  private findSprintField(fields: any, fieldNames: any): string {
    for (const [fieldId, fieldValue] of Object.entries(fields)) {
      if (fieldId.startsWith('customfield_') && Array.isArray(fieldValue)) {
        const fieldName = fieldNames[fieldId]?.toLowerCase() || '';
        if (fieldName.includes('sprint')) {
          return fieldId;
        }
      }
    }
    return 'customfield_10020'; // Common default
  }

  /**
   * Get detected or configured story points field
   */
  getStoryPointField(projectKey: string): string {
    const projectConfig = this.getProjectConfig(projectKey);
    if (projectConfig.storyPointField) {
      return projectConfig.storyPointField;
    }

    const detected = this.detectedFields.get(projectKey);
    return detected?.storyPoints || 'customfield_10016';
  }

  /**
   * Get health thresholds for a project
   */
  getHealthThresholds(projectKey: string): HealthThresholds {
    const projectConfig = this.getProjectConfig(projectKey);
    const config = this.ensureConfigLoaded();
    return projectConfig.healthThresholds || config.analytics.defaultHealthThresholds;
  }

  /**
   * Get environment-specific settings
   */
  getEnvironmentConfig() {
    const baseConfig = {
      enableDebugLogging: false,
      enableDetailedErrors: false,
      enablePerformanceLogging: false
    };

    const config = this.ensureConfigLoaded();
    switch (config.environment) {
      case 'development':
        return {
          ...baseConfig,
          enableDebugLogging: true,
          enableDetailedErrors: true,
          enablePerformanceLogging: true
        };
      case 'staging':
        return {
          ...baseConfig,
          enablePerformanceLogging: true
        };
      case 'production':
        return baseConfig;
      default:
        return baseConfig;
    }
  }

  /**
   * Validate configuration
   */
  validateConfiguration(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
      const config = this.ensureConfigLoaded();
      
      // Validate Jira URL
      try {
        new URL(config.jira.baseUrl);
      } catch {
        errors.push('Invalid JIRA_URL format');
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(config.jira.email)) {
        errors.push('Invalid JIRA_EMAIL format');
      }

      // Validate API token format (should be alphanumeric)
      if (!/^[a-zA-Z0-9]+$/.test(config.jira.apiToken)) {
        errors.push('Invalid JIRA_API_TOKEN format');
      }
    } catch (configError) {
      // If configuration loading fails, add those errors
      if ((configError as any).message) {
        errors.push((configError as any).message);
      } else {
        errors.push('Configuration could not be loaded');
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Get current configuration status
   */
  getConfigurationStatus(): string {
    const validation = this.validateConfiguration();
    const env = this.getEnvironmentConfig();
    
    try {
      const config = this.ensureConfigLoaded();
      return `📋 **Configuration Status**\n\n` +
             `**Environment**: ${config.environment.toUpperCase()}\n` +
             `**Jira URL**: ${config.jira.baseUrl}\n` +
             `**Email**: ${config.jira.email}\n` +
             `**Projects Configured**: ${config.projects.length}\n` +
             `**Caching**: ${config.performance.enableCaching ? 'Enabled' : 'Disabled'}\n` +
             `**Debug Logging**: ${env.enableDebugLogging ? 'Enabled' : 'Disabled'}\n\n` +
             `**Validation**: ${validation.valid ? '✅ Valid' : '❌ Issues Found'}\n` +
             `${validation.errors.length > 0 ? validation.errors.map(e => `• ${e}`).join('\n') : ''}`;
    } catch (error) {
      return `📋 **Configuration Status**\n\n` +
             `**Status**: ❌ Configuration not available\n` +
             `**Validation**: ${validation.valid ? '✅ Valid' : '❌ Issues Found'}\n` +
             `${validation.errors.length > 0 ? validation.errors.map(e => `• ${e}`).join('\n') : ''}`;
    }
  }
}
