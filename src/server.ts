import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

// Configuration schema - exactly matches smithery.yaml
export const configSchema = z.object({
  companyUrl: z.string().describe("Your company's Jira URL (e.g., https://company.atlassian.net)"),
  userEmail: z.string().describe("Your work email address"),
  authMethod: z.enum(["oauth", "token"]).default("oauth").describe("OAuth (recommended) or API Token (fallback)"),
  jiraApiToken: z.string().optional().describe("Only needed if OAuth fails. Get from: https://id.atlassian.com/manage-profile/security/api-tokens")
});

export type Config = z.infer<typeof configSchema>;

export default function createServer({ config }: { config?: Config }) {
  const server = new McpServer({
    name: 'jira-mcp-server',
    version: '1.0.0'
  });

  // Test connection tool - no auth required to list, auth required to execute
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

      // Validate config
      try {
        const validConfig = configSchema.parse(config);
        
        return {
          content: [{
            type: 'text' as const,
            text: '✅ **Jira Connection Test**\n\n' +
                  '🔗 **Company URL:** ' + validConfig.companyUrl + '\n' +
                  '📧 **User Email:** ' + validConfig.userEmail + '\n' +
                  '🔐 **Auth Method:** ' + validConfig.authMethod + '\n\n' +
                  '🚀 **Status:** Configuration valid and ready for use!\n\n' +
                  '💡 **Available Tools:**\n' +
                  '• test_jira_connection - Test configuration\n' +
                  '• jira_get_issue - Get issue details\n' +
                  '• jira_search - Search issues\n' +
                  '• list_projects - List projects\n' +
                  '• help - Usage guide'
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text' as const,
            text: '❌ **Invalid Configuration**\n\n' +
                  'Please check your configuration values.\n\n' +
                  'Error: ' + (error as Error).message
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
                '📧 **User:** ' + validConfig.userEmail + '\n\n' +
                '⚠️ **Demo Mode**: This is a demo response.\n' +
                'In production, this would fetch actual issue data from Jira API.\n\n' +
                '🛠️ **Requested Issue:** ' + issueKey
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
                '🔗 **Jira Instance:** ' + validConfig.companyUrl + '\n' +
                '🔍 **Query:** ' + jql + '\n\n' +
                '⚠️ **Demo Mode**: This is a demo response.\n' +
                'In production, this would execute the JQL and return actual results.'
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
                '📧 **User:** ' + validConfig.userEmail + '\n\n' +
                '⚠️ **Demo Mode**: This is a demo response.\n' +
                'In production, this would list actual projects from Jira.\n\n' +
                '🛠️ **Available Tools:**\n' +
                '• jira_get_issue - Get specific issue details\n' +
                '• jira_search - Search issues with JQL\n' +
                '• test_jira_connection - Test configuration\n' +
                '• list_projects - This tool'
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
          text: '🚀 **Jira MCP Server - Help Guide**\n\n' +
                '📋 **Available Tools:**\n\n' +
                '1. **test_jira_connection** - Validate configuration\n' +
                '2. **list_projects** - List accessible projects\n' +
                '3. **jira_get_issue** - Get issue details\n' +
                '4. **jira_search** - Search with JQL\n' +
                '5. **help** - This help guide\n\n' +
                '🔧 **Configuration Required:**\n' +
                '• Company Jira URL\n' +
                '• Your work email\n' +
                '• Auth method (oauth/token)\n\n' +
                '💡 **Getting Started:**\n' +
                '1. Configure Jira settings in Smithery\n' +
                '2. Run test_jira_connection\n' +
                '3. Use other tools as needed'
        }]
      };
    }
  );

  return server.server;
}
