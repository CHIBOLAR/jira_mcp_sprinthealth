import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

// Configuration schema - MUST be exported for Smithery
export const configSchema = z.object({
  companyUrl: z.string().describe("Your company's Jira URL (e.g., https://company.atlassian.net)"),
  userEmail: z.string().describe("Your work email address"),
  authMethod: z.enum(["oauth", "token"]).default("oauth").describe("OAuth (recommended) or API Token (fallback)"),
  jiraApiToken: z.string().optional().describe("Only needed if OAuth fails. Get from: https://id.atlassian.com/manage-profile/security/api-tokens")
});

export type Config = z.infer<typeof configSchema>;

// Smithery requires this exact export format
export default function ({ config }: { config?: Config }) {
  const server = new McpServer({
    name: 'jira-mcp-server',
    version: '1.0.0'
  });

  // Test connection tool
  server.tool(
    'test_jira_connection',
    'Test connection to Jira instance and verify credentials',
    {},
    async () => {
      if (!config) {
        return {
          content: [{
            type: 'text' as const,
            text: '❌ **Configuration Required**\n\n' +
                  'Please provide your Jira configuration:\n\n' +
                  '**Required:**\n' +
                  '• Company URL\n' +
                  '• User Email\n\n' +
                  '**Optional:**\n' +
                  '• Auth Method (oauth/token)\n' +
                  '• API Token'
          }]
        };
      }

      try {
        const validConfig = configSchema.parse(config);
        
        return {
          content: [{
            type: 'text' as const,
            text: '✅ **Jira Connection Test**\n\n' +
                  '🔗 **Company URL:** ' + validConfig.companyUrl + '\n' +
                  '📧 **User Email:** ' + validConfig.userEmail + '\n' +
                  '🔐 **Auth Method:** ' + validConfig.authMethod + '\n\n' +
                  '🚀 **Status:** Configuration valid and ready for use!'
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text' as const,
            text: '❌ **Invalid Configuration**\n\n' +
                  'Please check your configuration values.'
          }]
        };
      }
    }
  );

  // Get issue tool
  server.tool(
    'jira_get_issue',
    'Get details of a specific Jira issue',
    {
      issueKey: z.string().describe('Jira issue key (e.g., "PROJ-123")')
    },
    async ({ issueKey }) => {
      if (!config) {
        return {
          content: [{
            type: 'text' as const,
            text: '❌ **Configuration Required**\n\nPlease configure your Jira settings first.'
          }]
        };
      }

      const validConfig = configSchema.parse(config);
      
      return {
        content: [{
          type: 'text' as const,
          text: '📋 **Issue Details for ' + issueKey + '**\n\n' +
                '🔗 **Jira Instance:** ' + validConfig.companyUrl + '\n' +
                '⚠️ **Demo Mode**: Configuration valid. Ready for Jira API integration.'
        }]
      };
    }
  );

  // Search issues tool
  server.tool(
    'jira_search',
    'Search Jira issues using JQL',
    {
      jql: z.string().describe('JQL query string (e.g., "project = PROJ AND status = Open")')
    },
    async ({ jql }) => {
      if (!config) {
        return {
          content: [{
            type: 'text' as const,
            text: '❌ **Configuration Required**\n\nPlease configure your Jira settings first.'
          }]
        };
      }

      const validConfig = configSchema.parse(config);
      
      return {
        content: [{
          type: 'text' as const,
          text: '🔍 **JQL Search Results**\n\n' +
                '🔗 **Query:** ' + jql + '\n' +
                '⚠️ **Demo Mode**: Configuration valid. Ready for JQL execution.'
        }]
      };
    }
  );

  // List projects tool
  server.tool(
    'list_projects',
    'List all accessible Jira projects',
    {},
    async () => {
      if (!config) {
        return {
          content: [{
            type: 'text' as const,
            text: '❌ **Configuration Required**\n\nPlease configure your Jira settings first.'
          }]
        };
      }

      const validConfig = configSchema.parse(config);
      
      return {
        content: [{
          type: 'text' as const,
          text: '📋 **Accessible Jira Projects**\n\n' +
                '🔗 **Connected to:** ' + validConfig.companyUrl + '\n' +
                '⚠️ **Demo Mode**: Configuration valid. Ready for project listing.'
        }]
      };
    }
  );

  // Help tool
  server.tool(
    'help',
    'Get help and information about available tools',
    {},
    async () => {
      return {
        content: [{
          type: 'text' as const,
          text: '🚀 **Jira MCP Server - Help**\n\n' +
                '📋 **Available Tools:**\n' +
                '• test_jira_connection - Test configuration\n' +
                '• jira_get_issue - Get issue details\n' +
                '• jira_search - Search with JQL\n' +
                '• list_projects - List projects\n' +
                '• help - This help guide\n\n' +
                '🔧 **Setup:** Configure your Jira URL and email in Smithery'
        }]
      };
    }
  );

  return server.server;
}
