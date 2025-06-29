#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { JiraApiClient } from './jira-client.js';

/**
 * Configuration schema - properly lazy loaded
 */
export const configSchema = z.object({
  companyUrl: z.string().describe("Your company's Jira URL (e.g., https://company.atlassian.net)"),
  userEmail: z.string().describe("Your work email address"),
  authMethod: z.enum(["oauth", "token"]).default("token").describe("Authentication method"),
  jiraApiToken: z.string().optional().describe("Jira API Token from https://id.atlassian.com/manage-profile/security/api-tokens")
});

export type Config = z.infer<typeof configSchema>;

/**
 * Jira MCP Server with Proper Lazy Loading
 * - Starts without configuration
 * - Lists tools without configuration
 * - Only requires config when tools are executed
 */
class LazyJiraMCPServer {
  private server: McpServer;
  private jiraClient: JiraApiClient | null = null;
  private config: Config | null = null;
  private isInitialized = false;

  constructor() {
    this.server = new McpServer({
      name: 'jira-mcp-sprinthealth',
      version: '4.0.0',
    });

    this.setupTools();
  }

  /**
   * Initialize Jira client only when needed
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
   * Set configuration - called by MCP runtime
   */
  setConfig(config: Config): void {
    this.config = config;
    this.isInitialized = false; // Reset initialization
    this.jiraClient = null;
  }

  /**
   * Setup all tools with lazy loading
   */
  private setupTools(): void {
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
                  '1. **test_jira_connection** - Test authenticated connection\n' +
                  '2. **jira_get_issue** - Get detailed issue information\n' +
                  '3. **jira_search** - Search issues with JQL\n' +
                  '4. **list_projects** - List accessible projects\n' +
                  '5. **help** - This help guide\n\n' +
                  '🔧 **Configuration Required:**\n' +
                  'Before using Jira tools, ensure your configuration includes:\n' +
                  '• companyUrl: Your Jira instance URL\n' +
                  '• userEmail: Your email address\n' +
                  '• jiraApiToken: API token from Atlassian\n\n' +
                  '🔄 **All tools use lazy loading - no configuration needed to see this list!**'
          }]
        };
      }
    );
  }

  /**
   * Get the MCP server instance
   */
  getServer(): McpServer {
    return this.server;
  }
}

// Export for use as a module
export function createLazyServer(): McpServer {
  const lazyServer = new LazyJiraMCPServer();
  return lazyServer.getServer();
}

// Direct execution mode (CommonJS compatible)
try {
  const isMainModule = typeof require !== 'undefined' && require.main === module;
  if (isMainModule) {
    const lazyServer = new LazyJiraMCPServer();
    const transport = new StdioServerTransport();
    
    lazyServer.getServer().connect(transport).catch((error) => {
      console.error('Failed to start MCP server:', error);
      process.exit(1);
    });
  }
} catch (error) {
  // Fallback detection
  if (process.argv[1] && process.argv[1].includes('server-lazy')) {
    const lazyServer = new LazyJiraMCPServer();
    const transport = new StdioServerTransport();
    
    lazyServer.getServer().connect(transport).catch((error) => {
      console.error('Failed to start MCP server:', error);
      process.exit(1);
    });
  }
}
