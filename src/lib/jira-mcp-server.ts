/**
 * Jira MCP Server Implementation
 * Provides tools for interacting with Jira API
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createLogger } from './logger.js';
import { JiraApiClient } from './jira-client.js';

const logger = createLogger('JiraMCPServer');

export class JiraMCPServer {
  private mcpServer: McpServer;
  private jiraClient: JiraApiClient;

  constructor() {
    this.mcpServer = new McpServer({
      name: 'jira-mcp-remote-oauth',
      version: '5.0.0',
    });

    // Initialize Jira client with environment-based configuration
    this.jiraClient = new JiraApiClient({
      baseUrl: process.env.JIRA_BASE_URL || 'https://your-company.atlassian.net',
      // Auth will be handled by bearer tokens, but fallback API token available
      apiToken: process.env.JIRA_API_TOKEN,
    });

    this.setupTools();
    logger.info('Jira MCP Server initialized');
  }

  private setupTools(): void {
    // Test connection tool
    this.mcpServer.tool(
      'test_jira_connection',
      'Test connection to Jira instance and verify authentication',
      {},
      async () => {
        try {
          const isConnected = await this.jiraClient.testConnection();
          
          return {
            content: [{
              type: 'text',
              text: isConnected 
                ? '✅ **Jira Connection Successful!**\n\n' +
                  `🔗 Connected to: ${this.jiraClient.getBaseUrl()}\n` +
                  '🔑 Authentication: OAuth Bearer Token\n' +
                  '📡 API Access: ✅ Verified\n\n' +
                  '🚀 Ready for Jira operations!'
                : '❌ **Connection Failed**\n\n' +
                  'Unable to connect to Jira. Please check your configuration and authentication.'
            }]
          };
        } catch (error) {
          logger.error('Connection test failed:', error);
          return {
            content: [{
              type: 'text',
              text: `❌ **Connection Test Failed**\n\n${error instanceof Error ? error.message : 'Unknown error'}`
            }]
          };
        }
      }
    );

    // Get issue tool
    this.mcpServer.tool(
      'jira_get_issue',
      'Get details of a specific Jira issue',
      {
        issueKey: z.string().describe('Jira issue key (e.g., "PROJ-123")')
      },
      async ({ issueKey }) => {
        try {
          const issue = await this.jiraClient.getIssue(issueKey);
          
          return {
            content: [{
              type: 'text',
              text: `📋 **Issue Details: ${issueKey}**\n\n` +
                    `**Title:** ${issue.fields.summary}\n` +
                    `**Status:** ${issue.fields.status.name}\n` +
                    `**Type:** ${issue.fields.issuetype.name}\n` +
                    `**Priority:** ${issue.fields.priority?.name || 'Not set'}\n` +
                    `**Reporter:** ${issue.fields.reporter?.displayName || 'Unknown'}\n` +
                    `**Assignee:** ${issue.fields.assignee?.displayName || 'Unassigned'}\n` +
                    `**Project:** ${issue.fields.project.name}\n` +
                    `**Created:** ${new Date(issue.fields.created).toLocaleDateString()}\n` +
                    `**Updated:** ${new Date(issue.fields.updated).toLocaleDateString()}\n\n` +
                    `**Description:** ${issue.fields.description || 'No description'}\n\n` +
                    `**Issue URL:** [${issueKey}](${this.jiraClient.getBaseUrl()}/browse/${issueKey})`
            }]
          };
        } catch (error) {
          logger.error(`Failed to get issue ${issueKey}:`, error);
          return {
            content: [{
              type: 'text',
              text: `❌ **Failed to Get Issue ${issueKey}**\n\n${error instanceof Error ? error.message : 'Unknown error'}`
            }]
          };
        }
      }
    );

    // Search issues tool
    this.mcpServer.tool(
      'jira_search',
      'Search Jira issues using JQL (Jira Query Language)',
      {
        jql: z.string().describe('JQL query string (e.g., "project = PROJ AND status = Open")'),
        maxResults: z.number().optional().default(20).describe('Maximum number of results to return (1-50)')
      },
      async ({ jql, maxResults = 20 }) => {
        try {
          const searchResults = await this.jiraClient.searchIssues(jql, { 
            maxResults: Math.min(maxResults, 50) 
          });
          
          if (searchResults.issues.length === 0) {
            return {
              content: [{
                type: 'text',
                text: `🔍 **Search Results**\n\n` +
                      `**Query:** ${jql}\n` +
                      `**Results:** 0 issues found\n\n` +
                      'Try adjusting your JQL query.'
              }]
            };
          }

          const issueList = searchResults.issues.map(issue => 
            `• **${issue.key}** - ${issue.fields.summary} ` +
            `(${issue.fields.status.name}) - ${issue.fields.assignee?.displayName || 'Unassigned'}`
          ).join('\n');

          return {
            content: [{
              type: 'text',
              text: `🔍 **Search Results**\n\n` +
                    `**Query:** ${jql}\n` +
                    `**Found:** ${searchResults.total} total issues (showing ${searchResults.issues.length})\n\n` +
                    `**Issues:**\n${issueList}\n\n` +
                    '💡 Use `jira_get_issue` with any issue key for detailed information.'
            }]
          };
        } catch (error) {
          logger.error(`Search failed for JQL: ${jql}`, error);
          return {
            content: [{
              type: 'text',
              text: `❌ **Search Failed**\n\n${error instanceof Error ? error.message : 'Unknown error'}`
            }]
          };
        }
      }
    );

    // List projects tool
    this.mcpServer.tool(
      'list_projects',
      'List all accessible Jira projects',
      {},
      async () => {
        try {
          const projects = await this.jiraClient.getProjects();
          
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
              text: `📋 **Accessible Projects**\n\n` +
                    `**Found:** ${projects.length} projects\n\n` +
                    `**Projects:**\n${projectList}\n\n` +
                    '💡 Use project keys in JQL queries with `jira_search`.'
            }]
          };
        } catch (error) {
          logger.error('Failed to list projects:', error);
          return {
            content: [{
              type: 'text',
              text: `❌ **Failed to List Projects**\n\n${error instanceof Error ? error.message : 'Unknown error'}`
            }]
          };
        }
      }
    );

    // Create issue tool
    this.mcpServer.tool(
      'jira_create_issue',
      'Create a new Jira issue',
      {
        projectKey: z.string().describe('Project key where to create the issue'),
        summary: z.string().describe('Issue title/summary'),
        description: z.string().optional().describe('Issue description'),
        issueType: z.string().default('Task').describe('Issue type (Task, Bug, Story, etc.)'),
        priority: z.string().optional().describe('Priority (Highest, High, Medium, Low, Lowest)')
      },
      async ({ projectKey, summary, description, issueType, priority }) => {
        try {
          const issue = await this.jiraClient.createIssue({
            projectKey,
            summary,
            description,
            issueType,
            priority
          });
          
          return {
            content: [{
              type: 'text',
              text: `✅ **Issue Created Successfully!**\n\n` +
                    `**Issue Key:** ${issue.key}\n` +
                    `**Summary:** ${summary}\n` +
                    `**Project:** ${projectKey}\n` +
                    `**Type:** ${issueType}\n` +
                    `**Status:** ${issue.fields?.status?.name || 'Created'}\n\n` +
                    `**Issue URL:** [${issue.key}](${this.jiraClient.getBaseUrl()}/browse/${issue.key})`
            }]
          };
        } catch (error) {
          logger.error('Failed to create issue:', error);
          return {
            content: [{
              type: 'text',
              text: `❌ **Failed to Create Issue**\n\n${error instanceof Error ? error.message : 'Unknown error'}`
            }]
          };
        }
      }
    );

    // Get user profile tool
    this.mcpServer.tool(
      'jira_get_profile',
      'Get current user profile information',
      {},
      async () => {
        try {
          const profile = await this.jiraClient.getCurrentUser();
          
          return {
            content: [{
              type: 'text',
              text: `👤 **User Profile**\n\n` +
                    `**Name:** ${profile.displayName}\n` +
                    `**Email:** ${profile.emailAddress}\n` +
                    `**Account ID:** ${profile.accountId}\n` +
                    `**Active:** ${profile.active ? 'Yes' : 'No'}\n` +
                    `**Timezone:** ${profile.timeZone || 'Not set'}\n` +
                    `**Locale:** ${profile.locale || 'Not set'}`
            }]
          };
        } catch (error) {
          logger.error('Failed to get user profile:', error);
          return {
            content: [{
              type: 'text',
              text: `❌ **Failed to Get Profile**\n\n${error instanceof Error ? error.message : 'Unknown error'}`
            }]
          };
        }
      }
    );

    // Help tool
    this.mcpServer.tool(
      'help',
      'Get help and information about available Jira tools',
      {},
      async () => {
        return {
          content: [{
            type: 'text',
            text: '🚀 **Jira MCP Server - Help Guide**\n\n' +
                  '📋 **Available Tools:**\n\n' +
                  '1. **test_jira_connection** - Test connection and authentication\n' +
                  '2. **jira_get_issue** - Get detailed issue information\n' +
                  '3. **jira_search** - Search issues with JQL queries\n' +
                  '4. **list_projects** - List accessible projects\n' +
                  '5. **jira_create_issue** - Create new issues\n' +
                  '6. **jira_get_profile** - Get current user profile\n' +
                  '7. **help** - This help guide\n\n' +
                  '🔐 **Authentication:** OAuth 2.1 with Bearer tokens\n' +
                  '🌐 **Transport:** Streamable HTTP\n' +
                  '🔄 **Remote Ready:** Fully compatible with remote MCP clients\n\n' +
                  '💡 **Getting Started:**\n' +
                  '1. Test connection with `test_jira_connection`\n' +
                  '2. List projects with `list_projects`\n' +
                  '3. Search or get specific issues\n' +
                  '4. Create new issues as needed'
          }]
        };
      }
    );

    logger.info(`Registered ${6} Jira tools`);
  }

  /**
   * Get the configured MCP server instance
   */
  getMcpServer(): McpServer {
    return this.mcpServer;
  }

  /**
   * Get server information
   */
  getInfo() {
    return {
      name: 'jira-mcp-remote-oauth',
      version: '5.0.0',
      description: 'Remote Jira MCP Server with OAuth Authentication',
      transport: 'streamable-http',
      toolCount: 7,
      jiraBaseUrl: this.jiraClient.getBaseUrl()
    };
  }
}