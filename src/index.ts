#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import { z } from 'zod';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Jira MCP Server with OAuth Helper
 * Solves the "how do users get API tokens" problem
 */

// Environment configuration schema
const ConfigSchema = z.object({
  JIRA_URL: z.string().optional(),
  JIRA_EMAIL: z.string().optional(), 
  JIRA_API_TOKEN: z.string().optional(),
});

class JiraMCPServer {
  private server: Server;
  private jiraClient: any = null;
  private config: z.infer<typeof ConfigSchema> = {};
  private isAuthenticated = false;

  constructor() {
    this.server = new Server(
      {
        name: 'jira-mcp-sprinthealth',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
    this.loadConfig();
  }

  private loadConfig(): void {
    try {
      this.config = ConfigSchema.parse({
        JIRA_URL: process.env.JIRA_URL,
        JIRA_EMAIL: process.env.JIRA_EMAIL,
        JIRA_API_TOKEN: process.env.JIRA_API_TOKEN,
      });
    } catch (error) {
      // Config validation will happen lazily when needed
      console.error('Configuration loading deferred to lazy loading');
    }
  }

  /**
   * Lazy authentication - only authenticate when actually needed
   */
  private async ensureAuthenticated(): Promise<void> {
    if (this.isAuthenticated && this.jiraClient) {
      return;
    }

    // Check if we have basic config
    if (!this.config.JIRA_URL || !this.config.JIRA_EMAIL || !this.config.JIRA_API_TOKEN) {
      throw new McpError(
        ErrorCode.InvalidParams,
        '🔧 **Setup Required**\n\n' +
        'Please set these environment variables:\n' +
        '• JIRA_URL=https://your-company.atlassian.net\n' +
        '• JIRA_EMAIL=your@email.com\n' +
        '• JIRA_API_TOKEN=your_api_token\n\n' +
        '💡 **Need help getting an API token?** Use the `jira_oauth_helper` tool!'
      );
    }

    // Create Jira client with API token authentication
    this.jiraClient = axios.create({
      baseURL: this.config.JIRA_URL,
      headers: {
        'Authorization': `Basic ${Buffer.from(`${this.config.JIRA_EMAIL}:${this.config.JIRA_API_TOKEN}`).toString('base64')}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    // Test the connection
    try {
      await this.jiraClient.get('/rest/api/3/myself');
      this.isAuthenticated = true;
      console.error('✅ Jira authentication successful');
    } catch (error) {
      this.isAuthenticated = false;
      throw new McpError(
        ErrorCode.InternalError,
        `❌ **Authentication Failed**\n\n${error instanceof Error ? error.message : 'Unknown error'}\n\n💡 Check your credentials or use \`jira_oauth_helper\` for assistance.`
      );
    }
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'help',
          description: 'Get help and information about available Jira tools',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'jira_oauth_helper',
          description: '🚀 Get your Jira API token easily! Opens browser to help you get authenticated.',
          inputSchema: {
            type: 'object',
            properties: {
              action: {
                type: 'string',
                enum: ['guide', 'open_token_page', 'test_setup', 'auto_detect'],
                description: 'Choose: guide (instructions), open_token_page (opens browser), test_setup (validate config), auto_detect (find Jira URL)',
                default: 'guide'
              },
              jira_domain: {
                type: 'string',
                description: 'Your company Jira domain (e.g., "acme-corp" for acme-corp.atlassian.net)',
              }
            },
          },
        },
        {
          name: 'test_jira_connection',
          description: 'Test connection to Jira instance and verify credentials',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'jira_get_issue',
          description: 'Get details of a specific Jira issue',
          inputSchema: {
            type: 'object',
            properties: {
              issueKey: {
                type: 'string',
                description: 'Jira issue key (e.g., "PROJ-123")',
              },
            },
            required: ['issueKey'],
          },
        },
        {
          name: 'jira_search',
          description: 'Search Jira issues using JQL',
          inputSchema: {
            type: 'object',
            properties: {
              jql: {
                type: 'string',
                description: 'JQL query string (e.g., "project = PROJ AND status = Open")',
              },
              maxResults: {
                type: 'number',
                description: 'Maximum number of results to return',
                default: 10,
              },
            },
            required: ['jql'],
          },
        },
        {
          name: 'list_projects',
          description: 'List all accessible Jira projects',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'help':
            return await this.handleHelp();
          
          case 'jira_oauth_helper':
            return await this.handleOAuthHelper(args?.action || 'guide', args?.jira_domain);
          
          case 'test_jira_connection':
            return await this.handleTestConnection();
          
          case 'jira_get_issue':
            return await this.handleGetIssue(args?.issueKey);
          
          case 'jira_search':
            return await this.handleSearchIssues(args?.jql, args?.maxResults);
          
          case 'list_projects':
            return await this.handleListProjects();
          
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(ErrorCode.InternalError, `Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    });
  }

  /**
   * Help tool - works without authentication
   */
  private async handleHelp() {
    return {
      content: [
        {
          type: 'text',
          text: '🚀 **Jira MCP Server - Help Guide**\n\n' +
                '📋 **Available Tools:**\n\n' +
                '• **help** - This help guide (no auth needed)\n' +
                '• **jira_oauth_helper** - 🎯 **Start here!** Get your API token easily\n' +
                '• **test_jira_connection** - Test your Jira connection\n' +
                '• **jira_get_issue** - Get detailed issue information\n' +
                '• **jira_search** - Search issues with JQL queries\n' +
                '• **list_projects** - List accessible projects\n\n' +
                '🎯 **Quick Start (2 minutes):**\n' +
                '1. Use `jira_oauth_helper` - it will guide you step-by-step\n' +
                '2. Use `test_jira_connection` to verify everything works\n' +
                '3. Start using Jira tools!\n\n' +
                '💡 **New to Jira API?** The oauth helper makes it super easy - no technical knowledge required!'
        }
      ]
    };
  }

  /**
   * OAuth/Token helper - solves the token discovery problem
   */
  private async handleOAuthHelper(action: string, jiraDomain?: string) {
    switch (action) {
      case 'guide':
        return {
          content: [
            {
              type: 'text',
              text: '🚀 **Easy Jira Setup Guide** (2 minutes)\n\n' +
                    '## 🎯 **Step 1: Get Your API Token**\n' +
                    '**Option A: Let me open the page for you**\n' +
                    '• Use `jira_oauth_helper action="open_token_page"`\n' +
                    '• I\'ll open the Atlassian token page in your browser\n\n' +
                    '**Option B: Manual (if browser doesn\'t open)**\n' +
                    '• Go to: https://id.atlassian.com/manage-profile/security/api-tokens\n' +
                    '• Click "Create API token"\n' +
                    '• Name it: "Claude MCP"\n' +
                    '• Copy the token (you only see it once!)\n\n' +
                    '## 🔧 **Step 2: Find Your Jira URL**\n' +
                    '**Need help?** Use `jira_oauth_helper action="auto_detect" jira_domain="your-company"`\n' +
                    '• Your URL format: https://YOUR-COMPANY.atlassian.net\n' +
                    '• Example: https://acme-corp.atlassian.net\n\n' +
                    '## ⚙️ **Step 3: Set Environment Variables**\n' +
                    '**Windows:**\n' +
                    '```cmd\n' +
                    'set JIRA_URL=https://your-company.atlassian.net\n' +
                    'set JIRA_EMAIL=your@email.com\n' +
                    'set JIRA_API_TOKEN=your_token_here\n' +
                    '```\n\n' +
                    '**Mac/Linux:**\n' +
                    '```bash\n' +
                    'export JIRA_URL="https://your-company.atlassian.net"\n' +
                    'export JIRA_EMAIL="your@email.com"\n' +
                    'export JIRA_API_TOKEN="your_token_here"\n' +
                    '```\n\n' +
                    '## ✅ **Step 4: Test**\n' +
                    '• Restart Claude Desktop/Cursor\n' +
                    '• Use `test_jira_connection`\n' +
                    '• You should see "✅ Connection Successful!"\n\n' +
                    '🆘 **Need more help?** Use other jira_oauth_helper actions!'
            }
          ]
        };

      case 'open_token_page':
        try {
          const tokenUrl = 'https://id.atlassian.com/manage-profile/security/api-tokens';
          await this.openBrowser(tokenUrl);
          
          return {
            content: [
              {
                type: 'text',
                text: '🌐 **Opening Atlassian API Token Page...**\n\n' +
                      '✅ **Browser should open to:** https://id.atlassian.com/manage-profile/security/api-tokens\n\n' +
                      '**In the browser:**\n' +
                      '1. Log in to your Atlassian account\n' +
                      '2. Click "Create API token"\n' +
                      '3. Name it: "Claude MCP Server"\n' +
                      '4. Click "Create"\n' +
                      '5. **COPY THE TOKEN** (you only see it once!)\n\n' +
                      '**Next steps:**\n' +
                      '• Set your environment variables with the token\n' +
                      '• Use `jira_oauth_helper action="test_setup"` to verify\n\n' +
                      '❌ **Browser didn\'t open?** Copy this URL manually:\n' +
                      'https://id.atlassian.com/manage-profile/security/api-tokens'
              }
            ]
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: '❌ **Could not open browser automatically**\n\n' +
                      '**Please open this URL manually:**\n' +
                      'https://id.atlassian.com/manage-profile/security/api-tokens\n\n' +
                      '**Then follow these steps:**\n' +
                      '1. Log in to your Atlassian account\n' +
                      '2. Click "Create API token"\n' +
                      '3. Name it: "Claude MCP"\n' +
                      '4. Copy the generated token\n\n' +
                      `**Error details:** ${error instanceof Error ? error.message : 'Unknown error'}`
              }
            ]
          };
        }

      case 'auto_detect':
        if (!jiraDomain) {
          return {
            content: [
              {
                type: 'text',
                text: '🔍 **Auto-detect Jira URL**\n\n' +
                      '**Usage:** `jira_oauth_helper action="auto_detect" jira_domain="your-company"`\n\n' +
                      '**Examples:**\n' +
                      '• If your Jira is at acme-corp.atlassian.net → use "acme-corp"\n' +
                      '• If your Jira is at mycompany.atlassian.net → use "mycompany"\n\n' +
                      '**Don\'t know your domain?**\n' +
                      '• Check your bookmarks for a .atlassian.net URL\n' +
                      '• Ask your IT team for your "Jira URL"\n' +
                      '• Look at any Jira email notifications you\'ve received'
              }
            ]
          };
        }

        const detectedUrl = `https://${jiraDomain}.atlassian.net`;
        try {
          // Try to detect if this Jira instance exists
          const response = await axios.get(`${detectedUrl}/rest/api/3/serverInfo`, { timeout: 5000 });
          
          return {
            content: [
              {
                type: 'text',
                text: `✅ **Jira Instance Found!**\n\n` +
                      `**Detected URL:** ${detectedUrl}\n` +
                      `**Server Info:** ${response.data.serverTitle || 'Jira'}\n` +
                      `**Version:** ${response.data.version}\n\n` +
                      '**Your environment variable:**\n' +
                      `JIRA_URL=${detectedUrl}\n\n` +
                      '**Next steps:**\n' +
                      '1. Use this URL in your environment variables\n' +
                      '2. Get your API token with `jira_oauth_helper action="open_token_page"`\n' +
                      '3. Test with `test_jira_connection`'
              }
            ]
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `❌ **Could not detect Jira at ${detectedUrl}**\n\n` +
                      '**Possible reasons:**\n' +
                      '• Wrong domain name\n' +
                      '• Your company uses a custom domain\n' +
                      '• Network/firewall blocking access\n\n' +
                      '**Try these:**\n' +
                      '• Double-check the domain spelling\n' +
                      '• Ask your IT team for the exact Jira URL\n' +
                      '• Look for .atlassian.net URLs in your browser history\n' +
                      '• Try accessing Jira in your browser first'
            }
          ]
        };
        }

      case 'test_setup':
        const currentConfig = {
          JIRA_URL: process.env.JIRA_URL,
          JIRA_EMAIL: process.env.JIRA_EMAIL,
          JIRA_API_TOKEN: process.env.JIRA_API_TOKEN ? '***' + process.env.JIRA_API_TOKEN.slice(-4) : undefined
        };

        const missing = [];
        if (!process.env.JIRA_URL) missing.push('JIRA_URL');
        if (!process.env.JIRA_EMAIL) missing.push('JIRA_EMAIL');
        if (!process.env.JIRA_API_TOKEN) missing.push('JIRA_API_TOKEN');

        if (missing.length > 0) {
          return {
            content: [
              {
                type: 'text',
                text: `🔧 **Setup Incomplete**\n\n` +
                      `**Missing:** ${missing.join(', ')}\n\n` +
                      `**Current config:**\n` +
                      `• JIRA_URL: ${currentConfig.JIRA_URL || '❌ Not set'}\n` +
                      `• JIRA_EMAIL: ${currentConfig.JIRA_EMAIL || '❌ Not set'}\n` +
                      `• JIRA_API_TOKEN: ${currentConfig.JIRA_API_TOKEN || '❌ Not set'}\n\n` +
                      '**Next steps:**\n' +
                      '1. Set the missing environment variables\n' +
                      '2. Restart your MCP client (Claude Desktop/Cursor)\n' +
                      '3. Try `test_jira_connection`\n\n' +
                      '💡 **Need help?** Use `jira_oauth_helper action="guide"`'
              }
            ]
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: `✅ **Configuration Looks Good!**\n\n` +
                    `**Current setup:**\n` +
                    `• JIRA_URL: ${currentConfig.JIRA_URL}\n` +
                    `• JIRA_EMAIL: ${currentConfig.JIRA_EMAIL}\n` +
                    `• JIRA_API_TOKEN: ${currentConfig.JIRA_API_TOKEN}\n\n` +
                    '**Ready to test!**\n' +
                    '• Use `test_jira_connection` to verify authentication\n' +
                    '• If successful, you can start using all Jira tools!\n\n' +
                    '🚀 **Try these next:**\n' +
                    '• `list_projects` - See your accessible projects\n' +
                    '• `jira_search jql="assignee = currentUser()"` - Your assigned issues'
            }
          ]
        };

      default:
        return {
          content: [
            {
              type: 'text',
              text: `❌ Unknown action: ${action}\n\nAvailable actions: guide, open_token_page, test_setup, auto_detect`
            }
          ]
        };
    }
  }

  /**
   * Opens URL in system browser (cross-platform)
   */
  private async openBrowser(url: string): Promise<void> {
    const platform = os.platform();
    let command: string;
    let args: string[];

    switch (platform) {
      case 'darwin':
        command = 'open';
        args = [url];
        break;
      case 'win32':
        command = 'start';
        args = ['', url];
        break;
      default:
        command = 'xdg-open';
        args = [url];
        break;
    }

    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { 
        detached: true, 
        stdio: 'ignore' 
      });
      
      child.on('error', reject);
      child.on('spawn', () => {
        child.unref();
        resolve();
      });
    });
  }

  /**
   * Test Jira connection
   */
  private async handleTestConnection() {
    try {
      await this.ensureAuthenticated();
      
      // Get user info to verify connection
      const response = await this.jiraClient.get('/rest/api/3/myself');
      const user = response.data;
      
      return {
        content: [
          {
            type: 'text',
            text: '✅ **Jira Connection Successful!**\n\n' +
                  `🔗 **Connected to:** ${this.config.JIRA_URL}\n` +
                  `👤 **Authenticated as:** ${user.displayName} (${user.emailAddress})\n` +
                  `🔑 **Account Type:** ${user.accountType}\n` +
                  `🆔 **Account ID:** ${user.accountId}\n\n` +
                  '🚀 **Ready for Jira operations!** You can now use:\n' +
                  '• `jira_get_issue` - Get issue details\n' +
                  '• `jira_search` - Search with JQL\n' +
                  '• `list_projects` - View your projects'
          }
        ]
      };
    } catch (error) {
      if (error instanceof McpError) {
        throw error;
      }
      
      return {
        content: [
          {
            type: 'text',
            text: '❌ **Connection Test Failed**\n\n' +
                  `Error: ${error instanceof Error ? error.message : 'Unknown error'}\n\n` +
                  '💡 **Need help?** Use `jira_oauth_helper` for setup assistance.'
          }
        ]
      };
    }
  }

  /**
   * Get Jira issue details
   */
  private async handleGetIssue(issueKey: string) {
    if (!issueKey) {
      throw new McpError(ErrorCode.InvalidParams, 'Issue key is required');
    }

    await this.ensureAuthenticated();
    
    try {
      const response = await this.jiraClient.get(`/rest/api/3/issue/${issueKey}`);
      const issue = response.data;
      
      return {
        content: [
          {
            type: 'text',
            text: `📋 **Issue Details: ${issueKey}**\n\n` +
                  `**Title:** ${issue.fields.summary}\n` +
                  `**Status:** ${issue.fields.status.name}\n` +
                  `**Type:** ${issue.fields.issuetype.name}\n` +
                  `**Priority:** ${issue.fields.priority?.name || 'None'}\n` +
                  `**Reporter:** ${issue.fields.reporter?.displayName || 'Unknown'}\n` +
                  `**Assignee:** ${issue.fields.assignee?.displayName || 'Unassigned'}\n` +
                  `**Project:** ${issue.fields.project.name} (${issue.fields.project.key})\n` +
                  `**Created:** ${new Date(issue.fields.created).toLocaleDateString()}\n` +
                  `**Updated:** ${new Date(issue.fields.updated).toLocaleDateString()}\n\n` +
                  `**Description:**\n${issue.fields.description || 'No description'}\n\n` +
                  `**Issue URL:** [${issueKey}](${this.config.JIRA_URL}/browse/${issueKey})`
          }
        ]
      };
    } catch (error: any) {
      if (error.response?.status === 404) {
        throw new McpError(ErrorCode.InvalidParams, `Issue "${issueKey}" not found. Check the issue key and your permissions.`);
      }
      throw new McpError(ErrorCode.InternalError, `Failed to get issue: ${error.message}`);
    }
  }

  /**
   * Search Jira issues with JQL
   */
  private async handleSearchIssues(jql: string, maxResults: number = 10) {
    if (!jql) {
      throw new McpError(ErrorCode.InvalidParams, 'JQL query is required');
    }

    await this.ensureAuthenticated();
    
    try {
      const response = await this.jiraClient.get('/rest/api/3/search', {
        params: {
          jql,
          maxResults,
          fields: 'summary,status,assignee,reporter,priority,created,updated'
        }
      });
      
      const { issues, total } = response.data;
      
      if (issues.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `🔍 **Search Results**\n\n` +
                    `**Query:** ${jql}\n` +
                    `**Results:** No issues found\n\n` +
                    '💡 **Try adjusting your JQL query.** Examples:\n' +
                    '• `project = PROJ AND status = "Open"`\n' +
                    '• `assignee = currentUser() AND status != "Done"`\n' +
                    '• `created >= -7d AND priority = "High"`'
            }
          ]
        };
      }

      const issueList = issues.map((issue: any) => 
        `• **${issue.key}** - ${issue.fields.summary}\n` +
        `  └ Status: ${issue.fields.status.name} | ` +
        `Assignee: ${issue.fields.assignee?.displayName || 'Unassigned'}`
      ).join('\n');

      return {
        content: [
          {
            type: 'text',
            text: `🔍 **Search Results**\n\n` +
                  `**Query:** ${jql}\n` +
                  `**Found:** ${total} total issues (showing ${issues.length})\n\n` +
                  `**Issues:**\n${issueList}\n\n` +
                  '💡 Use `jira_get_issue` with any issue key for full details.'
          }
        ]
      };
    } catch (error: any) {
      if (error.response?.status === 400) {
        throw new McpError(ErrorCode.InvalidParams, `Invalid JQL query: ${error.response.data.errorMessages?.[0] || 'Syntax error'}`);
      }
      throw new McpError(ErrorCode.InternalError, `Search failed: ${error.message}`);
    }
  }

  /**
   * List accessible projects
   */
  private async handleListProjects() {
    await this.ensureAuthenticated();
    
    try {
      const response = await this.jiraClient.get('/rest/api/3/project/search', {
        params: {
          maxResults: 100,
          orderBy: 'name'
        }
      });
      
      const projects = response.data.values;
      
      if (projects.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: '📋 **No Projects Found**\n\n' +
                    'You don\'t have access to any Jira projects.\n\n' +
                    '💡 **Contact your Jira administrator** to get project access.'
            }
          ]
        };
      }

      const projectList = projects.map((project: any) => 
        `• **${project.key}** - ${project.name}\n` +
        `  └ Type: ${project.projectTypeKey} | ` +
        `Lead: ${project.lead?.displayName || 'Unknown'}`
      ).join('\n');

      return {
        content: [
          {
            type: 'text',
            text: `📋 **Accessible Projects**\n\n` +
                  `**Found:** ${projects.length} projects\n\n` +
                  `**Projects:**\n${projectList}\n\n` +
                  '💡 **Usage Examples:**\n' +
                  '• Search project issues: `jira_search jql="project = PROJ"`\n' +
                  '• Find open issues: `jira_search jql="project = PROJ AND status = Open"`\n' +
                  '• Your recent issues: `jira_search jql="assignee = currentUser()"`'
          }
        ]
      };
    } catch (error: any) {
      throw new McpError(ErrorCode.InternalError, `Failed to list projects: ${error.message}`);
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Jira MCP Server running on stdio');
  }
}

const server = new JiraMCPServer();
server.run().catch(console.error);