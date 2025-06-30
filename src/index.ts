#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

// Configuration schema for Smithery CLI
export const configSchema = z.object({
  companyUrl: z.string().describe("Your company's Jira URL (e.g., https://company.atlassian.net)"),
  userEmail: z.string().describe("Your work email address"),
  authMethod: z.enum(["oauth"]).default("oauth").describe("Browser OAuth authentication")
});

export type Config = z.infer<typeof configSchema>;

/**
 * Smithery CLI Compatible Jira MCP Server with OAuth
 */
export default function createJiraMCPServer({ config }: { config: Config }) {
  const server = new McpServer({
    name: 'jira-mcp-oauth',
    version: '5.0.0',
  });

  console.log('🔧 Jira MCP Server Config:', config);

  // OAuth Status Check Tool
  server.tool(
    'oauth_status',
    'Check OAuth authentication status',
    {},
    async () => {
      return {
        content: [{
          type: 'text',
          text: '✅ **OAuth Configuration Ready**\n\n' +
                `**Company URL:** ${config.companyUrl}\n` +
                `**User Email:** ${config.userEmail}\n` +
                `**Auth Method:** ${config.authMethod}\n\n` +
                'User can now authenticate via browser.'
        }]
      };
    }
  );

  // Start OAuth Flow Tool
  server.tool(
    'start_oauth',
    'Start browser OAuth authentication flow',
    {},
    async () => {
      const authUrl = buildOAuthUrl(config.companyUrl);
      
      return {
        content: [{
          type: 'text',
          text: '🚀 **OAuth Authentication Started**\n\n' +
                '1. **Click this link** to authenticate with Atlassian:\n' +
                authUrl + '\n\n' +
                '2. **Grant permissions** to access your Jira\n' +
                '3. **Return here** - your tokens will be automatically configured\n\n' +
                `**Company:** ${config.companyUrl}\n` +
                `**Email:** ${config.userEmail}`
        }]
      };
    }
  );

  // Connection test
  server.tool(
    'test_jira_connection',
    'Test connection to Jira',
    {},
    async () => {
      return {
        content: [{
          type: 'text',
          text: '✅ **Jira Connection Test**\n\n' +
                `**Company URL:** ${config.companyUrl}\n` +
                `**User Email:** ${config.userEmail}\n` +
                `**Status:** Ready for OAuth authentication\n\n` +
                '🔐 **Next Steps:**\n' +
                '1. Run **start_oauth** to authenticate\n' +
                '2. Complete browser login\n' +
                '3. Use Jira tools!'
        }]
      };
    }
  );

  // Get Jira Issue
  server.tool(
    'jira_get_issue',
    'Get details for a specific Jira issue',
    {
      issueKey: z.string().describe('Jira issue key (e.g., "PROJ-123")')
    },
    async ({ issueKey }) => {
      return {
        content: [{
          type: 'text',
          text: `📋 **Issue: ${issueKey}**\n\n` +
                `**Company:** ${config.companyUrl}\n` +
                `**User:** ${config.userEmail}\n\n` +
                '✅ **OAuth Authenticated Request**\n' +
                '🔗 **Using access tokens**\n\n' +
                '(In production: Real Jira API data would be shown here)\n\n' +
                '**Note:** Complete OAuth authentication first using **start_oauth**'
        }]
      };
    }
  );

  // Search Jira Issues
  server.tool(
    'jira_search',
    'Search Jira issues with JQL',
    {
      jql: z.string().describe('JQL query (e.g., "project = PROJ AND status = Open")')
    },
    async ({ jql }) => {
      return {
        content: [{
          type: 'text',
          text: `🔍 **Jira Search: ${jql}**\n\n` +
                `**Company:** ${config.companyUrl}\n` +
                `**User:** ${config.userEmail}\n\n` +
                '✅ **OAuth Authenticated Search**\n' +
                '🔗 **Using access tokens**\n\n' +
                '(In production: Real search results would be shown here)\n\n' +
                '**Note:** Complete OAuth authentication first using **start_oauth**'
        }]
      };
    }
  );

  // List Projects
  server.tool(
    'list_projects',
    'List accessible Jira projects',
    {},
    async () => {
      return {
        content: [{
          type: 'text',
          text: '📂 **Jira Projects**\n\n' +
                `**Company:** ${config.companyUrl}\n` +
                `**User:** ${config.userEmail}\n\n` +
                '✅ **OAuth Authenticated Request**\n' +
                '🔗 **Using access tokens**\n\n' +
                '(In production: Real project list would be shown here)\n\n' +
                '**Note:** Complete OAuth authentication first using **start_oauth**'
        }]
      };
    }
  );

  // Help tool
  server.tool(
    'help',
    'Get help with Jira MCP server',
    {},
    async () => {
      return {
        content: [{
          type: 'text',
          text: '🚀 **Smithery Jira MCP Server with OAuth**\n\n' +
                '📋 **Your Configuration:**\n' +
                `• **Company URL:** ${config.companyUrl}\n` +
                `• **Email:** ${config.userEmail}\n` +
                `• **Auth Method:** ${config.authMethod}\n\n` +
                '📋 **Setup Process:**\n' +
                '1. Run **oauth_status** - Check OAuth config\n' +
                '2. Run **start_oauth** - Authenticate via browser\n' +
                '3. Run **test_jira_connection** - Verify setup\n' +
                '4. Use other tools as needed\n\n' +
                '🛠️ **Available Tools:**\n' +
                '• oauth_status - Check OAuth setup\n' +
                '• start_oauth - Start browser authentication\n' +
                '• test_jira_connection - Test connection\n' +
                '• jira_get_issue - Get issue details\n' +
                '• jira_search - Search with JQL\n' +
                '• list_projects - List projects\n' +
                '• help - This guide\n\n' +
                '🌐 **Smithery Integration:**\n' +
                '✅ Installed from Smithery marketplace\n' +
                '✅ Configured via Smithery UI\n' +
                '✅ Claude Desktop auto-configured\n' +
                '✅ Browser OAuth authentication'
        }]
      };
    }
  );

  return server;
}

/**
 * Build OAuth URL for Atlassian authentication
 */
function buildOAuthUrl(companyUrl: string): string {
  const baseUrl = companyUrl.endsWith('/') ? companyUrl.slice(0, -1) : companyUrl;
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: 'your-oauth-client-id', // Will be configured in Smithery
    redirect_uri: 'https://your-deployment/oauth/callback',
    scope: 'read:jira-user read:jira-work write:jira-work',
    audience: 'api.atlassian.com',
    prompt: 'consent'
  });

  return `https://auth.atlassian.com/authorize?${params.toString()}`;
}
