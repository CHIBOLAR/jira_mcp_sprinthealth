import { randomBytes, createHash } from 'crypto';
import { tmpdir } from 'os';
import { readFileSync, writeFileSync, existsSync } from 'fs';

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
  
  // ✅ PERSISTENT FIX: File-based session storage across all instances
  private static readonly SESSION_FILE = `${tmpdir()}/jira-oauth-sessions.json`;

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

    console.log('🔧 OAuth Manager initialized (PERSISTENT FILE MODE)');
    console.log('🔗 Authorization URL:', this.config.authorizationUrl);
    console.log('🎯 Redirect URI:', this.config.redirectUri);
    console.log(`📁 Session file: ${JiraOAuthManager.SESSION_FILE}`);
    console.log(`📊 Persistent sessions active: ${this.getStoredSessions().size}`);
    
    // Cleanup expired sessions every 5 minutes
    setInterval(() => this.cleanupExpiredSessions(), 5 * 60 * 1000);
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
   * ✅ PERSISTENT FIX: File-based session storage management
   */
  private getStoredSessions(): Map<string, OAuthSession> {
    try {
      if (!existsSync(JiraOAuthManager.SESSION_FILE)) {
        return new Map();
      }
      
      const fileContent = readFileSync(JiraOAuthManager.SESSION_FILE, 'utf8');
      const sessions = JSON.parse(fileContent);
      return new Map(Object.entries(sessions));
    } catch (error) {
      console.warn('⚠️ Failed to read session file, starting fresh:', (error as Error).message);
      return new Map();
    }
  }

  private saveStoredSessions(sessions: Map<string, OAuthSession>): void {
    try {
      const sessionObj = Object.fromEntries(sessions.entries());
      writeFileSync(JiraOAuthManager.SESSION_FILE, JSON.stringify(sessionObj, null, 2), 'utf8');
    } catch (error) {
      console.error('❌ Failed to save sessions to file:', (error as Error).message);
    }
  }

  /**
   * ✅ PERSISTENT FIX: File-based session storage across all instances
   */
  private storeSession(state: string, session: OAuthSession): void {
    console.log(`💾 Storing session in persistent file: ${state}`);
    const sessions = this.getStoredSessions();
    sessions.set(state, session);
    this.saveStoredSessions(sessions);
    
    // Auto-cleanup after TTL
    setTimeout(() => {
      const currentSessions = this.getStoredSessions();
      if (currentSessions.has(state)) {
        console.log(`🧹 Auto-cleaning expired session: ${state}`);
        currentSessions.delete(state);
        this.saveStoredSessions(currentSessions);
      }
    }, this.SESSION_TTL);
  }

  /**
   * ✅ PERSISTENT FIX: File-based session lookup across all instances
   */
  private getSession(state: string): OAuthSession | undefined {
    const sessions = this.getStoredSessions();
    const session = sessions.get(state);
    console.log(`🔍 Looking up session ${state}: ${session ? 'FOUND' : 'NOT FOUND'}`);
    console.log(`📊 Total active sessions in file: ${sessions.size}`);
    console.log(`📁 Session file location: ${JiraOAuthManager.SESSION_FILE}`);
    
    if (session) {
      console.log(`⏰ Session timestamp: ${new Date(session.timestamp).toISOString()}`);
      console.log(`⌛ Session age: ${Math.round((Date.now() - session.timestamp) / 1000)}s`);
    }
    
    return session;
  }

  /**
   * ✅ PERSISTENT FIX: File-based session deletion across all instances
   */
  private deleteSession(state: string): void {
    const sessions = this.getStoredSessions();
    const deleted = sessions.delete(state);
    this.saveStoredSessions(sessions);
    console.log(`🗑️ Deleted session ${state}: ${deleted ? 'SUCCESS' : 'NOT FOUND'}`);
  }

  /**
   * Clear all OAuth sessions (for debugging) - PERSISTENT FIX
   */
  clearAllSessions(): void {
    try {
      const sessions = this.getStoredSessions();
      const sessionCount = sessions.size;
      
      // Clear the file by writing empty object
      this.saveStoredSessions(new Map());
      
      console.log(`✅ All ${sessionCount} OAuth sessions cleared from persistent file`);
      console.log(`📁 Session file: ${JiraOAuthManager.SESSION_FILE}`);
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
    console.log('📊 Active sessions:', this.getStoredSessions().size);
    
    return { authUrl, state };
  }
  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code: string, state: string): Promise<TokenResponse> {
    console.log('🔄 Starting token exchange...');
    console.log('🔍 Looking for session with state:', state);
    console.log('📊 Available sessions:', Array.from(this.getStoredSessions().keys()));
    
    const session = this.getSession(state);
    if (!session) {
      console.error('❌ OAuth session not found for state:', state);
      throw new Error('Invalid or expired OAuth state parameter. Please restart the authentication flow.');
    }

    console.log('✅ OAuth session found');
    
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
          'User-Agent': 'Jira-MCP-Server/6.0.0-FIXED'
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
          'User-Agent': 'Jira-MCP-Server/6.0.0-FIXED'
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
          'User-Agent': 'Jira-MCP-Server/6.0.0-FIXED'
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
          'User-Agent': 'Jira-MCP-Server/6.0.0-FIXED'
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
   * Clean up expired sessions periodically - PERSISTENT FIX
   */
  cleanupExpiredSessions(): void {
    const now = Date.now();
    const sessions = this.getStoredSessions();
    let cleaned = 0;
    
    for (const [state, session] of sessions.entries()) {
      if (now - session.timestamp > this.SESSION_TTL) {
        sessions.delete(state);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      this.saveStoredSessions(sessions);
      console.log('🧹 Cleaned up', cleaned, 'expired OAuth sessions from persistent file');
    }
  }

  /**
   * Get session and OAuth statistics - PERSISTENT FIX
   */
  getStats(): { 
    activeSessions: number; 
    config: Omit<OAuthConfig, 'clientId'>; 
    features: string[];
  } {
    this.cleanupExpiredSessions();
    const sessions = this.getStoredSessions();
    
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
        'Persistent file-based session storage',
        'Cross-process session sharing',
        'Browser-based flow',
        'Automatic session cleanup'
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