/**
 * Jira API Client for making authenticated requests to Jira
 */

import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import { createLogger } from './logger.js';
import { JiraApiError } from './errors.js';

const logger = createLogger('JiraApiClient');

export interface JiraConfig {
  baseUrl: string;
  apiToken?: string; // Fallback authentication
}

export interface JiraIssue {
  key: string;
  id: string;
  fields: {
    summary: string;
    description?: string;
    status: { name: string; id: string };
    issuetype: { name: string; id: string };
    priority?: { name: string; id: string };
    project: { key: string; name: string; id: string };
    reporter?: { displayName: string; accountId: string };
    assignee?: { displayName: string; accountId: string };
    created: string;
    updated: string;
  };
}

export interface JiraProject {
  key: string;
  id: string;
  name: string;
  projectTypeKey: string;
  simplified: boolean;
  style: string;
}

export interface JiraUser {
  accountId: string;
  displayName: string;
  emailAddress: string;
  active: boolean;
  timeZone?: string;
  locale?: string;
}

export interface CreateIssueRequest {
  projectKey: string;
  summary: string;
  description?: string;
  issueType: string;
  priority?: string;
}

export interface SearchOptions {
  maxResults?: number;
  startAt?: number;
  fields?: string[];
}

export class JiraApiClient {
  private axios: AxiosInstance;
  private config: JiraConfig;

  constructor(config: JiraConfig) {
    this.config = config;
    
    // Create axios instance with base configuration
    this.axios = axios.create({
      baseURL: config.baseUrl,
      timeout: 30000,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Jira-MCP-Server/5.0.0',
      },
    });

    // Add authentication interceptor
    this.axios.interceptors.request.use(async (requestConfig) => {
      // ✅ CRITICAL FIX: Check for OAuth tokens first
      try {
        const fs = require('fs');
        const os = require('os');
        const path = require('path');
        
        const tokenFile = path.join(os.tmpdir(), 'jira-mcp-tokens.json');
        if (fs.existsSync(tokenFile)) {
          const tokenData = JSON.parse(fs.readFileSync(tokenFile, 'utf8'));
          
          // Check if token is still valid (not expired)
          const tokenAge = Date.now() - tokenData.timestamp;
          const expiryTime = (tokenData.expires_in || 3600) * 1000; // Convert to milliseconds
          
          if (tokenAge < expiryTime) {
            // Use OAuth Bearer token
            requestConfig.headers = requestConfig.headers || {};
            requestConfig.headers['Authorization'] = `Bearer ${tokenData.access_token}`;
            logger.debug('Using OAuth Bearer token for authentication');
            return requestConfig;
          } else {
            logger.warn('OAuth token expired, attempting to refresh...');
            // Try to refresh the token
            if (tokenData.refresh_token) {
              try {
                const { JiraOAuthManager } = await import('../auth/oauth-manager.js');
                const oauthManager = new JiraOAuthManager(this.config.baseUrl);
                const newTokens = await oauthManager.refreshToken(tokenData.refresh_token);
                
                // Save new tokens
                const newTokenData = {
                  access_token: newTokens.access_token,
                  refresh_token: newTokens.refresh_token || tokenData.refresh_token,
                  expires_in: newTokens.expires_in,
                  token_type: newTokens.token_type,
                  timestamp: Date.now()
                };
                
                fs.writeFileSync(tokenFile, JSON.stringify(newTokenData, null, 2));
                
                requestConfig.headers = requestConfig.headers || {};
                requestConfig.headers['Authorization'] = `Bearer ${newTokens.access_token}`;
                logger.info('OAuth token refreshed successfully');
                return requestConfig;
              } catch (refreshError) {
                logger.error('Token refresh failed:', refreshError);
                fs.unlinkSync(tokenFile); // Remove invalid token file
              }
            }
            logger.warn('No valid refresh token, falling back to API token');
          }
        }
      } catch (error) {
        logger.debug('No valid OAuth tokens found, using API token fallback');
      }
      
      // Fallback to API token authentication
      if (this.config.apiToken) {
        requestConfig.auth = {
          username: 'api-token', // For Atlassian Cloud
          password: this.config.apiToken,
        };
      } else {
        logger.error('No authentication method available. Please run OAuth flow or provide API token.');
        throw new Error('Authentication required: No OAuth token or API token available');
      }
      
      logger.debug(`Making request: ${requestConfig.method?.toUpperCase()} ${requestConfig.url}`);
      return requestConfig;
    });

    // Add response interceptor for error handling
    this.axios.interceptors.response.use(
      (response) => {
        logger.debug(`Response: ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        const status = error.response?.status;
        const statusText = error.response?.statusText;
        const url = error.config?.url;
        
        logger.error(`Request failed: ${error.config?.method?.toUpperCase()} ${url} - ${status} ${statusText}`);
        
        if (error.response) {
          throw new JiraApiError(
            `Jira API error: ${status} ${statusText}`,
            status,
            error.response.data
          );
        } else if (error.request) {
          throw new JiraApiError('Network error: No response received from Jira', 0);
        } else {
          throw new JiraApiError(`Request error: ${error.message}`, 0);
        }
      }
    );

    logger.info(`Jira API client initialized for: ${config.baseUrl}`);
  }

  /**
   * Test connection to Jira
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.axios.get('/rest/api/3/myself');
      logger.info('Jira connection test successful');
      return true;
    } catch (error) {
      logger.error('Jira connection test failed:', error);
      return false;
    }
  }

  /**
   * Get current user information
   */
  async getCurrentUser(): Promise<JiraUser> {
    try {
      const response = await this.axios.get<JiraUser>('/rest/api/3/myself');
      return response.data;
    } catch (error) {
      logger.error('Failed to get current user:', error);
      throw error;
    }
  }

  /**
   * Get a specific issue by key
   */
  async getIssue(issueKey: string): Promise<JiraIssue> {
    try {
      const response = await this.axios.get<JiraIssue>(`/rest/api/3/issue/${issueKey}`, {
        params: {
          fields: 'summary,description,status,issuetype,priority,project,reporter,assignee,created,updated'
        }
      });
      return response.data;
    } catch (error) {
      logger.error(`Failed to get issue ${issueKey}:`, error);
      throw error;
    }
  }

  /**
   * Search issues using JQL
   */
  async searchIssues(jql: string, options: SearchOptions = {}): Promise<{
    issues: JiraIssue[];
    total: number;
    startAt: number;
    maxResults: number;
  }> {
    try {
      const params = {
        jql,
        maxResults: options.maxResults || 20,
        startAt: options.startAt || 0,
        fields: options.fields?.join(',') || 'summary,status,issuetype,priority,assignee,reporter,project,created,updated'
      };

      const response = await this.axios.get('/rest/api/3/search', { params });
      return response.data;
    } catch (error) {
      logger.error(`Failed to search with JQL: ${jql}`, error);
      throw error;
    }
  }

  /**
   * Get all projects accessible to the user
   */
  async getProjects(): Promise<JiraProject[]> {
    try {
      const response = await this.axios.get<JiraProject[]>('/rest/api/3/project');
      return response.data;
    } catch (error) {
      logger.error('Failed to get projects:', error);
      throw error;
    }
  }

  /**
   * Create a new issue
   */
  async createIssue(request: CreateIssueRequest): Promise<JiraIssue> {
    try {
      // First, get the project to validate it exists
      const projects = await this.getProjects();
      const project = projects.find(p => p.key === request.projectKey);
      
      if (!project) {
        throw new JiraApiError(`Project ${request.projectKey} not found or not accessible`, 404);
      }

      // Build the issue creation payload
      const payload = {
        fields: {
          project: {
            key: request.projectKey
          },
          summary: request.summary,
          issuetype: {
            name: request.issueType
          },
          ...(request.description && {
            description: {
              type: 'doc',
              version: 1,
              content: [
                {
                  type: 'paragraph',
                  content: [
                    {
                      text: request.description,
                      type: 'text'
                    }
                  ]
                }
              ]
            }
          }),
          ...(request.priority && {
            priority: {
              name: request.priority
            }
          })
        }
      };

      const response = await this.axios.post('/rest/api/3/issue', payload);
      
      // Get the created issue with full details
      const createdIssue = await this.getIssue(response.data.key);
      
      logger.info(`Created issue: ${response.data.key}`);
      return createdIssue;
    } catch (error) {
      logger.error('Failed to create issue:', error);
      throw error;
    }
  }

  /**
   * Update an issue
   */
  async updateIssue(issueKey: string, fields: Record<string, any>): Promise<void> {
    try {
      await this.axios.put(`/rest/api/3/issue/${issueKey}`, {
        fields
      });
      logger.info(`Updated issue: ${issueKey}`);
    } catch (error) {
      logger.error(`Failed to update issue ${issueKey}:`, error);
      throw error;
    }
  }

  /**
   * Add a comment to an issue
   */
  async addComment(issueKey: string, comment: string): Promise<void> {
    try {
      const payload = {
        body: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  text: comment,
                  type: 'text'
                }
              ]
            }
          ]
        }
      };

      await this.axios.post(`/rest/api/3/issue/${issueKey}/comment`, payload);
      logger.info(`Added comment to issue: ${issueKey}`);
    } catch (error) {
      logger.error(`Failed to add comment to issue ${issueKey}:`, error);
      throw error;
    }
  }

  /**
   * Get the base URL for building links
   */
  getBaseUrl(): string {
    return this.config.baseUrl;
  }

  /**
   * Make a raw request to the Jira API
   */
  async makeRequest<T = any>(endpoint: string, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response = await this.axios.request<T>({
        url: endpoint,
        ...config
      });
      return response.data;
    } catch (error) {
      logger.error(`Raw request failed: ${endpoint}`, error);
      throw error;
    }
  }
}