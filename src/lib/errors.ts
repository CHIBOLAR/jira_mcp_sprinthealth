/**
 * Custom error classes for Jira MCP Server
 */

export class InvalidAccessTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAccessTokenError';
  }
}

export class JiraApiError extends Error {
  public readonly statusCode: number;
  public readonly response?: any;

  constructor(message: string, statusCode: number, response?: any) {
    super(message);
    this.name = 'JiraApiError';
    this.statusCode = statusCode;
    this.response = response;
  }
}

export class OAuthConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OAuthConfigurationError';
  }
}

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageError';
  }
}