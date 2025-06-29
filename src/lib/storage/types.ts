/**
 * Storage interfaces and types for OAuth data
 */

import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';

export interface StoredAccessToken {
  accessToken: string;
  idToken?: string;
  refreshToken?: string;
  clientId: string;
  scope: string;
  expiresAt?: number;
}

export interface TokenValidationData {
  scopes: string[];
  clientId: string;
  expiresInSeconds?: number;
}

export interface OAuthProxyStorageManager {
  // Client management
  saveClient(clientId: string, client: OAuthClientInformationFull): Promise<void>;
  getClient(clientId: string): Promise<OAuthClientInformationFull | undefined>;

  // Token management
  saveAccessToken(
    tokenData: StoredAccessToken,
    expiresInSeconds: number
  ): Promise<string>; // Returns locally-issued token
  
  getAccessToken(locallyIssuedToken: string): Promise<TokenValidationData | undefined>;
  
  deleteAccessToken(locallyIssuedToken: string): Promise<void>;

  // Utility methods
  cleanup?(): Promise<void>;
  close?(): Promise<void>;
}