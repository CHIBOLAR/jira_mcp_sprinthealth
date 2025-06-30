import { randomBytes, createHash } from 'crypto';
import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

/**
 * Enhanced OAuth 2.1 Manager for Individual User Authentication
 * Designed for users without admin-level access to Jira
 */

export interface OAuthConfig {
  authorizationUrl: string;
  tokenUrl: string;
  clientId: string;
  redirectUri: string;
  scopes: string[];
}

export interface OAuthSession {
  state: string;
  codeVerifier: string;
  redirectUri: string;
  timestamp: number;
  userEmail?: string | undefined;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

export interface AtlassianOAuthConfig {
  companyUrl: string;
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  scopes?: string[];
}
export class JiraOAuthManager {
  private config: OAuthConfig;
  private readonly SESSION_TTL = 15 * 60 * 1000; // 15 minutes for OAuth flow
  private readonly SESSION_FILE = join(tmpdir(), 'jira-oauth-sessions.json');

  constructor(companyUrl: string, customConfig?: Partial<AtlassianOAuthConfig>) {
    // Determine if this is Atlassian Cloud or Server/Data Center
    const isCloud = companyUrl.includes('.atlassian.net');
    
    // Default configuration for individual users
    this.config = {
      authorizationUrl: isCloud 
        ? 'https://auth.atlassian.com/authorize'
        : `${companyUrl}/plugins/servlet/oauth2/authorize`,
      tokenUrl: isCloud
        ? 'https://auth.atlassian.com/oauth/token'
        : `${companyUrl}/plugins/servlet/oauth2/token`,
      clientId: customConfig?.clientId || this.getDefaultClientId(companyUrl),
      redirectUri: customConfig?.redirectUri || this.getDefaultRedirectUri(),
      scopes: customConfig?.scopes || this.getDefaultScopes(isCloud)
    };

    console.log('🔧 OAuth Manager initialized for:', isCloud ? 'Atlassian Cloud' : 'Server/Data Center');
    console.log('🔗 Authorization URL:', this.config.authorizationUrl);
    console.log('🎯 Redirect URI:', this.config.redirectUri);
  }

  /**
   * Get default client ID for individual users
   * This uses a generic OAuth client that doesn't require admin setup
   */
  private getDefaultClientId(companyUrl: string): string {
    // For Atlassian Cloud, we can use a pre-registered client ID
    // that's designed for individual user access
    if (companyUrl.includes('.atlassian.net')) {
      return process.env.JIRA_OAUTH_CLIENT_ID || 'EiNH97tfyGyZPlaMfrteiKeW2TXWVxFf';
    }
    
    // For Server/Data Center, user needs to provide their own client ID
    return process.env.JIRA_OAUTH_CLIENT_ID || 'EiNH97tfyGyZPlaMfrteiKeW2TXWVxFf';
  }
  /**
   * Get default redirect URI
   */
  private getDefaultRedirectUri(): string {
    // Priority order for redirect URI:
    // 1. OAUTH_REDIRECT_URI (explicit override)
    // 2. SMITHERY_HOSTNAME (Smithery deployment)
    // 3. SERVER_URL (general server URL)
    // 4. Localhost fallback
    
    if (process.env.OAUTH_REDIRECT_URI) {
      return process.env.OAUTH_REDIRECT_URI;
    }
    
    if (process.env.SMITHERY_HOSTNAME) {
      return `https://${process.env.SMITHERY_HOSTNAME}/oauth/callback`;
    }
    
    const serverUrl = process.env.SERVER_URL || process.env.THIS_HOSTNAME || 'http://localhost:3000';
    return `${serverUrl}/oauth/callback`;
  }

  /**
   * Get default scopes based on deployment type
   */
  private getDefaultScopes(isCloud: boolean): string[] {
    if (isCloud) {
      return [
        'read:jira-work',
        'read:jira-user', 
        'write:jira-work',
        'offline_access' // For refresh tokens
      ];
    } else {
      // Server/Data Center scopes
      return [
        'READ',
        'WRITE'
      ];
    }
  }

  /**
   * Read sessions from persistent storage
   */
  private readSessions(): Map<string, OAuthSession> {
    try {
      if (!existsSync(this.SESSION_FILE)) {
        return new Map();
      }
      const data = readFileSync(this.SESSION_FILE, 'utf8');
      const sessionArray = JSON.parse(data);
      return new Map(sessionArray);
    } catch (error) {
      console.warn('⚠️ Failed to read OAuth sessions:', (error as Error).message);
      return new Map();
    }
  }

  /**
   * Write sessions to persistent storage
   */
  private writeSessions(sessions: Map<string, OAuthSession>): void {
    try {
      const sessionArray = Array.from(sessions.entries());
      writeFileSync(this.SESSION_FILE, JSON.stringify(sessionArray, null, 2));
    } catch (error) {
      console.error('❌ Failed to write OAuth sessions:', (error as Error).message);
    }
  }

  /**
   * Get a session by state
   */
  private getSession(state: string): OAuthSession | undefined {
    const sessions = this.readSessions();
    return sessions.get(state);
  }

  /**
   * Store a session
   */
  private storeSession(state: string, session: OAuthSession): void {
    const sessions = this.readSessions();
    sessions.set(state, session);
    this.writeSessions(sessions);
  }

  /**
   * Delete a session
   */
  private deleteSession(state: string): void {
    const sessions = this.readSessions();
    sessions.delete(state);
    this.writeSessions(sessions);
  }

  /**
   * Clear all OAuth sessions (for debugging)
   */
  clearAllSessions(): void {
    try {
      if (existsSync(this.SESSION_FILE)) {
        unlinkSync(this.SESSION_FILE);
        console.log('✅ All OAuth sessions cleared');
      }
    } catch (error) {
      console.error('❌ Failed to clear sessions:', (error as Error).message);
    }
  }

  /**
   * Get OAuth configuration metadata for MCP discovery
   */
  getResourceMetadata() {
    return {
      resource: process.env.SERVER_URL || 'http://localhost:3000',
      authorization_servers: [this.config.authorizationUrl.replace(/\/authorize$/, '')],
      scopes_supported: this.config.scopes,
      bearer_methods_supported: ['header'],
      resource_documentation: 'https://github.com/your-org/jira-mcp-mvp',
      oauth_discovery: {
        issuer: this.config.authorizationUrl.replace(/\/authorize$/, ''),
        authorization_endpoint: this.config.authorizationUrl,
        token_endpoint: this.config.tokenUrl,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
        scopes_supported: this.config.scopes,
        registration_endpoint: null // Individual users don't need dynamic registration
      }
    };
  }
  /**
   * Generate OAuth authorization URL with PKCE for individual user
   */
  generateAuthUrl(userEmail?: string): { authUrl: string; state: string } {
    const state = this.generateSecureRandom(32);
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = this.generateCodeChallenge(codeVerifier);
    
    // Store session for later verification
    this.storeSession(state, {
      state,
      codeVerifier,
      redirectUri: this.config.redirectUri,
      timestamp: Date.now(),
      userEmail
    });

    // Build authorization parameters
    const params = new URLSearchParams({
      audience: 'api.atlassian.com',
      client_id: this.config.clientId,
      scope: this.config.scopes.join(' '),
      redirect_uri: this.config.redirectUri,
      state,
      response_type: 'code',
      prompt: 'consent', // Always show consent screen for transparency
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    });

    // Add login hint if email provided
    if (userEmail) {
      params.append('login_hint', userEmail);
    }

    const authUrl = `${this.config.authorizationUrl}?${params.toString()}`;
    
    console.log('🔐 Generated OAuth URL for user:', userEmail || 'unknown');
    console.log('🎲 State parameter:', state);
    console.log('📁 Session stored in:', this.SESSION_FILE);
    
    return { authUrl, state };
  }
  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code: string, state: string): Promise<TokenResponse> {
    console.log('🔍 Looking for OAuth session with state:', state);
    console.log('📁 Session file location:', this.SESSION_FILE);
    
    const session = this.getSession(state);
    if (!session) {
      console.error('❌ OAuth session not found for state:', state);
      const allSessions = this.readSessions();
      console.log('📊 Available sessions:', Array.from(allSessions.keys()));
      throw new Error('Invalid or expired OAuth state parameter. Please restart the authentication flow.');
    }

    console.log('✅ OAuth session found for state:', state);
    
    // Check session expiry
    if (Date.now() - session.timestamp > this.SESSION_TTL) {
      console.error('⏰ OAuth session expired for state:', state);
      this.deleteSession(state);
      throw new Error('OAuth session expired. Please restart the authentication flow.');
    }

    try {
      console.log('🔄 Exchanging authorization code for access token...');
      
      const tokenRequest = {
        grant_type: 'authorization_code',
        client_id: this.config.clientId,
        code,
        redirect_uri: session.redirectUri,
        code_verifier: session.codeVerifier
      };

      // Add client secret if available (for confidential clients)
      const clientSecret = process.env.JIRA_OAUTH_CLIENT_SECRET || process.env.OAUTH_CLIENT_SECRET || 'ATOAuTXLEA7CfAwdZKovQ3VfShkxAZAERKyWdumV6Fu1szzHS27tFH3J1sjhAUDAjdv34221288B';
      if (clientSecret) {
        (tokenRequest as any).client_secret = clientSecret;
      }

      const response = await fetch(this.config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
          'User-Agent': 'Jira-MCP-Server/4.0.0'
        },
        body: new URLSearchParams(tokenRequest)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Token exchange failed:', response.status, errorText);
        throw new Error(`OAuth token exchange failed (${response.status}): ${errorText}`);
      }
      const tokenData: TokenResponse = await response.json();
      
      // Validate token response
      if (!tokenData.access_token) {
        throw new Error('Invalid token response: missing access_token');
      }

      console.log('✅ Token exchange successful');
      console.log('🔑 Token type:', tokenData.token_type);
      console.log('⏰ Expires in:', tokenData.expires_in, 'seconds');
      console.log('🔄 Refresh token available:', !!tokenData.refresh_token);
      
      // Clean up session
      this.deleteSession(state);
      
      return tokenData;
    } catch (error) {
      // Clean up session on error
      this.deleteSession(state);
      
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Token exchange failed: ${String(error)}`);
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken: string): Promise<TokenResponse> {
    try {
      console.log('🔄 Refreshing access token...');
      
      const refreshRequest = {
        grant_type: 'refresh_token',
        client_id: this.config.clientId,
        refresh_token: refreshToken
      };

      // Add client secret if available
      const clientSecret = process.env.JIRA_OAUTH_CLIENT_SECRET || process.env.OAUTH_CLIENT_SECRET || 'ATOAuTXLEA7CfAwdZKovQ3VfShkxAZAERKyWdumV6Fu1szzHS27tFH3J1sjhAUDAjdv34221288B';
      if (clientSecret) {
        (refreshRequest as any).client_secret = clientSecret;
      }
      const response = await fetch(this.config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
          'User-Agent': 'Jira-MCP-Server/4.0.0'
        },
        body: new URLSearchParams(refreshRequest)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Token refresh failed:', response.status, errorText);
        throw new Error(`Token refresh failed (${response.status}): ${errorText}`);
      }

      const tokenData: TokenResponse = await response.json();
      
      if (!tokenData.access_token) {
        throw new Error('Invalid refresh response: missing access_token');
      }

      console.log('✅ Token refresh successful');
      return tokenData;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Failed to refresh token: ${String(error)}`);
    }
  }

  /**
   * Validate access token by testing it with Jira API
   */
  async validateToken(accessToken: string, baseUrl: string): Promise<boolean> {
    try {
      const testUrl = baseUrl.includes('.atlassian.net') 
        ? `${baseUrl}/rest/api/3/myself`
        : `${baseUrl}/rest/api/2/myself`;

      const response = await fetch(testUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'User-Agent': 'Jira-MCP-Server/4.0.0'
        }
      });

      const isValid = response.ok;
      console.log('🔍 Token validation:', isValid ? 'valid' : 'invalid');
      
      return isValid;
    } catch (error) {
      console.warn('⚠️ Token validation failed:', (error as Error).message);
      return false;
    }
  }
  /**
   * Get accessible resources for the authenticated user
   */
  async getAccessibleResources(accessToken: string): Promise<any[]> {
    try {
      const response = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'User-Agent': 'Jira-MCP-Server/4.0.0'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to get accessible resources: ${response.status}`);
      }

      const resources = await response.json();
      console.log('🏢 Accessible resources:', resources.length);
      
      return resources;
    } catch (error) {
      console.warn('⚠️ Failed to get accessible resources:', (error as Error).message);
      return [];
    }
  }

  /**
   * Generate cryptographically secure random string
   */
  private generateSecureRandom(length: number): string {
    return randomBytes(length).toString('base64url');
  }

  /**
   * Generate PKCE code verifier (RFC 7636)
   */
  private generateCodeVerifier(): string {
    return randomBytes(32).toString('base64url');
  }

  /**
   * Generate PKCE code challenge (RFC 7636)
   */
  private generateCodeChallenge(verifier: string): string {
    return createHash('sha256').update(verifier).digest('base64url');
  }
  /**
   * Clean up expired sessions periodically
   */
  cleanupExpiredSessions(): void {
    const now = Date.now();
    let cleaned = 0;
    const sessions = this.readSessions();
    
    for (const [state, session] of sessions.entries()) {
      if (now - session.timestamp > this.SESSION_TTL) {
        sessions.delete(state);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      this.writeSessions(sessions);
      console.log('🧹 Cleaned up', cleaned, 'expired OAuth sessions');
    }
  }

  /**
   * Get session and OAuth statistics
   */
  getStats(): { 
    activeSessions: number; 
    config: Omit<OAuthConfig, 'clientId'>; 
    features: string[];
  } {
    this.cleanupExpiredSessions();
    const sessions = this.readSessions();
    
    return {
      activeSessions: sessions.size,
      config: {
        authorizationUrl: this.config.authorizationUrl,
        tokenUrl: this.config.tokenUrl,
        redirectUri: this.config.redirectUri,
        scopes: this.config.scopes
      },
      features: [
        'OAuth 2.1 with PKCE',
        'Individual user authentication',
        'Browser-based flow',
        'Automatic token refresh',
        'Session management'
      ]
    };
  }
  /**
   * Check if this is properly configured for individual users
   */
  isConfiguredForIndividualUsers(): boolean {
    return (
      this.config.clientId !== 'jira-mcp-client' ||  // Custom client ID provided
      process.env.JIRA_OAUTH_CLIENT_ID !== undefined  // Environment variable set
    );
  }

  /**
   * Get setup instructions for individual users
   */
  getSetupInstructions(): string {
    const isCloud = this.config.authorizationUrl.includes('auth.atlassian.com');
    
    if (isCloud) {
      return `
🔧 **Atlassian Cloud Setup for Individual Users:**

1. **Create OAuth App** (Optional - default client available):
   - Go to https://developer.atlassian.com/console/myapps/
   - Create new app → OAuth 2.0 integration
   - Add redirect URI: ${this.config.redirectUri}
   - Copy Client ID and set JIRA_OAUTH_CLIENT_ID environment variable

2. **Configure Environment:**
   - JIRA_OAUTH_CLIENT_ID=your_client_id (optional)
   - SERVER_URL=${process.env.SERVER_URL || 'http://localhost:3000'}

3. **Ready to use!** The server will handle individual user authentication.
      `;
    } else {
      return `
🔧 **Jira Server/Data Center Setup for Individual Users:**

1. **Request OAuth App from Admin:**
   - Ask your Jira admin to create an OAuth application
   - Redirect URI: ${this.config.redirectUri}
   - Request the Client ID

2. **Configure Environment:**
   - JIRA_OAUTH_CLIENT_ID=provided_client_id
   - SERVER_URL=${process.env.SERVER_URL || 'http://localhost:3000'}

3. **Alternative:** Use Personal Access Tokens for simpler setup.
      `;
    }
  }
}