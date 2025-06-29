/**
 * In-memory storage implementation for OAuth data
 * NOTE: Only suitable for development/testing!
 */

import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import { createLogger } from '../logger.js';
import type { OAuthProxyStorageManager, StoredAccessToken, TokenValidationData } from './types.js';

const logger = createLogger('InMemoryStorage');

export class InMemoryStorage implements OAuthProxyStorageManager {
  private clients = new Map<string, OAuthClientInformationFull>();
  private tokens = new Map<string, StoredAccessToken & { expiresAt: number }>();
  private cleanupInterval?: NodeJS.Timeout;

  constructor() {
    // Start cleanup timer for expired tokens
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000); // Clean up every minute

    logger.warn('Using in-memory storage - data will be lost on restart!');
  }

  async saveClient(clientId: string, client: OAuthClientInformationFull): Promise<void> {
    logger.debug(`Saving client: ${clientId}`);
    this.clients.set(clientId, client);
  }

  async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    const client = this.clients.get(clientId) || undefined;
    logger.debug(`Retrieved client: ${clientId} - ${client ? 'found' : 'not found'}`);
    return client;
  }

  async saveAccessToken(
    tokenData: StoredAccessToken,
    expiresInSeconds: number
  ): Promise<string> {
    // Generate a locally-issued token (not the upstream token)
    const localToken = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const expiresAt = Date.now() + (expiresInSeconds * 1000);

    this.tokens.set(localToken, {
      ...tokenData,
      expiresAt
    });

    logger.debug(`Saved access token with ${expiresInSeconds}s expiry for client: ${tokenData.clientId}`);
    return localToken;
  }

  async getAccessToken(locallyIssuedToken: string): Promise<TokenValidationData | undefined> {
    const tokenData = this.tokens.get(locallyIssuedToken);
    
    if (!tokenData) {
      logger.debug(`Token not found: ${locallyIssuedToken}`);
      return undefined;
    }

    // Check if token is expired
    if (Date.now() > tokenData.expiresAt) {
      logger.debug(`Token expired: ${locallyIssuedToken}`);
      this.tokens.delete(locallyIssuedToken);
      return undefined;
    }

    const expiresInSeconds = Math.max(0, Math.floor((tokenData.expiresAt - Date.now()) / 1000));
    
    return {
      scopes: tokenData.scope.split(' ').filter(s => s.length > 0),
      clientId: tokenData.clientId,
      expiresInSeconds
    };
  }

  async deleteAccessToken(locallyIssuedToken: string): Promise<void> {
    const deleted = this.tokens.delete(locallyIssuedToken);
    logger.debug(`Deleted token: ${locallyIssuedToken} - ${deleted ? 'success' : 'not found'}`);
  }

  async cleanup(): Promise<void> {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [token, data] of this.tokens.entries()) {
      if (now > data.expiresAt) {
        this.tokens.delete(token);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.debug(`Cleaned up ${cleanedCount} expired tokens`);
    }
  }

  async close(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    
    this.clients.clear();
    this.tokens.clear();
    logger.info('In-memory storage closed and cleared');
  }

  // Debug method to get stats
  getStats() {
    return {
      clients: this.clients.size,
      tokens: this.tokens.size,
      type: 'in-memory'
    };
  }
}