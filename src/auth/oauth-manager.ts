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
  
  // ✅ SMITHERY FIX: Cross-container session storage with multiple persistence layers
  private static sessionStore = new Map<string, OAuthSession>();
  private static readonly SESSION_FILE = `${tmpdir()}/jira-oauth-sessions.json`;
  private static readonly SMITHERY_SESSION_FILE = '/tmp/smithery-jira-oauth-sessions.json';
  private static readonly PERSISTENT_SESSION_DIR = process.env.HOME ? `${process.env.HOME}/.jira-mcp` : '/tmp';
  private static readonly PERSISTENT_SESSION_FILE = `${JiraOAuthManager.PERSISTENT_SESSION_DIR}/oauth-sessions.json`;
  
  // ✅ SINGLETON FIX: Global manager instances for session sharing
  private static instances = new Map<string, JiraOAuthManager>();
  
  /**
   * Create or get existing OAuth manager instance for the same configuration
   */
  static getInstance(companyUrl: string, customConfig?: Partial<AtlassianOAuthConfig>): JiraOAuthManager {
    const configKey = `${companyUrl}:${customConfig?.clientId || 'default'}`;
    
    if (!JiraOAuthManager.instances.has(configKey)) {
      console.log(`🔧 Creating new OAuth manager instance for: ${configKey}`);
      JiraOAuthManager.instances.set(configKey, new JiraOAuthManager(companyUrl, customConfig));
    } else {
      console.log(`♻️ Reusing existing OAuth manager instance for: ${configKey}`);
    }
    
    return JiraOAuthManager.instances.get(configKey)!;
  }

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

    console.log('🔧 OAuth Manager initialized (HYBRID STORAGE MODE)');
    console.log('🔗 Authorization URL:', this.config.authorizationUrl);
    console.log('🎯 Redirect URI:', this.config.redirectUri);
    console.log(`📁 Session file: ${JiraOAuthManager.SESSION_FILE}`);
    console.log(`📊 Memory sessions: ${JiraOAuthManager.sessionStore.size}`);
    console.log(`📊 Total sessions: ${this.getStoredSessions().size}`);
    
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
   * ✅ SMITHERY FIX: Multi-location session storage for cross-container persistence
   */
  private getStoredSessions(): Map<string, OAuthSession> {
    console.log('🔍 SMITHERY SESSION LOOKUP: Checking multiple storage locations...');
    
    // Try in-memory store first (same process)
    if (JiraOAuthManager.sessionStore.size > 0) {
      console.log('✅ Found sessions in memory store:', JiraOAuthManager.sessionStore.size);
      return new Map(JiraOAuthManager.sessionStore);
    }

    // Try persistent home directory storage (cross-container)
    try {
      if (existsSync(JiraOAuthManager.PERSISTENT_SESSION_FILE)) {
        const fileContent = readFileSync(JiraOAuthManager.PERSISTENT_SESSION_FILE, 'utf8');
        const sessions = JSON.parse(fileContent) as Record<string, OAuthSession>;
        const sessionMap = new Map<string, OAuthSession>(Object.entries(sessions));
        
        if (sessionMap.size > 0) {
          console.log('✅ Found sessions in persistent storage:', sessionMap.size);
          // Populate in-memory store
          sessionMap.forEach((session, state) => {
            JiraOAuthManager.sessionStore.set(state, session);
          });
          return sessionMap;
        }
      }
    } catch (error) {
      console.log('⚠️ Persistent storage read failed:', (error as Error).message);
    }

    // Try Smithery-specific location
    try {
      if (existsSync(JiraOAuthManager.SMITHERY_SESSION_FILE)) {
        const fileContent = readFileSync(JiraOAuthManager.SMITHERY_SESSION_FILE, 'utf8');
        const sessions = JSON.parse(fileContent) as Record<string, OAuthSession>;
        const sessionMap = new Map<string, OAuthSession>(Object.entries(sessions));
        
        if (sessionMap.size > 0) {
          console.log('✅ Found sessions in Smithery storage:', sessionMap.size);
          // Populate in-memory store
          sessionMap.forEach((session, state) => {
            JiraOAuthManager.sessionStore.set(state, session);
          });
          return sessionMap;
        }
      }
    } catch (error) {
      console.log('⚠️ Smithery storage read failed:', (error as Error).message);
    }

    // Fallback to default tmp storage
    try {
      if (existsSync(JiraOAuthManager.SESSION_FILE)) {
        const fileContent = readFileSync(JiraOAuthManager.SESSION_FILE, 'utf8');
        const sessions = JSON.parse(fileContent) as Record<string, OAuthSession>;
        const sessionMap = new Map<string, OAuthSession>(Object.entries(sessions));
        
        if (sessionMap.size > 0) {
          console.log('✅ Found sessions in tmp storage:', sessionMap.size);
          // Populate in-memory store
          sessionMap.forEach((session, state) => {
            JiraOAuthManager.sessionStore.set(state, session);
          });
          return sessionMap;
        }
      }
    } catch (error) {
      console.log('⚠️ Tmp storage read failed:', (error as Error).message);
    }

    console.log('❌ No sessions found in any storage location');
    return new Map();
  }

  private saveStoredSessions(sessions: Map<string, OAuthSession>): void {
    console.log('💾 SMITHERY SESSION SAVE: Writing to multiple locations...');
    
    // Save to in-memory store first
    JiraOAuthManager.sessionStore.clear();
    sessions.forEach((session, state) => {
      JiraOAuthManager.sessionStore.set(state, session);
    });
    console.log('✅ Saved to memory store:', sessions.size, 'sessions');
    
    const sessionObj = Object.fromEntries(sessions.entries());
    const sessionData = JSON.stringify(sessionObj, null, 2);
    let saveCount = 0;
    
    // Try to save to persistent home directory (best for cross-container)
    try {
      // Ensure directory exists
      if (!existsSync(JiraOAuthManager.PERSISTENT_SESSION_DIR)) {
        require('fs').mkdirSync(JiraOAuthManager.PERSISTENT_SESSION_DIR, { recursive: true });
      }
      writeFileSync(JiraOAuthManager.PERSISTENT_SESSION_FILE, sessionData, 'utf8');
      console.log('✅ Saved to persistent storage:', JiraOAuthManager.PERSISTENT_SESSION_FILE);
      saveCount++;
    } catch (error) {
      console.log('⚠️ Persistent storage save failed:', (error as Error).message);
    }
    
    // Try to save to Smithery-specific location
    try {
      writeFileSync(JiraOAuthManager.SMITHERY_SESSION_FILE, sessionData, 'utf8');
      console.log('✅ Saved to Smithery storage:', JiraOAuthManager.SMITHERY_SESSION_FILE);
      saveCount++;
    } catch (error) {
      console.log('⚠️ Smithery storage save failed:', (error as Error).message);
    }
    
    // Try to save to default tmp location
    try {
      writeFileSync(JiraOAuthManager.SESSION_FILE, sessionData, 'utf8');
      console.log('✅ Saved to tmp storage:', JiraOAuthManager.SESSION_FILE);
      saveCount++;
    } catch (error) {
      console.log('⚠️ Tmp storage save failed:', (error as Error).message);
    }
    
    console.log(`💾 Sessions saved to ${saveCount} file locations + memory`);
  }

  /**
   * ✅ PRODUCTION FIX: Hybrid session storage across all instances
   */
  private storeSession(state: string, session: OAuthSession): void {
    console.log(`💾 ============ SESSION STORAGE DEBUG ============`);
    console.log(`💾 Storing session: ${state}`);
    console.log(`📧 Session email: ${session.userEmail || 'N/A'}`);
    console.log(`🔗 Session redirect URI: ${session.redirectUri}`);
    console.log(`⏰ Session timestamp: ${new Date(session.timestamp).toISOString()}`);
    
    let storageResults = {
      memory: false,
      environment: false,
      global: false,
      file: false
    };
    
    // Store directly in memory
    try {
      JiraOAuthManager.sessionStore.set(state, session);
      storageResults.memory = true;
      console.log(`✅ Stored in memory (size: ${JiraOAuthManager.sessionStore.size})`);
    } catch (error) {
      console.error(`❌ Memory storage failed:`, error);
    }
    
    // Store in environment variables
    try {
      process.env[`OAUTH_SESSION_${state}`] = JSON.stringify(session);
      storageResults.environment = true;
      console.log(`✅ Stored in environment variables`);
    } catch (error) {
      console.error(`❌ Environment storage failed:`, error);
    }
    
    // Store in global storage
    try {
      if (!(globalThis as any).oauthSessions) {
        (globalThis as any).oauthSessions = new Map();
      }
      (globalThis as any).oauthSessions.set(state, session);
      storageResults.global = true;
      console.log(`✅ Stored in global storage (size: ${(globalThis as any).oauthSessions.size})`);
    } catch (error) {
      console.error(`❌ Global storage failed:`, error);
    }
    
    // Also update file-based storage
    try {
      const sessions = this.getStoredSessions();
      sessions.set(state, session);
      this.saveStoredSessions(sessions);
      storageResults.file = true;
      console.log(`✅ Stored in file storage`);
    } catch (error) {
      console.error(`❌ File storage failed:`, error);
    }
    
    const successCount = Object.values(storageResults).filter(Boolean).length;
    console.log(`📊 Session stored in ${successCount}/4 storage methods`);
    console.log(`💾 Storage results:`, storageResults);
    console.log(`💾 ============ SESSION STORAGE COMPLETE ============`);
    
    // Auto-cleanup after TTL
    setTimeout(() => {
      console.log(`🧹 Auto-cleaning expired session: ${state}`);
      JiraOAuthManager.sessionStore.delete(state);
      
      try {
        delete process.env[`OAUTH_SESSION_${state}`];
      } catch (error) {
        console.warn('⚠️ Environment cleanup failed:', error);
      }
      
      try {
        if ((globalThis as any).oauthSessions) {
          (globalThis as any).oauthSessions.delete(state);
        }
      } catch (error) {
        console.warn('⚠️ Global cleanup failed:', error);
      }
      
      const currentSessions = this.getStoredSessions();
      if (currentSessions.has(state)) {
        currentSessions.delete(state);
        this.saveStoredSessions(currentSessions);
      }
    }, this.SESSION_TTL);
  }

  /**
   * ✅ PRODUCTION FIX: Multi-source session lookup for Smithery compatibility
   */
  private getSession(state: string): OAuthSession | undefined {
    console.log(`🔍 Multi-source session lookup for state: ${state}`);
    
    // Method 1: Check in-memory store
    let session = JiraOAuthManager.sessionStore.get(state);
    if (session) {
      console.log(`✅ Found session in memory store`);
      return session;
    }
    
    // Method 2: Check environment variables (for same-process)
    try {
      const envKey = `OAUTH_SESSION_${state}`;
      const envData = process.env[envKey];
      if (envData) {
        session = JSON.parse(envData) as OAuthSession;
        console.log(`✅ Found session in environment variables`);
        return session;
      }
    } catch (error) {
      console.log(`⚠️ Failed to parse env session data:`, error);
    }
    
    // Method 3: Check global storage
    try {
      if ((globalThis as any).oauthSessions) {
        session = (globalThis as any).oauthSessions.get(state);
        if (session) {
          console.log(`✅ Found session in global storage`);
          return session;
        }
      }
    } catch (error) {
      console.log(`⚠️ Failed to access global storage:`, error);
    }
    
    // Method 4: Fallback to file-based storage
    try {
      const sessions = this.getStoredSessions();
      session = sessions.get(state);
      if (session) {
        console.log(`✅ Found session in file storage`);
        return session;
      }
    } catch (error) {
      console.log(`⚠️ Failed to access file storage:`, error);
    }
    
    // Debug information for Smithery troubleshooting
    console.log(`❌ SMITHERY SESSION LOOKUP FAILED`);
    console.log(`📊 Memory sessions: ${JiraOAuthManager.sessionStore.size}`);
    console.log(`🌍 Global sessions: ${(globalThis as any).oauthSessions?.size || 0}`);
    console.log(`📁 Persistent file: ${JiraOAuthManager.PERSISTENT_SESSION_FILE} (exists: ${existsSync(JiraOAuthManager.PERSISTENT_SESSION_FILE)})`);
    console.log(`📁 Smithery file: ${JiraOAuthManager.SMITHERY_SESSION_FILE} (exists: ${existsSync(JiraOAuthManager.SMITHERY_SESSION_FILE)})`);
    console.log(`📁 Tmp file: ${JiraOAuthManager.SESSION_FILE} (exists: ${existsSync(JiraOAuthManager.SESSION_FILE)})`);
    
    const memoryStates = Array.from(JiraOAuthManager.sessionStore.keys());
    console.log(`🗝️ Available memory states: [${memoryStates.join(', ')}]`);
    
    // Check environment variables for debugging
    const envSessions = Object.keys(process.env).filter(key => key.startsWith('OAUTH_SESSION_'));
    console.log(`🔑 Environment sessions: [${envSessions.map(key => key.replace('OAUTH_SESSION_', '')).join(', ')}]`);
    
    // Additional Smithery debugging
    console.log(`🌍 Process PID: ${process.pid}`);
    console.log(`🌍 Working dir: ${process.cwd()}`);
    console.log(`🌍 Home dir: ${process.env.HOME || 'not set'}`);
    console.log(`🌍 Tmp dir: ${require('os').tmpdir()}`);
    console.log(`🌍 Smithery hostname: ${process.env.SMITHERY_HOSTNAME || 'not set'}`);
    console.log(`🌍 Container isolation suspected: different containers for MCP vs HTTP server`);
    
    return undefined;
  }

  /**
   * ✅ PRODUCTION FIX: Hybrid session deletion across all instances
   */
  private deleteSession(state: string): void {
    // Delete from memory first
    const memoryDeleted = JiraOAuthManager.sessionStore.delete(state);
    
    // Delete from file storage
    const sessions = this.getStoredSessions();
    const fileDeleted = sessions.delete(state);
    this.saveStoredSessions(sessions);
    
    console.log(`🗑️ Deleted session ${state}: Memory=${memoryDeleted ? 'SUCCESS' : 'NOT FOUND'}, File=${fileDeleted ? 'SUCCESS' : 'NOT FOUND'}`);
  }

  /**
   * Clear all OAuth sessions (for debugging) - PRODUCTION FIX
   */
  clearAllSessions(): void {
    try {
      const memoryCount = JiraOAuthManager.sessionStore.size;
      const totalCount = this.getStoredSessions().size;
      
      // Clear memory store
      JiraOAuthManager.sessionStore.clear();
      
      // Clear file store
      this.saveStoredSessions(new Map());
      
      console.log(`✅ All OAuth sessions cleared - Memory: ${memoryCount}, Total: ${totalCount}`);
      console.log(`📁 Session file: ${JiraOAuthManager.SESSION_FILE}`);
    } catch (error) {
      console.error('❌ Failed to clear sessions:', (error as Error).message);
    }
  }

  /**
   * Get OAuth configuration
   */
  getConfig(): OAuthConfig {
    return { ...this.config };
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
    console.log('🔗 ============ OAUTH URL GENERATION DEBUG START ============');
    console.log(`🔗 Generating OAuth URL...`);
    console.log(`📧 User email: ${userEmail || 'N/A'}`);
    console.log(`⏰ Generation timestamp: ${new Date().toISOString()}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📍 Process PID: ${process.pid}`);
    
    const state = this.generateSecureRandom(32);
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = this.generateCodeChallenge(codeVerifier);
    
    console.log(`🎲 Generated state: ${state}`);
    console.log(`🔑 Generated code verifier: ${codeVerifier.substring(0, 10)}...`);
    console.log(`🔐 Generated code challenge: ${codeChallenge.substring(0, 10)}...`);
    
    // Store session for later verification
    const sessionData = {
      state,
      codeVerifier,
      redirectUri: this.config.redirectUri,
      timestamp: Date.now(),
      userEmail
    };
    
    console.log('💾 Storing session data...');
    this.storeSession(state, sessionData);

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
    console.log('🔄 ============ TOKEN EXCHANGE DEBUG START ============');
    console.log(`🔄 Starting token exchange...`);
    console.log(`📝 Received code: ${code ? `${code.substring(0, 10)}...` : 'MISSING'}`);
    console.log(`🏷️ Received state: ${state}`);
    console.log(`⏰ Exchange timestamp: ${new Date().toISOString()}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📍 Process PID: ${process.pid}`);
    
    // Debug: Check all possible session sources before lookup
    console.log('📊 PRE-LOOKUP SESSION INVENTORY:');
    console.log(`  Memory store size: ${JiraOAuthManager.sessionStore.size}`);
    console.log(`  Memory states: [${Array.from(JiraOAuthManager.sessionStore.keys()).join(', ')}]`);
    
    const envSessions = Object.keys(process.env).filter(key => key.startsWith('OAUTH_SESSION_'));
    console.log(`  Environment sessions: ${envSessions.length}`);
    console.log(`  Environment states: [${envSessions.map(key => key.replace('OAUTH_SESSION_', '')).join(', ')}]`);
    
    const globalSessions = (globalThis as any).oauthSessions;
    console.log(`  Global sessions: ${globalSessions ? globalSessions.size : 0}`);
    if (globalSessions) {
      console.log(`  Global states: [${Array.from(globalSessions.keys()).join(', ')}]`);
    }
    
    console.log('🔍 Now performing session lookup...');
    const session = this.getSession(state);
    
    if (!session) {
      console.error('❌ ============ OAUTH SESSION NOT FOUND ============');
      console.error(`❌ Failed to find session for state: "${state}"`);
      console.error(`❌ Searched in ${JiraOAuthManager.sessionStore.size} memory sessions`);
      console.error(`❌ Searched in ${envSessions.length} environment sessions`);
      console.error(`❌ Searched in ${globalSessions ? globalSessions.size : 0} global sessions`);
      console.error(`❌ This indicates a critical session persistence issue in the deployment`);
      console.error('❌ ================================================');
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