/**
 * Auth Module — Factory สำหรับสร้าง AuthProvider ตาม config
 */

export type { AuthProvider, AuthMode } from './types.js';
export { NoAuthProvider } from './no-auth.js';
export { ApiKeyProvider } from './api-key.js';
export type { ApiKeyConfig } from './api-key.js';
export { OAuth2Provider } from './oauth2.js';
export type { OAuth2Config } from './oauth2.js';
export { CustomTokenProvider } from './custom-token.js';
export type { CustomTokenConfig } from './custom-token.js';

import { AuthProvider, AuthMode } from './types.js';
import { NoAuthProvider } from './no-auth.js';
import { ApiKeyProvider } from './api-key.js';
import { OAuth2Provider } from './oauth2.js';
import { CustomTokenProvider } from './custom-token.js';

export interface AuthConfig {
  mode: AuthMode;

  // API Key
  apiKeyHeader?: string;
  apiKeyValue?: string;

  // OAuth2
  oauth2TokenUrl?: string;
  oauth2ClientId?: string;
  oauth2ClientSecret?: string;
  oauth2Scope?: string;
  oauth2ExtraParams?: Record<string, string>;

  // Custom Token
  customTokenUrl?: string;
  customTokenBody?: Record<string, unknown>;
  customTokenField?: string;
  customTokenHeader?: string;
  customTokenPrefix?: string;
  customTokenExpiresIn?: number;
}

/**
 * สร้าง AuthProvider ตาม AuthConfig
 * Validate ว่า config ครบตาม mode ที่เลือก
 */
export function createAuthProvider(config: AuthConfig): AuthProvider {
  switch (config.mode) {
    case 'none':
      return new NoAuthProvider();

    case 'api-key':
      if (!config.apiKeyValue) {
        throw new Error('AUTH_API_KEY_VALUE is required when AUTH_MODE=api-key');
      }
      return new ApiKeyProvider({
        headerName: config.apiKeyHeader || 'X-API-Key',
        apiKey: config.apiKeyValue,
      });

    case 'oauth2':
      if (!config.oauth2TokenUrl || !config.oauth2ClientId || !config.oauth2ClientSecret) {
        throw new Error(
          'AUTH_OAUTH2_TOKEN_URL, AUTH_OAUTH2_CLIENT_ID, AUTH_OAUTH2_CLIENT_SECRET are required when AUTH_MODE=oauth2',
        );
      }
      return new OAuth2Provider({
        tokenUrl: config.oauth2TokenUrl,
        clientId: config.oauth2ClientId,
        clientSecret: config.oauth2ClientSecret,
        scope: config.oauth2Scope,
        extraParams: config.oauth2ExtraParams,
      });

    case 'custom-token':
      if (!config.customTokenUrl || !config.customTokenBody) {
        throw new Error(
          'AUTH_CUSTOM_TOKEN_URL and AUTH_CUSTOM_TOKEN_BODY are required when AUTH_MODE=custom-token',
        );
      }
      return new CustomTokenProvider({
        tokenUrl: config.customTokenUrl,
        body: config.customTokenBody,
        tokenField: config.customTokenField || 'token',
        headerName: config.customTokenHeader || 'Authorization',
        tokenPrefix: config.customTokenPrefix || 'Bearer ',
        expiresInSeconds: config.customTokenExpiresIn || 3600,
      });

    default:
      throw new Error(`Unknown AUTH_MODE: ${config.mode}`);
  }
}
