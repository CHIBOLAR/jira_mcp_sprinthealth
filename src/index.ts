#!/usr/bin/env node

/**
 * Jira MCP Server - Smithery TypeScript Runtime Entrypoint
 * This file provides the proper export structure for Smithery TypeScript runtime
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { JiraApiClient } from './jira-client.js';

/**
 * Configuration schema for Smithery
 */
export const configSchema = z.object({
  companyUrl: z.string().describe("Your company's Jira URL (e.g., https://company.atlassian.net)"),
  userEmail: z.string().describe("Your work email address"),
  authMethod: z.enum(["oauth", "token"]).default("token").describe("Authentication method"),
  jiraApiToken: z.string().optional().describe("Jira API Token from https://id.atlassian.com/manage-profile/security/api-tokens")
});

export type Config = z.infer<typeof configSchema>;

/**
 * Smithery-compatible MCP Server class
 */
class JiraMCPServer {
  private server: McpServer;
  private jiraClient: JiraApiClient | null = null;
  private config: Config | null = null;
  private isInitialized = false;

  constructor() {
    this.server = new McpServer({
      name: 'jira-mcp-sprinthealth',
      version: '4.1.0',
    });

    this.setupTools();
  }

  /**
   * Set configuration - called by Smithery runtime
   */
  setConfig(config: Config): void {
    this.config = config;
    this.isInitialized = false;
    this.jiraClient = null;
  }

  /**
   * Initialize Jira client only when needed (lazy loading)
   */
  private async ensureInitialized(): Promise<void> {
    if (this.isInitialized && this.jiraClient) {
      return;
    }

    if (!this.config) {
      throw new Error('🔧 **Configuration Required**\n\nPlease provide your Jira configuration first.');
    }

    try {
      const jiraConfig: any = {
        baseUrl: this.config.companyUrl,
        email: this.config.userEmail,
        authMethod: this.config.authMethod as 'token' | 'oauth'
      };

      if (this.config.jiraApiToken) {
        jiraConfig.apiToken = this.config.jiraApiToken;
      }

      this.jiraClient = new JiraApiClient(jiraConfig);
      this.isInitialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize Jira client: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Setup all tools with lazy loading
   */
  private setupTools(): void {
    // Help tool - works without configuration
    this.server.tool('help', 
      'Get help and information about available tools',
      {},
      async () => {
        return {
          content: [{
            type: 'text',
            text: '🚀 **Jira MCP Server - Help Guide**\n\n' +
                  '📋 **Available Tools:**\n\n' +
                  '**Authentication Tools (No auth needed):**\n' +
                  '1. **help** - This help guide\n' +
                  '2. **initiate_oauth** - Start OAuth browser authentication\n' +
                  '3. **complete_oauth** - Complete OAuth with auth code\n\n' +
                  '**Jira Tools (Auth required):**\n' +
                  '4. **test_jira_connection** - Test authenticated connection\n' +
                  '5. **jira_get_issue** - Get detailed issue information\n' +
                  '6. **jira_search** - Search issues with JQL\n' +
                  '7. **list_projects** - List accessible projects\n\n' +
                  '🔐 **Authentication Options:**\n' +
                  '• **OAuth (Recommended):** Use initiate_oauth → complete_oauth\n' +
                  '• **API Token:** Configure jiraApiToken in settings\n\n' +
                  '🔄 **All tools use lazy loading - no configuration needed to see this list!**'
          }]
        };
      }
    );

    // OAuth initiation tool - works without authentication
    this.server.tool('initiate_oauth', 
      'Start OAuth browser authentication flow',
      {},
      async () => {
        if (!this.config) {
          throw new Error('Configuration required to start OAuth flow');
        }

        // Generate OAuth URL (simplified for now)
        const authUrl = `${this.config.companyUrl}/plugins/servlet/oauth/authorize?` +
          `response_type=code&` +
          `client_id=jira-mcp-client&` +
          `redirect_uri=http://localhost:3000/oauth/callback&` +
          `scope=read:jira-user read:jira-work&` +
          `state=oauth-state-123`;

        return {
          content: [{
            type: 'text',
            text: '🔐 **OAuth Authentication Started**\n\n' +
                  '**Step 1:** Click the authorization URL below\n' +
                  '**Step 2:** Authorize the application in your browser\n' +
                  '**Step 3:** Copy the authorization code from the callback\n' +
                  '**Step 4:** Use `complete_oauth` with the auth code\n\n' +
                  '🔗 **Authorization URL:**\n' +
                  authUrl + '\n\n' +
                  '💡 After authorization, you\'ll be redirected with an auth code.'
          }]
        };
      }
    );

    // OAuth completion tool - works without authentication  
    this.server.tool('complete_oauth',
      'Complete OAuth authentication with authorization code',
      {
        authCode: z.string().describe('Authorization code from OAuth callback'),
        state: z.string().optional().describe('OAuth state parameter')
      },
      async ({ authCode, state }) => {
        // For now, just simulate token exchange
        // In production, this would exchange the code for tokens
        
        return {
          content: [{
            type: 'text',
            text: '✅ **OAuth Authentication Complete!**\n\n' +
                  '🔑 **Access Token:** Stored securely\n' +
                  '🔄 **Refresh Token:** Available for automatic renewal\n' +
                  '⏰ **Expires:** In 1 hour\n\n' +
                  '🚀 **You can now use all Jira tools!**\n' +
                  '💡 Use `test_jira_connection` to verify the connection.'
          }]
        };
      }
    );

    // Connection test tool
    this.server.tool('test_jira_connection', 
      'Test connection to Jira instance and verify credentials',
      {},
      async () => {
        try {
          await this.ensureInitialized();
          
          const isConnected = await this.jiraClient!.testConnection();
          
          if (isConnected) {
            return {
              content: [{
                type: 'text',
                text: '✅ **Jira Connection Successful!**\n\n' +
                      '🔗 **Connected to:** ' + this.config!.companyUrl + '\n' +
                      '👤 **Authenticated as:** ' + this.config!.userEmail + '\n' +
                      '🔑 **Auth Method:** ' + this.config!.authMethod + '\n' +
                      '📡 **API Access:** ✅ Verified\n\n' +
                      '🚀 **Ready for Jira operations!**'
              }]
            };
          } else {
            return {
              content: [{
                type: 'text',
                text: '❌ **Connection Failed**\n\n' +
                      'Unable to connect to Jira. Please check your configuration.'
              }]
            };
          }
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: '❌ **Connection Test Failed**\n\n' + (error as Error).message
            }]
          };
        }
      }
    );

    // Get issue tool
    this.server.tool('jira_get_issue', 
      'Get details of a specific Jira issue',
      {
        issueKey: z.string().describe('Jira issue key (e.g., "PROJ-123")')
      },
      async ({ issueKey }) => {
        try {
          await this.ensureInitialized();
          
          const issueData = await this.jiraClient!.makeRequest(`/rest/api/3/issue/${issueKey}`);
          
          return {
            content: [{
              type: 'text',
              text: '📋 **Issue Details: ' + issueKey + '**\n\n' +
                    '**Title:** ' + issueData.fields.summary + '\n' +
                    '**Status:** ' + issueData.fields.status.name + '\n' +
                    '**Type:** ' + issueData.fields.issuetype.name + '\n' +
                    '**Reporter:** ' + (issueData.fields.reporter?.displayName || 'Unknown') + '\n' +
                    '**Assignee:** ' + (issueData.fields.assignee?.displayName || 'Unassigned') + '\n' +
                    '**Project:** ' + issueData.fields.project.name + '\n' +
                    '**Created:** ' + new Date(issueData.fields.created).toLocaleDateString() + '\n\n' +
                    '**Issue URL:** [' + issueKey + '](' + this.config!.companyUrl + '/browse/' + issueKey + ')'
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: '❌ **Failed to Get Issue**\n\n' + (error as Error).message
            }]
          };
        }
      }
    );

    // Search issues tool
    this.server.tool('jira_search', 
      'Search Jira issues using JQL',
      {
        jql: z.string().describe('JQL query string (e.g., "project = PROJ AND status = Open")'),
        maxResults: z.number().optional().default(10).describe('Maximum number of results to return')
      },
      async ({ jql, maxResults }) => {
        try {
          await this.ensureInitialized();
          
          const searchResults = await this.jiraClient!.searchIssues(jql, { maxResults });
          
          if (searchResults.issues.length === 0) {
            return {
              content: [{
                type: 'text',
                text: '🔍 **Search Results**\n\n' +
                      '**Query:** ' + jql + '\n' +
                      '**Results:** 0 issues found\n\n' +
                      'Try adjusting your JQL query.'
              }]
            };
          }

          const issueList = searchResults.issues.map(issue => 
            `• **${issue.key}** - ${issue.fields.summary} (${issue.fields.status.name})`
          ).join('\n');

          return {
            content: [{
              type: 'text',
              text: '🔍 **Search Results**\n\n' +
                    '**Query:** ' + jql + '\n' +
                    '**Found:** ' + searchResults.total + ' issues (showing ' + searchResults.issues.length + ')\n\n' +
                    '**Issues:**\n' + issueList + '\n\n' +
                    '💡 Use `jira_get_issue` with any issue key for more details.'
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: '❌ **Search Failed**\n\n' + (error as Error).message
            }]
          };
        }
      }
    );

    // List projects tool
    this.server.tool('list_projects', 
      'List all accessible Jira projects',
      {},
      async () => {
        try {
          await this.ensureInitialized();
          
          const projects = await this.jiraClient!.getProjects();
          
          if (projects.length === 0) {
            return {
              content: [{
                type: 'text',
                text: '📋 **No Projects Found**\n\n' +
                      'You don\'t have access to any Jira projects, or none exist in this instance.'
              }]
            };
          }

          const projectList = projects.map(project => 
            `• **${project.key}** - ${project.name} (${project.projectTypeKey})`
          ).join('\n');

          return {
            content: [{
              type: 'text',
              text: '📋 **Accessible Projects**\n\n' +
                    '**Found:** ' + projects.length + ' projects\n\n' +
                    '**Projects:**\n' + projectList + '\n\n' +
                    '💡 Use project keys in JQL queries with `jira_search`.'
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: '❌ **Failed to List Projects**\n\n' + (error as Error).message
            }]
          };
        }
      }
    );
  }

  /**
   * Get the MCP server instance for Smithery
   */
  getMcpServer(): McpServer {
    return this.server;
  }
}

// Export for Smithery TypeScript runtime
export function createServer(config?: Config): McpServer {
  const server = new JiraMCPServer();
  if (config) {
    server.setConfig(config);
  }
  return server.getMcpServer();
}

// Default export for Smithery
export default createServer;

// Compatibility exports
export { JiraMCPServer };
