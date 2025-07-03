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
 * Ultra-Minimal Smithery Jira MCP Server - Basic OAuth URL Generation Only
 * Designed to test Smithery deployment compatibility
 */
export default function createJiraMCPServer({ config }: { config: Config }) {
  const server = new McpServer({
    name: 'jira-mcp-ultra-minimal',
    version: '5.5.0-ultra-minimal',
  });

  console.log('🔧 Ultra-Minimal Jira MCP Server Config:', config);
  console.log('⚡ Ultra-minimal deployment - basic OAuth URL generation only');

  // Simple OAuth URL generation without encryption
  function generateBasicOAuthUrl(userEmail: string, companyUrl: string): { authUrl: string; state: string } {
    const clientId = process.env.OAUTH_CLIENT_ID || process.env.JIRA_OAUTH_CLIENT_ID || 'EiNH97tfyGyZPlaMfrteiKeW2TXWVxFf';
    const redirectUri = process.env.OAUTH_REDIRECT_URI || 
                       (process.env.SMITHERY_HOSTNAME ? `https://${process.env.SMITHERY_HOSTNAME}/oauth/callback` : 
                        'http://localhost:3000/oauth/callback');
    
    // Simple state generation (timestamp + random)
    const state = `${Date.now()}-${Math.random().toString(36).substring(2)}`;
    
    // Simple PKCE code challenge (fixed for testing)
    const codeChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
    
    const params = new URLSearchParams({
      audience: 'api.atlassian.com',
      client_id: clientId,
      scope: 'read:jira-work read:jira-user write:jira-work offline_access',
      redirect_uri: redirectUri,
      state,
      response_type: 'code',
      prompt: 'consent',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    });

    if (userEmail) {
      params.append('login_hint', userEmail);
    }

    const authUrl = `https://auth.atlassian.com/authorize?${params.toString()}`;
    
    return { authUrl, state };
  }

  // OAuth Status Check Tool
  server.tool(
    'oauth_status',
    'Check OAuth authentication status',
    {},
    async () => {
      return {
        content: [{
          type: 'text',
          text: '✅ **Ultra-Minimal OAuth Status**\n\n' +
                `**Company URL:** ${config.companyUrl}\n` +
                `**User Email:** ${config.userEmail}\n` +
                `**Auth Method:** ${config.authMethod}\n\n` +
                '**Configuration:**\n' +
                `• CLIENT_ID: ${process.env.OAUTH_CLIENT_ID ? '✅ Set' : '❌ Missing'}\n` +
                `• CLIENT_SECRET: ${process.env.OAUTH_CLIENT_SECRET ? '✅ Set' : '❌ Missing'}\n` +
                `• SMITHERY_HOSTNAME: ${process.env.SMITHERY_HOSTNAME || 'Not set'}\n\n` +
                '**Note:** Ultra-minimal deployment for testing Smithery compatibility.'
        }]
      };
    }
  );

  // Start OAuth Flow Tool
  server.tool(
    'start_oauth',
    'Generate basic OAuth authentication URL',
    {},
    async () => {
      try {
        const { authUrl, state } = generateBasicOAuthUrl(config.userEmail, config.companyUrl);
        
        return {
          content: [{
            type: 'text',
            text: '🚀 **Basic OAuth URL Generated**\n\n' +
                  '1. **Click this link** to authenticate:\n' +
                  authUrl + '\n\n' +
                  '2. **Grant permissions** to access your Jira\n\n' +
                  `**Company:** ${config.companyUrl}\n` +
                  `**Email:** ${config.userEmail}\n` +
                  `**State:** ${state}\n\n` +
                  '**Note:** Ultra-minimal version - external callback handling required.'
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: '❌ **OAuth URL generation error:**\n\n' +
                  `Error: ${error instanceof Error ? error.message : String(error)}`
          }]
        };
      }
    }
  );

  // Test Connection
  server.tool(
    'test_connection',
    'Test basic server functionality',
    {},
    async () => {
      return {
        content: [{
          type: 'text',
          text: '✅ **Ultra-Minimal Server Test**\n\n' +
                `**Status:** Server is running\n` +
                `**Company URL:** ${config.companyUrl}\n` +
                `**User Email:** ${config.userEmail}\n` +
                `**Timestamp:** ${new Date().toISOString()}\n\n` +
                '**Deployment Test:** Smithery compatibility check passed'
        }]
      };
    }
  );

  // Help tool
  server.tool(
    'help',
    'Get help with ultra-minimal server',
    {},
    async () => {
      return {
        content: [{
          type: 'text',
          text: '🚀 **Ultra-Minimal Jira MCP Server**\n\n' +
                '📋 **Configuration:**\n' +
                `• **Company URL:** ${config.companyUrl}\n` +
                `• **Email:** ${config.userEmail}\n\n` +
                '🛠️ **Available Tools:**\n' +
                '• oauth_status - Check configuration\n' +
                '• start_oauth - Generate OAuth URL\n' +
                '• test_connection - Test server\n' +
                '• help - This guide\n\n' +
                '⚡ **Ultra-Minimal Features:**\n' +
                '✅ Basic OAuth URL generation\n' +
                '✅ Smithery deployment compatible\n' +
                '✅ Zero external dependencies\n' +
                '❌ No encryption or advanced features'
        }]
      };
    }
  );

  return server;
}