import { randomBytes, createHash } from 'crypto';

/**
 * Modern MCP OAuth 2.1 Manager
 * Implements RFC 9728 (Protected Resource Metadata) + PKCE
 * Based on June 2025 MCP spec updates
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
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

export class JiraOAuthManager {
  private config: OAuthConfig;
  private sessions = new Map<string, OAuthSession>();
  private readonly SESSION_TTL = 10 * 60 * 1000; // 10 minutes

  constructor(companyUrl: string) {
    // Use Atlassian's standard OAuth endpoints
    this.config = {
      authorizationUrl: `${companyUrl}/plugins/servlet/oauth2/authorize`,
      tokenUrl: `${companyUrl}/plugins/servlet/oauth2/token`,
      clientId: process.env.JIRA_OAUTH_CLIENT_ID || 'jira-mcp-client',
      redirectUri: process.env.OAUTH_REDIRECT_URI || `${process.env.SERVER_URL || 'http://localhost:3000'}/oauth/callback`,
      scopes: ['read:jira-work', 'write:jira-work', 'read:jira-user', 'offline_access']
    };
  }

  /**
   * Get Protected Resource Metadata (RFC 9728)
   * Enables MCP clients to discover OAuth configuration
   */
  getResourceMetadata() {
    return {
      resource: process.env.SERVER_URL || 'http://localhost:3000',
      authorization_servers: [this.config.authorizationUrl.replace('/authorize', '')],
      scopes_supported: this.config.scopes,
      bearer_methods_supported: ['header'],
      resource_documentation: 'https://github.com/your-org/jira-mcp-mvp',
      oauth_discovery: {
        issuer: this.config.authorizationUrl.replace('/plugins/servlet/oauth2/authorize', ''),
        authorization_endpoint: this.config.authorizationUrl,
        token_endpoint: this.config.tokenUrl,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
        scopes_supported: this.config.scopes
      }
    };
  }

  /**
   * Generate OAuth authorization URL with PKCE
   * PKCE is mandatory per MCP OAuth 2.1 spec
   */
  generateAuthUrl(userEmail?: string): { authUrl: string; state: string } {
    const state = this.generateSecureRandom(32);
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = this.generateCodeChallenge(codeVerifier);
    
    // Store session for later verification
    this.sessions.set(state, {
      state,
      codeVerifier,
      redirectUri: this.config.redirectUri,
      timestamp: Date.now()
    });

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: this.config.scopes.join(' '),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      // Pre-fill email if provided
      ...(userEmail && { login_hint: userEmail })
    });

    const authUrl = `${this.config.authorizationUrl}?${params.toString()}`;
    
    return { authUrl, state };
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code: string, state: string): Promise<TokenResponse> {
    const session = this.sessions.get(state);
    if (!session) {
      throw new Error('Invalid or expired OAuth state parameter');
    }

    // Check session expiry
    if (Date.now() - session.timestamp > this.SESSION_TTL) {
      this.sessions.delete(state);
      throw new Error('OAuth session expired. Please try again.');
    }

    try {
      const response = await fetch(this.config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: this.config.clientId,
          code,
          redirect_uri: session.redirectUri,
          code_verifier: session.codeVerifier
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OAuth token exchange failed (${response.status}): ${errorText}`);
      }

      const tokenData: TokenResponse = await response.json();
      
      // Clean up session
      this.sessions.delete(state);
      
      return tokenData;
    } catch (error) {
      // Clean up session on error
      this.sessions.delete(state);
      throw error;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken: string): Promise<TokenResponse> {
    try {
      const response = await fetch(this.config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: this.config.clientId,
          refresh_token: refreshToken
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Token refresh failed (${response.status}): ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      throw new Error(`Failed to refresh token: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate that an access token is still valid
   */
  async validateToken(accessToken: string, baseUrl: string): Promise<boolean> {
    try {
      const response = await fetch(`${baseUrl}/rest/api/3/myself`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });

      return response.ok;
    } catch {
      return false;
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
   * Clean up expired sessions
   */
  cleanupExpiredSessions(): void {
    const now = Date.now();
    for (const [state, session] of this.sessions.entries()) {
      if (now - session.timestamp > this.SESSION_TTL) {
        this.sessions.delete(state);
      }
    }
  }

  /**
   * Get session statistics
   */
  getSessionStats(): { activeSessions: number; totalSessions: number } {
    this.cleanupExpiredSessions();
    return {
      activeSessions: this.sessions.size,
      totalSessions: this.sessions.size // Would track total in production
    };
  }
}
