/**
 * OAuth2 Client Credentials — ขอ token จาก token endpoint
 * แล้ว cache ไว้จนกว่าจะหมดอายุ (auto refresh)
 *
 * Config:
 *   AUTH_OAUTH2_TOKEN_URL    = URL สำหรับขอ token
 *   AUTH_OAUTH2_CLIENT_ID    = client ID
 *   AUTH_OAUTH2_CLIENT_SECRET = client secret
 *   AUTH_OAUTH2_SCOPE        = scope (optional)
 *   AUTH_OAUTH2_EXTRA_PARAMS = extra body params เป็น JSON (optional)
 */

import { AuthProvider } from './types.js';

export interface OAuth2Config {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scope?: string;
  extraParams?: Record<string, string>;
}

export class OAuth2Provider implements AuthProvider {
  readonly name = 'oauth2';
  private readonly config: OAuth2Config;

  // Token cache
  private accessToken: string | null = null;
  private expiresAt: number = 0; // Unix timestamp ms

  constructor(config: OAuth2Config) {
    this.config = config;
  }

  async getHeaders(): Promise<Record<string, string>> {
    const token = await this.getToken();
    return {
      Authorization: `Bearer ${token}`,
    };
  }

  /**
   * ขอ token ใหม่ถ้าหมดอายุ หรือใช้ cached token
   */
  private async getToken(): Promise<string> {
    // ถ้า token ยังไม่หมดอายุ (เผื่อ 30 วินาที) ใช้ cached
    if (this.accessToken && Date.now() < this.expiresAt - 30_000) {
      return this.accessToken;
    }

    // ขอ token ใหม่
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });

    if (this.config.scope) {
      body.set('scope', this.config.scope);
    }

    // เพิ่ม extra params ถ้ามี
    if (this.config.extraParams) {
      for (const [key, value] of Object.entries(this.config.extraParams)) {
        body.set(key, value);
      }
    }

    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `OAuth2 token request failed (${response.status}): ${text}`,
      );
    }

    const data = (await response.json()) as {
      access_token: string;
      expires_in?: number;
      token_type?: string;
    };

    this.accessToken = data.access_token;
    // ถ้า server บอก expires_in ใช้ค่านั้น, ไม่งั้น default 1 ชั่วโมง
    const expiresInMs = (data.expires_in || 3600) * 1000;
    this.expiresAt = Date.now() + expiresInMs;

    console.log(
      `[oauth2] ✅ Token refreshed, expires in ${data.expires_in || 3600}s`,
    );

    return this.accessToken;
  }
}
