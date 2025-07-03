import { randomBytes, createHash, createCipheriv, createDecipheriv } from 'crypto';

/**
 * Stateless OAuth Manager for Smithery Cross-Container Deployments
 * Encodes session data directly in the OAuth state parameter
 * No cross-container session storage required
 */

export interface OAuthConfig {
  authorizationUrl: string;
  tokenUrl: string;
  clientId: string;
  redirectUri: string;
  scopes: string[];
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

export interface StatelessOAuthSession {
  codeVerifier: string;
  redirectUri: string;
  timestamp: number;
  userEmail?: string;
  companyUrl: string;
}

export class StatelessJiraOAuthManager {
  private config: OAuthConfig;
  private readonly SESSION_TTL = 15 * 60 * 1000; // 15 minutes
  private readonly ENCRYPTION_KEY = this.getEncryptionKey();
  
  constructor(companyUrl: string, customConfig?: Partial<AtlassianOAuthConfig>) {
    const isCloud = companyUrl.includes('.atlassian.net');
    
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

    console.log('🔧 Stateless OAuth Manager initialized for Smithery');
    console.log('🔗 Authorization URL:', this.config.authorizationUrl);
    console.log('🎯 Redirect URI:', this.config.redirectUri);
    console.log('🔄 Mode: Self-contained state (no cross-container storage)');
  }

  private getEncryptionKey(): Buffer {
    // Use a deterministic key based on environment
    const seed = process.env.OAUTH_ENCRYPTION_KEY || 
                 process.env.JIRA_OAUTH_CLIENT_SECRET || 
                 'default-smithery-oauth-key-2024';
    return createHash('sha256').update(seed).digest();
  }

  private getDefaultClientId(companyUrl: string): string {
    if (companyUrl.includes('.atlassian.net')) {
      return process.env.JIRA_OAUTH_CLIENT_ID || 'EiNH97tfyGyZPlaMfrteiKeW2TXWVxFf';
    }
    return process.env.JIRA_OAUTH_CLIENT_ID || 'EiNH97tfyGyZPlaMfrteiKeW2TXWVxFf';
  }

  private getDefaultRedirectUri(): string {
    if (process.env.OAUTH_REDIRECT_URI) {
      return process.env.OAUTH_REDIRECT_URI;
    }
    
    if (process.env.SMITHERY_HOSTNAME) {
      return `https://${process.env.SMITHERY_HOSTNAME}/oauth/callback`;
    }
    
    const serverUrl = process.env.SERVER_URL || process.env.THIS_HOSTNAME || 'http://localhost:3000';
    return `${serverUrl}/oauth/callback`;
  }

  private getDefaultScopes(isCloud: boolean): string[] {
    if (isCloud) {
      return [
        'read:jira-work',
        'read:jira-user', 
        'write:jira-work',
        'offline_access'
      ];
    } else {
      return ['READ', 'WRITE'];
    }
  }

  /**
   * Encrypt session data into a URL-safe string
   */
  private encryptSessionData(sessionData: StatelessOAuthSession): string {
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-cbc', this.ENCRYPTION_KEY, iv);
    
    let encrypted = cipher.update(JSON.stringify(sessionData), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Combine IV and encrypted data, then base64url encode
    const combined = iv.toString('hex') + ':' + encrypted;
    return Buffer.from(combined).toString('base64url');
  }

  /**
   * Decrypt session data from state parameter
   */
  private decryptSessionData(encryptedState: string): StatelessOAuthSession {
    try {
      const combined = Buffer.from(encryptedState, 'base64url').toString('utf8');
      const [ivHex, encrypted] = combined.split(':');
      
      if (!ivHex || !encrypted) {
        throw new Error('Invalid state format');
      }
      
      const iv = Buffer.from(ivHex, 'hex');
      const decipher = createDecipheriv('aes-256-cbc', this.ENCRYPTION_KEY, iv);
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return JSON.parse(decrypted);
    } catch (error) {
      throw new Error(`Failed to decrypt session data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate OAuth authorization URL with self-contained state
   */
  generateAuthUrl(userEmail?: string, companyUrl?: string): { authUrl: string; state: string } {
    console.log('🔗 ============ STATELESS OAUTH URL GENERATION ============');
    console.log(`🔗 Generating self-contained OAuth URL...`);
    console.log(`📧 User email: ${userEmail || 'N/A'}`);
    console.log(`⏰ Generation timestamp: ${new Date().toISOString()}`);
    
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = this.generateCodeChallenge(codeVerifier);
    
    // Create session data to embed in state
    const sessionData: StatelessOAuthSession = {
      codeVerifier,
      redirectUri: this.config.redirectUri,
      timestamp: Date.now(),
      userEmail,
      companyUrl: companyUrl || 'unknown'
    };
    
    // Encrypt session data into state parameter
    const encryptedState = this.encryptSessionData(sessionData);
    
    console.log(`🎲 Generated encrypted state: ${encryptedState.substring(0, 20)}...`);
    console.log(`🔑 Code verifier embedded: ${codeVerifier.substring(0, 10)}...`);
    console.log(`🔐 Code challenge: ${codeChallenge.substring(0, 10)}...`);
    
    // Build authorization parameters
    const params = new URLSearchParams({
      audience: 'api.atlassian.com',
      client_id: this.config.clientId,
      scope: this.config.scopes.join(' '),
      redirect_uri: this.config.redirectUri,
      state: encryptedState,
      response_type: 'code',
      prompt: 'consent',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    });

    if (userEmail) {
      params.append('login_hint', userEmail);
    }

    const authUrl = `${this.config.authorizationUrl}?${params.toString()}`;
    
    console.log('✅ Stateless OAuth URL generated successfully');
    console.log(`📊 State contains all session data (${JSON.stringify(sessionData).length} chars encrypted)`);
    
    return { authUrl, state: encryptedState };
  }

  /**
   * Exchange authorization code for access token using stateless approach
   */
  async exchangeCodeForToken(code: string, encryptedState: string): Promise<TokenResponse> {
    console.log('🔄 ============ STATELESS TOKEN EXCHANGE ============');
    console.log(`🔄 Starting stateless token exchange...`);
    console.log(`📝 Received code: ${code ? `${code.substring(0, 10)}...` : 'MISSING'}`);
    console.log(`🏷️ Received encrypted state: ${encryptedState ? `${encryptedState.substring(0, 20)}...` : 'MISSING'}`);
    console.log(`⏰ Exchange timestamp: ${new Date().toISOString()}`);
    
    // Decrypt session data from state parameter
    let sessionData: StatelessOAuthSession;
    try {
      sessionData = this.decryptSessionData(encryptedState);
      console.log('✅ Session data decrypted successfully');
      console.log(`📧 Session email: ${sessionData.userEmail || 'N/A'}`);
      console.log(`🔗 Session redirect URI: ${sessionData.redirectUri}`);
      console.log(`⏰ Session timestamp: ${new Date(sessionData.timestamp).toISOString()}`);
    } catch (error) {
      console.error('❌ Failed to decrypt session data:', error instanceof Error ? error.message : 'Unknown error');
      throw new Error('Invalid or corrupted OAuth state parameter. Please restart the authentication flow.');
    }
    
    // Check session expiry
    const age = Date.now() - sessionData.timestamp;
    if (age > this.SESSION_TTL) {
      console.error('⏰ OAuth session expired:', Math.floor(age / 1000 / 60), 'minutes old');
      throw new Error('OAuth session expired. Please restart the authentication flow.');
    }
    
    console.log(`✅ Session age: ${Math.floor(age / 1000)} seconds (within TTL)`);

    try {
      console.log('🔄 Exchanging authorization code for access token...');
      
      const tokenRequest = {
        grant_type: 'authorization_code',
        client_id: this.config.clientId,
        code,
        redirect_uri: sessionData.redirectUri,
        code_verifier: sessionData.codeVerifier
      };

      const clientSecret = process.env.JIRA_OAUTH_CLIENT_SECRET || 
                          process.env.OAUTH_CLIENT_SECRET || 
                          'ATOAuTXLEA7CfAwdZKovQ3VfShkxAZAERKyWdumV6Fu1szzHS27tFH3J1sjhAUDAjdv34221288B';
      if (clientSecret) {
        (tokenRequest as any).client_secret = clientSecret;
      }

      const response = await fetch(this.config.tokenUrl, {
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
      
      const tokenData: TokenResponse = await response.json();
      
      if (!tokenData.access_token) {
        throw new Error('Invalid token response: missing access_token');
      }

      console.log('✅ Stateless token exchange successful');
      console.log('🔑 Token type:', tokenData.token_type);
      console.log('⏰ Expires in:', tokenData.expires_in, 'seconds');
      console.log('🔄 Refresh token available:', !!tokenData.refresh_token);
      
      return tokenData;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Token exchange failed: ${String(error)}`);
    }
  }

  /**
   * Get OAuth configuration
   */
  getConfig(): OAuthConfig {
    return { ...this.config };
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
   * Get stats for debugging
   */
  getStats() {
    return {
      mode: 'stateless',
      activeSessions: 'N/A - stateless operation',
      config: {
        authorizationUrl: this.config.authorizationUrl,
        tokenUrl: this.config.tokenUrl,
        redirectUri: this.config.redirectUri,
        scopes: this.config.scopes
      },
      features: [
        'OAuth 2.1 with PKCE',
        'Stateless operation (no session storage)',
        'Self-contained encrypted state parameters',
        'Cross-container compatible',
        'Smithery deployment optimized'
      ]
    };
  }
}