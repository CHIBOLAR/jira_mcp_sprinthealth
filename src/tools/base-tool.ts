import { JiraApiClient } from '../jira-client.js';

/**
 * Base interface for all Jira MCP tools
 */
export interface JiraTool {
  execute(params: any): Promise<ToolResult>;
  validate(params: any): ValidationResult;
  requiresAuth(): boolean;
  rateLimit(): RateLimitConfig;
}

/**
 * Tool execution result
 */
export interface ToolResult {
  content: Array<{
    type: 'text';
    text: string;
  }>;
}

/**
 * Validation result for tool parameters
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
  requestsPerMinute: number;
  burstLimit: number;
}

/**
 * Base class for all Jira tools with common functionality
 */
export abstract class BaseJiraTool implements JiraTool {
  protected jiraClient: JiraApiClient;

  constructor(jiraClient: JiraApiClient) {
    this.jiraClient = jiraClient;
  }

  abstract execute(params: any): Promise<ToolResult>;
  
  abstract validate(params: any): ValidationResult;

  requiresAuth(): boolean {
    return true;
  }

  rateLimit(): RateLimitConfig {
    return {
      requestsPerMinute: 60, // Default rate limit
      burstLimit: 10
    };
  }

  /**
   * Format error response for MCP
   */
  protected formatError(error: any, context?: string): ToolResult {
    const errorMessage = context 
      ? `❌ Error in ${context}: ${error.message || error}`
      : `❌ Error: ${error.message || error}`;
    
    return {
      content: [{
        type: 'text',
        text: errorMessage
      }]
    };
  }

  /**
   * Format success response for MCP
   */
  protected formatSuccess(title: string, content: string): ToolResult {
    return {
      content: [{
        type: 'text',
        text: `✅ **${title}**\n\n${content}`
      }]
    };
  }
}

/**
 * Tool parameter validation helpers
 */
export class ToolValidator {
  static required(value: any, fieldName: string): ValidationResult {
    if (!value) {
      return {
        valid: false,
        errors: [`${fieldName} is required`]
      };
    }
    return { valid: true, errors: [] };
  }

  static string(value: any, fieldName: string): ValidationResult {
    if (typeof value !== 'string') {
      return {
        valid: false,
        errors: [`${fieldName} must be a string`]
      };
    }
    return { valid: true, errors: [] };
  }

  static number(value: any, fieldName: string): ValidationResult {
    if (typeof value !== 'number') {
      return {
        valid: false,
        errors: [`${fieldName} must be a number`]
      };
    }
    return { valid: true, errors: [] };
  }

  static array(value: any, fieldName: string): ValidationResult {
    if (!Array.isArray(value)) {
      return {
        valid: false,
        errors: [`${fieldName} must be an array`]
      };
    }
    return { valid: true, errors: [] };
  }

  static combine(...results: ValidationResult[]): ValidationResult {
    const errors = results.flatMap(r => r.errors);
    return {
      valid: errors.length === 0,
      errors
    };
  }
}
