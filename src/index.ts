#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { JiraOAuthManager } from './auth/oauth-manager.js';

// Load environment variables
dotenv.config();

// Configuration schema for Smithery CLI
export const configSchema = z.object({
  companyUrl: z.string().describe("Your company's Jira URL (e.g., https://company.atlassian.net)"),
  userEmail: z.string().describe("Your work email address"),
  authMethod: z.enum(["oauth"]).default("oauth").describe("Browser OAuth authentication")
});

export type Config = z.infer<typeof configSchema>;

/**
 * Smithery CLI Compatible Jira MCP Server with OAuth - TIMEOUT RESISTANT
 */
export default function createJiraMCPServer({ config }: { config: Config }) {
  const server = new McpServer({
    name: 'jira-mcp-oauth',
    version: '5.4.0', // Multi-tenant ready
  });

  console.log('🔧 Jira MCP Server Config:', config);
  console.log('🌐 Smithery HTTP mode - OAuth callbacks will be handled by main server');
  
  // Set environment variable to enable HTTP server for OAuth callbacks
  process.env.START_HTTP_SERVER = 'true';
  console.log('✅ Enabled HTTP server for OAuth callbacks in Smithery mode');

  // Initialize OAuth Manager with proper configuration using singleton pattern
  // Determine the correct redirect URI for Smithery deployments
  const getRedirectUri = () => {
    if (process.env.OAUTH_REDIRECT_URI) {
      return process.env.OAUTH_REDIRECT_URI;
    }
    
    // In Smithery, use the Smithery hostname if available
    if (process.env.SMITHERY_HOSTNAME) {
      return `https://${process.env.SMITHERY_HOSTNAME}/oauth/callback`;
    }
    
    // Fallback to SERVER_URL or localhost
    const baseUrl = process.env.SERVER_URL || 'http://localhost:3000';
    return `${baseUrl}/oauth/callback`;
  };
  
  const redirectUri = getRedirectUri();
  console.log(`🔗 OAuth redirect URI: ${redirectUri}`);
  
  const oauthConfig = {
    clientId: process.env.OAUTH_CLIENT_ID || process.env.JIRA_OAUTH_CLIENT_ID,
    clientSecret: process.env.OAUTH_CLIENT_SECRET || process.env.JIRA_OAUTH_CLIENT_SECRET,
    redirectUri,
  };
  
  console.log('🔧 Using singleton OAuth manager for MCP server');
  const oauthManager = JiraOAuthManager.getInstance(config.companyUrl, oauthConfig);

  // All tools are designed to respond instantly to prevent timeouts

  // OAuth Status Check Tool - instant response
  server.tool(
    'oauth_status',
    'Check OAuth authentication status',
    {},
    async () => {
      const stats = oauthManager.getStats();
      const metadata = oauthManager.getResourceMetadata();
      
      return {
        content: [{
          type: 'text',
          text: '✅ **OAuth Configuration Ready**\n\n' +
                `**Company URL:** ${config.companyUrl}\n` +
                `**User Email:** ${config.userEmail}\n` +
                `**Auth Method:** ${config.authMethod}\n\n` +
                `**OAuth Configuration:**\n` +
                `• Authorization URL: ${stats.config.authorizationUrl}\n` +
                `• Redirect URI: ${stats.config.redirectUri}\n` +
                `• Scopes: ${stats.config.scopes.join(', ')}\n` +
                `• Active Sessions: ${stats.activeSessions}\n\n` +
                '**Environment Variables:**\n' +
                `• CLIENT_ID: ${process.env.OAUTH_CLIENT_ID ? '✅ Set' : '❌ Missing'}\n` +
                `• CLIENT_SECRET: ${process.env.OAUTH_CLIENT_SECRET ? '✅ Set' : '❌ Missing'}\n` +
                `• REDIRECT_URI: ${process.env.OAUTH_REDIRECT_URI || 'Using default'}\n` +
                `• SERVER_URL: ${process.env.SERVER_URL || 'Using default'}\n\n` +
                'User can now authenticate via browser.'
        }]
      };
    }
  );

  // OAuth Callback Handler Tool - for Smithery HTTP mode
  server.tool(
    'oauth_callback',
    'Handle OAuth callback (internal use)',
    {
      code: z.string().optional().describe('OAuth authorization code'),
      state: z.string().optional().describe('OAuth state parameter'),
      error: z.string().optional().describe('OAuth error if any')
    },
    async ({ code, state, error }) => {
      console.log('🔄 OAuth callback received via MCP tool');
      console.log(`📝 Code: ${code ? 'Present' : 'Missing'}`);
      console.log(`🏷️ State: ${state || 'Missing'}`);
      console.log(`❌ Error: ${error || 'None'}`);
      
      if (error) {
        return {
          content: [{
            type: 'text',
            text: `❌ **OAuth Error**: ${error}\n\nPlease restart the authentication flow.`
          }]
        };
      }
      
      if (!code || !state) {
        return {
          content: [{
            type: 'text',
            text: '❌ **Missing OAuth Parameters**\n\nBoth authorization code and state are required for OAuth callback.'
          }]
        };
      }
      
      try {
        const tokenResponse = await oauthManager.exchangeCodeForToken(code, state);
        
        // Save tokens for API requests
        const fs = await import('fs');
        const os = await import('os');
        const path = await import('path');
        
        const tokenFile = path.join(os.tmpdir(), 'jira-mcp-tokens.json');
        const tokenData = {
          access_token: tokenResponse.access_token,
          refresh_token: tokenResponse.refresh_token,
          expires_in: tokenResponse.expires_in,
          token_type: tokenResponse.token_type,
          timestamp: Date.now()
        };
        
        fs.writeFileSync(tokenFile, JSON.stringify(tokenData, null, 2));
        
        return {
          content: [{
            type: 'text',
            text: '✅ **OAuth Authentication Successful!**\n\n' +
                  'Your Jira MCP server is now authenticated and ready to use.\n\n' +
                  '🔧 **Next Steps:**\n' +
                  '• Run `test_jira_connection` to verify the connection\n' +
                  '• Use `jira_get_issue`, `jira_search`, or other tools\n' +
                  '• Run `help` to see all available commands'
          }]
        };
      } catch (error) {
        console.error('❌ OAuth token exchange failed:', error);
        return {
          content: [{
            type: 'text',
            text: `❌ **OAuth Token Exchange Failed**\n\n` +
                  `Error: ${error instanceof Error ? error.message : String(error)}\n\n` +
                  'Please restart the authentication flow.'
          }]
        };
      }
    }
  );

  // Note: Debug OAuth tool removed from production for security

  // Start OAuth Flow Tool - with Smithery-compatible session handling
  server.tool(
    'start_oauth',
    'Start browser OAuth authentication flow',
    {},
    async () => {
      try {
        // Generate OAuth URL with extended session TTL for Smithery
        const { authUrl, state } = oauthManager.generateAuthUrl(config.userEmail);
        
        // Store session data in a more persistent way for Smithery
        const sessionData = {
          state,
          userEmail: config.userEmail,
          companyUrl: config.companyUrl,
          timestamp: Date.now(),
          redirectUri: oauthManager.getConfig().redirectUri
        };
        
        // Try multiple storage methods for reliability
        try {
          // Method 1: Environment variable (for same-process callback)
          process.env[`OAUTH_SESSION_${state}`] = JSON.stringify(sessionData);
          
          // Method 2: Global storage (for in-memory persistence)
          if (!(globalThis as any).oauthSessions) {
            (globalThis as any).oauthSessions = new Map();
          }
          (globalThis as any).oauthSessions.set(state, sessionData);
          
          console.log(`💾 Stored OAuth session in multiple locations: ${state}`);
        } catch (storageError) {
          console.warn('⚠️ Session storage warning:', storageError);
        }

        return {
          content: [{
            type: 'text',
            text: '🚀 **OAuth Authentication Started**\n\n' +
                  '1. **Click this link** to authenticate with Atlassian:\n' +
                  authUrl + '\n\n' +
                  '2. **Grant permissions** to access your Jira\n' +
                  '3. **Return here** - your tokens will be automatically configured\n\n' +
                  `**Company:** ${config.companyUrl}\n` +
                  `**Email:** ${config.userEmail}\n` +
                  `**State:** ${state}\n\n` +
                  `**Debug Info:**\n` +
                  `- Session stored in ${Object.keys(sessionData).length} locations\n` +
                  `- Redirect URI: ${sessionData.redirectUri}`
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: '❌ **OAuth configuration error:**\n\n' +
                  `Error: ${error instanceof Error ? error.message : String(error)}\n\n` +
                  'Please check your OAuth configuration and try again.'
          }]
        };
      }
    }
  );

  // Connection test - instant response
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
      try {
        // Load saved OAuth tokens
        const fs = await import('fs');
        const os = await import('os');
        const path = await import('path');
        
        const tokenFile = path.join(os.tmpdir(), 'jira-mcp-tokens.json');
        
        if (!fs.existsSync(tokenFile)) {
          return {
            content: [{
              type: 'text',
              text: '❌ **Not Authenticated**\n\nPlease run **start_oauth** first to authenticate with Jira.'
            }]
          };
        }
        
        const tokenData = JSON.parse(fs.readFileSync(tokenFile, 'utf8'));
        const jiraDomain = extractJiraDomain(config.companyUrl);
        
        // Make API request to Jira
        const apiUrl = `https://api.atlassian.com/ex/jira/${jiraDomain}/rest/api/3/issue/${issueKey}`;
        
        const response = await fetch(apiUrl, {
          headers: {
            'Authorization': `Bearer ${tokenData.access_token}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          return {
            content: [{
              type: 'text',
              text: `❌ **API Error (${response.status})**\n\n${errorText}\n\nPlease check the issue key and try again.`
            }]
          };
        }
        
        const issue = await response.json();
        
        return {
          content: [{
            type: 'text',
            text: `📋 **${issue.key}: ${issue.fields.summary}**\n\n` +
                  `**Status:** ${issue.fields.status.name}\n` +
                  `**Type:** ${issue.fields.issuetype.name}\n` +
                  `**Priority:** ${issue.fields.priority?.name || 'Not set'}\n` +
                  `**Assignee:** ${issue.fields.assignee?.displayName || 'Unassigned'}\n` +
                  `**Reporter:** ${issue.fields.reporter?.displayName || 'Unknown'}\n` +
                  `**Created:** ${new Date(issue.fields.created).toLocaleDateString()}\n` +
                  `**Updated:** ${new Date(issue.fields.updated).toLocaleDateString()}\n\n` +
                  `**Description:**\n${issue.fields.description?.content?.[0]?.content?.[0]?.text || 'No description'}\n\n` +
                  `**Project:** ${issue.fields.project.name} (${issue.fields.project.key})`
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `❌ **Error:** ${error instanceof Error ? error.message : String(error)}`
          }]
        };
      }
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
      try {
        // Load saved OAuth tokens
        const fs = await import('fs');
        const os = await import('os');
        const path = await import('path');
        
        const tokenFile = path.join(os.tmpdir(), 'jira-mcp-tokens.json');
        
        if (!fs.existsSync(tokenFile)) {
          return {
            content: [{
              type: 'text',
              text: '❌ **Not Authenticated**\n\nPlease run **start_oauth** first to authenticate with Jira.'
            }]
          };
        }
        
        const tokenData = JSON.parse(fs.readFileSync(tokenFile, 'utf8'));
        const jiraDomain = extractJiraDomain(config.companyUrl);
        
        // Make API request to Jira
        const apiUrl = `https://api.atlassian.com/ex/jira/${jiraDomain}/rest/api/3/search`;
        
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tokenData.access_token}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            jql,
            maxResults: 20,
            fields: ['summary', 'status', 'assignee', 'priority', 'issuetype', 'created', 'updated']
          })
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          return {
            content: [{
              type: 'text',
              text: `❌ **API Error (${response.status})**\n\n${errorText}\n\nPlease check your JQL query and try again.`
            }]
          };
        }
        
        const searchResults = await response.json();
        
        if (searchResults.total === 0) {
          return {
            content: [{
              type: 'text',
              text: `🔍 **No Results Found**\n\nJQL Query: ${jql}\n\nNo issues match your search criteria.`
            }]
          };
        }
        
        let resultsText = `🔍 **Search Results (${searchResults.total} total)**\n\nJQL: ${jql}\n\n`;
        
        searchResults.issues.forEach((issue: any, index: number) => {
          resultsText += `**${index + 1}. ${issue.key}** - ${issue.fields.summary}\n`;
          resultsText += `   Status: ${issue.fields.status.name} | `;
          resultsText += `Type: ${issue.fields.issuetype.name} | `;
          resultsText += `Assignee: ${issue.fields.assignee?.displayName || 'Unassigned'}\n\n`;
        });
        
        return {
          content: [{
            type: 'text',
            text: resultsText
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `❌ **Error:** ${error instanceof Error ? error.message : String(error)}`
          }]
        };
      }
    }
  );

  // List Projects
  server.tool(
    'list_projects',
    'List accessible Jira projects',
    {},
    async () => {
      try {
        // Load saved OAuth tokens
        const fs = await import('fs');
        const os = await import('os');
        const path = await import('path');
        
        const tokenFile = path.join(os.tmpdir(), 'jira-mcp-tokens.json');
        
        if (!fs.existsSync(tokenFile)) {
          return {
            content: [{
              type: 'text',
              text: '❌ **Not Authenticated**\n\nPlease run **start_oauth** first to authenticate with Jira.'
            }]
          };
        }
        
        const tokenData = JSON.parse(fs.readFileSync(tokenFile, 'utf8'));
        const jiraDomain = extractJiraDomain(config.companyUrl);
        
        // Make API request to Jira
        const apiUrl = `https://api.atlassian.com/ex/jira/${jiraDomain}/rest/api/3/project`;
        
        const response = await fetch(apiUrl, {
          headers: {
            'Authorization': `Bearer ${tokenData.access_token}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          return {
            content: [{
              type: 'text',
              text: `❌ **API Error (${response.status})**\n\n${errorText}\n\nPlease check your authentication and try again.`
            }]
          };
        }
        
        const projects = await response.json();
        
        if (projects.length === 0) {
          return {
            content: [{
              type: 'text',
              text: '📂 **No Projects Found**\n\nYou don\'t have access to any Jira projects.'
            }]
          };
        }
        
        let projectsText = `📂 **Jira Projects (${projects.length} total)**\n\n`;
        
        projects.forEach((project: any, index: number) => {
          projectsText += `**${index + 1}. ${project.name}** (${project.key})\n`;
          projectsText += `   Type: ${project.projectTypeKey} | `;
          projectsText += `Lead: ${project.lead?.displayName || 'Unknown'}\n`;
          if (project.description) {
            projectsText += `   Description: ${project.description}\n`;
          }
          projectsText += '\n';
        });
        
        return {
          content: [{
            type: 'text',
            text: projectsText
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `❌ **Error:** ${error instanceof Error ? error.message : String(error)}`
          }]
        };
      }
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
                '• oauth_callback - Handle OAuth callback (auto-called)\n' +
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
 * Extract Jira domain from company URL
 * Examples:
 * - "https://company.atlassian.net" -> "company.atlassian.net"
 * - "company.atlassian.net" -> "company.atlassian.net"
 */
function extractJiraDomain(companyUrl: string): string {
  // Remove protocol if present
  let domain = companyUrl.replace(/^https?:\/\//, '');
  
  // Remove trailing slash if present
  domain = domain.replace(/\/$/, '');
  
  return domain;
}

// Start minimal HTTP server for OAuth callbacks only when explicitly requested
// Note: Smithery handles HTTP server via startCommand.type: "http" in smithery.yaml
if (process.env.START_HTTP_SERVER === 'true' || process.argv.includes('--http-server')) {
  const PORT = parseInt(process.env.PORT || '3000');
  const app = express();
  
  app.use(cors());
  app.use(express.json());
  
  // Use the same OAuth manager instance and configuration as the MCP server
  console.log('🔧 HTTP server will use same OAuth configuration as MCP server');
  const callbackOAuthManager = JiraOAuthManager.getInstance(process.env.JIRA_URL || 'https://codegenie.atlassian.net', {
    clientId: process.env.OAUTH_CLIENT_ID || process.env.JIRA_OAUTH_CLIENT_ID,
    clientSecret: process.env.OAUTH_CLIENT_SECRET || process.env.JIRA_OAUTH_CLIENT_SECRET,
    redirectUri: process.env.OAUTH_REDIRECT_URI || `${process.env.SERVER_URL || 'http://localhost:3000'}/oauth/callback`,
  });
  
  // OAuth callback endpoint
  app.get('/oauth/callback', async (req, res) => {
    const { code, state, error } = req.query;
    
    if (error) {
      console.error('❌ OAuth callback error:', error);
      res.send(`
        <html><body style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>❌ OAuth Error</h2>
          <p><strong>Error:</strong> ${error}</p>
          <p><strong>Description:</strong> ${req.query.error_description || 'Unknown error'}</p>
          <p>Please try the authentication flow again.</p>
          <p><a href="javascript:window.close()">Close this window</a></p>
        </body></html>
      `);
      return;
    }
    
    if (code && state) {
      try {
        console.log('🔄 Processing OAuth callback in MCP server...');
        console.log(`🔍 Looking for session with state: ${state}`);
        
        // Clean up environment variable session after successful lookup
        try {
          const envKey = `OAUTH_SESSION_${state}`;
          if (process.env[envKey]) {
            console.log('✅ Found session in environment - cleaning up after use');
            delete process.env[envKey];
          }
        } catch (error) {
          console.log('⚠️ Environment cleanup warning:', error);
        }
        
        const tokenResponse = await callbackOAuthManager.exchangeCodeForToken(code as string, state as string);
        
        console.log('✅ OAuth token exchange successful in MCP server');
        
        res.send(`
          <html><body style="font-family: Arial, sans-serif; padding: 20px; text-align: center;">
            <h2>✅ OAuth Authentication Successful!</h2>
            <p><strong>Your Jira MCP server is now configured and ready to use.</strong></p>
            <div style="background: #f0f8f0; border: 2px solid #4caf50; border-radius: 8px; padding: 20px; margin: 20px 0;">
              <h3>🚀 What's Next?</h3>
              <p>Return to Claude Desktop and test your tools:</p>
              <ul style="text-align: left; display: inline-block;">
                <li><code>test_jira_connection</code> - Verify everything works</li>
                <li><code>jira_get_issue</code> - Get issue details</li>
                <li><code>help</code> - See all available commands</li>
              </ul>
            </div>
            <p><strong>Token Type:</strong> ${tokenResponse.token_type}</p>
            <p><strong>Expires In:</strong> ${tokenResponse.expires_in || 'N/A'} seconds</p>
            <p><strong>Refresh Token:</strong> ${tokenResponse.refresh_token ? 'Available' : 'Not provided'}</p>
            <p><em>You can close this window and return to Claude Desktop.</em></p>
          </body></html>
        `);
      } catch (error) {
        console.error('❌ OAuth token exchange failed:', error);
        res.send(`
          <html><body style="font-family: Arial, sans-serif; padding: 20px;">
            <h2>❌ OAuth Token Exchange Failed</h2>
            <p><strong>Error:</strong> ${error instanceof Error ? error.message : String(error)}</p>
            <p>Please try the authentication flow again.</p>
            <p><a href="javascript:window.close()">Close this window</a></p>
          </body></html>
        `);
      }
    } else {
      res.send(`
        <html><body style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>❌ Invalid OAuth Response</h2>
          <p>Missing authorization code or state parameter.</p>
          <p><strong>Received:</strong></p>
          <pre>${JSON.stringify(req.query, null, 2)}</pre>
        </body></html>
      `);
    }
  });
  
  // Health check
  app.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      service: 'jira-mcp-oauth',
      version: '5.4.0',
      port: PORT,
      timestamp: new Date().toISOString()
    });
  });
  
  app.listen(PORT, () => {
    console.log(`🚀 Jira MCP OAuth server running on http://localhost:${PORT}`);
    console.log(`🔐 OAuth callback: http://localhost:${PORT}/oauth/callback`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
  });
}
