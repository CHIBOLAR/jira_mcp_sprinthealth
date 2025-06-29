/**
 * Redis storage implementation for OAuth data
 * Production-ready with persistence and clustering support
 */

import Redis from 'ioredis';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import { createLogger } from '../logger.js';
import { StorageError } from '../errors.js';
import type { OAuthProxyStorageManager, StoredAccessToken, TokenValidationData } from './types.js';

const logger = createLogger('RedisStorage');

export class RedisStorage implements OAuthProxyStorageManager {
  private redis: Redis;
  private readonly keyPrefix = 'jira:mcp:oauth:';

  constructor() {
    const redisUrl = process.env.REDIS_DSN || 'redis://127.0.0.1:6379';
    
    this.redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    this.redis.on('connect', () => {
      logger.info('Connected to Redis');
    });

    this.redis.on('error', (error) => {
      logger.error('Redis error:', error);
    });

    this.redis.on('close', () => {
      logger.warn('Redis connection closed');
    });
  }

  private getClientKey(clientId: string): string {
    return `${this.keyPrefix}client:${clientId}`;
  }

  private getTokenKey(token: string): string {
    return `${this.keyPrefix}token:${token}`;
  }

  async saveClient(clientId: string, client: OAuthClientInformationFull): Promise<void> {
    try {
      const key = this.getClientKey(clientId);
      await this.redis.set(key, JSON.stringify(client));
      logger.debug(`Saved client to Redis: ${clientId}`);
    } catch (error) {
      logger.error('Failed to save client to Redis:', error);
      throw new StorageError(`Failed to save client: ${error}`);
    }
  }

  async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    try {
      const key = this.getClientKey(clientId);
      const data = await this.redis.get(key);
      
      if (!data) {
        logger.debug(`Client not found in Redis: ${clientId}`);
        return undefined;
      }

      const client = JSON.parse(data) as OAuthClientInformationFull;
      logger.debug(`Retrieved client from Redis: ${clientId}`);
      return client;
    } catch (error) {
      logger.error('Failed to get client from Redis:', error);
      throw new StorageError(`Failed to get client: ${error}`);
    }
  }

  async saveAccessToken(
    tokenData: StoredAccessToken,
    expiresInSeconds: number
  ): Promise<string> {
    try {
      // Generate a locally-issued token
      const localToken = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const key = this.getTokenKey(localToken);
      
      const tokenRecord = {
        ...tokenData,
        expiresAt: Date.now() + (expiresInSeconds * 1000),
        issuedAt: Date.now()
      };

      // Store with Redis expiration
      await this.redis.setex(key, expiresInSeconds, JSON.stringify(tokenRecord));
      
      logger.debug(`Saved access token to Redis with ${expiresInSeconds}s expiry for client: ${tokenData.clientId}`);
      return localToken;
    } catch (error) {
      logger.error('Failed to save access token to Redis:', error);
      throw new StorageError(`Failed to save access token: ${error}`);
    }
  }

  async getAccessToken(locallyIssuedToken: string): Promise<TokenValidationData | undefined> {
    try {
      const key = this.getTokenKey(locallyIssuedToken);
      const data = await this.redis.get(key);
      
      if (!data) {
        logger.debug(`Token not found in Redis: ${locallyIssuedToken}`);
        return undefined;
      }

      const tokenData = JSON.parse(data) as StoredAccessToken & { expiresAt: number };
      
      // Double-check expiration (Redis should handle this, but be safe)
      if (Date.now() > tokenData.expiresAt) {
        logger.debug(`Token expired in Redis: ${locallyIssuedToken}`);
        await this.redis.del(key);
        return undefined;
      }

      const expiresInSeconds = Math.max(0, Math.floor((tokenData.expiresAt - Date.now()) / 1000));
      
      return {
        scopes: tokenData.scope.split(' ').filter(s => s.length > 0),
        clientId: tokenData.clientId,
        expiresInSeconds
      };
    } catch (error) {
      logger.error('Failed to get access token from Redis:', error);
      throw new StorageError(`Failed to get access token: ${error}`);
    }
  }

  async deleteAccessToken(locallyIssuedToken: string): Promise<void> {
    try {
      const key = this.getTokenKey(locallyIssuedToken);
      const deleted = await this.redis.del(key);
      logger.debug(`Deleted token from Redis: ${locallyIssuedToken} - ${deleted ? 'success' : 'not found'}`);
    } catch (error) {
      logger.error('Failed to delete access token from Redis:', error);
      throw new StorageError(`Failed to delete access token: ${error}`);
    }
  }

  async cleanup(): Promise<void> {
    // Redis handles expiration automatically, but we can clean up any orphaned keys
    try {
      const pattern = `${this.keyPrefix}token:*`;
      const keys = await this.redis.keys(pattern);
      
      if (keys.length === 0) {
        return;
      }

      // Check which keys are expired and remove them
      const pipeline = this.redis.pipeline();
      for (const key of keys) {
        pipeline.get(key);
      }
      
      const results = await pipeline.exec();
      
      if (!results) {
        logger.warn('Pipeline execution returned null results');
        return;
      }
      
      let cleanedCount = 0;

      for (let i = 0; i < results.length; i++) {
        const [error, result] = results[i];
        if (error || !result) continue;

        try {
          const tokenData = JSON.parse(result as string);
          if (Date.now() > tokenData.expiresAt) {
            await this.redis.del(keys[i]);
            cleanedCount++;
          }
        } catch {
          // Invalid JSON, delete the key
          await this.redis.del(keys[i]);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        logger.debug(`Cleaned up ${cleanedCount} expired tokens from Redis`);
      }
    } catch (error) {
      logger.error('Failed to cleanup Redis:', error);
    }
  }

  async close(): Promise<void> {
    try {
      await this.redis.quit();
      logger.info('Redis connection closed');
    } catch (error) {
      logger.error('Failed to close Redis connection:', error);
    }
  }

  // Debug method to get stats
  async getStats() {
    try {
      const clientKeys = await this.redis.keys(`${this.keyPrefix}client:*`);
      const tokenKeys = await this.redis.keys(`${this.keyPrefix}token:*`);
      
      return {
        clients: clientKeys.length,
        tokens: tokenKeys.length,
        type: 'redis',
        connected: this.redis.status === 'ready'
      };
    } catch (error) {
      logger.error('Failed to get Redis stats:', error);
      return {
        clients: 0,
        tokens: 0,
        type: 'redis',
        connected: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}