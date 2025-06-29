/**
 * Extended OAuth Proxy Provider for Jira MCP Server
 * Delegates OAuth to external providers (Auth0, WorkOS, etc.)
 */

import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import { InvalidTokenError, ServerError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { AuthorizationParams } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import { 
  ProxyOAuthServerProvider, 
  type ProxyOptions 
} from '@modelcontextprotocol/sdk/server/auth/providers/proxyProvider.js';
import {
  type OAuthClientInformationFull,
  OAuthClientInformationFullSchema,
  type OAuthTokens,
  OAuthTokensSchema,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import type { Response } from 'express';
import { createLogger } from './logger.js';
import type { OAuthProxyStorageManager } from './storage/types.js';

const logger = createLogger('OAuthProvider');

export interface ExtendedOAuthTokens extends OAuthTokens {
  id_token?: string;
}

export interface ExtendedProxyOptions extends Omit<ProxyOptions, 'getClient' | 'verifyAccessToken'> {
  storageManager: OAuthProxyStorageManager;
}

/**
 * Extended OAuth Provider that delegates to external OAuth servers
 * and manages token storage and client registration
 */
export class ExtendedProxyOAuthServerProvider extends ProxyOAuthServerProvider {
  public readonly storageManager: OAuthProxyStorageManager;

  constructor(options: ExtendedProxyOptions) {
    super({
      ...options,
      getClient: options.storageManager.getClient,
      verifyAccessToken: async (locallyIssuedAccessToken: string) => {
        const data = await options.storageManager.getAccessToken(locallyIssuedAccessToken);
        
        if (!data) {
          logger.debug(`Invalid access token: ${locallyIssuedAccessToken}`);
          throw new InvalidTokenError('Invalid access token');
        }

        logger.debug(`Validated token for client: ${data.clientId}`);
        return {
          token: locallyIssuedAccessToken,
          scopes: data.scopes,
          clientId: data.clientId,
          expiresInSeconds: data.expiresInSeconds,
        };
      },
    });

    this.storageManager = options.storageManager;
    logger.info('OAuth provider initialized with external delegation');
  }

  public override get clientsStore(): OAuthRegisteredClientsStore {
    const registrationUrl = this._endpoints.registrationUrl;
    
    return {
      getClient: this.storageManager.getClient,
      
      ...(registrationUrl && {
        registerClient: async (client: OAuthClientInformationFull) => {
          logger.debug('Registering new client with upstream provider');
          
          try {
            const response = await fetch(registrationUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
              },
              body: JSON.stringify(client),
            });

            if (!response.ok) {
              const errorText = await response.text();
              logger.error(`Client registration failed: ${response.status} - ${errorText}`);
              throw new ServerError(`Client registration failed: ${response.status}`);
            }

            const data = await response.json();
            const parsedClient = OAuthClientInformationFullSchema.parse(data);
            
            // Store the registered client locally
            await this.storageManager.saveClient(parsedClient.client_id, parsedClient);
            
            logger.info(`Successfully registered client: ${parsedClient.client_id}`);
            return parsedClient;
          } catch (error) {
            logger.error('Client registration error:', error);
            throw error instanceof ServerError ? error : new ServerError(`Registration failed: ${error}`);
          }
        },
      }),
    };
  }

  /**
   * Exchange authorization code for tokens at upstream provider
   */
  public override async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    codeVerifier?: string,
  ): Promise<OAuthTokens> {
    const redirectUri = client.redirect_uris[0];
    
    if (!redirectUri) {
      logger.error(`No redirect URI found for client: ${client.client_id}`);
      throw new ServerError('No redirect URI found for client');
    }

    logger.debug(`Exchanging authorization code for client: ${client.client_id}`);

    try {
      const params = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: client.client_id,
        redirect_uri: redirectUri,
        code: authorizationCode,
      });

      if (client.client_secret) {
        params.append('client_secret', client.client_secret);
      }

      if (codeVerifier) {
        params.append('code_verifier', codeVerifier);
      }

      const response = await fetch(this._endpoints.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
          'User-Agent': 'Jira-MCP-Server/5.0.0',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`Token exchange failed: ${response.status} - ${errorText}`);
        throw new ServerError(`Token exchange failed: ${response.status}`);
      }

      const tokenData = await response.json() as ExtendedOAuthTokens;
      
      if (!tokenData.access_token) {
        throw new ServerError('Invalid token response: missing access_token');
      }

      // Store the upstream tokens and issue our own local token
      const locallyIssuedAccessToken = await this.storageManager.saveAccessToken(
        {
          accessToken: tokenData.access_token,
          idToken: tokenData.id_token,
          refreshToken: tokenData.refresh_token,
          clientId: client.client_id,
          scope: tokenData.scope ?? '',
        },
        tokenData.expires_in ?? 3600 // Default to 1 hour
      );

      logger.info(`Token exchange successful for client: ${client.client_id}`);
      
      // Return our locally-issued token to the client
      return OAuthTokensSchema.parse({
        ...tokenData,
        access_token: locallyIssuedAccessToken,
      });
    } catch (error) {
      logger.error('Token exchange error:', error);
      throw error instanceof ServerError ? error : new ServerError(`Token exchange failed: ${error}`);
    }
  }

  /**
   * Handle authorization flow - redirect to upstream provider
   */
  public override async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    logger.debug(`Starting authorization for client: ${client.client_id}`);

    try {
      const targetUrl = new URL(this._endpoints.authorizationUrl);
      const searchParams = new URLSearchParams({
        client_id: client.client_id,
        response_type: 'code',
        redirect_uri: params.redirectUri,
        code_challenge: params.codeChallenge,
        code_challenge_method: 'S256',
      });

      if (params.state) {
        searchParams.set('state', params.state);
      }

      // Set scopes, with sensible defaults for Jira
      const scopes = params.scopes?.length 
        ? params.scopes.join(' ')
        : 'email profile openid';
      searchParams.set('scope', scopes);

      targetUrl.search = searchParams.toString();
      
      logger.debug(`Redirecting to authorization URL: ${targetUrl.toString()}`);
      res.redirect(targetUrl.toString());
    } catch (error) {
      logger.error('Authorization error:', error);
      throw new ServerError(`Authorization failed: ${error}`);
    }
  }

  /**
   * Get OAuth metadata for discovery
   */
  public getMetadata() {
    return {
      issuer: this._endpoints.authorizationUrl.replace(/\/authorize$/, ''),
      authorization_endpoint: this._endpoints.authorizationUrl,
      token_endpoint: this._endpoints.tokenUrl,
      registration_endpoint: this._endpoints.registrationUrl,
      revocation_endpoint: this._endpoints.revocationUrl,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: ['email', 'profile', 'openid'],
      token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
    };
  }
}