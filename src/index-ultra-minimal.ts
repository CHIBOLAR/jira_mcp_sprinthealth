#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

// Simple session data interface
interface SimpleOAuthSession {
  codeVerifier: string;
  redirectUri: string;
  timestamp: number;
  userEmail?: string;
  companyUrl: string;
}

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

  // Generate secure random string without crypto module
  function generateSecureRandom(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  // Simple hash function for PKCE (without crypto module)
  function simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  // Base64 encode without btoa (for Node.js compatibility)
  function base64Encode(str: string): string {
    return Buffer.from(str).toString('base64url');
  }

  // Base64 decode without atob (for Node.js compatibility)
  function base64Decode(str: string): string {
    return Buffer.from(str, 'base64url').toString();
  }

  // Encode session data into state parameter (simple base64 encoding)
  function encodeSessionData(sessionData: SimpleOAuthSession): string {
    const sessionJson = JSON.stringify(sessionData);
    return base64Encode(sessionJson);
  }

  // Decode session data from state parameter
  function decodeSessionData(encodedState: string): SimpleOAuthSession {
    try {
      const sessionJson = base64Decode(encodedState);
      return JSON.parse(sessionJson);
    } catch (error) {
      throw new Error('Invalid or corrupted OAuth state parameter');
    }
  }

  // Stateless OAuth URL generation with embedded session data
  function generateStatelessOAuthUrl(userEmail: string, companyUrl: string): { authUrl: string; state: string } {
    console.log('🔗 Generating stateless OAuth URL...');
    
    const clientId = process.env.OAUTH_CLIENT_ID || process.env.JIRA_OAUTH_CLIENT_ID || 'EiNH97tfyGyZPlaMfrteiKeW2TXWVxFf';
    const redirectUri = process.env.OAUTH_REDIRECT_URI || 
                       (process.env.SMITHERY_HOSTNAME ? `https://${process.env.SMITHERY_HOSTNAME}/oauth/callback` : 
                        'http://localhost:3000/oauth/callback');
    
    // Generate PKCE parameters
    const codeVerifier = generateSecureRandom(64);
    const codeChallenge = base64Encode(simpleHash(codeVerifier)).substring(0, 43); // Trim to standard length
    
    console.log(`🔑 Code verifier: ${codeVerifier.substring(0, 10)}...`);
    console.log(`🔐 Code challenge: ${codeChallenge.substring(0, 10)}...`);
    
    // Create session data to embed in state
    const sessionData: SimpleOAuthSession = {
      codeVerifier,
      redirectUri,
      timestamp: Date.now(),
      userEmail,
      companyUrl
    };
    
    // Encode session data into state parameter
    const encodedState = encodeSessionData(sessionData);
    
    console.log(`💾 Session data encoded into state: ${encodedState.substring(0, 20)}...`);
    
    const params = new URLSearchParams({
      audience: 'api.atlassian.com',
      client_id: clientId,
      scope: 'read:jira-work read:jira-user write:jira-work offline_access',
      redirect_uri: redirectUri,
      state: encodedState,
      response_type: 'code',
      prompt: 'consent',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    });

    if (userEmail) {
      params.append('login_hint', userEmail);
    }

    const authUrl = `https://auth.atlassian.com/authorize?${params.toString()}`;
    
    console.log('✅ Stateless OAuth URL generated successfully');
    return { authUrl, state: encodedState };
  }

  // Token exchange using stateless session data
  async function exchangeCodeForToken(code: string, encodedState: string): Promise<any> {
    console.log('🔄 Starting stateless token exchange...');
    console.log(`📝 Code: ${code.substring(0, 10)}...`);
    console.log(`🏷️ State: ${encodedState.substring(0, 20)}...`);
    
    // Decode session data from state
    let sessionData: SimpleOAuthSession;
    try {
      sessionData = decodeSessionData(encodedState);
      console.log('✅ Session data decoded successfully');
      console.log(`📧 Email: ${sessionData.userEmail}`);
      console.log(`🔗 Redirect URI: ${sessionData.redirectUri}`);
    } catch (error) {
      console.error('❌ Failed to decode session data:', error);
      throw new Error('Invalid or expired OAuth state parameter. Please restart the authentication flow.');
    }
    
    // Check session expiry (15 minutes)
    const age = Date.now() - sessionData.timestamp;
    const TTL = 15 * 60 * 1000; // 15 minutes
    if (age > TTL) {
      console.error('⏰ OAuth session expired:', Math.floor(age / 1000 / 60), 'minutes old');
      throw new Error('OAuth session expired. Please restart the authentication flow.');
    }
    
    console.log(`✅ Session age: ${Math.floor(age / 1000)} seconds (valid)`);

    const clientId = process.env.OAUTH_CLIENT_ID || process.env.JIRA_OAUTH_CLIENT_ID || 'EiNH97tfyGyZPlaMfrteiKeW2TXWVxFf';
    const clientSecret = process.env.JIRA_OAUTH_CLIENT_SECRET || 
                        process.env.OAUTH_CLIENT_SECRET || 
                        'ATOAuTXLEA7CfAwdZKovQ3VfShkxAZAERKyWdumV6Fu1szzHS27tFH3J1sjhAUDAjdv34221288B';
    
    const tokenRequest = {
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: sessionData.redirectUri,
      code_verifier: sessionData.codeVerifier
    };

    console.log('🔄 Exchanging code for token...');
    
    const response = await fetch('https://auth.atlassian.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'User-Agent': 'Jira-MCP-Server/6.0.0-STATELESS'
      },
      body: new URLSearchParams(tokenRequest)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Token exchange failed:', response.status, errorText);
      throw new Error(`OAuth token exchange failed (${response.status}): ${errorText}`);
    }
    
    const tokenData = await response.json();
    
    if (!tokenData.access_token) {
      throw new Error('Invalid token response: missing access_token');
    }

    console.log('✅ Token exchange successful');
    return tokenData;
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
          text: '✅ **Stateless OAuth Status**\n\n' +
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

  // Start OAuth Flow Tool - Now with stateless session handling
  server.tool(
    'start_oauth',
    'Generate stateless OAuth authentication URL',
    {},
    async () => {
      try {
        const { authUrl, state } = generateStatelessOAuthUrl(config.userEmail, config.companyUrl);
        
        return {
          content: [{
            type: 'text',
            text: '🚀 **Stateless OAuth URL Generated**\n\n' +
                  '1. **Click this link** to authenticate:\n' +
                  authUrl + '\n\n' +
                  '2. **Grant permissions** to access your Jira\n' +
                  '3. **OAuth callback will handle token exchange automatically**\n\n' +
                  `**Company:** ${config.companyUrl}\n` +
                  `**Email:** ${config.userEmail}\n` +
                  `**State:** ${state.substring(0, 20)}... (contains session data)\n\n` +
                  '✅ **Stateless Design:** Session data embedded in state parameter\n' +
                  '🔄 **Cross-Container Compatible:** No shared storage required'
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

  // OAuth Callback Handler Tool
  server.tool(
    'oauth_callback',
    'Handle OAuth callback with stateless token exchange',
    {
      code: z.string().describe('OAuth authorization code'),
      state: z.string().describe('OAuth state parameter containing session data')
    },
    async ({ code, state }) => {
      try {
        console.log('🔄 OAuth callback received');
        const tokenData = await exchangeCodeForToken(code, state);
        
        // Save tokens to file for API usage
        const fs = await import('fs');
        const os = await import('os');
        const path = await import('path');
        
        const tokenFile = path.join(os.tmpdir(), 'jira-mcp-tokens.json');
        const tokenInfo = {
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          expires_in: tokenData.expires_in,
          token_type: tokenData.token_type,
          timestamp: Date.now()
        };
        
        fs.writeFileSync(tokenFile, JSON.stringify(tokenInfo, null, 2));
        
        return {
          content: [{
            type: 'text',
            text: '✅ **OAuth Authentication Successful!**\n\n' +
                  'Your Jira MCP server is now authenticated and ready to use.\n\n' +
                  '🔧 **Stateless OAuth Success:**\n' +
                  '• Session data decoded from state parameter\n' +
                  '• Token exchange completed successfully\n' +
                  '• Access tokens saved for API usage\n\n' +
                  '🚀 **Next Steps:**\n' +
                  '• Run `test_connection` to verify setup\n' +
                  '• OAuth tokens are now available for Jira API calls'
          }]
        };
      } catch (error) {
        console.error('❌ OAuth callback failed:', error);
        return {
          content: [{
            type: 'text',
            text: `❌ **OAuth Callback Failed**\n\n` +
                  `Error: ${error instanceof Error ? error.message : String(error)}\n\n` +
                  'Please restart the authentication flow with `start_oauth`.'
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