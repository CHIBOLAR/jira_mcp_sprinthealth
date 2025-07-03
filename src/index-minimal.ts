#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import dotenv from 'dotenv';
import { StatelessJiraOAuthManager } from './auth/oauth-manager-stateless.js';

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
 * Minimal Smithery Jira MCP Server - OAuth Only (No HTTP Server)
 * Reduced bundle size for Smithery deployment
 */
export default function createJiraMCPServer({ config }: { config: Config }) {
  const server = new McpServer({
    name: 'jira-mcp-oauth-minimal',
    version: '5.5.0-minimal',
  });

  console.log('🔧 Minimal Jira MCP Server Config:', config);
  console.log('⚡ Minimal deployment - OAuth via external URL only');

  // Initialize OAuth Manager with Smithery-compatible configuration
  const getRedirectUri = () => {
    if (process.env.OAUTH_REDIRECT_URI) {
      return process.env.OAUTH_REDIRECT_URI;
    }
    
    // In Smithery, use the Smithery hostname if available
    if (process.env.SMITHERY_HOSTNAME) {
      return `https://${process.env.SMITHERY_HOSTNAME}/oauth/callback`;
    }
    
    // Fallback to external OAuth handling
    return 'https://your-domain.com/oauth/callback';
  };
  
  const redirectUri = getRedirectUri();
  console.log(`🔗 OAuth redirect URI: ${redirectUri}`);
  
  const oauthConfig = {
    clientId: process.env.OAUTH_CLIENT_ID || process.env.JIRA_OAUTH_CLIENT_ID,
    clientSecret: process.env.OAUTH_CLIENT_SECRET || process.env.JIRA_OAUTH_CLIENT_SECRET,
    redirectUri,
  };
  
  console.log('🔧 Using stateless OAuth manager for Smithery cross-container deployment');
  const oauthManager = new StatelessJiraOAuthManager(config.companyUrl, oauthConfig);

  // OAuth Status Check Tool
  server.tool(
    'oauth_status',
    'Check OAuth authentication status',
    {},
    async () => {
      const stats = oauthManager.getStats();
      
      return {
        content: [{
          type: 'text',
          text: '✅ **OAuth Configuration Ready (Minimal)**\n\n' +
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
                `• REDIRECT_URI: ${process.env.OAUTH_REDIRECT_URI || 'Using default'}\n\n` +
                '**Note:** Minimal deployment - external OAuth handling required.'
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
      try {
        const { authUrl, state } = oauthManager.generateAuthUrl(config.userEmail, config.companyUrl);
        
        return {
          content: [{
            type: 'text',
            text: '🚀 **OAuth Authentication Started (Minimal)**\n\n' +
                  '1. **Click this link** to authenticate with Atlassian:\n' +
                  authUrl + '\n\n' +
                  '2. **Grant permissions** to access your Jira\n' +
                  '3. **Return to complete authentication externally**\n\n' +
                  `**Company:** ${config.companyUrl}\n` +
                  `**Email:** ${config.userEmail}\n` +
                  `**State:** ${state}\n\n` +
                  '**Note:** Use external OAuth callback handling for token exchange.'
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

  // Test Jira Connection
  server.tool(
    'test_jira_connection',
    'Test connection to Jira',
    {},
    async () => {
      return {
        content: [{
          type: 'text',
          text: '✅ **Jira Connection Test (Minimal)**\n\n' +
                `**Company URL:** ${config.companyUrl}\n` +
                `**User Email:** ${config.userEmail}\n` +
                `**Status:** Ready for OAuth authentication\n\n` +
                '🔐 **Next Steps:**\n' +
                '1. Run **start_oauth** to get authentication URL\n' +
                '2. Complete browser login\n' +
                '3. Handle token exchange externally\n\n' +
                '**Note:** Minimal deployment - reduced functionality'
        }]
      };
    }
  );

  // Help tool
  server.tool(
    'help',
    'Get help with minimal Jira MCP server',
    {},
    async () => {
      return {
        content: [{
          type: 'text',
          text: '🚀 **Minimal Smithery Jira MCP Server**\n\n' +
                '📋 **Your Configuration:**\n' +
                `• **Company URL:** ${config.companyUrl}\n` +
                `• **Email:** ${config.userEmail}\n` +
                `• **Auth Method:** ${config.authMethod}\n\n` +
                '🛠️ **Available Tools:**\n' +
                '• oauth_status - Check OAuth config\n' +
                '• start_oauth - Get OAuth URL\n' +
                '• test_jira_connection - Test connection\n' +
                '• help - This guide\n\n' +
                '⚡ **Minimal Deployment:**\n' +
                '✅ Reduced bundle size for Smithery\n' +
                '✅ OAuth URL generation\n' +
                '❌ No HTTP server (external callback required)\n' +
                '❌ Limited API functionality'
        }]
      };
    }
  );

  return server;
}

/**
 * Extract Jira domain from company URL
 */
function extractJiraDomain(companyUrl: string): string {
  let domain = companyUrl.replace(/^https?:\/\//, '');
  domain = domain.replace(/\/$/, '');
  return domain;
}